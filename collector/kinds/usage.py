"""Usage: the CPU and memory of machines other than this host, the kind behind [[sources.usage]].

Each entry of [[sources.usage]] is the source usage:<name>. It names its provider in `from`: a
provider file of this kind, which may read several machines (each item of its fill giving the
machine's key in `machine`) or one, or "json", the generic source, which is compiled here into an
in-memory provider file (compile_entry) as a check of [[sources.json]] is: one GET to the entry's
url, given whole, with its one header if it has one, and the entry's `cpu` and `memory` paths
filling one machine.

The entry lists the machines it watches in `machines`, each with what the wall calls it (`name`)
and, for a provider that reads several, its key in the service (`id`). A machine the reply gives
that is not listed is ignored, and its key is written nowhere. A listed machine the reply leaves
out has no reading at that read: the read is still ok, and its status says which machines had no
reading (Reading.note), so the status page shows a mistyped id.

A figure is CPU busy or memory used, in percent: a number, or text holding a decimal number, as
Prometheus sends them. NaN, an infinity or a value below 0 gives no reading; a value over 100 is
taken as 100. The kind keeps each machine's readings in the running process alone, never in the
memory file, pruned to the window and one read, and gives each machine the time-weighted mean of
the readings in its window, as the host source gives this host's memory (sources/host.py). Under
strain (collector/conditions.py) judges the machines from that; the kind has no facts and no
events.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import itertools
import json
import math
from collections import deque
from typing import Any

from collector.kinds import GENERIC_USAGE, Kind
from collector.kinds.check import HEADER_HELP, _literal, split_url
from collector.net import SourceError
from collector.sources import Reading

# The provider a [[sources.usage]] entry names to be compiled into a provider of its own.
GENERIC = GENERIC_USAGE
RESOURCES = ("cpu", "memory")
# A read can start a little late, so a reading this much older than a window still counts as
# inside it (the host source's rule).
SLACK_S = 1.0
# The most machines one entry lists.
MAX_MACHINES = 32


class UsageKind(Kind):
    name = "usage"
    section = None
    _ITEM = {  # noqa: RUF012 - read only
        # The machine's key in the service, matched against an entry's `id`; left out by a
        # provider that reads one machine.
        "machine": {"type": "string"},
        # CPU busy, or memory used, in percent: a number or text holding one. An item without it
        # is left out.
        "pct": {"type": "raw", "required": True},
    }
    FILL = {  # noqa: RUF012 - read only
        # One item for each machine whose CPU the service gives.
        "cpu": {"type": "list", "max": 500, "items": _ITEM},
        # The same for memory.
        "memory": {"type": "list", "max": 500, "items": _ITEM},
    }
    SOME_OF = ("cpu", "memory")

    def __init__(self) -> None:
        # (machine's key, resource) -> deque of (time, pct), in the running process alone.
        self.samples: dict[tuple[str, str], deque] = {}

    def provider_spec(self, name: str, settings: dict, registry) -> tuple[Any, dict]:
        """The provider the entry names, or for `from = "json"` the entry compiled into one, and
        the settings the engine reads it with."""
        if settings.get("from") == GENERIC:
            return compile_entry(settings)
        return super().provider_spec(name, settings, registry)

    def reading(self, fill, settings, config, now):
        window = window_of(settings, config)
        listed = settings["machines"]
        found = {res: _by_machine(fill.get(res), res, listed) for res in RESOURCES}
        keep = window + max(settings["every_s"], config.interval_s) + SLACK_S
        machines, missing = [], []
        for m in listed:
            key = m.get("id", "")
            seen = False
            out: dict[str, Any] = {"key": key}
            for res in RESOURCES:
                held = self.samples.setdefault((key, res), deque())
                if held and held[-1][0] > now:
                    # A clock that went back starts the readings again, as for the host.
                    held.clear()
                while held and (now - held[0][0]).total_seconds() > keep:
                    held.popleft()
                pct = found[res].get(key)
                if pct is None:
                    out[res], out[f"{res}_span_s"] = None, 0.0
                    continue
                seen = True
                held.append((now, pct))
                out[res], out[f"{res}_span_s"] = average(held, now, window)
            if not seen:
                missing.append(m["name"])
            machines.append(out)
        note = f"no reading for {', '.join(missing)}" if missing else ""
        return Reading(None, {"machines": machines}, note)


KIND = UsageKind


def window_of(settings: dict, config) -> int:
    """The seconds an entry's machines are averaged over: its own window_s, or Under strain's."""
    own = settings.get("window_s")
    return own if own else config.conditions["cpu_hot"]["window_s"]


def figure(value: Any) -> float | None:
    """A figure as the kind reads it: a number, or text holding a decimal number, in percent; None
    for anything else, NaN, an infinity or a value below 0; 100 for a value over 100."""
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            return None
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return min(100.0, float(value))


def _by_machine(items: list | None, res: str, listed: list[dict]) -> dict[str, float]:
    """A fill's items for one resource as figures by machine key, "" for the one machine of a
    provider that reads one. The first item for a key counts. SourceError when the provider and
    the entry's machines disagree on whether machines have keys."""
    if not items:
        return {}
    keyed = ["machine" in item for item in items]
    if any(keyed) and not all(keyed):
        raise SourceError(f"the provider gave machine on some {res} items and not on others")
    ids = any("id" in m for m in listed)
    if all(keyed) and not ids:
        raise SourceError("the provider reads several machines; give each listed machine an id")
    if not any(keyed) and ids:
        raise SourceError("the provider reads one machine; list it with no id")
    out: dict[str, float] = {}
    for item in items:
        key = item.get("machine", "")
        pct = figure(item["pct"])
        if key not in out and pct is not None:
            out[key] = pct
    return out


def average(samples, now: dt.datetime, window_s: float) -> tuple[float, float]:
    """(the time-weighted mean of the readings in the window, the seconds it covers).

    The window is measured from its base reading, the oldest one no older than the window, or
    failing that the one before the latest; each reading after the base stands for the time since
    the one before it. With the latest reading alone, it is that reading over no time."""
    earlier = list(samples)[:-1]
    latest = samples[-1]
    if not earlier:
        return round(latest[1], 1), 0.0
    inside = [s for s in earlier if (now - s[0]).total_seconds() <= window_s + SLACK_S]
    base = inside[0] if inside else earlier[-1]
    weighted = seconds = 0.0
    for before, s in itertools.pairwise(samples):
        if s[0] <= base[0]:
            continue
        gap = (s[0] - before[0]).total_seconds()
        weighted += s[1] * gap
        seconds += gap
    mean = weighted / seconds if seconds > 0 else latest[1]
    return round(mean, 1), (latest[0] - base[0]).total_seconds()


# Compiling an entry ---------------------------------------------------------------------------


def compile_entry(settings: dict) -> tuple[Any, dict]:
    """An entry of [[sources.usage]] with `from = "json"`, checked by collector/config.py, as a
    provider file of the usage kind (FormatError when it is not one), and the settings its
    provider is made with: one machine, its CPU at the entry's `cpu` path and its memory at its
    `memory` path, either of which may be left out."""
    from collector.providers import format as fmt

    base, path, query = split_url(settings["url"])
    headers: dict[str, str] = {}
    header = settings.get("header") or ""
    if header.lower() != "accept":
        headers["Accept"] = "application/json"
    credentials = {}
    if header:
        headers[header] = "{credential.header}"
        credentials["header"] = HEADER_HELP
    request = {
        "path": _literal(path),
        "query": {k: _literal(v) for k, v in query},
        "headers": headers,
    }
    where = f"usage:{settings['name']}"
    c = fmt._Checker(where)
    spaces = {"credential": set(credentials), "setting": set()}
    requests = fmt._requests(c, [request], spaces, None)
    table = {
        res: {
            "each": "$",
            "vars": {"pct": {"path": settings[res], "type": "raw"}},
            "fields": {"pct": "pct"},
        }
        for res in RESOURCES
        if settings.get(res)
    }
    fill = fmt._fill(c, table, UsageKind.FILL, [""], (), UsageKind.SOME_OF)
    if c.problems:
        raise fmt.FormatError(c.problems)
    shape = {k: settings.get(k) for k in ("url", "cpu", "memory", "header")}
    digest = hashlib.sha256(json.dumps(shape, sort_keys=True).encode()).hexdigest()[:20]
    spec = fmt.Spec(
        GENERIC,
        "usage",
        f"the JSON address of {settings['name']}",
        "",
        credentials,
        {},
        None,
        tuple(requests),
        fill,
        digest,
    )
    return spec, {**settings, "url": base}
