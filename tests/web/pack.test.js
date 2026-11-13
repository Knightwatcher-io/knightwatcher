// Tests for the pack library, web/js/pack.js, and the format of docs/packs.md.
// Run with: node --test tests/web/
// The fixture in fixtures/base.pack.json is a base-like pack: the helmet, plume, tabard and
// greatsword of the worked example and the rest of the knight transcribed from knight.js. Every
// rejection test changes one thing in a copy of it, signs the copy and reads it back.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');

const ROOT = path.join(__dirname, '../..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8');
const BASE = () => JSON.parse(FIXTURE).pack;
const clone = v => JSON.parse(JSON.stringify(v));

// ---- Signing, independently of pack.js -----------------------------------------------------------

// RFC 8785 for the values a pack holds, written separately from pack.js: keys sorted by UTF-16
// code units, compared one unit at a time.
function jcs(v) {
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const ks = Object.keys(v).sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d) return d; }
      return a.length - b.length;
    });
    return '{' + ks.map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const KEY = crypto.generateKeyPairSync('ed25519');
const OTHER = crypto.generateKeyPairSync('ed25519');
const raw = k => new Uint8Array(Buffer.from(k.export({ format: 'jwk' }).x, 'base64url'));
const PUB = raw(KEY.publicKey);
const verify = (pub, msg, sig) => crypto.verify(null, Buffer.from(msg),
  crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') }, format: 'jwk' }), Buffer.from(sig));
const OPTS = { keys: { kw1: PUB }, verify };
const sign = (pack, prefix = PK.PREFIX, key = KEY.privateKey) => crypto.sign(null, Buffer.from(prefix + jcs(pack), 'utf8'), key).toString('base64');
const sigOf = (pack, extra) => Object.assign({ alg: 'ed25519', kid: 'kw1', value: sign(pack) }, extra);
const envText = (pack, space) => JSON.stringify({ kwpack: 1, pack, sig: sigOf(pack) }, null, space);
const load = (pack, extra) => PK.read(envText(pack), Object.assign({}, OPTS, extra));
const readEnv = (env, extra) => PK.read(JSON.stringify(env), Object.assign({}, OPTS, extra));

function edited(edit) { const p = BASE(); edit(p); return p; }
function rejected(edit, step, re) {
  const r = load(edited(edit));
  assert.equal(r.ok, false, 'expected the pack to be refused');
  assert.equal(r.step, step, r.reason);
  if (re) assert.match(r.reason, re);
  return r;
}
function accepted(edit) {
  const r = load(edited(edit));
  assert.equal(r.ok, true, r.reason);
  return r;
}

// A small pack beside the base one: an id, and whatever the edit adds.
function extra(id, add) {
  const p = { id, name: 'Extra ' + id, version: '1.0.0', format: [1, 0], licence: 'Invented for the tests.', provides: [] };
  Object.assign(p, add || {});
  p.provides = ['builds', 'items', 'palettes', 'swatches', 'decorations'].filter(s => p[s] && Object.keys(p[s]).length);
  return p;
}

// ---- Shorthands into the fixture -----------------------------------------------------------------

const tab = p => p.items['torso.tabard'].parts[0].shapes;
const helm = p => p.items['helm.open'];
const opening = p => helm(p).parts[0].shapes[8];
const sword = p => p.items['main.greatsword'];
const lantern = p => p.decorations.lantern;
const rect = (x = 0) => ({ k: 'rect', p: [x, 0], w: 1, h: 1, fill: '@base.k' });
const backItem = (parts, n) => ({ slot: 'back', name: 'Filler', parts: Array.from({ length: parts }, () => ({ at: 'neck', shapes: Array.from({ length: n }, () => rect()) })) });
const pix = (w, h) => ({ k: 'pix', p: [0, 0], rows: Array.from({ length: h }, () => 'a'.repeat(w)), key: { a: '@base.k' } });
const range = n => Array.from({ length: n }, (_, i) => i);
function nested(depth) { let v = 0; for (let i = 0; i < depth; i++) v = { a: v }; return v; }
function ngon(n, r) { return range(n).map(i => [Math.round(r * Math.cos(2 * Math.PI * i / n) * 8) / 8, Math.round(r * Math.sin(2 * Math.PI * i / n) * 8) / 8]); }

// ---- The fixture -----------------------------------------------------------------------------------

test('the fixture validates, signed, and reports what it is', () => {
  const r = load(BASE());
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'kw.base');
  assert.equal(r.version, '1.0.0');
  assert.equal(r.signed, true);
  assert.deepEqual(r.provides, ['builds', 'items', 'palettes', 'swatches', 'decorations']);
  assert.ok(Object.isFrozen(r.data) && Object.isFrozen(r.data.items['helm.open'].parts[0].shapes[0]));
});

test('the fixture reaches the deepest nesting the format allows, and no deeper', () => {
  const depth = v => (v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0);
  assert.equal(PK.LIMITS.depth, 12);
  assert.equal(depth(JSON.parse(FIXTURE)), 12);
});

// ---- The base palette ---------------------------------------------------------------------------

test('the base palette equals what draw.js defines (draw.js loaded with a stub window)', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/js/draw.js'), 'utf8'), ctx);
  const D = ctx.window.KW.draw, want = {};
  for (const k of Object.keys(D.C)) want[k.toLowerCase()] = D.C[k];
  Object.assign(want, { steel: D.STEEL, steel2: D.STEEL2, steel3: D.STEEL3, gold: D.GOLD, leather: D.LEATHER });
  assert.deepEqual(clone(PK.BASE), clone(want));
  assert.ok(Object.isFrozen(PK.BASE) && Object.isFrozen(PK.BASE.steel[0]));
});

// ---- Drawing, against call logs worked out by hand --------------------------------------------------

const K = '#1a1524', W = '#ffffff';
const STEEL = [[0.12, '#f6f9fc'], [0.58, '#d8e0ea'], [0.84, '#aab6c6'], [1, '#7d899b']];
const STEEL2 = [[0.14, '#d8e0ea'], [0.6, '#aab6c6'], [1, '#7d899b']];
const STEEL3 = [[0.2, '#aab6c6'], [0.7, '#7d899b'], [1, '#525c6e']];
const GOLD = [[0.3, '#ffe28a'], [0.75, '#ffb000'], [1, '#c98600']];
const LEATHER = [[0.2, '#b98045'], [0.65, '#96622f'], [1, '#70461f']];
const TABARD = [[0.1, '#6f9eff'], [0.55, '#3f74e0'], [0.85, '#2f59b6'], [1, '#213f86']];
const BOOT_R = [[0.15, '#96622f'], [0.6, '#70461f'], [1, '#4c2e12']];

// A primitives object that records each call; trailing undefined arguments are left out.
function recorder() {
  const log = [];
  const rec = n => (...a) => { while (a.length && a[a.length - 1] === undefined) a.pop(); log.push([n].concat(a.map(x => (typeof x === 'function' ? x : clone(x))))); };
  return { log, P: { Rh: rec('Rh'), Rv: rec('Rv'), ell: rec('ell'), rrect: rec('rrect'), poly: rec('poly'), strip: rec('strip'), pix: rec('pix') } };
}

// The engine's rig of the format's section 2.3, as knight.js computes the same points today.
// o is a knight.js pose plus x and floor; d the look's build differences.
function rig(o, d) {
  const A = PK.newAnchors(), V = PK.newValues(), U = 5;
  const X = Math.round(o.x) + (o.shake || 0) * 4, Y = o.floor, ox = X - 120, oy = Y - 300;
  const u = ((o.bob || 0) + (o.crouch || 0)) * U, b = (o.bloat || 0) * U;
  const set = (n, x, y) => { A[2 * PK.ANCHOR[n]] = x; A[2 * PK.ANCHOR[n] + 1] = y; };
  set('root', X, Y);
  set('footL', X - (24 + d.dStance), Y); set('footR', X + (24 + d.dStance), Y);
  set('hipL', X - (24 + d.dStance), Y - (74 + d.dLeg) + u); set('hipR', X + (24 + d.dStance), Y - (74 + d.dLeg) + u);
  set('hem', X, Y - (64 + d.dLeg) + u); set('belt', X, Y - (102 + d.dLeg) + u); set('neck', X, Y - (162 + d.dHeight) + u);
  set('shoulderL', X - (54 + d.dShoulder + b), Y - (132 + d.dHeight) + u); set('shoulderR', X + (54 + d.dShoulder + b), Y - (132 + d.dHeight) + u);
  set('head', X + 5 * (o.headDx || 0), Y - (206 + d.dHeight + d.dHead) + u + 5 * (o.headDy || 0));
  let mode;
  if (o.hammer != null) { mode = 'hammer'; set('handL', X + 45, Y - 104 + u); set('handR', X + 80 + b, Y - 122 + u); }
  else if (o.sword !== false) {
    const a = o.wang || 0, gx = ox + o.gx * U, gy = oy + o.gy * U + u, sx = Math.sin(a), sy = -Math.cos(a);
    const up = [gx + sx * 6, gy + sy * 6], low = [gx - sx * 30, gy - sy * 30], right = sx >= 0;
    set('main', gx, gy); A[PK.FRAME_SX] = sx; A[PK.FRAME_SY] = sy;
    set(right ? 'handR' : 'handL', up[0], up[1]); set(right ? 'handL' : 'handR', low[0], low[1]);
    mode = right ? 'twoR' : 'twoL';
  } else { mode = 'none'; set('handL', X - (64 + b), Y - 84 + u); set('handR', X + (64 + b), Y - 84 + u); }
  const sl = o.walk && Math.floor(o.t / 320) % 2 === 0 ? 1 : 0, sr = o.walk && !sl ? 1 : 0;
  V[PK.VALUE.drop] = u; V[PK.VALUE.bloat] = b; V[PK.VALUE.stepL] = sl; V[PK.VALUE.stepR] = sr;
  V[PK.VALUE.sway] = Math.round(Math.sin(o.t / 900) * 4);
  return { A, V, mode };
}
const ZERO = { dShoulder: 0, dChest: 0, dWaist: 0, dHip: 0, dStance: 0, dLeg: 0, dHeight: 0, dHead: 0 };
const baseLook = (look) => PK.resolve([load(BASE())], look || {});
function drawList(list, o, d) { const R = recorder(), g = rig(o, d || ZERO); PK.draw(list, g.A, g.V, R.P); return R.log; }

const tabardAt = (x, top, w, h, hem, belt, mid) => [
  ['rrect', x - 3, top - 3, w + 6, h, 14, K],
  ['rrect', x, top, w, h - 6, 11, TABARD],
  ['Rh', mid - 2, hem - 22, 4, 22, K],
  ['Rh', x + 3, hem - 9, w - 6, 4, '#ffb000'],
  ['Rh', x + 3, hem - 5, w - 6, 2, '#c98600'],
  ['Rh', x, belt, w, 14, '#4c2e12'],
  ['Rh', x, belt + 2, w, 9, '#70461f'],
  ['Rh', x, belt + 2, w, 2, '#96622f'],
  ['rrect', mid - 12, belt - 4, 24, 22, 5, K],
  ['rrect', mid - 9, belt - 1, 18, 16, 3, GOLD],
  ['Rh', mid - 4, belt + 4, 8, 6, K],
  ['ell', mid, top + 28, 24, 14, '#c98600'],
  ['ell', mid, top + 28, 22, 12, GOLD],
  ['ell', mid, top + 28, 16, 7, '#213f86'],
  ['ell', mid, top + 28, 7, 6, W],
  ['ell', mid, top + 28, 3, 3, K]];

test('pose A, standing, reference build: legs, boots and tabard as worked by hand', () => {
  const L = baseLook();
  const log = drawList(L.lists.body, { x: 480, floor: 530, t: 0 });
  assert.deepEqual(log, [
    // greaves and knee cops, hung on hipL (456, 456) and hipR (504, 456)
    ['rrect', 439, 456, 34, 56, 8, K], ['rrect', 442, 459, 28, 50, 6, STEEL2],
    ['rrect', 487, 456, 34, 56, 8, K], ['rrect', 490, 459, 28, 50, 6, STEEL3],
    ['ell', 456, 470, 15, 10, K], ['ell', 456, 470, 12, 7, STEEL],
    ['ell', 504, 470, 15, 10, K], ['ell', 504, 470, 12, 7, STEEL2],
    // boots, on footL (456, 530) and footR (504, 530), neither lifted
    ['rrect', 428, 502, 48, 28, 9, K], ['rrect', 431, 505, 42, 20, 7, LEATHER], ['Rh', 431, 524, 42, 3, '#4c2e12'],
    ['rrect', 484, 502, 48, 28, 9, K], ['rrect', 487, 505, 42, 20, 7, BOOT_R], ['Rh', 487, 524, 42, 3, '#4c2e12'],
    // the tabard: neck (480, 368), belt 428, hem 466, as section 4.3 and knightHD give it
    ...tabardAt(434, 368, 92, 104, 466, 428, 480)]);
});

test('pose B, crouched and bloated (drop 10, bloat 5): the tabard widens by twice the bloat', () => {
  const log = drawList(baseLook().lists.body, { x: 300, floor: 530, t: 0, crouch: 2, bloat: 1 });
  assert.equal(log.length, 30);
  // neck (300, 378), belt 438, hem 476; the left edge moves out by the bloat
  assert.deepEqual(log.slice(14), tabardAt(249, 378, 102, 104, 476, 438, 300));
});

test('pose C, build B: the build\'s differences are folded into constants and move the tabard', () => {
  const L = baseLook({ build: 'kw.base/build.b' });
  assert.deepEqual(L.fallbacks.filter(f => f.kind === 'build'), []);
  assert.deepEqual(L.diffs, { dShoulder: -6, dChest: -6, dWaist: -12, dHip: 4, dStance: 4, dLeg: 12, dHeight: 8, dHead: -2 });
  const r0 = L.lists.body[14];
  assert.equal(r0.h, 100, 'h: 104 + dHeight 8 - dLeg 12, folded');
  assert.deepEqual(r0.w, [86, PK.VALUE.bloat, 2], 'w: 98 + 2 * dChest folded; the bloat stays a term');
  const log = drawList(L.lists.body, { x: 480, floor: 530, t: 0 }, L.diffs);
  // neck 530 - 170 = 360, belt 530 - 114 = 416, hem 530 - 76 = 454; chest 6 narrower each side
  const want = tabardAt(440, 360, 80, 100, 454, 416, 480);
  assert.deepEqual(log.slice(14), want);
});

test('pose D, walking with the left foot lifted: the left boot rises by 6', () => {
  const log = drawList(baseLook().lists.body, { x: 480, floor: 530, t: 0, walk: true });
  assert.deepEqual(log.slice(8, 14), [
    ['rrect', 428, 496, 48, 28, 9, K], ['rrect', 431, 499, 42, 20, 7, LEATHER], ['Rh', 431, 518, 42, 3, '#4c2e12'],
    ['rrect', 484, 502, 48, 28, 9, K], ['rrect', 487, 505, 42, 20, 7, BOOT_R], ['Rh', 487, 524, 42, 3, '#4c2e12']]);
});

test('pose E, the greatsword upright (angle 0, grip at 500, 400): every point is (500 + p, 400 - s)', () => {
  const R = recorder(), A = PK.newAnchors(), V = PK.newValues();
  A[2 * PK.ANCHOR.main] = 500; A[2 * PK.ANCHOR.main + 1] = 400; A[PK.FRAME_SX] = Math.sin(0); A[PK.FRAME_SY] = -Math.cos(0);
  PK.draw(baseLook().lists.main, A, V, R.P);
  const N3 = '#4c2e12', wrap = y => ['strip', 494, y, 506, y - 4, 1.5, 1.5, N3];
  assert.deepEqual(R.log, [
    ['poly', [[481, 369], [481, 164], [500, 130], [519, 164], [519, 369]], K, false],
    ['poly', [[485, 366], [485, 167], [500, 137], [515, 167], [515, 366]], [[0.16, '#f6f9fc'], [0.47, '#d8e0ea'], [0.55, '#7d899b'], [0.84, '#aab6c6'], [1, '#7d899b']], false],
    ['strip', 500, 450, 500, 378, 9, 9, K],
    ['strip', 500, 448, 500, 380, 6, 6, [[0.35, '#96622f'], [1, N3]]],
    wrap(442), wrap(432), wrap(422), wrap(412), wrap(402), wrap(392),
    ['ell', 500, 458, 13, 13, K], ['ell', 500, 458, 10, 10, GOLD],
    ['strip', 450, 373, 550, 373, 10, 10, K], ['strip', 450, 373, 550, 373, 7, 7, GOLD],
    ['ell', 450, 373, 12, 12, K], ['ell', 450, 373, 9, 9, GOLD], ['ell', 550, 373, 12, 12, K], ['ell', 550, 373, 9, 9, GOLD],
    ['ell', 500, 373, 12, 12, K], ['ell', 500, 373, 9, 9, [[0.3, '#ffb000'], [1, '#c98600']]], ['ell', 500, 373, 5, 5, '#ff4a3d'],
    ['Rh', 497, 370, 2, 2, W]]);
});

test('the helmet: the clip follows the head anchor, and @skin.face takes the ramp passed in', () => {
  const L = baseLook(), o = { x: 480, floor: 530, t: 0 };
  const helmet = L.lists.headOn.slice(7);   // after the plume's 7 shapes
  const log = drawList(helmet, o);
  // head anchor (480, 324): the dome's foot is clipped to 324 + 26 and 324 + 46
  assert.deepEqual(log[2], ['rrect', 414, 260, 132, 110, 48, [[0.12, '#d8e0ea'], [0.58, '#aab6c6'], [0.84, '#7d899b'], [1, '#525c6e']], 350, 370]);
  assert.deepEqual(log[8], ['rrect', 443, 303, 74, 44, 9, L.colours.face]);
  assert.deepEqual(log[9], ['rrect', 443, 303, 74, 44, 9, 'rgba(60,30,20,0.18)', 303, 308]);
  const R = recorder(), g = rig(o, ZERO);
  PK.draw(helmet, g.A, g.V, R.P, L.colours.sick);
  assert.deepEqual(R.log[8], ['rrect', 443, 303, 74, 44, 9, [[0.14, '#dff3bd'], [0.72, '#b9dd92'], [1, '#94bd6e']]]);
  // the plume hangs on the helmet's mount, (2, -74) from the head, and sways
  const plume = drawList(L.lists.headOn.slice(0, 7), { x: 480, floor: 530, t: 900 * Math.PI / 2 });
  assert.deepEqual(plume[0], ['ell', 486, 250, 41, 23, K]);
  assert.deepEqual(plume[1], ['ell', 504, 261, 28, 15, K]);
});

test('drawing reuses its point buffers: nothing is allocated per frame by the walk itself', () => {
  const list = baseLook().lists.main, seen = [];
  const P = Object.assign(recorder().P, { poly: pts => seen.push(pts) });
  const g = rig({ x: 480, floor: 530, t: 0, gx: 26, gy: 45, wang: 0.45 }, ZERO);
  PK.draw(list, g.A, g.V, P); PK.draw(list, g.A, g.V, P);
  assert.equal(seen.length, 4);
  assert.equal(seen[0], seen[2]);
  assert.equal(seen[1], seen[3]);
});

// ---- The whole knight against knight.js, pixel for pixel ----------------------------------------------

// draw.js, sprites.js, props.js and knight.js in a sandbox, drawing into a context that records
// every fill. Both the code-drawn knight and the compiled lists go through the same primitives, so
// equal records mean equal pixels.
function sandbox() {
  const ctx = vm.createContext({ window: {} });
  for (const f of ['draw.js', 'sprites.js', 'props.js', 'knight.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/js', f), 'utf8'), ctx);
  const KW = ctx.window.KW, fills = [];
  let style = '';
  const norm = s => String(s).replace(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/, (m, r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + Number(a) + ')');
  KW.draw.setCtx({ set fillStyle(v) { style = norm(v); }, get fillStyle() { return style; }, globalAlpha: 1,
    fillRect: (x, y, w, h) => fills.push([style, x, y, w, h]), beginPath() {}, arc() {}, fill() {} });
  return { KW, fills };
}
const GAP = Symbol('engine step');
// Whether actual is the pieces in order, each GAP standing for any run of the engine's own calls.
function follows(actual, pieces) {
  let i = 0, gap = false;
  for (const p of pieces) {
    if (p === GAP) { gap = true; continue; }
    if (!p.length) continue;
    const at = j => p.every((e, k) => JSON.stringify(actual[j + k]) === JSON.stringify(e));
    if (gap) {
      let j = i;
      while (j + p.length <= actual.length && !at(j)) j++;
      assert.ok(j + p.length <= actual.length, 'a piece of ' + p.length + ' fills was not found after position ' + i);
      i = j + p.length;
    } else {
      assert.ok(at(i), 'fills from position ' + i + ' differ');
      i += p.length;
    }
    gap = false;
  }
  if (!gap) assert.equal(i, actual.length, 'calls left over at the end');
}

const POSES = {
  'idle': (k) => k.pose('idle', 0),
  'idle, blinking and bobbing': (k) => k.pose('idle', 900),
  'memory tight, bloated': (k) => k.pose('memory_tight', 1300),
  'attack, shaking, the blade at a fractional angle': (k) => k.pose('attack', 777),
  'unwell: sick skin, the head shifted': (k) => k.pose('container_unhealthy', 2000),
  'walking, the right foot lifted': (k) => Object.assign(k.pose('ssh_session', 400), { walk: true }),
  'helmet off': (k) => Object.assign(k.pose('updating', 0), { helmet: false }),
  'sword put away, crouched under crates': (k) => k.pose('disk_full', 500),
  'at the anvil': (k) => Object.assign(k.pose('updating', 0), { hammer: 0.4 }),
  'mid-swing, leaning left': (k) => { const o = k.pose('idle', 0); k.swing(o, 0.2, 1); return o; },
  'mid-swing, leaning right': (k) => { const o = k.pose('idle', 0); k.swing(o, 0.45, 1); return o; }
};
for (const [name, make] of Object.entries(POSES)) {
  test('the compiled knight draws what knight.js draws: ' + name, () => {
    const S = sandbox(), L = baseLook(), o = Object.assign(make(S.KW.knight), { x: 471.6, floor: 530 });
    S.KW.knight.draw(o);
    const code = S.fills.splice(0);
    const g = rig(o, ZERO), face = { L: L.colours.sick, P: L.colours.hot }[o.face];
    const pieces = PK.sequence(g.mode, o.helmet !== false).map(n => {
      if (!(n in L.lists)) return GAP;
      PK.draw(L.lists[n], g.A, g.V, S.KW.draw, face);
      return S.fills.splice(0);
    });
    assert.ok(code.length > 100);
    follows(code, pieces);
  });
}

// ---- Rules: one refused pack for each rule of sections 3 and 6 ------------------------------------------

const RULES = [
  // 3.11 the format
  ['format: the major version must be 1', 'format', p => { p.format = [2, 0]; }, /major version 2/],
  ['format: a minor version newer than the engine\'s is refused', 'format', p => { p.format = [1, 1]; }, /newer than this engine/],
  ['format: must be two whole numbers', 'format', p => { p.format = [1]; }],
  ['format: must not be a string', 'format', p => { p.format = '1.0'; }],
  ['format: is required', 'format', p => { delete p.format; }],
  // 3.2 the pack
  ['pack: no unknown field', 'fields', p => { p.colour = 'blue'; }, /pack\.colour: is not a field here/],
  ['pack: id is required', 'fields', p => { delete p.id; }, /pack\.id: is missing/],
  ['pack: id is lower case', 'fields', p => { p.id = 'Kw.base'; }, /pack\.id: must be an id/],
  ['pack: id of one character', 'fields', p => { p.id = 'k'; }],
  ['pack: id with a later segment of 32 characters', 'fields', p => { p.id = 'kw.' + 'x'.repeat(32); }],
  ['pack: id with a first segment of 33 characters', 'fields', p => { p.id = 'k'.repeat(33); }],
  ['pack: id of five segments', 'fields', p => { p.id = 'kw.a.b.c.d'; }],
  ['pack: name is required', 'fields', p => { delete p.name; }],
  ['pack: name of 49 characters', 'fields', p => { p.name = 'n'.repeat(49); }, /pack\.name/],
  ['pack: name must be one line', 'fields', p => { p.name = 'Two\nlines'; }],
  ['pack: name must not be empty', 'fields', p => { p.name = ''; }],
  ['pack: version must have three parts', 'fields', p => { p.version = '1.0'; }, /pack\.version/],
  ['pack: version parts stop at 999', 'fields', p => { p.version = '1.0.1000'; }],
  ['pack: version parts have no leading zero', 'fields', p => { p.version = '01.0.0'; }],
  ['pack: licence of 201 characters', 'fields', p => { p.licence = 'l'.repeat(201); }, /pack\.licence/],
  ['pack: licence must be one line', 'fields', p => { p.licence = 'One\nTwo'; }],
  ['pack: provides must be an array', 'fields', p => { p.provides = 'items'; }],
  ['pack: provides names only the sections', 'fields', p => { p.provides.push('defaults'); }],
  ['pack: provides names each section once', 'fields', p => { p.provides.push('items'); }],
  ['pack: provides must list every section the pack holds', 'rules', p => { p.provides = p.provides.filter(s => s !== 'palettes'); }, /must list "palettes"/],
  ['pack: provides must not list a section the pack lacks', 'rules', p => { delete p.decorations; }, /lists "decorations"/],
  ['pack: companions must be an object', 'fields', p => { p.companions = []; }, /companions/],
  ['pack: ext must be an object', 'fields', p => { p.ext = 'x'; }, /pack\.ext/],
  ['ids: an item id must match the local pattern', 'fields', p => { p.items.Helm = p.items['helm.open']; }, /not a valid id/],
  ['ids: an item id of 49 characters', 'fields', p => { p.items['h' + 'x'.repeat(48)] = backItem(1, 1); }],
  // 3.3 colours, palettes and swatches
  ['palettes: a pack may not define a reserved set', 'fields', p => { p.palettes.tabard = { 0: '#000000' }; }, /reserved set name/],
  ['palettes: a set name cannot hold a dot', 'fields', p => { p.palettes['a.b'] = { x: '#000000' }; }],
  ['palettes: 17 sets', 'fields', p => { for (const i of range(16)) p.palettes['set' + i] = { a: '#000000' }; }, /0 to 16 sets, not 17/],
  ['palettes: 33 entries in a set', 'fields', p => { for (const i of range(31)) p.palettes.lantern['e' + i] = '#000000'; }, /1 to 32 entries/],
  ['palettes: an empty set', 'fields', p => { p.palettes.empty = {}; }],
  ['palettes: may refer only to @base', 'references', p => { p.palettes.lantern.rim = '@tabard.1'; }, /only to @base/],
  ['palettes: a reference to a missing base entry', 'references', p => { p.palettes.lantern.rim = '@base.zz'; }, /does not have/],
  ['colours: hex must be six lower-case digits', 'fields', p => { tab(p)[0].fill = '#1A1524'; }, /fill/],
  ['colours: hex must be six digits', 'fields', p => { tab(p)[0].fill = '#fff'; }],
  ['colours: a reference starts with @', 'fields', p => { tab(p)[0].fill = 'base.k'; }],
  ['colours: translucent needs a', 'fields', p => { tab(p)[0].fill = { rgb: '#000000' }; }, /fill\.a: is missing/],
  ['colours: translucent a of 0', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 0 }; }],
  ['colours: translucent a above 1', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 1.001 }; }],
  ['colours: translucent has only rgb and a', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 0.5, b: 1 }; }],
  ['colours: a reference to an unknown set', 'references', p => { tab(p)[0].fill = '@cloak.1'; }, /"cloak", that does not exist/],
  ['colours: a reference to a missing entry', 'references', p => { tab(p)[0].fill = '@base.s9'; }, /"s9"/],
  ['colours: a band list cannot hold a band list', 'references', p => { tab(p)[0].fill = [[0.5, '@base.steel'], [1, '@base.k']]; }, /needs a single colour/],
  ['colours: a pix key must be a single colour', 'references', p => { p.items['back.pennant'].parts[0].shapes[0].key.k = '@skin.face'; }, /single colour/],
  ['bands: at least one band', 'fields', p => { tab(p)[0].fill = []; }],
  ['bands: 9 bands', 'fields', p => { tab(p)[0].fill = range(9).map(i => [i === 8 ? 1 : Math.round((i + 1) / 9 * 1000) / 1000, '@base.k']); }, /1 to 8 entries/],
  ['bands: fractions must rise', 'fields', p => { tab(p)[0].fill = [[0.5, '@base.k'], [0.5, '@base.w'], [1, '@base.k']]; }, /must rise/],
  ['bands: the first fraction is above 0', 'fields', p => { tab(p)[0].fill = [[0, '@base.k'], [1, '@base.w']]; }],
  ['bands: the last fraction is 1', 'fields', p => { tab(p)[0].fill = [[0.5, '@base.k'], [0.9, '@base.w']]; }, /last fraction/],
  ['bands: a band is a pair', 'fields', p => { tab(p)[0].fill = [[1, '@base.k', 2]]; }],
  ['swatches: only the four user sets', 'fields', p => { p.swatches.cloak = p.swatches.tabard; }, /cloak/],
  ['swatches: every entry of the set', 'fields', p => { delete p.swatches.tabard.blue.entries[3]; }, /is missing/],
  ['swatches: no entry outside the set', 'fields', p => { p.swatches.tabard.blue.entries[4] = '#000000'; }],
  ['swatches: entries are literal colours', 'fields', p => { p.swatches.tabard.blue.entries[0] = '@base.b0'; }],
  ['swatches: the skin ramps are band lists', 'fields', p => { p.swatches.skin.warm.entries.face = '#ffe3c4'; }, /band list/],
  ['swatches: a swatch needs a name', 'fields', p => { delete p.swatches.hair.brown.name; }],
  ['swatches: 33 in a set', 'fields', p => { for (const i of range(31)) p.swatches.tabard['t' + i] = p.swatches.tabard.blue; }, /1 to 32 swatches/],
  // 3.4 builds and defaults
  ['builds: only the base pack carries builds', 'fields', p => { p.id = 'kw.other'; }, /only the base pack/],
  ['builds: the base pack must carry builds and defaults', 'fields', p => { delete p.builds; delete p.defaults; p.provides = p.provides.filter(s => s !== 'builds'); }, /must carry builds and defaults/],
  ['builds: 5 builds', 'fields', p => { for (const i of range(3)) p.builds['build.x' + i] = p.builds['build.a']; }, /1 to 4 builds/],
  ['builds: name of 33 characters', 'fields', p => { p.builds['build.a'].name = 'b'.repeat(33); }],
  ['builds: every measurement is required', 'fields', p => { delete p.builds['build.a'].m.stance; }, /stance: is missing/],
  ['builds: no unknown measurement', 'fields', p => { p.builds['build.a'].m.neck = 10; }],
  ['builds: measurements are whole numbers', 'fields', p => { p.builds['build.a'].m.shoulder = 54.5; }],
  ['builds: shoulder below 40', 'fields', p => { p.builds['build.a'].m.shoulder = 39; }, /from 40 to 70/],
  ['builds: shoulder above 70', 'fields', p => { p.builds['build.a'].m.shoulder = 71; }],
  ['builds: chest below 32', 'fields', p => { p.builds['build.a'].m.chest = 31; }],
  ['builds: chest above 64', 'fields', p => { p.builds['build.a'].m.chest = 65; }],
  ['builds: waist below 28', 'fields', p => { p.builds['build.a'].m.waist = 27; }],
  ['builds: waist above 64', 'fields', p => { p.builds['build.a'].m.waist = 65; }],
  ['builds: hip below 32', 'fields', p => { p.builds['build.a'].m.hip = 31; }],
  ['builds: hip above 64', 'fields', p => { p.builds['build.a'].m.hip = 65; }],
  ['builds: stance below 16', 'fields', p => { p.builds['build.a'].m.stance = 15; }],
  ['builds: stance above 34', 'fields', p => { p.builds['build.a'].m.stance = 35; }],
  ['builds: leg below 60', 'fields', p => { p.builds['build.a'].m.leg = 59; }],
  ['builds: leg above 100', 'fields', p => { p.builds['build.a'].m.leg = 101; }],
  ['builds: height below 110', 'fields', p => { p.builds['build.a'].m.height = 109; }],
  ['builds: height above 160', 'fields', p => { p.builds['build.a'].m.height = 161; }],
  ['builds: head below 42', 'fields', p => { p.builds['build.a'].m.head = 41; }],
  ['builds: head above 60', 'fields', p => { p.builds['build.a'].m.head = 61; }],
  ['builds: the head item must exist', 'references', p => { p.builds['build.a'].head = 'head.none'; }, /does not have/],
  ['builds: the head item must have slot head', 'references', p => { p.builds['build.a'].head = 'hair.short'; }, /not head/],
  ['defaults: every slot but back and off', 'fields', p => { delete p.defaults.items.arms; }, /arms: is missing/],
  ['defaults: the head comes from the build', 'fields', p => { p.defaults.items.head = 'head.plain'; }, /head: is not a field here/],
  ['defaults: a swatch for each set', 'fields', p => { delete p.defaults.swatches.plume; }],
  ['defaults: only the base pack', 'fields', p => { const q = extra('kw.other', { defaults: p.defaults }); Object.keys(p).forEach(k => delete p[k]); Object.assign(p, q); }, /only the base pack, kw\.base, may carry defaults/],
  ['defaults: the build must exist', 'references', p => { p.defaults.build = 'build.z'; }],
  ['defaults: the item must exist', 'references', p => { p.defaults.items.legs = 'legs.none'; }],
  ['defaults: the item must fit the slot', 'references', p => { p.defaults.items.legs = 'boots.leather'; }, /not legs/],
  ['defaults: the swatch must exist', 'references', p => { p.defaults.swatches.tabard = 'purple'; }],
  // 3.5 items
  ['items: an unknown slot', 'fields', p => { p.items['legs.plate'].slot = 'tail'; }, /slot: must be one of/],
  ['items: slot is required', 'fields', p => { delete p.items['legs.plate'].slot; }],
  ['items: name is required', 'fields', p => { delete p.items['legs.plate'].name; }],
  ['items: name of 49 characters', 'fields', p => { p.items['legs.plate'].name = 'n'.repeat(49); }],
  ['items: at least one part', 'fields', p => { p.items['legs.plate'].parts = []; }],
  ['items: 17 parts', 'fields', p => { p.items['back.x'] = backItem(17, 1); }, /1 to 16 entries/],
  ['items: no field the slot does not take', 'fields', p => { p.items['legs.plate'].mounts = { plume: [0, 0] }; }, /mounts: is not a field here/],
  ['items: views only on hair', 'fields', p => { helm(p).views = { helmeted: [] }; }],
  ['items: rest only on helmet, plume and off', 'fields', p => { p.items['legs.plate'].rest = helm(p).rest; }],
  ['items: a main item needs a grip', 'fields', p => { delete sword(p).grip; }, /grip: is missing/],
  ['items: grip kind two or one', 'fields', p => { sword(p).grip.kind = 'three'; }],
  ['items: a two grip has two stations', 'rules', p => { sword(p).grip.hands = [6]; }, /has 2 stations/],
  ['items: a one grip has one station', 'rules', p => { p.items['main.arming'].grip.hands = [0, 4]; }, /has 1 station/],
  ['items: blade from below to', 'rules', p => { sword(p).blade.from = 300; }, /from must be below to/],
  ['items: an off item needs hold', 'fields', p => { delete p.items['off.round'].hold; }],
  ['items: an off item\'s face is [x, y, w, h]', 'fields', p => { p.items['off.round'].face = [0, 0, 10]; }],
  ['parts: side is L or R', 'fields', p => { p.items['boots.leather'].parts[0].side = 'X'; }],
  ['parts: arms need a side', 'fields', p => { delete p.items['arms.plate'].parts[0].side; }, /side: is required in arms/],
  ['parts: gauntlets need a side', 'fields', p => { delete p.items['gauntlets.plate'].parts[1].side; }, /side: is required in gauntlets/],
  ['parts: arms have one part for each side', 'rules', p => { p.items['arms.plate'].parts[1].side = 'L'; }, /exactly one part for each side/],
  ['parts: gauntlets have one part for each side', 'rules', p => { p.items['gauntlets.plate'].parts.push(clone(p.items['gauntlets.plate'].parts[0])); }],
  ['parts: at least one shape', 'fields', p => { tab(p).length = 0; }],
  ['parts: 129 shapes', 'fields', p => { p.items['back.x'] = backItem(1, 129); }, /1 to 128 entries/],
  ['parts: an unknown anchor', 'references', p => { p.items['legs.plate'].parts[0].at = 'elbow'; }, /does not hang anything on "elbow"/],
  ['parts: an anchor the slot does not allow', 'references', p => { p.items['torso.tabard'].parts[0].at = 'head'; }],
  ['parts: a sided anchor needs a side', 'references', p => { delete p.items['boots.leather'].parts[0].side; }, /needs a part drawn for one side/],
  ['parts: a shape\'s own anchor must be one the slot allows', 'references', p => { tab(p)[0].at = 'hipL'; }],
  ['parts: an anchored point must be one the slot allows', 'references', p => { p.items['arms.plate'].parts[0].shapes[0].p1.at = 'head'; }],
  // 3.6 shapes
  ['shapes: an unknown kind', 'fields', p => { tab(p)[0].k = 'circle'; }],
  ['shapes: a missing field', 'fields', p => { delete tab(p)[0].r; }, /\.r: is missing/],
  ['shapes: a field the kind does not take', 'fields', p => { tab(p)[2].clip = [0, 1]; }, /clip: is not a field here/],
  ['shapes: g only in a decoration', 'fields', p => { tab(p)[0].g = 'flame'; }],
  ['shapes: no own anchor in a rest view', 'fields', p => { helm(p).rest.shapes[0].at = 'head'; }],
  ['shapes: no own anchor in a decoration', 'fields', p => { lantern(p).shapes[0].at = 'head'; }],
  ['scalars: an offset past 512', 'fields', p => { tab(p)[2].p = [512.125, 0]; }, /from -512 to 512/],
  ['scalars: an offset past -512', 'fields', p => { tab(p)[2].p = [-512.125, 0]; }],
  ['scalars: offsets are multiples of 1/8', 'fields', p => { tab(p)[2].p = [0.1, 0]; }, /multiple of 1\/8/],
  ['scalars: a length below 0', 'fields', p => { tab(p)[2].w = -0.125; }],
  ['scalars: a length past 512', 'fields', p => { tab(p)[2].w = 512.125; }],
  ['scalars: a radius past 256', 'fields', p => { tab(p)[0].r = 256.125; }],
  ['scalars: a strip half-width past 64', 'fields', p => { sword(p).parts[0].shapes[2].hw0 = 64.125; }],
  ['scalars: a coefficient past 8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: 8.125 }; }, /from -8 to 8/],
  ['scalars: a coefficient past -8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: -9 }; }],
  ['scalars: coefficients are multiples of 1/8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: 0.3 }; }],
  ['scalars: a term key must be a name', 'fields', p => { tab(p)[0].w = { c: 98, 'b-x': 1 }; }],
  ['scalars: an unknown named value', 'references', p => { tab(p)[0].w = { c: 98, wobble: 1 }; }, /wobble: is not a named value/],
  ['scalars: step only in a part for one side', 'references', p => { tab(p)[0].w = { c: 98, step: 1 }; }, /"step" needs a part drawn for one side/],
  ['scalars: no per-frame value in a rest view', 'references', p => { helm(p).rest.shapes[0].w = { c: 64, drop: 1 }; }, /in a rest view/],
  ['scalars: no per-frame value in a mount', 'references', p => { helm(p).mounts.plume = [{ c: 2, sway: 1 }, -74]; }, /in a mount point/],
  ['scalars: no named value in a decoration', 'references', p => { lantern(p).shapes[0].w = { c: 2, dHead: 1 }; }, /in a decoration/],
  ['points: a pair has two entries', 'fields', p => { tab(p)[2].p = [0, 0, 0]; }],
  ['points: an anchored point needs x and y', 'fields', p => { delete p.items['arms.plate'].parts[0].shapes[0].p1.y; }],
  ['points: a framed point names the main frame', 'fields', p => { sword(p).parts[0].shapes[2].p0.frame = 'off'; }],
  ['points: frame values within 400', 'fields', p => { sword(p).parts[0].shapes[2].p0.s = 400.125; }, /from -400 to 400/],
  ['points: framed points only in the main slot', 'references', p => { tab(p)[2].p = { frame: 'main', s: 0, p: 0 }; }, /only in the main slot/],
  ['points: only pairs in a rest view', 'fields', p => { helm(p).rest.shapes[0].p = { at: 'rest', x: 0, y: 0 }; }],
  ['poly: dir is required', 'fields', p => { delete sword(p).parts[0].shapes[0].dir; }],
  ['poly: dir is rows, cols or frame', 'fields', p => { sword(p).parts[0].shapes[0].dir = 'diag'; }],
  ['poly: dir frame only in the main slot', 'references', p => { tab(p)[0] = { k: 'poly', dir: 'frame', pts: [[0, 0], [10, 0], [0, 10]], fill: '@base.k' }; }],
  ['poly: at least 3 points', 'fields', p => { sword(p).parts[0].shapes[0].pts.length = 2; }],
  ['poly: 17 points', 'fields', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: ngon(17, 200), fill: '@base.k' }; }, /3 to 16 entries/],
  ['poly: convex', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, 0], [20, 0], [10, 5], [20, 20], [0, 20]], fill: '@base.k' }; }, /convex/],
  ['poly: not wound twice round', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, -10], [9, 6], [-9, -3], [9, -3], [-9, 6]], fill: '@base.k' }; }, /convex/],
  ['poly: not every point on one line', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, 0], [5, 0], [10, 0]], fill: '@base.k' }; }],
  ['poly: all pairs or all framed', 'rules', p => { sword(p).parts[0].shapes[0].pts[0] = [0, 0]; }, /all pairs or all framed/],
  ['poly: framed points carry no screen offset', 'rules', p => { sword(p).parts[0].shapes[0].pts[0].x = 1; }],
  ['clip: is [top, bottom]', 'fields', p => { helm(p).parts[0].shapes[2].clip = [26]; }],
  ['pix: 65 rows', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0] = pix(4, 65); }, /1 to 64 entries/],
  ['pix: a row of 65', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0] = pix(65, 1); }, /at most 64 characters/],
  ['pix: rows of one length', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].rows[1] = 'kb'; }],
  ['pix: printable characters only', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].rows[0] = 'k k.'; }],
  ['pix: every character in the key', 'references', p => { p.items['back.pennant'].parts[0].shapes[0].rows[0] = 'kkz.'; }, /"z"/],
  ['pix: 17 keys', 'fields', p => { const s = p.items['back.pennant'].parts[0].shapes[0]; for (const c of 'CDEFGHIJLMNOPQR') s.key[c] = '@base.k'; }, /1 to 16 characters/],
  ['pix: a key is one character', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].key.kk = '@base.k'; }],
  ['pix: "." is not a key', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].key['.'] = '@base.k'; }],
  // 3.7 rest views
  ['rest: fits is hang, surface or floor', 'fields', p => { helm(p).rest.fits = 'wall'; }],
  ['rest: box of 241', 'fields', p => { helm(p).rest.box = [241, 70]; }, /from 1 to 240/],
  ['rest: box of 0', 'fields', p => { helm(p).rest.box = [0, 70]; }],
  ['rest: mounts only on a helmet', 'fields', p => { p.items['off.round'].rest.mounts = { plume: [0, 0] }; }],
  ['rest: a plume\'s rest view has shapes only', 'fields', p => { p.items['plume.crest'].rest.fits = 'surface'; }],
  ['rest: 65 shapes', 'fields', p => { helm(p).rest.shapes = range(65).map(() => rect()); }, /1 to 64 entries/],
  // 3.8 decorations
  ['decorations: name is required', 'fields', p => { delete lantern(p).name; }],
  ['decorations: fits names at least one kind', 'fields', p => { lantern(p).fits = []; }],
  ['decorations: fits names each kind once', 'fields', p => { lantern(p).fits = ['hang', 'hang']; }, /appears twice/],
  ['decorations: fits names only kinds', 'fields', p => { lantern(p).fits = ['wall']; }],
  ['decorations: box of 241', 'rules', p => { lantern(p).box = [241, 70]; }, /at most 240 by 240/],
  ['decorations: box of 241 high', 'rules', p => { lantern(p).box = [40, 241]; }],
  ['decorations: 9 groups', 'fields', p => { for (const i of range(8)) lantern(p).groups['g' + i] = { pivot: [0, 0] }; }, /0 to 8 groups/],
  ['decorations: a group has a pivot', 'fields', p => { lantern(p).groups.flame = {}; }],
  ['decorations: a shape names a declared group', 'references', p => { lantern(p).shapes[3].g = 'smoke'; }, /does not declare/],
  ['decorations: 65 shapes', 'fields', p => { lantern(p).shapes = range(65).map(() => rect()); }, /1 to 64 entries/],
  ['decorations: only pairs for points', 'fields', p => { lantern(p).shapes[0].p = { at: 'head', x: 0, y: 0 }; }],
  ['anim: period below 0.2', 'fields', p => { lantern(p).anim.period = 0.199; }, /from 0.2 to 600/],
  ['anim: period above 600', 'fields', p => { lantern(p).anim.period = 600.001; }],
  ['anim: loop is required', 'fields', p => { delete lantern(p).anim.loop; }],
  ['anim: loop is true or false', 'fields', p => { lantern(p).anim.loop = 1; }],
  ['anim: phase from 0 to 1', 'fields', p => { lantern(p).anim.phase = 1.5; }],
  ['anim: 17 tracks', 'fields', p => { lantern(p).anim.tracks = range(17).map(() => lantern(p).anim.tracks[0]); }, /1 to 16 entries/],
  ['tracks: 33 keys', 'fields', p => { lantern(p).anim.tracks[0].keys = range(33).map(i => [Math.round(i / 32 * 1000) / 1000, 0]); }, /1 to 32 entries/],
  ['tracks: times rise', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0.5, 0], [0.5, 1]]; }, /times must rise/],
  ['tracks: times from 0 to 1', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0, 0], [1.5, 1]]; }],
  ['tracks: a channel of the list', 'fields', p => { lantern(p).anim.tracks[0].ch = 'spin'; }],
  ['tracks: show is always step', 'fields', p => { lantern(p).anim.tracks[1].ease = 'linear'; }, /must be "step"/],
  ['tracks: an ease is required on dx, dy, scale and alpha', 'fields', p => { delete lantern(p).anim.tracks[0].ease; }],
  ['tracks: an ease of the list', 'fields', p => { lantern(p).anim.tracks[0].ease = 'bounce'; }],
  ['tracks: scale from 0.25 to 4', 'fields', p => { lantern(p).anim.tracks[0] = { g: 'flame', ch: 'scale', ease: 'linear', keys: [[0, 1], [1, 4.001]] }; }],
  ['tracks: alpha from 0 to 1', 'fields', p => { lantern(p).anim.tracks[0] = { g: 'flame', ch: 'alpha', ease: 'linear', keys: [[0, 1.5]] }; }],
  ['tracks: show is 0 or 1', 'fields', p => { lantern(p).anim.tracks[1].keys = [[0, 2]]; }],
  ['tracks: dx in eighths', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0, 0.3]]; }],
  ['tracks: a palette track takes hex colours', 'fields', p => { lantern(p).anim.tracks[2].keys = [[0, '@base.k']]; }],
  ['tracks: a group track names a declared group', 'references', p => { lantern(p).anim.tracks[0].g = 'smoke'; }],
  ['tracks: a palette track changes only the pack\'s own sets', 'references', p => { lantern(p).anim.tracks[2].pal = 'tabard.1'; }, /palette set of this pack/],
  ['tracks: a palette track names an existing entry', 'references', p => { lantern(p).anim.tracks[2].pal = 'lantern.wick'; }],
  ['tracks: a palette track names a single hex colour', 'references', p => { lantern(p).anim.tracks[2].pal = 'lantern.rim'; }, /hex colour/],
  ['tracks: one track for each thing it drives', 'rules', p => { lantern(p).anim.tracks.push(clone(lantern(p).anim.tracks[0])); }, /already drives/],
  // 2.7 the face box
  ['face box: a helmet needs a @skin.face shape', 'rules', p => { opening(p).fill = '@base.k'; }, /face box/],
  ['face box: the opening must cover x from -28', 'rules', p => { opening(p).p = [-27, -21]; }],
  ['face box: the opening must cover y to 20', 'rules', p => { opening(p).h = 40; }],
  ['face box: a clip may not cut into it', 'rules', p => { opening(p).clip = [-21, 10]; }],
  ['face box: it must hold for every build', 'rules', p => { opening(p).w = { c: 74, dHead: 2 }; }],
  ['face box: it must hold in every frame', 'rules', p => { opening(p).p = [-37, { c: -21, drop: 1 }]; }],
  // 6.2 counts
  ['counts: 257 items', 'counts', p => { const n = 257 - Object.keys(p.items).length; for (const i of range(n)) p.items['back.f' + i] = backItem(1, 1); }, /257 items/],
  ['counts: 401 shapes in one item', 'counts', p => { p.items['back.x'] = backItem(4, 100); p.items['back.x'].parts[0].shapes.push(rect()); }, /401 shapes/],
  ['counts: 401 shapes counting views and rest', 'counts', p => { p.items['hair.long'].views.helmeted.push(...[100, 100, 100, 91].map(n => ({ at: 'head', shapes: range(n).map(() => rect()) }))); }, /401 shapes/],
  ['counts: 16 385 pixels in one pack', 'counts', p => { delete p.items['back.pennant']; p.items['back.x'] = { slot: 'back', name: 'Big', parts: [{ at: 'neck', shapes: [pix(64, 64), pix(64, 64), pix(64, 64), pix(64, 64), pix(1, 1)] }] }; }, /16385 pixels/],
  ['counts: 65 decorations', 'counts', p => { for (const i of range(64)) p.decorations['d' + i] = lantern(p); }, /65 decorations/],
  ['counts: the default look over 1200 shapes', 'counts', p => {
    for (const s of ['legs', 'boots', 'torso']) { p.items[s + '.big'] = backItem(4, 100); p.items[s + '.big'].slot = s; p.items[s + '.big'].parts.forEach(pt => { pt.at = s === 'legs' ? 'hipL' : s === 'boots' ? 'footL' : 'neck'; }); p.defaults.items[s] = s + '.big'; }
  }, /draws 1\d{3} shapes/]
];
for (const [rule, step, edit, re] of RULES) test('refused at ' + step + ': ' + rule, () => { rejected(edit, step, re); });

// ---- The edges of the limits pass --------------------------------------------------------------------

const EDGES = [
  ['a name of 48 characters', p => { p.name = 'n'.repeat(48); }],
  ['a licence of 200 characters', p => { p.licence = 'l'.repeat(200); }],
  ['version 999.999.999', p => { p.version = '999.999.999'; }],
  ['an item id of 48 characters', p => { p.items['h' + 'x'.repeat(47)] = backItem(1, 1); }],
  ['16 palette sets of 32 entries', p => { for (const i of range(15)) p.palettes['set' + i] = Object.fromEntries(range(32).map(j => ['e' + j, '#000000'])); }],
  ['32 swatches in a set', p => { for (const i of range(30)) p.swatches.tabard['t' + i] = p.swatches.tabard.blue; }],
  ['4 builds', p => { for (const i of range(2)) p.builds['build.x' + i] = p.builds['build.a']; }],
  ['measurements at the bottom of their ranges', p => { p.builds['build.b'].m = { shoulder: 40, chest: 32, waist: 28, hip: 32, stance: 16, leg: 60, height: 110, head: 42 }; }],
  ['measurements at the top of their ranges', p => { p.builds['build.b'].m = { shoulder: 70, chest: 64, waist: 64, hip: 64, stance: 34, leg: 100, height: 160, head: 60 }; }],
  ['8 bands', p => { tab(p)[0].fill = range(8).map(i => [(i + 1) / 8, '@base.k']); }],
  ['translucent a at 0.01 and 1', p => { tab(p)[0].fill = { rgb: '#000000', a: 0.01 }; tab(p)[1].fill = { rgb: '#000000', a: 1 }; }],
  ['16 parts in an item', p => { p.items['back.x'] = backItem(16, 1); }],
  ['128 shapes in a part', p => { p.items['back.x'] = backItem(1, 128); }],
  ['400 shapes in an item', p => { p.items['back.x'] = backItem(4, 100); }],
  ['256 items', p => { const n = 256 - Object.keys(p.items).length; for (const i of range(n)) p.items['back.f' + i] = backItem(1, 1); }],
  ['offsets at 512 and -512, lengths at 0 and 512, radius 256, half-width 64', p => { tab(p)[2].p = [512, -512]; tab(p)[2].w = 0; tab(p)[2].h = 512; tab(p)[0].r = 256; sword(p).parts[0].shapes[2].hw0 = 64; }],
  ['coefficients at 8 and -8', p => { tab(p)[0].w = { c: 98, bloat: 8, dChest: -8 }; }],
  ['frame values at 400 and -400', p => { sword(p).parts[0].shapes[2].p0.s = 400; sword(p).parts[0].shapes[2].p1.s = -400; }],
  ['a convex polygon of 16 points', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: ngon(16, 200), fill: '@base.k' }; }],
  ['a pix of 64 by 64 with 16 keys', p => { const s = pix(64, 64); for (const c of 'bcdefghijklmnop') s.key[c] = '@base.w'; p.items['back.pennant'].parts[0].shapes[0] = s; }],
  ['16 384 pixels in a pack', p => { delete p.items['back.pennant']; p.items['back.x'] = { slot: 'back', name: 'Big', parts: [{ at: 'neck', shapes: [pix(64, 64), pix(64, 64), pix(64, 64), pix(64, 64)] }] }; }],
  ['a rest box of 240 and 64 rest shapes', p => { helm(p).rest.box = [240, 240]; helm(p).rest.shapes = range(64).map(() => rect()); }],
  ['a decoration box of 240 by 240, 64 shapes, 8 groups', p => { lantern(p).box = [240, 240]; lantern(p).shapes = range(64).map(() => rect()); for (const i of range(7)) lantern(p).groups['g' + i] = { pivot: [0, 0] }; }],
  ['64 decorations', p => { for (const i of range(63)) p.decorations['d' + i] = lantern(p); }],
  ['a period of 0.2 and of 600', p => { lantern(p).anim.period = 0.2; p.decorations.slow = clone(lantern(p)); p.decorations.slow.anim.period = 600; }],
  ['16 tracks of 32 keys', p => {
    const L = lantern(p); for (const i of range(3)) L.groups['g' + i] = { pivot: [0, 0] };
    L.anim.tracks = ['flame', 'g0', 'g1', 'g2'].flatMap(g => ['dx', 'dy', 'scale', 'alpha'].map(ch => ({ g, ch, ease: 'linear', keys: range(32).map(i => [Math.round(i / 31 * 1000) / 1000, ch === 'scale' ? 1 : 0]) })));
  }],
  ['scale at 0.25 and 4', p => { lantern(p).anim.tracks[0] = { g: 'flame', ch: 'scale', ease: 'linear', keys: [[0, 0.25], [1, 4]] }; }],
  ['a companion item is skipped, whatever it holds', p => { p.items.pet = { slot: 'companion', anything: [{ at: 'all' }] }; }],
  ['companions and ext may hold anything', p => { p.companions = { cat: { legs: 4 } }; p.ext = { note: 'free', list: [1, 2, 3] }; }],
  ['a pix key may be translucent', p => { p.items['back.pennant'].parts[0].shapes[0].key.b = { rgb: '#000000', a: 0.5 }; }],
  ['the opening may grow with the head', p => { opening(p).p = [{ c: -37, dHead: -1 }, -21]; opening(p).w = { c: 74, dHead: 2 }; }]
];
for (const [name, edit] of EDGES) test('accepted at the edge: ' + name, () => { accepted(edit); });

test('accepted at the edge: a pack id of four segments, the first of 32 characters and the rest of 31', () => {
  const id = 'a'.repeat(32) + '.' + ['b', 'c', 'd'].map(c => c.repeat(31)).join('.');
  const r = load(extra(id, { name: 'Long id', swatches: { plume: { red: BASE().swatches.plume.red } } }));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, id);
});

// ---- Hostile input ------------------------------------------------------------------------------------

test('not JSON, and JSON of the wrong shape, are refused without throwing', () => {
  const cases = [['hello', 'json'], ['{"kwpack":1,', 'json'], ['', 'json'], ['[]', 'envelope'], ['null', 'envelope'], ['42', 'envelope'], ['"pack"', 'envelope'],
    ['{"kwpack":1}', 'envelope'], ['{"kwpack":2,"pack":{}}', 'envelope'], ['{"kwpack":1,"pack":[]}', 'envelope'], ['{"kwpack":1,"pack":{},"sig":"x"}', 'envelope'],
    ['{"kwpack":1,"pack":{},"extra":1}', 'envelope'], ['﻿{"kwpack":1,"pack":{}}', 'json']];
  for (const [text, step] of cases) {
    const r = PK.read(text, OPTS);
    assert.equal(r.ok, false, text);
    assert.equal(r.step, step, text + ': ' + r.reason);
  }
});

test('input that is not text is refused at the size step', () => {
  for (const v of [undefined, null, 42, {}, [], Buffer.from('{}'), new Uint8Array(4)]) {
    const r = PK.read(v, OPTS);
    assert.deepEqual([r.ok, r.step], [false, 'size']);
  }
});

test('a file of 512 KiB passes the size step and one byte more does not; 600 KiB is refused', () => {
  const text = envText(BASE());
  const pad = n => text + ' '.repeat(n - Buffer.byteLength(text));
  assert.equal(PK.read(pad(512 * 1024), OPTS).ok, true);
  const r = PK.read(pad(512 * 1024 + 1), OPTS);
  assert.deepEqual([r.ok, r.step], [false, 'size']);
  assert.equal(PK.read(pad(600 * 1024), OPTS).step, 'size');
  // counted in UTF-8 bytes, not characters: 2-byte characters past the limit
  const wide = text + ' '.repeat(512 * 1024 - Buffer.byteLength(text) - 1) + 'é';
  assert.equal(Buffer.byteLength(wide), 512 * 1024 + 1);
  assert.equal(PK.read(wide, OPTS).step, 'size');
});

test('nesting past the depth limit is refused before the text is parsed', () => {
  const deep = n => '['.repeat(n) + ']'.repeat(n);
  assert.equal(PK.read(deep(12), OPTS).step, 'envelope');
  assert.equal(PK.read(deep(13), OPTS).step, 'json');
  assert.match(PK.read(deep(13), OPTS).reason, /deeper than 12/);
  assert.equal(PK.read(deep(200000), OPTS).step, 'json');
  assert.equal(PK.read('{"a":'.repeat(80000) + '1' + '}'.repeat(80000), OPTS).step, 'json');
  // through ext, which is otherwise never read: depth 12 passes, 13 does not
  assert.equal(load(edited(p => { p.ext = nested(10); })).ok, true);
  const r = load(edited(p => { p.ext = nested(11); }));
  assert.deepEqual([r.ok, r.step], [false, 'json']);
});

test('numbers JSON cannot spell, or that the canonical form cannot hold, are refused', () => {
  const text = envText(BASE());
  for (const bad of ['NaN', 'Infinity', '-Infinity', 'undefined']) assert.equal(PK.read(text.replace('"r":14', '"r":' + bad), OPTS).step, 'json', bad);
  for (const bad of ['1e999', '-1e999', '1000000', '0.0001', '1.2345']) {
    const r = PK.read(text.replace('"r":14', '"r":' + bad), OPTS);
    assert.equal(r.step, 'json', bad);
    assert.match(r.reason, /pack\.items\["torso\.tabard"\]\.parts\[0\]\.shapes\[0\]\.r/);
  }
  rejected(p => { tab(p)[0].r = 14.1; }, 'fields', /multiple of 1\/8/);
});

test('keys that could reach a prototype are refused anywhere, and nothing is polluted', () => {
  const text = envText(BASE());
  const cases = [text.replace('"pack":{', '"pack":{"__proto__":{"polluted":1},'), text.replace('"k":"rrect"', '"__proto__":{"polluted":1},"k":"rrect"'),
    text.replace('"items":{', '"items":{"constructor":{"slot":"back"},'), text.replace('"ext"', '"x"').replace('"pack":{', '"pack":{"prototype":1,')];
  for (const t of cases) {
    const r = PK.read(t, OPTS);
    assert.deepEqual([r.ok, r.step], [false, 'json'], r.reason);
    assert.match(r.reason, /not allowed anywhere/);
  }
  rejected(p => { p.ext = JSON.parse('{"__proto__":{"polluted":1}}'); }, 'json');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('a key named twice in one object is refused', () => {
  const r = PK.read(envText(BASE()).replace('"name":"Test knight"', '"name":"Test knight","name":"Other"'), OPTS);
  assert.deepEqual([r.ok, r.step], [false, 'json']);
  assert.match(r.reason, /"name" appears twice/);
});

test('an unpaired surrogate in a string or key is refused', () => {
  const text = envText(BASE());
  assert.equal(PK.read(text.replace('"Test knight"', '"Test \\ud800knight"'), OPTS).step, 'json');
  assert.equal(PK.read(text.replace('"kwpack":1', '"kwpack":1,"\\udc00":1'), OPTS).step, 'json');
  // a paired surrogate is fine where text is free
  assert.equal(load(edited(p => { p.name = 'Knight \u{1F6E1}'; })).ok, true);
});

test('unknown keys are refused at every level', () => {
  const env = () => ({ kwpack: 1, pack: BASE(), sig: sigOf(BASE()) });
  const e = env(); e.sig.note = 'x';
  assert.equal(readEnv(e).step, 'signature');
  const levels = [
    p => { p.items['legs.plate'].z = 1; },
    p => { p.items['legs.plate'].parts[0].z = 1; },
    p => { tab(p)[0].z = 1; },
    p => { p.items['arms.plate'].parts[0].shapes[0].p1.z = 1; },
    p => { sword(p).parts[0].shapes[2].p0.z = 1; },
    p => { tab(p)[0].fill = { rgb: '#000000', a: 1, z: 1 }; },
    p => { p.builds['build.a'].z = 1; },
    p => { p.builds['build.a'].m.z = 1; },
    p => { p.defaults.z = 1; },
    p => { p.defaults.items.z = 'legs.plate'; },
    p => { p.defaults.swatches.z = 'blue'; },
    p => { p.swatches.tabard.blue.z = 1; },
    p => { lantern(p).z = 1; },
    p => { lantern(p).anim.z = 1; },
    p => { lantern(p).anim.tracks[0].z = 1; },
    p => { lantern(p).groups.flame.z = 1; },
    p => { helm(p).rest.z = 1; },
    p => { helm(p).mounts.z = 1; },
    p => { helm(p).rest.mounts.z = 1; },
    p => { sword(p).grip.z = 1; },
    p => { sword(p).blade.z = 1; },
    p => { p.items['hair.long'].views.z = 1; }];
  for (const edit of levels) assert.match(rejected(edit, 'fields').reason, /\.z: is not a field here/);
});

test('the reader never throws, on truncated and mangled copies of a pack', () => {
  const text = envText(BASE());
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < text.length; i += 211) {
    const r = PK.read(text.slice(0, i), OPTS);
    assert.equal(r.ok, false);
    assert.ok(PK.STEPS.includes(r.step));
  }
  for (let i = 0; i < 400; i++) {
    const at = rnd(text.length), ch = '{}[]",:0123456789.-ae\\'[rnd(22)];
    const r = PK.read(text.slice(0, at) + ch + text.slice(at + 1), Object.assign({ allowUnsigned: true }, OPTS));
    assert.equal(typeof r.ok, 'boolean');
    if (!r.ok) assert.ok(PK.STEPS.includes(r.step), r.step);
  }
});

test('the source makes no code from data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'web/js/pack.js'), 'utf8');
  assert.doesNotMatch(src, /\beval\b/);
  assert.ok(!src.includes('Function('));
});

// ---- The canonical form ------------------------------------------------------------------------------

test('canonical form: keys sorted by UTF-16 code units, integer-like keys included', () => {
  assert.equal(PK.canonical({ b: 1, a: 2, 10: 3, 2: 4, A: 5, '': 6 }), '{"":6,"10":3,"2":4,"A":5,"a":2,"b":1}');
  // U+1F600 is D83D DE00 in UTF-16, so it sorts before U+FB01 although its code point is higher
  assert.equal(PK.canonical({ 'ﬁ': 1, '\u{1F600}': 2, 'é': 3, z: 4 }), '{"z":4,"é":3,"\u{1F600}":2,"ﬁ":1}');
  assert.equal(PK.canonical({ b: { d: [3, { y: 1, x: 2 }], c: null }, a: true }), '{"a":true,"b":{"c":null,"d":[3,{"x":2,"y":1}]}}');
});

test('canonical form: numbers and strings as JSON.stringify writes them', () => {
  assert.equal(PK.canonical([1.0, 0.125, -0, 1e-3, 1.50, 2.5e2, -512, 999999.999, 0.1]), '[1,0.125,0,0.001,1.5,250,-512,999999.999,0.1]');
  assert.equal(PK.canonical(['a"b\\c\n\u0001é ', '']), '["a\\"b\\\\c\\n\\u0001é ",""]');
  assert.throws(() => PK.canonical([NaN]), TypeError);
  assert.throws(() => PK.canonical({ a: undefined }), TypeError);
});

test('canonical form: a pretty-printed and a minified copy, keys in any order, give the same bytes', () => {
  const minified = JSON.stringify(BASE());
  const reverse = v => (Array.isArray(v) ? v.map(reverse) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reverse(v[k])])) : v);
  const pretty = JSON.stringify(reverse(BASE()), null, 4);
  const a = PK.message(JSON.parse(minified)), b = PK.message(JSON.parse(pretty)), c = PK.message(JSON.parse(FIXTURE).pack);
  assert.ok(Buffer.from(a).equals(Buffer.from(b)) && Buffer.from(a).equals(Buffer.from(c)));
  assert.equal(PK.canonical(JSON.parse(pretty)), jcs(BASE()));
});

test('the signed bytes are the context line, then the canonical pack in UTF-8', () => {
  const p = BASE();
  p.name = 'Ritter für Tests';
  const m = PK.message(p);
  assert.ok(m instanceof Uint8Array);
  assert.ok(Buffer.from(m).equals(Buffer.from('knightwatcher pack v1\n' + jcs(p), 'utf8')));
  assert.equal(PK.PREFIX, 'knightwatcher pack v1\n');
});

// ---- Signing -------------------------------------------------------------------------------------------

test('a pack signed with a generated key verifies, and a pretty-printed copy with the same sig too', () => {
  const p = BASE(), sig = sigOf(p);
  assert.equal(PK.read(JSON.stringify({ kwpack: 1, pack: p, sig }), OPTS).ok, true);
  const pretty = JSON.stringify({ sig, pack: p, kwpack: 1 }, null, 2);
  const r = PK.read(pretty, OPTS);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.signed, true);
});

test('one changed character anywhere in the pack breaks the signature', () => {
  const p = BASE(), sig = sigOf(p), text = JSON.stringify({ kwpack: 1, pack: p, sig });
  const changes = [['"Test knight"', '"Test knighT"'], ['"r":14', '"r":15'], ['"#fff3a0"', '"#fff3a1"'], ['[0.12,', '[0.13,'],
    ['"build.b"', '"build.c"'], ['"step":-6', '"step":-5'], ['"loop":true', '"loop":false']];
  for (const [from, to] of changes) {
    assert.ok(text.includes(from), from);
    const r = PK.read(text.replace(from, to), OPTS);
    assert.deepEqual([r.ok, r.step], [false, 'signature'], from);
    assert.match(r.reason, /does not verify/);
  }
});

test('a signature made without the leading context line fails', () => {
  const p = BASE();
  const r = readEnv({ kwpack: 1, pack: p, sig: sigOf(p, { value: sign(p, '') }) });
  assert.deepEqual([r.ok, r.step], [false, 'signature']);
  const r2 = readEnv({ kwpack: 1, pack: p, sig: sigOf(p, { value: sign(p, 'knightwatcher pack v2\n') }) });
  assert.equal(r2.step, 'signature');
});

test('a signature by another key, or naming an unknown kid, fails', () => {
  const p = BASE();
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: sigOf(p, { value: sign(p, PK.PREFIX, OTHER.privateKey) }) }).step, 'signature');
  const r = readEnv({ kwpack: 1, pack: p, sig: sigOf(p, { kid: 'kw2' }) });
  assert.deepEqual([r.ok, r.step], [false, 'signature']);
  assert.match(r.reason, /does not know, "kw2"/);
  // the shipped key table is empty, so no signed pack passes without keys being given
  assert.deepEqual(Object.keys(PK.KEYS), []);
  assert.equal(PK.read(envText(p), { verify }).step, 'signature');
  // a key of the wrong length is no key
  assert.equal(PK.read(envText(p), { verify, keys: { kw1: PUB.slice(1) } }).step, 'signature');
});

test('the sig must be well formed', () => {
  const p = BASE(), good = sigOf(p);
  const cases = [Object.assign({}, good, { alg: 'rsa' }), Object.assign({}, good, { kid: 'Bad Kid' }), Object.assign({}, good, { value: good.value.slice(0, -4) }),
    Object.assign({}, good, { value: good.value.replace(/==$/, '=A') }), Object.assign({}, good, { value: good.value.slice(0, -3) + 'B==' }),
    { alg: 'ed25519', kid: 'kw1' }];
  for (const sig of cases) assert.equal(readEnv({ kwpack: 1, pack: p, sig }).step, 'signature', JSON.stringify(sig));
});

test('an unsigned pack passes only with allowUnsigned, and a bad signature fails either way', () => {
  const p = BASE(), unsigned = JSON.stringify({ kwpack: 1, pack: p });
  const r = PK.read(unsigned, OPTS);
  assert.deepEqual([r.ok, r.step], [false, 'signature']);
  assert.match(r.reason, /only signed packs/);
  assert.equal(PK.read(unsigned, Object.assign({ allowUnsigned: 'yes' }, OPTS)).ok, false);
  const ok = PK.read(unsigned, { allowUnsigned: true });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.signed, false);
  const bad = readEnv({ kwpack: 1, pack: p, sig: sigOf(p, { value: sign(p, '') }) }, { allowUnsigned: true });
  assert.deepEqual([bad.ok, bad.step], [false, 'signature']);
});

test('a missing, failing or throwing verifier refuses the pack instead of throwing', () => {
  const text = envText(BASE());
  assert.match(PK.read(text, { keys: OPTS.keys }).reason, /no verifier/);
  assert.equal(PK.read(text, { keys: OPTS.keys, verify: () => 1 }).step, 'signature');
  assert.equal(PK.read(text, { keys: OPTS.keys, verify: () => { throw new Error('boom'); } }).step, 'signature');
  // the verifier sees the exact bytes of PK.message
  let seen = null;
  PK.read(text, { keys: OPTS.keys, verify: (k, m, s) => { seen = [k, m, s]; return true; } });
  assert.ok(Buffer.from(seen[1]).equals(Buffer.from(PK.message(BASE()))));
  assert.equal(seen[2].length, 64);
  assert.equal(seen[0], PUB);
});

test('the checks run in order and stop at the first failure', () => {
  // a bad signature is reported before a field error, and a field error before a reference error
  const p = edited(q => { q.name = ''; tab(q)[0].fill = '@cloak.1'; });
  assert.equal(PK.read(JSON.stringify({ kwpack: 1, pack: p, sig: sigOf(BASE()) }), OPTS).step, 'signature');
  assert.equal(load(p).step, 'fields');
  assert.deepEqual(PK.STEPS, ['size', 'json', 'envelope', 'signature', 'format', 'fields', 'references', 'rules', 'counts', 'compile']);
  // the pack's id is reported with its rejection when it could be read
  assert.equal(load(p).id, 'kw.base');
});

// ---- Many packs ------------------------------------------------------------------------------------

test('gather keeps the higher version of one id and at most 32 packs', () => {
  const base = load(BASE());
  const older = load(edited(p => { p.version = '0.9.12'; })), newer = load(edited(p => { p.version = '1.0.10'; }));
  const g = PK.gather([older, base, newer, { ok: false, step: 'json', reason: 'x' }]);
  assert.equal(g.packs.get('kw.base').version, '1.0.10');
  assert.equal(g.superseded.length, 2);
  assert.equal(g.rejected.length, 1);
  const many = range(32).map(i => load(extra('extra-' + i, { swatches: { tabard: { t: BASE().swatches.tabard.blue } } })));
  assert.ok(many.every(r => r.ok));
  assert.equal(PK.gather(many).packs.size, 32);
  const over = PK.gather(many.concat([base]));
  assert.equal(over.packs.size, 32);
  assert.deepEqual([over.rejected[0].id, over.rejected[0].step], ['kw.base', 'counts']);
});

// ---- Looks and fallbacks --------------------------------------------------------------------------------

const EXTRA = () => extra('kw.extra', {
  swatches: { tabard: { red: { name: 'Red', entries: { 0: '#ff8676', 1: '#ff4a3d', 2: '#cc352c', 3: '#8f231d' } } } },
  palettes: { trim: { edge: '#123456' } },
  items: { 'helm.round': { slot: 'helmet', name: 'Round helm', parts: [{ at: 'head', shapes: [
    { k: 'rrect', p: [-60, -70], w: 120, h: 120, r: 50, fill: '@trim.edge' },
    { k: 'rrect', p: [-36, -22], w: 72, h: 46, r: 8, fill: '@skin.face' }] }] } } });
const library = () => PK.gather([load(BASE()), load(EXTRA())]);

test('a look from two packs resolves with no fallbacks for what it names', () => {
  const look = { build: 'kw.base/build.b', items: { helmet: 'kw.extra/helm.round', hair: 'kw.base/hair.long', back: 'kw.base/back.pennant' }, swatches: { tabard: 'kw.extra/red' } };
  const L = PK.resolve(library(), look);
  assert.equal(L.ok, true);
  assert.equal(L.look.items.helmet, 'kw.extra/helm.round');
  assert.equal(L.look.swatches.tabard, 'kw.extra/red');
  assert.equal(L.look.build, 'kw.base/build.b');
  assert.deepEqual(L.fallbacks.filter(f => (f.kind === 'item' && ['helmet', 'hair', 'back'].includes(f.key)) || (f.kind === 'swatch' && f.key === 'tabard') || f.kind === 'build'), []);
  // the round helm has no plume mount, so no plume is drawn; the long hair shows below it
  assert.equal(L.plumeShown, false);
  assert.equal(L.lists.headOn.length, 1 + 2);
  assert.equal(L.lists.headOn[1].f, '#123456', 'the extra pack reads its own palette');
  assert.equal(L.lists.body.length, 1 + 30, 'the pennant, drawn first');
  assert.equal(L.lists.body[0].k, 6);
  // the tabard takes the red swatch
  assert.deepEqual(L.lists.body[1 + 14 + 1].f, [[0.1, '#ff8676'], [0.55, '#ff4a3d'], [0.85, '#cc352c'], [1, '#8f231d']]);
});

test('an empty look is the base pack\'s defaults, each reported as not set', () => {
  const L = baseLook();
  assert.equal(L.ok, true);
  assert.deepEqual(L.look, { build: 'kw.base/build.a', items: { legs: 'kw.base/legs.plate', boots: 'kw.base/boots.leather', torso: 'kw.base/torso.tabard',
    hair: 'kw.base/hair.short', plume: 'kw.base/plume.crest', helmet: 'kw.base/helm.open', pauldrons: 'kw.base/pauldrons.plate', arms: 'kw.base/arms.plate',
    gauntlets: 'kw.base/gauntlets.plate', main: 'kw.base/main.greatsword' }, swatches: { skin: 'kw.base/warm', hair: 'kw.base/brown', tabard: 'kw.base/blue', plume: 'kw.base/red' } });
  assert.ok(L.fallbacks.every(f => f.reason === 'not set' && f.wanted === null));
  assert.equal(L.fallbacks.length, 1 + 10 + 4);
  assert.deepEqual(L.colours.brow, '#8a5a2b');
  assert.deepEqual(L.grip, { kind: 'two', hands: [6, -30] });
  assert.deepEqual(L.blade, { from: 34, to: 263, half: 15 });
});

test('a missing item, swatch or build falls back to the default and is reported', () => {
  const look = { build: 'kw.base/build.z', items: { helmet: 'kw.gone/helm.x', legs: 'kw.extra/legs.none', boots: 'kw.extra/helm.round', torso: 'tabard' },
    swatches: { tabard: 'kw.extra/purple', plume: 'kw.gone/red' } };
  const L = PK.resolve(library(), look), by = (k, kind = 'item') => L.fallbacks.find(f => f.key === k && f.kind === kind);
  assert.deepEqual(by('build', 'build'), { kind: 'build', key: 'build', wanted: 'kw.base/build.z', used: 'kw.base/build.a', reason: 'no such build' });
  assert.deepEqual(by('helmet'), { kind: 'item', key: 'helmet', wanted: 'kw.gone/helm.x', used: 'kw.base/helm.open', reason: 'pack not loaded' });
  assert.equal(by('legs').reason, 'no such item');
  assert.equal(by('boots').reason, 'the item is for the helmet slot');
  assert.equal(by('torso').reason, 'not a "<pack>/<id>" name');
  assert.deepEqual(by('tabard', 'swatch'), { kind: 'swatch', key: 'tabard', wanted: 'kw.extra/purple', used: 'kw.base/blue', reason: 'no such swatch' });
  assert.equal(by('plume', 'swatch').reason, 'pack not loaded');
  assert.equal(L.look.items.helmet, 'kw.base/helm.open');
});

test('a look naming the head or an unknown slot is told so, and the head comes from the build', () => {
  const L = PK.resolve(library(), { items: { head: 'kw.base/head.plain', tail: 'kw.base/x', companion: 'kw.base/y' }, swatches: { cape: 'kw.base/blue' } });
  assert.deepEqual(L.ignored, [{ key: 'head', reason: 'the head comes from the build' }, { key: 'tail', reason: 'not a slot' },
    { key: 'companion', reason: 'reserved' }, { key: 'cape', reason: 'not a swatch set' }]);
  assert.equal(L.lists.headOff.length, 6 + 8);
});

test('with no base pack the result says so, for the caller to draw its stand-in', () => {
  assert.deepEqual(PK.resolve(PK.gather([load(EXTRA())]), {}), { ok: false, reason: 'no base pack', fallbacks: [], ignored: [] });
  assert.equal(PK.resolve(null, null).reason, 'no base pack');
});

test('hostile looks resolve to the defaults without throwing', () => {
  for (const look of [null, 7, 'x', [], { items: 5 }, { items: { legs: 9 } }, { build: {} }, { swatches: { skin: ['a'] } }, JSON.parse('{"items":{"__proto__":"kw.base/legs.plate"}}')]) {
    const L = PK.resolve(library(), look);
    assert.equal(L.ok, true);
    assert.equal(L.look.items.legs, 'kw.base/legs.plate');
  }
});

test('a look at exactly 1200 shapes is kept, and one over falls back slot by slot until it fits', () => {
  const n0 = baseLook().shapes;
  assert.equal(n0, 30 + 31 + 6 + 4 + 6 + 22);
  // back 400, legs 400 and boots of whatever brings the total to exactly 1200
  const bootsN = 1200 - n0 - 400 - (400 - 8) + 6;
  const big = (slot, at, n) => ({ slot, name: 'Big', parts: range(Math.ceil(n / 100)).map(i => ({ at, shapes: range(Math.min(100, n - i * 100)).map(() => rect()) })) });
  const pack = boots => extra('kw.big', { items: { 'back.big': big('back', 'neck', 400), 'legs.big': big('legs', 'hipL', 400), 'boots.big': big('boots', 'footL', boots), 'torso.big': big('torso', 'neck', 400) } });
  const lib = boots => PK.gather([load(BASE()), load(pack(boots))]);
  const look = { items: { back: 'kw.big/back.big', legs: 'kw.big/legs.big', boots: 'kw.big/boots.big' } };
  const at = PK.resolve(lib(bootsN), look);
  assert.equal(at.shapes, 1200);
  assert.equal(at.fallbacks.filter(f => /cap/.test(f.reason)).length, 0);
  assert.equal(at.look.items.back, 'kw.big/back.big');
  const over = PK.resolve(lib(bootsN + 1), look);
  assert.deepEqual(over.fallbacks.filter(f => /cap/.test(f.reason)), [{ kind: 'item', key: 'back', wanted: 'kw.big/back.big', used: null, reason: 'over the 1200-shape cap' }]);
  assert.equal(over.shapes, 1201 - 400);
  assert.equal(over.look.items.legs, 'kw.big/legs.big');
  assert.equal(over.lists.body.length, 400 + bootsN + 1 + 16);
  // further over: the back and then the legs go, in drawing order, and the torso stays
  const far = PK.resolve(lib(400), { items: { back: 'kw.big/back.big', legs: 'kw.big/legs.big', boots: 'kw.big/boots.big', torso: 'kw.big/torso.big' } });
  assert.deepEqual(far.fallbacks.filter(f => /cap/.test(f.reason)).map(f => f.key), ['back', 'legs']);
  assert.ok(far.shapes <= 1200);
  assert.equal(far.look.items.torso, 'kw.big/torso.big');
});

test('the one-handed sword and the shield: hold point folded in, shield drawn only with that grip', () => {
  const L = PK.resolve(library(), { items: { main: 'kw.base/main.arming', off: 'kw.base/off.round' } });
  assert.equal(L.grip.kind, 'one');
  assert.equal(L.shapes, 30 + 31 + 6 + 4 + 6 + 6 + 3);
  const R = recorder(), A = PK.newAnchors(), V = PK.newValues();
  A[2 * PK.ANCHOR.off] = 400; A[2 * PK.ANCHOR.off + 1] = 300;
  PK.draw(L.lists.off, A, V, R.P);
  // hold (0, -8): the shield's centre sits 8 below the hand; the clip moves with it
  assert.deepEqual(R.log[0], ['ell', 400, 308, 36, 44, K]);
  assert.deepEqual(R.log[2], ['ell', 400, 308, 10, 10, GOLD, 298]);
  const two = PK.resolve(library(), { items: { off: 'kw.base/off.round' } });
  assert.equal(two.shapes, baseLook().shapes, 'with the greatsword the shield is never drawn');
  assert.deepEqual(PK.sequence('one', true).slice(6, 12), ['armL', 'gauntL', 'off', 'armR', 'main', 'gauntR']);
  assert.deepEqual(PK.sequence('oneCrossed', false).slice(2, 3), ['headOff']);
  assert.equal(PK.sequence('sideways'), null);
});

test('the rest views: the helmet at rest carries the plume\'s rest view on its mount', () => {
  const L = baseLook(), R = recorder(), A = PK.newAnchors();
  A[2 * PK.ANCHOR.rest] = 300; A[2 * PK.ANCHOR.rest + 1] = 400;
  PK.draw(L.lists.restHelmet, A, PK.newValues(), R.P);
  assert.equal(R.log.length, 10 + 4);
  assert.deepEqual(R.log[0], ['rrect', 268, 344, 64, 54, 24, K]);
  assert.deepEqual(R.log[10], ['ell', 306, 342, 18, 10, K], 'the plume at the mount (6, -58)');
  const S = PK.resolve(library(), { items: { off: 'kw.base/off.round' } });
  assert.equal(S.lists.restOff.length, 2);
});

test('pix shapes draw through a fixed lookup, made once', () => {
  const L = PK.resolve(library(), { items: { back: 'kw.base/back.pennant' } }), R = recorder();
  const g = rig({ x: 480, floor: 530, t: 0, sword: false }, ZERO);
  PK.draw([L.lists.body[0]], g.A, g.V, R.P);
  const [name, x, y, w, h, f] = R.log[0];
  assert.deepEqual([name, x, y, w, h], ['pix', 450, 308, 4, 4]);
  assert.deepEqual([f(0, 0), f(3, 0), f(1, 1), f(3, 3)], [K, null, '#3f74e0', null]);
});

// ---- Keyframes --------------------------------------------------------------------------------------------

function decor(anim, groups) {
  const p = BASE();
  p.palettes.glow = { a: '#000000' };
  p.decorations = { d: { name: 'Test', fits: ['floor', 'surface'], box: [40, 40], groups: groups || { g: { pivot: [0, 0] } }, shapes: [rect()], anim } };
  const r = load(p);
  assert.equal(r.ok, true, r.reason);
  return r.decorations.d;
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' is not ' + b);

test('keyframes: linear dx and dy, rounded to whole pixels, held before the first key and after the last', () => {
  const d = decor({ period: 10, loop: false, tracks: [{ g: 'g', ch: 'dx', ease: 'linear', keys: [[0.2, 0], [0.6, 10]] }, { g: 'g', ch: 'dy', ease: 'linear', keys: [[0, -4], [1, 4]] }] });
  const at = t => PK.animate(d, t).groups.g;
  assert.deepEqual([at(0).dx, at(2).dx, at(3.5).dx, at(4).dx, at(6).dx, at(9).dx, at(100).dx], [0, 0, 4, 5, 10, 10, 10]);
  assert.deepEqual([at(0).dy, at(5).dy, at(6.2).dy, at(10).dy], [-4, 0, 1, 4]);
  assert.ok(Object.is(PK.animate(decor({ period: 10, loop: false, tracks: [{ g: 'g', ch: 'dx', ease: 'linear', keys: [[0, -1], [1, 0]] }] }), 5).groups.g.dx, 0), 'no negative zero');
  assert.deepEqual(PK.animate(d, -5).groups.g, PK.animate(d, 0).groups.g, 'a time before the start is the start');
});

test('keyframes: step holds each key until the next; smooth eases in and out', () => {
  const d = decor({ period: 1, loop: false, tracks: [{ g: 'g', ch: 'alpha', ease: 'step', keys: [[0, 0.2], [0.5, 0.8]] }, { g: 'g', ch: 'scale', ease: 'smooth', keys: [[0, 1], [1, 3]] }] });
  const at = t => PK.animate(d, t).groups.g;
  assert.deepEqual([at(0).alpha, at(0.49).alpha, at(0.5).alpha, at(0.9).alpha], [0.2, 0.2, 0.8, 0.8]);
  near(at(0.25).scale, 1 + 2 * (0.25 * 0.25 * (3 - 0.5)));
  near(at(0.5).scale, 2);
  near(at(0.75).scale, 1 + 2 * (0.75 * 0.75 * (3 - 1.5)));
  assert.equal(at(1).scale, 3);
});

test('keyframes: show is always a step, and groups with no track keep their rest values', () => {
  const d = decor({ period: 2, loop: true, tracks: [{ g: 'g', ch: 'show', keys: [[0, 1], [0.5, 0]] }] }, { g: { pivot: [0, 0] }, h: { pivot: [1, 1] } });
  assert.deepEqual(PK.animate(d, 0.9).groups, { g: { dx: 0, dy: 0, scale: 1, alpha: 1, show: 1 }, h: { dx: 0, dy: 0, scale: 1, alpha: 1, show: 1 } });
  assert.equal(PK.animate(d, 1).groups.g.show, 0);
  assert.equal(PK.animate(d, 1.99).groups.g.show, 0);
  assert.equal(PK.animate(d, 2).groups.g.show, 1, 'looping back to the start');
});

test('keyframes: palette colours interpolate in RGB, each channel rounded', () => {
  const d = decor({ period: 4, loop: true, tracks: [{ pal: 'glow.a', ease: 'linear', keys: [[0, '#000000'], [0.5, '#ff8001'], [1, '#000000']] }] });
  const at = t => PK.animate(d, t).pal['glow.a'];
  assert.deepEqual([at(0), at(1), at(2), at(3), at(4), at(5)], ['#000000', '#804001', '#ff8001', '#804001', '#000000', '#804001']);
  const s = decor({ period: 4, loop: false, tracks: [{ pal: 'glow.a', ease: 'smooth', keys: [[0, '#000000'], [1, '#0000ff']] }] });
  assert.equal(PK.animate(s, 1).pal['glow.a'], '#000028');
});

test('keyframes: looping wraps by the period and phase shifts the start; once holds the end', () => {
  const tracks = [{ g: 'g', ch: 'dx', ease: 'linear', keys: [[0, 0], [1, 100]] }];
  const loop = decor({ period: 10, loop: true, phase: 0.25, tracks }), once = decor({ period: 10, loop: false, phase: 0.25, tracks });
  const dx = (d, t) => PK.animate(d, t).groups.g.dx;
  assert.deepEqual([dx(loop, 0), dx(loop, 5), dx(loop, 7.5), dx(loop, 8), dx(loop, 1007.5)], [25, 75, 0, 5, 0]);
  assert.deepEqual([dx(once, 0), dx(once, 5), dx(once, 7.5), dx(once, 8), dx(once, 1e6)], [25, 75, 100, 100, 100]);
  assert.deepEqual(PK.animate(loop, NaN).groups.g, PK.animate(loop, 0).groups.g);
});

test('keyframes: a single key is held for ever; a still decoration has no clock', () => {
  const d = decor({ period: 3, loop: true, tracks: [{ g: 'g', ch: 'dy', ease: 'smooth', keys: [[0.5, 7]] }] });
  assert.deepEqual([0, 1, 1.5, 2.9].map(t => PK.animate(d, t).groups.g.dy), [7, 7, 7, 7]);
  const p = BASE();
  delete p.decorations.lantern.anim;
  const still = load(p).decorations.lantern;
  assert.equal(still.anim, null);
  assert.deepEqual(PK.animate(still, 5), { groups: { flame: { dx: 0, dy: 0, scale: 1, alpha: 1, show: 1 } }, pal: {} });
});

test('the fixture\'s lantern: the flame bobs, goes out at 0.92 and the glass warms', () => {
  const d = load(BASE()).decorations.lantern;
  assert.deepEqual(PK.animate(d, 1.6), { groups: { flame: { dx: 0, dy: -2, scale: 1, alpha: 1, show: 1 } }, pal: { 'lantern.glass': '#ffe28a' } });
  assert.equal(PK.animate(d, 3.2 * 0.95).groups.flame.show, 0);
  assert.equal(PK.fitsPlace(d, { kind: 'hang', w: 40, h: 70 }), true);
  assert.equal(PK.fitsPlace(d, { kind: 'hang', w: 39, h: 70 }), false);
  assert.equal(PK.fitsPlace(d, { kind: 'floor', w: 400, h: 400 }), false);
});
