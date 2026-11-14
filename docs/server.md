# The server

Knightwatcher comes with a small web server of its own, run beside the collector by
`docker compose up`. It serves the page, the collector's `state.json` and the packs the collector
downloaded, and keeps the settings chosen on the displays' settings screens for the whole
deployment, so that every display shows the same knight. It is written in Python with the
standard library alone, in `server/`, and runs from the same image as the collector.

The server is optional. The page still works from any web server of your own (see
[page.md](./page.md#deploying)); each browser then keeps its own settings.

## What it serves

| Address | What | Cached |
|---|---|---|
| `/`, `/index.html` | the page, stamped with its version | asked for again each time (`no-cache`) |
| `/version.json` | the page's version, which open displays check every five minutes | `no-cache` |
| the page's other files | scripts, styles, the font, the icons, the packs that ship with the page | a year when the address carries `?v=`, as the stamped page's addresses do; `no-cache` otherwise |
| `/data/state.json` | the collector's latest state file | `no-cache` |
| `/data/packs/<name>.json` | the packs the collector downloaded, each by a plain name | `no-cache` |
| `/api/settings` | the shared settings: `GET` and `PUT` | `no-cache` |

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

**Methods.** `GET` and `HEAD` everywhere, `PUT` at `/api/settings` alone. Any other method is
`405 Method not allowed`, with an `Allow` header naming what is.

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
`config.toml` ([configuration.md](./configuration.md#the-settings-screens-defaults)). A store with
nothing saved gives four empty sections.

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

## The settings store

The shared settings live in one file, `settings.json`, in the server's own folder
(`KNIGHTWATCHER_SERVER_VAR`, `./var/server` unless set), in the same shape as the API gives them,
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
from disk. The levels, the carry-over of a browser's earlier choices and the rest are in
[page.md](./page.md#settings).

## Running it

`docker compose up -d` starts the collector and the server together. The README's quick start
does it from nothing. The server's part of `compose.yaml`:

- the image's `python -m server`, as uid and gid 10001, with a read-only root filesystem, no
  capabilities and `no-new-privileges`;
- the collector's output folder (`KNIGHTWATCHER_OUT`) mounted read-only at `/out`, and the
  server's own folder (`KNIGHTWATCHER_SERVER_VAR`) at `/var/lib/knightwatcher-server`, the one
  place it writes;
- inside the container it listens on port 8080, published on the host at
  `KNIGHTWATCHER_SERVER_ADDRESS` and `KNIGHTWATCHER_SERVER_PORT` (all addresses and 8080 unless
  set);
- a health check, `python -m server --health`, which asks the server for the page and the
  settings and fails unless both answer.

Its own folder must exist and be writable by uid 10001, as the collector's are;
[configuration.md](./configuration.md#the-accounts) has the commands. The server refuses to start
without it, and says so.

**Logs.** The server logs its start, each save (`settings saved: look`), each refused write with
its reason, and its errors. It does not log ordinary requests, since every display asks every
five seconds, and it logs no client address.

**Outside Docker**, for development, from the repository's root:

```bash
python3 -m server.stamp /tmp/kw-page   # a copy of web/, made first with cp -r web /tmp/kw-page
python3 -m server --web /tmp/kw-page --out /path/to/the/collectors/output --data /tmp/kw-data \
  --address 127.0.0.1 --port 8080
```

`--web` may name `web/` itself, unstamped, for a `dev` page that never checks for a new version.

## Security

**Open on the LAN, with no login.** By default the server is published on every address of the
host, and anyone who can reach that port can see the display, read `state.json` and change the
shared settings. `state.json` describes the homelab: its containers, its machines, what is being
watched. That is the owner's call for a home network, and it is the default because a wall
display has no keyboard to log in with. Choose it knowingly:

- **Never publish the server to the internet without a login in front of it.** Put it behind your
  own reverse proxy with authentication, as below, or a VPN.
- To keep it to one machine, set `KNIGHTWATCHER_SERVER_ADDRESS=127.0.0.1`: a reverse proxy or a
  monitor on the same host can still reach it, and nothing else can.
- Docker publishes ports with its own firewall rules, which go around a host firewall such as
  `ufw`. Binding to an address, as above, is the reliable way to limit who can reach it.
- A page on another site cannot write the settings (the origin check above), but a site that
  points its own name at your server's address can read what the server serves through a
  visitor's browser. A login in front closes that too.

**What it can touch.** The server gets no credential: `compose.yaml` passes it no variable from
`.env` at all, and reads only its address and port to publish it. It mounts no secret, not
`config.toml`, not `/proc` and not the collector's memory. It reads the collector's output
read-only and writes only its own folder. It runs on Docker's own network for the project, not the
host's, so it reaches nothing on the host's loopback. It shares uid 10001 with the collector;
since the two run in separate containers, it cannot see the collector's processes or their
environment.

**What a write can do.** A `PUT` changes how the knight looks, the words' size and clock, the
quiet scenes and where some conditions play, for every display. It cannot change a source, a
threshold, a watched thing or a credential, and every value is one the collector's checks accept.

## Behind a reverse proxy

To reach the display as `https://knightwatcher.<your domain>`, publish the server on the loopback
address and let the reverse proxy you already run add TLS and a login. In `.env`:

```bash
KNIGHTWATCHER_SERVER_ADDRESS=127.0.0.1
KNIGHTWATCHER_SERVER_PORT=8080
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

Caddy passes the original `Host` on by itself. With nginx, say so, or every write is refused as
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
value gets the same words `config.toml` gets, the atomic write and the store read again at start.
`tests/server/test_stamp.py` stamps a copy of `web/` and checks it is byte for byte what
`tools/deploy.sh` makes of it.
