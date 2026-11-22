"""The settings schema: collector/settings-schema.json, read once at import.

The file describes every setting of config.toml and every variable of .env, and is the one place
their types, allowed values, ranges and defaults are written down. collector/config.py builds its
defaults and its plain checks from it; docs/configuration.md describes the fields.
"""

from __future__ import annotations

import json
import os
from typing import Any

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings-schema.json")

with open(PATH, encoding="utf-8") as _fh:
    SCHEMA: dict[str, Any] = json.load(_fh)

TABLES: dict[str, dict[str, Any]] = {t["table"]: t for t in SCHEMA["tables"]}

# What a setting with no default holds once merged, so that its type is known.
_EMPTY = {"string": "", "integer": 0, "number": 0.0, "boolean": False}


def settings(table: str) -> list[dict[str, Any]]:
    """The settings of one table, in the schema's order."""
    return TABLES[table]["settings"]


def setting(table: str, key: str) -> dict[str, Any]:
    for s in settings(table):
        if s["key"] == key:
            return s
    raise KeyError(f"{table}.{key}")


def default_of(s: dict[str, Any]) -> Any:
    """A setting's default as the collector holds it: a number as a float, and a setting with no
    default as the empty value of its type."""
    value = s.get("default")
    if value is None:
        return [] if s["type"] == "list" else _EMPTY.get(s["type"])
    if s["type"] == "number":
        return float(value)
    return list(value) if isinstance(value, list) else value


def defaults(table: str) -> dict[str, Any]:
    """Every setting of a table with its default, in the schema's order."""
    return {s["key"]: default_of(s) for s in settings(table)}


def condition_ids() -> list[str]:
    return [c["id"] for c in SCHEMA["conditions"]]


def scene_ids(quiet_only: bool = False) -> list[str]:
    return [s["id"] for s in SCHEMA["scenes"] if s["quiet"] or not quiet_only]


def source_names() -> list[str]:
    return [
        t["table"].split(".", 1)[1] for t in SCHEMA["tables"] if t["table"].startswith("sources.")
    ]


def credentials() -> list[dict[str, Any]]:
    """The .env variables that hold credentials, in the schema's order."""
    return [e for e in SCHEMA["env"] if e["scope"] == "credential"]


def env_name(secret: str, field: str) -> str:
    """The variable a credential is read from: KW_<SECRET>_<FIELD>, in capitals."""
    return f"KW_{secret.upper()}_{field.upper()}"


def range_problem(s: dict[str, Any], value: float) -> str | None:
    """What is wrong with a number against a setting's range, in the words the collector has
    always used, or None. A setting may give its own words in "problem"."""
    low, above, high = s.get("min"), s.get("above"), s.get("max")
    if (
        (low is None or value >= low)
        and (above is None or value > above)
        and (high is None or value <= high)
    ):
        return None
    if "problem" in s:
        return s["problem"]
    if above is not None and high is not None:
        return f"must be above {above} and at most {high}"
    if above is not None:
        return "must be above zero" if above == 0 else f"must be above {above}"
    if low is not None and high is not None:
        return f"must be from {low} to {high}"
    if low == 0:
        return "must be zero or above zero"
    return f"must be at least {low}"
