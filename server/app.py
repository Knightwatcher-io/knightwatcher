"""The bundled server: the page, the collector's output and the shared settings, over plain HTTP.

It serves five things and nothing else:

  - the page, the files of web/ as the image holds them (stamped with their version by
    server/stamp.py), read into memory once at start, so that an address is looked up by name and
    can never reach a file outside them;
  - the collector's output, from its folder mounted read-only: data/state.json, and the packs it
    downloaded in data/packs/, each by a plain name;
  - the shared settings at api/settings: GET gives them, PUT replaces one or more sections (see
    server/store.py);
  - the admin page's API under api/admin/, behind the admin password (see server/admin.py); the
    admin page itself is one of the page's files, at admin/;
  - api/displays, where each page posts its random id now and then, so that the collector can
    count the displays seen lately (see server/displays.py); the ids are never served.

No directory is ever listed. GET and HEAD are answered everywhere but api/displays, PUT at
api/settings alone, POST at api/displays and POST and PATCH at the admin addresses that take them,
and every other method is refused. A write must
be JSON, of a bounded size, and, when the browser says where it came from, come from a page of
this server's own address. docs/server.md describes the server, its API and how to run it behind a
reverse proxy.
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

from collector import displays as displays_mod
from collector import schema
from server import admin as admin_mod
from server.displays import MAX_BODY as MAX_DISPLAY_BODY
from server.displays import Displays
from server.stamp import stamp_index
from server.store import Refused, Store

# Where the image and compose.yaml put things.
WEB_DIR = "/app/web"
OUT_DIR = "/out"
DATA_DIR = "/var/lib/knightwatcher-server"
ADDRESS = "0.0.0.0"
PORT = 8080

API = "/api/settings"
MAX_BODY = 16 * 1024
# Where a page posts its display id: POST alone.
DISPLAYS = "/api/displays"
# The admin page, its API, and what a request to each may be.
ADMIN_PAGE = "/admin"
ADMIN_API = "/api/admin/"
MAX_ADMIN_BODY = 64 * 1024
_ADMIN_METHODS = {
    "/api/admin/state": "GET, HEAD",
    "/api/admin/sign-in": "POST",
    "/api/admin/sign-out": "POST",
    "/api/admin/settings": "GET, HEAD, PATCH",
    "/api/admin/reset": "POST",
    "/api/admin/export": "GET, HEAD",
    "/api/admin/schema": "GET, HEAD",
}
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
_ALWAYS_ASK = {"/", "/index.html", "/version.json", "/admin/", "/admin/index.html"}
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
    if "/admin/index.html" in files:
        if "/version.json" in files:
            # A stamped copy: the admin page's addresses carry the version as the page's do.
            version = json.loads(files["/version.json"][0])["version"]
            text = files["/admin/index.html"][0].decode("utf-8")
            data = stamp_index(text, version).encode("utf-8")
            files["/admin/index.html"] = (data, TYPES[".html"], _etag(data))
        files["/admin/"] = files["/admin/index.html"]
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

    # What a refused write is logged as; None logs nothing, as for a display's post, which anyone
    # on the LAN can send.
    refused_as: str | None = "settings not saved"

    def _refuse(self, status: int, problems: list[str], headers: dict | None = None) -> None:
        """A refused write, with the reason in the words the page shows after "Not saved: "."""
        if self.refused_as:
            log.warning("%s (%d): %s", self.refused_as, status, "; ".join(problems))
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
        elif address == DISPLAYS:
            self._not_allowed(address)
        elif address == ADMIN_PAGE and "/admin/" in self.server.web:
            # The page's own addresses are relative, so it is served from /admin/.
            self._send(302, b"", TYPES[".txt"], {"Location": "admin/", "Cache-Control": "no-cache"})
        elif address.startswith(ADMIN_API):
            self._admin(address)
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

    def _body(self, limit: int, what: str = "the settings"):
        """The JSON body of a write, or _NO_BODY once a refusal has been sent: a browser's
        write from a page at another address, a type other than JSON, no Content-Length, a body
        over limit bytes or one that is not JSON."""
        length = self.headers.get("Content-Length")
        chunked = self.headers.get("Transfer-Encoding") is not None
        size = int(length) if length is not None and length.isdigit() and not chunked else None
        raw = b""
        if size is not None and size <= MAX_DRAIN:
            raw = self.rfile.read(size)
        else:
            # The body, if any, is not read, so the connection is not used again.
            self.close_connection = True
        if not self._same_origin():
            self._refuse(403, ["a page from another address may not change the settings"])
            return _NO_BODY
        ctype = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            self._refuse(415, [f"{what} are sent as application/json"])
            return _NO_BODY
        if length is None or chunked:
            self._refuse(411, [f"send {what} with a Content-Length"])
            return _NO_BODY
        if size is None:
            self._refuse(400, ["the Content-Length is not a number"])
            return _NO_BODY
        if size > limit:
            self._refuse(413, [f"{what} are larger than {limit} bytes"])
            return _NO_BODY
        try:
            return json.loads(raw.decode("utf-8"), parse_constant=_no_constant)
        except (UnicodeDecodeError, ValueError):
            self._refuse(400, ["the body is not JSON"])
            return _NO_BODY

    def _same_origin(self) -> bool:
        """Whether a write may come from where the browser says it does: not from a page at
        another address. A request with no Origin, such as one from curl, is not a browser's."""
        origin = self.headers.get("Origin")
        return self.headers.get("Sec-Fetch-Site") != "cross-site" and (
            origin is None or same_origin(origin, self.headers.get("Host"))
        )

    def do_PUT(self) -> None:
        address = _address(self.path)
        if address != API:
            self._not_allowed(address)
            return
        body = self._body(MAX_BODY)
        if body is _NO_BODY:
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

    # ---- The admin page's API ----------------------------------------------------------------

    def _secure(self) -> bool:
        """Whether the browser reached the server over HTTPS, as a reverse proxy in front says."""
        return self.headers.get("X-Forwarded-Proto", "").strip().lower() == "https"

    def _session(self) -> tuple[bool, dict]:
        """(whether the request carries a live session, the headers that renew its cookie)."""
        token = admin_mod.token_of(self.headers.get("Cookie"))
        live, renew = self.server.admin.gate.check(token)
        if live and renew:
            return True, {"Set-Cookie": admin_mod.cookie(token, self._secure())}
        return live, {}

    def _admin(self, address: str) -> None:
        """A request under /api/admin/: see docs/server.md for each."""
        admin = self.server.admin
        method = "GET" if self.command == "HEAD" else self.command
        allowed = _ADMIN_METHODS.get(address)
        if allowed is None:
            self._drain()
            self._not_found()
            return
        if method not in allowed.split(", "):
            self._drain()
            self.close_connection = True
            self._send(
                405,
                b"Method not allowed\n",
                TYPES[".txt"],
                {"Allow": allowed, "Cache-Control": "no-store"},
            )
            return
        gate = admin.gate if admin is not None else None
        off = gate.off if gate is not None else "the admin page is off: this server has none"
        if address == "/api/admin/state":
            live = False if off else self._session()[0]
            state = {"on": off is None, "signed_in": live}
            if off:
                state["error"] = off
            elif not live and gate.paused_s():
                state["paused_s"] = gate.paused_s()
            self._json(200, state)
            return
        if off:
            self._drain()
            self._json(503, {"error": off})
            return
        if address == "/api/admin/sign-in":
            body = self._body(4096, "the password")
            if body is _NO_BODY:
                return
            given = body.get("password") if isinstance(body, dict) else None
            status, answer, token = gate.sign_in(given)
            if token is None:
                self._json(status, answer)
                return
            headers = {"Set-Cookie": admin_mod.cookie(token, self._secure())}
            self._send(204, b"", TYPES[".txt"], {"Cache-Control": "no-store", **headers})
            return
        if address == "/api/admin/sign-out":
            self._drain()
            if not self._same_origin():
                self._refuse(403, ["a page from another address may not change the settings"])
                return
            gate.sign_out(admin_mod.token_of(self.headers.get("Cookie")))
            headers = {"Set-Cookie": admin_mod.cookie("", self._secure(), 0)}
            self._send(204, b"", TYPES[".txt"], {"Cache-Control": "no-store", **headers})
            return
        live, renew = self._session()
        if not live:
            self._drain()
            self._json(401, {"error": "sign in first"})
            return
        if method == "GET":
            self._admin_read(address, renew)
            return
        body = self._body(MAX_ADMIN_BODY)
        if body is _NO_BODY:
            return
        try:
            answer = admin.reset_all() if address == "/api/admin/reset" else admin.change(body)
        except admin_mod.Refused as exc:
            self._refuse(400, exc.problems, renew)
            return
        except OSError as exc:
            log.error("admin settings: cannot write %s: %s", admin.folder, exc.strerror)
            self._refuse(500, [f"the server cannot write its settings file ({exc.strerror})"])
            return
        self._json(200, answer, renew)

    def _admin_read(self, address: str, headers: dict) -> None:
        admin = self.server.admin
        if address == "/api/admin/settings":
            self._json(200, admin.answer(), headers)
        elif address == "/api/admin/schema":
            data = json.dumps(schema.SCHEMA, ensure_ascii=False).encode("utf-8")
            self._send(
                200,
                data,
                "application/json; charset=utf-8",
                {"Cache-Control": "no-store", **headers},
            )
        else:
            data = admin.export().encode("utf-8")
            self._send(
                200,
                data,
                TYPES[".txt"],
                {
                    "Cache-Control": "no-store",
                    "Content-Disposition": 'attachment; filename="config.toml"',
                    **headers,
                },
            )

    def _drain(self) -> None:
        """Reads and drops a small body, so the connection can be used again; a larger one, or
        one of unknown length, closes it."""
        length = self.headers.get("Content-Length")
        chunked = self.headers.get("Transfer-Encoding") is not None
        if not chunked and length is not None and length.isdigit() and int(length) <= MAX_DRAIN:
            self.rfile.read(int(length))
        elif chunked or length is not None:
            self.close_connection = True

    def _not_allowed(self, address: str | None = None) -> None:
        if address is None:
            address = _address(self.path)
        allow = {API: "GET, HEAD, PUT", DISPLAYS: "POST"}.get(address, "GET, HEAD")
        self.close_connection = True
        self._send(
            405,
            b"Method not allowed\n",
            TYPES[".txt"],
            {"Allow": allow, "Cache-Control": "no-store"},
        )

    def do_POST(self) -> None:
        address = _address(self.path)
        if address == DISPLAYS:
            self._display()
        elif address is not None and address.startswith(ADMIN_API):
            self._admin(address)
        else:
            self._not_allowed(address)

    def do_PATCH(self) -> None:
        address = _address(self.path)
        if address is not None and address.startswith(ADMIN_API):
            self._admin(address)
        else:
            self._not_allowed(address)

    # ---- Displays ----------------------------------------------------------------------------

    def _display(self) -> None:
        """A page says it is showing: {"id": "<32 hex>"}, kept as seen now and answered 204.
        Nothing else is read or kept, and nothing is logged, for a post taken or refused."""
        self.refused_as = None
        body = self._body(MAX_DISPLAY_BODY, "display ids")
        if body is _NO_BODY:
            return
        if not isinstance(body, dict) or set(body) != {"id"} or not displays_mod.is_id(body["id"]):
            self._refuse(400, ['send {"id": ...} with 32 lowercase hexadecimal characters'])
            return
        self.server.displays.seen(body["id"])
        self._send(204, b"", TYPES[".txt"], {"Cache-Control": "no-store"})

    def do_DELETE(self) -> None:
        address = _address(self.path)
        if address is not None and address.startswith(ADMIN_API):
            self._admin(address)
        else:
            self._not_allowed(address)

    do_OPTIONS = do_TRACE = do_CONNECT = do_DELETE


# What _body gives once it has refused a write.
_NO_BODY = object()


def _no_constant(name: str):
    raise ValueError(f"{name} is not JSON")


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        address: tuple[str, int],
        web: dict,
        out: str,
        store: Store,
        admin: admin_mod.Admin | None = None,
        displays: Displays | None = None,
    ):
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        self.web, self.out, self.store, self.admin = web, out, store, admin
        self.displays = displays if displays is not None else Displays(store.folder)
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
    p.add_argument(
        "--config",
        default=admin_mod.CONFIG_PATH,
        help="config.toml, read for the admin page's checks (default %(default)s)",
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
    # The admin password is read once and taken out of the environment, so that nothing this
    # process starts could inherit it. It is never logged.
    gate = admin_mod.Gate(os.environ.pop(admin_mod.PASSWORD_VARIABLE, None), folder=args.data)
    admin = admin_mod.Admin(args.data, args.out, args.config, gate, store)
    if gate.off:
        log.info("%s; the walls are not affected", gate.off)
    try:
        httpd = Server((args.address, args.port), web, args.out, store, admin)
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
        httpd.displays.close()
        httpd.server_close()
    return 0
