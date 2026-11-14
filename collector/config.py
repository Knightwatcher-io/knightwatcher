"""Configuration: config.toml for settings, secrets.json for credentials.

Every setting has a default here, and docs/configuration.md documents each one. A source runs
when its table is present in config.toml and its `enabled` is not false. Watched things are the
`[[thing]]` tables, checked here and turned into one list with the Pi of `[sources.pi]` first.
The `[look]`, `[display]`, `[quiet]` and `[scenes]` tables are the settings screen's household
defaults; they have no defaults here, and only what they set is written to state.json.
"""

from __future__ import annotations

import copy
import json
import re
import tomllib
import urllib.parse
import zoneinfo
from dataclasses import dataclass, field
from typing import Any

CONDITION_IDS = [
    "attack",
    "wan_down",
    "container_unhealthy",
    "disk_full",
    "backup_overdue",
    "pi_silent",
    "thing_down",
    "cpu_hot",
    "memory_tight",
    "ssh_session",
    "updating",
    "streaming",
    "night",
]

COLLECTOR_DEFAULTS: dict[str, Any] = {
    "interval_s": 10,
    "output_dir": "/out",
    "state_dir": "/var/lib/knightwatcher",
    "timezone": "UTC",
    "http_timeout_s": 5.0,
    "auth_backoff_s": 1200,
    "proc_root": "/host/proc",
}

CONDITION_DEFAULTS: dict[str, Any] = {
    "priority": list(CONDITION_IDS),
    "clear_after_s": 30,
    "attack": {"window_s": 600, "jails": ["sshd"], "bans": 5},
    "wan_down": {"failed_checks": 2},
    "container_unhealthy": {"for_s": 180},
    "disk_full": {"pct": 90.0},
    "backup_overdue": {"hours": 30.0},
    "pi_silent": {"for_s": 180},
    "thing_down": {},
    "cpu_hot": {"pct": 85.0, "window_s": 30},
    "memory_tight": {"available_pct": 10.0, "window_s": 30},
    "ssh_session": {"min_sessions": 1, "show_for_s": 600},
    "updating": {},
    "streaming": {"min_streams": 1},
    "night": {"start": "23:00", "end": "07:00"},
}

SOURCE_DEFAULTS: dict[str, dict[str, Any]] = {
    "host": {"enabled": True, "every_s": 10, "disks": []},
    "containers": {"enabled": True, "every_s": 10, "url": "", "ignore": []},
    "wan": {"enabled": True, "every_s": 30, "urls": ["https://1.1.1.1/cdn-cgi/trace"]},
    "dns": {
        "enabled": True,
        "every_s": 30,
        "server": "127.0.0.1",
        "port": 53,
        "name": "example.com",
    },
    "backup": {
        "enabled": True,
        "every_s": 60,
        "log": "/host/backup.log",
        "pattern": r"System Backup Completed: (.+)$",
        "timezone": "UTC",
        "read_bytes": 262144,
    },
    "pi": {"enabled": True, "every_s": 30, "host": "", "ports": [22]},
    "updates": {"enabled": True, "every_s": 10, "holders": []},
    "ssh": {"enabled": True, "every_s": 10, "port": 22, "ignore_sources": []},
    "streams": {"enabled": True, "every_s": 30, "url": "", "secret": "tautulli"},
    "adblock": {
        "enabled": True,
        "every_s": 30,
        "url": "",
        "secret": "adguard",
        "fly_every_s": 300.0,
    },
    "security": {"enabled": True, "every_s": 30, "url": ""},
    "sonarr": {"enabled": True, "every_s": 30, "url": "", "secret": "sonarr"},
    "radarr": {"enabled": True, "every_s": 30, "url": "", "secret": "radarr"},
}

# Settings a source cannot run without.
REQUIRED = {
    "containers": ["url"],
    "pi": ["host"],
    "streams": ["url"],
    "adblock": ["url"],
    "security": ["url"],
    "sonarr": ["url"],
    "radarr": ["url"],
}

# Fields each source needs from its section of secrets.json.
SECRET_FIELDS = {
    "streams": ["api_key"],
    "adblock": ["username", "password"],
    "sonarr": ["api_key"],
    "radarr": ["api_key"],
}

# Settings that were removed, with what to set instead. Naming the replacement beats the plain
# "unknown setting" an old config.toml would otherwise get.
REPLACED = {
    "conditions.clear_after_polls": "clear_after_s, in seconds",
    "conditions.cpu_hot.for_s": "window_s, the seconds the CPU is averaged over",
    "conditions.memory_tight.for_s": "window_s, the seconds available memory is averaged over",
}

# The shortest interval and averaging window the collector accepts, in seconds.
MIN_INTERVAL_S = 5
MIN_WINDOW_S = 10

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# Watched things: the [[thing]] tables.
THING_KINDS = ("pi", "camera", "machine", "vm")
MAX_THINGS = 32  # the Pi of [sources.pi] included
MAX_THING_PORTS = 3
THING_EVERY_S = (10, 3600)
MAX_DOWN_AFTER_S = 86400
# Every setting a [[thing]] table may have. name and kind have no default; host, port, ports and
# url have none either, and which of them are given decides the check.
THING_DEFAULTS: dict[str, Any] = {
    "refused_counts": False,
    "verify_tls": False,
    "every_s": 30,
    "down_after_s": 180,
    "alert": True,
    "enabled": True,
}
THING_SETTINGS = ("name", "kind", "host", "port", "ports", "url", *THING_DEFAULTS)
# 1 to 20 printable ASCII characters, with no space at either end.
_THING_NAME = re.compile(r"^[!-~](?:[ -~]{0,18}[!-~])?$")
# A web address is printable ASCII with no space in it.
_PLAIN_URL = re.compile(r"^[!-~]+$")
# The name the Pi of [sources.pi] has as a thing.
PI_NAME = "Pi"

# The household defaults for the display's settings screen: the [look], [display], [quiet] and
# [scenes] tables, written to state.json as `defaults` with only the keys the config sets. Each key
# maps to the values it may take, in the order the messages list them.
# The swatch families (skin, hair, tabard, plume) are those of web/packs/base.pack.json, the hair
# styles are its hair.* items, and the builds and monarchs are the letters the settings screen
# offers. The page would ignore a value the base pack lacks, so these lists follow the pack.
# The monarch's hair and robe take the hair and tabard swatches.
SKIN_TONES = ("fair", "warm", "golden", "tan", "brown", "deep")
HAIR_COLOURS = ("black", "dark", "brown", "auburn", "blonde", "silver")
TABARD_COLOURS = ("blue", "forest", "violet", "wine", "teal", "sable")
LOOK_CHOICES: dict[str, tuple[str, ...]] = {
    "build": ("a", "b", "c"),
    "weapon": ("greatsword", "sword_and_shield"),
    "skin": SKIN_TONES,
    "hair": HAIR_COLOURS,
    "hair_style": ("short", "tied", "curls"),
    "tabard": TABARD_COLOURS,
    "plume": ("red", "white", "gold", "royal", "green", "violet"),
    "monarch": ("a", "b", "c"),
    "monarch_skin": SKIN_TONES,
    "monarch_hair": HAIR_COLOURS,
    "monarch_robe": TABARD_COLOURS,
}
HEADLINE_SIZES = ("small", "medium", "large")
CLOCKS = (24, 12)
# The quiet scenes the page turns between, as TURNS in web/js/engine.js names them.
QUIET_SCENES = ("battlement", "camp", "house", "yard")
QUIET_MINUTES = (1, 240)
DISPLAY_SETTINGS = ("headline", "clock", "helmet_indoors")
QUIET_SETTINGS = ("scenes", "minutes")
# Every scene the page draws, as ALL_SCENES in web/js/settings.js names them (the files of
# web/js/scenes/). [scenes] maps a condition id to one of them. Which scene can act which
# condition is the page's to know: a known scene that cannot act a condition is accepted here
# and ignored by the page, with a line in its console.
PAGE_SCENES = ("battlement", "camp", "house", "yard", "cellar", "smithy", "court")
DEFAULT_TABLES = ("look", "display", "quiet", "scenes")


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
    # Every enabled watched thing, the Pi of [sources.pi] first; see _things.
    things: list[dict[str, Any]] = field(default_factory=list)
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

    def secret_values(self) -> list[str]:
        """Every secret string, so that error text can be scrubbed of them."""
        return [v for section in self.secrets.values() for v in section.values() if v]


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


def _check_positive(where: str, value: float, problems: list[str], allow_zero=False):
    if value < 0 or (value == 0 and not allow_zero):
        problems.append(f"{where}: must be {'zero or ' if allow_zero else ''}above zero")


def _validate_collector(c: dict, problems: list[str]) -> None:
    if c["interval_s"] < MIN_INTERVAL_S:
        problems.append(f"collector.interval_s: must be at least {MIN_INTERVAL_S}")
    _check_positive("collector.http_timeout_s", c["http_timeout_s"], problems)
    if c["http_timeout_s"] >= c["interval_s"]:
        problems.append("collector.http_timeout_s: must be shorter than interval_s")
    if c["auth_backoff_s"] < 1200:
        problems.append("collector.auth_backoff_s: must be at least 1200 (20 minutes)")
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
    _check_positive("conditions.clear_after_s", c["clear_after_s"], problems, True)
    for cid in ("pi_silent", "container_unhealthy"):
        _check_positive(f"conditions.{cid}.for_s", c[cid]["for_s"], problems, True)
    for cid in ("cpu_hot", "memory_tight"):
        if c[cid]["window_s"] < MIN_WINDOW_S:
            problems.append(f"conditions.{cid}.window_s: must be at least {MIN_WINDOW_S}")
    for where, v in (
        ("cpu_hot.pct", c["cpu_hot"]["pct"]),
        ("memory_tight.available_pct", c["memory_tight"]["available_pct"]),
        ("disk_full.pct", c["disk_full"]["pct"]),
    ):
        if not 0 < v <= 100:
            problems.append(f"conditions.{where}: must be above 0 and at most 100")
    _check_positive("conditions.backup_overdue.hours", c["backup_overdue"]["hours"], problems)
    if c["wan_down"]["failed_checks"] < 1:
        problems.append("conditions.wan_down.failed_checks: must be at least 1")
    _check_positive("conditions.attack.window_s", c["attack"]["window_s"], problems)
    if c["attack"]["bans"] < 1:
        problems.append("conditions.attack.bans: must be at least 1")
    if not all(isinstance(j, str) for j in c["attack"]["jails"]):
        problems.append("conditions.attack.jails: must be a list of strings")
    for key in ("start", "end"):
        if not _HHMM.match(c["night"][key]):
            problems.append(f"conditions.night.{key}: expected HH:MM, 24-hour")
    for where, v in (
        ("ssh_session.min_sessions", c["ssh_session"]["min_sessions"]),
        ("streaming.min_streams", c["streaming"]["min_streams"]),
    ):
        if v < 1:
            problems.append(f"conditions.{where}: must be at least 1")
    _check_positive(
        "conditions.ssh_session.show_for_s", c["ssh_session"]["show_for_s"], problems, True
    )


def _validate_source(name: str, s: dict, problems: list[str]) -> None:
    _check_positive(f"sources.{name}.every_s", s["every_s"], problems)
    for key in REQUIRED.get(name, []):
        if not s[key]:
            problems.append(f"sources.{name}.{key}: required when the source is enabled")
    for key in ("url",):
        if s.get(key) and not re.match(r"^https?://", s[key]):
            problems.append(f"sources.{name}.{key}: must start with http:// or https://")
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
        if not s["holders"]:
            problems.append("sources.updates.holders: list at least one lock holder")
    elif name == "adblock":
        _check_positive("sources.adblock.fly_every_s", s["fly_every_s"], problems, True)
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
    """What is wrong with a thing's url, or None."""
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


def _thing(w: str, t: dict, problems: list[str]) -> dict[str, Any]:
    """Check one [[thing]] table and return it with its defaults filled in."""
    for key in t:
        if key not in THING_SETTINGS:
            problems.append(f"{w}.{key}: unknown setting")
    out = {**THING_DEFAULTS, **{k: v for k, v in t.items() if k in THING_DEFAULTS}}

    name = t.get("name")
    if "name" not in t:
        problems.append(f"{w}.name: required")
    elif not isinstance(name, str) or not _THING_NAME.match(name):
        problems.append(f"{w}.name: 1 to 20 printable ASCII characters, no space at either end")
    kind = t.get("kind")
    if "kind" not in t:
        problems.append(f"{w}.kind: required")
    elif not isinstance(kind, str):
        problems.append(f"{w}.kind: expected str")
    elif "/" in kind:
        problems.append(f"{w}.kind: kinds from packs are not supported yet")
    elif kind not in THING_KINDS:
        kinds = f"{', '.join(THING_KINDS[:-1])} or {THING_KINDS[-1]}"
        problems.append(f'{w}.kind: unknown kind "{kind}"; use {kinds}')

    for key in ("refused_counts", "verify_tls", "alert", "enabled"):
        if not isinstance(out[key], bool):
            problems.append(f"{w}.{key}: expected bool")
    every = out["every_s"]
    low, high = THING_EVERY_S
    if not _is_int(every) or not low <= every <= high:
        problems.append(f"{w}.every_s: must be from {low} to {high}")
    floor = every if _is_int(every) else THING_DEFAULTS["every_s"]
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
        or not 1 <= len(ports) <= MAX_THING_PORTS
        or not all(_is_port(p) for p in ports)
    ):
        problems.append(f"{w}.ports: 1 to {MAX_THING_PORTS} port numbers from 1 to 65535")
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
        source=f"thing:{name}",
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


def _things(raw: Any, sources: dict, conditions: dict, problems: list[str]) -> list[dict]:
    """Check the [[thing]] tables and return every enabled thing, the Pi of [sources.pi] first.

    The Pi keeps the rules of [sources.pi]: its ports are tried as given, a refused connection
    counts as an answer, and it is silent after pi_silent's for_s. It raises pi_silent rather
    than thing_down, and only when the priority list names pi_silent.
    """
    priority = conditions["priority"]
    things: list[dict] = []
    pi = sources.get("pi")
    if pi is not None:
        things.append(
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
        return things
    if not isinstance(raw, list):
        problems.append("thing: expected [[thing]] tables")
        return things

    named: dict[str, int] = {}
    for i, t in enumerate(raw):
        w = f"thing[{i}]"
        if not isinstance(t, dict):
            problems.append(f"{w}: expected a table")
            continue
        thing = _thing(w, t, problems)
        name = thing["name"]
        if isinstance(name, str) and name:
            key = name.lower()
            if pi is not None and key == PI_NAME.lower():
                problems.append(f'{w}.name: "{name}" is taken by [sources.pi]')
            elif key in named:
                problems.append(f'{w}.name: "{name}" is already the name of thing[{named[key]}]')
            else:
                named[key] = i
        if pi is not None and pi["host"]:
            watched = pi["host"].lower()
            if isinstance(thing["host"], str) and thing["host"].lower() == watched:
                problems.append(
                    f"{w}.host: {thing['host']} is already watched by [sources.pi]; remove one"
                )
            elif thing["url"] and _url_host(thing["url"]).lower() == watched:
                problems.append(
                    f"{w}.url: {_url_host(thing['url'])} is already watched by [sources.pi]; "
                    "remove one"
                )
        if thing["enabled"] is True:
            things.append(thing)

    if len(things) > MAX_THINGS:
        problems.append(f"thing: at most {MAX_THINGS} things")
    alerting = [str(t["name"]) for t in things if not t["legacy"] and t["alert"] is True]
    if alerting and "thing_down" not in priority:
        # Say where it goes: after the nearest condition above it in the default order that the
        # list names, or before the nearest one below it.
        at = CONDITION_IDS.index("thing_down")
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
            f'conditions.priority: leaves out "thing_down", so {_say_names(alerting)} would '
            f"never alert; {where}, or set alert = false on {it}"
        )
    return things


def _say_or(values: tuple) -> str:
    """a, b or c."""
    words = [str(v) for v in values]
    return f"{', '.join(words[:-1])} or {words[-1]}"


def _choice(w: str, value: Any, allowed: tuple[str, ...], problems: list[str]) -> None:
    if isinstance(value, str) and value in allowed:
        return
    given = f'unknown value "{value}"' if isinstance(value, str) else "expected text"
    problems.append(f"{w}: {given}; use {_say_or(allowed)}")


def _defaults(raw: dict, problems: list[str]) -> dict[str, dict[str, Any]]:
    """Check the [look], [display], [quiet] and [scenes] tables and return what they set.

    Nothing is filled in: a key the config leaves out is left out, and the page uses its own
    default for it.
    """
    known = {
        "look": tuple(LOOK_CHOICES),
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
            if table == "look":
                _choice(w, value, LOOK_CHOICES[key], problems)
            elif table == "scenes":
                _choice(w, value, PAGE_SCENES, problems)
            elif key == "headline":
                _choice(w, value, HEADLINE_SIZES, problems)
            elif key == "clock":
                if not _is_int(value) or value not in CLOCKS:
                    problems.append(f"{w}: must be {_say_or(CLOCKS)}")
            elif key == "helmet_indoors":
                if not isinstance(value, bool):
                    problems.append(f"{w}: expected true or false")
            elif key == "scenes":  # quiet.scenes
                _quiet_scenes(w, value, problems)
            elif key == "minutes":
                low, high = QUIET_MINUTES
                if not _is_int(value) or not low <= value <= high:
                    problems.append(f"{w}: must be a whole number from {low} to {high}")
            if len(problems) == before:
                out[table][key] = list(value) if isinstance(value, list) else value
    return out


def check_defaults(tables: dict) -> list[str]:
    """Every problem with the [look], [display], [quiet] and [scenes] tables of a parsed config."""
    problems: list[str] = []
    _defaults(tables, problems)
    return problems


def _quiet_scenes(w: str, value: Any, problems: list[str]) -> None:
    if not isinstance(value, list) or not value:
        problems.append(f"{w}: list one or more of {_say_or(QUIET_SCENES)}")
        return
    seen = set()
    for scene in value:
        if not isinstance(scene, str) or scene not in QUIET_SCENES:
            shown = f'"{scene}"' if isinstance(scene, str) else repr(scene)
            problems.append(f"{w}: unknown scene {shown}; use {_say_or(QUIET_SCENES)}")
        elif scene in seen:
            problems.append(f'{w}: "{scene}" listed twice')
        seen.add(scene)


def build(raw: dict, secrets: dict | None = None) -> Config:
    """Validate a parsed config.toml and fill in the defaults.

    The secrets are checked too unless they are None, which the health check uses so that it
    never opens the secrets file.
    """
    problems: list[str] = []
    for key in raw:
        if key not in ("collector", "conditions", "sources", "thing", *DEFAULT_TABLES):
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
    things = _things(raw.get("thing"), sources, conditions, problems)
    defaults = _defaults(raw, problems)
    for name in sources if secrets is not None else []:
        need = SECRET_FIELDS.get(name)
        if not need:
            continue
        section_name = sources[name].get("secret", name)
        section = secrets.get(section_name)
        if not isinstance(section, dict):
            problems.append(f"secrets.json: section {section_name!r} missing (for {name})")
            continue
        for f in need:
            if not isinstance(section.get(f), str) or not section.get(f):
                problems.append(f"secrets.json: {section_name}.{f} missing (for {name})")
    if problems:
        raise ConfigError(problems)
    return Config(collector, conditions, sources, secrets or {}, things, defaults)


def load(config_path: str, secrets_path: str | None) -> Config:
    try:
        with open(config_path, "rb") as fh:
            raw = tomllib.load(fh)
    except OSError as exc:
        raise ConfigError([f"{config_path}: cannot read ({exc.strerror})"]) from None
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError([f"{config_path}: {exc}"]) from None
    secrets: dict | None = None
    if secrets_path:
        try:
            with open(secrets_path, encoding="utf-8") as fh:
                secrets = json.load(fh)
        except FileNotFoundError:
            secrets = {}
        except OSError as exc:
            raise ConfigError([f"{secrets_path}: cannot read ({exc.strerror})"]) from None
        except json.JSONDecodeError as exc:
            # The message names a line and column, never the content.
            raise ConfigError([f"{secrets_path}: not valid JSON (line {exc.lineno})"]) from None
        if not isinstance(secrets, dict):
            raise ConfigError([f"{secrets_path}: expected a JSON object"])
    return build(raw, secrets)
