"""Providers: each fills one kind's shape from one service.

Most providers are a provider file, TOML that the engine runs (collector/providers/engine.py):
the requests, the login, and paths into the reply mapped onto the kind's fields. The built-in
files are collector/providers/builtin/<id>.toml, read and checked the first time the registry is
asked for one; a built-in file that fails its check is a bug, and raises at once. A service that a
file cannot describe gets a code adapter, a subclass of Provider returning the same shape, made
known with the adapter() decorator (collector/providers/fail2ban.py). The registry lists each
adapter beside the files, by an Adapter in place of a compiled file.

A user's own files are in the providers folder beside config.toml (the collector's providers_dir
setting), one provider each, named <id>.toml. scan() reads and checks them into a Providers: the
built-ins and the files that pass, and the files left out with their problems. A file that fails is
left out and never stops anything; a section whose `from` names it runs and fails at every read.
The folder is read again whenever its signature() changes (collector/reload.py).

docs/providers.md describes the format and the folder.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import errno
import hashlib
import os
import re
import stat
import threading
import tomllib
from typing import Any

BUILTIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "builtin")

# The most provider files of a user's own that are read; those after it, in the order of their
# names, are left out.
MAX_OWN = 32
# How the problems of a user's file name it, whatever the folder is called on the host.
OWN_WHERE = "providers/"
# A provider's id: also the name of its file without .toml.
_ID = re.compile(r"^[a-z][a-z0-9_]{0,23}$")


class Provider:
    """Fills one kind's shape from one service. Runs in the source's worker thread.

    A code adapter is made with the section's settings (the kind's own and those the adapter
    declares), its credentials, the time limit of one request, the fields it may read, and a
    function that gives the configuration in use, for a provider that needs more of it.
    """

    id: str = ""
    kind: str = ""

    def read(self, now: dt.datetime) -> dict:
        """Return a fill. Raise SourceError, or AuthError for refused credentials. Never read a
        field outside the allowed set the provider was made with."""
        raise NotImplementedError

    def close(self) -> None:
        """End anything held open. Best effort; never raises."""


@dataclasses.dataclass(frozen=True)
class Adapter:
    """A built-in provider written in code, as the registry lists it beside the provider files.

    It has what a compiled file has that the configuration and the settings schema read: the id,
    the kind, the name, the docs, the credential fields and the declared settings. address says
    whether it reads the section's url; make is the Provider class, or None for a reader that is
    not a provider at all (the fail2ban summary, read by collector/sources/security.py).
    """

    id: str
    kind: str
    name: str
    docs: str
    credentials: dict = dataclasses.field(default_factory=dict)
    settings: dict = dataclasses.field(default_factory=dict)
    address: bool = False
    make: Any = None
    digest: str = "code"


_ADAPTERS: dict[str, Adapter] = {}
# The modules that hold code adapters, imported the first time the registry is asked for one.
_ADAPTER_MODULES = ("collector.providers.fail2ban",)


def adapter(pid: str, kind: str, name: str, docs: str, settings: dict | None = None):
    """Make a Provider class known as the built-in provider pid of kind."""

    def register(cls):
        _register(Adapter(pid, kind, name, docs, settings=dict(settings or {}), make=cls))
        cls.id, cls.kind = pid, kind
        return cls

    return register


def _register(entry: Adapter) -> None:
    if entry.id in _ADAPTERS:
        raise ValueError(f"two built-in providers with the id {entry.id}")
    _ADAPTERS[entry.id] = entry


# The fail2ban summary that [sources.security] reads while `from` is left out. It is not a
# provider: collector/sources/security.py reads it as it always has, and build_sources picks that
# reader when a section names it. It is listed so that `from` can name it.
_register(
    Adapter(
        "summary",
        "security",
        "fail2ban summary",
        "https://github.com/fail2ban/fail2ban",
        address=True,
    )
)


def takes_address(spec) -> bool:
    """Whether a provider reads the section's url: every provider file does, an adapter may not."""
    return getattr(spec, "address", True)


_lock = threading.Lock()
_builtin: dict[str, Any] | None = None


def load(path: str, expect_id: str | None = None):
    """One provider file, read, checked and compiled; FormatError with every problem."""
    from collector.providers import format as fmt

    with open(path, "rb") as fh:
        data = fh.read(fmt.MAX_FILE + 1)
    return _compile(data, os.path.basename(path), expect_id)


def _compile(data: bytes, where: str, expect_id: str | None):
    """A provider file's bytes, checked and compiled; FormatError with every problem."""
    from collector.providers import format as fmt

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
    """Every built-in provider, by id, in the order of their ids: the files, and the adapters."""
    global _builtin
    with _lock:
        if _builtin is None:
            import importlib

            for module in _ADAPTER_MODULES:
                importlib.import_module(module)
            found: dict[str, Any] = dict(_ADAPTERS)
            for name in sorted(os.listdir(BUILTIN)):
                if name.endswith(".toml"):
                    pid = name[: -len(".toml")]
                    if pid in found:
                        raise ValueError(f"two built-in providers with the id {pid}")
                    found[pid] = load(os.path.join(BUILTIN, name), pid)
            _builtin = dict(sorted(found.items()))
        return _builtin


def get(pid: str):
    """A built-in provider's compiled file by its id, or None."""
    return builtin().get(pid)


def of_kind(kind: str) -> list:
    """The built-in providers that fill a kind, in the order of their ids."""
    return [spec for spec in builtin().values() if spec.kind == kind]


# A user's own files ---------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class Providers:
    """The providers a configuration can name: the built-ins, and the files of the providers folder
    that pass. refused holds each file left out, by the id its name gives, with its problems;
    problems holds every problem the folder gave, in the order of the files' names."""

    folder: str | None = None
    own: dict = dataclasses.field(default_factory=dict)
    refused: dict = dataclasses.field(default_factory=dict)
    problems: tuple = ()

    def get(self, pid: str):
        """A provider's compiled file by its id, a built-in's first, or None."""
        return builtin().get(pid) or self.own.get(pid)

    def of_kind(self, kind: str) -> list:
        """The providers that fill a kind: the built-ins, then the user's, each in id order."""
        return [s for s in [*builtin().values(), *self.own.values()] if s.kind == kind]

    def is_refused(self, pid: str) -> bool:
        """Whether pid names a file of the folder that was left out, and no built-in."""
        return pid not in builtin() and pid in self.refused


def builtin_only() -> Providers:
    """The built-in providers alone, as when there is no providers folder."""
    return Providers()


def _entries(folder: str) -> list[os.DirEntry]:
    """The folder's provider files by name order: names ending .toml, not starting with a dot.
    OSError when the folder cannot be read."""
    with os.scandir(folder) as it:
        found = [e for e in it if e.name.endswith(".toml") and not e.name.startswith(".")]
    return sorted(found, key=lambda e: e.name)


def _read_own(path: str) -> bytes:
    """A user's file: a regular file, not through a link, at most the format's limit and a byte.
    OSError, or ValueError naming what it is instead."""
    from collector.providers import format as fmt

    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("not a regular file")
        with os.fdopen(fd, "rb", closefd=False) as fh:
            return fh.read(fmt.MAX_FILE + 1)
    finally:
        os.close(fd)


def scan(folder: str | None) -> Providers:
    """The providers folder, read and checked. A folder that does not exist holds nothing, and
    is no problem; one that cannot be read is one problem. Never raises for what a file holds."""
    from collector.providers import format as fmt

    if not folder:
        return Providers()
    try:
        entries = _entries(folder)
    except FileNotFoundError:
        return Providers(folder)
    except NotADirectoryError:
        return Providers(folder, problems=(f"{OWN_WHERE}: {folder} is not a folder",))
    except OSError as exc:
        why = exc.strerror or type(exc).__name__
        return Providers(folder, problems=(f"{OWN_WHERE}: cannot read {folder} ({why})",))
    own: dict[str, Any] = {}
    refused: dict[str, list[str]] = {}
    for i, entry in enumerate(entries):
        name = entry.name
        pid = name[: -len(".toml")]
        where = OWN_WHERE + name
        if i >= MAX_OWN:
            refused[pid] = [f"{where}: more than {MAX_OWN} provider files; this one is left out"]
            continue
        if not _ID.match(pid):
            refused[pid] = [
                f"{where}: the name must be the provider's id and .toml, the id 1 to 24 of a-z, "
                "0-9 and _, starting with a letter"
            ]
            continue
        if pid in builtin():
            refused[pid] = [
                f'{where}: id: "{pid}" is a built-in provider\'s; give yours another id and name '
                "the file after it"
            ]
            continue
        try:
            data = _read_own(os.path.join(folder, name))
            own[pid] = _compile(data, where, pid)
        except ValueError as exc:
            refused[pid] = [f"{where}: {exc}"]
        except OSError as exc:
            if exc.errno == errno.ELOOP:  # O_NOFOLLOW met a link
                refused[pid] = [f"{where}: a link; put the file itself in the folder"]
            else:
                refused[pid] = [f"{where}: cannot read ({exc.strerror or type(exc).__name__})"]
        except fmt.FormatError as exc:
            refused[pid] = list(exc.problems)
    problems = tuple(p for found in refused.values() for p in found)
    return Providers(folder, own, refused, problems)


def signature(folder: str | None) -> tuple | None:
    """What says the folder's files have changed: each provider file's name, inode, size and time.
    None when there is no folder."""
    if not folder:
        return None
    try:
        out = []
        for entry in _entries(folder):
            info = entry.stat(follow_symlinks=False)
            out.append((entry.name, info.st_ino, info.st_size, info.st_mtime_ns))
        return tuple(out)
    except FileNotFoundError:
        return None
    except OSError as exc:
        return ("error", exc.errno)


def make(
    spec, settings: dict, credentials: dict, timeout: float, allowed: frozenset, config=None
) -> Provider:
    """The provider instance that reads one source. config, for a code adapter, is a function
    that gives the configuration in use."""
    if isinstance(spec, Adapter):
        if spec.make is None:
            return _NotAProvider(spec)
        return spec.make(settings, credentials, timeout, allowed, config)
    from collector.providers.engine import DataProvider

    return DataProvider(spec, settings, credentials, timeout, allowed)


class _NotAProvider(Provider):
    """What --probe meets for a reader that is not a provider: a read that says so."""

    def __init__(self, spec: Adapter):
        self.id, self.kind = spec.id, spec.kind

    def read(self, now: dt.datetime) -> dict:
        from collector.net import SourceError

        raise SourceError(f"{self.id} is not read through a provider; --probe cannot read it")
