// Tests for the page's start-up, web/js/main.js: which calls it makes to the display's server in
// each mode, and the hash listener that opens the settings screen. Run with: node --test tests/web/
//
// main.js runs in a sandbox with the real KW.state and stand-ins for everything else: the drawing,
// the engine, the demo, the knight, the world and the settings are objects that take any call, and
// fetch, the timers and the address are recorded. Every timer main.js sets is then run once, so a
// call made on a timer is seen as well as one made at load.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');
const STATE = fs.readFileSync(path.join(WEB, 'js/state.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(WEB, 'js/main.js'), 'utf8');

/* An object that takes anything: every property is itself, every call returns it, and it reads as
   the number 1 where a number is wanted. */
function anything() {
  const p = new Proxy(function () {}, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 1; if (k === Symbol.iterator) return undefined; return p; },
    set() { return true; },
    apply() { return p; },
    construct() { return p; }
  });
  return p;
}
/* anything(), with some properties of its own. */
const withOwn = own => new Proxy(own, { get: (t, k) => (k in t ? t[k] : anything()) });

/* Runs main.js at the address `href`, with the page's version `version`. Returns what it did. */
function run(href, version = 'dev') {
  const u = new URL(href);
  const rec = { fetched: [], timers: [], listeners: {}, opened: [], connected: 0, replaced: [] };
  const location = { protocol: u.protocol, search: u.search, pathname: u.pathname, hash: u.hash, reload() {} };
  const screen = { open: page => rec.opened.push(page), isOpen: () => false, note() {}, cue() {} };
  const KW = {
    view: anything(), engine: anything(), demo: anything(), world: anything(), draw: anything(),
    knight: withOwn({ fetchPacks: f => { f('data/packs/index.json', {}); return anything(); } }),
    settings: withOwn({
      isLong: () => false,
      mount: () => screen,
      connect: o => { rec.connected += 1; return { poll: () => o.request('GET') }; }
    })
  };
  const ctx = {
    KW, location, console,
    history: { replaceState: (s, t, url) => { rec.replaced.push(url); location.hash = new URL(url, href).hash; } },
    document: withOwn({
      querySelector: sel => (/kw-version/.test(sel) ? { content: version } : anything()),
      addEventListener: () => {}, visibilityState: 'visible', fullscreenEnabled: false
    }),
    navigator: {}, performance: { now: () => 0 }, crypto: { getRandomValues: a => a },
    getComputedStyle: () => anything(), requestAnimationFrame: () => 0,
    fetch: url => { rec.fetched.push(url); return new Promise(() => {}); },
    setInterval: (f, ms) => { rec.timers.push([f, ms]); return rec.timers.length; },
    setTimeout: (f, ms) => { rec.timers.push([f, ms]); return rec.timers.length; },
    clearTimeout: () => {}, clearInterval: () => {},
    AbortController, URLSearchParams, URL, Uint8Array, Promise, JSON, Math, Date
  };
  ctx.window = ctx;
  ctx.addEventListener = (type, fn) => { (rec.listeners[type] = rec.listeners[type] || []).push(fn); };
  vm.createContext(ctx);
  vm.runInContext(STATE, ctx, { filename: 'state.js' });
  vm.runInContext(MAIN, ctx, { filename: 'main.js' });
  // every timer once: the polls, the check-in and the version check
  for (const [f] of rec.timers.splice(0)) { try { f(); } catch (e) { /* a stand-in may refuse */ } }
  rec.hash = h => { location.hash = h; for (const fn of rec.listeners.hashchange || []) fn(); };
  rec.location = location;
  return rec;
}

const api = rec => rec.fetched.filter(u => /^api\//.test(u));

test('served without ?demo, the page asks for the state file, the shared settings and checks in', () => {
  const rec = run('http://192.0.2.5:8080/');
  assert.ok(rec.fetched.includes('data/state.json'), rec.fetched.join(' '));
  assert.ok(rec.fetched.includes('api/settings'));
  assert.ok(rec.fetched.includes('api/displays'));
  assert.equal(rec.connected, 1);
});

test('?demo makes no call to the display\'s server: no state file, nothing under api/', () => {
  for (const href of ['https://knightwatcher.io/demo/?demo#demo=1&bar=0', 'http://192.0.2.5:8080/?demo', 'http://192.0.2.5:8080/index.html?demo&o=1#set=knight']) {
    for (const version of ['dev', 'abc123def456']) {
      const rec = run(href, version);
      assert.deepEqual(api(rec), [], href);
      assert.ok(!rec.fetched.includes('data/state.json'), href);
      assert.equal(rec.connected, 0, 'the shared settings are not connected: ' + href);
      // what is left is static: the downloaded packs' list and, on a stamped page, version.json
      assert.deepEqual(rec.fetched.filter(u => u !== 'data/packs/index.json' && u !== 'version.json'), [], href);
      assert.equal(rec.fetched.includes('version.json'), version !== 'dev');
    }
  }
});

test('from disk the page fetches nothing', () => {
  assert.deepEqual(run('file:///srv/kw/web/index.html').fetched, []);
  assert.deepEqual(run('file:///srv/kw/web/index.html?demo').fetched, []);
});

test('the source keeps the forced demo off the server: one switch, talks, gates every call', () => {
  assert.match(MAIN, /const talks = !fromDisk && !forceDemo;/);
  assert.match(MAIN, /cache: talks \}\);/);
  assert.match(MAIN, /const sync = !talks \? null : KW\.settings\.connect\(/);
  assert.match(MAIN, /if \(talks\) ST\.start\(onView\);/);
  assert.doesNotMatch(MAIN, /setInterval\(sync\.poll/);
});

test('a change of the hash to one with set=<page> opens the settings screen there, again and again', () => {
  const rec = run('https://knightwatcher.io/demo/?demo#demo=1&bar=0');
  assert.deepEqual(rec.opened, []);
  rec.hash('#on=&is=battlement&bar=0&demo=1&set=knight');
  assert.deepEqual(rec.opened, ['knight']);
  // the set= is taken out of the hash, the rest left as it was
  assert.equal(rec.location.hash, '#on=&is=battlement&bar=0&demo=1');
  assert.deepEqual(rec.replaced, ['/demo/?demo#on=&is=battlement&bar=0&demo=1']);
  // so the same change opens it a second time
  rec.hash('#on=&is=battlement&bar=0&demo=1&set=knight');
  assert.deepEqual(rec.opened, ['knight', 'knight']);
  // any page, first in the hash too
  rec.hash('#set=pet&demo=1');
  assert.deepEqual(rec.opened, ['knight', 'knight', 'pet']);
  assert.equal(rec.location.hash, '#demo=1');
  // set= alone leaves no hash at all
  rec.hash('#set=status');
  assert.equal(rec.replaced[rec.replaced.length - 1], '/demo/?demo');
  // set=hold is the screenshots' cue at load and does nothing here, nor does a hash without set=
  const n = rec.opened.length;
  rec.hash('#demo=1&set=hold');
  rec.hash('#demo=1&is=camp');
  rec.hash('#demo=1&set=');
  assert.equal(rec.opened.length, n);
});

test('the hash listener works on a live display too, and set= at load still opens the screen once', () => {
  const rec = run('http://192.0.2.5:8080/#set=display');
  assert.deepEqual(rec.opened, ['display']);
  rec.hash('#set=world');
  assert.deepEqual(rec.opened, ['display', 'world']);
});
