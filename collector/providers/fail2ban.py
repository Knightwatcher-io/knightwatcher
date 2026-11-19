"""fail2ban: the bans of the last day, from fail2ban's own SQLite database. A code adapter.

fail2ban writes one row to its `bans` table for every new ban, a ban made by hand with
`fail2ban-client set <jail> banip` included; bans restored when it starts are not written again,
and an unban deletes the rows of that address in that jail. `timeofban` is whole epoch seconds,
the time of the failure that led to the ban, so a row can land a little after its time and carry
an older time than a row written before it. The kind finds new bans by their key (jail, address,
time) for that reason, never by time or by rowid, which SQLite reuses after a delete.

Each read opens the file afresh, runs one query and closes it:

- `mode=ro`: SQLite opens the file read-only and never creates anything beside it. fail2ban keeps
  its rollback journal in memory and does not use WAL, so a reader needs no -journal, -wal or -shm
  file and no write access anywhere.
- not `immutable`: that would turn SQLite's locking off, and fail2ban writes the file while it is
  read. The reader takes a shared lock for the few milliseconds of the query, which holds
  fail2ban's next commit back for that long; fail2ban waits up to five seconds for a lock.
- a connection made at each read: one held open would go on reading a file fail2ban has replaced
  (moved aside and rebuilt after damage), since it holds the old inode.

docs/configuration.md gives the read ACL and the mount the collector needs to reach the file.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import os
import sqlite3
import stat
import urllib.parse

from collector.kinds import security
from collector.net import SourceError
from collector.providers import Provider, adapter

DEFAULT_DATABASE = "/host/fail2ban/fail2ban.sqlite3"
CANNOT_OPEN = "cannot open the fail2ban database (see the read ACL in configuration.md)"
# How long a read waits for fail2ban to finish writing before it gives up until the next read.
BUSY_TIMEOUT_S = 1.0

QUERY = (
    "SELECT jail, ip, timeofban FROM bans WHERE timeofban >= ? "
    "ORDER BY timeofban DESC, rowid DESC LIMIT ?"
)


def _uri(path: str) -> str:
    """The database's path as a read-only SQLite URI."""
    return "file:" + urllib.parse.quote(path) + "?mode=ro"


@adapter(
    "fail2ban",
    kind="security",
    name="fail2ban",
    docs="https://github.com/fail2ban/fail2ban/blob/master/fail2ban/server/database.py",
    settings={
        "database": {
            "type": "string",
            "default": DEFAULT_DATABASE,
            "help": "The fail2ban database, as a path inside the collector's container.",
        }
    },
)
class Fail2banProvider(Provider):
    def __init__(self, settings, credentials, timeout, allowed, config=None):
        self.path = settings.get("database") or DEFAULT_DATABASE
        # The configuration in use, asked at each read, for the attack window.
        self.config = config

    def read(self, now: dt.datetime) -> dict:
        span = security.span(self.config()) if self.config is not None else security.DAY
        start = int((now - span).timestamp())
        rows = self._rows(start)
        bans = []
        for jail, ip, timeofban in reversed(rows):
            if not isinstance(ip, str) or not ip or isinstance(timeofban, bool):
                continue
            if not isinstance(timeofban, (int, float)):
                continue
            try:
                at = dt.datetime.fromtimestamp(timeofban, dt.UTC)
            except (OverflowError, OSError, ValueError):
                continue
            ban = {"ip": ip, "at": at}
            if isinstance(jail, str) and jail:
                ban["jail"] = jail
            bans.append(ban)
        fill: dict = {"bans": bans}
        if len(rows) >= security.MAX_BANS and bans:
            # The list was cut at its limit: it reaches back only to its oldest ban.
            fill["complete_s"] = max(0, int((now - bans[0]["at"]).total_seconds()))
        return fill

    def _rows(self, start: int) -> list[tuple]:
        self._check_path()
        try:
            db = sqlite3.connect(_uri(self.path), uri=True, timeout=BUSY_TIMEOUT_S)
        except sqlite3.Error as exc:
            raise SourceError(self._why(exc)) from None
        try:
            with contextlib.closing(db):
                return db.execute(QUERY, (start, security.MAX_BANS)).fetchall()
        except sqlite3.Error as exc:
            raise SourceError(self._why(exc)) from None

    def _check_path(self) -> None:
        """SourceError when the path names nothing, or a folder, or cannot be passed through."""
        try:
            info = os.stat(self.path)
        except (FileNotFoundError, NotADirectoryError):
            raise SourceError("no fail2ban database at sources.security.database") from None
        except PermissionError:
            raise SourceError(CANNOT_OPEN) from None
        except OSError as exc:
            why = exc.strerror or type(exc).__name__
            raise SourceError(f"cannot open the fail2ban database ({why})") from None
        if stat.S_ISDIR(info.st_mode):
            raise SourceError("sources.security.database is a folder, not the database")

    def _why(self, exc: sqlite3.Error) -> str:
        """A short message for what SQLite said, never holding more than the setting's name."""
        name = getattr(exc, "sqlite_errorname", "") or ""
        said = str(exc).lower()
        if "unable to open" in said or name.startswith("SQLITE_CANTOPEN"):
            # The path names a file (_check_path): it is the file that cannot be read.
            return CANNOT_OPEN
        if "locked" in said or "busy" in said or name.startswith("SQLITE_BUSY"):
            return "fail2ban database busy"
        if "no such table" in said or "no such column" in said:
            return "not a fail2ban database"
        if "not a database" in said or "malformed" in said or name.startswith("SQLITE_CORRUPT"):
            return "fail2ban database damaged"
        if name.startswith("SQLITE_READONLY") or "readonly" in said:
            # A hot journal left by a write that did not finish: fail2ban rolls it back itself.
            return "fail2ban database left mid-write; fail2ban recovers it"
        return f"fail2ban database error ({name or type(exc).__name__})"
