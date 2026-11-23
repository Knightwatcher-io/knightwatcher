/**
 * The request handler: routing, the rate limit, the body's checks, the upsert, and the delete of
 * rows past the keeping period.
 *
 * One route, `POST /v1/heartbeat`, and it only writes. No route returns a row, a count or
 * anything else from the database: the hostname has to stay public for installs to reach it,
 * and a path that reads would put the table one bug away from anyone who asks. The figures are
 * read by a separate, private Worker bound to the same D1 database.
 *
 * The connecting address is the rate limiter's key and is used for nothing else. It is never
 * stored, and this Worker logs nothing at all.
 *
 * docs/telemetry.md is the public description this code has to stay true to. index.ts is the
 * Worker's entry and exports nothing but the handler, since the runtime takes every export of
 * the entry module for an entrypoint.
 */

import {
  buildRow,
  COLUMNS,
  countryOf,
  cutoffOf,
  EXPIRE_SQL,
  parseHeartbeat,
  UPSERT_SQL,
} from "./payload.ts";

export interface Env {
  DB: D1Database;
  HEARTBEAT_LIMITER: RateLimit;
}

export const PATH = "/v1/heartbeat";

/** The contract's cap on a body, in bytes. */
export const MAX_BODY_BYTES = 4096;

function empty(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

function refusal(body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

/** `application/json`, with any parameters, so long as a charset given is UTF-8. */
export function isJsonContentType(header: string | null): boolean {
  if (header === null) {
    return false;
  }
  const [type, ...params] = header.split(";").map((part) => part.trim().toLowerCase());
  if (type !== "application/json") {
    return false;
  }
  return params.every((param) => {
    const [name, value] = param.split("=").map((part) => part.trim());
    return name !== "charset" || value === "utf-8" || value === "utf8" || value === '"utf-8"';
  });
}

/**
 * Reads the body, stopping as soon as it passes `max` bytes, so a large or endless body is never
 * held in memory whatever its Content-Length said. Returns null when it is over the cap.
 */
export async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (request.body === null) {
    return new Uint8Array(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The JSON in a body of UTF-8, or undefined when it is not UTF-8 or not JSON. */
function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return undefined;
  }
}

async function receive(request: Request, env: Env, now: number): Promise<Response> {
  // A flood guard alone. The address decides this one call and goes nowhere else.
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.HEARTBEAT_LIMITER.limit({ key: address });
  if (!success) {
    return empty(429);
  }

  const declared = request.headers.get("Content-Length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    return empty(413);
  }
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return empty(415);
  }

  // The declared length can be absent or wrong, so the bytes actually read are capped too.
  const bytes = await readCapped(request, MAX_BODY_BYTES);
  if (bytes === null) {
    return empty(413);
  }
  const body = decodeJson(bytes);
  if (body === undefined) {
    return empty(415);
  }

  const parsed = parseHeartbeat(body);
  if (!parsed.ok) {
    return parsed.problem === "not_object"
      ? refusal({ error: "not_object" })
      : refusal({ error: parsed.problem, field: parsed.field });
  }

  const row = buildRow(parsed.heartbeat, now, countryOf(request.cf));
  await env.DB.prepare(UPSERT_SQL)
    .bind(...COLUMNS.map((column) => row[column]))
    .run();

  // Once the row is stored, the rows past the keeping period go. A statement of its own, not a
  // batch with the upsert, so a delete that fails cannot take the row back with it. Its failure
  // is not the heartbeat's: the answer is still 204, nothing is logged, and the next heartbeat
  // deletes the same rows. It is awaited, so it finishes within this request.
  try {
    await env.DB.prepare(EXPIRE_SQL).bind(cutoffOf(now)).run();
  } catch {
    // Swallowed on purpose.
  }
  return empty(204);
}

/** The whole Worker, with the clock passed in so the tests can set the day. */
export async function handle(request: Request, env: Env, now: number): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== PATH) {
    return empty(404);
  }
  if (request.method !== "POST") {
    return empty(405, { Allow: "POST" });
  }
  try {
    return await receive(request, env, now);
  } catch {
    // Nothing is logged and nothing is said: an error body on a public host tells a stranger
    // about the inside, and a log line could carry the request.
    return empty(500);
  }
}
