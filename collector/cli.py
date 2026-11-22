"""Command line: run the loop, run once, check the configuration, report health, or probe one
source read through a provider."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import logging
import os
import signal
import sys
import threading
import time
import urllib.parse

from collector import kinds, overlay, reload, text
from collector.config import ConfigError, credential_names, load, read_env_file
from collector.net import AuthError, SourceError
from collector.runner import STATE_FILE, Runner, utcnow
from collector.store import MEMORY_FILE, Memory, atomic_write

DEFAULT_CONFIG = "/etc/knightwatcher/config.toml"
# Beside state.json: the names of the credential variables the collector's environment holds, for
# the bundled server's admin page. Never a value.
CREDENTIALS_FILE = "credentials.json"

log = logging.getLogger("collector")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="collector", description="Knightwatcher collector")
    p.add_argument("--config", default=os.environ.get("KNIGHTWATCHER_CONFIG", DEFAULT_CONFIG))
    p.add_argument(
        "--admin",
        default=os.environ.get("KNIGHTWATCHER_ADMIN_FILE", overlay.DEFAULT_PATH),
        metavar="PATH",
        help="the admin page's settings, laid over the config (default %(default)s)",
    )
    p.add_argument(
        "--env-file",
        metavar="PATH",
        help="with --check-config or --probe: read the credentials from this .env file, not the "
        "environment",
    )
    p.add_argument(
        "--record",
        metavar="FOLDER",
        help="with --probe: also write the exchanges to a file in this folder, each credential "
        "replaced by its field's name; the replies in it are private",
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="run one poll, write the file, exit")
    mode.add_argument(
        "--check-config",
        action="store_true",
        help="validate the config and the credentials, then exit",
    )
    mode.add_argument(
        "--health", action="store_true", help="exit 1 if state.json is older than 3 intervals"
    )
    mode.add_argument(
        "--probe",
        metavar="SOURCE",
        help="read one source through its provider once, with the settings in use, and print "
        "what it gave with every text masked",
    )
    return p


# ---- --probe -----------------------------------------------------------------------------------


def _mask(value):
    """A fill or facts with every text replaced by its type and length: `<string 21>`."""
    if isinstance(value, str):
        return f"<string {len(value)}>"
    if isinstance(value, dt.datetime):
        return "<time>"
    if isinstance(value, dict):
        return {k: _mask(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask(v) for v in value]
    return value


def _paused(config, name: str, now: dt.datetime) -> dt.datetime | None:
    """When the running collector's pause of a source ends, from its memory file, or None."""
    try:
        with open(os.path.join(config.collector["state_dir"], MEMORY_FILE), encoding="utf-8") as fh:
            held = json.load(fh)["backoff"][name]
        until = text.parse_iso(held["until"])
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return until if until > now else None


def _record(folder: str, name: str, source, exchanges: list, values: dict, now) -> str:
    """The exchanges of a probe, written to a file of their own; each credential value replaced by
    its field's name wherever it appears, in a reply or an error as well as in a request (a
    service may echo a request's address back), as written or percent-encoded, and the address
    by the setting's name."""
    base = source.settings["url"].rstrip("/")
    forms = []
    for field, value in values.items():
        if not value:
            continue
        shown = "{credential." + field + "}"
        for form in {value, urllib.parse.quote(value, safe=""), urllib.parse.quote_plus(value)}:
            forms.append((form, shown))
    forms.sort(key=lambda fs: -len(fs[0]))

    def hide(text_: str) -> str:
        for form, shown in forms:
            text_ = text_.replace(form, shown)
        return text_

    def hidden(value):
        if isinstance(value, str):
            return hide(value)
        if isinstance(value, dict):
            return {hide(k): hidden(v) for k, v in value.items()}
        if isinstance(value, list):
            return [hidden(v) for v in value]
        return value

    out = []
    for e in exchanges:
        headers = {}
        for key, value in e["headers"].items():
            if key.lower() == "authorization" and value.startswith("Basic "):
                value = "Basic " + base64.b64decode(value[6:]).decode("utf-8", "replace")
            headers[key] = hide(value)
        url = e["url"][len(base) :] if e["url"].startswith(base) else e["url"]
        entry = {
            "request": {
                "id": e["request"],
                "method": e.get("method", "GET"),
                "path": hide(url),
                "headers": headers,
            }
        }
        if "json" in e:
            # A session login's body, as the provider file writes it, its templates unfilled.
            entry["request"]["json"] = e["json"]
        if "reply" in e:
            entry["reply"] = {"json": hidden(e["reply"])}
        else:
            entry["error"] = hide(e["error"])
        out.append(entry)
    os.makedirs(folder, exist_ok=True)
    # imports:whisparr is written imports-whisparr, a name every file system takes.
    stem = name.replace(":", "-")
    path = os.path.join(folder, f"{stem}-{now.astimezone(dt.UTC):%Y%m%dT%H%M%SZ}.json")
    doc = {"source": name, "provider": source.spec.id, "exchanges": out}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    return path


def _probe(config, name: str, record: str | None) -> int:
    from collector.sources import KindSource

    if kinds.kind_of(name) is None:
        names = ", ".join(kinds.SECTIONS)
        lists = ", ".join(f"{n}:<name> for an entry of [[sources.{n}]]" for n in kinds.LISTS)
        print(
            f"probe: {name} is not read through a provider; use {names}, or {lists}",
            file=sys.stderr,
        )
        return 2
    if name not in config.sources:
        head, colon, entry = name.partition(":")
        what = f'no [[sources.{head}]] entry named "{entry}"' if colon else f"[sources.{name}]"
        print(f"probe: {what} is not set up, or is off", file=sys.stderr)
        return 2
    if name in config.missing:
        for problem in config.missing[name]:
            print(f"probe: {problem}", file=sys.stderr)
        return 2
    pid = kinds.provider_of(name, config.sources[name])
    if config.providers.is_refused(pid):
        print(f"probe: provider {pid} refused:", file=sys.stderr)
        for problem in config.providers.refused[pid]:
            print(f"probe: {problem}", file=sys.stderr)
        return 2
    now = utcnow()
    until = _paused(config, name, now)
    if until is not None:
        local = until.astimezone(config.tz)
        print(
            f"probe {name}: paused after refused credentials until {local:%H:%M}; not read, "
            "so the service is not asked again",
            file=sys.stderr,
        )
        return 1
    source = KindSource(name, config.sources[name], config)
    settings = source.settings
    said = [f"provider {source.spec.id} ({source.spec.name})"]
    if "show" in settings:
        said.append(f"show = {settings['show']}")
    print(f"probe {name}: " + ", ".join(said))
    variables = [
        f"KNIGHTWATCHER_{settings['secret'].upper()}_{f.upper()}" for f in source.spec.credentials
    ]
    if variables:
        print("credentials: " + ", ".join(variables))
    if record:
        source.provider.record = []
    secrets = sorted(config.secret_values(), key=len, reverse=True)
    try:
        fill = source.fill(now)
        reading = source.kind.reading(fill, settings, config, now)
    except SourceError as exc:
        message = str(exc)
        for value in secrets:
            message = message.replace(value, "***")
        what = "credentials refused" if isinstance(exc, AuthError) else "failed"
        print(f"probe {name}: {what}: {message}", file=sys.stderr)
        return 1
    finally:
        # A provider that logs in ends its session, so that a probe holds none of the service's.
        source.close()
        if record:
            path = _record(record, name, source, source.provider.record, config.secret(name), now)
            print(f"recorded: {path}")
    print("fill:")
    print(json.dumps(_mask(fill), ensure_ascii=False, indent=1))
    print("facts:")
    print(json.dumps(_mask(reading.facts), ensure_ascii=False, indent=1))
    return 0


def _check(config) -> int:
    """--check-config, once config.toml has passed: the provider files. Exit 2 when a section's
    `from` names a file that was left out, which would leave that source failing; the problems of
    a file no section names, or of the folder, are warnings, and the exit is 0."""
    used = {name: kinds.provider_of(name, config.sources[name]) for name in config.refused_in_use()}
    filed = [p for found in config.providers.refused.values() for p in found]
    for pid, problems in config.providers.refused.items():
        for problem in problems:
            if pid in used.values():
                print(f"config: {problem}", file=sys.stderr)
            else:
                print(f"warning: {problem} (no source reads it)", file=sys.stderr)
    for problem in config.providers.problems:
        if problem not in filed:
            print(f"warning: {problem}", file=sys.stderr)
    for name, pid in used.items():
        print(
            f"config: {config.where(name)}.from: provider {pid} refused, as above", file=sys.stderr
        )
    if used:
        return 2
    names = ", ".join(config.sources) or "none"
    line = f"config ok: {len(config.sources)} sources enabled ({names})"
    if config.devices:
        watched = ", ".join(t["name"] for t in config.devices)
        line += f"; {len(config.devices)} watched ({watched})"
    if config.providers.own:
        line += f"; provider files: {', '.join(config.providers.own)}"
    print(line)
    return 0


def _health(config) -> int:
    path = os.path.join(config.collector["output_dir"], STATE_FILE)
    try:
        age = time.time() - os.stat(path).st_mtime
    except OSError:
        print(f"unhealthy: {STATE_FILE} missing", file=sys.stderr)
        return 1
    # The admin page may have set another interval: the file says the one in use.
    interval = config.interval_s
    try:
        with open(path, encoding="utf-8") as fh:
            written = json.load(fh).get("interval_s")
        if isinstance(written, int) and not isinstance(written, bool) and written > 0:
            interval = max(interval, written)
    except (OSError, ValueError, AttributeError):
        pass
    if age > 3 * interval:
        print(f"unhealthy: {STATE_FILE} is {age:.0f} s old", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.env_file and not (args.check_config or args.probe):
        parser.error("--env-file goes with --check-config or --probe")
    if args.record and not args.probe:
        parser.error("--record goes with --probe")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        stream=sys.stderr,
    )
    logging.Formatter.converter = time.gmtime
    settings = None
    try:
        if args.health:
            env = None  # the health check needs no credentials
        elif args.env_file:
            env = read_env_file(args.env_file)
        else:
            env = os.environ
        if args.health or args.check_config:
            # config.toml alone, which is what the collector needs to start.
            config = load(args.config, env)
        else:
            settings = reload.Settings(args.config, args.admin, env)
            config, said = settings.start()
    except ConfigError as exc:
        for problem in exc.problems:
            print(f"config: {problem}", file=sys.stderr)
        return 2

    if args.health:
        return _health(config)
    if args.probe:
        return _probe(config, args.probe, args.record)
    if args.check_config:
        return _check(config)

    for key in ("output_dir", "state_dir"):
        folder = config.collector[key]
        if not os.path.isdir(folder) or not os.access(folder, os.W_OK):
            print(f"collector.{key}: {folder} is not a writable folder", file=sys.stderr)
            return 2

    memory = Memory(config.collector["state_dir"])
    try:
        memory.lock()
        memory.load()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    runner = Runner(config, memory)
    runner.config_note = reload.note(said, utcnow())
    try:
        names = json.dumps(credential_names(env), indent=1).encode("utf-8")
        atomic_write(os.path.join(config.collector["output_dir"], CREDENTIALS_FILE), names, 0o640)
    except OSError as exc:
        log.warning("cannot write %s: %s", CREDENTIALS_FILE, exc.strerror)
    log.info("collector started: %d sources, every %d s", len(runner.sources), config.interval_s)
    if args.once:
        try:
            runner.cycle()
        finally:
            runner.close()
        return 0

    stop = threading.Event()

    def _stop(signum, _frame):
        log.info("stopping on signal %d", signum)
        stop.set()

    # As PID 1 in a container, a signal without a handler is ignored.
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while not stop.is_set():
        started = time.monotonic()
        try:
            reload.poll(settings, runner, utcnow)
        except Exception:
            log.exception("the settings could not be read again")
        try:
            runner.cycle()
        except Exception:
            log.exception("poll failed")
        stop.wait(max(0.0, runner.config.interval_s - (time.monotonic() - started)))
    runner.close()
    return 0
