// Tests for weapons and foes that fire, format 1.2: the fields and rules of the pack library
// (web/js/pack.js), the aim and fire() in the knight (web/js/knight.js), and the shot effects in the
// engine (web/js/engine.js). The barrel check, frame by frame, is in fire-barrel.test.js.
// Run with: node --test tests/web/
//
// The weapons are the test world's, from its copy of format 1.2 (fixtures/worlds/orbit.js writes
// test.orbit-fire.pack.json): the blaster, one-handed, that fires a bolt; the prod, two-handed, both
// swung and fired, a beam with no flash colour of its own; the deflector, a shield; and Glitch, a
// foe that fires a tracer. Packs are read on dev terms, unsigned.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const FIRE_TEXT = fs.readFileSync(ORBIT.FIRE_FILE, 'utf8');
const BASE_TEXT = fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8');
const clone = v => JSON.parse(JSON.stringify(v));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;
const ITEMS = JSON.parse(FIRE_TEXT).pack.items;
const SWORD = clone(JSON.parse(BASE_TEXT).pack.items['main.arming']);

// ---- The format ----------------------------------------------------------------------------------

const read = env => PK.read(JSON.stringify(env), { allowUnsigned: true });
/* A small pack of the format f holding the items given. */
const small = (f, items) => ({ kwpack: 1, pack: { id: 'test.fire', name: 'Fire', version: '1.0.0', format: f, licence: 'For the tests only.', provides: ['items'], items } });
/* The 1.2 copy of the test world, edited. */
function orbit(edit) { const env = JSON.parse(FIRE_TEXT); if (edit) edit(env.pack); return env; }
function refused(env, step, reason) {
  const r = read(env);
  assert.equal(r.ok, false, 'expected the pack to be refused');
  assert.deepEqual([r.step, r.reason], [step, reason]);
}
const IP = 'pack.items["main.x"]';

test('the test world\'s copy of format 1.2 is what its generator writes, and reads on dev terms', () => {
  assert.equal(FIRE_TEXT, ORBIT.fireText(), 'run node tests/web/fixtures/worlds/orbit.js');
  const r = PK.read(FIRE_TEXT, { allowUnsigned: true });
  assert.deepEqual([r.ok, r.id, r.version, r.format], [true, 'test.orbit', '1.1.0', [1, 2]]);
  assert.equal(PK.read(FIRE_TEXT).step, 'signature', 'never signed');
});

test('the library reads formats 1.0 to 1.3, and refuses 1.4 at format', () => {
  assert.deepEqual(PK.FORMAT, [1, 3]);
  for (const f of [[1, 0], [1, 1], [1, 2], [1, 3]]) assert.equal(read(small(f, { 'main.x': SWORD })).ok, true, f.join('.'));
  assert.deepEqual(read(small([1, 4], { 'main.x': SWORD })), { ok: false, step: 'format', reason: 'pack.format: is 1.4, newer than this engine\'s 1.3', id: 'test.fire' });
  assert.equal(read(orbit()).ok, true);
});

test('each field 1.2 adds on a main item is read in a 1.2 pack and refused at fields in 1.1 and 1.0', () => {
  assert.equal(read(small([1, 2], { 'main.x': ITEMS['main.blaster'] })).ok, true);
  for (const f of ['use', 'barrel', 'muzzle', 'range', 'shot', 'stowed']) {
    const it = Object.assign(clone(SWORD), { [f]: clone(ITEMS['main.blaster'][f]) });
    for (const v of [[1, 0], [1, 1]]) refused(small(v, { 'main.x': it }), 'fields', IP + '.' + f + ': is not a field here');
  }
  // on any other slot they are not fields in 1.2 either
  const helm = clone(JSON.parse(BASE_TEXT).pack.items['helm.open']);
  refused(small([1, 2], { 'helm.x': Object.assign(helm, { use: 'fire' }) }), 'fields', 'pack.items["helm.x"].use: is not a field here');
});

test('a foe that fires is read in 1.2 and refused at fields in 1.1', () => {
  const g = p => p.cast['foe.glitch'];
  // the copy at format 1.1 with its weapons put back as the 1.1 file has them
  const to11 = p => {
    p.format = [1, 1];
    for (const i of ['main.blaster', 'main.prod', 'off.deflector']) delete p.items[i];
    p.worlds['world.orbit'].outfit.items = clone(ORBIT.build().pack.worlds['world.orbit'].outfit.items);
  };
  refused(orbit(p => { to11(p); }), 'fields', 'pack.cast["foe.glitch"].fires: is not a field here');
  refused(orbit(p => { to11(p); delete g(p).fires; }), 'fields', 'pack.cast["foe.glitch"].poses.aim: is not a field here');
  assert.equal(read(orbit(p => { to11(p); delete g(p).fires; delete g(p).poses.aim; })).ok, true);
  // in 1.2 a foe may give the aim pose and not fire; it is then never asked for
  assert.equal(read(orbit(p => { delete g(p).fires; })).ok, true);
});

test('what each use of a main item must and may give, at rules', () => {
  const B = ITEMS['main.blaster'], P = ITEMS['main.prod'];
  const one = (it, step, reason) => (step ? refused(small([1, 2], { 'main.x': it }), step, reason) : assert.equal(read(small([1, 2], { 'main.x': it })).ok, true, JSON.stringify(it).slice(0, 80)));
  const ed = (base, edit) => { const it = clone(base); edit(it); return it; };
  for (const f of ['barrel', 'muzzle', 'range', 'shot']) {
    one(ed(B, it => { delete it[f]; }), 'rules', IP + '.' + f + ': is required on a weapon whose use is "fire"');
    one(ed(P, it => { delete it[f]; }), 'rules', IP + '.' + f + ': is required on a weapon whose use is "both"');
    one(ed(SWORD, it => { it[f] = clone(B[f]); }), 'rules', IP + '.' + f + ': is only for a weapon that fires, and this one only swings');
    one(ed(SWORD, it => { it.use = 'swing'; it[f] = clone(B[f]); }), 'rules', IP + '.' + f + ': is only for a weapon that fires, and this one only swings');
  }
  one(ed(P, it => { delete it.blade; }), 'rules', IP + '.blade: is required on a weapon that is both swung and fired');
  // a weapon that fires needs no blade, and a swung one may be stowed or say its use
  one(ed(B, () => {}));
  one(ed(SWORD, it => { it.use = 'swing'; it.stowed = clone(B.stowed); }));
  one(ed(B, it => { it.barrel.from = it.barrel.to; }), 'rules', IP + '.barrel: from must be below to');
  one(ed(B, it => { it.muzzle.s = it.barrel.to + 1; }), 'rules', IP + '.muzzle: must lie on the barrel: s from its from to its to, and p within its half');
  one(ed(B, it => { it.muzzle.s = it.barrel.from - 1; }), 'rules', IP + '.muzzle: must lie on the barrel: s from its from to its to, and p within its half');
  one(ed(B, it => { it.muzzle.p = -it.barrel.half - 0.125; }), 'rules', IP + '.muzzle: must lie on the barrel: s from its from to its to, and p within its half');
  one(ed(B, it => { it.muzzle.p = it.barrel.half; }));
});

test('the fields of a weapon that fires, at fields and references', () => {
  const B = ITEMS['main.blaster'];
  const one = (edit, step, reason) => { const it = clone(B); edit(it); if (step) refused(small([1, 2], { 'main.x': it }), step, reason); else assert.equal(read(small([1, 2], { 'main.x': it })).ok, true); };
  one(it => { it.use = 'throw'; }, 'fields', IP + '.use: must be one of "swing", "fire", "both"');
  for (const r of [199, 641, 300.5]) one(it => { it.range = r; }, 'fields', IP + '.range: must be a whole number from 200 to 640');
  for (const r of [200, 640]) one(it => { it.range = r; });
  one(it => { it.barrel.half = -1; }, 'fields', IP + '.barrel.half: must be a multiple of 1/8 from 0 to 400');
  one(it => { delete it.barrel.half; }, 'fields', IP + '.barrel.half: is missing');
  one(it => { it.muzzle = { s: 64 }; }, 'fields', IP + '.muzzle.p: is missing');
  one(it => { it.shot.kind = 'laser'; }, 'fields', IP + '.shot.kind: must be one of "bolt", "tracer", "beam"');
  one(it => { it.shot.colour = 'red'; }, 'fields', IP + '.shot.colour: must be a hex colour');
  one(it => { it.shot.flash = '@base.k'; }, 'fields', IP + '.shot.flash: must be a hex colour');
  one(it => { delete it.shot.colour; }, 'fields', IP + '.shot.colour: is missing');
  one(it => { it.shot.speed = 2; }, 'fields', IP + '.shot.speed: is not a field here');
  // the flash may be left out: the engine's pale snap
  one(it => { delete it.shot.flash; });
  for (const k of ['bolt', 'tracer', 'beam']) one(it => { it.shot.kind = k; });
  one(it => { it.stowed.layer = 'belt'; }, 'fields', IP + '.stowed.layer: must be one of "back", "body"');
  one(it => { delete it.stowed.parts; }, 'fields', IP + '.stowed.parts: is missing');
  // a stowed view hangs on the neck or a hip, and has no frame
  one(it => { it.stowed.parts[0].at = 'handR'; }, 'references', IP + '.stowed.parts[0].at: a stowed view hangs only on neck, hipL, hipR or hip, not on "handR"');
  one(it => { it.stowed.parts[0].at = 'main'; }, 'references', IP + '.stowed.parts[0].at: a stowed view hangs only on neck, hipL, hipR or hip, not on "main"');
  one(it => { it.stowed.parts[0].at = 'hip'; }, 'references', IP + '.stowed.parts[0].at: "hip" needs a part drawn for one side');
  one(it => { it.stowed.parts[0].at = 'hip'; it.stowed.parts[0].side = 'L'; });
  for (const a of ['neck', 'hipL']) one(it => { it.stowed.parts[0].at = a; });
  one(it => { it.stowed.parts[0].shapes[0].p = { frame: 'main', s: 0, p: 0 }; }, 'references', IP + '.stowed.parts[0].shapes[0].p: a framed point is allowed only in the main slot');
});

test('a foe that fires gives the pose aim and a muzzle inside its sprite, at rules', () => {
  const g = p => p.cast['foe.glitch'], CP = 'pack.cast["foe.glitch"]';
  refused(orbit(p => { delete g(p).poses.aim; }), 'rules', CP + '.poses: a foe that fires must give the pose "aim"');
  refused(orbit(p => { g(p).fires.muzzle = [-81, -83]; }), 'rules', CP + '.fires.muzzle: must lie in the sprite, from its feet');
  refused(orbit(p => { g(p).fires.muzzle = [0, 11]; }), 'rules', CP + '.fires.muzzle: must lie in the sprite, from its feet');
  assert.equal(read(orbit(p => { g(p).fires.muzzle = [-80, -170]; })).ok, true);
  refused(orbit(p => { g(p).fires.shot.kind = 'arrow'; }), 'fields', CP + '.fires.shot.kind: must be one of "bolt", "tracer", "beam"');
  refused(orbit(p => { delete g(p).fires.shot; }), 'fields', CP + '.fires.shot: is missing');
  refused(orbit(p => { g(p).poses.aim.parts = ['wings']; }), 'references', CP + '.poses.aim.parts[0]: names a part, "wings", that the foe does not have');
  // the aim pose is costed with the other six
  const r = read(orbit());
  assert.deepEqual(Object.keys(r.world.cast['foe.glitch'].poses), ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit', 'aim']);
});

test('a stowed view counts toward its item\'s caps, and a look counts the larger of the weapon and its stowed view', () => {
  const B = ITEMS['main.blaster'], r = read(small([1, 2], { 'main.x': B, 'main.y': SWORD }));
  assert.deepEqual(plain(r.sums['main.x'].stowed), { n: 2, cost: 70 });
  // a swung weapon with no stowed view sums as it always has
  assert.deepEqual(Object.keys(r.sums['main.y']), ['parts', 'view', 'rest']);
  // 41 rings of 201 rows each: 8 241 fills in the stowed view alone
  const big = clone(B);
  big.stowed.parts[0].shapes = Array.from({ length: 41 }, () => ({ k: 'ell', p: [0, 0], rx: 4, ry: 100, fill: '#123456' }));
  refused(small([1, 2], { 'main.x': big }), 'counts', IP + ': costs up to ' + (r.sums['main.x'].parts.cost + 8241) + ' fills in its parts and views, more than 8000');
  // the look: the stowed view is never drawn with the weapon, so the larger of the two counts
  const ED = require('../../web/js/ed25519.js');
  const base = PK.read(BASE_TEXT, { allowUnsigned: true, verify: ED.verify }), costOf = it => {
    const p = read(small([1, 2], { 'main.x': it }));
    assert.equal(p.ok, true, p.reason);
    return PK.resolve(PK.gather([base, p]).packs, { items: { main: 'test.fire/main.x' } }).cost;
  };
  const bare = clone(B); delete bare.stowed;
  const wide = clone(B); wide.stowed.parts[0].shapes = Array.from({ length: 10 }, () => ({ k: 'ell', p: [0, 0], rx: 4, ry: 100, fill: '#123456' }));
  assert.equal(costOf(B), costOf(bare));
  assert.equal(costOf(wide), costOf(bare) - r.sums['main.x'].parts.cost + 2010);
});

test('resolve() gives a weapon\'s use, barrel, muzzle, range and shot only when it fires', () => {
  const ED = require('../../web/js/ed25519.js');
  const base = PK.read(BASE_TEXT, { allowUnsigned: true, verify: ED.verify }), orb = read(orbit()), packs = PK.gather([base, orb]).packs;
  const KEYS = ['ok', 'look', 'fallbacks', 'ignored', 'm', 'diffs', 'shapes', 'cost', 'colours', 'grip', 'blade', 'plumeShown', 'lists'];
  for (const main of [undefined, 'kw.base/main.arming', 'kw.base/main.mace', O('main.bar')]) assert.deepEqual(Object.keys(PK.resolve(packs, main ? { items: { main } } : {})), KEYS, String(main));
  const B = ITEMS['main.blaster'], P = ITEMS['main.prod'];
  const b = PK.resolve(packs, { items: { main: O('main.blaster'), off: O('off.deflector') } });
  assert.deepEqual(plain([b.use, b.barrel, b.muzzle, b.range, b.shot, b.stowed, b.blade, b.grip]), plain(['fire', B.barrel, B.muzzle, 420, B.shot, true, null, B.grip]));
  // the lists are the same, and the body with the stowed view beside them (fire-acts.test.js)
  assert.deepEqual(Object.keys(b.lists), Object.keys(PK.resolve(packs, {}).lists).concat('bodyStowed'));
  const p = PK.resolve(packs, { items: { main: O('main.prod') } });
  assert.deepEqual(plain([p.use, p.blade, p.barrel, p.shot]), plain(['both', P.blade, P.barrel, { kind: 'beam', colour: P.shot.colour }]));
});

test('the frame\'s flip turns a framed point over the frame\'s line, and is off in a new anchors array', () => {
  assert.equal(PK.FRAME_FL, PK.FRAME_SY + 1);
  const A = PK.newAnchors();
  assert.equal(A.length, PK.ANCHORS.length * 2 + 3);
  assert.equal(A[PK.FRAME_FL], 0);
  // a framed strip from s 0 to s 50 at p 10, the frame at (100, 100) pointing left
  const it = clone(SWORD);
  it.parts = [{ at: 'main', shapes: [{ k: 'strip', p0: { frame: 'main', s: 0, p: 10 }, p1: { frame: 'main', s: 50, p: 10 }, hw0: 1, hw1: 1, fill: '#123456' }] }];
  const ED = require('../../web/js/ed25519.js');
  const base = PK.read(BASE_TEXT, { allowUnsigned: true, verify: ED.verify }), L = PK.resolve(PK.gather([base, read(small([1, 2], { 'main.x': it }))]).packs, { items: { main: 'test.fire/main.x' } });
  const got = [], P = { strip: (x0, y0, x1, y1) => got.push([x0, y0, x1, y1].map(v => Math.round(v))) };
  A[2 * PK.ANCHOR.main] = 100; A[2 * PK.ANCHOR.main + 1] = 100; A[PK.FRAME_SX] = -1; A[PK.FRAME_SY] = 0;
  PK.draw(L.lists.main, A, PK.newValues(), P);
  A[PK.FRAME_FL] = 1;
  PK.draw(L.lists.main, A, PK.newValues(), P);
  // pointing left, p runs up the screen; flipped, down
  assert.deepEqual(got, [[100, 90, 50, 90], [100, 110, 50, 110]]);
});

// ---- The page: the aim and fire() ----------------------------------------------------------------

const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js'];
/* The page's scripts in a sandbox, with the base pack and the texts given, in the look given. The
   drawing goes to a context that writes one line per call: "s" for a fillStyle, "a" for a
   globalAlpha, "r" for a fillRect, and the name for anything else. */
function load(texts, look) {
  const log = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) { return k === 'fillRect' ? (x, y, w, h) => log.push(`r ${x} ${y} ${w} ${h}`) : () => {}; },
  });
  const cv = () => ({ width: 0, height: 0, getContext: () => ctx });
  const box = vm.createContext({ window: {}, document: { createElement: cv }, console: { info() {}, warn() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(KW.packText.concat(texts || [FIRE_TEXT]), true, { look: look || {} });
  assert.equal(KW.knight.source, 'pack');
  assert.deepEqual(plain(KW.knight.status.fallbacks).filter(f => f.reason !== 'not set'), [], 'the look is drawn as asked');
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, E: KW.engine, lib: KW.pack, log };
}
const X = 480, FLOOR = 530;
function at(K, t) { const o = K.pose('idle', t || 2300); o.x = X; o.floor = FLOOR; o.helmet = true; o.bob = 0; return o; }
const BLASTER = { items: { main: O('main.blaster'), off: O('off.deflector') } };
const BARE = { items: { main: O('main.blaster') } };
const PROD = { items: { main: O('main.prod') } };
const L = Math.PI / 2;
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (what || '') + ': ' + a + ' is not ' + b);
/* The angle a from straight up, as the shortest turn. */
const fromUp = a => { const x = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return Math.min(x, 2 * Math.PI - x); };

test('the look\'s weapon fires only when its use says so', () => {
  assert.equal(load(null, {}).K.fired(), null);
  assert.equal(load(null, { items: { main: O('main.bar') } }).K.fired(), null);
  const b = load(null, BLASTER).K.fired(), B = ITEMS['main.blaster'];
  assert.deepEqual(plain(b), plain({ use: 'fire', barrel: B.barrel, muzzle: B.muzzle, range: B.range, shot: B.shot, stowed: true }));
  assert.equal(load(null, PROD).K.fired().use, 'both');
  // a muzzle is only for a weapon that fires
  const d = load(null, {});
  assert.equal(d.K.muzzle(at(d.K)), null);
});

test('the aim is held between 0.3 below level and 1.2 above it, both ways, and the swat may go to 1.4', () => {
  for (const look of [BLASTER, BARE, PROD]) {
    const { K } = load(null, look), A = K.aim.AIM;
    assert.deepEqual(plain(A), { below: .3, above: 1.2, swatAbove: 1.4, recoil: 4, recoilUp: .08 });
    for (const dir of [1, -1]) {
      const o = at(K), lv = dir * L;
      near(K.aim.angle(o, dir), lv, 0, 'no point: level');
      near(K.aim.angle(o, dir, [X + dir * 400, FLOOR - 2000]), lv - dir * 1.2, 1e-12, 'overhead');
      near(K.aim.angle(o, dir, [X + dir * 150, FLOOR - 4000], A.swatAbove), lv - dir * 1.4, 1e-12, 'overhead, the swat');
      near(K.aim.angle(o, dir, [X + dir * 400, FLOOR + 2000]), lv + dir * .3, 1e-12, 'below the floor');
      // behind the watcher the aim stays on its side, at a limit
      const back = K.aim.angle(o, dir, [X - dir * 400, FLOOR - 300]);
      assert.ok([lv - dir * 1.2, lv + dir * .3].some(v => Math.abs(v - back) < 1e-12), 'behind: ' + back);
    }
  }
});

test('the shot leaves the muzzle on a line through the point aimed at, both ways, with the muzzle off the frame\'s line', () => {
  // the blaster with its muzzle 4 below its frame's line (aimed right), which turns the aim
  const env = JSON.parse(FIRE_TEXT);
  env.pack.items['main.blaster'].muzzle.p = 4;
  for (const [look, off] of [[BLASTER, true], [PROD, false], [{ items: { main: O('main.blaster') } }, false]]) {
    const { K } = load([JSON.stringify(env)], look);
    for (const dir of [1, -1]) for (const dy of [-260, -120, -40, 30]) {
      const o = at(K), mark = [X + dir * 380, FLOOR - 125 + dy], a = K.aim.angle(o, dir, mark);
      K.aim.pose(o, dir, a);
      const m = K.muzzle(o), u = [Math.sin(a), -Math.cos(a)], d = [mark[0] - m[0], mark[1] - m[1]];
      // the mark's distance from the line of the shot, and that it lies ahead of the muzzle
      near(d[0] * u[1] - d[1] * u[0], 0, 1e-6, (off ? 'shield ' : '') + 'dir ' + dir + ' dy ' + dy);
      assert.ok(d[0] * u[0] + d[1] * u[1] > 100);
    }
  }
});

test('fire(): raised to level by .3, turned to the mark by .5, the recoil to .6, back to the stance by 1', () => {
  for (const look of [BLASTER, BARE, PROD]) {
    const { K } = load(null, look), A = K.aim.AIM, one = look !== PROD;
    const stance = at(K), keys = one ? ['gx', 'gy', 'wang', 'fx', 'fy'] : ['gx', 'gy', 'wang'];
    const pick = o => keys.map(k => o[k]);
    for (const dir of [1, -1]) {
      const mark = [X + dir * 360, FLOOR - 260], a = K.aim.angle(at(K), dir, mark);
      const aimed = K.aim.pose(at(K), dir, a), lv = K.aim.pose(at(K), dir, dir * L);
      const f = q => { const o = at(K); const left = K.fire(o, q, dir, mark); return [o, left]; };
      assert.deepEqual(pick(f(0)[0]), pick(stance), 'q 0 is the stance');
      assert.deepEqual(pick(f(1)[0]), pick(stance), 'q 1 is the stance');
      assert.equal(f(0)[0].aimed, false); assert.equal(f(1)[0].aimed, false); assert.equal(f(.5)[0].aimed, true);
      const q3 = f(.3)[0];
      near(q3.gx, lv.gx, 1e-12); near(q3.gy, lv.gy, 1e-12); near(Math.sin(q3.wang), Math.sin(lv.wang), 1e-12); near(Math.cos(q3.wang), Math.cos(lv.wang), 1e-12);
      // just before .5 the aimed pose; at .5 the recoil at its height, 4 back along the frame and .08 up
      const pre = f(.4999999)[0], kick = f(.5)[0];
      near(pre.gx, aimed.gx, 1e-5); near(pre.gy, aimed.gy, 1e-5); near(Math.sin(pre.wang), Math.sin(a), 1e-5);
      near((kick.gx - aimed.gx) * 5, -Math.sin(a) * A.recoil, 1e-9, 'back along x');
      near((kick.gy - aimed.gy) * 5, Math.cos(a) * A.recoil, 1e-9, 'back along y');
      near(kick.wang, a - dir * A.recoilUp, 1e-12, 'up');
      const q6 = f(.6)[0];
      near(q6.gx, aimed.gx, 1e-12); near(q6.gy, aimed.gy, 1e-12); near(Math.sin(q6.wang), Math.sin(a), 1e-12);
      // the shot has left from .5
      assert.deepEqual([.1, .3, .4999, .5, .55, .9, 1].map(q => f(q)[1]), [false, false, false, true, true, true, true]);
      assert.equal(f(.4)[0].eyes, 'angry');
    }
  }
});

test('a turn from one side to the other passes under the weapon\'s grip, never through straight up', () => {
  for (const look of [BLASTER, PROD]) {
    const { K } = load(null, look);
    for (const dir of [1, -1]) for (const dy of [-1000, 0, 1000]) {
      let nearest = Infinity, lowest = Infinity;
      for (let k = 0; k <= 2000; k++) {
        const o = at(K); K.fire(o, k / 2000, dir, [X + dir * 360, FLOOR - 125 + dy]);
        nearest = Math.min(nearest, fromUp(o.wang)); lowest = Math.min(lowest, Math.PI - fromUp(o.wang));
      }
      // never nearer straight up than the stance, or than the highest aim less its recoil
      assert.ok(nearest > .25, 'dir ' + dir + ' dy ' + dy + ': ' + nearest);
      // to the left the weapon turns through straight down
      if (dir < 0) assert.ok(lowest < .01, 'through straight down: ' + lowest);
    }
  }
});

test('aimed left, a weapon that fires is drawn turned over its line, and nothing else ever is', () => {
  const flips = (m, pose) => {
    const seen = [], d0 = m.lib.draw;
    m.lib.draw = (list, A, V, P, face) => { seen.push(A[m.lib.FRAME_FL]); return d0(list, A, V, P, face); };
    m.K.draw(pose);
    m.lib.draw = d0;
    return [...new Set(seen)];
  };
  for (const look of [BLASTER, PROD]) {
    const m = load(null, look);
    assert.deepEqual(flips(m, m.K.aim.pose(at(m.K), -1, -L)), [1], 'aimed left');
    assert.deepEqual(flips(m, m.K.aim.pose(at(m.K), 1, L)), [0], 'aimed right');
    assert.deepEqual(flips(m, at(m.K)), [0], 'the stance');
    // swung, the prod and the blaster are not flipped, whichever way they cut
    for (const dir of [1, -1]) for (let q = 0; q <= 1; q += .05) { const o = at(m.K); m.K.swing(o, q, dir); assert.deepEqual(flips(m, o), [0]); }
  }
  // the two-handed stance aimed left is the one aimed right mirrored about the root, muzzle and all
  const m = load(null, PROD), r = m.K.muzzle(m.K.aim.pose(at(m.K), 1, L)), l = m.K.muzzle(m.K.aim.pose(at(m.K), -1, -L));
  near(r[0] - X, X - l[0], 1e-9); near(r[1], l[1], 1e-9);
  const g = load(null, {});
  for (const dir of [1, -1]) for (let q = 0; q <= 1; q += .05) { const o = at(g.K); g.K.swing(o, q, dir); assert.deepEqual(flips(g, o), [0]); }
});

test('aimed, the front hand stays on its station along the frame at every angle', () => {
  const m = load(null, PROD), H = ITEMS['main.prod'].grip.hands;
  for (const dir of [1, -1]) for (let k = -.3; k <= 1.2001; k += .05) {
    const a = dir * (L - k), o = m.K.aim.pose(at(m.K), dir, a), r = m.K.rig(o), g = r.anchors.main, sx = Math.sin(a), sy = -Math.cos(a);
    const up = sx >= 0 ? r.anchors.handR : r.anchors.handL;
    near(up[0], g[0] + sx * H[0], 1e-9); near(up[1], g[1] + sy * H[0], 1e-9);
  }
  // swung past level the upper hand still slides down the grip, as before
  const o = at(m.K); o.wang = 1.8;
  const r = m.K.rig(o), sx = Math.sin(1.8), sy = -Math.cos(1.8), g = r.anchors.main;
  near(r.anchors.handR[0], g[0] + sx * (H[0] - 2), 1e-9); near(r.anchors.handR[1], g[1] + sy * (H[0] - 2), 1e-9);
});

// ---- The engine: the shot effects -----------------------------------------------------------------

/* The colours set between two draws of the shots at t. */
function drawn(m, t) {
  m.log.length = 0;
  m.E.shots.draw(t);
  return m.log.slice();
}
const colours = lines => [...new Set(lines.filter(l => l.startsWith('s ')).map(l => l.slice(2)))];

test('the shots\' timings are the format\'s', () => {
  const { E } = load(null, BLASTER);
  assert.deepEqual(plain(E.shots.SHOT), { speed: 1.6, flash: 60, tracer: 120, beam: 80, most: 8, burst: 260, streak: 26, star: 7, snap: '#eef3f9' });
});

test('a bolt flies at 1.6 pixels a ms, its flash shows for 60 ms, and its burst where it lands', () => {
  const m = load(null, BLASTER), E = m.E;
  const r = E.shots.shoot('a', () => ({ kind: 'bolt', colour: '#7af0ff', flash: '#a0ffa0', from: [100, 300], to: [420, 300], t0: 1000, burst: 260 }));
  assert.equal(r.lands, 1200);
  assert.equal(r.end, 1460);
  // made once: the same key gives the same shot
  assert.equal(E.shots.shoot('a', () => { throw new Error('made twice'); }), r);
  assert.deepEqual(drawn(m, 999), []);
  assert.deepEqual(colours(drawn(m, 1059)).sort(), ['#1a1524', '#7af0ff', '#a0ffa0', '#ffffff'].sort());
  // after 60 ms the flash has gone: the head of the streak is the flash colour, no star's white
  assert.ok(!colours(drawn(m, 1060)).includes('#ffffff'));
  // the head of the streak, 100 ms out, is 160 pixels along
  const rows = drawn(m, 1100).filter(l => l.startsWith('r ')).map(l => l.split(' ').slice(1).map(Number));
  near(Math.max(...rows.map(q => q[0] + q[2])), 100 + 160, 1.5, 'the head');
  near(Math.min(...rows.map(q => q[0])), 100 + 160 - 26, 1.5, 'the tail, 26 behind');
  // landed: the burst (the poof's yellow) and no streak
  assert.ok(colours(drawn(m, 1199)).includes('#7af0ff'));
  const land = colours(drawn(m, 1200));
  assert.ok(land.includes('#fff3a0') && !land.includes('#7af0ff'), land.join(' '));
  assert.ok(colours(drawn(m, 1459)).includes('#fff3a0'));
  assert.deepEqual(drawn(m, 1460), []);
  assert.equal(E.shots.live().length, 0, 'forgotten once ended');
});

test('a tracer fades over 120 ms, a beam shows for 80 ms, and a shot with no flash colour snaps pale', () => {
  const m = load(null, BLASTER), E = m.E;
  E.shots.shoot('t', () => ({ kind: 'tracer', colour: '#ff8fb0', flash: '#fff3a0', from: [100, 300], to: [500, 200], t0: 0 }));
  const alphas = t => drawn(m, t).filter(l => l.startsWith('a ')).map(l => +l.slice(2));
  assert.deepEqual(alphas(0), [1, 1]);
  assert.deepEqual(alphas(60), [.5, 1]);
  assert.ok(colours(drawn(m, 119)).includes('#ff8fb0'));
  assert.ok(!colours(drawn(m, 120)).includes('#ff8fb0'));
  E.shots.clear();
  E.shots.shoot('b', () => ({ kind: 'beam', colour: '#a8ff5c', from: [100, 300], to: [500, 300], t0: 0 }));
  const b0 = colours(drawn(m, 0));
  assert.ok(b0.includes('#a8ff5c') && b0.includes('#eef3f9'), 'the beam and the pale snap: ' + b0.join(' '));
  assert.ok(colours(drawn(m, 79)).includes('#a8ff5c'));
  assert.deepEqual(drawn(m, 80), []);
  assert.throws(() => E.shots.shoot('x', () => ({ kind: 'arrow', colour: '#000000', from: [0, 0], to: [1, 1], t0: 0 })), /a bolt, a tracer or a beam/);
});

test('a frame draws at most 8 shots, the first made first', () => {
  const m = load(null, BLASTER), E = m.E, hex = i => '#' + (0x100000 + i * 4096).toString(16).padStart(6, '0');
  for (let i = 0; i < 12; i++) E.shots.shoot('s' + i, () => ({ kind: 'beam', colour: hex(i), flash: '#a0ffa0', from: [100, 300 + i * 10], to: [500, 300 + i * 10], t0: 0 }));
  const ALL = Array.from({ length: 12 }, (_, i) => hex(i)), mine = c => ALL.includes(c);
  assert.deepEqual(colours(drawn(m, 10)).filter(mine).sort(), ALL.slice(0, 8).sort());
  // a shot that has not left draws nothing and takes no place
  E.shots.clear();
  E.shots.shoot('later', () => ({ kind: 'beam', colour: '#123456', from: [0, 0], to: [10, 0], t0: 500 }));
  for (let i = 0; i < 8; i++) E.shots.shoot('s' + i, () => ({ kind: 'beam', colour: hex(i), from: [100, 300], to: [500, 300], t0: 0 }));
  assert.equal(colours(drawn(m, 10)).filter(mine).length, 8);
  assert.equal(E.shots.live().length, 9);
  E.reset();
  assert.equal(E.shots.live().length, 0, 'reset clears the shots');
});
