/* Knightwatcher: the knight, on the fine grid. Open helm, red plume, blue tabard, a greatsword held
   in both hands. pose() turns a condition into the knight's pose, rig() turns a pose into the points
   the knight is drawn on, and draw() draws it there: from the base pack when start() found one it
   can use (packHD), and otherwise from the code below (codeHD), which draws the same knight. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, C = D.C, U = V.U;
  const { alpha, Rh, ell, rrect, poly, strip, lerp, ease, STEEL, STEEL2, STEEL3, GOLD, LEATHER } = D;
  const SKINS = { F: [[.14, C.F0], [.72, C.F1], [1, C.F2]], L: [[.14, '#dff3bd'], [.72, '#b9dd92'], [1, '#94bd6e']], P: [[.14, '#ffc9b8'], [.72, '#ff9f8c'], [1, '#e07a66']] };
  /* The texts of the packs that ship with the page. Each carrier in packs/, loaded after this file,
     pushes its pack's file onto it, and start() reads them. */
  KW.packText = KW.packText || [];

  /* ---- The rig ----------------------------------------------------------------------------------
     Each frame rig(o) works out, from the pose and the build, the named points the knight is drawn
     on (the anchors) and the named numbers its shapes may lean on (the values). Every position the
     drawing uses is an anchor plus an offset.

     A build is eight measurements in grid pixels. The present knight is the only build, and it is
     also the reference: the values dShoulder to dHead are a build's measurements less these, so for
     the present knight they are all 0 and the terms that use them move nothing. */
  const BUILD = Object.freeze({ shoulder: 54, chest: 46, waist: 46, hip: 46, stance: 24, leg: 74, height: 132, head: 51 });
  /* The greatsword's two hand stations along its frame, upper and lower. On the pack path they are
     the weapon's own, which for the base pack's greatsword are the same two. */
  let HANDS = [6, -30];

  /* The rig's result, filled in place on every call so that drawing a frame allocates nothing for it.
     Each anchor is an [x, y] pair, except main, the weapon's frame, which is [x, y, angle]. The
     anchors off (the off hand), plume (the helmet's mount) and rest (a scene's place for gear) come
     with later steps and are not here yet. grip is the grip mode: 'none', 'hammer' or 'two'. */
  const RIG = {
    grip: 'none',
    anchors: { root: [0, 0], footL: [0, 0], footR: [0, 0], hipL: [0, 0], hipR: [0, 0], hem: [0, 0], belt: [0, 0], neck: [0, 0],
      shoulderL: [0, 0], shoulderR: [0, 0], head: [0, 0], handL: [0, 0], handR: [0, 0], main: [0, 0, 0] },
    values: { drop: 0, bloat: 0, stepL: 0, stepR: 0, sway: 0, dShoulder: 0, dChest: 0, dWaist: 0, dHip: 0, dStance: 0, dLeg: 0, dHeight: 0, dHead: 0 },
  };
  const put = (p, x, y) => { p[0] = x; p[1] = y; };

  /* The rig for the pose o and the build b (the present knight when left out). The root is between
     the feet on the ground. The old corner of the knight's 240 by 300 box, which the pose's gx and gy
     still count from, is 120 left of it and 300 above. */
  function rig(o, b) {
    b = b || BUILD;
    const A = RIG.anchors, v = RIG.values, t = o.t;
    const X = Math.round(o.x) + (o.shake || 0) * 4, Y = o.floor;
    const d = ((o.bob || 0) + (o.crouch || 0)) * U, bw = (o.bloat || 0) * U;
    v.drop = d; v.bloat = bw;
    v.stepL = o.walk && Math.floor(t / 320) % 2 === 0 ? 1 : 0; v.stepR = o.walk && !v.stepL ? 1 : 0;
    v.sway = Math.round(Math.sin(t / 900) * 4);
    const dSh = v.dShoulder = b.shoulder - BUILD.shoulder;
    v.dChest = b.chest - BUILD.chest; v.dWaist = b.waist - BUILD.waist; v.dHip = b.hip - BUILD.hip;
    const dSt = v.dStance = b.stance - BUILD.stance, dL = v.dLeg = b.leg - BUILD.leg;
    const dHt = v.dHeight = b.height - BUILD.height, dHd = v.dHead = b.head - BUILD.head;

    put(A.root, X, Y);
    put(A.footL, X - (24 + dSt), Y); put(A.footR, X + (24 + dSt), Y);
    put(A.hipL, X - (24 + dSt), Y - (74 + dL) + d); put(A.hipR, X + (24 + dSt), Y - (74 + dL) + d);
    put(A.hem, X, Y - (64 + dL) + d); put(A.belt, X, Y - (102 + dL) + d);
    put(A.neck, X, Y - (162 + dHt) + d);
    put(A.shoulderL, X - (54 + dSh + bw), Y - (132 + dHt) + d); put(A.shoulderR, X + (54 + dSh + bw), Y - (132 + dHt) + d);
    put(A.head, X + (o.headDx || 0) * U, Y - (206 + dHt + dHd) + d + (o.headDy || 0) * U);

    // The grip, which places the hands and the weapon's frame.
    const m = A.main;
    if (o.hammer != null) {
      // the smith: the left hand steadies the work, the right swings a hammer from its own frame
      RIG.grip = 'hammer';
      put(A.handL, X + 45, Y - 104 + d); put(A.handR, X + 80 + bw, Y - 122 + d);
      m[0] = A.handR[0]; m[1] = A.handR[1]; m[2] = lerp(-.25, 1.75, o.hammer);
    } else if (o.sword !== false) {
      // Both hands on the grip, whose middle the pose gives in units of U from the old corner. The
      // hand on the side the blade leans to holds the upper station. The sums keep the order the
      // drawing has always used, since gx and gy are fractional in a swing.
      RIG.grip = 'two';
      const a = o.wang || 0, gx = X - 120 + o.gx * U, gy = Y - 300 + o.gy * U + d, sx = Math.sin(a), sy = -Math.cos(a);
      m[0] = gx; m[1] = gy; m[2] = a;
      const up = sx >= 0 ? A.handR : A.handL, low = sx >= 0 ? A.handL : A.handR;
      put(up, gx + sx * HANDS[0], gy + sy * HANDS[0]); put(low, gx + sx * HANDS[1], gy + sy * HANDS[1]);
    } else {
      // no weapon: the hands hang at the sides, and the frame rests at the root
      RIG.grip = 'none';
      put(A.handL, X - (64 + bw), Y - 84 + d); put(A.handR, X + (64 + bw), Y - 84 + d);
      m[0] = X; m[1] = Y; m[2] = 0;
    }
    return RIG;
  }

  /* ---- The head ---------------------------------------------------------------------------------
     Each takes the head anchor (hx, hy), the middle of the eye line. */
  function faceHD(hx, hy, o) {
    const lk = (o.look || 0) * 3, mid = SKINS[o.face || 'F'][1][1];
    if (!o.face) { ell(hx - 29, hy + 13, 7, 4, '#f3a892'); ell(hx + 29, hy + 13, 7, 4, '#f3a892'); }
    if (o.puff) { ell(hx - 31, hy + 12, 9, 8, '#ff9f8c'); ell(hx + 31, hy + 12, 9, 8, '#ff9f8c'); }
    for (const side of [-1, 1]) {
      const x = hx + side * 18, y = hy;
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
    const mx = hx, my = hy + 17;
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
  /* The helmet, its plume swaying by s, and the face in its opening. */
  function helmHD(hx, hy, o, s) {
    // the plume
    if (o.droop) { ell(hx + 32, hy - 68, 36, 15, C.K); ell(hx + 32, hy - 68, 33, 12, [[.4, C.R1], [1, C.R2]]); ell(hx + 56, hy - 54, 19, 13, C.K); ell(hx + 56, hy - 54, 16, 10, C.R2); }
    else {
      ell(hx + 2 + s, hy - 74, 41, 23, C.K); ell(hx + 24, hy - 63, 28, 15, C.K);
      ell(hx + 2 + s, hy - 74, 38, 20, [[.25, C.R0], [.7, C.R1], [1, C.R2]]); ell(hx + 24, hy - 63, 25, 12, [[.4, C.R1], [1, C.R2]]);
      ell(hx - 12 + s, hy - 81, 15, 7, C.R0); strip(hx - 8 + s, hy - 64, hx + 20 + s, hy - 80, 1.5, 1.5, C.R2); strip(hx + 8, hy - 58, hx + 40, hy - 68, 1.5, 1.5, C.R3);
    }
    // the dome, darker at the foot
    rrect(hx - 70, hy - 68, 140, 118, 52, C.K); rrect(hx - 66, hy - 64, 132, 110, 48, STEEL);
    rrect(hx - 66, hy - 64, 132, 110, 48, [[.12, C.S1], [.58, C.S2], [.84, C.S3], [1, C.S4]], hy + 26, hy + 46);
    Rh(hx - 3, hy - 63, 5, 34, C.S0); Rh(hx + 2, hy - 63, 2, 34, C.S3);
    // the opening and the face in it
    rrect(hx - 48, hy - 32, 96, 66, 18, C.K); rrect(hx - 44, hy - 28, 88, 58, 15, [[.5, C.S3], [1, C.S4]]);
    rrect(hx - 39, hy - 23, 78, 48, 11, C.K); rrect(hx - 37, hy - 21, 74, 44, 9, SKINS[o.face || 'F']);
    rrect(hx - 37, hy - 21, 74, 44, 9, 'rgba(60,30,20,.18)', hy - 21, hy - 16);
    for (const [x, y] of [[-57, 2], [57, 2], [-54, 26], [54, 26], [-28, -48], [28, -48]]) { ell(hx + x, hy + y, 4, 4, C.S4); Rh(hx + x - 2, hy + y - 2, 2, 2, C.S0); }
    rrect(hx - 60, hy + 37, 120, 14, 6, C.K); rrect(hx - 57, hy + 39, 114, 9, 4, STEEL2);
    faceHD(hx, hy, o);
  }
  /* The bare head: ears, skull, hair and the face. */
  function bareHD(hx, hy, o) {
    const skin = SKINS[o.face || 'F'], hair = [[.2, C.N0], [.7, C.N1], [1, C.N2]];
    for (const x of [-57, 57]) { ell(hx + x, hy + 4, 11, 14, C.K); ell(hx + x, hy + 4, 8, 11, skin); }
    rrect(hx - 54, hy - 56, 108, 104, 40, C.K); rrect(hx - 51, hy - 53, 102, 98, 37, skin);
    rrect(hx - 58, hy - 67, 116, 54, 34, C.K); rrect(hx - 55, hy - 64, 110, 48, 31, hair);
    for (const [x, y, rx, c] of [[-36, -18, 15, C.N1], [-10, -15, 15, C.N0], [17, -17, 16, C.N1], [40, -22, 12, C.N2]]) ell(hx + x, hy + y, rx, 10, c);
    ell(hx - 4, hy - 70, 11, 10, C.K); ell(hx - 4, hy - 70, 8, 7, C.N0);
    faceHD(hx, hy, o);
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

  /* ---- The engine's own steps ------------------------------------------------------------------
     Drawn by code on both paths, at their places in the order of one frame: the crates before
     everything, the drumstick after the face, the hammer between the right arm and its gauntlet,
     and what floats around the knight after everything. */
  function cratesHD(o, neck) {
    // the crates, carried overhead
    if (o.crates) { const w = Math.round(Math.sin(o.t / 900) * 5); P.crateHD(neck[0] - 30, neck[1] - 160); P.crateHD(neck[0] - 26 + w, neck[1] - 210); P.crateHD(neck[0] - 30 + 2 * w, neck[1] - 260); }
  }
  /* The drumstick follows the head up and down but not sideways. */
  function drumHD(o, neck, head) { if (o.food) SP.drum(neck[0] + 18, head[1] - 6 + (Math.floor(o.t / 160) % 2) * 5); }
  /* The smith's hammer, swung from the weapon's frame. */
  function hammerHD(main) {
    const ex = main[0] + Math.sin(main[2]) * 50, ey = main[1] - Math.cos(main[2]) * 50;
    strip(main[0], main[1], ex, ey, 4, 4, [[.4, C.N0], [1, C.N2]]);
    rrect(ex - 20, ey - 14, 40, 28, 5, C.K); rrect(ex - 17, ey - 11, 34, 22, 3, STEEL3);
  }
  /* What floats around the knight, hung on the neck so that it rises and sinks with the body. The
     hearts rise from a fixed height and do not sink with the body. */
  function effectsHD(o, neck, root) {
    const t = o.t;
    if (o.sweat) {
      const n = o.sweat >= 1 ? 6 : 2;
      for (let i = 0; i < n; i++) {
        const ph = ((t / 620) + i / n) % 1, side = i % 2 ? 1 : -1;
        if (ph < .9) { const x = neck[0] - 2 + side * (76 + ph * 50), y = neck[1] - 78 - Math.sin(ph * Math.PI) * 36 + ph * 90; poly([[x, y - 10], [x - 5, y + 2], [x + 5, y + 2]], '#7fe9ff'); ell(x, y + 3, 5, 5, '#7fe9ff'); Rh(x - 3, y + 1, 2, 3, C.W); }
      }
    }
    if (o.steam) for (let i = 0; i < 3; i++) { const ph = ((t / 900) + i / 3) % 1; alpha(1 - ph); ell(neck[0] - 42 + i * 40 + Math.sin(ph * 6 + i) * 10, neck[1] - 122 - ph * 66, 9 - ph * 4, 9 - ph * 4, C.W); alpha(1); }
    if (o.mark && Math.floor(t / 320) % 3 !== 2) SP.mark(neck[0], neck[1] - 212, o.mark);
    if (o.bubble) { rrect(neck[0] - 202, neck[1] - 232, 112, 82, 30, C.K); rrect(neck[0] - 198, neck[1] - 228, 104, 74, 26, C.W); ell(neck[0] - 96, neck[1] - 136, 9, 9, C.W); ell(neck[0] - 76, neck[1] - 112, 6, 6, C.W); SP.drum(neck[0] - 166, neck[1] - 212); }
    if (o.progress != null) { rrect(neck[0] - 68, neck[1] - 190, 136, 30, 8, C.W); rrect(neck[0] - 63, neck[1] - 185, 126, 20, 5, C.K); rrect(neck[0] - 59, neck[1] - 181, Math.max(6, 118 * o.progress), 12, 3, '#7fe9ff'); }
    if (o.hearts) for (let i = 0; i < 3; i++) { const ph = ((t / 1100) + i / 3) % 1; alpha(1 - ph * .8); SP.heart(root[0] - 83 + i * 70, root[1] - 280 - ph * 70); alpha(1); }
    if (o.speak) speechHD(neck[0] + 30, neck[1] - 200, t);
  }

  /* Draws the knight from code, from the pose o: o.x is the middle of the body on the fine grid,
     o.floor the ground underfoot. Every position comes from the rig. This is the path when no base
     pack can be used, as on a deployed page until the base pack is signed. */
  function codeHD(o) {
    const r = rig(o);
    const { root, footL, footR, hipL, hipR, hem, belt, neck, shoulderL, shoulderR, head, handL, handR, main } = r.anchors;
    const { drop, bloat, stepL, stepR, sway } = r.values;
    cratesHD(o, neck);
    // greaves, knee cops, boots
    rrect(hipL[0] - 17, hipL[1], 34, 56 - drop, 8, C.K); rrect(hipL[0] - 14, hipL[1] + 3, 28, 50 - drop, 6, STEEL2);
    rrect(hipR[0] - 17, hipR[1], 34, 56 - drop, 8, C.K); rrect(hipR[0] - 14, hipR[1] + 3, 28, 50 - drop, 6, STEEL3);
    ell(hipL[0], hipL[1] + 14, 15, 10, C.K); ell(hipL[0], hipL[1] + 14, 12, 7, STEEL); ell(hipR[0], hipR[1] + 14, 15, 10, C.K); ell(hipR[0], hipR[1] + 14, 12, 7, STEEL2);
    const sl = 6 * stepL, sr = 6 * stepR;
    rrect(footL[0] - 28, footL[1] - 28 - sl, 48, 28, 9, C.K); rrect(footL[0] - 25, footL[1] - 25 - sl, 42, 20, 7, LEATHER); Rh(footL[0] - 25, footL[1] - 6 - sl, 42, 3, C.N3);
    rrect(footR[0] - 20, footR[1] - 28 - sr, 48, 28, 9, C.K); rrect(footR[0] - 17, footR[1] - 25 - sr, 42, 20, 7, [[.15, C.N1], [.6, C.N2], [1, C.N3]]); Rh(footR[0] - 17, footR[1] - 6 - sr, 42, 3, C.N3);
    // the tabard from the neck: belt, buckle, gold hem, and the watch's eye
    const tw = 92 + 2 * bloat, tx = neck[0] - 46 - bloat, ty = neck[1];
    rrect(tx - 3, ty - 3, tw + 6, 104, 14, C.K); rrect(tx, ty, tw, 98, 11, [[.1, C.B0], [.55, C.B1], [.85, C.B2], [1, C.B3]]);
    Rh(hem[0] - 2, hem[1] - 22, 4, 22, C.K); Rh(hem[0] - 43 - bloat, hem[1] - 9, tw - 6, 4, C.G1); Rh(hem[0] - 43 - bloat, hem[1] - 5, tw - 6, 2, C.G2);
    Rh(belt[0] - 46 - bloat, belt[1], tw, 14, C.N3); Rh(belt[0] - 46 - bloat, belt[1] + 2, tw, 9, C.N2); Rh(belt[0] - 46 - bloat, belt[1] + 2, tw, 2, C.N1);
    rrect(belt[0] - 12, belt[1] - 4, 24, 22, 5, C.K); rrect(belt[0] - 9, belt[1] - 1, 18, 16, 3, GOLD); Rh(belt[0] - 4, belt[1] + 4, 8, 6, C.K);
    ell(neck[0], ty + 28, 24, 14, C.G2); ell(neck[0], ty + 28, 22, 12, GOLD); ell(neck[0], ty + 28, 16, 7, C.B3); ell(neck[0], ty + 28, 7, 6, C.W); ell(neck[0], ty + 28, 3, 3, C.K);
    // head, then the pauldrons. The drumstick follows the head up and down but not sideways.
    if (o.helmet === false) bareHD(head[0], head[1], o); else helmHD(head[0], head[1], o, sway);
    drumHD(o, neck, head);
    ell(shoulderL[0] + 4, shoulderL[1] - 7, 25, 20, C.K); ell(shoulderL[0] + 4, shoulderL[1] - 8, 22, 17, STEEL); Rh(shoulderL[0] - 3, shoulderL[1] - 13, 4, 4, C.S3);
    ell(shoulderR[0] - 4, shoulderR[1] - 7, 25, 20, C.K); ell(shoulderR[0] - 4, shoulderR[1] - 8, 22, 17, STEEL2); Rh(shoulderR[0] - 1, shoulderR[1] - 13, 4, 4, C.S4);
    // the arms and hands, by grip
    if (r.grip === 'hammer') {
      // the left hand steadies the work, the right swings a hammer
      armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); gauntHD(handL[0], handL[1]);
      armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); hammerHD(main); gauntHD(handR[0], handR[1]);
    } else if (r.grip === 'two') {
      // Both hands on the grip. The arm on the side the blade leans to is drawn first, so the
      // blade and its guard pass in front of it and no arm crosses over the steel.
      const right = Math.sin(main[2]) >= 0, up = right ? handR : handL, low = right ? handL : handR;
      if (right) armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); else armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]);
      P.swordHD(main[0], main[1], main[2]);
      if (right) armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); else armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]);
      gauntHD(up[0], up[1]); gauntHD(low[0], low[1]);
    } else {
      armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); gauntHD(handL[0], handL[1]);
      armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); gauntHD(handR[0], handR[1]);
    }
    effectsHD(o, neck, root);
  }

  /* ---- Drawing from the base pack ---------------------------------------------------------------
     start() reads the packs the carriers pushed, gathers them and resolves the default look. When
     that gives a look, the knight is drawn from its lists (packHD); otherwise from codeHD. The
     choice is made once, and KW.knight.source says which: 'pack' or 'code'.

     Each frame packHD runs the rig, copies its anchors and values into the two arrays pack.js's
     draw() reads, and walks the order sequence() gives for the grip and the helmet, drawing the
     look's lists and, between them, the engine's own steps above. Nothing is allocated for it. */
  const PK = { lib: null, look: null, A: null, Vs: null, from: null, iDrop: 0, iBloat: 0, iStepL: 0, iStepR: 0, iSway: 0,
    drop: [0, 0], bloat: [0, 0], hA: null, hV: null };
  const clampTo = (v, r) => (v < r[0] ? r[0] : v > r[1] ? r[1] : v);
  /* The pose's anchors and values into the library's arrays, in its order, the weapon frame's
     direction after the anchors, drop and bloat clamped into the ranges the library states. */
  function fillArrays(r) {
    const A = PK.A, from = PK.from, Vs = PK.Vs, v = r.values, m = r.anchors.main, lib = PK.lib;
    for (let i = 0; i < from.length; i++) { const p = from[i]; if (p) { A[2 * i] = p[0]; A[2 * i + 1] = p[1]; } }
    A[lib.FRAME_SX] = Math.sin(m[2]); A[lib.FRAME_SY] = -Math.cos(m[2]);
    Vs[PK.iDrop] = clampTo(v.drop, PK.drop); Vs[PK.iBloat] = clampTo(v.bloat, PK.bloat);
    Vs[PK.iStepL] = v.stepL; Vs[PK.iStepR] = v.stepR; Vs[PK.iSway] = v.sway;
  }
  /* The skin ramp for @skin.face: the swatch's sick ramp when the knight is ill, its hot ramp when
     overheated, and the list's own (the normal ramp) otherwise. */
  const faceRamp = o => (o.face === 'L' ? PK.look.colours.sick : o.face === 'P' ? PK.look.colours.hot : undefined);
  function packHD(o) {
    // The format has no drooping plume, so a pose that asks for one is drawn by code. No pose of
    // the page sets it.
    if (o.droop) { codeHD(o); return; }
    const r = rig(o, PK.look.m), lib = PK.lib, L = PK.look.lists, A = PK.A, Vs = PK.Vs;
    fillArrays(r);
    const { root, neck, head, main } = r.anchors, face = faceRamp(o);
    const mode = r.grip === 'two' ? (A[lib.FRAME_SX] >= 0 ? 'twoR' : 'twoL') : r.grip;
    const seq = lib.sequence(mode, o.helmet !== false);
    for (let i = 0; i < seq.length; i++) {
      switch (seq[i]) {
        case 'crates': cratesHD(o, neck); break;
        case 'face': faceHD(head[0], head[1], o); break;
        case 'drumstick': drumHD(o, neck, head); break;
        case 'hammer': hammerHD(main); break;
        case 'effects': effectsHD(o, neck, root); break;
        default: lib.draw(L[seq[i]], A, Vs, D, face);
      }
    }
  }
  /* The bare head with its head anchor at (hx, hy), as the house's sleeper wears it: the look's
     head group with the helmet off, and the face. */
  function packHead(hx, hy, o) {
    const A = PK.hA, h = 2 * PK.lib.ANCHOR.head;
    A[h] = hx; A[h + 1] = hy;
    PK.lib.draw(PK.look.lists.headOff, A, PK.hV, D, faceRamp(o));
    faceHD(hx, hy, o);
  }
  function knightHD(o) { if (PK.look) packHD(o); else codeHD(o); }

  /* Chooses, once at start-up, where the knight is drawn from. texts are the packs' files (the page
     passes KW.packText), and allowUnsigned is true only on a page whose version is 'dev'. Reads
     every text, gathers the packs and resolves the default look; if that gives a look with a
     two-handed weapon, the knight is drawn from it. Returns, and keeps in KW.knight.status,
     { source, base, refused, note }: base is { id, version, signed } of the base pack in use or
     null, refused lists { id, step, reason } for every pack turned away, and note is the one line
     for the console. */
  const cutTo = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
  function start(texts, allowUnsigned) {
    const lib = KW.pack, st = { source: 'code', base: null, refused: [], note: '' };
    const done = why => { st.note = 'knightwatcher: the knight is drawn from code: ' + why; KW.knight.source = st.source; KW.knight.status = st; return st; };
    PK.lib = null; PK.look = null; HANDS = [6, -30];
    if (!lib || typeof lib.read !== 'function') return done('the pack library is not loaded');
    const results = (Array.isArray(texts) ? texts : []).map(t => lib.read(t, { allowUnsigned: allowUnsigned === true }));
    const g = lib.gather(results);
    st.refused = g.rejected.map(r => ({ id: (r && r.id) || null, step: r && r.step, reason: String((r && r.reason) || '') }));
    const look = lib.resolve(g.packs, {});
    if (!look.ok) {
      const no = st.refused.find(r => r.id === lib.BASE_ID);
      return done(no ? 'the base pack ' + no.id + ' was refused at the ' + no.step + ' step: ' + cutTo(no.reason, 120) : 'no base pack is loaded');
    }
    if (!look.grip || look.grip.kind !== 'two' || look.grip.hands.length !== 2) return done('the base pack\'s weapon is not two-handed, and the poses hold one in both hands');
    const base = g.packs.get(lib.BASE_ID);
    Object.assign(PK, { lib, look, A: lib.newAnchors(), Vs: lib.newValues(), hA: lib.newAnchors(), hV: lib.newValues(),
      from: lib.ANCHORS.map(n => RIG.anchors[n] || null), drop: lib.RANGE.drop, bloat: lib.RANGE.bloat,
      iDrop: lib.VALUE.drop, iBloat: lib.VALUE.bloat, iStepL: lib.VALUE.stepL, iStepR: lib.VALUE.stepR, iSway: lib.VALUE.sway });
    HANDS = look.grip.hands.slice();
    st.source = 'pack'; st.base = { id: base.id, version: base.version, signed: base.signed };
    st.note = 'knightwatcher: the knight is drawn from the base pack ' + base.id + ' ' + base.version + (base.signed ? ', signed' : ', unsigned');
    KW.knight.source = st.source; KW.knight.status = st;
    return st;
  }

  /* The state of the knight for a condition id (see docs/state.md), at time t. gx and gy place the
     middle of the sword's grip in units of U from the knight's old corner (see rig), wang is the
     blade's angle. */
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
      // the engine turns the knight towards the gone thing's place
      case 'thing_down': o.mouth = 'frown'; break;
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

  /* head draws the knight's bare head with the corner of its 240 by 300 box at (ax, ay), as in bed:
     the head anchor is 120 right of that corner and 94 below it, from the pack or from code as the
     knight is. speech draws a speech bubble. rig and start are described above, build is the
     present knight's measurements, source is 'pack' or 'code' and status what start() found. */
  const headAtCorner = (ax, ay, o) => (PK.look ? packHead(ax + 120, ay + 94, o) : bareHD(ax + 120, ay + 94, o));
  KW.knight = { draw: knightHD, rig, build: BUILD, pose, swing, head: headAtCorner, speech: speechHD, start, source: 'code', status: null };
})(window.KW);
