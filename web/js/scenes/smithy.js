/* Knightwatcher scene: the smithy, on the fine grid. The scene for an update, where the knight hammers
   their own weapon on the anvil, and for the CPU running hot, where the knight works the bellows; and
   one of the quiet scenes, where the knight quenches a blade drawn from the forge. The scene
   interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, E = KW.effects, K = KW.knight, C = D.C;
  const { alpha, glow, Rh, Rv, ell, rrect, poly, strip, hsh, ease, lerp, clamp01, STEEL2, STEEL3 } = D;

  const WALL = ['#1d1411', '#21170f', '#1a120e', '#241913'];
  const BRICK = ['#3a1b14', '#43201a', '#331813', '#4a2419'];
  const IRON = [[.15, '#7d899b'], [.5, '#525c6e'], [1, '#353b48']];
  /* The places for the knight's gear at rest (docs/rig.md): the anvil, where the weapon lies under
     the hammer, x and y the middle of its grip and a its angle, which lays it flat, x counted from
     the scene's spot, s.spot, so that the blade lies where the hammer falls; and the wall over the
     quench barrel, where a shield hangs from a nail, x and y the nail and w by h the room below. */
  const RESTS = { anvil: { x: 50, y: 425, a: Math.PI / 2 }, wall: { kind: 'hang', x: 145, y: 312, w: 100, h: 132 } };
  /* What the shield on the wall adds to the backdrop key: '|' and its name when one is equipped. */
  const offKey = () => { const k = K.rest.key('off'); return k && k !== 'code' ? '|' + k : ''; };
  /* The x of the scene's spot, which the anvil counts from: the knight patrols away from it, and the
     engine walks the knight back to it before the hammer plays (s.spot; s.kx where a frame gives no
     spot). */
  const spotX = s => (s.spot !== undefined ? s.spot : s.kx);

  /* ---- The acts ---------------------------------------------------------------------------------
     Three, each in its own condition and each a function of the time alone, so that a frozen time
     gives one picture: the hammer while updating, the bellows while the CPU runs hot, and the
     quench while all is quiet. Under any other condition (a device down, the memory tight) the
     knight stands at the spot with the weapon on the anvil. world.js builds the same three for the
     medieval world's smithy from its anvil, bellows and quench, with these numbers. */

  /* Keyframes: rows of numbers, the first the time, the last a row's ease into it by name (smooth
     when a row names none). seg() finds the two rows around t and how far between them it is. */
  const EASES = { smooth: q => q * q * (3 - 2 * q), ease, line: q => q, fall: q => Math.pow(q, 2.5) };
  function seg(keys, t) {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1], q = clamp01((t - k0[0]) / Math.max(1, k1[0] - k0[0]));
    return [k0, k1, EASES[typeof k1[k1.length - 1] === 'string' ? k1[k1.length - 1] : 'smooth'](q)];
  }

  /* The hammer: one blow every period ms. The cycle starts at the blow, on the blade: the hammer
     bounces up and the body comes up out of the lean (to keys[1]), the hammer rises over the right
     shoulder as the body straightens and leans back a little (keys[2]), hangs a moment at the top
     (keys[3]), then falls fast through its arc onto the blade, the body leaning into it and sinking
     at the knees. Each row: the part of the cycle, the hammer's angle a (0 straight up), the right
     hand's distance r from its shoulder and its angle th from straight up, pin (how far the hand is
     drawn from there to the point that lays the hammer's face on the blade), lean, crouch and the
     head's dy. The face meets the blade at at past the middle of the weapon's grip on the anvil,
     just past the guard, on the blade's top edge, at the angle the last row gives; the left hand
     holds the grip. The sparks fly, the eyes shut and strike holds for the first strike of the
     cycle, and the progress bar fills over progress ms. */
  const HAMMER = { period: 1400, strike: .1, at: 98, progress: 9000,
    keys: [[0, 1.66, 40, 1.16, 1, 8, 7, .4],
      [.12, 1.26, 46, 1.16, .45, 4, 3, .2, 'ease'],
      [.55, -.12, 70, .32, 0, -4, 0, -.2, 'smooth'],
      [.66, -.24, 72, .27, 0, -5, 0, -.2, 'smooth'],
      [1, 1.66, 40, 1.16, 1, 8, 7, .4, 'fall']] };
  /* The hammer's face on the blade's top, with the weapon's grip at (gx, gy), and the right hand
     that lays it there at the blow's angle. */
  function strikeAt(gx, gy) {
    const b = K.rest.reach(), H = K.tool.hammer, a = HAMMER.keys[0][1], ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
    const fx = gx + HAMMER.at, fy = gy - (b ? b.half : 12), f = H.face + 2;
    return { face: [fx, fy], hand: [fx - H.handle * ux - f * nx, fy - H.handle * uy - f * ny] };
  }
  function hammer(t, s) {
    const o = s.o, c = (t % HAMMER.period) / HAMMER.period, [k0, k1, e] = seg(HAMMER.keys, c), v = i => lerp(k0[i], k1[i], e);
    const r = v(2), th = v(3), gx = spotX(s) + RESTS.anvil.x, gy = RESTS.anvil.y, st = strikeAt(gx, gy);
    o.bob = 0; o.lean = Math.round(v(5)); o.crouch = Math.round(v(6)) / 5; o.headDy = v(7);
    o.tool = { kind: 'hammer', a: v(1), R: { off: [Math.sin(th) * r, -Math.cos(th) * r], at: st.hand, pin: v(4) }, L: { at: [gx - 5, gy + 1] } };
    s.strike = c < HAMMER.strike;
    o.progress = (t % HAMMER.progress) / HAMMER.progress;
    o.mouth = 'smile';
    if (s.strike) o.eyes = 'closed'; else if (c < HAMMER.keys[2][0]) o.eyes = 'happy'; else { o.eyes = 'open'; o.look = 1; }
  }

  /* The quench: a blank heated in the fire, carried to the water and quenched, looked over and
     carried back, over a loop of period ms. The knight works the fire from stand[0], steps back
     drawing the blank out, raises it and walks to the water at stand[1] with it held up behind,
     swings it down past the right side and in front of the legs into the water (steam), lifts it
     out to the left and holds it up to look it over, walks back with it, and swings it down past
     the left and in front of the legs into the fire again. Each row of keys: the time, the stand
     the knight is counted from (0 the fire's, 1 the water's) and its offset from there, the right
     hand on the tongs (dx from the knight, y on the grid), the tongs' angle a and the blank's heat,
     from 0 cold to 1 white-hot; the left hand holds the tongs along pixels nearer the jaws. The
     blank is in the water through wet, where the water's face hides what is below it; the steam
     rises from steam, the eyes shut for shut, the drips fall through drip, a glint runs along the
     blank through glint and the knight smiles through smile and nods through nod. The blank never
     passes the face: each turn from one side to the other goes below the hands, which stay under
     the chin, and the tongs and the blank are short enough to keep the point near the floor. */
  const QUENCH = { period: 14400, along: 16, wet: [5560, 7560], steam: 5650, shut: 400, drip: [7700, 8400], glint: [8500, 9300], smile: [7950, 10500], nod: [9500, 9900, .6], fire: [2200, 13300],
    keys: [[0, 0, 0, 46, 420, 1.62, .75],
      [1000, 0, 0, 46, 420, 1.62, 1],
      [1700, 0, -80, 20, 420, 1.62, 1],
      [2200, 0, -80, 34, 402, .6, 1],
      [5000, 1, 0, 34, 402, .6, .92, 'line'],
      [5250, 1, 0, 46, 394, 1.57, .9],
      [5450, 1, 0, 22, 382, 2.6, .9],
      [5600, 1, 0, -46, 386, 3.3, .9],
      [5800, 1, 0, -46, 394, 3.3, .9],
      [6400, 1, 0, -46, 394, 3.3, 0],
      [7300, 1, 0, -46, 392, 3.36, 0],
      [7650, 1, 0, -52, 380, 4.4, 0],
      [7950, 1, 0, -44, 392, 5.75, 0],
      [10200, 1, 0, -42, 388, 5.82, 0],
      [10500, 1, 0, -40, 396, 5.8, 0],
      [13300, 0, -80, -40, 396, 5.8, 0, 'line'],
      [13500, 0, -80, -46, 392, 4.71, 0],
      [13650, 0, -80, -10, 382, 3.3, 0],
      [13800, 0, -80, 22, 386, 2.4, 0],
      [14000, 0, -60, 30, 418, 1.62, 0],
      [14400, 0, 0, 46, 420, 1.62, .75, 'line']] };
  /* The water, [x, y], where the blank goes in, its y the water's face; and the stands, the
     knight's x at the fire and at the water. */
  const WATER = Object.freeze({ water: Object.freeze([172, 452]), stand: Object.freeze([650, 228]) });
  /* Where the quench is at tq ms into its loop: the knight's x, whether it walks and which way, the
     right hand, the tongs' angle and the blank's heat. */
  function quenchAt(tq) {
    const [k0, k1, e] = seg(QUENCH.keys, tq), x0 = WATER.stand[k0[1]] + k0[2], x1 = WATER.stand[k1[1]] + k1[2], v = i => lerp(k0[i], k1[i], e);
    const x = Math.round(lerp(x0, x1, e));
    return { x, walk: x0 !== x1 ? Math.sign(x1 - x0) : 0, R: [x + v(3), v(4)], a: v(5), heat: v(6) };
  }
  function quench(t, s) {
    const o = s.o, tq = t % QUENCH.period, q = quenchAt(tq), wet = tq >= QUENCH.wet[0] && tq < QUENCH.wet[1];
    o.bob = 0; o.walk = q.walk !== 0;
    s.dx = q.x - s.kx;
    o.tool = { kind: 'tongs', two: true, a: q.a, heat: q.heat, cut: wet ? WATER.water[1] : null, R: { at: q.R }, L: { along: QUENCH.along } };
    // the eyes: ahead on the walks, on the work at the fire and at the water, shut in the steam;
    // a smile and a nod as the blank is looked over
    o.mouth = 'flat';
    o.look = q.walk || (tq < QUENCH.fire[0] || tq >= QUENCH.fire[1] ? 1 : -1);
    if (tq >= QUENCH.steam && tq < QUENCH.steam + QUENCH.shut) o.eyes = 'closed';
    if (tq >= QUENCH.smile[0] && tq < QUENCH.smile[1]) { o.mouth = 'smile'; if (tq >= QUENCH.nod[0] && tq < QUENCH.nod[1]) o.headDy = QUENCH.nod[2]; }
  }

  /* The bellows: the knight stands at stand and pumps them once every period ms, 2 pi times div,
     so that a glow's wave of div 100 keeps time with them: pressed with a push that gathers pace
     through press of the period, let up through the rest. pump is 0 open and 1 pressed; the
     handle's crossbar, its middle at handle open, goes down travel pixels pressed, and every
     moving point of the bellows is its open point plus pump times its travel. The body leans in
     from lean[0] to lean[0] + lean[1] pixels and sinks crouch pixels with each push; the right hand
     holds the crossbar at R from its middle and the left at L. The sweat, the panting and the steam
     are the pose's (KW.knight.pose('cpu_hot')). */
  const BELLOWS = Object.freeze({ stand: 612, handle: Object.freeze([682, 414]), travel: 30, div: 100 });
  const PUMP = { press: .38, lean: [1, 6], crouch: 7, R: [17, 0], L: [-5, 1] };
  const pumpAt = t => {
    const P = 2 * Math.PI * BELLOWS.div, c = (t % P) / P;
    return c < PUMP.press ? Math.pow(c / PUMP.press, 3) : 1 - EASES.smooth((c - PUMP.press) / (1 - PUMP.press));
  };
  function bellows(t, s) {
    const o = s.o, p = pumpAt(t), hx = BELLOWS.handle[0], hy = BELLOWS.handle[1] + BELLOWS.travel * p;
    o.bob = 0; o.lean = Math.round(PUMP.lean[0] + PUMP.lean[1] * p); o.crouch = Math.round(PUMP.crouch * p) / 5; o.look = 1;
    s.dx = BELLOWS.stand - s.kx;
    o.tool = { kind: 'lever', two: true, a: 0, R: { at: [hx + PUMP.R[0], hy + PUMP.R[1]] }, L: { at: [hx + PUMP.L[0], hy + PUMP.L[1]] } };
  }

  const cond = s => (s.w ? s.w.id : 'idle');
  /* The quench's clock, ms into its loop: one loop from the start of the patrol's quench stop
     (s.here), while all is quiet or something streams; null when it does not play. */
  const quenchClock = s => (s.here && s.here.act === 'quench' && s.here.el < QUENCH.period ? s.here.el : null);
  function act(t, s) {
    const id = cond(s), q = quenchClock(s);
    // the hammer plays once the engine has walked the knight back to the anvil
    if (id === 'updating') { if (Math.abs(s.kx - spotX(s)) <= 2) hammer(t, s); }
    else if (id === 'cpu_hot') bellows(t, s);
    else if (q !== null) quench(q, s);
  }

  /* The tools hung on a board on the wall: a hammer, tongs, two horseshoes. */
  function tools() {
    rrect(76, 192, 318, 14, 3, C.K); Rv(78, 194, 314, 10, [[.3, C.N1], [1, C.N3]]);
    for (const x of [112, 194, 290, 350]) { Rh(x - 3, 188, 6, 8, C.K); Rh(x - 2, 189, 4, 6, C.S3); }
    strip(112, 206, 112, 300, 5, 5, C.K); strip(112, 206, 112, 300, 3, 3, [[.3, C.N0], [1, C.N2]]); rrect(92, 200, 40, 22, 4, C.K); rrect(95, 203, 34, 16, 3, IRON);
    for (const d of [-1, 1]) { strip(194, 200, 194 + d * 14, 260, 4, 4, C.K); strip(194 + d * 14, 260, 194 + d * 8, 306, 4, 4, C.K); }
    for (const d of [-1, 1]) { strip(194, 200, 194 + d * 14, 260, 2, 2, C.S3); strip(194 + d * 14, 260, 194 + d * 8, 306, 2, 2, C.S3); }
    ell(194, 236, 4, 4, C.K); ell(194, 236, 2, 2, C.S1);
    for (const x of [290, 350]) {
      const pts = []; for (let a = -2.3; a <= 2.31; a += .23) pts.push([x + Math.sin(a) * 18, 230 - Math.cos(a) * 22]);
      SP.stroke(pts, 6, C.K); SP.stroke(pts, 3.5, C.S3); SP.stroke(pts.slice(2, 8), 1, C.S2);
    }
  }

  /* The anvil, its horn to the left. */
  function anvil() {
    poly([[596, 530], [604, 504], [666, 504], [674, 530]], C.K); poly([[600, 528], [607, 507], [663, 507], [670, 528]], IRON);
    poly([[612, 506], [618, 464], [652, 464], [658, 506]], C.K); poly([[616, 504], [621, 466], [649, 466], [654, 504]], IRON);
    poly([[530, 446], [566, 438], [566, 462], [552, 462]], C.K); poly([[536, 447], [566, 441], [566, 459], [554, 459]], IRON);
    rrect(562, 436, 148, 30, 4, C.K); rrect(565, 439, 142, 24, 3, IRON); Rh(566, 440, 140, 3, '#aab6c6');
  }

  function paint(s) {
    const { HL, HR, HT, HH, HFL } = V, kx = spotX(s);
    E.bricks.draw({ p: [HL, HT], w: HR - HL, h: HFL - HT, size: [62, 28], of: WALL, mortar: '#0d0807', seed: 7 });
    rrect(HL - 4, 128, HR - HL + 8, 26, 2, C.K); Rv(HL, 131, HR - HL, 20, [[.2, '#4a301a'], [.6, '#3a2514'], [1, '#26180c']]);
    tools();
    // the quench barrel, and the workbench with the pie, tall enough for the pie to stand clear over
    // the devices, beside the anvil
    P.barrelHD(100, 448, 90, 82, [[.2, C.B1], [.7, C.B2], [1, C.B3]]); Rh(126, 452, 20, 2, C.B0);
    P.tableHD(302, 448, 78, 82);
    // the forge: its hood and chimney, its brick hearth, the mouth of the fire
    poly([[762, HT - 2], [930, HT - 2], [930, 246], [976, 292], [716, 292], [762, 246]], C.K);
    E.bricks.draw({ p: [766, HT], w: 160, h: 248 - HT, size: [40, 16], of: BRICK, mortar: '#1e0e0a', seed: 3 }); poly([[764, 246], [928, 246], [970, 288], [722, 288]], [[.2, '#3a1d16'], [.7, '#2a140f'], [1, '#1c0d0a']]);
    Rh(716, 288, 260, 6, C.K);
    Rh(728, 324, HR - 728, HFL - 324, C.K); E.bricks.draw({ p: [732, 334], w: HR - 732, h: HFL - 334, size: [40, 16], of: BRICK, mortar: '#1e0e0a', seed: 9 });
    rrect(722, 318, HR - 722 + 8, 18, 3, C.K); Rv(725, 321, HR - 725, 12, [[.3, '#6a5f78'], [1, '#3b3247']]);
    rrect(766, 364, 148, 88, 18, C.K); rrect(771, 369, 138, 78, 15, [[.5, '#1a0907'], [1, '#2a0e09']]);
    // the floor of packed earth and slabs, ash by the forge
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#1f1712'); Rh(HL, HFL, HR - HL, 3, '#3a2a20');
    for (let j = 0; j < 4; j++) { const y = HFL + 3 + j * 20; Rh(HL, y + 18, HR - HL, 2, '#130d0a'); for (let x = Math.floor(HL / 110) * 110 + (j % 2) * 55; x < HR; x += 110) { Rh(x, y, 2, 18, '#130d0a'); Rh(x + 2, y, 1, 18, '#33251c'); } }
    for (let i = 0; i < 30; i++) Rh(700 + hsh(i, 91) % 300, HFL + 4 + hsh(i, 92) % 30, 3, 2, '#2e2a2a');
    anvil();
    // the shield on the wall, and the weapon across the anvil, under the hammer
    K.rest.draw('off', RESTS.wall.x, RESTS.wall.y);
    K.rest.draw('main', kx + RESTS.anvil.x, RESTS.anvil.y, RESTS.anvil.a);
  }

  /* ---- The bellows ------------------------------------------------------------------------------
     A great bellows on a trestle at the foot of the forge, its nozzle into an iron ring in the
     hearth's brickwork, drawn each frame after the fire, so that the forge's light does not fall on
     it: its parts that never move, the ring and the nozzle, the trestle and the bottom board; then
     its moving parts at pump p, 0 open and 1 pressed, each point its open point plus p times its
     travel: the leather between the boards, in folds, the top board hinged at the nozzle's end with
     an iron strap across it, the hinge, and the handle, a post on the board's free end with a
     crossbar for both hands. */
  const WOOD = [[.3, C.N1], [1, C.N3]], WOOD2 = [[.2, C.N0], [.7, C.N1], [1, C.N2]], HIDE = [[.2, '#8a5a34'], [.7, '#6b4226'], [1, '#4d2e1a']];
  const NOZZLE = [[.2, C.S2], [.6, C.S3], [1, C.S4]], HINGE = [[.3, C.S2], [1, C.S4]];
  function bellowsStill() {
    ell(848, 480, 9, 9, C.K); ell(848, 480, 6, 6, C.S3); ell(848, 480, 3, 3, '#1a0907');
    poly([[812, 473], [844, 476], [844, 484], [812, 489]], C.K); poly([[812, 476], [843, 478], [843, 482], [812, 486]], NOZZLE);
    Rh(696, 498, 14, 32, C.K); Rv(699, 498, 8, 30, WOOD); Rh(796, 498, 14, 32, C.K); Rv(799, 498, 8, 30, WOOD);
    Rh(696, 514, 114, 6, C.K); Rh(698, 515, 110, 4, C.N3);
    rrect(684, 486, 138, 14, 3, C.K); rrect(686, 488, 134, 9, 2, WOOD);
  }
  /* The folds of the leather: from the top edge to halfway down, out, and back in to the bottom
     board. Each [x, top, its travel, x out, halfway, its travel]. */
  const FOLDS = [[716.625, 460.125, 23.875, 712.375, 473.125, 11.875], [733.375, 464.375, 19.625, 729.75, 475.125, 9.875], [750, 468.5, 15.5, 747.125, 477.25, 7.75],
    [766.625, 472.625, 11.375, 764.5, 479.375, 5.625], [783.375, 476.875, 7.125, 782, 481.375, 3.625]];
  function bellowsHD(p) {
    poly([[694, 450 + 30 * p], [810, 480], [810, 488], [694, 488]], C.K); poly([[697, 453 + 30 * p], [807, 483], [807, 487], [697, 487]], HIDE);
    for (const [x, y0, d0, x1, y1, d1] of FOLDS) { strip(x, y0 + d0 * p, x1, y1 + d1 * p, 1, 1, '#3a2213'); strip(x1, y1 + d1 * p, x, 486, 1, 1, '#3a2213'); }
    poly([[686, 442 + 30 * p], [816, 474], [816, 484], [686, 454 + 30 * p]], C.K); poly([[689, 445 + 30 * p], [813, 477], [813, 481], [689, 451 + 30 * p]], WOOD2);
    Rh(763.375, 460.625 + 11.375 * p, 6, 11, C.K); Rh(764.375, 461.625 + 11.375 * p, 4, 9, C.S3);
    rrect(806, 470, 16, 24, 3, C.K); rrect(808, 472, 12, 20, 2, HINGE); ell(814, 482, 2, 2, C.S0);
    strip(694, 447 + 30 * p, 688, 416 + 30 * p, 5, 5, C.K); strip(694, 447 + 30 * p, 688, 416 + 30 * p, 3, 3, WOOD);
    rrect(666, 409 + 30 * p, 44, 11, 4, C.K); rrect(668, 411 + 30 * p, 40, 7, 3, WOOD2);
  }

  /* The fire in the forge: calm, or flared while the bellows work, a wider and stronger light that
     swells just after each push (a sine of the time over 100 ms, which keeps time with the pump's
     period of 2 pi times 100 ms), a second, warmer light over the coals, the flames half as large
     again and embers rising up the chimney. Only the light pulses; the flames keep one size. */
  const FLARE = -1.571;
  function fireHD(t, flared) {
    if (!flared) {
      glow(840, 410, 230, '#ff4a3d', .11 + .03 * Math.sin(t / 140));
      E.coals.draw({ p: [780, 440] }, t);
      E.flame.draw({ p: [812, 436], size: .55 }, t); E.flame.draw({ p: [842, 438], size: .7, dt: 300 }, t); E.flame.draw({ p: [872, 436], size: .5, dt: 700 }, t);
      E.coals.draw({ p: [782, 432], part: 'sparks', seed: 62, of: ['#fff3a0', '#ffb000'] }, t);
      return;
    }
    glow(840, 410, 270, '#ff4a3d', .24 + .05 * Math.sin(t / 100 + FLARE)); glow(840, 420, 130, '#ffb000', .25 + .11 * Math.sin(t / 100 + FLARE));
    E.coals.draw({ p: [780, 440] }, t);
    E.flame.draw({ p: [812, 436], size: .825 }, t); E.flame.draw({ p: [842, 438], size: 1.05, dt: 300 }, t); E.flame.draw({ p: [872, 436], size: .75, dt: 700 }, t);
    E.coals.draw({ p: [782, 432], part: 'sparks', seed: 62, of: ['#fff3a0', '#ffb000'] }, t);
    E.drift.draw({ p: [796, 410], n: 9, gap: 11, period: 1100, sway: [5, 12], rise: 190, size: 3, colour: '#ffb000' }, t);
    E.drift.draw({ p: [802, 400], n: 6, gap: 15, period: 1500, sway: [4, 16], rise: 230, size: 2, colour: '#fff3a0' }, t);
  }

  /* The rings on the water while the blank is in it, from where it went in: two at a time, each
     spreading and fading over 700 ms. */
  function ringsHD(tq) {
    const a = tq - QUENCH.wet[0], [wx, wy] = WATER.water;
    for (let i = 0; i < 2; i++) {
      const q = ((a / 700) + i / 2) % 1;
      alpha(.55 * (1 - q)); ell(wx, wy + 2, 5 + q * 12, 1 + q * 2, '#cfe6ff'); ell(wx, wy + 2, 3 + q * 12, q * 2, '#2b5ea8'); alpha(1);
    }
  }
  /* Over the knight while the quench plays: the steam off the water, a burst as the blank goes in
     and a thinner plume while it cools; the drips off the blank's point as it comes out; and the
     glint that runs along it as it is looked over. */
  function quenchOver(tq) {
    const [wx, wy] = WATER.water, a = tq - QUENCH.steam;
    if (a >= 0 && a < 3000) {
      for (let i = 0; i < 14; i++) {
        const big = i < 6, st = big ? i * 50 : 300 + (i - 6) * 180, q = (a - st) / (big ? 1300 : 1500);
        if (q < 0 || q > 1) continue;
        const x = wx + ((i * 29) % 34) - 17 + Math.sin(q * 4 + i) * 10 * q, y = wy - 4 - q * (big ? 150 : 120) - (i % 3) * 4, r = (big ? 12 : 8) + q * (big ? 30 : 18);
        alpha((big ? .9 : .7) * (1 - q)); ell(x, y, r, r * .8, '#e9eef8'); alpha((big ? .5 : .35) * (1 - q)); ell(x - r * .3, y - r * .25, r * .5, r * .4, C.W); alpha(1);
      }
    }
    const G = K.tool.tongs, B = K.tool.blank;
    if (tq >= QUENCH.drip[0] && tq < QUENCH.drip[1]) {
      const qa = quenchAt(tq), s0 = G.len + B.len, tx = qa.R[0] + Math.sin(qa.a) * s0, ty = qa.R[1] - Math.cos(qa.a) * s0;
      for (let i = 0; i < 3; i++) { const q = ((tq - QUENCH.drip[0]) / 420 + i / 3) % 1; if (ty + q * 50 > wy) continue; Rh(tx - 1 + i * 2, ty + q * q * 60, 2, 3, '#9fd0ff'); }
    }
    if (tq >= QUENCH.glint[0] && tq < QUENCH.glint[1]) {
      const qa = quenchAt(tq), q = (tq - QUENCH.glint[0]) / (QUENCH.glint[1] - QUENCH.glint[0]), along = G.len + 10 + q * (B.len - 20);
      SP.spark(qa.R[0] + Math.sin(qa.a) * along, qa.R[1] - Math.cos(qa.a) * along, 8 + Math.round(4 * Math.sin(q * Math.PI)), C.W);
    }
  }

  function draw(t, s) {
    const id = cond(s);
    fireHD(t, id === 'cpu_hot');
    bellowsStill(); bellowsHD(id === 'cpu_hot' ? pumpAt(t) : 0);
    // The blade's hot tip while the hammer works it, at the weapon's point (to along the blade) and
    // between its edges (half either side), in bands that start 73, 57 and 43 short of the point.
    // A weapon that gives no blade, or only fires, shows none.
    const fw = K.fired(), gx = spotX(s) + RESTS.anvil.x, gy = RESTS.anvil.y, b = id === 'updating' && !(fw && fw.use === 'fire') ? K.rest.reach() : null;
    if (b) {
      const to = b.to, h = b.half;
      glow(gx + (to - 31), gy, 56, '#ff8a3d', .14 + .03 * Math.sin(t / 120));
      D.dith(gx + (to - 87), gy - (h - 1), 14, 2 * h - 1, '#7a2a1d');
      for (const [x0, x1, c] of [[73, 57, '#8f231d'], [57, 43, '#cc352c'], [43, 30, '#ff5a1e']]) Rh(gx + (to - x0), gy - h, x0 - x1, 2 * h + 1, c);
      poly([[gx + (to - 30), gy - h], [gx + to, gy], [gx + (to - 30), gy + h]], '#ffb000'); poly([[gx + (to - 27), gy - (h - 7)], [gx + (to - 11), gy], [gx + (to - 27), gy + (h - 7)]], '#fff3a0');
      Rh(gx + (to - 71), gy - (h - 3), 42, 2, 'rgba(255,240,180,.55)'); Rh(gx + (to - 71), gy + (h - 6), 42, 2, 'rgba(60,10,0,.35)');
    }
    // the rings on the water while the blank is in it, then the pie
    const tq = quenchClock(s);
    if (tq !== null && tq >= QUENCH.wet[0] && tq < QUENCH.wet[1]) ringsHD(tq);
    KW.devices.draw(t, s);
    // the sparks where the hammer's face meets the blade, through the blow
    if (s.strike) E.burst.draw({ p: [spotX(s) + 148, 412] }, (t % HAMMER.period) / HAMMER.period / HAMMER.strike);
  }
  function over(t, s) { const tq = quenchClock(s); if (tq !== null) quenchOver(tq); }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 341, y: 453, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 600, y: 300, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 676, y: 300, w: 88, h: 112 },
    h3: { cls: 'high', kind: 'surface', x: 40, y: 300, w: 88, h: 112, flip: true },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 883, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 760, y: 594, w: 132, h: 112, front: true }
  };

  KW.scenes.smithy = {
    spot: 88, places: PLACES, rests: RESTS, helmet: false, sword: false,
    // The conditions this scene can act out (docs/page.md): the update by the hammer, the CPU running
    // hot by the bellows, and a device down and the memory tight standing where the knight is, as a
    // quiet scene does, and a stream on the television; all is quiet by the quench, a stop of the
    // knight's patrol.
    can: ['device_down', 'cpu_hot', 'memory_tight', 'updating', 'streaming'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: [],
    // the stops of the knight's patrol (docs/page.md): a look round at the anvil, and one loop of the
    // quench from the fire (14.4 s, rounded up to whole seconds)
    rounds: [{ x: 88, act: 'look', dur: 12 }, { x: 130, act: 'quench', dur: 15 }],
    // where the television stands while something streams (docs/scenes.md): its middle, what it
    // stands on, and where the knight watches it from, in units of U as the spot
    tv: { x: 239, stand: 'table', watch: 88 },
    key: s => Math.round(spotX(s)) + '|' + K.rest.key('main') + offKey(), act, paint, draw, over
  };
})(window.KW);
