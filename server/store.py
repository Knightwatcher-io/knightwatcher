"""The shared settings: what the settings screen saves for the whole deployment.

One file, settings.json, in the server's data folder, holding the four sections the displays
choose, {"v": 1, "look": {}, "display": {}, "quiet": {}, "scenes": {}}, with only the keys that
have been saved. Every value is checked by the collector's own checks for the [look], [display],
[quiet] and [scenes] tables of config.toml, so a value config.toml would refuse is refused here,
in the same words. A write replaces whole sections and goes to a temporary file first, then is
renamed into place. docs/server.md describes the store and the API.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import threading
from typing import Any

from collector import config
from collector.store import atomic_write

FILE = "settings.json"
VERSION = 1
# The sections, in the order the file and the API give them: those of config.toml's defaults.
SECTIONS: tuple[str, ...] = config.DEFAULT_TABLES

log = logging.getLogger("server")


class Refused(Exception):
    """A write the store will not take, with every problem found, one a line."""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


def _say_or(words: tuple[str, ...]) -> str:
    return f"{', '.join(words[:-1])} or {words[-1]}"


def check(body: Any) -> dict[str, dict[str, Any]]:
    """The sections a write names, each checked as config.toml's table of that name is.

    body is the parsed JSON of a PUT: an object naming one or more sections, and optionally
    "v": 1. A section given as {} clears it. Raises Refused with every problem, in the words a bad
    config.toml gets from check-config, so that the two read alike.
    """
    if not isinstance(body, dict):
        raise Refused(["the body must be a JSON object"])
    problems: list[str] = []
    for key in body:
        if key == "v":
            if type(body["v"]) is not int or body["v"] != VERSION:
                problems.append(f"v: must be {VERSION}")
        elif key not in SECTIONS:
            problems.append(f"{key}: unknown table")
    given = {k: v for k, v in body.items() if k in SECTIONS}
    if not given and not problems:
        problems.append(f"name one or more of {_say_or(SECTIONS)}")
    problems += config.check_defaults(given)
    if problems:
        raise Refused(problems)
    return copy.deepcopy(given)


def _empty() -> dict[str, dict[str, Any]]:
    return {s: {} for s in SECTIONS}


class Store:
    """The shared settings in a folder: read once at start, kept in memory, written on each change.

    get() and put() may be called from several threads at once.
    """

    def __init__(self, folder: str):
        self.folder = folder
        self.path = os.path.join(folder, FILE)
        self._lock = threading.Lock()
        self._data = self._load()
        self._body, self._etag = self._render()

    def _load(self) -> dict[str, dict[str, Any]]:
        """The settings in the file, each key checked; a key the checks refuse is left out with a
        line in the log, and a file that cannot be read at all counts as none saved. The file is
        left as it is until the next write."""
        out = _empty()
        try:
            with open(self.path, encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            return out
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            log.warning(
                "settings: %s cannot be read (%s); starting with none saved", self.path, exc
            )
            return out
        if not isinstance(raw, dict) or raw.get("v") != VERSION:
            log.warning(
                "settings: %s is not version %d; starting with none saved", self.path, VERSION
            )
            return out
        for section in SECTIONS:
            given = raw.get(section, {})
            if not isinstance(given, dict):
                log.warning("settings: %s: %s is not an object, so it is left out", FILE, section)
                continue
            for key, value in given.items():
                problems = config.check_defaults({section: {key: value}})
                if problems:
                    log.warning("settings: %s: %s, so it is left out", FILE, problems[0])
                else:
                    out[section][key] = value
        return out

    def _render(self) -> tuple[bytes, str]:
        body = json.dumps({"v": VERSION, **self._data}, separators=(",", ":"), ensure_ascii=False)
        data = body.encode("utf-8")
        return data, '"' + hashlib.sha256(data).hexdigest()[:20] + '"'

    def get(self) -> tuple[bytes, str]:
        """The settings as the API gives them, as JSON bytes, and their entity tag."""
        with self._lock:
            return self._body, self._etag

    def put(self, body: Any) -> tuple[bytes, str]:
        """Checks a write (see check), replaces the sections it names, saves the file and returns
        what get() then gives. Raises Refused, and changes nothing, when the write is refused."""
        sections = check(body)
        with self._lock:
            data = {**copy.deepcopy(self._data), **sections}
            text = json.dumps({"v": VERSION, **data}, indent=2, ensure_ascii=False) + "\n"
            # Group-readable, so that an ACL on the folder can let the operator read the file.
            atomic_write(self.path, text.encode("utf-8"), mode=0o640)
            self._data = data
            self._body, self._etag = self._render()
            return self._body, self._etag
