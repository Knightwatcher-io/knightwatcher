# The collector

The collector reads the homelab every `interval_s` seconds (30 by default) and writes `state.json`,
the file described in [state.md](./state.md). It is a Python package in `collector/` that uses the
standard library alone, and it runs as a container. Its settings are in
[configuration.md](./configuration.md).

## One poll

1. **Read.** Every enabled source is read at once, each in its own thread. The poll waits for
   them until 66 percent of the interval has passed (about 20 seconds at the default 30), and a
   source still running at that point is reported as `timed out` for this poll. It is not
   started again while that read is still running, so a source that hangs costs one thread and
   never piles up. Every network call has its own timeout as well (`http_timeout_s`).
2. **Observe.** Each source that answered turns its reading into events, comparing it with the
   markers it keeps in the memory file. This step runs in the main thread, one source after
   another.
3. **Judge.** The conditions are judged from the readings, in priority order.
4. **Write.** The collector builds the state document, checks it against the contract (a
   breach is logged, and the file is still written), and writes it to a temporary name in the
   output folder before renaming it into place. The file is mode 644 so that the web server can
   read it. The memory file is then saved if anything in it changed.

A source that fails is marked `ok: false` in `sources` with a short reason, and its `facts`
section is `null`. The error text never carries a URL, and any secret value that turns up in
it is replaced with `***` before it is written.

### Credentials refused

A service that answers 401, 403 or 429 is not called again for `auth_backoff_s` (20 minutes at
least). AdGuard Home locks an address out of its API for 15 minutes after five bad logins, and
this rule keeps the collector well short of that. The pause is kept in the memory file, so
restarting the container does not end it, and `sources` shows when it ends. Credentials are
sent with the first request: urllib's own handler would send one request without them first,
then retry.

## Conditions

Each condition has a cause, judged afresh at every poll. A condition becomes active once its
cause has held for its duration: CPU at 85 percent or more for five minutes, the second machine
silent for three minutes, two failed internet checks in a row, and so on. A container must stay
unhealthy, restarting or exited with a non-zero code for three minutes before it counts, and
each container has its own timer. Conditions with no duration (`disk_full`, `ssh_session`,
`updating`, `streaming`, `night`, `attack`) are active from the first poll that shows the cause.

`ssh_session` is raised when a new SSH session appears. A session is one established connection
to the SSH port, identified by its remote address and port. The cause is present while at least
`min_sessions` sessions are open and one of them was first seen less than `show_for_s` ago (ten
minutes by default), so a second new session extends the time. A session that closes early ends
the cause at once. The first reading after the collector starts takes every session already open
as old, so a restart raises nothing, and a poll where the source cannot be read leaves the record
of sessions as it was. With `show_for_s` at 0 the condition is up for as long as `min_sessions`
sessions are open.

A condition clears only after its cause has been absent for `clear_after_polls` further polls
(one by default). While it is held through that poll it keeps the words it last had. A source
that cannot be read counts as the cause being absent, so a dead source cannot hold a condition
up indefinitely; the per-container timers are kept through a failed read.

Memory is judged by `MemAvailable` and never by swap, which a busy host can keep full for
weeks without being short of memory.

The attack signal is a ban in one of the configured jails (`sshd` by default) within the attack
window (`window_s`, ten minutes by default), or at least `bans` bans in that window. Bans are
counted from the rise in the 24-hour ban count between polls and from changes in the last ban, so a
ban that both arrives and ages out of the 24-hour window between two polls can be missed.

The history behind all of this lives in memory and starts again when the collector restarts.

## Events

| Event | Raised when | `count` | `text` |
|---|---|---|---|
| `ad_blocked` | enough blocked queries have built up for at least one fly | the flies, at most 8 unless `fly_every_s` is 0 | empty |
| `ip_banned` | the last ban changed | 1 | `BANNED 203.0.113.77 · sshd` |
| `import` | a new import record appears in Sonarr's or Radarr's history | 1 each | `IMPORTED · The Night Shift S02E04` |
| `backup_done` | the backup log shows a completion newer than the last one seen | 1 | `BACKUP DONE 03:12` |

When a source has no markers yet, it records what is already there and raises nothing. The
markers, the event sequence number `seq` and the last 20 events are kept in `memory.json` in
the state folder, so `seq` keeps rising across restarts and anything that happened while the
collector was down is raised when it comes back. `at` is the time the collector noticed the
event.

AdGuard Home's blocked count covers a rolling window, so the count can fall when an old hour
leaves it. A fall raises nothing and resets the marker.

A fly stands for one helping of the household's normal blocking, so that normal traffic gives a
fly every `fly_every_s` (300 seconds by default) on average and a burst gives a swarm. The
normal rate is read afresh from `/control/stats` on every poll: `num_blocked_filtering` divided
by the length of AdGuard Home's statistics window, counted from the first day or hour with any
DNS queries to the current one, so a new install's mostly empty window does not understate it.
One fly is then `rate * fly_every_s` blocked queries, and never fewer than one. Each poll's rise
goes into a carry kept in memory; every whole fly's worth in the carry becomes a fly and the
remainder stays for the next poll. An event carries at most eight flies, and a bigger burst
drops the excess rather than queueing it. When the statistics give no rate (the lists missing,
empty, all zero or malformed), a fly is 50 blocked queries. No event is raised until at least
one fly is due. `fly_every_s = 0` restores one fly per blocked query, with `count` the rise.

`blocked_today` counts from local midnight in the collector's time zone. The source keeps the
date and the count in memory and adds each poll's rise, starting again from nought when the
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
| `pi` | `pi.py` | a TCP connection to each port in turn; a refusal counts as an answer | `pi` |
| `updates` | `updates.py` | the host's lock table, `/proc/locks`, and the command line of each process holding a lock | `updates` |
| `ssh` | `ssh.py` | established connections to the SSH port in `/proc/net/tcp` and `tcp6` | `ssh` |
| `streams` | `streams.py` | Tautulli's `get_activity` | `streams` |
| `adblock` | `adblock.py` | AdGuard Home's `/control/stats` | `adblock` |
| `security` | `security.py` | a fail2ban summary at `/soc` | `security` |
| `sonarr`, `radarr` | `imports.py` | the last ten import records in each one's history | none |

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
        """Runs in the main thread. Return events; keep markers in `memory`."""
        return []
```

Then:

1. Add its defaults to `SOURCE_DEFAULTS` in `collector/config.py`, with any required settings in
   `REQUIRED` and any credentials in `SECRET_FIELDS`, and register the class in
   `build_sources` in `collector/sources/__init__.py`.
2. If it brings a new `facts` section or event type, change [state.md](./state.md) and the
   lists in `collector/contract.py` in the same commit.
3. If a condition depends on it, write the cause and the words in `collector/conditions.py`.
4. Test it in `tests/collector/` against invented data. `kw_helpers.py` has a fake `/proc` and
   a local HTTP server.
5. Document its settings in [configuration.md](./configuration.md).

`fetch` must not touch `memory`, and nothing it returns may hold a secret. Use the helpers in
`collector/net.py`, which set timeouts, refuse redirects and turn failures into short messages.

## Running it

```bash
python3 -m collector --check-config     # validate config.toml and secrets.json, then exit
python3 -m collector --once             # one poll, write state.json, exit
python3 -m collector --health           # exit 1 if state.json is older than three intervals
python3 -m collector                    # poll until stopped
```

`--config` and `--secrets` name the two files. They default to the environment variables
`KNIGHTWATCH_CONFIG` and `KNIGHTWATCH_SECRETS`, and where those are unset to
`/etc/knightwatch/config.toml` and `/etc/knightwatch/secrets.json`, the paths inside the
container. The collector takes an exclusive lock on its state folder, so a second collector
pointed at the same folder exits at once.

The container definition is `compose.yaml`: a non-root user of its own (uid and gid 10001), a
read-only root filesystem, no capabilities, `no-new-privileges`, the host's network, no
published port and no Docker socket. Its health check runs `--health`. Every host path is bound
with `create_host_path: false`, so a missing path stops the container rather than leaving Docker
to create an empty folder there. [configuration.md](./configuration.md#the-collectors-account)
says how that user is given the files it needs.
