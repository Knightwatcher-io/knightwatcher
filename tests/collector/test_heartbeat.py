"""The usage counts: collector/heartbeat.py, the display count of collector/displays.py, and the
collector's loop that sends them.

Every send here goes to a local fake receiver (kw_helpers.FakeHttp) or to a fake post; kw_helpers
points heartbeat.ENDPOINT at a closed loopback port for the whole run, so that no test can reach the
project's receiver. Every name, title, address and credential is invented.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import logging
import os
import re
import signal
import tempfile
import threading
import time
import unittest
from unittest import mock

from collector import contract, displays, heartbeat, providers
from collector.cli import main
from collector.config import build
from collector.runner import Runner
from collector.store import Memory
from kw_helpers import FakeHttp, FakeProc, make_config

NOW = dt.datetime(2026, 11, 22, 12, 0, 0, tzinfo=dt.UTC)
H = 3600

# A provider file of a user's own, of the streams kind: its id must never be sent.
ROBINFLIX = """\
format = 1
id = "robinflix"
kind = "streams"
name = "Robinflix"

[credentials]
token = "Robinflix's token."

[[request]]
path = "/api/sessions"
headers = { X-Token = "{credential.token}" }

[fill]
count = { path = "$.total", type = "int" }
"""

# A config full of what must never leave the host: names, titles, addresses, URLs, credentials.
SECRETS = {
    "KW_ROBINFLIX_TOKEN": "robin-token-5d1e",
    "KW_PIHOLE_PASSWORD": "sams-pihole-password",
    "KW_SONARR_API_KEY": "fedcba9876543210fedcba9876543210",
    "KW_SONARR_ALEX_API_KEY": "00112233445566778899aabbccddeeff",
    "KW_NAS_HEADER": "alex-nas-header-value",
}
FULL = {
    "collector": {"timezone": "Europe/London"},
    "sources": {
        "host": {},
        "wan": {"urls": ["http://robins-router.example.com/ping"]},
        "dns": {"server": "192.0.2.53", "name": "sams-house.example.com"},
        "pi": {"host": "192.0.2.4"},
        "streams": {"from": "robinflix", "url": "http://192.0.2.10:8096", "show": "names"},
        "adblock": {"from": "pihole", "url": "https://192.0.2.11"},
        "sonarr": {"url": "http://192.0.2.12:8989"},
        "imports": [
            {
                "name": "robins-films",
                "from": "sonarr",
                "url": "http://192.0.2.13",
                "secret": "sonarr_alex",
            },
            {
                "name": "sams-shows",
                "from": "sonarr",
                "url": "http://192.0.2.14",
                "secret": "sonarr_alex",
            },
            {
                "name": "alex-albums",
                "from": "sonarr",
                "url": "http://192.0.2.15",
                "secret": "sonarr_alex",
            },
        ],
        "json": [
            {
                "name": "alex-nas",
                "url": "http://192.0.2.40:8080/api/robin",
                "path": "$.disks[0].temp_c",
                "test": "above",
                "value": 70,
                "as": "cpu_hot",
                "headline": "ROBIN HOT",
                "detail": "Sam's disk at {value} C",
                "header": "X-Api-Key",
                "secret": "nas",
            },
            {
                "name": "sams-pool",
                "url": "http://192.0.2.41/status",
                "path": "$.pool",
                "test": "equals",
                "value": "Alex degraded",
                "as": "disk_full",
                "headline": "POOL",
                "detail": "Alex",
            },
        ],
    },
    "device": [
        {"name": "Robins laptop", "kind": "machine", "host": "192.0.2.5", "port": 445},
        {"name": "Sams camera", "kind": "camera", "url": "http://192.0.2.6/alive"},
    ],
    "look": {
        "world": "medieval",
        "build": "b",
        "tabard": "teal",
        "skin": "robin.pack/skin-of-robin",
        "plume": "kw.base/gold",
        "items": {
            "main": "kw.base/main.longsword",
            "back": "sam.pack/cape-of-sam",
            "helmet": "alex.pack/helm-of-alex",
        },
    },
    "display": {"clock": 12},
}
NEVER = [
    "Robin",
    "robin",
    "Sam",
    "sams",
    "Alex",
    "alex",
    "192.0.2",
    "example.com",
    "http",
    "8096",
    "Europe",
    "London",
    "laptop",
    "camera",
    "HOT",
    "POOL",
    "robinflix",
    "films",
    "shows",
    "albums",
    "nas",
    "pool",
    "Robinflix",
    *SECRETS.values(),
]


def full_config(folder: str):
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "robinflix.toml"), "w", encoding="utf-8") as fh:
        fh.write(ROBINFLIX)
    return build(json.loads(json.dumps(FULL)), SECRETS, providers=providers.scan(folder))


class Clock:
    """A monotonic clock and a wall clock that move together."""

    def __init__(self):
        self.t = 1000.0

    def mono(self) -> float:
        return self.t

    def wall(self) -> dt.datetime:
        return NOW + dt.timedelta(seconds=self.t - 1000.0)

    def advance(self, seconds: float) -> None:
        self.t += seconds


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.var = os.path.join(self.tmp.name, "var")
        self.srv = os.path.join(self.tmp.name, "server")
        os.mkdir(self.var)
        os.mkdir(self.srv)

    def beat(self, clock: Clock | None = None, **kw) -> heartbeat.Heartbeat:
        clock = clock or Clock()
        kw.setdefault("spawn", lambda fn, *args: fn(*args))
        kw.setdefault("post", lambda url, body, timeout: None)
        return heartbeat.Heartbeat(self.var, self.srv, clock=clock.mono, wall=clock.wall, **kw)


# ---- The payload ------------------------------------------------------------------------------


class PayloadTest(Case):
    def built(self, config=None, **kw):
        config = config or full_config(os.path.join(self.tmp.name, "providers"))
        return self.beat(**kw).build(config)

    def test_the_receiver_is_the_contracts_and_no_test_can_reach_it(self):
        self.assertEqual(heartbeat.RECEIVER, "https://telemetry.knightwatcher.io/v1/heartbeat")
        self.assertTrue(heartbeat.ENDPOINT.startswith("http://127.0.0.1:"), heartbeat.ENDPOINT)

    def test_the_exact_fields_and_the_form_of_each(self):
        body = self.built()
        self.assertEqual(list(body), list(heartbeat.FIELDS))
        self.assertEqual(heartbeat.check(body), [])
        self.assertEqual(body["schema"], 1)
        self.assertRegex(
            body["install_id"],
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        )
        self.assertRegex(body["version"], r"^[A-Za-z0-9._+-]{1,40}$")
        for key in ("install_age_days", "uptime_hours", "imports", "checks", "displays"):
            self.assertIs(type(body[key]), int, key)
        for key in ("world", "build"):
            self.assertRegex(body[key], r"^[a-z0-9_-]{1,40}$")
        self.assertEqual(body["items"], sorted(set(body["items"])))
        for v in body["items"]:
            self.assertRegex(v, r"^[a-z0-9_-]{1,40}$")
        self.assertEqual(body["sources"], sorted(set(body["sources"])))
        for v in body["sources"]:
            self.assertRegex(v, r"^[a-z0-9_]{1,32}(:[a-z0-9_]{1,32})?$")
        for k, v in body["look"].items():
            self.assertRegex(k, r"^[a-z0-9_-]{1,40}$")
            self.assertRegex(v, r"^[a-z0-9_-]{1,40}$")
        self.assertLessEqual(len(heartbeat.encode(body)), 4096)

    def test_check_refuses_every_breach_of_the_contract(self):
        good = self.built()
        breaches = {
            "an extra field": {**good, "host": "vault"},
            "a missing field": {k: v for k, v in good.items() if k != "displays"},
            "schema 2": {**good, "schema": 2},
            "schema true": {**good, "schema": True},
            "an upper-case id": {**good, "install_id": good["install_id"].upper()},
            "a version 4 id that is not": {
                **good,
                "install_id": "0" * 8 + "-0000-1000-8000-" + "0" * 12,
            },
            "a version with a slash": {**good, "version": "a/b"},
            "a version of 41": {**good, "version": "v" * 41},
            "uptime as text": {**good, "uptime_hours": "3"},
            "too many imports": {**good, "imports": 17},
            "too many checks": {**good, "checks": 65},
            "too many displays": {**good, "displays": 1001},
            "a negative age": {**good, "install_age_days": -1},
            "a world with a dot": {**good, "world": "kw.medieval"},
            "items unsorted": {**good, "items": ["b", "a"]},
            "items twice": {**good, "items": ["a", "a"]},
            "a source with a capital": {**good, "sources": ["Host"]},
            "a look of a long name": {**good, "look": {"skin": "acme/fur"}},
            "a look of 33": {**good, "look": {f"k{i}": "v" for i in range(33)}},
        }
        for what, body in breaches.items():
            self.assertNotEqual(heartbeat.check(body), [], what)

    def test_built_in_parts_by_their_ids_and_anything_a_user_made_as_custom(self):
        body = self.built()
        self.assertEqual(body["world"], "medieval")
        self.assertEqual(body["build"], "b")
        # kw.base/main.longsword is the base pack's; the two of the users' own packs are one custom
        self.assertEqual(body["items"], ["custom", "main_longsword"])
        self.assertEqual(body["look"], {"plume": "gold", "skin": "custom", "tabard": "teal"})
        # a provider file of your own is kind:custom, a built-in kind:id, the rest a name
        self.assertEqual(
            body["sources"],
            ["adblock:pihole", "dns", "host", "imports:sonarr", "pi", "streams:custom", "wan"],
        )

    def test_a_long_name_counts_as_built_in_only_for_a_part_a_shipped_pack_holds(self):
        cases = [
            ({"world": "kw.medieval/world.medieval"}, "world", "medieval"),
            ({"world": "robin.pack/world.robin"}, "world", "custom"),
            ({"build": "kw.base/build.c"}, "build", "c"),
            ({"build": "kw.base/build.z"}, "build", "custom"),
            ({"build": "sam.pack/build.a"}, "build", "custom"),
        ]
        for look, key, want in cases:
            config = make_config({"look": look})
            self.assertEqual(self.built(config)[key], want, look)
        config = make_config({"look": {"items": {"main": "kw.base/main.nothing"}}})
        self.assertEqual(self.built(config)["items"], ["custom"])
        config = make_config({"look": {"skin": "kw.base/deep", "hair": "kw.base/green"}})
        self.assertEqual(self.built(config)["look"], {"hair": "custom", "skin": "deep"})

    def test_nothing_set_is_null_and_empty(self):
        body = self.built(make_config({}))
        self.assertEqual(heartbeat.check(body), [])
        self.assertEqual(
            {
                k: body[k]
                for k in ("world", "build", "items", "look", "sources", "imports", "checks")
            },
            {
                "world": None,
                "build": None,
                "items": [],
                "look": {},
                "sources": [],
                "imports": 0,
                "checks": 0,
            },
        )

    def test_imports_and_checks_are_counted_and_never_named(self):
        body = self.built()
        self.assertEqual((body["imports"], body["checks"]), (3, 2))
        sent = heartbeat.encode(body).decode()
        for name in ("robins-films", "sams-shows", "alex-albums", "alex-nas", "sams-pool", "json:"):
            self.assertNotIn(name, sent)

    def test_no_name_title_address_url_or_credential_reaches_the_payload(self):
        with open(os.path.join(self.srv, "settings.json"), "w", encoding="utf-8") as fh:
            json.dump({"v": 1, "look": {"hair": "auburn", "props": "robin.pack/props.robin"}}, fh)
        sent = heartbeat.encode(self.built()).decode()
        for word in NEVER:
            self.assertNotIn(word, sent)
        # every text is the receiver's form of an id, a version or a UUID
        texts = re.findall(r'"([^"]*)"', sent)
        for t in texts:
            self.assertRegex(t, r"^[A-Za-z0-9._:+-]{1,40}$")

    def test_the_household_look_is_the_displays_choice_over_the_config(self):
        config = make_config(
            {"look": {"tabard": "teal", "plume": "red", "items": {"main": "kw.base/main.mace"}}}
        )
        with open(os.path.join(self.srv, "settings.json"), "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "v": 1,
                    "look": {
                        "plume": "gold",
                        "skin": "pink",
                        "items": {"back": "kw.base/back.cape"},
                    },
                },
                fh,
            )
        body = self.built(config)
        # the saved plume wins; the saved skin is refused by the config's checks and left out
        self.assertEqual(body["look"], {"plume": "gold", "tabard": "teal"})
        self.assertEqual(body["items"], ["back_cape", "main_mace"])
        # a world chosen on a display sets every part at its level, as on the page
        with open(os.path.join(self.srv, "settings.json"), "w", encoding="utf-8") as fh:
            json.dump({"v": 1, "look": {"world": "medieval"}}, fh)
        body = self.built(config)
        self.assertEqual((body["world"], body["look"], body["items"]), ("medieval", {}, []))
        # a file that is not version 1 is none saved
        with open(os.path.join(self.srv, "settings.json"), "w", encoding="utf-8") as fh:
            json.dump({"v": 2, "look": {"plume": "gold"}}, fh)
        self.assertEqual(self.built(config)["look"], {"plume": "red", "tabard": "teal"})

    def test_the_version_is_the_stamp_of_the_page_or_dev(self):
        web = os.path.join(self.tmp.name, "web")
        os.mkdir(web)
        self.assertEqual(heartbeat.version(web), "dev")
        for written, want in (
            ('{"version": "3f9c0d12ab45"}', "3f9c0d12ab45"),
            ('{"version": "../../etc"}', "dev"),
            ('{"version": "' + "a" * 41 + '"}', "dev"),
            ("not json", "dev"),
            ("[1]", "dev"),
        ):
            with open(os.path.join(web, "version.json"), "w", encoding="utf-8") as fh:
                fh.write(written)
            self.assertEqual(heartbeat.version(web), want, written)
        # the checkout's own web/ is unstamped
        self.assertEqual(heartbeat.version(), "dev")

    def test_ages_are_whole_days_and_hours(self):
        clock = Clock()
        b = self.beat(clock)
        clock.advance(3 * H - 1)
        self.assertEqual(b.build(make_config({}))["uptime_hours"], 2)
        clock.advance(1)
        self.assertEqual(b.build(make_config({}))["uptime_hours"], 3)
        clock.advance(2 * 86400)
        body = b.build(make_config({}))
        self.assertEqual((body["install_age_days"], body["uptime_hours"]), (2, 51))
        # a restart keeps the install's age and starts the uptime again
        again = self.beat(clock)
        body = again.build(make_config({}))
        self.assertEqual((body["install_age_days"], body["uptime_hours"]), (2, 0))


# ---- The install id ---------------------------------------------------------------------------


class InstallTest(Case):
    def test_the_first_start_makes_the_id_and_logs_the_notice_once(self):
        with self.assertLogs("collector", "INFO") as logs:
            first = self.beat()
        self.assertEqual(len(logs.records), 1)
        said = logs.records[0].getMessage()
        self.assertEqual(logs.records[0].levelno, logging.INFO)
        for words in (
            heartbeat.ENDPOINT,
            "KW_ANALYTICS=on",
            "KW_ANALYTICS=off",
            ".env",
            "docs/telemetry.md",
            "six hours",
        ):
            self.assertIn(words, said)
        with open(os.path.join(self.var, "install.json"), encoding="utf-8") as fh:
            held = json.load(fh)
        self.assertEqual(held, {"install_id": first.install_id, "created": "2026-11-22T12:00:00Z"})
        self.assertEqual(os.stat(os.path.join(self.var, "install.json")).st_mode & 0o777, 0o640)
        # a second start keeps the id and says nothing
        with self.assertNoLogs("collector", "INFO"):
            second = self.beat()
        self.assertEqual(second.install_id, first.install_id)

    def test_an_emptied_or_broken_file_makes_a_new_id(self):
        first = self.beat()
        for broken in (
            "",
            "{nope",
            '{"install_id": "robin", "created": "2026-11-22T12:00:00Z"}',
            '{"install_id": "' + first.install_id + '"}',
        ):
            with open(os.path.join(self.var, "install.json"), "w", encoding="utf-8") as fh:
                fh.write(broken)
            with self.assertLogs("collector", "INFO"):
                again = self.beat()
            self.assertNotEqual(again.install_id, first.install_id, broken)
        os.unlink(os.path.join(self.var, "install.json"))
        self.assertNotEqual(self.beat().install_id, first.install_id)


# ---- KW_ANALYTICS -----------------------------------------------------------------------------


class SwitchTest(Case):
    def test_only_on_trimmed_in_any_case_turns_it_on(self):
        for value in ("on", "ON", " on ", "On\n", "\toN"):
            self.assertTrue(heartbeat.enabled({"KW_ANALYTICS": value}), repr(value))
            self.assertFalse(heartbeat.unclear({"KW_ANALYTICS": value}), repr(value))
        for value in ("off", "OFF", " off ", ""):
            self.assertFalse(heartbeat.enabled({"KW_ANALYTICS": value}), repr(value))
            self.assertFalse(heartbeat.unclear({"KW_ANALYTICS": value}), repr(value))
        # near misses, and the words someone might write for yes, stay off and are unclear
        for value in ("o n", "on-ish", "onn", "true", "1", "yes", "enabled", "of"):
            self.assertFalse(heartbeat.enabled({"KW_ANALYTICS": value}), repr(value))
            self.assertTrue(heartbeat.unclear({"KW_ANALYTICS": value}), repr(value))
        self.assertFalse(heartbeat.enabled({}))
        self.assertFalse(heartbeat.unclear({}))
        # DO_NOT_TRACK is not a control either way
        self.assertFalse(heartbeat.enabled({"DO_NOT_TRACK": "0"}))
        self.assertTrue(heartbeat.enabled({"KW_ANALYTICS": "on", "DO_NOT_TRACK": "1"}))

    def test_off_makes_no_id_logs_one_line_and_never_connects(self):
        for env in ({"KW_ANALYTICS": " OFF "}, {"KW_ANALYTICS": ""}, {}):
            receiver = FakeHttp()
            self.addCleanup(receiver.close)
            with self.assertLogs("collector", "INFO") as logs:
                beat = heartbeat.start(
                    env,
                    self.var,
                    self.srv,
                    endpoint=receiver.url + "/v1/heartbeat",
                )
            self.assertIsNone(beat, env)
            self.assertEqual([r.getMessage() for r in logs.records], [heartbeat.OFF_LINE], env)
            self.assertEqual(os.listdir(self.var), [], env)
            self.assertEqual(receiver.calls, [], env)

    def test_an_unclear_value_stays_off_with_a_warning(self):
        with self.assertLogs("collector", "INFO") as logs:
            beat = heartbeat.start({"KW_ANALYTICS": "yes"}, self.var, self.srv)
        self.assertIsNone(beat)
        said = [(r.levelno, r.getMessage()) for r in logs.records]
        self.assertEqual(
            said,
            [(logging.WARNING, heartbeat.UNCLEAR_LINE), (logging.INFO, heartbeat.OFF_LINE)],
        )
        self.assertNotIn("yes", heartbeat.UNCLEAR_LINE)
        self.assertEqual(os.listdir(self.var), [])

    def test_the_off_line_says_how_to_turn_it_on(self):
        for words in ("KW_ANALYTICS=on", ".env", "docs/telemetry.md"):
            self.assertIn(words, heartbeat.OFF_LINE)

    def test_on_starts_it(self):
        beat = heartbeat.start(
            {"KW_ANALYTICS": "on"}, self.var, self.srv, spawn=lambda fn, *a: None
        )
        self.assertIsInstance(beat, heartbeat.Heartbeat)
        self.assertEqual(os.listdir(self.var), ["install.json"])


# ---- The schedule -----------------------------------------------------------------------------


class ScheduleTest(Case):
    def setUp(self):
        super().setUp()
        self.receiver = FakeHttp()
        self.addCleanup(self.receiver.close)
        self.receiver.routes["POST /v1/heartbeat"] = (204, None)
        self.url = self.receiver.url + "/v1/heartbeat"
        self.config = make_config({})
        self.clock = Clock()

    def posts(self):
        return [c for c in self.receiver.calls if c[0] == "POST"]

    def test_at_start_then_every_six_hours_and_an_hour_after_a_failure(self):
        timeouts = []

        def post(url, body, timeout):
            timeouts.append(timeout)
            heartbeat._post(url, body, timeout)

        b = self.beat(self.clock, endpoint=self.url, post=post)
        sent_at = []

        def tick(at_s):
            self.clock.t = 1000.0 + at_s
            before = len(self.posts())
            b.tick(self.config)
            b.tick(self.config)  # collects the result of a send that has finished
            if len(self.posts()) > before:
                sent_at.append(at_s)

        with self.assertLogs("collector", "INFO") as logs:
            tick(0)
        self.assertEqual(sent_at, [0])
        self.assertIn(f"usage counts sent to {self.url}", [r.getMessage() for r in logs.records])
        for at_s in (60, H, 6 * H - 1):
            tick(at_s)
        self.assertEqual(sent_at, [0])
        tick(6 * H)
        self.assertEqual(sent_at, [0, 6 * H])
        # the receiver fails: the next attempt is an hour later, the warning at most once an hour
        self.receiver.routes["POST /v1/heartbeat"] = (500, {"error": "boom"})
        with self.assertLogs("collector", "WARNING") as logs:
            tick(12 * H)
        self.assertEqual(
            [r.getMessage() for r in logs.records if r.levelno == logging.WARNING],
            ["usage counts not sent (HTTP 500); trying again in an hour"],
        )
        tick(13 * H - 1)
        self.assertEqual(sent_at, [0, 6 * H, 12 * H])
        tick(13 * H)
        self.assertEqual(sent_at[-1], 13 * H)
        # the six-hour rhythm resumes after a success
        self.receiver.routes["POST /v1/heartbeat"] = (204, None)
        tick(14 * H)
        tick(20 * H - 1)
        self.assertEqual(sent_at[-1], 14 * H)
        tick(20 * H)
        self.assertEqual(sent_at, [0, 6 * H, 12 * H, 13 * H, 14 * H, 20 * H])
        self.assertEqual(set(timeouts), {10.0})
        # each body kept the contract and went as JSON
        for method, path, headers, body in self.posts():
            self.assertEqual((method, path), ("POST", "/v1/heartbeat"))
            self.assertEqual(headers["Content-Type"], "application/json")
            self.assertEqual(heartbeat.check(body), [])
        self.assertEqual(self.posts()[-1][3]["uptime_hours"], 20)

    def test_a_failure_warns_at_most_once_an_hour(self):
        failures = []

        def post(url, body, timeout):
            failures.append(url)
            raise heartbeat.net.SourceError("name not resolved")

        b = self.beat(self.clock, endpoint=self.url, post=post)
        with self.assertLogs("collector", "WARNING") as logs:
            for at_s in (0, H, 2 * H - 1, 2 * H, 3 * H):
                self.clock.t = 1000.0 + at_s
                b.tick(self.config)
                b.tick(self.config)
        warnings = [r for r in logs.records if r.levelno == logging.WARNING]
        self.assertEqual(len(failures), 4)
        self.assertEqual(len(warnings), 4)
        # a burst of failures inside the hour is one warning
        self.clock.t = 1000.0 + 3 * H
        b._attempt, b._next = self.clock.t, self.clock.t
        with self.assertNoLogs("collector", "WARNING"):
            b.tick(self.config)
            b.tick(self.config)

    def test_a_send_never_waits_on_the_network_and_never_overlaps(self):
        release = threading.Event()
        started = []

        def post(url, body, timeout):
            started.append(url)
            release.wait(5)

        b = heartbeat.Heartbeat(
            self.var,
            self.srv,
            clock=self.clock.mono,
            wall=self.clock.wall,
            post=post,
            endpoint=self.url,
        )
        t0 = time.monotonic()
        b.tick(self.config)
        self.assertLess(time.monotonic() - t0, 1.0)
        # an hour later the first is still running, so no second starts
        self.clock.advance(7 * H)
        b.tick(self.config)
        self.assertEqual(len(started), 1)
        release.set()

    def test_a_send_that_raises_anything_is_a_failure_and_never_escapes(self):
        def post(url, body, timeout):
            raise RuntimeError("boom")

        b = self.beat(self.clock, endpoint=self.url, post=post)
        with self.assertLogs("collector", "WARNING") as logs:
            b.tick(self.config)
            b.tick(self.config)
        self.assertIn("internal error (RuntimeError)", logs.records[-1].getMessage())


# ---- The displays -----------------------------------------------------------------------------


class DisplaysTest(Case):
    def write(self, seen):
        with open(os.path.join(self.srv, displays.FILE), "wb") as fh:
            fh.write(seen if isinstance(seen, bytes) else displays.dump(seen))

    def test_the_count_is_of_the_ids_seen_in_the_last_six_hours(self):
        ago = lambda s: NOW - dt.timedelta(seconds=s)  # noqa: E731
        self.write(
            {
                "a" * 32: ago(60),
                "b" * 32: ago(6 * H - 1),
                "c" * 32: ago(6 * H),
                "d" * 32: ago(6 * H + 1),
                "e" * 32: ago(30 * H),
                "f" * 32: NOW + dt.timedelta(minutes=5),  # a clock that went back
            }
        )
        self.assertEqual(displays.read(os.path.join(self.srv, displays.FILE), NOW), 4)
        self.assertEqual(self.beat().build(make_config({}))["displays"], 4)

    def test_a_missing_or_broken_file_is_none_and_a_bad_entry_is_left_out(self):
        path = os.path.join(self.srv, displays.FILE)
        self.assertEqual(displays.read(path, NOW), 0)
        for data in (b"", b"{nope", b"[]", b'{"v": 2, "seen": {}}', b'{"v": 1, "seen": []}'):
            self.write(data)
            self.assertEqual(displays.read(path, NOW), 0, data)
        good = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.write(
            json.dumps(
                {
                    "v": 1,
                    "seen": {
                        "a" * 32: good,
                        "A" * 32: good,
                        "a" * 31: good,
                        "b" * 32: 7,
                        "c" * 32: "yesterday",
                        "d" * 32: good,
                    },
                }
            ).encode()
        )
        with open(path, "rb") as fh:
            self.assertEqual(sorted(displays.parse(fh.read())), ["a" * 32, "d" * 32])
        self.assertEqual(self.beat().build(make_config({}))["displays"], 2)
        # a file far larger than a thousand ids is not read
        self.write(b" " * (displays.MAX_FILE + 1))
        self.assertEqual(displays.read(path, NOW), 0)

    def test_at_most_a_thousand_are_kept_the_newest(self):
        seen = {f"{i:032x}": NOW - dt.timedelta(seconds=i) for i in range(1200)}
        kept = displays.keep(seen)
        self.assertEqual(len(kept), 1000)
        self.assertEqual(max(int(k, 16) for k in kept), 999)
        self.assertEqual(displays.count(kept, NOW), 1000)


# ---- The state file ---------------------------------------------------------------------------


class StateTest(Case):
    def runner(self):
        out = os.path.join(self.tmp.name, "out")
        os.mkdir(out)
        config = make_config({"collector": {"output_dir": out, "state_dir": self.var}})
        return Runner(config, Memory(self.var), sources=[])

    def test_the_file_says_on_or_off_only_when_told_so_the_port_proof_holds(self):
        r = self.runner()
        self.assertNotIn("analytics", r.cycle())
        for on in (True, False):
            r.analytics = {"on": on}
            state = r.cycle()
            self.assertEqual(state["analytics"], {"on": on})
            self.assertEqual(contract.validate(state), [])

    def test_the_contract_refuses_another_shape(self):
        state = self.runner().cycle()
        for bad in (True, {"on": "yes"}, {"on": 1}, {}, {"on": True, "id": "x"}):
            self.assertIn(
                "analytics is not an object with on, true or false, alone",
                contract.validate({**state, "analytics": bad}),
                bad,
            )


# ---- The collector's modes --------------------------------------------------------------------


class ModesTest(unittest.TestCase):
    """The command line: one-shot modes never send, and the loop sends at start."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        self.srv = os.path.join(self.tmp.name, "server")
        for d in (self.out, self.var, self.srv):
            os.mkdir(d)
        self.config = os.path.join(self.tmp.name, "config.toml")
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'proc_root = "{self.proc.root}"\n[sources.ssh]\n'
                '[look]\nworld = "medieval"\n'
            )
        self.receiver = FakeHttp()
        self.addCleanup(self.receiver.close)
        self.receiver.routes["POST /v1/heartbeat"] = (204, None)
        patcher = mock.patch.object(heartbeat, "ENDPOINT", self.receiver.url + "/v1/heartbeat")
        patcher.start()
        self.addCleanup(patcher.stop)
        clean = {k: v for k, v in os.environ.items() if not k.startswith("KW_")}
        env = mock.patch.dict(os.environ, clean, clear=True)
        env.start()
        self.addCleanup(env.stop)

    def run_cli(self, *args):
        err, out = io.StringIO(), io.StringIO()
        admin = os.path.join(self.srv, "admin.json")
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, "--admin", admin, *args])
        return code, err.getvalue()

    def loop(self, wait_for_post: bool):
        """Runs the collector's loop until it has sent (or for a second), then stops it as a
        signal would. Returns the exit code and the collector's log, one line a record."""
        old = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
        self.addCleanup(lambda: [signal.signal(s, h) for s, h in old.items()])

        def stop():
            deadline = time.monotonic() + (5 if wait_for_post else 1)
            while time.monotonic() < deadline:
                if wait_for_post and any(c[0] == "POST" for c in self.receiver.calls):
                    time.sleep(0.2)
                    break
                time.sleep(0.05)
            os.kill(os.getpid(), signal.SIGINT)

        threading.Thread(target=stop, daemon=True).start()
        with self.assertLogs("collector", "INFO") as logs:
            code, _ = self.run_cli()
        return code, "\n".join(r.getMessage() for r in logs.records)

    def test_one_shot_modes_never_send_and_make_no_id(self):
        os.environ["KW_ANALYTICS"] = "on"
        with mock.patch.object(heartbeat, "Heartbeat", side_effect=AssertionError("constructed")):
            self.assertEqual(self.run_cli("--once")[0], 0)
            self.assertEqual(self.run_cli("--check-config")[0], 0)
            self.assertEqual(self.run_cli("--health")[0], 0)
            self.assertEqual(self.run_cli("--probe", "host")[0], 2)
        self.assertEqual(self.receiver.calls, [])
        self.assertNotIn("install.json", os.listdir(self.var))
        # --once still says the counts are on, for the status page
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["analytics"], {"on": True})

    def test_once_with_kw_analytics_unset_says_the_counts_are_off(self):
        self.assertNotIn("KW_ANALYTICS", os.environ)
        self.assertEqual(self.run_cli("--once")[0], 0)
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["analytics"], {"on": False})

    def test_the_loop_sends_at_start_after_the_notice(self):
        os.environ["KW_ANALYTICS"] = "on"
        code, err = self.loop(wait_for_post=True)
        self.assertEqual(code, 0)
        posts = [c for c in self.receiver.calls if c[0] == "POST"]
        self.assertEqual(len(posts), 1)
        body = posts[0][3]
        self.assertEqual(heartbeat.check(body), [])
        self.assertEqual(body["world"], "medieval")
        self.assertEqual(body["sources"], ["ssh"])
        with open(os.path.join(self.var, "install.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["install_id"], body["install_id"])
        notice = err.index("usage counts: at start and every six hours")
        self.assertLess(notice, err.index("usage counts sent to"))
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["analytics"], {"on": True})
        # (a second start keeps the id and says nothing: InstallTest; the memory folder's lock is
        # held for the life of the process, so one loop a test)

    def test_the_loop_with_off_sends_nothing_and_says_so(self):
        os.environ["KW_ANALYTICS"] = "Off"
        code, err = self.loop(wait_for_post=False)
        self.assertEqual(code, 0)
        self.assertEqual(self.receiver.calls, [])
        self.assertIn(heartbeat.OFF_LINE, err)
        self.assertNotIn("install.json", os.listdir(self.var))
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["analytics"], {"on": False})

    def test_the_loop_with_kw_analytics_unset_sends_nothing(self):
        self.assertNotIn("KW_ANALYTICS", os.environ)
        code, err = self.loop(wait_for_post=False)
        self.assertEqual(code, 0)
        self.assertEqual(self.receiver.calls, [])
        self.assertIn(heartbeat.OFF_LINE, err)
        self.assertNotIn("install.json", os.listdir(self.var))
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["analytics"], {"on": False})


if __name__ == "__main__":
    unittest.main()
