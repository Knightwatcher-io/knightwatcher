"""Command line: run the loop, run once, check the configuration, or report health."""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import threading
import time

from collector import overlay, reload
from collector.config import ConfigError, credential_names, load, read_env_file
from collector.runner import STATE_FILE, Runner, utcnow
from collector.store import Memory, atomic_write

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
        help="with --check-config: read the credentials from this .env file, not the environment",
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
    return p


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
    if args.env_file and not args.check_config:
        parser.error("--env-file goes with --check-config")
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
    if args.check_config:
        names = ", ".join(config.sources) or "none"
        line = f"config ok: {len(config.sources)} sources enabled ({names})"
        if config.things:
            watched = ", ".join(t["name"] for t in config.things)
            line += f"; {len(config.things)} watched ({watched})"
        print(line)
        return 0

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
        runner.cycle()
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
    return 0
