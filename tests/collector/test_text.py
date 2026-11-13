import datetime as dt
import unittest

from collector import text


class ClipTest(unittest.TestCase):
    def test_short_text_is_unchanged(self):
        self.assertEqual(text.clip("RADARR UNWELL", 16), "RADARR UNWELL")

    def test_long_text_ends_in_an_ellipsis_at_the_limit(self):
        out = text.clip("a" * 70, 60)
        self.assertEqual(len(out), 60)
        self.assertTrue(out.endswith("…"))

    def test_exact_limit_is_not_cut(self):
        self.assertEqual(text.clip("x" * 44, 44), "x" * 44)

    def test_whitespace_is_collapsed(self):
        self.assertEqual(text.clip("two\n  lines", 20), "two lines")

    def test_headline_is_capitals_within_16(self):
        out = text.headline("a container with a very long name")
        self.assertEqual(len(out), 16)
        self.assertEqual(out, out.upper())

    def test_limits_match_the_contract(self):
        self.assertEqual(len(text.detail("d" * 100)), 60)
        self.assertEqual(len(text.event_text("e" * 100)), 44)
        self.assertEqual(
            (text.HEADLINE_MAX, text.DETAIL_MAX, text.QUIET_LINE_MAX, text.EVENT_TEXT_MAX),
            (16, 60, 52, 44),
        )


class JoinFittingTest(unittest.TestCase):
    def test_drops_parts_from_the_end_until_it_fits(self):
        parts = ["ALL QUIET", "29 up", "backup 03:12", "4,812,000,000 ads blocked today"]
        out = text.join_fitting(parts, 52)
        self.assertLessEqual(len(out), 52)
        self.assertEqual(out, "ALL QUIET · 29 up · backup 03:12")

    def test_keeps_everything_that_fits(self):
        out = text.join_fitting(["ALL QUIET", "29 up", "backup 03:12", "4,812 ads blocked"], 52)
        self.assertEqual(out, "ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked")

    def test_clips_a_single_overlong_part(self):
        self.assertEqual(len(text.join_fitting(["x" * 80], 52)), 52)


class FormatTest(unittest.TestCase):
    def test_duration(self):
        self.assertEqual(text.duration(40), "40 s")
        self.assertEqual(text.duration(12 * 60 + 5), "12 min")
        self.assertEqual(text.duration(5 * 3600), "5 h")
        self.assertEqual(text.duration(3 * 86400), "3 d")

    def test_count_and_plural(self):
        self.assertEqual(text.count(4812), "4,812")
        self.assertEqual(text.plural(1, "ban"), "1 ban")
        self.assertEqual(text.plural(3, "ban"), "3 bans")

    def test_iso_round_trip(self):
        t = dt.datetime(2026, 1, 15, 21, 42, 10, 123456, tzinfo=dt.UTC)
        self.assertEqual(text.iso(t), "2026-01-15T21:42:10Z")
        self.assertEqual(text.parse_iso("2026-01-15T21:42:10Z"), t.replace(microsecond=0))

    def test_parse_iso_assumes_utc_for_naive(self):
        self.assertEqual(text.parse_iso("2026-01-15T21:42:10").tzinfo, dt.UTC)


if __name__ == "__main__":
    unittest.main()
