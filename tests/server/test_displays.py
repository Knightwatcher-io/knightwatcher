"""The displays the server counts: POST /api/displays and server/displays.py.

A page posts its random id; the server keeps when it last saw each id in displays.json in its own
folder, for the collector to count. Anyone on the LAN can post, so a post may only record an id of
the right form, and the file stays small however many arrive. Every id here is invented.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import tempfile
import time
import unittest

from test_server import Running

from collector import displays as shared
from server import displays

NOW = dt.datetime(2026, 11, 22, 12, 0, 0, tzinfo=dt.UTC)
A, B = "0123456789abcdef" * 2, "fedcba9876543210" * 2


class EndpointTest(unittest.TestCase):
    def setUp(self):
        self.s = Running()
        self.addCleanup(self.s.close)
        # writes at once, so that each post can be read back from the file
        self.s.httpd.displays.write_every_s = 0

    def post(self, payload, headers=None, raw=None):
        body = raw if raw is not None else json.dumps(payload).encode()
        h = {"Content-Type": "application/json", **(headers or {})}
        status, r, data = self.s.request("POST", "/api/displays", body, h)
        return status, r, json.loads(data) if data else None

    def file(self):
        with open(os.path.join(self.s.data, "displays.json"), "rb") as fh:
            return shared.parse(fh.read())

    def test_a_post_records_the_id_and_answers_204_with_no_body(self):
        with self.assertNoLogs("server", "INFO"):
            status, r, body = self.post({"id": A})
        self.assertEqual((status, body), (204, None))
        self.assertEqual(r.getheader("Cache-Control"), "no-store")
        self.assertEqual(list(self.file()), [A])
        first = self.file()[A]
        self.post({"id": B})
        self.assertEqual(sorted(self.file()), sorted([A, B]))
        self.assertGreaterEqual(self.file()[A], first)
        mode = os.stat(os.path.join(self.s.data, "displays.json")).st_mode & 0o777
        self.assertEqual(mode, 0o640)

    def test_only_an_id_of_the_right_form_is_taken_and_nothing_is_logged(self):
        bad = [
            {"id": A.upper()},
            {"id": A[:-1]},
            {"id": A + "0"},
            {"id": 7},
            {"id": None},
            {"id": A, "name": "Robin's tablet"},
            {},
            [A],
            A,
        ]
        with self.assertNoLogs("server", "INFO"):
            for payload in bad:
                status, _, body = self.post(payload)
                self.assertEqual(status, 400, payload)
                self.assertIn("32 lowercase hexadecimal characters", body["error"])
            status, _, body = self.post(None, raw=b"{not json")
            self.assertEqual((status, body["error"]), (400, "the body is not JSON"))
        self.assertFalse(os.path.exists(os.path.join(self.s.data, "displays.json")))

    def test_the_body_is_small_json_from_this_address(self):
        status, _, body = self.post(None, raw=json.dumps({"id": A, "pad": " " * 300}).encode())
        self.assertEqual((status, body["error"]), (413, "display ids are larger than 256 bytes"))
        status, _, _ = self.s.request(
            "POST", "/api/displays", b'{"id":"' + A.encode() + b'"}', {"Content-Type": "text/plain"}
        )
        self.assertEqual(status, 415)
        status, _, _ = self.s.request(
            "POST", "/api/displays", None, {"Content-Type": "application/json"}
        )
        self.assertEqual(status, 411)
        for h in ({"Origin": "http://evil.example.com"}, {"Sec-Fetch-Site": "cross-site"}):
            status, _, _ = self.post({"id": A}, h)
            self.assertEqual(status, 403, h)
        self.assertFalse(os.path.exists(os.path.join(self.s.data, "displays.json")))
        # the page's own address is taken
        status, _, _ = self.post({"id": A}, {"Origin": f"http://127.0.0.1:{self.s.port}"})
        self.assertEqual(status, 204)

    def test_the_address_takes_post_alone_and_the_ids_are_never_served(self):
        self.post({"id": A})
        for method in ("GET", "HEAD", "PUT", "DELETE", "PATCH"):
            status, r, _ = self.s.request(
                method, "/api/displays", b"{}" if method in ("PUT", "PATCH") else None
            )
            self.assertEqual((status, r.getheader("Allow")), (405, "POST"), method)
        for target in (
            "/data/displays.json",
            "/displays.json",
            "/api/displays.json",
            "/data/../displays.json",
        ):
            status, _, data = self.s.request("GET", target)
            self.assertEqual(status, 404, target)
            self.assertNotIn(A.encode(), data)
        # the settings and the page are as they were
        self.assertEqual(self.s.request("GET", "/api/settings")[0], 200)

    def test_the_ids_are_read_again_at_start(self):
        self.post({"id": A})
        self.s.httpd.displays.close()
        self.s.stop()
        self.s.start()
        self.assertEqual(list(self.s.httpd.displays.ids()), [A])


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp(prefix="kw-displays-")
        self.addCleanup(shutil.rmtree, self.folder, True)
        self.now = NOW

    def clock(self):
        return self.now

    def read(self):
        with open(os.path.join(self.folder, "displays.json"), "rb") as fh:
            return shared.parse(fh.read())

    def test_at_most_a_thousand_ids_are_kept_the_oldest_dropped(self):
        d = displays.Displays(self.folder, clock=self.clock, write_every_s=0)
        for i in range(1005):
            self.now = NOW + dt.timedelta(seconds=i)
            d.seen(f"{i:032x}")
        kept = self.read()
        self.assertEqual(len(kept), 1000)
        self.assertNotIn(f"{4:032x}", kept)
        self.assertIn(f"{5:032x}", kept)
        self.assertLessEqual(
            os.path.getsize(os.path.join(self.folder, "displays.json")), shared.MAX_FILE
        )
        # a display seen again moves to the front and is kept
        self.now += dt.timedelta(seconds=1)
        d.seen(f"{5:032x}")
        d.seen("f" * 32)
        kept = self.read()
        self.assertIn(f"{5:032x}", kept)
        self.assertNotIn(f"{6:032x}", kept)

    def test_a_flood_of_posts_is_written_once_a_minute(self):
        d = displays.Displays(self.folder, clock=self.clock, write_every_s=0.3)
        d.seen(A)
        self.assertEqual(list(self.read()), [A])
        d.seen(B)
        self.assertEqual(list(self.read()), [A], "the second waits for the next write")
        time.sleep(0.6)
        self.assertEqual(sorted(self.read()), sorted([A, B]))
        self.assertEqual(displays.WRITE_EVERY_S, 60.0)

    def test_close_writes_what_is_pending(self):
        d = displays.Displays(self.folder, clock=self.clock, write_every_s=60)
        d.seen(A)
        d.seen(B)
        d.close()
        self.assertEqual(sorted(self.read()), sorted([A, B]))

    def test_a_broken_file_is_none_and_kept_until_a_write(self):
        with open(os.path.join(self.folder, "displays.json"), "w") as fh:
            fh.write("{ not json")
        d = displays.Displays(self.folder, clock=self.clock, write_every_s=0)
        self.assertEqual(d.ids(), {})
        d.seen(A)
        self.assertEqual(list(self.read()), [A])


if __name__ == "__main__":
    unittest.main()
