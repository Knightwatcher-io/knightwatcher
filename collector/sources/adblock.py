"""Blocked DNS queries, from AdGuard Home's statistics.

AdGuard Home locks an address out of its API after a few bad logins, so credentials go with the
first request and an auth error pauses the source (the runner's back-off) instead of retrying.
"""

from __future__ import annotations

from collector.net import basic_auth, fetch_json
from collector.sources import Reading, Source, SourceError


class AdblockSource(Source):
    name = "adblock"
    section = "adblock"

    def fetch(self, now):
        secret = self.config.secret(self.name)
        headers = basic_auth(secret["username"], secret["password"])
        stats = fetch_json(
            self.settings["url"].rstrip("/") + "/control/stats", self.timeout, headers
        )
        try:
            blocked = int(stats["num_blocked_filtering"])
        except (KeyError, TypeError, ValueError):
            raise SourceError("no blocked count in the statistics") from None
        return Reading({"blocked_today": blocked}, {"blocked": blocked})

    def observe(self, reading, memory, now):
        blocked = reading.data["blocked"]
        previous = memory.get("blocked")
        memory["blocked"] = blocked
        if previous is None or blocked <= previous:
            # First sight, no change, or the rolling window moved past older blocks.
            return []
        return [{"type": "ad_blocked", "count": blocked - previous, "text": ""}]
