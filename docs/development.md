# Development

Read this page before changing anything, and [security.md](./security.md) before committing.
The design is in [design.md](./design.md), and the contract between the collector and the page
is in [state.md](./state.md). Read [page.md](./page.md) before touching `web/` and
[collector.md](./collector.md) before touching `collector/`.

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/)
  js/scenes/         one file per scene
collector/           the collector: Python, standard library only
  sources/           one module per source
tests/
  collector/         unittest tests for the collector
  web/               node tests for web/js/state.js
  tools/             node tests for tools/deploy.sh
tools/
  deploy.sh          copies web/ to a served folder and stamps the copy with a version
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

The last two need a `.env`, a `config.toml` and a `secrets.json` in place; see
[configuration.md](./configuration.md).

The page:

```bash
for f in $(find web/js -name '*.js'); do node --check "$f" || exit 1; done
node --test tests/web/
node --test tests/tools/
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

The screenshots compare the page with itself before and after a change that should not alter how
it looks. Take one set at a time: two headless browsers running at once drop frames, and an
event's shot then differs for no reason. [page.md](./page.md) has the rest.

## Deploying the page

```bash
tools/deploy.sh /path/to/served/folder
```

This copies `web/` into the folder the web server serves, leaves that folder's `data/` alone,
deletes files `web/` no longer has, and stamps the copy with a version so that open displays
reload themselves onto it within about five minutes. It needs bash, rsync and coreutils, and
changes nothing under `web/`. Run it against a folder outside the repository; it refuses `web/`,
a folder inside it and any folder that holds it. [page.md](./page.md#deploying) has the details.
