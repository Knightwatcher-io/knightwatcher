"""Container state from a read-only Docker API proxy over HTTP."""

from __future__ import annotations

import fnmatch
import re

from collector.net import fetch_json
from collector.sources import Reading, Source, SourceError

_EXIT = re.compile(r"^Exited \((-?\d+)\)")


def classify(state: str, status: str) -> str:
    """Return one of ok, unhealthy, restarting, failed for a container's State and Status."""
    state = (state or "").lower()
    if state == "restarting":
        return "restarting"
    if state == "dead":
        return "failed"
    if state == "exited":
        m = _EXIT.match(status or "")
        return "failed" if m and int(m.group(1)) != 0 else "ok"
    if "(unhealthy)" in (status or ""):
        return "unhealthy"
    return "ok"


def ignored(name: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


class ContainersSource(Source):
    name = "containers"
    section = "containers"

    def fetch(self, now):
        url = self.settings["url"].rstrip("/") + "/containers/json?all=1"
        items = fetch_json(url, self.timeout)
        if not isinstance(items, list):
            raise SourceError("unexpected reply from the Docker API")
        facts = {"total": 0, "running": 0, "unhealthy": [], "restarting": [], "failed": []}
        bad: dict[str, dict] = {}
        for c in items:
            names = c.get("Names") or [""]
            name = names[0].lstrip("/")
            if not name or ignored(name, self.settings["ignore"]):
                continue
            state, status = c.get("State", ""), c.get("Status", "")
            facts["total"] += 1
            if state == "running":
                facts["running"] += 1
            kind = classify(state, status)
            if kind != "ok":
                facts[kind].append(name)
                bad[name] = {"kind": kind, "status": status}
        for kind in ("unhealthy", "restarting", "failed"):
            facts[kind].sort()
        return Reading(facts, {"bad": bad})
