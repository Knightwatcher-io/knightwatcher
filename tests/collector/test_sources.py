import datetime as dt
import os
import re
import socket
import tempfile
import threading
import unittest
from unittest import mock

from collector.net import SourceError, dns_query
from collector.sources import build_sources
from collector.sources.backup import BackupSource, parse_when
from collector.sources.containers import ContainersSource, classify, ignored
from collector.sources.dns import DnsSource
from collector.sources.host import HostSource, Sample, cpu_average, mem_average
from collector.sources.ssh import SshSource, decode_address
from collector.sources.updates import UpdatesSource
from collector.sources.wan import WanSource
from kw_helpers import T0, FakeHttp, FakeProc, at, closed_port, make_config

# The credentials the sources log in with, as the environment holds them.
SECRETS = {
    "KW_ADGUARD_USERNAME": "kw",
    "KW_ADGUARD_PASSWORD": "pw-example",
    "KW_TAUTULLI_API_KEY": "tk-example",
    "KW_SONARR_API_KEY": "sk-example",
    "KW_RADARR_API_KEY": "rk-example",
    "KW_LIDARR_API_KEY": "lk-example",
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
        self.proc.write("1/net/tcp", FakeProc.TCP_HEADER + "".join(rows))
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
        self.proc.write("1/net/tcp", FakeProc.TCP_HEADER + "".join(rows))
        tcp6 = "   0: 0000000000000000FFFF0000057100CB:0016 B80D0120000000000000000001000000:C741"
        self.proc.write("1/net/tcp6", FakeProc.TCP_HEADER + tcp6 + " 01 0 0 0\n")
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
        self.assertEqual(
            events,
            [
                {
                    "type": "backup_done",
                    "count": 1,
                    "text": "BACKUP DONE 03:12",
                    "parts": {"at": "03:12"},
                }
            ],
        )
        self.assertEqual(memory["last_ok"], "2026-01-15T03:12:00Z")
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])

    def test_the_time_in_the_parts_is_in_the_collectors_time_zone(self):
        s = source(
            BackupSource,
            "backup",
            {"log": self.log, "pattern": r"Backup completed: (.+)$"},
            {"collector": {"timezone": "Asia/Kolkata"}},
        )
        memory = {"last_ok": "2026-01-14T03:00:00Z"}
        self.write("Backup completed: Thu 15 Jan 03:12:00 UTC 2026\n")
        [event] = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual(event["text"], "BACKUP DONE 08:42")
        self.assertEqual(event["parts"], {"at": "08:42"})

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


class InterfaceTest(unittest.TestCase):
    def test_every_source_has_a_name_and_returns_a_reading(self):
        from collector.config import SOURCE_DEFAULTS
        from collector.contract import FACT_SECTIONS

        raw = {"sources": {n: {"enabled": True} for n in SOURCE_DEFAULTS}}
        for name in ("containers", "streams", "adblock", "sonarr", "radarr", "lidarr"):
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
