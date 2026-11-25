# Privacy notice

Valtora makes Knightwatcher and is the controller of the personal data this notice describes.
Contact: support@knightwatcher.io.

The notice covers three things: the usage counts that Knightwatcher's collector sends (the
heartbeat) if you turn them on, visits to the website at knightwatcher.io, and mail sent to
support@knightwatcher.io. Nothing else in Knightwatcher sends anything to Valtora.

## The usage counts

### What is sent, and when

The usage counts are off unless you turn them on, as "How to turn them on and off" below says.
While they are off, the collector sends nothing to Valtora and makes no install id.

With them on, the collector sends one heartbeat to `telemetry.knightwatcher.io` when it starts,
then one every six hours. After a failed attempt it tries again an hour later. A heartbeat holds:

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

Only Valtora, who maintains Knightwatcher, sees it, on a private page behind a sign-in. Valtora
does not sell the data, use it for advertising or pass it to anyone apart from Cloudflare, below.

Cloudflare hosts the receiver and its database, and carries the connection as it does for any site
it hosts. It handles the data for Valtora as a processor, under its data processing terms.
Cloudflare runs a worldwide network, so the data may be handled outside the UK; those terms cover
such transfers.

### Why: the lawful basis

Consent. The usage counts are off until you turn them on yourself, after this notice and the
documentation have told you what is sent and why. Turning them on is your consent to this one use.
Valtora uses the counts to learn how many installs are running, which versions they run, and which
worlds, parts and services they use, to decide what to build and fix next, and for nothing else.

You can withdraw your consent at any time, as easily as you gave it, by turning the counts off.
Withdrawing stops new heartbeats; it does not make unlawful what was sent before.

### How to turn them on and off

To turn them on, put this in `.env`, beside `compose.yaml`, and run `docker compose up -d`:

```dotenv
KW_ANALYTICS=on
```

To turn them off, set `KW_ANALYTICS=off`, or remove the line, and run `docker compose up -d`
again. With anything but `on` the collector sends nothing, opens no connection to the receiver and
makes no install id. It is the only switch. Blocking `telemetry.knightwatcher.io` at your DNS or
firewall also stops the heartbeat from arriving.

## The website

### Visitor counts

The pages of knightwatcher.io (the landing page, this notice and the art licence) count visits
with Cloudflare Web Analytics. Each of these pages loads a small script from Cloudflare, which
sends Cloudflare a short report, a beacon, once the page has loaded, and another when you leave the
page or switch away from it. A beacon holds:

- the address of the page, and of the page that linked to it, if there was one;
- how long the page took to load and draw, and how much memory its scripts used;
- a random id for that one loading of the page, made afresh each time.

Like any request, the beacon carries your browser's user agent, which Web Analytics shows only as
the browser, the operating system and the kind of device. Cloudflare estimates the country from
your IP address as the beacon arrives, and then discards the address at the data centre that
received it, without storing it in its databases or logs.

### What it does not do

The script sets no cookie and keeps nothing in your browser's storage. Cloudflare does not use
your IP address, your user agent or anything else to recognise you from one visit to the next. A
visit is counted by the site a page view came from, not by who you are, so it is never linked to
you or to your other visits.

### What Valtora sees, and for how long

Totals only: visits and page views by page, by the site that sent you, by country, and by browser,
operating system and kind of device, with how fast the pages load. Valtora sees no IP address and
no single visit. Web Analytics shows the figures for the last six months. Cloudflare keeps every
beacon for seven days, and after that a sample of about one in ten.

### Who handles it

Cloudflare hosts the website and runs Web Analytics. As with any site it hosts, it receives your IP
address with each request in order to send you the page. It handles the data for Valtora as a
processor, under its data processing terms, which also cover handling it outside the UK. The
website keeps no request logs of its own.

### The demo, and Knightwatcher itself

The demo on the landing page is Knightwatcher's own display page, running on invented data. It
does not load the Web Analytics script. What you choose on its settings screen is kept in your
browser's storage, on your device, until you clear it, and Valtora never receives it.

Knightwatcher, the display you run at home, never loads the script either. Nothing in it sends
anything to Web Analytics.

### Why: the lawful basis

Legitimate interests. Valtora needs to know how many people visit the site and which pages they
read, to judge whether the project is reaching people and which pages need work. The counts use
no cookie and no id that outlasts the loading of a page, and cannot be traced back to a visitor, so
Valtora's view is that this interest does not override yours.

### How to turn it off

Block `static.cloudflareinsights.com` and `cloudflareinsights.com` in your browser or at your DNS.
Many content blockers already do, Brave's and DuckDuckGo's among them. The pages work the same
without the script.

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

You can also withdraw your consent to the usage counts at any time, by turning them off.

Valtora answers within one month and charges nothing.

**For the usage counts, the install id is the only link between you and your rows.** Without it,
Valtora cannot tell which rows are yours. It is in `install.json` in the collector's memory folder:
the folder `KW_VAR` names in `.env`, which is `var/` beside `compose.yaml` by default. Send the
install id to support@knightwatcher.io and say whether you want a copy of its rows or want them
deleted. Deleted rows stay in Cloudflare's restore history for up to 30 days before they are gone
for good. If the memory folder has been emptied since, that id is gone, and its rows can no longer
be traced to you.

For the website, Valtora holds nothing that identifies you, so there is no visit it can find, copy
or delete for you.

Turning the usage counts off stops new rows. It does not delete the old ones: the rows hold
nothing but the install id to link them to you, so Valtora cannot tell from its side that you have
turned them off. They are deleted after 24 months, or sooner if you send the install id and ask.

## Complaints

You can complain to Valtora at support@knightwatcher.io. You can also complain to the Information
Commissioner's Office, the UK's data protection regulator, at
[ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint/).

## Changes

Changes to this notice are made in Knightwatcher's repository, whose history records each one.
