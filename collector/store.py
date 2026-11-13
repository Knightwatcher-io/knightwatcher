"""Files: the atomic write of state.json, and the small memory that survives a restart."""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import tempfile
from typing import Any

MEMORY_FILE = "memory.json"
LOCK_FILE = "collector.lock"


def atomic_write(path: str, data: bytes, mode: int = 0o644) -> None:
    """Write to a temporary name in the same folder, then rename into place.

    A reader sees the old file or the new one, never half of either. The mode is set
    explicitly, since a temporary file starts readable by its owner alone and the web server
    reading state.json is usually someone else.
    """
    folder = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=folder)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


class Memory:
    """What must survive a restart: the event sequence, recent events, the sources' markers
    and any auth back-off still running. Kept as one JSON file in the state folder."""

    def __init__(self, folder: str):
        self.folder = folder
        self.path = os.path.join(folder, MEMORY_FILE)
        self.data: dict[str, Any] = {"seq": 0, "events": [], "sources": {}, "backoff": {}}
        self._saved = ""
        self._lock_fd: int | None = None

    def lock(self) -> None:
        """Take the state folder for this process; fail if another collector holds it."""
        fd = os.open(os.path.join(self.folder, LOCK_FILE), os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise RuntimeError(f"another collector is using {self.folder}") from None
        self._lock_fd = fd

    def load(self) -> None:
        try:
            with open(self.path, encoding="utf-8") as fh:
                loaded = json.load(fh)
        except FileNotFoundError:
            return
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"cannot read {self.path}: {exc}") from None
        if isinstance(loaded, dict):
            for key in self.data:
                if isinstance(loaded.get(key), type(self.data[key])):
                    self.data[key] = loaded[key]
        self._saved = self._dump()

    def source(self, name: str) -> dict:
        return self.data["sources"].setdefault(name, {})

    def _dump(self) -> str:
        return json.dumps(self.data, sort_keys=True, ensure_ascii=False)

    def save(self) -> None:
        dumped = self._dump()
        if dumped == self._saved:
            return
        atomic_write(self.path, dumped.encode("utf-8"), mode=0o600)
        self._saved = dumped
