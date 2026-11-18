/* Knightwatcher scene: the smithy, on the fine grid. The scene for an update, where the knight hammers
   their own weapon on the anvil. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, E = KW.effects, K = KW.knight, C = D.C;
  const { alpha, glow, Rh, Rv, ell, rrect, poly, strip, hsh, ease, STEEL2, STEEL3 } = D;

  const WALL = ['#1d1411', '#21170f', '#1a120e', '#241913'];
  const BRICK = ['#3a1b14', '#43201a', '#331813', '#4a2419'];
  const IRON = [[.15, '#7d899b'], [.5, '#525c6e'], [1, '#353b48']];
  /* The places for the knight's gear at rest (docs/rig.md): the anvil, where the weapon lies under
     the hammer, x and y the middle of its grip and a its angle, which lays it flat, x counted from
     the knight's spot, s.kx, so that the blade lies where the hammer falls; and the wall over the
     quench barrel, where a shield hangs from a nail, x and y the nail and w by h the room below. */
  const RESTS = { anvil: { x: 50, y: 425, a: Math.PI / 2 }, wall: { kind: 'hang', x: 145, y: 312, w: 100, h: 132 } };
  /* What the shield on the wall adds to the backdrop key: '|' and its name when one is equipped. */
  const offKey = () => { const k = K.rest.key('off'); return k && k !== 'code' ? '|' + k : ''; };

  /* The hammer rises slowly and falls fast, once every 1.3 seconds, and a progress bar fills. */
  function act(t, s) {
    const o = s.o, c = (t % 1300) / 1300; o.sword = false;
    o.hammer = c < .55 ? 1 - ease(c / .55) : Math.pow((c - .55) / .45, 3); s.strike = c > .93 || c < .06; o.progress = (t % 9000) / 9000; if (s.strike) o.eyes = 'closed';
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
    const { HL, HR, HT, HH, HFL } = V, kx = s.kx;
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

  function draw(t, s) {
    const gx = s.kx + RESTS.anvil.x, gy = RESTS.anvil.y, b = K.rest.blade();
    // the fire in the forge
    glow(840, 410, 230, '#ff4a3d', .11 + .03 * Math.sin(t / 140));
    E.coals.draw({ p: [780, 440] }, t);
    E.flame.draw({ p: [812, 436], size: .55 }, t); E.flame.draw({ p: [842, 438], size: .7, dt: 300 }, t); E.flame.draw({ p: [872, 436], size: .5, dt: 700 }, t);
    E.coals.draw({ p: [782, 432], part: 'sparks', seed: 62, of: ['#fff3a0', '#ffb000'] }, t);
    // The blade's hot tip, at the weapon's point (to along the blade) and between its edges (half
    // either side), in bands that start 73, 57 and 43 short of the point. A weapon that gives no
    // blade shows none.
    if (b) {
      const to = b.to, h = b.half;
      glow(gx + (to - 31), gy, 56, '#ff8a3d', .14 + .03 * Math.sin(t / 120));
      D.dith(gx + (to - 87), gy - (h - 1), 14, 2 * h - 1, '#7a2a1d');
      for (const [x0, x1, c] of [[73, 57, '#8f231d'], [57, 43, '#cc352c'], [43, 30, '#ff5a1e']]) Rh(gx + (to - x0), gy - h, x0 - x1, 2 * h + 1, c);
      poly([[gx + (to - 30), gy - h], [gx + to, gy], [gx + (to - 30), gy + h]], '#ffb000'); poly([[gx + (to - 27), gy - (h - 7)], [gx + (to - 11), gy], [gx + (to - 27), gy + (h - 7)]], '#fff3a0');
      Rh(gx + (to - 71), gy - (h - 3), 42, 2, 'rgba(255,240,180,.55)'); Rh(gx + (to - 71), gy + (h - 6), 42, 2, 'rgba(60,10,0,.35)');
    }
    // the pie, and sparks where the hammer strikes
    KW.devices.draw(t, s);
    if (s.strike) {
      const c = (t % 1300) / 1300, q = (c > .5 ? c - .93 : c + .07) / .13;
      E.burst.draw({ p: [s.kx + 132, 418] }, q);
    }
  }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 341, y: 453, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 600, y: 300, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 676, y: 300, w: 88, h: 112 },
    h3: { cls: 'high', kind: 'surface', x: 40, y: 300, w: 88, h: 112, flip: true },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 883, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 218, y: 594, w: 132, h: 112, front: true }
  };

  KW.scenes.smithy = {
    spot: 88, places: PLACES, rests: RESTS, helmet: false,
    // The conditions this scene can act out (docs/page.md): its act sets the knight hammering
    // whatever else is up, so it acts the update alone. Kept as plain data for the world format
    // being drafted to take over.
    can: ['updating'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: [],
    key: s => Math.round(s.kx) + '|' + K.rest.key('main') + offKey(), act, paint, draw
  };
})(window.KW);
