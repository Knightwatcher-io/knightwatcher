"""The bundled server: the page, the collector's output and the shared settings, over plain HTTP.

It serves three things and nothing else:

  - the page, the files of web/ as the image holds them (stamped with their version by
    server/stamp.py), read into memory once at start, so that an address is looked up by name and
    can never reach a file outside them;
  - the collector's output, from its folder mounted read-only: data/state.json, and the packs it
    downloaded in data/packs/, each by a plain name;
  - the shared settings at api/settings: GET gives them, PUT replaces one or more sections (see
    server/store.py).

No directory is ever listed. GET and HEAD are answered everywhere, PUT at api/settings alone, and
every other method is refused. A write must be JSON, at most MAX_BODY bytes, and, when the browser
says where it came from, come from a page of this server's own address. docs/server.md describes
the server, its API and how to run it behind a reverse proxy.
"""

from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import logging
import os
import re
import signal
import socket
import stat
import sys
import time
import urllib.parse
import urllib.request

from server.store import Refused, Store

# Where the image and compose.yaml put things.
WEB_DIR = "/app/web"
OUT_DIR = "/out"
DATA_DIR = "/var/lib/knightwatcher-server"
ADDRESS = "0.0.0.0"
PORT = 8080

API = "/api/settings"
MAX_BODY = 16 * 1024
# The most the server reads of one file of the collector's output.
MAX_DATA = 4 * 1024 * 1024
# A refused write's body is read and dropped up to this size, so that the answer reaches the
# client and the connection can be used again; a larger one closes the connection.
MAX_DRAIN = 1024 * 1024
# A plain file name in data/packs/: no folder, no leading dot.
_PACK_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}
# The files the page reads to find out about itself: never kept by a cache without asking.
_ALWAYS_ASK = {"/", "/index.html", "/version.json"}
# Sent with every answer.
_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "object-src 'none'; base-uri 'none'; form-action 'none'"
    ),
}

log = logging.getLogger("server")


def _etag(data: bytes) -> str:
    return '"' + hashlib.sha256(data).hexdigest()[:20] + '"'


def load_web(folder: str) -> dict[str, tuple[bytes, str, str]]:
    """Every file of the page, by its address: (bytes, content type, entity tag). The page's
    address, /, is index.html. A file whose type is not in TYPES, a name starting with a dot, a
    link and the data/ folder are left out."""
    files: dict[str, tuple[bytes, str, str]] = {}
    for here, dirs, names in os.walk(folder):
        rel = os.path.relpath(here, folder)
        dirs[:] = [d for d in dirs if not d.startswith(".") and not (rel == "." and d == "data")]
        for name in names:
            full = os.path.join(here, name)
            ext = os.path.splitext(name)[1].lower()
            if name.startswith(".") or ext not in TYPES or os.path.islink(full):
                continue
            with open(full, "rb") as fh:
                data = fh.read()
            address = "/" + os.path.relpath(full, folder).replace(os.sep, "/")
            files[address] = (data, TYPES[ext], _etag(data))
    if "/index.html" not in files:
        raise FileNotFoundError(f"{folder}/index.html not found")
    files["/"] = files["/index.html"]
    return files


def read_data(out: str, address: str) -> tuple[bytes, str] | None:
    """A file of the collector's output for an address under /data/, or None. Only state.json and
    a .json file by a plain name in packs/ are served; a link, a folder or a file larger than
    MAX_DATA is not."""
    if address == "/data/state.json":
        path = os.path.join(out, "state.json")
    elif address.startswith("/data/packs/"):
        name = address[len("/data/packs/") :]
        if not _PACK_NAME.fullmatch(name) or not name.endswith(".json"):
            return None
        path = os.path.join(out, "packs", name)
    else:
        return None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_DATA:
            return None
        with os.fdopen(fd, "rb", closefd=False) as fh:
            data = fh.read(MAX_DATA + 1)
    finally:
        os.close(fd)
    if len(data) > MAX_DATA:
        return None
    return data, TYPES[".json"]


def _address(target: str) -> str | None:
    """The path of a request's target, decoded, or None when it holds a dot segment, a backslash
    or a NUL, so that no form of ../ reaches a lookup."""
    try:
        path = urllib.parse.urlsplit(target).path
    except ValueError:
        return None
    if not path.startswith("/"):
        return None
    path = urllib.parse.unquote(path, errors="strict")
    if "\x00" in path or "\\" in path:
        return None
    if any(seg in (".", "..") for seg in path.split("/")):
        return None
    return path


def same_origin(origin: str, host: str | None) -> bool:
    """Whether a request's Origin header names the address the request was sent to, its Host
    header. The scheme is not compared, since a reverse proxy in front may end TLS; a port the
    scheme implies is dropped before comparing."""
    if not host:
        return False
    try:
        parts = urllib.parse.urlsplit(origin)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https") or not parts.netloc or "@" in parts.netloc:
        return False
    implied = {"http": ":80", "https": ":443"}[parts.scheme]

    def bare(netloc: str) -> str:
        netloc = netloc.lower()
        for suffix in (implied, ":80", ":443"):
            if netloc.endswith(suffix):
                return netloc[: -len(suffix)]
        return netloc

    return bare(parts.netloc) == bare(host.strip())


class Handler(http.server.BaseHTTPRequestHandler):
    """One request. The server object carries web (the page's files), out (the collector's
    folder) and store (the shared settings)."""

    server_version = "Knightwatcher"
    protocol_version = "HTTP/1.1"
    # A connection that sends nothing for this long is closed.
    timeout = 15

    def version_string(self) -> str:
        return self.server_version

    # ---- Answers ---------------------------------------------------------------------------

    def _send(self, status: int, body: bytes, ctype: str, headers: dict | None = None) -> None:
        self.send_response(status)
        for k, v in {**_HEADERS, **(headers or {})}.items():
            self.send_header(k, v)
        if body or status not in (204, 304):
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD" and status != 304:
            self.wfile.write(body)

    def _json(self, status: int, payload: dict, headers: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(
            status,
            body,
            "application/json; charset=utf-8",
            {"Cache-Control": "no-store", **(headers or {})},
        )

    def _refuse(self, status: int, problems: list[str], headers: dict | None = None) -> None:
        """A refused write, with the reason in the words the page shows after "Not saved: "."""
        log.warning("settings not saved (%d): %s", status, "; ".join(problems))
        self._json(status, {"error": problems[0], "problems": problems}, headers)

    def _not_found(self) -> None:
        self._send(404, b"Not found\n", TYPES[".txt"], {"Cache-Control": "no-store"})

    def _fresh(self, etag: str) -> bool:
        """Whether the request's If-None-Match names this entity tag, so a 304 will do."""
        given = self.headers.get("If-None-Match", "")
        return (
            any(t.strip() in (etag, "W/" + etag, "*") for t in given.split(",")) if given else False
        )

    def _file(self, data: bytes, ctype: str, cache: str) -> None:
        tag = _etag(data)
        headers = {"Cache-Control": cache, "ETag": tag}
        if self._fresh(tag):
            self._send(304, b"", ctype, headers)
        else:
            self._send(200, data, ctype, headers)

    def log_message(self, format, *args):
        # Answers are not logged one by one: a display asks every five seconds. Refused writes
        # and saves are logged where they happen, and errors through log_error.
        pass

    def log_error(self, format, *args):
        # A browser keeps spare connections open; closing one after `timeout` idle seconds is
        # routine, not an error.
        if format.startswith("Request timed out"):
            return
        log.warning("request: " + format, *args)

    # ---- Reading -----------------------------------------------------------------------------

    def do_GET(self) -> None:
        address = _address(self.path)
        if address is None:
            self._not_found()
        elif address == API:
            body, tag = self.server.store.get()
            headers = {"Cache-Control": "no-cache", "ETag": tag}
            if self._fresh(tag):
                self._send(304, b"", "application/json; charset=utf-8", headers)
            else:
                self._send(200, body, "application/json; charset=utf-8", headers)
        elif address.startswith("/data/"):
            found = read_data(self.server.out, address)
            if found is None:
                self._not_found()
            else:
                self._file(found[0], found[1], "no-cache")
        elif address in self.server.web:
            data, ctype, _ = self.server.web[address]
            query = urllib.parse.urlsplit(self.path).query
            versioned = address not in _ALWAYS_ASK and urllib.parse.parse_qs(query).get("v")
            self._file(
                data, ctype, "public, max-age=31536000, immutable" if versioned else "no-cache"
            )
        else:
            self._not_found()

    do_HEAD = do_GET

    # ---- Writing -----------------------------------------------------------------------------

    def do_PUT(self) -> None:
        address = _address(self.path)
        if address != API:
            self._not_allowed(address)
            return
        length = self.headers.get("Content-Length")
        chunked = self.headers.get("Transfer-Encoding") is not None
        size = int(length) if length is not None and length.isdigit() and not chunked else None
        raw = b""
        if size is not None and size <= MAX_DRAIN:
            raw = self.rfile.read(size)
        else:
            # The body, if any, is not read, so the connection is not used again.
            self.close_connection = True
        origin = self.headers.get("Origin")
        if self.headers.get("Sec-Fetch-Site") == "cross-site" or (
            origin is not None and not same_origin(origin, self.headers.get("Host"))
        ):
            self._refuse(403, ["a page from another address may not change the settings"])
            return
        ctype = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            self._refuse(415, ["the settings are sent as application/json"])
            return
        if length is None or chunked:
            self._refuse(411, ["send the settings with a Content-Length"])
            return
        if size is None:
            self._refuse(400, ["the Content-Length is not a number"])
            return
        if size > MAX_BODY:
            self._refuse(413, [f"the settings are larger than {MAX_BODY} bytes"])
            return
        try:
            body = json.loads(raw.decode("utf-8"), parse_constant=_no_constant)
        except (UnicodeDecodeError, ValueError):
            self._refuse(400, ["the body is not JSON"])
            return
        try:
            saved, tag = self.server.store.put(body)
        except Refused as exc:
            self._refuse(400, exc.problems)
            return
        except OSError as exc:
            log.error("settings: cannot write %s: %s", self.server.store.path, exc.strerror)
            self._refuse(500, [f"the server cannot write its settings file ({exc.strerror})"])
            return
        log.info("settings saved: %s", ", ".join(k for k in body if k != "v"))
        headers = {"Cache-Control": "no-store", "ETag": tag}
        self._send(200, saved, "application/json; charset=utf-8", headers)

    def _not_allowed(self, address: str | None = None) -> None:
        if address is None:
            address = _address(self.path)
        allow = "GET, HEAD, PUT" if address == API else "GET, HEAD"
        self.close_connection = True
        self._send(
            405,
            b"Method not allowed\n",
            TYPES[".txt"],
            {"Allow": allow, "Cache-Control": "no-store"},
        )

    def do_POST(self) -> None:
        self._not_allowed()

    do_DELETE = do_PATCH = do_OPTIONS = do_TRACE = do_CONNECT = do_POST


def _no_constant(name: str):
    raise ValueError(f"{name} is not JSON")


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], web: dict, out: str, store: Store):
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        self.web, self.out, self.store = web, out, store
        super().__init__(address, Handler)


def _health(port: int) -> int:
    """Exit 0 when the server on this machine answers for the page and the settings."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for path in ("/", API):
        try:
            with opener.open(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
                if r.status != 200:
                    print(f"unhealthy: {path} answered {r.status}", file=sys.stderr)
                    return 1
                if path == API and json.loads(r.read()).get("v") != 1:
                    print(f"unhealthy: {path} is not version 1", file=sys.stderr)
                    return 1
        except (OSError, ValueError) as exc:
            print(f"unhealthy: {path}: {exc}", file=sys.stderr)
            return 1
    return 0


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="server", description="Knightwatcher server")
    p.add_argument("--web", default=WEB_DIR, help="the page's files (default %(default)s)")
    p.add_argument(
        "--out", default=OUT_DIR, help="the collector's output folder (default %(default)s)"
    )
    p.add_argument("--data", default=DATA_DIR, help="the server's own folder (default %(default)s)")
    p.add_argument(
        "--address", default=ADDRESS, help="the address to listen on (default %(default)s)"
    )
    p.add_argument(
        "--port", type=int, default=PORT, help="the port to listen on (default %(default)s)"
    )
    p.add_argument("--health", action="store_true", help="exit 1 unless the server answers")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.health:
        return _health(args.port)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        stream=sys.stderr,
    )
    logging.Formatter.converter = time.gmtime
    try:
        web = load_web(args.web)
    except OSError as exc:
        print(f"server: the page: {exc}", file=sys.stderr)
        return 2
    if not os.path.isdir(args.data) or not os.access(args.data, os.W_OK):
        print(
            f"server: {args.data} is not a writable folder; it must exist and be writable by "
            "the server's account",
            file=sys.stderr,
        )
        return 2
    store = Store(args.data)
    try:
        httpd = Server((args.address, args.port), web, args.out, store)
    except OSError as exc:
        print(
            f"server: cannot listen on {args.address}:{args.port}: {exc.strerror}", file=sys.stderr
        )
        return 2

    def _stop(signum, _frame):
        log.info("stopping on signal %d", signum)
        raise SystemExit(0)

    # As PID 1 in a container, a signal without a handler is ignored.
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    version = (
        json.loads(web["/version.json"][0]).get("version") if "/version.json" in web else "dev"
    )
    log.info(
        "server started on %s:%d: page %s, %d files", args.address, args.port, version, len(web) - 1
    )
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
    return 0
