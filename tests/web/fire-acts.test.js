// Tests for the acts with a weapon that fires (docs/rig.md, Aiming and firing; docs/page.md, The
// acts with a weapon that fires): the swat by shot, practice at the target, the foe shot from range
// with the watcher stepping back, the attack aimed and never fired, the weapon that is both swung and
// fired, the reach that spaces the pegs and lays the weapon on the anvil with no hot tip, and the
// stowed view. The frame-by-frame checks of the barrel and the shield are in fire-barrel.test.js.
// Run with: node --test tests/web/
//
// The weapons are the test world's, from its copy of format 1.2 (the blaster with its deflector,
// and the prod, which is both swung and fired), and the trial crossbow made in memory
// (fixtures/crossbow.js). The page's scripts run under Node into a sandbox, with the knight and,
// where a test says so, the medieval world started from the packs on dev terms, and time frozen.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');
const { TRIAL } = require('./fixtures/crossbow.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const FIRE_TEXT = fs.readFileSync(ORBIT.FIRE_FILE, 'utf8');
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;
const BLASTER = { items: { main: O('main.blaster'), off: O('off.deflector') } };
const PROD = { items: { main: O('main.prod') } };
const CROSSBOW = { items: { main: 'test.trial/main.crossbow' } };
const ARMING = { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } };
const L = Math.PI / 2;
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (what || '') + ': ' + a + ' is not ' + b);

/* A context that writes one line per call it is asked to keep: "fillStyle <colour>" and
   "r x y w h" for a fillRect. */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { if (log) log.push(String(k) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => { if (log && k === 'fillRect') log.push('r ' + a.join(' ')); };
    }
  });
}
/* The page in the look given: the knight from the packs, and the medieval world's scenes when world
   is set (the code's otherwise). Time is frozen at 0 until a test moves it. log keeps what the
   engine draws on the screen, and bg what is painted into canvases of their own (the backdrop). */
function page(look, world) {
  const log = [], bg = [];
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context(bg); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, texts = [BASE_TEXT, MED_TEXT, FIRE_TEXT, TRIAL];
  KW.knight.start(texts, true, { look: look || {} });
  if (world) KW.world.start(texts, true);
  assert.equal(KW.knight.source, 'pack');
  assert.deepEqual(plain(KW.knight.status.fallbacks).filter(f => f.reason !== 'not set'), [], 'the look is drawn as asked');
  KW.ui = { caption() {} };
  KW.hooks = { frozen: true, t: 0 };
  return { KW, K: KW.knight, E: KW.engine, V: KW.view, log, bg };
}
const PIE = { place: 'pie', kind: 'pi', ok: true, alert: true };
/* The engine in the condition id (all quiet when left out) in the scene is, time frozen. */
function engine(m, id, is, extra) {
  const { KW, E } = m, w = id ? Object.assign({ id, hl: '', sub: '' }, KW.state.CONDITIONS[id]) : KW.state.IDLE;
  KW.hooks = Object.assign({ frozen: true, t: 0 }, extra && extra.hooks);
  m.log.length = 0;
  E.init(context(m.log)); E.reset();
  E.input = Object.assign({ w, is: is || 'auto', devices: [PIE], tv: false, helmet: 'auto' }, extra && extra.input);
  return E;
}
const at = (m, t) => { m.KW.hooks.t = t; m.log.length = 0; m.E.draw(t); };
/* Runs fn and returns each pose the knight was drawn in, copied. */
function poses(m, fn) {
  const K = m.K, draw = K.draw, out = [];
  K.draw = o => { out.push(Object.assign({}, o)); return draw(o); };
  try { fn(); } finally { K.draw = draw; }
  return out;
}
const colours = log => new Set(log.filter(l => l.startsWith('fillStyle ')).map(l => l.slice(10)));

// ---- The swat ------------------------------------------------------------------------------------

/* The battlement with n flies settled, the oldest at -9000, alternate sides as they come, and the
   swat started at 0. */
function swatting(m, n) {
  const E = engine(m, null, 'battlement');
  at(m, 0);
  for (let i = 0; i < n; i++) E.addFly(-9000 + i * 400);
  E.startSwat(0);
  return E;
}

test('the swat by shot: one shot per settled fly, one side\'s flies and then the other\'s, 300 ms apart, turning once', () => {
  for (const look of [BLASTER, CROSSBOW]) {
    const m = page(look), E = swatting(m, 7), V = E.shots.VOLLEY;
    assert.deepEqual(plain(V), { raise: 450, gap: 300, after: [80, 560] });
    const plan = E.shots.swat().shots, flies = E.pet.flies();
    assert.equal(plan.length, 7);
    // the oldest fly's side first, each side oldest first, so the side changes once
    const oldest = flies.slice().sort((a, b) => a.born - b.born)[0];
    assert.equal(plan[0].f, oldest);
    const sides = plan.map(s => s.dir), changes = sides.slice(1).filter((d, i) => d !== sides[i]).length;
    assert.equal(changes, 1, sides.join(' '));
    for (const d of [1, -1]) { const b = plan.filter(s => s.dir === d).map(s => s.f.born); assert.deepEqual(b, b.slice().sort((x, y) => x - y)); }
    assert.deepEqual(plain(plan.map(s => s.t)), [450, 750, 1050, 1350, 1650, 1950, 2250]);
    // played frame by frame: each shot leaves at its moment and pops its fly as it lands
    const seen = poses(m, () => { for (let t = 0; t <= 3000; t += 10) at(m, t); });
    const shots = E.shots.live().concat();
    let dead = 0;
    for (const s of plan) {
      assert.ok(s.f.dead > 0, 'popped');
      dead++;
    }
    assert.equal(dead, 7);
    // the turn across the body happens once: the weapon points to the other side once
    const dirs = seen.filter(o => o.aimed && o.t >= 450 && o.t < 2250).map(o => Math.sign(Math.sin(o.wang)));
    assert.equal(dirs.slice(1).filter((d, i) => d !== dirs[i]).length, 1);
    // as each shot leaves, the weapon is aimed within 0.3 below level and the swat's higher limit
    // above it
    for (const o of seen.filter(p => plan.some(q => p.t === q.t - 10))) {
      const lv = Math.sign(Math.sin(o.wang)) * L, up = (lv - o.wang) * Math.sign(lv);
      assert.ok(up <= m.K.aim.AIM.swatAbove + .09 && up >= -.3 - 1e-9, 'aimed ' + up);
    }
    assert.equal(E.shots.swat(), null, 'over once the last return has ended (2250 + 640)');
    assert.ok(shots.length <= 8);
  }
});

test('each fly is popped when its shot reaches it, by a bolt at 1.6 pixels a ms from the muzzle', () => {
  const m = page(BLASTER), E = swatting(m, 4), plan = E.shots.swat().shots, made = new Map();
  for (let t = 0; t <= 2000; t += 5) {
    at(m, t);
    for (const r of E.shots.live()) made.set(r.t0, r);
  }
  assert.equal(made.size, 4);
  for (const s of plan) {
    const r = made.get(s.t);
    assert.ok(r, 'a shot at ' + s.t);
    assert.equal(r.kind, 'bolt');
    near(r.lands, s.t + Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]) / E.shots.SHOT.speed, 1e-6);
    assert.equal(s.f.dead, Math.max(1, Math.round(r.lands)));
    assert.deepEqual(plain(s.f.at), plain(r.to));
  }
});

test('the prod, which is both, swings at the flies, and a sword swings as it always did', () => {
  for (const look of [PROD, ARMING]) {
    const m = page(look), E = swatting(m, 3), sw = E.shots.swat();
    assert.ok(Array.isArray(sw.segs) && !sw.shots, 'the swing');
    for (let t = 0; t <= 2000; t += 20) at(m, t);
    assert.equal(E.shots.live().length, 0, 'no shot');
  }
});

// ---- Practice ------------------------------------------------------------------------------------

test('the target\'s middle: the yard\'s dummy, as the code draws it and as the medieval pack\'s group box gives it', () => {
  const code = page(BLASTER), world = page(BLASTER, true);
  assert.deepEqual(plain(code.KW.scenes.yard.target), [710, 380]);
  assert.deepEqual(plain(world.KW.scenes.yard.target), [710, 380]);
  assert.ok(world.KW.scenes.yard.paint && world.KW.scenes.yard !== code.KW.scenes.yard);
  assert.equal(code.E.shots.PRACTICE, 300);
});

test('practice by shot: from 300 short of the target, every 5.6 s, the dummy struck as the shot lands, with the burst', () => {
  for (const world of [false, true]) for (const look of [BLASTER, CROSSBOW, PROD]) {
    const m = page(look, world), E = engine(m, null, 'yard', { hooks: { kx: 82 } }), sc = m.KW.scenes.yard;
    const seen = poses(m, () => { at(m, 0); });
    assert.equal(seen[0].x, 410, 'at the practice spot');
    // the beat counts from the arrival (1 under frozen time): a shot leaves 450 ms in, every 5600
    for (const beat of [0, 1]) {
      const t0 = 1 + beat * 5600;
      at(m, t0 + 449);
      assert.equal(E.shots.live().length, 0, 'not yet');
      const before = sc.struck();
      assert.ok(before < t0 + 449, 'not struck before the shot');
      at(m, t0 + 450);
      const r = E.shots.live()[0], fw = m.K.fired();
      assert.ok(r, 'the shot leaves at the middle of the beat');
      assert.deepEqual([r.t0, r.kind, r.burst], [t0 + 450, fw.shot.kind, E.shots.SHOT.burst]);
      assert.deepEqual(plain(r.to), [710, 380]);
      // from the muzzle, short of the dummy's middle: the prod's, 204 along its frame, reaches 682
      assert.ok(r.from[0] > 410 + 60 && r.from[0] < 700, 'from the muzzle, short of the dummy: ' + r.from);
      // a bolt flies there; a beam is there at once
      if (r.kind === 'bolt') { at(m, Math.ceil(r.lands) - 1); assert.equal(sc.struck(), before, 'not struck before the bolt lands'); }
      at(m, Math.ceil(r.lands));
      assert.equal(sc.struck(), r.lands, 'struck as it lands');
      E.shots.clear();
    }
  }
});

test('running hot with a weapon that fires, the watcher walks to the practice spot and shoots every second', () => {
  for (const world of [false, true]) {
    const m = page(BLASTER, world), E = engine(m, 'cpu_hot'), sc = m.KW.scenes.yard;
    m.KW.hooks.frozen = false;
    let t = 0, x = 0;
    const seen = [];
    poses(m, () => {});
    const K = m.K, draw = K.draw;
    K.draw = o => { seen.push({ x: o.x, walk: !!o.walk, aimed: !!o.aimed }); x = o.x; return draw(o); };
    for (; t < 1600; t += 16) at(m, t);
    assert.equal(E.scene(), 'yard');
    assert.ok(seen[0].x >= 518 && seen[0].x <= 520, 'from the spot: ' + seen[0].x);
    assert.ok(Math.abs(x - 410) <= 2, 'walked to the practice spot: ' + x);
    assert.ok(!seen.some(s => s.walk && s.aimed), 'no shot while walking');
    for (; t < 6000; t += 16) at(m, t);
    K.draw = draw;
    const lands = [];
    m.KW.hooks.frozen = true;
    for (let s = 6000; s < 9000; s += 1000) { at(m, s + 500); const r = E.shots.live().find(q => q.t0 === s + 500); assert.ok(r, 'a shot at ' + (s + 500)); at(m, Math.ceil(r.lands)); lands.push(sc.struck() === r.lands); }
    assert.deepEqual(lands, [true, true, true]);
  }
});

test('with a sword the yard trains as it always did, and has no shot', () => {
  const m = page(ARMING), E = engine(m, null, 'yard');
  const seen = poses(m, () => { for (let t = 0; t < 1000; t += 50) at(m, t); });
  assert.equal(seen[0].x, 520);
  assert.equal(E.shots.live().length, 0);
});

// ---- The foe -------------------------------------------------------------------------------------

/* The plan of the goblin's event in scene with the watcher at kx. */
function planFor(m, scene, kx, devices) {
  const sc = m.KW.scenes[scene], o = m.K.pose('idle', 0);
  o.floor = m.V.HFL; o.x = kx; o.helmet = true; o.bob = 0;
  return m.E.foe.plan('goblin', sc, { devices: devices || [PIE], places: sc.places }, o);
}

test('the foe by shot: at the shot\'s gap, the watcher stepping back up to 160 while it climbs in, in its zone', () => {
  for (const look of [BLASTER, CROSSBOW]) for (const world of [false, true]) {
    const m = page(look, world), S = m.E.foe.FOE.shot;
    assert.deepEqual(plain(S), { gap: [200, 300, 320], most: 420, clear: 30, step: 160, stepMs: 900, aim: 1250, fire: 1400 });
    for (const scene of ['battlement', 'camp']) for (const x of m.KW.scenes[scene].rounds.map(r => r.x * m.V.U)) {
      const pl = planFor(m, scene, x), what = scene + ' ' + x + ' ' + look.items.main;
      assert.ok(pl && pl.shot, what + ': a plan by shot');
      const f = pl.shot, gap = Math.abs(pl.x - f.kx);
      assert.equal(f.kx0, x);
      assert.ok(Math.abs(f.kx - x) <= S.step && Math.sign(f.kx - x) !== pl.side, what + ': stepped back ' + (f.kx - x));
      assert.ok(gap >= f.gaps[0] && gap <= f.gaps[2], what + ': gap ' + gap + ' in ' + f.gaps);
      assert.ok(f.gaps[0] >= 236 || look === BLASTER, what + ': the least keeps the crossbow\'s muzzle clear: ' + f.gaps[0]);
      // the muzzle is clear of the foe by 30 at the least
      assert.ok(Math.abs(f.from[0] - pl.x) >= pl.F.w + S.clear - 1, what + ': the muzzle clear of the foe');
      const z = m.KW.scenes[scene].foeZone;
      assert.ok(z.spans.some(([a, b]) => pl.x >= a && pl.x <= b), what + ': in its zone');
      // the hit when the bolt meets the body on its way to the mid, inside the event
      near(pl.hit, Math.round(S.fire + Math.hypot(pl.touch[0] - f.from[0], pl.touch[1] - f.from[1]) / m.E.shots.SHOT.speed), 1.5, what);
      assert.ok(pl.hit > S.fire && pl.hit + pl.exit.close[1] <= 3400, what + ': hit at ' + pl.hit);
    }
  }
});

test('the foe\'s event by shot: the step back over 900 ms, aimed from 1250, fired at 1400, the recoil and the return', () => {
  const m = page(BLASTER), E = engine(m, null, 'battlement'), S = E.foe.FOE.shot, R = E.foe.FOE.strike;
  at(m, 0); E.fireEvent('goblin');
  const seen = [];
  const K = m.K, draw = K.draw;
  K.draw = o => { seen.push(Object.assign({}, o)); return draw(o); };
  const ts = [0, 450, 900, 1249, 1300, 1399, 1400, 1460, 1480, 2040, 3399];
  let made = null;
  for (const t of ts) { at(m, t); if (t === 1400) made = E.shots.live().slice(); }
  K.draw = draw;
  const by = t => seen[ts.indexOf(t)];
  const f = planFor(m, 'battlement', by(0).x).shot;
  assert.equal(by(0).x, f.kx0);
  assert.ok(by(450).walk && by(450).x !== f.kx0 && by(450).x !== f.kx);
  assert.equal(by(900).x, f.kx); assert.ok(!by(900).walk);
  assert.ok(!by(1249).aimed, 'the stance until the aim');
  assert.ok(by(1300).aimed && by(1399).aimed);
  const a = K.aim.angle(Object.assign({}, by(1399), { x: f.kx }), -1, f.mid);
  near(Math.sin(by(1399).wang), Math.sin(a), .02, 'aimed at the mid just before the shot'); near(Math.cos(by(1399).wang), Math.cos(a), .02);
  assert.ok(by(2040).aimed === false, 'back in the stance by ' + (S.fire + R.rebound + R.recover));
  // the one shot, from the muzzle, at 1400
  assert.equal(made.length, 1);
  const r = made[0];
  assert.deepEqual([r.t0, r.burst], [1400, 0]);
  assert.deepEqual(plain(r.from), plain(f.from));
  assert.equal(E.note, 'no flies');
});

test('the prod swings at a foe its blade reaches and shoots at one beyond it; the goblin does not fire, and Glitch fires first', () => {
  const m = page(PROD);
  const near = planFor(m, 'battlement', 480);
  assert.ok(near && !near.shot && near.q < 1, 'within reach: the swing');
  const far = planFor(m, 'battlement', 760);
  assert.ok(far && far.shot, 'beyond its reach: the shot');
  // its muzzle, 274 from its middle aimed level, raises the least gap past 320, as far as its range
  assert.ok(far.shot.gaps[0] > 320 && far.shot.gaps[2] <= 360, plain(far.shot.gaps).join(' '));
  // a sword at the same place has no plan at all, as before
  const s = page(ARMING);
  assert.equal(planFor(s, 'battlement', 760), null);
  // the goblin gives the event one shot, the watcher's; Glitch fires its own first, at 1350
  // (tests/web/foe-fires.test.js)
  for (const [foe, want] of [['goblin', [1400]], [O('foe.glitch'), [1350, 1400]]]) {
    const o = page(BLASTER, true), E = engine(o, null, 'battlement', { input: { foe } });
    at(o, 0); E.fireEvent('goblin');
    const made = new Set();
    for (let t = 0; t < 3400; t += 25) { at(o, t); for (const r of E.shots.live()) made.add(r.t0); }
    assert.deepEqual([...made], want, foe);
  }
});

// ---- The attack ----------------------------------------------------------------------------------

test('the attack: aimed to the right with the sword\'s tremble, and never fired', () => {
  for (const look of [BLASTER, CROSSBOW, PROD]) {
    const m = page(look), E = engine(m, 'attack');
    const seen = poses(m, () => { for (let t = 0; t <= 2000; t += 10) at(m, t); });
    assert.equal(seen.length, 201);
    for (const o of seen) {
      assert.ok(o.aimed);
      near(o.wang, L + Math.sin(o.t / 90) * .12, 1e-12);
    }
    const AIM = look === BLASTER ? m.K.aim.AIM1 : m.K.aim.AIM2;
    assert.deepEqual([seen[0].gx, seen[0].gy], [AIM.gx, AIM.gy]);
    assert.equal(E.shots.live().length, 0, 'no shot');
  }
});

// ---- Gear at rest --------------------------------------------------------------------------------

test('rest.reach() gives the blade, or the barrel of a weapon that only fires', () => {
  assert.deepEqual(plain(page(BLASTER).K.rest.reach()), plain(JSON.parse(FIRE_TEXT).pack.items['main.blaster'].barrel));
  assert.deepEqual(plain(page(PROD).K.rest.reach()), plain(JSON.parse(FIRE_TEXT).pack.items['main.prod'].blade));
  assert.deepEqual(plain(page(CROSSBOW).K.rest.reach()), { from: 54, to: 96, half: 8 });
  assert.deepEqual(plain(page(ARMING).K.rest.reach()), { from: 34, to: 175, half: 10 });
});

/* The xs of the house's pegs as drawn into its backdrop: the middles of the peg's 10-wide fill. */
function pegs(m) {
  engine(m, null, 'house');
  m.bg.length = 0;
  at(m, 0);
  const xs = new Set();
  // the peg's outline, 14 wide, at its middle
  for (const l of m.bg) { const p = l.split(' '); if (p[0] === 'r' && +p[3] === 14 && +p[2] === 250) xs.add(+p[1] + 7); }
  return [...xs].sort((a, b) => a - b);
}

test('the house\'s pegs are spaced from the reach: 28 past where it starts and 45 short of its end', () => {
  for (const [look, b] of [[ARMING, { from: 34, to: 175 }], [BLASTER, { from: 22, to: 64 }], [CROSSBOW, { from: 54, to: 96 }]]) {
    const m = page(look);
    assert.deepEqual(pegs(m), [618 + b.from + 28, 618 + b.to - 45].sort((x, y) => x - y), look.items.main);
  }
});

/* Whether the smithy draws the hot tip: the colour of its first band. */
function hotTip(m) {
  engine(m, 'updating');
  at(m, 0);
  return colours(m.log).has('#8f231d');
}

test('the anvil takes a weapon that only fires with no hot tip, and heats the blade of one that is both', () => {
  for (const world of [false, true]) {
    assert.equal(hotTip(page(ARMING, world)), true, 'the sword');
    assert.equal(hotTip(page(PROD, world)), true, 'the prod, on its blade');
    assert.equal(hotTip(page(BLASTER, world)), false, 'the blaster');
    assert.equal(hotTip(page(CROSSBOW, world)), false, 'the crossbow');
  }
});

// ---- Stowed gear ---------------------------------------------------------------------------------

const STRING = '#eae2cc';
/* Whether the crossbow's stowed view (its string's colour, with the weapon not held) is drawn on
   the screen in the condition id in the scene is. */
function stowed(m, id, is, input) {
  engine(m, id, is, { input });
  at(m, 2300);
  return colours(m.log).has(STRING);
}

test('stowed gear: drawn on the body while the weapon is put away where the scene shows it at no rest place', () => {
  for (const world of [false, true]) {
    const m = page(CROSSBOW, world);
    assert.equal(stowed(m, 'disk_full'), true, 'the cellar, carrying the crate');
    assert.equal(stowed(m, 'disk_full', 'auto', { scenes: { disk_full: 'yard' } }), true, 'the crate carried in the yard');
    assert.equal(stowed(m, null, 'house'), false, 'the house, the weapon on its pegs (drawn into the backdrop)');
    assert.equal(stowed(m, 'updating'), false, 'the smithy, the weapon on the anvil');
    assert.equal(stowed(m, 'night'), false, 'in bed nothing is');
    assert.equal(stowed(m, null, 'yard'), true, 'held in the yard: the string is the weapon\'s own');
  }
});

test('the stowed view is drawn in the body\'s list, after the back slot when slung and after the torso when holstered', () => {
  const lib = require('../../web/js/pack.js'), s = JSON.stringify;
  const packs = lib.gather([BASE_TEXT, FIRE_TEXT, TRIAL].map(t => lib.read(t, { allowUnsigned: true }))).packs;
  const lists = look => { const r = lib.resolve(packs, look); assert.ok(r.ok); return r.lists; };
  // the crossbow slung: with no back slot the view comes first; with the cloak, after the cloak
  const bare = lists(CROSSBOW), n = bare.bodyStowed.length - bare.body.length, view = bare.bodyStowed.slice(0, n);
  assert.ok(n > 0);
  assert.equal(s(bare.bodyStowed.slice(n)), s(bare.body));
  const cloak = lists({ items: Object.assign({ back: 'kw.base/back.cloak' }, CROSSBOW.items) }), k = cloak.body.length - bare.body.length;
  assert.ok(k > 0);
  assert.equal(s(cloak.bodyStowed), s(cloak.body.slice(0, k).concat(view, cloak.body.slice(k))));
  // the blaster holstered: after the torso, the last of the body
  const b = lists(BLASTER);
  assert.ok(b.bodyStowed.length > b.body.length);
  assert.equal(s(b.bodyStowed.slice(0, b.body.length)), s(b.body));
  // a weapon with no stowed view has no such list
  assert.equal(lists(ARMING).bodyStowed, undefined);
  assert.equal(lists({}).bodyStowed, undefined);
});

// ---- The shield ----------------------------------------------------------------------------------

test('the shield lifts as a one-handed weapon turns across the body, and nowhere else', () => {
  const m = page(BLASTER), K = m.K, X = 480, F = m.V.HFL, LIFT = K.aim.LIFT;
  assert.deepEqual(plain(LIFT), { fy: -16, in: .1 });
  const at = () => { const o = K.pose('idle', 2300); o.x = X; o.floor = F; o.bob = 0; return o; };
  const lv = K.aim.pose(at(), -1, -L), st = at();
  for (const [q, up] of [[0, 0], [.15, 1], [.3, 0], [.4, 0], [.6, 0], [.8, 1], [1, 0]]) {
    const o = at(); K.fire(o, q, -1, [X - 300, F - 125]);
    // to the left the turn runs from the stance to level (q 0 to .3) and back (.6 to 1)
    const from = q <= .3 ? [st.fy, lv.fy] : [lv.fy, st.fy], k = q <= .3 ? q / .3 : (q - .6) / .4;
    if (up) assert.ok(o.fy < Math.max(...from) + LIFT.fy * .9, 'q ' + q + ': lifted ' + o.fy);
    else assert.ok(o.fy >= Math.min(...from) - 1e-9, 'q ' + q + ': not lifted ' + o.fy + ' at ' + k);
  }
  // to the right the weapon does not cross, and the shield stays in front
  for (let q = 0; q <= 1; q += .05) { const o = at(); K.fire(o, q, 1, [X + 300, F - 125]); assert.ok(o.fy >= Math.min(st.fy, K.aim.AIM1.fy) - 1e-9, 'right q ' + q); }
  // without a shield, and with two hands, nothing lifts
  const bare = page({ items: { main: O('main.blaster') } }), o = bare.K.pose('idle', 2300); o.x = X; o.floor = F; o.bob = 0;
  bare.K.fire(o, .15, -1, [X - 300, F - 125]);
  assert.ok(o.fy >= Math.min(st.fy, K.aim.AIM1.fy) - 1e-9);
});
