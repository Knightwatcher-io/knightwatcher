/* Knightwatcher scene: the cellar full of crates, on the fine grid. The scene for a disk filling up.
   The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, E = KW.effects, C = D.C;
  const { glow, Rh, Rv, strip } = D;

  const WALL = ['#1b1622', '#1e1926', '#18141e', '#211b29'];
  const PIER = ['#2b2333', '#2f2738', '#272030', '#332a3d'];
  /* The crate stacks: x of each column and how many crates high, nearest the middle first. Further
     out, on a wider screen, the heights come from a hash. */
  const LEFT = [2, 6, 3, 5, 7, 4, 6], RIGHT = [5, 7, 4, 6];

  function paint() {
    const { HL, HR, HT, HH, HFL } = V;
    E.bricks.draw({ p: [HL, HT], w: HR - HL, h: HFL - HT, size: [64, 26], of: WALL, mortar: '#0d0a11', seed: 5 });
    // piers and the arches between them, every 320 pixels
    const p0 = Math.floor((HL - 140) / 320) * 320 + 140;
    for (let x = p0; x < HR + 320; x += 320) E.arch.draw({ p: [x + 178, 150], rx: 140, ry: 104, of: PIER });
    // the shelves along the back wall
    for (const [y, seed] of [[260, 1], [380, 2]]) {
      E.shelf.draw({ y, seed });
      Rh(HL, y, HR - HL, 12, C.K); Rv(HL, y + 1, HR - HL, 9, [[.3, C.N1], [1, C.N3]]);
      for (let x = Math.floor(HL / 160) * 160 + 60; x < HR; x += 160) { Rh(x, y + 12, 8, 18, C.K); Rh(x + 2, y + 12, 4, 15, C.N3); }
    }
    for (let x = p0; x < HR; x += 320) { Rh(x - 3, HT, 42, HFL - HT, C.K); E.bricks.draw({ p: [x, HT], w: 36, h: HFL - HT, size: [36, 22], of: PIER, mortar: '#120f18', seed: x }); Rh(x + 30, HT, 6, HFL - HT, 'rgba(0,0,0,.3)'); Rh(x - 8, 140, 52, 14, C.K); Rh(x - 6, 142, 48, 10, '#3b3247'); }
    // cobwebs in the corners of an arch
    for (const [x, d] of [[496, 1], [780, -1]]) for (let i = 0; i < 4; i++) { strip(x, 154, x + d * (14 + i * 14), 154 + 30 - i * 8, .5, .5, 'rgba(200,200,220,.18)'); strip(x + d * 10, 154, x + d * 4, 166, .5, .5, 'rgba(200,200,220,.18)'); }
    P.sconceHD(478, 180);
    // the flagstone floor
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#1a1620'); Rh(HL, HFL, HR - HL, 3, '#3b3247');
    for (let j = 0; j < 4; j++) { const y = HFL + 3 + j * 21; Rh(HL, y + 19, HR - HL, 2, '#0f0c13'); for (let x = Math.floor(HL / 96) * 96 + (j % 2) * 48 + j * 11; x < HR; x += 96) { Rh(x, y, 2, 19, '#0f0c13'); Rh(x + 2, y, 1, 19, '#2b2333'); } }
    // the crate stacks, high at both sides
    E.stacks.draw({ p: [290, HFL], dir: -1, heights: LEFT, seed: 21, past: 70 });
    E.stacks.draw({ p: [820, HFL], dir: 1, heights: RIGHT, seed: 22, past: 10 });
    P.barrelHD(438, 458, 84, 72);
  }

  function draw(t, s) {
    glow(478, 160, 170, '#ffb000', .09 + .025 * Math.sin(t / 150)); E.flame.draw({ p: [478, 180], size: .62 }, t);
    KW.devices.draw(t, s);
  }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 480, y: 463, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 470, y: 320, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 850, y: 300, w: 88, h: 112, pole: 280 },
    h3: { cls: 'high', kind: 'surface', x: 139, y: 300, w: 88, h: 112, flip: true, pole: 280 },
    g1: { cls: 'ground', kind: 'floor', x: 883, y: 594, w: 132, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 218, y: 594, w: 132, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 70, y: 594, w: 132, h: 112, front: true }
  };

  KW.scenes.cellar = {
    spot: 124, places: PLACES, sword: false,
    // The conditions this scene can act out (docs/page.md): the crate carried among the stacks,
    // hunger, and running hot. Not the attack, with the weapon put away, nor the stare at the empty
    // dish, which stands to the knight's left. Kept as plain data for the world format being drafted
    // to take over.
    can: ['disk_full', 'backup_overdue', 'cpu_hot'],
    rounds: [{ x: 124, act: 'guard', dur: 7 }, { x: 146, act: 'guard', dur: 7 }],
    paint, draw
  };
})(window.KW);
