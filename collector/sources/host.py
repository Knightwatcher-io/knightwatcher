"""CPU, load, memory and swap from the host's /proc, and disk use by statvfs.

The source keeps a short history of samples so that CPU and available memory can be judged as
averages over the conditions' windows rather than as single readings. Both are measured from the
window's base sample, the oldest one no older than the window. CPU is the difference in jiffies
between that sample and the latest, so it is exact however the samples are spaced. Available
memory is the mean of the samples after the base, each weighted by the time since the one
before it.
"""

from __future__ import annotations

import datetime as dt
import itertools
import os
import time
from collections import deque
from typing import NamedTuple

from collector.sources import Reading, Source, SourceError

# A poll can start a little late, so a sample this much older than a window still counts as
# inside it. Without it a 30-second window read every 10 seconds would often cover 20.
SLACK_S = 1.0
# The short sample a reading takes when it has no earlier sample to compare with.
FIRST_SAMPLE_S = 0.5


class Sample(NamedTuple):
    at: dt.datetime
    busy: int
    total: int
    avail_pct: float | None  # None for the short CPU sample taken before a first reading


def _base(history, now: dt.datetime, window_s: float):
    """The sample a window is measured from: the oldest one no older than the window, or
    failing that the newest one before the latest. None when there is only the latest."""
    earlier = list(history)[:-1]
    if not earlier:
        return None
    inside = [s for s in earlier if (now - s.at).total_seconds() <= window_s + SLACK_S]
    return inside[0] if inside else earlier[-1]


def cpu_average(history, now: dt.datetime, window_s: float) -> tuple[float, float]:
    """Return (percent busy, seconds covered) from the window's base sample to the latest."""
    latest, base = history[-1], _base(history, now, window_s)
    if base is None:
        return 0.0, 0.0
    d_total = latest.total - base.total
    pct = (latest.busy - base.busy) * 100 / d_total if d_total > 0 else 0.0
    return round(min(100.0, max(0.0, pct)), 1), (latest.at - base.at).total_seconds()


def mem_average(history, now: dt.datetime, window_s: float) -> tuple[float, float]:
    """Return (available percent, seconds covered) from the window's base sample to the latest.

    Each sample after the base stands for the time since the sample before it, so the mean is
    weighted by those gaps; evenly spaced samples get the plain mean.
    """
    latest, base = history[-1], _base(history, now, window_s)
    if base is None:
        return round(latest.avail_pct, 1), 0.0
    weighted = seconds = 0.0
    for before, s in itertools.pairwise(history):
        if s.at <= base.at or s.avail_pct is None:
            continue
        gap = (s.at - before.at).total_seconds()
        weighted += s.avail_pct * gap
        seconds += gap
    mean = weighted / seconds if seconds > 0 else latest.avail_pct
    return round(mean, 1), (latest.at - base.at).total_seconds()


def read_cpu_times(proc: str) -> tuple[int, int, int]:
    """Return (busy, total, cores) jiffies from /proc/stat."""
    cores = 0
    busy = total = None
    with open(os.path.join(proc, "stat"), encoding="ascii") as fh:
        for line in fh:
            if line.startswith("cpu "):
                values = [int(v) for v in line.split()[1:]]
                # user nice system idle iowait irq softirq steal [guest guest_nice]
                # guest time is already counted in user and nice.
                values = values[:8]
                idle = values[3] + (values[4] if len(values) > 4 else 0)
                total = sum(values)
                busy = total - idle
            elif line.startswith("cpu") and line[3].isdigit():
                cores += 1
    if busy is None:
        raise SourceError("no cpu line in stat")
    return busy, total, cores


def read_meminfo(proc: str) -> dict[str, int]:
    out = {}
    with open(os.path.join(proc, "meminfo"), encoding="ascii") as fh:
        for line in fh:
            key, _, rest = line.partition(":")
            parts = rest.split()
            if parts:
                out[key] = int(parts[0])
    return out


def disk_usage(path: str) -> tuple[float, float]:
    """Return (percent used, free gigabytes) the way df counts them."""
    st = os.statvfs(path)
    used = (st.f_blocks - st.f_bfree) * st.f_frsize
    avail = st.f_bavail * st.f_frsize
    if used + avail <= 0:
        raise SourceError(f"no size reported for {path}")
    return round(used * 100 / (used + avail), 1), avail / 1e9


class HostSource(Source):
    name = "host"
    section = "host"

    def __init__(self, settings, config):
        super().__init__(settings, config)
        self.proc = config.collector["proc_root"]
        c = config.conditions
        self.cpu_window_s = c["cpu_hot"]["window_s"]
        self.mem_window_s = c["memory_tight"]["window_s"]
        # The larger window plus one read, so that the oldest sample a window needs is kept.
        pace = max(settings["every_s"], config.interval_s)
        self.keep_s = max(self.cpu_window_s, self.mem_window_s) + pace + SLACK_S
        self.history: deque[Sample] = deque()

    def _prune(self, now: dt.datetime) -> None:
        # A clock that went back makes every later sample meaningless; start again.
        if self.history and self.history[-1].at > now:
            self.history.clear()
        while self.history and (now - self.history[0].at).total_seconds() > self.keep_s:
            self.history.popleft()

    def fetch(self, now):
        self._prune(now)
        first = None
        try:
            busy, jiffies, cores = read_cpu_times(self.proc)
            if not self.history:
                # Nothing to compare with after a start or a long gap: take a short sample so
                # that the first figure is real.
                time.sleep(FIRST_SAMPLE_S)
                first = Sample(now - dt.timedelta(seconds=FIRST_SAMPLE_S), busy, jiffies, None)
                busy, jiffies, cores = read_cpu_times(self.proc)
            with open(os.path.join(self.proc, "loadavg"), encoding="ascii") as fh:
                load1 = float(fh.read().split()[0])
            mem = read_meminfo(self.proc)
        except OSError as exc:
            raise SourceError(f"cannot read /proc ({exc.strerror or exc})") from None
        except (ValueError, IndexError):
            raise SourceError("unexpected /proc format") from None
        total = mem.get("MemTotal", 0)
        if not total or "MemAvailable" not in mem:
            raise SourceError("no MemAvailable in meminfo")
        avail_pct = mem["MemAvailable"] * 100 / total
        swap_total = mem.get("SwapTotal", 0)
        swap_pct = (swap_total - mem.get("SwapFree", 0)) * 100 / swap_total if swap_total else 0.0
        disks = []
        for d in self.settings["disks"]:
            try:
                pct, free = disk_usage(d["path"])
            except OSError as exc:
                raise SourceError(f"cannot stat disk {d['mount']} ({exc.strerror})") from None
            disks.append({"mount": d["mount"], "pct": pct, "free_gb": round(free)})
        if first is not None:
            self.history.append(first)
        self.history.append(Sample(now, busy, jiffies, avail_pct))
        cpu_pct, cpu_span = cpu_average(self.history, now, self.cpu_window_s)
        mem_avg, mem_span = mem_average(self.history, now, self.mem_window_s)
        facts = {
            "cpu_pct": cpu_pct,
            "load1": load1,
            "cores": cores,
            "mem_pct": round(100 - avail_pct, 1),
            "swap_pct": round(swap_pct, 1),
            "disks": disks,
        }
        data = {
            "mem_available_pct": round(avail_pct, 1),
            "mem_available_avg": mem_avg,
            "mem_span_s": mem_span,
            "cpu_span_s": cpu_span,
        }
        return Reading(facts, data)
