/* Knightwatch scene: the knight's house, still on the coarse grid. A quiet scene, and the scene for
   an unhealthy container (in bed), an overdue backup, a silent Pi, a stream on the television and
   the night (in bed). The knight's head in bed is drawn here, from coarse parts. The scene interface
   is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props;
  const { R, spr, tline, alpha, glow, fill } = D;

  /* ---- The knight's bare head on the coarse grid, for the bed ------------------------------- */
  function eyesFace(Pf, X, Y, o, e1, e2, ey) {
    const lk = o.look || 0;
    for (const [e, side] of [[e1, -1], [e2, 1]]) {
      const x = X + e, y = Y + ey;
      switch (o.eyes) {
        case 'closed': Pf(x - 1, y + 2, 4, 1, 'E'); break;
        case 'happy': Pf(x - 1, y + 1, 1, 1, 'E'); Pf(x, y, 2, 1, 'E'); Pf(x + 2, y + 1, 1, 1, 'E'); break;
        case 'wide': Pf(x - 1, y - 1, 4, 5, 'W'); Pf(x + lk, y + 1, 2, 2, 'E'); break;
        case 'half': Pf(x - 1, y, 4, 1, 'f'); Pf(x + lk, y + 1, 2, 2, 'E'); break;
        case 'dizzy': Pf(x - 1, y, 1, 1, 'E'); Pf(x + 2, y, 1, 1, 'E'); Pf(x, y + 1, 2, 1, 'E'); Pf(x - 1, y + 2, 1, 1, 'E'); Pf(x + 2, y + 2, 1, 1, 'E'); break;
        case 'angry': Pf(x + lk, y, 2, 3, 'E');
          if (side < 0) { Pf(x - 1, y - 2, 2, 1, 'E'); Pf(x + 1, y - 1, 2, 1, 'E'); } else { Pf(x + 1, y - 2, 2, 1, 'E'); Pf(x - 1, y - 1, 2, 1, 'E'); } break;
        default: Pf(x + lk, y, 2, 3, 'E'); Pf(x + lk, y, 1, 1, 'W');
      }
    }
  }
  function mouthFace(Pf, X, Y, o, mx, my) {
    const x = X + mx, y = Y + my;
    let m = o.mouth; if (m === 'chew' || m === 'talk') m = (Math.floor(o.t / (m === 'chew' ? 160 : 230)) % 2) ? 'open' : 'flat';
    switch (m) {
      case 'smile': Pf(x, y, 4, 1, 'E'); Pf(x - 1, y - 1, 1, 1, 'E'); Pf(x + 4, y - 1, 1, 1, 'E'); break;
      case 'frown': Pf(x, y - 1, 4, 1, 'E'); Pf(x - 1, y, 1, 1, 'E'); Pf(x + 4, y, 1, 1, 'E'); break;
      case 'open': Pf(x, y - 1, 4, 3, 'E'); Pf(x + 1, y, 2, 2, 'R'); break;
      case 'pant': Pf(x, y - 1, 4, 2, 'E'); Pf(x + 1, y, 3, 3, 'R'); break;
      case 'o': Pf(x + 1, y - 1, 2, 2, 'E'); break;
      default: Pf(x, y, 4, 1, 'E');
    }
    if (o.thermo) { Pf(x + 3, y - 1, 8, 1, 'W'); Pf(x + 11, y - 1, 2, 1, 'R'); }
  }
  function headBare(Pf, X, Y, o) {
    const face = o.face || 'F', hair = 'N';
    Pf(X + 14, Y + 8, 20, 20, 'K'); Pf(X + 15, Y + 9, 18, 18, face); Pf(X + 15, Y + 25, 18, 2, 'f');
    Pf(X + 12, Y + 16, 3, 5, 'K'); Pf(X + 13, Y + 17, 2, 3, face); Pf(X + 33, Y + 16, 3, 5, 'K'); Pf(X + 33, Y + 17, 2, 3, face);
    Pf(X + 14, Y + 6, 20, 2, 'K'); Pf(X + 14, Y + 7, 20, 5, hair); Pf(X + 14, Y + 12, 3, 4, hair); Pf(X + 31, Y + 12, 3, 4, hair); Pf(X + 18, Y + 12, 6, 1, hair);
    Pf(X + 20, Y + 4, 5, 3, 'K'); Pf(X + 21, Y + 5, 3, 3, hair);
    if (o.puff) { Pf(X + 15, Y + 20, 2, 3, 'P'); Pf(X + 31, Y + 20, 2, 3, 'P'); }
    eyesFace(Pf, X, Y, o, 19, 27, 17); mouthFace(Pf, X, Y, o, 22, 22);
  }

  /* ---- Props of the house ------------------------------------------------------------------- */
  function fire(x, y, t, big) {
    const f = Math.floor(t / 150) % 2; glow(x + 5, y + 2, big ? 34 : 22, 'G', .11 + .03 * Math.sin(t / 130));
    spr(x, y, SP.FLAME[f]); spr(x + 5, y + 1, SP.FLAME[1 - f]); if (big) spr(x + 2, y - 3, SP.FLAME[f]);
  }
  function tv(x, y, t) {
    const sc = ['C', 'W', 'B', 'P', 'Y', 'L'][Math.floor(t / 400) % 6];
    tline(x + 7, y, x + 3, y - 6, 1, 's'); tline(x + 12, y, x + 16, y - 6, 1, 's');
    R(x, y, 20, 13, 'd'); R(x + 1, y + 1, 14, 11, 'K'); R(x + 2, y + 2, 12, 9, sc);
    R(x + 4 + Math.floor(t / 700) % 6, y + 5, 3, 4, 'K'); R(x + 16, y + 2, 2, 2, 'G'); R(x + 16, y + 6, 2, 2, 's');
    glow(x + 8, y + 6, 24, sc, .07);
  }
  function zzz(x, y, t) {
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 2600) + i / 3) % 1;
      alpha(ph > .8 ? (1 - ph) * 5 : 1); spr(x + ph * 22, y - ph * 28, ph < .33 ? SP.Z3 : ph < .66 ? SP.Z4 : SP.Z5); alpha(1);
    }
  }

  function draw(t, s) {
    const { L, RR, TP, RW, H, FL } = V;
    const X = 2, Y = FL - 84, r = (x, y, ww, h, c) => R(x + X, y + Y, ww, h, c);
    fill('#1d1510');
    for (let x = Math.floor(L / 47) * 47; x < RR; x += 47) { R(x + 3, 13 + Y, 44, FL - 13 - Y, '#271c15'); R(x, TP, 3, FL - TP, 'n'); }
    R(L, 9 + Y, RW, 4, 'n'); R(L, TP, RW, 9 + Y - TP, '#150f0b');
    for (let x = Math.floor(L / 24) * 24; x < RR; x += 24) tline(x, 9 + Y, x + 14, TP, 2, '#2a1c12');
    // the window, over the bed
    r(46, 18, 24, 22, 'n'); r(48, 20, 20, 18, '#0a1026'); r(51, 23, 1, 1, 'W'); r(63, 26, 1, 1, 'W'); r(60, 31, 3, 3, 'Y'); r(57, 20, 2, 18, 'n'); r(48, 28, 20, 2, 'n');
    // the greatsword on its pegs
    P.greatsword(122 + X, 30 + Y, Math.PI / 2); r(133, 33, 2, 4, 'n'); r(166, 33, 2, 4, 'n');
    // the floor and a rug
    R(L, FL, RW, H - FL, '#33251a'); R(L, FL, RW, 1, 'N'); for (let x = Math.floor(L / 22) * 22; x < RR; x += 22) R(x, FL + 1, 1, H - FL - 1, '#1d1510');
    R(94, FL + 4, 42, 6, 'r'); R(96, FL + 5, 38, 4, 'R'); R(98, FL + 6, 34, 2, 'G');
    // the hearth
    r(164, 44, 26, 40, 'T'); r(162, 42, 30, 3, 'd'); r(168, 58, 16, 26, 'K'); r(170, 80, 12, 3, 'n'); fire(172 + X, 74 + Y, t, false);
    // the table, with the pie
    r(128, 64, 32, 3, 'N'); r(130, 67, 3, 17, 'n'); r(155, 67, 3, 17, 'n');
    P.pie(129 + X, 59 + Y, t, s.piOK);
    const f = Math.floor(t / 180) % 2;
    if (s.tv) tv(141 + X, 51 + Y, t); else { r(152, 58, 2, 6, 'W'); r(152, 55 + f, 2, 3, 'Y'); glow(153 + X, 57 + Y, 9, 'Y', .12); }
    // the bed
    r(2, 42, 4, 42, 'n'); r(76, 56, 4, 28, 'n'); r(6, 70, 70, 5, 'N'); r(7, 75, 3, 9, 'n'); r(72, 75, 3, 9, 'n');
    r(6, 63, 70, 7, '#cfc6b4'); r(7, 55, 22, 9, 'W'); r(7, 62, 22, 2, 'S');
    if (s.inBed) {
      const o = s.o, b = Math.floor(t / 1900) % 2;
      headBare((x, y, ww, h, c) => R(-5 + x + X, 30 + y + Y, ww, h, c), o.headDx || 0, 0, o);
      if (o.icebag) { r(11, 31, 14, 6, 'K'); r(12, 32, 12, 4, 'C'); r(16, 29, 4, 3, 'W'); }
      r(24, 58 - b, 52, 13 + b, 'B'); r(24, 58 - b, 52, 2, 'C'); r(72, 60, 4, 11, 'b'); r(64, 56 - b, 9, 3, 'B');
    } else { r(30, 61, 46, 10, 'B'); r(30, 61, 46, 2, 'C'); r(72, 63, 4, 8, 'b'); }
    // the stool, where the helmet rests
    r(83, 74, 14, 2, 'N'); r(84, 76, 2, 8, 'n'); r(94, 76, 2, 8, 'n');
    if (s.helmOff) spr(84 + X, 63 + Y, SP.HELM);
  }

  /* At night the engine dims the screen, and the sleeper's Zs rise from the bed over it. */
  function over(t, s) { if (s.w.id === 'night') zzz(32, V.FL - 50, t); }

  KW.scenes.house = {
    grid: 'coarse', spot: 114, bed: true, helmet: false, sword: false,
    rounds: [{ x: 114, act: 'sniff', dur: 16 }, { x: 100, act: 'yawn', dur: 14 }, { x: 110, act: 'look', dur: 14 }],
    draw, over
  };
})(window.KW);
