/* Knightwatcher scene: the battlement at night, on the fine grid. A quiet scene, and the scene for an
   attack or a lost WAN, which cuts the rope of the bell. The scene interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, C = D.C;
  const { glow, Rh, ell, rrect, strip, hsh, STEEL3 } = D;

  function ridge(base, amp, step, seed, c) {
    for (let x = Math.floor(V.HL); x < V.HR; x++) {
      const i = Math.floor((x + 4000) / step), f = ((x + 4000) % step) / step, a = hsh(i, seed) % amp, b = hsh(i + 1, seed) % amp;
      Rh(x, base - (a + (b - a) * f), 1, amp + 2, c);
    }
  }
  function bricks(x, y, w, h, bw, bh, cols, mortar, seed) {
    Rh(x, y, w, h, mortar);
    for (let j = 0; j * bh < h; j++) for (let i = -1; i * bw < w; i++) {
      const bx = x + i * bw + (j % 2) * bw / 2, by = y + j * bh, x0 = Math.max(x, bx + 1), x1 = Math.min(x + w, bx + bw - 1), y1 = Math.min(y + h, by + bh - 1);
      if (x1 <= x0 || y1 <= by + 1) continue;
      Rh(x0, by + 1, x1 - x0, y1 - by - 1, cols[hsh(bx + seed, j) % cols.length]); Rh(x0, by + 1, x1 - x0, 1, 'rgba(255,255,255,.07)'); Rh(x0, y1 - 1, x1 - x0, 1, 'rgba(0,0,0,.28)');
    }
  }

  function paint(s) {
    const { HL, HR, HH, HFL } = V, wan = s.w.id === 'wan_down';
    P.sky(['#010207', '#03050e', '#060a19', '#0a1024'], HFL - 60); P.starsHD(HFL - 170);
    ridge(HFL - 60, 130, 96, 11, '#060916'); ridge(HFL - 60, 76, 64, 23, '#0a0e1f');
    // a far keep with lit windows
    Rh(232, HFL - 196, 50, 136, '#0a0e1f'); for (let i = 0; i < 3; i++) Rh(232 + i * 19, HFL - 207, 12, 12, '#0a0e1f');
    Rh(282, HFL - 150, 86, 90, '#0a0e1f'); for (let i = 0; i < 5; i++) Rh(282 + i * 19, HFL - 159, 10, 10, '#0a0e1f');
    Rh(250, HFL - 168, 6, 11, C.G1); Rh(318, HFL - 122, 6, 10, C.G2); Rh(344, HFL - 122, 6, 10, C.G1);
    // the moon
    ell(704, 172, 35, 35, [[.35, '#fffbe0'], [.8, '#fff3a0'], [1, '#e2d17a']]); ell(720, 160, 32, 32, '#03050e');
    // the parapet and its merlons
    const stone = ['#2b2333', '#2f2738', '#272030', '#332a3d'];
    bricks(HL, HFL - 60, HR - HL, 60, 48, 15, stone, '#19141f', 1); Rh(HL, HFL - 65, HR - HL, 5, '#4a3f57'); Rh(HL, HFL - 66, HR - HL, 1, '#6a5f78');
    for (let x = Math.floor(HL / 160) * 160 - 40; x < HR; x += 160) {
      bricks(x, HFL - 112, 80, 47, 40, 12, stone, '#19141f', x); Rh(x + 68, HFL - 112, 12, 47, 'rgba(0,0,0,.28)');
      Rh(x - 3, HFL - 118, 86, 6, '#4a3f57'); Rh(x - 3, HFL - 119, 86, 1, '#6a5f78');
    }
    // the walkway
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#3b3247'); Rh(HL, HFL, HR - HL, 3, '#5d5670');
    for (let j = 0; j < 4; j++) { const y = HFL + 3 + j * 22; Rh(HL, y + 20, HR - HL, 2, '#241d2c'); for (let x = Math.floor(HL / 110) * 110 + (j % 2) * 55; x < HR; x += 110) { Rh(x, y, 2, 20, '#241d2c'); Rh(x + 2, y, 1, 20, '#463c54'); } }
    // the torch on its merlon
    Rh(156, HFL - 162, 8, 44, C.N2); Rh(156, HFL - 162, 3, 44, C.N1); rrect(148, HFL - 171, 24, 11, 3, C.K); rrect(150, HFL - 169, 20, 7, 2, STEEL3);
    if (wan) {
      strip(750, V.HT, 750, 262, 4, 4, [[.4, C.N0], [1, C.N2]]); for (const dx of [-5, 0, 5]) strip(750, 262, 750 + dx, 282 + Math.abs(dx), 1, 1, C.N1);
      strip(610, HFL - 5, 770, HFL - 5, 4, 4, [[.4, C.N0], [1, C.N2]]); ell(774, HFL - 9, 7, 6, C.N1);
    }
  }

  function draw(t, s) {
    const { HL, HR, HT, HFL } = V;
    for (let i = 0; i < 14; i++) if (((t / 1100 + i * .7) % 6) < .9) Rh(HL + hsh(i, 41) % (HR - HL), HT + hsh(i, 42) % 300, 3, 3, C.W);
    glow(160, HFL - 190, 86, '#ffb000', .1 + .03 * Math.sin(t / 140)); P.flameHD(160, HFL - 170, .9, t);
    KW.things.draw(t, s);
    if (s.w.id === 'wan_down' && Math.floor(t / 150) % 3 === 0) { Rh(740, 290, 4, 4, '#fff3a0'); Rh(760, 300, 3, 3, '#fff3a0'); Rh(748, 306, 3, 3, C.W); }
  }

  /* A foe climbs over a merlon where one stands at x, and over the parapet between them. It may
     stand anywhere along the walkway, right of the knight by choice. */
  const FOE_ZONE = { side: 1, spans: [[70, 890]] };
  function wallAt(x) { return ((((x + 70) % 160) + 160) % 160 < 80 ? V.HFL - 119 : V.HFL - 66); }

  /* The places for watched things (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 800, y: 416, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 926, y: 300, w: 88, h: 112, pole: 413 },
    h2: { cls: 'high', kind: 'surface', x: 858, y: 300, w: 88, h: 112, pole: 466 },
    h3: { cls: 'high', kind: 'surface', x: 37, y: 300, w: 88, h: 112, flip: true, pole: 413 },
    g1: { cls: 'ground', kind: 'floor', x: 150, y: 566, w: 88, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 820, y: 566, w: 88, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 60, y: 566, w: 88, h: 112, front: true }
  };

  KW.scenes.battlement = {
    spot: 96, places: PLACES, outdoors: true,
    rounds: [{ x: 96, act: 'guard', dur: 18 }, { x: 66, act: 'look', dur: 16 }, { x: 126, act: 'sniff', dur: 12 }],
    key: s => s.w.id === 'wan_down' ? 'wan' : '', paint, draw, wallAt, foeZone: FOE_ZONE
  };
})(window.KW);
