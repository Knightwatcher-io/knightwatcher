# Security

This repository is private and may become public. Everything in it, and every commit in its
history, is written as though it already were.

## What never enters the repository

- **Credentials** of any kind: API keys, passwords, tokens, cookies.
- **The operator's own details**: real hostnames, domains, IP addresses, usernames, email
  addresses, device names, the titles of what is being watched.
- **Real output** of the collector. `state.json` describes a private network.

Examples, tests and screenshots use invented data. Addresses come from the documentation ranges
(`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and names from `example.com`.

Site configuration lives in `config.toml` and the host paths and credentials in `.env`, both
beside the repository's files and both ignored by git. `config.example.toml` and `.env.example`
are the committed templates, with invented values only.

Before any push, this must print nothing:

```bash
tools/check-private.sh
```

It searches the tracked files for the patterns of private detail listed in
`tools/private-patterns.txt`, which is itself ignored by git, since the list names the things it
protects.

## The collector's privileges

The collector reads and never writes, except for its output folder (`state.json`, the packs it
downloads and `credentials.json`) and its memory folder.

- It has no Docker socket. Container state comes from a Docker API proxy that allows read calls
  alone.
- It runs as a non-root user with a read-only root filesystem and no capabilities.
- It mounts host paths read-only, and only the ones a source needs, apart from the output folder
  and the memory folder. It also mounts the bundled server's folder read-only, to take up what is
  set on the admin page.
- It opens no listening port.
- It connects only to the addresses in its configuration: the services it reads, and the
  machines listed as devices. A device gets a TCP connection, or one `GET` with no
  credentials, at the pace set for it. No request goes through a proxy named in the
  environment, and only `http` and `https` addresses are opened. A web address's certificate is
  not checked unless its `verify_tls` is `true`. The check sends nothing and trusts nothing it
  reads beyond the fact of an answer, so an impostor at that address can at worst make a machine
  that is down look up.

It mounts the host's `/proc` read-only, for load, memory and the lock table. A process can read
the environment of other processes that run as its own user through `/proc`, so the collector
should run as a user that owns nothing else on the host. The compose file runs it as uid 10001,
an account with no processes and no files of its own, and the operator grants that uid the two
folders it writes to;
[configuration.md](./configuration.md#the-accounts) has the commands. Do not change it
to your own uid for convenience: the collector could then read the environment of everything
you run.

Several services it reads offer no read-only credential, so `.env` holds logins that could change
those services. It is mode 600 and read by docker compose as the operator, never mounted. Each
credential is passed by name to the collector's container alone, as an environment variable read
once at start, so another service in the compose file gets none it does not name. The collector's
environment can be read by root, by its own uid through `/proc` (an account that runs nothing
else), and by anyone who may run `docker inspect`, who could equally read `.env` itself. The
configuration check names a missing credential by its variable and never shows a value, and a
source's error text is scrubbed of every credential value before it reaches the state file.
`credentials.json`, which the collector writes for the admin page, holds the names of the
credential variables and whether each holds a value, never a value. Treat `.env` as you would the
services' own configuration.

## The server's privileges

The bundled server ([server.md](./server.md)) serves the page and `state.json`, keeps the
settings saved on the displays, and serves the admin page. It is the one part with a listening
port, so it gets less than the collector:

- No credential. From `.env`, `compose.yaml` passes it the admin page's password alone, and reads
  its address and port to publish it. It reads the password once at start, takes it out of its
  own environment, and never logs it, answers it or writes it anywhere. It mounts `config.toml`
  read-only, which holds no secret, and not `/proc`, the collector's memory or anything of the
  host's beyond two folders.
- The collector's output folder read-only, and one folder of its own, the only place it writes.
  It reads the collector's `credentials.json` there, names only, and never serves it.
- The same uid as the collector, a read-only root filesystem, no capabilities and
  `no-new-privileges`, on Docker's network for the project rather than the host's.
- It serves the page's files from memory, looked up by name, and two kinds of file from the
  output folder, so no address reaches anything else; the tests try the usual ways.
- A write to the shared settings is JSON of at most 16 KiB, checked by the collector's own rules,
  and refused when a browser says it comes from a page at another address. It can change only how
  the displays look.
- The admin page changes what the collector watches, so it is behind a password of at least 12
  characters, and off without one. The password is compared in constant time, each wrong one is
  answered after a second, and five wrong in a row pause signing in for every browser, for a
  minute doubling to fifteen. A session is a random token in an `HttpOnly`, `SameSite=Strict`
  cookie, `Secure` behind HTTPS, lasting 30 days from its last use. The server keeps sessions in
  `sessions.json` in its folder, mode 640, each by an HMAC of its token keyed with the password,
  so the file signs nobody in and a new password ends every session. Every
  write passes the same origin check, and every change is checked by the collector's own rules
  before it is kept. A signed-in browser can point the collector at any address the host reaches,
  but cannot change a credential, a folder or a mount.

## The page

The page fetches `state.json` and, served, `api/settings` from its own origin and nothing else,
loads no third-party script, and sends nothing anywhere but the settings chosen on its screen, to
its own server.

`state.json` is not public information. The bundled server is open to anyone who can reach its
port, with no login, by default; put authentication in front of it, or bind it to the loopback
address, before it is reached from beyond a network you trust, and never publish it to the
internet without a login. [server.md](./server.md#security) says how. Knightwatcher's own
password covers the admin page alone, not the walls or `state.json`.

The admin page fetches from its own server and nothing else: the schema, its settings, the shared
settings, and the export. It never receives a credential, and sends the admin password only to
sign in.

## Commits

Commits are made with a GitHub noreply address, set in this repository's own git configuration.
