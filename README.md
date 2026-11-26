<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/logo-dark.svg">
  <img src="web/logo.svg" alt="Knightwatcher: a pixel-art knight's helmet with a red plume and a calm face" width="160">
</picture>

# Knightwatcher

A wall display for a homelab. A pixel-art knight fills a tablet's screen and mirrors the state of
the machines being watched: the knight trains and sweats when a machine is under strain, bloated
when it is short of memory, takes to bed when a container is unhealthy, and swats the flies that blocked adverts turn into. A mouser cat lives in
every scene and catches the flies the knight cannot: indoors, and outdoors while the knight is
busy. A headline says why, beside a wall clock.

[Try the live demo](https://knightwatcher.io/) on the project's website.

<img src="site/img/ev-goblin.png" alt="The knight on the battlement with a goblin beside it, under the headline BANISHED 203.0.113.77 and a wall clock" width="640">

The scene is a night in the knight's world. When all is quiet the knight patrols the battlement,
the camp, the house, the training yard or the smithy, walking between two or three stops and
spending 12 to 22 seconds at each: on guard, looking round, training at the dummy, quenching a
blade. While something streams, a television stands in whichever scene is showing and the knight
stops by now and then to watch it. A fault changes the scene to one that
suits it: the cellar for a full disk, the smithy's anvil during an update, the royal court while
someone has a shell open. The text
colour carries the status, green when quiet, amber for a warning, red when critical and blue
while something is at work.

Other machines on the network, such as a NAS, a camera or a virtual machine, can be listed as
devices. Each stands in the scene as a medieval thing that stands for it, a camera as an owl
mounted high and the rest on the ground (a machine as a scrying crystal, a virtual machine as a
potion flask, anything else as a chest), with a light that glows while it is up. A device that goes
down looks broken, with a question mark blinking over it;
[Devices](docs/configuration.md#devices) says how to list them.

Beside the host's own figures, the collector reads the streams playing from Tautulli, from Plex Media Server itself ([Plex](docs/configuration.md#plex-media-server)), from Tracearr ([Tracearr](docs/configuration.md#tracearr)) or from Jellyfin ([Jellyfin](docs/configuration.md#jellyfin)), the adverts
blocked from AdGuard Home, Pi-hole 6 ([Pi-hole](docs/configuration.md#pi-hole)) or Technitium DNS Server ([Technitium](docs/configuration.md#technitium-dns-server)), the films, episodes and albums imported from Radarr, Sonarr and Lidarr (and from more of them, or any service of your own, through [More imports](docs/configuration.md#more-imports)), and the bans
fail2ban makes, from its own database ([fail2ban's database](docs/configuration.md#fail2bans-database)).
Each of these services is read through a provider, a small file that maps
the service's answers onto the shape the display needs ([Providers](docs/providers.md)). Another service that answers with JSON
can be read through a provider file of your own, dropped into the `providers/` folder beside
`config.toml`; it is data, checked by the same rules, and never runs as code. For one value
alone, such as a NAS's disk temperature or a pool's state, a generic check needs no file: a
`[[sources.json]]` table in `config.toml` names the address, where the value is, a test and the
words to show, and the display acts it as a condition of your choice, in that condition's scene
([Generic checks](docs/configuration.md#generic-checks)).

## Quick start

You need Linux with Docker and its compose plugin, and the `acl` package; Windows and macOS hosts are
not supported. From a checkout of this repository:

```bash
cp config.example.toml config.toml
cp .env.example .env && chmod 600 .env
mkdir -p var/out var/server
setfacl -m u:10001:rwx var var/out var/server
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var var/out var/server
touch var/backup.log
```

The containers run as uid 10001, and the two `setfacl` lines let it write in those three folders
([configuration.md](docs/configuration.md#the-accounts)). `.env` as copied points `KW_BACKUP_LOG`
at the empty `var/backup.log`, which is read cleanly and raises nothing until it records a
completed backup, and `KW_DATA_DISK` at `var`, so the install starts as it is. Point them at your
real backup log and at any folder on the disk to watch when you can; both must exist. Then:

```bash
docker compose up -d
```

Compose pulls the published image, `ghcr.io/knightwatcher-io/knightwatcher`, at the release
`KW_VERSION` in `.env` names (the newest unless you pin one), or `docker compose build` builds it
from the checkout first. Open `http://<this machine>:8080/` in a browser, or the port
`KW_SERVER_PORT` sets. The knight appears at once and the collector's
first readings within a minute. The example config turns on only the general sources, which read
this machine (its CPU, memory, disk, backup log, updates and SSH sessions) or ask a fixed address
(the internet and a DNS server). Each source that reads a service (the containers through a
Docker API proxy, a second machine, the streams, the adverts blocked, the bans and the imports)
is written out in `config.toml` but commented: remove the `# ` before its lines and point it at
your own address ([Configuration](docs/configuration.md)), with its credential in `.env`.
`tools/clean-start.sh` runs these steps in a scratch copy, on a Docker network with no route out,
and checks that the install starts cleanly ([Development](docs/development.md#the-clean-start)).

The usage counts are off unless you turn them on. If you are happy to help the project, set
`KW_ANALYTICS=on` in `.env` in place of `off` and run `docker compose up -d` again: at start and
every six hours the collector then sends the project a random install id, the version, the
built-in parts and sources in use and how many displays there are, never a name, an address or a
credential ([Usage counts](docs/configuration.md#usage-counts), [telemetry.md](docs/telemetry.md)).
The [privacy notice](legal/PRIVACY.md) says who keeps them, for how long, and how to have yours
deleted.

The page is open to anyone on your network, with no login. Read [The server](docs/server.md#security)
before you let it be reached from anywhere else, and never publish it to the internet without a
login in front.

To change the sources, thresholds and devices from a browser rather than in `config.toml`,
give `KW_ADMIN_PASSWORD` in `.env` a password of your own of at least 12 characters, run
`docker compose up -d` again and open `http://<this machine>:8080/admin`. A change there is checked
by the collector's own rules and used from its next poll; Download config.toml keeps what is set
there in a file. Credentials stay in `.env` ([The admin page](docs/server.md#the-admin-page)).

## Try the page

Open `web/index.html` in a browser. With no `state.json` beside it, the page runs on invented data
and shows a bar of controls for every scene and state.

Press and hold anywhere on the display for two seconds to open the settings: the world, which sets
every part at once, the knight's build (Classic, Broad or Slim), weapon (a sword, a mace or a
crossbow that shoots its bolts where the others swing), skin, hair, tabard and plume, the shield
and armour from helmet to boots and a cloak or cape, the monarch and the monarch's skin, hair and
robe, the cat's coat (calico or a ginger tabby), the headline size, a 12-hour clock,
the helmet indoors, which quiet scenes take turns, and the scene some conditions play in (running
hot at the camp rather than the training yard, say). Served by Knightwatcher's own server, what is
chosen there is saved for every display; opened from disk, it is kept in that browser. The defaults
under it are set in `config.toml`; see
[Configuration](docs/configuration.md#the-settings-screens-defaults).

## Worlds

The knight lives in the medieval world: its seven scenes, the monarchs, the goblin, the flies and
the cat, the devices drawn as medieval things, and the words and colours of the text over the scene.
A world sets all of that at once, and the settings screen can also mix single parts, a monarch from
one world on another's throne, say, or another world's scene for a condition. The page ships the
medieval world, and loads another world's pack when it is signed with the project's key, or unsigned
on a `dev` page; [The display](docs/display.md#another-world-pack) says where to put one, and
[Worlds](docs/worlds.md) how one is made.

## How the parts fit

A small collector, run as a container, reads the homelab and writes `state.json`. A static page
under `web/` fetches that file and draws the knight. The collector knows nothing of knights and the
page knows nothing of Docker or DNS. A small server, a second container from the same image,
serves the page and the file, keeps the settings the displays choose, counts the displays for the usage counts, and serves the admin page,
where the household's settings are changed behind a password. Any other web server can serve the
page instead, with each browser then keeping its own settings and no admin page.

## Documentation

For people running it:

- [Configuration](docs/configuration.md): how settings work, `config.toml`, `.env`, and a reference of every setting
- [Providers](docs/providers.md): the provider files the services are read through, the path syntax, `--probe`, the safety rules, and provider files of your own
- [The display](docs/display.md): the modes, the settings and worlds, the settings screen, the address's hooks, the admin page and deploying
- [The server](docs/server.md): what it serves, the settings API and store, the admin page, its security, and a reverse proxy in front
- [Security](docs/security.md): what never enters this repository, and the collector's and the server's privileges
- [Usage counts](docs/telemetry.md): every field of the heartbeat the collector sends, and what the project keeps
- [A monitor on the host](docs/monitor.md): showing the display on a screen wired to a headless host

For people making packs:

- [Packs](docs/packs.md): format 1.0, the rig items hang on, weapons that fire, the checks every pack passes, and signing
- [Worlds](docs/worlds.md): formats 1.1 and 1.2, the words, the overlay, presets, and parts of different worlds together
- [Scenes as data](docs/scenes.md): shapes and terms, the fields of a scene, and how a scene compiles and acts
- [The cast and the devices](docs/cast.md): the patron, foes, critters and pets, and the drawings of the devices

For contributors:

- [Design](docs/design.md): what the display is for, the terms, and how the two parts divide the work
- [Contributing](CONTRIBUTING.md): the licences, signing off each commit, and the checks on a pull request
- [Development](docs/development.md): layout, rules, checks, the icons and signing the packs
- [The state file](docs/state.md): the contract between collector and page
- [The collector](docs/collector.md): one poll, conditions, events, sources and how to add one
- [The page](docs/page.md): the files, the one grid, the scene interface, the effects, the devices and the cast
- [The knight's rig](docs/rig.md): anchors, values and poses, the knight from the base pack, and gear at rest
- [The pack library](docs/library.md): looks, compiled lists, the library, and the packs on the page
- [Loading a world](docs/world-loading.md): `KW.world`, where the scenes are drawn from, failures, and the two copies of the medieval world
- [The tests](docs/tests.md): every test file and what it checks, and the test world
- [The screenshots](docs/shots.md): taking and comparing them, and what an older reference shows
- [The website](site/README.md): knightwatcher.io, its build, the demo, the headers, and deploying it

## Licence

Copyright (C) 2026 Valtora and the Knightwatcher contributors

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

The full text is in [LICENSE](LICENSE).

The art is under the Creative Commons Attribution-ShareAlike 4.0 International licence
(CC BY-SA 4.0): the packs in `web/packs/`, the drawings in the page's code that the packs mirror,
and the pictures of the website. Anyone may use, change, share and sell it, with credit, and what
is made from it is shared under the same licence. [ART-LICENCE.md](legal/ART-LICENCE.md) lists what
it covers and gives the line to credit it with, and [LICENSE-ART](LICENSE-ART) holds the full
text. The VT323 font is under the SIL Open Font License, in [web/fonts/OFL.txt](web/fonts/OFL.txt).

The name and the logo are under neither licence. Anyone may use the name to refer to the project,
and a fork that changes things uses a name and a logo of its own
([NAME-AND-LOGO.md](legal/NAME-AND-LOGO.md)).

Contributions of code and art are welcome, each commit signed off under the Developer Certificate
of Origin. [CONTRIBUTING.md](CONTRIBUTING.md) says how.
