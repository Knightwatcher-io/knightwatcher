"""The engine: runs one provider file, its requests and its fill, in the source's worker thread.

One read makes each request in order through collector.net (direct, no proxy, no redirect, the
reply cut at net.MAX_BODY, http_timeout_s each), parses the JSON, applies the request's statuses,
not_json and require, and builds the fill from the replies, reading only the fields the kind's
`allowed` lets it read. A var of a list's item is read only when an allowed field needs it, so a
name the setting `show` holds back is never looked at.

A request goes to the source's `url` with the file's path appended, and to nowhere else; its query
and headers may carry the source's credentials and settings, and nothing in a request comes from
a reply. Failures raise SourceError, or AuthError for refused credentials, with a short message
that never holds an address.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import urllib.parse
from collections import Counter
from typing import Any

from collector import net, text
from collector.kinds import kind_class
from collector.net import AuthError, SourceError
from collector.providers import Provider
from collector.providers.format import (
    Group,
    Items,
    Ref,
    Request,
    Scalar,
    Spec,
    Template,
    Test,
    Values,
)
from collector.providers.path import TooMany, equal

# The deepest nesting a reply may have.
MAX_DEPTH = 64
# The longest text a template may give, before the kind cuts it to its own limits.
MAX_TEMPLATE = 1000

_STATUS = re.compile(r"^HTTP (\d{3})\b")
_HEADER_VALUE = re.compile(r"^[ -~]*$")
_ABSENT = object()


def _depth_ok(value: Any) -> bool:
    stack = [(value, 1)]
    while stack:
        node, depth = stack.pop()
        if isinstance(node, (dict, list)):
            if depth > MAX_DEPTH:
                return False
            children = node.values() if isinstance(node, dict) else node
            stack.extend((child, depth + 1) for child in children)
    return True


def convert(value: Any, kind: str, strict: bool = False) -> Any:
    """A value found, as the type asks for it, or _ABSENT when it cannot be.

    int takes a JSON integer, a number cut to its whole part, or text int() accepts; strict, a
    JSON integer alone, never true or false. time takes ISO 8601 (a time without a zone is UTC)
    or epoch seconds.
    """
    if value is None:
        return _ABSENT
    if kind == "raw":
        return value
    if kind == "int":
        if strict:
            return value if isinstance(value, int) and not isinstance(value, bool) else _ABSENT
        if not isinstance(value, (int, float, str)):
            return _ABSENT
        try:
            return int(value)
        except (TypeError, ValueError, OverflowError):
            return _ABSENT
    if kind == "number":
        number = isinstance(value, (int, float)) and not isinstance(value, bool)
        return value if number else _ABSENT
    if kind == "string":
        return value if isinstance(value, str) else _ABSENT
    if kind == "bool":
        return value if isinstance(value, bool) else _ABSENT
    if kind == "time":
        if isinstance(value, str):
            try:
                return text.parse_iso(value)
            except ValueError:
                return _ABSENT
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            try:
                return dt.datetime.fromtimestamp(value, dt.UTC)
            except (OverflowError, OSError, ValueError):
                return _ABSENT
        return _ABSENT
    raise ValueError(kind)


def present(value: Any) -> bool:
    """Found, not null, and, for text, not empty once cleaned as the words are."""
    if value is _ABSENT or value is None:
        return False
    if isinstance(value, str):
        return bool(text.clean(value))
    return True


def fill_template(template: Template, look) -> str | None:
    """The template's text with every reference filled by look(ref), or None when any of them has
    no value. A number fills {var} as str() writes it; {var:0N} needs a whole number."""
    out = []
    for part in template.parts:
        if isinstance(part, str):
            out.append(part)
            continue
        value = look(part)
        if not present(value) or isinstance(value, (dict, list)):
            return None
        if part.width:
            if not isinstance(value, int) or isinstance(value, bool):
                return None
            out.append(format(value, f"0{part.width}d"))
        else:
            out.append(value if isinstance(value, str) else str(value))
    return "".join(out)[:MAX_TEMPLATE]


class DataProvider(Provider):
    """A provider file, run by the engine."""

    def __init__(
        self,
        spec: Spec,
        settings: dict[str, Any],
        credentials: dict[str, str],
        timeout: float,
        allowed: frozenset[str],
    ):
        self.spec = spec
        self.id = spec.id
        self.kind = spec.kind
        self.settings = settings
        self.credentials = credentials
        self.timeout = timeout
        self.allowed = allowed
        self.declaration = kind_class(spec.kind).FILL
        # How often each var was read, by name: the tests count them to show what was never read.
        self.reads: Counter[str] = Counter()
        # With record set to a list, each exchange of a read is added to it (for --probe --record).
        self.record: list | None = None

    # Requests ----------------------------------------------------------------------------------

    def _ref(self, ref: Ref) -> Any:
        if ref.space == "credential":
            value = self.credentials.get(ref.name)
            if not value:
                raise SourceError(f"no {ref.name} credential")
            return value
        if ref.space == "setting":
            if ref.name in self.settings:
                return self.settings[ref.name]
            return self.spec.settings[ref.name].get("default")
        raise ValueError(ref)

    def _text(self, template: Template) -> str:
        out = []
        for part in template.parts:
            if isinstance(part, str):
                out.append(part)
            else:
                value = self._ref(part)
                out.append(value if isinstance(value, str) else json.dumps(value))
        return "".join(out)

    def _path(self, template: Template) -> str:
        out = []
        for part in template.parts:
            if isinstance(part, str):
                out.append(part)
            else:
                value = self._ref(part)
                out.append(urllib.parse.quote(str(value), safe=""))
        return "".join(out)

    def request_of(self, request: Request) -> tuple[str, dict[str, str]]:
        """The address and the headers of one request."""
        url = self.settings["url"].rstrip("/") + self._path(request.path)
        if request.query:
            url += "?" + urllib.parse.urlencode([(k, self._text(t)) for k, t in request.query])
        headers: dict[str, str] = {}
        if self.spec.auth is not None:
            auth = self.spec.auth
            headers.update(net.basic_auth(self._text(auth.username), self._text(auth.password)))
        for name, template in request.headers:
            value = self._text(template)
            if not _HEADER_VALUE.match(value):
                raise SourceError(f"the {name} header would hold a character a header cannot")
            headers[name] = value
        return url, headers

    def _get(self, request: Request) -> Any:
        url, headers = self.request_of(request)
        try:
            body = net.fetch(url, self.timeout, headers)
        except SourceError as exc:
            self._note(request, url, headers, error=str(exc))
            m = _STATUS.match(str(exc))
            said = request.statuses.get(int(m.group(1))) if m else None
            if said is None:
                raise
            raise type(exc)(said) from None
        try:
            reply = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
            self._note(request, url, headers, error="not JSON")
            raise SourceError(request.not_json or "response is not JSON") from None
        self._note(request, url, headers, reply=reply)
        if not _depth_ok(reply):
            raise SourceError("response nested too deeply")
        for require in request.require:
            if self._test(require.test, reply):
                continue
            if require.auth is not None and self._test(require.auth, reply):
                raise AuthError(require.auth_message)
            raise SourceError(require.message)
        return reply

    def _note(self, request: Request, url: str, headers: dict, **what) -> None:
        if self.record is None:
            return
        self.record.append({"request": request.id, "url": url, "headers": headers, **what})

    def _test(self, test: Test, reply: Any) -> bool:
        found = self._find(test.path, reply)
        value = found[0] if found else _ABSENT
        if test.has_equals:
            return value is not _ABSENT and equal(value, test.equals)
        if test.type is not None:
            return value is not _ABSENT and _is(test.type, value)
        if test.present:
            return value is not _ABSENT and value is not None
        if value is _ABSENT or isinstance(value, (dict, list)) or value is None:
            return False
        said = value if isinstance(value, str) else str(value)
        if test.ignore_case:
            return test.contains.lower() in said.lower()
        return test.contains in said

    @staticmethod
    def _find(path, value: Any) -> list[Any]:
        try:
            return path.find(value)
        except TooMany:
            raise SourceError("a path found too many values") from None

    # The read ----------------------------------------------------------------------------------

    def read(self, now: dt.datetime) -> dict:
        replies = {}
        for request in self.spec.requests:
            replies[request.id] = self._get(request)
        return self._group(self.spec.fill, self.declaration, replies, "")

    def _group(self, entries: dict, declaration: dict, replies: dict, prefix: str) -> dict:
        out = {}
        for key, entry in entries.items():
            name = prefix + key
            if name not in self.allowed:
                continue
            value = self._entry(entry, declaration[key], replies, name)
            if value is not _ABSENT:
                out[key] = value
        return out

    def _entry(self, entry, spec: dict, replies: dict, name: str) -> Any:
        if isinstance(entry, Scalar):
            return self._scalar(entry, replies)
        if isinstance(entry, Values):
            return self._values(entry, replies.get(entry.request))
        if isinstance(entry, Group):
            out = self._group(entry.fields, spec["fields"], replies, name + ".")
            needed = [k for k, s in spec["fields"].items() if s.get("required")]
            return out if all(k in out for k in needed) else _ABSENT
        if isinstance(entry, Items):
            return self._items(entry, spec["items"], replies.get(entry.request), name)
        raise TypeError(entry)

    def _scalar(self, entry: Scalar, replies: dict) -> Any:
        if entry.is_constant:
            return entry.constant
        found = self._find(entry.path, replies.get(entry.request))
        value = found[0] if found else _ABSENT
        if entry.map is not None and value is not _ABSENT:
            value = entry.map.get(value, _ABSENT) if isinstance(value, str) else _ABSENT
        if value is not _ABSENT:
            value = convert(value, entry.type, entry.strict)
        if value is _ABSENT:
            if entry.has_default:
                return entry.default
            if entry.required:
                raise SourceError(entry.required)
        return value

    def _values(self, entry: Values, reply: Any) -> Any:
        found = self._find(entry.path, reply)
        values = [convert(v, entry.type) for v in found]
        if not found or any(v is _ABSENT for v in values):
            return _ABSENT
        return values

    def _items(self, entry: Items, fields: dict, reply: Any, name: str) -> list[dict]:
        wanted = [k for k in entry.zipped or entry.fields if f"{name}.{k}" in self.allowed]
        required = [k for k, s in fields.items() if s.get("required") and k in wanted]
        if entry.zipped:
            return self._zipped(entry, reply, name, wanted, required)
        out = []
        for item in self._find(entry.each, reply):
            if not isinstance(item, dict):
                continue
            seen: dict[str, Any] = {}

            def var(var_name: str, item=item, seen=seen) -> Any:
                if var_name not in seen:
                    self.reads[var_name] += 1
                    seen[var_name] = self._var(entry.vars[var_name], item)
                return seen[var_name]

            built = {}
            for key in wanted:
                value = self._field(entry.fields[key], var)
                if value is not _ABSENT:
                    built[key] = value
            if all(k in built for k in required):
                out.append(built)
        return out

    def _zipped(self, entry: Items, reply: Any, name: str, wanted, required) -> list[dict]:
        columns = {}
        for key in wanted:
            values = entry.zipped[key]
            columns[key] = [convert(v, values.type) for v in self._find(values.path, reply)]
        lengths = {len(c) for c in columns.values()}
        if len(lengths) > 1:
            raise SourceError(f"the lists of {name} differ in length")
        out = []
        for i in range(lengths.pop() if lengths else 0):
            built = {k: c[i] for k, c in columns.items() if c[i] is not _ABSENT}
            if all(k in built for k in required):
                out.append(built)
        return out

    def _var(self, var, item: dict) -> Any:
        found = self._find(var.path, item)
        value = convert(found[0], var.type, var.strict) if found else _ABSENT
        if (
            var.nonzero
            and value is not _ABSENT
            and not isinstance(value, str)
            and isinstance(value, (int, float))
            and value == 0
        ):
            value = _ABSENT
        if value is _ABSENT and var.has_default:
            return var.default
        return value

    def _field(self, how: tuple, var) -> Any:
        mode, what = how
        if mode == "var":
            value = var(what)
            return value if present(value) else _ABSENT
        if mode == "pick":
            for var_name in what:
                value = var(var_name)
                if present(value):
                    return value
            return _ABSENT
        for case in what:
            if all(equal_found(var(v), literal) for v, literal in case.when):
                for template in case.tries:
                    filled = fill_template(template, lambda ref: var(ref.name))
                    if filled is not None:
                        return filled
                return _ABSENT
        return _ABSENT


def equal_found(value: Any, literal: Any) -> bool:
    return value is not _ABSENT and equal(value, literal)


def _is(kind: str, value: Any) -> bool:
    if kind == "object":
        return isinstance(value, dict)
    if kind == "list":
        return isinstance(value, list)
    if kind == "string":
        return isinstance(value, str)
    return isinstance(value, (int, float)) and not isinstance(value, bool)
