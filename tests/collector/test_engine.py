"""The engine against a local HTTP server: the requests it builds, the checks on each reply, and
the fill built from the replies, field by field. The providers here are made in memory; the
credentials are invented for each run."""

import base64
import datetime as dt
import json
import secrets
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
            [{"request": "", "url": self.http.url + "/now", "headers": {}, "reply": {"items": []}}],
        )
        json.dumps(p.record)


if __name__ == "__main__":
    unittest.main()
