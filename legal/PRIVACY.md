# Privacy notice

Valtora makes Knightwatcher and is the controller of the personal data this notice describes.
Contact: support@knightwatcher.io.

The notice covers two things: the usage counts that Knightwatcher's collector sends (the
heartbeat), and mail sent to support@knightwatcher.io. Nothing else in Knightwatcher sends
anything to Valtora.

## The usage counts

### What is sent, and when

The collector sends one heartbeat to `telemetry.knightwatcher.io` when it starts, then one every
six hours. After a failed attempt it tries again an hour later. A heartbeat holds:

- a random install id, made once by the collector and not made from anything about your machine
  or your network;
- the Knightwatcher version, the days since the install id was made, and the hours the collector
  has been running;
- the world, the knight's build, and the built-in items and look chosen for the display;
- which sources are on, by the name of their built-in provider, and how many imports and generic
  checks there are;
- how many displays have shown the page in the last six hours.

Anything you made yourself, such as a world, an item, a colour or a provider file, is sent as
`"custom"` or counted, never by its name. [docs/telemetry.md](../docs/telemetry.md) lists every
field, with an example.

### What is never sent

Nothing about the machine (no hostname, address, hardware or file path). No address or name from
your configuration. Nothing about what is being watched (no user names, titles, device names or
conditions). No credentials.

### What is kept, and for how long

The receiver stores the fields above, with the date and time it received them (UTC) and the
two-letter country Cloudflare gives the connection. When Cloudflare does not know the country, or
the connection comes through Tor, no country is stored. It keeps one row per install per day: each
heartbeat replaces that day's row, so the day's last heartbeat is the one kept.

**Rows are deleted after 24 months.** A deleted or replaced row stays in Cloudflare's restore
history for the database for up to 30 days, and is then gone.

Your IP address is not stored. The receiver uses it for one thing, as the key that limits how many
requests one address can make in a minute, and does not keep it or log it. The receiver keeps no
request logs.

### Who sees it

Valtora alone, on a private page behind a sign-in. Valtora does not sell the data, use it for
advertising or pass it to anyone apart from Cloudflare, below.

Cloudflare hosts the receiver and its database, and carries the connection as it does for any site
it hosts. It handles the data for Valtora as a processor, under its data processing terms.
Cloudflare runs a worldwide network, so the data may be handled outside the UK; those terms cover
such transfers.

### Why: the lawful basis

Legitimate interests. Valtora needs to know how many installs are running, which versions they
run, and which worlds, parts and services they use, to decide what to build and fix next. The
heartbeat holds no names, addresses or credentials, and one setting stops it, so Valtora's view is
that this interest does not override yours.

### How to turn it off

Put this in `.env`, beside `compose.yaml`, and run `docker compose up -d`:

```dotenv
KW_ANALYTICS=off
```

The collector then sends nothing, opens no connection to the receiver and makes no install id. It
is the only switch. Blocking `telemetry.knightwatcher.io` at your DNS or firewall also stops the
heartbeat from arriving.

## Mail to the support address

If you write to support@knightwatcher.io, Valtora receives your email address, any name you give
and what you write. Valtora uses it to answer you and to follow up on what you raised, on the basis
of its legitimate interest in answering. The mail is kept while the conversation needs it, and
deleted no later than 24 months after its last message. The provider that hosts the mailbox holds
it for Valtora as a processor.

## Your rights

Under UK data protection law you can ask Valtora to:

- tell you what it holds about you, and give you a copy;
- correct it;
- delete it;
- stop using it, or use it only in limited ways.

Valtora answers within one month and charges nothing.

**For the usage counts, the install id is the only link between you and your rows.** Without it,
Valtora cannot tell which rows are yours. It is in `install.json` in the collector's memory folder:
the folder `KW_VAR` names in `.env`, which is `var/` beside `compose.yaml` by default. Send the
install id to support@knightwatcher.io and say whether you want a copy of its rows or want them
deleted. Deleted rows stay in Cloudflare's restore history for up to 30 days before they are gone
for good. If the memory folder has been emptied since, that id is gone, and its rows can no longer
be traced to you.

`KW_ANALYTICS=off` stops new rows. It does not delete the old ones, which are deleted after 24
months unless you ask sooner.

## Complaints

You can complain to Valtora at support@knightwatcher.io. You can also complain to the Information
Commissioner's Office, the UK's data protection regulator, at
[ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint/).

## Changes

Changes to this notice are made in this file, and the repository's history records each one.
