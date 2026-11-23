# The usage heartbeat's receiver

The Cloudflare Worker that receives Knightwatcher's usage heartbeat at
`https://telemetry.knightwatcher.io/v1/heartbeat` and writes it to a Cloudflare D1 database. It
is in this repository so that [docs/telemetry.md](../docs/telemetry.md), the description for the
people whose installs send it, can be checked against the code that stores what they send.

| | |
|---|---|
| Endpoint | `POST /v1/heartbeat`, `Content-Type: application/json`, a body of at most 4096 bytes |
| Answers | `204` with no body when stored. `400` with a short JSON error naming the first missing or malformed field; `413` over 4096 bytes; `415` not JSON; `405` any other method on the path; `404` any other path; `429` over the rate limit; `500` if the write fails. Only `400` has a body |
| Storage | D1 database `knightwatcher-telemetry`, table `heartbeats`, one row per install per UTC day, upserted: the day's last heartbeat wins |
| Kept | Each row for 24 months from its day. Each time a heartbeat is stored, the Worker deletes every row whose day is before the same date two years earlier; nothing is scheduled |
| Added by the Worker | `day` and `received_at` from its own clock, and `country` from `request.cf.country` (`NULL` for `XX`, `T1` or none) |
| Rate limit | 20 requests a minute for each connecting address (`HEARTBEAT_LIMITER`) |
| Logs | None. Observability is off and the Worker calls no `console` method |

## Why it only writes

No route returns a row, a count or anything else from the database. `GET` on the path is `405`,
any other path is `404`, and neither has a body. The hostname must stay public for installs to
reach it, and it is probed by scanners like any public name; a path that read the table would put
every row one bug away from anyone who asked. The figures are read by a separate, private Worker
bound to the same D1 database, which D1 allows, so nothing is copied and nothing drifts. Keeping
the read side out of this Worker keeps the property simple to check: this code has no `SELECT`,
and a test fails if it ever prepares one.

## What it stores, and what it drops

The payload's fields are fixed by schema 1, described field by field in
[docs/telemetry.md](../docs/telemetry.md). A documented field that is missing or malformed refuses
the whole heartbeat with `400`, for example `{"error":"missing","field":"look"}` or
`{"error":"invalid","field":"items"}`; a body that is JSON but not an object is
`{"error":"not_object"}`. A field the schema does not name is dropped before the row is built and
never stored, so a newer collector is not refused by an older Worker, and an unknown field cannot
reach the table.

The connecting address is the rate limiter's key and is used for nothing else. It has no column,
the function that builds the row is never given it, and nothing is logged. `items`, `sources` and
`look` are stored as JSON text (the look's keys sorted), and `day`, `received_at` and `country`
are typed columns. Cloudflare's own handling of the connection, as the host of the Worker, is
outside this code.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | The Worker's entry. It exports the handler alone, since the runtime takes every export of the entry module for an entrypoint |
| `src/receive.ts` | Routing, the rate limit, the size cap on the declared length and on the bytes read, the content type, JSON decoding, the upsert and the delete of rows past 24 months |
| `src/payload.ts` | Validation, the country, the day, the row, and the cutoff day for the delete. No Worker runtime API, so it runs on plain Node |
| `test/payload.test.ts` | Every field's limits, wrong types and absence, unknown fields dropped, the country, the day, the cutoff (29 February and the turn of a year among them) and the row |
| `test/worker.test.ts` | The handler end to end, against a D1 stand-in that runs `schema.sql` in `node:sqlite` and a rate limiter that records its keys: every method and path, the size cap, the content type, broken JSON, the upsert, the delete of rows past 24 months (the cutoff's own day kept, a failed delete still `204`), the country, and the address never stored or logged |
| `test/config.test.ts` | `wrangler.jsonc` and `schema.sql` against what the Worker binds, and [docs/telemetry.md](../docs/telemetry.md)'s example and table against the fields it accepts and its keeping period against the Worker's |
| `schema.sql` | The D1 schema. Safe to run again |
| `wrangler.jsonc` | The Worker's name, its custom domain, the D1 and rate-limit bindings, observability off, no cron |

## Running the tests

The tests run on plain Node, 24 or newer (they use its type stripping and `node:sqlite`; checked
on 26), with no Worker runtime. From the repository's root, inside the usual ceiling:

```bash
cd telemetry && npm ci && cd ..
tools/capped.sh npm --prefix telemetry run typecheck
tools/capped.sh npm --prefix telemetry test
```

`npm test` runs `node --test --test-concurrency=2` over `test/`. To try the Worker in the local
runtime, on the loopback alone:

```bash
cd telemetry
WRANGLER_SEND_METRICS=false npx wrangler dev --local --ip 127.0.0.1
```

The local D1 starts empty, so a valid heartbeat is `500` until the schema is applied to it:
`npx wrangler d1 execute knightwatcher-telemetry --local --file=./schema.sql`.
`WRANGLER_SEND_METRICS=false` stops wrangler's own usage reports.

## Setting it up

Done once, by a person with access to the Cloudflare account that holds the `knightwatcher.io`
zone. Every command runs in `telemetry/`.

1. Install the dependencies and sign wrangler in:

   ```bash
   npm ci
   npx wrangler login
   ```

2. Create the database:

   ```bash
   npx wrangler d1 create knightwatcher-telemetry
   ```

3. Put the `database_id` it prints in `wrangler.jsonc` and commit that change. The live
   receiver's id is already there; change it only when setting up a new database.

4. Apply the schema to the database:

   ```bash
   npx wrangler d1 execute knightwatcher-telemetry --remote --file=./schema.sql
   ```

5. Check that no other Worker in the account uses the rate limiter's `namespace_id` (`2` in
   `wrangler.jsonc`). Two Workers with the same namespace share their counts; change it to an
   unused positive integer if needed.

6. Deploy, in one of two ways:
   - **Workers Builds**: in the Cloudflare dashboard, under Workers & Pages, create a Worker by
     importing this repository. Set the root directory to `telemetry`, the production branch to
     `main`, the build command to `npm ci && npm run check` (so a failing test stops the deploy),
     and keep the deploy command `npx wrangler deploy`. Add the build variable `NODE_VERSION=24`,
     which the tests need, and `WRANGLER_SEND_METRICS=false`. The Worker's name must be
     `knightwatcher-telemetry`, as in `wrangler.jsonc`. Set the build watch paths to
     `telemetry/**`, so a push to `main` deploys the Worker only when this folder changed, and
     turn previews off. The live receiver is set up this way.
   - **By hand**: `npx wrangler deploy`.

   Either way, the deploy creates the custom domain `telemetry.knightwatcher.io`, with no
   `workers.dev` or preview address, and clears any cron trigger.

7. Check it from outside. Each of these should print the status shown:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://telemetry.knightwatcher.io/v1/heartbeat   # 405
   curl -s -o /dev/null -w '%{http_code}\n' https://telemetry.knightwatcher.io/               # 404
   curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' --data '{}' \
     https://telemetry.knightwatcher.io/v1/heartbeat                                          # {"error":"missing","field":"schema"} 400
   ```

   In the dashboard, the Worker's observability should show as off.

`schema.sql` creates what is missing and changes nothing that exists, so it is safe to run again;
it does not add a column to a table already made, which needs an `ALTER TABLE` of its own.

## Changing the payload

The schema is shared with the collector, which sends it. A new field needs a column in
`schema.sql` (and an `ALTER TABLE` on the live database), the field and its check in
`src/payload.ts`, its tests, and its row in [docs/telemetry.md](../docs/telemetry.md), in the same
change. Until then the Worker drops it. A change to the meaning of an existing field is a new
`schema` number.

## Keeping rows for 24 months

A row is kept for 24 months from its day. After each heartbeat is stored, the Worker runs
`DELETE FROM heartbeats WHERE day < ?1` with the same calendar date two years before the current
UTC day (29 February maps to 28 February), so the row for 2026-11-23 is kept through 2028-11-23
and deleted from 2028-11-24. In practice a whole day's rows, of every install, go at the first
heartbeat after midnight UTC. The delete reads `idx_heartbeats_day`, so when nothing is that old it
reads almost nothing and writes nothing.

The delete is a statement of its own, run after the upsert has succeeded and not batched with it,
so a delete that fails cannot take the new row back with it. Its error is swallowed: the
heartbeat is still `204`, nothing is logged, and the next heartbeat deletes the same rows. It is
awaited before the Worker answers, so it is never cut short when the request ends. There is no
cron and no other route.

## Storage

D1 limits a database's size: 500 MB on the Workers Free plan and 10 GB on Workers Paid. A row is
about half a kilobyte with its index entry, so an install running all year costs about 200 KB, and
the free limit holds roughly 2,500 install-years. Rows are kept for 24 months, so an install
running all the time holds at most about 400 KB, and the size stops growing once the number of
installs does: the free limit holds about 1,250 installs, and the paid limit about 25,000.

Each install sends four heartbeats a day, each a write of its row and its index entry. Once its
rows reach 24 months, each day's row is deleted once, another write of the row and its index
entry, so an install costs about ten rows written a day and the free plan's 100,000 rows written a
day cover about 10,000 installs. A free-plan account over a daily D1 limit gets errors until
midnight UTC, and the heartbeats of that day after the limit are lost rather than billed.
