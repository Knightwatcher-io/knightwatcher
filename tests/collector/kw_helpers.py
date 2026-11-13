"""Shared helpers for the collector tests. Every address and name here is invented."""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from collector.config import build

# Keep expected warnings out of the test output; assertLogs still sees them.
logging.getLogger("collector").addHandler(logging.NullHandler())

T0 = dt.datetime(2026, 1, 15, 21, 0, 0, tzinfo=dt.UTC)


def at(seconds: float) -> dt.datetime:
    return T0 + dt.timedelta(seconds=seconds)


def make_config(raw: dict | None = None, secrets: dict | None = None):
    raw = raw or {}
    return build(raw, secrets if secrets is not None else {})


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
        os.makedirs(os.path.join(self.root, "net"))
        self.set_stat(1000, 9000, cores=4)
        self.set_meminfo(total_kb=16_000_000, available_kb=8_000_000)
        self.write("loadavg", "1.50 1.20 1.00 2/300 12345\n")
        self.write("locks", "")
        self.write("net/tcp", self.TCP_HEADER)
        self.write("net/tcp6", self.TCP_HEADER)

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


class FakeHttp:
    """A local HTTP server answering from a routes table: path -> (status, body or callable)."""

    def __init__(self):
        self.routes: dict[str, tuple[int, object]] = {}
        self.requests: list[tuple[str, dict]] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.requests.append((self.path, dict(self.headers)))
                path = self.path.split("?", 1)[0]
                status, body = outer.routes.get(path, (404, {"error": "not found"}))
                if callable(body):
                    body = body(self)
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
        )
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
