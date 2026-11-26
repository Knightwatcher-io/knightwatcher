"""The kinds, each through its built-in provider against invented answers: streams, adblock and
imports; and security from fills, its provider (fail2ban) being tested on its own in
tests/collector/test_fail2ban.py. tests/collector/test_port.py holds the same readings to what the
collector wrote before the kinds, byte for byte; tests/collector/test_providers.py checks each
provider's fill."""

import datetime as dt
import json
import unittest
from typing import ClassVar

from collector.kinds import LISTS, SECTIONS, check_fill, kind_class, kind_of, provider_of
from collector.kinds.adblock import blocked_since_midnight, normal_rate
from collector.kinds.streams import line, shown
from collector.net import AuthError, SourceError
from collector.sources import KindSource, Reading
from kw_helpers import T0, FakeHttp, at, make_config

# The credentials the providers log in with, as the environment holds them.
SECRETS = {
    "KW_ADGUARD_USERNAME": "kw",
    "KW_ADGUARD_PASSWORD": "pw-example",
    "KW_TAUTULLI_API_KEY": "tk-example",
    "KW_SONARR_API_KEY": "sk-example",
    "KW_RADARR_API_KEY": "rk-example",
    "KW_TECHNITIUM_TOKEN": "tok-example",
    "KW_PLEX_TOKEN": "plex-example",
    "KW_TRACEARR_API_KEY": "trr_pub_example",
    "KW_JELLYFIN_API_KEY": "jf-example",
}


def source(name, settings, raw=None):
    raw = dict(raw or {})
    raw.setdefault("sources", {})[name] = settings
    config = make_config(raw, SECRETS)
    return KindSource(name, config.sources[name], config)


class AdblockTest(unittest.TestCase):
    """The adblock kind through the adguard provider, against an invented AdGuard Home."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.stats = {"num_blocked_filtering": 4800}
        self.http.routes["/control/stats"] = (200, lambda _h: self.stats)

    def make(self, raw=None, **settings):
        return source("adblock", {"url": self.http.url, **settings}, raw)

    def poll(self, s, memory, total, when=T0):
        self.stats["num_blocked_filtering"] = total
        r = s.fetch(when)
        return s.observe(r, memory, when), r.facts["blocked_today"]

    def reading(self, total, rate=0.25, seed=0):
        return Reading({"blocked_today": seed}, {"blocked": total, "rate": rate, "seed": seed})

    def observe(self, s, memory, total, rate=0.25):
        # At 0.25 blocked a second, a fly every 300 seconds stands for 75 blocked queries.
        return s.observe(self.reading(total, rate), memory, T0)

    def flies(self, events):
        self.assertLessEqual(len(events), 1)
        return events[0]["count"] if events else 0

    def window(self):
        # Two days with queries at the end of a 90-day window: 43,200 blocked over 172,800
        # seconds is 0.25 a second. Today so far is the last day's 120.
        self.stats.update(
            {
                "time_units": "days",
                "dns_queries": [0] * 88 + [900, 300],
                "blocked_filtering": [0] * 88 + [400, 120],
                "num_blocked_filtering": 43200,
            }
        )

    def test_rate_from_days(self):
        self.window()
        self.assertEqual(self.make().fetch(T0).data["rate"], 0.25)
        window = {"unit_s": 86400, "current": True, "queries": [0] * 88 + [900, 300]}
        self.assertEqual(normal_rate(window, 43200), 0.25)

    def test_rate_from_hours(self):
        self.stats.update({"time_units": "hours", "dns_queries": [10] * 24})
        self.stats["num_blocked_filtering"] = 21600
        self.assertEqual(self.make().fetch(T0).data["rate"], 0.25)

    def test_leading_empty_units_are_left_out_of_the_window(self):
        window = {"unit_s": 3600, "current": True, "queries": [0] * 20 + [0, 3, 0, 8]}
        self.assertEqual(normal_rate(window, 2700), 0.25)  # three hours, not 24

    def test_unknown_rate(self):
        for stats in (
            {},
            {"time_units": "days"},
            {"time_units": "days", "dns_queries": []},
            {"time_units": "days", "dns_queries": [0, 0, 0]},
            {"time_units": "days", "dns_queries": [1, "2"]},
            {"time_units": "days", "dns_queries": [True, 1]},
            {"time_units": "days", "dns_queries": "lots"},
            {"time_units": "weeks", "dns_queries": [1, 2]},
        ):
            self.stats = {"num_blocked_filtering": 100, **stats}
            self.assertIsNone(self.make().fetch(T0).data["rate"], stats)
        self.assertIsNone(normal_rate(None, 100))

    def test_unknown_rate_gives_a_fly_per_fifty_blocked(self):
        s, memory = self.make(), {}
        self.poll(s, memory, 1000)
        self.assertEqual(self.poll(s, memory, 1049)[0], [])
        self.assertEqual(
            self.poll(s, memory, 1050)[0], [{"type": "ad_blocked", "count": 1, "text": ""}]
        )
        self.assertEqual(memory["carry"], 0)

    def test_carry_across_polls(self):
        s, memory = self.make(), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.observe(s, memory, 1030), [])
        self.assertEqual(self.observe(s, memory, 1060), [])
        self.assertEqual(self.observe(s, memory, 1074), [])
        self.assertEqual(memory["carry"], 74)
        self.assertEqual(
            self.observe(s, memory, 1075), [{"type": "ad_blocked", "count": 1, "text": ""}]
        )
        self.assertEqual(memory["carry"], 0)
        self.assertEqual(self.flies(self.observe(s, memory, 1235)), 2)
        self.assertEqual(memory["carry"], 10)

    def test_a_burst_is_capped_at_eight_and_the_excess_dropped(self):
        s, memory = self.make(), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.flies(self.observe(s, memory, 1000 + 75 * 20 + 7)), 8)
        self.assertEqual(memory["carry"], 7)
        self.assertEqual(self.flies(self.observe(s, memory, 1000 + 75 * 21)), 1)

    def test_a_fly_is_never_less_than_one_blocked_query(self):
        s, memory = self.make(fly_every_s=0.5), {}
        self.observe(s, memory, 1000)
        self.assertEqual(self.flies(self.observe(s, memory, 1003)), 3)

    def test_zero_keeps_one_fly_per_blocked_query(self):
        s, memory = self.make(fly_every_s=0), {}
        self.observe(s, memory, 4800)
        self.assertEqual(
            self.observe(s, memory, 4803), [{"type": "ad_blocked", "count": 3, "text": ""}]
        )
        self.assertEqual(self.flies(self.observe(s, memory, 5303)), 500)

    def test_first_sight_and_a_fall_raise_nothing(self):
        s, memory = self.make(), {}
        self.assertEqual(self.observe(s, memory, 1000), [])  # first sight
        self.assertNotIn("carry", memory)
        self.assertEqual(self.observe(s, memory, 1000), [])  # no rise
        self.observe(s, memory, 1050)
        self.assertEqual(self.observe(s, memory, 100), [])  # the rolling window moved on
        self.assertEqual(memory["blocked"], 100)
        self.assertEqual(memory["carry"], 50)
        self.assertEqual(memory["today"], 50)
        self.assertEqual(self.flies(self.observe(s, memory, 125)), 1)

    def test_memory_from_the_previous_version(self):
        s, memory = self.make(), {"blocked": 1000}
        reading = self.reading(1200, seed=120)
        self.assertEqual(self.flies(s.observe(reading, memory, T0)), 2)
        self.assertEqual(memory["carry"], 50)
        self.assertEqual(reading.facts["blocked_today"], 120 + 200)  # seeded once, rise added
        reading = self.reading(1210, seed=999)
        s.observe(reading, memory, T0)
        self.assertEqual(reading.facts["blocked_today"], 330)

    def test_today_seeded_from_the_last_day(self):
        self.window()
        s, memory = self.make(), {}
        self.assertEqual(self.poll(s, memory, 43200)[1], 120)
        self.assertEqual(self.poll(s, memory, 43207)[1], 127)
        self.assertEqual(memory["today"], 127)

    def test_today_seeded_from_the_hours_since_local_midnight(self):
        # 21:00 UTC is 22:00 in Berlin in January: the last 23 hours of the window.
        self.stats.update(
            {"time_units": "hours", "dns_queries": [5] * 24, "blocked_filtering": list(range(24))}
        )
        s, memory = self.make({"collector": {"timezone": "Europe/Berlin"}}), {}
        self.assertEqual(self.poll(s, memory, 400)[1], sum(range(1, 24)))

    def test_today_resets_at_local_midnight(self):
        self.window()
        s, memory = self.make({"collector": {"timezone": "Europe/Berlin"}}), {}
        self.poll(s, memory, 43200, at(7140))
        self.assertEqual(self.poll(s, memory, 43210, at(7170))[1], 130)  # 23:59:30 local
        self.assertEqual(memory["day"], "2026-01-15")
        self.assertEqual(self.poll(s, memory, 43215, at(7200))[1], 5)  # 00:00 local, no seed
        self.assertEqual(memory["day"], "2026-01-16")
        self.assertEqual(self.poll(s, memory, 43221, at(7230))[1], 11)

    def test_unknown_shape_seeds_nothing(self):
        s, memory = self.make(), {}
        self.assertEqual(self.poll(s, memory, 4800)[1], 0)
        self.assertEqual(self.poll(s, memory, 4803)[1], 3)
        self.assertEqual(blocked_since_midnight(None, at(0)), 0)
        self.assertEqual(blocked_since_midnight({"unit_s": 86400, "current": True}, at(0)), 0)

    def test_today_counts_the_buckets_since_local_midnight(self):
        # 21:00 UTC: 21 whole hours and the current one; with finished buckets, the 21 alone.
        window = {"unit_s": 3600, "current": True, "blocked": list(range(24))}
        self.assertEqual(blocked_since_midnight(window, at(0)), sum(range(2, 24)))
        window["current"] = False
        self.assertEqual(blocked_since_midnight(window, at(0)), sum(range(3, 24)))
        # Ten-minute buckets at 21:00: 126 since midnight and the current one.
        window = {"unit_s": 600, "current": True, "blocked": [1] * 200}
        self.assertEqual(blocked_since_midnight(window, at(0)), 127)
        self.assertEqual(blocked_since_midnight(window, at(-21 * 3600)), 1)
        window["current"] = False
        self.assertEqual(blocked_since_midnight(window, at(-21 * 3600)), 0)

    def test_credentials_go_with_the_first_request(self):
        self.http.routes["/control/stats"] = (200, {"num_blocked_filtering": 1})
        s = source("adblock", {"url": self.http.url})
        s.fetch(T0)
        self.assertEqual(len(self.http.requests), 1)
        self.assertTrue(self.http.requests[0][1]["Authorization"].startswith("Basic "))

    def test_refused_login_is_an_auth_error_after_one_request(self):
        for status in (401, 403):
            self.http.requests.clear()
            self.http.routes["/control/stats"] = (status, {"message": "nope"})
            s = source("adblock", {"url": self.http.url})
            with self.assertRaises(AuthError):
                s.fetch(T0)
            self.assertEqual(len(self.http.requests), 1)

    def test_error_text_carries_no_secret_or_url(self):
        s = source("adblock", {"url": "http://127.0.0.1:9"})
        with self.assertRaises(SourceError) as cm:
            s.fetch(T0)
        self.assertNotIn("pw-example", str(cm.exception))
        self.assertNotIn("127.0.0.1", str(cm.exception))


def minutes(end, counts):
    """Technitium's last hour as its API gives it: a bucket a minute, each labelled with its end,
    the last one ending at end, with the blocked queries of each from counts (oldest first)."""
    labels = [
        (end - dt.timedelta(minutes=len(counts) - 1 - i)).strftime("%Y-%m-%dT%H:%M:%S.0000000Z")
        for i in range(len(counts))
    ]
    return {
        "status": "ok",
        "response": {
            "mainChartData": {
                "labels": labels,
                "datasets": [
                    {"label": "Total", "data": [c * 4 for c in counts]},
                    {"label": "Blocked", "data": list(counts)},
                ],
            }
        },
    }


class RecentTest(unittest.TestCase):
    """The adblock kind's recent mode, through the technitium provider against an invented
    Technitium DNS Server: finished minutes over a sliding hour, added up as they appear."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        # The last finished minute ends at T0, read at T0 + 30 s.
        self.hour = minutes(T0, [0] * 60)
        self.day = {"status": "ok", "response": {"mainChartData": {"labels": [], "datasets": []}}}
        self.http.routes["/api/dashboard/stats/get"] = (
            200,
            lambda h: self.hour if "type=LastHour" in h.path else self.day,
        )

    def make(self, raw=None, **settings):
        settings = {"url": self.http.url, "from": "technitium", "fly_every_s": 0, **settings}
        return source("adblock", settings, raw)

    def poll(self, s, memory, end, counts, when=None):
        """A read at when (30 seconds after end by default) of an hour ending at end."""
        self.hour = minutes(end, counts)
        when = when or end + dt.timedelta(seconds=30)
        r = s.fetch(when)
        return s.observe(r, memory, when), r.facts["blocked_today"]

    def test_the_token_goes_in_the_authorization_header(self):
        self.make().fetch(at(30))
        self.assertEqual(
            [p for p, _ in self.http.requests],
            [
                "/api/dashboard/stats/get?type=LastHour&utc=true",
                "/api/dashboard/stats/get?type=LastDay&utc=true",
            ],
        )
        for _, headers in self.http.requests:
            self.assertEqual(headers["Authorization"], "Bearer tok-example")

    def test_first_sight_records_the_newest_and_adds_nothing(self):
        s, memory = self.make(), {}
        events, today = self.poll(s, memory, T0, [3] * 60)
        self.assertEqual((events, today), ([], 0))
        self.assertEqual(memory["recent_at"], "2026-01-15T21:00:00+00:00")
        self.assertNotIn("blocked", memory)

    def test_new_minutes_are_added_as_they_appear(self):
        s, memory = self.make(), {}
        self.poll(s, memory, T0, [3] * 60)
        # A minute later the window has slid by one: the oldest minute left, one new one came.
        later = T0 + dt.timedelta(minutes=1)
        events, today = self.poll(s, memory, later, [3] * 59 + [5])
        self.assertEqual(events, [{"type": "ad_blocked", "count": 5, "text": ""}])
        self.assertEqual(today, 5)
        # The same hour read again adds nothing.
        self.assertEqual(self.poll(s, memory, later, [3] * 59 + [5])[0], [])
        # Two minutes more, read together.
        later += dt.timedelta(minutes=2)
        events, today = self.poll(s, memory, later, [3] * 57 + [5, 2, 4])
        self.assertEqual(events, [{"type": "ad_blocked", "count": 6, "text": ""}])
        self.assertEqual((today, memory["today"]), (11, 11))

    def test_a_minute_with_nothing_blocked_raises_nothing(self):
        s, memory = self.make(), {}
        self.poll(s, memory, T0, [3] * 60)
        later = T0 + dt.timedelta(minutes=1)
        self.assertEqual(self.poll(s, memory, later, [3] * 59 + [0]), ([], 0))
        self.assertEqual(memory["recent_at"], "2026-01-15T21:01:00+00:00")

    def test_a_minute_counts_only_once_it_has_settled(self):
        # Technitium shows a minute's count from an hour before until it has finished counting,
        # up to ten seconds after the minute ends: a bucket younger than 20 seconds is left.
        s, memory = self.make(), {}
        self.poll(s, memory, T0, [3] * 60)
        later = T0 + dt.timedelta(minutes=1)
        stale = self.poll(s, memory, later, [3] * 59 + [9], when=later + dt.timedelta(seconds=5))
        self.assertEqual(stale, ([], 0))
        self.assertEqual(memory["recent_at"], "2026-01-15T21:00:00+00:00")
        events, today = self.poll(
            s, memory, later, [3] * 59 + [2], when=later + dt.timedelta(seconds=20)
        )
        self.assertEqual((events[0]["count"], today), (2, 2))

    def test_first_sight_leaves_a_minute_not_yet_settled_for_later(self):
        s, memory = self.make(), {}
        self.poll(s, memory, T0, [3] * 60, when=T0 + dt.timedelta(seconds=10))
        self.assertEqual(memory["recent_at"], "2026-01-15T20:59:00+00:00")
        events, _ = self.poll(s, memory, T0, [3] * 59 + [7])
        self.assertEqual(events[0]["count"], 7)

    def test_a_gap_longer_than_the_window_adds_every_minute_listed(self):
        s, memory = self.make({}, fly_every_s=300), {}
        self.poll(s, memory, T0, [0] * 60)
        later = T0 + dt.timedelta(hours=3)
        events, today = self.poll(s, memory, later, [1] * 60)
        self.assertEqual(today, 60)
        # With no rate, 50 blocked queries a fly.
        self.assertEqual(events[0]["count"], 1)
        self.assertEqual(memory["carry"], 10)

    def test_rate_and_seed_from_the_day(self):
        # 24 finished hours, the last ending at 21:00 UTC; the current hour is left out. 4 blocked
        # an hour in the last 20 hours with queries is 80 over 72,000 seconds.
        self.day = {
            "status": "ok",
            "response": {
                "mainChartData": {
                    "labels": [f"h{i}" for i in range(24)],
                    "datasets": [
                        {"label": "Total", "data": [0] * 4 + [10] * 20},
                        {"label": "Blocked", "data": [0] * 4 + [4] * 20},
                    ],
                }
            },
        }
        s, memory = self.make(fly_every_s=900), {}
        reading = s.fetch(T0 + dt.timedelta(seconds=30))
        self.assertAlmostEqual(reading.data["rate"], 80 / 72000)
        # 21:00:30 UTC: 21 finished hours since midnight.
        self.assertEqual(reading.data["seed"], 4 * 20)
        events, today = self.poll(s, memory, T0, [0] * 60)
        self.assertEqual((events, today), ([], 80))
        # A fly every 900 seconds at that rate is one for each blocked query.
        events, today = self.poll(s, memory, T0 + dt.timedelta(minutes=1), [0] * 59 + [3])
        self.assertEqual((events[0]["count"], today), (3, 83))

    def test_unknown_day_gives_no_rate_and_no_seed(self):
        s = self.make()
        reading = s.fetch(T0 + dt.timedelta(seconds=30))
        self.assertIsNone(reading.data["rate"])
        self.assertEqual(reading.data["seed"], 0)

    def test_today_resets_at_local_midnight(self):
        s, memory = self.make({"collector": {"timezone": "Europe/Berlin"}}), {}
        # 22:59 UTC is 23:59 in Berlin.
        end = T0 + dt.timedelta(minutes=118)
        self.poll(s, memory, end, [1] * 60)
        self.assertEqual(self.poll(s, memory, end + dt.timedelta(minutes=1), [1] * 60)[1], 1)
        self.assertEqual(memory["day"], "2026-01-15")
        midnight = end + dt.timedelta(minutes=2)
        self.assertEqual(self.poll(s, memory, midnight, [1] * 60)[1], 1)
        self.assertEqual(memory["day"], "2026-01-16")

    def test_a_marker_from_the_other_mode_is_dropped(self):
        # Memory left by AdGuard Home's rolling count, then the recent mode, then back.
        s, memory = self.make(), {"blocked": 4800, "day": "2026-01-15", "today": 12, "carry": 0}
        self.assertEqual(self.poll(s, memory, T0, [3] * 60), ([], 12))
        self.assertNotIn("blocked", memory)
        self.assertIn("recent_at", memory)
        adguard = FakeHttp()
        self.addCleanup(adguard.close)
        adguard.routes["/control/stats"] = (200, {"num_blocked_filtering": 100})
        a = source("adblock", {"url": adguard.url, "fly_every_s": 0})
        self.assertEqual(a.observe(a.fetch(T0), memory, T0), [])
        self.assertNotIn("recent_at", memory)
        self.assertEqual(memory["blocked"], 100)

    def test_a_marker_that_cannot_be_true_starts_again_from_first_sight(self):
        for marker in ("2026-01-16T00:00:00+00:00", "yesterday", 7):
            s, memory = self.make(), {"recent_at": marker, "day": "2026-01-15", "today": 0}
            self.assertEqual(self.poll(s, memory, T0, [3] * 60), ([], 0), marker)
            self.assertEqual(memory["recent_at"], "2026-01-15T21:00:00+00:00")

    def test_an_empty_hour_keeps_the_marker(self):
        s, memory = self.make(), {}
        self.poll(s, memory, T0, [3] * 60)
        self.assertEqual(self.poll(s, memory, T0, []), ([], 0))
        self.assertEqual(memory["recent_at"], "2026-01-15T21:00:00+00:00")

    def test_fly_every_s_paces_the_flies_as_with_a_rolling_count(self):
        s, memory = self.make({}, fly_every_s=300), {}
        self.poll(s, memory, T0, [0] * 60)
        events, _ = self.poll(s, memory, T0 + dt.timedelta(minutes=1), [0] * 59 + [49])
        self.assertEqual(events, [])
        events, _ = self.poll(s, memory, T0 + dt.timedelta(minutes=2), [0] * 58 + [49, 1])
        self.assertEqual(events, [{"type": "ad_blocked", "count": 1, "text": ""}])
        self.assertEqual(memory["carry"], 0)

    def test_an_error_status_and_a_refused_token(self):
        s = self.make()
        self.hour = {"status": "error", "errorMessage": "something broke"}
        with self.assertRaises(SourceError) as cm:
            s.fetch(at(30))
        self.assertEqual(str(cm.exception), "Technitium reported an error")
        self.assertNotIsInstance(cm.exception, AuthError)
        # A token Technitium does not know, and version 14, which reads no Authorization header.
        for message, status in (
            ("Invalid token or session expired.", "invalid-token"),
            ("Parameter 'token' missing.", "error"),
        ):
            self.hour = {"status": status, "errorMessage": message}
            with self.assertRaises(AuthError) as cm:
                s.fetch(at(30))
            self.assertEqual(
                str(cm.exception), "API token refused, or Technitium is older than version 15"
            )

    def test_lists_of_different_lengths_fail_the_read(self):
        s = self.make()
        self.hour = minutes(T0, [1] * 60)
        self.hour["response"]["mainChartData"]["labels"].pop()
        with self.assertRaises(SourceError) as cm:
            s.fetch(at(30))
        self.assertEqual(str(cm.exception), "the lists of recent differ in length")

    def test_a_fill_with_neither_count_is_refused(self):
        kind = kind_class("adblock")()
        config = make_config()
        with self.assertRaises(SourceError) as cm:
            kind.reading({}, {"fly_every_s": 0}, config, T0)
        self.assertEqual(str(cm.exception), "provider gave neither blocked nor recent")
        too_many = [{"at": T0, "blocked": 1}] * 1441
        with self.assertRaises(SourceError) as cm:
            check_fill(kind.FILL, {"recent": too_many}, kind.allowed({}))
        self.assertEqual(str(cm.exception), "provider gave more than 1440 recent")


class ImportsTest(unittest.TestCase):
    """The imports kind through the sonarr and radarr providers."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.records = []
        self.http.routes["/api/v3/history"] = (200, lambda _h: {"records": self.records})

    def test_sonarr_events_and_titles(self):
        s = source("sonarr", {"url": self.http.url})
        memory = {}
        self.records = [{"id": 10, "sourceTitle": "Old.Show.S01E01.1080p"}]
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])
        self.records = [
            {
                "id": 12,
                "sourceTitle": "The.Gull.Ledger.S02E05.1080p",
                "series": {"title": "The Gull Ledger"},
                "episode": {"seasonNumber": 2, "episodeNumber": 5},
            },
            {"id": 11, "sourceTitle": "The.Gull.Ledger.S02E04.1080p"},
            {"id": 10, "sourceTitle": "Old.Show.S01E01.1080p"},
        ]
        events = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual(
            [e["text"] for e in events],
            ["IMPORTED · The.Gull.Ledger.S02E04.1080p", "IMPORTED · The Gull Ledger S02E05"],
        )
        self.assertEqual(
            [e["parts"] for e in events],
            [{"title": "The.Gull.Ledger.S02E04.1080p"}, {"title": "The Gull Ledger S02E05"}],
        )
        self.assertEqual(memory["last_id"], 12)
        path, headers = self.http.requests[-1]
        self.assertIn("eventType=3", path)
        self.assertIn("includeSeries=true", path)
        self.assertEqual(headers["X-Api-Key"], "sk-example")

    def test_empty_history_on_first_start_still_catches_the_first_import(self):
        s = source("radarr", {"url": self.http.url})
        memory = {}
        self.assertEqual(s.observe(s.fetch(T0), memory, T0), [])
        self.records = [{"id": 1, "sourceTitle": "x", "movie": {"title": "A Film", "year": 2024}}]
        events = s.observe(s.fetch(T0), memory, T0)
        self.assertEqual([e["text"] for e in events], ["IMPORTED · A Film (2024)"])
        self.assertEqual([e["parts"] for e in events], [{"title": "A Film (2024)"}])

    def test_refused_key_is_an_auth_error(self):
        self.http.routes["/api/v3/history"] = (401, {"message": "Unauthorized"})
        s = source("radarr", {"url": self.http.url})
        with self.assertRaises(AuthError):
            s.fetch(T0)


class StreamsTest(unittest.TestCase):
    """The streams kind through the tautulli provider."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)

    def titles(self, *sessions):
        for i, s in enumerate(sessions):
            s.setdefault("session_key", str(i))
        return self.fetch("titles", list(sessions), str(len(sessions)))["titles"]

    def test_titles(self):
        episode = {"media_type": "episode", "grandparent_title": "The Gull Ledger"}
        self.assertEqual(
            self.titles(
                {**episode, "parent_media_index": "2", "media_index": "4"},
                {**episode, "parent_media_index": 2, "media_index": 11},
                {"media_type": "episode", "parent_media_index": "1", "media_index": "2"},
                {**episode, "media_index": "4", "full_title": "Unused"},
                {"media_type": "episode", "full_title": "The Gull Ledger - Pilot"},
                {"media_type": "movie", "title": "A Film"},
                {"media_type": "movie", "full_title": "A Film, Whole"},
                {"media_type": "track", "grandparent_title": "Band", "title": "Song"},
                {"media_type": "track", "grandparent_title": "Band"},
                {"media_type": "track", "title": "Song", "full_title": "Unused"},
                {"media_type": "track"},
                {"title": "No Kind"},
            ),
            [
                "The Gull Ledger S02E04",
                "The Gull Ledger S02E11",
                "S01E02",
                "The Gull Ledger",
                "The Gull Ledger - Pilot",
                "A Film",
                "A Film, Whole",
                "Band - Song",
                "Band",
                "Song",
                "No Kind",
            ],
        )

    def test_activity(self):
        reply = {
            "response": {
                "result": "success",
                "data": {
                    "stream_count": "1",
                    "sessions": [{"media_type": "movie", "title": "A Film"}],
                },
            }
        }
        self.http.routes["/api/v2"] = (200, reply)
        s = source("streams", {"url": self.http.url})
        self.assertEqual(
            s.fetch(T0).facts,
            {"count": 1, "titles": ["A Film"], "sessions": [{"title": "A Film"}]},
        )
        self.assertIn("apikey=tk-example", self.http.requests[0][0])

    def reply(self, data):
        self.http.routes["/api/v2"] = (200, {"response": {"result": "success", "data": data}})
        return source("streams", {"url": self.http.url})

    def test_a_reply_without_a_stream_count_is_a_failed_read(self):
        # Tautulli that cannot reach Plex answers success with empty data: a failed read, never
        # no streams, and not refused credentials either, so the source is not paused.
        for data in ({}, {"sessions": []}, {"sessions": self.SESSIONS}):
            with self.subTest(data=data), self.assertRaises(SourceError) as cm:
                self.reply(data).fetch(T0)
            self.assertNotIsInstance(cm.exception, AuthError)
            self.assertEqual(str(cm.exception), "Tautulli cannot reach Plex")
        # an error Tautulli reports keeps its own words
        self.http.routes["/api/v2"] = (200, {"response": {"result": "error", "data": {}}})
        with self.assertRaises(SourceError) as cm:
            source("streams", {"url": self.http.url}).fetch(T0)
        self.assertEqual(str(cm.exception), "Tautulli reported an error")

    def test_a_stream_count_that_is_no_number_falls_back_to_the_sessions(self):
        for count, n in (("abc", 3), (None, 3), (True, 1), (2.9, 2), ("", 3), ("0", 0)):
            with self.subTest(count=count):
                facts = self.reply({"stream_count": count, "sessions": self.SESSIONS}).fetch(T0)
                self.assertEqual(facts.facts["count"], n)

    # Three invented streams, as Tautulli lists them: not in the order they started.
    SESSIONS: ClassVar[list] = [
        {
            "session_key": "12",
            "friendly_name": "Sam",
            "user": "sam.k",
            "username": "samk",
            "media_type": "movie",
            "title": "Harbour of Glass",
            "transcode_decision": "transcode",
            "player": "Lounge TV",
        },
        {
            "session_key": "7",
            "friendly_name": "Robin",
            "media_type": "episode",
            "grandparent_title": "The Saltmarsh Bells",
            "parent_media_index": "1",
            "media_index": "3",
        },
        {
            "session_key": "30",
            "friendly_name": "",
            "user": "alex",
            "media_type": "track",
            "grandparent_title": "Fen Owls",
            "title": "Reedsong",
        },
    ]

    def fetch(self, show=None, sessions=None, count="3"):
        given = self.SESSIONS if sessions is None else sessions
        data = {"stream_count": count, "sessions": given}
        self.http.routes["/api/v2"] = (200, {"response": {"result": "success", "data": data}})
        settings = {"url": self.http.url}
        if show is not None:
            settings["show"] = show
        self.made = source("streams", settings)
        return self.made.fetch(T0).facts

    def test_names_by_default_in_the_order_the_streams_started(self):
        self.assertEqual(
            self.fetch(),
            {
                "count": 3,
                "titles": ["The Saltmarsh Bells S01E03", "Harbour of Glass", "Fen Owls - Reedsong"],
                "sessions": [
                    {"who": "Robin", "title": "The Saltmarsh Bells S01E03"},
                    {"who": "Sam", "title": "Harbour of Glass"},
                    {"who": "alex", "title": "Fen Owls - Reedsong"},
                ],
            },
        )

    def test_a_name_is_the_friendly_name_then_the_user_then_the_user_name(self):
        names = [
            {"friendly_name": "Robin", "user": "r", "username": "rb"},
            {"friendly_name": " \t", "user": "r", "username": "rb"},
            {"friendly_name": None, "username": "rb"},
            {"friendly_name": 7, "user": ""},
            {},
        ]
        sessions = [{**n, "session_key": str(i), "title": f"T{i}"} for i, n in enumerate(names)]
        facts = self.fetch(sessions=sessions, count="5")
        self.assertEqual(
            [s.get("who", "") for s in facts["sessions"]], ["Robin", "r", "rb", "", ""]
        )
        # a stream with no name is shown by its title alone, and one with neither is counted
        facts = self.fetch(
            sessions=[
                {"session_key": "1", "title": "Harbour of Glass"},
                {"session_key": "2", "user": "Sam"},
                {"session_key": "3"},
            ]
        )
        self.assertEqual(facts["sessions"], [{"title": "Harbour of Glass"}, {"who": "Sam"}])
        self.assertEqual(facts["count"], 3)

    def test_names_and_titles_are_cleaned_and_a_name_is_cut_at_sixteen(self):
        facts = self.fetch(
            sessions=[
                {
                    "session_key": "1",
                    "friendly_name": "The Whole\x00 Family\nDownstairs",
                    "title": "Harbour\u202e of\tGlass\r\n",
                },
            ],
            count="1",
        )
        self.assertEqual(
            facts["sessions"], [{"who": "The Whole Famil…", "title": "Harbour of Glass"}]
        )
        long = self.fetch(sessions=[{"title": "A Very Long Title " * 6}], count="1")
        self.assertEqual(len(long["sessions"][0]["title"]), 60)
        self.assertTrue(long["sessions"][0]["title"].endswith("…"))

    def test_titles_reads_no_names(self):
        facts = self.fetch("titles")
        self.assertEqual(
            facts,
            {
                "count": 3,
                "titles": ["The Saltmarsh Bells S01E03", "Harbour of Glass", "Fen Owls - Reedsong"],
                "sessions": [
                    {"title": "The Saltmarsh Bells S01E03"},
                    {"title": "Harbour of Glass"},
                    {"title": "Fen Owls - Reedsong"},
                ],
            },
        )
        written = json.dumps(facts)
        for name in ("Robin", "Sam", "sam", "alex"):
            self.assertNotIn(name, written)

    def test_at_most_thirty_two_sessions_are_listed(self):
        many = [{"session_key": str(i), "title": f"Title {i}"} for i in range(40)]
        facts = self.fetch(sessions=many, count="40")
        self.assertEqual(facts["count"], 40)
        self.assertEqual(len(facts["sessions"]), 32)
        self.assertEqual(facts["sessions"][-1], {"title": "Title 31"})

    def test_count_reads_no_names_and_no_titles(self):
        facts = self.fetch("count")
        self.assertEqual(facts, {"count": 3})

    def test_nothing_else_of_a_stream_is_kept(self):
        written = json.dumps(self.fetch())
        for detail in ("transcode", "Lounge", "session_key", "12"):
            self.assertNotIn(detail, written)

    def test_the_line_of_a_stream(self):
        robin = {"who": "Robin", "title": "The Saltmarsh Bells S01E03"}
        self.assertEqual(line(robin, 1, 3), "Robin · The Saltmarsh Bells S01E03 · 1 of 3")
        self.assertEqual(line(robin, 1, 1), "Robin · The Saltmarsh Bells S01E03")
        self.assertEqual(line({"title": "Harbour of Glass"}, 2, 3), "Harbour of Glass · 2 of 3")
        self.assertEqual(line({"who": "Sam"}, 2, 2), "Sam · 2 of 2")
        self.assertEqual(line({"title": "Harbour of Glass"}, 1, 1), "Harbour of Glass")

    def test_the_title_gives_way_and_the_name_and_count_survive(self):
        title = "An Extraordinarily Long Film Title: The Sequel to the Sequel"
        cut = line({"who": "Robin", "title": title}, 2, 3)
        self.assertEqual(cut, "Robin · An Extraordinarily Long Film Title: The Se… · 2 of 3")
        self.assertEqual(len(cut), 60)
        cut = line({"who": "A Name Far Too Long", "title": title}, 12, 12)
        self.assertTrue(cut.startswith("A Name Far Too… · An Extraordinarily"))
        self.assertTrue(cut.endswith("… · 12 of 12"))
        self.assertEqual(len(cut), 60)
        alone = line({"title": title + " and More"}, 1, 1)
        self.assertEqual(len(alone), 60)
        self.assertTrue(alone.endswith("…"))

    def test_shown_holds_back_what_the_setting_does_not_let_out(self):
        facts = {
            "count": 2,
            "titles": ["Harbour of Glass"],
            "sessions": [{"who": "Sam", "title": "Harbour of Glass"}, {"who": "Robin"}],
        }
        self.assertEqual(shown(facts, "names"), facts)
        self.assertEqual(
            shown(facts, "titles"),
            {
                "count": 2,
                "titles": ["Harbour of Glass"],
                "sessions": [{"title": "Harbour of Glass"}],
            },
        )
        self.assertEqual(shown(facts, "count"), {"count": 2})
        self.assertIsNone(shown(None, "names"))

    def test_bad_key_is_an_auth_error(self):
        reply = {"response": {"result": "error", "message": "Invalid apikey", "data": {}}}
        self.http.routes["/api/v2"] = (200, reply)
        s = source("streams", {"url": self.http.url})
        with self.assertRaises(AuthError):
            s.fetch(T0)


class FirstSeenTest(unittest.TestCase):
    """The streams kind's order for a provider whose service gives no start order: the order in
    which the running collector first saw each stream's key."""

    def setUp(self):
        self.kind = kind_class("streams")()
        self.config = make_config({})

    def read(self, *keys, show="titles"):
        sessions = [{"key": k, "title": f"Title {k}"} for k in keys]
        fill = check_fill(self.kind.FILL, {"sessions": sessions}, self.kind.allowed({"show": show}))
        facts = self.kind.reading(fill, {"show": show}, self.config, T0).facts
        return [t.removeprefix("Title ") for t in facts.get("titles", [])]

    def test_a_new_stream_joins_the_end_and_the_others_keep_their_places(self):
        self.assertEqual(self.read("b", "a"), ["a", "b"])  # seen together: by key
        self.assertEqual(self.read("c", "b", "a"), ["a", "b", "c"])
        self.assertEqual(self.read("a", "c", "b"), ["a", "b", "c"])  # the service's order moved
        self.assertEqual(self.read("d", "c", "b"), ["b", "c", "d"])  # a ended, d started
        # A stream that comes back is a new one.
        self.assertEqual(self.read("a", "b", "c", "d"), ["b", "c", "d", "a"])

    def test_keys_seen_together_go_by_number_then_by_text(self):
        self.assertEqual(self.read("x", "10", "9", "a"), ["9", "10", "a", "x"])

    def test_only_the_keys_playing_are_kept(self):
        self.read(*[str(i) for i in range(40)])
        self.read("7", "new")
        self.assertEqual(sorted(self.kind._seen), ["7", "new"])
        self.read()
        self.assertEqual(self.kind._seen, {})

    def test_count_reads_no_key_and_leaves_the_order_alone(self):
        self.read("b")
        fill = check_fill(
            self.kind.FILL, {"sessions": [{}, {}]}, self.kind.allowed({"show": "count"})
        )
        self.assertEqual(
            self.kind.reading(fill, {"show": "count"}, self.config, T0).facts, {"count": 2}
        )
        self.assertEqual(self.kind._seen, {"b": 1})
        with self.assertRaises(SourceError):
            check_fill(
                self.kind.FILL, {"sessions": [{"key": "b"}]}, self.kind.allowed({"show": "count"})
            )

    def test_a_start_order_comes_first_then_first_sight_then_the_rest(self):
        sessions = [
            {"title": "neither"},
            {"key": "k2", "title": "keyed later"},
            {"order": "30", "key": "z", "title": "thirty"},
            {"key": "k1", "title": "keyed"},
            {"order": "4", "title": "four"},
            {"order": "x", "title": "an order not of digits"},
        ]
        fill = {"sessions": sessions}
        facts = self.kind.reading(fill, {"show": "titles"}, self.config, T0).facts
        self.assertEqual(
            facts["titles"],
            ["four", "thirty", "keyed", "keyed later", "neither", "an order not of digits"],
        )

    def test_a_start_time_orders_by_its_moment_ties_by_the_key(self):
        def started(minute, second=0):
            return dt.datetime(2026, 11, 21, 19, minute, second, tzinfo=dt.UTC)

        sessions = [
            {"key": "k9", "title": "keyed"},
            {"order": started(30), "key": "b", "title": "half past, b"},
            {"order": started(5), "key": "z", "title": "five past"},
            {"order": started(30), "key": "a", "title": "half past, a"},
            {"order": started(30), "title": "half past, no key"},
            {"title": "neither"},
        ]
        facts = self.kind.reading({"sessions": sessions}, {"show": "titles"}, self.config, T0).facts
        self.assertEqual(
            facts["titles"],
            ["five past", "half past, a", "half past, b", "half past, no key", "keyed", "neither"],
        )
        # The order a time gives holds from read to read, whatever order the service lists in.
        again = self.kind.reading(
            {"sessions": list(reversed(sessions))}, {"show": "titles"}, self.config, T0
        ).facts
        self.assertEqual(again["titles"], facts["titles"])

    def test_the_key_and_its_order_never_leave_the_kind(self):
        sessions = [{"key": "secret-key-1", "title": "A", "who": "Robin"}]
        reading = self.kind.reading({"sessions": sessions}, {"show": "names"}, self.config, T0)
        self.assertNotIn("secret-key-1", json.dumps([reading.facts, reading.data]))
        memory = {}
        self.assertEqual(self.kind.observe(reading, memory, {"show": "names"}, self.config, T0), [])
        self.assertEqual(memory, {})

    def test_a_kind_of_its_own_for_each_source(self):
        self.read("a")
        other = kind_class("streams")()
        self.assertEqual(other._seen, {})


class PlexTest(unittest.TestCase):
    """The streams kind through the plex provider, against an invented Plex Media Server."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        item = {
            "type": "movie",
            "sessionKey": "19",
            "title": "Harbour of Glass",
            "User": {"title": "Sam"},
        }
        episode = {
            "type": "episode", "sessionKey": "21", "grandparentTitle": "The Saltmarsh Bells",
            "parentIndex": 1, "index": 3, "title": "The Tide Bell", "User": {"title": "Robin"},
        }  # fmt: skip
        self.reply = {"MediaContainer": {"size": 2, "Metadata": [episode, item]}}
        self.http.routes["/status/sessions"] = (200, lambda _h: self.reply)

    def fetch(self, show="names"):
        settings = {"url": self.http.url, "from": "plex", "show": show}
        return source("streams", settings).fetch(T0).facts

    def test_streams_in_the_order_they_started_at_each_show(self):
        self.assertEqual(
            self.fetch(),
            {
                "count": 2,
                "titles": ["Harbour of Glass", "The Saltmarsh Bells S01E03"],
                "sessions": [
                    {"who": "Sam", "title": "Harbour of Glass"},
                    {"who": "Robin", "title": "The Saltmarsh Bells S01E03"},
                ],
            },
        )
        titles = self.fetch("titles")
        self.assertEqual(titles["titles"], ["Harbour of Glass", "The Saltmarsh Bells S01E03"])
        for name in ("Sam", "Robin"):
            self.assertNotIn(name, json.dumps(titles))
        self.assertEqual(self.fetch("count"), {"count": 2})

    def test_the_token_goes_in_its_header_with_json_asked_for(self):
        self.fetch()
        ((path, headers),) = self.http.requests
        headers = {k.lower(): v for k, v in headers.items()}
        self.assertEqual(path, "/status/sessions")
        self.assertEqual(headers["x-plex-token"], "plex-example")
        self.assertEqual(headers["accept"], "application/json")
        self.assertEqual(headers["x-plex-client-identifier"], "knightwatcher")

    def test_nothing_playing(self):
        self.reply = {"MediaContainer": {"size": 0}}
        self.assertEqual(self.fetch(), {"count": 0, "titles": []})

    def test_a_refused_token_is_an_auth_error(self):
        page = b"<html><head><title>Unauthorized</title></head></html>"
        self.http.routes["/status/sessions"] = (401, page)
        with self.assertRaises(AuthError) as cm:
            source("streams", {"url": self.http.url, "from": "plex"}).fetch(T0)
        self.assertEqual(str(cm.exception), "Plex token refused")


class TracearrTest(unittest.TestCase):
    """The streams kind through the tracearr provider, against an invented Tracearr."""

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        film = {
            "id": "00000000-0000-4000-8000-000000006100", "media_type": "movie",
            "media_title": "Harbour of Glass", "username": "Sam",
            "started_at": "2026-11-21T18:41:30.000Z",
        }  # fmt: skip
        episode = {
            "id": "00000000-0000-4000-8000-000000005003", "media_type": "episode",
            "media_title": "The Tide Bell", "show_title": "The Saltmarsh Bells",
            "season_number": 1, "episode_number": 3, "username": "Robin",
            "started_at": "2026-11-21T19:05:12.000Z",
        }  # fmt: skip
        self.film, self.episode = film, episode
        self.reply = {"data": [episode, film], "summary": {"total": 2}}
        self.http.routes["/api/v2/public/streams"] = (200, lambda _h: self.reply)

    def fetch(self, show="names"):
        # A source afresh each time, as after a restart: the order is the start times', never the
        # order of first sight, which by the ids would put the episode first.
        settings = {"url": self.http.url, "from": "tracearr", "show": show}
        return source("streams", settings).fetch(T0).facts

    def test_streams_in_the_order_they_started_at_each_show(self):
        both = ["Harbour of Glass", "The Saltmarsh Bells S01E03"]
        self.assertEqual(
            self.fetch(),
            {
                "count": 2,
                "titles": both,
                "sessions": [
                    {"who": "Sam", "title": "Harbour of Glass"},
                    {"who": "Robin", "title": "The Saltmarsh Bells S01E03"},
                ],
            },
        )
        # Tracearr lists its streams in no particular order; the start times keep them in place.
        self.reply = {"data": [self.film, self.episode], "summary": {"total": 2}}
        self.assertEqual(self.fetch()["titles"], both)
        titles = self.fetch("titles")
        self.assertEqual(titles["titles"], both)
        for name in ("Sam", "Robin"):
            self.assertNotIn(name, json.dumps(titles))
        self.assertEqual(self.fetch("count"), {"count": 2})

    def test_the_key_goes_in_the_authorization_header_with_json_asked_for(self):
        self.fetch()
        ((path, headers),) = self.http.requests
        headers = {k.lower(): v for k, v in headers.items()}
        self.assertEqual(path, "/api/v2/public/streams")
        self.assertEqual(headers["authorization"], "Bearer trr_pub_example")
        self.assertEqual(headers["accept"], "application/json")

    def test_nothing_playing(self):
        self.reply = {"data": [], "summary": {"total": 0}}
        self.assertEqual(self.fetch(), {"count": 0, "titles": []})

    def test_a_refused_key_is_an_auth_error(self):
        body = {"statusCode": 401, "error": "UnauthorizedError", "message": "Invalid API key"}
        self.http.routes["/api/v2/public/streams"] = (401, body)
        with self.assertRaises(AuthError) as cm:
            source("streams", {"url": self.http.url, "from": "tracearr"}).fetch(T0)
        self.assertEqual(str(cm.exception), "API key refused")


class JellyfinTest(unittest.TestCase):
    """The streams kind through the jellyfin provider, against an invented Jellyfin."""

    FILM: ClassVar[dict] = {
        "Id": "3c8a1f6e0d2b4c7a9e5f1b8d4a6c2e07", "UserName": "Sam",
        "NowPlayingItem": {"Type": "Movie", "Name": "Harbour of Glass"},
    }  # fmt: skip
    EPISODE: ClassVar[dict] = {
        "Id": "7b3e5d2a9c4f4e8b8a1d6c0f2e9b5a13", "UserName": "Robin",
        "NowPlayingItem": {
            "Type": "Episode", "Name": "The Tide Bell", "SeriesName": "The Saltmarsh Bells",
            "ParentIndexNumber": 1, "IndexNumber": 3,
        },
    }  # fmt: skip
    TRACK: ClassVar[dict] = {
        "Id": "0f2a9c4e6b8d4a1c9e3f5b7d1a2c4e68", "UserName": "alex",
        "NowPlayingItem": {
            "Type": "Audio", "Name": "Reedsong", "AlbumArtist": "Fen Owls",
            "Artists": ["Fen Owls"],
        },
    }  # fmt: skip
    # A session with nothing playing, which Jellyfin lists among the others.
    IDLE: ClassVar[dict] = {
        "Id": "e9d1c3b5a7f94e2d8c6b0a4f2e8d6c19", "UserName": "Sam", "Client": "Jellyfin Web",
    }  # fmt: skip

    def setUp(self):
        self.http = FakeHttp()
        self.addCleanup(self.http.close)
        self.reply = [self.EPISODE, self.IDLE, self.FILM]
        self.http.routes["/Sessions"] = (200, lambda _h: self.reply)

    def make(self, show="names"):
        return source("streams", {"url": self.http.url, "from": "jellyfin", "show": show})

    def test_streams_in_the_order_first_seen_at_each_show(self):
        streams = self.make()
        # Seen at the same read, the two are ordered by their ids; the idle session is no stream.
        self.assertEqual(
            streams.fetch(T0).facts,
            {
                "count": 2,
                "titles": ["Harbour of Glass", "The Saltmarsh Bells S01E03"],
                "sessions": [
                    {"who": "Sam", "title": "Harbour of Glass"},
                    {"who": "Robin", "title": "The Saltmarsh Bells S01E03"},
                ],
            },
        )
        # Jellyfin lists by last activity, which moves at every report of progress, and a new
        # stream joins the end though its id comes first.
        self.reply = [self.TRACK, self.FILM, self.IDLE, self.EPISODE]
        both = ["Harbour of Glass", "The Saltmarsh Bells S01E03", "Fen Owls - Reedsong"]
        self.assertEqual(streams.fetch(T0).facts["titles"], both)
        self.reply = [self.EPISODE, self.TRACK, self.FILM]
        self.assertEqual(streams.fetch(T0).facts["titles"], both)
        # A stream that ends leaves the others in their places.
        self.reply = [self.TRACK, self.FILM]
        self.assertEqual(
            streams.fetch(T0).facts["titles"], ["Harbour of Glass", "Fen Owls - Reedsong"]
        )
        # A source made afresh, as a change of show makes it, starts its order afresh.
        self.reply = [self.EPISODE, self.IDLE, self.FILM]
        titles = self.make("titles").fetch(T0).facts
        self.assertEqual(titles["titles"], ["Harbour of Glass", "The Saltmarsh Bells S01E03"])
        for name in ("Sam", "Robin"):
            self.assertNotIn(name, json.dumps(titles))
        self.assertEqual(self.make("count").fetch(T0).facts, {"count": 2})

    def test_the_key_goes_in_the_authorization_header_with_json_asked_for(self):
        self.make().fetch(T0)
        ((path, headers),) = self.http.requests
        headers = {k.lower(): v for k, v in headers.items()}
        self.assertEqual(path, "/Sessions")
        self.assertEqual(headers["authorization"], 'MediaBrowser Token="jf-example"')
        self.assertEqual(headers["accept"], "application/json")

    def test_nothing_playing(self):
        self.reply = [self.IDLE, {**self.FILM, "NowPlayingItem": None}]
        self.assertEqual(self.make().fetch(T0).facts, {"count": 0, "titles": []})
        self.reply = []
        self.assertEqual(self.make().fetch(T0).facts, {"count": 0, "titles": []})

    def test_a_refused_key_is_an_auth_error(self):
        self.http.routes["/Sessions"] = (401, None)
        with self.assertRaises(AuthError) as cm:
            self.make().fetch(T0)
        self.assertEqual(str(cm.exception), "API key refused")


# A provider file of a user's own for the security kind, against an invented service.
MYBANS = """
format = 1
id = "mybans"
kind = "security"
name = "My bans"

[credentials]
token = "The service's token."

[[request]]
path = "/bans"
headers = { "X-Token" = "{credential.token}" }

[fill.bans]
each = "$.bans[*]"
vars = { ip = "$.ip", jail = "$.jail", at = { path = "$.at", type = "time" } }
fields = { ip = "ip", jail = "jail", at = "at" }
"""


def ban(ip, seconds, jail="sshd", **extra):
    """A ban as a provider lists it, made `seconds` after T0 (before it when negative)."""
    return {"ip": ip, "jail": jail, "at": at(seconds), **extra}


class SecurityTest(unittest.TestCase):
    """The security kind from fills: the counts, the attack's inputs, new bans and the memory."""

    def setUp(self):
        self.kind = kind_class("security")()
        self.config = make_config(
            {"conditions": {"attack": {"window_s": 600, "jails": ["sshd"], "bans": 5}}}
        )

    def read(self, bans, now=T0, **fill):
        fill = check_fill(self.kind.FILL, {"bans": bans, **fill}, self.kind.allowed({}))
        return self.kind.reading(fill, {}, self.config, now)

    def observe(self, bans, memory, now=T0):
        r = self.read(bans, now)
        return r, self.kind.observe(r, memory, {}, self.config, now)

    def test_counts_from_the_list_itself(self):
        r = self.read([
            ban("203.0.113.5", -86_401, jail="recidive"),  # a day and a second ago
            ban("203.0.113.6", -86_400, jail="recidive"),  # a day ago, counted
            ban("198.51.100.9", -601, jail="nginx-botsearch"),
            ban("198.51.100.10", -600, jail="nginx-botsearch"),
            ban("198.51.100.11", -30, jail="nginx-botsearch"),
        ])  # fmt: skip
        self.assertEqual(r.facts, {"bans_24h": 4, "attack": False})
        self.assertEqual(r.data["bans_24h"], 4)
        self.assertEqual(r.data["bans_in_window"], 2)
        self.assertFalse(r.data["jail_ban"])
        self.assertEqual(
            r.data["last_ban"], {"ip": "198.51.100.11", "jail": "nginx-botsearch", "time": at(-30)}
        )

    def test_a_watched_jail_in_the_window_names_the_last_ban_even_when_not_the_newest(self):
        r = self.read([ban("203.0.113.77", -300), ban("198.51.100.9", -10, jail="nginx")])
        self.assertTrue(r.data["jail_ban"])
        self.assertEqual(r.data["last_ban"]["ip"], "203.0.113.77")
        self.assertEqual(r.data["bans_in_window"], 2)
        # Out of the window, the watched jail no longer counts.
        r = self.read([ban("203.0.113.77", -700), ban("198.51.100.9", -10, jail="nginx")])
        self.assertFalse(r.data["jail_ban"])
        self.assertEqual(r.data["last_ban"]["ip"], "198.51.100.9")

    def test_no_bans(self):
        r = self.read([])
        self.assertEqual(r.facts, {"bans_24h": 0, "attack": False})
        self.assertEqual(r.data["last_ban"], {"ip": "", "jail": "", "time": None})
        self.assertEqual((r.data["bans_in_window"], r.data["jail_ban"]), (0, False))

    def test_the_newest_is_the_latest_time_then_the_last_listed(self):
        r = self.read([ban("192.0.2.1", -5), ban("192.0.2.2", -5), ban("192.0.2.3", -9)])
        self.assertEqual(r.data["last_ban"]["ip"], "192.0.2.2")

    def test_first_sight_adopts_every_ban_and_raises_nothing(self):
        memory = {}
        _, events = self.observe([ban("192.0.2.1", -60), ban("192.0.2.2", -30)], memory)
        self.assertEqual(events, [])
        self.assertEqual(
            memory["seen"],
            ["sshd|192.0.2.1|2026-01-15T20:59:00Z", "sshd|192.0.2.2|2026-01-15T20:59:30Z"],
        )
        _, events = self.observe([ban("192.0.2.1", -60), ban("192.0.2.2", -30)], memory, at(30))
        self.assertEqual(events, [])

    def test_one_event_per_read_names_the_newest_new_ban_and_counts_them_all(self):
        memory = {}
        self.observe([ban("192.0.2.1", -60)], memory)
        bans = [
            ban("192.0.2.1", -60),
            ban("198.51.100.9", 10, jail="nginx-botsearch"),
            # Written after the one above, with an older time, as fail2ban can.
            ban("203.0.113.77", 5),
            ban("198.51.100.20", 20, jail=""),
        ]
        _, events = self.observe(bans, memory, at(30))
        self.assertEqual(
            events,
            [{"type": "ip_banned", "count": 3, "text": "BANNED 198.51.100.20",
              "parts": {"addr": "198.51.100.20"}}],
        )  # fmt: skip
        _, events = self.observe(bans, memory, at(60))
        self.assertEqual(events, [])
        _, events = self.observe([*bans, ban("203.0.113.78", 50)], memory, at(90))
        self.assertEqual(
            events,
            [{"type": "ip_banned", "count": 1, "text": "BANNED 203.0.113.78 · sshd",
              "parts": {"addr": "203.0.113.78", "jail": "sshd"}}],
        )  # fmt: skip

    def test_a_ban_that_arrives_and_is_lifted_between_reads_is_not_raised_but_one_after_is(self):
        memory = {}
        self.observe([ban("192.0.2.1", -60)], memory)
        # Unbanned: fail2ban deletes the row, so the ban leaves the count.
        r, events = self.observe([], memory, at(30))
        self.assertEqual((events, r.facts["bans_24h"]), ([], 0))
        self.assertEqual(memory["seen"], [])
        # The same address banned again is a new ban.
        _, events = self.observe([ban("192.0.2.1", 40)], memory, at(60))
        self.assertEqual(events[0]["count"], 1)

    def test_a_restart_raises_nothing_twice(self):
        memory = {}
        self.observe([ban("192.0.2.1", -60)], memory)
        self.observe([ban("192.0.2.1", -60), ban("192.0.2.2", 10)], memory, at(30))
        saved = json.loads(json.dumps(memory))
        # A new kind instance, as after a restart, with the memory file's copy.
        self.kind = kind_class("security")()
        _, events = self.observe([ban("192.0.2.1", -60), ban("192.0.2.2", 10)], saved, at(60))
        self.assertEqual(events, [])

    def test_a_key_of_the_provider_names_the_ban(self):
        memory = {}
        self.observe([ban("192.0.2.1", -60, key="a")], memory)
        self.assertEqual(memory["seen"], ["a"])
        _, events = self.observe([ban("192.0.2.1", -60, key="b")], memory, at(30))
        self.assertEqual(events[0]["parts"], {"addr": "192.0.2.1", "jail": "sshd"})

    def test_the_memory_keeps_the_newest_keys_and_a_floor_beneath_them(self):
        from collector.kinds import security

        memory = {}
        many = [
            ban(f"10.0.{i // 250}.{i % 250}", -80_000 + i) for i in range(security.MAX_SEEN + 5)
        ]
        self.observe(many, memory)
        self.assertEqual(len(memory["seen"]), security.MAX_SEEN)
        self.assertEqual(memory["seen"][0], "sshd|10.0.0.5|2026-01-14T22:46:45Z")
        self.assertEqual(memory["floor"], "2026-01-14T22:46:45Z")
        # The keys forgotten are no newer than the floor, so they are not raised again.
        _, events = self.observe(many, memory, at(30))
        self.assertEqual(events, [])
        _, events = self.observe([*many, ban("192.0.2.9", 20)], memory, at(60))
        self.assertEqual(events[0]["count"], 1)
        # Once the list fits again, the floor goes.
        self.observe(many[:10], memory, at(90))
        self.assertNotIn("floor", memory)

    def test_names_are_cleaned(self):
        r = self.read([ban("192.0.2.1\n", -5, jail="ssh\u202ed ")])
        self.assertEqual(r.data["last_ban"]["ip"], "192.0.2.1")
        self.assertEqual(r.data["last_ban"]["jail"], "ssh d")

    def test_how_far_back_a_cut_list_reaches_is_kept(self):
        r = self.read([ban("192.0.2.1", -5)], complete_s=3600)
        self.assertEqual(r.data["complete_s"], 3600)

    def test_what_a_fill_may_not_be(self):
        for bad, said in [
            ({}, "provider gave no bans"),
            ({"bans": [{"jail": "sshd", "at": T0}]}, "provider gave no bans[0].ip"),
            ({"bans": [{"ip": "192.0.2.1", "at": "2026-01-15"}]}, "bans[0].at as text"),
            (
                {"bans": [{"ip": "192.0.2.1", "at": T0.replace(tzinfo=None)}]},
                "bans[0].at as a time",
            ),
            ({"bans": [], "complete_s": -1}, "complete_s below 0"),
            ({"bans": [{"ip": "192.0.2.1", "at": T0}] * 5001}, "more than 5000 bans"),
        ]:
            with self.assertRaises(SourceError) as cm:
                check_fill(self.kind.FILL, bad, self.kind.allowed({}))
            self.assertIn(said, str(cm.exception))

    def test_a_provider_file_of_the_users_own_fills_it(self):
        import tomllib

        from collector.providers import format as fmt
        from collector.providers.engine import DataProvider

        spec = fmt.check(tomllib.loads(MYBANS), "mybans.toml", "mybans")
        http = FakeHttp()
        self.addCleanup(http.close)
        http.routes["/bans"] = (200, {"bans": [
            {"ip": "192.0.2.1", "jail": "sshd", "at": "2026-01-15T20:59:00Z"},
            {"ip": "192.0.2.2", "at": int(at(-10).timestamp())},
            {"jail": "sshd", "at": "2026-01-15T20:59:00Z"},
        ]})  # fmt: skip
        allowed = self.kind.allowed({})
        provider = DataProvider(spec, {"url": http.url}, {"token": "t"}, 2.0, allowed)
        fill = check_fill(self.kind.FILL, provider.read(T0), allowed)
        self.assertEqual(
            fill,
            {"bans": [{"ip": "192.0.2.1", "jail": "sshd", "at": at(-60)},
                      {"ip": "192.0.2.2", "at": at(-10)}]},
        )  # fmt: skip
        r = self.kind.reading(fill, {}, self.config, T0)
        self.assertEqual((r.data["bans_in_window"], r.data["jail_ban"]), (2, True))

    def test_the_window_follows_the_conditions(self):
        from collector.kinds import security

        self.assertEqual(security.span(self.config), dt.timedelta(days=1))
        longer = make_config({"conditions": {"attack": {"window_s": 172_800}}})
        self.assertEqual(security.span(longer), dt.timedelta(days=2))


class FillTest(unittest.TestCase):
    """check_fill holds a provider's fill to its kind's declaration."""

    def check(self, kind, fill, allowed=None):
        k = kind_class(kind)()
        return check_fill(
            k.FILL, fill, allowed if allowed is not None else k.allowed({"show": "names"})
        )

    def refused(self, kind, fill, message, allowed=None):
        with self.assertRaises(SourceError) as cm:
            self.check(kind, fill, allowed)
        self.assertEqual(str(cm.exception), message)

    def test_a_fill_that_fits(self):
        fill = {"count": 2, "sessions": [{"title": "A", "who": "Robin", "order": "3"}, {}]}
        self.assertIs(self.check("streams", fill), fill)
        self.check("adblock", {"blocked": 3, "window": {"unit_s": 3600, "current": True}})
        self.check("imports", {"records": [{"id": 3, "title": "A"}, {"id": 4}]})

    def test_what_is_refused(self):
        self.refused("streams", [], "provider gave its fill as a list")
        self.refused("streams", {"count": 1}, "provider gave no sessions")
        self.refused(
            "streams",
            {"sessions": [], "rate": 1},
            "provider gave rate, which its kind does not have",
        )
        self.refused(
            "streams",
            {"sessions": [{"title": 5}]},
            "provider gave sessions[0].title as a whole number",
        )
        self.refused("streams", {"count": -1, "sessions": []}, "provider gave count below 0")
        self.refused(
            "streams", {"count": True, "sessions": []}, "provider gave count as true or false"
        )
        self.refused("streams", {"sessions": ["x"]}, "provider gave sessions[0] as text")
        self.refused("adblock", {"blocked": 1.5}, "provider gave blocked as a number")
        self.refused(
            "adblock", {"blocked": 1, "window": {"unit_s": 3600}}, "provider gave no window.current"
        )
        self.refused(
            "adblock",
            {"blocked": 1, "window": {"unit_s": 60, "current": True, "queries": [1, "2"]}},
            "provider gave window.queries[1] as text",
        )
        self.refused("imports", {"records": [{"id": 1}] * 51}, "provider gave more than 50 records")
        self.refused("imports", {"records": [{"title": "A"}]}, "provider gave no records[0].id")

    def test_a_field_show_holds_back_fails_the_read(self):
        k = kind_class("streams")()
        fill = {"sessions": [{"title": "A", "who": "Robin"}]}
        with self.assertRaises(SourceError) as cm:
            check_fill(k.FILL, fill, k.allowed({"show": "titles"}))
        self.assertEqual(
            str(cm.exception), "provider gave sessions[0].who, which show does not let it read"
        )
        with self.assertRaises(SourceError):
            check_fill(k.FILL, {"sessions": [{"title": "A"}]}, k.allowed({"show": "count"}))

    def test_what_show_lets_the_engine_read(self):
        k = kind_class("streams")()
        self.assertEqual(
            k.allowed({"show": "names"}),
            {
                "count",
                "sessions",
                "sessions.title",
                "sessions.who",
                "sessions.order",
                "sessions.key",
            },
        )
        self.assertEqual(
            k.allowed({"show": "titles"}),
            {"count", "sessions", "sessions.title", "sessions.order", "sessions.key"},
        )
        self.assertEqual(k.allowed({"show": "count"}), {"count", "sessions"})

    def test_sections_and_their_providers(self):
        self.assertEqual(
            SECTIONS,
            {
                "streams": "streams",
                "adblock": "adblock",
                "security": "security",
                "sonarr": "imports",
                "radarr": "imports",
                "lidarr": "imports",
            },
        )
        self.assertEqual(LISTS, {"imports": "imports", "usage": "usage", "json": "check"})
        self.assertEqual(provider_of("streams", {"from": "tautulli"}), "tautulli")
        self.assertEqual(provider_of("sonarr", {}), "sonarr")
        self.assertEqual(provider_of("imports:sonarr-4k", {"from": "sonarr"}), "sonarr")
        self.assertEqual(kind_of("lidarr"), "imports")
        self.assertEqual(kind_of("imports:sonarr-4k"), "imports")
        self.assertEqual(kind_of("json:nas"), "check")
        for name in ("host", "device:NAS", "check:nas", "imports", "json"):
            self.assertIsNone(kind_of(name), name)

    def test_a_kind_reads_the_time_it_is_given(self):
        k = kind_class("adblock")()
        config = make_config({"collector": {"timezone": "Europe/Berlin"}})
        fill = {"blocked": 50, "window": {"unit_s": 3600, "current": True, "blocked": [1] * 30}}
        late = k.reading(
            fill, {"fly_every_s": 300.0}, config, T0 + dt.timedelta(hours=1, minutes=59)
        )
        self.assertEqual(late.facts, {"blocked_today": 24})  # 23:59 in Berlin, 24 hours


class SamenessTest(unittest.TestCase):
    def test_a_source_read_through_a_provider_is_the_same_while_its_provider_is(self):
        import dataclasses

        from collector.runner import Runner

        config = make_config({"sources": {"streams": {"url": "http://192.0.2.20"}}}, SECRETS)
        one = KindSource("streams", config.sources["streams"], config)
        two = KindSource("streams", config.sources["streams"], config)
        self.assertTrue(one.identity.startswith("tautulli:"))
        self.assertEqual(Runner._sameness(one, config), Runner._sameness(two, config))
        # A new version of the provider's file starts the source afresh.
        two.spec = dataclasses.replace(two.spec, digest="0" * 20)
        self.assertNotEqual(Runner._sameness(one, config), Runner._sameness(two, config))


if __name__ == "__main__":
    unittest.main()
