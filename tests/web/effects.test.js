// Tests for the effects, web/js/effects.js: that each effect's cost function bounds the fills its
// drawing really makes, for a spread of its fields on three sizes of screen and at several moments,
// and that the pack library, web/js/pack.js, holds a world pack's effects to the same tables of
// fields and costs them with the same functions. Run with: node --test tests/web/
//
// The drawing runs under Node against a fake canvas context that counts the calls that fill: each
// fillRect, and each fill() of a glow's three discs. The scenes' calls to the effects, and so their
// arguments, are proved by the call records of tests/web/scenes.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');
const FX = require('../../web/js/effects.js');

const WEB = path.join(__dirname, '../../web');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/world-1.1.json'), 'utf8');
const WORLD = () => JSON.parse(FIXTURE).pack;
const read = pack => PK.read(JSON.stringify({ kwpack: 1, pack }), { allowUnsigned: true });

// ---- Drawing, counted ------------------------------------------------------------------------------

/* draw.js, sprites.js, effects.js and props.js, as index.html loads them, into a sandbox drawing into
   a context that counts fillRect and fill calls. */
function sandbox() {
  let fills = 0, glows = 0;
  const ctx = new Proxy({}, {
    set() { return true; },
    get(_, k) {
      if (k === 'fillRect') return () => { fills++; };
      if (k === 'fill') return () => { fills++; glows++; };
      return () => {};
    },
  });
  const box = vm.createContext({ window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } });
  for (const f of ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  const KW = box.window.KW;
  KW.draw.setCtx(ctx);
  // fills, and glows: a glow fills three discs
  const count = f => { fills = 0; glows = 0; f(); return { fills, glows: glows / 3 }; };
  return { KW, count };
}

/* The canvas as fit() in main.js cuts it, as tests/web/scenes.test.js does: 960 by 600, 1400 by
   600 and 960 by 720. */
const SIZES = [[960, 600], [1400, 600], [960, 720]];
function fit(V, [lw, lh]) {
  V.LW = lw; V.LH = lh; V.X0 = Math.floor((lw - V.HW) / 2); V.Y0 = lh - V.HH;
  V.HL = -V.X0 - 16; V.HR = lw - V.X0 + 16; V.HT = -V.Y0 - 2; V.SC = 1;
}

// ---- Fields, made up --------------------------------------------------------------------------------

/* A little generator of numbers, the same on every run. */
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const between = (r, lo, hi, int) => { const v = lo + (hi - lo) * r(); return int ? Math.round(v) : Math.round(v * 8) / 8; };
const hex = r => '#' + Math.floor(r() * 0xffffff).toString(16).padStart(6, '0');

/* A value of a field of kind f: at its least (at 'lo'), its greatest ('hi'), or anywhere in its
   range. Positions stay on and near the grid, and lengths within a wide screen. */
function value(f, r, at) {
  const pick = (lo, hi, int) => (at === 'lo' ? lo : at === 'hi' ? hi : between(r, lo, hi, int));
  switch (f.kind) {
    case 'point': return [pick(-200, 1100), pick(-120, 650)];
    case 'offset': return pick(-120, 650);
    case 'length': return pick(f.lo || 0, 1500);
    case 'term': return pick(f.lo, f.hi, true);
    case 'num': return pick(f.lo, f.hi);
    case 'int': return pick(f.lo, f.hi, true);
    case 'pair': return f.of.map(([lo, hi]) => pick(lo, hi, f.int));
    case 'colour': return hex(r);
    case 'colours': return Array.from({ length: pick(f.min, f.max, true) }, () => hex(r));
    case 'ints': return Array.from({ length: pick(f.min, f.max, true) }, () => pick(f.lo, f.hi, true));
    default: return at === 'hi' ? f.of[f.of.length - 1] : at === 'lo' ? f.of[0] : f.of[Math.floor(r() * f.of.length)];
  }
}
/* Fields for an effect: every field set, all at their least, all at their greatest, every field at
   its default with the required ones made up, and a spread made up at random. */
function spread(name, n) {
  const F = FX[name].fields, r = rng(name.length * 7919 + name.charCodeAt(0)), out = [];
  const each = how => Object.fromEntries(Object.keys(F).map(k => [k, how(k)]));
  out.push(each(k => value(F[k], r, 'lo')), each(k => value(F[k], r, 'hi')));
  out.push(Object.fromEntries(Object.keys(F).filter(k => !('def' in F[k])).map(k => [k, value(F[k], r)])));
  for (let i = 0; i < n; i++) out.push(each(k => (r() < .3 && 'def' in F[k] ? F[k].def : value(F[k], r))));
  return out;
}
/* The clocks an effect is drawn at: the scene's time for one that moves, the ms since the trigger
   for straw and the burst's progress for sparks. */
function clocks(name, f) {
  const c = FX[name].clock;
  if (c === 'time') return [0, 1250, 2300, 3450, 4700, 12345.5];
  if (c === 'trigger') return f.piece === 'straw' ? [-40, 0, 100, 250, 499, 700] : [0, .25, .5, .75, 1];
  return [undefined];
}

// ---- The library ------------------------------------------------------------------------------------

test('the effects are the closed list the pack library names, in its order', () => {
  assert.deepEqual([...FX.NAMES], [...PK.WORLD_LISTS.EFFECTS]);
  for (const n of FX.NAMES) {
    const e = FX[n];
    assert.equal(typeof e.cost, 'function', n);
    assert.equal(typeof e.draw, 'function', n);
    assert.ok(Object.keys(e.fields).length >= 1 && Object.keys(e.fields).length <= 16, n);
    for (const [k, f] of Object.entries(e.fields)) {
      assert.match(k, /^[a-z][A-Za-z0-9]{0,15}$/, n + '.' + k);
      assert.ok(['point', 'offset', 'length', 'term', 'num', 'int', 'pair', 'colour', 'colours', 'ints', 'one'].includes(f.kind), n + '.' + k + ': ' + f.kind);
      assert.ok(Object.isFrozen(f), n + '.' + k);
    }
  }
});

test('the library loads under Node alone, and pack.js finds it there by itself', () => {
  assert.equal(typeof FX.bricks.cost, 'function');
  // pack.js asks for effects.js beside itself the first time a pack names an effect
  const r = read(WORLD());
  assert.equal(r.ok, true, r.reason);
});

test('each effect\'s cost bounds the fills it makes, for a spread of its fields, on three screens, at several moments', () => {
  const { KW, count } = sandbox(), E = KW.effects, V = KW.view;
  for (const name of E.NAMES) {
    let drawn = 0, best = 0;
    for (const f of spread(name, 40)) for (const size of SIZES) {
      fit(V, size);
      const b = E.bounds(name, f, V), bound = E[name].cost(b), glows = E[name].glows(b);
      assert.ok(Number.isInteger(bound) && bound >= 0, name + ': the cost is a whole number, not ' + bound);
      // a pack is refused past 200 000 fills in its still layers; nothing that costly is drawn here
      if (bound > 200000) continue;
      for (const t of clocks(name, E.withDefaults(E[name].fields, f))) {
        const got = count(() => E[name].draw(f, t));
        assert.ok(got.fills <= bound, name + ' ' + JSON.stringify(f) + ' at ' + size + ', ' + t + ': ' + got.fills + ' fills, more than its cost, ' + bound);
        assert.ok(got.glows <= glows, name + ' ' + JSON.stringify(f) + ': ' + got.glows + ' glows, more than ' + glows);
        best = Math.max(best, bound ? got.fills / bound : 1);
        drawn++;
      }
    }
    assert.ok(drawn >= 60, name + ': only ' + drawn + ' drawings were within the limits');
    // and the bound is not so loose that it says nothing: some drawing comes within a quarter of it
    assert.ok(best >= .25, name + ': no drawing came within a quarter of its cost, at best ' + best.toFixed(3));
  }
});

test('an effect drawn with its defaults draws what the fields given in full draw', () => {
  const { KW } = sandbox(), E = KW.effects;
  const record = f => { const log = []; KW.draw.setCtx(new Proxy({}, { set(_, k, v) { log.push(k + ' ' + v); return true; }, get(_, k) { return (...a) => { log.push(k + ' ' + a.join(' ')); }; } })); f(); return log; };
  fit(KW.view, SIZES[1]);
  for (const name of E.NAMES) {
    const F = E[name].fields, part = spread(name, 0)[2], full = E.withDefaults(F, part);
    for (const t of clocks(name, full)) assert.deepEqual(record(() => E[name].draw(part, t)), record(() => E[name].draw(full, t)), name);
  }
});

// ---- The pack library holds effects to the same tables -------------------------------------------------

/* The effect name with its required fields only, at modest values, as a shape of a pack. */
const MODEST = { point: [100, 300], offset: 400, length: 200, colour: '#123456' };
function modest(name) {
  const F = FX[name].fields, s = { k: 'fx', fx: name };
  for (const [k, f] of Object.entries(F)) {
    if ('def' in f) continue;
    if (f.kind in MODEST) s[k] = MODEST[f.kind];
    else if (f.kind === 'colours') s[k] = Array(f.min).fill('#654321');
    else if (f.kind === 'one') s[k] = f.of[0];
    else if (f.kind === 'num' || f.kind === 'int') s[k] = Math.max(f.lo, Math.min(f.hi, 40));
    else if (f.kind === 'pair') s[k] = f.of.map(([lo, hi]) => Math.max(lo, Math.min(hi, 40)));
    else throw new Error('no modest value for ' + name + '.' + k);
  }
  return s;
}
/* The fixture with shape s put in the cellar: in its still layer, or for an effect that moves in
   its moving layer. */
const layerOf = name => (FX[name].clock ? 'moving' : 'still');
function withEffect(s) {
  const p = WORLD();
  p.scenes['scene.cellar'][layerOf(s.fx)][0].shapes.push(s);
  return p;
}
const AT = name => 'pack.scenes["scene.cellar"].' + layerOf(name) + '[0].shapes[' + (layerOf(name) === 'still' ? 9 : 3) + ']';

test('every effect reads clean in a 1.1 scene with its required fields, and with every field at its default', () => {
  for (const name of FX.NAMES) {
    const r = read(withEffect(modest(name)));
    assert.equal(r.ok, true, name + ': ' + r.reason);
    const all = Object.assign(modest(name), JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(FX[name].fields).filter(([, f]) => 'def' in f).map(([k, f]) => [k, f.def])))));
    const r2 = read(withEffect(all));
    assert.equal(r2.ok, true, name + ' with its defaults given: ' + r2.reason);
  }
});

/* A value of the wrong kind or outside its range, for a field of kind f, and the end of the reason
   it is refused with. */
function wrong(f) {
  switch (f.kind) {
    case 'point': return [[100], 'must be a pair [x, y]'];
    case 'offset': return [3000, 'must be a multiple of 1/8 from -2048 to 2048'];
    case 'length': return [5000, 'must be a multiple of 1/8 from 0 to 4096'];
    case 'term': return [f.hi + 1, 'must be a multiple of 1/8 from ' + f.lo + ' to ' + f.hi];
    case 'num': return [f.hi + 1, 'must be a number from ' + f.lo + ' to ' + f.hi];
    case 'int': return [f.lo + 0.5, 'must be a whole number from ' + f.lo + ' to ' + f.hi];
    case 'pair': return [[f.of[0][0]], 'must be a pair of numbers'];
    case 'colour': return ['red', 'must be a hex colour or a reference such as "@base.k"'];
    case 'colours': return [Array(f.max + 1).fill('#000000'), 'must hold ' + f.min + ' to ' + f.max + ' entries, not ' + (f.max + 1)];
    case 'ints': return [[f.hi + 1], null];
    default: return ['nothing of the sort', 'must be one of ' + f.of.map(v => JSON.stringify(String(v))).join(', ')];
  }
}

test('each effect\'s table is enforced: every field of the wrong kind or out of range is refused, naming it', () => {
  let refused = 0;
  for (const name of FX.NAMES) for (const [k, f] of Object.entries(FX[name].fields)) {
    const [v, why] = wrong(f), s = modest(name);
    s[k] = v;
    const r = read(withEffect(s));
    assert.equal(r.ok, false, name + '.' + k + ' = ' + JSON.stringify(v) + ' was read');
    assert.equal(r.step, 'fields', name + '.' + k + ': ' + r.reason);
    const at = AT(name) + '.' + k + (f.kind === 'ints' ? '[0]' : '');
    assert.equal(r.reason, at + ': ' + (why || 'must be a whole number from ' + f.lo + ' to ' + f.hi), name + '.' + k);
    refused++;
  }
  assert.ok(refused > 100, refused + ' fields');
});

test('an effect takes no field its table lacks, and needs every field without a default', () => {
  for (const name of FX.NAMES) {
    const s = modest(name);
    s.colourful = 1;
    const r = read(withEffect(s));
    assert.equal(r.step, 'fields');
    assert.equal(r.reason, AT(name) + '.colourful: is not a field of the effect "' + name + '"');
    for (const k of Object.keys(modest(name)).filter(x => x !== 'k' && x !== 'fx')) {
      const t = modest(name);
      delete t[k];
      const q = read(withEffect(t));
      assert.equal(q.reason, AT(name) + '.' + k + ': is missing', name + '.' + k);
    }
  }
});

test('an effect\'s scalars are held to their ranges at both ends, and its colours and names are checked', () => {
  const bricks = WORLD();
  bricks.scenes['scene.cellar'].still[0].shapes[0].w = { W: 2 };
  let r = read(bricks);
  assert.equal(r.step, 'rules');
  assert.equal(r.reason, 'pack.scenes["scene.cellar"].still[0].shapes[0].w: the length reaches 5824 at its greatest, above 4096');
  const seed = WORLD();
  seed.scenes['scene.cellar'].moving[0].shapes[1].dt = { c: 59600, wave: [500, 100, 0] };
  r = read(seed);
  assert.equal(r.reason, 'pack.scenes["scene.cellar"].moving[0].shapes[1].dt: the value reaches 60100 at its greatest, above 60000');
  const named = WORLD();
  named.scenes['scene.cellar'].still[0].shapes[1].y = { c: 380, x: 1 };
  r = read(named);
  assert.equal(r.reason, 'pack.scenes["scene.cellar"].still[0].shapes[1].y.x: is the tile\'s x, and cannot be used outside a tile');
  const colour = withEffect(Object.assign(modest('tree'), { light: '@base.nothing' }));
  r = read(colour);
  assert.equal(r.step, 'references');
  assert.equal(r.reason, AT('tree') + '.light: names an entry, "nothing", that set "base" does not have');
  // a field of the kind "one" holds a word, never a colour, so it is not read as one
  assert.equal(read(withEffect(Object.assign(modest('coals'), { part: 'sparks' }))).ok, true);
});

test('the pack library costs an effect with its own cost function, at the ends of the scene\'s ranges', () => {
  const base = read(WORLD()).world.scenes['scene.cellar'], R = PK.SCENE_RANGE;
  for (const name of FX.NAMES) {
    const s = modest(name), F = FX[name].fields, b = { view: { L: R.L, R: R.R, T: R.T, W: R.W } };
    for (const [k, f] of Object.entries(F)) {
      const v = k in s ? s[k] : f.def;
      b[k] = f.kind === 'point' ? [[v[0], v[0]], [v[1], v[1]]] : ['offset', 'length', 'term'].includes(f.kind) ? [v, v] : v;
    }
    const w = read(withEffect(s)).world.scenes['scene.cellar'], cost = FX[name].cost(b), glows = FX[name].glows(b);
    if (layerOf(name) === 'still') assert.equal(w.still.cost - base.still.cost, cost, name);
    else {
      assert.equal(w.frame.cost - base.frame.cost, cost, name);
      assert.equal(w.frame.glows - base.frame.glows, glows, name);
    }
  }
  // a scalar on the screen's edges is costed at its widest: the bricks of the fixture's cellar, as
  // wide as the screen can be, down to 530 from the highest top
  const bricks = FX.bricks.cost({ p: [[-976, -16], [-602, -2]], w: [992, 2912], h: [532, 1132], size: [64, 26], view: {} });
  assert.equal(bricks, 1 + 3 * 44 * 47);
});

test('an effect too costly for a frame is refused at counts', () => {
  const p = WORLD();
  for (let i = 0; i < 18; i++) p.scenes['scene.cellar'].moving[0].shapes.push({ k: 'fx', fx: 'flame', p: [400, 400], size: 8 });
  const r = read(p);
  assert.equal(r.step, 'counts');
  assert.match(r.reason, /^pack\.scenes\["scene\.cellar"\]: costs up to \d+ fills in one frame of its moving and over layers, more than 16000$/);
  const g = WORLD();
  for (let i = 0; i < 4; i++) g.scenes['scene.cellar'].moving[0].shapes.push({ k: 'fx', fx: 'wander', p: [0, 200], w: 900, h: 100, n: 6 });
  assert.equal(read(g).reason, 'pack.scenes["scene.cellar"]: draws 25 glows in one frame, more than 24');
});

test('the world fixture of format 1.1 still reads clean, its effects checked against their tables', () => {
  const r = read(WORLD());
  assert.equal(r.ok, true, r.reason);
  let n = 0;
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.k === 'fx') { n++; assert.ok(FX.NAMES.includes(v.fx)); } Object.values(v).forEach(walk); } };
  walk(WORLD());
  assert.equal(n, 13);
});
