# Configuration

The collector reads three things, all ignored by git:

- `config.toml`: settings. The committed template is `config.example.toml`.
- `secrets.json`: credentials, mode 600. The committed template is `secrets.example.json`.
- `.env`: the host paths `compose.yaml` mounts.

`python3 -m collector --check-config` validates the first two and lists every problem it
finds, one per line. An unknown setting is an error, so a typo does not silently fall back to
a default. Every value on this page is invented.

## config.toml

A source runs when its `[sources.<name>]` table is present and its `enabled` is not `false`.
The `[collector]` and `[conditions]` tables can be left out entirely to take the defaults.

### [collector]

| Setting | Default | Meaning |
|---|---|---|
| `interval_s` | `30` | Seconds between polls. Also written to `state.json` as `interval_s`. |
| `output_dir` | `"/out"` | Folder `state.json` is written to. |
| `state_dir` | `"/var/lib/knightwatch"` | Folder for `memory.json` and the collector's lock. |
| `timezone` | `"UTC"` | IANA zone for the night hours and the times shown in words. |
| `http_timeout_s` | `5.0` | Timeout for each network call. Must be shorter than `interval_s`. |
| `auth_backoff_s` | `1200` | Pause after a 401, 403 or 429. Cannot be set below 1200. |
| `proc_root` | `"/host/proc"` | Where the host's `/proc` is mounted. |

### [conditions]

| Setting | Default | Meaning |
|---|---|---|
| `priority` | the order in [design.md](./design.md) | Conditions, highest first. One left out is never raised. |
| `clear_after_polls` | `1` | Further polls a cause must be absent before its condition clears. |
| `attack.window_s` | `600` | The window for recent bans. |
| `attack.jails` | `["sshd"]` | A ban in one of these jails within the window is an attack. |
| `attack.bans` | `5` | So is this many bans of any kind within the window. |
| `wan_down.failed_checks` | `2` | Failed internet checks in a row before `wan_down`. |
| `container_unhealthy.for_s` | `180` | How long a container must be unhealthy, restarting or exited non-zero. |
| `disk_full.pct` | `90.0` | Percent used, on any configured disk. |
| `backup_overdue.hours` | `30.0` | Hours since the last completed backup. |
| `pi_silent.for_s` | `180` | How long the second machine must be unreachable. |
| `cpu_hot.pct` | `85.0` | CPU use, percent of all cores. |
| `cpu_hot.for_s` | `300` | How long it must last. |
| `memory_tight.available_pct` | `10.0` | `MemAvailable` as a percent of `MemTotal`, at or below. |
| `memory_tight.for_s` | `300` | How long it must last. |
| `ssh_session.min_sessions` | `1` | Open SSH sessions needed. |
| `ssh_session.show_for_s` | `600` | How long a new SSH session keeps `ssh_session` up. `0` keeps it up for as long as `min_sessions` sessions are open. |
| `streaming.min_streams` | `1` | Streams playing needed. |
| `night.start`, `night.end` | `"23:00"`, `"07:00"` | Quiet hours in `timezone`, 24-hour. The window may cross midnight. |

`updating` has no settings: it is active while any configured lock holder is running.

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
| `ports` | `[22]` | TCP ports to try in turn. A refused connection counts as an answer. |

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

## secrets.json

One section per service, read once when the collector starts.

```json
{
  "adguard": { "username": "knightwatch", "password": "an-invented-password" },
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
| `KNIGHTWATCH_OUT` | `/srv/www/knightwatch/data` | `/out`, where `state.json` is written. Must exist and be writable by the collector's account. |
| `KNIGHTWATCH_BACKUP_LOG` | `/var/log/backup.log` | `/host/backup.log`, read-only. |
| `KNIGHTWATCH_DATA_DISK` | `/data/lost+found` | `/host/disks/data`, read-only. Any folder on the data volume works; an empty one shares nothing but the volume's size. |
| `KNIGHTWATCH_VAR` | `./var` (the default) | `/var/lib/knightwatch`, the memory file. Must exist and be writable by the collector's account. |

`config.toml`, `secrets.json` and the host's `/proc` are mounted from fixed places: the first
two from beside `compose.yaml`, read-only, at `/etc/knightwatch/`, and `/proc` read-only at
`/host/proc`.

## The collector's account

The container runs as uid and gid 10001, an account that exists only inside the image and owns
nothing on the host. It needs to read `secrets.json` and to write in the output folder and the
memory folder. Access control lists grant that without root, as long as you own the files, and
leave their owner and mode alone:

```bash
setfacl -m u:10001:r secrets.json
setfacl -m u:10001:rwx var /srv/www/knightwatch/data
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var /srv/www/knightwatch/data
```

The third line sets the default for files made in the two folders from then on, and names your
own uid as well so that you can still read what the collector writes. Files already there from
an earlier run under another uid need the grant once: `setfacl -m u:10001:rw` on each. Stop that
earlier collector first, since every file it rewrites comes back without the grant.
`config.toml` and the backup log only need to be readable by everyone, and `/proc` needs nothing.

To run it under another uid, change `user:` in `compose.yaml` and grant that uid instead.
