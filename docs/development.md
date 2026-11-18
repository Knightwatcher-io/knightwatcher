# Development

Read this page before changing anything, and [security.md](./security.md) before committing.
The design is in [design.md](./design.md), and the contract between the collector and the page
is in [state.md](./state.md). Read [page.md](./page.md) before touching `web/`, and
[rig.md](./rig.md) before touching `web/js/knight.js`; [collector.md](./collector.md) before
touching `collector/`, [server.md](./server.md) before touching `server/`;
[packs.md](./packs.md) and [library.md](./library.md) before touching `web/js/pack.js` or a pack
file; and [world-loading.md](./world-loading.md), [scenes.md](./scenes.md) and
[cast.md](./cast.md) before touching `web/js/world.js`, the medieval world's pack or a scene it
holds. What the tests check is in [tests.md](./tests.md), and the screenshots in
[shots.md](./shots.md).

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/, packs/)
  admin/             the admin page, served by the bundled server alone
  js/scenes/         one file per scene
  packs/             the packs that ship with the page, each a .pack.json and its .pack.js carrier
collector/           the collector: Python, standard library only (overlay.py reads the admin
                     page's admin.json and lays it over config.toml, reload.py takes up a change
                     between polls)
  sources/           one module per source
  settings-schema.json  every setting of config.toml and every variable of .env
server/              the bundled server: Python, standard library only, reusing the collector's
                     checks (app.py the HTTP side, store.py the shared settings, admin.py the
                     admin page's password, sessions, store, checks and export, stamp.py the
                     page's version stamp at build time)
tests/
  collector/         unittest tests for the collector
  server/            unittest tests for the server and the stamp
  web/               node tests for the page's scripts
    fixtures/knight/ the stored call record of the knight's drawing
    fixtures/scenes/ the stored call records of the scenes, and of the props the engine draws over
                     them
    fixtures/worlds/ the test world, test.orbit.pack.json, its format 1.2 copy with weapons that
                     fire, test.orbit-fire.pack.json, and orbit.js, which writes both (never
                     signed, never under web/; see The test world below)
    fixtures/        a fixture pack for the pack library's tests, the base pack's sword and
                     shield as approved (base-onehand.items.json), its free options as
                     approved (base-options.json), its three builds and the items fitted to
                     them as approved (base-builds.json), its free items of 1.4.0 as approved
                     (base-free-items.json), a world pack of format 1.1 for the library's tests
                     (world-1.1.json), the base pack's read, first stored from the library
                     before format 1.1 (base-read.json), and a state file with the settings'
                     defaults (state-defaults.json)
  tools/             node tests for tools/deploy.sh, tools/pack-carrier.js, tools/sign-pack.js,
                     tools/settings-schema.js, tools/cat-stamps.js and tools/check-private.sh
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
  shots.sh           regression screenshots of the page
  capped.sh          runs a command within a ceiling on CPU and memory, for the checks
  check-private.sh   the check that no private detail is tracked
  private-patterns.example.txt  the template of the patterns check-private.sh reads
docs/                this documentation
compose.yaml  Dockerfile  config.example.toml  .env.example  pyproject.toml
```

## Rules

- **The contract comes first.** A change to what the collector writes or the page reads changes
  [state.md](./state.md) in the same commit.
- **The page has no build step and no dependencies.** It must open from disk in a browser.
- **The collector and the server use the standard library alone.** A dependency needs a reason
  written here.
- **A pack file and its carrier change together.** After editing a file in `web/packs/`, run
  `node tools/pack-carrier.js` and commit both; a test fails while they differ. See
  [library.md](./library.md#carriers).
- **A change to the medieval art is made in both copies, in the same commit.** A scene the medieval
  world's pack holds (today every scene) is drawn from the pack and, as the fallback, from its code in
  `web/js/scenes/`. Change both, write the carrier, and `node --test tests/web/` holds the two to the
  same call records. See [world-loading.md](./world-loading.md#two-copies-held-equal). The mouser cat is written
  into the pack by a tool: after a change to `web/js/cat.js`, run `node tools/cat-stamps.js` and
  then `node tools/pack-carrier.js`, and `node --test tests/tools/` fails while the pack and the
  code differ.
- **A setting starts in the schema.** Every setting of `config.toml` and every variable of `.env`
  is described in `collector/settings-schema.json`. A new or changed one is written there first,
  then in `config.example.toml` or `.env.example`; then run `node tools/settings-schema.js`, which
  writes the page's copy in `web/js/settings.js` and the reference in
  [configuration.md](./configuration.md#every-setting). Tests fail while any of them disagree.
- **A signed pack is signed again after any change.** Editing a pack that carries a `sig` breaks
  its signature, and `node --test tests/tools/` fails until it is signed again or unsigned with
  `node tools/sign-pack.js --unsign`. See [Signing the packs](#signing-the-packs).
- **No key in the repository.** No private key of any kind is committed, test keys included; the
  tests generate theirs in memory for each run.
- **Invented data everywhere.** See [security.md](./security.md). Run `tools/check-private.sh`
  before every push.
- **Docs describe what is built.** The last step of every change is the docs: check each doc
  that describes what you changed against what you built, and correct whatever no longer
  matches, in the same commit. A change whose docs are stale is not finished.
- **Prose is plain.** British English, no emojis, no em dashes, no filler.
- **Commits follow Conventional Commits.**

## Checks

The checks and the screenshots are run inside a ceiling on CPU and memory, `tools/capped.sh`, so
that they never crowd out the services on the machine they run on. The page's tests alone would
otherwise take a core for each test file at once, and the scene records' file grows to about 1 GB.
Under a systemd user session the wrapper runs its command in a transient scope with `CPUQuota=400%`
(four cores) and `MemoryMax=4G`, at `nice` 10; without systemd it lowers the priority alone.
`KW_CPU` and `KW_MEM` change the ceiling, for example `KW_CPU=200% tools/capped.sh ...`.
`tools/shots.sh` puts itself inside the same ceiling, and `node --test` is given
`--test-concurrency=2`, so at most two test files run at once. The wrapper exports `KW_CAPPED` in
the scope it makes, and a script that caps itself, as `tools/shots.sh` does, sees it and does not
cap itself again; `tools/capped.sh` called inside a scope runs its command at `nice` 10 without a
second scope. The command's exit code is the wrapper's.

The collector and the server:

```bash
tools/capped.sh python3 -m unittest discover -s tests/collector -v
tools/capped.sh python3 -m unittest discover -s tests/server -v
uvx ruff check collector server tests && uvx ruff format --check collector server tests
docker build -t knightwatcher:dev .
docker compose config -q
python3 -m collector --check-config --config config.toml --env-file .env
```

The collector's TLS test needs `openssl` on the path, to make a self-signed certificate that is
thrown away after the run; without it that test is skipped and says why.

The last two need a `.env` and a `config.toml` in place; see
[configuration.md](./configuration.md). `tests/collector/test_schema.py` checks the settings schema
against the collector, `config.example.toml`, `.env.example` and `compose.yaml`, each service's
mounts included, and that the server is given no variable but its address and port.
`tests/collector/test_reload.py` checks admin.json laid over `config.toml`, the start and reload
rules, the credentials' names and the acknowledgement in the state file. `tests/server/` runs the
server on the loopback, the admin page's side with a password made for the run; its stamp test
needs bash and rsync, for `tools/deploy.sh`, and is skipped without them. [server.md](./server.md#checks) lists what they
check.

The page:

```bash
for f in $(find web/js web/packs web/admin -name '*.js'); do node --check "$f" || exit 1; done
tools/capped.sh node --test --test-concurrency=2 tests/web/
tools/capped.sh node --test --test-concurrency=2 tests/tools/
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
# the settings screen and the wall with the test world loaded, from a copy of web/ the script makes
# and removes
CHROME=/path/to/chrome-headless-shell tools/shots.sh worlds /tmp/kw-worlds-new
tools/shots.sh compare-worlds /tmp/kw-worlds-ref /tmp/kw-worlds-new
```

[tests.md](./tests.md) says what each test file checks, and [shots.md](./shots.md) what the
screenshots show and what to expect against an older reference.

Three files are written by a tool, and each tool has a `--check` mode that writes nothing and exits
1 when the file in the tree is not what it would write:

```bash
node tools/settings-schema.js --check        # web/js/settings.js's copy and configuration.md's reference
node tools/cat-stamps.js --check             # the cat's stamps and pet.cat in the medieval world's pack
node tests/web/fixtures/worlds/orbit.js --check   # the test world and its 1.2 copy
```

`tools/settings-schema.js --check` names each stale file, and exits 2 on an error or an argument it
does not take. The carriers and the signatures have no such mode: `node --test tests/tools/` fails
while a carrier differs from its pack or a signed pack no longer verifies.

`tools/check-private.sh` checks that no tracked file holds a private detail of the operator's. It
reads `tools/private-patterns.txt`, which git ignores, one extended regular expression per line,
matched without regard to case; copy `tools/private-patterns.example.txt` and fill it in. It runs
`git grep` over every tracked file but the example, prints each line that matches and exits 1 when
any does. It exits 2 when the pattern file is missing or empty, and when `git grep` itself fails,
as it does on a pattern it cannot read, saying so on stderr, so a check that did not run never
passes as clean ([security.md](./security.md#what-never-enters-the-repository)).

## The logo and the icons

`web/logo.svg` is the logo, with `logo-dark.svg` for dark surfaces and `logo-mono.svg` in one
colour. `web/favicon.svg` is the favicon, and changes its outline with the browser's light or dark
theme. The raster icons (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are
never edited by hand: they are made from the drawings in `tools/icons/` by

```bash
CHROME=/path/to/chrome-headless-shell tools/icons.sh
```

and a second run gives the same bytes.

## Signing the packs

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
[library.md](./library.md#where-the-knight-is-drawn-from). The medieval world's pack, `kw.medieval`, was
first signed on 15 November 2026 at version 0.1.0, which held the cellar alone, and again the same
day at version 0.2.0, which adds the camp, the battlement, the yard, the smithy and the house.
Version 0.3.0, which adds the devices, was signed the same way on 16 November, and version 0.4.0,
which adds the cast, the same day, as was version 0.5.0, which adds the words and the overlay.
Version 0.6.0, which lights the pie through its lattice in place of the raspberry and draws the
other devices as an owl, a cauldron, a flask and a chest, was signed the same day. Version 0.7.0,
which adds the mouser cat and the redesigned scenes and devices, was signed on 17 November. A signed version is drawn from by a deployed
page and a `dev` page alike, every scene, every device and the cast it gives, with its words and its
overlay; a version changed after signing ships unsigned until its next run, and meanwhile a deployed
page draws every scene from code and shows the collector's own words ([world-loading.md](./world-loading.md#where-the-scenes-are-drawn-from)). The page's tests hold in either state, so carrying a signature
across changes no test.

## Deploying

How to deploy the image, or the page alone to a web server of your own, and why the page goes
before the collector, is in [display.md](./display.md#deploying).
