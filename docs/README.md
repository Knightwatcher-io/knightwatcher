# Documentation

Every page of Knightwatcher's documentation, by who it is for.

The words these pages use most, as [Design](design.md#terms) defines them:

| Word | What it means |
|---|---|
| Knight | The figure in the middle of the scene that acts out what the homelab is doing. Design calls any world's figure the watcher, and the medieval world's watcher is the knight. |
| Condition | Something the collector judges true, such as `attack` or `disk_full`, reported by id in priority order. |
| Scene | Where the knight acts out a condition: the battlement, the camp, the house, the training yard, the cellar, the smithy or the royal court. |
| Source | One thing the collector reads, such as this host's CPU, a DNS server or a service, set in a `[sources.<name>]` table of `config.toml`. |
| Provider | A TOML file that says how to read one service: the requests to make, the login, and where in the replies each value is ([Providers](providers.md)). |
| Device | A machine you list to watch, such as a NAS or a camera. It stands in the scene as a medieval thing and breaks when it goes down. |
| Pack | A JSON file that carries the knight's gear or a world's parts as data. |
| World | The knight's surroundings as one set: the scenes, the cast, the drawings of the devices, the words and the overlay, carried in a world pack. The medieval world ships with the page. |

For people running it:

- [Installing](install.md): what you need, the quick start step by step, the image, the internet and DNS checks, turning on sources with a Docker API proxy, the admin page and the usage counts
- [Configuration](configuration.md): how settings work, `config.toml`, `.env`, and a reference of every setting
- [Providers](providers.md): the provider files the services are read through, the path syntax, `--probe`, the safety rules, and provider files of your own
- [The display](display.md): the modes, the settings and worlds, the settings screen, the address's hooks, the admin page and deploying
- [The server](server.md): what it serves, the settings API and store, the admin page, its security, and a reverse proxy in front
- [Security](security.md): what never enters this repository, and the collector's and the server's privileges
- [Usage counts](telemetry.md): every field of the heartbeat the collector sends, and what the project keeps
- [A monitor on the host](monitor.md): showing the display on a screen wired to a headless host

For people making packs:

- [Packs](packs.md): format 1.0, the rig items hang on, weapons that fire, the checks every pack passes, and signing
- [Worlds](worlds.md): formats 1.1 and 1.2, the words, the overlay, presets, and parts of different worlds together
- [Scenes as data](scenes.md): shapes and terms, the fields of a scene, and how a scene compiles and acts
- [The cast and the devices](cast.md): the patron, foes, critters and pets, and the drawings of the devices

For contributors:

- [Design](design.md): what the display is for, the terms, and how the two parts divide the work
- [Contributing](../.github/CONTRIBUTING.md): the licences, signing off each commit, and the checks on a pull request
- [Development](development.md): layout, rules, checks, the icons and signing the packs
- [The state file](state.md): the contract between collector and page
- [The collector](collector.md): one poll, conditions, events, sources and how to add one
- [The page](page.md): the files, the one grid, the scene interface, the effects, the devices and the cast
- [The knight's rig](rig.md): anchors, values and poses, the knight from the base pack, and gear at rest
- [The pack library](library.md): looks, compiled lists, the library, and the packs on the page
- [Loading a world](world-loading.md): `KW.world`, where the scenes are drawn from, failures, and the two copies of the medieval world
- [The tests](tests.md): every test file and what it checks, and the test world
- [The screenshots](shots.md): taking and comparing them, and what an older reference shows
- [The website](../site/README.md): knightwatcher.io, its build, the demo, the headers, and deploying it
