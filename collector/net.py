"""Network helpers with short timeouts and errors that never carry a URL or a credential."""

from __future__ import annotations

import base64
import json
import socket
import ssl
import struct
import urllib.error
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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(
    _NoRedirect,
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
)


def basic_auth(username: str, password: str) -> dict[str, str]:
    # Sent with the first request. urllib's own handler would send an unauthenticated request
    # first and retry, and a retry loop is what locks an account out.
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def fetch(url: str, timeout: float, headers: dict[str, str] | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "knightwatcher", **(headers or {})})
    try:
        with _opener.open(req, timeout=timeout) as resp:
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


def tcp_reachable(host: str, port: int, timeout: float) -> bool:
    """True when the host answers on the port, whether it accepts or refuses the connection."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except ConnectionRefusedError:
        return True
    except OSError:
        return False


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
