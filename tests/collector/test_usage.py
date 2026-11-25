"""[[sources.usage]]: the CPU and memory of machines other than this host, read through a provider
of the usage kind or from one JSON address (from = "json"), and judged by Under strain beside this
host's.

Every name and address here is invented, the services are served on the loopback, and the header
values are made for each run.
"""

import contextlib
import io
import os
import secrets
import tempfile
import unittest
from collections import deque
from unittest import mock

from collector import contract, heartbeat
from collector.cli import main
from collector.conditions import Conditions
from collector.config import ConfigError, build
from collector.kinds import kind_of, usage
from collector.net import SourceError
from collector.providers import scan
from collector.runner import Runner
from collector.sources import KindSource, Reading, build_sources
from collector.store import Memory
from kw_helpers import T0, Clock, FakeHttp, at

URL = "http://192.0.2.40:8080/api/status"

# A provider file of the user's own that reads several machines, each by its key.
FLEET = """\
format = 1
id = "fleet"
kind = "usage"
name = "Fleet"

[[request]]
path = "/api/machines"

[fill.cpu]
each = "$.machines[*]"
vars = { machine = "$.key", pct = "$.cpu" }
fields = { machine = "machine", pct = "pct" }

[fill.memory]
each = "$.machines[*]"
vars = { machine = "$.key", pct = "$.mem" }
fields = { machine = "machine", pct = "pct" }
"""

# One that reads one machine, its memory alone.
SOLO = """\
format = 1
id = "solo"
kind = "usage"
name = "Solo"

[[request]]
path = "/api/mem"

[fill.memory]
each = "$"
vars = { pct = "$.used" }
fields = { pct = "pct" }
"""


def entry(**over) -> dict:
    """A NAS's status page, read for its CPU and memory, with some settings replaced."""
    out = {
        "name": "nas-status",
        "from": "json",
        "url": URL,
        "cpu": "$.cpu.busy_pct",
        "memory": "$.memory.used_pct",
        "machines": [{"name": "NAS"}],
    }
    out.update(over)
    return {k: v for k, v in out.items() if v is not None}


def config(*entries, raw=None, env=None, providers=None):
    whole = {**(raw or {})}
    whole.setdefault("sources", {})
    whole["sources"] = {**whole["sources"], "usage": list(entries)}
    return build(whole, env if env is not None else {}, providers=providers)


class ConfigTest(unittest.TestCase):
    """How config.toml's entries become sources, and what is refused."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = os.path.join(self.tmp.name, "providers")
        os.mkdir(self.folder)
        for name, text in (("fleet", FLEET), ("solo", SOLO)):
            with open(os.path.join(self.folder, f"{name}.toml"), "w", encoding="utf-8") as fh:
                fh.write(text)

    def problems(self, *entries, raw=None, env=None):
        with self.assertRaises(ConfigError) as cm:
            config(*entries, raw=raw, env=env, providers=scan(self.folder))
        return cm.exception.problems

    def test_a_generic_entry_and_its_defaults(self):
        c = config(entry())
        s = c.sources["usage:nas-status"]
        self.assertEqual(kind_of("usage:nas-status"), "usage")
        self.assertEqual(c.where("usage:nas-status"), "sources.usage[0]")
        self.assertEqual(
            (s["every_s"], s["window_s"], s["secret"], s["header"], s["verify_tls"]),
            (30, None, "nas_status", "", True),
        )
        self.assertEqual(c.warnings, [])

    def test_a_provider_file_that_reads_several_machines(self):
        machines = [{"id": "nas-01", "name": "NAS"}, {"id": "box", "name": "Buildbox"}]
        c = config(
            {
                "name": "fleet",
                "from": "fleet",
                "url": "http://192.0.2.5:8090",
                "machines": machines,
            },
            providers=scan(self.folder),
        )
        self.assertEqual(c.sources["usage:fleet"]["machines"], machines)
        self.assertEqual(c.sources["usage:fleet"]["secret"], "fleet")

    def test_ids_against_what_the_provider_reads(self):
        fleet = {"name": "fleet", "from": "fleet", "url": "http://192.0.2.5:8090"}
        self.assertEqual(
            self.problems({**fleet, "machines": [{"id": "a", "name": "NAS"}, {"name": "Box"}]}),
            ["sources.usage[0].machines[1].id: required, since fleet reads several machines"],
        )
        solo = {"name": "solo", "from": "solo", "url": "http://192.0.2.6"}
        self.assertEqual(
            self.problems({**solo, "machines": [{"id": "a", "name": "NAS"}]}),
            ["sources.usage[0].machines[0].id: not used, since solo reads one machine"],
        )
        self.assertEqual(
            self.problems({**solo, "machines": [{"name": "NAS"}, {"name": "Box"}]}),
            ["sources.usage[0].machines: solo reads one machine; list one"],
        )
        self.assertEqual(
            self.problems(entry(machines=[{"id": "x", "name": "NAS"}])),
            ['sources.usage[0].machines[0].id: not used, since from = "json" reads one machine'],
        )

    def test_the_machines(self):
        w = "sources.usage[0].machines"
        for machines, problem in [
            ([], f"{w}: list at least one machine"),
            ("NAS", f"{w}: expected list"),
            ([{"id": "a"}], f"{w}[0].name: required"),
            ([{"name": " NAS"}],
             f"{w}[0].name: 1 to 20 printable ASCII characters, no space at either end"),
            ([{"name": "NAS", "spare": 1}], f"{w}[0].spare: unknown setting"),
            ([{"name": "NAS", "cpu_pct": 0}], f"{w}[0].cpu_pct: must be above 0 and at most 100"),
            ([{"name": "NAS", "memory_pct": "high"}], f"{w}[0].memory_pct: expected a number"),
            ([{"name": "NAS", "cpu_pct": 5}],
             f"{w}[0].cpu_pct: must be above conditions.cpu_hot.band (5)"),
            ([{"id": f"m{i}", "name": f"M{i}"} for i in range(33)], f"{w}: at most 32"),
            ([{"id": "a", "name": "NAS"}, {"id": "a", "name": "Box"}],
             f'{w}[1].id: "a" is already the id of {w}[0]'),
        ]:  # fmt: skip
            with self.subTest(problem=problem):
                fleet = {
                    "name": "fleet",
                    "from": "fleet",
                    "url": "http://192.0.2.5",
                    "machines": machines,
                }
                given = (
                    fleet
                    if machines and isinstance(machines, list) and "id" in machines[0]
                    else entry(machines=machines)
                )
                self.assertIn(problem, self.problems(given))

    def test_names_are_unique_across_every_machine_the_hosts_among_them(self):
        fleet = {
            "name": "fleet",
            "from": "fleet",
            "url": "http://192.0.2.5",
            "machines": [{"id": "a", "name": "Buildbox"}, {"id": "b", "name": "nas"}],
        }
        self.assertEqual(
            self.problems(entry(), fleet, raw={"sources": {"host": {"name": "BUILDBOX"}}}),
            [
                'sources.usage[1].machines[0].name: "Buildbox" is already the name of '
                "[sources.host]",
                'sources.usage[1].machines[1].name: "nas" is already the name of '
                "sources.usage[0].machines[0]",
            ],
        )
        # A host that is off names nothing.
        raw = {"sources": {"host": {"name": "NAS", "enabled": False}}}
        self.assertIn("usage:nas-status", config(entry(), raw=raw).sources)

    def test_thirty_two_machines_in_all_beside_the_host(self):
        many = [
            {
                "name": f"fleet-{n}",
                "from": "fleet",
                "url": f"http://192.0.2.{n + 10}",
                "machines": [{"id": f"m{i}", "name": f"M{n}-{i}"} for i in range(11)],
            }
            for n in range(3)
        ]
        self.assertEqual(
            self.problems(*many),
            ["sources.usage: 33 machines; at most 32 in all, beside this host"],
        )

    def test_the_hosts_own_thresholds(self):
        c = build({"sources": {"host": {"cpu_pct": 95, "memory_pct": 80.5}}})
        self.assertEqual(
            (c.sources["host"]["cpu_pct"], c.sources["host"]["memory_pct"]), (95, 80.5)
        )
        self.assertEqual(build({"sources": {"host": {}}}).sources["host"]["cpu_pct"], None)
        for given, problem in [
            ({"cpu_pct": 0}, "sources.host.cpu_pct: must be above 0 and at most 100"),
            ({"memory_pct": 101}, "sources.host.memory_pct: must be above 0 and at most 100"),
            ({"cpu_pct": "high"}, "sources.host.cpu_pct: expected a number"),
            ({"cpu_pct": 4}, "sources.host.cpu_pct: must be above conditions.cpu_hot.band (5)"),
        ]:
            with self.subTest(given=given), self.assertRaises(ConfigError) as cm:
                build({"sources": {"host": given}})
            self.assertEqual(cm.exception.problems, [problem])

    def test_the_generic_entrys_own_rules(self):
        w = "sources.usage[0]"
        for given, problem in [
            (entry(cpu=None, memory=None),
             f"{w}: give cpu, memory or both: where each figure is in the reply"),
            (entry(cpu="$..busy"), f'{w}.cpu: unexpected ".." at character 2'),
            (entry(url="http://192.0.2.40/s#top"), f"{w}.url: must not carry a fragment (#)"),
            (entry(url="ftp://192.0.2.40/s"), f"{w}.url: must start with http:// or https://"),
            (entry(header="Cookie"), f"{w}.header: this header cannot be set"),
            (entry(secret="nas"), f"{w}.secret: only applies with header"),
            (entry(window_s=5), f"{w}.window_s: must be at least 10"),
            (entry(window_s=30.5), f"{w}.window_s: expected int"),
            (entry(every_s=5), f"{w}.every_s: must be from 10 to 3600"),
            (entry(name="Nas"),
             f"{w}.name: 1 to 20 of a-z, 0-9 and -, starting with a letter or digit"),
            (entry(path="$.x"), f"{w}.path: unknown setting"),
        ]:  # fmt: skip
            with self.subTest(problem=problem):
                self.assertIn(problem, self.problems(given))
        self.assertEqual(config(entry(cpu=None)).sources["usage:nas-status"]["cpu"], "")

    def test_the_paths_and_header_belong_to_the_generic_source(self):
        fleet = {
            "name": "fleet",
            "from": "fleet",
            "url": "http://192.0.2.5",
            "cpu": "$.x",
            "header": "X-Key",
            "machines": [{"id": "a", "name": "NAS"}],
        }
        self.assertEqual(
            self.problems(fleet),
            [
                "sources.usage[0].cpu: not used by fleet",
                "sources.usage[0].header: not used by fleet",
            ],
        )
        self.assertEqual(
            self.problems({**entry(), "from": "beszel"}),
            ['sources.usage[0].from: unknown provider "beszel"; use fleet, json or solo'],
        )

    def test_a_header_reads_its_value_under_the_entrys_name(self):
        value = secrets.token_hex(16)
        c = config(entry(header="X-Api-Key"), env={"KW_NAS_STATUS_HEADER": value})
        self.assertEqual(c.secret("usage:nas-status"), {"header": value})
        self.assertEqual(
            self.problems(entry(header="X-Api-Key"), env={}),
            [".env: KW_NAS_STATUS_HEADER missing (for usage:nas-status)"],
        )


class FigureTest(unittest.TestCase):
    def test_what_a_figure_may_be(self):
        for value, read in [
            (93.4, 93.4), (41, 41.0), ("93.4", 93.4), (" 7 ", 7.0), (100.4, 100.0), (250, 100.0),
            (0, 0.0), (-1, None), (float("nan"), None), (float("inf"), None), ("NaN", None),
            ("high", None), (True, None), (None, None), ([1], None),
        ]:  # fmt: skip
            self.assertEqual(usage.figure(value), read, repr(value))

    def test_the_time_weighted_mean_over_the_window(self):
        def held(*pairs):
            return deque((at(t), v) for t, v in pairs)

        self.assertEqual(usage.average(held((0, 50.0)), at(0), 30), (50.0, 0.0))
        # 10 % for 10 s and 40 % for 20 s, measured from the reading 30 s back.
        self.assertEqual(usage.average(held((0, 0), (10, 10), (30, 40)), at(30), 30), (30.0, 30.0))
        # A reading older than the window is left out, unless it is the only earlier one.
        self.assertEqual(usage.average(held((0, 99), (40, 10), (60, 20)), at(60), 30), (20.0, 20.0))
        self.assertEqual(usage.average(held((0, 99), (60, 20)), at(60), 30), (20.0, 60.0))


class KindTest(unittest.TestCase):
    """The kind's reading: the listed machines matched, averaged and noted when missing."""

    def setUp(self):
        self.c = config(entry())
        self.settings = self.c.sources["usage:nas-status"]
        self.kind = usage.UsageKind()

    def read(self, fill, t=0, settings=None):
        return self.kind.reading(fill, settings or self.settings, self.c, at(t))

    def test_one_machine_averaged_over_the_window(self):
        r = self.read({"cpu": [{"pct": 10}], "memory": [{"pct": "93.4"}]})
        self.assertEqual(
            r.data["machines"],
            [{"key": "", "cpu": 10.0, "cpu_span_s": 0.0, "memory": 93.4, "memory_span_s": 0.0}],
        )
        self.assertEqual((r.facts, r.note), (None, ""))
        r = self.read({"cpu": [{"pct": 30}], "memory": [{"pct": 95}]}, t=30)
        self.assertEqual(r.data["machines"][0]["cpu"], 30.0)
        self.assertEqual(r.data["machines"][0]["cpu_span_s"], 30.0)

    def test_a_listed_machine_missing_is_no_reading_and_a_note(self):
        r = self.read({"cpu": [], "memory": []})
        self.assertEqual(r.data["machines"][0]["cpu"], None)
        self.assertEqual(r.note, "no reading for NAS")
        # One resource alone is a reading.
        self.assertEqual(self.read({"memory": [{"pct": 91}]}).note, "")

    def test_several_machines_by_key_the_unlisted_ignored(self):
        fleet = {
            **self.settings,
            "from": "fleet",
            "machines": [{"id": "a", "name": "NAS"}, {"id": "b", "name": "Box"},
                         {"id": "c", "name": "Pi 2"}],
        }  # fmt: skip
        fill = {
            "cpu": [{"machine": "a", "pct": 12}, {"machine": "z", "pct": 99},
                    {"machine": "b", "pct": "x"}],
            "memory": [{"machine": "b", "pct": 92}, {"machine": "a", "pct": 50}],
        }  # fmt: skip
        r = self.read(fill, settings=fleet)
        self.assertEqual(
            [(m["key"], m["cpu"], m["memory"]) for m in r.data["machines"]],
            [("a", 12.0, 50.0), ("b", None, 92.0), ("c", None, None)],
        )
        self.assertEqual(r.note, "no reading for Pi 2")
        self.assertNotIn("z", repr(r))

    def test_a_provider_and_an_entry_that_disagree_fail_the_read(self):
        fleet = {**self.settings, "machines": [{"id": "a", "name": "NAS"}]}
        for fill, settings, words in [
            ({"cpu": [{"machine": "a", "pct": 1}, {"pct": 2}]}, fleet, "machine on some cpu items"),
            (
                {"cpu": [{"machine": "a", "pct": 1}]},
                self.settings,
                "give each listed machine an id",
            ),
            ({"cpu": [{"pct": 1}]}, fleet, "list it with no id"),
        ]:
            with self.subTest(words=words), self.assertRaises(SourceError) as cm:
                self.read(fill, settings=settings)
            self.assertIn(words, str(cm.exception))

    def test_the_entrys_window_and_the_readings_kept(self):
        own = {**self.settings, "window_s": 60}
        self.assertEqual(usage.window_of(own, self.c), 60)
        self.assertEqual(usage.window_of(self.settings, self.c), 30)
        for t in range(0, 200, 30):
            self.read({"cpu": [{"pct": t}]}, t=t, settings=own)
        # The window, one read and the slack: 60 + 30 + 1 seconds back from 180.
        self.assertEqual(
            [s[0] for s in self.kind.samples["", "cpu"]], [at(90), at(120), at(150), at(180)]
        )
        # A clock that went back starts again.
        self.read({"cpu": [{"pct": 5}]}, t=10, settings=own)
        self.assertEqual(list(self.kind.samples["", "cpu"]), [(at(10), 5.0)])


class LoopbackTest(unittest.TestCase):
    """The generic source read through the engine from a service on the loopback, and run by the
    runner."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/status"] = (
            200,
            {"cpu": {"busy_pct": 41}, "memory": {"used_pct": "93.4"}},
        )
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.header = secrets.token_hex(16)

    def runner(self, *entries, raw=None):
        whole = {
            "collector": {"output_dir": self.tmp.name, "state_dir": self.tmp.name},
            **(raw or {}),
        }
        c = config(*entries, raw=whole, env={"KW_NAS_STATUS_HEADER": self.header})
        return Runner(c, Memory(self.tmp.name), clock=Clock())

    def test_one_get_and_the_machine_under_strain(self):
        url = self.http.url + "/api/status?pretty=1"
        self.http.routes["/api/status?pretty=1"] = self.http.routes["/api/status"]
        r = self.runner(entry(url=url, header="X-Api-Key"))
        state = r.cycle()
        [(path, headers)] = self.http.requests
        self.assertEqual((path, headers["X-Api-Key"]), ("/api/status?pretty=1", self.header))
        [cond] = state["conditions"]
        self.assertEqual((cond["id"], cond["headline"]), ("cpu_hot", "NAS MEMORY 93%"))
        self.assertEqual(cond["detail"], "93% for 1 s · CPU 41%")
        self.assertEqual(
            cond["machines"],
            [{"name": "NAS", "window_s": 30,
              "memory": {"pct": 93.4, "threshold": 90.0, "since": "2026-01-15T20:59:59Z"}}],
        )  # fmt: skip
        self.assertEqual(
            state["sources"]["usage:nas-status"],
            {"ok": True, "at": "2026-01-15T21:00:00Z", "error": ""},
        )
        self.assertEqual(contract.validate(state), [])
        self.assertNotIn(self.header, str(state))

    def test_a_machine_missing_reads_ok_with_its_name_in_error(self):
        self.http.routes["/api/status"] = (200, {"uptime": 3})
        state = self.runner(entry(url=self.http.url + "/api/status")).cycle()
        self.assertEqual(
            state["sources"]["usage:nas-status"],
            {"ok": True, "at": "2026-01-15T21:00:00Z", "error": "no reading for NAS"},
        )
        self.assertEqual(state["conditions"], [])

    def test_a_failed_read_shows_on_the_status_page_and_raises_nothing(self):
        self.http.routes["/api/status"] = (500, {"error": "broken"})
        state = self.runner(entry(url=self.http.url + "/api/status")).cycle()
        s = state["sources"]["usage:nas-status"]
        self.assertFalse(s["ok"])
        self.assertTrue(s["error"])
        self.assertEqual(state["conditions"], [])

    def test_a_device_of_the_same_name_is_tied_to_it(self):
        raw = {"device": [{"name": "nas", "kind": "machine", "host": "127.0.0.1", "port": 9}]}
        state = self.runner(entry(url=self.http.url + "/api/status"), raw=raw).cycle()
        [cond] = state["conditions"]
        self.assertEqual(cond["machines"][0]["device"], 0)

    def test_the_sources_built(self):
        c = config(entry())
        (source,) = build_sources(c)
        self.assertIsInstance(source, KindSource)
        self.assertEqual(
            (source.name, source.spec.id, source.spec.kind), ("usage:nas-status", "json", "usage")
        )
        self.assertEqual(source.provider_settings["url"], "http://192.0.2.40:8080")


class OwnProviderTest(unittest.TestCase):
    """An entry reading a provider file of the user's own that reads several machines."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = os.path.join(self.tmp.name, "providers")
        os.mkdir(self.folder)
        with open(os.path.join(self.folder, "fleet.toml"), "w", encoding="utf-8") as fh:
            fh.write(FLEET)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)

    def test_several_machines_by_their_keys(self):
        self.http.routes["/api/machines"] = (
            200,
            {"machines": [{"key": "nas-01", "cpu": 20, "mem": 95.5},
                          {"key": "box", "cpu": "97", "mem": 40},
                          {"key": "spare", "cpu": 99, "mem": 99}]},
        )  # fmt: skip
        machines = [
            {"id": "nas-01", "name": "NAS"},
            {"id": "box", "name": "Buildbox", "cpu_pct": 98},
        ]
        c = build(
            {"sources": {"usage": [
                {"name": "fleet", "from": "fleet", "url": self.http.url, "machines": machines},
            ]}},
            {},
            providers=scan(self.folder),
        )  # fmt: skip
        (source,) = build_sources(c)
        reading = source.fetch(T0)
        out = Conditions(c).evaluate({"usage:fleet": reading}, T0)
        [cond] = out
        # Buildbox's own threshold, 98, leaves its 97 % alone.
        self.assertEqual(
            (cond["headline"], cond["detail"]), ("NAS MEMORY 96%", "96% for 1 s · CPU 20%")
        )
        self.assertEqual([m["name"] for m in cond["machines"]], ["NAS"])

    def test_a_file_that_fills_neither_resource_is_refused(self):
        with open(os.path.join(self.folder, "empty.toml"), "w", encoding="utf-8") as fh:
            fh.write(
                'format = 1\nid = "empty"\nkind = "usage"\nname = "Empty"\n\n'
                '[[request]]\npath = "/"\n\n[fill]\n'
            )
        found = scan(self.folder)
        self.assertIn("empty", found.refused)
        self.assertTrue(any("give cpu or memory, or both" in p for p in found.refused["empty"]))


class StrainTest(unittest.TestCase):
    """Under strain over this host and the machines of [[sources.usage]]."""

    def readings(self, **machines):
        out = [
            {"key": "", "cpu": c, "cpu_span_s": 30.0, "memory": m, "memory_span_s": 30.0}
            for c, m in machines.values()
        ]
        return Reading(None, {"machines": out})

    def test_several_machines_with_the_host_in_the_order_raised(self):
        raw = {"sources": {"host": {"name": "Server", "cpu_pct": 95}}}
        a = config(
            entry(), entry(name="box", machines=[{"name": "Buildbox", "memory_pct": 80}]), raw=raw
        )
        c = Conditions(a)
        host = Reading(
            {
                "cpu_pct": 96.0,
                "load1": 2.0,
                "cores": 4,
                "mem_pct": 50.0,
                "swap_pct": 0.0,
                "disks": [],
            },
            {"mem_available_pct": 50.0, "mem_used_avg": 50.0, "span_s": 30.0},
        )
        nas = self.readings(nas=(10.0, 93.0))
        box = self.readings(box=(10.0, 85.0))
        out = c.evaluate({"usage:nas-status": nas}, T0)
        self.assertEqual(out[0]["headline"], "NAS MEMORY 93%")
        out = c.evaluate({"host": host, "usage:nas-status": nas, "usage:box": box}, at(10))
        [cond] = out
        self.assertEqual(cond["headline"], "3 UNDER STRAIN")
        self.assertEqual(cond["detail"], "NAS memory 93%, Server CPU 96%, Buildbox memory 85%")
        self.assertEqual(
            [(m["name"], sorted(set(m) & {"cpu", "memory"})) for m in cond["machines"]],
            [("NAS", ["memory"]), ("Server", ["cpu"]), ("Buildbox", ["memory"])],
        )
        self.assertEqual(cond["machines"][2]["memory"]["threshold"], 80)
        self.assertEqual(contract.validate({**_state(), "conditions": out}), [])

    def test_a_failed_source_clears_its_machine_after_clear_after_s(self):
        c = Conditions(config(entry()))
        nas = self.readings(nas=(10.0, 93.0))
        c.evaluate({"usage:nas-status": nas}, T0)
        held = [c.evaluate({"usage:nas-status": None}, at(t)) for t in (10, 20, 30, 40)]
        self.assertEqual([[x["id"] for x in o] for o in held], [["cpu_hot"]] * 3 + [[]])

    def test_the_entrys_window(self):
        c = Conditions(config(entry(window_s=120)))
        out = c.evaluate({"usage:nas-status": self.readings(nas=(10.0, 93.0))}, T0)
        self.assertEqual(out[0]["machines"][0]["window_s"], 120)

    def test_a_reading_from_before_a_change_that_took_its_machine_away(self):
        c = Conditions(config(entry()))
        fleet = Reading(
            None,
            {
                "machines": [
                    {
                        "key": "gone",
                        "cpu": 99.0,
                        "cpu_span_s": 30.0,
                        "memory": None,
                        "memory_span_s": 0.0,
                    }
                ]
            },
        )
        self.assertEqual(c.evaluate({"usage:nas-status": fleet}, T0), [])


def _state() -> dict:
    return {
        "schema": 1,
        "generated_at": "2026-01-15T21:00:10Z",
        "interval_s": 10,
        "conditions": [],
        "quiet_line": "ALL QUIET",
        "events": [],
        "facts": {},
        "sources": {},
        "defaults": {"look": {}, "display": {}, "quiet": {}, "scenes": {}},
    }


class CommandLineTest(unittest.TestCase):
    """--probe usage:<name>, --check-config and the usage counts."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        env = {k: v for k, v in os.environ.items() if not k.startswith("KW_")}
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.config = os.path.join(self.tmp.name, "config.toml")
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.tmp.name}"\nstate_dir = "{self.tmp.name}"\n'
                "[[sources.usage]]\n"
                'name = "nas-status"\n'
                'from = "json"\n'
                f'url = "{self.http.url}/api/status"\n'
                'cpu = "$.cpu"\n'
                'memory = "$.mem"\n'
                'machines = [{ name = "NAS" }]\n'
            )

    def run_main(self, *args):
        err, out = io.StringIO(), io.StringIO()
        admin = os.path.join(self.tmp.name, "admin.json")
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, "--admin", admin, *args])
        return code, out.getvalue(), err.getvalue()

    def test_probe_prints_the_figures_by_place(self):
        self.http.routes["/api/status"] = (200, {"cpu": "41.5", "mem": 93})
        code, out, err = self.run_main("--probe", "usage:nas-status")
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(
            out,
            "probe usage:nas-status: provider json (the JSON address of nas-status)\n"
            'fill:\n{\n "cpu": [\n  {\n   "pct": "<string 4>"\n  }\n ],\n "memory": [\n  {\n'
            '   "pct": 93\n  }\n ]\n}\nfacts:\nnull\nmachines[0]: cpu 41.5%, memory 93%\n',
        )
        self.http.routes["/api/status"] = (200, {})
        code, out, _ = self.run_main("--probe", "usage:nas-status")
        self.assertEqual(code, 0)
        self.assertTrue(
            out.endswith(
                "machines[0]: cpu not read, memory not read\nread ok, but no reading for NAS\n"
            )
        )

    def test_check_config_names_the_source(self):
        code, out, _ = self.run_main("--check-config")
        self.assertEqual(code, 0)
        self.assertIn("config ok: 1 sources enabled (usage:nas-status)", out)

    def test_the_usage_counts_name_the_provider_never_the_entry(self):
        c = config(entry())
        listed, imports, checks = heartbeat.sources_of(c)
        self.assertEqual((listed, imports, checks), (["usage:json"], 0, 0))
