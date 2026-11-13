"""Internet reachability: any configured URL answering with a 2xx counts as up."""

from __future__ import annotations

from collector.net import SourceError, fetch
from collector.sources import Reading, Source


class WanSource(Source):
    name = "wan"
    section = "wan"

    def fetch(self, now):
        errors = []
        for url in self.settings["urls"]:
            try:
                fetch(url, self.timeout)
                return Reading({"up": True})
            except SourceError as exc:
                errors.append(str(exc))
        # A failed check is a fact about the internet, not a failure of this source.
        return Reading({"up": False}, {"error": errors[-1] if errors else ""})
