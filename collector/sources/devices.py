"""Devices: one source per device, each answering yes or no to one reachability check.

A check is a TCP connection to any of up to three ports, or one GET to a web address that counts
any HTTP status as an answer. ICMP would need a capability the container does not have.

A device's source never raises: any failure inside the check is no answer. The only readings it
can lack are the first one, while that check is still running, and one that ran out of time,
which the conditions count as silence.
"""

from __future__ import annotations

import logging

from collector.net import http_answers, tcp_any
from collector.sources import Reading, Source

log = logging.getLogger("collector")

# The most a check may take for each of its steps, below http_timeout_s when that is shorter.
CHECK_TIMEOUT_S = 3.0


class DeviceSource(Source):
    """One device. The Pi of [sources.pi] is one too, named `pi` with facts `pi`."""

    def __init__(self, device: dict, config):
        super().__init__(device, config)
        self.name = device["source"]
        self.section = "pi" if device["legacy"] else None

    def fetch(self, now):
        t = self.settings
        timeout = min(CHECK_TIMEOUT_S, self.timeout)
        try:
            if t["url"]:
                answered = http_answers(t["url"], timeout, t["verify_tls"])
            else:
                answered = tcp_any(t["host"], t["ports"], timeout, t["refused_counts"])
        except Exception as exc:  # noqa: BLE001 - a check that fails has not answered
            log.debug("source %s: check failed (%s)", self.name, type(exc).__name__)
            answered = False
        return Reading({"up": answered} if self.section else None, {"answered": answered})
