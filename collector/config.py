"""Configuration: config.toml for settings, secrets.json for credentials.

Every setting has a default here, and docs/configuration.md documents each one. A source runs
when its table is present in config.toml and its `enabled` is not false.
"""

from __future__ import annotations

import copy
import json
import re
import tomllib
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
    "cpu_hot",
    "memory_tight",
    "ssh_session",
    "updating",
    "streaming",
    "night",
]

COLLECTOR_DEFAULTS: dict[str, Any] = {
    "interval_s": 30,
    "output_dir": "/out",
    "state_dir": "/var/lib/knightwatch",
    "timezone": "UTC",
    "http_timeout_s": 5.0,
    "auth_backoff_s": 1200,
    "proc_root": "/host/proc",
}

CONDITION_DEFAULTS: dict[str, Any] = {
    "priority": list(CONDITION_IDS),
    "clear_after_polls": 1,
    "attack": {"window_s": 600, "jails": ["sshd"], "bans": 5},
    "wan_down": {"failed_checks": 2},
    "container_unhealthy": {"for_s": 180},
    "disk_full": {"pct": 90.0},
    "backup_overdue": {"hours": 30.0},
    "pi_silent": {"for_s": 180},
    "cpu_hot": {"pct": 85.0, "for_s": 300},
    "memory_tight": {"available_pct": 10.0, "for_s": 300},
    "ssh_session": {"min_sessions": 1, "show_for_s": 600},
    "updating": {},
    "streaming": {"min_streams": 1},
    "night": {"start": "23:00", "end": "07:00"},
}

SOURCE_DEFAULTS: dict[str, dict[str, Any]] = {
    "host": {"enabled": True, "disks": []},
    "containers": {"enabled": True, "url": "", "ignore": []},
    "wan": {"enabled": True, "urls": ["https://1.1.1.1/cdn-cgi/trace"]},
    "dns": {"enabled": True, "server": "127.0.0.1", "port": 53, "name": "example.com"},
    "backup": {
        "enabled": True,
        "log": "/host/backup.log",
        "pattern": r"System Backup Completed: (.+)$",
        "timezone": "UTC",
        "read_bytes": 262144,
    },
    "pi": {"enabled": True, "host": "", "ports": [22]},
    "updates": {"enabled": True, "holders": []},
    "ssh": {"enabled": True, "port": 22, "ignore_sources": []},
    "streams": {"enabled": True, "url": "", "secret": "tautulli"},
    "adblock": {"enabled": True, "url": "", "secret": "adguard"},
    "security": {"enabled": True, "url": ""},
    "sonarr": {"enabled": True, "url": "", "secret": "sonarr"},
    "radarr": {"enabled": True, "url": "", "secret": "radarr"},
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

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


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
    _check_positive("collector.interval_s", c["interval_s"], problems)
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
    _check_positive("conditions.clear_after_polls", c["clear_after_polls"], problems, True)
    for cid in ("cpu_hot", "memory_tight", "pi_silent", "container_unhealthy"):
        _check_positive(f"conditions.{cid}.for_s", c[cid]["for_s"], problems, True)
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
    elif name == "ssh":
        import ipaddress

        for net in s["ignore_sources"]:
            try:
                ipaddress.ip_network(net, strict=False)
            except (ValueError, TypeError):
                problems.append(f"sources.ssh.ignore_sources: {net!r} is not an address range")


def build(raw: dict, secrets: dict | None = None) -> Config:
    """Validate a parsed config.toml and fill in the defaults.

    The secrets are checked too unless they are None, which the health check uses so that it
    never opens the secrets file.
    """
    problems: list[str] = []
    for key in raw:
        if key not in ("collector", "conditions", "sources"):
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
    return Config(collector, conditions, sources, secrets or {})


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
