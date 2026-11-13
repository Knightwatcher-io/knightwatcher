// Tests for the foe player in web/js/engine.js and the goblin in web/js/props.js: the timing
// table, where a foe stands, and that the knight's blade stops at the goblin's pot and never
// passes through any part of it.
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
const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js'];

function fakeCanvas() {
  const cv = { width: 0, height: 0, fills: [] };
  const ctx = new Proxy({}, { set() { return true; }, get(_, k) { return k === 'fillRect' ? (x, y, w, h) => cv.fills.push([x, y, w, h]) : () => {}; } });
  cv.getContext = () => ctx;
  return cv;
}

/* The page's scripts, with the knight drawn from the base pack (pack true) or from code. */
function load(pack) {
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() }, console: { info() {}, warn() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(pack ? KW.packText : [], true);
  assert.equal(KW.knight.source, pack ? 'pack' : 'code');
  KW.draw.setCtx(fakeCanvas().getContext('2d'));
  return { KW, E: KW.engine, F: KW.engine.foe, P: KW.props, K: KW.knight, V: KW.view };
}

const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };
const plain = o => JSON.parse(JSON.stringify(o));
const thing = place => ({ place, kind: 'machine', ok: true, alert: false });
/* The knight's pose for the event at el, placed at kx as the engine places it. */
function pose(K, V, kx, el) { const o = K.pose('idle', 20000 + el); o.floor = V.HFL; o.x = kx; o.helmet = true; o.bob = 0; return o; }
function planFor(m, scene, kx, things) {
  const sc = m.KW.scenes[scene];
  return m.F.plan('goblin', sc, { things, places: sc.places }, pose(m.K, m.V, kx, 0));
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

test('the entrance runs in order, and the poof is over within the event, wherever the knight stands', () => {
  const m = load(true), { FOE } = m.F, N = FOE.enter, X = FOE.exits.poof, dur = m.E.EVENTS.goblin.dur;
  assert.equal(dur, 3400);
  assert.deepEqual(plain(m.E.EVENTS.goblin.where), ['battlement', 'camp']);
  assert.equal(m.E.EVENTS.goblin.foe, 'goblin'); assert.equal(m.E.EVENTS.goblin.exit, 'poof');
  const order = [N.rise, N.peek, N.hop, N.land, N.taunt];
  for (let i = 0; i < order.length; i++) { assert.ok(order[i][0] < order[i][1]); if (i) assert.equal(order[i][0], order[i - 1][1]); }
  assert.equal(N.brace, N.taunt[1]);
  assert.ok(N.open[0] < N.rise[0] && N.open[1] <= N.peek[0], 'the hole is open before the foe is out');
  assert.ok(X.cloud <= X.gone && X.gone < X.struck + X.cloud, 'the foe is hidden only once the cloud covers it');
  for (const scene of ['battlement', 'camp']) for (const kx of spots(m, scene)) {
    const pl = planFor(m, scene, kx, [PIE]);
    assert.ok(pl, `${scene} ${kx}: there is room`);
    assert.ok(pl.q < 1, `${scene} ${kx}: the blade meets it`);
    assert.ok(pl.hit > N.brace + 100 && pl.hit < FOE.strike.at + FOE.strike.dur, `${scene} ${kx}: struck after it flinches (${pl.hit})`);
    assert.ok(pl.hit + X.cloud + m.P.CLOUD_MS <= dur, `${scene} ${kx}: the cloud is gone by the end`);
    assert.ok(pl.hit + X.sparkles + m.P.SPARKLE_MS <= dur, `${scene} ${kx}: the sparkles are gone by the end`);
    assert.ok(pl.hit + X.close[1] <= dur, `${scene} ${kx}: the hole is closed by the end`);
    assert.ok(pl.hit + FOE.strike.rebound + FOE.strike.recover <= dur, `${scene} ${kx}: the knight is back in the stance by the end`);
    const end = m.F.at(dur - 1, pl);
    assert.equal(end.show, false); assert.equal(end.fx.length, 0, 'nothing left at the end');
    if (pl.burrow) assert.equal(end.hole, 0);
  }
});

test('where the goblin stands: in its zone, clear of the knight, the pie and every watched thing on the ground', () => {
  const m = load(true), [gMin, , gMax] = m.F.FOE.gap;
  const sets = [[PIE], [PIE, thing('g3')], [PIE, thing('g1'), thing('g2')], [PIE, thing('g1'), thing('g2'), thing('g3')], [thing('g1')]];
  const seen = { battlement: new Set(), camp: new Set() };
  for (const scene of ['battlement', 'camp']) {
    const sc = m.KW.scenes[scene];
    for (const things of sets) for (const kx of spots(m, scene)) {
      const spot = m.F.spot(m.P.FOES.goblin, sc, things, sc.places, kx);
      if (!spot) continue;
      seen[scene].add(things.map(t => t.place).join() + '|' + kx);
      const d = Math.abs(spot.x - kx);
      assert.ok(d >= gMin && d <= gMax, `${scene} ${kx}: gap ${d}`);
      assert.equal(Math.sign(spot.x - kx), spot.side);
      assert.ok(sc.foeZone.spans.some(([a, b]) => spot.x >= a && spot.x <= b), `${scene} ${kx}: in the zone`);
      for (const th of things) {
        const pl = sc.places[th.place];
        if (pl.cls !== 'pie' && pl.cls !== 'ground') continue;
        assert.ok(spot.x + 40 <= pl.x - pl.w / 2 || spot.x - 40 >= pl.x + pl.w / 2, `${scene} ${kx}: clear of ${th.place}`);
      }
    }
  }
  // the usual case, the pie alone: room at every spot the knight strolls to
  for (const scene of ['battlement', 'camp']) for (const r of m.KW.scenes[scene].rounds) assert.ok(seen[scene].has('pie|' + r.x * m.V.U), `${scene} ${r.x}`);
  const camp = m.KW.scenes.camp, bat = m.KW.scenes.battlement, G = m.P.FOES.goblin;
  // the sides chosen: right on the battlement, left at the camp, and the other side when the first has no room
  assert.deepEqual(plain(m.F.spot(G, bat, [PIE], bat.places, 480)), { x: 690, side: 1 });
  assert.deepEqual(plain(m.F.spot(G, bat, [PIE], bat.places, 630)), { x: 420, side: -1 }, 'not among the pie and the cameras');
  assert.deepEqual(plain(m.F.spot(G, camp, [PIE], camp.places, 440)), { x: 230, side: -1 });
  assert.deepEqual(plain(m.F.spot(G, camp, [PIE, thing('g3')], camp.places, 440)), { x: 284, side: -1 }, 'beside the device in g3, not over it');
  assert.deepEqual(plain(m.F.spot(G, camp, [PIE, thing('g2'), thing('g3')], camp.places, 340)), { x: 494, side: 1 }, 'between the knight and the pie');
  assert.equal(m.F.spot(G, camp, [PIE, thing('g2'), thing('g3')], camp.places, 400), null, 'no room: the goblin does not come');
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
/* How deep the point lies inside the blade's outline, in pixels; 0 or below is outside. */
function depth(bl, x, y) {
  const sx = Math.sin(bl.a), sy = -Math.cos(bl.a), px = x - bl.x, py = y - bl.y, along = px * sx + py * sy, across = Math.abs(px * sy - py * sx);
  return along < bl.from || along > bl.to ? 0 : bl.half - across;
}

for (const pack of [true, false]) {
  test(`the blade stops at the goblin's pot and never passes through it (knight from ${pack ? 'the base pack' : 'code'})`, () => {
    const m = load(pack), S = m.F.FOE.strike;
    for (const scene of ['battlement', 'camp']) for (const kx of spots(m, scene)) for (const things of [[PIE], [PIE, thing('g3')]]) {
      const pl = planFor(m, scene, kx, things); if (!pl) continue;
      let closest = Infinity;
      const times = []; for (let el = S.at; el <= pl.hit + S.rebound + S.recover; el += 8) times.push(el);
      times.push(pl.hit, pl.hit - 1, pl.hit + 1);
      for (const el of times) {
        const o = pose(m.K, m.V, kx, el);
        m.F.strike(o, el, pl);
        const bl = m.F.bladeOf(o);
        let worst = -Infinity;
        for (const [x, y] of foePoints(m, pl, el)) worst = Math.max(worst, depth(bl, x, y));
        // the two outlines may touch, by up to 2 pixels, and no more
        assert.ok(worst <= 2, `${scene} knight ${kx} at ${el} ms: the blade is ${worst.toFixed(1)} px into the goblin`);
        if (el <= pl.hit) closest = Math.min(closest, m.F.bladeGap(bl, pl.F, pl.x, pl.side, m.V.HFL, pl.side));
      }
      assert.ok(closest <= 3, `${scene} knight ${kx}: the blade reaches the pot (${closest.toFixed(1)} px short)`);
    }
  });
}

test('the knight glares from 500 ms, strikes towards the goblin and is pleased once it has gone', () => {
  const m = load(true), pl = planFor(m, 'camp', 440, [PIE]);
  assert.equal(pl.side, -1);
  const o = pose(m.K, m.V, 440, 1400); m.F.strike(o, 1400, pl);
  assert.ok(o.wang > m.K.pose('idle', 0).wang, 'winding up over the right shoulder to cut to the left');
  const back = pose(m.K, m.V, 440, 3000), base = { gx: back.gx, gy: back.gy, wang: back.wang };
  m.F.strike(back, 3000, pl);
  assert.deepEqual({ gx: back.gx, gy: back.gy, wang: back.wang }, base, 'back in the stance');
  assert.ok(pl.hit + pl.exit.pleased < 3400);
});
