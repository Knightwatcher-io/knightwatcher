"""Open SSH sessions: established TCP connections to the SSH port, from the host's own table.

The container shares the host's network namespace, so /proc/net/tcp is the host's table.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import struct

from collector.sources import Reading, Source, SourceError

ESTABLISHED = "01"


def decode_address(hex_addr: str) -> str:
    """Turn the hex form in /proc/net/tcp{,6} into an address string."""
    raw = bytes.fromhex(hex_addr)
    # The kernel prints each 32-bit word in host byte order.
    words = [
        struct.pack("<I", int.from_bytes(raw[i : i + 4], "big")) for i in range(0, len(raw), 4)
    ]
    packed = b"".join(words)
    if len(packed) == 4:
        return socket.inet_ntop(socket.AF_INET, packed)
    addr = ipaddress.IPv6Address(packed)
    return str(addr.ipv4_mapped) if addr.ipv4_mapped else str(addr)


def sessions(path: str, port: int) -> list[str]:
    """Remote addresses of established connections whose local port is `port`."""
    out = []
    try:
        with open(path, encoding="ascii") as fh:
            next(fh, None)
            for line in fh:
                fields = line.split()
                if len(fields) < 4 or fields[3] != ESTABLISHED:
                    continue
                local, remote = fields[1], fields[2]
                if int(local.rsplit(":", 1)[1], 16) != port:
                    continue
                out.append(decode_address(remote.rsplit(":", 1)[0]))
    except FileNotFoundError:
        return []
    return out


class SshSource(Source):
    name = "ssh"
    section = "ssh"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        self.net = os.path.join(config.collector["proc_root"], "net")
        self.ignore = [ipaddress.ip_network(n, strict=False) for n in settings["ignore_sources"]]

    def _kept(self, addr: str) -> bool:
        ip = ipaddress.ip_address(addr)
        return not any(ip in net for net in self.ignore if net.version == ip.version)

    def fetch(self, now):
        port = self.settings["port"]
        try:
            remotes = sessions(os.path.join(self.net, "tcp"), port)
            remotes += sessions(os.path.join(self.net, "tcp6"), port)
        except OSError as exc:
            raise SourceError(f"cannot read the connection table ({exc.strerror})") from None
        except (ValueError, IndexError):
            raise SourceError("unexpected connection table format") from None
        remotes = [r for r in remotes if self._kept(r)]
        return Reading({"count": len(remotes), "sources": sorted(set(remotes))})
