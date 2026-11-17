// Tests for the foe player in web/js/engine.js and the goblin in web/js/props.js: the timing
// table, where a foe stands, and that the knight's blade, whichever weapon it is, meets the
// goblin's pot at the bonk and never passes through any part of it.
// Run with: node --test tests/web/
//
// The page's scripts run under Node as index.html loads them, into a sandbox whose document gives
// fake canvases. Each fake canvas keeps the rectangles filled in it, so a pose of the goblin,
// painted once into its own canvas, can be laid on the grid and checked against the blade.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');
const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js'];

function fakeCanvas() {
  const cv = { width: 0, height: 0, fills: [] };
  const ctx = new Proxy({}, { set() { return true; }, get(_, k) { return k === 'fillRect' ? (x, y, w, h) => cv.fills.push([x, y, w, h]) : () => {}; } });
  cv.getContext = () => ctx;
  return cv;
}

/* The arming sword and the heater shield, as main.js asks for them with the address's arm=one. */
const ONE = { look: { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } } };
/* The flanged mace and the round shield, a free item of the base pack 1.4.0 (arm=mace_and_shield). */
const MACE = { look: { items: { main: 'kw.base/main.mace', off: 'kw.base/off.round' } } };
/* The weapons the knight may hold at the bonk: the greatsword from the base pack and from code,
   and the arming sword and the mace with a shield, which only the base pack holds. */
const WEAPONS = [['the greatsword, from the base pack', true, null], ['the greatsword, from code', false, null], ['the arming sword', true, ONE], ['the flanged mace', true, MACE]];
/* The base pack's other builds, Broad (build.b) and Slim (build.c), with each weapon. The engine
   measures the blade on the build drawn, so the goblin is met where the drawn blade meets it. */
const BUILDS = { 'build.b': 'Broad', 'build.c': 'Slim' };
const BUILT = [];
for (const [b, name] of Object.entries(BUILDS)) {
  BUILT.push([`the greatsword, ${name}`, true, { look: { build: 'kw.base/' + b } }]);
  BUILT.push([`the arming sword, ${name}`, true, { look: { build: 'kw.base/' + b, items: ONE.look.items } }]);
  BUILT.push([`the flanged mace, ${name}`, true, { look: { build: 'kw.base/' + b, items: MACE.look.items } }]);
}

/* The page's scripts, with the knight drawn from the base pack (pack true) or from code, in the
   look opts asks for (the base pack's defaults when left out). */
function load(pack, opts) {
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() }, console: { info() {}, warn() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(pack ? KW.packText : [], true, opts || undefined);
  assert.equal(KW.knight.source, pack ? 'pack' : 'code');
  if (opts && opts.look.items) assert.equal(KW.knight.rest.key('main'), opts.look.items.main, 'the weapon asked for is held');
  if (opts && opts.look.build) assert.deepEqual(plain(KW.knight.status.fallbacks).filter(f => f.reason !== 'not set'), [], 'the build is drawn');
  KW.draw.setCtx(fakeCanvas().getContext('2d'));
  return { KW, E: KW.engine, F: KW.engine.foe, P: KW.props, K: KW.knight, V: KW.view };
}

const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };
const plain = o => JSON.parse(JSON.stringify(o));
const device = place => ({ place, kind: 'machine', ok: true, alert: false });
/* The knight's pose for the event at el, placed at kx as the engine places it. */
function pose(K, V, kx, el) { const o = K.pose('idle', 20000 + el); o.floor = V.HFL; o.x = kx; o.helmet = true; o.bob = 0; return o; }
function planFor(m, scene, kx, devices) {
  const sc = m.KW.scenes[scene];
  return m.F.plan('goblin', sc, { devices, places: sc.places }, pose(m.K, m.V, kx, 0));
}
/* Every spot the knight strolls to in a scene, and a few between them, in grid pixels. */
function spots(m, scene) {
  const xs = m.KW.scenes[scene].rounds.map(r => r.x * m.V.U);
  const lo = Math.min(...xs), hi = Math.max(...xs), out = new Set(xs);
  for (let x = lo; x <= hi; x += 30) out.add(x);
  return [...out].sort((a, b) => a - b);
}

test('the goblin is described as a foe, and its drawing matches the description', () => {
  const { P } = load(false), G = P.FOES.goblin;
  assert.deepEqual(plain(G.poses), ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit']);
  for (const k of ['pose', 'anchor', 'size', 'h', 'w', 'mid', 'crown']) assert.ok(k in G, k);
  const [ax, ay] = G.anchor;
  const stand = G.pose('stand');
  assert.equal(G.pose('stand'), stand, 'each pose is painted once');
  assert.equal(G.pose('no-such-pose'), stand, 'an unknown pose gives stand');
  for (const name of G.poses) {
    const f = G.pose(name).fills;
    assert.ok(f.length > 200, name + ' draws something');
    const top = Math.min(...f.map(r => r[1])), bottom = Math.max(...f.map(r => r[1] + r[3]));
    assert.ok(bottom <= ay + 1 && bottom >= ay - 1, `${name}: stands on its feet (${bottom})`);
    assert.ok(ay - top <= G.h + 2, `${name}: no taller than h (${ay - top})`);
    for (const [x, y, w, h] of f) assert.ok(x >= 0 && y >= 0 && x + w <= G.size[0] && y + h <= G.size[1], `${name}: inside its canvas`);
  }
  const s = stand.fills, top = Math.min(...s.map(r => r[1]));
  assert.ok(Math.abs(ay - top - G.h) <= 2, 'h is the standing height to the top of the pot');
  // the body at the hem is within w of its middle
  const hem = s.filter(r => r[1] <= ay - 40 && r[1] + r[3] > ay - 40);
  assert.ok(Math.min(...hem.map(r => r[0])) >= ax - G.w - 1 && Math.max(...hem.map(r => r[0] + r[2])) <= ax + G.w + 1);
});

test('the entrance runs in order, and the poof is over within the event, wherever the knight stands, with either weapon', () => {
  const m = load(true), { FOE } = m.F, N = FOE.enter, X = FOE.exits.poof, dur = m.E.EVENTS.goblin.dur;
  assert.equal(X.impact, FOE.strike.rebound, 'the burst on the pot lasts while the blade bounces off it, no longer');
  assert.equal(dur, 3400);
  assert.deepEqual(plain(m.E.EVENTS.goblin.where), ['battlement', 'camp']);
  assert.equal(m.E.EVENTS.goblin.foe, 'goblin'); assert.equal(m.E.EVENTS.goblin.exit, 'poof');
  const order = [N.rise, N.peek, N.hop, N.land, N.taunt];
  for (let i = 0; i < order.length; i++) { assert.ok(order[i][0] < order[i][1]); if (i) assert.equal(order[i][0], order[i - 1][1]); }
  assert.equal(N.brace, N.taunt[1]);
  assert.ok(N.open[0] < N.rise[0] && N.open[1] <= N.peek[0], 'the hole is open before the foe is out');
  assert.ok(X.cloud <= X.gone && X.gone < X.struck + X.cloud, 'the foe is hidden only once the cloud covers it');
  for (const mm of [m, load(true, ONE)]) for (const scene of ['battlement', 'camp']) for (const kx of spots(mm, scene)) {
    const pl = planFor(mm, scene, kx, [PIE]);
    assert.ok(pl, `${scene} ${kx}: there is room`);
    assert.ok(pl.q < 1, `${scene} ${kx}: the blade meets it`);
    assert.ok(pl.hit > N.brace + 100 && pl.hit < FOE.strike.at + FOE.strike.dur, `${scene} ${kx}: struck after it flinches (${pl.hit})`);
    assert.ok(pl.hit + X.cloud + m.P.CLOUD_MS <= dur, `${scene} ${kx}: the cloud is gone by the end`);
    assert.ok(pl.hit + X.sparkles + m.P.SPARKLE_MS <= dur, `${scene} ${kx}: the sparkles are gone by the end`);
    assert.ok(pl.hit + X.close[1] <= dur, `${scene} ${kx}: the hole is closed by the end`);
    assert.ok(pl.hit + FOE.strike.rebound + FOE.strike.recover <= dur, `${scene} ${kx}: the knight is back in the stance by the end`);
    const end = mm.F.at(dur - 1, pl);
    assert.equal(end.show, false); assert.equal(end.fx.length, 0, 'nothing left at the end');
    if (pl.burrow) assert.equal(end.hole, 0);
  }
});

test('where the goblin stands: in its zone, clear of the knight, the pie and every device on the ground', () => {
  const m = load(true), [gMin, , gMax] = m.F.FOE.gap;
  const sets = [[PIE], [PIE, device('g3')], [PIE, device('g1'), device('g2')], [PIE, device('g1'), device('g2'), device('g3')], [device('g1')]];
  const seen = { battlement: new Set(), camp: new Set() };
  for (const scene of ['battlement', 'camp']) {
    const sc = m.KW.scenes[scene];
    for (const devices of sets) for (const kx of spots(m, scene)) {
      const spot = m.F.spot(m.P.FOES.goblin, sc, devices, sc.places, kx);
      if (!spot) continue;
      seen[scene].add(devices.map(t => t.place).join() + '|' + kx);
      const d = Math.abs(spot.x - kx);
      assert.ok(d >= gMin && d <= gMax, `${scene} ${kx}: gap ${d}`);
      assert.equal(Math.sign(spot.x - kx), spot.side);
      assert.ok(sc.foeZone.spans.some(([a, b]) => spot.x >= a && spot.x <= b), `${scene} ${kx}: in the zone`);
      for (const dv of devices) {
        const pl = sc.places[dv.place];
        if (pl.cls !== 'pie' && pl.cls !== 'ground') continue;
        assert.ok(spot.x + 40 <= pl.x - pl.w / 2 || spot.x - 40 >= pl.x + pl.w / 2, `${scene} ${kx}: clear of ${dv.place}`);
      }
    }
  }
  // the usual case, the pie alone: room at every spot the knight strolls to
  for (const scene of ['battlement', 'camp']) for (const r of m.KW.scenes[scene].rounds) assert.ok(seen[scene].has('pie|' + r.x * m.V.U), `${scene} ${r.x}`);
  const camp = m.KW.scenes.camp, bat = m.KW.scenes.battlement, G = m.P.FOES.goblin;
  // left of the knight in both, in the clear stretch the crate lands on too: on the battlement from
  // 290, clear of the cat's merlon, at the camp from 324, clear of the whole class box of g2
  assert.deepEqual(plain(m.F.spot(G, bat, [PIE], bat.places, 460)), { x: 290, side: -1 });
  assert.deepEqual(plain(m.F.spot(G, bat, [PIE, device('g1')], bat.places, 480)), { x: 290, side: -1 });
  assert.deepEqual(plain(m.F.spot(G, camp, [PIE], camp.places, 520)), { x: 324, side: -1 });
  assert.deepEqual(plain(m.F.spot(G, camp, [PIE, device('g2')], camp.places, 520)), { x: 324, side: -1 }, 'beside the device in g2, clear of its class box');
  assert.equal(m.F.spot(G, camp, [PIE], camp.places, 760), null, 'no room: the goblin does not come');
  assert.equal(m.F.spot(G, m.KW.scenes.house, [PIE], m.KW.scenes.house.places, 480), null, 'a scene without foeZone hosts no foe');
});

/* The fills of the goblin's sprite at el, laid on the grid as the engine blits them, as points to
   test: the middles of the corner pixels and the middle of each filled rectangle. */
function foePoints(m, pl, el) {
  const st = m.F.at(el, pl);
  if (!st.show) return [];
  const G = pl.F, [ax, ay] = G.anchor, fl = st.face > 0 ? -1 : 1, pts = [];
  for (const [x, y, w, h] of G.pose(st.pose).fills) {
    // the middles of the corner pixels, and of the rectangle
    for (const [px, py] of [[x + .5, y + .5], [x + w - .5, y + .5], [x + .5, y + h - .5], [x + w - .5, y + h - .5], [x + w / 2, y + h / 2]]) {
      // clipped behind the wall while it climbs: only what shows above the line counts
      const gx = Math.round(st.x) + (px - ax) * fl * st.sx, gy = Math.round(st.y) + (py - ay) * st.sy;
      if (st.behind && gy > pl.lineAt(Math.round(gx))) continue;
      pts.push([gx, gy]);
    }
  }
  return pts;
}
/* How deep the point lies inside the blade's outline, in pixels; 0 or below is outside. A point
   beyond either end of the blade counts 0, or -Infinity when far is set. */
function depth(bl, x, y, far) {
  const sx = Math.sin(bl.a), sy = -Math.cos(bl.a), px = x - bl.x, py = y - bl.y, along = px * sx + py * sy, across = Math.abs(px * sy - py * sx);
  return along < bl.from || along > bl.to ? (far ? -Infinity : 0) : bl.half - across;
}
/* The drawn outline of a main item, read from the base pack's own shapes rather than from the
   engine: the pieces its dark outline (@base.k) is drawn as, in frame units, each a circle
   { c: [s, p], r } or a convex polygon { pts: [[s, p], ...] } (a strip is its four corners). */
const BASE = JSON.parse(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8')).pack;
function drawnOutline(item) {
  const out = [], at = q => [q.s, q.p];
  for (const sh of BASE.items[item].parts[0].shapes) {
    if (sh.fill !== '@base.k') continue;
    if (sh.k === 'ell') { assert.equal(sh.rx, sh.ry); out.push({ c: at(sh.p), r: sh.rx }); }
    else if (sh.k === 'poly') out.push({ pts: sh.pts.map(at) });
    else if (sh.k === 'strip') {
      const a = at(sh.p0), b = at(sh.p1), n = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [-(b[1] - a[1]) / n, (b[0] - a[0]) / n];
      out.push({ pts: [[a[0] - u[0] * sh.hw0, a[1] - u[1] * sh.hw0], [b[0] - u[0] * sh.hw1, b[1] - u[1] * sh.hw1], [b[0] + u[0] * sh.hw1, b[1] + u[1] * sh.hw1], [a[0] + u[0] * sh.hw0, a[1] + u[1] * sh.hw0]] });
    } else assert.fail(`${item}: a ${sh.k} in the outline`);
  }
  return out;
}
/* How deep the point (s, p) lies inside a piece, in pixels; below 0 it is outside, by that much. */
function pieceDepth(pc, s, p) {
  if (pc.c) return pc.r - Math.hypot(s - pc.c[0], p - pc.c[1]);
  const q = pc.pts;
  let pos = 0, neg = 0, d = Infinity;
  for (let i = 0; i < q.length; i++) {
    const [as, ap] = q[i], [bs, bp] = q[(i + 1) % q.length], es = bs - as, ep = bp - ap;
    const cr = es * (p - ap) - ep * (s - as), t = Math.max(0, Math.min(1, ((s - as) * es + (p - ap) * ep) / (es * es + ep * ep)));
    if (cr > 0) pos++; else if (cr < 0) neg++;
    d = Math.min(d, Math.hypot(s - as - t * es, p - ap - t * ep));
  }
  return pos && neg ? -d : d;
}
/* The mace's head is not a blade: its flanges reach 27 across its frame where its blade's outline
   gives 20, its knob reaches 151 along it, past the outline's 143, and its haft is 7 across, not
   20. So the mace is measured by its drawn outline, from where the blade's outline starts (3 short
   of the blade), and the swords by their blade's outline, which holds each drawn blade.
   The swords are held off every drawn pixel of the goblin through the whole strike. The mace is
   held off the goblin's planned outline, its crown, placed as the goblin is drawn at each moment,
   up to and including the hit: the plan's own measure. Its head meets the goblin where the swords
   never do, by the near ear at the camp beside a device in g3, where the hit pose flings the near
   hand above the crown and the bounce brings the flanges back across the ear's point, so the
   drawn goblin and the bounce are not part of its check. */
const DRAWN = { 'kw.base/main.mace': drawnOutline('main.mace') };
/* The goblin's crown at el, laid on the grid as the goblin is drawn (its spot, side, squash and
   the line it is clipped to while it climbs), as points to test; none once it is hidden. */
function crownPoints(m, pl, el) {
  const st = m.F.at(el, pl);
  if (!st.show) return [];
  const pts = [];
  for (const [cx, cy] of pl.F.crown) {
    const gx = Math.round(st.x) + pl.side * cx * st.sx, gy = Math.round(st.y) + cy * st.sy;
    if (st.behind && gy > pl.lineAt(Math.round(gx))) continue;
    pts.push([gx, gy]);
  }
  return pts;
}
function depthFor(opts) {
  const pieces = opts && opts.look.items && DRAWN[opts.look.items.main];
  if (!pieces) return depth;
  return (bl, x, y, far) => {
    const sx = Math.sin(bl.a), sy = -Math.cos(bl.a), px = x - bl.x, py = y - bl.y, s = px * sx + py * sy, p = px * Math.cos(bl.a) + py * Math.sin(bl.a);
    if (s < bl.from) return far ? -Infinity : 0;
    let d = -Infinity; for (const pc of pieces) d = Math.max(d, pieceDepth(pc, s, p));
    return d;
  };
}

for (const [name, pack, opts] of WEAPONS.concat(BUILT)) {
  test(`the blade meets the goblin's pot at the bonk and never passes through it (${name})`, () => {
    const m = load(pack, opts), S = m.F.FOE.strike, into = depthFor(opts), drawn = into !== depth;
    // what the blade is kept out of at el: the drawn goblin, or for the mace its crown until the hit
    const goblin = (pl, el) => (drawn ? (el <= pl.hit ? crownPoints(m, pl, el) : []) : foePoints(m, pl, el));
    let plans = 0;
    for (const scene of ['battlement', 'camp']) for (const kx of spots(m, scene)) for (const devices of [[PIE], [PIE, device('g3')]]) {
      const pl = planFor(m, scene, kx, devices);
      if (devices.length === 1) assert.ok(pl, `${scene} knight ${kx}: the goblin comes with the pie alone`);
      if (!pl) continue;
      plans++;
      // the goblin stands within the reach the weapon gives on its side
      const g = m.F.gaps(pl.F, pose(m.K, m.V, kx, 0), pl.side), d = Math.abs(pl.x - kx);
      assert.ok(g && d >= g[0] && d <= g[2], `${scene} knight ${kx}: gap ${d} within the weapon's reach ${g}`);
      // the hit pose plays from the hit, and the blade touches the drawn goblin there: within 3
      // pixels of its crown, and within 3 pixels of a filled pixel of the sprite itself
      assert.equal(m.F.at(pl.hit - 1, pl).pose, 'brace'); assert.equal(m.F.at(pl.hit, pl).pose, 'hit');
      const oh = pose(m.K, m.V, kx, pl.hit); m.F.strike(oh, pl.hit, pl);
      const bh = m.F.bladeOf(oh), gapAtHit = m.F.bladeGap(bh, pl.F, pl.x, pl.side, m.V.HFL);
      assert.ok(Math.abs(gapAtHit) < 3, `${scene} knight ${kx}: the blade meets the crown at the hit (${gapAtHit.toFixed(1)})`);
      let touch = -Infinity; for (const [x, y] of foePoints(m, pl, pl.hit - 1)) touch = Math.max(touch, into(bh, x, y, true));
      assert.ok(touch >= -3, `${scene} knight ${kx}: the blade is ${(-touch).toFixed(1)} px from the drawn goblin at the hit`);
      let closest = Infinity;
      const times = []; for (let el = S.at; el <= pl.hit + S.rebound + S.recover; el += 8) times.push(el);
      times.push(pl.hit, pl.hit - 1, pl.hit + 1);
      for (const el of times) {
        const o = pose(m.K, m.V, kx, el);
        m.F.strike(o, el, pl);
        const bl = m.F.bladeOf(o);
        let worst = -Infinity;
        for (const [x, y] of goblin(pl, el)) worst = Math.max(worst, into(bl, x, y));
        // the two outlines may touch, by up to 2 pixels, and no more
        assert.ok(worst <= 2, `${scene} knight ${kx} at ${el} ms: the blade is ${worst.toFixed(1)} px into the goblin${drawn ? '\'s crown' : ''}`);
        if (el <= pl.hit) closest = Math.min(closest, m.F.bladeGap(bl, pl.F, pl.x, pl.side, m.V.HFL));
      }
      assert.ok(closest <= 3, `${scene} knight ${kx}: the blade reaches the pot (${closest.toFixed(1)} px short)`);
    }
    assert.ok(plans > 10);
  });
}

/* The hit at the knight's first spot in each scene, the pie alone, in ms from the start of the
   event, for each grip on Classic, Broad and Slim, and for the mace, held in one hand as the arming
   sword is but met by its drawn head. The poses are the present knight's, raised and lowered with
   each build's shoulders, so the hit moves by a few ms at most. */
const HITS = {
  two: { battlement: [1657, 1659, 1656], camp: [1661, 1663, 1659] },
  one: { battlement: [1697, 1705, 1691], camp: [1707, 1709, 1706] },
  mace: { battlement: [1698, 1709, 1684], camp: [1706, 1710, 1703] } };

test('on every build, with each weapon, the goblin comes wherever it does on Classic, and is struck within a few ms of Classic\'s hit', () => {
  // The mace is struck within 16 ms of Classic's hit rather than 12: it meets the goblin at the end
  // of its reach, by the near ear, and each build's shoulder line changes which point of a flange
  // meets it first (14 ms at most, Slim on the battlement).
  const ITEMS = { one: ONE.look.items, mace: MACE.look.items };
  for (const grip of ['two', 'one', 'mace']) {
    const looks = ['build.a', 'build.b', 'build.c'].map(b => ({ look: Object.assign({ build: 'kw.base/' + b }, ITEMS[grip] ? { items: ITEMS[grip] } : {}) }));
    const [a, ...others] = looks.map(o => load(true, o));
    for (const [scene, kx0] of [['battlement', 460], ['camp', 520]]) {
      const got = [a, ...others].map(m => planFor(m, scene, kx0, [PIE]).hit);
      assert.deepEqual(got, HITS[grip][scene], `${grip} ${scene}`);
      for (const kx of spots(a, scene)) for (const devices of [[PIE], [PIE, device('g3')]]) {
        const pa = planFor(a, scene, kx, devices);
        others.forEach((m, i) => {
          const p = planFor(m, scene, kx, devices), what = `${grip} ${looks[i + 1].look.build} ${scene} ${kx} ${devices.length}`;
          assert.equal(!!p, !!pa, what + ': the goblin comes where it does on Classic');
          if (!p) return;
          assert.deepEqual([p.x, p.side], [pa.x, pa.side], what + ': where it stands');
          assert.ok(Math.abs(p.hit - pa.hit) <= (grip === 'mace' ? 16 : 12), what + `: struck at ${p.hit} ms, ${pa.hit} on Classic`);
        });
      }
    }
  }
});

test('the blade the engine measures is the blade drawn: KW.knight.rig takes the look\'s build', () => {
  for (const [b, name] of Object.entries(BUILDS)) for (const items of [undefined, ONE.look.items]) {
    const m = load(true, { look: { build: 'kw.base/' + b, items } }), M = m.K.basePack().builds[b].m;
    for (const q of [0, 0.3, 0.45, 0.55]) for (const dir of [1, -1]) {
      const o = pose(m.K, m.V, 480, 0); m.K.swing(o, q, dir);
      const bl = m.F.bladeOf(o), drawn = plain(m.K.rig(o, M).anchors.main), present = plain(m.K.rig(o, m.K.build).anchors.main);
      assert.deepEqual([bl.x, bl.y, bl.a], drawn, `${name} q${q} dir ${dir}`);
      // the grip rises and sinks with the build's shoulder line, the present knight's being 132
      assert.deepEqual([drawn[0], drawn[1] - present[1], drawn[2]], [present[0], 132 - M.height, present[2]], `${name} q${q} dir ${dir}`);
    }
  }
  // on the code path the rig is the present knight's
  const c = load(false), o = pose(c.K, c.V, 480, 0);
  assert.deepEqual(plain(c.K.rig(o).anchors.main), plain(c.K.rig(o, c.K.build).anchors.main));
});

test('a weapon too short to reach a goblin anywhere in the zone: the goblin does not come, and never plays a hit', () => {
  // held in both hands, where the grip stays close to the knight
  for (const [, pack, opts] of WEAPONS.filter(w => !w[2])) {
    const m = load(pack, opts), full = m.K.rest.blade();
    // a dagger, its blade barely longer than its grip
    m.K.rest.blade = () => ({ from: 34, to: 40, half: 8 });
    const o = pose(m.K, m.V, 480, 0);
    assert.equal(m.F.gaps(m.P.FOES.goblin, o, 1), null); assert.equal(m.F.gaps(m.P.FOES.goblin, o, -1), null);
    for (const scene of ['battlement', 'camp']) for (const kx of spots(m, scene)) assert.equal(planFor(m, scene, kx, [PIE]), null, `${scene} ${kx}`);
    m.K.rest.blade = () => full;
  }
});

test('the greatsword keeps the gaps of the table, and the arming sword and the mace have their own, worked out from their reach', () => {
  for (const [, pack, opts] of WEAPONS) {
    const m = load(pack, opts), G = m.P.FOES.goblin, o = pose(m.K, m.V, 480, 0);
    for (const side of [1, -1]) {
      const g = plain(m.F.gaps(G, o, side));
      if (!opts) assert.deepEqual(g, plain(m.F.FOE.gap), `side ${side}`);
      assert.ok(g[0] <= g[1] && g[1] <= g[2] && g[2] <= m.F.FOE.gap[2]);
      // the most is the furthest the blade reaches: one pixel further and it misses
      if (g[2] < m.F.FOE.gap[2]) assert.equal(m.F.contactQ(G, 480 + side * (g[2] + 1), side, o), 1);
      assert.ok(m.F.contactQ(G, 480 + side * g[2], side, o) < 1);
    }
  }
});

test('the knight glares from 500 ms, strikes towards the goblin and is pleased once it has gone', () => {
  const m = load(true), pl = planFor(m, 'camp', 520, [PIE]);
  assert.equal(pl.side, -1);
  const o = pose(m.K, m.V, 520, 1400); m.F.strike(o, 1400, pl);
  assert.ok(o.wang > m.K.pose('idle', 0).wang, 'winding up over the right shoulder to cut to the left');
  const back = pose(m.K, m.V, 520, 3000), base = { gx: back.gx, gy: back.gy, wang: back.wang };
  m.F.strike(back, 3000, pl);
  assert.deepEqual({ gx: back.gx, gy: back.gy, wang: back.wang }, base, 'back in the stance');
  assert.ok(pl.hit + pl.exit.pleased < 3400);
});
