/* Knightwatcher: the props that more than one scene uses, or that the engine draws over a scene:
   the raspberry pie (the Raspberry Pi) and the other devices, the greatsword, the barrel, the
   table and the wall torch, the flies, the crate and its parachute, and the foes (the goblin) with
   the smoke, the sparkles and the hole they come and go by. Fire, sky, stars, brick and the pie's
   steam are effects, in effects.js. */
(function (KW) {
  'use strict';
  const D = KW.draw, SP = KW.sprites, C = D.C;
  const { alpha, glow, Rh, Rv, ell, rrect, poly, strip, hsh, GOLD, STEEL2, STEEL3 } = D;

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
  /* Stone or brick laid in courses: the bricks effect (effects.js), under the name and in the order
     of arguments the settings screen's and the admin page's previews call it by. */
  function bricksHD(x, y, w, h, bw, bh, cols, mortar, seed) { KW.effects.bricks.draw({ p: [x, y], w, h, size: [bw, bh], of: cols, mortar, seed }); }
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
  /* A torch in an iron bracket on a wall. (x, y) is where its flame stands; the flame effect draws that. */
  function sconceHD(x, y) {
    rrect(x - 9, y + 26, 18, 30, 4, C.K); rrect(x - 7, y + 28, 14, 26, 3, STEEL3); Rh(x - 2, y + 32, 3, 3, C.S1); Rh(x - 2, y + 46, 3, 3, C.S1);
    Rh(x - 5, y + 4, 10, 40, C.K); Rh(x - 3, y + 4, 6, 40, C.N2); Rh(x - 3, y + 4, 2, 40, C.N1);
    rrect(x - 13, y - 3, 26, 12, 3, C.K); rrect(x - 11, y - 1, 22, 8, 2, STEEL2);
  }
  /* The lamps' colours and loops, the devices' and the pie's: while up from green to black
     and back over 3.6 seconds, while down from red to black and back over 2 seconds. lampLevel
     is how bright the loop is at time t, from 1 at t 0 to 0 at half the period. */
  const LAMP = { up: { rgb: [143, 224, 122], hi: '#e4ffd6', ms: 3600 }, down: { rgb: [255, 74, 61], hi: '#ffd0c8', ms: 2000 } };
  const lampLevel = (t, ok) => .5 + .5 * Math.cos(t * 2 * Math.PI / (ok ? LAMP.up : LAMP.down).ms);

  /* ---- The raspberry pie ------------------------------------------------------------------------
     A fruit pie seen from the side and a little above, its middle at x + 32 and its dish standing
     on a surface at y + 31: a fluted white dish, a domed crust with a crimped edge and a lattice
     over raspberry filling, and steam. Its lamp is the filling seen through the gaps of the
     lattice, which lights red on the loop every device lamp keeps (PIE_LAMP, below). With ok false
     the dish stands empty but for crumbs and the last slice, unlit and without steam, under a
     question mark.
     part 'still' draws only what does not move, and 'moving' only the steam and the lamp; the
     engine draws the question mark of a device itself (see KINDS). */
  const CRUST = ['#ffd98a', '#f2ac4e', '#cc7f32', '#93521d'], FILLING = ['#d2325f', '#9a1640', '#5c0a24'];
  const DISH = [[.1, C.W], [.42, C.S0], [.74, C.S1], [1, C.S2]];
  /* The dish's flutes, from the left: thirteen grooves, the effect flutes (effects.js) with its
     own spacing, 5.3 across at the rim and 4.5 at the foot. */
  const FLUTES = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map(i => (i < -2 ? C.S1 : i < 3 ? C.S2 : C.S3));
  /* The pie's top, in the dish's frame: u across from the middle, v down from the rim's middle. The
     rim is a flat ellipse, and behind its middle the crust rises in a dome, crimped along its near
     edge CRIMP either side of the middle: the effect crust (effects.js) draws it. */
  const RIM = [38, 9], DOME = [32, 21], CRIMP = 35;
  /* The steam rises from the top of the dome: its puffs start 7 above it, 53 above the base. */
  const STEAM_RISE = 7;
  function pieDish(cx, y) {
    poly([[cx - 38, y + 6], [cx + 38, y + 6], [cx + 33, y + 31], [cx - 33, y + 31]], C.K);
    poly([[cx - 35, y + 6], [cx + 35, y + 6], [cx + 30, y + 28], [cx - 30, y + 28]], DISH);
    KW.effects.flutes.draw({ p: [cx, y + 9], of: FLUTES });
  }
  function pieHD(x, y, t, ok, part) {
    const cx = x + 32, ry = y + 6, by = y + 31;
    if (part !== 'moving') pieDish(cx, y);
    if (!ok) {
      if (part !== 'moving') {
        ell(cx, ry, 40, 10, C.K); ell(cx, ry, 37, 8, DISH); ell(cx, ry + 1, 32, 6, [[.3, C.S3], [1, C.S4]]); ell(cx, ry + 3, 27, 4, [[.3, C.S1], [1, C.S2]]);
        for (const [dx, dy, c] of [[-15, 3, CRUST[2]], [-5, 5, CRUST[1]], [-9, 2, FILLING[2]]]) Rh(cx + dx, ry + dy, 3, 2, c);
        Rh(cx - 46, y + 29, 3, 2, CRUST[2]); Rh(cx + 43, y + 30, 2, 2, CRUST[1]);
        const s = pieShapes().slice;
        D.pix(cx + s.x0, by + s.y0, s.w, s.h, (i, j) => s.cells[j * s.w + i]);
      }
      if (!part && Math.floor(t / 400) % 2) SP.mark(cx, y - 62, '?');
      return;
    }
    if (part !== 'moving') pieTop(cx, ry);
    if (part === 'still') return;
    KW.effects.steam.draw({ p: [cx - 14, ry - DOME[1] - STEAM_RISE] }, t);
    ownLampHD(PIE_LAMP.up, cx, by, t, true);
  }
  /* The whole pie's crust and crimping, over the dish. */
  function pieTop(cx, ry) { KW.effects.crust.draw({ p: [cx, ry], rim: RIM, dome: DOME, crimp: CRIMP, crust: CRUST, filling: FILLING }); }

  /* ---- The pie's lamp ----------------------------------------------------------------------------
     The pie's lamp is a lamp of its own, as a world pack gives one ({ at, box, lit, dark, light },
     docs/worlds.md): two drawings, dark and lit, of the same pixels, painted once each into a canvas
     of their own, and each frame a soft light of radius 24 round the lamp's middle at 0.3 of the
     loop's level, the dark drawing, and the lit one over it at the loop's level, as world.js draws
     a pack's. Its pixels are the filling the crust paints in the gaps of the lattice, lit in the
     down lamp's reds and dark near black. Gone, the pie has no lamp: the last slice is unlit.
     Each pixel is a key: a the filling's lit side, b its shaded side, e its edge in the shadow of a
     strip, and h a highlight, a lit pixel with the edge to its left and above it. */
  const rgb = (c, k) => 'rgb(' + c.map(v => Math.round(v * k)).join(',') + ')';
  /* The down lamp's reds, as a world pack names them in a lamp of its own: the red, the red at two
     thirds and the highlight (@lamp.down, @lamp.downLo and @lamp.downHi). */
  const LAMP_REDS = Object.freeze({ down: rgb(LAMP.down.rgb, 1), downLo: rgb(LAMP.down.rgb, .66), downHi: LAMP.down.hi });
  /* The lamp's middle from the base, its colours, and the light round it, the down lamp's red as a
     hex colour, as a world pack gives a light. Its dark drawing is a dimmer red, never unlit: at
     the low point of its pulse the pie still reads as lit, as every lamp up does. */
  const PIE_LAMP = Object.freeze({
    up: { at: [1, -30], lit: { a: LAMP_REDS.down, b: LAMP_REDS.downLo, e: '#6a1f1a', h: LAMP_REDS.downHi }, dark: { a: LAMP_REDS.downLo, b: '#6e2019', e: '#3e120e', h: '#d06a5e' },
      light: '#ff4a3d', map: () => pieShapes().lattice }
  });
  /* The lamp L standing on the base (x, y) at time t: its canvases, painted once, its light and its
     two drawings. */
  const lampSprites = new Map();
  function ownLampHD(L, x, y, t, ok) {
    let sp = lampSprites.get(L);
    if (!sp) {
      const m = L.map(), paint = cols => {
        const cv = document.createElement('canvas'), was = D.getCtx(); cv.width = m.w; cv.height = m.h;
        D.setCtx(cv.getContext('2d')); D.pix(0, 0, m.w, m.h, (i, j) => { const k = m.keys[j * m.w + i]; return k ? cols[k] || L.dark[k] : null; }); D.setCtx(was);
        return cv;
      };
      sp = { dark: paint(L.dark), lit: paint(L.lit), x0: m.x0 - L.at[0], y0: m.y0 - L.at[1] };
      lampSprites.set(L, sp);
    }
    const a = lampLevel(t, ok), ctx = D.getCtx(), lx = x + L.at[0], ly = y + L.at[1], px = Math.round(lx) + sp.x0, py = Math.round(ly) + sp.y0;
    glow(lx, ly, 24, L.light, .3 * a);
    ctx.drawImage(sp.dark, px, py);
    alpha(a); ctx.drawImage(sp.lit, px, py); alpha(1);
  }

  /* ---- The shapes of the lamp and the last slice ---------------------------------------------------
     Each is a map of keys over a box, { x0, y0, w, h, keys }, x0 and y0 its corner from the base,
     trimmed to what it holds. Worked out once, the first time the pie is drawn.
     The lattice: the filling the crust effect paints, read from the effect itself so that the lamp
     always lies exactly in the gaps of its lattice: a pixel painted in FILLING[0] is a, FILLING[1]
     b, FILLING[2] e.
     The last slice: a wedge lying in the empty dish, its point to the left near the dish's middle
     and its outer crust to the right, seen from the front and a little above: the top a triangle
     of lattice with a band of crust along the outer edge, and the cut face in front, a layer of
     filling between the top crust and the bottom crust. The dish's near rim hides what lies below
     it. Its still drawing is the whole slice, its lamp the filling in its gaps and on its cut face. */
  const SLICE = { tip: [-12, -2], back: [12, -7], front: [19, 1], depth: 7, lattice: { period: 11, width: 4, slope: 1.6, shift: 330 } };
  let pieMaps = null;
  function pieShapes() {
    if (pieMaps) return pieMaps;
    // the crust drawn with the rim's middle at (0, 0) into a context that keeps each pixel's colour
    const at = new Map(), rec = { fillStyle: null, globalAlpha: 1, fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) at.set((x + i) + ',' + (y + j), this.fillStyle); } };
    const was = D.getCtx(); D.setCtx(rec); pieTop(0, 0); D.setCtx(was);
    const fill = { [FILLING[0]]: 'f0', [FILLING[1]]: 'f1', [FILLING[2]]: 'f2' };
    // the lattice's filling in the base's frame: the rim's middle is 25 above the base
    const top = (u, v) => fill[at.get(u + ',' + (v + 25))] || null;
    const lattice = trim(-RIM[0] - 3, -25 - DOME[1] - 1, 2 * RIM[0] + 7, DOME[1] + RIM[1] + 3, (u, v) => lampKey(top, u, v));
    // the slice, in the base's frame
    const sk = (u, v) => sliceKey(u, v + 25);
    const slice = trim(-RIM[0], -25 - 14, 2 * RIM[0], 28, sk), still = { x0: slice.x0, y0: slice.y0, w: slice.w, h: slice.h, cells: slice.keys.map(k => (k ? SLICE_COLOURS[k] : null)) };
    const sliceLamp = trim(-RIM[0], -25 - 14, 2 * RIM[0], 28, (u, v) => lampKey(sk, u, v));
    return (pieMaps = { lattice, slice: still, sliceLamp });
  }
  /* The lamp's key at (u, v) of a map whose keys f gives as f0, f1 and f2. */
  function lampKey(f, u, v) {
    const k = f(u, v);
    if (k === 'f0') return f(u - 1, v) === 'f2' && f(u, v - 1) === 'f2' ? 'h' : 'a';
    return k === 'f1' ? 'b' : k === 'f2' ? 'e' : null;
  }
  /* The keys k(u, v) gives over the box from (x0, y0), w by h, trimmed to those it gives. */
  function trim(x0, y0, w, h, k) {
    let i0 = w, j0 = h, i1 = -1, j1 = -1;
    const all = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = k(x0 + i, y0 + j); all.push(v); if (v) { i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j); } }
    const keys = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) keys.push(all[j * w + i]);
    return { x0: x0 + i0, y0: y0 + j0, w: i1 - i0 + 1, h: j1 - j0 + 1, keys };
  }
  const SLICE_COLOURS = { O: C.K, c0: CRUST[0], c1: CRUST[1], c2: CRUST[2], c3: CRUST[3], f0: FILLING[0], f1: FILLING[1], f2: FILLING[2] };
  /* Which side of the line from a to b the point p lies. */
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  /* What the slice is at (u, v) from the rim's middle: 'top', 'face' with its depth below the top's
     front edge, 'end', or null. */
  function slicePart(u, v) {
    const { tip, back, front, depth } = SLICE, p = [u, v], d1 = cross(tip, back, p), d2 = cross(back, front, p), d3 = cross(front, tip, p);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 'top';
    if (u >= tip[0] && u <= front[0]) { const y = tip[1] + (front[1] - tip[1]) * (u - tip[0]) / (front[0] - tip[0]); if (v > y && v <= y + depth) return 'face' + (v - y); }
    if (u >= back[0] && u <= front[0] && u > front[0] - 3) { const y = back[1] + (front[1] - back[1]) * (u - back[0]) / (front[0] - back[0]); if (v > y && v <= y + depth) return 'end'; }
    return null;
  }
  /* What the dish's near rim leaves showing: above the front edge of its inside. */
  const aboveRim = (u, v) => Math.abs(u) < 32 && v <= 1 + 6 * Math.sqrt(1 - (u / 32) ** 2);
  /* The slice's key at (u, v) from the rim's middle: O its outline, c0 to c3 the crust, f0 to f2 the
     filling. */
  function sliceKey(u, v) {
    const s = slicePart(u, v), inside = (du, dv) => slicePart(u + du, v + dv) !== null;
    if (!s) return (inside(-1, 0) || inside(1, 0) || inside(0, -1) || inside(0, 1)) && aboveRim(u, v) ? 'O' : null;
    if (!aboveRim(u, v)) return null;
    if (!inside(-1, 0) || !inside(1, 0) || !inside(0, -1) || !inside(0, 1)) return 'O';
    if (s === 'end') return 'c2';
    if (s !== 'top') { const d = +s.slice(4); return d < 2 ? 'c1' : d < 3 ? 'f0' : d < 5 ? 'f1' : 'c3'; }
    // the top: a band of crust along the outer edge, and the lattice over the rest
    const edge = Math.abs(cross(SLICE.back, SLICE.front, [u, v])) / Math.hypot(SLICE.front[0] - SLICE.back[0], SLICE.front[1] - SLICE.back[1]);
    if (edge < 3) return edge < 1.5 ? 'c1' : 'c2';
    const L = SLICE.lattice, a = (u + v * L.slope + L.shift) % L.period, b = (u - v * L.slope + L.shift) % L.period;
    if (a < L.width || b < L.width) return a < 1 || b < 1 ? 'c0' : 'c1';
    return a < L.width + 1 || b < L.width + 1 ? 'f2' : 'f0';
  }

  /* ---- The other devices -------------------------------------------------------------
     In the medieval world each kind is drawn as a medieval thing that stands for it, by the
     owner's choices of 16 and 17 November 2026: the camera a barn owl on watch on an iron bracket,
     the machine a scrying crystal in a gilt claw stand, the virtual machine a corked potion flask,
     and a kind the page does not know an iron-bound chest. Each takes (x, y, t, ok, part) like the
     pie, but (x, y) is the middle of the base, the line it stands on (for the owl, the foot of the
     wall plate its bracket hangs from). The owl fits within the high class's box, the others
     within the ground class's, [-66, -93, 56, 2] from the base. part 'still' draws what does not
     move, 'moving' what does, and nothing given draws both. A device's light is a lamp of its own
     (ownLampHD), its only moving part: the owl's eyes, glowing amber; the crystal's ball, pale
     blue-white; the flask's potion, blue; and the jewel in the chest's lock, gold. Up, each pulses
     from its full colour to a dimmer one of the same hue and back over 3.6 seconds, never unlit.
     Gone, a device has no lamp and stays where it is, plainly knocked over or broken and unlit: the
     owl's eyes are dazed spirals, the chest's jewel dark glass, the crystal's ball dark and cracked
     and the flask's potion spilt and dark. Nothing of it blinks; the question mark over it carries
     the alert. */
  /* The lamp's dark rim, 12 by 12 around its middle (x, y): the still part of the engine's own
     lamp, which a world pack's kind may still name by a point (world.js). */
  function lampRim(x, y) { Rh(x - 6, y - 6, 12, 12, C.K); }
  /* The engine's own lamp at time t: its colour between full and black, a highlight while it is
     bright, and a soft light round it in its own colour. */
  function lampHD(x, y, t, ok) {
    const L = ok ? LAMP.up : LAMP.down, a = lampLevel(t, ok);
    glow(x, y, 20, 'rgb(' + L.rgb.join(',') + ')', .3 * a);
    Rh(x - 5, y - 5, 10, 10, 'rgb(' + L.rgb.map(v => Math.round(v * a)).join(',') + ')');
    if (a > .5) { alpha(2 * a - 1); Rh(x - 4, y - 4, 3, 3, L.hi); alpha(1); }
  }

  /* The lamps of the devices' own, as the pie's: each its middle from the base, its lit and dark
     colourings, its light and its map, keys over a box from the base, worked out once. A key the lit
     colouring lacks shows the dark drawing in the lit canvas too, as a pack's lamp does. */
  /* Up, every lamp pulses between its full colour and a dimmer one of the same hue, never unlit, so
     a device up never reads as down: the owl's eyes from amber to a deeper gold. Down, a device has
     no lamp: the owl's dazed spirals are drawn still and unlit (DAZED). */
  const AMBER = { a: C.G1, b: C.G2, h: C.G0 }, AMBER_DIM = { a: C.G2, b: C.G3, h: C.G1 };
  const DAZED = { a: '#6e6478', e: '#1e1828' };
  const inEll = (u, v, cx, cy, rx, ry) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
  /* A lamp of its own: at, the colourings, the light, and the map from key(u, v) over the box from
     (x0, y0), w by h, trimmed to what it holds. */
  const ownLamp = (at, lit, dark, light, x0, y0, w, h, key) => {
    let m = null;
    return Object.freeze({ at, lit, dark, light, map: () => m || (m = trim(x0, y0, w, h, key)) });
  };
  /* The same over the box [x0, y0, x1, y1], x1 and y1 exclusive, rounded. */
  const ownLampIn = (at, lit, dark, light, box, key) => {
    const [x0, y0, x1, y1] = box.map(Math.round);
    return ownLamp(at, lit, dark, light, x0, y0, x1 - x0, y1 - y0, key);
  };
  /* Two eyes n across, from their upper left corners: a highlight in the corner, shaded at the lower
     right. */
  const eyes = (centres, n) => (u, v) => {
    for (const [ex, ey] of centres) { const i = u - ex, j = v - ey; if (i >= 0 && i < n && j >= 0 && j < n) return i === 0 && j === 0 ? 'h' : i + j >= 2 * n - 3 ? 'b' : 'a'; }
    return null;
  };
  /* Two dazed eyes, a red spiral in each, its gaps dark. */
  const SPIRAL = ['aaaaa', '....a', 'aaa.a', 'a...a', 'aaaaa'];
  const spirals = centres => (u, v) => {
    for (const [ex, ey] of centres) { const i = u - ex, j = v - ey; if (i >= 0 && i < 5 && j >= 0 && j < 5) return SPIRAL[j][i] === 'a' ? 'a' : 'e'; }
    return null;
  };

  const BUFF = [[.15, '#f3d29a'], [.55, '#e0ae66'], [1, '#b9803f']], WOODV = [[.2, C.N0], [.7, C.N1], [1, C.N2]], DARKIN = '#100c16';
  const GLASS = '#3a4660', GLASS_HI = '#8ea0c0';

  /* ---- The crystal, the flask and the chest at their sizes ------------------------------------
     Each is drawn at a size s, a redraw rather than an enlarged image: every shape's inner geometry
     (positions, radii, widths) is its drawing at today's size times s about the base, rasterised at
     one grid pixel, while the dark outlines keep their thickness and thin details (highlights, the
     tag's string) stay 1 or 2 pixels. A part that rests on the ground is scaled about its own inner
     bottom, its pivot, so it still rests on the base line. The lamps are worked out from the same
     formulas at the size, so their edges stay one pixel. The machine and the chest are drawn at 2,
     the flask at 1.4. R(v) is v at the size, rounded; Y(v, p) a height from the base scaled about
     the pivot p. */
  /* Discs drawn pixel by pixel: the pixels ell fills about (0, 0) for each [rx, ry, colour] of
     list in turn, worked out once and painted with D.pix at (cx, cy), cy whole. For a disc whose
     radius no multiple of 1/8 draws alike, as a pack's numbers must be: the crystal's ball and the
     flask's bulb, which a pack carries as pix shapes of the same pixels. */
  function discs(list) {
    let m = null;
    const cells = () => {
      if (m) return m;
      const at = new Map(), rec = { fillStyle: null, globalAlpha: 1, fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) at.set((x + i) + ',' + (y + j), this.fillStyle); } };
      const was = D.getCtx(); D.setCtx(rec);
      try { for (const [rx, ry, c] of list) ell(0, 0, rx, ry, c); } finally { D.setCtx(was); }
      const r = Math.ceil(Math.max(...list.map(d => Math.max(d[0], d[1])))) + 1;
      return (m = trim(-r, -r, 2 * r + 1, 2 * r + 1, (u, v) => at.get(u + ',' + v) || null));
    };
    return { cells, draw(cx, cy) { const c = cells(); D.pix(cx + c.x0, cy + c.y0, c.w, c.h, (i, j) => c.keys[j * c.w + i]); } };
  }
  function sized(s) {
    const R = v => Math.round(v * s), Y = (v, p) => Math.round(p + (v - p) * s);
    const one = Math.max(1, Math.round(s));

    /* The machine: the scrying crystal on a gilt claw stand on a wooden foot, the whole ball the
       lamp. Its shapes are the crystal's at c = s * 0.925, which brings the ball's top to 93 above
       the base at 2. Up, the ball pulses from pale blue-white to a dimmer blue, still lit. Gone, the stand
       has toppled and the ball lies on the floor beside it, dark, with a crack across it: no lamp,
       so it is all still drawing. */
    const c = s * .925, Rc = v => Math.round(v * c);
    const ballR = 13 * c, ballY = Math.round(-36 * c);
    const ORB = { a: '#dcecff', b: '#a6c6ec', h: '#ffffff', c: '#f2f8ff' };
    const ORB_DIM = { a: '#7894c0', b: '#5a78a8', h: '#c8dcf6', c: '#90acd6' };
    const ORB_DARK = { a: '#1c2638', b: '#121a28', h: '#3e5272', c: '#26344c' };
    const crystal = ownLampIn([0, ballY], ORB, ORB_DIM, '#cde4ff', [-ballR - 1, ballY - ballR - 1, ballR + 2, ballY + ballR + 2], (u, v) => {
      const r = ballR, d = Math.hypot(u, v - ballY);
      if (d > r) return null;
      if (Math.hypot(u + r * .42, v - ballY + r * .42) < r * .22) return 'h';
      if (u * .6 + (v - ballY) * .7 > r * .45 || d > r - 1.2) return 'b';
      if (Math.abs(Math.hypot(u + 2 * c, v - ballY + c) - r * .55) < .7 && u < 3 * c) return 'c';
      return 'a';
    });
    const CRACK = [[-24, -22], [-19, -16], [-22, -12], [-16, -6], [-17, -3]];
    /* The claws' half widths, outline and gold, at either end, kept to eighths as a pack's numbers
       are: 1.2c + 1.3, 0.5c + 1, 1.2c and 0.5c at 2 come to these. The gold fills the same pixels;
       the outline differs from the unrounded one by two pixels a claw. */
    const CLAW = [3.5, 2, 2.25, .875];
    /* The ball's outline, drawn pixel by pixel; gone, the ball, its highlight and the crack's four
       strokes at the eighths that fill the pixels 22.35, 20.35, 4.48 and 0.8 would. */
    const RING = discs([[ballR + 2, ballR + 2, C.K]]), DOWN = { ring: [22.375, 22.375], ball: [20.25, 20.375], hi: [4.375, 4.5], crack: [.75, .75, .75, .875] };
    function machine(x, y, ok) {
      if (ok) {
        const ft = [[-14, 0], [-11, -5], [11, -5], [14, 0]].map(([u, v]) => [x + Rc(u), y + Rc(v)]);
        poly([[ft[0][0] - 2, y + 1], [ft[1][0] - 1, ft[1][1] - 2], [ft[2][0] + 1, ft[2][1] - 2], [ft[3][0] + 2, y + 1]], C.K); poly(ft, WOODV);
        const sx = x + Rc(-3), sy = y + Rc(-16), sw = Rc(6), sh = Rc(10);
        rrect(sx - 2, sy - 1, sw + 4, sh + 2, 1, C.K); rrect(sx, sy, sw, sh, 0, GOLD);
        for (const d of [-1, 1]) {
          const p0 = [x + d * Rc(11), y + Rc(-22)], p1 = [x + d * Rc(15), y + Rc(-33)];
          strip(p0[0], p0[1], p1[0], p1[1], CLAW[0], CLAW[1], C.K); strip(p0[0], p0[1], p1[0], p1[1], CLAW[2], CLAW[3], C.G1);
        }
        const cup = [[-12, -23], [12, -23], [7, -16], [-7, -16]].map(([u, v]) => [x + Rc(u), y + Rc(v)]);
        poly([[cup[0][0] - 2, cup[0][1] - 1], [cup[1][0] + 2, cup[1][1] - 1], [cup[2][0] + 1, cup[2][1] + 1], [cup[3][0] - 1, cup[3][1] + 1]], C.K); poly(cup, GOLD);
        RING.draw(x, y + ballY);
      } else {
        // the toppled stand, to the right: the cup on its side, the stem, the foot on its edge
        const P2 = pts => pts.map(([u, v]) => [x + Rc(u), y + Math.round(v * c)]);
        const cupO = P2([[2, -24], [11, -18], [11, -5], [2, 1]]), cupI = P2([[4, -21], [10, -17], [10, -6], [4, -1]]);
        poly([[cupO[0][0] - 1, cupO[0][1] - 1], [cupO[1][0] + 1, cupO[1][1] - 1], [cupO[2][0] + 1, cupO[2][1] + 1], [cupO[3][0] - 1, y + 1]], C.K); poly(cupI, GOLD);
        const sx = x + Rc(11), sy = y + Rc(-14), sw = Rc(10), sh = Rc(6);
        rrect(sx - 1, sy - 2, sw + 2, sh + 4, 1, C.K); rrect(sx, sy, sw, sh, 0, GOLD);
        const fO = P2([[21, -21], [29, -18], [29, 1], [21, 1]]), fI = P2([[22, -19], [28, -17], [28, 0], [22, 0]]);
        poly([[fO[0][0] - 1, fO[0][1] - 1], [fO[1][0] + 1, fO[1][1] - 1], [fO[2][0] + 1, y + 1], [fO[3][0] - 1, y + 1]], C.K); poly(fI, WOODV);
        // the ball, rolled off to the left, dark, cracked
        const bx = x + Rc(-18), r = 11 * c, by = y - Math.round(r) - 1;
        ell(bx, by, DOWN.ring[0], DOWN.ring[1], C.K); ell(bx, by, DOWN.ball[0], DOWN.ball[1], [[.25, ORB_DARK.c], [.7, ORB_DARK.a], [1, ORB_DARK.b]]);
        ell(bx - Math.round(r * .42), by - Math.round(r * .42), DOWN.hi[0], DOWN.hi[1], ORB_DARK.h);
        const ck = CRACK.map(([u, v]) => [bx + Math.round((u + 18) * c), by + Math.round((v + 13) * c)]);
        for (let i = 1; i < ck.length; i++) strip(ck[i - 1][0], ck[i - 1][1], ck[i][0], ck[i][1], DOWN.crack[i - 1], DOWN.crack[i - 1], C.K);
        for (const [sx2, sy2] of [[-3, -1], [1, -2], [-6, 0]]) { const px = x + Rc(sx2), py = y + Rc(sy2); poly([[px, py + 1], [px + 1, py - 1], [px + 2, py + 1]], C.S0); }
      }
    }

    /* The box: the iron-bound chest, the jewel in its lock plate a lamp of its own, gold up, pulsing
       to a deeper gold; gone, the jewel is dark glass, drawn still. Its body rests on the base
       (pivot -1, the inside of its outline), its straps and the coins spilt from it on the base
       itself. */
    const JEWEL_DARK = { a: '#2a2430', h: '#4a4250' };
    const jewel = (cx, cy, lit, dark, light) => {
      const n = R(10), x0 = cx - Math.floor(n / 2), y0 = cy - Math.floor(n / 2), hl = Math.max(3, R(3));
      return ownLampIn([cx, cy], lit, dark, light, [x0 - 2, y0 - 2, x0 + n + 2, y0 + n + 2], (u, v) => {
        const i = u - x0, j = v - y0;
        if (i < 0 || j < 0 || i >= n || j >= n) return null;
        return i >= 1 && j >= 1 && i <= hl && j <= hl ? 'h' : 'a';
      });
    };
    const jUp = [0, Y(-20, -1)], jGone = [R(15), Y(-24, -1)];
    const chestUp = jewel(jUp[0], jUp[1], { a: C.G1, h: C.G0 }, { a: C.G2, h: C.G1 }, C.G1);
    const chestGone = jewel(jGone[0], jGone[1], JEWEL_DARK, JEWEL_DARK, null);
    const rim = (x, y, c) => { const n = R(10); Rh(x + c[0] - Math.floor(n / 2) - 1, y + c[1] - Math.floor(n / 2) - 1, n + 2, n + 2, C.K); };
    function box(x, y, ok) {
      if (ok) {
        let ix = x + R(-23), iy = y + Y(-23, -1), iw = R(46), ih = R(22);
        rrect(ix - 2, iy - 2, iw + 4, ih + 4, 2, C.K); Rv(ix, iy, iw, ih, WOODV);
        Rh(ix, y + Y(-16, -1), iw, 1, C.N3); Rh(ix, y + Y(-8, -1), iw, 1, C.N3);
        const ly = y + Y(-36, -1), lh = R(12);
        rrect(ix - 2, ly - 2, iw + 4, lh + 3, 5 * s + 1, C.K); rrect(ix, ly, iw, lh, 5 * s, [[.3, C.N0], [1, C.N1]]); Rh(ix, y + Y(-26, -1), iw, 1, C.N3);
        for (const bx of [-19, 14]) {
          const sx = x + R(bx + 1), sy = y + Y(-36, 0), sw = R(3), sh = R(36);
          Rh(sx - 1, sy - 1, sw + 2, sh + 2, C.K); Rh(sx, sy, sw, sh, C.S3);
          Rh(x + R(bx + 2), y + Y(-33, 0), one, one, C.S1); Rh(x + R(bx + 2), y + Y(-6, 0), one, one, C.S1);
        }
        ix = x + R(-7); iy = y + Y(-27, -1); iw = R(14);
        rrect(ix - 1, iy - 1, iw + 2, iw + 2, 2, C.K); rrect(ix, iy, iw, iw, 1, STEEL2);
        rim(x, y, jUp);
      } else {
        let ix = x + R(-32), iy = y + Y(-10, 0), iw = R(30), ih = R(10);
        rrect(ix - 2, iy - 2, iw + 4, ih + 3, 5 * s + 1, C.K); rrect(ix, iy, iw, ih, 5 * s, [[.3, C.N1], [1, C.N2]]);
        for (const bx of [-29, -9]) { const sx = x + R(bx + 1), sy = y + Y(-11, 0), sw = R(2), sh = R(11); Rh(sx - 1, sy - 1, sw + 2, sh + 2, C.K); Rh(sx, sy, sw, sh, C.S3); }
        ix = x + R(4); iy = y + Y(-46, -1); iw = R(22); ih = R(45);
        rrect(ix - 2, iy - 2, iw + 4, ih + 4, 2, C.K); Rv(ix, iy, iw, ih, WOODV);
        Rh(ix, iy, R(3), ih, DARKIN);
        for (const by of [-42, -8]) { const yy = y + Y(by + 1, -1), hh = R(3); Rh(ix - 2, yy - 1, iw + 4, hh + 2, C.K); Rh(ix - 1, yy, iw + 2, hh, C.S3); }
        Rh(x + R(12), y + Y(-37, -1), 1, R(29), C.N3); Rh(x + R(20), y + Y(-37, -1), 1, R(29), C.N3);
        const px = x + R(8), py = y + Y(-31, -1), pw = R(14);
        rrect(px - 1, py - 1, pw + 2, pw + 2, 2, C.K); rrect(px, py, pw, pw, 1, STEEL2);
        for (const [cx, cy] of [[-4, -2], [-1, -1], [2, -3]]) { ell(x + R(cx), y + Y(cy, 0), 2 * s + 1, s + 1, C.K); ell(x + R(cx), y + Y(cy, 0), 2 * s, s, C.G1); }
        rim(x, y, jGone);
        const m = chestGone.map();
        D.pix(x + m.x0, y + m.y0, m.w, m.h, (i, j) => { const k = m.keys[j * m.w + i]; return k ? JEWEL_DARK[k] : null; });
      }
    }

    /* The vm: the potion flask, its potion blue. Up, it stands on its bulb (pivot -2), the potion
       the lamp; gone, it lies on its bulb with its cork on the base beside it, the last of the
       potion dark, drawn still. */
    const POTION = { a: '#6fb4ff', b: '#3f78c8', h: '#d6ecff' }, POTION_DIM = { a: '#3f78c8', b: '#2c5aa0', h: '#9cc8f4' }, POTION_DARK = { a: '#14223c', b: '#0e182a', h: '#22345a' };
    const fUpCy = Y(-14, -2), fGoneCy = Y(-13, -2), fGoneCx = R(8);
    const sparks = [[-4, -12], [3, -8], [-1, -5]].map(([u, v]) => [R(u), Y(v, -2)]);
    const potion = ownLampIn([0, Y(-10, -2)], POTION, POTION_DIM, '#6fb4ff', [-14 * s, -30 * s, 14 * s, 0], (u, v) => {
      const top = Y(-18, -2);
      if (!inEll(u, v, 0, fUpCy, 12 * s, 12 * s) || v > -2 || v < top) return null;
      if (v === top || sparks.some(p => p[0] === u && p[1] === v)) return 'h';
      return u > 6 * s || v > Y(-5, -2) ? 'b' : 'a';
    });
    const spilt = ownLampIn([R(8), Y(-4, -2)], POTION_DARK, POTION_DARK, null, [-6 * s, -12 * s, 24 * s, 0], (u, v) => {
      const top = Y(-6, -2);
      return inEll(u, v, fGoneCx, fGoneCy, 11 * s, 11 * s) && v >= top ? (v === top ? 'h' : u > 14 * s ? 'b' : 'a') : null;
    });
    /* The bulb, outline and glass, drawn pixel by pixel; the bulb lying down, and the cork's
       corners, at the eighths that fill the pixels 17.4, 15.4, 2.4 and 1.4 would. */
    const BULB = discs([[12 * s + 2, 12 * s + 2, C.K], [12 * s, 12 * s, GLASS]]), e8 = v => Math.round(v * 8) / 8;
    const tag = (x, y, inner, outer) => {
      const pin = inner.map(([u, v]) => [x + R(u), y + Y(v, -2)]);
      poly(pin.map((p, i) => [p[0] + outer[i][0] - inner[i][0], p[1] + outer[i][1] - inner[i][1]]), C.K); poly(pin, C.F0);
    };
    function vm(x, y, ok) {
      if (ok) {
        BULB.draw(x, y + fUpCy);
        let ix = x + R(-3), iy = y + Y(-39, -2), iw = R(6), ih = R(13);
        rrect(ix - 2, iy - 1, iw + 4, ih + 1, 1, C.K); rrect(ix, iy, iw, ih, 0, GLASS);
        ix = x + R(-6); iy = y + Y(-41, -2); iw = R(12); ih = R(2);
        rrect(ix - 1, iy - 1, iw + 2, ih + 2, 1, C.K); Rh(ix, iy, iw, ih, C.S2);
        ix = x + R(-3); iy = y + Y(-47, -2); iw = R(6); ih = R(5);
        rrect(ix - 1, iy - 1, iw + 2, ih + 2, e8(s + 1), C.K); rrect(ix, iy, iw, ih, e8(s), C.N0);
        Rh(x + R(-8), y + Y(-23, -2), 2, R(4), GLASS_HI); Rh(x + R(-2), y + Y(-36, -2), 1, R(6), GLASS_HI);
        Rh(x + R(4), y + Y(-37, -2), R(5), 1, C.F2);
        tag(x, y, [[9, -36], [14, -35], [13, -31], [9, -32]], [[8, -38], [16, -36], [14, -29], [7, -31]]);
      } else {
        ell(x + fGoneCx, y + fGoneCy, e8(11 * s + 2), e8(11 * s + 2), C.K); ell(x + fGoneCx, y + fGoneCy, e8(11 * s), e8(11 * s), GLASS);
        let ix = x + R(-18), iy = y + Y(-16, -2), iw = x + fGoneCx - Math.round(11 * s) + 1 - ix, ih = R(6);
        rrect(ix - 1, iy - 2, iw + 1, ih + 4, 1, C.K); rrect(ix, iy, iw, ih, 0, GLASS);
        ix = x + R(-21); iy = y + Y(-19, -2); iw = R(2); ih = R(12);
        rrect(ix - 1, iy - 1, iw + 2, ih + 2, 1, C.K); Rh(ix, iy, iw, ih, C.S2);
        Rh(x + R(2), y + Y(-21, -2), R(6), 2, GLASS_HI);
        ix = x + R(-33); iy = y + Y(-5, 0); iw = R(6); ih = R(5);
        rrect(ix - 1, iy - 1, iw + 2, ih + 2, e8(s + 1), C.K); rrect(ix, iy, iw, ih, e8(s), C.N0);
        tag(x, y, [[19, -22], [24, -24], [24, -21], [20, -20]], [[18, -22], [25, -26], [26, -20], [20, -18]]);
        const m = spilt.map();
        D.pix(x + m.x0, y + m.y0, m.w, m.h, (i, j) => { const k = m.keys[j * m.w + i]; return k ? POTION_DARK[k] : null; });
      }
    }
    return { machine, crystal, box, chestUp, chestGone, vm, potion, spilt };
  }
  const BIG = sized(2), FLASK = sized(1.4);

  const LAMPS = Object.freeze({
    owl: { up: ownLamp([-4, -56], AMBER, AMBER_DIM, C.G1, -10, -58, 13, 5, eyes([[-10, -58], [-2, -58]], 5)), gone: null,
      dazed: ownLamp([-4, -10], DAZED, DAZED, null, -11, -12, 15, 5, spirals([[-11, -12], [-1, -12]])) },
    crystal: { up: BIG.crystal, gone: null },
    flask: { up: FLASK.potion, gone: null, spilt: FLASK.spilt },
    chest: { up: BIG.chestUp, gone: null, jewel: BIG.chestGone }
  });

  /* A feather drifting down. */
  function feather(x, y, c) { ell(x, y, 4, 2.5, C.K); ell(x, y, 2.5, 1.25, c); }

  /* The camera: a barn owl on an iron wall bracket, facing out, its eyes the lamp, glowing amber.
     The wall plate stands where the old camera's did, from x 22 to 32, so the poles of a high place
     meet it. Gone: it hangs upside down from the bracket by its talons, its wings drooping, its eyes
     dazed spirals, unlit, two feathers drifting down. */
  function cameraHD(x, y, t, ok, part) {
    if (part !== 'moving') {
      rrect(x + 22, y - 64, 10, 46, 2, C.K); rrect(x + 24, y - 62, 6, 42, 1, STEEL3); Rh(x + 26, y - 59, 2, 2, C.S1); Rh(x + 26, y - 25, 2, 2, C.S1);
      strip(x + 24, y - 23, x + 12, y - 33, 2, 2, C.K); strip(x + 24, y - 23, x + 12, y - 33, 1, 1, C.S3);
      strip(x + 24, y - 34, x - 17, y - 34, 3, 3, C.K); ell(x - 19, y - 34, 3, 3, C.K);
      strip(x + 24, y - 34, x - 17, y - 34, 1.5, 1.5, C.S3); ell(x - 19, y - 34, 1.5, 1.5, C.S2);
      if (ok) {
        ell(x - 4, y - 45, 12, 10, C.K); ell(x - 4, y - 45, 10, 8, BUFF);
        ell(x - 4, y - 42, 6, 6, [[.35, C.W], [1, C.S1]]);
        for (const [dx, dy] of [[-6, -44], [-2, -41], [-5, -39], [-1, -45]]) Rh(x + dx, y + dy, 1, 1, C.N1);
        Rh(x - 13, y - 48, 1, 8, C.N2); Rh(x + 5, y - 48, 1, 8, C.N2);
        ell(x - 4, y - 55, 12, 9, C.K); ell(x - 4, y - 55, 10, 7, BUFF);
        ell(x - 4, y - 54, 9, 6, '#c98f4f'); ell(x - 8, y - 54, 4, 5, [[.4, C.W], [1, C.S0]]); ell(x, y - 54, 4, 5, [[.4, C.W], [1, C.S0]]);
        Rh(x - 5, y - 52, 2, 3, C.G2);
        Rh(x - 9, y - 37, 3, 2, C.G2); Rh(x - 1, y - 37, 3, 2, C.G2);
      } else {
        Rh(x - 9, y - 31, 3, 2, C.G2); Rh(x - 1, y - 31, 3, 2, C.G2);
        strip(x - 14, y - 28, x - 20, y - 13, 4, 2, C.K); strip(x + 6, y - 28, x + 12, y - 13, 4, 2, C.K);
        strip(x - 14, y - 28, x - 20, y - 13, 2.5, 1, '#b9803f'); strip(x + 6, y - 28, x + 12, y - 13, 2.5, 1, '#b9803f');
        ell(x - 4, y - 22, 12, 10, C.K); ell(x - 4, y - 22, 10, 8, BUFF);
        ell(x - 4, y - 24, 6, 6, [[.35, C.W], [1, C.S1]]);
        for (const [dx, dy] of [[-6, -23], [-2, -26], [-5, -28]]) Rh(x + dx, y + dy, 1, 1, C.N1);
        ell(x - 4, y - 9, 12, 9, C.K); ell(x - 4, y - 9, 10, 7, BUFF);
        ell(x - 4, y - 10, 9, 6, '#c98f4f'); ell(x - 8, y - 10, 4, 5, [[.4, C.W], [1, C.S0]]); ell(x, y - 10, 4, 5, [[.4, C.W], [1, C.S0]]);
        Rh(x - 5, y - 16, 2, 3, C.G2);
        feather(x + 16, y - 7, '#f3d29a'); feather(x - 26, y - 3, C.W);
        const m = LAMPS.owl.dazed.map();
        D.pix(x + m.x0, y + m.y0, m.w, m.h, (i, j) => { const k = m.keys[j * m.w + i]; return k ? DAZED[k] : null; });
      }
    }
    if (part !== 'still' && ok) ownLampHD(LAMPS.owl.up, x, y, t, true);
  }

  /* The machine: the scrying crystal (sized, above), its ball the lamp up; gone, dark. */
  function machineHD(x, y, t, ok, part) {
    if (part !== 'moving') BIG.machine(x, y, ok);
    if (part !== 'still' && ok) ownLampHD(LAMPS.crystal.up, x, y, t, true);
  }
  /* The virtual machine: the potion flask (sized, above), its potion the lamp up; gone, dark. */
  function vmHD(x, y, t, ok, part) {
    if (part !== 'moving') FLASK.vm(x, y, ok);
    if (part !== 'still' && ok) ownLampHD(LAMPS.flask.up, x, y, t, true);
  }
  /* Any other kind: the iron-bound chest (sized, above), its jewel the lamp, gold up; gone, dark. */
  function boxHD(x, y, t, ok, part) {
    if (part !== 'moving') BIG.box(x, y, ok);
    if (part !== 'still' && ok) ownLampHD(LAMPS.chest.up, x, y, t, true);
  }

  /* The kinds of device the page draws, by the contract's kind. draw(x, y, t, ok, part)
     draws one standing on the base (x, y), and mark is the height above the base of the top of
     the question mark the engine draws over a gone device: its foot clears the gone
     device by 4 pixels or more, except over the pie, whose mark stands where it always has. A kind
     not listed here is drawn as box. */
  const KINDS = {
    pi: { draw: (x, y, t, ok, part) => pieHD(x - 32, y - 31, t, ok, part), mark: 93 },
    camera: { draw: cameraHD, mark: 128 },
    machine: { draw: machineHD, mark: 122 },
    vm: { draw: vmHD, mark: 122 },
    box: { draw: boxHD, mark: 158 }
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
  /* A swatted fly as it falls, its body's top at y. */
  function deadFlyHD(x, y) { Rh(x - 3, y, 6, 5, '#3a3344'); }
  /* ---- Critters ---------------------------------------------------------------------------------
     What the engine (engine.js) needs of a critter, and nothing about where it hovers or when it is
     swatted, which are the engine's:
       draw(x, y, flap)  the critter hovering at (x, y), in its first frame (flap 0) or its second
       dead(x, y)        what falls once it is swatted, from (x, y) */
  const CRITTERS = { fly: { draw: flyHD, dead: deadFlyHD } };
  function poofHD(x, y) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; strip(x + Math.sin(a) * 6, y - Math.cos(a) * 6, x + Math.sin(a) * 17, y - Math.cos(a) * 17, 1.5, 1.5, '#fff3a0'); } ell(x, y, 4, 4, C.W); }
  function chuteHD(cx, y) {
    ell(cx, y - 44, 52, 34, C.K, null, y - 44); ell(cx, y - 44, 49, 31, [[.2, C.R1], [.4, C.W], [.6, C.R1], [.8, C.W], [1, C.R1]], null, y - 45);
    for (const dx of [-48, -18, 18, 48]) strip(cx + dx, y - 44, cx + dx * .55, y, 1, 1, C.S3);
  }

  /* ---- The goblin -------------------------------------------------------------------------------
     A foe of the ip_banned event, full size beside the knight: 160 pixels from its feet to the top
     of the saucepan it wears for a helmet, in a patched sackcloth tunic, all ears and nose. It is
     drawn facing left, frontal like the knight with its face turned the way it looks, standing on
     its feet at (x, y), lit from the left. Each pose is painted once into a canvas of its own and
     blitted from there by the engine, mirrored or squashed as the moment needs (see foeSprite). */
  const GOB = {
    skin: [[.16, '#c8f3ae'], [.55, '#93d97c'], [.86, '#64b553'], [1, '#3f8a3a']], limb: [[.3, '#93d97c'], [.75, '#78c565'], [1, '#4f9a45']],
    jaw: [[.4, '#64b553'], [1, '#3f8a3a']], arm: '#86d070', finger: '#93d97c', nose: '#78c565', dark: '#2f6b3a', light: '#c8f3ae',
    earIn: '#f2a08c', blush: '#e98f7c', tongue: '#ff6f8a', tongueLine: '#d24a6a', mouth: '#4a1424',
    tunic: [[.15, '#c99a5b'], [.55, '#a8763c'], [.85, '#855726'], [1, '#5f3b17']], patch: '#d7b98a', pot: [[.14, C.S2], [.5, C.S3], [.85, C.S4], [1, '#3a4150']]
  };
  function gLimb(pts) { SP.stroke(pts, 7.5, C.K); SP.stroke(pts, 4.5, GOB.arm); }
  /* A three-fingered hand at (hx, hy), the fingers spread along the angle a (0 is up). */
  function gHand(hx, hy, a) {
    const f = [-.65, 0, .65].map(d => [hx + Math.sin(a + d) * 9, hy - Math.cos(a + d) * 9]);
    for (const [fx, fy] of f) ell(fx, fy, 4.5, 4.5, C.K);
    ell(hx, hy, 9, 8, C.K);
    for (const [fx, fy] of f) ell(fx, fy, 2.5, 2.5, GOB.finger);
    ell(hx, hy, 6.5, 5.5, GOB.limb); Rh(hx - 4, hy - 3, 2, 2, GOB.light);
  }
  /* An ear from the side of the head at (bx, by), pointing to side d, its tip lowered by droop. */
  function gEar(bx, by, d, droop) {
    const tip = [bx + d * 46, by - 20 + droop];
    poly([[bx, by - 15], [tip[0] + d * 3, tip[1] - 2], [bx + d * 2, by + 16]], C.K);
    poly([[bx + d * 2, by - 12], [tip[0] - d * 2, tip[1] - 1], [bx + d * 3, by + 12]], GOB.limb);
    poly([[bx + d * 5, by - 7], [bx + d * 2 + (tip[0] - bx - d * 2) * .62, by - 2 + (tip[1] - by + 2) * .62], [bx + d * 6, by + 7]], GOB.earIn);
  }
  function gFoot(fx, fy, d) {
    const cx = fx + d * 7;
    ell(cx, fy + 2, 18, 8, C.K); ell(cx, fy + 1, 15, 5.5, GOB.limb);
    for (const k of [0, 5]) Rh(cx + d * (9 + k) - (d < 0 ? 1 : 0), fy - 3, 1, 4, GOB.dark);
    Rh(cx - 8, fy - 3, 7, 1, GOB.light);
  }
  function gLegs(x, y) {
    const L = [[x - 13, y - 40], [x - 18, y - 10], [x + 13, y - 40], [x + 18, y - 10]];
    for (let i = 0; i < 4; i += 2) { strip(L[i][0], L[i][1], L[i + 1][0], L[i + 1][1], 8, 7, C.K); strip(L[i][0], L[i][1], L[i + 1][0], L[i + 1][1], 5, 4, GOB.limb); }
    gFoot(L[1][0], L[1][1], -1); gFoot(L[3][0], L[3][1], 1);
  }
  function gTunic(x, y) {
    Rh(x - 11, y - 96, 18, 10, C.K); Rh(x - 9, y - 96, 14, 9, GOB.dark);
    for (let i = -40; i < 32; i += 12) poly([[x + i, y - 37], [x + i + 6, y - 27], [x + i + 12, y - 37]], C.K);
    poly([[x - 31, y - 91], [x + 29, y - 91], [x + 38, y - 34], [x - 40, y - 34]], C.K);
    poly([[x - 28, y - 88], [x + 26, y - 88], [x + 35, y - 37], [x - 37, y - 37]], GOB.tunic);
    for (let i = -40; i < 32; i += 12) poly([[x + i + 3, y - 38], [x + i + 6, y - 31], [x + i + 9, y - 38]], i < -10 ? GOB.tunic[1][1] : GOB.tunic[2][1]);
    // the patch, stitched on
    Rh(x + 5, y - 84, 16, 14, C.K); Rh(x + 7, y - 82, 12, 10, GOB.patch); for (let k = 0; k < 3; k++) { Rh(x + 4, y - 81 + k * 4, 3, 1, C.K); Rh(x + 19, y - 81 + k * 4, 3, 1, C.K); }
    // the rope belt and its knot
    Rh(x - 37, y - 64, 72, 8, C.K); Rh(x - 35, y - 63, 68, 6, C.N0); for (let i = 0; i < 68; i += 5) Rh(x - 35 + i, y - 63, 2, 6, C.N2);
    strip(x + 14, y - 58, x + 18, y - 44, 3, 3, C.K); strip(x + 14, y - 58, x + 18, y - 44, 1.5, 1.5, C.N0);
    ell(x + 13, y - 60, 6, 5, C.K); ell(x + 13, y - 60, 4, 3, C.N1);
  }
  /* The eyes: open, wide (alarmed), squint (pleased with itself) or shut tight (struck). */
  function gEyes(x, y, kind, look) {
    const E = [[x - 21, y - 117], [x + 4, y - 118]];
    for (let i = 0; i < 2; i++) {
      const [cx, cy] = E[i], d = i ? 1 : -1;
      if (kind === 'shut') { strip(cx + 7 * d, cy - 6, cx - 5 * d, cy, 2.2, 2.2, C.K); strip(cx - 5 * d, cy, cx + 7 * d, cy + 6, 2.2, 2.2, C.K); continue; }
      if (kind === 'squint') { Rh(cx - 7, cy - 3, 14, 3, C.K); Rh(cx - 10, cy - 1, 4, 5, C.K); Rh(cx + 6, cy - 1, 4, 5, C.K); continue; }
      const wide = kind === 'wide';
      ell(cx, cy, wide ? 11 : 9.5, wide ? 13 : 11.5, C.K); ell(cx, cy, wide ? 9 : 7.5, wide ? 11 : 9.5, C.W);
      const px = cx + (wide ? 0 : -2 + look * 2), py = cy + 1;
      ell(px, py, wide ? 3 : 4, wide ? 3.5 : 5, C.K); Rh(px - (wide ? 2 : 3), py - 3, 2, 2, C.W);
    }
  }
  function gBrows(x, y, kind) {
    if (kind === 'none') return;
    const B = kind === 'worried' ? [[x - 31, y - 128, x - 14, y - 133], [x - 3, y - 134, x + 13, y - 129]]
      : [[x - 32, y - 131, x - 13, y - 135], [x - 4, y - 131, x + 13, y - 128]];
    for (const b of B) strip(b[0], b[1], b[2], b[3], 2.5, 2.5, C.K);
  }
  function gNose(x, y) {
    strip(x - 8, y - 109, x - 28, y - 98, 7, 5, C.K); strip(x - 8, y - 109, x - 28, y - 98, 4, 2.5, GOB.nose);
    ell(x - 31, y - 96, 7.5, 6.5, C.K); ell(x - 31, y - 97, 5.5, 4.5, [[.4, GOB.finger], [1, '#5fae4f']]); Rh(x - 35, y - 100, 2, 2, GOB.light);
  }
  /* The mouth: a toothy grin, the grin with the tongue out, a small gulp, or a wail. */
  function gMouth(x, y, kind) {
    const mx = x - 3, my = y - 88;
    if (kind === 'small') { ell(mx + 2, my, 4, 4, C.K); return; }
    if (kind === 'wail') { ell(mx, my + 1, 13, 10, C.K); ell(mx, my + 2, 10, 7, GOB.mouth); ell(mx, my + 6, 6, 3, GOB.tongue); Rh(mx - 7, my - 6, 5, 4, C.W); Rh(mx + 2, my - 6, 5, 4, C.W); return; }
    ell(mx, my - 2, 19, 9, C.K, my - 2); ell(mx, my - 2, 15, 6, GOB.mouth, my - 1);
    Rh(mx - 9, my - 1, 5, 4, C.W); Rh(mx + 2, my - 1, 5, 4, C.W);
    if (kind === 'tongue') { ell(mx - 4, my + 9, 7, 7, C.K); ell(mx - 4, my + 8, 5, 5, GOB.tongue); Rh(mx - 4, my + 5, 1, 5, GOB.tongueLine); }
  }
  /* The saucepan, dy below where it sits on the head, its handle out behind. */
  function gPot(x, y, dy) {
    const py = y + dy - 4;
    strip(x + 26, py - 136, x + 54, py - 146, 5, 5, C.K); strip(x + 26, py - 136, x + 52, py - 145, 2.5, 2.5, [[.4, C.N0], [1, C.N2]]);
    rrect(x - 31, py - 156, 56, 24, 8, C.K); rrect(x - 28, py - 153, 50, 19, 6, GOB.pot);
    Rh(x - 21, py - 151, 3, 14, C.S1); Rh(x - 2, py - 150, 6, 2, C.S4); Rh(x - 1, py - 148, 4, 1, '#3a4150');
    rrect(x - 36, py - 138, 66, 9, 3, C.K); Rh(x - 34, py - 136, 62, 5, C.S2); Rh(x - 34, py - 136, 62, 1, C.S1); Rh(x + 14, py - 133, 16, 2, C.S3);
  }
  /* The arms of each pose, both sides: the shoulder, the elbow and the hand from the feet, and
     the angle the fingers spread along. Arms in front of the body are marked front. */
  const GOB_ARMS = {
    hips: [[[-28, -84], [-48, -70], [-36, -56], 2.6], [[26, -84], [46, -70], [34, -56], -2.6]],
    up: [[[-28, -84], [-50, -112], [-44, -146], -.2], [[26, -84], [48, -114], [42, -148], .2]],
    ears0: [[[-28, -84], [-58, -98], [-48, -130], -.5], [[26, -84], [56, -98], [46, -132], .5]],
    ears1: [[[-28, -84], [-60, -96], [-52, -128], -.9], [[26, -84], [58, -96], [50, -130], .9]],
    clutch: [[[-28, -84], [-42, -64], [-16, -70], 1.2], [[26, -84], [40, -64], [12, -70], -1.2]],
    flung: [[[-28, -84], [-58, -94], [-72, -110], -.9], [[26, -84], [56, -96], [70, -112], .9]]
  };
  const GOB_FRONT = { clutch: true };
  /* The poses: arms, eyes, brows, mouth, how far the pot sits down (dy) and the ears droop. */
  const GOB_POSES = {
    stand: { arms: 'hips', eyes: 'open', brows: 'cheeky', mouth: 'grin' },
    climb: { arms: 'up', eyes: 'open', brows: 'cheeky', mouth: 'grin' },
    taunt0: { arms: 'ears0', eyes: 'squint', brows: 'cheeky', mouth: 'tongue' },
    taunt1: { arms: 'ears1', eyes: 'open', brows: 'cheeky', mouth: 'tongue', look: -1 },
    brace: { arms: 'clutch', eyes: 'wide', brows: 'worried', mouth: 'small', droop: 14 },
    hit: { arms: 'flung', eyes: 'shut', brows: 'none', mouth: 'wail', pot: 6, droop: 16 }
  };
  function gArms(x, y, kind, front) {
    if (!!GOB_FRONT[kind] !== front) return;
    for (const [s, e, h, a] of GOB_ARMS[kind]) { gLimb([[x + s[0], y + s[1]], [x + e[0], y + e[1]], [x + h[0], y + h[1]]]); gHand(x + h[0], y + h[1], a); }
  }
  function goblinHD(x, y, pose) {
    const p = GOB_POSES[pose] || GOB_POSES.stand, droop = p.droop || 0;
    gArms(x, y, p.arms, false);
    gLegs(x, y);
    gTunic(x, y);
    gEar(x - 33, y - 110, -1, droop); gEar(x + 27, y - 110, 1, droop + 4);
    ell(x - 3, y - 109, 38, 30, C.K); ell(x - 3, y - 109, 35, 27, GOB.skin); ell(x - 3, y - 109, 35, 27, GOB.jaw, y - 95);
    ell(x + 22, y - 104, 3, 3, GOB.dark); Rh(x + 21, y - 105, 1, 1, GOB.light);
    ell(x + 18, y - 99, 6, 3, GOB.blush); ell(x - 34, y - 104, 4, 3, GOB.blush);
    gEyes(x, y, p.eyes, p.look || 0); gBrows(x, y, p.brows);
    gMouth(x, y, p.mouth);
    gPot(x, y, p.pot || 0);
    gNose(x, y);
    gArms(x, y, p.arms, true);
  }

  /* ---- Foes -------------------------------------------------------------------------------------
     What the engine's foe player (engine.js) needs of a foe, and nothing about which foe it is:
       pose(name)  a canvas with the pose painted once, the feet at anchor; names are those of
                   poses, and an unknown name gives stand
       anchor      the feet in that canvas, [x, y]
       h           its height from the feet to its top
       w           half its width across the body, which must stay clear of a device
       mid         the middle of its body above the feet, where the smoke of its exit gathers
       crown       the points of its top, [x, y] from the feet as drawn facing left: the knight's
                   blade stops at the first of them it meets, so no blade passes through it
       exit        which of the engine's exits it leaves by (FOE.exits in engine.js)
     A later foe gives the same, at its own size, and the entrance and the exit work unchanged. */
  const SPR = { w: 220, h: 230, ax: 110, ay: 214 };
  function foeSprites(paint, poses) {
    const cache = {};
    return name => {
      const n = Object.prototype.hasOwnProperty.call(poses, name) ? name : 'stand';
      if (!cache[n]) {
        const cv = document.createElement('canvas'); cv.width = SPR.w; cv.height = SPR.h;
        const was = D.getCtx(); D.setCtx(cv.getContext('2d')); paint(SPR.ax, SPR.ay, n); D.setCtx(was);
        cache[n] = cv;
      }
      return cache[n];
    };
  }
  const FOES = {
    goblin: { pose: foeSprites(goblinHD, GOB_POSES), poses: Object.keys(GOB_POSES), anchor: [SPR.ax, SPR.ay], size: [SPR.w, SPR.h], h: 160, w: 40, mid: 78, exit: 'poof',
      // the outline of its top as it flinches: the near ear's upper edge and tip, the pot's rim,
      // its rounded corners and top, its handle, and the far ear's tip
      crown: [[-83, -119], [-80, -112], [-70, -121], [-58, -123], [-45, -125], [-36, -133], [-36, -141], [-31, -150], [-30, -155], [-27, -159], [-23, -160],
        [-10, -160], [0, -160], [10, -160], [17, -160], [21, -159], [24, -155], [25, -150], [30, -141], [30, -133], [40, -143], [54, -146], [59, -147], [76, -114]] }
  };

  /* ---- What a foe leaves by ---------------------------------------------------------------------
     A four-pointed star with a dark outline, s from its middle to each point. */
  function starHD(x, y, s, c) {
    if (s < 1) return; const w = Math.max(2, s * .28);
    poly([[x, y - s - 3], [x + w + 2, y], [x, y + s + 3], [x - w - 2, y]], C.K); poly([[x - s - 3, y], [x, y - w - 2], [x + s + 3, y], [x, y + w + 2]], C.K);
    poly([[x, y - s], [x + w, y], [x, y + s], [x - w, y]], c); poly([[x - s, y], [x, y - w], [x + s, y], [x, y + w]], c);
    Rh(x - 1, y - 1, 3, 3, C.W);
  }
  /* A cloud of smoke for a foe h tall, its middle at (x, y), el ms after it burst: it bursts from
     55 per cent to full size in 100 ms, billows, then from 400 ms drifts up, shrinks and fades
     out by 1100 ms. It is painted into a canvas of its own and faded as one, so the puffs show no
     seams where they overlap. */
  const PUFFS = [[0, -6, 40], [-38, 4, 30], [38, 0, 32], [-20, -44, 30], [22, -46, 31], [-28, 40, 27], [30, 38, 28], [0, 44, 30], [2, -78, 24], [-50, -26, 20], [50, -24, 21]];
  const SMOKE = [[.2, C.W], [.62, C.S0], [.88, C.S1], [1, C.S2]], CLOUD_MS = 1100;
  let cloudCv = null;
  function cloudHD(x, y, el, h) {
    if (el < 0 || el >= CLOUD_MS) return;
    const k = h / 160, cw = Math.ceil(320 * k), ch = Math.ceil(340 * k), ox = cw / 2, oy = Math.round(180 * k);
    if (!cloudCv) cloudCv = document.createElement('canvas');
    if (cloudCv.width !== cw || cloudCv.height !== ch) { cloudCv.width = cw; cloudCv.height = ch; }
    const c = cloudCv.getContext('2d'), was = D.getCtx();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); D.setCtx(c);
    const grow = .55 + .45 * D.ease(D.clamp01(el / 100)), q = D.clamp01((el - 400) / 700), lift = 26 * q, shrink = 1 - .45 * q;
    const P2 = PUFFS.map(([dx, dy, r], i) => [ox + dx * k * grow, oy + dy * k * grow - lift * (1 + i % 3 * .3), r * k * grow * shrink + Math.sin(el / 90 + i) * 1.5]);
    for (const [px, py, r] of P2) ell(px, py, r + 3, r + 3, C.K);
    for (const [px, py, r] of P2) ell(px, py, r, r, SMOKE);
    for (const [px, py, r] of P2) if (r > 18) ell(px + r * .3, py + r * .35, r * .45, r * .3, C.S1);
    D.setCtx(was);
    alpha(1 - q); was.drawImage(cloudCv, Math.round(x - ox), Math.round(y - oy)); alpha(1);
  }
  /* Gold sparkles twinkling in turn round (x, y), el ms after the first, for a foe h tall: each
     grows and shrinks over 420 ms. SPARKLE_MS is when the last has gone. */
  const SPARKS = [[-58, -64, 0], [52, -30, 110], [-24, 36, 230], [34, -96, 330], [-6, -14, 470], [62, 30, 560]], SPARKLE_MS = 980;
  function sparklesHD(x, y, el, h) {
    const k = h / 160;
    for (const [dx, dy, at] of SPARKS) { const q = (el - at) / 420; if (q < 0 || q > 1) continue; starHD(x + dx * k, y + dy * k - q * 10, 9 * Math.sin(q * Math.PI), C.G0); }
  }
  /* A hole in the grass with its middle at (x, y) on the ground, open by k (0 to 1): a ring of
     earth round a dark pit, 88 pixels across when open, no wider than a foe's place beside a
     device. */
  function holeHD(x, y, k) {
    if (k <= 0) return;
    ell(x, y + 4, 44 * k, 12 * k, C.K); ell(x, y + 3, 41 * k, 9 * k, [[.2, C.N1], [.7, C.N2], [1, C.N3]]);
    ell(x, y + 4, 31 * k, 6.5 * k, C.K); ell(x, y + 5, 27 * k, 4.5 * k, '#07090a');
  }
  /* The clods a hole throws up as it opens, el ms after it starts to; gone by 540 ms or once they
     fall back below the ground at y. */
  function clodsHD(x, y, el) {
    if (el < 0 || el > 540) return;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * .42, v = .42 + (i % 3) * .06, cx = x + Math.cos(a) * v * el, cy = y - 2 + Math.sin(a) * v * el + .0016 * el * el;
      if (cy > y + 4) continue; Rh(cx - 4, cy - 3, 8, 7, C.K); Rh(cx - 2, cy - 1, 4, 3, i % 2 ? C.N2 : C.N1);
    }
  }

  KW.props = { swordHD, bricksHD, barrelHD, tableHD, sconceHD, pieHD, pieShapes, DEVICE_LAMPS: LAMPS, cameraHD, machineHD, vmHD, boxHD, KINDS, kindOf,
    LAMP, LAMP_REDS, lampLevel, lampRim, lampHD, crateHD, flyHD, deadFlyHD, CRITTERS, poofHD, chuteHD,
    FOES, starHD, cloudHD, CLOUD_MS, sparklesHD, SPARKLE_MS, holeHD, clodsHD };
})(window.KW);
