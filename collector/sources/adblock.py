"""Blocked DNS queries, from AdGuard Home's statistics.

AdGuard Home locks an address out of its API after a few bad logins, so credentials go with the
first request and an auth error pauses the source (the runner's back-off) instead of retrying.

A fly stands for one helping of the household's normal blocking: the blocked queries AdGuard
Home sees in `fly_every_s` at its usual rate, which comes from its own statistics window. Normal
traffic then gives a fly every `fly_every_s` on average, and a burst gives a swarm.
"""

from __future__ import annotations

from collector.net import basic_auth, fetch_json
from collector.sources import Reading, Source, SourceError

# Blocked queries per fly when AdGuard Home's statistics give no usable rate.
FALLBACK_PER_FLY = 50
# Flies one event may carry. A burst beyond this is dropped rather than queued.
MAX_FLIES = 8

_UNIT_S = {"days": 86400, "hours": 3600}


def _numbers(value) -> list[float] | None:
    """A list of plain numbers, or None when it is anything else."""
    if not isinstance(value, list) or not all(
        isinstance(v, (int, float)) and not isinstance(v, bool) for v in value
    ):
        return None
    return value


def normal_rate(stats: dict, blocked: int) -> float | None:
    """Blocked queries per second over the statistics window, or None when it cannot be told.

    The window runs from the first unit with any DNS queries to the current one, so a new
    install with a mostly empty window is not understated.
    """
    unit_s = _UNIT_S.get(stats.get("time_units"))
    queries = _numbers(stats.get("dns_queries"))
    if unit_s is None or not queries:
        return None
    first = next((i for i, q in enumerate(queries) if q > 0), None)
    if first is None:
        return None
    return blocked / ((len(queries) - first) * unit_s)


def blocked_since_midnight(stats: dict, local_hour: int) -> int:
    """The blocked queries in the units that fall in today, or 0 when the shape is unknown."""
    buckets = _numbers(stats.get("blocked_filtering"))
    units = stats.get("time_units")
    if not buckets or units not in _UNIT_S:
        return 0
    today = buckets[-1:] if units == "days" else buckets[-(local_hour + 1) :]
    return int(sum(today))


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
        seed = blocked_since_midnight(stats, now.astimezone(self.config.tz).hour)
        # observe replaces blocked_today with the count kept in memory.
        return Reading(
            {"blocked_today": seed},
            {"blocked": blocked, "rate": normal_rate(stats, blocked), "seed": seed},
        )

    def observe(self, reading, memory, now):
        blocked = reading.data["blocked"]
        previous = memory.get("blocked")
        memory["blocked"] = blocked

        day = now.astimezone(self.config.tz).date().isoformat()
        if memory.get("day") != day:
            # Seed from AdGuard's own figures on first sight or on the first run after an
            # upgrade; a date that rolls over while running starts from nothing.
            seed = previous is None or "day" not in memory
            memory["day"] = day
            memory["today"] = reading.data["seed"] if seed else 0

        if previous is None or blocked <= previous:
            # First sight, no change, or the rolling window moved past older blocks.
            reading.facts["blocked_today"] = memory["today"]
            return []
        delta = blocked - previous
        memory["today"] += delta
        reading.facts["blocked_today"] = memory["today"]

        fly_every_s = self.settings["fly_every_s"]
        if fly_every_s == 0:
            return [{"type": "ad_blocked", "count": delta, "text": ""}]
        rate = reading.data["rate"]
        per_fly = FALLBACK_PER_FLY if rate is None else max(1.0, rate * fly_every_s)
        flies, carry = divmod(memory.get("carry", 0) + delta, per_fly)
        memory["carry"] = round(carry, 3)
        flies = min(int(flies), MAX_FLIES)
        if flies < 1:
            return []
        return [{"type": "ad_blocked", "count": flies, "text": ""}]
