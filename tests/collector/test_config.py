import json
import os
import tempfile
import unittest

from collector.config import CONDITION_IDS, ConfigError, build, load


class BuildTest(unittest.TestCase):
    def test_defaults(self):
        c = build({})
        self.assertEqual(c.interval_s, 30)
        self.assertEqual(c.conditions["priority"], CONDITION_IDS)
        self.assertEqual(c.conditions["cpu_hot"], {"pct": 85.0, "for_s": 300})
        self.assertEqual(c.conditions["memory_tight"]["available_pct"], 10.0)
        self.assertEqual(c.conditions["disk_full"]["pct"], 90.0)
        self.assertEqual(c.conditions["backup_overdue"]["hours"], 30.0)
        self.assertEqual(c.conditions["pi_silent"]["for_s"], 180)
        self.assertEqual(c.conditions["wan_down"]["failed_checks"], 2)
        self.assertEqual(c.conditions["container_unhealthy"]["for_s"], 180)
        self.assertEqual(c.conditions["attack"], {"window_s": 600, "jails": ["sshd"], "bans": 5})
        self.assertEqual(c.conditions["night"], {"start": "23:00", "end": "07:00"})
        self.assertEqual(c.collector["timezone"], "UTC")
        self.assertEqual(c.sources, {})

    def test_a_present_table_enables_a_source(self):
        c = build({"sources": {"wan": {}, "ssh": {"enabled": False}}})
        self.assertEqual(list(c.sources), ["wan"])

    def test_unknown_setting_is_an_error(self):
        with self.assertRaises(ConfigError) as cm:
            build({"collector": {"intervall_s": 10}})
        self.assertIn("collector.intervall_s: unknown setting", cm.exception.problems)

    def test_wrong_type_is_an_error(self):
        with self.assertRaises(ConfigError) as cm:
            build({"conditions": {"cpu_hot": {"pct": "high"}}})
        self.assertIn("conditions.cpu_hot.pct: expected float", cm.exception.problems)

    def test_an_int_is_accepted_for_a_float(self):
        c = build({"conditions": {"cpu_hot": {"pct": 90}}})
        self.assertEqual(c.conditions["cpu_hot"]["pct"], 90.0)

    def test_required_url(self):
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"containers": {}}})
        self.assertIn(
            "sources.containers.url: required when the source is enabled", cm.exception.problems
        )

    def test_priority_rejects_unknown_and_duplicate(self):
        with self.assertRaises(ConfigError) as cm:
            build({"conditions": {"priority": ["attack", "attack", "fire"]}})
        self.assertEqual(len(cm.exception.problems), 2)

    def test_priority_may_leave_a_condition_out(self):
        c = build({"conditions": {"priority": ["night", "attack"]}})
        self.assertEqual(c.conditions["priority"], ["night", "attack"])

    def test_bad_timezone_and_hours(self):
        with self.assertRaises(ConfigError) as cm:
            build(
                {
                    "collector": {"timezone": "Mars/Olympus"},
                    "conditions": {"night": {"start": "25:00"}},
                }
            )
        self.assertEqual(len(cm.exception.problems), 2)

    def test_auth_backoff_cannot_be_shorter_than_twenty_minutes(self):
        with self.assertRaises(ConfigError):
            build({"collector": {"auth_backoff_s": 60}})

    def test_secrets_are_required_for_sources_that_log_in(self):
        raw = {"sources": {"adblock": {"url": "http://192.0.2.1"}}}
        with self.assertRaises(ConfigError) as cm:
            build(raw, {"adguard": {"username": "kw"}})
        self.assertEqual(
            cm.exception.problems, ["secrets.json: adguard.password missing (for adblock)"]
        )
        c = build(raw, {"adguard": {"username": "kw", "password": "pw-example"}})
        self.assertEqual(c.secret("adblock")["username"], "kw")
        self.assertEqual(c.secret_values(), ["kw", "pw-example"])

    def test_secrets_are_not_checked_when_not_given(self):
        build({"sources": {"adblock": {"url": "http://192.0.2.1"}}}, None)

    def test_updates_needs_holders_with_valid_patterns(self):
        with self.assertRaises(ConfigError):
            build({"sources": {"updates": {}}})
        with self.assertRaises(ConfigError):
            build({"sources": {"updates": {"holders": [{"name": "x", "pattern": "("}]}}})

    def test_disks_need_mount_and_path(self):
        with self.assertRaises(ConfigError):
            build({"sources": {"host": {"disks": [{"mount": "/data"}]}}})


class LoadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _write(self, name, content):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return path

    def test_load_reads_both_files(self):
        cfg = self._write("config.toml", '[sources.streams]\nurl = "http://192.0.2.5:8181"\n')
        sec = self._write("secrets.json", json.dumps({"tautulli": {"api_key": "k-example"}}))
        c = load(cfg, sec)
        self.assertIn("streams", c.sources)

    def test_bad_secrets_json_does_not_echo_content(self):
        cfg = self._write("config.toml", "")
        sec = self._write("secrets.json", '{"adguard": {"password": "hunter2-example"')
        with self.assertRaises(ConfigError) as cm:
            load(cfg, sec)
        self.assertNotIn("hunter2", str(cm.exception))

    def test_missing_config_file(self):
        with self.assertRaises(ConfigError):
            load(os.path.join(self.tmp.name, "nope.toml"), None)

    def test_the_committed_example_is_valid(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        c = load(
            os.path.join(root, "config.example.toml"), os.path.join(root, "secrets.example.json")
        )
        self.assertEqual(len(c.sources), 13)


if __name__ == "__main__":
    unittest.main()
