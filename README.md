<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/logo-dark.svg">
  <img src="web/logo.svg" alt="Knightwatcher: a pixel-art knight's helmet with a red plume and a calm face" width="160">
</picture>

# Knightwatcher

A wall display for a homelab. A pixel-art knight fills a tablet's screen and mirrors the state of
the machines being watched: the knight sweats when the CPU is pinned, takes to bed when a
container is unhealthy, and swats the flies that blocked adverts turn into. A mouser cat lives in
every scene and catches the flies the knight cannot: indoors, and outdoors while the knight is
busy. A headline says why, beside a wall clock.

The scene is a night in the knight's world. When all is quiet the knight stands on the
battlement, by the camp fire, in the house or in the training yard, and strolls to another spot
every 12 to 22 seconds. A fault changes the scene to one that suits it: the cellar for a full
disk, the smithy during an update, the royal court while someone has a shell open. The text
colour carries the status, green when quiet, amber for a warning, red when critical and blue
while something is at work.

Other machines on the network, such as a NAS, a camera or a virtual machine, can be listed as
devices. Each stands in the scene as the device it is, cameras mounted high and the rest on
the ground, with a lamp that fades green while it is up and blinks red when it goes down;
[Devices](docs/configuration.md#devices) says how to list them.

## Quick start

On a machine with Docker and its compose plugin, from a checkout of this repository:

```bash
cp config.example.toml config.toml
cp .env.example .env && chmod 600 .env
mkdir -p var/out var/server
setfacl -m u:10001:rwx var var/out var/server
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var var/out var/server
```

The containers run as uid 10001, and the last two lines let it write in those three folders
([configuration.md](docs/configuration.md#the-accounts)). Then, in `.env`, point
`KNIGHTWATCHER_BACKUP_LOG` at your backup log and `KNIGHTWATCHER_DATA_DISK` at any folder on the
disk to watch. Both must exist. With no backup log yet, `touch var/backup.log` and point at that,
and set `enabled = false` under `[sources.backup]` in `config.toml`. Then:

```bash
docker compose up -d
```

and open `http://<this machine>:8080/` in a browser. The knight appears at once and the collector's
first readings within a minute. The example config names services at invented addresses, so
those sources say they cannot be reached until you point them at your own, or turn them off,
in `config.toml` ([Configuration](docs/configuration.md)); the credentials go in `.env`.

The page is open to anyone on your network, with no login. Read [The server](docs/server.md#security)
before you let it be reached from anywhere else, and never publish it to the internet without a
login in front.

To change the sources, thresholds and devices from a browser rather than in `config.toml`,
give `KNIGHTWATCHER_ADMIN_PASSWORD` in `.env` a password of your own of at least 12 characters, run
`docker compose up -d` again and open `http://<this machine>:8080/admin`. A change there is checked
by the collector's own rules and used from its next poll; Download config.toml keeps what is set
there in a file. Credentials stay in `.env` ([The admin page](docs/server.md#the-admin-page)).

## Try the page

Open `web/index.html` in a browser. With no `state.json` beside it, the page runs on invented data
and shows a bar of controls for every scene and state.

Press and hold anywhere on the display for two seconds to open the settings: the world, which
sets every part at once and is medieval for now, the knight's build
(Classic, Broad or Slim), weapon, skin, hair, tabard and plume, the shield and armour from helmet
to boots and a cloak or cape, the monarch and the monarch's skin, hair and robe, the cat's coat
(calico or a ginger tabby), the headline size,
a 12-hour clock, the helmet indoors, which quiet scenes take turns, and the scene some conditions
play in (running hot at the camp rather than the training yard, say). Served by Knightwatcher's own
server, what is chosen there is saved for every display; opened from disk, it is kept in that
browser. The defaults under it are set in `config.toml`; see
[Configuration](docs/configuration.md#the-settings-screens-defaults).

## How the parts fit

A small collector, run as a container, reads the homelab and writes `state.json`. A static page
under `web/` fetches that file and draws the knight. The collector knows nothing of knights and the
page knows nothing of Docker or DNS. A small server, a second container from the same image,
serves the page and the file, keeps the settings the displays choose, and serves the admin page,
where the household's settings are changed behind a password. Any other web server can serve the
page instead, with each browser then keeping its own settings and no admin page.

## Documentation

- [Design](docs/design.md): what the display is for and how the two parts divide the work
- [The state file](docs/state.md): the contract between collector and page
- [The page](docs/page.md): the files, the one grid, the scene interface, the modes and the address
- [The collector](docs/collector.md): one poll, conditions, events, sources and how to add one
- [Configuration](docs/configuration.md): how settings work, `config.toml`, `.env`, and a reference of every setting
- [The server](docs/server.md): what it serves, the settings API and store, the admin page, its security, and a reverse proxy in front
- [Security](docs/security.md): what never enters this repository, and the collector's and the server's privileges
- [Packs](docs/packs.md): the format of a pack, its checks and signing, and the library that reads it
- [Worlds](docs/worlds.md): the scenes drawn from world packs, the scene compiler and the medieval world's pack
- [A monitor on the host](docs/monitor.md): showing the display on a screen wired to a headless host
- [Development](docs/development.md): layout, checks, and the rules for changes
