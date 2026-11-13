/* Knightwatch: the drawing primitives, the palette, and the view they draw into.
   Every file of the page shares the one namespace object, KW. */
(function (KW) {
  'use strict';

  /* The view. Every scene is composed on a 960 by 600 grid with the ground at 530. The engine
     places the knight in units of U grid pixels. The canvas is cut to the screen's own
     shape in whole device pixels, so its real edges lie outside the grid: HL, HR and HT. fit() in
     main.js sets them, and every backdrop is filled out to them. X0 and Y0 place the grid on the
     canvas, LW and LH are the canvas's size, and SC is one canvas pixel in CSS pixels. */
  const V = KW.view = { HW: 960, HH: 600, HFL: 530, U: 5, HL: 0, HR: 960, HT: 0, X0: 0, Y0: 0, LW: 960, LH: 600, SC: 1 };

  /* Everything draws into ctx: the display's canvas, or a backdrop's while that is being painted. */
  let ctx = null;
  const setCtx = c => { ctx = c; }, getCtx = () => ctx;

  function alpha(a) { ctx.globalAlpha = a; }
  /* A soft light: three discs of falling strength. */
  function glow(x, y, r, c, a) {
    ctx.fillStyle = c;
    for (const [k, f] of [[1, .5], [.7, .8], [.42, 1]]) { ctx.globalAlpha = a * f; ctx.beginPath(); ctx.arc(x, y, r * k, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }
  const lerp = (a, b, q) => a + (b - a) * q, clamp01 = q => Math.max(0, Math.min(1, q)), ease = q => 1 - (1 - q) * (1 - q);

  /* ---- The primitives ------------------------------------------------------------------------
     Shapes are filled row by row in whole pixels, and a shape's colour may be a list of
     [fraction, colour] bands across its width, which shades a curve the way its outline runs. */
  const C = { K: '#1a1524', W: '#ffffff', S0: '#f6f9fc', S1: '#d8e0ea', S2: '#aab6c6', S3: '#7d899b', S4: '#525c6e',
    R0: '#ff8676', R1: '#ff4a3d', R2: '#cc352c', R3: '#8f231d', F0: '#ffe3c4', F1: '#f6cda4', F2: '#e2ad82',
    B0: '#6f9eff', B1: '#3f74e0', B2: '#2f59b6', B3: '#213f86', G0: '#ffe28a', G1: '#ffb000', G2: '#c98600', G3: '#8f5c00',
    N0: '#b98045', N1: '#96622f', N2: '#70461f', N3: '#4c2e12' };
  const STEEL = [[.12, C.S0], [.58, C.S1], [.84, C.S2], [1, C.S3]], STEEL2 = [[.14, C.S1], [.6, C.S2], [1, C.S3]], STEEL3 = [[.2, C.S2], [.7, C.S3], [1, C.S4]];
  const GOLD = [[.3, C.G0], [.75, C.G1], [1, C.G2]], LEATHER = [[.2, C.N0], [.65, C.N1], [1, C.N2]];

  function Rh(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function hrow(y, x0, x1, b) {
    if (x1 < x0) return;
    if (typeof b === 'string') { ctx.fillStyle = b; ctx.fillRect(x0, y, x1 - x0 + 1, 1); return; }
    const w = x1 - x0 + 1; let p = 0;
    for (const [f, c] of b) { const e = Math.round(w * f); if (e > p) { ctx.fillStyle = c; ctx.fillRect(x0 + p, y, e - p, 1); p = e; } }
  }
  function hcol(x, y0, y1, b) {
    if (y1 < y0) return;
    if (typeof b === 'string') { ctx.fillStyle = b; ctx.fillRect(x, y0, 1, y1 - y0 + 1); return; }
    const h = y1 - y0 + 1; let p = 0;
    for (const [f, c] of b) { const e = Math.round(h * f); if (e > p) { ctx.fillStyle = c; ctx.fillRect(x, y0 + p, 1, e - p); p = e; } }
  }
  function ell(cx, cy, rx, ry, b, c0, c1) {
    cy = Math.round(cy); const n = Math.ceil(ry);
    for (let dy = -n; dy <= n; dy++) {
      const y = cy + dy; if ((c0 != null && y < c0) || (c1 != null && y > c1)) continue;
      const q = 1 - (dy * dy) / (ry * ry); if (q < 0) continue;
      const hw = rx * Math.sqrt(q); hrow(y, Math.round(cx - hw), Math.round(cx + hw), b);
    }
  }
  function rrect(x, y, w, h, r, b, c0, c1) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); r = Math.min(r, w / 2, h / 2);
    for (let j = 0; j < h; j++) {
      const yy = y + j; if ((c0 != null && yy < c0) || (c1 != null && yy > c1)) continue;
      const d = j < r ? r - j - .5 : j >= h - r ? j - (h - r) + .5 : 0, ins = d > 0 ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0;
      hrow(yy, Math.round(x + ins), Math.round(x + w - 1 - ins), b);
    }
  }
  /* A convex polygon, filled by rows, or by columns when the bands should run along a level shape. */
  function poly(pts, b, cols) {
    const A = cols ? 0 : 1, B = cols ? 1 : 0; let mn = 1e9, mx = -1e9;
    for (const p of pts) { mn = Math.min(mn, p[A]); mx = Math.max(mx, p[A]); }
    for (let v = Math.ceil(mn); v <= Math.floor(mx); v++) {
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], a = p[A], c = q[A];
        if ((a <= v && c >= v) || (c <= v && a >= v)) {
          if (a === c) { lo = Math.min(lo, p[B], q[B]); hi = Math.max(hi, p[B], q[B]); }
          else { const w = p[B] + (q[B] - p[B]) * (v - a) / (c - a); lo = Math.min(lo, w); hi = Math.max(hi, w); }
        }
      }
      if (hi >= lo) { if (cols) hcol(v, Math.round(lo), Math.round(hi), b); else hrow(v, Math.round(lo), Math.round(hi), b); }
    }
  }
  function strip(x0, y0, x1, y1, hw0, hw1, b) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
    poly([[x0 - px * hw0, y0 - py * hw0], [x1 - px * hw1, y1 - py * hw1], [x1 + px * hw1, y1 + py * hw1], [x0 + px * hw0, y0 + py * hw0]], b, Math.abs(dx) > Math.abs(dy));
  }
  /* A rectangle shaded in bands from top to bottom, for beams, shelves and ledges. */
  function Rv(x, y, w, h, b) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (typeof b === 'string') { ctx.fillStyle = b; ctx.fillRect(x, y, w, h); return; }
    let p = 0; for (const [f, c] of b) { const e = Math.round(h * f); if (e > p) { ctx.fillStyle = c; ctx.fillRect(x, y + p, w, e - p); p = e; } }
  }
  /* A shape given pixel by pixel: f(i, j) returns the colour at (x + i, y + j), or null for clear.
     Each pixel is painted once, so a shape drawn at partial alpha shows no seams where its parts
     overlap. */
  function pix(x, y, w, h, f) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) {
      let run = null, i0 = 0;
      for (let i = 0; i <= w; i++) {
        const c = i < w ? f(i, j) : null;
        if (c !== run) { if (run) { ctx.fillStyle = run; ctx.fillRect(x + i0, y + j, i - i0, 1); } run = c; i0 = i; }
      }
    }
  }
  const hsh = (a, b) => hash(Math.round(a) * 7919 + b * 104729 + 13);
  function dith(x, y, w, h, c) { ctx.fillStyle = c; x = Math.round(x); y = Math.round(y); for (let j = 0; j < h; j += 2) for (let i = (j / 2 % 2) * 2; i < w; i += 4) ctx.fillRect(x + i, y + j, 2, 2); }

  KW.draw = { C, STEEL, STEEL2, STEEL3, GOLD, LEATHER, setCtx, getCtx,
    alpha, glow, hash, lerp, clamp01, ease, Rh, Rv, hrow, hcol, ell, rrect, poly, strip, pix, hsh, dith };
  KW.scenes = KW.scenes || {};
})(window.KW = window.KW || {});
