"""Providers: each fills one kind's shape from one service.

Most providers are a provider file, TOML that the engine runs (collector/providers/engine.py):
the requests, the login, and paths into the reply mapped onto the kind's fields. The built-in
files are collector/providers/builtin/<id>.toml, read and checked the first time the registry is
asked for one; a built-in file that fails its check is a bug, and raises at once. A service that a
file cannot describe gets a code adapter, a subclass of Provider returning the same shape.

docs/providers.md describes the format.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import os
import threading
import tomllib
from typing import Any

BUILTIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "builtin")


class Provider:
    """Fills one kind's shape from one service. Runs in the source's worker thread."""

    id: str = ""
    kind: str = ""

    def read(self, now: dt.datetime) -> dict:
        """Return a fill. Raise SourceError, or AuthError for refused credentials. Never read a
        field outside the allowed set the provider was made with."""
        raise NotImplementedError

    def close(self) -> None:
        """End anything held open. Best effort; never raises."""


_lock = threading.Lock()
_builtin: dict[str, Any] | None = None


def load(path: str, expect_id: str | None = None):
    """One provider file, read, checked and compiled; FormatError with every problem."""
    from collector.providers import format as fmt

    where = os.path.basename(path)
    with open(path, "rb") as fh:
        data = fh.read(fmt.MAX_FILE + 1)
    if len(data) > fmt.MAX_FILE:
        raise fmt.FormatError([f"{where}: larger than {fmt.MAX_FILE // 1024} KiB"])
    try:
        parsed = tomllib.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        raise fmt.FormatError([f"{where}: {exc}"]) from None
    spec = fmt.check(parsed, where, expect_id)
    digest = hashlib.sha256(data).hexdigest()[:20]
    return dataclasses.replace(spec, digest=digest)


def builtin() -> dict[str, Any]:
    """Every built-in provider, by id, in the order of their ids."""
    global _builtin
    with _lock:
        if _builtin is None:
            found = {}
            for name in sorted(os.listdir(BUILTIN)):
                if name.endswith(".toml"):
                    pid = name[: -len(".toml")]
                    found[pid] = load(os.path.join(BUILTIN, name), pid)
            _builtin = found
        return _builtin


def get(pid: str):
    """A provider's compiled file by its id, or None."""
    return builtin().get(pid)


def of_kind(kind: str) -> list:
    """The providers that fill a kind, in the order of their ids."""
    return [spec for spec in builtin().values() if spec.kind == kind]


def make(spec, settings: dict, credentials: dict, timeout: float, allowed: frozenset) -> Provider:
    """The provider instance that reads one source."""
    from collector.providers.engine import DataProvider

    return DataProvider(spec, settings, credentials, timeout, allowed)
