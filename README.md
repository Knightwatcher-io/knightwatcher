# Knightwatch

A wall display for a homelab. A pixel-art knight fills a tablet's screen and mirrors the state of
the machines he watches: he sweats when the CPU is pinned, takes to his bed when a container is
unhealthy, and swats a fly for every advert the DNS filter blocks. A headline says why, beside a
wall clock.

Two parts share one file. A small collector reads the homelab and writes `state.json`. A static
page reads that file and draws the knight.

## Try the page

Open `web/index.html` in a browser. With no `state.json` beside it, the page runs on invented data
and shows a bar of controls for every scene and state.

## Documentation

- [Design](docs/design.md): what the display is for and how the two parts divide the work
- [The state file](docs/state.md): the contract between collector and page
- [Security](docs/security.md): what never enters this repository, and the collector's privileges
- [Development](docs/development.md): layout, checks, and the rules for changes
