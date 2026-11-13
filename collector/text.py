"""Text helpers: the length limits of the contract, and the small formats the words use."""

from __future__ import annotations

import datetime as dt

ELLIPSIS = "…"

HEADLINE_MAX = 16
DETAIL_MAX = 60
QUIET_LINE_MAX = 52
EVENT_TEXT_MAX = 44

SEP = " · "


def clip(text: str, limit: int) -> str:
    """Return text cut to at most limit characters, ending in an ellipsis when cut."""
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    if limit <= 1:
        return ELLIPSIS[:limit]
    return text[: limit - 1].rstrip() + ELLIPSIS


def headline(text: str) -> str:
    return clip(str(text).upper(), HEADLINE_MAX)


def detail(text: str) -> str:
    return clip(text, DETAIL_MAX)


def event_text(text: str) -> str:
    return clip(text, EVENT_TEXT_MAX)


def join_fitting(parts: list[str], limit: int) -> str:
    """Join parts with the separator, dropping parts from the end until the line fits.

    The first part is always kept, and clipped if it alone is too long.
    """
    kept = [p for p in parts if p]
    while len(kept) > 1 and len(SEP.join(kept)) > limit:
        kept.pop()
    return clip(SEP.join(kept), limit)


def duration(seconds: float) -> str:
    """A short duration for reading across a room: 40 s, 12 min, 5 h, 3 d."""
    s = max(0, int(seconds))
    if s < 60:
        return f"{s} s"
    if s < 3600:
        return f"{s // 60} min"
    if s < 2 * 86400:
        return f"{s // 3600} h"
    return f"{s // 86400} d"


def count(n: int) -> str:
    """A whole number with thousands separators."""
    return f"{int(n):,}"


def short_count(n: int) -> str:
    """A whole number in few characters: 4,812, then 11.3k, 240k, 1.4M."""
    n = int(n)
    if n < 10_000:
        return count(n)
    if n < 100_000:
        return f"{n / 1000:.1f}k"
    if n < 1_000_000:
        return f"{n // 1000}k"
    return f"{n / 1_000_000:.1f}M"


def times(n: int) -> str:
    return {1: "once", 2: "twice"}.get(n, f"{n} times")


def plural(n: int, word: str, many: str | None = None) -> str:
    return f"{n} {word if n == 1 else (many or word + 's')}"


def iso(t: dt.datetime) -> str:
    """UTC timestamp in the contract's form, to the second."""
    return t.astimezone(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> dt.datetime:
    """Parse an ISO 8601 timestamp; a naive one is taken as UTC."""
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    t = dt.datetime.fromisoformat(v)
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.UTC)
    return t
