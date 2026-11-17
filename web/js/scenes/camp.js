/* Knightwatcher scene: the camp in the woods at night, on the fine grid. A quiet scene. The scene
   interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, E = KW.effects, C = D.C;
  const { glow, Rh, ell, rrect, poly, strip, hsh, STEEL3 } = D;

  function paint() {
    const { HL, HR, HT, HH, HFL } = V;
    E.sky.draw({ p: [HL, HT], w: HR - HL, h: HFL - 80 - HT, of: ['#010404', '#020807', '#04100c', '#06170f'] }); E.stars.draw({ p: [HL, HT], w: HR - HL, h: 280 - HT });
    E.pines.draw({ p: [HL, HFL], w: HR - HL });
    E.pines.draw({ p: [HL, HFL], w: HR - HL, step: 150, phase: -40, off: [60, 60], tall: [160, 90], seed: 7, colour: '#0c2718' });
    for (const x of [-190, 30, 850, 1070]) E.tree.draw({ p: [x, HFL] });
    // the ground, a worn patch round the fire, tufts of grass
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#14200e'); Rh(HL, HFL, HR - HL, 4, '#3f7d36'); Rh(HL, HFL + 4, HR - HL, 3, '#27521f');
    ell(771, HFL + 34, 170, 24, '#231d12'); ell(771, HFL + 32, 130, 15, '#2c2416');
    E.tufts.draw({ y: HFL, bare: [600, 940] });
    // the tent
    poly([[200, HFL - 146], [64, HFL + 2], [336, HFL + 2]], C.K); poly([[200, HFL - 140], [70, HFL], [330, HFL]], [[.5, '#c7b088'], [1, '#a38d67']]);
    strip(200, HFL - 140, 136, HFL, 1.5, 1.5, '#8f7a57'); strip(200, HFL - 140, 264, HFL, 1.5, 1.5, '#7d6a4b');
    poly([[200, HFL - 96], [164, HFL], [236, HFL]], C.K); poly([[200, HFL - 96], [164, HFL], [180, HFL]], '#8f7a57');
    Rh(197, HFL - 164, 6, 26, C.N2); Rh(197, HFL - 164, 2, 26, C.N1);
    strip(70, HFL - 2, 30, HFL - 2, 1, 1, C.S3); strip(104, HFL - 76, 30, HFL - 2, 1, 1, C.S3); strip(296, HFL - 76, 370, HFL - 2, 1, 1, C.S3); Rh(26, HFL - 8, 5, 10, C.N1); Rh(368, HFL - 8, 5, 10, C.N1);
    // the bough of the right-hand tree, low over the fire, where the cat rests out of the way
    strip(852, 414, 696, 402, 8, 6, C.K); strip(851, 414, 698, 402, 6, 4, [[.3, C.N1], [1, C.N3]]); Rh(718, 398, 112, 2, C.N0);
    strip(772, 404, 752, 384, 3, 2, C.K); strip(772, 404, 753, 385, 2, 1, C.N2); ell(750, 382, 12, 7, C.K); ell(750, 382, 10, 5, '#1c4426'); ell(747, 380, 5, 2, '#2f6b3a');
    // the stone the pie warms on, the fire ring and its logs
    ell(674, HFL - 6, 46, 13, C.K); ell(674, HFL - 9, 43, 10, [[.3, C.S2], [.75, C.S3], [1, C.S4]]);
    for (let i = 0; i < 8; i++) { const sx = 722 + i * 14, sy = HFL - 3 + (i % 2) * 3; ell(sx, sy, 10, 8, C.K); ell(sx, sy - 1, 8, 6, i % 2 ? STEEL3 : [[.3, C.S2], [1, C.S4]]); }
    strip(730, HFL - 10, 816, HFL - 24, 7, 7, C.K); strip(732, HFL - 10, 814, HFL - 24, 5, 5, [[.3, C.N1], [1, C.N3]]);
    strip(816, HFL - 10, 730, HFL - 24, 7, 7, C.K); strip(814, HFL - 10, 732, HFL - 24, 5, 5, [[.3, C.N0], [1, C.N2]]);
  }

  function draw(t, s) {
    const { HL, HR, HFL } = V;
    glow(771, HFL - 40, 190, '#ffb000', .09 + .025 * Math.sin(t / 150));
    E.flame.draw({ p: [757, HFL - 16], size: 1.25 }, t); E.flame.draw({ p: [785, HFL - 14], size: 1.05, dt: 400 }, t); E.flame.draw({ p: [771, HFL - 22], size: 1.5, dt: 900 }, t);
    // the embers over the fire
    E.drift.draw({ p: [765, HFL - 80] }, t);
    KW.devices.draw(t, s);
    // the fireflies
    E.wander.draw({ p: [HL, 270], w: HR - HL, h: 200 }, t);
  }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 674, y: 517, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 926, y: 312, w: 88, h: 112, flip: true },
    h2: { cls: 'high', kind: 'surface', x: 80, y: 312, w: 88, h: 112, flip: true },
    h3: { cls: 'high', kind: 'surface', x: 227, y: 312, w: 88, h: 112, flip: true, pole: 366 },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 218, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 904, y: 594, w: 132, h: 112, front: true }
  };

  /* Where a foe may stand: left of the knight by choice, in the clear ground between the two devices
     in front of the tent and the knight, where the crate lands too. */
  const FOE_ZONE = { side: -1, spans: [[324, 470]] };

  KW.scenes.camp = {
    spot: 104, places: PLACES, outdoors: true,
    // The conditions this scene can act out (docs/page.md): the attack with the weapon raised,
    // hunger, the stare at the empty dish to the knight's right, and running hot; and, as a quiet
    // scene, a device down and memory running tight. Kept as plain data for the world format being
    // drafted to take over.
    can: ['attack', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: ['flies', 'crate', 'feast', 'foe'],
    rounds: [{ x: 104, act: 'sniff', dur: 22 }, { x: 98, act: 'yawn', dur: 14 }, { x: 101, act: 'look', dur: 16 }],
    paint, draw, foeZone: FOE_ZONE,
    // where the crate may land (docs/worlds.md): the ground between the devices before the tent and
    // the knight's boots at its leftmost spot
    crate: { span: [298, 436] }
  };
})(window.KW);
