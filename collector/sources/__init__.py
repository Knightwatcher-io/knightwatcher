"""Sources: one module per thing the collector reads.

Every source follows the interface of `Source`. The runner calls `fetch` in a worker thread with
a deadline, and `observe` afterwards in the main thread. A source that raises is marked not ok
for that poll, its facts section becomes null, and the others carry on.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from collector.config import Config
from collector.net import AuthError, SourceError

__all__ = ["AuthError", "Reading", "Source", "SourceError", "build_sources"]


@dataclass
class Reading:
    """What one fetch found.

    facts: the source's section of `facts` in state.json, or None for a source without one.
    data:  anything else the source needs for its events or the conditions.
    """

    facts: dict[str, Any] | None
    data: dict[str, Any] = field(default_factory=dict)


class Source:
    #: Key in the `sources` section of state.json.
    name: str = ""
    #: Key in the `facts` section, or None when the source has no facts of its own.
    section: str | None = None

    def __init__(self, settings: dict[str, Any], config: Config):
        self.settings = settings
        self.config = config
        self.timeout = config.collector["http_timeout_s"]

    def fetch(self, now: dt.datetime) -> Reading:
        """Read the source. Runs in a worker thread; raise SourceError on failure."""
        raise NotImplementedError

    def observe(self, reading: Reading, memory: dict, now: dt.datetime) -> list[dict]:
        """Turn a reading into events. Runs in the main thread after a successful fetch.

        memory is this source's persisted dictionary. It is empty on the first start, when the
        source records what is already there and returns no events.
        """
        return []


def build_sources(config: Config) -> list[Source]:
    from collector.sources import (
        adblock,
        backup,
        containers,
        dns,
        host,
        imports,
        security,
        ssh,
        streams,
        things,
        updates,
        wan,
    )

    classes: dict[str, type[Source]] = {
        "host": host.HostSource,
        "containers": containers.ContainersSource,
        "wan": wan.WanSource,
        "dns": dns.DnsSource,
        "backup": backup.BackupSource,
        "updates": updates.UpdatesSource,
        "ssh": ssh.SshSource,
        "streams": streams.StreamsSource,
        "adblock": adblock.AdblockSource,
        "security": security.SecuritySource,
        "sonarr": imports.SonarrSource,
        "radarr": imports.RadarrSource,
    }
    built: list[Source] = []
    for name, settings in config.sources.items():
        if name == "pi":
            # The Pi of [sources.pi] is a watched thing, kept in its place among the sources.
            pi = next(t for t in config.things if t["legacy"])
            built.append(things.ThingSource(pi, config))
        else:
            built.append(classes[name](settings, config))
    built += [things.ThingSource(t, config) for t in config.things if not t["legacy"]]
    return built
