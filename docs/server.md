# The server

Knightwatcher comes with a small web server of its own, run beside the collector by
`docker compose up`. It serves the page, the collector's `state.json` and the downloaded packs in
`data/packs/`, keeps the settings chosen on the displays' settings screens for the whole deployment,
so that every display shows the same knight, serves the admin page, where the household's
sources, thresholds and devices are set behind a password, and counts the displays that show the
page, for the collector's usage counts. It is written in Python with the
standard library alone, in `server/`, and runs from the same image as the collector.

The server is optional. The page still works from any web server of your own (see
[display.md](./display.md#deploying)); each browser then keeps its own settings, and there is no admin
page.

## What it serves

| Address | What | Cached |
|---|---|---|
| `/`, `/index.html` | the page, stamped with its version | asked for again each time (`no-cache`) |
| `/version.json` | the page's version, which open displays check every five minutes | `no-cache` |
| the page's other files | scripts, styles, the font, the icons, the packs that ship with the page | a year when the address carries `?v=`, as the stamped page's addresses do; `no-cache` otherwise |
| `/data/state.json` | the collector's latest state file | `no-cache` |
| `/data/packs/<name>.json` | the downloaded packs, in the `packs` folder of the collector's output folder, each by a plain name | `no-cache` |
| `/api/settings` | the shared settings: `GET` and `PUT` | `no-cache` |
| `/api/displays` | where each page posts its display id: `POST` alone | never kept (`no-store`) |
| `/admin` | sends the browser on to `admin/`, the admin page | `no-cache` |
| `/admin/` | the admin page, stamped with the page's version | `no-cache` |
| `/api/admin/...` | the admin page's API, below | never kept (`no-store`) |

Everything else is `404 Not found`, a folder included: no folder is ever listed. Each file and
the settings carry an entity tag, and a request that names it with `If-None-Match` gets `304` with no body,
so a display's poll costs a few hundred bytes while nothing has changed.

**The page** is the copy of `web/` the image holds, stamped at build time by `server/stamp.py`
exactly as `tools/deploy.sh` stamps a deployed copy: the same version for the same files,
`version.json`, the `kw-version` meta tag and `?v=` on every local script and stylesheet. A new
image therefore reloads open displays within five minutes, as a deploy does. The server reads the
page's files into memory once at start and looks each address up by name, so no form of `../`
can reach a file outside them.

**The collector's output** is its output folder, mounted read-only. Only `state.json` and the
`.json` files of `packs/` with a plain name (letters, digits, `.`, `_` and `-`, not starting with a
dot) are served; a link, a folder, a file over 4 MiB and anything else in the folder are not. The
server reads each afresh, since the collector rewrites them.

**Content types** are set by extension: `text/html`, `text/javascript` and `text/css` with
`charset=utf-8`, `application/json`, `image/svg+xml`, `image/png`, `image/x-icon`, `font/ttf`. Every
answer also says `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a
content security policy that lets the page load only from its own address.

**Methods.** `GET` and `HEAD` everywhere but `/api/displays`, `PUT` at `/api/settings` alone,
`POST` at `/api/displays`, and `POST` and `PATCH` at the admin addresses that take them (below). Any other method is `405 Method not allowed`, with
an `Allow` header naming what is.

## The settings API

### GET /api/settings

```http
GET /api/settings HTTP/1.1

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-cache
ETag: "4f1c2a9e0b7d3c6a5e81"

{"v":1,"look":{"tabard":"teal","plume":"gold"},"display":{"clock":12},"quiet":{},"scenes":{"cpu_hot":"camp"}}
```

The four sections are always there, holding only the keys that have been saved. Keys and values
are the contract's, those of the `[look]`, `[display]`, `[quiet]` and `[scenes]` tables of
`config.toml` ([configuration.md](./configuration.md#the-settings-screens-defaults)): the world and
the part keys among them, the `items` and `devices` tables as objects inside `look`, and a long name,
`"<pack>/<id>"`, wherever the table takes one, checked for its form alone. A store with
nothing saved gives four empty sections. A display that chooses a world sends `look`, `quiet` and
`scenes` in one write, the world alone in `look` and the parts it cleared left out
([display.md](./display.md#worlds)).

### PUT /api/settings

Replaces one or more sections. The body names them, and may say `"v": 1`; a section given as `{}`
clears it, and a section left out is left as it is.

```http
PUT /api/settings HTTP/1.1
Content-Type: application/json
Content-Length: 45

{"v":1,"look":{"tabard":"teal"},"display":{}}
```

The answer is `200` with the settings as `GET` then gives them. Every value is checked by the
collector's own checks for `config.toml` (`config.check_defaults` in `collector/config.py`), so a
value `config.toml` would refuse is refused here, in the same words, and nothing is saved:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error": "look.tabard: unknown value \"pink\"; use blue, forest, violet, wine, teal or sable",
 "problems": ["look.tabard: unknown value \"pink\"; use blue, forest, violet, wine, teal or sable",
              "display.clock: must be 24 or 12"]}
```

`error` is the first problem, which the settings screen shows after "Not saved: ", and `problems`
lists every one. The other refusals:

| Status | When | `error` |
|---|---|---|
| 400 | a body that is not JSON (`NaN` included) | `the body is not JSON` |
| 400 | a body that is not an object, names no section, names another (`sources: unknown table`), or a `v` other than 1 | the problem, as above |
| 403 | an `Origin` header that does not name the address the request was sent to, or `Sec-Fetch-Site: cross-site` | `a page from another address may not change the settings` |
| 411 | no `Content-Length`, or a chunked body | `send the settings with a Content-Length` |
| 413 | a body over 16 KiB | `the settings are larger than 16384 bytes` |
| 415 | a `Content-Type` other than `application/json` (a `charset` is allowed) | `the settings are sent as application/json` |
| 500 | the server cannot write its folder | `the server cannot write its settings file (...)` |

**The origin check.** A browser says which page a write comes from in its `Origin` header. The
server compares the host and port there with the request's `Host` header, ignoring the scheme
(a reverse proxy in front may end TLS) and a port the scheme implies, and refuses a write from
any other address. A request with no `Origin`, such as one from `curl`, is not a browser's and is
taken. So a page on another site, opened in a browser on your LAN, cannot change the settings.
Behind a reverse proxy the proxy must pass the original `Host` on, which Caddy does by itself; see
[Behind a reverse proxy](#behind-a-reverse-proxy).

## The displays

### POST /api/displays

Each page the server serves makes a random id once, keeps it in its browser's storage, and posts
it here at load and every 30 minutes ([display.md](./display.md#modes)):

```http
POST /api/displays HTTP/1.1
Content-Type: application/json
Content-Length: 41

{"id":"3f9c0d12ab45e6789a0b3f9c0d12ab45"}

HTTP/1.1 204 No Content
Cache-Control: no-store
```

The id is 32 lowercase hexadecimal characters and the body holds it alone. Anyone on the LAN can
post, so a post can do nothing but record an id as seen now: a body over 256 bytes is refused
with `413`, another form of id or any other key with `400`, and the rest as a write to
`/api/settings` is refused (`403` from another site, `411`, `415`). No post is logged, taken or
refused, since every display sends one every half hour and a flood would fill the log. Any other
method is `405`, with `Allow: POST`.

### The displays store

The server keeps the time it last saw each id in `displays.json` in its own folder, and in memory:

```json
{"v":1,"seen":{"3f9c0d12ab45e6789a0b3f9c0d12ab45":"2026-01-15T21:42:10Z"}}
```

It holds at most 1,000 ids, the one seen longest ago dropped for a new one, and it is written whole,
to a temporary name, renamed into place, mode 640, at most once a minute (a post inside the minute
is written at its end, and what is pending is written as the server stops). A file that cannot
be read counts as none seen. The server reads it at start; it never serves it, and the ids never
leave the host. The collector, which mounts the folder read-only, counts the ids seen in the last
six hours and sends the count alone in its heartbeat
([configuration.md](./configuration.md#usage-counts)). `collector/displays.py` holds the file's
form, and both read it with the same code. To forget every display, stop the server and delete the
file.

## The admin page

The admin page, at `/admin/` on the server, is where the household's settings are changed from any
browser: the collector, the conditions, the sources and the devices, and the household look,
display, quiet scenes and scenes that the walls' settings screens also change. Its value for each
setting comes from one of three levels, highest first: what is set on the page, `config.toml`, and
the default ([configuration.md](./configuration.md#where-the-collectors-settings-come-from)).
Credentials are never typed or shown there: the page says, by name, which ones `.env` holds. A
source read through a provider (streams and adverts blocked) has Read from, a choice of the
providers of its kind ([collector.md](./collector.md#kinds-and-providers)), the provider files of
the user's own among them, and each source names the credential variables its provider reads. The
settings a provider file declares are set in `config.toml` alone. Security shows its Read from,
Address and Database without letting them be changed: reading fail2ban's database needs a mount
and a read grant on the host, and only a provider file of the user's own reads an address, so all
three are set in `config.toml` ([configuration.md](./configuration.md#fail2bans-database)). The
entries of `[[sources.imports]]` ([configuration.md](./configuration.md#more-imports)) are listed
below the sources, read-only: each with its name and source (`imports:<name>`), the provider and
address it reads, whether it is reading or failing, and the credential variables it reads; they are
set in `config.toml` alone, and every change made on the page is still checked with them. The
checks of `[[sources.json]]` ([configuration.md](./configuration.md#generic-checks)) are listed
the same way: each with its name and source (`json:<name>`), its path, test and address, whether
it is reading or failing, the condition it acts as, its words and its pace, and its header's
variable when it has a header; a priority set on the page that leaves out a condition a check
borrows is refused, as `config.toml` would be.
Download config.toml writes a setting
the chosen provider does not use as a comment, and the list's entries as `config.toml` has them. The page itself is described in
[display.md](./display.md#the-admin-page).

It is behind the admin password, `KW_ADMIN_PASSWORD` in `.env`, which `compose.yaml`
gives to the server alone. While it is missing, or shorter than 12 characters, the page is off and
says why, and the walls work as before. A changed password needs the containers made again
(`docker compose up -d`), which signs every browser out.

### The addresses

Every answer under `/api/admin/` is JSON unless said otherwise, and is never kept by a cache
(`Cache-Control: no-store`). Every address but `state` and `sign-in` needs a signed-in browser and
answers `401 {"error": "sign in first"}` without one. While the page is off, every address but
`state` answers `503` with the reason in `error`.

| Method and address | What | Answers |
|---|---|---|
| `GET /api/admin/state` | whether the page is on, and whether this browser is signed in | `{"on": true, "signed_in": false}`; `"paused_s": 232` while signing in is paused; `"error"` with the reason while the page is off |
| `POST /api/admin/sign-in` | `{"password": "..."}` | `204` with the session cookie; `401 {"error": "That is not the admin password."}`; `429 {"error": ..., "retry_after_s": 60}` while signing in is paused |
| `POST /api/admin/sign-out` | ends this browser's session | `204`, with the cookie cleared |
| `GET /api/admin/settings` | everything the page shows | below |
| `PATCH /api/admin/settings` | `{"v": 1, "set": {"collector.interval_s": 15}, "reset": ["conditions.cpu_hot.pct"]}` | `200` with what `GET` then gives; `400 {"error": first, "problems": [...]}`, keeping nothing |
| `POST /api/admin/reset` | puts everything back to `config.toml`: clears what is set on the page and the shared settings | `200` with what `GET` then gives; `400` while `config.toml` alone would be refused |
| `GET /api/admin/export` | the complete `config.toml` the collector now uses | `text/plain; charset=utf-8`, with `Content-Disposition: attachment; filename="config.toml"` |
| `GET /api/admin/schema` | `collector/settings-schema.json`, from which the page takes every label, help line, default and range | the schema |

`GET /api/admin/settings` answers:

```json
{
  "v": 1,
  "set": {"collector.interval_s": 15, "device": [{"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445}]},
  "version": "3f9c0d12ab45e6789a0b",
  "file": {"collector": {"timezone": "Europe/London"}, "sources": {"pi": {"host": "192.0.2.4"}}},
  "status": {"generated_at": "2026-01-15T21:42:10Z", "interval_s": 15, "sources": {}, "devices": [],
             "config": {"admin": "3f9c0d12ab45e6789a0b", "at": "2026-01-15T21:42:10Z", "problems": []}},
  "credentials": {"KW_SONARR_API_KEY": true, "KW_RADARR_API_KEY": false},
  "problems": [],
  "providers": {"own": [], "refused": [], "problems": []},
  "now": "2026-01-15T21:42:14Z"
}
```

`set` is what is set on the page, by path, and `version` the version of the store that holds it
(below). `file` is `config.toml` as parsed, or `null` with `file_problem` saying why it could not
be read. `status` is taken from the collector's latest state file: when it was written and how
often, each source's health, each device's state, and `config`, the settings the collector
says it uses ([state.md](./state.md#fields)), so that the page can say "In use by the collector
since" once `status.config.admin` equals `version`. `credentials` is the collector's report of
which credential variables it holds, by name ([collector.md](./collector.md#credentials-by-name)), or
`null` while it has written none. `problems` is every problem the collector's checks find with
`config.toml` and what is set laid over it, empty in the ordinary course. `providers` is what the
providers folder holds ([providers.md](./providers.md#your-own-provider-files)): `own`, each file
that passed, with its `id`, `kind`, `name`, `docs`, `credentials` (each `field` with its `help`)
and `settings`, as the schema lists the built-in providers; `refused`, each file left out, by `id`,
with its `problems`; and `problems`, every problem the folder gave. `now` is the server's clock,
against which the page counts ages.

A `PATCH` names paths to set and paths to reset (put back to `config.toml`'s value, or the default).
A path is a setting's table and key, as `check-config` names them: `collector.interval_s`,
`conditions.cpu_hot.pct`, `sources.sonarr.enabled`. A list is one value, and `device` is the whole
list of devices: set here, each replaces `config.toml`'s whole. A path into a source that
`config.toml` does not set up creates its table. Only the collector's settings that the schema
marks editable can be set; the folders, `proc_root`, the backup log, each source's `secret` and
every setting of `[[sources.imports]]` and `[[sources.json]]` are fixed (`sources.imports.url: not set on the admin page`), and the look, display, quiet scenes and scenes are set through `PUT /api/settings`, as the
walls set them.

### The check before a change is kept

The server builds the configuration exactly as the collector will: `config.toml` parsed, what is
set on the page laid over it by path (a list whole), the change on top, then the collector's own
`config.build` from the same image, with the provider files of the providers folder, read again
whenever one of them changes. It refuses with every problem it finds, in the words
`check-config` prints after `config: `, the problems the change brings first:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error": "collector.http_timeout_s: must be shorter than interval_s",
 "problems": ["collector.http_timeout_s: must be shorter than interval_s"]}
```

The server has no credential, so it checks credentials by the names the collector reports holding,
in `credentials.json`, with the same words: turning on Sonarr while `.env` has no key for it is
refused with `.env: KW_SONARR_API_KEY missing (for sonarr)`. While the collector has
reported none, credentials are not checked here, and a source that turns out to lack one runs and
fails, saying which ([collector.md](./collector.md#taking-up-a-change)). A provider file that
failed its checks is not a problem of the settings: `from` may name it, and that source fails at
every read, as in the collector.

The other refusals of a write are those of `PUT /api/settings` above, except that a body may be up
to 64 KiB, and a write that names an unknown or fixed path is refused with
`collector.output_dir: not set on the admin page` or `collector.nothing: unknown setting`.

### Signing in

One password, compared in constant time. Each wrong one is answered after a second. After five
wrong in a row, signing in is paused for every browser for one minute, doubling with each further
wrong password to fifteen minutes; while paused, every attempt, the right password included, is
answered `429`. A right password clears the count. The count is for the whole server rather than
per browser or per address: the server logs no client address, and behind a reverse proxy every
request comes from the proxy's.

A session is a random 32-byte token in a cookie, `kw_admin`, `HttpOnly`, `SameSite=Strict`,
`Path=/`, and `Secure` when the request arrived over HTTPS, as a reverse proxy in front says with
`X-Forwarded-Proto: https`. It lasts 30 days from its last use, and the browser's cookie is renewed
at most once a day while it is used, until Sign out.

The server keeps its sessions in `sessions.json` in its own folder, so that a restart or a new image
keeps every browser signed in. The file holds, for each session, an HMAC of its token keyed with
the admin password, and when the session was last used and its cookie last sent; never the token
or the password, so the file signs nobody in. It is written as the other stores are (whole, to a
temporary name, renamed into place, mode 640) when a browser signs in or out, when a cookie is
renewed, and otherwise at most once an hour as a session is used, so a restart may cost a session
up to an hour of its 30 days. Sessions unused for 30 days are dropped at each write. A new admin
password signs every browser out, since no stored HMAC matches it, and so does deleting the file
while the server is stopped.

Every write passes the origin check of `PUT /api/settings`, and the cookie is never sent with a
request from another site, so a page elsewhere can neither sign in nor change a setting.

## The admin store

What is set on the admin page is kept in its own file in the server's folder, `admin.json`, never
in `config.toml`, which stays the owner's file and the level under it:

```json
{
  "v": 1,
  "set": {
    "collector.interval_s": 15,
    "conditions.cpu_hot.pct": 90.0,
    "device": [
      {"name": "Vault", "kind": "machine", "host": "192.0.2.40", "port": 445}
    ]
  }
}
```

It is written as `settings.json` is: whole, to a temporary name in the same folder, renamed into
place, mode 640. Its version is the first 20 hex characters of a sha256 over its bytes, which the
collector reports back once it uses it. The server reads it at start, and again whenever it has
changed on disk, as when it is edited or deleted by hand; a path it cannot hold (one a newer or older version knows and this one does not, or a value of the
wrong type) is left out with a line in the log, and the collector, reading the same file with the
same code, leaves out the same. The collector mounts the folder read-only and takes a new version
up between polls ([collector.md](./collector.md#taking-up-a-change)).

To start again with nothing set on the page, use Put everything back on the page's `.env` section,
or delete `admin.json`: the server and the collector both notice within a poll.

## The settings store

The shared settings live in one file, `settings.json`, in the server's own folder
(`KW_SERVER_VAR`, `./var/server` unless set), in the same shape as the API gives them,
indented:

```json
{
  "v": 1,
  "look": {
    "tabard": "teal"
  },
  "display": {},
  "quiet": {},
  "scenes": {}
}
```

The server reads it once at start and keeps it in memory. Each accepted `PUT` writes the whole
file to a temporary name in the same folder and renames it into place, so a reader never sees half
a file, and the file is mode 640. At start, a key whose value the checks refuse (a value a newer
or older version does not know) is left out with a line in the log, and a file that is not JSON or
not version 1 counts as nothing saved; the file itself is left as it is until the next write. The
store is never `config.toml`: the file seeds the defaults, and the store holds what the displays
chose on top of them.

To start again with nothing saved, stop the server, delete `settings.json` and start it.

## How the page uses it

The page tells the server is there by asking `api/settings` when it starts. With an answer in the
form above, the settings saved there are the level the settings screen writes to, for every
display; with a `404`, or anything else, the page keeps choices in its own browser, as it does
from disk. Served over HTTP, it also posts its display id to `api/displays`
([The displays](#the-displays)); another server's error changes nothing. The levels, the carry-over of a browser's earlier choices and the rest are in
[display.md](./display.md#settings).

## Running it

`docker compose up -d` starts the collector and the server together. The README's quick start
does it from nothing. The server's part of `compose.yaml`:

- the image's `python -m server`, as uid and gid 10001, with a read-only root filesystem, no
  capabilities and `no-new-privileges`;
- the collector's output folder (`KW_OUT`) mounted read-only at `/out`, `config.toml`
  read-only at `/etc/knightwatcher/config.toml` and the providers folder (`KW_PROVIDERS`)
  read-only at `/etc/knightwatcher/providers`, for the admin page's checks, and the server's own
  folder (`KW_SERVER_VAR`) at `/var/lib/knightwatcher-server`, the one place it writes
  (`settings.json`, `admin.json`, the admin page's `sessions.json` and `displays.json`);
- `KW_ADMIN_PASSWORD` from `.env`, its one variable, which it reads once at start and
  takes out of its own environment;
- inside the container it listens on port 8080, published on the host at
  `KW_SERVER_ADDRESS` and `KW_SERVER_PORT` (all addresses and 8080 unless
  set);
- a health check, `python -m server --health`, which asks the server for the page and the
  settings and fails unless both answer.

Its own folder must exist and be writable by uid 10001, as the collector's are;
[configuration.md](./configuration.md#the-accounts) has the commands. The server refuses to start
without it, and says so.

**Logs.** The server logs its start, each save (`settings saved: look`, `admin settings saved:
collector.interval_s`), each refused write with its reason, `admin sign-in refused` for each wrong
password, `admin sign-in paused for 1 minute`, `admin signed in` and `admin signed out`, and its
errors. It never logs the admin password or what was typed. It does not log ordinary requests,
since every display asks every five seconds, nor a display's post, and it logs no client
address.

**Outside Docker**, for development, from the repository's root:

```bash
python3 -m server.stamp /tmp/kw-page   # a copy of web/, made first with cp -r web /tmp/kw-page
KW_ADMIN_PASSWORD='a-long-password-of-your-own' \
python3 -m server --web /tmp/kw-page --out /path/to/the/collectors/output --data /tmp/kw-data \
  --config config.toml --address 127.0.0.1 --port 8080
```

`--web` may name `web/` itself, unstamped, for a `dev` page that never checks for a new version.
`--config` names the `config.toml` the admin page checks against, `/etc/knightwatcher/config.toml`
unless given, and the providers folder beside it; without the password the admin page is off.

## Security

**The walls are open on the LAN, with no login.** By default the server is published on every
address of the host, and anyone who can reach that port can see the display, read `state.json` and
change the shared settings. The admin page is behind its own password; everything else is not. `state.json` describes the homelab: its containers, its machines, what is being
watched. That is the owner's call for a home network, and it is the default because a wall
display has no keyboard to log in with. Choose it knowingly:

- **Never publish the server to the internet without a login in front of it.** Put it behind your
  own reverse proxy with authentication, as below, or a VPN.
- To keep it to one machine, set `KW_SERVER_ADDRESS=127.0.0.1`: a reverse proxy or a
  monitor on the same host can still reach it, and nothing else can.
- Docker publishes ports with its own firewall rules, which go around a host firewall such as
  `ufw`. Binding to an address, as above, is the reliable way to limit who can reach it.
- A page on another site cannot write the settings (the origin check above), but a site that
  points its own name at your server's address can read what the server serves through a
  visitor's browser. A login in front closes that too.

**What it can touch.** The server gets no credential: from `.env`, `compose.yaml` passes it the
admin password alone, and reads its address and port to publish it. It mounts no secret: it reads
`config.toml` and the provider files, which hold none, read-only, and not `/proc` and not the
collector's memory. It
reads the collector's output read-only, `credentials.json` there included, which names the
credential variables the collector holds and never their values, and which the server reads and
never serves. It writes only its own folder. It runs on Docker's own network for the project, not the
host's, so it reaches nothing on the host's loopback. It shares uid 10001 with the collector;
since the two run in separate containers, it cannot see the collector's processes or their
environment.

**What a write can do.** A `PUT` to `/api/settings`, open to anyone who reaches the server,
changes how the knight looks, the words' size and clock, the quiet scenes and where some conditions
play, for every display. It cannot change a source, a threshold, a device or a credential. A `POST` to
`/api/displays`, open in the same way, records an id as seen and nothing else: at most it can add
to the count of displays the collector sends, up to the 1,000 the store keeps.
A signed-in write on the admin page can: it reaches every source's address, the thresholds and the
whole watch list, so the collector can be pointed at any address on the LAN that the host reaches.
It still cannot change a credential, a folder or what the collector mounts, and every change is
one the collector's own checks accept. Keep the password long and to yourself, as you keep `.env`.

## Behind a reverse proxy

To reach the display as `https://knightwatcher.<your domain>`, publish the server on the loopback
address and let the reverse proxy you already run add TLS and a login. In `.env`:

```bash
KW_SERVER_ADDRESS=127.0.0.1
KW_SERVER_PORT=8080
```

Caddy, with a login (make the hash with `caddy hash-password`):

```caddyfile
knightwatcher.example.com {
	basic_auth {
		household $2a$14$an.invented.hash.made.by.caddy.hash.password
	}
	reverse_proxy 127.0.0.1:8080
}
```

Caddy passes the original `Host` on by itself, and `X-Forwarded-Proto`, which makes the admin
page's cookie `Secure`. With nginx, say so, or every write is refused as
coming from another address:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
}
```

A proxy that runs in a container of its own, on a Docker network, reaches the server by its
container name, `knightwatcher-server:8080`, once both are on the same network, and the server
then needs no published port at all.

A tablet on the wall cannot type a password every morning. A login that the browser remembers,
or access granted to the tablet's own address, serves a display best; a single sign-on page that
expires overnight does not.

## Checks

```bash
python3 -m unittest discover -s tests/server -v
```

`tests/server/test_server.py` runs the server on the loopback with an invented page and output
folder, and checks the types, the caching, the conditional requests, that no folder is listed, a
list of attempts to reach outside the served files (`/../`, encoded dots and slashes, a link, the
collector's memory, the settings file itself), every refusal of a write above, that a refused
value gets the same words `config.toml` gets, the world, its parts and long names taken, the
atomic write and the store read again at start.
`tests/server/test_admin.py` checks the admin page's side with a password made for the run: the
page off without a password and with one of 11 characters, the cookie's flags, the wait after a
wrong password and the pause after five, doubling to fifteen minutes, the constant-time compare,
sessions renewed by use and ended after 30 days or by Sign out, sessions kept in `sessions.json`
across a restart, ended by a new password, never stored as a usable token, the session every
address needs,
cross-origin writes refused, a change kept and written, a refused one with the collector's words
and nothing kept, a credential refused by its variable's name, the devices replaced whole,
the reset, the export read back and built by the collector (the world and the `items` and
`devices` tables among it, written as inline tables), `credentials.json` never served, the
admin page stamped and served at `/admin/`, and that the password never reaches a log, an answer
or the environment once read.
`tests/server/test_displays.py` checks `/api/displays`: a post recorded and answered `204`, every
other form of id and body refused with nothing kept or logged, the size, type and origin checks,
`POST` alone, the ids never served, the store read again at start, the 1,000 ids kept, the oldest
dropped, the write at most once a minute and on stop, and a broken file counted as none.
`tests/server/test_stamp.py` stamps a copy of `web/` and checks it is byte for byte what
`tools/deploy.sh` makes of it.
