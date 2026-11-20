import json
import os
import stat
import tempfile
import threading
import time
import unittest
from typing import ClassVar
from unittest import mock

from collector import contract, text
from collector.net import AuthError, SourceError
from collector.runner import Runner
from collector.sources import Reading, Source
from collector.store import Memory
from kw_helpers import Clock, FakeHttp, closed_port, listener, make_config, unanswering


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
            {
                "KNIGHTWATCHER_ADGUARD_USERNAME": "kw",
                "KNIGHTWATCHER_ADGUARD_PASSWORD": "s3cret-example",
            },
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

    def test_defaults_hold_only_the_keys_the_config_set(self):
        wan = Fake("wan", "wan", self.config, {"up": True})
        r = self.runner([wan])
        empty = {"look": {}, "display": {}, "quiet": {}, "scenes": {}}
        self.assertEqual(r.cycle()["defaults"], empty)
        self.assertEqual(self.read_state()["defaults"], empty)

        config = make_config(
            {
                "collector": {"output_dir": self.out, "state_dir": self.var},
                "look": {"skin": "deep", "monarch": "b", "monarch_robe": "teal"},
                "display": {"clock": 12, "helmet_indoors": False},
                "scenes": {"cpu_hot": "camp"},
            }
        )
        r = self.runner([Fake("wan", "wan", config, {"up": True})], config=config)
        expected = {
            "look": {"skin": "deep", "monarch": "b", "monarch_robe": "teal"},
            "display": {"clock": 12, "helmet_indoors": False},
            "quiet": {},
            "scenes": {"cpu_hot": "camp"},
        }
        for _ in range(2):  # written on every write of the file
            r.cycle()
            state = self.read_state()
            self.assertEqual(state["defaults"], expected)
            self.assertEqual(contract.validate(state), [])
            self.clock.advance(5)
        # A poll never changes the config's own copy.
        r.cycle()["defaults"]["look"]["skin"] = "fair"
        self.assertEqual(config.defaults["look"]["skin"], "deep")

        config = make_config(
            {
                "collector": {"output_dir": self.out, "state_dir": self.var},
                "quiet": {"scenes": ["yard", "house"], "minutes": 4},
            }
        )
        r = self.runner([Fake("wan", "wan", config, {"up": True})], config=config)
        r.cycle()["defaults"]["quiet"]["scenes"].append("camp")
        self.assertEqual(
            self.read_state()["defaults"],
            {
                "look": {},
                "display": {},
                "quiet": {"scenes": ["yard", "house"], "minutes": 4},
                "scenes": {},
            },
        )
        self.assertEqual(config.defaults["quiet"]["scenes"], ["yard", "house"])

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
        src = Fake("security", "security", self.config, {"bans_24h": 0, "attack": False})
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

    def quiet(self, readings, config=None):
        r = self.runner([], config=config)
        return r.quiet_parts(readings), r.quiet_line(readings)

    def test_quiet_parts_carry_every_part_formatted_as_the_line_has_it(self):
        parts, line = self.quiet(
            {
                "containers": Reading({"running": 29}),
                "backup": Reading({"last_ok": "2026-01-15T03:12:00Z", "age_h": 1.0}),
                "adblock": Reading({"blocked_today": 4812}),
            }
        )
        self.assertEqual(
            parts,
            [
                {"k": "quiet"},
                {"k": "up", "n": "29"},
                {"k": "backup", "at": "03:12"},
                {"k": "ads", "n": "4,812", "short": "4,812"},
            ],
        )
        self.assertEqual(line, "ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked")

    def test_quiet_parts_leave_out_the_readings_that_are_missing(self):
        self.assertEqual(self.quiet({}), ([{"k": "quiet"}], "ALL QUIET"))
        self.assertEqual(
            self.quiet({"adblock": Reading({"blocked_today": 11283})}),
            (
                [{"k": "quiet"}, {"k": "ads", "n": "11,283", "short": "11.3k"}],
                "ALL QUIET · 11,283 ads blocked",
            ),
        )
        self.assertEqual(
            self.quiet({"containers": Reading({"running": 0})}),
            ([{"k": "quiet"}, {"k": "up", "n": "0"}], "ALL QUIET · 0 up"),
        )

    def test_a_backup_with_no_completion_known_has_no_part(self):
        parts, line = self.quiet(
            {
                "containers": Reading({"running": 29}),
                "backup": Reading({"last_ok": None, "age_h": None}),
            }
        )
        self.assertEqual(parts, [{"k": "quiet"}, {"k": "up", "n": "29"}])
        self.assertEqual(line, "ALL QUIET · 29 up")

    def test_the_backup_part_is_in_the_collectors_time_zone(self):
        config = make_config(
            {"collector": {"output_dir": self.out, "state_dir": self.var, "timezone": "Asia/Tokyo"}}
        )
        parts, line = self.quiet(
            {"backup": Reading({"last_ok": "2026-01-15T03:12:00Z", "age_h": 1.0})}, config
        )
        self.assertEqual(parts, [{"k": "quiet"}, {"k": "backup", "at": "12:12"}])
        self.assertEqual(line, "ALL QUIET · backup 12:12")

    def test_the_ads_part_stays_when_the_line_shortens_or_drops_it(self):
        backup = Reading({"last_ok": "2026-01-15T03:12:00Z", "age_h": 1.0})
        shortened, line = self.quiet(
            {
                "containers": Reading({"running": 100}),
                "backup": backup,
                "adblock": Reading({"blocked_today": 11283}),
            }
        )
        self.assertEqual(line, "ALL QUIET · 100 up · backup 03:12 · 11.3k blocked")
        self.assertEqual(shortened[-1], {"k": "ads", "n": "11,283", "short": "11.3k"})
        dropped, line = self.quiet(
            {
                "containers": Reading({"running": 10**12}),
                "backup": backup,
                "adblock": Reading({"blocked_today": 1355686}),
            }
        )
        self.assertEqual(line, "ALL QUIET · 1000000000000 up · backup 03:12")
        self.assertEqual(
            dropped,
            [
                {"k": "quiet"},
                {"k": "up", "n": "1000000000000"},
                {"k": "backup", "at": "03:12"},
                {"k": "ads", "n": "1,355,686", "short": "1.4M"},
            ],
        )

    def test_the_quiet_line_is_what_it_was_before_the_parts(self):
        def before(readings):
            # The quiet line as it was built before it was built from its parts.
            parts = ["ALL QUIET"]
            containers = readings.get("containers")
            if containers is not None:
                parts.append(f"{containers.facts['running']} up")
            backup = readings.get("backup")
            if backup is not None and backup.facts["last_ok"]:
                when = text.parse_iso(backup.facts["last_ok"]).astimezone(self.config.tz)
                parts.append(f"backup {when:%H:%M}")
            adblock = readings.get("adblock")
            if adblock is not None:
                n = adblock.facts["blocked_today"]
                for part in (
                    f"{text.count(n)} ads blocked",
                    f"{text.short_count(n)} ads blocked",
                    f"{text.short_count(n)} blocked",
                ):
                    if len(text.SEP.join([*parts, part])) <= text.QUIET_LINE_MAX:
                        parts.append(part)
                        break
            return text.join_fitting(parts, text.QUIET_LINE_MAX)

        r = self.runner([])
        backups = [None, {"last_ok": None}, {"last_ok": "2026-01-15T03:12:00Z"}]
        for up in (None, 0, 9, 29, 100, 12345, 10**8, 10**12, 10**40):
            for backup in backups:
                for n in (None, 0, 999, 4812, 11283, 99999, 240000, 1355686, 10**9, 10**15):
                    readings = {}
                    if up is not None:
                        readings["containers"] = Reading({"running": up})
                    if backup is not None:
                        readings["backup"] = Reading(dict(backup))
                    if n is not None:
                        readings["adblock"] = Reading({"blocked_today": n})
                    self.assertEqual(r.quiet_line(readings), before(readings), (up, backup, n))

    def test_the_file_carries_the_quiet_parts(self):
        adblock = Fake("adblock", "adblock", self.config, {"blocked_today": 4812})
        self.runner([adblock]).cycle()
        state = self.read_state()
        self.assertEqual(
            state["quiet_parts"], [{"k": "quiet"}, {"k": "ads", "n": "4,812", "short": "4,812"}]
        )
        self.assertEqual(state["quiet_line"], "ALL QUIET · 4,812 ads blocked")
        self.assertEqual(contract.validate(state), [])

    def events_written(self, found):
        src = Fake("security", "security", self.config, {"bans_24h": 0, "attack": False})
        r = self.runner([src])
        r.cycle()
        src.events = found
        r.cycle()
        state = self.read_state()
        self.assertEqual(contract.validate(state), [])
        return state["events"]

    def test_events_carry_their_parts_beside_the_text(self):
        events = self.events_written(
            [
                {
                    "type": "ip_banned",
                    "count": 1,
                    "text": "BANNED 198.51.100.9 · sshd",
                    "parts": {"addr": "198.51.100.9", "jail": "sshd"},
                },
                {
                    "type": "ip_banned",
                    "count": 1,
                    "text": "BANNED 198.51.100.10",
                    "parts": {"addr": "198.51.100.10"},
                },
                {
                    "type": "import",
                    "count": 1,
                    "text": "IMPORTED · A Film (2024)",
                    "parts": {"title": "A Film (2024)"},
                },
                {
                    "type": "backup_done",
                    "count": 1,
                    "text": "BACKUP DONE 03:12",
                    "parts": {"at": "03:12"},
                },
                {"type": "ad_blocked", "count": 2, "text": ""},
            ]
        )
        self.assertEqual(
            [(e["type"], e["text"], e.get("parts")) for e in events],
            [
                (
                    "ip_banned",
                    "BANNED 198.51.100.9 · sshd",
                    {"addr": "198.51.100.9", "jail": "sshd"},
                ),
                ("ip_banned", "BANNED 198.51.100.10", {"addr": "198.51.100.10"}),
                ("import", "IMPORTED · A Film (2024)", {"title": "A Film (2024)"}),
                ("backup_done", "BACKUP DONE 03:12", {"at": "03:12"}),
                ("ad_blocked", "", None),
            ],
        )

    def test_a_part_is_cleaned_and_capped_as_the_caption_is(self):
        title = "The  Night\tShift\n" + "x" * 60
        [event] = self.events_written(
            [
                {
                    "type": "import",
                    "count": 1,
                    "text": f"IMPORTED · {title}",
                    "parts": {"title": title},
                }
            ]
        )
        # The caption is as it always was; the part is cleaned by the same rule.
        self.assertEqual(event["text"], text.event_text(f"IMPORTED · {title}"))
        self.assertEqual(event["text"], "IMPORTED · The Night Shift " + "x" * 16 + "…")
        self.assertEqual(event["parts"], {"title": "The Night Shift " + "x" * 27 + "…"})
        self.assertEqual(len(event["parts"]["title"]), text.EVENT_TEXT_MAX)

    def test_parts_that_clean_to_nothing_are_left_out(self):
        events = self.events_written(
            [
                # A jail of spaces alone: the address stays.
                {
                    "type": "ip_banned",
                    "count": 1,
                    "text": "BANNED 198.51.100.9 ·  ",
                    "parts": {"addr": "198.51.100.9", "jail": "  "},
                },
                # An import with no title: no parts at all, and the page words it from text.
                {"type": "import", "count": 1, "text": "IMPORTED · ", "parts": {"title": ""}},
                # Names a type does not have, and parts on a type that has none.
                {
                    "type": "backup_done",
                    "count": 1,
                    "text": "BACKUP DONE 03:12",
                    "parts": {"at": "03:12", "where": "offsite"},
                },
                {"type": "ad_blocked", "count": 1, "text": "", "parts": {"n": "3"}},
            ]
        )
        self.assertEqual(
            [(e["text"], e.get("parts")) for e in events],
            [
                ("BANNED 198.51.100.9 ·", {"addr": "198.51.100.9"}),
                ("IMPORTED ·", None),
                ("BACKUP DONE 03:12", {"at": "03:12"}),
                ("", None),
            ],
        )

    def test_attack_fact_follows_the_condition(self):
        sec = Fake(
            "security",
            "security",
            self.config,
            {"bans_24h": 40, "attack": False},
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


class CloseTest(unittest.TestCase):
    """A source's close(): when it is replaced or taken away, and when the collector stops."""

    class Closing(Fake):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.closed = threading.Event()

        def close(self):
            self.closed.set()

    def test_a_source_replaced_or_taken_away_is_closed_and_one_kept_is_not(self):
        config = make_config({})
        kept, changed, gone = (CloseTest.Closing(n, None, config) for n in ("a", "b", "c"))
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        runner = Runner(config, Memory(tmp.name), sources=[kept, changed, gone])
        again = CloseTest.Closing("a", None, config)
        other = CloseTest.Closing("b", None, config, every_s=60)
        runner.reconfigure(config, [again, other])
        self.assertTrue(changed.closed.wait(5))
        self.assertTrue(gone.closed.wait(5))
        self.assertFalse(kept.closed.is_set())
        self.assertEqual([s for s in runner.sources], [kept, other])
        runner.close()
        self.assertTrue(kept.closed.is_set())
        self.assertTrue(other.closed.is_set())
        self.assertFalse(again.closed.is_set())


class DevicesRunnerTest(unittest.TestCase):
    """Devices through the whole poll, against local sockets."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.clock = Clock()
        self.open = listener(64)
        self.addCleanup(self.open.close)
        hung, fillers = unanswering()
        self.addCleanup(hung.close)
        for f in fillers:
            self.addCleanup(f.close)
        self.hung = hung.getsockname()[1]

    def runner(self, raw):
        raw = {
            **raw,
            "collector": {
                "output_dir": self.out,
                "state_dir": self.var,
                **raw.get("collector", {}),
            },
        }
        return Runner(make_config(raw), Memory(self.var), clock=self.clock)

    def read_state(self):
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def test_twenty_devices_with_five_that_hang_fit_the_poll(self):
        devices = [
            {
                "name": f"Box {i:02d}",
                "kind": "machine",
                "host": "127.0.0.1",
                "port": self.hung if i % 4 == 3 else self.open.getsockname()[1],
                "every_s": 10,
                "down_after_s": 10,
            }
            for i in range(20)
        ]
        # Polls every 5 s, waiting at most 3.3 s; each check gives up after 1 s.
        r = self.runner({"collector": {"interval_s": 5, "http_timeout_s": 1.0}, "device": devices})
        for poll in range(3):  # 0, 10, 20 s
            started = time.monotonic()
            state = r.cycle()
            self.assertLess(time.monotonic() - started, 5)
            self.assertEqual(contract.validate(state), [])
            # Every reading is collected at the poll that started it.
            for name in (f"device:Box {i:02d}" for i in range(20)):
                self.assertEqual(
                    state["sources"][name], {"ok": True, "at": state["generated_at"], "error": ""}
                )
            listed = state["facts"]["devices"]["list"]
            hanging = [t for i, t in enumerate(listed) if i % 4 == 3]
            answering = [t for i, t in enumerate(listed) if i % 4 != 3]
            self.assertTrue(all(t["state"] == "up" for t in answering))
            self.assertEqual({t["state"] for t in hanging}, {"unknown" if poll == 0 else "down"})
            self.clock.advance(10)
        (c,) = state["conditions"]
        self.assertEqual(
            (c["id"], c["headline"], c["devices"]), ("device_down", "5 DOWN", [3, 7, 11, 15, 19])
        )
        self.assertEqual(c["detail"], "Box 03, Box 07, Box 11, Box 15, Box 19")

    def test_a_check_that_outlasts_its_limit_counts_as_silence(self):
        release = threading.Event()
        self.addCleanup(release.set)

        def check(host, ports, timeout, refused_counts):
            if host == "192.0.2.41":
                release.wait(10)
            return True

        devices = [
            {
                "name": "Vault",
                "kind": "machine",
                "host": "192.0.2.40",
                "port": 445,
                "every_s": 10,
                "down_after_s": 10,
            },
            {
                "name": "Buildbox",
                "kind": "vm",
                "host": "192.0.2.41",
                "port": 22,
                "every_s": 10,
                "down_after_s": 10,
            },
        ]
        with mock.patch("collector.sources.devices.tcp_any", check):
            r = self.runner({"device": devices})
            r._deadline_s = lambda: 0.05
            r._limit_s = lambda source: 0.1
            state = r.cycle()  # 0 s: Buildbox's first check is still running
            self.assertEqual(
                state["sources"]["device:Buildbox"]["error"], "first read still running"
            )
            self.assertEqual(
                [t["state"] for t in state["facts"]["devices"]["list"]], ["up", "unknown"]
            )
            time.sleep(0.15)
            self.clock.advance(10)
            state = r.cycle()  # 10 s: past its limit, timed out: silent from now
            self.assertEqual(state["sources"]["device:Buildbox"]["error"], "timed out")
            self.assertEqual(state["conditions"], [])
            self.clock.advance(10)
            state = r.cycle()  # 20 s: still hanging, silent for 10 s
            self.assertEqual(
                state["sources"]["device:Buildbox"]["error"], "previous read still running"
            )
            self.assertEqual(
                [t["state"] for t in state["facts"]["devices"]["list"]], ["up", "down"]
            )
            self.assertEqual(
                [(c["id"], c["headline"], c["devices"]) for c in state["conditions"]],
                [("device_down", "BUILDBOX DOWN", [1])],
            )
            self.assertEqual(contract.validate(state), [])

    def test_a_device_goes_down_and_comes_back_by_tcp_and_by_web_address(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/"] = (401, b"")
        up_url, down_url = http.url + "/", f"http://127.0.0.1:{closed_port()}/"
        up_port = self.open.getsockname()[1]
        r = self.runner(
            {
                "collector": {"http_timeout_s": 0.3},
                "device": [
                    {
                        "name": "Vault",
                        "kind": "machine",
                        "host": "127.0.0.1",
                        "port": up_port,
                        "every_s": 10,
                        "down_after_s": 20,
                    },
                    {
                        "name": "Gate cam",
                        "kind": "camera",
                        "url": up_url,
                        "every_s": 10,
                        "down_after_s": 20,
                    },
                ],
            }
        )
        vault, cam = r.sources
        seen = []
        # Both answer, both fall silent for 30 s, then both answer again.
        for step in "UUSSSSUUUUU":
            vault.settings["ports"] = [up_port if step == "U" else self.hung]
            cam.settings["url"] = up_url if step == "U" else down_url
            state = r.cycle()
            headline = state["conditions"][0]["headline"] if state["conditions"] else ""
            seen.append(([t["state"] for t in state["facts"]["devices"]["list"]], headline))
            self.clock.advance(10)
        up, down = ["up", "up"], ["down", "down"]
        self.assertEqual(
            seen,
            [
                (up, ""),  # 0 s
                (up, ""),
                (up, ""),  # 20 s: silent from here
                (up, ""),
                (down, "2 DOWN"),  # 40 s: silent for 20 s
                (down, "2 DOWN"),
                (up, "2 DOWN"),  # 60 s: back, the warning held for 30 s
                (up, "2 DOWN"),
                (up, "2 DOWN"),
                (up, ""),  # 90 s
                (up, ""),
            ],
        )

    def test_the_file_with_devices(self):
        refused = closed_port()
        r = self.runner(
            {
                "sources": {"pi": {"host": "localhost", "ports": [refused]}},
                "device": [
                    {
                        "name": "Vault",
                        "kind": "machine",
                        "host": "127.0.0.1",
                        "port": self.open.getsockname()[1],
                    },
                    {
                        "name": "Laptop",
                        "kind": "machine",
                        "host": "127.0.0.1",
                        "port": refused,
                        "refused_counts": True,
                        "alert": False,
                    },
                    {"name": "Gate cam", "kind": "camera", "host": "127.0.0.1", "port": refused},
                ],
            }
        )
        state = r.cycle()
        self.assertEqual(contract.validate(state), [])
        self.assertEqual(state["facts"]["pi"], {"up": True})
        self.assertEqual(
            [(t["name"], t["state"], t["seen"]) for t in state["facts"]["devices"]["list"]],
            [
                ("Pi", "up", True),
                ("Vault", "up", True),
                ("Laptop", "up", True),
                ("Gate cam", "unknown", False),
            ],
        )
        self.assertEqual(
            list(state["sources"]), ["pi", "device:Vault", "device:Laptop", "device:Gate cam"]
        )
        # With no device at all, the section is null.
        self.assertIsNone(self.runner({}).cycle()["facts"]["devices"])

    # The record of facts.pi, sources.pi and pi_silent at each poll, taken from the collector as
    # it was before devices, for these same inputs: (facts.pi.up, sources.pi.ok, the end of
    # sources.pi.at, sources.pi.error, (the end of pi_silent's since, its detail) or None).
    PI_BEFORE_DEVICES: ClassVar[list] = [
        (True, True, "0:00Z", "", None),
        (True, True, "0:00Z", "", None),
        (False, True, "0:20Z", "", None),
        (False, True, "0:20Z", "", None),
        (False, True, "0:40Z", "", None),
        (False, True, "0:40Z", "", ("0:20Z", "no answer for 30 s")),
        (False, True, "1:00Z", "", ("0:20Z", "no answer for 40 s")),
        (False, True, "1:00Z", "", ("0:20Z", "no answer for 50 s")),
        (True, True, "1:20Z", "", ("0:20Z", "no answer for 1 min")),
        (True, True, "1:20Z", "", ("0:20Z", "no answer for 1 min")),
        (False, True, "1:40Z", "", ("0:20Z", "no answer for 1 min")),
        (False, True, "1:40Z", "", ("0:20Z", "no answer for 1 min")),
        (False, True, "2:00Z", "", ("0:20Z", "no answer for 1 min")),
        (False, True, "2:00Z", "", ("0:20Z", "no answer for 1 min")),
        (False, True, "2:20Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "2:20Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "2:40Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "2:40Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "3:00Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "3:00Z", "", ("0:20Z", "no answer for 2 min")),
        (False, True, "3:20Z", "", ("0:20Z", "no answer for 3 min")),
        (False, True, "3:20Z", "", ("0:20Z", "no answer for 3 min")),
        (False, True, "3:40Z", "", ("0:20Z", "no answer for 3 min")),
        (False, True, "3:40Z", "", ("0:20Z", "no answer for 3 min")),
        (False, True, "4:00Z", "", ("0:20Z", "no answer for 3 min")),
        (False, True, "4:00Z", "", ("0:20Z", "no answer for 3 min")),
        (True, True, "4:20Z", "", ("0:20Z", "no answer for 4 min")),
        (True, True, "4:20Z", "", ("0:20Z", "no answer for 4 min")),
        (True, True, "4:40Z", "", None),
        (True, True, "4:40Z", "", None),
        (True, True, "5:00Z", "", None),
    ]

    def test_sources_pi_alone_writes_what_it_wrote_before(self):
        # U answers, N never does (its check times out), R refuses, which counts for the Pi.
        refused = closed_port()
        ports = {"U": [self.open.getsockname()[1]], "N": [self.hung], "R": [refused]}
        r = self.runner(
            {
                "collector": {"interval_s": 10, "http_timeout_s": 0.1},
                "conditions": {"clear_after_s": 20, "pi_silent": {"for_s": 30}},
                "sources": {"pi": {"host": "127.0.0.1", "ports": [1], "every_s": 20}},
            }
        )
        (pi,) = r.sources
        rows = []
        for step in "UUNNNNNURNNNNNNUNNNNNNNNNUUUUUU":
            pi.settings["ports"] = ports[step]
            state = r.cycle()
            s, f = state["sources"]["pi"], state["facts"]["pi"]
            silent = [
                (c["since"][-5:], c["detail"])
                for c in state["conditions"]
                if c["id"] == "pi_silent"
            ]
            rows.append((f["up"], s["ok"], s["at"][-5:], s["error"], silent[0] if silent else None))
            self.clock.advance(10)
        self.assertEqual(rows, self.PI_BEFORE_DEVICES)


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
