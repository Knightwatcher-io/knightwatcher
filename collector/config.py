"""Configuration: config.toml for settings, the environment for credentials.

collector/settings-schema.json describes every setting: its type, its allowed values or range and
its default. The defaults and the plain checks here are built from it, and the checks that are not
plain (the priority list, addresses, patterns, devices and the Pi) are written out below.
A source runs when its table is present in config.toml and its `enabled` is not false.
Devices are the `[[device]]` tables, checked here and turned into one list with the Pi of
`[sources.pi]` first. The `[look]`, `[display]`, `[quiet]` and `[scenes]` tables are the settings
screen's household defaults; they have no defaults here, and only what they set is written to
state.json. Where they take the long name of a part from a pack, "<pack>/<id>", only its form is
checked here. Credentials come from environment variables named KNIGHTWATCHER_<SECRET>_<FIELD>,
where SECRET is the source's `secret` setting; no message ever carries a credential's value.
"""

from __future__ import annotations

import copy
import re
import tomllib
import urllib.parse
import zoneinfo
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from collector import schema

CONDITION_IDS = schema.condition_ids()

COLLECTOR_DEFAULTS: dict[str, Any] = schema.defaults("collector")

CONDITION_DEFAULTS: dict[str, Any] = {
    **schema.defaults("conditions"),
    **{cid: schema.defaults(f"conditions.{cid}") for cid in CONDITION_IDS},
}

SOURCE_DEFAULTS: dict[str, dict[str, Any]] = {
    name: schema.defaults(f"sources.{name}") for name in schema.source_names()
}

# Settings a source cannot run without.
REQUIRED = {
    name: [s["key"] for s in schema.settings(f"sources.{name}") if s.get("required")]
    for name in SOURCE_DEFAULTS
}
REQUIRED = {name: keys for name, keys in REQUIRED.items() if keys}

# The credentials each source needs, by field; each is read from KNIGHTWATCHER_<SECRET>_<FIELD>.
SECRET_FIELDS: dict[str, list[str]] = {}
for _e in schema.credentials():
    SECRET_FIELDS.setdefault(_e["source"], []).append(_e["field"])
# A source's `secret` names variables, so it is letters, digits and underscores.
_SECRET_NAME = re.compile(r"^[A-Za-z0-9_]+$")

# Settings that were removed, with what to set instead. Naming the replacement beats the plain
# "unknown setting" an old config.toml would otherwise get.
REPLACED = {
    "conditions.clear_after_polls": "clear_after_s, in seconds",
    "conditions.cpu_hot.for_s": "window_s, the seconds the CPU is averaged over",
    "conditions.memory_tight.for_s": "window_s, the seconds available memory is averaged over",
}

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
        name = self.sources[source].get("secret", source)
        return self.secrets.get(name, {})

    # The value of every credential variable the environment held, used or not, for scrubbing.
    scrub: list[str] = field(default_factory=list, repr=False)
    # Built with missing="report": each enabled source whose credentials the environment lacks,
    # with the problems that name them. Such a source runs and fails, saying which is missing.
    missing: dict[str, list[str]] = field(default_factory=dict)

    def secret_values(self) -> list[str]:
        """Every secret string, so that error text can be scrubbed of them."""
        used = [v for section in self.secrets.values() for v in section.values() if v]
        return list(dict.fromkeys(used + self.scrub))


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


def _validate_source(name: str, s: dict, problems: list[str]) -> None:
    table = f"sources.{name}"
    _check_ranges(table, s, table, problems)
    for spec in schema.settings(table):
        if spec["type"] == "string" and "values" in spec:
            _choice(f"{table}.{spec['key']}", s[spec["key"]], tuple(spec["values"]), problems)
    for key in REQUIRED.get(name, []):
        if not s[key]:
            why = schema.setting(table, key).get("required_problem")
            problems.append(f"{table}.{key}: {why or 'required when the source is enabled'}")
    for key in ("url",):
        if s.get(key) and not re.match(r"^https?://", s[key]):
            problems.append(f"sources.{name}.{key}: must start with http:// or https://")
    if "secret" in s and not _SECRET_NAME.match(s["secret"]):
        problems.append(f"sources.{name}.secret: use letters, digits and underscores")
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
) -> dict[str, dict[str, str]]:
    """The credentials of the enabled sources, by their `secret`, read from env.

    A credential that is unset or empty is a problem naming its variable, added to problems, or
    to missing under its source's name when missing is given. No message here, or anywhere else,
    carries a credential's value.
    """
    out: dict[str, dict[str, str]] = {}
    for name, s in sources.items():
        need = SECRET_FIELDS.get(name)
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


def build(raw: dict, env: Mapping[str, str] | None = None, missing: str = "refuse") -> Config:
    """Validate a parsed config.toml and fill in the defaults.

    The credentials are read from env, a mapping of environment variables, and checked too,
    unless env is None, which the health check uses so that it needs none. A credential env lacks
    is a problem, or with missing="report" is kept in the Config's `missing` instead, so that a
    collector taking up a change while it runs keeps going with that source failing.
    """
    if missing not in ("refuse", "report"):
        raise ValueError(f"missing: {missing!r}")
    problems: list[str] = []
    for key in raw:
        if key not in ("collector", "conditions", "sources", "device", *DEFAULT_TABLES):
            problems.append(f"{key}: unknown table")
    collector = _merge("collector", COLLECTOR_DEFAULTS, raw.get("collector", {}), problems)
    conditions = _merge("conditions", CONDITION_DEFAULTS, raw.get("conditions", {}), problems)
    sources: dict[str, dict] = {}
    for name, given in raw.get("sources", {}).items():
        if name not in SOURCE_DEFAULTS:
            problems.append(f"sources.{name}: unknown source")
            continue
        if not isinstance(given, dict):
            problems.append(f"sources.{name}: expected a table")
            continue
        merged = _merge(f"sources.{name}", SOURCE_DEFAULTS[name], given, problems)
        if merged["enabled"]:
            sources[name] = merged
    if not problems:
        _validate_collector(collector, problems)
        _validate_conditions(conditions, problems)
        for name, s in sources.items():
            _validate_source(name, s, problems)
    devices = _devices(raw.get("device"), sources, conditions, problems)
    defaults = _defaults(raw, problems)
    lacking: dict[str, list[str]] = {}
    report = lacking if missing == "report" else None
    secrets = _credentials(sources, env, problems, report) if env is not None else {}
    # The credentials the schema names are scrubbed from error text whether or not a source uses
    # them, as every section of the old secrets file was.
    names = [e["name"] for e in schema.credentials()]
    scrub = [env[n] for n in names if env is not None and isinstance(env.get(n), str) and env[n]]
    if problems:
        raise ConfigError(problems)
    return Config(collector, conditions, sources, secrets, devices, defaults, scrub, lacking)


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
    """Read config.toml and build it, with the credentials from env (see build)."""
    return build(read(config_path), env)


# The fields a credential variable ends with: KNIGHTWATCHER_<SECRET>_<FIELD>.
_CREDENTIAL = re.compile(
    r"^KNIGHTWATCHER_[A-Z0-9_]+_(?:"
    + "|".join(sorted({e["field"].upper() for e in schema.credentials()}))
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
