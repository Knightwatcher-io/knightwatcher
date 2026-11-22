"""The fail2ban adapter, against databases made with fail2ban's own CREATE TABLE statements, and
[sources.security] read through it: the configuration, the state file, the attack and the events.

The statements are those of fail2ban's database version 4 (fail2ban/server/database.py), the
version of every release from 0.11.2 to 1.1. Every address here is a documentation address.
"""

import contextlib
import datetime as dt
import io
import json
import os
import sqlite3
import tempfile
import unittest
from unittest import mock

from collector import config as config_mod
from collector.cli import main
from collector.config import ConfigError
from collector.net import SourceError
from collector.providers import fail2ban
from collector.runner import Runner
from collector.sources import KindSource, build_sources
from collector.store import Memory
from kw_helpers import Clock, at, make_config

# fail2ban's schema, version 4, as fail2ban writes it.
SCHEMA = """
CREATE TABLE IF NOT EXISTS fail2banDb(version INTEGER);
CREATE TABLE IF NOT EXISTS jails(name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS jails_name ON jails(name);
CREATE TABLE IF NOT EXISTS logs(jail TEXT NOT NULL, path TEXT, firstlinemd5 TEXT,
  lastfilepos INTEGER DEFAULT 0, FOREIGN KEY(jail) REFERENCES jails(name) ON DELETE CASCADE,
  UNIQUE(jail, path),UNIQUE(jail, path, firstlinemd5));
CREATE INDEX IF NOT EXISTS logs_path ON logs(path);
CREATE INDEX IF NOT EXISTS logs_jail_path ON logs(jail, path);
CREATE TABLE IF NOT EXISTS bans(jail TEXT NOT NULL, ip TEXT, timeofban INTEGER NOT NULL,
  bantime INTEGER NOT NULL, bancount INTEGER NOT NULL default 1, data JSON,
  FOREIGN KEY(jail) REFERENCES jails(name) );
CREATE INDEX IF NOT EXISTS bans_jail_timeofban_ip ON bans(jail, timeofban);
CREATE INDEX IF NOT EXISTS bans_jail_ip ON bans(jail, ip);
CREATE INDEX IF NOT EXISTS bans_ip ON bans(ip);
CREATE TABLE IF NOT EXISTS bips(ip TEXT NOT NULL, jail TEXT NOT NULL, timeofban INTEGER NOT NULL,
  bantime INTEGER NOT NULL, bancount INTEGER NOT NULL default 1, data JSON,
  PRIMARY KEY(ip, jail), FOREIGN KEY(jail) REFERENCES jails(name) );
CREATE INDEX IF NOT EXISTS bips_timeofban ON bips(timeofban);
CREATE INDEX IF NOT EXISTS bips_ip ON bips(ip);
INSERT INTO fail2banDb(version) VALUES(4);
"""

JAILS = ("sshd", "recidive", "nginx-botsearch")


def epoch(seconds: float) -> int:
    """The epoch seconds of T0 plus seconds, as fail2ban writes timeofban."""
    return int(at(seconds).timestamp())


class Db:
    """A fail2ban database in a folder of its own, written as fail2ban writes it."""

    def __init__(self, folder: str, name: str = "fail2ban.sqlite3"):
        self.path = os.path.join(folder, name)
        self.make()

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path)
        db.execute("PRAGMA journal_mode = MEMORY")
        return db

    def make(self) -> None:
        with contextlib.closing(self.connect()) as db:
            db.executescript(SCHEMA)
            db.executemany("INSERT INTO jails(name) VALUES(?)", [(j,) for j in JAILS])
            db.commit()

    def ban(self, ip, seconds, jail="sshd") -> None:
        with contextlib.closing(self.connect()) as db:
            db.execute(
                "INSERT INTO bans(jail, ip, timeofban, bantime, bancount, data) "
                "VALUES(?, ?, ?, 600, 1, '{}')",
                (jail, ip, epoch(seconds)),
            )
            db.commit()

    def unban(self, ip, jail="sshd") -> None:
        with contextlib.closing(self.connect()) as db:
            db.execute("DELETE FROM bans WHERE jail = ? AND ip = ?", (jail, ip))
            db.commit()


class AdapterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = os.path.join(self.tmp.name, "fail2ban")
        os.mkdir(self.folder)
        self.db = Db(self.folder)
        self.config = make_config({})
        self.provider = fail2ban.Fail2banProvider(
            {"database": self.db.path}, {}, 5.0, frozenset(), lambda: self.config
        )

    def read(self, now=None):
        return self.provider.read(now or at(0))

    def test_the_bans_of_the_last_day_newest_last(self):
        self.db.ban("203.0.113.5", -86_401, jail="recidive")
        self.db.ban("203.0.113.6", -86_400, jail="recidive")
        self.db.ban("203.0.113.77", -30)
        self.db.ban("198.51.100.9", -40, jail="nginx-botsearch")  # written late, an older time
        self.assertEqual(
            self.read(),
            {"bans": [
                {"ip": "203.0.113.6", "at": at(-86_400), "jail": "recidive"},
                {"ip": "198.51.100.9", "at": at(-40), "jail": "nginx-botsearch"},
                {"ip": "203.0.113.77", "at": at(-30), "jail": "sshd"},
            ]},
        )  # fmt: skip

    def test_rows_of_one_second_keep_the_order_they_were_written_in(self):
        for ip in ("192.0.2.3", "192.0.2.1", "192.0.2.2"):
            self.db.ban(ip, -5)
        self.assertEqual(
            [b["ip"] for b in self.read()["bans"]], ["192.0.2.3", "192.0.2.1", "192.0.2.2"]
        )

    def test_a_longer_attack_window_reads_further_back(self):
        self.db.ban("203.0.113.5", -100_000, jail="recidive")
        self.assertEqual(self.read()["bans"], [])
        self.config = make_config({"conditions": {"attack": {"window_s": 172_800}}})
        self.assertEqual([b["ip"] for b in self.read()["bans"]], ["203.0.113.5"])

    def test_an_unban_takes_the_rows_away(self):
        self.db.ban("203.0.113.77", -30)
        self.db.ban("203.0.113.78", -20)
        self.db.unban("203.0.113.77")
        self.assertEqual([b["ip"] for b in self.read()["bans"]], ["203.0.113.78"])

    def test_an_empty_table(self):
        self.assertEqual(self.read(), {"bans": []})

    def test_rows_without_an_address_are_left_out(self):
        with contextlib.closing(self.db.connect()) as db:
            db.execute("INSERT INTO bans VALUES('sshd', NULL, ?, 600, 1, NULL)", (epoch(-5),))
            db.execute("INSERT INTO bans VALUES('sshd', '', ?, 600, 1, NULL)", (epoch(-4),))
            db.execute("INSERT INTO bans VALUES('sshd', '192.0.2.8', 'soon', 600, 1, NULL)")
            db.commit()
        self.db.ban("192.0.2.9", -3)
        self.assertEqual([b["ip"] for b in self.read()["bans"]], ["192.0.2.9"])

    def test_the_list_is_cut_at_its_limit_keeping_the_newest(self):
        with contextlib.closing(self.db.connect()) as db:
            db.executemany(
                "INSERT INTO bans VALUES('sshd', ?, ?, 600, 1, NULL)",
                [(f"10.0.{i // 250}.{i % 250}", epoch(-6000 + i)) for i in range(5003)],
            )
            db.commit()
        fill = self.read()
        self.assertEqual(len(fill["bans"]), 5000)
        self.assertEqual(fill["bans"][0]["at"], at(-5997))
        self.assertEqual(fill["bans"][-1]["at"], at(-998))
        self.assertEqual(fill["complete_s"], 5997)

    def test_the_file_is_read_only_and_nothing_is_written_beside_it(self):
        self.db.ban("203.0.113.77", -30)
        os.chmod(self.db.path, 0o400)
        os.chmod(self.folder, 0o500)
        self.addCleanup(os.chmod, self.folder, 0o700)
        before = os.stat(self.db.path)
        self.assertEqual(len(self.read()["bans"]), 1)
        after = os.stat(self.db.path)
        self.assertEqual(os.listdir(self.folder), ["fail2ban.sqlite3"])
        self.assertEqual(
            (before.st_mtime_ns, before.st_size, before.st_ino),
            (after.st_mtime_ns, after.st_size, after.st_ino),
        )

    def test_a_file_replaced_between_reads_is_read_afresh(self):
        self.db.ban("203.0.113.77", -30)
        self.assertEqual(len(self.read()["bans"]), 1)
        # fail2ban moves a damaged file aside and makes a new one in its place.
        os.rename(self.db.path, self.db.path + ".20260115-205900")
        Db(self.folder).ban("198.51.100.9", -10)
        self.assertEqual([b["ip"] for b in self.read()["bans"]], ["198.51.100.9"])

    def test_a_path_with_characters_a_uri_would_read_otherwise(self):
        odd = os.path.join(self.tmp.name, "a folder?#%")
        os.mkdir(odd)
        db = Db(odd, "f2b db.sqlite3")
        db.ban("192.0.2.4", -5)
        provider = fail2ban.Fail2banProvider({"database": db.path}, {}, 5.0, frozenset())
        self.assertEqual([b["ip"] for b in provider.read(at(0))["bans"]], ["192.0.2.4"])

    def assertFails(self, message):
        with self.assertRaises(SourceError) as cm:
            self.read()
        self.assertEqual(str(cm.exception), message)
        self.assertLessEqual(len(message), 80)

    def test_a_missing_file(self):
        os.remove(self.db.path)
        self.assertFails("no fail2ban database at sources.security.database")
        self.assertEqual(os.listdir(self.folder), [])
        self.provider.path = os.path.join(self.tmp.name, "nowhere", "fail2ban.sqlite3")
        self.assertFails("no fail2ban database at sources.security.database")

    @unittest.skipIf(os.geteuid() == 0, "root reads a file whatever its mode")
    def test_a_file_the_collector_may_not_read(self):
        os.chmod(self.db.path, 0)
        self.assertFails("cannot open the fail2ban database (see the read ACL in configuration.md)")
        os.chmod(self.db.path, 0o600)
        os.chmod(self.folder, 0o600)  # no x: the folder cannot be passed through
        self.addCleanup(os.chmod, self.folder, 0o700)
        self.assertFails("cannot open the fail2ban database (see the read ACL in configuration.md)")

    def test_a_folder_in_its_place(self):
        self.provider.path = self.folder
        self.assertFails("sources.security.database is a folder, not the database")

    def test_a_locked_file(self):
        writer = self.db.connect()
        self.addCleanup(writer.close)
        writer.execute("BEGIN EXCLUSIVE")
        with mock.patch.object(fail2ban, "BUSY_TIMEOUT_S", 0.05):
            self.assertFails("fail2ban database busy")
        writer.rollback()
        self.assertEqual(self.read(), {"bans": []})

    def test_a_damaged_file(self):
        with open(self.db.path, "wb") as fh:
            fh.write(b"SQLite format 3\x00" + b"\xff" * 2000)
        self.assertFails("fail2ban database damaged")
        with open(self.db.path, "wb") as fh:
            fh.write(b"not a database at all" * 100)
        self.assertFails("fail2ban database damaged")

    def test_a_database_without_the_bans_table(self):
        os.remove(self.db.path)
        with contextlib.closing(sqlite3.connect(self.db.path)) as db:
            db.execute("CREATE TABLE other(x)")
            db.commit()
        self.assertFails("not a fail2ban database")

    def test_what_sqlite_says_otherwise(self):
        rollback = sqlite3.OperationalError("attempt to write a readonly database")
        rollback.sqlite_errorname = "SQLITE_READONLY_ROLLBACK"
        self.assertEqual(
            self.provider._why(rollback), "fail2ban database left mid-write; fail2ban recovers it"
        )
        odd = sqlite3.OperationalError("disk I/O error")
        odd.sqlite_errorname = "SQLITE_IOERR_READ"
        self.assertEqual(self.provider._why(odd), "fail2ban database error (SQLITE_IOERR_READ)")


class ConfigTest(unittest.TestCase):
    def build(self, security):
        return make_config({"sources": {"security": security}})

    def refused(self, security):
        with self.assertRaises(ConfigError) as cm:
            self.build(security)
        return cm.exception.problems

    def test_fail2ban_is_the_default(self):
        config = self.build({})
        self.assertEqual(config.sources["security"]["from"], "fail2ban")
        (source,) = build_sources(config)
        self.assertIs(type(source), KindSource)
        self.assertEqual(source.spec.id, "fail2ban")

    def test_fail2ban_reads_through_the_kind(self):
        config = self.build({"from": "fail2ban"})
        (source,) = build_sources(config)
        self.assertIs(type(source), KindSource)
        self.assertEqual(
            (source.name, source.section, source.spec.id), ("security",) * 2 + ("fail2ban",)
        )
        self.assertEqual(source.provider.path, "/host/fail2ban/fail2ban.sqlite3")
        self.assertEqual(source.identity, "fail2ban:code")
        config = self.build({"from": "fail2ban", "database": "/host/f2b/other.sqlite3"})
        self.assertEqual(build_sources(config)[0].provider.path, "/host/f2b/other.sqlite3")

    def test_a_key_the_provider_does_not_use_is_refused_by_name(self):
        self.assertEqual(
            self.refused({"from": "fail2ban", "url": "http://192.0.2.1:8080"}),
            ["sources.security.url: not used by fail2ban"],
        )

    def test_a_section_written_for_the_fail2ban_summary_is_refused_with_what_replaces_it(self):
        gone = (
            'the fail2ban summary is no longer read; use from = "fail2ban" and database, with '
            "the mount and the read ACL in docs/configuration.md, fail2ban's database"
        )
        self.assertEqual(config_mod.SUMMARY_GONE, gone)
        # A url with no from: the section as it was written for the summary.
        self.assertEqual(
            self.refused({"url": "http://192.0.2.1:8080"}), [f"sources.security.url: {gone}"]
        )
        self.assertEqual(
            self.refused({"enabled": False, "url": "http://192.0.2.1:8080"}),
            [f"sources.security.url: {gone}"],
        )
        # The summary named by from, as a section could since fail2ban was added beside it.
        self.assertEqual(
            self.refused({"from": "summary", "url": "http://192.0.2.1:8080"}),
            [f"sources.security.from: {gone}"],
        )
        # The command line says the same.
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.toml")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write('[sources.security]\nurl = "http://192.0.2.1:8080"\n')
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                code = main(["--config", path, "--admin", os.path.join(tmp, "a.json"),
                             "--check-config"])  # fmt: skip
        self.assertEqual(code, 2)
        self.assertIn(f"config: sources.security.url: {gone}\n", err.getvalue())

    def test_a_provider_file_of_your_own_takes_url_and_not_database(self):
        from test_kinds import MYBANS

        from collector import providers

        with tempfile.TemporaryDirectory() as folder:
            with open(os.path.join(folder, "mybans.toml"), "w", encoding="utf-8") as fh:
                fh.write(MYBANS)
            found = providers.scan(folder)
        env = {"KW_MYBANS_TOKEN": "an-invented-token"}
        own = {"from": "mybans", "url": "http://192.0.2.40:8080"}
        config = config_mod.build({"sources": {"security": own}}, env, providers=found)
        self.assertEqual(config.sources["security"]["url"], "http://192.0.2.40:8080")
        with self.assertRaises(ConfigError) as cm:
            raw = {"sources": {"security": {**own, "database": "/host/f.sqlite3"}}}
            config_mod.build(raw, env, providers=found)
        self.assertEqual(cm.exception.problems, ["sources.security.database: not used by mybans"])

    def test_the_database_is_a_path_from_the_root(self):
        self.assertEqual(
            self.refused({"from": "fail2ban", "database": "fail2ban.sqlite3"}),
            ["sources.security.database: a path inside the container, from /"],
        )
        self.assertIn(
            "sources.security.database: expected str",
            self.refused({"from": "fail2ban", "database": 3}),
        )

    def test_a_from_of_another_kind_or_none(self):
        self.assertIn(
            'sources.security.from: unknown provider "fail2bam"; use fail2ban',
            self.refused({"from": "fail2bam"}),
        )
        self.assertIn(
            'sources.security.from: "tautulli" reads streams, not security',
            self.refused({"from": "tautulli", "url": "http://192.0.2.1"}),
        )

    def test_fail2ban_needs_no_credential(self):
        for security in ({"from": "fail2ban"}, {}):
            config = config_mod.build({"sources": {"security": security}}, {})
            self.assertEqual(config.missing, {})
            self.assertEqual(config.secret("security"), {})


class ExportTest(unittest.TestCase):
    """The admin page's Download config.toml leaves out, commented, what the provider does not
    use, so that the file it gives reads back."""

    def export(self, raw):
        import tomllib

        from server.admin import export_toml

        text = export_toml(raw, {}, at(0))
        config_mod.build(tomllib.loads(text), None)
        return [line for line in text.splitlines() if "not used by" in line]

    def test_fail2ban_given_left_out_and_absent(self):
        unused = [
            '# url = ""   # not used by fail2ban',
            "# verify_tls = true   # not used by fail2ban",
        ]
        given = {"sources": {"security": {"from": "fail2ban"}}}
        self.assertEqual(self.export(given), unused)
        left_out = {"sources": {"security": {}}}
        self.assertEqual(self.export(left_out), unused)
        self.assertEqual(self.export({}), ["# " + line for line in unused])


class WallTest(unittest.TestCase):
    """[sources.security] from fail2ban through the whole collector: the state file and memory."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out, self.var = os.path.join(self.tmp.name, "out"), os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        folder = os.path.join(self.tmp.name, "fail2ban")
        os.mkdir(folder)
        self.db = Db(folder)
        self.clock = Clock()
        self.runner = self.make_runner()

    def make_runner(self):
        raw = {
            "collector": {"output_dir": self.out, "state_dir": self.var},
            "sources": {"security": {"from": "fail2ban", "database": self.db.path}},
        }
        memory = Memory(self.var)
        memory.load()
        return Runner(make_config(raw), memory, clock=self.clock)

    def cycle(self, seconds):
        self.clock.now = at(seconds)
        self.runner.cycle()
        with open(os.path.join(self.out, "state.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def test_a_ban_an_attack_and_an_unban(self):
        self.db.ban("203.0.113.5", -3600, jail="recidive")
        state = self.cycle(0)
        self.assertEqual(state["facts"]["security"], {"bans_24h": 1, "attack": False})
        self.assertEqual(state["sources"]["security"]["ok"], True)
        self.assertEqual(state["events"], [])
        self.assertEqual(state["conditions"], [])

        self.db.ban("203.0.113.77", 20)
        state = self.cycle(30)
        self.assertEqual(state["facts"]["security"], {"bans_24h": 2, "attack": True})
        (condition,) = state["conditions"]
        self.assertEqual(condition["id"], "attack")
        self.assertEqual(condition["detail"], "sshd ban from 203.0.113.77 · 1 ban in 10 min")
        (event,) = state["events"]
        self.assertEqual(
            {k: event[k] for k in ("type", "count", "text", "parts")},
            {"type": "ip_banned", "count": 1, "text": "BANNED 203.0.113.77 · sshd",
             "parts": {"addr": "203.0.113.77", "jail": "sshd"}},
        )  # fmt: skip

        # A burst of bans in other jails between two reads: one event, all counted.
        for i in range(4):
            self.db.ban(f"198.51.100.{i}", 40 + i, jail="nginx-botsearch")
        state = self.cycle(60)
        self.assertEqual(state["facts"]["security"]["bans_24h"], 6)
        self.assertEqual(
            state["conditions"][0]["detail"], "sshd ban from 203.0.113.77 · 5 bans in 10 min"
        )
        self.assertEqual(len(state["events"]), 2)
        self.assertEqual(
            {k: state["events"][-1][k] for k in ("count", "text")},
            {"count": 4, "text": "BANNED 198.51.100.3 · nginx-botsearch"},
        )

        # Unbanned: the rows go, the count falls, and nothing new is raised.
        self.db.unban("203.0.113.77")
        for i in range(4):
            self.db.unban(f"198.51.100.{i}", jail="nginx-botsearch")
        state = self.cycle(90)
        self.assertEqual(state["facts"]["security"], {"bans_24h": 1, "attack": True})
        self.assertEqual(len(state["events"]), 2)
        state = self.cycle(150)
        self.assertEqual(state["facts"]["security"], {"bans_24h": 1, "attack": False})
        self.assertEqual(state["conditions"], [])

    def test_a_restart_raises_nothing_twice(self):
        self.db.ban("203.0.113.5", -60, jail="recidive")
        self.cycle(0)
        self.db.ban("203.0.113.6", 10, jail="recidive")
        self.assertEqual(len(self.cycle(30)["events"]), 1)
        self.runner = self.make_runner()
        state = self.cycle(60)
        self.assertEqual(len(state["events"]), 1)
        self.assertEqual(state["facts"]["security"]["bans_24h"], 2)

    def test_a_missing_database_fails_the_source_and_the_others_carry_on(self):
        os.remove(self.db.path)
        state = self.cycle(0)
        self.assertIsNone(state["facts"]["security"])
        self.assertEqual(
            state["sources"]["security"],
            {"ok": False, "at": "2026-01-15T21:00:00Z",
             "error": "no fail2ban database at sources.security.database"},
        )  # fmt: skip


class ProbeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Db(self.tmp.name)
        self.config = os.path.join(self.tmp.name, "config.toml")

    def probe(self, security):
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\nstate_dir = "{self.tmp.name}"\n[sources.security]\n{security}\n'
            )
        err, out = io.StringIO(), io.StringIO()
        admin = os.path.join(self.tmp.name, "admin.json")
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, "--admin", admin, "--probe", "security"])
        return code, out.getvalue(), err.getvalue()

    def test_fail2ban_is_probed_with_its_addresses_masked(self):
        self.db.ban("203.0.113.77", -30)
        now = dt.datetime.now(dt.UTC)
        with contextlib.closing(self.db.connect()) as db:
            db.execute("UPDATE bans SET timeofban = ?", (int(now.timestamp()) - 30,))
            db.commit()
        code, out, err = self.probe(f'from = "fail2ban"\ndatabase = "{self.db.path}"')
        self.assertEqual(code, 0, err)
        self.assertIn("probe security: provider fail2ban (fail2ban)\n", out)
        self.assertIn('"ip": "<string 12>"', out)
        self.assertIn('"bans_24h": 1', out)
        self.assertNotIn("203.0.113.77", out)

    def test_fail2ban_is_probed_with_from_left_out(self):
        code, out, err = self.probe(f'database = "{self.db.path}"')
        self.assertEqual(code, 0, err)
        self.assertIn("probe security: provider fail2ban (fail2ban)\n", out)


if __name__ == "__main__":
    unittest.main()
