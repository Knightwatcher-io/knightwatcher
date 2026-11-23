/**
 * What the tests share: a valid heartbeat, a D1 stand-in over node:sqlite with the real
 * schema.sql applied, and a rate limiter that records its keys.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { Env } from "../src/receive.ts";

export const SCHEMA_SQL = readFileSync(join(import.meta.dirname, "..", "schema.sql"), "utf8");

/** A valid heartbeat, with invented values. */
export function valid(): Record<string, unknown> {
  return {
    schema: 1,
    install_id: "6f1c2b9e-3d4a-4e8f-9a7b-0c5d1e2f3a4b",
    version: "a1b2c3d4e5f6",
    install_age_days: 12,
    uptime_hours: 30,
    world: "medieval",
    build: null,
    items: ["custom"],
    look: { tabard: "teal", hair: "brown" },
    sources: ["adblock:pihole", "dns", "host", "streams:jellyfin", "wan"],
    imports: 1,
    checks: 2,
    displays: 1,
  };
}

/** A D1 database as the Worker sees it, backed by SQLite in memory. */
export class FakeD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly statements: string[] = [];
  /** Every statement fails, as an unavailable database would. */
  failing = false;
  /** Only the statements this matches fail. */
  failingOn: RegExp | null = null;

  constructor() {
    this.sqlite.exec(SCHEMA_SQL);
  }

  prepare(sql: string) {
    this.statements.push(sql);
    return {
      bind: (...values: SQLInputValue[]) => ({
        run: async () => {
          if (this.failing || this.failingOn?.test(sql)) {
            throw new Error("D1_ERROR: the database is unavailable");
          }
          this.sqlite.prepare(sql).run(...values);
          return { success: true, meta: {}, results: [] };
        },
      }),
    };
  }

  /** Puts a row straight into the table, as a heartbeat on that day would have left it. */
  seed(installId: string, day: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO heartbeats VALUES (?, ?, ?, NULL, 1, 'v', 0, 0, NULL, NULL, '[]', '{}', '[]', 0, 0, 0)`,
      )
      .run(installId, day, Date.parse(`${day}T12:00:00Z`));
  }

  rows(): Record<string, unknown>[] {
    return this.sqlite.prepare("SELECT * FROM heartbeats ORDER BY install_id, day").all();
  }
}

export class FakeLimiter {
  readonly keys: string[] = [];
  allow = true;

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return { success: this.allow };
  }
}

export interface Fakes {
  env: Env;
  db: FakeD1;
  limiter: FakeLimiter;
}

export function fakes(): Fakes {
  const db = new FakeD1();
  const limiter = new FakeLimiter();
  const env = { DB: db, HEARTBEAT_LIMITER: limiter } as unknown as Env;
  return { env, db, limiter };
}

export const URL_BASE = "https://telemetry.knightwatcher.io";

export interface Send {
  method?: string;
  path?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** What Cloudflare would put in request.cf; left out, the request has none. */
  cf?: Record<string, unknown>;
}

/** A request as Cloudflare hands it to the Worker, from an invented address by default. */
export function request(send: Send = {}): Request {
  const headers = new Headers({ "CF-Connecting-IP": "192.0.2.10", ...send.headers });
  const init: RequestInit & { duplex?: "half" } = {
    method: send.method ?? "POST",
    headers,
    body: send.body ?? null,
  };
  if (send.body instanceof ReadableStream) {
    init.duplex = "half";
  }
  const req = new Request(URL_BASE + (send.path ?? "/v1/heartbeat"), init);
  if (send.cf !== undefined) {
    Object.defineProperty(req, "cf", { value: send.cf });
  }
  return req;
}

/** A JSON heartbeat, as the collector sends it. */
export function post(body: unknown, extra: Omit<Send, "body"> = {}): Request {
  return request({
    ...extra,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...extra.headers },
  });
}

/** A body streamed in chunks, with no Content-Length. */
export function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

/** The noon of a UTC day, in milliseconds. */
export const NOON = Date.UTC(2026, 10, 22, 12, 0, 0);
