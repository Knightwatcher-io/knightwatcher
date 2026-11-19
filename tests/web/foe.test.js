// Tests for the foe player in web/js/engine.js and the goblin in web/js/props.js: the timing
// table, where a foe stands, and that the knight's weapon, whichever it is, meets the goblin at the
// bonk and never passes through any part of it, the bounce included.
// Run with: node --test tests/web/
//
// The page's scripts run under Node as index.html loads them, into a sandbox whose document gives
// fake canvases. Each fake canvas keeps the rectangles filled in it, so a pose of the goblin,
// painted once into its own canvas, can be laid on the grid. The weapon against the goblin is
// measured by tools/contact-sweep/lib.js, which loads the scripts the same way and records the
// knight's drawing too.
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
/* The longsword, a free item of the base pack 1.4.0, in both hands (arm=longsword). */
const LONG = { look: { items: { main: 'kw.base/main.longsword' } } };
/* The weapons the knight may hold at the bonk: the greatsword from the base pack and from code,
   and the arming sword and the mace with a shield and the longsword, which only the base pack holds. */
const WEAPONS = [['the greatsword, from the base pack', true, null], ['the greatsword, from code', false, null], ['the arming sword', true, ONE], ['the longsword', true, LONG],
  ['the flanged mace', true, MACE]];
/* The base pack's other builds, Broad (build.b) and Slim (build.c). The engine measures the blade
   on the build drawn, so the goblin is met where the drawn blade meets it. */
const BUILDS = { 'build.b': 'Broad', 'build.c': 'Slim' };

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

/* The contact standard (docs/tests.md, The contact standard): the whole drawn weapon against every
   drawn pixel of the goblin, through the whole strike, the bounce included, never more than 2 px in,
   and at the hit no more than 3 px from the goblin as drawn then, on every build. It is measured
   from the page's own drawing by tools/contact-sweep, whose sweep checks it at every spot the knight
   strolls over; here it is checked at the spots the knight strolls to, every 30 between, and the
   spots the sweep found hardest: where the greatsword's quillon came nearest the flung hand in the
   bounce (440 to 453 on the battlement), the mace's flanges the hand at the hit (443 to 475, and
   490 to 509 at the camp), and the arming sword's point (the far spots, 474 to 480 and 508 to 520). */
const CONTACT_LIB = require('../../tools/contact-sweep/lib.js');
const { measurePlan } = require('../../tools/contact-sweep/measure.js');
const HARD = { battlement: [445, 448, 451, 453, 455, 459, 464, 467, 471, 474, 475, 479], camp: [493, 497, 501, 508, 513, 518] };
/* Each swung weapon on each build, and the code path's greatsword: [name, weapon, build, pack]. */
const CONTACT = [];
for (const [b, bn] of [['a', 'Classic'], ['b', 'Broad'], ['c', 'Slim']]) {
  for (const [w, wn] of [['great', 'the greatsword'], ['arming', 'the arming sword'], ['long', 'the longsword'], ['mace', 'the flanged mace']]) CONTACT.push([`${wn}, ${bn}`, w, b, true]);
}
CONTACT.push(['the greatsword, from code', 'great', 'a', false]);

for (const [name, weapon, build, pack] of CONTACT) {
  test(`the whole drawn weapon meets the drawn goblin at the hit and never goes more than 2 px into it, the bounce included (${name})`, () => {
    const C = CONTACT_LIB, m = C.load({ from: 'code', pack, build, weapon }), fb = C.frameBox(m), X = m.F.FOE.exits.poof;
    let plans = 0;
    for (const scene of ['battlement', 'camp']) for (const kx of [...new Set(C.testSpots(m, scene).concat(HARD[scene]))]) {
      const seen = new Set();
      for (const devices of [[PIE], [PIE, device('g3')]]) {
        const pl = C.planFor(m, scene, kx, devices), at = `${scene} knight ${kx}${devices.length > 1 ? ' beside g3' : ''}`;
        if (devices.length === 1) assert.ok(pl, `${at}: the goblin comes with the pie alone`);
        if (!pl || seen.has([pl.x, pl.side, pl.hit].join())) continue;
        seen.add([pl.x, pl.side, pl.hit].join()); plans++;
        // the goblin stands within the reach the weapon gives on its side
        const g = m.F.gaps(pl.F, C.pose(m, kx, 0), pl.side), d = Math.abs(pl.x - kx);
        assert.ok(g && d >= g[0] && d <= g[2], `${at}: gap ${d} within the weapon's reach ${g}`);
        // the plan's own measure: the blade, or the mace's drawn head, touches the crown at the hit
        const oh = C.pose(m, kx, pl.hit); m.F.strike(oh, pl.hit, pl);
        const gapAtHit = m.F.bladeGap(m.F.bladeOf(oh), pl.F, pl.x, pl.side, m.V.HFL);
        assert.ok(Math.abs(gapAtHit) < 3, `${at}: the blade meets the crown at the hit (${gapAtHit.toFixed(1)})`);
        // the goblin holds its brace for the first ms of the hit, then flings into its hit pose
        assert.equal(m.F.at(pl.hit, pl).pose, 'brace'); assert.equal(m.F.at(pl.hit + X.hitPose, pl).pose, 'hit');
        // and the drawn weapon against the drawn goblin
        const r = measurePlan(m, kx, pl, fb, 8), w = r.worst;
        assert.equal(r.over2, null, `${at}: the weapon is ${w && w.depth} px into the goblin at ${w && w.el} ms (hit ${pl.hit}), at (${w && w.glocal}) on the goblin's ${w && w.pose} pose, (${w && w.wlocal}) on the weapon`);
        assert.ok(r.gap <= 3, `${at}: the weapon is ${r.gap} px from the goblin at the hit (${pl.hit} ms), at (${r.gapAt && r.gapAt.glocal}) on its ${r.gapAt && r.gapAt.pose} pose`);
      }
    }
    assert.ok(plans >= 20, `${plans} plans`);
  });
}

/* The hit at the knight's first spot in each scene, the pie alone, in ms from the start of the
   event, for each weapon on Classic, Broad and Slim: two is the greatsword, long the longsword, both
   in two hands; one the arming sword, which meets the goblin with its tapered point, and mace the
   mace, held in one hand as the arming sword is but met by its drawn head. The poses are the
   present knight's, raised and lowered with each build's shoulders, so the hit moves by a few ms. */
const HITS = {
  two: { battlement: [1657, 1659, 1656], camp: [1661, 1663, 1659] },
  long: { battlement: [1658, 1661, 1657], camp: [1662, 1664, 1660] },
  one: { battlement: [1703, 1707, 1699], camp: [1710, 1712, 1710] },
  mace: { battlement: [1698, 1709, 1684], camp: [1706, 1710, 1703] } };

test('on every build, with each weapon, the goblin comes wherever it does on Classic, and is struck within a few ms of Classic\'s hit', () => {
  // The mace is struck within 16 ms of Classic's hit rather than 12: it meets the goblin at the end
  // of its reach, and each build's shoulder line changes which point of a flange meets it first
  // (15 ms at most between these spots, Slim on the battlement and at the camp).
  const ITEMS = { one: ONE.look.items, long: LONG.look.items, mace: MACE.look.items };
  for (const grip of ['two', 'long', 'one', 'mace']) {
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

test('the band the engine measures a sword by ends at its drawn point: full width as far as the point starts, then tapering to the tip', () => {
  // where each sword's outline starts to taper and its tip, from the base pack's drawing, and the
  // code path's greatsword as swordHD draws it; the mace is measured by its head, and the crossbow
  // is not swung
  const want = [[true, null, { at: 236, to: 270 }], [false, null, { at: 236, to: 270 }], [true, ONE, { at: 150, to: 180 }], [true, LONG, { at: 198, to: 228 }],
    [true, MACE, null], [true, { look: { items: { main: 'kw.base/main.crossbow' } } }, null]];
  for (const [pack, opts, pt] of want) {
    const m = load(pack, opts), what = (opts ? opts.look.items.main : 'the greatsword') + (pack ? '' : ' from code');
    assert.deepEqual(plain(m.K.rest.point()), pt, what);
    if (!pt) continue;
    const o = pose(m.K, m.V, 480, 0), bl = m.F.bladeOf(o), b = m.K.rest.reach();
    assert.deepEqual([bl.from, bl.to, bl.half, bl.point], [b.from - 3, pt.to, b.half + 4, pt.at], what);
    // beside the band the gap is the distance across it; past where the point starts the edge
    // slants in, so a point at the band's full width is outside it, and the tip is on the outline
    assert.equal(m.F.bandGap(bl, pt.at, bl.half + 2), 2, what);
    assert.ok(m.F.bandGap(bl, (pt.at + pt.to) / 2, bl.half) > 0, what);
    assert.ok(Math.abs(m.F.bandGap(bl, (pt.at + pt.to) / 2, bl.half / 2)) < 1e-9, what);
    assert.ok(Math.abs(m.F.bandGap(bl, pt.to, 0)) < 1e-9, what);
  }
});

test('in the bounce a weapon in both hands lifts without rocking back, and one in one hand rocks back too', () => {
  const S = load(false).F.FOE.strike;
  for (const [opts, one] of [[null, false], [LONG, false], [ONE, true], [MACE, true]]) {
    const m = load(true, opts), what = opts ? opts.look.items.main : 'the greatsword';
    for (const [scene, kx] of [['battlement', 440], ['camp', 520]]) {
      const pl = planFor(m, scene, kx, [PIE]), at = el => { const o = pose(m.K, m.V, kx, el); m.F.strike(o, el, pl); return o; };
      const hit = at(pl.hit), end = at(pl.hit + S.rebound - 1), k = 1 - (1 - (S.rebound - 1) / S.rebound) ** 2;
      assert.ok(end.gy < hit.gy, `${what} ${scene}: the bounce lifts the blade`);
      if (one) assert.ok(Math.abs(end.wang - (hit.wang - pl.side * S.kick * k)) < 0.02, `${what} ${scene}: rocks back by kick`);
      else for (let r = 0; r < S.rebound; r += 10) assert.equal(at(pl.hit + r).wang, hit.wang, `${what} ${scene} +${r} ms: no rock back`);
    }
  }
});

test('struck by a blade the goblin holds its brace for the first 16 ms, squashed and with the burst from the hit; struck by a shot it flings at once', () => {
  const m = load(true), X = m.F.FOE.exits.poof, pl = planFor(m, 'battlement', 460, [PIE]);
  assert.equal(X.hitPose, 16);
  assert.equal(m.F.at(pl.hit - 1, pl).pose, 'brace');
  for (let r = 0; r < X.hitPose; r++) assert.equal(m.F.at(pl.hit + r, pl).pose, 'brace', `+${r} ms`);
  for (const r of [X.hitPose, X.hitPose + 1, X.gone - 1]) assert.equal(m.F.at(pl.hit + r, pl).pose, 'hit', `+${r} ms`);
  // the squash and the burst start at the hit itself
  const at1 = m.F.at(pl.hit + 1, pl);
  assert.ok(at1.sy < 1 && at1.sx > 1, 'squashed from the hit');
  assert.deepEqual(plain(m.F.at(pl.hit, pl).fx.map(f => f.kind)), ['impact']);
  assert.deepEqual(plain(m.F.at(pl.hit - 1, pl).fx), []);
  // the crossbow's bolt: no blade lands, so the hit pose plays from the hit
  const c = load(true, { look: { items: { main: 'kw.base/main.crossbow' } } }), ps = planFor(c, 'battlement', 460, [PIE]);
  assert.ok(ps.shot, 'the crossbow shoots');
  assert.notEqual(c.F.at(ps.hit - 1, ps).pose, 'hit'); assert.equal(c.F.at(ps.hit, ps).pose, 'hit');
});

test('a weapon too short to reach a goblin anywhere in the zone: the goblin does not come, and never plays a hit', () => {
  // held in both hands, where the grip stays close to the knight
  for (const [, pack, opts] of WEAPONS.filter(w => !w[2])) {
    const m = load(pack, opts), full = m.K.rest.reach(), point = m.K.rest.point();
    // a dagger, its blade barely longer than its grip: the engine measures the blade by its reach
    // and by its drawn point, so both are shortened
    m.K.rest.reach = () => ({ from: 34, to: 40, half: 8 });
    m.K.rest.point = () => ({ at: 40, to: 46 });
    const o = pose(m.K, m.V, 480, 0);
    assert.equal(m.F.bladeOf(o).to, 46);
    assert.equal(m.F.gaps(m.P.FOES.goblin, o, 1), null); assert.equal(m.F.gaps(m.P.FOES.goblin, o, -1), null);
    for (const scene of ['battlement', 'camp']) for (const kx of spots(m, scene)) assert.equal(planFor(m, scene, kx, [PIE]), null, `${scene} ${kx}`);
    m.K.rest.reach = () => full; m.K.rest.point = () => point;
  }
});

test('the greatsword keeps the gaps of the table, and the arming sword, the longsword and the mace have their own, worked out from their reach', () => {
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
