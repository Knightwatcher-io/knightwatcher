"""Blocked DNS queries, from the adblock provider.

A fly stands for one helping of the household's normal blocking: the blocked queries the service
sees in `fly_every_s` at its usual rate, which comes from its own statistics window. Normal traffic
then gives a fly every `fly_every_s` on average, and a burst gives a swarm.

The provider gives one of two counts. `blocked` is the queries blocked over the service's own
window, which rises as queries are blocked and may fall when the window moves: each read's rise goes
into the carry, and a fall resets the marker and raises nothing. `recent` is a list of finished time
buckets, each with its time and its blocked queries, for a service whose only fresh counts are
buckets over a sliding window (Technitium's last hour, a minute a bucket), where the difference of
two sums would undercount whatever left the window between them. Each read adds the buckets later
than the newest one seen, whose time is kept in memory as `recent_at`; on first sight the newest is
recorded and nothing added. A bucket counts once `settle_s` seconds have passed since its time, for
a service that finishes its counts a little after the bucket ends.
"""

from __future__ import annotations

import datetime as dt

from collector import text
from collector.kinds import Kind
from collector.net import SourceError
from collector.sources import Reading

# Blocked queries per fly when the statistics give no usable rate.
FALLBACK_PER_FLY = 50
# Flies one event may carry. A burst beyond this is dropped rather than queued.
MAX_FLIES = 8
DAY_S = 86400
# The most buckets one read may list: a day of minutes.
MAX_RECENT = 1440


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
    # A provider file gives exactly one of these; the format holds it to that.
    ONE_OF = ("blocked", "recent")
    FILL = {  # noqa: RUF012 - read only
        # Blocked queries over the service's own window.
        "blocked": {"type": "int"},
        # Finished time buckets, oldest first, each with its blocked queries.
        "recent": {
            "type": "list",
            "max": MAX_RECENT,
            "items": {
                # The bucket's time, as the service labels it; a later bucket has a later time.
                "at": {"type": "time", "required": True},
                # The queries it blocked.
                "blocked": {"type": "int", "min": 0, "required": True},
            },
        },
        # With recent: the seconds after a bucket's time before the service's count of it is final.
        "settle_s": {"type": "int", "min": 0, "max": 3600},
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
        window = fill.get("window")
        seed = blocked_since_midnight(window, now.astimezone(config.tz))
        if "recent" in fill:
            return self._recent_reading(fill, window, seed, now)
        if "blocked" not in fill:
            raise SourceError("provider gave neither blocked nor recent")
        blocked = fill["blocked"]
        # observe replaces blocked_today with the count kept in memory.
        return Reading(
            {"blocked_today": seed},
            {"blocked": blocked, "rate": normal_rate(window, blocked), "seed": seed},
        )

    @staticmethod
    def _recent_reading(fill, window, seed, now):
        # Only the buckets the service has finished counting; a younger one waits for a later read.
        cutoff = now - dt.timedelta(seconds=fill.get("settle_s", 0))
        buckets = [(b["at"], b["blocked"]) for b in fill["recent"] if b["at"] <= cutoff]
        blocked = (window or {}).get("blocked")
        rate = normal_rate(window, sum(blocked)) if blocked else None
        return Reading(
            {"blocked_today": seed},
            {"recent": buckets, "rate": rate, "seed": seed},
        )

    def observe(self, reading, memory, settings, config, now):
        if "recent" in reading.data:
            delta = self._recent_delta(reading, memory, config, now)
        else:
            delta = self._blocked_delta(reading, memory, config, now)
        if delta is None:
            return []
        memory["today"] += delta
        reading.facts["blocked_today"] = memory["today"]
        return self._flies(reading, memory, settings, delta)

    @staticmethod
    def _today(reading, memory, config, now, first: bool) -> None:
        day = now.astimezone(config.tz).date().isoformat()
        if memory.get("day") != day:
            # Seed from the service's own figures on first sight or on the first run after an
            # upgrade; a date that rolls over while running starts from nothing.
            seed = first or "day" not in memory
            memory["day"] = day
            memory["today"] = reading.data["seed"] if seed else 0

    def _blocked_delta(self, reading, memory, config, now) -> int | None:
        """The rise of `blocked` since the last read, or None for none."""
        # A marker of the recent mode, from a provider read before this one, is no longer true.
        memory.pop("recent_at", None)
        blocked = reading.data["blocked"]
        previous = memory.get("blocked")
        memory["blocked"] = blocked
        self._today(reading, memory, config, now, previous is None)
        if previous is None or blocked <= previous:
            # First sight, no change, or the rolling window moved past older blocks.
            reading.facts["blocked_today"] = memory["today"]
            return None
        return blocked - previous

    def _recent_delta(self, reading, memory, config, now) -> int | None:
        """The blocked queries of the buckets later than the newest seen, or None for none."""
        # A marker of the blocked mode, from a provider read before this one, is no longer true.
        memory.pop("blocked", None)
        previous = _parse_time(memory.get("recent_at"))
        if previous is not None and previous > now:
            # Only a bucket already past is ever recorded, so one from the future means the clock
            # went back; starting again from first sight counts nothing twice.
            previous = None
        buckets = reading.data["recent"]
        self._today(reading, memory, config, now, previous is None)
        if buckets:
            newest = max(at for at, _ in buckets)
            if previous is None or newest > previous:
                memory["recent_at"] = newest.astimezone(dt.UTC).isoformat()
        if previous is None:
            # First sight: the buckets already listed are history, not news.
            reading.facts["blocked_today"] = memory["today"]
            return None
        delta = sum(n for at, n in buckets if at > previous)
        if delta == 0:
            reading.facts["blocked_today"] = memory["today"]
            return None
        return delta

    @staticmethod
    def _flies(reading, memory, settings, delta: int) -> list:
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


def _parse_time(value) -> dt.datetime | None:
    """A time kept in memory, or None when there is none or it does not parse."""
    if not isinstance(value, str):
        return None
    try:
        return text.parse_iso(value)
    except ValueError:
        return None


KIND = AdblockKind
