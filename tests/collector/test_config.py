import copy
import os
import re
import secrets
import tempfile
import tomllib
import unittest

from collector.config import (
    CONDITION_IDS,
    LOOK_CHOICES,
    PAGE_SCENES,
    SOURCE_DEFAULTS,
    ConfigError,
    build,
    load,
    read_env_file,
)


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

    def test_credentials_are_required_for_sources_that_log_in(self):
        raw = {"sources": {"adblock": {"url": "http://192.0.2.1"}}}
        password = secrets.token_urlsafe(16)
        with self.assertRaises(ConfigError) as cm:
            build(raw, {"KNIGHTWATCHER_ADGUARD_USERNAME": "kw"})
        self.assertEqual(
            cm.exception.problems, [".env: KNIGHTWATCHER_ADGUARD_PASSWORD missing (for adblock)"]
        )
        with self.assertRaises(ConfigError) as cm:
            build(
                raw, {"KNIGHTWATCHER_ADGUARD_USERNAME": "kw", "KNIGHTWATCHER_ADGUARD_PASSWORD": ""}
            )
        self.assertEqual(
            cm.exception.problems, [".env: KNIGHTWATCHER_ADGUARD_PASSWORD missing (for adblock)"]
        )
        env = {"KNIGHTWATCHER_ADGUARD_USERNAME": "kw", "KNIGHTWATCHER_ADGUARD_PASSWORD": password}
        c = build(raw, env)
        self.assertEqual(c.secret("adblock"), {"username": "kw", "password": password})
        self.assertEqual(c.secret_values(), ["kw", password])

    def test_each_source_names_its_variables_by_its_secret(self):
        raw = {"sources": {"sonarr": {"url": "http://192.0.2.30:8989", "secret": "sonarr_4k"}}}
        key = secrets.token_hex(16)
        with self.assertRaises(ConfigError) as cm:
            build(raw, {"KNIGHTWATCHER_SONARR_API_KEY": key})
        self.assertEqual(
            cm.exception.problems, [".env: KNIGHTWATCHER_SONARR_4K_API_KEY missing (for sonarr)"]
        )
        self.assertNotIn(key, str(cm.exception))
        c = build(raw, {"KNIGHTWATCHER_SONARR_4K_API_KEY": key})
        self.assertEqual(c.secret("sonarr"), {"api_key": key})
        with self.assertRaises(ConfigError) as cm:
            build({"sources": {"sonarr": {"url": "http://192.0.2.30:8989", "secret": "sonarr-4k"}}})
        self.assertEqual(
            cm.exception.problems, ["sources.sonarr.secret: use letters, digits and underscores"]
        )

    def test_unused_credentials_may_be_unset_and_are_still_scrubbed(self):
        key = secrets.token_hex(16)
        c = build({"sources": {"wan": {}}}, {"KNIGHTWATCHER_RADARR_API_KEY": key, "OTHER": "x"})
        self.assertEqual(c.secrets, {})
        self.assertEqual(c.secret_values(), [key])

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

    def test_credentials_are_not_checked_when_no_environment_is_given(self):
        build({"sources": {"adblock": {"url": "http://192.0.2.1"}}}, None)

    def test_updates_needs_holders_with_valid_patterns(self):
        with self.assertRaises(ConfigError):
            build({"sources": {"updates": {}}})
        with self.assertRaises(ConfigError):
            build({"sources": {"updates": {"holders": [{"name": "x", "pattern": "("}]}}})

    def test_disks_need_mount_and_path(self):
        with self.assertRaises(ConfigError):
            build({"sources": {"host": {"disks": [{"mount": "/data"}]}}})


def vault(**over):
    return {"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445, **over}


def problems(raw: dict) -> list[str]:
    try:
        build(raw)
    except ConfigError as exc:
        return exc.problems
    return []


PI = {"pi": {"host": "192.0.2.4"}}


class DeviceConfigTest(unittest.TestCase):
    """The [[device]] tables: defaults, the Pi of [sources.pi], and every message."""

    def assertProblems(self, raw, *expected):
        self.assertEqual(problems(raw), list(expected))

    def assertDevice(self, table, *expected):
        self.assertProblems({"device": [table]}, *expected)

    def test_defaults(self):
        c = build({"device": [vault()]})
        self.assertEqual(
            c.devices,
            [
                {
                    "name": "Vault",
                    "kind": "machine",
                    "host": "192.0.2.40",
                    "ports": [445],
                    "url": "",
                    "refused_counts": False,
                    "verify_tls": False,
                    "every_s": 30,
                    "down_after_s": 180,
                    "alert": True,
                    "enabled": True,
                    "source": "device:Vault",
                    "legacy": False,
                }
            ],
        )
        self.assertEqual(build({}).devices, [])

    def test_device_down_follows_pi_silent_in_the_default_priority(self):
        self.assertEqual(CONDITION_IDS[CONDITION_IDS.index("pi_silent") + 1], "device_down")
        self.assertEqual(build({}).conditions["device_down"], {})
        build({"conditions": {"device_down": {}}})
        self.assertProblems(
            {"conditions": {"device_down": {"for_s": 60}}},
            "conditions.device_down.for_s: unknown setting",
        )

    def test_the_pi_of_sources_pi_is_the_first_device(self):
        c = build(
            {
                "conditions": {"pi_silent": {"for_s": 120}},
                "sources": {"pi": {"host": "192.0.2.4", "ports": [22, 80], "every_s": 20}},
                "device": [vault(), vault(name="Gate cam", host="198.51.100.31", enabled=False)],
            }
        )
        self.assertEqual([t["name"] for t in c.devices], ["Pi", "Vault"])
        self.assertEqual(
            c.devices[0],
            {
                "name": "Pi",
                "kind": "pi",
                "host": "192.0.2.4",
                "ports": [22, 80],
                "url": "",
                "refused_counts": True,
                "verify_tls": False,
                "every_s": 20,
                "down_after_s": 120,
                "alert": True,
                "enabled": True,
                "source": "pi",
                "legacy": True,
            },
        )
        # Left out of the priority list, the Pi does not alert, and device_down is not needed.
        c = build({"conditions": {"priority": ["attack"]}, "sources": PI})
        self.assertFalse(c.devices[0]["alert"])
        # The legacy limits are not tightened.
        legacy = {"host": "192.0.2.4", "ports": [21, 22, 23, 80, 443], "every_s": 5}
        self.assertEqual(build({"sources": {"pi": legacy}}).devices[0]["ports"], legacy["ports"])
        self.assertEqual(build({"sources": {"pi": {**legacy, "enabled": False}}}).devices, [])

    def test_a_check_by_url_or_by_ports(self):
        cam = {"name": "Gate cam", "kind": "camera", "url": "https://198.51.100.31/"}
        nas = {k: v for k, v in vault(ports=[22, 22, 445]).items() if k != "port"}
        c = build({"device": [cam, nas]})
        self.assertEqual(
            (c.devices[0]["url"], c.devices[0]["host"], c.devices[0]["ports"]),
            ("https://198.51.100.31/", "", []),
        )
        self.assertEqual(c.devices[1]["ports"], [22, 445])

    def test_names(self):
        for name in ("V", "Gate cam", "Abcdefghijklmnopqrst", "a.b-c_d (2)", "~!"):
            self.assertProblems({"device": [vault(name=name)]})
        bad = "device[0].name: 1 to 20 printable ASCII characters, no space at either end"
        for name in ("", " Vault", "Vault ", "Abcdefghijklmnopqrstu", "Väult", "Tab\tbed", 7):
            self.assertDevice(vault(name=name), bad)
        self.assertDevice(
            {k: v for k, v in vault().items() if k != "name"}, "device[0].name: required"
        )

    def test_a_name_twice_ignoring_case(self):
        self.assertProblems(
            {
                "device": [
                    vault(),
                    vault(name="Gate cam", host="198.51.100.31"),
                    vault(name="vault", host="192.0.2.41"),
                ]
            },
            'device[2].name: "vault" is already the name of device[0]',
        )

    def test_the_pis_name_and_host_are_taken(self):
        self.assertProblems(
            {"sources": PI, "device": [vault(name="pi"), vault(name="Nas", host="192.0.2.4")]},
            'device[0].name: "pi" is taken by [sources.pi]',
            "device[1].host: 192.0.2.4 is already watched by [sources.pi]; remove one",
        )
        self.assertProblems(
            {
                "sources": PI,
                "device": [{"name": "Pi web", "kind": "pi", "url": "http://192.0.2.4/"}],
            },
            "device[0].url: 192.0.2.4 is already watched by [sources.pi]; remove one",
        )
        # Without [sources.pi], a device may be the Pi.
        c = build({"device": [{"name": "Pi", "kind": "pi", "host": "192.0.2.4", "ports": [22]}]})
        self.assertEqual(c.devices[0]["source"], "device:Pi")

    def test_kinds(self):
        for kind in ("pi", "camera", "machine", "vm"):
            self.assertDevice(vault(kind=kind))
        self.assertDevice(
            vault(kind="camrea"),
            'device[0].kind: unknown kind "camrea"; use pi, camera, machine or vm',
        )
        self.assertDevice(
            vault(kind="Camera"),
            'device[0].kind: unknown kind "Camera"; use pi, camera, machine or vm',
        )
        self.assertDevice(
            vault(kind="base/owl"), "device[0].kind: kinds from packs are not supported yet"
        )
        self.assertDevice(
            {k: v for k, v in vault().items() if k != "kind"}, "device[0].kind: required"
        )

    def test_one_check_and_not_two(self):
        neither = "device[0]: give host with port or ports, or url, and not both"
        self.assertDevice({"name": "Vault", "kind": "machine"}, neither)
        self.assertDevice(vault(url="http://192.0.2.40/"), neither)
        self.assertDevice({"name": "Vault", "kind": "machine", "host": "192.0.2.40"}, neither)
        self.assertDevice(
            {"name": "Vault", "kind": "machine", "port": 445},
            "device[0].host: required with port or ports",
        )
        self.assertDevice(vault(ports=[445]), "device[0]: give port or ports, not both")

    def test_ports(self):
        for port in (0, 65536, "22", True, 22.0):
            self.assertDevice(
                vault(port=port), "device[0].port: must be a port number from 1 to 65535"
            )
        for ports in ([], [1, 2, 3, 4], [0], [22, "80"], 22):
            table = {k: v for k, v in vault(ports=ports).items() if k != "port"}
            self.assertDevice(table, "device[0].ports: 1 to 3 port numbers from 1 to 65535")
        self.assertDevice(vault(host="", port=22), "device[0].host: must be an address or a name")

    def test_urls(self):
        def cam(url, **over):
            return {"name": "Gate cam", "kind": "camera", "url": url, **over}

        for url in (
            "http://198.51.100.31",
            "https://cam.example.com:8443/login?x=1",
            "http://[2001:db8::31]:8080/",
        ):
            self.assertDevice(cam(url))
        for url in ("ftp://198.51.100.31/", "198.51.100.31", "HTTPS://198.51.100.31/", 80):
            self.assertDevice(cam(url), "device[0].url: must start with http:// or https://")
        for url in (
            "https://",
            "http://cam era/",
            "http://198.51.100.31:99999/",
            "http://kamera.example/ä",
        ):
            self.assertDevice(cam(url), "device[0].url: not a valid web address")
        for url in ("https://admin:pw@198.51.100.31/", "https://admin@198.51.100.31/"):
            self.assertDevice(cam(url), "device[0].url: must not carry a user name or password")

    def test_options_out_of_place(self):
        cam = {"name": "Gate cam", "kind": "camera", "url": "https://198.51.100.31/"}
        self.assertDevice(cam | {"verify_tls": True})
        self.assertDevice(vault(refused_counts=True))
        self.assertDevice(
            cam | {"refused_counts": False}, "device[0].refused_counts: only applies with host"
        )
        self.assertDevice(
            vault(verify_tls=True), "device[0].verify_tls: only applies with an https url"
        )
        self.assertDevice(
            cam | {"url": "http://198.51.100.31/", "verify_tls": False},
            "device[0].verify_tls: only applies with an https url",
        )
        self.assertDevice(vault(alert="yes"), "device[0].alert: expected bool")

    def test_pace_and_silence(self):
        self.assertDevice(vault(every_s=10, down_after_s=10))
        self.assertDevice(vault(every_s=3600, down_after_s=86400))
        for every in (9, 3601, "30", 30.5):
            self.assertIn(
                "device[0].every_s: must be from 10 to 3600",
                problems({"device": [vault(every_s=every)]}),
            )
        self.assertDevice(
            vault(every_s=60, down_after_s=30),
            "device[0].down_after_s: must be at least every_s (60) and at most 86400",
        )
        self.assertDevice(
            vault(down_after_s=86401),
            "device[0].down_after_s: must be at least every_s (30) and at most 86400",
        )

    def test_at_most_thirty_two_devices(self):
        def many(n, **over):
            return [vault(name=f"Box {i}", host=f"192.0.2.{100 + i}", **over) for i in range(n)]

        self.assertEqual(len(build({"device": many(32)}).devices), 32)
        self.assertEqual(len(build({"device": many(31), "sources": PI}).devices), 32)
        # A device that is not enabled does not count.
        spare = vault(name="Spare", host="192.0.2.99", enabled=False)
        self.assertEqual(len(build({"device": [*many(32), spare]}).devices), 32)
        self.assertProblems({"device": many(33)}, "device: at most 32 devices")
        self.assertProblems({"device": many(32), "sources": PI}, "device: at most 32 devices")

    def test_a_typo_and_tables_that_are_not_tables(self):
        self.assertDevice(vault(prot=445), "device[0].prot: unknown setting")
        self.assertProblems({"device": ["Vault"]}, "device[0]: expected a table")
        self.assertProblems({"device": "Vault"}, "device: expected [[device]] tables")
        self.assertProblems({"device": vault()}, "device: expected [[device]] tables")

    def test_every_problem_is_listed(self):
        self.assertDevice(
            {"name": " x", "kind": "owl", "port": 0, "every_s": 5},
            "device[0].name: 1 to 20 printable ASCII characters, no space at either end",
            'device[0].kind: unknown kind "owl"; use pi, camera, machine or vm',
            "device[0].every_s: must be from 10 to 3600",
            "device[0].port: must be a port number from 1 to 65535",
            "device[0].host: required with port or ports",
        )

    def test_a_priority_list_without_device_down(self):
        cam = {"name": "Gate cam", "kind": "camera", "url": "https://198.51.100.31/"}
        laptop = vault(name="Study laptop", host="203.0.113.45", alert=False)
        listed = [c for c in CONDITION_IDS if c != "device_down"]
        self.assertProblems(
            {"conditions": {"priority": listed}, "device": [vault(), cam, laptop]},
            'conditions.priority: leaves out "device_down", so Vault and Gate cam would never '
            'alert; add it after "pi_silent", or set alert = false on them',
        )
        self.assertProblems(
            {"conditions": {"priority": ["night", "attack"]}, "device": [vault()]},
            'conditions.priority: leaves out "device_down", so Vault would never alert; add it '
            'after "attack", or set alert = false on it',
        )
        self.assertProblems(
            {
                "conditions": {"priority": ["night"]},
                "device": [vault(), cam, vault(name="Buildbox", host="192.0.2.50")],
            },
            'conditions.priority: leaves out "device_down", so Vault, Gate cam and Buildbox would '
            'never alert; add it before "night", or set alert = false on them',
        )
        self.assertProblems(
            {"conditions": {"priority": []}, "device": [vault()]},
            'conditions.priority: leaves out "device_down", so Vault would never alert; add it to '
            "the list, or set alert = false on it",
        )
        # Nothing alerts: nothing is refused. Neither is a Pi from [sources.pi] alone.
        self.assertProblems({"conditions": {"priority": listed}, "device": [laptop]})
        self.assertProblems({"conditions": {"priority": listed}, "device": [vault(enabled=False)]})
        self.assertProblems({"conditions": {"priority": listed}, "sources": PI})


FULL_LOOK = {
    "build": "b",
    "weapon": "sword_and_shield",
    "skin": "tan",
    "hair": "auburn",
    "hair_style": "curls",
    "tabard": "teal",
    "plume": "gold",
    "shield": "kite",
    "helmet": "bascinet",
    "plume_style": "horsehair",
    "body": "gambeson",
    "shoulders": "leather",
    "arms": "padded",
    "hands": "mail",
    "legs": "hose",
    "feet": "shoes",
    "back": "cloak",
    "monarch": "c",
    "monarch_skin": "deep",
    "monarch_hair": "silver",
    "monarch_robe": "wine",
}
EMPTY = {"look": {}, "display": {}, "quiet": {}, "scenes": {}}
QUIET_ALLOWED = 'use battlement, camp, house or yard, or a long name, "<pack>/<id>"'
SCENES_ALLOWED = (
    'use battlement, camp, house, yard, cellar, smithy or court, or a long name, "<pack>/<id>"'
)


class DefaultsConfigTest(unittest.TestCase):
    """The [look], [display], [quiet] and [scenes] tables: the settings screen's household
    defaults."""

    def assertProblems(self, raw, *expected):
        self.assertEqual(problems(raw), list(expected))

    def test_absent_tables_set_nothing(self):
        self.assertEqual(build({}).defaults, EMPTY)
        self.assertEqual(build(copy.deepcopy(EMPTY)).defaults, EMPTY)

    def test_only_the_keys_set_are_kept(self):
        c = build({"look": {"skin": "deep"}, "quiet": {"minutes": 3}})
        self.assertEqual(
            c.defaults,
            {"look": {"skin": "deep"}, "display": {}, "quiet": {"minutes": 3}, "scenes": {}},
        )
        c = build({"scenes": {"cpu_hot": "camp"}})
        self.assertEqual(c.defaults, {**EMPTY, "scenes": {"cpu_hot": "camp"}})

    def test_a_full_look(self):
        self.assertEqual(build({"look": FULL_LOOK}).defaults["look"], FULL_LOOK)
        for key, allowed in LOOK_CHOICES.items():
            for value in allowed:
                self.assertEqual(build({"look": {key: value}}).defaults["look"], {key: value})

    def test_a_full_display(self):
        for display in (
            {"headline": "small", "clock": 12, "helmet_indoors": True},
            {"headline": "medium", "clock": 24, "helmet_indoors": False},
            {"headline": "large"},
        ):
            self.assertEqual(build({"display": display}).defaults["display"], display)

    def test_a_full_quiet(self):
        quiet = {"scenes": ["battlement", "camp", "house", "yard"], "minutes": 10}
        self.assertEqual(build({"quiet": quiet}).defaults["quiet"], quiet)
        # One scene is enough, the order is kept, and the bounds are allowed.
        for quiet in (
            {"scenes": ["yard"], "minutes": 1},
            {"scenes": ["house", "battlement"], "minutes": 240},
        ):
            self.assertEqual(build({"quiet": quiet}).defaults["quiet"], quiet)

    def test_each_bad_look_value(self):
        self.assertProblems(
            {"look": {"build": "d", "weapon": "axe", "skin": "pale", "hair": "green"}},
            'look.build: unknown value "d"; use a, b or c',
            'look.weapon: unknown value "axe"; use greatsword, sword_and_shield, longsword or '
            "mace_and_shield",
            'look.skin: unknown value "pale"; use fair, warm, golden, tan, brown or deep',
            'look.hair: unknown value "green"; use black, dark, brown, auburn, blonde or silver',
        )
        self.assertProblems(
            {"look": {"hair_style": "bald", "tabard": "red", "plume": "blue"}},
            'look.hair_style: unknown value "bald"; use short, tied, curls, long or close',
            'look.tabard: unknown value "red"; use blue, forest, violet, wine, teal or sable',
            'look.plume: unknown value "blue"; use red, white, gold, royal, green or violet',
        )
        self.assertProblems(
            {
                "look": {
                    "shield": "buckler",
                    "helmet": "great",
                    "plume_style": "twin",
                    "back": "wings",
                }
            },
            'look.shield: unknown value "buckler"; use heater, round or kite',
            'look.helmet: unknown value "great"; use open, kettle, coif or bascinet',
            'look.plume_style: unknown value "twin"; use crest, feather or horsehair',
            'look.back: unknown value "wings"; use none, cloak or cape',
        )
        self.assertProblems(
            {
                "look": {
                    "body": "surcoat",
                    "shoulders": "mail",
                    "arms": "leather",
                    "hands": "plates",
                }
            },
            'look.body: unknown value "surcoat"; use tabard, cuirass or gambeson',
            'look.shoulders: unknown value "mail"; use plate, lames or leather',
            'look.arms: unknown value "leather"; use plate, mail or padded',
            'look.hands: unknown value "plates"; use plate, leather or mail',
        )
        self.assertProblems(
            {"look": {"legs": "greaves", "feet": "boots"}},
            'look.legs: unknown value "greaves"; use plate, mail or hose',
            'look.feet: unknown value "boots"; use leather, sabatons or shoes',
        )
        self.assertProblems(
            {"look": {"monarch": "A", "monarch_skin": "Warm"}},
            'look.monarch: unknown value "A"; use a, b or c, or a long name, "<pack>/<id>"',
            'look.monarch_skin: unknown value "Warm"; use fair, warm, golden, tan, brown or deep',
        )
        self.assertProblems(
            {"look": {"monarch_hair": "drawn", "monarch_robe": "red"}},
            'look.monarch_hair: unknown value "drawn"; use black, dark, brown, auburn, blonde or '
            "silver",
            'look.monarch_robe: unknown value "red"; use blue, forest, violet, wine, teal or sable',
        )
        # "As drawn" is the key left out, never a value.
        self.assertProblems(
            {"look": {"monarch_hair": ""}},
            'look.monarch_hair: unknown value ""; use black, dark, brown, auburn, blonde or silver',
        )
        self.assertProblems(
            {"look": {"build": 1, "skin": ["warm"]}},
            "look.build: expected text; use a, b or c",
            "look.skin: expected text; use fair, warm, golden, tan, brown or deep",
        )

    def test_each_bad_display_value(self):
        self.assertProblems(
            {"display": {"headline": "huge", "clock": 13, "helmet_indoors": 1}},
            'display.headline: unknown value "huge"; use small, medium or large',
            "display.clock: must be 24 or 12",
            "display.helmet_indoors: expected true or false",
        )
        self.assertProblems({"display": {"clock": "12"}}, "display.clock: must be 24 or 12")
        self.assertProblems({"display": {"clock": True}}, "display.clock: must be 24 or 12")
        self.assertProblems({"display": {"clock": 12.0}}, "display.clock: must be 24 or 12")

    def test_a_boolean_given_as_text(self):
        for text in ("false", "true", "no"):
            self.assertProblems(
                {"display": {"helmet_indoors": text}},
                "display.helmet_indoors: expected true or false",
            )

    def test_quiet_scenes(self):
        listed = "list one or more of battlement, camp, house or yard, or long names"
        self.assertProblems({"quiet": {"scenes": []}}, f"quiet.scenes: {listed}")
        self.assertProblems({"quiet": {"scenes": "camp"}}, f"quiet.scenes: {listed}")
        self.assertProblems(
            {"quiet": {"scenes": ["camp", "yard", "camp"]}}, 'quiet.scenes: "camp" listed twice'
        )
        self.assertProblems(
            {"quiet": {"scenes": ["court", "camp", 3]}},
            f'quiet.scenes: unknown scene "court"; {QUIET_ALLOWED}',
            f"quiet.scenes: unknown scene 3; {QUIET_ALLOWED}",
        )
        self.assertEqual(
            problems({"quiet": {"scenes": ["court"], "minutes": 5}}),
            [f'quiet.scenes: unknown scene "court"; {QUIET_ALLOWED}'],
        )
        # A long name is checked for its form alone, and is listed once like a short one.
        scenes = ["kw.cyber/scene.roof", "camp", "kw.medieval/house"]
        self.assertEqual(build({"quiet": {"scenes": scenes}}).defaults["quiet"], {"scenes": scenes})
        self.assertProblems(
            {"quiet": {"scenes": ["kw.cyber/roof", "kw.cyber/roof", "Kw/x", "kw.cyber/"]}},
            'quiet.scenes: "kw.cyber/roof" listed twice',
            f'quiet.scenes: unknown scene "Kw/x"; {QUIET_ALLOWED}',
            f'quiet.scenes: unknown scene "kw.cyber/"; {QUIET_ALLOWED}',
        )

    def test_scenes(self):
        # Every condition the collector knows, in every scene the page draws, is accepted: the
        # page decides which scene can act which condition, and ignores the rest.
        for cid in CONDITION_IDS:
            for scene in PAGE_SCENES:
                self.assertEqual(
                    build({"scenes": {cid: scene}}).defaults["scenes"], {cid: scene}, cid
                )
        full = {"attack": "camp", "disk_full": "yard", "pi_silent": "battlement", "night": "camp"}
        self.assertEqual(build({"scenes": full}).defaults["scenes"], full)
        # A long name, checked for its form alone.
        long = {"cpu_hot": "kw.cyber/scene.lab", "attack": "kw.medieval/camp"}
        self.assertEqual(build({"scenes": long}).defaults["scenes"], long)

    def test_each_bad_scenes_entry(self):
        self.assertProblems(
            {"scenes": {"cpu": "camp", "cpu_hot": "moon", "attack": "Camp"}},
            "scenes.cpu: unknown condition",
            f'scenes.attack: unknown value "Camp"; {SCENES_ALLOWED}',
            f'scenes.cpu_hot: unknown value "moon"; {SCENES_ALLOWED}',
        )
        self.assertProblems(
            {"scenes": {"cpu_hot": ["camp"], "night": 1}},
            f"scenes.cpu_hot: expected text; {SCENES_ALLOWED}",
            f"scenes.night: expected text; {SCENES_ALLOWED}",
        )
        self.assertProblems({"scenes": "camp"}, "scenes: expected a table")
        # A bad entry is not kept beside a good one: the load fails whole.
        with self.assertRaises(ConfigError):
            build({"scenes": {"cpu_hot": "camp", "attack": "moon"}})

    def test_quiet_minutes(self):
        bad = "quiet.minutes: must be a whole number from 1 to 240"
        for minutes in (0, -5, 241, 10.0, 2.5, "10", True):
            self.assertProblems({"quiet": {"minutes": minutes}}, bad)

    def test_a_bad_value_is_not_kept_beside_good_ones(self):
        # The load fails, so nothing is written; the check still names every problem at once.
        self.assertProblems(
            {"look": {"skin": "warm", "plume": "pink"}, "quiet": {"scenes": [], "minutes": 5}},
            'look.plume: unknown value "pink"; use red, white, gold, royal, green or violet',
            "quiet.scenes: list one or more of battlement, camp, house or yard, or long names",
        )

    def test_the_world_and_its_parts(self):
        # The short names are a closed list; a long name is checked for its form alone, since the
        # collector knows nothing of packs.
        look = {
            "world": "medieval",
            "monarch": "kw.medieval/patron.b",
            "foe": "goblin",
            "critter": "kw.cyber/critter.bug",
            "props": "medieval",
            "overlay": "kw.cyber/overlay.neon",
            "words": "kw.cyber-2.x/words.neon-3",
        }
        self.assertEqual(build({"look": look}).defaults["look"], look)
        self.assertEqual(
            build({"look": {"world": "kw.cyber/world.neon", "tabard": "blue"}}).defaults["look"],
            {"world": "kw.cyber/world.neon", "tabard": "blue"},
        )
        long = 'or a long name, "<pack>/<id>"'
        self.assertProblems(
            {"look": {"world": "neon", "foe": "troll", "critter": 3, "props": "Medieval"}},
            f'look.world: unknown value "neon"; use medieval, {long}',
            f'look.foe: unknown value "troll"; use goblin, {long}',
            f"look.critter: expected text; use fly, {long}",
            f'look.props: unknown value "Medieval"; use medieval, {long}',
        )
        # the form: a pack id of two to 32 characters and up to three dotted parts, a slash, and
        # an id starting with a letter, of up to 48 characters
        bad = ("k/x", "kw.cyber/", "/world", "kw.cyber/World", "kw.a.b.c.d/x", "kw/x/y")
        for name in (*bad, "kw/" + "x" * 49):
            self.assertProblems(
                {"look": {"overlay": name}},
                f'look.overlay: unknown value "{name}"; use medieval, {long}',
            )
        for good in ("kw/x", "kw.a.b.c/x", "kw/" + "x" * 48, "kw-1.x2/a.b-c"):
            self.assertEqual(build({"look": {"overlay": good}}).defaults["look"], {"overlay": good})

    def test_the_items_and_devices_tables(self):
        items = {"main": "kw.base/main.arming", "helmet": "kw.cyber/helm.visor"}
        devices = {"pi": "medieval", "camera": "kw.cyber/props.neon"}
        c = build({"look": {"items": items, "devices": devices}})
        self.assertEqual(c.defaults["look"], {"items": items, "devices": devices})
        # [look.items] and [look.devices] in config.toml are these tables
        raw = tomllib.loads(
            '[look]\nworld = "medieval"\n[look.items]\nmain = "kw.base/main.arming"\n'
            '[look.devices]\ncamera = "medieval"\n'
        )
        self.assertEqual(
            build(raw).defaults["look"],
            {
                "world": "medieval",
                "items": {"main": "kw.base/main.arming"},
                "devices": {"camera": "medieval"},
            },
        )
        long = 'or a long name, "<pack>/<id>"'
        self.assertProblems(
            {
                "look": {
                    "items": {"main": "arming", "head": "kw.base/head.a", "off": 1},
                    "devices": "medieval",
                }
            },
            "look.items.head: unknown key; use main, off, helmet, plume, hair, torso, pauldrons, "
            "arms, gauntlets, legs, boots or back",
            'look.items.main: unknown value "arming"; use a long name, "<pack>/<id>"',
            'look.items.off: expected text; use a long name, "<pack>/<id>"',
            "look.devices: expected a table",
        )
        self.assertProblems(
            {"look": {"devices": {"tv": "medieval", "vm": "neon"}}},
            "look.devices.tv: unknown key; use pi, camera, machine, vm or box",
            f'look.devices.vm: unknown value "neon"; use medieval, {long}',
        )

    def test_an_unknown_key_and_tables_that_are_not_tables(self):
        self.assertProblems({"look": {"colour": "blue"}}, "look.colour: unknown setting")
        self.assertProblems({"display": {"clock_24": True}}, "display.clock_24: unknown setting")
        self.assertProblems(
            {"quiet": {"scene": ["camp"], "minutes": 5}}, "quiet.scene: unknown setting"
        )
        self.assertProblems({"look": "warm"}, "look: expected a table")
        self.assertProblems({"display": []}, "display: expected a table")
        self.assertProblems({"quiet": 10}, "quiet: expected a table")
        self.assertProblems({"settings": {}}, "settings: unknown table")


class LoadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _write(self, name, content):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return path

    def test_load_reads_the_config_and_the_credentials(self):
        cfg = self._write("config.toml", '[sources.streams]\nurl = "http://192.0.2.5:8181"\n')
        key = secrets.token_hex(16)
        c = load(cfg, {"KNIGHTWATCHER_TAUTULLI_API_KEY": key})
        self.assertIn("streams", c.sources)
        self.assertEqual(c.secret("streams"), {"api_key": key})

    def test_an_env_file_is_read_as_compose_reads_it(self):
        a, b, c, d = (secrets.token_urlsafe(12) for _ in range(4))
        path = self._write(
            ".env",
            "# a comment\n"
            "\n"
            f"PLAIN={a}\n"
            f"SPACED = {b}   # a note after a space\n"
            f"export EXPORTED={c}\n"
            f"SINGLE='{d} $HOME #not a note'\n"
            'DOUBLE="a \\"quoted\\" word\\n"\n'
            "HASH=x#y\n"
            "EMPTY=\n"
            "TWICE=first\n"
            "TWICE=second\n",
        )
        self.assertEqual(
            read_env_file(path),
            {
                "PLAIN": a,
                "SPACED": b,
                "EXPORTED": c,
                "SINGLE": f"{d} $HOME #not a note",
                "DOUBLE": 'a "quoted" word\n',
                "HASH": "x#y",
                "EMPTY": "",
                "TWICE": "second",
            },
        )

    def test_a_bad_env_file_names_the_line_and_never_its_content(self):
        value = secrets.token_urlsafe(16)
        path = self._write(
            ".env",
            f"GOOD={value}\n{value}\n1BAD={value}\nOPEN='{value}\nOPEN2=\"{value}\n",
        )
        with self.assertRaises(ConfigError) as cm:
            read_env_file(path)
        self.assertEqual(
            cm.exception.problems,
            [
                f"{path}: line 2: expected NAME=value",
                f"{path}: line 3: expected NAME=value",
                f"{path}: line 4: a quote is not closed",
                f"{path}: line 5: a quote is not closed",
            ],
        )
        self.assertNotIn(value, str(cm.exception))
        with self.assertRaises(ConfigError) as cm:
            read_env_file(os.path.join(self.tmp.name, "absent.env"))
        self.assertIn("cannot read", str(cm.exception))

    def test_missing_config_file(self):
        with self.assertRaises(ConfigError):
            load(os.path.join(self.tmp.name, "nope.toml"), None)

    def test_the_committed_example_is_valid(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        env = read_env_file(os.path.join(root, ".env.example"))
        c = load(os.path.join(root, "config.example.toml"), env)
        self.assertEqual(len(c.sources), 13)
        # The examples of devices are commented out, so the Pi is the only device.
        self.assertEqual([t["name"] for t in c.devices], ["Pi"])
        self.assertIn("device_down", c.conditions["priority"])
        # So are the settings screen's defaults, so the file sets none of them.
        self.assertEqual(c.defaults, EMPTY)

    def test_the_example_tables_load_once_uncommented(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        with open(os.path.join(root, "config.example.toml"), encoding="utf-8") as fh:
            example = fh.read()
        # A commented setting is "# key = value", "# [[device]]" or the header of a defaults
        # table; a commented note is not.
        setting = re.compile(
            r"^# (\[\[device\]\]|\[(?:look|look\.items|look\.devices|display|quiet|scenes)\]"
            r"|[a-z_]+ = .+)$"
        )
        lines = [
            m.group(1) if (m := setting.match(line)) else line for line in example.splitlines()
        ]
        cfg = self._write("config.toml", "\n".join(lines) + "\n")
        c = load(cfg, read_env_file(os.path.join(root, ".env.example")))
        self.assertEqual(
            [t["name"] for t in c.devices], ["Pi", "Vault", "Gate cam", "Study laptop"]
        )
        self.assertEqual(
            [(t["kind"], t["every_s"], t["down_after_s"], t["alert"]) for t in c.devices[1:]],
            [("machine", 30, 180, True), ("camera", 60, 600, True), ("machine", 30, 180, False)],
        )
        self.assertTrue(c.devices[3]["refused_counts"])
        self.assertEqual(
            c.defaults,
            {
                "look": {
                    "world": "medieval",
                    "build": "a",
                    "weapon": "greatsword",
                    "skin": "warm",
                    "hair": "brown",
                    "hair_style": "short",
                    "tabard": "blue",
                    "plume": "red",
                    "shield": "heater",
                    "helmet": "open",
                    "plume_style": "crest",
                    "body": "tabard",
                    "shoulders": "plate",
                    "arms": "plate",
                    "hands": "plate",
                    "legs": "plate",
                    "feet": "leather",
                    "back": "none",
                    "monarch": "a",
                    "monarch_skin": "warm",
                    "monarch_hair": "brown",
                    "monarch_robe": "wine",
                    "foe": "goblin",
                    "critter": "fly",
                    "props": "medieval",
                    "overlay": "medieval",
                    "words": "medieval",
                    "items": {"main": "kw.base/main.arming"},
                    "devices": {"camera": "medieval"},
                },
                "display": {"headline": "medium", "clock": 24, "helmet_indoors": False},
                "quiet": {"scenes": ["battlement", "camp", "house", "yard"], "minutes": 10},
                "scenes": {
                    "attack": "battlement",
                    "disk_full": "cellar",
                    "backup_overdue": "house",
                    "pi_silent": "house",
                    "cpu_hot": "yard",
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
