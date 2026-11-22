"""Streams playing now, from the streams provider.

The setting `show` decides what of them leaves the collector: `names`, who is watching and what;
`titles`, what alone; `count`, how many and nothing else. A field the setting does not let out is
never read from the service's reply: the engine reads names only for `names`, and nothing of a
stream for `count`. No other detail of a stream (device, quality, progress) is in the fill.

Streams are listed in the order they started, so a new stream joins the end and the page's cycle
through them keeps its place. A provider whose service gives a number that rises as streams start
(Tautulli's and Plex's session key), or the moment each stream started (Tracearr's), fills
`order`. One whose service gives neither (Jellyfin) fills `key`, the stream's identity, and the
kind lists those streams in the order it first saw each key, which it keeps in the running process
alone, never in the memory file.
"""

from __future__ import annotations

import datetime as dt

from collector import text
from collector.kinds import Kind
from collector.sources import Reading

SHOWS = ("names", "titles", "count")
# The longest name a stream is shown under; a longer one is cut with an ellipsis.
NAME_MAX = 16
# The keys of a session in facts.streams.sessions, and the most sessions listed there.
SESSION_KEYS = ("who", "title")
SESSIONS_MAX = 32

# The fields of the fill each setting of `show` lets the engine read.
_SHOWN = {
    "names": (
        "count",
        "sessions",
        "sessions.title",
        "sessions.who",
        "sessions.order",
        "sessions.key",
    ),
    "titles": ("count", "sessions", "sessions.title", "sessions.order", "sessions.key"),
    "count": ("count", "sessions"),
}


def _digits(value) -> int | None:
    """A value whose text is all digits, as its number; None for any other."""
    said = str(value or "")
    return int(said) if said.isdigit() else None


def _tie(key) -> tuple:
    """Where a key puts a session among those level with it: digits by their number, before other
    text, and no key last."""
    if key is None:
        return (2, 0, "")
    tie = _digits(key)
    return (0, tie, "") if tie is not None else (1, 0, key)


def _order(session: dict, seen: dict[str, int]) -> tuple:
    """Where a session is listed. First the sessions with an order: of digits, by its number, which
    rises as streams start, or a time, the moment the stream started, ties by the key; then those
    with a key, by the read that first saw it, ties by the key; then the rest, keeping their
    places. A number and a time compare as numbers, so a provider gives one sort of order."""
    order = session.get("order")
    if isinstance(order, dt.datetime):
        return (0, order.timestamp(), _tie(session.get("key")))
    number = _digits(order)
    if number is not None:
        return (0, number, ())
    key = session.get("key")
    if key is not None and key in seen:
        return (1, seen[key], _tie(key))
    return (2, 0, ())


def line(session: dict, i: int, n: int) -> str:
    """One stream in words, the i-th of n: `Robin · The Night Shift S02E04 · 1 of 3`, with no
    `1 of 1` for a single stream. The name and the count are kept whole and the title gives way,
    cut with an ellipsis to fit the detail's limit, or left out when nothing of it would fit."""
    who = text.clip(session.get("who") or "", NAME_MAX)
    title = session.get("title") or ""
    tail = f"{i} of {n}" if n > 1 else ""
    fixed = [p for p in (who, tail) if p]
    room = text.DETAIL_MAX - len(text.SEP.join([*fixed, ""])) if fixed else text.DETAIL_MAX
    title = text.clip(title, room) if title and room > 1 else ""
    return text.detail(text.SEP.join(p for p in (who, title, tail) if p))


def shown(facts: dict | None, show: str) -> dict | None:
    """The streams section as the setting `show` lets it leave the collector: without names for
    `titles`, and with the count alone for `count`."""
    if facts is None:
        return None
    out: dict = {"count": facts["count"]}
    if show == "count":
        return out
    out["titles"] = list(facts.get("titles") or [])
    keep = ("who", "title") if show == "names" else ("title",)
    sessions = [{k: s[k] for k in keep if s.get(k)} for s in facts.get("sessions") or []]
    sessions = [s for s in sessions if s]
    if sessions:
        out["sessions"] = sessions[:SESSIONS_MAX]
    return out


class StreamsKind(Kind):
    name = "streams"
    section = "streams"
    FILL = {  # noqa: RUF012 - read only
        # How many streams the service reports; without it, the number of sessions.
        "count": {"type": "int", "min": 0},
        # One item for each stream playing.
        "sessions": {
            "type": "list",
            "required": True,
            "items": {
                # What plays, composed by the provider (The Night Shift S02E04).
                "title": {"type": "string", "show": "titles"},
                # Who is watching.
                "who": {"type": "string", "show": "names"},
                # A key that rises as streams start: digits sort by their number, a time by its
                # moment, others after.
                "order": {"type": "raw", "show": "titles"},
                # The stream's identity, for a service with no such key: streams are then listed
                # in the order the kind first saw each.
                "key": {"type": "string", "show": "titles"},
            },
        },
    }

    def __init__(self):
        # The keys of the streams playing at the last read, each with the number of the read that
        # first saw it. Kept by the running collector alone; a key no longer playing is dropped.
        self._seen: dict[str, int] = {}
        self._reads = 0

    def allowed(self, settings):
        return frozenset(_SHOWN[settings["show"]])

    def _first_seen(self, sessions: list[dict]) -> dict[str, int]:
        """The read that first saw each key of this read's sessions, this one for a new key."""
        self._reads += 1
        keys = [s["key"] for s in sessions if "key" in s]
        self._seen = {k: self._seen.get(k, self._reads) for k in keys}
        return self._seen

    def reading(self, fill, settings, config, now):
        sessions = fill["sessions"]
        n = fill.get("count", len(sessions))
        show = settings["show"]
        facts: dict = {"count": n}
        if show == "count":
            return Reading(facts)
        seen = self._first_seen(sessions)
        titles, listed = [], []
        for s in sorted(sessions, key=lambda s: _order(s, seen)):
            entry = {}
            if show == "names":
                who = text.clip(text.clean(s["who"]), NAME_MAX) if "who" in s else ""
                if who:
                    entry["who"] = who
            title = text.detail(text.clean(s.get("title", "")))
            if title:
                entry["title"] = title
                titles.append(title)
            if entry:
                listed.append(entry)
        facts["titles"] = titles
        if listed:
            facts["sessions"] = listed[:SESSIONS_MAX]
        return Reading(facts)


KIND = StreamsKind
