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
  assert.ok(re, 'every refusal test names the reason it expects');
  if (typeof re === 'string') assert.equal(r.reason, re); else assert.match(r.reason, re);
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
    // past level the upper hand slides down the grip, 2 at an angle of 1.8 and beyond
    const a = o.wang || 0, gx = ox + o.gx * U, gy = oy + o.gy * U + u, sx = Math.sin(a), sy = -Math.cos(a);
    const s0 = 2 - 2 * Math.max(0, Math.min(1, (Math.abs(a) - 1.4) / 0.4));
    const up = [gx + sx * s0, gy + sy * s0], low = [gx - sx * 30, gy - sy * 30], right = sx >= 0;
    set('main', gx, gy); A[PK.FRAME_SX] = sx; A[PK.FRAME_SY] = sy;
    set(right ? 'handR' : 'handL', up[0], up[1]); set(right ? 'handL' : 'handR', low[0], low[1]);
    mode = right ? 'twoR' : 'twoL';
  } else if (o.crates) {
    // the carrying grip: both hands at the lower corners of the crate held against the chest
    mode = 'none';
    const nx = A[2 * PK.ANCHOR.neck], ny = A[2 * PK.ANCHOR.neck + 1], w = Math.round(Math.sin(o.t / 900) * 2);
    set('handL', nx - 44 + w, ny + 62); set('handR', nx + 44 + w, ny + 62);
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
  'sword put away, crouched, carrying the crates': (k) => k.pose('disk_full', 500),
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
    // the look's cost bounds what the lists drew
    const drawn = pieces.filter(p => p !== GAP).reduce((n, p) => n + p.length, 0);
    assert.ok(drawn <= L.cost, drawn + ' fills drawn, more than the cost ' + L.cost);
  });
}

// ---- Rules: one refused pack for each rule of sections 3 and 6 ------------------------------------------

const RULES = [
  // 3.11 the format
  ['format: the major version must be 1', 'format', p => { p.format = [2, 0]; }, "pack.format: is major version 2, and this engine reads major version 1"],
  ['format: a minor version newer than the engine\'s is refused', 'format', p => { p.format = [1, 1]; }, "pack.format: is 1.1, newer than this engine's 1.0"],
  ['format: must be two whole numbers', 'format', p => { p.format = [1]; }, "pack.format: must be [major, minor], two whole numbers"],
  ['format: must not be a string', 'format', p => { p.format = '1.0'; }, "pack.format: must be [major, minor], two whole numbers"],
  ['format: is required', 'format', p => { delete p.format; }, "pack.format: must be [major, minor], two whole numbers"],
  // 3.2 the pack
  ['pack: no unknown field', 'fields', p => { p.colour = 'blue'; }, "pack.colour: is not a field here"],
  ['pack: id is required', 'fields', p => { delete p.id; }, "pack.id: is missing"],
  ['pack: id is lower case', 'fields', p => { p.id = 'Kw.base'; }, "pack.id: must be an id matching ^[a-z][a-z0-9-]{1,31}(\\.[a-z0-9-]{1,31}){0,3}$"],
  ['pack: id of one character', 'fields', p => { p.id = 'k'; }, "pack.id: must be an id matching ^[a-z][a-z0-9-]{1,31}(\\.[a-z0-9-]{1,31}){0,3}$"],
  ['pack: id with a later segment of 32 characters', 'fields', p => { p.id = 'kw.' + 'x'.repeat(32); }, "pack.id: must be an id matching ^[a-z][a-z0-9-]{1,31}(\\.[a-z0-9-]{1,31}){0,3}$"],
  ['pack: id with a first segment of 33 characters', 'fields', p => { p.id = 'k'.repeat(33); }, "pack.id: must be an id matching ^[a-z][a-z0-9-]{1,31}(\\.[a-z0-9-]{1,31}){0,3}$"],
  ['pack: id of five segments', 'fields', p => { p.id = 'kw.a.b.c.d'; }, "pack.id: must be an id matching ^[a-z][a-z0-9-]{1,31}(\\.[a-z0-9-]{1,31}){0,3}$"],
  ['pack: name is required', 'fields', p => { delete p.name; }, "pack.name: is missing"],
  ['pack: name of 49 characters', 'fields', p => { p.name = 'n'.repeat(49); }, "pack.name: must be 1 to 48 characters, not 49"],
  ['pack: name must be one line', 'fields', p => { p.name = 'Two\nlines'; }, "pack.name: must be one line, with no control characters"],
  ['pack: name must not be empty', 'fields', p => { p.name = ''; }, "pack.name: must be 1 to 48 characters, not 0"],
  ['pack: version must have three parts', 'fields', p => { p.version = '1.0'; }, "pack.version: must be major.minor.patch, each 0 to 999"],
  ['pack: version parts stop at 999', 'fields', p => { p.version = '1.0.1000'; }, "pack.version: must be major.minor.patch, each 0 to 999"],
  ['pack: version parts have no leading zero', 'fields', p => { p.version = '01.0.0'; }, "pack.version: must be major.minor.patch, each 0 to 999"],
  ['pack: licence of 201 characters', 'fields', p => { p.licence = 'l'.repeat(201); }, "pack.licence: must be 1 to 200 characters, not 201"],
  ['pack: licence must be one line', 'fields', p => { p.licence = 'One\nTwo'; }, "pack.licence: must be one line, with no control characters"],
  ['pack: provides must be an array', 'fields', p => { p.provides = 'items'; }, "pack.provides: must be an array"],
  ['pack: provides names only the sections', 'fields', p => { p.provides[4] = 'defaults'; }, "pack.provides[4]: must be one of \"builds\", \"items\", \"palettes\", \"swatches\", \"decorations\""],
  ['pack: provides names each section once', 'fields', p => { p.provides[4] = 'items'; }, "pack.provides[4]: appears twice"],
  ['pack: provides must list every section the pack holds', 'rules', p => { p.provides = p.provides.filter(s => s !== 'palettes'); }, "pack.provides: must list \"palettes\", which the pack holds"],
  ['pack: provides must not list a section the pack lacks', 'rules', p => { delete p.decorations; }, "pack.provides: lists \"decorations\", which the pack does not hold"],
  ['pack: companions must be an object', 'fields', p => { p.companions = []; }, "pack.companions: must be an object"],
  ['pack: ext must be an object', 'fields', p => { p.ext = 'x'; }, "pack.ext: must be an object"],
  ['ids: an item id must match the local pattern', 'fields', p => { p.items.Helm = p.items['helm.open']; }, "pack.items.Helm: is not a valid id"],
  ['ids: an item id of 49 characters', 'fields', p => { p.items['h' + 'x'.repeat(48)] = backItem(1, 1); }, "pack.items[\"hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...\"]: is not a valid id"],
  // 3.3 colours, palettes and swatches
  ['palettes: a pack may not define a reserved set', 'fields', p => { p.palettes.tabard = { 0: '#000000' }; }, "pack.palettes.tabard: is a reserved set name"],
  ['palettes: a set name cannot hold a dot', 'fields', p => { p.palettes['a.b'] = { x: '#000000' }; }, "pack.palettes[\"a.b\"]: is not a valid id"],
  ['palettes: 17 sets', 'fields', p => { for (const i of range(16)) p.palettes['set' + i] = { a: '#000000' }; }, "pack.palettes: must hold 0 to 16 sets, not 17"],
  ['palettes: 33 entries in a set', 'fields', p => { for (const i of range(31)) p.palettes.lantern['e' + i] = '#000000'; }, "pack.palettes.lantern: must hold 1 to 32 entries, not 33"],
  ['palettes: an empty set', 'fields', p => { p.palettes.empty = {}; }, "pack.palettes.empty: must hold 1 to 32 entries, not 0"],
  ['palettes: may refer only to @base', 'references', p => { p.palettes.lantern.rim = '@tabard.1'; }, "pack.palettes.lantern.rim: a palette of the pack may refer only to @base"],
  ['palettes: a reference to a missing base entry', 'references', p => { p.palettes.lantern.rim = '@base.zz'; }, "pack.palettes.lantern.rim: names an entry, \"zz\", that set \"base\" does not have"],
  ['colours: hex must be six lower-case digits', 'fields', p => { tab(p)[0].fill = '#1A1524'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: must be a hex colour, a reference such as \"@base.k\" or a translucent colour"],
  ['colours: hex must be six digits', 'fields', p => { tab(p)[0].fill = '#fff'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: must be a hex colour, a reference such as \"@base.k\" or a translucent colour"],
  ['colours: a reference starts with @', 'fields', p => { tab(p)[0].fill = 'base.k'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: must be a hex colour, a reference such as \"@base.k\" or a translucent colour"],
  ['colours: translucent needs a', 'fields', p => { tab(p)[0].fill = { rgb: '#000000' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill.a: is missing"],
  ['colours: translucent a of 0', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 0 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill.a: must be a number from 0.01 to 1"],
  ['colours: translucent a above 1', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 1.001 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill.a: must be a number from 0.01 to 1"],
  ['colours: translucent has only rgb and a', 'fields', p => { tab(p)[0].fill = { rgb: '#000000', a: 0.5, b: 1 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill.b: is not a field here"],
  ['colours: a reference to an unknown set', 'references', p => { tab(p)[0].fill = '@cloak.1'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: names a palette set, \"cloak\", that does not exist"],
  ['colours: a reference to a missing entry', 'references', p => { tab(p)[0].fill = '@base.s9'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: names an entry, \"s9\", that set \"base\" does not have"],
  ['colours: a band list cannot hold a band list', 'references', p => { tab(p)[0].fill = [[0.5, '@base.steel'], [1, '@base.k']]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill[0][1]: needs a single colour here, and \"@base.steel\" is a band list"],
  ['colours: a pix key must be a single colour', 'references', p => { p.items['back.pennant'].parts[0].shapes[0].key.k = '@skin.face'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].key.k: needs a single colour here, and \"@skin.face\" is a band list"],
  ['bands: at least one band', 'fields', p => { tab(p)[0].fill = []; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: must hold 1 to 8 entries, not 0"],
  ['bands: 9 bands', 'fields', p => { tab(p)[0].fill = range(9).map(i => [i === 8 ? 1 : Math.round((i + 1) / 9 * 1000) / 1000, '@base.k']); }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: must hold 1 to 8 entries, not 9"],
  ['bands: fractions must rise', 'fields', p => { tab(p)[0].fill = [[0.5, '@base.k'], [0.5, '@base.w'], [1, '@base.k']]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill[1][0]: fractions must rise from above 0 to 1"],
  ['bands: the first fraction is above 0', 'fields', p => { tab(p)[0].fill = [[0, '@base.k'], [1, '@base.w']]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill[0][0]: fractions must rise from above 0 to 1"],
  ['bands: the last fraction is 1', 'fields', p => { tab(p)[0].fill = [[0.5, '@base.k'], [0.9, '@base.w']]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill: the last fraction must be 1"],
  ['bands: a band is a pair', 'fields', p => { tab(p)[0].fill = [[1, '@base.k', 2]]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].fill[0]: must be a [fraction, colour] pair"],
  ['swatches: only the four user sets', 'fields', p => { p.swatches.cloak = p.swatches.tabard; }, "pack.swatches.cloak: is not a field here"],
  ['swatches: every entry of the set', 'fields', p => { delete p.swatches.tabard.blue.entries[3]; }, "pack.swatches.tabard.blue.entries[\"3\"]: is missing"],
  ['swatches: no entry outside the set', 'fields', p => { p.swatches.tabard.blue.entries[4] = '#000000'; }, "pack.swatches.tabard.blue.entries[\"4\"]: is not a field here"],
  ['swatches: entries are literal colours', 'fields', p => { p.swatches.tabard.blue.entries[0] = '@base.b0'; }, "pack.swatches.tabard.blue.entries[\"0\"]: must be a hex colour such as \"#3f74e0\" or a translucent colour"],
  ['swatches: the skin ramps are band lists', 'fields', p => { p.swatches.skin.warm.entries.face = '#ffe3c4'; }, "pack.swatches.skin.warm.entries.face: must be a band list"],
  ['swatches: a swatch needs a name', 'fields', p => { delete p.swatches.hair.brown.name; }, "pack.swatches.hair.brown.name: is missing"],
  ['swatches: 33 in a set', 'fields', p => { for (const i of range(31)) p.swatches.tabard['t' + i] = p.swatches.tabard.blue; }, "pack.swatches.tabard: must hold 1 to 32 swatches, not 33"],
  // 3.4 builds and defaults
  ['builds: only the base pack carries builds', 'fields', p => { p.id = 'kw.other'; }, "pack.builds: only the base pack, kw.base, may carry builds"],
  ['builds: the base pack must carry builds and defaults', 'fields', p => { delete p.builds; delete p.defaults; p.provides = p.provides.filter(s => s !== 'builds'); }, "pack: the base pack must carry builds and defaults"],
  ['builds: 5 builds', 'fields', p => { for (const i of range(3)) p.builds['build.x' + i] = p.builds['build.a']; }, "pack.builds: must hold 1 to 4 builds, not 5"],
  ['builds: name of 33 characters', 'fields', p => { p.builds['build.a'].name = 'b'.repeat(33); }, "pack.builds[\"build.a\"].name: must be 1 to 32 characters, not 33"],
  ['builds: every measurement is required', 'fields', p => { delete p.builds['build.a'].m.stance; }, "pack.builds[\"build.a\"].m.stance: is missing"],
  ['builds: no unknown measurement', 'fields', p => { p.builds['build.a'].m.neck = 10; }, "pack.builds[\"build.a\"].m.neck: is not a field here"],
  ['builds: measurements are whole numbers', 'fields', p => { p.builds['build.a'].m.shoulder = 54.5; }, "pack.builds[\"build.a\"].m.shoulder: must be a whole number from 40 to 70"],
  ['builds: shoulder below 40', 'fields', p => { p.builds['build.a'].m.shoulder = 39; }, "pack.builds[\"build.a\"].m.shoulder: must be a whole number from 40 to 70"],
  ['builds: shoulder above 70', 'fields', p => { p.builds['build.a'].m.shoulder = 71; }, "pack.builds[\"build.a\"].m.shoulder: must be a whole number from 40 to 70"],
  ['builds: chest below 32', 'fields', p => { p.builds['build.a'].m.chest = 31; }, "pack.builds[\"build.a\"].m.chest: must be a whole number from 32 to 64"],
  ['builds: chest above 64', 'fields', p => { p.builds['build.a'].m.chest = 65; }, "pack.builds[\"build.a\"].m.chest: must be a whole number from 32 to 64"],
  ['builds: waist below 28', 'fields', p => { p.builds['build.a'].m.waist = 27; }, "pack.builds[\"build.a\"].m.waist: must be a whole number from 28 to 64"],
  ['builds: waist above 64', 'fields', p => { p.builds['build.a'].m.waist = 65; }, "pack.builds[\"build.a\"].m.waist: must be a whole number from 28 to 64"],
  ['builds: hip below 32', 'fields', p => { p.builds['build.a'].m.hip = 31; }, "pack.builds[\"build.a\"].m.hip: must be a whole number from 32 to 64"],
  ['builds: hip above 64', 'fields', p => { p.builds['build.a'].m.hip = 65; }, "pack.builds[\"build.a\"].m.hip: must be a whole number from 32 to 64"],
  ['builds: stance below 16', 'fields', p => { p.builds['build.a'].m.stance = 15; }, "pack.builds[\"build.a\"].m.stance: must be a whole number from 16 to 34"],
  ['builds: stance above 34', 'fields', p => { p.builds['build.a'].m.stance = 35; }, "pack.builds[\"build.a\"].m.stance: must be a whole number from 16 to 34"],
  ['builds: leg below 60', 'fields', p => { p.builds['build.a'].m.leg = 59; }, "pack.builds[\"build.a\"].m.leg: must be a whole number from 60 to 100"],
  ['builds: leg above 100', 'fields', p => { p.builds['build.a'].m.leg = 101; }, "pack.builds[\"build.a\"].m.leg: must be a whole number from 60 to 100"],
  ['builds: height below 110', 'fields', p => { p.builds['build.a'].m.height = 109; }, "pack.builds[\"build.a\"].m.height: must be a whole number from 110 to 160"],
  ['builds: height above 160', 'fields', p => { p.builds['build.a'].m.height = 161; }, "pack.builds[\"build.a\"].m.height: must be a whole number from 110 to 160"],
  ['builds: head below 42', 'fields', p => { p.builds['build.a'].m.head = 41; }, "pack.builds[\"build.a\"].m.head: must be a whole number from 42 to 60"],
  ['builds: head above 60', 'fields', p => { p.builds['build.a'].m.head = 61; }, "pack.builds[\"build.a\"].m.head: must be a whole number from 42 to 60"],
  ['builds: torso, height less leg, below 46', 'rules', p => { p.builds['build.a'].m.height = 119; }, "pack.builds[\"build.a\"].m: height less leg must be 46 to 74, not 45"],
  ['builds: torso, height less leg, above 74', 'rules', p => { p.builds['build.a'].m.height = 149; }, "pack.builds[\"build.a\"].m: height less leg must be 46 to 74, not 75"],
  ['builds: torso of a second build, its leg long', 'rules', p => { p.builds['build.b'].m.leg = 100; p.builds['build.b'].m.height = 140; }, "pack.builds[\"build.b\"].m: height less leg must be 46 to 74, not 40"],
  ['builds: the head item must exist', 'references', p => { p.builds['build.a'].head = 'head.none'; }, "pack.builds[\"build.a\"].head: names an item, \"head.none\", that the pack does not have"],
  ['builds: the head item must have slot head', 'references', p => { p.builds['build.a'].head = 'hair.short'; }, "pack.builds[\"build.a\"].head: names \"hair.short\", whose slot is hair, not head"],
  ['defaults: every slot but back and off', 'fields', p => { delete p.defaults.items.arms; }, "pack.defaults.items.arms: is missing"],
  ['defaults: the head comes from the build', 'fields', p => { p.defaults.items.head = 'head.plain'; }, "pack.defaults.items.head: is not a field here"],
  ['defaults: a swatch for each set', 'fields', p => { delete p.defaults.swatches.plume; }, "pack.defaults.swatches.plume: is missing"],
  ['defaults: only the base pack', 'fields', p => { const q = extra('kw.other', { defaults: p.defaults }); Object.keys(p).forEach(k => delete p[k]); Object.assign(p, q); }, "pack.defaults: only the base pack, kw.base, may carry defaults"],
  ['defaults: the build must exist', 'references', p => { p.defaults.build = 'build.z'; }, "pack.defaults.build: names a build, \"build.z\", that the pack does not have"],
  ['defaults: the item must exist', 'references', p => { p.defaults.items.legs = 'legs.none'; }, "pack.defaults.items.legs: names an item, \"legs.none\", that the pack does not have"],
  ['defaults: the item must fit the slot', 'references', p => { p.defaults.items.legs = 'boots.leather'; }, "pack.defaults.items.legs: names \"boots.leather\", whose slot is boots, not legs"],
  ['defaults: the swatch must exist', 'references', p => { p.defaults.swatches.tabard = 'purple'; }, "pack.defaults.swatches.tabard: names a tabard swatch, \"purple\", that the pack does not have"],
  // 3.5 items
  ['items: an unknown slot', 'fields', p => { p.items['legs.plate'].slot = 'tail'; }, "pack.items[\"legs.plate\"].slot: must be one of \"back\", \"legs\", \"boots\", \"torso\", \"head\", \"hair\", \"plume\", \"helmet\", \"pauldrons\", \"arms\", \"gauntlets\", \"main\", \"off\", \"companion\""],
  ['items: slot is required', 'fields', p => { delete p.items['legs.plate'].slot; }, "pack.items[\"legs.plate\"].slot: is missing"],
  ['items: name is required', 'fields', p => { delete p.items['legs.plate'].name; }, "pack.items[\"legs.plate\"].name: is missing"],
  ['items: name of 49 characters', 'fields', p => { p.items['legs.plate'].name = 'n'.repeat(49); }, "pack.items[\"legs.plate\"].name: must be 1 to 48 characters, not 49"],
  ['items: at least one part', 'fields', p => { p.items['legs.plate'].parts = []; }, "pack.items[\"legs.plate\"].parts: must hold 1 to 16 entries, not 0"],
  ['items: 17 parts', 'fields', p => { p.items['back.x'] = backItem(17, 1); }, "pack.items[\"back.x\"].parts: must hold 1 to 16 entries, not 17"],
  ['items: no field the slot does not take', 'fields', p => { p.items['legs.plate'].mounts = { plume: [0, 0] }; }, "pack.items[\"legs.plate\"].mounts: is not a field here"],
  ['items: views only on hair', 'fields', p => { helm(p).views = { helmeted: [] }; }, "pack.items[\"helm.open\"].views: is not a field here"],
  ['items: rest only on helmet, plume and off', 'fields', p => { p.items['legs.plate'].rest = helm(p).rest; }, "pack.items[\"legs.plate\"].rest: is not a field here"],
  ['items: a main item needs a grip', 'fields', p => { delete sword(p).grip; }, "pack.items[\"main.greatsword\"].grip: is missing"],
  ['items: grip kind two or one', 'fields', p => { sword(p).grip.kind = 'three'; }, "pack.items[\"main.greatsword\"].grip.kind: must be one of \"two\", \"one\""],
  ['items: a two grip has two stations', 'rules', p => { sword(p).grip.hands = [6]; }, "pack.items[\"main.greatsword\"].grip.hands: a \"two\" grip has 2 stations"],
  ['items: a one grip has one station', 'rules', p => { p.items['main.arming'].grip.hands = [0, 4]; }, "pack.items[\"main.arming\"].grip.hands: a \"one\" grip has 1 station"],
  ['items: blade from below to', 'rules', p => { sword(p).blade.from = 300; }, "pack.items[\"main.greatsword\"].blade: from must be below to"],
  ['items: an off item needs hold', 'fields', p => { delete p.items['off.round'].hold; }, "pack.items[\"off.round\"].hold: is missing"],
  ['items: an off item\'s face is [x, y, w, h]', 'fields', p => { p.items['off.round'].face = [0, 0, 10]; }, "pack.items[\"off.round\"].face: must be [x, y, w, h]"],
  ['parts: side is L or R', 'fields', p => { p.items['boots.leather'].parts[0].side = 'X'; }, "pack.items[\"boots.leather\"].parts[0].side: must be one of \"L\", \"R\""],
  ['parts: arms need a side', 'fields', p => { delete p.items['arms.plate'].parts[0].side; }, "pack.items[\"arms.plate\"].parts[0].side: is required in arms"],
  ['parts: gauntlets need a side', 'fields', p => { delete p.items['gauntlets.plate'].parts[1].side; }, "pack.items[\"gauntlets.plate\"].parts[1].side: is required in gauntlets"],
  ['parts: arms have one part for each side', 'rules', p => { p.items['arms.plate'].parts[1].side = 'L'; }, "pack.items[\"arms.plate\"].parts: arms must have exactly one part for each side, L and R"],
  ['parts: gauntlets have one part for each side', 'rules', p => { p.items['gauntlets.plate'].parts.push(clone(p.items['gauntlets.plate'].parts[0])); }, "pack.items[\"gauntlets.plate\"].parts: gauntlets must have exactly one part for each side, L and R"],
  ['parts: at least one shape', 'fields', p => { tab(p).length = 0; }, "pack.items[\"torso.tabard\"].parts[0].shapes: must hold 1 to 128 entries, not 0"],
  ['parts: 129 shapes', 'fields', p => { p.items['back.x'] = backItem(1, 129); }, "pack.items[\"back.x\"].parts[0].shapes: must hold 1 to 128 entries, not 129"],
  ['parts: an unknown anchor', 'references', p => { p.items['legs.plate'].parts[0].at = 'elbow'; }, "pack.items[\"legs.plate\"].parts[0].at: the slot legs does not hang anything on \"elbow\""],
  ['parts: an anchor the slot does not allow', 'references', p => { p.items['torso.tabard'].parts[0].at = 'head'; }, "pack.items[\"torso.tabard\"].parts[0].at: the slot torso does not hang anything on \"head\""],
  ['parts: a sided anchor needs a side', 'references', p => { delete p.items['boots.leather'].parts[0].side; }, "pack.items[\"boots.leather\"].parts[0].at: \"foot\" needs a part drawn for one side"],
  ['parts: a shape\'s own anchor must be one the slot allows', 'references', p => { tab(p)[0].at = 'hipL'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].at: the slot torso does not hang anything on \"hipL\""],
  ['parts: an anchored point must be one the slot allows', 'references', p => { p.items['arms.plate'].parts[0].shapes[0].p1.at = 'head'; }, "pack.items[\"arms.plate\"].parts[0].shapes[0].p1.at: the slot arms does not hang anything on \"head\""],
  // 3.6 shapes
  ['shapes: an unknown kind', 'fields', p => { tab(p)[0].k = 'circle'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].k: must be one of \"rect\", \"ell\", \"rrect\", \"poly\", \"strip\", \"pix\""],
  ['shapes: a missing field', 'fields', p => { delete tab(p)[0].r; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].r: is missing"],
  ['shapes: a field the kind does not take', 'fields', p => { tab(p)[2].clip = [0, 1]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].clip: is not a field here"],
  ['shapes: g only in a decoration', 'fields', p => { tab(p)[0].g = 'flame'; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].g: is not a field here"],
  ['shapes: no own anchor in a rest view', 'fields', p => { helm(p).rest.shapes[0].at = 'head'; }, "pack.items[\"helm.open\"].rest.shapes[0].at: is not a field here"],
  ['shapes: no own anchor in a decoration', 'fields', p => { lantern(p).shapes[0].at = 'head'; }, "pack.decorations.lantern.shapes[0].at: is not a field here"],
  ['scalars: an offset past 512', 'fields', p => { tab(p)[2].p = [512.125, 0]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].p[0]: must be a multiple of 1/8 from -512 to 512"],
  ['scalars: an offset past -512', 'fields', p => { tab(p)[2].p = [-512.125, 0]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].p[0]: must be a multiple of 1/8 from -512 to 512"],
  ['scalars: offsets are multiples of 1/8', 'fields', p => { tab(p)[2].p = [0.1, 0]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].p[0]: must be a multiple of 1/8 from -512 to 512"],
  ['scalars: a length below 0', 'fields', p => { tab(p)[2].w = -0.125; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].w: must be a multiple of 1/8 from 0 to 512"],
  ['scalars: a length past 512', 'fields', p => { tab(p)[2].w = 512.125; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].w: must be a multiple of 1/8 from 0 to 512"],
  ['scalars: a radius past 256', 'fields', p => { tab(p)[0].r = 256.125; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].r: must be a multiple of 1/8 from 0 to 256"],
  ['scalars: a strip half-width past 64', 'fields', p => { sword(p).parts[0].shapes[2].hw0 = 64.125; }, "pack.items[\"main.greatsword\"].parts[0].shapes[2].hw0: must be a multiple of 1/8 from 0 to 64"],
  ['scalars: a coefficient past 8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: 8.125 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w.bloat: must be a multiple of 1/8 from -8 to 8"],
  ['scalars: a coefficient past -8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: -9 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w.bloat: must be a multiple of 1/8 from -8 to 8"],
  ['scalars: coefficients are multiples of 1/8', 'fields', p => { tab(p)[0].w = { c: 98, bloat: 0.3 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w.bloat: must be a multiple of 1/8 from -8 to 8"],
  ['scalars: a term key must be a name', 'fields', p => { tab(p)[0].w = { c: 98, 'b-x': 1 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w[\"b-x\"]: is not a name"],
  ['scalars: an unknown named value', 'references', p => { tab(p)[0].w = { c: 98, wobble: 1 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w.wobble: is not a named value"],
  ['scalars: step only in a part for one side', 'references', p => { tab(p)[0].w = { c: 98, step: 1 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].w.step: \"step\" needs a part drawn for one side"],
  ['scalars: no per-frame value in a rest view', 'references', p => { helm(p).rest.shapes[0].w = { c: 64, drop: 1 }; }, "pack.items[\"helm.open\"].rest.shapes[0].w.drop: cannot be used in a rest view"],
  ['scalars: no per-frame value in a mount', 'references', p => { helm(p).mounts.plume = [{ c: 2, sway: 1 }, -74]; }, "pack.items[\"helm.open\"].mounts.plume[0].sway: cannot be used in a mount point"],
  ['scalars: no named value in a decoration', 'references', p => { lantern(p).shapes[0].w = { c: 2, dHead: 1 }; }, "pack.decorations.lantern.shapes[0].w.dHead: cannot be used in a decoration"],
  ['points: a pair has two entries', 'fields', p => { tab(p)[2].p = [0, 0, 0]; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].p: must be a pair [x, y]"],
  ['points: an anchored point needs x and y', 'fields', p => { delete p.items['arms.plate'].parts[0].shapes[0].p1.y; }, "pack.items[\"arms.plate\"].parts[0].shapes[0].p1.y: is missing"],
  ['points: a framed point names the main frame', 'fields', p => { sword(p).parts[0].shapes[2].p0.frame = 'off'; }, "pack.items[\"main.greatsword\"].parts[0].shapes[2].p0.frame: must be \"main\""],
  ['points: frame values within 400', 'fields', p => { sword(p).parts[0].shapes[2].p0.s = 400.125; }, "pack.items[\"main.greatsword\"].parts[0].shapes[2].p0.s: must be a multiple of 1/8 from -400 to 400"],
  ['points: framed points only in the main slot', 'references', p => { tab(p)[2].p = { frame: 'main', s: 0, p: 0 }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[2].p: a framed point is allowed only in the main slot"],
  ['points: only pairs in a rest view', 'fields', p => { helm(p).rest.shapes[0].p = { at: 'rest', x: 0, y: 0 }; }, "pack.items[\"helm.open\"].rest.shapes[0].p: must be a pair [x, y] here"],
  ['poly: dir is required', 'fields', p => { delete sword(p).parts[0].shapes[0].dir; }, "pack.items[\"main.greatsword\"].parts[0].shapes[0].dir: is missing"],
  ['poly: dir is rows, cols or frame', 'fields', p => { sword(p).parts[0].shapes[0].dir = 'diag'; }, "pack.items[\"main.greatsword\"].parts[0].shapes[0].dir: must be one of \"rows\", \"cols\", \"frame\""],
  ['poly: dir frame only in the main slot', 'references', p => { tab(p)[0] = { k: 'poly', dir: 'frame', pts: [[0, 0], [10, 0], [0, 10]], fill: '@base.k' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].dir: \"frame\" is allowed only in a part of a main item"],
  ['poly: at least 3 points', 'fields', p => { sword(p).parts[0].shapes[0].pts.length = 2; }, "pack.items[\"main.greatsword\"].parts[0].shapes[0].pts: must hold 3 to 16 entries, not 2"],
  ['poly: 17 points', 'fields', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: ngon(17, 200), fill: '@base.k' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].pts: must hold 3 to 16 entries, not 17"],
  ['poly: convex', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, 0], [20, 0], [10, 5], [20, 20], [0, 20]], fill: '@base.k' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].pts: must be a convex polygon, its points in order"],
  ['poly: not wound twice round', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, -10], [9, 6], [-9, -3], [9, -3], [-9, 6]], fill: '@base.k' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].pts: must be a convex polygon, its points in order"],
  ['poly: not every point on one line', 'rules', p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts: [[0, 0], [5, 0], [10, 0]], fill: '@base.k' }; }, "pack.items[\"torso.tabard\"].parts[0].shapes[0].pts: must be a convex polygon, its points in order"],
  ['poly: all pairs or all framed', 'rules', p => { sword(p).parts[0].shapes[0].pts[0] = [0, 0]; }, "pack.items[\"main.greatsword\"].parts[0].shapes[0].pts: must be all pairs or all framed points"],
  ['poly: framed points carry no screen offset', 'rules', p => { sword(p).parts[0].shapes[0].pts[0].x = 1; }, "pack.items[\"main.greatsword\"].parts[0].shapes[0].pts: framed points of a polygon cannot carry a screen offset"],
  ['clip: is [top, bottom]', 'fields', p => { helm(p).parts[0].shapes[2].clip = [26]; }, "pack.items[\"helm.open\"].parts[0].shapes[2].clip: must be [top, bottom]"],
  ['pix: 65 rows', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0] = pix(4, 65); }, "pack.items[\"back.pennant\"].parts[0].shapes[0].rows: must hold 1 to 64 entries, not 65"],
  ['pix: a row of 65', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0] = pix(65, 1); }, "pack.items[\"back.pennant\"].parts[0].shapes[0].rows[0]: must be at most 64 characters"],
  ['pix: rows of one length', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].rows[1] = 'kb'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].rows[1]: must be as long as the first row"],
  ['pix: printable characters only', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].rows[0] = 'k k.'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].rows[0]: must be a string of printable characters"],
  ['pix: every character in the key', 'references', p => { p.items['back.pennant'].parts[0].shapes[0].rows[0] = 'kkz.'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].rows[0]: uses \"z\", which the key does not map"],
  ['pix: 17 keys', 'fields', p => { const s = p.items['back.pennant'].parts[0].shapes[0]; for (const c of 'CDEFGHIJLMNOPQR') s.key[c] = '@base.k'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].key: must map 1 to 16 characters, not 17"],
  ['pix: a key is one character', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].key.kk = '@base.k'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].key.kk: must be one printable character other than \".\""],
  ['pix: "." is not a key', 'fields', p => { p.items['back.pennant'].parts[0].shapes[0].key['.'] = '@base.k'; }, "pack.items[\"back.pennant\"].parts[0].shapes[0].key[\".\"]: must be one printable character other than \".\""],
  // 3.7 rest views
  ['rest: fits is hang, surface or floor', 'fields', p => { helm(p).rest.fits = 'wall'; }, "pack.items[\"helm.open\"].rest.fits: must be one of \"hang\", \"surface\", \"floor\""],
  ['rest: box of 241', 'fields', p => { helm(p).rest.box = [241, 70]; }, "pack.items[\"helm.open\"].rest.box[0]: must be a whole number from 1 to 240"],
  ['rest: box of 0', 'fields', p => { helm(p).rest.box = [0, 70]; }, "pack.items[\"helm.open\"].rest.box[0]: must be a whole number from 1 to 240"],
  ['rest: mounts only on a helmet', 'fields', p => { p.items['off.round'].rest.mounts = { plume: [0, 0] }; }, "pack.items[\"off.round\"].rest.mounts: is not a field here"],
  ['rest: a plume\'s rest view has shapes only', 'fields', p => { p.items['plume.crest'].rest.fits = 'surface'; }, "pack.items[\"plume.crest\"].rest.fits: is not a field here"],
  ['rest: 65 shapes', 'fields', p => { helm(p).rest.shapes = range(65).map(() => rect()); }, "pack.items[\"helm.open\"].rest.shapes: must hold 1 to 64 entries, not 65"],
  // 3.8 decorations
  ['decorations: name is required', 'fields', p => { delete lantern(p).name; }, "pack.decorations.lantern.name: is missing"],
  ['decorations: fits names at least one kind', 'fields', p => { lantern(p).fits = []; }, "pack.decorations.lantern.fits: must hold 1 to 3 entries, not 0"],
  ['decorations: fits names each kind once', 'fields', p => { lantern(p).fits = ['hang', 'hang']; }, "pack.decorations.lantern.fits[1]: appears twice"],
  ['decorations: fits names only kinds', 'fields', p => { lantern(p).fits = ['wall']; }, "pack.decorations.lantern.fits[0]: must be one of \"hang\", \"surface\", \"floor\""],
  ['decorations: box of 241', 'rules', p => { lantern(p).box = [241, 70]; }, "pack.decorations.lantern.box: must be at most 240 by 240"],
  ['decorations: box of 241 high', 'rules', p => { lantern(p).box = [40, 241]; }, "pack.decorations.lantern.box: must be at most 240 by 240"],
  ['decorations: 9 groups', 'fields', p => { for (const i of range(8)) lantern(p).groups['g' + i] = { pivot: [0, 0] }; }, "pack.decorations.lantern.groups: must hold 0 to 8 groups, not 9"],
  ['decorations: a group has a pivot', 'fields', p => { lantern(p).groups.flame = {}; }, "pack.decorations.lantern.groups.flame.pivot: is missing"],
  ['decorations: a shape names a declared group', 'references', p => { lantern(p).shapes[3].g = 'smoke'; }, "pack.decorations.lantern.shapes[3].g: names a group, \"smoke\", that the decoration does not declare"],
  ['decorations: 65 shapes', 'fields', p => { lantern(p).shapes = range(65).map(() => rect()); }, "pack.decorations.lantern.shapes: must hold 1 to 64 entries, not 65"],
  ['decorations: only pairs for points', 'fields', p => { lantern(p).shapes[0].p = { at: 'head', x: 0, y: 0 }; }, "pack.decorations.lantern.shapes[0].p: must be a pair [x, y] here"],
  ['anim: period below 0.2', 'fields', p => { lantern(p).anim.period = 0.199; }, "pack.decorations.lantern.anim.period: must be a number from 0.2 to 600"],
  ['anim: period above 600', 'fields', p => { lantern(p).anim.period = 600.001; }, "pack.decorations.lantern.anim.period: must be a number from 0.2 to 600"],
  ['anim: loop is required', 'fields', p => { delete lantern(p).anim.loop; }, "pack.decorations.lantern.anim.loop: is missing"],
  ['anim: loop is true or false', 'fields', p => { lantern(p).anim.loop = 1; }, "pack.decorations.lantern.anim.loop: must be true or false"],
  ['anim: phase from 0 to 1', 'fields', p => { lantern(p).anim.phase = 1.5; }, "pack.decorations.lantern.anim.phase: must be a number from 0 to 1"],
  ['anim: 17 tracks', 'fields', p => { lantern(p).anim.tracks = range(17).map(() => lantern(p).anim.tracks[0]); }, "pack.decorations.lantern.anim.tracks: must hold 1 to 16 entries, not 17"],
  ['tracks: 33 keys', 'fields', p => { lantern(p).anim.tracks[0].keys = range(33).map(i => [Math.round(i / 32 * 1000) / 1000, 0]); }, "pack.decorations.lantern.anim.tracks[0].keys: must hold 1 to 32 entries, not 33"],
  ['tracks: times rise', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0.5, 0], [0.5, 1]]; }, "pack.decorations.lantern.anim.tracks[0].keys[1][0]: times must rise"],
  ['tracks: times from 0 to 1', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0, 0], [1.5, 1]]; }, "pack.decorations.lantern.anim.tracks[0].keys[1][0]: must be a number from 0 to 1"],
  ['tracks: a channel of the list', 'fields', p => { lantern(p).anim.tracks[0].ch = 'spin'; }, "pack.decorations.lantern.anim.tracks[0].ch: must be one of \"dx\", \"dy\", \"scale\", \"alpha\", \"show\""],
  ['tracks: show is always step', 'fields', p => { lantern(p).anim.tracks[1].ease = 'linear'; }, "pack.decorations.lantern.anim.tracks[1].ease: must be \"step\" on a show track"],
  ['tracks: an ease is required on dx, dy, scale and alpha', 'fields', p => { delete lantern(p).anim.tracks[0].ease; }, "pack.decorations.lantern.anim.tracks[0].ease: is missing"],
  ['tracks: an ease of the list', 'fields', p => { lantern(p).anim.tracks[0].ease = 'bounce'; }, "pack.decorations.lantern.anim.tracks[0].ease: must be one of \"step\", \"linear\", \"smooth\""],
  ['tracks: scale from 0.25 to 4', 'fields', p => { lantern(p).anim.tracks[0] = { g: 'flame', ch: 'scale', ease: 'linear', keys: [[0, 1], [1, 4.001]] }; }, "pack.decorations.lantern.anim.tracks[0].keys[1][1]: must be a number from 0.25 to 4"],
  ['tracks: alpha from 0 to 1', 'fields', p => { lantern(p).anim.tracks[0] = { g: 'flame', ch: 'alpha', ease: 'linear', keys: [[0, 1.5]] }; }, "pack.decorations.lantern.anim.tracks[0].keys[0][1]: must be a number from 0 to 1"],
  ['tracks: show is 0 or 1', 'fields', p => { lantern(p).anim.tracks[1].keys = [[0, 2]]; }, "pack.decorations.lantern.anim.tracks[1].keys[0][1]: must be a whole number from 0 to 1"],
  ['tracks: dx in eighths', 'fields', p => { lantern(p).anim.tracks[0].keys = [[0, 0.3]]; }, "pack.decorations.lantern.anim.tracks[0].keys[0][1]: must be a multiple of 1/8 from -512 to 512"],
  ['tracks: a palette track takes hex colours', 'fields', p => { lantern(p).anim.tracks[2].keys = [[0, '@base.k']]; }, "pack.decorations.lantern.anim.tracks[2].keys[0][1]: must be a hex colour"],
  ['tracks: a group track names a declared group', 'references', p => { lantern(p).anim.tracks[0].g = 'smoke'; }, "pack.decorations.lantern.anim.tracks[0].g: names a group, \"smoke\", that the decoration does not declare"],
  ['tracks: a palette track changes only the pack\'s own sets', 'references', p => { lantern(p).anim.tracks[2].pal = 'tabard.1'; }, "pack.decorations.lantern.anim.tracks[2].pal: must name a palette set of this pack, and \"tabard\" is not one"],
  ['tracks: a palette track names an existing entry', 'references', p => { lantern(p).anim.tracks[2].pal = 'lantern.wick'; }, "pack.decorations.lantern.anim.tracks[2].pal: names an entry, \"wick\", that set \"lantern\" does not have"],
  ['tracks: a palette track names a single hex colour', 'references', p => { lantern(p).anim.tracks[2].pal = 'lantern.rim'; }, "pack.decorations.lantern.anim.tracks[2].pal: must name an entry that is a hex colour"],
  ['tracks: one track for each thing it drives', 'rules', p => { lantern(p).anim.tracks.push(clone(lantern(p).anim.tracks[0])); }, "pack.decorations.lantern.anim.tracks[3]: drives what an earlier track already drives"],
  // 2.7 the face box
  ['face box: a helmet needs a @skin.face shape', 'rules', p => { opening(p).fill = '@base.k'; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  ['face box: the opening must cover x from -28', 'rules', p => { opening(p).p = [-27, -21]; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  ['face box: the opening must cover y to 20', 'rules', p => { opening(p).h = 40; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  ['face box: a clip may not cut into it', 'rules', p => { opening(p).clip = [-21, 10]; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  ['face box: it must hold for every build', 'rules', p => { opening(p).w = { c: 74, dHead: 2 }; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  ['face box: it must hold in every frame', 'rules', p => { opening(p).p = [-37, { c: -21, drop: 1 }]; }, "pack.items[\"helm.open\"].parts: a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build"],
  // 6.2 counts
  ['counts: 257 items', 'counts', p => { const n = 257 - Object.keys(p.items).length; for (const i of range(n)) p.items['back.f' + i] = backItem(1, 1); }, "pack.items: holds 257 items, more than 256"],
  ['counts: 401 shapes in one item', 'counts', p => { p.items['back.x'] = backItem(4, 100); p.items['back.x'].parts[0].shapes.push(rect()); }, "pack.items[\"back.x\"]: holds 401 shapes in its parts and views, more than 400"],
  ['counts: 401 shapes counting views and rest', 'counts', p => { p.items['hair.long'].views.helmeted.push(...[100, 100, 100, 91].map(n => ({ at: 'head', shapes: range(n).map(() => rect()) }))); }, "pack.items[\"hair.long\"]: holds 401 shapes in its parts and views, more than 400"],
  ['counts: 16 385 pixels in one pack', 'counts', p => { delete p.items['back.pennant']; p.items['back.x'] = { slot: 'back', name: 'Big', parts: [{ at: 'neck', shapes: [pix(64, 64), pix(64, 64), pix(64, 64), pix(64, 64), pix(1, 1)] }] }; }, "pack: holds 16385 pixels in pix shapes, more than 16384"],
  ['counts: 65 decorations', 'counts', p => { for (const i of range(64)) p.decorations['d' + i] = lantern(p); }, "pack.decorations: holds 65 decorations, more than 64"],
  ['counts: the default look over 1200 shapes', 'counts', p => {
    for (const s of ['legs', 'boots', 'torso']) { p.items[s + '.big'] = backItem(4, 100); p.items[s + '.big'].slot = s; p.items[s + '.big'].parts.forEach(pt => { pt.at = s === 'legs' ? 'hipL' : s === 'boots' ? 'footL' : 'neck'; }); p.defaults.items[s] = s + '.big'; }
  }, "pack.defaults: the default look draws 1269 shapes with build \"build.a\", more than 1200"]
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
  ['a torso, height less leg, of 46', p => { p.builds['build.a'].m.height = 120; }],
  ['a torso, height less leg, of 74', p => { p.builds['build.a'].m.height = 148; }],
  ['8 bands', p => { tab(p)[0].fill = range(8).map(i => [(i + 1) / 8, '@base.k']); }],
  ['translucent a at 0.01 and 1', p => { tab(p)[0].fill = { rgb: '#000000', a: 0.01 }; tab(p)[1].fill = { rgb: '#000000', a: 1 }; }],
  ['16 parts in an item', p => { p.items['back.x'] = backItem(16, 1); }],
  ['128 shapes in a part', p => { p.items['back.x'] = backItem(1, 128); }],
  ['400 shapes in an item', p => { p.items['back.x'] = backItem(4, 100); }],
  ['256 items', p => { const n = 256 - Object.keys(p.items).length; for (const i of range(n)) p.items['back.f' + i] = backItem(1, 1); }],
  ['offsets at 512 and -512, lengths at 0 and 512, radius 256, half-width 64', p => { tab(p)[2].p = [512, -512]; tab(p)[2].w = 0; tab(p)[2].h = 512; tab(p)[0].r = 256; sword(p).parts[0].shapes[2].hw0 = 64; }],
  ['coefficients at 8 and -8', p => { tab(p)[2].p = [{ c: -2, sway: 8, dHead: -8 }, -22]; }],
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
  rejected(p => { tab(p)[0].r = 14.1; }, 'fields', 'pack.items["torso.tabard"].parts[0].shapes[0].r: must be a multiple of 1/8 from 0 to 256');
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
  rejected(p => { p.ext = JSON.parse('{"__proto__":{"polluted":1}}'); }, 'json', 'pack.ext.__proto__: this key is not allowed anywhere in a pack');
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
  for (const edit of levels) rejected(edit, 'fields', /\.z: is not a field here$/);
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
  // the shipped table holds the project's key alone, so a pack signed by any other key under its
  // kid fails, and one naming another kid is unknown, unless keys are given
  assert.deepEqual(Object.keys(PK.KEYS), ['kw1']);
  const shipped = PK.read(envText(p), { verify });
  assert.deepEqual([shipped.ok, shipped.step], [false, 'signature']);
  assert.match(shipped.reason, /does not verify/);
  assert.match(PK.read(JSON.stringify({ kwpack: 1, pack: p, sig: sigOf(p, { kid: 'kw2' }) }), { verify }).reason, /does not know, "kw2"/);
  // a key of the wrong length is no key
  assert.equal(PK.read(envText(p), { verify, keys: { kw1: PUB.slice(1) } }).step, 'signature');
});

test('the shipped key table holds kw1, 32 bytes, in a frozen table that hands out copies', () => {
  assert.ok(Object.isFrozen(PK.KEYS));
  const k = PK.KEYS.kw1;
  assert.ok(k instanceof Uint8Array);
  assert.equal(k.length, 32);
  assert.equal(Buffer.from(k).toString('base64'), 'L6J33tuj/6eKJTc+T6hHVATAS0m1bJnsgdOSgYYtxf4=');
  // a key the curve accepts: node:crypto takes it as an Ed25519 public key
  assert.equal(crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(k).toString('base64url') }, format: 'jwk' }).asymmetricKeyType, 'ed25519');
  // changing the bytes handed out changes nothing, and kw1 cannot be replaced or another key added
  k.fill(0);
  assert.equal(Buffer.from(PK.KEYS.kw1).toString('base64'), 'L6J33tuj/6eKJTc+T6hHVATAS0m1bJnsgdOSgYYtxf4=');
  assert.throws(() => { 'use strict'; PK.KEYS.kw1 = PUB; }, TypeError);
  assert.throws(() => { 'use strict'; PK.KEYS.kw2 = PUB; }, TypeError);
  assert.deepEqual(Object.keys(PK.KEYS), ['kw1']);
});

test('the sig must be well formed', () => {
  const p = BASE(), good = sigOf(p);
  const cases = [Object.assign({}, good, { alg: 'rsa' }), Object.assign({}, good, { kid: 'Bad Kid' }), Object.assign({}, good, { value: good.value.slice(0, -4) }),
    Object.assign({}, good, { value: good.value.replace(/==$/, '=A') }), Object.assign({}, good, { value: good.value.slice(0, -3) + 'B==' }),
    { alg: 'ed25519', kid: 'kw1' }];
  for (const sig of cases) assert.equal(readEnv({ kwpack: 1, pack: p, sig }).step, 'signature', JSON.stringify(sig));
  // the same 64 bytes spelt with one unused bit of the last character set: refused for its spelling,
  // though it would decode to the very bytes that verify
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', last = good.value.length - 3;
  const respelt = good.value.slice(0, last) + B64[B64.indexOf(good.value[last]) ^ 1] + '==';
  assert.ok(Buffer.from(respelt, 'base64').equals(Buffer.from(good.value, 'base64')));
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: Object.assign({}, good, { value: respelt }) }).reason, 'sig.value: must be 64 bytes in base64');
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: Object.assign({}, good, { alg: 'rsa' }) }).reason, 'sig.alg: must be "ed25519"');
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
  // the base pack is always admitted, even after 32 others; the cap turns away the last of those
  const over = PK.gather(many.concat([base]));
  assert.equal(over.packs.size, 32);
  assert.equal(over.packs.get('kw.base'), base);
  assert.deepEqual([over.rejected[0].id, over.rejected[0].step], ['extra-31', 'counts']);
  assert.equal(PK.gather(many.concat([base, newer])).packs.get('kw.base'), newer);
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
  assert.deepEqual(L.grip, { kind: 'two', hands: [2, -30] });
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

test('with no base pack the result says so, for the caller to draw the knight from code', () => {
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
  // crossed: both arms behind the shield, then the blade over it, and the sword hand's gauntlet
  assert.deepEqual(PK.sequence('oneCrossed', true).slice(6, 12), ['armL', 'gauntL', 'armR', 'off', 'main', 'gauntR']);
  assert.deepEqual(PK.sequence('oneCrossed', false).slice(1, 2), ['headOff']);
  // the engine's crates go after the pauldrons, before the hands group
  assert.deepEqual(PK.sequence('none', true).slice(4, 7), ['pauldrons', 'crates', 'armL']);
  assert.equal(PK.sequence('sideways'), null);
});

test('a shield goes only with a one-handed weapon: without one it falls back to none, with a reason', () => {
  const reason = 'a shield is carried only with a one-handed weapon';
  const two = PK.resolve(library(), { items: { off: 'kw.base/off.round' } });
  assert.equal(two.look.items.off, undefined);
  assert.equal(two.lists.off.length + two.lists.restOff.length, 0);
  assert.deepEqual(two.fallbacks.filter(f => f.key === 'off'), [{ kind: 'item', key: 'off', wanted: 'kw.base/off.round', used: null, reason }]);
  // a one-handed weapon the look cannot have falls back to the greatsword, and the shield with it
  const gone = PK.resolve(library(), { items: { main: 'kw.gone/main.x', off: 'kw.base/off.round' } });
  assert.equal(gone.look.items.main, 'kw.base/main.greatsword');
  assert.equal(gone.look.items.off, undefined);
  assert.deepEqual(gone.fallbacks.filter(f => f.key === 'off').map(f => f.reason), [reason]);
  // with the one-handed sword the shield stays, and nothing falls back
  const one = PK.resolve(library(), { items: { main: 'kw.base/main.arming', off: 'kw.base/off.round' } });
  assert.equal(one.look.items.off, 'kw.base/off.round');
  assert.deepEqual(one.fallbacks.filter(f => f.key === 'off' || f.key === 'main'), []);
  // a one-handed sword alone is a look of its own: no shield, no fallback for one
  const bare = PK.resolve(library(), { items: { main: 'kw.base/main.arming' } });
  assert.equal(bare.grip.kind, 'one');
  assert.equal(bare.lists.off.length, 0);
  assert.deepEqual(bare.fallbacks.filter(f => f.key === 'off'), []);
});

test('the rest views: the helmet at rest carries the plume\'s rest view on its mount, behind it', () => {
  const L = baseLook(), R = recorder(), A = PK.newAnchors();
  A[2 * PK.ANCHOR.rest] = 300; A[2 * PK.ANCHOR.rest + 1] = 400;
  PK.draw(L.lists.restHelmet, A, PK.newValues(), R.P);
  assert.equal(R.log.length, 4 + 10);
  assert.deepEqual(R.log[0], ['ell', 306, 342, 18, 10, K], 'the plume first, at the mount (6, -58)');
  assert.deepEqual(R.log[4], ['rrect', 268, 344, 64, 54, 24, K], 'then the helmet over it');
  // a helmet whose rest view has no plume mount rests without the plume
  const bare = PK.resolve([load(edited(p => { delete helm(p).rest.mounts; }))], {});
  assert.equal(bare.lists.restHelmet.length, 10);
  R.log.length = 0;
  PK.draw(bare.lists.restHelmet, A, PK.newValues(), R.P);
  assert.deepEqual(R.log[0], ['rrect', 268, 344, 64, 54, 24, K]);
  const S = PK.resolve(library(), { items: { main: 'kw.base/main.arming', off: 'kw.base/off.round' } });
  assert.equal(S.lists.restOff.length, 2);
  // with the greatsword the shield is not equipped, so it rests nowhere either
  assert.equal(PK.resolve(library(), { items: { off: 'kw.base/off.round' } }).lists.restOff.length, 0);
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

// ---- Values after arithmetic --------------------------------------------------------------------------

const TAB = 'pack.items["torso.tabard"].parts[0].shapes';
const RANGES = [
  ['a length that goes negative with the build', p => { tab(p)[2].w = { c: 0, dHeight: -8 }; }, TAB + '[2].w: the length reaches -224 at its least, below 0'],
  ['a length past 512 with the build', p => { tab(p)[2].h = { c: 500, dHeight: 1 }; }, TAB + '[2].h: the length reaches 528 at its greatest, above 512'],
  ['an offset past 512 with the bloat at 60', p => { tab(p)[2].p = [{ c: 460, bloat: 1 }, 0]; }, TAB + '[2].p[0]: the offset reaches 520 at its greatest, above 512'],
  ['an offset past -512 with the drop at 40', p => { tab(p)[2].p = [0, { c: -500, drop: -1 }]; }, TAB + '[2].p[1]: the offset reaches -540 at its least, below -512'],
  ['a length that goes negative with the drop at 40', p => { p.items['legs.plate'].parts[0].shapes[0].h = { c: 56, drop: -2 }; }, 'pack.items["legs.plate"].parts[0].shapes[0].h: the length reaches -24 at its least, below 0'],
  ['an offset past -512 with a lifted step', p => { p.items['boots.leather'].parts[0].shapes[0].p = [-28, { c: -510, step: -6 }]; }, 'pack.items["boots.leather"].parts[0].shapes[0].p[1]: the offset reaches -516 at its least, below -512'],
  ['an offset past 512 with the sway', p => { p.items['plume.crest'].parts[0].shapes[0].p = [{ c: 510, sway: 1 }, 0]; }, 'pack.items["plume.crest"].parts[0].shapes[0].p[0]: the offset reaches 514 at its greatest, above 512'],
  ['a radius past 256 with the head', p => { tab(p)[0].r = { c: 250, dHead: 1 }; }, TAB + '[0].r: the radius reaches 259 at its greatest, above 256'],
  ['an ellipse radius of 0', p => { tab(p)[11].ry = 0; }, TAB + '[11].ry: the radius reaches 0 at its least, below 1'],
  ['an ellipse radius that reaches 0 with the build', p => { tab(p)[11].rx = { c: 9, dHead: 1 }; }, TAB + '[11].rx: the radius reaches 0 at its least, below 1'],
  ['a half-width past 64 with the head', p => { sword(p).parts[0].shapes[2].hw0 = { c: 60, dHead: 1 }; }, 'pack.items["main.greatsword"].parts[0].shapes[2].hw0: the half-width reaches 69 at its greatest, above 64'],
  ['a half-width below 0 with the head', p => { sword(p).parts[0].shapes[2].hw1 = { c: 0, dHead: 1 }; }, 'pack.items["main.greatsword"].parts[0].shapes[2].hw1: the half-width reaches -9 at its least, below 0'],
  ['a clip past 512', p => { helm(p).parts[0].shapes[2].clip = [{ c: 500, dHead: 2 }, null]; }, 'pack.items["helm.open"].parts[0].shapes[2].clip[0]: the offset reaches 518 at its greatest, above 512'],
  ['a framed point\'s screen offset past 512', p => { sword(p).parts[0].shapes[21].p.x = { c: 510, sway: 1 }; }, 'pack.items["main.greatsword"].parts[0].shapes[21].p.x: the offset reaches 514 at its greatest, above 512'],
  ['an anchored point past 512', p => { p.items['arms.plate'].parts[0].shapes[0].p1.x = { c: 510, bloat: 1 }; }, 'pack.items["arms.plate"].parts[0].shapes[0].p1.x: the offset reaches 570 at its greatest, above 512'],
  ['a shield whose hold point carries a shape past 512', p => { p.items['off.round'].hold = [0, 500]; p.items['off.round'].parts[0].shapes[0].p = [0, -20]; },
    'pack.items["off.round"].parts[0].shapes[0].p[1]: with the hold point folded in, the offset reaches -520 at its least, below -512'],
  ['a shield whose hold point carries a clip past 512', p => { p.items['off.round'].hold = [0, -505]; p.items['off.round'].parts[0].shapes[2].clip = [10, null]; }, 'pack.items["off.round"].parts[0].shapes[2].clip[0]: with the hold point folded in, the offset reaches 515 at its greatest, above 512'],
  ['a helmet mount past 512', p => { helm(p).mounts.plume = [2, { c: -510, dHead: -1 }]; }, 'pack.items["helm.open"].mounts.plume[1]: the offset reaches -519 at its least, below -512'],
  ['a rest mount past 512', p => { helm(p).rest.mounts.plume = [{ c: 510, dHead: 1 }, 0]; }, 'pack.items["helm.open"].rest.mounts.plume[0]: the offset reaches 519 at its greatest, above 512'],
  ['a rest view length that goes negative with the build', p => { helm(p).rest.shapes[0].w = { c: 0, dChest: 1 }; }, 'pack.items["helm.open"].rest.shapes[0].w: the length reaches -14 at its least, below 0'],
  ['hair\'s helmeted view past 512', p => { p.items['hair.long'].views.helmeted[0].shapes[0].pts[2] = [{ c: -500, dHead: 2 }, 76]; }, 'pack.items["hair.long"].views.helmeted[0].shapes[0].pts[2][0]: the offset reaches -518 at its least, below -512'],
  ['a decoration ellipse radius of 0', p => { lantern(p).shapes[3].rx = 0; }, 'pack.decorations.lantern.shapes[3].rx: the radius reaches 0 at its least, below 1'],
  ['the default plume past 512 on the default helmet\'s mount', p => { helm(p).mounts.plume = [2, { c: -500, dHead: -1 }]; },
    'pack.defaults: the default plume on the default helmet: the plume\'s parts[0].shapes[4].p[1]: with the helmet\'s mount folded in, the offset reaches -516 at its least, below -512']
];
for (const [name, edit, reason] of RANGES) test('refused at rules, bounded over every value: ' + name, () => {
  const r = load(edited(edit));
  assert.equal(r.ok, false, 'expected the pack to be refused');
  assert.equal(r.step, /default plume/.test(name) ? 'counts' : 'rules', r.reason);
  assert.equal(r.reason, reason);
});

test('the named values have stated ranges, frozen', () => {
  assert.deepEqual(clone(PK.RANGE), { drop: [0, 40], bloat: [0, 60], stepL: [0, 1], stepR: [0, 1], step: [0, 1], sway: [-4, 4],
    dShoulder: [-14, 16], dChest: [-14, 18], dWaist: [-18, 18], dHip: [-14, 18], dStance: [-8, 10], dLeg: [-14, 26], dHeight: [-22, 28], dHead: [-9, 9] });
  assert.ok(Object.isFrozen(PK.RANGE) && Object.isFrozen(PK.RANGE.drop));
});

test('every value a list hands a primitive stays in range at the extremes of every named value', () => {
  // the fixture's every build and look, drawn with the values at each end of their ranges
  const lib = PK.gather([load(BASE())]);
  for (const look of [{}, { build: 'kw.base/build.b' }, { items: { hair: 'kw.base/hair.long', back: 'kw.base/back.pennant', main: 'kw.base/main.arming', off: 'kw.base/off.round' } }]) {
    const L = PK.resolve(lib, look);
    for (const [drop, bloat, step, sway] of [[0, 0, 0, -4], [40, 60, 1, 4]]) {
      const R = recorder(), A = PK.newAnchors(), V = PK.newValues();
      V[PK.VALUE.drop] = drop; V[PK.VALUE.bloat] = bloat; V[PK.VALUE.stepL] = step; V[PK.VALUE.stepR] = step; V[PK.VALUE.sway] = sway;
      A[PK.FRAME_SX] = Math.sin(1); A[PK.FRAME_SY] = -Math.cos(1);
      for (const n of Object.keys(L.lists)) PK.draw(L.lists[n], A, V, R.P);
      for (const [k, ...a] of R.log) {
        const size = { Rh: [2, 3], Rv: [2, 3], rrect: [2, 3, 4], ell: [2, 3], strip: [4, 5] }[k] || [];
        for (const i of size) assert.ok(a[i] >= (k === 'ell' ? 1 : 0) && a[i] <= 512, k + ' size ' + a[i]);
        const pts = k === 'poly' ? a[0] : k === 'strip' ? [[a[0], a[1]], [a[2], a[3]]] : [[a[0], a[1]]];
        for (const [x, y] of pts) assert.ok(Math.abs(x) <= 512 + 270 && Math.abs(y) <= 512 + 270, k + ' point ' + x + ',' + y);
      }
    }
  }
});

// ---- Cost ------------------------------------------------------------------------------------------------

const BANDS8 = range(8).map(i => [(i + 1) / 8, i % 2 ? '#000000' : '#ffffff']);
// Shapes of a known total cost: an rrect h rows high costs h calls in one colour and 8h in 8 bands.
function costly(n, at) {
  const shapes = [], rr = (h, fill) => ({ k: 'rrect', p: [0, 0], w: 4, h, r: 0, fill });
  for (; n >= 4096; n -= 4096) shapes.push(rr(512, BANDS8));
  if (n >= 8) { shapes.push(rr(Math.floor(n / 8), BANDS8)); n %= 8; }
  if (n > 0) shapes.push(rr(n, '@base.k'));
  return [{ at, shapes }];
}
const costlyItem = (slot, at, n) => ({ slot, name: 'Costly', parts: costly(n, at) });

test('a shape\'s cost is the most fillRect calls draw.js can make for it', () => {
  const r = load(BASE());
  assert.equal(PK.LIMITS.itemCost, 8000);
  assert.equal(PK.LIMITS.lookCost, 40000);
  assert.equal(PK.LIMITS.decorCost, 8000);
  assert.equal(PK.ANCHOR_SPAN, 400);
  // a rect: 1 call, or one per band; a pix: one per run
  assert.deepEqual(r.sums['back.pennant'].parts, { n: 1, cost: 8 });
  const c = n => load(edited(p => { p.items['back.x'] = { slot: 'back', name: 'X', parts: [{ at: 'neck', shapes: n }] }; })).sums['back.x'].parts.cost;
  assert.equal(c([{ k: 'ell', p: [0, 0], rx: 4, ry: 7, fill: '@base.k' }]), 15);
  assert.equal(c([{ k: 'ell', p: [0, 0], rx: 4, ry: { c: 10, dHead: 1 }, fill: '@base.steel' }]), (2 * 19 + 1) * 4);
  assert.equal(c([{ k: 'ell', p: [0, 0], rx: 40, ry: 40, fill: '@base.k', clip: [0, 9] }]), 10);
  assert.equal(c([{ k: 'rrect', p: [0, 0], w: 9, h: { c: 20, drop: 1 }, r: 3, fill: '@skin.face' }]), 60 * 8);
  assert.equal(c([{ k: 'poly', dir: 'rows', pts: [[0, 0], [10, 0], [0, 10.5]], fill: '@base.k' }]), 12);
  assert.equal(c([{ k: 'strip', p0: [0, 0], p1: [30, 0], hw0: 2, hw1: 3, fill: '@base.k' }]), 36);
  assert.equal(c([{ k: 'strip', p0: [0, 0], p1: { at: 'handL', x: 0, y: 0 }, hw0: 2, hw1: 3, fill: '@base.k' }]), 6 + 400 + 1);
  assert.equal(c([{ k: 'pix', p: [0, 0], rows: ['aab.a', '.....', 'ab..b'], key: { a: '@base.k', b: '@base.w' } }]), 6);
});

test('the cost bound holds: draw.js makes no more fills than the cost, at the extremes', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/js/draw.js'), 'utf8'), ctx);
  let fills = 0;
  ctx.window.KW.draw.setCtx({ fillRect() { fills++; }, set fillStyle(v) {}, globalAlpha: 1 });
  const lib = PK.gather([load(BASE())]);
  for (const look of [{ build: 'kw.base/build.b' }, { items: { hair: 'kw.base/hair.long', main: 'kw.base/main.arming', off: 'kw.base/off.round', back: 'kw.base/back.pennant' } }]) {
    const L = PK.resolve(lib, look);
    for (const ang of [0, 0.7, 1.6, 2.4]) for (const [drop, bloat, step, sway] of [[0, 0, 0, -4], [40, 60, 1, 4]]) {
      const g = rig({ x: 480, floor: 530, t: 0, gx: 26, gy: 45, wang: ang }, L.diffs);
      g.V[PK.VALUE.drop] = drop; g.V[PK.VALUE.bloat] = bloat; g.V[PK.VALUE.stepL] = step; g.V[PK.VALUE.stepR] = step; g.V[PK.VALUE.sway] = sway;
      fills = 0;
      for (const n of ['body', 'headOn', 'pauldrons', 'armL', 'armR', 'gauntL', 'gauntR', 'main', 'off']) PK.draw(L.lists[n], g.A, g.V, ctx.window.KW.draw, L.colours.face);
      assert.ok(fills > 1000 && fills <= L.cost, fills + ' fills against a cost of ' + L.cost);
    }
  }
});

test('the present knight\'s cost, by grip mode', () => {
  const r = load(BASE()), S = r.sums, it = id => S[id].parts.cost;
  const common = it('legs.plate') + it('boots.leather') + it('torso.tabard') + it('pauldrons.plate') + it('arms.plate') + it('gauntlets.plate');
  const headOn = it('plume.crest') + it('helm.open'), headOff = it('head.plain') + it('hair.short');
  assert.deepEqual([common, headOn, headOff, it('main.greatsword')], [5560, 1720, 1632, 4652]);
  assert.equal(baseLook().cost, common + headOn + it('main.greatsword'));
  assert.equal(baseLook().cost, 11932);
});

test('refused at counts: an item over 8000, and accepted at 8000', () => {
  assert.equal(load(edited(p => { p.items['back.x'] = costlyItem('back', 'neck', 8000); })).sums['back.x'].parts.cost, 8000);
  rejected(p => { p.items['back.x'] = costlyItem('back', 'neck', 8001); }, 'counts', 'pack.items["back.x"]: costs up to 8001 fills in its parts and views, more than 8000');
  // the views and the rest view count too
  rejected(p => { p.items['hair.long'].views.helmeted.push(...costly(8000 - 541 + 1, 'head')); }, 'counts', 'pack.items["hair.long"]: costs up to 8001 fills in its parts and views, more than 8000');
});

test('refused at counts: a decoration over 8000, its scale counted, and accepted at 8000', () => {
  const big = (n, scale) => p => {
    const shapes = costly(n, 'x')[0].shapes.map(s => Object.assign({ g: 'flame' }, s));
    lantern(p).shapes = shapes;
    lantern(p).anim.tracks[0] = { g: 'flame', ch: 'scale', ease: 'linear', keys: [[0, 1], [1, scale]] };
  };
  assert.equal(load(edited(big(4000, 2))).decorations.lantern.cost, 8000);
  rejected(big(4001, 2), 'counts', 'pack.decorations.lantern: costs up to 8002 fills, more than 8000');
  rejected(big(8001, 1), 'counts', 'pack.decorations.lantern: costs up to 8001 fills, more than 8000');
});

test('refused at counts: a default look over the cost cap', () => {
  rejected(p => {
    for (const [s, at] of [['legs', 'hipL'], ['boots', 'footL'], ['torso', 'neck'], ['pauldrons', 'shoulderL']]) { p.items[s + '.big'] = costlyItem(s, at, 8000); p.defaults.items[s] = s + '.big'; }
  }, 'counts', 'pack.defaults: the default look costs up to 41944 fills with build "build.a", more than 40000');
});

test('a look at a cost of exactly 40000 is kept, and one over falls back slot by slot until it fits', () => {
  const pack = n => extra('kw.costly', { items: { 'legs.c': costlyItem('legs', 'hipL', n), 'boots.c': costlyItem('boots', 'footL', 7514),
    'torso.c': costlyItem('torso', 'neck', 7514), 'pauldrons.c': costlyItem('pauldrons', 'shoulderL', 7514), 'back.c': costlyItem('back', 'neck', 8000) } });
  const look = { items: { legs: 'kw.costly/legs.c', boots: 'kw.costly/boots.c', torso: 'kw.costly/torso.c', pauldrons: 'kw.costly/pauldrons.c' } };
  const at = PK.resolve(PK.gather([load(BASE()), load(pack(7514))]), look);
  assert.equal(at.cost, 40000);
  assert.equal(at.fallbacks.filter(f => /cap/.test(f.reason)).length, 0);
  const over = PK.resolve(PK.gather([load(BASE()), load(pack(7515))]), look);
  assert.deepEqual(over.fallbacks.filter(f => /cap/.test(f.reason)), [{ kind: 'item', key: 'legs', wanted: 'kw.costly/legs.c', used: 'kw.base/legs.plate', reason: 'over the cost cap of 40000 fills' }]);
  assert.equal(over.cost, 40001 - 7515 + 559);
  const far = PK.resolve(PK.gather([load(BASE()), load(pack(7514))]), Object.assign({}, look, { items: Object.assign({ back: 'kw.costly/back.c' }, look.items) }));
  assert.deepEqual(far.fallbacks.filter(f => /cap/.test(f.reason)).map(f => f.key), ['back']);
  assert.ok(far.cost <= 40000);
});

// ---- The plume on another pack's helmet -------------------------------------------------------------------

test('a plume that a helmet\'s mount would carry past 512 falls back, and then the helmet', () => {
  const tall = { slot: 'helmet', name: 'Tall', mounts: { plume: [0, -490] }, parts: [{ at: 'head', shapes: [{ k: 'rrect', p: [-37, -21], w: 74, h: 44, r: 9, fill: '@skin.face' }] }] };
  const lower = { slot: 'plume', name: 'Low', parts: [{ at: 'plume', shapes: [{ k: 'ell', p: [0, -30], rx: 10, ry: 10, fill: '@plume.1' }] }] };
  const lib = PK.gather([load(BASE()), load(extra('kw.hats', { items: { 'helm.tall': tall, 'plume.low': lower, 'helm.taller': Object.assign({}, tall, { mounts: { plume: [0, -510] } }) } }))]);
  // the low plume reaches -520 on the tall helmet: the plume falls back to the crest, which fits
  const a = PK.resolve(lib, { items: { helmet: 'kw.hats/helm.tall', plume: 'kw.hats/plume.low' } });
  assert.equal(a.look.items.helmet, 'kw.hats/helm.tall');
  assert.equal(a.look.items.plume, 'kw.base/plume.crest');
  assert.deepEqual(a.fallbacks.find(f => f.key === 'plume' && f.kind === 'item'), { kind: 'item', key: 'plume', wanted: 'kw.hats/plume.low', used: 'kw.base/plume.crest',
    reason: 'does not fit the helmet: the plume\'s parts[0].shapes[0].p[1]: with the helmet\'s mount folded in, the offset reaches -520 at its least, below -512' });
  // the crest itself reaches -517 on the taller helmet: the helmet falls back
  const b = PK.resolve(lib, { items: { helmet: 'kw.hats/helm.taller' } });
  assert.equal(b.look.items.helmet, 'kw.base/helm.open');
  assert.match(b.fallbacks.find(f => f.key === 'helmet' && f.reason !== 'not set').reason, /^its mount carries the plume out of range: the plume's parts\[0\]\.shapes\[4\]\.p\[1\]: .* reaches -517 at its least/);
});

// ---- Polygons, and dir "frame" everywhere ---------------------------------------------------------------

test('a polygon may not repeat a point, which would hide a reflex angle', () => {
  const at = pts => p => { tab(p)[0] = { k: 'poly', dir: 'rows', pts, fill: '@base.k' }; };
  rejected(at([[0, -24], [24, -16], [16, 8], [8, -8], [-24, -24]]), 'rules', TAB + '[0].pts: must be a convex polygon, its points in order');
  rejected(at([[0, -24], [24, -16], [16, 8], [8, -8], [8, -8], [-24, -24]]), 'rules', TAB + '[0].pts[4]: is the same point as the one before it');
  rejected(at([[0, 0], [20, 0], [20, 20], [0, 0]]), 'rules', TAB + '[0].pts[0]: is the same point as the one before it');
  rejected(at([[0, 0], [20, 0], [10, 0], [10, 10]]), 'rules', TAB + '[0].pts: must be a convex polygon, its points in order');
  accepted(at([[0, 0], [10, 0], [20, 0], [20, 20], [0, 20]]));
});

test('dir "frame" is refused in a rest view and in a decoration, as in any part but a main item\'s', () => {
  const tri = { k: 'poly', dir: 'frame', pts: [[0, 0], [20, 0], [0, 20]], fill: '@base.k' };
  rejected(p => { helm(p).rest.shapes[0] = tri; }, 'references', 'pack.items["helm.open"].rest.shapes[0].dir: "frame" is allowed only in a part of a main item');
  rejected(p => { lantern(p).shapes[0] = tri; }, 'references', 'pack.decorations.lantern.shapes[0].dir: "frame" is allowed only in a part of a main item');
  rejected(p => { p.items['hair.long'].views.helmeted[0].shapes[0].dir = 'frame'; }, 'references', 'pack.items["hair.long"].views.helmeted[0].shapes[0].dir: "frame" is allowed only in a part of a main item');
});

// ---- The minor findings ---------------------------------------------------------------------------------

test('keyframes stay finite and colours well formed for any t', () => {
  const one = load(edited(p => { const a = lantern(p).anim; a.period = 0.2; a.tracks[2].keys = [[0.5, '#fff3a0']]; })).decorations.lantern;
  const two = load(edited(p => { lantern(p).anim.period = 0.2; })).decorations.lantern;
  for (const d of [one, two]) for (const t of [1e3, 1e15, 1e300, 1e308, Number.MAX_VALUE, -1e308, NaN, Infinity, -Infinity, 0.1]) {
    const out = PK.animate(d, t);
    assert.ok(Number.isFinite(out.groups.flame.dy) && (out.groups.flame.show === 0 || out.groups.flame.show === 1), String(t));
    assert.match(out.pal['lantern.glass'], /^#[0-9a-f]{6}$/, String(t));
  }
});

test('read never throws, even when the options are a revoked proxy', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const r = PK.read(envText(BASE()), proxy);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'the pack could not be checked');
  assert.equal(PK.read(proxy, OPTS).step, 'size');
});

test('a reason is cut to 300 characters, and text from the pack in it to 40', () => {
  const p = BASE();
  p['<img src=x onerror=alert(1)>' + 'A'.repeat(400000)] = 1;
  const r = PK.read(JSON.stringify({ kwpack: 1, pack: p }), { allowUnsigned: true });
  assert.equal(r.reason, 'pack["<img src=x onerror=alert(1)>AAAAAAAAA..."]: is not a field here');
  const long = 'x'.repeat(200);
  const q = load(edited(p => { p.builds['build.a'].head = 'h' + long.slice(0, 47); }));
  assert.equal(q.reason, 'pack.builds["build.a"].head: names an item, "' + ('h' + long).slice(0, 37) + '...", that the pack does not have');
  // the reason as a whole never runs past 300, whatever the pack holds
  const many = load(edited(p => { p.decorations[long.slice(0, 48)] = { name: 'Wide', fits: ['wall' + long] }; }));
  assert.equal(many.reason, 'pack.decorations["' + long.slice(0, 37) + '..."].box: is missing');
  assert.ok(many.reason.length <= PK.LIMITS.reason && PK.LIMITS.reason === 300 && PK.LIMITS.quote === 40);
});

test('canonical refuses anything but plain JSON values', () => {
  for (const v of [new Map([['a', 1]]), new Set([1]), new Date(0), /x/, new Uint8Array(2), [new Map()], { a: new Date(0) }]) assert.throws(() => PK.canonical(v), TypeError);
  assert.equal(PK.canonical(Object.assign(Object.create(null), { b: 1, a: [null, false] })), '{"a":[null,false],"b":1}');
  assert.equal(PK.canonical(vm.runInNewContext('({ z: 1, y: [2] })')), '{"y":[2],"z":1}');
});

test('the face check: a clip that cuts the top of the face box is refused', () => {
  rejected(p => { opening(p).clip = [-10, null]; }, 'rules', /^pack\.items\["helm\.open"\]\.parts: a helmet needs a shape filled with @skin\.face/);
  accepted(p => { opening(p).clip = [-20, 20]; });
});

test('looks naming what every object has fall back cleanly', () => {
  const lib = library();
  for (const n of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']) {
    const look = { build: 'kw.base/' + n, items: {}, swatches: {} };
    for (const s of ['back', 'legs', 'boots', 'torso', 'hair', 'plume', 'helmet', 'pauldrons', 'arms', 'gauntlets', 'main', 'off']) look.items[s] = 'kw.base/' + n;
    for (const s of ['skin', 'hair', 'tabard', 'plume']) look.swatches[s] = 'kw.base/' + n;
    for (const pk of ['kw.base', n]) {
      const named = JSON.parse(JSON.stringify(look).split('kw.base/').join(pk + '/'));
      let L;
      assert.doesNotThrow(() => { L = PK.resolve(lib, named); }, n);
      assert.equal(L.ok, true);
      assert.deepEqual(L.look, baseLook().look);
      assert.equal(L.fallbacks.length, 1 + 10 + 4 + (pk === 'kw.base' ? 2 : 2));
      assert.ok(L.fallbacks.every(f => ['no such build', 'no such item', 'no such swatch', 'pack not loaded'].includes(f.reason)), JSON.stringify(L.fallbacks));
    }
  }
});

// ---- Values of the wrong type -------------------------------------------------------------------------

const WRONG_TYPES = [
  ['a helmet\'s mounts that are not an object', p => { helm(p).mounts = 5; }, 'pack.items["helm.open"].mounts: must be an object'],
  ['palettes that are an array', p => { p.palettes = []; }, 'pack.palettes: must be an object'],
  ['a name that is a number', p => { p.name = 5; }, 'pack.name: must be a string'],
  ['a length that is a string', p => { tab(p)[0].w = 'x'; }, TAB + '[0].w: must be a number or a term object'],
  ['a point that is a number', p => { tab(p)[0].p = 5; }, TAB + '[0].p: must be a point'],
  ['an anchored point whose anchor is a number', p => { p.items['arms.plate'].parts[0].shapes[0].p1.at = 5; }, 'pack.items["arms.plate"].parts[0].shapes[0].p1.at: must be an anchor name'],
  ['a hold point that is a number', p => { p.items['off.round'].hold = 5; }, 'pack.items["off.round"].hold: must be a pair [x, y]'],
  ['a fill that is a number', p => { tab(p)[0].fill = 5; }, TAB + '[0].fill: must be a colour'],
  ['a translucent colour whose rgb is a number', p => { tab(p)[0].fill = { rgb: 5, a: 1 }; }, TAB + '[0].fill.rgb: must be a hex colour'],
  ['a decoration box that is a number', p => { lantern(p).box = 5; }, 'pack.decorations.lantern.box: must be [w, h]'],
  ['a shape that is a number', p => { tab(p)[0] = 5; }, TAB + '[0]: must be an object'],
  ['a shape\'s anchor that is a number', p => { tab(p)[0].at = 5; }, TAB + '[0].at: must be an anchor name'],
  ['a pix key that is an array', p => { p.items['back.pennant'].parts[0].shapes[0].key = []; }, 'pack.items["back.pennant"].parts[0].shapes[0].key: must be an object'],
  ['a part\'s anchor that is a number', p => { p.items['torso.tabard'].parts[0].at = 5; }, 'pack.items["torso.tabard"].parts[0].at: must be an anchor name'],
  ['an item that is an array', p => { p.items['legs.plate'] = []; }, 'pack.items["legs.plate"]: must be an object'],
  ['a track that is a number', p => { lantern(p).anim.tracks[0] = 5; }, 'pack.decorations.lantern.anim.tracks[0]: must be an object'],
  ['a palette track naming a number', p => { lantern(p).anim.tracks[2].pal = 5; }, 'pack.decorations.lantern.anim.tracks[2].pal: must name a palette entry as "set.entry"'],
  ['a key that is a number', p => { lantern(p).anim.tracks[0].keys = [5]; }, 'pack.decorations.lantern.anim.tracks[0].keys[0]: must be a [time, value] pair']
];
for (const [name, edit, reason] of WRONG_TYPES) test('refused at fields, a value of the wrong type: ' + name, () => { rejected(edit, 'fields', reason); });

test('the envelope and the sig refuse values of the wrong type with their own reasons', () => {
  for (const t of ['[]', 'null', '42']) assert.equal(PK.read(t, OPTS).reason, 'the file must hold a JSON object, the envelope');
  const p = BASE(), good = sigOf(p);
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: Object.assign({}, good, { kid: 5 }) }).reason, 'sig.kid: must be a key id');
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: Object.assign({}, good, { value: good.value.slice(0, -4) }) }).reason, 'sig.value: must be 64 bytes in base64');
  assert.equal(readEnv({ kwpack: 1, pack: p, sig: Object.assign({}, good, { value: 5 }) }).reason, 'sig.value: must be 64 bytes in base64');
});
