"""The admin page's side of the server (server/admin.py and its addresses in server/app.py), run on
the loopback with an invented config.toml, an invented state file and the collector's report of
the credentials it holds. The admin password is made for each run, and the tests check that it is
never logged, answered or written."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import secrets
import shutil
import stat
import tempfile
import threading
import tomllib
import unittest
from unittest import mock

from test_server import Running

from collector import config, overlay
from server import admin, app, stamp
from server.store import FILE as SHARED_FILE
from server.store import Store

CONFIG = """[collector]
timezone = "Europe/London"

[conditions.attack]
jails = ["sshd", "caddy-auth"]

[sources.containers]
url = "http://192.0.2.10:2375"

[sources.pi]
host = "192.0.2.4"

[sources.sonarr]
enabled = false
url = "http://192.0.2.30:8989"

[sources.updates]
holders = [{ name = "nightly maintenance", pattern = 'nightly-maintenance\\.sh' }]

[[thing]]
name = "Vault"
kind = "machine"
host = "192.0.2.40"
port = 445

[look]
skin = "tan"
"""

STATE = {
    "schema": 1,
    "generated_at": "2026-01-15T21:00:00Z",
    "interval_s": 10,
    "sources": {"containers": {"ok": True, "at": "2026-01-15T21:00:00Z", "error": ""}},
    "facts": {"things": {"list": [{"name": "Vault", "kind": "machine", "state": "up"}]}},
    "config": {"admin": None, "at": "2026-01-15T20:00:00Z", "problems": []},
}

CREDENTIALS = {
    "KNIGHTWATCHER_ADGUARD_PASSWORD": False,
    "KNIGHTWATCHER_ADGUARD_USERNAME": False,
    "KNIGHTWATCHER_RADARR_API_KEY": False,
    "KNIGHTWATCHER_SONARR_API_KEY": False,
    "KNIGHTWATCHER_TAUTULLI_API_KEY": False,
}


class FakeTime:
    def __init__(self):
        self.now = 1_000_000.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, s: float) -> None:
        self.slept.append(s)


class AdminRunning(Running):
    """A server with the admin page on, its password made for the run, and a log kept."""

    def __init__(self, password: str | None = "", web: str | None = None):
        self.password = secrets.token_urlsafe(18) if password == "" else password
        self.time = FakeTime()
        self.log = io.StringIO()
        handler = logging.StreamHandler(self.log)
        logger = logging.getLogger("server")
        logger.addHandler(handler)
        self._handler, self._level = handler, logger.level
        logger.setLevel(logging.INFO)
        super().__init__(web)

    def start(self) -> None:
        with open(os.path.join(self.base, "config.toml"), "w", encoding="utf-8") as fh:
            fh.write(CONFIG)
        with open(os.path.join(self.out, "state.json"), "w", encoding="utf-8") as fh:
            json.dump(STATE, fh)
        with open(os.path.join(self.out, "credentials.json"), "w", encoding="utf-8") as fh:
            json.dump(CREDENTIALS, fh)
        self.config_path = os.path.join(self.base, "config.toml")
        store = Store(self.data)
        gate = admin.Gate(
            self.password, clock=self.time.clock, sleep=self.time.sleep, folder=self.data
        )
        self.admin = admin.Admin(self.data, self.out, self.config_path, gate, store)
        self.httpd = app.Server(
            ("127.0.0.1", 0), app.load_web(self.web), self.out, store, self.admin
        )
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, args=(0.05,), daemon=True)
        self.thread.start()

    def close(self) -> None:
        logging.getLogger("server").removeHandler(self._handler)
        logging.getLogger("server").setLevel(self._level)
        super().close()

    def json_call(self, method, target, payload=None, cookie=None, headers=None):
        body = None if payload is None else json.dumps(payload).encode()
        h = {
            **({"Content-Type": "application/json"} if body is not None else {}),
            **(headers or {}),
        }
        if cookie:
            h["Cookie"] = cookie
        status, r, data = self.request(method, target, body, h)
        ctype = r.getheader("Content-Type") or ""
        return (
            status,
            r,
            json.loads(data) if data and ctype.startswith("application/json") else data,
        )

    def sign_in(self, password=None):
        status, r, _ = self.json_call(
            "POST", "/api/admin/sign-in", {"password": password or self.password}
        )
        assert status == 204, status
        return r.getheader("Set-Cookie").split(";", 1)[0]


class AdminCase(unittest.TestCase):
    password: str | None = ""

    def setUp(self):
        self.s = AdminRunning(self.password)
        self.addCleanup(self.s.close)

    def assertNoPassword(self, *texts):
        if self.s.password:
            for text in (self.s.log.getvalue(), *texts):
                self.assertNotIn(self.s.password, text if isinstance(text, str) else repr(text))


class OffTest(unittest.TestCase):
    def test_off_without_a_password_and_with_a_short_one(self):
        for password, words in (
            (None, "the admin page is off: .env has no KNIGHTWATCHER_ADMIN_PASSWORD"),
            (
                "x" * 11,
                "the admin page is off: KNIGHTWATCHER_ADMIN_PASSWORD in .env is shorter than "
                "12 characters",
            ),
        ):
            s = AdminRunning(password)
            try:
                status, _, state = s.json_call("GET", "/api/admin/state")
                self.assertEqual(status, 200)
                self.assertEqual(state, {"on": False, "signed_in": False, "error": words})
                status, _, answer = s.json_call(
                    "POST", "/api/admin/sign-in", {"password": password or ""}
                )
                self.assertEqual((status, answer), (503, {"error": words}))
                status, _, answer = s.json_call("GET", "/api/admin/settings")
                self.assertEqual(status, 503)
                # The walls are not affected.
                self.assertEqual(s.request("GET", "/")[0], 200)
                self.assertEqual(s.request("GET", "/api/settings")[0], 200)
            finally:
                s.close()

    def test_twelve_characters_turn_it_on(self):
        s = AdminRunning("y" * 12)
        try:
            self.assertEqual(
                s.json_call("GET", "/api/admin/state")[2], {"on": True, "signed_in": False}
            )
        finally:
            s.close()

    def test_a_server_without_an_admin_says_it_is_off(self):
        s = Running()
        try:
            status, _, data = s.request("GET", "/api/admin/state")
            self.assertEqual(status, 200)
            self.assertFalse(json.loads(data)["on"])
        finally:
            s.close()


class SignInTest(AdminCase):
    def test_the_right_password_gives_a_session_cookie(self):
        status, r, _ = self.s.json_call("POST", "/api/admin/sign-in", {"password": self.s.password})
        self.assertEqual(status, 204)
        cookie = r.getheader("Set-Cookie")
        self.assertRegex(cookie, r"^kw_admin=[A-Za-z0-9_-]{43}; ")
        for part in ("Max-Age=2592000", "Path=/", "HttpOnly", "SameSite=Strict"):
            self.assertIn(part, cookie)
        self.assertNotIn("Secure", cookie)
        self.assertNotIn(self.s.password, cookie)
        status, _, state = self.s.json_call(
            "GET", "/api/admin/state", cookie=cookie.split(";", 1)[0]
        )
        self.assertEqual(state, {"on": True, "signed_in": True})
        self.assertNoPassword(cookie)

    def test_the_cookie_is_secure_behind_https(self):
        status, r, _ = self.s.json_call(
            "POST",
            "/api/admin/sign-in",
            {"password": self.s.password},
            headers={"X-Forwarded-Proto": "https"},
        )
        self.assertEqual(status, 204)
        self.assertTrue(r.getheader("Set-Cookie").endswith("; Secure"))

    def test_a_wrong_password_waits_a_second_and_says_so(self):
        status, _, answer = self.s.json_call("POST", "/api/admin/sign-in", {"password": "wrong"})
        self.assertEqual((status, answer), (401, {"error": "That is not the admin password."}))
        self.assertEqual(self.s.time.slept, [1.0])
        self.assertIn("admin sign-in refused", self.s.log.getvalue())
        self.assertNotIn("wrong", self.s.log.getvalue().replace("refused", ""))

    def test_five_wrong_pause_everyone_doubling_to_fifteen_minutes(self):
        t = self.s.time
        for _ in range(4):
            self.assertEqual(
                self.s.json_call("POST", "/api/admin/sign-in", {"password": "no"})[0], 401
            )
        status, _, answer = self.s.json_call("POST", "/api/admin/sign-in", {"password": "no"})
        self.assertEqual(status, 429)
        self.assertEqual(answer["retry_after_s"], 60)
        self.assertIn("paused for 1 minute", answer["error"])
        self.assertIn("admin sign-in paused for 1 minute", self.s.log.getvalue())
        # While paused, even the right password is refused, and nothing is counted.
        status, _, answer = self.s.json_call(
            "POST", "/api/admin/sign-in", {"password": self.s.password}
        )
        self.assertEqual(status, 429)
        self.assertEqual(self.s.json_call("GET", "/api/admin/state")[2]["paused_s"], 60)
        pauses = []
        for _ in range(5):
            t.now += 3600
            status, _, answer = self.s.json_call("POST", "/api/admin/sign-in", {"password": "no"})
            self.assertEqual(status, 429)
            pauses.append(answer["retry_after_s"])
        self.assertEqual(pauses, [120, 240, 480, 900, 900])
        # A right password, once the pause is over, clears the count.
        t.now += 3600
        self.s.sign_in()
        self.assertEqual(self.s.json_call("POST", "/api/admin/sign-in", {"password": "no"})[0], 401)
        self.assertNoPassword()

    def test_the_password_is_compared_in_constant_time(self):
        with mock.patch("server.admin.hmac.compare_digest", wraps=admin.hmac.compare_digest) as cmp:
            self.s.json_call("POST", "/api/admin/sign-in", {"password": "no"})
        self.assertEqual(cmp.call_count, 1)

    def test_signing_out_ends_the_session(self):
        cookie = self.s.sign_in()
        self.assertEqual(self.s.json_call("GET", "/api/admin/settings", cookie=cookie)[0], 200)
        status, r, _ = self.s.json_call("POST", "/api/admin/sign-out", cookie=cookie)
        self.assertEqual(status, 204)
        self.assertIn("Max-Age=0", r.getheader("Set-Cookie"))
        self.assertEqual(self.s.json_call("GET", "/api/admin/settings", cookie=cookie)[0], 401)

    def test_a_session_lasts_thirty_days_from_its_last_use_and_is_renewed(self):
        cookie = self.s.sign_in()
        t = self.s.time
        t.now += 20 * 86400
        status, r, _ = self.s.json_call("GET", "/api/admin/settings", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=2592000", r.getheader("Set-Cookie"), "the browser's cookie renewed")
        status, r, _ = self.s.json_call("GET", "/api/admin/settings", cookie=cookie)
        self.assertIsNone(r.getheader("Set-Cookie"), "at most once a day")
        t.now += 29 * 86400
        self.assertEqual(self.s.json_call("GET", "/api/admin/settings", cookie=cookie)[0], 200)
        t.now += 30 * 86400 + 1
        self.assertEqual(self.s.json_call("GET", "/api/admin/settings", cookie=cookie)[0], 401)

    def test_every_admin_address_but_state_and_sign_in_needs_the_session(self):
        for method, target in (
            ("GET", "/api/admin/settings"),
            ("GET", "/api/admin/export"),
            ("GET", "/api/admin/schema"),
            ("PATCH", "/api/admin/settings"),
            ("POST", "/api/admin/reset"),
        ):
            payload = {"v": 1} if method != "GET" else None
            status, _, answer = self.s.json_call(method, target, payload, cookie="kw_admin=forged")
            self.assertEqual(status, 401, target)
            self.assertEqual(answer, {"error": "sign in first"})

    def test_a_write_from_another_address_is_refused(self):
        cookie = self.s.sign_in()
        other = {"Origin": "http://203.0.113.9:8080"}
        for method, target, payload in (
            ("POST", "/api/admin/sign-in", {"password": self.s.password}),
            ("PATCH", "/api/admin/settings", {"set": {"collector.interval_s": 15}}),
            ("POST", "/api/admin/reset", {"v": 1}),
            ("POST", "/api/admin/sign-out", None),
        ):
            status, _, _ = self.s.json_call(method, target, payload, cookie, other)
            self.assertEqual(status, 403, target)
        self.assertEqual(self.s.admin.answer()["set"], {})
        cross = {"Sec-Fetch-Site": "cross-site"}
        status, _, _ = self.s.json_call(
            "PATCH", "/api/admin/settings", {"set": {"collector.interval_s": 15}}, cookie, cross
        )
        self.assertEqual(status, 403)

    def test_methods_and_unknown_addresses(self):
        status, r, _ = self.s.request("GET", "/api/admin/sign-in")
        self.assertEqual(status, 405)
        self.assertEqual(r.getheader("Allow"), "POST")
        status, r, _ = self.s.request("DELETE", "/api/admin/settings")
        self.assertEqual((status, r.getheader("Allow")), (405, "GET, HEAD, PATCH"))
        self.assertEqual(self.s.request("GET", "/api/admin/nothing")[0], 404)
        self.assertEqual(self.s.request("PATCH", "/api/settings")[0], 405)


class SessionFileTest(AdminCase):
    """Sessions kept in sessions.json, so that a restart keeps them."""

    def setUp(self):
        super().setUp()
        self.path = os.path.join(self.s.data, admin.SESSIONS_FILE)
        self.cookie = self.s.sign_in()
        self.token = self.cookie.split("=", 1)[1]

    def stored(self) -> dict:
        with open(self.path, encoding="utf-8") as fh:
            return json.load(fh)["sessions"]

    def gate(self, password=None) -> admin.Gate:
        return admin.Gate(password or self.s.password, clock=self.s.time.clock, folder=self.s.data)

    def settings_status(self) -> int:
        return self.s.json_call("GET", "/api/admin/settings", cookie=self.cookie)[0]

    def test_a_restart_keeps_a_session(self):
        self.s.stop()
        self.s.start()
        self.assertEqual(self.settings_status(), 200)

    def test_the_file_never_holds_a_usable_token(self):
        with open(self.path, encoding="utf-8") as fh:
            text = fh.read()
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o640)
        self.assertNotIn(self.token, text)
        self.assertNotIn(hashlib.sha256(self.token.encode()).hexdigest(), text)
        self.assertNotIn(self.s.password, text)
        (key,) = self.stored()
        self.assertRegex(key, r"^[0-9a-f]{64}$")
        # A stored key sent as a cookie is no session.
        status, _, _ = self.s.json_call(
            "GET", "/api/admin/settings", cookie=f"{admin.COOKIE}={key}"
        )
        self.assertEqual(status, 401)

    def test_a_changed_password_ends_every_session(self):
        self.assertEqual(self.gate().check(self.token), (True, False))
        other = self.gate(secrets.token_urlsafe(18))
        self.assertEqual(other.check(self.token), (False, False))

    def test_signing_out_removes_the_entry(self):
        self.assertEqual(len(self.stored()), 1)
        self.s.json_call("POST", "/api/admin/sign-out", cookie=self.cookie)
        self.assertEqual(self.stored(), {})
        self.assertEqual(self.gate().check(self.token), (False, False))

    def test_thirty_days_of_disuse_end_it_and_the_entry_goes(self):
        self.s.time.now += 30 * 86400 + 1
        self.assertEqual(self.gate().check(self.token), (False, False))
        self.assertEqual(self.settings_status(), 401)
        self.assertEqual(self.stored(), {})

    def test_use_renews_it_across_restarts(self):
        t = self.s.time
        t.now += 20 * 86400
        self.assertEqual(self.settings_status(), 200)
        (entry,) = self.stored().values()
        self.assertEqual(entry["used"], t.now, "the use is written, so a restart keeps it")
        t.now += 29 * 86400
        self.s.stop()
        self.s.start()
        self.assertEqual(self.settings_status(), 200)
        t.now += 30 * 86400 + 1
        self.s.stop()
        self.s.start()
        self.assertEqual(self.settings_status(), 401)

    def test_a_use_is_written_at_most_hourly(self):
        before = self.stored()
        self.s.time.now += 600
        self.assertEqual(self.settings_status(), 200)
        self.assertEqual(self.stored(), before)
        self.s.time.now += admin.STORE_USE_S
        self.assertEqual(self.settings_status(), 200)
        self.assertNotEqual(self.stored(), before)

    def test_a_file_that_cannot_be_read_is_no_sessions(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write("not json")
        with self.assertLogs("server", "WARNING"):
            self.assertEqual(self.gate().check(self.token), (False, False))


class SettingsTest(AdminCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.s.sign_in()

    def patch(self, payload, headers=None):
        return self.s.json_call("PATCH", "/api/admin/settings", payload, self.cookie, headers)

    def test_get_gives_what_the_page_shows(self):
        status, r, body = self.s.json_call("GET", "/api/admin/settings", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(r.getheader("Cache-Control"), "no-store")
        self.assertEqual(body["v"], 1)
        self.assertEqual(body["set"], {})
        self.assertIsNone(body["version"])
        self.assertEqual(body["file"], tomllib.loads(CONFIG))
        self.assertEqual(body["status"]["interval_s"], 10)
        self.assertEqual(body["status"]["things"][0]["name"], "Vault")
        self.assertEqual(body["status"]["config"], STATE["config"])
        self.assertEqual(body["credentials"], CREDENTIALS)
        self.assertEqual(body["problems"], [])
        self.assertNoPassword(json.dumps(body))

    def test_a_valid_change_is_kept_and_written(self):
        status, _, body = self.patch({"v": 1, "set": {"collector.interval_s": 15}})
        self.assertEqual(status, 200)
        self.assertEqual(body["set"], {"collector.interval_s": 15})
        path = os.path.join(self.s.data, overlay.FILE)
        with open(path, "rb") as fh:
            data = fh.read()
        self.assertEqual(json.loads(data), {"v": 1, "set": {"collector.interval_s": 15}})
        self.assertEqual(body["version"], overlay.version_of(data))
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o640)
        self.assertIn("admin settings saved: collector.interval_s", self.s.log.getvalue())
        # Reset puts the file's value back.
        status, _, body = self.patch({"reset": ["collector.interval_s"]})
        self.assertEqual((status, body["set"]), (200, {}))

    def test_a_refused_change_keeps_nothing_and_has_the_collectors_words(self):
        self.patch({"set": {"collector.interval_s": 15}})
        before = self.s.admin.answer()["version"]
        status, _, body = self.patch({"set": {"collector.http_timeout_s": 16.0}})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "collector.http_timeout_s: must be shorter than interval_s")
        # The same words check-config gives for the same file.
        raw = overlay.lay(tomllib.loads(CONFIG), {"collector.http_timeout_s": 16.0})
        with self.assertRaises(config.ConfigError) as caught:
            config.build(raw)
        self.assertEqual(caught.exception.problems, [body["error"]])
        self.assertEqual(self.s.admin.answer()["version"], before)
        status, _, body = self.patch({"set": {"conditions.priority": ["attack", "wan_down"]}})
        self.assertEqual(status, 400)
        self.assertIn('leaves out "thing_down", so Vault would never alert', body["error"])

    def test_a_change_needing_an_absent_credential_names_its_variable(self):
        status, _, body = self.patch({"set": {"sources.sonarr.enabled": True}})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], ".env: KNIGHTWATCHER_SONARR_API_KEY missing (for sonarr)")
        creds = dict(CREDENTIALS, KNIGHTWATCHER_SONARR_API_KEY=True)
        with open(os.path.join(self.s.out, "credentials.json"), "w", encoding="utf-8") as fh:
            json.dump(creds, fh)
        status, _, body = self.patch({"set": {"sources.sonarr.enabled": True}})
        self.assertEqual(status, 200)

    def test_a_path_the_page_may_not_set_is_refused(self):
        for given, words in (
            ({"collector.output_dir": "/x"}, "collector.output_dir: not set on the admin page"),
            (
                {"sources.sonarr.secret": "other"},
                "sources.sonarr.secret: not set on the admin page",
            ),
            ({"look.tabard": "teal"}, "look.tabard: unknown setting"),
            ({"collector.interval_s": "15"}, "collector.interval_s: expected a whole number"),
        ):
            status, _, body = self.patch({"set": given})
            self.assertEqual((status, body["error"]), (400, words))
        status, _, body = self.patch({"reset": ["collector.nothing"]})
        self.assertEqual((status, body["error"]), (400, "collector.nothing: unknown setting"))
        status, _, body = self.patch({"v": 2, "set": {}})
        self.assertEqual(body["error"], "v: must be 1")
        self.assertEqual(self.patch({})[2]["error"], "name a setting in set or reset")

    def test_the_watched_things_list_replaces_the_files_whole(self):
        things = [
            {"name": "Gate cam", "kind": "camera", "url": "https://198.51.100.31/"},
            {"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445},
        ]
        status, _, body = self.patch({"set": {"thing": things}})
        self.assertEqual(status, 200)
        raw = overlay.lay(body["file"], body["set"])
        self.assertEqual([t["name"] for t in raw["thing"]], ["Gate cam", "Vault"])
        status, _, body = self.patch({"set": {"thing": [things[1], dict(things[1])]}})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], 'thing[1].name: "Vault" is already the name of thing[0]')

    def test_a_source_set_up_here(self):
        status, _, body = self.patch(
            {
                "set": {
                    "sources.radarr.url": "http://192.0.2.31:7878",
                    "sources.radarr.enabled": False,
                }
            }
        )
        self.assertEqual(status, 200)
        status, _, body = self.patch({"set": {"sources.radarr.enabled": True}})
        self.assertEqual(body["error"], ".env: KNIGHTWATCHER_RADARR_API_KEY missing (for radarr)")

    def test_the_new_problem_comes_first(self):
        # config.toml with a credential the collector lacks: every change is refused, and the one
        # the change brings is named first.
        with open(self.s.config_path, "a", encoding="utf-8") as fh:
            fh.write('\n[sources.streams]\nurl = "http://192.0.2.20:8181"\n')
        status, _, body = self.patch({"set": {"collector.interval_s": 2}})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "collector.interval_s: must be at least 5")
        self.assertIn(
            ".env: KNIGHTWATCHER_TAUTULLI_API_KEY missing (for streams)", body["problems"]
        )
        answer = self.s.json_call("GET", "/api/admin/settings", cookie=self.cookie)[2]
        self.assertEqual(
            answer["problems"], [".env: KNIGHTWATCHER_TAUTULLI_API_KEY missing (for streams)"]
        )

    def test_reset_puts_everything_back_the_shared_settings_too(self):
        self.patch({"set": {"collector.interval_s": 15}})
        self.assertEqual(self.s.put({"v": 1, "look": {"tabard": "teal"}})[0], 200)
        status, _, body = self.s.json_call("POST", "/api/admin/reset", {"v": 1}, self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(body["set"], {})
        with open(os.path.join(self.s.data, overlay.FILE), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh), {"v": 1, "set": {}})
        with open(os.path.join(self.s.data, SHARED_FILE), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["look"], {})
        status, _, shared = self.s.json_call("GET", "/api/settings")
        self.assertEqual(shared, {"v": 1, "look": {}, "display": {}, "quiet": {}, "scenes": {}})

    def test_reset_is_refused_while_config_toml_alone_would_be(self):
        self.patch({"set": {"collector.interval_s": 15}})
        with open(self.s.config_path, "w", encoding="utf-8") as fh:
            fh.write("[collector\n")
        status, _, body = self.s.json_call("POST", "/api/admin/reset", {"v": 1}, self.cookie)
        self.assertEqual(status, 400)
        self.assertIn("config.toml", body["error"])
        self.assertEqual(self.s.admin.answer()["set"], {"collector.interval_s": 15})

    def test_the_store_is_read_again_at_start_and_a_key_it_cannot_hold_left_out(self):
        path = os.path.join(self.s.data, overlay.FILE)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"v": 1, "set": {"collector.interval_s": 15, "collector.gone_s": 3}}, fh)
        with self.assertLogs("server", "WARNING") as logs:
            again = admin.Admin(
                self.s.data, self.s.out, self.s.config_path, self.s.admin.gate, None
            )
        self.assertEqual(again.answer()["set"], {"collector.interval_s": 15})
        self.assertIn("collector.gone_s: unknown setting, so it is left out", logs.output[0])

    def test_a_store_changed_by_hand_is_read_again(self):
        self.patch({"set": {"collector.interval_s": 15}})
        path = os.path.join(self.s.data, overlay.FILE)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"v": 1, "set": {"collector.interval_s": 20}}\n')
        body = self.s.json_call("GET", "/api/admin/settings", cookie=self.cookie)[2]
        self.assertEqual(body["set"], {"collector.interval_s": 20})
        with open(path, "rb") as fh:
            self.assertEqual(body["version"], overlay.version_of(fh.read()))
        os.unlink(path)
        body = self.s.json_call("GET", "/api/admin/settings", cookie=self.cookie)[2]
        self.assertEqual((body["set"], body["version"]), ({}, None))

    def test_the_export_is_a_complete_config_toml_without_credentials(self):
        self.patch(
            {
                "set": {
                    "collector.interval_s": 15,
                    "conditions.disk_full.pct": 80,
                    "thing": [
                        {"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445}
                    ],
                }
            }
        )
        self.s.put({"v": 1, "look": {"tabard": "teal"}, "display": {"clock": 12}})
        status, r, data = self.s.json_call("GET", "/api/admin/export", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(r.getheader("Content-Type"), "text/plain; charset=utf-8")
        self.assertEqual(r.getheader("Content-Disposition"), 'attachment; filename="config.toml"')
        text = data.decode("utf-8")
        raw = tomllib.loads(text)
        exported = config.build(raw)
        layered = config.build(overlay.lay(tomllib.loads(CONFIG), self.s.admin.answer()["set"]))
        self.assertEqual(exported.collector, layered.collector)
        self.assertEqual(exported.conditions, layered.conditions)
        self.assertEqual(exported.sources, layered.sources)
        self.assertEqual(exported.things, layered.things)
        self.assertEqual(exported.defaults["look"], {"skin": "tan", "tabard": "teal"})
        self.assertEqual(exported.defaults["display"], {"clock": 12})
        self.assertIn("# Not set up.", text)
        self.assertIn("# [sources.radarr]", text)
        self.assertIn("reads KNIGHTWATCHER_SONARR_API_KEY from .env", text)
        self.assertNotIn("api_key =", text.lower())
        self.assertTrue(all(len(line) <= 120 for line in text.splitlines()))
        self.assertNoPassword(text)

    def test_the_schema_is_served_to_a_signed_in_page(self):
        status, _, body = self.s.json_call("GET", "/api/admin/schema", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(body, config.schema.SCHEMA)

    def test_credentials_json_is_read_and_never_served(self):
        self.assertEqual(self.s.request("GET", "/data/credentials.json")[0], 404)
        self.assertEqual(self.s.request("GET", "/data/../data/credentials.json")[0], 404)


class PageTest(unittest.TestCase):
    def test_the_admin_page_is_served_at_admin_and_stamped_with_the_rest(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        with tempfile.TemporaryDirectory() as tmp:
            web = os.path.join(tmp, "web")
            shutil.copytree(os.path.join(root, "web"), web, ignore=shutil.ignore_patterns("data"))
            version = stamp.stamp(web)
            s = AdminRunning(web=web)
            try:
                status, r, _ = s.request("GET", "/admin")
                self.assertEqual((status, r.getheader("Location")), (302, "admin/"))
                status, r, body = s.request("GET", "/admin/")
                self.assertEqual(status, 200)
                self.assertEqual(r.getheader("Content-Type"), "text/html; charset=utf-8")
                self.assertEqual(r.getheader("Cache-Control"), "no-cache")
                text = body.decode("utf-8")
                self.assertIn(f'<meta name="kw-version" content="{version}">', text)
                self.assertIn(f'<script src="admin.js?v={version}"></script>', text)
                self.assertIn(f'<script src="../js/knight.js?v={version}"></script>', text)
                self.assertIn(f'href="admin.css?v={version}"', text)
                self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
                status, r, _ = s.request("GET", f"/admin/admin.js?v={version}")
                self.assertEqual(status, 200)
                self.assertIn("immutable", r.getheader("Cache-Control"))
            finally:
                s.close()


class StartTest(unittest.TestCase):
    def test_the_password_is_taken_out_of_the_environment_and_never_logged(self):
        password = secrets.token_urlsafe(18)
        log = io.StringIO()
        handler = logging.StreamHandler(log)
        logging.getLogger("server").addHandler(handler)
        self.addCleanup(logging.getLogger("server").removeHandler, handler)
        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.dict(os.environ, {admin.PASSWORD_VARIABLE: password}),
            mock.patch.object(app.Server, "serve_forever", side_effect=SystemExit(0)),
            mock.patch("server.app.signal.signal"),
        ):
            web = os.path.join(tmp, "web")
            os.makedirs(web)
            with open(os.path.join(web, "index.html"), "w") as fh:
                fh.write("<p>page</p>\n")
            with self.assertRaises(SystemExit):
                app.main(
                    [
                        "--web", web, "--out", tmp, "--data", tmp, "--address", "127.0.0.1",
                        "--port", "0", "--config", os.path.join(tmp, "config.toml"),
                    ]
                )  # fmt: skip
            self.assertNotIn(admin.PASSWORD_VARIABLE, os.environ)
        self.assertNotIn(password, log.getvalue())
        self.assertIn("server started", log.getvalue())


if __name__ == "__main__":
    unittest.main()
