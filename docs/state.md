# The state file

`state.json` is the only thing the collector and the page share. The collector writes it whole,
to a temporary name and then renamed into place, so the page never reads half a file. The page
fetches it every five seconds.

Every value below is invented.

```json
{
  "schema": 1,
  "generated_at": "2026-01-15T21:42:10Z",
  "interval_s": 10,
  "conditions": [
    {
      "id": "container_unhealthy",
      "level": "warning",
      "since": "2026-01-15T21:30:02Z",
      "headline": "RADARR UNWELL",
      "detail": "unhealthy for 12 min · restarted twice"
    }
  ],
  "quiet_line": "ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked",
  "events": [
    { "seq": 4410, "type": "ad_blocked", "at": "2026-01-15T21:42:01Z", "count": 3, "text": "" },
    { "seq": 4411, "type": "ip_banned", "at": "2026-01-15T21:42:07Z", "count": 1,
      "text": "BANNED 203.0.113.77 · 6 probes for /.env" }
  ],
  "facts": {
    "host": { "cpu_pct": 23.0, "load1": 2.9, "cores": 12, "mem_pct": 61.0, "swap_pct": 9.0,
              "disks": [ { "mount": "/data", "pct": 71.0, "free_gb": 640 } ] },
    "containers": { "total": 29, "running": 29, "unhealthy": [], "restarting": [], "failed": [] },
    "wan": { "up": true },
    "dns": { "up": true },
    "backup": { "last_ok": "2026-01-15T03:12:00Z", "age_h": 18.5 },
    "pi": { "up": true },
    "updates": { "running": false, "what": "" },
    "streams": { "count": 1, "titles": ["The Night Shift S02E04"] },
    "ssh": { "count": 0, "sources": [] },
    "adblock": { "blocked_today": 4812 },
    "security": { "threat_score": 2, "bans_24h": 14, "attack": false }
  },
  "sources": {
    "containers": { "ok": true, "at": "2026-01-15T21:42:10Z", "error": "" },
    "adblock": { "ok": false, "at": "2026-01-15T21:40:40Z", "error": "401 from the DNS filter" }
  }
}
```

## Fields

- **`schema`** is `1`. A page that meets a number it does not know shows NO SIGNAL once it has had
  a valid file; see [page.md](./page.md).
- **`generated_at`** and **`interval_s`**: when the file was written and how often it should be,
  the collector's real interval (10 seconds by default). The page treats the file as stale once
  it is older than three intervals, and says so on screen.
  It measures that age against the clock of the device showing the page, so that clock and the
  collector's must agree to well within three intervals. A display whose clock runs far ahead
  shows "no signal" over a healthy collector.
- **`conditions`** lists what is true now, highest priority first. The page acts on the first and
  counts the rest. An empty list means all is quiet.
  - `id` is one of: `attack`, `wan_down`, `container_unhealthy`, `disk_full`, `backup_overdue`,
    `pi_silent`, `cpu_hot`, `memory_tight`, `ssh_session`, `updating`, `streaming`, `night`. The
    page ignores an id it does not know.
  - `level` is `critical`, `warning`, `work`, `quiet` or `sleep`. It sets the text colour.
  - `since` is when the cause began, as a UTC timestamp. For `cpu_hot` and `memory_tight` that is
    the start of the averaging window at the poll that raised it.
  - `headline` is at most 16 characters, in capitals. `detail` is at most 60 characters.
- **`quiet_line`** is shown when `conditions` is empty. At most 52 characters. The collector
  shortens the blocked count to fit (`11.3k ads blocked`, then `11.3k blocked`) before it drops
  a part from the end.
- **`events`** are things that happened, for the page to act out once. `seq` only ever rises, and
  the page remembers the highest it has played. The collector keeps the last 20. `type` is one of
  `ad_blocked`, `ip_banned`, `import`, `backup_done`. `text` is a caption of at most 44
  characters, empty for `ad_blocked`. `count` says how many the event stands for. For
  `ad_blocked` that is a number of flies, not of blocked queries: a fly stands for the blocking
  the household normally sees in a few minutes, and one event carries at most eight unless the
  collector's `fly_every_s` is 0 (see [collector.md](./collector.md#events)).
- **`facts`** are the figures behind the conditions, for a page that wants to show them. Any
  section is `null` when its source is unavailable or not enabled. A source read less often than
  the file is written keeps its section from its last read until the next. `host.cpu_pct` is the
  CPU use averaged over the `cpu_hot` window (30 seconds by default); `host.mem_pct` is the
  latest reading. `adblock.blocked_today` counts the blocked queries since midnight in the
  collector's time zone.
- **`sources`** says, for each enabled source, whether its last read worked, when it began, and
  why not. Between reads the entry stays as the last read left it, so `at` can be older than
  `generated_at` by the source's own pace (a minute for the backup log), and by longer while a
  slow read is still running or the source is paused after refused credentials.

## Who decides what

The collector decides whether a condition is true, including how long something must last before
it counts, and writes the words. The page decides which scene and which state of the knight a
condition maps to, and nothing else. Thresholds and durations are the collector's configuration.
