/** wrangler.jsonc, schema.sql and docs/telemetry.md, held to what the Worker does. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { COLUMNS, FIELDS, parseHeartbeat } from "../src/payload.ts";
import { SCHEMA_SQL } from "./helpers.ts";

/** JSON with comments: drops `//` comments outside strings, then parses. */
function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else {
      out += ch;
    }
  }
  return JSON.parse(out);
}

const config = parseJsonc(readFileSync(join(import.meta.dirname, "..", "wrangler.jsonc"), "utf8")) as any;

describe("wrangler.jsonc", () => {
  it("names the Worker and its entry", () => {
    assert.equal(config.name, "knightwatcher-telemetry");
    assert.equal(config.main, "src/index.ts");
    assert.match(config.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps no invocation logs", () => {
    assert.deepEqual(config.observability, { enabled: false });
  });

  it("is reached at its custom domain alone", () => {
    assert.deepEqual(config.routes, [{ pattern: "telemetry.knightwatcher.io", custom_domain: true }]);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
  });

  it("binds the database as DB, its id plainly a placeholder until setup", () => {
    assert.equal(config.d1_databases.length, 1);
    const [db] = config.d1_databases;
    assert.equal(db.binding, "DB");
    assert.equal(db.database_name, "knightwatcher-telemetry");
    assert.match(db.database_id, /PLACEHOLDER|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("limits each address to 20 requests a minute", () => {
    assert.equal(config.ratelimits.length, 1);
    const [limit] = config.ratelimits;
    assert.equal(limit.name, "HEARTBEAT_LIMITER");
    assert.match(limit.namespace_id, /^[1-9]\d*$/);
    assert.deepEqual(limit.simple, { limit: 20, period: 60 });
  });

  it("schedules nothing", () => {
    assert.deepEqual(config.triggers, { crons: [] });
  });

  it("binds nothing else", () => {
    for (const key of ["kv_namespaces", "r2_buckets", "services", "vars", "durable_objects", "analytics_engine_datasets", "logpush", "tail_consumers"]) {
      assert.equal(config[key], undefined, key);
    }
  });
});

describe("schema.sql", () => {
  it("makes the columns the Worker binds, in order", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    const columns = db.prepare("PRAGMA table_info(heartbeats)").all();
    assert.deepEqual(columns.map((c) => c.name), [...COLUMNS]);
  });

  it("keys a row on the install and the day", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    const key = db
      .prepare("PRAGMA table_info(heartbeats)")
      .all()
      .filter((c) => (c.pk as number) > 0)
      .sort((a, b) => (a.pk as number) - (b.pk as number))
      .map((c) => c.name);
    assert.deepEqual(key, ["install_id", "day"]);
  });

  it("types day, received_at and country, and the counts", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    const types = Object.fromEntries(db.prepare("PRAGMA table_info(heartbeats)").all().map((c) => [c.name, c.type]));
    assert.equal(types.day, "TEXT");
    assert.equal(types.received_at, "INTEGER");
    assert.equal(types.country, "TEXT");
    for (const count of ["schema", "install_age_days", "uptime_hours", "imports", "checks", "displays"]) {
      assert.equal(types[count], "INTEGER", count);
    }
    for (const json of ["items", "look", "sources"]) {
      assert.equal(types[json], "TEXT", json);
    }
  });

  it("can be run again on a database that has it, keeping the rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    db.prepare(
      `INSERT INTO heartbeats VALUES ('6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b', '2026-11-22', 1, NULL, 1, 'v', 0, 0, NULL, NULL, '[]', '{}', '[]', 0, 0, 0)`,
    ).run();
    db.exec(SCHEMA_SQL);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM heartbeats").get()!.n, 1);
  });

  it("creates only if not exists", () => {
    const statements = SCHEMA_SQL.replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    assert.ok(statements.length > 0);
    for (const statement of statements) {
      assert.match(statement, /^CREATE (TABLE|INDEX) IF NOT EXISTS /);
    }
  });
});

describe("docs/telemetry.md", () => {
  const doc = readFileSync(join(import.meta.dirname, "..", "..", "docs", "telemetry.md"), "utf8");

  it("shows an example the Worker accepts, with every field", () => {
    const block = /```json\n([\s\S]*?)\n```/.exec(doc);
    assert.ok(block, "a JSON example");
    const example = JSON.parse(block[1]!);
    assert.deepEqual(Object.keys(example), [...FIELDS]);
    assert.equal(parseHeartbeat(example).ok, true);
  });

  it("has a row for every field", () => {
    const rows = [...doc.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
    assert.deepEqual(rows, [...FIELDS]);
  });

  it("names the endpoint and the switch", () => {
    assert.ok(doc.includes("https://telemetry.knightwatcher.io/v1/heartbeat"));
    assert.ok(doc.includes("KW_ANALYTICS=off"));
  });
});
