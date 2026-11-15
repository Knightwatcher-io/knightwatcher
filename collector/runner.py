"""One poll: read the sources that are due in parallel, judge the conditions, write state.json.

Each source is read at its own pace (`every_s`). Between reads its last reading stands: it is
shown and judged again, but it is not observed again, so it raises no events, and its entry in
`sources` keeps the time of the real read.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import logging
import os
import threading
import time
from collections.abc import Callable

from collector import SCHEMA, contract, text
from collector.conditions import FIRST_READ, Conditions
from collector.config import Config
from collector.net import AuthError, SourceError
from collector.sources import Reading, Source, build_sources
from collector.store import Memory, atomic_write

log = logging.getLogger("collector")

EVENTS_KEPT = 20
STATE_FILE = "state.json"
# Polls start a few milliseconds late or early, so a source this close to its pace is read now
# rather than a whole interval later.
PACE_SLACK_S = 1.0


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class _Job:
    def __init__(self, source: Source, now: dt.datetime):
        self.source = source
        self.now = now  # the collector's clock when the read began
        self.started = time.monotonic()
        self.timed_out = False
        self.reading: Reading | None = None
        self.error: BaseException | None = None
        self.thread = threading.Thread(
            target=self._run, args=(now,), name=f"source-{source.name}", daemon=True
        )

    def _run(self, now: dt.datetime) -> None:
        try:
            self.reading = self.source.fetch(now)
        except BaseException as exc:  # noqa: BLE001 - every failure is reported, none escapes
            self.error = exc


class Runner:
    def __init__(
        self,
        config: Config,
        memory: Memory,
        sources: list[Source] | None = None,
        clock: Callable[[], dt.datetime] = utcnow,
    ):
        self.config = config
        self.memory = memory
        self.sources = sources if sources is not None else build_sources(config)
        self.clock = clock
        self.conditions = Conditions(config)
        self._inflight: dict[str, _Job] = {}
        # When each source's last read began, and what that read gave once observed.
        self._read_at: dict[str, dt.datetime] = {}
        self._last: dict[str, tuple[Reading | None, dict]] = {}
        self._last_ok: dict[str, bool] = {}
        self._secrets = sorted(config.secret_values(), key=len, reverse=True)
        self.out_path = os.path.join(config.collector["output_dir"], STATE_FILE)
        # The settings in use: the version of admin.json laid over config.toml, when they were
        # taken up, and the problems of the last change looked at (collector/reload.py). Written
        # to the file as `config`.
        self.config_note: dict = {"admin": None, "at": text.iso(clock()), "problems": []}

    # Taking up a change ------------------------------------------------------------------------

    @staticmethod
    def _sameness(source: Source, config: Config) -> str:
        """What a source's reads depend on: its class, its settings and the collector's settings,
        and for the host source the averaging windows it keeps samples for."""
        windows = (
            [config.conditions[c]["window_s"] for c in ("cpu_hot", "memory_tight")]
            if source.name == "host"
            else []
        )
        return json.dumps(
            [type(source).__name__, source.settings, config.collector, windows],
            sort_keys=True,
            default=str,
        )

    def reconfigure(self, config: Config, sources: list[Source] | None = None) -> None:
        """Take up a new configuration between polls.

        A source whose reads would be the same keeps its instance, its last reading and any read
        in flight, so that it is not read again early and the host keeps its samples. A source
        that changed, was added or was taken away starts afresh: its last reading is dropped, and
        a read still running for it is left to finish unseen. The conditions keep their state
        (see Conditions.reconfigure), and the interval takes effect from the next poll.
        """
        new = sources if sources is not None else build_sources(config)
        before = {s.name: s for s in self.sources}
        kept: list[Source] = []
        for source in new:
            old = before.get(source.name)
            if old is not None and self._sameness(old, self.config) == self._sameness(
                source, config
            ):
                old.config = config
                kept.append(old)
            else:
                self._forget(source.name)
                kept.append(source)
        for name in set(before) - {s.name for s in kept}:
            self._forget(name)
        self.sources = kept
        self.config = config
        self.conditions.reconfigure(config)
        self._secrets = sorted(config.secret_values(), key=len, reverse=True)

    def _forget(self, name: str) -> None:
        for held in (self._inflight, self._read_at, self._last, self._last_ok):
            held.pop(name, None)

    # Errors ------------------------------------------------------------------------------------

    def _scrub(self, message: str) -> str:
        for value in self._secrets:
            message = message.replace(value, "***")
        return text.clip(message, 80)

    def _describe(self, exc: BaseException) -> str:
        if isinstance(exc, SourceError):
            return self._scrub(str(exc))
        return self._scrub(f"internal error ({type(exc).__name__})")

    # Reading -----------------------------------------------------------------------------------

    def _deadline_s(self) -> float:
        # How long a poll waits for its reads, so that a slow source never delays the file past
        # its interval. A read still running then carries on into later polls (see _limit_s).
        return max(1.0, self.config.interval_s * 0.66)

    @staticmethod
    def _every_s(source: Source) -> float:
        return float(source.settings.get("every_s", 0))

    def _limit_s(self, source: Source) -> float:
        """How long one read may run before it counts as timed out.

        The same share of the source's own pace as a poll waits of the interval, so a source
        read every 30 seconds keeps about 20 seconds for a read that tries two addresses in turn
        while the polls run every 10.
        """
        return self._deadline_s() * max(1.0, self._every_s(source) / self.config.interval_s)

    def _due(self, source: Source, now: dt.datetime) -> bool:
        last = self._read_at.get(source.name)
        if last is None:
            return True
        elapsed = (now - last).total_seconds()
        # A clock that went back would otherwise hold the source until it caught up.
        return elapsed < 0 or elapsed + PACE_SLACK_S >= self._every_s(source)

    def _outcome(self, job: _Job, now: dt.datetime) -> tuple[Reading | None, dict]:
        """The reading and status of a read that has finished."""
        name = job.source.name
        at = text.iso(job.now)
        if job.error is None:
            return job.reading, {"ok": True, "at": at, "error": ""}
        message = self._describe(job.error)
        if isinstance(job.error, AuthError):
            until = now + dt.timedelta(seconds=self.config.collector["auth_backoff_s"])
            self.memory.data["backoff"][name] = {
                "until": text.iso(until),
                "at": at,
                "error": message,
            }
            local = until.astimezone(self.config.tz)
            message = f"{message}; paused until {local:%H:%M}"
        elif not isinstance(job.error, SourceError):
            log.error("source %s failed", name, exc_info=job.error)
        return None, {"ok": False, "at": at, "error": message}

    def read_sources(
        self, now: dt.datetime
    ) -> tuple[dict[str, Reading | None], dict[str, dict], set[str]]:
        """Read the sources that are due and return (readings, status, fresh).

        fresh names the sources whose reading comes from a read that finished at this poll.
        Every other source shows its last reading and status again, or nothing while paused.
        """
        readings: dict[str, Reading | None] = {}
        status: dict[str, dict] = {}
        fresh: set[str] = set()
        backoff = self.memory.data["backoff"]
        for source in self.sources:
            name = source.name
            paused = backoff.get(name)
            if paused and text.parse_iso(paused["until"]) > now:
                until = text.parse_iso(paused["until"]).astimezone(self.config.tz)
                status[name] = {
                    "ok": False,
                    "at": paused["at"],
                    "error": f"{paused['error']}; paused until {until:%H:%M}",
                }
                readings[name] = None
                continue
            backoff.pop(name, None)
            if name not in self._inflight and self._due(source, now):
                job = _Job(source, now)
                self._inflight[name] = job
                self._read_at[name] = now
                job.thread.start()

        # Wait for every read in flight, including one started at an earlier poll, but not for
        # one already given up on: a hung read would otherwise hold up every poll.
        deadline = time.monotonic() + self._deadline_s()
        for job in list(self._inflight.values()):
            if not job.timed_out:
                job.thread.join(max(0.0, deadline - time.monotonic()))

        for source in self.sources:
            name = source.name
            if name in status:
                continue
            job = self._inflight.get(name)
            if job is not None and not job.thread.is_alive():
                del self._inflight[name]
                if not job.timed_out:
                    readings[name], status[name] = self._outcome(job, now)
                    fresh.add(name)
                    continue
                # A read that ran past its limit is dropped, and the source is read again at its
                # own pace, counted from when that read began.
            elif job is not None and time.monotonic() - job.started > self._limit_s(source):
                error = "previous read still running" if job.timed_out else "timed out"
                job.timed_out = True
                self._last[name] = (None, {"ok": False, "at": text.iso(job.now), "error": error})
            last = self._last.get(name)
            if last is None:
                # Only a first read that is still within its limit gets here.
                at = text.iso(job.now if job is not None else now)
                last = (None, {"ok": False, "at": at, "error": FIRST_READ})
            readings[name], status[name] = last[0], dict(last[1])
        return readings, status, fresh

    # Events ------------------------------------------------------------------------------------

    def observe(self, readings, status, now, fresh: set[str] | None = None) -> list[dict]:
        """Turn fresh readings into events. A reused reading was observed when it was read."""
        found = []
        for source in self.sources:
            reading = readings.get(source.name)
            if reading is None or (fresh is not None and source.name not in fresh):
                continue
            try:
                found += source.observe(reading, self.memory.source(source.name), now)
            except Exception as exc:
                log.error("source %s could not be observed", source.name, exc_info=exc)
                readings[source.name] = None
                status[source.name] = {
                    "ok": False,
                    "at": text.iso(now),
                    "error": self._describe(exc),
                }
        events = self.memory.data["events"]
        for e in found:
            self.memory.data["seq"] += 1
            events.append(
                {
                    "seq": self.memory.data["seq"],
                    "type": e["type"],
                    "at": text.iso(now),
                    "count": max(1, int(e.get("count", 1))),
                    "text": "" if e["type"] == "ad_blocked" else text.event_text(e.get("text", "")),
                }
            )
        del events[:-EVENTS_KEPT]
        return found

    # The file ----------------------------------------------------------------------------------

    def quiet_line(self, readings) -> str:
        parts = ["ALL QUIET"]
        containers = readings.get("containers")
        if containers is not None:
            parts.append(f"{containers.facts['running']} up")
        backup = readings.get("backup")
        if backup is not None and backup.facts["last_ok"]:
            when = text.parse_iso(backup.facts["last_ok"]).astimezone(self.config.tz)
            parts.append(f"backup {when:%H:%M}")
        adblock = readings.get("adblock")
        if adblock is not None:
            # The longest wording that fits; a busy network's count is shortened before it is
            # dropped.
            n = adblock.facts["blocked_today"]
            for part in (
                f"{text.count(n)} ads blocked",
                f"{text.short_count(n)} ads blocked",
                f"{text.short_count(n)} blocked",
            ):
                if len(text.SEP.join([*parts, part])) <= text.QUIET_LINE_MAX:
                    parts.append(part)
                    break
        return text.join_fitting(parts, text.QUIET_LINE_MAX)

    def cycle(self) -> dict:
        now = self.clock()
        readings, status, fresh = self.read_sources(now)
        self.observe(readings, status, now, fresh)
        for name in fresh:
            self._last[name] = (readings[name], status[name])
        conditions = self.conditions.evaluate(readings, now, fresh, status)

        security = readings.get("security")
        if security is not None:
            security.facts["attack"] = self.conditions.active("attack")

        facts = {}
        for section in contract.FACT_SECTIONS:
            reading = readings.get(section)
            facts[section] = reading.facts if reading is not None else None
        # Judged by the conditions from each thing's source, as security.attack is.
        facts["things"] = self.conditions.things()

        state = {
            "schema": SCHEMA,
            "generated_at": text.iso(now),
            "interval_s": int(self.config.interval_s),
            "conditions": conditions,
            "quiet_line": self.quiet_line(readings),
            "events": list(self.memory.data["events"]),
            "facts": facts,
            "sources": {s.name: status[s.name] for s in self.sources},
            # The settings screen's household defaults, as the settings in use set them.
            "defaults": copy.deepcopy(self.config.defaults),
            # The settings in use, for the admin page.
            "config": copy.deepcopy(self.config_note),
        }
        problems = contract.validate(state)
        for problem in problems:
            log.error("state breaks the contract: %s", problem)

        self._log_changes(status)
        atomic_write(self.out_path, json.dumps(state, ensure_ascii=False, indent=1).encode("utf-8"))
        self.memory.save()
        return state

    def _log_changes(self, status: dict) -> None:
        for name, s in status.items():
            if self._last_ok.get(name) != s["ok"]:
                if s["ok"]:
                    log.info("source %s ok", name)
                else:
                    log.warning("source %s not ok: %s", name, s["error"])
            self._last_ok[name] = s["ok"]
