"""The engine: runs one provider file, its requests and its fill, in the source's worker thread.

One read makes each request in order through collector.net (direct, no proxy, no redirect, the
reply cut at net.MAX_BODY, http_timeout_s each), parses the JSON, applies the request's statuses,
not_json and require, and builds the fill from the replies, reading only the fields the kind's
`allowed` lets it read. A var of a list's item is read only when an allowed field needs it, so a
name the setting `show` holds back is never looked at.

A request goes to the source's `url` with the file's path appended, and to nowhere else; its query
and headers may carry the source's credentials and settings, and nothing in a request comes from
a reply but the id of a session. Failures raise SourceError, or AuthError for refused credentials,
with a short message that never holds an address.

A provider whose [auth] is a session logs in with one POST before its first read, keeps the
session's id in memory alone and sends it with every request after, so that one provider instance
holds one session however often it reads. The session is used until shortly before its lifetime
runs out, counted from its last use; a 401 on a session made at an earlier read drops it and logs
in again once, in the same read. close() ends the session with the file's logout, if it has one.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import re
import threading
import time
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
    Session,
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

# A session is used until this many seconds before its lifetime runs out, or half of a shorter one.
SESSION_MARGIN_S = 30
# The longest session id kept.
MAX_SID = 512

_STATUS = re.compile(r"^HTTP (\d{3})\b")
_HEADER_VALUE = re.compile(r"^[ -~]*$")
# A session id as it may be sent: printable ASCII with no space, quote or backslash.
_SID = re.compile(r"^[!#-\[\]-~]+$")
# How a recording names the session's id in place of its value.
SID_SHOWN = "{session.sid}"
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
        self.verify_tls = settings.get("verify_tls", True) is not False
        # The session, for a provider that logs in: its id, its lifetime in seconds (inf when the
        # login gives none), and when it is no longer used, by the clock.
        self.clock = time.monotonic
        self._sid: str | None = None
        self._valid_s = math.inf
        self._until = 0.0
        # A read in flight, and whether close() has been called; close() during a read leaves the
        # logout to the read's end.
        self._lock = threading.Lock()
        self._busy = False
        self._closed = False

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

    def _base(self) -> str:
        return self.settings["url"].rstrip("/")

    def request_of(self, request: Request) -> tuple[str, dict[str, str]]:
        """The address and the headers of one request."""
        url = self._base() + self._path(request.path)
        query = [(k, self._text(t)) for k, t in request.query]
        headers: dict[str, str] = {}
        auth = self.spec.auth
        if isinstance(auth, Session):
            if self._sid is not None:
                if auth.header:
                    headers[auth.header] = self._sid
                else:
                    query.append((auth.query, self._sid))
        elif auth is not None:
            headers.update(net.basic_auth(self._text(auth.username), self._text(auth.password)))
        if query:
            url += "?" + urllib.parse.urlencode(query)
        for name, template in request.headers:
            value = self._text(template)
            if not _HEADER_VALUE.match(value):
                raise SourceError(f"the {name} header would hold a character a header cannot")
            headers[name] = value
        return url, headers

    def _fetch(self, url: str, headers: dict, statuses: dict, note, **how) -> bytes:
        """One request through net.fetch; an error status with a message of the file's own takes
        that message, and keeps its status and whether it is a credential failure."""
        try:
            return net.fetch(url, self.timeout, headers, verify_tls=self.verify_tls, **how)
        except SourceError as exc:
            note(error=str(exc))
            m = _STATUS.match(str(exc))
            said = statuses.get(int(m.group(1))) if m else None
            if said is None:
                raise
            out = type(exc)(said)
            out.status = exc.status
            raise out from None

    def _parse(self, body: bytes, not_json: str | None, requires: tuple, note) -> Any:
        try:
            reply = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
            note(error="not JSON")
            raise SourceError(not_json or "response is not JSON") from None
        note(reply=reply)
        if not _depth_ok(reply):
            raise SourceError("response nested too deeply")
        for require in requires:
            if self._test(require.test, reply):
                continue
            if require.auth is not None and self._test(require.auth, reply):
                raise AuthError(require.auth_message)
            raise SourceError(require.message)
        return reply

    def _get(self, request: Request) -> Any:
        url, headers = self.request_of(request)

        def note(**what):
            self._note(request.id, "GET", url, headers, **what)

        body = self._fetch(url, headers, request.statuses, note)
        return self._parse(body, request.not_json, request.require, note)

    def _note(self, rid: str, method: str, url: str, headers: dict, **what) -> None:
        """An exchange added to the recording, with the session's id shown by name."""
        if self.record is None:
            return
        if self._sid is not None:
            sid = self._sid
            quoted = urllib.parse.quote_plus(sid)
            url = url.replace(quoted, SID_SHOWN).replace(sid, SID_SHOWN)
            headers = {k: v.replace(sid, SID_SHOWN) for k, v in headers.items()}
        self.record.append(
            {"request": rid, "method": method, "url": url, "headers": headers, **what}
        )

    # Sessions ----------------------------------------------------------------------------------

    def _live(self) -> bool:
        return self._sid is not None and self.clock() < self._until

    def _used(self) -> None:
        """The session was used: its lifetime counts from now."""
        margin = min(SESSION_MARGIN_S, self._valid_s / 2)
        self._until = self.clock() + self._valid_s - margin

    def _body(self, body: dict) -> dict:
        out: dict[str, Any] = {}
        for key, value in body.items():
            if isinstance(value, dict):
                out[key] = self._body(value)
            elif isinstance(value, Template):
                out[key] = self._text(value)
            else:
                out[key] = value
        return out

    def _login(self) -> None:
        """Log in with the file's session login: AuthError when it is refused, SourceError when
        its reply holds no session."""
        auth = self.spec.auth
        self._sid = None
        url = self._base() + self._path(auth.login)

        def note(**what):
            if "reply" in what:
                what["reply"] = _masked(what["reply"])
            self._note("auth.login", "POST", url, {}, json=auth.body_text, **what)

        body = self._fetch(
            url, {}, auth.statuses, note, method="POST", json_body=self._body(auth.body)
        )
        reply = self._parse(body, auth.not_json, auth.require, note)
        found = self._find(auth.sid, reply)
        sid = found[0] if found else None
        if not isinstance(sid, str) or not sid or len(sid) > MAX_SID or not _SID.match(sid):
            raise SourceError("the login gave no session id")
        valid = self._find(auth.valid_s, reply) if auth.valid_s is not None else []
        lasts = valid[0] if valid else None
        number = isinstance(lasts, (int, float)) and not isinstance(lasts, bool)
        self._valid_s = float(lasts) if number and 0 < lasts < math.inf else math.inf
        self._sid = sid
        self._used()

    def _logout(self) -> None:
        """End the session, if one is held: the file's logout, best effort. Never raises."""
        auth = self.spec.auth
        sid = self._sid
        if not self._live() or not isinstance(auth, Session) or auth.logout is None:
            self._sid = None
            return
        try:
            url = self._base() + self._path(auth.logout)
            headers: dict[str, str] = {}
            if auth.header:
                headers[auth.header] = sid
            else:
                url += "?" + urllib.parse.urlencode([(auth.query, sid)])
            try:
                net.fetch(url, self.timeout, headers, method="DELETE", verify_tls=self.verify_tls)
                self._note("auth.logout", "DELETE", url, headers, reply=None)
            except SourceError as exc:
                self._note("auth.logout", "DELETE", url, headers, error=str(exc))
        except Exception:  # noqa: BLE001 - a logout that fails leaves the session to expire
            pass
        finally:
            self._sid = None

    def close(self) -> None:
        """End the session, if the provider holds one, and read no more. A read in flight ends it
        when it finishes."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
            if self._busy:
                return
        self._logout()

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
        with self._lock:
            if self._closed:
                raise SourceError("provider closed")
            self._busy = True
        try:
            return self._read()
        finally:
            with self._lock:
                self._busy = False
                ending = self._closed
            if ending:
                self._logout()

    def _read(self) -> dict:
        session = isinstance(self.spec.auth, Session)
        made = False
        if session and not self._live():
            self._login()
            made = True
        replies = {}
        for request in self.spec.requests:
            try:
                replies[request.id] = self._get(request)
            except AuthError as exc:
                # A session made at an earlier read that the service no longer knows (it
                # restarted, or the session expired early) is made again, once.
                if not session or made or exc.status != 401:
                    if session:
                        self._sid = None
                    raise
                self._login()
                made = True
                replies[request.id] = self._get(request)
            if session:
                self._used()
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


def _masked(reply: Any) -> Any:
    """A login's reply as a recording keeps it: every text replaced by its length, since a login's
    reply holds the session's id and often other secrets beside it."""
    if isinstance(reply, str):
        return f"<string {len(reply)}>"
    if isinstance(reply, dict):
        return {k: _masked(v) for k, v in reply.items()}
    if isinstance(reply, list):
        return [_masked(v) for v in reply]
    return reply
