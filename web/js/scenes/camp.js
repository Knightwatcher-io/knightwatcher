/* Knightwatcher scene: the camp in the woods at night, on the fine grid. A quiet scene. The scene
   interface is in docs/page.md. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, P = KW.props, C = D.C;
  const { alpha, glow, Rh, ell, rrect, poly, strip, hsh, STEEL3 } = D;

  function pineHD(x, base, h, c) {
    const n = Math.max(4, Math.round(h / 44));
    for (let i = 0; i < n; i++) { const y0 = base - h + i * (h / n) * .9, th = (h / n) * 1.7, w = 16 + (i + 1) * h * .058; poly([[x, y0], [x - w, y0 + th], [x + w, y0 + th]], c); }
  }
  function bigTree(x) {
    const { HT, HFL } = V;
    Rh(x, HT, 8, HFL - HT, C.N0); Rh(x + 8, HT, 20, HFL - HT, C.N1); Rh(x + 28, HT, 12, HFL - HT, C.N2); Rh(x + 40, HT, 8, HFL - HT, C.N3);
    for (let i = 0; i < 22; i++) Rh(x + 4 + hsh(x + i, 61) % 38, HT + hsh(x + i, 62) % (HFL - HT - 40), 2, 16 + hsh(x + i, 63) % 40, i % 3 ? C.N3 : C.N0);
    ell(x + 6, HFL - 4, 16, 9, C.N2); ell(x + 42, HFL - 3, 16, 8, C.N3);
    const leaf = ['#143a20', '#1c4426', '#245a30'];
    for (let i = 0; i < 12; i++) { const cx = x + 24 + (hsh(x + i, 64) % 280) - 140, cy = HT + 10 + hsh(x + i, 65) % 170, rx = 54 + hsh(x + i, 66) % 44; ell(cx, cy, rx, rx * .62, leaf[i % 3]); ell(cx - rx * .25, cy - rx * .2, rx * .45, rx * .22, '#2f6b3a'); }
  }

  function paint() {
    const { HL, HR, HH, HFL } = V;
    P.sky(['#010404', '#020807', '#04100c', '#06170f'], HFL - 80); P.starsHD(280);
    for (let x = Math.floor(HL / 120) * 120; x < HR; x += 120) pineHD(x + 40 + hsh(x, 5) % 50, HFL, 240 + hsh(x, 6) % 130, '#07180f');
    for (let x = Math.floor(HL / 150) * 150 - 40; x < HR; x += 150) pineHD(x + 60 + hsh(x, 7) % 60, HFL, 160 + hsh(x, 8) % 90, '#0c2718');
    for (const x of [-190, 30, 850, 1070]) bigTree(x);
    // the ground, a worn patch round the fire, tufts of grass
    Rh(HL, HFL, HR - HL, HH - HFL + 20, '#14200e'); Rh(HL, HFL, HR - HL, 4, '#3f7d36'); Rh(HL, HFL + 4, HR - HL, 3, '#27521f');
    ell(690, HFL + 34, 190, 24, '#231d12'); ell(690, HFL + 32, 150, 15, '#2c2416');
    for (let x = Math.floor(HL / 41) * 41; x < HR; x += 41) { const gx = x + hsh(x, 9) % 30, h = 8 + hsh(x, 10) % 10; if (gx > 520 && gx < 860) continue; for (const d of [-5, 0, 5]) poly([[gx + d - 2, HFL + 1], [gx + d * 1.6, HFL - h + Math.abs(d)], [gx + d + 2, HFL + 1]], d ? '#2f6b3a' : '#4f9a45'); }
    // the tent
    poly([[200, HFL - 146], [64, HFL + 2], [336, HFL + 2]], C.K); poly([[200, HFL - 140], [70, HFL], [330, HFL]], [[.5, '#c7b088'], [1, '#a38d67']]);
    strip(200, HFL - 140, 136, HFL, 1.5, 1.5, '#8f7a57'); strip(200, HFL - 140, 264, HFL, 1.5, 1.5, '#7d6a4b');
    poly([[200, HFL - 96], [164, HFL], [236, HFL]], C.K); poly([[200, HFL - 96], [164, HFL], [180, HFL]], '#8f7a57');
    Rh(197, HFL - 164, 6, 26, C.N2); Rh(197, HFL - 164, 2, 26, C.N1);
    strip(70, HFL - 2, 30, HFL - 2, 1, 1, C.S3); strip(104, HFL - 76, 30, HFL - 2, 1, 1, C.S3); strip(296, HFL - 76, 370, HFL - 2, 1, 1, C.S3); Rh(26, HFL - 8, 5, 10, C.N1); Rh(368, HFL - 8, 5, 10, C.N1);
    // the stone the pie warms on, the fire ring and its logs, the log to sit on
    ell(580, HFL - 6, 46, 13, C.K); ell(580, HFL - 9, 43, 10, [[.3, C.S2], [.75, C.S3], [1, C.S4]]);
    for (let i = 0; i < 8; i++) { const sx = 640 + i * 14, sy = HFL - 3 + (i % 2) * 3; ell(sx, sy, 10, 8, C.K); ell(sx, sy - 1, 8, 6, i % 2 ? STEEL3 : [[.3, C.S2], [1, C.S4]]); }
    strip(648, HFL - 10, 734, HFL - 24, 7, 7, C.K); strip(650, HFL - 10, 732, HFL - 24, 5, 5, [[.3, C.N1], [1, C.N3]]);
    strip(734, HFL - 10, 648, HFL - 24, 7, 7, C.K); strip(732, HFL - 10, 650, HFL - 24, 5, 5, [[.3, C.N0], [1, C.N2]]);
    rrect(760, HFL - 38, 156, 40, 16, C.K); rrect(763, HFL - 35, 150, 34, 13, C.N1); Rh(772, HFL - 35, 132, 6, C.N0); Rh(772, HFL - 9, 132, 6, C.N3);
    for (let i = 0; i < 9; i++) Rh(790 + i * 13 + hsh(i, 12) % 6, HFL - 26 + hsh(i, 13) % 12, 10, 2, C.N3);
    ell(771, HFL - 18, 11, 16, C.K); ell(771, HFL - 18, 9, 14, C.N0); ell(771, HFL - 18, 5, 9, C.N1); ell(771, HFL - 18, 2, 4, C.N2);
  }

  function draw(t, s) {
    const { HL, HR, HFL } = V;
    glow(690, HFL - 40, 190, '#ffb000', .09 + .025 * Math.sin(t / 150)); P.flameHD(676, HFL - 16, 1.25, t); P.flameHD(704, HFL - 14, 1.05, t + 400); P.flameHD(690, HFL - 22, 1.5, t + 900);
    for (let i = 0; i < 4; i++) { const ph = ((t / 2300) + i / 4) % 1; alpha(1 - ph); Rh(684 + i * 6 + Math.sin(ph * 5 + i) * 14, HFL - 80 - ph * 130, 3, 3, '#ffb000'); alpha(1); }
    KW.things.draw(t, s);
    for (let i = 0; i < 7; i++) if (((t / 900 + i * 1.3) % 4) < 1.4) { const x = HL + hsh(i, 31) % (HR - HL) + Math.sin(t / 3100 + i) * 40, y = 270 + hsh(i, 32) % 200 + Math.cos(t / 2700 + i * 2) * 24; glow(x + 1, y + 1, 9, '#fff3a0', .18); Rh(x, y, 3, 3, '#fff3a0'); }
  }

  /* The places for watched things (docs/page.md): the pie's, three high ones for cameras and three
     on the ground for the other devices. x is the middle and y the base. */
  const PLACES = {
    pie: { cls: 'pie', kind: 'surface', x: 580, y: 517, w: 88, h: 112 },
    h1: { cls: 'high', kind: 'surface', x: 852, y: 312, w: 88, h: 112 },
    h2: { cls: 'high', kind: 'surface', x: 80, y: 312, w: 88, h: 112, flip: true },
    h3: { cls: 'high', kind: 'surface', x: 227, y: 312, w: 88, h: 112, flip: true, pole: 366 },
    g1: { cls: 'ground', kind: 'floor', x: 830, y: 566, w: 88, h: 112, front: true },
    g2: { cls: 'ground', kind: 'floor', x: 120, y: 566, w: 88, h: 112, front: true },
    g3: { cls: 'ground', kind: 'floor', x: 200, y: 530, w: 88, h: 112 }
  };

  KW.scenes.camp = {
    spot: 88, places: PLACES, outdoors: true,
    rounds: [{ x: 88, act: 'sniff', dur: 22 }, { x: 68, act: 'yawn', dur: 14 }, { x: 96, act: 'look', dur: 16 }],
    paint, draw
  };
})(window.KW);
