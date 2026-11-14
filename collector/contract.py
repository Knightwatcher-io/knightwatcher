"""A check of a state document against docs/state.md, used before every write and by the tests."""

from __future__ import annotations

import re
from typing import Any

from collector import SCHEMA, text
from collector.config import CONDITION_IDS, DEFAULT_TABLES, check_defaults

LEVELS = {"critical", "warning", "work", "quiet", "sleep"}
EVENT_TYPES = {"ad_blocked", "ip_banned", "import", "backup_done"}
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
    "things",
)
THING_STATES = {"up", "down", "unknown"}
MAX_THINGS = 32
KIND_MAX = 200
_THING_NAME = re.compile(r"^[!-~](?:[ -~]{0,18}[!-~])?$")
_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _ts(value: Any) -> bool:
    return isinstance(value, str) and bool(_TS.match(value))


def _things(things: Any, p: list[str]) -> int:
    """Check facts.things and return how many things it lists."""
    if things is None:
        return 0
    if not isinstance(things, dict) or set(things) != {"list"}:
        p.append("facts.things is not null or an object with list alone")
        return 0
    entries = things["list"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_THINGS:
        p.append(f"facts.things.list is not a list of 1 to {MAX_THINGS}")
        return 0
    names = set()
    for i, t in enumerate(entries):
        w = f"facts.things.list[{i}]"
        if not isinstance(t, dict):
            p.append(f"{w} is not an object")
            continue
        name = t.get("name")
        if not isinstance(name, str) or not _THING_NAME.match(name):
            p.append(f"{w}.name is not 1 to 20 printable ASCII characters")
        elif name.lower() in names:
            p.append(f"{w}.name is listed twice")
        else:
            names.add(name.lower())
        kind = t.get("kind")
        if not isinstance(kind, str) or not 0 < len(kind) <= KIND_MAX:
            p.append(f"{w}.kind is not text of 1 to {KIND_MAX}")
        state = t.get("state")
        if state not in THING_STATES:
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
        if c.get("id") not in CONDITION_IDS:
            p.append(f"{w}.id is unknown")
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

    facts = state.get("facts")
    listed = 0
    if not isinstance(facts, dict):
        p.append("facts is not an object")
    else:
        for name, section in facts.items():
            if section is not None and not isinstance(section, dict):
                p.append(f"facts.{name} is neither an object nor null")
        if isinstance(facts.get("things"), dict):
            listed = _things(facts["things"], p)
    for i, c in enumerate(conditions):
        if isinstance(c, dict) and c.get("id") == "thing_down":
            # The page finds the things that are down by their positions in facts.things.list.
            places = c.get("things")
            if (
                not isinstance(places, list)
                or not places
                or not all(isinstance(n, int) and not isinstance(n, bool) for n in places)
                or len(set(places)) != len(places)
                or not all(0 <= n < listed for n in places)
            ):
                p.append(f"conditions[{i}].things is not positions in facts.things.list")

    defaults = state.get("defaults")
    if not isinstance(defaults, dict) or set(defaults) != set(DEFAULT_TABLES):
        p.append("defaults is not an object with look, display, quiet and scenes")
    elif not all(isinstance(defaults[t], dict) for t in DEFAULT_TABLES):
        p.append("defaults.look, .display, .quiet and .scenes are not all objects")
    else:
        # The same rules as the config tables they come from.
        p += [f"defaults.{problem}" for problem in check_defaults(defaults)]

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
