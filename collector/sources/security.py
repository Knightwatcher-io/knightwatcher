"""Bans and the attack signal, from a fail2ban summary endpoint.

The endpoint returns a small JSON summary: `threat_score_24h`, `organic_bans_24h` and
`last_ban` with `ip`, `jail` and `time`. Bans in the recent window are counted from the rise in
the 24-hour ban count between polls, and from changes in the last ban.
"""

from __future__ import annotations

import datetime as dt
from collections import deque

from collector import text
from collector.net import fetch_json
from collector.sources import Reading, Source, SourceError


class SecuritySource(Source):
    name = "security"
    section = "security"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        attack = config.conditions["attack"]
        self.window = dt.timedelta(seconds=attack["window_s"])
        self.jails = set(attack["jails"])
        self.recent: deque[tuple[dt.datetime, int]] = deque()
        self._prev_count: int | None = None
        self._prev_key: str | None = None

    def fetch(self, now):
        soc = fetch_json(self.settings["url"].rstrip("/") + "/soc", self.timeout)
        if not isinstance(soc, dict):
            raise SourceError("unexpected reply from the ban summary")
        try:
            score = int(soc.get("threat_score_24h", 0))
            bans = int(soc["organic_bans_24h"])
        except (KeyError, TypeError, ValueError):
            raise SourceError("no ban count in the summary") from None
        last = soc.get("last_ban") or {}
        when = None
        if last.get("time"):
            try:
                when = text.parse_iso(str(last["time"]))
            except ValueError:
                when = None
        last_ban = {
            "ip": str(last.get("ip") or ""),
            "jail": str(last.get("jail") or ""),
            "time": when,
        }
        facts = {"threat_score": score, "bans_24h": bans, "attack": False}
        return Reading(facts, {"bans_24h": bans, "last_ban": last_ban})

    def observe(self, reading, memory, now):
        bans = reading.data["bans_24h"]
        lb = reading.data["last_ban"]
        key = f"{lb['ip']}|{text.iso(lb['time']) if lb['time'] else ''}" if lb["ip"] else ""

        # The window count is kept in memory only: it is short history, not a marker.
        new = 0
        if self._prev_count is not None:
            new = max(0, bans - self._prev_count)
            if key and key != self._prev_key:
                new = max(new, 1)
        self._prev_count, self._prev_key = bans, key
        if new:
            self.recent.append((now, new))
        while self.recent and now - self.recent[0][0] > self.window:
            self.recent.popleft()
        in_window = sum(n for _, n in self.recent)

        recent_jail_ban = bool(
            lb["time"] and lb["jail"] in self.jails and now - lb["time"] <= self.window
        )
        reading.data["bans_in_window"] = in_window
        reading.data["jail_ban"] = recent_jail_ban

        events = []
        previous = memory.get("last_ban")
        if key and previous is not None and key != previous:
            caption = f"BANNED {lb['ip']}" + (f"{text.SEP}{lb['jail']}" if lb["jail"] else "")
            parts = {"addr": lb["ip"], **({"jail": lb["jail"]} if lb["jail"] else {})}
            events.append({"type": "ip_banned", "count": 1, "text": caption, "parts": parts})
        if key or previous is None:
            memory["last_ban"] = key
        return events
