/* Knightwatch: the knight, on the fine grid. Open helm, red plume, blue tabard, a greatsword held
   in both hands. pose() turns a condition into the state of the knight, and knightHD() draws him. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, C = D.C, U = V.U;
  const { alpha, Rh, ell, rrect, poly, strip, lerp, ease, STEEL, STEEL2, STEEL3, GOLD, LEATHER } = D;
  const SKINS = { F: [[.14, C.F0], [.72, C.F1], [1, C.F2]], L: [[.14, '#dff3bd'], [.72, '#b9dd92'], [1, '#94bd6e']], P: [[.14, '#ffc9b8'], [.72, '#ff9f8c'], [1, '#e07a66']] };

  function faceHD(ax, ay, o) {
    const lk = (o.look || 0) * 3, mid = SKINS[o.face || 'F'][1][1];
    if (!o.face) { ell(ax + 91, ay + 107, 7, 4, '#f3a892'); ell(ax + 149, ay + 107, 7, 4, '#f3a892'); }
    if (o.puff) { ell(ax + 89, ay + 106, 9, 8, '#ff9f8c'); ell(ax + 151, ay + 106, 9, 8, '#ff9f8c'); }
    for (const side of [-1, 1]) {
      const x = ax + 120 + side * 18, y = ay + 94;
      switch (o.eyes) {
        case 'closed': Rh(x - 7, y + 4, 14, 3, C.K); Rh(x - 9, y + 1, 3, 4, C.K); Rh(x + 6, y + 1, 3, 4, C.K); break;
        case 'happy': Rh(x - 6, y - 3, 12, 3, C.K); Rh(x - 9, y - 1, 4, 5, C.K); Rh(x + 5, y - 1, 4, 5, C.K); break;
        case 'wide': ell(x, y, 10, 13, C.K); ell(x, y, 8, 11, C.W); ell(x + lk, y + 1, 4, 5, C.K); Rh(x + lk - 2, y - 2, 2, 2, C.W); Rh(x - 6, y - 20, 12, 3, '#8a5a2b'); break;
        case 'half': ell(x + lk, y + 2, 7, 9, C.K); Rh(x + lk - 3, y + 1, 3, 3, C.W); Rh(x - 10, y - 9, 20, 8, mid); Rh(x - 9, y - 2, 18, 3, C.K); break;
        case 'dizzy': strip(x - 7, y - 7, x + 7, y + 7, 2, 2, C.K); strip(x - 7, y + 7, x + 7, y - 7, 2, 2, C.K); break;
        case 'angry': ell(x + lk, y + 2, 7, 9, C.K); Rh(x + lk - 3, y - 1, 3, 3, C.W); strip(x + side * 10, y - 15, x - side * 9, y - 8, 2.5, 2.5, C.K); break;
        default: ell(x + lk, y, 7, 10, C.K); ell(x + lk, y + 4, 4, 4, '#4a3558'); Rh(x + lk - 4, y - 6, 4, 4, C.W); Rh(x + lk + 2, y + 3, 2, 2, C.W); Rh(x - 6, y - 17, 12, 3, '#8a5a2b');
      }
    }
    const mx = ax + 120, my = ay + 111;
    let m = o.mouth; if (m === 'chew' || m === 'talk') m = (Math.floor(o.t / (m === 'chew' ? 160 : 230)) % 2) ? 'open' : 'flat';
    switch (m) {
      case 'smile': Rh(mx - 7, my, 14, 3, C.K); Rh(mx - 10, my - 3, 4, 4, C.K); Rh(mx + 6, my - 3, 4, 4, C.K); break;
      case 'frown': Rh(mx - 7, my - 1, 14, 3, C.K); Rh(mx - 10, my + 1, 4, 4, C.K); Rh(mx + 6, my + 1, 4, 4, C.K); break;
      case 'open': ell(mx, my, 8, 6, C.K); ell(mx, my + 3, 5, 3, C.R1); break;
      case 'pant': ell(mx, my - 1, 8, 5, C.K); rrect(mx - 5, my - 1, 10, 13, 4, C.R1); Rh(mx - 1, my + 2, 2, 7, C.R2); break;
      case 'o': ell(mx, my, 4, 5, C.K); break;
      default: Rh(mx - 6, my - 1, 12, 3, C.K);
    }
    if (o.thermo) { rrect(mx + 4, my - 5, 48, 8, 4, C.K); rrect(mx + 6, my - 3, 44, 4, 2, C.W); ell(mx + 52, my - 1, 6, 6, C.K); ell(mx + 52, my - 1, 4, 4, C.R1); }
  }
  function helmHD(ax, ay, o) {
    const s = Math.round(Math.sin(o.t / 900) * 4);
    // the plume
    if (o.droop) { ell(ax + 152, ay + 26, 36, 15, C.K); ell(ax + 152, ay + 26, 33, 12, [[.4, C.R1], [1, C.R2]]); ell(ax + 176, ay + 40, 19, 13, C.K); ell(ax + 176, ay + 40, 16, 10, C.R2); }
    else {
      ell(ax + 122 + s, ay + 20, 41, 23, C.K); ell(ax + 144, ay + 31, 28, 15, C.K);
      ell(ax + 122 + s, ay + 20, 38, 20, [[.25, C.R0], [.7, C.R1], [1, C.R2]]); ell(ax + 144, ay + 31, 25, 12, [[.4, C.R1], [1, C.R2]]);
      ell(ax + 108 + s, ay + 13, 15, 7, C.R0); strip(ax + 112 + s, ay + 30, ax + 140 + s, ay + 14, 1.5, 1.5, C.R2); strip(ax + 128, ay + 36, ax + 160, ay + 26, 1.5, 1.5, C.R3);
    }
    // the dome, darker at the foot
    rrect(ax + 50, ay + 26, 140, 118, 52, C.K); rrect(ax + 54, ay + 30, 132, 110, 48, STEEL);
    rrect(ax + 54, ay + 30, 132, 110, 48, [[.12, C.S1], [.58, C.S2], [.84, C.S3], [1, C.S4]], ay + 120, ay + 140);
    Rh(ax + 117, ay + 31, 5, 34, C.S0); Rh(ax + 122, ay + 31, 2, 34, C.S3);
    // the opening and the face in it
    rrect(ax + 72, ay + 62, 96, 66, 18, C.K); rrect(ax + 76, ay + 66, 88, 58, 15, [[.5, C.S3], [1, C.S4]]);
    rrect(ax + 81, ay + 71, 78, 48, 11, C.K); rrect(ax + 83, ay + 73, 74, 44, 9, SKINS[o.face || 'F']);
    rrect(ax + 83, ay + 73, 74, 44, 9, 'rgba(60,30,20,.18)', ay + 73, ay + 78);
    for (const [x, y] of [[63, 96], [177, 96], [66, 120], [174, 120], [92, 46], [148, 46]]) { ell(ax + x, ay + y, 4, 4, C.S4); Rh(ax + x - 2, ay + y - 2, 2, 2, C.S0); }
    rrect(ax + 60, ay + 131, 120, 14, 6, C.K); rrect(ax + 63, ay + 133, 114, 9, 4, STEEL2);
    faceHD(ax, ay, o);
  }
  function bareHD(ax, ay, o) {
    const skin = SKINS[o.face || 'F'], hair = [[.2, C.N0], [.7, C.N1], [1, C.N2]];
    for (const x of [63, 177]) { ell(ax + x, ay + 98, 11, 14, C.K); ell(ax + x, ay + 98, 8, 11, skin); }
    rrect(ax + 66, ay + 38, 108, 104, 40, C.K); rrect(ax + 69, ay + 41, 102, 98, 37, skin);
    rrect(ax + 62, ay + 27, 116, 54, 34, C.K); rrect(ax + 65, ay + 30, 110, 48, 31, hair);
    for (const [x, y, rx, c] of [[84, 76, 15, C.N1], [110, 79, 15, C.N0], [137, 77, 16, C.N1], [160, 72, 12, C.N2]]) ell(ax + x, ay + y, rx, 10, c);
    ell(ax + 116, ay + 24, 11, 10, C.K); ell(ax + 116, ay + 24, 8, 7, C.N0);
    faceHD(ax, ay, o);
  }
  function armHD(sx, sy, hx, hy) { strip(sx, sy, hx, hy, 11, 10, C.K); strip(sx, sy, hx, hy, 8, 7, STEEL2); }
  function gauntHD(hx, hy) { ell(hx, hy, 14, 13, C.K); ell(hx, hy, 11, 10, STEEL); Rh(hx - 7, hy + 3, 14, 2, C.S3); }
  /* A speech bubble with its top left at (x, y) and its tail at the lower left, or at the lower right
     when flip is set. */
  function speechHD(x, y, t, flip) {
    const f = flip ? p => [2 * x + 74 - p[0], p[1]] : p => p;
    rrect(x - 3, y - 3, 80, 46, 16, C.K); poly([[x + 12, y + 36], [x + 4, y + 58], [x + 34, y + 40]].map(f), C.K);
    rrect(x, y, 74, 40, 14, C.W); poly([[x + 14, y + 34], [x + 8, y + 52], [x + 30, y + 38]].map(f), C.W);
    const n = Math.floor(t / 320) % 4; for (let i = 0; i < n; i++) ell(x + 20 + i * 17, y + 20, 5, 5, C.K);
  }

  /* Draws the knight from his pose o: o.x is the middle of his body on the fine grid, o.floor the
     ground he stands on. */
  function knightHD(o) {
    const t = o.t, ox = Math.round(o.x) - 120 + (o.shake || 0) * 4, oy = o.floor - 300;
    const u = ((o.bob || 0) + (o.crouch || 0)) * U, bw = (o.bloat || 0) * U, ax = ox + (o.headDx || 0) * U, ay = oy + u + (o.headDy || 0) * U;
    if (o.crates) { const w = Math.round(Math.sin(t / 900) * 5); P.crateHD(ox + 90, oy - 22 + u); P.crateHD(ox + 94 + w, oy - 72 + u); P.crateHD(ox + 90 + 2 * w, oy - 122 + u); }
    // greaves, knee cops, boots
    const sl = o.walk && Math.floor(t / 320) % 2 === 0 ? 6 : 0, sr = o.walk && !sl ? 6 : 0;
    rrect(ox + 79, oy + 226 + u, 34, 56 - u, 8, C.K); rrect(ox + 82, oy + 229 + u, 28, 50 - u, 6, STEEL2);
    rrect(ox + 127, oy + 226 + u, 34, 56 - u, 8, C.K); rrect(ox + 130, oy + 229 + u, 28, 50 - u, 6, STEEL3);
    ell(ox + 96, oy + 240 + u, 15, 10, C.K); ell(ox + 96, oy + 240 + u, 12, 7, STEEL); ell(ox + 144, oy + 240 + u, 15, 10, C.K); ell(ox + 144, oy + 240 + u, 12, 7, STEEL2);
    rrect(ox + 68, oy + 272 - sl, 48, 28, 9, C.K); rrect(ox + 71, oy + 275 - sl, 42, 20, 7, LEATHER); Rh(ox + 71, oy + 294 - sl, 42, 3, C.N3);
    rrect(ox + 124, oy + 272 - sr, 48, 28, 9, C.K); rrect(ox + 127, oy + 275 - sr, 42, 20, 7, [[.15, C.N1], [.6, C.N2], [1, C.N3]]); Rh(ox + 127, oy + 294 - sr, 42, 3, C.N3);
    // the tabard: belt, buckle, gold hem, and the watch's eye
    const tx = ox + 74 - bw, tw = 92 + 2 * bw, ty = oy + 138 + u;
    rrect(tx - 3, ty - 3, tw + 6, 104, 14, C.K); rrect(tx, ty, tw, 98, 11, [[.1, C.B0], [.55, C.B1], [.85, C.B2], [1, C.B3]]);
    Rh(ox + 118, ty + 76, 4, 22, C.K); Rh(tx + 3, ty + 89, tw - 6, 4, C.G1); Rh(tx + 3, ty + 93, tw - 6, 2, C.G2);
    Rh(tx, ty + 60, tw, 14, C.N3); Rh(tx, ty + 62, tw, 9, C.N2); Rh(tx, ty + 62, tw, 2, C.N1);
    rrect(ox + 108, ty + 56, 24, 22, 5, C.K); rrect(ox + 111, ty + 59, 18, 16, 3, GOLD); Rh(ox + 116, ty + 64, 8, 6, C.K);
    ell(ox + 120, ty + 28, 24, 14, C.G2); ell(ox + 120, ty + 28, 22, 12, GOLD); ell(ox + 120, ty + 28, 16, 7, C.B3); ell(ox + 120, ty + 28, 7, 6, C.W); ell(ox + 120, ty + 28, 3, 3, C.K);
    // head, then the pauldrons
    (o.helmet === false ? bareHD : helmHD)(ax, ay, o);
    if (o.food) SP.drum(ox + 138, ay + 88 + (Math.floor(t / 160) % 2) * 5);
    ell(ox + 70 - bw, oy + 161 + u, 25, 20, C.K); ell(ox + 70 - bw, oy + 160 + u, 22, 17, STEEL); Rh(ox + 63 - bw, oy + 155 + u, 4, 4, C.S3);
    ell(ox + 170 + bw, oy + 161 + u, 25, 20, C.K); ell(ox + 170 + bw, oy + 160 + u, 22, 17, STEEL2); Rh(ox + 173 + bw, oy + 155 + u, 4, 4, C.S4);
    const lsx = ox + 66 - bw, rsx = ox + 174 + bw, shy = oy + 168 + u;
    if (o.hammer != null) {
      // the smith: the left hand steadies the work, the right swings a hammer
      const a = lerp(-.25, 1.75, o.hammer), hx = ox + 200 + bw, hy = oy + 178 + u, ex = hx + Math.sin(a) * 50, ey = hy - Math.cos(a) * 50;
      armHD(lsx, shy, ox + 165, oy + 196 + u); gauntHD(ox + 165, oy + 196 + u);
      armHD(rsx, shy, hx, hy); strip(hx, hy, ex, ey, 4, 4, [[.4, C.N0], [1, C.N2]]);
      rrect(ex - 20, ey - 14, 40, 28, 5, C.K); rrect(ex - 17, ey - 11, 34, 22, 3, STEEL3); gauntHD(hx, hy);
    } else if (o.sword !== false) {
      // Both hands on the grip. The arm on the side the blade leans to is drawn first, so the
      // blade and its guard pass in front of it and no arm crosses over the steel.
      const a = o.wang || 0, gx = ox + o.gx * U, gy = oy + o.gy * U + u, sx = Math.sin(a), sy = -Math.cos(a);
      const up = [gx + sx * 6, gy + sy * 6], low = [gx - sx * 30, gy - sy * 30], right = sx >= 0;
      if (right) armHD(rsx, shy, up[0], up[1]); else armHD(lsx, shy, up[0], up[1]);
      P.swordHD(gx, gy, a);
      if (right) armHD(lsx, shy, low[0], low[1]); else armHD(rsx, shy, low[0], low[1]);
      gauntHD(up[0], up[1]); gauntHD(low[0], low[1]);
    } else { armHD(lsx, shy, ox + 56 - bw, oy + 216 + u); gauntHD(ox + 56 - bw, oy + 216 + u); armHD(rsx, shy, ox + 184 + bw, oy + 216 + u); gauntHD(ox + 184 + bw, oy + 216 + u); }
    // what floats around the knight
    if (o.sweat) {
      const n = o.sweat >= 1 ? 6 : 2;
      for (let i = 0; i < n; i++) {
        const ph = ((t / 620) + i / n) % 1, side = i % 2 ? 1 : -1;
        if (ph < .9) { const x = ox + 118 + side * (76 + ph * 50), y = oy + 60 + u - Math.sin(ph * Math.PI) * 36 + ph * 90; poly([[x, y - 10], [x - 5, y + 2], [x + 5, y + 2]], '#7fe9ff'); ell(x, y + 3, 5, 5, '#7fe9ff'); Rh(x - 3, y + 1, 2, 3, C.W); }
      }
    }
    if (o.steam) for (let i = 0; i < 3; i++) { const ph = ((t / 900) + i / 3) % 1; alpha(1 - ph); ell(ox + 78 + i * 40 + Math.sin(ph * 6 + i) * 10, oy + 16 + u - ph * 66, 9 - ph * 4, 9 - ph * 4, C.W); alpha(1); }
    if (o.mark && Math.floor(t / 320) % 3 !== 2) SP.mark(ox + 120, oy - 74 + u, o.mark);
    if (o.bubble) { rrect(ox - 82, oy - 94 + u, 112, 82, 30, C.K); rrect(ox - 78, oy - 90 + u, 104, 74, 26, C.W); ell(ox + 24, oy + 2 + u, 9, 9, C.W); ell(ox + 44, oy + 26 + u, 6, 6, C.W); SP.drum(ox - 46, oy - 74 + u); }
    if (o.progress != null) { rrect(ox + 52, oy - 52 + u, 136, 30, 8, C.W); rrect(ox + 57, oy - 47 + u, 126, 20, 5, C.K); rrect(ox + 61, oy - 43 + u, Math.max(6, 118 * o.progress), 12, 3, '#7fe9ff'); }
    if (o.hearts) for (let i = 0; i < 3; i++) { const ph = ((t / 1100) + i / 3) % 1; alpha(1 - ph * .8); SP.heart(ox + 37 + i * 70, oy + 20 - ph * 70); alpha(1); }
    if (o.speak) speechHD(ox + 150, oy - 62 + u, t);
  }

  /* The state of the knight for a condition id (see docs/state.md), at time t. gx and gy place the
     middle of the sword's grip in coarse units from the knight's corner, wang is the blade's angle. */
  const BASE = { gx: 26, gy: 45, a: .45 };
  function pose(id, t) {
    const o = { t, eyes: 'open', mouth: 'flat', bob: Math.floor(t / 900) % 2, gx: BASE.gx, gy: BASE.gy, wang: BASE.a };
    if (t % 5200 < 160) o.eyes = 'closed';
    switch (id) {
      case 'container_unhealthy': o.eyes = Math.floor(t / 1300) % 2 ? 'dizzy' : 'half'; o.mouth = 'frown'; o.face = 'L'; o.thermo = 1; o.icebag = 1; o.headDx = Math.round(Math.sin(t / 900)); break;
      case 'cpu_hot': o.eyes = 'half'; o.mouth = 'pant'; o.face = 'P'; o.sweat = 1; o.steam = 1; break;
      case 'memory_tight': o.bloat = 5 + (Math.floor(t / 1200) % 2); o.eyes = 'half'; o.mouth = 'o'; o.puff = 1; o.bob = Math.floor(t / 1500) % 2; break;
      case 'disk_full': o.crates = 1; o.crouch = 2; o.bob = 0; o.eyes = 'half'; o.sweat = .3; o.sword = false; break;
      case 'backup_overdue': o.eyes = 'half'; o.mouth = 'frown'; o.bubble = 1; o.headDy = 1; break;
      case 'pi_silent': o.look = 1; o.mouth = 'frown'; break;
      case 'updating': o.eyes = 'happy'; o.mouth = 'smile'; break;
      case 'streaming': o.look = 1; o.mouth = 'smile'; break;
      case 'wan_down': o.look = Math.floor(t / 1400) % 2 ? 1 : -1; o.mouth = 'o'; o.mark = '?'; break;
      case 'attack': o.eyes = 'angry'; o.mouth = 'open'; o.gx = 30; o.gy = 37; o.wang = .7 + Math.sin(t / 90) * .12; o.mark = '!'; o.shake = Math.round(Math.sin(t / 60)); break;
      case 'night': o.eyes = 'closed'; break;
      case 'ssh_session': o.look = 1; break;
    }
    return o;
  }
  /* A two-handed swing: wind up over one shoulder, cut across, recover. dir +1 cuts to the right.
     Returns whether the blade is in the cut. */
  function swing(o, q, dir) {
    const wind = { gx: 24 - dir * 2, gy: 36, a: -1.0 * dir }, hit = { gx: 24 + dir * 10, gy: 46, a: 2.0 * dir };
    let from, to, k;
    if (q < .3) { from = BASE; to = wind; k = ease(q / .3); }
    else if (q < .55) { from = wind; to = hit; k = (q - .3) / .25; k = k * k * (3 - 2 * k); }
    else { from = hit; to = BASE; k = ease((q - .55) / .45); }
    o.gx = lerp(from.gx, to.gx, k); o.gy = lerp(from.gy, to.gy, k); o.wang = lerp(from.a, to.a, k);
    if (q > .2 && q < .6) o.eyes = 'angry';
    return q >= .3 && q < .56;
  }

  /* head draws his bare head with its corner at (ax, ay), as in bed; speech draws a speech bubble. */
  KW.knight = { draw: knightHD, pose, swing, head: bareHD, speech: speechHD };
})(window.KW);
