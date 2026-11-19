"""`--probe`: one source read once through its provider, every text it gave masked, and `--record`,
which writes the exchanges with each credential replaced by its field's name."""

import contextlib
import io
import json
import os
import secrets
import stat
import tempfile
import unittest
from unittest import mock

from collector.cli import main
from kw_helpers import FakeHttp

ACTIVITY = {
    "response": {
        "result": "success",
        "data": {
            "stream_count": "2",
            "sessions": [
                {"session_key": "4", "friendly_name": "Robin", "media_type": "movie",
                 "title": "Harbour of Glass"},
                {"session_key": "2", "user": "Sam", "media_type": "episode",
                 "grandparent_title": "The Lantern Keepers", "parent_media_index": "1",
                 "media_index": "3"},
            ],
        },
    }
}  # fmt: skip


class ProbeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = os.path.join(self.tmp.name, "out")
        self.var = os.path.join(self.tmp.name, "var")
        os.mkdir(self.out)
        os.mkdir(self.var)
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.http.routes["/api/v2"] = (200, ACTIVITY)
        self.key = secrets.token_hex(16)
        self.password = secrets.token_urlsafe(12)
        env = {k: v for k, v in os.environ.items() if not k.startswith("KNIGHTWATCHER_")}
        env.update(
            KNIGHTWATCHER_TAUTULLI_API_KEY=self.key,
            KNIGHTWATCHER_ADGUARD_USERNAME="kw",
            KNIGHTWATCHER_ADGUARD_PASSWORD=self.password,
        )
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.config = os.path.join(self.tmp.name, "config.toml")
        self.write_config()

    def write_config(self, streams="", extra=""):
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(
                f'[collector]\noutput_dir = "{self.out}"\nstate_dir = "{self.var}"\n'
                f'[sources.streams]\nurl = "{self.http.url}"\n{streams}\n'
                f'[sources.adblock]\nurl = "{self.http.url}"\n{extra}'
            )

    def probe(self, *args):
        err, out = io.StringIO(), io.StringIO()
        admin = os.path.join(self.tmp.name, "admin.json")
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = main(["--config", self.config, "--admin", admin, "--probe", *args])
        return code, out.getvalue(), err.getvalue()

    def assertNothingPrivate(self, *texts):
        for text in texts:
            for private in ("Robin", "Sam", "Harbour", "Lantern", self.key, self.password):
                self.assertNotIn(private, text)

    def test_a_probe_prints_the_fill_and_the_facts_masked(self):
        code, out, err = self.probe("streams")
        self.assertEqual(code, 0, err)
        self.assertNothingPrivate(out, err)
        head, rest = out.split("fill:\n", 1)
        self.assertEqual(
            head,
            "probe streams: provider tautulli (Tautulli), show = names\n"
            "credentials: KNIGHTWATCHER_TAUTULLI_API_KEY\n",
        )
        fill, facts = rest.split("facts:\n", 1)
        self.assertEqual(
            json.loads(fill),
            {
                "count": 2,
                "sessions": [
                    {"who": "<string 5>", "order": "<string 1>", "title": "<string 16>"},
                    {"who": "<string 3>", "order": "<string 1>", "title": "<string 26>"},
                ],
            },
        )
        self.assertEqual(
            json.loads(facts),
            {
                "count": 2,
                "titles": ["<string 26>", "<string 16>"],
                "sessions": [
                    {"who": "<string 3>", "title": "<string 26>"},
                    {"who": "<string 5>", "title": "<string 16>"},
                ],
            },
        )
        # A probe writes nothing of the collector's own.
        self.assertEqual(os.listdir(self.out), [])
        self.assertEqual(os.listdir(self.var), [])

    def test_a_probe_reads_only_what_show_lets_out(self):
        self.write_config('show = "count"')
        code, out, _ = self.probe("streams")
        self.assertEqual(code, 0)
        self.assertIn("show = count", out)
        fill = out.split("fill:\n", 1)[1].split("facts:\n", 1)[0]
        self.assertEqual(json.loads(fill), {"count": 2, "sessions": [{}, {}]})

    def test_a_refused_key_is_said_and_nothing_is_paused(self):
        self.http.routes["/control/stats"] = (401, {"message": "no"})
        code, out, err = self.probe("adblock")
        self.assertEqual(code, 1)
        self.assertIn("probe adblock: credentials refused: HTTP 401: credentials refused", err)
        self.assertNothingPrivate(out, err)
        self.assertEqual(os.listdir(self.var), [])

    def test_a_source_the_collector_has_paused_is_not_read(self):
        memory = {
            "seq": 0, "events": [], "sources": {},
            "backoff": {"adblock": {"until": "2999-01-01T00:00:00Z", "at": "2026-01-15T21:00:00Z",
                                    "error": "HTTP 401: credentials refused"}},
        }  # fmt: skip
        with open(os.path.join(self.var, "memory.json"), "w", encoding="utf-8") as fh:
            json.dump(memory, fh)
        code, _, err = self.probe("adblock")
        self.assertEqual(code, 1)
        self.assertIn("probe adblock: paused after refused credentials until", err)
        self.assertEqual(self.http.requests, [])

    def test_what_cannot_be_probed(self):
        code, _, err = self.probe("host")
        self.assertEqual((code, err), (2, "probe: host is not read through a provider; use "
                                           "streams, adblock, security, sonarr, "
                                           "radarr\n"))  # fmt: skip
        code, _, err = self.probe("sonarr")
        self.assertEqual((code, err), (2, "probe: [sources.sonarr] is not set up, or is off\n"))
        self.write_config('from = "plx"')
        code, _, err = self.probe("streams")
        self.assertEqual(code, 2)
        self.assertIn('config: sources.streams.from: unknown provider "plx"; use tautulli', err)

    def test_record_writes_the_exchanges_without_the_credentials(self):
        folder = os.path.join(self.tmp.name, "rec")
        code, out, err = self.probe("streams", "--record", folder)
        self.assertEqual(code, 0, err)
        (name,) = os.listdir(folder)
        path = os.path.join(folder, name)
        self.assertIn(f"recorded: {path}\n", out)
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn(self.key, text)
        doc = json.loads(text)
        self.assertEqual((doc["source"], doc["provider"]), ("streams", "tautulli"))
        (exchange,) = doc["exchanges"]
        self.assertEqual(
            exchange["request"],
            {
                "id": "",
                "method": "GET",
                "path": "/api/v2?apikey={credential.api_key}&cmd=get_activity",
                "headers": {},
            },
        )
        self.assertEqual(exchange["reply"], {"json": ACTIVITY})

        self.http.routes["/control/stats"] = (401, {"message": "no"})
        code, _, _ = self.probe("adblock", "--record", folder)
        self.assertEqual(code, 1)
        name = next(n for n in os.listdir(folder) if n.startswith("adblock-"))
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            doc = json.load(fh)
        (exchange,) = doc["exchanges"]
        self.assertEqual(
            exchange["request"]["headers"],
            {"Authorization": "Basic {credential.username}:{credential.password}"},
        )
        self.assertEqual(exchange["error"], "HTTP 401: credentials refused")

    def test_record_goes_with_probe(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(SystemExit):
            main(["--config", self.config, "--record", self.tmp.name])
        self.assertIn("--record goes with --probe", err.getvalue())


if __name__ == "__main__":
    unittest.main()
