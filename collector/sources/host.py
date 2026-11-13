"""CPU, load, memory and swap from the host's /proc, and disk use by statvfs."""

from __future__ import annotations

import os
import time

from collector.sources import Reading, Source, SourceError


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
        self._last: tuple[int, int] | None = None

    def _cpu_pct(self) -> tuple[float, int]:
        busy, total, cores = read_cpu_times(self.proc)
        if self._last is None:
            # First reading: take a short sample so the first file has a real figure.
            time.sleep(0.5)
            self._last = (busy, total)
            busy, total, cores = read_cpu_times(self.proc)
        last_busy, last_total = self._last
        self._last = (busy, total)
        d_total = total - last_total
        pct = (busy - last_busy) * 100 / d_total if d_total > 0 else 0.0
        return round(min(100.0, max(0.0, pct)), 1), cores

    def fetch(self, now):
        try:
            cpu_pct, cores = self._cpu_pct()
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
        facts = {
            "cpu_pct": cpu_pct,
            "load1": load1,
            "cores": cores,
            "mem_pct": round(100 - avail_pct, 1),
            "swap_pct": round(swap_pct, 1),
            "disks": disks,
        }
        return Reading(facts, {"mem_available_pct": round(avail_pct, 1)})
