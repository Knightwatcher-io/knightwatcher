"""Open SSH sessions: established TCP connections to the SSH port, from the host's own table.

The table is read from the host's /proc as /proc/1/net/tcp, the network namespace of the host's
first process. /proc/net resolves through /proc/self, the reader's own namespace, which is the
host's only while the container shares the host's network; /proc/1/net is the host's either
way. Each connection is reported by its remote address and port in `data`, so that the
ssh_session condition can tell a new session from one already open.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import struct

from collector.sources import Reading, Source, SourceError

ESTABLISHED = "01"


def decode_address(hex_addr: str) -> str:
    """Turn the hex form in /proc/1/net/tcp{,6} into an address string."""
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


def sessions(path: str, port: int) -> list[tuple[str, int]]:
    """Remote (address, port) of each established connection whose local port is `port`."""
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
                addr, rport = remote.rsplit(":", 1)
                out.append((decode_address(addr), int(rport, 16)))
    except FileNotFoundError:
        return []
    return out


class SshSource(Source):
    name = "ssh"
    section = "ssh"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        self.net = os.path.join(config.collector["proc_root"], "1", "net")
        self.ignore = [ipaddress.ip_network(n, strict=False) for n in settings["ignore_sources"]]

    def _kept(self, addr: str) -> bool:
        ip = ipaddress.ip_address(addr)
        return not any(ip in net for net in self.ignore if net.version == ip.version)

    def fetch(self, now):
        port = self.settings["port"]
        try:
            conns = sessions(os.path.join(self.net, "tcp"), port)
            conns += sessions(os.path.join(self.net, "tcp6"), port)
        except OSError as exc:
            raise SourceError(f"cannot read the connection table ({exc.strerror})") from None
        except (ValueError, IndexError):
            raise SourceError("unexpected connection table format") from None
        conns = sorted(c for c in conns if self._kept(c[0]))
        return Reading(
            {"count": len(conns), "sources": sorted({addr for addr, _ in conns})},
            {"conns": [[addr, rport] for addr, rport in conns]},
        )
