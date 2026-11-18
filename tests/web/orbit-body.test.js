// Tests for the test world's body, "Unit" (test.orbit/body.unit), a build at an end of every
// measurement's range: every pose, swing frame, attack frame and the strike drawn on it without a
// throw, a fallback or a broken number, each frame within the look's cost, in its own outfit with
// the pry bar in both hands and in the base pack's gear with a weapon in one hand and a shield in
// the other; the hands on the grip through both swings and the strike; and a foe met by the weapon
// on the Deck and on the battlement. Run with: node --test tests/web/
//
// Orbit is never under web/ and never signed: it is read here, on dev terms (docs/development.md,
// The test world).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const TEXT = fs.readFileSync(ORBIT.FILE, 'utf8');
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;
const UNIT = O('body.unit');
const READS = [PK.read(BASE_TEXT, { allowUnsigned: true }), PK.read(TEXT, { allowUnsigned: true })];

/* A canvas context that writes one line per call, "r x y w h" for a fillRect. */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { log.push(String(k) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a.map(x => (x && typeof x === 'object' ? 'canvas' : x))].join(' ')); };
    }
  });
}
/* The page's scripts in a sandbox, the knight and the world started from the base pack, the
   medieval world's and Orbit's on dev terms, drawing into a context that writes into log. */
function page() {
  const log = [];
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context([]); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, texts = [BASE_TEXT, MED_TEXT, TEXT];
  KW.knight.start(texts, true);
  KW.world.start(texts, true);
  KW.ui = { caption() {} };
  KW.draw.setCtx(context(log));
  return { KW, K: KW.knight, log };
}
const P = page();

const X = 480, FLOOR = 530;
/* The pose for a condition at time t, placed as the engine places it, with fields laid over it. */
function at(K, id, t, over) {
  const o = K.pose(id, t);
  o.floor = FLOOR; o.x = X; o.helmet = true;
  return Object.assign(o, over);
}
/* Every frame drawn on the body: each condition's pose, the walk, the faces, what floats round the
   knight, both swings, the attack, the hammer, the head in bed, the speech bubble and the gear at
   rest. */
function frames(K) {
  const p = [];
  const knight = (name, id, t, over, then) => p.push([name, () => { const o = at(K, id, t, over); if (then) then(o); K.draw(o); }]);
  for (const t of [100, 1000, 2300]) knight(`idle t${t}`, 'idle', t);
  knight('walk', 'idle', 1920, { walk: true, x: 481.5 });
  for (const id of Object.keys(P.KW.state.CONDITIONS)) for (const t of [600, 1400, 2300, 2800, 4250]) knight(`${id} t${t}`, id, t);
  for (const dir of [1, -1]) for (let k = 0; k <= 20; k++) knight(`swing ${dir} q${k / 20}`, 'idle', 2300, null, o => K.swing(o, k / 20, dir));
  for (let t = 0; t < 1000; t += 100) knight(`attack t${t}`, 'attack', t);
  for (const h of [0, 0.5, 1]) knight(`hammer ${h}`, 'updating', 2300, { sword: false, helmet: false, hammer: h, progress: h });
  knight('helmet off', 'idle', 2300, { helmet: false });
  knight('sword off bloated', 'memory_tight', 600, { sword: false });
  for (const eyes of ['open', 'closed', 'happy', 'wide', 'half', 'dizzy', 'angry']) knight(`eyes ${eyes}`, 'idle', 2300, { eyes, look: 1 });
  for (const mouth of ['smile', 'frown', 'open', 'pant', 'o', 'flat', 'chew', 'talk']) knight(`mouth ${mouth}`, 'idle', 2300, { mouth });
  knight('face sick', 'idle', 2300, { face: 'L', thermo: 1 });
  knight('face hot puffed', 'idle', 2300, { face: 'P', puff: 1 });
  knight('everything at once', 'memory_tight', 2800, { walk: true, x: 482.5, food: 1, bubble: 1, progress: 0.5, hearts: true, mark: '!', sweat: 1, steam: 1, speak: true, droop: 1, headDx: 1, headDy: 1, shake: -1 });
  p.push(['head in bed', () => K.head(-15, 262, at(K, 'night', 2300))]);
  p.push(['head in bed unwell', () => { const o = at(K, 'container_unhealthy', 1400); K.head(-15 + o.headDx * 5, 262, o); }]);
  p.push(['speech', () => K.speech(300, 120, 700, false)]);
  for (const slot of ['main', 'helmet', 'off']) p.push([`${slot} at rest`, () => K.rest.draw(slot, 490, 425, Math.PI / 2)]);
  return p;
}

/* The looks Unit is drawn in: Orbit chosen whole, and Unit in the base pack's gear with a weapon in
   one hand, with the free items of 1.4.0 besides. */
const ORBIT_LOOK = SET.knightLook(plain(P.KW.settings.create({ hooks: { look: { world: O('world.orbit') } }, storage: () => null,
  pack: () => P.K.basePack(), world: () => P.KW.settings.pageWorld(), say() {} }).now()));
const LOOKS = {
  'its own outfit, the pry bar in both hands': [ORBIT_LOOK, 'two'],
  'the base pack\'s arming sword and heater shield': [{ build: UNIT, items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } }, 'one'],
  'the base pack\'s mace and kite shield and its free gear': [{ build: UNIT, items: { main: 'kw.base/main.mace', off: 'kw.base/off.kite', helmet: 'kw.base/helm.bascinet',
    plume: 'kw.base/plume.horsehair', torso: 'kw.base/torso.cuirass', pauldrons: 'kw.base/pauldrons.lames', arms: 'kw.base/arms.mail', gauntlets: 'kw.base/gauntlets.mail',
    legs: 'kw.base/legs.mail', boots: 'kw.base/boots.sabatons', back: 'kw.base/back.cloak', hair: 'kw.base/hair.long' } }, 'one'],
  'the base pack\'s longsword': [{ build: UNIT, items: { main: 'kw.base/main.longsword', back: 'kw.base/back.cape' } }, 'two']
};

test('Unit stands at an end of every measurement\'s range, its torso within the torso\'s range', () => {
  const m = READS[1].data.builds['body.unit'].m;
  for (const [name, , lo, hi] of PK.MEASURES) assert.ok(m[name] === lo || m[name] === hi, `${name} ${m[name]} is at neither end of ${lo} to ${hi}`);
  assert.deepEqual(PK.MEASURES.map(([name, , lo]) => (m[name] === lo ? 'low' : 'high')), ['low', 'low', 'low', 'low', 'low', 'high', 'high', 'low']);
  assert.ok(m.height - m.leg >= PK.TORSO[0] && m.height - m.leg <= PK.TORSO[1], 'a torso of ' + (m.height - m.leg));
  assert.equal(plain(ORBIT_LOOK).build, UNIT);
});

for (const [name, [look, grip]] of Object.entries(LOOKS)) {
  test(`Unit in ${name}: every pose, swing and attack frame draws without a throw, a fallback or a broken number, each within the look's cost`, () => {
    const K = P.K, lib = P.KW.pack, draw0 = lib.draw, log = P.log;
    const st = K.look(look);
    assert.equal(st.source, 'pack');
    assert.deepEqual(plain(st.fallbacks.filter(f => f.reason !== 'not set')), [], 'every item fits the body and is drawn as chosen');
    assert.equal(K.rig(at(K, 'idle', 2300)).grip, grip);
    const L = PK.resolve(READS, look);
    assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost, `${L.shapes} shapes, cost ${L.cost}`);
    let inList = false, fills = 0, most = 0;
    lib.draw = (...a) => { inList = true; try { return draw0(...a); } finally { inList = false; } };
    try {
      for (const [frame, fn] of frames(K)) {
        log.length = 0; fills = 0;
        const push = log.push;
        log.push = (...ls) => { if (inList) for (const l of ls) if (l.startsWith('r ')) fills++; return push.apply(log, ls); };
        fn();
        log.push = push;
        assert.equal(K.source, 'pack', `${frame}: nothing threw`);
        assert.ok(fills <= L.cost, `${frame}: ${fills} fills, more than the cost of ${L.cost}`);
        most = Math.max(most, fills);
        assert.ok(!log.some(l => /NaN|undefined/.test(l)), `${frame}: no broken number or colour`);
        assert.ok(log.some(l => l.startsWith('r ')) || /at rest|speech/.test(frame), `${frame}: draws something`);
      }
    } finally { lib.draw = draw0; K.look({}); }
    assert.ok(most > 0, 'the look\'s fills were counted');
  });
}

test('on Unit the hands stay on the grip through both swings, the attack and the strike, and hang below the shoulders without a weapon', () => {
  const K = P.K, F = P.KW.engine.foe, S = F.FOE.strike;
  for (const [name, [look, grip]] of Object.entries(LOOKS)) {
    K.look(look);
    const list = [];
    for (const side of [1, -1]) for (const q of [0.45, 0.55]) {
      const pl = { side, q, hit: S.at + Math.round(q * S.dur) };
      for (let r = -400; r <= S.rebound + S.recover; r += 40) list.push([`strike ${side} q${q} ${r} ms`, () => { const o = at(K, 'idle', 2300, { bob: 0 }); F.strike(o, pl.hit + r, pl); return o; }]);
    }
    for (const dir of [1, -1]) for (let k = 0; k <= 100; k += 2) list.push([`swing ${dir} q${k / 100}`, () => { const o = at(K, 'idle', 2300); K.swing(o, k / 100, dir); return o; }]);
    for (let t = 0; t < 2000; t += 40) list.push([`attack t${t}`, () => at(K, 'attack', t)]);
    for (const [frame, make] of list) {
      const o = make(), r = K.rig(o), m = [...r.anchors.main], Lh = [...r.anchors.handL], Rh = [...r.anchors.handR];
      assert.equal(r.grip, grip, `${name} ${frame}`);
      if (grip === 'one') { assert.deepEqual(Rh, [m[0], m[1]], `${name} ${frame}: the weapon hand on the grip`); continue; }
      const sx = Math.sin(m[2]), sy = -Math.cos(m[2]);
      for (const [h, side] of [[Lh, 'left'], [Rh, 'right']]) {
        const along = (h[0] - m[0]) * sx + (h[1] - m[1]) * sy, across = Math.abs((h[0] - m[0]) * sy - (h[1] - m[1]) * sx);
        assert.ok(across < 1e-9 && along >= -30 - 1e-9 && along <= 2 + 1e-9, `${name} ${frame}: the ${side} hand ${along.toFixed(2)} along the grip, ${across.toFixed(2)} off it`);
      }
    }
    const A = K.rig(at(K, 'idle', 2300, { sword: false })).anchors;
    assert.deepEqual([A.handL[0] - A.shoulderL[0], A.handL[1] - A.shoulderL[1], A.handR[0] - A.shoulderR[0], A.handR[1] - A.shoulderR[1]], [-10, 48, 10, 48], name);
  }
  K.look({});
});

test('on Unit every weapon meets Glitch and the goblin, out of the Deck\'s floor and over the battlement\'s wall', () => {
  const KW = P.KW, E = KW.engine, K = P.K;
  for (const [name, [look]] of Object.entries(LOOKS)) {
    K.look(look);
    for (const foe of [O('foe.glitch'), 'goblin']) for (const scene of [O('deck'), 'battlement']) {
      E.input = Object.assign({}, E.input, { foe });
      const sc = KW.scenes[scene], o = Object.assign(K.pose('idle', 0), { x: sc.spot * KW.view.U, floor: KW.view.HFL });
      const pl = E.foe.plan('goblin', sc, { devices: [], places: sc.places }, o);
      assert.ok(pl, `${name}, ${foe} in ${scene}: room within the weapon's reach`);
      assert.equal(pl.F, KW.cast.foes[foe]);
      assert.equal(pl.burrow, scene !== 'battlement');
      assert.ok(pl.q > 0 && pl.q < 0.55 && pl.hit > E.foe.FOE.strike.at, `${name}, ${foe} in ${scene}: met at q ${pl.q}`);
    }
  }
  E.input = Object.assign({}, E.input, { foe: undefined });
  K.look({});
});
