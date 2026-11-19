// One plan of the goblin's event measured against the contact standard (docs/tests.md, The contact
// standard): the swung weapon's drawn pixels against the goblin's drawn pixels through the whole
// strike, and the gap between them at the hit. Shared by sweep.js and the contact checks of
// tests/web/foe.test.js and tests/web/world-scenes.test.js.
'use strict';
const L = require('./lib.js');

/* The weapon's box on the grid, on its frame [x, y, a], from its extent on the frame (L.frameBox). */
function weaponBox(fb, mf) {
  const [mx, my, a] = mf, SX = Math.sin(a), SY = -Math.cos(a);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of [fb.s0, fb.s1]) for (const p of [-fb.p1, fb.p1]) {
    const x = mx + SX * s - SY * p, y = my + SY * s + SX * p;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/* Measures the plan pl, the knight at kx, with the weapon m holds (fb its L.frameBox). The strike
   is sampled every step ms from its start (FOE.strike.at) to the goblin's last drawn frame (it is
   hidden behind the cloud at the exit's gone), every ms from 2 before the hit to 2 after, and every
   ms around each sample deeper than 2 and around the deepest. Gives
     worst   the deepest sample, { el, depth, n, at, dW, dG, glocal, wlocal, pose }, or null when the
             weapon never overlaps the goblin;
     over2   the samples deeper than 2, { first, last, n }, or null;
     gap     the gap at the hit, the weapon at the hit against the goblin as drawn at the hit, with
             gapAt the two nearest pixels on the goblin and the weapon and the goblin's pose then;
     samples how many moments were measured, and last the latest. */
function measurePlan(m, kx, pl, fb, step = 2) {
  const S = m.F.FOE.strike, X = pl.exit;
  const last = Math.min(pl.hit + S.rebound + S.recover - 1, pl.hit + X.gone - 1);
  const seen = new Map();
  const gob = el => {
    const st = m.F.at(el, pl); if (!st.show) return null;
    const k = [st.pose, Math.round(st.x), Math.round(st.y), st.sx, st.sy, st.face, st.behind].join('|');
    let g = seen.get(k); if (!g) { g = L.goblinAt(m, pl, el); seen.set(k, g); }
    return g;
  };
  const sample = el => {
    const g = gob(el); if (!g) return null;
    const o = L.pose(m, kx, el); m.F.strike(o, el, pl);
    const bb = weaponBox(fb, m.K.rig(o).anchors.main);
    if (bb[2] < g.x0 - 2 || bb[0] > g.x0 + g.w + 2 || bb[3] < g.y0 - 2 || bb[1] > g.y0 + g.h + 2) return { el, depth: 0, n: 0 };
    const wp = m.weaponAt(o), ov = L.overlap(wp, g);
    if (!ov) return { el, depth: 0, n: 0 };
    return { el, depth: Math.round(ov.depth * 100) / 100, n: ov.n, at: ov.at, dW: Math.round(ov.dW * 100) / 100, dG: Math.round(ov.dG * 100) / 100,
      glocal: L.goblinLocal(g, ov.at[0], ov.at[1]), wlocal: L.weaponLocal(wp.frame, ov.at[0], ov.at[1]), pose: g.st.pose };
  };
  const times = new Set();
  for (let el = S.at; el <= last; el += step) times.add(el);
  for (let d = -2; d <= 2; d++) times.add(pl.hit + d);
  times.add(last);
  const res = new Map();
  for (const el of [...times].sort((a, b) => a - b)) res.set(el, sample(el));
  // every ms around each sample deeper than 2, and around the deepest
  const deep = [...res.values()].filter(r => r && r.depth > 2).map(r => r.el);
  let worst = null; for (const r of res.values()) if (r && (!worst || r.depth > worst.depth)) worst = r;
  if (worst && worst.depth > 0) deep.push(worst.el);
  for (const e of deep) for (let el = e - step + 1; el < e + step; el++) if (el >= S.at && el <= last && !res.has(el)) res.set(el, sample(el));
  const all = [...res.values()].filter(Boolean).sort((a, b) => a.el - b.el);
  worst = null; for (const r of all) if (!worst || r.depth > worst.depth) worst = r;
  const bad = all.filter(r => r.depth > 2);
  // the gap at the hit, against the goblin as drawn then
  const oh = L.pose(m, kx, pl.hit); m.F.strike(oh, pl.hit, pl);
  const wph = m.weaponAt(oh), gh = L.goblinAt(m, pl, pl.hit), gap = L.gapBetween(wph, gh);
  return {
    worst: worst && worst.depth > 0 ? worst : null,
    over2: bad.length ? { first: bad[0].el, last: bad[bad.length - 1].el, n: bad.length } : null,
    gap: gap.gap,
    gapAt: gap.w ? { glocal: L.goblinLocal(gh, gap.g[0], gap.g[1]), wlocal: L.weaponLocal(wph.frame, gap.w[0], gap.w[1]), pose: gh.st.pose } : null,
    samples: all.length, last,
  };
}

module.exports = { weaponBox, measurePlan };
