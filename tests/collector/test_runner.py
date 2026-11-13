import json
import os
import stat
import tempfile
import time
import unittest

from collector import contract
from collector.net import AuthError, SourceError
from collector.runner import Runner
from collector.sources import Reading, Source
from collector.store import Memory
from kw_helpers import Clock, make_config


class Fake(Source):
    """A source whose fetch does whatever the test sets. Read every poll unless every_s says."""

    def __init__(self, name, section, config, facts=None, events=None, every_s=0):
        super().__init__({"every_s": every_s}, config)
        self.name = name
        self.section = section
        self.facts = facts
        self.events = events or []
        self.fail: BaseException | None = None
        self.delay = 0.0
        self.calls = 0

    def fetch(self, now):
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        if self.fail is not None:
            raise self.fail
        return Reading(dict(self.facts) if self.facts is not None else None)

    def observe(self, reading, memory, now):
        if "seen" not in memory:
            memory["seen"] = True
            return []
        out, self.events = self.events, []
        return out


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.config = make_config(
            {
                "collector": {
                    "output_dir": self.out,
                    "state_dir": self.var,
                    "interval_s": 5,
                    "http_timeout_s": 1.0,
                }
            },
            {"adguard": {"username": "kw", "password": "s3cret-example"}},
        )
        self.clock = Clock()

    def runner(self, sources, memory=None, config=None):
        memory = memory or Memory(self.var)
        return Runner(config or self.config, memory, sources=sources, clock=self.clock)

    def read_state(self):
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def test_writes_a_valid_file_readable_by_others(self):
        wan = Fake("wan", "wan", self.config, {"up": True})
        r = self.runner([wan])
        r.cycle()
        state = self.read_state()
        self.assertEqual(contract.validate(state), [])
        self.assertEqual(state["schema"], 1)
        self.assertEqual(state["interval_s"], 5)
        self.assertEqual(state["facts"]["wan"], {"up": True})
        self.assertIsNone(state["facts"]["host"])  # not configured, so null
        self.assertEqual(set(state["facts"]), set(contract.FACT_SECTIONS))
        self.assertEqual(
            state["sources"]["wan"], {"ok": True, "at": state["generated_at"], "error": ""}
        )
        mode = stat.S_IMODE(os.stat(os.path.join(self.out, "state.json")).st_mode)
        self.assertEqual(mode, 0o644)
        self.assertEqual(sorted(os.listdir(self.out)), ["state.json"])  # no temporary left

    def test_a_failing_source_is_isolated(self):
        good = Fake("wan", "wan", self.config, {"up": True})
        bad = Fake("pi", "pi", self.config, {"up": True})
        bad.fail = SourceError("connection refused")
        boom = Fake("dns", "dns", self.config, {"up": True})
        boom.fail = ZeroDivisionError("x")
        with self.assertLogs("collector", level="ERROR"):
            self.runner([good, bad, boom]).cycle()
        state = self.read_state()
        self.assertEqual(state["facts"]["wan"], {"up": True})
        self.assertIsNone(state["facts"]["pi"])
        self.assertEqual(state["sources"]["pi"]["ok"], False)
        self.assertEqual(state["sources"]["pi"]["error"], "connection refused")
        self.assertEqual(state["sources"]["dns"]["error"], "internal error (ZeroDivisionError)")
        self.assertEqual(contract.validate(state), [])

    def test_a_slow_source_does_not_stall_the_poll(self):
        slow = Fake("wan", "wan", self.config, {"up": True})
        slow.delay = 3
        quick = Fake("pi", "pi", self.config, {"up": True})
        r = self.runner([slow, quick])
        r._deadline_s = lambda: 0.3
        started = time.monotonic()
        r.cycle()
        self.assertLess(time.monotonic() - started, 1)
        state = self.read_state()
        self.assertEqual(state["sources"]["wan"]["error"], "timed out")
        # A hung read must never keep the process alive at exit.
        self.assertTrue(r._inflight["wan"].thread.daemon)
        self.assertEqual(state["facts"]["pi"], {"up": True})
        # Still running at the next poll: it is not started a second time.
        self.clock.advance(5)
        r.cycle()
        self.assertEqual(
            self.read_state()["sources"]["wan"]["error"], "previous read still running"
        )
        self.assertEqual(slow.calls, 1)
        # A read given up on does not hold up later polls.
        r._deadline_s = lambda: 2.0
        started = time.monotonic()
        r.cycle()
        self.assertLess(time.monotonic() - started, 1)

    def test_a_read_that_outlasts_the_poll_carries_on_into_the_next(self):
        # Read every 30 s with polls every 10: the read may take 0.66 of 30 s, not of 10.
        config = self.interval_10()
        wan = Fake("wan", "wan", config, {"up": True}, every_s=30)
        r = self.runner([wan], config=config)
        r.cycle()  # 0 s: the first read
        wan.delay = 0.5
        wan.facts = {"up": False}
        r._deadline_s = lambda: 0.1  # so the limit for this source is 0.3 s
        self.clock.advance(30)
        r.cycle()  # 30 s: the second read has not finished, the first reading stands
        state = self.read_state()
        self.assertEqual(state["facts"]["wan"], {"up": True})
        self.assertEqual(state["sources"]["wan"]["at"], "2026-01-15T21:00:00Z")
        r._deadline_s = lambda: 1.0  # the poll now waits long enough for it
        self.clock.advance(10)
        r.cycle()  # 40 s: it finishes and counts as read at 30 s
        state = self.read_state()
        self.assertEqual(state["facts"]["wan"], {"up": False})
        self.assertEqual(
            state["sources"]["wan"], {"ok": True, "at": "2026-01-15T21:00:30Z", "error": ""}
        )
        self.assertEqual(wan.calls, 2)

    def test_the_first_read_still_running_has_a_status(self):
        slow = Fake("wan", "wan", self.config, {"up": True})
        slow.delay = 0.5
        r = self.runner([slow])
        r._deadline_s = lambda: 0.1
        r._limit_s = lambda source: 5.0
        r.cycle()
        state = self.read_state()
        self.assertEqual(
            state["sources"]["wan"],
            {"ok": False, "at": "2026-01-15T21:00:00Z", "error": "first read still running"},
        )
        self.assertIsNone(state["facts"]["wan"])
        self.assertEqual(contract.validate(state), [])

    # Pace ----------------------------------------------------------------------------------

    def interval_10(self):
        return make_config(
            {"collector": {"output_dir": self.out, "state_dir": self.var, "interval_s": 10}}
        )

    def test_a_slow_paced_source_is_read_once_in_three_polls(self):
        config = self.interval_10()
        ad = Fake("adblock", "adblock", config, {"blocked_today": 1}, every_s=30)
        host = Fake("host", "host", config, {"cpu_pct": 1.0}, every_s=10)
        r = self.runner([ad, host], config=config)
        r.cycle()  # 0 s: both read; the first sight records and raises nothing
        ad.events = [{"type": "ad_blocked", "count": 2, "text": ""}]
        ad.facts = {"blocked_today": 7}
        seen = []
        for _ in range(3):  # 10, 20, 30 s
            self.clock.advance(10)
            r.cycle()
            state = self.read_state()
            seen.append(
                (
                    state["generated_at"][-3:-1],
                    ad.calls,
                    host.calls,
                    state["facts"]["adblock"]["blocked_today"],
                    state["sources"]["adblock"]["at"][-3:-1],
                    [e["seq"] for e in state["events"]],
                )
            )
        self.assertEqual(
            seen,
            [
                # At 10 and 20 s the adblock reading of 0 s stands, keeps its time and raises
                # nothing; the host is read at every poll.
                ("10", 1, 2, 1, "00", []),
                ("20", 1, 3, 1, "00", []),
                # At 30 s it is read again, and only that read is observed.
                ("30", 2, 4, 7, "30", [1]),
            ],
        )

    def test_a_reused_reading_is_not_observed(self):
        config = self.interval_10()
        ad = Fake("adblock", "adblock", config, {"blocked_today": 1}, every_s=30)
        observed = []
        orig = ad.observe
        ad.observe = lambda reading, memory, now: observed.append(now) or orig(reading, memory, now)
        r = self.runner([ad], config=config)
        for _ in range(7):  # 0 .. 60 s
            r.cycle()
            self.clock.advance(10)
        self.assertEqual([t.second for t in observed], [0, 30, 0])
        self.assertEqual(ad.calls, 3)

    def test_a_failed_read_is_retried_at_the_sources_pace(self):
        config = self.interval_10()
        pi = Fake("pi", "pi", config, {"up": True}, every_s=30)
        pi.fail = SourceError("no route")
        r = self.runner([pi], config=config)
        for _ in range(3):  # 0, 10, 20 s
            r.cycle()
            state = self.read_state()
            self.assertEqual(
                state["sources"]["pi"],
                {"ok": False, "at": "2026-01-15T21:00:00Z", "error": "no route"},
            )
            self.assertIsNone(state["facts"]["pi"])
            self.clock.advance(10)
        self.assertEqual(pi.calls, 1)
        pi.fail = None
        r.cycle()  # 30 s
        self.assertEqual(pi.calls, 2)
        self.assertEqual(self.read_state()["facts"]["pi"], {"up": True})

    def test_a_pace_below_the_interval_means_every_poll(self):
        config = self.interval_10()
        ssh = Fake("ssh", "ssh", config, {"count": 0, "sources": []}, every_s=3)
        r = self.runner([ssh], config=config)
        for _ in range(4):
            r.cycle()
            self.clock.advance(10)
        self.assertEqual(ssh.calls, 4)

    def test_a_poll_a_little_early_still_reads_a_source_that_is_due(self):
        config = self.interval_10()
        wan = Fake("wan", "wan", config, {"up": True}, every_s=30)
        r = self.runner([wan], config=config)
        r.cycle()
        self.clock.advance(29.995)
        r.cycle()
        self.assertEqual(wan.calls, 2)

    def test_failed_checks_count_fresh_reads_only(self):
        config = self.interval_10()
        wan = Fake("wan", "wan", config, {"up": False}, every_s=30)
        r = self.runner([wan], config=config)
        raised = []
        for _ in range(4):  # 0, 10, 20, 30 s
            r.cycle()
            raised.append([c["id"] for c in self.read_state()["conditions"]])
            self.clock.advance(10)
        # Two failed checks are the reads at 0 and 30 s, not the polls at 0 and 10 s.
        self.assertEqual(raised, [[], [], [], ["wan_down"]])
        self.assertEqual(wan.calls, 2)

    def test_auth_error_pauses_the_source_and_survives_a_restart(self):
        ad = Fake("adblock", "adblock", self.config, {"blocked_today": 1})
        ad.fail = AuthError("HTTP 401: credentials refused")
        r = self.runner([ad])
        r.cycle()
        self.assertEqual(ad.calls, 1)
        err = self.read_state()["sources"]["adblock"]["error"]
        self.assertIn("HTTP 401", err)
        self.assertIn("paused until 21:20", err)
        for _ in range(3):
            self.clock.advance(300)  # 15 minutes in all
            r.cycle()
        self.assertEqual(ad.calls, 1)
        self.assertIn("paused until 21:20", self.read_state()["sources"]["adblock"]["error"])
        # A restart does not reset the pause.
        r2 = self.runner([ad], Memory(self.var))
        r2.memory.load()
        self.clock.advance(240)  # 19 minutes
        r2.cycle()
        self.assertEqual(ad.calls, 1)
        self.assertFalse(self.read_state()["sources"]["adblock"]["ok"])
        ad.fail = None
        self.clock.advance(61)  # past 20 minutes
        r2.cycle()
        self.assertEqual(ad.calls, 2)
        self.assertTrue(self.read_state()["sources"]["adblock"]["ok"])

    def test_events_get_rising_seq_that_persists(self):
        src = Fake("adblock", "adblock", self.config, {"blocked_today": 5})
        r = self.runner([src])
        r.cycle()  # first start: records, no events
        self.assertEqual(self.read_state()["events"], [])
        src.events = [{"type": "ad_blocked", "count": 3, "text": "ignored"}]
        r.cycle()
        ev = self.read_state()["events"]
        self.assertEqual(
            [(e["seq"], e["type"], e["count"], e["text"]) for e in ev], [(1, "ad_blocked", 3, "")]
        )
        # Restart: seq continues and old events are kept.
        m = Memory(self.var)
        m.load()
        r2 = self.runner([src], m)
        src.events = [{"type": "import", "count": 1, "text": "IMPORTED · " + "x" * 80}]
        r2.cycle()
        ev = self.read_state()["events"]
        self.assertEqual([e["seq"] for e in ev], [1, 2])
        self.assertEqual(len(ev[1]["text"]), 44)
        self.assertTrue(ev[1]["text"].endswith("…"))

    def test_only_the_last_twenty_events_are_kept(self):
        src = Fake(
            "security", "security", self.config, {"threat_score": 0, "bans_24h": 0, "attack": False}
        )
        r = self.runner([src])
        r.cycle()
        src.events = [
            {"type": "ip_banned", "count": 1, "text": f"BANNED 192.0.2.{i}"} for i in range(25)
        ]
        r.cycle()
        ev = self.read_state()["events"]
        self.assertEqual(len(ev), 20)
        self.assertEqual(ev[0]["seq"], 6)
        self.assertEqual(ev[-1]["seq"], 25)
        self.assertEqual(contract.validate(self.read_state()), [])

    def test_secret_values_never_reach_the_file(self):
        bad = Fake("adblock", "adblock", self.config)
        bad.fail = SourceError("login s3cret-example failed")
        self.runner([bad]).cycle()
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            raw = fh.read()
        self.assertNotIn("s3cret-example", raw)
        self.assertIn("***", raw)

    def test_quiet_line(self):
        containers = Fake(
            "containers",
            "containers",
            self.config,
            {"total": 29, "running": 29, "unhealthy": [], "restarting": [], "failed": []},
        )
        orig = containers.fetch
        containers.fetch = lambda now: Reading(orig(now).facts, {"bad": {}})
        adblock = Fake("adblock", "adblock", self.config, {"blocked_today": 4812})
        self.runner([containers, adblock]).cycle()
        self.assertEqual(self.read_state()["quiet_line"], "ALL QUIET · 29 up · 4,812 ads blocked")

    def test_quiet_line_shortens_a_count_that_does_not_fit(self):
        r = self.runner([])
        backup = Reading({"last_ok": "2026-01-15T03:12:00Z", "age_h": 1.0})

        def line(up, n):
            readings = {
                "containers": Reading({"running": up}),
                "backup": backup,
                "adblock": Reading({"blocked_today": n}),
            }
            return r.quiet_line(readings)

        self.assertEqual(line(29, 4812), "ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked")
        self.assertEqual(line(29, 11283), "ALL QUIET · 29 up · backup 03:12 · 11.3k ads blocked")
        self.assertEqual(line(100, 11283), "ALL QUIET · 100 up · backup 03:12 · 11.3k blocked")
        self.assertEqual(line(100, 1355686), "ALL QUIET · 100 up · backup 03:12 · 1.4M ads blocked")

    def test_attack_fact_follows_the_condition(self):
        sec = Fake(
            "security",
            "security",
            self.config,
            {"threat_score": 9, "bans_24h": 40, "attack": False},
        )
        orig = sec.fetch

        def fetch(now):
            r = orig(now)
            r.data = {
                "bans_in_window": 9,
                "jail_ban": False,
                "last_ban": {"ip": "203.0.113.5", "jail": "caddy", "time": None},
            }
            return r

        sec.fetch = fetch
        self.runner([sec]).cycle()
        state = self.read_state()
        self.assertTrue(state["facts"]["security"]["attack"])
        self.assertEqual(state["conditions"][0]["id"], "attack")


class MemoryTest(unittest.TestCase):
    def test_lock_is_exclusive(self):
        with tempfile.TemporaryDirectory() as d:
            a = Memory(d)
            a.lock()
            b = Memory(d)
            with self.assertRaises(RuntimeError):
                b.lock()

    def test_save_is_skipped_when_nothing_changed(self):
        with tempfile.TemporaryDirectory() as d:
            m = Memory(d)
            m.data["seq"] = 3
            m.save()
            before = os.stat(m.path).st_mtime_ns
            time.sleep(0.01)
            m.save()
            self.assertEqual(os.stat(m.path).st_mtime_ns, before)
            n = Memory(d)
            n.load()
            self.assertEqual(n.data["seq"], 3)


if __name__ == "__main__":
    unittest.main()
