// Tests for loading the packs and for what the page draws when they fail, web/js/knight.js: the
// index of downloaded packs and their fetch, the rule that a deployed page reads only signed packs,
// the list of refused packs and its console lines, the fallback to the base pack's defaults, the
// knight drawn from code when no base pack can be used, and a throw inside a draw list.
// Run with: node --test tests/web/
//
// The page's scripts run under Node in a sandbox, as in knight.test.js. Signed packs are signed
// with keys generated in memory for the run and handed to read() through start()'s keys option;
// no key is stored anywhere.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const UNSIGNED = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => (!s.startsWith('js/scenes/') || ['js/scenes/house.js', 'js/scenes/smithy.js'].includes(s)) && !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));

/* The page's drawing code in a sandbox, without starting the knight: { box, KW, K, log, lines,
   delays }. log holds one line per canvas call, lines the console as [level, text], and delays the
   time each setTimeout asked for. Timers run 400 times faster than asked. */
function sandbox() {
  const log = [], lines = [], delays = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
  const box = vm.createContext({ window: {}, AbortController, clearTimeout,
    setTimeout: (fn, ms) => { delays.push(ms); return setTimeout(fn, ms / 400); },
    console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.things = { draw() { log.push('things'); } };
  KW.draw.setCtx(ctx);
  return { box, KW, K: KW.knight, log, lines, delays };
}
/* A sandbox with the knight started from texts (the base pack unsigned by default) on a 'dev' page
   when dev is true, with opts passed to start(). */
function page(dev, texts, opts) {
  const s = sandbox();
  s.status = s.K.start(texts || [UNSIGNED], dev === true, opts);
  return s;
}

/* ---- Packs for the run --------------------------------------------------------------------------- */

/* A pack file's text from an envelope. */
const fileOf = env => JSON.stringify(env, null, 2) + '\n';
/* A second pack built from the base pack: id test.extra, the base pack's items and a red tabard
   swatch, with no builds or defaults, which only the base pack may carry. */
function extraEnv(edit) {
  const env = JSON.parse(UNSIGNED), p = env.pack;
  p.id = 'test.extra'; p.name = 'Test extra';
  delete p.builds; delete p.defaults; delete p.items['head.plain'];
  p.provides = ['items', 'swatches'];
  p.swatches = { tabard: { red: { name: 'Red', entries: { 0: '#ff9a8a', 1: '#d0302a', 2: '#a02020', 3: '#701414' } } } };
  if (edit) edit(p, env);
  return env;
}
const EXTRA = fileOf(extraEnv());
/* A key pair made for the run, and a pack text signed with it under kid. */
const KEY = crypto.generateKeyPairSync('ed25519');
const pubOf = k => Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url');
function signed(text, kid, key) {
  const env = JSON.parse(text);
  const value = crypto.sign(null, Buffer.from(PK.message(env.pack)), (key || KEY).privateKey).toString('base64');
  return SIGN.withSig(text, { alg: 'ed25519', kid, value });
}
/* The keys option for start(): the run's key as test1, made inside the sandbox, since read()
   requires a Uint8Array of the page's own. */
const keysIn = s => ({ test1: vm.runInContext(`new Uint8Array([${[...pubOf(KEY)]}])`, s.box) });
/* A deployed page that knows the run's key as test1, its base pack signed with it, drawing look. */
function deployed(look) {
  const s = sandbox();
  s.status = s.K.start([signed(UNSIGNED, 'test1')], false, { keys: keysIn(s), look });
  return s;
}

/* ---- A fake fetch -------------------------------------------------------------------------------- */

/* A response with status, body and headers. */
const answer = (status, body, headers) => ({ status, ok: status >= 200 && status < 300,
  headers: { get: k => (headers || {})[k.toLowerCase()] ?? null }, text: async () => body });
/* A fetch serving files, a map of URL to a response, a function of the init, or 'hang' for no
   answer until aborted, and a 404 for anything else. asked lists [url, init] for every call. */
function server(files) {
  const asked = [];
  const get = (url, init) => {
    asked.push([url, init]);
    const f = files[url];
    if (f === 'hang') return new Promise((_, no) => init.signal.addEventListener('abort', () => no(new Error('aborted'))));
    if (f === 'fail') return Promise.reject(new TypeError('network'));
    if (f === undefined) return Promise.resolve(answer(404, 'not found'));
    return Promise.resolve(typeof f === 'string' ? answer(200, f) : f);
  };
  return { get, asked };
}
const IDX = 'data/packs/index.json';
const index = names => JSON.stringify({ packs: names });

/* ---- The index ----------------------------------------------------------------------------------- */

test('the index: a list of pack file names, other keys ignored', () => {
  const { K } = sandbox();
  assert.deepEqual(plain(K.packIndex({ packs: ['a.pack.json', 'kw-extra_2.v1.pack.json'], made: 'by the collector' })),
    { ok: true, files: ['a.pack.json', 'kw-extra_2.v1.pack.json'], refused: [] });
  assert.deepEqual(plain(K.packIndex({ packs: [] })), { ok: true, files: [], refused: [] });
});

test('the index as a whole is refused when it is not an object with a list of at most 32 names', () => {
  const { K } = sandbox();
  for (const [v, reason] of [
    [null, 'the index must be a JSON object'], [[], 'the index must be a JSON object'], ['x', 'the index must be a JSON object'],
    [{}, 'packs: must be a list of file names'], [{ packs: 'a.pack.json' }, 'packs: must be a list of file names'],
    [{ packs: Array.from({ length: 33 }, (_, i) => `p${i}.pack.json`) }, 'packs: lists 33 files, and at most 32 are read']]) {
    assert.deepEqual(plain(K.packIndex(v)), { ok: false, reason }, JSON.stringify(v));
  }
  assert.equal(K.packIndex({ packs: Array.from({ length: 32 }, (_, i) => `p${i}.pack.json`) }).files.length, 32);
});

test('the index: a name with a path, or that is not a pack file\'s, is refused and the rest kept', () => {
  const { K } = sandbox();
  const bad = ['../a.pack.json', 'sub/a.pack.json', '/a.pack.json', 'a\\b.pack.json', 'https://example.com/a.pack.json', 'a.pack.json?x=1', '%2e%2e.pack.json',
    'A.pack.json', 'a.json', 'a.pack.js', '.pack.json', '..pack.json', 'a..pack.json', '.a.pack.json', 'a .pack.json', 'index.json'];
  const r = K.packIndex({ packs: ['good.pack.json', ...bad, 7, null, 'x'.repeat(56) + '.pack.json', 'good.pack.json'] });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.files), ['good.pack.json']);
  const why = plain(r.refused).map(e => [e.file, e.reason.replace(/^packs\[\d+\]: /, '')]);
  for (const b of bad) assert.deepEqual(why.shift(), [b, 'is not the name of a pack file in data/packs/ (a name only, ending in .pack.json)'], b);
  assert.deepEqual(why, [[null, 'is not a file name'], [null, 'is not a file name'], ['x'.repeat(56) + '.pack...', 'is longer than 64 characters'], ['good.pack.json', 'is listed twice']]);
  assert.ok(r.refused.every(e => e.id === null && e.step === 'index'));
  assert.equal(r.refused[0].reason, 'packs[1]: is not the name of a pack file in data/packs/ (a name only, ending in .pack.json)');
});

/* ---- The fetch ----------------------------------------------------------------------------------- */

test('a missing index is silent: no packs, nothing refused, and only the index asked for', async () => {
  const { K, delays } = sandbox(), srv = server({});
  assert.deepEqual(plain(await K.fetchPacks(srv.get)), { files: [], refused: [] });
  assert.deepEqual(srv.asked.map(a => a[0]), [IDX]);
  const init = srv.asked[0][1];
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error', 'a redirect cannot take the fetch out of the folder');
  assert.ok(init.signal && init.signal.aborted === false);
  assert.deepEqual(delays, [4000], 'the same four-second cut-off as state.json');
  // no fetch function, nothing fetched
  assert.deepEqual(plain(await K.fetchPacks(undefined)), { files: [], refused: [] });
});

test('an index that cannot be used is refused whole, and nothing else is fetched', async () => {
  const many = index(Array.from({ length: 33 }, (_, i) => `p${i}.pack.json`));
  for (const [body, reason] of [
    ['{"packs": [', 'the index is not valid JSON'], ['', 'the index is not valid JSON'], ['[]', 'the index must be a JSON object'],
    ['{"packs": {}}', 'packs: must be a list of file names'], [many, 'packs: lists 33 files, and at most 32 are read'],
    [answer(500, ''), 'the server answered 500'], [answer(403, ''), 'the server answered 403'],
    [answer(200, '{}', { 'content-length': '16385' }), 'the file is larger than 16 KiB'],
    [JSON.stringify({ packs: [], pad: 'x'.repeat(16 * 1024) }), 'the file is larger than 16 KiB'],
    ['hang', 'no answer within four seconds'], ['fail', 'the file could not be fetched']]) {
    const { K } = sandbox(), srv = server({ [IDX]: body, 'data/packs/p0.pack.json': EXTRA });
    assert.deepEqual(plain(await K.fetchPacks(srv.get)), { files: [], refused: [{ id: null, file: 'index.json', step: 'index', reason }] }, reason);
    assert.deepEqual(srv.asked.map(a => a[0]), [IDX]);
  }
});

test('each file the index names is fetched as text from data/packs/, and a bad name is never asked for', async () => {
  const { K } = sandbox();
  const srv = server({ [IDX]: index(['extra.pack.json', '../state.json', 'sub/x.pack.json', 'two.pack.json']), 'data/packs/extra.pack.json': EXTRA, 'data/packs/two.pack.json': '{"not": "a pack"}' });
  const got = plain(await K.fetchPacks(srv.get));
  assert.deepEqual(srv.asked.map(a => a[0]).sort(), [IDX, 'data/packs/extra.pack.json', 'data/packs/two.pack.json'].sort());
  assert.ok(srv.asked.every(([, init]) => init.cache === 'no-store' && init.redirect === 'error'));
  assert.deepEqual(got.files, [{ file: 'extra.pack.json', text: EXTRA }, { file: 'two.pack.json', text: '{"not": "a pack"}' }]);
  assert.deepEqual(got.refused.map(r => [r.file, r.step]), [['../state.json', 'index'], ['sub/x.pack.json', 'index']]);
});

test('a file that cannot be fetched is refused with its name, and the others still come', async () => {
  const files = { 'gone.pack.json': undefined, 'err.pack.json': answer(500, ''), 'slow.pack.json': 'hang', 'net.pack.json': 'fail',
    'big.pack.json': answer(200, '{}', { 'content-length': String(512 * 1024 + 1) }), 'huge.pack.json': 'x'.repeat(512 * 1024 + 1), 'ok.pack.json': EXTRA };
  const { K } = sandbox(), map = { [IDX]: index(Object.keys(files)) };
  for (const [n, f] of Object.entries(files)) if (f !== undefined) map['data/packs/' + n] = f;
  const got = plain(await K.fetchPacks(server(map).get));
  assert.deepEqual(got.files.map(f => f.file), ['ok.pack.json']);
  assert.deepEqual(got.refused, [
    { id: null, file: 'gone.pack.json', step: 'fetch', reason: 'the file the index names is missing' },
    { id: null, file: 'err.pack.json', step: 'fetch', reason: 'the server answered 500' },
    { id: null, file: 'slow.pack.json', step: 'fetch', reason: 'no answer within four seconds' },
    { id: null, file: 'net.pack.json', step: 'fetch', reason: 'the file could not be fetched' },
    { id: null, file: 'big.pack.json', step: 'fetch', reason: 'the file is larger than 512 KiB' },
    { id: null, file: 'huge.pack.json', step: 'fetch', reason: 'the file is larger than 512 KiB' }]);
});

test('a downloaded file that fails a step of read() is refused with its file name, and its id once it is known', async () => {
  const s = page(true);
  const cases = [
    ['size.pack.json', '\u00e9'.repeat(300 * 1024), null, 'size'],
    ['json.pack.json', '{"kwpack": 1,', null, 'json'],
    ['envelope.pack.json', JSON.stringify({ kwpack: 2, pack: {} }), null, 'envelope'],
    ['signature.pack.json', SIGN.withSig(EXTRA, { alg: 'ed25519', kid: 'test1', value: 'A'.repeat(86) + '==' }), 'test.extra', 'signature'],
    ['format.pack.json', fileOf(extraEnv(p => { p.format = [2, 0]; })), 'test.extra', 'format'],
    ['fields.pack.json', fileOf(extraEnv(p => { p.builds = {}; })), 'test.extra', 'fields'],
    ['references.pack.json', fileOf(extraEnv(p => { p.items['torso.tabard'].parts[0].shapes[0].fill = '@base.nope'; })), 'test.extra', 'references']];
  const srv = server(Object.fromEntries([[IDX, index(cases.map(c => c[0]))], ...cases.map(c => ['data/packs/' + c[0], c[1]])]));
  s.lines.length = 0;
  const st = s.K.add(await s.K.fetchPacks(srv.get));
  assert.equal(st.source, 'pack', 'the base pack still draws');
  assert.deepEqual(plain(st.refused).map(r => [r.file, r.id, r.step]), cases.map(c => [c[0], c[2], c[3]]));
  assert.equal(s.lines.length, cases.length, 'one console line each');
});

/* ---- Signatures on downloaded packs --------------------------------------------------------------- */

test('a deployed page refuses an unsigned downloaded pack, with its id and file, and a dev page reads it', () => {
  const dep = deployed();
  assert.equal(dep.status.source, 'pack', dep.status.note);
  dep.lines.length = 0;
  const st = dep.K.add({ files: [{ file: 'extra.pack.json', text: EXTRA }], refused: [] });
  assert.deepEqual(plain(st.refused), [{ id: 'test.extra', file: 'extra.pack.json', step: 'signature', reason: 'sig: is missing, and this page accepts only signed packs' }]);
  assert.equal(st.source, 'pack', 'the wall keeps the base look');
  assert.deepEqual(dep.lines, [['warn', 'knightwatcher: the pack test.extra was refused at the signature step: sig: is missing, and this page accepts only signed packs']]);
  const dev = page(true);
  assert.deepEqual(plain(dev.K.add({ files: [{ file: 'extra.pack.json', text: EXTRA }] }).refused), []);
});

test('a deployed page reads a downloaded pack signed with a key it knows, and refuses an unknown kid', () => {
  const s = deployed({ swatches: { tabard: 'test.extra/red' } });
  assert.equal(s.status.fallbacks.find(f => f.key === 'tabard').reason, 'pack not loaded');
  const other = crypto.generateKeyPairSync('ed25519');
  let st = s.K.add({ files: [{ file: 'stranger.pack.json', text: signed(EXTRA, 'test2', other) }] });
  assert.deepEqual(plain(st.refused), [{ id: 'test.extra', file: 'stranger.pack.json', step: 'signature', reason: 'sig.kid: names a key this page does not know, "test2"' }]);
  // a known kid with a signature made by another key does not verify
  st = s.K.add({ files: [{ file: 'forged.pack.json', text: signed(EXTRA, 'test1', other) }] });
  assert.equal(st.refused[1].reason, 'sig.value: does not verify for this pack with key "test1"');
  st = s.K.add({ files: [{ file: 'extra.pack.json', text: signed(EXTRA, 'test1') }] });
  assert.equal(st.refused.length, 2);
  assert.equal(st.fallbacks.find(f => f.key === 'tabard'), undefined, 'the look\'s tabard is found now');
  s.log.length = 0;
  s.K.draw(at(s.K, 'idle', 2300));
  assert.ok(s.log.includes('s #d0302a'), 'the knight wears the downloaded red');
});

test('look() draws a new look from the packs already loaded, a downloaded one included, where start() again would lose it', () => {
  const s = deployed();
  s.K.add({ files: [{ file: 'extra.pack.json', text: signed(EXTRA, 'test1') }, { file: 'loose.pack.json', text: EXTRA }] });
  const refusedBefore = plain(s.K.status.refused);
  assert.equal(refusedBefore.length, 1, 'the unsigned copy is refused on a deployed page');
  s.lines.length = 0;
  let st = s.K.look({ swatches: { tabard: 'test.extra/red', skin: 'kw.base/deep' } });
  assert.equal(st.source, 'pack');
  assert.equal(st.fallbacks.find(f => f.key === 'tabard'), undefined, 'the downloaded tabard is still loaded');
  assert.deepEqual(plain(st.refused), refusedBefore, 'what was refused stays refused, and the signed-only rule is unchanged');
  assert.deepEqual(s.lines, [], 'nothing is read again, so nothing new is said');
  s.log.length = 0;
  s.K.draw(at(s.K, 'idle', 2300));
  assert.ok(s.log.includes('s #d0302a'), 'the knight wears the downloaded red');
  // back to the defaults and to the downloaded tabard again, with no new read
  st = s.K.look({});
  assert.equal(st.fallbacks.find(f => f.key === 'tabard').reason, 'not set');
  st = s.K.look({ swatches: { tabard: 'test.extra/red' } });
  assert.equal(st.fallbacks.find(f => f.key === 'tabard'), undefined);
  // start() rebuilds from the carriers alone, and the downloaded pack is gone
  st = s.K.start([signed(UNSIGNED, 'test1')], false, { keys: keysIn(s), look: { swatches: { tabard: 'test.extra/red' } } });
  assert.equal(st.fallbacks.find(f => f.key === 'tabard').reason, 'pack not loaded');
  // before start(), look() does nothing
  assert.equal(sandbox().K.look({}), null);
});

/* ---- The refused list and the console ------------------------------------------------------------- */

test('each refused pack is listed in the status and written to the console once', () => {
  const s = deployed();
  assert.deepEqual(s.lines, [['info', 'knightwatcher: the knight is drawn from the base pack kw.base 1.2.0, signed']]);
  s.lines.length = 0;
  s.K.add({ files: [{ file: 'extra.pack.json', text: EXTRA }], refused: [{ id: null, file: 'index.json', step: 'index', reason: 'the index is not valid JSON' }] });
  assert.equal(s.lines.length, 2);
  assert.deepEqual(s.lines[1], ['warn', 'knightwatcher: the pack index.json was refused at the index step: the index is not valid JSON']);
  // frames, and further additions, write nothing about them again
  for (let t = 0; t < 2000; t += 500) s.K.draw(at(s.K, 'cpu_hot', t));
  s.K.add({});
  s.K.add({ files: [{ file: 'json.pack.json', text: 'nope' }] });
  assert.deepEqual(s.lines.slice(2), [['warn', 'knightwatcher: the pack json.pack.json was refused at the json step: the file is not valid JSON']]);
  assert.equal(s.K.status.refused.length, 3);
  assert.equal(s.K.status, s.status, 'the status stays the same object');
});

/* ---- Falling back to the base pack's defaults ------------------------------------------------------ */

const X = 480, FLOOR = 530;
function at(K, id, t, over) {
  const o = K.pose(id, t);
  o.floor = FLOOR; o.x = X; o.helmet = true;
  return Object.assign(o, over);
}
const frame = (s, o) => { s.log.length = 0; s.K.draw(o); return s.log.slice(); };

test('a missing item, swatch or build in the look takes the base pack\'s default', () => {
  const look = { build: 'kw.base/build.z', items: { torso: 'gone.pack/torso.x', helmet: 'kw.base/helm.none' }, swatches: { tabard: 'kw.base/green', plume: 'test.extra/red' } };
  const s = page(true, null, { look }), base = page(true);
  assert.equal(s.status.source, 'pack');
  const f = Object.fromEntries(plain(s.status.fallbacks).filter(x => x.reason !== 'not set').map(x => [x.key, [x.wanted, x.used, x.reason]]));
  assert.deepEqual(f, {
    build: ['kw.base/build.z', 'kw.base/build.a', 'no such build'],
    torso: ['gone.pack/torso.x', 'kw.base/torso.tabard', 'pack not loaded'],
    helmet: ['kw.base/helm.none', 'kw.base/helm.open', 'no such item'],
    tabard: ['kw.base/green', 'kw.base/blue', 'no such swatch'],
    plume: ['test.extra/red', 'kw.base/red', 'pack not loaded'] });
  for (const [id, t] of [['idle', 2300], ['attack', 94], ['memory_tight', 600]]) assert.deepEqual(frame(s, at(s.K, id, t)), frame(base, at(base.K, id, t)), id);
});

test('a one-handed weapon in the look is held in one hand, from any pack', () => {
  const env = extraEnv(p => { p.items['main.greatsword'].grip = { kind: 'one', hands: [0] }; });
  const s = page(true, [UNSIGNED, fileOf(env)], { look: { items: { main: 'test.extra/main.greatsword' } } });
  if (s.status.refused.length) return assert.fail(s.status.refused[0].reason);
  assert.equal(s.status.source, 'pack');
  assert.equal(s.status.fallbacks.find(x => x.key === 'main' && x.reason !== 'not set'), undefined);
  assert.equal(s.K.rig(at(s.K, 'idle', 2300)).grip, 'one');
  assert.equal(s.K.rest.key('main'), 'test.extra/main.greatsword');
});

test('a shield without a one-handed weapon falls back to none, and the knight is the default knight', () => {
  const s = page(true, null, { look: { items: { off: 'kw.base/off.heater' } } }), base = page(true);
  assert.equal(s.status.source, 'pack');
  const f = s.status.fallbacks.find(x => x.key === 'off');
  assert.deepEqual(plain(f), { kind: 'item', key: 'off', wanted: 'kw.base/off.heater', used: null, reason: 'a shield is carried only with a one-handed weapon' });
  assert.equal(s.K.rest.key('off'), '');
  for (const [id, t] of [['idle', 2300], ['attack', 94]]) assert.deepEqual(frame(s, at(s.K, id, t)), frame(base, at(base.K, id, t)), id);
});

/* ---- The knight from code ------------------------------------------------------------------------ */

/* The stored record of the knight drawn from code, from knight.test.js, and the poses of it this file
   draws, each as knight.test.js draws it. */
const STORED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/knight/calls.json'), 'utf8')).poses;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function recorded(s) {
  const K = s.K, H = s.KW.scenes.house, S = s.KW.scenes.smithy, p = [];
  const knight = (name, id, t, over, then) => p.push([name, () => { const o = at(K, id, t, over); if (then) then(o); K.draw(o); }]);
  knight('idle t2300', 'idle', 2300);
  for (const id of ['cpu_hot', 'memory_tight', 'disk_full', 'backup_overdue', 'pi_silent', 'updating', 'streaming', 'wan_down', 'attack', 'night', 'ssh_session']) knight(`${id} t2300`, id, 2300);
  knight('container_unhealthy t1400', 'container_unhealthy', 1400);
  knight('walk left foot up', 'idle', 1920, { walk: true, x: 481.5 });
  knight('swing right q0.42', 'idle', 2300, null, o => K.swing(o, 0.42, 1));
  knight('hammer 0.5', 'updating', 2300, { sword: false, helmet: false, hammer: 0.5, progress: 0.5 });
  knight('helmet off', 'idle', 2300, { helmet: false });
  knight('helmet off unwell', 'container_unhealthy', 1400, { helmet: false });
  knight('sword off', 'idle', 2300, { sword: false });
  knight('face hot puffed', 'idle', 2300, { face: 'P', puff: 1 });
  p.push(['head in bed', () => K.head(-15, 262, at(K, 'night', 2300))]);
  p.push(['helmet at rest on the stool', () => K.rest.draw('helmet', 460, 476)]);
  p.push(['weapon at rest on the pegs', () => K.rest.draw('main', 618, 228, Math.PI / 2)]);
  p.push(['weapon at rest on the anvil', () => K.rest.draw('main', 490, 425, Math.PI / 2)]);
  p.push(['house painted', () => H.paint({ tv: false })]);
  p.push(['house drawn, asleep', () => H.draw(2300, { tv: false, inBed: true, helmOff: true, o: at(K, 'night', 2300) })]);
  p.push(['smithy painted kx440', () => S.paint({ kx: 440 })]);
  p.push(['smithy drawn t300', () => { const st = { kx: 440, o: at(K, 'updating', 300), strike: false }; S.act(300, st); S.draw(300, st); }]);
  return p;
}
/* Requires that s draws, pose by pose, exactly the stored record of the knight drawn from code. */
function drawsTheCodeKnight(s, name) {
  for (const [pose, fn] of recorded(s)) {
    assert.ok(STORED[pose], pose + ': stored');
    s.log.length = 0; fn();
    assert.equal(s.log.length, STORED[pose].calls, `${name}, ${pose}: the number of calls`);
    assert.equal(sha(s.log.join('\n')), STORED[pose].sha256, `${name}, ${pose}: the calls`);
  }
}
/* Makes the library's draw() throw on its next call, once. */
function throwOnce(s) {
  const d0 = s.KW.pack.draw;
  let armed = true;
  s.KW.pack.draw = (...a) => { if (armed) { armed = false; throw new Error('boom'); } return d0(...a); };
}

/* The pages that cannot use their base pack, each with the line it should write about the source. */
const CODE = 'knightwatcher: the knight is drawn from code: ';
const NO_BASE = {
  'missing': [() => page(true, []), 'no base pack is loaded'],
  'broken': [() => page(true, [UNSIGNED.replace('"kwpack": 1', '"kwpack": 1,,')]), 'no base pack is loaded'],
  'unsigned on a deployed page': [() => page(false, [UNSIGNED]), 'the base pack kw.base was refused at the signature step'],
  'signed by an unknown kid on a deployed page': [() => page(false, [signed(UNSIGNED, 'test9')]), 'the base pack kw.base was refused at the signature step'],
  'no pack library': [() => { const s = sandbox(); s.KW.pack = undefined; s.status = s.K.start([UNSIGNED], true); return s; }, 'the pack library is not loaded'],
  'a throw inside the base pack\'s lists': [() => { const s = page(true); throwOnce(s); s.K.draw(at(s.K, 'idle', 2300)); return s; }, 'the base pack kw.base was refused at the draw step'] };

test('with no usable base pack the knight, the sleeper\'s head and the gear at rest are drawn from code, call for call as stored', () => {
  for (const [name, [open, why]] of Object.entries(NO_BASE)) {
    const s = open();
    assert.equal(s.status.source, 'code', name);
    assert.equal(s.K.source, 'code', name);
    assert.equal(s.status.base, null, name);
    assert.equal(s.status.note, CODE + why, name);
    assert.deepEqual(s.lines[s.lines.length - 1], ['warn', s.status.note], name);
    assert.deepEqual(plain(s.K.rest.blade()), { from: 34, to: 263, half: 15 }, name);
    assert.equal(s.K.rest.key('main'), 'code', name);
    drawsTheCodeKnight(s, name);
  }
});

test('the refusal behind the code path is in the status and the console, with its reason', () => {
  const s = page(false, [signed(UNSIGNED, 'test9')]);
  const r = { id: 'kw.base', file: null, step: 'signature', reason: 'sig.kid: names a key this page does not know, "test9"' };
  assert.deepEqual(plain(s.status.refused), [r]);
  assert.deepEqual(s.lines, [['warn', 'knightwatcher: the pack kw.base was refused at the signature step: ' + r.reason], ['warn', CODE + 'the base pack kw.base was refused at the signature step']]);
});

/* ---- A throw inside a draw list ------------------------------------------------------------------ */

test('a throw inside the base pack\'s list is caught, the pack marked bad, and the knight drawn from code from the next frame', () => {
  const s = page(true);
  s.lines.length = 0;
  throwOnce(s);
  assert.doesNotThrow(() => s.K.draw(at(s.K, 'idle', 2300)));
  assert.equal(s.status.source, 'code');
  assert.deepEqual(plain(s.status.refused), [{ id: 'kw.base', file: null, step: 'draw', reason: 'the body list threw while drawing: boom' }]);
  assert.deepEqual(s.lines, [['warn', 'knightwatcher: the pack kw.base was refused at the draw step: the body list threw while drawing: boom'],
    ['warn', CODE + 'the base pack kw.base was refused at the draw step']]);
  drawsTheCodeKnight(s, 'after the throw');
  assert.equal(s.lines.length, 2, 'once');
});

test('a throw inside a downloaded pack\'s list marks that pack bad, and the look falls back to the base pack', () => {
  const s = page(true, null, { look: { items: { torso: 'test.extra/torso.tabard' }, swatches: { tabard: 'test.extra/red' } } }), base = page(true);
  s.K.add({ files: [{ file: 'extra.pack.json', text: EXTRA }] });
  assert.ok(frame(s, at(s.K, 'idle', 2300)).includes('s #d0302a'));
  throwOnce(s);
  s.K.draw(at(s.K, 'idle', 2300));
  assert.equal(s.status.source, 'pack');
  assert.deepEqual(plain(s.status.refused), [{ id: 'test.extra', file: 'extra.pack.json', step: 'draw', reason: 'the body list threw while drawing: boom' }]);
  assert.deepEqual(plain(s.status.fallbacks).filter(f => f.reason !== 'not set').map(f => [f.key, f.reason]), [['torso', 'pack not loaded'], ['tabard', 'pack not loaded']]);
  assert.deepEqual(frame(s, at(s.K, 'idle', 2300)), frame(base, at(base.K, 'idle', 2300)));
});

test('a throw inside a list of the gear at rest or the sleeper\'s head is caught the same way', () => {
  for (const call of [K => K.rest.draw('main', 618, 228, Math.PI / 2), K => K.rest.draw('helmet', 460, 476), K => K.head(-15, 262, at(K, 'night', 2300))]) {
    const s = page(true);
    throwOnce(s);
    assert.doesNotThrow(() => call(s.K));
    assert.equal(s.status.source, 'code');
    assert.equal(s.status.refused[0].step, 'draw');
    assert.match(s.status.refused[0].reason, /^the (main|restHelmet|headOff) list threw while drawing: boom$/);
  }
});

test('a throw outside a pack\'s lists is not put down to a pack', () => {
  const s = page(true);
  const o = Object.defineProperty(at(s.K, 'idle', 2300), 'progress', { get() { throw new Error('engine'); } });
  assert.throws(() => s.K.draw(o), /engine/);
  assert.equal(s.status.source, 'pack');
  assert.deepEqual(plain(s.status.refused), []);
});
