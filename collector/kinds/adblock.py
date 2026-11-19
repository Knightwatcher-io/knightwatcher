"""Blocked DNS queries, from the adblock provider.

A fly stands for one helping of the household's normal blocking: the blocked queries the service
sees in `fly_every_s` at its usual rate, which comes from its own statistics window. Normal traffic
then gives a fly every `fly_every_s` on average, and a burst gives a swarm.

The provider gives `blocked`, the queries blocked over the service's own window, which rises as
queries are blocked and may fall when the window moves. Each read's rise goes into the carry; a fall
resets the marker and raises nothing.
"""

from __future__ import annotations

from collector.kinds import Kind
from collector.sources import Reading

# Blocked queries per fly when the statistics give no usable rate.
FALLBACK_PER_FLY = 50
# Flies one event may carry. A burst beyond this is dropped rather than queued.
MAX_FLIES = 8
DAY_S = 86400


def normal_rate(window: dict | None, blocked: int) -> float | None:
    """Blocked queries per second over the statistics window, or None when it cannot be told.

    The window runs from the first bucket with any queries to the last, so a new install with a
    mostly empty window is not understated.
    """
    queries = (window or {}).get("queries")
    if not queries:
        return None
    first = next((i for i, q in enumerate(queries) if q > 0), None)
    if first is None:
        return None
    return blocked / ((len(queries) - first) * window["unit_s"])


def blocked_since_midnight(window: dict | None, local) -> int:
    """The blocked queries in the buckets that fall in today, or 0 when the shape is unknown.

    With buckets of a day or more, the last one. With shorter ones, those since local midnight:
    the last floor(seconds since midnight / unit) + 1, one fewer when the last bucket is a finished
    one rather than the current.
    """
    buckets = (window or {}).get("blocked")
    if not buckets:
        return 0
    unit_s = window["unit_s"]
    if unit_s >= DAY_S:
        today = buckets[-1:]
    else:
        since = local.hour * 3600 + local.minute * 60 + local.second
        n = since // unit_s + (1 if window["current"] else 0)
        today = buckets[-n:] if n > 0 else []
    return int(sum(today))


class AdblockKind(Kind):
    name = "adblock"
    section = "adblock"
    FILL = {  # noqa: RUF012 - read only
        # Blocked queries over the service's own window.
        "blocked": {"type": "int", "required": True},
        # The service's statistics window, for the normal rate and today's seed.
        "window": {
            "type": "object",
            "fields": {
                # All queries per bucket, oldest first.
                "queries": {"type": "list", "of": "number"},
                # Blocked queries per bucket, oldest first.
                "blocked": {"type": "list", "of": "number"},
                # A bucket's length in seconds.
                "unit_s": {"type": "int", "min": 1, "required": True},
                # Whether the last bucket is the current, unfinished one.
                "current": {"type": "bool", "required": True},
            },
        },
    }

    def reading(self, fill, settings, config, now):
        blocked = fill["blocked"]
        window = fill.get("window")
        seed = blocked_since_midnight(window, now.astimezone(config.tz))
        # observe replaces blocked_today with the count kept in memory.
        return Reading(
            {"blocked_today": seed},
            {"blocked": blocked, "rate": normal_rate(window, blocked), "seed": seed},
        )

    def observe(self, reading, memory, settings, config, now):
        blocked = reading.data["blocked"]
        previous = memory.get("blocked")
        memory["blocked"] = blocked

        day = now.astimezone(config.tz).date().isoformat()
        if memory.get("day") != day:
            # Seed from the service's own figures on first sight or on the first run after an
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

        fly_every_s = settings["fly_every_s"]
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


KIND = AdblockKind
