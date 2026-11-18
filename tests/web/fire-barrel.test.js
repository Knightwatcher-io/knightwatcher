// The barrel check for weapons that fire (docs/design.md): no arm or gauntlet is drawn over a
// weapon's barrel forward of the front hand, from the barrel's from to its muzzle, nor over the face
// of a shield, in any frame the aiming stances, fire(), the swat's volley and the attack can draw;
// with a shield the turn across the body lifts it out of the weapon arm's way (docs/rig.md, Aiming
// and firing). Run with: node --test tests/web/
//
// The page's drawing code runs under Node, as tests/web/knight.test.js runs it, against a fake
// context that keeps, for every pixel of the 960 by 600 grid, which of the look's lists painted it
// last and whether the weapon's list painted it at or beyond the barrel's from along the frame. A
// barrel pixel then painted by an arm or a gauntlet is covered. The frames: AIM2 or AIM1 at every
// 0.05 of its range, from 0.3 below level to 1.2 above it, both ways; fire() at every 0.01 of q,
// both ways, aimed high, level and low; two volleys of the swat, each turning across the body three
// times, every 10 ms; and the attack every 100 ms. The weapons: the test world's blaster
// (one-handed, with and without its deflector) and prod (two-handed, both swung and fired), from its
// copy of format 1.2, the trial crossbow (fixtures/crossbow.js), two-handed, its front hand 38
// along the frame and its barrel from 54, and the base pack's own crossbow, which ships with the same
// stations and barrel. Each on the base pack's three builds in its three sleeves
// (plate arms and gauntlets, mail sleeves and mittens, padded sleeves and leather gloves), and on
// the test world's unit in its own panels.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('js/scenes/') && !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js', 'js/world.js', 'packs/medieval.pack.js'].includes(s));
const FIRE_TEXT = fs.readFileSync(ORBIT.FIRE_FILE, 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

const { TRIAL, crossbow } = require('./fixtures/crossbow.js');

/* ---- The check ------------------------------------------------------------------------------------ */

const W = 960, H = 600, X = 480, FLOOR = 530, L = Math.PI / 2;
const ENGINE_STEPS = ['crates', 'face', 'drumstick', 'hammer', 'effects'];
const MAIN = 1, OFF = 2, COVER = 3;
/* The page's drawing code with the base pack, the test world's copy of 1.2 and the trial pack, and
   a context that counts, per frame, the barrel's pixels and the shield's an arm or a gauntlet
   paints over. */
function rig() {
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, K = KW.knight, lib = KW.pack;
  K.start(KW.packText.concat([FIRE_TEXT, TRIAL]), true, { look: {} });
  assert.equal(K.source, 'pack');
  // per pixel, the frame in which the weapon last marked it barrel, the shield last painted it, and
  // an arm or a gauntlet was last counted over it
  const barrelAt = new Uint32Array(W * H), offAt = new Uint32Array(W * H), seenAt = new Uint32Array(W * H);
  const st = { frame: 0, from: 0, fr: null, cur: 0, names: [], i: 0, barrel: 0, shield: 0, painted: 0 };
  const seq0 = lib.sequence, draw0 = lib.draw;
  lib.sequence = (mode, helmet) => { const s = seq0(mode, helmet); st.names = s.filter(n => !ENGINE_STEPS.includes(n)); st.i = 0; return s; };
  lib.draw = (list, A, V, P, face) => {
    const n = st.names[st.i++];
    st.cur = n === 'main' ? MAIN : n === 'off' ? OFF : /^(arm|gaunt)/.test(n) ? COVER : 0;
    if (n === 'main') st.fr = [A[2 * lib.ANCHOR.main], A[2 * lib.ANCHOR.main + 1], A[lib.FRAME_SX], A[lib.FRAME_SY]];
    try { return draw0(list, A, V, P, face); } finally { st.cur = 0; }
  };
  KW.draw.setCtx(new Proxy({}, {
    set() { return true; },
    get(_, k) {
      if (k !== 'fillRect') return () => {};
      return (x, y, w, h) => {
        if (!st.cur) return;
        const x0 = Math.max(0, Math.round(x)), x1 = Math.min(W, Math.round(x + w)), y0 = Math.max(0, Math.round(y)), y1 = Math.min(H, Math.round(y + h)), f = st.frame;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0, i = yy * W + x0; xx < x1; xx++, i++) {
          if (st.cur === MAIN) {
            const [gx, gy, sx, sy] = st.fr, s = (xx + .5 - gx) * sx + (yy + .5 - gy) * sy;
            barrelAt[i] = s >= st.from ? f : 0;
            if (barrelAt[i]) st.painted++;
          } else if (st.cur === OFF) offAt[i] = f;
          else if (seenAt[i] !== f && (barrelAt[i] === f || offAt[i] === f)) {
            seenAt[i] = f;
            if (barrelAt[i] === f) st.barrel++; else st.shield++;
          }
        }
      };
    },
  }));
  /* Draws the pose o, and returns the barrel's and the shield's pixels painted over by an arm or a
     gauntlet drawn after them. */
  function covered(o) {
    st.frame++; st.barrel = 0; st.shield = 0;
    K.draw(o);
    return [st.barrel, st.shield];
  }
  return { KW, K, lib, st, covered };
}
const B = 'kw.base/', T = 'test.orbit/';
const WEAPONS = [['the base pack\'s crossbow', B + 'main.crossbow', null], ['the trial crossbow', 'test.trial/main.crossbow', null], ['the prod', T + 'main.prod', null], ['the blaster', T + 'main.blaster', null], ['the blaster and the deflector', T + 'main.blaster', T + 'off.deflector']];
const SLEEVES = [['plate', {}], ['mail', { arms: B + 'arms.mail', gauntlets: B + 'gauntlets.mail' }], ['padded and leather', { arms: B + 'arms.padded', gauntlets: B + 'gauntlets.leather' }]];
const BODIES = [];
for (const [b, name] of [['build.a', 'Classic'], ['build.b', 'Broad'], ['build.c', 'Slim']]) for (const [sl, items] of SLEEVES) BODIES.push([name + ' in ' + sl, Object.assign({ build: B + b }, { items })]);
BODIES.push(['the unit in its panels', { build: T + 'body.unit', items: { arms: T + 'arms.panel', gauntlets: T + 'gauntlets.panel' } }]);

/* Every frame of the aim and fire() for the look, with the barrel from its from (or from given). */
function frames(m, look, from) {
  const { K, st, covered } = m;
  K.look(look);
  assert.deepEqual(plain(K.status.fallbacks).filter(f => f.reason !== 'not set'), [], 'the look is drawn as asked');
  const fw = K.fired();
  assert.ok(fw, 'the weapon fires');
  st.from = from === undefined ? fw.barrel.from : from;
  const out = { frames: 0, barrel: 0, shield: 0, worst: '', painted: 0 };
  const pose = () => { const o = K.pose('idle', 2300); o.x = X; o.floor = FLOOR; o.helmet = true; o.bob = 0; return o; };
  const one = (label, o) => {
    st.painted = 0;
    const [b, s] = covered(o);
    out.frames++; out.barrel += b; out.shield += s; out.painted += st.painted;
    if ((b || s) && !out.worst) out.worst = label + ': ' + b + ' barrel and ' + s + ' shield pixels';
  };
  for (const dir of [1, -1]) for (let k = 0; k <= 30; k++) { const a = -.3 + k * .05; one('aim ' + dir + ' ' + a.toFixed(2), K.aim.pose(pose(), dir, dir * (L - a))); }
  for (const dir of [1, -1]) for (const dy of [-400, -125, -40]) for (let k = 0; k <= 100; k++) {
    const o = pose(), q = k / 100;
    K.fire(o, q, dir, [X + dir * 300, FLOOR + dy]);
    one('fire ' + dir + ' dy ' + dy + ' q ' + q, o);
  }
  // the swat's volley, both ways round: a shot to one side, two to the other, one back, at flies
  // level, high and nearly overhead (the swat's higher limit), every 10 ms from the raise to the
  // end of the return, as the engine times it
  for (const first of [1, -1]) {
    const marks = [[first, 200, -260], [-first, 260, -330], [-first, 90, -470], [first, 150, -420]].map(([dir, dx, dy], i) => ({ dir, t: 450 + 300 * i, at: [X + dir * dx, FLOOR + dy] }));
    for (let el = 0; el <= 1350 + 640; el += 10) { const o = pose(); K.volley(o, el, marks, 450, [80, 560]); one('volley ' + first + ' el ' + el, o); }
  }
  // the attack, aimed and trembling, every 100 ms for two seconds
  for (let t = 0; t <= 2000; t += 100) { const o = K.pose('attack', t); o.x = X; o.floor = FLOOR; o.helmet = true; o.bob = 0; one('attack ' + t, o); }
  return out;
}

/* The frames of each set: the aim 62, fire() 606, two volleys of 200 and the attack 21. */
const FRAMES = 62 + 606 + 2 * 200 + 21;
const M = rig();
for (const [what, main, off] of WEAPONS) {
  test(`no arm is drawn over the barrel forward of the front hand, nor over the shield, frame by frame: ${what}`, () => {
    for (const [body, look0] of BODIES) {
      const look = { build: look0.build, items: Object.assign({ main }, look0.items, off ? { off } : {}) };
      const r = frames(M, look);
      assert.equal(r.frames, FRAMES);
      assert.ok(r.painted > FRAMES * 40, body + ': the barrel is drawn');
      assert.deepEqual([r.barrel, r.shield, r.worst], [0, 0, ''], body);
    }
  });
}

test('the barrel check sees what it looks for: from the frame\'s origin the hands cover the weapon', () => {
  for (const main of [B + 'main.crossbow', 'test.trial/main.crossbow', T + 'main.blaster']) {
    const r = frames(M, { items: { main } }, 0);
    assert.ok(r.barrel > r.frames, main + ': ' + r.barrel + ' pixels covered in ' + r.frames + ' frames');
  }
});

test('the trial crossbow is read, fits every build and is held at its stations', () => {
  const lib = M.lib, p = lib.read(TRIAL, { allowUnsigned: true });
  assert.equal(p.ok, true, p.reason);
  assert.deepEqual(plain(p.sums['main.crossbow']).parts.n + plain(p.sums['main.crossbow']).stowed.n, crossbow().parts[0].shapes.length + crossbow().stowed.parts[0].shapes.length);
  M.K.look({ items: { main: 'test.trial/main.crossbow' } });
  const o = M.K.aim.pose(Object.assign(M.K.pose('idle', 0), { x: X, floor: FLOOR, bob: 0 }), 1, L), r = M.K.rig(o), g = r.anchors.main;
  // aimed right the right hand is the front one, 38 along, and the left the rear, at the origin
  assert.deepEqual(plain(r.anchors.handR).map(Math.round), [Math.round(g[0] + 38), Math.round(g[1])]);
  assert.deepEqual(plain(r.anchors.handL).map(Math.round), [Math.round(g[0]), Math.round(g[1])]);
});
