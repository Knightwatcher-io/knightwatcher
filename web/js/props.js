/* Knightwatcher: the props that more than one scene uses, or that the engine draws over a scene:
   the raspberry pie (the Raspberry Pi) and the other watched things, fire, sky and stars, the
   greatsword, brick, the barrel, the table and the wall torch, and the flies, the goblin, the crate
   and its parachute. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, C = D.C;
  const { alpha, glow, Rh, Rv, ell, rrect, poly, strip, hsh, dith, GOLD, STEEL2, STEEL3 } = D;

  /* The greatsword, drawn from the middle of its grip at (gx, gy) along the angle a (0 is straight
     up): the pommel at -58, the guard at 27, the blade from 31 to its point at 270. */
  function swordHD(gx, gy, a) {
    const sx = Math.sin(a), sy = -Math.cos(a), px = -sy, py = sx, at = (s, p) => [gx + sx * s + px * p, gy + sy * s + py * p], cols = Math.abs(sx) > Math.abs(sy);
    const seg = (p, q, hw, b) => strip(p[0], p[1], q[0], q[1], hw, hw, b);
    poly([at(31, -19), at(236, -19), at(270, 0), at(236, 19), at(31, 19)], C.K, cols);
    poly([at(34, -15), at(233, -15), at(263, 0), at(233, 15), at(34, 15)], [[.16, C.S0], [.47, C.S1], [.55, C.S3], [.84, C.S2], [1, C.S3]], cols);
    seg(at(-50, 0), at(22, 0), 9, C.K); seg(at(-48, 0), at(20, 0), 6, [[.35, C.N1], [1, C.N3]]);
    for (let s = -42; s < 16; s += 10) seg(at(s, -6), at(s + 4, 6), 1.5, C.N3);
    const pm = at(-58, 0); ell(pm[0], pm[1], 13, 13, C.K); ell(pm[0], pm[1], 10, 10, GOLD);
    const g0 = at(27, -50), g1 = at(27, 50), gc = at(27, 0); seg(g0, g1, 10, C.K); seg(g0, g1, 7, GOLD);
    for (const g of [g0, g1]) { ell(g[0], g[1], 12, 12, C.K); ell(g[0], g[1], 9, 9, GOLD); }
    ell(gc[0], gc[1], 12, 12, C.K); ell(gc[0], gc[1], 9, 9, [[.3, C.G1], [1, C.G2]]); ell(gc[0], gc[1], 5, 5, C.R1); Rh(gc[0] - 3, gc[1] - 3, 2, 2, C.W);
  }
  /* Stone or brick laid in courses, filling a rectangle, each block lit on top and shaded below. */
  function bricksHD(x, y, w, h, bw, bh, cols, mortar, seed) {
    Rh(x, y, w, h, mortar);
    for (let j = 0; j * bh < h; j++) for (let i = -1; i * bw < w; i++) {
      const bx = x + i * bw + (j % 2) * bw / 2, by = y + j * bh, x0 = Math.max(x, bx + 1), x1 = Math.min(x + w, bx + bw - 1), y1 = Math.min(y + h, by + bh - 1);
      if (x1 <= x0 || y1 <= by + 1) continue;
      Rh(x0, by + 1, x1 - x0, y1 - by - 1, cols[hsh(bx + seed, j) % cols.length]); Rh(x0, by + 1, x1 - x0, 1, 'rgba(255,255,255,.06)'); Rh(x0, y1 - 1, x1 - x0, 1, 'rgba(0,0,0,.28)');
    }
  }
  /* A barrel of staves and iron hoops, its top left at (x, y). top colours the head: wood, or water. */
  function barrelHD(x, y, w, h, top) {
    rrect(x, y, w, h, 12, C.K); rrect(x + 3, y + 3, w - 6, h - 6, 10, [[.1, C.N0], [.45, C.N1], [.8, C.N2], [1, C.N3]]);
    for (let i = 1; i < 5; i++) Rh(x + 3 + Math.round((w - 6) * i / 5), y + 10, 2, h - 18, 'rgba(30,15,5,.45)');
    for (const f of [.24, .74]) { const yy = y + Math.round(h * f); rrect(x + 1, yy - 1, w - 2, 9, 3, C.K); rrect(x + 2, yy, w - 4, 6, 2, [[.15, C.S2], [.6, C.S3], [1, C.S4]]); for (const dx of [8, w - 11]) Rh(x + dx, yy + 2, 2, 2, C.S1); }
    ell(x + w / 2, y + 6, w / 2 - 2, 7, C.K); ell(x + w / 2, y + 6, w / 2 - 6, 4, top || [[.2, C.N1], [.8, C.N2], [1, C.N3]]);
  }
  /* A small wooden table, its top left at (x, y) and its feet h below. */
  function tableHD(x, y, w, h) {
    const legs = [x + 8, x + w - 22];
    for (const lx of legs) { Rh(lx - 2, y + 12, 18, h - 12, C.K); rrect(lx, y + 12, 14, h - 12, 0, [[.3, C.N1], [1, C.N3]]); }
    Rh(legs[0], y + h - 30, legs[1] - legs[0] + 14, 8, C.K); Rv(legs[0] + 2, y + h - 28, legs[1] - legs[0] + 10, 4, [[.5, C.N2], [1, C.N3]]);
    rrect(x - 4, y - 3, w + 8, 18, 4, C.K); Rv(x - 1, y, w + 2, 12, [[.25, C.N0], [.55, C.N1], [1, C.N2]]);
    for (let i = 0; i < 4; i++) Rh(x + 6 + hsh(x + i, 71) % Math.max(1, w - 30), y + 5 + (i % 2) * 3, 12 + hsh(x + i, 72) % 14, 1, C.N2);
  }
  /* A torch in an iron bracket on a wall. (x, y) is where its flame stands; flameHD draws that. */
  function sconceHD(x, y) {
    rrect(x - 9, y + 26, 18, 30, 4, C.K); rrect(x - 7, y + 28, 14, 26, 3, STEEL3); Rh(x - 2, y + 32, 3, 3, C.S1); Rh(x - 2, y + 46, 3, 3, C.S1);
    Rh(x - 5, y + 4, 10, 40, C.K); Rh(x - 3, y + 4, 6, 40, C.N2); Rh(x - 3, y + 4, 2, 40, C.N1);
    rrect(x - 13, y - 3, 26, 12, 3, C.K); rrect(x - 11, y - 1, 22, 8, 2, STEEL2);
  }
  /* A night sky in bands of colour, dithered where they meet, from the top edge down to yEnd. */
  function sky(cols, yEnd) {
    const { HL, HR, HT, HH } = V, n = cols.length, h = (yEnd - HT) / n;
    for (let i = 0; i < n; i++) { Rh(HL, HT + i * h, HR - HL, h + 1, cols[i]); if (i) dith(HL, HT + i * h - 14, HR - HL, 14, cols[i]); }
    Rh(HL, yEnd, HR - HL, HH - yEnd + 20, cols[n - 1]);
  }
  function starsHD(yMax) {
    const { HL, HR, HT } = V;
    for (let i = 0; i < 190; i++) {
      const x = HL + hsh(i, 1) % (HR - HL), y = HT + hsh(i, 2) % Math.max(1, yMax - HT), k = hsh(i, 3) % 12, c = k < 7 ? '#7f879d' : k < 11 ? '#d7deee' : '#ffffff';
      Rh(x, y, 2, 2, c); if (k === 11) { Rh(x - 3, y, 8, 2, c); Rh(x, y - 3, 2, 8, c); }
    }
  }
  function flameHD(x, y, k, t) {
    for (const [f, c, ph] of [[1, '#ff5a1e', 0], [.7, '#ffb000', 1.7], [.42, '#fff3a0', 3.1]]) {
      const h = (46 + 7 * Math.sin(t / 110 + ph)) * k * f, w = 14 * k * f, sw = Math.sin(t / 170 + ph) * 5 * k, by = y - w * .6;
      ell(x, by, w, w, c); poly([[x - w, by], [x + sw, by - h], [x + w, by]], c);
    }
  }
  /* ---- The raspberry pie ------------------------------------------------------------------------
     A fruit pie seen from the side and a little above, its middle at x + 32 and its dish standing
     on a surface at y + 31: a fluted white dish, a domed crust with a crimped edge and a lattice
     over raspberry filling, a raspberry on top, and steam, which is all that moves. With ok false
     the dish stands empty but for crumbs, under a question mark. part 'still' draws only what does
     not move, and 'moving' only the steam; the engine draws the question mark of a watched thing
     itself (see KINDS). */
  const CRUST = ['#ffd98a', '#f2ac4e', '#cc7f32', '#93521d'], FILLING = ['#d2325f', '#9a1640', '#5c0a24'];
  const DISH = [[.1, C.W], [.42, C.S0], [.74, C.S1], [1, C.S2]];
  /* The pie's top, in the dish's frame: u across from the middle, v down from the rim's middle. The
     rim is a flat ellipse, and behind its middle the crust rises in a dome. */
  const RIM = [38, 9], DOME = [32, 21], CRIMP = 35;
  const rimAt = (u, v) => (u / RIM[0]) ** 2 + (v / RIM[1]) ** 2;
  const onTop = (u, v) => rimAt(u, v) <= 1 || (v <= 0 && (u / DOME[0]) ** 2 + (v / DOME[1]) ** 2 <= 1);
  function crustAt(u, v) {
    if (!onTop(u, v)) return null;
    if (!onTop(u - 2, v) || !onTop(u + 2, v) || !onTop(u, v - 2) || !onTop(u, v + 2)) return C.K;
    const lit = -u / RIM[0] * .7 - v / DOME[1] * .5, tone = lit > .3 ? 0 : lit > -.2 ? 1 : lit > -.55 ? 2 : 3;
    // the band of crust round the rim, in front of the dome
    const r = rimAt(u, v), inDome = v < 0 && (u / DOME[0]) ** 2 + (v / DOME[1]) ** 2 <= .78;
    if (r > .55 && !inDome) return CRUST[Math.max(0, tone - (r < .75 ? 1 : 0))];
    // the lattice: two sets of strips on the diagonal, woven over and under, the filling between
    const P = 16, W = 6, a = u + v * 1.6 + 320, b = u - v * 1.6 + 320, pa = a % P, pb = b % P;
    if (pa < W || pb < W) {
      const over = pa < W && pb < W ? ((Math.floor(a / P) + Math.floor(b / P)) % 2 ? pa : pb) : pa < W ? pa : pb;
      return CRUST[Math.max(0, Math.min(3, tone + (over < 1 ? -1 : over >= W - 1 ? 1 : 0)))];
    }
    return FILLING[pa < W + 2 || pb < W + 2 ? 2 : tone < 2 ? 0 : 1];
  }
  function pieDish(cx, y) {
    poly([[cx - 38, y + 6], [cx + 38, y + 6], [cx + 33, y + 31], [cx - 33, y + 31]], C.K);
    poly([[cx - 35, y + 6], [cx + 35, y + 6], [cx + 30, y + 28], [cx - 30, y + 28]], DISH);
    for (let i = -6; i <= 6; i++) strip(cx + i * 5.3, y + 9, cx + i * 4.5, y + 27, .6, .6, i < -2 ? C.S1 : i < 3 ? C.S2 : C.S3);
  }
  function pieHD(x, y, t, ok, part) {
    const cx = x + 32, ry = y + 6;
    if (part !== 'moving') pieDish(cx, y);
    if (!ok) {
      if (part === 'moving') return;
      ell(cx, ry, 40, 10, C.K); ell(cx, ry, 37, 8, DISH); ell(cx, ry + 1, 32, 6, [[.3, C.S3], [1, C.S4]]); ell(cx, ry + 3, 27, 4, [[.3, C.S1], [1, C.S2]]);
      for (const [dx, dy, c] of [[-15, 3, CRUST[2]], [-5, 5, CRUST[1]], [8, 3, CRUST[3]], [16, 4, CRUST[2]], [1, 3, FILLING[1]], [-9, 2, FILLING[2]]]) Rh(cx + dx, ry + dy, 3, 2, c);
      Rh(cx - 46, y + 29, 3, 2, CRUST[2]); Rh(cx + 43, y + 30, 2, 2, CRUST[1]);
      if (!part && Math.floor(t / 400) % 2) SP.mark(cx, y - 62, '?');
      return;
    }
    if (part !== 'moving') pieTop(cx, ry);
    if (part === 'still') return;
    for (let i = 0; i < 3; i++) { const ph = ((t / 1800) + i / 3) % 1; alpha(.8 - ph * .8); ell(cx - 14 + i * 14 + Math.sin(ph * 7 + i * 2) * 5, ry - DOME[1] - 16 - ph * 46, 4 - ph * 2, 7, C.W); alpha(1); }
  }
  /* The whole pie's crust, crimping and raspberry, over the dish. */
  function pieTop(cx, ry) {
    D.pix(cx - RIM[0] - 3, ry - DOME[1] - 1, 2 * RIM[0] + 7, DOME[1] + RIM[1] + 3, (i, j) => crustAt(i - RIM[0] - 3, j - DOME[1] - 1));
    // the crimping along the near edge
    for (let u = -CRIMP; u <= CRIMP; u += 7) {
      const px = cx + u, py = ry + RIM[1] * Math.sqrt(1 - (u / RIM[0]) ** 2) - 1, tone = u < -12 ? 1 : u < 14 ? 2 : 3;
      ell(px, py, 5, 4, C.K); ell(px, py, 3, 2, CRUST[tone]); Rh(px - 2, py - 2, 2, 1, CRUST[tone - 1]);
    }
    // a raspberry on the top of the dome
    const bx = cx - 2, by = ry - DOME[1] - 3;
    ell(bx, by, 7, 7, C.K); ell(bx, by, 5, 5, [[.3, '#ff5c84'], [.75, '#d81e4f'], [1, '#9c0f36']]);
    for (const [dx, dy] of [[-2, -2], [2, -2], [0, 0], [-3, 2], [3, 1], [0, 3]]) Rh(bx + dx, by + dy, 1, 1, '#8a0d30');
    Rh(bx - 3, by - 4, 2, 2, C.W);
  }
  /* ---- The other watched things -------------------------------------------------------------
     Drawn as the devices they are, in the steels and whites of the palette. Each takes
     (x, y, t, ok, part) like the pie, but (x, y) is the middle of the base, the line it stands on
     (for a camera, the foot of the wall plate it hangs from), and it fits within 80 by 64 above it.
     part 'still' draws what does not move, 'moving' what does, and nothing given draws both. Each
     device has one lamp, its only moving part: while up it fades from green to black and back
     over 3.6 seconds, and while down from red to black and back over 2 seconds, a slow blink.
     A gone device stays where it is, plainly dead or broken. */
  const LAMP = { up: { rgb: [143, 224, 122], hi: '#e4ffd6', ms: 3600 }, down: { rgb: [255, 74, 61], hi: '#ffd0c8', ms: 2000 } };
  /* The lamp's dark rim, 12 by 12 around its middle (x, y): the still part. */
  function lampRim(x, y) { Rh(x - 6, y - 6, 12, 12, C.K); }
  /* The lamp itself at time t: its colour between full and black, a highlight while it is bright,
     and a soft light round it in its own colour. */
  function lampHD(x, y, t, ok) {
    const L = ok ? LAMP.up : LAMP.down, a = .5 + .5 * Math.cos(t * 2 * Math.PI / L.ms);
    glow(x, y, 20, 'rgb(' + L.rgb.join(',') + ')', .3 * a);
    Rh(x - 5, y - 5, 10, 10, 'rgb(' + L.rgb.map(v => Math.round(v * a)).join(',') + ')');
    if (a > .5) { alpha(2 * a - 1); Rh(x - 4, y - 4, 3, 3, L.hi); alpha(1); }
  }

  /* A bullet camera on a wall arm, facing left: the wall plate at the right, the arm, and the white
     body under its sunshade with the dark lens at the front and the lamp on its side. Gone: the
     body hangs straight down from the arm, dulled, its lens dark. The plate's foot is the base. */
  const CAM_LAMP = { up: [-8, -40], down: [5, -28] };
  function cameraHD(x, y, t, ok, part) {
    const lp = ok ? CAM_LAMP.up : CAM_LAMP.down;
    if (part !== 'moving') {
      rrect(x + 22, y - 64, 10, 28, 2, C.K); rrect(x + 24, y - 62, 6, 24, 1, STEEL3); Rh(x + 26, y - 59, 2, 2, C.S1); Rh(x + 26, y - 42, 2, 2, C.S1);
      strip(x + 24, y - 52, x + 8, y - 56, 4, 4, C.K); strip(x + 24, y - 52, x + 8, y - 56, 2, 2, C.S3);
      if (ok) {
        strip(x + 16, y - 46, x - 26, y - 38, 11, 11, C.K);
        strip(x + 15, y - 46, x - 25, y - 38, 9, 9, [[.12, C.W], [.5, C.S0], [.8, C.S1], [1, C.S2]]);
        strip(x + 16, y - 57, x - 34, y - 47, 4, 4, C.K); strip(x + 15, y - 57, x - 33, y - 47, 2, 2, [[.5, C.W], [1, C.S1]]);
        ell(x + 16, y - 46, 4, 9, C.K); ell(x + 16, y - 46, 2, 7, C.S2);
        ell(x - 27, y - 38, 5, 9, C.K); ell(x - 27, y - 38, 3, 6, '#24314f'); Rh(x - 28, y - 42, 1, 3, '#9fb6e8');
      } else {
        strip(x + 7, y - 52, x + 3, y - 12, 11, 11, C.K);
        strip(x + 7, y - 52, x + 3, y - 12, 9, 9, [[.15, C.S1], [.55, C.S2], [.85, C.S3], [1, C.S4]]);
        strip(x - 6, y - 51, x - 10, y - 2, 4, 4, C.K); strip(x - 6, y - 51, x - 10, y - 2, 2, 2, C.S3);
        ell(x + 7, y - 52, 9, 4, C.K); ell(x + 7, y - 52, 7, 2, C.S3);
        ell(x + 3, y - 10, 9, 5, C.K); ell(x + 3, y - 10, 6, 3, '#0e1018'); strip(x - 1, y - 12, x + 6, y - 9, .6, .6, '#3a3f52');
      }
      ell(x + 8, y - 56, 4, 4, C.K); ell(x + 8, y - 56, 2, 2, C.S2);
      lampRim(x + lp[0], y + lp[1]);
    }
    if (part !== 'still') lampHD(x + lp[0], y + lp[1], t, ok);
  }

  /* A tower case seen from the front and a little above, its side to the right. The front, the
     side and the top as the points of three faces: */
  const caseFaces = (x, y) => ({
    front: [[x - 21, y - 50], [x + 9, y - 50], [x + 9, y], [x - 21, y]],
    top: [[x - 21, y - 50], [x - 9, y - 56], [x + 21, y - 56], [x + 9, y - 50]],
    side: [[x + 9, y - 50], [x + 21, y - 56], [x + 21, y - 6], [x + 9, y]] });
  /* A grey tower case with its power lamp. Gone: the case dark, its side panel off and leant
     against it, the inside showing. */
  function machineHD(x, y, t, ok, part) {
    if (part !== 'moving') {
      if (!ok) { poly([[x + 20, y - 54], [x + 27, y - 58], [x + 40, y], [x + 31, y + 1]], C.K); poly([[x + 23, y - 53], [x + 27, y - 55], [x + 38, y - 1], [x + 33, y - 1]], [[.4, C.S4], [1, '#3a4150']], true); }
      poly([[x - 23, y + 1], [x - 23, y - 51], [x - 10, y - 58], [x + 23, y - 58], [x + 23, y - 5], [x + 10, y + 1]], C.K);
      Rv(x - 21, y - 49, 30, 49, ok ? [[.08, C.S0], [.7, C.S1], [1, C.S2]] : [[.08, C.S3], [.7, C.S4], [1, '#3a4150']]);
      poly([[x - 20, y - 51], [x - 9, y - 56], [x + 21, y - 56], [x + 10, y - 51]], ok ? C.W : C.S3);
      if (ok) {
        poly([[x + 10, y - 50], [x + 21, y - 56], [x + 21, y - 6], [x + 10, y]], [[.5, C.S2], [1, C.S3]], true);
        for (let i = 0; i < 4; i++) Rh(x + 13 + i * 2, y - 40 - i, 1, 24, C.S4);
      } else {
        poly([[x + 10, y - 49], [x + 20, y - 54], [x + 20, y - 7], [x + 10, y - 1]], '#100c16');
        poly([[x + 12, y - 44], [x + 18, y - 47], [x + 18, y - 24], [x + 12, y - 21]], '#232030'); Rh(x + 13, y - 15, 4, 6, '#232030');
      }
      const face = ok ? C.S3 : '#2e3440';
      for (const by of [y - 45, y - 38]) { Rh(x - 18, by, 24, 5, C.K); Rh(x - 17, by + 1, 22, 3, face); }
      for (let i = 0; i < 4; i++) Rh(x - 17, y - 12 + i * 3, 22, 1, face);
      lampRim(x - 6, y - 24);
    }
    if (part !== 'still') lampHD(x - 6, y - 24, t, ok);
  }

  /* The same case as a dotted outline, for a virtual machine: bright dots while up; gone, only a
     few paler dots at its corners are left. The lamp sits in the middle of its front. */
  function vmHD(x, y, t, ok, part) {
    if (part !== 'moving') {
      const f = caseFaces(x, y), dots = [];
      const edge = (a, b, ends) => {
        const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        for (let i = 0; i <= n; i++) if (!ends || i < 2 || i > n - 2) dots.push([Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n)]);
      };
      for (const k of ['front', 'top', 'side']) { const p = f[k]; for (let i = 0; i < 4; i++) edge(p[i], p[(i + 1) % 4], !ok); }
      for (const [dx, dy] of dots) Rh(dx - 2, dy - 2, 4, 4, C.K);
      for (const [dx, dy] of dots) Rh(dx - 1, dy - 1, 2, 2, ok ? C.W : C.S1);
      lampRim(x - 6, y - 24);
    }
    if (part !== 'still') lampHD(x - 6, y - 24, t, ok);
  }

  /* A plain small grey box with a lamp, for a kind the page does not know. Gone: tipped on its
     side, its lid off and lying beside it, the dark inside showing. */
  function boxHD(x, y, t, ok, part) {
    const lp = ok ? [-13, -12] : [-1, -14];
    if (part !== 'moving') {
      if (ok) {
        poly([[x - 26, y + 1], [x - 26, y - 23], [x - 17, y - 29], [x + 26, y - 29], [x + 26, y - 5], [x + 17, y + 1]], C.K);
        Rv(x - 24, y - 22, 40, 22, [[.1, C.S1], [.75, C.S2], [1, C.S3]]);
        poly([[x - 23, y - 23], [x - 16, y - 27], [x + 24, y - 27], [x + 17, y - 23]], C.S0);
        poly([[x + 17, y - 22], [x + 24, y - 27], [x + 24, y - 6], [x + 17, y - 1]], [[.5, C.S3], [1, C.S4]], true);
        for (let i = 0; i < 3; i++) Rh(x + 2, y - 16 + i * 4, 10, 1, C.S4);
      } else {
        poly([[x - 36, y + 1], [x - 36, y - 4], [x - 15, y - 13], [x - 15, y - 8]], C.K); poly([[x - 34, y - 1], [x - 34, y - 3], [x - 17, y - 10], [x - 17, y - 8]], C.S2);
        poly([[x - 14, y + 1], [x - 14, y - 41], [x - 5, y - 47], [x + 22, y - 47], [x + 22, y - 6], [x + 13, y + 1]], C.K);
        Rv(x - 12, y - 40, 24, 40, [[.1, C.S2], [.75, C.S3], [1, C.S4]]);
        poly([[x - 11, y - 42], [x - 4, y - 46], [x + 21, y - 46], [x + 14, y - 42]], '#100c16');
        poly([[x + 13, y - 40], [x + 20, y - 45], [x + 20, y - 6], [x + 13, y - 1]], [[.5, C.S4], [1, '#3a4150']], true);
        for (let i = 0; i < 3; i++) Rh(x + 4 - i * 4, y - 34, 1, 10, C.S4);
      }
      lampRim(x + lp[0], y + lp[1]);
    }
    if (part !== 'still') lampHD(x + lp[0], y + lp[1], t, ok);
  }

  /* The kinds of watched thing the page draws, by the contract's kind. draw(x, y, t, ok, part)
     draws one standing on the base (x, y), and mark is the height above the base of the top of
     the question mark the engine draws over a gone thing that alerts: its foot clears the gone
     thing by 4 pixels or more, except over the pie, whose mark stands where it always has. A kind
     not listed here is drawn as box. */
  const KINDS = {
    pi: { draw: (x, y, t, ok, part) => pieHD(x - 32, y - 31, t, ok, part), mark: 93 },
    camera: { draw: cameraHD, mark: 128 },
    machine: { draw: machineHD, mark: 122 },
    vm: { draw: vmHD, mark: 122 },
    box: { draw: boxHD, mark: 112 }
  };
  const kindOf = k => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k) ? KINDS[k] : KINDS.box);

  function crateHD(x, y) {
    Rh(x, y, 60, 50, C.K); Rh(x + 3, y + 3, 54, 44, C.N1);
    for (let j = 0; j < 3; j++) { Rh(x + 3, y + 3 + j * 15, 54, 2, C.N0); Rh(x + 3, y + 16 + j * 15, 54, 1, C.N3); }
    strip(x + 6, y + 6, x + 54, y + 44, 3, 3, C.N2); strip(x + 54, y + 6, x + 6, y + 44, 3, 3, C.N2);
    Rh(x + 3, y + 3, 6, 44, C.N2); Rh(x + 51, y + 3, 6, 44, C.N2);
    for (const [cx, cy] of [[3, 3], [49, 3], [3, 39], [49, 39]]) Rh(x + cx, y + cy, 8, 8, C.S4);
    rrect(x + 22, y + 18, 16, 14, 3, C.G2); rrect(x + 24, y + 20, 12, 10, 2, C.G1);
  }
  function flyHD(x, y, flap) { alpha(.85); ell(x - 6, y - (flap ? 6 : 2), 6, 3, C.W); ell(x + 6, y - (flap ? 6 : 2), 6, 3, C.W); alpha(1); ell(x, y, 5, 4, '#3a3344'); Rh(x - 3, y - 2, 2, 2, C.R1); }
  function poofHD(x, y) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; strip(x + Math.sin(a) * 6, y - Math.cos(a) * 6, x + Math.sin(a) * 17, y - Math.cos(a) * 17, 1.5, 1.5, '#fff3a0'); } ell(x, y, 4, 4, C.W); }
  function goblinHD(x, y) {
    const g = [[.2, '#b4f0a0'], [.7, '#8fe07a'], [1, '#5fae4f']];
    poly([[x + 2, y + 6], [x + 14, y + 26], [x + 20, y + 14]], C.K); poly([[x + 58, y + 6], [x + 46, y + 26], [x + 40, y + 14]], C.K);
    poly([[x + 5, y + 10], [x + 14, y + 23], [x + 18, y + 15]], '#5fae4f'); poly([[x + 55, y + 10], [x + 46, y + 23], [x + 42, y + 15]], '#5fae4f');
    ell(x + 30, y + 26, 22, 20, C.K); ell(x + 30, y + 26, 19, 17, g);
    for (const ex of [21, 39]) { ell(x + ex, y + 22, 6, 6, C.W); ell(x + ex + 1, y + 23, 3, 3, C.K); }
    rrect(x + 19, y + 32, 22, 8, 3, C.K); for (let i = 0; i < 4; i++) Rh(x + 21 + i * 5, y + 33, 3, 3, C.W);
  }
  function chuteHD(cx, y) {
    ell(cx, y - 44, 52, 34, C.K, null, y - 44); ell(cx, y - 44, 49, 31, [[.2, C.R1], [.4, C.W], [.6, C.R1], [.8, C.W], [1, C.R1]], null, y - 45);
    for (const dx of [-48, -18, 18, 48]) strip(cx + dx, y - 44, cx + dx * .55, y, 1, 1, C.S3);
  }

  KW.props = { swordHD, bricksHD, barrelHD, tableHD, sconceHD, sky, starsHD, flameHD, pieHD, cameraHD, machineHD, vmHD, boxHD, KINDS, kindOf, crateHD, flyHD, poofHD, goblinHD, chuteHD };
})(window.KW);
