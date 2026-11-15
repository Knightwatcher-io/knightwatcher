// Tests for the scene compiler, web/js/world.js, and the medieval world's pack that ships with the
// page, web/packs/medieval.pack.json: that the pack reads clean, where a page draws the camp and the
// cellar from (the pack on a 'dev' page, code on a deployed page until the pack is signed, code when
// the pack is refused, missing or fails to compile), the console lines and the status, the long
// names, and what the compiler builds and refuses. Run with: node --test tests/web/
//
// That each scene from the pack draws what the code draws, call for call, and keys its backdrop
// alike, is tests/web/scenes.test.js's; that its hosts and quiet agree with the engine's lists, and
// that the foe's and the places' checks hold on it, tests/web/world-scenes.test.js's. The page's scripts run under Node in a sandbox, as in
// tests/web/loading.test.js; a signed pack is signed with a key generated in memory for the run.
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
/* The pack as it ships, signed after its signing run, and an unsigned copy of it (any sig taken off),
   which the tests sign with a key of their own or leave unsigned. */
const SHIPPED = fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8');
const TEXT = SIGN.withoutSig(SHIPPED);
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
/* The scripts index.html loads, in its order, but the files that drive the page (state, engine,
   demo, main): the drawing, the scenes, the pack library, the compiler and the carriers. */
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const MISSING = 'sig: is missing, and this page accepts only signed packs';

/* The page's scripts in a sandbox, drawing into a context that writes one line per call, with the
   console's lines as [level, text]: { box, KW, W, log, lines, code }, code the code scenes as they
   were before anything was started. */
function sandbox() {
  const log = [], lines = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
  const box = vm.createContext({ window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.devices = { draw() { log.push('devices'); } };
  KW.draw.setCtx(ctx);
  return { box, KW, W: KW.world, log, lines, code: Object.assign({}, KW.scenes) };
}

/* The pack's text with its pack changed by edit. */
function edited(edit) {
  const env = JSON.parse(TEXT);
  edit(env.pack);
  return JSON.stringify(env, null, 2) + '\n';
}
/* The text signed with a key made for the run, under kid, and the keys option that knows it. */
const KEY = crypto.generateKeyPairSync('ed25519');
function signedText(text) {
  const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(text).pack)), KEY.privateKey).toString('base64');
  return SIGN.withSig(text, { alg: 'ed25519', kid: 'test1', value });
}
const keysIn = s => ({ test1: vm.runInContext(`new Uint8Array([${[...Buffer.from(KEY.publicKey.export({ format: 'jwk' }).x, 'base64url')]}])`, s.box) });

const CODE = 'knightwatcher: the scenes of kw.medieval are drawn from code: ';

// ---- The pack ---------------------------------------------------------------------------------------

test('the medieval world\'s pack reads clean: kw.medieval 0.2.0, format 1.1, the camp, the cellar and its stamps', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([r.id, r.version, plain(r.format), r.signed], ['kw.medieval', '0.2.0', [1, 1], false]);
  assert.deepEqual(plain(r.provides), ['scenes', 'stamps']);
  assert.deepEqual(Object.keys(r.data.scenes), ['camp', 'cellar']);
  assert.deepEqual(Object.keys(r.data.stamps), ['sconce', 'barrel']);
  // the costs the counts step found, at the widest screen the checks assume
  assert.deepEqual(plain(r.world.scenes.camp), { still: { n: 66, cost: 56668 }, frame: { n: 7, cost: 718, glows: 8 } });
  assert.deepEqual(plain(r.world.scenes.cellar), { still: { n: 440, cost: 76803 }, frame: { n: 3, cost: 120, glows: 1 } });
  // a deployed page refuses it unsigned
  assert.deepEqual([PK.read(TEXT).ok, PK.read(TEXT).step, PK.read(TEXT).reason], [false, 'signature', MISSING]);
});

test('the pack as it ships: signed, a deployed page draws the camp and the cellar from it; unsigned, from code', () => {
  const s = sandbox(), st = s.W.start([SHIPPED], false);
  if (Object.prototype.hasOwnProperty.call(JSON.parse(SHIPPED), 'sig')) {
    assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.2.0', signed: true }, st.note);
    assert.deepEqual(plain(st.scenes), { camp: 'pack', cellar: 'pack' });
  } else {
    assert.deepEqual([st.source, st.refused.step], ['code', 'signature']);
  }
});

test('the page loads the compiler after the pack library and the medieval carrier after the base pack\'s, and starts the scenes after the knight', () => {
  const list = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1]);
  const at = f => list.indexOf(f);
  assert.ok(at('js/pack.js') >= 0 && at('js/world.js') > at('js/pack.js') && at('js/world.js') < at('js/main.js'));
  assert.ok(at('js/scenes/cellar.js') < at('js/world.js'), 'the code scenes are in place before the compiler can replace them');
  assert.equal(at('packs/medieval.pack.js'), at('packs/base.pack.js') + 1);
  const main = fs.readFileSync(path.join(WEB, 'js/main.js'), 'utf8');
  assert.ok(main.indexOf('KW.world.start(KW.packText, ownVersion === \'dev\')') > main.indexOf('KW.knight.start(KW.packText'));
  const s = sandbox();
  assert.ok(s.KW.packText.includes(SHIPPED), 'the carrier pushes the pack file\'s text');
});

// ---- Where the scenes are drawn from ------------------------------------------------------------------

/* The scenes kw.medieval gives, in the pack's order. */
const GIVEN = ['camp', 'cellar'];

test('a dev page draws the camp and the cellar from kw.medieval unsigned, under their short names and their long ones, and says so', () => {
  const s = sandbox(), before = Object.keys(s.KW.scenes);
  const st = s.W.start([TEXT], true);
  assert.equal(s.W.status, st);
  assert.deepEqual(plain(st), { source: 'pack', pack: { id: 'kw.medieval', version: '0.2.0', signed: false }, refused: null, scenes: { camp: 'pack', cellar: 'pack' }, faults: [],
    note: 'knightwatcher: the scenes camp and cellar are drawn from the pack kw.medieval 0.2.0, unsigned' });
  assert.deepEqual(s.lines, [['info', st.note]]);
  for (const n of GIVEN) {
    const sc = s.KW.scenes[n];
    assert.notEqual(sc, s.code[n], n);
    assert.equal(s.KW.scenes['kw.medieval/' + n], sc, n);
  }
  // the long names are not listed, so the engine and the settings see the same seven scenes
  assert.deepEqual(Object.keys(s.KW.scenes), before);
  for (const n of before.filter(n => !GIVEN.includes(n))) assert.equal(s.KW.scenes[n], s.code[n], n);
});

test('a deployed page refuses kw.medieval unsigned and draws the camp and the cellar from code, with one line', () => {
  const s = sandbox(), st = s.W.start([TEXT], false);
  assert.deepEqual(plain(st), { source: 'code', pack: null, refused: { id: 'kw.medieval', step: 'signature', reason: MISSING }, scenes: {}, faults: [],
    note: CODE + 'the pack kw.medieval was refused at the signature step' });
  assert.deepEqual(s.lines, [['warn', st.note]]);
  for (const n of GIVEN) {
    assert.equal(s.KW.scenes[n], s.code[n], n);
    assert.equal(s.KW.scenes['kw.medieval/' + n], undefined, n);
  }
});

test('a deployed page draws the camp and the cellar from kw.medieval once it is signed with a key it knows', () => {
  const s = sandbox(), st = s.W.start([signedText(TEXT)], false, { keys: keysIn(s) });
  assert.equal(st.source, 'pack', st.note);
  assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.2.0', signed: true });
  assert.equal(st.note, 'knightwatcher: the scenes camp and cellar are drawn from the pack kw.medieval 0.2.0, signed');
  for (const n of GIVEN) assert.notEqual(s.KW.scenes[n], s.code[n], n);
  // a signature that does not verify is refused, as for any pack
  const bad = s.W.start([signedText(TEXT).replace('"Cellar"', '"Cellars"')], false, { keys: keysIn(s) });
  assert.deepEqual([bad.source, bad.refused.step], ['code', 'signature']);
  for (const n of GIVEN) assert.equal(s.KW.scenes[n], s.code[n], n);
});

test('a compile that throws leaves that scene the code scene, with the reason in the status and the console, and the others from the pack', () => {
  const s = sandbox(), lib = s.KW.pack, real = lib.read(TEXT, { allowUnsigned: true });
  assert.equal(real.ok, true);
  // a read that gives a scene the compiler cannot take: here a shape of a kind it has never heard of
  const broken = JSON.parse(JSON.stringify(real.data));
  broken.scenes.cellar.still[0].shapes[3].k = 'zz';
  s.KW.pack = Object.assign({}, lib, { read: () => Object.assign({}, real, { data: broken }) });
  const st = s.W.start([TEXT], true);
  assert.equal(st.source, 'pack', 'the camp is still drawn from the pack');
  assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.2.0', signed: false });
  assert.deepEqual(plain(st.scenes), { camp: 'pack', cellar: 'code' });
  assert.deepEqual(plain(st.faults), [{ scene: 'cellar', reason: 'scenes.cellar.still[0].shapes[3].k: the shape kind "zz" is not built in this engine yet' }]);
  assert.deepEqual(s.lines, [['warn', 'knightwatcher: the scene cellar is drawn from code: it could not be compiled: ' + st.faults[0].reason],
    ['info', 'knightwatcher: the scene camp is drawn from the pack kw.medieval 0.2.0, unsigned']]);
  assert.equal(s.KW.scenes.cellar, s.code.cellar);
  assert.equal(s.KW.scenes['kw.medieval/cellar'], undefined);
  assert.notEqual(s.KW.scenes.camp, s.code.camp);
  // with every scene failing, none is drawn from the pack
  for (const n of GIVEN) broken.scenes[n].still[0].shapes[3].k = 'zz';
  s.lines.length = 0;
  const all = s.W.start([TEXT], true);
  assert.deepEqual([all.source, plain(all.scenes), all.faults.length], ['code', { camp: 'code', cellar: 'code' }, 2]);
  assert.deepEqual(s.lines.map(l => l[0]), ['warn', 'warn']);
  for (const n of GIVEN) assert.equal(s.KW.scenes[n], s.code[n], n);
  // the same from a pack the library reads clean, naming a part of format 1.1 this engine does
  // not build yet (a dithered patch); this one changes when that part is built
  s.KW.pack = lib; s.lines.length = 0;
  const dith = edited(p => { p.scenes.cellar.still[0].shapes.push({ k: 'dith', p: [0, 0], w: 8, h: 8, colour: '#000000' }); });
  assert.equal(lib.read(dith, { allowUnsigned: true }).ok, true);
  const d = s.W.start([dith], true);
  assert.deepEqual(plain(d.scenes), { camp: 'pack', cellar: 'code' });
  assert.match(d.faults[0].reason, /^scenes\.cellar\.still\[0\]\.shapes\[\d+\]\.k: the shape kind "dith" is not built in this engine yet$/);
  assert.equal(s.KW.scenes.cellar, s.code.cellar);
});

test('a read that throws, no kw.medieval among the texts, or no pack library: the camp and the cellar are drawn from code', () => {
  const s = sandbox(), lib = s.KW.pack;
  s.KW.pack = Object.assign({}, lib, { read: () => { throw new Error('boom'); } });
  let st = s.W.start([TEXT], true);
  assert.deepEqual(plain(st.refused), { id: 'kw.medieval', step: 'size', reason: 'the pack could not be read: boom' });
  assert.equal(st.note, CODE + 'the pack kw.medieval was refused at the size step');
  s.KW.pack = lib;
  st = s.W.start([s.KW.packText[0], 'not json'], true);
  assert.deepEqual([st.source, st.refused, st.note], ['code', null, CODE + 'no pack kw.medieval is loaded']);
  s.KW.pack = undefined;
  st = s.W.start([TEXT], true);
  assert.deepEqual([st.source, st.note], ['code', CODE + 'the pack library is not loaded']);
  for (const n of GIVEN) assert.equal(s.KW.scenes[n], s.code[n], n);
});

test('starting again puts the code scenes back first, and of two copies of kw.medieval the higher version is drawn', () => {
  const s = sandbox();
  s.W.start([TEXT], true);
  for (const n of GIVEN) assert.notEqual(s.KW.scenes[n], s.code[n], n);
  s.W.start([TEXT], false);
  for (const n of GIVEN) {
    assert.equal(s.KW.scenes[n], s.code[n], n);
    assert.equal(s.KW.scenes['kw.medieval/' + n], undefined, n);
  }
  const newer = edited(p => { p.version = '0.3.0'; });
  const st = s.W.start([TEXT, newer], true);
  assert.equal(st.pack.version, '0.3.0');
});

// ---- What the compiler builds ------------------------------------------------------------------------

/* The scene id (the cellar when left out) of the pack's text, compiled in a sandbox, with the view
   of a wide screen. */
function compiled(text, id) {
  const s = sandbox(), r = s.KW.pack.read(text, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  Object.assign(s.KW.view, { HL: -236, HR: 1196, HT: -2 });
  return { s, sc: s.W.compile(r, id || 'cellar') };
}
const frameOf = over => Object.assign({ w: { id: 'idle' }, tv: false, inBed: false, helmOff: false, strike: false }, over);

test('a still layer\'s when chooses whether it is painted, and the backdrop\'s key follows every predicate the still layers read', () => {
  const text = edited(p => {
    const sc = p.scenes.cellar;
    sc.still.push({ when: ['helmOff', '!cond:disk_full'], shapes: [{ k: 'rect', p: [1, 2], w: 3, h: 4, fill: '#123456' }] });
    sc.still.push({ when: ['night'], shapes: [{ k: 'rect', p: [5, 6], w: 7, h: 8, fill: '#654321' }] });
    sc.still.push({ when: ['day'], shapes: [{ k: 'rect', p: [9, 9], w: 9, h: 9, fill: '#abcdef' }] });
  });
  const { s, sc } = compiled(text);
  const painted = f => { s.log.length = 0; sc.paint(frameOf(f)); return s.log.join('\n'); };
  assert.ok(painted({ helmOff: true }).includes('s #123456\nr 1 2 3 4'));
  assert.ok(!painted({ helmOff: true, w: { id: 'disk_full' } }).includes('#123456'));
  assert.ok(!painted({ helmOff: false }).includes('#123456'));
  // night always holds and day never does, in 1.1
  assert.ok(painted({}).includes('s #654321\nr 5 6 7 8') && !painted({}).includes('#abcdef'));
  // one place for each of helmOff, !cond:disk_full, night and day, in the order first named
  const keys = ['helmOff', 'idle', 'disk_full'].map(x => sc.key(frameOf(x === 'helmOff' ? { helmOff: true } : { w: { id: x } })));
  assert.deepEqual(keys, ['1110', '0110', '0010']);
});

test('terms add up in the order they are written, a translucent colour is spelt as the scenes spell it, and a glow\'s alpha follows its wave', () => {
  const { s, sc } = compiled(TEXT);
  s.log.length = 0;
  sc.draw(1234, frameOf({}));
  const a = .09 + .025 * Math.sin(1234 / 150);
  assert.deepEqual(s.log.slice(0, 2), ['fillStyle #ffb000', 'a ' + a * .5].map(l => l.replace(/^fillStyle/, 's')));
  assert.equal(s.log[s.log.length - 1], 'devices', 'the things mark draws the devices');
  s.log.length = 0;
  sc.paint(frameOf({}));
  assert.ok(s.log.includes('s rgba(0,0,0,.3)') && s.log.includes('s rgba(200,200,220,.18)') && s.log.includes('s rgba(30,15,5,.45)'));
  assert.ok(!s.log.some(l => /rgba\(.*,0\./.test(l)));
});

test('what the compiler does not build yet it refuses by name, and the reason names the field', () => {
  const cases = [
    ['a layer\'s groups', p => { p.scenes.cellar.moving[0].groups = { g1: { pivot: [0, 0] } }; }, 'scenes.cellar.moving[0].groups: a layer\'s groups is not built in this engine yet'],
    ['a tile\'s picks', p => { const t = p.scenes.cellar.still[0].shapes[5]; t.pick = { wood: { seed: 1, of: ['#000000', '#111111'] } }; t.shapes[0].fill = '@pick.wood'; }, 'scenes.cellar.still[0].shapes[5].pick: a tile\'s picks is not built in this engine yet'],
    ['a clip', p => { p.stamps.barrel[14].clip = [null, 8]; }, 'stamps.barrel[14].clip: a clip in a scene is not built in this engine yet'],
    ['a rest', p => { p.scenes.cellar.rests = { shelf: { kind: 'surface', x: 300, y: 380, w: 40, h: 40 } }; }, 'scenes.cellar.rests: the scene\'s rests is not built in this engine yet'],
    // the flies and the crate follow the one flag outdoors, so a scene hosts both or neither
    ['the flies alone', p => { p.scenes.cellar.hosts = ['flies']; }, 'scenes.cellar.hosts: hosting the flies without the crate is not built in this engine yet'],
    ['the crate alone', p => { p.scenes.camp.hosts = ['crate', 'feast', 'foe']; }, 'scenes.camp.hosts: hosting the crate without the flies is not built in this engine yet', 'camp'],
    ['a foe\'s wall', p => { p.scenes.camp.foe.wall = { period: 160, offset: 70, high: [80, 411], low: 464 }; }, 'scenes.camp.foe.wall: a foe\'s wall is not built in this engine yet', 'camp'],
  ];
  for (const [what, edit, reason, id] of cases) {
    const text = edited(edit), s = sandbox(), r = s.KW.pack.read(text, { allowUnsigned: true });
    assert.equal(r.ok, true, what + ': ' + r.reason);
    assert.throws(() => s.W.compile(r, id || 'cellar'), e => e.message === reason, what);
  }
});

test('hosts and the foe: the camp, hosting the flies and the crate, is outdoors and gives the foe\'s zone; the cellar, hosting nothing, neither', () => {
  const camp = compiled(TEXT, 'camp').sc, cellar = compiled(TEXT).sc, code = sandbox().code;
  assert.equal(camp.outdoors, true);
  assert.deepEqual(plain(camp.foeZone), plain(code.camp.foeZone));
  assert.deepEqual(plain(camp.foeZone), { side: -1, spans: [[70, 494]] });
  assert.ok(Object.isFrozen(camp.foeZone) && Object.isFrozen(camp.foeZone.spans[0]));
  assert.equal(camp.wallAt, undefined, 'with no wall the goblin digs out of the ground');
  for (const k of ['outdoors', 'foeZone', 'wallAt']) assert.equal(k in cellar, false, k);
  // the feast and the foe are played where the engine's lists say, so hosting them alone changes
  // nothing the compiled scene gives
  const feast = compiled(edited(p => { p.scenes.cellar.hosts = ['feast']; })).sc;
  assert.equal('outdoors' in feast, false);
  // the camp's moving layer draws the fire, the embers, the devices and the fireflies, in that order
  const { s, sc } = compiled(TEXT, 'camp');
  s.log.length = 0;
  sc.draw(0, frameOf({}));
  const at = s.log.indexOf('devices');
  assert.ok(at > 0 && at < s.log.length - 1, 'the fireflies are drawn after the devices');
});

test('the compiled cellar and camp give paint, draw and key, and neither over nor act, having no over layers and no acts', () => {
  const { sc } = compiled(TEXT);
  for (const k of ['paint', 'draw', 'key']) assert.equal(typeof sc[k], 'function', k);
  assert.equal(sc.over, undefined, 'no over layers, so no over');
  assert.equal(sc.act, undefined);
  assert.deepEqual(plain(sc.places), plain(sandbox().code.cellar.places));
  const camp = compiled(TEXT, 'camp').sc;
  for (const k of ['paint', 'draw', 'key']) assert.equal(typeof camp[k], 'function', 'camp ' + k);
  assert.equal(camp.over, undefined); assert.equal(camp.act, undefined);
  assert.equal(camp.key(frameOf({})), '', 'the camp\'s still layer waits on nothing, so its backdrop has one key');
});
