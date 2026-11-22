# Providers

The collector reads the streams playing, the adverts blocked, the bans and the imports of a
homelab's services through providers. This page is for anyone writing or changing a provider file: what a
provider fills, the format of the file, the path syntax it uses, how a file is run and checked,
how to prove one against a live service, and where files of your own go. Choosing a provider in `config.toml` is in
[configuration.md](./configuration.md#sources); the collector's side is in
[collector.md](./collector.md#kinds-and-providers).

## Kinds and providers

A **kind** is the fixed shape of one sort of reading. The kind owns everything after the service
has answered: cleaning and cutting the words, the markers kept in the memory file, the events and
the facts written to `state.json`. There are four, each a module in `collector/kinds/`.

A **provider** fills a kind's shape from one service. A provider is a TOML file: the requests to
make, the login, and paths into the JSON replies mapped onto the kind's fields. One engine,
`collector/providers/engine.py`, runs every file, and nothing in a file runs as code. The built-in
files are in `collector/providers/builtin/`, one for each service, named after the provider's id.
Files of your own, for a service no built-in reads, go in the providers folder beside
`config.toml` and are run by the same engine under the same checks
([Your own provider files](#your-own-provider-files)). A service no file can describe is read by a
**code adapter**, a short Python class returning the same fill: `fail2ban`, which reads fail2ban's
SQLite database, is the one built in ([collector.md](./collector.md#kinds-and-providers)).

| Provider | Kind | Service | Read by |
|---|---|---|---|
| `tautulli` | streams | Tautulli's `get_activity` | `[sources.streams]`, the default for `from` |
| `plex` | streams | Plex Media Server's `/status/sessions`, with the owner's token in the `X-Plex-Token` header | `[sources.streams]` with `from = "plex"` |
| `adguard` | adblock | AdGuard Home's `/control/stats` | `[sources.adblock]`, the default for `from` |
| `pihole` | adblock | Pi-hole 6's `/api/stats/summary` and `/api/history`, through a session | `[sources.adblock]` with `from = "pihole"` |
| `technitium` | adblock | Technitium DNS Server's dashboard statistics (version 15 or later), with an API token | `[sources.adblock]` with `from = "technitium"` |
| `fail2ban` | security | fail2ban's database, a code adapter | `[sources.security]`, the default for `from` |
| `sonarr` | imports | Sonarr's import history | `[sources.sonarr]`, or an entry of `[[sources.imports]]` |
| `radarr` | imports | Radarr's import history | `[sources.radarr]`, or an entry of `[[sources.imports]]` |
| `lidarr` | imports | Lidarr's history of album imports, one record for each album | `[sources.lidarr]`, or an entry of `[[sources.imports]]` |

`[sources.streams]`, `[sources.adblock]` and `[sources.security]` name their provider with `from`,
a built-in's id or one of your own; `[sources.sonarr]`, `[sources.radarr]` and `[sources.lidarr]`
read the provider of their own name. Each entry of `[[sources.imports]]` names any provider of the
imports kind with `from`, a built-in's or one of your own, and is a source of its own,
`imports:<name>` ([configuration.md](./configuration.md#more-imports)). Every request a provider makes goes to the
section's `url`, and its credentials are read from `.env` as `KNIGHTWATCHER_<SECRET>_<FIELD>`, where
`<SECRET>` is the section's `secret`, the provider's id when it is left out, and `<FIELD>` each
credential the file names.

## What each kind takes

A provider returns a **fill**: an object with the kind's fields. The engine checks the fill against
the kind's declaration before the kind sees it, so a field of the wrong type, a field the kind does
not have, or a field the setting `show` holds back fails the read with a message naming it
(`provider gave sessions[2].title as a whole number`).

Types: `int` is a whole number, `number` any number, `string` text as the service sent it (the
kind cleans it), `bool` true or false, `time` a moment, and `raw` a value the kind reads itself.

### streams

| Field | Type | Required | Read with `show` | Meaning |
|---|---|---|---|---|
| `count` | int, 0 or more | no | any | how many streams the service reports; when absent, the number of `sessions` |
| `sessions` | list of objects | yes, may be empty | any (its length alone with `count`) | one for each stream playing |
| `sessions[].title` | string | no | `titles`, `names` | what plays, composed by the provider (`The Night Shift S02E04`) |
| `sessions[].who` | string | no | `names` | who is watching |
| `sessions[].order` | raw | no | `titles`, `names` | a key that rises as streams start: a value whose text is all digits sorts by its number, others after |
| `sessions[].key` | string | no | `titles`, `names` | the stream's identity, for a service that gives no `order` |

The streams are listed in the order they started. A provider whose service gives a number that
rises as streams start (Tautulli's and Plex's session key) fills `order`, and the kind sorts by it.
One whose service gives none fills `key`, the stream's identity as the service gives it, and the
kind lists those streams in the order it first saw each key, keys seen at the same read by the key
(digits by their number, before other text). That order is kept by the running collector alone,
only for the keys playing at the last read, and never in the memory file. Streams with an `order`
come first, then those with a `key`, then the rest in the order the provider gave them.

The kind keeps the facts of [state.md](./state.md#fields): titles cut to 60 characters, names to
16, at most 32 sessions listed.

### adblock

| Field | Type | Required | Meaning |
|---|---|---|---|
| `blocked` | int | one of `blocked` and `recent` | queries blocked over the service's own window; it rises as queries are blocked and may fall when the window moves |
| `recent` | list of objects, oldest first, at most 1,440 | one of `blocked` and `recent` | finished time buckets, for a service whose only fresh counts are buckets over a sliding window |
| `recent[].at` | time | yes | the bucket's time, as the service labels it; a later bucket has a later time |
| `recent[].blocked` | int, 0 or more | yes | the queries it blocked |
| `settle_s` | int, 0 to 3,600 | no | with `recent`: the seconds after a bucket's `at` before the service's count of it is final |
| `window` | object | no | the service's statistics window, for the normal rate and today's first count |
| `window.queries` | list of numbers | no | all queries per bucket, oldest first |
| `window.blocked` | list of numbers | no | blocked queries per bucket, oldest first |
| `window.unit_s` | int | with `window` | the bucket's length in seconds |
| `window.current` | bool | with `window` | whether the last bucket is the current, unfinished one |

A file gives exactly one of `blocked` and `recent`. With `blocked`, each read's rise is counted
and a fall raises nothing. With `recent`, each read adds the buckets whose `at` is later than the
newest one already counted, which is kept in the memory file; on first sight the newest is noted
and nothing is added. A bucket younger than `settle_s` (its `at` later than the collector's clock
less `settle_s`) is left for a later read, for a service that finishes a bucket's count a little
after the bucket ends; Technitium's file sets 20 seconds. Subtracting two sums of a sliding window
would undercount whatever left the window between the reads, which is why `recent` exists.

The normal rate is `blocked` (with `recent`, the sum of `window.blocked`) divided by the window
counted from its first bucket with any queries.
Today's first count is the last bucket when a bucket is a day or more, else the buckets since
local midnight: the last `floor(seconds since midnight / unit_s) + 1`, one fewer when `current` is
false. Without `window.queries`, and with `recent` without `window.blocked` as well, a fly is 50
blocked queries; without `window.blocked`, the count for today starts from nothing.

### security

| Field | Type | Required | Meaning |
|---|---|---|---|
| `bans` | list of objects, newest last, at most 5,000 | yes, may be empty | every ban the service knows of in the last 24 hours, or since the start of `conditions.attack.window_s` when that is longer |
| `bans[].ip` | string | yes | the address banned |
| `bans[].jail` | string | no | the jail, or whatever the service calls the rule that banned it |
| `bans[].at` | time | yes | when the ban was made |
| `bans[].key` | string | no | the ban's identity; `jail|ip|time` when left out |
| `complete_s` | int, 0 or more | no | how far back the list reaches, in seconds, when that is less than the span asked for |

The kind counts from the list at every read rather than from differences between reads:
`facts.security.bans_24h`, the bans in the attack window, whether one is in a watched jail, and
the ban the attack's words name. A ban whose key it has not seen is new, and each read with new
bans gives one `ip_banned` event naming the newest ([collector.md](./collector.md#attacks)). A
lifted ban should leave the list, as fail2ban deletes its rows.

### imports

| Field | Type | Required | Meaning |
|---|---|---|---|
| `records` | list of objects, at most 50 | yes | the newest import records the service lists |
| `records[].id` | int, a JSON integer | yes; a record without one is left out | the rising record number |
| `records[].title` | string | no | the caption's title, composed by the provider |

Each new record is one `import` event, so a provider should list one record for each thing the
display should show once. Lidarr writes a record for each track it imports and another for each
album once all of its tracks have imported; the `lidarr` file asks its history for the album
records alone (`eventType=8`, `downloadImported`), so an album is one crate, not one for each of
its tracks.

## The file

The built-in Tautulli file shows most of the format:

```toml
format = 1
id = "tautulli"
kind = "streams"
name = "Tautulli"
docs = "https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference"

[credentials]
api_key = "Tautulli's API key. In Tautulli: Settings, Web Interface, API, with Enable API ticked."

[[request]]
path = "/api/v2"
query = { apikey = "{credential.api_key}", cmd = "get_activity" }

[[request.require]]
path = "$.response.result"
equals = "success"
message = "Tautulli reported an error"
auth = { path = "$.response.message", contains = "key", ignore_case = true, message = "API key refused" }

[fill]
count = { path = "$.response.data.stream_count", type = "int" }

[fill.sessions]
each = "$.response.data.sessions[*]"

[fill.sessions.vars]
type = "$.media_type"
grand = { path = "$.grandparent_title", type = "string" }
season = { path = "$.parent_media_index", type = "int" }
episode = { path = "$.media_index", type = "int" }
title = { path = "$.title", nonzero = true }
full = { path = "$.full_title", nonzero = true }
friendly = { path = "$.friendly_name", type = "string" }
user = { path = "$.user", type = "string" }
username = { path = "$.username", type = "string" }
key = "$.session_key"

[fill.sessions.fields]
who = { pick = ["friendly", "user", "username"] }
order = "key"

[[fill.sessions.title]]
when = { type = "episode" }
try = ["{grand} S{season:02}E{episode:02}", "S{season:02}E{episode:02}", "{grand}", "{full}"]

[[fill.sessions.title]]
when = { type = "track" }
try = ["{grand} - {title}", "{grand}", "{title}"]

[[fill.sessions.title]]
try = ["{title}", "{full}"]
```

### The top level

| Key | Required | Meaning |
|---|---|---|
| `format` | yes | the format's version, 1 |
| `id` | yes | 1 to 24 of `a` to `z`, `0` to `9` and `_`, starting with a letter; the file's name without `.toml`, and the default `secret` |
| `kind` | yes | `streams`, `adblock`, `imports` or `security` |
| `name` | yes | what the admin page and messages call the service, up to 60 characters |
| `docs` | no | the address of the API reference the file was written from |

### [credentials]

One key for each credential the provider uses, from `api_key`, `token`, `username`, `password`
and `header`, with the help the admin page shows for it. A credential is used only inside a
request: in a header, in the query, or in `[auth]` (a basic login, or a session login's body). The format refuses `{credential.<field>}`
anywhere else.

### [settings]

Keys the provider needs beyond the section's own, each a table with `type` (`string`, `integer`,
`number` or `boolean`), `default` and `help`, and optionally `min`, `max` and `values`:

```toml
[settings]
page_size = { type = "integer", default = 10, min = 1, max = 50, help = "Sessions read per call." }
```

A request uses one as `{setting.<key>}`. The section that chooses the provider may set it, as
`page_size = 20` beside its `url`, and the collector checks the value against the declaration; a
key the section does not set takes its default. A setting cannot take the name of one of the
section's own (`enabled`, `every_s`, `from`, `url`, `secret`, `verify_tls`, `show`,
`fly_every_s`). None of the
built-in files declares one.

### [auth]

Optional. A key sent in a header or the query needs no `[auth]`: the request says where it goes.
HTTP basic credentials need the table, and are sent with the first request, since a request
without them followed by a retry is what locks an account out:

```toml
[auth]
method = "basic"
username = "{credential.username}"
password = "{credential.password}"
```

A service that hands out a session at a login takes `method = "session"`. The built-in Pi-hole
file's:

```toml
[auth]
method = "session"
login = { path = "/api/auth", json = { password = "{credential.password}" } }
sid = "$.session.sid"
valid_s = "$.session.validity"
send = { header = "X-FTL-SID" }
logout = { path = "/api/auth" }
statuses = { 401 = "password refused, or Pi-hole has none set", 404 = "not Pi-hole 6 (version 5 is not supported)", 429 = "Pi-hole's sessions are all taken, or too many logins" }
not_json = "not Pi-hole 6 (version 5 is not supported)"

[[auth.require]]
path = "$.session.sid"
type = "string"
message = "Pi-hole has no password set; the collector needs one"
```

| Key | Required | Meaning |
|---|---|---|
| `login` | yes | `path`, appended to the section's `url` as a request's is, and `json`, the body POSTed to it: a table of text (which may hold `{credential.<field>}` and `{setting.<key>}`), numbers, `true` or `false`, and tables of the same, at most 16 members and 4 tables deep |
| `sid` | yes | the path to the session's id in the login's reply. The id must be printable ASCII with no space, quote or backslash, at most 512 characters, or the read fails (`the login gave no session id`) |
| `valid_s` | no | the path to the seconds the session lasts. Left out, or finding nothing, the session is kept until it is refused |
| `send` | yes | where the id goes with each request after: `{ header = "<name>" }`, a header named as a request's are, or `{ query = "<name>" }`. A request may not set that header or parameter itself |
| `logout` | no | `path`, where a DELETE with the session's id ends the session when the provider is closed |
| `statuses`, `not_json`, `require` | no | as a request's, for the login's reply |

The engine logs in before the first read and keeps the session's id in memory alone. The session
is used until 30 seconds before `valid_s` runs out (half a session shorter than a minute), counted
from its last use, since a service such as Pi-hole extends a session at each use; then the next
read logs in again. A 401 on a session made at an earlier read (the service restarted, or dropped
it early) logs in again once, in the same read. A refused login (401, 403 or 429), and a 401 on a
session just made, are refused credentials, with the back-off; so is a `require` of the login whose
`auth` test matches.

### [[request]]

One to three requests, made in order at every read.

| Key | Meaning |
|---|---|
| `id` | how the fill names this reply: 1 to 24 of `a` to `z`, `0` to `9` and `_`; may be left out when there is one request |
| `path` | appended to the section's `url`: starts with `/`, printable ASCII with no space, `\`, `@`, `?` or `#`, and no `//` at its start or `://` anywhere. It may hold `{setting.<key>}`, which is percent-encoded |
| `query` | a table of names and text values, which the engine encodes in its order. Values may hold `{credential.<field>}` and `{setting.<key>}` |
| `headers` | a table of header names (letters, digits and `-`) and values (printable ASCII), with the same templates. `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Cookie`, `User-Agent`, `Proxy-Authorization`, any `Proxy-` header and, with `[auth]`, `Authorization` are refused. `User-Agent: knightwatcher` is always sent |
| `statuses` | a table of HTTP statuses and the message shown in `sources` for each, in place of the engine's own (`HTTP 404`) |
| `not_json` | the message shown when the reply is not JSON, in place of `response is not JSON` |
| `require` | `[[request.require]]` tables, checked in order on the reply |

Every request is a GET. A request's parts never take a value from a reply, so a reply cannot steer
the collector to another path or address. The one exception is a session's id, which goes only
where `[auth]`'s `send` says.

A `require` fails the read with its `message` unless the value its `path` finds passes one test:
`equals` a literal (a string, a number, `true` or `false`, compared as JSON compares them), `type`
(`object`, `list`, `string` or `number`), or `present = true` (found, and not `null`). It may carry
`auth`, a second test on its own `path` that turns the failure into refused credentials, with the
back-off: `contains` a piece of text (with `ignore_case = true` if wanted), or `equals` a literal.

### [fill]

`[fill]` maps the replies onto the kind's fields. The kind's declaration decides how each entry is
read.

**A field of one value** is a table, or a constant:

```toml
count = { path = "$.response.data.stream_count", type = "int" }
blocked = { path = "$.num_blocked_filtering", type = "int", required = "no blocked count in the statistics" }
current = true
```

- `from` names the request whose reply is read; it may be left out with one request, and a field
  inside an object takes the object's.
- `path` finds the value; a path that finds several takes the first.
- `type` is `int`, `number`, `string`, `bool`, `time` or `raw`, the field's own type when left
  out. `int` takes a JSON integer, a number (cut to its whole part, as Python's `int()` does), true
  or false (1 and 0), or text `int()` accepts; with `strict = true`, a JSON integer alone. `time`
  takes ISO 8601 (a time without a zone is UTC) or epoch seconds. A value of another type is
  nothing found, and so is `null`.
- `map` is a table from the text found to the value used (`{ hours = 3600, days = 86400 }`); a
  value not in it is nothing found.
- `default` is used when nothing is found.
- `required` is the message the read fails with when nothing is found. A field the kind requires
  at the top of the fill needs one, or a default; within an object, a required field that is
  missing leaves the whole object out.

**A list of numbers or text** takes a path that finds several values, every one of which must be
of the type, or the field is left out:

```toml
[fill.window]
queries = { path = "$.dns_queries[*]", type = "number" }
blocked = { path = "$.blocked_filtering[*]", type = "number" }
unit_s = { path = "$.time_units", map = { hours = 3600, days = 86400 } }
current = true
```

**An object** is a table of its fields, each written as above, with an optional `from` for all of
them.

**A list of objects** is built in one of two ways.

- With `each`, one item for each value the path finds that is a JSON object. `vars` names values
  read from the item, the item being `$`: a path, or a table with `path`, `type`, `strict`,
  `default` and `nonzero = true`, which counts 0 and false as nothing found. `fields` maps an item
  field to a var by name, or to `{ pick = [...] }`, the first of the vars that is present. Any other
  key of the table is an item field built from templates, by cases (below).
- With `zip = true`, the n-th value of each field's path makes the n-th item. Each field is a
  table with `path` and `type`, and lists of different lengths fail the read
  (`the lists of sessions differ in length`).

A field the kind requires of an item (an import's `id`) leaves the item out when it is missing; it
never fails the read.

**Present** means found, not `null`, and, for text, not empty once control characters and runs of
white space are made one space. A number is present even when it is 0, unless its var is
`nonzero`.

**Templates** hold `{var}` and `{var:0N}`, a whole number zero-padded to N digits, N from 1 to 9;
`{{` and `}}` stand for braces. A number fills `{var}` as Python's `str()` writes it. A template
gives a value only when every var in it is present, and its text is cut at 1,000 characters.

**Cases** are `[[fill.<list>.<field>]]` tables, each with `try`, the templates to try in order, and
an optional `when`, a table of vars and the literals they must equal. The first case whose `when`
matches is used, and the first of its templates that gives a value is the field's value. When the
matching case's templates all fail, the field is left out: later cases are not tried.

**Read only what is allowed.** A var is read only when a field that may be read needs it. With
`show = "titles"`, the vars behind `who` are never looked at; with `show = "count"`, the engine
counts the items without reading anything of them.

### What a file may not hold

Code, regular expressions, file paths, addresses, absolute URLs, request bodies (but a session
login's), methods other than GET (but a session's login and logout), references to reply values
inside a request (but a session's id, where `send` says), references to credentials outside a
request,
and more than 3 requests, 64 vars in a list, 16 cases for a field, 8 templates in a case, or
64 KiB in all. The checks are in `collector/providers/format.py`; a file that fails them gets one
message for each fault, naming the file and the field
(`tautulli.toml: request[0].path: must start with /`). A built-in file that fails is a bug, caught
by `tests/collector/test_provider_format.py`.

## The path syntax

Paths are a strict subset of JSONPath as [RFC 9535](https://www.rfc-editor.org/rfc/rfc9535)
defines it, and each allowed form means what the RFC says.

| Allowed | Example |
|---|---|
| the root | `$` |
| a member by name | `$.response.data`, `$['X-Field']` |
| an element by index, from the end when negative | `$.history[0]`, `$.history[-1]` |
| every member or element | `$.records[*]`, `$.*` |
| a filter: a comparison with a literal, `==` or `!=` | `[?@.label == 'Blocked']` |
| a filter: existence | `[?@.NowPlayingItem.Type]` |
| filters joined by `&&` | `[?@.type == 'episode' && @.index]` |

Literals are text in single or double quotes, numbers, `true`, `false` and `null`. The query
inside a filter is `@` followed by names and indices. Left out: `..` (descendants), slices, unions,
functions, `||`, `!`, parentheses and the comparisons other than `==` and `!=`. Anything else is
refused with the position of the fault:

```
tautulli.toml: fill.sessions.each: unexpected ".." at character 11
```

A path that finds several values gives them in document order. A path that finds nothing gives
nothing, never an error. A member that exists with the value `null` exists, as the RFC has it, and
something found is never equal to a literal it is not: `[?@.x != 'a']` keeps an item with no `x`.
A path finds at most 10,000 values; past that the read fails (`a path found too many values`).

## A read

1. A provider that logs in by session and holds no live session logs in first.
2. Each request is made in order through `collector/net.py`: direct, never through a proxy, a
   redirect an error, the reply cut at 4 MiB, `http_timeout_s` each, and the certificate of an
   `https` address checked unless the section sets `verify_tls = false`.
3. The reply is parsed as JSON, refused when nested deeper than 64, and checked by `statuses`,
   `not_json` and `require`.
4. The fill is built from the replies, reading only the fields the kind allows.
5. The fill is held to the kind's declaration, and the kind makes the reading.

A read has the runner's limit, as every source's does: 66 percent of the source's pace or of the
interval, whichever is longer.

**Errors.** HTTP 401, 403 or 429, and a `require` whose `auth` test matches, are refused
credentials: the runner pauses the source for `auth_backoff_s` (20 minutes at least), which keeps
AdGuard Home's lockout of five bad logins out of reach. Every other failure is a short message in
`sources`: the engine's own (`timed out`, `TLS error`, `HTTP 500`, `response is not JSON`) or the file's. No
message holds an address, and every credential value is scrubbed from it. An error inside the
engine itself is `internal error (TypeError)`, with its trace in the log.

## Safety

A provider file is data: the engine reads it, and nothing in it is executed.

1. **One address.** Every request goes to the scheme, host and port of the section's `url`, the
   path appended to it. A file holds no address and cannot build one.
2. **No redirects and no proxies.** A redirect is an error, and a proxy named in the environment is
   ignored.
3. **GET alone**, but for a session's login, one POST, and its logout, one DELETE, both to paths at
   the same address.
4. **Headers** are named with letters, digits and `-`, never `Host`, `Content-Length`,
   `Transfer-Encoding`, `Connection`, `Cookie`, `User-Agent`, `Proxy-Authorization` or a `Proxy-`
   header, and their values are printable ASCII, so no line break can be slipped in; a credential
   whose value would put one in fails the read before anything is sent.
5. **Credentials.** A file names credential fields; the values come from `.env`, and a value goes
   only into that provider's own requests: a header, the query, a basic login, or a session
   login's body. It never reaches the fill, a message or the state file. A session's id is held
   the same way, in memory alone. Over plain `http` a credential crosses the network as it always
   has; `https` keeps it off the wire, and `verify_tls = false` keeps it off the wire but no longer
   proves who receives it.
6. **No chaining.** No request is built from a reply, but for a session's id going where `send`
   says.
7. **What it can fill.** Only the shape of its kind, checked like any other, and `show` is held the
   same way for every provider of streams.
8. **No shadowing.** A file of your own whose id is a built-in provider's is left out, so a file in
   the folder can never stand in for a built-in one.

What the rules leave possible: a file can make the collector send GETs, and a login and a logout,
to the address you typed in
`config.toml`, carrying the credential you named for it. That is the same power `config.toml` and
`.env` already give whoever writes them. They cannot stop a wrong address being typed.

## Your own provider files

A service no built-in provider reads can be read through a file of your own, as long as it answers
GET requests with JSON and the file format can describe it.

**The folder.** Files go in `providers/` beside `config.toml`, one provider each, named after the
provider's id with `.toml`: `providers/myflix.toml` holds `id = "myflix"`. The repository ships
the folder empty, with a `.gitkeep`, and git ignores everything else in it. `compose.yaml` mounts
it read-only at `/etc/knightwatcher/providers` in both containers, from `KNIGHTWATCHER_PROVIDERS`
in `.env` (`./providers` when left out): the collector reads the files, and the bundled server
checks a change on the admin page by them. The collector's `providers_dir` setting names the
folder, relative to the one `config.toml` is in; a folder that does not exist holds no files and
is no problem. The files need only be readable by everyone.

**Choosing it.** A section of the file's kind names it with `from`, and sets any settings the file
declares:

```toml
[sources.streams]
from = "myflix"
url = "http://192.0.2.20:8080"
page_size = 20
```

A file of the imports kind is chosen by an entry of `[[sources.imports]]`, under a name of its
own:

```toml
[[sources.imports]]
name = "books"
from = "shelf"
url = "http://192.0.2.36:8080"
```

That source is `imports:books` in the state file and in the memory file. The credentials of
either are read as any provider's, from `KNIGHTWATCHER_<SECRET>_<FIELD>` with the section's or the
entry's `secret`, the file's id when left out: `KNIGHTWATCHER_MYFLIX_TOKEN` and
`KNIGHTWATCHER_SHELF_API_KEY` here. The collector's container gets only the variables compose names,
so the name also goes in the collector's `environment` in `compose.override.yaml`
([configuration.md](./configuration.md#env-host-paths-the-servers-address-and-credentials) has
the snippet).

**Which files are read.** Names ending `.toml` and not starting with a dot, in the order of their
names, at most 32; those after the 32nd are left out. A file is left out when its name is not a
valid id with `.toml`, its id is a built-in provider's, it is a link or not a regular file, it is
larger than 64 KiB, it is not TOML, or it breaks any rule of the format above.

**A bad file** is left out and never stops the collector or another source.

- Its problems go to the collector's log and to the state file's `config.problems`, each naming the
  file and the field: `providers/myflix.toml: request[0].path: must start with /`. The admin page
  shows them.
- A section whose `from` names it runs and fails at every read with
  `provider myflix refused; see the settings problems`, as a source with a missing credential does.
- A `from` naming no file at all stays a configuration error, so a typo is caught.
- `--check-config` lists every problem, and exits 2 when a `from` names a file that was left out;
  the problems of a file no section names are warnings, and the exit is 0
  ([configuration.md](./configuration.md#checking)).

**Changing one.** The collector looks at the folder at the start of every poll, each file by its
name, inode, size and time, and takes up a file added, changed or removed between polls, as it
takes up a change to `config.toml`. A source whose file changed starts afresh; the others carry on.
Nothing needs restarting.

**Proving it.** Once it passes, read it once with `--probe` (below), which prints the fill with
every text masked. A file that was left out makes the probe print its problems and exit 2.

## Proving a provider: --probe

```bash
docker compose run --rm collector --probe streams
```

reads one source once through its provider, built-in or your own, with the settings in use (an
entry of `[[sources.imports]]` by its source's name, `--probe imports:books`), and
prints the fill and the facts the kind would write with every text replaced by its type and length
(`<string 21>`). Numbers and true or false are shown as they are, and no credential is printed,
only the names of the variables read. It runs inside the container, so the credentials come from `.env` through
compose and never through the person running it. A provider that logs in by session logs out
once the probe has read, so a probe holds none of the service's sessions. It writes nothing of the collector's own, and a
source the running collector has paused after refused credentials is not read until the pause
ends, so a probe never adds to a lockout. It exits 0 with a reading, 1 when the read fails, and 2
when the source is not one read through a provider, is not set up, its settings do not pass, or
its provider is a file that was left out.

On the host, outside the container, `--env-file PATH` reads the credentials from a `.env` file
rather than the environment, and `--config` and `--admin` name a config of the probe's own, so
the wall's files are not touched:

```bash
python3 -m collector --config /tmp/probe/config.toml --admin /nonexistent \
  --env-file .env --probe streams
```

`--record FOLDER` also writes the read's exchanges to a file in that folder, mode 600: each request
with each credential replaced by its field's name (`{credential.api_key}`) and a session's id by
`{session.sid}`, and each request's method and each reply or error. A credential is replaced
wherever it appears, as written or percent-encoded, in the replies and errors too, since a service
may echo an address that carries it. A session login is recorded
with its JSON body as the file writes it, templates unfilled, and every text of its reply masked,
since a login's reply holds the session's id; its logout follows the read. The replies are the service's own and private: never commit them as they are. A fixture
for `tests/collector/fixtures/providers/<id>/` is made from one by replacing every value with an
invented one. The container's root is read-only, so the folder is one mounted for the run and
writable by uid 10001.

## Testing a provider

Each built-in provider has fixtures in `tests/collector/fixtures/providers/<id>/<case>.json`: the
requests expected (method, path, headers, and a session login's JSON body), with each credential
written as `{credential.<field>}`, the replies in the service's shapes with every value invented,
and the fill (by `show` for a streams provider) or the error. `tests/collector/test_providers.py`
serves the replies on a local HTTP server, fails when a request differs from the fixture's, and
compares the fill; it closes the provider after the read, so a session provider's fixture ends with
its logout. For a streams provider it also checks
that no var behind a name is read unless `show` is `names`. [tests.md](./tests.md) lists the
rest.
