/* Knightwatch scene: the king's court, still on the coarse grid. The scene for an open SSH session,
   where the knight and the King take turns to talk. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props;
  const { R, spr, glow, fill } = D;

  function speech(x, y, t) { spr(x, y, SP.SPEECH); const n = Math.floor(t / 320) % 4; for (let i = 0; i < n; i++) R(x + 3 + i * 3, y + 2, 2, 2, 'K'); }
  function king(cx, by, t, talking) {
    R(cx - 10, by - 28, 20, 26, 'R'); R(cx + 6, by - 28, 4, 26, 'r'); R(cx - 10, by - 28, 20, 3, 'W'); R(cx - 2, by - 28, 4, 26, 'W'); R(cx - 11, by - 4, 22, 2, 'W');
    for (let k = 0; k < 4; k++) R(cx - 1 + (k % 2), by - 22 + k * 5, 1, 1, 'K');
    R(cx - 8, by - 2, 6, 2, 'n'); R(cx + 2, by - 2, 6, 2, 'n');
    R(cx - 14, by - 26, 4, 12, 'R'); R(cx + 10, by - 26, 4, 12, 'r'); R(cx - 14, by - 15, 4, 3, 'F'); R(cx + 10, by - 15, 4, 3, 'F');
    R(cx + 13, by - 38, 2, 36, 'G'); R(cx + 12, by - 42, 4, 4, 'R'); R(cx + 13, by - 41, 1, 1, 'W');
    R(cx - 8, by - 45, 16, 17, 'K'); R(cx - 7, by - 44, 14, 15, 'F'); R(cx - 7, by - 36, 14, 8, 'S'); R(cx - 5, by - 28, 10, 2, 'S');
    R(cx - 4, by - 41, 2, 2, 'E'); R(cx + 2, by - 41, 2, 2, 'E'); R(cx - 5, by - 43, 4, 1, 's'); R(cx + 1, by - 43, 4, 1, 's');
    if (talking && Math.floor(t / 230) % 2) R(cx - 1, by - 35, 3, 3, 'E'); else R(cx - 2, by - 34, 4, 1, 'E');
    R(cx - 8, by - 50, 16, 5, 'G'); R(cx - 8, by - 53, 3, 3, 'G'); R(cx - 2, by - 54, 4, 4, 'G'); R(cx + 5, by - 53, 3, 3, 'G');
    R(cx - 1, by - 49, 2, 2, 'R'); R(cx - 6, by - 48, 1, 1, 'C'); R(cx + 5, by - 48, 1, 1, 'C');
  }

  /* Draws the court, and makes the knight talk while the King listens. */
  function draw(t, s) {
    const { L, RR, TP, RW, H, FL } = V;
    fill('#14111b');
    for (let y = FL - 96; y < FL; y += 12) R(L, y, RW, 1, '#1c1826');
    const f = Math.floor(t / 170) % 2;
    for (const x of [-52, 10, 106, 200]) {
      R(x, TP, 10, FL - TP, 'T'); R(x, TP, 2, FL - TP, 't'); R(x - 2, FL - 4, 14, 4, 't');
      R(x + 4, FL - 50, 2, 7, 'N'); glow(x + 5, FL - 53, 13, 'G', .1); spr(x + 2, FL - 56, SP.FLAME[f]);
    }
    for (const x of [38, 72]) {
      const y = FL - 80; R(x - 2, y - 2, 22, 2, 'G'); R(x, y, 18, 30, 'r'); R(x + 1, y, 16, 29, 'R'); R(x + 1, y + 29, 5, 5, 'R'); R(x + 12, y + 29, 5, 5, 'R');
      R(x + 5, y + 9, 8, 1, 'G'); R(x + 4, y + 10, 1, 3, 'G'); R(x + 13, y + 10, 1, 3, 'G'); R(x + 5, y + 13, 8, 1, 'G'); R(x + 8, y + 10, 2, 3, 'W');
    }
    R(L, FL, RW, H - FL, 'T'); for (let j = 0; j < 2; j++) for (let x = Math.floor(L / 16) * 16; x < RR; x += 8) if ((((x / 8) + j) % 2 + 2) % 2) R(x, FL + 1 + j * 7, 8, 7, 't');
    R(L, FL + 4, 142 - L, 6, 'r'); R(L, FL + 5, 142 - L, 4, 'R'); R(L, FL + 4, 142 - L, 1, 'G'); R(L, FL + 9, 142 - L, 1, 'G');
    const by = FL - 5; R(130, by, RR - 130, 5, 'd'); R(130, by, RR - 130, 1, 's'); R(130, by + 1, 30, 2, 'R');
    R(148, by - 58, 32, 58, 'g'); R(150, by - 56, 28, 56, 'r'); R(146, by - 62, 5, 7, 'G'); R(177, by - 62, 5, 7, 'G'); R(158, by - 64, 12, 7, 'G'); R(162, by - 62, 4, 3, 'R');
    R(146, by - 22, 6, 22, 'g'); R(176, by - 22, 6, 22, 'g');
    const kingTalks = Math.floor(t / 3200) % 2 === 1;
    king(164, by, t, kingTalks); if (kingTalks) speech(138, by - 66, t);
    R(24, FL - 12, 18, 2, 'N'); R(26, FL - 10, 2, 10, 'n'); R(38, FL - 10, 2, 10, 'n'); P.pie(27, FL - 17, t, s.piOK);
    s.o.mouth = kingTalks ? 'flat' : 'talk'; s.o.speak = !kingTalks;
  }

  KW.scenes.court = { grid: 'coarse', spot: 72, draw };
})(window.KW);
