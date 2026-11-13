"""DNS: one A query to the configured server, built by hand so no system resolver is involved."""

from __future__ import annotations

from collector.net import SourceError, dns_query
from collector.sources import Reading, Source

# NOERROR and NXDOMAIN both mean the server answered.
_ANSWERED = {0, 3}


class DnsSource(Source):
    name = "dns"
    section = "dns"

    def fetch(self, now):
        s = self.settings
        try:
            rcode = dns_query(s["server"], s["port"], s["name"], self.timeout)
        except SourceError as exc:
            return Reading({"up": False}, {"error": str(exc)})
        return Reading({"up": rcode in _ANSWERED}, {"rcode": rcode})
