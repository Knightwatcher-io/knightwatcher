"""One poll: read every source in parallel, judge the conditions, write state.json."""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
import time
from collections.abc import Callable

from collector import SCHEMA, contract, text
from collector.conditions import Conditions
from collector.config import Config
from collector.net import AuthError, SourceError
from collector.sources import Reading, Source, build_sources
from collector.store import Memory, atomic_write

log = logging.getLogger("collector")

EVENTS_KEPT = 20
STATE_FILE = "state.json"


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class _Job:
    def __init__(self, source: Source, now: dt.datetime):
        self.source = source
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
        self._last_ok: dict[str, bool] = {}
        self._secrets = sorted(config.secret_values(), key=len, reverse=True)
        self.out_path = os.path.join(config.collector["output_dir"], STATE_FILE)

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
        # Long enough for a source that tries two addresses in turn, short enough that a slow
        # source never delays the file past its interval.
        return max(1.0, self.config.interval_s * 0.66)

    def read_sources(self, now: dt.datetime) -> tuple[dict[str, Reading | None], dict]:
        readings: dict[str, Reading | None] = {}
        status: dict[str, dict] = {}
        backoff = self.memory.data["backoff"]
        jobs: list[_Job] = []
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
            busy = self._inflight.get(name)
            if busy is not None and busy.thread.is_alive():
                status[name] = {
                    "ok": False,
                    "at": text.iso(now),
                    "error": "previous read still running",
                }
                readings[name] = None
                continue
            job = _Job(source, now)
            self._inflight[name] = job
            job.thread.start()
            jobs.append(job)

        deadline = time.monotonic() + self._deadline_s()
        for job in jobs:
            job.thread.join(max(0.0, deadline - time.monotonic()))

        for job in jobs:
            name = job.source.name
            at = text.iso(now)
            if job.thread.is_alive():
                readings[name] = None
                status[name] = {"ok": False, "at": at, "error": "timed out"}
                continue
            if job.error is not None:
                readings[name] = None
                message = self._describe(job.error)
                if isinstance(job.error, AuthError):
                    until = now + dt.timedelta(seconds=self.config.collector["auth_backoff_s"])
                    backoff[name] = {"until": text.iso(until), "at": at, "error": message}
                    local = until.astimezone(self.config.tz)
                    message = f"{message}; paused until {local:%H:%M}"
                elif not isinstance(job.error, SourceError):
                    log.error("source %s failed", name, exc_info=job.error)
                status[name] = {"ok": False, "at": at, "error": message}
                continue
            readings[name] = job.reading
            status[name] = {"ok": True, "at": at, "error": ""}
        return readings, status

    # Events ------------------------------------------------------------------------------------

    def observe(self, readings, status, now) -> list[dict]:
        found = []
        for source in self.sources:
            reading = readings.get(source.name)
            if reading is None:
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
        readings, status = self.read_sources(now)
        self.observe(readings, status, now)
        conditions = self.conditions.evaluate(readings, now)

        security = readings.get("security")
        if security is not None:
            security.facts["attack"] = self.conditions.active("attack")

        facts = {}
        for section in contract.FACT_SECTIONS:
            reading = readings.get(section)
            facts[section] = reading.facts if reading is not None else None

        state = {
            "schema": SCHEMA,
            "generated_at": text.iso(now),
            "interval_s": int(self.config.interval_s),
            "conditions": conditions,
            "quiet_line": self.quiet_line(readings),
            "events": list(self.memory.data["events"]),
            "facts": facts,
            "sources": {s.name: status[s.name] for s in self.sources},
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
