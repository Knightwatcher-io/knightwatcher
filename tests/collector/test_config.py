import json
import os
import tempfile
import unittest

from collector.config import CONDITION_IDS, SOURCE_DEFAULTS, ConfigError, build, load


class BuildTest(unittest.TestCase):
    def test_defaults(self):
        c = build({})
        self.assertEqual(c.interval_s, 10)
        self.assertEqual(c.conditions["priority"], CONDITION_IDS)
        self.assertEqual(c.conditions["clear_after_s"], 30)
        self.assertEqual(c.conditions["cpu_hot"], {"pct": 85.0, "window_s": 30})
        self.assertEqual(c.conditions["memory_tight"], {"available_pct": 10.0, "window_s": 30})
        self.assertEqual(c.conditions["disk_full"]["pct"], 90.0)
        self.assertEqual(c.conditions["backup_overdue"]["hours"], 30.0)
        self.assertEqual(c.conditions["pi_silent"]["for_s"], 180)
        self.assertEqual(c.conditions["wan_down"]["failed_checks"], 2)
        self.assertEqual(c.conditions["container_unhealthy"]["for_s"], 180)
        self.assertEqual(c.conditions["attack"], {"window_s": 600, "jails": ["sshd"], "bans": 5})
        self.assertEqual(c.conditions["night"], {"start": "23:00", "end": "07:00"})
        self.assertEqual(c.conditions["ssh_session"], {"min_sessions": 1, "show_for_s": 600})
        self.assertEqual(c.collector["timezone"], "UTC")
        self.assertEqual(c.sources, {})

    def test_each_source_has_its_own_pace(self):
        paces = {name: d["every_s"] for name, d in SOURCE_DEFAULTS.items()}
        self.assertEqual(
            paces,
            {
                "host": 10,
                "ssh": 10,
                "updates": 10,
                "containers": 10,
                "backup": 60,
                "wan": 30,
                "dns": 30,
                "pi": 30,
                "streams": 30,
                "adblock": 30,
                "security": 30,
                "sonarr": 30,
                "radarr": 30,
            },
        )
        c = build({"sources": {"wan": {"every_s": 5}}})
        self.assertEqual(c.sources["wan"]["every_s"], 5)
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"wan": {"every_s": 0}}})
        self.assertEqual(cm.exception.problems, ["sources.wan.every_s: must be above zero"])

    def test_interval_is_at_least_five_seconds(self):
        c = build({"collector": {"interval_s": 5, "http_timeout_s": 4.0}})
        self.assertEqual(c.interval_s, 5)
        with self.assertRaises(ConfigError) as cm:
            build({"collector": {"interval_s": 4, "http_timeout_s": 2.0}})
        self.assertEqual(cm.exception.problems, ["collector.interval_s: must be at least 5"])

    def test_windows_are_at_least_ten_seconds(self):
        c = build({"conditions": {"cpu_hot": {"window_s": 10}, "memory_tight": {"window_s": 60}}})
        self.assertEqual(c.conditions["cpu_hot"]["window_s"], 10)
        with self.assertRaises(ConfigError) as cm:
            build({"conditions": {"cpu_hot": {"window_s": 9}, "memory_tight": {"window_s": 0}}})
        self.assertEqual(
            cm.exception.problems,
            [
                "conditions.cpu_hot.window_s: must be at least 10",
                "conditions.memory_tight.window_s: must be at least 10",
            ],
        )

    def test_clear_after_s_may_be_zero_but_not_negative(self):
        self.assertEqual(build({"conditions": {"clear_after_s": 0}}).conditions["clear_after_s"], 0)
        with self.assertRaises(ConfigError) as cm:
            build({"conditions": {"clear_after_s": -1}})
        self.assertEqual(
            cm.exception.problems, ["conditions.clear_after_s: must be zero or above zero"]
        )

    def test_removed_settings_name_their_replacements(self):
        with self.assertRaises(ConfigError) as cm:
            build(
                {
                    "conditions": {
                        "clear_after_polls": 1,
                        "cpu_hot": {"for_s": 300},
                        "memory_tight": {"for_s": 300},
                    }
                }
            )
        self.assertEqual(
            cm.exception.problems,
            [
                "conditions.clear_after_polls: removed; use clear_after_s, in seconds",
                "conditions.cpu_hot.for_s: removed; use window_s, the seconds the CPU is "
                "averaged over",
                "conditions.memory_tight.for_s: removed; use window_s, the seconds available "
                "memory is averaged over",
            ],
        )

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

    def test_ssh_show_for_s_may_be_zero_but_not_negative(self):
        c = build({"conditions": {"ssh_session": {"show_for_s": 0}}})
        self.assertEqual(c.conditions["ssh_session"]["show_for_s"], 0)
        with self.assertRaises(ConfigError) as cm:
            build({"conditions": {"ssh_session": {"show_for_s": -1}}})
        self.assertEqual(
            cm.exception.problems, ["conditions.ssh_session.show_for_s: must be zero or above zero"]
        )

    def test_session_and_stream_minimums_are_at_least_one(self):
        with self.assertRaises(ConfigError) as cm:
            build(
                {
                    "conditions": {
                        "ssh_session": {"min_sessions": 0},
                        "streaming": {"min_streams": 0},
                    }
                }
            )
        self.assertEqual(
            cm.exception.problems,
            [
                "conditions.ssh_session.min_sessions: must be at least 1",
                "conditions.streaming.min_streams: must be at least 1",
            ],
        )

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

    def test_adblock_fly_every_s(self):
        def adblock(**settings):
            return build({"sources": {"adblock": {"url": "http://192.0.2.1", **settings}}})

        self.assertEqual(adblock().sources["adblock"]["fly_every_s"], 300)
        self.assertEqual(adblock(fly_every_s=0).sources["adblock"]["fly_every_s"], 0)
        self.assertEqual(adblock(fly_every_s=90.5).sources["adblock"]["fly_every_s"], 90.5)
        with self.assertRaises(ConfigError) as cm:
            adblock(fly_every_s=-1)
        self.assertEqual(
            cm.exception.problems, ["sources.adblock.fly_every_s: must be zero or above zero"]
        )
        with self.assertRaises(ConfigError) as cm:
            adblock(fly_every_s="often")
        self.assertEqual(cm.exception.problems, ["sources.adblock.fly_every_s: expected float"])

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
