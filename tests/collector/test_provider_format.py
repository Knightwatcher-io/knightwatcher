"""The provider file format: each rule held to a refused file, with its message, and the built-in
files passing. One valid file is changed in one way for each case."""

import copy
import os
import tempfile
import tomllib
import unittest

from collector import providers
from collector.providers import format as fmt

VALID_TOML = """
format = 1
id = "myflix"
kind = "streams"
name = "My Flix"
docs = "https://example.com/api"

[credentials]
token = "The server's token."

[settings]
page_size = { type = "integer", default = 10, min = 1, max = 50, help = "Records read per call." }

[[request]]
id = "now"
path = "/api/{setting.page_size}/now"
query = { token = "{credential.token}", all = "1" }
headers = { Accept = "application/json", X-Flix-Token = "{credential.token}" }
statuses = { 404 = "no such call: is this My Flix?" }
not_json = "My Flix sent something other than JSON"

[[request.require]]
path = "$.ok"
equals = true
message = "My Flix reported an error"
auth = { path = "$.error", contains = "token", ignore_case = true, message = "token refused" }

[fill]
count = { from = "now", path = "$.count", type = "int" }

[fill.sessions]
from = "now"
each = "$.playing[?@.kind]"

[fill.sessions.vars]
kind = "$.kind"
show = { path = "$.show", type = "string" }
season = { path = "$.season", type = "int", default = 0 }
name = { path = "$.name", nonzero = true }
user = "$.user"
key = "$.key"

[fill.sessions.fields]
who = { pick = ["user"] }
order = "key"

[[fill.sessions.title]]
when = { kind = "episode" }
try = ["{show} S{season:02}", "{show}"]

[[fill.sessions.title]]
try = ["{name}", "{{literal}} {name}"]
"""
VALID = tomllib.loads(VALID_TOML)


def check(data, expect="myflix"):
    return fmt.check(data, "myflix.toml", expect)


def with_session():
    """The valid file, logging in by session."""
    data = copy.deepcopy(VALID)
    data["auth"] = {
        "method": "session",
        "login": {"path": "/login", "json": {"password": "{credential.token}", "keep": True}},
        "sid": "$.session.id",
        "valid_s": "$.session.seconds",
        "send": {"header": "X-Session"},
        "logout": {"path": "/login"},
        "statuses": {"404": "not My Flix"},
        "not_json": "not My Flix",
        "require": [{"path": "$.session.id", "type": "string", "message": "no session"}],
    }
    return data


class BuiltInTest(unittest.TestCase):
    def test_the_built_in_files_pass(self):
        found = providers.builtin()
        files = {p: s for p, s in found.items() if not isinstance(s, providers.Adapter)}
        self.assertEqual(
            sorted(files),
            ["adguard", "pihole", "plex", "radarr", "sonarr", "tautulli", "technitium"],
        )
        for pid, spec in files.items():
            self.assertEqual(spec.id, pid)
            self.assertEqual(len(spec.digest), 20)
        # The code adapters are listed beside them.
        self.assertEqual(sorted(set(found) - set(files)), ["fail2ban"])
        self.assertEqual(list(found), sorted(found))

    def test_a_valid_file_compiles(self):
        spec = check(VALID)
        self.assertEqual((spec.id, spec.kind, spec.name), ("myflix", "streams", "My Flix"))
        self.assertEqual(list(spec.credentials), ["token"])
        self.assertEqual(spec.requests[0].statuses, {404: "no such call: is this My Flix?"})
        items = spec.fill["sessions"]
        self.assertEqual(sorted(items.vars), ["key", "kind", "name", "season", "show", "user"])
        self.assertEqual(items.fields["who"], ("pick", ("user",)))
        self.assertEqual(items.fields["order"], ("var", "key"))
        self.assertEqual(items.fields["title"][0], "cases")

    def test_load_reads_a_file_and_checks_its_size_and_toml(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "myflix.toml")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(VALID_TOML)
            self.assertEqual(providers.load(path, "myflix").id, "myflix")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(VALID_TOML + "#" * fmt.MAX_FILE)
            with self.assertRaises(fmt.FormatError) as cm:
                providers.load(path, "myflix")
            self.assertEqual(cm.exception.problems, ["myflix.toml: larger than 64 KiB"])
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("format = \n")
            with self.assertRaises(fmt.FormatError) as cm:
                providers.load(path)
            self.assertTrue(cm.exception.problems[0].startswith("myflix.toml: "))


class RefusedTest(unittest.TestCase):
    def refused(self, change, problem, base=VALID):
        data = copy.deepcopy(base)
        change(data)
        with self.assertRaises(fmt.FormatError) as cm:
            check(data)
        self.assertIn("myflix.toml: " + problem, cm.exception.problems)

    # The top level

    def test_top_level(self):
        self.refused(lambda d: d.update(format=2), "format: must be 1")
        self.refused(
            lambda d: d.update(id="My-Flix"),
            "id: 1 to 24 of a-z, 0-9 and _, starting with a letter",
        )
        self.refused(lambda d: d.update(id="other"), 'id: must be "myflix", the file\'s name')
        self.refused(
            lambda d: d.update(kind="weather"),
            "kind: unknown kind 'weather'; use streams, adblock, imports, security",
        )
        self.refused(lambda d: d.pop("name"), "name: required")
        self.refused(lambda d: d.update(name="x\ny"), "name: at most 60 printable characters")
        self.refused(lambda d: d.update(docs="ftp://x"), "docs: an http:// or https:// address")
        self.refused(lambda d: d.update(code="print(1)"), "code: unknown field")
        self.refused(lambda d: d.pop("request"), "request: required")
        self.refused(lambda d: d.pop("fill"), "fill: required")

    def test_credentials_and_settings(self):
        self.refused(
            lambda d: d["credentials"].update(cookie="x"),
            "credentials.cookie: use api_key, token, username, password, header",
        )
        self.refused(
            lambda d: d["settings"].update(url={"type": "string", "default": "", "help": "x"}),
            "settings.url: taken by the section's own settings",
        )
        self.refused(
            lambda d: d["settings"].update(depth={"type": "list", "default": [], "help": "x"}),
            "settings.depth.type: use string, integer, number, boolean",
        )
        self.refused(
            lambda d: d["settings"]["page_size"].update(default="10"),
            "settings.page_size.default: expected integer",
        )
        self.refused(
            lambda d: d["settings"]["page_size"].pop("help"), "settings.page_size.help: required"
        )

    def test_auth(self):
        self.refused(
            lambda d: d.update(auth={"method": "digest"}), 'auth.method: use "basic" or "session"'
        )
        self.refused(
            lambda d: d.update(
                auth={"method": "basic", "username": "{credential.user}", "password": "x"}
            ),
            "auth.username: {credential.user} is not declared",
        )
        self.refused(
            lambda d: (
                d.update(auth={"method": "basic", "username": "x", "password": "x"}),
                d["request"][0]["headers"].update(Authorization="x"),
            ),
            "request[0].headers.Authorization: [auth] sets this header",
        )

    def test_a_session(self):
        spec = check(with_session())
        auth = spec.auth
        self.assertIsInstance(auth, fmt.Session)
        self.assertEqual((auth.header, auth.query, auth.login.text), ("X-Session", None, "/login"))
        self.assertEqual(auth.body_text, {"password": "{credential.token}", "keep": True})
        self.assertEqual(auth.statuses, {404: "not My Flix"})
        session = lambda d: d["auth"]  # noqa: E731
        r = lambda change, problem: self.refused(change, problem, with_session())  # noqa: E731
        for key in ("login", "sid", "send"):
            r(lambda d, k=key: session(d).pop(k), f"auth.{key}: required")
        r(lambda d: session(d).update(body="x"), "auth.body: unknown field")
        r(
            lambda d: session(d).update(login="/login"),
            "auth.login: expected a table with path and json",
        )
        r(lambda d: session(d)["login"].pop("json"), "auth.login.json: required")
        r(
            lambda d: session(d)["login"].update(path="https://evil.example/login"),
            "auth.login.path: must start with /",
        )
        r(
            lambda d: session(d)["login"].update(path="/{credential.token}"),
            "auth.login.path: a credential may be used only in a request's query or headers, "
            "or in [auth]",
        )
        r(
            lambda d: session(d)["login"]["json"].update(user="{credential.username}"),
            "auth.login.json.user: {credential.username} is not declared",
        )
        r(
            lambda d: session(d)["login"]["json"].update(list=[1]),
            "auth.login.json.list: text, a number, true or false, or a table",
        )
        r(
            lambda d: session(d)["login"]["json"].update(a={"b": {"c": {"d": {"e": "x"}}}}),
            "auth.login.json.a.b.c.d: tables nested at most 4 deep",
        )
        r(
            lambda d: session(d)["login"]["json"].update({f"k{i}": i for i in range(16)}),
            "auth.login.json: at most 16 members in the body",
        )
        r(lambda d: session(d).update(sid="$..sid"), 'auth.sid: unexpected ".." at character 2')
        r(
            lambda d: session(d).update(send={"header": "X-A", "query": "a"}),
            "auth.send: a table of one: header or query",
        )
        r(lambda d: session(d).update(send={"cookie": "sid"}), "auth.send.cookie: unknown field")
        r(
            lambda d: session(d).update(send={"header": "Cookie"}),
            "auth.send.header: this header cannot be set",
        )
        r(
            lambda d: session(d).update(send={"header": "X Bad"}),
            "auth.send.header: a header's name is letters, digits and -",
        )
        r(
            lambda d: session(d).update(send={"query": ""}),
            "auth.send.query: a name of printable ASCII",
        )
        r(
            lambda d: d["request"][0]["headers"].update({"x-session": "x"}),
            "request[0].headers.x-session: [auth] sends the session in this header",
        )
        r(
            lambda d: session(d).update(send={"query": "all"}),
            "request[0].query.all: [auth] sends the session in this parameter",
        )
        r(lambda d: session(d).update(logout="/logout"), "auth.logout: expected a table with path")
        r(
            lambda d: session(d).update(logout={"path": "/x", "method": "POST"}),
            "auth.logout.method: unknown field",
        )
        r(
            lambda d: session(d)["statuses"].update({"600": "x"}),
            "auth.statuses.600: an HTTP status, from 100 to 599",
        )
        r(
            lambda d: session(d).update(require=[{"path": "$.ok"}]),
            "auth.require[0]: give exactly one of equals, type or present",
        )
        r(lambda d: session(d).update(not_json=""), "auth.not_json: expected text")
        r(
            lambda d: d["settings"].update(
                verify_tls={"type": "boolean", "default": True, "help": "x"}
            ),
            "settings.verify_tls: taken by the section's own settings",
        )

    # Requests

    def test_requests(self):
        self.refused(lambda d: d.update(request=[]), "request: one to three [[request]] tables")
        self.refused(
            lambda d: d["request"].extend(copy.deepcopy(d["request"]) * 3),
            "request: at most 3 requests",
        )
        self.refused(
            lambda d: d["request"].append(copy.deepcopy(d["request"][0])),
            'request[1].id: "now" is the id of an earlier request',
        )
        self.refused(
            lambda d: d["request"].append({"path": "/b"}),
            "request[1].id: required when there is more than one request",
        )
        self.refused(
            lambda d: d["request"][0].update(method="POST"), "request[0].method: unknown field"
        )
        self.refused(lambda d: d["request"][0].update(body="x"), "request[0].body: unknown field")

    def test_paths_hold_no_address(self):
        for path, why in (
            ("api", "must start with /"),
            ("//evil.example/x", "a path alone, with no address in it"),
            ("/x?u=http://evil.example", "a path alone, with no address in it"),
            ("/x\\y", "printable ASCII, with no space, \\, @, ? or #; give the query in query"),
            (
                "/user@host",
                "printable ASCII, with no space, \\, @, ? or #; give the query in query",
            ),
            ("/x?a=1", "printable ASCII, with no space, \\, @, ? or #; give the query in query"),
            ("/x y", "printable ASCII, with no space, \\, @, ? or #; give the query in query"),
            ("/x\ny", "printable ASCII, with no space, \\, @, ? or #; give the query in query"),
        ):
            self.refused(
                lambda d, p=path: d["request"][0].update(path=p), f"request[0].path: {why}"
            )
        self.refused(
            lambda d: d["request"][0].update(path="/{credential.token}"),
            "request[0].path: " + fmt.CREDENTIAL_PLACES,
        )

    def test_headers(self):
        for name in (
            "Host",
            "content-length",
            "Transfer-Encoding",
            "Connection",
            "Cookie",
            "Proxy-Authorization",
            "Proxy-Anything",
            "User-Agent",
        ):
            self.refused(
                lambda d, n=name: d["request"][0]["headers"].update({n: "x"}),
                f"request[0].headers.{name}: this header cannot be set",
            )
        self.refused(
            lambda d: d["request"][0]["headers"].update({"X Bad": "x"}),
            "request[0].headers.X Bad: a header's name is letters, digits and -",
        )
        self.refused(
            lambda d: d["request"][0]["headers"].update({"X-Line": "a\r\nHost: evil"}),
            "request[0].headers.X-Line: printable ASCII alone",
        )
        self.refused(
            lambda d: d["request"][0]["headers"].update({"accept": "x"}),
            "request[0].headers.accept: the same header twice",
        )
        self.refused(
            lambda d: d["request"][0]["headers"].update({"X-A": "{setting.nope}"}),
            "request[0].headers.X-A: {setting.nope} is not declared",
        )

    def test_statuses_and_not_json(self):
        self.refused(
            lambda d: d["request"][0]["statuses"].update({"999": "x"}),
            "request[0].statuses.999: an HTTP status, from 100 to 599",
        )
        self.refused(
            lambda d: d["request"][0]["statuses"].update({"500": ""}),
            "request[0].statuses.500: expected text",
        )
        self.refused(
            lambda d: d["request"][0].update(not_json="x" * 81),
            "request[0].not_json: at most 80 printable characters",
        )

    def test_require(self):
        req = lambda d: d["request"][0]["require"][0]  # noqa: E731
        self.refused(
            lambda d: req(d).update(type="object"),
            "request[0].require[0]: give exactly one of equals, type or present",
        )
        self.refused(
            lambda d: req(d).pop("equals"),
            "request[0].require[0]: give exactly one of equals, type or present",
        )
        self.refused(
            lambda d: req(d).update(equals=[1]),
            "request[0].require[0].equals: a string, a number, true or false",
        )
        self.refused(
            lambda d: (req(d).pop("equals"), req(d).update(type="array")),
            "request[0].require[0].type: use object, list, string, number",
        )
        self.refused(
            lambda d: (req(d).pop("equals"), req(d).update(present=False)),
            "request[0].require[0].present: only present = true",
        )
        self.refused(lambda d: req(d).pop("message"), "request[0].require[0].message: required")
        self.refused(
            lambda d: req(d).update(path="$..ok"),
            'request[0].require[0].path: unexpected ".." at character 2',
        )
        self.refused(
            lambda d: req(d)["auth"].update(equals="x"),
            "request[0].require[0].auth: give exactly one of contains or equals",
        )
        self.refused(
            lambda d: (req(d)["auth"].pop("contains"), req(d)["auth"].update(equals="x")),
            "request[0].require[0].auth.ignore_case: goes with contains",
        )
        self.refused(
            lambda d: req(d)["auth"].pop("message"), "request[0].require[0].auth.message: required"
        )

    # The fill

    def test_fill_fields(self):
        self.refused(
            lambda d: d["fill"].update(rate={"path": "$.r"}),
            "fill.rate: the kind has no such field",
        )
        self.refused(lambda d: d["fill"].pop("sessions"), "fill.sessions: required by the kind")
        self.refused(
            lambda d: d["fill"]["count"].update(type="integer"),
            "fill.count.type: use int, number, string, bool, time, raw",
        )
        self.refused(
            lambda d: d["fill"]["count"].update(strict="yes"),
            "fill.count.strict: true or false, with type int",
        )
        self.refused(
            lambda d: d["fill"]["count"].update(default="3"), "fill.count.default: must be int"
        )
        self.refused(
            lambda d: d["fill"]["count"].update(default=1, required="x"),
            "fill.count.required: a field with a default is never missing",
        )
        self.refused(
            lambda d: d["fill"]["count"].update(map=[1]),
            "fill.count.map: a table of values found to values used",
        )
        self.refused(
            lambda d: d["fill"]["count"].update(**{"from": "later"}),
            "fill.count.from: no request has the id 'later'",
        )
        self.refused(
            lambda d: d["fill"].update(count="many"), "fill.count: a constant here must be int"
        )
        self.refused(
            lambda d: d["fill"]["count"].update(path="$.a[1:]"),
            'fill.count.path: unexpected ":" at character 6',
        )

    def test_a_required_scalar_says_what_is_missing(self):
        data = {
            "format": 1, "id": "myads", "kind": "adblock", "name": "My Ads",
            "request": [{"path": "/stats"}],
            "fill": {"blocked": {"path": "$.blocked"}},
        }  # fmt: skip
        with self.assertRaises(fmt.FormatError) as cm:
            fmt.check(data, "myads.toml", "myads")
        self.assertEqual(
            cm.exception.problems,
            [
                "myads.toml: fill.blocked: required by the kind: give required, the message for "
                "when it is missing"
            ],
        )
        data["fill"]["blocked"]["required"] = "no count"
        data["fill"]["window"] = {"unit_s": 600, "current": "yes"}
        with self.assertRaises(fmt.FormatError) as cm:
            fmt.check(data, "myads.toml", "myads")
        self.assertEqual(
            cm.exception.problems, ["myads.toml: fill.window.current: a constant here must be bool"]
        )
        data["fill"]["window"] = {
            "unit_s": 600,
            "current": True,
            "queries": {"path": "$.q[*]", "type": "int"},
        }
        with self.assertRaises(fmt.FormatError) as cm:
            fmt.check(data, "myads.toml", "myads")
        self.assertEqual(
            cm.exception.problems, ["myads.toml: fill.window.queries.type: must be number"]
        )

    def test_adblock_takes_one_of_blocked_and_recent(self):
        data = {
            "format": 1, "id": "myads", "kind": "adblock", "name": "My Ads",
            "request": [{"path": "/stats"}],
            "fill": {"window": {"unit_s": 60, "current": False}},
        }  # fmt: skip

        def problems(fill):
            d = copy.deepcopy(data)
            d["fill"].update(fill)
            try:
                fmt.check(d, "myads.toml", "myads")
            except fmt.FormatError as exc:
                return exc.problems
            return []

        recent = {
            "zip": True,
            "at": {"path": "$.minutes[*].end", "type": "time"},
            "blocked": {"path": "$.minutes[*].blocked", "type": "int"},
        }
        blocked = {"path": "$.blocked", "required": "no count"}
        self.assertEqual(problems({}), ["myads.toml: fill: give one of blocked and recent"])
        self.assertEqual(
            problems({"blocked": blocked, "recent": recent}),
            ["myads.toml: fill.recent: give one of blocked and recent, not both"],
        )
        self.assertEqual(problems({"blocked": blocked}), [])
        self.assertEqual(problems({"recent": recent, "settle_s": 20}), [])
        # The one given is required, as a field the kind always needs is.
        self.assertEqual(
            problems({"blocked": {"path": "$.blocked"}}),
            [
                "myads.toml: fill.blocked: required by the kind: give required, the message for "
                "when it is missing"
            ],
        )
        self.assertEqual(
            problems({"recent": {"zip": True, "at": recent["at"]}}),
            ["myads.toml: fill.recent.blocked: required by the kind"],
        )
        self.assertEqual(
            problems({"recent": recent, "settle_s": "soon"}),
            ["myads.toml: fill.settle_s: a constant here must be int"],
        )

    def test_items(self):
        s = lambda d: d["fill"]["sessions"]  # noqa: E731
        self.refused(lambda d: s(d).pop("each"), "fill.sessions.each: required, or zip = true")
        self.refused(lambda d: s(d).update(zip="yes"), "fill.sessions.zip: only zip = true")
        self.refused(
            lambda d: s(d)["vars"].update({"Bad": "$.x"}),
            "fill.sessions.vars.Bad: 1 to 24 of a-z, 0-9 and _, starting with a letter",
        )
        self.refused(
            lambda d: s(d)["vars"].update({f"v{i}": "$.x" for i in range(60)}),
            "fill.sessions.vars: at most 64 vars",
        )
        self.refused(
            lambda d: s(d)["vars"].update(x={"path": "$.x", "nonzero": "yes"}),
            "fill.sessions.vars.x.nonzero: true or false",
        )
        self.refused(
            lambda d: s(d)["vars"].update(x={"path": "$.x", "default": []}),
            "fill.sessions.vars.x.default: a string, a number, true or false",
        )
        self.refused(
            lambda d: s(d)["fields"].update(order="nope"),
            "fill.sessions.fields.order: no var is named 'nope'",
        )
        self.refused(
            lambda d: s(d)["fields"].update(who={"pick": []}),
            "fill.sessions.fields.who.pick: a list of declared vars",
        )
        self.refused(
            lambda d: s(d)["fields"].update(rank="key"),
            "fill.sessions.fields.rank: the kind has no such field",
        )
        self.refused(
            lambda d: s(d)["fields"].update(title="name"),
            "fill.sessions.title: given in fields as well",
        )

    def test_cases_and_templates(self):
        t = lambda d: d["fill"]["sessions"]["title"]  # noqa: E731
        self.refused(
            lambda d: t(d).extend([{"try": ["{name}"]}] * 15),
            "fill.sessions.title: at most 16 cases",
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{name}"] * 9}),
            "fill.sessions.title[1].try: a list of 1 to 8 templates",
        )
        self.refused(
            lambda d: t(d)[0].update(when={"nope": "x"}),
            "fill.sessions.title[0].when.nope: not a declared var",
        )
        self.refused(
            lambda d: t(d)[0].update(when={"kind": ["x"]}),
            "fill.sessions.title[0].when.kind: a string, a number, true or false",
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{missing}"]}),
            "fill.sessions.title[1].try[0]: {missing} is not declared",
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{credential.token}"]}),
            "fill.sessions.title[1].try[0]: a credential may be used only in a request's query "
            "or headers, or in [auth]",
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{setting.page_size}"]}),
            "fill.sessions.title[1].try[0]: {setting.page_size} cannot be used here",
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{name:2}"]}),
            'fill.sessions.title[1].try[0]: "{name:2}" at character 1 is not a reference',
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{name"]}),
            'fill.sessions.title[1].try[0]: "{" at character 1 is not closed',
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["a}b"]}),
            'fill.sessions.title[1].try[0]: unexpected "}" at character 2; write }} for a brace',
        )
        self.refused(
            lambda d: t(d)[1].update(**{"try": ["{name.x}"]}),
            'fill.sessions.title[1].try[0]: "{name.x}" at character 1 is not a reference',
        )

    def test_zipped_lists(self):
        data = {
            "format": 1, "id": "myflix", "kind": "streams", "name": "My Flix",
            "request": [{"path": "/now"}],
            "fill": {"sessions": {"zip": True, "title": {"path": "$.titles[*]"},
                                  "order": {"path": "$.keys[*]", "type": "int"}}},
        }  # fmt: skip
        spec = check(data)
        self.assertEqual(sorted(spec.fill["sessions"].zipped), ["order", "title"])
        data["fill"]["sessions"]["rank"] = {"path": "$.r[*]"}
        data["fill"]["sessions"]["title"]["type"] = "text"
        with self.assertRaises(fmt.FormatError) as cm:
            check(data)
        self.assertEqual(
            cm.exception.problems,
            [
                "myflix.toml: fill.sessions.title.type: use int, number, string, bool, time, raw",
                "myflix.toml: fill.sessions.rank: the kind has no such field",
            ],
        )

    def test_every_problem_is_reported_at_once(self):
        data = copy.deepcopy(VALID)
        data["format"] = 3
        data["request"][0]["path"] = "api"
        data["fill"]["count"]["type"] = "huge"
        with self.assertRaises(fmt.FormatError) as cm:
            check(data)
        self.assertEqual(len(cm.exception.problems), 3)


class TemplateTest(unittest.TestCase):
    def test_parts(self):
        t = fmt.parse_template("{show} S{season:02}E{episode:02} {{x}} {credential.token}")
        self.assertEqual(
            t.parts,
            (
                fmt.Ref("var", "show"),
                " S",
                fmt.Ref("var", "season", 2),
                "E",
                fmt.Ref("var", "episode", 2),
                " {x} ",
                fmt.Ref("credential", "token"),
            ),
        )


if __name__ == "__main__":
    unittest.main()
