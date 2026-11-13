import datetime as dt
import unittest
from typing import ClassVar

from collector.conditions import Conditions
from collector.sources import Reading
from kw_helpers import T0, at, make_config


def host(cpu=10.0, avail=50.0, disks=None, load1=1.0):
    facts = {
        "cpu_pct": cpu,
        "load1": load1,
        "cores": 4,
        "mem_pct": 100 - avail,
        "swap_pct": 99.0,
        "disks": disks or [],
    }
    return Reading(facts, {"mem_available_pct": avail})


def containers(bad=None):
    bad = bad or {}
    facts = {"total": 5, "running": 5, "unhealthy": [], "restarting": [], "failed": []}
    for name, info in bad.items():
        facts[info["kind"]].append(name)
    return Reading(facts, {"bad": bad})


def security(jail_ban=False, in_window=0, jail="sshd", ip="203.0.113.77"):
    facts = {"threat_score": 1, "bans_24h": 3, "attack": False}
    data = {
        "bans_in_window": in_window,
        "jail_ban": jail_ban,
        "last_ban": {"ip": ip, "jail": jail, "time": T0},
    }
    return Reading(facts, data)


def ids(out):
    return [c["id"] for c in out]


class Harness:
    """Feeds a Conditions engine one poll at a time, 30 s apart."""

    def __init__(self, raw=None):
        self.c = Conditions(make_config(raw))
        self.t = 0

    def poll(self, **readings):
        out = self.c.evaluate(readings, at(self.t))
        self.t += 30
        return out


class SustainTest(unittest.TestCase):
    def test_cpu_hot_needs_five_minutes(self):
        h = Harness()
        for _ in range(10):  # 0 .. 270 s
            self.assertEqual(ids(h.poll(host=host(cpu=90))), [])
        out = h.poll(host=host(cpu=90))  # 300 s
        self.assertEqual(ids(out), ["cpu_hot"])
        self.assertEqual(out[0]["level"], "warning")
        self.assertEqual(out[0]["since"], "2026-01-15T21:00:00Z")
        self.assertEqual(out[0]["headline"], "CPU HOT")
        self.assertEqual(out[0]["detail"], "90% for 5 min · load 1.0")

    def test_a_spike_resets_the_timer(self):
        h = Harness()
        for _ in range(9):
            h.poll(host=host(cpu=90))
        h.poll(host=host(cpu=20))
        for _ in range(9):
            self.assertEqual(ids(h.poll(host=host(cpu=90))), [])

    def test_clears_only_after_one_further_interval(self):
        h = Harness({"conditions": {"cpu_hot": {"for_s": 0}}})
        self.assertEqual(ids(h.poll(host=host(cpu=90))), ["cpu_hot"])
        held = h.poll(host=host(cpu=10))
        self.assertEqual(ids(held), ["cpu_hot"])
        self.assertEqual(held[0]["detail"].split(" ")[0], "90%")  # last words stand
        self.assertEqual(ids(h.poll(host=host(cpu=10))), [])

    def test_returning_cause_during_the_hold_keeps_it_active(self):
        h = Harness({"conditions": {"cpu_hot": {"for_s": 0}}})
        first = h.poll(host=host(cpu=90))
        h.poll(host=host(cpu=10))
        again = h.poll(host=host(cpu=95))
        self.assertEqual(again[0]["since"], first[0]["since"])

    def test_a_failed_source_counts_as_absent(self):
        h = Harness({"conditions": {"cpu_hot": {"for_s": 0}}})
        h.poll(host=host(cpu=90))
        h.poll(host=None)
        self.assertEqual(ids(h.poll(host=None)), [])


class EachConditionTest(unittest.TestCase):
    def test_memory_tight_judges_available_memory_not_swap(self):
        h = Harness({"conditions": {"memory_tight": {"for_s": 0}}})
        # Swap is 99 % full in every reading; only MemAvailable matters.
        self.assertEqual(ids(h.poll(host=host(avail=40))), [])
        out = h.poll(host=host(avail=8))
        self.assertEqual(ids(out), ["memory_tight"])
        self.assertEqual(out[0]["detail"], "8% available for 0 s")

    def test_memory_tight_waits_five_minutes_by_default(self):
        h = Harness()
        for _ in range(10):
            self.assertEqual(ids(h.poll(host=host(avail=5))), [])
        self.assertEqual(ids(h.poll(host=host(avail=5))), ["memory_tight"])

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
        h = Harness()
        for _ in range(6):
            self.assertEqual(ids(h.poll(pi=Reading({"up": False}))), [])
        out = h.poll(pi=Reading({"up": False}))
        self.assertEqual(ids(out), ["pi_silent"])
        self.assertEqual(out[0]["detail"], "no answer for 3 min")

    def test_wan_down_after_two_failed_checks(self):
        h = Harness()
        self.assertEqual(ids(h.poll(wan=Reading({"up": False}))), [])
        out = h.poll(wan=Reading({"up": False}))
        self.assertEqual(ids(out), ["wan_down"])
        self.assertEqual(out[0]["level"], "critical")

    def test_one_failed_wan_check_is_not_enough(self):
        h = Harness()
        h.poll(wan=Reading({"up": False}))
        self.assertEqual(ids(h.poll(wan=Reading({"up": True}))), [])
        self.assertEqual(ids(h.poll(wan=Reading({"up": False}))), [])

    def test_container_unhealthy_after_three_minutes_per_container(self):
        h = Harness()
        sick = {"radarr": {"kind": "unhealthy", "status": "Up 2 days (unhealthy)"}}
        for _ in range(6):
            self.assertEqual(ids(h.poll(containers=containers(sick))), [])
        out = h.poll(containers=containers(sick))
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
        for _ in range(5):
            h.poll(containers=containers(sick))
        h.poll(containers=containers({}))
        for _ in range(6):
            self.assertEqual(ids(h.poll(containers=containers(sick))), [])

    def test_ssh_updating_streaming(self):
        h = Harness()
        out = h.poll(
            ssh=Reading({"count": 1, "sources": ["192.0.2.10"]}),
            updates=Reading({"running": True, "what": "nightly maintenance"}),
            streams=Reading({"count": 1, "titles": ["The Night Shift S02E04"]}),
        )
        self.assertEqual(ids(out), ["ssh_session", "updating", "streaming"])
        self.assertEqual(out[0]["detail"], "1 ssh session from 192.0.2.10")
        self.assertEqual(out[0]["level"], "work")
        self.assertEqual(out[1]["detail"], "nightly maintenance running for 0 s")
        self.assertEqual(out[2]["detail"], "The Night Shift S02E04")
        self.assertEqual(out[2]["level"], "quiet")

    def test_two_streams(self):
        h = Harness()
        out = h.poll(streams=Reading({"count": 2, "titles": ["A Film", "B Show S01E01"]}))
        self.assertEqual(out[0]["detail"], "2 streams · A Film")

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
        "ssh": Reading({"count": 1, "sources": []}),
        "wan": Reading({"up": False}),
        "host": host(disks=[{"mount": "/data", "pct": 95.0, "free_gb": 1}]),
    }

    def test_default_order_is_the_design_table(self):
        c = Conditions(make_config({"conditions": {"wan_down": {"failed_checks": 1}}}))
        out = c.evaluate(self.READINGS, T0.replace(hour=12))
        self.assertEqual(ids(out), ["wan_down", "disk_full", "ssh_session"])

    def test_order_comes_from_config(self):
        raw = {
            "conditions": {
                "wan_down": {"failed_checks": 1},
                "priority": ["ssh_session", "disk_full", "wan_down"],
            }
        }
        out = Conditions(make_config(raw)).evaluate(self.READINGS, T0.replace(hour=12))
        self.assertEqual(ids(out), ["ssh_session", "disk_full", "wan_down"])

    def test_a_condition_left_out_is_never_raised(self):
        raw = {"conditions": {"wan_down": {"failed_checks": 1}, "priority": ["ssh_session"]}}
        out = Conditions(make_config(raw)).evaluate(self.READINGS, T0.replace(hour=12))
        self.assertEqual(ids(out), ["ssh_session"])


class TextLimitTest(unittest.TestCase):
    def test_every_detail_fits(self):
        h = Harness({"conditions": {"container_unhealthy": {"for_s": 0}}})
        bad = {
            f"container-number-{i}": {"kind": "unhealthy", "status": "Up (unhealthy)"}
            for i in range(10)
        }
        many = [f"198.51.100.{i}" for i in range(20)]
        out = h.poll(
            containers=containers(bad),
            ssh=Reading({"count": 20, "sources": many}),
            streams=Reading({"count": 1, "titles": ["An Extremely Long Title " * 5]}),
        )
        for c in out:
            self.assertLessEqual(len(c["headline"]), 16)
            self.assertLessEqual(len(c["detail"]), 60)
        self.assertTrue(out[0]["detail"].endswith("…"))


if __name__ == "__main__":
    unittest.main()
