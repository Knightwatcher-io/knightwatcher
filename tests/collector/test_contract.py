"""The contract check against docs/state.md: facts.devices, device_down, defaults and the parts."""

import copy
import json
import os
import re
import unittest

from collector import contract

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEVICES = {
    "list": [
        {
            "name": "Pi",
            "kind": "pi",
            "state": "up",
            "alert": True,
            "seen": True,
            "since": "2026-01-15T08:02:40Z",
        },
        {
            "name": "NAS",
            "kind": "machine",
            "state": "down",
            "alert": True,
            "seen": True,
            "since": "2026-01-15T21:36:10Z",
        },
        {
            "name": "Gate cam",
            "kind": "camera",
            "state": "unknown",
            "alert": True,
            "seen": False,
            "since": None,
        },
        {
            "name": "Study laptop",
            "kind": "machine",
            "state": "down",
            "alert": False,
            "seen": False,
            "since": "2026-01-15T21:00:04Z",
        },
    ]
}

DEVICE_DOWN = {
    "id": "device_down",
    "level": "warning",
    "since": "2026-01-15T21:36:10Z",
    "headline": "NAS DOWN",
    "detail": "no answer for 6 min",
    "devices": [1],
}


def state(devices=DEVICES, conditions=(DEVICE_DOWN,)) -> dict:
    return {
        "schema": 1,
        "generated_at": "2026-01-15T21:42:10Z",
        "interval_s": 10,
        "conditions": copy.deepcopy(list(conditions)),
        "quiet_line": "ALL QUIET",
        "events": [],
        "facts": {"pi": {"up": True}, "devices": copy.deepcopy(devices)},
        "sources": {"device:NAS": {"ok": True, "at": "2026-01-15T21:42:01Z", "error": ""}},
        "defaults": {"look": {}, "display": {}, "quiet": {}, "scenes": {}},
    }


def broken(change) -> list[str]:
    """The problems found once change has been applied to a valid state."""
    s = state()
    change(s)
    return contract.validate(s)


def entry(s, i=1):
    return s["facts"]["devices"]["list"][i]


class DevicesContractTest(unittest.TestCase):
    def test_a_valid_section_passes(self):
        self.assertEqual(contract.validate(state()), [])
        self.assertEqual(contract.validate(state(None, ())), [])
        # A kind the page may not know yet is still a kind.
        s = state()
        entry(s, 2)["kind"] = "base/owl"
        self.assertEqual(contract.validate(s), [])
        self.assertIn("devices", contract.FACT_SECTIONS)

    def test_the_section(self):
        def set_devices(value):
            return lambda s: s["facts"].__setitem__("devices", value)

        shape = "facts.devices is not null or an object with list alone"
        self.assertIn("facts.devices is neither an object nor null", broken(set_devices([])))
        self.assertIn(shape, broken(set_devices({"list": DEVICES["list"], "more": 1})))
        self.assertIn(shape, broken(set_devices({})))
        size = "facts.devices.list is not a list of 1 to 32"
        self.assertIn(size, broken(set_devices({"list": []})))
        self.assertIn(size, broken(set_devices({"list": DEVICES["list"] * 9})))
        self.assertIn(size, broken(set_devices({"list": {"NAS": {}}})))

    def test_each_field(self):
        w = "facts.devices.list[1]"
        cases = [
            (
                lambda s: s["facts"]["devices"]["list"].__setitem__(1, "NAS"),
                f"{w} is not an object",
            ),
            (
                lambda s: entry(s).__setitem__("name", ""),
                f"{w}.name is not 1 to 20 printable ASCII characters",
            ),
            (
                lambda s: entry(s).__setitem__("name", "V" * 21),
                f"{w}.name is not 1 to 20 printable ASCII characters",
            ),
            (
                lambda s: entry(s).__setitem__("name", "NÄS"),
                f"{w}.name is not 1 to 20 printable ASCII characters",
            ),
            (lambda s: entry(s).__setitem__("name", "pi"), f"{w}.name is listed twice"),
            (lambda s: entry(s).pop("kind"), f"{w}.kind is not text of 1 to 200"),
            (
                lambda s: entry(s).__setitem__("kind", "x" * 201),
                f"{w}.kind is not text of 1 to 200",
            ),
            (
                lambda s: entry(s).__setitem__("state", "gone"),
                f"{w}.state is not up, down or unknown",
            ),
            (lambda s: entry(s).__setitem__("alert", 1), f"{w}.alert is not true or false"),
            (lambda s: entry(s).pop("seen"), f"{w}.seen is not true or false"),
            (lambda s: entry(s).__setitem__("since", None), f"{w}.since is not a UTC timestamp"),
            (
                lambda s: entry(s).__setitem__("since", "15 Jan 21:36"),
                f"{w}.since is not a UTC timestamp",
            ),
            (
                lambda s: entry(s, 2).__setitem__("since", "2026-01-15T21:36:10Z"),
                "facts.devices.list[2].since is not null while unknown",
            ),
            (
                lambda s: entry(s, 3).__setitem__("state", "up"),
                "facts.devices.list[3] is up but not seen",
            ),
        ]
        for change, problem in cases:
            with self.subTest(problem=problem):
                self.assertIn(problem, broken(change))

    def test_device_down_carries_the_positions_of_the_devices(self):
        bad = "conditions[0].devices is not positions in facts.devices.list"
        for places in (None, [], [4], [-1], [1, 1], [True], ["NAS"], 1):
            with self.subTest(places=places):

                def change(s, places=places):
                    s["conditions"][0]["devices"] = places

                self.assertIn(bad, broken(change))
        self.assertIn(bad, broken(lambda s: s["conditions"][0].pop("devices")))
        # With no devices listed, nothing can be down.
        self.assertIn(bad, contract.validate(state(None)))
        self.assertEqual(
            contract.validate(state(conditions=[{**DEVICE_DOWN, "devices": [3, 1]}])), []
        )

    def test_the_examples_in_the_docs_keep_the_contract(self):
        with open(os.path.join(ROOT, "docs", "state.md"), encoding="utf-8") as fh:
            doc = fh.read()
        documents = [
            d
            for d in (json.loads(block) for block in re.findall(r"```json\n(.*?)\n```", doc, re.S))
            if isinstance(d, dict) and "schema" in d
        ]
        self.assertGreaterEqual(len(documents), 2)
        for d in documents:
            self.assertEqual(contract.validate(d), [])
        self.assertTrue(any(d["facts"].get("devices") for d in documents))
        self.assertTrue(any(c["id"] == "device_down" for d in documents for c in d["conditions"]))
        self.assertTrue(any("as" in c for d in documents for c in d["conditions"]))
        self.assertTrue(any(any(d["defaults"].values()) for d in documents))
        self.assertTrue(any("quiet_parts" in d for d in documents))
        typed = {e["type"] for d in documents for e in d["events"] if "parts" in e}
        self.assertEqual(typed, set(contract.EVENT_PARTS))


STRAINED = {
    "id": "cpu_hot",
    "level": "warning",
    "since": "2026-01-15T21:30:02Z",
    "headline": "NAS MEMORY 93%",
    "detail": "93% for 12 min · CPU 41% · load 3.1",
    "machines": [
        {
            "name": "NAS",
            "device": 1,
            "window_s": 30,
            "memory": {"pct": 93.4, "threshold": 90.0, "since": "2026-01-15T21:30:02Z"},
        }
    ],
}


class StrainContractTest(unittest.TestCase):
    """cpu_hot, Under strain, carries the machines under strain."""

    def check(self, change=None):
        s = state(conditions=[DEVICE_DOWN, STRAINED])
        if change:
            change(s["conditions"][1])
        return contract.validate(s)

    def test_a_valid_entry_passes(self):
        self.assertEqual(self.check(), [])

        def both(c):
            c["machines"][0].pop("device")
            c["machines"][0]["cpu"] = {"pct": 97, "threshold": 85, "since": c["since"]}

        self.assertEqual(self.check(both), [])

    def test_the_machines(self):
        w = "conditions[1].machines"
        pair = {"pct": 97.0, "threshold": 85.0, "since": "2026-01-15T21:30:02Z"}

        def machines(value):
            return lambda c: c.__setitem__("machines", value)

        def first(**over):
            def change(c):
                c["machines"][0].update(over)
                for k, v in over.items():
                    if v is None:
                        del c["machines"][0][k]

            return change

        cases = [
            (lambda c: c.pop("machines"), f"{w} is not a list of 1 to 33 machines"),
            (machines([]), f"{w} is not a list of 1 to 33 machines"),
            (machines([{"name": f"M{i}", "window_s": 30, "cpu": pair} for i in range(34)]),
             f"{w} is not a list of 1 to 33 machines"),
            (machines(["NAS"]), f"{w}[0] is not an object"),
            (first(name=" NAS"), f"{w}[0].name is not 1 to 20 printable ASCII characters"),
            (first(spare=1), f"{w}[0] has a key other than name, device, window_s, cpu and memory"),
            (first(device=4), f"{w}[0].device is not a position in facts.devices.list"),
            (first(device=True), f"{w}[0].device is not a position in facts.devices.list"),
            (first(window_s=0), f"{w}[0].window_s is not a positive whole number"),
            (first(memory=None), f"{w}[0] has neither cpu nor memory"),
            (first(memory={"pct": 93.4}),
             f"{w}[0].memory is not an object of pct, threshold and since"),
            (first(memory={**pair, "pct": "93"}),
             f"{w}[0].memory.pct and threshold are not numbers"),
            (first(memory={**pair, "since": "now"}), f"{w}[0].memory.since is not a UTC timestamp"),
            (
                lambda c: c["machines"].append({"name": "NAS", "window_s": 30, "cpu": pair}),
                f"{w}[1].name is listed twice",
            ),
        ]  # fmt: skip
        for change, problem in cases:
            with self.subTest(problem=problem):
                self.assertIn(problem, self.check(change))

    def test_the_example_in_the_docs_names_its_machines(self):
        with open(os.path.join(ROOT, "docs", "state.md"), encoding="utf-8") as fh:
            doc = fh.read()
        documents = [
            d
            for d in (json.loads(block) for block in re.findall(r"```json\n(.*?)\n```", doc, re.S))
            if isinstance(d, dict) and "schema" in d
        ]
        strained = [c for d in documents for c in d["conditions"] if c["id"] == "cpu_hot"]
        self.assertTrue(strained and all(c.get("machines") for c in strained))


class DefaultsContractTest(unittest.TestCase):
    def test_the_section(self):
        whole = "defaults is not an object with look, display, quiet and scenes"
        self.assertEqual(broken(lambda s: s.pop("defaults")), [whole])
        self.assertEqual(broken(lambda s: s.update(defaults=None)), [whole])
        self.assertEqual(broken(lambda s: s["defaults"].pop("quiet")), [whole])
        # scenes is written always, holding only what the config set
        self.assertEqual(broken(lambda s: s["defaults"].pop("scenes")), [whole])
        self.assertEqual(broken(lambda s: s["defaults"].update(extra={})), [whole])
        for table in ("look", "scenes"):
            self.assertEqual(
                broken(lambda s, t=table: s["defaults"].update({t: []})),
                ["defaults.look, .display, .quiet and .scenes are not all objects"],
            )

    def test_the_values_follow_the_config_rules(self):
        def given(**tables):
            return lambda s: s["defaults"].update(tables)

        self.assertEqual(
            broken(
                given(
                    look={"build": "a", "skin": "warm", "monarch_skin": "deep"},
                    display={"headline": "large", "clock": 12, "helmet_indoors": True},
                    quiet={"scenes": ["yard", "camp"], "minutes": 240},
                    scenes={"cpu_hot": "camp", "pi_silent": "battlement"},
                )
            ),
            [],
        )
        # a known scene the page cannot act the condition in keeps the contract; the page
        # ignores it
        self.assertEqual(broken(given(scenes={"night": "court"})), [])
        self.assertEqual(
            broken(given(look={"monarch_hair": "silver", "monarch_robe": "sable"})), []
        )
        self.assertEqual(
            broken(given(scenes={"cpu": "camp", "attack": "moon"}, look={"monarch_robe": "red"})),
            [
                'defaults.look.monarch_robe: unknown value "red"; use blue, forest, violet, wine, '
                'teal or sable, or a long name, "<pack>/<id>"',
                "defaults.scenes.cpu: unknown condition",
                'defaults.scenes.attack: unknown value "moon"; use battlement, camp, house, yard, '
                'cellar, smithy or court, or a long name, "<pack>/<id>"',
            ],
        )
        # the world, the parts and their tables, by long names checked for their form alone
        self.assertEqual(
            broken(
                given(
                    look={
                        "world": "kw.cyber/world.neon",
                        "foe": "kw.cyber/foe.drone",
                        "build": "kw.cyber/body.courier",
                        "skin": "kw.cyber/chrome",
                        "monarch_skin": "kw.cyber/chrome",
                        "monarch_robe": "kw.cyber/panel",
                        "pet_coat": "kw.cyber/steel",
                        "items": {"main": "kw.base/main.arming"},
                        "devices": {"camera": "medieval", "pi": "kw.cyber/props.neon"},
                    },
                    quiet={"scenes": ["kw.cyber/scene.roof", "camp"]},
                    scenes={"cpu_hot": "kw.cyber/scene.lab"},
                )
            ),
            [],
        )
        self.assertEqual(
            broken(given(look={"skin": "pale"}, quiet={"minutes": 0, "pace": 3})),
            [
                'defaults.look.skin: unknown value "pale"; use fair, warm, golden, tan, brown '
                'or deep, or a long name, "<pack>/<id>"',
                "defaults.quiet.pace: unknown setting",
                "defaults.quiet.minutes: must be a whole number from 1 to 240",
            ],
        )


if __name__ == "__main__":
    unittest.main()


QUIET_PARTS = [
    {"k": "quiet"},
    {"k": "up", "n": "29"},
    {"k": "backup", "at": "03:12"},
    {"k": "ads", "n": "4,812", "short": "4.8k"},
]


def event(type_, parts, text="CAPTION"):
    e = {"seq": 1, "type": type_, "at": "2026-01-15T21:42:07Z", "count": 1, "text": text}
    if parts is not None:
        e["parts"] = parts
    return e


class PartsContractTest(unittest.TestCase):
    def test_quiet_parts_are_optional_and_keep_their_shape(self):
        self.assertEqual(broken(lambda s: s.update(quiet_parts=copy.deepcopy(QUIET_PARTS))), [])
        self.assertEqual(broken(lambda s: s.update(quiet_parts=[{"k": "quiet"}])), [])
        self.assertEqual(
            broken(lambda s: s.update(quiet_parts=[QUIET_PARTS[0], QUIET_PARTS[3]])), []
        )
        self.assertEqual(
            broken(lambda s: s.update(quiet_parts=[])), ["quiet_parts is not a list of parts"]
        )
        self.assertEqual(
            broken(lambda s: s.update(quiet_parts=[{"k": "quiet"}, {"k": "moon"}])),
            ["quiet_parts[1].k is unknown"],
        )
        self.assertEqual(
            broken(lambda s: s.update(quiet_parts=[{"k": "quiet"}, {"k": "up", "n": 29}])),
            ["quiet_parts[1] has a value that is not text of 1 to 52"],
        )
        self.assertEqual(
            broken(lambda s: s.update(quiet_parts=[{"k": "quiet"}, {"k": "ads", "n": "4,812"}])),
            ["quiet_parts[1] does not have the values of its kind"],
        )
        order = "quiet_parts does not start with quiet and keep the order quiet, up, backup, ads"
        for parts in (
            [QUIET_PARTS[1]],
            [QUIET_PARTS[0], QUIET_PARTS[2], QUIET_PARTS[1]],
            [QUIET_PARTS[0], QUIET_PARTS[1], QUIET_PARTS[1]],
        ):
            self.assertEqual(broken(lambda s, p=parts: s.update(quiet_parts=p)), [order])

    def test_event_parts_are_optional_and_named_by_type(self):
        def events(*given):
            return lambda s: s.update(events=[{**e, "seq": i} for i, e in enumerate(given)])

        good = [
            event("ip_banned", {"addr": "203.0.113.77", "jail": "sshd"}),
            event("ip_banned", {"addr": "203.0.113.77"}),
            event("ip_banned", None),
            event("import", {"title": "A Film (2024)"}),
            event("backup_done", {"at": "03:12"}),
            event("ad_blocked", None, text=""),
        ]
        self.assertEqual(broken(events(*good)), [])
        self.assertEqual(
            broken(events(event("ad_blocked", {"n": "3"}, text=""))),
            ["events[0].parts is on a type that has none"],
        )
        names = "events[0].parts does not have the names of its type"
        for type_, parts in (
            ("ip_banned", {"jail": "sshd"}),
            ("import", {"title": "A Film", "year": "2024"}),
            ("backup_done", ["03:12"]),
        ):
            self.assertEqual(broken(events(event(type_, parts))), [names])
        value = "events[0].parts has a value that is not text of 1 to 44"
        for parts in ({"title": ""}, {"title": "x" * 45}, {"title": 7}):
            self.assertEqual(broken(events(event("import", parts))), [value])


def streams(section) -> list[str]:
    return broken(lambda s: s["facts"].update(streams=section))


class StreamsContractTest(unittest.TestCase):
    def test_each_mode_of_show_keeps_the_contract(self):
        names = {
            "count": 2,
            "titles": ["Harbour of Glass", "Fen Owls - Low Tide"],
            "sessions": [{"who": "Sam", "title": "Harbour of Glass"}, {"who": "Alex"}],
        }
        self.assertEqual(streams(names), [])
        titles = {
            "count": 2,
            "titles": ["Harbour of Glass"],
            "sessions": [{"title": "Harbour of Glass"}],
        }
        self.assertEqual(streams(titles), [])
        self.assertEqual(streams({"count": 0}), [])
        self.assertEqual(streams({"count": 1, "titles": []}), [])
        self.assertEqual(streams(None), [])

    def test_the_section(self):
        self.assertEqual(
            streams({"titles": []}),
            ["facts.streams is not count, with titles and sessions alone beside it"],
        )
        self.assertEqual(
            streams({"count": 1, "player": "Lounge TV"}),
            ["facts.streams is not count, with titles and sessions alone beside it"],
        )
        self.assertEqual(streams({"count": -1}), ["facts.streams.count is not a whole number"])
        self.assertEqual(streams({"count": True}), ["facts.streams.count is not a whole number"])
        self.assertEqual(
            streams({"count": 1, "titles": [""]}),
            ["facts.streams.titles is not a list of text of 1 to 60"],
        )
        self.assertEqual(
            streams({"count": 1, "sessions": []}),
            ["facts.streams.sessions is not a list of 1 to 32 sessions"],
        )
        self.assertEqual(
            streams({"count": 33, "sessions": [{"title": "Harbour of Glass"}] * 33}),
            ["facts.streams.sessions is not a list of 1 to 32 sessions"],
        )
        self.assertEqual(
            streams({"count": 1, "sessions": [{}, {"who": "Sam", "device": "TV"}]}),
            [
                "facts.streams.sessions[0] is not an object with who, title or both",
                "facts.streams.sessions[1] is not an object with who, title or both",
            ],
        )
        self.assertEqual(
            streams({"count": 1, "sessions": [{"who": "x" * 17}, {"title": "y" * 61}]}),
            [
                "facts.streams.sessions[0] has a who or a title that is empty or too long",
                "facts.streams.sessions[1] has a who or a title that is empty or too long",
            ],
        )
