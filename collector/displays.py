"""The displays: which pages have shown the wall lately, for the usage counts.

Each page served by the bundled server makes a random id once, keeps it in its browser's storage,
and posts it to api/displays at load and every 30 minutes. The server keeps the time it last saw
each id in one file in its own folder, displays.json:

    {"v": 1, "seen": {"3f9c0d12ab45e6789a0b3f9c0d12ab45": "2026-01-15T21:42:10Z"}}

at most MAX_IDS of them, the oldest dropped first. The collector, which mounts that folder
read-only, counts the ids seen in the last WINDOW_S and sends the count alone in its heartbeat
(collector/heartbeat.py); an id never leaves the host. Both read the file with parse(), so the two
always agree on what it holds. docs/server.md describes the address.
"""

from __future__ import annotations

import datetime as dt
import json
import re

from collector import text

FILE = "displays.json"
VERSION = 1
# The most ids the file keeps; a new one past it drops the one seen longest ago.
MAX_IDS = 1000
# A display counts while it has been seen within this window.
WINDOW_S = 6 * 3600
# A display's id: 32 lowercase hexadecimal characters, 16 random bytes.
ID = re.compile(r"^[0-9a-f]{32}$")
# The most a file of MAX_IDS entries can take, with room to spare; a larger one is not read.
MAX_FILE = 128 * 1024


def is_id(value: object) -> bool:
    return isinstance(value, str) and bool(ID.match(value))


def parse(data: bytes) -> dict[str, dt.datetime]:
    """The ids in a file and when each was last seen. An entry that is not an id with a UTC
    timestamp is left out; a file that is not JSON, not an object or not version 1 holds none."""
    if len(data) > MAX_FILE:
        return {}
    try:
        raw = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return {}
    if (
        not isinstance(raw, dict)
        or raw.get("v") != VERSION
        or not isinstance(raw.get("seen"), dict)
    ):
        return {}
    out: dict[str, dt.datetime] = {}
    for key, value in raw["seen"].items():
        if not is_id(key) or not isinstance(value, str):
            continue
        try:
            out[key] = text.parse_iso(value)
        except ValueError:
            continue
    return keep(out)


def keep(seen: dict[str, dt.datetime]) -> dict[str, dt.datetime]:
    """At most MAX_IDS ids, those seen most recently."""
    if len(seen) <= MAX_IDS:
        return seen
    newest = sorted(seen.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)[:MAX_IDS]
    return dict(newest)


def dump(seen: dict[str, dt.datetime]) -> bytes:
    """The file for a set of ids, sorted by id so that the same ids give the same bytes."""
    body = {"v": VERSION, "seen": {k: text.iso(seen[k]) for k in sorted(seen)}}
    return (json.dumps(body, separators=(",", ":")) + "\n").encode("utf-8")


def count(seen: dict[str, dt.datetime], now: dt.datetime) -> int:
    """How many ids were seen within WINDOW_S of now. A time ahead of now, from a clock that went
    back, counts as seen."""
    since = now - dt.timedelta(seconds=WINDOW_S)
    return min(MAX_IDS, sum(1 for at in seen.values() if at >= since))


def read(path: str, now: dt.datetime) -> int:
    """The count of displays seen lately, from the server's file at path; 0 when it is missing or
    cannot be read."""
    try:
        with open(path, "rb") as fh:
            data = fh.read(MAX_FILE + 1)
    except OSError:
        return 0
    return count(parse(data), now)
