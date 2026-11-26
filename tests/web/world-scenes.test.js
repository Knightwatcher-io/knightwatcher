// Tests for the scenes of the medieval world's pack, web/packs/medieval.pack.json, against what the
// page still reads from code, and the checks of the foe and the places run on them. Run with:
// node --test 'tests/web/**/*.test.js'
//
// Until worlds can be chosen the engine and the settings keep their own lists of which scenes take
// turns while all is quiet and which events each scene plays (TURNS and EVENTS in engine.js, the
// quiet scenes in settings.js), and the flies and the crate follow a scene's outdoors. A scene of
// the pack says the same in its quiet and hosts, which will replace those lists; the first tests
// hold the two to each other, so the pack's are right when the engine reads them.
//
// tests/web/foe.test.js and tests/web/places.test.js check the goblin's zone and way in, and the
// places of the devices, on the code scenes, and stay as they are. The rest of this file runs the
// same checks on each scene the pack gives, compiled from it as a 'dev' page compiles it, with the
// goblin from the pack's cast, and holds the foe's plan there to the plan in the code scene with the
// code's goblin, for every weapon and build.
// The page's scripts run under Node in a sandbox, as in those two files.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PK = require('../../web/js/pack.js');
const SET = require('../../web/js/settings.js');

const WEB = path.join(__dirname, '../../web');
const SIGN = require('../../tools/sign-pack.js');
/* The pack as it ships with any signature taken off: these tests check its scenes, and a 'dev' page
   reads it unsigned, so they hold whether or not it has had its signing run. */
const MEDIEVAL = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const READ = PK.read(MEDIEVAL, { allowUnsigned: true });
/* The scenes the pack gives, and of them those that host a foe. */
const GIVEN = READ.ok ? Object.keys(READ.data.scenes) : [];
const FOES = GIVEN.filter(n => READ.data.scenes[n].hosts.includes('foe'));
const plain = o => JSON.parse(JSON.stringify(o));

test('the medieval world\'s pack reads clean, and gives a scene that hosts a foe', () => {
  assert.equal(READ.ok, true, READ.reason);
  assert.ok(GIVEN.length > 0 && FOES.length > 0);
});

// ---- The engine's lists -------------------------------------------------------------------------

/* The page's scripts as index.html loads them, but the files that drive the page (demo, settings,
   main): the knight drawn from code, and the scenes the code scenes, since nothing is started. */
const PAGE = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'js/world.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js'];

/* What the scenes data says against what the engine and the settings say, scene by scene, for the
   scenes the pack gives: one line for each that differs. A scene is quiet when it takes turns in the
   engine (TURNS) and is a quiet scene the settings offer (SET.SCENES); it hosts the flies when the
   code scene is outdoors, which is where the engine lets the flies in, and each event whose list
   (EVENTS[...].where) names it, the event with a foe as "foe". */
function disagreements(KW, scenes) {
  const E = KW.engine, order = PK.WORLD_LISTS.HOSTS, out = [];
  for (const n of Object.keys(scenes)) {
    const sc = scenes[n], code = KW.scenes[n];
    if (!code) continue;
    const quiet = [E.TURNS.includes(n), SET.SCENES.includes(n)];
    if (quiet[0] !== sc.quiet) out.push(`${n}: quiet is ${sc.quiet}, but the engine's TURNS ${quiet[0] ? 'lists' : 'does not list'} it`);
    if (quiet[1] !== sc.quiet) out.push(`${n}: quiet is ${sc.quiet}, but the settings' quiet scenes ${quiet[1] ? 'list' : 'do not list'} it`);
    const hosts = code.outdoors ? ['flies'] : [];
    for (const [type, e] of Object.entries(E.EVENTS)) if (e.where.includes(n)) hosts.push(e.foe ? 'foe' : type);
    const want = order.filter(h => hosts.includes(h)), got = order.filter(h => sc.hosts.includes(h));
    if (want.join() !== got.join()) out.push(`${n}: hosts is [${got.join(', ')}], but the engine plays [${want.join(', ')}] there`);
  }
  return out;
}

test('each scene the pack gives is quiet and hosts the events exactly as the engine\'s and the settings\' own lists say', () => {
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() }, console: { info() {}, warn() {} } });
  for (const f of PAGE) { if (box.window.KW) box.KW = box.window.KW; vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f }); }
  const KW = box.window.KW;
  // every event is one a scene can host
  for (const [type, e] of Object.entries(KW.engine.EVENTS)) assert.ok(PK.WORLD_LISTS.HOSTS.includes(e.foe ? 'foe' : type), type);
  assert.deepEqual(disagreements(KW, READ.data.scenes), []);
  // the engine lists the scenes that let in the crate when it loads, before the world is started,
  // from the code scenes: the compiled ones give outdoors as the code ones do
  KW.world.start([MEDIEVAL], true);
  for (const n of GIVEN) assert.equal(!!KW.scenes[n].outdoors, KW.engine.EVENTS.crate.where.includes(n), n);
  // and the check finds a scene that says otherwise
  const wrong = JSON.parse(JSON.stringify(READ.data.scenes));
  wrong.camp.quiet = false; wrong.camp.hosts = wrong.camp.hosts.filter(h => h !== 'feast');
  assert.deepEqual(disagreements(KW, wrong), [
    'camp: quiet is false, but the engine\'s TURNS lists it',
    'camp: quiet is false, but the settings\' quiet scenes list it',
    'camp: hosts is [flies, crate, foe], but the engine plays [flies, crate, feast, foe] there']);
});

// ---- The foe -------------------------------------------------------------------------------------
// As in tests/web/foe.test.js: the weapons and builds, the loader, the goblin's plan and the blade.

function fakeCanvas() {
  const cv = { width: 0, height: 0, fills: [] };
  const ctx = new Proxy({}, { set() { return true; }, get(_, k) { return k === 'fillRect' ? (x, y, w, h) => cv.fills.push([x, y, w, h]) : () => {}; } });
  cv.getContext = () => ctx;
  return cv;
}
const ONE = { look: { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } } };
const LONG = { look: { items: { main: 'kw.base/main.longsword' } } };
const MACE = { look: { items: { main: 'kw.base/main.mace', off: 'kw.base/off.round' } } };
const WEAPONS = [['the greatsword, from the base pack', true, null], ['the greatsword, from code', false, null], ['the arming sword', true, ONE], ['the longsword', true, LONG],
  ['the flanged mace', true, MACE]];
const BUILDS = { 'build.b': 'Broad', 'build.c': 'Slim' };
const BUILT = [];
for (const [b, name] of Object.entries(BUILDS)) {
  BUILT.push([`the greatsword, ${name}`, true, { look: { build: 'kw.base/' + b } }]);
  for (const [w, items] of [['the arming sword', ONE], ['the longsword', LONG], ['the flanged mace', MACE]]) BUILT.push([`${w}, ${name}`, true, { look: { build: 'kw.base/' + b, items: items.look.items } }]);
}

/* The page's scripts with the knight from the base pack (pack true) or from code, in the look opts
   asks for, and the scenes and the cast the pack gives compiled from it (from 'pack') or the code's. */
function load(from, pack, opts) {
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() }, console: { info() {}, warn() {} } });
  for (const f of PAGE) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(pack ? KW.packText : [], true, opts || undefined);
  assert.equal(KW.knight.source, pack ? 'pack' : 'code');
  if (opts && opts.look.items) assert.equal(KW.knight.rest.key('main'), opts.look.items.main, 'the weapon asked for is held');
  if (from === 'pack') {
    const st = KW.world.start([MEDIEVAL], true);
    for (const n of GIVEN) assert.equal(st.scenes[n], 'pack', `${n} is compiled from kw.medieval: ${st.note}`);
    assert.equal(KW.world.cast.members['foe.goblin'], 'pack', 'the goblin is compiled from kw.medieval');
  }
  KW.draw.setCtx(fakeCanvas().getContext('2d'));
  return { KW, E: KW.engine, F: KW.engine.foe, P: KW.props, K: KW.knight, V: KW.view };
}

const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };
const device = place => ({ place, kind: 'machine', ok: true, alert: false });
function pose(K, V, kx, el) { const o = K.pose('idle', 20000 + el); o.floor = V.HFL; o.x = kx; o.helmet = true; o.bob = 0; return o; }
function planFor(m, scene, kx, devices) {
  const sc = m.KW.scenes[scene];
  return m.F.plan('goblin', sc, { devices, places: sc.places }, pose(m.K, m.V, kx, 0));
}
function spots(m, scene) {
  const xs = m.KW.scenes[scene].rounds.map(r => r.x * m.V.U);
  const lo = Math.min(...xs), hi = Math.max(...xs), out = new Set(xs);
  for (let x = lo; x <= hi; x += 30) out.add(x);
  return [...out].sort((a, b) => a - b);
}
/* A plan as plain data: everything but the foe and lineAt, and the line the foe comes over at every
   tenth x across the grid. */
const planData = pl => pl && Object.assign(plain(Object.assign({}, pl, { F: null, lineAt: null })), { line: Array.from({ length: 97 }, (_, i) => pl.lineAt(i * 10)) });
const SETS = [[PIE], [PIE, device('g3')], [PIE, device('g1'), device('g2')], [PIE, device('g1'), device('g2'), device('g3')], [device('g1')]];

test('the scenes from the pack that host a foe: the entrance runs in order and the poof is over within the event, wherever the knight stands, with either weapon', () => {
  const m = load('pack', true), { FOE } = m.F, N = FOE.enter, X = FOE.exits.poof, dur = m.E.EVENTS.goblin.dur;
  const code = load('code', true);
  for (const mm of [m, load('pack', true, ONE)]) for (const scene of FOES) {
    assert.notEqual(mm.KW.scenes[scene], code.KW.scenes[scene], `${scene} is the pack's`);
    for (const kx of spots(mm, scene)) {
      const pl = planFor(mm, scene, kx, [PIE]);
      assert.ok(pl, `${scene} ${kx}: there is room`);
      assert.ok(pl.q < 1, `${scene} ${kx}: the blade meets it`);
      assert.equal(pl.burrow, !code.KW.scenes[scene].wallAt, `${scene} ${kx}: it comes in as it does in the code scene`);
      assert.ok(pl.hit > N.brace + 100 && pl.hit < FOE.strike.at + FOE.strike.dur, `${scene} ${kx}: struck after it flinches (${pl.hit})`);
      assert.ok(pl.hit + X.cloud + m.P.CLOUD_MS <= dur, `${scene} ${kx}: the cloud is gone by the end`);
      assert.ok(pl.hit + X.sparkles + m.P.SPARKLE_MS <= dur, `${scene} ${kx}: the sparkles are gone by the end`);
      assert.ok(pl.hit + X.close[1] <= dur, `${scene} ${kx}: the hole is closed by the end`);
      assert.ok(pl.hit + FOE.strike.rebound + FOE.strike.recover <= dur, `${scene} ${kx}: the knight is back in the stance by the end`);
      const end = mm.F.at(dur - 1, pl);
      assert.equal(end.show, false); assert.equal(end.fx.length, 0, 'nothing left at the end');
      if (pl.burrow) assert.equal(end.hole, 0);
    }
  }
});

/* Where the goblin stands in a scene, as foe.test.js expects it in the code scene: the devices, the
   knight's x and the spot, or null for no room. */
const SPOTS = {
  battlement: [[[PIE], 460, { x: 290, side: -1 }], [[PIE, device('g1')], 480, { x: 290, side: -1 }]],
  camp: [[[PIE], 520, { x: 324, side: -1 }], [[PIE, device('g2')], 520, { x: 324, side: -1 }], [[PIE], 760, null]] };

test('the scenes from the pack that host a foe: the goblin stands in its zone, clear of the knight, the pie and every device on the ground', () => {
  const m = load('pack', true), [gMin, , gMax] = m.F.FOE.gap, G = m.KW.cast.foes.goblin;
  assert.ok(G.from, 'the goblin is the pack\'s');
  for (const scene of FOES) {
    const sc = m.KW.scenes[scene], seen = new Set();
    for (const devices of SETS) for (const kx of spots(m, scene)) {
      const spot = m.F.spot(G, sc, devices, sc.places, kx);
      if (!spot) continue;
      seen.add(devices.map(t => t.place).join() + '|' + kx);
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
    for (const r of sc.rounds) assert.ok(seen.has('pie|' + r.x * m.V.U), `${scene} ${r.x}: room with the pie alone`);
    assert.ok(SPOTS[scene], `${scene}: where the goblin stands is written down here as foe.test.js has it`);
    for (const [devices, kx, want] of SPOTS[scene]) assert.deepEqual(plain(m.F.spot(G, sc, devices, sc.places, kx)), want, `${scene} ${kx} ${devices.map(t => t.place)}`);
  }
});

test('the scenes from the pack that host a foe: the goblin\'s plan is the code scene\'s, for every weapon and build, wherever the knight stands', () => {
  let plans = 0;
  for (const [name, pack, opts] of WEAPONS.concat(BUILT)) {
    const p = load('pack', pack, opts), c = load('code', pack, opts);
    for (const scene of FOES) for (const kx of spots(c, scene)) for (const devices of SETS) {
      const a = planData(planFor(p, scene, kx, devices)), b = planData(planFor(c, scene, kx, devices));
      assert.deepEqual(a, b, `${name}, ${scene}, knight ${kx}, ${devices.map(t => t.place)}`);
      if (b) plans++;
    }
  }
  assert.ok(plans > 50);
});

/* The hit at the scene's spot, where the knight comes in, the pie alone, for each weapon on Classic,
   Broad and Slim, as foe.test.js has it. */
const HITS = {
  battlement: { two: [1657, 1659, 1655], long: [1658, 1661, 1657], one: [1702, 1706, 1698], mace: [1703, 1709, 1690] },
  camp: { two: [1661, 1663, 1659], long: [1662, 1664, 1660], one: [1710, 1712, 1709], mace: [1706, 1710, 1702] } };

test('the scenes from the pack that host a foe: on every build the goblin is struck when foe.test.js says', () => {
  const ITEMS = { one: ONE.look.items, long: LONG.look.items, mace: MACE.look.items };
  for (const scene of FOES) {
    assert.ok(HITS[scene], `${scene}: the hits are written down here as foe.test.js has them`);
    const kx0 = READ.data.scenes[scene].spot * 5;
    for (const grip of ['two', 'long', 'one', 'mace']) {
      const got = ['build.a', 'build.b', 'build.c'].map(b => planFor(load('pack', true, { look: Object.assign({ build: 'kw.base/' + b }, ITEMS[grip] ? { items: ITEMS[grip] } : {}) }), scene, kx0, [PIE]).hit);
      assert.deepEqual(got, HITS[scene][grip], `${grip} ${scene}`);
    }
  }
});

/* The contact standard, as tests/web/foe.test.js checks it on the code scenes (docs/tests.md, The
   contact standard), on the scenes and the goblin from the pack: the whole drawn weapon against
   every drawn pixel of the goblin through the whole strike, the bounce included, never more than
   2 px in, and at the hit no more than 3 px from the goblin as drawn then, for each swung weapon on
   each build, at the stops of the patrol, every 30 between and the spots the full sweep
   (tools/contact-sweep.sh) found hardest. */
const CONTACT_LIB = require('../../tools/contact-sweep/lib.js');
const { measurePlan } = require('../../tools/contact-sweep/measure.js');
const HARD = { battlement: [445, 448, 451, 453, 455, 459, 464, 467, 471, 474, 475, 479], camp: [493, 497, 501, 508, 513, 518] };
const CONTACT = [];
for (const [b, bn] of [['a', 'Classic'], ['b', 'Broad'], ['c', 'Slim']]) {
  for (const [w, wn] of [['great', 'the greatsword'], ['arming', 'the arming sword'], ['long', 'the longsword'], ['mace', 'the flanged mace']]) CONTACT.push([`${wn}, ${bn}`, w, b, true]);
}
CONTACT.push(['the greatsword, from code', 'great', 'a', false]);

for (const [name, weapon, build, pack] of CONTACT) {
  test(`the scenes from the pack that host a foe: the whole drawn weapon meets the drawn goblin at the hit and never goes more than 2 px into it, the bounce included (${name})`, () => {
    const C = CONTACT_LIB, m = C.load({ from: 'pack', pack, build, weapon }), fb = C.frameBox(m);
    assert.ok(m.KW.cast.foes.goblin.from, 'the goblin is the pack\'s');
    let plans = 0;
    for (const scene of FOES) {
      assert.ok(HARD[scene], `${scene}: the hardest spots are written down here`);
      for (const kx of [...new Set(C.testSpots(m, scene).concat(HARD[scene]))]) {
        const pl = C.planFor(m, scene, kx, [PIE]), at = `${scene} knight ${kx}`;
        assert.ok(pl, `${at}: the goblin comes with the pie alone`);
        plans++;
        const g = m.F.gaps(pl.F, C.pose(m, kx, 0), pl.side), d = Math.abs(pl.x - kx);
        assert.ok(g && d >= g[0] && d <= g[2], `${at}: gap ${d} within the weapon's reach ${g}`);
        const oh = C.pose(m, kx, pl.hit); m.F.strike(oh, pl.hit, pl);
        const gapAtHit = m.F.bladeGap(m.F.bladeOf(oh), pl.F, pl.x, pl.side, m.V.HFL);
        assert.ok(Math.abs(gapAtHit) < 3, `${at}: the blade meets the crown at the hit (${gapAtHit.toFixed(1)})`);
        const r = measurePlan(m, kx, pl, fb, 8), w = r.worst;
        assert.equal(r.over2, null, `${at}: the weapon is ${w && w.depth} px into the goblin at ${w && w.el} ms (hit ${pl.hit}), at (${w && w.glocal}) on the goblin's ${w && w.pose} pose, (${w && w.wlocal}) on the weapon`);
        assert.ok(r.gap <= 3, `${at}: the weapon is ${r.gap} px from the goblin at the hit (${pl.hit} ms), at (${r.gapAt && r.gapAt.glocal}) on its ${r.gapAt && r.gapAt.pose} pose`);
      }
    }
    assert.ok(plans >= 20, `${plans} plans`);
  });
}

// ---- The places ----------------------------------------------------------------------------------
// As in tests/web/places.test.js: everything a place may show, as boxes on the grid.

/* The scripts that hold the kinds and the scenes, and the scenes the pack gives compiled from it,
   in a sandbox drawing into a context that grows one box over everything painted until it is read. */
function loadPlaces() {
  let bb = null;
  const grow = (x0, y0, x1, y1) => { bb = bb ? [Math.min(bb[0], x0), Math.min(bb[1], y0), Math.max(bb[2], x1), Math.max(bb[3], y1)] : [x0, y0, x1, y1]; };
  const ctx = new Proxy({}, {
    set() { return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => grow(x, y, x + w, y + h);
      if (k === 'drawImage') return (cv, x, y) => grow(x, y, x + cv.width, y + cv.height);
      return () => {};
    },
  });
  const quiet = new Proxy({}, { set() { return true; }, get: () => () => {} });
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {} }, document: { createElement: () => ({ width: 0, height: 0, getContext: () => quiet }) } });
  for (const f of PAGE.slice(0, PAGE.indexOf('js/world.js') + 1)) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, code = Object.assign({}, KW.scenes);
  const st = KW.world.start([MEDIEVAL], true);
  for (const n of GIVEN) { assert.equal(st.scenes[n], 'pack', `${n} is compiled from kw.medieval: ${st.note}`); assert.notEqual(KW.scenes[n], code[n]); }
  KW.draw.setCtx(ctx);
  const take = f => { bb = null; f(); const r = bb; bb = null; return r; };
  return { KW, take, scenes: GIVEN.map(n => [n, KW.scenes[n]]) };
}

const KINDS_AT = { pie: ['pi'], high: ['camera'], ground: ['machine', 'vm', 'box'] };
const TIMES = [0, 250, 900, 1700, 2300, 3100];
function placeBoxes(KW, take, pl) {
  const P = KW.props, out = [];
  const mirror = b => (pl.flip ? [2 * pl.x - b[2], b[1], 2 * pl.x - b[0], b[3]] : b);
  for (const k of KINDS_AT[pl.cls]) {
    let dev = null;
    for (const ok of [true, false]) for (const t of TIMES) for (const part of ['still', 'moving']) {
      const b = take(() => P.KINDS[k].draw(pl.x, pl.y, t, ok, part));
      if (b) dev = dev ? [Math.min(dev[0], b[0]), Math.min(dev[1], b[1]), Math.max(dev[2], b[2]), Math.max(dev[3], b[3])] : b;
    }
    out.push({ what: k, box: mirror(dev) });
    out.push({ what: k + "'s question mark", box: take(() => KW.sprites.mark(pl.x, pl.y - P.KINDS[k].mark, '?')) });
  }
  if (pl.pole) out.push({ what: 'the pole', box: mirror([pl.x + 21, pl.y - 40, pl.x + 34, pl.pole + 1]) });
  return out;
}

test('the scenes from the pack: everything a place may show stands wholly on the 960 by 600 grid', () => {
  const { KW, take, scenes } = loadPlaces(), bad = [];
  for (const [name, sc] of scenes) for (const [p, pl] of Object.entries(sc.places)) {
    for (const { what, box: b } of placeBoxes(KW, take, pl)) if (b[0] < 0 || b[1] < 0 || b[2] > 960 || b[3] > 600) bad.push(`${name} ${p}: ${what} covers ${b.join(', ')}`);
  }
  assert.deepEqual(bad, []);
});

test('the scenes from the pack: no two places draw over each other, but the court\'s accepted owl mark (places.test.js)', () => {
  const { KW, take, scenes } = loadPlaces(), bad = [];
  for (const [name, sc] of scenes) {
    const boxes = Object.entries(sc.places).map(([p, pl]) => [p, placeBoxes(KW, take, pl)]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      for (const a of boxes[i][1]) for (const b of boxes[j][1]) {
        if (a.box[0] < b.box[2] && b.box[0] < a.box[2] && a.box[1] < b.box[3] && b.box[1] < a.box[3]) bad.push(`${name}: ${boxes[i][0]} (${a.what}) and ${boxes[j][0]} (${b.what})`);
      }
    }
  }
  assert.deepEqual(bad, ["court: h1 (camera) and h2 (camera's question mark)"]);
});

test('the scenes from the pack: a camera\'s question mark is never higher than y 172, clear of the headline', () => {
  const { KW, scenes } = loadPlaces(), mark = KW.props.KINDS.camera.mark;
  for (const [name, sc] of scenes) for (const [p, pl] of Object.entries(sc.places)) if (pl.cls === 'high') assert.ok(pl.y - mark >= 172, `${name} ${p}: the mark's top at ${pl.y - mark}`);
});

// ---- The acts ------------------------------------------------------------------------------------
// The call records draw a few moments of each state. A scene with an act (the yard's training, the
// smithy's hammer, bellows and quench, the house's bed and screen) changes the knight's pose and
// what it draws from one moment to the next, and the yard's keeps the time of its last blow from
// one frame for the next, so the scenes from the pack that have an act are also run frame by frame
// beside their code scenes, and every frame's calls (over's among them), changes to the pose,
// strike and the knight's move off the spot (s.dx) compared. The target's: every 10 ms for two of
// the yard's 5.6 s training rounds while all is quiet and while the CPU runs hot, and every 50 ms
// for six seconds under attack, where the act rests, and under strain short of memory, the knight
// bloated as it trains, and every 50 ms for the same two rounds while something streams. The
// smithy's: every 10 ms for the whole of the quench's 14.4 s loop at its stop while all is quiet,
// and every 50 ms while something streams, for five of the hammer's 1.4 s blows while updating, at the spot and at x 300, and
// for ten of the bellows' pumps of 200 pi ms while the CPU runs hot, and every 50 ms for six
// seconds with a device down, where no act plays, and under strain short of memory, bloated at the
// bellows.
// The bed's and the screen's: every 10 ms for
// 8.4 s, two of the television's figure's rounds, asleep at night and sick in bed, the television
// on while streaming, and off while all is quiet. The seat's: every 10 ms for 12.8 s, two of the
// court's rounds of talk, the patron's and the knight's turns, while a shell is open and while all
// is quiet; and the knight's pose after the scene's draw too, since the seat sets who talks there.

/* The page's scripts drawing into a context that writes one line per call, with the knight's swing
   written as one line, and the scenes the pack gives compiled from it (from 'pack') or from code. */
function loadDrawn(from) {
  const log = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push(String(k) + ' ' + v); return true; },
    get(_, k) { return (...a) => { log.push([String(k), ...a].join(' ')); }; },
  });
  const box = vm.createContext({ window: {}, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }, console: { info() {}, warn() {} } });
  for (const f of PAGE) { if (box.window.KW) box.KW = box.window.KW; vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f }); }
  const KW = box.window.KW;
  KW.knight.start([], false);
  if (from === 'pack') KW.world.start([MEDIEVAL], true);
  KW.knight.swing = (o, q, dir) => log.push(`swing ${q} ${dir}`);
  KW.devices.draw = () => log.push('devices');
  KW.draw.setCtx(ctx);
  return { KW, log };
}
/* The frame the engine makes for the condition id at t, the knight at kx (the scene's spot when left
   out) and, in a scene with rounds, on its patrol at the first of them (or the stop whose act is
   stop) from time 0, as tests/web/scenes.test.js makes it. */
function frameAt(KW, name, id, t, kx, stop) {
  // mem: Under strain short of memory, the knight bloated as it trains
  const mem = id === 'mem';
  if (mem) id = 'cpu_hot';
  const sc = KW.scenes[name], K = KW.knight, V = KW.view, ST = KW.state, k = ST.CONDITIONS[id];
  const w = k ? { id, lv: k.lv, st: ST.LEVELS[k.level], scene: k.scene, hl: '', sub: '', mem } : ST.IDLE;
  const o = K.pose(id === 'streaming' ? 'idle' : id, t, mem); o.floor = V.HFL; o.helmet = sc.helmet !== false; o.x = kx === undefined ? sc.spot * V.U : kx;
  if (sc.sword === false) o.sword = false;
  const inBed = !!sc.bed && (id === 'night' || id === 'container_unhealthy');
  const free = (id === 'idle' || id === 'disk_full' || id === 'streaming') && !inBed;
  return { w, devices: [], places: sc.places, tv: id === 'streaming', set: sc.tv || null, spot: sc.spot * V.U, kx: o.x, o, here: sc.rounds && free ? { act: stop || sc.rounds[0].act, el: t } : null, inBed,
    helmOff: inBed || o.helmet === false, strike: false };
}
/* The scenes with an act, and the runs each is compared in: [condition, every ms, until ms, kx]. */
const PART = sc => (sc.target ? 'target' : sc.anvil ? 'anvil' : sc.bed || sc.screen ? 'bed' : sc.seat ? 'seat' : null);
const ACTED = GIVEN.filter(n => PART(READ.data.scenes[n]));
const RUNS = {
  target: [['idle', 10, 11200], ['streaming', 50, 11200], ['cpu_hot', 10, 11200], ['attack', 50, 6000], ['mem', 50, 6000]],
  anvil: [['idle', 10, 14400, 650, 'quench'], ['streaming', 50, 14400, 650, 'quench'], ['updating', 10, 7000], ['updating', 10, 7000, 300], ['cpu_hot', 10, 6300], ['device_down', 50, 6000], ['mem', 50, 6000]],
  bed: [['night', 10, 8400], ['container_unhealthy', 10, 8400], ['streaming', 10, 8400], ['idle', 10, 8400]],
  seat: [['ssh_session', 10, 12800], ['idle', 10, 12800]]
};

for (const name of ACTED) {
  test(`${name} from kw.medieval acts as the code scene does, frame by frame`, () => {
    let frames = 0;
    for (const [id, every, until, kx, stop] of RUNS[PART(READ.data.scenes[name])]) {
      const c = loadDrawn('code'), p = loadDrawn('pack');
      assert.notEqual(c.KW.scenes[name], p.KW.scenes[name]);
      for (let t = 0; t <= until; t += every) {
        const run = m => {
          const s = frameAt(m.KW, name, id, t, kx, stop), before = JSON.stringify(s.o);
          m.log.length = 0;
          if (m.KW.scenes[name].act) m.KW.scenes[name].act(t, s);
          m.log.push('o ' + (JSON.stringify(s.o) === before ? 'unchanged' : JSON.stringify(s.o)), 'strike ' + s.strike, 'dx ' + s.dx);
          m.KW.scenes[name].draw(t, s);
          m.log.push('o after draw ' + JSON.stringify(s.o));
          if (m.KW.scenes[name].over) { m.log.push('over'); m.KW.scenes[name].over(t, s); }
          return m.log.join('\n');
        };
        const a = run(c), b = run(p);
        if (a !== b) {
          const x = a.split('\n'), y = b.split('\n'); let i = 0; while (x[i] === y[i]) i++;
          assert.fail(`${name}, ${id}${kx === undefined ? '' : ' at ' + kx}, t ${t}: call ${i} is ${JSON.stringify(y[i])} from the pack and ${JSON.stringify(x[i])} from code`);
        }
        frames++;
      }
    }
    assert.ok(frames > 1000, frames + ' frames');
  });
}
