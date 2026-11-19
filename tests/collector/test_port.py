"""The port proof: Tautulli, AdGuard Home, Sonarr and Radarr read through the provider engine give
exactly what the readers written in Python before it gave.

Each scenario below is a run of polls through the whole collector (the runner, the conditions, the
memory file) against a local HTTP server that answers each poll as the scenario says: the shapes
these services send, and the edge cases the readers handled (refused keys and the pause after
them, errors, empty and malformed replies, counts that fall, a day that turns, first sight, memory
from an older version). The fixtures in fixtures/port/ hold what the earlier readers wrote for
the same polls, byte for byte: state.json and memory.json after each poll, and the requests made,
with each credential replaced by its variable's name. They were recorded once from those readers
and are never written from the current code; a difference here is a change in what the wall
shows, never something to record again.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import tempfile
import unittest

from collector.runner import Runner
from collector.store import Memory
from kw_helpers import Clock, FakeHttp, at, make_config

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "port")

# Twenty minutes, the shortest pause after refused credentials.
BACKOFF_S = 1200


def _env() -> dict[str, str]:
    """Invented credentials, made afresh for each run so that none is ever written down."""
    return {
        "KNIGHTWATCHER_TAUTULLI_API_KEY": secrets.token_hex(16),
        "KNIGHTWATCHER_ADGUARD_USERNAME": "kw-" + secrets.token_hex(4),
        "KNIGHTWATCHER_ADGUARD_PASSWORD": secrets.token_urlsafe(12),
        "KNIGHTWATCHER_SONARR_API_KEY": secrets.token_hex(16),
        "KNIGHTWATCHER_RADARR_API_KEY": secrets.token_hex(16),
    }


# ---- Tautulli ---------------------------------------------------------------------------------


def tautulli(data=None, result="success", message=None):
    response = {"result": result, "message": message, "data": {} if data is None else data}
    return (200, {"response": response})


def activity(sessions, count=None):
    data = {"sessions": sessions}
    if count is not None:
        data["stream_count"] = count
    return tautulli(data)


# Invented streams, as Tautulli lists them: not in the order they started.
THREE = [
    {
        "session_key": "12",
        "friendly_name": "Sam",
        "user": "sam.k",
        "username": "samk",
        "media_type": "movie",
        "title": "Harbour of Glass",
        "full_title": "Harbour of Glass",
        "transcode_decision": "transcode",
        "player": "Lounge TV",
    },
    {
        "session_key": "7",
        "friendly_name": "Robin",
        "media_type": "episode",
        "grandparent_title": "The Lantern Keepers",
        "parent_media_index": "1",
        "media_index": "3",
        "title": "The Tide Bell",
        "full_title": "The Lantern Keepers - The Tide Bell",
    },
    {
        "session_key": "30",
        "friendly_name": "",
        "user": "alex",
        "media_type": "track",
        "grandparent_title": "Fen Owls",
        "title": "Low Tide",
    },
]

# Every way a session's title and name are made, and the sessions the readers skipped.
VARIED = [
    {"session_key": "41", "friendly_name": " \t", "user": "Robin", "media_type": "movie",
     "title": "Harbour‮ of\tGlass\r\n"},
    {"session_key": 9, "friendly_name": None, "username": "sam_k", "media_type": "episode",
     "grandparent_title": "The Lantern Keepers", "parent_media_index": 2, "media_index": 11},
    {"session_key": "3", "friendly_name": 7, "user": "", "username": "alex",
     "media_type": "episode", "grandparent_title": "The Lantern Keepers"},
    {"session_key": "5", "friendly_name": "Alex", "media_type": "episode",
     "parent_media_index": "4", "media_index": "1", "full_title": "Unused"},
    {"session_key": "6", "friendly_name": "The Whole\x00 Family\nDownstairs",
     "media_type": "episode", "full_title": "Fen Owls Live - Night One"},
    {"session_key": "8", "media_type": "episode", "parent_media_index": "x",
     "media_index": "2", "grandparent_title": "Brine"},
    {"session_key": "2", "user": "Sam", "media_type": "track", "grandparent_title": "Fen Owls"},
    {"session_key": "4", "user": "Robin", "media_type": "track", "title": "Low Tide"},
    {"session_key": "10", "user": "Alex", "media_type": "track"},
    {"session_key": "abc", "friendly_name": "Sam", "media_type": "movie",
     "full_title": "A Film Seen Whole"},
    {"friendly_name": "Robin", "media_type": "clip"},
    {"session_key": "0", "friendly_name": "Robin", "media_type": "photo", "title": 1917},
    {"session_key": "13", "friendly_name": "A Name Far Too Long For The Wall",
     "media_type": "movie", "title": "A Very Long Title " * 6},
    {"session_key": "", "friendly_name": "Alex", "title": "No Kind Given"},
    "not a session",
    7,
    None,
    ["a", "list"],
]  # fmt: skip

MANY = [{"session_key": str(i), "user": f"user{i}", "title": f"Title {i}"} for i in range(40)]


def streams_polls() -> list[dict]:
    """A Tautulli through a day: streams start and stop, the key is refused, and it recovers."""
    route = "/api/v2"
    return [
        {"at": 0, "routes": {route: activity(THREE, "3")}},
        {"at": 30, "routes": {route: activity(VARIED, "14")}},
        {"at": 60, "routes": {route: activity(MANY, "40")}},
        {"at": 90, "routes": {route: activity(THREE)}},
        {"at": 120, "routes": {route: activity(THREE, "abc")}},
        {"at": 150, "routes": {route: activity(THREE, 2.9)}},
        {"at": 180, "routes": {route: activity(THREE, None)}},
        {"at": 210, "routes": {route: tautulli({"stream_count": None, "sessions": THREE})}},
        # Tautulli cannot reach Plex: success with no data.
        {"at": 240, "routes": {route: tautulli({})}},
        {"at": 270, "routes": {route: activity([], "0")}},
        {"at": 300, "routes": {route: activity(THREE[:1], "1")}},
        {"at": 330, "routes": {route: tautulli(result="error", message="Plex is unreachable")}},
        {"at": 360, "routes": {route: (200, {"response": {"result": "success"}})}},
        {"at": 390, "routes": {route: (200, [1, 2])}},
        {"at": 420, "routes": {route: (200, {"other": 1})}},
        {"at": 450, "routes": {route: (500, {"error": "boom"})}},
        {"at": 480, "routes": {route: (200, b"<html>not json</html>")}},
        {"at": 510, "routes": {route: activity(THREE[1:], "2")}},
        {"at": 540, "routes": {route: tautulli(result="error", message="Invalid apikey")}},
        {"at": 570, "routes": {route: activity(THREE, "3")}},
        {"at": 540 + BACKOFF_S, "routes": {route: activity(THREE, "3")}},
        {"at": 570 + BACKOFF_S, "routes": {route: (401, {"error": "Invalid apikey"})}},
        {"at": 600 + 2 * BACKOFF_S, "routes": {route: (403, {"error": "forbidden"})}},
        {"at": 630 + 3 * BACKOFF_S, "routes": {route: activity(VARIED[:3], "3")}},
        {"at": 660 + 3 * BACKOFF_S, "routes": {route: tautulli(result="error", message=None)}},
        {"at": 690 + 3 * BACKOFF_S, "routes": {route: activity(THREE, True)}},
    ]


# ---- AdGuard Home -----------------------------------------------------------------------------


def stats(blocked, **extra):
    body = {"num_blocked_filtering": blocked, **extra}
    return (200, body)


# An hourly window of 24 hours, its first five empty: 4,800 blocked over 19 hours.
HOURS = {
    "time_units": "hours",
    "dns_queries": [0] * 5 + [120 + i for i in range(19)],
    "blocked_filtering": [0] * 5 + [10 + i for i in range(19)],
}
# A daily window of 30 days.
DAYS = {
    "time_units": "days",
    "dns_queries": [0] * 27 + [9000, 8000, 3000],
    "blocked_filtering": [0] * 27 + [400, 380, 120],
}


def adblock_polls() -> list[dict]:
    """An AdGuard Home in Berlin from 22:00: flies, a swarm, a fall, a lockout, midnight."""
    route = "/control/stats"
    return [
        {"at": 0, "routes": {route: stats(4800, **HOURS)}},
        {"at": 30, "routes": {route: stats(4875, **HOURS)}},
        {"at": 60, "routes": {route: stats(4900, **HOURS)}},
        {"at": 90, "routes": {route: stats(4960, **HOURS)}},
        {"at": 120, "routes": {route: stats(9960, **HOURS)}},
        {"at": 150, "routes": {route: stats(9961, **HOURS)}},
        # The window moved past older blocks.
        {"at": 180, "routes": {route: stats(120, **HOURS)}},
        {"at": 210, "routes": {route: stats(300, **HOURS)}},
        {"at": 240, "routes": {route: stats("450", **HOURS)}},
        {"at": 270, "routes": {route: stats(600.9, **HOURS)}},
        {"at": 300, "routes": {route: (200, {"time_units": "hours"})}},
        {"at": 330, "routes": {route: stats("many", **HOURS)}},
        {"at": 360, "routes": {route: stats(None, **HOURS)}},
        {"at": 390, "routes": {route: (200, [4800])}},
        {"at": 420, "routes": {route: (200, "4800")}},
        {"at": 450, "routes": {route: (500, {"error": "boom"})}},
        {"at": 480, "routes": {route: (200, b"not json at all")}},
        {"at": 510, "routes": {route: stats(700, **HOURS)}},
        # Five bad logins lock AdGuard Home's API: the first refusal pauses the source.
        {"at": 540, "routes": {route: (401, {"error": "unauthorized"})}},
        {"at": 570, "routes": {route: stats(800, **HOURS)}},
        {"at": 540 + BACKOFF_S, "routes": {route: stats(1000, **HOURS)}},
        {"at": 570 + BACKOFF_S, "routes": {route: (403, {"error": "forbidden"})}},
        {"at": 600 + 2 * BACKOFF_S, "routes": {route: (429, {"error": "too many"})}},
        {"at": 630 + 3 * BACKOFF_S, "routes": {route: stats(1100, **HOURS)}},
        # The rest of the evening, then local midnight (23:00 UTC is 00:00 in Berlin).
        {"at": 7140, "routes": {route: stats(1500, **HOURS)}},
        {"at": 7170, "routes": {route: stats(1500, **HOURS)}},
        {"at": 7200, "routes": {route: stats(1580, **HOURS)}},
        {"at": 7230, "routes": {route: stats(1700, **HOURS)}},
        # Statistics the rate cannot be read from: a fly is 50 blocked queries.
        {"at": 7260, "routes": {route: stats(1800, **{**HOURS, "dns_queries": [1, "2"]})}},
        {"at": 7290, "routes": {route: stats(1870, **{**HOURS, "dns_queries": [True, 1]})}},
        {"at": 7320, "routes": {route: stats(1990, **{**HOURS, "dns_queries": [0, 0, 0]})}},
        {"at": 7350, "routes": {route: stats(2050, **{**HOURS, "dns_queries": []})}},
        {"at": 7380, "routes": {route: stats(2100, **{**HOURS, "time_units": "weeks"})}},
        {"at": 7410, "routes": {route: stats(2160, **{**HOURS, "blocked_filtering": "x"})}},
        {"at": 7440, "routes": {route: stats(2300, **{**HOURS, "time_units": None})}},
        {"at": 7470, "routes": {route: stats(2400, dns_queries=[5, 6])}},
        {"at": 7500, "routes": {route: stats(2500, **DAYS)}},
        {"at": 7530, "routes": {route: stats(2900, **DAYS)}},
        {"at": 7560, "routes": {route: stats(2900.0, **DAYS)}},
        {"at": 7590, "routes": {route: stats(True, **DAYS)}},
        {"at": 7620, "routes": {route: stats(50000, **DAYS)}},
    ]


def adblock_first_sight_polls() -> list[dict]:
    """First sight in each window, the hours since local midnight and the last day."""
    route = "/control/stats"
    return [
        {"at": 0, "routes": {route: stats(43200, **DAYS)}},
        {"at": 30, "routes": {route: stats(43207, **DAYS)}},
    ]


# ---- Sonarr and Radarr ------------------------------------------------------------------------


def history(records):
    return (200, {"page": 1, "pageSize": 10, "totalRecords": len(records), "records": records})


def episode(rid, series="The Lantern Keepers", season=1, number=3, source=None):
    record = {"id": rid, "eventType": "downloadFolderImported"}
    record["sourceTitle"] = source or f"The.Lantern.Keepers.S{season}E{number}.1080p"
    if series is not None:
        record["series"] = {"title": series}
    record["episode"] = {"seasonNumber": season, "episodeNumber": number}
    return record


def film(rid, title="Harbour of Glass", year=2024, source=None):
    record = {"id": rid, "eventType": "downloadFolderImported"}
    record["sourceTitle"] = source or "Harbour.of.Glass.2024.1080p"
    record["movie"] = {"title": title, "year": year}
    return record


SONARR_VARIED = [
    episode(23, season="2"),
    {"id": 22, "sourceTitle": "Fen.Owls.S01.1080p", "series": {"title": "Fen Owls"},
     "episode": {"seasonNumber": 1}},
    {"id": 21, "sourceTitle": "No.Series.S01E01", "episode": {"seasonNumber": 1,
     "episodeNumber": 1}},
    {"id": 20, "series": {"title": "Brine"}, "episode": {}},
    {"id": 19},
    {"id": "18", "sourceTitle": "A string id"},
    {"id": 17.0, "sourceTitle": "A float id"},
    {"id": None, "sourceTitle": "No id"},
    {"sourceTitle": "No id at all"},
    "not a record",
    episode(16, series="", season=3, number=7),
    episode(15, series="A Series With A Title Far Too Long For One Caption", season=12,
            number=104),
    episode(14, season=0, number=0),
]  # fmt: skip

RADARR_VARIED = [
    film(9, year=0),
    {"id": 8, "sourceTitle": "No.Year.2023", "movie": {"title": "No Year"}},
    film(7, title="A String Year", year="2023"),
    {"id": 6, "sourceTitle": "No.Movie.Title.2022", "movie": {"year": 2022}},
    {"id": 5, "sourceTitle": "Movie.Null", "movie": None},
    {"id": 4, "sourceTitle": "No.Movie.At.All"},
    film(3, title="Tabs\tand\nBreaks  Inside", year=1999),
]  # fmt: skip


def sonarr_polls() -> list[dict]:
    route = "/api/v3/history"
    return [
        {"at": 0, "routes": {route: history([episode(10), episode(9, number=2)])}},
        {"at": 30, "routes": {route: history([episode(10), episode(9, number=2)])}},
        {"at": 60, "routes": {route: history([episode(12, number=5),
                                               episode(11, source="The.Lantern.Keepers.S01E04"),
                                               episode(10)])}},
        {"at": 90, "routes": {route: history(SONARR_VARIED)}},
        {"at": 120, "routes": {route: history([])}},
        {"at": 150, "routes": {route: history([episode(24), *SONARR_VARIED])}},
        {"at": 180, "routes": {route: (200, {"records": "none"})}},
        {"at": 210, "routes": {route: (200, [episode(25)])}},
        {"at": 240, "routes": {route: (200, {"page": 1})}},
        {"at": 270, "routes": {route: (500, {"error": "boom"})}},
        {"at": 300, "routes": {route: (200, b"<html></html>")}},
        {"at": 330, "routes": {route: history([episode(26), episode(8)])}},
        {"at": 360, "routes": {route: (401, {"error": "Unauthorized"})}},
        {"at": 390, "routes": {route: history([episode(27)])}},
        {"at": 360 + BACKOFF_S, "routes": {route: history([episode(28), episode(27)])}},
    ]  # fmt: skip


def radarr_polls() -> list[dict]:
    route = "/api/v3/history"
    return [
        {"at": 0, "routes": {route: history([])}},
        {"at": 30, "routes": {route: history([film(1)])}},
        {"at": 60, "routes": {route: history([*RADARR_VARIED, film(1)])}},
        {"at": 90, "routes": {route: history([film(12, title="Harbour of Glass", year=2024),
                                               film(10, title="Low Tide", year=2021)])}},
        {"at": 120, "routes": {route: (403, {"error": "forbidden"})}},
    ]  # fmt: skip


# ---- The scenarios ----------------------------------------------------------------------------

BERLIN = {"collector": {"timezone": "Europe/Berlin"}}

SCENARIOS: dict[str, dict] = {
    "streams-names": {
        "sources": {"streams": {}},
        "polls": {"streams": streams_polls()},
    },
    "streams-titles": {
        "sources": {"streams": {"show": "titles"}},
        "polls": {"streams": streams_polls()},
    },
    "streams-count": {
        "sources": {"streams": {"show": "count", "every_s": 20}},
        "polls": {"streams": streams_polls()},
    },
    "adblock": {
        "raw": BERLIN,
        "sources": {"adblock": {}},
        "polls": {"adblock": adblock_polls()},
    },
    "adblock-zero": {
        "raw": BERLIN,
        "sources": {"adblock": {"fly_every_s": 0}},
        "polls": {"adblock": adblock_polls()[:12]},
    },
    "adblock-quarter": {
        "sources": {"adblock": {"fly_every_s": 0.5, "secret": "dns"}},
        "env": {
            "KNIGHTWATCHER_DNS_USERNAME": "kw-" + secrets.token_hex(4),
            "KNIGHTWATCHER_DNS_PASSWORD": secrets.token_urlsafe(12),
        },
        "polls": {"adblock": adblock_polls()[:8]},
    },
    "adblock-first-sight-days": {
        "raw": BERLIN,
        "sources": {"adblock": {}},
        "polls": {"adblock": adblock_first_sight_polls()},
    },
    "adblock-first-sight-hours-utc": {
        "sources": {"adblock": {}},
        "polls": {"adblock": [{"at": 0, "routes": {"/control/stats": stats(4800, **HOURS)}}]},
    },
    # Memory from a version that kept no count for today: seeded once, with the rise added.
    "adblock-upgrade": {
        "raw": BERLIN,
        "sources": {"adblock": {}},
        "memory": {
            "seq": 41,
            "events": [
                {
                    "seq": 41,
                    "type": "ad_blocked",
                    "at": "2026-01-15T20:59:30Z",
                    "count": 2,
                    "text": "",
                }
            ],
            "sources": {"adblock": {"blocked": 4700}},
            "backoff": {},
        },
        "polls": {"adblock": adblock_polls()[:3]},
    },
    # Memory that says the source is still paused from before a restart.
    "adblock-paused-at-start": {
        "sources": {"adblock": {}},
        "memory": {
            "seq": 3,
            "events": [],
            "sources": {"adblock": {"blocked": 4700, "day": "2026-01-15", "today": 90}},
            "backoff": {
                "adblock": {
                    "until": "2026-01-15T21:10:00Z",
                    "at": "2026-01-15T20:50:00Z",
                    "error": "HTTP 401: credentials refused",
                }
            },
        },
        "polls": {
            "adblock": [
                {"at": t, "routes": {"/control/stats": stats(4800, **HOURS)}}
                for t in (0, 30, 600, 630)
            ]
        },
    },
    "sonarr": {
        "sources": {"sonarr": {}},
        "polls": {"sonarr": sonarr_polls()},
    },
    "radarr": {
        "sources": {"radarr": {"secret": "films"}},
        "env": {"KNIGHTWATCHER_FILMS_API_KEY": secrets.token_hex(16)},
        "polls": {"radarr": radarr_polls()},
    },
    # All four at once, as a wall reads them: the quiet line, the streaming words and the events
    # of several sources in one poll.
    "all-four": {
        "raw": BERLIN,
        "sources": {"streams": {"show": "names"}, "adblock": {}, "sonarr": {}, "radarr": {}},
        "polls": {
            "streams": streams_polls()[:12],
            "adblock": adblock_polls()[:12],
            "sonarr": sonarr_polls()[:12],
            "radarr": radarr_polls(),
        },
    },
}


# ---- The run ----------------------------------------------------------------------------------


def _request(path: str, headers: dict, env: dict) -> str:
    """One request as the fixture records it: the method, the path and query, and the headers but
    the host, each credential replaced by its variable's name."""
    shown = []
    for name in sorted(headers, key=str.lower):
        if name.lower() == "host":
            continue
        value = headers[name]
        if name.lower() == "authorization" and value.startswith("Basic "):
            value = "Basic " + base64.b64decode(value[6:]).decode()
        shown.append(f"{name}: {value}")
    line = "\n".join([f"GET {path}", *shown])
    for variable, value in sorted(env.items(), key=lambda kv: -len(kv[1])):
        line = line.replace(value, "{" + variable + "}")
    return line


def run(name: str) -> list[dict]:
    """Every poll of a scenario: the requests made, state.json and memory.json after it."""
    scenario = SCENARIOS[name]
    env = {**_env(), **scenario.get("env", {})}
    tmp = tempfile.TemporaryDirectory()
    servers = {source: FakeHttp() for source in scenario["sources"]}
    try:
        out, var = os.path.join(tmp.name, "out"), os.path.join(tmp.name, "var")
        os.mkdir(out)
        os.mkdir(var)
        raw = json.loads(json.dumps(scenario.get("raw", {})))
        raw.setdefault("collector", {}).update(output_dir=out, state_dir=var)
        raw["sources"] = {
            source: {"url": servers[source].url, **settings}
            for source, settings in scenario["sources"].items()
        }
        memory = Memory(var)
        if "memory" in scenario:
            with open(memory.path, "w", encoding="utf-8") as fh:
                json.dump(scenario["memory"], fh)
            memory.load()
        clock = Clock()
        runner = Runner(make_config(raw, env), memory, clock=clock)
        times = sorted({p["at"] for polls in scenario["polls"].values() for p in polls})
        record = []
        for t in times:
            for source, polls in scenario["polls"].items():
                for p in polls:
                    if p["at"] == t:
                        servers[source].routes.update(p["routes"])
            for server in servers.values():
                server.requests.clear()
            clock.now = at(t)
            runner.cycle()
            requests = sorted(
                _request(path, headers, env)
                for server in servers.values()
                for path, headers in server.requests
            )
            with open(os.path.join(out, "state.json"), encoding="utf-8") as fh:
                state = fh.read()
            try:
                with open(memory.path, encoding="utf-8") as fh:
                    saved = fh.read()
            except FileNotFoundError:
                saved = None
            record.append(
                {"at": t, "requests": requests, "state": state.split("\n"), "memory": saved}
            )
        return record
    finally:
        for server in servers.values():
            server.close()
        tmp.cleanup()


def fixture_path(name: str) -> str:
    return os.path.join(FIXTURES, f"{name}.json")


def dump(record: list[dict]) -> str:
    return json.dumps(record, ensure_ascii=False, indent=1) + "\n"


class PortTest(unittest.TestCase):
    """Each scenario's polls against the record the readers before the provider engine made."""

    def check(self, name: str) -> None:
        with open(fixture_path(name), encoding="utf-8") as fh:
            want = json.load(fh)
        got = run(name)
        self.assertEqual(len(got), len(want), name)
        for i, (g, w) in enumerate(zip(got, want, strict=True)):
            where = f"{name}, poll {i} at {w['at']} s"
            self.assertEqual(g["requests"], w["requests"], where)
            self.assertEqual("\n".join(g["state"]), "\n".join(w["state"]), where)
            self.assertEqual(g["memory"], w["memory"], where)

    def test_every_scenario_has_a_record(self):
        names = sorted(f[:-5] for f in os.listdir(FIXTURES) if f.endswith(".json"))
        self.assertEqual(names, sorted(SCENARIOS))


def _add(name: str) -> None:
    def test(self):
        self.check(name)

    test.__name__ = "test_" + name.replace("-", "_")
    test.__doc__ = f"The scenario {name}, byte for byte."
    setattr(PortTest, test.__name__, test)


for _name in SCENARIOS:
    _add(_name)


if __name__ == "__main__":
    unittest.main()
