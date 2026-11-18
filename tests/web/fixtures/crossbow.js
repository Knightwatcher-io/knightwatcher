/* The trial crossbow, for the tests of weapons that fire (fire-barrel.test.js and fire-acts.test.js):
   a wooden crossbow made here in memory and read on dev terms in a pack of format
   1.2 of its own, test.trial, never written to a file. require() gives { TRIAL, crossbow }: the
   pack's text and the item. */
'use strict';

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

module.exports = { TRIAL, crossbow };
