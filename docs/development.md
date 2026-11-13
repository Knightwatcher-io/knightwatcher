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

The commands for each part are added here by the change that adds the part.
