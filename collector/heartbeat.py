"""The usage counts: a small heartbeat the long-running collector sends to the project.

At start, and every six hours after, the collector posts one JSON object to RECEIVER: a random
install id, the version, how long it has run, the world and the built-in parts in use, which
sources are on, how many imports and checks there are, and how many displays it has seen lately.
Anything a user made (a world, an item, a provider file of their own) is sent as "custom" or as a
count, never by its name, and nothing from the config is sent as written: no name, title, address,
URL or credential. The fields are fixed by the receiver's contract, schema 1, and check() holds
every payload to it before it is sent. docs/telemetry.md describes what is sent and why, and
docs/collector.md how the collector sends it.

KW_ANALYTICS in .env is the only control: unset, or any value but "off" (trimmed, in any case),
sends; "off" sends nothing, makes no connection and makes no install id. Only the loop of
`python -m collector` sends; --once, --probe, --check-config and --health never do.

The install id is a UUID4 made once and kept with the time it was made in install.json in the
collector's memory folder, so emptying that folder makes a new one. The display count comes from
the bundled server's displays.json (collector/displays.py), read from the server's folder the
collector mounts read-only. A send runs in a thread of its own with a 10-second timeout, so it
never delays a poll, and nothing it does reaches state.json but whether the counts are on.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import re
import threading
import time
import uuid
from collections.abc import Callable, Mapping
from typing import Any

from collector import config as config_mod
from collector import displays, kinds, net, text
from collector import providers as providers_mod
from collector.store import atomic_write

# The receiver's address. ENDPOINT is what a send uses: the tests point it at a local fake
# receiver (tests/collector/kw_helpers.py), so that no test can reach RECEIVER.
RECEIVER = "https://telemetry.knightwatcher.io/v1/heartbeat"
ENDPOINT = RECEIVER
VARIABLE = "KW_ANALYTICS"
DOCS = "docs/telemetry.md"
SCHEMA = 1
INSTALL_FILE = "install.json"
SETTINGS_FILE = "settings.json"
EVERY_S = 6 * 3600
RETRY_S = 3600
TIMEOUT_S = 10.0
# A failure is logged at most this often.
WARN_EVERY_S = 3600
MAX_BODY = 4096

# The repository's root, or /app in the image: web/ beside collector/ holds the page, its packs
# and, in the image, version.json, which server/stamp.py writes at build time.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")

# The receiver's forms of the fields (the contract, schema 1).
_ID = re.compile(r"^[a-z0-9_-]{1,40}$")
_SOURCE = re.compile(r"^[a-z0-9_]{1,32}(:[a-z0-9_]{1,32})?$")
_VERSION = re.compile(r"^[A-Za-z0-9._+-]{1,40}$")
_UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
FIELDS = (
    "schema",
    "install_id",
    "version",
    "install_age_days",
    "uptime_hours",
    "world",
    "build",
    "items",
    "look",
    "sources",
    "imports",
    "checks",
    "displays",
)
_RANGES = {
    "install_age_days": 100000,
    "uptime_hours": 1000000,
    "imports": 16,
    "checks": 64,
    "displays": 1000,
}
CUSTOM = "custom"
# The keys of [look] sent in their own fields, or not at all: the devices' prop sets are left out.
_OWN_FIELDS = ("world", "build", "items", "devices")

log = logging.getLogger("collector")


def enabled(env: Mapping[str, str]) -> bool:
    """Whether the usage counts are on: unless KW_ANALYTICS is "off", trimmed, in any case."""
    value = env.get(VARIABLE)
    return not (isinstance(value, str) and value.strip().lower() == "off")


def version(web: str = WEB) -> str:
    """The version the build is stamped with: the page's, from the version.json server/stamp.py
    writes into the image's copy of web/; "dev" for a checkout, which has none."""
    try:
        with open(os.path.join(web, "version.json"), encoding="utf-8") as fh:
            found = json.load(fh).get("version")
    except (OSError, ValueError, AttributeError):
        return "dev"
    return found if isinstance(found, str) and _VERSION.match(found) else "dev"


# ---- The install id ---------------------------------------------------------------------------


def install(folder: str, now: dt.datetime) -> tuple[str, dt.datetime, bool]:
    """(the install id, when it was made, whether it was made now), from install.json in the
    memory folder, made when the file is missing or cannot be read. A file that cannot be written
    leaves the id for this run alone, with a line in the log."""
    path = os.path.join(folder, INSTALL_FILE)
    try:
        with open(path, encoding="utf-8") as fh:
            held = json.load(fh)
        made = text.parse_iso(held["created"])
        if isinstance(held["install_id"], str) and _UUID4.match(held["install_id"]):
            return held["install_id"], made, False
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        pass
    new = str(uuid.uuid4())
    body = {"install_id": new, "created": text.iso(now)}
    try:
        atomic_write(path, (json.dumps(body) + "\n").encode("utf-8"), mode=0o640)
    except OSError as exc:
        log.warning("usage counts: cannot write %s: %s", INSTALL_FILE, exc.strerror)
    return new, now.replace(microsecond=0), True


# ---- The household's look ---------------------------------------------------------------------


def _shipped(web: str = WEB) -> dict[str, set[str]]:
    """The packs that ship with the page, by id, each with the ids of every part it holds."""
    out: dict[str, set[str]] = {}
    folder = os.path.join(web, "packs")
    try:
        names = sorted(n for n in os.listdir(folder) if n.endswith(".pack.json"))
    except OSError:
        return out
    for name in names:
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as fh:
                pack = json.load(fh)["pack"]
            ids: set[str] = set()
            for key, part in pack.items():
                if key == "swatches" and isinstance(part, dict):
                    # A swatch counts for its own family alone: the plume's green is no hair.
                    for family, swatches in part.items():
                        if isinstance(swatches, dict):
                            ids.update(f"swatch:{family}/{sid}" for sid in swatches)
                elif isinstance(part, dict) and key not in ("defaults", "palettes", "licence"):
                    ids.update(part)
            out[str(pack["id"])] = ids
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return out


def household_look(config: Any, server_dir: str | None) -> dict[str, Any]:
    """The household's look: what the displays chose for every display, in the bundled server's
    settings.json, over the [look] of the settings in use. A world chosen there sets every part
    at its level, so the config's parts give way to it, as on the page. A value the config's own
    checks refuse is left out."""
    base = dict(config.defaults.get("look", {}))
    saved: dict[str, Any] = {}
    if server_dir:
        try:
            with open(os.path.join(server_dir, SETTINGS_FILE), encoding="utf-8") as fh:
                raw = json.load(fh)
            if isinstance(raw, dict) and raw.get("v") == 1 and isinstance(raw.get("look"), dict):
                for key, value in raw["look"].items():
                    if not config_mod.check_defaults({"look": {key: value}}):
                        saved[key] = value
        except (OSError, ValueError):
            pass
    if "world" in saved:
        return saved
    look = {**base, **saved}
    for table in ("items", "devices"):
        if isinstance(base.get(table), dict) or isinstance(saved.get(table), dict):
            look[table] = {**base.get(table, {}), **saved.get(table, {})}
    return look


# The swatch family each key of [look] that takes a swatch is drawn from.
_SWATCH = {
    "skin": "skin",
    "hair": "hair",
    "tabard": "tabard",
    "plume": "plume",
    "monarch_skin": "skin",
    "monarch_hair": "hair",
    "monarch_robe": "tabard",
}


def _part(
    value: Any, choices: tuple[str, ...], shipped: dict[str, set[str]], family: str | None = None
) -> str:
    """A built-in part's id, or "custom": a short name of the schema's as it is; a long name of a
    pack that ships with the page, of a part that pack holds (for a swatch, one of the key's own
    family), as the short name it stands for (kw.base/build.b is b) or its own id with dots as
    underscores (kw.base/main.longsword is main_longsword); anything else, a part a user made,
    "custom"."""
    if not isinstance(value, str):
        return CUSTOM
    if value in choices and _ID.match(value):
        return value
    pack, slash, pid = value.partition("/")
    held = shipped.get(pack, set())
    if family is not None:
        found = slash and f"swatch:{family}/{pid}" in held and _ID.match(pid)
        return pid if found else CUSTOM
    if not slash or pid not in held:
        return CUSTOM
    short = pid.split(".", 1)[1] if "." in pid else pid
    if short in choices and _ID.match(short):
        return short
    own = pid.replace(".", "_")
    return own if _ID.match(own) else CUSTOM


# ---- The payload ------------------------------------------------------------------------------


def sources_of(config: Any) -> tuple[list[str], int, int]:
    """(each enabled source as the receiver takes it, sorted; the entries of [[sources.imports]];
    the checks of [[sources.json]]). A source read through a built-in provider is
    "<kind>:<provider>", through a provider file of the user's own "<kind>:custom", and one read
    by code of its own (host, wan, dns and the rest) its name. The lists' entries are counted and
    never named; the devices are not sources here."""
    listed: set[str] = set()
    imports = checks = 0
    builtin = providers_mod.builtin()
    for name, settings in config.sources.items():
        head, colon, _ = name.partition(":")
        if colon:
            imports += head == "imports"
            checks += head == "json"
            continue
        kind = kinds.kind_of(name)
        if kind is None:
            entry = name
        else:
            pid = kinds.provider_of(name, settings)
            entry = f"{kind}:{pid if pid in builtin else CUSTOM}"
        if _SOURCE.match(entry):
            listed.add(entry)
    return sorted(listed), min(imports, 16), min(checks, 64)


def payload(
    config: Any,
    look: dict[str, Any],
    *,
    install_id: str,
    created: dt.datetime,
    now: dt.datetime,
    uptime_s: float,
    displays_seen: int,
    stamp: str,
    shipped: dict[str, set[str]],
) -> dict[str, Any]:
    """The heartbeat, as the receiver's contract has it."""
    choices = config_mod.LOOK_CHOICES
    world = look.get("world")
    build = look.get("build")
    items = sorted(
        {_part(v, (), shipped) for v in (look.get("items") or {}).values() if v is not None}
    )
    parts = {
        key: _part(value, choices.get(key, ()), shipped, _SWATCH.get(key))
        for key, value in sorted(look.items())
        if key not in _OWN_FIELDS and key in choices and isinstance(value, str)
    }
    listed, imports, checks = sources_of(config)
    age = int(max(0.0, (now - created).total_seconds()) // 86400)
    return {
        "schema": SCHEMA,
        "install_id": install_id,
        "version": stamp,
        "install_age_days": min(age, _RANGES["install_age_days"]),
        "uptime_hours": min(int(max(0.0, uptime_s) // 3600), _RANGES["uptime_hours"]),
        "world": None if world is None else _part(world, choices["world"], shipped),
        "build": None if build is None else _part(build, choices["build"], shipped),
        "items": items[:32],
        "look": dict(list(parts.items())[:32]),
        "sources": listed[:48],
        "imports": imports,
        "checks": checks,
        "displays": min(max(0, displays_seen), _RANGES["displays"]),
    }


def check(body: Any) -> list[str]:
    """Every way a payload breaks the receiver's contract, schema 1; empty when it keeps it."""
    if not isinstance(body, dict):
        return ["not an object"]
    p: list[str] = []
    if set(body) != set(FIELDS):
        p.append("the fields are not exactly " + ", ".join(FIELDS))
    if body.get("schema") != SCHEMA or isinstance(body.get("schema"), bool):
        p.append("schema is not 1")
    if not isinstance(body.get("install_id"), str) or not _UUID4.match(body["install_id"]):
        p.append("install_id is not a lowercase UUID version 4")
    if not isinstance(body.get("version"), str) or not _VERSION.match(body["version"]):
        p.append("version is not 1 to 40 of A-Z, a-z, 0-9, . _ + -")
    for key, high in _RANGES.items():
        value = body.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= high:
            p.append(f"{key} is not a whole number from 0 to {high}")
    for key in ("world", "build"):
        value = body.get(key)
        if value is not None and not (isinstance(value, str) and _ID.match(value)):
            p.append(f"{key} is not null or an id")
    for key, form, most in (("items", _ID, 32), ("sources", _SOURCE, 48)):
        value = body.get(key)
        if (
            not isinstance(value, list)
            or len(value) > most
            or not all(isinstance(v, str) and form.match(v) for v in value)
            or value != sorted(set(value))
        ):
            p.append(f"{key} is not a sorted list of up to {most} unique ids")
    look = body.get("look")
    if (
        not isinstance(look, dict)
        or len(look) > 32
        or not all(
            isinstance(k, str) and _ID.match(k) and isinstance(v, str) and _ID.match(v)
            for k, v in look.items()
        )
    ):
        p.append("look is not an object of up to 32 ids")
    if len(encode(body)) > MAX_BODY:
        p.append(f"the body is larger than {MAX_BODY} bytes")
    return p


def encode(body: dict[str, Any]) -> bytes:
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# ---- Sending ----------------------------------------------------------------------------------


def _post(url: str, body: dict[str, Any], timeout: float) -> None:
    """One POST; raises net.SourceError on any failure, with a short reason and no address."""
    net.fetch(url, timeout, method="POST", json_body=body)


def _thread(target: Callable[..., None], *args: Any) -> None:
    threading.Thread(target=target, args=args, name="heartbeat", daemon=True).start()


def notice(endpoint: str) -> str:
    return (
        f"usage counts: at start and every six hours this collector sends {endpoint} a random "
        "install id, the version, its uptime, the world and the built-in parts in use, which "
        "sources are on, and how many imports, checks and displays there are; never a name, "
        f"a title, an address or a credential. KW_ANALYTICS=off in .env stops it. See {DOCS}"
    )


OFF_LINE = "usage counts off (KW_ANALYTICS=off): nothing is sent"


class Heartbeat:
    """The schedule of the sends, and the install id they carry.

    tick() is called by the collector's loop between polls: it collects the result of a send
    that has finished, and starts the next one in a thread of its own when it is due. The first is
    due at once, the next six hours after each attempt, or one hour after a failed one.
    """

    def __init__(
        self,
        state_dir: str,
        server_dir: str | None,
        *,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], dt.datetime] = lambda: dt.datetime.now(dt.UTC),
        post: Callable[[str, dict, float], None] = _post,
        spawn: Callable[..., None] = _thread,
        endpoint: str | None = None,
        web: str = WEB,
    ):
        self.state_dir, self.server_dir = state_dir, server_dir
        self.clock, self.wall, self.post, self.spawn = clock, wall, post, spawn
        self.endpoint = endpoint
        self.stamp = version(web)
        self.shipped = _shipped(web)
        self.started = clock()
        self.install_id, self.created, made = install(state_dir, wall())
        if made:
            log.info(notice(self._endpoint()))
        self._next = self.started
        self._attempt = self.started
        self._inflight = False
        self._result: tuple[bool, str] | None = None
        self._warned: float | None = None
        self._lock = threading.Lock()

    def _endpoint(self) -> str:
        return self.endpoint or ENDPOINT

    def build(self, config: Any) -> dict[str, Any]:
        """The payload for the settings in use, now."""
        now = self.wall()
        seen = (
            displays.read(os.path.join(self.server_dir, displays.FILE), now)
            if self.server_dir
            else 0
        )
        return payload(
            config,
            household_look(config, self.server_dir),
            install_id=self.install_id,
            created=self.created,
            now=now,
            uptime_s=self.clock() - self.started,
            displays_seen=seen,
            stamp=self.stamp,
            shipped=self.shipped,
        )

    def _run(self, url: str, body: dict[str, Any]) -> None:
        try:
            self.post(url, body, TIMEOUT_S)
            result = (True, "")
            # Said as it happens, so that a collector stopped before its next poll still says it.
            log.info("usage counts sent to %s", url)
        except net.SourceError as exc:
            result = (False, str(exc))
        except Exception as exc:  # noqa: BLE001 - a send never takes the collector down
            result = (False, f"internal error ({type(exc).__name__})")
        with self._lock:
            self._result = result

    def _collect(self, now: float) -> None:
        with self._lock:
            result, self._result = self._result, None
        if result is None:
            return
        self._inflight = False
        ok, why = result
        if ok:
            return
        self._next = self._attempt + RETRY_S
        if self._warned is None or now - self._warned >= WARN_EVERY_S:
            self._warned = now
            log.warning("usage counts not sent (%s); trying again in an hour", why)

    def tick(self, config: Any) -> None:
        """Called between polls. Never raises and never waits on the network."""
        try:
            now = self.clock()
            self._collect(now)
            if self._inflight or now < self._next:
                return
            body = self.build(config)
            problems = check(body)
            self._attempt, self._next = now, now + EVERY_S
            if problems:
                log.error("usage counts not sent: %s", "; ".join(problems))
                return
            self._inflight = True
            self.spawn(self._run, self._endpoint(), body)
        except Exception:
            log.exception("usage counts: the heartbeat failed")


def start(env: Mapping[str, str], state_dir: str, server_dir: str | None, **kw: Any):
    """The heartbeat of a long-running collector, or None when KW_ANALYTICS is off, which is
    then logged once."""
    if not enabled(env):
        log.info(OFF_LINE)
        return None
    return Heartbeat(state_dir, server_dir, **kw)
