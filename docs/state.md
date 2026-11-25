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
      "text": "BANNED 203.0.113.77 · sshd", "parts": { "addr": "203.0.113.77", "jail": "sshd" } }
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
    "streams": { "count": 1, "titles": ["The Night Shift S02E04"],
                 "sessions": [ { "who": "Robin", "title": "The Night Shift S02E04" } ] },
    "ssh": { "count": 0, "sources": [] },
    "adblock": { "blocked_today": 4812 },
    "security": { "bans_24h": 14, "attack": false },
    "devices": {
      "list": [
        { "name": "Pi", "kind": "pi", "state": "up", "alert": true, "seen": true,
          "since": "2026-01-15T08:02:40Z" },
        { "name": "NAS", "kind": "machine", "state": "up", "alert": true, "seen": true,
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
    "adblock": { "ok": false, "at": "2026-01-15T21:40:40Z", "error": "HTTP 401: credentials refused" },
    "pi": { "ok": true, "at": "2026-01-15T21:42:01Z", "error": "" },
    "device:NAS": { "ok": true, "at": "2026-01-15T21:42:01Z", "error": "" },
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
  "config": { "admin": "3f9c0d12ab45e6789a0b", "at": "2026-01-15T21:30:02Z", "problems": [] },
  "analytics": { "on": true }
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
      "detail": "NAS, Gate cam",
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
        { "name": "NAS", "kind": "machine", "state": "down", "alert": true, "seen": true,
          "since": "2026-01-15T21:42:30Z" },
        { "name": "Gate cam", "kind": "camera", "state": "down", "alert": true, "seen": false,
          "since": "2026-01-15T21:43:10Z" },
        { "name": "Study laptop", "kind": "machine", "state": "up", "alert": false, "seen": true,
          "since": "2026-01-15T21:50:40Z" }
      ]
    }
  },
  "sources": {
    "device:NAS": { "ok": true, "at": "2026-01-15T21:54:10Z", "error": "" }
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

The same file the next evening, all quiet again. `quiet_parts` lists what `quiet_line` is made
of, with the blocked count both written out and short, although the line had room only for the
short one. The events that have a caption carry its parts beside it. Only the sections of `facts`
and `sources` the parts come from are shown:

```json
{
  "schema": 1,
  "generated_at": "2026-01-16T20:15:10Z",
  "interval_s": 10,
  "conditions": [],
  "quiet_line": "ALL QUIET · 29 up · backup 03:12 · 11.3k ads blocked",
  "quiet_parts": [
    { "k": "quiet" },
    { "k": "up", "n": "29" },
    { "k": "backup", "at": "03:12" },
    { "k": "ads", "n": "11,283", "short": "11.3k" }
  ],
  "events": [
    { "seq": 4502, "type": "backup_done", "at": "2026-01-16T03:12:40Z", "count": 1,
      "text": "BACKUP DONE 03:12", "parts": { "at": "03:12" } },
    { "seq": 4503, "type": "import", "at": "2026-01-16T19:02:10Z", "count": 1,
      "text": "IMPORTED · The Night Shift S02E05", "parts": { "title": "The Night Shift S02E05" } },
    { "seq": 4504, "type": "ip_banned", "at": "2026-01-16T20:14:50Z", "count": 1,
      "text": "BANNED 203.0.113.77 · sshd", "parts": { "addr": "203.0.113.77", "jail": "sshd" } },
    { "seq": 4505, "type": "ad_blocked", "at": "2026-01-16T20:15:00Z", "count": 1, "text": "" }
  ],
  "facts": {
    "containers": { "total": 29, "running": 29, "unhealthy": [], "restarting": [], "failed": [] },
    "backup": { "last_ok": "2026-01-16T03:12:00Z", "age_h": 17.1 },
    "adblock": { "blocked_today": 11283 }
  },
  "sources": {
    "containers": { "ok": true, "at": "2026-01-16T20:15:10Z", "error": "" },
    "backup": { "ok": true, "at": "2026-01-16T20:14:40Z", "error": "" },
    "adblock": { "ok": true, "at": "2026-01-16T20:14:50Z", "error": "" }
  },
  "defaults": { "look": {}, "display": {}, "quiet": {}, "scenes": {} }
}
```

A generic check of `[[sources.json]]` that holds, a NAS's disk over 70 degrees, borrowing the
scene of `cpu_hot`. Its entry names the condition it borrows in `as` and has that condition's
level; its source is `json:nas-temp`. Only that source is shown:

```json
{
  "schema": 1,
  "generated_at": "2026-01-16T21:31:10Z",
  "interval_s": 10,
  "conditions": [
    {
      "id": "check:nas-temp",
      "as": "cpu_hot",
      "level": "warning",
      "since": "2026-01-16T21:30:02Z",
      "headline": "NAS HOT",
      "detail": "disk at 71 C"
    }
  ],
  "quiet_line": "ALL QUIET · 29 up · backup 03:12 · 11.3k ads blocked",
  "events": [],
  "facts": {},
  "sources": {
    "json:nas-temp": { "ok": true, "at": "2026-01-16T21:31:02Z", "error": "" }
  },
  "defaults": { "look": {}, "display": {}, "quiet": {}, "scenes": {} }
}
```

This host under strain, short of memory: its average over the window has been at or above 90%
for twelve minutes. The entry lists the machine in `machines`. Only the sections of `facts` and
`sources` it comes from are shown:

```json
{
  "schema": 1,
  "generated_at": "2026-01-16T21:42:10Z",
  "interval_s": 10,
  "conditions": [
    {
      "id": "cpu_hot",
      "level": "warning",
      "since": "2026-01-16T21:30:02Z",
      "headline": "HOST MEMORY 93%",
      "detail": "93% for 12 min · CPU 41% · load 3.1",
      "machines": [
        { "name": "Host", "window_s": 30,
          "memory": { "pct": 93.4, "threshold": 90.0, "since": "2026-01-16T21:30:02Z" } }
      ]
    }
  ],
  "quiet_line": "ALL QUIET · 29 up · backup 03:12 · 11.3k ads blocked",
  "events": [],
  "facts": {
    "host": { "cpu_pct": 41.0, "load1": 3.1, "cores": 12, "mem_pct": 93.0, "swap_pct": 40.0,
              "disks": [ { "mount": "/data", "pct": 71.0, "free_gb": 640 } ] }
  },
  "sources": {
    "host": { "ok": true, "at": "2026-01-16T21:42:10Z", "error": "" }
  },
  "defaults": { "look": {}, "display": {}, "quiet": {}, "scenes": {} }
}
```

## Fields

- **`schema`** is `1`. A page that meets a number it does not know shows NO SIGNAL once it has had
  a valid file; see [page.md](./page.md). Fields added later without changing it, such as
  `quiet_parts`, an event's `parts`, `facts.streams.sessions`, `analytics` and `machines` on
  `cpu_hot`, are optional: a page from before them ignores them, and a
  file from a collector before them lacks them. So are the conditions `check:<name>`, which a
  page from before them skips as ids it does not know.
- **`generated_at`** and **`interval_s`**: when the file was written and how often it should be,
  the collector's real interval (10 seconds by default). The page treats the file as stale once
  it is older than three intervals, and says so on screen.
  It measures that age against the clock of the device showing the page, so that clock and the
  collector's must agree to well within three intervals. A display whose clock runs far ahead
  shows "no signal" over a healthy collector.
- **`conditions`** lists what is true now, highest priority first. The page acts on the first and
  counts the rest. An empty list means all is quiet.
  - `id` is one of: `attack`, `wan_down`, `container_unhealthy`, `disk_full`, `backup_overdue`,
    `pi_silent`, `device_down`, `cpu_hot`, `ssh_session`, `updating`, `streaming`, `night`; or
    `check:<name>` for a generic check of `[[sources.json]]` that holds, `<name>` 1 to 20 of
    `a-z`, `0-9` and `-`, starting with a letter or digit. The page ignores an id it does not know,
    so a page from before the checks shows none of them.
  - `cpu_hot` is Under strain: a watched machine's CPU or memory, averaged over a window, at or
    above its threshold. The id is the one Running hot had, so saved scene choices and checks that
    borrow it carry over; a page from before acts it as Running hot, with the new words and never
    bloated.
  - `memory_tight` (Memory tight) is written by a collector from before Under strain alone. The
    page still knows it, and acts it as Under strain on memory: trained and bloated, in
    `cpu_hot`'s scene, with that collector's words. A check from such a collector with
    `as = "memory_tight"` is acted as `cpu_hot`, never bloated.
  - `as` is on a check alone: the condition it borrows, any of those ids but `device_down`. The
    page acts the check as that condition, in its scene and with its knight, but with the check's
    own words, and never with the facts tied to that condition (the streams, the pie's dish, the
    place a device stands in). A check has the level of the condition it borrows and comes
    straight after it, checks in the order of `config.toml`
    ([configuration.md](./configuration.md#generic-checks)).
  - `level` is `critical`, `warning`, `work`, `quiet` or `sleep`. It sets the text colour.
  - `since` is when the cause began, as a UTC timestamp. For `cpu_hot` it is the earliest `since`
    of its machines' resources, each the start of the averaging window at the poll that raised it.
  - `headline` is at most 16 characters, in capitals. `detail` is at most 60 characters. A
    check's are its own, its `{value}` filled with what it read.
  - `devices` is on `device_down` alone, and says which devices are down: one or more
    positions in `facts.devices.list`, counted from 0, in the order their silences began. The page
    finds each one as `facts.devices.list[i]`. Where an entry stands in the scene depends on its
    kind and on the entries before it, and an entry with no place left is not drawn; see
    [Devices](./page.md#devices). One `device_down` covers every device that
    alerts and is down, however many there are. While it is held after the last of them has
    answered again, it keeps the positions it last had, and those devices are then `up`.
  - `machines` is on `cpu_hot` alone: every machine under strain, 1 to 33, in the order each
    was first raised, a machine strained on both resources once, at the place of the first: the
    collector's host, and the machines the entries of `[[sources.usage]]` list. Each is an object:
    - `name`: what the wall calls the machine, 1 to 20 printable ASCII characters
      (`[sources.host] name` for the host, `Host` by default, and the name an entry of
      `[[sources.usage]]` gives the others), unique ignoring case.
    - `device`: its position in `facts.devices.list` when its name is a device's name, ignoring
      case; left out otherwise. Nothing on the page reads it yet.
    - `window_s`: the seconds its averages cover: `conditions.cpu_hot.window_s`, or its entry's
      own.
    - `cpu` and `memory`: each there only while that resource is under strain, as
      `{ "pct", "threshold", "since" }`: the average over the window to one decimal place (memory
      as percent used), the threshold in force (the machine's own, where it sets one), and when the
      average first crossed it.

    The page bloats the knight while any machine has `memory`. While the condition is held after
    a resource has fallen back, the resource keeps the figure it last had while it counted
    ([collector.md](./collector.md#under-strain)).
  - The `detail` of `streaming` is the first stream in `facts.streams.sessions` as one line,
    `Robin · The Night Shift S02E04 · 1 of 3`, with no `1 of 1` when one stream plays; without
    sessions it is the count, `3 streams`. A page from before the sessions shows it as it is, and
    a newer page takes each stream in turn from the sessions ([display.md](./display.md#modes)).
- **`quiet_line`** is shown when `conditions` is empty. At most 52 characters. The collector
  shortens the blocked count to fit (`11.3k ads blocked`, then `11.3k blocked`) before it drops
  a part from the end.
- **`quiet_parts`** lists the parts `quiet_line` is made of, in its order, for a page that words
  the line in a world's terms. Each part is an object whose `k` says what it is, with its values
  beside it:
  - `{ "k": "quiet" }`, always first: all is quiet.
  - `{ "k": "up", "n": "29" }`: how many containers are running.
  - `{ "k": "backup", "at": "03:12" }`: when the last backup finished, in the collector's time
    zone.
  - `{ "k": "ads", "n": "11,283", "short": "11.3k" }`: the queries blocked today, written out and
    in few characters.

  `k` is one of those four, and each comes at most once, in that order. A part is there whenever
  the collector has the reading behind it (the backup only once a completion is known), whether
  or not `quiet_line` had room for it, so fitting the line is the page's job. Every value is a
  string, formatted by the collector exactly as `quiet_line` has it: the page chooses the words
  and joins them, and does not format a number or a time. A page with no words for a part, or a
  file with no `quiet_parts`, shows `quiet_line`.
- **`events`** are things that happened, for the page to act out once. `seq` only ever rises, and
  the page remembers the highest it has played. The collector keeps the last 20. `type` is one of
  `ad_blocked`, `ip_banned`, `import`, `backup_done`. `text` is a caption of at most 44
  characters, empty for `ad_blocked`. `count` says how many the event stands for. For
  `ad_blocked` that is a number of flies, not of blocked queries: a fly stands for the blocking
  the household normally sees in a few minutes, and one event carries at most eight unless the
  collector's `fly_every_s` is 0 (see [collector.md](./collector.md#events)).
  `parts`, on `ip_banned`, `import` and `backup_done` alone, is an object of the values the
  caption is made of, for a page that words the event in a world's terms:
  - `ip_banned`: `addr`, the address banned, and `jail`, the jail that banned it, when the
    caption names one.
  - `import`: `title`, what was imported, as the caption has it.
  - `backup_done`: `at`, when the backup finished, in the collector's time zone (`03:12`).

  Those are the only names. Each value is a string of 1 to 44 characters, cleaned as `text` is:
  runs of spaces, tabs and line breaks become one space, and a value longer than 44 characters is
  cut to 43 and an ellipsis. A value that is empty once cleaned is left out, and so is `parts`
  when that leaves out `addr`, `title` or `at`. As with `quiet_parts`, the page chooses the words
  and joins the values, and shows `text` when an event has no `parts` or the page has no words
  for its type. `text` is the same whether or not `parts` is there.
- **`facts`** are the figures behind the conditions, for a page that wants to show them. Any
  section is `null` when its source is unavailable or not enabled. A source read less often than
  the file is written keeps its section from its last read until the next. `host.cpu_pct` is the
  CPU use averaged over Under strain's window, `conditions.cpu_hot.window_s` (30 seconds by
  default); `host.mem_pct` is the latest reading of memory used, not the average. `adblock.blocked_today` counts the blocked queries since midnight in the
  collector's time zone. `security.bans_24h` counts the bans of the last 24 hours, and
  `security.attack` says whether the `attack` condition is raised; a ban lifted by hand leaves
  `bans_24h` at the next read ([collector.md](./collector.md#attacks)). `pi.up` says whether the
  Pi of `[sources.pi]` answered its last check, so it turns false at the first check it misses;
  whether the Pi has been silent long enough to count as down is its entry in `devices`.
- **`facts.streams`** says what plays, from the streams provider (Tautulli by default), as far as
  the collector's setting `show` in
  `[sources.streams]` lets it out ([configuration.md](./configuration.md#sourcesstreams)). It is
  for a display guests can see, so what the setting holds back is never in the file, the words of
  `streaming` held through its clearing period included; a change to the setting holds from the
  next file on.
  - `count`, always: how many streams the service reports, or the number of its sessions when it
    gives no count.
  - `titles`, with `show` `names` or `titles`: what each stream plays, sorted as `sessions` is.
    Episodes read `The Night Shift S02E04` and tracks `<artist> - <track>`.
  - `sessions`, with `show` `names` or `titles`, when any stream has a name or a title to show:
    1 to 32 of them, in the order the streams started (the provider's order: the session key of
    Tautulli and of Plex, or the start time Tracearr gives; for Jellyfin, which gives neither, the
    order the collector first saw each stream), so a new stream joins the end and the
    others keep their places. Each is an object with `title`, 1 to 60 characters, and `who`, 1 to
    16: for Tautulli its friendly name for the user, else the user, else the user name; for Plex
    the user's Plex name; for Tracearr the display name set in Tracearr, else the user's name on the
    media server; for Jellyfin the user's Jellyfin name. Either is cut with an ellipsis at its limit. `who` is there with `show` `names` alone, and each key is
    left out when the stream has none; a stream with neither is counted and not listed.
  - With `show` `count` there is `count` and nothing else.

  Names and titles are cleaned: control characters and the marks that turn text
  right to left become spaces, and runs of white space one space. Nothing else about a stream,
  such as its device, quality or progress, is read.
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
  has an entry of its own, `device:<name>`, and the Pi of `[sources.pi]` keeps `pi`; so does each
  entry of `[[sources.imports]]`, `imports:<name>`, whose new imports are `import` events like
  those of `sonarr`, `radarr` and `lidarr`, each entry of `[[sources.usage]]`, `usage:<name>`, and
  each check of `[[sources.json]]`, `json:<name>`,
  which fails when its address cannot be read or its path finds nothing, its check then not
  raised. `error` is empty while `ok` is true, but for a usage source whose reply left out a
  machine it lists: the read is ok, and `error` names the machines that had no reading
  (`no reading for NAS`). A device's
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
  - `look`: `world` is `medieval` or a long name; `build` and `monarch` are `a`, `b` or `c`,
    each also a long name (a body of a world pack for `build`, a patron for `monarch`); `weapon` is `greatsword`,
    `sword_and_shield`, `longsword`, `mace_and_shield` or `crossbow`; `skin` and `monarch_skin` are `fair`,
    `warm`, `golden`, `tan`, `brown` or `deep`; `hair` and `monarch_hair` are `black`, `dark`,
    `brown`, `auburn`, `blonde` or `silver`; `hair_style` is `short`, `tied`, `curls`, `long`,
    `close` or `buzz`; `tabard` and `monarch_robe` are `blue`, `forest`, `violet`, `wine`, `teal` or
    `sable`; `plume` is `red`, `white`, `gold`, `royal`, `green` or `violet`; `skin`, `hair`,
    `tabard` and `plume` each also take the long name of a swatch of that set from a world pack,
    and so do `monarch_skin`, `monarch_hair` and `monarch_robe`, of the skin, hair and tabard
    sets. The gear: `shield`
    is `heater`, `round` or `kite`, carried only with `sword_and_shield` or `mace_and_shield`;
    `helmet` is `open`, `kettle`, `coif` or `bascinet`; `plume_style` is `crest`, `feather` or
    `horsehair`; `body` is `tabard`, `cuirass` or `gambeson`; `shoulders` is `plate`, `lames` or
    `leather`; `arms` is `plate`, `mail` or `padded`; `hands` is `plate`, `leather` or `mail`;
    `legs` is `plate`, `mail` or `hose`; `feet` is `leather`, `sabatons` or `shoes`; `back` is
    `none`, `cloak` or `cape`. `monarch_hair` and `monarch_robe` left out mean each monarch
    keeps the colours the court draws them in; there is no value for that. The cast and the rest
    of the world: `pet` is `cat`, `foe` is `goblin`, `critter` is `fly`, and `props`, `overlay`
    and `words` are `medieval`, each or a long name; `pet_coat` is `calico` or `ginger`, or the
    long name of a coat of a world pack's pet, `"<pack>/<coat>"`, which counts while that pet is in
    use (a coat the pet in use does not have gives its first). `items`
    is an object from a slot (`main`, `off`, `helmet`,
    `plume`, `hair`, `torso`, `pauldrons`, `arms`, `gauntlets`, `legs`, `boots` or `back`) to an
    item's long name, and `devices` an object from a kind of device (`pi`, `camera`, `machine`,
    `vm` or `box`) to `medieval` or a prop set's long name; each holds only the keys the config
    sets. A long name is `"<pack>/<id>"`, which the collector checks only for its form
    ([configuration.md](./configuration.md#the-settings-screens-defaults)); the page ignores one it
    has not loaded. A `world` counts as setting every other key of `look`, the quiet `scenes` and
    every key of `scenes` at the level it is set at ([display.md](./display.md#worlds)), so beside it in
    `defaults` a key set here keeps its value.
  - `display`: `headline` is `small`, `medium` or `large`; `clock` is the number `24` or `12`;
    `helmet_indoors` is `true` or `false`.
  - `quiet`: `scenes` is a list of one or more of `battlement`, `camp`, `house` and `yard`, or
    long names of quiet scenes, with no repeats, in the order they take turns; `minutes` is a whole number from 1 to 240, how long
    each quiet scene shows.
  - `scenes`: the scene a condition plays in, by condition id, such as `{ "cpu_hot": "camp" }`.
    Each key is one of the condition ids above, and each value one of the page's scenes:
    `battlement`, `camp`, `house`, `yard`, `cellar`, `smithy` or `court`, or a scene's long name. Which scene can act
    which condition is the page's to decide (see [design.md](./design.md#scenes-chosen-per-condition)):
    the collector writes any condition with any of these scenes, and the page ignores a pair it
    cannot act, and a short name for a condition it offers no choice for (such as `night`). A
    loaded world's scene by its long name may be given any condition that has a scene of its
    own, offered or not, when it can act it.

  This collector writes only the values above. The page ignores a value it does not know and
  uses its own default in its place, so a later collector can offer more. A page from before
  `scenes` leaves that object alone. A file from a collector older than this section has no
  `defaults`, and the page then uses its own defaults throughout; one from a collector older than
  `scenes` has the other three, and the page plays each condition in its own scene. A page from
  before worlds ignores `world`, the part keys, `items` and `devices` as keys it does not know,
  and a long name in `quiet.scenes` or `scenes` as a value it does not know; a page from before
  other worlds could be drawn ignores a long name in `build`, `skin`, `hair`, `tabard` and
  `plume` the same way, and a page from before parts could be mixed on the screen one in
  `monarch_skin`, `monarch_hair`, `monarch_robe` and `pet_coat`.

- **`config`** says which settings the collector is using, for the bundled server's admin page:
  - `admin`: the version of the admin page's `admin.json` laid over `config.toml` (20 hex
    characters), or `null` when none is.
  - `at`: when these settings were taken up, at start or at the poll that took up the last change,
    as a UTC timestamp.
  - `problems`: the problems of the last change the collector looked at, in the words of
    `check-config`, empty when it went in cleanly. A credential the settings need and the
    environment lacks is listed here while the settings are in use, that source failing, and so
    is each provider file that was left out (`providers/myflix.toml: ...`).
  - `refused`: present only when the last change looked at was not taken up, and then the
    version of `admin.json` that was refused, or `null` when the change was to `config.toml` or
    the provider files alone; `admin` and `at` still describe the settings in use, and `problems` says why.

  The page ignores `config`. A file from a collector older than the admin page has no `config`.
  [collector.md](./collector.md#taking-up-a-change) says when the collector takes up a change.

- **`analytics`** says whether the collector's usage counts are on: `{ "on": true }`, or
  `{ "on": false }` unless `KW_ANALYTICS` in `.env` is `on`
  ([configuration.md](./configuration.md#usage-counts)). It is an object with `on` alone. The
  settings screen's Status page shows it, read only; nothing on the page changes it. The
  collector writes it whenever it runs from its command line, `--once` included, though only its
  loop sends; a runner made in code with no word on it, as the collector's own tests make, leaves
  it out, and so does a collector from before the counts. A page shows "not known" without it.

## Under strain across versions

Under strain replaced Running hot (`cpu_hot`) and Memory tight (`memory_tight`) without a change
of schema, so a collector and a page on either side of it work together:

| Collector | Page | What the wall shows |
|---|---|---|
| with Under strain | from before | `cpu_hot` acted as Running hot, in its chosen scene, with the new words; never bloated |
| from before | with Under strain | `cpu_hot` trained as before; `memory_tight` acted as Under strain on memory, trained and bloated in `cpu_hot`'s scene, with the old collector's words |
| with Under strain, and an old `config.toml` | any | the old settings read as the new ones, with a warning ([configuration.md](./configuration.md#removed-settings)) |

The page goes out first, as [display.md](./display.md#deploying) says.

## Who decides what

The collector decides whether a condition is true, including how long something must last before
it counts, and writes the words. The page decides which scene and which state of the knight a
condition maps to, and nothing else; `defaults.scenes` only asks it for another scene, and the page
grants that where the scene can act the condition. Thresholds and durations are the collector's
configuration.

The quiet line and the captions are the places the page may choose words of its own, from
`quiet_parts` and an event's `parts`. Even then the collector formats every number and time, in its
own time zone, and the page only picks the words around them and joins them. The detail line of
`streaming` is built on the page from `facts.streams.sessions`, so that it can take each stream in
turn, in the collector's words: the same rule as the collector's `detail`, and no world's words yet.
