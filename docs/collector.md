# The collector

The collector reads the homelab every `interval_s` seconds (10 by default) and writes `state.json`,
the file described in [state.md](./state.md). It is a Python package in `collector/` that uses the
standard library alone, and it runs as a container. Its settings are in
[configuration.md](./configuration.md).

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
3. **Judge.** The conditions are judged from the readings, in priority order. Watched things
   are judged from their sources' entries in `sources` as well, which say whether a check ran out
   of time.
4. **Write.** The collector builds the state document, checks it against the contract (a
   breach is logged, and the file is still written), and writes it to a temporary name in the
   output folder before renaming it into place. The file is mode 644 so that the web server can
   read it. The memory file is then saved if anything in it changed. Every file also carries
   `defaults`, the settings screen's household defaults, copied unchanged from the `[look]`,
   `[display]` and `[quiet]` tables of `config.toml`. The configuration is read once, at start,
   so a change to those tables reaches the file at the next start.

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

## Conditions

Each condition has a cause, judged afresh at every poll. Most become active from the first poll
that shows the cause (`attack`, `disk_full`, `backup_overdue`, `ssh_session`, `updating`,
`streaming`, `night`). The others need it to last:

- `pi_silent` needs the Pi of `[sources.pi]` to have missed every check for `for_s` (three
  minutes by default). A check that ran out of time counts as missed, as it does for every
  watched thing.
- `thing_down` needs a watched thing that alerts to have been silent for its own `down_after_s`;
  see [Watched things](#watched-things).
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
indefinitely; the per-container timers are kept through a failed read. Watched things are the
exception: a check that ran out of time counts as no answer, since a machine that cannot answer
in time has not answered. `night` is held the same
way, so it shows for up to `clear_after_s` past the end of the quiet hours.

### Watched things

Each watched thing (see [configuration.md](./configuration.md#watched-things)) is a source of its
own, `thing:<name>`, read at the thing's own `every_s`, and the Pi of `[sources.pi]` is one too,
under its old name `pi`. The runner gives each the same pace, time limit and carry-over as any
other source, so a check that hangs costs that thing's reading and nothing else. A thing's
source never fails: anything that goes wrong inside its check is no answer.

At every poll each thing is judged from its last reading:

- An answer makes it `up` at once and ends its silence.
- A silence starts at the first poll that finds no answer, a check that ran out of time
  included, and the thing is `down` once the silence has lasted its `down_after_s`. A thing that
  has answered and has been silent for less is still `up`.
- Until it first answers or is judged down, it is `unknown`: nothing is known of it before its
  first check finishes, and a thing that has never answered is not judged until its silence is
  long enough.
- A clock that goes back starts the silence again from the new time.

Nothing of this is kept in the memory file, so after a restart every thing is `unknown` again
and its silence is counted afresh.

`thing_down` is raised while at least one thing with `alert = true` is down, the Pi of
`[sources.pi]` aside, which raises `pi_silent` as before. One condition covers them all, as
`container_unhealthy` covers every sick container, so the badge counts it once. Its `since` is
the start of the earliest silence when it was raised, and it clears `clear_after_s` after the
last of them answers. A thing with `alert = false` is `down` in `facts.things` and raises nothing.

The headline is the name and a word for the kind: `SILENT` for `pi`, `DARK` for `camera`, and
`DOWN` for `machine`, `vm` and any other kind.

| Case | Headline | Detail |
|---|---|---|
| a machine that answered, then went silent | `VAULT DOWN` | `no answer for 6 min` |
| a camera | `GATE CAM DARK` | `no answer for 12 min` |
| a `[[thing]]` of kind `pi` | `PI SILENT` | `no answer for 3 min` |
| any kind, never answered since the start | `VAULT DOWN` | `not answered since the collector started 5 min ago` |
| a name too long for the headline | `GATEHOUSE… DARK` | `Gatehouse camera · no answer for 12 min` |
| the same, never answered | `GATEHOUSE… DARK` | `Gatehouse camera · not answered in 5 min since start` |
| several down | `3 DOWN` | `Vault, Gate cam, Buildbox` |
| several, names too long | `6 DOWN` | `Back garden cam 0, Back garden cam 1, Back garden cam 2 +3` |

A thing that has never answered is more often a wrong address or a closed port than a machine
that died, and its detail says so. With several, the names are in the order their silences
began, joined while they fit in 60 characters, with `+N` for the rest. The condition also carries
`things`, their positions in `facts.things.list` in that same order, so that the page can find
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
| `pi` | `things.py` | a TCP connection to every port at once; a refusal counts as an answer | `pi` |
| `updates` | `updates.py` | the host's lock table, `/proc/locks`, and the command line of each process holding a lock | `updates` |
| `ssh` | `ssh.py` | established connections to the SSH port in `/proc/net/tcp` and `tcp6` | `ssh` |
| `streams` | `streams.py` | Tautulli's `get_activity` | `streams` |
| `adblock` | `adblock.py` | AdGuard Home's `/control/stats` | `adblock` |
| `security` | `security.py` | a fail2ban summary at `/soc` | `security` |
| `sonarr`, `radarr` | `imports.py` | the last ten import records in each one's history | none |
| `thing:<name>` | `things.py` | a TCP connection to every port at once, or one `GET` to a web address | none; `things` is built from the conditions |

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

1. Add its defaults to `SOURCE_DEFAULTS` in `collector/config.py`, `every_s` among them, with
   any required settings in `REQUIRED` and any credentials in `SECRET_FIELDS`, and register the
   class in `build_sources` in `collector/sources/__init__.py`.
2. If it brings a new `facts` section or event type, change [state.md](./state.md) and the
   lists in `collector/contract.py` in the same commit.
3. If a condition depends on it, write the cause and the words in `collector/conditions.py`.
4. Test it in `tests/collector/` against invented data. `kw_helpers.py` has a fake `/proc` and
   a local HTTP server.
5. Document its settings in [configuration.md](./configuration.md).

`fetch` must not touch `memory`, and nothing it returns may hold a secret. Use the helpers in
`collector/net.py`, which set timeouts, refuse redirects and turn failures into short messages.
Their requests go direct, never through a proxy named in the environment, and only to `http`
and `https` addresses. The checks of watched things bound the lookup of a name by their timeout;
`fetch` leaves the lookup to urllib, which the timeout does not cover, so a source whose
resolver hangs is caught only by the poll's limit on the read. An address avoids the lookup.

## Running it

```bash
python3 -m collector --check-config     # validate config.toml and secrets.json, then exit
python3 -m collector --once             # one poll, write state.json, exit
python3 -m collector --health           # exit 1 if state.json is older than three intervals
python3 -m collector                    # poll until stopped
```

`--config` and `--secrets` name the two files. They default to the environment variables
`KNIGHTWATCHER_CONFIG` and `KNIGHTWATCHER_SECRETS`, and where those are unset to
`/etc/knightwatcher/config.toml` and `/etc/knightwatcher/secrets.json`, the paths inside the
container. The collector takes an exclusive lock on its state folder, so a second collector
pointed at the same folder exits at once.

The container definition is `compose.yaml`: a non-root user of its own (uid and gid 10001), a
read-only root filesystem, no capabilities, `no-new-privileges`, the host's network, no
published port and no Docker socket. Its health check runs `--health`, which at the default
interval fails once the file is more than 30 seconds old. Every host path is bound with
`create_host_path: false`, so a missing path stops the container rather than leaving Docker to
create an empty folder there. [configuration.md](./configuration.md#the-collectors-account)
says how that user is given the files it needs.
