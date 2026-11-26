// Tests for the shared settings in web/js/settings.js: the server's form (sharedOf), the store's
// sources of its saved level (this browser, the copy of the shared settings, the server), and
// connect(), which keeps a store in step with the server's api/settings: the first answer, the
// carry-over of a browser's own choices, a page with no server behind it, choices sent with PUT,
// a refused write, and two displays sharing one server.
// Run with: node --test 'tests/web/**/*.test.js'
//
// The server here is a fake that keeps the settings as the real one does (server/store.py), and
// answers each request when the test lets it, so that the order of answers can be chosen.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SET = require('../../web/js/settings.js');

const EMPTY = { v: 1, look: {}, display: {}, quiet: {}, scenes: {} };
const plain = v => JSON.parse(JSON.stringify(v));
const WORLD = { can: { battlement: ['attack'], camp: ['attack', 'cpu_hot'], yard: ['attack', 'cpu_hot'] }, homes: { attack: 'battlement', cpu_hot: 'yard' } };

/* A browser's storage, by key. */
function storage(init, opts) {
  const o = opts || {}, m = new Map(Object.entries(init || {}));
  const get = () => ({
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (o.setThrows) throw new Error('QuotaExceededError'); m.set(k, v); },
    removeItem: k => { m.delete(k); }
  });
  return { m, get };
}

/* A server that keeps the settings, or answers as a static server (status) or not at all (down).
   With hold, each answer waits until release() is called. refuse makes the next PUT a 400. */
function server(o) {
  const s = Object.assign({ data: plain(EMPTY), puts: [], gets: 0, status: 0, down: false, refuse: null, hold: false, queue: [] }, o || {});
  s.request = (method, body) => new Promise((resolve, reject) => {
    const answer = () => {
      if (s.down) return reject(new Error('unreachable'));
      if (s.status) return resolve({ status: s.status, json: null });
      if (method === 'GET') { s.gets++; return resolve({ status: 200, json: plain(s.data) }); }
      s.puts.push(plain(body));
      if (s.refuse) { const e = s.refuse; s.refuse = null; return resolve({ status: 400, json: { error: e, problems: [e] } }); }
      for (const k of Object.keys(body)) if (k !== 'v') s.data[k] = plain(body[k]);
      return resolve({ status: 200, json: plain(s.data) });
    };
    if (s.hold) s.queue.push(answer); else answer();
  });
  s.release = () => { const q = s.queue.splice(0); for (const f of q) f(); };
  return s;
}
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }

/* A display: a store over its own storage, connected to srv. */
function display(srv, opts) {
  const o = opts || {}, st = o.storage || storage(o.init), lines = [], notes = [];
  const store = SET.create({ storage: st.get, pack: () => null, world: () => WORLD, cache: true, say: l => lines.push(l) });
  const d = { store, st, lines, notes, reloads: 0, open: false };
  d.sync = SET.connect({ store, request: srv.request, storage: st.get, reload: () => { d.reloads++; }, holding: () => d.open, note: t => notes.push(t), say: l => lines.push(l) });
  return d;
}
const look = d => d.store.now().values.look;

test('the server\'s answer is taken only in the shared form, every section an object', () => {
  assert.deepEqual(SET.sharedOf({ v: 1, look: { tabard: 'teal' } }), { v: 1, look: { tabard: 'teal' }, display: {}, quiet: {}, scenes: {} });
  for (const bad of [null, [], 'x', { v: 2 }, { v: '1' }, { v: 1, look: [] }, { v: 1, display: 'large' }, { look: {} }]) assert.equal(SET.sharedOf(bad), null, JSON.stringify(bad));
});

test('a page from disk, or with no copy, starts from this browser\'s choices; a served page with a copy starts from the copy', () => {
  const own = JSON.stringify({ v: 1, look: { tabard: 'wine' } }), copy = JSON.stringify({ v: 1, look: { tabard: 'teal' } });
  const st = storage({ [SET.KEY]: own, [SET.SHARED_KEY]: copy });
  const fromDisk = SET.create({ storage: st.get, pack: () => null, world: () => WORLD });
  assert.equal(fromDisk.mode(), 'local');
  assert.equal(fromDisk.now().values.look.tabard, 'wine');
  const served = SET.create({ storage: st.get, pack: () => null, world: () => WORLD, cache: true });
  assert.equal(served.mode(), 'server');
  assert.equal(served.now().values.look.tabard, 'teal');
  const fresh = SET.create({ storage: storage({ [SET.KEY]: own }).get, pack: () => null, world: () => WORLD, cache: true });
  assert.equal(fresh.mode(), 'local');
  assert.equal(fresh.now().values.look.tabard, 'wine');
});

test('the first answer makes the settings the server\'s, keeps a copy, and reloads the page when they differ from what it started with', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'teal' }, display: { clock: 12 }, quiet: {}, scenes: {} } });
  const d = display(srv);
  assert.equal(d.store.mode(), 'local');
  await d.sync.poll(); await settle();
  assert.equal(d.store.mode(), 'server');
  assert.equal(look(d).tabard, 'teal');
  assert.equal(d.store.now().from.look.tabard, 'saved');
  assert.deepEqual(JSON.parse(d.st.m.get(SET.SHARED_KEY)), srv.data);
  assert.equal(d.reloads, 1, 'the page started from something else, so it starts again');
  // the next load starts from the copy, so the same answer changes nothing and reloads nothing
  const again = display(srv, { storage: d.st });
  assert.equal(again.store.mode(), 'server');
  assert.equal(look(again).tabard, 'teal');
  await again.sync.poll(); await settle();
  assert.equal(again.reloads, 0);
});

test('carry-over: with nothing on the server, this browser\'s choices are sent once and its key removed', async () => {
  const srv = server();
  const own = { v: 1, look: { tabard: 'wine', skin: 'tan', cape: 'red' }, display: { clock: 12 }, quiet: {}, scenes: { cpu_hot: 'camp' } };
  const d = display(srv, { init: { [SET.KEY]: JSON.stringify(own) } });
  assert.equal(look(d).tabard, 'wine', 'the page starts from them');
  await d.sync.poll(); await settle();
  assert.deepEqual(srv.puts, [{ v: 1, look: { tabard: 'wine', skin: 'tan' }, display: { clock: 12 }, scenes: { cpu_hot: 'camp' } }], 'the unknown key is left out, the empty section not sent');
  assert.equal(d.st.m.has(SET.KEY), false, 'the old key is removed');
  assert.deepEqual(srv.data.look, { tabard: 'wine', skin: 'tan' });
  assert.equal(d.store.mode(), 'server');
  assert.equal(look(d).tabard, 'wine');
  assert.equal(d.reloads, 0, 'nothing changed on screen');
  assert.ok(d.lines.some(l => /choices were sent to the server/.test(l)));
  // once: the next poll sends nothing
  await d.sync.poll(); await settle();
  assert.equal(srv.puts.length, 1);
  // another display with choices of its own, meeting a server that now holds some, sends nothing
  // and drops its key
  const e = display(srv, { init: { [SET.KEY]: JSON.stringify({ v: 1, look: { tabard: 'sable' } }) } });
  await e.sync.poll(); await settle();
  assert.equal(srv.puts.length, 1);
  assert.equal(e.st.m.has(SET.KEY), false);
  assert.equal(look(e).tabard, 'wine', 'the deployment\'s settings win');
});

test('carry-over that the server refuses keeps the key for the next load', async () => {
  const srv = server({ refuse: 'look.tabard: unknown value "wine"; use blue' });
  const d = display(srv, { init: { [SET.KEY]: JSON.stringify({ v: 1, look: { tabard: 'wine' } }) } });
  await d.sync.poll(); await settle();
  assert.equal(srv.puts.length, 1);
  assert.equal(d.st.m.has(SET.KEY), true);
  assert.equal(d.store.mode(), 'server');
  assert.equal(look(d).tabard, 'blue', 'the server\'s, which hold nothing');
  assert.ok(d.lines.some(l => /could not be sent to the server \(look\.tabard: unknown value "wine"; use blue\)/.test(l)));
});

test('no server: a 404, or an answer not in the shared form, keeps the choices in this browser and asks no more', async () => {
  for (const status of [404, 405, 200]) {
    const srv = server({ status });
    const st = storage({ [SET.KEY]: JSON.stringify({ v: 1, look: { tabard: 'forest' } }), [SET.SHARED_KEY]: JSON.stringify({ v: 1, look: { tabard: 'teal' } }) });
    const d = display(srv, { storage: st });
    assert.equal(look(d).tabard, 'teal', 'from the copy at first');
    await d.sync.poll(); await settle();
    assert.equal(d.store.mode(), 'local', String(status));
    assert.equal(look(d).tabard, 'forest');
    assert.equal(st.m.has(SET.SHARED_KEY), false, 'the copy is removed');
    assert.equal(d.sync.state().stopped, true);
    srv.status = 0;
    await d.sync.poll(); await settle();
    assert.equal(d.store.mode(), 'local', 'nothing more is asked');
    // a choice is kept in the browser, as from disk
    assert.equal(d.store.choose('look', 'plume', 'gold'), true);
    assert.equal(JSON.parse(st.m.get(SET.KEY)).look.plume, 'gold');
    assert.equal(srv.puts.length, 0);
  }
});

test('a server that cannot be reached changes nothing and is asked again', async () => {
  const srv = server({ down: true });
  const d = display(srv, { init: { [SET.KEY]: JSON.stringify({ v: 1, look: { tabard: 'forest' } }) } });
  await d.sync.poll(); await settle();
  assert.equal(d.store.mode(), 'local');
  assert.equal(d.sync.state().stopped, false);
  srv.down = false;
  await d.sync.poll(); await settle();
  assert.equal(d.store.mode(), 'server');
  assert.deepEqual(srv.data.look, { tabard: 'forest' }, 'carried over at the first answer');
});

test('a choice is sent with PUT, naming the section, and nothing is written to this browser\'s key', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'teal' }, display: {}, quiet: {}, scenes: {} } });
  const d = display(srv);
  await d.sync.poll(); await settle();
  d.store.choose('look', 'plume', 'gold');
  assert.equal(look(d).plume, 'gold', 'it shows at once');
  await settle();
  assert.deepEqual(srv.puts, [{ v: 1, look: { tabard: 'teal', plume: 'gold' } }]);
  assert.equal(d.st.m.has(SET.KEY), false);
  assert.deepEqual(JSON.parse(d.st.m.get(SET.SHARED_KEY)).look, { tabard: 'teal', plume: 'gold' });
  d.store.reset('look'); await settle();
  assert.deepEqual(srv.puts[1], { v: 1, look: {} }, 'a reset clears the section on the server');
  d.store.choose('look', 'monarch_hair', 'silver'); await settle();
  d.store.clear('look', 'monarch_hair'); await settle();
  assert.deepEqual(srv.puts[3], { v: 1, look: {} }, '"As drawn" clears the key');
  assert.deepEqual(d.notes, ['', '', '', '']);
  assert.equal(d.reloads, 1, 'only the first answer reloaded');
});

test('a refused write puts the settings back to the server\'s and says "Not saved:" with the reason', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'teal' }, display: {}, quiet: {}, scenes: {} } });
  const d = display(srv);
  await d.sync.poll(); await settle();
  srv.refuse = 'look.plume: unknown value "gold"; use red';
  d.store.choose('look', 'plume', 'gold');
  await settle();
  assert.deepEqual(d.notes, ['Not saved: look.plume: unknown value "gold"; use red']);
  assert.equal(look(d).plume, 'red', 'back to the server\'s');
  srv.down = true;
  d.store.choose('display', 'clock', 12); await settle();
  assert.equal(d.notes[1], 'Not saved: the server did not answer');
  assert.equal(d.store.now().values.display.clock, 24);
  srv.down = false; srv.status = 500;
  d.store.choose('display', 'clock', 12); await settle();
  assert.equal(d.notes[2], 'Not saved: the server answered 500');
  srv.status = 0;
  d.store.choose('display', 'clock', 12); await settle();
  assert.equal(d.notes[3], '', 'a save that succeeds clears the line');
  assert.equal(d.store.now().values.display.clock, 12);
});

test('an answer to a poll sent before a choice does not undo it, and writes go one at a time', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'teal' }, display: {}, quiet: {}, scenes: {} } });
  const d = display(srv);
  await d.sync.poll(); await settle();
  srv.hold = true;
  const p = d.sync.poll();
  d.store.choose('look', 'plume', 'gold');
  d.store.choose('look', 'skin', 'deep');
  await settle();
  assert.equal(srv.queue.length, 2, 'the poll and one write are waiting');
  srv.release(); await settle(); await p;
  assert.equal(look(d).plume, 'gold', 'the old answer was dropped');
  assert.equal(srv.queue.length, 1, 'the second write went once the first was answered');
  srv.release(); await settle();
  assert.deepEqual(srv.puts.map(b => b.look), [{ tabard: 'teal', plume: 'gold' }, { tabard: 'teal', plume: 'gold', skin: 'deep' }]);
  srv.hold = false;
  await d.sync.poll(); await settle();
  assert.deepEqual(look(d).skin, 'deep');
  assert.equal(d.reloads, 1);
});

test('two displays share one server: a choice on one reaches the other at its next poll, which reloads to show it', async () => {
  const srv = server();
  const a = display(srv), b = display(srv);
  await a.sync.poll(); await b.sync.poll(); await settle();
  assert.equal(a.reloads + b.reloads, 0, 'nothing saved, nothing to change');
  a.store.choose('look', 'tabard', 'violet'); await settle();
  assert.equal(look(b).tabard, 'blue');
  await b.sync.poll(); await settle();
  assert.equal(look(b).tabard, 'violet');
  assert.equal(b.reloads, 1);
  assert.equal(a.reloads, 0, 'the display that chose does not reload for its own choice');
  // with b's screen open, b does not reload: the screen reloads the page as it closes
  b.open = true;
  a.store.choose('look', 'tabard', 'wine'); await settle();
  await b.sync.poll(); await settle();
  assert.equal(look(b).tabard, 'wine');
  assert.equal(b.reloads, 1);
});

test('where the copy cannot be kept the settings apply in place and the page is not reloaded', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'teal' }, display: {}, quiet: {}, scenes: {} } });
  const d = display(srv, { storage: storage({}, { setThrows: true }) });
  await d.sync.poll(); await settle();
  assert.equal(look(d).tabard, 'teal');
  assert.equal(d.reloads, 0);
});

test('the console names the shared settings when a value saved on the server is not one the page knows', async () => {
  const srv = server({ data: { v: 1, look: { tabard: 'pink' }, display: {}, quiet: {}, scenes: {} } });
  const d = display(srv);
  await d.sync.poll(); await settle();
  d.store.now();
  assert.ok(d.lines.includes('knightwatcher: settings: look.tabard "pink" in the settings saved on the server is ignored: not a value the page knows'), d.lines.join('\n'));
});
