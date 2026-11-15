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
    "security": { "threat_score": 2, "bans_24h": 14, "attack": false },
    "devices": {
      "list": [
        { "name": "Pi", "kind": "pi", "state": "up", "alert": true, "seen": true,
          "since": "2026-01-15T08:02:40Z" },
        { "name": "Vault", "kind": "machine", "state": "up", "alert": true, "seen": true,
          "since": "2026-01-15T08:02:40Z" },
        { "name": "Gate cam", "kind": "camera", "state": "unknown", "alert": true, "seen": false,
          "since": null },
        { "name": "Study laptop", "kind": "machine", "state": "down", "alert": false, "seen": false,
          "since": "2026-01-15T08:02:40Z" }
      ]
    }
  },
  "sources": {
    "containers": { "ok": true, "at": "2026-01-15T21:42:10Z", "error": "" },
    "adblock": { "ok": false, "at": "2026-01-15T21:40:40Z", "error": "401 from the DNS filter" },
    "pi": { "ok": true, "at": "2026-01-15T21:42:01Z", "error": "" },
    "device:Vault": { "ok": true, "at": "2026-01-15T21:42:01Z", "error": "" },
    "device:Gate cam": { "ok": false, "at": "2026-01-15T21:42:01Z",
                        "error": "first read still running" },
    "device:Study laptop": { "ok": true, "at": "2026-01-15T21:42:01Z", "error": "" }
  },
  "defaults": {
    "look": { "skin": "tan", "hair": "auburn", "hair_style": "curls", "monarch": "b",
              "monarch_robe": "teal" },
    "display": { "clock": 12 },
    "quiet": {},
    "scenes": { "cpu_hot": "camp" }
  },
  "config": { "admin": "3f9c0d12ab45e6789a0b", "at": "2026-01-15T21:30:02Z", "problems": [] }
}
```

The same file twelve minutes later, once the NAS and the camera have both been silent for longer
than their `down_after_s`, with the other sections of `facts` and `sources` left out. `devices`
says where the two are in `facts.devices.list`. The laptop, which does not alert, has come back:

```json
{
  "schema": 1,
  "generated_at": "2026-01-15T21:54:10Z",
  "interval_s": 10,
  "conditions": [
    {
      "id": "device_down",
      "level": "warning",
      "since": "2026-01-15T21:42:30Z",
      "headline": "2 DOWN",
      "detail": "Vault, Gate cam",
      "devices": [1, 2]
    }
  ],
  "quiet_line": "ALL QUIET · 29 up · backup 03:12 · 4,812 ads blocked",
  "events": [],
  "facts": {
    "pi": { "up": true },
    "devices": {
      "list": [
        { "name": "Pi", "kind": "pi", "state": "up", "alert": true, "seen": true,
          "since": "2026-01-15T08:02:40Z" },
        { "name": "Vault", "kind": "machine", "state": "down", "alert": true, "seen": true,
          "since": "2026-01-15T21:42:30Z" },
        { "name": "Gate cam", "kind": "camera", "state": "down", "alert": true, "seen": false,
          "since": "2026-01-15T21:43:10Z" },
        { "name": "Study laptop", "kind": "machine", "state": "up", "alert": false, "seen": true,
          "since": "2026-01-15T21:50:40Z" }
      ]
    }
  },
  "sources": {
    "device:Vault": { "ok": true, "at": "2026-01-15T21:54:10Z", "error": "" }
  },
  "defaults": {
    "look": { "skin": "tan", "hair": "auburn", "hair_style": "curls", "monarch": "b",
              "monarch_robe": "teal" },
    "display": { "clock": 12 },
    "quiet": {},
    "scenes": { "cpu_hot": "camp" }
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
    `pi_silent`, `device_down`, `cpu_hot`, `memory_tight`, `ssh_session`, `updating`, `streaming`,
    `night`. The page ignores an id it does not know.
  - `level` is `critical`, `warning`, `work`, `quiet` or `sleep`. It sets the text colour.
  - `since` is when the cause began, as a UTC timestamp. For `cpu_hot` and `memory_tight` that is
    the start of the averaging window at the poll that raised it.
  - `headline` is at most 16 characters, in capitals. `detail` is at most 60 characters.
  - `devices` is on `device_down` alone, and says which devices are down: one or more
    positions in `facts.devices.list`, counted from 0, in the order their silences began. The page
    finds each one as `facts.devices.list[i]`. Where an entry stands in the scene depends on its
    kind and on the entries before it, and an entry with no place left is not drawn; see
    [Devices](./page.md#devices). One `device_down` covers every device that
    alerts and is down, however many there are. While it is held after the last of them has
    answered again, it keeps the positions it last had, and those devices are then `up`.
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
  collector's time zone. `pi.up` says whether the Pi of `[sources.pi]` answered its last check,
  so it turns false at the first check it misses; whether the Pi has been silent long enough to
  count as down is its entry in `devices`.
- **`facts.devices`** lists the devices (see
  [configuration.md](./configuration.md#devices)). It is `null` when there are none, the
  Pi of `[sources.pi]` included, and otherwise an object with one key, `list`: every enabled
  device, 1 to 32 of them, in the order of the configuration, with the Pi of `[sources.pi]` first
  when there is one. Each entry has:
  - `name`, as configured: 1 to 20 printable ASCII characters, unique ignoring case.
  - `kind`: `pi`, `camera`, `machine` or `vm` from this collector. A later collector may write
    another kind, up to 200 characters; a page treats a kind it does not know as a plain device.
  - `state`: `up`, `down` or `unknown`. `down` means silent for at least the device's
    `down_after_s`, and is when its prop changes. `unknown` means the device has not answered
    since the collector started and has not been silent long enough to be down, which includes
    the time before its first check finishes. A device that has answered and has been silent for
    less than its `down_after_s` is still `up`.
  - `alert`: whether the device raises `device_down` (`pi_silent` for the Pi of `[sources.pi]`)
    while it is down.
  - `seen`: whether it has answered since the collector started.
  - `since`: when the present state began, as a UTC timestamp: the answer that made it `up`, the
    start of the silence for `down` (the first check that went unanswered, which is earlier than
    the moment it was judged down), and `null` for `unknown`.

  Nothing about the devices is kept across a restart: each starts `unknown` again.
- **`sources`** says, for each enabled source, whether its last read worked, when it began, and
  why not. Between reads the entry stays as the last read left it, so `at` can be older than
  `generated_at` by the source's own pace (a minute for the backup log), and by longer while a
  slow read is still running or the source is paused after refused credentials. Each device
  has an entry of its own, `device:<name>`, and the Pi of `[sources.pi]` keeps `pi`. A device's
  check that ran but got no answer is `ok: true`, since the check worked; its `ok` is
  false only while its first check is still running (`first read still running`) and when a
  check ran out of time (`timed out`, then `previous read still running` while it hangs on).
- **`defaults`** is the household default for the display's settings screen: what a display
  shows until someone changes a setting on it, and what it goes back to when told to use the
  config default. It comes from the `[look]`, `[display]`, `[quiet]` and `[scenes]` tables of
  `config.toml` (see [configuration.md](./configuration.md#the-settings-screens-defaults)), as the
  collector last read it, and is written unchanged into every file. It always has four
  objects, `look`, `display`, `quiet` and `scenes`, and each holds only the settings the config
  sets, so a table the config leaves out is `{}`. The collector fills in nothing: for a setting
  that is absent the page uses its own default.
  - `look`: `build` and `monarch` are `a`, `b` or `c`; `weapon` is `greatsword` or
    `sword_and_shield`; `skin` and `monarch_skin` are `fair`, `warm`, `golden`, `tan`, `brown`
    or `deep`; `hair` and `monarch_hair` are `black`, `dark`, `brown`, `auburn`, `blonde` or
    `silver`; `hair_style` is `short`, `tied` or `curls`; `tabard` and `monarch_robe` are
    `blue`, `forest`, `violet`, `wine`, `teal` or `sable`; `plume` is `red`, `white`, `gold`,
    `royal`, `green` or `violet`. `monarch_hair` and `monarch_robe` left out mean each monarch
    keeps the colours the court draws them in; there is no value for that.
  - `display`: `headline` is `small`, `medium` or `large`; `clock` is the number `24` or `12`;
    `helmet_indoors` is `true` or `false`.
  - `quiet`: `scenes` is a list of one or more of `battlement`, `camp`, `house` and `yard`, with
    no repeats, in the order they take turns; `minutes` is a whole number from 1 to 240, how long
    each quiet scene shows.
  - `scenes`: the scene a condition plays in, by condition id, such as `{ "cpu_hot": "camp" }`.
    Each key is one of the condition ids above, and each value one of the page's scenes:
    `battlement`, `camp`, `house`, `yard`, `cellar`, `smithy` or `court`. Which scene can act
    which condition is the page's to decide (see [design.md](./design.md#scenes-chosen-per-condition)):
    the collector writes any condition with any of these scenes, and the page ignores a pair it
    cannot act, a condition it offers no choice for (such as `night`) among them.

  This collector writes only the values above. The page ignores a value it does not know and
  uses its own default in its place, so a later collector can offer more. A page from before
  `scenes` leaves that object alone. A file from a collector older than this section has no
  `defaults`, and the page then uses its own defaults throughout; one from a collector older than
  `scenes` has the other three, and the page plays each condition in its own scene.

- **`config`** says which settings the collector is using, for the bundled server's admin page:
  - `admin`: the version of the admin page's `admin.json` laid over `config.toml` (20 hex
    characters), or `null` when none is.
  - `at`: when these settings were taken up, at start or at the poll that took up the last change,
    as a UTC timestamp.
  - `problems`: the problems of the last change the collector looked at, in the words of
    `check-config`, empty when it went in cleanly. A credential the settings need and the
    environment lacks is listed here while the settings are in use, that source failing.
  - `refused`: present only when the last change looked at was not taken up, and then the
    version of `admin.json` that was refused, or `null` when the change was to `config.toml`
    alone; `admin` and `at` still describe the settings in use, and `problems` says why.

  The page ignores `config`. A file from a collector older than the admin page has no `config`.
  [collector.md](./collector.md#taking-up-a-change) says when the collector takes up a change.

## Who decides what

The collector decides whether a condition is true, including how long something must last before
it counts, and writes the words. The page decides which scene and which state of the knight a
condition maps to, and nothing else; `defaults.scenes` only asks it for another scene, and the page
grants that where the scene can act the condition. Thresholds and durations are the collector's
configuration.
