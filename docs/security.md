# Security

This repository is private and may become public. Everything in it, and every commit in its
history, is written as though it already were.

## What never enters the repository

- **Credentials** of any kind: API keys, passwords, tokens, cookies.
- **The operator's own details**: real hostnames, domains, IP addresses, usernames, email
  addresses, device names, the titles of what is being watched.
- **Real output** of the collector. `state.json` describes a private network.
- **Generated art that has not been adopted**, and the ledger of paid calls that made it.

Examples, tests and screenshots use invented data. Addresses come from the documentation ranges
(`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and names from `example.com`.

Site configuration lives in `config.toml` and credentials in `secrets.json`, both beside the
repository's files and both ignored by git. `config.example.toml` and `secrets.example.json` are
the committed templates.

Before any push, this must print nothing:

```bash
tools/check-private.sh
```

It searches the tracked files for the patterns of private detail listed in `tools/private-patterns.txt`,
which is itself ignored by git, since the list names the things it protects.

## The collector's privileges

The collector reads and never writes, except for its one output file.

- It has no Docker socket. Container state comes from a Docker API proxy that allows read calls
  alone.
- It runs as a non-root user with a read-only root filesystem and no capabilities.
- It mounts host paths read-only, and only the ones a source needs.
- It opens no listening port.

It mounts the host's `/proc` read-only, for load, memory and the lock table. A process can read
the environment of other processes that run as its own user through `/proc`, so the collector
should run as a user that owns nothing else on the host. The compose file runs it as uid 1000 so
that it can write into a folder that user owns, which on a single-user host is the operator's own
account. Giving the collector an account of its own is the better arrangement and is not done yet.

Several services it reads offer no read-only credential, so `secrets.json` holds logins that
could change those services. It is mode 600, mounted read-only into the container, and read once
at start. Treat the file as you would the services' own configuration.

## The page

The page is static. It fetches `state.json` from its own origin and nothing else, loads no
third-party script, and sends nothing anywhere.

`state.json` is not public information. Whoever serves the page must put authentication in front
of it. Knightwatch provides none.

## Commits

Commits are made with a GitHub noreply address, set in this repository's own git configuration.
