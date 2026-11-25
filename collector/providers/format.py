"""The provider file format, version 1: the checks every provider file passes, and the compiled
form the engine runs.

A provider file is TOML, and data alone: nothing in it runs as code. check() holds a parsed file to
every rule of docs/providers.md and returns it compiled, or the problems, one for each fault, each
naming the file and the dotted field (`tautulli.toml: request[0].path: must start with /`). The
rules are written here once, in code; tests/collector/test_provider_format.py holds each to a
refused example.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from collector.config import CREDENTIAL_FIELDS
from collector.kinds import KINDS, kind_class
from collector.providers.path import Path, PathError, compile_path

FORMAT = 1
MAX_FILE = 64 * 1024
MAX_REQUESTS = 3
MAX_VARS = 64
MAX_CASES = 16
MAX_TRIES = 8
MAX_MESSAGE = 80
# Where a credential may be used, as a problem says it.
CREDENTIAL_PLACES = "a credential may be used only in a request's query or headers, or in [auth]"
# A session login's JSON body: the most members in all, and the deepest nesting of its tables.
MAX_BODY_MEMBERS = 16
MAX_BODY_DEPTH = 4

ID = re.compile(r"^[a-z][a-z0-9_]{0,23}$")
_VAR = ID
_HEADER_NAME = re.compile(r"^[A-Za-z0-9-]+$")
_PRINTABLE = re.compile(r"^[ -~]*$")
# What a path may hold: printable ASCII but space, and none of \ @ ? #.
_PATH = re.compile(r"^/[!-~]*$")
_PATH_REFUSED = ("\\", "@", "?", "#")
# Headers a provider may never set. The engine sets User-Agent itself.
_HEADERS_REFUSED = {
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "cookie",
    "proxy-authorization",
    "user-agent",
}
# The settings every section of a kind has, which a provider cannot declare as its own.
COMMON_SETTINGS = ("enabled", "every_s", "from", "url", "secret", "verify_tls")
TYPES = ("int", "number", "string", "bool", "time", "raw")
REQUIRE_TYPES = ("object", "list", "string", "number")
SETTING_TYPES = ("string", "integer", "number", "boolean")


class FormatError(Exception):
    """A provider file that does not pass, with every problem."""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


# The compiled form ----------------------------------------------------------------------------


@dataclass(frozen=True)
class Ref:
    """A value a template takes: a var of the item, a credential or a setting."""

    space: str  # "var", "credential" or "setting"
    name: str
    width: int = 0  # {var:0N}: a whole number zero-padded to N digits


@dataclass(frozen=True)
class Template:
    text: str
    parts: tuple  # of str and Ref

    @property
    def refs(self) -> list[Ref]:
        return [p for p in self.parts if isinstance(p, Ref)]


@dataclass(frozen=True)
class Test:
    """A test on the value a path finds: equals a literal, is of a type, is present, or holds
    a piece of text."""

    path: Path
    equals: Any = None
    has_equals: bool = False
    type: str | None = None
    present: bool = False
    contains: str | None = None
    ignore_case: bool = False


@dataclass(frozen=True)
class Require:
    test: Test
    message: str
    auth: Test | None = None
    auth_message: str = ""


@dataclass(frozen=True)
class Request:
    id: str
    path: Template
    query: tuple  # of (name, Template)
    headers: tuple  # of (name, Template)
    statuses: dict
    not_json: str | None
    require: tuple  # of Require


@dataclass(frozen=True)
class Basic:
    username: Template
    password: Template


@dataclass(frozen=True)
class Session:
    """A session login: one POST of a JSON body, the session's id read from its reply and sent
    with every request after, and an optional DELETE that ends it."""

    login: Template  # the login's path
    body: dict  # the JSON body: names to a Template, a literal, or a table of the same
    body_text: dict  # the body as the file writes it, with its templates unfilled
    sid: Path  # where the login's reply holds the session's id
    valid_s: Path | None  # where it holds the seconds the session lasts, or None
    header: str | None  # the header the id is sent in, or None
    query: str | None  # the query parameter it is sent in, or None
    logout: Template | None  # the path a DELETE ends the session at, or None
    statuses: dict
    not_json: str | None
    require: tuple  # of Require, checked on the login's reply
    # Statuses of the login, beyond 401, 403 and 429, that are refused credentials: 400 alone,
    # for a service that answers a wrong password so (PocketBase, under Beszel).
    refused: frozenset = frozenset()


# The statuses [auth] refused may add to those a login always counts as refused.
REFUSABLE = (400,)


@dataclass(frozen=True)
class Scalar:
    """A scalar field: a constant, or the first value a path finds."""

    request: str = ""
    path: Path | None = None
    type: str = "raw"
    strict: bool = False
    default: Any = None
    has_default: bool = False
    required: str | None = None
    map: dict | None = None
    constant: Any = None
    is_constant: bool = False


@dataclass(frozen=True)
class Values:
    """A list of numbers or strings: every value a path finds."""

    request: str
    path: Path
    type: str


@dataclass(frozen=True)
class Group:
    """An object field, its fields each an entry of its own."""

    fields: dict


@dataclass(frozen=True)
class Var:
    path: Path
    type: str = "raw"
    strict: bool = False
    default: Any = None
    has_default: bool = False
    nonzero: bool = False


@dataclass(frozen=True)
class Case:
    when: tuple  # of (var, literal)
    tries: tuple  # of Template


@dataclass(frozen=True)
class Items:
    """A list of objects: one item per value of `each`, or the n-th of each zipped list."""

    request: str
    each: Path | None = None
    vars: dict = field(default_factory=dict)  # name -> Var
    # field -> ("var", name) | ("pick", names) | ("cases", (Case, ...))
    fields: dict = field(default_factory=dict)
    zipped: dict = field(default_factory=dict)  # field -> Values, with zip = true


@dataclass(frozen=True)
class Spec:
    """A provider file, checked and compiled."""

    id: str
    kind: str
    name: str
    docs: str
    credentials: dict  # field -> help
    settings: dict  # key -> its declaration
    auth: Basic | Session | None
    requests: tuple  # of Request
    fill: dict  # field -> Scalar | Values | Group | Items
    digest: str = ""


# Checking -------------------------------------------------------------------------------------


class _Checker:
    def __init__(self, where: str):
        self.where = where
        self.problems: list[str] = []

    def bad(self, at: str, why: str) -> None:
        self.problems.append(f"{self.where}: {at}: {why}" if at else f"{self.where}: {why}")

    def keys(self, at: str, table: dict, allowed: tuple, required: tuple = ()) -> None:
        for key in table:
            if key not in allowed:
                self.bad(_at(at, key), "unknown field")
        for key in required:
            if key not in table:
                self.bad(_at(at, key), "required")

    def text(self, at: str, value: Any, limit: int = MAX_MESSAGE) -> str | None:
        if not isinstance(value, str) or not value.strip():
            self.bad(at, "expected text")
            return None
        if len(value) > limit or not value.isprintable():
            self.bad(at, f"at most {limit} printable characters")
            return None
        return value

    def path(self, at: str, value: Any) -> Path | None:
        try:
            return compile_path(value)
        except PathError as exc:
            self.bad(at, str(exc))
            return None

    def template(self, at: str, value: Any, spaces: dict[str, set[str]]) -> Template | None:
        """A template whose references are all in spaces: {"var": {...}, "credential": {...}}."""
        if not isinstance(value, str):
            self.bad(at, "expected text")
            return None
        try:
            t = parse_template(value)
        except ValueError as exc:
            self.bad(at, str(exc))
            return None
        for ref in t.refs:
            if ref.space not in spaces:
                if ref.space == "credential":
                    self.bad(at, CREDENTIAL_PLACES)
                else:
                    self.bad(at, f"{{{ref.space}.{ref.name}}} cannot be used here")
            elif ref.name not in spaces[ref.space]:
                said = ref.name if ref.space == "var" else f"{ref.space}.{ref.name}"
                self.bad(at, f"{{{said}}} is not declared")
            elif ref.width and ref.space != "var":
                self.bad(at, "a width is for a var alone")
        return t


def _at(at: str, key: Any) -> str:
    return f"{at}.{key}" if at else str(key)


def _literal(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool))


def parse_template(text: str) -> Template:
    """{var}, {var:0N}, {credential.field} and {setting.key}; {{ and }} stand for braces."""
    parts: list = []
    buf = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "{" and text.startswith("{{", i):
            buf.append("{")
            i += 2
            continue
        if ch == "}" and text.startswith("}}", i):
            buf.append("}")
            i += 2
            continue
        if ch == "}":
            raise ValueError(f'unexpected "}}" at character {i + 1}; write }}}} for a brace')
        if ch == "{":
            end = text.find("}", i)
            if end < 0:
                raise ValueError(f'"{{" at character {i + 1} is not closed')
            inner = text[i + 1 : end]
            m = re.fullmatch(
                r"(?:(credential|setting)\.)?([a-z][a-z0-9_]{0,23})(?::0([1-9]))?", inner
            )
            if not m:
                raise ValueError(f'"{{{inner}}}" at character {i + 1} is not a reference')
            if buf:
                parts.append("".join(buf))
                buf = []
            parts.append(Ref(m.group(1) or "var", m.group(2), int(m.group(3) or 0)))
            i = end + 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        parts.append("".join(buf))
    return Template(text, tuple(parts))


_TOP_KEYS = ("format", "id", "kind", "name", "docs", "credentials", "settings", "auth", "request")
_TOP_KEYS += ("fill",)


def check(data: Any, where: str, expect_id: str | None = None) -> Spec:
    """The provider file data (parsed TOML), checked and compiled; FormatError with every problem.

    where names the file in the problems; expect_id is the id its file name gives it.
    """
    c = _Checker(where)
    if not isinstance(data, dict):
        raise FormatError([f"{where}: expected a TOML table"])
    c.keys("", data, _TOP_KEYS, ("format", "id", "kind", "name", "request", "fill"))
    if "format" in data and (type(data["format"]) is not int or data["format"] != FORMAT):
        c.bad("format", f"must be {FORMAT}")
    pid = data.get("id")
    if "id" in data:
        if not isinstance(pid, str) or not ID.match(pid):
            c.bad("id", "1 to 24 of a-z, 0-9 and _, starting with a letter")
        elif expect_id is not None and pid != expect_id:
            c.bad("id", f'must be "{expect_id}", the file\'s name')
    kind = data.get("kind")
    if "kind" in data and kind not in KINDS:
        c.bad("kind", f"unknown kind {kind!r}; use {', '.join(KINDS)}")
        kind = None
    name = c.text("name", data["name"], 60) if "name" in data else None
    docs = data.get("docs", "")
    if "docs" in data and (not isinstance(docs, str) or not re.match(r"^https?://[!-~]+$", docs)):
        c.bad("docs", "an http:// or https:// address")

    credentials = _credentials(c, data.get("credentials", {}))
    settings = _settings(c, data.get("settings", {}))
    request_spaces = {"credential": set(credentials), "setting": set(settings)}
    auth = _auth(c, data.get("auth"), request_spaces)
    requests = _requests(c, data.get("request"), request_spaces, auth)
    # The ids the file gives its requests, whether or not each request passed, so that a fault in
    # one is reported once rather than again at every part of the fill that reads it.
    given = data.get("request")
    ids = [r.get("id", "") for r in given if isinstance(r, dict)] if isinstance(given, list) else []
    fill = {}
    if kind is not None and "fill" in data:
        cls = kind_class(kind)
        fill = _fill(
            c, data["fill"], cls.FILL, ids, getattr(cls, "ONE_OF", ()), getattr(cls, "SOME_OF", ())
        )
    if c.problems:
        raise FormatError(c.problems)
    return Spec(pid, kind, name, docs, credentials, settings, auth, tuple(requests), fill)


def _credentials(c: _Checker, table: Any) -> dict:
    if not isinstance(table, dict):
        c.bad("credentials", "expected a table")
        return {}
    out = {}
    for key, value in table.items():
        if key not in CREDENTIAL_FIELDS:
            c.bad(f"credentials.{key}", f"use {', '.join(CREDENTIAL_FIELDS)}")
        elif c.text(f"credentials.{key}", value, 300):
            out[key] = value
    return out


_SETTING_KEYS = ("type", "default", "min", "max", "values", "help")


def _settings(c: _Checker, table: Any) -> dict:
    if not isinstance(table, dict):
        c.bad("settings", "expected a table")
        return {}
    out = {}
    for key, spec in table.items():
        at = f"settings.{key}"
        if not ID.match(key):
            c.bad(at, "1 to 24 of a-z, 0-9 and _, starting with a letter")
            continue
        if key in COMMON_SETTINGS or key in ("show", "fly_every_s"):
            c.bad(at, "taken by the section's own settings")
            continue
        if not isinstance(spec, dict):
            c.bad(at, "expected a table")
            continue
        c.keys(at, spec, _SETTING_KEYS, ("type", "default", "help"))
        kind = spec.get("type")
        if kind not in SETTING_TYPES:
            c.bad(f"{at}.type", f"use {', '.join(SETTING_TYPES)}")
            continue
        ok = {
            "string": lambda v: isinstance(v, str),
            "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
            "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            "boolean": lambda v: isinstance(v, bool),
        }[kind]
        if "default" in spec and not ok(spec["default"]):
            c.bad(f"{at}.default", f"expected {kind}")
        for bound in ("min", "max"):
            if bound in spec and (kind not in ("integer", "number") or not ok(spec[bound])):
                c.bad(f"{at}.{bound}", "a number, for an integer or number setting")
        if "values" in spec and (
            not isinstance(spec["values"], list) or not all(ok(v) for v in spec["values"])
        ):
            c.bad(f"{at}.values", f"a list of {kind} values")
        if "help" in spec:
            c.text(f"{at}.help", spec["help"], 300)
        out[key] = dict(spec)
    return out


def _auth(c: _Checker, table: Any, spaces: dict) -> Basic | Session | None:
    if table is None:
        return None
    if not isinstance(table, dict):
        c.bad("auth", "expected a table")
        return None
    method = table.get("method")
    if method == "session":
        return _session(c, table, spaces)
    if method != "basic":
        c.bad("auth.method", 'use "basic" or "session"')
        return None
    c.keys("auth", table, ("method", "username", "password"), ("username", "password"))
    user = c.template("auth.username", table.get("username", ""), spaces)
    password = c.template("auth.password", table.get("password", ""), spaces)
    if user is None or password is None:
        return None
    return Basic(user, password)


_SESSION_KEYS = ("method", "login", "sid", "valid_s", "send", "logout", "statuses", "not_json")
_SESSION_KEYS += ("require", "refused")


def _session(c: _Checker, table: dict, spaces: dict) -> Session | None:
    c.keys("auth", table, _SESSION_KEYS, ("login", "sid", "send"))
    before = len(c.problems)
    path_spaces = {"setting": spaces["setting"]}
    login, body, body_text = None, {}, {}
    given = table.get("login")
    if "login" in table and not isinstance(given, dict):
        c.bad("auth.login", "expected a table with path and json")
    elif isinstance(given, dict):
        c.keys("auth.login", given, ("path", "json"), ("path", "json"))
        login = _request_path(c, "auth.login.path", given.get("path"), path_spaces)
        if "json" in given:
            if isinstance(given["json"], dict):
                body = _body(c, "auth.login.json", given["json"], spaces, 1, [0])
                body_text = given["json"]
            else:
                c.bad("auth.login.json", "expected a table")
    sid = c.path("auth.sid", table["sid"]) if "sid" in table else None
    valid_s = c.path("auth.valid_s", table["valid_s"]) if "valid_s" in table else None
    header = query = None
    send = table.get("send")
    if "send" in table and (not isinstance(send, dict) or len(send) != 1):
        c.bad("auth.send", "a table of one: header or query")
    elif isinstance(send, dict):
        c.keys("auth.send", send, ("header", "query"))
        if "header" in send:
            header = send["header"]
            low = header.lower() if isinstance(header, str) else ""
            if not isinstance(header, str) or not _HEADER_NAME.match(header):
                c.bad("auth.send.header", "a header's name is letters, digits and -")
            elif low in _HEADERS_REFUSED or low.startswith("proxy-"):
                c.bad("auth.send.header", "this header cannot be set")
        elif "query" in send:
            query = send["query"]
            if not isinstance(query, str) or not query or not _PRINTABLE.match(query):
                c.bad("auth.send.query", "a name of printable ASCII")
    logout = None
    if "logout" in table:
        out = table["logout"]
        if not isinstance(out, dict):
            c.bad("auth.logout", "expected a table with path")
        else:
            c.keys("auth.logout", out, ("path",), ("path",))
            logout = _request_path(c, "auth.logout.path", out.get("path"), path_spaces)
    statuses = _statuses(c, "auth.statuses", table.get("statuses", {}))
    not_json = c.text("auth.not_json", table["not_json"]) if "not_json" in table else None
    require = _require(c, "auth.require", table.get("require", []))
    refused = table.get("refused", [])
    ok = isinstance(refused, list) and all(
        isinstance(s, int) and not isinstance(s, bool) and s in REFUSABLE for s in refused
    )
    if not ok:
        c.bad("auth.refused", f"a list of the statuses {', '.join(map(str, REFUSABLE))} alone")
    if len(c.problems) > before or login is None or sid is None:
        return None
    return Session(
        login,
        body,
        body_text,
        sid,
        valid_s,
        header,
        query,
        logout,
        statuses,
        not_json,
        require,
        frozenset(refused),
    )


def _body(c: _Checker, at: str, table: dict, spaces: dict, depth: int, members: list) -> dict:
    """A login's JSON body: text (a template, which may hold credentials and settings), a number,
    true or false, or a table of the same."""
    if depth > MAX_BODY_DEPTH:
        c.bad(at, f"tables nested at most {MAX_BODY_DEPTH} deep")
        return {}
    out: dict[str, Any] = {}
    for key, value in table.items():
        members[0] += 1
        if members[0] == MAX_BODY_MEMBERS + 1:
            c.bad(at, f"at most {MAX_BODY_MEMBERS} members in the body")
        kat = _at(at, key)
        if isinstance(value, dict):
            out[key] = _body(c, kat, value, spaces, depth + 1, members)
        elif isinstance(value, str):
            if not value.isprintable():
                c.bad(kat, "printable text alone")
                continue
            t = c.template(kat, value, spaces)
            if t is not None:
                out[key] = t
        elif isinstance(value, (bool, int, float)):
            out[key] = value
        else:
            c.bad(kat, "text, a number, true or false, or a table")
    return out


def _statuses(c: _Checker, at: str, s: Any) -> dict:
    statuses: dict[int, str] = {}
    if not isinstance(s, dict):
        c.bad(at, "expected a table")
        return statuses
    for key, value in s.items():
        if not re.fullmatch(r"[1-5][0-9][0-9]", str(key)):
            c.bad(f"{at}.{key}", "an HTTP status, from 100 to 599")
        elif c.text(f"{at}.{key}", value):
            statuses[int(key)] = value
    return statuses


_REQUEST_KEYS = ("id", "path", "query", "headers", "statuses", "not_json", "require")


def _requests(c: _Checker, given: Any, spaces: dict, auth) -> list[Request]:
    if given is None:
        return []
    if not isinstance(given, list) or not given or not all(isinstance(r, dict) for r in given):
        c.bad("request", "one to three [[request]] tables")
        return []
    if len(given) > MAX_REQUESTS:
        c.bad("request", f"at most {MAX_REQUESTS} requests")
    out: list[Request] = []
    seen: set[str] = set()
    path_spaces = {"setting": spaces["setting"]}
    for i, r in enumerate(given[:MAX_REQUESTS]):
        at = f"request[{i}]"
        c.keys(at, r, _REQUEST_KEYS, ("path",))
        rid = r.get("id", "")
        if "id" in r:
            if not isinstance(rid, str) or not ID.match(rid):
                c.bad(f"{at}.id", "1 to 24 of a-z, 0-9 and _, starting with a letter")
            elif rid in seen:
                c.bad(f"{at}.id", f'"{rid}" is the id of an earlier request')
            seen.add(rid)
        elif len(given) > 1:
            c.bad(f"{at}.id", "required when there is more than one request")
        path = _request_path(c, f"{at}.path", r.get("path"), path_spaces)
        query = []
        q = r.get("query", {})
        if not isinstance(q, dict):
            c.bad(f"{at}.query", "expected a table")
        else:
            for key, value in q.items():
                if not key or not _PRINTABLE.match(key):
                    c.bad(f"{at}.query", f"{key!r}: a name of printable ASCII")
                elif isinstance(auth, Session) and key == auth.query:
                    c.bad(f"{at}.query.{key}", "[auth] sends the session in this parameter")
                t = c.template(f"{at}.query.{key}", value, spaces)
                if t is not None:
                    query.append((key, t))
        headers = []
        h = r.get("headers", {})
        if not isinstance(h, dict):
            c.bad(f"{at}.headers", "expected a table")
        else:
            names = set()
            for key, value in h.items():
                hat = f"{at}.headers.{key}"
                low = key.lower()
                if not _HEADER_NAME.match(key):
                    c.bad(hat, "a header's name is letters, digits and -")
                elif low in _HEADERS_REFUSED or low.startswith("proxy-"):
                    c.bad(hat, "this header cannot be set")
                elif low == "authorization" and isinstance(auth, Basic):
                    c.bad(hat, "[auth] sets this header")
                elif isinstance(auth, Session) and low == (auth.header or "").lower():
                    c.bad(hat, "[auth] sends the session in this header")
                elif low in names:
                    c.bad(hat, "the same header twice")
                names.add(low)
                if isinstance(value, str) and not _PRINTABLE.match(value):
                    c.bad(hat, "printable ASCII alone")
                    continue
                t = c.template(hat, value, spaces)
                if t is not None:
                    headers.append((key, t))
        statuses = _statuses(c, f"{at}.statuses", r.get("statuses", {}))
        not_json = None
        if "not_json" in r:
            not_json = c.text(f"{at}.not_json", r["not_json"])
        require = _require(c, f"{at}.require", r.get("require", []))
        if path is not None:
            out.append(
                Request(rid, path, tuple(query), tuple(headers), statuses, not_json, require)
            )
    return out


def _request_path(c: _Checker, at: str, value: Any, spaces: dict) -> Template | None:
    if not isinstance(value, str):
        c.bad(at, "expected text")
        return None
    if not value.startswith("/"):
        c.bad(at, "must start with /")
        return None
    if value.startswith("//") or "://" in value:
        c.bad(at, "a path alone, with no address in it")
        return None
    if not _PATH.match(value) or any(ch in value for ch in _PATH_REFUSED):
        c.bad(at, "printable ASCII, with no space, \\, @, ? or #; give the query in query")
        return None
    return c.template(at, value, spaces)


def _test(c: _Checker, at: str, table: dict, auth: bool) -> Test | None:
    path = c.path(f"{at}.path", table.get("path"))
    tests = [k for k in (("contains", "equals") if auth else ("equals", "type", "present"))
             if k in table]  # fmt: skip
    if len(tests) != 1:
        which = "contains or equals" if auth else "equals, type or present"
        c.bad(at, f"give exactly one of {which}")
        return None
    if path is None:
        return None
    key = tests[0]
    value = table[key]
    if key == "equals":
        if not _literal(value):
            c.bad(f"{at}.equals", "a string, a number, true or false")
            return None
        return Test(path, equals=value, has_equals=True)
    if key == "type":
        if value not in REQUIRE_TYPES:
            c.bad(f"{at}.type", f"use {', '.join(REQUIRE_TYPES)}")
            return None
        return Test(path, type=value)
    if key == "present":
        if value is not True:
            c.bad(f"{at}.present", "only present = true")
            return None
        return Test(path, present=True)
    if not isinstance(value, str) or not value:
        c.bad(f"{at}.contains", "expected text")
        return None
    ignore = table.get("ignore_case", False)
    if not isinstance(ignore, bool):
        c.bad(f"{at}.ignore_case", "true or false")
    return Test(path, contains=value, ignore_case=ignore is True)


_REQUIRE_KEYS = ("path", "equals", "type", "present", "message", "auth")


def _require(c: _Checker, at: str, given: Any) -> tuple:
    if not isinstance(given, list) or not all(isinstance(r, dict) for r in given):
        c.bad(at, "[[request.require]] tables")
        return ()
    out = []
    for i, r in enumerate(given):
        rat = f"{at}[{i}]"
        c.keys(rat, r, _REQUIRE_KEYS, ("path", "message"))
        test = _test(c, rat, r, auth=False)
        message = c.text(f"{rat}.message", r.get("message"))
        auth, auth_message = None, ""
        if "auth" in r:
            a = r["auth"]
            if not isinstance(a, dict):
                c.bad(f"{rat}.auth", "expected a table")
            else:
                c.keys(
                    f"{rat}.auth", a, ("path", "contains", "equals", "ignore_case", "message"),
                    ("path", "message"),
                )  # fmt: skip
                if "ignore_case" in a and "contains" not in a:
                    c.bad(f"{rat}.auth.ignore_case", "goes with contains")
                auth = _test(c, f"{rat}.auth", a, auth=True)
                auth_message = c.text(f"{rat}.auth.message", a.get("message")) or ""
        if test is not None and message:
            out.append(Require(test, message, auth, auth_message))
    return tuple(out)


# The fill -------------------------------------------------------------------------------------


def _from(c: _Checker, at: str, table: dict, ids: list[str], inherited: str | None) -> str:
    """The request a part of the fill reads: its own `from`, the one it sits in, or the only one."""
    if "from" in table:
        given = table["from"]
        if given not in ids or not given:
            c.bad(f"{at}.from", f"no request has the id {given!r}")
        return given if isinstance(given, str) else ""
    if inherited is not None:
        return inherited
    if len(ids) > 1:
        c.bad(f"{at}.from", "required when there is more than one request")
    return ids[0] if ids else ""


def _fill(
    c: _Checker,
    table: Any,
    declaration: dict,
    ids: list[str],
    one_of: tuple = (),
    some_of: tuple = (),
) -> dict:
    if not isinstance(table, dict):
        c.bad("fill", "expected a table")
        return {}
    if some_of and not any(k in table for k in some_of):
        # A kind that takes several fields, at least one of which is needed (usage's cpu and
        # memory): a file gives one or more of them.
        c.bad("fill", f"give {' or '.join(some_of)}, or both")
    if one_of:
        # A kind that takes one of several fields: exactly one must be given, and that one is then
        # required, as a field the kind always needs is.
        given = [k for k in one_of if k in table]
        if not given:
            c.bad("fill", f"give one of {' and '.join(one_of)}")
        elif len(given) > 1:
            c.bad(f"fill.{given[1]}", f"give one of {' and '.join(one_of)}, not both")
        else:
            declaration = {**declaration, given[0]: {**declaration[given[0]], "required": True}}
    return _fields(c, "fill", table, declaration, ids, None)


def _fields(
    c: _Checker, at: str, table: dict, declaration: dict, ids: list[str], inherited: str | None
) -> dict:
    out = {}
    for key, entry in table.items():
        if key == "from" and at != "fill":
            continue
        fat = f"{at}.{key}"
        spec = declaration.get(key)
        if spec is None:
            c.bad(fat, "the kind has no such field")
            continue
        kind = spec["type"]
        if kind == "object":
            if not isinstance(entry, dict):
                c.bad(fat, "expected a table of its fields")
                continue
            own = _from(c, fat, entry, ids, inherited)
            fields = _fields(c, fat, entry, spec["fields"], ids, own)
            if fields is not None:
                out[key] = Group(fields)
        elif kind == "list" and "items" in spec:
            items = _items(c, fat, entry, spec["items"], ids, inherited)
            if items is not None:
                out[key] = items
        elif kind == "list":
            values = _values(c, fat, entry, spec["of"], ids, inherited)
            if values is not None:
                out[key] = values
        else:
            # Within an object, a required field that is missing leaves the whole object out.
            top = at == "fill"
            scalar = _scalar(c, fat, entry, spec, ids, inherited, top)
            if scalar is not None:
                out[key] = scalar
    for key, spec in declaration.items():
        if spec.get("required") and key not in table:
            c.bad(f"{at}.{key}", "required by the kind")
    return out


def _convert_ok(kind: str, value: Any) -> bool:
    if kind in ("int",):
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "bool":
        return isinstance(value, bool)
    return _literal(value)


def _scalar(c, at, entry, spec, ids, inherited, top) -> Scalar | None:
    declared = spec["type"]
    if not isinstance(entry, dict):
        if not _convert_ok(declared, entry):
            c.bad(at, f"a constant here must be {declared}")
            return None
        return Scalar(constant=entry, is_constant=True, type=declared)
    c.keys(at, entry, ("from", "path", "type", "strict", "default", "required", "map"), ("path",))
    request = _from(c, at, entry, ids, inherited)
    path = c.path(f"{at}.path", entry.get("path"))
    kind = entry.get("type", declared)
    if kind not in TYPES:
        c.bad(f"{at}.type", f"use {', '.join(TYPES)}")
        return None
    strict = entry.get("strict", False)
    if "strict" in entry and (not isinstance(strict, bool) or kind != "int"):
        c.bad(f"{at}.strict", "true or false, with type int")
    mapping = entry.get("map")
    if mapping is not None and (
        not isinstance(mapping, dict) or not all(_literal(v) for v in mapping.values())
    ):
        c.bad(f"{at}.map", "a table of values found to values used")
        mapping = None
    has_default = "default" in entry
    if has_default and not _convert_ok(declared, entry["default"]):
        c.bad(f"{at}.default", f"must be {declared}")
    required = None
    if "required" in entry:
        required = c.text(f"{at}.required", entry["required"])
        if has_default:
            c.bad(f"{at}.required", "a field with a default is never missing")
    elif spec.get("required") and top and not has_default:
        c.bad(at, "required by the kind: give required, the message for when it is missing")
    if path is None:
        return None
    return Scalar(
        request, path, kind, strict is True, entry.get("default"), has_default, required, mapping
    )


def _values(c, at, entry, of, ids, inherited) -> Values | None:
    if not isinstance(entry, dict):
        c.bad(at, "expected a table with a path")
        return None
    c.keys(at, entry, ("from", "path", "type"), ("path",))
    request = _from(c, at, entry, ids, inherited)
    path = c.path(f"{at}.path", entry.get("path"))
    kind = entry.get("type", of)
    if kind != of:
        c.bad(f"{at}.type", f"must be {of}")
    return Values(request, path, of) if path is not None else None


_VAR_KEYS = ("path", "type", "strict", "default", "nonzero")


def _var(c: _Checker, at: str, entry: Any) -> Var | None:
    if isinstance(entry, str):
        path = c.path(at, entry)
        return Var(path) if path is not None else None
    if not isinstance(entry, dict):
        c.bad(at, "a path, or a table with one")
        return None
    c.keys(at, entry, _VAR_KEYS, ("path",))
    path = c.path(f"{at}.path", entry.get("path"))
    kind = entry.get("type", "raw")
    if kind not in TYPES:
        c.bad(f"{at}.type", f"use {', '.join(TYPES)}")
        return None
    strict = entry.get("strict", False)
    if "strict" in entry and (not isinstance(strict, bool) or kind != "int"):
        c.bad(f"{at}.strict", "true or false, with type int")
    nonzero = entry.get("nonzero", False)
    if not isinstance(nonzero, bool):
        c.bad(f"{at}.nonzero", "true or false")
    has_default = "default" in entry
    if has_default and not _literal(entry["default"]):
        c.bad(f"{at}.default", "a string, a number, true or false")
    if path is None:
        return None
    return Var(path, kind, strict is True, entry.get("default"), has_default, nonzero is True)


def _items(c, at, entry, item_fields, ids, inherited) -> Items | None:
    if not isinstance(entry, dict):
        c.bad(at, "expected a table with each, or zip = true")
        return None
    request = _from(c, at, entry, ids, inherited)
    if entry.get("zip") is True:
        zipped = {}
        for key, value in entry.items():
            if key in ("from", "zip"):
                continue
            spec = item_fields.get(key)
            if spec is None:
                c.bad(f"{at}.{key}", "the kind has no such field")
                continue
            vat = f"{at}.{key}"
            if not isinstance(value, dict):
                c.bad(vat, "expected a table with a path")
                continue
            c.keys(vat, value, ("path", "type"), ("path",))
            path = c.path(f"{vat}.path", value.get("path"))
            kind = value.get("type", spec["type"])
            if kind not in TYPES:
                c.bad(f"{vat}.type", f"use {', '.join(TYPES)}")
            elif path is not None:
                zipped[key] = Values(request, path, kind)
        _required_items(c, at, item_fields, zipped)
        return Items(request, zipped=zipped)
    if "zip" in entry:
        c.bad(f"{at}.zip", "only zip = true")
    each = c.path(f"{at}.each", entry.get("each")) if "each" in entry else None
    if "each" not in entry:
        c.bad(f"{at}.each", "required, or zip = true")
    vars_table = entry.get("vars", {})
    variables: dict[str, Var] = {}
    if not isinstance(vars_table, dict):
        c.bad(f"{at}.vars", "expected a table")
    else:
        if len(vars_table) > MAX_VARS:
            c.bad(f"{at}.vars", f"at most {MAX_VARS} vars")
        for name, value in vars_table.items():
            if not _VAR.match(name):
                c.bad(f"{at}.vars.{name}", "1 to 24 of a-z, 0-9 and _, starting with a letter")
                continue
            var = _var(c, f"{at}.vars.{name}", value)
            if var is not None:
                variables[name] = var
    names = set(vars_table) if isinstance(vars_table, dict) else set()
    fields: dict = {}
    given = entry.get("fields", {})
    if not isinstance(given, dict):
        c.bad(f"{at}.fields", "expected a table")
        given = {}
    for key, value in given.items():
        fat = f"{at}.fields.{key}"
        if key not in item_fields:
            c.bad(fat, "the kind has no such field")
        elif isinstance(value, str):
            if value not in names:
                c.bad(fat, f"no var is named {value!r}")
            else:
                fields[key] = ("var", value)
        elif isinstance(value, dict) and set(value) == {"pick"}:
            pick = value["pick"]
            if not isinstance(pick, list) or not pick or not all(p in names for p in pick):
                c.bad(f"{fat}.pick", "a list of declared vars")
            else:
                fields[key] = ("pick", tuple(pick))
        else:
            c.bad(fat, "a var's name, or { pick = [...] }")
    for key, value in entry.items():
        if key in ("from", "each", "vars", "fields", "zip"):
            continue
        fat = f"{at}.{key}"
        if key not in item_fields:
            c.bad(fat, "the kind has no such field")
            continue
        if key in fields:
            c.bad(fat, "given in fields as well")
            continue
        cases = _cases(c, fat, value, names)
        if cases is not None:
            fields[key] = ("cases", cases)
    _required_items(c, at, item_fields, fields)
    if each is None:
        return None
    return Items(request, each, variables, fields)


def _required_items(c, at, item_fields, given) -> None:
    for key, spec in item_fields.items():
        if spec.get("required") and key not in given:
            c.bad(f"{at}.{key}", "required by the kind")


def _cases(c: _Checker, at: str, given: Any, names: set[str]) -> tuple | None:
    if not isinstance(given, list) or not given or not all(isinstance(x, dict) for x in given):
        c.bad(at, f"[[{at}]] tables, each with try")
        return None
    if len(given) > MAX_CASES:
        c.bad(at, f"at most {MAX_CASES} cases")
    out = []
    for i, case in enumerate(given[:MAX_CASES]):
        cat = f"{at}[{i}]"
        c.keys(cat, case, ("when", "try"), ("try",))
        when = case.get("when", {})
        pairs = []
        if not isinstance(when, dict):
            c.bad(f"{cat}.when", "a table of vars and the values they must equal")
        else:
            for var, value in when.items():
                if var not in names:
                    c.bad(f"{cat}.when.{var}", "not a declared var")
                elif not _literal(value):
                    c.bad(f"{cat}.when.{var}", "a string, a number, true or false")
                else:
                    pairs.append((var, value))
        tries = case.get("try", [])
        if not isinstance(tries, list) or not 1 <= len(tries) <= MAX_TRIES:
            c.bad(f"{cat}.try", f"a list of 1 to {MAX_TRIES} templates")
            continue
        templates = []
        for j, text in enumerate(tries):
            t = c.template(f"{cat}.try[{j}]", text, {"var": names})
            if t is not None:
                templates.append(t)
        out.append(Case(tuple(pairs), tuple(templates)))
    return tuple(out)
