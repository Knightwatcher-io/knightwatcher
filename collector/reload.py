"""The settings in use: config.toml with the admin page's admin.json laid over it, and the
provider files of the providers folder, at start and whenever any of them changes.

At start config.toml must pass on its own, credentials included, or the collector does not start,
as it always has. admin.json is then laid over it (see collector/overlay.py). When the result
passes it is used; a credential it needs and the environment lacks does not stop it, and that
source runs and fails, saying which variable is missing. When the result fails for any other
reason, the collector runs on config.toml alone and says why in the state file.

A provider file of the folder that fails its checks is left out and never stops the collector:
its problems go to the log and to the state file's `config.problems`, and a section whose `from`
names it runs and fails at every read.

While it runs, the collector looks at both files, and at the folder's files by name, inode, size
and time, at the start of every poll. When any has changed since it last looked, it reads the
folder again and builds the settings again the same way, without requiring
config.toml to pass alone, and takes them up between polls when they pass; when they fail it
keeps the settings it has and says why. Either way the state file's `config` says which version of
admin.json is in use, since when, and the problems of the last change it looked at
(docs/state.md). The output and memory folders change only at a restart.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Callable, Mapping

from collector import config as config_mod
from collector import overlay, providers, text
from collector.config import Config, ConfigError

log = logging.getLogger("collector")

# Settings that a running collector cannot take up: its folders are opened at start.
_AT_START = ("output_dir", "state_dir")


def _missing(config: Config) -> list[str]:
    return [p for problems in config.missing.values() for p in problems]


def _warn(config: Config) -> None:
    """Logs each old setting the settings in use read in today's terms (config.translate)."""
    for warning in config.warnings:
        log.warning("config: %s", warning)


class Settings:
    """Where the settings come from, and whether they have changed since they were last read."""

    def __init__(self, config_path: str, admin_path: str, env: Mapping[str, str]):
        self.config_path = config_path
        self.admin_path = admin_path
        self.env = env
        self._seen: tuple | None = None
        # The providers folder config.toml named when it was last read.
        self.folder: str | None = None

    def _signatures(self) -> tuple:
        return (
            overlay.signature(self.config_path),
            overlay.signature(self.admin_path),
            providers.signature(self.folder),
        )

    def _read(self) -> tuple[dict, providers.Providers]:
        """config.toml and the providers folder it names, read, with what they were when read
        noted first, so that a change while they are read is seen at the next look; ConfigError
        when config.toml cannot be read."""
        files = self._signatures()[:2]
        try:
            raw = config_mod.read(self.config_path)
        except ConfigError:
            self._seen = (*files, providers.signature(self.folder))
            raise
        self.folder = config_mod.providers_folder(raw, self.config_path)
        self._seen = (*files, providers.signature(self.folder))
        return raw, providers.scan(self.folder)

    def start(self) -> tuple[Config, dict]:
        """The settings to start with, and what the state file should say of them.

        Raises ConfigError when config.toml does not pass on its own, credentials included.
        """
        raw, found = self._read()
        for problem in found.problems:
            log.warning("provider file left out: %s", problem)
        alone = config_mod.build(raw, self.env, providers=found)
        given, version, problems = overlay.read(self.admin_path)
        for problem in problems:
            log.warning("admin settings: %s", problem)
        problems = list(found.problems) + problems
        if not given:
            _warn(alone)
            return alone, {"admin": version, "problems": problems}
        try:
            layered = config_mod.build(
                overlay.lay(raw, given), self.env, missing="report", providers=found
            )
        except ConfigError as exc:
            for problem in exc.problems:
                log.warning("admin settings not taken up: %s", problem)
            log.warning("running on config.toml alone")
            _warn(alone)
            return alone, {"admin": None, "problems": problems + exc.problems, "refused": version}
        _warn(layered)
        for problem in _missing(layered):
            log.warning("admin settings: %s; the source runs and fails", problem)
        return layered, {"admin": version, "problems": problems + _missing(layered)}

    def changed(self) -> bool:
        """Whether either file, or a provider file, has changed since the settings were last
        read."""
        return self._signatures() != self._seen

    def take_up(self, running: Config) -> tuple[Config | None, dict]:
        """The settings again, after a change: (the new settings or None to keep running ones,
        what the state file should say of them)."""
        try:
            raw, found = self._read()
        except ConfigError as exc:
            given, version, problems = overlay.read(self.admin_path)
            problems = problems + exc.problems
        else:
            given, version, problems = overlay.read(self.admin_path)
            problems = list(found.problems) + problems
            try:
                new = config_mod.build(
                    overlay.lay(raw, given), self.env, missing="report", providers=found
                )
            except ConfigError as exc:
                problems = problems + exc.problems
            else:
                fixed = [
                    f"collector.{key}: changes only when the collector starts again"
                    for key in _AT_START
                    if new.collector[key] != running.collector[key]
                ]
                if not fixed:
                    _warn(new)
                    for problem in problems + _missing(new):
                        log.warning("settings taken up with a problem: %s", problem)
                    log.info("settings taken up: admin.json %s", version or "none")
                    return new, {"admin": version, "problems": problems + _missing(new)}
                problems = problems + fixed
        for problem in problems:
            log.warning("settings not taken up: %s", problem)
        return None, {"problems": problems, "refused": version}


def note(start: dict, at: dt.datetime) -> dict:
    """The state file's `config` for settings taken up at a time, from what start() or
    take_up() said of them."""
    out = {"admin": start["admin"], "at": text.iso(at), "problems": list(start["problems"])}
    if "refused" in start:
        out["refused"] = start["refused"]
    return out


def poll(settings: Settings, runner, clock: Callable[[], dt.datetime]) -> None:
    """At the start of a poll: take up a change to either file, between polls."""
    if not settings.changed():
        return
    new, said = settings.take_up(runner.config)
    if new is not None:
        runner.reconfigure(new)
        runner.config_note = note(said, clock())
    else:
        # The settings in use stay, with the version and the time they were taken up.
        held = runner.config_note
        runner.config_note = {
            "admin": held["admin"],
            "at": held["at"],
            "problems": said["problems"],
            "refused": said["refused"],
        }
