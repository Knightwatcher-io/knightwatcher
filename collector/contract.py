"""A check of a state document against docs/state.md, used before every write and by the tests."""

from __future__ import annotations

import re
from typing import Any

from collector import SCHEMA, text
from collector.config import CONDITION_IDS, DEFAULT_TABLES, check_defaults
from collector.kinds.streams import NAME_MAX, SESSION_KEYS, SESSIONS_MAX

LEVELS = {"critical", "warning", "work", "quiet", "sleep"}
EVENT_TYPES = {"ad_blocked", "ip_banned", "import", "backup_done"}
# The parts an event's caption is made of, by type: the names it always has, and those it may.
EVENT_PARTS = {
    "ip_banned": ({"addr"}, {"jail"}),
    "import": ({"title"}, set()),
    "backup_done": ({"at"}, set()),
}
# The parts of the quiet line, in the order they come, with the names of each one's values.
QUIET_PARTS = {"quiet": (), "up": ("n",), "backup": ("at",), "ads": ("n", "short")}
FACT_SECTIONS = (
    "host",
    "containers",
    "wan",
    "dns",
    "backup",
    "pi",
    "updates",
    "streams",
    "ssh",
    "adblock",
    "security",
    "devices",
)
DEVICE_STATES = {"up", "down", "unknown"}
MAX_DEVICES = 32
KIND_MAX = 200
_DEVICE_NAME = re.compile(r"^[!-~](?:[ -~]{0,18}[!-~])?$")
_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
# The version of admin.json: 20 hex characters (collector/overlay.py).
_VERSION = re.compile(r"^[0-9a-f]{20}$")
# A generic check's condition: check:<name>, the name as [[sources.json]] allows it.
_CHECK_ID = re.compile(r"^check:[a-z0-9][a-z0-9-]{0,19}$")
# The conditions a check may borrow, in `as`: every one but device_down.
BORROWS = [cid for cid in CONDITION_IDS if cid != "device_down"]
# Under strain's machines: at most 32 read from sources and this host, each strained on cpu,
# memory or both.
MAX_MACHINES = 33
STRAIN_RESOURCES = ("cpu", "memory")


def _ts(value: Any) -> bool:
    return isinstance(value, str) and bool(_TS.match(value))


def _devices(devices: Any, p: list[str]) -> int:
    """Check facts.devices and return how many devices it lists."""
    if devices is None:
        return 0
    if not isinstance(devices, dict) or set(devices) != {"list"}:
        p.append("facts.devices is not null or an object with list alone")
        return 0
    entries = devices["list"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_DEVICES:
        p.append(f"facts.devices.list is not a list of 1 to {MAX_DEVICES}")
        return 0
    names = set()
    for i, t in enumerate(entries):
        w = f"facts.devices.list[{i}]"
        if not isinstance(t, dict):
            p.append(f"{w} is not an object")
            continue
        name = t.get("name")
        if not isinstance(name, str) or not _DEVICE_NAME.match(name):
            p.append(f"{w}.name is not 1 to 20 printable ASCII characters")
        elif name.lower() in names:
            p.append(f"{w}.name is listed twice")
        else:
            names.add(name.lower())
        kind = t.get("kind")
        if not isinstance(kind, str) or not 0 < len(kind) <= KIND_MAX:
            p.append(f"{w}.kind is not text of 1 to {KIND_MAX}")
        state = t.get("state")
        if state not in DEVICE_STATES:
            p.append(f"{w}.state is not up, down or unknown")
        for key in ("alert", "seen"):
            if not isinstance(t.get(key), bool):
                p.append(f"{w}.{key} is not true or false")
        since = t.get("since")
        if state == "unknown" and since is not None:
            p.append(f"{w}.since is not null while unknown")
        elif state in ("up", "down") and not _ts(since):
            p.append(f"{w}.since is not a UTC timestamp")
        if state == "up" and t.get("seen") is False:
            p.append(f"{w} is up but not seen")
    return len(entries)


def _machines(c: dict, w: str, listed: int, p: list[str]) -> None:
    """Check `machines` on cpu_hot: every machine under strain, each named once."""
    machines = c.get("machines")
    if not isinstance(machines, list) or not 1 <= len(machines) <= MAX_MACHINES:
        p.append(f"{w}.machines is not a list of 1 to {MAX_MACHINES} machines")
        return
    names = set()
    for i, m in enumerate(machines):
        at = f"{w}.machines[{i}]"
        if not isinstance(m, dict):
            p.append(f"{at} is not an object")
            continue
        if set(m) - {"name", "device", "window_s", *STRAIN_RESOURCES}:
            p.append(f"{at} has a key other than name, device, window_s, cpu and memory")
        name = m.get("name")
        if not isinstance(name, str) or not _DEVICE_NAME.match(name):
            p.append(f"{at}.name is not 1 to 20 printable ASCII characters")
        elif name.lower() in names:
            p.append(f"{at}.name is listed twice")
        else:
            names.add(name.lower())
        if "device" in m:
            n = m["device"]
            if not isinstance(n, int) or isinstance(n, bool) or not 0 <= n < listed:
                p.append(f"{at}.device is not a position in facts.devices.list")
        window = m.get("window_s")
        if not isinstance(window, int) or isinstance(window, bool) or window <= 0:
            p.append(f"{at}.window_s is not a positive whole number")
        found = [r for r in STRAIN_RESOURCES if r in m]
        if not found:
            p.append(f"{at} has neither cpu nor memory")
        for r in found:
            pair = m[r]
            if not isinstance(pair, dict) or set(pair) != {"pct", "threshold", "since"}:
                p.append(f"{at}.{r} is not an object of pct, threshold and since")
                continue
            if not all(
                isinstance(pair[k], (int, float)) and not isinstance(pair[k], bool)
                for k in ("pct", "threshold")
            ):
                p.append(f"{at}.{r}.pct and threshold are not numbers")
            if not _ts(pair["since"]):
                p.append(f"{at}.{r}.since is not a UTC timestamp")


def _text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= limit


def _streams(streams: Any, p: list[str]) -> None:
    """Check facts.streams: the count, and the titles and sessions the setting `show` lets out."""
    if not isinstance(streams, dict):
        return
    if "count" not in streams or set(streams) - {"count", "titles", "sessions"}:
        p.append("facts.streams is not count, with titles and sessions alone beside it")
        return
    n = streams["count"]
    if not isinstance(n, int) or isinstance(n, bool) or n < 0:
        p.append("facts.streams.count is not a whole number")
    if "titles" in streams:
        titles = streams["titles"]
        if not isinstance(titles, list) or not all(_text(t, text.DETAIL_MAX) for t in titles):
            p.append(f"facts.streams.titles is not a list of text of 1 to {text.DETAIL_MAX}")
    if "sessions" in streams:
        sessions = streams["sessions"]
        if not isinstance(sessions, list) or not 1 <= len(sessions) <= SESSIONS_MAX:
            p.append(f"facts.streams.sessions is not a list of 1 to {SESSIONS_MAX} sessions")
            return
        limits = {"who": NAME_MAX, "title": text.DETAIL_MAX}
        for i, s in enumerate(sessions):
            w = f"facts.streams.sessions[{i}]"
            if not isinstance(s, dict) or not s or set(s) - set(SESSION_KEYS):
                p.append(f"{w} is not an object with who, title or both")
            elif not all(_text(v, limits[k]) for k, v in s.items()):
                p.append(f"{w} has a who or a title that is empty or too long")


def _config(note: Any) -> list[str]:
    """Check `config`, what the collector says of the settings it uses."""
    p: list[str] = []
    if not isinstance(note, dict) or not {"admin", "at", "problems"} <= set(note):
        return ["config is not an object with admin, at and problems"]
    if set(note) - {"admin", "at", "problems", "refused"}:
        p.append("config has a key other than admin, at, problems and refused")
    for key in ("admin", "refused"):
        value = note.get(key)
        if value is not None and not (isinstance(value, str) and _VERSION.match(value)):
            p.append(f"config.{key} is not null or a version")
    if not _ts(note["at"]):
        p.append("config.at is not a UTC timestamp")
    problems = note["problems"]
    if not isinstance(problems, list) or not all(isinstance(x, str) for x in problems):
        p.append("config.problems is not a list of text")
    return p


def _quiet_parts(parts: Any) -> list[str]:
    """Check `quiet_parts`, the parts of the quiet line."""
    if not isinstance(parts, list) or not parts:
        return ["quiet_parts is not a list of parts"]
    p: list[str] = []
    kinds = []
    for i, part in enumerate(parts):
        w = f"quiet_parts[{i}]"
        if not isinstance(part, dict) or part.get("k") not in QUIET_PARTS:
            p.append(f"{w}.k is unknown")
            continue
        names = QUIET_PARTS[part["k"]]
        if set(part) != {"k", *names}:
            p.append(f"{w} does not have the values of its kind")
        elif not all(
            isinstance(part[n], str) and 0 < len(part[n]) <= text.QUIET_LINE_MAX for n in names
        ):
            p.append(f"{w} has a value that is not text of 1 to {text.QUIET_LINE_MAX}")
        kinds.append(part["k"])
    order = list(QUIET_PARTS)
    if kinds and (kinds[0] != "quiet" or kinds != sorted(set(kinds), key=order.index)):
        p.append("quiet_parts does not start with quiet and keep the order quiet, up, backup, ads")
    return p


def _event_parts(e: dict, w: str) -> list[str]:
    """Check an event's `parts`, which only the types in EVENT_PARTS have."""
    names = EVENT_PARTS.get(e.get("type"))
    if names is None:
        return [f"{w}.parts is on a type that has none"]
    need, may = names
    parts = e["parts"]
    if not isinstance(parts, dict) or not need <= set(parts) <= need | may:
        return [f"{w}.parts does not have the names of its type"]
    if not all(isinstance(v, str) and 0 < len(v) <= text.EVENT_TEXT_MAX for v in parts.values()):
        return [f"{w}.parts has a value that is not text of 1 to {text.EVENT_TEXT_MAX}"]
    return []


def validate(state: Any) -> list[str]:
    """Return every way the document breaks the contract; an empty list means it keeps it."""
    p: list[str] = []
    if not isinstance(state, dict):
        return ["not an object"]
    if state.get("schema") != SCHEMA:
        p.append("schema is not 1")
    if not _ts(state.get("generated_at")):
        p.append("generated_at is not a UTC timestamp")
    if not isinstance(state.get("interval_s"), int) or state["interval_s"] <= 0:
        p.append("interval_s is not a positive whole number")

    conditions = state.get("conditions")
    if not isinstance(conditions, list):
        p.append("conditions is not a list")
        conditions = []
    for i, c in enumerate(conditions):
        w = f"conditions[{i}]"
        if not isinstance(c, dict):
            p.append(f"{w} is not an object")
            continue
        cid = c.get("id")
        is_check = isinstance(cid, str) and bool(_CHECK_ID.match(cid))
        if cid not in CONDITION_IDS and not is_check:
            p.append(f"{w}.id is unknown")
        if is_check and c.get("as") not in BORROWS:
            p.append(f"{w}.as is not a condition a check may borrow")
        elif cid in CONDITION_IDS and "as" in c:
            p.append(f"{w}.as is on a condition that is not a check")
        if c.get("level") not in LEVELS:
            p.append(f"{w}.level is unknown")
        if not _ts(c.get("since")):
            p.append(f"{w}.since is not a UTC timestamp")
        h = c.get("headline")
        if not isinstance(h, str) or len(h) > text.HEADLINE_MAX or h != h.upper():
            p.append(f"{w}.headline is not capitals of at most {text.HEADLINE_MAX}")
        d = c.get("detail")
        if not isinstance(d, str) or len(d) > text.DETAIL_MAX:
            p.append(f"{w}.detail is longer than {text.DETAIL_MAX}")
    ids = [c.get("id") for c in conditions if isinstance(c, dict)]
    if len(ids) != len(set(ids)):
        p.append("conditions lists an id twice")

    q = state.get("quiet_line")
    if not isinstance(q, str) or len(q) > text.QUIET_LINE_MAX:
        p.append(f"quiet_line is not text of at most {text.QUIET_LINE_MAX}")
    if "quiet_parts" in state:
        p += _quiet_parts(state["quiet_parts"])

    events = state.get("events")
    if not isinstance(events, list) or len(events) > 20:
        p.append("events is not a list of at most 20")
        events = []
    last = None
    for i, e in enumerate(events):
        w = f"events[{i}]"
        if not isinstance(e, dict):
            p.append(f"{w} is not an object")
            continue
        if not isinstance(e.get("seq"), int):
            p.append(f"{w}.seq is not a whole number")
        elif last is not None and e["seq"] <= last:
            p.append(f"{w}.seq does not rise")
        else:
            last = e["seq"]
        if e.get("type") not in EVENT_TYPES:
            p.append(f"{w}.type is unknown")
        if not _ts(e.get("at")):
            p.append(f"{w}.at is not a UTC timestamp")
        if not isinstance(e.get("count"), int) or e["count"] < 1:
            p.append(f"{w}.count is not a positive whole number")
        t = e.get("text")
        if not isinstance(t, str) or len(t) > text.EVENT_TEXT_MAX:
            p.append(f"{w}.text is not text of at most {text.EVENT_TEXT_MAX}")
        elif e.get("type") == "ad_blocked" and t:
            p.append(f"{w}.text should be empty for ad_blocked")
        if "parts" in e:
            p += _event_parts(e, w)

    facts = state.get("facts")
    listed = 0
    if not isinstance(facts, dict):
        p.append("facts is not an object")
    else:
        for name, section in facts.items():
            if section is not None and not isinstance(section, dict):
                p.append(f"facts.{name} is neither an object nor null")
        if isinstance(facts.get("devices"), dict):
            listed = _devices(facts["devices"], p)
        _streams(facts.get("streams"), p)
    for i, c in enumerate(conditions):
        if isinstance(c, dict) and c.get("id") == "device_down":
            # The page finds the devices that are down by their positions in facts.devices.list.
            places = c.get("devices")
            if (
                not isinstance(places, list)
                or not places
                or not all(isinstance(n, int) and not isinstance(n, bool) for n in places)
                or len(set(places)) != len(places)
                or not all(0 <= n < listed for n in places)
            ):
                p.append(f"conditions[{i}].devices is not positions in facts.devices.list")
        if isinstance(c, dict) and c.get("id") == "cpu_hot":
            _machines(c, f"conditions[{i}]", listed, p)

    defaults = state.get("defaults")
    if not isinstance(defaults, dict) or set(defaults) != set(DEFAULT_TABLES):
        p.append("defaults is not an object with look, display, quiet and scenes")
    elif not all(isinstance(defaults[t], dict) for t in DEFAULT_TABLES):
        p.append("defaults.look, .display, .quiet and .scenes are not all objects")
    else:
        # The same rules as the config tables they come from.
        p += [f"defaults.{problem}" for problem in check_defaults(defaults)]

    if "config" in state:
        p += _config(state["config"])
    if "analytics" in state:
        analytics = state["analytics"]
        if (
            not isinstance(analytics, dict)
            or set(analytics) != {"on"}
            or not isinstance(analytics["on"], bool)
        ):
            p.append("analytics is not an object with on, true or false, alone")

    sources = state.get("sources")
    if not isinstance(sources, dict):
        p.append("sources is not an object")
    else:
        for name, s in sources.items():
            w = f"sources.{name}"
            if not isinstance(s, dict):
                p.append(f"{w} is not an object")
                continue
            if not isinstance(s.get("ok"), bool):
                p.append(f"{w}.ok is not true or false")
            if not _ts(s.get("at")):
                p.append(f"{w}.at is not a UTC timestamp")
            if not isinstance(s.get("error"), str):
                p.append(f"{w}.error is not text")
    return p
