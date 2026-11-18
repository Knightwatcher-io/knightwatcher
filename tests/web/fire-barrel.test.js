// The barrel check for weapons that fire (docs/design.md): no arm or gauntlet is drawn over a
// weapon's barrel forward of the front hand, from the barrel's from to its muzzle, in any frame the
// aiming stances and fire() can draw, nor over the face of a shield but in one known place: a
// one-handed weapon's turn across the body to the left, and back, carries the weapon arm in front of
// the shield (docs/rig.md, Aiming and firing). Run with: node --test tests/web/
//
// The page's drawing code runs under Node, as tests/web/knight.test.js runs it, against a fake
// context that keeps, for every pixel of the 960 by 600 grid, which of the look's lists painted it
// last and whether the weapon's list painted it at or beyond the barrel's from along the frame. A
// barrel pixel then painted by an arm or a gauntlet is covered. The frames: AIM2 or AIM1 at every
// 0.05 of its range, from 0.3 below level to 1.2 above it, both ways; and fire() at every 0.01 of q,
// both ways, aimed high, level and low. The weapons: the test world's blaster (one-handed, with and
// without its deflector) and prod (two-handed, both swung and fired), from its copy of format 1.2,
// and a trial crossbow made here in memory, two-handed, its front hand 38 along the frame and its
// barrel from 54. Each on the base pack's three builds in its three sleeves (plate arms and
// gauntlets, mail sleeves and mittens, padded sleeves and leather gloves), and on the test world's
// unit in its own panels.
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

/* ---- The trial crossbow ---------------------------------------------------------------------------
   A wooden crossbow drawn from above, the same on both sides of its line: an ash tiller with two
   iron bands, a steel prod, a ring stirrup at the nose, a bolt in the groove and a gold nut; slung
   across the back when stowed. The frame's s runs along it towards the muzzle, p across. Every
   number a multiple of 1/8. It is read on dev terms in a pack of format 1.2 of its own. */
const K8 = '@base.k';
const E8 = v => Math.round(v * 8) / 8;
const FP = (s, p) => ({ frame: 'main', s: E8(s), p: E8(p) });
const strip = (s0, p0, s1, p1, hw0, hw1, fill) => ({ k: 'strip', p0: FP(s0, p0), p1: FP(s1, p1), hw0: E8(hw0), hw1: E8(hw1), fill });
const circle = (s, p, r, fill) => ({ k: 'ell', p: FP(s, p), rx: E8(r), ry: E8(r), fill });
const poly = (pts, fill) => ({ k: 'poly', dir: 'frame', pts: pts.map(([s, p]) => FP(s, p)), fill });
/* An outlined piece, [outline, fill]; layered() draws every outline before every fill. */
const bar = (s0, p0, s1, p1, hw0, hw1, fill) => [strip(s0, p0, s1, p1, hw0 + 2.5, hw1 + 2.5, K8), strip(s0, p0, s1, p1, hw0, hw1, fill)];
const ring = (s, p, r, fill) => [circle(s, p, r + 2.5, K8), circle(s, p, r, fill)];
const layered = pieces => pieces.map(x => x[0]).concat(pieces.map(x => x[1]));
const WOOD = [[0.2, '@base.n0'], [0.65, '@base.n1'], [1, '@base.n2']], DARK = [[0.3, '@base.n1'], [1, '@base.n3']], STEEL = [[0.45, '@base.s1'], [1, '@base.s3']];
function crossbow() {
  const Sp = 70, span = 36, sweep = 16, nose = Sp + 26;
  const limbs = [];
  for (const side of [-1, 1]) {
    const pts = [[Sp, 0], [Sp - sweep * .3, side * span * .6], [Sp - sweep * .82, side * span]], hw = [5.5, 5.5 * .7, 5.5 * .42];
    for (let i = 0; i < 2; i++) limbs.push(bar(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], hw[i], hw[i + 1], STEEL));
  }
  const shapes = layered([
    bar(-40, 0, Sp + 6, 0, 5.5, 5, WOOD),
    [poly([[-44, -9], [-22, -7], [-22, 7], [-44, 9]], K8), poly([[-42, -6.5], [-24, -5], [-24, 5], [-42, 6.5]], DARK)],
    ...limbs,
    ring(Sp + 16, 0, 7, '@base.steel3'),
  ]);
  shapes.push(circle(Sp + 16, 0, 3.5, K8));
  for (const s of [-14, 26]) shapes.push(strip(s, -7.5, s, 7.5, 1.5, 1.5, '@base.s3'));
  shapes.push(...layered([bar(Sp - 3, -8, Sp - 3, 8, 2.5, 2.5, '@base.s2')]));
  // the string, from the prod's tips back to the nut
  shapes.push(...layered([-1, 1].map(sd => [strip(Sp - sweep * .82, sd * span, 5, 0, 2, 2, K8), strip(Sp - sweep * .82, sd * span, 5, 0, .7, .7, '#eae2cc')])));
  // the bolt in the groove, and the nut
  shapes.push(...layered([
    [strip(6, 0, nose - 8, 0, 3, 3, K8), strip(6, 0, nose - 8, 0, 1.5, 1.5, '@base.n0')],
    [poly([[nose - 10, -5], [nose, 0], [nose - 10, 5]], K8), poly([[nose - 9, -3], [nose - 2, 0], [nose - 9, 3]], '@base.s1')],
  ]));
  shapes.push(...layered([ring(5, 0, 4, '@base.gold')]));
  // slung across the back from the left shoulder to the right hip, on the neck: the butt below the
  // right side of the coat, the prod across the top beside the helmet, moving with each build
  const o = { top: [-92, -26], bot: [62, 110], tiller: 4.5, span, thick: 4, sweep: 14 };
  const u = [o.bot[0] - o.top[0], o.bot[1] - o.top[1]], len = Math.hypot(u[0], u[1]), n = [-u[1] / len, u[0] / len];
  const at = (k, q) => [{ c: Math.round(o.top[0] + u[0] * k + n[0] * q), dShoulder: E8(-1 + 1.5 * k) }, { c: Math.round(o.top[1] + u[1] * k + n[1] * q), dHeight: E8(k) }];
  const sb = (a, b, hw0, hw1, fill) => [{ k: 'strip', p0: a, p1: b, hw0: E8(hw0 + 2.5), hw1: E8(hw1 + 2.5), fill: K8 }, { k: 'strip', p0: a, p1: b, hw0: E8(hw0), hw1: E8(hw1), fill }];
  const pieces = [sb([{ c: -38, dShoulder: -1 }, -4], [{ c: 44, dShoulder: 1 }, { c: 92, dHeight: 1 }], 2.5, 2.5, '@base.n2'), sb(at(1.02, 0), at(-.02, 0), o.tiller + 1, o.tiller, WOOD)];
  for (const sd of [-1, 1]) pieces.push(sb(at(.06, 0), at(.06 - o.sweep * 1.2 / len, sd * o.span), o.thick, o.thick * .45, STEEL));
  const slung = layered(pieces);
  for (const sd of [-1, 1]) slung.push({ k: 'strip', p0: at(.06 - o.sweep * 1.2 / len, sd * o.span), p1: at(.3, 0), hw0: .75, hw1: .75, fill: '#eae2cc' });
  slung.push({ k: 'ell', p: at(.06, 0), rx: 7, ry: 7, fill: K8 }, { k: 'ell', p: at(.06, 0), rx: 4.5, ry: 4.5, fill: '@base.gold' });
  return {
    slot: 'main', name: 'Wooden crossbow (trial)', use: 'fire', grip: { kind: 'two', hands: [38, 0] },
    barrel: { from: 54, to: nose, half: 8 }, muzzle: { s: nose, p: 0 }, range: 420,
    shot: { kind: 'bolt', colour: '#d9b77a' },
    stowed: { layer: 'back', parts: [{ at: 'neck', shapes: slung }] },
    parts: [{ at: 'main', shapes }]
  };
}
const TRIAL = JSON.stringify({ kwpack: 1, pack: { id: 'test.trial', name: 'Trial crossbow', version: '0.1.0', format: [1, 2], licence: 'For the tests only.', provides: ['items'], items: { 'main.crossbow': crossbow() } } });

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
const WEAPONS = [['the trial crossbow', 'test.trial/main.crossbow', null], ['the prod', T + 'main.prod', null], ['the blaster', T + 'main.blaster', null], ['the blaster and the deflector', T + 'main.blaster', T + 'off.deflector']];
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
  const out = { frames: 0, barrel: 0, shield: 0, worst: '', painted: 0, across: 0 };
  const pose = () => { const o = K.pose('idle', 2300); o.x = X; o.floor = FLOOR; o.helmet = true; o.bob = 0; return o; };
  /* across: the frame is a one-handed weapon's turn across the body, from the stance to the left or
     back, where the weapon arm still passes in front of a shield (docs/rig.md, Aiming and firing);
     the shield it covers there is counted apart. */
  const one = (label, o, across) => {
    st.painted = 0;
    const [b, s] = covered(o);
    out.frames++; out.barrel += b; out.painted += st.painted;
    if (across) out.across += s; else out.shield += s;
    if ((b || (s && !across)) && !out.worst) out.worst = label + ': ' + b + ' barrel and ' + s + ' shield pixels';
  };
  for (const dir of [1, -1]) for (let k = 0; k <= 30; k++) { const a = -.3 + k * .05; one('aim ' + dir + ' ' + a.toFixed(2), K.aim.pose(pose(), dir, dir * (L - a))); }
  for (const dir of [1, -1]) for (const dy of [-400, -125, -40]) for (let k = 0; k <= 100; k++) {
    const o = pose(), q = k / 100;
    K.fire(o, q, dir, [X + dir * 300, FLOOR + dy]);
    one('fire ' + dir + ' dy ' + dy + ' q ' + q, o, dir < 0 && !!look.items.off && (q < .3 || q >= .6));
  }
  return out;
}

const M = rig();
for (const [what, main, off] of WEAPONS) {
  test(`no arm is drawn over the barrel forward of the front hand, nor over the shield, frame by frame: ${what}`, () => {
    for (const [body, look0] of BODIES) {
      const look = { build: look0.build, items: Object.assign({ main }, look0.items, off ? { off } : {}) };
      const r = frames(M, look);
      assert.equal(r.frames, 668);
      assert.ok(r.painted > 668 * 40, body + ': the barrel is drawn');
      assert.deepEqual([r.barrel, r.shield, r.worst], [0, 0, ''], body);
      if (!off) assert.equal(r.across, 0, body);
    }
  });
}

test('the barrel check sees what it looks for: from the frame\'s origin the hands cover the weapon', () => {
  for (const main of ['test.trial/main.crossbow', T + 'main.blaster']) {
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
