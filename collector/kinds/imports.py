"""Imports, from Sonarr's and Radarr's history: each new import record is one event."""

from __future__ import annotations

from collector import text
from collector.kinds import Kind
from collector.sources import Reading


class ImportsKind(Kind):
    name = "imports"
    section = None
    FILL = {  # noqa: RUF012 - read only
        # The newest import records the service lists.
        "records": {
            "type": "list",
            "required": True,
            "max": 50,
            "items": {
                # The rising record number; a record without one is left out.
                "id": {"type": "int", "strict": True, "required": True},
                # The caption's title, composed by the provider.
                "title": {"type": "string"},
            },
        },
    }

    def reading(self, fill, settings, config, now):
        records = [{"id": r["id"], "title": r.get("title", "")} for r in fill["records"]]
        return Reading(None, {"records": records})

    def observe(self, reading, memory, settings, config, now):
        records = reading.data["records"]
        newest = max((r["id"] for r in records), default=0)
        marker = memory.get("last_id")
        memory["last_id"] = max(newest, marker or 0)
        if marker is None:
            return []
        fresh = sorted((r for r in records if r["id"] > marker), key=lambda r: r["id"])
        return [
            {
                "type": "import",
                "count": 1,
                "text": f"IMPORTED{text.SEP}{r['title']}",
                "parts": {"title": r["title"]},
            }
            for r in fresh
        ]


KIND = ImportsKind
