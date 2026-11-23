# Usage counts

Knightwatcher's collector sends a small heartbeat to the project: a random install id, the
version, and counts of which built-in parts and sources are in use. It shows how many installs are
running, which versions they run, and which worlds, parts and services they use. This page is the
complete description of what is sent, what is kept and how to turn it off.

It is on unless turned off. `KW_ANALYTICS=off` in `.env` stops it
([How to turn it off](#how-to-turn-it-off)).

## What is sent

One `POST` to `https://telemetry.knightwatcher.io/v1/heartbeat`, with a JSON body like this one
and nothing else:

```json
{
  "schema": 1,
  "install_id": "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b",
  "version": "a1b2c3d4e5f6",
  "install_age_days": 12,
  "uptime_hours": 30,
  "world": "medieval",
  "build": null,
  "items": ["main_longsword", "off_kite"],
  "look": { "hair": "brown", "tabard": "teal" },
  "sources": ["adblock:pihole", "dns", "host", "imports:sonarr", "streams:jellyfin", "wan"],
  "imports": 1,
  "checks": 2,
  "displays": 1
}
```

| Field | What it holds |
|---|---|
| `schema` | The payload's version, `1` |
| `install_id` | A random UUID made once, when the collector first starts with the counts on, and kept in the collector's memory folder. It is not made from anything about the machine or the network. Emptying the memory folder makes a new one |
| `version` | The running Knightwatcher version, as the build is stamped |
| `install_age_days` | Whole days since the install id was made |
| `uptime_hours` | Whole hours the collector has been running |
| `world` | The household's world if it is one that ships with Knightwatcher, `"custom"` for one that does not, or `null` for none set |
| `build` | The knight's build if it is not the default, or `null` for the default |
| `items` | The built-in items chosen, sorted. An item that does not ship with Knightwatcher is sent as `"custom"`, once, however many there are |
| `look` | The household look's parts with their built-in values, such as `"tabard": "teal"`. A value that is not built in is sent as `"custom"` |
| `sources` | Each enabled source, sorted. A source read through a provider carries the provider's id (`streams:jellyfin`); one read through a provider file of your own is sent as `<kind>:custom` |
| `imports` | How many `[[sources.imports]]` entries are enabled. A count only, never their names |
| `checks` | How many `[[sources.json]]` entries are enabled. A count only |
| `displays` | How many different displays have shown the page in the last six hours |

Anything you made yourself, such as a world, an item, a colour or a provider file, is sent as
`"custom"` or counted, never by its name.

The body carries no timestamp. The receiver uses its own clock for the day and the time.

## What is never sent

- **Nothing about the machine.** No hostname, address, hardware or file path.
- **Nothing from your configuration as written.** No URL or address of a service or a device, and
  no name you gave a source, an entry or a device.
- **Nothing about what is being watched.** No user names, titles, device names or conditions, and
  not which conditions fire.
- **No credentials.** No API key, token, password or anything else from `.env`.

## What the receiver keeps

The receiver checks each heartbeat against the fields above and stores those fields, and three
more of its own:

- `day`, the UTC date of its own clock;
- `received_at`, the time on its own clock;
- `country`, the two-letter country Cloudflare gives the connection, or nothing when Cloudflare
  does not know it or the connection comes through Tor.

It keeps **one row per install per UTC day**. Each heartbeat replaces that day's row for the same
install id, so the day's last heartbeat is the one kept. A field it does not know is dropped and
never stored. A heartbeat with a documented field missing or malformed is refused and nothing is
stored.

**Each row is kept for 24 months from its day, then deleted.** The row for 23 November 2026 is
kept through 23 November 2028 and deleted from 24 November 2028; a row for 29 February is kept
through 28 February two years on. The receiver deletes the rows past 24 months each time it stores
a heartbeat, so a day's rows go at the first heartbeat after midnight UTC once that day is more
than 24 months old. Nothing is rolled up or kept in any other form.

The connecting address is used for one thing: to limit how many requests one address can make in
a minute, so a flood cannot crowd out real installs. It is **never stored and never logged**.
The receiver keeps no request logs at all.

The receiver runs on Cloudflare, which carries the connection as it would for any site it hosts.
Only the project's maintainer can see what is stored. The receiver has no way to read it back: it
answers a heartbeat with a status code alone, or with the name of the field it refused, and every
other request with an empty refusal.

## When it is sent

Only the long-running collector sends. A one-shot run, such as `--once`, `--probe`,
`--check-config` or `--health`, never does.

- The first heartbeat goes when the collector starts, then one every six hours.
- After a failure the next attempt is an hour later, and then the six-hour rhythm resumes.
- Each attempt gives up after 10 seconds. Sending never delays or stops the reading of any
  source, and never changes what the wall shows.

At its first start, when it makes the install id, the collector logs one notice at info level:
what is sent, where, and that `KW_ANALYTICS=off` in `.env` stops it, with a link to this page.
Each heartbeat sent is logged at info level with the endpoint. A failure is logged as a warning at
most once an hour.

## How to turn it off

Set this in `.env`, beside `compose.yaml`:

```dotenv
KW_ANALYTICS=off
```

and apply it with `docker compose up -d`. The value is read without regard to case or surrounding
spaces, so `OFF` and ` off ` work too. With it the collector sends nothing, opens no connection to
the receiver and makes no install id, and logs once at start that the usage counts are off.

This is the only control. Any other value, an empty one, or none at all leaves the heartbeat on.

You can also block the hostname `telemetry.knightwatcher.io` at your DNS or firewall. The
collector then logs a failed attempt, as a warning at most once an hour, and nothing else in
Knightwatcher is affected.

Turning it off changes nothing else: no feature depends on it.

## The receiver's code

The receiver is the [`telemetry/`](../telemetry/) folder of this repository: the Cloudflare
Worker, its database schema and its tests. Its README describes how it is checked and set up.
