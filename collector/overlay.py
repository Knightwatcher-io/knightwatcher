"""The admin page's settings: admin.json, laid over config.toml.

The bundled server keeps what is set on its admin page in one file in its own folder, admin.json:

    {"v": 1, "set": {"collector.interval_s": 15, "sources.sonarr.enabled": true, "device": [...]}}

Each key of `set` is the dotted path of one setting of config.toml (its table and its key), and
each value replaces what config.toml holds there, or the default where the file leaves it out. A
list is one value: set here, it replaces the file's list whole. `device` is the whole list of
[[device]] tables in the same way. Only the collector's settings are kept here, and only those the
schema marks editable; the look, display, quiet scenes and scenes are the shared settings of
settings.json (server/store.py), and credentials are never in either.

The server writes the file after the collector's own checks pass on the result; the collector
reads it at start and again whenever it changes, and lays it over config.toml with lay(). Both
use parse() to read it, so the two always agree on what it holds. docs/configuration.md describes
the levels, and docs/server.md the admin page.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
from typing import Any

from collector import schema

FILE = "admin.json"
VERSION = 1
# Where compose.yaml mounts the server's folder in both containers.
DEFAULT_PATH = "/var/lib/knightwatcher-server/admin.json"
# The key of the devices' list, the [[device]] tables of config.toml.
DEVICES = "device"
# The tables whose settings the admin page may set, by the first part of their names.
_TABLES = ("collector", "conditions", "sources")


def _paths() -> dict[str, dict[str, Any]]:
    """Every path the admin page may set, with its setting's description in the schema."""
    out: dict[str, dict[str, Any]] = {}
    for t in schema.SCHEMA["tables"]:
        if t["table"].split(".")[0] not in _TABLES:
            continue
        for s in t["settings"]:
            if s["editable"]:
                out[f"{t['table']}.{s['key']}"] = s
    return out


PATHS = _paths()
# Settings of the schema that the admin page shows but never sets.
FIXED = {
    f"{t['table']}.{s['key']}"
    for t in schema.SCHEMA["tables"]
    for s in t["settings"]
    if t["table"].split(".")[0] in _TABLES and not s["editable"]
}


def version_of(data: bytes) -> str:
    """The version of a store: the first 20 hex characters of a sha256 over the file's bytes."""
    return hashlib.sha256(data).hexdigest()[:20]


def _type_ok(spec: dict[str, Any], value: Any) -> bool:
    kind = spec["type"]
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    return isinstance(value, list)


def path_problem(path: Any, value: Any) -> str | None:
    """What makes a path and its value one the store cannot hold at all, or None.

    Only the shape is judged here: a path the admin page may set, and a value of its setting's
    type. Everything else (ranges, addresses, the devices' rules) is the collector's to
    judge on the whole configuration.
    """
    if not isinstance(path, str):
        return "a path is text"
    if path == DEVICES:
        if not isinstance(value, list) or not all(isinstance(t, dict) for t in value):
            return f"{DEVICES}: expected [[device]] tables"
        return None
    if path in FIXED:
        return f"{path}: not set on the admin page"
    spec = PATHS.get(path)
    if spec is None:
        return f"{path}: unknown setting"
    if not _type_ok(spec, value):
        return f"{path}: expected {_TYPE_WORDS[spec['type']]}"
    return None


_TYPE_WORDS = {
    "boolean": "true or false",
    "integer": "a whole number",
    "number": "a number",
    "string": "text",
    "list": "a list",
}


def clean(given: Any) -> tuple[dict[str, Any], list[str]]:
    """The paths of a store's `set` it can hold, and a problem for each left out."""
    if not isinstance(given, dict):
        return {}, ["set: expected an object"]
    kept: dict[str, Any] = {}
    problems: list[str] = []
    for path, value in given.items():
        why = path_problem(path, value)
        if why:
            problems.append(why)
        else:
            kept[path] = copy.deepcopy(value)
    return kept, problems


def parse(data: bytes) -> tuple[dict[str, Any], list[str]]:
    """What a store's bytes set, and a problem for each part that cannot be used.

    A file that is not JSON, or not version 1, sets nothing. A path the store cannot hold is left
    out with a problem, and the rest is kept, so that a file from a newer or older version keeps
    what it can.
    """
    try:
        raw = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return {}, [f"{FILE}: not JSON, so nothing set on the admin page is used"]
    if not isinstance(raw, dict) or raw.get("v") != VERSION:
        return {}, [f"{FILE}: not version {VERSION}, so nothing set on the admin page is used"]
    return clean(raw.get("set", {}))


def read(path: str) -> tuple[dict[str, Any], str | None, list[str]]:
    """(what the store at path sets, its version, its problems). A missing store sets nothing
    and has no version."""
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except FileNotFoundError:
        return {}, None, []
    except OSError as exc:
        return {}, None, [f"{FILE}: cannot read ({exc.strerror})"]
    given, problems = parse(data)
    return given, version_of(data), problems


def signature(path: str) -> tuple | None:
    """What changes when a file is written again: its inode, size and modification time."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    return (st.st_ino, st.st_size, st.st_mtime_ns)


def lay(raw: dict[str, Any], given: dict[str, Any]) -> dict[str, Any]:
    """A parsed config.toml with what the store sets laid over it, by path, each list whole.

    A path into a table the file leaves out creates that table, so a source set up only on the
    admin page has a table of its own. raw is not changed.
    """
    out = copy.deepcopy(raw)
    for path, value in given.items():
        if path == DEVICES:
            out[DEVICES] = copy.deepcopy(value)
            continue
        *tables, key = path.split(".")
        here = out
        for name in tables:
            if not isinstance(here.get(name), dict):
                here[name] = {}
            here = here[name]
        here[key] = copy.deepcopy(value)
    return out


def value_at(raw: dict[str, Any], path: str) -> tuple[bool, Any]:
    """(whether the parsed file holds the path, its value there)."""
    if path == DEVICES:
        return (DEVICES in raw, raw.get(DEVICES))
    here: Any = raw
    for name in path.split("."):
        if not isinstance(here, dict) or name not in here:
            return False, None
        here = here[name]
    return True, here
