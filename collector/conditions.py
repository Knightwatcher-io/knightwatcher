"""Conditions: what is true now, how long it must last to count, and the words for it.

Each condition has a cause, judged afresh at every poll from the sources' readings. A condition
becomes active once its cause has held for the condition's duration (or number of checks), and
clears only once the cause has been absent for `clear_after_polls` further polls, so it does not
flap. A source that could not be read counts as the cause being absent, so a dead source cannot
hold a condition up for ever.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass
from typing import Any

from collector import text
from collector.config import Config
from collector.sources import Reading

log = logging.getLogger("collector")

_EXIT_CODE = re.compile(r"^Exited \((-?\d+)\)")

LEVELS = {
    "attack": "critical",
    "wan_down": "critical",
    "container_unhealthy": "warning",
    "disk_full": "warning",
    "backup_overdue": "warning",
    "pi_silent": "warning",
    "cpu_hot": "warning",
    "memory_tight": "warning",
    "ssh_session": "work",
    "updating": "work",
    "streaming": "quiet",
    "night": "sleep",
}


@dataclass
class Cause:
    """One poll's judgement of a condition's cause."""

    present: bool
    since: dt.datetime | None = None  # when the cause began, if the source knows better
    context: Any = None  # whatever the words need


class Tracker:
    """Sustain and clear rules for one condition."""

    def __init__(self, for_s: float = 0, for_polls: int = 1, clear_after_polls: int = 1):
        self.for_s = for_s
        self.for_polls = for_polls
        self.clear_after = clear_after_polls
        self.cause_since: dt.datetime | None = None
        self.cause_polls = 0
        self.absent_polls = 0
        self.active = False
        self.since: dt.datetime | None = None

    def update(self, cause: Cause, now: dt.datetime) -> bool:
        if cause.present:
            if self.cause_since is None:
                self.cause_since = cause.since or now
            self.cause_polls += 1
            self.absent_polls = 0
            held = (now - self.cause_since).total_seconds()
            if not self.active and held >= self.for_s and self.cause_polls >= self.for_polls:
                self.active = True
                self.since = self.cause_since
        else:
            self.cause_since = None
            self.cause_polls = 0
            if self.active:
                self.absent_polls += 1
                if self.absent_polls > self.clear_after:
                    self.active = False
                    self.since = None
                    self.absent_polls = 0
        return self.active


def _facts(readings: dict[str, Reading | None], name: str) -> dict | None:
    r = readings.get(name)
    return r.facts if r is not None else None


def _data(readings: dict[str, Reading | None], name: str) -> dict | None:
    r = readings.get(name)
    return r.data if r is not None else None


def _named(name: str, word: str) -> str:
    """A headline of a name and a word, shortening the name so the word always shows."""
    room = text.HEADLINE_MAX - len(word) - 1
    return f"{text.clip(name.upper(), room)} {word}"


def _hhmm(value: str) -> dt.time:
    h, m = value.split(":")
    return dt.time(int(h), int(m))


class Conditions:
    def __init__(self, config: Config):
        self.config = config
        c = config.conditions
        self.priority: list[str] = list(c["priority"])
        clear = c["clear_after_polls"]
        self.trackers = {
            "attack": Tracker(clear_after_polls=clear),
            "wan_down": Tracker(for_polls=c["wan_down"]["failed_checks"], clear_after_polls=clear),
            "container_unhealthy": Tracker(clear_after_polls=clear),
            "disk_full": Tracker(clear_after_polls=clear),
            "backup_overdue": Tracker(clear_after_polls=clear),
            "pi_silent": Tracker(for_s=c["pi_silent"]["for_s"], clear_after_polls=clear),
            "cpu_hot": Tracker(for_s=c["cpu_hot"]["for_s"], clear_after_polls=clear),
            "memory_tight": Tracker(for_s=c["memory_tight"]["for_s"], clear_after_polls=clear),
            "ssh_session": Tracker(clear_after_polls=clear),
            "updating": Tracker(clear_after_polls=clear),
            "streaming": Tracker(clear_after_polls=clear),
            "night": Tracker(clear_after_polls=clear),
        }
        # Per-container short history: name -> (first seen bad, kind, status).
        self.bad_since: dict[str, tuple[dt.datetime, str, str]] = {}
        # SSH connections seen: (address, port) -> first seen, or None if open at the first
        # reading. None until the first reading.
        self.ssh_seen: dict[tuple[str, int], dt.datetime | None] | None = None
        self.causes: dict[str, Cause] = {}

    # Causes -----------------------------------------------------------------------------------

    def _attack(self, r, now) -> Cause:
        d = _data(r, "security")
        if d is None or "bans_in_window" not in d:
            return Cause(False)
        a = self.config.conditions["attack"]
        present = d["jail_ban"] or d["bans_in_window"] >= a["bans"]
        return Cause(present, context=d)

    def _wan_down(self, r, now) -> Cause:
        f = _facts(r, "wan")
        return Cause(f is not None and not f["up"])

    def _container_unhealthy(self, r, now) -> Cause:
        d = _data(r, "containers")
        if d is None:
            # Keep the per-container timers through a failed read.
            return Cause(False)
        bad = d["bad"]
        for name in list(self.bad_since):
            if name not in bad or bad[name]["kind"] != self.bad_since[name][1]:
                del self.bad_since[name]
        for name, info in bad.items():
            if name in self.bad_since:
                self.bad_since[name] = (self.bad_since[name][0], info["kind"], info["status"])
            else:
                self.bad_since[name] = (now, info["kind"], info["status"])
        limit = self.config.conditions["container_unhealthy"]["for_s"]
        due = {n: v for n, v in self.bad_since.items() if (now - v[0]).total_seconds() >= limit}
        if not due:
            return Cause(False)
        return Cause(True, since=min(v[0] for v in due.values()), context=due)

    def _disk_full(self, r, now) -> Cause:
        f = _facts(r, "host")
        if f is None or not f["disks"]:
            return Cause(False)
        worst = max(f["disks"], key=lambda d: d["pct"])
        return Cause(worst["pct"] >= self.config.conditions["disk_full"]["pct"], context=worst)

    def _backup_overdue(self, r, now) -> Cause:
        f = _facts(r, "backup")
        if f is None or f["last_ok"] is None:
            return Cause(False)
        hours = self.config.conditions["backup_overdue"]["hours"]
        last = text.parse_iso(f["last_ok"])
        due = last + dt.timedelta(hours=hours)
        return Cause(now > due, since=due, context=last)

    def _pi_silent(self, r, now) -> Cause:
        f = _facts(r, "pi")
        return Cause(f is not None and not f["up"])

    def _cpu_hot(self, r, now) -> Cause:
        f = _facts(r, "host")
        if f is None:
            return Cause(False)
        return Cause(f["cpu_pct"] >= self.config.conditions["cpu_hot"]["pct"], context=f)

    def _memory_tight(self, r, now) -> Cause:
        d = _data(r, "host")
        if d is None:
            return Cause(False)
        limit = self.config.conditions["memory_tight"]["available_pct"]
        return Cause(d["mem_available_pct"] <= limit, context=d["mem_available_pct"])

    def _ssh_session(self, r, now) -> Cause:
        f = _facts(r, "ssh")
        if f is None:
            # Keep the memory of connections through a failed read.
            return Cause(False)
        s = self.config.conditions["ssh_session"]
        conns = {tuple(c) for c in _data(r, "ssh").get("conns", [])}
        if self.ssh_seen is None:
            # The first reading adopts whatever is open as old.
            self.ssh_seen = dict.fromkeys(conns)
        else:
            self.ssh_seen = {c: self.ssh_seen.get(c, now) for c in conns}
        enough = f["count"] >= s["min_sessions"]
        if s["show_for_s"] == 0:
            return Cause(enough, context=f)
        fresh = any(
            t is not None and (now - t).total_seconds() < s["show_for_s"]
            for t in self.ssh_seen.values()
        )
        return Cause(enough and fresh, context=f)

    def _updating(self, r, now) -> Cause:
        f = _facts(r, "updates")
        return Cause(f is not None and f["running"], context=f)

    def _streaming(self, r, now) -> Cause:
        f = _facts(r, "streams")
        if f is None:
            return Cause(False)
        return Cause(f["count"] >= self.config.conditions["streaming"]["min_streams"], context=f)

    def _night(self, r, now) -> Cause:
        n = self.config.conditions["night"]
        start, end = _hhmm(n["start"]), _hhmm(n["end"])
        local = now.astimezone(self.config.tz)
        t = local.time()
        if start == end:
            return Cause(False)
        inside = start <= t < end if start < end else (t >= start or t < end)
        if not inside:
            return Cause(False)
        day = local.date() if t >= start else local.date() - dt.timedelta(days=1)
        began = dt.datetime.combine(day, start, tzinfo=self.config.tz)
        return Cause(True, since=began, context=n["end"])

    # Words ------------------------------------------------------------------------------------

    def _words(self, cid: str, cause: Cause, since: dt.datetime, now: dt.datetime):
        ctx = cause.context
        held = text.duration((now - since).total_seconds())
        if cid == "attack":
            jail = ctx["last_jail"] if ctx.get("jail_ban") else ""
            parts = []
            if jail:
                parts.append(f"{jail} ban from {ctx['last_ip']}")
            parts.append(f"{text.plural(ctx['bans_in_window'], 'ban')} in {self._window()}")
            return "UNDER ATTACK", text.SEP.join(parts)
        if cid == "wan_down":
            return "INTERNET DOWN", f"no answer for {held}"
        if cid == "container_unhealthy":
            names = sorted(ctx, key=lambda n: ctx[n][0])
            if len(names) == 1:
                name = names[0]
                _first, kind, status = ctx[name]
                if kind == "failed":
                    code = _EXIT_CODE.match(status or "")
                    how = f"exited with code {code.group(1)}" if code else "dead"
                    return _named(name, "DOWN"), f"{how}{text.SEP}down for {held}"
                word = {"unhealthy": "UNWELL", "restarting": "RESTARTING"}[kind]
                return _named(name, word), f"{kind} for {held}"
            return f"{len(names)} UNWELL", ", ".join(names)
        if cid == "disk_full":
            return (
                "DISK FULL",
                f"{ctx['mount']} at {ctx['pct']:.0f}%{text.SEP}{ctx['free_gb']} GB free",
            )
        if cid == "backup_overdue":
            age = text.duration((now - ctx).total_seconds())
            return "BACKUP OVERDUE", f"last backup {age} ago"
        if cid == "pi_silent":
            return "PI SILENT", f"no answer for {held}"
        if cid == "cpu_hot":
            return "CPU HOT", f"{ctx['cpu_pct']:.0f}% for {held}{text.SEP}load {ctx['load1']:.1f}"
        if cid == "memory_tight":
            return "MEMORY TIGHT", f"{ctx:.0f}% available for {held}"
        if cid == "ssh_session":
            who = ", ".join(ctx["sources"])
            what = text.plural(ctx["count"], "ssh session")
            return "SHELL OPEN", f"{what} from {who}" if who else what
        if cid == "updating":
            return "MAINTENANCE", f"{ctx['what'] or 'maintenance'} running for {held}"
        if cid == "streaming":
            titles = ctx["titles"]
            if ctx["count"] == 1 and titles:
                return "STREAMING", titles[0]
            first = f"{text.SEP}{titles[0]}" if titles else ""
            return "STREAMING", f"{text.plural(ctx['count'], 'stream')}{first}"
        if cid == "night":
            return "NIGHT", f"quiet hours until {ctx}"
        raise KeyError(cid)

    def _window(self) -> str:
        return text.duration(self.config.conditions["attack"]["window_s"])

    # Evaluation -------------------------------------------------------------------------------

    def evaluate(self, readings: dict[str, Reading | None], now: dt.datetime) -> list[dict]:
        out = []
        for cid in self.priority:
            try:
                cause = getattr(self, f"_{cid}")(readings, now)
            except Exception:
                log.exception("condition %s could not be judged", cid)
                cause = Cause(False)
            if cid == "attack" and cause.present:
                sec = _data(readings, "security")
                lb = sec["last_ban"]
                cause.context = {
                    "jail_ban": sec["jail_ban"],
                    "bans_in_window": sec["bans_in_window"],
                    "last_jail": lb["jail"],
                    "last_ip": lb["ip"],
                }
            tracker = self.trackers[cid]
            if not tracker.update(cause, now):
                self.causes.pop(cid, None)
                continue
            if cause.present:
                self.causes[cid] = cause
            # While a condition is held through its clearing period, the last words stand.
            shown = self.causes[cid]
            since = tracker.since or now
            head, det = self._words(cid, shown, since, now)
            out.append(
                {
                    "id": cid,
                    "level": LEVELS[cid],
                    "since": text.iso(since),
                    "headline": text.headline(head),
                    "detail": text.detail(det),
                }
            )
        return out

    def active(self, cid: str) -> bool:
        return self.trackers[cid].active
