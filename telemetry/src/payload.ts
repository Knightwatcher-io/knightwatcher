/**
 * The heartbeat's payload: what a valid one is, and the row it becomes.
 *
 * Nothing here touches a Worker runtime API, so it runs and is tested on plain Node. Every
 * decision about what is stored is made in this file. docs/telemetry.md describes it for the
 * people whose installs send it, and the tests hold the two together.
 */

/** The one version of the payload this Worker reads. */
export const SCHEMA = 1;

/** A lowercase UUID, version 4, as the collector makes it. */
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^[A-Za-z0-9._+-]{1,40}$/;
/** A world, a build, an item, and a look's part and value. */
const ID = /^[a-z0-9_-]{1,40}$/;
/** A source, with the provider it is read through when it has one: `streams:jellyfin`. */
const SOURCE = /^[a-z0-9_]{1,32}(:[a-z0-9_]{1,32})?$/;

/** The documented fields, in the order they are checked and the first bad one is named. */
export const FIELDS = [
  "schema",
  "install_id",
  "version",
  "install_age_days",
  "uptime_hours",
  "world",
  "build",
  "items",
  "look",
  "sources",
  "imports",
  "checks",
  "displays",
] as const;

export type Field = (typeof FIELDS)[number];

export interface Heartbeat {
  schema: number;
  install_id: string;
  version: string;
  install_age_days: number;
  uptime_hours: number;
  world: string | null;
  build: string | null;
  items: string[];
  look: Record<string, string>;
  sources: string[];
  imports: number;
  checks: number;
  displays: number;
}

export type Problem = "missing" | "invalid";

export type ParseResult =
  | { ok: true; heartbeat: Heartbeat }
  | { ok: false; problem: "not_object" }
  | { ok: false; problem: Problem; field: Field };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isIdOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && ID.test(value));
}

/**
 * Unique and sorted, which together mean each string is strictly after the one before it. The
 * order is by UTF-16 code unit; every allowed character is ASCII, so it is the collector's
 * order too.
 */
function isSortedList(value: unknown, max: number, pattern: RegExp): value is string[] {
  if (!Array.isArray(value) || value.length > max) {
    return false;
  }
  for (let i = 0; i < value.length; i++) {
    const item: unknown = value[i];
    if (typeof item !== "string" || !pattern.test(item)) {
      return false;
    }
    if (i > 0 && !(value[i - 1] < item)) {
      return false;
    }
  }
  return true;
}

function isLook(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length <= 32 &&
    entries.every(([key, part]) => ID.test(key) && typeof part === "string" && ID.test(part))
  );
}

const CHECKS: Record<Field, (value: unknown) => boolean> = {
  schema: (v) => v === SCHEMA,
  install_id: (v) => typeof v === "string" && INSTALL_ID.test(v),
  version: (v) => typeof v === "string" && VERSION.test(v),
  install_age_days: (v) => isCount(v, 100_000),
  uptime_hours: (v) => isCount(v, 1_000_000),
  world: isIdOrNull,
  build: isIdOrNull,
  items: (v) => isSortedList(v, 32, ID),
  look: isLook,
  sources: (v) => isSortedList(v, 48, SOURCE),
  imports: (v) => isCount(v, 16),
  checks: (v) => isCount(v, 64),
  displays: (v) => isCount(v, 1000),
};

/**
 * Checks a decoded body against the contract. A documented field that is missing or malformed
 * refuses the whole heartbeat, naming the first such field. A field the contract does not name
 * is dropped here and never reaches the row, so a newer collector is not refused by an older
 * Worker and an unknown field can never be stored.
 */
export function parseHeartbeat(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, problem: "not_object" };
  }
  for (const field of FIELDS) {
    if (!Object.hasOwn(body, field)) {
      return { ok: false, problem: "missing", field };
    }
    if (!CHECKS[field](body[field])) {
      return { ok: false, problem: "invalid", field };
    }
  }
  const b = body as unknown as Heartbeat;
  return {
    ok: true,
    heartbeat: {
      schema: b.schema,
      install_id: b.install_id,
      version: b.version,
      install_age_days: b.install_age_days,
      uptime_hours: b.uptime_hours,
      world: b.world,
      build: b.build,
      items: [...b.items],
      // Keys sorted, so one look is always stored as the same text. fromEntries makes own
      // properties, so a part named __proto__ is kept as data and changes nothing.
      look: Object.fromEntries(Object.entries(b.look).sort(([a], [z]) => (a < z ? -1 : 1))),
      sources: [...b.sources],
      imports: b.imports,
      checks: b.checks,
      displays: b.displays,
    },
  };
}

/** The columns of a stored row, in the order the upsert binds them. */
export const COLUMNS = [
  "install_id",
  "day",
  "received_at",
  "country",
  "schema",
  "version",
  "install_age_days",
  "uptime_hours",
  "world",
  "build",
  "items",
  "look",
  "sources",
  "imports",
  "checks",
  "displays",
] as const;

export type Column = (typeof COLUMNS)[number];
export type Row = Record<Column, string | number | null>;

/** The UTC day of a moment on the Worker's clock, as `YYYY-MM-DD`. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The country Cloudflare gives a request (`request.cf.country`), or null. Cloudflare sends `XX`
 * when it does not know the country and `T1` for the Tor network; neither is a country, so both
 * are stored as null, as is anything that is not two capital letters.
 */
export function countryOf(cf: unknown): string | null {
  if (!isRecord(cf)) {
    return null;
  }
  const country = cf.country;
  if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) {
    return null;
  }
  return country === "XX" || country === "T1" ? null : country;
}

/**
 * The row a valid heartbeat becomes. Its inputs are the heartbeat, the moment on the Worker's
 * clock and the country, and nothing else: the connecting address never reaches this function,
 * so it cannot reach the table.
 */
export function buildRow(heartbeat: Heartbeat, receivedAt: number, country: string | null): Row {
  return {
    install_id: heartbeat.install_id,
    day: dayOf(receivedAt),
    received_at: receivedAt,
    country,
    schema: heartbeat.schema,
    version: heartbeat.version,
    install_age_days: heartbeat.install_age_days,
    uptime_hours: heartbeat.uptime_hours,
    world: heartbeat.world,
    build: heartbeat.build,
    items: JSON.stringify(heartbeat.items),
    look: JSON.stringify(heartbeat.look),
    sources: JSON.stringify(heartbeat.sources),
    imports: heartbeat.imports,
    checks: heartbeat.checks,
    displays: heartbeat.displays,
  };
}

/** The upsert: one row per install per UTC day, and the day's last heartbeat wins. */
export const UPSERT_SQL = `INSERT INTO heartbeats (${COLUMNS.join(", ")})
VALUES (${COLUMNS.map((_, i) => `?${i + 1}`).join(", ")})
ON CONFLICT (install_id, day) DO UPDATE SET
  ${COLUMNS.filter((c) => c !== "install_id" && c !== "day")
    .map((c) => `${c} = excluded.${c}`)
    .join(",\n  ")}`;
