<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/logo-dark.svg">
  <img src="web/logo.svg" alt="Knightwatcher: a pixel-art knight's helmet with a red plume and a calm face" width="160">
</picture>

# Knightwatcher

A wall display for a homelab. A pixel-art knight fills a tablet's screen and mirrors the state of
the machines being watched: the knight sweats when the CPU is pinned, takes to bed when a
container is unhealthy, and swats the flies that blocked adverts turn into. A headline says why,
beside a wall clock.

The scene is a night in the knight's world. When all is quiet the knight stands on the
battlement, by the camp fire, in the house or in the training yard, and strolls to another spot
every 12 to 22 seconds. A fault changes the scene to one that suits it: the cellar for a full
disk, the smithy during an update, the royal court while someone has a shell open. The text
colour carries the status, green when quiet, amber for a warning, red when critical and blue
while something is at work.

Other machines on the network, such as a NAS, a camera or a virtual machine, can be listed as
watched things. Each stands in the scene as the device it is, cameras mounted high and the rest on
the ground, with a lamp that fades green while it is up and blinks red when it goes down;
[Watched things](docs/configuration.md#watched-things) says how to list them.

## Try the page

Open `web/index.html` in a browser. With no `state.json` beside it, the page runs on invented data
and shows a bar of controls for every scene and state.

Press and hold anywhere on the display for two seconds to open the settings: the knight's build
(Classic, Broad or Slim), weapon, skin, hair, tabard and plume, the monarch and the monarch's skin, hair and robe, the headline size,
a 12-hour clock, the helmet indoors, which quiet scenes take turns, and the scene some conditions
play in (running hot at the camp rather than the training yard, say). Each display keeps its own
choices in its browser. The defaults
every display starts from are set in `config.toml`; see
[Configuration](docs/configuration.md#the-settings-screens-defaults).

## How the two parts fit

A small collector, run as a container, reads the homelab and writes `state.json`. A static page
under `web/` fetches that file and draws the knight. The collector knows nothing of knights and the
page knows nothing of Docker or DNS. To run both, serve `web/` with any web server and have the
collector write its file to `web/data/`, behind whatever authentication you use.

## Documentation

- [Design](docs/design.md): what the display is for and how the two parts divide the work
- [The state file](docs/state.md): the contract between collector and page
- [The page](docs/page.md): the files, the one grid, the scene interface, the modes and the address
- [The collector](docs/collector.md): one poll, conditions, events, sources and how to add one
- [Configuration](docs/configuration.md): how settings work, `config.toml`, `.env`, and a reference of every setting
- [Security](docs/security.md): what never enters this repository, and the collector's privileges
- [Packs](docs/packs.md): the format of a pack, its checks and signing, and the library that reads it
- [A monitor on the host](docs/monitor.md): showing the display on a screen wired to a headless host
- [Development](docs/development.md): layout, checks, and the rules for changes
