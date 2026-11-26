# Installing

How to install Knightwatcher on a Linux host, step by step. The
[quick start](../README.md#quick-start) is the same steps without the explanations.

## What you need

- Linux with Docker and its compose plugin, Compose 2.18 or later. Windows and macOS hosts are
  not supported.
- The `acl` package, for `setfacl`, or `sudo` for the [fallback](#without-setfacl).
- An x86-64 or 64-bit ARM machine. The image is published for both, and a 32-bit ARM system
  cannot run it.

It has been tested on x86-64 Linux and on a Raspberry Pi 5 with 64-bit Debian 13. Other systems,
including NAS systems such as Synology, Unraid and TrueNAS, have not been tried.

Compose 2.18 is the oldest release that reads `compose.yaml`: 2.17 and older refuse the variable
nested inside another in the server's `ports` line. `docker compose version` prints yours.

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

### Without setfacl

On a host that cannot install `acl`, give the folders to uid 10001 instead:

```bash
mkdir -p var/out var/server
touch var/backup.log
sudo chown -R 10001:10001 var
```

The containers can then write there just as well. The cost is that your own account cannot write
in `var`, or read the files the containers keep to themselves, without `sudo`.

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

## The internet and DNS checks

Two of the sources the example config turns on make a network request from the first poll:

- `[sources.wan]` fetches `https://1.1.1.1/cdn-cgi/trace`, a page of Cloudflare's, every 30
  seconds. The internet counts as up when it answers. To ask somewhere else, list another address
  in `urls`: any that answers with a 2xx will do.
- `[sources.dns]` asks `127.0.0.53` for `example.com` every 30 seconds. That address is
  systemd-resolved, the local resolver Ubuntu and many other distributions run. A host without
  it, such as plain Debian or many NAS systems, shows the DNS as down from the first poll. Set
  `server` to a DNS server it can reach, such as your router or your own AdGuard Home or Pi-hole.

To stop either check, set its `enabled` to `false` in `config.toml`, or turn it off on the
[admin page](#the-admin-page).

## Turn on more sources

The example config turns on only the general sources. They read this machine (its CPU, memory,
disk, backup log, updates and SSH sessions) or ask a fixed address (the internet and a DNS
server).

Each source that reads a service is written out in `config.toml` but commented: the containers
through a Docker API proxy, a second machine, the streams, the adverts blocked, the bans and the
imports. To turn one on, remove the `# ` before its lines, point it at your own address and put
its credential in `.env`. [Configuration](configuration.md) describes every source, and
[Providers](providers.md) how to read a service Knightwatcher does not know yet.

### A Docker API proxy for the containers

`[sources.containers]` never touches the Docker socket. It asks a proxy in front of it for one
thing, `GET /containers/json?all=1`, the list of containers and their states. A proxy that allows
reads of the containers and nothing else can run beside the collector, in a
`compose.override.yaml` next to `compose.yaml` (git ignores it, and `docker compose` reads it with
`compose.yaml`):

```yaml
services:
  docker-proxy:
    image: ghcr.io/tecnativa/docker-socket-proxy:v0.5.0
    container_name: knightwatcher-docker-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1   # reads under /containers, where the collector's one call is
      POST: 0         # no call that changes anything
      EVENTS: 0       # the image turns these three on by default; the collector needs none
      PING: 0
      VERSION: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "127.0.0.1:2375:2375"
```

Then point the source at it in `config.toml`:

```toml
[sources.containers]
enabled = true
every_s = 10
url = "http://127.0.0.1:2375"
```

The collector runs on the host's network (`network_mode: host` in `compose.yaml`), so it cannot
join a Docker network of the proxy's and reaches it on the host's loopback instead. If a
`compose.override.yaml` of yours moves the collector onto a bridge network, put the proxy on the
same network with no `ports` at all, and use `http://knightwatcher-docker-proxy:2375`.

Never publish port 2375 on any other address, and never forward it from your router. Anyone who
reaches it can read the settings of every container, environment variables included, and many
services keep their passwords there. Check for a newer release of the image before you start it,
and pin the one you choose rather than `latest`.

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
