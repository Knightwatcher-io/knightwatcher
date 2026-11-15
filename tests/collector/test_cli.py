import contextlib
import io
import json
import os
import secrets
import tempfile
import time
import unittest
from unittest import mock

from collector import contract
from collector.cli import main
from kw_helpers import FakeProc


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
        self.config = os.path.join(self.tmp.name, "config.toml")
        self.env_file = os.path.join(self.tmp.name, ".env")
        self.write_config("")
        # No credential from the environment the tests run in reaches them.
        clean = {k: v for k, v in os.environ.items() if not k.startswith("KNIGHTWATCHER_")}
        patcher = mock.patch.dict(os.environ, clean, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_env(self, text: str) -> None:
        with open(self.env_file, "w", encoding="utf-8") as fh:
            fh.write(text)

    def write_config(self, extra: str) -> None:
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'proc_root = "{self.proc.root}"\n'
                f'[sources.host]\ndisks = [{{ mount = "/data", path = "{self.tmp.name}" }}]\n'
                "[sources.ssh]\n"
                '[sources.updates]\nholders = [{ name = "nightly", pattern = "nightly" }]\n' + extra
            )

    def run_cli(self, *args):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, *args])
        return code, out.getvalue(), err.getvalue()

    def test_check_config_ok(self):
        code, out, _ = self.run_cli("--check-config")
        self.assertEqual(code, 0)
        self.assertIn("config ok: 3 sources enabled (host, ssh, updates)\n", out)
        self.write_config(
            '[sources.pi]\nhost = "192.0.2.4"\n'
            '[[device]]\nname = "Vault"\nkind = "machine"\nhost = "192.0.2.40"\nport = 445\n'
        )
        code, out, _ = self.run_cli("--check-config")
        self.assertEqual(
            out, "config ok: 4 sources enabled (host, ssh, updates, pi); 2 watched (Pi, Vault)\n"
        )

    def test_check_config_reports_problems(self):
        self.write_config('[sources.adblock]\nurl = "http://192.0.2.53"\n')
        code, _, err = self.run_cli("--check-config")
        self.assertEqual(code, 2)
        self.assertIn("config: .env: KNIGHTWATCHER_ADGUARD_USERNAME missing (for adblock)", err)
        self.assertIn("config: .env: KNIGHTWATCHER_ADGUARD_PASSWORD missing (for adblock)", err)

    def test_check_config_reads_the_process_environment(self):
        self.write_config('[sources.streams]\nurl = "http://192.0.2.20:8181"\n')
        key = secrets.token_hex(16)
        with mock.patch.dict(os.environ, {"KNIGHTWATCHER_TAUTULLI_API_KEY": key}):
            code, out, err = self.run_cli("--check-config")
        self.assertEqual(code, 0, err)
        self.assertNotIn(key, out + err)

    def test_check_config_reads_an_env_file_instead(self):
        self.write_config(
            '[sources.streams]\nurl = "http://192.0.2.20:8181"\n'
            '[sources.adblock]\nurl = "http://192.0.2.53"\n'
        )
        key, password = secrets.token_hex(16), secrets.token_urlsafe(18) + "$#'"
        quoted = password.replace("'", "")
        self.write_env(
            "# credentials for the check\n"
            f"KNIGHTWATCHER_TAUTULLI_API_KEY={key}\n"
            "KNIGHTWATCHER_ADGUARD_USERNAME=knightwatcher\n"
            f"KNIGHTWATCHER_ADGUARD_PASSWORD='{quoted}'\n"
            "KNIGHTWATCHER_OUT=/srv/www/knightwatcher/data\n"
        )
        # The process environment holds other values, which the file replaces.
        with mock.patch.dict(os.environ, {"KNIGHTWATCHER_TAUTULLI_API_KEY": ""}):
            code, out, err = self.run_cli("--check-config", "--env-file", self.env_file)
        self.assertEqual(code, 0, err)
        self.assertIn("config ok: 5 sources enabled", out)
        for value in (key, quoted):
            self.assertNotIn(value, out + err)

    def test_a_missing_credential_names_the_variable_never_a_value(self):
        self.write_config('[sources.adblock]\nurl = "http://192.0.2.53"\n')
        password = secrets.token_urlsafe(18)
        self.write_env(
            f"KNIGHTWATCHER_ADGUARD_PASSWORD={password}\nKNIGHTWATCHER_ADGUARD_USERNAME=\n"
        )
        code, out, err = self.run_cli("--check-config", "--env-file", self.env_file)
        self.assertEqual(code, 2)
        self.assertEqual(
            err, "config: .env: KNIGHTWATCHER_ADGUARD_USERNAME missing (for adblock)\n"
        )
        self.assertNotIn(password, out + err)

    def test_a_bad_env_file_names_the_line_never_its_content(self):
        password = secrets.token_urlsafe(18)
        self.write_env(f"# a comment\nKNIGHTWATCHER_ADGUARD_PASSWORD {password}\n")
        code, out, err = self.run_cli("--check-config", "--env-file", self.env_file)
        self.assertEqual(code, 2)
        self.assertEqual(err, f"config: {self.env_file}: line 2: expected NAME=value\n")
        self.assertNotIn(password, out + err)

    def test_env_file_goes_only_with_check_config(self):
        self.write_env("")
        with contextlib.redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit) as cm:
            main(["--config", self.config, "--once", "--env-file", self.env_file])
        self.assertEqual(cm.exception.code, 2)
        self.assertIn("--env-file goes with --check-config", err.getvalue())

    def test_the_secrets_flag_is_gone(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            main(["--config", self.config, "--secrets", "secrets.json", "--check-config"])
        self.assertEqual(cm.exception.code, 2)

    def test_once_writes_a_valid_state_file_then_health_passes(self):
        code, _, _ = self.run_cli("--once")
        self.assertEqual(code, 0)
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            state = json.load(fh)
        self.assertEqual(contract.validate(state), [])
        self.assertTrue(all(s["ok"] for s in state["sources"].values()))
        self.assertEqual(state["facts"]["updates"], {"running": False, "what": ""})
        self.assertTrue(os.path.exists(os.path.join(self.var, "memory.json")))
        self.assertEqual(self.run_cli("--health")[0], 0)

    def age_state(self, seconds):
        old = time.time() - seconds
        os.utime(os.path.join(self.out, "state.json"), (old, old))

    def test_health_fails_when_the_file_is_old_or_missing(self):
        self.assertEqual(self.run_cli("--health")[0], 1)
        self.run_cli("--once")
        self.age_state(3 * 10 + 5)  # three of the default 10-second intervals and more
        code, _, err = self.run_cli("--health")
        self.assertEqual(code, 1)
        self.assertRegex(err, r"unhealthy: state.json is 3[56] s old")

    def test_health_passes_within_three_intervals(self):
        self.run_cli("--once")
        self.age_state(25)  # two polls missed, and a third under way
        self.assertEqual(self.run_cli("--health")[0], 0)

    def test_health_follows_the_configured_interval(self):
        self.write_config("")
        with open(self.config, encoding="utf-8") as fh:
            text = fh.read().replace("[collector]\n", "[collector]\ninterval_s = 30\n", 1)
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(text)
        self.run_cli("--once")
        self.age_state(60)
        self.assertEqual(self.run_cli("--health")[0], 0)
        self.age_state(95)
        self.assertEqual(self.run_cli("--health")[0], 1)

    def test_health_does_not_need_the_credentials(self):
        self.run_cli("--once")
        self.write_config('[sources.adblock]\nurl = "http://192.0.2.53"\n')
        self.assertEqual(self.run_cli("--health")[0], 0)

    def test_unwritable_output_folder(self):
        os.rmdir(self.out)
        code, _, err = self.run_cli("--once")
        self.assertEqual(code, 2)
        self.assertIn("not a writable folder", err)


if __name__ == "__main__":
    unittest.main()
