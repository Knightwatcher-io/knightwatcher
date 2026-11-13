# Development

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/)
  js/scenes/         one file per scene
collector/           the collector: Python, standard library only
  sources/           one module per source
tests/
  collector/         unittest tests for the collector
  web/               node tests for web/js/state.js
tools/
  artgen/            the art generation tools, described in art.md
  shots.sh           regression screenshots of the page
  check-private.sh   the check that no private detail is tracked
art/                 the art tools' output and call ledger; ignored by git
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
- **Docs describe what is built.** Change the doc in the same commit as the change it describes.
- **Prose is plain.** British English, no emojis, no em dashes, no filler.
- **Commits follow Conventional Commits** and credit no tool.

## Checks

The collector:

```bash
python3 -m unittest discover -s tests/collector -v
uvx ruff check collector tests && uvx ruff format --check collector tests
docker build -t knightwatch-collector:dev .
docker compose config -q
python3 -m collector --config config.toml --secrets secrets.json --check-config
```

The last two need a `.env`, a `config.toml` and a `secrets.json` in place; see
[configuration.md](./configuration.md).

The art tools:

```bash
uvx ruff check tools/artgen && uvx ruff format --check tools/artgen
```

`pyproject.toml` leaves `tools` out of a bare `ruff` run, and an explicit path lints it anyway.
[art.md](./art.md) describes the tools.

The page:

```bash
for f in $(find web/js -name '*.js'); do node --check "$f" || exit 1; done
node --test tests/web/
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

The screenshots compare the page with itself before and after a change that should not alter how
it looks. Take one set at a time: two headless browsers running at once drop frames, and an
event's shot then differs for no reason. [page.md](./page.md) has the rest.
