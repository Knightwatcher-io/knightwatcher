"""Network helpers with short timeouts and errors that never carry a URL or a credential."""

from __future__ import annotations

import base64
import errno
import json
import re
import selectors
import socket
import ssl
import struct
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

MAX_BODY = 4 * 1024 * 1024

# Statuses that mean the service refused the credentials, or is about to. A source that meets
# one is paused for the back-off period instead of trying again on the next poll.
AUTH_STATUSES = {401, 403, 429}


class SourceError(Exception):
    """A read failed. The message is short and safe to show on the page."""


class AuthError(SourceError):
    """The service refused the credentials."""


def _opener(context: ssl.SSLContext) -> urllib.request.OpenerDirector:
    """An opener for http and https alone.

    build_opener would add a proxy handler, which takes its proxy from the environment, and
    handlers for redirects, files and FTP. None of them is wanted: every request goes direct, a
    redirect is an error, and any other scheme is refused as unknown.
    """
    opener = urllib.request.OpenerDirector()
    for handler in (
        urllib.request.UnknownHandler(),
        urllib.request.HTTPHandler(),
        urllib.request.HTTPSHandler(context=context),
        urllib.request.HTTPDefaultErrorHandler(),
        urllib.request.HTTPErrorProcessor(),
    ):
        opener.add_handler(handler)
    return opener


_opener_checked = _opener(ssl.create_default_context())


def basic_auth(username: str, password: str) -> dict[str, str]:
    # Sent with the first request. urllib's own handler would send an unauthenticated request
    # first and retry, and a retry loop is what locks an account out.
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def fetch(url: str, timeout: float, headers: dict[str, str] | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "knightwatcher", **(headers or {})})
    try:
        with _opener_checked.open(req, timeout=timeout) as resp:
            body = resp.read(MAX_BODY + 1)
    except urllib.error.HTTPError as exc:
        exc.close()
        if exc.code in AUTH_STATUSES:
            raise AuthError(f"HTTP {exc.code}: credentials refused") from None
        raise SourceError(f"HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        raise SourceError(describe_os_error(exc.reason)) from None
    except TimeoutError:
        raise SourceError("timed out") from None
    except OSError as exc:
        raise SourceError(describe_os_error(exc)) from None
    if len(body) > MAX_BODY:
        raise SourceError("response too large")
    return body


def fetch_json(url: str, timeout: float, headers: dict[str, str] | None = None) -> Any:
    body = fetch(url, timeout, headers)
    try:
        return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise SourceError("response is not JSON") from None


def describe_os_error(err: object) -> str:
    if isinstance(err, (TimeoutError, socket.timeout)):
        return "timed out"
    if isinstance(err, ConnectionRefusedError):
        return "connection refused"
    if isinstance(err, ssl.SSLError):
        return "TLS error"
    if isinstance(err, socket.gaierror):
        return "name not resolved"
    if isinstance(err, OSError) and err.strerror:
        return err.strerror.lower()
    if isinstance(err, str):
        return err[:60]
    return type(err).__name__


# Name lookups in flight, one per name. The resolver takes no timeout that Python can set, so a
# lookup runs in a thread of its own and a check waits for it only as long as its timeout allows.
# A lookup that outlasts its check finishes in the background, and the next check of that name
# waits on it rather than starting another, so a resolver that hangs costs one thread per name.
_lookups: dict[str, _Lookup] = {}
_lookups_lock = threading.Lock()
# How many of a name's addresses a check tries.
MAX_ADDRESSES = 4


class _Lookup:
    def __init__(self, host: str):
        self.host = host
        self.done = threading.Event()
        self.infos: list = []
        self.error: OSError | None = None
        threading.Thread(target=self._run, name=f"lookup-{host}", daemon=True).start()

    def _run(self) -> None:
        try:
            self.infos = socket.getaddrinfo(self.host, None, type=socket.SOCK_STREAM)
        except OSError as exc:
            self.error = exc
        finally:
            self.done.set()


def resolve(host: str, timeout: float) -> list[tuple[int, tuple]]:
    """The addresses of host for TCP, as (family, sockaddr with port 0), within timeout.

    An address is used as it is, with no lookup. A name is looked up by the system's resolver,
    and a lookup that takes longer than timeout raises SourceError.
    """
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM, flags=socket.AI_NUMERICHOST)
    except socket.gaierror:
        with _lookups_lock:
            lookup = _lookups.get(host)
            if lookup is None or lookup.done.is_set():
                lookup = _lookups[host] = _Lookup(host)
        if not lookup.done.wait(timeout):
            raise SourceError("name lookup timed out") from None
        if lookup.error is not None:
            raise SourceError(describe_os_error(lookup.error)) from None
        infos = lookup.infos
    out: list[tuple[int, tuple]] = []
    for family, _type, _proto, _name, sockaddr in infos:
        if (family, sockaddr) not in out:
            out.append((family, sockaddr))
    if not out:
        raise SourceError("name not resolved")
    return out[:MAX_ADDRESSES]


_PENDING = {errno.EINPROGRESS, errno.EWOULDBLOCK, errno.EAGAIN, errno.EALREADY}


def _connect(
    addresses: list[tuple[int, tuple]], ports: list[int], timeout: float, refusal_ends=False
) -> tuple[socket.socket | None, bool]:
    """Open a TCP connection to every address and port at once, within timeout.

    Returns the first connection accepted, with every other one closed, and whether any was
    refused. With refusal_ends a refusal ends the wait at once.
    """
    deadline = time.monotonic() + timeout
    refused = False
    pending: list[socket.socket] = []
    sel = selectors.DefaultSelector()
    try:
        for family, sockaddr in addresses:
            for port in ports:
                try:
                    sock = socket.socket(family, socket.SOCK_STREAM)
                except OSError:
                    continue
                pending.append(sock)
                sock.setblocking(False)
                err = sock.connect_ex((sockaddr[0], port, *sockaddr[2:]))
                if err == 0:
                    pending.remove(sock)
                    return sock, refused
                if err in _PENDING:
                    sel.register(sock, selectors.EVENT_WRITE)
                elif err == errno.ECONNREFUSED:
                    refused = True
                    if refusal_ends:
                        return None, True
        while sel.get_map():
            left = deadline - time.monotonic()
            if left <= 0:
                break
            for key, _events in sel.select(left):
                sock = key.fileobj
                sel.unregister(sock)
                err = sock.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
                if err == 0:
                    pending.remove(sock)
                    return sock, refused
                if err == errno.ECONNREFUSED:
                    refused = True
                    if refusal_ends:
                        return None, True
        return None, refused
    finally:
        sel.close()
        for sock in pending:
            sock.close()


def tcp_any(host: str, ports: list[int], timeout: float, refused_counts: bool = False) -> bool:
    """True when the host accepts a TCP connection on any of the ports, all tried at once.

    A refused connection counts as an answer only with refused_counts. Looking up a name and
    the connections have up to timeout each; an address needs no lookup.
    """
    try:
        addresses = resolve(host, timeout)
    except SourceError:
        return False
    sock, refused = _connect(addresses, ports, timeout, refusal_ends=refused_counts)
    if sock is not None:
        sock.close()
        return True
    return refused and refused_counts


def _tls(verify: bool) -> ssl.SSLContext:
    if verify:
        return ssl.create_default_context()
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


_TLS = {True: _tls(True), False: _tls(False)}
_STATUS_LINE = re.compile(rb"^HTTP/\d(?:\.\d)? \d{3}(?:[ \r\n]|$)")
STATUS_LINE_MAX = 64


def http_answers(url: str, timeout: float, verify_tls: bool = False) -> bool:
    """True when the web address answers one GET with an HTTP status line, whatever the status.

    The request goes direct to the address, never through a proxy, carries no credentials, and
    is closed once the status line is in, without reading the body; a redirect is an answer and
    is not followed. With verify_tls false an https address must complete the TLS handshake but
    its certificate is not checked. Looking up a name, connecting, the TLS handshake and the
    status line have up to timeout each.
    """
    parts = urllib.parse.urlsplit(url)
    https = parts.scheme == "https"
    try:
        addresses = resolve(parts.hostname or "", timeout)
    except SourceError:
        return False
    sock, _refused = _connect(addresses, [parts.port or (443 if https else 80)], timeout)
    if sock is None:
        return False
    target = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
    request = (
        f"GET {target} HTTP/1.1\r\nHost: {parts.netloc}\r\nUser-Agent: knightwatcher\r\n"
        "Accept: */*\r\nConnection: close\r\n\r\n"
    ).encode("ascii")
    try:
        sock.settimeout(timeout)
        if https:
            sock = _TLS[verify_tls].wrap_socket(sock, server_hostname=parts.hostname)
        sock.sendall(request)
        line = b""
        deadline = time.monotonic() + timeout
        while b"\n" not in line and len(line) < STATUS_LINE_MAX:
            left = deadline - time.monotonic()
            if left <= 0:
                return False
            sock.settimeout(left)
            chunk = sock.recv(STATUS_LINE_MAX - len(line))
            if not chunk:
                break
            line += chunk
        return bool(_STATUS_LINE.match(line))
    except OSError:
        return False
    finally:
        sock.close()


def dns_query(server: str, port: int, name: str, timeout: float, query_id: int = 0x4B57) -> int:
    """Send one A query over UDP and return the response code (0 means it answered)."""
    qname = b"".join(bytes([len(p)]) + p.encode("ascii") for p in name.strip(".").split("."))
    packet = struct.pack(">HHHHHH", query_id, 0x0100, 1, 0, 0, 0) + qname + b"\0\0\1\0\1"
    family = socket.AF_INET6 if ":" in server else socket.AF_INET
    with socket.socket(family, socket.SOCK_DGRAM) as sock:
        sock.settimeout(timeout)
        try:
            sock.sendto(packet, (server, port))
            reply, _ = sock.recvfrom(512)
        except OSError as exc:
            raise SourceError(describe_os_error(exc)) from None
    if len(reply) < 12:
        raise SourceError("short DNS reply")
    rid, flags = struct.unpack(">HH", reply[:4])
    if rid != query_id or not flags & 0x8000:
        raise SourceError("unexpected DNS reply")
    return flags & 0x000F
