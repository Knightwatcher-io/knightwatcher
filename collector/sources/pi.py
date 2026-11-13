"""The second machine: up when it answers a TCP connection on any configured port.

A refused connection counts as an answer. ICMP would need a capability the container does not
have.
"""

from __future__ import annotations

from collector.net import tcp_reachable
from collector.sources import Reading, Source


class PiSource(Source):
    name = "pi"
    section = "pi"

    def fetch(self, now):
        host = self.settings["host"]
        timeout = min(3.0, self.timeout)
        up = any(tcp_reachable(host, port, timeout) for port in self.settings["ports"])
        return Reading({"up": up})
