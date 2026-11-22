"""Generic checks: one value read from a JSON reply and tested, the kind behind [[sources.json]].

Each entry of [[sources.json]] is the source json:<name>. It is compiled into an in-memory provider
file of this kind (compile_entry): one GET to the entry's url, given whole, with its one header if
it has one, the header's value read from .env as the credential `header`, and a fill of `value`
from the entry's path. The engine runs it as it runs every provider file, with the same limits, the
same error text and the same back-off, so a check can ask for exactly what a provider file can.

The kind has no facts and no events. Its reading says whether the entry's test holds on the value
found, and the condition check:<name> (collector/conditions.py) is raised from it, in the scene of
the condition the entry borrows (`as`). A path that finds nothing, or null, fails the read for
every test but `missing`, and so does an object or a list where a value is needed, so that a wrong
path shows on the status page rather than reading as all well.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import urllib.parse
from typing import Any

from collector import text
from collector.kinds import Kind
from collector.net import SourceError
from collector.sources import Reading

TESTS = ("equals", "above", "below", "contains", "missing")
# The help a check's header credential has, as a provider file's [credentials] gives it.
HEADER_HELP = "The value of the check's header, read from .env and never written anywhere."
# A string that holds a decimal number, which above and below compare as a number.
_DECIMAL = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$")
# Where a detail's {value} goes.
VALUE = "{value}"


class CheckKind(Kind):
    name = "check"
    section = None
    FILL = {  # noqa: RUF012 - read only
        # The first value the entry's path finds; absent when it finds nothing, or null.
        "value": {"type": "raw"},
    }

    def provider_spec(self, name: str, settings: dict, registry) -> tuple[Any, dict]:
        """The entry compiled into a provider file, and the settings the engine reads it with:
        the url cut to its scheme, host and port, to which the file's path is appended."""
        return compile_entry(settings)

    def reading(self, fill, settings, config, now):
        path = settings["path"]
        found = "value" in fill
        value = fill.get("value")
        test = settings["test"]
        if test == "missing":
            return Reading(None, {"holds": not found, "value": None})
        if not found:
            raise SourceError(f"nothing at {path}")
        if isinstance(value, dict) or (isinstance(value, list) and test != "contains"):
            what = "an object" if isinstance(value, dict) else "a list"
            raise SourceError(f"{what} at {path}, where a value is needed")
        holds, shown = judge(test, settings["value"], value)
        return Reading(None, {"holds": holds, "value": shown})


KIND = CheckKind


def _number(value: Any) -> float | None:
    """A number found, or a string holding a decimal number, as a number; else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str) and _DECIMAL.match(value.strip()):
        return float(value.strip())
    return None


def same(found: Any, wanted: Any) -> bool:
    """equals: numbers by number, strings exactly, true and false as themselves."""
    if isinstance(wanted, bool) or isinstance(found, bool):
        return isinstance(wanted, bool) and isinstance(found, bool) and found is wanted
    if isinstance(wanted, (int, float)):
        return isinstance(found, (int, float)) and found == wanted
    return isinstance(found, str) and found == wanted


def judge(test: str, wanted: Any, found: Any) -> tuple[bool, Any]:
    """Whether a test holds on the value found, and the value a detail's {value} shows: what was
    found, or for a list that contains the value, the element it holds."""
    if test == "equals":
        return same(found, wanted), found
    if test in ("above", "below"):
        number = _number(found)
        if number is None:
            return False, found
        return (number > wanted if test == "above" else number < wanted), found
    if test == "contains":
        if isinstance(found, list):
            return any(same(item, wanted) for item in found), wanted
        if isinstance(found, str) and isinstance(wanted, str):
            return wanted in found, found
        return False, found
    raise ValueError(test)


def shown(value: Any) -> str:
    """A value as a detail's {value} writes it: a number as Python writes it, true and false as
    themselves, text cleaned of control characters; cut to the detail's limit."""
    if isinstance(value, bool):
        said = "true" if value else "false"
    elif isinstance(value, str):
        said = text.clean(value)
    else:
        said = str(value)
    return text.clip(said, text.DETAIL_MAX)


def words(settings: dict, value: Any) -> tuple[str, str]:
    """The headline and the detail of a check that holds, the detail's {value} filled."""
    detail = settings.get("detail") or ""
    if VALUE in detail:
        detail = detail.replace(VALUE, shown(value) if value is not None else "")
    return settings["headline"], detail


# Compiling an entry ---------------------------------------------------------------------------


def _literal(value: str) -> str:
    """Text a provider file's template takes as it is: its braces doubled."""
    return value.replace("{", "{{").replace("}", "}}")


def split_url(url: str) -> tuple[str, str, list[tuple[str, str]]]:
    """An entry's url as the engine asks for it: its scheme, host and port; its path, / when it
    has none; and its query, by name and value."""
    parts = urllib.parse.urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    return base, parts.path or "/", query


def compile_entry(settings: dict) -> tuple[Any, dict]:
    """An entry of [[sources.json]], checked by collector/config.py, as a provider file of the
    check kind (FormatError when it is not one), and the settings its provider is made with."""
    from collector.providers import format as fmt

    base, path, query = split_url(settings["url"])
    headers: dict[str, str] = {}
    header = settings.get("header") or ""
    if header.lower() != "accept":
        headers["Accept"] = "application/json"
    credentials = {}
    if header:
        headers[header] = "{credential.header}"
        credentials["header"] = HEADER_HELP
    request = {
        "path": _literal(path),
        "query": {k: _literal(v) for k, v in query},
        "headers": headers,
    }
    where = f"json:{settings['name']}"
    c = fmt._Checker(where)
    spaces = {"credential": set(credentials), "setting": set()}
    requests = fmt._requests(c, [request], spaces, None)
    fill = fmt._fill(c, {"value": {"path": settings["path"], "type": "raw"}}, CheckKind.FILL, [""])
    if c.problems:
        raise fmt.FormatError(c.problems)
    shape = {k: settings.get(k) for k in ("url", "path", "header")}
    digest = hashlib.sha256(json.dumps(shape, sort_keys=True).encode()).hexdigest()[:20]
    spec = fmt.Spec(
        "check",
        "check",
        f"the check {settings['name']}",
        "",
        credentials,
        {},
        None,
        tuple(requests),
        fill,
        digest,
    )
    return spec, {**settings, "url": base}
