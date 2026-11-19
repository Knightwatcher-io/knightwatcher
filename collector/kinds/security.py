"""Bans, and what the attack condition reads, from the list of bans a provider gives.

The provider lists every ban it knows of from the last 24 hours, or from the start of the attack
window when that is longer, newest last. Everything is worked out from the list itself at each
read rather than from differences between reads, so a ban that arrives and leaves between two
reads is still counted, and a ban that is lifted (fail2ban deletes its row) leaves the count:

  bans_24h        the bans of the last 24 hours, written to state.json
  bans_in_window  the bans of the last conditions.attack.window_s
  jail_ban        whether one of those is in one of conditions.attack.jails
  last_ban        the newest ban in a watched jail inside the window when there is one, else the
                  newest ban; the attack words name it

A ban is new when its key (by default jail|ip|time) has not been seen. The keys of the bans listed
are kept in the memory file under `seen`, the newest MAX_SEEN, so a restart raises nothing twice;
on first sight every key is adopted and nothing is raised. Each read that finds new bans gives one
ip_banned event, naming the newest of them, with `count` the number of new bans.
"""

from __future__ import annotations

import datetime as dt

from collector import text
from collector.kinds import Kind
from collector.sources import Reading

DAY = dt.timedelta(days=1)
# The most bans one read may list.
MAX_BANS = 5000
# The most ban keys kept in the memory file.
MAX_SEEN = 2000


def span(config) -> dt.timedelta:
    """How far back a provider lists bans: 24 hours, or the attack window when that is longer."""
    return max(DAY, dt.timedelta(seconds=config.conditions["attack"]["window_s"]))


def key_of(ban: dict) -> str:
    """A ban's identity: the provider's key, or jail|ip|time."""
    if ban.get("key"):
        return ban["key"]
    return f"{ban.get('jail', '')}|{ban['ip']}|{text.iso(ban['at'])}"


class SecurityKind(Kind):
    name = "security"
    section = "security"
    FILL = {  # noqa: RUF012 - read only
        # Every ban the service knows of in the span, newest last.
        "bans": {
            "type": "list",
            "required": True,
            "max": MAX_BANS,
            "items": {
                # The address banned.
                "ip": {"type": "string", "required": True},
                # The jail, or whatever the service calls the rule that banned it.
                "jail": {"type": "string"},
                # When the ban was made.
                "at": {"type": "time", "required": True},
                # The ban's identity; jail|ip|time when left out.
                "key": {"type": "string"},
            },
        },
        # How far back the list reaches, in seconds, when it reaches less far than the span.
        "complete_s": {"type": "int", "min": 0},
    }

    def reading(self, fill, settings, config, now):
        attack = config.conditions["attack"]
        window = now - dt.timedelta(seconds=attack["window_s"])
        day = now - DAY
        jails = set(attack["jails"])
        bans = [
            {
                "ip": text.clean(b["ip"]),
                "jail": text.clean(b.get("jail", "")),
                "at": b["at"],
                "key": key_of(b),
            }
            for b in fill["bans"]
        ]
        in_window = [b for b in bans if b["at"] >= window]
        watched = [b for b in in_window if b["jail"] in jails]
        newest = _newest(watched) or _newest(bans)
        last_ban = (
            {"ip": newest["ip"], "jail": newest["jail"], "time": newest["at"]}
            if newest
            else {"ip": "", "jail": "", "time": None}
        )
        count_24h = sum(1 for b in bans if b["at"] >= day)
        data = {
            "bans": bans,
            "bans_24h": count_24h,
            "bans_in_window": len(in_window),
            "jail_ban": bool(watched),
            "last_ban": last_ban,
        }
        if "complete_s" in fill:
            data["complete_s"] = fill["complete_s"]
        return Reading({"bans_24h": count_24h, "attack": False}, data)

    def observe(self, reading, memory, settings, config, now):
        bans = reading.data["bans"]
        seen = memory.get("seen")
        floor = memory.get("floor")
        kept = _kept(bans)
        memory["seen"] = [b["key"] for b in kept]
        if len(kept) < len(bans) and kept:
            # The keys beyond MAX_SEEN are forgotten; a ban no newer than the oldest kept is not
            # new at the next read.
            memory["floor"] = text.iso(kept[0]["at"])
        else:
            memory.pop("floor", None)
        if not isinstance(seen, list):
            # First sight: adopt what is there.
            return []
        known = set(seen)
        since = _parse(floor)
        fresh = [b for b in bans if b["key"] not in known and (since is None or b["at"] > since)]
        if not fresh:
            return []
        b = _newest(fresh)
        caption = f"BANNED {b['ip']}" + (f"{text.SEP}{b['jail']}" if b["jail"] else "")
        parts = {"addr": b["ip"], **({"jail": b["jail"]} if b["jail"] else {})}
        return [{"type": "ip_banned", "count": len(fresh), "text": caption, "parts": parts}]


def _newest(bans: list[dict]) -> dict | None:
    """The newest ban: the latest time, and of those the last listed."""
    best = None
    for b in bans:
        if best is None or b["at"] >= best["at"]:
            best = b
    return best


def _kept(bans: list[dict]) -> list[dict]:
    """The bans whose keys are kept, the newest MAX_SEEN, oldest first."""
    ordered = sorted(enumerate(bans), key=lambda ib: (ib[1]["at"], ib[0]))
    return [b for _, b in ordered[-MAX_SEEN:]]


def _parse(value) -> dt.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return text.parse_iso(value)
    except ValueError:
        return None


KIND = SecurityKind
