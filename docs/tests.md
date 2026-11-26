# The tests

For contributors: what the tests check and how to read a failure. The commands that run them,
inside the ceiling every run keeps to, are in [development.md](./development.md#checks); the
screenshots are in [shots.md](./shots.md). Every run of a test goes through `tools/capped.sh` with
`--test-concurrency=2`, as development.md says, though the shorter commands below leave the wrapper
out.

## Every test file

| File | Checks |
|---|---|
| `tests/web/base-pack.test.js` | the shipped base pack: its contents, the free options, builds and items as designed, and whether it ships signed |
| `tests/web/base-read.test.js` | the base pack's whole read, its signed bytes and its stored looks against the copy first stored before format 1.1 |
| `tests/web/demo-devices.test.js` | the demo's devices: the default set, the Devices row's add, name, remove, up and down, the page's limits of places, the set kept and restored, Reset, `device_down`'s words held to the collector's, the Pi put in for `pi_silent`, `dv=` and the demo loop taking the set's place, nothing sent, and nothing done once the demo has stopped; Under strain's four entries in the collector's words, `mem`, `swap` and `memory_tight` bloated, one shown at a time; `bar=dev`, the Devices row alone, at load or on a change of the hash |
| `tests/web/ed25519.test.js` | the verifier against RFC 8032's vectors and `node:crypto` |
| `tests/web/effects.test.js` | each effect's cost against what it draws, and `pack.js` holding effects to their tables |
| `tests/web/fire.test.js` | format 1.2: the fields and rules of weapons and foes that fire, the aim and `fire()`, and the shot effects |
| `tests/web/fire-barrel.test.js` | no arm or gauntlet over a barrel or a shield's face, frame by frame, through the aim, `fire()`, the swat's volley and the attack |
| `tests/web/fire-acts.test.js` | the acts with a weapon that fires: the swat by shot, practice, the foe from range, the attack, the weapon that is both, the reach for the pegs and the anvil, the stowed view and the shield's lift |
| `tests/web/foe.test.js` | the goblin's plan and hit on every build with each weapon, the drawn weapon meeting the drawn goblin to [the contact standard](#the-contact-standard) |
| `tests/web/foe-fires.test.js` | a foe that fires: its pose `aim` compiled and played in place of the taunt, its shot at 1 350 missing over the head group or stopped at the shield, the foe on the right, and the flinch |
| `tests/web/format-1.1.test.js` | the world sections of format 1.1: one refused copy of the world fixture for each rule |
| `tests/web/knight.test.js` | the knight call by call against the stored record, the arm and blade checks, the gear at rest, the training pose bloated under strain short of memory |
| `tests/web/knight-free-classic.test.js`, `knight-free-broad.test.js`, `knight-free-slim.test.js` | the free items' checks of `knight.test.js`, one build each in a process of its own |
| `tests/web/loading.test.js` | the downloaded packs, the refusals and the knight drawn from code |
| `tests/web/main.test.js` | `main.js`'s calls to the display's server in each mode (a forced demo asks nothing under `api/` and no state file), and the hash listener that opens the settings screen |
| `tests/web/orbit.test.js`, `orbit-body.test.js`, `orbit-parts.test.js`, `orbit-swap.test.js` | the test world: read and drawn, its body at the ends of the ranges, its devices, cast and overlay, and the whole swap ([The test world](#the-test-world)) |
| `tests/web/pack.test.js` | the pack library and format 1.0 |
| `tests/web/patrol.test.js` | the knight's patrol: the side-step walk and the rig's gait, the plan of stops from the time alone and `pt=`, the yard's training and the smithy's quench at their stops, the visits to the television, a warning holding and resuming, an act walking the knight to its place, an event pausing it; the set in every scene, from the pack as from code, the goblin and the crate coming as with it off and drawn in front of it; and the night with a stream |
| `tests/web/pet.test.js` | the mouser cat from the pack against the code, and the engine's catch |
| `tests/web/places.test.js` | what stands in every scene's places stays on the grid and clear of the others |
| `tests/web/props.test.js` | the devices inside their places, gone against up, only what moves drawn each frame |
| `tests/web/scenes.test.js` | every scene's paint and draw against the stored records, from code and from the pack |
| `tests/web/settings-schema.test.js` | the page's lists of settings, scenes and conditions against the settings schema |
| `tests/web/settings.test.js` | the settings' levels, storage, look and engine input, the knight in 1 080 looks, the status page's read-only line on the usage counts, and its source code link |
| `tests/web/shared-settings.test.js` | the shared settings against a fake server |
| `tests/web/state.test.js` | reading the state file, against the examples in [state.md](./state.md); Under strain bloated while any machine in `machines` has `memory`, `memory_tight` from a collector from before acted as Under strain on memory, and a check that borrows either never bloated; a generic check acted as the condition it borrows, its words and level its own, a check the page cannot act skipped, and none of the borrowed condition's facts taken (the television, the streams' badge and detail, the pie's dish); `analytics` read as on, off or not known; the display's id made once and kept, replaced when malformed, fresh each load without storage, and posted to `api/displays` at load and every 30 minutes |
| `tests/web/streams.test.js` | the streams' detail line and badge |
| `tests/web/world.test.js` | the scene compiler and the medieval world's pack |
| `tests/web/world-cast.test.js`, `world-knight.test.js`, `world-props.test.js`, `world-scenes.test.js`, `world-words.test.js` | the medieval world's cast, the house and the smithy with the knight's gear, devices, scenes, and words and overlay, each from the pack against the code |
| `tests/web/world-loading.test.js` | the medieval world's pack refused, missing, failing to compile or throwing while drawing |
| `tests/web/world-mix.test.js` | parts mixed across worlds, on the settings screen and the admin page |
| `tests/web/worlds.test.js` | worlds as presets, the catalogue, the resolution rule and the devices per kind |
| `tests/tools/capped.test.js` | `tools/capped.sh` with no systemd user session: a script that caps itself as `tools/shots.sh` does runs once with `KW_CAPPED` set, a `KW_CAPPED` already set is kept, and the command's exit code is the wrapper's |
| `tests/tools/cat-stamps.test.js` | the medieval world's pack holds what `tools/cat-stamps.js` writes, pixel for pixel |
| `tests/tools/check-private.test.js` | `tools/check-private.sh` in a small repository made for the run: clean, a match, no patterns, and a pattern `git grep` cannot read |
| `tests/tools/check.test.js` | `tools/check.sh` refuses an argument it does not take, gives `node --test` glob patterns that each match a file and never a folder, and fails a shard that runs no test; the CI workflow runs every subset but `all` and `private` through it and never the private check, and `CI gate` needs every other job |
| `tests/tools/deploy.test.js` | `tools/deploy.sh` run on temporary folders and copies of `web/`; every test is skipped where `rsync` is not installed, since the tool needs it |
| `tests/tools/pack-carrier.test.js` | each carrier pushes its pack file's exact text |
| `tests/tools/settings-schema.test.js` | `tools/settings-schema.js` and what it writes |
| `tests/tools/shot-scale.test.js` | `tools/shot-scale.js` reads, shrinks and writes PNGs the same each time, and `site/img/` holds exactly the pictures of `SITE_SHOTS` |
| `tests/tools/sign-pack.test.js` | the signing tool, and the shipped packs' signatures |
| `tests/site/build.test.mjs` | the website's build: every page with its nav and footer and the demo (no `admin/` or `data/`, stamped with the commit, never `dev`, the stamp the same as `server/stamp.py`'s), the home page's demo buttons and highlights, the legal pages against `legal/`, the Web Analytics snippet on every page but the demo and the 404 page, `_headers`, no outside host in the demo but the source link, and the local preview |
| `tests/site/docs.test.mjs` | the website's docs and Supported Feeds: the docs' index from README.md's Documentation section and the build stopping on a section it cannot read, a page for every doc, a file of `docs/` the list leaves out under More, every link between the site's pages and every anchor landing, every link to the repository naming a file that is there, and the services read from the provider files |
| `tests/site/markdown.test.mjs` | the markdown renderer of the docs and the legal pages: escaping, links, GitHub's heading ids, nested and numbered lists, tables and their escaped pipes, fenced code, comments left out, and everything outside its subset refused |
| `tests/site/worker.test.mjs` | the website's Worker, the redirect from `www` and the headers it sets, and `wrangler.jsonc` |
| `tests/collector/test_cli.py` | `--check-config`, its warnings of old settings read in today's terms, `--once` and `--health` |
| `tests/collector/test_conditions.py` | the conditions the collector judges: holding and clearing; Under strain on the host's CPU and memory, each pair raised at its threshold, held by the band and cleared after `clear_after_s`, a failed read absent with its words standing, a change taken up keeping each pair, the device's place, and every row of the words' table (`MEM`, the cut name, both resources, several machines); and the rest |
| `tests/collector/test_config.py` | reading `config.toml`: defaults, paces, ranges, removed and unknown settings; `band` below the thresholds and the host's `name`; `[conditions.memory_tight]`, `memory_tight` in the priority list and in a check's `as`, each read as Under strain with a warning, from `config.toml` and from admin.json, and admin.json's old paths written in today's terms; the committed example as it stands (the general sources alone) and with every commented table taken in |
| `tests/collector/test_contract.py` | the contract check against [state.md](./state.md): devices, `device_down`, Under strain's `machines`, defaults and the parts, and its examples, a check's `as` and a machine under strain among them |
| `tests/collector/test_devices.py` | the checks behind devices, against local sockets and a local HTTP server |
| `tests/collector/test_reload.py` | `admin.json` laid over `config.toml`, the start and reload rules, the credentials' names, the providers folder watched and moved |
| `tests/collector/test_runner.py` | one poll: the file it writes, the defaults, failing and slow sources, each source's pace; a source replaced or taken away by a change closed, one kept not, and every source closed as the collector stops |
| `tests/collector/test_schema.py` | the settings schema against the collector, the example files and `compose.yaml` (`KW_ANALYTICS` and the credentials alone in the collector's environment, both services on the published image with `build: .` kept), the providers folder's mount, its `.gitkeep` and its lines in `.gitignore`, and `.dockerignore` letting `collector/`, `server/` and `web/` alone into the image |
| `tests/collector/test_heartbeat.py` | the usage counts, every send to a local fake receiver: the payload's exact fields and the form of each, `check()` refusing each breach of the contract, built-in ids against `custom` for worlds, builds, items, look values and a provider file of the user's own, imports and checks counted and never named, no name, title, address, URL or credential from a config full of them, the household look from the server's `settings.json` over `[look]`, the version stamp, whole days and hours; the install id made once with the notice, kept, and made again when its file is emptied or broken; `KW_ANALYTICS` (only `on`, trimmed and in any case, turns it on; `off`, empty and unset leave it off, and near misses such as `yes` leave it off with a warning), off making no id and no connection; the schedule on a fake clock (at start, every six hours, an hour after a failure, the warning at most once an hour, the 10-second timeout, no send overlapping or holding up a tick); the display count from `displays.json` with ids older than six hours dropped; `analytics` in the state file only when the command line sets it, so the port proof holds; and `--once`, `--check-config`, `--health` and `--probe` never sending while the loop sends at start when the counts are on, and sends nothing with `KW_ANALYTICS` off or unset |
| `tests/collector/test_sources.py` | each source of its own against invented answers |
| `tests/collector/test_kinds.py` | the streams, adblock and imports kinds through their built-in providers against invented answers; the streams kind through the plex provider (the order the streams started at each `show`, the token in its header with JSON asked for, nothing playing, a refused token) and through the tracearr provider (the order of the start times at each `show` whatever order Tracearr lists in, the key in the `Authorization` header with JSON asked for, nothing playing, a refused key) and through the jellyfin provider (the order of first sight across reads whatever order Jellyfin lists in, a new stream at the end, an idle session left out, the key in Jellyfin's `Authorization` form with JSON asked for, nothing playing with the playing item left out or `null` and with no session at all, a refused key), its first-seen order from fills (a new stream at the end, keys seen together by number then text, only the keys playing kept, nothing read or kept with `count`, a start order first, nothing of the key in the facts or the memory, one order for each source), and a start time as the order (by its moment, ties by the key); the adblock kind's `recent` mode through the technitium provider (first sight, minutes added as they appear and never twice, a minute left until it has settled, a gap longer than the hour, the rate and the first count from the last day, midnight, a marker of the other mode dropped, a marker that cannot be true, the token in the `Authorization` header, an error and a refused token); the security kind from fills (the counts, the window, a watched jail's ban, new bans by key, one event a read, first sight, a restart, the memory's cap and floor) and from a provider file of a user's own; the fill's checks, and when a source read through a provider starts afresh |
| `tests/collector/test_fail2ban.py` | the fail2ban adapter against databases made with fail2ban's own `CREATE TABLE` statements: rows and late rows, an unban, an empty table, rows without an address, the 5,000-row cut, the file left untouched with nothing written beside it, a file replaced between reads, a missing, unreadable, locked or damaged file, a folder in its place and a database without the `bans` table; `from`, `url` and `database` in `config.toml` and a section written for the old fail2ban summary refused, the export of the admin page, a whole collector raising the attack and the events and coming back after a restart, and `--probe security` |
| `tests/collector/test_path.py` | the path syntax: every allowed form, the RFC's results on its own examples, every refused form with its position, the limit on values found |
| `tests/collector/test_provider_format.py` | the provider file format: the built-in files pass, each rule is held to a refused file with its message, and an adblock file gives exactly one of `blocked` and `recent`; `[auth] refused` takes 400 alone, on a session login |
| `tests/collector/test_engine.py` | the engine against a local HTTP server: the requests built, `statuses`, `not_json`, `require`, nesting and the limits, scalar, list, object, item, case and zipped fields, the vars read only when allowed, the recording, and a certificate checked unless `verify_tls` is `false`; session logins: one login then the session with every read, in a header or the query, made again near its end or when the service forgot it (once in a read), a refused login, a login answered 400 refused only when the file's `refused` names it, a reply a request's `require` reads as refused logging in again once, a new session refused, a login with no session id, the login's JSON body, the logout at `close()` (once, after a read in flight, never for an expired session) and the recording with the session's id named and the login's reply masked |
| `tests/collector/test_imports_list.py` | `[[sources.imports]]`: each entry the source `imports:<name>`, its defaults and its `secret` (the provider's id when left out), a missing key failing that source alone, names (the form, twice, a section's name), `from` (required, unknown, another kind), the same provider at the same address twice refused and a second Sonarr allowed, the rest checked as a section's, the list's limit and shape, a provider file of the user's own read under its own name and a refused one; `[sources.lidarr]` giving one crate for each album and its key; `--check-config` and `--probe imports:<name>` with `--record`, a refused file named by the entry's place, and the state and memory files keeping the entry under its own name |
| `tests/collector/test_usage.py` | `[[sources.usage]]`: the generic source (`from = "json"`) and a provider file of the user's own that reads several machines, each entry the source `usage:<name>` with its defaults and `secret`; the machines (`id` required or refused by what the provider reads, names unique across every machine and the host's, 32 in all, thresholds of their own above the band), the host's own thresholds, the generic entry's address, paths and header; a figure read as text, `NaN`, out of range; the time-weighted mean over the window and the readings kept; a listed machine missing read ok with `error` naming it, a failed read raising nothing, a device of the same name tied to it; several machines with the host in the order raised; `--probe usage:<name>`, `--check-config` and the usage counts naming the provider alone |
| `tests/collector/test_checks.py` | `[[sources.json]]`: each entry the source `json:<name>`, its defaults and its `secret` (the name, `-` made `_`), its header's value read from `.env` by name and a missing one failing that source alone; what is refused (names, the list's limit and shape, the address's user name, fragment, `@` and repeated query names, a path outside the subset, each test's `value`, the words' lengths and braces, `device_down` or a condition outside the priority as `as`, a header a provider file cannot set, a `secret` without a header, the paces); the entry compiled whole into a provider file; each test's truth table and the reads that fail; against a service on the loopback, the one GET with its header, raised after `for_s`, held with its last words and cleared, a failed read and a refused header, no redirect followed, the place after the borrowed condition and its level, nothing of the borrowed condition's facts touched, a change of words kept and of test restarted; the contract's `as`; `--probe json:<name>`, `--record` with the header masked, `--check-config`; and the state of every other source the same with a check beside it |
| `tests/collector/test_providers.py` | every built-in provider against its fixtures (each request's method, path, headers and login body, the logout when the provider is closed; the usage providers' fixtures shaped from the services run by `tools/throwaway/usage.sh`, every value invented), at every `show` for streams with no name read unless `show` is `names` and nothing of a stream with `count`; Plex, Tautulli, Tracearr and Jellyfin giving the same reading of the same streams at every `show`, Plex's token sent in its header, Tracearr's key as a bearer token and Jellyfin's in its own `Authorization` form, never in the address; `from`, `secret` and `verify_tls` in `config.toml`, the password Pi-hole is read with, the tokens of Plex and Technitium, and the keys of Tracearr and Jellyfin |
| `tests/collector/test_provider_files.py` | provider files of the user's own: which files are read and which left out (bad TOML, a broken rule, a name that is not the id, a built-in's id, a link, a folder, the size and count limits), a `from` naming one or a refused one and the source that then fails, the settings a file declares, a file read through the engine like a built-in, `--check-config`'s exit codes and warnings, `--probe`, `config.problems` in the state file, and a change taken up between polls |
| `tests/collector/test_port.py` | [the port proof](#the-port-proof): today's four services read through the engine, against what the collector wrote before, byte for byte |
| `tests/collector/test_probe.py` | `--probe` and `--record`, a probe on the host with `--env-file` and a config of its own, a credential masked in a reply that echoes it as written and percent-encoded, and a session provider's probe logging out, its login recorded with its method and body and the session's id named |
| `tests/collector/test_text.py` | clipping, joining and formatting the collector's words |
| `tests/server/test_server.py` | the bundled server on the loopback |
| `tests/server/test_displays.py` | `POST /api/displays` and its store: an id recorded, every other body refused with nothing kept or logged, the size, type and origin checks, `POST` alone, the ids never served, at most 1,000 kept with the oldest dropped, the write at most once a minute and at stop |
| `tests/server/test_admin.py` | the admin page's side of the server, provider files of the user's own in its checks, `[[sources.imports]]` and `[[sources.json]]` given to the page, never set there, checked with every change and kept by the export, its answer and the export included, and the source code link signed in and out |
| `tests/server/test_stamp.py` | the version stamp, `server/stamp.py`, against `tools/deploy.sh` |
| `telemetry/test/payload.test.ts` | the receiver's check of a heartbeat: every field's limits, the row it makes, and the cutoff for rows past 24 months |
| `telemetry/test/worker.test.ts` | the receiver's handler end to end, against `schema.sql` in `node:sqlite` with a fake rate limiter: each answer, the upsert of a day's row, the delete of rows past 24 months (the cutoff's own day kept, a failed delete still `204`), and the connecting address never stored or logged |
| `telemetry/test/config.test.ts` | `wrangler.jsonc`, `schema.sql`, and the example and the table in [telemetry.md](./telemetry.md), against the fields the receiver accepts, and the keeping period given there |

`tests/collector/kw_helpers.py` holds helpers the collector's tests share, and points
`heartbeat.ENDPOINT` at a closed loopback port for the whole run, so that no test can reach the
receiver of the usage counts. `telemetry/test/helpers.ts` holds the fakes the receiver's tests
share. The collector's fixtures are in `tests/collector/fixtures/`: `port/`, the port proof's record, and
`providers/<id>/<case>.json`, one read of a built-in provider each: the requests expected (method,
path, headers and a session login's JSON body), with each credential written as
`{credential.<field>}`, the replies in the service's shapes with every value invented, and the
fill, by `show` for streams, or the error. Pi-hole's are in the shapes a throwaway Pi-hole 6.8
sent: a read with its login and logout, a wrong password, every session taken, a Pi-hole 5, and a
Pi-hole with no password. Technitium's are in the shapes a throwaway Technitium 15.6.2 sent: a read
of the last hour and the last day, a token refused, a Technitium 14 that reads no `Authorization`
header, and an error of the service. Lidarr's are in the shapes of its `openapi.json`, the empty
history and the 401 as a throwaway Lidarr 3.1.6 sent them: album records with their artist and
album (one without an artist, one with an empty title, one without an id), an empty history, and
a key refused. Plex's are in the shapes of Plex's API documentation, the
401 and 404 pages as Plex Media Server 1.43 sent them: three streams (the same as Tautulli's
`activity.json`), nothing playing, streams with parts missing and a session key given as a
number, a token refused, a path Plex does not have, XML in place of JSON, and JSON that is not
Plex's. Tracearr's are in the shapes of its public API's OpenAPI document and handlers at
version 3.2.1, the 401, the 404 and the web page as Tracearr 3.2.1 sent them: three streams (the
same as Tautulli's and Plex's), nothing playing, streams with parts missing and a start that is
not a time, a key refused, a key that is not the owner's, too many calls, a Tracearr with no
version 2 of the API, its web page in place of JSON, and JSON that is not Tracearr's.
Jellyfin's are in the shapes of its OpenAPI document at version 12.4.0, the empty list and the 401
as Jellyfin 12.4 sent them: three streams and an idle session (the same streams as Tautulli's,
Plex's and Tracearr's), no client connected, idle sessions with the playing item left out and
`null`, sessions with parts missing (an episode without its series or its numbers, a track by its
first artist or with none, a blank title, a TV channel, a playing item with no type, a session
with no id), a key refused, a path the service does not have, a sign-in page in place of JSON,
and JSON that is not a list. A fixture whose requests share a path and differ in their
query is answered by the whole of it, query included. The fixtures are in
`tests/web/fixtures/`: the knight's stored record (`knight/calls.json`, and `knight/idle.log`, the
full record of one pose, idle at 2 300 ms, compared call by call), the scenes'
(`scenes/<scene>.json`, one for each of the seven scenes, and `scenes/cast.json`), the test world
(`worlds/`), and the packs and states listed in [development.md](./development.md#layout).

## The port proof

`tests/collector/test_port.py` holds the collector to what it wrote before Tautulli, AdGuard Home,
Sonarr and Radarr were read through provider files. Each scenario is a run of polls through the
whole collector (the runner, the conditions and the memory file) against a local HTTP server that
answers each poll as the scenario says: the shapes these services send, and the edge cases the
readers handled, among them refused keys and the pause after them, a pause still running at
start, errors, empty and malformed replies, counts that rise in bursts and fall, the fly rate from
hourly and daily windows, a day that turns at local midnight, first sight and memory from an
older version, new imports across polls, and the streams at every `show`. `fixtures/port/` holds
what the readers before the engine wrote for each poll: `state.json` and `memory.json`, byte for
byte, and the requests made, with each credential replaced by its variable's name. The record was
made once from those readers, and a difference from it is a change in what the wall shows. One
that is not wanted is put right; one that is wanted changes the scenario's record in the commit
that makes it, and the commit says why. That has happened once: when a Tautulli reply with no
`stream_count`, which the readers read as the sessions it listed, became a failed read
(`Tautulli cannot reach Plex`), the polls that send one were recorded again.

## The throwaway services

`tools/throwaway/` holds scripts that prove a provider against the real service, outside the
default checks ([development.md](./development.md#checks)). `tools/throwaway/fail2ban.sh` starts
`crazymax/fail2ban` 1.1.1 as the account running the script, on an internal network of its own
with nothing published, with one jail, a filter for a test line and the dummy action, so it needs
no capability. fail2ban makes its own database in a scratch folder, and the collector reads it
through a read-only mount, as uid 10001 with no network, from `python:3.13-slim` (the image the
collector is built on) with this checkout's code, one `--once` at a time. It prints, in order: the
read refused while the database has fail2ban's own modes; the read ACL of
[configuration.md](./configuration.md#fail2bans-database) applied (without sudo, since the
script's account owns the folder) and the read passing; a failure line banned, read as one
`ip_banned` event with the attack raised; the address unbanned with `fail2ban-client` from a
second container of the same image, and the count falling with no new event; and the database
moved aside and made afresh by fail2ban, the new file taking the read grant from the folder's
default ACL. It removes the containers, the network and the scratch folder however it ends.

`tools/throwaway/pihole.sh` starts `pihole/pihole` 2026.10.1 (Pi-hole 6, FTL 6.8) on an internal
network of its own with nothing published, its web password made for the run and passed by
environment alone, NTP off, no DHCP, and only the capabilities its start script needs to hand its
files to the `pihole` account and start FTL (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETUID`, `SETGID`,
`SETFCAP`, `NET_BIND_SERVICE`; no `NET_ADMIN`), with `no-new-privileges`. Gravity's two download
addresses resolve to a documentation address, so its check for DNS passes and its download fails
at once, and Pi-hole starts with no blocklist. The other containers are `python:3.13-slim` with
this checkout's code read-only: the collector as uid 10001, and a helper that speaks to Pi-hole's
API and sends DNS queries with `collector/net.py`'s `dns_query`. It prints, in order: a domain
denied through the API; the collector reading every 5 seconds, six queries for that domain giving
six flies and `blocked_today` 6; Pi-hole's own list of sessions twice, ten seconds of reads apart,
one session of the collector's logged in once and used since; the sessions after the collector
stops, none left; a `--probe`, none left after it; the provider run directly, three reads with one session id and `close()` ending it; a wrong
password refused and the source paused, and the next poll not asking again; `https` with Pi-hole's
self-signed certificate refused (`TLS error`) and then read with `verify_tls = false`; and a
Pi-hole 5 (`pihole/pihole` 2024.07.0) and a Pi-hole 6 with no password, each told plainly. No
password or session id is printed.

`tools/throwaway/technitium.sh` starts `technitium/dns-server` 15.6.2 on an internal network of its
own with nothing published, its admin password made for the run and passed by environment alone,
with `NET_BIND_SERVICE` its one capability, and `no-new-privileges`. The helper, `python:3.13-slim`
with this checkout's code read-only like the collector, sets it up through its API alone: signed
in as admin, a user of its own with a password made for the run, in no group but Everyone; an API
token that user makes; and one domain, under `example.net`, in the blocked zones (a name under
`.test` would not do, since Technitium answers for that domain itself and counts nothing as
blocked). It prints, in order: the collector reading every 5 seconds; six queries for the domain
and the seconds until the six flies come, twice (between 20 and 85 seconds, as the minute the
queries fall in must end and settle first); a `--probe`, and a `--probe --record` with the token
recorded as `{credential.token}`; the collector stopped, and its log, state file, memory file and
the recording each read, as uid 10001, for the token, found in none; a wrong token refused and the
source paused, the next poll not asking again; and a Technitium 14 (`technitium/dns-server`
14.3.0) given a token of its own, told plainly. Given a folder, it copies the recording there, for
making fixtures. No password or token is printed.

`tools/throwaway/lidarr.sh` starts `lscr.io/linuxserver/lidarr` 3.1.6.5079-ls46 (Lidarr publishes
no image of its own) on an internal network of its own with nothing published, its config folder
a scratch folder of the run owned by the user running it (`PUID` and `PGID`), with the five
capabilities its start scripts need to hand that folder to its account and start Lidarr as it
(`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETUID`, `SETGID`) and `no-new-privileges`. Lidarr makes its
API key at its first start and writes it to `config.xml` there, where the script reads it into a
variable. It prints, in order: the collector reading every 5 seconds and the empty history read
cleanly, the source ok with no imports; a `--probe`, and a `--probe --record` with the key recorded
as `{credential.api_key}` and the reply's shape; the same Lidarr, under a second network name, as
an entry of `[[sources.imports]]` with a `secret` of its own, checked, probed as
`imports:lidarr-two` and read beside `[sources.lidarr]`, and the same address given to both refused
by `--check-config`; the collector stopped, and its log, state file, memory file and the
recording each read, as uid 10001, for the key, found in none; and a wrong key refused and the
source paused, the next poll not asking again and a `--probe` not reading. An album import cannot
be made there, since Lidarr writes one only for a download client's finished download of an album
its library holds, and the library needs MusicBrainz, which the network cannot reach; the album
record rests on the fixture. Given a folder, it copies the recording there. No key is printed.

`tools/throwaway/usage.sh` reads the five usage providers, each service from a pinned image on an
internal network of its own with nothing published, every container capped. node_exporter 1.8.2
is scraped every 15 seconds by Prometheus 3.16.0 with no login, by a Prometheus 3.16.0 whose web
config asks for basic credentials (a user made for the run, its password's bcrypt hash made on the
host by `mkpasswd`) and by Prometheus 2.53.4; Glances 4.5.9 and 4.0.8 run in web server mode; a
Beszel 0.21.2 hub makes its first user from its own `USER_EMAIL` and `USER_PASSWORD`, and a
helper container, as that user through the API, reads the hub's key for a Beszel agent 0.21.2,
then makes a system for the agent and one that never answers, shared with the user. It prints, in
order: the agent's system up; Beszel's answers to a read with no token (200, no systems), to a
token that is not one (401) and to a wrong password (400, `Failed to authenticate.`); a `--probe`
of each source (Prometheus 3 and 2 with the default `match`, `prometheus_basic`, the open provider
refused with a 401 by the Prometheus that asks for a login, both Glances, and Beszel reading the
system that is up and naming the other as having no reading); `prometheus_basic` and `beszel`
with a wrong password, each refused; and one `--once` over every source, each ok, a listed
machine missing named in its error, the Prometheus that asks for a login paused. Given a folder, it
copies the recordings there, for making fixtures. No password or token is printed. A Glances
started with `--password` is not run, since Glances asks for its password at the terminal.

`tools/clean-start.sh`, beside them, starts no service of its own: it runs the README's quick
start in a scratch copy of the checkout, with `config.example.toml` and `.env.example` as they are,
both containers on an internal network of their own, and checks within two minutes that the
install starts cleanly ([development.md](./development.md#the-clean-start)).

## The page's tests

Syntax, from the repository's root:

```bash
for f in $(find web/js web/packs web/admin -name '*.js'); do node --check "$f" || exit 1; done
```

The mapping from a state file (the devices and the fallback to the pie among it), `judge`,
the rules for events and the decision to reload, the props of the devices, the knight's
drawing and rig on both paths, the base pack, the pack library, and loading the packs with what
is drawn when they fail:

```bash
node --test 'tests/web/**/*.test.js'
```

`tests/web/knight.test.js` checks the knight call by call. It loads the scripts `index.html` loads
that the knight's drawing needs (`draw.js`, `sprites.js`, `effects.js`, `props.js`, `knight.js`, the
house and the smithy, `ed25519.js`, `pack.js` and the base pack's carrier, in the page's order; not
the scene compiler or the medieval world's pack, which dress no knight) under Node
with an empty `window` and a fake canvas context that records every call and every property set;
`KW.devices.draw` writes one line in the record. It chooses the knight's source as `main.js` does
and draws 123 records: the knight in 105 poses, the smith's three acts among them as the smithy's
act places the knight (the hammer through its blow, the tongs and the blank through the quench, the
bellows open and pressed), the bare head in bed twice, the speech bubble twice,
the helmet and the weapon at rest in four, and the house and the smithy in ten, each painted and
drawn in the states that show the gear at rest. It compares each record with the one stored in
`tests/web/fixtures/knight/`. It does this twice: once as a deployed page, which refuses the
unsigned base pack and draws from code, and once as a `dev` page, which draws from the base pack.
The stored record was taken from the code, and both paths must give it. For every pose it holds the
number of calls, a hash of the whole record and a hash of each block of 128 calls; for one pose it
holds the full record. Equal calls mean equal pixels, so a change that should leave the knight
alone is checked in about a second, before the screenshots. A failure names the pose and the block
of calls where the first difference lies, or the exact call in the pose stored in full.

One spelling is allowed to differ on the pack path. The pack writes the helmet's translucent shade
as `rgba(60,30,20,0.18)`, as JavaScript writes the number, where the code writes
`rgba(60,30,20,.18)`; a canvas reads both as the same colour. Before the pack path's record is
compared, the alpha of such a fillStyle loses its leading zero. Every other character is compared
as drawn, and the screenshots confirm the pixels.

`tests/web/props.test.js` loads `draw.js`, `sprites.js`, `effects.js` and `props.js` the same way and checks each
kind of device: that it stays inside its class box above its base, up and gone, the owl the high
class's and the rest the ground class's; that its moving part is only its lamp of its own, inside
its box, and that no kind has one while down; that the engine's lamp fades
green to black over 3.6 seconds while up and red to black over 2 while down; that the owl's eyes
glow amber, the crystal pale blue-white, the potion blue and the chest's jewel gold while up, and
at the low point of the pulse a dimmer colour of the same hue, bright enough to read as lit; that
down nothing is lit and no down red is left, the dazed owl's spirals and the chest's dark jewel
drawn still; and that no device light is green; that the owl's wall plate stands where the camera's
did, x 22 to 32 from 64 above the base, so a pole meets it; that its still part does not change
with time; that gone differs from up; and that the pie in parts draws what the whole pie drew. For
the pie's lamp it checks that it lights red on the lamps' loop up, down to a dimmer red, that down the pie has no lamp
and no steam and its moving part draws nothing, that the lamp covers exactly the filling the
still part leaves showing through the lattice, that the last slice's filling is still and unlit,
that nothing but the steam stands above the dome, and that it stays inside the pie's place. It
prints the calls each part costs.

`tests/web/world-props.test.js` draws every kind from the medieval world's prop set beside the
code's drawing of it, call for call, in every place of every scene (the court's among them), up and
gone, with and without its question mark, at seven moments, and its still and moving parts alone;
the moving parts every 25 ms through the lamps' loops; with the rest of what the compiler does for
the devices ([cast.md](./cast.md#the-devices-on-the-page)).

`tests/web/world-cast.test.js` draws the fly from the medieval world's cast beside the code's, both
frames and what falls, at whole and fractional points, and runs the engine's frames every 20 ms
while six flies fly in, hover, are swatted and fall, with the cast from the pack and from code, every
call of every frame compared. It draws each monarch from the pack beside the code's in 55 looks
each, call for call, every skin with every hair among them. It holds the goblin's six pose canvases from the pack to the code's,
call for call, and runs the goblin's whole event every 20 ms at the battlement and at the camp from
both; with the rest of what the compiler does for the cast ([cast.md](./cast.md#the-cast-on-the-page)).
`tests/web/foe.test.js` loads no compiler, so it checks the code's goblin;
`tests/web/world-scenes.test.js` runs its checks on the pack's.

`tests/web/pet.test.js` holds the mouser cat from the pack to the cat from code, every pose in both
coats call for call, and plays the engine's catch with time frozen: who a fly belongs to, the swat
passing over the cat's flies, one fly at a time with the time of every step, the poses through a
catch and the fly meeting the paw at the top of the leap, three of the cat's flies at most, no fly
under a warning and the flies on screen leaving, none in the cellar, a new scene starting clear, the
spot by the bed at night under the dimming, the drawing order, the note and the coat, and on a page
without `cat.js` every fly the knight's, waiting indoors as before ([The cast](./page.md#the-cast)).

`tests/web/world-words.test.js` loads the page's scripts but the engine, the settings and `main.js`,
and checks the quiet line and the captions built from the collector's parts in the medieval words,
against the collector's own rule, with the collector's text when there are no parts or no words;
the overlay's custom properties against the fallbacks `display.css` gives them; that `main.js`
writes the words with `textContent` and sets the overlay after the world has started; where the
words and the overlay come from on a `dev` and a deployed page; and the demo's parts, texts and
lines ([worlds.md](./worlds.md#the-words-and-the-overlay-on-the-page)). `tests/web/state.test.js` checks that
`quiet_parts` and an event's `parts` are read as strings, or not at all.

`tests/web/streams.test.js` checks the streams: the stream the line shows at each moment, by the
clock alone; one stream without `1 of 1`; the title giving way to the name and the count within 60
characters, counted by code point; each line held to the collector's own `line()`, run through
`python3` (the test is skipped without it); the sessions read as strings, at most 32, a session with
nothing to show passed over; the collector's `detail` whenever there are no sessions; when the
badge shows, its count in every mode of `show`, and that `main.js` writes both with `textContent`
from `streamWords` and `display.css` keeps the badge outlined in a colour of the overlay and sized
with the headline; and the demo's invented streams in each mode, with the detail the collector
would write for them.

`tests/web/demo-devices.test.js` runs `demo.js` in a sandbox with the real `state.js`, a small
stand-in for the document (elements that keep their children, attributes, listeners and the focus),
a storage over a map or one that refuses every call, and stand-ins for the engine, the words and the
settings. It checks that the Devices row offers every kind `KW.props.KINDS` draws and nothing else;
the default set, a NAS, a camera and a router in `g1`, `h1` and `g2`, nothing stored until a change;
`on=device` showing the NAS down and the knight looking to it; the Pi put in the pie's place for
`pi_silent`, and the set's own Pi taken for it; adding by kind with names numbered, a name typed in
place, cleaned and cut to its kind's room, removing with the focus moved to the next control, and
Down raising `device_down` and up again clearing it; the conditions' Device down and Clear following
the set; one Pi, three cameras and three other devices, the buttons greyed and the row's line when
full, and a stored set beyond them cut; the set restored on a new start, a stored text it cannot
read ignored, refused storage; Reset forgetting the stored set; the demo loop drawing the set every
device up and its `device_down` step its own devices; `dv=` taking the set's place with the row
greyed; `bar=dev` showing the Devices row alone, at load or on a change of the hash, and `bar=0` and
`bar=1` hiding and showing the whole bar again; no fetch, request, beacon or socket from any
control, and none named in `demo.js`; no control changing anything once the demo has stopped for
live mode; and `device_down`'s words held to the collector's own `_named()` and `_names()`, run
through `python3` (the test is skipped without it).

`tests/web/foe.test.js` loads the page's scripts the same way, the engine included, and checks the
foe player and the goblin in `KW.props.FOES`: that the goblin's drawing matches its measures; that
the entrance runs in order and the poof is over within the event's 3.4 seconds; that the goblin
stands in the scene's `foeZone`, clear of the knight and of the whole class box of the pie and of
every device on the ground, and does not come when there is no room; and, for the greatsword from
the base pack and from code, the arming sword, the longsword and the mace, each on Classic, Broad
and Slim, that the goblin stands within the weapon's reach, that the blade the engine plans with
(or the mace's drawn head) touches the goblin's crown at the hit, and that the weapon meets the
goblin to [the contact standard](#the-contact-standard), at the stops of the knight's patrol in both
scenes, every 30 between, and the spots the full sweep found hardest. The goblin holds its brace
for 16 ms after the hit (`hitPose` of the poof) and only then flings into its hit pose, squashed and
with the burst from the hit itself; struck by a shot it flings at once. In the bounce a weapon in
both hands lifts without rocking back and one in one hand rocks back by `kick` as well. The band
the engine measures a sword by ends at its drawn point (`KW.knight.rest.point()`): the greatsword's
tapers from 236 to 270, the longsword's from 198 to 228 and the arming sword's from 150 to 180. On
every build and with each weapon the goblin comes wherever it comes on Classic, at the same spot,
and is struck within 12 ms of Classic's hit, or 16 with the mace, which meets the goblin at the end
of its reach, where each build changes which point of a flange meets it first (15 ms at most
between the tested spots); at the knight's first spot the hits are, on Classic, Broad and Slim,
with the greatsword 1657, 1659 and 1655 ms on the battlement and 1661, 1663 and 1659 at the camp,
with the longsword 1658, 1661 and 1657 and 1662, 1664 and 1660, with the sword and shield 1702,
1706 and 1698 on the battlement and 1710, 1712 and 1709 at the camp, and with the mace and shield
1703, 1709 and 1690 on the battlement and 1706, 1710 and 1702 at the camp, the goblin coming left
of the knight in both since the scenes' redesign (the hits of the pot-thief's crown, `kw.medieval`
0.9.0). The blade `bladeOf` measures is the rig's on the
look's build, its grip raised by the build's height, and the present knight's on the code path. A
blade too short to reach it anywhere, its reach and its point shortened, keeps the goblin away.

`tests/web/world-scenes.test.js` runs those of its checks that depend on a scene again on each scene
of the medieval world's pack that hosts a foe, compiled from the pack: the entrance and the poof,
where the goblin stands, the hits on every build and the contact standard with each swung weapon on
each build, with the goblin from the pack's cast.
It also holds the goblin's whole plan there (where it stands, the line it comes over, the moment of
the hit) to the plan in the code scene, for every weapon and build, and runs the checks of
`places.test.js` on every scene of the pack. It runs every scene of the pack that has an act (a
`target`, an `anvil`, a `bed` or a `screen`) frame by frame beside its code scene, comparing every
call, `over`'s among them, every change to the knight's pose, `strike` and the knight's move off
its spot (`s.dx`): the smithy's through the whole quench at its stop, all quiet and while something
streams, the hammer and the bellows, the yard's training while all is quiet and while something
streams, and the target's and the bellows' under strain short of memory, the knight bloated.
`tests/web/world-knight.test.js` runs the knight test's checks of the house and the smithy on the
two from the pack: the ten records of them painted and drawn against the stored ones, with the
knight from code and from the base pack; in each of the base pack's other looks (the arming sword
and the shield, Broad and Slim) the same calls as the code scenes; their backdrop keys; their
rests, and the house's places and rounds; the pegs under the arming sword's blade; no hot tip for a
weapon without a blade; and no shield on the house's wall when its rest view does not fit. `foe.test.js` and
`places.test.js` draw the code scenes.

The same knight test checks the choice itself: the console lines, the refusal at the `signature`
step, the code path when there is no base pack, a broken one or no library, a changed colour in the
pack showing on the knight, and the clamping of `drop` and `bloat`. For the face it checks that a
changed skin ramp, cheek, puffed cheek and hair brow show on the pack path and change nothing else;
that each of the 36 pairs of the base pack's skins and hair colours, in the quiet, sick, hot,
memory-tight, WAN-down and hungry faces, helmet on and off, and the sick head in bed, draws its own
face band, lids, cheeks, puffed cheeks and brows and no colour that belongs only to another skin or
another hair's brows; and that the brows keep contrast against every skin: each brow is drawn with
the dark edge exactly when its contrast with the skin bands it lies on, worked out in the test
apart from `knight.js`, is under 2.5, the 22 such pairs are the expected ones, today's warm skin
with brown brows not among them, and the edge is darker than every skin band it lies on. For the crate it
checks, from the base pack and helmet on and off, with and without the bob, every 100 ms over the
sway, that it is drawn after the pauldrons and before the arms, that its hands are at its lower
corners, that no pixel of it lies on the helmet's opening or the bare face, and that nothing of the
load rises above the helmet. The call record holds the code path to the same calls.

For the three builds the knight test checks that Classic, chosen by name, draws the stored record
in every pose from the base pack; that Broad and Slim, with each weapon, draw every pose of the
record, both swings at every twentieth and the attack without a throw, a refusal, a broken number
or a fall back, each frame's fills from the look's lists within the look's cost, and other calls
than Classic's; that on all three builds, with each weapon, both hands stay on the grip (the
greatsword's two hands on its frame between its stations, the sword hand on its station and the
shield hand where the pose puts it) in every frame of both swings at every hundredth, the attack
every 20 ms, the goblin strike on both sides and the stances, that the grip is where Classic holds
it raised or lowered by the build's height, that the hands hang 10 outside and 48 below each
shoulder with no weapon, and that the hands the smith's grip pins to the grid do not move; that the
smith's acts, on every build with the greatsword, the arming sword and shield and the mace and kite
shield, lay the hammer's face on the weapon's top edge at the blow with the left hand on its grip,
and every 10 ms of the three acts keep the gauntlets off the face at the hammer and the bellows, the
hands no higher than 4 above the chin line and the tongs and the blank off the face in the quench,
and the blank's point out of the water at most 12 below the floor line; that no arm is drawn over a blade,
its guard or the shield on Broad and Slim with each weapon, by the same frame-by-frame check as
above; and that the camera at the house's `h2` clears the knight of every build.

To see every call that differs, dump the records of both trees and compare the folders.
`dump-pack:` dumps the pack path's records instead of the code's:

```bash
KNIGHT_LOG=dump:/tmp/kw-calls-old node --test tests/web/knight.test.js        # in the tree before
KNIGHT_LOG=dump:/tmp/kw-calls-new node --test tests/web/knight.test.js        # in the tree after
KNIGHT_LOG=dump-pack:/tmp/kw-calls-pack node --test tests/web/knight.test.js  # the pack path
diff -r /tmp/kw-calls-old /tmp/kw-calls-new
```

`tests/web/loading.test.js` checks the downloaded packs, the refusals and their console lines, the
fallback to the base pack's defaults, the code path in every case of failure and a throw inside a
draw list, and that `look()` draws a new look from the packs already loaded, a downloaded one
included, where `start()` again would lose it; see
[The pack library's tests](#the-pack-librarys-tests). `tests/web/world-loading.test.js` checks the same for the medieval
world's pack: refused, missing, failing to compile, a part throwing while drawing and drawn from
code alone from the next frame, a throw in the engine's own drawing, the downloaded world packs and
the admin page's scripts; see [world-loading.md](./world-loading.md#two-copies-held-equal).

`tests/web/settings.test.js` checks the settings: the order of the levels key by key, a value each
level does not know ignored with one console line, a section that is not an object, the builds
ready from the base pack, a choice saved under `knightwatcher.settings` and read back, a stored text
or value the page does not know, a browser that refuses storage on reading, on writing or both, the
reset of each section, when listeners are told, the state file's `defaults` from a fixture
(`fixtures/state-defaults.json`) through `KW.state.map` to the store, the engine's input, and the
12-hour clock, `12:05 AM` and `12:30 PM` among it. For the monarch's hair and robe it checks each
level in turn, values the page does not know (the empty "as drawn" among them), "As drawn"
clearing one saved key and falling to the defaults, and the swatches' bands in the engine's input.
For the scenes it checks every scene's `can` against the table in
[design.md](./design.md#scenes-chosen-per-condition), that every condition can be acted in its own
scene, the five conditions offered, each level in turn, a scene that cannot act its condition, a
condition not offered and an unknown name each ignored with one line, the saving, reading back
and reset of the section, and a text saved before the section existed. In a sandbox it checks the
engine's quiet rotation, the engine playing a condition in the scene chosen for it only where that
scene can act it, the monarch's skin (the court's own calls for the warm swatch, and each other
swatch's colours alone for every monarch), the monarch's hair and robe (the court's own calls when
none is given or one cannot be read, each swatch's bands where one is, and the backdrop's key), and
`look()`. It checks the build row's choices (`KW.settings.buildChoices`): Classic, Broad and Slim
from the base pack's names with Ready under each, a renamed build shown by its new name, and a
base pack that draws build A alone greying the other two by their letters. It also draws the
knight from the base pack in every combination the settings offer, weapon by skin by hair by hair
style with the build, the tabard and the plume cycled, 1 080 looks, the build turning so that each
meets every weapon, skin, hair colour and hair style, each standing, attacking and swinging both
ways, helmet on and off, the bare head and the gear at rest, and checks that none throws, falls
back or passes the caps, that it is rigged on its build, and that its colours are drawn; every
choice of the gear on every build, 111 looks, beside the longsword and the mace in turn, the long
cloak drawn in the gold plume's colours; and every monarch in every skin, hair and robe, "As drawn"
among them, 882 courts, each drawing its own colours. For the gear it checks that every value names
an item of its slot in the base pack and every item of a slot is offered, the page's own being the
base pack's defaults; the look each choice makes, the shield carried only beside a one-handed
weapon (never beside the crossbow) and no back putting nothing on; what the screen greys and the
words it says, the shield greyed beside the greatsword, the longsword and the crossbow; and the
choices' names from the base pack, the five weapons among them, a base pack without an item
offering only what it draws.

The stored record changes only when the knight is meant to look different. Store it again from the
code as it is with `KNIGHT_LOG=write node --test tests/web/knight.test.js`, and look at the
screenshots before trusting it. A change to the knight's look then changes the base pack too, so
that both paths still give the stored record.

`tests/web/scenes.test.js` checks the scenes call by call in the same way, so that a scene moved into
pack data can be shown to draw exactly what it drew. It loads the scripts `index.html` loads that
the scenes need (`draw.js`, `sprites.js`, `effects.js`, `props.js`, `knight.js`, the seven scenes,
`state.js` and `engine.js`, in the page's order) into a fresh sandbox for each state, with the
knight from code and the view's edges set as `fit()` sets them, and records each scene's `paint`,
then for each moment
its `act`, `draw` and `over` and the devices in front of the knight, which the engine draws after
it. What `act` and `draw` change in the frame (the knight's pose, `strike`) is written as a line per
field. The devices are drawn by `KW.devices`, and a canvas of the fake document keeps its own calls,
written into the record where it is drawn, each after `| `; so the record holds every call that
reaches the screen. Where a scene calls on the knight (`KW.knight.head`, `speech`, `swing` and
`rest.draw`) the record has a line with the call and its arguments instead of the knight's own
calls, which `knight.test.js` checks.

The states, for every scene: idle; each condition in its `can`, the dish gone for `pi_silent` and a
machine down with a box among the devices for `device_down`; the helmet the other way from the
scene's own; and the devices in all seven places, up, gone and alerting, up in other kinds, and
gone without alerting. Every scene with a `tv` adds the television on (the set on its stand, or
the house's own), the house the night with the television on and its light over the dark room,
the smithy the knight away from its spot at x 300 (the backdrop stays at the spot), the quench at
its stop at the forge at thirteen more moments through its loop (the blank into the water, the steam and the rings,
the drips, the glint, the nod and the walk back) and the bellows at five moments of a pump, the yard
its dummy struck by the training swing and then wobbling, and the court each monarch in its own
colours and in each of the base pack's six skins, and a sample of hair and robe: each monarch in
each hair with a robe and a skin turned so that every monarch meets every hair, robe and skin, and
light hair meets dark skin, where the brows change colour, and each with a hair alone and a robe
alone. Each state is drawn at 960 by 600, at 1400 by 600, where `HL` and `HR` lie 236 pixels
outside the grid, and at 960 by 720 (4:3), where `HT` lies 122 above it; and at 0, 1250, 2300, 3450
and 4700 ms, which catch the hammer striking, falling and raised, the quench at the fire, raised
and carried, the monarch talking with the mouth open and
shut, the question marks shown and hidden, the WAN's sparks and the sleeper's breathing, or at the
moments of the dummy's wobble. The goblin's six poses, the flies, the hole, the clods, the smoke, the
sparkles, the crate and its parachute are recorded once, apart (`cast`). The fly and the goblin of
the medieval world's cast are drawn again from the pack against the same records.

Each scene the medieval world's pack gives (today every scene) is then drawn again, with the
monarchs from its cast, compiled from the
pack by `world.js` as a `dev` page compiles it, in the same states, at the same sizes and moments,
and held to the same stored records: the code and the pack must draw the same calls
([world-loading.md](./world-loading.md#two-copies-held-equal)). The backdrop's key is not in the records, so the
test also works out each scene's key in every recorded state, from code and from the pack, and
requires the two to tell the states apart alike: two states share a key from the pack exactly when
they share one from code, whatever the strings. And it requires the compiled scene to give the code
scene's spot, places, rests, rounds, `can`, weapon and helmet, `outdoors`, `foeZone` and `crate`, and the same
parts drawn. The records are
stored from code alone: `SCENES_LOG=write` never stores the pack's copy, and `SCENES_LOG=dump:`
writes it to a folder of its own, such as `cellar@kw.medieval`.

The 1 935 records are stored in `tests/web/fixtures/scenes/`, one file per scene and `cast.json`:
for each record the first 16 characters of the hash of its calls, and for each distinct record its
number of calls and a hash of each block of 1 024 calls, about 250 KB in all, where the records in
full would weigh 317 MB (136 MB counting each distinct record once). A run takes about 90 seconds,
the 1 896 records of the scenes from the pack and the 21 of its cast included (the court's 522, the
house's 270, the smithy's 258, the battlement's and the yard's 234 each, the camp's 216 and the
cellar's 162). When a record differs, the test draws it again
from the repository's `HEAD` (`git show`), and when `HEAD` draws the stored record it names the
scene, the state, the size, the record and the first call that differs, with what `HEAD` drew there
and what was drawn. Without git, or when `HEAD` draws something else too, it names the block the
first difference lies in and prints what was drawn there; dump both trees and compare the folders to
see every call. `SCENES_WEB` points the test at a copy of `web/`, to try a change outside the
repository:

```bash
SCENES_LOG=write node --test tests/web/scenes.test.js         # stores the records of the code as it is
SCENES_LOG=dump:/tmp/kw-scenes node --test tests/web/scenes.test.js
SCENES_WEB=/tmp/kw-copy/web node --test tests/web/scenes.test.js
```

Store the records again only when a scene is meant to look different, and look at the screenshots
before trusting them. The records were stored before the effects moved out of the scenes into
`effects.js`, and the scenes draw them unchanged through it.

`tests/web/effects.test.js` checks the effects of `effects.js` (see [The effects](./page.md#the-effects)).
It loads `draw.js`, `sprites.js`, `effects.js` and `props.js` into a sandbox whose context counts
the calls that fill, and draws every effect with a spread of its fields (each at its least, each at
its greatest, its defaults, and forty made up at random within its table), at the three sizes and
at six moments for one that moves, or for `burst` at five points of the sparks' progress and six
times after the straw's trigger. Each drawing must make no more fills, and no more glows, than the
effect's cost function gives for those fields, and for every effect some drawing must come within a
quarter of it, so that no bound is loose enough to say nothing. A drawing whose cost passes 200 000,
which no scene may hold, is not drawn. It checks that the effects are the list `pack.js` names, that
a field left out draws as its default, and, with `pack.js`: that every effect reads clean in a 1.1
scene, with its required fields and with every field given its default; that every field of every
effect is refused at `fields`, naming it, when given a value of the wrong kind or out of its range;
that a field the table lacks and a required field left out are refused; that scalars are held to
their ranges at both ends, colours resolved and named values checked; that the counts step costs
each effect with its own function at the ends of the scene's ranges; that effects too costly for a
frame, or with too many glows, are refused; and that the world fixture still reads clean.

The deploy tool, which it runs against temporary folders and copies of `web/`, never the
repository's own, skipping those tests where `rsync` is not installed; `tools/capped.sh` as it runs
with no systemd user session; and the pack carriers against their pack files:

```bash
node --test 'tests/tools/**/*.test.js'
```

`tests/web/main.test.js` runs `main.js` in a sandbox, with the real `state.js` and stand-ins for the
drawing, the engine, the demo, the knight, the world and the settings that take any call. It
records every fetch and runs every timer `main.js` sets once, so a call made on a timer counts as
well as one made at load. Served without `?demo`, the page asks for `data/state.json`,
`api/settings` and `api/displays`, which shows the sandbox sees the calls; with `?demo`, on a `dev`
page and a stamped one, it asks for nothing under `api/` and no state file, fetches only
`data/packs/index.json` and, stamped, `version.json`, and never connects the shared settings; from
disk it fetches nothing. A change of the hash to one with `set=<page>` opens the screen at that
page, takes `set=` out of the hash so the same change opens it again, and `set=hold` or a hash
without `set=` opens nothing.

## The website's tests

```bash
node --test 'tests/site/**/*.test.mjs'
```

`tests/site/build.test.mjs` builds the site into scratch folders from a copy of what the build
reads (`web/`, `site/`, `legal/`, `docs/`, the provider files, `README.md` and `CONTRIBUTING.md`)
with a `web/data/` added, once without a Web Analytics token and once with an invented one, and
removes them afterwards. It checks that every page, asset and file each page names is written, and
no page names the picture the strain card had before; that every page has the nav with its own
section marked, and the footer; that `demo/` is `web/` file for file without `admin/` and `data/`,
but for the stamped `index.html` and `version.json`; that the stamp is the commit's, never `dev`,
on every local script and stylesheet, and the same bytes `server/stamp.py` gives (skipped without
`python3`); that the version comes from `WORKERS_CI_COMMIT_SHA` or git and the build fails without
one; that every block and heading of the legal files reads on its page, with the contents listed;
that the snippet is in no file without a token and, with one, on every page but `demo/` and the 404
page; that a token that is not letters and digits is refused; `_headers` line for line; that no
file of the demo names an outside host and no page has an inline script, style or handler; that
the home page frames the demo with its three buttons and links its four highlights to their cards
in Features, and the pages link out only to the project, Ko-fi and GitHub Sponsors; and that the
preview answers with the headers, the folders and the 404 page.

`tests/site/docs.test.mjs` checks the docs' index against README.md's Documentation section, group
by group and line by line, and that seven kinds of broken section each stop the build, naming the
line, with the last build left in place; that every doc has its page, with every doc at its side;
that a file of `docs/` the list leaves out appears under More; that every link between the site's
pages lands and every anchor names a heading that is there, and every link to the repository on
GitHub names a file or folder that is there; that Supported Feeds lists every provider file by
kind, with the `_basic` variants shown with their base, that a new provider file shows up and one
of an unknown kind stops the build; and that the docs' pages hold no inline script or style.
`tests/site/markdown.test.mjs` holds the renderer to its subset, its escaping and GitHub's heading
ids, and renders every doc and legal file whole, and `tests/site/worker.test.mjs` sends requests
through the Worker with a stand-in for the static files, and reads `wrangler.jsonc`.

## The contact standard

Every swung weapon meets the goblin as drawn, not as planned. The rule:

- **Never more than 2 px in.** The whole drawn weapon (blade, guard, grip and pommel, or the
  mace's head and haft) against every drawn pixel of the goblin, through the whole strike, from
  the swing's start to the goblin's last drawn frame, the bounce included. A pixel both draw is as
  deep as the larger of how far it lies inside the weapon and how far inside the goblin, counted
  from pixel centre to pixel centre, so a pixel on an edge is 1 in.
- **At the hit, at most 3 px apart.** The weapon at the hit against the goblin as drawn at that
  moment (its brace, which it holds for 16 ms after the hit), the empty pixels between their
  nearest pixels.
- **On Classic, Broad and Slim alike**, each build struck within 12 ms of Classic's hit, or 16
  with the mace.

The shield is not held to it: it is drawn over the goblin at the hit, by design. The crossbow,
which never strikes, must never be drawn on the goblin at all.

`tools/contact-sweep/lib.js` and `measure.js` measure it from the page's own drawing: the knight
drawn into a recording context, its weapon's fills told apart from the rest, and the goblin's pose
laid on the grid as the engine draws it. `tests/web/foe.test.js` (on the code scenes) and
`tests/web/world-scenes.test.js` (on the pack's) use them for each swung weapon on each build, at
about 25 spots, every 8 ms and every ms around the hit and around anything deep; each weapon and
build takes 2 to 3 seconds, about 35 seconds in each file.

The full sweep checks every spot. Run it after any change to a weapon, the strike, the goblin or
a scene that hosts it:

```bash
tools/contact-sweep.sh /tmp/kw-contact            # the pack's scenes, then the code's, compared
QUICK=1 tools/contact-sweep.sh /tmp/kw-contact    # the pack's scenes alone
```

It measures every weapon the settings offer on every build and the code path's greatsword, in
every scene that hosts the goblin, at every whole pixel the knight walks over on its patrol, with every
combination of the pie and the ground devices, every 2 ms: 3 552 plans, the crossbow's 666 among
them, since the patrol walks the knight across the battlement from 440 to 600 and across the camp
from 480 to 540. Those wider spots found the arming sword on Broad going 4 pixels into the goblin
at the very end of its point where a zone's edge held the goblin 207 to 209 from the knight, just
short of the wanted gap of 210, so the wanted gap (`FOE.gap` in `engine.js`) was pulled in to 206
on 25 November 2026. It runs inside `tools/capped.sh` in four workers, about nine minutes for the pack's
scenes and four and a half for the code's, which leave out the crossbow. It prints a line for each weapon and build (the plans, those deeper than 2 or
apart by more than 3, the worst of each), the largest difference from Classic's hit for each
weapon, and the count of faults, and exits 1 on any fault, on any difference between the pack's
results and the code's, or when the base pack has a weapon with a blade that the sweep does not
hold (add it to `ITEMS` in `lib.js`). It writes into the directory it is given, which belongs
outside the repository: the results as JSON, `faults.md` listing every fault (where the knight
stood, when, and where on the goblin and on the weapon), and `sheet.html` with a picture of the
worst moment of each group of faults. It is not part of `node --test`.

## What each test file checks


`node --test 'tests/web/**/*.test.js'` includes a faster check for the knight: it draws the knight in 105 poses,
the bare head in bed, the speech bubble, the gear at rest, and the house and the smithy, which show that gear, against a fake canvas, once
from code and once from the base pack, and compares every call with a
stored record, in about a second. The record is stored again only when the knight or those scenes are meant to change;
[The page's tests](#the-pages-tests) says how. The same file draws every frame of the swings, the attack
and the goblin strike with the greatsword and with the sword and shield, and fails if an arm is
drawn over a blade or a shield ([rig.md](./rig.md#anchors-values-and-poses)). The same checks for the
base pack's free items of 1.4.0 (every new weapon with every shield it may carry, the mail and
padded sleeves and gloves, every free item in every pose, on each build) and for its crossbow of
1.5.0 (every pose, aimed and fired, cold on the anvil) run from
`knight-free-classic.test.js`, `knight-free-broad.test.js` and `knight-free-slim.test.js`, which
load `knight.test.js` with `KNIGHT_PART` naming one build, so that they run in processes of their
own beside it; each takes about two minutes, the longest files of the suite. For the three builds it draws
Classic, chosen by name, against the stored record; Broad and Slim with each weapon in every pose
and swing frame without a throw and within the look's cost; the hands on the grip on every build
through both swings, the attack and the goblin strike; and the arm check on Broad and Slim.
`tests/web/foe.test.js` checks the goblin's plan and hit on every build with each weapon, the
weapon against the goblin to [the contact standard](#the-contact-standard), and that the blade the
engine measures is the one drawn. `node --test 'tests/tools/**/*.test.js'` also checks that every pack
carrier matches its pack file, that the mouser cat's stamps and member in the medieval world's pack
are what `tools/cat-stamps.js` writes from `web/js/cat.js` and read back to the code's pixels, that the copy of the settings schema in `web/js/settings.js` and the
reference in `docs/configuration.md` are what `tools/settings-schema.js` writes, tests the signing tool with keys generated for the run, and checks
that every pack in `web/packs/` that carries a `sig` verifies against the key table in `pack.js`.
`tests/web/format-1.1.test.js` checks the world sections of pack format 1.1 as the library reads
and checks them: one refused copy of its world fixture for each rule, the
limits at their edges, the costs, the signature over a 1.1 pack, and that a 1.0 pack reads as it did.
`tests/web/effects.test.js` checks the effects of `web/js/effects.js`: that each effect's cost bounds
the fills it draws for a spread of its fields on three screens, and that `pack.js` refuses every
field of every effect out of its table and costs each with its own cost function.
`tests/web/base-read.test.js` holds the shipped base pack's whole read, its signed bytes and six of
its looks, records included, equal to a copy stored from the library before format 1.1;
[The pack library's tests](#the-pack-librarys-tests) says how to store it again, which only a change to the base pack calls
for. `tests/web/loading.test.js` checks the downloaded packs, the refusals and the knight drawn from code
when no base pack can be used; its signed packs use keys generated for the run.
`tests/web/world-loading.test.js` checks the same of the medieval world's pack: refused, missing or
failing to compile, a scene, a kind of device, each role of the cast and the word set throwing while
drawing and drawn from code alone from the next frame, a throw in the engine's own drawing not put
down to the pack, the world started again with the downloaded packs, and the admin page's scripts
against the walls'; its signed packs use keys generated for the run too. `tests/web/places.test.js`
draws whatever may stand in every scene's places and checks that it stays on the 960 by 600 grid
and that no two places draw over each other, but the court's owls, an accepted overlap; and draws the
knight, fill by fill, where the smithy's acts stand it (the forge, the water and the bellows, the
bellows bloated under strain short of memory, and its spot with a device down), holding the places
it covers to those accepted: `h1` and `h2` at the forge and the bellows, bloated or not,
`g3` at the water, none at the spot. `tests/web/world-scenes.test.js` runs those checks of
`foe.test.js` and `places.test.js` that depend on a scene on each scene of the medieval world's pack,
compiled from it with the goblin from its cast, holds the goblin's plan there to the code scene's
with the code's goblin for every weapon and build, runs
each scene of the pack with an act frame by frame beside its code scene, and checks each scene's `quiet` and `hosts` against the engine's and the settings' own lists of the quiet
scenes and the events. `tests/web/world-knight.test.js` runs the checks `knight.test.js` makes of the
house and the smithy on the two compiled from the pack: their paint and draw against the knight's
stored records with the knight from code and from the base pack, the same calls as the code scenes
in the base pack's other looks, their backdrop keys and rests, the pegs, the hot tip of a weapon
without a blade, and a shield that does not fit the house's wall. `tests/web/world-cast.test.js`
draws the fly, the goblin and the three monarchs from the medieval world's cast beside the code's,
call for call: the fly's frames and what falls, the goblin's six pose canvases, each monarch in 55
looks of skin, hair and robe, and the engine's frames while flies
come, are swatted and fall and through the goblin's whole event, with the cast from the pack and
from code; and checks where the cast is drawn from, a member that fails to compile and what the
compiler refuses in the cast. `tests/web/pet.test.js` holds the mouser cat from the pack to the
cat from code, every pose in both coats call for call, and checks the engine's catch: who a fly
belongs to (the cat indoors and while the knight is busy, the knight outdoors while free), the
knight's swat passing over the cat's flies, one fly at a time with every step's time, the poses
through a catch and the fly meeting the paw at the top of the leap, three of the cat's flies at
most, no fly under a warning and the flies on screen leaving, the cellar without flies, a new scene
starting clear, the spot by the bed at night under the dimming, the drawing order, the note, the
coat, and a page without the cat giving every fly to the knight as before. `tests/web/world-props.test.js`
draws every kind of device from the medieval world's prop set beside the code's drawing of it, call
for call, in every place of every scene, up and gone, with and without its question mark, in both
parts and through the lamps' loops, and checks where the devices are drawn from, a kind that fails
to compile, the lamp of a kind's own and what the compiler refuses in a prop. `tests/web/world-words.test.js`
checks the quiet line and the captions the page builds from the collector's parts in the medieval
world's words, held to the collector's own rule at the limits of 52 and 44, with the collector's text
when there are no parts or no words; the overlay's CSS custom properties against the fallbacks
`display.css` gives them; that `main.js` writes the words with `textContent`; where the words and the
overlay come from on a `dev` and a deployed page; and the demo's parts, texts and lines.
`tests/web/worlds.test.js` checks worlds as presets: the medieval preset in the pack, complete,
its outfit the base pack's defaults and its scenes those of the code, and what the pack library
refuses in a preset; what a page that reads kw.medieval and a second world pack made for the run
lists for the settings (`KW.world.catalogue`, `KW.settings.pageWorld`), and that with nothing set
the display is the same with the preset as from code; the rule that resolves a world against the
parts set beside it, at the same level, above and below, the `items` and `devices` tables key by key,
and the faults of a world whose parts are not loaded; long names kept, standing for short ones, or
ignored with their reasons; the store's `chooseWorld`, kept in the browser and sent to a server in
one write; the engine's scene from the world's `homes`; each kind of device drawn from the prop
set chosen for it, from the base world's where that set cannot give it; and what the settings
screen shows of the worlds (`KW.settings.screen`): the parts that differ from the world, a world's
card as it comes, the line naming what choosing a world cleared, the device rows only once a second
prop set is loaded and what a choice there saves, every fallback the status page lists with its
reason, the labels from the world's words, World first in the rail and the screen opening on the
knight.
`tests/web/orbit.test.js` checks the test world and any loaded world drawn through the settings,
`tests/web/orbit-swap.test.js` the whole swap of a world, part by part and whole, by what the engine
reads of the scenes, the cast and the kinds while it draws, `tests/web/orbit-body.test.js` the test
world's body at the ends of the measurements' ranges in every pose, and `tests/web/orbit-parts.test.js`
its devices in every scene's places, the drone's spots, the Captain's talk, the overlay's bands and
its reserved fields under a signature ([The test world](#the-test-world)). `tests/web/world-mix.test.js` checks mixing parts across worlds
with the test world loaded: the long names of the monarch's colours and the pet's coat, a slot's
item giving way to its key, the pet's coat fitted to the pet in use, the weapon's grip from its item
and what it greys, the store's one-write choice of a part, the rows every part page lists (each
world's choices grouped, the marks of a part changed from the world, the amber lines, the roles'
labels, Coming for a body that cannot be drawn), the quiet scenes' names in a sentence, and the
admin page's household look built on the same rows.
`tests/web/state.test.js` also checks that `quiet_parts` and an event's `parts` are read as strings,
or not at all. `tests/web/streams.test.js` checks the streams' detail line and badge: the stream
shown at each moment by the clock, the clipping, each line held to the collector's `line()` through
`python3`, the fallback to the collector's `detail`, when the badge shows and its count, and the
demo's invented streams ([The page's tests](#the-pages-tests)). `tests/web/settings-schema.test.js` checks the page's lists of
settings, scenes and conditions against the settings schema. `tests/web/shared-settings.test.js` checks the shared settings against a fake server: the first
answer, the carry-over of a browser's own choices, no server, a choice sent and a write refused,
and two displays sharing one server. `tests/web/settings.test.js` checks the settings in
`web/js/settings.js` (the order of their levels, unknown values, the browser's storage refusing,
the reset, the 12-hour clock, the monarch's hair and robe with "As drawn", the scene chosen per
condition and which scenes can act which condition, the build row's names from the base pack), the
engine's quiet rotation (the five by default, and a list saved with the four there were before
the smithy kept as four) and its choice of scene, the monarch's skin, hair and robe, and the knight
drawn from the base pack in 1 080 looks of the settings', each build meeting every weapon, skin, hair
colour and hair style, every choice of the gear on every build, the gear's look, what the screen
greys and the choices' names, and every monarch in every skin, hair and robe.

`tests/web/scenes.test.js` does for the scenes what the knight test does for the knight. Against the
same kind of fake canvas it records every scene's `paint()` and `draw()`, with `act()` and `over()`
where a scene has them, call by call, in every state that changes them: idle and each condition the
scene can act, the helmet the other way from the scene's own, the television on, the house at
night with it on, the smithy with the knight away from its spot, the yard's dummy struck, the devices in all seven places up and gone, and at court
each monarch in its own colours, in each of the six skins and in a sample of hair and robe; each at
960 by 600, 1400 by 600 and 960 by 720, at five moments chosen to catch what moves. The devices are
drawn by the engine's own `KW.devices`, and a canvas drawn with `drawImage` (a device's still part,
the pie's lamp, a pose of the goblin) is written into the record with its calls. Where a scene calls
on the knight (the sleeper's head, the gear at rest, the speech bubble, a swing) the record holds
one line with the call and its arguments, since the knight test checks the knight. The goblin, the
flies and the other props of the events are recorded apart. It compares 1 917 records with those in
`tests/web/fixtures/scenes/`, one file per scene and one for those props (`cast.json`). Then it draws
each scene the medieval world's pack holds (today every scene, 1 896 records) a second time, compiled
from the pack and with the devices from its prop set and the monarchs from its cast, against the
same stored records, and the rest of the cast the pack gives against `cast.json`; checks that the compiled scene's backdrop key tells
the recorded states apart exactly as the code scene's does; and checks that it gives the code scene's
interface, the crate's stretch among it. All of it takes about 90 seconds. A failure names the scene, the state, the size, the record and the first call that
differs, with what `HEAD` draws there and what was drawn; without git, the block of 1 024 calls
where the difference lies. Store the records again only when a scene is meant to change, from code
whose drawing is known to be right, as the redesign of the scenes and devices of 17 November 2026
did, and the knight's records (`KNIGHT_LOG=write`) too when the house or the smithy change, since
the knight test draws them:

```bash
SCENES_LOG=write node --test tests/web/scenes.test.js      # stores the records of the code as it is, never the pack's
SCENES_LOG=dump:DIR node --test tests/web/scenes.test.js   # writes every record in full to DIR
SCENES_WEB=DIR node --test tests/web/scenes.test.js        # draws a copy of web/ in DIR instead
```

[The page's tests](#the-pages-tests) has the details.

`tests/web/world.test.js` checks the scene compiler and the medieval world's pack: that the pack
reads clean, where a `dev` and a deployed page draw every scene from, a refused, missing or unreadable pack and a compile that throws, each leaving
the scenes concerned the code scenes with its console line, the predicates and the backdrop's key,
`outdoors`, the foe's zone and the crate's stretch, the target's and the anvil's acts, the bellows'
and the quench's against the code smithy's (the knight's moves, the steam over the knight and the
rings before the devices), the bed and the screen, the keyframes' tracks, the rests, the rest mark
and the pegs, format 1.3's quench, bellows and `pump` (read in 1.3 alone, refused by name in 1.1
and 1.2, `pump` only in a moving or over layer of a scene with bellows, its coefficient on eighths),
and that what the compiler does not build yet is refused by name.

The repository's own page draws the knight from the base pack, and every scene, every device, the cast, the words and the overlay from the medieval world's pack, so the screenshots of the repository's page check the pack paths, and the knight test
and the scene test check both paths. A deployed copy draws from each pack while it ships signed, and
from code otherwise; to shoot the code path as well, take a second pair of sets from a copy of
`web/` whose `kw-version` is not `dev` and whose packs carry no signature;
[shots.md](./shots.md#taking-and-comparing-them) shows how.

## The pack library's tests

```bash
node --test 'tests/web/**/*.test.js'
```

`tests/web/pack.test.js` reads `tests/web/fixtures/base.pack.json`, a base-like pack, and signs it
with a key `node:crypto` generates for the run, verifying through `crypto.verify` and a canonical
form written separately in the test. It refuses one copy of the pack for each rule, with the rule
in the test's name and the exact reason it expects, refuses values of the wrong type, accepts each
limit at its edge, and feeds the reader hostile and mangled text. Scalars are refused at each end of their ranges, costs at the
limits and one past them, and the cost is checked against the calls `draw.js` makes with every
value at the ends of its range.
The sources of `pack.js` and of the scene compiler, `world.js`, are checked to hold neither `eval` nor
`Function(`. The shipped `KEYS` is
checked to hold `kw1` alone, as the 32 bytes above, in a frozen table whose bytes cannot be changed
from outside, and a pack signed by any other key under `kw1` is refused against it.

`tests/web/format-1.1.test.js` checks format 1.1. Its fixture, `tests/web/fixtures/world-1.1.json`,
is a world pack made of the world format's own worked examples (the cellar, the house's planks and
the blanket's breath, the act parts, the places, the patron, the goblin, the fly, a pet whose one
pose is a stamp in runs, the camera and the pie with its own lamp, the words, the overlay and the
preset) and of today's seven scenes' places,
spots, rounds and `can` lists; it reads clean, signed and unsigned, at the deepest nesting allowed.
The test refuses one signed copy of it for each rule above, 585 of them, rows in runs and the pet among them, each with the step and the
exact reason it expects; accepts each limit at its edge; checks the costs the counts step reports
against figures worked by hand; signs a 1.1 pack with a key made for the run and checks that the
signature holds over a pretty-printed, minified or reordered copy and breaks at a changed value in
any new section; checks that a `[1, 0]` pack still refuses every new section, that its world
fixture reads the same at `[1, 2]` and `[1, 3]` and that `[1, 4]` is refused at the format; checks the closed lists by name, the conditions against `state.js`; and feeds
the reader mangled copies and values of the wrong type, none of which may throw. It checks too that
the world's pack changes no look: `resolve()` gives the same with it loaded as without.

`tests/web/fire.test.js` checks format 1.2. On the library: the test world's copy of 1.2 is its
generator's and reads on `dev` terms; formats 1.0 to 1.3 read and 1.4 is refused at the format;
each field 1.2 adds on a `main` item, and a foe's `fires` and `aim`, is refused at `fields` in a
pack of 1.0 or 1.1; each rule of `use` (what a weapon that fires or is both must give, what a swung
one may not, the muzzle on the barrel), each field's range and kind, a stowed view's anchors, a foe
that fires without `aim` or with its muzzle outside its sprite, each with the step and the exact
reason it expects; a stowed view counted toward its item's cost and a look counting the larger of
the weapon and its stowed view; `resolve()` adding the weapon's fields only for a weapon that fires,
every swung weapon resolving with exactly the keys it had, and a weapon with a stowed view adding
the list `bodyStowed` and no other; and the flip drawing a framed point's
`p` as `-p`. On the page, with the test world's copy loaded beside the base pack: `fired()` only
for a weapon that fires; the aim held from 0.3 below level to 1.2 above it both ways, 1.4 for the
swat; the line of the shot from the muzzle passing through the point aimed at, both ways, with the
muzzle off the frame's line; `fire()`'s phases, the stance at q 0 and 1, level at .3, the recoil of
4 pixels and 0.08 at .5 gone by .6, and the shot leaving from .5; a turn to the other side never
nearer straight up than 0.25 and passing through straight down; the flip only for a weapon that
fires aimed left, never in a swing; and the front hand on its station at every aimed angle. On the
engine: `SHOT`'s numbers; a bolt's speed, landing and flash; a tracer's fade, a beam's 80 ms and the
pale snap; and at most 8 shots a frame, the first made first, a shot not yet left taking no place.

`tests/web/fire-barrel.test.js` is the barrel check. It draws, into a context that keeps the last
list to paint each pixel of the grid, every frame of `AIM2` or `AIM1` at every 0.05 of the aim's
range both ways, of `fire()` at every 0.01 of q both ways, aimed high, level and low, of two
volleys of the swat every 10 ms, one starting each way and turning across the body six times
between them at flies level, high and nearly overhead, and of the attack every 100 ms: 1 089
frames for each of 50 sets, the base pack's crossbow, the test world's blaster with and without its
deflector, its prod and the trial crossbow (`fixtures/crossbow.js`), on the base pack's three builds
in plate, mail and padded sleeves and on the test world's unit. No arm or gauntlet may paint a pixel the weapon
painted at or beyond its barrel's `from`, nor one of the shield's, in any frame: with the deflector
the turns across the body lift it ([rig.md](./rig.md#aiming-and-firing)). Drawn with the barrel from
the frame's origin instead, the same check finds the hands on the weapon, for both crossbows and the
blaster, which shows it sees what it looks for. It takes about two minutes, in a process of its own.

`tests/web/fire-acts.test.js` plays the acts with a weapon that fires, on the page's scripts under
Node with time frozen, with the test world's copy of 1.2, the trial crossbow, the base pack's
crossbow and, where it says so, the medieval world's scenes. The base pack's crossbow plays every
act the trial crossbow plays: the swat, practice, the foe, the attack, the reach, the pegs, the
anvil and the stowed view. The swat: seven flies give seven shots 300 ms apart from 450, the
oldest fly's side first and each side oldest first, so the weapon changes side once; each shot
aimed within the swat's limits, a bolt at 1.6 pixels a ms that pops its fly as it lands, and the
swat over after the last return; the prod and the arming sword still swing, with no shot. Practice,
in the code yard and the medieval pack's: the target's middle `[710, 380]` from both; the watcher
at 410, a shot at 450 into each beat of 5 600 from the muzzle to that point with the burst, and
the dummy struck the moment it lands (or at once for the prod's beam); running hot, the watcher
walking from the spot to 410 with no shot on the way and then a shot every second, each striking
the dummy; with a sword the yard as before. The foe: at every spot of the battlement and the camp,
with the blaster and the crossbow, a plan by shot whose gap lies within its least and most (the
crossbow's least at 236 or more), the step back at most 160 and away from the foe, the muzzle clear
of the foe by 30, the foe in its zone, and the hit when the bolt meets its body, inside the event;
the event itself: the step back over 900 ms, the stance until 1 250, aimed at the foe's middle just
before 1 400, the one shot at 1 400 from the plan's muzzle, the stance again by 2 040. The prod
bonks a goblin its blade reaches and shoots one beyond it, where a sword has no plan; the goblin's
event has the watcher's one shot, and Glitch's has its own at 1 350 first. The attack: aimed right with the tremble of 0.12 every 10 ms for two seconds,
and no shot. Gear at rest: `rest.reach()` the barrel, the blade or the crossbow's barrel; the
house's pegs drawn at 28 past the reach's start and 45 short of its end; the hot tip for the sword
and the prod and none for the blaster and the crossbow, from code and from the pack. Stowed: the
crossbow's view drawn in the cellar and with a crate carried in the yard, not in the house, the
smithy or in bed; `bodyStowed` the body with the view after the back slot (and after the cloak when
one is worn) for the crossbow, after the torso for the blaster, and no such list for a weapon
without a view. The shield: lifted in the middle of each turn to the left and back in `fire()`,
down at either end, never lifted aiming right or without a shield.

`tests/web/foe-fires.test.js` plays a foe that fires, in the same way, with the test world's Glitch
from its copy of 1.2 and the medieval world's scenes; the base pack's crossbow, which carries no
shield, is among the looks the shot misses overhead, flinches at and finds no shield face on. The numbers: `FOE.fires`, the aim from 1 230,
the shot at 1 350, 40 over, 0.4 down the shield, a spark of 80 and a flinch of 200. The compiler:
Glitch's poses the six and `aim` last, painted once, and its `fires` as the pack gives it; the
goblin and Glitch from the 1.1 file with six poses and no `fires`. The foe player: `aim` from 1 230
to 1 479 and the brace at 1 480, the goblin's taunt as before. The miss, with the prod in the Deck
and on the battlement, the greatsword with the kettle hat and the horsehair, the Broad build in the
bascinet and the tall feather, and the unit: one tracer at 1 350 in Glitch's colours, from its
muzzle as drawn, through the point 40 over the head group's corner nearest the foe, on off the
screen with no burst, and at least a pixel clear of every pixel the watcher is drawn with. The
shield, with the blaster and the deflector in the Deck and the arming sword and the heater on the
battlement and in the Deck: the shot stopped on the face's left edge 0.4 down, the spark drawn
there from 1 350 to 1 420. The right, the Deck with its foe zone moved right of the watcher: with
the blaster and the deflector and with the arming sword and the heater the shot is not stopped,
passes over the head group's right corner and off the screen, and the watcher flinches. The flinch:
every 10 ms of the event, with the prod, the blaster, the arming sword and the greatsword, the pose
against the same event with Glitch's `fires` taken away, equal in everything but the eyes, which
are `wide` for the 200 ms from the moment the shot passes or stops and the same otherwise, and the
watcher's own shots the same. A bolt, Glitch's shot made a bolt in memory: the flinch from when it
reaches the point it was aimed at or the shield. With the blaster both shots show at 1 410.
`shieldFace()` the heater's face on the off hand and `null` with no shield or the weapon put away;
`headBox()` holding every pixel of the head group drawn above the chin, to the pixel, its top at
most 12 above them, for four helmets and plumes on the three builds.

`tests/web/world.test.js` checks the medieval world's pack and the scene compiler: the pack reads
clean, with its signature taken off, with the costs [worlds.md](./worlds.md#the-medieval-worlds-pack) gives; a `dev` page
draws every scene from it and a deployed page from code while it is unsigned, and from it
once signed with a key made for the run, and the shipped file on a deployed page draws from it when
it carries a signature; a refused, missing or unreadable pack, a missing library and a compile
that throws all leave the scenes concerned the code scenes, each with its console line and its
status. `tests/web/world-loading.test.js` holds the world's loading and failure as
`tests/web/loading.test.js` holds the knight's: the pack refused, missing or failing to compile, a
part that throws while drawing caught and drawn from code alone from the next frame, a throw in the
engine's own drawing not put down to the pack, and the downloaded world packs
([world-loading.md](./world-loading.md#two-copies-held-equal)). That each scene from the pack draws what the code draws, call for call, is
`tests/web/scenes.test.js`'s ([The page's tests](#the-pages-tests)); that its `quiet` and `hosts` agree with
the engine's own lists, and that the foe's and the places' checks hold on it, is
`tests/web/world-scenes.test.js`'s. `tests/web/world-props.test.js` checks the devices from its prop
set ([cast.md](./cast.md#the-devices-on-the-page)), `tests/web/world-cast.test.js` its cast
([cast.md](./cast.md#the-cast-on-the-page)), and `tests/web/worlds.test.js` its preset and the presets and
prop sets of a second world pack made for the run ([worlds.md](./worlds.md#presets-on-the-page)).

`tests/web/effects.test.js` checks that `pack.js` holds an effect to its table in `effects.js`, every
field of every effect refused out of its kind or range, and costs it with its own cost function; and
that each cost function bounds what the effect draws. [The page's tests](#the-pages-tests) has the details.

`tests/web/base-read.test.js` reads the shipped base pack with the library as it is and compares the
whole result with `tests/web/fixtures/base-read.json`, first stored from the library before format
1.1 and stored again for base packs 1.4.0, 1.5.0, 1.5.1 and 1.6.0: the read of the file signed (with a key made for the run,
which reads as the file signed with `kw1` does), unsigned on a `dev` page and unsigned on a
deployed page, the SHA-256 and length of the bytes its signature covers, and `resolve()` with every
record on each build, for the default look, the sword and shield, three looks that wear the 25
free items between them, and the crossbow of 1.5.0 with the long cloak, its stowed view after the
cloak in the body's list. Storing it for 1.5.0 changed only the version, the format, the new item
and its sums, and the empty `world` a pack of format 1.1 or later reads with; every earlier look's
records and costs stayed as stored. Storing it for 1.5.1 changed only the version, the licence line
and the signed bytes' SHA-256 and length. Storing it for 1.6.0 changed the version, the licence
line, the signed bytes' SHA-256 and length, the six hair items and their sums, and in each stored
look the lists that hold its hair and the look's shapes and cost; every other record stayed as
stored. The file as it ships must read as the signed read when it carries a `sig`
and as the deployed refusal when it does not, so the test holds in either state. Store it again
only when the base pack is meant to change, from a library known to read it right:

```bash
BASE_READ=write node --test tests/web/base-read.test.js
BASE_READ=write BASE_READ_LIB=DIR/web/js/pack.js node --test tests/web/base-read.test.js   # from another copy
```

`tests/web/ed25519.test.js` tests the verifier. It checks every Ed25519 vector of RFC 8032 section
7.1 with one bit changed in each part, and SHA-512 against the digests of RFC 6234 and against
`node:crypto`. It compares the verifier with `node:crypto` on 200 generated keys, their signatures
and one-bit changes to each. For each strictness case it builds signatures that satisfy the
cofactorless equation, using curve arithmetic written apart from the verifier, and requires them
refused. No such signature can be made for a non-canonical key or `R` that is not also of small
order, so the decoding is tested by itself against every encoding with `y` of `p` or more and 300
random ones. Wrong arguments, the fixture pack read through `pack.js` with this verifier in place,
and the same check of the source as for `pack.js` complete it. Under Node 26, `node:crypto` gave
the same answer as this verifier for every signature the tests put to both.

`tests/web/base-pack.test.js` checks the base pack, and holds whether it ships signed or not. An
unsigned copy (the shipped file with any `sig` taken off) is read on a `dev` page and refused at
the `signature` step otherwise; the file as it ships is read on every page when it carries a
signature, and on a `dev` page alone when it does not. It also checks the three builds as
recorded in `fixtures/base-builds.json`, with their names, Classic the present measurements, every
head 51, every torso within the rule and every measurement at least 6 from the ends of its range;
one item for each slot the present drawing has, the arming sword and the heater shield, the six
hair styles, the free items of 1.4.0 after the 15 of 1.3.0, then the crossbow of 1.5.0 and the
buzzcut of 1.6.0, format
`[1, 2]`, the wool palette, and nothing more;
six swatches in each set in the settings screen's order, today's the defaults; each item and
swatch equal to the fixture's, to `fixtures/base-builds.json` for the three items fitted to the
builds, to `fixtures/base-onehand.items.json` for the one-handed items, to
`fixtures/base-options.json` for the free options and the tied hair, curls and buzzcut of 1.6.0, to `fixtures/base-free-items.json` for the free items, the long and close hair
of 1.6.0 among them, or to `fixtures/base-crossbow.json` for the crossbow (named "Crossbow" and with no flash
of its own, its flash being the engine's pale snap), with the iris of the shield, worn and at rest, on `@tabard.3` and no `@base.b3` left; a
default look that resolves with nothing missing at a cost of 14 225 and 121 shapes, and each build
likewise; the look with the sword and shield resolving with nothing missing, one-handed, at 141
shapes; every one of the 31 104 combinations of build, skin, hair colour, the first three hair
styles and the buzzcut, tabard, plume and the first two weapons resolving with nothing missing, the
heaviest the curls with the sword and shield at 183 shapes and 15 490;
every item of every slot on every build, with each weapon where the grip matters and a shield with
each one-handed weapon, resolving with nothing missing, and every shield refused beside a
two-handed weapon; the mail coif drawing no plume and every other helmet each plume; the long
cloak changing with the plume and not the tabard and the short cape the other way round; each
swung weapon's grip and blade; the crossbow's fields, its 45 shapes at 6 309 held and slung, no
blade, and its look on every build at 132 shapes and 14 243 with its stowed list; and the costliest whole look of the free items, the long hair among
them, with each grip, at 209 shapes and 21 400 and at 196 and 20 628, the same on every build, under
0.54 of the cost cap. `tests/web/knight.test.js` draws the
knight's 105 poses, the bare head in bed, the speech bubble, the gear at rest, and the house and the smithy painted and drawn, from the base
pack as the page does, and compares every call with the record taken from the code. It draws the
code path from the unsigned copy, which a deployed page always refuses, and edits only that copy, so
it too holds in either state. It checks that a deployed page draws from the shipped base pack when
it is signed and from code when it is not, and, with a key made for the run swapped into the
sandbox's `KEYS`, that a deployed page reads a signed base pack through `KW.ed25519.verify` and
draws from code when no verifier is loaded. It also checks
that a pack's colours reach the gear at rest, and that a helmet with no rest view and a weapon with
no `blade` show nothing there. It checks that the face takes the look's skin and hair colours and
that a deep skin with black hair, made for the test, leaves no colour of the warm skin in any
condition's face. With the sword and shield it checks the one-handed grip, the stance
and the attack, the free hand hanging when there is no shield, the change to `oneCrossed` in the
swing to the left, the pegs, the shield's places and the backdrop keys, and, frame by frame, that
no arm is drawn over a blade or a shield, in the swings, the attack and the goblin strike ([rig.md](./rig.md#anchors-values-and-poses)). [The page's tests](#the-pages-tests) describes it.
The same checks for the free items of 1.4.0 run in `tests/web/knight-free-classic.test.js`,
`knight-free-broad.test.js` and `knight-free-slim.test.js`, one build each in a process of its own:
the frame-by-frame arm check with every new weapon and every shield it may carry, and with the mail
and the padded sleeves and gloves beside a two-handed and a one-handed weapon; every free item in
every pose of the call record, both swings and the attack, without a throw and within its look's
cost; the longsword and the mace held exactly where the greatsword and the arming sword are, frame
by frame; the mace's head glowing on the smithy's anvil; and the crossbow of 1.5.0 in every pose of
the call record, aimed and fired both ways, in the attack and slung, without a throw and within its
look's cost, keyed into the house's and the smithy's backdrops and lying on the anvil with no hot
tip.

`tests/web/loading.test.js` checks loading and failure. For the index: its shape, more than 32
names, and names that carry a path or are not a pack file's. For the fetch, against a fake `fetch`:
a missing index is silent and asks for nothing else; an index that is not JSON, too large, answered
with an error, or not answered within four seconds is refused whole; a bad name is never asked
for; a file that is missing, fails, hangs or is too large is refused with its name; a file that
fails `read()` at the size, json, envelope, signature, format, fields or references step is refused
with its name and id. On a deployed page an unsigned downloaded pack and one signed by an unknown
kid or by the wrong key are refused, and one signed with a key made for the run and passed through
`keys` is read and drawn; a `dev` page reads the unsigned one. Each refusal is in the status and
written to the console once. A look naming a missing build, item or swatch falls back to the
base pack's defaults and draws what the default look draws; a one-handed weapon from another pack
is held in one hand; and a shield without one falls back to none, with its reason, and the knight
draws as the default knight does. With no base pack, a broken one, an unsigned one or one signed by an unknown kid on
a deployed page, no pack library, and after a throw inside the base pack's lists, the page draws
from code, and 28 records of the knight, the sleeper's head, the gear at rest, the house and the
smithy must equal, call for call, the records `knight.test.js` stores from the code. A throw
inside a downloaded pack's list, a list of the gear at rest or the sleeper's head is caught and
the right pack marked bad, and a throw in the engine's own drawing is not. `look()` draws a new look
from the packs already read, a signed downloaded pack's tabard included, keeps every refusal, says
nothing new in the console, and does nothing before `start()`, where `start()` again loses the
downloaded pack.

`tests/web/settings.test.js` draws the knight from the base pack, through the settings and
`KW.knight.look()`, in each of the 720 looks of weapon by skin by hair colour by hair style, the
tabard and the plume cycled through their six, standing, attacking and swinging, helmet on and off,
with the bare head and the gear at rest; each draws its colours with no throw, no fallback and no
refused pack, within the shape and cost caps. It draws every choice of the gear the same way on
every build, beside a two-handed and a one-handed weapon in turn. It also draws every monarch in
every skin, hair and robe of the base pack, each monarch's own hair and robe among them.
[The page's tests](#the-pages-tests) lists the rest of what it checks.

```bash
node --test 'tests/tools/**/*.test.js'
```

`tests/tools/pack-carrier.test.js` checks the carriers against their pack files and the tool
itself.

`tests/tools/sign-pack.test.js` checks the signing tool with key pairs generated for the run and
held in memory; no key of any kind is in the repository, and the files signed are copies in a
temporary folder. A copy of the fixture pack is signed and must verify through `pack.js` and
`ed25519.js`, and through `node:crypto` on the bytes `message()` gives, with only the `sig` added to
the file and the carrier matching. An edit after signing must be refused until the pack is signed
again. The tool must refuse to run without its variable, with a key whose public half is not the
table's, with a key that is not Ed25519 and with a kid the table lacks, writing nothing and never
printing the key, and must write nothing when any one of several files is refused. `--unsign` must
give back the unsigned file byte for byte. Last, every pack in `web/packs/` that carries a `sig`
must verify against the shipped `KEYS` with the page's verifier.

## The test world

`test.orbit` ("Orbit") is a small world made unlike the medieval one, so that anything the engine
still assumes about the medieval world shows at once. It lives in
`tests/web/fixtures/worlds/test.orbit.pack.json`, outside `web/`, so `tools/deploy.sh` never copies
it; it is never signed, and the tests read it on `dev` terms. Beside it,
`test.orbit-fire.pack.json` is a copy of format 1.2 with weapons and a foe that fire (the last row
below). `tests/web/fixtures/worlds/orbit.js` writes both, and checks them with `--check`
([below](#the-test-world)). What it holds:

| Part | What | Proves |
|---|---|---|
| body | `body.unit`, "Unit", a box-headed robot at an end of every measurement's range (shoulder 40, chest 32, waist 28, hip 32, stance 16, leg 100, height 160, head 42), with its own head item `head.unit` | the knight drawn on another pack's body, with its head |
| outfit | the base pack's gear in flat panels, one item in every slot but `off`, since the pry bar takes both hands (`main.bar`, `helm.dome`, `plume.aerial`, `hair.wire`, `back.panel` and the rest), and a swatch of each set: `chrome` skin with its `sick` and `hot` ramps, `wire` hair, `panel` tabard, `beacon` plume | items and swatches from another pack; the face on a metal skin |
| scenes | `deck`, quiet, acting every condition but `ssh_session` and `updating`, with a bunk as its `bed`, a wall panel as its `screen`, a layer while the WAN is down, three ground places, the effects `stars`, `twinkle` and `drift` falling, a keyframe clock in ms, and a foe zone with no wall; `bridge`, with a `seat` for the Captain and a workbench as its `anvil`, acting `ssh_session` and `updating`; `airlock`, acting `cpu_hot` alone | another world's scenes in turn and for conditions; each act in its own condition; the Airlock offered for running hot alone |
| cast | `patron.captain`, with its own anchors and mouth; `foe.glitch` (out of the floor); `critter.moth` (the Spark moth); `pet.drone` (a hover drone with a resting spot in each scene, clear of every place, which catches the moths) | the cast on rigs of their own; a foe in a scene without a wall; the pet role on art that is not a cat |
| props | `props.orbit`: `pi` (a pie tin with an aerial), `camera` (a dome) and `machine` (a rack), each with the engine's own lamp; no `vm` or `box` | the per-kind fallback to the base world's drawing |
| words | `words.orbit`: `ALL CLEAR`, `{n} ads zapped`, captions `EJECTED {addr}`, `DOCKED`, `LOGGED` | another world's words, fitted to 52 and 44 |
| overlay | `overlay.orbit`, each level's colours near the edges of its band, the font `vt323` | another world's overlay; the band checks |
| reserved | junk in `sounds`, a scene's `sound` and `companion`, the preset's `sound` and `companion` | read, covered by a signature and ignored |
| preset | `world.orbit`, Orbit whole | a world chosen whole draws only its own parts |
| weapons and a foe that fire, in a copy of format 1.2 | `test.orbit-fire.pack.json`, the same pack at version 1.1.0 and format `[1, 2]`: `main.blaster`, one-handed, `use` `fire`, a bolt, holstered on the right hip when stowed; `off.deflector`, the base pack's heater shield in flat panels; `main.prod`, two-handed, `use` `both`, a beam with no flash colour, slung across the back when stowed; Glitch with `fires`, a tracer, and the pose `aim`; the preset's outfit the blaster and the deflector | the fields of 1.2 on a body at the ends of the ranges; a weapon of each use; a foe that fires, aiming and shooting first, missing over the head or stopped at the deflector (`foe-fires.test.js`); a page of format 1.1 refusing the copy at `format` |

The copy of format 1.2 is a file of its own, under the same id, so that the 1.1 file stays as it
was for every test and shot that reads it, and a page of format 1.1 can be shown refusing the copy
while reading the 1.1 file. The tests read the copy, and so do the `orbit-fire-` shots, taken from
the same copy of `web/` as the `orbit-` shots with the copy's carrier in place of the 1.1 file's
([shots.md](./shots.md)); every other shot takes the 1.1 file.

Its Deck's still layers cost 185 308 fills at the widest screen, within 10 percent of the 200 000 a
scene may, which shows the cap is reachable and holds. A second preset, "Orbit (broken)", whose
quiet scene cannot act a device going down, is made by the generator's `broken()` and refused at
`rules`; it is not in the file, since a refused preset refuses its whole pack.

Four test files read it. `tests/web/orbit.test.js`: the fixture is the generator's, unsigned, and
no pack under `web/packs/` has an id starting `test.`; it reads clean on `dev` terms and a deployed
page refuses it unsigned, here and downloaded through `data/packs/`; every part compiles and is put
in place under its long name; Orbit chosen whole sets every part to its own and the knight wears
its body and outfit; its words and overlay are put in use; its props draw three kinds and the base
world's the other two; the engine plays its scenes for each condition, its foe out of the Deck's
floor, its moth and its drone catching the moths in the Deck and the Bridge and resting in every
scene; its parts mixed into the medieval world, the Airlock refused for an attack; the level rule
of a world; a scene and a foe that throw giving way to the base world's; and with Orbit loaded and
nothing chosen, the medieval world frame for frame as without it.

`tests/web/orbit-swap.test.js` proves the whole swap. It watches what the engine reads of
`KW.scenes`, `KW.cast` and `KW.kinds` by name while it draws a tour: the first quiet scene with the
foe's event and a fly, each quiet scene in turn, the crate, the feast, and every condition with a
fly where one may come. Orbit chosen whole reads its own three scenes, four members and three kinds
and of the medieval world only the VM's and the box's drawings, with no fault; its quiet line and
captions fit 52 and 44 as the collector's do. The medieval world is then drawn with each of Orbit's
parts swapped in alone (body, swatches, every item, patron, foe, critter, pet, prop set, words,
overlay, quiet scenes, the scene of each condition), and Orbit with each of the medieval world's:
each swap changes the reads of its own part and no other, throws nothing, keeps the knight drawn
from the packs within the look's caps, and reports no fallback but the two kinds Orbit's set lacks.
Orbit unchosen on the display brings the medieval world back frame for frame, with nothing of
Orbit's read, and a copy of the library of format 1.0 refuses Orbit at `format`. A copy of the
library of format 1.1 refuses the copy of format 1.2 at `format` and reads the 1.1 file exactly as
this library does. Both copies refuse the base pack at `format` too, since its crossbow made it a
pack of format 1.2.

`tests/web/orbit-body.test.js` draws Unit, at an end of every measurement's range, in every pose,
swing and attack frame, in its own outfit and in the base pack's one-handed gear, without a throw or
a fallback and within the look's cost; holds its hands on the grip through both swings, the attack
and the strike; and has every weapon meet Glitch and the goblin on the Deck and the battlement.
`tests/web/orbit-parts.test.js` stands Orbit's devices in every place of every scene, and the
medieval world's in Orbit's, on the grid and clear of each other; keeps the drone's resting spot
clear of every place; has the Captain talk on the Bridge while a shell is open and sit silent while
updating; refuses an overlay colour past the edge of its band at `rules`; and signs Orbit with a key
made for the run, which covers its reserved fields, and draws it the same without them.

`tools/shots.sh worlds` takes the `orbit-` shots of the wall from a copy of `web/` with Orbit's
carrier added: Orbit chosen whole in every scene, condition and event, the drone's catch, the medieval
world with Orbit's parts and Orbit with the medieval world's ([shots.md](./shots.md#taking-and-comparing-them)).

The two files are written by their generator, never by hand:

```bash
node tests/web/fixtures/worlds/orbit.js           # writes both files
node tests/web/fixtures/worlds/orbit.js --check   # exits 1 when either is not what it writes
```

`tests/web/orbit.test.js` fails while the 1.1 file differs, and `tests/web/fire.test.js` while the
copy of 1.2 does, so change the generator and run it, then commit all three. Neither file is ever
signed, with `kw1` or any key, and neither goes under `web/`, so `tools/deploy.sh` never copies
them; `tests/web/orbit.test.js` fails if any pack under `web/packs/` has an id starting `test.`.
They are read only on `dev` terms. To look at the 1.1 file on a wall, from a copy of `web/`
outside the repository with its carrier added, the way [shots.md](./shots.md#taking-and-comparing-them)
shoots the code path:

```bash
cp -r web /tmp/kw-orbit
cp tests/web/fixtures/worlds/test.orbit.pack.json /tmp/kw-orbit/packs/
node tools/pack-carrier.js /tmp/kw-orbit/packs/test.orbit.pack.json
sed -i 's#<script src="packs/medieval.pack.js"></script>#&\n<script src="packs/test.orbit.pack.js"></script>#' /tmp/kw-orbit/index.html
# then open /tmp/kw-orbit/index.html#wd=test.orbit/world.orbit, or shoot it with PAGE=
```

The address's `wd=` chooses the world, and `fo=`, `cr=`, `pr=`, `wo=` and `ov=` its foe, critter,
prop set, words and overlay alone ([display.md](./display.md#the-address)). `tools/shots.sh worlds DIR`
makes the same copy in a folder of its own, takes from it the `worldmix-` shots of the settings
screen and the `orbit-` shots of the wall, then puts the copy of 1.2 behind the same carrier and
takes the `orbit-fire-` shots, and removes the copy. Take a reference set with `worlds` before
a change and another after it, and compare them with `compare-worlds`, as for the main set; a change
to the test world itself changes the shots that show the part changed.
