"""Conditions: what is true now, how long it must last to count, and the words for it.

Each condition has a cause, judged afresh at every poll from the sources' readings. A condition
becomes active once its cause has held for the condition's duration (or number of fresh reads),
and clears only once the cause has been absent for `clear_after_s` seconds, so it does not flap.
A source that could not be read counts as the cause being absent, so a dead source cannot hold a
condition up for ever. CPU and memory are judged on averages over a window, which the host
source works out from its own history.

Devices are judged apart, each by its own watch: a check that ran out of time counts as
silence for them, since a machine that cannot answer in time has not answered. `pi_silent` and
`device_down` are raised from the watches. `pi_silent` keeps the rule it had before there were
devices: raised once the Pi has not answered at every poll for `for_s`.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass
from typing import Any

from collector import text
from collector.config import Config
from collector.kinds import streams
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
    "device_down": "warning",
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


# Conditions that count reads, and the source whose fresh reads they count. A poll that reuses
# a source's last reading is not a new check.
COUNTS_READS_OF = {"wan_down": "wan"}

# The headline's word for a device that is down, by kind, and for a kind not listed.
KIND_WORDS = {"pi": "SILENT", "camera": "DARK", "machine": "DOWN", "vm": "DOWN"}
OTHER_KIND_WORD = "DOWN"
# The status of a source whose first read has not finished: its device is not yet known.
FIRST_READ = "first read still running"
# What makes a device the same device across a change of configuration.
_CHECK_KEYS = ("kind", "host", "ports", "url", "refused_counts", "verify_tls", "legacy")


class Tracker:
    """Sustain and clear rules for one condition."""

    def __init__(self, for_s: float = 0, for_reads: int = 1, clear_after_s: float = 0):
        self.for_s = for_s
        self.for_reads = for_reads
        self.clear_after_s = clear_after_s
        self.cause_since: dt.datetime | None = None
        self.cause_reads = 0
        self.absent_since: dt.datetime | None = None
        self.active = False
        self.since: dt.datetime | None = None

    def update(self, cause: Cause, now: dt.datetime, fresh: bool = True) -> bool:
        """Judge one poll. fresh says whether the reading behind the cause is a new read."""
        if cause.present:
            if self.cause_since is None:
                self.cause_since = cause.since or now
            if fresh:
                self.cause_reads += 1
            self.absent_since = None
            held = (now - self.cause_since).total_seconds()
            if not self.active and held >= self.for_s and self.cause_reads >= self.for_reads:
                self.active = True
                self.since = self.cause_since
        else:
            self.cause_since = None
            self.cause_reads = 0
            if self.active:
                if self.absent_since is None:
                    self.absent_since = now
                if (now - self.absent_since).total_seconds() >= self.clear_after_s:
                    self.active = False
                    self.since = None
                    self.absent_since = None
        return self.active


class Watch:
    """What the collector knows of one device since it started.

    A device is unknown until it answers or is judged down. An answer makes it up at once and
    ends its silence. A silence starts at the first poll that finds no answer, and the device is
    down once the silence has lasted its down_after_s, counted from that poll. A device silent for
    less is as it was.
    """

    def __init__(self, index: int, device: dict):
        self.index = index  # its position in facts.devices.list
        self.device = device
        self.seen = False  # whether it has answered since the collector started
        self.answered: bool | None = None  # at the last poll, or None before the first check
        self.silent_since: dt.datetime | None = None
        self.state = "unknown"
        self.since: dt.datetime | None = None  # when the present state began

    def update(self, answered: bool | None, now: dt.datetime) -> None:
        """Judge one poll. answered is None when no check has finished yet."""
        if answered is None:
            return
        self.answered = answered
        if answered:
            self.seen = True
            self.silent_since = None
            if self.state != "up":
                self.state, self.since = "up", now
            return
        if self.silent_since is None or now < self.silent_since:
            # A clock that went back starts the silence again, rather than leaving its start in
            # the future where it would hold the device up until the clock caught up.
            self.silent_since = now
        held = (now - self.silent_since).total_seconds()
        if held >= self.device["down_after_s"] and self.state != "down":
            self.state, self.since = "down", self.silent_since

    def fact(self) -> dict:
        return {
            "name": self.device["name"],
            "kind": self.device["kind"],
            "state": self.state,
            "alert": self.device["alert"],
            "seen": self.seen,
            "since": text.iso(self.since) if self.since and self.state != "unknown" else None,
        }


def _answered(reading: Reading | None, status: dict | None) -> bool | None:
    """A device's answer at this poll: yes, no, or None while its first check is running."""
    if reading is not None:
        answered = reading.data.get("answered")
        if answered is None and reading.facts is not None:
            answered = reading.facts.get("up")
        return None if answered is None else bool(answered)
    # No reading: a check that ran out of time has not answered.
    error = (status or {}).get("error", FIRST_READ)
    return None if error == FIRST_READ else False


def _names(names: list[str], limit: int) -> str:
    """Names joined while they fit, with +N for the rest: Vault, Gate cam +2."""
    for n in range(len(names), 0, -1):
        line = ", ".join(names[:n]) + (f" +{len(names) - n}" if n < len(names) else "")
        if len(line) <= limit:
            return line
    return text.clip(names[0], limit)


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
        clear = c["clear_after_s"]
        self.trackers = {cid: Tracker(clear_after_s=clear) for cid in LEVELS}
        self.trackers["wan_down"] = Tracker(
            for_reads=c["wan_down"]["failed_checks"], clear_after_s=clear
        )
        self.trackers["pi_silent"] = Tracker(for_s=c["pi_silent"]["for_s"], clear_after_s=clear)
        # device_down needs no duration of its own: the watches judge when a device is down, and
        # pass the start of its silence as the cause's since.
        self.watches = [Watch(i, t) for i, t in enumerate(config.devices)]
        self.started: dt.datetime | None = None
        # Per-container short history: name -> (first seen bad, kind, status).
        self.bad_since: dict[str, tuple[dt.datetime, str, str]] = {}
        # SSH connections seen: (address, port) -> first seen, or None if open at the first
        # reading. None until the first reading.
        self.ssh_seen: dict[tuple[str, int], dt.datetime | None] | None = None
        self.causes: dict[str, Cause] = {}

    def reconfigure(self, config: Config) -> None:
        """Take up a new configuration between polls, keeping what is known.

        Each condition keeps its state and takes up its new thresholds; one left out of the
        priority is forgotten, so that it starts afresh if it comes back. Each device keeps
        its record while its source and its check are the same, at its new place in the list; a
        device renamed, given a new check or added starts afresh, as after a restart.
        """
        self.config = config
        c = config.conditions
        self.priority = list(c["priority"])
        clear = c["clear_after_s"]
        for cid in LEVELS:
            if cid not in self.priority:
                self.trackers[cid] = Tracker(clear_after_s=clear)
                self.causes.pop(cid, None)
            self.trackers[cid].clear_after_s = clear
        self.trackers["wan_down"].for_reads = c["wan_down"]["failed_checks"]
        self.trackers["pi_silent"].for_s = c["pi_silent"]["for_s"]
        old = {w.device["source"]: w for w in self.watches}
        watches = []
        for i, t in enumerate(config.devices):
            w = old.get(t["source"])
            if w is not None and all(w.device[k] == t[k] for k in _CHECK_KEYS):
                w.index, w.device = i, t
            else:
                w = Watch(i, t)
            watches.append(w)
        self.watches = watches
        # Words held through device_down's clearing period name devices by their places, which may
        # have moved; a device no longer watched is dropped from them.
        held = self.causes.get("device_down")
        if held is not None:
            places = {w.device["name"]: w.index for w in self.watches if not w.device["legacy"]}
            kept = [dict(d, index=places[d["name"]]) for d in held.context if d["name"] in places]
            if kept:
                held.context = kept
            else:
                self.causes.pop("device_down")
                self.trackers["device_down"] = Tracker(clear_after_s=clear)
        # Words held through streaming's clearing period say no more than the setting `show`
        # now lets out: a change to it restarts the source, but not the words it last gave.
        held = self.causes.get("streaming")
        if held is not None and held.context is not None:
            show = config.sources["streams"]["show"] if "streams" in config.sources else "count"
            held.context = streams.shown(held.context, show)

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
        w = next((w for w in self.watches if w.device["legacy"]), None)
        return Cause(w is not None and w.answered is False)

    def _device_down(self, r, now) -> Cause:
        down = [
            w
            for w in self.watches
            if w.state == "down" and w.device["alert"] and not w.device["legacy"]
        ]
        if not down:
            return Cause(False)
        down.sort(key=lambda w: (w.silent_since, w.index))
        # A copy, so that words held through the clearing period keep what they said.
        context = [
            {
                "index": w.index,
                "name": w.device["name"],
                "kind": w.device["kind"],
                "seen": w.seen,
                "silent_since": w.silent_since,
            }
            for w in down
        ]
        return Cause(True, since=min(w.silent_since for w in down), context=context)

    @staticmethod
    def _window_start(now: dt.datetime, span_s: float) -> dt.datetime:
        """When an average over the last span_s seconds began: the cause has held since then.

        At least a second back, so the words never say "for 0 s" when the average rests on the
        short sample taken after a start.
        """
        return now - dt.timedelta(seconds=max(1.0, span_s))

    def _cpu_hot(self, r, now) -> Cause:
        f, d = _facts(r, "host"), _data(r, "host")
        if f is None:
            return Cause(False)
        # cpu_pct is already the average over the window (see the host source).
        present = f["cpu_pct"] >= self.config.conditions["cpu_hot"]["pct"]
        return Cause(present, since=self._window_start(now, d["cpu_span_s"]), context=f)

    def _memory_tight(self, r, now) -> Cause:
        d = _data(r, "host")
        if d is None:
            return Cause(False)
        limit = self.config.conditions["memory_tight"]["available_pct"]
        avg = d["mem_available_avg"]
        return Cause(avg <= limit, since=self._window_start(now, d["mem_span_s"]), context=avg)

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
        if cid == "device_down":
            return self._device_words(ctx, now)
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
            # The first stream, as a page from before the streams' sessions shows it; a newer
            # page takes each in turn from facts.streams.sessions.
            sessions = ctx.get("sessions") or []
            if sessions:
                return "STREAMING", streams.line(sessions[0], 1, len(sessions))
            return "STREAMING", text.plural(ctx["count"], "stream")
        if cid == "night":
            return "NIGHT", f"quiet hours until {ctx}"
        raise KeyError(cid)

    def _device_words(self, down: list[dict], now: dt.datetime) -> tuple[str, str]:
        if len(down) > 1:
            return f"{len(down)} DOWN", _names([d["name"] for d in down], text.DETAIL_MAX)
        d = down[0]
        word = KIND_WORDS.get(d["kind"], OTHER_KIND_WORD)
        name = " ".join(d["name"].split())
        # The name is repeated in the detail only when the headline had to cut it.
        cut = len(name) > text.HEADLINE_MAX - len(word) - 1
        if d["seen"]:
            why = f"no answer for {text.duration((now - d['silent_since']).total_seconds())}"
        else:
            up_for = text.duration((now - (self.started or now)).total_seconds())
            if cut:
                why = f"not answered in {up_for} since start"
            else:
                why = f"not answered since the collector started {up_for} ago"
        return _named(name, word), f"{name}{text.SEP}{why}" if cut else why

    def _window(self) -> str:
        return text.duration(self.config.conditions["attack"]["window_s"])

    # Evaluation -------------------------------------------------------------------------------

    def watch(
        self, readings: dict[str, Reading | None], status: dict[str, dict], now: dt.datetime
    ) -> None:
        """Bring every device's watch up to this poll."""
        for w in self.watches:
            name = w.device["source"]
            w.update(_answered(readings.get(name), status.get(name)), now)

    def evaluate(
        self,
        readings: dict[str, Reading | None],
        now: dt.datetime,
        fresh: set[str] | None = None,
        status: dict[str, dict] | None = None,
    ) -> list[dict]:
        """Judge every condition for one poll.

        fresh names the sources read afresh at this poll; the others' readings are reused from
        an earlier read. None means every reading is fresh. status is each source's entry in
        `sources`, which says whether a device with no reading ran out of time.
        """
        if self.started is None:
            self.started = now
        self.watch(readings, status or {}, now)
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
            counted = COUNTS_READS_OF.get(cid)
            is_fresh = fresh is None or counted is None or counted in fresh
            if not tracker.update(cause, now, is_fresh):
                self.causes.pop(cid, None)
                continue
            if cause.present:
                self.causes[cid] = cause
            # While a condition is held through its clearing period, the last words stand.
            shown = self.causes[cid]
            since = tracker.since or now
            head, det = self._words(cid, shown, since, now)
            entry = {
                "id": cid,
                "level": LEVELS[cid],
                "since": text.iso(since),
                "headline": text.headline(head),
                "detail": text.detail(det),
            }
            if cid == "device_down":
                # Where the page finds the devices: their positions in facts.devices.list.
                entry["devices"] = [d["index"] for d in shown.context]
            out.append(entry)
        return out

    def active(self, cid: str) -> bool:
        return self.trackers[cid].active

    def devices(self) -> dict | None:
        """facts.devices: every enabled device in order, or None when there is none."""
        if not self.watches:
            return None
        return {"list": [w.fact() for w in self.watches]}
