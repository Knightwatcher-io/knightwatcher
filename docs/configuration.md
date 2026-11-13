# Configuration

The collector reads three files, all ignored by git:

- `config.toml`: settings. The committed template is `config.example.toml`.
- `secrets.json`: credentials, mode 600. The committed template is `secrets.example.json`.
- `.env`: the host paths `compose.yaml` mounts.

`python3 -m collector --check-config` validates the first two and lists every problem it
finds, one per line. An unknown setting is an error, so a typo does not silently fall back to
a default. Every value on this page is invented.

## config.toml

A source runs when its `[sources.<name>]` table is present and its `enabled` is not `false`.
The `[collector]` and `[conditions]` tables can be left out entirely to take the defaults.
Durations are in seconds. Machines to watch are `[[thing]]` tables, described under
[Watched things](#watched-things).

### [collector]

| Setting | Default | Meaning |
|---|---|---|
| `interval_s` | `10` | Seconds between polls, at least 5. Also written to `state.json` as `interval_s`, and the page treats a file older than three intervals as stale. |
| `output_dir` | `"/out"` | Folder `state.json` is written to. |
| `state_dir` | `"/var/lib/knightwatcher"` | Folder for `memory.json` and the collector's lock. |
| `timezone` | `"UTC"` | IANA zone for the night hours and the times shown in words. |
| `http_timeout_s` | `5.0` | Timeout for each network call. Must be shorter than `interval_s`, so an interval of 5 needs it lowered. A watched thing's check uses at most 3 seconds of it for each step. |
| `auth_backoff_s` | `1200` | Pause after a 401, 403 or 429. Cannot be set below 1200. |
| `proc_root` | `"/host/proc"` | Where the host's `/proc` is mounted. |

### [conditions]

| Setting | Default | Meaning |
|---|---|---|
| `priority` | the order in [design.md](./design.md), with `thing_down` after `pi_silent` | Conditions, highest first. One left out is never raised, and a list that leaves out `thing_down` is refused while any watched thing alerts. |
| `clear_after_s` | `30` | How long a cause must be absent before its condition clears. Zero or more. |
| `attack.window_s` | `600` | The window for recent bans. |
| `attack.jails` | `["sshd"]` | A ban in one of these jails within the window is an attack. |
| `attack.bans` | `5` | So is this many bans of any kind within the window. |
| `wan_down.failed_checks` | `2` | Failed internet checks in a row before `wan_down`. Each check is a fresh read of the `wan` source, so they are its `every_s` apart. |
| `container_unhealthy.for_s` | `180` | How long a container must be unhealthy, restarting or exited non-zero. |
| `disk_full.pct` | `90.0` | Percent used, on any configured disk, judged on the latest reading. |
| `backup_overdue.hours` | `30.0` | Hours since the last completed backup. |
| `pi_silent.for_s` | `180` | How long the second machine must be unreachable. |
| `cpu_hot.pct` | `85.0` | CPU use, percent of all cores, averaged over the window: at or above. |
| `cpu_hot.window_s` | `30` | The window the CPU is averaged over. At least 10. |
| `memory_tight.available_pct` | `10.0` | `MemAvailable` as a percent of `MemTotal`, averaged over the window: at or below. |
| `memory_tight.window_s` | `30` | The window available memory is averaged over. At least 10. |
| `ssh_session.min_sessions` | `1` | Open SSH sessions needed. |
| `ssh_session.show_for_s` | `600` | How long a new SSH session keeps `ssh_session` up. `0` keeps it up for as long as `min_sessions` sessions are open. |
| `streaming.min_streams` | `1` | Streams playing needed. |
| `night.start`, `night.end` | `"23:00"`, `"07:00"` | Quiet hours in `timezone`, 24-hour. The window may cross midnight. |

`updating` has no settings: it is active while any configured lock holder is running.
`thing_down` has none either, since each thing carries its own pace, its own silence and whether
it alerts. An empty `[conditions.thing_down]` table is accepted for both.

`clear_after_polls`, `cpu_hot.for_s` and `memory_tight.for_s` were removed when the collector
moved to 10-second polls and averaged CPU and memory. A `config.toml` that still sets one is
refused with a message naming its replacement: `clear_after_s`, or `window_s`.
[collector.md](./collector.md#cpu-and-memory) says how the averages are worked out.

### Every source

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` turns the source off while keeping its table. |
| `every_s` | see below | How often the source is read. Between reads its last reading stands, and it raises no events. Above zero; below `interval_s` it means every poll. |

`every_s` is 10 for `host`, `ssh`, `updates` and `containers`, 60 for `backup`, and 30 for every
other source. `host` should be read at least as often as the shorter window; when it is read less
often, an average reaches back to the previous read instead.

### [sources.host]

| Setting | Default | Meaning |
|---|---|---|
| `disks` | `[]` | Disks to report, each `{ mount = "/data", path = "/host/disks/data" }`. `mount` is the label written to the file; `path` is any path inside the container on that filesystem. |

### [sources.containers]

| Setting | Default | Meaning |
|---|---|---|
| `url` | required | Base URL of a read-only Docker API proxy, such as `http://192.0.2.10:2375`. |
| `ignore` | `[]` | Container names to leave out, as shell patterns such as `"*-run-*"`. Use it for one-off and intentionally stopped containers. |

### [sources.wan]

| Setting | Default | Meaning |
|---|---|---|
| `urls` | `["https://1.1.1.1/cdn-cgi/trace"]` | Tried in turn; the internet is up if any answers with a 2xx. An address avoids depending on DNS. |

### [sources.dns]

| Setting | Default | Meaning |
|---|---|---|
| `server` | `"127.0.0.1"` | DNS server to ask. |
| `port` | `53` | Its port. |
| `name` | `"example.com"` | Name to look up. An answer of no error or of "no such name" counts as up. |

### [sources.backup]

| Setting | Default | Meaning |
|---|---|---|
| `log` | `"/host/backup.log"` | The backup log, inside the container. |
| `pattern` | `'System Backup Completed: (.+)$'` | Regular expression for a completion line; its first group is the date. |
| `timezone` | `"UTC"` | Zone for a date printed without one. |
| `read_bytes` | `262144` | How much of the end of the log to read. |

The date may be ISO 8601 or the form `date` prints, such as `Thu 15 Jan 03:12:00 UTC 2026`.

### [sources.pi]

| Setting | Default | Meaning |
|---|---|---|
| `host` | required | Address of the second machine, such as `192.0.2.4`. |
| `ports` | `[22]` | TCP ports to try, all at once. A refused connection counts as an answer. |

This is the older way to name the Pi, and it stays with no end date. The Pi becomes the first
watched thing, named `Pi` and of kind `pi`, with the rules it has always had: any number of
ports, a refused connection as an answer, its own `every_s`, and `conditions.pi_silent.for_s` as
the silence that makes it down. It raises `pi_silent` with its own words, and only while the
priority list names `pi_silent`; it never needs `thing_down`. See
[Watched things](#watched-things).

### [sources.updates]

| Setting | Default | Meaning |
|---|---|---|
| `holders` | required | Each `{ name = "nightly maintenance", pattern = 'nightly-maintenance\.sh' }`. While a process whose command line matches `pattern` holds any lock, `name` is reported as running. |

### [sources.ssh]

| Setting | Default | Meaning |
|---|---|---|
| `port` | `22` | The SSH server's port. |
| `ignore_sources` | `[]` | Address ranges whose sessions are not counted, such as `"198.51.100.0/24"`. |

### [sources.streams], [sources.adblock], [sources.sonarr], [sources.radarr]

| Setting | Default | Meaning |
|---|---|---|
| `url` | required | Base URL: Tautulli, AdGuard Home, Sonarr or Radarr. |
| `secret` | `"tautulli"`, `"adguard"`, `"sonarr"`, `"radarr"` | Section of `secrets.json` holding its credentials. |

`[sources.adblock]` takes one more:

| Setting | Default | Meaning |
|---|---|---|
| `fly_every_s` | `300` | Average seconds between flies while blocking runs at the household's normal rate, which AdGuard Home's own statistics give. A burst brings flies faster, at most eight to an event. `0` sends one fly for every blocked query. Zero or more. |

### [sources.security]

| Setting | Default | Meaning |
|---|---|---|
| `url` | required | Base URL of the fail2ban summary; the collector calls `/soc` on it. |

### Watched things

Each `[[thing]]` table, at the top level of `config.toml`, is one machine on the network to
watch: a NAS, a camera, a laptop, a virtual machine. Each is checked at its own pace and counts as
down once it has been silent for its `down_after_s`. The collector lists them in the state file,
in the order of the tables, for the page to draw as props in the scene, six at most, with the
prop of a thing that is down changed. A thing that alerts also raises `thing_down` while it is
down. There can be 32 things, the Pi of `[sources.pi]` included, and those the page does not
draw are checked and alert as usual. The page in this repository does not draw watched things
or act on `thing_down` yet; until it does, only the Pi's pie shows on the display.

```toml
# A NAS on the main LAN. Alerts after the default three minutes of silence.
[[thing]]
name = "Vault"
kind = "machine"
host = "192.0.2.40"
port = 445
```

`config.example.toml` ends with three such tables, commented out: this one, a camera checked by
its web page, and a laptop that never alerts.

| Setting | Default | Meaning |
|---|---|---|
| `name` | required | What the display calls it: 1 to 20 printable ASCII characters, with no space at either end, unique among the things ignoring case. |
| `kind` | required | `pi`, `camera`, `machine` or `vm`. Chooses the headline's word, and the prop the page draws. |
| `host` | none | Address or name to connect to. Required with `port` or `ports`. |
| `port` | none | One TCP port, 1 to 65535. |
| `ports` | none | 1 to 3 TCP ports, tried at the same time; any one answering is enough. |
| `url` | none | An `http://` or `https://` address. Any HTTP status counts as an answer. |
| `refused_counts` | `false` | With `host`: `true` counts a refused connection as an answer. |
| `verify_tls` | `false` | With an `https` `url`: `true` checks the certificate. |
| `every_s` | `30` | Seconds between checks, 10 to 3600. |
| `down_after_s` | `180` | Seconds of silence before the thing counts as down, from `every_s` to 86400. |
| `alert` | `true` | `true` also raises `thing_down` while the thing is down. |
| `enabled` | `true` | `false` keeps the table, stops the checks and leaves the thing out of the state file. |

A thing has exactly one check: `host` with `port` or `ports`, or `url`. `refused_counts` is
refused beside a `url`, and `verify_tls` beside anything but an `https` `url`.

**A port.** The collector opens a TCP connection to each port at the same time, and the thing
has answered if any is accepted. A refused connection counts only with `refused_counts = true`.
It is off by default because a firewall between VLANs can refuse on a machine's behalf: a rule
that rejects with a TCP reset answers for an address whether or not the machine behind it is
on, and the thing would never go down. `refused_counts = true` suits a machine on the same
network segment whose own firewall refuses closed ports, such as a laptop with nothing
listening.

**A web address.** The collector sends one `GET`, waits for the status line, and closes the
connection without reading the body. Any status is an answer: a camera's `401` login page and a
NAS's `302` to its login screen both mean the machine is there, and a redirect is not followed.
No credentials are ever sent, and an address with a user name or password in it is refused. The
request goes direct, never through a proxy named in the environment. With `verify_tls = false`
the TLS handshake must complete but the certificate is not checked, since cameras and NAS boxes
almost always carry a self-signed one. A device that speaks only a TLS version the system no
longer accepts never completes the handshake; check its port with `host` and `port` instead.

**Time.** Each step of a check has up to `min(3, http_timeout_s)` seconds: looking up a name,
connecting, and for a web address the TLS handshake and the status line. A check that runs out of
time counts as no answer.

**What the collector can reach.** It runs on the host's network (`network_mode: host` in
`compose.yaml`), so it reaches exactly what the host reaches: the same routes, the same source
address, the same firewall on the way out. A thing on another VLAN is reachable when the router
between the VLANs lets the host's address through to that port and lets the reply back.
`127.0.0.1` is the host itself. The container has no capabilities, so there is no ping. A name in
`host` or `url` is looked up by the host's resolver, and a lookup that takes longer than the
check's time counts as no answer, so an address is the better choice: it needs no lookup and
cannot be held up by a slow resolver.

**Names.** The headline puts the name in capitals before a word of 4 to 6 letters within 16
characters, so a name of up to 11 characters shows whole beside `DOWN` and `DARK`, and up to 9
beside `SILENT`. A longer name is cut with an ellipsis in the headline (`Gatehouse camera`
becomes `GATEHOUSE… DARK`) and is given whole in the detail. Names are ASCII because the display
font's coverage past it has not been checked. The name is also the thing's key in the state
file's `sources`, `thing:<name>`, so renaming a thing starts its record afresh.

**The Pi.** A configuration with `[sources.pi]` has the Pi as its first thing (see
[`[sources.pi]`](#sourcespi)), and a `[[thing]]` named `Pi`, or one watching the Pi's `host`, is
refused so that the Pi is not drawn twice. The comparison is of the text as written, so the same
machine under another name or address is not caught. Moving to the new form is optional: a
`[[thing]]` named `Pi`, of kind `pi`, with `refused_counts = true` and `down_after_s = 180`, has
the same prop and still reads `PI SILENT`, but it raises `thing_down` rather than `pi_silent`, so
the priority list must name `thing_down`, and it writes no `facts.pi`, which a page from before
watched things needs for its pie.

**Checking.** `check-config` names each problem in a table by its place among the tables,
counted from 0, as in `thing[2].name: "vault" is already the name of thing[0]`. A mistake in any
table stops the collector from starting, as any other configuration error does. A priority list
that leaves out `thing_down` while a thing alerts is refused with a message that says where to
add it:

```
config: conditions.priority: leaves out "thing_down", so Vault and Gate cam would never alert; add it after "pi_silent", or set alert = false on them
```

[collector.md](./collector.md#watched-things) says how a thing is judged down and what the
headline and the detail say.

## secrets.json

One section per service, read once when the collector starts.

```json
{
  "adguard": { "username": "knightwatcher", "password": "an-invented-password" },
  "tautulli": { "api_key": "0123456789abcdef0123456789abcdef" },
  "sonarr": { "api_key": "fedcba9876543210fedcba9876543210" },
  "radarr": { "api_key": "00112233445566778899aabbccddeeff" }
}
```

Only the sections of enabled sources are needed. Several of these services offer no read-only
credential, so treat the file as you would their own configuration. See
[security.md](./security.md).

## .env

`compose.yaml` takes its host paths from `.env` beside it, and refuses to start when a required
one is missing.

| Variable | Example | Mounted at |
|---|---|---|
| `KNIGHTWATCHER_OUT` | `/srv/www/knightwatcher/data` | `/out`, where `state.json` is written. Must exist and be writable by the collector's account. |
| `KNIGHTWATCHER_BACKUP_LOG` | `/var/log/backup.log` | `/host/backup.log`, read-only. |
| `KNIGHTWATCHER_DATA_DISK` | `/data/lost+found` | `/host/disks/data`, read-only. Any folder on the data volume works; an empty one shares nothing but the volume's size. |
| `KNIGHTWATCHER_VAR` | `./var` (the default) | `/var/lib/knightwatcher`, the memory file. Must exist and be writable by the collector's account. |

`config.toml`, `secrets.json` and the host's `/proc` are mounted from fixed places: the first
two from beside `compose.yaml`, read-only, at `/etc/knightwatcher/`, and `/proc` read-only at
`/host/proc`.

## The collector's account

The container runs as uid and gid 10001, an account that exists only inside the image and owns
nothing on the host. It needs to read `secrets.json` and to write in the output folder and the
memory folder. Access control lists grant that without root, as long as you own the files, and
leave their owner and mode alone:

```bash
setfacl -m u:10001:r secrets.json
setfacl -m u:10001:rwx var /srv/www/knightwatcher/data
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var /srv/www/knightwatcher/data
```

The third line sets the default for files made in the two folders from then on, and names your
own uid as well so that you can still read what the collector writes. Files already there from
an earlier run under another uid need the grant once: `setfacl -m u:10001:rw` on each. Stop that
earlier collector first, since every file it rewrites comes back without the grant.
`config.toml` and the backup log only need to be readable by everyone, and `/proc` needs nothing.

To run it under another uid, change `user:` in `compose.yaml` and grant that uid instead.
