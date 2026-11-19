"""Sources: one module per thing the collector reads, and KindSource for the sections read through
a kind and a provider (collector/kinds/, collector/providers/).

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

__all__ = [
    "AuthError",
    "KindSource",
    "MissingCredentials",
    "Reading",
    "RefusedProvider",
    "Source",
    "SourceError",
    "build_sources",
]


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

        Each event is a dictionary with `type`, `count` and `text`, and, for a type listed in
        contract.EVENT_PARTS, `parts`: the raw values its caption is made of, by name. The runner
        cleans and caps both as it writes them.
        """
        return []


class MissingCredentials(Source):
    """A source whose credentials the environment lacks, taken up while the collector runs.

    It fails at every read with the variables it lacks, by name, so the state file shows the
    source failing and why, and the rest of the collector carries on.
    """

    def __init__(self, name: str, settings: dict[str, Any], config: Config, variables: list[str]):
        super().__init__(settings, config)
        self.name = name
        self.variables = variables

    def fetch(self, now: dt.datetime) -> Reading:
        raise SourceError(f"{' and '.join(self.variables)} missing")


class RefusedProvider(Source):
    """A section whose `from` names a provider file of the user's own that was left out.

    It fails at every read, pointing at the problems the state file's `config` lists, so the source
    shows as failing and why, and the rest of the collector carries on.
    """

    def __init__(self, name: str, settings: dict[str, Any], config: Config, provider: str):
        super().__init__(settings, config)
        self.name = name
        self.provider = provider

    def fetch(self, now: dt.datetime) -> Reading:
        raise SourceError(f"provider {self.provider} refused; see the settings problems")


class KindSource(Source):
    """A section read through a kind: its provider fills the kind's shape, and the kind makes the
    reading and the events. What the runner sees is a source like any other."""

    def __init__(self, name: str, settings: dict[str, Any], config: Config):
        from collector import kinds, providers

        super().__init__(settings, config)
        self.name = name
        self.kind = kinds.kind_class(kinds.SECTIONS[name])()
        self.section = self.kind.section
        self.spec = config.providers.get(kinds.provider_of(name, settings))
        self.allowed = self.kind.allowed(settings)
        self.provider = providers.make(
            self.spec, settings, config.secret(name), self.timeout, self.allowed
        )

    @property
    def identity(self) -> str:
        """The provider and the version of its file, for the runner's test of sameness."""
        return f"{self.spec.id}:{self.spec.digest}"

    def fill(self, now: dt.datetime) -> dict:
        """One read of the provider, held to the kind's declaration."""
        from collector.kinds import check_fill

        return check_fill(self.kind.FILL, self.provider.read(now), self.allowed)

    def fetch(self, now: dt.datetime) -> Reading:
        return self.kind.reading(self.fill(now), self.settings, self.config, now)

    def observe(self, reading: Reading, memory: dict, now: dt.datetime) -> list[dict]:
        return self.kind.observe(reading, memory, self.settings, self.config, now)


def _variables(problems: list[str]) -> list[str]:
    """The variables named by the problems of Config.missing: ".env: NAME missing (for x)"."""
    return [p.split(": ", 1)[1].split(" ", 1)[0] for p in problems]


def build_sources(config: Config) -> list[Source]:
    from collector.kinds import SECTIONS, provider_of
    from collector.sources import (
        backup,
        containers,
        devices,
        dns,
        host,
        security,
        ssh,
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
        "security": security.SecuritySource,
    }
    built: list[Source] = []
    for name, settings in config.sources.items():
        if name == "pi":
            # The Pi of [sources.pi] is a device, kept in its place among the sources.
            pi = next(t for t in config.devices if t["legacy"])
            built.append(devices.DeviceSource(pi, config))
        elif name in config.missing:
            variables = _variables(config.missing[name])
            built.append(MissingCredentials(name, settings, config, variables))
        elif name in SECTIONS and config.providers.is_refused(provider_of(name, settings)):
            built.append(RefusedProvider(name, settings, config, provider_of(name, settings)))
        elif name in SECTIONS:
            built.append(KindSource(name, settings, config))
        else:
            built.append(classes[name](settings, config))
    built += [devices.DeviceSource(t, config) for t in config.devices if not t["legacy"]]
    return built
