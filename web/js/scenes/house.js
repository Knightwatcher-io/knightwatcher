/* Knightwatcher scene: the knight's house at night, on the fine grid. A quiet scene, and the scene for
   an unhealthy container (in bed), an overdue backup, a silent Pi, a stream on the television and
   the night (in bed). The knight's head in bed is drawn here, from the knight's own bare head, and
   the helmet on the stool and the weapon on the pegs are the knight's own gear at rest. The scene
   interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, K = KW.knight, C = D.C;
  const { alpha, glow, Rh, Rv, ell, rrect, poly, strip, hsh, STEEL3 } = D;

  const PLANK = ['#2a1d14', '#2d1f15', '#261a11', '#301f14'];
  const BEAM = [[.2, '#5a3a1e'], [.6, '#47301a'], [1, '#2e1d0f']];
  const STONE = ['#2b2333', '#2f2738', '#272030', '#332a3d'];
  const BLANKET = [[.12, C.B0], [.5, C.B1], [.85, C.B2], [1, C.B3]];

  /* The places for the knight's gear at rest (docs/page.md): the stool, a surface where the
     helmet rests, x and y the middle of its top and w by h the room above it; and the pegs on the
     wall, where the weapon hangs, x and y the middle of its grip and a its angle, which lays it
     flat. The pegs are spaced for the greatsword. */
  const RESTS = {
    stool: { kind: 'surface', x: 460, y: V.HFL - 54, w: 76, h: 80 },
    pegs: { x: 618, y: 228, a: Math.PI / 2 }
  };

  /* The window over the bed, with the night sky in it. */
  function windowHD() {
    rrect(232, 192, 136, 126, 6, C.K); rrect(236, 196, 128, 118, 4, [[.15, C.N1], [.6, C.N2], [1, C.N3]]);
    Rv(248, 208, 104, 94, [[.4, '#070b1c'], [.75, '#0a1026'], [1, '#111a3a']]);
    for (let i = 0; i < 9; i++) Rh(250 + hsh(i, 81) % 98, 210 + hsh(i, 82) % 86, 2, 2, i % 3 ? '#9aa6c6' : C.W);
    ell(326, 236, 11, 11, [[.4, '#fffbe0'], [1, '#fff3a0']]); ell(331, 232, 10, 10, '#0a1026');
    Rh(294, 208, 12, 94, C.K); Rh(296, 208, 8, 94, C.N2); Rh(248, 249, 104, 12, C.K); Rh(248, 251, 104, 8, C.N2);
    Rh(296, 208, 2, 94, C.N1); Rh(248, 251, 104, 2, C.N1);
    rrect(224, 314, 152, 14, 3, C.K); Rv(227, 316, 146, 9, [[.3, C.N0], [1, C.N2]]);
  }

  /* The hearth of stone at the right, with its chimney, mantel and logs. Its fire is drawn each frame. */
  function hearth() {
    const { HT } = V;
    P.bricksHD(830, 334, 132, 196, 33, 18, STONE, '#19141f', 9);
    Rh(830, 334, 3, 196, C.K); Rh(959, 334, 3, 196, C.K);
    rrect(852, 396, 86, 150, 34, C.K, null, 530); rrect(857, 401, 76, 150, 30, [[.5, '#0e0a08'], [1, '#070505']], null, 530);
    P.bricksHD(866, 440, 58, 70, 29, 14, ['#1d1714', '#211a16'], '#0b0807', 2);
    for (const [x0, x1, y] of [[864, 926, 520], [870, 922, 508]]) { strip(x0, y, x1, y, 7, 7, C.K); strip(x0 + 2, y, x1 - 2, y, 5, 5, [[.3, C.N1], [1, C.N3]]); ell(x1 - 2, y, 4, 5, C.N0); }
    Rh(860, 526, 72, 4, '#3a1d16');
    rrect(816, 318, 158, 20, 4, C.K); Rv(819, 321, 152, 14, [[.25, C.N0], [.6, C.N1], [1, C.N2]]);
    // a jug and a cup on the mantel
    rrect(862, 284, 22, 34, 8, C.K); rrect(865, 287, 16, 30, 6, [[.3, '#9a7e5e'], [1, '#5e4630']]); strip(883, 294, 890, 306, 3, 3, C.K);
    rrect(918, 302, 18, 16, 4, C.K); rrect(921, 304, 12, 12, 3, STEEL3);
  }

  /* The bed at the left: posts, frame, mattress and pillow. The blanket is drawn each frame. */
  function bed() {
    for (const [x, top] of [[20, 322], [388, 398]]) {
      rrect(x, top, 22, 530 - top, 4, C.K); rrect(x + 3, top + 3, 16, 527 - top, 3, [[.3, C.N0], [.65, C.N1], [1, C.N2]]);
      ell(x + 11, top - 6, 13, 12, C.K); ell(x + 11, top - 6, 10, 9, [[.3, C.N0], [1, C.N2]]);
    }
    rrect(36, 458, 356, 30, 5, C.K); Rv(38, 461, 352, 24, [[.2, C.N0], [.6, C.N1], [1, C.N2]]);
    for (const x of [48, 372]) { Rh(x - 2, 486, 16, 44, C.K); Rh(x, 486, 12, 44, C.N2); }
    rrect(36, 424, 354, 38, 8, C.K); Rv(39, 427, 348, 33, [[.2, '#e4dccb'], [.7, '#cfc6b4'], [1, '#a89e8a']]);
    rrect(38, 384, 136, 50, 18, C.K); rrect(41, 387, 130, 44, 15, [[.2, C.W], [.7, '#e8edf3'], [1, '#c3cbd6']]);
    Rh(60, 422, 90, 2, '#c3cbd6');
  }

  function paint(s) {
    const { HL, HR, HT, HH, HFL } = V;
    // the roof's underside and its rafters
    Rh(HL, HT, HR - HL, 180 - HT, '#120c08');
    for (let x = Math.floor(HL / 120) * 120 - 120; x < HR + 120; x += 120) { strip(x, 166, x + 90, HT - 20, 7, 7, '#0b0705'); strip(x, 166, x + 90, HT - 20, 5, 5, '#24180f'); }
    // the plank wall, with posts
    Rh(HL, 176, HR - HL, HFL - 176, '#140d08');
    for (let x = Math.floor(HL / 36) * 36; x < HR; x += 36) {
      Rh(x + 2, 176, 33, HFL - 176, PLANK[hsh(x, 3) % 4]); Rh(x + 2, 176, 1, HFL - 176, 'rgba(255,255,255,.04)');
      for (let k = 0; k < 3; k++) Rh(x + 6 + hsh(x, k) % 24, 186 + hsh(x, k + 9) % 280, 1, 24 + hsh(x, k + 5) % 50, 'rgba(0,0,0,.28)');
      if (hsh(x, 31) % 5 === 0) { const ky = 230 + hsh(x, 32) % 220; ell(x + 18, ky, 4, 3, '#1a110b'); ell(x + 18, ky, 2, 1, '#3a2716'); }
    }
    for (let x = Math.floor((HL - 10) / 236) * 236 + 10; x < HR; x += 236) { rrect(x - 3, 176, 24, HFL - 176, 2, C.K); rrect(x, 176, 18, HFL - 176, 2, [[.25, '#5a3a1e'], [.6, '#47301a'], [1, '#2e1d0f']]); }
    rrect(HL - 4, 152, HR - HL + 8, 28, 2, C.K); Rv(HL, 155, HR - HL, 22, BEAM);
    // moonlight through the window, the window, the weapon on its pegs
    glow(300, 260, 110, '#6f9eff', .05); windowHD();
    for (const x of [680, 836]) { rrect(x - 7, 242, 14, 24, 3, C.K); rrect(x - 5, 244, 10, 20, 2, [[.3, C.N0], [1, C.N2]]); }
    K.rest.draw('main', RESTS.pegs.x, RESTS.pegs.y, RESTS.pegs.a);
    hearth();
    // the floor of boards and the rug
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#2b1f15'); Rh(HL, HFL, HR - HL, 3, '#5a3f26');
    for (let j = 0; j < 4; j++) {
      const y = HFL + 3 + j * 20; Rh(HL, y + 18, HR - HL, 2, '#1a120c');
      for (let x = Math.floor(HL / 130) * 130 + (j % 2) * 65; x < HR; x += 130) { Rh(x, y, 2, 18, '#1a120c'); Rh(x + 2, y, 1, 18, '#3d2c1e'); }
    }
    rrect(466, 546, 218, 38, 6, C.K); rrect(469, 549, 212, 32, 4, C.R3); rrect(475, 554, 200, 22, 3, [[.3, C.R1], [1, C.R2]]);
    Rh(481, 559, 188, 2, C.G1); Rh(481, 569, 188, 2, C.G1); for (let i = 0; i < 9; i++) { ell(496 + i * 20, 565, 4, 3, C.G2); }
    for (let i = 0; i < 18; i++) { Rh(470 + i * 12, 584, 2, 5, '#c7b088'); }
    bed();
    // the stool, where the helmet rests
    rrect(422, 476, 76, 12, 3, C.K); Rv(425, 478, 70, 7, [[.3, C.N0], [1, C.N2]]);
    for (const x of [430, 482]) { Rh(x - 2, 488, 12, 42, C.K); Rh(x, 488, 8, 42, C.N2); }
    // the table and what stands on it: the television, or a candle
    P.tableHD(650, 430, 160, 100);
    if (s.tv) {
      strip(762, 364, 740, 318, 2, 2, C.K); strip(778, 364, 800, 318, 2, 2, C.K); strip(762, 364, 741, 320, 1, 1, C.S2); strip(778, 364, 799, 320, 1, 1, C.S2);
      ell(740, 318, 4, 4, C.K); ell(800, 318, 4, 4, C.K); ell(740, 318, 2, 2, C.S1); ell(800, 318, 2, 2, C.S1);
      rrect(724, 360, 94, 72, 8, C.K); rrect(727, 363, 88, 66, 6, [[.15, C.N0], [.6, C.N1], [1, C.N2]]);
      rrect(732, 368, 64, 56, 12, C.K);
      rrect(800, 372, 11, 11, 5, C.K); ell(805, 377, 3, 3, C.G1); rrect(800, 390, 11, 11, 5, C.K); ell(805, 395, 3, 3, C.S2);
      for (let i = 0; i < 4; i++) Rh(800, 408 + i * 4, 11, 2, C.N3);
    } else {
      ell(771, 428, 16, 5, C.K); ell(771, 427, 13, 3, STEEL3); strip(785, 425, 794, 418, 2, 2, C.K);
      rrect(764, 392, 14, 36, 3, C.K); rrect(766, 394, 10, 33, 2, [[.3, '#fffbe8'], [1, '#d8cfae']]); Rh(770, 388, 2, 6, C.K);
    }
  }

  /* The television's picture: a colour that changes, a figure crossing it, scan lines. */
  function tvScreen(t) {
    const sc = ['#7fe9ff', '#e8f0ff', '#6f9eff', '#ff8fb0', '#fff3a0', '#8fe07a'][Math.floor(t / 400) % 6];
    glow(764, 396, 130, sc, .07);
    rrect(735, 371, 58, 50, 10, sc); rrect(735, 403, 58, 18, 6, 'rgba(0,0,0,.25)', 403);
    ell(780, 381, 5, 5, 'rgba(255,255,255,.6)');
    const fx = 744 + (Math.floor(t / 700) % 6) * 6; rrect(fx, 392, 10, 15, 4, C.K); ell(fx + 5, 385, 4, 4, C.K); Rh(fx + 1, 407, 3, 5, C.K); Rh(fx + 6, 407, 3, 5, C.K);
    for (let y = 373; y < 420; y += 4) Rh(737, y, 54, 1, 'rgba(0,0,0,.14)');
    Rh(741, 375, 12, 3, 'rgba(255,255,255,.45)');
  }

  function draw(t, s) {
    // the hearth's fire
    glow(895, 480, 190, '#ffb000', .09 + .025 * Math.sin(t / 130));
    P.flameHD(880, 512, .62, t); P.flameHD(908, 514, .52, t + 500); P.flameHD(893, 516, .78, t + 900);
    if (s.tv) tvScreen(t);
    else {
      glow(771, 384, 52, '#ffe28a', .11 + .02 * Math.sin(t / 170));
      const sw = Math.round(Math.sin(t / 190) * 1.5); ell(771, 382, 4, 6, '#ffb000'); poly([[767, 382], [771 + sw, 368], [775, 382]], '#ffb000'); ell(771, 383, 2, 3, '#fff3a0');
    }
    KW.things.draw(t, s);
    // the blanket, and the sleeper's head on the pillow
    if (s.inBed) {
      const o = s.o, b = Math.floor(t / 1900) % 2 * 3;
      K.head(-15 + (o.headDx || 0) * 5, 262, o);
      if (o.icebag) {
        rrect(68, 270, 70, 30, 12, C.K); rrect(71, 273, 64, 24, 10, [[.2, '#d4f6ff'], [.6, '#9fdcf0'], [1, '#6fb6d4']]);
        rrect(94, 258, 18, 16, 4, C.K); rrect(97, 261, 12, 11, 3, C.W); Rh(78, 277, 10, 3, C.W);
      }
      poly([[126, 468], [126, 408], [170, 394 - b], [290, 392 - b], [372, 405], [389, 418], [389, 468]], C.K);
      poly([[129, 465], [129, 410], [171, 397 - b], [289, 395 - b], [370, 408], [386, 420], [386, 465]], BLANKET);
      poly([[129, 465], [129, 410], [160, 400 - b], [160, 465]], [[.3, C.W], [1, C.S1]]); Rh(160, 401 - b, 2, 64 + b, C.S2);
      for (const x of [215, 300]) strip(x, 405 - b, x + 14, 460, 1, 1, 'rgba(20,30,70,.35)');
    } else {
      rrect(158, 410, 231, 56, 10, C.K); rrect(161, 413, 225, 50, 8, BLANKET);
      rrect(161, 413, 30, 50, 6, [[.3, C.W], [1, C.S1]]); Rh(191, 415, 2, 46, C.S2);
    }
    if (s.helmOff) K.rest.draw('helmet', RESTS.stool.x, RESTS.stool.y);
  }

  /* At night the engine dims the screen, and the sleeper's Zs rise from the bed over it. */
  function over(t, s) {
    if (s.w.id !== 'night') return;
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 2600) + i / 3) % 1;
      alpha(ph > .8 ? (1 - ph) * 5 : 1); SP.zed(150 + ph * 110, 270 - ph * 140, Math.round(16 + ph * 16)); alpha(1);
    }
  }

  /* The places for watched things (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 688, y: 435, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 406, y: 300, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 926, y: 300, w: 88, h: 112 },
    h3: { cls: 'high', kind: 'surface', x: 70, y: 300, w: 88, h: 112, flip: true },
    g1: { cls: 'ground', kind: 'floor', x: 120, y: 594, w: 88, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 300, y: 594, w: 88, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 748, y: 530, w: 88, h: 112 }
  };

  KW.scenes.house = {
    spot: 114, places: PLACES, rests: RESTS, bed: true, helmet: false, sword: false,
    rounds: [{ x: 114, act: 'sniff', dur: 16 }, { x: 100, act: 'yawn', dur: 14 }, { x: 110, act: 'look', dur: 14 }],
    key: s => (s.tv ? 'tv' : '') + '|' + K.rest.key('main'), paint, draw, over
  };
})(window.KW);
