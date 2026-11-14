# Development

Read this page before changing anything, and [security.md](./security.md) before committing.
The design is in [design.md](./design.md), and the contract between the collector and the page
is in [state.md](./state.md). Read [page.md](./page.md) before touching `web/`,
[collector.md](./collector.md) before touching `collector/`, and [packs.md](./packs.md) before
touching `web/js/pack.js` or a pack file.

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/, packs/)
  js/scenes/         one file per scene
  packs/             the packs that ship with the page, each a .pack.json and its .pack.js carrier
collector/           the collector: Python, standard library only
  sources/           one module per source
  settings-schema.json  every setting of config.toml and every variable of .env
tests/
  collector/         unittest tests for the collector
  web/               node tests for the page's scripts
    fixtures/knight/ the stored call record of the knight's drawing
    fixtures/        a fixture pack for the pack library's tests, the base pack's sword and
                     shield as approved (base-onehand.items.json), its free options as
                     approved (base-options.json), its three builds and the items fitted to
                     them as approved (base-builds.json), and a state file with the settings'
                     defaults (state-defaults.json)
  tools/             node tests for tools/deploy.sh, tools/pack-carrier.js, tools/sign-pack.js and
                     tools/settings-schema.js
tools/
  deploy.sh          copies web/ to a served folder and stamps the copy with a version
  pack-carrier.js    writes the carrier of each pack in web/packs/
  sign-pack.js       signs pack files, or takes their signatures off, and writes their carriers
  settings-schema.js writes the page's copy of the settings schema and the reference in
                     docs/configuration.md
  icons.sh           regenerates the favicon and the app icons from the drawings in icons/
  shots.sh           regression screenshots of the page
  check-private.sh   the check that no private detail is tracked
docs/                this documentation
compose.yaml  Dockerfile  config.example.toml  .env.example  pyproject.toml
```

## Rules

- **The contract comes first.** A change to what the collector writes or the page reads changes
  [state.md](./state.md) in the same commit.
- **The page has no build step and no dependencies.** It must open from disk in a browser.
- **The collector uses the standard library alone.** A dependency needs a reason written here.
- **A pack file and its carrier change together.** After editing a file in `web/packs/`, run
  `node tools/pack-carrier.js` and commit both; a test fails while they differ. See
  [packs.md](./packs.md#carriers).
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

The collector:

```bash
python3 -m unittest discover -s tests/collector -v
uvx ruff check collector tests && uvx ruff format --check collector tests
docker build -t knightwatcher-collector:dev .
docker compose config -q
python3 -m collector --check-config --config config.toml --env-file .env
```

The collector's TLS test needs `openssl` on the path, to make a self-signed certificate that is
thrown away after the run; without it that test is skipped and says why.

The last two need a `.env` and a `config.toml` in place; see
[configuration.md](./configuration.md). `tests/collector/test_schema.py` checks the settings schema
against the collector, `config.example.toml`, `.env.example` and `compose.yaml`.

The page:

```bash
for f in $(find web/js web/packs -name '*.js'); do node --check "$f" || exit 1; done
node --test tests/web/
node --test tests/tools/
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

The screenshots compare the page with itself before and after a change that should not alter how
it looks. With time frozen each shot depends only on its address, however many frames a busy
machine paints. Take one set at a time all the same: two browsers shooting at once have not been
tried. The nine `arm-` shots draw the sword and shield through the address's `arm=one`; a
reference taken from a tree older than that hook draws the greatsword there, so against it only
those differ. The eleven settings shots near the end of the set (the screen on each page, the
hold's cue, the 12-hour clock, a monarch's skin) have nothing to compare with in a reference from
before the settings, and the comparison reports them missing. The eleven after them (the monarch's
hair and robe, the Scenes page, a condition in a chosen scene) are missing likewise from a reference
from before those, against which the eight settings shots that show the side rail differ in it,
where the Scenes entry was added, and the two of the monarch's page also in its new rows. The 56
`bd-` shots that end the set draw the builds Broad (`bd-b-`) and Slim (`bd-c-`): every scene with
the knight standing, the attack, tight memory, the cellar's crate, the smithy's hammering, in bed,
the sick and hot tints, the sword and shield, the swat both ways with each weapon at three points
of the swing, the goblin at the hit with each weapon, and the settings screen's knight page, the
build chosen by the address's `bd=` hook ([page.md](./page.md#checks)). Against a reference from
before them they are missing. A headless browser has no saved choices, so every shot shows what its address asks for.
[page.md](./page.md) has the rest.

`node --test tests/web/` includes a faster check for the knight: it draws the knight in 94 poses,
the bare head in bed, the speech bubble, the gear at rest, and the house and the smithy, which show that gear, against a fake canvas, once
from code and once from the base pack, and compares every call with a
stored record, in about a second. The record is stored again only when the knight or those scenes are meant to change;
[page.md](./page.md#checks) says how. The same file draws every frame of the swings, the attack
and the goblin strike with the greatsword and with the sword and shield, and fails if an arm is
drawn over a blade or a shield ([page.md](./page.md#the-knights-rig)). For the three builds it draws
Classic, chosen by name, against the stored record; Broad and Slim with each weapon in every pose
and swing frame without a throw and within the look's cost; the hands on the grip on every build
through both swings, the attack and the goblin strike; and the arm check on Broad and Slim.
`tests/web/foe.test.js` checks the goblin's plan and hit on every build with each weapon, and that
the blade the engine measures is the one drawn. `node --test tests/tools/` also checks that every pack
carrier matches its pack file, that the copy of the settings schema in `web/js/settings.js` and the
reference in `docs/configuration.md` are what `tools/settings-schema.js` writes, tests the signing tool with keys generated for the run, and checks
that every pack in `web/packs/` that carries a `sig` verifies against the key table in `pack.js`.
`tests/web/loading.test.js` checks the downloaded packs, the refusals and the knight drawn from code
when no base pack can be used; its signed packs use keys generated for the run. `tests/web/places.test.js`
draws whatever may stand in every scene's places and checks that it stays on the 960 by 600 grid
and that no two places draw over each other. `tests/web/settings-schema.test.js` checks the page's lists of
settings, scenes and conditions against the settings schema. `tests/web/settings.test.js` checks the settings in
`web/js/settings.js` (the order of their levels, unknown values, the browser's storage refusing,
the reset, the 12-hour clock, the monarch's hair and robe with "As drawn", the scene chosen per
condition and which scenes can act which condition, the build row's names from the base pack), the
engine's quiet rotation and its choice of scene, the monarch's skin, hair and robe, and the knight
drawn from the base pack in 216 looks of the settings', each build meeting every weapon, skin, hair
colour and hair style, and every monarch in every skin, hair and robe.

The repository's own page draws the knight from the base pack, so the screenshots of the
repository's page check the pack path, and the knight test checks both paths. A deployed copy
draws from the base pack while it ships signed, and from code otherwise; to shoot the code path as
well, take a second pair of sets from a copy of `web/` whose `kw-version` is not `dev` and whose
base pack carries no signature; [page.md](./page.md#checks) shows how.

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
2. The release process takes `web/js/pack.js`, `web/js/ed25519.js`, `tools/sign-pack.js`,
   `tools/pack-carrier.js` and `web/packs/` from that commit, runs
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
[packs.md](./packs.md#where-the-knight-is-drawn-from). The page's tests hold in either state, so carrying a signature
across changes no test.

## Deploying the page

```bash
tools/deploy.sh /path/to/served/folder
```

This copies `web/` into the folder the web server serves, leaves that folder's `data/` alone,
deletes files `web/` no longer has, and stamps the copy with a version so that open displays
reload themselves onto it within about five minutes. It needs bash, rsync and coreutils, and
changes nothing under `web/`. Run it against a folder outside the repository; it refuses `web/`,
a folder inside it and any folder that holds it. [page.md](./page.md#deploying) has the details.

**The page goes first.** When a change touches both the page and the collector, deploy the page
before the collector. A new page reads files from an old collector and from a new one, while an
old page skips what it does not know: a page from before watched things ignores `facts.things` and
`thing_down`, so behind a new collector it would show nothing when a watched machine goes down.
