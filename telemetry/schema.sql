-- Knightwatcher's usage heartbeat (Cloudflare D1).
--
-- Apply with:
--   npx wrangler d1 execute knightwatcher-telemetry --remote --file=./schema.sql
--
-- Safe to run again: it creates what is missing and changes nothing that exists. It does not
-- add a column to a table already made; that needs an ALTER TABLE of its own.
--
-- One row per install per UTC day. The primary key is the whole of the deduplication: each
-- heartbeat upserts its install's row for the day, so a retry or a restart rewrites that row and
-- the day's last heartbeat is the one kept. A row is kept for 24 months from its day: after each
-- heartbeat is stored, the Worker deletes every row whose day is before the same date two years
-- earlier (29 February maps to 28 February), through idx_heartbeats_day. Nothing is scheduled.
--
-- The columns are the payload's documented fields and three the Worker adds: day and
-- received_at from its own clock, and country from Cloudflare's request data. There is no
-- column for the connecting address, and none for a field the payload does not document.

CREATE TABLE IF NOT EXISTS heartbeats (
  install_id       TEXT    NOT NULL,  -- random UUID made by the collector
  day              TEXT    NOT NULL,  -- UTC date, YYYY-MM-DD, on the Worker's clock
  received_at      INTEGER NOT NULL,  -- epoch milliseconds, on the Worker's clock
  country          TEXT,              -- two letters from request.cf.country; NULL for XX, T1 or none

  schema           INTEGER NOT NULL,  -- the payload's version
  version          TEXT    NOT NULL,
  install_age_days INTEGER NOT NULL,
  uptime_hours     INTEGER NOT NULL,
  world            TEXT,              -- NULL when none is set
  build            TEXT,              -- NULL for the default build
  items            TEXT    NOT NULL,  -- JSON array of strings, sorted
  look             TEXT    NOT NULL,  -- JSON object, part to value, keys sorted
  sources          TEXT    NOT NULL,  -- JSON array of strings, sorted
  imports          INTEGER NOT NULL,
  checks           INTEGER NOT NULL,
  displays         INTEGER NOT NULL,

  PRIMARY KEY (install_id, day)
);

-- The daily counts filter on day across every install, and the Worker's delete of rows past 24
-- months reads it too.
CREATE INDEX IF NOT EXISTS idx_heartbeats_day ON heartbeats (day);
