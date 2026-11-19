"""Every built-in provider against its fixtures, and `from` in config.toml.

Each fixture in fixtures/providers/<id>/ holds the exchanges of one read, in the shapes the service
sends with every value invented: the request expected, with each credential written as
{credential.<field>}, and the reply. The test serves the replies on a local HTTP server, fails when
a request differs from the fixture's, and compares the fill, or the error, with the fixture's. The
credentials are made afresh for each run. A streams provider is run at every setting of `show`,
and the vars behind a name must never be read unless `show` is `names`.
"""

import base64
import json
import os
import secrets
import unittest
from typing import ClassVar

from collector import config as config_mod
from collector import kinds, providers
from collector.config import ConfigError, credential_names
from collector.net import AuthError, SourceError
from collector.providers.engine import DataProvider
from kw_helpers import T0, FakeHttp, make_config

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "providers")


def fixtures():
    for pid in sorted(os.listdir(FIXTURES)):
        for name in sorted(os.listdir(os.path.join(FIXTURES, pid))):
            with open(os.path.join(FIXTURES, pid, name), encoding="utf-8") as fh:
                yield pid, name[: -len(".json")], json.load(fh)


def _filled(text, credentials):
    for field, value in credentials.items():
        text = text.replace("{credential." + field + "}", value)
    return text


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
        for e in fixture["exchanges"]:
            reply = e["reply"]
            http.routes[e["request"]["path"].split("?", 1)[0]] = (reply["status"], reply["json"])
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
        where = f"{pid}/{case}" + (f" at show = {show}" if show else "")
        self.assertEqual(len(http.requests), len(fixture["exchanges"]), where)
        for (path, headers), e in zip(http.requests, fixture["exchanges"], strict=True):
            want = e["request"]
            self.assertEqual(path, _filled(want["path"], credentials), where)
            for name, value in want["headers"].items():
                got = headers[name]
                if got.startswith("Basic "):
                    got = "Basic " + base64.b64decode(got[6:]).decode()
                self.assertEqual(got, _filled(value, credentials), where)
            self.assertEqual(headers["User-Agent"], "knightwatcher", where)
        if "error" in fixture:
            self.assertIsNotNone(error, where)
            self.assertEqual(str(error), fixture["error"]["message"], where)
            self.assertEqual(isinstance(error, AuthError), fixture["error"]["auth"], where)
            return provider, None
        self.assertIsNone(error, f"{where}: {error}")
        want = fixture["fill"][show] if show is not None else fixture["fill"]
        self.assertEqual(fill, want, where)
        return provider, fill

    def test_every_built_in_provider_has_fixtures(self):
        self.assertEqual(sorted({pid for pid, _, _ in fixtures()}), sorted(providers.builtin()))

    def test_each_fixture(self):
        for pid, case, fixture in fixtures():
            spec = providers.get(pid)
            if spec.kind == "streams":
                for show in ("names", "titles", "count"):
                    self.run_fixture(pid, case, fixture, show)
            else:
                self.run_fixture(pid, case, fixture)

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
            self.assertNotIn('"who"', json.dumps(fill))
            provider, fill = self.run_fixture(pid, case, fixture, "count")
            self.assertEqual(dict(provider.reads), {}, f"{pid}/{case}: count reads no var at all")


class FromTest(unittest.TestCase):
    """`from` and `secret` in config.toml."""

    ENV: ClassVar[dict[str, str]] = {
        "KNIGHTWATCHER_TAUTULLI_API_KEY": "tk-invented",
        "KNIGHTWATCHER_ADGUARD_USERNAME": "kw",
        "KNIGHTWATCHER_ADGUARD_PASSWORD": "pw-invented",
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
            ['sources.streams.from: unknown provider "plx"; use tautulli'],
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
            self.problems("sonarr", {"from": "sonarr"}, {"KNIGHTWATCHER_SONARR_API_KEY": "x"}),
            ["sources.sonarr.from: unknown setting"],
        )

    def test_the_secret_is_the_providers_id_unless_it_is_set(self):
        env = {"KNIGHTWATCHER_PLEXPASS_API_KEY": "tk-other"}
        c = self.build("streams", {"secret": "plexpass"}, env)
        self.assertEqual(c.secret("streams"), {"api_key": "tk-other"})
        self.assertEqual(
            self.problems("streams", {}, env),
            [".env: KNIGHTWATCHER_TAUTULLI_API_KEY missing (for streams)"],
        )
        self.assertEqual(
            self.problems("streams", {"secret": ""}),
            ["sources.streams.secret: use letters, digits and underscores"],
        )
        c = self.build("streams", {})
        self.assertEqual(c.secret("streams"), {"api_key": "tk-invented"})
        self.assertEqual(c.secret_values(), ["tk-invented", "kw", "pw-invented"])

    def test_the_credentials_each_provider_reads(self):
        self.assertEqual(config_mod.provider_credentials("tautulli"), ["api_key"])
        self.assertEqual(config_mod.provider_credentials("adguard"), ["username", "password"])
        self.assertEqual(config_mod.provider_credentials("nothing"), [])

    def test_credential_names_know_every_field(self):
        env = {
            "KNIGHTWATCHER_PLEX_TOKEN": "x",
            "KNIGHTWATCHER_NAS_HEADER": "y",
            "KNIGHTWATCHER_NAS_COLOUR": "z",
        }
        names = credential_names(env)
        self.assertTrue(names["KNIGHTWATCHER_PLEX_TOKEN"])
        self.assertTrue(names["KNIGHTWATCHER_NAS_HEADER"])
        self.assertNotIn("KNIGHTWATCHER_NAS_COLOUR", names)
        self.assertFalse(names["KNIGHTWATCHER_TAUTULLI_API_KEY"])


if __name__ == "__main__":
    unittest.main()
