"""[[sources.imports]]: more services whose imports are read, each a source of its own, and
[sources.lidarr], whose provider gives one crate for each album.

An entry of the list is the source imports:<name>, in the state file and in the memory file
alike. It reads any provider of the imports kind, a user's own file included, under its own
`secret`, the provider's id when it is left out. Its name is its own among the list and is never a
named section's; two sources that read one provider at one address are refused, since each import
would be raised twice. Every name, address and title here is invented, and the keys are made for
each run.
"""

import contextlib
import io
import json
import os
import secrets
import tempfile
import unittest
from unittest import mock

from collector import kinds, text
from collector.cli import main
from collector.config import LIST_MAX, ConfigError, build, load
from collector.contract import validate
from collector.providers import scan
from collector.runner import Runner
from collector.sources import KindSource, MissingCredentials, RefusedProvider, build_sources
from collector.store import Memory
from kw_helpers import T0, Clock, FakeHttp

LIDARR_PATH = (
    "/api/v1/history?page=1&pageSize=10&eventType=8&sortKey=date&sortDirection=descending"
    "&includeArtist=true&includeAlbum=true"
)
SONARR_PATH = (
    "/api/v3/history?page=1&pageSize=10&eventType=3&sortKey=date&sortDirection=descending"
    "&includeSeries=true&includeEpisode=true"
)


def album(rid: int, artist: str, title: str) -> dict:
    return {
        "id": rid,
        "albumId": rid - 100,
        "artistId": 41,
        "sourceTitle": f"{artist} - {title} [FLAC]",
        "eventType": "downloadImported",
        "album": {"title": title, "id": rid - 100},
        "artist": {"artistName": artist, "id": 41},
    }


def history(*records) -> dict:
    return {
        "page": 1,
        "pageSize": 10,
        "sortKey": "date",
        "sortDirection": "descending",
        "totalRecords": len(records),
        "records": list(records),
    }


# A provider file of the user's own, of the imports kind: a made-up service listing its imports.
SHELF = """\
format = 1
id = "shelf"
kind = "imports"
name = "Shelf"

[credentials]
api_key = "Shelf's API key."

[[request]]
path = "/api/imports"
headers = { X-Api-Key = "{credential.api_key}" }

[fill.records]
each = "$.items[*]"

[fill.records.vars]
id = { path = "$.n", type = "int", strict = true }
title = "$.name"

[fill.records.fields]
id = "id"

[[fill.records.title]]
try = ["{title}"]
"""


class ListConfigTest(unittest.TestCase):
    """How config.toml's entries become sources, and what is refused."""

    def setUp(self):
        self.key = secrets.token_hex(16)

    def build(self, entries, sources=None, env=None, **kw):
        raw = {"sources": {**(sources or {}), "imports": entries}}
        return build(raw, {"KNIGHTWATCHER_SONARR_API_KEY": self.key} if env is None else env, **kw)

    def problems(self, entries, sources=None, env=None):
        with self.assertRaises(ConfigError) as cm:
            self.build(entries, sources, env)
        return cm.exception.problems

    def test_each_entry_is_a_source_of_its_own_named_after_it(self):
        c = self.build(
            [
                {"name": "sonarr-4k", "from": "sonarr", "url": "http://192.0.2.34:8989"},
                {"name": "anime", "from": "sonarr", "url": "http://192.0.2.35:8989", "every_s": 60},
            ]
        )
        self.assertEqual(list(c.sources), ["imports:sonarr-4k", "imports:anime"])
        self.assertEqual(
            c.sources["imports:anime"],
            {
                "name": "anime",
                "from": "sonarr",
                "enabled": True,
                "every_s": 60,
                "url": "http://192.0.2.35:8989",
                "verify_tls": True,
                # Left out, the secret is the provider's id.
                "secret": "sonarr",
            },
        )
        self.assertEqual(c.secret("imports:anime"), {"api_key": self.key})
        self.assertEqual(c.where("imports:anime"), "sources.imports[1]")
        self.assertEqual(c.where("ssh"), "sources.ssh")
        built = build_sources(c)
        self.assertEqual([s.name for s in built], ["imports:sonarr-4k", "imports:anime"])
        for s in built:
            self.assertIsInstance(s, KindSource)
            self.assertEqual((s.kind.name, s.spec.id, s.section), ("imports", "sonarr", None))

    def test_a_secret_of_its_own(self):
        env = {"KNIGHTWATCHER_SONARR_4K_API_KEY": "an-invented-key"}
        entry = {"name": "sonarr-4k", "from": "sonarr", "url": "http://192.0.2.34:8989"}
        c = self.build([{**entry, "secret": "sonarr_4k"}], env=env)
        self.assertEqual(c.secret("imports:sonarr-4k"), {"api_key": "an-invented-key"})
        self.assertEqual(
            self.problems([entry], env=env),
            [".env: KNIGHTWATCHER_SONARR_API_KEY missing (for imports:sonarr-4k)"],
        )
        self.assertEqual(
            self.problems([{**entry, "secret": "sonarr-4k"}], env=env),
            ["sources.imports[0].secret: use letters, digits and underscores"],
        )
        # Taken up while the collector runs, a missing key fails that source alone.
        c = self.build([entry], env=env, missing="report")
        (source,) = build_sources(c)
        self.assertIsInstance(source, MissingCredentials)
        self.assertEqual(source.variables, ["KNIGHTWATCHER_SONARR_API_KEY"])

    def test_names(self):
        url = {"from": "sonarr", "url": "http://192.0.2.34:8989"}
        self.assertEqual(self.problems([url]), ["sources.imports[0].name: required"])
        for bad in ("", "Sonarr", "-4k", "a" * 21, "sonarr_4k", "four k", 4):
            self.assertEqual(
                self.problems([{**url, "name": bad}]),
                [
                    "sources.imports[0].name: 1 to 20 of a-z, 0-9 and -, starting with a letter "
                    "or digit"
                ],
                bad,
            )
        for good in ("4k", "a" * 20, "sonarr-4k", "x1-2-3"):
            self.assertIn(f"imports:{good}", self.build([{**url, "name": good}]).sources)

    def test_a_name_twice_and_a_named_sections_name_are_refused(self):
        a = {"name": "tv", "from": "sonarr", "url": "http://192.0.2.34:8989"}
        b = {"name": "tv", "from": "sonarr", "url": "http://192.0.2.35:8989", "enabled": False}
        self.assertEqual(
            self.problems([a, b]),
            ['sources.imports[1].name: "tv" is already the name of sources.imports[0]'],
        )
        for section in ("sonarr", "radarr", "lidarr"):
            self.assertEqual(
                self.problems([{**a, "name": section}]),
                [
                    f'sources.imports[0].name: "{section}" is the name of [sources.{section}]; '
                    "give this one another"
                ],
            )
        # A name another source happens to have is no clash: imports:streams is not streams.
        self.assertIn("imports:streams", self.build([{**a, "name": "streams"}]).sources)

    def test_from(self):
        entry = {"name": "tv", "url": "http://192.0.2.34:8989"}
        self.assertEqual(self.problems([entry]), ["sources.imports[0].from: required"])
        self.assertEqual(
            self.problems([{**entry, "from": ""}]),
            ["sources.imports[0].from: expected the id of a provider"],
        )
        self.assertEqual(
            self.problems([{**entry, "from": "sonar"}]),
            ['sources.imports[0].from: unknown provider "sonar"; use lidarr, radarr or sonarr'],
        )
        self.assertEqual(
            self.problems([{**entry, "from": "plex"}]),
            ['sources.imports[0].from: "plex" reads streams, not imports'],
        )

    def test_the_same_service_twice_is_refused_and_a_second_sonarr_is_not(self):
        sonarr = {"sonarr": {"url": "http://192.0.2.30:8989"}}
        same = {"name": "tv", "from": "sonarr", "url": "http://192.0.2.30:8989/"}
        self.assertEqual(
            self.problems([same], sonarr),
            [
                "sources.imports[0].url: sonarr at this address is read by [sources.sonarr] "
                "already; remove one"
            ],
        )
        # The entry is refused, wherever the section is written.
        raw = {"sources": {"imports": [same], **sonarr}}
        with self.assertRaises(ConfigError) as cm:
            build(raw, {"KNIGHTWATCHER_SONARR_API_KEY": self.key})
        self.assertEqual(cm.exception.problems, self.problems([same], sonarr))
        other = {**same, "name": "tv2", "url": "http://192.0.2.30:8989"}
        self.assertEqual(
            self.problems([same, other]),
            [
                "sources.imports[1].url: sonarr at this address is read by sources.imports[0] "
                "already; remove one"
            ],
        )
        # The host is compared in any case, and the path without its final slash.
        named = {"sonarr": {"url": "http://Sonarr.Lan:8989/base"}}
        self.assertEqual(
            len(self.problems([{**same, "url": "http://sonarr.lan:8989/base/"}], named)), 1
        )
        self.assertIn(
            "imports:tv",
            self.build([{**same, "url": "http://sonarr.lan:8989/Base"}], named).sources,
        )
        # Off, it reads nothing, so it clashes with nothing.
        c = self.build([{**same, "enabled": False}], sonarr)
        self.assertEqual(list(c.sources), ["sonarr"])
        # Another Sonarr, or another provider at the same address, is no clash.
        c = self.build([{**same, "url": "http://192.0.2.31:8989"}], sonarr)
        self.assertEqual(list(c.sources), ["sonarr", "imports:tv"])

    def test_the_rest_is_checked_as_a_sections_is(self):
        entry = {"name": "tv", "from": "sonarr", "url": "http://192.0.2.34:8989"}
        cases = [
            ({"url": ""}, "sources.imports[0].url: required when the source is enabled"),
            ({"url": "192.0.2.34"}, "sources.imports[0].url: must start with http:// or https://"),
            ({"every_s": 0}, "sources.imports[0].every_s: must be above zero"),
            ({"every_s": "30"}, "sources.imports[0].every_s: expected int"),
            (
                {"verify_tls": False},
                "sources.imports[0].verify_tls: only applies with an https url",
            ),
            ({"show": "names"}, "sources.imports[0].show: unknown setting"),
            ({"database": "/x"}, "sources.imports[0].database: unknown setting"),
        ]
        for change, problem in cases:
            self.assertEqual(self.problems([{**entry, **change}]), [problem], change)
        # An entry that is off still needs a name and a from, and nothing else of it is read.
        c = self.build([{"name": "tv", "from": "sonarr", "enabled": False}])
        self.assertEqual(c.sources, {})
        self.assertEqual(
            self.problems([{"name": "tv", "enabled": False}]), ["sources.imports[0].from: required"]
        )

    def test_the_list_itself(self):
        self.assertEqual(LIST_MAX, {"imports": 16, "json": 16})
        many = [
            {"name": f"tv{i}", "from": "sonarr", "url": f"http://192.0.2.{i}:8989"}
            for i in range(17)
        ]
        self.assertEqual(self.problems(many), ["sources.imports: at most 16"])
        self.assertEqual(len(self.build(many[:16]).sources), 16)
        self.assertEqual(self.build([]).sources, {})
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"imports": {"name": "tv", "from": "sonarr"}}}, {})
        self.assertEqual(
            cm.exception.problems, ["sources.imports: expected [[sources.imports]] tables"]
        )
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"imports": ["tv"]}}, {})
        self.assertEqual(
            cm.exception.problems, ["sources.imports: expected [[sources.imports]] tables"]
        )


class OwnProviderTest(unittest.TestCase):
    """An entry reading a provider file of the user's own."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = os.path.join(self.tmp.name, "providers")
        os.mkdir(self.folder)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.key = secrets.token_hex(16)

    def write(self, text):
        with open(os.path.join(self.folder, "shelf.toml"), "w", encoding="utf-8") as fh:
            fh.write(text)

    def config(self):
        raw = {"sources": {"imports": [{"name": "books", "from": "shelf", "url": self.http.url}]}}
        return build(raw, {"KNIGHTWATCHER_SHELF_API_KEY": self.key}, providers=scan(self.folder))

    def test_its_own_provider_file_under_its_own_name(self):
        self.write(SHELF)
        self.http.routes["/api/imports"] = (200, {"items": [{"n": 3, "name": "Paper Tide"}]})
        c = self.config()
        (source,) = build_sources(c)
        self.assertEqual((source.name, source.spec.id), ("imports:books", "shelf"))
        memory = {}
        self.assertEqual(source.observe(source.fetch(T0), memory, T0), [])
        self.assertEqual(memory, {"last_id": 3})
        self.http.routes["/api/imports"] = (
            200,
            {"items": [{"n": 4, "name": "Lanterns"}, {"n": 3, "name": "Paper Tide"}]},
        )
        events = source.observe(source.fetch(T0), memory, T0)
        self.assertEqual([e["text"] for e in events], [f"IMPORTED{text.SEP}Lanterns"])
        path, headers = self.http.requests[-1]
        self.assertEqual((path, headers["X-Api-Key"]), ("/api/imports", self.key))

    def test_a_refused_file_fails_that_source_at_every_read(self):
        self.write(SHELF.replace('path = "/api/imports"', 'path = "api/imports"'))
        c = self.config()
        self.assertEqual(c.refused_in_use(), ["imports:books"])
        (source,) = build_sources(c)
        self.assertIsInstance(source, RefusedProvider)


class LidarrTest(unittest.TestCase):
    """[sources.lidarr]: one crate for each album."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.key = secrets.token_hex(16)

    def source(self):
        c = build(
            {"sources": {"lidarr": {"url": self.http.url}}},
            {"KNIGHTWATCHER_LIDARR_API_KEY": self.key},
        )
        self.assertEqual(c.sources["lidarr"]["secret"], "lidarr")
        (source,) = build_sources(c)
        return source

    def test_one_crate_for_each_album(self):
        self.assertEqual(kinds.kind_of("lidarr"), "imports")
        source = self.source()
        self.http.routes[LIDARR_PATH] = (200, history(album(211, "Sam Vale", "Harbour of Glass")))
        memory = {}
        self.assertEqual(source.observe(source.fetch(T0), memory, T0), [])
        self.http.routes[LIDARR_PATH] = (
            200,
            history(
                album(212, "Alex Rowan", "Night Lines"), album(211, "Sam Vale", "Harbour of Glass")
            ),
        )
        events = source.observe(source.fetch(T0), memory, T0)
        self.assertEqual(
            events,
            [
                {
                    "type": "import",
                    "count": 1,
                    "text": "IMPORTED · Alex Rowan - Night Lines",
                    "parts": {"title": "Alex Rowan - Night Lines"},
                }
            ],
        )
        self.assertEqual(memory, {"last_id": 212})
        path, headers = self.http.requests[-1]
        self.assertEqual((path, headers["X-Api-Key"]), (LIDARR_PATH, self.key))

    def test_the_lidarr_key_is_required_and_its_own(self):
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"lidarr": {"url": "http://192.0.2.32:8686"}}}, {})
        self.assertEqual(
            cm.exception.problems, [".env: KNIGHTWATCHER_LIDARR_API_KEY missing (for lidarr)"]
        )
        with self.assertRaises(ConfigError) as cm:
            build(
                {"sources": {"lidarr": {"from": "sonarr"}}}, {"KNIGHTWATCHER_LIDARR_API_KEY": "k"}
            )
        self.assertEqual(cm.exception.problems, ["sources.lidarr.from: unknown setting"])


class CommandLineTest(unittest.TestCase):
    """--check-config, --probe and --once with an entry of the list."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name
        self.out = os.path.join(self.root, "out")
        self.var = os.path.join(self.root, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        os.mkdir(os.path.join(self.root, "providers"))
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.key = secrets.token_hex(16)
        self.config_path = os.path.join(self.root, "config.toml")
        clean = {k: v for k, v in os.environ.items() if not k.startswith("KNIGHTWATCHER_")}
        env = {**clean, "KNIGHTWATCHER_LIDARR_TWO_API_KEY": self.key}
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_config(self, entry: str) -> None:
        with open(self.config_path, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'[[sources.imports]]\nname = "lidarr-two"\nfrom = "lidarr"\n'
                f'url = "{self.http.url}"\nsecret = "lidarr_two"\n{entry}'
            )

    def run_cli(self, *args):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config_path, "--admin", os.devnull + "x", *args])
        return code, out.getvalue(), err.getvalue()

    def test_check_config_and_probe(self):
        self.write_config("")
        self.http.routes[LIDARR_PATH] = (200, history(album(212, "Alex Rowan", "Night Lines")))
        code, out, err = self.run_cli("--check-config")
        self.assertEqual(
            (code, out, err), (0, "config ok: 1 sources enabled (imports:lidarr-two)\n", "")
        )
        folder = os.path.join(self.root, "rec")
        code, out, err = self.run_cli("--probe", "imports:lidarr-two", "--record", folder)
        self.assertEqual(code, 0, err)
        self.assertIn("probe imports:lidarr-two: provider lidarr (Lidarr)\n", out)
        self.assertIn("credentials: KNIGHTWATCHER_LIDARR_TWO_API_KEY\n", out)
        self.assertNotIn("Night Lines", out)
        (name,) = os.listdir(folder)
        self.assertTrue(name.startswith("imports-lidarr-two-"), name)
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            recorded = fh.read()
        self.assertNotIn(self.key, out + err + recorded)
        self.assertEqual(json.loads(recorded)["source"], "imports:lidarr-two")
        code, _, err = self.run_cli("--probe", "imports:other")
        self.assertEqual(
            (code, err),
            (2, 'probe: no [[sources.imports]] entry named "other" is not set up, or is off\n'),
        )

    def test_check_config_names_the_entry_of_a_refused_file(self):
        with open(os.path.join(self.root, "providers", "lidarr2.toml"), "w") as fh:
            fh.write(SHELF.replace('"shelf"', '"lidarr2"').replace('"/api/imports"', '"api"'))
        self.write_config("")
        with open(self.config_path, encoding="utf-8") as fh:
            text_now = fh.read().replace('from = "lidarr"', 'from = "lidarr2"')
        with open(self.config_path, "w", encoding="utf-8") as fh:
            fh.write(text_now)
        code, _, err = self.run_cli("--check-config")
        self.assertEqual(code, 2)
        self.assertEqual(
            err,
            "config: providers/lidarr2.toml: request[0].path: must start with /\n"
            "config: sources.imports[0].from: provider lidarr2 refused, as above\n",
        )

    def test_the_state_and_memory_keep_it_under_its_own_name(self):
        self.write_config("")
        self.http.routes[LIDARR_PATH] = (200, history(album(211, "Sam Vale", "Harbour of Glass")))
        clock = Clock()
        memory = Memory(self.var)
        runner = Runner(load(self.config_path, os.environ), memory, clock=clock)
        self.addCleanup(runner.close)
        runner.cycle()
        self.http.routes[LIDARR_PATH] = (
            200,
            history(
                album(212, "Alex Rowan", "Night Lines"), album(211, "Sam Vale", "Harbour of Glass")
            ),
        )
        clock.advance(31)
        runner.cycle()
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            state = json.load(fh)
        self.assertEqual(list(state["sources"]), ["imports:lidarr-two"])
        self.assertTrue(state["sources"]["imports:lidarr-two"]["ok"])
        self.assertEqual(
            [(e["type"], e["text"]) for e in state["events"]],
            [("import", "IMPORTED · Alex Rowan - Night Lines")],
        )
        with open(os.path.join(self.var, "memory.json"), encoding="utf-8") as fh:
            memory = json.load(fh)
        self.assertEqual(memory["sources"]["imports:lidarr-two"], {"last_id": 212})
        self.assertEqual(validate(state), [])


if __name__ == "__main__":
    unittest.main()
