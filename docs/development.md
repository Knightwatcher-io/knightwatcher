# Development

Read this page before changing anything, and [security.md](./security.md) before committing.
The design is in [design.md](./design.md), and the contract between the collector and the page
is in [state.md](./state.md). Read [page.md](./page.md) before touching `web/`, and
[rig.md](./rig.md) before touching `web/js/knight.js`; [collector.md](./collector.md) before
touching `collector/`, [server.md](./server.md) before touching `server/`;
[packs.md](./packs.md) and [library.md](./library.md) before touching `web/js/pack.js` or a pack
file; and [world-loading.md](./world-loading.md), [scenes.md](./scenes.md) and
[cast.md](./cast.md) before touching `web/js/world.js`, the medieval world's pack or a scene it
holds. The website at knightwatcher.io is described in [site/README.md](../site/README.md). What
the tests check is in [tests.md](./tests.md), and the screenshots in [shots.md](./shots.md).

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/, packs/)
  admin/             the admin page, served by the bundled server alone
  js/scenes/         one file per scene
  packs/             the packs that ship with the page, each a .pack.json and its .pack.js carrier
collector/           the collector: Python, standard library only (overlay.py reads the admin
                     page's admin.json and lays it over config.toml, reload.py takes up a change
                     between polls, heartbeat.py sends the usage counts, displays.py reads and
                     counts the server's displays.json)
  sources/           one module per source, and KindSource for the sections read through a kind
  kinds/             one module per kind: the shape of a sort of reading, its facts and events;
                     check.py compiles each [[sources.json]] entry into a provider of its own
  providers/         the engine that runs provider files, the path syntax, the format's checks,
                     the reading of the providers folder, and the code adapters (fail2ban.py)
    builtin/         the built-in provider files, one for each service
  settings-schema.json  every setting of config.toml and every variable of .env
server/              the bundled server: Python, standard library only, reusing the collector's
                     checks (app.py the HTTP side, store.py the shared settings, admin.py the
                     admin page's password, sessions, store, checks and export, displays.py the
                     displays seen, stamp.py the page's version stamp at build time)
telemetry/           the Cloudflare Worker that receives the usage heartbeat; see telemetry/README.md
site/                the website at knightwatcher.io: its pages and pictures, build.mjs, which writes
                     dist/ with the docs from docs/README.md's index, Supported Feeds from the provider
                     files, the legal pages from legal/ and a stamped copy of web/ as the demo, the
                     Worker that serves it and a local preview; see site/README.md
tests/
  collector/         unittest tests for the collector
    fixtures/port/   what the collector wrote before the provider engine, for the same polls, which
                     the port proof holds the engine to byte for byte; the Tautulli polls with no
                     stream count were recorded again since (tests.md)
    fixtures/providers/  each built-in provider's exchanges and fill, every value invented
  server/            unittest tests for the server, the displays and the stamp
  web/               node tests for the page's scripts
    fixtures/knight/ the stored call record of the knight's drawing
    fixtures/scenes/ the stored call records of the scenes, and of the props the engine draws over
                     them
    fixtures/worlds/ the test world, test.orbit.pack.json, its format 1.2 copy with weapons that
                     fire, test.orbit-fire.pack.json, and orbit.js, which writes both (never
                     signed, never under web/; see The test world below)
    fixtures/        a fixture pack for the pack library's tests, the base pack's sword and
                     shield (base-onehand.items.json), its free options and the
                     hair of 1.6.0 (base-options.json), its three builds and the
                     items fitted to them (base-builds.json), its free items of
                     1.4.0, the long and close hair as redrawn in 1.6.0
                     (base-free-items.json), its crossbow of 1.5.0
                     (base-crossbow.json), a world pack of format 1.1 for the library's tests
                     (world-1.1.json), the base pack's read, first stored from the library
                     before format 1.1 (base-read.json), a state file with the settings'
                     defaults (state-defaults.json), and crossbow.js, the trial crossbow of
                     format 1.2 that the tests of weapons that fire make in memory
  tools/             node tests for tools/deploy.sh, tools/pack-carrier.js, tools/sign-pack.js,
                     tools/settings-schema.js, tools/cat-stamps.js, tools/check-private.sh and
                     tools/shot-scale.js
  site/              node tests for the website's build, its docs and Supported Feeds
                     (docs.test.mjs), its markdown renderer and its Worker
tools/
  deploy.sh          copies web/ to a served folder and stamps the copy with a version
  pack-carrier.js    writes the carrier of each pack in web/packs/
  cat-stamps.js      writes the mouser cat's stamps and cast member into the medieval world's pack,
                     from its drawing in web/js/cat.js
  sign-pack.js       signs pack files, or takes their signatures off, and writes their carriers
  settings-schema.js writes the page's copy of the settings schema and the reference in
                     docs/configuration.md
  icons.sh           regenerates the favicon and the app icons from the drawings in icons/
  icons/             icon-16.svg, icon-32.svg and icon-48.svg for favicon.ico, icon-d.svg for
                     the larger icons
  shots.sh           regression screenshots of the page, and the website's pictures
  shot-scale.js      shrinks the website's pictures for `shots.sh site`, the same bytes each time
  shots-clock.js     stops the clock in the copy of web/ that `shots.sh site` shoots
  contact-sweep.sh   every swung weapon against the drawn goblin at every spot, held to the
                     contact standard (its scripts in contact-sweep/, which the page's tests share)
  capped.sh          runs a command within a ceiling on CPU and memory, for the checks
  throwaway/         scripts that start a real service from its published image, read it with the
                     collector, and remove everything again (fail2ban.sh, pihole.sh,
                     technitium.sh, lidarr.sh, usage.sh)
  clean-start.sh     the README's quick start in a scratch copy, both containers on a network
                     with no route out, checked and removed
  check-private.sh   the check that no private detail is tracked
  private-patterns.example.txt  the template of the patterns check-private.sh reads
docs/                this documentation, indexed in docs/README.md; install.md is the full install
legal/               the privacy notice, the art licence (ART-LICENCE.md, the full text in
                     LICENSE-ART), the name and the logo, and the DCO
.github/             CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md and SUPPORT.md, the issue
                     forms, the pull request template and the workflows
providers/           provider files of the user's own: shipped empty with a .gitkeep, everything
                     else in it ignored by git, mounted read-only into both containers
README.md  LICENSE  compose.yaml  Dockerfile  config.example.toml  .env.example  pyproject.toml
```

## Rules

- **The contract comes first.** A change to what the collector writes or the page reads changes
  [state.md](./state.md) in the same commit.
- **The page has no build step and no dependencies.** It must open from disk in a browser.
- **The collector and the server use the standard library alone.** A dependency needs a reason
  written here.
- **A provider is a file first.** A service that a kind covers is read through a provider file
  ([providers.md](./providers.md)), and code is written only for what a file cannot describe: a
  code adapter, such as `collector/providers/fail2ban.py`, which reads a SQLite database.
- **A pack file and its carrier change together.** After editing a file in `web/packs/`, run
  `node tools/pack-carrier.js` and commit both; a test fails while they differ. See
  [library.md](./library.md#carriers).
- **A change to the medieval art is made in both copies, in the same commit.** A scene the medieval
  world's pack holds (today every scene) is drawn from the pack and, as the fallback, from its code in
  `web/js/scenes/`. Change both, write the carrier, and `node --test 'tests/web/**/*.test.js'` holds the two to the
  same call records. See [world-loading.md](./world-loading.md#two-copies-held-equal). The mouser cat is written
  into the pack by a tool: after a change to `web/js/cat.js`, run `node tools/cat-stamps.js` and
  then `node tools/pack-carrier.js`, and `node --test 'tests/tools/**/*.test.js'` fails while the pack and the
  code differ.
- **A setting starts in the schema.** Every setting of `config.toml` and every variable of `.env`
  is described in `collector/settings-schema.json`. A new or changed one is written there first,
  then in `config.example.toml` or `.env.example`; then run `node tools/settings-schema.js`, which
  writes the page's copy in `web/js/settings.js` and the reference in
  [configuration.md](./configuration.md#every-setting). Tests fail while any of them disagree.
- **A signed pack is signed again after any change.** Editing a pack that carries a `sig` breaks
  its signature, and `node --test 'tests/tools/**/*.test.js'` fails until it is signed again or unsigned with
  `node tools/sign-pack.js --unsign`. See [Signing the packs](#signing-the-packs).
- **No key in the repository.** No private key of any kind is committed, test keys included; the
  tests generate theirs in memory for each run.
- **Invented data everywhere.** See [security.md](./security.md). Run `tools/check-private.sh`
  before every push.
- **Docs describe what is built.** The last step of every change is the docs: check each doc
  that describes what you changed against what you built, and correct whatever no longer
  matches, in the same commit. A change whose docs are stale is not finished.
- **Prose is plain.** British English, no emojis, no em dashes, no filler.
- **Every commit is signed off.** `git commit -s` adds the `Signed-off-by:` line of the Developer
  Certificate of Origin; [CONTRIBUTING.md](../.github/CONTRIBUTING.md) says what it certifies.
- **Commits follow Conventional Commits.**

## Checks

`tools/check.sh` runs every check a pull request must pass, in order, and stops at the first
failure:

```bash
tools/check.sh                     # all of them
tools/check.sh python              # one subset: python, lint, page, tools-site, schema or private
tools/check.sh page --shard=1/3    # the first of three parts of the page's tests
```

| Subset | What it runs |
|---|---|
| `page` | `node --check` on every script under `web/js`, `web/packs` and `web/admin`, then `node --test 'tests/web/**/*.test.js'` |
| `python` | the collector's and the server's unittest suites |
| `lint` | `ruff check` and `ruff format --check` on `collector`, `server` and `tests` at ruff 0.17.6: the `ruff` on the path when it is that version, otherwise `uvx ruff@0.17.6` |
| `tools-site` | `node --test 'tests/tools/**/*.test.js' 'tests/site/**/*.test.mjs'` |
| `schema` | `node tools/settings-schema.js --check` |
| `private` | `tools/check-private.sh` |

`all`, the default, runs `node --check` first, then python, lint, the page's tests, tools-site and
schema, and private last when `tools/private-patterns.txt` exists, saying so when it skips it.
`tools/check.sh private` alone runs the check whether or not the file exists, so without one it
fails with exit 2. `--shard=N/M` passes `--test-shard` to node, and a part after the first leaves
`node --check` out, so a sharded run does it once. node is given glob patterns in quotes, which it
expands itself, and never a folder: Node 24 loads a folder as a module, so `node --test tests/web/`
fails there although it runs on Node 26. A pattern that matches no file fails the step, and so
does a run in which node reports no test, such as a shard that is given no file, so a mistake in a
pattern cannot pass having run nothing. `KW_TEST_CONCURRENCY` (default 2) is node's
`--test-concurrency`. Each step prints a line as it starts and one as it ends, the run stops with
the failing command's exit code, and the script exits 2 on an argument it does not take. It puts
itself inside the ceiling described below. The whole set takes about 13 minutes, nearly all of it
the page's tests.

CI, in `.github/workflows/ci.yml`, runs the same subsets through `tools/check.sh` on every pull
request and every push to `main`: python, lint, the page in three parts side by side (with
`KW_TEST_CONCURRENCY=4`), tools-site and schema. Two jobs of its own cover what the script does
not: the receiver's `npm ci` and `npm run check` in `telemetry/`, and `docker build` followed by
`docker compose config -q` with `.env.example` and `config.example.toml` copied into place. A job
named `CI gate` passes when every other job has, and is the check a pull request must pass, with
`Signed-off-by on every commit` from `.github/workflows/dco.yml`. `tools/check-private.sh` does not
run in CI, since its patterns are never in the repository.

The commands each step runs are listed below for reference, with the checks the script leaves out,
such as the image, the throwaway services and the screenshots.

The checks and the screenshots are run inside a ceiling on CPU and memory, `tools/capped.sh`, so
that they never crowd out the services on the machine they run on. The page's tests alone would
otherwise take a core for each test file at once, and the scene records' file grows to about 1 GB.
Under a systemd user session the wrapper runs its command in a transient scope with `CPUQuota=400%`
(four cores) and `MemoryMax=4G`, at `nice` 10; without systemd it lowers the priority alone.
`KW_CPU` and `KW_MEM` change the ceiling, for example `KW_CPU=200% tools/capped.sh ...`.
`tools/check.sh` and `tools/shots.sh` put themselves inside the same ceiling, and `node --test` is given
`--test-concurrency=2`, so at most two test files run at once. The wrapper exports `KW_CAPPED` to
its command either way, the ceiling in the scope it makes and `nice` where it makes none, and a
script that caps itself, as `tools/shots.sh` does, sees it and does not cap itself again;
`tools/capped.sh` called with `KW_CAPPED` set runs its command at `nice` 10 without a second scope.
The command's exit code is the wrapper's.

The collector and the server:

```bash
tools/capped.sh python3 -m unittest discover -s tests/collector -v
tools/capped.sh python3 -m unittest discover -s tests/server -v
uvx ruff@0.17.6 check collector server tests && uvx ruff@0.17.6 format --check collector server tests
docker build -t knightwatcher:dev .
docker compose config -q
python3 -m collector --check-config --config config.toml --env-file .env
```

No test reaches the project's receiver of the usage counts: `tests/collector/kw_helpers.py`
points `heartbeat.ENDPOINT` at a closed loopback port for the whole run, and the tests of the
heartbeat send to a local fake receiver of their own. Only the collector's loop sends, never
`--once` or a check, so `python3 -m collector --once` on a checkout sends nothing either.

The collector's TLS test needs `openssl` on the path, to make a self-signed certificate that is
thrown away after the run; without it that test is skipped and says why.

The last two need a `.env` and a `config.toml` in place; see
[configuration.md](./configuration.md). `tests/collector/test_schema.py` checks the settings schema
against the collector, `config.example.toml`, `.env.example` and `compose.yaml`, each service's
mounts included, and that the server is given no variable but its address and port.
`tests/collector/test_reload.py` checks admin.json laid over `config.toml`, the start and reload
rules, the credentials' names and the acknowledgement in the state file.
`tests/collector/test_provider_files.py` checks the providers folder: which files are read and
which left out, a `from` naming one, the settings a file declares, `--check-config`, `--probe` and
taking up a change while the collector runs. `tests/server/` runs the
server on the loopback, the admin page's side with a password made for the run; its stamp test
needs bash and rsync, for `tools/deploy.sh`, and is skipped without them. [server.md](./server.md#checks) lists what they
check.

A provider proved against the real service runs from `tools/throwaway/`, outside the default
checks since it needs Docker and pulls an image. Each script starts the service from its
published image on a Docker network of its own with nothing published, caps every container at 2
CPUs and 1 GB, sets the service up through files it mounts or its own API rather than with
`docker exec` (which,
like installing anything in a running container, trips a host's runtime security alerts), runs
the collector from the image it is built on with this checkout's code, and removes the
containers, the network and its scratch folder however it ends:

```bash
tools/throwaway/fail2ban.sh     # crazymax/fail2ban: a ban, the attack, an unban, a rebuilt file
tools/throwaway/pihole.sh       # pihole/pihole: flies, one session, a wrong password, https, v5
tools/throwaway/technitium.sh   # technitium/dns-server: a token by API, flies, a wrong token, v14
tools/throwaway/lidarr.sh       # linuxserver/lidarr: its key from config.xml, an empty history, a list entry, a wrong key
tools/throwaway/usage.sh        # Prometheus 3 and 2, Glances 4, a Beszel hub and agent: each usage provider, wrong passwords
```

A service with no throwaway, such as Plex Media Server, which needs a Plex account, Tracearr,
which needs a media server to watch, or Jellyfin, whose sessions need a client playing, is proved
against the live one with `--probe` on the host: a config of the probe's own with that one
section, `--admin /nonexistent`, and `--env-file .env`, so that neither the wall's config nor its
container is touched and no credential passes through the command line
([providers.md](./providers.md#proving-a-provider---probe)). `--record` keeps the exchanges in a
scratch folder for checking the fixtures' shapes; the recording is private and is deleted once
the fixtures are checked.

The page:

```bash
for f in $(find web/js web/packs web/admin -name '*.js'); do node --check "$f" || exit 1; done
tools/capped.sh node --test --test-concurrency=2 'tests/web/**/*.test.js'
tools/capped.sh node --test --test-concurrency=2 'tests/tools/**/*.test.js'
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
# the settings screen and the wall with the test world loaded, from a copy of web/ the script makes
# and removes
CHROME=/path/to/chrome-headless-shell tools/shots.sh worlds /tmp/kw-worlds-new
tools/shots.sh compare-worlds /tmp/kw-worlds-ref /tmp/kw-worlds-new
# the website's pictures in site/img/, after a change to the art
CHROME=/path/to/chrome-headless-shell tools/shots.sh site
```

[tests.md](./tests.md) says what each test file checks, and [shots.md](./shots.md) what the
screenshots show and what to expect against an older reference.

The receiver of the usage counts, in `telemetry/`, is TypeScript for Cloudflare Workers with its
own dependencies, kept out of the image by `.dockerignore`. It needs Node 24 or newer:

```bash
(cd telemetry && npm ci)
tools/capped.sh npm --prefix telemetry run typecheck
tools/capped.sh npm --prefix telemetry test
```

The website, in `site/`, needs Node 24 or newer and nothing else. Its tests, and the build, which
writes `site/dist/` (ignored by git):

```bash
tools/capped.sh node --test --test-concurrency=2 'tests/site/**/*.test.mjs'
tools/capped.sh node site/build.mjs
```

The build copies `web/` into the site as its demo, so a change to the page reaches the website with
the next deploy; [site/README.md](../site/README.md) says how to preview the site and deploy it.

After any change to a weapon, the strike, the goblin or a scene that hosts it, run the contact
sweep as well. The page's tests hold the swung weapons to the contact standard at a few dozen spots;
the sweep holds them to it at every spot the knight walks over on its patrol, on every build, in
about fourteen minutes, and exits 1 on any fault ([tests.md](./tests.md#the-contact-standard)):

```bash
tools/contact-sweep.sh /tmp/kw-contact
```

Three files are written by a tool, and each tool has a `--check` mode that writes nothing and exits
1 when the file in the tree is not what it would write:

```bash
node tools/settings-schema.js --check        # web/js/settings.js's copy and configuration.md's reference
node tools/cat-stamps.js --check             # the cat's stamps and pet.cat in the medieval world's pack
node tests/web/fixtures/worlds/orbit.js --check   # the test world and its 1.2 copy
```

`tools/settings-schema.js --check` names each stale file, and exits 2 on an error or an argument it
does not take. The carriers and the signatures have no such mode: `node --test 'tests/tools/**/*.test.js'` fails
while a carrier differs from its pack or a signed pack no longer verifies.

`tools/check-private.sh` checks that no tracked file holds a private detail of the operator's. It
reads `tools/private-patterns.txt`, which git ignores, one extended regular expression per line,
matched without regard to case; copy `tools/private-patterns.example.txt` and fill it in. It runs
`git grep` over every tracked file but the example, prints each line that matches and exits 1 when
any does. It exits 2 when the pattern file is missing or empty, and when `git grep` itself fails,
as it does on a pattern it cannot read, saying so on stderr, so a check that did not run never
passes as clean ([security.md](./security.md#what-never-enters-the-repository)).

### The clean start

`tools/clean-start.sh` checks that a new install starts cleanly on a machine that is not the
operator's. It needs Docker with its compose plugin, `setfacl` and `python3`, and runs within the
ceiling of `tools/capped.sh`, each container capped at 2 CPUs and 1 GB:

```bash
tools/clean-start.sh
```

It copies the files git would commit (so no `config.toml`, `.env` or `var/`) to a scratch folder
and follows the README's quick start there: `config.example.toml` and `.env.example` copied as
they are, `var/out` and `var/server` made and granted to uid 10001, a touched backup log. In `.env`
it fills the backup log and the data disk's folder (both under `var/`) and the server's address
and port (127.0.0.1 and a free one), and nothing else; no `COMPOSE_` variable of the caller's
reaches compose, and no `KW_` one but the `KW_CAPPED`, `KW_CPU` and `KW_MEM` of `tools/capped.sh`,
which compose does not read. `compose.yaml` is used as it is under a layer of the run's own: an
image tag, a project name and container names of the run, so nothing of a running deployment is
named, and both containers on one internal Docker network, the collector taken off the host's
network for it. The image is built from the copy.

Then, within two minutes of the start, it checks that `--check-config` in a one-off collector
container exits 0, that both health checks pass, that `state.json` keeps the contract, that the
enabled sources are host, wan, dns, backup, updates and ssh and every one is read (`ok: true`),
that wan and dns are read as down (`facts.wan.up` and `facts.dns.up` false, as nothing outside
answers) with `wan_down` raised, and that the page and `data/state.json` load from the server.
`.env.example` leaves the usage counts off, so the checks hold that `state.json` says the counts
are off, that the collector logged once that they are off, and that it made no attempt to send.
Its lines on the usage counts are printed. An
internal network publishes no port, so the page is fetched from the host at the server's address
on that network; the resolved 127.0.0.1 binding is printed but not bound. It exits 0 when every
check passes and 1 otherwise, with the containers' last log lines. The containers, the network,
the image and the scratch folder are removed however it ends, and it prints `docker ps -a`,
`docker network ls` and `docker images` filtered to the run's names, each empty, and the running
deployment's containers with their start times before and after. A run takes about 40 seconds
once the base image is pulled.

## The logo and the icons

`web/logo.svg` is the logo, with `logo-dark.svg` for dark surfaces and `logo-mono.svg` in one
colour. `web/favicon.svg` is the favicon, and changes its outline with the browser's light or dark
theme. The raster icons (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are
never edited by hand: they are made from the drawings in `tools/icons/` by

```bash
CHROME=/path/to/chrome-headless-shell tools/icons.sh
```

and a second run gives the same bytes.

The name, the logo and the icons are not under the code's or the art's licence:
[NAME-AND-LOGO.md](../legal/NAME-AND-LOGO.md) says how they may be used.

## Signing the packs

The project signs its own packs so that nothing can pass as one of them: a pack that carries a
good `kw1` signature is one the project released, unchanged. The signature is not a licence
check. The art in the packs is under CC BY-SA 4.0 ([ART-LICENCE.md](../legal/ART-LICENCE.md)) and
may be changed and shared; a changed pack simply no longer carries the project's signature.

A deployed page draws only packs signed with a key in `KEYS` in `web/js/pack.js`; the project's
key is `kw1`. Its private half is held outside the repository by a private release process, and is
never written to a file beside a checkout. A release that changes a shipped pack signs it in that
process:

1. The commit to sign is pushed to `main`, with its pack files unsigned or carrying an old `sig`.
2. The release process takes `web/js/pack.js`, `web/js/effects.js` (which `pack.js` needs to read a
   pack that names an effect), `web/js/ed25519.js`, `tools/sign-pack.js`, `tools/pack-carrier.js`
   and `web/packs/` from that commit, runs
   `node tools/sign-pack.js web/packs/*.pack.json` with the key in `PACK_KEY_KW1`, and hands back
   the signed pack files and the commit they were signed at.
3. Only the `sig` of each file is copied into a checkout whose `HEAD` descends from that commit,
   after checking that each pack is unchanged since it; the carriers are written again with
   `node tools/pack-carrier.js`.
4. The checks below are run, and the signed files and their carriers are committed and pushed.

The signature is public, so carrying it back into the repository is safe. A pack changed between
steps 1 and 3 is refused there and needs another run. [packs.md](./packs.md#signing-a-pack)
describes the tool, and how a fork signs with a key of its own.

Whether the base pack ships signed today, and what a deployed page draws in each case, is in
[library.md](./library.md#where-the-knight-is-drawn-from). The base pack, `kw.base`, was signed at
version 1.2.0 on 13 November 2026, at 1.3.0 on 14 November and at 1.4.0, which adds the free
items, on 15 November. Version 1.5.0, which adds the crossbow and moves the pack to format
`[1, 2]`, was signed on 18 November. The medieval world's pack, `kw.medieval`, was
first signed on 15 November 2026 at version 0.1.0, which held the cellar alone, and again the same
day at version 0.2.0, which adds the camp, the battlement, the yard, the smithy and the house.
Version 0.3.0, which adds the devices, was signed the same way on 16 November, and version 0.4.0,
which adds the cast, the same day, as was version 0.5.0, which adds the words and the overlay.
Version 0.6.0, which lights the pie through its lattice in place of the raspberry and draws the
other devices as an owl, a cauldron, a flask and a chest, was signed the same day. Version 0.7.0,
which adds the mouser cat and the redesigned scenes and devices, was signed on 17 November. Version 1.5.1 of
the base pack and version 0.7.1 of the medieval world's pack change only the licence line, to the
[art licence](../legal/ART-LICENCE.md), and were both signed on 23 November. Version 0.8.0 of the
medieval world's pack, which moves it to format `[1, 3]` and gives the smithy its three acts, the
hammer, the bellows and the quench, was signed on 24 November; the base pack is unchanged. Version
1.6.0 of the base pack, which redraws the hair and adds the buzzcut, and version 0.9.0 of the
medieval world's pack, which redraws the goblin, both with the licence line naming CC BY-SA 4.0,
were signed on 25 November. Version 0.10.0 of the medieval world's pack, which moves it to format
`[1, 4]` for the knight's patrol, the television in every scene and the devices' resting places,
was signed on 25 November as well; the base pack is unchanged. A signed version is drawn from by a deployed
page and a `dev` page alike, every scene, every device and the cast it gives, with its words and its
overlay; a version changed after signing ships unsigned until its next run, and meanwhile a deployed
page draws every scene from code and shows the collector's own words ([world-loading.md](./world-loading.md#where-the-scenes-are-drawn-from)). The page's tests hold in either state, so carrying a signature
across changes no test.

## Releases and images

A release is a tag `vX.Y.Z` on `main`, made once the packs it ships are signed
([Signing the packs](#signing-the-packs)) and the checks pass. `version` in `pyproject.toml` says
the release, and the tag must match it: `v0.1.0` releases `0.1.0`. Pushing the tag runs
`.github/workflows/image.yml`, which builds the Dockerfile for `linux/amd64` and `linux/arm64`
(arm64 under QEMU) and pushes one image for both to `ghcr.io/knightwatcher-io/knightwatcher`,
tagged `X.Y.Z`, `X.Y` and `latest` (a pre-release such as `v0.2.0-rc.1` gets its own tag
alone), with the OCI labels: the source repository, the licence `AGPL-3.0-or-later` and a
description. It refuses a tag that does not match `pyproject.toml`. A manual run (Run workflow,
with the tag chosen under "Use workflow from") builds that tag again; run on a branch, it stops.

Once the image is pushed, a second job in the same run makes the tag's GitHub Release, unless the
tag has one already: a few lines naming the image, `ghcr.io/knightwatcher-io/knightwatcher:X.Y.Z`,
and its digest, then the notes GitHub writes from the pull requests and commits since the last
release. A pre-release tag makes a pre-release. The two jobs hold different rights: the one that
builds, `Build and push`, has `packages: write` to push the image and reads the repository alone,
and `Create the GitHub Release` has `contents: write` for the release and nothing more. It takes
the image's digest from the first job and checks nothing out, since `gh` makes the release from
the tag on GitHub.

```bash
git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
gh run watch "$(gh run list --workflow image.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
docker buildx imagetools inspect ghcr.io/knightwatcher-io/knightwatcher:0.1.0   # both platforms
gh release view v0.1.0                                                            # the release
```

The package's visibility is set once, after the first push, in the package's settings on GitHub
(the organisation's Packages, `knightwatcher`, Package settings, Change visibility): a new package
on ghcr.io starts private, and a host pulls a private one only after `docker login ghcr.io`.

The page in the image is stamped at build time by `server/stamp.py`, from the files alone, so the
build needs no `.git` (which `.dockerignore` leaves out of the build context in any case): the
Status page shows the 12-character hash of `web/` that `tools/deploy.sh` would give the same files,
and the collector's usage counts send the same hash as the version. The release's number is in
the image's `org.opencontainers.image.version` label and its tags.

`compose.yaml` runs `ghcr.io/knightwatcher-io/knightwatcher:${KW_VERSION:-latest}` and keeps
`build: .`, so `docker compose build` builds a checkout under the same name. On a Raspberry Pi with a
64-bit OS, or any other arm64 host, `docker compose pull` takes the arm64 image by itself (there
is no 32-bit arm image); to try one release
before the quick start's `docker compose up -d`, set `KW_VERSION` in `.env` and check:

```bash
docker compose pull
docker image inspect --format '{{.Architecture}}' ghcr.io/knightwatcher-io/knightwatcher:0.1.0   # arm64
docker compose up -d
```

## Deploying

How to deploy the image, or the page alone to a web server of your own, and why the page goes
before the collector, is in [display.md](./display.md#deploying).

`compose.yaml` takes its relative paths (`./config.toml`, `./var`, and `./providers` for the
provider files) from the project directory: the folder `docker compose` runs in, or the one given
with `--project-directory`. A deployment that builds from a clean export but runs compose against
another checkout must bring that checkout up to the same commit first, so that it has
`providers/` with its `.gitkeep`; otherwise the providers mount has no source and neither container
is created. Setting `KW_PROVIDERS` in `.env` to a folder that exists does as well.
