import datetime as dt
import unittest
from typing import ClassVar
from unittest import mock

from collector.conditions import Conditions
from collector.kinds import streams as streams_source
from collector.sources import Reading
from collector.sources.host import HostSource
from kw_helpers import T0, FakeProc, at, make_config


def host(cpu=10.0, avail=50.0, disks=None, load1=1.0, span=30.0):
    """A host reading whose CPU and available memory are averages over span seconds."""
    facts = {
        "cpu_pct": cpu,
        "load1": load1,
        "cores": 4,
        "mem_pct": 100 - avail,
        "swap_pct": 99.0,
        "disks": disks or [],
    }
    data = {
        "mem_available_pct": avail,
        "mem_available_avg": avail,
        "mem_span_s": span,
        "cpu_span_s": span,
    }
    return Reading(facts, data)


def containers(bad=None):
    bad = bad or {}
    facts = {"total": 5, "running": 5, "unhealthy": [], "restarting": [], "failed": []}
    for name, info in bad.items():
        facts[info["kind"]].append(name)
    return Reading(facts, {"bad": bad})


def security(jail_ban=False, in_window=0, jail="sshd", ip="203.0.113.77"):
    facts = {"bans_24h": 3, "attack": False}
    data = {
        "bans_in_window": in_window,
        "jail_ban": jail_ban,
        "last_ban": {"ip": ip, "jail": jail, "time": T0},
    }
    return Reading(facts, data)


def ssh(*conns):
    """An ssh reading of (address, port) connections."""
    facts = {"count": len(conns), "sources": sorted({a for a, _ in conns})}
    return Reading(facts, {"conns": [[a, p] for a, p in conns]})


A = ("192.0.2.10", 51000)
B = ("198.51.100.7", 51001)
C = ("203.0.113.5", 51002)


def ids(out):
    return [c["id"] for c in out]


class Harness:
    """Feeds a Conditions engine one poll at a time, step seconds apart (10, the default
    interval, unless the test says)."""

    def __init__(self, raw=None, step=10):
        self.c = Conditions(make_config(raw))
        self.t = 0
        self.step = step

    def poll(self, fresh=None, status=None, **readings):
        out = self.c.evaluate(readings, at(self.t), fresh, status)
        self.t += self.step
        return out


class HoldTest(unittest.TestCase):
    """The clearing rule, shown with disk_full, which has no duration of its own."""

    FULL: ClassVar[list] = [{"mount": "/data", "pct": 95.0, "free_gb": 1}]
    ROOMY: ClassVar[list] = [{"mount": "/data", "pct": 50.0, "free_gb": 900}]

    def test_clears_once_the_cause_has_been_absent_for_clear_after_s(self):
        h = Harness()
        self.assertEqual(ids(h.poll(host=host(disks=self.FULL))), ["disk_full"])  # 0 s
        for _ in range(3):  # 10, 20, 30 s: absent since 10 s, held with the last words
            held = h.poll(host=host(disks=self.ROOMY))
            self.assertEqual(ids(held), ["disk_full"])
            self.assertEqual(held[0]["detail"], "/data at 95% · 1 GB free")
        self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), [])  # 40 s: 30 s absent

    def test_clear_after_s_is_in_seconds_whatever_the_interval(self):
        h = Harness({"conditions": {"clear_after_s": 60}}, step=20)
        h.poll(host=host(disks=self.FULL))  # 0 s
        for _ in range(3):  # 20, 40, 60 s
            self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), ["disk_full"])
        self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), [])  # 80 s: 60 s absent

    def test_zero_clears_at_once(self):
        h = Harness({"conditions": {"clear_after_s": 0}})
        h.poll(host=host(disks=self.FULL))
        self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), [])

    def test_returning_cause_during_the_hold_keeps_it_active(self):
        h = Harness()
        first = h.poll(host=host(disks=self.FULL))
        h.poll(host=host(disks=self.ROOMY))
        h.poll(host=host(disks=self.ROOMY))
        again = h.poll(host=host(disks=self.FULL))
        self.assertEqual(again[0]["since"], first[0]["since"])
        # The hold starts again from the next absence.
        for _ in range(3):
            self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), ["disk_full"])
        self.assertEqual(ids(h.poll(host=host(disks=self.ROOMY))), [])

    def test_a_failed_source_counts_as_absent(self):
        h = Harness()
        h.poll(host=host(disks=self.FULL))
        for _ in range(3):
            self.assertEqual(ids(h.poll(host=None)), ["disk_full"])
        self.assertEqual(ids(h.poll(host=None)), [])


class ResourceWordsTest(unittest.TestCase):
    """cpu_hot and memory_tight judge the averages the host source works out."""

    def test_cpu_hot_from_the_window_average(self):
        h = Harness()
        self.assertEqual(ids(h.poll(host=host(cpu=84.9))), [])
        out = h.poll(host=host(cpu=99))  # 10 s
        self.assertEqual(ids(out), ["cpu_hot"])
        self.assertEqual(out[0]["level"], "warning")
        self.assertEqual(out[0]["headline"], "CPU HOT")
        # The average covers the last 30 s, so the cause began 30 s before it was raised.
        self.assertEqual(out[0]["since"], "2026-01-15T20:59:40Z")
        self.assertEqual(out[0]["detail"], "99% for 30 s · load 1.0")
        later = [h.poll(host=host(cpu=97))[0]["detail"] for _ in range(4)]  # 20 .. 50 s
        self.assertEqual(
            later,
            [
                "97% for 40 s · load 1.0",
                "97% for 50 s · load 1.0",
                "97% for 1 min · load 1.0",
                "97% for 1 min · load 1.0",
            ],
        )

    def test_memory_tight_judges_available_memory_not_swap(self):
        h = Harness()
        # Swap is 99 % full in every reading; only MemAvailable matters.
        self.assertEqual(ids(h.poll(host=host(avail=40))), [])
        out = h.poll(host=host(avail=8))
        self.assertEqual(ids(out), ["memory_tight"])
        self.assertEqual(out[0]["detail"], "8% available for 30 s")
        self.assertEqual(h.poll(host=host(avail=9))[0]["detail"], "9% available for 40 s")

    def test_never_for_zero_seconds(self):
        # An average resting on the short sample after a start still reads at least 1 s.
        h = Harness()
        out = h.poll(host=host(cpu=95, avail=5, span=0.5))
        self.assertEqual(ids(out), ["cpu_hot", "memory_tight"])
        self.assertEqual(out[0]["detail"], "95% for 1 s · load 1.0")
        self.assertEqual(out[1]["detail"], "5% available for 1 s")


class Machine:
    """A host whose CPU and memory the test drives second by second, read by the real host
    source on a fake /proc, and judged by the conditions on the fake clock.

    The CPU has 1000 jiffies a second, so a second at p percent adds 10 p busy jiffies.
    """

    def __init__(self, test, raw=None):
        self.proc = FakeProc()
        test.addCleanup(self.proc.cleanup)
        raw = dict(raw or {})
        raw["collector"] = {"proc_root": self.proc.root}
        raw["sources"] = {"host": {}}
        config = make_config(raw)
        self.source = HostSource(config.sources["host"], config)
        self.conditions = Conditions(config)
        self.t = 0.0
        self.busy = 0
        self.idle = 0
        self.avail = 50.0
        self.proc.set_stat(0, 0)
        # The short sample after a start: the machine runs on at its last load for half a second.
        self.load = 0.0
        sleep = mock.patch("collector.sources.host.time.sleep", side_effect=self._half_second)
        sleep.start()
        test.addCleanup(sleep.stop)

    def _half_second(self, seconds):
        self._advance(seconds, self.load)

    def _advance(self, seconds, pct):
        busy = round(pct * 10 * seconds)
        self.busy += busy
        self.idle += round(1000 * seconds) - busy
        self.proc.set_stat(self.busy, self.idle)

    def run(self, seconds, pct=None, avail=None):
        """Run for some seconds at a CPU percentage, with this much memory available."""
        if pct is not None:
            self.load = pct
        if avail is not None:
            self.avail = avail
        self._advance(seconds, self.load)
        self.t += seconds

    def poll(self):
        """Read the host at the current time and judge; return the conditions raised."""
        self.proc.set_meminfo(total_kb=1_000_000, available_kb=round(self.avail * 10_000))
        reading = self.source.fetch(at(self.t))
        self.reading = reading
        return self.conditions.evaluate({"host": reading}, at(self.t))

    def steady(self, polls, step=10, pct=None, avail=None):
        """Poll every step seconds at a steady load; return the ids raised at each poll."""
        out = []
        for _ in range(polls):
            self.run(step, pct, avail)
            out.append(ids(self.poll()))
        return out


class CpuWindowTest(unittest.TestCase):
    def idle_machine(self):
        m = Machine(self)
        m.run(0, pct=2)
        m.poll()
        m.steady(6, pct=2)  # a full window of idle history, at 60 s
        return m

    def test_a_five_second_spike_raises_nothing(self):
        m = self.idle_machine()
        m.run(5, pct=100)
        m.run(5, pct=2)
        raised = [ids(m.poll())]
        raised += m.steady(4, pct=2)
        self.assertEqual(raised, [[]] * 5)

    def test_thirty_seconds_at_99_raises_it_on_the_poll_that_completes_the_window(self):
        m = self.idle_machine()  # at 60 s
        raised = m.steady(3, pct=99)  # 70, 80, 90 s
        self.assertEqual(raised, [[], [], ["cpu_hot"]])
        self.assertEqual(m.reading.facts["cpu_pct"], 99.0)

    def test_the_detail_reads_for_30_s_at_first_and_grows(self):
        m = self.idle_machine()
        m.steady(2, pct=99)
        out = []
        for _ in range(4):
            m.run(10, pct=99)
            out.append(m.poll()[0]["detail"])
        self.assertEqual(
            out,
            [
                "99% for 30 s · load 1.5",
                "99% for 40 s · load 1.5",
                "99% for 50 s · load 1.5",
                "99% for 1 min · load 1.5",
            ],
        )

    def test_a_dip_of_one_sample_does_not_clear_it(self):
        m = self.idle_machine()
        m.steady(3, pct=99)  # raised at 90 s
        # One ten-second sample at 70 %: the window holds (99 + 99 + 70) / 3 = 89.3 %.
        self.assertEqual(m.steady(1, pct=70), [["cpu_hot"]])
        self.assertEqual(m.reading.facts["cpu_pct"], 89.3)
        self.assertEqual(m.steady(3, pct=99), [["cpu_hot"]] * 3)
        held = m.conditions.trackers["cpu_hot"]
        self.assertIsNone(held.absent_since)  # the cause never went away

    def test_it_clears_once_the_average_falls_and_clear_after_s_has_passed(self):
        m = self.idle_machine()
        m.steady(3, pct=99)  # raised at 90 s
        # Idle from 90 s: the averages at 100, 110 and 120 s are 67, 34.7 and 2 %.
        raised = m.steady(6, pct=2)  # 100 .. 150 s
        # Below 85 % from 100 s, so it is held until 130 s and gone at 130.
        self.assertEqual(raised, [["cpu_hot"]] * 3 + [[]] * 3)

    def test_the_window_comes_from_config(self):
        m = Machine(self, {"conditions": {"cpu_hot": {"window_s": 60}}})
        m.run(0, pct=2)
        m.poll()
        m.steady(12, pct=2)
        self.assertEqual(m.steady(6, pct=99), [[]] * 5 + [["cpu_hot"]])


class MemoryWindowTest(unittest.TestCase):
    def roomy_machine(self):
        m = Machine(self)
        m.run(0, pct=2, avail=50)
        m.poll()
        m.steady(6)
        return m

    def test_a_brief_low_reading_raises_nothing(self):
        m = self.roomy_machine()
        raised = m.steady(1, avail=3) + m.steady(4, avail=50)
        self.assertEqual(raised, [[]] * 5)

    def test_thirty_seconds_low_raises_it_on_the_poll_that_completes_the_window(self):
        m = self.roomy_machine()
        # Samples at 70, 80 and 90 s are low; the 60 s sample leaves the window at 90 s.
        self.assertEqual(m.steady(3, avail=5), [[], [], ["memory_tight"]])
        self.assertEqual(m.reading.data["mem_available_avg"], 5.0)
        self.assertEqual(m.reading.facts["mem_pct"], 95.0)  # the latest reading, not the mean

    def test_the_detail_reads_for_30_s_at_first_and_grows(self):
        m = self.roomy_machine()
        m.steady(2, avail=5)
        out = []
        for _ in range(3):
            m.run(10)
            out.append(m.poll()[0]["detail"])
        self.assertEqual(
            out,
            ["5% available for 30 s", "5% available for 40 s", "5% available for 50 s"],
        )

    def test_a_dip_of_one_sample_does_not_clear_it(self):
        m = self.roomy_machine()
        m.steady(3, avail=5)
        # One sample at 14 %: the window holds (5 + 5 + 14) / 3 = 8 %.
        self.assertEqual(m.steady(1, avail=14), [["memory_tight"]])
        self.assertEqual(m.steady(2, avail=5), [["memory_tight"]] * 2)
        self.assertIsNone(m.conditions.trackers["memory_tight"].absent_since)

    def test_it_clears_once_the_average_rises_and_clear_after_s_has_passed(self):
        m = self.roomy_machine()
        m.steady(3, avail=5)  # raised at 90 s
        # Means at 100, 110, 120 s: 20, 35, 50 %; above 10 % from 100 s.
        self.assertEqual(m.steady(6, avail=50), [["memory_tight"]] * 3 + [[]] * 3)


class StartTest(unittest.TestCase):
    """After a start the window holds only what has been seen since."""

    def test_an_idle_start_raises_nothing(self):
        m = Machine(self)
        m.run(0, pct=2)
        self.assertEqual(ids(m.poll()), [])
        self.assertEqual(m.reading.facts["cpu_pct"], 2.0)
        self.assertEqual(m.reading.data["cpu_span_s"], 0.5)

    def test_a_start_into_a_busy_cpu_judges_the_half_second_it_has(self):
        m = Machine(self)
        m.run(0, pct=99)
        out = m.poll()
        self.assertEqual(ids(out), ["cpu_hot"])
        self.assertEqual(out[0]["detail"], "99% for 1 s · load 1.5")

    def test_the_window_grows_until_it_is_full(self):
        m = Machine(self)
        m.run(0, pct=99)
        m.poll()  # 0 s: busy for the half second it saw
        m.run(10, pct=2)
        m.poll()  # 10 s: the average covers 10.5 s
        self.assertEqual(m.reading.data["cpu_span_s"], 10.5)
        spans = []
        for _ in range(4):
            m.run(10)
            m.poll()
            spans.append(m.reading.data["cpu_span_s"])
        self.assertEqual(spans, [20.5, 30.5, 30.0, 30.0])

    def test_a_spike_soon_after_a_start_is_diluted_by_what_history_there_is(self):
        m = Machine(self)
        m.run(0, pct=2)
        m.poll()
        m.run(5, pct=100)
        m.run(5, pct=2)
        self.assertEqual(ids(m.poll()), [])  # 5 s of 100 % in 10.5 s is 48.7 %
        self.assertEqual(m.reading.facts["cpu_pct"], 48.7)

    def test_memory_after_a_start_is_the_one_reading_there_is(self):
        m = Machine(self)
        m.run(0, pct=2, avail=4)
        out = m.poll()
        self.assertEqual(ids(out), ["memory_tight"])
        self.assertEqual(out[0]["detail"], "4% available for 1 s")

    def test_memory_after_a_start_that_is_roomy(self):
        m = Machine(self)
        m.run(0, pct=2, avail=50)
        self.assertEqual(ids(m.poll()), [])
        self.assertEqual(m.reading.data["mem_available_avg"], 50.0)
        self.assertEqual(m.reading.data["mem_span_s"], 0.5)


class EachConditionTest(unittest.TestCase):
    def test_disk_full_is_immediate(self):
        h = Harness()
        disks = [{"mount": "/data", "pct": 91.2, "free_gb": 640}]
        out = h.poll(host=host(disks=disks))
        self.assertEqual(ids(out), ["disk_full"])
        self.assertEqual(out[0]["detail"], "/data at 91% · 640 GB free")

    def test_backup_overdue_after_thirty_hours(self):
        h = Harness()
        last = T0 - dt.timedelta(hours=29)
        r = Reading({"last_ok": last.strftime("%Y-%m-%dT%H:%M:%SZ"), "age_h": 29.0})
        self.assertEqual(ids(h.poll(backup=r)), [])
        last = T0 - dt.timedelta(hours=31)
        r = Reading({"last_ok": last.strftime("%Y-%m-%dT%H:%M:%SZ"), "age_h": 31.0})
        out = h.poll(backup=r)
        self.assertEqual(ids(out), ["backup_overdue"])
        self.assertEqual(out[0]["since"], "2026-01-15T20:00:00Z")
        self.assertEqual(out[0]["detail"], "last backup 31 h ago")

    def test_unknown_backup_raises_nothing(self):
        h = Harness()
        self.assertEqual(ids(h.poll(backup=Reading({"last_ok": None, "age_h": None}))), [])

    def test_pi_silent_after_three_minutes(self):
        h = Harness({"sources": {"pi": {"host": "192.0.2.4"}}})
        for _ in range(18):  # 0 .. 170 s
            self.assertEqual(ids(h.poll(pi=Reading({"up": False}))), [])
        out = h.poll(pi=Reading({"up": False}))  # 180 s
        self.assertEqual(ids(out), ["pi_silent"])
        self.assertEqual(out[0]["detail"], "no answer for 3 min")

    def test_wan_down_after_two_failed_checks(self):
        h = Harness()
        self.assertEqual(ids(h.poll(wan=Reading({"up": False}))), [])
        out = h.poll(wan=Reading({"up": False}))
        self.assertEqual(ids(out), ["wan_down"])
        self.assertEqual(out[0]["level"], "critical")

    def test_wan_down_counts_fresh_reads_not_polls(self):
        h = Harness()
        down = Reading({"up": False})
        self.assertEqual(ids(h.poll({"wan"}, wan=down)), [])  # 0 s, read
        self.assertEqual(ids(h.poll(set(), wan=down)), [])  # 10 s, the same reading
        self.assertEqual(ids(h.poll(set(), wan=down)), [])  # 20 s, the same reading
        out = h.poll({"wan"}, wan=Reading({"up": False}))  # 30 s, the second failed check
        self.assertEqual(ids(out), ["wan_down"])
        self.assertEqual(out[0]["detail"], "no answer for 30 s")

    def test_one_failed_wan_check_is_not_enough(self):
        h = Harness()
        h.poll(wan=Reading({"up": False}))
        self.assertEqual(ids(h.poll(wan=Reading({"up": True}))), [])
        self.assertEqual(ids(h.poll(wan=Reading({"up": False}))), [])

    def test_container_unhealthy_after_three_minutes_per_container(self):
        h = Harness()
        sick = {"radarr": {"kind": "unhealthy", "status": "Up 2 days (unhealthy)"}}
        for _ in range(18):  # 0 .. 170 s
            self.assertEqual(ids(h.poll(containers=containers(sick))), [])
        out = h.poll(containers=containers(sick))  # 180 s
        self.assertEqual(ids(out), ["container_unhealthy"])
        self.assertEqual(out[0]["headline"], "RADARR UNWELL")
        self.assertEqual(out[0]["detail"], "unhealthy for 3 min")

    def test_container_exited_names_the_code(self):
        h = Harness({"conditions": {"container_unhealthy": {"for_s": 0}}})
        bad = {"bazarr": {"kind": "failed", "status": "Exited (1) 4 minutes ago"}}
        out = h.poll(containers=containers(bad))
        self.assertEqual(out[0]["headline"], "BAZARR DOWN")
        self.assertEqual(out[0]["detail"], "exited with code 1 · down for 0 s")

    def test_long_container_name_keeps_the_word(self):
        h = Harness({"conditions": {"container_unhealthy": {"for_s": 0}}})
        bad = {"a-very-long-container-name": {"kind": "restarting", "status": "Restarting"}}
        out = h.poll(containers=containers(bad))
        self.assertLessEqual(len(out[0]["headline"]), 16)
        self.assertTrue(out[0]["headline"].endswith(" RESTARTING"))

    def test_several_containers(self):
        h = Harness({"conditions": {"container_unhealthy": {"for_s": 0}}})
        bad = {
            "sonarr": {"kind": "unhealthy", "status": "Up (unhealthy)"},
            "radarr": {"kind": "restarting", "status": "Restarting (1)"},
        }
        out = h.poll(containers=containers(bad))
        self.assertEqual(out[0]["headline"], "2 UNWELL")

    def test_container_that_recovers_restarts_its_timer(self):
        h = Harness()
        sick = {"radarr": {"kind": "unhealthy", "status": "Up (unhealthy)"}}
        for _ in range(15):  # 0 .. 140 s
            h.poll(containers=containers(sick))
        h.poll(containers=containers({}))  # 150 s
        for _ in range(18):  # 160 .. 330 s: 170 s unhealthy, not 180
            self.assertEqual(ids(h.poll(containers=containers(sick))), [])

    def test_ssh_updating_streaming(self):
        h = Harness()
        h.poll(ssh=ssh())
        out = h.poll(
            ssh=ssh(A),
            updates=Reading({"running": True, "what": "nightly maintenance"}),
            streams=Reading(
                {
                    "count": 1,
                    "titles": ["The Night Shift S02E04"],
                    "sessions": [{"title": "The Night Shift S02E04"}],
                }
            ),
        )
        self.assertEqual(ids(out), ["ssh_session", "updating", "streaming"])
        self.assertEqual(out[0]["detail"], "1 ssh session from 192.0.2.10")
        self.assertEqual(out[0]["level"], "work")
        self.assertEqual(out[1]["detail"], "nightly maintenance running for 0 s")
        self.assertEqual(out[2]["detail"], "The Night Shift S02E04")
        self.assertEqual(out[2]["level"], "quiet")

    def test_two_streams(self):
        h = Harness()
        sessions = [{"who": "Robin", "title": "A Film"}, {"who": "Sam", "title": "B Show S01E01"}]
        out = h.poll(
            streams=Reading(
                {"count": 2, "titles": ["A Film", "B Show S01E01"], "sessions": sessions}
            )
        )
        self.assertEqual(out[0]["headline"], "STREAMING")
        self.assertEqual(out[0]["detail"], "Robin · A Film · 1 of 2")

    def test_attack_from_a_jail_ban(self):
        h = Harness()
        out = h.poll(security=security(jail_ban=True, in_window=1))
        self.assertEqual(ids(out), ["attack"])
        self.assertEqual(out[0]["level"], "critical")
        self.assertEqual(out[0]["detail"], "sshd ban from 203.0.113.77 · 1 ban in 10 min")

    def test_attack_from_the_ban_count(self):
        h = Harness()
        self.assertEqual(ids(h.poll(security=security(in_window=4))), [])
        out = h.poll(security=security(in_window=5))
        self.assertEqual(ids(out), ["attack"])
        self.assertEqual(out[0]["detail"], "5 bans in 10 min")


def shown(h, polls, reading):
    """Whether ssh_session is up at each of several polls of the same reading."""
    return ["ssh_session" in ids(h.poll(ssh=reading)) for _ in range(polls)]


class SshSessionTest(unittest.TestCase):
    def test_sessions_open_at_the_first_reading_are_old(self):
        h = Harness()
        for _ in range(3):
            self.assertEqual(ids(h.poll(ssh=ssh(A, B))), [])

    def test_a_new_session_raises_it(self):
        h = Harness()
        h.poll(ssh=ssh(A))
        out = h.poll(ssh=ssh(A, B))
        self.assertEqual(ids(out), ["ssh_session"])
        self.assertEqual(out[0]["headline"], "SHELL OPEN")
        self.assertEqual(out[0]["detail"], "2 ssh sessions from 192.0.2.10, 198.51.100.7")
        self.assertEqual(out[0]["since"], "2026-01-15T21:00:10Z")

    def test_it_lasts_show_for_s_from_the_new_session(self):
        h = Harness({"conditions": {"ssh_session": {"show_for_s": 90}}})
        h.poll(ssh=ssh(A))  # 0 s
        # B is new at 10 s and fresh until 99 s; absent from 100 s, held 30 s, gone at 130 s.
        self.assertEqual(shown(h, 13, ssh(A, B)), [True] * 12 + [False])

    def test_the_default_is_ten_minutes(self):
        h = Harness()
        h.poll(ssh=ssh(A))  # 0 s
        # B is new at 10 s: up from 10 to 600 s, held to 630 s, gone at 640 s.
        self.assertEqual(shown(h, 64, ssh(A, B)), [True] * 63 + [False])

    def test_a_second_new_session_extends_the_window(self):
        h = Harness({"conditions": {"ssh_session": {"show_for_s": 90}}})
        h.poll(ssh=ssh())  # 0 s
        h.poll(ssh=ssh(A))  # 10 s, A is new
        out = h.poll(ssh=ssh(A, B))  # 20 s, B is new
        self.assertEqual(out[0]["since"], "2026-01-15T21:00:10Z")
        # A alone would have ended at 100 s; B keeps it up to 109 s, held to 130 s, gone at 140.
        self.assertEqual(shown(h, 12, ssh(A, B)), [True] * 11 + [False])

    def test_a_new_session_that_closes_lets_it_clear(self):
        h = Harness()
        h.poll(ssh=ssh(A))
        self.assertEqual(ids(h.poll(ssh=ssh(A, B))), ["ssh_session"])
        self.assertEqual(shown(h, 4, ssh(A)), [True, True, True, False])  # held 30 s

    def test_a_closed_session_is_forgotten(self):
        h = Harness()
        h.poll(ssh=ssh(A))
        h.poll(ssh=ssh())
        self.assertEqual(ids(h.poll(ssh=ssh(A))), ["ssh_session"])

    def test_min_sessions_still_applies(self):
        h = Harness({"conditions": {"ssh_session": {"min_sessions": 2}}})
        h.poll(ssh=ssh())
        self.assertEqual(ids(h.poll(ssh=ssh(A))), [])
        self.assertEqual(ids(h.poll(ssh=ssh(A, B))), ["ssh_session"])

    def test_zero_keeps_it_up_while_sessions_are_open(self):
        h = Harness({"conditions": {"ssh_session": {"show_for_s": 0}}})
        self.assertEqual(shown(h, 90, ssh(A)), [True] * 90)
        self.assertEqual(shown(h, 4, ssh()), [True, True, True, False])

    def test_an_unreadable_source_leaves_the_memory_alone(self):
        h = Harness()
        self.assertEqual(ids(h.poll(ssh=None)), [])
        self.assertEqual(ids(h.poll(ssh=ssh(A))), [])  # first good reading: A adopted
        self.assertEqual(ids(h.poll(ssh=None)), [])
        self.assertEqual(ids(h.poll(ssh=ssh(A))), [])  # A is still old
        self.assertEqual(ids(h.poll(ssh=ssh(A, C))), ["ssh_session"])
        self.assertEqual(shown(h, 4, None), [True, True, True, False])  # absent, held 30 s
        self.assertEqual(ids(h.poll(ssh=ssh(A, C))), ["ssh_session"])  # C is still new


class NightTest(unittest.TestCase):
    def _at(self, raw, when):
        c = Conditions(make_config(raw))
        return c.evaluate({}, when)

    def test_inside_and_outside_the_window_in_utc(self):
        self.assertEqual(ids(self._at({}, T0.replace(hour=23, minute=30))), ["night"])
        self.assertEqual(ids(self._at({}, T0.replace(hour=6, minute=59))), ["night"])
        self.assertEqual(ids(self._at({}, T0.replace(hour=7, minute=0))), [])
        self.assertEqual(ids(self._at({}, T0.replace(hour=12))), [])

    def test_since_is_the_start_of_the_night(self):
        out = self._at({}, T0.replace(hour=2))
        self.assertEqual(out[0]["since"], "2026-01-14T23:00:00Z")
        self.assertEqual(out[0]["level"], "sleep")
        self.assertEqual(out[0]["detail"], "quiet hours until 07:00")

    def test_timezone_is_honoured(self):
        raw = {"collector": {"timezone": "Asia/Tokyo"}}  # UTC+9
        # 15:00 UTC is midnight in Tokyo.
        self.assertEqual(ids(self._at(raw, T0.replace(hour=15))), ["night"])
        self.assertEqual(ids(self._at(raw, T0.replace(hour=23, minute=30))), [])

    def test_window_that_does_not_cross_midnight(self):
        raw = {"conditions": {"night": {"start": "01:00", "end": "05:00"}}}
        self.assertEqual(ids(self._at(raw, T0.replace(hour=3))), ["night"])
        self.assertEqual(ids(self._at(raw, T0.replace(hour=23))), [])


class PriorityTest(unittest.TestCase):
    READINGS: ClassVar[dict] = {
        "ssh": ssh(A),
        "wan": Reading({"up": False}),
        "host": host(disks=[{"mount": "/data", "pct": 95.0, "free_gb": 1}]),
    }

    def _evaluate(self, raw):
        """One poll with no sessions open, then one with a new session and the rest."""
        c = Conditions(make_config(raw))
        c.evaluate({"ssh": ssh()}, T0.replace(hour=11, minute=59, second=30))
        return c.evaluate(self.READINGS, T0.replace(hour=12))

    def test_default_order_is_the_design_table(self):
        out = self._evaluate({"conditions": {"wan_down": {"failed_checks": 1}}})
        self.assertEqual(ids(out), ["wan_down", "disk_full", "ssh_session"])

    def test_order_comes_from_config(self):
        raw = {
            "conditions": {
                "wan_down": {"failed_checks": 1},
                "priority": ["ssh_session", "disk_full", "wan_down"],
            }
        }
        out = self._evaluate(raw)
        self.assertEqual(ids(out), ["ssh_session", "disk_full", "wan_down"])

    def test_a_condition_left_out_is_never_raised(self):
        raw = {"conditions": {"wan_down": {"failed_checks": 1}, "priority": ["ssh_session"]}}
        out = self._evaluate(raw)
        self.assertEqual(ids(out), ["ssh_session"])


def device(name, kind="machine", **over):
    return {"name": name, "kind": kind, "host": "192.0.2.40", "port": 22, **over}


def answer(yes: bool) -> Reading:
    return Reading(None, {"answered": yes})


YES, NO = answer(True), answer(False)


class Devices(Harness):
    """A harness for devices: poll(Vault=NO, ...) by name, and the devices' facts."""

    def __init__(self, devices, raw=None, step=10):
        raw = dict(raw or {})
        raw["device"] = [
            {**t, "host": f"192.0.2.{40 + i}"} if "host" in t else t for i, t in enumerate(devices)
        ]
        super().__init__(raw, step)

    def poll(self, fresh=None, status=None, **answers):
        readings = {
            (k if k == "pi" else f"device:{k.replace('_', ' ')}"): v for k, v in answers.items()
        }
        status = {
            (k if k == "pi" else f"device:{k.replace('_', ' ')}"): v
            for k, v in (status or {}).items()
        }
        return super().poll(fresh, status, **readings)

    def facts(self, i=0) -> dict:
        return self.c.devices()["list"][i]


def down(out) -> dict | None:
    return next((c for c in out if c["id"] == "device_down"), None)


class DeviceDownTest(unittest.TestCase):
    def test_down_after_down_after_s_and_not_before(self):
        h = Devices([device("Vault")])
        h.poll(Vault=YES)  # 0 s: answers once
        self.assertEqual(
            h.facts(),
            {
                "name": "Vault",
                "kind": "machine",
                "state": "up",
                "alert": True,
                "seen": True,
                "since": "2026-01-15T21:00:00Z",
            },
        )
        for _ in range(18):  # 10 .. 180 s: silent since 10 s; up while silent for less than 180
            self.assertEqual(ids(h.poll(Vault=NO)), [])
            self.assertEqual(h.facts()["state"], "up")
        out = h.poll(Vault=NO)  # 190 s: silent for 180 s
        self.assertEqual(ids(out), ["device_down"])
        self.assertEqual(
            out[0],
            {
                "id": "device_down",
                "level": "warning",
                "since": "2026-01-15T21:00:10Z",
                "headline": "VAULT DOWN",
                "detail": "no answer for 3 min",
                "devices": [0],
            },
        )
        self.assertEqual(h.facts()["state"], "down")
        self.assertEqual(h.facts()["since"], "2026-01-15T21:00:10Z")
        self.assertEqual(down(h.poll(Vault=NO))["detail"], "no answer for 3 min")

    def test_one_answer_ends_the_silence(self):
        h = Devices([device("Vault")])
        for _ in range(17):  # 0 .. 160 s
            h.poll(Vault=NO)
        h.poll(Vault=YES)  # 170 s
        self.assertEqual((h.facts()["state"], h.facts()["since"]), ("up", "2026-01-15T21:02:50Z"))
        for _ in range(18):  # 180 .. 350 s: a new silence, from 180 s
            self.assertEqual(ids(h.poll(Vault=NO)), [])
        self.assertEqual(ids(h.poll(Vault=NO)), ["device_down"])  # 360 s

    def test_answering_again_clears_after_clear_after_s_and_the_prop_returns_at_once(self):
        h = Devices([device("Vault", every_s=10, down_after_s=10)])
        h.poll(Vault=YES)
        h.poll(Vault=NO)
        first = h.poll(Vault=NO)  # 20 s
        self.assertEqual(ids(first), ["device_down"])
        for _ in range(3):  # 30, 40, 50 s: held with its last words
            held = h.poll(Vault=YES)
            self.assertEqual(held[0]["headline"], "VAULT DOWN")
            self.assertEqual(ids(held), ["device_down"])
            self.assertEqual(held[0]["devices"], [0])
            self.assertEqual(h.facts()["state"], "up")
        self.assertEqual(ids(h.poll(Vault=YES)), [])  # 60 s: 30 s since it answered

    def test_a_device_that_never_answered(self):
        h = Devices([device("Vault")])
        for _ in range(18):  # 0 .. 170 s
            h.poll(Vault=NO)
            self.assertEqual(h.facts()["state"], "unknown")
            self.assertIsNone(h.facts()["since"])
        out = h.poll(Vault=NO)  # 180 s
        self.assertEqual(down(out)["headline"], "VAULT DOWN")
        self.assertEqual(down(out)["detail"], "not answered since the collector started 3 min ago")
        self.assertEqual(
            h.facts(),
            {
                "name": "Vault",
                "kind": "machine",
                "state": "down",
                "alert": True,
                "seen": False,
                "since": "2026-01-15T21:00:00Z",
            },
        )

    def test_unknown_until_the_first_check_finishes(self):
        h = Devices([device("Vault")])
        running = {
            "Vault": {
                "ok": False,
                "at": "2026-01-15T21:00:00Z",
                "error": "first read still running",
            }
        }
        for _ in range(30):
            self.assertEqual(ids(h.poll(status=running)), [])
        self.assertEqual(h.facts()["state"], "unknown")
        # Without a status at all, a missing reading is unknown too.
        self.assertEqual(ids(h.poll()), [])
        self.assertEqual(h.facts()["state"], "unknown")

    def test_a_check_that_ran_out_of_time_is_silence(self):
        for error in ("timed out", "previous read still running"):
            with self.subTest(error=error):
                h = Devices([device("Vault")])
                h.poll(Vault=YES)
                late = {"Vault": {"ok": False, "at": "2026-01-15T21:00:10Z", "error": error}}
                for _ in range(18):
                    self.assertEqual(ids(h.poll(status=late)), [])
                self.assertEqual(ids(h.poll(status=late)), ["device_down"])

    def test_the_word_is_the_kinds(self):
        for kind, name, headline in (
            ("machine", "Vault", "VAULT DOWN"),
            ("vm", "Buildbox", "BUILDBOX DOWN"),
            ("camera", "Gate cam", "GATE CAM DARK"),
            ("pi", "Pi", "PI SILENT"),
        ):
            with self.subTest(kind=kind):
                h = Devices([device(name, kind, every_s=10, down_after_s=10)])
                key = name.replace(" ", "_")
                h.poll(**{key: YES})
                h.poll(**{key: NO})
                out = h.poll(**{key: NO})
                self.assertEqual(
                    (down(out)["headline"], down(out)["detail"]), (headline, "no answer for 10 s")
                )
        # A kind the collector does not know, as a later configuration may give.
        h = Devices([device("Lantern", every_s=10, down_after_s=10)])
        h.c.watches[0].device["kind"] = "base/owl"
        h.poll(Lantern=NO)
        self.assertEqual(down(h.poll(Lantern=NO))["headline"], "LANTERN DOWN")

    def test_a_long_name_is_cut_in_the_headline_and_whole_in_the_detail(self):
        h = Devices([device("Gatehouse camera", "camera", every_s=60, down_after_s=600)])
        h.poll(Gatehouse_camera=YES)
        for _ in range(73):  # 10 .. 730 s
            out = h.poll(Gatehouse_camera=NO)
        self.assertEqual(down(out)["headline"], "GATEHOUSE… DARK")
        self.assertEqual(down(out)["detail"], "Gatehouse camera · no answer for 12 min")
        # Names at the limit of 20 characters, seen and unseen.
        for name in ("Abcdefghijklmnopqrst", "Back garden west cam"):
            h = Devices([device(name, "vm", every_s=10, down_after_s=10)])
            key = name.replace(" ", "_")
            for _ in range(3):
                out = h.poll(**{key: NO})
            c = down(out)
            self.assertEqual(len(c["headline"]), 16)
            self.assertTrue(c["headline"].endswith("… DOWN"))
            self.assertEqual(c["detail"], f"{name} · not answered in 20 s since start")
        # A name that just fits beside its word is not repeated.
        h = Devices([device("Kitchen cam", "camera", every_s=10, down_after_s=10)])
        for _ in range(3):
            out = h.poll(Kitchen_cam=NO)
        self.assertEqual(
            (down(out)["headline"], down(out)["detail"]),
            ("KITCHEN CAM DARK", "not answered since the collector started 20 s ago"),
        )

    def test_several_down_make_one_condition(self):
        h = Devices(
            [
                device("Vault"),
                device("Gate cam", "camera"),
                device("Buildbox", "vm"),
                device("Laptop", alert=False),
            ]
        )
        h.poll(Vault=YES, Gate_cam=YES, Buildbox=YES, Laptop=YES)  # 0 s
        h.poll(Vault=YES, Gate_cam=YES, Buildbox=NO, Laptop=NO)  # 10 s: Buildbox first
        h.poll(Vault=NO, Gate_cam=YES, Buildbox=NO, Laptop=NO)  # 20 s
        for _ in range(16):  # 30 .. 180 s
            out = h.poll(Vault=NO, Gate_cam=NO, Buildbox=NO, Laptop=NO)
        self.assertEqual(ids(out), [])
        out = h.poll(Vault=NO, Gate_cam=NO, Buildbox=NO, Laptop=NO)  # 190 s
        self.assertEqual(ids(out), ["device_down"])  # Buildbox alone, silent since 10 s
        self.assertEqual(down(out)["headline"], "BUILDBOX DOWN")
        for _ in range(2):  # 200, 210 s
            out = h.poll(Vault=NO, Gate_cam=NO, Buildbox=NO, Laptop=NO)
        self.assertEqual(ids(out), ["device_down"])
        c = down(out)
        self.assertEqual(
            (c["headline"], c["detail"], c["since"], c["devices"]),
            ("3 DOWN", "Buildbox, Vault, Gate cam", "2026-01-15T21:00:10Z", [2, 0, 1]),
        )
        self.assertEqual([h.facts(i)["state"] for i in range(4)], ["down"] * 4)
        # One comes back: the words change to the two that remain.
        out = h.poll(Vault=YES, Gate_cam=NO, Buildbox=NO, Laptop=NO)
        self.assertEqual(
            (down(out)["headline"], down(out)["detail"], down(out)["devices"]),
            ("2 DOWN", "Buildbox, Gate cam", [2, 1]),
        )
        # Then one: its own words, with its own silence.
        out = h.poll(Vault=YES, Gate_cam=YES, Buildbox=NO, Laptop=NO)
        self.assertEqual(
            (down(out)["headline"], down(out)["detail"], down(out)["devices"]),
            ("BUILDBOX DOWN", "no answer for 3 min", [2]),
        )

    def test_many_names_end_in_a_count(self):
        names = [f"Back garden cam {i}" for i in range(6)]
        h = Devices([device(n, "camera", every_s=10, down_after_s=10) for n in names])
        for _ in range(3):
            out = h.poll(**{n.replace(" ", "_"): NO for n in names})
        c = down(out)
        self.assertEqual(c["headline"], "6 DOWN")
        self.assertEqual(c["detail"], "Back garden cam 0, Back garden cam 1, Back garden cam 2 +3")
        self.assertEqual(c["devices"], [0, 1, 2, 3, 4, 5])

    def test_alert_false_raises_nothing(self):
        h = Devices([device("Laptop", alert=False)])
        h.poll(Laptop=YES)
        for _ in range(40):
            self.assertEqual(ids(h.poll(Laptop=NO)), [])
        self.assertEqual((h.facts()["state"], h.facts()["alert"]), ("down", False))

    def test_a_clock_that_goes_back_starts_the_silence_again(self):
        h = Devices([device("Vault")])
        h.poll(Vault=YES)  # 0 s
        for _ in range(10):  # 10 .. 100 s: silent since 10 s
            h.poll(Vault=NO)
        h.t -= 600  # the clock goes back ten minutes, to -490 s
        for _ in range(18):  # -490 .. -320 s: silent since -490 s
            self.assertEqual(ids(h.poll(Vault=NO)), [])
        out = h.poll(Vault=NO)  # -310 s: 180 s after the new start, not 780 s
        self.assertEqual(ids(out), ["device_down"])
        self.assertEqual(down(out)["detail"], "no answer for 3 min")

    def test_a_priority_list_orders_and_leaves_out_as_for_every_condition(self):
        raw = {"sources": {"pi": {"host": "192.0.2.4"}}, "conditions": {"pi_silent": {"for_s": 10}}}
        h = Devices([device("Vault", every_s=10, down_after_s=10)], raw)
        h.poll(pi=Reading({"up": False}, {"answered": False}), Vault=NO)
        out = h.poll(pi=Reading({"up": False}, {"answered": False}), Vault=NO)
        self.assertEqual(ids(out), ["pi_silent", "device_down"])
        # The Pi is at position 0 and raises pi_silent alone; Vault is at 1.
        self.assertEqual(down(out)["devices"], [1])
        self.assertEqual(h.c.devices()["list"][0]["name"], "Pi")
        raw["conditions"]["priority"] = ["pi_silent"]
        h = Devices([device("Vault", every_s=10, down_after_s=10, alert=False)], raw)
        for _ in range(3):
            out = h.poll(pi=Reading({"up": False}, {"answered": False}), Vault=NO)
        self.assertEqual(ids(out), ["pi_silent"])

    def test_no_devices_no_facts(self):
        self.assertIsNone(Harness().c.devices())


class PiAsADeviceTest(unittest.TestCase):
    """The Pi of [sources.pi]: pi_silent as before, and its place in facts.devices."""

    RAW: ClassVar[dict] = {"sources": {"pi": {"host": "192.0.2.4"}}}

    def test_pi_silent_and_the_pies_state(self):
        h = Harness(self.RAW)
        h.poll(pi=Reading({"up": True}))
        pi = h.c.devices()["list"][0]
        self.assertEqual(
            pi,
            {
                "name": "Pi",
                "kind": "pi",
                "state": "up",
                "alert": True,
                "seen": True,
                "since": "2026-01-15T21:00:00Z",
            },
        )
        for _ in range(18):  # 10 .. 180 s
            out = h.poll(pi=Reading({"up": False}))
            # Silent, but not yet judged down: the dish keeps its pie for a new page.
            self.assertEqual(h.c.devices()["list"][0]["state"], "up")
            self.assertEqual(ids(out), [])
        out = h.poll(pi=Reading({"up": False}))  # 190 s
        self.assertEqual(out[0]["headline"], "PI SILENT")
        self.assertNotIn("devices", out[0])
        self.assertEqual(h.c.devices()["list"][0]["state"], "down")

    def test_a_pi_read_that_ran_out_of_time_is_silence(self):
        # A deliberate change: it used to count as the cause being absent.
        h = Harness(self.RAW)
        h.poll(pi=Reading({"up": True}))
        late = {"pi": {"ok": False, "at": "2026-01-15T21:00:10Z", "error": "timed out"}}
        for _ in range(18):
            self.assertEqual(ids(h.poll(status=late)), [])
        self.assertEqual(ids(h.poll(status=late)), ["pi_silent"])

    def test_the_pi_never_raises_device_down(self):
        h = Harness({**self.RAW, "conditions": {"pi_silent": {"for_s": 0}}})
        out = h.poll(pi=Reading({"up": False}))
        self.assertEqual(ids(out), ["pi_silent"])


class TextLimitTest(unittest.TestCase):
    def test_every_detail_fits(self):
        h = Harness({"conditions": {"container_unhealthy": {"for_s": 0}}})
        bad = {
            f"container-number-{i}": {"kind": "unhealthy", "status": "Up (unhealthy)"}
            for i in range(10)
        }
        many = [(f"198.51.100.{i}", 51000 + i) for i in range(20)]
        h.poll(ssh=ssh())
        out = h.poll(
            containers=containers(bad),
            ssh=ssh(*many),
            streams=Reading({"count": 1, "titles": ["An Extremely Long Title " * 5]}),
        )
        for c in out:
            self.assertLessEqual(len(c["headline"]), 16)
            self.assertLessEqual(len(c["detail"]), 60)
        self.assertTrue(out[0]["detail"].endswith("…"))


class StreamWordsTest(unittest.TestCase):
    """The words for streaming in each of the setting show's modes, and the words held through
    its clearing period after the setting changes."""

    KEY: ClassVar[dict] = {"KNIGHTWATCHER_TAUTULLI_API_KEY": "tk-example"}
    FACTS: ClassVar[dict] = {
        "count": 3,
        "titles": ["The Lantern Keepers S01E03", "Harbour of Glass", "Fen Owls - Low Tide"],
        "sessions": [
            {"who": "Robin", "title": "The Lantern Keepers S01E03"},
            {"who": "Sam", "title": "Harbour of Glass"},
            {"who": "Alex", "title": "Fen Owls - Low Tide"},
        ],
    }

    def config(self, show):
        streams = {"url": "http://192.0.2.20:8181", "show": show}
        return make_config({"sources": {"streams": streams}}, self.KEY)

    def detail(self, facts):
        c = Conditions(self.config("names"))
        return c.evaluate({"streams": Reading(facts)}, T0)[0]["detail"]

    def test_names_titles_and_count(self):
        self.assertEqual(self.detail(self.FACTS), "Robin · The Lantern Keepers S01E03 · 1 of 3")
        self.assertEqual(
            self.detail(streams_source.shown(self.FACTS, "titles")),
            "The Lantern Keepers S01E03 · 1 of 3",
        )
        self.assertEqual(self.detail(streams_source.shown(self.FACTS, "count")), "3 streams")
        one = {"count": 1, "titles": ["Harbour of Glass"], "sessions": [self.FACTS["sessions"][1]]}
        self.assertEqual(self.detail(one), "Sam · Harbour of Glass")
        self.assertEqual(self.detail(streams_source.shown(one, "titles")), "Harbour of Glass")
        self.assertEqual(self.detail(streams_source.shown(one, "count")), "1 stream")
        # streams with neither name nor title are counted
        self.assertEqual(self.detail({"count": 2, "titles": []}), "2 streams")

    def test_held_words_follow_a_change_of_the_setting(self):
        c = Conditions(self.config("names"))
        out = c.evaluate({"streams": Reading(self.FACTS)}, T0)
        self.assertEqual(out[0]["detail"], "Robin · The Lantern Keepers S01E03 · 1 of 3")
        # the source restarts on the change and has no reading yet: the words are held
        c.reconfigure(self.config("titles"))
        out = c.evaluate({}, at(10))
        self.assertEqual(ids(out), ["streaming"])
        self.assertEqual(out[0]["detail"], "The Lantern Keepers S01E03 · 1 of 3")
        c.reconfigure(self.config("count"))
        out = c.evaluate({}, at(20))
        self.assertEqual(out[0]["detail"], "3 streams")
        # the source turned off: the held words keep only the count
        c = Conditions(self.config("names"))
        c.evaluate({"streams": Reading(self.FACTS)}, T0)
        c.reconfigure(make_config({}, self.KEY))
        self.assertEqual(c.evaluate({}, at(10))[0]["detail"], "3 streams")
        self.assertEqual(ids(c.evaluate({}, at(40))), [])


if __name__ == "__main__":
    unittest.main()
