"""The bundled server, server/app.py, run on the loopback for each test class.

Every request goes through a real socket with http.client, so that a target such as /../ reaches
the server exactly as written. The page is a small invented one, the collector's output folder
holds an invented state.json, and the server's own folder is a temporary one.
"""

from __future__ import annotations

import contextlib
import http.client
import io
import json
import logging
import os
import shutil
import tempfile
import threading
import tomllib
import unittest

from collector import config
from server import app, stamp
from server.store import FILE

logging.getLogger("server").addHandler(logging.NullHandler())
logging.getLogger("server").propagate = False

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE = {"schema": 1, "generated_at": "2026-01-15T21:00:00Z", "interval_s": 10}


class Running:
    """A server on 127.0.0.1 and a free port, over folders of its own."""

    def __init__(self, web: str | None = None):
        self.base = tempfile.mkdtemp(prefix="kw-server-")
        self.web = web or os.path.join(self.base, "web")
        if web is None:
            os.makedirs(os.path.join(self.web, "css"))
            os.makedirs(os.path.join(self.web, "data"))
            with open(os.path.join(self.web, "index.html"), "w") as fh:
                fh.write('<meta name="kw-version" content="dev">\n<script src="a.js"></script>\n')
            with open(os.path.join(self.web, "a.js"), "w") as fh:
                fh.write("'use strict';\n")
            with open(os.path.join(self.web, "css", "s.css"), "w") as fh:
                fh.write("body{}\n")
            with open(os.path.join(self.web, "data", "state.json"), "w") as fh:
                fh.write('{"from": "web/data, which is never served"}\n')
            with open(os.path.join(self.web, "notes.md"), "w") as fh:
                fh.write("a type the server does not serve\n")
            stamp.stamp(self.web)
        self.out = os.path.join(self.base, "out")
        self.data = os.path.join(self.base, "data")
        os.makedirs(os.path.join(self.out, "packs"))
        os.makedirs(self.data)
        with open(os.path.join(self.out, "state.json"), "w") as fh:
            json.dump(STATE, fh)
        with open(os.path.join(self.out, "packs", "index.json"), "w") as fh:
            fh.write('{"packs": []}\n')
        with open(os.path.join(self.out, "memory.json"), "w") as fh:
            fh.write('{"private": true}\n')
        with open(os.path.join(self.base, "secret.txt"), "w") as fh:
            fh.write("outside every served folder\n")
        os.symlink(
            os.path.join(self.base, "secret.txt"), os.path.join(self.out, "packs", "link.json")
        )
        self.start()

    def start(self) -> None:
        self.httpd = app.Server(
            ("127.0.0.1", 0), app.load_web(self.web), self.out, app.Store(self.data)
        )
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, args=(0.05,), daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

    def close(self) -> None:
        self.stop()
        shutil.rmtree(self.base, ignore_errors=True)

    def request(self, method, target, body=None, headers=None):
        """(status, headers, body bytes) for one request on a fresh connection."""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            c.putrequest(method, target, skip_host=True, skip_accept_encoding=True)
            h = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
            if body is not None:
                h.setdefault("Content-Length", str(len(body)))
            for k, v in h.items():
                if v is not None:
                    c.putheader(k, v)
            c.endheaders(body)
            r = c.getresponse()
            return r.status, r, r.read()
        finally:
            c.close()

    def put(self, payload, headers=None):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        h = {"Content-Type": "application/json", **(headers or {})}
        status, r, data = self.request("PUT", "/api/settings", body, h)
        return status, r, json.loads(data) if data else None


class ServerCase(unittest.TestCase):
    def setUp(self):
        self.s = Running()
        self.addCleanup(self.s.close)


class StaticTest(ServerCase):
    def test_the_page_is_served_with_its_types_and_the_index_at_the_root(self):
        status, r, body = self.s.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(r.getheader("Content-Type"), "text/html; charset=utf-8")
        self.assertIn(b'content="', body)
        self.assertNotIn(b'content="dev"', body, "the copy is stamped")
        self.assertEqual(r.getheader("Cache-Control"), "no-cache")
        self.assertEqual(self.s.request("GET", "/index.html")[2], body)
        status, r, body = self.s.request("GET", "/a.js")
        self.assertEqual(
            (status, r.getheader("Content-Type")), (200, "text/javascript; charset=utf-8")
        )
        status, r, _ = self.s.request("GET", "/css/s.css")
        self.assertEqual((status, r.getheader("Content-Type")), (200, "text/css; charset=utf-8"))
        status, r, body = self.s.request("GET", "/version.json")
        self.assertEqual((status, r.getheader("Cache-Control")), (200, "no-cache"))
        self.assertRegex(json.loads(body)["version"], r"^[0-9a-f]{12}$")
        for header in ("X-Content-Type-Options", "Content-Security-Policy", "Referrer-Policy"):
            self.assertTrue(r.getheader(header), header)

    def test_a_versioned_address_may_be_kept_and_a_plain_one_is_asked_for_again(self):
        _, r, _ = self.s.request("GET", "/a.js?v=0123456789ab")
        self.assertEqual(r.getheader("Cache-Control"), "public, max-age=31536000, immutable")
        _, r, _ = self.s.request("GET", "/a.js")
        self.assertEqual(r.getheader("Cache-Control"), "no-cache")
        _, r, _ = self.s.request("GET", "/index.html?v=0123456789ab")
        self.assertEqual(r.getheader("Cache-Control"), "no-cache", "never for the index")

    def test_a_conditional_request_gets_304_with_no_body(self):
        _, r, _ = self.s.request("GET", "/a.js")
        tag = r.getheader("ETag")
        status, r, body = self.s.request("GET", "/a.js", headers={"If-None-Match": tag})
        self.assertEqual((status, body), (304, b""))
        status, _, _ = self.s.request("GET", "/a.js", headers={"If-None-Match": '"other"'})
        self.assertEqual(status, 200)

    def test_head_gives_the_headers_alone(self):
        status, r, body = self.s.request("HEAD", "/a.js")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(r.getheader("Content-Length"), str(len(b"'use strict';\n")))

    def test_no_folder_is_listed(self):
        for target in (
            "/css",
            "/css/",
            "/data",
            "/data/",
            "/data/packs",
            "/data/packs/",
            "/api",
            "/api/",
        ):
            status, _, body = self.s.request("GET", target)
            self.assertEqual((status, body), (404, b"Not found\n"), target)

    def test_a_file_of_a_type_not_listed_and_web_data_are_not_served(self):
        self.assertEqual(self.s.request("GET", "/notes.md")[0], 404)
        # web/data/ in the image is never the collector's folder
        status, _, body = self.s.request("GET", "/data/state.json")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), STATE)

    def test_no_path_reaches_outside_the_served_files(self):
        targets = [
            "/../secret.txt",
            "/../../../../etc/passwd",
            "/%2e%2e/secret.txt",
            "/%2E%2E/%2E%2E/etc/passwd",
            "/css/../../secret.txt",
            "/css/%2e%2e/%2e%2e/secret.txt",
            "/data/../secret.txt",
            "/data/../../secret.txt",
            "/data/packs/../state.json",
            "/data/packs/..%2fstate.json",
            "/data/packs/%2e%2e%2f%2e%2e%2fsecret.txt",
            "/data/packs/..%5c..%5csecret.txt",
            "/data/./state.json",
            "/data/memory.json",
            "/data/packs/link.json",
            "/data/packs/.hidden.json",
            "/data/packs/index.json%00.png",
            "//etc/passwd",
            "/data//state.json",
            "/./index.html",
            "/data/" + FILE,
            "/" + FILE,
            "http://127.0.0.1/../secret.txt",
            "../secret.txt",
            "*",
        ]
        for target in targets:
            status, _, body = self.s.request("GET", target)
            self.assertEqual(status, 404, target)
            self.assertNotIn(b"outside every served folder", body, target)
            self.assertNotIn(b"private", body, target)

    def test_the_collectors_output_is_served_fresh(self):
        status, r, body = self.s.request("GET", "/data/state.json")
        self.assertEqual((status, r.getheader("Cache-Control")), (200, "no-cache"))
        self.assertEqual(r.getheader("Content-Type"), "application/json")
        tag = r.getheader("ETag")
        with open(os.path.join(self.s.out, "state.json"), "w") as fh:
            json.dump({**STATE, "interval_s": 30}, fh)
        status, _, body = self.s.request("GET", "/data/state.json", headers={"If-None-Match": tag})
        self.assertEqual(status, 200, "a new file is not the one the tag named")
        self.assertEqual(json.loads(body)["interval_s"], 30)
        status, _, body = self.s.request("GET", "/data/packs/index.json")
        self.assertEqual((status, body), (200, b'{"packs": []}\n'))

    def test_a_missing_state_file_is_404(self):
        os.unlink(os.path.join(self.s.out, "state.json"))
        self.assertEqual(self.s.request("GET", "/data/state.json")[0], 404)

    def test_other_methods_are_refused(self):
        for method in ("POST", "DELETE", "PATCH", "OPTIONS", "TRACE"):
            status, r, _ = self.s.request(method, "/index.html")
            self.assertEqual((status, r.getheader("Allow")), (405, "GET, HEAD"), method)
            status, r, _ = self.s.request(method, "/api/settings")
            self.assertEqual((status, r.getheader("Allow")), (405, "GET, HEAD, PUT"), method)
        status, _, _ = self.s.request(
            "PUT", "/index.html", b"{}", {"Content-Type": "application/json"}
        )
        self.assertEqual(status, 405)
        self.assertEqual(self.s.request("BREW", "/")[0], 501)


class SettingsApiTest(ServerCase):
    def get(self):
        status, r, body = self.s.request("GET", "/api/settings")
        self.assertEqual(status, 200)
        return r, json.loads(body)

    def test_an_empty_store_gives_four_empty_sections(self):
        r, body = self.get()
        self.assertEqual(body, {"v": 1, "look": {}, "display": {}, "quiet": {}, "scenes": {}})
        self.assertEqual(r.getheader("Content-Type"), "application/json; charset=utf-8")
        self.assertEqual(r.getheader("Cache-Control"), "no-cache")

    def test_a_put_replaces_the_sections_it_names_and_leaves_the_rest(self):
        status, _, body = self.s.put(
            {"look": {"tabard": "teal", "skin": "tan"}, "display": {"clock": 12}}
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["look"], {"tabard": "teal", "skin": "tan"})
        status, _, body = self.s.put({"v": 1, "look": {"plume": "gold"}})
        self.assertEqual(status, 200)
        want = {
            "v": 1,
            "look": {"plume": "gold"},
            "display": {"clock": 12},
            "quiet": {},
            "scenes": {},
        }
        self.assertEqual(body, want)
        self.assertEqual(self.get()[1], want)
        status, _, body = self.s.put(
            {
                "display": {},
                "quiet": {"scenes": ["camp", "yard"], "minutes": 5},
                "scenes": {"cpu_hot": "camp"},
            }
        )
        self.assertEqual(body["display"], {}, "an empty section clears it")
        self.assertEqual(body["quiet"], {"scenes": ["camp", "yard"], "minutes": 5})
        self.assertEqual(body["scenes"], {"cpu_hot": "camp"})

    def test_the_world_its_parts_and_long_names_are_taken(self):
        look = {
            "world": "kw.cyber/world.neon",
            "monarch": "kw.medieval/patron.b",
            "props": "medieval",
            "items": {"main": "kw.base/main.arming"},
            "devices": {"camera": "kw.cyber/props.neon"},
        }
        status, _, body = self.s.put(
            {
                "look": look,
                "quiet": {"scenes": ["kw.cyber/roof"]},
                "scenes": {"cpu_hot": "kw.x/lab"},
            }
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["look"], look)
        self.assertEqual(body["quiet"], {"scenes": ["kw.cyber/roof"]})
        self.assertEqual(body["scenes"], {"cpu_hot": "kw.x/lab"})

    def test_the_store_is_a_file_written_whole_and_read_again_at_start(self):
        self.s.put({"look": {"monarch": "c"}, "display": {"helmet_indoors": True}})
        path = os.path.join(self.s.data, FILE)
        with open(path) as fh:
            self.assertEqual(json.load(fh)["look"], {"monarch": "c"})
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o640)
        self.assertEqual(
            [f for f in os.listdir(self.s.data) if f != FILE], [], "no temporary file left"
        )
        self.s.stop()
        self.s.start()
        self.assertEqual(self.get()[1]["display"], {"helmet_indoors": True})

    def test_the_settings_have_a_tag_and_a_conditional_get_gets_304(self):
        r, _ = self.get()
        tag = r.getheader("ETag")
        status, _, body = self.s.request("GET", "/api/settings", headers={"If-None-Match": tag})
        self.assertEqual((status, body), (304, b""))
        _, r2, _ = self.s.put({"look": {"hair": "silver"}})
        self.assertNotEqual(r2.getheader("ETag"), tag)
        status, _, _ = self.s.request("GET", "/api/settings", headers={"If-None-Match": tag})
        self.assertEqual(status, 200)

    def test_a_bad_value_is_refused_in_the_words_config_toml_gets(self):
        cases = [
            ({"look": {"skin": "pale"}}, '[look]\nskin = "pale"\n'),
            (
                {"display": {"clock": 13, "headline": "huge"}},
                '[display]\nclock = 13\nheadline = "huge"\n',
            ),
            ({"display": {"helmet_indoors": "false"}}, '[display]\nhelmet_indoors = "false"\n'),
            (
                {"quiet": {"scenes": ["camp", "camp"], "minutes": 2.5}},
                '[quiet]\nscenes = ["camp", "camp"]\nminutes = 2.5\n',
            ),
            ({"quiet": {"scenes": []}}, "[quiet]\nscenes = []\n"),
            (
                {"scenes": {"cpu": "camp", "cpu_hot": "forest"}},
                '[scenes]\ncpu = "camp"\ncpu_hot = "forest"\n',
            ),
            ({"look": {"cape": "red"}}, '[look]\ncape = "red"\n'),
            ({"look": "teal"}, 'look = "teal"\n'),
            ({"look": {"world": "neon"}}, '[look]\nworld = "neon"\n'),
            (
                {"look": {"items": {"head": "kw.base/head.a"}, "devices": {"pi": "Medieval"}}},
                '[look.items]\nhead = "kw.base/head.a"\n[look.devices]\npi = "Medieval"\n',
            ),
            ({"look": {"devices": "medieval"}}, '[look]\ndevices = "medieval"\n'),
        ]
        for body, toml in cases:
            with self.subTest(body=body):
                want = config.check_defaults(tomllib.loads(toml))
                self.assertTrue(want)
                status, _, got = self.s.put(body)
                self.assertEqual(status, 400)
                self.assertEqual(got["problems"], want)
                self.assertEqual(got["error"], want[0])
        self.assertEqual(self.get()[1]["look"], {}, "nothing refused was saved")

    def test_a_write_that_names_no_section_or_an_unknown_one_is_refused(self):
        cases = [
            ({}, ["name one or more of look, display, quiet or scenes"]),
            ({"v": 1}, ["name one or more of look, display, quiet or scenes"]),
            ({"v": 2, "look": {}}, ["v: must be 1"]),
            ({"v": True, "look": {}}, ["v: must be 1"]),
            ({"sources": {"host": {}}}, ["sources: unknown table"]),
            ([], ["the body must be a JSON object"]),
        ]
        for body, want in cases:
            with self.subTest(body=body):
                status, _, got = self.s.put(body)
                self.assertEqual((status, got["problems"]), (400, want))

    def test_a_body_that_is_not_json_is_refused(self):
        for raw in (b"{", b"look=teal", b'{"look": {"x": NaN}}', b"\xff\xfe"):
            status, _, got = self.s.put(raw)
            self.assertEqual((status, got["error"]), (400, "the body is not JSON"), raw)

    def test_only_json_is_taken(self):
        for ctype in (
            "text/plain",
            "application/x-www-form-urlencoded",
            "multipart/form-data",
            None,
        ):
            status, _, got = self.s.put({"look": {"tabard": "teal"}}, {"Content-Type": ctype})
            self.assertEqual(
                (status, got["error"]), (415, "the settings are sent as application/json"), ctype
            )
        status, _, _ = self.s.put(
            {"look": {"tabard": "teal"}}, {"Content-Type": "application/json; charset=utf-8"}
        )
        self.assertEqual(status, 200)

    def test_a_body_over_16_kib_is_refused(self):
        body = json.dumps({"look": {"tabard": "teal" + " " * (16 * 1024)}}).encode()
        status, _, got = self.s.put(body)
        self.assertEqual((status, got["error"]), (413, "the settings are larger than 16384 bytes"))
        status, _, got = self.s.request(
            "PUT",
            "/api/settings",
            b"",
            {"Content-Type": "application/json", "Content-Length": str(10**9)},
        )
        self.assertEqual(status, 413)
        self.assertEqual(self.get()[1]["look"], {})

    def test_a_body_without_a_length_is_refused(self):
        status, _, _ = self.s.request(
            "PUT", "/api/settings", None, {"Content-Type": "application/json"}
        )
        self.assertEqual(status, 411)
        status, _, _ = self.s.request(
            "PUT",
            "/api/settings",
            b"2\r\n{}\r\n0\r\n\r\n",
            {
                "Content-Type": "application/json",
                "Transfer-Encoding": "chunked",
                "Content-Length": None,
            },
        )
        self.assertEqual(status, 411)

    def test_a_write_from_another_site_is_refused(self):
        port = self.s.port
        refused = [
            {"Origin": "http://evil.example.com"},
            {"Origin": f"http://127.0.0.1:{port + 1}"},
            {"Origin": f"http://127.0.0.2:{port}"},
            {"Origin": "null"},
            {"Origin": f"http://user@127.0.0.1:{port}"},
            {"Sec-Fetch-Site": "cross-site"},
            {
                "Origin": "http://knightwatcher.example.com.evil.example",
                "Host": "knightwatcher.example.com",
            },
        ]
        for h in refused:
            status, _, got = self.s.put({"look": {"tabard": "wine"}}, h)
            self.assertEqual(
                (status, got["error"]),
                (403, "a page from another address may not change the settings"),
                h,
            )
        self.assertEqual(self.get()[1]["look"], {})
        allowed = [
            {},
            {"Origin": f"http://127.0.0.1:{port}"},
            {"Origin": f"HTTP://127.0.0.1:{port}", "Sec-Fetch-Site": "same-origin"},
            # behind a reverse proxy that ends TLS and passes the Host on
            {"Origin": "https://knightwatcher.example.com", "Host": "knightwatcher.example.com"},
            {"Origin": "http://knightwatcher.example.com", "Host": "knightwatcher.example.com:80"},
        ]
        for h in allowed:
            status, _, _ = self.s.put({"look": {"tabard": "wine"}}, h)
            self.assertEqual(status, 200, h)

    def test_a_folder_the_server_cannot_write_refuses_with_500_and_keeps_what_it_had(self):
        if os.geteuid() == 0:
            self.skipTest("root writes anywhere")
        self.s.put({"look": {"tabard": "teal"}})
        os.chmod(self.s.data, 0o500)
        self.addCleanup(os.chmod, self.s.data, 0o700)
        status, _, got = self.s.put({"look": {"tabard": "wine"}})
        self.assertEqual(status, 500)
        self.assertTrue(got["error"].startswith("the server cannot write its settings file"))
        self.assertEqual(self.get()[1]["look"], {"tabard": "teal"})


class IdleTest(unittest.TestCase):
    def test_an_idle_connection_is_closed_without_a_line_in_the_log(self):
        s = Running()
        self.addCleanup(s.close)
        s.httpd.RequestHandlerClass = type("Quick", (app.Handler,), {"timeout": 0.2})
        with self.assertNoLogs("server", "WARNING"):
            c = http.client.HTTPConnection("127.0.0.1", s.port, timeout=5)
            c.connect()
            self.assertEqual(c.sock.recv(1), b"", "the server closed the idle connection")
            c.close()


class StartTest(unittest.TestCase):
    def test_a_saved_value_the_checks_refuse_is_left_out_with_a_line(self):
        base = tempfile.mkdtemp(prefix="kw-server-")
        self.addCleanup(shutil.rmtree, base, True)
        with open(os.path.join(base, FILE), "w") as fh:
            json.dump(
                {"v": 1, "look": {"tabard": "teal", "skin": "pale"}, "quiet": "all", "other": {}},
                fh,
            )
        with self.assertLogs("server", "WARNING") as logs:
            s = app.Store(base)
        self.assertEqual(
            json.loads(s.get()[0]),
            {"v": 1, "look": {"tabard": "teal"}, "display": {}, "quiet": {}, "scenes": {}},
        )
        self.assertTrue(any('look.skin: unknown value "pale"' in line for line in logs.output))

    def test_a_file_that_is_not_json_counts_as_none_saved_and_is_kept_until_a_write(self):
        base = tempfile.mkdtemp(prefix="kw-server-")
        self.addCleanup(shutil.rmtree, base, True)
        with open(os.path.join(base, FILE), "w") as fh:
            fh.write("{ not json")
        with self.assertLogs("server", "WARNING"):
            s = app.Store(base)
        self.assertEqual(json.loads(s.get()[0])["look"], {})
        with open(os.path.join(base, FILE)) as fh:
            self.assertEqual(fh.read(), "{ not json")

    def test_main_refuses_a_page_without_an_index_and_a_folder_it_cannot_write(self):
        base = tempfile.mkdtemp(prefix="kw-server-")
        self.addCleanup(shutil.rmtree, base, True)
        os.makedirs(os.path.join(base, "web"))
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(app.main(["--web", os.path.join(base, "web"), "--data", base]), 2)
            with open(os.path.join(base, "web", "index.html"), "w") as fh:
                fh.write("x")
            self.assertEqual(
                app.main(
                    ["--web", os.path.join(base, "web"), "--data", os.path.join(base, "none")]
                ),
                2,
            )
        self.assertIn("index.html not found", err.getvalue())
        self.assertIn("is not a writable folder", err.getvalue())


class HealthTest(unittest.TestCase):
    def test_health_is_0_while_the_server_answers_and_1_when_it_does_not(self):
        s = Running()
        self.addCleanup(shutil.rmtree, s.base, True)
        self.assertEqual(app._health(s.port), 0)
        s.stop()
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(app._health(s.port), 1)
        self.assertIn("unhealthy: /:", err.getvalue())


class RealPageTest(unittest.TestCase):
    """The repository's own page, stamped as the image stamps it."""

    def test_every_file_of_the_page_is_served_with_a_type(self):
        base = tempfile.mkdtemp(prefix="kw-server-page-")
        self.addCleanup(shutil.rmtree, base, True)
        web = os.path.join(base, "web")
        shutil.copytree(os.path.join(ROOT, "web"), web, ignore=shutil.ignore_patterns("data"))
        stamp.stamp(web)
        s = Running(web)
        self.addCleanup(s.close)
        served = app.load_web(web)
        for here, _, names in os.walk(web):
            for name in names:
                address = "/" + os.path.relpath(os.path.join(here, name), web).replace(os.sep, "/")
                self.assertIn(address, served, f"{address} has no type in TYPES")
        status, _, body = s.request("GET", "/")
        self.assertEqual(status, 200)
        for line in body.decode().splitlines():
            if "<script" in line and 'src="' in line:
                src = line.split('src="', 1)[1].split('"', 1)[0]
                self.assertEqual(s.request("GET", "/" + src)[0], 200, src)


if __name__ == "__main__":
    unittest.main()
