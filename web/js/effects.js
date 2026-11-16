/* Knightwatcher: the effects (docs/page.md, The effects). The drawings the engine owns that no fixed
   list of shapes can say: rows of stars at hashed points, pines whose tiers depend on a hashed
   height, a flame whose points move by two sines. A scene calls an effect by name with its fields,
   as a world pack's "fx" shape will name it with numbers.

   Each effect has three parts:
   - fields: its table of fields, each { kind, ..., def }. A field with def may be left out. The
     kinds are point (an [x, y] pair of scalars), offset, length and term (a scalar: a number, or in
     a pack a term object over the screen's edges, the tile's x, its hash or a wave), num and int
     (a plain number or whole number from lo to hi), pair (two plain numbers, each in its own
     range of of), colour (one colour), colours and ints (lists of min to max of them) and one (one
     of the values in of).
   - cost(b): the most fills its drawing makes for fields whose bounds are b: fillRect calls, and 3
     for each glow, which fills three discs. In b a scalar field is its [least, greatest], a point
     two of those, any other field its value, and b.view the screen's edges, { L, R, T, W }, each a
     [least, greatest]. bounds() gives b for fields drawn on a screen; pack.js works b out from a
     pack's terms over the ranges its checks assume.
   - draw(f, clock): draws it. clock is the scene's time in ms for an effect that moves (time), the
     ms or the progress since its trigger for burst, and unused for a still one.

   glows(b), where an effect has it, is the most glows its drawing makes. Nothing here touches the
   canvas until an effect is drawn, and the tables reach nothing on KW, so the file loads under Node
   for pack.js and the tests. */
(function (KW) {
  'use strict';
  const D = KW.draw || {}, V = KW.view || {}, SP = KW.sprites || {};
  const { alpha, glow, Rh, ell, rrect, poly, strip, pix, hsh, dith } = D;

  /* The palette's colours the effects' defaults use, as draw.js has them. */
  const K = '#1a1524', W = '#ffffff', S2 = '#aab6c6', S3 = '#7d899b', N0 = '#b98045', N1 = '#96622f', N2 = '#70461f', N3 = '#4c2e12';

  /* ---- Bounds --------------------------------------------------------------------------------- */

  const lo = s => s[0], hi = s => s[1];
  /* The most fills a primitive of draw.js makes: a row (or column) of an ell, rrect, poly or strip
     costs one call per band, nb; a dith one per square. ext is how far a poly reaches along the way
     it is filled; a strip's dx and dy are how far it runs, and hw its half-width. */
  const B = {
    ell: (ry, nb) => (2 * Math.ceil(Math.max(0, ry)) + 1) * (nb || 1),
    rrect: (h, nb) => Math.max(0, Math.round(h)) * (nb || 1),
    poly: (ext, nb) => (Math.ceil(Math.max(0, ext)) + 1) * (nb || 1),
    strip: (dx, dy, hw, nb) => (Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) + 2 * hw) + 2) * (nb || 1),
    dith: (w, h) => Math.ceil(Math.max(0, h) / 2) * Math.ceil(Math.max(0, w) / 4),
    glow: 3
  };

  /* ---- The effects ------------------------------------------------------------------------------ */

  /* A shading of white or black at alpha a, spelt as the scenes always spelt it: '.06', not '0.06'. */
  const tint = (rgb, a) => 'rgba(' + rgb + ',' + String(a).replace(/^0\./, '.') + ')';

  /* sky: bands of the colours of from the top, p, down to h below it, dithered where they meet, and
     the last colour on down to 20 below the grid's foot. */
  const sky = {
    fields: { p: { kind: 'point' }, w: { kind: 'length' }, h: { kind: 'length' }, of: { kind: 'colours', min: 1, max: 8 } },
    cost: b => b.of.length + 1 + (b.of.length - 1) * B.dith(hi(b.w), 14),
    draw(f) {
      const [x, y] = f.p, cols = f.of, n = cols.length, h = f.h / n;
      for (let i = 0; i < n; i++) { Rh(x, y + i * h, f.w, h + 1, cols[i]); if (i) dith(x, y + i * h - 14, f.w, 14, cols[i]); }
      Rh(x, y + f.h, f.w, V.HH - (y + f.h) + 20, cols[n - 1]);
    }
  };

  /* stars: n stars at hashed points in the box from p, w by h, faint, pale or bright by a hash, the
     bright ones with a cross. */
  const stars = {
    fields: { p: { kind: 'point' }, w: { kind: 'length', lo: 1 }, h: { kind: 'length' }, n: { kind: 'int', lo: 1, hi: 400, def: 190 },
      seed: { kind: 'int', lo: 0, hi: 997, def: 1 }, of: { kind: 'colours', min: 3, max: 3, def: ['#7f879d', '#d7deee', '#ffffff'] } },
    cost: b => 3 * b.n,
    draw(f) {
      const [x0, y0] = f.p, s = f.seed, c3 = f.of;
      for (let i = 0; i < f.n; i++) {
        const x = x0 + hsh(i, s) % f.w, y = y0 + hsh(i, s + 1) % Math.max(1, f.h), k = hsh(i, s + 2) % 12, c = k < 7 ? c3[0] : k < 11 ? c3[1] : c3[2];
        Rh(x, y, 2, 2, c); if (k === 11) { Rh(x - 3, y, 8, 2, c); Rh(x, y - 3, 2, 8, c); }
      }
    }
  };

  /* ridge: a skyline of hills from p across w, rising to amp above p's y at points step apart
     whose heights come from a hash, straight between them. */
  const ridge = {
    fields: { p: { kind: 'point' }, w: { kind: 'length' }, amp: { kind: 'int', lo: 1, hi: 512 }, step: { kind: 'int', lo: 1, hi: 960 },
      seed: { kind: 'int', lo: 0, hi: 999, def: 0 }, colour: { kind: 'colour' } },
    cost: b => Math.ceil(hi(b.w)) + 1,
    draw(f) {
      const [x0, base] = f.p, { amp, step, seed } = f;
      for (let x = Math.floor(x0); x < x0 + f.w; x++) {
        const i = Math.floor((x + 4000) / step), q = ((x + 4000) % step) / step, a = hsh(i, seed) % amp, b = hsh(i + 1, seed) % amp;
        Rh(x, base - (a + (b - a) * q), 1, amp + 2, f.colour);
      }
    }
  };

  /* bricks: stone or brick laid in courses of blocks size[0] by size[1], filling the box from p, w
     by h, over the mortar, each block in one of of chosen by a hash, lit on top by white at lit and
     shaded below. */
  const bricks = {
    fields: { p: { kind: 'point' }, w: { kind: 'length' }, h: { kind: 'length' }, size: { kind: 'pair', of: [[4, 512], [4, 512]] },
      of: { kind: 'colours', min: 1, max: 16 }, mortar: { kind: 'colour' }, seed: { kind: 'term', lo: -8192, hi: 8192, def: 0 },
      lit: { kind: 'num', lo: 0, hi: 1, def: .06 } },
    cost: b => 1 + 3 * Math.max(0, Math.ceil(hi(b.h) / b.size[1])) * Math.max(0, Math.ceil(hi(b.w) / b.size[0]) + 1),
    draw(f) {
      const [x, y] = f.p, { w, h, of: cols, seed } = f, [bw, bh] = f.size, top = tint('255,255,255', f.lit);
      Rh(x, y, w, h, f.mortar);
      for (let j = 0; j * bh < h; j++) for (let i = -1; i * bw < w; i++) {
        const bx = x + i * bw + (j % 2) * bw / 2, by = y + j * bh, x0 = Math.max(x, bx + 1), x1 = Math.min(x + w, bx + bw - 1), y1 = Math.min(y + h, by + bh - 1);
        if (x1 <= x0 || y1 <= by + 1) continue;
        Rh(x0, by + 1, x1 - x0, y1 - by - 1, cols[hsh(bx + seed, j) % cols.length]); Rh(x0, by + 1, x1 - x0, 1, top); Rh(x0, y1 - 1, x1 - x0, 1, 'rgba(0,0,0,.28)');
      }
    }
  };

  /* pines: a row of pines standing on p's y, from step-aligned x before p's x, plus phase, across w:
     each off[0] along plus a hash up to off[1], tall[0] tall plus a hash up to tall[1], in tiers. */
  function pine(x, base, h, c) {
    const n = Math.max(4, Math.round(h / 44));
    for (let i = 0; i < n; i++) { const y0 = base - h + i * (h / n) * .9, th = (h / n) * 1.7, w = 16 + (i + 1) * h * .058; poly([[x, y0], [x - w, y0 + th], [x + w, y0 + th]], c); }
  }
  const pines = {
    fields: { p: { kind: 'point' }, w: { kind: 'length' }, step: { kind: 'int', lo: 8, hi: 960, def: 120 }, phase: { kind: 'int', lo: -960, hi: 960, def: 0 },
      off: { kind: 'pair', int: true, of: [[-480, 480], [1, 480]], def: [40, 50] }, tall: { kind: 'pair', int: true, of: [[8, 600], [1, 600]], def: [240, 130] },
      seed: { kind: 'int', lo: 0, hi: 998, def: 5 }, colour: { kind: 'colour', def: '#07180f' } },
    cost: b => {
      const h = b.tall[0] + b.tall[1] - 1, each = Math.ceil(1.7 * h) + 2 * Math.max(4, Math.round(h / 44));
      return Math.max(0, Math.ceil((hi(b.w) + b.step - b.phase) / b.step)) * each;
    },
    draw(f) {
      const [x0, base] = f.p, { step, seed } = f;
      for (let x = Math.floor(x0 / step) * step + f.phase; x < x0 + f.w; x += step) pine(x + f.off[0] + hsh(x, seed) % f.off[1], base, f.tall[0] + hsh(x, seed + 1) % f.tall[1], f.colour);
    }
  };

  /* tree: a broad tree whose trunk, 48 wide, stands with its left at p's x from the screen's top to
     p's y, streaked with bark, with roots, and leaves at hashed points across the top, in bark's
     four colours, leaves' three and light. */
  const tree = {
    fields: { p: { kind: 'point' }, bark: { kind: 'colours', min: 4, max: 4, def: [N0, N1, N2, N3] },
      leaves: { kind: 'colours', min: 3, max: 3, def: ['#143a20', '#1c4426', '#245a30'] }, light: { kind: 'colour', def: '#2f6b3a' } },
    cost: () => 4 + 22 + B.ell(9) + B.ell(8) + 12 * (B.ell(97 * .62) + B.ell(97 * .22)),
    draw(f) {
      const HT = V.HT, [x, base] = f.p, bk = f.bark, leaf = f.leaves;
      Rh(x, HT, 8, base - HT, bk[0]); Rh(x + 8, HT, 20, base - HT, bk[1]); Rh(x + 28, HT, 12, base - HT, bk[2]); Rh(x + 40, HT, 8, base - HT, bk[3]);
      for (let i = 0; i < 22; i++) Rh(x + 4 + hsh(x + i, 61) % 38, HT + hsh(x + i, 62) % (base - HT - 40), 2, 16 + hsh(x + i, 63) % 40, i % 3 ? bk[3] : bk[0]);
      ell(x + 6, base - 4, 16, 9, bk[2]); ell(x + 42, base - 3, 16, 8, bk[3]);
      for (let i = 0; i < 12; i++) { const cx = x + 24 + (hsh(x + i, 64) % 280) - 140, cy = HT + 10 + hsh(x + i, 65) % 170, rx = 54 + hsh(x + i, 66) % 44; ell(cx, cy, rx, rx * .62, leaf[i % 3]); ell(cx - rx * .25, cy - rx * .2, rx * .45, rx * .22, f.light); }
    }
  };

  /* arch: a ring of n wedge-shaped stones round p, rx across and ry high, in of in turn, each
     outlined. With a step, a row of them across the screen, as the cellar's arches stand: one for
     each x from the last at or before the screen's left edge that is phase more than a multiple of
     step, to before past beyond its right edge, each round p moved along by x. A step of 0 draws
     the one arch. */
  function ring(cx, cy, f) {
    const { rx, ry, n } = f;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + Math.PI * i / n, a1 = -Math.PI / 2 + Math.PI * (i + 1) / n, am = (a0 + a1) / 2;
      const p = (a, r) => [cx + Math.sin(a) * rx * r, cy - Math.cos(a) * ry * r];
      const [x0, y0] = p(am, .93), [x1, y1] = p(am, 1.07);
      strip(x0, y0, x1, y1, 14, 14, f.outline); strip(x0, y0, x1, y1, 11.5, 11.5, f.of[i % f.of.length]);
    }
  }
  const arch = {
    fields: { p: { kind: 'point' }, rx: { kind: 'num', lo: 1, hi: 512 }, ry: { kind: 'num', lo: 1, hi: 512 }, n: { kind: 'int', lo: 1, hi: 32, def: 11 },
      of: { kind: 'colours', min: 1, max: 8 }, outline: { kind: 'colour', def: K },
      step: { kind: 'int', lo: 0, hi: 960, def: 0 }, phase: { kind: 'int', lo: -960, hi: 960, def: 0 }, past: { kind: 'int', lo: 0, hi: 960, def: 0 } },
    cost: b => {
      const m = .14 * Math.max(b.rx, b.ry), one = b.n * (B.strip(m, m, 14) + B.strip(m, m, 11.5));
      return b.step ? Math.max(0, Math.ceil((hi(b.view.W) + b.past + b.step) / b.step)) * one : one;
    },
    draw(f) {
      const [px, py] = f.p, step = f.step;
      if (!step) { ring(px, py, f); return; }
      for (let x = Math.floor((V.HL - f.phase) / step) * step + f.phase; x < V.HR + f.past; x += step) ring(x + px, py, f);
    }
  };

  /* shelf: what stands on a shelf whose top is y, across the screen, one thing in each slot of 38
     or none, chosen by a hash: bottles, jars and cheeses. */
  const SLOT = 38, BOTTLES = ['#2f6b3a', '#5c2a22', '#2a3f6b'];
  const shelf = {
    fields: { y: { kind: 'offset' }, seed: { kind: 'int', lo: 0, hi: 999, def: 1 } },
    // a bottle 87 at its tallest, a jar 88, a cheese 92
    cost: b => (Math.floor(hi(b.view.W) / SLOT) + 2) * Math.max(B.rrect(43) + B.rrect(41) + 3, B.rrect(30) + B.rrect(28, 2) + 2, B.ell(15) + B.ell(12, 2) + B.rrect(8) + 3),
    draw(f) {
      const { y, seed } = f;
      for (let x = Math.floor(V.HL / SLOT) * SLOT; x < V.HR; x += SLOT) {
        const h = hsh(x, seed), k = h % 6, px = x + 6 + (h >>> 4) % 10;
        if (k === 0) continue;
        if (k <= 2) { const c = BOTTLES[(h >>> 8) % 3], bh = 34 + (h >>> 10) % 10; rrect(px, y - bh, 16, bh, 5, K); rrect(px + 2, y - bh + 2, 12, bh - 2, 4, c); Rh(px + 5, y - bh - 10, 6, 12, K); Rh(px + 6, y - bh - 9, 4, 10, c); Rh(px + 4, y - bh + 6, 2, bh - 12, 'rgba(255,255,255,.25)'); }
        else if (k <= 4) { rrect(px - 2, y - 30, 24, 30, 6, K); rrect(px, y - 28, 20, 28, 5, [[.3, '#a08860'], [1, '#6b5638']]); Rh(px - 1, y - 34, 22, 6, K); Rh(px, y - 33, 20, 4, '#5a4632'); }
        else { ell(px + 12, y - 15, 16, 15, K, null, y - 1); ell(px + 12, y - 15, 13, 12, [[.3, '#b8a27a'], [1, '#7a6646']], null, y - 2); rrect(px + 7, y - 34, 10, 8, 3, K); Rh(px + 9, y - 32, 6, 5, '#8f7a57'); Rh(px + 6, y - 27, 12, 3, '#4c2e12'); }
      }
    }
  };

  /* stacks: columns of crates step apart on p's y, from p's x towards the screen's edge on the side
     dir, until a column would start past beyond it: the first columns as high as heights says,
     and the rest more[0] plus a hash up to more[1]. The crate is the props' (KW.props.crateHD). */
  const CRATE = 2 + 6 + 2 * B.strip(48, 38, 3) + 2 + 4 + B.rrect(14) + B.rrect(10);
  const stacks = {
    fields: { p: { kind: 'point' }, dir: { kind: 'one', of: [-1, 1] }, step: { kind: 'int', lo: 8, hi: 960, def: 70 },
      heights: { kind: 'ints', min: 0, max: 16, lo: 0, hi: 16, def: [] }, seed: { kind: 'int', lo: 0, hi: 999, def: 0 },
      more: { kind: 'pair', int: true, of: [[0, 16], [1, 16]], def: [3, 5] }, past: { kind: 'int', lo: 0, hi: 960, def: 0 } },
    cost: b => {
      const cols = b.dir < 0 ? Math.ceil((hi(b.p[0]) - lo(b.view.L) + b.past) / b.step) : Math.ceil((hi(b.view.R) + b.past - lo(b.p[0])) / b.step);
      return Math.max(0, cols) * Math.max(b.more[0] + b.more[1] - 1, ...b.heights) * CRATE;
    },
    draw(f) {
      const [x0, base] = f.p, { dir, step, heights, seed, more, past } = f, crate = KW.props.crateHD;
      for (let i = 0, x = x0; dir < 0 ? x > V.HL - past : x < V.HR + past; i++, x += dir * step) {
        const n = i < heights.length ? heights[i] : more[0] + hsh(i, seed) % more[1];
        for (let k = 0; k < n; k++) crate(x + (k % 2) * 5, base - 50 * (k + 1));
      }
    }
  };

  /* tufts: tufts of grass on y across the screen, one in each step: along by a hash up to spread,
     tall[0] tall plus a hash up to tall[1], three blades gap apart leaning out by lean, the middle
     one light and the others colour; none whose x lies inside bare. */
  const tufts = {
    fields: { y: { kind: 'offset' }, step: { kind: 'int', lo: 8, hi: 960, def: 41 }, spread: { kind: 'int', lo: 1, hi: 960, def: 30 },
      seed: { kind: 'int', lo: 0, hi: 998, def: 9 }, tall: { kind: 'pair', int: true, of: [[1, 128], [1, 128]], def: [8, 10] },
      gap: { kind: 'num', lo: 0, hi: 32, def: 5 }, lean: { kind: 'num', lo: 0, hi: 4, def: 1.6 },
      colour: { kind: 'colour', def: '#2f6b3a' }, light: { kind: 'colour', def: '#4f9a45' }, bare: { kind: 'pair', of: [[-2048, 2048], [-2048, 2048]], def: [0, 0] } },
    cost: b => (Math.floor(hi(b.view.W) / b.step) + 2) * 3 * B.poly(b.tall[0] + b.tall[1]),
    draw(f) {
      const { y, step, seed, tall, gap, lean } = f, [b0, b1] = f.bare;
      for (let x = Math.floor(V.HL / step) * step; x < V.HR; x += step) {
        const gx = x + hsh(x, seed) % f.spread, h = tall[0] + hsh(x, seed + 1) % tall[1];
        if (gx > b0 && gx < b1) continue;
        for (const d of [-gap, 0, gap]) poly([[gx + d - 2, y + 1], [gx + d * lean, y - h + Math.abs(d)], [gx + d + 2, y + 1]], d ? f.colour : f.light);
      }
    }
  };

  /* pebbles: pebbles on the ground below y across the screen, one in each step: along by a hash up
     to spread, drop[0] below y plus a hash up to drop[1], size[0] across plus a hash up to size[1]
     and ry high, in one of of by a hash, with a fleck of light at its top left. */
  const pebbles = {
    fields: { y: { kind: 'offset' }, step: { kind: 'int', lo: 8, hi: 960, def: 23 }, spread: { kind: 'int', lo: 1, hi: 960, def: 17 },
      seed: { kind: 'int', lo: 0, hi: 996, def: 3 }, drop: { kind: 'pair', int: true, of: [[0, 600], [1, 600]], def: [10, 56] },
      size: { kind: 'pair', int: true, of: [[1, 64], [1, 64]], def: [3, 3] }, ry: { kind: 'int', lo: 1, hi: 64, def: 2 },
      of: { kind: 'colours', min: 1, max: 8, def: ['#2e2619', '#3a3020'] }, light: { kind: 'colour', def: '#4f4330' } },
    cost: b => (Math.floor(hi(b.view.W) / b.step) + 2) * (B.ell(b.ry) + 1),
    draw(f) {
      const { y, step, spread, seed, drop, size, ry, of } = f;
      for (let x = Math.floor(V.HL / step) * step; x < V.HR; x += step) {
        const px = x + hsh(x, seed) % spread, py = y + drop[0] + hsh(x, seed + 1) % drop[1];
        ell(px, py, size[0] + hsh(x, seed + 2) % size[1], ry, of[hsh(x, seed + 3) % of.length]); Rh(px - 2, py - 1, 2, 1, f.light);
      }
    }
  };

  /* planks: a wall of planks from y down h, one a step across the screen from the step at or before
     its left edge: a plank of one of of's colours chosen by a hash of its x, step less 3 wide from 2
     past x, a line of light lit along its left edge, three streaks of grain darkened by grain at
     hashed places, and on one plank in five a knot in the two colours of knots, as the house's wall
     has them. The streaks and knots sit at points hashed from the plank's x, which a pack can say
     only inside a tile, nested deeper than a pack may go. */
  const PLANK = { inset: 2, less: 3, grain: [3, 6, 24, 10, 280, 24, 50], knot: [31, 5, 18, 54, 32, 220] };
  const planks = {
    fields: { y: { kind: 'offset' }, h: { kind: 'length' }, step: { kind: 'int', lo: 8, hi: 960, def: 36 }, seed: { kind: 'int', lo: 0, hi: 999, def: 3 },
      of: { kind: 'colours', min: 1, max: 8, def: ['#2a1d14', '#2d1f15', '#261a11', '#301f14'] }, lit: { kind: 'num', lo: 0, hi: 1, def: .04 },
      grain: { kind: 'num', lo: 0, hi: 1, def: .28 }, knots: { kind: 'colours', min: 2, max: 2, def: ['#1a110b', '#3a2716'] } },
    cost: b => (Math.floor(hi(b.view.W) / b.step) + 2) * (2 + PLANK.grain[0] + B.ell(3) + B.ell(1)),
    draw(f) {
      const { y, h, step, seed, of } = f, [n, gx, gw, gy, gh, gl, gm] = PLANK.grain, [ks, km, kx, ky, kys, kh] = PLANK.knot;
      const light = tint('255,255,255', f.lit), dark = tint('0,0,0', f.grain);
      for (let x = Math.floor(V.HL / step) * step; x < V.HR; x += step) {
        Rh(x + PLANK.inset, y, step - PLANK.less, h, of[hsh(x, seed) % of.length]); Rh(x + PLANK.inset, y, 1, h, light);
        for (let k = 0; k < n; k++) Rh(x + gx + hsh(x, k) % gw, y + gy + hsh(x, k + 9) % gh, 1, gl + hsh(x, k + 5) % gm, dark);
        if (hsh(x, ks) % km === 0) { const yy = y + ky + hsh(x, kys) % kh; ell(x + kx, yy, 4, 3, f.knots[0]); ell(x + kx, yy, 2, 1, f.knots[1]); }
      }
    }
  };

  /* rafters: a row of rafters under a roof, one a step across the screen from a step before its
     left edge to past beyond its right: each a strip from (x, y) up to (x + lean, top), stroked hw[0]
     either side in of[0] and then hw[1] in of[1], as the house's roof has them. The last rafters
     reach past the 2 048 a pack's shapes may, on the widest screen the checks assume. */
  const rafters = {
    fields: { y: { kind: 'offset' }, top: { kind: 'offset' }, step: { kind: 'int', lo: 8, hi: 960, def: 120 }, lean: { kind: 'num', lo: -512, hi: 512, def: 90 },
      past: { kind: 'int', lo: 0, hi: 960, def: 120 }, hw: { kind: 'pair', of: [[0, 64], [0, 64]], def: [7, 5] }, of: { kind: 'colours', min: 2, max: 2, def: ['#0b0705', '#24180f'] } },
    cost(b) {
      const dy = Math.max(Math.abs(hi(b.y) - lo(b.top)), Math.abs(lo(b.y) - hi(b.top)));
      return (Math.floor((hi(b.view.W) + b.step + b.past) / b.step) + 2) * (B.strip(b.lean, dy, b.hw[0]) + B.strip(b.lean, dy, b.hw[1]));
    },
    draw(f) {
      const { y, top, step, lean, past, hw, of } = f;
      for (let x = Math.floor(V.HL / step) * step - step; x < V.HR + past; x += step) { strip(x, y, x + lean, top, hw[0], hw[0], of[0]); strip(x, y, x + lean, top, hw[1], hw[1], of[1]); }
    }
  };

  /* horseshoe: a horseshoe hung open end down, its arc round p, r[0] to either side and r[1] above:
     a line through the points of the arc every .23 radians from -2.3 to 2.3, stroked in of[0], then
     narrower in of[1], with a short shine of of[2] along its left shoulder, as the smithy's tool
     board hangs two. The arc's points fall between the grid's eighths, which no shape of a pack may
     name. */
  const SHOE = { from: -2.3, to: 2.31, step: .23, hw: [6, 3.5, 1], shine: [2, 8] };
  function shoeArc(f) {
    const [x, y] = f.p, [rx, ry] = f.r, pts = [];
    for (let a = SHOE.from; a <= SHOE.to; a += SHOE.step) pts.push([x + Math.sin(a) * rx, y - Math.cos(a) * ry]);
    return pts;
  }
  /* What SP.stroke(pts, hw) fills (sprites.js): a strip along each segment and a disc on each point. */
  const strokeCost = (pts, hw) => pts.reduce((n, q, i) => n + B.ell(hw) + (i ? B.strip(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1], hw) : 0), 0);
  const horseshoe = {
    fields: { p: { kind: 'point' }, r: { kind: 'pair', of: [[1, 64], [1, 64]], def: [18, 22] }, of: { kind: 'colours', min: 3, max: 3, def: [K, S3, S2] } },
    cost(b) {
      const pts = shoeArc({ p: [0, 0], r: b.r }), [s0, s1] = SHOE.shine;
      return strokeCost(pts, SHOE.hw[0]) + strokeCost(pts, SHOE.hw[1]) + strokeCost(pts.slice(s0, s1), SHOE.hw[2]);
    },
    draw(f) {
      const pts = shoeArc(f), [s0, s1] = SHOE.shine;
      SP.stroke(pts, SHOE.hw[0], f.of[0]); SP.stroke(pts, SHOE.hw[1], f.of[1]); SP.stroke(pts.slice(s0, s1), SHOE.hw[2], f.of[2]);
    }
  };

  /* hood: a chimney w wide from p down to neck, over a hood that flares out by flare either side
     down to foot, filled in colour as one polygon by rows, as the smithy's forge has it. The corners
     where the chimney meets the hood turn inwards, so no polygon of a pack, which must be convex,
     can say it. */
  const hood = {
    fields: { p: { kind: 'point' }, w: { kind: 'length' }, neck: { kind: 'offset' }, foot: { kind: 'offset' }, flare: { kind: 'num', lo: 0, hi: 512 },
      colour: { kind: 'colour', def: K } },
    cost: b => B.poly(Math.max(hi(b.p[1]), hi(b.neck), hi(b.foot)) - Math.min(lo(b.p[1]), lo(b.neck), lo(b.foot))),
    draw(f) {
      const [x, y] = f.p, { w, neck, foot, flare } = f;
      poly([[x, y], [x + w, y], [x + w, neck], [x + w + flare, foot], [x - flare, foot], [x, neck]], f.colour);
    }
  };

  /* flame: a flame of three tongues standing at p, size times the torch's, its points moving by two
     sines of the time plus dt. */
  const TONGUES = [[1, '#ff5a1e', 0], [.7, '#ffb000', 1.7], [.42, '#fff3a0', 3.1]];
  const flame = {
    clock: 'time',
    fields: { p: { kind: 'point' }, size: { kind: 'num', lo: .05, hi: 8, def: 1 }, dt: { kind: 'term', lo: -60000, hi: 60000, def: 0 } },
    cost: b => TONGUES.reduce((n, [q]) => n + B.ell(14 * b.size * q) + B.poly(53 * b.size * q), 0),
    draw(f, t) {
      const [x, y] = f.p, k = f.size, tt = t + f.dt;
      for (const [q, c, ph] of TONGUES) {
        const h = (46 + 7 * Math.sin(tt / 110 + ph)) * k * q, w = 14 * k * q, sw = Math.sin(tt / 170 + ph) * 5 * k, by = y - w * .6;
        ell(x, by, w, w, c); poly([[x - w, by], [x + sw, by - h], [x + w, by]], c);
      }
    }
  };

  /* candle: a candle's flame standing at p, an ell and a tongue over it whose tip sways by
     sway[1] times the sine of the time over sway[0], rounded to whole pixels, and a small core,
     as the house's candle burns. Only the tip moves, which no group of a pack can say: a group
     moves all of a shape. */
  const candle = {
    clock: 'time',
    fields: { p: { kind: 'point' }, sway: { kind: 'pair', of: [[1, 60000], [0, 64]], def: [190, 1.5] }, of: { kind: 'colours', min: 2, max: 2, def: ['#ffb000', '#fff3a0'] } },
    cost: () => B.ell(6) + B.poly(14) + B.ell(3),
    draw(f, t) {
      const [x, y] = f.p, sw = Math.round(Math.sin(t / f.sway[0]) * f.sway[1]), [c0, c1] = f.of;
      ell(x, y, 4, 6, c0); poly([[x - 4, y], [x + sw, y - 14], [x + 4, y]], c0); ell(x, y + 1, 2, 3, c1);
    }
  };

  /* twinkle: n points at hashed places in the box from p, w by h, each a square of size that shows
     for lit of every cycle units of ms, its clock gap units after the last one's. */
  const twinkle = {
    clock: 'time',
    fields: { p: { kind: 'point' }, w: { kind: 'length', lo: 1 }, h: { kind: 'length', lo: 1 }, n: { kind: 'int', lo: 1, hi: 64, def: 14 },
      seed: { kind: 'int', lo: 0, hi: 998, def: 41 }, ms: { kind: 'int', lo: 1, hi: 60000, def: 1100 }, gap: { kind: 'num', lo: 0, hi: 64, def: .7 },
      cycle: { kind: 'num', lo: .1, hi: 64, def: 6 }, lit: { kind: 'num', lo: 0, hi: 64, def: .9 }, size: { kind: 'int', lo: 1, hi: 16, def: 3 },
      colour: { kind: 'colour', def: W } },
    cost: b => b.n,
    draw(f, t) {
      const [x0, y0] = f.p, { n, seed, ms, gap, cycle, lit, size } = f;
      for (let i = 0; i < n; i++) if (((t / ms + i * gap) % cycle) < lit) Rh(x0 + hsh(i, seed) % f.w, y0 + hsh(i, seed + 1) % f.h, size, size, f.colour);
    }
  };

  /* drift: n particles rising from p, gap apart, each over one period, swaying by sway[1] at
     sway[0] times its rise, rise above p as it ends and fading out. A rise below 0 falls. */
  const drift = {
    clock: 'time',
    fields: { p: { kind: 'point' }, n: { kind: 'int', lo: 1, hi: 64, def: 4 }, gap: { kind: 'num', lo: -64, hi: 64, def: 6 },
      period: { kind: 'int', lo: 100, hi: 600000, def: 2300 }, sway: { kind: 'pair', of: [[0, 64], [0, 256]], def: [5, 14] },
      rise: { kind: 'num', lo: -1024, hi: 1024, def: 130 }, size: { kind: 'int', lo: 1, hi: 16, def: 3 }, colour: { kind: 'colour', def: '#ffb000' } },
    cost: b => b.n,
    draw(f, t) {
      const [x0, y0] = f.p, { n, gap, period, rise, size } = f, [k, amp] = f.sway;
      for (let i = 0; i < n; i++) { const ph = ((t / period) + i / n) % 1; alpha(1 - ph); Rh(x0 + i * gap + Math.sin(ph * k + i) * amp, y0 - ph * rise, size, size, f.colour); alpha(1); }
    }
  };

  /* wander: n lights at hashed places in the box from p, w by h, each wandering by sway[1] across
     on a sine of the time over sway[0] and by bob[1] up and down over bob[0], a square of size in
     a glow of radius glow[0] at glow[1], shown for lit of every cycle units of ms. */
  const wander = {
    clock: 'time',
    fields: { p: { kind: 'point' }, w: { kind: 'length', lo: 1 }, h: { kind: 'length', lo: 1 }, n: { kind: 'int', lo: 1, hi: 16, def: 7 },
      seed: { kind: 'int', lo: 0, hi: 998, def: 31 }, ms: { kind: 'int', lo: 1, hi: 60000, def: 900 }, gap: { kind: 'num', lo: 0, hi: 64, def: 1.3 },
      cycle: { kind: 'num', lo: .1, hi: 64, def: 4 }, lit: { kind: 'num', lo: 0, hi: 64, def: 1.4 },
      sway: { kind: 'pair', of: [[1, 100000], [0, 256]], def: [3100, 40] }, bob: { kind: 'pair', of: [[1, 100000], [0, 256]], def: [2700, 24] },
      glow: { kind: 'pair', of: [[1, 64], [0, 1]], def: [9, .18] }, size: { kind: 'int', lo: 1, hi: 16, def: 3 }, colour: { kind: 'colour', def: '#fff3a0' } },
    cost: b => b.n * (1 + B.glow),
    glows: b => b.n,
    draw(f, t) {
      const [x0, y0] = f.p, { n, seed, ms, gap, cycle, lit, size, sway, bob } = f;
      for (let i = 0; i < n; i++) if (((t / ms + i * gap) % cycle) < lit) {
        const x = x0 + hsh(i, seed) % f.w + Math.sin(t / sway[0] + i) * sway[1], y = y0 + hsh(i, seed + 1) % f.h + Math.cos(t / bob[0] + i * 2) * bob[1];
        glow(x + 1, y + 1, f.glow[0], f.colour, f.glow[1]); Rh(x, y, size, size, f.colour);
      }
    }
  };

  /* coals: a fire's bed of n coals gap apart from p, each a little below p by a hash, or the sparks
     over it (part "sparks"), both flickering between of's two colours every ms. */
  const coals = {
    clock: 'time',
    fields: { p: { kind: 'point' }, n: { kind: 'int', lo: 1, hi: 32, def: 9 }, gap: { kind: 'num', lo: 0, hi: 64, def: 14 },
      seed: { kind: 'int', lo: 0, hi: 998, def: 61 }, ms: { kind: 'int', lo: 1, hi: 60000, def: 170 }, part: { kind: 'one', of: ['bed', 'sparks'], def: 'bed' },
      of: { kind: 'colours', min: 2, max: 2, def: ['#cc352c', '#ff8676'] } },
    cost: b => b.n * (b.part === 'bed' ? B.ell(7) : 1),
    draw(f, t) {
      const [x0, y0] = f.p, { n, gap, seed } = f, [c0, c1] = f.of, fl = Math.floor(t / f.ms) % 2;
      if (f.part === 'bed') for (let i = 0; i < n; i++) { const x = x0 + i * gap, h = hsh(i, seed) % 8; ell(x + 6, y0 - h, 9, 7, (i + fl) % 3 ? c0 : c1); }
      else for (let i = 0; i < n; i++) Rh(x0 + i * gap + hsh(i, seed) % 6, y0 + hsh(i, seed + 1) % 8, 4, 3, (i + fl) % 2 ? c0 : c1);
    }
  };

  /* steam: n puffs rising from p, gap apart, each over one period, swaying by sway[1] at sway[0]
     times its rise, rise above p as it ends, r[0] across at the start and half that at the end, r[1]
     high, fading from a. */
  const steam = {
    clock: 'time',
    fields: { p: { kind: 'point' }, n: { kind: 'int', lo: 1, hi: 16, def: 3 }, gap: { kind: 'num', lo: -64, hi: 64, def: 14 },
      period: { kind: 'int', lo: 100, hi: 600000, def: 1800 }, sway: { kind: 'pair', of: [[0, 64], [0, 64]], def: [7, 5] },
      rise: { kind: 'num', lo: -256, hi: 256, def: 46 }, r: { kind: 'pair', of: [[1, 64], [1, 64]], def: [4, 7] }, a: { kind: 'num', lo: 0, hi: 1, def: .8 },
      colour: { kind: 'colour', def: W } },
    cost: b => b.n * B.ell(b.r[1]),
    draw(f, t) {
      const [x0, y0] = f.p, { n, gap, period, rise, a } = f, [k, amp] = f.sway, [rx, ry] = f.r;
      for (let i = 0; i < n; i++) { const ph = ((t / period) + i / n) % 1; alpha(a - ph * a); ell(x0 + i * gap + Math.sin(ph * k + i * 2) * amp, y0 - ph * rise, rx - ph * (rx / 2), ry, f.colour); alpha(1); }
    }
  };

  /* flutes: the grooves down the face of a dish, 2n + 1 of them from p across its middle, the one
     k from the middle running from k * top across at p's height to k * bottom across h below, a
     strip hw either side, groove k in of[k + n]. The grooves stand at fractions of a pixel that
     the points of a pack's shapes, in eighths, cannot give. */
  const flutes = {
    fields: { p: { kind: 'point' }, n: { kind: 'int', lo: 0, hi: 16, def: 6 }, top: { kind: 'num', lo: -64, hi: 64, def: 5.3 }, bottom: { kind: 'num', lo: -64, hi: 64, def: 4.5 },
      h: { kind: 'num', lo: 1, hi: 256, def: 18 }, hw: { kind: 'num', lo: 0, hi: 8, def: .6 }, of: { kind: 'colours', min: 1, max: 33 } },
    cost: b => (2 * b.n + 1) * B.strip(b.n * Math.abs(b.top - b.bottom), b.h, b.hw),
    draw(f) {
      const [x, y] = f.p, n = f.n, of = f.of;
      for (let i = -n; i <= n; i++) strip(x + i * f.top, y, x + i * f.bottom, y + f.h, f.hw, f.hw, of[Math.min(of.length - 1, i + n)]);
    }
  };

  /* fingers: three fingers round p, each a disc r across, reach from p along the angles a - spread,
     a and a + spread (0 is up, clockwise), in colour, as the goblin's hands spread theirs. The
     fingers stand at fractions of a pixel that the points of a pack's shapes, in eighths, cannot
     give. */
  const fingers = {
    fields: { p: { kind: 'point' }, a: { kind: 'num', lo: -4, hi: 4 }, reach: { kind: 'num', lo: 0, hi: 64, def: 9 }, spread: { kind: 'num', lo: 0, hi: 4, def: .65 },
      r: { kind: 'num', lo: 0, hi: 32 }, colour: { kind: 'colour' } },
    cost: b => 3 * B.ell(b.r),
    draw(f) {
      const [x, y] = f.p, a = f.a, s = f.spread;
      for (const d of [-s, 0, s]) ell(x + Math.sin(a + d) * f.reach, y - Math.cos(a + d) * f.reach, f.r, f.r, f.colour);
    }
  };

  /* crust: a pie's top seen from the side and a little above, the middle of its rim at p: the rim
     a flat ellipse rim[0] across and rim[1] high either side of p, and behind its middle a dome
     dome[0] across and dome[1] high, outlined in colour. The crust shades from crust[0], lit from
     the upper left, to crust[3]; a band of it runs round the rim in front of the dome, and over the
     rest two sets of strips on the diagonal are woven over and under, the filling's three colours
     between them. Along the near edge, from crimp left of the middle to crimp right of it, a crimp
     every 7 pixels. The pie is painted pixel by pixel in one pass, as the raspberry pie's top is,
     wider than a pix shape may be. */
  const LATTICE = { period: 16, width: 6, slope: 1.6, shift: 320 }, CRIMP_STEP = 7;
  const crust = {
    fields: { p: { kind: 'point' }, rim: { kind: 'pair', int: true, of: [[4, 64], [1, 32]], def: [38, 9] }, dome: { kind: 'pair', int: true, of: [[1, 64], [1, 64]], def: [32, 21] },
      crimp: { kind: 'int', lo: 0, hi: 64, def: 35 }, crust: { kind: 'colours', min: 4, max: 4, def: ['#ffd98a', '#f2ac4e', '#cc7f32', '#93521d'] },
      filling: { kind: 'colours', min: 3, max: 3, def: ['#d2325f', '#9a1640', '#5c0a24'] }, colour: { kind: 'colour', def: K } },
    // every pixel of the top its own fill at most, and three fills for each crimp
    cost: b => (2 * b.rim[0] + 7) * (b.dome[1] + b.rim[1] + 3) + (Math.floor(2 * b.crimp / CRIMP_STEP) + 1) * (B.ell(4) + B.ell(2) + 1),
    draw(f) {
      const [cx, ry] = f.p, RIM = f.rim, DOME = f.dome, CRUST = f.crust, FILLING = f.filling, O = f.colour, L = LATTICE;
      const rimAt = (u, v) => (u / RIM[0]) ** 2 + (v / RIM[1]) ** 2;
      const onTop = (u, v) => rimAt(u, v) <= 1 || (v <= 0 && (u / DOME[0]) ** 2 + (v / DOME[1]) ** 2 <= 1);
      function crustAt(u, v) {
        if (!onTop(u, v)) return null;
        if (!onTop(u - 2, v) || !onTop(u + 2, v) || !onTop(u, v - 2) || !onTop(u, v + 2)) return O;
        const lit = -u / RIM[0] * .7 - v / DOME[1] * .5, tone = lit > .3 ? 0 : lit > -.2 ? 1 : lit > -.55 ? 2 : 3;
        // the band of crust round the rim, in front of the dome
        const r = rimAt(u, v), inDome = v < 0 && (u / DOME[0]) ** 2 + (v / DOME[1]) ** 2 <= .78;
        if (r > .55 && !inDome) return CRUST[Math.max(0, tone - (r < .75 ? 1 : 0))];
        // the lattice: two sets of strips on the diagonal, woven over and under, the filling between
        const P = L.period, W = L.width, a = u + v * L.slope + L.shift, b = u - v * L.slope + L.shift, pa = a % P, pb = b % P;
        if (pa < W || pb < W) {
          const over = pa < W && pb < W ? ((Math.floor(a / P) + Math.floor(b / P)) % 2 ? pa : pb) : pa < W ? pa : pb;
          return CRUST[Math.max(0, Math.min(3, tone + (over < 1 ? -1 : over >= W - 1 ? 1 : 0)))];
        }
        return FILLING[pa < W + 2 || pb < W + 2 ? 2 : tone < 2 ? 0 : 1];
      }
      pix(cx - RIM[0] - 3, ry - DOME[1] - 1, 2 * RIM[0] + 7, DOME[1] + RIM[1] + 3, (i, j) => crustAt(i - RIM[0] - 3, j - DOME[1] - 1));
      // the crimping along the near edge
      for (let u = -f.crimp; u <= f.crimp; u += CRIMP_STEP) {
        const px = cx + u, py = ry + RIM[1] * Math.sqrt(1 - (u / RIM[0]) ** 2) - 1, tone = u < -12 ? 1 : u < 14 ? 2 : 3;
        ell(px, py, 5, 4, O); ell(px, py, 3, 2, CRUST[tone]); Rh(px - 2, py - 2, 2, 1, CRUST[tone - 1]);
      }
    }
  };

  /* burst: n pieces thrown from p after a trigger. Sparks (piece "spark", the clock the burst's
     progress from 0 to 1) fly out in a fan round a glow, as the hammer's blow throws them; straw
     (piece "straw", the clock the ms since the trigger) is flung apart and falls until 500 ms, as
     the dummy sheds it. Both alternate between of's two colours. */
  const burst = {
    clock: 'trigger',
    fields: { p: { kind: 'point' }, n: { kind: 'int', lo: 1, hi: 16, def: 7 }, piece: { kind: 'one', of: ['spark', 'straw'], def: 'spark' },
      of: { kind: 'colours', min: 2, max: 2, def: ['#ffb000', '#fff3a0'] } },
    cost: b => (b.piece === 'spark' ? B.glow + 4 * b.n : b.n * B.strip(8, Math.max(3, b.n - 4), 1.5)),
    glows: b => (b.piece === 'spark' ? 1 : 0),
    draw(f, q) {
      const [x0, y0] = f.p, n = f.n, [c0, c1] = f.of;
      if (f.piece === 'spark') {
        glow(x0, y0, 44, c1, .35 * (1 - q));
        for (let i = 0; i < n; i++) { const a = -1.35 + i * .45, d = 26 + q * 70 + (i % 2) * 14; SP.spark(x0 + Math.sin(a) * d, y0 - 8 - Math.cos(a) * d * .9, i % 2 ? 6 : 9, i % 3 ? c0 : c1); }
      } else if (q < 500) for (let i = 0; i < n; i++) {
        const x = x0 + i * 20 + q / 8 * (i - (n - 1) / 2), y = y0 - i * 15 + q * q / 1800;
        strip(x, y, x + 8, y - 3 + i, 1.5, 1.5, i % 2 ? c0 : c1);
      }
    }
  };

  /* ---- The library ------------------------------------------------------------------------------ */

  /* The effects, in the order the world format lists them (pack.js names the same list). */
  const TABLE = { sky, stars, ridge, bricks, pines, tree, arch, shelf, stacks, tufts, pebbles, planks, rafters, horseshoe, hood, flame, candle, twinkle, drift, wander, coals, steam, flutes, crust, fingers, burst };
  const NAMES = Object.freeze(Object.keys(TABLE));
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const SCALAR = ['offset', 'length', 'term'];

  /* f with every field it leaves out set to its default. f itself when it leaves none out. */
  function withDefaults(fields, f) {
    let o = f;
    for (const k in fields) if (has(fields[k], 'def') && f[k] === undefined) { if (o === f) o = Object.assign({}, f); o[k] = fields[k].def; }
    return o;
  }
  /* The bounds of fields f drawn on the screen v ({ HL, HR, HT }, KW.view by default): each scalar
     its value at both ends. */
  function bounds(name, f, v) {
    const e = TABLE[name], g = withDefaults(e.fields, f), s = v || V, b = {};
    for (const k in e.fields) {
      const kind = e.fields[k].kind, x = g[k];
      b[k] = kind === 'point' ? [[x[0], x[0]], [x[1], x[1]]] : SCALAR.includes(kind) ? [x, x] : x;
    }
    b.view = { L: [s.HL, s.HL], R: [s.HR, s.HR], T: [s.HT, s.HT], W: [s.HR - s.HL, s.HR - s.HL] };
    return b;
  }

  const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  const api = { NAMES, bounds, withDefaults };
  for (const n of NAMES) {
    const e = TABLE[n], draw = e.draw;
    api[n] = Object.freeze({ clock: e.clock || null, fields: freeze(e.fields), cost: e.cost, glows: e.glows || (() => 0), draw: (f, t) => draw(withDefaults(e.fields, f), t) });
  }
  KW.effects = Object.freeze(api);
  if (typeof module === 'object' && module.exports) module.exports = KW.effects;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
