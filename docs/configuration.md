# Configuration

Knightwatcher is configured in two files beside `compose.yaml`, both ignored by git:

- `config.toml`: every setting of the collector and the household defaults of the displays. The
  committed template is `config.example.toml`.
- `.env`: the host paths `compose.yaml` mounts, the address and port of the bundled server, the
  admin page's password, and the credentials of the services the collector reads. The committed
  template is `.env.example`. Keep it to yourself: `chmod 600 .env`.

Every setting of `config.toml` but the folders and the credentials' names can also be set on the
bundled server's admin page, from any browser, behind the admin password
([server.md](./server.md#the-admin-page)). What is set there is kept by the server in a file of its
own, and so is what the displays' settings screens choose, for the whole deployment
([server.md](./server.md#the-admin-store)); `config.toml` supplies the level under both.

Every setting and every variable is described in one file, `collector/settings-schema.json`: its
type, the values it may take, its default, and what it does. The collector checks `config.toml`
against it, the page takes its lists and its own defaults from it, and [the reference
below](#every-setting) is made from it. Every value on this page is invented.

## How settings work

### Where a display's settings come from

A display's look, its display preferences, its quiet scenes and the scene each offered condition
plays in are its settings. Each comes from four levels, highest first, key by key:

1. **The page's address.** Its hooks (`sk=`, `hc=`, `mon=`, `ck=` and the rest, in
   [display.md](./display.md#the-address)) win while the address holds them, so that screenshots look
   the same whatever is saved.
2. **The saved settings**, chosen on any display's settings screen (a press and hold of two
   seconds). Served by the bundled server, they are the deployment's: the server keeps them, and
   every display shows the same. Nothing differs from one display to the next, and the screen
   needs no code to save. With no server (the page opened from disk, the website's demo, or the
   page served by a web server of your own), each browser keeps its own.
3. **The household defaults** in the `[look]`, `[display]`, `[quiet]` and `[scenes]` tables of
   `config.toml`, which the collector copies into `state.json`. The settings screen's "Use the
   config default" goes back to these.
4. **The page's own**, the "page's own" in the reference: the medieval world, which is the base
   pack's defaults for the knight, monarch A with each monarch's own colours, the goblin, the fly,
   the medieval devices, words and overlay, all four quiet scenes, and each condition in its own
   scene; with a medium headline, a 24-hour clock, the helmet off indoors and ten minutes for each
   quiet scene.

A value a level holds that the page does not know is ignored at that level, and the next one down
is used. So is a long name, `"<pack>/<id>"`, of something the display has not loaded.
[display.md](./display.md#settings) has the details.

**A world** (`world` in `[look]`) sets every part at once: the look's other keys, the quiet scenes
and the scene of each condition. It counts as setting each of them at the level it was chosen at.
A part set at the same level or above keeps its own value; a part set only at a level below gives
way to the world. So `world` and `tabard` side by side in `config.toml` give that world in that
tabard, while a display that chooses a world on its settings screen takes it whole, whatever
`config.toml` says about single parts. The display's preferences (`[display]`) and the quiet scenes'
length are not parts, and no world changes them. With no level choosing a world, the medieval
world is the page's own, and every part set anywhere wins over it, as before there were worlds.

The admin page sets the same household defaults through the same store, so a choice made there
is a saved setting like any display's, and a choice made on a display shows on the admin page as
Set here.

### Where the collector's settings come from

Every other setting (the collector, the conditions, the sources and the devices) has three
levels, highest first, path by path:

1. **Set on the admin page**, kept by the bundled server in `admin.json`.
2. **`config.toml`.**
3. **The default** in the reference below, when the file leaves the setting out.

A list is one value: set on the admin page, it replaces `config.toml`'s list whole, and its Reset
puts the file's list back. The devices are one list in the same way: once set there, the
page's list is the list, and a `[[device]]` added to `config.toml` afterwards is not used until the
page's list is reset. A source that `config.toml` does not set up can be set up on the page, and
gets a table of its own there. The folders (`output_dir`, `state_dir`, `proc_root`), the backup
log's path and each source's `secret` are set in `config.toml` alone, since they follow what
`compose.yaml` mounts and passes.

The admin page's Download config.toml writes every setting as the collector uses it into one
`config.toml`, comments included and credentials left out, to keep what was set there in the file.
Put everything back, at the foot of its `.env` section, clears everything set there and on the
displays' screens, so that `config.toml` and the defaults rule again.

### .env: host paths, the server's address and credentials

`compose.yaml` reads `.env` beside it. The host paths become the containers' mounts, and
`compose.yaml` refuses to start while a required one is missing. `KNIGHTWATCHER_SERVER_ADDRESS`
and `KNIGHTWATCHER_SERVER_PORT` say where the bundled server is published on the host: all
addresses and port 8080 unless set ([server.md](./server.md#security) says when to narrow it).
Each credential is passed to the collector's container by name, so the container gets those
variables and nothing else from the file, and the server gets none. The server gets one variable,
`KNIGHTWATCHER_ADMIN_PASSWORD`, the admin page's password: left empty, or shorter than 12
characters, the admin page stays off and says why, and the walls work as before. A credential that no enabled
source needs may be left empty or out; the collector's check names any it needs and lacks.

A source that logs in reads its credentials from `KNIGHTWATCHER_<SECRET>_<FIELD>`, in capitals,
where `SECRET` is the source's `secret` setting (`tautulli`, `adguard`, `sonarr` or `radarr`
unless set). A source given `secret = "sonarr_4k"` therefore reads
`KNIGHTWATCHER_SONARR_4K_API_KEY`, and that name must be added to the `environment` list in
`compose.yaml` too.

Values are written as docker compose reads them: one `NAME=value` a line, `#` for a comment. A
value holding `$`, `#`, a space or a quote goes in single quotes, such as `'pa$$ word#1'`, so that
compose takes it exactly as written. Several of these services offer no read-only credential, so
treat `.env` as you would their own configuration; see [security.md](./security.md).

### When a change applies

- **A change on the admin page** is checked by the collector's own rules before the server keeps
  it, and the collector takes it up at the start of its next poll, within one interval, with no
  restart: sources started and stopped, devices added, removed and reordered, the interval
  rescheduled. The page says when the collector reports it in use. A choice of look, display,
  quiet scenes or scenes reaches every display as a settings screen's does.
- **`config.toml`** is read when the collector starts, and again at the start of any poll after
  the file has been written in place. An editor that saves by writing a new file and renaming it
  over the old one leaves the container reading the old file, since `compose.yaml` mounts the one
  file; restart the collector after such a save: `docker compose restart collector`. A change
  that the collector's checks refuse while it runs is not taken up: it keeps the settings it has,
  says why in the state file and on the admin page, and refuses to start on the file until it is
  put right. The household defaults reach the displays in the next state file, and a setting
  saved on a screen or the admin page stays over them.
- **`.env`** is read by docker compose when it creates the containers, so a changed path,
  address, port, admin password or credential needs them made again: `docker compose up -d`. A
  plain restart keeps the old values. A new admin password signs every browser out.
- **A choice on a settings screen** applies at once on that display. With the bundled server it
  reaches every other display at its next poll of the server, within about five seconds, and that
  display reloads to show it. Without it, it stays on that display.

### Checking

```bash
python3 -m collector --check-config --config config.toml --env-file .env
```

checks `config.toml` and the credentials it needs and lists every problem it finds, one per
line, then exits 2; with none it prints `config ok:` and the sources and devices it will read. It
checks `config.toml` alone, which is what the collector needs to start: what is set on the admin
page is checked by the server before it is kept, and laid over the file once the collector has
started on it ([collector.md](./collector.md#taking-up-a-change)). An
unknown setting is an error, so a typo does not silently fall back to a default. Without
`--env-file` the credentials are taken from the process's environment, as they are inside the
container. A message names a missing credential by its variable and never shows a value:

```
config: .env: KNIGHTWATCHER_ADGUARD_PASSWORD missing (for adblock)
```

`--env-file` reads the file for the check alone, without expanding anything in it, so a
deployment can check a new collector against the host's `.env` before starting it. A line it
cannot read is named by its number, never by what it holds.

## Every setting

This part is written from `collector/settings-schema.json` by `node tools/settings-schema.js`;
change the schema and run the tool rather than editing it here. Durations are in seconds. The
scope says who a setting belongs to: `household` settings are only ever set in `config.toml`, and
`display` settings are the default under what the settings screens choose.

<!-- settings-reference:start -->

### [collector]

How the collector runs. The whole table may be left out to take the defaults.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `interval_s` | a whole number of seconds, at least 5 | `10` | household | Seconds between polls. The displays treat a state file older than three polls as stale and say so. |
| `output_dir` | a folder inside the container | `"/out"` | household | Folder state.json is written to. compose.yaml mounts KNIGHTWATCHER_OUT here. |
| `state_dir` | a folder inside the container | `"/var/lib/knightwatcher"` | household | Folder for memory.json and the collector's lock. compose.yaml mounts KNIGHTWATCHER_VAR here. |
| `timezone` | an IANA time zone, such as "Europe/London" | `"UTC"` | household | Zone for the night hours and the times shown in words. |
| `http_timeout_s` | a number of seconds, above zero | `5.0` | household | Timeout for each network call. Must be shorter than the time between polls, so a poll every 5 seconds needs it lowered. A device's check uses at most 3 seconds of it for each step. |
| `auth_backoff_s` | a whole number of seconds, at least 1200 | `1200` | household | Pause after a 401, 403 or 429 before the service is called again. Cannot be set below 1200. |
| `proc_root` | a folder inside the container | `"/host/proc"` | household | Where the host's /proc is mounted, for CPU, memory, load and the lock table. |

### [conditions]

When each condition is raised. The whole table, and each condition's own table, may be left out to take the defaults.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `priority` | condition ids, each once | `["attack", "wan_down", "container_unhealthy", "disk_full", "backup_overdue", "pi_silent", "device_down", "cpu_hot", "memory_tight", "ssh_session", "updating", "streaming", "night"]` | household | Conditions, highest first. One left out is never raised. Device down (device_down) must stay in the list while any device alerts. |
| `clear_after_s` | a whole number of seconds, zero or more | `30` | household | How long a cause must be absent before its condition clears. |

### [conditions.attack]

Under attack: a ban in a watched jail, or enough bans of any kind, within the window.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `window_s` | a whole number of seconds, above zero | `600` | household | The window for recent bans. |
| `jails` | fail2ban jail names | `["sshd"]` | household | A ban in one of these jails within the window is an attack. |
| `bans` | a whole number, at least 1 | `5` | household | So is this many bans of any kind within the window. |

### [conditions.wan_down]

WAN down: the internet checks fail several times in a row.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `failed_checks` | a whole number, at least 1 | `2` | household | Failed internet checks in a row before the WAN counts as down. Each check is a fresh read of the internet source, so they are as far apart as it is read. |

### [conditions.container_unhealthy]

Unwell: a container is unhealthy, restarting or exited with an error for a while.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `for_s` | a whole number of seconds, zero or more | `180` | household | How long a container must be unhealthy, restarting or exited non-zero. |

### [conditions.disk_full]

Disk full: a configured disk is fuller than the threshold.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `pct` | a percentage, above 0, at most 100 | `90.0` | household | Percent used, on any configured disk, judged on the latest reading. |

### [conditions.backup_overdue]

Backup overdue: the last completed backup is too long ago.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `hours` | a number of hours, above zero | `30.0` | household | Hours since the last completed backup. |

### [conditions.pi_silent]

Pi silent: the Pi of [sources.pi] has not answered for a while.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `for_s` | a whole number of seconds, zero or more | `180` | household | How long the second machine must be unreachable. |

### [conditions.device_down]

A device down. It has no settings here: each device carries its own pace, its own silence and whether it alerts. An empty table is accepted.

### [conditions.cpu_hot]

Running hot: CPU use, averaged over the window, is at or above the threshold.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `pct` | a percentage, above 0, at most 100 | `85.0` | household | CPU use, percent of all cores, averaged over the window: at or above. |
| `window_s` | a whole number of seconds, at least 10 | `30` | household | The window the CPU is averaged over. |

### [conditions.memory_tight]

Memory tight: available memory, averaged over the window, is at or below the threshold.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `available_pct` | a percentage, above 0, at most 100 | `10.0` | household | Memory available, as a percent of all memory, averaged over the window: at or below. |
| `window_s` | a whole number of seconds, at least 10 | `30` | household | The window available memory is averaged over. |

### [conditions.ssh_session]

At court: someone has an SSH session open.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `min_sessions` | a whole number, at least 1 | `1` | household | Open SSH sessions needed. |
| `show_for_s` | a whole number of seconds, zero or more | `600` | household | How long a new SSH session keeps the condition up. 0 keeps it up for as long as the sessions it needs are open. |

### [conditions.updating]

Updating. It has no settings: it is active while any configured lock holder is running. An empty table is accepted.

### [conditions.streaming]

Now showing: a stream is playing.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `min_streams` | a whole number, at least 1 | `1` | household | Streams playing needed. |

### [conditions.night]

Night watch: the quiet hours, in the collector's timezone.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `start` | HH:MM, 24-hour | `"23:00"` | household | Start of the quiet hours, in the collector's timezone. The hours may cross midnight. |
| `end` | HH:MM, 24-hour | `"07:00"` | household | End of the quiet hours. |

### [sources.host]

CPU, memory and load from the host's /proc, and the size of each configured disk.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `10` | household | How often the source is read. Should be at least as often as the shorter averaging window; when it is read less often, an average reaches back to the previous read instead. |
| `disks` | tables of mount and path, such as { mount = "/data", path = "/host/disks/data" } | `[]` | household | Disks to report. mount is the label written to the file; path is any path inside the container on that filesystem. |

### [sources.containers]

Container health, from a read-only Docker API proxy.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `10` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of a read-only Docker API proxy, such as http://192.0.2.10:2375. |
| `ignore` | shell patterns, such as "*-run-*" | `[]` | household | Container names to leave out. Use it for one-off and intentionally stopped containers. |

### [sources.wan]

Whether the internet answers.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `urls` | one or more http:// or https:// addresses | `["https://1.1.1.1/cdn-cgi/trace"]` | household | Tried in turn; the internet is up if any answers with a 2xx. An address avoids depending on DNS. |

### [sources.dns]

Whether the DNS server answers.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `server` | an address | `"127.0.0.1"` | household | DNS server to ask. |
| `port` | a whole number | `53` | household | Its port. |
| `name` | a domain name | `"example.com"` | household | Name to look up. An answer of no error or of "no such name" counts as up. |

### [sources.backup]

The last completed backup, from the backup log.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `60` | household | How often the source is read. |
| `log` | a file inside the container | `"/host/backup.log"` | household | The backup log, inside the container. compose.yaml mounts KNIGHTWATCHER_BACKUP_LOG here. |
| `pattern` | a regular expression with one group | `"System Backup Completed: (.+)$"` | household | Regular expression for a completion line; its first group is the date, in ISO 8601 or the form date prints, such as Thu 15 Jan 03:12:00 UTC 2026. |
| `timezone` | an IANA time zone | `"UTC"` | household | Zone for a date printed without one. |
| `read_bytes` | a whole number of bytes | `262144` | household | How much of the end of the log to read. |

### [sources.pi]

The older way to watch a second machine, kept with no end date: it becomes the first device, named Pi, with the rules it has always had.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `host` | an address or a name | required | household | Address of the second machine, such as 192.0.2.4. |
| `ports` | one or more TCP port numbers | `[22]` | household | TCP ports to try, all at once. A refused connection counts as an answer. |

### [sources.updates]

Whether a lock holder, such as nightly maintenance, is running.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `10` | household | How often the source is read. |
| `holders` | tables of name and pattern, such as { name = "nightly maintenance", pattern = 'nightly-maintenance\.sh' } | required | household | While a process whose command line matches pattern holds any lock, name is reported as running. |

### [sources.ssh]

Open SSH sessions.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `10` | household | How often the source is read. |
| `port` | a whole number | `22` | household | The SSH server's port. |
| `ignore_sources` | address ranges, such as "198.51.100.0/24" | `[]` | household | Address ranges whose sessions are not counted. |

### [sources.streams]

Streams playing, from Tautulli.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of Tautulli. |
| `show` | `"names"`, `"titles"` or `"count"` | `"names"` | household | What of the streams leaves the collector, for a display guests can see: names, who is watching and what; titles, what alone; count, how many and nothing else. A name or title held back is never written to the state file. |
| `secret` | letters, digits and underscores | `"tautulli"` | household | The name its credential is read under in .env: KNIGHTWATCHER_<SECRET>_API_KEY, in capitals. Set in config.toml alone. |

### [sources.adblock]

Blocked adverts, from AdGuard Home.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of AdGuard Home. |
| `secret` | letters, digits and underscores | `"adguard"` | household | The name its credentials are read under in .env: KNIGHTWATCHER_<SECRET>_USERNAME and KNIGHTWATCHER_<SECRET>_PASSWORD, in capitals. Set in config.toml alone. |
| `fly_every_s` | a number of seconds, zero or more | `300.0` | household | Average seconds between flies while blocking runs at the household's normal rate, which AdGuard Home's own statistics give. A burst brings flies faster, at most eight to an event. 0 sends one fly for every blocked query. |

### [sources.security]

Bans and the threat score, from a fail2ban summary.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of the fail2ban summary; the collector calls /soc on it. |

### [sources.sonarr]

Episodes imported, from Sonarr.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of Sonarr. |
| `secret` | letters, digits and underscores | `"sonarr"` | household | The name its API key is read under in .env: KNIGHTWATCHER_<SECRET>_API_KEY, in capitals. Set in config.toml alone. |

### [sources.radarr]

Films imported, from Radarr.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `enabled` | `true` or `false` | `true` | household | Whether the source is read. Off (false in config.toml) keeps its other settings for when it is turned on again. |
| `every_s` | a whole number of seconds, above zero | `30` | household | How often the source is read. |
| `url` | an http:// or https:// address | required | household | Base URL of Radarr. |
| `secret` | letters, digits and underscores | `"radarr"` | household | The name its API key is read under in .env: KNIGHTWATCHER_<SECRET>_API_KEY, in capitals. Set in config.toml alone. |

### [[device]]

Machines on the network to watch, each a [[device]] table at the top level of config.toml. There can be 32, the Pi of [sources.pi] included. A device has exactly one check: an address with one or more ports (host with port or ports), or a web address (url).

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `name` | 1 to 20 printable ASCII characters, with no space at either end | required | household | What the display calls it. Unique among the devices, ignoring case. |
| `kind` | `"pi"`, `"camera"`, `"machine"` or `"vm"` | required | household | Chooses the headline's word, and the prop the page draws. |
| `host` | an address or a name | none | household | Address or name to connect to. Required with port or ports. |
| `port` | a whole number, from 1 to 65535 | none | household | One TCP port. |
| `ports` | 1 to 3 port numbers from 1 to 65535 | none | household | TCP ports tried at the same time; any one answering is enough. |
| `url` | an http:// or https:// address | none | household | Any HTTP status counts as an answer. No user name or password in it. |
| `refused_counts` | `true` or `false` | `false` | household | Whether a refused connection counts as an answer. Only with host. |
| `verify_tls` | `true` or `false` | `false` | household | Whether the certificate is checked. Only with an https url. |
| `every_s` | a whole number of seconds, from 10 to 3600 | `30` | household | Seconds between checks. |
| `down_after_s` | a whole number of seconds, from every_s to 86400 | `180` | household | Seconds of silence before the device counts as down. |
| `alert` | `true` or `false` | `true` | household | Whether the device raises Device down (device_down) while it is down. |
| `enabled` | `true` or `false` | `true` | household | Whether the device is checked. Off (false in config.toml) keeps it in the list, stops its checks and leaves it off the displays. |

### [look]

The world, and the parts it sets: the knight, the monarch at court, the cast, the devices and the words, for every display. A choice made on a wall's settings screen or the admin page is saved over this table, for the whole deployment. The short names of the colours, tones, hair styles and gear are those of the base pack; another loaded pack's are given by long name. A long name, "<pack>/<id>", is checked here only for its form; a display that has not loaded it uses the next level down.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `world` | `"medieval"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"medieval"` | display | The world the display shows, which sets every part below at once: medieval, the world the page ships with, or a world of a loaded pack by its long name, "<pack>/<world>". A part set beside the world in this table, or chosen on a display, is kept over the world's; a display that chooses a world takes it whole, over the parts this table sets. |
| `build` | `"a"`, `"b"` or `"c"`, or a long name, `"<pack>/<id>"` | none | display | The knight's build, by the base pack's names: Classic (a), the present knight, Broad (b) and Slim (c), or a body of a loaded pack by its long name, "<pack>/<build>". The page's own is the base pack's default build, and only a build the packs in use declare is shown. |
| `weapon` | `"greatsword"`, `"sword_and_shield"`, `"longsword"`, `"mace_and_shield"` or `"crossbow"` | none; the page's own is `"greatsword"` | display | What the knight carries: the greatsword, the longsword or the crossbow in both hands, or the arming sword (sword_and_shield) or the flanged mace (mace_and_shield) in one hand with the shield in the other. The crossbow is shot where the others are swung. |
| `skin` | `"fair"`, `"warm"`, `"golden"`, `"tan"`, `"brown"` or `"deep"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"warm"` | display | The knight's skin tone, or a skin swatch of a loaded pack by its long name, "<pack>/<swatch>". |
| `hair` | `"black"`, `"dark"`, `"brown"`, `"auburn"`, `"blonde"` or `"silver"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"brown"` | display | The knight's hair colour, or a hair swatch of a loaded pack by its long name, "<pack>/<swatch>". |
| `hair_style` | `"short"`, `"tied"`, `"curls"`, `"long"` or `"close"` | none; the page's own is `"short"` | display | The knight's hair. |
| `tabard` | `"blue"`, `"forest"`, `"violet"`, `"wine"`, `"teal"` or `"sable"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"blue"` | display | The tabard's colour, which the shields' fields, the coat under the breastplate, the gambeson, the padded sleeves and the short cape take too; or a tabard swatch of a loaded pack by its long name, "<pack>/<swatch>". |
| `plume` | `"red"`, `"white"`, `"gold"`, `"royal"`, `"green"` or `"violet"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"red"` | display | The plume's colour, which the long cloak takes too; or a plume swatch of a loaded pack by its long name, "<pack>/<swatch>". |
| `shield` | `"heater"`, `"round"` or `"kite"` | none; the page's own is `"heater"` | display | The shield carried with a one-handed weapon: the heater shield of the watch, a round shield or a kite shield. With a two-handed weapon no shield is carried. |
| `helmet` | `"open"`, `"kettle"`, `"coif"` or `"bascinet"` | none; the page's own is `"open"` | display | The helmet: the open helm, a kettle hat, a mail coif or a bascinet. The mail coif carries no plume. |
| `plume_style` | `"crest"`, `"feather"` or `"horsehair"` | none; the page's own is `"crest"` | display | The plume on the helmet: the crest, a tall feather or horsehair. None is drawn on the mail coif. |
| `body` | `"tabard"`, `"cuirass"` or `"gambeson"` | none; the page's own is `"tabard"` | display | What the knight wears on the body: the tabard of the watch, a breastplate (cuirass) or a quilted gambeson. |
| `shoulders` | `"plate"`, `"lames"` or `"leather"` | none; the page's own is `"plate"` | display | The shoulders: plate pauldrons, layered spaulders (lames) or leather pauldrons. |
| `arms` | `"plate"`, `"mail"` or `"padded"` | none; the page's own is `"plate"` | display | The arms: plate, mail sleeves or padded sleeves. |
| `hands` | `"plate"`, `"leather"` or `"mail"` | none; the page's own is `"plate"` | display | The hands: plate gauntlets, leather gloves or mail mittens. |
| `legs` | `"plate"`, `"mail"` or `"hose"` | none; the page's own is `"plate"` | display | The legs: plate greaves, mail chausses or padded hose. |
| `feet` | `"leather"`, `"sabatons"` or `"shoes"` | none; the page's own is `"leather"` | display | The feet: riding boots (leather), sabatons or turnshoes. |
| `back` | `"none"`, `"cloak"` or `"cape"` | none; the page's own is `"none"` | display | What hangs from the shoulders: nothing, a long cloak in the plume's colour or a short cape in the tabard's. |
| `monarch` | `"a"`, `"b"` or `"c"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"a"` | display | Which of the three monarchs sits in the court, or a patron of a loaded pack by its long name, "<pack>/<patron>". |
| `monarch_skin` | `"fair"`, `"warm"`, `"golden"`, `"tan"`, `"brown"` or `"deep"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"warm"` | display | The monarch's skin tone, or a skin swatch of a loaded pack by its long name, "<pack>/<swatch>". The page's own is the court's own skin. |
| `monarch_hair` | `"black"`, `"dark"`, `"brown"`, `"auburn"`, `"blonde"` or `"silver"`, or a long name, `"<pack>/<id>"` | none | display | The monarch's hair colour, or a hair swatch of a loaded pack by its long name, "<pack>/<swatch>". Left out, each monarch keeps the hair the court draws them with ("As drawn"). |
| `monarch_robe` | `"blue"`, `"forest"`, `"violet"`, `"wine"`, `"teal"` or `"sable"`, or a long name, `"<pack>/<id>"` | none | display | The colour of the monarch's robe, or a tabard swatch of a loaded pack by its long name, "<pack>/<swatch>". Left out, each monarch keeps their own robe (A red, B violet, C green). |
| `pet` | `"cat"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"cat"` | display | The pet who catches the flies the knight cannot, indoors and while the knight is busy: the mouser cat, or a pet of a loaded pack by its long name, "<pack>/<pet>". |
| `pet_coat` | `"calico"` or `"ginger"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"calico"` | display | The pet's coat: the mouser cat's calico, white with ginger and black patches, or ginger tabby; or a coat of a loaded pack's pet by its pack and the coat's id, "<pack>/<coat>", which counts only while that pet is in use. A coat the pet in use does not have gives its first. |
| `foe` | `"goblin"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"goblin"` | display | Who comes for the knight when an address is banned: the goblin, or a foe of a loaded pack by its long name, "<pack>/<foe>". |
| `critter` | `"fly"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"fly"` | display | What a blocked advert turns into: the fly, or a critter of a loaded pack by its long name, "<pack>/<critter>". |
| `props` | `"medieval"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"medieval"` | display | The drawings of the devices, every kind at once: medieval, or a prop set of a loaded pack by its long name, "<pack>/<prop set>". A kind the set does not draw takes the medieval drawing. |
| `overlay` | `"medieval"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"medieval"` | display | The colours and the font of the words over the scene: medieval, or an overlay of a loaded pack by its long name, "<pack>/<overlay>". |
| `words` | `"medieval"`, or a long name, `"<pack>/<id>"` | none; the page's own is `"medieval"` | display | The words of the quiet line and the captions: medieval, or a word set of a loaded pack by its long name, "<pack>/<word set>". |
| `items` | a table whose keys are `main`, `off`, `helmet`, `plume`, `hair`, `torso`, `pauldrons`, `arms`, `gauntlets`, `legs`, `boots` or `back`, each a long name, `"<pack>/<id>"` | none | display | Any slot's item named directly by its long name, "<pack>/<item>", over the key above that chooses the item for that slot: in config.toml a table [look.items], such as main = "kw.base/main.arming". |
| `devices` | a table whose keys are `pi`, `camera`, `machine`, `vm` or `box`, each `"medieval"` or a long name, `"<pack>/<id>"` | none | display | The drawing of one kind of device, over props for that kind: in config.toml a table [look.devices] whose keys are the kinds, each medieval or a prop set of a loaded pack by its long name, "<pack>/<prop set>". |

### [display]

How every display shows the words. A choice made on a wall's settings screen or the admin page is saved over this table, for the whole deployment.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `headline` | `"small"`, `"medium"` or `"large"` | none; the page's own is `"medium"` | display | The size of the headline. |
| `clock` | `24` or `12` | none; the page's own is `24` | display | Whether the clock shows 24 hours or 12. |
| `helmet_indoors` | `true` or `false` | none; the page's own is `false` | display | Whether the helmet stays on in the house and the smithy. |

### [quiet]

The scenes that take turns while all is quiet, for every display. A choice made on a wall's settings screen or the admin page is saved over this table, for the whole deployment.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `scenes` | one or more quiet scenes, each once: `"battlement"`, `"camp"`, `"house"` or `"yard"`, or long names, `"<pack>/<id>"` | none; the page's own is `["battlement", "camp", "house", "yard"]` | display | The quiet scenes, in the order they take turns: the four the page ships with, or quiet scenes of a loaded pack by their long names, "<pack>/<scene>". |
| `minutes` | a whole number of minutes, from 1 to 240 | none; the page's own is `10` | display | How long each quiet scene shows. The demo shows each for a minute while nothing sets it. |

### [scenes]

Where the knight acts out each condition that more than one scene can play, for every display. A condition left out plays in its own scene. In config.toml each key is a condition and each value a scene, by its short name or a scene of a loaded pack by its long name, "<pack>/<scene>"; a scene that cannot act its condition is ignored, and the condition plays in its own.

| Key | Values | Default | Scope | What it does |
|---|---|---|---|---|
| `attack` | any scene, or a long name, `"<pack>/<id>"`; the page acts it in `"battlement"`, `"camp"` or `"yard"` | none; the page's own is `"battlement"` | display | Where the knight acts out an attack. |
| `disk_full` | any scene, or a long name, `"<pack>/<id>"`; the page acts it in `"yard"` or `"cellar"` | none; the page's own is `"cellar"` | display | Where the knight acts out a full disk. |
| `backup_overdue` | any scene, or a long name, `"<pack>/<id>"`; the page acts it in `"battlement"`, `"camp"`, `"house"`, `"yard"` or `"cellar"` | none; the page's own is `"house"` | display | Where the knight acts out an overdue backup. |
| `pi_silent` | any scene, or a long name, `"<pack>/<id>"`; the page acts it in `"battlement"`, `"camp"` or `"house"` | none; the page's own is `"house"` | display | Where the knight acts out a silent Pi. |
| `cpu_hot` | any scene, or a long name, `"<pack>/<id>"`; the page acts it in `"battlement"`, `"camp"`, `"house"`, `"yard"` or `"cellar"` | none; the page's own is `"yard"` | display | Where the knight acts out a hot CPU. |

### .env

Every variable the project reads from `.env`. The host paths are the folders and files `compose.yaml` mounts, the server's address and port are where it publishes the bundled server, the admin password reaches the server alone, and the credentials reach the collector alone.

| Variable | Scope | Values | Default | What it is |
|---|---|---|---|---|
| `KNIGHTWATCHER_OUT` | path | a host path, such as `./var/out` | required | The host folder the collector writes state.json to. Mounted at /out in both containers, read-only in the server's, which serves it as data/: state.json, and the packs placed in its packs/ folder, which the page reads. Must exist and be writable by the collector's account. |
| `KNIGHTWATCHER_BACKUP_LOG` | path | a host path, such as `/var/log/backup.log` | required | The host's backup log, a single file. Mounted read-only at /host/backup.log. |
| `KNIGHTWATCHER_DATA_DISK` | path | a host path, such as `/data/lost+found` | required | Any folder on the data volume, so the collector can see the volume's size. Mounted read-only at /host/disks/data. An empty folder shares nothing but the size. |
| `KNIGHTWATCHER_VAR` | path | a host path, such as `./var` | `./var` | The host folder for the collector's memory between restarts. Mounted at /var/lib/knightwatcher. Must exist and be writable by the collector's account. |
| `KNIGHTWATCHER_SERVER_VAR` | path | a host path, such as `./var/server` | `./var/server` | The host folder for the bundled server's own files: the settings saved for every display, in settings.json, and those set on the admin page, in admin.json, with the admin page's sessions. Mounted at /var/lib/knightwatcher-server, the one place the server writes, and read-only at the same place in the collector, which takes up admin.json. Must exist and be writable by the server's account. |
| `KNIGHTWATCHER_SERVER_ADDRESS` | server | an address of this host, or empty for all of them, such as `127.0.0.1` | empty | The host address the bundled server is published on. Left empty, it is all of the host's addresses, IPv4 and IPv6. 127.0.0.1 keeps it to this machine, for a reverse proxy or a monitor on the host; one of the host's own addresses keeps it to that network. |
| `KNIGHTWATCHER_SERVER_PORT` | server | a TCP port number from 1 to 65535, such as `8080` | `8080` | The host port the bundled server is published on. The server listens on 8080 inside its container whatever this is. |
| `KNIGHTWATCHER_ADMIN_PASSWORD` | server | a password of at least 12 characters, or empty to leave the admin page off, such as `a-long-password-of-your-own` | empty | The password of the admin page, which changes what the collector watches. Passed to the server alone, never shown, logged or written anywhere else. Left empty, or shorter than 12 characters, the admin page stays off and says why; the walls work as before. A change needs the containers made again, which signs every browser out. |
| `KNIGHTWATCHER_TAUTULLI_API_KEY` | credential | 32 hexadecimal characters, such as `0123456789abcdef0123456789abcdef` | none | Tautulli's API key, for [sources.streams]. In Tautulli: Settings, Web Interface, API, with Enable API ticked. Read when the source is enabled; its `secret` setting names the variable. |
| `KNIGHTWATCHER_ADGUARD_USERNAME` | credential | a user name, such as `knightwatcher` | none | The user name of an AdGuard Home login, for [sources.adblock]. AdGuard Home has no API keys: the collector signs in as a user of its web interface. Read when the source is enabled; its `secret` setting names the variable. |
| `KNIGHTWATCHER_ADGUARD_PASSWORD` | credential | a password, such as `an-invented-password` | none | That login's password. AdGuard Home locks an address out for 15 minutes after five bad logins. Read when the source is enabled; its `secret` setting names the variable. |
| `KNIGHTWATCHER_SONARR_API_KEY` | credential | 32 hexadecimal characters, such as `fedcba9876543210fedcba9876543210` | none | Sonarr's API key, for [sources.sonarr]. In Sonarr: Settings, General, Security, API Key. Read when the source is enabled; its `secret` setting names the variable. |
| `KNIGHTWATCHER_RADARR_API_KEY` | credential | 32 hexadecimal characters, such as `00112233445566778899aabbccddeeff` | none | Radarr's API key, for [sources.radarr]. In Radarr: Settings, General, Security, API Key. Read when the source is enabled; its `secret` setting names the variable. |

<!-- settings-reference:end -->

## Notes on the settings

### Sources

A source runs when its `[sources.<name>]` table is present and its `enabled` is not `false`.
Between reads its last reading stands, and it raises no events. An `every_s` below `interval_s`
means every poll. `host` should be read at least as often as the shorter averaging window; when it
is read less often, an average reaches back to the previous read instead.

The backup log's date may be ISO 8601 or the form `date` prints, such as
`Thu 15 Jan 03:12:00 UTC 2026`.

### Removed settings

`clear_after_polls`, `cpu_hot.for_s` and `memory_tight.for_s` were removed when the collector
moved to 10-second polls and averaged CPU and memory. A `config.toml` that still sets one is
refused with a message naming its replacement: `clear_after_s`, or `window_s`.
[collector.md](./collector.md#cpu-and-memory) says how the averages are worked out.

### The Pi of [sources.pi]

`[sources.pi]` is the older way to name the Pi, and it stays with no end date. The Pi becomes the
first device, named `Pi` and of kind `pi`, with the rules it has always had: any number of
ports, a refused connection as an answer, its own `every_s`, and `conditions.pi_silent.for_s` as
the silence that makes it down. It raises `pi_silent` with its own words, and only while the
priority list names `pi_silent`; it never needs `device_down`. See
[Devices](#devices).

## Devices

Each `[[device]]` table, at the top level of `config.toml`, is one machine on the network to
watch: a NAS, a camera, a laptop, a virtual machine. Each is checked at its own pace and counts as
down once it has been silent for its `down_after_s`. The collector lists them in the state file,
in the order of the tables, for the page to draw in the scene, with the prop of a device that is
down changed and a question mark blinking over it, whether or not it alerts. A device that alerts
also raises `device_down` while it is down. There can be 32
devices, the Pi of `[sources.pi]` included, and those the page does not draw are checked and alert
as usual.

Where a device stands depends on its kind. The first device of kind `pi` is the pie, in its own
place. Cameras are mounted high, and every scene has three places for them; every other kind
stands on the ground, in three more places. Each class fills in the order of the tables, so the
display shows the first Pi, the first three cameras and the first three other devices, and a device
keeps its place whether it is up or down.

```toml
# A NAS on the main LAN. Alerts after the default three minutes of silence.
[[device]]
name = "Vault"
kind = "machine"
host = "192.0.2.40"
port = 445
```

`config.example.toml` ends with four such tables, commented out: this one, a camera checked by
its web page, a laptop that never alerts, and a virtual machine switched off.

A device has exactly one check: `host` with `port` or `ports`, or `url`. `refused_counts` is
refused beside a `url`, and `verify_tls` beside anything but an `https` `url`.

**A port.** The collector opens a TCP connection to each port at the same time, and the device
has answered if any is accepted. A refused connection counts only with `refused_counts = true`.
It is off by default because a firewall between VLANs can refuse on a machine's behalf: a rule
that rejects with a TCP reset answers for an address whether or not the machine behind it is
on, and the device would never go down. `refused_counts = true` suits a machine on the same
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
address, the same firewall on the way out. A device on another VLAN is reachable when the router
between the VLANs lets the host's address through to that port and lets the reply back.
`127.0.0.1` is the host itself. The container has no capabilities, so there is no ping. A name in
`host` or `url` is looked up by the host's resolver, and a lookup that takes longer than the
check's time counts as no answer, so an address is the better choice: it needs no lookup and
cannot be held up by a slow resolver.

**Names.** The headline puts the name in capitals before a word of 4 to 6 letters within 16
characters, so a name of up to 11 characters shows whole beside `DOWN` and `DARK`, and up to 9
beside `SILENT`. A longer name is cut with an ellipsis in the headline (`Gatehouse camera`
becomes `GATEHOUSE… DARK`) and is given whole in the detail. Names are ASCII because the display
font's coverage past it has not been checked. The name is also the device's key in the state
file's `sources`, `device:<name>`, so renaming a device starts its record afresh.

**The Pi.** A configuration with `[sources.pi]` has the Pi as its first device (see
[The Pi of [sources.pi]](#the-pi-of-sourcespi)), and a `[[device]]` named `Pi`, or one watching the
Pi's `host`, is refused so that the Pi is not drawn twice. The comparison is of the text as
written, so the same machine under another name or address is not caught. Moving to the new form
is optional: a `[[device]]` named `Pi`, of kind `pi`, with `refused_counts = true` and
`down_after_s = 180`, has the same prop and still reads `PI SILENT`, but it raises `device_down`
rather than `pi_silent`, so the priority list must name `device_down`, and it writes no
`facts.pi`, which a page from before devices needs for its pie.

**Checking.** `check-config` names each problem in a table by its place among the tables,
counted from 0, as in `device[2].name: "vault" is already the name of device[0]`. A mistake in any
table stops the collector from starting, as any other configuration error does. A priority list
that leaves out `device_down` while a device alerts is refused with a message that says where to
add it:

```
config: conditions.priority: leaves out "device_down", so Vault and Gate cam would never alert; add it after "pi_silent", or set alert = false on them
```

[collector.md](./collector.md#devices) says how a device is judged down and what the
headline and the detail say.

## The settings screen's defaults

The `[look]`, `[display]`, `[quiet]` and `[scenes]` tables set the household defaults for the
display's settings screen: what every display starts from, and what it goes back to when told to
use the config default. What the screens choose is saved over them, by the bundled server for every
display, and checked by the same rules, so a value refused here is refused there in the same
words ([server.md](./server.md#put-apisettings)). All four tables and every setting in them are optional, and none has a
default in `config.toml`. The collector writes exactly what they set into `state.json` as
`defaults` (see [state.md](./state.md)), and for a setting left out the page uses its own default.

```toml
[look]
skin = "tan"
hair = "auburn"
hair_style = "curls"
monarch = "b"

[display]
clock = 12

[scenes]
cpu_hot = "camp"
```

`config.example.toml` has all four tables commented out, every setting shown with the allowed
values beside it. The short names of the colours, tones, hair styles and gear are those of the base
pack (`web/packs/base.pack.json`); another loaded pack's are given by their long names. The monarch's hair and robe have no value for "as drawn": leaving the
setting out is how a display keeps the monarch's own colours.

`pet_coat` is the pet's coat: the mouser cat's `calico` or `ginger`, or a coat of a world pack's pet by
the pack and the coat's id, `"<pack>/<coat>"`, which counts only while that pet is in use; a coat
the pet in use does not have gives its first. The pet itself cannot be turned off.

`world`, `monarch`, `pet`, `foe`, `critter`, `props`, `overlay` and `words` take a short name, the medieval
world's, or the long name of something in a world pack, `"<pack>/<id>"`. So do the knight's body
and colours: `build` takes a body of a world pack, and `skin`, `hair`, `tabard` and `plume` a
swatch of that set from one, as `build = "kw.cyber/body.courier"`, and `monarch_skin`,
`monarch_hair` and `monarch_robe` a skin, hair or tabard swatch of one. Two tables inside
`[look]` name parts directly: `[look.items]` gives a slot's item by its long name, over the key that
would choose the item for that slot, and `[look.devices]` gives the prop set one kind of device
(`pi`, `camera`, `machine`, `vm` or `box`) is drawn from, over `props` for that kind:

```toml
[look]
world = "medieval"
tabard = "forest"

[look.items]
main = "kw.base/main.arming"

[look.devices]
camera = "medieval"
```

The page ships one world, `medieval`, whose pack is `kw.medieval`, so the long names it loads by
itself are that pack's own (`kw.medieval/patron.b` is monarch `b`) and the base pack's items. A
world pack placed in `data/packs/` ([display.md](./display.md#another-world-pack)) adds its own: its world, its scenes, its
cast, its words and overlay, its bodies, swatches and items, each by its long name
([worlds.md](./worlds.md#other-worlds)). A kind the chosen prop set does not draw takes the
medieval drawing.

`[scenes]` maps a condition id to one of the page's scenes. Each scene can act only some
conditions (see [design.md](./design.md#scenes-chosen-per-condition)), and the page offers a
choice for five; the reference above lists the scenes that can act each. The other conditions
are not offered: `wan_down` (only the battlement has the bell rope), `container_unhealthy` and
`night` (the bed is in the house), `streaming` (so is the television), `ssh_session` (the court),
`updating` (the smithy), and `device_down` and `memory_tight`, which play in whichever quiet scene
is showing. A loaded world's scene, by its long name, may be given any condition that has a scene
of its own, offered or not, when it can act it. The collector checks each key against its own condition ids and each value against
the page's scenes, or a long name by its form, but it cannot know which scene can act what. A known condition paired with a
known scene that cannot act it, such as `night = "camp"`, is therefore accepted and written, and
the page ignores it, with a line in the browser's console, and plays the condition in its own
scene.

The check is strict, as it is everywhere else in the file. A value outside these lists, a value
of the wrong type (`"false"` in quotes for `helmet_indoors`, `"12"` for `clock`, `2.5` for
`minutes`) and an unknown setting in any of the four tables each stop the collector from
starting, and `check-config` names the table, the setting and what it allows. The collector
knows nothing of packs, so it checks a long name only for its form,
`^[a-z][a-z0-9-]{1,31}(\.[a-z0-9-]{1,31}){0,3}/[a-z][a-z0-9.-]{0,47}$` (the schema's `long_name`); a
display that has not loaded it ignores it and uses the next level down:

```
config: look.skin: unknown value "pale"; use fair, warm, golden, tan, brown or deep, or a long name, "<pack>/<id>"
config: look.world: unknown value "neon"; use medieval, or a long name, "<pack>/<id>"
config: look.devices.tv: unknown key; use pi, camera, machine, vm or box
config: quiet.scenes: "camp" listed twice
config: quiet.minutes: must be a whole number from 1 to 240
config: scenes.cpu: unknown condition
config: scenes.cpu_hot: unknown value "forest"; use battlement, camp, house, yard, cellar, smithy or court
```

## The accounts

Both containers run as uid and gid 10001, an account that exists only inside the image and owns
nothing on the host. The collector needs to write in its output folder and its memory folder, and
the server in its own folder; the server reads the output folder, and the collector the server's
folder. Access control lists grant that
without root, as long as you own the folders, and leave their owner and mode alone. With the
folders of `.env.example`, all under `./var`:

```bash
mkdir -p var/out var/server
setfacl -m u:10001:rwx var var/out var/server
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var var/out var/server
```

With folders elsewhere, name those instead, such as `/srv/www/knightwatcher/data` for an output
folder a web server of your own serves. The second line sets the default for files made in the
folders from then on, and names your own uid as well so that you can still read what the
containers write. Files already there from an earlier run under another uid need the grant once:
`setfacl -m u:10001:rw` on each. Stop that earlier collector first, since every file it rewrites
comes back without the grant. `config.toml` and the backup log only need to be readable by
everyone (both containers read `config.toml`), and `/proc` needs nothing. `.env` needs no grant: docker compose reads it as you, and the
collector gets its credentials as environment variables.

To run them under another uid, change `user:` in `compose.yaml` and grant that uid instead.
