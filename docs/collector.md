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
this rule keeps the collector well short of that. The pause is kept in the memory file, so
restarting the container does not end it, and `sources` shows when it ends. Credentials are
sent with the first request: urllib's own handler would send one request without them first,
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

**While it runs**, the collector looks at both files at the start of every poll, by their inode,
size and time. When either has changed it builds the settings again the same way, without
requiring `config.toml` to pass alone, and when they pass it swaps to them between polls:

- a source whose reads would be the same (the same class, settings and collector settings, and for
  `host` the same averaging windows) keeps its last reading, any read in flight and, for `host`,
  its samples; any other source starts afresh, and one that was taken away is dropped, a read of it
  still running left to finish unseen. A change to the collector's own settings, the interval
  among them, starts every source afresh;
- each condition keeps its state and takes up its new thresholds; one left out of the priority is
  forgotten;
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
window (`window_s`, ten minutes by default), or at least `bans` bans in that window. Bans are
counted from the rise in the 24-hour ban count between reads and from changes in the last ban, so
a ban that both arrives and ages out of the 24-hour window between two reads can be missed.

The history behind all of this, the host's samples included, is held by the running process
rather than the memory file, and starts again when the collector restarts.

## Events

| Event | Raised when | `count` | `text` |
|---|---|---|---|
| `ad_blocked` | enough blocked queries have built up for at least one fly | the flies, at most 8 unless `fly_every_s` is 0 | empty |
| `ip_banned` | the last ban changed | 1 | `BANNED 203.0.113.77 · sshd` |
| `import` | a new import record appears in Sonarr's or Radarr's history | 1 each | `IMPORTED · The Night Shift S02E04` |
| `backup_done` | the backup log shows a completion newer than the last one seen | 1 | `BACKUP DONE 03:12` |

Events come only from fresh reads, so a source's pace sets how often it can raise them. When a
source has no markers yet, it records what is already there and raises nothing. The markers, the event sequence number `seq` and the last 20 events are kept in `memory.json` in
the state folder, so `seq` keeps rising across restarts and anything that happened while the
collector was down is raised when it comes back. `at` is the time the collector noticed the
event.

AdGuard Home's blocked count covers a rolling window, so the count can fall when an old hour
leaves it. A fall raises nothing and resets the marker.

A fly stands for one helping of the household's normal blocking, so that normal traffic gives a
fly every `fly_every_s` (300 seconds by default) on average and a burst gives a swarm. The
normal rate is read afresh from `/control/stats` on every read: `num_blocked_filtering` divided
by the length of AdGuard Home's statistics window, counted from the first day or hour with any
DNS queries to the current one, so a new install's mostly empty window does not understate it.
One fly is then `rate * fly_every_s` blocked queries, and never fewer than one. Each read's rise
goes into a carry kept in memory; every whole fly's worth in the carry becomes a fly and the
remainder stays for the next read. None of this depends on how often the source is read. An
event carries at most eight flies, and a bigger burst drops the excess rather than queueing it. When the statistics give no rate (the lists missing,
empty, all zero or malformed), a fly is 50 blocked queries. No event is raised until at least
one fly is due. `fly_every_s = 0` restores one fly per blocked query, with `count` the rise.

`blocked_today` counts from local midnight in the collector's time zone. The source keeps the
date and the count in memory and adds each read's rise, starting again from nought when the
date changes. On first sight, or on the first poll after an upgrade from a version that kept no
count, it starts from AdGuard Home's own figures for today: the last day's blocks, or with
hourly statistics the hours since local midnight.

The backup log is rotated by truncation, which leaves it without a completion line for a few
hours each week. The last completion seen is kept in memory and reported until a newer one
appears.

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
| `ssh` | `ssh.py` | established connections to the SSH port in `/proc/net/tcp` and `tcp6` | `ssh` |
| `streams` | `streams.py` | Tautulli's `get_activity` | `streams` |
| `adblock` | `adblock.py` | AdGuard Home's `/control/stats` | `adblock` |
| `security` | `security.py` | a fail2ban summary at `/soc` | `security` |
| `sonarr`, `radarr` | `imports.py` | the last ten import records in each one's history | none |
| `device:<name>` | `devices.py` | a TCP connection to every port at once, or one `GET` to a web address | none; `devices` is built from the conditions |

The `updates` source never opens the maintenance scripts' lock files. Probing a lock with
`flock` could make a script that starts in that instant find its lock taken and skip its run,
and a bind mount of a lock file that does not exist yet makes Docker create a folder in its
place, which would break the script. Reading `/proc/locks` avoids both: a holder is found by
matching its command line against the configured patterns.

## Adding a source

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
   `"required": true` on any it cannot run without. A source that logs in has a `secret` setting
   and one entry in `env` for each credential, named `KNIGHTWATCHER_<SECRET>_<FIELD>`; add each to
   `.env.example` and to the `environment` list in `compose.yaml`. `collector/config.py` builds
   `SOURCE_DEFAULTS`, `REQUIRED` and `SECRET_FIELDS` from the schema. Register the class in
   `build_sources` in `collector/sources/__init__.py`.
2. If it brings a new `facts` section or event type, change [state.md](./state.md) and the
   lists in `collector/contract.py` in the same commit.
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
python3 -m collector --check-config     # validate config.toml alone and its credentials, then exit
python3 -m collector --once             # one poll, write state.json, exit
python3 -m collector --health           # exit 1 if state.json is older than three intervals
python3 -m collector                    # poll until stopped
```

`--config` names the settings file. It defaults to the environment variable
`KNIGHTWATCHER_CONFIG`, and where that is unset to `/etc/knightwatcher/config.toml`, the path
inside the container. `--admin` names the admin page's `admin.json`, laid over it; it defaults to
`KNIGHTWATCHER_ADMIN_FILE`, and where that is unset to
`/var/lib/knightwatcher-server/admin.json`, the path inside the container. A missing file sets
nothing. `--health` measures the state file's age against the larger of `config.toml`'s interval
and the one the file says is in use, since the admin page may have set another. Credentials come from environment variables, which `compose.yaml` passes
from `.env` (see [configuration.md](./configuration.md#env-host-paths-and-credentials)).
`--check-config --env-file PATH` reads them from a `.env` file instead, for the check alone, so a
new image can be checked against a host's `.env` before it starts; nothing in the file is
expanded, and no message carries a value. The collector takes an exclusive lock on its state folder, so a second collector
pointed at the same folder exits at once.

The container definition is `compose.yaml`: a non-root user of its own (uid and gid 10001), a
read-only root filesystem, no capabilities, `no-new-privileges`, the host's network, no
published port and no Docker socket. Its health check runs `--health`, which at the default
interval fails once the file is more than 30 seconds old. Every host path is bound with
`create_host_path: false`, so a missing path stops the container rather than leaving Docker to
create an empty folder there. [configuration.md](./configuration.md#the-accounts)
says how that user is given the files it needs.
