/* Knightwatcher scene: the battlement at night, on the fine grid. A quiet scene, and the scene for an
   attack or a lost WAN, which cuts the rope of the bell. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, E = KW.effects, C = D.C;
  const { glow, Rh, ell, rrect, strip, STEEL3 } = D;

  function paint(s) {
    const { HL, HR, HT, HH, HFL } = V, wan = s.w.id === 'wan_down';
    E.sky.draw({ p: [HL, HT], w: HR - HL, h: HFL - 60 - HT, of: ['#010207', '#03050e', '#060a19', '#0a1024'] }); E.stars.draw({ p: [HL, HT], w: HR - HL, h: HFL - 170 - HT });
    E.ridge.draw({ p: [HL, HFL - 60], w: HR - HL, amp: 130, step: 96, seed: 11, colour: '#060916' }); E.ridge.draw({ p: [HL, HFL - 60], w: HR - HL, amp: 76, step: 64, seed: 23, colour: '#0a0e1f' });
    // a far keep with lit windows
    Rh(232, HFL - 196, 50, 136, '#0a0e1f'); for (let i = 0; i < 3; i++) Rh(232 + i * 19, HFL - 207, 12, 12, '#0a0e1f');
    Rh(282, HFL - 150, 86, 90, '#0a0e1f'); for (let i = 0; i < 5; i++) Rh(282 + i * 19, HFL - 159, 10, 10, '#0a0e1f');
    Rh(250, HFL - 168, 6, 11, C.G1); Rh(318, HFL - 122, 6, 10, C.G2); Rh(344, HFL - 122, 6, 10, C.G1);
    // the moon
    ell(704, 172, 35, 35, [[.35, '#fffbe0'], [.8, '#fff3a0'], [1, '#e2d17a']]); ell(720, 160, 32, 32, '#03050e');
    // the parapet and its merlons
    const stone = ['#2b2333', '#2f2738', '#272030', '#332a3d'];
    // the battlement's stone is lit a little more than the bricks' default
    E.bricks.draw({ p: [HL, HFL - 60], w: HR - HL, h: 60, size: [48, 15], of: stone, mortar: '#19141f', seed: 1, lit: .07 }); Rh(HL, HFL - 65, HR - HL, 5, '#4a3f57'); Rh(HL, HFL - 66, HR - HL, 1, '#6a5f78');
    for (let x = Math.floor(HL / 160) * 160 - 40; x < HR; x += 160) {
      E.bricks.draw({ p: [x, HFL - 112], w: 80, h: 47, size: [40, 12], of: stone, mortar: '#19141f', seed: x, lit: .07 }); Rh(x + 68, HFL - 112, 12, 47, 'rgba(0,0,0,.28)');
      Rh(x - 3, HFL - 118, 86, 6, '#4a3f57'); Rh(x - 3, HFL - 119, 86, 1, '#6a5f78');
    }
    // the walkway
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#3b3247'); Rh(HL, HFL, HR - HL, 3, '#5d5670');
    for (let j = 0; j < 4; j++) { const y = HFL + 3 + j * 22; Rh(HL, y + 20, HR - HL, 2, '#241d2c'); for (let x = Math.floor(HL / 110) * 110 + (j % 2) * 55; x < HR; x += 110) { Rh(x, y, 2, 20, '#241d2c'); Rh(x + 2, y, 1, 20, '#463c54'); } }
    // the torch on its merlon, moved right so the cat has the merlon at the left to itself
    Rh(656, HFL - 162, 8, 44, C.N2); Rh(656, HFL - 162, 3, 44, C.N1); rrect(648, HFL - 171, 24, 11, 3, C.K); rrect(650, HFL - 169, 20, 7, 2, STEEL3);
    if (wan) {
      strip(750, V.HT, 750, 262, 4, 4, [[.4, C.N0], [1, C.N2]]); for (const dx of [-5, 0, 5]) strip(750, 262, 750 + dx, 282 + Math.abs(dx), 1, 1, C.N1);
      // the length of rope on the walkway, between the knight and the devices at the right
      strip(530, HFL - 5, 646, HFL - 5, 4, 4, [[.4, C.N0], [1, C.N2]]); ell(650, HFL - 9, 7, 6, C.N1);
    }
  }

  function draw(t, s) {
    const { HL, HR, HT, HFL } = V;
    E.twinkle.draw({ p: [HL, HT], w: HR - HL, h: 300 }, t);
    glow(660, HFL - 190, 86, '#ffb000', .1 + .03 * Math.sin(t / 140)); E.flame.draw({ p: [660, HFL - 170], size: .9 }, t);
    KW.devices.draw(t, s);
    if (s.w.id === 'wan_down' && Math.floor(t / 150) % 3 === 0) { Rh(740, 290, 4, 4, '#fff3a0'); Rh(760, 300, 3, 3, '#fff3a0'); Rh(748, 306, 3, 3, C.W); }
  }

  /* A foe climbs over a merlon where one stands at x, and over the parapet between them. It comes
     up left of the knight by choice, in the clear stretch of walkway between the device at the left
     edge and the knight, where the crate lands too, and right of 290, clear of the cat on its
     merlon. */
  const FOE_ZONE = { side: -1, spans: [[290, 470]] };
  function wallAt(x) { return ((((x + 70) % 160) + 160) % 160 < 80 ? V.HFL - 119 : V.HFL - 66); }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 806, y: 416, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 926, y: 300, w: 88, h: 112, pole: 413 },
    h2: { cls: 'high', kind: 'surface', x: 636, y: 300, w: 88, h: 112, flip: true, pole: 413 },
    h3: { cls: 'high', kind: 'surface', x: 37, y: 300, w: 88, h: 112, flip: true, pole: 413 },
    g1: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 735, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 883, y: 594, w: 132, h: 112, front: true }
  };

  KW.scenes.battlement = {
    spot: 92, places: PLACES, outdoors: true,
    // The conditions this scene can act out (docs/page.md): the attack with the weapon raised, the
    // WAN's cut rope, which only it has, hunger, the stare at the empty dish to the knight's right,
    // and running hot; and, as a quiet scene, a device down and memory running tight. Kept as plain
    // data for the world format being drafted to take over.
    can: ['attack', 'wan_down', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight'],
    // the events it plays (docs/page.md): which of the flies, the crate, the feast and the foe
    hosts: ['flies', 'crate', 'feast', 'foe'],
    rounds: [{ x: 92, act: 'guard', dur: 18 }, { x: 88, act: 'look', dur: 16 }, { x: 96, act: 'sniff', dur: 12 }],
    key: s => s.w.id === 'wan_down' ? 'wan' : '', paint, draw, wallAt, foeZone: FOE_ZONE,
    // where the crate may land (docs/scenes.md): the stretch of walkway between the device at the left
    // edge and the knight's boots at its leftmost spot
    crate: { span: [150, 384] }
  };
})(window.KW);
