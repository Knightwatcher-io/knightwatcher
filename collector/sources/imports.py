"""Imports from Sonarr and Radarr: each new import record in their history is one event."""

from __future__ import annotations

import urllib.parse
from typing import ClassVar

from collector import text
from collector.net import fetch_json
from collector.sources import Reading, Source, SourceError

IMPORTED = 3  # downloadFolderImported, in both applications' history event types


class _ArrSource(Source):
    section = None
    include: ClassVar[dict[str, str]] = {}

    def fetch(self, now):
        params = {
            "page": 1,
            "pageSize": 10,
            "eventType": IMPORTED,
            "sortKey": "date",
            "sortDirection": "descending",
            **self.include,
        }
        url = self.settings["url"].rstrip("/") + "/api/v3/history?" + urllib.parse.urlencode(params)
        headers = {"X-Api-Key": self.config.secret(self.name)["api_key"]}
        reply = fetch_json(url, self.timeout, headers)
        records = reply.get("records") if isinstance(reply, dict) else None
        if not isinstance(records, list):
            raise SourceError("unexpected reply from the history call")
        out = []
        for r in records:
            if isinstance(r, dict) and isinstance(r.get("id"), int):
                out.append({"id": r["id"], "title": self.title_of(r)})
        return Reading(None, {"records": out})

    def title_of(self, record: dict) -> str:
        return str(record.get("sourceTitle") or "")

    def observe(self, reading, memory, now):
        records = reading.data["records"]
        newest = max((r["id"] for r in records), default=0)
        marker = memory.get("last_id")
        memory["last_id"] = max(newest, marker or 0)
        if marker is None:
            return []
        fresh = sorted((r for r in records if r["id"] > marker), key=lambda r: r["id"])
        return [
            {"type": "import", "count": 1, "text": f"IMPORTED{text.SEP}{r['title']}"} for r in fresh
        ]


class SonarrSource(_ArrSource):
    name = "sonarr"
    include: ClassVar[dict[str, str]] = {"includeSeries": "true", "includeEpisode": "true"}

    def title_of(self, record):
        series = (record.get("series") or {}).get("title")
        ep = record.get("episode") or {}
        if series and isinstance(ep.get("seasonNumber"), int):
            return f"{series} S{ep['seasonNumber']:02d}E{ep.get('episodeNumber', 0):02d}"
        return super().title_of(record)


class RadarrSource(_ArrSource):
    name = "radarr"
    include: ClassVar[dict[str, str]] = {"includeMovie": "true"}

    def title_of(self, record):
        movie = record.get("movie") or {}
        if movie.get("title"):
            year = movie.get("year")
            return f"{movie['title']} ({year})" if year else movie["title"]
        return super().title_of(record)
