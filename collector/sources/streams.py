"""Streams playing now, from Tautulli's activity call.

The setting `show` decides what of them leaves the collector: `names`, who is watching and what;
`titles`, what alone; `count`, how many and nothing else. Names are read from Tautulli only for
`names`. No other detail of a stream (device, quality, progress) is read.
"""

from __future__ import annotations

import urllib.parse

from collector import text
from collector.net import AuthError, fetch_json
from collector.sources import Reading, Source, SourceError

SHOWS = ("names", "titles", "count")
# The longest name a stream is shown under; a longer one is cut with an ellipsis.
NAME_MAX = 16
# The keys of a session in facts.streams.sessions, and the most sessions listed there.
SESSION_KEYS = ("who", "title")
SESSIONS_MAX = 32


def title_of(session: dict) -> str:
    kind = session.get("media_type")
    if kind == "episode":
        show = session.get("grandparent_title") or ""
        try:
            season = int(session.get("parent_media_index"))
            episode = int(session.get("media_index"))
            se = f"S{season:02d}E{episode:02d}"
        except (TypeError, ValueError):
            se = ""
        return " ".join(p for p in (show, se) if p) or session.get("full_title", "")
    if kind == "track":
        artist = session.get("grandparent_title") or ""
        track = session.get("title") or ""
        return " - ".join(p for p in (artist, track) if p)
    return session.get("title") or session.get("full_title") or ""


def name_of(session: dict) -> str:
    """Who is watching: Tautulli's friendly name for the user, else the user, else the user name,
    cleaned and cut to NAME_MAX; empty when none of them gives one."""
    for key in ("friendly_name", "user", "username"):
        value = session.get(key)
        if isinstance(value, str) and text.clean(value):
            return text.clip(text.clean(value), NAME_MAX)
    return ""


def _order(session: dict) -> tuple:
    """Sessions by Tautulli's session key, which rises as streams start, so a new stream joins
    the end and the others keep their places; a session without a number keeps its place after
    them."""
    key = str(session.get("session_key") or "")
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


class StreamsSource(Source):
    name = "streams"
    section = "streams"

    def fetch(self, now):
        key = self.config.secret(self.name)["api_key"]
        query = urllib.parse.urlencode({"apikey": key, "cmd": "get_activity"})
        reply = fetch_json(self.settings["url"].rstrip("/") + "/api/v2?" + query, self.timeout)
        resp = reply.get("response", {}) if isinstance(reply, dict) else {}
        if resp.get("result") != "success":
            message = str(resp.get("message") or "")
            if "key" in message.lower():
                raise AuthError("API key refused")
            raise SourceError("Tautulli reported an error")
        data = resp.get("data") or {}
        sessions = [s for s in data.get("sessions") or [] if isinstance(s, dict)]
        try:
            n = int(data.get("stream_count", len(sessions)))
        except (TypeError, ValueError):
            n = len(sessions)
        show = self.settings["show"]
        facts: dict = {"count": n}
        if show == "count":
            return Reading(facts)
        titles, listed = [], []
        for s in sorted(sessions, key=_order):
            entry = {}
            if show == "names":
                who = name_of(s)
                if who:
                    entry["who"] = who
            title = text.detail(text.clean(title_of(s)))
            if title:
                entry["title"] = title
                titles.append(title)
            if entry:
                listed.append(entry)
        facts["titles"] = titles
        if listed:
            facts["sessions"] = listed[:SESSIONS_MAX]
        return Reading(facts)
