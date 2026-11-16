// Tests for the scene compiler, web/js/world.js, and the medieval world's pack that ships with the
// page, web/packs/medieval.pack.json: that the pack reads clean, where a page draws the battlement,
// the camp, the yard, the cellar and the smithy from (the pack on a 'dev' page, code on a deployed
// page until the pack is signed, code when the pack is refused, missing or fails to compile), the
// console lines and the status, the long names, and what the compiler builds and refuses. Run with:
// node --test tests/web/
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
  // written without spaces: pretty-printed, the pack with its patrons passes the 512 KiB a pack may
  // weigh
  return JSON.stringify(env) + '\n';
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

test('the medieval world\'s pack reads clean: kw.medieval 0.4.0, format 1.1, the battlement, the camp, the yard, the cellar, the smithy, the house and their stamps', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([r.id, r.version, plain(r.format), r.signed], ['kw.medieval', '0.4.0', [1, 1], false]);
  assert.deepEqual(plain(r.provides), ['palettes', 'scenes', 'cast', 'props', 'stamps']);
  assert.deepEqual(Object.keys(r.data.scenes), ['battlement', 'camp', 'yard', 'cellar', 'smithy', 'house']);
  assert.deepEqual(Object.keys(r.data.stamps), ['sconce', 'barrel', 'peg', 'berry.up.dark', 'berry.up.lit', 'berry.down.dark', 'berry.down.lit',
    'vm.up.dots-1', 'vm.up.dots-2', 'vm.up.lights-1', 'vm.up.lights-2', 'vm.gone.dots', 'vm.gone.lights']);
  assert.deepEqual(plain(r.data.palettes), { house: { screen: '#7fe9ff' } });
  // the costs the counts step found, at the widest screen the checks assume
  assert.deepEqual(plain(r.world.scenes.battlement), { still: { n: 342, cost: 25967 }, frame: { n: 7, cost: 185, glows: 1 } });
  assert.deepEqual(plain(r.world.scenes.camp), { still: { n: 66, cost: 56668 }, frame: { n: 7, cost: 718, glows: 8 } });
  assert.deepEqual(plain(r.world.scenes.yard), { still: { n: 298, cost: 28929 }, frame: { n: 44, cost: 2086, glows: 1 } });
  assert.deepEqual(plain(r.world.scenes.cellar), { still: { n: 440, cost: 76803 }, frame: { n: 3, cost: 120, glows: 1 } });
  assert.deepEqual(plain(r.world.scenes.smithy), { still: { n: 339, cost: 15212 }, frame: { n: 9, cost: 508, glows: 2 } });
  assert.deepEqual(plain(r.world.scenes.house), { still: { n: 370, cost: 71245 }, frame: { n: 46, cost: 2128, glows: 3 } });
  // a deployed page refuses it unsigned
  assert.deepEqual([PK.read(TEXT).ok, PK.read(TEXT).step, PK.read(TEXT).reason], [false, 'signature', MISSING]);
});

test('the pack as it ships: signed, a deployed page draws its scenes from it; unsigned, from code', () => {
  const s = sandbox(), st = s.W.start([SHIPPED], false);
  if (Object.prototype.hasOwnProperty.call(JSON.parse(SHIPPED), 'sig')) {
    assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.4.0', signed: true }, st.note);
    assert.deepEqual(plain(st.scenes), { battlement: 'pack', camp: 'pack', yard: 'pack', cellar: 'pack', smithy: 'pack', house: 'pack' });
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
const GIVEN = ['battlement', 'camp', 'yard', 'cellar', 'smithy', 'house'];

test('a dev page draws the battlement, the camp, the yard, the cellar, the smithy and the house from kw.medieval unsigned, under their short names and their long ones, and says so', () => {
  const s = sandbox(), before = Object.keys(s.KW.scenes);
  const st = s.W.start([TEXT], true);
  assert.equal(s.W.status, st);
  assert.deepEqual(plain(st), { source: 'pack', pack: { id: 'kw.medieval', version: '0.4.0', signed: false }, refused: null,
    scenes: { battlement: 'pack', camp: 'pack', yard: 'pack', cellar: 'pack', smithy: 'pack', house: 'pack' }, faults: [],
    note: 'knightwatcher: the scenes battlement, camp, yard, cellar, smithy and house are drawn from the pack kw.medieval 0.4.0, unsigned' });
  assert.deepEqual(s.lines, [['info', st.note]]);
  for (const n of GIVEN) {
    const sc = s.KW.scenes[n];
    assert.notEqual(sc, s.code[n], n);
    assert.equal(s.KW.scenes['kw.medieval/' + n], sc, n);
  }
  // the long names are not listed, so the engine and the settings see the same seven scenes, and
  // the court, which waits for the patron, stays the code scene
  assert.deepEqual(Object.keys(s.KW.scenes), before);
  assert.deepEqual(before.filter(n => !GIVEN.includes(n)), ['court']);
  assert.equal(s.KW.scenes.court, s.code.court);
  for (const n of before.filter(n => !GIVEN.includes(n))) assert.equal(s.KW.scenes[n], s.code[n], n);
});

test('a deployed page refuses kw.medieval unsigned and draws its scenes from code, with one line', () => {
  const s = sandbox(), st = s.W.start([TEXT], false);
  assert.deepEqual(plain(st), { source: 'code', pack: null, refused: { id: 'kw.medieval', step: 'signature', reason: MISSING }, scenes: {}, faults: [],
    note: CODE + 'the pack kw.medieval was refused at the signature step' });
  assert.deepEqual(s.lines, [['warn', st.note]]);
  for (const n of GIVEN) {
    assert.equal(s.KW.scenes[n], s.code[n], n);
    assert.equal(s.KW.scenes['kw.medieval/' + n], undefined, n);
  }
});

test('a deployed page draws the battlement, the camp, the yard, the cellar, the smithy and the house from kw.medieval once it is signed with a key it knows', () => {
  const s = sandbox(), st = s.W.start([signedText(TEXT)], false, { keys: keysIn(s) });
  assert.equal(st.source, 'pack', st.note);
  assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.4.0', signed: true });
  assert.equal(st.note, 'knightwatcher: the scenes battlement, camp, yard, cellar, smithy and house are drawn from the pack kw.medieval 0.4.0, signed');
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
  assert.equal(st.source, 'pack', 'the battlement, the camp, the yard, the smithy and the house are still drawn from the pack');
  assert.deepEqual(plain(st.pack), { id: 'kw.medieval', version: '0.4.0', signed: false });
  assert.deepEqual(plain(st.scenes), { battlement: 'pack', camp: 'pack', yard: 'pack', cellar: 'code', smithy: 'pack', house: 'pack' });
  assert.deepEqual(plain(st.faults), [{ scene: 'cellar', reason: 'scenes.cellar.still[0].shapes[3].k: the shape kind "zz" is not built in this engine yet' }]);
  assert.deepEqual(s.lines, [['warn', 'knightwatcher: the scene cellar is drawn from code: it could not be compiled: ' + st.faults[0].reason],
    ['info', 'knightwatcher: the scenes battlement, camp, yard, smithy and house are drawn from the pack kw.medieval 0.4.0, unsigned']]);
  assert.equal(s.KW.scenes.cellar, s.code.cellar);
  assert.equal(s.KW.scenes['kw.medieval/cellar'], undefined);
  assert.notEqual(s.KW.scenes.camp, s.code.camp);
  // with every scene failing, none is drawn from the pack
  for (const n of GIVEN) broken.scenes[n].still[0].shapes[3].k = 'zz';
  s.lines.length = 0;
  const all = s.W.start([TEXT], true);
  assert.deepEqual([all.source, plain(all.scenes), all.faults.length], ['code', { battlement: 'code', camp: 'code', yard: 'code', cellar: 'code', smithy: 'code', house: 'code' }, 6]);
  assert.deepEqual(s.lines.map(l => l[0]), ['warn', 'warn', 'warn', 'warn', 'warn', 'warn']);
  for (const n of GIVEN) assert.equal(s.KW.scenes[n], s.code[n], n);
  // the same from a pack the library reads clean, naming a part of format 1.1 this engine does
  // not build yet (a dithered patch); this one changes when that part is built
  s.KW.pack = lib; s.lines.length = 0;
  const dith = edited(p => { p.scenes.cellar.still[0].shapes.push({ k: 'dith', p: [0, 0], w: 8, h: 8, colour: '#000000' }); });
  assert.equal(lib.read(dith, { allowUnsigned: true }).ok, true);
  const d = s.W.start([dith], true);
  assert.deepEqual(plain(d.scenes), { battlement: 'pack', camp: 'pack', yard: 'pack', cellar: 'code', smithy: 'pack', house: 'pack' });
  assert.match(d.faults[0].reason, /^scenes\.cellar\.still\[0\]\.shapes\[\d+\]\.k: the shape kind "dith" is not built in this engine yet$/);
  assert.equal(s.KW.scenes.cellar, s.code.cellar);
});

test('a read that throws, no kw.medieval among the texts, or no pack library: the scenes are drawn from code', () => {
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
  const newer = edited(p => { p.version = '0.5.0'; });
  const st = s.W.start([TEXT, newer], true);
  assert.equal(st.pack.version, '0.5.0');
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

/* The battlement's layer of the rope's sparks, in a pack being edited. */
const sparks = p => p.scenes.battlement.moving[1];

test('what the compiler does not build yet it refuses by name, and the reason names the field', () => {
  const cases = [
    // keyframes: a clock in ms with show, dx, dy, wave and palette tracks, stepped, is built, and
    // nothing else of them yet
    ['a clock in seconds', p => { sparks(p).anim = { period: 0.45, loop: true, tracks: [{ g: 'sparks', ch: 'show', keys: [[0, 1], [0.333, 0]] }] }; }, 'scenes.battlement.moving[1].anim: a clock in seconds is not built in this engine yet', 'battlement'],
    ['an ease but step', p => { sparks(p).anim.tracks[0] = { g: 'sparks', ch: 'dy', ease: 'linear', keys: [[0, 0], [150, -2]] }; }, 'scenes.battlement.moving[1].anim.tracks[0].ease: the ease "linear" is not built in this engine yet', 'battlement'],
    ['a channel but show, dx and dy', p => { sparks(p).anim.tracks[0] = { g: 'sparks', ch: 'alpha', ease: 'step', keys: [[0, 1], [150, 0.5]] }; }, 'scenes.battlement.moving[1].anim.tracks[0].ch: the channel "alpha" is not built in this engine yet', 'battlement'],
    ['"only" on a shape', p => { p.scenes.cellar.still[0].shapes[5].shapes[0].only = [31, 5]; }, 'scenes.cellar.still[0].shapes[5].shapes[0].only: "only" on a shape is not built in this engine yet'],
    ['a seat', p => { p.scenes.cellar.seat = { x: 820, y: 505, bubble: [672, 180], turn: 3200, mouth: 230 }; }, 'scenes.cellar.seat: the scene\'s seat is not built in this engine yet'],
    // a triggered effect runs on the clock of the scene's one act
    ['straw on the hammer\'s blow', p => { p.scenes.smithy.moving[1].shapes[0].piece = 'straw'; }, 'scenes.smithy.moving[1].shapes[0].piece: a burst of straw on the hammer\'s blow is not built in this engine yet', 'smithy'],
    ['a target and an anvil', p => { p.scenes.smithy.target = { group: 'fire', hitAt: 420, every: 5600 }; p.scenes.smithy.moving[0].groups = { fire: { pivot: [840, 410] } }; },
      'scenes.smithy: a scene with both a target and an anvil is not built in this engine yet', 'smithy'],
    // the flies and the crate follow the one flag outdoors, so a scene hosts both or neither
    ['the flies alone', p => { p.scenes.cellar.hosts = ['flies']; }, 'scenes.cellar.hosts: hosting the flies without the crate is not built in this engine yet'],
    ['the crate alone', p => { p.scenes.camp.hosts = ['crate', 'feast', 'foe']; }, 'scenes.camp.hosts: hosting the crate without the flies is not built in this engine yet', 'camp'],
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

test('a foe\'s wall gives the code scene\'s wallAt, x by x, and a foe zone with no wall gives none', () => {
  const bat = compiled(TEXT, 'battlement').sc, code = sandbox().code.battlement;
  assert.equal(typeof bat.wallAt, 'function');
  assert.deepEqual(plain(bat.foeZone), plain(code.foeZone));
  for (let x = -1200; x <= 2400; x++) assert.equal(bat.wallAt(x), code.wallAt(x), 'x ' + x);
  for (const x of [-0.5, 9.75, 10, 89.999, 90, 1e6 + 0.25]) assert.equal(bat.wallAt(x), code.wallAt(x), 'x ' + x);
  // the same rule with other numbers: high where x + offset falls in the first width of each period
  const other = compiled(edited(p => { p.scenes.camp.foe.wall = { period: 100, offset: -30, high: [40, 400], low: 450 }; }), 'camp').sc;
  assert.deepEqual([0, 29, 30, 69, 70, 129, 130, -1, -61, -71].map(other.wallAt), [450, 450, 400, 400, 450, 450, 400, 450, 400, 450]);
});

test('a layer\'s keyframes: a show track on a clock in ms hides its group\'s shapes as the code\'s blink does, and the layer\'s when still holds first', () => {
  const { s, sc } = compiled(TEXT, 'battlement');
  const drawn = (t, id) => { s.log.length = 0; sc.draw(t, frameOf({ w: { id } })); return s.log.includes('r 740 290 4 4'); };
  for (let t = 0; t <= 4000; t += 25) assert.equal(drawn(t, 'wan_down'), Math.floor(t / 150) % 3 === 0, 't ' + t);
  for (const t of [0, 149, 149.5, 150, 449, 450, 599, 600, 2300, 1e7]) assert.equal(drawn(t, 'wan_down'), Math.floor(t / 150) % 3 === 0, 't ' + t);
  assert.equal(drawn(0, 'idle'), false, 'no sparks without the cut rope');
  // all three sparks, white the last
  s.log.length = 0; sc.draw(0, frameOf({ w: { id: 'wan_down' } }));
  assert.deepEqual(s.log.slice(-6), ['s #fff3a0', 'r 740 290 4 4', 's #fff3a0', 'r 760 300 3 3', 's #ffffff', 'r 748 306 3 3']);
  // a clock that starts at a phase, and one that plays once and holds its last key
  const shifted = compiled(edited(p => { sparks(p).anim.phase = 0.5; }), 'battlement'), once = compiled(edited(p => { sparks(p).anim.loop = false; }), 'battlement');
  const shows = (c, t) => { c.s.log.length = 0; c.sc.draw(t, frameOf({ w: { id: 'wan_down' } })); return c.s.log.includes('r 740 290 4 4'); };
  assert.deepEqual([0, 224, 225, 374, 375].map(t => shows(shifted, t)), [false, false, true, true, false]);
  assert.deepEqual([0, 149, 150, 450, 5000].map(t => shows(once, t)), [true, true, false, false, false]);
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
  // the battlement's rope is painted while the WAN is down, so its key has one place for it
  const bat = compiled(TEXT, 'battlement'), painted = id => { bat.s.log.length = 0; bat.sc.paint(frameOf({ w: { id } })); return bat.s.log.length; };
  assert.deepEqual(['idle', 'wan_down', 'attack'].map(id => bat.sc.key(frameOf({ w: { id } }))), ['0', '1', '0']);
  assert.ok(painted('wan_down') > painted('idle'));
});

// ---- The yard's pieces: clips, picks, the target's act --------------------------------------------

/* The camp of the pack's text given a target and a training round, and a moving layer of the target's
   group: a rect in the group, the lean of a post (713 + targetDx * 0.8) and the straw the target sheds. */
const trained = extra => edited(p => {
  const sc = p.scenes.camp;
  sc.rounds[0].act = 'train';
  sc.target = { group: 'dummy', hitAt: 420, every: 5600 };
  sc.moving.push({ groups: { dummy: { pivot: [713, 400] } }, shapes: [
    { k: 'rect', g: 'dummy', p: [700, 340], w: 26, h: 2, fill: '#123456' },
    { k: 'strip', p0: [713, 450], p1: [{ c: 713, targetDx: 0.8 }, 330], hw0: 4, hw1: 4, fill: '#654321' },
    { k: 'fx', fx: 'burst', p: [670, 380], n: 5, piece: 'straw', of: ['#f0d27a', '#d8b45a'] }] });
  if (extra) extra(sc, p);
});

test('the pack library reads targetDx, the target\'s, with three decimals on its coefficient, only in a moving or over layer of a scene with a target', () => {
  assert.equal(PK.read(trained(), { allowUnsigned: true }).ok, true, PK.read(trained(), { allowUnsigned: true }).reason);
  const no = (text, step, reason) => { const r = PK.read(text, { allowUnsigned: true }); assert.deepEqual([r.ok, r.step, r.reason], [false, step, reason]); };
  no(trained(sc => { delete sc.target; sc.rounds[0].act = 'sniff'; sc.moving[1].shapes = sc.moving[1].shapes.slice(1, 2); delete sc.moving[1].groups; }),
    'references', 'pack.scenes.camp.moving[1].shapes[0].p1[0].targetDx: is the target\'s dx, and needs the scene\'s target');
  no(trained(sc => { sc.still[0].shapes.push({ k: 'rect', p: [{ c: 1, targetDx: 1 }, 1], w: 1, h: 1, fill: '#000000' }); }),
    'references', 'pack.scenes.camp.still[0].shapes[66].p[0].targetDx: cannot be used in a still layer');
  no(trained(sc => { sc.moving[1].shapes[1].p1[0].targetDx = 9; }), 'fields', 'pack.scenes.camp.moving[1].shapes[1].p1[0].targetDx: must be a number from -8 to 8');
  // the costs bound the lean over targetDx's range, ACT_RANGE
  assert.deepEqual(plain(PK.ACT_RANGE), { targetDx: [-15, 15], spot: [150, 810] });
});

test('the target\'s act trains as yard.js does: a blow 420 ms into the round, the group moved by the wobble, the post leaning by 0.8 of it, and the straw from the blow', () => {
  const { s, sc } = compiled(trained(), 'camp');
  assert.equal(typeof sc.act, 'function');
  const swings = [];
  s.KW.knight.swing = (o, q, dir) => swings.push([q, dir]);
  const frame = (t, id) => frameOf({ w: { id: id || 'idle', lv: id === 'cpu_hot' ? 2 : 0 }, o: {}, here: { act: 'train', el: t } });
  const drawn = t => { s.log.length = 0; sc.draw(t, frame(t)); return s.log; };
  // before any blow: the group where it was drawn, the post upright, no straw
  assert.ok(drawn(0).includes('r 700 340 26 2'));
  // a swing while the round is under 900 ms in; the blow counts once it is past 420
  for (const t of [0, 300, 420, 430, 1000]) sc.act(t, frame(t));
  assert.deepEqual(swings, [[0, 1], [300 / 900, 1], [420 / 900, 1], [430 / 900, 1]]);
  // struck at 430: at 530 the wobble is Math.round(Math.sin(100 / 60) * 15 * (1 - 100 / 900))
  const w = Math.round(Math.sin(100 / 60) * 15 * (1 - 100 / 900)), log = drawn(530);
  assert.ok(w !== 0 && log.includes(`r ${700 + w} 340 26 2`), 'the group moves by the wobble');
  assert.ok(log.some(l => l === 's #f0d27a') && log.some(l => l === 's #d8b45a'), 'the straw flies');
  assert.ok(!drawn(1500).some(l => l === 's #f0d27a'), 'and is gone after 500 ms');
  assert.ok(drawn(1500).includes('r 700 340 26 2'), 'the wobble dies away by 900 ms');
  // while the CPU runs hot: a swing every second, the eyes half shut, bobbing
  const o = {}; sc.act(2210, { w: { id: 'cpu_hot', lv: 2 }, o, here: null });
  assert.deepEqual([swings[swings.length - 1], o.eyes, o.bob], [[210 / 1000, 1], 'half', 1]);
});

test('an ell\'s clip keeps the rows between its ys, and a tile\'s pick takes a colour at each x by the tile\'s hash', () => {
  const text = edited(p => {
    p.scenes.cellar.still[0].shapes.push({ k: 'ell', p: [100, 100], rx: 10, ry: 10, fill: '#abcdef', clip: [null, 100] });
    p.scenes.cellar.still[0].shapes.push({ k: 'tile', step: 23, phase: 0, from: 0, to: 230, pick: { pebble: { seed: 6, of: ['#2e2619', '#3a3020'] } },
      shapes: [{ k: 'rect', p: [{ x: 1 }, 50], w: 1, h: 1, fill: '@pick.pebble' }] });
  });
  const { s, sc } = compiled(text);
  s.log.length = 0; sc.paint(frameOf({}));
  const at = s.log.indexOf('s #abcdef'), rows = [];
  for (let i = at; i < s.log.length && /^(s #abcdef|r )/.test(s.log[i]); i++) if (s.log[i][0] === 'r') rows.push(+s.log[i].split(' ')[2]);
  assert.deepEqual([Math.min(...rows), Math.max(...rows)], [90, 100], 'the ellipse from 90 to its clip at 100');
  const hsh = s.KW.draw.hsh, picked = [];
  for (let i = 0; i < s.log.length; i++) { const m = /^r (\d+) 50 1 1$/.exec(s.log[i]); if (m) picked.push([+m[1], s.log[i - 1].slice(2)]); }
  assert.deepEqual(picked, Array.from({ length: 10 }, (_, i) => [i * 23, ['#2e2619', '#3a3020'][hsh(i * 23, 6) % 2]]));
});

test('the yard\'s pieces refuse what they do not build by name', () => {
  const cases = [
    ['a burst without a target', p => { p.scenes.cellar.moving[0].shapes.push({ k: 'fx', fx: 'burst', p: [1, 1], piece: 'straw' }); }, 'cellar', /^scenes\.cellar\.moving\[0\]\.shapes\[3\]\.fx: the triggered effect "burst" in a scene without a target or an anvil is not built in this engine yet$/],
    ['sparks on the target\'s hit', null, 'camp', /^scenes\.camp\.moving\[1\]\.shapes\[2\]\.piece: a burst of sparks on the target's hit is not built in this engine yet$/, sc => { sc.moving[1].shapes[2].piece = 'spark'; }],
    ['"g" on an effect', null, 'camp', /^scenes\.camp\.moving\[1\]\.shapes\[2\]\.g: "g" on an effect is not built in this engine yet$/, sc => { sc.moving[1].shapes[2].g = 'dummy'; }],
    ['a pick in a band list', p => { const t = p.scenes.cellar.still[0].shapes[5]; t.pick = { wood: { seed: 1, of: ['#000000', '#111111'] } }; t.shapes[0].fill = [[0.5, '@pick.wood'], [1, '#222222']]; }, 'cellar', /^scenes\.cellar\.still\[0\]\.shapes\[5\]\.shapes\[0\]\.fill\[0\]\[1\]: a pick inside a band list is not built in this engine yet$/],
  ];
  for (const [what, edit, id, reason, camp] of cases) {
    const text = camp ? trained(camp) : edited(edit), s = sandbox(), r = s.KW.pack.read(text, { allowUnsigned: true });
    assert.equal(r.ok, true, what + ': ' + r.reason);
    assert.throws(() => s.W.compile(r, id), e => reason.test(e.message), what);
  }
});

// ---- The smithy's pieces: rests, the rest mark, the anvil's act ---------------------------------------

/* The smithy compiled, with the knight's calls at rest written as lines: { s, sc, K, lines }. */
function smithy(text) {
  const c = compiled(text || TEXT, 'smithy'), K = c.s.KW.knight;
  K.rest.draw = (...a) => c.s.log.push(['rest.draw', ...a].join(' '));
  return Object.assign(c, { K });
}
const at440 = (t, over) => frameOf(Object.assign({ kx: 440, o: {} }, over));

test('rests compile to the code scenes\' form: "flat" and "upright" as angles, a number as it is, and "from": "spot" kept out of the interface', () => {
  const { sc } = smithy(), code = sandbox().code.smithy;
  assert.deepEqual(plain(sc.rests), plain(code.rests));
  assert.equal(sc.rests.anvil.a, Math.PI / 2);
  const other = smithy(edited(p => { Object.assign(p.scenes.smithy.rests, { up: { x: 10, y: 20, a: 'upright' }, slant: { x: 30, y: 40, a: 0.7 } }); })).sc;
  assert.deepEqual([other.rests.up.a, other.rests.slant.a], [0, 0.7]);
  // a scene with no rests gives none, and a scene with an anvil gives no rounds to stroll between
  assert.equal('rests' in compiled(TEXT).sc, false);
  assert.equal('rounds' in sc, false);
  assert.equal(code.rounds, undefined);
});

test('the rest mark paints the gear at rest into the backdrop, counted from the spot where its rest says so, and the key follows the gear and the spot', () => {
  const { s, sc, K } = smithy();
  const painted = kx => { s.log.length = 0; sc.paint(frameOf({ kx })); return s.log.filter(l => l.startsWith('rest.draw')); };
  assert.deepEqual(painted(440), ['rest.draw off 145 312', 'rest.draw main 490 425 ' + Math.PI / 2]);
  assert.deepEqual(painted(300), ['rest.draw off 145 312', 'rest.draw main 350 425 ' + Math.PI / 2]);
  // the key: no predicate, then the spot, then the shield's and the weapon's names
  assert.equal(sc.key(frameOf({ kx: 440 })), '|440|code|code');
  assert.equal(sc.key(frameOf({ kx: 299.6 })), '|300|code|code');
  K.rest.key = slot => (slot === 'main' ? 'kw.base/main.arming' : '');
  assert.equal(sc.key(frameOf({ kx: 440 })), '|440||kw.base/main.arming');
  // a scene without gear in its still layers keys as before
  assert.equal(compiled(TEXT, 'camp').sc.key(frameOf({ kx: 440 })), '');
});

test('a rest mark in a moving layer draws the gear each frame, at a place or on a frame, and its layer\'s when still holds first', () => {
  const text = edited(p => {
    const sc = p.scenes.cellar;
    sc.rests = { stool: { kind: 'surface', x: 460, y: 476, w: 76, h: 80 }, pegs: { x: 618, y: 228, a: 'flat' } };
    sc.moving.push({ when: ['helmOff'], shapes: [{ k: 'rest', slot: 'helmet', at: 'stool' }, { k: 'rest', slot: 'main', at: 'pegs' }] });
  });
  const { s, sc } = compiled(text), lines = [];
  s.KW.knight.rest.draw = (...a) => lines.push(a.join(' '));
  sc.draw(0, frameOf({ helmOff: false }));
  assert.deepEqual(lines, []);
  sc.draw(0, frameOf({ helmOff: true }));
  assert.deepEqual(lines, ['helmet 460 476', 'main 618 228 ' + Math.PI / 2]);
  // drawn each frame, so the backdrop's key does not follow it
  assert.equal(sc.key(frameOf({ helmOff: true })), '');
});

test('the anvil\'s act hammers as smithy.js does, the sparks fly only while it strikes, and the hot tip lies on the blade', () => {
  const { s, sc, K } = smithy(), code = sandbox().code.smithy;
  assert.equal(typeof sc.act, 'function');
  for (let t = 0; t <= 9100; t += 10) {
    const a = at440(t), b = at440(t);
    sc.act(t, a); code.act(t, b);
    assert.deepEqual([plain(a.o), a.strike], [plain(b.o), b.strike], 't ' + t);
  }
  const drawn = t => { const f = at440(t); sc.act(t, f); s.log.length = 0; sc.draw(t, f); return s.log; };
  // struck at 0 (the first 6 hundredths of the cycle) and from 1209 ms (93 hundredths): the sparks'
  // glow, 44 across, at the spot plus 132 and at 418
  const glowAt = (log, x, y) => log.some(l => l.startsWith(`arc ${x} ${y} 44 `));
  assert.ok(glowAt(drawn(0), 572, 418) && glowAt(drawn(1250), 572, 418), 'the sparks\' glow at the spot plus 132');
  assert.ok(!glowAt(drawn(300), 572, 418) && !glowAt(drawn(1000), 572, 418), 'no sparks while the hammer rises');
  const at300 = t => { const f = at440(t, { kx: 300 }); sc.act(t, f); s.log.length = 0; sc.draw(t, f); return s.log; };
  assert.ok(glowAt(at300(0), 432, 418), 'the sparks follow the spot');
  // the hot tip: its bands start 73, 57 and 43 short of the greatsword's point, 263 along the blade from 490
  const tip = drawn(300);
  for (const [x0, c] of [[73, '#8f231d'], [57, '#cc352c'], [43, '#ff5a1e']]) assert.ok(tip.includes('s ' + c) && tip.some(l => l.startsWith(`r ${490 + 263 - x0} 410 `)), c);
  K.rest.blade = () => null;
  const none = drawn(300);
  assert.ok(!none.includes('s #8f231d') && !none.includes('s #7a2a1d'), 'no hot tip for a weapon without a blade');
  assert.equal(none[none.length - 1], 'devices');
});

test('the pack library reads spot, the watcher\'s x at the anvil, only in a moving or over layer of a scene with an anvil', () => {
  const no = (text, step, reason) => { const r = PK.read(text, { allowUnsigned: true }); assert.deepEqual([r.ok, r.step, r.reason], [false, step, reason]); };
  no(edited(p => { p.scenes.camp.moving[0].shapes.push({ k: 'rect', p: [{ spot: 1, c: 10 }, 400], w: 2, h: 2, fill: '#000000' }); }),
    'references', 'pack.scenes.camp.moving[0].shapes[' + JSON.parse(TEXT).pack.scenes.camp.moving[0].shapes.length + '].p[0].spot: is the watcher\'s x at the anvil, and needs the scene\'s anvil');
  no(edited(p => { p.scenes.smithy.still[0].shapes.push({ k: 'rect', p: [{ spot: 1 }, 400], w: 2, h: 2, fill: '#000000' }); }),
    'references', 'pack.scenes.smithy.still[0].shapes[' + JSON.parse(TEXT).pack.scenes.smithy.still[0].shapes.length + '].p[0].spot: cannot be used in a still layer');
  // the sparks' point is costed and bounded over the spot's range
  const far = edited(p => { p.scenes.smithy.moving[1].shapes[0].p[0] = { spot: 2, c: 600 }; });
  const r = PK.read(far, { allowUnsigned: true });
  assert.deepEqual([r.ok, r.step], [false, 'rules']);
  assert.match(r.reason, /^pack\.scenes\.smithy\.moving\[1\]\.shapes\[0\]\.p\[0\]: the offset reaches 2220 at its greatest, above 2048$/);
});

// ---- The house's pieces: tracks, the screen, the bed, the pegs, rest views that fit ---------------------

/* The camp of the pack's text with a moving layer of three rects: one in a group a track drives,
   one in no group, and one in the group that a palette track's colour fills. */
const tracked = (tracks, extra) => edited(p => {
  p.palettes = Object.assign({}, p.palettes, { camp: { glow: '#111111' } });
  if (!p.provides.includes('palettes')) p.provides = ['palettes'].concat(p.provides);
  p.scenes.camp.moving.push({ groups: { pot: { pivot: [500, 400] } }, anim: { ms: true, period: 1000, loop: true, tracks }, shapes: [
    { k: 'rect', g: 'pot', p: [500, 400], w: 4, h: 4, fill: '#123456' },
    { k: 'rect', p: [600, 400], w: 4, h: 4, fill: '#654321' },
    { k: 'rect', p: [700, 400], w: 4, h: 4, fill: '@camp.glow' },
    { k: 'glow', g: 'pot', p: [500, 300], r: 10, colour: '#000000', a: 0.5 }] });
  if (extra) extra(p);
});
const rectsAt = (log, w) => log.filter(l => l.startsWith('r ') && l.endsWith(` ${w} ${w}`));

test('keyframes move a group by a step track and a wave track, rounded where it asks, and a palette track colours the shapes that name its entry', () => {
  const steps = compiled(tracked([{ g: 'pot', ch: 'dx', ease: 'step', keys: [[0, 0], [400, 6]] }, { g: 'pot', ch: 'dy', ease: 'step', keys: [[0, 0], [700, -2]] },
    { pal: 'camp.glow', ease: 'step', keys: [[0, '#aa0000'], [500, '#00bb00']] }]), 'camp');
  const at = t => { steps.s.log.length = 0; steps.sc.draw(t, frameOf({})); return steps.s.log; };
  assert.ok(at(0).includes('r 500 400 4 4') && at(399).includes('r 500 400 4 4'));
  assert.ok(at(400).includes('r 506 400 4 4') && at(700).includes('r 506 398 4 4') && at(1399).includes('r 500 400 4 4') && at(1400).includes('r 506 400 4 4'), 'the clock is t % 1000');
  assert.ok(at(700).includes('r 600 400 4 4'), 'a shape in no group stays');
  const fillOf = (log, r) => log[log.indexOf(r) - 1];
  assert.deepEqual([fillOf(at(0), 'r 700 400 4 4'), fillOf(at(500), 'r 700 400 4 4'), fillOf(at(1250), 'r 700 400 4 4')], ['s #aa0000', 's #00bb00', 's #aa0000']);
  // a wave track: 1.5 * sin(t / 190) rounded, as the candle's tip sways, and one left as it is; a
  // glow's arc is drawn where it falls, unrounded
  const wave = compiled(tracked([{ g: 'pot', ch: 'dx', wave: [1.5, 190, 0], round: true }, { g: 'pot', ch: 'dy', wave: [2, 100, 0] }]), 'camp');
  for (const t of [0, 100, 300, 600, 1234.5]) {
    wave.s.log.length = 0; wave.sc.draw(t, frameOf({}));
    const want = `arc ${500 + Math.round(Math.sin(t / 190) * 1.5)} ${300 + 2 * Math.sin(t / 100)} 10 `;
    assert.ok(wave.s.log.some(l => l.startsWith(want)), `t ${t}: ${want}`);
  }
  // a palette track's colour inside a band list is not built
  const band = tracked([{ pal: 'camp.glow', ease: 'step', keys: [[0, '#aa0000']] }], p => { p.scenes.camp.moving[1].shapes[2].fill = [[0.5, '@camp.glow'], [1, '#000000']]; });
  const s = sandbox();
  assert.throws(() => s.W.compile(s.KW.pack.read(band, { allowUnsigned: true }), 'camp'), /^Error: scenes\.camp\.moving\[1\]\.shapes\[2\]\.fill\[0\]\[1\]: a colour a palette track drives, inside a band list is not built in this engine yet$/);
});

test('the house\'s screen: its group is drawn only while the television is on, and its picture takes the palette track\'s colour every 400 ms', () => {
  const { s, sc } = compiled(TEXT, 'house');
  const at = (t, tv, inBed) => { s.log.length = 0; sc.draw(t, frameOf({ tv, inBed: !!inBed, o: {} })); return s.log; };
  const colours = ['#7fe9ff', '#e8f0ff', '#6f9eff', '#ff8fb0', '#fff3a0', '#8fe07a'];
  for (const t of [0, 399, 400, 1999, 2000, 2399, 2400, 5000]) assert.ok(at(t, true).includes('s ' + colours[Math.floor(t / 400) % 6]), 't ' + t);
  const off = at(0, false);
  assert.ok(!off.includes('s #7fe9ff') && !off.some(l => l.startsWith('arc 764 396 130 ')), 'no picture and no light while the television is off');
  // the figure crosses the picture 6 pixels every 700 ms
  for (const t of [0, 700, 3500, 4200]) assert.ok(at(t, true).includes(`r ${745 + (Math.floor(t / 700) % 6) * 6} 407 3 5`), 't ' + t);
});

test('the bed: the sleeper\'s head where the bed puts it, shaken by headDx, the ice bag while unwell, the blanket breathing, and the Zs over everything at night', () => {
  const { s, sc } = compiled(TEXT, 'house'), heads = [];
  s.KW.knight.head = (x, y) => heads.push([x, y]);
  const drawn = (t, o) => { s.log.length = 0; sc.draw(t, frameOf({ inBed: true, o })); return s.log.slice(); };
  drawn(0, {}); drawn(0, { headDx: -1, icebag: 1 });
  assert.deepEqual(heads, [[-15, 262], [-20, 262]]);
  const bag = drawn(0, { icebag: 1 }), plain_ = drawn(0, {});
  assert.ok(bag.includes('r 78 277 10 3') && !plain_.includes('r 78 277 10 3'), 'the ice bag only while unwell');
  // the blanket's top rises 3 pixels for every other 1.9 seconds
  assert.ok(drawn(0, {}).includes('r 160 401 2 64') && drawn(1900, {}).includes('r 160 398 2 67') && drawn(3800, {}).includes('r 160 401 2 64'));
  // the Zs: three, only at night
  const zeds = [];
  s.KW.sprites.zed = (x, y, n) => zeds.push([x, y, n]);
  sc.over(1300, frameOf({ w: { id: 'night' } }));
  sc.over(1300, frameOf({ w: { id: 'container_unhealthy' } }));
  assert.deepEqual(zeds, [0, 1, 2].map(i => { const ph = ((1300 / 2600) + i / 3) % 1; return [150 + ph * 110, 270 - ph * 140, Math.round(16 + ph * 16)]; }));
  assert.equal(sc.bed, true);
  assert.equal(sc.act, undefined, 'the house has no act of its own');
});

test('a frame that names a stamp draws it under each end of the weapon\'s blade, the greatsword\'s for a weapon that gives none', () => {
  const { s, sc } = compiled(TEXT, 'house'), K = s.KW.knight;
  const pegs = () => { s.log.length = 0; sc.paint(frameOf({})); return s.log.filter(l => /^r \d+ 254 14 1$/.test(l)).map(l => +l.split(' ')[1] + 7); };
  assert.deepEqual([...new Set(pegs())], [680, 836]);
  K.rest.blade = () => ({ from: 34, to: 175, half: 10 });
  assert.deepEqual([...new Set(pegs())], [680, 748]);
  K.rest.blade = () => null;
  assert.deepEqual([...new Set(pegs())], [680, 836]);
  // the stamp a rest names must be the pack's, and it is costed twice
  const r = PK.read(edited(p => { p.scenes.house.rests.pegs.stamp = 'nails'; }), { allowUnsigned: true });
  assert.deepEqual([r.ok, r.step, r.reason], [false, 'references', 'pack.scenes.house.rests.pegs.stamp: names a stamp, "nails", that the pack does not have']);
  const without = PK.read(edited(p => { delete p.scenes.house.rests.pegs.stamp; }), { allowUnsigned: true });
  const peg = PK.read(TEXT, { allowUnsigned: true }).world;
  assert.equal(peg.scenes.house.still.cost - without.world.scenes.house.still.cost, 2 * peg.stamps.peg);
});

test('the rest mark draws a helmet or a shield only where its rest view fits the place, by KW.knight.rest.fits', () => {
  const { s, sc } = compiled(TEXT, 'house'), K = s.KW.knight, drawn = [], asked = [];
  K.rest.draw = (...a) => drawn.push(a[0]);
  K.rest.fits = (slot, pl) => { asked.push([slot, pl.kind, pl.w, pl.h]); return slot !== 'off'; };
  sc.paint(frameOf({}));
  sc.draw(0, frameOf({ helmOff: true, o: {} }));
  assert.deepEqual(drawn, ['main', 'helmet']);
  assert.deepEqual(asked, [['off', 'hang', 100, 140], ['helmet', 'surface', 76, 80]]);
});
