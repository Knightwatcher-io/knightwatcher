"""The nightly backup: the last completion line in its log.

The log is rotated by truncation, so it can hold no completion at all for a few hours each week.
The last completion seen is therefore kept in the source's memory and used when the log is empty.
"""

from __future__ import annotations

import datetime as dt
import os
import re
import zoneinfo

from collector import text
from collector.sources import Reading, Source, SourceError

_FORMATS = (
    "%a %d %b %H:%M:%S %Y",  # Thu 12 Nov 03:01:59 2026
    "%a %b %d %H:%M:%S %Y",  # Thu Nov 12 03:01:59 2026
    "%d %b %Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
)
_TZ_TOKEN = re.compile(r"^[A-Z]{2,5}$|^[+-]\d{4}$")


def parse_when(value: str, default_tz: dt.tzinfo) -> dt.datetime:
    """Parse the date a backup log prints, in the forms `date` and ISO 8601 commonly take."""
    value = value.strip()
    try:
        return text.parse_iso(value)
    except ValueError:
        pass
    tokens = value.split()
    tz: dt.tzinfo = default_tz
    rest = []
    for tok in tokens:
        if _TZ_TOKEN.match(tok):
            if tok in ("UTC", "GMT", "Z", "+0000"):
                tz = dt.UTC
            elif tok[0] in "+-":
                sign = 1 if tok[0] == "+" else -1
                tz = dt.timezone(sign * dt.timedelta(hours=int(tok[1:3]), minutes=int(tok[3:])))
            continue
        rest.append(tok)
    cleaned = " ".join(rest)
    for fmt in _FORMATS:
        try:
            return dt.datetime.strptime(cleaned, fmt).replace(tzinfo=tz)
        except ValueError:
            continue
    raise SourceError("cannot read the completion date in the backup log")


def last_completion(path: str, pattern: re.Pattern, read_bytes: int, tz) -> dt.datetime | None:
    try:
        with open(path, "rb") as fh:
            size = os.fstat(fh.fileno()).st_size
            fh.seek(max(0, size - read_bytes))
            tail = fh.read().decode("utf-8", errors="replace")
    except OSError as exc:
        raise SourceError(f"cannot read the backup log ({exc.strerror})") from None
    found = None
    for line in tail.splitlines():
        m = pattern.search(line.strip())
        if m:
            found = m.group(1)
    return parse_when(found, tz) if found else None


class BackupSource(Source):
    name = "backup"
    section = "backup"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        self.pattern = re.compile(settings["pattern"])
        self.tz = zoneinfo.ZoneInfo(settings["timezone"])

    def fetch(self, now):
        s = self.settings
        last = last_completion(s["log"], self.pattern, s["read_bytes"], self.tz)
        return Reading({"last_ok": None, "age_h": None}, {"last": last})

    def observe(self, reading, memory, now):
        found: dt.datetime | None = reading.data["last"]
        known = text.parse_iso(memory["last_ok"]) if memory.get("last_ok") else None
        events = []
        if found and (known is None or found > known):
            if known is not None:
                local = found.astimezone(self.config.tz).strftime("%H:%M")
                events.append({"type": "backup_done", "count": 1, "text": f"BACKUP DONE {local}"})
            memory["last_ok"] = text.iso(found)
            known = found
        if known is not None:
            reading.facts["last_ok"] = text.iso(known)
            reading.facts["age_h"] = round((now - known).total_seconds() / 3600, 1)
        return events
