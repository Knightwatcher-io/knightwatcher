"""Provider files of the user's own, in the providers folder beside config.toml: loading, refusal
and its reporting, a `from` naming a refused file, shadowing a built-in, the settings a file
declares, --check-config and --probe, and taking up a change while the collector runs. Every name
and address here is invented, and the credential values are made for each run."""

import contextlib
import datetime as dt
import io
import json
import os
import secrets
import tempfile
import unittest
from unittest import mock

from collector import config as config_mod
from collector import providers, reload
from collector.cli import main
from collector.config import ConfigError, build
from collector.runner import Runner
from collector.sources import KindSource, RefusedProvider, build_sources
from collector.store import Memory
from kw_helpers import Clock, FakeHttp, FakeProc

MYFLIX = """\
format = 1
id = "myflix"
kind = "streams"
name = "Myflix"

[credentials]
token = "Myflix's token, from its settings page."

[settings]
page_size = { type = "integer", default = 10, min = 1, max = 50, help = "Sessions read per call." }
mode = { type = "string", default = "live", values = ["live", "all"], help = "Which sessions." }
weight = { type = "number", default = 1.0, help = "A number, for the tests." }

[[request]]
path = "/api/sessions"
query = { limit = "{setting.page_size}", mode = "{setting.mode}" }
headers = { X-Token = "{credential.token}" }

[fill]
count = { path = "$.total", type = "int" }

[fill.sessions]
each = "$.sessions[*]"

[fill.sessions.vars]
title = "$.title"
user = "$.user"
key = "$.id"

[fill.sessions.fields]
who = { pick = ["user"] }
order = "key"

[[fill.sessions.title]]
try = ["{title}"]
"""

# The same, with a path the format refuses.
BROKEN = MYFLIX.replace('path = "/api/sessions"', 'path = "api/sessions"')

REPLY = {
    "total": 2,
    "sessions": [
        {"id": 7, "title": "The Gull Ledger", "user": "Robin"},
        {"id": 9, "title": "Quayside Lamps", "user": "Sam"},
    ],
}


def write(folder: str, name: str, text: str) -> str:
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


class Folder(unittest.TestCase):
    """A scratch folder with config.toml and a providers folder beside it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name
        self.folder = os.path.join(self.root, "providers")
        os.mkdir(self.folder)
        self.config_path = os.path.join(self.root, "config.toml")
        self.token = secrets.token_hex(16)
        self.env = {"KW_MYFLIX_TOKEN": self.token}

    def scan(self) -> providers.Providers:
        return providers.scan(self.folder)


class ScanTest(Folder):
    def test_a_folder_that_does_not_exist_holds_nothing_and_is_no_problem(self):
        found = providers.scan(os.path.join(self.root, "nowhere"))
        self.assertEqual((found.own, found.refused, found.problems), ({}, {}, ()))
        self.assertIsNone(providers.signature(os.path.join(self.root, "nowhere")))

    def test_an_empty_folder_and_files_that_are_not_providers(self):
        write(self.folder, ".gitkeep", "")
        write(self.folder, "notes.txt", "not a provider")
        write(self.folder, ".myflix.toml", MYFLIX)  # hidden: an editor's, never read
        found = self.scan()
        self.assertEqual((found.own, found.refused, found.problems), ({}, {}, ()))

    def test_a_good_file_is_read_through_the_same_checks_as_the_built_ins(self):
        write(self.folder, "myflix.toml", MYFLIX)
        found = self.scan()
        self.assertEqual(list(found.own), ["myflix"])
        spec = found.get("myflix")
        self.assertEqual(
            (spec.kind, spec.name, list(spec.credentials)), ("streams", "Myflix", ["token"])
        )
        self.assertTrue(spec.digest)
        self.assertEqual(
            [p.id for p in found.of_kind("streams")],
            ["jellyfin", "plex", "tautulli", "tracearr", "myflix"],
        )
        self.assertIs(found.get("tautulli"), providers.get("tautulli"))
        self.assertFalse(found.is_refused("myflix"))

    def test_a_bad_file_is_left_out_with_its_problems_naming_the_file_and_field(self):
        write(self.folder, "myflix.toml", BROKEN)
        write(self.folder, "broken.toml", "format = 1\nid = [")
        found = self.scan()
        self.assertEqual(found.own, {})
        self.assertTrue(found.is_refused("myflix"))
        self.assertEqual(
            found.refused["myflix"], ["providers/myflix.toml: request[0].path: must start with /"]
        )
        self.assertEqual(len(found.refused["broken"]), 1)
        self.assertTrue(found.refused["broken"][0].startswith("providers/broken.toml: "))
        # Every problem, in the order of the files' names.
        self.assertEqual(found.problems, (*found.refused["broken"], *found.refused["myflix"]))

    def test_the_file_name_must_be_the_id(self):
        write(self.folder, "other.toml", MYFLIX)
        write(self.folder, "My Flix.toml", MYFLIX)
        found = self.scan()
        self.assertEqual(
            found.refused["other"], ['providers/other.toml: id: must be "other", the file\'s name']
        )
        self.assertIn("the name must be the provider's id and .toml", found.refused["My Flix"][0])

    def test_a_built_in_id_is_refused_and_the_built_in_stays(self):
        write(self.folder, "tautulli.toml", MYFLIX.replace('"myflix"', '"tautulli"'))
        found = self.scan()
        self.assertEqual(
            found.refused["tautulli"],
            [
                'providers/tautulli.toml: id: "tautulli" is a built-in provider\'s; give yours '
                "another id and name the file after it"
            ],
        )
        self.assertFalse(found.is_refused("tautulli"))
        self.assertIs(found.get("tautulli"), providers.get("tautulli"))

    def test_a_link_and_a_folder_are_refused(self):
        target = write(self.root, "elsewhere.toml", MYFLIX)
        os.symlink(target, os.path.join(self.folder, "myflix.toml"))
        os.mkdir(os.path.join(self.folder, "dir.toml"))
        found = self.scan()
        self.assertEqual(
            found.refused["myflix"],
            ["providers/myflix.toml: a link; put the file itself in the folder"],
        )
        self.assertEqual(found.refused["dir"], ["providers/dir.toml: not a regular file"])

    def test_a_file_over_the_size_limit_is_refused(self):
        write(self.folder, "myflix.toml", MYFLIX + "#" * (64 * 1024))
        self.assertEqual(
            self.scan().refused["myflix"], ["providers/myflix.toml: larger than 64 KiB"]
        )

    def test_files_past_the_limit_are_left_out_in_name_order(self):
        for pid in ("aaa", "bbb", "ccc"):
            write(self.folder, f"{pid}.toml", MYFLIX.replace('"myflix"', f'"{pid}"'))
        with mock.patch.object(providers, "MAX_OWN", 2):
            found = self.scan()
        self.assertEqual(list(found.own), ["aaa", "bbb"])
        self.assertEqual(
            found.refused["ccc"],
            ["providers/ccc.toml: more than 2 provider files; this one is left out"],
        )

    def test_a_folder_that_is_a_file_is_one_problem(self):
        path = write(self.root, "plain", "")
        found = providers.scan(path)
        self.assertEqual(found.problems, (f"providers/: {path} is not a folder",))

    def test_the_signature_follows_each_file(self):
        before = providers.signature(self.folder)
        self.assertEqual(before, ())
        path = write(self.folder, "myflix.toml", MYFLIX)
        one = providers.signature(self.folder)
        self.assertNotEqual(one, before)
        write(self.folder, "notes.txt", "ignored")
        self.assertEqual(providers.signature(self.folder), one)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("# a comment\n")
        self.assertNotEqual(providers.signature(self.folder), one)


class ConfigTest(Folder):
    def config(self, streams: dict, env=None, found=None):
        raw = {"sources": {"streams": {"url": "http://192.0.2.20:8080", **streams}}}
        return build(raw, self.env if env is None else env, providers=found or self.scan())

    def test_the_folder_is_beside_config_toml_unless_absolute(self):
        self.assertEqual(config_mod.providers_folder({}, self.config_path), self.folder)
        given = {"collector": {"providers_dir": "mine"}}
        self.assertEqual(
            config_mod.providers_folder(given, self.config_path), os.path.join(self.root, "mine")
        )
        given = {"collector": {"providers_dir": "/srv/kw/providers"}}
        self.assertEqual(config_mod.providers_folder(given, self.config_path), "/srv/kw/providers")
        with self.assertRaises(ConfigError) as cm:
            build({"collector": {"providers_dir": 3}})
        self.assertEqual(cm.exception.problems, ["collector.providers_dir: expected str"])

    def test_from_names_a_file_of_the_users_own(self):
        write(self.folder, "myflix.toml", MYFLIX)
        config = self.config({"from": "myflix"})
        self.assertEqual(config.sources["streams"]["secret"], "myflix")
        self.assertEqual(config.secret("streams"), {"token": self.token})
        self.assertIn(self.token, config.secret_values())
        self.assertEqual(config.refused_in_use(), [])

    def test_its_credential_is_read_by_name_and_a_missing_one_is_named(self):
        write(self.folder, "myflix.toml", MYFLIX)
        with self.assertRaises(ConfigError) as cm:
            self.config({"from": "myflix"}, env={})
        self.assertEqual(cm.exception.problems, [".env: KW_MYFLIX_TOKEN missing (for streams)"])
        config = self.config(
            {"from": "myflix", "secret": "flix_two"},
            env={"KW_FLIX_TWO_TOKEN": self.token},
        )
        self.assertEqual(config.secret("streams"), {"token": self.token})

    def test_an_unknown_from_lists_the_users_providers_too(self):
        write(self.folder, "myflix.toml", MYFLIX)
        with self.assertRaises(ConfigError) as cm:
            self.config({"from": "plx"})
        self.assertEqual(
            cm.exception.problems,
            [
                'sources.streams.from: unknown provider "plx"; '
                "use jellyfin, plex, tautulli, tracearr or myflix"
            ],
        )

    def test_a_file_of_another_kind_is_refused_by_name(self):
        write(self.folder, "myflix.toml", MYFLIX)
        raw = {"sources": {"adblock": {"url": "http://192.0.2.53", "from": "myflix"}}}
        with self.assertRaises(ConfigError) as cm:
            build(raw, {}, providers=self.scan())
        self.assertEqual(
            cm.exception.problems, ['sources.adblock.from: "myflix" reads streams, not adblock']
        )

    def test_a_from_naming_a_refused_file_passes_and_its_source_fails_at_every_read(self):
        write(self.folder, "myflix.toml", BROKEN)
        config = self.config({"from": "myflix", "page_size": 99})
        self.assertEqual(config.refused_in_use(), ["streams"])
        # The settings its declaration would check are left out unchecked.
        self.assertNotIn("page_size", config.sources["streams"])
        source = next(s for s in build_sources(config) if s.name == "streams")
        self.assertIsInstance(source, RefusedProvider)
        with self.assertRaises(Exception) as cm:
            source.fetch(dt.datetime.now(dt.UTC))
        self.assertEqual(str(cm.exception), "provider myflix refused; see the settings problems")

    def test_a_from_naming_no_file_at_all_stays_an_error(self):
        with self.assertRaises(ConfigError) as cm:
            self.config({"from": "myflix"})
        self.assertEqual(
            cm.exception.problems,
            [
                'sources.streams.from: unknown provider "myflix"; '
                "use jellyfin, plex, tautulli or tracearr"
            ],
        )

    def test_the_built_ins_alone_without_a_folder(self):
        config = build({"sources": {"streams": {"url": "http://192.0.2.20:8181"}}})
        self.assertEqual(config.providers.own, {})
        self.assertEqual(config.sources["streams"]["from"], "tautulli")

    def test_the_settings_a_file_declares(self):
        write(self.folder, "myflix.toml", MYFLIX)
        config = self.config({"from": "myflix", "page_size": 20, "weight": 2})
        self.assertEqual(config.sources["streams"]["page_size"], 20)
        self.assertEqual(config.sources["streams"]["weight"], 2.0)
        self.assertIsInstance(config.sources["streams"]["weight"], float)
        self.assertNotIn("mode", config.sources["streams"])  # left out: the file's default
        cases = [
            ({"page_size": 0}, "sources.streams.page_size: must be from 1 to 50"),
            ({"page_size": "20"}, "sources.streams.page_size: expected a whole number"),
            ({"page_size": True}, "sources.streams.page_size: expected a whole number"),
            ({"mode": "some"}, 'sources.streams.mode: unknown value "some"; use live or all'),
            ({"weight": "x"}, "sources.streams.weight: expected a number"),
            ({"colour": "red"}, "sources.streams.colour: unknown setting"),
        ]
        for given, problem in cases:
            with self.subTest(given=given), self.assertRaises(ConfigError) as cm:
                self.config({"from": "myflix", **given})
            self.assertEqual(cm.exception.problems, [problem])

    def test_a_setting_of_another_provider_is_not_used_by_the_one_chosen(self):
        write(self.folder, "myflix.toml", MYFLIX)
        with self.assertRaises(ConfigError) as cm:
            raw = {"sources": {"streams": {"url": "http://192.0.2.20:8181", "page_size": 20}}}
            build(raw, providers=self.scan())
        self.assertEqual(cm.exception.problems, ["sources.streams.page_size: not used by tautulli"])


class ReadTest(Folder):
    def setUp(self):
        super().setUp()
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/sessions"] = (200, REPLY)
        write(self.folder, "myflix.toml", MYFLIX)

    def source(self, **settings) -> KindSource:
        raw = {"sources": {"streams": {"url": self.http.url, "from": "myflix", **settings}}}
        config = build(raw, self.env, providers=self.scan())
        source = next(s for s in build_sources(config) if s.name == "streams")
        self.assertIsInstance(source, KindSource)
        return source

    def test_a_users_file_is_read_by_the_engine_like_a_built_in(self):
        source = self.source(page_size=20)
        reading = source.fetch(dt.datetime.now(dt.UTC))
        self.assertEqual(reading.facts["count"], 2)
        self.assertEqual(
            [(s["title"], s["who"]) for s in reading.facts["sessions"]],
            [("The Gull Ledger", "Robin"), ("Quayside Lamps", "Sam")],
        )
        path, headers = self.http.requests[-1]
        self.assertEqual(path, "/api/sessions?limit=20&mode=live")
        self.assertEqual(headers["X-Token"], self.token)
        self.assertEqual(headers["User-Agent"], "knightwatcher")

    def test_show_is_held_for_a_users_file_as_for_a_built_in(self):
        reading = self.source(show="count").fetch(dt.datetime.now(dt.UTC))
        self.assertEqual(reading.facts["count"], 2)
        self.assertNotIn("Robin", json.dumps(reading.facts))
        self.assertNotIn("Night", json.dumps(reading.facts))


class CommandLineTest(Folder):
    def setUp(self):
        super().setUp()
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.out = os.path.join(self.root, "out")
        self.var = os.path.join(self.root, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/sessions"] = (200, REPLY)
        clean = {k: v for k, v in os.environ.items() if not k.startswith("KW_")}
        patcher = mock.patch.dict(os.environ, {**clean, **self.env}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_config(self, streams: str = "") -> None:
        write(
            self.root,
            "config.toml",
            f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
            f'proc_root = "{self.proc.root}"\n[sources.ssh]\n'
            + (f'[sources.streams]\nurl = "{self.http.url}"\n{streams}' if streams else ""),
        )

    def run_cli(self, *args):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config_path, "--admin", os.devnull + "x", *args])
        return code, out.getvalue(), err.getvalue()

    def test_check_config_exits_2_when_a_from_names_a_refused_file(self):
        write(self.folder, "myflix.toml", BROKEN)
        self.write_config('from = "myflix"\n')
        code, out, err = self.run_cli("--check-config")
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        self.assertEqual(
            err,
            "config: providers/myflix.toml: request[0].path: must start with /\n"
            "config: sources.streams.from: provider myflix refused, as above\n",
        )

    def test_check_config_warns_of_a_bad_file_no_source_reads_and_exits_0(self):
        write(self.folder, "myflix.toml", MYFLIX)
        write(self.folder, "spare.toml", BROKEN.replace('"myflix"', '"spare"'))
        write(self.folder, "tautulli.toml", MYFLIX.replace('"myflix"', '"tautulli"'))
        self.write_config('from = "myflix"\npage_size = 5\n')
        code, out, err = self.run_cli("--check-config")
        self.assertEqual(code, 0, err)
        self.assertEqual(
            out, "config ok: 2 sources enabled (ssh, streams); provider files: myflix\n"
        )
        self.assertIn(
            "warning: providers/spare.toml: request[0].path: must start with / "
            "(no source reads it)\n",
            err,
        )
        self.assertIn('warning: providers/tautulli.toml: id: "tautulli" is a built-in', err)
        self.assertNotIn(self.token, out + err)

    def test_probe_reads_a_users_file_masked(self):
        write(self.folder, "myflix.toml", MYFLIX)
        self.write_config('from = "myflix"\n')
        code, out, err = self.run_cli("--probe", "streams")
        self.assertEqual(code, 0, err)
        self.assertIn("probe streams: provider myflix (Myflix), show = names\n", out)
        self.assertIn("credentials: KW_MYFLIX_TOKEN\n", out)
        self.assertNotIn("Robin", out)
        self.assertNotIn(self.token, out + err)

    def test_probe_names_the_problems_of_a_refused_file(self):
        write(self.folder, "myflix.toml", BROKEN)
        self.write_config('from = "myflix"\n')
        code, _, err = self.run_cli("--probe", "streams")
        self.assertEqual(code, 2)
        self.assertEqual(
            err,
            "probe: provider myflix refused:\n"
            "probe: providers/myflix.toml: request[0].path: must start with /\n",
        )

    def test_once_runs_with_a_refused_file_and_says_so_in_the_state_file(self):
        write(self.folder, "myflix.toml", BROKEN)
        self.write_config('from = "myflix"\n')
        with self.assertLogs("collector", "WARNING") as logs:
            code, _, _ = self.run_cli("--once")
        self.assertEqual(code, 0)
        self.assertIn("provider file left out: providers/myflix.toml", "\n".join(logs.output))
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            state = json.load(fh)
        self.assertEqual(
            state["config"]["problems"],
            ["providers/myflix.toml: request[0].path: must start with /"],
        )
        self.assertTrue(state["sources"]["ssh"]["ok"])
        self.assertEqual(
            state["sources"]["streams"],
            {
                **state["sources"]["streams"],
                "ok": False,
                "error": "provider myflix refused; see the settings problems",
            },
        )


class TakingUpTest(Folder):
    """A change in the folder is taken up between polls, as a change to config.toml is."""

    def setUp(self):
        super().setUp()
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/sessions"] = (200, REPLY)
        self.state = tempfile.TemporaryDirectory()
        self.addCleanup(self.state.cleanup)
        write(
            self.root,
            "config.toml",
            f'[collector]\noutput_dir = "{self.state.name}"\nstate_dir = "{self.state.name}"\n'
            f'[sources.streams]\nurl = "{self.http.url}"\nfrom = "myflix"\n',
        )
        self.path = write(self.folder, "myflix.toml", MYFLIX)
        self.settings = reload.Settings(self.config_path, os.path.join(self.root, "admin.json"),
                                        self.env)  # fmt: skip
        config, said = self.settings.start()
        self.assertEqual(said["problems"], [])
        self.clock = Clock()
        self.runner = Runner(config, Memory(self.state.name), clock=self.clock)
        self.runner.config_note = reload.note(said, self.clock())

    def streams(self):
        return next(s for s in self.runner.sources if s.name == "streams")

    def test_nothing_changed_is_nothing_taken_up(self):
        self.assertFalse(self.settings.changed())
        write(self.folder, "notes.txt", "not a provider")
        self.assertFalse(self.settings.changed())

    def test_an_edited_file_is_taken_up_and_its_source_starts_afresh(self):
        before = self.streams()
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write("# edited\n")
        self.assertTrue(self.settings.changed())
        reload.poll(self.settings, self.runner, self.clock)
        self.assertIsNot(self.streams(), before)
        self.assertNotEqual(self.streams().identity, before.identity)
        self.assertEqual(self.runner.config_note["problems"], [])
        self.assertFalse(self.settings.changed())

    def test_an_unrelated_file_leaves_the_source_as_it_was(self):
        before = self.streams()
        write(self.folder, "other.toml", MYFLIX.replace('"myflix"', '"other"'))
        reload.poll(self.settings, self.runner, self.clock)
        self.assertIs(self.streams(), before)
        self.assertIn("other", self.runner.config.providers.own)

    def test_a_file_broken_while_running_fails_its_source_and_nothing_else(self):
        write(self.folder, "myflix.toml", BROKEN)
        with self.assertLogs("collector", "WARNING"):
            reload.poll(self.settings, self.runner, self.clock)
        self.assertIsInstance(self.streams(), RefusedProvider)
        self.assertEqual(
            self.runner.config_note["problems"],
            ["providers/myflix.toml: request[0].path: must start with /"],
        )
        self.assertNotIn("refused", self.runner.config_note)
        # Mended, it is read again.
        write(self.folder, "myflix.toml", MYFLIX)
        reload.poll(self.settings, self.runner, self.clock)
        self.assertIsInstance(self.streams(), KindSource)
        self.assertEqual(self.runner.config_note["problems"], [])

    def test_a_file_removed_while_named_keeps_the_settings_in_use(self):
        os.remove(self.path)
        with self.assertLogs("collector", "WARNING"):
            reload.poll(self.settings, self.runner, self.clock)
        self.assertIsInstance(self.streams(), KindSource)
        self.assertEqual(
            self.runner.config_note["problems"],
            [
                'sources.streams.from: unknown provider "myflix"; '
                "use jellyfin, plex, tautulli or tracearr"
            ],
        )
        self.assertIn("refused", self.runner.config_note)


if __name__ == "__main__":
    unittest.main()
