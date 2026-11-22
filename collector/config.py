"""Configuration: config.toml for settings, the environment for credentials.

collector/settings-schema.json describes every setting: its type, its allowed values or range and
its default. The defaults and the plain checks here are built from it, and the checks that are not
plain (the priority list, addresses, patterns, devices and the Pi) are written out below.
A source runs when its table is present in config.toml and its `enabled` is not false.
Devices are the `[[device]]` tables, checked here and turned into one list with the Pi of
`[sources.pi]` first. The `[look]`, `[display]`, `[quiet]` and `[scenes]` tables are the settings
screen's household defaults; they have no defaults here, and only what they set is written to
state.json. Where they take the long name of a part from a pack, "<pack>/<id>", only its form is
checked here. The sections read through a kind (collector/kinds/) take their provider from
`from`, or the provider of their own name, and the provider's file names the credentials it needs
and any settings of its own, which the section may then set; a key of the section that its
provider does not use (url and verify_tls with fail2ban, database with any other) is refused by
name, and verify_tls = false needs an https url. An old [sources.security] that still reads the
fail2ban summary (a url with no `from`, or from = "summary") is refused with a message that names
fail2ban's own database instead. The providers are the built-in ones and the user's own files in
the providers folder (collector.providers_dir, beside config.toml), read by
collector/providers/__init__.py's scan(); a `from` naming a file that was left out is no problem
here, and that source fails at every read.
A list of tables under [sources], [[sources.imports]], holds more sources read through a kind: each
entry is the source "imports:<name>", with a name of its own and a `from` it must give, checked as
a section is and named by its place (sources.imports[0]) in its problems. Its name is never a
section's, and two enabled sources that read one provider at one address are refused.
[[sources.json]] holds the generic checks: each entry is the source "json:<name>", one value read
from a JSON reply and tested, compiled into a provider of the check kind (collector/kinds/check.py)
rather than naming one. It borrows the scene of a condition (`as`), which must be in the priority
list, and its one header, if it has one, reads its value from KNIGHTWATCHER_<SECRET>_HEADER.
Credentials come from environment variables named KNIGHTWATCHER_<SECRET>_<FIELD>, where SECRET is
the source's `secret` setting, the provider's id unless it is set; no message ever carries a
credential's value.
"""

from __future__ import annotations

import copy
import os
import re
import tomllib
import urllib.parse
import zoneinfo
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from collector import providers as providers_mod
from collector import schema
from collector.kinds import LISTS, SECTIONS, kind_of, provider_of

CONDITION_IDS = schema.condition_ids()

COLLECTOR_DEFAULTS: dict[str, Any] = schema.defaults("collector")

CONDITION_DEFAULTS: dict[str, Any] = {
    **schema.defaults("conditions"),
    **{cid: schema.defaults(f"conditions.{cid}") for cid in CONDITION_IDS},
}

# The sections of [sources]; a list of tables, such as [[sources.imports]], is not one of them.
SOURCE_DEFAULTS: dict[str, dict[str, Any]] = {
    name: schema.defaults(f"sources.{name}")
    for name in schema.source_names()
    if not schema.TABLES[f"sources.{name}"].get("many")
}

# The lists of tables under [sources] whose entries are read through a kind: [[sources.imports]].
# Each entry is the source "<list>:<name>", with the defaults of its table.
LIST_DEFAULTS: dict[str, dict[str, Any]] = {
    name: schema.defaults(f"sources.{name}") for name in LISTS
}
LIST_MAX: dict[str, int] = {name: schema.TABLES[f"sources.{name}"]["max"] for name in LISTS}
# An entry's name: 1 to 20 of a-z, 0-9 and -, starting with a letter or digit.
_ENTRY_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,19}$")

# [[sources.json]]: the generic checks. Their settings are checked here rather than through a
# provider, since each entry is compiled into a provider of its own.
_CHECK = {s["key"]: s for s in schema.settings("sources.json")}
CHECK_TESTS = tuple(_CHECK["test"]["values"])
# The conditions a check may borrow: every one but device_down, which needs the positions of
# devices that a check does not have.
CHECK_BORROWS = tuple(_CHECK["as"]["values"])
CHECK_HEADLINE_MAX = 16
CHECK_DETAIL_MAX = 60

# Settings a source cannot run without.
REQUIRED = {
    name: [s["key"] for s in schema.settings(f"sources.{name}") if s.get("required")]
    for name in SOURCE_DEFAULTS
}
REQUIRED = {name: keys for name, keys in REQUIRED.items() if keys}
# The settings an entry of a list cannot run without, besides its name and from, which are
# checked for every entry, on or off.
LIST_REQUIRED = {
    name: [
        s["key"]
        for s in schema.settings(f"sources.{name}")
        if s.get("required") and s["key"] not in ("name", "from")
    ]
    for name in LISTS
}

# The fields a credential may have, the last part of KNIGHTWATCHER_<SECRET>_<FIELD>. The set is
# fixed so that the credentials' names are known whatever the provider.
CREDENTIAL_FIELDS = ("api_key", "token", "username", "password", "header")
# A source's `secret` names variables, so it is letters, digits and underscores.
_SECRET_NAME = re.compile(r"^[A-Za-z0-9_]+$")

# Settings that were removed, with what to set instead. Naming the replacement beats the plain
# "unknown setting" an old config.toml would otherwise get.
REPLACED = {
    "conditions.clear_after_polls": "clear_after_s, in seconds",
    "conditions.cpu_hot.for_s": "window_s, the seconds the CPU is averaged over",
    "conditions.memory_tight.for_s": "window_s, the seconds available memory is averaged over",
}

# What an old [sources.security] gets in place of "not used by fail2ban" or "unknown provider":
# the fail2ban summary it read at url is no longer read, and fail2ban's own database replaces it.
SUMMARY_GONE = (
    'the fail2ban summary is no longer read; use from = "fail2ban" and database, with the mount '
    "and the read ACL in docs/configuration.md, fail2ban's database"
)

# The shortest interval and averaging window the collector accepts, in seconds.
MIN_INTERVAL_S = schema.setting("collector", "interval_s")["min"]
MIN_WINDOW_S = schema.setting("conditions.cpu_hot", "window_s")["min"]

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# Devices: the [[device]] tables.
_DEVICE = {s["key"]: s for s in schema.settings("device")}
DEVICE_KINDS = tuple(_DEVICE["kind"]["values"])
MAX_DEVICES = schema.TABLES["device"]["max"]  # the Pi of [sources.pi] included
MAX_DEVICE_PORTS = _DEVICE["ports"]["max_items"]
DEVICE_EVERY_S = (_DEVICE["every_s"]["min"], _DEVICE["every_s"]["max"])
MAX_DOWN_AFTER_S = _DEVICE["down_after_s"]["max"]
# The settings of a [[device]] table that have a default. name and kind have none; host, port,
# ports and url have none either, and which of them are given decides the check.
DEVICE_DEFAULTS: dict[str, Any] = {
    k: s["default"] for k, s in _DEVICE.items() if s.get("default") is not None
}
# Every setting a [[device]] table may have.
DEVICE_SETTINGS = tuple(_DEVICE)
# 1 to 20 printable ASCII characters, with no space at either end.
_DEVICE_NAME = re.compile(r"^[!-~](?:[ -~]{0,18}[!-~])?$")
# A web address is printable ASCII with no space in it.
_PLAIN_URL = re.compile(r"^[!-~]+$")
# The name the Pi of [sources.pi] has as a device.
PI_NAME = "Pi"

# The household defaults for the display's settings screen: the [look], [display], [quiet] and
# [scenes] tables, written to state.json as `defaults` with only the keys the config sets. The
# schema gives the values each key may take, in the order the messages list them. The swatch
# families (skin, hair, tabard, plume) are those of web/packs/base.pack.json and the hair styles
# its hair.* items; the page would ignore a value the base pack lacks, so the lists follow the pack.
DEFAULT_TABLES = tuple(t["table"] for t in schema.SCHEMA["tables"] if t.get("defaults_for"))
LOOK_CHOICES: dict[str, tuple[str, ...]] = {
    s["key"]: tuple(s["values"]) for s in schema.settings("look") if s["type"] == "string"
}
# The tables of [look], [look.items] and [look.devices]: the keys each may hold.
LOOK_TABLES: dict[str, tuple[str, ...]] = {
    s["key"]: tuple(s["keys"]) for s in schema.settings("look") if s["type"] == "table"
}
# A long name, "<pack>/<id>", which a setting marked long takes besides its short names. The
# collector knows nothing of packs, so a long name is checked for its form alone; the page ignores
# one it has not loaded.
LONG_NAME = re.compile(schema.SCHEMA["long_name"])
LONG_FORM = '"<pack>/<id>"'
HEADLINE_SIZES = tuple(schema.setting("display", "headline")["values"])
CLOCKS = tuple(schema.setting("display", "clock")["values"])
# The quiet scenes the page ships with, which the medieval world's preset turns between.
QUIET_SCENES = tuple(schema.scene_ids(quiet_only=True))
_MINUTES = schema.setting("quiet", "minutes")
QUIET_MINUTES = (_MINUTES["min"], _MINUTES["max"])
DISPLAY_SETTINGS = tuple(s["key"] for s in schema.settings("display"))
QUIET_SETTINGS = tuple(s["key"] for s in schema.settings("quiet"))
# Every scene the page draws, as ALL_SCENES in web/js/settings.js names them (the files of
# web/js/scenes/). [scenes] maps a condition id to one of them, or to a long name. Which scene can
# act which condition is the page's to know: a known scene that cannot act a condition is accepted
# here and ignored by the page, with a line in its console.
PAGE_SCENES = tuple(schema.scene_ids())


class ConfigError(Exception):
    """Raised with every problem found, one per line."""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


@dataclass
class Config:
    collector: dict[str, Any]
    conditions: dict[str, Any]
    sources: dict[str, dict[str, Any]]
    secrets: dict[str, dict[str, str]] = field(default_factory=dict, repr=False)
    # Every enabled device, the Pi of [sources.pi] first; see _devices.
    devices: list[dict[str, Any]] = field(default_factory=list)
    # The settings screen's household defaults, holding only what the config sets; see _defaults.
    defaults: dict[str, dict[str, Any]] = field(
        default_factory=lambda: {t: {} for t in DEFAULT_TABLES}
    )

    @property
    def interval_s(self) -> int:
        return self.collector["interval_s"]

    @property
    def tz(self) -> zoneinfo.ZoneInfo:
        return zoneinfo.ZoneInfo(self.collector["timezone"])

    def secret(self, source: str) -> dict[str, str]:
        name = self.sources[source].get("secret") or source
        return self.secrets.get(name, {})

    # The value of every credential variable the environment held, used or not, for scrubbing.
    scrub: list[str] = field(default_factory=list, repr=False)
    # Built with missing="report": each enabled source whose credentials the environment lacks,
    # with the problems that name them. Such a source runs and fails, saying which is missing.
    missing: dict[str, list[str]] = field(default_factory=dict)

    # The providers its sections could name: the built-ins and the providers folder's files.
    providers: Any = field(default_factory=providers_mod.builtin_only, repr=False)
    # Each source of a list of tables, by its name, with where config.toml sets it:
    # {"imports:whisparr": "sources.imports[0]"}.
    places: dict[str, str] = field(default_factory=dict)

    def secret_values(self) -> list[str]:
        """Every secret string, so that error text can be scrubbed of them."""
        used = [v for section in self.secrets.values() for v in section.values() if v]
        return list(dict.fromkeys(used + self.scrub))

    def refused_in_use(self) -> list[str]:
        """The enabled sources read through a kind whose `from` names a provider file that was
        left out."""
        return [
            name
            for name, s in self.sources.items()
            if kind_of(name) and self.providers.is_refused(provider_of(name, s))
        ]

    def where(self, source: str) -> str:
        """Where config.toml sets a source, as its problems name it: sources.streams, or for an
        entry of a list, sources.imports[2]."""
        return self.places.get(source, f"sources.{source}")


def _type_ok(default: Any, value: Any) -> bool:
    if isinstance(default, bool):
        return isinstance(value, bool)
    if isinstance(default, float):
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if isinstance(default, int):
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, type(default))


def _merge(where: str, defaults: dict, given: dict, problems: list[str]) -> dict:
    out = copy.deepcopy(defaults)
    for key, value in given.items():
        if f"{where}.{key}" in REPLACED:
            problems.append(f"{where}.{key}: removed; use {REPLACED[f'{where}.{key}']}")
            continue
        if key not in defaults:
            problems.append(f"{where}.{key}: unknown setting")
            continue
        d = defaults[key]
        if isinstance(d, dict):
            if not isinstance(value, dict):
                problems.append(f"{where}.{key}: expected a table")
                continue
            out[key] = _merge(f"{where}.{key}", d, value, problems)
        elif not _type_ok(d, value):
            problems.append(f"{where}.{key}: expected {type(d).__name__}")
        else:
            out[key] = float(value) if isinstance(d, float) else value
    return out


def _check_ranges(where: str, values: dict, table: str, problems: list[str]) -> None:
    """The ranges the schema gives for a table's settings, in the schema's order."""
    for spec in schema.settings(table):
        key = spec["key"]
        if not any(k in spec for k in ("min", "above", "max")):
            continue
        why = schema.range_problem(spec, values[key])
        if why:
            problems.append(f"{where}.{key}: {why}")


def _validate_collector(c: dict, problems: list[str]) -> None:
    _check_ranges("collector", c, "collector", problems)
    if c["http_timeout_s"] >= c["interval_s"]:
        problems.append("collector.http_timeout_s: must be shorter than interval_s")
    try:
        zoneinfo.ZoneInfo(c["timezone"])
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        problems.append(f"collector.timezone: unknown time zone {c['timezone']!r}")


def _validate_conditions(c: dict, problems: list[str]) -> None:
    seen = set()
    for cid in c["priority"]:
        if cid not in CONDITION_IDS:
            problems.append(f"conditions.priority: unknown condition {cid!r}")
        elif cid in seen:
            problems.append(f"conditions.priority: {cid!r} listed twice")
        seen.add(cid)
    _check_ranges("conditions", c, "conditions", problems)
    for cid in CONDITION_IDS:
        _check_ranges(f"conditions.{cid}", c[cid], f"conditions.{cid}", problems)
    if not all(isinstance(j, str) for j in c["attack"]["jails"]):
        problems.append("conditions.attack.jails: must be a list of strings")
    for key in ("start", "end"):
        if not _HHMM.match(c["night"][key]):
            problems.append(f"conditions.night.{key}: expected HH:MM, 24-hour")


def _table_of(source: str) -> str:
    """The schema's table of a source: sources.<name>, or for "<list>:<name>", sources.<list>."""
    head, colon, _ = source.partition(":")
    return f"sources.{head}" if colon else f"sources.{source}"


def _validate_source(name: str, s: dict, problems: list[str], registry, where=None) -> None:
    """One enabled source's settings. where is how its problems name it: sources.<name>, or for
    an entry of a list, sources.<list>[<index>], whose name and from are checked already."""
    table = _table_of(name)
    where = where or table
    _check_ranges(where, s, table, problems)
    for spec in schema.settings(table):
        if spec["type"] == "string" and "values" in spec:
            _choice(f"{where}.{spec['key']}", s[spec["key"]], tuple(spec["values"]), problems)
    unused = unused_keys(name, s, registry)
    required = REQUIRED.get(name) or LIST_REQUIRED.get(name.partition(":")[0], [])
    for key in required:
        if key in unused:
            continue
        if not s[key]:
            why = schema.setting(table, key).get("required_problem")
            problems.append(f"{where}.{key}: {why or 'required when the source is enabled'}")
    for key in ("url",):
        if key not in unused and s.get(key) and not re.match(r"^https?://", s[key]):
            problems.append(f"{where}.{key}: must start with http:// or https://")
    if (
        "verify_tls" not in unused
        and s.get("verify_tls") is False
        and isinstance(s.get("url"), str)
        and s["url"].startswith("http://")
    ):
        problems.append(f"{where}.verify_tls: only applies with an https url")
    if "secret" in s and not _SECRET_NAME.match(s["secret"]):
        problems.append(f"{where}.secret: use letters, digits and underscores")
    if "from" in s:
        why = _provider_problem(name, s["from"], registry)
        if why:
            problems.append(f"{where}.from: {why}")
    if name == "host":
        for i, d in enumerate(s["disks"]):
            if (
                not isinstance(d, dict)
                or not {"mount", "path"} <= set(d)
                or set(d)
                - {
                    "mount",
                    "path",
                }
            ):
                problems.append(f"sources.host.disks[{i}]: needs exactly mount and path")
    elif name == "containers":
        if not all(isinstance(p, str) for p in s["ignore"]):
            problems.append("sources.containers.ignore: must be a list of strings")
    elif name == "wan":
        if not s["urls"] or not all(isinstance(u, str) for u in s["urls"]):
            problems.append("sources.wan.urls: must be a non-empty list of URLs")
    elif name == "backup":
        try:
            if re.compile(s["pattern"]).groups < 1:
                problems.append("sources.backup.pattern: needs one group around the date")
        except re.error as exc:
            problems.append(f"sources.backup.pattern: {exc}")
        try:
            zoneinfo.ZoneInfo(s["timezone"])
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            problems.append(f"sources.backup.timezone: unknown time zone {s['timezone']!r}")
    elif name == "security":
        if "database" not in unused and not str(s["database"]).startswith("/"):
            problems.append("sources.security.database: a path inside the container, from /")
    elif name == "pi":
        if not s["ports"] or not all(isinstance(p, int) and 0 < p < 65536 for p in s["ports"]):
            problems.append("sources.pi.ports: must be a non-empty list of port numbers")
    elif name == "updates":
        for i, h in enumerate(s["holders"]):
            if not isinstance(h, dict) or set(h) != {"name", "pattern"}:
                problems.append(f"sources.updates.holders[{i}]: needs exactly name and pattern")
                continue
            try:
                re.compile(h["pattern"])
            except re.error as exc:
                problems.append(f"sources.updates.holders[{i}].pattern: {exc}")
    elif name == "ssh":
        import ipaddress

        for net in s["ignore_sources"]:
            try:
                ipaddress.ip_network(net, strict=False)
            except (ValueError, TypeError):
                problems.append(f"sources.ssh.ignore_sources: {net!r} is not an address range")


def unused_keys(section: str, settings: dict, registry) -> set[str]:
    """The keys of a kind's section that the provider it reads does not use: a setting the schema
    marks with the providers that read it, when the provider is not one of them, and url, when the
    provider reads no address (fail2ban). Nothing when the provider is not known, or was left
    out, which are problems of their own."""
    spec = _chosen(section, settings, registry)
    if spec is None:
        return set()
    out = set()
    for s in schema.settings(_table_of(section)):
        users = s.get("providers")
        if users is not None and spec.id not in users:
            out.add(s["key"])
    if not providers_mod.takes_address(spec):
        out |= {"url", "verify_tls"}
    return out


def _check_unused(
    name: str, given: dict, settings: dict, registry, problems: list[str], where=None
) -> None:
    """A key given that the section's provider does not use is refused by name, so that a change
    of provider never leaves a stale setting doing nothing."""
    pid = provider_of(name, settings)
    where = where or f"sources.{name}"
    for key in sorted(unused_keys(name, settings, registry) & set(given), key=list(given).index):
        if name == "security" and key == "url" and "from" not in given:
            # A url with no `from` is a [sources.security] written for the fail2ban summary.
            problems.append(f"{where}.{key}: {SUMMARY_GONE}")
            continue
        problems.append(f"{where}.{key}: not used by {pid}")


def provider_credentials(pid: str, registry=None) -> list[str]:
    """The credential fields a provider needs, by its id; none for an unknown one."""
    spec = (registry or providers_mod.builtin_only()).get(pid)
    return list(spec.credentials) if spec is not None else []


def _chosen(section: str, settings: dict, registry):
    """The compiled file of the provider a section reads, or None when it reads no provider, names
    one that does not exist or was left out, or names one of another kind."""
    kind = kind_of(section)
    if kind is None:
        return None
    spec = registry.get(provider_of(section, settings))
    return spec if spec is not None and spec.kind == kind else None


def _section_credentials(section: str, settings: dict, registry) -> list[str]:
    """The credential fields a section's provider needs; none when it reads no provider, or names
    one that is not of its kind, which is a problem of its own. A check needs its header's value,
    when it has a header."""
    if kind_of(section) == "check":
        return ["header"] if settings.get("header") else []
    spec = _chosen(section, settings, registry)
    return list(spec.credentials) if spec is not None else []


def _provider_problem(section: str, pid: str, registry) -> str | None:
    """What is wrong with the provider a section's `from` names, or None. A provider file that
    was left out is not a problem of the configuration: that source fails at every read."""
    kind = kind_of(section)
    spec = registry.get(pid)
    if spec is None:
        if registry.is_refused(pid):
            return None
        if section == "security" and pid == "summary":
            return SUMMARY_GONE
        ids = [p.id for p in registry.of_kind(kind)]
        return f'unknown provider "{pid}"; use {_say_or(tuple(ids))}'
    if spec.kind != kind:
        return f'"{pid}" reads {spec.kind}, not {kind}'
    return None


_SETTING_WORDS = {
    "string": "expected text",
    "integer": "expected a whole number",
    "number": "expected a number",
    "boolean": "expected true or false",
}


def _setting_ok(kind: str, value: Any) -> bool:
    if kind == "string":
        return isinstance(value, str)
    if kind == "integer":
        return _is_int(value)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, bool)


def _provider_settings(
    name: str, given: dict, registry, problems: list[str], where=None
) -> tuple[dict, dict]:
    """A kind's section split in two: (its own settings, the settings its provider declares,
    checked against the provider file's declaration). A key that is neither is a problem: "not
    used by" the provider when another provider of the kind declares it, else unknown. While the
    section names a provider file that was left out, its other keys are kept out unchecked, since
    that source fails anyway. name is the source's, "<list>:<name>" for an entry of a list, and
    where how its problems name it."""
    table = _table_of(name)
    where = where or table
    own = schema.defaults(table)
    extra = {k: v for k, v in given.items() if k not in own and f"{table}.{k}" not in REPLACED}
    if not extra:
        return given, {}
    base = {k: v for k, v in given.items() if k not in extra}
    pid = provider_of(name, {**own, **given})
    if registry.is_refused(pid):
        return base, {}
    spec = _chosen(name, {**own, **given}, registry)
    declared = spec.settings if spec is not None else {}
    others = {k for p in registry.of_kind(kind_of(name)) for k in p.settings}
    out: dict[str, Any] = {}
    for key, value in extra.items():
        w = f"{where}.{key}"
        if key not in declared:
            problems.append(f"{w}: not used by {pid}" if key in others else f"{w}: unknown setting")
            continue
        d = declared[key]
        if not _setting_ok(d["type"], value):
            problems.append(f"{w}: {_SETTING_WORDS[d['type']]}")
            continue
        if d["type"] in ("integer", "number"):
            why = schema.range_problem(d, value)
            if why:
                problems.append(f"{w}: {why}")
                continue
        if "values" in d and value not in d["values"]:
            shown = f'"{value}"' if isinstance(value, str) else _word(value)
            problems.append(f"{w}: unknown value {shown}; use {_say_or(tuple(d['values']))}")
            continue
        out[key] = float(value) if d["type"] == "number" else value
    return base, out


def _word(value: Any) -> str:
    """A value as config.toml writes it, for a message."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_port(value: Any) -> bool:
    return _is_int(value) and 0 < value < 65536


def _url_problem(url: Any) -> str | None:
    """What is wrong with a device's url, or None."""
    if not isinstance(url, str) or not re.match(r"^https?://", url):
        return "must start with http:// or https://"
    if not _PLAIN_URL.match(url):
        return "not a valid web address"
    parts = urllib.parse.urlsplit(url)
    if "@" in parts.netloc:
        return "must not carry a user name or password"
    try:
        parts.port  # noqa: B018 - raises on a port that is out of range or not a number
    except ValueError:
        return "not a valid web address"
    if not parts.hostname:
        return "not a valid web address"
    return None


def _device(w: str, t: dict, problems: list[str]) -> dict[str, Any]:
    """Check one [[device]] table and return it with its defaults filled in."""
    for key in t:
        if key not in DEVICE_SETTINGS:
            problems.append(f"{w}.{key}: unknown setting")
    out = {**DEVICE_DEFAULTS, **{k: v for k, v in t.items() if k in DEVICE_DEFAULTS}}

    name = t.get("name")
    if "name" not in t:
        problems.append(f"{w}.name: required")
    elif not isinstance(name, str) or not _DEVICE_NAME.match(name):
        problems.append(f"{w}.name: 1 to 20 printable ASCII characters, no space at either end")
    kind = t.get("kind")
    if "kind" not in t:
        problems.append(f"{w}.kind: required")
    elif not isinstance(kind, str):
        problems.append(f"{w}.kind: expected str")
    elif "/" in kind:
        problems.append(f"{w}.kind: kinds from packs are not supported yet")
    elif kind not in DEVICE_KINDS:
        kinds = f"{', '.join(DEVICE_KINDS[:-1])} or {DEVICE_KINDS[-1]}"
        problems.append(f'{w}.kind: unknown kind "{kind}"; use {kinds}')

    for key in ("refused_counts", "verify_tls", "alert", "enabled"):
        if not isinstance(out[key], bool):
            problems.append(f"{w}.{key}: expected bool")
    every = out["every_s"]
    low, high = DEVICE_EVERY_S
    if not _is_int(every) or not low <= every <= high:
        problems.append(f"{w}.every_s: must be from {low} to {high}")
    floor = every if _is_int(every) else DEVICE_DEFAULTS["every_s"]
    if not _is_int(out["down_after_s"]) or not floor <= out["down_after_s"] <= MAX_DOWN_AFTER_S:
        problems.append(
            f"{w}.down_after_s: must be at least every_s ({floor}) and at most {MAX_DOWN_AFTER_S}"
        )

    host = t.get("host")
    if "host" in t and (not isinstance(host, str) or not host or not _PLAIN_URL.match(host)):
        problems.append(f"{w}.host: must be an address or a name")
    if "port" in t and not _is_port(t["port"]):
        problems.append(f"{w}.port: must be a port number from 1 to 65535")
    ports = t.get("ports")
    if "ports" in t and (
        not isinstance(ports, list)
        or not 1 <= len(ports) <= MAX_DEVICE_PORTS
        or not all(_is_port(p) for p in ports)
    ):
        problems.append(f"{w}.ports: 1 to {MAX_DEVICE_PORTS} port numbers from 1 to 65535")
    if "url" in t:
        why = _url_problem(t["url"])
        if why:
            problems.append(f"{w}.url: {why}")

    by_tcp = any(k in t for k in ("host", "port", "ports"))
    by_url = "url" in t
    if by_tcp == by_url:
        problems.append(f"{w}: give host with port or ports, or url, and not both")
    elif by_tcp:
        if "port" in t and "ports" in t:
            problems.append(f"{w}: give port or ports, not both")
        elif "host" not in t:
            problems.append(f"{w}.host: required with port or ports")
        elif "port" not in t and "ports" not in t:
            problems.append(f"{w}: give host with port or ports, or url, and not both")
    if "refused_counts" in t and not (by_tcp and not by_url):
        problems.append(f"{w}.refused_counts: only applies with host")
    https = by_url and not by_tcp and isinstance(t["url"], str) and t["url"].startswith("https://")
    if "verify_tls" in t and not https:
        problems.append(f"{w}.verify_tls: only applies with an https url")

    if "port" in t:
        out["ports"] = [t["port"]]
    elif isinstance(ports, list):
        out["ports"] = list(dict.fromkeys(ports))  # the same port twice is tried once
    else:
        out["ports"] = []
    out.update(
        name=name,
        kind=kind,
        host=host if by_tcp else "",
        url=t.get("url", "") if by_url else "",
        source=f"device:{name}",
        legacy=False,
    )
    return out


def _url_host(url: Any) -> str:
    try:
        return urllib.parse.urlsplit(url).hostname or ""
    except (TypeError, ValueError, AttributeError):
        return ""


def _say_names(names: list[str]) -> str:
    """Vault; Vault and Gate cam; Vault, Gate cam and Buildbox."""
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _devices(raw: Any, sources: dict, conditions: dict, problems: list[str]) -> list[dict]:
    """Check the [[device]] tables and return every enabled device, the Pi of [sources.pi] first.

    The Pi keeps the rules of [sources.pi]: its ports are tried as given, a refused connection
    counts as an answer, and it is silent after pi_silent's for_s. It raises pi_silent rather
    than device_down, and only when the priority list names pi_silent.
    """
    priority = conditions["priority"]
    devices: list[dict] = []
    pi = sources.get("pi")
    if pi is not None:
        devices.append(
            {
                "name": PI_NAME,
                "kind": "pi",
                "host": pi["host"],
                "ports": list(pi["ports"]),
                "url": "",
                "refused_counts": True,
                "verify_tls": False,
                "every_s": pi["every_s"],
                "down_after_s": conditions["pi_silent"]["for_s"],
                "alert": "pi_silent" in priority,
                "enabled": True,
                "source": "pi",
                "legacy": True,
            }
        )
    if raw is None:
        return devices
    if not isinstance(raw, list):
        problems.append("device: expected [[device]] tables")
        return devices

    named: dict[str, int] = {}
    for i, t in enumerate(raw):
        w = f"device[{i}]"
        if not isinstance(t, dict):
            problems.append(f"{w}: expected a table")
            continue
        device = _device(w, t, problems)
        name = device["name"]
        if isinstance(name, str) and name:
            key = name.lower()
            if pi is not None and key == PI_NAME.lower():
                problems.append(f'{w}.name: "{name}" is taken by [sources.pi]')
            elif key in named:
                problems.append(f'{w}.name: "{name}" is already the name of device[{named[key]}]')
            else:
                named[key] = i
        if pi is not None and pi["host"]:
            watched = pi["host"].lower()
            if isinstance(device["host"], str) and device["host"].lower() == watched:
                problems.append(
                    f"{w}.host: {device['host']} is already watched by [sources.pi]; remove one"
                )
            elif device["url"] and _url_host(device["url"]).lower() == watched:
                problems.append(
                    f"{w}.url: {_url_host(device['url'])} is already watched by [sources.pi]; "
                    "remove one"
                )
        if device["enabled"] is True:
            devices.append(device)

    if len(devices) > MAX_DEVICES:
        problems.append(f"device: at most {MAX_DEVICES} devices")
    alerting = [str(t["name"]) for t in devices if not t["legacy"] and t["alert"] is True]
    if alerting and "device_down" not in priority:
        # Say where it goes: after the nearest condition above it in the default order that the
        # list names, or before the nearest one below it.
        at = CONDITION_IDS.index("device_down")
        above = [c for c in CONDITION_IDS[:at] if c in priority]
        below = [c for c in CONDITION_IDS[at + 1 :] if c in priority]
        if above:
            where = f'add it after "{above[-1]}"'
        elif below:
            where = f'add it before "{below[0]}"'
        else:
            where = "add it to the list"
        it = "it" if len(alerting) == 1 else "them"
        problems.append(
            f'conditions.priority: leaves out "device_down", so {_say_names(alerting)} would '
            f"never alert; {where}, or set alert = false on {it}"
        )
    return devices


def _say_or(values: tuple) -> str:
    """a, b or c."""
    words = [str(v) for v in values]
    if len(words) == 1:
        return words[0]
    return f"{', '.join(words[:-1])} or {words[-1]}"


def _use(allowed: tuple[str, ...], long: bool) -> str:
    """What a setting takes, as its problems say it."""
    if not long:
        return f"use {_say_or(allowed)}"
    if not allowed:
        return f"use a long name, {LONG_FORM}"
    return f"use {_say_or(allowed)}, or a long name, {LONG_FORM}"


def _choice(
    w: str, value: Any, allowed: tuple[str, ...], problems: list[str], long: bool = False
) -> None:
    """A short name from allowed, or, where long, a long name of the right form."""
    if isinstance(value, str) and (value in allowed or (long and LONG_NAME.match(value))):
        return
    given = f'unknown value "{value}"' if isinstance(value, str) else "expected text"
    problems.append(f"{w}: {given}; {_use(allowed, long)}")


def _defaults(raw: dict, problems: list[str]) -> dict[str, dict[str, Any]]:
    """Check the [look], [display], [quiet] and [scenes] tables and return what they set.

    Nothing is filled in: a key the config leaves out is left out, and the page uses its own
    default for it.
    """
    known = {
        "look": tuple(s["key"] for s in schema.settings("look")),
        "display": DISPLAY_SETTINGS,
        "quiet": QUIET_SETTINGS,
        "scenes": tuple(CONDITION_IDS),
    }
    out: dict[str, dict[str, Any]] = {t: {} for t in DEFAULT_TABLES}
    for table in DEFAULT_TABLES:
        given = raw.get(table, {})
        if not isinstance(given, dict):
            problems.append(f"{table}: expected a table")
            continue
        for key in given:
            if key not in known[table]:
                what = "condition" if table == "scenes" else "setting"
                problems.append(f"{table}.{key}: unknown {what}")
        for key in known[table]:
            if key not in given:
                continue
            value, w, before = given[key], f"{table}.{key}", len(problems)
            if table == "scenes":
                _choice(w, value, PAGE_SCENES, problems, long=True)
            else:
                _check_default(w, schema.setting(table, key), value, problems)
            if len(problems) == before:
                out[table][key] = copy.deepcopy(value)
    return out


def _check_default(w: str, spec: dict, value: Any, problems: list[str]) -> None:
    """One setting of [look], [display] or [quiet], by its type in the schema."""
    kind = spec["type"]
    if kind == "string":
        _choice(w, value, tuple(spec["values"]), problems, spec.get("long", False))
    elif kind == "table":  # look.items and look.devices
        if not isinstance(value, dict):
            problems.append(f"{w}: expected a table")
            return
        for key in value:
            if key not in spec["keys"]:
                problems.append(f"{w}.{key}: unknown key; use {_say_or(tuple(spec['keys']))}")
        for key in spec["keys"]:
            if key in value:
                _choice(f"{w}.{key}", value[key], tuple(spec["values"]), problems, long=True)
    elif kind == "boolean":
        if not isinstance(value, bool):
            problems.append(f"{w}: expected true or false")
    elif kind == "integer" and "values" in spec:
        if not _is_int(value) or value not in spec["values"]:
            problems.append(f"{w}: must be {_say_or(tuple(spec['values']))}")
    elif kind == "integer":
        low, high = spec["min"], spec["max"]
        if not _is_int(value) or not low <= value <= high:
            problems.append(f"{w}: must be a whole number from {low} to {high}")
    elif kind == "list":  # quiet.scenes
        _quiet_scenes(w, value, problems)


def check_defaults(tables: dict) -> list[str]:
    """Every problem with the [look], [display], [quiet] and [scenes] tables of a parsed config."""
    problems: list[str] = []
    _defaults(tables, problems)
    return problems


def _quiet_scenes(w: str, value: Any, problems: list[str]) -> None:
    """A list of quiet scenes, each a short name or a long name, each once."""
    if not isinstance(value, list) or not value:
        problems.append(f"{w}: list one or more of {_say_or(QUIET_SCENES)}, or long names")
        return
    seen = set()
    for scene in value:
        if not isinstance(scene, str) or not (scene in QUIET_SCENES or LONG_NAME.match(scene)):
            shown = f'"{scene}"' if isinstance(scene, str) else repr(scene)
            problems.append(f"{w}: unknown scene {shown}; {_use(QUIET_SCENES, True)}")
        elif scene in seen:
            problems.append(f'{w}: "{scene}" listed twice')
        seen.add(scene)


def _credentials(
    sources: dict[str, dict],
    env: Mapping[str, str],
    problems: list[str],
    missing: dict[str, list[str]] | None = None,
    registry=None,
) -> dict[str, dict[str, str]]:
    """The credentials of the enabled sources, by their `secret`, read from env.

    A credential that is unset or empty is a problem naming its variable, added to problems, or
    to missing under its source's name when missing is given. No message here, or anywhere else,
    carries a credential's value.
    """
    out: dict[str, dict[str, str]] = {}
    for name, s in sources.items():
        need = _section_credentials(name, s, registry or providers_mod.builtin_only())
        secret = s.get("secret", name)
        if not need or not isinstance(secret, str) or not _SECRET_NAME.match(secret):
            continue
        section = out.setdefault(secret, {})
        for f in need:
            variable = schema.env_name(secret, f)
            value = env.get(variable)
            if not isinstance(value, str) or not value:
                problem = f".env: {variable} missing (for {name})"
                if missing is None:
                    problems.append(problem)
                else:
                    missing.setdefault(name, []).append(problem)
            else:
                section[f] = value
    return out


def _address(url: Any) -> tuple | None:
    """A service's address, to tell two sources that read one service: the scheme, the host and
    port as written in any case, and the path without a final slash."""
    if not isinstance(url, str):
        return None
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    return (parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"))


def _list_entries(
    name: str, raw: Any, registry, problems: list[str]
) -> tuple[dict[str, dict], dict[str, str]]:
    """A list of tables under [sources], such as [[sources.imports]], checked: (every enabled
    entry as a source, "<list>:<name>", with its defaults filled in; where each is set, as its
    problems name it). Every entry, on or off, needs a name of its own and a from; the rest is
    checked for the enabled entries alone, after the merge, as a section's is."""
    out: dict[str, dict] = {}
    places: dict[str, str] = {}
    table = f"sources.{name}"
    if not isinstance(raw, list) or not all(isinstance(t, dict) for t in raw):
        problems.append(f"{table}: expected [[{table}]] tables")
        return out, places
    if len(raw) > LIST_MAX[name]:
        problems.append(f"{table}: at most {LIST_MAX[name]}")
    named: dict[str, int] = {}
    for i, given in enumerate(raw):
        w = f"{table}[{i}]"
        entry = given.get("name")
        if "name" not in given:
            problems.append(f"{w}.name: required")
            continue
        if not isinstance(entry, str) or not _ENTRY_NAME.match(entry):
            problems.append(f"{w}.name: 1 to 20 of a-z, 0-9 and -, starting with a letter or digit")
            continue
        if entry in named:
            problems.append(f'{w}.name: "{entry}" is already the name of {table}[{named[entry]}]')
            continue
        named[entry] = i
        if kind_of(entry) == LISTS[name]:
            problems.append(
                f'{w}.name: "{entry}" is the name of [sources.{entry}]; give this one another'
            )
            continue
        chosen = given.get("from")
        if "from" not in given:
            problems.append(f"{w}.from: required")
            continue
        if not isinstance(chosen, str) or not chosen:
            problems.append(f"{w}.from: expected the id of a provider")
            continue
        source = f"{name}:{entry}"
        given, declared = _provider_settings(source, given, registry, problems, w)
        merged = _merge(w, LIST_DEFAULTS[name], given, problems)
        merged.update(declared)
        _check_unused(source, given, merged, registry, problems, w)
        if "secret" not in given:
            # A secret left out is the provider's id.
            merged["secret"] = chosen
        if merged["enabled"] is True:
            out[source] = merged
            places[source] = w
    return out, places


def _check_entries(raw: Any, problems: list[str]) -> tuple[dict[str, dict], dict[str, str]]:
    """[[sources.json]], checked as far as an entry stands alone: (every enabled entry as the
    source "json:<name>", with its defaults filled in; where each is set, sources.json[0]). Every
    entry, on or off, needs a name of its own; the rest of an enabled one is checked after the
    merge, by _validate_check."""
    out: dict[str, dict] = {}
    places: dict[str, str] = {}
    table = "sources.json"
    if not isinstance(raw, list) or not all(isinstance(t, dict) for t in raw):
        problems.append(f"{table}: expected [[{table}]] tables")
        return out, places
    if len(raw) > LIST_MAX["json"]:
        problems.append(f"{table}: at most {LIST_MAX['json']}")
    named: dict[str, int] = {}
    for i, given in enumerate(raw):
        w = f"{table}[{i}]"
        entry = given.get("name")
        if "name" not in given:
            problems.append(f"{w}.name: required")
            continue
        if not isinstance(entry, str) or not _ENTRY_NAME.match(entry):
            problems.append(f"{w}.name: 1 to 20 of a-z, 0-9 and -, starting with a letter or digit")
            continue
        if entry in named:
            problems.append(f'{w}.name: "{entry}" is already the name of {table}[{named[entry]}]')
            continue
        named[entry] = i
        # value takes text, a number, or true or false, which a merge by the default's type
        # cannot hold; it is checked with the test it goes with.
        rest = {k: v for k, v in given.items() if k != "value"}
        merged = _merge(w, LIST_DEFAULTS["json"], rest, problems)
        merged["value"] = given.get("value")
        if "secret" not in given:
            # A secret left out is the check's name, its - made _.
            merged["secret"] = entry.replace("-", "_")
        elif not given.get("header") and merged["enabled"] is True:
            problems.append(f"{w}.secret: only applies with header")
        if merged["enabled"] is True:
            out[f"json:{entry}"] = merged
            places[f"json:{entry}"] = w
    return out, places


def _check_url_problem(url: Any) -> str | None:
    """What is wrong with a check's url, given whole, or None: a web address a provider file's
    request can make, its path and query included."""
    why = _url_problem(url)
    if why:
        return why
    parts = urllib.parse.urlsplit(url)
    if "#" in url:
        return "must not carry a fragment (#)"
    path = parts.path
    if path.startswith("//"):
        return "not a valid web address"
    if "@" in path or "\\" in path:
        return "its path cannot hold @ or \\"
    names = [k for k, _ in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)]
    if len(names) != len(set(names)):
        return "its query gives a name twice; give each once"
    return None


def _validate_check(w: str, s: dict, priority: list[str], problems: list[str]) -> None:
    """One enabled entry of [[sources.json]], named in its problems by its place, w."""
    from collector.kinds import check
    from collector.providers.format import _HEADER_NAME, _HEADERS_REFUSED, FormatError
    from collector.providers.path import PathError, compile_path

    before = len(problems)
    _check_ranges(w, s, "sources.json", problems)
    for key in ("url", "path", "test", "headline", "as"):
        if not s[key]:
            problems.append(f"{w}.{key}: required")
    if s["url"]:
        why = _check_url_problem(s["url"])
        if why:
            problems.append(f"{w}.url: {why}")
        elif s["verify_tls"] is False and s["url"].startswith("http://"):
            problems.append(f"{w}.verify_tls: only applies with an https url")
    if s["path"]:
        try:
            compile_path(s["path"])
        except PathError as exc:
            problems.append(f"{w}.path: {exc}")
    test, value = s["test"], s["value"]
    if test:
        _choice(f"{w}.test", test, CHECK_TESTS, problems)
    if test == "missing":
        if value is not None:
            problems.append(f"{w}.value: not used with missing, which holds when nothing is found")
    elif test in CHECK_TESTS:
        number = isinstance(value, (int, float)) and not isinstance(value, bool)
        if value is None:
            problems.append(f"{w}.value: required with {test}")
        elif test in ("above", "below") and not number:
            problems.append(f"{w}.value: a number, for {test}")
        elif not (number or isinstance(value, (str, bool))):
            problems.append(f"{w}.value: text, a number, or true or false")
    headline = s["headline"]
    if headline and (
        len(headline) > CHECK_HEADLINE_MAX or not headline.isprintable() or not headline.strip()
    ):
        problems.append(f"{w}.headline: 1 to {CHECK_HEADLINE_MAX} printable characters")
    detail = s["detail"]
    if len(detail) > CHECK_DETAIL_MAX or not detail.isprintable():
        problems.append(f"{w}.detail: at most {CHECK_DETAIL_MAX} printable characters")
    elif "{" in detail.replace(check.VALUE, "") or "}" in detail.replace(check.VALUE, ""):
        problems.append(f"{w}.detail: only {check.VALUE} may stand in braces")
    elif check.VALUE in detail and test == "missing":
        problems.append(
            f"{w}.detail: {check.VALUE} cannot be used with missing, which finds nothing"
        )
    borrowed = s["as"]
    if borrowed == "device_down":
        problems.append(
            f'{w}.as: "device_down" cannot be borrowed, since a check has no device to look towards'
        )
    elif borrowed:
        _choice(f"{w}.as", borrowed, CHECK_BORROWS, problems)
        if borrowed in CHECK_BORROWS and borrowed not in priority:
            problems.append(
                f'{w}.as: conditions.priority leaves out "{borrowed}", so this check would never '
                "be raised; add it there, or borrow another"
            )
    header = s["header"]
    if header:
        low = header.lower()
        if not _HEADER_NAME.match(header):
            problems.append(f"{w}.header: a header's name is letters, digits and -")
        elif low in _HEADERS_REFUSED or low.startswith("proxy-"):
            problems.append(f"{w}.header: this header cannot be set")
        if not _SECRET_NAME.match(s["secret"]):
            problems.append(f"{w}.secret: use letters, digits and underscores")
    if len(problems) == before:
        # The rules of a provider file's request, which an entry that passed should always keep.
        try:
            check.compile_entry(s)
        except FormatError as exc:
            problems += [f"{w}: {p}" for p in exc.problems]


def _same_service(sources: dict[str, dict], places: dict[str, str], problems: list[str]) -> None:
    """Two enabled sources of one kind that read one provider at one address would raise every
    event twice: the second is refused, an entry of a list rather than a section."""
    seen: dict[tuple, str] = {}
    # The sections first, so that the entry of a list is the one refused.
    for name in sorted(sources, key=lambda n: n in places):
        s = sources[name]
        kind = kind_of(name)
        # Checks are read whole, path and test, so two may well read one address.
        address = _address(s.get("url")) if kind and kind != "check" else None
        if address is None or not s.get("url"):
            continue
        key = (kind, provider_of(name, s), address)
        if key in seen:
            first = seen[key]
            said = places.get(first, f"[sources.{first}]")
            problems.append(
                f"{places.get(name, 'sources.' + name)}.url: {key[1]} at this address is read "
                f"by {said} already; remove one"
            )
        else:
            seen[key] = name


def build(
    raw: dict,
    env: Mapping[str, str] | None = None,
    missing: str = "refuse",
    providers: providers_mod.Providers | None = None,
) -> Config:
    """Validate a parsed config.toml and fill in the defaults.

    The credentials are read from env, a mapping of environment variables, and checked too,
    unless env is None, which the health check uses so that it needs none. A credential env lacks
    is a problem, or with missing="report" is kept in the Config's `missing` instead, so that a
    collector taking up a change while it runs keeps going with that source failing.

    providers is what the providers folder held (providers.scan), or None for the built-ins alone.
    The folder's own problems are not raised here: they are the caller's to report.
    """
    if missing not in ("refuse", "report"):
        raise ValueError(f"missing: {missing!r}")
    registry = providers if providers is not None else providers_mod.builtin_only()
    problems: list[str] = []
    for key in raw:
        if key not in ("collector", "conditions", "sources", "device", *DEFAULT_TABLES):
            problems.append(f"{key}: unknown table")
    collector = _merge("collector", COLLECTOR_DEFAULTS, raw.get("collector", {}), problems)
    conditions = _merge("conditions", CONDITION_DEFAULTS, raw.get("conditions", {}), problems)
    sources: dict[str, dict] = {}
    places: dict[str, str] = {}
    for name, given in raw.get("sources", {}).items():
        if name == "json":
            entries, where = _check_entries(given, problems)
            sources.update(entries)
            places.update(where)
            continue
        if name in LISTS:
            entries, where = _list_entries(name, given, registry, problems)
            sources.update(entries)
            places.update(where)
            continue
        if name not in SOURCE_DEFAULTS:
            problems.append(f"sources.{name}: unknown source")
            continue
        if not isinstance(given, dict):
            problems.append(f"sources.{name}: expected a table")
            continue
        declared: dict[str, Any] = {}
        if name in SECTIONS:
            given, declared = _provider_settings(name, given, registry, problems)
        merged = _merge(f"sources.{name}", SOURCE_DEFAULTS[name], given, problems)
        merged.update(declared)
        if name in SECTIONS:
            _check_unused(name, given, merged, registry, problems)
        if "secret" in merged and "secret" not in given:
            # A secret left out is the provider's id.
            merged["secret"] = provider_of(name, merged)
        if merged["enabled"]:
            sources[name] = merged
    if not problems:
        _validate_collector(collector, problems)
        _validate_conditions(conditions, problems)
        for name, s in sources.items():
            if kind_of(name) == "check":
                _validate_check(places[name], s, conditions["priority"], problems)
            else:
                _validate_source(name, s, problems, registry, places.get(name))
        _same_service(sources, places, problems)
    devices = _devices(raw.get("device"), sources, conditions, problems)
    defaults = _defaults(raw, problems)
    lacking: dict[str, list[str]] = {}
    report = lacking if missing == "report" else None
    secrets = _credentials(sources, env, problems, report, registry) if env is not None else {}
    # The credentials the schema names are scrubbed from error text whether or not a source uses
    # them, as every section of the old secrets file was.
    names = [e["name"] for e in schema.credentials()]
    scrub = [env[n] for n in names if env is not None and isinstance(env.get(n), str) and env[n]]
    if problems:
        raise ConfigError(problems)
    return Config(
        collector, conditions, sources, secrets, devices, defaults, scrub, lacking, registry, places
    )


def providers_folder(raw: dict, config_path: str) -> str:
    """The providers folder a parsed config.toml names: collector.providers_dir, taken from the
    folder config.toml is in when it is relative. A value that is not text is the default, and a
    problem build() reports."""
    given = raw.get("collector") if isinstance(raw.get("collector"), dict) else {}
    value = given.get("providers_dir", COLLECTOR_DEFAULTS["providers_dir"])
    if not isinstance(value, str) or not value:
        value = COLLECTOR_DEFAULTS["providers_dir"]
    return os.path.join(os.path.dirname(os.path.abspath(config_path)), value)


def read(config_path: str) -> dict:
    """config.toml, parsed; ConfigError when it cannot be read or is not TOML."""
    try:
        with open(config_path, "rb") as fh:
            return tomllib.load(fh)
    except OSError as exc:
        raise ConfigError([f"{config_path}: cannot read ({exc.strerror})"]) from None
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError([f"{config_path}: {exc}"]) from None


def load(config_path: str, env: Mapping[str, str] | None) -> Config:
    """Read config.toml and the providers folder it names, and build it, with the credentials
    from env (see build). The folder's problems are in the Config's providers.problems."""
    raw = read(config_path)
    return build(raw, env, providers=providers_mod.scan(providers_folder(raw, config_path)))


# The fields a credential variable ends with: KNIGHTWATCHER_<SECRET>_<FIELD>.
_CREDENTIAL = re.compile(
    r"^KNIGHTWATCHER_[A-Z0-9_]+_(?:"
    + "|".join(sorted(f.upper() for f in CREDENTIAL_FIELDS))
    + r")$"
)


def credential_names(env: Mapping[str, str]) -> dict[str, bool]:
    """Which credential variables env holds, by name and never by value.

    Every variable the schema names is listed, true when it holds a value; so is any other
    variable of the form KNIGHTWATCHER_<SECRET>_<FIELD> that holds one, such as the variables a
    source's own `secret` names. The bundled server reads this to check a change on the admin
    page, since it gets no credential itself.
    """
    out = {e["name"]: False for e in schema.credentials()}
    # The schema's other variables, the admin password among them, are never credentials.
    others = {e["name"] for e in schema.SCHEMA["env"] if e["scope"] != "credential"}
    for name, value in env.items():
        if name in others:
            continue
        if _CREDENTIAL.match(name) and isinstance(value, str) and value:
            out[name] = True
    return dict(sorted(out.items()))


def read_env_file(path: str) -> dict[str, str]:
    """The variables of a .env file, for --check-config --env-file.

    One NAME=value a line, as docker compose reads it: blank lines and lines starting with # are
    skipped, an optional `export ` is dropped, a value in single quotes is taken as written, one in
    double quotes has \\n, \\t, \\" and \\\\ undone, and an unquoted value ends at a # that
    follows a space. Nothing is expanded. A later line wins over an earlier one with the same
    name. A problem names the file and the line number, never anything the line holds.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError as exc:
        raise ConfigError([f"{path}: cannot read ({exc.strerror})"]) from None
    except UnicodeDecodeError:
        raise ConfigError([f"{path}: not UTF-8 text"]) from None
    out: dict[str, str] = {}
    problems: list[str] = []
    for number, line in enumerate(lines, 1):
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if text.startswith("export "):
            text = text[len("export ") :].lstrip()
        name, eq, value = text.partition("=")
        name = name.strip()
        if not eq or not _ENV_NAME.match(name):
            problems.append(f"{path}: line {number}: expected NAME=value")
            continue
        value = value.strip()
        try:
            out[name] = _env_value(value)
        except ValueError:
            problems.append(f"{path}: line {number}: a quote is not closed")
    if problems:
        raise ConfigError(problems)
    return out


_ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\"}


def _env_value(value: str) -> str:
    """One value of a .env line, unquoted; ValueError when a quote is not closed."""
    if value.startswith("'"):
        end = value.find("'", 1)
        if end < 0:
            raise ValueError
        return value[1:end]
    if value.startswith('"'):
        out, i = [], 1
        while i < len(value):
            ch = value[i]
            if ch == "\\" and i + 1 < len(value):
                nxt = value[i + 1]
                out.append(_ESCAPES.get(nxt, ch + nxt))
                i += 2
                continue
            if ch == '"':
                return "".join(out)
            out.append(ch)
            i += 1
        raise ValueError
    return re.split(r"\s#", value, maxsplit=1)[0].strip()
