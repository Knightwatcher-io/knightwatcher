# Development

## Layout

```
web/        the page: static files, no build step
collector/  the collector: Python, standard library only
tools/      scripts for checks and for making art
art/        adopted art and its sources
docs/       this documentation
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
[configuration.md](./configuration.md). The commands for the page are added by the change that
restructures it.
