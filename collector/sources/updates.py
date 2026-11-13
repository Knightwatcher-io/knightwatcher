"""Maintenance runs: a run is under way while its script holds its lock.

The source reads the host's lock table, /proc/locks, and matches the command line of each
process holding a lock against the configured patterns. It never opens the lock files, so it
cannot race a script for its lock, and it needs no mount of the folder they live in.
"""

from __future__ import annotations

import os
import re

from collector.sources import Reading, Source, SourceError


def lock_holders(proc: str) -> set[int]:
    """PIDs holding a lock in the host's lock table, leaving out processes waiting for one."""
    pids = set()
    try:
        with open(os.path.join(proc, "locks"), encoding="ascii") as fh:
            for line in fh:
                fields = line.split()
                if len(fields) < 5 or fields[1] == "->":
                    continue
                try:
                    pid = int(fields[4])
                except ValueError:
                    continue
                if pid > 0:
                    pids.add(pid)
    except OSError as exc:
        raise SourceError(f"cannot read the lock table ({exc.strerror})") from None
    return pids


def command_line(proc: str, pid: int) -> str:
    try:
        with open(os.path.join(proc, str(pid), "cmdline"), "rb") as fh:
            raw = fh.read(4096)
    except OSError:
        return ""
    return raw.replace(b"\0", b" ").decode("utf-8", errors="replace").strip()


class UpdatesSource(Source):
    name = "updates"
    section = "updates"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        self.proc = config.collector["proc_root"]
        self.holders = [(h["name"], re.compile(h["pattern"])) for h in settings["holders"]]

    def fetch(self, now):
        running = []
        for pid in sorted(lock_holders(self.proc)):
            cmd = command_line(self.proc, pid)
            if not cmd:
                continue
            for name, pattern in self.holders:
                if pattern.search(cmd) and name not in running:
                    running.append(name)
        return Reading({"running": bool(running), "what": ", ".join(running)})
