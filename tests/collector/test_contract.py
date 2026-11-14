"""The contract check against docs/state.md: facts.things, thing_down and defaults."""

import copy
import json
import os
import re
import unittest

from collector import contract

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

THINGS = {
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
            "name": "Vault",
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

THING_DOWN = {
    "id": "thing_down",
    "level": "warning",
    "since": "2026-01-15T21:36:10Z",
    "headline": "VAULT DOWN",
    "detail": "no answer for 6 min",
    "things": [1],
}


def state(things=THINGS, conditions=(THING_DOWN,)) -> dict:
    return {
        "schema": 1,
        "generated_at": "2026-01-15T21:42:10Z",
        "interval_s": 10,
        "conditions": copy.deepcopy(list(conditions)),
        "quiet_line": "ALL QUIET",
        "events": [],
        "facts": {"pi": {"up": True}, "things": copy.deepcopy(things)},
        "sources": {"thing:Vault": {"ok": True, "at": "2026-01-15T21:42:01Z", "error": ""}},
        "defaults": {"look": {}, "display": {}, "quiet": {}, "scenes": {}},
    }


def broken(change) -> list[str]:
    """The problems found once change has been applied to a valid state."""
    s = state()
    change(s)
    return contract.validate(s)


def entry(s, i=1):
    return s["facts"]["things"]["list"][i]


class ThingsContractTest(unittest.TestCase):
    def test_a_valid_section_passes(self):
        self.assertEqual(contract.validate(state()), [])
        self.assertEqual(contract.validate(state(None, ())), [])
        # A kind the page may not know yet is still a kind.
        s = state()
        entry(s, 2)["kind"] = "base/owl"
        self.assertEqual(contract.validate(s), [])
        self.assertIn("things", contract.FACT_SECTIONS)

    def test_the_section(self):
        def set_things(value):
            return lambda s: s["facts"].__setitem__("things", value)

        shape = "facts.things is not null or an object with list alone"
        self.assertIn("facts.things is neither an object nor null", broken(set_things([])))
        self.assertIn(shape, broken(set_things({"list": THINGS["list"], "more": 1})))
        self.assertIn(shape, broken(set_things({})))
        size = "facts.things.list is not a list of 1 to 32"
        self.assertIn(size, broken(set_things({"list": []})))
        self.assertIn(size, broken(set_things({"list": THINGS["list"] * 9})))
        self.assertIn(size, broken(set_things({"list": {"Vault": {}}})))

    def test_each_field(self):
        w = "facts.things.list[1]"
        cases = [
            (
                lambda s: s["facts"]["things"]["list"].__setitem__(1, "Vault"),
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
                lambda s: entry(s).__setitem__("name", "Väult"),
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
                "facts.things.list[2].since is not null while unknown",
            ),
            (
                lambda s: entry(s, 3).__setitem__("state", "up"),
                "facts.things.list[3] is up but not seen",
            ),
        ]
        for change, problem in cases:
            with self.subTest(problem=problem):
                self.assertIn(problem, broken(change))

    def test_thing_down_carries_the_positions_of_the_things(self):
        bad = "conditions[0].things is not positions in facts.things.list"
        for places in (None, [], [4], [-1], [1, 1], [True], ["Vault"], 1):
            with self.subTest(places=places):

                def change(s, places=places):
                    s["conditions"][0]["things"] = places

                self.assertIn(bad, broken(change))
        self.assertIn(bad, broken(lambda s: s["conditions"][0].pop("things")))
        # With no things listed, nothing can be down.
        self.assertIn(bad, contract.validate(state(None)))
        self.assertEqual(
            contract.validate(state(conditions=[{**THING_DOWN, "things": [3, 1]}])), []
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
        self.assertTrue(any(d["facts"].get("things") for d in documents))
        self.assertTrue(any(c["id"] == "thing_down" for d in documents for c in d["conditions"]))
        self.assertTrue(any(any(d["defaults"].values()) for d in documents))


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
                "teal or sable",
                "defaults.scenes.cpu: unknown condition",
                'defaults.scenes.attack: unknown value "moon"; use battlement, camp, house, yard, '
                "cellar, smithy or court",
            ],
        )
        self.assertEqual(
            broken(given(look={"skin": "pale"}, quiet={"minutes": 0, "pace": 3})),
            [
                'defaults.look.skin: unknown value "pale"; use fair, warm, golden, tan, brown '
                "or deep",
                "defaults.quiet.pace: unknown setting",
                "defaults.quiet.minutes: must be a whole number from 1 to 240",
            ],
        )


if __name__ == "__main__":
    unittest.main()
