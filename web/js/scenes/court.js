/* Knightwatcher scene: the king's court, on the fine grid. The scene for an open SSH session, where
   the knight and the King take turns to talk. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, K = KW.knight, C = D.C;
  const { glow, Rh, Rv, ell, rrect, poly, strip, hsh, GOLD } = D;

  const WALL = ['#1a1622', '#1d1826', '#17131e', '#201a29'];
  const PIER = [[.15, '#4a3f57'], [.45, '#3b3247'], [.85, '#2b2333'], [1, '#1f1927']];
  const ROBE = [[.12, C.R0], [.5, C.R1], [.85, C.R2], [1, C.R3]];
  const FUR = [[.3, C.W], [.8, C.S1], [1, C.S2]];
  const SKIN = [[.14, C.F0], [.72, C.F1], [1, C.F2]];
  const BEARD = [[.25, C.S0], [.7, C.S1], [1, C.S2]];
  const KX = 820, KB = 505;

  /* Ermine: white fur with black tails, over a rectangle. */
  function ermine(x, y, w, h) { for (let j = 0; j < h; j += 14) for (let i = 4 + (j / 14 % 2) * 9; i < w - 4; i += 18) { Rh(x + i, y + j + 3, 3, 6, C.K); Rh(x + i - 2, y + j + 3, 7, 2, C.K); } }

  /* The King on his throne, seated, x the middle and by the seat of the dais under his feet. The
     mouth is drawn apart, in mouth(), since it moves while he talks. */
  function king(x, by) {
    // shoes and robe
    for (const d of [-26, 26]) { ell(x + d, by - 6, 20, 10, C.K); ell(x + d, by - 7, 17, 7, [[.3, C.N1], [1, C.N3]]); }
    poly([[x - 58, by - 160], [x + 58, by - 160], [x + 80, by - 8], [x - 80, by - 8]], C.K);
    poly([[x - 55, by - 157], [x + 55, by - 157], [x + 76, by - 11], [x - 76, by - 11]], ROBE);
    rrect(x - 79, by - 30, 158, 22, 6, C.K); rrect(x - 76, by - 28, 152, 17, 5, FUR); ermine(x - 76, by - 28, 152, 14);
    rrect(x - 15, by - 150, 30, 140, 6, C.K); rrect(x - 12, by - 148, 24, 136, 4, FUR); for (let y = by - 135; y < by - 30; y += 22) { Rh(x - 2, y, 4, 7, C.K); Rh(x - 4, y + 2, 8, 2, C.K); }
    // sleeves and hands on the armrests, the sceptre in his left hand
    for (const d of [-1, 1]) {
      poly([[x + d * 52, by - 152], [x + d * 78, by - 128], [x + d * 76, by - 82], [x + d * 50, by - 86]], C.K);
      poly([[x + d * 53, by - 148], [x + d * 75, by - 127], [x + d * 73, by - 85], [x + d * 53, by - 89]], d < 0 ? ROBE : [[.3, C.R1], [1, C.R3]]);
      rrect(x + d * 64 - 15, by - 92, 30, 12, 4, C.K); rrect(x + d * 64 - 13, by - 90, 26, 8, 3, FUR);
    }
    strip(x + 66, by - 210, x + 66, by - 20, 6, 6, C.K); strip(x + 66, by - 210, x + 66, by - 20, 3.5, 3.5, GOLD);
    ell(x + 66, by - 214, 13, 13, C.K); ell(x + 66, by - 214, 10, 10, [[.3, C.R0], [.7, C.R1], [1, C.R2]]); Rh(x + 61, by - 220, 3, 3, C.W);
    for (const d of [-1, 1]) { ell(x + d * 64, by - 72, 13, 11, C.K); ell(x + d * 64, by - 72, 10, 8, SKIN); }
    // the ermine collar
    rrect(x - 62, by - 168, 124, 30, 14, C.K); rrect(x - 59, by - 165, 118, 24, 12, FUR); ermine(x - 56, by - 164, 112, 20);
    // head: hair, face, beard
    for (const d of [-1, 1]) { ell(x + d * 33, by - 214, 10, 22, C.K); ell(x + d * 33, by - 214, 7, 19, BEARD); }
    rrect(x - 37, by - 246, 74, 78, 26, C.K); rrect(x - 34, by - 243, 68, 72, 23, SKIN);
    ell(x, by - 160, 42, 40, C.K, by - 190); ell(x, by - 160, 39, 37, BEARD, by - 187); poly([[x - 30, by - 140], [x + 30, by - 140], [x, by - 104]], C.K); poly([[x - 26, by - 140], [x + 26, by - 140], [x, by - 108]], BEARD);
    for (let i = 0; i < 5; i++) strip(x - 22 + i * 11, by - 178, x - 18 + i * 9, by - 132, .5, .5, C.S2);
    for (const d of [-1, 1]) {
      const ex = x + d * 15, ey = by - 212;
      ell(ex, ey, 5, 7, C.K); Rh(ex - 2, ey - 4, 2, 2, C.W);
      rrect(ex - 11, ey - 17, 22, 7, 3, C.S2); ell(x + d * 24, by - 196, 6, 4, '#f3a892');
    }
    ell(x, by - 199, 6, 5, C.F2);
    for (const d of [-1, 1]) { ell(x + d * 14, by - 186, 16, 7, C.K); ell(x + d * 14, by - 187, 14, 5, [[.3, C.W], [1, C.S1]]); }
    // the crown
    for (const d of [-26, 0, 26]) { poly([[x + d - 11, by - 248], [x + d, by - 276 - (d ? 0 : 6)], [x + d + 11, by - 248]], C.K); poly([[x + d - 7, by - 249], [x + d, by - 270 - (d ? 0 : 6)], [x + d + 7, by - 249]], GOLD); ell(x + d, by - 276 - (d ? 0 : 6), 5, 5, C.K); ell(x + d, by - 276 - (d ? 0 : 6), 3, 3, C.G0); }
    rrect(x - 40, by - 254, 80, 22, 5, C.K); rrect(x - 37, by - 251, 74, 16, 3, GOLD);
    ell(x, by - 243, 6, 6, C.K); ell(x, by - 243, 4, 4, C.R1); for (const d of [-22, 22]) { ell(x + d, by - 243, 4, 4, C.K); ell(x + d, by - 243, 2, 2, '#7fe9ff'); }
  }
  function mouth(x, by, open) {
    if (open) { ell(x, by - 173, 8, 6, C.K); ell(x, by - 171, 5, 3, C.R2); } else Rh(x - 8, by - 175, 16, 3, C.K);
  }

  function throne(x, by) {
    rrect(x - 82, by - 300, 164, 300, 34, C.K); rrect(x - 78, by - 296, 156, 296, 31, GOLD);
    rrect(x - 66, by - 284, 132, 284, 24, C.K); rrect(x - 63, by - 281, 126, 281, 22, [[.2, '#a92b23'], [.6, '#8f231d'], [1, '#5c1612']]);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) ell(x - 45 + i * 30 + (j % 2) * 15, by - 250 + j * 34, 2, 2, '#3a0d0a');
    poly([[x - 26, by - 296], [x, by - 330], [x + 26, by - 296]], C.K); poly([[x - 20, by - 297], [x, by - 324], [x + 20, by - 297]], GOLD); ell(x, by - 304, 6, 6, C.K); ell(x, by - 304, 4, 4, C.R1);
    for (const d of [-82, 82]) { ell(x + d, by - 292, 14, 14, C.K); ell(x + d, by - 292, 11, 11, GOLD); }
    for (const d of [-1, 1]) { rrect(x + d * 92 - 18, by - 112, 36, 112, 8, C.K); rrect(x + d * 92 - 15, by - 109, 30, 109, 6, GOLD); ell(x + d * 92, by - 112, 20, 9, C.K); ell(x + d * 92, by - 113, 17, 6, [[.3, C.G0], [1, C.G1]]); }
  }

  /* A banner of the watch: red, gold trim, the eye in the middle, cut into two points. */
  function banner(x) {
    poly([[x - 3, 300], [x + 48, 300], [x + 22, 340]], C.K); poly([[x + 42, 300], [x + 93, 300], [x + 68, 340]], C.K);
    rrect(x - 3, 124, 96, 180, 2, C.K);
    poly([[x, 296], [x + 45, 296], [x + 22, 334]], [[.3, C.R1], [1, C.R2]]); poly([[x + 45, 296], [x + 90, 296], [x + 68, 334]], [[.3, C.R1], [1, C.R3]]);
    Rh(x, 126, 90, 175, C.R1); rrect(x, 126, 90, 175, 0, ROBE);
    Rh(x + 8, 132, 4, 160, C.G1); Rh(x + 78, 132, 4, 160, C.G2);
    ell(x + 45, 196, 32, 20, C.G2); ell(x + 45, 196, 29, 17, GOLD); ell(x + 45, 196, 21, 10, C.B3); ell(x + 45, 196, 10, 9, C.W); ell(x + 45, 196, 4, 4, C.K);
    rrect(x - 14, 114, 118, 12, 4, C.K); rrect(x - 12, 116, 114, 8, 3, GOLD); for (const d of [-14, 104]) { ell(x + d, 120, 8, 8, C.K); ell(x + d, 120, 5, 5, C.G0); }
  }

  function paint() {
    const { HL, HR, HT, HH, HFL } = V;
    P.bricksHD(HL, HT, HR - HL, HFL - HT, 70, 26, WALL, '#0e0b13', 11);
    // pillars with their torches
    for (let x = Math.floor((HL - 50) / 480) * 480 + 50; x < HR; x += 480) {
      Rh(x - 3, HT, 56, HFL - HT, C.K); rrect(x, HT, 50, HFL - HT, 0, PIER);
      for (let y = 150; y < HFL; y += 52) Rh(x, y, 50, 2, 'rgba(0,0,0,.3)');
      rrect(x - 12, 132, 74, 20, 3, C.K); Rv(x - 9, 135, 68, 14, [[.3, '#5d5670'], [1, '#3b3247']]);
      rrect(x - 12, HFL - 26, 74, 26, 3, C.K); Rv(x - 9, HFL - 23, 68, 23, [[.3, '#5d5670'], [1, '#3b3247']]);
      P.sconceHD(x + 25, 280);
    }
    banner(190); banner(360);
    // the floor in squares, the carpet to the throne, the dais
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#2b2333');
    for (let j = 0; j < 3; j++) for (let x = Math.floor(HL / 80) * 80; x < HR; x += 40) if (((x / 40) + j) % 2) Rh(x, HFL + j * 32, 40, 32, '#3b3247');
    Rh(HL, HFL, HR - HL, 2, '#5d5670');
    Rh(HL, 546, 716 - HL, 38, C.K); Rv(HL, 548, 714 - HL, 34, [[.12, C.G1], [.2, C.R0], [.8, C.R1], [.88, C.R2], [1, C.G2]]);
    rrect(640, 512, HR - 640 + 8, 20, 2, C.K); Rv(643, 514, HR - 643, 16, [[.2, '#aab6c6'], [.6, '#7d899b'], [1, '#525c6e']]);
    rrect(664, 497, HR - 664 + 8, 18, 2, C.K); Rv(667, 499, HR - 667, 13, [[.2, '#aab6c6'], [.6, '#7d899b'], [1, '#525c6e']]);
    Rv(700, 499, 240, 13, [[.3, C.R1], [1, C.R2]]); Rv(690, 514, 260, 16, [[.3, C.R1], [1, C.R2]]);
    throne(KX, KB); king(KX, KB);
    // the small table with the pie
    P.tableHD(110, 470, 90, 60);
  }

  /* Draws the court's fires and pie, and makes the knight and the King take turns to talk. */
  function draw(t, s) {
    const { HL, HR } = V;
    for (let x = Math.floor((HL - 50) / 480) * 480 + 50; x < HR; x += 480) { glow(x + 25, 260, 100, '#ffb000', .09 + .025 * Math.sin(t / 140 + x)); P.flameHD(x + 25, 280, .58, t + x); }
    P.pieHD(122, 444, t, s.piOK);
    const kingTalks = Math.floor(t / 3200) % 2 === 1;
    mouth(KX, KB, kingTalks && Math.floor(t / 230) % 2 === 1);
    if (kingTalks) K.speech(672, 180, t, true);
    s.o.mouth = kingTalks ? 'flat' : 'talk'; s.o.speak = !kingTalks;
  }

  KW.scenes.court = { spot: 72, paint, draw };
})(window.KW);
