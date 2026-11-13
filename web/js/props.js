/* Knightwatch: the props that more than one scene uses, or that the engine draws over a scene:
   the raspberry pie (the Raspberry Pi), fire, sky and stars, the coarse greatsword, and the flies,
   the goblin, the crate and its parachute. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, C = D.C;
  const { R, spr, tline, alpha, Rh, ell, rrect, poly, strip, sprS, hsh, dith, GOLD } = D;

  /* ---- On the coarse grid ------------------------------------------------------------------- */
  /* The greatsword, drawn from the middle of its grip: the pommel at -11, the grip to 3, the guard
     at 5 and the blade from 7 to 52 along the angle a (0 is straight up). */
  function greatsword(hx, hy, a) {
    const sx = Math.sin(a), sy = -Math.cos(a), px = -sy, py = sx;
    tline(hx + sx * 7, hy + sy * 7, hx + sx * 51, hy + sy * 51, 8, 'K');
    tline(hx + sx * 7, hy + sy * 7, hx + sx * 49, hy + sy * 49, 6, 's');
    tline(hx + sx * 7 - px, hy + sy * 7 - py, hx + sx * 49 - px, hy + sy * 49 - py, 4, 'S');
    tline(hx + sx * 8 - px * 2, hy + sy * 8 - py * 2, hx + sx * 47 - px * 2, hy + sy * 47 - py * 2, 2, 'W');
    tline(hx + sx * 50, hy + sy * 50, hx + sx * 53, hy + sy * 53, 4, 'K'); tline(hx + sx * 50, hy + sy * 50, hx + sx * 52, hy + sy * 52, 2, 'S');
    tline(hx - sx * 10, hy - sy * 10, hx + sx * 4, hy + sy * 4, 2, 'N');
    tline(hx + sx * 5 - px * 8, hy + sy * 5 - py * 8, hx + sx * 5 + px * 8, hy + sy * 5 + py * 8, 3, 'G');
    R(hx + sx * 5 - px * 9 - 2, hy + sy * 5 - py * 9 - 2, 4, 4, 'G'); R(hx + sx * 5 + px * 9 - 2, hy + sy * 5 + py * 9 - 2, 4, 4, 'G');
    R(hx - sx * 11 - 2, hy - sy * 11 - 2, 4, 4, 'G');
  }
  /* The pie, or an empty plate and a question mark when the Pi is silent. */
  function pie(x, y, t, ok) {
    if (!ok) { spr(x, y, SP.PLATE); if (Math.floor(t / 400) % 2) spr(x + 3, y - 9, SP.QUES); return; }
    spr(x, y, SP.PIE);
    for (let i = 0; i < 3; i++) { const ph = ((t / 1800) + i / 3) % 1; alpha(.9 - ph * .9); R(x + 2 + i * 3 + Math.round(Math.sin(ph * 7 + i * 2)), y - 2 - ph * 9, 1, 2, 'W'); alpha(1); }
  }

  /* ---- On the fine grid --------------------------------------------------------------------- */
  /* A night sky in bands of colour, dithered where they meet, from the top edge down to yEnd. */
  function sky(cols, yEnd) {
    const { HL, HR, HT, HH } = V, n = cols.length, h = (yEnd - HT) / n;
    for (let i = 0; i < n; i++) { Rh(HL, HT + i * h, HR - HL, h + 1, cols[i]); if (i) dith(HL, HT + i * h - 14, HR - HL, 14, cols[i]); }
    Rh(HL, yEnd, HR - HL, HH - yEnd + 20, cols[n - 1]);
  }
  function starsHD(yMax) {
    const { HL, HR, HT } = V;
    for (let i = 0; i < 190; i++) {
      const x = HL + hsh(i, 1) % (HR - HL), y = HT + hsh(i, 2) % Math.max(1, yMax - HT), k = hsh(i, 3) % 12, c = k < 7 ? '#7f879d' : k < 11 ? '#d7deee' : '#ffffff';
      Rh(x, y, 2, 2, c); if (k === 11) { Rh(x - 3, y, 8, 2, c); Rh(x, y - 3, 2, 8, c); }
    }
  }
  function flameHD(x, y, k, t) {
    for (const [f, c, ph] of [[1, '#ff5a1e', 0], [.7, '#ffb000', 1.7], [.42, '#fff3a0', 3.1]]) {
      const h = (46 + 7 * Math.sin(t / 110 + ph)) * k * f, w = 14 * k * f, sw = Math.sin(t / 170 + ph) * 5 * k, by = y - w * .6;
      ell(x, by, w, w, c); poly([[x - w, by], [x + sw, by - h], [x + w, by]], c);
    }
  }
  function pieHD(x, y, t, ok) {
    ell(x + 32, y + 24, 35, 7, C.S4); ell(x + 32, y + 22, 33, 5, [[.3, C.S1], [1, C.S2]]);
    if (!ok) { for (const [cx, cy] of [[18, 20], [30, 22], [44, 19], [38, 23]]) Rh(x + cx, y + cy, 3, 2, C.G2); if (Math.floor(t / 400) % 2) sprS(x + 17, y - 34, SP.QUES, 5); return; }
    rrect(x + 1, y + 7, 62, 18, 8, C.K); rrect(x + 3, y + 9, 58, 14, 6, GOLD);
    ell(x + 32, y + 9, 27, 9, C.K); ell(x + 32, y + 9, 25, 7, [[.3, '#ff6b6b'], [1, C.R2]]);
    for (let i = 0; i < 7; i++) { const bx = x + 12 + i * 7, by = y + 7 + (i % 2) * 4; ell(bx, by, 4, 3, i % 3 ? C.R1 : '#ff8fb0'); Rh(bx - 2, by - 2, 2, 1, C.W); }
    strip(x + 10, y + 12, x + 54, y + 4, 1.5, 1.5, C.G0); strip(x + 10, y + 4, x + 54, y + 12, 1.5, 1.5, C.G0);
    for (let i = 0; i < 3; i++) { const ph = ((t / 1800) + i / 3) % 1; alpha(.8 - ph * .8); ell(x + 20 + i * 12 + Math.sin(ph * 7 + i * 2) * 5, y - 8 - ph * 46, 4 - ph * 2, 7, C.W); alpha(1); }
  }
  function crateHD(x, y) {
    Rh(x, y, 60, 50, C.K); Rh(x + 3, y + 3, 54, 44, C.N1);
    for (let j = 0; j < 3; j++) { Rh(x + 3, y + 3 + j * 15, 54, 2, C.N0); Rh(x + 3, y + 16 + j * 15, 54, 1, C.N3); }
    strip(x + 6, y + 6, x + 54, y + 44, 3, 3, C.N2); strip(x + 54, y + 6, x + 6, y + 44, 3, 3, C.N2);
    Rh(x + 3, y + 3, 6, 44, C.N2); Rh(x + 51, y + 3, 6, 44, C.N2);
    for (const [cx, cy] of [[3, 3], [49, 3], [3, 39], [49, 39]]) Rh(x + cx, y + cy, 8, 8, C.S4);
    rrect(x + 22, y + 18, 16, 14, 3, C.G2); rrect(x + 24, y + 20, 12, 10, 2, C.G1);
  }
  function flyHD(x, y, flap) { alpha(.85); ell(x - 6, y - (flap ? 6 : 2), 6, 3, C.W); ell(x + 6, y - (flap ? 6 : 2), 6, 3, C.W); alpha(1); ell(x, y, 5, 4, '#3a3344'); Rh(x - 3, y - 2, 2, 2, C.R1); }
  function poofHD(x, y) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; strip(x + Math.sin(a) * 6, y - Math.cos(a) * 6, x + Math.sin(a) * 17, y - Math.cos(a) * 17, 1.5, 1.5, '#fff3a0'); } ell(x, y, 4, 4, C.W); }
  function goblinHD(x, y) {
    const g = [[.2, '#b4f0a0'], [.7, '#8fe07a'], [1, '#5fae4f']];
    poly([[x + 2, y + 6], [x + 14, y + 26], [x + 20, y + 14]], C.K); poly([[x + 58, y + 6], [x + 46, y + 26], [x + 40, y + 14]], C.K);
    poly([[x + 5, y + 10], [x + 14, y + 23], [x + 18, y + 15]], '#5fae4f'); poly([[x + 55, y + 10], [x + 46, y + 23], [x + 42, y + 15]], '#5fae4f');
    ell(x + 30, y + 26, 22, 20, C.K); ell(x + 30, y + 26, 19, 17, g);
    for (const ex of [21, 39]) { ell(x + ex, y + 22, 6, 6, C.W); ell(x + ex + 1, y + 23, 3, 3, C.K); }
    rrect(x + 19, y + 32, 22, 8, 3, C.K); for (let i = 0; i < 4; i++) Rh(x + 21 + i * 5, y + 33, 3, 3, C.W);
  }
  function chuteHD(cx, y) {
    ell(cx, y - 44, 52, 34, C.K, null, y - 44); ell(cx, y - 44, 49, 31, [[.2, C.R1], [.4, C.W], [.6, C.R1], [.8, C.W], [1, C.R1]], null, y - 45);
    for (const dx of [-48, -18, 18, 48]) strip(cx + dx, y - 44, cx + dx * .55, y, 1, 1, C.S3);
  }

  KW.props = { greatsword, pie, sky, starsHD, flameHD, pieHD, crateHD, flyHD, poofHD, goblinHD, chuteHD };
})(window.KW);
