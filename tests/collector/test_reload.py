"""The admin page's settings in the collector: admin.json laid over config.toml, at start and while
it runs (collector/overlay.py, collector/reload.py), the start-versus-reload rule for credentials,
the acknowledgement in state.json, and credentials.json. Every value here is invented, and the
credential values are made for each run."""

import contextlib
import io
import json
import os
import secrets
import stat
import tempfile
import time
import tomllib
import unittest
from typing import ClassVar
from unittest import mock

from collector import config, contract, overlay, reload
from collector.cli import main
from collector.config import ConfigError, build, credential_names
from collector.runner import Runner
from collector.sources import MissingCredentials
from collector.store import Memory
from kw_helpers import Clock, FakeHttp, FakeProc, closed_port


def write_admin(path: str, given: dict) -> str:
    data = (json.dumps({"v": 1, "set": given}, indent=2) + "\n").encode("utf-8")
    with open(path, "wb") as fh:
        fh.write(data)
    return overlay.version_of(data)


class OverlayTest(unittest.TestCase):
    def test_paths_are_the_collectors_editable_settings_and_the_devices(self):
        self.assertIn("collector.interval_s", overlay.PATHS)
        self.assertIn("conditions.cpu_hot.pct", overlay.PATHS)
        self.assertIn("sources.sonarr.enabled", overlay.PATHS)
        for fixed in ("collector.output_dir", "collector.state_dir", "collector.proc_root"):
            self.assertIn(fixed, overlay.FIXED)
            self.assertNotIn(fixed, overlay.PATHS)
        self.assertIn("sources.sonarr.secret", overlay.FIXED)
        self.assertFalse(any(p.split(".")[0] in config.DEFAULT_TABLES for p in overlay.PATHS))

    def test_a_path_the_store_cannot_hold_is_named(self):
        self.assertIsNone(overlay.path_problem("collector.interval_s", 15))
        self.assertIsNone(overlay.path_problem("conditions.disk_full.pct", 80))
        self.assertEqual(
            overlay.path_problem("collector.output_dir", "/x"),
            "collector.output_dir: not set on the admin page",
        )
        self.assertEqual(
            overlay.path_problem("sources.sonarr.secret", "other"),
            "sources.sonarr.secret: not set on the admin page",
        )
        self.assertEqual(
            overlay.path_problem("look.tabard", "teal"), "look.tabard: unknown setting"
        )
        self.assertEqual(
            overlay.path_problem("collector.interval_s", "15"),
            "collector.interval_s: expected a whole number",
        )
        self.assertEqual(
            overlay.path_problem("collector.interval_s", True),
            "collector.interval_s: expected a whole number",
        )
        self.assertEqual(overlay.path_problem("device", {}), "device: expected [[device]] tables")

    def test_lay_sets_each_path_and_replaces_a_list_whole(self):
        raw = {
            "collector": {"interval_s": 10},
            "conditions": {"attack": {"jails": ["sshd", "caddy"]}},
            "device": [{"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445}],
        }
        laid = overlay.lay(
            raw,
            {
                "collector.interval_s": 15,
                "conditions.attack.jails": ["sshd"],
                "sources.radarr.url": "http://192.0.2.31:7878",
                "device": [],
            },
        )
        self.assertEqual(laid["collector"]["interval_s"], 15)
        self.assertEqual(laid["conditions"]["attack"]["jails"], ["sshd"])
        self.assertEqual(laid["sources"]["radarr"], {"url": "http://192.0.2.31:7878"})
        self.assertEqual(laid["device"], [])
        self.assertEqual(raw["collector"]["interval_s"], 10, "the file's parse is not changed")
        self.assertEqual(
            overlay.value_at(raw, "conditions.attack.jails"), (True, ["sshd", "caddy"])
        )
        self.assertEqual(overlay.value_at(raw, "conditions.night.start"), (False, None))

    def test_parse_keeps_what_it_can_and_names_the_rest(self):
        given, problems = overlay.parse(
            b'{"v": 1, "set": {"collector.interval_s": 15, "collector.renamed_s": 3}}'
        )
        self.assertEqual(given, {"collector.interval_s": 15})
        self.assertEqual(problems, ["collector.renamed_s: unknown setting"])
        self.assertEqual(overlay.parse(b"not json")[0], {})
        self.assertIn("not JSON", overlay.parse(b"not json")[1][0])
        self.assertIn("not version 1", overlay.parse(b'{"v": 2, "set": {}}')[1][0])

    def test_read_gives_the_version_of_the_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, overlay.FILE)
            self.assertEqual(overlay.read(path), ({}, None, []))
            version = write_admin(path, {"collector.interval_s": 15})
            self.assertRegex(version, r"^[0-9a-f]{20}$")
            self.assertEqual(overlay.read(path), ({"collector.interval_s": 15}, version, []))


RAW_SONARR = {"sources": {"sonarr": {"url": "http://192.0.2.30:8989"}}}


class MissingCredentialsTest(unittest.TestCase):
    RAW = RAW_SONARR

    def test_by_default_a_missing_credential_is_a_problem(self):
        with self.assertRaises(ConfigError) as caught:
            build(self.RAW, {})
        self.assertEqual(
            caught.exception.problems, [".env: KNIGHTWATCHER_SONARR_API_KEY missing (for sonarr)"]
        )

    def test_reported_it_leaves_the_source_failing_with_the_variables_name(self):
        c = build(self.RAW, {}, missing="report")
        self.assertEqual(
            c.missing, {"sonarr": [".env: KNIGHTWATCHER_SONARR_API_KEY missing (for sonarr)"]}
        )
        from collector.sources import build_sources

        (source,) = build_sources(c)
        self.assertIsInstance(source, MissingCredentials)
        self.assertEqual(source.name, "sonarr")
        with self.assertRaises(Exception) as caught:
            source.fetch(None)
        self.assertEqual(str(caught.exception), "KNIGHTWATCHER_SONARR_API_KEY missing")

    def test_other_problems_are_still_refused(self):
        raw = {"collector": {"interval_s": 2}, **self.RAW}
        with self.assertRaises(ConfigError):
            build(raw, {}, missing="report")


class CredentialNamesTest(unittest.TestCase):
    def test_names_only_and_never_a_value(self):
        value = secrets.token_hex(16)
        names = credential_names(
            {
                "KNIGHTWATCHER_SONARR_API_KEY": value,
                "KNIGHTWATCHER_SONARR_4K_API_KEY": value,
                "KNIGHTWATCHER_RADARR_API_KEY": "",
                "KNIGHTWATCHER_ADMIN_PASSWORD": value,
                "KNIGHTWATCHER_OUT": "/out",
                "PATH": "/usr/bin",
            }
        )
        self.assertTrue(names["KNIGHTWATCHER_SONARR_API_KEY"])
        self.assertTrue(names["KNIGHTWATCHER_SONARR_4K_API_KEY"])
        self.assertFalse(names["KNIGHTWATCHER_RADARR_API_KEY"])
        self.assertFalse(names["KNIGHTWATCHER_TAUTULLI_API_KEY"])
        for absent in ("KNIGHTWATCHER_ADMIN_PASSWORD", "KNIGHTWATCHER_OUT", "PATH"):
            self.assertNotIn(absent, names)
        self.assertNotIn(value, json.dumps(names))
        self.assertTrue(all(v in (True, False) for v in names.values()))


class SettingsTest(unittest.TestCase):
    """reload.Settings: what the collector starts on and what it takes up."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config_path = os.path.join(self.tmp.name, "config.toml")
        self.admin_path = os.path.join(self.tmp.name, overlay.FILE)
        self.write_config("[collector]\ninterval_s = 10\n")
        self.settings = reload.Settings(self.config_path, self.admin_path, {})

    def write_config(self, text: str) -> None:
        with open(self.config_path, "w", encoding="utf-8") as fh:
            fh.write(text)
        # A second write within the same tick still counts: the size differs, or the time does.
        time.sleep(0.01)

    def test_with_no_store_the_file_alone(self):
        c, said = self.settings.start()
        self.assertEqual(c.interval_s, 10)
        self.assertEqual(said, {"admin": None, "problems": []})

    def test_the_store_is_laid_over_the_file(self):
        version = write_admin(self.admin_path, {"collector.interval_s": 15})
        c, said = self.settings.start()
        self.assertEqual(c.interval_s, 15)
        self.assertEqual(said, {"admin": version, "problems": []})

    def test_a_store_that_fails_leaves_the_file_alone_and_says_why(self):
        version = write_admin(self.admin_path, {"collector.http_timeout_s": 12.0})
        with self.assertLogs("collector", "WARNING"):
            c, said = self.settings.start()
        self.assertEqual(c.collector["http_timeout_s"], 5.0)
        self.assertEqual(said["admin"], None)
        self.assertEqual(said["refused"], version)
        self.assertEqual(
            said["problems"], ["collector.http_timeout_s: must be shorter than interval_s"]
        )

    def test_at_start_config_toml_must_pass_alone_credentials_included(self):
        self.write_config('[sources.sonarr]\nurl = "http://192.0.2.30:8989"\n')
        write_admin(self.admin_path, {"sources.sonarr.enabled": False})
        with self.assertRaises(ConfigError) as caught:
            self.settings.start()
        self.assertIn("KNIGHTWATCHER_SONARR_API_KEY missing", caught.exception.problems[0])

    def test_a_credential_the_store_needs_is_reported_and_the_rest_runs(self):
        self.write_config('[sources.sonarr]\nenabled = false\nurl = "http://192.0.2.30:8989"\n')
        version = write_admin(self.admin_path, {"sources.sonarr.enabled": True})
        with self.assertLogs("collector", "WARNING"):
            c, said = self.settings.start()
        self.assertIn("sonarr", c.missing)
        self.assertEqual(said["admin"], version)
        self.assertEqual(
            said["problems"], [".env: KNIGHTWATCHER_SONARR_API_KEY missing (for sonarr)"]
        )

    def test_a_change_to_either_file_is_seen_and_taken_up(self):
        running, _ = self.settings.start()
        self.assertFalse(self.settings.changed())
        version = write_admin(self.admin_path, {"collector.interval_s": 20})
        self.assertTrue(self.settings.changed())
        with self.assertLogs("collector", "INFO"):
            new, said = self.settings.take_up(running)
        self.assertEqual(new.interval_s, 20)
        self.assertEqual(said, {"admin": version, "problems": []})
        self.assertFalse(self.settings.changed())
        self.write_config("[collector]\ninterval_s = 10\ntimezone = 'Europe/London'\n")
        self.assertTrue(self.settings.changed())
        with self.assertLogs("collector", "INFO"):
            new, _ = self.settings.take_up(new)
        self.assertEqual(new.collector["timezone"], "Europe/London")
        self.assertEqual(new.interval_s, 20, "the store still lies over the new file")

    def test_a_change_that_fails_is_not_taken_up(self):
        running, _ = self.settings.start()
        version = write_admin(self.admin_path, {"collector.interval_s": 2})
        with self.assertLogs("collector", "WARNING"):
            new, said = self.settings.take_up(running)
        self.assertIsNone(new)
        self.assertEqual(said["refused"], version)
        self.assertEqual(
            said["problems"],
            [
                "collector.interval_s: must be at least 5",
                "collector.http_timeout_s: must be shorter than interval_s",
            ],
        )
        self.write_config("[collector\n")
        with self.assertLogs("collector", "WARNING"):
            new, said = self.settings.take_up(running)
        self.assertIsNone(new)
        self.assertIn("config.toml", said["problems"][0])

    def test_the_folders_change_only_at_a_restart(self):
        running, _ = self.settings.start()
        self.write_config('[collector]\noutput_dir = "/elsewhere"\n')
        with self.assertLogs("collector", "WARNING"):
            new, said = self.settings.take_up(running)
        self.assertIsNone(new)
        self.assertEqual(
            said["problems"], ["collector.output_dir: changes only when the collector starts again"]
        )

    def test_the_providers_folder_is_watched_and_may_move_while_it_runs(self):
        running, _ = self.settings.start()
        self.assertEqual(self.settings.folder, os.path.join(self.tmp.name, "providers"))
        # A folder that does not exist yet is watched for its making.
        mine = os.path.join(self.tmp.name, "providers")
        os.mkdir(mine)
        self.assertTrue(self.settings.changed())
        with self.assertLogs("collector", "INFO"):
            running, said = self.settings.take_up(running)
        self.assertEqual(said["problems"], [])
        self.assertFalse(self.settings.changed())
        # providers_dir is taken up live: it only names a folder to read.
        other = os.path.join(self.tmp.name, "other")
        os.mkdir(other)
        with open(os.path.join(other, "bad.toml"), "w", encoding="utf-8") as fh:
            fh.write("format = 1\n")
        self.write_config(f'[collector]\ninterval_s = 10\nproviders_dir = "{other}"\n')
        with self.assertLogs("collector", "WARNING"):
            new, said = self.settings.take_up(running)
        self.assertIsNotNone(new)
        self.assertEqual(self.settings.folder, other)
        self.assertTrue(said["problems"])
        self.assertTrue(all(p.startswith("providers/bad.toml: ") for p in said["problems"]))
        self.assertEqual(list(new.providers.refused), ["bad"])


class ReconfigureTest(unittest.TestCase):
    """A running collector taking up a change between polls."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.config_path = os.path.join(self.tmp.name, "config.toml")
        self.admin_path = os.path.join(self.tmp.name, overlay.FILE)
        self.port = closed_port()
        with open(self.config_path, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'proc_root = "{self.proc.root}"\n'
                "[sources.host]\n[sources.ssh]\n"
                f'[[device]]\nname = "Vault"\nkind = "machine"\nhost = "127.0.0.1"\n'
                f"port = {self.port}\nrefused_counts = true\nevery_s = 10\n"
                f'[[device]]\nname = "Gate cam"\nkind = "camera"\nhost = "127.0.0.1"\n'
                f"port = {self.port}\nevery_s = 10\n"
            )
        self.clock = Clock()
        self.settings = reload.Settings(self.config_path, self.admin_path, {})
        c, said = self.settings.start()
        self.runner = Runner(c, Memory(self.var), clock=self.clock)
        self.runner.config_note = reload.note(said, self.clock())

    def state(self):
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def test_the_file_says_which_settings_are_in_use(self):
        self.runner.cycle()
        s = self.state()
        self.assertEqual(s["config"], {"admin": None, "at": "2026-01-15T21:00:00Z", "problems": []})
        self.assertEqual(contract.validate(s), [])

    def test_a_change_is_taken_up_between_polls_and_acknowledged(self):
        self.runner.cycle()
        host = next(s for s in self.runner.sources if s.name == "host")
        version = write_admin(
            self.admin_path,
            {
                "sources.ssh.enabled": False,
                "conditions.disk_full.pct": 80,
                "device": [
                    {"name": "Gate cam", "kind": "camera", "host": "127.0.0.1", "port": self.port},
                    {
                        "name": "Vault",
                        "kind": "machine",
                        "host": "127.0.0.1",
                        "port": self.port,
                        "refused_counts": True,
                        "every_s": 10,
                    },
                ],
            },
        )
        self.clock.advance(10)
        with self.assertLogs("collector", "INFO"):
            reload.poll(self.settings, self.runner, self.clock)
        names = [s.name for s in self.runner.sources]
        self.assertEqual(names, ["host", "device:Gate cam", "device:Vault"])
        self.assertIs(
            next(s for s in self.runner.sources if s.name == "host"),
            host,
            "a source whose reads are the same keeps its instance and its samples",
        )
        self.assertEqual(self.runner.conditions.config.conditions["disk_full"]["pct"], 80.0)
        self.runner.cycle()
        s = self.state()
        self.assertEqual(s["config"]["admin"], version)
        self.assertEqual(s["config"]["at"], "2026-01-15T21:00:10Z")
        self.assertEqual([t["name"] for t in s["facts"]["devices"]["list"]], ["Gate cam", "Vault"])
        self.assertNotIn("ssh", s["sources"])
        self.assertEqual(contract.validate(s), [])

    def test_a_new_interval_is_the_next_polls_and_every_source_starts_afresh(self):
        self.runner.cycle()
        host = next(s for s in self.runner.sources if s.name == "host")
        write_admin(self.admin_path, {"collector.interval_s": 20})
        with self.assertLogs("collector", "INFO"):
            reload.poll(self.settings, self.runner, self.clock)
        self.assertEqual(self.runner.config.interval_s, 20)
        self.assertIsNot(next(s for s in self.runner.sources if s.name == "host"), host)
        self.runner.cycle()
        self.assertEqual(self.state()["interval_s"], 20)

    def test_a_refused_change_keeps_the_settings_and_says_why(self):
        self.runner.cycle()
        version = write_admin(self.admin_path, {"collector.http_timeout_s": 30.0})
        self.clock.advance(10)
        with self.assertLogs("collector", "WARNING"):
            reload.poll(self.settings, self.runner, self.clock)
        self.runner.cycle()
        s = self.state()
        self.assertEqual(
            s["config"],
            {
                "admin": None,
                "at": "2026-01-15T21:00:00Z",
                "problems": ["collector.http_timeout_s: must be shorter than interval_s"],
                "refused": version,
            },
        )
        self.assertEqual(contract.validate(s), [])

    def test_a_watched_devices_record_follows_it_to_its_new_place(self):
        self.runner.cycle()
        vault = self.runner.conditions.watches[0]
        self.assertEqual(vault.device["name"], "Vault")
        write_admin(
            self.admin_path,
            {
                "device": [
                    {"name": "Gate cam", "kind": "camera", "host": "127.0.0.1", "port": self.port},
                    {
                        "name": "Vault",
                        "kind": "machine",
                        "host": "127.0.0.1",
                        "port": self.port,
                        "refused_counts": True,
                        "every_s": 10,
                    },
                ]
            },
        )
        with self.assertLogs("collector", "INFO"):
            reload.poll(self.settings, self.runner, self.clock)
        self.assertIs(self.runner.conditions.watches[1], vault)
        self.assertEqual(vault.index, 1)

    def test_a_missing_credential_taken_up_leaves_its_source_failing(self):
        self.runner.cycle()
        version = write_admin(
            self.admin_path,
            {"sources.sonarr.url": "http://192.0.2.30:8989", "sources.sonarr.enabled": True},
        )
        with self.assertLogs("collector", "WARNING"):
            reload.poll(self.settings, self.runner, self.clock)
        self.runner.cycle()
        s = self.state()
        self.assertEqual(s["config"]["admin"], version)
        self.assertEqual(
            s["config"]["problems"], [".env: KNIGHTWATCHER_SONARR_API_KEY missing (for sonarr)"]
        )
        self.assertEqual(s["sources"]["sonarr"]["ok"], False)
        self.assertEqual(s["sources"]["sonarr"]["error"], "KNIGHTWATCHER_SONARR_API_KEY missing")
        self.assertEqual(s["sources"]["host"]["ok"], True, "the rest carries on")


class ContractTest(unittest.TestCase):
    def test_config_is_checked_when_present(self):
        good = {"admin": None, "at": "2026-01-15T21:00:00Z", "problems": []}
        self.assertEqual(contract._config(good), [])
        self.assertEqual(contract._config({**good, "admin": "0" * 20, "refused": None}), [])
        self.assertEqual(
            contract._config({**good, "admin": "nope"}), ["config.admin is not null or a version"]
        )
        self.assertEqual(
            contract._config({**good, "at": "now"}), ["config.at is not a UTC timestamp"]
        )
        self.assertEqual(
            contract._config({**good, "problems": [1]}), ["config.problems is not a list of text"]
        )
        self.assertEqual(
            contract._config({**good, "extra": 1}),
            ["config has a key other than admin, at, problems and refused"],
        )
        self.assertEqual(
            contract._config([]), ["config is not an object with admin, at and problems"]
        )


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.proc = FakeProc()
        self.addCleanup(self.proc.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.config_path = os.path.join(self.tmp.name, "config.toml")
        self.admin_path = os.path.join(self.tmp.name, overlay.FILE)
        with open(self.config_path, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'proc_root = "{self.proc.root}"\n[sources.ssh]\n'
            )
        self.value = secrets.token_hex(16)
        clean = {k: v for k, v in os.environ.items() if not k.startswith("KNIGHTWATCHER_")}
        clean["KNIGHTWATCHER_SONARR_API_KEY"] = self.value
        patcher = mock.patch.dict(os.environ, clean, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_cli(self, *args):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config_path, "--admin", self.admin_path, *args])
        return code, out.getvalue(), err.getvalue()

    def test_once_writes_the_credentials_names_and_the_settings_in_use(self):
        version = write_admin(self.admin_path, {"collector.interval_s": 15})
        code, _, err = self.run_cli("--once")
        self.assertEqual(code, 0, err)
        path = os.path.join(self.out, "credentials.json")
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn(self.value, text)
        self.assertNotIn(self.value, err)
        names = json.loads(text)
        self.assertIs(names["KNIGHTWATCHER_SONARR_API_KEY"], True)
        self.assertIs(names["KNIGHTWATCHER_RADARR_API_KEY"], False)
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o640)
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            state = json.load(fh)
        self.assertEqual(state["interval_s"], 15)
        self.assertEqual(state["config"]["admin"], version)
        self.assertEqual(state["config"]["problems"], [])

    def test_check_config_checks_config_toml_alone(self):
        write_admin(self.admin_path, {"collector.interval_s": 2})
        code, out, _ = self.run_cli("--check-config")
        self.assertEqual(code, 0)
        self.assertIn("config ok:", out)

    def test_health_uses_the_interval_the_file_says_is_in_use(self):
        state = os.path.join(self.out, "state.json")
        with open(state, "w", encoding="utf-8") as fh:
            json.dump({"interval_s": 60}, fh)
        old = time.time() - 100  # older than three of config.toml's 10 s, younger than three of 60
        os.utime(state, (old, old))
        code, _, _ = self.run_cli("--health")
        self.assertEqual(code, 0)
        with open(state, "w", encoding="utf-8") as fh:
            json.dump({"interval_s": 10}, fh)
        os.utime(state, (old, old))
        code, _, err = self.run_cli("--health")
        self.assertEqual(code, 1)
        self.assertIn("unhealthy", err)


class ExampleConfigTest(unittest.TestCase):
    def test_the_example_config_takes_every_editable_path(self):
        # Every path the admin page may set exists in the schema the example follows.
        with open(
            os.path.join(os.path.dirname(__file__), "..", "..", "config.example.toml"), "rb"
        ) as fh:
            tomllib.load(fh)
        for path in overlay.PATHS:
            table, key = path.rsplit(".", 1)
            self.assertIn(key, [s["key"] for s in config.schema.settings(table)], path)


class StreamsShowTest(unittest.TestCase):
    """The setting sources.streams.show changed on the admin page while streams play: from the
    next poll on, nothing it holds back is in the state file, the words held through the
    condition's clearing period included."""

    SESSIONS: ClassVar[list] = [
        {
            "session_key": "4",
            "friendly_name": "Robin",
            "media_type": "movie",
            "title": "Harbour of Glass",
        },
        {
            "session_key": "9",
            "user": "Sam",
            "media_type": "episode",
            "grandparent_title": "The Lantern Keepers",
            "parent_media_index": "1",
            "media_index": "3",
        },
    ]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.answer(200)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        config_path = os.path.join(self.tmp.name, "config.toml")
        self.admin_path = os.path.join(self.tmp.name, overlay.FILE)
        with open(config_path, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'[sources.streams]\nurl = "{self.http.url}"\n'
            )
        self.clock = Clock()
        key = {"KNIGHTWATCHER_TAUTULLI_API_KEY": "tk-" + secrets.token_hex(8)}
        self.settings = reload.Settings(config_path, self.admin_path, key)
        c, _said = self.settings.start()
        self.runner = Runner(c, Memory(self.var), clock=self.clock)

    def answer(self, status):
        data = {"stream_count": "2", "sessions": self.SESSIONS}
        reply = {"response": {"result": "success", "data": data}}
        self.http.routes["/api/v2"] = (status, reply if status == 200 else {})

    def poll(self, change=None, wait=10):
        if change is not None:
            write_admin(self.admin_path, {"sources.streams.show": change})
        self.clock.advance(wait)
        reload.poll(self.settings, self.runner, self.clock)
        self.runner.cycle()
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            written = fh.read()
        state = json.loads(written)
        self.assertEqual(contract.validate(state), [])
        return state, written

    def test_titles_then_count(self):
        state, written = self.poll()
        self.assertEqual(state["conditions"][0]["detail"], "Robin · Harbour of Glass · 1 of 2")
        self.assertEqual(
            state["facts"]["streams"]["sessions"],
            [
                {"who": "Robin", "title": "Harbour of Glass"},
                {"who": "Sam", "title": "The Lantern Keepers S01E03"},
            ],
        )
        # Tautulli stops answering as the setting changes: the condition is held on its last words
        self.answer(500)
        state, written = self.poll("titles")
        self.assertEqual(state["conditions"][0]["id"], "streaming")
        self.assertEqual(state["conditions"][0]["detail"], "Harbour of Glass · 1 of 2")
        self.assertIsNone(state["facts"]["streams"])
        for name in ("Robin", "Sam"):
            self.assertNotIn(name, written)
        # and answers again at the source's next read, 30 seconds after the last
        self.answer(200)
        state, written = self.poll(wait=30)
        self.assertEqual(
            state["facts"]["streams"],
            {
                "count": 2,
                "titles": ["Harbour of Glass", "The Lantern Keepers S01E03"],
                "sessions": [
                    {"title": "Harbour of Glass"},
                    {"title": "The Lantern Keepers S01E03"},
                ],
            },
        )
        for name in ("Robin", "Sam"):
            self.assertNotIn(name, written)
        state, written = self.poll("count")
        self.assertEqual(state["facts"]["streams"], {"count": 2})
        self.assertEqual(state["conditions"][0]["detail"], "2 streams")
        for held in ("Robin", "Sam", "Harbour", "Lantern"):
            self.assertNotIn(held, written)


if __name__ == "__main__":
    unittest.main()
