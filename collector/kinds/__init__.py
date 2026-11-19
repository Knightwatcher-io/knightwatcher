"""Kinds: the fixed shape of one sort of reading, filled by a provider from one service.

A kind owns everything after the service has answered: cleaning and cutting the words, the
markers kept in the memory file, the events and the facts written to state.json. It declares its
fill, the shape a provider returns, in FILL; check_fill holds every fill to that declaration
before the kind sees it, so a kind never has to defend against a provider's mistakes.

A declaration maps each field to a dictionary:

  type      int, number, string, bool, time, raw, object (with `fields`), or list (with `items`
            for a list of objects, or `of` for a list of numbers or strings)
  required  the field must be in the fill; for a field of a list's items, an item without it is
            left out by the engine
  strict    for int: a JSON integer, never true or false
  min, max  for int and number: the range; for a list: the most items
  show      the least `show` setting that lets the field be read (streams)

SECTIONS names the sections of config.toml that a kind reads, and docs/providers.md describes the
provider files that fill them.
"""

from __future__ import annotations

import datetime as dt
import importlib
from typing import Any

from collector.net import SourceError

# The sections of config.toml read through a kind, with the kind each reads. A section with a
# `from` setting reads the provider it names; any other reads the provider of its own name.
SECTIONS = {"streams": "streams", "adblock": "adblock", "sonarr": "imports", "radarr": "imports"}

# Every kind, by name, with its module in this package.
KINDS = ("streams", "adblock", "imports")


def provider_of(section: str, settings: dict[str, Any]) -> str:
    """The id of the provider a section reads: its `from`, or its own name."""
    chosen = settings.get("from")
    return chosen if isinstance(chosen, str) and chosen else section


class Kind:
    """One sort of reading. A kind instance belongs to one source and may keep state for it."""

    #: The kind's name, as provider files give it.
    name: str = ""
    #: Its key in `facts`, or None.
    section: str | None = None
    #: The fill's declaration.
    FILL: dict[str, dict[str, Any]] = {}  # noqa: RUF012 - each kind's own, read only

    def allowed(self, settings: dict[str, Any]) -> frozenset[str]:
        """The fill's fields that may be read, by dotted name; every declared field by default."""
        return frozenset(_names(self.FILL))

    def reading(self, fill: dict, settings: dict, config, now: dt.datetime):
        raise NotImplementedError

    def observe(self, reading, memory: dict, settings: dict, config, now: dt.datetime) -> list:
        return []


def kind_class(name: str) -> type[Kind]:
    """The class of a kind, by name."""
    if name not in KINDS:
        raise KeyError(name)
    module = importlib.import_module(f"collector.kinds.{name}")
    return module.KIND


def _names(fields: dict, prefix: str = "") -> list[str]:
    out = []
    for key, spec in fields.items():
        out.append(prefix + key)
        inner = spec.get("fields") or spec.get("items")
        if inner:
            out += _names(inner, f"{prefix}{key}.")
    return out


# Checking a fill ------------------------------------------------------------------------------

_WORDS = {
    bool: "true or false",
    int: "a whole number",
    float: "a number",
    str: "text",
    list: "a list",
    dict: "an object",
    type(None): "null",
}


def _what(value: Any) -> str:
    if isinstance(value, dt.datetime):
        return "a time"
    return _WORDS.get(type(value), type(value).__name__)


def _type_ok(spec: dict, value: Any) -> bool:
    kind = spec["type"]
    if kind == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "time":
        return isinstance(value, dt.datetime) and value.tzinfo is not None
    if kind == "object":
        return isinstance(value, dict)
    if kind == "list":
        return isinstance(value, list)
    return True  # raw


def check_fill(declaration: dict, fill: Any, allowed: frozenset[str]) -> dict:
    """The fill, held to its kind's declaration; SourceError naming the field when it breaks it.

    A field outside allowed fails the read rather than being dropped, so that a provider that reads
    what it should not is caught by its tests.
    """
    if not isinstance(fill, dict):
        raise SourceError(f"provider gave its fill as {_what(fill)}")
    _check_fields(declaration, fill, allowed, "")
    return fill


def _check_fields(declaration: dict, given: dict, allowed: frozenset[str], prefix: str) -> None:
    for key in given:
        if key not in declaration:
            raise SourceError(f"provider gave {prefix}{key}, which its kind does not have")
        if _dotted(prefix, key) not in allowed:
            raise SourceError(f"provider gave {prefix}{key}, which show does not let it read")
    for key, spec in declaration.items():
        where = f"{prefix}{key}"
        if key not in given:
            if spec.get("required"):
                raise SourceError(f"provider gave no {where}")
            continue
        value = given[key]
        if not _type_ok(spec, value):
            raise SourceError(f"provider gave {where} as {_what(value)}")
        if spec["type"] in ("int", "number"):
            if "min" in spec and value < spec["min"]:
                raise SourceError(f"provider gave {where} below {spec['min']}")
            if "max" in spec and value > spec["max"]:
                raise SourceError(f"provider gave {where} above {spec['max']}")
        elif spec["type"] == "object":
            _check_fields(spec["fields"], value, allowed, f"{where}.")
        elif spec["type"] == "list":
            if "max" in spec and len(value) > spec["max"]:
                raise SourceError(f"provider gave more than {spec['max']} {where}")
            for i, item in enumerate(value):
                at = f"{where}[{i}]"
                if "of" in spec:
                    if not _type_ok({"type": spec["of"]}, item):
                        raise SourceError(f"provider gave {at} as {_what(item)}")
                elif not isinstance(item, dict):
                    raise SourceError(f"provider gave {at} as {_what(item)}")
                else:
                    _check_fields(spec["items"], item, allowed, f"{at}.")


def _dotted(prefix: str, key: str) -> str:
    """sessions[3].who as the declaration names it: sessions.who."""
    parts = [p.split("[", 1)[0] for p in prefix.rstrip(".").split(".") if p]
    return ".".join([*parts, key])
