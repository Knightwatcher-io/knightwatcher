/* Knightwatch scene: the training yard at night, still on the coarse grid. A quiet scene, where the
   knight trains on the practice dummy, and the scene for a hot CPU, where he trains without rest.
   The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, K = KW.knight;
  const { R, tline, hash, fill } = D;

  const STARS = []; { let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 90; i++) STARS.push([Math.floor(rnd() * 330) - 70, Math.floor(rnd() * 130) - 50, rnd() * 5, rnd() > .6]); }
  function stars(t, maxY) { for (const s of STARS) if (s[1] < maxY && ((t / 900 + s[2]) % 5) > .5) R(s[0], s[1], 1, 1, s[3] ? 'W' : 's'); }

  /* When the knight's sword last struck the dummy, which wobbles and sheds straw for a moment. */
  let dummyHit = -1e9;

  /* The knight trains: a swing every few seconds at the training spot while all is quiet, and one
     every second while the CPU runs hot. */
  function act(t, s) {
    const o = s.o, here = s.here;
    if (here && here.act === 'train' && s.w.lv === 0) { const c = here.el % 5600; if (c < 900) { K.swing(o, c / 900, 1); if (c > 420 && t - dummyHit > 2000) dummyHit = t; } }
    if (s.w.id === 'cpu_hot') { const c = t % 1000; K.swing(o, c / 1000, 1); if (c > 470 && t - dummyHit > 600) dummyHit = t; o.eyes = 'half'; o.bob = Math.floor(t / 170) % 2; }
  }

  function draw(t, s) {
    const { L, RR, RW, H, FL } = V;
    fill('#05060c'); stars(t, 46);
    R(L, FL - 60, RW, 60, '#15131d'); R(L, FL - 60, RW, 1, 't');
    for (let x = Math.floor(L / 20) * 20; x < RR; x += 20) R(x, FL - 68, 10, 8, '#15131d');
    for (let y = FL - 50; y < FL; y += 10) R(L, y, RW, 1, '#1c1926');
    for (const x of [22, 168]) { R(x, FL - 46, 2, 12, 'K'); R(x - 2, FL - 41, 6, 2, 'K'); }
    R(78, FL - 38, 28, 38, 'K'); R(80, FL - 36, 24, 36, 'n'); for (let x = 86; x < 104; x += 6) R(x, FL - 36, 1, 36, '#3a2612'); R(80, FL - 24, 24, 2, 'd'); R(99, FL - 18, 2, 3, 'G');
    R(L, FL, RW, H - FL, '#2a2318'); R(L, FL, RW, 1, '#4a3d28');
    for (let x = Math.floor(L / 17) * 17; x < RR; x += 17) R(x + (hash(x + 3) % 9), FL + 3 + (hash(x) % 8), 2, 1, '#3a3020');
    // the rack of spare arms
    R(10, FL - 30, 2, 30, 'n'); R(36, FL - 30, 2, 30, 'n'); R(10, FL - 26, 28, 2, 'N'); R(10, FL - 10, 28, 2, 'N');
    tline(17, FL - 1, 19, FL - 44, 1, 's'); R(18, FL - 48, 3, 5, 'S'); tline(24, FL - 1, 24, FL - 40, 1, 'N'); R(21, FL - 44, 7, 5, 'd'); tline(31, FL - 1, 30, FL - 38, 1, 's'); R(29, FL - 42, 3, 5, 'S');
    // the barrel with the pie
    R(48, FL - 14, 16, 14, 'n'); R(49, FL - 14, 14, 14, 'N'); R(48, FL - 11, 16, 1, 'd'); R(48, FL - 4, 16, 1, 'd'); R(60, FL - 14, 3, 14, 'n'); P.pie(50, FL - 19, t, s.piOK);
    // hay, and the practice dummy
    R(166, FL - 12, 24, 12, 'g'); R(166, FL - 12, 24, 1, 'G'); R(174, FL - 12, 1, 12, 'n'); R(182, FL - 12, 1, 12, 'n');
    const a = t - dummyHit, wob = a < 900 ? Math.round(Math.sin(a / 60) * 3 * (1 - a / 900)) : 0;
    R(141, FL - 20, 3, 20, 'n'); R(130 + wob, FL - 36, 25, 3, 'n'); R(135 + wob, FL - 34, 15, 18, 'g'); R(136 + wob, FL - 34, 9, 18, 'G');
    R(137 + wob, FL - 46, 11, 11, '#d8c27a'); R(139 + wob, FL - 42, 2, 2, 'E'); R(144 + wob, FL - 42, 2, 2, 'E'); R(140 + wob, FL - 38, 5, 1, 'E');
    R(126 + wob, FL - 39, 8, 10, 'r'); R(127 + wob, FL - 38, 6, 8, 'R'); R(129 + wob, FL - 35, 2, 2, 'W');
    if (a < 500) for (let i = 0; i < 5; i++) R(134 + i * 4 + a / 40 * (i - 2), FL - 30 - i * 3 + a * a / 9000, 2, 1, 'G');
  }

  KW.scenes.yard = {
    grid: 'coarse', spot: 104, outdoors: true,
    rounds: [{ x: 104, act: 'train', dur: 21 }, { x: 80, act: 'look', dur: 14 }],
    act, draw
  };
})(window.KW);
