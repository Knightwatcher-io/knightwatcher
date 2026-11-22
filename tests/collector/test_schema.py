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

from collector import config, kinds, providers, schema

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = schema.SCHEMA
# scalar: text, a number, or true or false, as a check's value takes.
TYPES = {"integer", "number", "string", "boolean", "list", "table", "scalar"}
SETTING_FIELDS = {
    "key", "type", "items", "item_keys", "keys", "values", "values_from", "kind", "long", "acts",
    "min", "above", "max", "min_items", "max_items", "problem", "default", "default_note",
    "page_default", "required", "required_problem", "form", "unit", "scope", "gui", "editable",
    "help", "providers",
}  # fmt: skip
ENV_FIELDS = {
    "name", "scope", "required", "default", "mount", "services", "example", "provider", "field",
    "secret", "form", "gui", "editable", "help",
}  # fmt: skip
SERVICES = ("collector", "server")
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
    # A commented setting is "# key = value", "# [[device]]", "# [[sources.imports]]",
    # "# [[sources.json]]", the header of a source's table, such as "# [sources.streams]", or the
    # header of a defaults table; "# or: key = value" is a setting that replaces another in its
    # table, so it is counted here but left commented when the example's tables are loaded
    # uncommented (test_config).
    setting = re.compile(
        r"^# (?:or: )?(\[\[device\]\]|\[\[sources\.(?:imports|json)\]\]|\[sources\.[a-z]+\]"
        r"|\[(?:look|look\.items|look\.devices|display|quiet|scenes)\]|[a-z_]+ = .+)$"
    )
    lines = [m.group(1) if (m := setting.match(line)) else line for line in text.splitlines()]
    raw = tomllib.loads("\n".join(lines) + "\n")
    out: dict[str, set[str]] = {}
    for key, value in raw.items():
        if key == "device":
            out["device"] = {k for t in value for k in t}
        elif key in ("conditions", "sources"):
            for k, v in value.items():
                if isinstance(v, dict):
                    out[f"{key}.{k}"] = set(v)
                elif key == "sources" and k in kinds.LISTS:
                    out[f"{key}.{k}"] = {name for t in v for name in t}
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
                if s["type"] == "table":
                    self.assertTrue(s["keys"] and s["long"], where)
                    self.assertEqual(s["page_default"], {}, where)
                elif "page_default" in s and s["page_default"] is not None:
                    allowed = s.get("acts", s.get("values"))
                    if s["type"] == "list":
                        self.assertLessEqual(set(s["page_default"]), set(allowed), where)
                    elif allowed is not None:
                        self.assertIn(s["page_default"], allowed, where)
        for e in S["env"]:
            self.assertLessEqual(set(e), ENV_FIELDS, e["name"])
            self.assertIn(e["scope"], ("credential", "path", "server", "collector"), e["name"])
            self.assertLessEqual(set(e.get("services", ["collector"])), set(SERVICES), e["name"])
            if e["scope"] == "credential":
                self.assertEqual(e.get("services", ["collector"]), ["collector"], e["name"])
            if e["scope"] in ("server", "collector"):
                self.assertTrue(e["form"] and isinstance(e["default"], str), e["name"])
            if e["scope"] == "collector":
                self.assertEqual(e["services"], ["collector"], e["name"])
            self.assertIs(e["editable"], False, f"{e['name']}: the GUI never changes it")
            self.assertTrue(e["help"].strip() and e["example"], e["name"])
            self.assertRegex(e["name"], r"^KW_[A-Z0-9_]+$")

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

    def test_long_names(self):
        # The pattern the collector checks a long name with is the schema's, as the page's is.
        self.assertEqual(config.LONG_NAME.pattern, S["long_name"])
        longs = {
            f"{t['table']}.{s['key']}" for t in S["tables"] for s in t["settings"] if s.get("long")
        }
        scenes = {f"scenes.{s['key']}" for s in schema.settings("scenes")}
        self.assertEqual(
            longs,
            {"look.world", "look.monarch", "look.pet", "look.foe", "look.critter", "look.props"}
            | {"look.overlay", "look.build", "look.skin", "look.hair", "look.tabard", "look.plume"}
            | {"look.words", "look.items", "look.devices", "quiet.scenes"}
            | {"look.monarch_skin", "look.monarch_hair", "look.monarch_robe", "look.pet_coat"}
            | scenes,
        )
        self.assertEqual(dict(config.LOOK_TABLES), {
            "items": tuple(schema.setting("look", "items")["keys"]),
            "devices": ("pi", "camera", "machine", "vm", "box"),
        })  # fmt: skip

    def test_tables_and_defaults(self):
        sources = [t for t in S["tables"] if t["table"].startswith("sources.")]
        self.assertEqual(
            sorted(config.SOURCE_DEFAULTS),
            sorted(t["table"][8:] for t in sources if not t.get("many")),
        )
        # A list of tables under [sources] is one whose entries are read through a kind.
        self.assertEqual(
            sorted(config.LIST_DEFAULTS), sorted(t["table"][8:] for t in sources if t.get("many"))
        )
        self.assertEqual(sorted(config.LIST_DEFAULTS), sorted(kinds.LISTS))
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
            known, {"collector", "conditions", "sources", "device", *config.DEFAULT_TABLES}
        )

    def test_the_providers_listed_are_the_built_in_files(self):
        built = providers.builtin()
        listed = {p["id"]: p for p in S["providers"]}
        self.assertEqual(list(listed), sorted(listed), "the list is in the order of the ids")
        self.assertEqual(sorted(listed), sorted(built))
        for pid, spec in built.items():
            p = listed[pid]
            self.assertEqual(
                set(p), {"id", "kind", "name", "docs", "default", "credentials", "settings"}
            )
            self.assertEqual(
                (p["kind"], p["name"], p["docs"], p["credentials"], p["settings"]),
                (spec.kind, spec.name, spec.docs, list(spec.credentials), list(spec.settings)),
                pid,
            )

    def test_the_reference_lists_every_provider(self):
        with open(os.path.join(ROOT, "docs", "configuration.md"), encoding="utf-8") as fh:
            doc = fh.read()
        for p in S["providers"]:
            self.assertIn(f"| `{p['id']}` | {p['kind']} | [{p['name']}]({p['docs']}) |", doc)

    def test_each_section_read_through_a_kind_names_its_provider(self):
        built = providers.builtin()
        defaults = set()
        for section, kind in kinds.SECTIONS.items():
            table = f"sources.{section}"
            keys = {s["key"] for s in schema.settings(table)}
            self.assertIn("secret", keys, table)
            self.assertIsNone(schema.setting(table, "secret")["default"], table)
            if "from" in keys:
                chosen = schema.setting(table, "from")
                self.assertEqual((chosen["values_from"], chosen["kind"]), ("providers", kind))
                self.assertEqual(built[chosen["default"]].kind, kind, table)
                defaults.add(chosen["default"])
            else:
                # A section without from reads the provider of its own name.
                self.assertEqual(built[section].kind, kind, table)
        self.assertEqual({p["id"] for p in S["providers"] if p["default"]}, defaults)
        with_secret = {
            t["table"][8:] for t in S["tables"] if any(s["key"] == "secret" for s in t["settings"])
        }
        self.assertEqual(with_secret, set(kinds.SECTIONS) | set(kinds.LISTS))
        # A list's entry names its provider, of the list's kind, and has no default one; a check
        # of [[sources.json]] is compiled into a provider of its own.
        for name, kind in kinds.LISTS.items():
            table = f"sources.{name}"
            self.assertTrue(schema.TABLES[table]["many"], table)
            self.assertFalse(any(s["editable"] for s in schema.settings(table)), table)
            if kind == "check":
                keys = {s["key"] for s in schema.settings(table)}
                self.assertNotIn("from", keys)
                self.assertNotIn("check", kinds.KINDS, "no provider file can name the check kind")
                continue
            chosen = schema.setting(table, "from")
            self.assertEqual((chosen["values_from"], chosen["kind"]), ("providers", kind))
            self.assertIsNone(chosen["default"], table)
            self.assertTrue(chosen["required"] and schema.setting(table, "name")["required"])
            self.assertTrue(schema.TABLES[table]["many"], table)
            # Set in config.toml alone: nothing of it is set on the admin page.
            self.assertFalse(any(s["editable"] for s in schema.settings(table)), table)

    def test_a_setting_marked_with_its_providers_names_built_ins_of_its_kind(self):
        built = providers.builtin()
        marked = {}
        for section, kind in kinds.SECTIONS.items():
            for s in schema.settings(f"sources.{section}"):
                if "providers" in s:
                    marked[f"{section}.{s['key']}"] = s["providers"]
                    for pid in s["providers"]:
                        self.assertEqual(built[pid].kind, kind, f"{section}.{s['key']}")
                        # The provider lists it among its own settings.
                        self.assertIn(s["key"], built[pid].settings, pid)
        self.assertEqual(marked, {"security.database": ["fail2ban"]})
        # Every setting a built-in adapter declares is a marked setting of its section.
        for pid, spec in built.items():
            if isinstance(spec, providers.Adapter):
                for key in spec.settings:
                    self.assertIn(pid, marked[f"{spec.kind}.{key}"], pid)

    def test_every_provider_names_its_variables(self):
        by_provider: dict[str, list[str]] = {}
        for e in schema.credentials():
            self.assertEqual(e["name"], schema.env_name(e["secret"], e["field"]))
            # Each is read under the provider's id unless a section's secret says otherwise.
            self.assertEqual(e["secret"], e["provider"])
            self.assertIn(e["field"], config.CREDENTIAL_FIELDS)
            by_provider.setdefault(e["provider"], []).append(e["field"])
        self.assertEqual(
            by_provider,
            {p: list(s.credentials) for p, s in providers.builtin().items() if s.credentials},
        )


class TemplatesAgreeTest(unittest.TestCase):
    def test_config_example_sets_every_key_and_no_other(self):
        given = example_keys()
        described = {t["table"]: {s["key"] for s in t["settings"]} for t in S["tables"]}
        for table, keys in described.items():
            self.assertEqual(given.get(table, set()), keys, table)
        self.assertEqual(set(given) - set(described), set())

    def test_the_image_takes_the_two_packages_and_the_page_alone(self):
        # Everything else stays out of the build context, a top-level telemetry/ among it.
        with open(os.path.join(ROOT, ".dockerignore"), encoding="utf-8") as fh:
            rules = [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
        self.assertEqual(rules[0], "*")
        self.assertEqual(
            sorted(r[1:] for r in rules if r.startswith("!")), ["collector", "server", "web"]
        )

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
        text = compose_text()
        self.assertNotIn("env_file", text)
        self.assertNotIn("secrets.json", text)
        blocks = services(text)
        self.assertEqual(sorted(blocks), sorted(SERVICES))
        collector = blocks["collector"]
        environment = collector.split("    environment:\n", 1)[1].split("    volumes:\n", 1)[0]
        passed = re.findall(r"^      (KW_[A-Z0-9_]+): \$\{\1:-\}$", environment, re.M)
        # The collector's own variables (KW_ANALYTICS), then the credentials.
        own = [e["name"] for e in S["env"] if e["scope"] == "collector"]
        self.assertEqual(passed, own + [e["name"] for e in schema.credentials()])
        entries = [
            ln for ln in environment.splitlines() if ln.strip() and not ln.strip().startswith("#")
        ]
        self.assertEqual(
            len(entries), len(passed), "the environment names its own variables and credentials"
        )
        for name, block in blocks.items():
            volumes = block.split("    volumes:\n", 1)[1]
            mounted = re.findall(r"\$\{(KW_[A-Z0-9_]+)[:}]", volumes)
            paths = [
                e
                for e in S["env"]
                if e["scope"] == "path" and name in e.get("services", ["collector"])
            ]
            self.assertEqual(sorted(mounted), sorted(e["name"] for e in paths), name)
            for e in paths:
                target = re.search(r"\$\{" + e["name"] + r"[^\n]*\n\s+target: (\S+)", volumes)
                self.assertEqual(target.group(1), e["mount"], f"{name}: {e['name']}")
                required = re.search(r"\$\{" + e["name"] + r":\?", volumes) is not None
                self.assertEqual(required, e["required"], f"{name}: {e['name']}")
                default = re.search(r"\$\{" + e["name"] + r":-([^}]*)\}", volumes)
                if not e["required"]:
                    self.assertEqual(default.group(1), e["default"], f"{name}: {e['name']}")

    def test_the_server_gets_the_admin_password_alone_from_env(self):
        server = services(compose_text())["server"]
        environment = server.split("    environment:\n", 1)[1].split("    ports:\n", 1)[0]
        entries = [
            ln for ln in environment.splitlines() if ln.strip() and not ln.strip().startswith("#")
        ]
        self.assertEqual(entries, ["      KW_ADMIN_PASSWORD: ${KW_ADMIN_PASSWORD:-}"])
        named = set(re.findall(r"\$\{(KW_[A-Z0-9_]+)", server))
        mine = {e["name"] for e in S["env"] if "server" in e.get("services", ["collector"])}
        self.assertEqual(named, mine)
        self.assertNotIn("credential", {e["scope"] for e in S["env"] if e["name"] in named})
        # The admin password reaches the server and nothing else.
        password = next(e for e in S["env"] if e["name"] == "KW_ADMIN_PASSWORD")
        self.assertEqual(password["services"], ["server"])
        self.assertEqual(password["scope"], "server")
        self.assertNotIn("KW_ADMIN_PASSWORD", services(compose_text())["collector"])
        ports = server.split("    ports:\n", 1)[1].split("    volumes:\n", 1)[0]
        self.assertIn("${KW_SERVER_ADDRESS:+${KW_SERVER_ADDRESS:-}:}", ports)
        port = schema.SCHEMA["env"][[e["name"] for e in S["env"]].index("KW_SERVER_PORT")]
        self.assertIn("${KW_SERVER_PORT:-" + port["default"] + "}:8080", ports)
        for line in (
            "read_only: true",
            "cap_drop: [ALL]",
            "no-new-privileges:true",
            '"10001:10001"',
        ):
            self.assertIn(line, server)
        self.assertNotIn("network_mode", server)
        self.assertNotIn("/proc", server)
        out = re.search(r"\$\{KW_OUT[^\n]*\n\s+target: /out\n\s+read_only: true", server)
        self.assertIsNotNone(out, "the collector's output is mounted read-only")
        config = re.search(
            r"source: \./config\.toml\n\s+target: /etc/knightwatcher/config\.toml\n"
            r"\s+read_only: true",
            server,
        )
        self.assertIsNotNone(
            config, "config.toml is mounted read-only, for the admin page's checks"
        )

    def test_the_collector_reads_the_servers_folder_read_only(self):
        collector = services(compose_text())["collector"]
        mount = re.search(
            r"\$\{KW_SERVER_VAR:-[^}]*\}\n\s+target: (\S+)\n\s+read_only: true",
            collector,
        )
        self.assertIsNotNone(mount, "the server's folder is mounted read-only in the collector")
        from collector import overlay

        self.assertEqual(os.path.dirname(overlay.DEFAULT_PATH), mount.group(1))

    def test_the_providers_folder_is_mounted_read_only_and_never_stops_a_start(self):
        for name, block in services(compose_text()).items():
            mount = re.search(
                r"source: \$\{KW_PROVIDERS:-\./providers\}\n"
                r"\s+target: /etc/knightwatcher/providers\n\s+read_only: true\n"
                r"\s+bind: \{ create_host_path: false \}",
                block,
            )
            self.assertIsNotNone(mount, name)
        # Its default is the repository's own folder, tracked empty, so a checkout has it.
        self.assertTrue(os.path.isfile(os.path.join(ROOT, "providers", ".gitkeep")))
        with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as fh:
            ignored = fh.read().splitlines()
        self.assertIn("/providers/*", ignored)
        self.assertIn("!/providers/.gitkeep", ignored)
        # The collector finds it beside config.toml, where compose mounts it.
        spec = schema.setting("collector", "providers_dir")
        self.assertFalse(spec["editable"])
        variable = next(e for e in S["env"] if e["name"] == "KW_PROVIDERS")
        self.assertEqual(
            os.path.join(os.path.dirname("/etc/knightwatcher/config.toml"), spec["default"]),
            variable["mount"],
        )


def compose_text() -> str:
    with open(os.path.join(ROOT, "compose.yaml"), encoding="utf-8") as fh:
        return fh.read()


def services(text: str) -> dict[str, str]:
    """The text of each service in compose.yaml, by its name."""
    part = text.split("\nservices:\n", 1)[1]
    names = re.findall(r"^  ([a-z]+):$", part, re.M)
    out = {}
    for i, name in enumerate(names):
        start = part.index(f"\n  {name}:\n") if i else part.index(f"  {name}:\n")
        end = part.index(f"\n  {names[i + 1]}:\n") if i + 1 < len(names) else len(part)
        out[name] = part[start:end]
    return out


if __name__ == "__main__":
    unittest.main()
