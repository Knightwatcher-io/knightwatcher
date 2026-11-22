# The collector

The collector reads the homelab every `interval_s` seconds (10 by default) and writes `state.json`,
the file described in [state.md](./state.md). It is a Python package in `collector/` that uses the
standard library alone, and it runs as a container. Its settings are in
[configuration.md](./configuration.md), and described for the code in
`collector/settings-schema.json`.

## One poll

1. **Read.** Every enabled source that is due is read at once, each in its own thread. A source is
   due when its last read began at least its `every_s` ago (10 seconds for `host`, `ssh`,
   `updates` and `containers`, 60 for `backup`, 30 for the rest), give or take a second for the
   poll's own timing, so a source with an `every_s` below the interval is read at every poll.
   The poll waits for its reads until 66 percent of the interval has passed (about 7 seconds at
   the default 10). A read still running then carries on into later polls, and is collected by
   the first poll that finds it finished. It counts as `timed out` once it has run for 66 percent
   of the source's own pace or of the interval, whichever is longer: about 20 seconds for a source
   read every 30 seconds, enough for one that tries two addresses in turn. A read that times out
   is dropped, and the source is not started again while that read is still running, so a source
   that hangs costs one thread and never piles up. Every network call has its own timeout as well
   (`http_timeout_s`).
2. **Observe.** Each source read afresh at this poll turns its reading into events, comparing it
   with the markers it keeps in the memory file. This step runs in the main thread, one source
   after another.
3. **Judge.** The conditions are judged from the readings, in priority order. Devices
   are judged from their sources' entries in `sources` as well, which say whether a check ran out
   of time.
4. **Write.** The collector builds the state document, checks it against the contract (a
   breach is logged, and the file is still written), and writes it to a temporary name in the
   output folder before renaming it into place. The file is mode 644 so that the web server can
   read it. The memory file is then saved if anything in it changed. Every file also carries
   `defaults`, the settings screen's household defaults, copied unchanged from the `[look]`,
   `[display]`, `[quiet]` and `[scenes]` tables of `config.toml`, and `config`, which says which
   settings are in use (see [Taking up a change](#taking-up-a-change)).

Before step 1, the collector looks at whether `config.toml` or the admin page's `admin.json` has
been written since it last read them, and takes up a change between polls.

Between reads a source's last reading stands. It is written to the file and judged at every
poll, but it is not observed again, so it raises no events, and its entry in `sources` keeps the
time of the read it came from. A failed read stands in the same way, and the source is tried
again at its own pace.

A source that fails is marked `ok: false` in `sources` with a short reason, and its `facts`
section is `null`. The error text never carries a URL, and any secret value that turns up in
it is replaced with `***` before it is written. Before a source's first read has finished, its
entry says `first read still running`.

### Credentials refused

A service that answers 401, 403 or 429 is not called again for `auth_backoff_s` (20 minutes at
least). AdGuard Home locks an address out of its API for 15 minutes after five bad logins, and
this rule keeps the collector well short of that; Pi-hole answers 429 after more than three
password tries in a second, or when its sessions are all taken. Plex answers 401 for a token it
does not take, wrong or missing, and Tracearr 401 for a key it does not take and 403 for one that
is not the owner's. Technitium answers HTTP 200 with
the status `invalid-token`, which its provider marks as refused credentials. The pause is kept in the memory
file, so restarting the container does not end it, and `sources` shows when it ends. Credentials
are sent with the first request: urllib's own handler would send one request without them first,
then retry.

## Taking up a change

The settings the collector uses are `config.toml` with what is set on the bundled server's admin
page laid over it: the server keeps that in `admin.json` in its own folder, which `compose.yaml`
mounts read-only in the collector at `/var/lib/knightwatcher-server`
([server.md](./server.md#the-admin-store)). Both are read by the code in `collector/overlay.py` and
`collector/reload.py`, which the server uses too, so the two always agree on what is set.

**At start**, `config.toml` must pass on its own, its credentials included, or the collector does
not start, as it always has; `check-config` checks the same. `admin.json` is then laid over it. When
the result passes, it is used. When it needs a credential that the environment lacks, it is used
all the same, and that source runs and fails at every read with the variable's name
(`KNIGHTWATCHER_SONARR_API_KEY missing`), so a mistake in `.env` stops one source rather than the
display. When it fails for any other reason, the collector runs on `config.toml` alone and says
why in the state file.

**Provider files** of the user's own, in the providers folder beside `config.toml`
([providers.md](./providers.md#your-own-provider-files)), are read with it. A file that fails its
checks is left out and never stops the collector: its problems are logged
(`provider file left out: providers/myflix.toml: ...`) and listed in the state file's
`config.problems`, and a section whose `from` names it runs and fails at every read
(`provider myflix refused; see the settings problems`).

**While it runs**, the collector looks at both files at the start of every poll, by their inode,
size and time, and at the providers folder's files by their name, inode, size and time. When any
has changed it reads the folder again and builds the settings again the same way, without
requiring `config.toml` to pass alone, and when they pass it swaps to them between polls:

- a source whose reads would be the same (the same class, settings and collector settings, for a
  source read through a provider the same provider file, and for `host` the same averaging
  windows) keeps its last reading, any read in flight and, for `host`,
  its samples; any other source starts afresh, and one that was taken away is dropped, a read of it
  still running left to finish unseen. A change to the collector's own settings, the interval
  among them, starts every source afresh;
- each condition keeps its state and takes up its new thresholds; one left out of the priority is
  forgotten. The words `streaming` holds through its clearing period keep only what the new
  `show` of `[sources.streams]` lets out, so a name held back from the next file is not in its
  `detail` either;
- each device keeps its record while its name and its check are the same, at its new place
  in the list, and one renamed, given a new check or added starts as after a restart;
- the next poll is scheduled at the new interval.

A change that fails is not taken up: the collector keeps the settings it has and says why. The
output and memory folders change only at a restart, and a change to them is refused while it runs.
Each change taken up or refused is logged (`settings taken up: admin.json 3f9c0d12ab45e6789a0b`,
`settings not taken up: ...`).

The state file's `config` says which settings are in use: the version of `admin.json` laid over
`config.toml`, when they were taken up, the problems of the last change looked at, and `refused`
when that change was not taken up ([state.md](./state.md#fields)). The admin page shows it as "In
use by the collector since".

### Credentials by name

At start the collector writes `credentials.json` beside `state.json`, mode 640: the name of every
credential variable the schema lists and of any other `KNIGHTWATCHER_<SECRET>_<FIELD>` variable in
its environment, each `true` when it holds a value, and nothing else. Never a value.

```json
{"KNIGHTWATCHER_ADGUARD_PASSWORD": true, "KNIGHTWATCHER_ADGUARD_USERNAME": true,
 "KNIGHTWATCHER_RADARR_API_KEY": false, "KNIGHTWATCHER_SONARR_API_KEY": true,
 "KNIGHTWATCHER_TAUTULLI_API_KEY": true}
```

The bundled server reads it to check a change on the admin page and to say which credentials
`.env` holds, and never serves it. The environment does not change while a container runs, so the
file is written once.

## Conditions

Each condition has a cause, judged afresh at every poll. Most become active from the first poll
that shows the cause (`attack`, `disk_full`, `backup_overdue`, `ssh_session`, `updating`,
`streaming`, `night`). The others need it to last:

- `pi_silent` needs the Pi of `[sources.pi]` to have missed every check for `for_s` (three
  minutes by default). A check that ran out of time counts as missed, as it does for every
  device.
- `device_down` needs a device that alerts to have been silent for its own `down_after_s`;
  see [Devices](#devices).
- `container_unhealthy` needs a container unhealthy, restarting or exited with a non-zero code
  for `for_s` (three minutes by default), and each container has its own timer.
- `wan_down` needs `failed_checks` failed internet checks in a row (two by default). A check is a
  fresh read of the `wan` source, so a poll that reuses the last reading does not count, and two
  checks are 30 seconds apart at the default pace.
- `cpu_hot` and `memory_tight` are judged on averages, below.
- A generic check, `check:<name>`, needs its test to have held for its own `for_s` (none by
  default); see [Generic checks](#generic-checks).

### Generic checks

Each entry of `[[sources.json]]` ([configuration.md](./configuration.md#generic-checks)) is a
source of its own, `json:<name>`, read at its own pace through the check kind
(`collector/kinds/check.py`): the entry is compiled in memory into a provider file of one GET to
its address, which the engine runs as any other ([Kinds and providers](#kinds-and-providers)). Its
reading says whether its test holds on the value its path found. A path that finds nothing, or
`null`, or an object or a list where a value is needed, fails the read for every test but
`missing`.

While the test holds, the check raises a condition of its own, `check:<name>`, through a tracker
of its own with its `for_s` and the common `clear_after_s`. A read that fails, the address
unreachable included, counts as the cause absent, as for every source. The condition borrows
another (`as`, any but `device_down`): it takes that condition's level, and sits straight after it
in the order the conditions are judged and written, checks in their order in `config.toml`, so a
check never outranks the condition it borrows. `config.toml` refuses a check whose borrowed
condition is left out of `conditions.priority`. Its words are its own: `headline` in capitals, cut
to 16, and `detail` with `{value}` filled by the value found (cleaned and cut, a number as Python
writes it, `true` and `false` as themselves), the whole cut to 60. Its entry in `conditions` names
the borrowed condition in `as`. A check reads nothing of what the borrowed condition reads, so one
acted as `attack` leaves `facts.security.attack` alone.

When a change is taken up, a check whose address, path, test, `value`, header and `as` stay the
same keeps its state, taking up new words and a new `for_s`; any other change starts it afresh,
and a check taken away is forgotten.

### CPU and memory

`cpu_hot` is raised when the CPU, averaged over the last `window_s` seconds (30 by default), is
at or above `pct`. `memory_tight` is raised when `MemAvailable` as a percent of `MemTotal`,
averaged over its own `window_s`, is at or below `available_pct`. A spike of a few seconds moves a
30-second average little, so it raises nothing, while a CPU pinned for 30 seconds raises `cpu_hot`
on the poll that completes the window. A brief dip keeps the condition up as long as the average
stays past the threshold. `disk_full` is a level and is judged on the latest reading.

The host source keeps the samples behind these averages: the time, the busy and total CPU
jiffies, and the available memory. It keeps enough for the larger window and one more read. A
window is measured from its base sample, the oldest one no older than the window (a second's
slack allows for a poll that starts late). CPU is the difference in jiffies between the base and
the latest sample, which makes it exact however the samples are spaced. Memory is the mean of the
samples after the base, each weighted by the time since the one before it. If the host is read
less often than a window is long, the window reaches back to the previous read instead.

After a start there is no history, and none after a gap in the host's reads longer than the
history it keeps. The first read then takes a half-second CPU sample, and the averages cover
whatever has been seen since: half a second at the first poll, ten
and a half at the second, and so on until the window is full. A condition can be raised from the
history there is, as long as the average over it is past the threshold.

The words count from the start of the window: `CPU HOT` with `99% for 30 s · load 2.9` when it
appears, the time then growing with each poll, and the condition's `since` 30 seconds before it
was raised. After a start the time reads at least `1 s`. `facts.host.cpu_pct` is the CPU average
over the `cpu_hot` window; `facts.host.mem_pct` is the latest reading.

Memory is judged by `MemAvailable` and never by swap, which a busy host can keep full for
weeks without being short of memory.

### SSH sessions

`ssh_session` is raised when a new SSH session appears. A session is one established connection
to the SSH port, identified by its remote address and port. The cause is present while at least
`min_sessions` sessions are open and one of them was first seen less than `show_for_s` ago (ten
minutes by default), so a second new session extends the time. A session that closes early ends
the cause at once. The first reading after the collector starts takes every session already open
as old, so a restart raises nothing, and a poll where the source cannot be read leaves the record
of sessions as it was. With `show_for_s` at 0 the condition is up for as long as `min_sessions`
sessions are open.

### Clearing

A condition clears once its cause has been absent for `clear_after_s` seconds (30 by default),
counted from the first poll that found it absent. While it is held it keeps the words it last
had, and a cause that returns in that time keeps it up with its first `since`. A source that
cannot be read counts as the cause being absent, so a dead source cannot hold a condition up
indefinitely; the per-container timers are kept through a failed read. Devices are the
exception: a check that ran out of time counts as no answer, since a machine that cannot answer
in time has not answered. `night` is held the same
way, so it shows for up to `clear_after_s` past the end of the quiet hours.

### Devices

Each device (see [configuration.md](./configuration.md#devices)) is a source of its
own, `device:<name>`, read at the device's own `every_s`, and the Pi of `[sources.pi]` is one too,
under its old name `pi`. The runner gives each the same pace, time limit and carry-over as any
other source, so a check that hangs costs that device's reading and nothing else. A device's
source never fails: anything that goes wrong inside its check is no answer.

At every poll each device is judged from its last reading:

- An answer makes it `up` at once and ends its silence.
- A silence starts at the first poll that finds no answer, a check that ran out of time
  included, and the device is `down` once the silence has lasted its `down_after_s`. A device that
  has answered and has been silent for less is still `up`.
- Until it first answers or is judged down, it is `unknown`: nothing is known of it before its
  first check finishes, and a device that has never answered is not judged until its silence is
  long enough.
- A clock that goes back starts the silence again from the new time.

Nothing of this is kept in the memory file, so after a restart every device is `unknown` again
and its silence is counted afresh.

`device_down` is raised while at least one device with `alert = true` is down, the Pi of
`[sources.pi]` aside, which raises `pi_silent` as before. One condition covers them all, as
`container_unhealthy` covers every sick container, so the badge counts it once. Its `since` is
the start of the earliest silence when it was raised, and it clears `clear_after_s` after the
last of them answers. A device with `alert = false` is `down` in `facts.devices` and raises nothing.

The headline is the name and a word for the kind: `SILENT` for `pi`, `DARK` for `camera`, and
`DOWN` for `machine`, `vm` and any other kind.

| Case | Headline | Detail |
|---|---|---|
| a machine that answered, then went silent | `VAULT DOWN` | `no answer for 6 min` |
| a camera | `GATE CAM DARK` | `no answer for 12 min` |
| a `[[device]]` of kind `pi` | `PI SILENT` | `no answer for 3 min` |
| any kind, never answered since the start | `VAULT DOWN` | `not answered since the collector started 5 min ago` |
| a name too long for the headline | `GATEHOUSE… DARK` | `Gatehouse camera · no answer for 12 min` |
| the same, never answered | `GATEHOUSE… DARK` | `Gatehouse camera · not answered in 5 min since start` |
| several down | `3 DOWN` | `Vault, Gate cam, Buildbox` |
| several, names too long | `6 DOWN` | `Back garden cam 0, Back garden cam 1, Back garden cam 2 +3` |

A device that has never answered is more often a wrong address or a closed port than a machine
that died, and its detail says so. With several, the names are in the order their silences
began, joined while they fit in 60 characters, with `+N` for the rest. The condition also carries
`devices`, their positions in `facts.devices.list` in that same order, so that the page can find
them ([state.md](./state.md#fields)).

### Attacks

The attack signal is a ban in one of the configured jails (`sshd` by default) within the attack
window (`window_s`, ten minutes by default), or at least `bans` bans in that window.

The security kind (`kinds/security.py`) works everything out from the list of bans its provider
gives, fail2ban's database by default, at every read: the bans of the last 24 hours, those in the
window, whether one of those is in a watched jail, and the ban the words name (the newest in a
watched jail inside the window, else the newest). A ban that arrives between two reads is counted
even when it would have aged out by the next, a watched jail's ban that is not the very last ban
still raises the condition, and a ban lifted by hand (its rows deleted) leaves the count. The words
are `UNDER ATTACK` with `sshd ban from 203.0.113.77 · 3 bans in 10 min`.

The history behind all of this, the host's samples included, is held by the running process
rather than the memory file, and starts again when the collector restarts.

## Events

| Event | Raised when | `count` | `text` |
|---|---|---|---|
| `ad_blocked` | enough blocked queries have built up for at least one fly | the flies, at most 8 unless `fly_every_s` is 0 | empty |
| `ip_banned` | a read of `[sources.security]` finds bans it has not seen, and names the newest | the new bans | `BANNED 203.0.113.77 · sshd` |
| `import` | a new import record appears in the history of Sonarr, Radarr, Lidarr (one for each album) or an entry of `[[sources.imports]]` | 1 each | `IMPORTED · The Night Shift S02E04` |
| `backup_done` | the backup log shows a completion newer than the last one seen | 1 | `BACKUP DONE 03:12` |

Every caption is cut to 44 characters, with runs of spaces, tabs and line breaks made one space,
and gives a time in the collector's time zone. Beside it, `ip_banned`, `import` and `backup_done`
carry `parts`: the address and the jail, the title, and the time, each as the caption has it and
cleaned and cut by the same rule. A source returns the raw values with its event and the runner
cleans them, so a caption and its parts never follow different rules. The page can then word the event
in a world's terms without formatting anything itself; see [state.md](./state.md#fields).

Events come only from fresh reads, so a source's pace sets how often it can raise them. When a
source has no markers yet, it records what is already there and raises nothing. The markers, the event sequence number `seq` and the last 20 events are kept in `memory.json` in
the state folder, so `seq` keeps rising across restarts and anything that happened while the
collector was down is raised when it comes back. `at` is the time the collector noticed the
event.

AdGuard Home's blocked count covers a rolling window, so the count can fall when an old hour
leaves it; Pi-hole's covers the last 24 hours and falls each time Pi-hole drops the queries older
than that, every ten minutes. A fall raises nothing and resets the marker, so the blocks of the
read that saw it are not counted.

Technitium DNS Server gives no count that only rises: its freshest figures are the last hour, a
minute a bucket, and the difference of two sums of that sliding hour would miss whatever left it
between the reads. The `technitium` provider gives the minutes themselves (the adblock kind's
`recent` mode), and each read adds the minutes later than the newest one already counted, whose
time is the marker, `recent_at`. A minute counts once 20 seconds have passed since it ended:
Technitium finishes a minute's count up to ten seconds after it ends, and until then shows that
bucket's count from an hour before. So a blocked query brings its flies 20 to 80 seconds after the
minute it falls in began, plus the time to the next read. A marker of the other mode is dropped,
so moving `from` between AdGuard Home and Technitium counts nothing twice, and a marker later than
the collector's clock (the clock went back) is taken as first sight.

The security kind knows a ban by its jail, address and time, since fail2ban can write a ban after
one with a later time, and reuses row numbers after an unban. The keys of the bans it lists are
its markers, kept as `seen` in memory, the newest 2,000 of them; when more are listed, it keeps
the time of the oldest kept as `floor`, and a ban no newer than that is never new.

A fly stands for one helping of the household's normal blocking, so that normal traffic gives a
fly every `fly_every_s` (300 seconds by default) on average and a burst gives a swarm. The
normal rate is read afresh from the service's statistics on every read, AdGuard Home's
`/control/stats` for the `adguard` provider, Pi-hole's `/api/history` for `pihole` and
Technitium's last 24 hours (`LastDay`) for `technitium`: the blocked count (for Technitium, the
sum of those hours) divided by the length of the
statistics window, counted from the first day or hour with any DNS queries to the current one, so
a new install's mostly empty window does not understate it.
One fly is then `rate * fly_every_s` blocked queries, and never fewer than one. Each read's rise
goes into a carry kept in memory; every whole fly's worth in the carry becomes a fly and the
remainder stays for the next read. None of this depends on how often the source is read. An
event carries at most eight flies, and a bigger burst drops the excess rather than queueing it. When the statistics give no rate (the lists missing,
empty, all zero or malformed), a fly is 50 blocked queries. No event is raised until at least
one fly is due. `fly_every_s = 0` restores one fly per blocked query, with `count` the rise.

`blocked_today` counts from local midnight in the collector's time zone. The source keeps the
date and the count in memory and adds each read's rise, starting again from nought when the
date changes. On first sight, or on the first poll after an upgrade from a version that kept no
count, it starts from the service's own figures for today: with buckets of a day, the last one;
with shorter ones, those since local midnight (AdGuard Home's hourly statistics give the hours
since midnight and the current one, Pi-hole's ten-minute slots the slots since midnight and the
current one, Technitium's hourly statistics the hours since midnight without the current one, which
they leave out).

The backup log is rotated by truncation, which leaves it without a completion line for a few
hours each week. The last completion seen is kept in memory and reported until a newer one
appears.

## The quiet line

The line the page shows while all is quiet is made of up to four parts, in this order:
`ALL QUIET`; the running containers (`29 up`), when the containers source has a reading; the last
backup (`backup 03:12`, in the collector's time zone), once a completion is known; and the queries
blocked today (`4,812 ads blocked`), when the adblock source has a reading. The line is at most 52
characters, so a large blocked count is shortened (`11.3k ads blocked`, then `11.3k blocked`), and
a part that still does not fit is dropped from the end.

The file carries the line whole as `quiet_line` and its parts as `quiet_parts`, every value
formatted as the line has it. Each part the collector has a reading for is in `quiet_parts`,
including one the line had no room for, so a page that words the line in a world's terms does
its own fitting. The line is built from the same parts, so the two always agree.

## Sources

| Source | Module | Reads | Facts |
|---|---|---|---|
| `host` | `host.py` | `/proc/stat`, `/proc/meminfo`, `/proc/loadavg` under `proc_root`, and `statvfs` on each configured disk | `host` |
| `containers` | `containers.py` | `GET /containers/json?all=1` on a read-only Docker API proxy | `containers` |
| `wan` | `wan.py` | each URL in turn until one answers with a 2xx | `wan` |
| `dns` | `dns.py` | one A query over UDP to the configured server | `dns` |
| `backup` | `backup.py` | the tail of the backup log | `backup` |
| `pi` | `devices.py` | a TCP connection to every port at once; a refusal counts as an answer | `pi` |
| `updates` | `updates.py` | the host's lock table, `/proc/locks`, and the command line of each process holding a lock | `updates` |
| `ssh` | `ssh.py` | established connections to the SSH port in the host's `/proc/1/net/tcp` and `tcp6` | `ssh` |
| `streams` | the streams kind, `kinds/streams.py`, through its `from` provider, `tautulli` by default | Tautulli's `get_activity`, Plex Media Server's `/status/sessions` with the owner's token, or Tracearr's `/api/v2/public/streams` with its API key: of each stream its title, and its user's name only when `show` is `names` | `streams` |
| `adblock` | the adblock kind, `kinds/adblock.py`, through its `from` provider, `adguard` by default | AdGuard Home's `/control/stats`, Pi-hole 6's `/api/stats/summary` and `/api/history` through a session, or Technitium's `/api/dashboard/stats/get` for the last hour and the last day, with an API token | `adblock` |
| `security` | the security kind, `kinds/security.py`, through its `from` provider, `fail2ban` (`providers/fail2ban.py`) by default | the `bans` table of fail2ban's SQLite database, read-only | `security` |
| `sonarr`, `radarr`, `lidarr` | the imports kind, `kinds/imports.py`, through the provider of each one's name | the last ten import records in each one's history; for Lidarr, its album records alone (`eventType=8`), so an album is one import | none |
| `imports:<name>` | the imports kind, through the provider its entry of `[[sources.imports]]` names | as its provider reads | none |
| `json:<name>` | the check kind, `kinds/check.py`, through the provider its entry of `[[sources.json]]` is compiled into | one `GET` to the entry's address, and the first value its path finds | none; the condition `check:<name>` |
| `device:<name>` | `devices.py` | a TCP connection to every port at once, or one `GET` to a web address | none; `devices` is built from the conditions |

Modules are in `collector/sources/` unless the table says otherwise.

The `updates` source never opens the maintenance scripts' lock files. Probing a lock with
`flock` could make a script that starts in that instant find its lock taken and skip its run,
and a bind mount of a lock file that does not exist yet makes Docker create a folder in its
place, which would break the script. Reading `/proc/locks` avoids both: a holder is found by
matching its command line against the configured patterns.

## Kinds and providers

The services the collector reads for streams, blocked queries, bans and imports are each read
through a **kind** and a **provider**. A kind is the fixed shape of one sort of reading, written once in
`collector/kinds/`: it owns everything after the service has answered, the cleaning and cutting of
the words, the markers in the memory file, the events and the facts. A provider fills a kind's
shape from one service. The built-in providers are files in `collector/providers/builtin/`, one
for each service: the requests, the login, and paths into the JSON reply mapped onto the kind's
fields. One engine, `collector/providers/engine.py`, runs every file; nothing in a file runs as
code. [providers.md](./providers.md) describes the format. `from` may also name a file of the
user's own in the providers folder, which `collector/providers/__init__.py` reads with the same
checks; such a file may declare settings the section then sets.

A service that a file cannot describe gets a **code adapter**: a `Provider` subclass in
`collector/providers/` returning the same fill, made known with the `@adapter` decorator of
`collector/providers/__init__.py` and listed beside the files. The one adapter is `fail2ban`
(`collector/providers/fail2ban.py`), which reads fail2ban's SQLite database rather than an HTTP
service: it opens the file read-only at every read (SQLite's `mode=ro`, never `immutable`, since
fail2ban writes the file while it is read), runs one query of the `bans` table, and closes it, so
a file fail2ban replaces is read afresh.

| Section | Kind | `from` | Built-in providers |
|---|---|---|---|
| `[sources.streams]` | streams | `tautulli` by default, `plex`, `tracearr`, or a file of the user's own | `tautulli`, `plex`, `tracearr` |
| `[sources.adblock]` | adblock | `adguard` by default, `pihole`, `technitium`, or a file of the user's own | `adguard`, `pihole`, `technitium` |
| `[sources.security]` | security | `fail2ban` by default, or a file of the user's own | `fail2ban` (a code adapter) |
| `[sources.sonarr]`, `[sources.radarr]`, `[sources.lidarr]` | imports | none: each reads the provider of its own name | `sonarr`, `radarr`, `lidarr` |
| each entry of `[[sources.imports]]` | imports | required, any provider of the kind, a file of the user's own included | `sonarr`, `radarr`, `lidarr` |
| each entry of `[[sources.json]]` | check | none: the entry is compiled into a provider of its own | none |

An entry of a list of tables under `[sources]` is the source `<list>:<name>`, `imports:sonarr-4k`
or `json:nas-temp`: that is its key in the state file's `sources`, in the memory file and in
`--probe`, and the problems of its settings name its place, `sources.imports[0]`. `LISTS` in
`collector/kinds/` names the lists and the kind each reads, and `kind_of()` gives the kind of any
source. A kind gives the provider a source reads with `provider_spec()`: the one its `from` or its
name names, or for the check kind, the entry compiled, with its `url` cut to the scheme, host and
port the compiled path is appended to.

To the runner each of these sections is a source like any other (`KindSource` in
`collector/sources/__init__.py`), with the same pace, time limit, back-off and status entry. One
read makes the provider's requests in order through `collector/net.py` (direct, no proxy, no
redirect, the reply cut at 4 MiB, `http_timeout_s` each, the certificate of an `https` address
checked unless the section sets `verify_tls = false`), checks each reply, and builds the fill,
reading only the fields the kind allows: for streams, a name is read from the reply only when
`show` is `names`, and nothing of a stream when it is `count`. The fill is held to the kind's
declaration before the kind sees it, so a provider that gives a field of the wrong type, or one
`show` holds back, fails the read with a message naming the field. A refused credential (HTTP 401,
403 or 429, or a reply the provider marks as one) raises the back-off of
[Credentials refused](#credentials-refused). A source whose provider or provider file changes is
started afresh when a change is taken up, as one whose settings change is.

The streams kind lists the streams in the order they started, so a new stream joins the end and
the others keep their places. Tautulli and Plex give a number that rises as streams start (Plex's
session key, which Tautulli passes on), and the kind sorts by it. Tracearr gives the moment each
stream started, which the kind sorts by in the same way, ties by the stream's id. For a provider
whose service gives neither, the file fills each stream's `key` instead, and the kind lists those streams
in the order it first saw each key, ties by the key. It keeps that in the running process alone:
never in the memory file, and only for the keys playing at the last read, so a stream that ends
and comes back joins the end, and a restart starts the order afresh.

A provider that logs in by session (`pihole`) logs in with one POST before its first read and
keeps the session's id in the provider instance, in memory alone: it is never logged, never in
the state or memory file, and never in an error. The id goes with every request after, so the
source holds one of the service's sessions however often it is read, used until shortly before its
lifetime runs out (Pi-hole extends a session at each use, so in practice until it is refused). A
401 on a session made at an earlier read drops it and logs in again once, in the same read; a
refused login, or a 401 on a session just made, is refused credentials. The session is ended
with the file's logout when the collector stops (after its last poll, and after `--once`), when a
source is started afresh or taken away as a change is taken up (in the background, so that a slow
service never holds up a poll; a read still in flight ends it as it finishes), and when `--probe`
has read. Only a collector killed without the chance leaves its session to expire on its own
(Pi-hole: 30 minutes after its last use), one of Pi-hole's 16 seats until then.

## Adding a source

A service that a kind already covers needs a provider file, not code. For one host it is a file in
the providers folder ([providers.md](./providers.md#your-own-provider-files)); to ship it with
Knightwatcher, write it in `collector/providers/builtin/`, add it to the `providers` list of `collector/settings-schema.json`
with its credentials in `env`, give it fixtures in `tests/collector/fixtures/providers/<id>/`, and
run `node tools/settings-schema.js`. A new sort of reading is a kind: a module in
`collector/kinds/` with its fill's declaration, `reading` and `observe`, named in `SECTIONS` (or
`LISTS`, for a list of tables) and `KINDS` there. Anything else is a source of its own.

A source is a class in `collector/sources/` with two methods:

```python
class ExampleSource(Source):
    name = "example"      # its key in `sources`
    section = "example"   # its key in `facts`, or None

    def fetch(self, now):
        """Runs in a worker thread. Raise SourceError (or AuthError) on failure."""
        reply = fetch_json(self.settings["url"] + "/status", self.timeout)
        return Reading({"up": reply["ok"]}, {"anything": "the events or conditions need"})

    def observe(self, reading, memory, now):
        """Runs in the main thread after a fresh read. Return events; keep markers in `memory`."""
        return []
```

Then:

1. Describe its settings in `collector/settings-schema.json`: a `sources.<name>` table with
   `enabled`, `every_s` and its own, each with its type, default, range and help, and
   `"required": true` on any it cannot run without. `collector/config.py` builds
   `SOURCE_DEFAULTS` and `REQUIRED` from the schema. A service that logs in is read through a
   provider, whose file names its credentials (above); each is an entry in `env`, named
   `KNIGHTWATCHER_<SECRET>_<FIELD>`, added to `.env.example` and to the `environment` list in
   `compose.yaml`. Register the class in `build_sources` in `collector/sources/__init__.py`.
2. If it brings a new `facts` section or event type, change [state.md](./state.md) and the
   lists in `collector/contract.py` in the same commit. An event type whose caption the page may
   word for itself lists its part names in `EVENT_PARTS` there, and its events carry `parts`.
3. If a condition depends on it, write the cause and the words in `collector/conditions.py`.
4. Test it in `tests/collector/` against invented data. `kw_helpers.py` has a fake `/proc` and
   a local HTTP server.
5. Add its table to `config.example.toml`, run `node tools/settings-schema.js` to write the
   reference in [configuration.md](./configuration.md), and add any notes there by hand.

`fetch` must not touch `memory`, and nothing it returns may hold a secret. Use the helpers in
`collector/net.py`, which set timeouts, refuse redirects and turn failures into short messages.
Their requests go direct, never through a proxy named in the environment, and only to `http`
and `https` addresses. The checks of devices bound the lookup of a name by their timeout;
`fetch` leaves the lookup to urllib, which the timeout does not cover, so a source whose
resolver hangs is caught only by the poll's limit on the read. An address avoids the lookup.

## Running it

```bash
python3 -m collector --check-config     # validate config.toml alone, its credentials and the provider files, then exit
python3 -m collector --once             # one poll, write state.json, exit
python3 -m collector --health           # exit 1 if state.json is older than three intervals
python3 -m collector --probe streams    # read one source through its provider once, masked
python3 -m collector                    # poll until stopped
```

`--probe <source>` reads one source read through a provider (`streams`, `adblock`, `security`,
`sonarr`, `radarr` or `lidarr`, or an entry of `[[sources.imports]]` or `[[sources.json]]` by its
source's name, `imports:<name>` or `json:<name>`) once, with the settings in use, and prints the
provider's fill and the facts the kind
would write with every text replaced by its type and length (`<string 21>`), and for a check
whether its test holds (`test: above holds`), so that a provider is
proved against a live service without anyone reading what is being watched. It writes nothing of
the collector's own, and a source the running collector has paused after refused credentials is
not read until the pause ends. Run it in the container, where the credentials come from `.env`
through compose: `docker compose run --rm collector --probe streams`. On the host, `--env-file
PATH` takes the credentials from a `.env` file instead of the environment, so a probe can run with
a config of its own without the wall's container or its config. `--record FOLDER` also writes the
exchanges to a file in that folder (named after the source, `imports-<name>-` or `json-<name>-`
for an entry of a list, a check's path and query kept and its header's value masked), mode 600, each credential replaced by its field's name wherever
it appears, as written or percent-encoded, in a reply or an error as well as in the request; the
replies in it are the service's own, private, and never committed as they are. A
section whose provider is a file that was left out is not read: the probe prints the file's
problems and exits 2.

`--check-config` exits 2 when `config.toml` fails, or when a section's `from` names a provider file
that was left out; the problems of a file no section names are printed as warnings, and the exit
is 0 ([configuration.md](./configuration.md#checking)).

`--config` names the settings file. It defaults to the environment variable
`KNIGHTWATCHER_CONFIG`, and where that is unset to `/etc/knightwatcher/config.toml`, the path
inside the container. `--admin` names the admin page's `admin.json`, laid over it; it defaults to
`KNIGHTWATCHER_ADMIN_FILE`, and where that is unset to
`/var/lib/knightwatcher-server/admin.json`, the path inside the container. A missing file sets
nothing. `--health` measures the state file's age against the larger of `config.toml`'s interval
and the one the file says is in use, since the admin page may have set another. Credentials come from environment variables, which `compose.yaml` passes
from `.env` (see [configuration.md](./configuration.md#env-host-paths-the-servers-address-and-credentials)).
`--check-config --env-file PATH` reads them from a `.env` file instead, for the check alone, so a
new image can be checked against a host's `.env` before it starts; nothing in the file is
expanded, and no message carries a value. `--probe` takes `--env-file` the same way. The collector takes an exclusive lock on its state folder, so a second collector
pointed at the same folder exits at once.

The container definition is `compose.yaml`: a non-root user of its own (uid and gid 10001), a
read-only root filesystem, no capabilities, `no-new-privileges`, the host's network, no
published port and no Docker socket. Its health check runs `--health`, which at the default
interval fails once the file is more than 30 seconds old. Every host path is bound with
`create_host_path: false`, so a missing path stops the container rather than leaving Docker to
create an empty folder there. The providers folder, mounted read-only at
`/etc/knightwatcher/providers`, defaults to the repository's own `providers/`, which is tracked
empty so that every checkout has it. [configuration.md](./configuration.md#the-accounts)
says how that user is given the files it needs.
