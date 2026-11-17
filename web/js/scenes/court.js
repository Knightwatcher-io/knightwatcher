/* Knightwatcher scene: the royal court, on the fine grid. The scene for an open SSH session, where
   the knight and the monarch take turns to talk. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, E = KW.effects, K = KW.knight, C = D.C;
  const { glow, Rh, Rv, ell, rrect, poly, strip, GOLD } = D;

  const WALL = ['#1a1622', '#1d1826', '#17131e', '#201a29'];
  const PIER = [[.15, '#4a3f57'], [.45, '#3b3247'], [.85, '#2b2333'], [1, '#1f1927']];
  const ROBE = [[.12, C.R0], [.5, C.R1], [.85, C.R2], [1, C.R3]];
  const FUR = [[.3, C.W], [.8, C.S1], [1, C.S2]];
  /* The monarch's skin as drawn by default, the face bands and the cheek: the same colours as the
     base pack's warm skin. s.patron.skin replaces them with another of its skin swatches. */
  const SKIN = { face: [[.14, C.F0], [.72, C.F1], [1, C.F2]], cheek: '#f3a892' };
  // the throne, 50 left of the dais's right end and up its third step, clear of the device at its foot
  const KX = 770, KB = 490;
  /* The monarch's eye line and mouth, in grid pixels above the seat. */
  const EY = 208, MY = 193;

  /* The three monarchs, chosen by the settings (s.patron.id): A a young king, B a young queen
     and C a young monarch who is neither. All three sit the same way on the same throne, with the
     same hands, face and mouth. Each has its own robe, hair, crown and what it holds:
     robe and shade colour the robe and the far sleeve, hair the hair across its width, dark and
     brow its darkest strands and the eyebrows, sheen the light on B's hair, iris the eyes. The
     settings may give other hair and robe colours (see dressed, below). Each is drawn in the skin it is
     given, sk ({ face, cheek }). */
  const MONARCHS = {
    a: { robe: ROBE, shade: [[.3, C.R1], [1, C.R3]],
      hair: [[.25, '#a8703c'], [.7, '#7f4f27'], [1, '#5a3417']], dark: '#3f2410', brow: '#4a2a12', iris: '#5a3a22',
      front: ermineFront, back: earsA, hairDo: hairA, crown: crownA, held: sceptre, chest: null, beard: beardA },
    b: { robe: [[.12, '#c7a2ff'], [.5, '#9b66f0'], [.85, '#7646c8'], [1, '#4f2b8c']], shade: [[.3, '#9b66f0'], [1, '#4f2b8c']],
      hair: [[.25, '#57506f'], [.7, '#3a3352'], [1, '#29233b']], dark: '#1f1a2d', brow: '#29233b', sheen: '#7a7299', iris: '#3a4a86',
      front: goldFront, back: hairBackB, hairDo: hairB, crown: crownB, held: null, chest: null, after: orb },
    c: { robe: [[.12, '#86e6bd'], [.5, '#3fbf8a'], [.85, '#2a9468'], [1, '#17603f']], shade: [[.3, '#3fbf8a'], [1, '#17603f']],
      hair: [[.25, '#f8e09a'], [.7, '#e0b65e'], [1, '#b98a3c']], dark: '#946a28', brow: '#a87a30', iris: '#2f6b55',
      front: frogFront, back: hairBackC, hairDo: hairC, crown: crownC, held: null, chest: chain }
  };

  /* Ermine: white fur with black tails, over a rectangle. */
  function ermine(x, y, w, h) { for (let j = 0; j < h; j += 14) for (let i = 4 + (j / 14 % 2) * 9; i < w - 4; i += 18) { Rh(x + i, y + j + 3, 3, 6, C.K); Rh(x + i - 2, y + j + 3, 7, 2, C.K); } }

  /* ---- The fronts of the robes ---- */
  /* Monarch A: a strip of ermine down the front. */
  function ermineFront(x, by) {
    rrect(x - 15, by - 150, 30, 140, 6, C.K); rrect(x - 12, by - 148, 24, 136, 4, FUR);
    for (let y = by - 135; y < by - 30; y += 22) { Rh(x - 2, y, 4, 7, C.K); Rh(x - 4, y + 2, 8, 2, C.K); }
  }
  /* Monarch B: a band of gold set with stones. */
  function goldFront(x, by) {
    rrect(x - 11, by - 150, 22, 140, 5, C.K); rrect(x - 8, by - 148, 16, 136, 3, GOLD);
    for (let i = 0, y = by - 128; y < by - 30; i++, y += 24) { ell(x, y, 5, 5, C.K); ell(x, y, 3, 3, i % 2 ? '#7fe9ff' : C.R1); }
  }
  /* Monarch C: a dark panel closed with bars of gold. */
  function frogFront(x, by, m) {
    rrect(x - 14, by - 150, 28, 140, 5, C.K); rrect(x - 11, by - 148, 22, 136, 3, m.shade);
    for (let y = by - 104; y < by - 30; y += 18) { Rh(x - 11, y - 1, 22, 5, C.K); Rh(x - 9, y, 18, 3, C.G1); ell(x, y + 1, 3, 3, C.K); ell(x, y + 1, 2, 2, C.G0); }
  }

  /* ---- What each holds or wears on the chest ---- */
  /* Monarch A: the sceptre in the hand on the right, drawn before the hand that grips it. */
  function sceptre(x, by) {
    strip(x + 66, by - 210, x + 66, by - 20, 6, 6, C.K); strip(x + 66, by - 210, x + 66, by - 20, 3.5, 3.5, GOLD);
    ell(x + 66, by - 214, 13, 13, C.K); ell(x + 66, by - 214, 10, 10, [[.3, C.R0], [.7, C.R1], [1, C.R2]]); Rh(x + 61, by - 220, 3, 3, C.W);
  }
  /* Monarch B: an orb resting in the hand on the left. */
  function orb(x, by) {
    const ox = x - 64, oy = by - 95;
    Rh(ox - 2, oy - 22, 4, 8, C.K); ell(ox, oy - 23, 5, 5, C.K); ell(ox, oy - 23, 3, 3, '#7fe9ff');
    ell(ox, oy, 15, 15, C.K); ell(ox, oy, 12, 12, GOLD);
    Rh(ox - 12, oy - 1, 24, 3, C.G2); Rh(ox - 1, oy - 12, 3, 24, C.G2); ell(ox, oy, 3, 3, C.R1); Rh(ox - 7, oy - 8, 3, 3, C.W);
  }
  /* Monarch C: a chain of office across the collar, with the eye of the watch on its medallion. */
  function chain(x, by) {
    for (let i = -45; i <= 45; i += 9) { const y = by - 128 - 26 * (i / 45) * (i / 45); ell(x + i, y, 4, 4, C.K); ell(x + i, y, 2, 2, C.G0); }
    const my = by - 118;
    ell(x, my, 14, 14, C.K); ell(x, my, 11, 11, GOLD); ell(x, my, 7, 4, C.B3); ell(x, my, 4, 3, C.W); ell(x, my, 2, 2, C.K);
  }

  /* ---- Hair: what lies behind the head, and what lies over it ---- */
  function earsA(x, by, m, sk) { for (const d of [-1, 1]) { ell(x + d * 36, by - EY + 3, 7, 10, C.K); ell(x + d * 36, by - EY + 3, 4, 7, sk.face); } }
  /* Monarch A: short hair with a fringe swept to one side, sideburns and a short trimmed beard. */
  function hairA(x, by, m) {
    rrect(x - 40, by - 258, 80, 36, 18, C.K);
    rrect(x - 37, by - 255, 74, 30, 15, m.hair);
    for (const [dx, dy, rx, c] of [[-22, -229, 12, m.hair[1][1]], [-4, -228, 13, m.hair[0][1]], [16, -230, 12, m.hair[1][1]]]) ell(x + dx, by + dy, rx, 5, c);
    for (const d of [-1, 1]) Rh(x + d * 31 - 3, by - 232, 6, 34, m.hair[1][1]);
  }
  function beardA(x, by, m, sk) {
    rrect(x - 34, by - 247, 68, 78, 31, m.hair, by - 198);
    ell(x, by - 197, 28, 18, sk.face);
    rrect(x - 34, by - 247, 68, 78, 31, m.dark, by - 172);
    Rh(x - 7, by - 200, 14, 2, m.hair[1][1]);
  }
  /* Monarch B: long hair, parted in the middle, falling past the shoulders. */
  function hairBackB(x, by, m) { rrect(x - 52, by - 258, 104, 92, 32, C.K); rrect(x - 49, by - 255, 98, 86, 29, m.hair); }
  function hairB(x, by, m) {
    for (const d of [-1, 1]) rrect(x + (d < 0 ? -55 : 30), by - 236, 25, 128, 12, C.K);
    rrect(x - 40, by - 258, 80, 34, 17, C.K);
    for (const d of [-1, 1]) {
      rrect(x + (d < 0 ? -52 : 33), by - 233, 19, 122, 9, m.hair);
      Rh(x + d * 42, by - 214, 2, 90, m.dark); Rh(x + d * 37, by - 190, 2, 60, m.hair[0][1]);
    }
    rrect(x - 37, by - 255, 74, 28, 14, m.hair);
    for (const d of [-1, 1]) ell(x + d * 22, by - 229, 17, 7, m.hair[d < 0 ? 0 : 1][1]);
    strip(x - 30, by - 230, x - 12, by - 236, 1, 1, m.sheen);
    Rh(x - 1, by - 248, 2, 14, m.dark);
  }
  /* Monarch C: hair to the jaw, parted to one side, the fringe swept across. */
  function hairBackC(x, by, m) { rrect(x - 47, by - 258, 94, 84, 20, C.K); rrect(x - 44, by - 255, 88, 78, 17, m.hair); }
  function hairC(x, by, m) {
    const curtain = (d, g) => poly([[x + d * (29 - g), by - 238], [x + d * (47 + g), by - 238], [x + d * (47 + g), by - 190], [x + d * 30, by - 174 + g], [x + d * (29 - g), by - 186]], g ? C.K : m.hair);
    for (const d of [-1, 1]) curtain(d, 3);
    rrect(x - 40, by - 258, 80, 34, 16, C.K);
    for (const d of [-1, 1]) { curtain(d, 0); strip(x + d * 39, by - 226, x + d * 36, by - 188, 1, 1, m.dark); }
    rrect(x - 37, by - 255, 74, 28, 14, m.hair);
    poly([[x - 37, by - 236], [x + 14, by - 240], [x + 4, by - 228], [x - 20, by - 222], [x - 37, by - 216]], m.hair[1][1]);
    poly([[x - 30, by - 240], [x + 10, by - 242], [x - 4, by - 234], [x - 30, by - 228]], m.hair[0][1]);
    Rh(x + 13, by - 250, 2, 12, m.dark);
  }

  /* ---- Crowns, each on a band whose top is b ---- */
  function band(x, b) { rrect(x - 40, b, 80, 22, 5, C.K); rrect(x - 37, b + 3, 74, 16, 3, GOLD); }
  /* Monarch A: three tall points tipped with gold, a ruby and two pale stones. */
  function crownA(x, by) {
    const b = by - 258;
    for (const d of [-26, 0, 26]) { const h = d ? 22 : 28; poly([[x + d - 11, b + 6], [x + d, b - h], [x + d + 11, b + 6]], C.K); poly([[x + d - 7, b + 5], [x + d, b - h + 6], [x + d + 7, b + 5]], GOLD); ell(x + d, b - h, 5, 5, C.K); ell(x + d, b - h, 3, 3, C.G0); }
    band(x, b);
    ell(x, b + 11, 6, 6, C.K); ell(x, b + 11, 4, 4, C.R1); for (const d of [-22, 22]) { ell(x + d, b + 11, 4, 4, C.K); ell(x + d, b + 11, 2, 2, '#7fe9ff'); }
  }
  /* Monarch B: five rounded leaves, each set with a pearl, and a band of pale stones. */
  function crownB(x, by) {
    const b = by - 258;
    for (const [d, h] of [[-30, 10], [-15, 16], [0, 22], [15, 16], [30, 10]]) { poly([[x + d - 9, b + 6], [x + d, b - h], [x + d + 9, b + 6]], C.K); poly([[x + d - 5, b + 5], [x + d, b - h + 6], [x + d + 5, b + 5]], GOLD); ell(x + d, b - h - 2, 5, 5, C.K); ell(x + d, b - h - 2, 3, 3, C.W); }
    band(x, b);
    for (const d of [-24, -8, 8, 24]) { ell(x + d, b + 11, 4, 4, C.K); ell(x + d, b + 11, 2, 2, Math.abs(d) === 8 ? C.W : C.R1); }
  }
  /* Monarch C: a closed crown, a gold arch over a cap of velvet, with a jewel on top. */
  function crownC(x, by) {
    const b = by - 258;
    ell(x, b + 4, 38, 30, C.K, null, b + 4); ell(x, b + 4, 35, 27, GOLD, null, b + 4); ell(x, b + 5, 30, 22, [[.3, C.R1], [.7, C.R2], [1, C.R3]], null, b + 4);
    // the post of the arch, in the outline's colour: it was given the gold's band list, which a canvas
    // takes for no colour, so it has always shown in the colour set before it
    Rh(x - 5, b - 25, 10, 30, C.K); Rh(x - 3, b - 23, 6, 28, C.K);
    for (const [dx, dy] of [[-22, -12], [22, -12], [0, -14]]) { ell(x + dx, b + dy, 3, 3, C.K); ell(x + dx, b + dy, 2, 2, C.W); }
    ell(x, b - 30, 7, 7, C.K); ell(x, b - 30, 5, 5, '#7fe9ff'); Rh(x - 2, b - 33, 2, 2, C.W);
    band(x, b);
    ell(x, b + 11, 5, 5, C.K); ell(x, b + 11, 3, 3, C.G0); for (const d of [-22, 22]) { ell(x + d, b + 11, 4, 4, C.K); ell(x + d, b + 11, 2, 2, C.R1); }
  }

  /* The monarch on the throne, seated, x the middle and by the seat of the dais underfoot, in the
     skin sk. The mouth is drawn apart, in mouth(), since it moves while the monarch talks. */
  function monarch(x, by, m, sk) {
    // shoes and robe
    for (const d of [-26, 26]) { ell(x + d, by - 6, 20, 10, C.K); ell(x + d, by - 7, 17, 7, [[.3, C.N1], [1, C.N3]]); }
    poly([[x - 58, by - 160], [x + 58, by - 160], [x + 80, by - 8], [x - 80, by - 8]], C.K);
    poly([[x - 55, by - 157], [x + 55, by - 157], [x + 76, by - 11], [x - 76, by - 11]], m.robe);
    rrect(x - 79, by - 30, 158, 22, 6, C.K); rrect(x - 76, by - 28, 152, 17, 5, FUR); ermine(x - 76, by - 28, 152, 14);
    m.front(x, by, m);
    // sleeves and hands on the armrests
    for (const d of [-1, 1]) {
      poly([[x + d * 52, by - 152], [x + d * 78, by - 128], [x + d * 76, by - 82], [x + d * 50, by - 86]], C.K);
      poly([[x + d * 53, by - 148], [x + d * 75, by - 127], [x + d * 73, by - 85], [x + d * 53, by - 89]], d < 0 ? m.robe : m.shade);
      rrect(x + d * 64 - 15, by - 92, 30, 12, 4, C.K); rrect(x + d * 64 - 13, by - 90, 26, 8, 3, FUR);
    }
    if (m.held) m.held(x, by, m);
    for (const d of [-1, 1]) { ell(x + d * 64, by - 72, 13, 11, C.K); ell(x + d * 64, by - 72, 10, 8, sk.face); }
    if (m.after) m.after(x, by, m);
    // the ermine collar
    rrect(x - 62, by - 168, 124, 30, 14, C.K); rrect(x - 59, by - 165, 118, 24, 12, FUR); ermine(x - 56, by - 164, 112, 20);
    if (m.chest) m.chest(x, by, m);
    // the head: hair behind, the face, hair over it, the crown
    m.back(x, by, m, sk);
    rrect(x - 37, by - 250, 74, 84, 34, C.K); rrect(x - 34, by - 247, 68, 78, 31, sk.face);
    if (m.beard) m.beard(x, by, m, sk);
    const ey = by - EY;
    for (const d of [-1, 1]) {
      const ex = x + d * 15;
      ell(x + d * 24, ey + 12, 6, 3, sk.cheek);
      ell(ex, ey, 6, 8, C.K); ell(ex, ey + 3, 3, 3, m.iris); Rh(ex - 3, ey - 5, 3, 3, C.W); Rh(ex + 2, ey + 2, 2, 2, C.W);
    }
    m.hairDo(x, by, m);
    const brow = m.browOn ? m.browOn(sk) : m.brow;
    for (const d of [-1, 1]) Rh(x + d * 15 - 5, ey - 14, 10, 3, brow);
    m.crown(x, by, m);
  }
  function mouth(x, by, open) {
    const my = by - MY;
    if (open) { ell(x, my, 6, 5, C.K); ell(x, my + 2, 4, 2, C.R1); } else Rh(x - 5, my - 1, 10, 3, C.K);
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

  function paint(s) {
    const { HL, HR, HT, HH, HFL } = V;
    E.bricks.draw({ p: [HL, HT], w: HR - HL, h: HFL - HT, size: [70, 26], of: WALL, mortar: '#0e0b13', seed: 11 });
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
    Rh(HL, 546, 676 - HL, 38, C.K); Rv(HL, 548, 674 - HL, 34, [[.12, C.G1], [.2, C.R0], [.8, C.R1], [.88, C.R2], [1, C.G2]]);
    rrect(600, 512, HR - 600 + 8, 20, 2, C.K); Rv(603, 514, HR - 603, 16, [[.2, '#aab6c6'], [.6, '#7d899b'], [1, '#525c6e']]);
    rrect(624, 497, HR - 624 + 8, 18, 2, C.K); Rv(627, 499, HR - 627, 13, [[.2, '#aab6c6'], [.6, '#7d899b'], [1, '#525c6e']]);
    rrect(648, 482, HR - 648 + 8, 18, 2, C.K); Rv(651, 484, HR - 651, 13, [[.2, '#aab6c6'], [.6, '#7d899b'], [1, '#525c6e']]);
    Rv(682, 484, 218, 13, [[.3, C.R1], [1, C.R2]]); Rv(660, 499, 240, 13, [[.3, C.R1], [1, C.R2]]); Rv(650, 514, 260, 16, [[.3, C.R1], [1, C.R2]]);
    throne(KX, KB); patronOf(s).draw(KX, KB, lookOf(s));
    // the tall side table with the pie, between the two devices at the left
    P.tableHD(106, 458, 76, 72);
  }

  /* Draws the court's fires and pie, and makes the knight and the monarch take turns to talk. */
  function draw(t, s) {
    const { HL, HR } = V;
    for (let x = Math.floor((HL - 50) / 480) * 480 + 50; x < HR; x += 480) { glow(x + 25, 260, 100, '#ffb000', .09 + .025 * Math.sin(t / 140 + x)); E.flame.draw({ p: [x + 25, 280], size: .58, dt: x }, t); }
    KW.devices.draw(t, s);
    const monarchTalks = Math.floor(t / 3200) % 2 === 1;
    patronOf(s).mouth(KX, KB, monarchTalks && Math.floor(t / 230) % 2 === 1, lookOf(s));
    if (monarchTalks) K.speech(622, 180, t, true);
    s.o.mouth = monarchTalks ? 'flat' : 'talk'; s.o.speak = !monarchTalks;
  }

  /* The look the patron is drawn in, from the frame's s.patron: { skin, hair, robe }, each what
     s.patron gives where it can be read, as below, and null for the monarch's own otherwise. */
  const isColour = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const stateOf = s => (s && s.patron) || {};
  function lookOf(s) {
    const p = stateOf(s), sk = p.skin;
    const skinOk = !!sk && Array.isArray(sk.face) && sk.face.length === 3 && isColour(sk.cheek) && sk.face.every(b => Array.isArray(b) && typeof b[0] === 'number' && isColour(b[1]));
    return { skin: skinOk ? sk : null, hair: p.hair && bandsOk(p.hair.bands, 3) ? p.hair : null, robe: p.robe && bandsOk(p.robe.bands, 4) ? p.robe : null };
  }
  /* The skin the monarch is drawn in: the look's skin when it holds a face of three bands and a
     cheek, as each of the base pack's skin swatches does, and the court's own otherwise. */
  const skinOf = look => look.skin || SKIN;
  /* The monarch's hair and robe: the look's hair and robe, from the base pack's hair and tabard
     swatches, laid over the court's own ramps. A hair swatch's three bands become the hair's three,
     and its darkest band, darkened, the darkest strands (to 0.7) and the brows (to 0.85), which is
     how the court's own hair is shaded; where those brows would hardly show on the skin they are
     drawn in (light hair on a dark skin), they take the lightest band instead, whichever of the
     two stands out more from the skin's middle band. B's sheen is the lightest band lifted towards
     white. A tabard swatch's four bands become the robe's four, and the shade of the far sleeve
     (and C's panel) its second and fourth. Anything else leaves the monarch as drawn. */
  const hexOf = n => '#' + n.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const toward = (c, to, k) => hexOf(rgb(c).map((v, i) => v + (to[i] - v) * k));
  const bandsOk = (b, n) => Array.isArray(b) && b.length === n && b.every(isColour);
  function hairOf(look) {
    const k = look.hair;
    if (!k) return null;
    const [c0, c1, c2] = k.bands, dim = toward(c2, [0, 0, 0], .15);
    const browOn = sk => (contrast(c0, sk.face[1][1]) > contrast(dim, sk.face[1][1]) ? c0 : dim);
    return { hair: [[.25, c0], [.7, c1], [1, c2]], dark: toward(c2, [0, 0, 0], .3), brow: dim, browOn, sheen: toward(c0, [255, 255, 255], .25) };
  }
  /* The contrast of two colours, as WCAG reckons it, from 1 to 21. */
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function robeOf(look) {
    const k = look.robe;
    if (!k) return null;
    const [c0, c1, c2, c3] = k.bands;
    return { robe: [[.12, c0], [.5, c1], [.85, c2], [1, c3]], shade: [[.3, c1], [1, c3]] };
  }
  /* The monarch m in the hair and robe the look gives, or exactly as drawn when it gives none. */
  function dressed(m, look) {
    const h = hairOf(look), r = robeOf(look);
    return h || r ? Object.assign({}, m, h, r) : m;
  }

  /* ---- The patrons --------------------------------------------------------------------------
     The three monarchs as the engine's cast has them (docs/page.md, The cast), by id:
       draw(x, by, look)  the monarch on the throne, x its middle and by the seat of the dais, in
                          the look { skin, hair, robe } (each null for its own), all but the mouth
       mouth(x, by, open, look)  the mouth, open or shut, drawn each frame as the monarch talks
       drawn              the colours it is drawn in, { hair, robe }, for the settings' "As drawn"
     The court draws the patron KW.cast.patrons gives (world.js), the code's own on a page without
     the compiler, and these are the fallback. */
  const PATRONS = {};
  for (const id of Object.keys(MONARCHS)) {
    const m = MONARCHS[id];
    PATRONS[id] = Object.freeze({ draw: (x, by, look) => monarch(x, by, dressed(m, look), skinOf(look)), mouth, drawn: Object.freeze({ hair: m.hair.map(b => b[1]), robe: m.robe.map(b => b[1]) }) });
  }
  P.PATRONS = Object.freeze(PATRONS);
  /* The patron s.patron names, 'a' when it names none the cast has: from KW.cast where the world
     gives it, another world's patron by its long name among them, from the code's own otherwise. */
  const known = id => typeof id === 'string' && (Object.prototype.hasOwnProperty.call(PATRONS, id) || !!(KW.cast && KW.cast.patrons && Object.prototype.hasOwnProperty.call(KW.cast.patrons, id)));
  const idOf = s => (known(stateOf(s).id) ? stateOf(s).id : 'a');
  const patronFor = id => { const set = KW.cast && KW.cast.patrons; return (set && set[id]) || PATRONS[id]; };
  const patronOf = s => patronFor(idOf(s));
  /* The colours each monarch is drawn in, for the settings screen's "As drawn" choices. */
  const drawn = mon => { const p = patronFor(known(mon) ? mon : 'a'); return { hair: p.drawn.hair.slice(), robe: p.drawn.robe.slice() }; };
  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 144, y: 463, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 610, y: 300, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 634, y: 368, w: 88, h: 112 },
    h3: { cls: 'high', kind: 'surface', x: 132, y: 300, w: 88, h: 112, flip: true },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 904, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 218, y: 594, w: 132, h: 112, front: true }
  };

  /* The monarch, the skin, the hair and the robe are painted into the backdrop, so every choice is
     part of its key, and so is where the patron is drawn from: a patron from a pack carries from,
     which keeps it apart from the code's drawing of it and from another compile's. */
  const keyOf = s => {
    const id = idOf(s), p = patronFor(id), look = lookOf(s);
    const k = (p.from ? id + '@' + p.from : id) + '|' + (look.skin ? look.skin.id : '');
    const h = look.hair ? look.hair.id : '', r = look.robe ? look.robe.id : '';
    return h || r ? k + '|' + h + '|' + r : k;
  };

  KW.scenes.court = {
    spot: 70, places: PLACES,
    // The conditions this scene can act out (docs/page.md): the court draws the knight and the
    // monarch taking turns to talk, whatever else is up, so it acts the SSH session alone. Kept
    // as plain data for the world format being drafted to take over.
    can: ['ssh_session'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: [],
    key: keyOf, paint, draw, drawn
  };
})(window.KW);
