/* Knightwatcher scene: the cellar full of crates, on the fine grid. The scene for a disk filling up.
   The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, C = D.C;
  const { glow, Rh, Rv, ell, rrect, strip, hsh } = D;

  const WALL = ['#1b1622', '#1e1926', '#18141e', '#211b29'];
  const PIER = ['#2b2333', '#2f2738', '#272030', '#332a3d'];
  /* The crate stacks: x of each column and how many crates high, nearest the middle first. Further
     out, on a wider screen, the heights come from a hash. */
  const LEFT = [2, 6, 3, 5, 7, 4, 6], RIGHT = [5, 7, 4, 6];

  /* A stone arch springing from two piers, as a ring of wedge-shaped blocks. */
  function arch(cx, cy, rx, ry) {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + Math.PI * i / n, a1 = -Math.PI / 2 + Math.PI * (i + 1) / n, am = (a0 + a1) / 2;
      const p = (a, r) => [cx + Math.sin(a) * rx * r, cy - Math.cos(a) * ry * r];
      const [x0, y0] = p(am, .93), [x1, y1] = p(am, 1.07);
      strip(x0, y0, x1, y1, 14, 14, C.K); strip(x0, y0, x1, y1, 11.5, 11.5, PIER[i % 4]);
    }
  }

  /* What stands on a shelf, one item per slot: bottles, jars and cheeses. */
  function shelfItems(y, seed) {
    for (let x = Math.floor(V.HL / 38) * 38; x < V.HR; x += 38) {
      const h = hsh(x, seed), k = h % 6, px = x + 6 + (h >>> 4) % 10;
      if (k === 0) continue;
      if (k <= 2) { const c = ['#2f6b3a', '#5c2a22', '#2a3f6b'][(h >>> 8) % 3], bh = 34 + (h >>> 10) % 10; rrect(px, y - bh, 16, bh, 5, C.K); rrect(px + 2, y - bh + 2, 12, bh - 2, 4, c); Rh(px + 5, y - bh - 10, 6, 12, C.K); Rh(px + 6, y - bh - 9, 4, 10, c); Rh(px + 4, y - bh + 6, 2, bh - 12, 'rgba(255,255,255,.25)'); }
      else if (k <= 4) { rrect(px - 2, y - 30, 24, 30, 6, C.K); rrect(px, y - 28, 20, 28, 5, [[.3, '#a08860'], [1, '#6b5638']]); Rh(px - 1, y - 34, 22, 6, C.K); Rh(px, y - 33, 20, 4, '#5a4632'); }
      else { ell(px + 12, y - 15, 16, 15, C.K, null, y - 1); ell(px + 12, y - 15, 13, 12, [[.3, '#b8a27a'], [1, '#7a6646']], null, y - 2); rrect(px + 7, y - 34, 10, 8, 3, C.K); Rh(px + 9, y - 32, 6, 5, '#8f7a57'); Rh(px + 6, y - 27, 12, 3, '#4c2e12'); }
    }
  }

  function paint() {
    const { HL, HR, HT, HH, HFL } = V;
    P.bricksHD(HL, HT, HR - HL, HFL - HT, 64, 26, WALL, '#0d0a11', 5);
    // piers and the arches between them, every 320 pixels
    const p0 = Math.floor((HL - 140) / 320) * 320 + 140;
    for (let x = p0; x < HR + 320; x += 320) arch(x + 178, 150, 140, 104);
    // the shelves along the back wall
    for (const [y, seed] of [[260, 1], [380, 2]]) {
      shelfItems(y, seed);
      Rh(HL, y, HR - HL, 12, C.K); Rv(HL, y + 1, HR - HL, 9, [[.3, C.N1], [1, C.N3]]);
      for (let x = Math.floor(HL / 160) * 160 + 60; x < HR; x += 160) { Rh(x, y + 12, 8, 18, C.K); Rh(x + 2, y + 12, 4, 15, C.N3); }
    }
    for (let x = p0; x < HR; x += 320) { Rh(x - 3, HT, 42, HFL - HT, C.K); P.bricksHD(x, HT, 36, HFL - HT, 36, 22, PIER, '#120f18', x); Rh(x + 30, HT, 6, HFL - HT, 'rgba(0,0,0,.3)'); Rh(x - 8, 140, 52, 14, C.K); Rh(x - 6, 142, 48, 10, '#3b3247'); }
    // cobwebs in the corners of an arch
    for (const [x, d] of [[496, 1], [780, -1]]) for (let i = 0; i < 4; i++) { strip(x, 154, x + d * (14 + i * 14), 154 + 30 - i * 8, .5, .5, 'rgba(200,200,220,.18)'); strip(x + d * 10, 154, x + d * 4, 166, .5, .5, 'rgba(200,200,220,.18)'); }
    P.sconceHD(478, 180);
    // the flagstone floor
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#1a1620'); Rh(HL, HFL, HR - HL, 3, '#3b3247');
    for (let j = 0; j < 4; j++) { const y = HFL + 3 + j * 21; Rh(HL, y + 19, HR - HL, 2, '#0f0c13'); for (let x = Math.floor(HL / 96) * 96 + (j % 2) * 48 + j * 11; x < HR; x += 96) { Rh(x, y, 2, 19, '#0f0c13'); Rh(x + 2, y, 1, 19, '#2b2333'); } }
    // the crate stacks, high at both sides
    for (let i = 0, x = 290; x > HL - 70; i++, x -= 70) { const n = i < LEFT.length ? LEFT[i] : 3 + hsh(i, 21) % 5; for (let k = 0; k < n; k++) P.crateHD(x + (k % 2) * 5, HFL - 50 * (k + 1)); }
    for (let i = 0, x = 820; x < HR + 10; i++, x += 70) { const n = i < RIGHT.length ? RIGHT[i] : 3 + hsh(i, 22) % 5; for (let k = 0; k < n; k++) P.crateHD(x + (k % 2) * 5, HFL - 50 * (k + 1)); }
    P.barrelHD(438, 458, 84, 72);
  }

  function draw(t, s) {
    glow(478, 160, 170, '#ffb000', .09 + .025 * Math.sin(t / 150)); P.flameHD(478, 180, .62, t);
    KW.devices.draw(t, s);
  }

  /* The places for devices (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 480, y: 463, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 450, y: 320, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 830, y: 300, w: 88, h: 112, pole: 280 },
    h3: { cls: 'high', kind: 'surface', x: 139, y: 300, w: 88, h: 112, flip: true, pole: 280 },
    g1: { cls: 'ground', kind: 'floor', x: 890, y: 568, w: 88, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 400, y: 568, w: 88, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 200, y: 568, w: 88, h: 112, front: true }
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
