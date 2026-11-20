"""The engine against a local HTTP server: the requests it builds, the checks on each reply, and
the fill built from the replies, field by field. The providers here are made in memory; the
credentials are invented for each run."""

import base64
import datetime as dt
import json
import secrets
import threading
import unittest

from collector.net import AuthError, SourceError
from collector.providers import format as fmt
from collector.providers.engine import MAX_TEMPLATE, DataProvider
from collector.providers.path import MAX_VALUES
from kw_helpers import T0, FakeHttp

NAMES = frozenset({"count", "sessions", "sessions.title", "sessions.who", "sessions.order"})
ADBLOCK = frozenset({"blocked", "window", "window.queries", "window.blocked", "window.unit_s"})
ADBLOCK |= {"window.current"}


def provider(data, settings, credentials=None, allowed=NAMES):
    spec = fmt.check({"format": 1, "id": "test", "name": "Test", **data}, "test.toml", "test")
    return DataProvider(spec, settings, credentials or {}, 2.0, allowed)


def streams(fill, requests=None, **extra):
    return {"kind": "streams", "request": requests or [{"path": "/now"}], "fill": fill, **extra}


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.token = secrets.token_urlsafe(12) + " &=?"

    def serve(self, path, body, status=200):
        self.http.routes[path] = (status, body)

    def read(self, data, settings=None, allowed=NAMES, credentials=None):
        p = provider(data, {"url": self.http.url, **(settings or {})}, credentials, allowed)
        return p, p.read(T0)

    # Requests ----------------------------------------------------------------------------------

    def test_the_request_built(self):
        self.serve("/base/api/25/now", {"items": []})
        data = streams(
            {"sessions": {"each": "$.items[*]"}},
            [
                {
                    "path": "/api/{setting.size}/now",
                    "query": {"token": "{credential.token}", "all": "1"},
                    "headers": {"X-Token": "{credential.token}", "Accept": "application/json"},
                }
            ],
            credentials={"token": "The token."},
            settings={"size": {"type": "integer", "default": 10, "help": "Items."}},
        )
        self.read(
            data, {"url": self.http.url + "/base/", "size": 25}, credentials={"token": self.token}
        )
        ((path, headers),) = self.http.requests
        query = "token=" + self.token.replace(" ", "+").replace("&", "%26").replace("=", "%3D")
        self.assertEqual(path, "/base/api/25/now?" + query.replace("?", "%3F") + "&all=1")
        self.assertEqual(headers["X-Token"], self.token)
        self.assertEqual(headers["Accept"], "application/json")
        self.assertEqual(headers["User-Agent"], "knightwatcher")
        self.assertNotIn("Authorization", headers)

    def test_a_setting_left_out_takes_its_declared_default(self):
        self.serve("/api/10", {})
        data = streams(
            {"sessions": {"each": "$.items[*]"}},
            [{"path": "/api/{setting.size}"}],
            settings={"size": {"type": "integer", "default": 10, "help": "Items."}},
        )
        self.assertEqual(self.read(data)[1], {"sessions": []})

    def test_basic_auth_goes_with_the_first_request(self):
        self.serve("/stats", {"blocked": 5})
        data = {
            "kind": "adblock",
            "credentials": {"username": "A login.", "password": "Its password."},
            "auth": {"method": "basic", "username": "{credential.username}",
                     "password": "{credential.password}"},
            "request": [{"path": "/stats"}],
            "fill": {"blocked": {"path": "$.blocked", "required": "no count"}},
        }  # fmt: skip
        creds = {"username": "kw", "password": self.token}
        _, fill = self.read(data, allowed=ADBLOCK, credentials=creds)
        self.assertEqual(fill, {"blocked": 5})
        ((_, headers),) = self.http.requests
        expected = base64.b64encode(f"kw:{self.token}".encode()).decode()
        self.assertEqual(headers["Authorization"], "Basic " + expected)

    def test_requests_are_made_in_order_and_each_part_reads_its_own(self):
        self.serve("/a", {"n": 2})
        self.serve("/b", {"items": [{"t": "Harbour of Glass"}, {"t": "Low Tide"}]})
        data = streams(
            {
                "count": {"from": "a", "path": "$.n"},
                "sessions": {"from": "b", "each": "$.items[*]", "vars": {"t": "$.t"},
                             "fields": {}, "title": [{"try": ["{t}"]}]},
            },
            [{"id": "a", "path": "/a"}, {"id": "b", "path": "/b"}],
        )  # fmt: skip
        _, fill = self.read(data)
        self.assertEqual(
            fill, {"count": 2, "sessions": [{"title": "Harbour of Glass"}, {"title": "Low Tide"}]}
        )
        self.assertEqual([p for p, _ in self.http.requests], ["/a", "/b"])

    def test_a_credential_that_would_break_a_header_fails_the_read(self):
        self.serve("/now", {})
        data = streams(
            {"sessions": {"each": "$.x[*]"}},
            [{"path": "/now", "headers": {"X-Token": "{credential.token}"}}],
            credentials={"token": "The token."},
        )
        with self.assertRaises(SourceError) as cm:
            self.read(data, credentials={"token": "a\r\nHost: evil"})
        self.assertEqual(
            str(cm.exception), "the X-Token header would hold a character a header cannot"
        )
        self.assertEqual(self.http.requests, [])

    # Replies -----------------------------------------------------------------------------------

    def failed(self, data, error=SourceError, allowed=NAMES):
        with self.assertRaises(error) as cm:
            self.read(data, allowed=allowed)
        self.assertIs(type(cm.exception), error)
        return str(cm.exception)

    def test_statuses(self):
        statuses = {"404": "no such call: is this My Flix?", "401": "token refused by My Flix"}
        data = streams({"sessions": {"each": "$.x[*]"}}, [{"path": "/now", "statuses": statuses}])
        self.serve("/now", {}, 404)
        self.assertEqual(self.failed(data), "no such call: is this My Flix?")
        self.serve("/now", {}, 401)
        self.assertEqual(self.failed(data, AuthError), "token refused by My Flix")
        self.serve("/now", {}, 403)
        self.assertEqual(self.failed(data, AuthError), "HTTP 403: credentials refused")
        self.serve("/now", {}, 429)
        self.assertEqual(self.failed(data, AuthError), "HTTP 429: credentials refused")
        self.serve("/now", {}, 500)
        self.assertEqual(self.failed(data), "HTTP 500")

    def test_not_json(self):
        data = streams({"sessions": {"each": "$.x[*]"}})
        self.serve("/now", b"<html></html>")
        self.assertEqual(self.failed(data), "response is not JSON")
        data["request"][0]["not_json"] = "My Flix sent something other than JSON"
        self.assertEqual(self.failed(data), "My Flix sent something other than JSON")
        self.serve("/now", b"\xff\xfe\x00")
        self.assertEqual(self.failed(data), "My Flix sent something other than JSON")

    def test_nesting_and_the_number_of_values(self):
        data = streams({"sessions": {"each": "$.x[*]"}})
        deep = {}
        for _ in range(63):
            deep = {"a": deep}  # 64 levels, the innermost object among them
        self.serve("/now", deep)
        self.assertEqual(self.read(data)[1], {"sessions": []})
        self.serve("/now", {"a": deep})
        self.assertEqual(self.failed(data), "response nested too deeply")
        self.serve("/now", {"x": [{}] * (MAX_VALUES + 1)})
        self.assertEqual(self.failed(data), "a path found too many values")

    def test_require(self):
        def with_require(**require):
            return streams(
                {"sessions": {"each": "$.x[*]"}},
                [{"path": "/now", "require": [{"path": "$.status", "message": "My Flix said no",
                                               **require}]}],
            )  # fmt: skip

        for require, body, ok in (
            ({"equals": "ok"}, {"status": "ok"}, True),
            ({"equals": "ok"}, {"status": "OK"}, False),
            ({"equals": 1}, {"status": 1.0}, True),
            ({"equals": 1}, {"status": True}, False),
            ({"equals": True}, {"status": True}, True),
            ({"type": "object"}, {"status": {}}, True),
            ({"type": "list"}, {"status": {}}, False),
            ({"type": "number"}, {"status": False}, False),
            ({"type": "string"}, {"status": ""}, True),
            ({"present": True}, {"status": 0}, True),
            ({"present": True}, {"status": None}, False),
            ({"present": True}, {}, False),
        ):
            self.serve("/now", body)
            if ok:
                self.read(with_require(**require))
            else:
                self.assertEqual(self.failed(with_require(**require)), "My Flix said no", require)

    def test_a_require_that_fails_on_refused_credentials(self):
        data = streams(
            {"sessions": {"each": "$.x[*]"}},
            [{"path": "/now", "require": [{
                "path": "$.result", "equals": "success", "message": "My Flix reported an error",
                "auth": {"path": "$.message", "contains": "KEY", "ignore_case": True,
                         "message": "API key refused"}}]}],
        )  # fmt: skip
        for message, error, said in (
            ("Invalid apikey", AuthError, "API key refused"),
            ("server busy", SourceError, "My Flix reported an error"),
            (None, SourceError, "My Flix reported an error"),
            ({"key": 1}, SourceError, "My Flix reported an error"),
        ):
            self.serve("/now", {"result": "error", "message": message})
            self.assertEqual(self.failed(data, error), said)
        data["request"][0]["require"][0]["auth"] = {
            "path": "$.result", "equals": "invalid-token", "message": "token refused"}  # fmt: skip
        self.serve("/now", {"result": "invalid-token"})
        self.assertEqual(self.failed(data, AuthError), "token refused")
        self.serve("/now", {"result": "Invalid-Token"})
        self.assertEqual(self.failed(data), "My Flix reported an error")

    # The fill ----------------------------------------------------------------------------------

    def test_scalars(self):
        data = {
            "kind": "adblock",
            "request": [{"path": "/stats"}],
            "fill": {
                "blocked": {"path": "$.blocked", "required": "no blocked count"},
                "window": {"unit_s": {"path": "$.units", "map": {"hours": 3600, "days": 86400}},
                           "current": True},
            },
        }  # fmt: skip
        for blocked, want in (
            (5, 5),
            ("12", 12),
            (" 7 ", 7),
            (3.9, 3),
            (-2.5, -2),
            (True, 1),
            ("1_000", 1000),
        ):
            self.serve("/stats", {"blocked": blocked, "units": "hours"})
            fill = self.read(data, allowed=ADBLOCK)[1]
            self.assertEqual(fill["blocked"], want, blocked)
            self.assertEqual(fill["window"], {"unit_s": 3600, "current": True})
        for blocked in ("many", "3.5", None, [1], {"n": 1}, 1e400):
            self.serve("/stats", {"blocked": blocked})
            self.assertEqual(self.failed(data, allowed=ADBLOCK), "no blocked count", blocked)
        self.serve("/stats", [])
        self.assertEqual(self.failed(data, allowed=ADBLOCK), "no blocked count")
        # A value not in the map is nothing found, and a required field of an object missing
        # leaves the object out.
        for units in ("weeks", 3600, None):
            self.serve("/stats", {"blocked": 1, "units": units})
            self.assertEqual(self.read(data, allowed=ADBLOCK)[1], {"blocked": 1})
        data["fill"]["blocked"] = {"path": "$.blocked", "type": "int", "strict": True, "default": 0}
        for blocked, want in ((5, 5), ("5", 0), (True, 0), (5.0, 0)):
            self.serve("/stats", {"blocked": blocked, "units": "days"})
            self.assertEqual(self.read(data, allowed=ADBLOCK)[1]["blocked"], want, blocked)

    def test_lists_of_numbers(self):
        data = {
            "kind": "adblock",
            "request": [{"path": "/stats"}],
            "fill": {
                "blocked": {"path": "$.blocked", "required": "x"},
                "window": {"queries": {"path": "$.q[*]"}, "blocked": {"path": "$.b[*]"},
                           "unit_s": 600, "current": False},
            },
        }  # fmt: skip
        for q, want in (
            ([1, 2.5, 0], [1, 2.5, 0]),
            ([], None),
            ([1, "2"], None),
            ([True, 1], None),
            ("12", None),
            (None, None),
        ):
            self.serve("/stats", {"blocked": 1, "q": q, "b": [4]})
            window = self.read(data, allowed=ADBLOCK)[1]["window"]
            self.assertEqual(window.get("queries"), want, q)
            self.assertEqual(window["blocked"], [4])

    def test_times(self):
        from collector.providers.engine import convert

        utc = dt.UTC
        self.assertEqual(
            convert("2026-01-15T21:00:00Z", "time"), dt.datetime(2026, 1, 15, 21, tzinfo=utc)
        )
        self.assertEqual(
            convert("2026-01-15T21:00:00", "time"), dt.datetime(2026, 1, 15, 21, tzinfo=utc)
        )
        self.assertEqual(
            convert("2026-01-15T22:00:00+01:00", "time").astimezone(utc),
            dt.datetime(2026, 1, 15, 21, tzinfo=utc),
        )
        self.assertEqual(convert(1768510800, "time"), dt.datetime(2026, 1, 15, 21, tzinfo=utc))
        from collector.providers.engine import _ABSENT

        for bad in ("yesterday", True, [], 1e300):
            self.assertIs(convert(bad, "time"), _ABSENT, bad)

    def sessions(self, items, vars_, fields=None, title=None, allowed=NAMES):
        entry = {"each": "$.items[*]", "vars": vars_, "fields": fields or {}}
        if title is not None:
            entry["title"] = title
        self.serve("/now", {"items": items})
        p, fill = self.read(streams({"sessions": entry}), allowed=allowed)
        return p, fill["sessions"]

    def test_items_vars_and_fields(self):
        items = [
            {"user": "Robin", "alt": "R", "key": 3, "name": "Harbour of Glass"},
            {"user": " \t", "alt": "Sam", "key": "4"},
            {"user": None, "key": 0},
            "not an item",
            7,
            {"alt": ""},
        ]
        _, got = self.sessions(
            items,
            {"user": {"path": "$.user", "type": "string"}, "alt": "$.alt", "key": "$.key",
             "name": "$.name"},
            {"who": {"pick": ["user", "alt"]}, "order": "key"},
            [{"try": ["{name}"]}],
        )  # fmt: skip
        self.assertEqual(
            got,
            [
                {"who": "Robin", "order": 3, "title": "Harbour of Glass"},
                {"who": "Sam", "order": "4"},
                {"order": 0},
                {},
            ],
        )

    def test_cases_and_templates(self):
        items = [
            {"kind": "episode", "show": "The Lantern Keepers", "s": "1", "e": 3},
            {"kind": "episode", "s": 2, "e": "11"},
            {"kind": "episode", "show": "Brine", "s": "x"},
            {"kind": "episode"},
            {"kind": "track", "show": "Fen Owls", "name": "Low Tide"},
            {"kind": "movie", "name": 1917},
            {"kind": "movie", "name": 0, "full": "Whole"},
            {"kind": "movie", "name": "  ", "full": "Whole"},
            {"kind": "movie", "name": [1], "full": "Whole"},
            {"name": "{braces}"},
            {"kind": "episode", "show": "-", "s": -1, "e": 123},
        ]
        _, got = self.sessions(
            items,
            {"kind": "$.kind", "show": {"path": "$.show", "type": "string"},
             "s": {"path": "$.s", "type": "int"}, "e": {"path": "$.e", "type": "int"},
             "name": {"path": "$.name", "nonzero": True}, "full": "$.full"},
            {},
            [
                {"when": {"kind": "episode"},
                 "try": ["{show} S{s:02}E{e:02}", "S{s:02}E{e:02}", "{show}"]},
                {"when": {"kind": "track"}, "try": ["{show} - {name}"]},
                {"try": ["{name}", "{full}", "{{{name}}}"]},
            ],
        )  # fmt: skip
        self.assertEqual(
            [s.get("title") for s in got],
            [
                "The Lantern Keepers S01E03",
                "S02E11",
                "Brine",
                None,  # the case matched and none of its templates gave a value
                "Fen Owls - Low Tide",
                "1917",
                "Whole",
                "Whole",
                "Whole",
                "{braces}",
                "- S-1E123",
            ],
        )

    def test_a_template_is_cut_at_its_limit(self):
        _, got = self.sessions(
            [{"name": "x" * 2000}], {"name": "$.name"}, {}, [{"try": ["{name}!"]}]
        )
        self.assertEqual(got[0]["title"], "x" * MAX_TEMPLATE)

    def test_vars_are_read_only_for_the_fields_allowed(self):
        items = [{"user": "Robin", "key": "1", "name": "A"}, {"user": "Sam", "key": "2"}]
        spec = (
            {"user": "$.user", "key": "$.key", "name": "$.name"},
            {"who": {"pick": ["user"]}, "order": "key"},
            [{"try": ["{name}"]}],
        )
        p, got = self.sessions(items, *spec)
        self.assertEqual(p.reads, {"user": 2, "key": 2, "name": 2})
        p, got = self.sessions(items, *spec, allowed=NAMES - {"sessions.who"})
        self.assertEqual(got, [{"order": "1", "title": "A"}, {"order": "2"}])
        self.assertEqual(p.reads, {"key": 2, "name": 2})
        p, got = self.sessions(items, *spec, allowed=frozenset({"count", "sessions"}))
        self.assertEqual(got, [{}, {}])
        self.assertEqual(p.reads, {})

    def test_an_item_without_a_required_field_is_left_out(self):
        self.serve("/imports", {"records": [{"id": 1}, {"id": "2"}, {"id": True}, {}, {"id": 3}]})
        data = {
            "kind": "imports",
            "request": [{"path": "/imports"}],
            "fill": {"records": {"each": "$.records[*]",
                                 "vars": {"id": {"path": "$.id", "type": "int", "strict": True}},
                                 "fields": {"id": "id"}}},
        }  # fmt: skip
        fill = self.read(data, allowed=frozenset({"records", "records.id", "records.title"}))[1]
        self.assertEqual(fill, {"records": [{"id": 1}, {"id": 3}]})

    def test_zipped_lists(self):
        data = streams(
            {"sessions": {"zip": True, "title": {"path": "$.titles[*]"},
                          "order": {"path": "$.keys[*]", "type": "int"}}},
        )  # fmt: skip
        self.serve("/now", {"titles": ["A", "B"], "keys": [2, "x"]})
        self.assertEqual(
            self.read(data)[1], {"sessions": [{"title": "A", "order": 2}, {"title": "B"}]}
        )
        self.serve("/now", {"titles": ["A", "B"], "keys": [2]})
        self.assertEqual(self.failed(data), "the lists of sessions differ in length")
        self.serve("/now", {})
        self.assertEqual(self.read(data)[1], {"sessions": []})

    def test_the_exchanges_are_recorded_when_asked(self):
        self.serve("/now", {"items": []})
        p = provider(streams({"sessions": {"each": "$.items[*]"}}), {"url": self.http.url}, None)
        p.record = []
        p.read(T0)
        self.assertEqual(
            p.record,
            [
                {
                    "request": "",
                    "method": "GET",
                    "url": self.http.url + "/now",
                    "headers": {},
                    "reply": {"items": []},
                }
            ],
        )
        json.dumps(p.record)

    def test_a_certificate_is_checked_unless_verify_tls_is_false(self):
        https = FakeHttp(tls=True)
        self.addCleanup(https.close)
        https.routes["/now"] = (200, {"items": []})
        data = streams({"sessions": {"each": "$.items[*]"}})
        with self.assertRaises(SourceError) as cm:
            provider(data, {"url": https.url}).read(T0)
        self.assertEqual(str(cm.exception), "TLS error")
        self.assertEqual(https.requests, [])
        fill = provider(data, {"url": https.url, "verify_tls": False}).read(T0)
        self.assertEqual(fill, {"sessions": []})
        self.assertEqual(len(https.requests), 1)


SID = "Zm9vYmFyYmF6cXV4cXV1eA="


def session_file(**auth):
    """An adblock provider that logs in by session, as the Pi-hole file does."""
    return {
        "kind": "adblock",
        "credentials": {"password": "Its password."},
        "auth": {
            "method": "session",
            "login": {"path": "/api/auth", "json": {"password": "{credential.password}"}},
            "sid": "$.session.sid",
            "valid_s": "$.session.validity",
            "send": {"header": "X-FTL-SID"},
            "logout": {"path": "/api/auth"},
            **auth,
        },
        "request": [{"path": "/stats"}],
        "fill": {"blocked": {"path": "$.blocked", "required": "no count"}},
    }


def sid_of(headers):
    """The session id a request carried: header names arrive in another case than sent."""
    return {k.lower(): v for k, v in headers.items()}.get("x-ftl-sid")


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class SessionTest(unittest.TestCase):
    """[auth] method = "session": the login, the session reused, made again, refused and ended."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.password = secrets.token_urlsafe(12)
        self.sids = []
        self.validity = 1800
        self.known: set[str] = set()

        def login(handler):
            sid = f"{SID[:-1]}{len(self.sids)}"
            self.sids.append(sid)
            self.known.add(sid)
            return {"session": {"valid": True, "sid": sid, "validity": self.validity}}

        def stats(handler):
            if handler.headers.get("X-FTL-SID") not in self.known:
                handler.send_response(401)
                handler.send_header("Content-Length", "2")
                handler.end_headers()
                handler.wfile.write(b"{}")
                return None
            return {"blocked": 7}

        self.http.routes["POST /api/auth"] = (200, login)
        self.http.routes["DELETE /api/auth"] = (204, None)
        self.http.routes["/stats"] = (200, stats)
        self.clock = Clock()

    def make(self, data=None, settings=None):
        data = data or session_file()
        p = provider(data, {"url": self.http.url, **(settings or {})}, {"password": self.password},
                     ADBLOCK)  # fmt: skip
        p.clock = self.clock
        return p

    def methods(self):
        return [(m, path) for m, path, _, _ in self.http.calls]

    def test_one_login_then_the_session_with_every_read(self):
        p = self.make()
        for _ in range(3):
            self.assertEqual(p.read(T0), {"blocked": 7})
            self.clock.now += 30
        self.assertEqual(
            self.methods(),
            [("POST", "/api/auth"), ("GET", "/stats"), ("GET", "/stats"), ("GET", "/stats")],
        )
        _, _, headers, body = self.http.calls[0]
        self.assertEqual(body, {"password": self.password})
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertIsNone(sid_of(headers))
        for _, _, headers, body in self.http.calls[1:]:
            self.assertEqual(sid_of(headers), self.sids[0])
            self.assertIsNone(body)

    def test_the_session_is_sent_in_the_query_when_the_file_says(self):
        p = self.make(session_file(send={"query": "sid"}))
        self.known.add(None)  # the fake reads the header; here it is the query that carries it
        p.read(T0)
        self.assertEqual(self.http.requests[0][0], "/stats?sid=" + SID[:-1] + "0")

    def test_a_session_near_its_end_is_made_again(self):
        p = self.make()
        p.read(T0)
        # Used 30 s before its end at the latest; each use counts its lifetime from then.
        self.clock.now += 1800 - 31
        p.read(T0)
        self.clock.now += 1800 - 31
        p.read(T0)
        self.assertEqual(len(self.sids), 1)
        self.clock.now += 1800 - 29
        p.read(T0)
        self.assertEqual(len(self.sids), 2)
        self.assertEqual(sid_of(self.http.calls[-1][2]), self.sids[1])

    def test_a_short_session_is_used_for_half_its_life(self):
        self.validity = 40
        p = self.make()
        p.read(T0)
        self.clock.now += 19
        p.read(T0)
        self.clock.now += 21
        p.read(T0)
        self.assertEqual(len(self.sids), 2)

    def test_a_login_with_no_lifetime_keeps_its_session(self):
        p = self.make(session_file(valid_s="$.session.nothing"))
        p.read(T0)
        self.clock.now += 10**7
        p.read(T0)
        self.assertEqual(len(self.sids), 1)

    def test_a_session_the_service_forgot_is_made_again_once_in_the_same_read(self):
        p = self.make()
        p.read(T0)
        self.known.clear()  # the service restarted
        self.assertEqual(p.read(T0), {"blocked": 7})
        self.assertEqual(
            self.methods()[1:],
            [("GET", "/stats"), ("GET", "/stats"), ("POST", "/api/auth"), ("GET", "/stats")],
        )
        self.assertEqual(sid_of(self.http.calls[-1][2]), self.sids[1])

    def test_a_new_session_refused_is_refused_credentials_and_not_tried_again(self):
        p = self.make()
        self.http.routes["/stats"] = (401, {})
        with self.assertRaises(AuthError) as cm:
            p.read(T0)
        self.assertEqual(cm.exception.status, 401)
        self.assertEqual(self.methods(), [("POST", "/api/auth"), ("GET", "/stats")])
        # The session is dropped: the next read logs in afresh.
        self.http.routes["/stats"] = (200, {"blocked": 1})
        p.read(T0)
        self.assertEqual(len(self.sids), 2)

    def test_a_second_401_after_logging_in_again_is_refused_credentials(self):
        p = self.make()
        p.read(T0)
        self.http.routes["/stats"] = (401, {})
        with self.assertRaises(AuthError):
            p.read(T0)
        self.assertEqual(
            self.methods()[2:], [("GET", "/stats"), ("POST", "/api/auth"), ("GET", "/stats")]
        )

    def test_a_refused_login_is_refused_credentials_with_the_files_words(self):
        for status, said in ((401, "password refused"), (429, "too many logins")):
            self.http.routes["POST /api/auth"] = (status, {"session": {"valid": False}})
            p = self.make(session_file(statuses={"401": "password refused",
                                                 "429": "too many logins"}))  # fmt: skip
            with self.assertRaises(AuthError) as cm:
                p.read(T0)
            self.assertEqual((str(cm.exception), cm.exception.status), (said, status))
        self.assertNotIn(("GET", "/stats"), self.methods())

    def test_a_login_not_found_or_not_json_takes_the_files_words(self):
        old = "not version 6 (version 5 is not supported)"
        data = session_file(statuses={"404": old}, not_json=old)
        self.http.routes["POST /api/auth"] = (404, b"<html>Not Found</html>")
        with self.assertRaises(SourceError) as cm:
            self.make(data).read(T0)
        self.assertEqual(str(cm.exception), old)
        self.assertNotIsInstance(cm.exception, AuthError)
        self.http.routes["POST /api/auth"] = (200, b"<html>admin</html>")
        with self.assertRaises(SourceError) as cm:
            self.make(data).read(T0)
        self.assertEqual(str(cm.exception), old)

    def test_a_login_with_no_session_id(self):
        for sid in (None, "", 7, "has space", "x" * 513):
            self.http.routes["POST /api/auth"] = (200, {"session": {"valid": True, "sid": sid}})
            with self.assertRaises(SourceError) as cm:
                self.make().read(T0)
            self.assertEqual(str(cm.exception), "the login gave no session id", sid)
        require = [{"path": "$.session.sid", "type": "string", "message": "no password set"}]
        self.http.routes["POST /api/auth"] = (200, {"session": {"valid": True, "sid": None}})
        with self.assertRaises(SourceError) as cm:
            self.make(session_file(require=require)).read(T0)
        self.assertEqual(str(cm.exception), "no password set")
        self.assertNotIn(("GET", "/stats"), self.methods())

    def test_the_login_body_holds_settings_numbers_and_tables(self):
        data = session_file(login={"path": "/api/auth", "json": {
            "user": {"name": "{setting.who}", "secret": "{credential.password}"},
            "remember": True, "tries": 1}})  # fmt: skip
        data["settings"] = {"who": {"type": "string", "default": "kw", "help": "Who."}}
        self.make(data).read(T0)
        self.assertEqual(
            self.http.calls[0][3],
            {"user": {"name": "kw", "secret": self.password}, "remember": True, "tries": 1},
        )

    def test_close_logs_out_once_and_reads_no_more(self):
        p = self.make()
        p.read(T0)
        p.close()
        p.close()
        self.assertEqual(self.methods()[-1], ("DELETE", "/api/auth"))
        self.assertEqual(sid_of(self.http.calls[-1][2]), self.sids[0])
        self.assertEqual(self.methods().count(("DELETE", "/api/auth")), 1)
        with self.assertRaises(SourceError) as cm:
            p.read(T0)
        self.assertEqual(str(cm.exception), "provider closed")

    def test_close_without_a_session_or_a_logout_sends_nothing(self):
        self.make().close()
        data = session_file()
        del data["auth"]["logout"]
        p = self.make(data)
        p.read(T0)
        p.close()
        self.make(data).close()
        self.assertNotIn("DELETE", [m for m, _ in self.methods()])
        p = self.make()
        p.read(T0)
        self.clock.now += 1800  # expired: nothing to end
        p.close()
        self.assertNotIn("DELETE", [m for m, _ in self.methods()])

    def test_a_logout_that_fails_is_left_alone(self):
        p = self.make()
        p.read(T0)
        self.http.routes["DELETE /api/auth"] = (500, {})
        p.close()
        self.http.close()
        q = self.make()
        q._sid, q._until = "x", self.clock.now + 60
        q.close()  # nothing answers: no error either

    def test_close_during_a_read_logs_out_when_the_read_ends(self):
        p = self.make()
        p.read(T0)
        started, release = threading.Event(), threading.Event()

        def slow(handler):
            started.set()
            release.wait(5)
            return {"blocked": 8}

        self.http.routes["/stats"] = (200, slow)
        out = {}
        reader = threading.Thread(target=lambda: out.update(fill=p.read(T0)))
        reader.start()
        self.assertTrue(started.wait(5))
        p.close()
        self.assertNotIn(("DELETE", "/api/auth"), self.methods())
        release.set()
        reader.join(5)
        self.assertEqual(out["fill"], {"blocked": 8})
        self.assertEqual(self.methods()[-1], ("DELETE", "/api/auth"))

    def test_the_recording_names_the_session_and_masks_the_login(self):
        p = self.make()
        p.record = []
        p.read(T0)
        p.close()
        text = json.dumps(p.record)
        self.assertNotIn(self.sids[0], text)
        self.assertNotIn(self.password, text)
        login, read, logout = p.record
        self.assertEqual(
            (login["request"], login["method"], login["json"]),
            ("auth.login", "POST", {"password": "{credential.password}"}),
        )
        self.assertEqual(
            login["reply"], {"session": {"valid": True, "sid": "<string 23>", "validity": 1800}}
        )
        self.assertEqual(read["headers"], {"X-FTL-SID": "{session.sid}"})
        self.assertEqual(
            (logout["request"], logout["method"], logout["headers"]),
            ("auth.logout", "DELETE", {"X-FTL-SID": "{session.sid}"}),
        )
        q = self.make(session_file(send={"query": "sid"}))
        self.known.add(None)
        q.record = []
        q.read(T0)
        self.assertTrue(q.record[1]["url"].endswith("/stats?sid={session.sid}"))


if __name__ == "__main__":
    unittest.main()
