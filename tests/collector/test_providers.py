"""Every built-in provider against its fixtures, and `from` in config.toml.

Each fixture in fixtures/providers/<id>/ holds the exchanges of one read, in the shapes the service
sends with every value invented: the request expected (its method, path, headers and, for a
session login, its JSON body), with each credential written as {credential.<field>}, and the reply.
After the read the provider is closed, so a provider that logs in by session ends with its logout.
The test serves the replies on a local HTTP server, fails when a request differs from the
fixture's, and compares the fill, or the error, with the fixture's. The credentials are made afresh
for each run. A streams provider is run at every setting of `show`,
and the vars behind a name must never be read unless `show` is `names`.
"""

import base64
import datetime as dt
import json
import os
import secrets
import unittest
from typing import ClassVar

from collector import config as config_mod
from collector import kinds, providers, text
from collector.config import ConfigError, credential_names
from collector.net import AuthError, SourceError
from collector.providers.engine import DataProvider
from collector.sources import KindSource
from kw_helpers import T0, FakeHttp, make_config

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "providers")


def fixtures():
    for pid in sorted(os.listdir(FIXTURES)):
        for name in sorted(os.listdir(os.path.join(FIXTURES, pid))):
            with open(os.path.join(FIXTURES, pid, name), encoding="utf-8") as fh:
                yield pid, name[: -len(".json")], json.load(fh)


def _filled(text, credentials):
    if isinstance(text, dict):
        return {k: _filled(v, credentials) for k, v in text.items()}
    if not isinstance(text, str):
        return text
    for field, value in credentials.items():
        text = text.replace("{credential." + field + "}", value)
    return text


def _plain(value):
    """A fill as a fixture writes it: each time as ISO 8601 text, to the second."""
    if isinstance(value, dt.datetime):
        return text.iso(value)
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_plain(v) for v in value]
    return value


def _reply(reply):
    """A fixture's reply as the local server sends it: JSON, a page, or no body at all."""
    if "json" in reply:
        return reply["json"]
    if "body" in reply:
        return reply["body"].encode()
    return None


def _vars_of(how) -> set[str]:
    """The vars a field of a list's items reads."""
    mode, what = how
    if mode == "var":
        return {what}
    if mode == "pick":
        return set(what)
    names = set()
    for case in what:
        names |= {v for v, _ in case.when}
        for template in case.tries:
            names |= {ref.name for ref in template.refs}
    return names


class FixturesTest(unittest.TestCase):
    def run_fixture(self, pid, case, fixture, show=None):
        spec = providers.get(pid)
        kind = kinds.kind_class(spec.kind)()
        credentials = {f: secrets.token_urlsafe(12) for f in fixture["credentials"]}
        self.assertEqual(sorted(credentials), sorted(spec.credentials), f"{pid}/{case}")
        http = FakeHttp()
        self.addCleanup(http.close)
        bare = [e["request"]["path"].split("?", 1)[0] for e in fixture["exchanges"]]
        for e, path in zip(fixture["exchanges"], bare, strict=True):
            want = e["request"]
            if bare.count(path) > 1:
                # Requests to one path that differ in their query are answered by the whole of it.
                path = _filled(want["path"], credentials)
            key = path if want["method"] == "GET" else f"{want['method']} {path}"
            http.routes[key] = (e["reply"]["status"], _reply(e["reply"]))
        settings = {"url": http.url, **fixture["settings"]}
        if show is not None:
            settings["show"] = show
        allowed = kind.allowed(settings)
        provider = DataProvider(spec, settings, credentials, 2.0, allowed)
        try:
            fill = kinds.check_fill(kind.FILL, provider.read(T0), allowed)
            error = None
        except SourceError as exc:
            fill, error = None, exc
        provider.close()
        where = f"{pid}/{case}" + (f" at show = {show}" if show else "")
        self.assertEqual(len(http.calls), len(fixture["exchanges"]), where)
        for (method, path, headers, sent), e in zip(http.calls, fixture["exchanges"], strict=True):
            want = e["request"]
            self.assertEqual(method, want["method"], where)
            self.assertEqual(path, _filled(want["path"], credentials), where)
            self.assertEqual(sent, _filled(want.get("json"), credentials), where)
            # Header names arrive in another case than they were sent in.
            headers = {k.lower(): v for k, v in headers.items()}
            for name, value in want["headers"].items():
                got = headers[name.lower()]
                if got.startswith("Basic "):
                    got = "Basic " + base64.b64decode(got[6:]).decode()
                self.assertEqual(got, _filled(value, credentials), where)
            self.assertEqual(headers["user-agent"], "knightwatcher", where)
        if "error" in fixture:
            self.assertIsNotNone(error, where)
            self.assertEqual(str(error), fixture["error"]["message"], where)
            self.assertEqual(isinstance(error, AuthError), fixture["error"]["auth"], where)
            return provider, None
        self.assertIsNone(error, f"{where}: {error}")
        want = fixture["fill"][show] if show is not None else fixture["fill"]
        self.assertEqual(_plain(fill), want, where)
        return provider, fill

    def test_every_built_in_provider_file_has_fixtures(self):
        # The code adapters are tested on their own (test_fail2ban.py).
        files = [p for p, s in providers.builtin().items() if not isinstance(s, providers.Adapter)]
        self.assertEqual(sorted({pid for pid, _, _ in fixtures()}), sorted(files))

    def test_each_fixture(self):
        for pid, case, fixture in fixtures():
            spec = providers.get(pid)
            if spec.kind == "streams":
                for show in ("names", "titles", "count"):
                    self.run_fixture(pid, case, fixture, show)
            else:
                self.run_fixture(pid, case, fixture)

    def test_every_streams_provider_gives_the_same_reading_of_the_same_streams(self):
        # The four fixtures list the same three invented streams, each in its service's own shape.
        cases = {(pid, case): fixture for pid, case, fixture in fixtures()}
        same = (
            ("plex", cases[("plex", "sessions")]),
            ("tautulli", cases[("tautulli", "activity")]),
            ("tracearr", cases[("tracearr", "streams")]),
            ("jellyfin", cases[("jellyfin", "sessions")]),
        )
        config = make_config({})
        for show in ("names", "titles", "count"):
            readings = []
            for pid, fixture in same:
                # A kind of its own for each, as each source has, so no first sight is shared.
                kind = kinds.kind_class("streams")()
                _, fill = self.run_fixture(pid, "same", fixture, show)
                readings.append(kind.reading(fill, {"show": show}, config, T0).facts)
            for pid, reading in zip([pid for pid, _ in same], readings, strict=True):
                self.assertEqual(reading, readings[0], f"{pid} at show = {show}")
        self.assertEqual(readings[0], {"count": 3}, "with count, nothing but the number of streams")

    def test_plex_sends_its_token_in_a_header_and_never_in_the_address(self):
        (fixture,) = [f for pid, case, f in fixtures() if (pid, case) == ("plex", "sessions")]
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/status/sessions"] = (200, fixture["exchanges"][0]["reply"]["json"])
        token = secrets.token_urlsafe(15)
        spec = providers.get("plex")
        settings = {"url": http.url, "show": "names"}
        allowed = kinds.kind_class("streams")().allowed(settings)
        DataProvider(spec, settings, {"token": token}, 2.0, allowed).read(T0)
        ((method, path, headers, _),) = http.calls
        self.assertEqual((method, path), ("GET", "/status/sessions"))
        self.assertEqual({k.lower(): v for k, v in headers.items()}["x-plex-token"], token)

    def test_tracearr_sends_its_key_as_a_bearer_token_and_never_in_the_address(self):
        (fixture,) = [f for pid, case, f in fixtures() if (pid, case) == ("tracearr", "streams")]
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/api/v2/public/streams"] = (200, fixture["exchanges"][0]["reply"]["json"])
        key = "trr_pub_" + secrets.token_urlsafe(32)
        spec = providers.get("tracearr")
        settings = {"url": http.url, "show": "names"}
        allowed = kinds.kind_class("streams")().allowed(settings)
        DataProvider(spec, settings, {"api_key": key}, 2.0, allowed).read(T0)
        ((method, path, headers, _),) = http.calls
        self.assertEqual((method, path), ("GET", "/api/v2/public/streams"))
        self.assertEqual(
            {k.lower(): v for k, v in headers.items()}["authorization"], f"Bearer {key}"
        )
        self.assertNotIn(key, path)

    def test_jellyfin_sends_its_key_in_its_own_authorization_form_and_never_in_the_address(self):
        (fixture,) = [f for pid, case, f in fixtures() if (pid, case) == ("jellyfin", "sessions")]
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/Sessions"] = (200, fixture["exchanges"][0]["reply"]["json"])
        key = secrets.token_hex(16)
        spec = providers.get("jellyfin")
        settings = {"url": http.url, "show": "names"}
        allowed = kinds.kind_class("streams")().allowed(settings)
        DataProvider(spec, settings, {"api_key": key}, 2.0, allowed).read(T0)
        ((method, path, headers, _),) = http.calls
        self.assertEqual((method, path), ("GET", "/Sessions"))
        headers = {k.lower(): v for k, v in headers.items()}
        self.assertEqual(headers["authorization"], f'MediaBrowser Token="{key}"')
        # Jellyfin 12 no longer reads the older header, so the key goes in the one place alone.
        self.assertNotIn("x-emby-token", headers)
        self.assertNotIn(key, path)

    def test_names_are_never_read_unless_show_is_names(self):
        for pid, case, fixture in fixtures():
            spec = providers.get(pid)
            if spec.kind != "streams" or "error" in fixture:
                continue
            items = spec.fill["sessions"]
            others = set()
            for field in ("title", "order"):
                if field in items.fields:
                    others |= _vars_of(items.fields[field])
            names_only = _vars_of(items.fields["who"]) - others
            self.assertTrue(names_only, pid)
            provider, fill = self.run_fixture(pid, case, fixture, "names")
            if fill["sessions"]:
                self.assertTrue(any(provider.reads[v] for v in names_only), f"{pid}/{case}")
            provider, fill = self.run_fixture(pid, case, fixture, "titles")
            self.assertEqual(
                {v: provider.reads[v] for v in names_only}, dict.fromkeys(names_only, 0)
            )
            self.assertNotIn('"who"', json.dumps(_plain(fill)))
            provider, fill = self.run_fixture(pid, case, fixture, "count")
            self.assertEqual(dict(provider.reads), {}, f"{pid}/{case}: count reads no var at all")


class FromTest(unittest.TestCase):
    """`from` and `secret` in config.toml."""

    ENV: ClassVar[dict[str, str]] = {
        "KW_TAUTULLI_API_KEY": "tk-invented",
        "KW_ADGUARD_USERNAME": "kw",
        "KW_ADGUARD_PASSWORD": "pw-invented",
    }

    def build(self, section, settings, env=None):
        raw = {"sources": {section: {"url": "http://192.0.2.20", **settings}}}
        return make_config(raw, self.ENV if env is None else env)

    def problems(self, section, settings, env=None):
        with self.assertRaises(ConfigError) as cm:
            self.build(section, settings, env)
        return cm.exception.problems

    def test_from_defaults_to_the_kinds_old_reader(self):
        streams = self.build("streams", {}).sources["streams"]
        self.assertEqual((streams["from"], streams["secret"]), ("tautulli", "tautulli"))
        adblock = self.build("adblock", {"from": "adguard"}).sources["adblock"]
        self.assertEqual((adblock["from"], adblock["secret"]), ("adguard", "adguard"))

    def test_a_from_that_names_no_provider_of_the_kind_is_refused(self):
        self.assertEqual(
            self.problems("streams", {"from": "plx"}),
            [
                'sources.streams.from: unknown provider "plx"; '
                "use jellyfin, plex, tautulli or tracearr"
            ],
        )
        self.assertEqual(
            self.problems("streams", {"from": "adguard"}),
            ['sources.streams.from: "adguard" reads adblock, not streams'],
        )
        self.assertEqual(
            self.problems("adblock", {"from": "sonarr"}),
            ['sources.adblock.from: "sonarr" reads imports, not adblock'],
        )
        self.assertEqual(
            self.problems("adblock", {"from": 3}), ["sources.adblock.from: expected str"]
        )
        self.assertEqual(
            self.problems("sonarr", {"from": "sonarr"}, {"KW_SONARR_API_KEY": "x"}),
            ["sources.sonarr.from: unknown setting"],
        )

    def test_the_secret_is_the_providers_id_unless_it_is_set(self):
        env = {"KW_PLEXPASS_API_KEY": "tk-other"}
        c = self.build("streams", {"secret": "plexpass"}, env)
        self.assertEqual(c.secret("streams"), {"api_key": "tk-other"})
        self.assertEqual(
            self.problems("streams", {}, env),
            [".env: KW_TAUTULLI_API_KEY missing (for streams)"],
        )
        self.assertEqual(
            self.problems("streams", {"secret": ""}),
            ["sources.streams.secret: use letters, digits and underscores"],
        )
        c = self.build("streams", {})
        self.assertEqual(c.secret("streams"), {"api_key": "tk-invented"})
        self.assertEqual(c.secret_values(), ["tk-invented", "kw", "pw-invented"])

    def test_pihole_reads_its_password(self):
        env = {"KW_PIHOLE_PASSWORD": "pw-invented"}
        c = self.build("adblock", {"from": "pihole"}, env)
        self.assertEqual(c.sources["adblock"]["secret"], "pihole")
        self.assertEqual(c.secret("adblock"), {"password": "pw-invented"})
        self.assertEqual(
            self.problems("adblock", {"from": "pihole"}, {}),
            [".env: KW_PIHOLE_PASSWORD missing (for adblock)"],
        )
        self.assertEqual(
            self.problems("streams", {"from": "pihole"}),
            ['sources.streams.from: "pihole" reads adblock, not streams'],
        )

    def test_plex_reads_its_token(self):
        env = {"KW_PLEX_TOKEN": "tok-invented"}
        c = self.build("streams", {"from": "plex", "url": "http://192.0.2.20:32400"}, env)
        self.assertEqual(c.sources["streams"]["secret"], "plex")
        self.assertEqual(c.secret("streams"), {"token": "tok-invented"})
        self.assertEqual(
            self.problems("streams", {"from": "plex"}, {}),
            [".env: KW_PLEX_TOKEN missing (for streams)"],
        )
        self.assertEqual(
            self.problems("adblock", {"from": "plex"}),
            ['sources.adblock.from: "plex" reads streams, not adblock'],
        )

    def test_tracearr_reads_its_api_key(self):
        env = {"KW_TRACEARR_API_KEY": "trr_pub_invented"}
        c = self.build("streams", {"from": "tracearr", "url": "http://192.0.2.20:3000"}, env)
        self.assertEqual(c.sources["streams"]["secret"], "tracearr")
        self.assertEqual(c.secret("streams"), {"api_key": "trr_pub_invented"})
        self.assertEqual(
            self.problems("streams", {"from": "tracearr"}, {}),
            [".env: KW_TRACEARR_API_KEY missing (for streams)"],
        )
        self.assertEqual(
            self.problems("adblock", {"from": "tracearr"}),
            ['sources.adblock.from: "tracearr" reads streams, not adblock'],
        )

    def test_jellyfin_reads_its_api_key(self):
        env = {"KW_JELLYFIN_API_KEY": "jf-invented"}
        c = self.build("streams", {"from": "jellyfin", "url": "http://192.0.2.20:8096"}, env)
        self.assertEqual(c.sources["streams"]["secret"], "jellyfin")
        self.assertEqual(c.secret("streams"), {"api_key": "jf-invented"})
        self.assertEqual(
            self.problems("streams", {"from": "jellyfin"}, {}),
            [".env: KW_JELLYFIN_API_KEY missing (for streams)"],
        )
        self.assertEqual(
            self.problems("adblock", {"from": "jellyfin"}),
            ['sources.adblock.from: "jellyfin" reads streams, not adblock'],
        )

    def test_technitium_reads_its_token(self):
        env = {"KW_TECHNITIUM_TOKEN": "tok-invented"}
        c = self.build("adblock", {"from": "technitium"}, env)
        self.assertEqual(c.sources["adblock"]["secret"], "technitium")
        self.assertEqual(c.secret("adblock"), {"token": "tok-invented"})
        self.assertEqual(
            self.problems("adblock", {"from": "technitium"}, {}),
            [".env: KW_TECHNITIUM_TOKEN missing (for adblock)"],
        )
        self.assertEqual(
            self.problems("streams", {"from": "technitium"}),
            ['sources.streams.from: "technitium" reads adblock, not streams'],
        )

    def test_verify_tls(self):
        env = {"KW_PIHOLE_PASSWORD": "pw-invented"}
        https = {"from": "pihole", "url": "https://192.0.2.53"}
        c = self.build("adblock", https, env)
        self.assertIs(c.sources["adblock"]["verify_tls"], True)
        c = self.build("adblock", {**https, "verify_tls": False}, env)
        self.assertIs(c.sources["adblock"]["verify_tls"], False)
        source = KindSource("adblock", c.sources["adblock"], c)
        self.assertIs(source.provider.verify_tls, False)
        keys = {"KW_SONARR_API_KEY": "s", "KW_RADARR_API_KEY": "r"}
        for section in ("streams", "sonarr", "radarr"):
            got = self.build(section, {}, {**self.ENV, **keys})
            self.assertIs(got.sources[section]["verify_tls"], True)
        self.assertEqual(
            self.problems("adblock", {"from": "pihole", "verify_tls": False}, env),
            ["sources.adblock.verify_tls: only applies with an https url"],
        )
        self.assertEqual(
            self.problems("adblock", {"verify_tls": "no"}),
            ["sources.adblock.verify_tls: expected bool"],
        )
        # true with http checks nothing, and is the default: no problem.
        self.build("adblock", {"verify_tls": True})
        raw = {"sources": {"security": {"from": "fail2ban", "verify_tls": False}}}
        with self.assertRaises(ConfigError) as cm:
            make_config(raw, {})
        self.assertEqual(
            cm.exception.problems, ["sources.security.verify_tls: not used by fail2ban"]
        )

    def test_the_credentials_each_provider_reads(self):
        self.assertEqual(config_mod.provider_credentials("tautulli"), ["api_key"])
        self.assertEqual(config_mod.provider_credentials("plex"), ["token"])
        self.assertEqual(config_mod.provider_credentials("adguard"), ["username", "password"])
        self.assertEqual(config_mod.provider_credentials("pihole"), ["password"])
        self.assertEqual(config_mod.provider_credentials("technitium"), ["token"])
        self.assertEqual(config_mod.provider_credentials("tracearr"), ["api_key"])
        self.assertEqual(config_mod.provider_credentials("jellyfin"), ["api_key"])
        self.assertEqual(config_mod.provider_credentials("nothing"), [])

    def test_credential_names_know_every_field(self):
        env = {
            "KW_PLEX_TOKEN": "x",
            "KW_NAS_HEADER": "y",
            "KW_NAS_COLOUR": "z",
            "KW_CAPPED": "400%,4G",
            "OTHER_PLEX_TOKEN": "w",
        }
        names = credential_names(env)
        self.assertTrue(names["KW_PLEX_TOKEN"])
        self.assertTrue(names["KW_NAS_HEADER"])
        self.assertNotIn("KW_NAS_COLOUR", names)
        # only the KW_ prefix names a credential, and the tools' own KW_CAPPED is none
        self.assertNotIn("KW_CAPPED", names)
        self.assertNotIn("OTHER_PLEX_TOKEN", names)
        self.assertFalse(names["KW_TAUTULLI_API_KEY"])


if __name__ == "__main__":
    unittest.main()
