# Installing

How to install Knightwatcher on a Linux host, step by step. The
[quick start](../README.md#quick-start) is the same steps without the explanations.

## What you need

- Linux with Docker and its compose plugin. Windows and macOS hosts are not supported.
- The `acl` package, for `setfacl`.
- An x86-64 or 64-bit ARM machine. The image is published for both, and a 32-bit ARM system
  cannot run it.

## Get the files

```bash
git clone https://github.com/knightwatcher-io/knightwatcher.git
cd knightwatcher
cp config.example.toml config.toml
cp .env.example .env && chmod 600 .env
```

`config.toml` holds the collector's settings and the displays' household defaults. `.env` holds
the host paths, the server's address, the admin password and the credentials of the services the
collector reads, so keep it readable by you alone. Git ignores both
([Configuration](configuration.md)).

## Make the folders

```bash
mkdir -p var/out var/server
setfacl -m u:10001:rwx var var/out var/server
setfacl -d -m u:10001:rwx,u:$(id -u):rwx var var/out var/server
touch var/backup.log
```

The containers run as uid 10001. The two `setfacl` lines let it write in those three folders. The
second also sets the default for files made there later, and names your own uid so that you can
still read what the containers write ([The accounts](configuration.md#the-accounts)).

`.env` as copied points `KW_BACKUP_LOG` at the empty `var/backup.log`, and `KW_DATA_DISK` at
`var`, so the install starts as it is. The empty log is read cleanly and raises nothing until it
records a completed backup. When you can, point `KW_BACKUP_LOG` at your real backup log and
`KW_DATA_DISK` at any folder on the disk to watch. Both must exist.

## Start it

```bash
docker compose up -d
```

Compose pulls the published image, `ghcr.io/knightwatcher-io/knightwatcher`, at the release
`KW_VERSION` in `.env` names: the newest unless you pin one, such as `KW_VERSION=0.1.0`. To run
the code of your checkout instead, build the image first:

```bash
docker compose build
docker compose up -d
```

## Open the display

Open `http://<this machine>:8080/` in a browser. `KW_SERVER_PORT` in `.env` sets another port.
The knight appears at once, and the collector's first readings within a minute.
[The display](display.md) says what the page does on a wall, and
[A monitor on the host](monitor.md) how to show it on a screen wired to the host itself.

## Keep it on your network

The page is open to anyone on your network, with no login. Read [The server](server.md#security)
before you let it be reached from anywhere else, and never publish it to the internet without a
login in front.

## Turn on more sources

The example config turns on only the general sources. They read this machine (its CPU, memory,
disk, backup log, updates and SSH sessions) or ask a fixed address (the internet and a DNS
server).

Each source that reads a service is written out in `config.toml` but commented: the containers
through a Docker API proxy, a second machine, the streams, the adverts blocked, the bans and the
imports. To turn one on, remove the `# ` before its lines, point it at your own address and put
its credential in `.env`. [Configuration](configuration.md) describes every source, and
[Providers](providers.md) how to read a service Knightwatcher does not know yet.

## The admin page

To change the sources, thresholds and devices from a browser instead of in `config.toml`:

1. Give `KW_ADMIN_PASSWORD` in `.env` a password of your own, at least 12 characters long.
2. Run `docker compose up -d` again.
3. Open `http://<this machine>:8080/admin`.

A change there is checked by the collector's own rules and used from its next poll. Download
config.toml keeps what is set there in a file. Credentials stay in `.env`
([The admin page](server.md#the-admin-page)).

## Usage counts

The usage counts are off unless you turn them on. If you are happy to help the project, set
`KW_ANALYTICS=on` in `.env` in place of `off` and run `docker compose up -d` again.

At start and every six hours the collector then sends the project a random install id, the
version, the built-in parts and sources in use and how many displays there are. It never sends a
name, an address or a credential ([Usage counts](configuration.md#usage-counts),
[telemetry.md](telemetry.md)). The [privacy notice](../legal/PRIVACY.md) says who keeps them, for
how long, and how to have yours deleted.

## Checking an install from nothing

`tools/clean-start.sh` runs these steps in a scratch copy of the checkout, on a Docker network
with no route out, and checks that the install starts cleanly
([Development](development.md#the-clean-start)).
