"""Shared helpers for the collector tests. Every address and name here is invented."""

from __future__ import annotations

import atexit
import datetime as dt
import json
import logging
import os
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from collector.config import build

# Keep expected warnings out of the test output; assertLogs still sees them.
logging.getLogger("collector").addHandler(logging.NullHandler())

T0 = dt.datetime(2026, 1, 15, 21, 0, 0, tzinfo=dt.UTC)


def at(seconds: float) -> dt.datetime:
    return T0 + dt.timedelta(seconds=seconds)


def make_config(raw: dict | None = None, env: dict | None = None):
    """A config built from raw, with the credentials in env (environment variables)."""
    raw = raw or {}
    return build(raw, env if env is not None else {})


class Clock:
    def __init__(self, start: dt.datetime = T0):
        self.now = start

    def __call__(self) -> dt.datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += dt.timedelta(seconds=seconds)


class FakeProc:
    """A folder laid out like the parts of /proc the collector reads."""

    def __init__(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name
        os.makedirs(os.path.join(self.root, "1", "net"))
        self.set_stat(1000, 9000, cores=4)
        self.set_meminfo(total_kb=16_000_000, available_kb=8_000_000)
        self.write("loadavg", "1.50 1.20 1.00 2/300 12345\n")
        self.write("locks", "")
        self.write("1/net/tcp", self.TCP_HEADER)
        self.write("1/net/tcp6", self.TCP_HEADER)

    TCP_HEADER = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt\n"

    def write(self, rel: str, content: str) -> None:
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="ascii") as fh:
            fh.write(content)

    def set_stat(self, busy: int, idle: int, cores: int = 4) -> None:
        # user nice system idle iowait irq softirq steal guest guest_nice
        line = f"cpu  {busy} 0 0 {idle} 0 0 0 0 0 0\n"
        per = "".join(f"cpu{i} 1 0 0 1 0 0 0 0 0 0\n" for i in range(cores))
        self.write("stat", line + per + "intr 0\n")

    def set_meminfo(self, total_kb: int, available_kb: int, swap_total=8_000_000, swap_free=0):
        self.write(
            "meminfo",
            f"MemTotal:       {total_kb} kB\n"
            f"MemFree:        1000 kB\n"
            f"MemAvailable:   {available_kb} kB\n"
            f"SwapTotal:      {swap_total} kB\n"
            f"SwapFree:       {swap_free} kB\n",
        )

    def cleanup(self) -> None:
        self._tmp.cleanup()


_self_signed: tuple[str | None, str] | None = None


def self_signed() -> str:
    """A self-signed certificate and its key in one file, for 127.0.0.1 and an invented name.

    Made with openssl once per test run, in a temporary folder that is removed at exit, so that
    no key is ever kept in the repository. Skips the calling test when openssl is missing or fails.
    """
    global _self_signed
    if _self_signed is None:
        _self_signed = _make_self_signed()
    path, why = _self_signed
    if path is None:
        raise unittest.SkipTest(why)
    return path


def _make_self_signed() -> tuple[str | None, str]:
    openssl = shutil.which("openssl")
    if openssl is None:
        return None, "openssl not found; it makes the certificate for the TLS tests"
    folder = tempfile.mkdtemp(prefix="kw-tls-")
    atexit.register(shutil.rmtree, folder, True)
    key, cert = os.path.join(folder, "key.pem"), os.path.join(folder, "cert.pem")
    try:
        subprocess.run(
            [openssl, "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
             "-nodes", "-days", "2", "-subj", "/CN=camera.example.com",
             "-addext", "subjectAltName=DNS:camera.example.com,IP:127.0.0.1",
             "-keyout", key, "-out", cert],
            check=True, capture_output=True, timeout=30,
        )  # fmt: skip
    except (OSError, subprocess.SubprocessError) as exc:
        return None, f"openssl could not make a certificate ({type(exc).__name__})"
    both = os.path.join(folder, "selfsigned.pem")
    with open(both, "w", encoding="ascii") as out:
        for part in (cert, key):
            with open(part, encoding="ascii") as fh:
                out.write(fh.read())
    return both, ""


class FakeHttp:
    """A local HTTP server answering from a routes table: path -> (status, body or callable).

    A GET is answered from the route of its path with its query, when there is one, else from the
    route of its path alone; a POST or a DELETE from the route of "POST <path>" or
    "DELETE <path>" alone. requests holds each GET as (path, headers), and calls
    every request as (method, path, headers, the body parsed as JSON or None). A body of None is
    sent as no body at all, as a 204 is.

    With tls true it serves https with a self-signed certificate, and skips the calling test
    when that cannot be made.
    """

    def __init__(self, tls: bool = False):
        self.routes: dict[str, tuple[int, object]] = {}
        self.requests: list[tuple[str, dict]] = []
        self.calls: list[tuple[str, str, dict, object]] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def answer(self, method):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                sent = json.loads(raw) if raw else None
                outer.calls.append((method, self.path, dict(self.headers), sent))
                path = self.path.split("?", 1)[0]
                if method == "GET":
                    outer.requests.append((self.path, dict(self.headers)))
                    route = outer.routes.get(self.path) or outer.routes.get(path)
                else:
                    route = outer.routes.get(f"{method} {path}")
                status, body = route or (404, {"error": "not found"})
                if callable(body):
                    body = body(self)
                self.send_response(status)
                if body is None:
                    self.end_headers()
                    return
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                kind = "text/html" if isinstance(body, bytes) else "application/json"
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                self.answer("GET")

            def do_POST(self):
                self.answer("POST")

            def do_DELETE(self):
                self.answer("DELETE")

            def log_message(self, *args):
                pass

        cert = self_signed() if tls else None
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        # A check closes once it has the status line, and the reset that leaves is expected.
        self.server.handle_error = lambda request, client_address: None
        scheme = "http"
        if tls:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert)
            self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
            scheme = "https"
        self.url = f"{scheme}://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
        )
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


def listener(backlog: int = 16) -> socket.socket:
    """A socket on 127.0.0.1 that accepts connections and never answers on them."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen(backlog)
    return sock


def unanswering() -> tuple[socket.socket, list[socket.socket]]:
    """A listening socket whose queue is full, so a new connection to it hangs until it times out.

    Returns the listener and the connection that fills its queue; close both when done.
    """
    sock = listener(0)
    filler = socket.create_connection(sock.getsockname(), timeout=1)
    return sock, [filler]


def closed_port() -> int:
    """A port on 127.0.0.1 that nothing listens on, so a connection to it is refused."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port
