// The contact sweep's harness: the page's scripts loaded as the tests load them, the swung weapon's
// drawn pixels and the goblin's drawn pixels on the grid, and the depth and gap between them. Used
// by the sweep (sweep.js and the files beside it, run by tools/contact-sweep.sh) and by the contact
// checks of tests/web/foe.test.js and tests/web/world-scenes.test.js, so that both hold the same
// standard (docs/tests.md, The contact standard).
//
// The page's scripts run in a vm sandbox, as in tests/web/foe.test.js, with two additions:
//   - the knight is drawn into a recording context, and every fill made while the weapon is drawn
//     is tagged 'weapon' (pack path: the look's compiled main list, found through
//     KW.knight.rest.draw('main'); code path: KW.props.swordHD);
//   - the goblin is laid on the grid exactly as the engine blits it (translated to its rounded
//     spot, scaled by its facing and squash, nearest neighbour), every drawn pixel of its pose.
// Read-only on the checkout it sits in.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const PAGE = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'js/world.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js'];
const SRC = new Map(PAGE.map(f => [f, fs.readFileSync(path.join(WEB, f), 'utf8')]));
const PK = require(path.join(WEB, 'js/pack.js'));
const SIGN = require(path.join(ROOT, 'tools/sign-pack.js'));
/* The medieval world's pack with any signature taken off, as a 'dev' page reads it. */
const MEDIEVAL = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const BASE = JSON.parse(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8')).pack;
const plain = o => JSON.parse(JSON.stringify(o));

/* The weapons the settings offer, as the look's items: the greatsword is the base pack's default,
   and code is the greatsword on the code path. A swung weapon the base pack adds must be added
   here; sweep.js counts any main item with a blade that is missing as a fault. */
const ITEMS = {
  great: null,
  arming: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' },
  long: { main: 'kw.base/main.longsword' },
  mace: { main: 'kw.base/main.mace', off: 'kw.base/off.round' },
  crossbow: { main: 'kw.base/main.crossbow' },
};
const ITEM_OF = { great: 'main.greatsword', arming: 'main.arming', long: 'main.longsword', mace: 'main.mace', crossbow: 'main.crossbow' };
const BUILDS = { a: 'Classic', b: 'Broad', c: 'Slim' };

function fakeCanvas(rec) {
  const cv = { width: 0, height: 0, fills: [], cols: [] };
  let style = '#000';
  const ctx = new Proxy({}, {
    set(_, k, v) { if (k === 'fillStyle') style = v; return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { if (rec) rec(x, y, w, h, style); else { cv.fills.push([x, y, w, h]); cv.cols.push(style); } };
      return () => {};
    },
  });
  cv.getContext = () => ctx;
  return cv;
}

/* The page's scripts with the knight from the base pack (pack true) or from code, holding weapon
   on build, and the scenes and the cast compiled from the medieval world's pack (from 'pack') or
   the code's (from 'code'). */
function load({ from = 'pack', pack = true, build = 'a', weapon = 'great' } = {}) {
  const fills = []; let tag = 'knight';
  const main = fakeCanvas((x, y, w, h, c) => fills.push({ x, y, w, h, c, tag }));
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() }, console: { info() {}, warn() {} } });
  for (const f of PAGE) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(SRC.get(f), box, { filename: f });
  }
  const KW = box.window.KW, items = ITEMS[weapon];
  if (items === undefined) throw new Error('no such weapon: ' + weapon);
  const look = pack ? { look: Object.assign({ build: 'kw.base/build.' + build }, items ? { items } : {}) } : undefined;
  KW.knight.start(pack ? KW.packText : [], true, look);
  if (KW.knight.source !== (pack ? 'pack' : 'code')) throw new Error('the knight is drawn from ' + KW.knight.source);
  if (pack && items && KW.knight.rest.key('main') !== items.main) throw new Error('the weapon is not held: ' + KW.knight.rest.key('main'));
  if (pack) { const fb = plain(KW.knight.status.fallbacks).filter(f => f.reason !== 'not set'); if (fb.length) throw new Error('fallbacks ' + JSON.stringify(fb)); }
  if (from === 'pack') {
    const st = KW.world.start([MEDIEVAL], true);
    if (KW.world.cast.members['foe.goblin'] !== 'pack') throw new Error('the goblin is not the pack\'s: ' + st.note);
  }
  // tag the weapon's fills, and draw the weapon alone on a frame of our choosing
  let drawMain;
  if (pack) {
    const lib = KW.pack, orig = lib.draw;
    let mainList = null, learning = false;
    lib.draw = function (list, A, V, P, face) {
      if (learning) { mainList = list; return undefined; }
      if (list !== mainList) return orig.call(this, list, A, V, P, face);
      const was = tag; tag = 'weapon';
      try { return orig.call(this, list, A, V, P, face); } finally { tag = was; }
    };
    learning = true; KW.knight.rest.draw('main', 0, 0, 0); learning = false;
    if (!mainList) throw new Error('the weapon\'s list was not found');
    // what the knight's drawing draws for the main list: a swung weapon's shapes read only the main
    // anchor and the frame, never flipped unless aimed
    const A = lib.newAnchors(), Vs = lib.newValues(), MI = 2 * lib.ANCHOR.main;
    drawMain = mf => { A[MI] = mf[0]; A[MI + 1] = mf[1]; A[lib.FRAME_SX] = Math.sin(mf[2]); A[lib.FRAME_SY] = -Math.cos(mf[2]); A[lib.FRAME_FL] = 0; tag = 'weapon'; orig(mainList, A, Vs, KW.draw); tag = 'knight'; };
  } else {
    const P = KW.props, orig = P.swordHD;
    P.swordHD = function (...a) { const was = tag; tag = 'weapon'; try { return orig.apply(this, a); } finally { tag = was; } };
    drawMain = mf => { P.swordHD(mf[0], mf[1], mf[2]); };
  }
  KW.draw.setCtx(main.getContext('2d'));
  const m = { KW, E: KW.engine, F: KW.engine.foe, P: KW.props, K: KW.knight, V: KW.view, weapon, build: pack ? build : 'a', pack, from };
  /* Draws the knight in pose o and gives its fills, each { x, y, w, h, c, tag }. */
  m.drawKnight = o => { fills.length = 0; KW.knight.draw(o); return fills.slice(); };
  /* Draws the weapon alone on the frame [x, y, a] and gives its fills. */
  m.drawWeaponOn = mf => { fills.length = 0; drawMain(mf); return fills.slice(); };
  /* The weapon's drawn pixels in pose o (posed by the strike), with its frame. */
  m.weaponAt = o => { const mf = KW.knight.rig(o).anchors.main, r = rasterFills(m.drawWeaponOn(mf), 'weapon'); r.frame = mf; return r; };
  return m;
}

const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };
const device = place => ({ place, kind: 'machine', ok: true, alert: false });
/* The knight's pose for the event at el, placed at kx as the engine places it. */
function pose(m, kx, el) { const o = m.K.pose('idle', 20000 + el); o.floor = m.V.HFL; o.x = kx; o.helmet = true; o.bob = 0; return o; }
function planFor(m, scene, kx, devices) {
  const sc = m.KW.scenes[scene];
  return m.F.plan('goblin', sc, { devices, places: sc.places }, pose(m, kx, 0));
}
/* The spots the tests use: every stop of the scene's rounds and every 30 between. */
function testSpots(m, scene) {
  const xs = m.KW.scenes[scene].rounds.map(r => r.x * m.V.U);
  const lo = Math.min(...xs), hi = Math.max(...xs), out = new Set(xs);
  for (let x = lo; x <= hi; x += 30) out.add(x);
  return [...out].sort((a, b) => a - b);
}
/* Every whole pixel the knight may stand at on its patrol: from the scene's spot across its rounds. */
function walkSpots(m, scene) {
  const sc = m.KW.scenes[scene], xs = sc.rounds.map(r => r.x * m.V.U).concat([sc.spot * m.V.U]);
  const out = []; for (let x = Math.min(...xs); x <= Math.max(...xs); x++) out.push(x);
  return out;
}
/* Every combination of the pie and the ground places that hold a device. */
function deviceSets() {
  const out = [];
  for (let b = 0; b < 16; b++) {
    const d = [];
    if (b & 1) d.push(PIE);
    for (const [i, g] of [[2, 'g1'], [4, 'g2'], [8, 'g3']]) if (b & i) d.push(device(g));
    out.push(d);
  }
  return out;
}
const setName = d => (d.length ? d.map(t => t.place).join('+') : 'none');

/* ---- The goblin's pixels --------------------------------------------------------------------- */

/* A pose canvas as a bitmap: px[j * w + i] is 1 + the index of its colour in cols, 0 for clear. */
const SPRITES = new WeakMap();
function spriteOf(cv) {
  let s = SPRITES.get(cv);
  if (s) return s;
  const w = cv.width, h = cv.height, px = new Int32Array(w * h), cols = [], idx = new Map();
  for (let k = 0; k < cv.fills.length; k++) {
    const [x, y, fw, fh] = cv.fills[k], c = cv.cols[k];
    let ci = idx.get(c); if (ci === undefined) { ci = cols.length; cols.push(c); idx.set(c, ci); }
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(h, Math.floor(y + fh)); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(w, Math.floor(x + fw)); i++) px[j * w + i] = ci + 1;
  }
  s = { w, h, px, cols };
  SPRITES.set(cv, s);
  return s;
}
/* The goblin's drawn pixels on the grid at el, { x0, y0, w, h, px, sp, st, ... }, or null while it
   is hidden. As the engine draws it: translated to its rounded spot, scaled by its facing and
   squash, the pose canvas drawn from its anchor, clipped above lineAt while behind the line. */
function goblinAt(m, pl, el) {
  const st = m.F.at(el, pl);
  if (!st.show) return null;
  const G = pl.F, cv = G.pose(st.pose), sp = spriteOf(cv), [ax, ay] = G.anchor;
  const X = Math.round(st.x), Y = Math.round(st.y), fl = st.face > 0 ? -1 : 1, kx = fl * st.sx, ky = st.sy;
  const xa = X - ax * kx, xb = X + (sp.w - ax) * kx, ya = Y - ay * ky, yb = Y + (sp.h - ay) * ky;
  const x0 = Math.floor(Math.min(xa, xb)) - 1, x1 = Math.ceil(Math.max(xa, xb)) + 1, y0 = Math.floor(Math.min(ya, yb)) - 1, y1 = Math.ceil(Math.max(ya, yb)) + 1;
  const w = x1 - x0, h = y1 - y0, px = new Int32Array(w * h);
  for (let j = 0; j < h; j++) {
    const gy = y0 + j, v = Math.floor(ay + (gy + .5 - Y) / ky);
    if (v < 0 || v >= sp.h) continue;
    for (let i = 0; i < w; i++) {
      const gx = x0 + i;
      if (st.behind && gy >= pl.lineAt(gx)) continue;
      const u = Math.floor(ax + (gx + .5 - X) / kx);
      if (u < 0 || u >= sp.w) continue;
      const c = sp.px[v * sp.w + u];
      if (c) px[j * w + i] = c;
    }
  }
  return { x0, y0, w, h, px, sp, st, X, Y, kx, ky };
}
/* Where a grid pixel lies on the goblin as drawn facing left, from its feet, to a tenth. */
function goblinLocal(g, gx, gy) {
  return [Math.round(((gx + .5 - g.X) / g.kx) * 10) / 10, Math.round(((gy + .5 - g.Y) / g.ky) * 10) / 10];
}
/* Where a grid pixel lies on the weapon's frame [x, y, a]: s along it and p across, rounded. */
function weaponLocal(frame, x, y) {
  const [mx, my, a] = frame, SX = Math.sin(a), SY = -Math.cos(a), dx = x + .5 - mx, dy = y + .5 - my;
  return [Math.round(dx * SX + dy * SY), Math.round(dx * -SY + dy * SX)];
}

/* ---- The weapon's pixels --------------------------------------------------------------------- */

/* The pixels the fills cover (those tagged onlyTag, when given), as a bitmap { x0, y0, w, h, px }. */
function rasterFills(fills, onlyTag) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const fs2 = fills.filter(f => !onlyTag || f.tag === onlyTag);
  if (!fs2.length) return null;
  for (const f of fs2) { x0 = Math.min(x0, Math.floor(f.x)); y0 = Math.min(y0, Math.floor(f.y)); x1 = Math.max(x1, Math.floor(f.x + f.w)); y1 = Math.max(y1, Math.floor(f.y + f.h)); }
  const w = x1 - x0, h = y1 - y0, px = new Uint8Array(w * h);
  for (const f of fs2) for (let j = Math.floor(f.y) - y0; j < Math.floor(f.y + f.h) - y0; j++) for (let i = Math.floor(f.x) - x0; i < Math.floor(f.x + f.w) - x0; i++) px[j * w + i] = 1;
  return { x0, y0, w, h, px };
}
/* The weapon's extent on its own frame, s along it and p across it, from its drawing on an upright
   frame at 0, 0 (s is up the screen, p to the right), with 3 pixels to spare: for skipping the
   moments the weapon is nowhere near the goblin. */
function frameBox(m) {
  const r = rasterFills(m.drawWeaponOn([0, 0, 0]), 'weapon');
  return { s0: -(r.y0 + r.h) - 3, s1: -r.y0 + 3, p1: Math.max(-r.x0, r.x0 + r.w) + 3 };
}

/* ---- Contact --------------------------------------------------------------------------------- */

const at = (b, x, y) => (x >= b.x0 && y >= b.y0 && x < b.x0 + b.w && y < b.y0 + b.h ? b.px[(y - b.y0) * b.w + (x - b.x0)] : 0);
const RINGS = [];
/* The offsets at distance ring r (Chebyshev), made once. */
function ring(r) {
  if (!RINGS[r]) { const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) o.push([dx, dy, Math.hypot(dx, dy)]); RINGS[r] = o; }
  return RINGS[r];
}
/* How deep the grid pixel (x, y) lies in bitmap b: the distance from its centre to the centre of the
   nearest pixel b does not hold, so a pixel on the edge is 1 in. Searched to rMax. */
function depthIn(b, x, y, rMax = 40) {
  let best = Infinity;
  for (let r = 1; r <= rMax && r < best; r++) for (const [dx, dy, d] of ring(r)) if (d < best && !at(b, x + dx, y + dy)) best = d;
  return best === Infinity ? rMax : best;
}
/* Where the weapon and the goblin overlap: the depth of each pixel both draw is the larger of how
   far it lies inside the weapon and how far inside the goblin, so a blade edge lying 3 px over the
   goblin, a point stabbing 3 px in and a blade across a 3 px finger all read 3. Gives { n, depth,
   at: [x, y], dW, dG, pts } for the deepest pixel, or null when they do not overlap. */
function overlap(wp, g) {
  if (!g || !wp) return null;
  const x0 = Math.max(wp.x0, g.x0), y0 = Math.max(wp.y0, g.y0), x1 = Math.min(wp.x0 + wp.w, g.x0 + g.w), y1 = Math.min(wp.y0 + wp.h, g.y0 + g.h);
  const pts = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (at(wp, x, y) && at(g, x, y)) pts.push([x, y]);
  if (!pts.length) return null;
  let best = null;
  for (const [x, y] of pts) {
    const dW = depthIn(wp, x, y), dG = depthIn(g, x, y), d = Math.max(dW, dG);
    if (!best || d > best.depth) best = { depth: d, at: [x, y], dW, dG };
  }
  return Object.assign(best, { n: pts.length, pts });
}
/* The empty pixels between the weapon and the goblin: the least centre-to-centre distance between
   a pixel of each, less 1, so pixels side by side are 0 apart; 0 when they overlap. Gives { gap,
   w: [x, y], g: [x, y] }, the two nearest pixels. */
function gapBetween(wp, g) {
  if (!g || !wp) return { gap: Infinity };
  const edge = (b, x, y) => !at(b, x - 1, y) || !at(b, x + 1, y) || !at(b, x, y - 1) || !at(b, x, y + 1);
  const W = [], G = [];
  for (let j = 0; j < wp.h; j++) for (let i = 0; i < wp.w; i++) {
    const x = wp.x0 + i, y = wp.y0 + j;
    if (wp.px[j * wp.w + i] && edge(wp, x, y)) { if (at(g, x, y)) return { gap: 0, w: [x, y], g: [x, y] }; W.push([x, y]); }
  }
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const x = g.x0 + i, y = g.y0 + j; if (g.px[j * g.w + i] && edge(g, x, y)) G.push([x, y]); }
  let best = { gap: Infinity };
  for (const [ax, ay] of W) for (const [bx, by] of G) {
    const d = Math.hypot(ax - bx, ay - by) - 1;
    if (d < best.gap) best = { gap: d, w: [ax, ay], g: [bx, by] };
  }
  best.gap = Math.round(best.gap * 100) / 100;
  return best;
}

module.exports = { ROOT, WEB, PK, MEDIEVAL, BASE, ITEMS, ITEM_OF, BUILDS, plain, load, PIE, device, pose, planFor, testSpots, walkSpots, deviceSets, setName,
  fakeCanvas, spriteOf, goblinAt, goblinLocal, weaponLocal, rasterFills, frameBox, at, depthIn, overlap, gapBetween };
