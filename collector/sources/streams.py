"""Streams playing now, from Tautulli's activity call."""

from __future__ import annotations

import urllib.parse

from collector.net import AuthError, fetch_json
from collector.sources import Reading, Source, SourceError


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
        sessions = data.get("sessions") or []
        try:
            n = int(data.get("stream_count", len(sessions)))
        except (TypeError, ValueError):
            n = len(sessions)
        titles = [t for t in (title_of(s) for s in sessions) if t]
        return Reading({"count": n, "titles": titles})
