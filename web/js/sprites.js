/* Knightwatch: the small symbols drawn over a scene or over the knight, on the fine grid: the marks
   over his head, the heart, the Z of a sleeper, the drumstick and the spark of a hammer blow. */
(function (KW) {
  'use strict';
  const D = KW.draw, C = D.C;
  const { Rh, ell, poly, strip, pix } = D;

  /* A thick line through the points, with round joints. */
  function stroke(pts, hw, c) {
    for (let i = 1; i < pts.length; i++) strip(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], hw, hw, c);
    for (const p of pts) ell(p[0], p[1], hw, hw, c);
  }

  /* An exclamation mark (red) or a question mark (yellow), centred on x with its top at y and 60
     pixels tall. */
  function mark(x, y, ch) {
    const k = 1.28, P = (dx, dy) => [x + dx * k, y + dy * k];
    if (ch === '!') {
      poly([P(-11, 0), P(11, 0), P(7, 32), P(-7, 32)], C.K);
      poly([P(-8, 3), P(8, 3), P(4, 29), P(-4, 29)], [[.3, C.R0], [.72, C.R1], [1, C.R2]]);
      ell(x, y + 40 * k, 8 * k, 7 * k, C.K); ell(x, y + 40 * k, 5 * k, 4 * k, [[.4, C.R0], [1, C.R1]]);
      return;
    }
    const arc = [];
    for (let a = -1.75; a <= 2.31; a += .26) arc.push(P(Math.sin(a) * 10, 13 - Math.cos(a) * 9));
    const line = arc.concat([P(2, 25), P(0, 30)]);
    stroke(line, 7.5 * k, C.K); ell(x, y + 40 * k, 8 * k, 7 * k, C.K);
    stroke(line, 4.5 * k, C.G1); ell(x, y + 40 * k, 5 * k, 4 * k, C.G1);
    stroke(arc.slice(1, 7), 1.5 * k, C.G0); Rh(x - 3 * k, y + 37 * k, 3, 3, C.G0);
  }

  /* A heart about 34 pixels across, centred at (x, y), painted once per pixel so that it can fade. */
  const inHeart = (u, v) => { const q = u * u + v * v - 1; return q * q * q - u * u * v * v * v <= 0; };
  function heart(x, y) {
    const k = 14, n = 19;
    pix(x - n, y - n, 2 * n + 1, 2 * n + 1, (i, j) => {
      const u = (i - n) / k, v = (n - j) / k + .12;
      if (!inHeart(u, v)) return null;
      if (!inHeart(u * k / (k - 3), v * k / (k - 3))) return C.K;
      if ((u + .45) * (u + .45) + (v - .62) * (v - .62) < .05) return '#ffe0ea';
      return v < -.35 || u > .62 ? '#e0577c' : '#ff8fb0';
    });
  }

  /* A Z, s pixels square, top left at (x, y), painted once per pixel so that it can fade. */
  function zed(x, y, s) {
    const th = Math.max(3, Math.round(s * .22)), e = 2;
    const core = (i, j, g) => i >= -g && i <= s - 1 + g && j >= -g && j <= s - 1 + g && (j < th + g || j > s - 1 - th - g || Math.abs(i + j - (s - 1)) <= th * .75 + g * 1.4);
    pix(x - e, y - e, s + 2 * e, s + 2 * e, (i, j) => core(i - e, j - e, 0) ? (j - e < th ? C.W : C.S1) : core(i - e, j - e, e) ? C.K : null);
  }

  /* A drumstick filling a 40 pixel box with its top left at (x, y). */
  function drum(x, y) {
    stroke([[x + 18, y + 18], [x + 31, y + 31]], 6, C.K); ell(x + 30, y + 36, 6, 6, C.K); ell(x + 36, y + 30, 6, 6, C.K);
    ell(x + 15, y + 15, 15, 14, C.K); strip(x + 15, y + 15, x + 26, y + 26, 11, 6, C.K);
    stroke([[x + 18, y + 18], [x + 31, y + 31]], 3, C.S0); ell(x + 30, y + 36, 3, 3, C.S0); ell(x + 36, y + 30, 3, 3, C.S0);
    strip(x + 15, y + 15, x + 24, y + 24, 8, 4, C.N2); ell(x + 15, y + 15, 12, 11, [[.3, C.N0], [.7, C.N1], [1, C.N2]]);
    ell(x + 10, y + 9, 5, 3, '#d9a077'); Rh(x + 8, y + 8, 3, 2, C.F0);
  }

  /* A spark: a small four-pointed star of size s centred at (x, y). */
  function spark(x, y, s, c) {
    Rh(x - s, y - 1, 2 * s + 1, 3, c); Rh(x - 1, y - s, 3, 2 * s + 1, c); Rh(x - 2, y - 2, 5, 5, c); Rh(x - 1, y - 1, 3, 3, C.W);
  }

  KW.sprites = { mark, heart, zed, drum, spark, stroke };
})(window.KW);
