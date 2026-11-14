"""The settings schema, collector/settings-schema.json, against everything that follows it.

The collector builds its defaults and plain checks from the schema; these tests check that the
schema is whole and well formed, that what the collector holds agrees with it, and that the
templates (config.example.toml, .env.example) and compose.yaml name exactly what it names. The
page's side is checked by tests/web/settings-schema.test.js, and the generated copies by
tests/tools/settings-schema.test.js.
"""

import os
import re
import tomllib
import unittest

from collector import config, schema

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = schema.SCHEMA
TYPES = {"integer", "number", "string", "boolean", "list"}
SETTING_FIELDS = {
    "key", "type", "items", "item_keys", "values", "acts", "min", "above", "max", "min_items",
    "max_items", "problem", "default", "page_default", "required", "required_problem", "form",
    "unit", "scope", "gui", "editable", "help",
}  # fmt: skip
ENV_FIELDS = {
    "name", "scope", "required", "default", "mount", "example", "source", "field", "secret",
    "form", "gui", "editable", "help",
}  # fmt: skip
UNITS = {"seconds", "minutes", "hours", "percent", "bytes"}
DASHES = re.compile("[\u2013\u2014]")


def _python_type_ok(kind: str, value) -> bool:
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, {"string": str, "boolean": bool, "list": list}[kind])


def example_keys() -> dict[str, set[str]]:
    """Every key config.example.toml sets, by table, its commented settings included."""
    with open(os.path.join(ROOT, "config.example.toml"), encoding="utf-8") as fh:
        text = fh.read()
    # A commented setting is "# key = value", "# [[thing]]" or the header of a defaults table.
    setting = re.compile(r"^# (\[\[thing\]\]|\[(?:look|display|quiet|scenes)\]|[a-z_]+ = .+)$")
    lines = [m.group(1) if (m := setting.match(line)) else line for line in text.splitlines()]
    raw = tomllib.loads("\n".join(lines) + "\n")
    out: dict[str, set[str]] = {}
    for key, value in raw.items():
        if key == "thing":
            out["thing"] = {k for t in value for k in t}
        elif key in ("conditions", "sources"):
            for k, v in value.items():
                if isinstance(v, dict):
                    out[f"{key}.{k}"] = set(v)
                else:
                    out.setdefault(key, set()).add(k)
        else:
            out[key] = set(value)
    return out


class SchemaShapeTest(unittest.TestCase):
    def test_every_setting_is_described_whole(self):
        seen = set()
        for t in S["tables"]:
            self.assertTrue(t["help"], t["table"])
            keys = [s["key"] for s in t["settings"]]
            self.assertEqual(len(keys), len(set(keys)), f"{t['table']}: a key twice")
            self.assertNotIn(t["table"], seen)
            seen.add(t["table"])
            for s in t["settings"]:
                where = f"{t['table']}.{s['key']}"
                self.assertLessEqual(set(s), SETTING_FIELDS, where)
                self.assertIn(s["type"], TYPES, where)
                self.assertIn(s["scope"], ("household", "display"), where)
                self.assertIn("default", s, f"{where}: a default, or null for none")
                self.assertIsInstance(s["editable"], bool, where)
                self.assertTrue(s["help"].strip(), where)
                self.assertIn("admin", s["gui"], where)
                for place in s["gui"].values():
                    self.assertTrue(place["section"] and place["label"], where)
                self.assertLessEqual(set(s["gui"]), {"admin", "wall"}, where)
                if s.get("unit") is not None:
                    self.assertIn(s["unit"], UNITS, where)
                if s["default"] is not None:
                    self.assertTrue(_python_type_ok(s["type"], s["default"]), where)
                    if "values" in s and s["type"] != "list":
                        self.assertIn(s["default"], s["values"], where)
                    if any(k in s for k in ("min", "above", "max")):
                        self.assertIsNone(schema.range_problem(s, s["default"]), where)
                if "page_default" in s and s["page_default"] is not None:
                    allowed = s.get("acts", s.get("values"))
                    if s["type"] == "list":
                        self.assertLessEqual(set(s["page_default"]), set(allowed), where)
                    elif allowed is not None:
                        self.assertIn(s["page_default"], allowed, where)
        for e in S["env"]:
            self.assertLessEqual(set(e), ENV_FIELDS, e["name"])
            self.assertIn(e["scope"], ("credential", "path"), e["name"])
            self.assertIs(e["editable"], False, f"{e['name']}: the GUI never changes it")
            self.assertTrue(e["help"].strip() and e["example"], e["name"])
            self.assertRegex(e["name"], r"^KNIGHTWATCHER_[A-Z0-9_]+$")

    def test_the_display_settings_appear_on_the_wall_and_the_rest_do_not(self):
        for t in S["tables"]:
            for s in t["settings"]:
                where = f"{t['table']}.{s['key']}"
                self.assertEqual(s["scope"] == "display", bool(t.get("defaults_for")), where)
                self.assertEqual("wall" in s["gui"], s["scope"] == "display", where)
                self.assertEqual("page_default" in s, s["scope"] == "display", where)

    def test_credentials_and_paths_are_never_changed_in_the_gui(self):
        for t in S["tables"]:
            for s in t["settings"]:
                if s["key"] == "secret":
                    self.assertIs(s["editable"], False, t["table"])

    def test_the_help_is_plain(self):
        texts = [S["about"]] + [t["help"] for t in S["tables"]]
        texts += [s["help"] for t in S["tables"] for s in t["settings"]]
        texts += [e["help"] for e in S["env"]] + [c["help"] for c in S["conditions"]]
        for text in texts:
            self.assertIsNone(DASHES.search(text), text)
            self.assertNotRegex(text, r"\b(color|colors|license)\b", text)


class CollectorAgreesTest(unittest.TestCase):
    def test_conditions_and_scenes(self):
        self.assertEqual(config.CONDITION_IDS, [c["id"] for c in S["conditions"]])
        self.assertEqual(schema.setting("conditions", "priority")["default"], config.CONDITION_IDS)
        self.assertEqual(list(config.PAGE_SCENES), [s["id"] for s in S["scenes"]])
        quiet = schema.setting("quiet", "scenes")
        self.assertEqual(list(config.QUIET_SCENES), quiet["values"])
        self.assertEqual(list(config.QUIET_SCENES), quiet["page_default"])
        for cid in config.CONDITION_IDS:
            self.assertIn(f"conditions.{cid}", schema.TABLES)
        own = {c["id"]: c["scene"] for c in S["conditions"]}
        for c in S["conditions"]:
            self.assertIn(c["scene"], (None, *config.PAGE_SCENES))
        for s in schema.settings("scenes"):
            self.assertIn(s["key"], config.CONDITION_IDS)
            self.assertEqual(s["values"], list(config.PAGE_SCENES), s["key"])
            self.assertLessEqual(set(s["acts"]), set(config.PAGE_SCENES), s["key"])
            self.assertEqual(s["page_default"], own[s["key"]], s["key"])
            self.assertIn(s["page_default"], s["acts"], s["key"])

    def test_tables_and_defaults(self):
        self.assertEqual(
            sorted(config.SOURCE_DEFAULTS),
            sorted(t["table"][8:] for t in S["tables"] if t["table"].startswith("sources.")),
        )
        self.assertEqual(config.COLLECTOR_DEFAULTS, schema.defaults("collector"))
        self.assertEqual(
            set(config.CONDITION_DEFAULTS), {"priority", "clear_after_s", *config.CONDITION_IDS}
        )
        self.assertEqual(config.DEFAULT_TABLES, ("look", "display", "quiet", "scenes"))
        for key, values in config.LOOK_CHOICES.items():
            self.assertEqual(list(values), schema.setting("look", key)["values"])
        c = config.build({})
        self.assertEqual(c.collector, config.COLLECTOR_DEFAULTS)
        self.assertEqual(c.conditions, config.CONDITION_DEFAULTS)
        # Every table the schema describes is one build accepts, and no other.
        known = {t["table"].split(".")[0] for t in S["tables"]}
        self.assertEqual(
            known, {"collector", "conditions", "sources", "thing", *config.DEFAULT_TABLES}
        )

    def test_every_source_that_logs_in_names_its_variables(self):
        by_source: dict[str, list[str]] = {}
        for e in schema.credentials():
            self.assertEqual(e["name"], schema.env_name(e["secret"], e["field"]))
            self.assertEqual(
                schema.setting(f"sources.{e['source']}", "secret")["default"], e["secret"]
            )
            by_source.setdefault(e["source"], []).append(e["field"])
        self.assertEqual(by_source, config.SECRET_FIELDS)
        with_secret = {
            t["table"][8:] for t in S["tables"] if any(s["key"] == "secret" for s in t["settings"])
        }
        self.assertEqual(with_secret, set(config.SECRET_FIELDS))


class TemplatesAgreeTest(unittest.TestCase):
    def test_config_example_sets_every_key_and_no_other(self):
        given = example_keys()
        described = {t["table"]: {s["key"] for s in t["settings"]} for t in S["tables"]}
        for table, keys in described.items():
            self.assertEqual(given.get(table, set()), keys, table)
        self.assertEqual(set(given) - set(described), set())

    def test_env_example_lists_every_variable_and_no_other(self):
        with open(os.path.join(ROOT, ".env.example"), encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        names = [m.group(1) for line in lines if (m := re.match(r"^([A-Z0-9_]+)=", line))]
        self.assertEqual(names, [e["name"] for e in S["env"]])
        # Each has a comment above it that says what its values may be.
        for e in S["env"]:
            at = next(i for i, line in enumerate(lines) if line.startswith(e["name"] + "="))
            block = []
            for line in reversed(lines[:at]):
                if not line.startswith("#") and not re.match(r"^[A-Z0-9_]+=", line):
                    break
                block.append(line)
            self.assertTrue(any("Possible values:" in line for line in block), e["name"])

    def test_compose_passes_each_credential_by_name_and_mounts_each_path(self):
        with open(os.path.join(ROOT, "compose.yaml"), encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn("env_file", text)
        self.assertNotIn("secrets.json", text)
        environment = text.split("    environment:\n", 1)[1].split("    volumes:\n", 1)[0]
        passed = re.findall(r"^      (KNIGHTWATCHER_[A-Z0-9_]+): \$\{\1:-\}$", environment, re.M)
        self.assertEqual(passed, [e["name"] for e in schema.credentials()])
        entries = [
            ln for ln in environment.splitlines() if ln.strip() and not ln.strip().startswith("#")
        ]
        self.assertEqual(len(entries), len(passed), "the environment names credentials alone")
        volumes = text.split("    volumes:\n", 1)[1]
        mounted = re.findall(r"\$\{(KNIGHTWATCHER_[A-Z0-9_]+)[:}]", volumes)
        paths = [e for e in S["env"] if e["scope"] == "path"]
        self.assertEqual(sorted(mounted), sorted(e["name"] for e in paths))
        for e in paths:
            target = re.search(r"\$\{" + e["name"] + r"[^\n]*\n\s+target: (\S+)", volumes)
            self.assertEqual(target.group(1), e["mount"], e["name"])
            required = re.search(r"\$\{" + e["name"] + r":\?", volumes) is not None
            self.assertEqual(required, e["required"], e["name"])


if __name__ == "__main__":
    unittest.main()
