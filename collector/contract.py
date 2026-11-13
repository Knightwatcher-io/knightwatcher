"""A check of a state document against docs/state.md, used before every write and by the tests."""

from __future__ import annotations

import re
from typing import Any

from collector import SCHEMA, text
from collector.config import CONDITION_IDS

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
)
_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _ts(value: Any) -> bool:
    return isinstance(value, str) and bool(_TS.match(value))


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
    if not isinstance(facts, dict):
        p.append("facts is not an object")
    else:
        for name, section in facts.items():
            if section is not None and not isinstance(section, dict):
                p.append(f"facts.{name} is neither an object nor null")

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
