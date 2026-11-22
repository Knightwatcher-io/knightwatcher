/**
 * The Worker end to end: each request through `handle`, against a D1 stand-in that runs the real
 * schema.sql in SQLite and a rate limiter that records its keys.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import * as entry from "../src/index.ts";
import worker from "../src/index.ts";
import { handle, MAX_BODY_BYTES } from "../src/receive.ts";
import { COLUMNS } from "../src/payload.ts";
import { fakes, NOON, post, request, stream, valid, type Fakes } from "./helpers.ts";

const ADDRESS = "192.0.2.10";

let f: Fakes;
const consoleCalls: unknown[][] = [];

beforeEach(() => {
  f = fakes();
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    mock.method(console, level, (...args: unknown[]) => {
      consoleCalls.push([level, ...args]);
    });
  }
});

afterEach(() => {
  mock.restoreAll();
  // Not a single console call in any test: the Worker logs nothing.
  assert.deepEqual(consoleCalls, []);
});

async function send(req: Request, now = NOON): Promise<Response> {
  return handle(req, f.env, now);
}

async function assertEmpty(res: Response, status: number) {
  assert.equal(res.status, status);
  assert.equal(await res.text(), "");
}

/** A valid heartbeat padded with an unknown field to exactly `size` bytes. */
function sized(size: number): string {
  const base = JSON.stringify({ ...valid(), pad: "" });
  const text = JSON.stringify({ ...valid(), pad: "x".repeat(size - base.length) });
  assert.equal(new TextEncoder().encode(text).byteLength, size);
  return text;
}

describe("a valid heartbeat", () => {
  it("is 204 with no body, and one row is written", async () => {
    await assertEmpty(await send(post(valid(), { cf: { country: "GB" } })), 204);
    const rows = f.db.rows();
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0] }, {
      install_id: "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b",
      day: "2026-11-22",
      received_at: NOON,
      country: "GB",
      schema: 1,
      version: "a1b2c3d4e5f6",
      install_age_days: 12,
      uptime_hours: 30,
      world: "medieval",
      build: null,
      items: '["custom"]',
      look: '{"hair":"brown","tabard":"teal"}',
      sources: '["adblock:pihole","dns","host","streams:jellyfin","wan"]',
      imports: 1,
      checks: 2,
      displays: 1,
    });
  });

  it("is accepted with a charset on the content type", async () => {
    for (const type of ["application/json; charset=utf-8", "Application/JSON;charset=UTF-8", "application/json"]) {
      await assertEmpty(await send(post(valid(), { headers: { "Content-Type": type } })), 204);
    }
  });

  it("is accepted with a byte order mark", async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(JSON.stringify(valid()))]);
    await assertEmpty(await send(request({ body, headers: { "Content-Type": "application/json" } })), 204);
  });

  it("is the entry module's only export, as the runtime requires", () => {
    assert.deepEqual(Object.keys(entry), ["default"]);
  });

  it("is accepted through the default export, on the Worker's own clock", async () => {
    const before = Date.now();
    const res = await worker.fetch(post(valid()), f.env);
    await assertEmpty(res, 204);
    const row = f.db.rows()[0]!;
    assert.ok((row.received_at as number) >= before && (row.received_at as number) <= Date.now());
    assert.equal(row.day, new Date(row.received_at as number).toISOString().slice(0, 10));
  });
});

describe("the upsert", () => {
  it("keeps one row per install per day, the day's last heartbeat winning", async () => {
    await send(post({ ...valid(), uptime_hours: 1 }, { cf: { country: "GB" } }), NOON);
    await send(post({ ...valid(), uptime_hours: 7, world: null }, { cf: { country: "FR" } }), NOON + 6 * 3600_000);
    const rows = f.db.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.uptime_hours, 7);
    assert.equal(rows[0]!.world, null);
    assert.equal(rows[0]!.country, "FR");
    assert.equal(rows[0]!.received_at, NOON + 6 * 3600_000);
  });

  it("starts a new row at midnight UTC", async () => {
    const late = Date.UTC(2026, 10, 22, 23, 59, 59);
    await send(post(valid()), late);
    await send(post(valid()), late + 1000);
    assert.deepEqual(f.db.rows().map((r) => r.day), ["2026-11-22", "2026-11-23"]);
  });

  it("keeps installs apart", async () => {
    await send(post(valid()));
    await send(post({ ...valid(), install_id: "0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e" }));
    assert.equal(f.db.rows().length, 2);
  });

  it("takes the day from the Worker's clock, whatever the body says", async () => {
    await send(post({ ...valid(), day: "1999-01-01", received_at: 1, timestamp: "2030-01-01T00:00:00Z" }));
    const row = f.db.rows()[0]!;
    assert.equal(row.day, "2026-11-22");
    assert.equal(row.received_at, NOON);
  });

  it("only ever writes", async () => {
    await send(post(valid()));
    await send(post(valid()));
    assert.ok(f.db.statements.length > 0);
    for (const sql of f.db.statements) {
      assert.match(sql, /^INSERT INTO heartbeats /);
      assert.doesNotMatch(sql, /\bSELECT\b|\bRETURNING\b/i);
    }
  });
});

describe("the country", () => {
  const cases: [string, Record<string, unknown> | undefined, string | null][] = [
    ["a country", { country: "DE" }, "DE"],
    ["XX, unknown", { country: "XX" }, null],
    ["T1, the Tor network", { country: "T1" }, null],
    ["no country", {}, null],
    ["no cf at all", undefined, null],
  ];
  for (const [label, cf, stored] of cases) {
    it(`stores ${JSON.stringify(stored)} for ${label}`, async () => {
      await assertEmpty(await send(post(valid(), cf === undefined ? {} : { cf })), 204);
      assert.equal(f.db.rows()[0]!.country, stored);
    });
  }
});

describe("the connecting address", () => {
  it("is the rate limiter's key and nothing else, never stored", async () => {
    await send(post({ ...valid(), note: ADDRESS }, { cf: { country: "GB", clientTcpRtt: 9 } }));
    assert.deepEqual(f.limiter.keys, [ADDRESS]);
    const dump = JSON.stringify(f.db.sqlite.prepare("SELECT * FROM heartbeats").all());
    assert.equal(dump.includes(ADDRESS), false);
    assert.equal(dump.includes("192.0.2"), false);
  });

  it("has no column in the schema", () => {
    const columns = f.db.sqlite.prepare("PRAGMA table_info(heartbeats)").all().map((c) => c.name);
    assert.deepEqual(columns, [...COLUMNS]);
    for (const name of columns) {
      assert.doesNotMatch(String(name), /ip|addr|host|agent/i);
    }
  });

  it("is keyed as unknown when the header is absent, as under wrangler dev", async () => {
    const req = post(valid());
    req.headers.delete("CF-Connecting-IP");
    await assertEmpty(await send(req), 204);
    assert.deepEqual(f.limiter.keys, ["unknown"]);
  });

  it("is never logged: the Worker's source calls no console method", () => {
    const src = join(import.meta.dirname, "..", "src");
    for (const file of readdirSync(src)) {
      const source = readFileSync(join(src, file), "utf8");
      assert.doesNotMatch(source, /\bconsole\b/, file);
    }
  });
});

describe("the rate limit", () => {
  it("is 429 with no body and no write", async () => {
    f.limiter.allow = false;
    await assertEmpty(await send(post(valid())), 429);
    assert.equal(f.db.rows().length, 0);
  });

  it("is checked before the body is read", async () => {
    f.limiter.allow = false;
    await assertEmpty(await send(post("{broken")), 429);
  });
});

describe("methods and paths", () => {
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    it(`${method} on the path is 405, allowing POST alone`, async () => {
      const res = await send(request({ method }));
      await assertEmpty(res, 405);
      assert.equal(res.headers.get("Allow"), "POST");
      assert.deepEqual(f.limiter.keys, []);
    });
  }

  const paths = ["/", "/v1", "/v1/", "/v1/heartbeat/", "/v1/Heartbeat", "/V1/heartbeat", "/v2/heartbeat", "/v1/ping", "/heartbeat", "/.env", "/v1/heartbeat/rows", "/v1/heartbeat.json"];
  for (const path of paths) {
    for (const method of ["GET", "POST"]) {
      it(`${method} ${path} is 404 with no body`, async () => {
        const req = method === "POST" ? post(valid(), { path }) : request({ method, path });
        const res = await send(req);
        await assertEmpty(res, 404);
        assert.equal(res.headers.get("Content-Type"), null);
        assert.deepEqual(f.limiter.keys, []);
        assert.equal(f.db.rows().length, 0);
      });
    }
  }

  it("ignores a query string", async () => {
    await assertEmpty(await send(post(valid(), { path: "/v1/heartbeat?debug=1" })), 204);
  });
});

describe("the size cap", () => {
  it(`accepts exactly ${MAX_BODY_BYTES} bytes`, async () => {
    await assertEmpty(await send(post(sized(MAX_BODY_BYTES))), 204);
  });

  it(`refuses ${MAX_BODY_BYTES + 1} bytes with 413`, async () => {
    await assertEmpty(await send(post(sized(MAX_BODY_BYTES + 1))), 413);
    assert.equal(f.db.rows().length, 0);
  });

  it("refuses a declared length over the cap before reading", async () => {
    const req = post(valid(), { headers: { "Content-Length": String(MAX_BODY_BYTES + 1) } });
    await assertEmpty(await send(req), 413);
    assert.equal(req.bodyUsed, false);
  });

  it("refuses a body over the cap whose declared length is small", async () => {
    const req = post(sized(MAX_BODY_BYTES + 100), { headers: { "Content-Length": "10" } });
    await assertEmpty(await send(req), 413);
  });

  it("refuses a streamed body with no length that passes the cap", async () => {
    const chunk = new Uint8Array(1024).fill(0x20);
    const req = request({
      body: stream([chunk, chunk, chunk, chunk, new Uint8Array([0x20])]),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(req.headers.get("Content-Length"), null);
    await assertEmpty(await send(req), 413);
  });

  it("accepts a streamed body in chunks under the cap", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(valid()));
    const req = request({
      body: stream([bytes.slice(0, 10), bytes.slice(10, 100), bytes.slice(100)]),
      headers: { "Content-Type": "application/json" },
    });
    await assertEmpty(await send(req), 204);
  });

  it("counts bytes, not characters", async () => {
    const wide = JSON.stringify({ ...valid(), pad: "é".repeat(2100) });
    assert.ok(wide.length <= MAX_BODY_BYTES);
    await assertEmpty(await send(post(wide)), 413);
  });
});

describe("the content type", () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", "application/json-patch+json", "application/json; charset=latin1", "json"]) {
    it(`refuses ${type} with 415`, async () => {
      await assertEmpty(await send(post(valid(), { headers: { "Content-Type": type } })), 415);
      assert.equal(f.db.rows().length, 0);
    });
  }

  it("refuses a body with no content type with 415", async () => {
    const req = request({ body: new TextEncoder().encode(JSON.stringify(valid())) });
    assert.equal(req.headers.get("Content-Type"), null);
    await assertEmpty(await send(req), 415);
  });
});

describe("a body that is not JSON", () => {
  for (const [label, body] of [
    ["broken JSON", '{"schema": 1,'],
    ["an empty body", ""],
    ["plain words", "heartbeat"],
    ["JSON with a trailing comma", JSON.stringify(valid()).replace(/}$/, ",}")],
  ] as const) {
    it(`refuses ${label} with 415`, async () => {
      await assertEmpty(await send(post(body)), 415);
    });
  }

  it("refuses bytes that are not UTF-8 with 415", async () => {
    const text = JSON.stringify(valid()).replace('"medieval"', '"medi\u0000val"');
    const bytes = new TextEncoder().encode(text);
    bytes[bytes.indexOf(0)] = 0xff;
    await assertEmpty(await send(request({ body: bytes, headers: { "Content-Type": "application/json" } })), 415);
  });
});

describe("a refused heartbeat", () => {
  async function refusal(body: unknown): Promise<unknown> {
    const res = await send(post(body));
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("Content-Type"), "application/json");
    return res.json();
  }

  it("names a missing field", async () => {
    const body = valid();
    delete body.look;
    assert.deepEqual(await refusal(body), { error: "missing", field: "look" });
  });

  it("names a malformed field", async () => {
    assert.deepEqual(await refusal({ ...valid(), items: ["b", "a"] }), { error: "invalid", field: "items" });
  });

  it("names the first bad field alone", async () => {
    assert.deepEqual(await refusal({ ...valid(), version: "", displays: -1 }), { error: "invalid", field: "version" });
  });

  it("says so when the JSON is not an object", async () => {
    for (const body of [JSON.stringify([valid()]), '"heartbeat"', "1", "null"]) {
      assert.deepEqual(await refusal(body), { error: "not_object" });
    }
  });

  it("writes nothing", async () => {
    await refusal({ ...valid(), schema: 2 });
    assert.equal(f.db.rows().length, 0);
    assert.equal(f.db.statements.length, 0);
  });

  it("echoes nothing it was sent", async () => {
    const res = await send(post({ ...valid(), install_id: "wall.example.com" }));
    const text = await res.text();
    assert.equal(text, '{"error":"invalid","field":"install_id"}');
  });
});

describe("a database failure", () => {
  it("is 500 with no body, and nothing is logged", async () => {
    f.db.failing = true;
    await assertEmpty(await send(post(valid())), 500);
  });
});
