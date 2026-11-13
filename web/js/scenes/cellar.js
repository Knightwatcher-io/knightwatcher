/* Knightwatch scene: the cellar full of crates, still on the coarse grid. The scene for a disk
   filling up. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props;
  const { R, spr, glow, hash, fill } = D;

  function draw(t, s) {
    const { L, RR, TP, RW, H, FL } = V;
    fill('#100d14');
    for (let x = Math.floor(L / 64) * 64 + 28; x < RR; x += 64) { R(x, TP, 7, FL - TP, 'T'); R(x, TP, 2, FL - TP, 't'); }
    for (const y of [FL - 54, FL - 30]) { R(L, y, RW, 2, 'n'); for (let x = Math.floor(L / 9) * 9; x < RR; x += 9) { const h = hash(x * 31 + y); if (h % 4) R(x + 2, y - 4 - (h % 5), 3 + (h >> 4) % 2, 4 + (h % 5), ['d', 'r', 'g', 'b', 'l'][(h >> 6) % 5]); } }
    R(96, FL - 70, 2, 8, 'N'); glow(97, FL - 73, 18, 'G', .1 + .03 * Math.sin(t / 150)); spr(94, FL - 76, SP.FLAME[Math.floor(t / 160) % 2]);
    R(L, FL, RW, H - FL, '#1c1820'); R(L, FL, RW, 1, 't'); for (let x = Math.floor(L / 26) * 26; x < RR; x += 26) R(x, FL + 1, 1, H - FL - 1, '#100d14');
    for (const [x, n] of [[-26, 6], [-12, 4], [2, 7], [16, 5], [30, 3], [44, 6], [58, 2], [164, 5], [178, 7], [192, 4], [206, 6]]) for (let k = 0; k < n; k++) spr(x + (k % 2), FL - 10 * (k + 1), SP.CRATE);
    R(88, FL - 14, 16, 14, 'n'); R(89, FL - 14, 14, 14, 'N'); R(88, FL - 11, 16, 1, 'd'); R(88, FL - 4, 16, 1, 'd'); P.pie(90, FL - 19, t, s.piOK);
  }

  KW.scenes.cellar = {
    grid: 'coarse', spot: 124, sword: false,
    rounds: [{ x: 124, act: 'guard', dur: 7 }, { x: 146, act: 'guard', dur: 7 }],
    draw
  };
})(window.KW);
