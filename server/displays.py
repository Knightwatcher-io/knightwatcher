"""The displays the server has seen: one random id a page, with the time each was last seen.

A page posts its id to api/displays at load and every 30 minutes (docs/server.md). The server
keeps the ids in memory and in displays.json in its own folder, which the collector reads to count
the displays seen lately for its usage counts (collector/displays.py holds the file's form and the
count). An id never leaves the host, and nothing else about a display is kept.

Anyone on the LAN can post, so a post can do nothing but record an id: the id's form is checked,
the file keeps at most MAX_IDS ids, the oldest dropped, and the file is written at most once every
WRITE_EVERY_S, so that a flood of posts costs memory for a thousand ids and a write a minute.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import logging
import os
import threading
import time
from collections.abc import Callable

from collector import displays
from collector.store import atomic_write

FILE = displays.FILE
# The longest body a post may have: {"id": "<32 hex>"} with room for spaces.
MAX_BODY = 256
WRITE_EVERY_S = 60.0

log = logging.getLogger("server")


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class Displays:
    """The ids seen, read from the file at start, kept in memory and written behind.

    seen() may be called from several threads at once.
    """

    def __init__(
        self,
        folder: str,
        clock: Callable[[], dt.datetime] = _utcnow,
        write_every_s: float = WRITE_EVERY_S,
    ):
        self.path = os.path.join(folder, FILE)
        self.clock = clock
        self.write_every_s = write_every_s
        self._lock = threading.Lock()
        self._seen = self._load()
        self._written_at: float | None = None
        self._timer: threading.Timer | None = None

    def _load(self) -> dict[str, dt.datetime]:
        try:
            with open(self.path, "rb") as fh:
                return displays.parse(fh.read(displays.MAX_FILE + 1))
        except FileNotFoundError:
            return {}
        except OSError as exc:
            log.warning("displays: %s cannot be read (%s); starting with none", self.path, exc)
            return {}

    def seen(self, display_id: str) -> None:
        """Records that the display with this id was seen now. The caller has checked the id."""
        with self._lock:
            self._seen[display_id] = self.clock()
            self._seen = displays.keep(self._seen)
            self._write_soon()

    def ids(self) -> dict[str, dt.datetime]:
        with self._lock:
            return dict(self._seen)

    def _write_soon(self) -> None:
        """Writes now when the last write is WRITE_EVERY_S old, else once that time is up."""
        now = time.monotonic()
        if self._written_at is None or now - self._written_at >= self.write_every_s:
            self._write()
        elif self._timer is None:
            wait = self.write_every_s - (now - self._written_at)
            self._timer = threading.Timer(wait, self.flush)
            self._timer.daemon = True
            self._timer.start()

    def flush(self) -> None:
        with self._lock:
            self._timer = None
            self._write()

    def _write(self) -> None:
        self._written_at = time.monotonic()
        try:
            # Group-readable, as the other stores are; the collector reads it as the same uid.
            atomic_write(self.path, displays.dump(self._seen), mode=0o640)
        except OSError as exc:
            log.warning("displays: cannot write %s: %s", self.path, exc.strerror)

    def close(self) -> None:
        """Writes what is pending, as the server stops."""
        with self._lock:
            if self._timer is not None:
                with contextlib.suppress(Exception):
                    self._timer.cancel()
                self._timer = None
                self._write()
