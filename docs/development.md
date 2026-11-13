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
tests/
  collector/         unittest tests for the collector
  web/               node tests for the page's scripts
    fixtures/knight/ the stored call record of the knight's drawing
    fixtures/        a fixture pack for the pack library's tests
  tools/             node tests for tools/deploy.sh and tools/pack-carrier.js
tools/
  deploy.sh          copies web/ to a served folder and stamps the copy with a version
  pack-carrier.js    writes the carrier of each pack in web/packs/
  icons.sh           regenerates the favicon and the app icons from the drawings in icons/
  shots.sh           regression screenshots of the page
  check-private.sh   the check that no private detail is tracked
docs/                this documentation
compose.yaml  Dockerfile  config.example.toml  secrets.example.json  pyproject.toml
```

## Rules

- **The contract comes first.** A change to what the collector writes or the page reads changes
  [state.md](./state.md) in the same commit.
- **The page has no build step and no dependencies.** It must open from disk in a browser.
- **The collector uses the standard library alone.** A dependency needs a reason written here.
- **A pack file and its carrier change together.** After editing a file in `web/packs/`, run
  `node tools/pack-carrier.js` and commit both; a test fails while they differ. See
  [packs.md](./packs.md#carriers).
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
python3 -m collector --config config.toml --secrets secrets.json --check-config
```

The collector's TLS test needs `openssl` on the path, to make a self-signed certificate that is
thrown away after the run; without it that test is skipped and says why.

The last two need a `.env`, a `config.toml` and a `secrets.json` in place; see
[configuration.md](./configuration.md).

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
tried. [page.md](./page.md) has the rest.

`node --test tests/web/` includes a faster check for the knight: it draws the knight in 98 poses
against a fake canvas, once from code and once from the base pack, and compares every call with a
stored record, in about a second. The record is stored again only when the knight is meant to
change; [page.md](./page.md#checks) says how. `node --test tests/tools/` also checks that every
pack carrier matches its pack file.

The repository's own page draws the knight from the base pack and a deployed copy draws it from
code, so the screenshots of the repository's page check the pack path, and the knight test checks
both.

## The logo and the icons

`web/logo.svg` is the logo, with `logo-dark.svg` for dark surfaces and `logo-mono.svg` in one
colour. `web/favicon.svg` is the favicon, and changes its outline with the browser's light or dark
theme. The raster icons (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are
never edited by hand: they are made from the drawings in `tools/icons/` by

```bash
CHROME=/path/to/chrome-headless-shell tools/icons.sh
```

and a second run gives the same bytes.

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
