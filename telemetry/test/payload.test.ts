import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRow,
  COLUMNS,
  countryOf,
  cutoffOf,
  dayOf,
  FIELDS,
  KEEP_MONTHS,
  parseHeartbeat,
  type Heartbeat,
} from "../src/payload.ts";
import { NOON, valid } from "./helpers.ts";

function parse(overrides: Record<string, unknown>) {
  return parseHeartbeat({ ...valid(), ...overrides });
}

function accepted(overrides: Record<string, unknown> = {}): Heartbeat {
  const result = parse(overrides);
  if (!result.ok) {
    throw new Error(`expected a valid heartbeat, got ${JSON.stringify(result)}`);
  }
  return result.heartbeat;
}

function assertRefused(field: string, value: unknown) {
  assert.deepEqual(
    parse({ [field]: value }),
    { ok: false, problem: "invalid", field },
    `${field} = ${JSON.stringify(value)} should be refused`,
  );
}

function assertAccepted(field: string, value: unknown) {
  const result = parse({ [field]: value });
  assert.equal(result.ok, true, `${field} = ${JSON.stringify(value)} should be accepted`);
}

const ids = (n: number, make: (i: number) => string = (i) => `i${String(i).padStart(2, "0")}`) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("a valid heartbeat", () => {
  it("is accepted as it stands", () => {
    assert.equal(parseHeartbeat(valid()).ok, true);
  });

  it("keeps each documented field's value", () => {
    const hb = accepted();
    for (const field of FIELDS) {
      if (field !== "look") {
        assert.deepEqual(hb[field], valid()[field], field);
      }
    }
    assert.deepEqual(hb.look, { hair: "brown", tabard: "teal" });
  });
});

describe("a body that is not an object", () => {
  for (const body of [null, [], [valid()], "heartbeat", 1, true]) {
    it(`refuses ${JSON.stringify(body)}`, () => {
      assert.deepEqual(parseHeartbeat(body), { ok: false, problem: "not_object" });
    });
  }
});

describe("a missing field", () => {
  for (const field of FIELDS) {
    it(`refuses a heartbeat without ${field}, naming it`, () => {
      const body = valid();
      delete body[field];
      assert.deepEqual(parseHeartbeat(body), { ok: false, problem: "missing", field });
    });
  }

  it("names the first missing field in the documented order", () => {
    const body = valid();
    delete body.displays;
    delete body.version;
    assert.deepEqual(parseHeartbeat(body), { ok: false, problem: "missing", field: "version" });
  });

  it("names the first bad field when one is missing and an earlier one malformed", () => {
    const body: Record<string, unknown> = { ...valid(), install_id: "nope" };
    delete body.items;
    assert.deepEqual(parseHeartbeat(body), { ok: false, problem: "invalid", field: "install_id" });
  });
});

describe("schema", () => {
  it("accepts 1, also written as 1.0", () => {
    assertAccepted("schema", 1);
    assert.equal(parseHeartbeat(JSON.parse(JSON.stringify(valid()).replace('"schema":1', '"schema":1.0'))).ok, true);
  });
  for (const bad of [0, 2, -1, 1.5, "1", true, null, [1], {}]) {
    it(`refuses ${JSON.stringify(bad)}`, () => assertRefused("schema", bad));
  }
});

describe("install_id", () => {
  it("accepts a lowercase UUID version 4 of each variant", () => {
    for (const variant of ["8", "9", "a", "b"]) {
      assertAccepted("install_id", `6f1c2b9e-3d4a-4e8f-${variant}a7b-0c5d1e2f3a4b`);
    }
  });
  for (const bad of [
    "6F1C2B9E-3D4A-4E8F-9A7B-0C5D1E2F3A4B", // upper case
    "6f1c2b9e-3d4a-1e8f-9a7b-0c5d1e2f3a4b", // version 1
    "6f1c2b9e-3d4a-4e8f-ca7b-0c5d1e2f3a4b", // another variant
    "6f1c2b9e3d4a4e8f9a7b0c5d1e2f3a4b", // no hyphens
    "{6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b}",
    " 6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b",
    "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4",
    "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4bc",
    "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4g",
    "",
    42,
    null,
    true,
    [],
  ]) {
    it(`refuses ${JSON.stringify(bad)}`, () => assertRefused("install_id", bad));
  }
});

describe("version", () => {
  for (const good of ["a", "a1b2c3d4e5f6", "1.2.3-rc.1+build_7", "x".repeat(40), "A.B-C_D+E"]) {
    it(`accepts ${JSON.stringify(good)}`, () => assertAccepted("version", good));
  }
  for (const bad of ["", "x".repeat(41), "1 2", "1/2", "1;2", "é", "1.0\n", 1, null, true, ["1"]]) {
    it(`refuses ${JSON.stringify(bad)}`, () => assertRefused("version", bad));
  }
});

const COUNTS: [string, number][] = [
  ["install_age_days", 100_000],
  ["uptime_hours", 1_000_000],
  ["imports", 16],
  ["checks", 64],
  ["displays", 1000],
];

for (const [field, max] of COUNTS) {
  describe(field, () => {
    it(`accepts 0 and ${max}`, () => {
      assertAccepted(field, 0);
      assertAccepted(field, max);
    });
    for (const bad of [-1, max + 1, 1.5, "1", true, null, [1], {}]) {
      it(`refuses ${JSON.stringify(bad)}`, () => assertRefused(field, bad));
    }
  });
}

for (const field of ["world", "build"]) {
  describe(field, () => {
    for (const good of [null, "medieval", "custom", "a", "a_b-c9", "x".repeat(40)]) {
      it(`accepts ${JSON.stringify(good)}`, () => assertAccepted(field, good));
    }
    for (const bad of ["", "x".repeat(41), "Medieval", "kw.base/medieval", "a.b", "a b", 1, true, [], {}]) {
      it(`refuses ${JSON.stringify(bad)}`, () => assertRefused(field, bad));
    }
  });
}

describe("items", () => {
  for (const good of [[], ["custom"], ["a", "b", "custom"], ["a-b", "a_b"], ids(32), ["x".repeat(40)]]) {
    it(`accepts ${good.length} items like ${JSON.stringify(good.slice(0, 3))}`, () =>
      assertAccepted("items", good));
  }
  for (const bad of [
    ids(33),
    ["b", "a"],
    ["a", "a"],
    ["custom", "custom"],
    ["A"],
    ["main.arming"],
    ["kw.base/main.arming"],
    [""],
    ["x".repeat(41)],
    [1],
    [null],
    [["a"]],
    "a",
    null,
    {},
  ]) {
    it(`refuses ${JSON.stringify(bad).slice(0, 60)}`, () => assertRefused("items", bad));
  }
});

describe("look", () => {
  const entries = (n: number) => Object.fromEntries(ids(n).map((k) => [k, "v"]));
  for (const good of [{}, { tabard: "teal" }, { tabard: "custom" }, entries(32), { ["k".repeat(40)]: "v".repeat(40) }]) {
    it(`accepts ${Object.keys(good).length} parts`, () => assertAccepted("look", good));
  }
  for (const bad of [
    entries(33),
    { Tabard: "teal" },
    { tabard: "Teal" },
    { tabard: "kw.base/teal" },
    { "": "teal" },
    { tabard: "" },
    { ["k".repeat(41)]: "v" },
    { tabard: "v".repeat(41) },
    { tabard: 1 },
    { tabard: null },
    { tabard: ["teal"] },
    { tabard: { colour: "teal" } },
    [],
    [["tabard", "teal"]],
    null,
    "tabard",
  ]) {
    it(`refuses ${JSON.stringify(bad).slice(0, 60)}`, () => assertRefused("look", bad));
  }

  it("keeps a part named __proto__ as data", () => {
    const body = JSON.parse(JSON.stringify(valid()).replace('"look":{', '"look":{"__proto__":"teal",'));
    const result = parseHeartbeat(body);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(Object.getPrototypeOf(result.heartbeat.look), Object.prototype);
      assert.equal(JSON.parse(buildRow(result.heartbeat, NOON, null).look as string).__proto__, "teal");
    }
  });
});

describe("sources", () => {
  const many = (n: number) => ids(n, (i) => `s${String(i).padStart(2, "0")}`);
  for (const good of [
    [],
    ["host"],
    ["dns", "host", "streams:jellyfin"],
    ["kind:custom"],
    ["a_b:c_d"],
    [`${"a".repeat(32)}:${"b".repeat(32)}`],
    many(48),
  ]) {
    it(`accepts ${JSON.stringify(good.slice(0, 3))}${good.length > 3 ? ` (${good.length})` : ""}`, () =>
      assertAccepted("sources", good));
  }
  for (const bad of [
    many(49),
    ["host", "dns"],
    ["dns", "dns"],
    ["a-b"],
    ["streams:"],
    [":jellyfin"],
    ["a:b:c"],
    ["Streams:jellyfin"],
    ["streams:Jellyfin"],
    ["imports:my-sonarr"],
    ["a".repeat(33)],
    [`a:${"b".repeat(33)}`],
    [""],
    [1],
    "host",
    null,
    {},
  ]) {
    it(`refuses ${JSON.stringify(bad).slice(0, 60)}`, () => assertRefused("sources", bad));
  }
});

describe("unknown fields", () => {
  it("are dropped, and the heartbeat is still accepted", () => {
    const result = parseHeartbeat({
      ...valid(),
      hostname: "wall.example.com",
      address: "192.0.2.44",
      future_count: 7,
      nested: { secret: "s3cret" },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(Object.keys(result.heartbeat).sort(), [...FIELDS].sort());
      const row = JSON.stringify(buildRow(result.heartbeat, NOON, "GB"));
      for (const dropped of ["wall.example.com", "192.0.2.44", "future_count", "s3cret"]) {
        assert.equal(row.includes(dropped), false, dropped);
      }
    }
  });

  it("are dropped when named __proto__ too", () => {
    const body = JSON.parse(JSON.stringify(valid()).replace("{", '{"__proto__":{"polluted":1},'));
    const result = parseHeartbeat(body);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(Object.keys(result.heartbeat).sort(), [...FIELDS].sort());
      assert.equal((result.heartbeat as unknown as Record<string, unknown>).polluted, undefined);
    }
  });
});

describe("countryOf", () => {
  it("stores the two letters Cloudflare gives", () => {
    assert.equal(countryOf({ country: "GB" }), "GB");
    assert.equal(countryOf({ country: "DE", city: "Berlin" }), "DE");
  });
  for (const cf of [{ country: "XX" }, { country: "T1" }]) {
    it(`stores ${cf.country} as null`, () => assert.equal(countryOf(cf), null));
  }
  for (const cf of [undefined, null, {}, { country: null }, { country: "gb" }, { country: "GBR" }, { country: "G" }, { country: 44 }, "GB"]) {
    it(`stores null for ${JSON.stringify(cf)}`, () => assert.equal(countryOf(cf), null));
  }
});

describe("dayOf", () => {
  it("is the UTC date of the Worker's clock", () => {
    assert.equal(dayOf(NOON), "2026-11-22");
  });
  it("turns at midnight UTC", () => {
    assert.equal(dayOf(Date.UTC(2026, 10, 22, 23, 59, 59, 999)), "2026-11-22");
    assert.equal(dayOf(Date.UTC(2026, 10, 23, 0, 0, 0, 0)), "2026-11-23");
  });
});

describe("cutoffOf", () => {
  const at = (iso: string) => cutoffOf(Date.parse(iso));

  it("keeps 24 months", () => {
    assert.equal(KEEP_MONTHS, 24);
  });
  it("is the same calendar date two years before the UTC day", () => {
    assert.equal(cutoffOf(NOON), "2024-11-22");
    assert.equal(at("2028-11-23T00:00:00Z"), "2026-11-23");
    assert.equal(at("2028-11-24T09:30:00Z"), "2026-11-24");
    assert.equal(at("2027-07-31T12:00:00Z"), "2025-07-31");
  });
  it("turns at midnight UTC, with the day", () => {
    assert.equal(at("2028-11-23T23:59:59.999Z"), "2026-11-23");
    assert.equal(at("2028-11-24T00:00:00.000Z"), "2026-11-24");
  });
  it("maps 29 February to 28 February", () => {
    assert.equal(at("2028-02-29T12:00:00Z"), "2026-02-28");
    assert.equal(at("2028-02-28T12:00:00Z"), "2026-02-28");
    assert.equal(at("2028-03-01T00:00:00Z"), "2026-03-01");
  });
  it("keeps a leap day's row through 28 February two years on", () => {
    assert.equal(at("2026-02-28T12:00:00Z"), "2024-02-28");
    assert.equal(at("2026-03-01T12:00:00Z"), "2024-03-01");
  });
  it("crosses a year boundary", () => {
    assert.equal(at("2027-12-31T23:59:59.999Z"), "2025-12-31");
    assert.equal(at("2028-01-01T00:00:00Z"), "2026-01-01");
  });
  it("sorts as text the way the days do", () => {
    // The delete compares day < cutoff as text, which is the date order for YYYY-MM-DD.
    assert.match(at("2028-01-01T00:00:00Z"), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok("2025-12-31" < at("2028-01-01T00:00:00Z"));
  });
});

describe("buildRow", () => {
  it("has exactly the stored columns", () => {
    assert.deepEqual(Object.keys(buildRow(accepted(), NOON, "GB")), [...COLUMNS]);
  });

  it("takes the day and the time from the clock it is given, and the country", () => {
    const row = buildRow(accepted(), NOON, "GB");
    assert.equal(row.day, "2026-11-22");
    assert.equal(row.received_at, NOON);
    assert.equal(row.country, "GB");
    assert.equal(buildRow(accepted(), NOON, null).country, null);
  });

  it("stores the lists and the look as JSON text, the look's keys sorted", () => {
    const row = buildRow(accepted({ look: { tabard: "teal", hair: "brown", back: "cape" } }), NOON, null);
    assert.equal(row.items, '["custom"]');
    assert.equal(row.look, '{"back":"cape","hair":"brown","tabard":"teal"}');
    assert.equal(row.sources, '["adblock:pihole","dns","host","streams:jellyfin","wan"]');
    assert.equal(buildRow(accepted({ items: [], look: {}, sources: [] }), NOON, null).look, "{}");
  });

  it("keeps a null world and build as null", () => {
    const row = buildRow(accepted({ world: null, build: null }), NOON, null);
    assert.equal(row.world, null);
    assert.equal(row.build, null);
  });

  it("has no column that could hold the connecting address", () => {
    for (const column of COLUMNS) {
      assert.equal(/ip|addr|host|agent|ray/i.test(column), false, column);
    }
  });
});
