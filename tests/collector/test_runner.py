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
    """A source whose fetch does whatever the test sets."""

    def __init__(self, name, section, config, facts=None, events=None):
        super().__init__({}, config)
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
                    "interval_s": 3,
                    "http_timeout_s": 1.0,
                }
            },
            {"adguard": {"username": "kw", "password": "s3cret-example"}},
        )
        self.clock = Clock()

    def runner(self, sources, memory=None):
        memory = memory or Memory(self.var)
        return Runner(self.config, memory, sources=sources, clock=self.clock)

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
        self.assertEqual(state["interval_s"], 3)
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
        slow.delay = 5
        quick = Fake("pi", "pi", self.config, {"up": True})
        r = self.runner([slow, quick])
        started = time.monotonic()
        r.cycle()
        self.assertLess(time.monotonic() - started, 3)
        state = self.read_state()
        self.assertEqual(state["sources"]["wan"]["error"], "timed out")
        # A hung read must never keep the process alive at exit.
        self.assertTrue(r._inflight["wan"].thread.daemon)
        self.assertEqual(state["facts"]["pi"], {"up": True})
        # Still running at the next poll: it is not started a second time.
        r.cycle()
        self.assertEqual(
            self.read_state()["sources"]["wan"]["error"], "previous read still running"
        )
        self.assertEqual(slow.calls, 1)

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
