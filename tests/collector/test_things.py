"""The checks behind watched things, against local sockets and the local HTTP server."""

import os
import socket
import ssl
import threading
import time
import unittest
import urllib.request
from unittest import mock

from collector import net
from collector.net import SourceError, fetch, http_answers, resolve, tcp_any
from collector.sources import build_sources
from collector.sources.things import ThingSource
from kw_helpers import T0, FakeHttp, closed_port, listener, make_config, unanswering

# Generous, so that a loaded machine does not fail a test; the checks themselves are bounded by
# much less than this beyond their timeout.
MARGIN_S = 0.5


class Timed:
    def __enter__(self):
        self.started = time.monotonic()
        return self

    def __exit__(self, *exc):
        self.took = time.monotonic() - self.started


class TcpTest(unittest.TestCase):
    def setUp(self):
        self.open = listener()
        self.addCleanup(self.open.close)
        self.port = self.open.getsockname()[1]
        hung, fillers = unanswering()
        self.addCleanup(hung.close)
        for f in fillers:
            self.addCleanup(f.close)
        self.hung = hung.getsockname()[1]

    def test_an_accepted_connection_is_an_answer(self):
        self.assertTrue(tcp_any("127.0.0.1", [self.port], 1))

    def test_a_refusal_counts_only_when_asked(self):
        port = closed_port()
        self.assertFalse(tcp_any("127.0.0.1", [port], 1))
        self.assertTrue(tcp_any("127.0.0.1", [port], 1, refused_counts=True))

    def test_a_time_out_is_no_answer_within_the_timeout(self):
        with Timed() as t:
            self.assertFalse(tcp_any("127.0.0.1", [self.hung], 0.3))
        self.assertGreaterEqual(t.took, 0.3)
        self.assertLess(t.took, 0.3 + MARGIN_S)

    def test_ports_are_tried_at_once(self):
        # Two ports that hang and one that answers: the answer comes without waiting for them.
        with Timed() as t:
            self.assertTrue(tcp_any("127.0.0.1", [self.hung, self.hung, self.port], 2))
        self.assertLess(t.took, MARGIN_S)
        # A refusal that counts ends the wait as well.
        with Timed() as t:
            self.assertTrue(tcp_any("127.0.0.1", [self.hung, closed_port()], 2, True))
        self.assertLess(t.took, MARGIN_S)
        # Three that hang take one timeout, not three.
        with Timed() as t:
            self.assertFalse(tcp_any("127.0.0.1", [self.hung] * 3, 0.3))
        self.assertLess(t.took, 0.3 + MARGIN_S)

    def test_an_unreachable_address_is_no_answer(self):
        # 192.0.2.0/24 is reserved for documentation and is not routed.
        self.assertFalse(tcp_any("192.0.2.4", [22], 0.3))


class LookupTest(unittest.TestCase):
    """A name's lookup is bounded by the check's timeout; an address needs none."""

    def setUp(self):
        self.release = threading.Event()
        self.addCleanup(self.release.set)
        self.calls: list[str] = []
        real = socket.getaddrinfo

        def getaddrinfo(host, port, *args, **kwargs):
            if kwargs.get("flags", 0) & socket.AI_NUMERICHOST:
                return real(host, port, *args, **kwargs)
            self.calls.append(host)
            self.release.wait(10)
            return real("127.0.0.1", port, *args, **kwargs)

        patcher = mock.patch.object(net.socket, "getaddrinfo", getaddrinfo)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_an_address_is_not_looked_up(self):
        self.assertEqual(resolve("192.0.2.40", 1), [(socket.AF_INET, ("192.0.2.40", 0))])
        family, sockaddr = resolve("2001:db8::40", 1)[0]
        self.assertEqual((family, sockaddr[0]), (socket.AF_INET6, "2001:db8::40"))
        self.assertEqual(self.calls, [])

    def test_a_lookup_that_hangs_is_given_up_on_within_the_timeout(self):
        open_ = listener()
        self.addCleanup(open_.close)
        with Timed() as t:
            self.assertFalse(tcp_any("nas.example.com", [open_.getsockname()[1]], 0.3))
        self.assertLess(t.took, 0.3 + MARGIN_S)
        with self.assertRaises(SourceError) as cm:
            resolve("nas.example.com", 0.1)
        self.assertEqual(str(cm.exception), "name lookup timed out")
        # The second check waited on the first lookup rather than starting another.
        self.assertEqual(self.calls, ["nas.example.com"])
        # Once the resolver answers, the next check uses a fresh lookup and gets through.
        self.release.set()
        time.sleep(0.05)
        self.assertTrue(tcp_any("nas.example.com", [open_.getsockname()[1]], 1))
        self.assertEqual(self.calls, ["nas.example.com", "nas.example.com"])

    def test_a_web_check_bounds_its_lookup_too(self):
        with Timed() as t:
            self.assertFalse(http_answers("http://cam.example.com/", 0.3))
        self.assertLess(t.took, 0.3 + MARGIN_S)


class HttpTest(unittest.TestCase):
    def serve(self, tls=False) -> FakeHttp:
        http = FakeHttp(tls=tls)
        self.addCleanup(http.close)
        return http

    def test_any_status_is_an_answer(self):
        http = self.serve()
        for status in (200, 302, 401, 403, 404, 429, 500, 503):
            http.routes["/"] = (status, b"")
            with self.subTest(status=status):
                self.assertTrue(http_answers(http.url + "/", 1))

    def test_a_redirect_is_not_followed(self):
        http = self.serve()
        http.routes["/"] = (302, b"")
        http.routes["/login"] = (200, b"")
        self.assertTrue(http_answers(http.url + "/", 1))
        self.assertEqual([p for p, _ in http.requests], ["/"])

    def test_one_plain_request_with_no_credentials(self):
        http = self.serve()
        http.routes["/cgi/status"] = (401, b"")
        self.assertTrue(http_answers(http.url + "/cgi/status?x=1", 1))
        ((path, headers),) = http.requests
        self.assertEqual(path, "/cgi/status?x=1")
        self.assertEqual(headers["User-Agent"], "knightwatcher")
        self.assertNotIn("Authorization", headers)

    def test_a_401_is_an_answer_and_not_a_pause(self):
        # The source never raises, so the runner never pauses it for refused credentials.
        http = self.serve()
        http.routes["/"] = (401, b"")
        thing = {"name": "Gate cam", "kind": "camera", "url": http.url + "/"}
        (cam,) = build_sources(make_config({"thing": [thing]}))
        reading = cam.fetch(T0)
        self.assertEqual((reading.facts, reading.data), (None, {"answered": True}))

    def test_no_answer(self):
        self.assertFalse(http_answers(f"http://127.0.0.1:{closed_port()}/", 1))
        # Connected, but the status line never comes.
        silent = listener()
        self.addCleanup(silent.close)
        with Timed() as t:
            self.assertFalse(http_answers(f"http://127.0.0.1:{silent.getsockname()[1]}/", 0.3))
        self.assertLess(t.took, 2 * 0.3 + MARGIN_S)

    def test_a_reply_that_is_not_http_is_no_answer(self):
        server = listener()
        self.addCleanup(server.close)

        def banner():
            conn, _ = server.accept()
            with conn:
                conn.sendall(b"SSH-2.0-OpenSSH_9.6\r\n")

        threading.Thread(target=banner, daemon=True).start()
        self.assertFalse(http_answers(f"http://127.0.0.1:{server.getsockname()[1]}/", 1))

    def test_a_self_signed_certificate(self):
        https = self.serve(tls=True)
        https.routes["/"] = (401, b"")
        self.assertTrue(http_answers(https.url + "/", 1))
        self.assertTrue(http_answers(https.url + "/", 1, verify_tls=False))
        self.assertFalse(http_answers(https.url + "/", 1, verify_tls=True))
        # The certificate failed before anything was sent.
        self.assertEqual(len(https.requests), 2)

    def test_tls_must_complete(self):
        # A plain http server behind an https address does not answer.
        http = self.serve()
        self.assertFalse(http_answers(http.url.replace("http:", "https:") + "/", 1))


class OpenerTest(unittest.TestCase):
    """The opener every source uses goes direct, and speaks http and https alone."""

    def test_no_proxy_redirect_file_or_ftp_handler(self):
        kinds = {type(h) for h in net._opener_checked.handlers}
        for unwanted in (
            urllib.request.ProxyHandler,
            urllib.request.HTTPRedirectHandler,
            urllib.request.FileHandler,
            urllib.request.FTPHandler,
            urllib.request.DataHandler,
        ):
            self.assertNotIn(unwanted, kinds)

    def test_other_schemes_are_refused(self):
        for url in ("file:///etc/hostname", "ftp://192.0.2.21/x", "data:,x"):
            with self.subTest(url=url), self.assertRaises(SourceError):
                fetch(url, 1)

    def test_a_proxy_in_the_environment_is_not_used(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/ok"] = (200, b"ok")
        nowhere = f"http://127.0.0.1:{closed_port()}"
        env = {"http_proxy": nowhere, "HTTP_PROXY": nowhere, "https_proxy": nowhere, "no_proxy": ""}
        with mock.patch.dict(os.environ, env):
            opener = net._opener(ssl.create_default_context())
            with opener.open(http.url + "/ok", timeout=1) as resp:
                self.assertEqual(resp.read(), b"ok")
            self.assertTrue(http_answers(http.url + "/ok", 1))
            # What build_opener would have done: gone through the proxy, and failed.
            with self.assertRaises(OSError):
                urllib.request.build_opener().open(http.url + "/ok", timeout=1)

    def test_a_redirect_is_still_an_error_for_fetch(self):
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/old"] = (302, b"")
        with self.assertRaises(SourceError) as cm:
            fetch(http.url + "/old", 1)
        self.assertEqual(str(cm.exception), "HTTP 302")


class ThingSourceTest(unittest.TestCase):
    def test_build_sources_places_the_pi_and_then_the_things(self):
        config = make_config(
            {
                "sources": {"wan": {}, "pi": {"host": "192.0.2.4"}, "dns": {}},
                "thing": [
                    {"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445},
                    {"name": "Gate cam", "kind": "camera", "url": "https://198.51.100.31/"},
                ],
            }
        )
        built = build_sources(config)
        self.assertEqual(
            [(s.name, s.section) for s in built],
            [
                ("wan", "wan"),
                ("pi", "pi"),
                ("dns", "dns"),
                ("thing:Vault", None),
                ("thing:Gate cam", None),
            ],
        )
        self.assertTrue(all(isinstance(s, ThingSource) for s in built[3:]))
        self.assertEqual(built[4].settings["every_s"], 30)

    def test_a_check_that_fails_has_not_answered(self):
        config = make_config(
            {"thing": [{"name": "Gate cam", "kind": "camera", "url": "http://198.51.100.31/"}]}
        )
        (cam,) = build_sources(config)
        with mock.patch("collector.sources.things.http_answers", side_effect=RuntimeError("bug")):
            reading = cam.fetch(T0)
        self.assertEqual((reading.facts, reading.data), (None, {"answered": False}))

    def test_the_check_timeout_is_at_most_three_seconds(self):
        raw = {"thing": [{"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445}]}
        for http_timeout, expected in ((5.0, 3.0), (1.0, 1.0)):
            raw["collector"] = {"http_timeout_s": http_timeout}
            (vault,) = build_sources(make_config(raw))
            with mock.patch("collector.sources.things.tcp_any", return_value=True) as check:
                self.assertEqual(vault.fetch(T0).data, {"answered": True})
            check.assert_called_once_with("192.0.2.40", [445], expected, False)


if __name__ == "__main__":
    unittest.main()
