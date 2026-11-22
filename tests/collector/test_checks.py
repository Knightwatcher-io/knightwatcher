"""[[sources.json]]: the generic checks. Each entry is the source json:<name>, one value read from a
JSON reply at an address given whole, through the engine, and tested; a check that holds raises
the condition check:<name>, acted as the condition it borrows, with its own words.

Every name and address here is invented, the services are served on the loopback, and the header
values are made for each run.
"""

import contextlib
import datetime as dt
import io
import json
import os
import secrets
import tempfile
import unittest
from unittest import mock

from collector import contract
from collector.cli import main
from collector.conditions import Conditions
from collector.config import ConfigError, build, load
from collector.kinds import check, kind_class, kind_of
from collector.net import SourceError
from collector.runner import Runner
from collector.sources import KindSource, MissingCredentials, Reading, build_sources
from collector.store import Memory
from kw_helpers import T0, Clock, FakeHttp

URL = "http://192.0.2.40:8080/api/status"


def entry(**over) -> dict:
    """A check of a NAS's disk temperature, with some settings replaced."""
    out = {
        "name": "nas-temp",
        "url": URL,
        "path": "$.disks[0].temp_c",
        "test": "above",
        "value": 70,
        "headline": "nas hot",
        "detail": "disk at {value} C",
        "as": "cpu_hot",
    }
    out.update(over)
    return {k: v for k, v in out.items() if v is not None}


def config(*entries, conditions=None, env=None, **kw):
    raw = {"sources": {"json": list(entries)}}
    if conditions is not None:
        raw["conditions"] = conditions
    return build(raw, env if env is not None else {}, **kw)


class ConfigTest(unittest.TestCase):
    """How config.toml's entries become sources, and what is refused."""

    def problems(self, *entries, conditions=None, env=None):
        with self.assertRaises(ConfigError) as cm:
            config(*entries, conditions=conditions, env=env)
        return cm.exception.problems

    def test_an_entry_is_a_source_of_its_own_with_its_defaults(self):
        c = config(entry())
        self.assertEqual(list(c.sources), ["json:nas-temp"])
        self.assertEqual(
            c.sources["json:nas-temp"],
            {
                "name": "nas-temp",
                "url": URL,
                "path": "$.disks[0].temp_c",
                "test": "above",
                "value": 70,
                "headline": "nas hot",
                "detail": "disk at {value} C",
                "as": "cpu_hot",
                "every_s": 60,
                "for_s": 0,
                "header": "",
                "secret": "nas_temp",
                "verify_tls": True,
                "enabled": True,
            },
        )
        self.assertEqual(c.where("json:nas-temp"), "sources.json[0]")
        self.assertEqual(kind_of("json:nas-temp"), "check")
        # No credential without a header.
        self.assertEqual(c.secret("json:nas-temp"), {})

    def test_the_header_reads_its_value_from_env_by_name(self):
        value = secrets.token_hex(12)
        c = config(entry(header="X-Api-Key"), env={"KNIGHTWATCHER_NAS_TEMP_HEADER": value})
        self.assertEqual(c.secret("json:nas-temp"), {"header": value})
        self.assertIn(value, c.secret_values())
        c = config(
            entry(header="Authorization", secret="nas"), env={"KNIGHTWATCHER_NAS_HEADER": value}
        )
        self.assertEqual(c.secret("json:nas-temp"), {"header": value})
        self.assertEqual(
            self.problems(entry(header="X-Api-Key")),
            [".env: KNIGHTWATCHER_NAS_TEMP_HEADER missing (for json:nas-temp)"],
        )
        # Taken up while the collector runs, it fails at every read, naming the variable.
        c = config(entry(header="X-Api-Key"), missing="report")
        [source] = build_sources(c)
        self.assertIsInstance(source, MissingCredentials)
        with self.assertRaisesRegex(SourceError, "KNIGHTWATCHER_NAS_TEMP_HEADER missing"):
            source.fetch(T0)

    def test_an_entry_that_is_off_needs_only_its_name(self):
        c = config({"name": "later", "enabled": False})
        self.assertEqual(c.sources, {})
        self.assertEqual(self.problems({"enabled": False}), ["sources.json[0].name: required"])

    def test_the_list_itself(self):
        self.assertEqual(
            self.problems(entry(), entry()),
            ['sources.json[1].name: "nas-temp" is already the name of sources.json[0]'],
        )
        many = [entry(name=f"c{i}") for i in range(17)]
        self.assertEqual(self.problems(*many), ["sources.json: at most 16"])
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"json": {"name": "x"}}}, {})
        self.assertEqual(cm.exception.problems, ["sources.json: expected [[sources.json]] tables"])
        self.assertEqual(
            self.problems(entry(name="NAS")),
            ["sources.json[0].name: 1 to 20 of a-z, 0-9 and -, starting with a letter or digit"],
        )
        self.assertEqual(
            self.problems(entry(colour="red")), ["sources.json[0].colour: unknown setting"]
        )

    def test_what_is_required(self):
        bare = {"name": "nas-temp"}
        self.assertEqual(
            self.problems(bare),
            [f"sources.json[0].{k}: required" for k in ("url", "path", "test", "headline", "as")],
        )

    def test_the_address(self):
        cases = {
            "ftp://192.0.2.40/status": "must start with http:// or https://",
            "http://admin:pw@192.0.2.40/status": "must not carry a user name or password",
            "http://192.0.2.40/status#top": "must not carry a fragment (#)",
            "http://192.0.2.40/a@b": "its path cannot hold @ or \\",
            "http://192.0.2.40/status?a=1&a=2": "its query gives a name twice; give each once",
            "http://192.0.2.40/my status": "not a valid web address",
        }
        for url, why in cases.items():
            self.assertEqual(self.problems(entry(url=url)), [f"sources.json[0].url: {why}"], url)
        for url in ("http://192.0.2.40", "https://nas.example:8443/api/v1/status?pretty=1"):
            config(entry(url=url))
        self.assertEqual(
            self.problems(entry(verify_tls=False)),
            ["sources.json[0].verify_tls: only applies with an https url"],
        )

    def test_the_path_is_the_provider_files_subset(self):
        [problem] = self.problems(entry(path="$..temp_c"))
        self.assertTrue(problem.startswith('sources.json[0].path: unexpected ".."'), problem)
        config(entry(path="$.disks[?@.name == 'sda'].temp_c"))

    def test_the_test_and_its_value(self):
        self.assertEqual(
            self.problems(entry(test="over")),
            ['sources.json[0].test: unknown value "over"; use equals, above, below, contains or '
             "missing"],
        )  # fmt: skip
        self.assertEqual(
            self.problems(entry(value="70")), ["sources.json[0].value: a number, for above"]
        )
        self.assertEqual(
            self.problems(entry(test="below", value=True)),
            ["sources.json[0].value: a number, for below"],
        )
        self.assertEqual(
            self.problems(entry(test="equals", value=[1])),
            ["sources.json[0].value: text, a number, or true or false"],
        )
        self.assertEqual(
            self.problems(entry(test="contains", value=None)),
            ["sources.json[0].value: required with contains"],
        )
        self.assertEqual(
            self.problems(entry(test="missing", detail="gone")),
            ["sources.json[0].value: not used with missing, which holds when nothing is found"],
        )
        config(entry(test="missing", value=None, detail="no disk reported"))
        config(entry(test="equals", value="degraded"), entry(name="b", test="equals", value=False))

    def test_the_words(self):
        self.assertEqual(
            self.problems(entry(headline="A HEADLINE TOO LONG")),
            ["sources.json[0].headline: 1 to 16 printable characters"],
        )
        self.assertEqual(
            self.problems(entry(detail="x" * 61)),
            ["sources.json[0].detail: at most 60 printable characters"],
        )
        self.assertEqual(
            self.problems(entry(detail="{temp} C")),
            ["sources.json[0].detail: only {value} may stand in braces"],
        )
        self.assertEqual(
            self.problems(entry(test="missing", value=None)),
            ["sources.json[0].detail: {value} cannot be used with missing, which finds nothing"],
        )

    def test_what_may_be_borrowed(self):
        self.assertEqual(
            self.problems(entry(**{"as": "device_down"})),
            ['sources.json[0].as: "device_down" cannot be borrowed, since a check has no device '
             "to look towards"],
        )  # fmt: skip
        [problem] = self.problems(entry(**{"as": "nas_hot"}))
        self.assertTrue(problem.startswith('sources.json[0].as: unknown value "nas_hot"; use '))
        for cid in check_borrows():
            config(entry(**{"as": cid}))
        # A condition left out of the priority would never raise the check.
        self.assertEqual(
            self.problems(entry(), conditions={"priority": ["attack", "wan_down"]}),
            ['sources.json[0].as: conditions.priority leaves out "cpu_hot", so this check would '
             "never be raised; add it there, or borrow another"],
        )  # fmt: skip

    def test_the_header_and_its_secret(self):
        for name in ("Host", "Cookie", "User-Agent", "Proxy-Authorization", "Content-Length"):
            self.assertEqual(
                self.problems(entry(header=name), env={"KNIGHTWATCHER_NAS_TEMP_HEADER": "v"}),
                ["sources.json[0].header: this header cannot be set"],
                name,
            )
        self.assertEqual(
            self.problems(entry(header="X Key"), env={"KNIGHTWATCHER_NAS_TEMP_HEADER": "v"}),
            ["sources.json[0].header: a header's name is letters, digits and -"],
        )
        self.assertEqual(
            self.problems(entry(header="X-Key", secret="nas-1"), env={}),
            ["sources.json[0].secret: use letters, digits and underscores"],
        )
        self.assertEqual(
            self.problems(entry(secret="nas")), ["sources.json[0].secret: only applies with header"]
        )

    def test_the_paces(self):
        self.assertEqual(
            self.problems(entry(every_s=5)), ["sources.json[0].every_s: must be from 10 to 3600"]
        )
        self.assertEqual(
            self.problems(entry(for_s=-1)), ["sources.json[0].for_s: must be from 0 to 86400"]
        )


def check_borrows():
    return contract.BORROWS


class CompileTest(unittest.TestCase):
    """An entry as the provider file it is compiled into."""

    def test_the_address_is_given_whole(self):
        spec, given = check.compile_entry(
            {**entry(url="http://192.0.2.40:8080/api/{v}/status?pretty=1&q=a%20b"), "header": ""}
        )
        self.assertEqual((spec.id, spec.kind, spec.credentials), ("check", "check", {}))
        self.assertEqual(given["url"], "http://192.0.2.40:8080")
        [request] = spec.requests
        self.assertEqual(request.path.parts, ("/api/{v}/status",))
        self.assertEqual(
            [(k, t.parts) for k, t in request.query], [("pretty", ("1",)), ("q", ("a b",))]
        )
        self.assertEqual(
            [(k, t.text) for k, t in request.headers], [("Accept", "application/json")]
        )
        spec, given = check.compile_entry({**entry(url="http://192.0.2.40"), "header": ""})
        self.assertEqual(spec.requests[0].path.parts, ("/",))

    def test_the_header_takes_the_credential(self):
        spec, _ = check.compile_entry({**entry(), "header": "X-Api-Key"})
        self.assertEqual(list(spec.credentials), ["header"])
        self.assertEqual(
            [(k, t.text) for k, t in spec.requests[0].headers],
            [("Accept", "application/json"), ("X-Api-Key", "{credential.header}")],
        )
        spec, _ = check.compile_entry({**entry(), "header": "Accept"})
        self.assertEqual([k for k, _ in spec.requests[0].headers], ["Accept"])

    def test_a_change_of_what_is_read_changes_the_digest(self):
        a, _ = check.compile_entry({**entry(), "header": ""})
        b, _ = check.compile_entry({**entry(path="$.disks[1].temp_c"), "header": ""})
        c, _ = check.compile_entry({**entry(headline="other"), "header": ""})
        self.assertNotEqual(a.digest, b.digest)
        self.assertEqual(a.digest, c.digest)


class JudgeTest(unittest.TestCase):
    """The tests, and what fails a read."""

    def reading(self, fill, **over):
        settings = {**entry(**over), "header": ""}
        return kind_class("check")().reading(fill, settings, None, T0).data

    def test_each_test(self):
        holds = [
            ("equals", 70, 70.0), ("equals", "ok", "ok"), ("equals", True, True),
            ("above", 70, 71), ("above", 70, "70.5"), ("above", 70, " 71 "), ("below", 10, -3),
            ("below", 1, ".5"), ("contains", "warn", "a warning"), ("contains", 3, [1, 3]),
            ("contains", "sda", ["sdb", "sda"]),
        ]  # fmt: skip
        fails = [
            ("equals", 70, "70"), ("equals", 1, True), ("equals", True, 1), ("equals", "ok", "OK"),
            ("above", 70, 70), ("above", 70, "hot"), ("above", 0, True), ("above", 1, "1e3"),
            ("below", 10, 10), ("contains", "warn", "WARN"), ("contains", 3, "3 disks"),
            ("contains", "sda", []), ("contains", 3, 3),
        ]  # fmt: skip
        for test, value, found in holds:
            got = self.reading({"value": found}, test=test, value=value)
            self.assertTrue(got["holds"], (test, value, found))
        for test, value, found in fails:
            got = self.reading({"value": found}, test=test, value=value)
            self.assertFalse(got["holds"], (test, value, found))

    def test_missing(self):
        self.assertEqual(
            self.reading({}, test="missing", value=None), {"holds": True, "value": None}
        )
        for found in (0, "", False, {}, []):
            got = self.reading({"value": found}, test="missing", value=None)
            self.assertFalse(got["holds"], found)

    def test_nothing_found_or_no_value_fails_the_read(self):
        with self.assertRaisesRegex(SourceError, r"^nothing at \$\.disks\[0\]\.temp_c$"):
            self.reading({})
        with self.assertRaisesRegex(SourceError, r"^an object at \$\.disks\[0\]\.temp_c, where"):
            self.reading({"value": {"c": 1}})
        with self.assertRaisesRegex(SourceError, r"^a list at "):
            self.reading({"value": [1]}, test="equals", value=1)
        with self.assertRaisesRegex(SourceError, r"^an object at "):
            self.reading({"value": {"c": 1}}, test="contains", value=1)

    def test_the_words(self):
        settings = {**entry(), "header": ""}
        self.assertEqual(check.words(settings, 71), ("nas hot", "disk at 71 C"))
        self.assertEqual(check.words(settings, 71.25)[1], "disk at 71.25 C")
        self.assertEqual(check.words(settings, True)[1], "disk at true C")
        self.assertEqual(check.words(settings, "hot\n\tvery")[1], "disk at hot very C")
        self.assertEqual(check.words({**settings, "detail": ""}, 71), ("nas hot", ""))
        long = check.words({**settings, "detail": "{value}"}, "x" * 80)[1]
        self.assertEqual(len(long), 60)
        # For a list that contains the value, {value} is the element it holds.
        got = self.reading({"value": ["sdb", "sda"]}, test="contains", value="sda")
        self.assertEqual(got, {"holds": True, "value": "sda"})


def nas(temp) -> dict:
    return {"name": "vault", "disks": [{"name": "sda", "temp_c": temp}]}


class LoopbackTest(unittest.TestCase):
    """A check read through the engine from a service on the loopback, and run by the runner."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/status"] = (200, nas(71))
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.header = secrets.token_hex(16)

    def make(self, *entries, conditions=None):
        raw = {
            "collector": {"output_dir": self.tmp.name, "state_dir": self.tmp.name},
            "conditions": {"clear_after_s": 60, **(conditions or {})},
            "sources": {"json": list(entries)},
        }
        return build(raw, {"KNIGHTWATCHER_NAS_TEMP_HEADER": self.header})

    def runner(self, *entries, **kw):
        c = self.make(*entries, **kw)
        memory = Memory(self.tmp.name)
        return Runner(c, memory, clock=Clock())

    def url(self, path="/api/status"):
        return self.http.url + path

    def test_one_get_to_the_address_with_its_header(self):
        r = self.runner(entry(url=self.url("/api/status?pretty=1"), header="X-Api-Key"))
        self.http.routes["/api/status?pretty=1"] = (200, nas(71))
        state = r.cycle()
        [(path, headers)] = self.http.requests
        self.assertEqual(path, "/api/status?pretty=1")
        self.assertEqual(headers["X-Api-Key"], self.header)
        self.assertEqual(headers["Accept"], "application/json")
        self.assertEqual(headers["User-Agent"], "knightwatcher")
        self.assertEqual(
            state["conditions"],
            [{"id": "check:nas-temp", "as": "cpu_hot", "level": "warning",
              "since": "2026-01-15T21:00:00Z", "headline": "NAS HOT", "detail": "disk at 71 C"}],
        )  # fmt: skip
        self.assertEqual(
            state["sources"]["json:nas-temp"],
            {"ok": True, "at": "2026-01-15T21:00:00Z", "error": ""},
        )
        self.assertEqual(contract.validate(state), [])
        # No facts section, no events, and the header's value is written nowhere.
        self.assertEqual(set(state["facts"]), set(contract.FACT_SECTIONS))
        self.assertEqual(state["events"], [])
        with open(os.path.join(self.tmp.name, "memory.json"), encoding="utf-8") as fh:
            memory = fh.read()
        self.assertNotIn(self.header, json.dumps(state) + memory)

    def test_raised_held_and_cleared(self):
        r = self.runner(entry(url=self.url(), for_s=60))
        clock = r.clock
        self.assertEqual(r.cycle()["conditions"], [])  # holds, but not yet for 60 s
        clock.advance(60)
        [raised] = r.cycle()["conditions"]
        self.assertEqual(
            (raised["id"], raised["since"]), ("check:nas-temp", "2026-01-15T21:00:00Z")
        )
        # Cooler now: held through clear_after_s with the words it last had.
        self.http.routes["/api/status"] = (200, nas(64))
        clock.advance(60)
        [held] = r.cycle()["conditions"]
        self.assertEqual(held["detail"], "disk at 71 C")
        clock.advance(60)
        self.assertEqual(r.cycle()["conditions"], [])

    def test_a_failed_read_counts_as_the_test_failing(self):
        r = self.runner(entry(url=self.url()), conditions={"clear_after_s": 0})
        self.assertEqual(len(r.cycle()["conditions"]), 1)
        for route, error in (
            ((200, {"disks": []}), "nothing at $.disks[0].temp_c"),
            ((200, b"<html>"), "response is not JSON"),
            ((500, {"error": "x"}), "HTTP 500"),
        ):
            self.http.routes["/api/status"] = route
            r.clock.advance(60)
            state = r.cycle()
            self.assertEqual(state["conditions"], [], error)
            self.assertEqual(state["sources"]["json:nas-temp"]["error"], error)
        # A refused header pauses the source, as every source does.
        self.http.routes["/api/status"] = (401, {"error": "who"})
        r.clock.advance(60)
        state = r.cycle()
        self.assertTrue(
            state["sources"]["json:nas-temp"]["error"].startswith(
                "HTTP 401: credentials refused; paused until "
            )
        )

    def test_no_redirect_is_followed(self):
        self.http.routes["/api/status"] = (302, None)
        r = self.runner(entry(url=self.url()))
        state = r.cycle()
        self.assertEqual(state["conditions"], [])
        self.assertFalse(state["sources"]["json:nas-temp"]["ok"])
        self.assertEqual(len(self.http.requests), 1)

    def test_a_check_sits_straight_after_the_condition_it_borrows(self):
        self.http.routes["/api/raid"] = (200, {"state": "degraded"})
        r = self.runner(
            entry(url=self.url()),
            entry(name="raid", url=self.url("/api/raid"), path="$.state", test="equals",
                  value="degraded", headline="RAID", detail="", **{"as": "disk_full"}),
            entry(name="nas-2", url=self.url(), headline="NAS 2"),
        )  # fmt: skip
        r.config.conditions["night"].update(start="00:00", end="23:59")
        state = r.cycle()
        self.assertEqual(
            [(c["id"], c.get("as"), c["level"]) for c in state["conditions"]],
            [
                ("check:raid", "disk_full", "warning"),
                ("check:nas-temp", "cpu_hot", "warning"),
                ("check:nas-2", "cpu_hot", "warning"),
                ("night", None, "sleep"),
            ],
        )
        self.assertEqual(contract.validate(state), [])

    def test_the_level_is_the_borrowed_conditions(self):
        for cid, level in (("attack", "critical"), ("ssh_session", "work"), ("streaming", "quiet"),
                           ("night", "sleep")):  # fmt: skip
            r = self.runner(entry(url=self.url(), **{"as": cid}))
            [c] = r.cycle()["conditions"]
            self.assertEqual((c["as"], c["level"]), (cid, level))

    def test_a_check_never_touches_the_facts_of_the_condition_it_borrows(self):
        r = self.runner(entry(url=self.url(), **{"as": "attack"}))
        state = r.cycle()
        self.assertIsNone(state["facts"]["security"])
        self.assertFalse(r.conditions.active("attack"))

    def test_a_change_of_words_keeps_the_check_and_a_change_of_test_restarts_it(self):
        r = self.runner(entry(url=self.url()))
        r.cycle()
        r.clock.advance(30)
        r.reconfigure(self.make(entry(url=self.url(), headline="DISK WARM")))
        [c] = r.cycle()["conditions"]
        self.assertEqual((c["headline"], c["since"]), ("DISK WARM", "2026-01-15T21:00:00Z"))
        r.clock.advance(30)
        r.reconfigure(self.make(entry(url=self.url(), value=60)))
        # Read again at once, since what it reads changed, and raised afresh.
        [c] = r.cycle()["conditions"]
        self.assertEqual(c["since"], "2026-01-15T21:01:00Z")
        r.reconfigure(self.make())
        self.assertEqual(r.cycle()["conditions"], [])
        self.assertEqual(r.conditions.checks, {})
        self.assertNotIn("check:nas-temp", r.conditions.trackers)

    def test_through_kind_source(self):
        c = self.make(entry(url=self.url()))
        [source] = build_sources(c)
        self.assertIsInstance(source, KindSource)
        self.assertEqual(source.provider_settings["url"], self.http.url)
        self.assertEqual(source.settings["url"], self.url())
        self.assertEqual(source.fill(T0), {"value": 71})
        self.assertEqual(source.fetch(T0), Reading(None, {"holds": True, "value": 71}))
        self.assertEqual(source.observe(source.fetch(T0), {}, T0), [])


class ConditionsTest(unittest.TestCase):
    """The condition from readings alone."""

    def test_words_are_cut_and_capitals(self):
        c = config(entry(headline="nas very hot!!", detail="{value}"))
        conds = Conditions(c)
        [got] = conds.evaluate(
            {"json:nas-temp": Reading(None, {"holds": True, "value": "y" * 70})}, T0
        )
        self.assertEqual(got["headline"], "NAS VERY HOT!!")
        self.assertEqual(len(got["detail"]), 60)

    def test_no_reading_is_the_test_failing(self):
        c = config(entry())
        conds = Conditions(c)
        self.assertEqual(conds.evaluate({"json:nas-temp": None}, T0), [])
        self.assertEqual(conds.evaluate({}, T0), [])
        self.assertEqual(conds.order()[:9], [
            "attack", "wan_down", "container_unhealthy", "disk_full", "backup_overdue",
            "pi_silent", "device_down", "cpu_hot", "check:nas-temp",
        ])  # fmt: skip


class ContractTest(unittest.TestCase):
    def state(self, *conditions):
        return {
            "schema": 1,
            "generated_at": "2026-01-15T21:00:00Z",
            "interval_s": 10,
            "conditions": list(conditions),
            "quiet_line": "ALL QUIET",
            "events": [],
            "facts": {},
            "sources": {"json:nas-temp": {"ok": True, "at": "2026-01-15T21:00:00Z", "error": ""}},
            "defaults": {"look": {}, "display": {}, "quiet": {}, "scenes": {}},
        }

    def cond(self, **over):
        out = {
            "id": "check:nas-temp",
            "as": "cpu_hot",
            "level": "warning",
            "since": "2026-01-15T21:00:00Z",
            "headline": "NAS HOT",
            "detail": "disk at 71 C",
        }
        out.update(over)
        return {k: v for k, v in out.items() if v is not None}

    def test_a_check_and_what_it_borrows(self):
        self.assertEqual(contract.validate(self.state(self.cond())), [])
        self.assertEqual(
            contract.validate(self.state(self.cond(**{"as": None}))),
            ["conditions[0].as is not a condition a check may borrow"],
        )
        self.assertEqual(
            contract.validate(self.state(self.cond(**{"as": "device_down"}))),
            ["conditions[0].as is not a condition a check may borrow"],
        )
        self.assertEqual(
            contract.validate(self.state(self.cond(id="check:NAS"))),
            ["conditions[0].id is unknown"],
        )
        self.assertEqual(
            contract.validate(self.state(self.cond(id="cpu_hot"))),
            ["conditions[0].as is on a condition that is not a check"],
        )
        self.assertEqual(
            contract.validate(self.state(self.cond(), self.cond())),
            ["conditions lists an id twice"],
        )


class CommandLineTest(unittest.TestCase):
    """--probe json:<name>, --record and --check-config."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/status"] = (200, nas(71))
        self.header = secrets.token_hex(16)
        env = {k: v for k, v in os.environ.items() if not k.startswith("KNIGHTWATCHER_")}
        env["KNIGHTWATCHER_NAS_HEADER"] = self.header
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.config = os.path.join(self.tmp.name, "config.toml")
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.tmp.name}"\nstate_dir = "{self.tmp.name}"\n'
                "[[sources.json]]\n"
                'name = "nas-temp"\n'
                f'url = "{self.http.url}/api/status?pretty=1"\n'
                'path = "$.disks[0].name"\n'
                'test = "equals"\n'
                'value = "sda"\n'
                'headline = "NAS"\n'
                'as = "cpu_hot"\n'
                'header = "X-Api-Key"\n'
                'secret = "nas"\n'
            )

    def run_main(self, *args):
        err, out = io.StringIO(), io.StringIO()
        admin = os.path.join(self.tmp.name, "admin.json")
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, "--admin", admin, *args])
        return code, out.getvalue(), err.getvalue()

    def test_probe_masks_the_value_and_says_whether_the_test_holds(self):
        self.http.routes["/api/status?pretty=1"] = (200, nas(71))
        code, out, err = self.run_main("--probe", "json:nas-temp")
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(
            out,
            "probe json:nas-temp: provider check (the check nas-temp)\n"
            "credentials: KNIGHTWATCHER_NAS_HEADER\n"
            'fill:\n{\n "value": "<string 3>"\n}\nfacts:\nnull\ntest: equals holds\n',
        )
        self.assertNotIn(self.header, out)

    def test_record_keeps_the_path_and_masks_the_header(self):
        self.http.routes["/api/status?pretty=1"] = (200, nas(71))
        folder = os.path.join(self.tmp.name, "rec")
        code, _, _ = self.run_main("--probe", "json:nas-temp", "--record", folder)
        self.assertEqual(code, 0)
        [name] = os.listdir(folder)
        self.assertTrue(name.startswith("json-nas-temp-"), name)
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn(self.header, text)
        doc = json.loads(text)
        [exchange] = doc["exchanges"]
        self.assertEqual(exchange["request"]["path"], "/api/status?pretty=1")
        self.assertEqual(exchange["request"]["headers"]["X-Api-Key"], "{credential.header}")

    def test_a_probe_of_a_check_not_set_up(self):
        code, _, err = self.run_main("--probe", "json:raid")
        self.assertEqual(
            (code, err),
            (2, 'probe: no [[sources.json]] entry named "raid" is not set up, or is off\n'),
        )

    def test_check_config_names_the_source(self):
        code, out, _ = self.run_main("--check-config")
        self.assertEqual(code, 0)
        self.assertEqual(out, "config ok: 1 sources enabled (json:nas-temp)\n")
        c = load(self.config, os.environ)
        self.assertEqual(c.where("json:nas-temp"), "sources.json[0]")


class OtherSourcesTest(unittest.TestCase):
    """A check beside the other sources changes nothing of theirs."""

    def test_the_state_without_its_check_is_the_same(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/api/status"] = (200, nas(71))
        states = []
        for entries in ([], [entry(url=http.url + "/api/status", **{"as": "night"})]):
            with tempfile.TemporaryDirectory() as tmp:
                raw = {
                    "collector": {"output_dir": tmp, "state_dir": tmp},
                    "conditions": {"night": {"start": "00:00", "end": "23:59"}},
                    "sources": {"json": entries},
                }
                r = Runner(build(raw, {}), Memory(tmp), clock=Clock(T0 + dt.timedelta(hours=1)))
                states.append(r.cycle())
        without, with_check = states
        self.assertEqual([c["id"] for c in with_check["conditions"]], ["night", "check:nas-temp"])
        with_check["conditions"] = [c for c in with_check["conditions"] if "as" not in c]
        del with_check["sources"]["json:nas-temp"]
        self.assertEqual(without, with_check)


if __name__ == "__main__":
    unittest.main()
