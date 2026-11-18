/* Knightwatcher: the mouser cat, the first pet (docs/cast.md, The cast). A cast member of the
   medieval world who catches the flies the knight cannot: in every indoor scene, and outdoors while
   the knight is busy. The engine keeps the catch (engine.js); this file gives the cat's drawing in
   code, KW.props.PETS.cat, which the medieval world's pack carries as stamps of pix shapes made from
   it (tools/cat-stamps.js) and which a page draws from when the pack cannot be used.

   Every pose is drawn facing right, with the ground under the middle of the cat at the sprite's
   feet, lit from the left like the rest of the page: each part an outline of many points, a dark
   outline of 2 pixels (C.K) round it, bands from light at the left to dark at the right. A pose is
   worked out once into cells, a colour or null for each pixel of a sprite of SPRITE.size, and
   painted from them into a canvas of its own (D.pix, one call per run of a colour in a row), as the
   pack's stamps are painted, so the two give the same calls. The engine draws the canvas, mirrored
   when the cat faces left, as the goblin's poses are. */
(function (KW) {
  'use strict';
  const D = KW.draw, C = D.C;
  const { lerp } = D;
  const K = C.K;

  /* ---- Painting paths ---------------------------------------------------------------------------
     Every part of the cat is an outline of many points: a closed curve through a few control points
     (blob), or a limb or tail drawn round a centre line whose width changes along it (limb). The
     poses are written at one size and worked out at SCALE times it: each point is moved away from
     the feet (AX, AY) by SCALE. A part is filled into a mask of whole pixels, its outline is that
     mask grown by OUT pixels and painted first in C.K, and its fill is banded along each row from
     light at the left to dark at the right, as the page's shapes are, with the lowest part of it a
     band darker, its shadow. Patches and stripes fill only the pixels of the part they lie on.
     Everything is painted into CELLS, MW by MH, through pen, which takes fillRect as a canvas
     does, clipped to the sprite. */
  const SPRITE = Object.freeze({ size: Object.freeze([200, 150]), feet: Object.freeze([100, 132]) });
  const SCALE = 1.3, OUT = 2;
  let AX = 0, AY = 0, KS = 1, MW = 0, MH = 0, CELLS = null;
  const pen = {
    fillStyle: null,
    fillRect(x, y, w, h) {
      for (let j = Math.max(0, y); j < Math.min(MH, y + h); j++) for (let i = Math.max(0, x); i < Math.min(MW, x + w); i++) CELLS[j * MW + i] = this.fillStyle;
    }
  };
  const sx = v => AX + (v - AX) * KS, sy = v => AY + (v - AY) * KS;

  /* A Catmull-Rom curve through the control points (design units), closed or open, as points. */
  function spline(pts, closed, n) {
    n = n || 6; const out = [], L = pts.length, at = i => closed ? pts[(i + L) % L] : pts[Math.max(0, Math.min(L - 1, i))];
    const segs = closed ? L : L - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    if (!closed) out.push(pts[L - 1]);
    return out;
  }
  const toPx = pts => pts.map(([x, y]) => [sx(x), sy(y)]);
  const blob = (pts, n) => toPx(spline(pts, true, n || 6));
  /* A limb or a tail round the centre line pts, its half width w[i] at each control point, rounded
     at both ends: the union of the pieces between closely spaced points along it, each a convex
     quadrilateral, and a disc at every point, so a bent limb never folds over itself. A mask. */
  function limb(pts, w) {
    const c = toPx(spline(pts, false, 8)), L = c.length;
    const wAt = i => { const q = i / (L - 1) * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(q)); return lerp(w[j], w[j + 1], q - j) * KS; };
    let u = null;
    for (let i = 0; i < L; i++) {
      const r = wAt(i), disc = [];
      for (let k = 0; k < 16; k++) disc.push([c[i][0] + Math.cos(k * Math.PI / 8) * r, c[i][1] + Math.sin(k * Math.PI / 8) * r]);
      const pieces = [disc];
      if (i + 1 < L) {
        const a = c[i], b = c[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, r2 = wAt(i + 1);
        pieces.push([[a[0] + nx * r, a[1] + ny * r], [b[0] + nx * r2, b[1] + ny * r2], [b[0] - nx * r2, b[1] - ny * r2], [a[0] - nx * r, a[1] - ny * r]]);
      }
      for (const pc of pieces) { const m = mask(pc); u = u ? or(u, m) : m; }
    }
    return u;
  }
  /* The mask of a polygon of points, even-odd, by pixel centres: { m, x0, y0, x1, y1 }. */
  function mask(poly) {
    if (poly && poly.m) return poly;
    const m = new Uint8Array(MW * MH); let y0 = MH, y1 = -1, x0 = MW, x1 = -1;
    let lo = Infinity, hi = -Infinity; for (const p of poly) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    for (let y = Math.max(0, Math.floor(lo)); y <= Math.min(MH - 1, Math.ceil(hi)); y++) {
      const yc = y + .5, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.ceil(xs[i] - .5)); x <= Math.min(MW - 1, Math.floor(xs[i + 1] - .5)); x++) {
        m[y * MW + x] = 1; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      }
    }
    return { m, x0, y0, x1, y1 };
  }
  const and = (a, b) => { const m = new Uint8Array(MW * MH); for (let i = 0; i < m.length; i++) m[i] = a.m[i] & b.m[i]; return { m, x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) }; };
  const or = (a, b) => { const m = new Uint8Array(MW * MH); for (let i = 0; i < m.length; i++) m[i] = a.m[i] | b.m[i]; return { m, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; };
  function grow(a, r) {
    const m = new Uint8Array(MW * MH);
    for (let y = Math.max(0, a.y0); y <= a.y1; y++) for (let x = Math.max(0, a.x0); x <= a.x1; x++) if (a.m[y * MW + x])
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r + 1) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < MW && Y < MH) m[Y * MW + X] = 1; }
    return { m, x0: a.x0 - r, y0: a.y0 - r, x1: a.x1 + r, y1: a.y1 + r };
  }
  const pick = (b, f, shift) => { if (typeof b === 'string') return b; let i = b.findIndex(([q]) => f <= q); if (i < 0) i = b.length - 1; return b[Math.min(b.length - 1, i + (shift || 0))][1]; };
  /* Paints the mask a in the colour b, banded along each row; the rows below shade (a share of its
     height) take the next band. */
  function paint(a, b, shade) {
    const c = pen, H = Math.max(1, a.y1 - a.y0 + 1);
    for (let y = Math.max(0, a.y0); y <= Math.min(MH - 1, a.y1); y++) {
      const low = shade != null && (y - a.y0) / H > shade ? 1 : 0;
      let x = Math.max(0, a.x0);
      while (x <= Math.min(MW - 1, a.x1)) {
        if (!a.m[y * MW + x]) { x++; continue; }
        let e = x; while (e + 1 <= a.x1 && a.m[y * MW + e + 1]) e++;
        const w = e - x + 1; let run = null, r0 = x;
        for (let i = x; i <= e + 1; i++) {
          const col = i <= e ? pick(b, (i - x + .5) / w, low) : null;
          if (col !== run) { if (run) { c.fillStyle = run; c.fillRect(r0, y, i - r0, 1); } run = col; r0 = i; }
        }
        x = e + 1;
      }
    }
  }
  /* A part: its outline, then its fill. Returns its mask, for what lies on it. */
  function part(poly, b, shade) { const a = mask(poly); paint(grow(a, OUT), K); paint(a, b, shade); return a; }
  /* Something that lies on a part and goes no further: a patch, a stripe, a muzzle. */
  function on(base, poly, b, shade) { const a = and(mask(poly), base); paint(a, b, shade); return a; }
  /* A line of single pixels, design units, left out where it crosses the mask outside. */
  function line(x0, y0, x1, y1, col, outside) {
    const c = pen; c.fillStyle = col;
    let X0 = Math.round(sx(x0)), Y0 = Math.round(sy(y0)); const X1 = Math.round(sx(x1)), Y1 = Math.round(sy(y1));
    const dx = Math.abs(X1 - X0), dy = -Math.abs(Y1 - Y0), stx = X0 < X1 ? 1 : -1, sty = Y0 < Y1 ? 1 : -1; let err = dx + dy;
    for (;;) { if (!outside || !outside.m[Y0 * MW + X0]) c.fillRect(X0, Y0, 1, 1); if (X0 === X1 && Y0 === Y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; X0 += stx; } if (e2 <= dx) { err += dx; Y0 += sty; } }
  }
  const dot = (x, y, col) => { pen.fillStyle = col; pen.fillRect(Math.round(sx(x)), Math.round(sy(y)), 1, 1); };

  /* ---- Coats ------------------------------------------------------------------------------------
     fur: the coat, lit from the left; far: the far legs, a shade darker; cream: muzzle, chin, chest
     and toes; stripe: the tabby's stripes, or null; patches: the calico's ginger and black, or null;
     ears: the fur of each ear where it differs from the coat; iris: the eyes. The first coat is the
     default: calico, whose white coat and dark outline read across a room in every scene. */
  const GIN = [[.3, '#f0a45a'], [.75, '#d9853f'], [1, '#b0602a']], BLK = [[.3, '#504a5f'], [.75, '#3a3446'], [1, '#272230']];
  const COATS = {
    calico: {
      name: 'Calico',
      fur: [[.25, '#ffffff'], [.62, '#eef0f4'], [.86, '#d6dae3'], [1, '#bcc2cf']], far: [[.35, '#dadde5'], [.8, '#c2c7d2'], [1, '#a9afbd']],
      cream: [[.4, '#ffffff'], [1, '#e8eaf0']], stripe: null, patches: { gin: GIN, blk: BLK }, ears: [GIN, BLK],
      inner: '#f2a896', nose: '#e5807a', iris: '#9ccc58'
    },
    ginger: {
      name: 'Ginger tabby',
      fur: [[.22, '#f4bd7d'], [.6, '#df8d47'], [.86, '#c4702f'], [1, '#a65a25']], far: [[.35, '#c6773a'], [.8, '#a95e27'], [1, '#8c4a1c']],
      cream: [[.4, '#fff4e4'], [1, '#efd2ae']], stripe: [[.5, '#a24f1d'], [1, '#8a3f14']], patches: null, ears: null,
      inner: '#f2a896', nose: '#e5807a', iris: '#d9c24a'
    }
  };

  /* ---- The head ---------------------------------------------------------------------------------
     A wedge, wide at the cheeks with a tuft of fluff on each, narrowing to a muzzle and a small chin,
     turned a little to the right so both eyes show. (hx, hy) is its middle; it is 24 across.
     o: eyes 'alert' (almond, slit pupils), 'round' (wide pupils, stalking), 'open', 'closed',
     'happy', 'half'; look [x, y], the pupils' shift; ears 'up', 'forward', 'back', 'tucked';
     mouth 'none', 'small', 'smile', 'open'. */
  const HEAD = [[-7, -9], [-1, -10.6], [5, -10], [9.5, -7], [11.5, -2.5], [13.2, 2], [11, 3.4], [12, 5.2], [8, 6.6], [4, 9], [0.5, 8.4], [-3.5, 6.6], [-8.5, 5.4], [-11, 4.6], [-12.6, 1.6], [-10.6, 1], [-11, -3], [-9.8, -6.6]];
  function ear(c, base0, tip, base1, inner, fur) {
    const m0 = [lerp(base0[0], tip[0], .5) - (tip[1] - base0[1]) * .06, lerp(base0[1], tip[1], .5)];
    const m1 = [lerp(base1[0], tip[0], .5) + (tip[1] - base1[1]) * .06, lerp(base1[1], tip[1], .5)];
    const a = part(blob([base0, m0, [tip[0] - .4, tip[1] + .6], tip, [tip[0] + .4, tip[1] + .6], m1, base1, [(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2 + 1.5]], 4), fur || c.fur);
    if (inner) {
      const q = (p, k) => [lerp((base0[0] + base1[0]) / 2, p[0], k), lerp((base0[1] + base1[1]) / 2 + 1, p[1], k)];
      on(a, blob([q(base0, .7), q(tip, .78), q(base1, .7)], 4), c.inner);
      // the tufts of fur inside
      const t = q(tip, .45), b = q([(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2], 1);
      line(b[0] - .8, b[1], t[0] - .4, t[1], c.cream[0][1]); line(b[0] + .8, b[1], t[0] + .6, t[1] + .6, c.cream[0][1]);
    }
    return a;
  }
  function eye(ex, ey, w, c, o, far) {
    const e = o.eyes || 'open', [lx, ly] = o.look || [0, 0];
    if (e === 'closed') { line(ex - w, ey - .2, ex - w * .3, ey + .8, K); line(ex - w * .3, ey + .8, ex + w * .4, ey + .8, K); line(ex + w * .4, ey + .8, ex + w, ey - .2, K); return; }
    if (e === 'happy') { line(ex - w, ey + .8, ex - w * .3, ey - .8, K); line(ex - w * .3, ey - .8, ex + w * .4, ey - .8, K); line(ex + w * .4, ey - .8, ex + w, ey + .8, K); return; }
    const h = e === 'round' ? 2.3 : e === 'half' ? 1.3 : 2;
    // the almond: a pointed corner at the inner end, a rounder one at the outer
    const alm = [[ex - w, ey + .3], [ex - w * .4, ey - h], [ex + w * .45, ey - h * .95], [ex + w, ey - .2], [ex + w * .4, ey + h * .85], [ex - w * .45, ey + h * .8]];
    const a = mask(blob(alm, 4)); paint(a, K);
    const iris = and(a, mask(blob(alm.map(([x, y]) => [ex + (x - ex) * .72, ey + (y - ey) * .66]), 4)));
    if (e === 'half') { const lid = { ...iris, m: iris.m.map((v, i) => (Math.floor(i / MW) < iris.y0 + (iris.y1 - iris.y0) / 2 ? 0 : v)) }; paint(lid, c.iris); return; }
    paint(iris, c.iris);
    const px = ex + lx * .8 + (far ? .3 : 0), py = ey + ly * .3;
    if (e === 'round') { const p = and(iris, mask(blob([[px - 1.3, py], [px, py - 1.5], [px + 1.3, py], [px, py + 1.5]], 4))); paint(p, K); }
    else line(px, py - h * .8, px, py + h * .7, K);
    dot(ex - w * .35 + lx * .5, ey - h * .5, C.W);
  }
  function head(hx, hy, c, o) {
    o = o || {};
    const H = ([x, y]) => [hx + x, hy + y], ears = o.ears || 'up', [eL, eR] = c.ears || [null, null];
    const E = {
      up: [[[-10.5, -4.5], [-11.5, -17.5], [-3, -9.6]], [[3, -10], [11.5, -18], [10, -5.5]]],
      forward: [[[-10, -5], [-8.5, -18.5], [-2.5, -9.8]], [[3, -10.2], [9, -18.8], [10.5, -6]]],
      back: [[[-10.8, -4], [-16, -13], [-3.5, -9]], [[3.5, -9.8], [16, -13.5], [10.4, -5]]],
      tucked: [[[-10.5, -4.5], [-13.5, -15.5], [-3, -9.6]], [[3, -10], [13, -16], [10, -5.5]]]
    }[ears];
    ear(c, H(E[0][0]), H(E[0][1]), H(E[0][2]), true, eL);
    ear(c, H(E[1][0]), H(E[1][1]), H(E[1][2]), true, eR);
    const a = part(blob(HEAD.map(H), 5), c.fur, .82);
    if (c.patches) {
      on(a, blob([H([-13, -8]), H([-4, -12]), H([-1, -6]), H([-4, -3.2]), H([-9, -2.8]), H([-13, 0])], 5), c.patches.gin);
      on(a, blob([H([3.5, -12]), H([12, -10]), H([14, -3]), H([10.5, -3.6]), H([6.5, -6.5])], 5), c.patches.blk);
    }
    if (c.stripe) {
      // the M on the brow, and stripes back from the cheeks
      for (const [x0, y0, x1, y1] of [[-3, -10.6, -2.2, -6.2], [1, -10.8, 1, -6.8], [5, -10.5, 4.3, -6.4], [-11.6, 0.5, -7.6, 1.2], [-11.4, 3, -8, 3.2], [12, 1, 8.8, 1.4]])
        on(a, limb([H([x0, y0]), H([x1, y1])], [.9, .45]), c.stripe);
    }
    // the muzzle and chin, lighter, and the nose and mouth
    on(a, blob([H([-1.6, 3]), H([3.4, 1.4]), H([8, 2.8]), H([8.6, 5.6]), H([4, 9.2]), H([-1, 7.4])], 5), c.cream);
    const nose = mask(blob([H([1.9, 1.6]), H([5.1, 1.6]), H([3.5, 3.6])], 3)); paint(nose, c.nose);
    line(hx + 3.5, hy + 3.6, hx + 3.5, hy + 4.6, K);
    const m = o.mouth || 'small';
    if (m === 'small') { line(hx + 3.5, hy + 4.6, hx + 1.6, hy + 5.6, K); line(hx + 3.5, hy + 4.6, hx + 5.4, hy + 5.6, K); }
    if (m === 'smile') { line(hx + 3.5, hy + 4.6, hx + 1.2, hy + 5.8, K); line(hx + 1.2, hy + 5.8, hx + .4, hy + 5.2, K); line(hx + 3.5, hy + 4.6, hx + 5.8, hy + 5.8, K); line(hx + 5.8, hy + 5.8, hx + 6.6, hy + 5.2, K); }
    if (m === 'open') { const mo = mask(blob([H([1.4, 5]), H([5.6, 5]), H([4.8, 7.6]), H([2.2, 7.6])], 3)); paint(grow(mo, 1), K); paint(mo, c.inner); }
    // the eyes
    eye(hx - 3.6, hy - 1.4, 3, c, o, false);
    eye(hx + 7.4, hy - 1.6, 2.7, c, o, true);
    // the whiskers, fine and pale, only where they stand out past the cheeks
    const wc = '#f6f1e6';
    for (const [y0, y1] of [[4.2, 2.8], [5.6, 6.6]]) { line(hx + 8.6, hy + y0, hx + 17, hy + y1, wc, a); line(hx - 1.6, hy + y0, hx - 10.5, hy + y1 - .3, wc, a); }
    return a;
  }

  /* ---- Pieces of the body -----------------------------------------------------------------------
     A leg is a limb through its joints, each a little narrower than the last, ending in a small paw
     with the toes marked; a tail tapers to its tip; the coat's marks lie on the part they are on. */
  function paw(px, py, c, b, dir, up) {
    const a = part(blob([[px - 2.8, py], [px - 2.4, py - 2], [px + .6, py - 2.6], [px + 3.4, py - 1.2], [px + 3.2, py], [px, py + .4]].map(([x, y]) => (up ? [px + (y - py), py - (x - px) * dir] : [x, y])), 4), b);
    if (!up) { line(px + .4, py - .4, px + .4, py - 1.4, K); line(px + 2, py - .4, px + 2, py - 1.2, K); }
    return a;
  }
  /* A leg through its joints, as thick as widths says at each: thick at the top, narrowing to the
     wrist or the hock, then the paw. A leg in front of the body joins it with no seam: where it lies
     on the parts named in into, neither its outline nor its fill is painted, so the shoulder or the
     haunch is drawn there, and from where it leaves them its fill covers their outline. */
  function leg(joints, widths, b, c, opts) {
    opts = opts || {};
    const a = mask(limb(joints, widths));
    if (opts.into) {
      const out = { ...a, m: a.m.map((v, i) => v & (opts.into.m[i] ^ 1)) }, ring = grow(a, OUT);
      ring.m = ring.m.map((v, i) => v & (a.m[i] ^ 1) & (opts.into.m[i] ^ 1));
      paint(ring, K); paint(out, b, .9);
    } else { paint(grow(a, OUT), K); paint(a, b, .9); }
    if (opts.toes !== false) { const [px, py] = joints[joints.length - 1]; paw(px, py, c, c.cream); }
    return a;
  }
  /* The width of a leg at its joints: the near and far front legs and hind legs. */
  const FRONT = [5.2, 3.4, 2.4, 2.1], FRONT_FAR = [4.6, 3, 2.2, 1.9], HIND = [6.8, 3.6, 2.3, 2.1], HIND_FAR = [6, 3.2, 2.1, 1.9];
  function tail(pts, w, c) {
    const a = part(limb(pts, w), c.fur, .8);
    const cl = spline(pts, false, 6), at = q => cl[Math.min(cl.length - 1, Math.round(q * (cl.length - 1)))], dirAt = q => { const p = at(q - .03), r = at(q + .03); const l = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1; return [(r[0] - p[0]) / l, (r[1] - p[1]) / l]; };
    const band = (q, k, b) => { const [x, y] = at(q), [dx, dy] = dirAt(q), nx = -dy * 6, ny = dx * 6; on(a, limb([[x - nx - dx * k, y - ny - dy * k], [x + nx + dx * k, y + ny + dy * k]], [1.1, 1.1]), b); };
    if (c.stripe) for (const q of [.3, .48, .64, .78, .9]) band(q, .6, c.stripe);
    if (c.patches) { band(.32, 1.8, c.patches.gin); const [x, y] = at(1), [dx, dy] = dirAt(.96); on(a, blob([[x - dx * 9 - dy * 6, y - dy * 9 + dx * 6], [x + dx * 4, y + dy * 4], [x - dx * 9 + dy * 6, y - dy * 9 - dx * 6]], 3), c.patches.blk); }
    return a;
  }
  /* Marks on a part: tabby stripes as short strokes [x0, y0, x1, y1], calico patches as blobs. */
  function marks(base, c, stripes, patches, p) {
    if (c.stripe && stripes) for (const [x0, y0, x1, y1, w] of stripes) on(base, limb([p(x0, y0), p(x1, y1)], [w || 1.3, .5]), c.stripe);
    if (c.patches && patches) for (const [pts, k] of patches) on(base, blob(pts, 5), c.patches[k]);
  }

  /* ---- The poses ---------------------------------------------------------------------------------
     (x, y) the ground under the cat's middle, facing right; c the coat; f the frame. */
  const at = (x, y) => (dx, dy) => [x + dx, y + dy];

  /* Resting: curled up asleep, the back rounded, the haunch at the left, the head down on the
     front paws at the right and the tail wrapped round the front to the nose. */
  function restCurl(x, y, c) {
    const p = at(x, y);
    const body = part(blob([p(-29, -3), p(-29, -11), p(-24, -19), p(-14, -24), p(-2, -25.5), p(9, -23.5), p(17, -18), p(21, -10), p(20, -2), p(4, 0), p(-14, 0)], 6), c.fur, .7);
    marks(body, c, [[-20, -21, -17, -14], [-12, -24.5, -10, -17], [-4, -25.5, -3, -18], [4, -25, 3, -18.5], [11, -22, 9, -16]],
      [[[p(-8, -26), p(6, -26), p(10, -19), p(0, -16), p(-9, -18)], 'gin'], [[p(-30, -10), p(-24, -14), p(-20, -7), p(-26, -2)], 'blk']], p);
    const hip = part(blob([p(-28, -5), p(-27, -14), p(-20, -19.5), p(-11, -17), p(-8, -9), p(-12, -2), p(-24, -1)], 6), c.fur, .75);
    marks(hip, c, [[-24, -16, -21, -10], [-17, -18.5, -15, -11]], [[[p(-28, -12), p(-20, -20), p(-13, -15), p(-18, -8), p(-26, -6)], 'gin']], p);
    paw(x + 10, y - .5, c, c.cream);
    head(x + 15.5, y - 10, c, { eyes: 'closed', ears: 'tucked', mouth: 'none' });
    tail([p(-27, -4), p(-21, -.5), p(-6, -.2), p(8, -1), p(17, -2.6), p(22, -5.2)], [3.6, 3.4, 3.1, 2.6, 2, 1.5], c);
  }
  /* Settling after a catch: a loaf, the paws folded under, the eyes half shut, the tail along the
     side. */
  function settle(x, y, c) {
    const p = at(x, y);
    tail([p(-24, -6), p(-20, -1), p(-6, -.4), p(6, -1)], [3.4, 3.2, 2.6, 1.8], c);
    const body = part(blob([p(-27, -2), p(-27, -12), p(-20, -21), p(-8, -25), p(4, -24.5), p(13, -20), p(17, -12), p(17, -2), p(0, 0), p(-16, 0)], 6), c.fur, .72);
    marks(body, c, [[-21, -19, -18, -12], [-14, -23, -12, -15], [-6, -25, -5, -17], [2, -25, 1.5, -17.5]],
      [[[p(-28, -12), p(-19, -22), p(-9, -20), p(-11, -10), p(-24, -7)], 'gin'], [[p(-2, -26), p(9, -24), p(8, -18), p(0, -18)], 'blk']], p);
    const hip = part(blob([p(-27, -4), p(-26, -13), p(-18, -17), p(-11, -12), p(-11, -4), p(-20, -1)], 6), c.fur, .8);
    marks(hip, c, [[-22, -14, -20, -8]], null, p);
    paw(x + 11, y - .4, c, c.cream); paw(x + 17, y - .4, c, c.cream);
    head(x + 10, y - 26, c, { eyes: 'half', ears: 'up', mouth: 'none' });
  }
  /* Sitting: the front legs nearly straight, angled a little forward with a bend at the wrist, the
     chest over their tops, the haunch at the side. */
  function sitting(x, y, c, o, tailPts) {
    const p = at(x, y);
    leg([p(8.5, -25), p(9.6, -15), p(11.8, -5), p(14.2, -.4)], FRONT_FAR, c.far, c);
    tail(tailPts, [3.6, 3.3, 2.8, 2.2, 1.6], c);
    const body = part(blob([p(-1, -40), p(-7, -34), p(-13, -24), p(-17, -12), p(-15, -2), p(-6, 0), p(0, -5), p(5, -11.5), p(10.5, -15), p(11.5, -26), p(7, -38)], 6), c.fur, .9);
    marks(body, c, [[-6, -34, -3, -30], [-10, -27, -6, -24], [-13, -20, -9, -18]], [[[p(-6, -37), p(1, -40), p(3, -32), p(-4, -28)], 'blk']], p);
    on(body, blob([p(5, -34), p(10.5, -30), p(11.5, -20), p(9, -14), p(4, -16), p(2.5, -26)], 5), c.cream);
    const hip = part(blob([p(-17, -6), p(-16, -16), p(-9, -21), p(-1, -17), p(1, -8), p(-2, -1), p(-15, -.5)], 6), c.fur, .8);
    marks(hip, c, [[-14, -16, -11, -11], [-9, -19, -7, -13], [-4, -18.5, -3, -12.5]], [[[p(-17, -10), p(-10, -21), p(-1, -15), p(-6, -6), p(-15, -3)], 'gin']], p);
    paw(x - 1.5, y - .3, c, c.cream);
    leg([p(3.5, -26), p(4.6, -15), p(6.6, -4.8), p(9, -.4)], FRONT, c.fur, c, { into: or(body, hip) });
    head(x + 5, y - 47, c, o);
  }
  /* Alert, sitting up: ears forward, eyes on the fly with slit pupils, the tail's tip flicking
     (frame 1). */
  function alert(x, y, c, f) {
    const tip = f ? [-27, -24] : [-31, -19];
    sitting(x, y, c, { eyes: 'alert', ears: 'forward', look: [1, -1], mouth: 'small' }, [[x - 13, y - 3], [x - 21, y - 2], [x - 28, y - 6], [x - 31, y - 13], [x + tip[0], y + tip[1]]]);
  }
  /* Pleased with the catch: sitting, the eyes happy, a smile, the tail up and curled at the tip. */
  function pleased(x, y, c) {
    sitting(x, y, c, { eyes: 'happy', ears: 'up', mouth: 'smile' }, [[x - 13, y - 5], [x - 19, y - 14], [x - 20, y - 27], [x - 15, y - 37], [x - 9, y - 38]]);
  }
  /* Standing, for the walk and the landing: the long back with the shoulder blade over the front
     leg, the belly tucked up, the haunch over the thigh. o.far and o.near: the joints of the hind
     and front legs, shoulder or hip first. */
  function standing(x, y, c, o) {
    const p = at(x, y), P = L => L.map(([a, b]) => p(a, b));
    leg(P(o.far[0]), HIND_FAR, c.far, c); leg(P(o.far[1]), FRONT_FAR, c.far, c);
    tail(P(o.tail), [3.6, 3.3, 2.8, 2.2, 1.6], c);
    const dy = o.dy || 0, q = (a, b) => p(a, b + (a > 0 ? dy * a / 20 : 0));
    const body = part(blob([q(-28, -21), q(-22, -26), q(-10, -27), q(2, -26.5), q(10, -29), q(15, -27), q(20, -22), q(21, -15), q(15, -12), q(6, -12.5), q(-4, -13.5), q(-14, -13), q(-22, -14), q(-28, -16)], 6), c.fur, .8);
    marks(body, c, [[-20, -26, -18, -19], [-12, -27, -11, -20], [-4, -27, -3.5, -20], [4, -27, 4, -21], [11, -29, 10.5, -23]],
      [[[q(-14, -28), q(0, -28), q(4, -21), q(-6, -18), q(-14, -21)], 'gin'], [[q(6, -30), q(14, -29), q(13, -23), q(7, -24)], 'blk']], p);
    on(body, blob([q(15, -24), q(21, -19), q(19, -13), q(12, -13), q(13, -19)], 5), c.cream);
    const hip = part(blob([q(-29, -18), q(-25, -25), q(-16, -26), q(-11, -20), q(-12, -13), q(-19, -10), q(-27, -12)], 6), c.fur, .8);
    marks(hip, c, [[-24, -24, -22, -17], [-17, -25, -16, -18]], [[[q(-29, -20), q(-22, -27), q(-13, -21), q(-20, -14)], 'gin']], p);
    const trunk = or(body, hip);
    leg(P(o.near[0]), HIND, c.fur, c, { into: trunk });
    leg(P(o.near[1]), FRONT, c.fur, c, { into: trunk });
    head(x + o.head[0], y + o.head[1], c, o.face);
  }
  /* The walk: in each frame one front and one hind paw are planted and the others swing through, the
     swinging paw a little off the ground. */
  function walk(x, y, c, f) {
    const s = f ? 1 : -1, lift = k => (k > 0 ? -1.6 : -.4);
    standing(x, y, c, {
      far: [[[-18, -20], [-11 - 2 * s, -11.5], [-19 - 3 * s, -7], [-15 - 4 * s, lift(s)]], [[12, -21], [9 + s, -11.5], [11 + 3 * s, -3.5], [13.5 + 4 * s, lift(-s)]]],
      near: [[[-19, -20], [-12 + 3 * s, -11.5], [-20 + 3 * s, -7], [-16 + 4 * s, lift(-s)]], [[13, -21], [10 - s, -11.5], [12 - 3 * s, -3.5], [14.5 - 4 * s, lift(s)]]],
      tail: [[-27, -20], [-33, -28], [-35, -38], [-31, -46], [-27, -47]], head: [25, -32], face: { eyes: 'open', ears: 'up', look: [1, 0], mouth: 'small' }
    });
  }
  /* Landing with the swipe: three paws down, the near front leg out and up, bent at the wrist. */
  function land(x, y, c) {
    standing(x, y, c, {
      dy: 3,
      far: [[[-18, -20], [-11, -11], [-18, -6.5], [-14.5, -.4]], [[12, -19], [11, -10.5], [13.5, -3.5], [16, -.4]]],
      near: [[[-19, -20], [-12, -11], [-20, -6.5], [-16.5, -.4]], [[13, -18], [22, -11.5], [32, -12.5], [40, -15.5]]],
      tail: [[-27, -20], [-35, -25], [-40, -33], [-38, -41], [-34, -44]], head: [24, -26], face: { eyes: 'alert', ears: 'forward', look: [2, -1], mouth: 'small' }
    });
  }
  /* Stalking: the shoulder blades up, the belly low, the elbows behind and below the blades with the
     forearms angled forward to the paws, the head low and forward, the tail out straight behind.
     The two frames are the two halves of one slow step: in frame 1 the near front paw and the far
     hind paw are lifted and forward. */
  function stalk(x, y, c, f) {
    const p = at(x, y), s = f ? 1 : 0;
    leg([p(-18, -12), p(-11 + 2 * (1 - s), -5.5), p(-20 + 3 * (1 - s), -2.8), p(-15.5 + 3 * (1 - s), -.4 - s * 1.4)], HIND_FAR, c.far, c);
    leg([p(12, -15), p(6.5, -4.8), p(15.5 - 2 * s, -2.6), p(19 - 2.5 * s, -.4)], FRONT_FAR, c.far, c);
    tail([p(-26, -12), p(-36, -12), p(-46, -11.5), p(-54, -12.5), p(-59, -15)], [3.5, 3.1, 2.6, 2, 1.5], c);
    const body = part(blob([p(-28, -10), p(-26, -16), p(-16, -18), p(-4, -15.5), p(6, -18), p(11, -22.5), p(16, -20.5), p(20, -14), p(19, -9), p(10, -6.5), p(-4, -5.5), p(-16, -6), p(-24, -6.5)], 6), c.fur, .75);
    marks(body, c, [[-20, -17.5, -19, -11], [-12, -17, -11, -10.5], [-4, -15.5, -3.5, -9.5], [4, -17.5, 4, -11.5], [10, -22, 9.5, -15.5]],
      [[[p(-16, -19), p(-2, -17), p(0, -10), p(-12, -9)], 'gin'], [[p(6, -20), p(12, -24), p(15, -18), p(9, -15)], 'blk']], p);
    const hip = part(blob([p(-29, -12), p(-26, -17.5), p(-18, -18), p(-13, -12), p(-15, -6), p(-24, -5)], 6), c.fur, .8);
    marks(hip, c, [[-25, -17, -23, -11], [-19, -18, -18, -11.5]], [[[p(-29, -13), p(-22, -19), p(-15, -14), p(-21, -8)], 'gin']], p);
    const trunk = or(body, hip);
    leg([p(-20, -12), p(-12.5 + 2 * s, -5), p(-22 + 2 * s, -2.8), p(-17.5 + 2 * s, -.4)], HIND, c.fur, c, { into: trunk });
    leg([p(10, -15), p(3.5, -4.5), p(12.5 + 4 * s, -2.6 - 1.4 * s), p(16 + 5 * s, -.4 - 1.8 * s)], FRONT, c.fur, c, { into: trunk });
    head(x + 27, y - 15, c, { eyes: 'round', ears: 'forward', look: [2, -1], mouth: 'none' });
  }
  /* The pounce, a long leap: the spine stretched up and forward, the hind legs out behind, thick at
     the thigh and long in the foot, the front legs reaching past the face for the fly. Also the hop
     where the floor steps up or down. */
  function pounce(x, y, c) {
    const p = at(x, y);
    leg([p(-17, -17), p(-26, -13), p(-35, -9), p(-42, -7.5)], HIND_FAR, c.far, c, { toes: false }); paw(x - 43, y - 7.5, c, c.cream, -1, false);
    leg([p(6, -35), p(19, -39), p(32, -49), p(38, -56)], FRONT_FAR, c.far, c, { toes: false }); paw(x + 39, y - 57, c, c.cream);
    tail([p(-22, -18), p(-34, -22), p(-45, -24), p(-54, -22), p(-60, -18)], [3.6, 3.2, 2.7, 2.1, 1.6], c);
    const body = part(limb([p(-22, -16), p(-12, -23), p(0, -30), p(10, -37)], [9, 8, 7, 8.5]), c.fur, .8);
    marks(body, c, [[-20, -24, -15, -17], [-13, -30, -8, -22], [-5, -35, -1, -27], [3, -40, 7, -33]],
      [[[p(-14, -32), p(-2, -38), p(4, -30), p(-8, -22)], 'gin'], [[p(2, -42), p(10, -46), p(14, -38), p(6, -33)], 'blk']], p);
    const hip = part(blob([p(-29, -15), p(-26, -24), p(-17, -27), p(-11, -20), p(-13, -12), p(-22, -9)], 6), c.fur, .8);
    marks(hip, c, [[-25, -23, -21, -17], [-18, -26, -15, -19]], [[[p(-29, -17), p(-21, -27), p(-13, -21), p(-19, -12)], 'gin']], p);
    const trunk = or(body, hip);
    leg([p(-19, -17), p(-28, -11), p(-38, -6), p(-47, -2.5)], HIND, c.fur, c, { toes: false, into: trunk }); paw(x - 48, y - 2.5, c, c.cream, -1, false);
    head(x + 16, y - 49, c, { eyes: 'alert', ears: 'back', look: [2, -2], mouth: 'open' });
    leg([p(8, -33), p(20, -35.5), p(34, -44), p(42, -50)], FRONT, c.fur, c, { toes: false, into: trunk }); paw(x + 43, y - 51, c, c.cream);
  }

  /* Each pose by the name the pet role gives it (docs/cast.md, The cast), its drawing and its
     frame. */
  const POSES = {
    rest: [restCurl, 0], settle: [settle, 0], alert0: [alert, 0], alert1: [alert, 1], stalk0: [stalk, 0], stalk1: [stalk, 1],
    pounce: [pounce, 0], land: [land, 0], pleased: [pleased, 0], walk0: [walk, 0], walk1: [walk, 1]
  };
  const POSE_NAMES = Object.freeze(Object.keys(POSES));

  /* The cells of a pose in a coat: a colour or null for each pixel of the sprite, row by row, the
     feet at SPRITE.feet. */
  function cells(coat, name) {
    const [w, h] = SPRITE.size, [ax, ay] = SPRITE.feet, [fn, f] = POSES[name];
    AX = ax; AY = ay; KS = SCALE; MW = w; MH = h; CELLS = new Array(w * h).fill(null);
    try { fn(ax, ay, COATS[coat], f); return CELLS; } finally { KS = 1; CELLS = null; }
  }
  /* A canvas of w by h painted once from cells, one call per run of a colour in a row, as the
     compiler paints a pack's (world.js). */
  function paintCells(list, w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const was = D.getCtx();
    D.setCtx(cv.getContext('2d')); D.pix(0, 0, w, h, (i, j) => list[j * w + i]); D.setCtx(was);
    return cv;
  }

  /* ---- Where the cat lives in each scene ---------------------------------------------------------
     By the scene's name: rest, where it rests, the ground under its middle, and face, the way it
     faces there (1 right, -1 left); floors, the surfaces it may walk on near its spot, [x0, x1, y],
     and lane, the floor it walks on anywhere else; fly, the point a fly comes down to for the
     catch, near the spot, where the paw meets it. bed is the same while the knight is in bed, in a
     scene with a bed. Each spot is clear of the knight's walk and swing, of every place for a
     device and of what the scene's acts draw. */
  const SPOTS = {
    // the merlon at the left; it leaps to the next merlon, over the stretch where the goblin climbs
    // and the crate lands
    battlement: { rest: [160, 411], face: 1, floors: [[40, 119, 464], [120, 199, 411], [200, 279, 464], [280, 360, 411]], lane: 530, fly: [299, 290] },
    // the bough of the right-hand tree, over the fire; it leaps along the bough, never down
    camp: { rest: [830, 401], face: -1, floors: [[700, 850, 401]], lane: 530, fly: [704, 300] },
    // the curtain wall's walk, between two merlons; the catch is in the sky over the wall
    yard: { rest: [876, 221], face: -1, floors: [[560, 958, 221]], lane: 530, fly: [767, 150] },
    // the floor in front of the hearth, the catch over the rug; with the knight in bed, the foot of
    // the bed
    house: { rest: [895, 590], face: -1, floors: [], lane: 590, fly: [790, 460],
      bed: { rest: [312, 405], face: -1, floors: [[165, 386, 405]], lane: 578, fly: [194, 330] } },
    // the lower shelf, among the jars, left of the barrel and the pie
    cellar: { rest: [352, 380], face: -1, floors: [[0, 960, 380]], lane: 530, fly: [232, 320] },
    // the ledge of the forge
    smithy: { rest: [884, 318], face: -1, floors: [[724, 958, 318]], lane: 530, fly: [760, 262] },
    // the lowest step of the dais, the catch over the floor between the knight and the dais
    court: { rest: [620, 512], face: -1, floors: [[600, 958, 512]], lane: 530, fly: [532, 420] }
  };

  /* The cat as the engine draws it, with the interface the compiler gives a pet of a pack
     (world.js): its name; coats, each coat's name by its id, the default first; poses, the names of
     its poses; size and anchor, its sprite's size and the feet in it; pose(coat, name), the pose
     painted once into a canvas, the coat or the pose the cat lacks giving its first; spots, by
     scene; and the measures of the pounce, as the engine takes them: paw, where the paw that meets
     the fly is at the top of the leap, from the ground under the cat's middle, facing right; take,
     how far behind that the cat takes off; land, how far past it the cat comes down; and lift, the
     least height of the leap. cells(coat, name) gives a pose's cells, for tools/cat-stamps.js. */
  const sprites = {};
  function pose(coat, name) {
    const c = Object.prototype.hasOwnProperty.call(COATS, coat) ? coat : 'calico', n = Object.prototype.hasOwnProperty.call(POSES, name) ? name : 'rest', key = c + '|' + n;
    if (!sprites[key]) sprites[key] = paintCells(cells(c, n), SPRITE.size[0], SPRITE.size[1]);
    return sprites[key];
  }
  const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  const cat = {
    name: 'Mouser cat',
    coats: freeze({ calico: COATS.calico.name, ginger: COATS.ginger.name }),
    poses: POSE_NAMES, size: SPRITE.size, anchor: SPRITE.feet, pose, cells,
    spots: freeze(SPOTS),
    paw: freeze([57.25, -67.625]), take: 52, land: 46.75, lift: 39
  };
  KW.props.PETS = { cat: Object.freeze(cat) };
})(window.KW);
