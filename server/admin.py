"""The admin page's side of the server: the password, the sessions, admin.json and the checks.

The admin page changes what the collector watches, so it is behind a password, set in .env as
KNIGHTWATCHER_ADMIN_PASSWORD and given to the server alone. While it is missing, or shorter than
MIN_PASSWORD characters, the page is off and says why; the walls are not affected.

  - Gate holds the password, the sessions and the limit on wrong passwords. A session is a random
    token in a cookie, lasting SESSION_S from its last use. The server keeps each session in
    sessions.json in its folder, by an HMAC of the token keyed with the password, so a restart
    keeps it, the file holds no usable token, and a new password matches none of them. After
    PAUSE_AFTER wrong passwords in a row, signing in is paused for every browser, for a minute
    that doubles with each further wrong one up to fifteen; a right one clears the count, and each
    wrong answer is held back a second. The password is compared in constant time and never
    logged, answered or written anywhere.
  - Admin holds what is set on the page, in admin.json in the server's folder (collector/overlay.py
    describes the file), and checks each change before it is kept: config.toml as the collector
    reads it, mounted read-only into the server, with the store laid over it and the change on
    top, built by the collector's own code, with the provider files of the providers folder beside
    it, mounted read-only too. The server has no credential, so it checks them by the names the
    collector reports in credentials.json, giving the same words.

docs/server.md describes the endpoints and docs/security.md the posture.
"""

from __future__ import annotations

import copy
import datetime as dt
import hashlib
import hmac
import json
import logging
import os
import secrets
import stat
import textwrap
import threading
import time
import tomllib
from collections.abc import Callable
from typing import Any

from collector import config as config_mod
from collector import overlay, providers, schema
from collector.config import ConfigError
from collector.store import atomic_write

PASSWORD_VARIABLE = "KNIGHTWATCHER_ADMIN_PASSWORD"
MIN_PASSWORD = 12
SESSION_S = 30 * 24 * 3600
# A session's cookie is sent again, to renew it in the browser, at most this often.
RENEW_S = 24 * 3600
MAX_SESSIONS = 100
SESSIONS_FILE = "sessions.json"
# A session's last use is written to the file at most this often; between writes it is kept in
# memory, so a restart may cost a session up to this much of its 30 days.
STORE_USE_S = 3600
COOKIE = "kw_admin"
PAUSE_AFTER = 5
PAUSE_S = 60
MAX_PAUSE_S = 15 * 60
WRONG_DELAY_S = 1.0
# Where compose.yaml mounts config.toml in both containers.
CONFIG_PATH = "/etc/knightwatcher/config.toml"
CREDENTIALS_FILE = "credentials.json"
MAX_FILE = 1024 * 1024

WRONG = "That is not the admin password."

log = logging.getLogger("server")


def _digest(text: str) -> bytes:
    return hashlib.sha256(text.encode("utf-8", "surrogatepass")).digest()


class Gate:
    """The admin password, the sessions and the limit on wrong passwords.

    clock and sleep are time.time and time.sleep, replaced in the tests.
    """

    def __init__(
        self,
        password: str | None,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        folder: str | None = None,
    ):
        self._digest = _digest(password) if password and len(password) >= MIN_PASSWORD else None
        if not password:
            self.off = f"the admin page is off: .env has no {PASSWORD_VARIABLE}"
        elif self._digest is None:
            self.off = (
                f"the admin page is off: {PASSWORD_VARIABLE} in .env is shorter than "
                f"{MIN_PASSWORD} characters"
            )
        else:
            self.off = None
        self.clock, self.sleep = clock, sleep
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, float]] = {}
        self._wrong = 0
        self._paused_until = 0.0
        self.path = os.path.join(folder, SESSIONS_FILE) if folder else None
        if self._digest is not None:
            self._load()

    # The sessions' file ------------------------------------------------------------------------

    def _key(self, token: str) -> str:
        """What a session is kept by: an HMAC of its token, keyed with the password's digest."""
        data = token.encode("utf-8", "surrogatepass")
        return hmac.new(self._digest, data, hashlib.sha256).hexdigest()

    def _load(self) -> None:
        """The sessions in the file that have not run out; a file that cannot be read is none."""
        if self.path is None:
            return
        try:
            with open(self.path, encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            return
        except (OSError, UnicodeDecodeError, ValueError) as exc:
            log.warning("admin sessions: %s cannot be read (%s); every browser signs in again",
                        self.path, type(exc).__name__)  # fmt: skip
            return
        given = raw.get("sessions") if isinstance(raw, dict) and raw.get("v") == 1 else None
        now = self.clock()
        for key, s in (given or {}).items():
            if (
                isinstance(key, str)
                and isinstance(s, dict)
                and all(isinstance(s.get(k), (int, float)) for k in ("used", "sent"))
                and now - s["used"] <= SESSION_S
            ):
                self._sessions[key] = {"used": float(s["used"]), "sent": float(s["sent"])}
                self._sessions[key]["stored"] = self._sessions[key]["used"]

    def _save(self) -> None:
        """Writes the sessions, those run out dropped, as the other stores are written: whole, to
        a temporary name, renamed into place, mode 640. Called with the lock held."""
        now = self.clock()
        for k in [k for k, s in self._sessions.items() if now - s["used"] > SESSION_S]:
            del self._sessions[k]
        if self.path is None:
            return
        body = {
            "v": 1,
            "sessions": {
                k: {"used": s["used"], "sent": s["sent"]} for k, s in self._sessions.items()
            },
        }
        try:
            atomic_write(self.path, (json.dumps(body, indent=1) + "\n").encode("utf-8"), 0o640)
        except OSError as exc:
            log.error("admin sessions: cannot write %s: %s", self.path, exc.strerror)
            return
        for s in self._sessions.values():
            s["stored"] = s["used"]

    # Signing in --------------------------------------------------------------------------------

    def paused_s(self) -> int:
        """Seconds left of a pause on signing in, or 0."""
        with self._lock:
            left = self._paused_until - self.clock()
        return max(0, int(left + 0.999))

    def sign_in(self, given: Any) -> tuple[int, dict, str | None]:
        """(status, answer, token): 204 and a new session's token for the right password; 401
        for a wrong one, after WRONG_DELAY_S; 429 while signing in is paused."""
        if self._digest is None:
            return 503, {"error": self.off}, None
        right = isinstance(given, str) and hmac.compare_digest(_digest(given), self._digest)
        with self._lock:
            now = self.clock()
            if now < self._paused_until:
                left = int(self._paused_until - now + 0.999)
                return 429, {"error": _paused(left), "retry_after_s": left}, None
            if right:
                self._wrong = 0
                token = self._open(now)
                log.info("admin signed in")
                return 204, {}, token
            self._wrong += 1
            log.warning("admin sign-in refused")
            pause = 0
            if self._wrong >= PAUSE_AFTER:
                pause = min(MAX_PAUSE_S, PAUSE_S * 2 ** (self._wrong - PAUSE_AFTER))
                self._paused_until = now + pause
                minutes = pause // 60
                log.warning(
                    "admin sign-in paused for %d minute%s", minutes, "" if minutes == 1 else "s"
                )
        self.sleep(WRONG_DELAY_S)
        if pause:
            return 429, {"error": _paused(pause), "retry_after_s": pause}, None
        return 401, {"error": WRONG}, None

    # Sessions ----------------------------------------------------------------------------------

    def _open(self, now: float) -> str:
        token = secrets.token_urlsafe(32)
        if len(self._sessions) >= MAX_SESSIONS:
            oldest = min(self._sessions, key=lambda k: self._sessions[k]["used"])
            del self._sessions[oldest]
        self._sessions[self._key(token)] = {"used": now, "sent": now, "stored": now}
        self._save()
        return token

    def check(self, token: str | None) -> tuple[bool, bool]:
        """(whether the token is a live session, whether its cookie is due to be sent again).
        A live session's life starts again from now."""
        if self._digest is None or not token:
            return False, False
        key = self._key(token)
        with self._lock:
            now = self.clock()
            s = self._sessions.get(key)
            if s is None or now - s["used"] > SESSION_S:
                if s is not None:
                    self._save()  # drops it, with any other run out
                return False, False
            s["used"] = now
            renew = now - s["sent"] >= RENEW_S
            if renew:
                s["sent"] = now
            if renew or now - s["stored"] >= STORE_USE_S:
                self._save()
            return True, renew

    def sign_out(self, token: str | None) -> None:
        if token and self._digest is not None:
            with self._lock:
                if self._sessions.pop(self._key(token), None) is not None:
                    self._save()
                    log.info("admin signed out")


def _paused(seconds: int) -> str:
    minutes = max(1, (seconds + 59) // 60)
    return (
        f"Five wrong passwords in a row, so signing in is paused for {minutes} "
        f"minute{'' if minutes == 1 else 's'}, from every browser. The walls are not affected."
    )


def cookie(token: str, secure: bool, max_age: int = SESSION_S) -> str:
    """The session cookie: HttpOnly, SameSite=Strict, Path=/, and Secure over HTTPS."""
    value = f"{COOKIE}={token}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Strict"
    return value + ("; Secure" if secure else "")


def token_of(header: str | None) -> str | None:
    """The session token in a Cookie header, or None."""
    for part in (header or "").split(";"):
        name, eq, value = part.strip().partition("=")
        if eq and name == COOKIE and value:
            return value
    return None


# ---- What the page reads ------------------------------------------------------------------------


def _read_small(path: str) -> bytes | None:
    """A regular file of at most MAX_FILE bytes, not through a link, or None."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE:
            return None
        with os.fdopen(fd, "rb", closefd=False) as fh:
            return fh.read(MAX_FILE + 1)
    finally:
        os.close(fd)


def read_credentials(out: str) -> dict[str, bool] | None:
    """The collector's report of which credential variables it holds, by name, or None when it
    has written none. Read here and never served."""
    data = _read_small(os.path.join(out, CREDENTIALS_FILE))
    try:
        raw = json.loads(data) if data is not None else None
    except ValueError:
        return None
    if not isinstance(raw, dict):
        return None
    return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, bool)}


def read_status(out: str) -> dict | None:
    """What the page shows of the collector's last state file: when it was written, how often,
    each source's health, each device's state, and the settings it says it uses."""
    data = _read_small(os.path.join(out, "state.json"))
    try:
        state = json.loads(data) if data is not None else None
    except ValueError:
        return None
    if not isinstance(state, dict):
        return None
    facts = state.get("facts") if isinstance(state.get("facts"), dict) else {}
    devices = facts.get("devices") if isinstance(facts.get("devices"), dict) else {}
    return {
        "generated_at": state.get("generated_at"),
        "interval_s": state.get("interval_s"),
        "sources": state.get("sources") if isinstance(state.get("sources"), dict) else {},
        "devices": devices.get("list") if isinstance(devices.get("list"), list) else [],
        "config": state.get("config") if isinstance(state.get("config"), dict) else None,
    }


class Refused(Exception):
    """A change the admin page may not keep, with every problem, one a line."""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


def _now_iso() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class Admin:
    """What is set on the admin page, the checks before a change is kept, and the export.

    shared is the store of the walls' shared settings (server/store.py), which the reset clears
    too and the export reads.
    """

    def __init__(self, folder: str, out: str, config_path: str, gate: Gate, shared):
        self.folder, self.out, self.config_path = folder, out, config_path
        self.path = os.path.join(folder, overlay.FILE)
        self.gate, self.shared = gate, shared
        self._lock = threading.Lock()
        self._seen: tuple | None = None
        # The providers folder as last read: (its path and signature, what it held).
        self._providers: tuple[tuple, providers.Providers] | None = None
        with self._lock:
            self._reread()

    def _reread(self) -> None:
        """Reads admin.json again when it has changed on disk since it was last read or written,
        as when it is edited or deleted by hand, so that the page shows what the collector reads.
        A path it cannot hold is left out with a line in the log. Called with the lock held."""
        seen = overlay.signature(self.path)
        if seen == self._seen and seen is not None:
            return
        self._set, self._version, problems = overlay.read(self.path)
        self._seen = seen
        for problem in problems:
            log.warning("admin settings: %s, so it is left out", problem)

    # config.toml and the credentials -----------------------------------------------------------

    def file(self) -> tuple[dict | None, str | None]:
        """(config.toml parsed, or None, and why it could not be)."""
        try:
            return config_mod.read(self.config_path), None
        except ConfigError as exc:
            return None, exc.problems[0]

    def providers(self, raw: dict | None) -> providers.Providers:
        """The providers folder config.toml names, read again only when its files have changed."""
        folder = config_mod.providers_folder(raw or {}, self.config_path)
        seen = (folder, providers.signature(folder))
        held = self._providers
        if held is None or held[0] != seen:
            found = providers.scan(folder)
            for problem in found.problems:
                log.warning("provider file left out: %s", problem)
            held = self._providers = (seen, found)
        return held[1]

    def problems(self, given: dict[str, Any], raw: dict | None, why: str | None) -> list[str]:
        """Every problem the collector would find with config.toml and given laid over it.

        A credential is checked by the names the collector reported holding; while it has
        reported none, credentials are not checked here. A provider file left out is not a
        problem of the settings: the collector runs, and the source that names it fails."""
        if raw is None:
            return [why or "config.toml cannot be read"]
        names = read_credentials(self.out)
        env = None if names is None else {name: "present" for name, ok in names.items() if ok}
        try:
            config_mod.build(overlay.lay(raw, given), env, providers=self.providers(raw))
        except ConfigError as exc:
            return exc.problems
        return []

    # The answers -------------------------------------------------------------------------------

    def answer(self) -> dict:
        """GET /api/admin/settings: everything the page shows."""
        raw, why = self.file()
        with self._lock:
            self._reread()
            given, version = copy.deepcopy(self._set), self._version
        found = self.providers(raw)
        body = {
            "v": overlay.VERSION,
            "set": given,
            "version": version,
            "file": raw,
            "status": read_status(self.out),
            "credentials": read_credentials(self.out),
            "problems": self.problems(given, raw, why),
            "providers": own_providers(found),
            "now": _now_iso(),
        }
        if why:
            body["file_problem"] = why
        return body

    def change(self, body: Any) -> dict:
        """PATCH /api/admin/settings: set and reset paths, checked whole before anything is kept.
        Raises Refused, keeping nothing, when the collector would refuse the result."""
        if not isinstance(body, dict):
            raise Refused(["the body must be a JSON object"])
        problems: list[str] = []
        for key in body:
            if key == "v":
                if type(body["v"]) is not int or body["v"] != overlay.VERSION:
                    problems.append(f"v: must be {overlay.VERSION}")
            elif key not in ("set", "reset"):
                problems.append(f"{key}: unknown; send set and reset")
        given = body.get("set", {})
        reset = body.get("reset", [])
        if not isinstance(given, dict):
            problems.append("set: expected an object of paths and values")
            given = {}
        if not isinstance(reset, list) or not all(isinstance(p, str) for p in reset):
            problems.append("reset: expected a list of paths")
            reset = []
        for path, value in given.items():
            why = overlay.path_problem(path, value)
            if why:
                problems.append(why)
        for path in reset:
            if path != overlay.DEVICES and path not in overlay.PATHS:
                problems.append(f"{path}: unknown setting")
        if not given and not reset and not problems:
            problems.append("name a setting in set or reset")
        if problems:
            raise Refused(problems)
        raw, why = self.file()
        with self._lock:
            self._reread()
            new = {k: v for k, v in self._set.items() if k not in reset}
            new.update(copy.deepcopy(given))
            found = self.problems(new, raw, why)
            if found:
                # What this change brings first: the problems already there come after it.
                there = set(self.problems(self._set, raw, why))
                raise Refused(sorted(found, key=lambda p: p in there))
            self._write(new)
        log.info("admin settings saved: %s", ", ".join([*given, *reset]))
        return self.answer()

    def reset_all(self) -> dict:
        """POST /api/admin/reset: nothing set on the admin page or the walls' screens, so that
        config.toml and the defaults rule again. Refused while config.toml alone would be."""
        raw, why = self.file()
        with self._lock:
            found = self.problems({}, raw, why)
            if found:
                raise Refused(found)
            self._write({})
            self.shared.put({section: {} for section in self.shared_sections()})
        log.info("admin settings put back to config.toml, the shared settings with them")
        return self.answer()

    @staticmethod
    def shared_sections() -> tuple[str, ...]:
        return config_mod.DEFAULT_TABLES

    def _write(self, given: dict[str, Any]) -> None:
        text = json.dumps({"v": overlay.VERSION, "set": given}, indent=2, ensure_ascii=False)
        data = (text + "\n").encode("utf-8")
        # Group-readable, so that an ACL on the folder can let the operator read the file.
        atomic_write(self.path, data, mode=0o640)
        self._set, self._version = given, overlay.version_of(data)
        self._seen = overlay.signature(self.path)

    # The export --------------------------------------------------------------------------------

    def export(self, when: dt.datetime | None = None) -> str:
        """GET /api/admin/export: config.toml as the collector now uses it, every setting with
        its help as a comment above it. No credential: each secret says which variables it
        reads."""
        raw, _ = self.file()
        with self._lock:
            self._reread()
            given = copy.deepcopy(self._set)
        shared = json.loads(self.shared.get()[0])
        laid = overlay.lay(raw or {}, given)
        return export_toml(laid, shared, when or dt.datetime.now(dt.UTC), self.providers(raw))


def own_providers(found: providers.Providers) -> dict:
    """The provider files of the user's own, for the admin page: each that passed, as the schema
    lists the built-in ones, and each left out, by its id, with its problems."""
    return {
        "own": [
            {
                "id": spec.id,
                "kind": spec.kind,
                "name": spec.name,
                "docs": spec.docs,
                "credentials": [{"field": f, "help": h} for f, h in spec.credentials.items()],
                "settings": [{"key": k, **d} for k, d in spec.settings.items()],
            }
            for spec in found.own.values()
        ],
        "refused": [{"id": pid, "problems": list(p)} for pid, p in found.refused.items()],
        "problems": list(found.problems),
    }


# ---- config.toml, written out ------------------------------------------------------------------


def _toml_string(value: str) -> str:
    if "\\" in value and "'" not in value and value.isprintable():
        return "'" + value + "'"
    return json.dumps(value)


def toml_value(value: Any, kind: str | None = None) -> str:
    """A value as config.toml writes it; kind "number" writes a whole number as 30.0."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return f"{value}.0" if kind == "number" else str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        return _toml_string(value)
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(v) for v in value) + "]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        return "{ " + ", ".join(f"{k} = {toml_value(v)}" for k, v in value.items()) + " }"
    return '""'


def _comment(text: str, lead: str = "# ") -> list[str]:
    return textwrap.wrap(text, 98 - len(lead), initial_indent=lead, subsequent_indent=lead) or [
        lead.rstrip()
    ]


def _line(key: str, value: Any, kind: str | None, lead: str = "") -> list[str]:
    one = f"{lead}{key} = {toml_value(value, kind)}"
    if len(one) <= 98 or not isinstance(value, list):
        return [one]
    out = [f"{lead}{key} = ["]
    out += [f"{lead}  {toml_value(v, None)}," for v in value]
    return [*out, f"{lead}]"]


def _section(raw: dict, table: str) -> dict | None:
    here: Any = raw
    for name in table.split("."):
        if not isinstance(here, dict) or name not in here:
            return None
        here = here[name]
    return here if isinstance(here, dict) else None


def _variables(found: providers.Providers, provider: str | None, secret: str) -> list[str]:
    """The variables a section reads its provider's credentials from, under its secret."""
    spec = found.get(provider) if provider else None
    return [schema.env_name(secret, f) for f in (spec.credentials if spec else [])]


def export_toml(
    raw: dict, shared: dict, when: dt.datetime, found: providers.Providers | None = None
) -> str:
    """A complete config.toml: raw (the file with the admin page's settings laid over it) in
    every table of the schema, the defaults written where it leaves a setting out, and the
    shared settings over its look, display, quiet scenes and scenes. A section also keeps the
    settings its provider declares, with the provider file's help, and writes a key of its own that
    its provider does not use (url with fail2ban, database with any other) commented, so that the
    file reads back. A list of tables under [sources], [[sources.imports]] or [[sources.json]], is
    set in config.toml alone and written as raw has it. found is the providers folder, or None for
    the built-in providers alone."""
    found = found if found is not None else providers.builtin_only()
    stamp = when.astimezone(dt.UTC).strftime("%d %B %Y at %H:%M UTC").lstrip("0")
    out = _comment(
        f"Knightwatcher settings, downloaded from the admin page on {stamp}. Every setting the "
        "collector uses: what was set on the admin page, over what config.toml held, over the "
        "defaults. Put it in place of config.toml to keep them in the file."
    )
    out += _comment(
        "Credentials are never in this file. They stay in .env (see .env.example), named by each "
        "source's secret, which is its provider's id when it is left out."
    )
    for t in schema.SCHEMA["tables"]:
        table = t["table"]
        out.append("")
        out += _comment(t["help"])
        if table == overlay.DEVICES:
            devices = raw.get(overlay.DEVICES) or []
            if not devices:
                out.append("# No devices.")
            for i, device in enumerate(devices):
                if i:
                    out.append("")
                out.append("[[device]]")
                for s in t["settings"]:
                    if s["key"] in device:
                        out += _line(s["key"], device[s["key"]], s["type"])
            continue
        if t.get("many"):
            # A list of tables under [sources], such as [[sources.imports]]: set in config.toml
            # alone, so written as the file has it, each entry's keys in the schema's order and
            # then any its provider declares.
            entries = (raw.get("sources") or {}).get(table[len("sources.") :]) or []
            if not isinstance(entries, list):
                entries = []
            if not entries:
                out.append("# None.")
            keys = [s["key"] for s in t["settings"]]
            kinds = {s["key"]: s["type"] for s in t["settings"]}
            for i, entry in enumerate(e for e in entries if isinstance(e, dict)):
                if i:
                    out.append("")
                out.append(f"[[{table}]]")
                for key in [*[k for k in keys if k in entry], *[k for k in entry if k not in keys]]:
                    out += _line(key, entry[key], kinds.get(key))
            continue
        if not t["settings"]:
            out.append(f"[{table}]")
            continue
        wall = bool(t.get("defaults_for"))
        given = _section(raw, table)
        if wall:
            given = {**(given or {}), **(shared.get(table) or {})}
        source = table[len("sources.") :] if table.startswith("sources.") else None
        absent = source is not None and given is None
        # The provider the section reads: its from, or the default, or the one of its own name.
        provider = None
        if source is not None:
            chosen = (given or {}).get("from")
            keys = {s["key"]: s for s in t["settings"]}
            default = keys["from"]["default"] if "from" in keys else source
            provider = chosen if isinstance(chosen, str) and chosen else default
        # The section's keys its provider does not use (url with fail2ban, database with any
        # other), which config.toml must leave out: written commented, unless the file sets one.
        unused = config_mod.unused_keys(source, {"from": provider}, found) if source else set()
        lead = "# " if absent else ""
        if absent:
            out.append("# Not set up. Remove the first # of each line below to use it.")
        out.append(f"{lead}[{table}]")
        for s in t["settings"]:
            key = s["key"]
            out += _comment(s["help"], "# " + lead)
            if given is not None and key in given:
                value = given[key]
            elif key == "secret" and s.get("default_note"):
                names = _variables(found, provider, provider)
                reads = f"reads {' and '.join(names)} from .env" if names else "needs no credential"
                out += _comment(f"Left out: {s['default_note']}, so it {reads}.")
                out.append(f'# {key} = "{provider}"')
                continue
            elif key in unused:
                shown = s["default"] if s.get("default") is not None else ""
                line = f"{key} = {toml_value(shown, s['type'])}   # not used by {provider}"
                out.append(f"# {lead}{line}")
                continue
            elif wall:
                own = s.get("page_default")
                shown = own if own is not None else s["values"][0]
                said = "the page's own" if own is not None else "as drawn, or the base pack's"
                out.append(f"# {key} = {toml_value(shown, s['type'])}   # left out: {said}")
                continue
            elif s.get("default") is None:
                out.append(f'# {key} = ""   # required when the source is on')
                continue
            else:
                value = s["default"]
            line = _line(key, value, s["type"], lead)
            if key == "secret" and isinstance(value, str):
                names = _variables(found, provider, value)
                if names:
                    line[-1] += f"   # reads {' and '.join(names)} from .env"
            out += line
        # The settings the section's provider declares, as the section sets them.
        spec = found.get(provider) if source is not None and provider else None
        own = {s["key"] for s in t["settings"]}
        for key, value in (given or {}).items():
            if key in own or spec is None or key not in spec.settings:
                continue
            declared = spec.settings[key]
            out += _comment(f"{declared['help']} Declared by the {provider} provider.", "# " + lead)
            out += _line(key, value, declared["type"], lead)
    text = "\n".join(out) + "\n"
    tomllib.loads(text)  # what is written must read back
    return text
