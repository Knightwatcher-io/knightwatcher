"""Command line: run the loop, run once, check the configuration, or report health."""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import threading
import time

from collector.config import ConfigError, load
from collector.runner import STATE_FILE, Runner
from collector.store import Memory

DEFAULT_CONFIG = "/etc/knightwatcher/config.toml"
DEFAULT_SECRETS = "/etc/knightwatcher/secrets.json"

log = logging.getLogger("collector")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="collector", description="Knightwatcher collector")
    p.add_argument("--config", default=os.environ.get("KNIGHTWATCHER_CONFIG", DEFAULT_CONFIG))
    p.add_argument("--secrets", default=os.environ.get("KNIGHTWATCHER_SECRETS", DEFAULT_SECRETS))
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="run one poll, write the file, exit")
    mode.add_argument(
        "--check-config", action="store_true", help="validate config and secrets, then exit"
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
    if age > 3 * config.interval_s:
        print(f"unhealthy: {STATE_FILE} is {age:.0f} s old", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        stream=sys.stderr,
    )
    logging.Formatter.converter = time.gmtime
    try:
        config = load(args.config, None if args.health else args.secrets)
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
            runner.cycle()
        except Exception:
            log.exception("poll failed")
        stop.wait(max(0.0, config.interval_s - (time.monotonic() - started)))
    return 0
