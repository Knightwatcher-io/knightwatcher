# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, never in a public issue, a discussion or a pull request.
Either:

- open a report through GitHub's private vulnerability reporting, under
  [Security, Report a vulnerability](https://github.com/knightwatcher-io/knightwatcher/security/advisories/new)
  on this repository; or
- email [support@knightwatcher.io](mailto:support@knightwatcher.io).

Say what is affected, the version or commit, how to reproduce it, and what an attacker gains.
Leave out any real credential, address or log line from your own network.

## What is in scope

- The collector, in `collector/`.
- The bundled server and the admin page, in `server/` and `web/admin/`.
- The display page, in `web/`.
- The checking of a pack's signature, in `web/js/pack.js` and `web/js/ed25519.js`.

A service the collector reads (Plex, AdGuard Home, Sonarr and the rest) is out of scope; report a
problem in one of them to its own project. So is a deployment that publishes the display to the
internet without a login in front, which the documentation warns against.

## What to expect

An acknowledgement of the report, then a fix in a release. There is no bug bounty.

## Hardening

[docs/security.md](docs/security.md) describes the collector's and the server's privileges and what
the page sends, and [docs/server.md](docs/server.md#security) how to keep the server off the
internet or put a login in front of it.
