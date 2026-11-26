// Tests for the website's Worker, site/src/index.mjs, and its configuration, site/wrangler.jsonc:
// the redirect from www to the apex, the headers on what the static files answer, no logging, and
// the Worker's reach (its two hostnames, no workers.dev or preview address, observability off).
// Run with: node --test 'tests/site/**/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../../site/src/index.mjs';
import { headersFor, siteCsp, DEMO_CSP } from '../../site/headers.mjs';

const read = p => fs.readFileSync(new URL('../../site/' + p, import.meta.url), 'utf8');
// the Web Analytics token the Worker reads from site.json, '' while there is none
const TOKEN = JSON.parse(read('site.json')).analyticsToken || '';
/* The static files' binding, answering every request with `status` and recording each. */
const assets = (status = 200) => {
  const seen = [];
  return { seen, ASSETS: { fetch: async req => { seen.push(new URL(req.url).pathname); return new Response(status === 404 ? 'not found' : 'ok', { status, headers: { 'Content-Type': 'text/html', ETag: '"x"' } }); } } };
};

test('www.knightwatcher.io answers 301 to the same path and query on the apex, without the files', async () => {
  for (const [from, to] of [
    ['https://www.knightwatcher.io/', 'https://knightwatcher.io/'],
    ['https://www.knightwatcher.io/privacy/?a=1&b=2#x', 'https://knightwatcher.io/privacy/?a=1&b=2'],
    ['https://www.knightwatcher.io/demo/?demo', 'https://knightwatcher.io/demo/?demo'],
    ['http://www.knightwatcher.io/art-licence/', 'https://knightwatcher.io/art-licence/']]) {
    const env = assets();
    const res = await worker.fetch(new Request(from), env);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to, from);
    assert.deepEqual(env.seen, [], 'the redirect reads no file');
  }
});

test('the apex passes each request to the files and sets the headers for its path', async () => {
  for (const [url, csp, frame] of [
    ['https://knightwatcher.io/', siteCsp(TOKEN), 'DENY'],
    ['https://knightwatcher.io/privacy/', siteCsp(TOKEN), 'DENY'],
    ['https://knightwatcher.io/demo/?demo', DEMO_CSP, 'SAMEORIGIN'],
    ['https://knightwatcher.io/demo/js/main.js', DEMO_CSP, 'SAMEORIGIN']]) {
    const env = assets();
    const res = await worker.fetch(new Request(url), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
    assert.equal(res.headers.get('content-security-policy'), csp, url);
    assert.equal(res.headers.get('x-frame-options'), frame, url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('etag'), '"x"', 'the files\' own headers are kept');
    assert.deepEqual(env.seen, [new URL(url).pathname]);
  }
  // the 404 page keeps its status
  const res = await worker.fetch(new Request('https://knightwatcher.io/no-such-page'), assets(404));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-security-policy'), siteCsp(TOKEN));
  assert.deepEqual(headersFor('/demo'), headersFor('/demo/x'));
  assert.notDeepEqual(headersFor('/demonstration'), headersFor('/demo/'));
});

test('the Worker logs nothing and reads nothing but the files', () => {
  const src = read('src/index.mjs');
  assert.doesNotMatch(src, /console\.|fetch\((?!request)/);
  assert.match(src, /env\.ASSETS\.fetch\(request\)/);
});

test('wrangler.jsonc: the name, the files, the two hostnames alone, observability off, no cron', () => {
  const conf = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(conf.name, 'knightwatcher-site');
  assert.equal(conf.main, 'src/index.mjs');
  assert.deepEqual(conf.assets, { directory: './dist', binding: 'ASSETS', run_worker_first: true, not_found_handling: '404-page', html_handling: 'auto-trailing-slash' });
  assert.deepEqual(conf.observability, { enabled: false });
  assert.equal(conf.workers_dev, false);
  assert.equal(conf.preview_urls, false);
  assert.deepEqual(conf.routes, [{ pattern: 'knightwatcher.io', custom_domain: true }, { pattern: 'www.knightwatcher.io', custom_domain: true }]);
  assert.deepEqual(conf.triggers, { crons: [] });
  for (const k of ['logpush', 'tail_consumers', 'vars', 'd1_databases', 'kv_namespaces', 'r2_buckets', 'services']) assert.equal(conf[k], undefined, k);
});
