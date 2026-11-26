// Tests for loading the medieval world's pack and for what the page draws when it fails, as
// tests/web/loading.test.js has them for the base pack: kw.medieval refused (unsigned on a deployed
// page, a signature that does not verify), missing, a part that fails to compile, and a part that
// throws while drawing (a scene, a kind of device, each role of the cast, the word set), caught and
// drawn from its code copy alone from the next frame; a throw outside a part not put down to the
// pack; the packs the collector downloaded starting the world again; and the admin page loading
// what the compiler needs. Run with: node --test 'tests/web/**/*.test.js'
//
// The page's scripts run under Node in a sandbox, as in tests/web/world-cast.test.js, against a fake
// canvas context that writes one line per call. A part is made to throw while drawing by a pack the
// library has read whose data is then changed, as tests/web/world.test.js makes a part that fails
// to compile: a horseshoe whose radii are missing, which the checks would refuse and the compiler
// takes, and which throws in the effect as it is drawn. Signed packs are signed with a key made in
// memory for the run; no key is stored anywhere.
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
/* The pack's text with any signature taken off, which the tests sign with a key of their own or
   leave unsigned. */
const TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED = JSON.parse(TEXT).pack;
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const ADMIN = fs.readFileSync(path.join(WEB, 'admin/index.html'), 'utf8');
const scriptsOf = html => [...html.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1]);
/* The scripts index.html loads, in its order, but the carriers and the files that drive the page
   (demo, main). */
const SCRIPTS = scriptsOf(INDEX).filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const SCENES = ['battlement', 'camp', 'yard', 'cellar', 'smithy', 'house', 'court'];
const KINDS = ['pi', 'camera', 'machine', 'vm', 'box'];
const MISSING = 'sig: is missing, and this page accepts only signed packs';
/* A shape that throws as it is drawn: a horseshoe with no radii. */
const BOMB = { k: 'fx', fx: 'horseshoe', p: [0, 0], r: null };
const THREW = /^the .+ threw while drawing: .+$/;

/* ---- The recording context ------------------------------------------------------------------- */
const LOG = Symbol('log');
/* A context that writes one line per call into log. A canvas drawn with drawImage is written as its
   size and the number of times it has been painted, followed by its calls, each after a "| ". */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', `canvas ${img.width}x${img.height}`, ...a].join(' '));
        for (const l of img[LOG]) log.push('| ' + l);
      };
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
}
/* A canvas whose context writes into its own log, emptied each time its width is set, which is how
   the engine starts to paint a backdrop; painted counts those times. */
function canvas() {
  const log = [];
  let w = 300, h = 150;
  const cv = { [LOG]: log, painted: 0, get width() { return w; }, set width(v) { w = v; log.length = 0; cv.painted++; }, get height() { return h; }, set height(v) { h = v; log.length = 0; } };
  const ctx = context(log);
  cv.getContext = () => ctx;
  return cv;
}

/* A context that throws as soon as a colour is set on it, as a primitive does first. */
const trap = () => new Proxy({}, { set(_, k) { if (k === 'fillStyle') throw new Error('trap'); return true; }, get: () => () => {} });

/* ---- Pages ------------------------------------------------------------------------------------ */

/* The page's scripts in a sandbox, the knight from code, with the console's lines as [level, text].
   edit, when given, changes the data of kw.medieval as the library reads it: { scenes, props, cast,
   words, ... }, a copy the compiler then takes as it is. */
function sandbox(edit) {
  const lines = [];
  const box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, AbortController, setTimeout, clearTimeout,
    console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]), log() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  // the knight from code, whose line is not the world's
  KW.knight.start([], false);
  lines.length = 0;
  const code = { scenes: Object.assign({}, KW.scenes), kinds: Object.assign({}, KW.props.KINDS), critters: Object.assign({}, KW.props.CRITTERS),
    foes: Object.assign({}, KW.props.FOES), patrons: Object.assign({}, KW.props.PATRONS), pets: Object.assign({}, KW.props.PETS) };
  if (edit) {
    const lib = KW.pack, cache = new Map();
    KW.pack = Object.assign({}, lib, {
      read(t, o) {
        const r = lib.read(t, o);
        if (!r.ok || r.id !== 'kw.medieval') return r;
        if (!cache.has(t)) { const d = plain(r.data); edit(d); cache.set(t, d); }
        return Object.assign({}, r, { data: cache.get(t) });
      }
    });
  }
  return { box, KW, W: KW.world, E: KW.engine, lines, code };
}
/* A page that started the world from texts on a 'dev' page, or a deployed one when dev is false. */
function page(texts, dev, edit, opts) {
  const s = sandbox(edit);
  s.st = s.W.start(texts, dev !== false, opts);
  return s;
}
/* The pack's text with its pack changed by edit, written without spaces (pretty-printed, the pack
   passes the 512 KiB a pack may weigh). */
function edited(edit) {
  const env = JSON.parse(TEXT);
  edit(env.pack);
  return JSON.stringify(env) + '\n';
}
const KEY = crypto.generateKeyPairSync('ed25519');
function signedText(text, key) {
  const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(text).pack)), (key || KEY).privateKey).toString('base64');
  return SIGN.withSig(text, { alg: 'ed25519', kid: 'test1', value });
}
const keysIn = s => ({ test1: vm.runInContext(`new Uint8Array([${[...Buffer.from(KEY.publicKey.export({ format: 'jwk' }).x, 'base64url')]}])`, s.box) });

/* The engine's frames on the page s at each time of times, in the scene, the devices in every place
   up, time frozen: each frame's calls, the canvases it draws written out after it. */
function frames(s, scene, times, o) {
  const KW = s.KW, E = s.E, out = [], log = [];
  KW.hooks = { frozen: true, t: 0 };
  KW.ui = { caption() {} };
  E.init(context(log));
  E.reset(); E.invalidate();
  const places = Object.keys(KW.scenes[scene].places || {});
  E.input = Object.assign({ w: KW.state.IDLE, is: scene, turnMs: 60000, devices: places.map((p, i) => ({ place: p, kind: KINDS[i % KINDS.length], ok: true, alert: false })), tv: false, helmet: 'auto' }, o || {});
  for (const t of times) {
    log.length = 0;
    if (o && o.at && o.at[t]) o.at[t](E);
    E.draw(t);
    out.push(log.slice());
  }
  return out;
}

// ---- Missing, refused, failing to compile -----------------------------------------------------------

test('a page whose texts lack kw.medieval draws every scene, device and member of the cast from code, says so, and draws every scene without a throw', () => {
  for (const texts of [[], [BASE_TEXT], ['not json']]) {
    const s = page(texts, true);
    assert.deepEqual([s.st.source, s.st.pack, s.st.refused, s.st.note], ['code', null, null, 'knightwatcher: the scenes of kw.medieval are drawn from code: no pack kw.medieval is loaded']);
    assert.deepEqual(plain(s.lines), [['warn', s.st.note]]);
    assert.deepEqual([s.W.props.source, s.W.cast.source, s.W.words.source, s.W.overlay.source], ['code', 'code', 'code', 'code']);
    for (const n of SCENES) assert.equal(s.KW.scenes[n], s.code.scenes[n], n);
    for (const k of KINDS) assert.equal(s.KW.kinds[k], s.code.kinds[k], k);
    assert.equal(s.KW.cast.critters.fly, s.code.critters.fly);
    assert.equal(s.KW.cast.foes.goblin, s.code.foes.goblin);
    assert.equal(s.KW.cast.pets.cat, s.code.pets.cat);
    for (const id of ['a', 'b', 'c']) assert.equal(s.KW.cast.patrons[id], s.code.patrons[id]);
    // the words are the collector's
    assert.equal(s.W.quietLine([{ k: 'quiet' }], 'ALL QUIET'), 'ALL QUIET');
    // every scene draws, from code, with a device in every place, the knight at night in the house
    for (const n of SCENES) assert.doesNotThrow(() => frames(s, n, [0, 1300, 2600]), n);
    assert.doesNotThrow(() => frames(s, 'house', [0, 2600], { w: Object.assign({}, s.KW.state.IDLE, { id: 'night', scene: 'house' }) }));
    assert.equal(s.lines.length, 1, 'nothing more is said');
  }
});

test('kw.medieval refused, unsigned on a deployed page or with a signature that does not verify: every part from code, the refusal in the status, said once by the world', () => {
  const st = sb => sb.W.start([TEXT], false);
  const s = sandbox(), dep = st(s);
  assert.deepEqual(plain(dep.refused), { id: 'kw.medieval', step: 'signature', reason: MISSING });
  assert.deepEqual(plain(s.lines), [['warn', 'knightwatcher: the scenes of kw.medieval are drawn from code: the pack kw.medieval was refused at the signature step']]);
  const t = sandbox(), bad = t.W.start([signedText(TEXT).replace('"Cellar"', '"Cellars"')], false, { keys: keysIn(t) });
  assert.deepEqual([bad.source, bad.refused.step], ['code', 'signature']);
  assert.match(bad.refused.reason, /^sig\.value: does not verify/);
  for (const p of [s, t]) {
    for (const n of SCENES) assert.equal(p.KW.scenes[n], p.code.scenes[n], n);
    for (const k of KINDS) assert.equal(p.KW.kinds[k], p.code.kinds[k], k);
    assert.deepEqual([p.W.props.source, p.W.cast.source, p.W.words.source, p.W.overlay.source], ['code', 'code', 'code', 'code']);
    assert.doesNotThrow(() => frames(p, 'camp', [0, 1300]));
  }
  // signed with the key the page knows, it is drawn
  const u = sandbox(), ok = u.W.start([signedText(TEXT)], false, { keys: keysIn(u) });
  assert.deepEqual([ok.source, ok.pack.signed], ['pack', true]);
});

test('a part that fails to compile is drawn from code alone, each kind of part, and the rest of the pack stays in use', () => {
  const s = page([TEXT], true, d => {
    d.scenes.cellar.still[0].shapes[0].k = 'zz';
    d.props['props.medieval'].kinds.vm.up.still[0].k = 'zz';
    d.cast['critter.fly'].frames.flap0[0].k = 'zz';
  });
  assert.deepEqual(plain(s.st.scenes), { battlement: 'pack', camp: 'pack', yard: 'pack', cellar: 'code', smithy: 'pack', house: 'pack', court: 'pack' });
  assert.deepEqual([s.W.props.kinds.vm, s.W.props.kinds.pi, s.W.cast.members['critter.fly'], s.W.cast.members['foe.goblin']], ['code', 'pack', 'code', 'pack']);
  assert.equal(s.KW.scenes.cellar, s.code.scenes.cellar);
  assert.equal(s.KW.kinds.vm, s.code.kinds.vm);
  assert.equal(s.KW.cast.critters.fly, s.code.critters.fly);
  assert.ok(s.st.faults.every(f => !('step' in f)), 'a compile fault has no step');
});

// ---- A part that throws while drawing -----------------------------------------------------------------

/* Asserts that frames a and b are the same from the frame from on. */
function sameFrom(a, b, from, what) {
  assert.equal(a.length, b.length);
  for (let i = from; i < a.length; i++) assert.deepEqual(a[i], b[i], what + ': frame ' + i);
}

test('a scene whose still layers throw is caught, and from the next frame that scene alone is drawn from code, its backdrop painted again', () => {
  const s = page([TEXT], true, d => { d.scenes.camp.still[0].shapes.splice(5, 0, BOMB); });
  const c = page([TEXT], true, d => { d.scenes.camp.still[0].shapes[0].k = 'zz'; });
  const before = s.W.changes;
  const a = frames(s, 'camp', [0, 100, 200]), b = frames(c, 'camp', [0, 100, 200]);
  sameFrom(a, b, 1, 'camp');
  assert.notDeepEqual(a[0], b[0], 'the frame that threw drew what it had');
  assert.equal(s.KW.scenes.camp, s.code.scenes.camp);
  assert.equal(s.KW.scenes['kw.medieval/camp'], s.code.scenes.camp, 'the long name stands for the short one');
  assert.deepEqual(plain(s.st.scenes), { battlement: 'pack', camp: 'code', yard: 'pack', cellar: 'pack', smithy: 'pack', house: 'pack', court: 'pack' });
  assert.equal(s.st.source, 'pack', 'the rest of the pack is still in use');
  assert.equal(s.st.faults.length, 1);
  const f = s.st.faults[0];
  assert.deepEqual([f.scene, f.step], ['camp', 'draw']);
  assert.match(f.reason, /^the scene camp threw while drawing: /);
  assert.deepEqual(s.lines.slice(1), [['warn', 'knightwatcher: the scene camp is drawn from code: it threw while drawing: ' + f.reason.split('drawing: ')[1]]]);
  assert.equal(s.st.note, s.lines[1][1]);
  // which tells the engine to paint again the backdrop the pack's camp left half painted: the
  // frames after it, the backdrop's calls written out in them, are the code camp's
  assert.ok(s.W.changes > before, 'what the world draws changed');
  assert.ok(a[1].some(x => /^drawImage canvas \d+x\d+ -16 0$/.test(x)), 'the backdrop is drawn');
  // the other scenes are still drawn from the pack
  assert.notEqual(s.KW.scenes.yard, s.code.scenes.yard);
});

test('a scene whose moving layers throw is caught the same way, and draws as the code scene from the next frame', () => {
  const s = page([TEXT], true, d => { d.scenes.battlement.moving[0].shapes.push(BOMB); });
  const c = page([TEXT], true, d => { d.scenes.battlement.still[0].shapes[0].k = 'zz'; });
  const a = frames(s, 'battlement', [0, 100, 200]), b = frames(c, 'battlement', [0, 100, 200]);
  sameFrom(a, b, 1, 'battlement');
  assert.equal(s.st.scenes.battlement, 'code');
  assert.deepEqual(plain(s.st.faults.map(f => [f.scene, f.step])), [['battlement', 'draw']]);
  assert.equal(s.lines.filter(l => l[0] === 'warn').length, 1, 'said once');
  // and nothing more is said on later frames
  frames(s, 'battlement', [300, 400]);
  assert.equal(s.lines.filter(l => l[0] === 'warn').length, 1);
});

test('a kind of device that throws is caught, drawn from code from the next frame, and the other kinds stay the pack\'s', () => {
  const s = page([TEXT], true, d => { d.props['props.medieval'].kinds.pi.up.still.push(BOMB); });
  const c = page([TEXT], true, d => { d.props['props.medieval'].kinds.pi.up.still[0].k = 'zz'; });
  const a = frames(s, 'battlement', [0, 100, 200]), b = frames(c, 'battlement', [0, 100, 200]);
  sameFrom(a, b, 1, 'the pie');
  assert.equal(s.KW.kinds.pi, s.code.kinds.pi);
  assert.notEqual(s.KW.kinds.camera, s.code.kinds.camera);
  assert.deepEqual([s.W.props.kinds.pi, s.W.props.kinds.camera, s.W.props.source], ['code', 'pack', 'pack']);
  assert.deepEqual(plain(s.W.props.faults.map(f => [f.kind, f.step])), [['pi', 'draw']]);
  assert.match(s.W.props.faults[0].reason, /^the device kind pi threw while drawing: /);
  assert.deepEqual(plain(s.W.devices.kinds), { pi: 'medieval', camera: 'medieval', machine: 'medieval', vm: 'medieval', box: 'medieval' });
  assert.equal(s.st.scenes.battlement, 'pack', 'the scene the device stood in is not put down to the throw');
  assert.match(s.lines[s.lines.length - 1][1], /^knightwatcher: the device kind pi is drawn from code: it threw while drawing: /);
});

test('a kind of another prop set that throws gives way to the base world\'s drawing of it, with the reason in the devices\' faults', () => {
  const s = page([TEXT], true);
  // the medieval set chosen by its long name, which compiles a copy of its own
  const st = s.W.useKinds({ camera: 'kw.medieval/props.medieval' });
  const own = s.KW.kinds.camera;
  assert.equal(st.kinds.camera, 'kw.medieval/props.medieval');
  s.KW.draw.setCtx(trap());
  assert.doesNotThrow(() => own.draw(0, 0, 0, true, 'still'));
  assert.equal(s.W.devices.kinds.camera, 'medieval');
  assert.deepEqual(plain(s.W.devices.faults), [{ kind: 'camera', set: 'kw.medieval/props.medieval', reason: 'it threw while drawing: trap', step: 'draw' }]);
  assert.notEqual(s.KW.kinds.camera, own);
  assert.equal(s.W.drawingOf('kw.medieval/props.medieval', 'camera').why, 'it threw while drawing: trap');
});

test('each role of the cast that throws is caught and drawn from code from then on: the fly, the goblin, a monarch and the cat', () => {
  // the fly: the engine's frames with flies, from the frame after the throw as from code
  const s = page([TEXT], true, d => { d.cast['critter.fly'].frames.flap0.push(BOMB); d.cast['critter.fly'].frames.flap1.push(BOMB); });
  const c = page([TEXT], true, d => { d.cast['critter.fly'].frames.flap0[0].k = 'zz'; });
  const flies = { at: { 0: E => { for (let i = 0; i < 4; i++) E.addFly(i); } } };
  sameFrom(frames(s, 'battlement', [0, 200, 400, 600], flies), frames(c, 'battlement', [0, 200, 400, 600], flies), 1, 'the flies');
  assert.equal(s.KW.cast.critters.fly, s.code.critters.fly);
  assert.deepEqual(plain(s.W.cast.faults.map(f => [f.member, f.step])), [['critter.fly', 'draw']]);
  assert.match(s.W.cast.faults[0].reason, /^the cast member critter\.fly threw while drawing: /);
  assert.deepEqual([s.W.cast.members['critter.fly'], s.W.cast.members['foe.goblin'], s.W.cast.source], ['code', 'pack', 'pack']);

  // the goblin: its pose throws as it is painted; the call gives the code's pose, and so does the
  // compiled goblin the engine still holds for the event
  const g = page([TEXT], true, d => { d.cast['foe.goblin'].parts.body.push(BOMB); });
  const held = g.KW.cast.foes.goblin;
  const cv = held.pose('stand');
  assert.equal(cv, g.code.foes.goblin.pose('stand'));
  assert.equal(g.KW.cast.foes.goblin, g.code.foes.goblin);
  assert.equal(held.pose('hit'), g.code.foes.goblin.pose('hit'));
  assert.deepEqual(plain(g.W.cast.faults.map(f => [f.member, f.step])), [['foe.goblin', 'draw']]);

  // a monarch: its still parts throw as the court paints its backdrop
  const m = page([TEXT], true, d => { d.cast['patron.a'].still[0].shapes.push(BOMB); });
  const n = page([TEXT], true, d => { d.cast['patron.a'].still[0].shapes[0].k = 'zz'; });
  sameFrom(frames(m, 'court', [0, 100, 200]), frames(n, 'court', [0, 100, 200]), 1, 'the court');
  assert.equal(m.KW.cast.patrons.a, m.code.patrons.a);
  assert.notEqual(m.KW.cast.patrons.b, m.code.patrons.b);
  assert.equal(m.st.scenes.court, 'pack', 'the court is not put down to its monarch');
  assert.deepEqual(plain(m.W.cast.faults.map(f => [f.member, f.step])), [['patron.a', 'draw']]);

  // the cat: its pose throws as it is painted (here the first pixel painted), and the code's is given
  const p = page([TEXT], true), D = p.KW.draw, pix = D.pix, mine = context([]);
  let armed = true;
  D.pix = function () { if (armed) { armed = false; throw new Error('trap'); } return pix.apply(this, arguments); };
  D.setCtx(mine);
  const cat = p.KW.cast.pets.cat, got = cat.pose('calico', 'rest');
  D.pix = pix;
  assert.equal(got, p.code.pets.cat.pose('calico', 'rest'));
  assert.equal(p.KW.cast.pets.cat, p.code.pets.cat);
  assert.deepEqual(plain(p.W.cast.faults), [{ member: 'pet.cat', reason: 'the cast member pet.cat threw while drawing: trap', step: 'draw' }]);
  // the context the pose was asked for in is put back, where the throw left the sprite's
  assert.equal(D.getCtx(), mine);
});

test('a word set whose templates throw while filling gives way to the collector\'s own words from then on', () => {
  const s = page([TEXT], true);
  assert.equal(s.W.quietLine([{ k: 'quiet' }, { k: 'up', n: '29' }], 'ALL QUIET · 29 up'), 'ALL QUIET · 29 up');
  assert.equal(s.W.words.source, 'pack');
  const part = { k: 'up' };
  Object.defineProperty(part, 'n', { enumerable: true, get() { throw new Error('trap'); } });
  assert.equal(s.W.quietLine([{ k: 'quiet' }, part], 'THE COLLECTOR\'S LINE'), 'THE COLLECTOR\'S LINE');
  assert.deepEqual([s.W.words.source, s.W.words.set, s.W.words.quiet, s.W.words.captions], ['code', null, null, null]);
  assert.deepEqual(plain(s.W.words.faults), [{ set: 'words.medieval', reason: 'the word set words.medieval threw while filling: trap', step: 'draw' }]);
  assert.deepEqual(plain(s.lines[s.lines.length - 1]), ['warn', 'knightwatcher: the words are the collector\'s: the word set words.medieval threw while filling: trap']);
  // the collector's words from now on, for the quiet line and the captions alike
  assert.equal(s.W.quietLine([{ k: 'quiet' }], 'OWN'), 'OWN');
  assert.equal(s.W.caption('ip_banned', { addr: '203.0.113.7' }, 'BANNED 203.0.113.7'), 'BANNED 203.0.113.7');
  // the scenes are untouched
  assert.equal(s.st.source, 'pack');
  assert.deepEqual(plain(s.st.faults), []);
});

test('a throw in the engine\'s own drawing inside a part is not put down to the pack, and goes on as it always has', () => {
  // the gear at rest, which the smithy paints into its backdrop
  const s = page([TEXT], true), rest = s.KW.knight.rest.draw;
  s.KW.knight.rest.draw = () => { throw new Error('engine'); };
  assert.throws(() => frames(s, 'smithy', [0]), /engine/);
  s.KW.knight.rest.draw = rest;
  // the speech bubble over the monarch, and a device's light, which the engine's lamp draws
  const t = page([TEXT], true);
  t.KW.knight.speech = () => { throw new Error('engine'); };
  assert.throws(() => frames(t, 'court', [3300]), /engine/);
  const u = page([TEXT], true);
  u.KW.props.lampLevel = () => { throw new Error('engine'); };
  assert.throws(() => frames(u, 'battlement', [0]), /engine/);
  for (const p of [s, t, u]) {
    assert.deepEqual([p.st.source, plain(p.st.faults), plain(p.W.props.faults), plain(p.W.cast.faults)], ['pack', [], [], []]);
    for (const n of SCENES) assert.notEqual(p.KW.scenes[n], p.code.scenes[n], n);
    for (const k of KINDS) assert.notEqual(p.KW.kinds[k], p.code.kinds[k], k);
    assert.deepEqual(p.lines.slice(1), [], 'nothing is said');
  }
  // the page draws again once the engine's drawing is mended
  assert.doesNotThrow(() => frames(s, 'smithy', [100]));
});

test('a part already on code that throws is not caught: it goes on as it always has', () => {
  const s = page([TEXT], true, d => { d.scenes.yard.moving[0].shapes.push(BOMB); });
  const held = s.KW.scenes.yard;
  frames(s, 'yard', [0]);
  assert.equal(s.KW.scenes.yard, s.code.scenes.yard);
  // the compiled yard the engine may still hold is drawn by the code yard, unguarded
  s.KW.draw.setCtx(trap());
  assert.throws(() => held.draw(0, { w: s.KW.state.IDLE, o: s.KW.knight.pose('idle', 0), kx: 300, devices: [], places: {}, tv: false }), /trap/);
  assert.equal(s.W.status.faults.length, 1);
});

test('the status page names a part that threw, in a sentence of its own', () => {
  const s = page([TEXT], true, d => { d.scenes.camp.still[0].shapes.push(BOMB); d.props['props.medieval'].kinds.box.up.still.push(BOMB); d.cast['critter.fly'].frames.flap0.push(BOMB); });
  s.KW.scenes.camp.paint({ w: s.KW.state.IDLE });
  s.KW.kinds.box.draw(0, 0, 0, true, 'still');
  s.KW.cast.critters.fly.draw(0, 0, 0);
  const part = { k: 'up' };
  Object.defineProperty(part, 'n', { enumerable: true, get() { throw new Error('trap'); } });
  s.W.quietLine([part], '');
  const out = s.KW.settings.screen.fallbackLines({ ignored: [], faults: [] }, s.W, null, null, null, null);
  const msg = s.st.faults[0].reason.split('drawing: ')[1];
  assert.deepEqual(plain(out.map(l => l[0])), ['Camp', 'box', 'critter.fly', 'words.medieval']);
  assert.equal(out[0][1], ': drawn from code. The scene camp threw while drawing: ' + msg);
  assert.match(out[1][1], /^: drawn from code\. The device kind box threw while drawing: /);
  assert.match(out[2][1], /^: drawn from code\. The cast member critter\.fly threw while drawing: /);
  assert.equal(out[3][1], ': the collector\'s words are shown. The word set words.medieval threw while filling: trap');
  // a compile fault's reason stays as the compiler wrote it
  const c = page([TEXT], true, d => { d.scenes.cellar.still[0].shapes[0].k = 'zz'; });
  assert.deepEqual(plain(c.KW.settings.screen.fallbackLines({ ignored: [], faults: [] }, c.W, null, null, null, null)),
    [['Cellar', ': drawn from code. scenes.cellar.still[0].shapes[0].k: the shape kind "zz" is not built in this engine yet']]);
});

// ---- Starting again ------------------------------------------------------------------------------------

test('starting again with the same version of the pack keeps a part that threw on code; a different version tries it afresh', () => {
  const bomb = d => { d.scenes.camp.still[0].shapes.push(BOMB); d.cast['critter.fly'].frames.flap0.push(BOMB); d.props['props.medieval'].kinds.vm.up.still.push(BOMB); };
  const s = page([TEXT], true, bomb);
  s.KW.scenes.camp.paint({ w: s.KW.state.IDLE });
  s.KW.cast.critters.fly.draw(0, 0, 0);
  s.KW.kinds.vm.draw(0, 0, 0, true, 'still');
  const part = { k: 'up' };
  Object.defineProperty(part, 'n', { enumerable: true, get() { throw new Error('trap'); } });
  s.W.quietLine([part], '');
  s.lines.length = 0;
  // again with the same texts, as when downloaded packs bring no other copy of kw.medieval
  const again = s.W.start([TEXT], true);
  assert.deepEqual([again.scenes.camp, s.W.cast.members['critter.fly'], s.W.props.kinds.vm, s.W.words.source], ['code', 'code', 'code', 'code']);
  assert.deepEqual(plain(again.faults.map(f => [f.scene, f.step])), [['camp', 'draw']]);
  assert.match(again.faults[0].reason, THREW);
  assert.equal(s.KW.scenes.camp, s.code.scenes.camp);
  assert.equal(s.KW.cast.critters.fly, s.code.critters.fly);
  assert.equal(s.KW.kinds.vm, s.code.kinds.vm);
  assert.deepEqual(plain(s.W.words.faults.map(f => f.step)), ['draw']);
  assert.ok(s.lines.some(l => l[1] === 'knightwatcher: the scene camp is drawn from code: it threw while drawing: ' + again.faults[0].reason.split('drawing: ')[1]));
  assert.notEqual(s.KW.scenes.yard, s.code.scenes.yard, 'the rest is the pack\'s');
  // a different version of the pack is tried afresh, and what does not throw is drawn from it
  const newer = edited(p => { p.version = '0.11.0'; });
  const fresh = s.W.start([TEXT, newer], true);
  assert.equal(fresh.pack.version, '0.11.0');
  assert.deepEqual(plain(fresh.faults), []);
  assert.equal(s.W.cast.members['critter.fly'], 'pack');
  assert.equal(s.W.words.source, 'pack');
  assert.notEqual(s.KW.scenes.camp, s.code.scenes.camp);
});

test('a part of an earlier start that throws gives way to code without touching what the world now holds', () => {
  const s = page([TEXT], true, d => { d.cast['foe.goblin'].parts.body.push(BOMB); });
  const held = s.KW.cast.foes.goblin;
  s.W.start([TEXT], true);
  s.lines.length = 0;
  assert.equal(held.pose('stand'), s.code.foes.goblin.pose('stand'));
  assert.deepEqual([s.W.cast.members['foe.goblin'], plain(s.W.cast.faults), s.lines.length], ['pack', [], 0]);
});

// ---- Downloaded packs ----------------------------------------------------------------------------------

/* What fetchPacks gives for files, { name: text }. */
const got = files => ({ files: Object.entries(files).map(([file, text]) => ({ file, text })), refused: [] });
/* The page's start and its restart once the downloaded packs have come, as main.js has them. */
function served(texts, dl, dev, o) {
  const s = sandbox(o && o.edit), opts = o && o.keys ? { keys: keysIn(s) } : undefined;
  s.KW.knight.start(texts, dev, opts);
  s.first = s.W.start(texts, dev, opts);
  const before = s.lines.length;
  s.KW.knight.add(dl);
  s.st = s.W.start(texts.concat(dl.files.map(f => f.text)), dev, opts);
  s.after = s.lines.slice(before);
  return s;
}

test('a downloaded kw.medieval of a higher version takes the place of the shipped one at once; a lower or equal one is passed over', () => {
  const higher = edited(p => { p.version = '0.11.0'; p.scenes.camp.can = p.scenes.camp.can.slice(); });
  const s = served([BASE_TEXT, TEXT], got({ 'medieval.pack.json': higher }), true);
  assert.deepEqual(plain(s.first.pack), { id: 'kw.medieval', version: '0.10.0', signed: false });
  assert.deepEqual(plain(s.st.pack), { id: 'kw.medieval', version: '0.11.0', signed: false });
  assert.match(s.st.note, /drawn from the pack kw\.medieval 0\.11\.0, unsigned$/);
  for (const n of SCENES) assert.equal(s.KW.scenes[n], s.KW.scenes['kw.medieval/' + n], n);
  for (const v of ['0.9.0', '0.10.0']) {
    const t = served([BASE_TEXT, TEXT], got({ 'medieval.pack.json': edited(p => { p.version = v; }) }), true);
    assert.equal(t.st.pack.version, '0.10.0', v);
  }
});

test('a downloaded world pack is read under the knight\'s rule: a deployed page refuses it unsigned, and the knight alone says so, once', () => {
  const higher = edited(p => { p.version = '0.10.0'; });
  const s = served([signedText(BASE_TEXT), signedText(TEXT)], got({ 'medieval.pack.json': higher }), false, { keys: true });
  assert.deepEqual(plain(s.st.pack), { id: 'kw.medieval', version: '0.10.0', signed: true }, 'the shipped copy stays');
  assert.equal(s.st.refused, null);
  const said = s.after.filter(l => /refused/.test(l[1]));
  assert.deepEqual(plain(said), [['warn', 'knightwatcher: the pack kw.medieval was refused at the signature step: ' + MISSING]]);
  assert.deepEqual(plain(s.KW.knight.status.refused.map(r => [r.id, r.file, r.step])), [['kw.medieval', 'medieval.pack.json', 'signature']]);
  // signed with the key the page knows, it is drawn
  const t = served([signedText(BASE_TEXT), signedText(TEXT)], got({ 'medieval.pack.json': signedText(higher) }), false, { keys: true });
  assert.deepEqual(plain(t.st.pack), { id: 'kw.medieval', version: '0.10.0', signed: true });
  // with no copy shipped, the refused download leaves every part on code, the refusal said once
  const u = served([signedText(BASE_TEXT)], got({ 'medieval.pack.json': higher }), false, { keys: true });
  assert.deepEqual([u.st.source, u.st.refused.step], ['code', 'signature']);
  assert.equal(u.after.filter(l => l[1].includes(MISSING)).length, 1);
});

/* A second world pack, kw.extra: the medieval camera as the prop set props.extra (with the stamps
   its lamp is drawn from), and a preset world.extra of the medieval world's parts. */
function extraPack() {
  const kinds = { camera: JSON.parse(JSON.stringify(MED.props['props.medieval'].kinds.camera)) }, stamps = {};
  for (const n of [kinds.camera.up.lamp.lit, kinds.camera.up.lamp.dark]) stamps[n] = MED.stamps[n];
  const pre = JSON.parse(JSON.stringify(MED.worlds['world.medieval'])), M = 'kw.medieval/';
  const long = v => (typeof v === 'string' && v.indexOf('/') < 0 ? M + v : v);
  pre.name = 'Extra';
  pre.scenes = { quiet: pre.scenes.quiet.map(long), for: Object.fromEntries(Object.entries(pre.scenes.for).map(([c, n]) => [c, long(n)])) };
  pre.cast = Object.fromEntries(Object.entries(pre.cast).map(([k, v]) => [k, long(v)]));
  Object.assign(pre, { props: 'props.extra', overlay: long(pre.overlay), words: long(pre.words), picture: long(pre.picture) });
  // format 1.4, as the medieval world's preset it copies, which names no scene for streaming
  return JSON.stringify({ kwpack: 1, pack: { id: 'kw.extra', name: 'Extra world', version: '1.0.0', format: [1, 4], licence: 'For the tests.', provides: ['props', 'worlds', 'stamps'],
    stamps, props: { 'props.extra': { name: 'Extra devices', kinds } }, worlds: { 'world.extra': pre } } });
}

test('a downloaded pack holding presets and prop sets joins KW.world and its catalogue when the world starts again', () => {
  const extra = extraPack();
  assert.equal(PK.read(extra, { allowUnsigned: true }).ok, true, PK.read(extra, { allowUnsigned: true }).reason);
  const s = served([BASE_TEXT, TEXT], got({ 'extra.pack.json': extra }), true);
  const cat = s.W.catalogue();
  assert.ok(cat.worlds['kw.extra/world.extra'], Object.keys(cat.worlds).join(', '));
  assert.deepEqual(plain(cat.sets['kw.extra/props.extra']), { name: 'Extra devices', kinds: ['camera'] });
  assert.equal(s.W.useKinds({ camera: 'kw.extra/props.extra' }).kinds.camera, 'kw.extra/props.extra');
  assert.equal(s.st.source, 'pack', 'kw.medieval is still drawn');
  // before the restart the page did not know it
  const t = page([TEXT], true);
  assert.equal(t.W.catalogue().worlds['kw.extra/world.extra'], undefined);
});

test('starting the world again repaints the backdrops the engine keeps', () => {
  const s = page([TEXT], true);
  s.KW.hooks = { frozen: true, t: 0 };
  s.E.init(context([]));
  s.E.input = { w: s.KW.state.IDLE, is: 'cellar', turnMs: 60000, devices: [], tv: false, helmet: 'auto' };
  // the backdrop's paintings, counted through the scene's own paint
  let n = 0;
  const wrap = sc => { const p = sc.paint; sc.paint = st => { n++; return p(st); }; };
  wrap(s.KW.scenes.cellar);
  s.E.draw(0); s.E.draw(100);
  assert.equal(n, 1, 'painted once and kept');
  s.W.start([TEXT], true);
  wrap(s.KW.scenes.cellar);
  s.E.draw(200);
  assert.equal(n, 2, 'painted again after the world started again, with no word from main.js');
});

test('main.js and the admin page start the world again with every text once the downloaded packs have come', () => {
  const MAIN = fs.readFileSync(path.join(WEB, 'js/main.js'), 'utf8'), AJS = fs.readFileSync(path.join(WEB, 'admin/admin.js'), 'utf8');
  const restart = 'KW.world.start(KW.packText.concat(got.files.map(f => f.text)), ';
  assert.ok(MAIN.indexOf('KW.knight.add(got)') > 0 && MAIN.indexOf(restart) > MAIN.indexOf('KW.knight.add(got)'));
  assert.ok(MAIN.indexOf('overlay(); kindsKey = \'\'; settle();') > MAIN.indexOf(restart), 'the overlay and the devices are set again');
  assert.ok(AJS.indexOf('K.add(got)') > 0 && AJS.indexOf(restart) > AJS.indexOf('K.add(got)'));
  assert.ok(AJS.includes('K.fetchPacks((url, init) => fetch(url, init), \'../\')'), 'the admin page fetches data/packs/ beside the walls');
  assert.ok(AJS.includes('KW.world.start(KW.packText, own === \'dev\')'));
});

// ---- The admin page ------------------------------------------------------------------------------------

test('the admin page loads what the walls load to draw, in their order: the compiler, the cat and the medieval world\'s pack among them', () => {
  const wall = scriptsOf(INDEX).filter(s => !['js/demo.js', 'js/main.js'].includes(s));
  const admin = scriptsOf(ADMIN);
  assert.equal(admin[admin.length - 1], 'admin.js');
  assert.ok(admin.slice(0, -1).every(s => s.startsWith('../')), 'every drawing script from the walls\' own folder');
  assert.deepEqual(admin.slice(0, -1).map(s => s.slice(3)), wall);
  for (const f of ['js/world.js', 'js/cat.js', 'packs/medieval.pack.js']) assert.ok(wall.includes(f), f);
});

test('fetchPacks reads data/packs/ beside the page, or beside the walls from the admin page one level down, and nowhere else', async () => {
  const s = sandbox(), asked = [];
  const get = url => { asked.push(url); return Promise.resolve({ status: url.endsWith('index.json') ? 200 : 404, ok: url.endsWith('index.json'), headers: { get: () => null }, text: async () => JSON.stringify({ packs: ['x.pack.json'] }) }); };
  for (const root of [undefined, '../', '../../', '/', 'https://example.com/', '..']) await s.KW.knight.fetchPacks(get, root);
  assert.deepEqual(asked, ['data/packs/index.json', 'data/packs/x.pack.json', '../data/packs/index.json', '../data/packs/x.pack.json',
    'data/packs/index.json', 'data/packs/x.pack.json', 'data/packs/index.json', 'data/packs/x.pack.json', 'data/packs/index.json', 'data/packs/x.pack.json',
    'data/packs/index.json', 'data/packs/x.pack.json']);
});

test('the admin page, started as it starts, draws its scene previews from the pack, as a wall does', () => {
  // the admin page's own scripts, without admin.js, which needs a server
  const lines = [], box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, console: { info: l => lines.push(l), warn: l => lines.push(l), log() {} } });
  for (const f of scriptsOf(ADMIN).slice(0, -1)) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, 'admin', f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(KW.packText, true, { look: {} });
  const st = KW.world.start(KW.packText, true);
  assert.equal(st.source, 'pack', st.note);
  assert.deepEqual(Object.values(plain(st.scenes)).filter(v => v !== 'pack'), []);
  assert.equal(KW.world.cast.members['pet.cat'], 'pack', 'the cat is compiled, with cat.js loaded');
  assert.equal(typeof KW.scenes.court.drawn, 'function');
});
