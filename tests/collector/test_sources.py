import datetime as dt
import os
import re
import socket
import tempfile
import threading
import unittest
from unittest import mock

from collector.net import AuthError, SourceError, dns_query
from collector.sources import Reading, build_sources
from collector.sources.adblock import AdblockSource, blocked_since_midnight, normal_rate
from collector.sources.backup import BackupSource, parse_when
from collector.sources.containers import ContainersSource, classify, ignored
from collector.sources.dns import DnsSource
from collector.sources.host import HostSource, Sample, cpu_average, mem_average
from collector.sources.imports import RadarrSource, SonarrSource
from collector.sources.security import SecuritySource
from collector.sources.ssh import SshSource, decode_address
from collector.sources.streams import StreamsSource, title_of
from collector.sources.updates import UpdatesSource
from collector.sources.wan import WanSource
from kw_helpers import T0, FakeHttp, FakeProc, at, closed_port, make_config

# The credentials the sources log in with, as the environment holds them.
SECRETS = {
    "KNIGHTWATCHER_ADGUARD_USERNAME": "kw",
    "KNIGHTWATCHER_ADGUARD_PASSWORD": "pw-example",
    "KNIGHTWATCHER_TAUTULLI_API_KEY": "tk-example",
    "KNIGHTWATCHER_SONARR_API_KEY": "sk-example",
    "KNIGHTWATCHER_RADARR_API_KEY": "rk-example",
}


def source(cls, name, settings, raw=None):
    raw = dict(raw or {})
    raw.setdefault("sources", {})[name] = settings
    config = make_config(raw, SECRETS)
    return cls(config.sources[name], config)


class HostTest(unittest.TestCase):
    def setUp(self):
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.disk = tempfile.TemporaryDirectory()
        self.addCleanup(self.disk.cleanup)

    def make(self):
        raw = {"collector": {"proc_root": self.proc.root}}
        disks = [{"mount": "/data", "path": self.disk.name}]
        return source(HostSource, "host", {"disks": disks}, raw)

    def test_reads_cpu_memory_swap_load_and_disk(self):
        s = self.make()
        s.history.append(Sample(at(-10), 0, 0, 25.0))  # an earlier sample: no first-read pause
        self.proc.set_stat(busy=600, idle=400, cores=12)
        self.proc.set_meminfo(total_kb=1000, available_kb=250, swap_total=100, swap_free=10)
        r = s.fetch(T0)
        self.assertEqual(r.facts["cpu_pct"], 60.0)
        self.assertEqual(r.facts["cores"], 12)
        self.assertEqual(r.facts["load1"], 1.5)
        self.assertEqual(r.facts["mem_pct"], 75.0)
        self.assertEqual(r.facts["swap_pct"], 90.0)
        self.assertEqual(r.data["mem_available_pct"], 25.0)
        self.assertEqual(r.data["mem_available_avg"], 25.0)
        self.assertEqual(r.data["cpu_span_s"], 10.0)
        disk = r.facts["disks"][0]
        self.assertEqual(disk["mount"], "/data")
        self.assertTrue(0 <= disk["pct"] <= 100)
        self.assertIsInstance(disk["free_gb"], int)

    def test_cpu_is_the_change_over_the_window(self):
        s = self.make()
        s.history.append(Sample(at(-10), 0, 0, 50.0))
        self.proc.set_stat(busy=100, idle=900)
        s.fetch(T0)
        self.proc.set_stat(busy=190, idle=910)  # 90 busy of 100 since the last read
        r = s.fetch(at(10))
        # The window reaches back to the sample at -10 s: 190 busy of 1100.
        self.assertEqual(r.facts["cpu_pct"], 17.3)
        self.assertEqual(r.data["cpu_span_s"], 20.0)

    def test_the_window_average_is_exact_when_samples_are_uneven(self):
        # One core at 100 jiffies a second: 5 s fully busy, then 25 s idle.
        history = [
            Sample(T0, 0, 0, 50.0),
            Sample(at(5), 500, 500, 10.0),
            Sample(at(30), 500, 3000, 40.0),
        ]
        pct, span = cpu_average(history, at(30), 30)
        # The mean of the two intervals' percentages would be 50; the time is 5 s in 30.
        self.assertEqual((pct, span), (16.7, 30.0))
        mem, span = mem_average(history, at(30), 30)
        # 10 % for 5 s and 40 % for 25 s, not the plain mean of 25 %.
        self.assertEqual((mem, span), (35.0, 30.0))

    def test_the_window_starts_at_the_oldest_sample_inside_it(self):
        history = [Sample(at(t), t * 50, t * 100, 50.0) for t in range(0, 50, 10)]
        # At 40 s a 30 s window starts at the 10 s sample, not at 0 s.
        self.assertEqual(cpu_average(history, at(40), 30), (50.0, 30.0))
        # A poll a little late still finds the sample 30 s back.
        late = [*history[:-1], Sample(at(40.4), 2020, 4040, 50.0)]
        self.assertEqual(cpu_average(late, at(40.4), 30)[1], 30.4)

    def test_a_window_shorter_than_the_reads_uses_the_previous_read(self):
        history = [Sample(T0, 0, 0, 50.0), Sample(at(60), 3000, 6000, 20.0)]
        self.assertEqual(cpu_average(history, at(60), 30), (50.0, 60.0))
        self.assertEqual(mem_average(history, at(60), 30), (20.0, 60.0))

    def test_history_is_kept_for_the_larger_window_and_one_read(self):
        raw = {
            "collector": {"proc_root": self.proc.root},
            "conditions": {"memory_tight": {"window_s": 60}},
        }
        s = source(HostSource, "host", {}, raw)
        self.assertEqual(s.keep_s, 60 + 10 + 1)
        s.history.append(Sample(at(-10), 0, 0, 50.0))
        for t in range(0, 200, 10):
            s.fetch(at(t))
        self.assertEqual(s.history[0].at, at(190 - 70))
        self.assertEqual(len(s.history), 8)

    def test_the_first_read_takes_a_short_sample(self):
        s = self.make()
        with mock.patch("collector.sources.host.time.sleep") as sleep:
            r = s.fetch(T0)
        sleep.assert_called_once_with(0.5)
        self.assertEqual(r.data["cpu_span_s"], 0.5)
        self.assertEqual([x.at for x in s.history], [at(-0.5), T0])
        self.assertIsNone(s.history[0].avail_pct)

    def test_a_clock_that_goes_back_starts_the_history_again(self):
        s = self.make()
        s.history.append(Sample(at(100), 0, 0, 50.0))
        with mock.patch("collector.sources.host.time.sleep"):
            s.fetch(T0)
        self.assertEqual([x.at for x in s.history], [at(-0.5), T0])

    def test_a_failed_read_records_no_sample(self):
        s = self.make()
        s.history.append(Sample(at(-10), 0, 0, 50.0))
        os.unlink(os.path.join(self.proc.root, "meminfo"))
        with self.assertRaises(SourceError):
            s.fetch(T0)
        self.assertEqual(len(s.history), 1)

    def test_missing_proc_is_a_source_error(self):
        s = self.make()
        s.proc = os.path.join(self.proc.root, "absent")
        with self.assertRaises(SourceError):
            s.fetch(T0)


class ContainersTest(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(classify("running", "Up 4 days (healthy)"), "ok")
        self.assertEqual(classify("running", "Up 4 days"), "ok")
        self.assertEqual(classify("running", "Up 1 hour (health: starting)"), "ok")
        self.assertEqual(classify("running", "Up 2 days (unhealthy)"), "unhealthy")
        self.assertEqual(classify("restarting", "Restarting (1) 5 seconds ago"), "restarting")
        self.assertEqual(classify("exited", "Exited (1) 3 minutes ago"), "failed")
        self.assertEqual(classify("exited", "Exited (0) 3 minutes ago"), "ok")
        self.assertEqual(classify("dead", "Dead"), "failed")
        self.assertEqual(classify("created", "Created"), "ok")

    def test_ignore_patterns(self):
        self.assertTrue(ignored("ci-runner-7f3a", ["ci-runner-*"]))
        self.assertFalse(ignored("radarr", ["ci-runner-*"]))

    def test_fetch_through_the_proxy(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/containers/json"] = (
            200,
            [
                {"Names": ["/radarr"], "State": "running", "Status": "Up 2 days (unhealthy)"},
                {"Names": ["/sonarr"], "State": "running", "Status": "Up 2 days"},
                {"Names": ["/bazarr"], "State": "exited", "Status": "Exited (137) 1 hour ago"},
                {"Names": ["/oneoff-run-1"], "State": "exited", "Status": "Exited (2) now"},
            ],
        )
        s = source(ContainersSource, "containers", {"url": http.url, "ignore": ["*-run-*"]})
        r = s.fetch(T0)
        self.assertEqual(
            r.facts,
            {
                "total": 3,
                "running": 2,
                "unhealthy": ["radarr"],
                "restarting": [],
                "failed": ["bazarr"],
            },
        )
        self.assertEqual(set(r.data["bad"]), {"radarr", "bazarr"})
        self.assertEqual(http.requests[0][0], "/containers/json?all=1")

    def test_proxy_down_is_a_source_error(self):
        s = source(ContainersSource, "containers", {"url": "http://127.0.0.1:9"})
        with self.assertRaises(SourceError):
            s.fetch(T0)


class WanDnsPiTest(unittest.TestCase):
    def test_wan_up_when_any_url_answers(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/trace"] = (200, b"ok")
        s = source(WanSource, "wan", {"urls": ["http://127.0.0.1:9/x", http.url + "/trace"]})
        self.assertEqual(s.fetch(T0).facts, {"up": True})

    def test_wan_down_is_a_fact_not_a_failure(self):
        s = source(WanSource, "wan", {"urls": ["http://127.0.0.1:9/x"]})
        r = s.fetch(T0)
        self.assertEqual(r.facts, {"up": False})

    def _dns_server(self, rcode=0):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("127.0.0.1", 0))
        self.addCleanup(sock.close)

        def answer():
            data, addr = sock.recvfrom(512)
            flags = 0x8180 | rcode
            sock.sendto(data[:2] + flags.to_bytes(2, "big") + data[4:], addr)

        threading.Thread(target=answer, daemon=True).start()
        return sock.getsockname()[1]

    def test_dns_query_round_trip(self):
        port = self._dns_server()
        self.assertEqual(dns_query("127.0.0.1", port, "example.com", 2), 0)

    def test_dns_source_up_and_down(self):
        port = self._dns_server()
        s = source(DnsSource, "dns", {"server": "127.0.0.1", "port": port})
        self.assertEqual(s.fetch(T0).facts, {"up": True})
        closed = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        closed.bind(("127.0.0.1", 0))
        dead_port = closed.getsockname()[1]
        closed.close()
        s = source(DnsSource, "dns", {"server": "127.0.0.1", "port": dead_port})
        s.timeout = 0.5
        self.assertEqual(s.fetch(T0).facts, {"up": False})

    def _pi(self, host, ports):
        config = make_config({"sources": {"pi": {"host": host, "ports": ports}}})
        (pi,) = build_sources(config)
        pi.timeout = 0.3
        return pi

    def test_the_pi_counts_a_refusal_as_an_answer(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        self.addCleanup(listener.close)
        open_port = listener.getsockname()[1]
        pi = self._pi("127.0.0.1", [open_port])
        self.assertEqual((pi.name, pi.section), ("pi", "pi"))
        self.assertEqual(pi.fetch(T0).facts, {"up": True})
        self.assertEqual(self._pi("127.0.0.1", [closed_port()]).fetch(T0).facts, {"up": True})

    def test_pi_unreachable(self):
        # 192.0.2.0/24 is reserved for documentation and is not routed.
        reading = self._pi("192.0.2.4", [22]).fetch(T0)
        self.assertEqual(reading.facts, {"up": False})
        self.assertEqual(reading.data, {"answered": False})


class SshTest(unittest.TestCase):
    def setUp(self):
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)

    def test_decode_addresses(self):
        self.assertEqual(decode_address("0A0200C0"), "192.0.2.10")
        self.assertEqual(
            decode_address("0000000000000000FFFF00000A0200C0"), "192.0.2.10"
        )  # IPv4-mapped IPv6
        self.assertEqual(decode_address("B80D0120000000000000000001000000"), "2001:db8::1")

    def test_counts_established_connections_to_the_port(self):
        rows = [
            # local 0.0.0.0:22 listening
            "   0: 00000000:0016 00000000:0000 0A 0 0 0\n",
            # 192.0.2.10:51000 -> :22 established
            "   1: 0300000A:0016 0A0200C0:C738 01 0 0 0\n",
            # 198.51.100.7 -> :22 established
            "   2: 0300000A:0016 076433C6:C739 01 0 0 0\n",
            # an outgoing connection to someone else's :22 is not ours
            "   3: 0300000A:C73A 0A0200C0:0016 01 0 0 0\n",
            # established on another port
            "   4: 0300000A:01BB 0A0200C0:C73B 01 0 0 0\n",
        ]
        self.proc.write("net/tcp", FakeProc.TCP_HEADER + "".join(rows))
        raw = {"collector": {"proc_root": self.proc.root}}
        s = source(SshSource, "ssh", {"port": 22}, raw)
        r = s.fetch(T0)
        self.assertEqual(r.facts, {"count": 2, "sources": ["192.0.2.10", "198.51.100.7"]})
        self.assertEqual(r.data, {"conns": [["192.0.2.10", 51000], ["198.51.100.7", 51001]]})
        s = source(SshSource, "ssh", {"port": 22, "ignore_sources": ["198.51.100.0/24"]}, raw)
        r = s.fetch(T0)
        self.assertEqual(r.facts, {"count": 1, "sources": ["192.0.2.10"]})
        self.assertEqual(r.data, {"conns": [["192.0.2.10", 51000]]})

    def test_two_sessions_from_one_address(self):
        rows = [
            "   0: 0300000A:0016 0A0200C0:C738 01 0 0 0\n",
            "   1: 0300000A:0016 0A0200C0:C740 01 0 0 0\n",
        ]
        self.proc.write("net/tcp", FakeProc.TCP_HEADER + "".join(rows))
        tcp6 = "   0: 0000000000000000FFFF0000057100CB:0016 B80D0120000000000000000001000000:C741"
        self.proc.write("net/tcp6", FakeProc.TCP_HEADER + tcp6 + " 01 0 0 0\n")
        raw = {"collector": {"proc_root": self.proc.root}}
        r = source(SshSource, "ssh", {"port": 22}, raw).fetch(T0)
        self.assertEqual(r.facts, {"count": 3, "sources": ["192.0.2.10", "2001:db8::1"]})
        self.assertEqual(
            r.data,
            {"conns": [["192.0.2.10", 51000], ["192.0.2.10", 51008], ["2001:db8::1", 51009]]},
        )


class UpdatesTest(unittest.TestCase):
    def setUp(self):
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.raw = {"collector": {"proc_root": self.proc.root}}
        self.settings = {
            "holders": [
                {"name": "nightly maintenance", "pattern": r"(^|/)maintenance\.sh"},
                {"name": "image updates", "pattern": r"update-images\.sh"},
            ]
        }

    def test_running_while_a_matching_process_holds_a_lock(self):
        self.proc.write(
            "locks",
            "1: FLOCK  ADVISORY  WRITE 4242 00:28:1234 0 EOF\n"
            "2: -> FLOCK  ADVISORY  WRITE 4343 00:28:1234 0 EOF\n"
            "3: POSIX  ADVISORY  WRITE 99 08:01:77 0 EOF\n"
            "4: OFDLCK ADVISORY  READ  -1 08:01:78 0 EOF\n",
        )
        self.proc.write("4242/cmdline", "/bin/bash\0/opt/scripts/maintenance.sh\0")
        self.proc.write("4343/cmdline", "/bin/bash\0/opt/scripts/update-images.sh\0")
        self.proc.write("99/cmdline", "/usr/sbin/cron\0-f\0")
        s = source(UpdatesSource, "updates", self.settings, self.raw)
        # 4343 is waiting for the lock, not holding it.
        self.assertEqual(s.fetch(T0).facts, {"running": True, "what": "nightly maintenance"})

    def test_idle_when_no_holder_matches(self):
        self.proc.write("locks", "1: FLOCK  ADVISORY  WRITE 99 08:01:77 0 EOF\n")
        self.proc.write("99/cmdline", "/bin/bash\0/opt/scripts/other-maintenance.sh\0")
        s = source(UpdatesSource, "updates", self.settings, self.raw)
        self.assertEqual(s.fetch(T0).facts, {"running": False, "what": ""})

    def test_vanished_process_is_skipped(self):
        self.proc.write("locks", "1: FLOCK  ADVISORY  WRITE 5555 08:01:77 0 EOF\n")
        s = source(UpdatesSource, "updates", self.settings, self.raw)
        self.assertEqual(s.fetch(T0).facts["running"], False)


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.log = os.path.join(self.tmp.name, "backup.log")

    def write(self, content):
        with open(self.log, "w", encoding="utf-8") as fh:
            fh.write(content)

    def make(self):
        return source(
            BackupSource,
            "backup",
            {"log": self.log, "pattern": r"Backup completed: (.+)$"},
        )

    def test_parse_when_forms(self):
        utc = dt.UTC
        want = dt.datetime(2026, 1, 8, 3, 1, 59, tzinfo=utc)
        self.assertEqual(parse_when("Thu  8 Jan 03:01:59 UTC 2026", utc), want)
        self.assertEqual(parse_when("Thu Jan  8 03:01:59 UTC 2026", utc), want)
        self.assertEqual(parse_when("2026-01-08T03:01:59Z", utc), want)
        self.assertEqual(parse_when("2026-01-08 03:01:59", utc), want)
        self.assertEqual(parse_when("Thu 8 Jan 04:01:59 +0100 2026", utc), want)
        with self.assertRaises(SourceError):
            parse_when("yesterday", utc)

    def test_first_start_records_without_an_event(self):
        self.write("Backup started\nBackup completed: Wed 14 Jan 03:00:00 UTC 2026\n")
        s = self.make()
        memory = {}
        r = s.fetch(T0)
        self.assertEqual(s.observe(r, memory, T0), [])
        self.assertEqual(r.facts["last_ok"], "2026-01-14T03:00:00Z")
        self.assertEqual(r.facts["age_h"], 42.0)

    def test_new_completion_is_an_event(self):
        s = self.make()
        memory = {"last_ok": "2026-01-14T03:00:00Z"}
        self.write(
            "Backup completed: Wed 14 Jan 03:00:00 UTC 2026\n"
            "Backup completed: Thu 15 Jan 03:12:00 UTC 2026\n"
        )
        events = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual(events, [{"type": "backup_done", "count": 1, "text": "BACKUP DONE 03:12"}])
        self.assertEqual(memory["last_ok"], "2026-01-15T03:12:00Z")
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])

    def test_truncated_log_falls_back_to_memory(self):
        self.write("")
        s = self.make()
        memory = {"last_ok": "2026-01-15T03:12:00Z"}
        r = s.fetch(T0)
        self.assertEqual(s.observe(r, memory, T0), [])
        self.assertEqual(r.facts["last_ok"], "2026-01-15T03:12:00Z")

    def test_nothing_known(self):
        self.write("Backup started\n")
        s = self.make()
        r = s.fetch(T0)
        s.observe(r, {}, T0)
        self.assertEqual(r.facts, {"last_ok": None, "age_h": None})

    def test_missing_log_is_a_source_error(self):
        s = self.make()
        with self.assertRaises(SourceError):
            s.fetch(T0)


class AdblockTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.stats = {"num_blocked_filtering": 4800}
        self.http.routes["/control/stats"] = (200, lambda _h: self.stats)

    def make(self, raw=None, **settings):
        return source(AdblockSource, "adblock", {"url": self.http.url, **settings}, raw)

    def poll(self, s, memory, total, when=T0):
        self.stats["num_blocked_filtering"] = total
        r = s.fetch(when)
        return s.observe(r, memory, when), r.facts["blocked_today"]

    def reading(self, total, rate=0.25, seed=0):
        return Reading({"blocked_today": seed}, {"blocked": total, "rate": rate, "seed": seed})

    def observe(self, s, memory, total, rate=0.25):
        # At 0.25 blocked a second, a fly every 300 seconds stands for 75 blocked queries.
        return s.observe(self.reading(total, rate), memory, T0)

    def flies(self, events):
        self.assertLessEqual(len(events), 1)
        return events[0]["count"] if events else 0

    def window(self):
        # Two days with queries at the end of a 90-day window: 43,200 blocked over 172,800
        # seconds is 0.25 a second. Today so far is the last day's 120.
        self.stats.update(
            {
                "time_units": "days",
                "dns_queries": [0] * 88 + [900, 300],
                "blocked_filtering": [0] * 88 + [400, 120],
                "num_blocked_filtering": 43200,
            }
        )

    def test_rate_from_days(self):
        self.window()
        self.assertEqual(self.make().fetch(T0).data["rate"], 0.25)
        self.assertEqual(normal_rate(self.stats, 43200), 0.25)

    def test_rate_from_hours(self):
        stats = {"time_units": "hours", "dns_queries": [10] * 24}
        self.assertEqual(normal_rate(stats, 21600), 0.25)

    def test_leading_empty_units_are_left_out_of_the_window(self):
        stats = {"time_units": "hours", "dns_queries": [0] * 20 + [0, 3, 0, 8]}
        self.assertEqual(normal_rate(stats, 2700), 0.25)  # three hours, not 24

    def test_unknown_rate(self):
        for stats in (
            {},
            {"time_units": "days"},
            {"time_units": "days", "dns_queries": []},
            {"time_units": "days", "dns_queries": [0, 0, 0]},
            {"time_units": "days", "dns_queries": [1, "2"]},
            {"time_units": "days", "dns_queries": [True, 1]},
            {"time_units": "days", "dns_queries": "lots"},
            {"time_units": "weeks", "dns_queries": [1, 2]},
        ):
            self.assertIsNone(normal_rate(stats, 100), stats)

    def test_unknown_rate_gives_a_fly_per_fifty_blocked(self):
        s, memory = self.make(), {}
        self.poll(s, memory, 1000)
        self.assertEqual(self.poll(s, memory, 1049)[0], [])
        self.assertEqual(
            self.poll(s, memory, 1050)[0], [{"type": "ad_blocked", "count": 1, "text": ""}]
        )
        self.assertEqual(memory["carry"], 0)

    def test_carry_across_polls(self):
        s, memory = self.make(), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.observe(s, memory, 1030), [])
        self.assertEqual(self.observe(s, memory, 1060), [])
        self.assertEqual(self.observe(s, memory, 1074), [])
        self.assertEqual(memory["carry"], 74)
        self.assertEqual(
            self.observe(s, memory, 1075), [{"type": "ad_blocked", "count": 1, "text": ""}]
        )
        self.assertEqual(memory["carry"], 0)
        self.assertEqual(self.flies(self.observe(s, memory, 1235)), 2)
        self.assertEqual(memory["carry"], 10)

    def test_a_burst_is_capped_at_eight_and_the_excess_dropped(self):
        s, memory = self.make(), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.flies(self.observe(s, memory, 1000 + 75 * 20 + 7)), 8)
        self.assertEqual(memory["carry"], 7)
        self.assertEqual(self.flies(self.observe(s, memory, 1000 + 75 * 21)), 1)

    def test_a_fly_is_never_less_than_one_blocked_query(self):
        s, memory = self.make(fly_every_s=0.5), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.flies(self.observe(s, memory, 1003)), 3)

    def test_zero_keeps_one_fly_per_blocked_query(self):
        s, memory = self.make(fly_every_s=0), {}
        self.observe(s, memory, 4800)
        self.assertEqual(
            self.observe(s, memory, 4803), [{"type": "ad_blocked", "count": 3, "text": ""}]
        )
        self.assertEqual(self.flies(self.observe(s, memory, 5303)), 500)

    def test_first_sight_and_a_fall_raise_nothing(self):
        s, memory = self.make(), {}
        self.assertEqual(self.observe(s, memory, 1000), [])  # first sight
        self.assertNotIn("carry", memory)
        self.assertEqual(self.observe(s, memory, 1000), [])  # no rise
        self.observe(s, memory, 1050)
        self.assertEqual(self.observe(s, memory, 100), [])  # the rolling window moved on
        self.assertEqual(memory["blocked"], 100)
        self.assertEqual(memory["carry"], 50)
        self.assertEqual(memory["today"], 50)
        self.assertEqual(self.flies(self.observe(s, memory, 125)), 1)

    def test_memory_from_the_previous_version(self):
        s, memory = self.make(), {"blocked": 1000}
        reading = self.reading(1200, seed=120)
        self.assertEqual(self.flies(s.observe(reading, memory, T0)), 2)
        self.assertEqual(memory["carry"], 50)
        self.assertEqual(reading.facts["blocked_today"], 120 + 200)  # seeded once, rise added
        reading = self.reading(1210, seed=999)
        s.observe(reading, memory, T0)
        self.assertEqual(reading.facts["blocked_today"], 330)

    def test_today_seeded_from_the_last_day(self):
        self.window()
        s, memory = self.make(), {}
        self.assertEqual(self.poll(s, memory, 43200)[1], 120)
        self.assertEqual(self.poll(s, memory, 43207)[1], 127)
        self.assertEqual(memory["today"], 127)

    def test_today_seeded_from_the_hours_since_local_midnight(self):
        # 21:00 UTC is 22:00 in Berlin in January: the last 23 hours of the window.
        self.stats.update(
            {"time_units": "hours", "dns_queries": [5] * 24, "blocked_filtering": list(range(24))}
        )
        s, memory = self.make({"collector": {"timezone": "Europe/Berlin"}}), {}
        self.assertEqual(self.poll(s, memory, 400)[1], sum(range(1, 24)))

    def test_today_resets_at_local_midnight(self):
        self.window()
        s, memory = self.make({"collector": {"timezone": "Europe/Berlin"}}), {}
        self.poll(s, memory, 43200, at(7140))
        self.assertEqual(self.poll(s, memory, 43210, at(7170))[1], 130)  # 23:59:30 local
        self.assertEqual(memory["day"], "2026-01-15")
        self.assertEqual(self.poll(s, memory, 43215, at(7200))[1], 5)  # 00:00 local, no seed
        self.assertEqual(memory["day"], "2026-01-16")
        self.assertEqual(self.poll(s, memory, 43221, at(7230))[1], 11)

    def test_unknown_shape_seeds_nothing(self):
        s, memory = self.make(), {}
        self.assertEqual(self.poll(s, memory, 4800)[1], 0)
        self.assertEqual(self.poll(s, memory, 4803)[1], 3)
        self.assertEqual(blocked_since_midnight({"time_units": "days"}, 5), 0)

    def test_credentials_go_with_the_first_request(self):
        self.http.routes["/control/stats"] = (200, {"num_blocked_filtering": 1})
        s = source(AdblockSource, "adblock", {"url": self.http.url})
        s.fetch(T0)
        self.assertEqual(len(self.http.requests), 1)
        self.assertTrue(self.http.requests[0][1]["Authorization"].startswith("Basic "))

    def test_refused_login_is_an_auth_error_after_one_request(self):
        for status in (401, 403):
            self.http.requests.clear()
            self.http.routes["/control/stats"] = (status, {"message": "nope"})
            s = source(AdblockSource, "adblock", {"url": self.http.url})
            with self.assertRaises(AuthError):
                s.fetch(T0)
            self.assertEqual(len(self.http.requests), 1)

    def test_error_text_carries_no_secret_or_url(self):
        s = source(AdblockSource, "adblock", {"url": "http://127.0.0.1:9"})
        with self.assertRaises(SourceError) as cm:
            s.fetch(T0)
        self.assertNotIn("pw-example", str(cm.exception))
        self.assertNotIn("127.0.0.1", str(cm.exception))


class SecurityTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.soc = {
            "threat_score_24h": 2,
            "organic_bans_24h": 14,
            "last_ban": {
                "ip": "203.0.113.77",
                "jail": "caddy",
                "time": "2026-01-15T20:00:00+00:00",
            },
            "schema": 6,
        }
        self.http.routes["/soc"] = (200, lambda _h: self.soc)
        self.s = source(SecuritySource, "security", {"url": self.http.url})

    def poll(self, memory, now):
        r = self.s.fetch(now)
        return r, self.s.observe(r, memory, now)

    def test_facts(self):
        r, _ = self.poll({}, T0)
        self.assertEqual(r.facts, {"threat_score": 2, "bans_24h": 14, "attack": False})

    def test_new_last_ban_is_an_event_and_first_sight_is_not(self):
        memory = {}
        _, events = self.poll(memory, T0)
        self.assertEqual(events, [])
        self.soc["last_ban"] = {
            "ip": "198.51.100.9",
            "jail": "sshd",
            "time": "2026-01-15T21:00:10Z",
        }
        self.soc["organic_bans_24h"] = 15
        r, events = self.poll(memory, at(30))
        self.assertEqual(
            events, [{"type": "ip_banned", "count": 1, "text": "BANNED 198.51.100.9 · sshd"}]
        )
        self.assertTrue(r.data["jail_ban"])
        self.assertEqual(r.data["bans_in_window"], 1)

    def test_old_jail_ban_is_not_an_attack(self):
        self.soc["last_ban"]["jail"] = "sshd"
        self.soc["last_ban"]["time"] = "2026-01-15T19:00:00Z"  # two hours before T0
        r, _ = self.poll({}, T0)
        self.assertFalse(r.data["jail_ban"])

    def test_bans_are_counted_over_the_window(self):
        memory = {}
        self.poll(memory, T0)
        self.soc["organic_bans_24h"] = 17  # three new bans
        r, _ = self.poll(memory, at(60))
        self.assertEqual(r.data["bans_in_window"], 3)
        self.soc["organic_bans_24h"] = 19
        r, _ = self.poll(memory, at(300))
        self.assertEqual(r.data["bans_in_window"], 5)
        r, _ = self.poll(memory, at(700))  # the first three have left the window
        self.assertEqual(r.data["bans_in_window"], 2)

    def test_marker_survives_a_restart(self):
        memory = {}
        self.poll(memory, T0)
        fresh = source(SecuritySource, "security", {"url": self.http.url})
        r = fresh.fetch(at(30))
        self.assertEqual(fresh.observe(r, memory, at(30)), [])


class ImportsTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.records = []
        self.http.routes["/api/v3/history"] = (200, lambda _h: {"records": self.records})

    def test_sonarr_events_and_titles(self):
        s = source(SonarrSource, "sonarr", {"url": self.http.url})
        memory = {}
        self.records = [{"id": 10, "sourceTitle": "Old.Show.S01E01.1080p"}]
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])
        self.records = [
            {
                "id": 12,
                "sourceTitle": "The.Night.Shift.S02E05.1080p",
                "series": {"title": "The Night Shift"},
                "episode": {"seasonNumber": 2, "episodeNumber": 5},
            },
            {"id": 11, "sourceTitle": "The.Night.Shift.S02E04.1080p"},
            {"id": 10, "sourceTitle": "Old.Show.S01E01.1080p"},
        ]
        events = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual(
            [e["text"] for e in events],
            ["IMPORTED · The.Night.Shift.S02E04.1080p", "IMPORTED · The Night Shift S02E05"],
        )
        self.assertEqual(memory["last_id"], 12)
        path, headers = self.http.requests[-1]
        self.assertIn("eventType=3", path)
        self.assertIn("includeSeries=true", path)
        self.assertEqual(headers["X-Api-Key"], "sk-example")

    def test_empty_history_on_first_start_still_catches_the_first_import(self):
        s = source(RadarrSource, "radarr", {"url": self.http.url})
        memory = {}
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])
        self.records = [{"id": 1, "sourceTitle": "x", "movie": {"title": "A Film", "year": 2024}}]
        events = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual([e["text"] for e in events], ["IMPORTED · A Film (2024)"])

    def test_refused_key_is_an_auth_error(self):
        self.http.routes["/api/v3/history"] = (401, {"message": "Unauthorized"})
        s = source(RadarrSource, "radarr", {"url": self.http.url})
        with self.assertRaises(AuthError):
            s.fetch(T0)


class StreamsTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)

    def test_titles(self):
        self.assertEqual(
            title_of(
                {
                    "media_type": "episode",
                    "grandparent_title": "The Night Shift",
                    "parent_media_index": "2",
                    "media_index": "4",
                }
            ),
            "The Night Shift S02E04",
        )
        self.assertEqual(title_of({"media_type": "movie", "title": "A Film"}), "A Film")
        self.assertEqual(
            title_of({"media_type": "track", "grandparent_title": "Band", "title": "Song"}),
            "Band - Song",
        )

    def test_activity(self):
        reply = {
            "response": {
                "result": "success",
                "data": {
                    "stream_count": "1",
                    "sessions": [{"media_type": "movie", "title": "A Film"}],
                },
            }
        }
        self.http.routes["/api/v2"] = (200, reply)
        s = source(StreamsSource, "streams", {"url": self.http.url})
        self.assertEqual(s.fetch(T0).facts, {"count": 1, "titles": ["A Film"]})
        self.assertIn("apikey=tk-example", self.http.requests[0][0])

    def test_bad_key_is_an_auth_error(self):
        reply = {"response": {"result": "error", "message": "Invalid apikey", "data": {}}}
        self.http.routes["/api/v2"] = (200, reply)
        s = source(StreamsSource, "streams", {"url": self.http.url})
        with self.assertRaises(AuthError):
            s.fetch(T0)


class InterfaceTest(unittest.TestCase):
    def test_every_source_has_a_name_and_returns_a_reading(self):
        from collector.config import SOURCE_DEFAULTS
        from collector.contract import FACT_SECTIONS

        raw = {"sources": {n: {"enabled": True} for n in SOURCE_DEFAULTS}}
        for name in ("containers", "streams", "adblock", "security", "sonarr", "radarr"):
            raw["sources"][name]["url"] = "http://192.0.2.1"
        raw["sources"]["pi"]["host"] = "192.0.2.4"
        raw["sources"]["updates"]["holders"] = [{"name": "x", "pattern": "x"}]
        config = make_config(raw, SECRETS)
        built = build_sources(config)
        self.assertEqual(sorted(s.name for s in built), sorted(SOURCE_DEFAULTS))
        for s in built:
            self.assertTrue(s.section is None or s.section in FACT_SECTIONS)
            self.assertTrue(re.match(r"^[a-z]+$", s.name))


if __name__ == "__main__":
    unittest.main()
