/* Knightwatcher scene: the training yard at night, on the fine grid. A quiet scene, where the knight
   trains on the practice dummy, and the scene for a hot CPU, where the training goes on without
   rest. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, E = KW.effects, K = KW.knight, C = D.C;
  const { glow, Rh, Rv, ell, rrect, poly, strip, hsh, STEEL, STEEL2, STEEL3 } = D;

  const STONE = ['#221d2b', '#262030', '#1f1a27', '#2a2334'];
  const STRAW = [[.2, '#f0d27a'], [.6, '#d8b45a'], [1, '#a9832f']];
  const SACK = [[.2, '#e2cf96'], [.6, '#c9b06e'], [1, '#97804a']];

  /* When the knight's sword last struck the dummy, which wobbles and sheds straw for a moment. */
  let dummyHit = -1e9;
  /* The dummy's middle, where a shot at it aims: the middle of the box the dummy is drawn in, as the
     medieval world's pack gives it (its target group). */
  const TARGET = Object.freeze([710, 380]);

  /* The knight trains: a swing every few seconds at the training spot while all is quiet, and one
     every second while the CPU runs hot. With a weapon that fires, a shot on the same beats from
     where the engine puts the knight, PRACTICE short of the dummy (KW.engine.shots), the dummy
     struck when the shot lands; running hot, once the knight has walked there. */
  /* Whether the knight trains at a stop of its patrol: while all is quiet, and while something
     streams, which the knight patrols through too. */
  const trains = s => s.w.lv === 0 || s.w.id === 'streaming';
  function act(t, s) {
    const o = s.o, here = s.here;
    if (K.fired()) {
      const shot = (t0, len) => { const l = KW.engine.shots.practice(o, t, t0, len, TARGET); if (l !== null && dummyHit < l - 1) dummyHit = l; };
      if (here && here.act === 'train' && trains(s)) { const c = here.el % 5600; if (c < 900) shot(t - c, 900); }
      if (s.w.id === 'cpu_hot') { o.eyes = 'half'; o.bob = Math.floor(t / 170) % 2; if (!o.walk) shot(t - t % 1000, 1000); }
      return;
    }
    if (here && here.act === 'train' && trains(s)) { const c = here.el % 5600; if (c < 900) { K.swing(o, c / 900, 1); if (c > 420 && t - dummyHit > 2000) dummyHit = t; } }
    if (s.w.id === 'cpu_hot') { const c = t % 1000; K.swing(o, c / 1000, 1); if (c > 470 && t - dummyHit > 600) dummyHit = t; o.eyes = 'half'; o.bob = Math.floor(t / 170) % 2; }
  }

  /* The rack of spare arms at the left: two spears and a mace. */
  function rack() {
    for (const x of [50, 180]) { rrect(x - 2, 378, 16, 152, 3, C.K); rrect(x, 380, 12, 150, 2, [[.3, C.N0], [1, C.N2]]); ell(x + 6, 376, 9, 7, C.K); ell(x + 6, 376, 6, 4, C.N1); }
    rrect(48, 398, 146, 14, 3, C.K); Rv(50, 400, 142, 10, [[.3, C.N0], [1, C.N2]]);
    const shaft = (x0, y0, x1, y1) => { strip(x0, y0, x1, y1, 4, 4, C.K); strip(x0, y0, x1, y1, 2, 2, [[.4, C.N0], [1, C.N2]]); };
    shaft(88, 526, 96, 318); poly([[96, 280], [86, 312], [96, 324], [106, 312]], C.K); poly([[96, 285], [89, 311], [96, 319], [103, 311]], STEEL); Rh(91, 318, 12, 5, C.K);
    shaft(120, 526, 120, 340); rrect(104, 316, 32, 30, 8, C.K); rrect(107, 319, 26, 24, 6, STEEL3);
    for (const [x, y] of [[100, 330], [140, 330], [120, 310]]) { poly([[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]], C.K); poly([[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], C.S2); }
    shaft(158, 526, 152, 336); poly([[152, 300], [143, 330], [152, 340], [161, 330]], C.K); poly([[152, 305], [146, 329], [152, 335], [158, 329]], STEEL); Rh(147, 336, 11, 5, C.K);
    rrect(48, 476, 146, 14, 3, C.K); Rv(50, 478, 142, 10, [[.3, C.N0], [1, C.N2]]);
  }

  /* Hay at the right: two bales on the ground and one on top. */
  function bale(x, y, w, h) {
    rrect(x, y, w, h, 5, C.K); rrect(x + 3, y + 3, w - 6, h - 6, 4, STRAW);
    for (let i = 0; i < 14; i++) Rh(x + 6 + hsh(x + i, 51) % (w - 14), y + 6 + hsh(x + i, 52) % (h - 12), 6 + hsh(x + i, 53) % 8, 1, i % 2 ? '#a9832f' : '#fff0b0');
    for (const f of [.3, .7]) Rh(x + Math.round(w * f), y + 3, 3, h - 6, '#6b4a1c');
  }

  function paint() {
    const { HL, HR, HT, HH, HFL } = V;
    E.sky.draw({ p: [HL, HT], w: HR - HL, h: 226 - HT, of: ['#020208', '#04050f', '#070917', '#0c0d20'] }); E.stars.draw({ p: [HL, HT], w: HR - HL, h: 196 - HT });
    // the curtain wall with its merlons, and a slit for archers on each side
    for (let x = Math.floor(HL / 100) * 100; x < HR; x += 100) {
      E.bricks.draw({ p: [x, 186], w: 52, h: 40, size: [26, 13], of: STONE, mortar: '#120f18', seed: x }); Rh(x + 44, 186, 8, 40, 'rgba(0,0,0,.3)');
      Rh(x - 2, 181, 56, 5, '#3b3247'); Rh(x - 2, 180, 56, 1, '#5d5670');
    }
    E.bricks.draw({ p: [HL, 226], w: HR - HL, h: HFL - 226, size: [56, 20], of: STONE, mortar: '#120f18', seed: 3 }); Rh(HL, 222, HR - HL, 5, '#3b3247'); Rh(HL, 221, HR - HL, 1, '#5d5670');
    for (const x of [112, 842]) {
      rrect(x - 12, 290, 24, 84, 4, '#3b3247'); rrect(x - 26, 318, 52, 24, 4, '#3b3247');
      Rh(x - 5, 296, 10, 72, '#05050a'); Rh(x - 20, 325, 40, 10, '#05050a');
    }
    // the door, under a stone arch
    ell(460, 360, 82, 66, '#3b3247', null, 360); Rh(378, 360, 164, 170, '#3b3247');
    for (let i = 0; i < 9; i++) { const a = -1.4 + i * .35; Rh(460 + Math.sin(a) * 76 - 1, 360 - Math.cos(a) * 60 - 1, 3, 3, '#1c1824'); }
    ell(460, 362, 70, 56, C.K, null, 362); Rh(390, 362, 140, 168, C.K);
    ell(460, 364, 66, 52, [[.15, C.N0], [.5, C.N1], [.85, C.N2], [1, C.N3]], null, 364); rrect(394, 364, 132, 166, 0, [[.15, C.N0], [.5, C.N1], [.85, C.N2], [1, C.N3]]);
    for (let x = 416; x < 520; x += 22) Rh(x, 316 + Math.abs(x - 460) * .6, 2, 530 - 316 - Math.abs(x - 460) * .6, C.N3);
    for (const y of [394, 470]) { Rh(394, y, 132, 9, C.K); Rh(394, y + 2, 132, 5, C.S4); Rh(394, y + 2, 132, 1, C.S3); for (let x = 404; x < 520; x += 24) Rh(x, y + 3, 3, 3, C.S1); }
    ell(500, 440, 9, 9, C.K); ell(500, 440, 6, 6, C.G1); ell(500, 440, 3, 3, C.K);
    P.sconceHD(346, 330);
    // the ground: beaten earth, pebbles and a few tufts against the wall
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#221c13'); Rh(HL, HFL, HR - HL, 3, '#4a3d28'); Rh(HL, HFL + 3, HR - HL, 3, '#33291b');
    for (let x = Math.floor(HL / 23) * 23; x < HR; x += 23) { const px = x + hsh(x, 3) % 17, py = HFL + 10 + hsh(x, 4) % 56; ell(px, py, 3 + hsh(x, 5) % 3, 2, hsh(x, 6) % 2 ? '#3a3020' : '#2e2619'); Rh(px - 2, py - 1, 2, 1, '#4f4330'); }
    E.tufts.draw({ y: HFL, step: 67, spread: 40, seed: 7, tall: [6, 8], gap: 4, lean: 1.5, colour: '#2a4a22', light: '#3f6b33' });
    ell(690, HFL + 30, 150, 16, '#1b160f');
    rack();
    // the barrel the pie stands on, in front of the rack between the two devices at the left, and the hay
    P.barrelHD(102, 434, 84, 96);
    bale(828, 474, 66, 56); bale(890, 474, 66, 56); bale(856, 424, 68, 52);
    // the dummy's post, which stays put while the dummy wobbles on it
    rrect(704, 440, 18, 90, 3, C.K); rrect(707, 440, 12, 90, 2, [[.3, C.N0], [1, C.N2]]); ell(713, 528, 22, 5, C.K);
  }

  /* The practice dummy, leaning by wob pixels at the top, and the straw it sheds when struck. */
  function dummy(t) {
    const a = t - dummyHit, w = a < 900 ? Math.round(Math.sin(a / 60) * 15 * (1 - a / 900)) : 0;
    strip(713, 450, 713 + w * .8, 330, 6, 6, C.K); strip(713, 450, 713 + w * .8, 330, 4, 4, [[.3, C.N0], [1, C.N2]]);
    strip(646 + w, 357, 780 + w, 357, 8, 8, C.K); strip(648 + w, 357, 778 + w, 357, 5, 5, [[.3, C.N0], [1, C.N2]]);
    for (const [x, d] of [[646, -1], [780, 1]]) for (let k = -1; k <= 1; k++) poly([[x + w, 352 + k * 4], [x + w + d * 14, 349 + k * 7], [x + w, 360 + k * 4]], k ? '#d8b45a' : '#f0d27a');
    rrect(673 + w, 364, 80, 92, 24, C.K); rrect(676 + w, 367, 74, 86, 21, SACK);
    for (const y of [384, 434]) { Rh(678 + w, y, 70, 4, '#6b4a1c'); Rh(678 + w, y, 70, 1, '#8f6a2a'); }
    for (let k = 0; k < 5; k++) poly([[684 + w + k * 13, 450], [690 + w + k * 13, 464 + (k % 2) * 6], [696 + w + k * 13, 450]], k % 2 ? '#d8b45a' : '#f0d27a');
    rrect(704 + w, 354, 18, 14, 3, '#6b4a1c');
    ell(713 + w, 328, 30, 29, C.K); ell(713 + w, 328, 27, 26, SACK);
    for (const ex of [702, 724]) { strip(ex - 5 + w, 318, ex + 5 + w, 328, 1.5, 1.5, C.K); strip(ex - 5 + w, 328, ex + 5 + w, 318, 1.5, 1.5, C.K); }
    Rh(700 + w, 340, 26, 2, C.K); for (let i = 0; i < 5; i++) Rh(702 + w + i * 5, 337, 2, 8, C.K);
    poly([[703 + w, 302], [713 + w, 290], [723 + w, 302]], '#d8b45a');
    rrect(626 + w, 334, 46, 56, 12, C.K); rrect(629 + w, 337, 40, 50, 10, [[.2, C.R0], [.6, C.R1], [1, C.R2]]);
    ell(649 + w, 362, 12, 12, C.W); ell(649 + w, 362, 8, 8, C.R1); ell(649 + w, 362, 4, 4, C.W);
    E.burst.draw({ p: [670, 380], n: 5, piece: 'straw', of: ['#f0d27a', '#d8b45a'] }, a);
  }

  function draw(t, s) {
    glow(346, 314, 120, '#ffb000', .09 + .025 * Math.sin(t / 140)); E.flame.draw({ p: [346, 330], size: .62 }, t);
    KW.devices.draw(t, s);
    dummy(t);
  }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 144, y: 439, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 926, y: 360, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 250, y: 310, w: 88, h: 112, flip: true },
    h3: { cls: 'high', kind: 'surface', x: 40, y: 300, w: 88, h: 112, flip: true },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 218, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 883, y: 594, w: 132, h: 112, front: true }
  };

  KW.scenes.yard = {
    spot: 104, places: PLACES, outdoors: true,
    // The conditions this scene can act out (docs/page.md): the attack with the weapon raised, the
    // crate carried between its spots, whose acts leave the knight's face alone, hunger, and running
    // hot at the dummy; and, as a quiet scene, a device down, memory running tight and a stream on
    // the television. Not the stare at the empty dish: the pie stands to the knight's left. Kept as
    // plain data for the world format being drafted to take over.
    can: ['attack', 'disk_full', 'backup_overdue', 'device_down', 'cpu_hot', 'memory_tight', 'streaming'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: ['flies', 'crate', 'feast'],
    // the stops of the knight's patrol (docs/page.md): training at the dummy, a look round by the door
    rounds: [{ x: 104, act: 'train', dur: 22 }, { x: 88, act: 'look', dur: 14 }],
    // where the television stands while something streams (docs/scenes.md): its middle, what it
    // stands on, and where the knight watches it from, in units of U as the spot
    tv: { x: 330, stand: 'table', watch: 90 },
    act, paint, draw,
    // where a shot at the dummy aims, and so where the knight trains from with a weapon that fires
    target: TARGET,
    // the moment the dummy was last struck, for the tests
    struck: () => dummyHit,
    // where the crate may land (docs/scenes.md): the beaten earth in front of the door, between the
    // devices by the rack and the knight's boots at the dummy
    crate: { span: [298, 436] }
  };
})(window.KW);
