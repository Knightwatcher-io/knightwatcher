// Tests for the knight's patrol and the television (docs/page.md, The patrol and The television):
// the side-step walk, the plan of stops worked out from the time alone, the visits to the set while
// something streams, how a warning, a condition with a scene of its own, an act that needs a place
// and an event hand over and resume, the set drawn in every scene and kept clear by the goblin and
// the crate, and the night with a stream. Run with: node --test 'tests/web/**/*.test.js'
//
// The page's scripts run under Node into a sandbox, with the knight from the base pack and, where a
// test says so, the medieval world started from its pack on dev terms. Time runs from the frames
// the test draws: frozen at each frame's time, so that a frame depends on its time alone.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };

/* A context that keeps the canvas calls it is asked to keep: a fillRect as "r x y w h", a drawImage
   as "img x y", and the fillStyle. */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { if (log && k === 'fillStyle') log.push('fill ' + v); return true; },
    get(_, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...a) => { if (!log) return; if (k === 'fillRect') log.push('r ' + a.join(' ')); else if (k === 'drawImage') log.push('img ' + a.slice(1, 3).join(' ')); };
    }
  });
}
/* The page, the knight from the base pack, and the medieval world's scenes when world is set. */
function page(world) {
  const log = [], clock = { t: 0 };
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => clock.t }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context(null); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, texts = [BASE_TEXT, MED_TEXT];
  KW.knight.start(texts, true, { look: {} });
  if (world) KW.world.start(texts, true);
  KW.ui = { caption() {} };
  KW.hooks = { frozen: true, t: 0 };
  return { KW, K: KW.knight, E: KW.engine, U: KW.view.U, log, clock };
}
/* The engine in the condition id (all quiet when null) in the scene is, its first frame to come. */
function engine(m, id, is, more) {
  const { KW, E } = m, w = id ? Object.assign({ id, hl: '', sub: '' }, KW.state.CONDITIONS[id]) : KW.state.IDLE;
  KW.hooks = Object.assign({ frozen: true, t: 0 }, more && more.hooks);
  E.init(context(m.log)); E.reset();
  E.input = Object.assign({ w, is: is || 'auto', devices: [PIE], tv: id === 'streaming', helmet: 'auto' }, more && more.input);
  return E;
}
const condition = (m, id, extra) => Object.assign({ id, hl: '', sub: '' }, m.KW.state.CONDITIONS[id], extra);
/* Draws the frame at t and returns the pose the knight was drawn in, or null when it was not. */
function at(m, t) {
  const K = m.K, draw = K.draw; let pose = null;
  K.draw = o => { pose = Object.assign({}, o); return draw(o); };
  m.KW.hooks.t = t; m.log.length = 0;
  try { m.E.draw(t); } finally { K.draw = draw; }
  return pose;
}

// ---- The walk ------------------------------------------------------------------------------------

test('the walk is a side-step: 14 px a step every 300 ms, a whole number of pairs of steps, the feet together at each end', () => {
  const { E } = page(false), P = E.patrol;
  assert.deepEqual(plain(P.GAIT), { step: 300, stride: 14, lift: 7, hip: 0.5, drop: 2, lean: 2 });
  for (const [x0, x1] of [[460, 600], [600, 440], [520, 440], [440, 460]]) {
    const l = P.walkLeg(x0, x1, 1000, 0);
    assert.equal(l.n % 2, 0, 'pairs of steps');
    assert.ok(Math.abs(Math.abs(x1 - x0) / l.n - 14) <= 7, 'near 14 a step: ' + Math.abs(x1 - x0) / l.n);
    assert.equal(l.t1 - l.t0, l.n * 300);
    const end = P.gaitAt(l, l.t1 - l.t0);
    assert.deepEqual([end.g.L, end.g.R, end.g.liftL, end.g.liftR], [0, 0, 0, 0], 'the feet close together');
  }
});

test('a boot on the ground never slides: the foot that does not lift keeps its place on the floor', () => {
  const { E } = page(false), P = E.patrol;
  for (const [x0, x1] of [[460, 600], [600, 390]]) {
    const l = P.walkLeg(x0, x1, 0, 0), dir = Math.sign(x1 - x0);
    let last = null;
    for (let e = 0; e <= l.t1 - l.t0; e += 10) {
      const a = P.gaitAt(l, e), body = x0 + (x1 - x0) * Math.min(1, e / (l.t1 - l.t0));
      const feet = { L: body + a.g.L, R: body + a.g.R };
      if (last) for (const f of ['L', 'R']) if (!a.g['lift' + f] && !last.lift[f]) assert.ok(Math.abs(feet[f] - last.feet[f]) <= 1.5, `${x0} to ${x1} at ${e}: foot ${f} slides from ${last.feet[f]} to ${feet[f]}`);
      assert.ok(a.g.liftL === 0 || a.g.liftR === 0, 'one foot lifts at a time');
      assert.ok(Math.max(a.g.liftL, a.g.liftR) <= 7 && a.drop >= 0 && a.drop <= 2);
      assert.equal(a.lean, dir * 2); assert.equal(a.look, dir);
      last = { feet, lift: { L: a.g.liftL, R: a.g.liftR } };
    }
  }
});

test('the rig takes the gait: each foot moves by its offset and lifts, each hip by half, and the boots\' step values stay 0', () => {
  const { K } = page(false);
  const o = Object.assign(K.pose('idle', 0), { floor: 530, x: 480, bob: 0, walk: true }), copy = a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Array.from(v)]));
  const S = copy(K.rig(Object.assign({}, o, { walk: false })).anchors);
  const r = K.rig(Object.assign({}, o, { gait: { L: -10, R: 6, liftL: 5, liftR: 0, hip: 0.5 } })), A = r.anchors;
  assert.deepEqual([A.footL[0] - S.footL[0], A.footL[1] - S.footL[1], A.footR[0] - S.footR[0], A.footR[1] - S.footR[1]], [-10, -5, 6, 0]);
  assert.deepEqual([A.hipL[0] - S.hipL[0], A.hipR[0] - S.hipR[0]], [-5, 3]);
  assert.deepEqual([r.values.stepL, r.values.stepR], [0, 0]);
});

// ---- The plan --------------------------------------------------------------------------------------

test('the patrol: the scene\'s stops in turn from its spot, each for its time, the walks between at the walk\'s pace', () => {
  const m = page(false), E = engine(m, null, 'battlement'), U = m.U, R = m.KW.scenes.battlement.rounds;
  assert.equal(R[0].x, m.KW.scenes.battlement.spot, 'the first stop is the spot');
  // the knight comes in at the spot and stands there its whole first stop, doing what it is for
  assert.equal(at(m, 0).x, R[0].x * U);
  assert.equal(at(m, R[0].dur * 1000 - 10).x, R[0].x * U);
  assert.equal(at(m, R[0].dur * 1000 - 10).walk, undefined);
  // then walks on to the next
  const w = at(m, R[0].dur * 1000 + 150);
  assert.ok(w.walk && w.gait && w.x > R[0].x * U && w.x < R[1].x * U, 'walking to the next stop: ' + w.x);
  const leg = E.patrol.walkLeg(R[0].x * U, R[1].x * U, 0, 1), arrive = R[0].dur * 1000 + leg.t1;
  assert.equal(at(m, arrive + 1).x, R[1].x * U);
  // the same moment drawn again gives the same picture: the plan is a function of the time
  assert.deepEqual(plain(at(m, R[0].dur * 1000 + 150)), plain(w));
});

test('with time frozen, pt= starts the patrol that many ms before the frozen time, the same in every frame', () => {
  const m = page(false), U = m.U, R = m.KW.scenes.battlement.rounds;
  engine(m, null, 'battlement', { hooks: { t: 20000, pt: 20000 } });
  const a = at(m, 20000), b = at(m, 20000);
  assert.deepEqual(plain(a), plain(b));
  assert.ok(a.x > R[0].x * U && a.x <= R[1].x * U, '20 s in, at or on the way to the second stop: ' + a.x);
  engine(m, null, 'battlement', { hooks: { t: 20000 } });
  assert.equal(at(m, 20000).x, R[0].x * U, 'without pt= the patrol starts at the frozen time');
});

test('the yard trains at its first stop while all is quiet and while something streams; the smithy quenches at its own', () => {
  const m = page(true);
  engine(m, null, 'yard');
  assert.equal(at(m, 0).x, 520);
  const sw = [0, 300, 600].map(t => at(m, t).wang);
  assert.ok(new Set(sw).size > 1, 'the training swing at the dummy');
  engine(m, null, 'smithy');
  assert.equal(at(m, 0).x, 440);
  assert.equal(at(m, 600).tool, undefined, 'a look round at the anvil, no tongs');
  const R = m.KW.scenes.smithy.rounds, q0 = R[0].dur * 1000 + m.E.patrol.walkLeg(440, 650, 0, 1).t1 + 1;
  const q = at(m, q0 + 600);
  assert.equal(q.tool && q.tool.kind, 'tongs', 'at the forge, the quench');
});

// ---- The television -----------------------------------------------------------------------------

test('while something streams the knight walks to the set at once, watches 30 s, patrols on, and comes back after the first stop ending a minute after', () => {
  const m = page(false), E = engine(m, 'streaming', 'battlement'), sc = m.KW.scenes.battlement, U = m.U;
  assert.deepEqual(plain(E.patrol.VISIT), { watch: 30000, gap: 60000, blink: 9000, happy: [6500, 7700] });
  at(m, 0);
  const walk = E.patrol.walkLeg(sc.spot * U, sc.tv.watch * U, 0, 0);
  const w = at(m, walk.t1 + 100);
  assert.equal(w.x, sc.tv.watch * U, 'at the set');
  assert.equal(w.look, -1, 'looking at it, to the left'); assert.equal(w.mouth, 'smile');
  assert.equal(at(m, walk.t1 + 6600).eyes, 'happy', 'a happy blink');
  // the visits over four minutes and more, drawn from the start again
  const P = () => E.patrol.plan();
  engine(m, 'streaming', 'battlement');
  const visits = [];
  let was = false;
  for (let tt = 0; tt < 260000; tt += 100) {
    at(m, tt);
    const p = P(), l = p.legs.find(x => tt >= x.t0 && tt < x.t1);
    const now = !!(l && l.act === 'watch');
    if (now && !was) visits.push([tt, l.t0, l.t1]);
    was = now;
  }
  assert.ok(visits.length >= 2, visits.length + ' visits');
  assert.equal(visits[0][2] - visits[0][1], 30000);
  for (let i = 1; i < visits.length; i++) assert.ok(visits[i][1] - visits[i - 1][2] >= 60000, 'a minute between visits: ' + (visits[i][1] - visits[i - 1][2]));
  assert.ok(visits[1][1] - visits[0][2] < 60000 + 30000, 'back after the first stop that ends a minute on');
});

test('the set stands in every scene with a stand while something streams, before the devices behind the knight; the house draws its own', () => {
  const m = page(true);
  for (const [n, stand] of [['battlement', 'table'], ['camp', 'table'], ['yard', 'table'], ['smithy', 'table'], ['cellar', 'crate'], ['court', 'table'], ['house', 'none']])
    assert.equal(m.KW.scenes[n].tv.stand, stand, n);
  m.KW.draw.setCtx(context(null));
  const drawn = (tv, scene) => {
    const calls = [];
    m.KW.tv = Object.assign({}, m.KW.tv, { draw: (x, y, t, stand, part) => calls.push([x, y, stand, part]) });
    m.KW.devices.draw(0, { tv, set: m.KW.scenes[scene].tv, places: m.KW.scenes[scene].places, devices: [] });
    return calls;
  };
  assert.deepEqual(drawn(true, 'battlement').filter(c => c[3] === 'moving'), [[255, 530, 'table', 'moving']]);
  assert.deepEqual(drawn(true, 'cellar').filter(c => c[3] === 'moving'), [[376, 530, 'crate', 'moving']]);
  assert.deepEqual(drawn(false, 'battlement'), []);
  assert.deepEqual(drawn(true, 'house'), []);
});

test('the set from the pack draws what the code\'s draws, on each stand, still and moving', () => {
  const pack = page(true), code = page(false);
  assert.notEqual(pack.KW.tv, code.KW.tv);
  assert.match(pack.KW.tv.from, /^kw\.medieval#/);
  assert.equal(pack.KW.world.tv.source, 'pack');
  for (const stand of ['table', 'crate']) for (const part of ['still', 'moving']) for (const t of [0, 450, 2100]) {
    const run = m => { const log = []; m.KW.draw.setCtx(context(log)); m.KW.tv.draw(330, 530, t, stand, part); return log.join('\n'); };
    assert.equal(run(pack), run(code), `${stand} ${part} t${t}`);
  }
});

test('the goblin and the crate come as usual while the set is on, in front of it', () => {
  const m = page(true), E = m.E;
  // the goblin has room at every stop of the battlement and the camp with the set on, as with it off
  for (const n of ['battlement', 'camp']) {
    const sc = m.KW.scenes[n], F = m.KW.cast.foes.goblin;
    for (const kx of sc.rounds.map(r => r.x * 5)) {
      const s = { tv: true, set: sc.tv, devices: [PIE], places: sc.places }, o = Object.assign(m.K.pose('idle', 0), { floor: 530, x: kx, helmet: true, bob: 0 });
      const pl = E.foe.plan('goblin', sc, s, o), off = E.foe.plan('goblin', sc, Object.assign({}, s, { tv: false }), o);
      assert.ok(pl, `${n} ${kx}: the goblin comes with the set on`);
      assert.deepEqual([pl.x, pl.side, pl.hit], [off.x, off.side, off.hit], `${n} ${kx}: where and when it would with the set off`);
    }
    // the crate lands where it would without the set
    for (const kx of sc.rounds.map(r => r.x * 5)) assert.equal(E.crateX(sc, kx), Math.min(sc.crate.span[1] - 30, Math.max(sc.crate.span[0] + 30, kx - 160)) - 30);
  }
  // drawn over the set: the set at the scene's devices mark, then after the scene the goblin (its hole
  // in the camp's ground first) and the crate
  const order = [], P = m.KW.props, tv = m.KW.tv, hole = P.holeHD, crate = P.crateHD;
  m.KW.tv = Object.assign({}, tv, { draw: (...a) => { order.push('tv'); return tv.draw(...a); } });
  P.holeHD = (...a) => { order.push('goblin'); return hole(...a); };
  P.crateHD = (...a) => { order.push('crate'); return crate(...a); };
  try {
    for (const [type, t] of [['goblin', 1300], ['crate', 1700]]) {
      engine(m, 'streaming', 'camp');
      E.input.tv = true;
      m.KW.hooks.t = t; E.fireEvent(type);
      order.length = 0; at(m, t);
      const seen = order.filter((x, i) => x !== order[i - 1]);
      assert.deepEqual(seen.slice(0, 2), ['tv', type], `${type}: ${seen.join(' ')}`);
    }
  } finally { m.KW.tv = tv; P.holeHD = hole; P.crateHD = crate; }
});

// ---- Handing over ----------------------------------------------------------------------------------

test('a warning in the same scene holds the knight where it stands, and the patrol carries on to the stop it was heading for', () => {
  const m = page(false), E = engine(m, null, 'battlement'), U = m.U, R = m.KW.scenes.battlement.rounds;
  at(m, 0);
  const t1 = R[0].dur * 1000 + 600, w = at(m, t1);
  assert.ok(w.walk, 'on the way to the second stop');
  E.input.w = Object.assign(condition(m, 'device_down'), { place: null });
  const held = at(m, t1 + 10);
  assert.equal(held.x, w.x, 'held where it stood');
  assert.equal(held.gait, undefined, 'the feet together');
  assert.equal(at(m, t1 + 5000).x, w.x);
  E.input.w = m.KW.state.IDLE;
  at(m, t1 + 5010);
  const leg = E.patrol.plan().legs.find(l => l.k === 'stop');
  assert.equal(leg.x, R[1].x * U, 'on to the stop it was heading for');
});

test('an act that needs a place walks the knight there first: the smithy\'s hammer at the spot, the yard\'s training at the dummy', () => {
  const m = page(true), E = engine(m, null, 'smithy');
  at(m, 0);
  const R = m.KW.scenes.smithy.rounds, t0 = R[0].dur * 1000 + 3000, away = at(m, t0).x;
  assert.ok(away > 440, 'patrolling away from the anvil: ' + away);
  E.input.w = condition(m, 'updating');
  at(m, t0 + 10);
  const first = at(m, t0 + 400);
  assert.ok(first.walk && first.x < away, 'walking back to the anvil');
  assert.equal(first.tool, undefined, 'the hammer waits until the knight is at the anvil');
  assert.equal(at(m, t0 + 20000).x, 440, 'at the anvil');
  assert.equal(E.patrol.holdAt(condition(m, 'updating'), m.KW.scenes.smithy), 440);
  assert.equal(E.patrol.holdAt(condition(m, 'cpu_hot'), m.KW.scenes.yard), 520);
  assert.equal(E.patrol.holdAt(condition(m, 'cpu_hot'), m.KW.scenes.smithy), null, 'the bellows place the knight themselves');
  assert.equal(E.patrol.holdAt(condition(m, 'device_down'), m.KW.scenes.camp), null);
});

test('the modes: quiet all quiet and the disk full, stream while something streams, hold for anything else and in bed', () => {
  const m = page(false), P = m.E.patrol, S = m.KW.scenes;
  assert.equal(P.mode(m.KW.state.IDLE, S.camp, false), 'quiet');
  assert.equal(P.mode(condition(m, 'disk_full'), S.cellar, false), 'quiet');
  assert.equal(P.mode(condition(m, 'streaming'), S.camp, false), 'stream');
  for (const id of ['device_down', 'cpu_hot', 'updating', 'attack', 'backup_overdue', 'pi_silent']) assert.equal(P.mode(condition(m, id), S.camp, false), 'hold', id);
  assert.equal(P.mode(condition(m, 'night'), S.house, true), 'hold');
  assert.equal(P.mode(m.KW.state.IDLE, S.court, false), 'hold', 'the court gives no stops');
});

test('an event pauses the patrol where the knight stands, and it carries on from there', () => {
  const m = page(false), E = engine(m, null, 'battlement'), R = m.KW.scenes.battlement.rounds;
  at(m, 0);
  const t1 = R[0].dur * 1000 + 600, w = at(m, t1);
  // the event starts at t1 on the page's clock
  m.KW.hooks.frozen = false; m.clock.t = t1;
  E.fireEvent('feast');
  m.KW.hooks.frozen = true;
  const p = at(m, t1 + 1000);
  assert.equal(p.x, w.x, 'paused');
  assert.equal(p.mouth, 'chew');
  at(m, t1 + 5000); at(m, t1 + 5600);
  const after = at(m, t1 + 6500);
  assert.ok(after.x > w.x && after.walk, 'patrolling again, on to the stop it was heading for');
});

// ---- The night with a stream ----------------------------------------------------------------------

test('a stream at night: the knight sleeps in the house, the set on, its light over the dark room; the headline is the stream\'s', () => {
  const m = page(true), E = engine(m, 'streaming', 'camp');
  E.input.w = condition(m, 'streaming', { night: true });
  E.input.tv = true;
  assert.equal(E.patrol.acted(E.input.w).id, 'night');
  assert.equal(E.patrol.acted(condition(m, 'streaming')).id, 'streaming');
  const pose = at(m, 2300);
  assert.equal(E.scene(), 'house');
  assert.equal(pose, null, 'in bed, not drawn standing');
  // the house's over layer: the three faint lights in the picture's blues, from the pack as from code
  const over = mm => { const log = []; mm.KW.draw.setCtx(context(log)); mm.KW.scenes.house.over(2300, { w: condition(mm, 'night'), tv: true }); return log; };
  const code = page(false);
  assert.deepEqual(over(m), over(code));
  assert.ok(over(m).length > 0);
  const off = mm => { const log = []; mm.KW.draw.setCtx(context(log)); mm.KW.scenes.house.over(2300, { w: condition(mm, 'night'), tv: false }); return log.length; };
  assert.ok(off(m) < over(m).length, 'no light with the set off');
});
