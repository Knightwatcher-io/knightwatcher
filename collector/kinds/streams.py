"""Streams playing now, from the streams provider.

The setting `show` decides what of them leaves the collector: `names`, who is watching and what;
`titles`, what alone; `count`, how many and nothing else. A field the setting does not let out is
never read from the service's reply: the engine reads names only for `names`, and nothing of a
stream for `count`. No other detail of a stream (device, quality, progress) is in the fill.
"""

from __future__ import annotations

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
    "names": ("count", "sessions", "sessions.title", "sessions.who", "sessions.order"),
    "titles": ("count", "sessions", "sessions.title", "sessions.order"),
    "count": ("count", "sessions"),
}


def _order(session: dict) -> tuple:
    """Sessions by the provider's order, which rises as streams start, so a new stream joins the
    end and the others keep their places; a session without a number keeps its place after
    them."""
    key = str(session.get("order") or "")
    return (0, int(key), "") if key.isdigit() else (1, 0, "")


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
                # A key that rises as streams start: digits sort by their number, others after.
                "order": {"type": "raw", "show": "titles"},
            },
        },
    }

    def allowed(self, settings):
        return frozenset(_SHOWN[settings["show"]])

    def reading(self, fill, settings, config, now):
        sessions = fill["sessions"]
        n = fill.get("count", len(sessions))
        show = settings["show"]
        facts: dict = {"count": n}
        if show == "count":
            return Reading(facts)
        titles, listed = [], []
        for s in sorted(sessions, key=_order):
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
