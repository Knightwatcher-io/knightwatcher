/* Knightwatcher: the knight, on the fine grid. Open helm, red plume, blue tabard, a greatsword held
   in both hands, or from the base pack an arming sword in one hand and a heater shield in the
   other. pose() turns a condition into the knight's pose, rig() turns a pose into the points
   the knight is drawn on, and draw() draws it there: from the base pack when start() found one it
   can use (packHD), and otherwise from the code below (codeHD), which draws the same knight as it
   shipped before packs. rest.draw() draws the knight's gear where a scene sets it down, from the
   same source. start() and add() load the packs, fetchPacks() fetches the downloaded ones in
   data/packs/, and look() draws another look from the packs already loaded. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, SP = KW.sprites, P = KW.props, C = D.C, U = V.U;
  const { alpha, Rh, ell, rrect, poly, strip, lerp, ease, clamp01, STEEL, STEEL2, STEEL3, GOLD, LEATHER } = D;
  const SKINS = { F: [[.14, C.F0], [.72, C.F1], [1, C.F2]], L: [[.14, '#dff3bd'], [.72, '#b9dd92'], [1, '#94bd6e']], P: [[.14, '#ffc9b8'], [.72, '#ff9f8c'], [1, '#e07a66']] };
  /* The texts of the packs that ship with the page. Each carrier in packs/, loaded after this file,
     pushes its pack's file onto it, and start() reads them. */
  KW.packText = KW.packText || [];

  /* ---- The rig ----------------------------------------------------------------------------------
     Each frame rig(o) works out, from the pose and the build, the named points the knight is drawn
     on (the anchors) and the named numbers its shapes may lean on (the values). Every position the
     drawing uses is an anchor plus an offset.

     A build is eight measurements in grid pixels. The base pack has three: Classic (build A), the
     present knight, Broad (build B) and Slim (build C). The present knight is the reference: the
     values dShoulder to dHead are a build's measurements less these, so for the present knight they
     are all 0 and the terms that use them move nothing. On the pack path the knight is rigged on the
     look's build; the code path draws the present knight alone. */
  const BUILD = Object.freeze({ shoulder: 54, chest: 46, waist: 46, hip: 46, stance: 24, leg: 74, height: 132, head: 51 });
  /* The greatsword's two hand stations along its frame, upper and lower: the upper 2 above the grip's
     middle, low enough that its gauntlet stays clear of the guard, which starts 17 up. On the pack
     path they are the weapon's own, which for the base pack's greatsword are the same two. */
  let HANDS = [2, -30];
  /* How far the upper hand slides down the grip, in pixels along the frame, as the blade turns past
     level: none up to an angle of from, all of most from to on, and in proportion between. */
  const SLIDE = Object.freeze({ from: 1.4, to: 1.8, most: 2 });
  /* Whether the look's weapon is held in one hand, and whether a shield is in the other. rebuild()
     sets them from the resolved look; pose(), swing() and rig() read them. Only the pack path can
     hold a one-handed weapon: the code path is the greatsword. */
  let ONE = false, SHIELD = false;
  /* The look's weapon when it fires (format 1.2, docs/rig.md, Aiming and firing): { use, barrel,
     muzzle, range, shot, stowed } from the resolved look for a weapon whose use is "fire" or "both",
     and null for a weapon that only swings and on the code path. rebuild() sets it. */
  let FIRE = null;

  /* The rig's result, filled in place on every call so that drawing a frame allocates nothing for it.
     Each anchor is an [x, y] pair, except main, the weapon's frame, which is [x, y, angle]. off is
     the hand that holds the shield, which is always the left hand; the plume's mount is folded into
     the plume's shapes by pack.js, and rest is a scene's place, which KW.knight.rest sets, not the
     rig. grip is the grip mode: 'none', 'hammer', 'tool2', 'two' or 'one'. */
  const RIG = {
    grip: 'none',
    anchors: { root: [0, 0], footL: [0, 0], footR: [0, 0], hipL: [0, 0], hipR: [0, 0], hem: [0, 0], belt: [0, 0], neck: [0, 0],
      shoulderL: [0, 0], shoulderR: [0, 0], head: [0, 0], handL: [0, 0], handR: [0, 0], main: [0, 0, 0], off: [0, 0] },
    values: { drop: 0, bloat: 0, stepL: 0, stepR: 0, sway: 0, dShoulder: 0, dChest: 0, dWaist: 0, dHip: 0, dStance: 0, dLeg: 0, dHeight: 0, dHead: 0 },
  };
  const put = (p, x, y) => { p[0] = x; p[1] = y; };
  /* A hand of the smith's grip, h { at, off, pin }, placed from its shoulder sh in whole pixels: at
     the grid's point at, at the offset off from the shoulder, or between the two by pin. */
  function handAt(p, h, sh) {
    const w = h.pin == null ? (h.at ? 1 : 0) : h.pin, ax = h.at ? h.at[0] : 0, ay = h.at ? h.at[1] : 0;
    const ox = h.off ? sh[0] + h.off[0] : ax, oy = h.off ? sh[1] + h.off[1] : ay;
    put(p, Math.round(ox + (ax - ox) * w), Math.round(oy + (ay - oy) * w));
  }
  /* Where the left hand hangs when the smith's grip gives it no place: below its shoulder. */
  const TOOL_HAND = Object.freeze({ off: Object.freeze([-10, 48]) });

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
    // The upper body leans by o.lean whole pixels, to the right when positive: the neck, the
    // shoulders and the head move by it and the belt and the hem by half, the hips and the feet not
    // at all. Every list of the base pack hangs on these anchors, so a lean needs nothing of a pack.
    if (o.lean) {
      const l = Math.round(o.lean), hl = Math.round(o.lean / 2);
      A.neck[0] += l; A.shoulderL[0] += l; A.shoulderR[0] += l; A.head[0] += l; A.belt[0] += hl; A.hem[0] += hl;
    }

    // The grip, which places the hands and the weapon's frame.
    const m = A.main;
    if (o.tool) {
      // The smith's grip (o.tool, docs/rig.md): the act places each hand, at a point on the grid
      // (at), off its own shoulder (off), or between the two by pin (0 the shoulder's point, 1 the
      // grid's); the left hand may instead hold the tool, along pixels up its frame from the right
      // hand. The tool's frame is the right hand, at the angle a (0 straight up). A tool in one
      // hand is drawn in the hammer's order, one in both hands in tool2's.
      const T = o.tool;
      RIG.grip = T.two ? 'tool2' : 'hammer';
      handAt(A.handR, T.R, A.shoulderR);
      m[0] = A.handR[0]; m[1] = A.handR[1]; m[2] = T.a;
      if (T.L && T.L.along != null) put(A.handL, Math.round(m[0] + Math.sin(T.a) * T.L.along), Math.round(m[1] - Math.cos(T.a) * T.L.along));
      else handAt(A.handL, T.L || TOOL_HAND, A.shoulderL);
    } else if (o.sword !== false && ONE) {
      // One hand on the grip, at the weapon's one station along the frame, which the pose gives as
      // for the greatsword. As with both hands, the grip and the shield hand rise and sink with the
      // build's shoulder line (dHeight), so a pose holds its weapon where it does on the present
      // knight, relative to the body. The left hand holds the shield where the pose puts it, fx and
      // fy in units of U from the old corner; with no shield it hangs at the side as when the sword
      // is away, below its shoulder.
      RIG.grip = 'one';
      const a = o.wang || 0, gx = X - 120 + o.gx * U, gy = Y - 300 + o.gy * U + d - dHt, sx = Math.sin(a), sy = -Math.cos(a);
      m[0] = gx; m[1] = gy; m[2] = a;
      put(A.handR, gx + sx * HANDS[0], gy + sy * HANDS[0]);
      if (SHIELD) put(A.handL, X - 120 + o.fx * U, Y - 300 + o.fy * U + d - dHt);
      else put(A.handL, X - (64 + dSh + bw), Y - (84 + dHt) + d);
    } else if (o.sword !== false) {
      // Both hands on the grip, whose middle the pose gives in units of U from the old corner. The
      // hand on the side the blade leans to holds the upper station. The sums keep the order the
      // drawing has always used, since gx and gy are fractional in a swing. Once the blade is past
      // level, at the end of a cut and in the strike's bounce, the upper hand slides down the grip
      // (SLIDE), so that its gauntlet stays clear of the guard at every angle; a weapon aimed (o.aimed,
      // set by the aiming stances and fire()) has no guard, and the hand stays on its station. The
      // poses are written for the present knight; on another build the grip rises and sinks with the
      // shoulder line (dHeight), so the weapon is held where it is on the present knight, relative to
      // the body.
      RIG.grip = 'two';
      const a = o.wang || 0, gx = X - 120 + o.gx * U, gy = Y - 300 + o.gy * U + d - dHt, sx = Math.sin(a), sy = -Math.cos(a);
      m[0] = gx; m[1] = gy; m[2] = a;
      const up = sx >= 0 ? A.handR : A.handL, low = sx >= 0 ? A.handL : A.handR;
      const s0 = o.aimed ? HANDS[0] : HANDS[0] - SLIDE.most * clamp01((Math.abs(a) - SLIDE.from) / (SLIDE.to - SLIDE.from));
      put(up, gx + sx * s0, gy + sy * s0); put(low, gx + sx * HANDS[1], gy + sy * HANDS[1]);
    } else {
      // No weapon: the hands hang at the sides, or with the crate (the carrying grip) hold the
      // load against the chest by its lower corners, the arms round its sides; the frame rests at
      // the root. Hanging, each hand keeps its place below its own shoulder, so the arm is as long
      // and hangs as straight on every build as on the present knight.
      RIG.grip = 'none';
      if (o.crates) {
        const n = A.neck, w = carrySway(t), hx = CARRY.w / 2 + CARRY.hand[0], hy = CARRY.top + CARRY.h * CARRY.n + CARRY.hand[1];
        put(A.handL, n[0] - hx + w, n[1] + hy); put(A.handR, n[0] + hx + w, n[1] + hy);
      } else { put(A.handL, X - (64 + dSh + bw), Y - (84 + dHt) + d); put(A.handR, X + (64 + dSh + bw), Y - (84 + dHt) + d); }
      m[0] = X; m[1] = Y; m[2] = 0;
    }
    put(A.off, A.handL[0], A.handL[1]);
    return RIG;
  }

  /* ---- The head ---------------------------------------------------------------------------------
     Each takes the head anchor (hx, hy), the middle of the eye line. */
  /* The face's own colours on the code path: the cheeks, the puffed cheeks and the brows. On the
     pack path they are the look's (PK.look.colours), from its skin and hair swatches. */
  const CODE_FACE = Object.freeze({ face: SKINS.F, cheek: '#f3a892', puff: '#ff9f8c', brow: '#8a5a2b' });
  /* The brows' dark edge. A brow in the hair's brow colour can all but vanish on a skin of about its
     own lightness, dark brown brows on the deep skin or blonde ones on the tan, so where the brow's
     contrast with the skin it lies on is under BROW_MIN the brow gets a one-pixel edge in the
     outline colour. The skin is the look's normal face ramp, so the edge belongs to the look and
     does not come and go with the knight's state, and its bands are the ones the brows lie across,
     from a fifth to four fifths of the face's width. Contrast is the WCAG ratio of relative
     luminances. Today's knight, warm skin and brown brows at 2.94, draws no edge. The answer is
     kept for each ramp and brow, so a frame works nothing out after the first. */
  const BROW_MIN = 2.5, BROW_EDGES = new Map();
  function luminance(c) {
    let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c), v;
    if (m) v = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
    else if ((m = /^rgba?\((\d+),(\d+),(\d+)/.exec(String(c).replace(/\s/g, '')))) v = [+m[1], +m[2], +m[3]];
    else return null;
    const [r, g, b] = v.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  function browEdge(ramp, brow) {
    let seen = BROW_EDGES.get(ramp);
    if (!seen) { seen = new Map(); BROW_EDGES.set(ramp, seen); }
    let edge = seen.get(brow);
    if (edge === undefined) {
      const lb = luminance(brow), under = [];
      if (Array.isArray(ramp)) { let p = 0; for (const [f, c] of ramp) { if (f > 0.2 && p < 0.8) under.push(c); p = f; } } else under.push(ramp);
      edge = lb !== null && under.some(c => { const l = luminance(c); return l !== null && contrast(lb, l) < BROW_MIN; });
      seen.set(brow, edge);
    }
    return edge;
  }
  /* The colour of a skin ramp's middle band, the one across the middle of the face's width, which
     the lid of the half-closed eyes is filled with. */
  function midBand(ramp) {
    if (!Array.isArray(ramp)) return ramp;
    for (let i = 0; i < ramp.length; i++) if (ramp[i][0] >= .5) return ramp[i][1];
    return ramp[ramp.length - 1][1];
  }
  /* The face: the eyes, brows, cheeks and mouth. skin is the skin ramp the face is filled with this
     frame (the normal, sick or hot one) and fc the normal face ramp and the colours of the cheeks,
     the puffed cheeks and the brows: the code's own on the code path, the look's on the pack path. */
  function faceHD(hx, hy, o, skin, fc) {
    const lk = (o.look || 0) * 3, mid = midBand(skin), brow = fc.brow, edge = browEdge(fc.face, brow);
    if (!o.face) { ell(hx - 29, hy + 13, 7, 4, fc.cheek); ell(hx + 29, hy + 13, 7, 4, fc.cheek); }
    if (o.puff) { ell(hx - 31, hy + 12, 9, 8, fc.puff); ell(hx + 31, hy + 12, 9, 8, fc.puff); }
    for (const side of [-1, 1]) {
      const x = hx + side * 18, y = hy;
      switch (o.eyes) {
        case 'closed': Rh(x - 7, y + 4, 14, 3, C.K); Rh(x - 9, y + 1, 3, 4, C.K); Rh(x + 6, y + 1, 3, 4, C.K); break;
        case 'happy': Rh(x - 6, y - 3, 12, 3, C.K); Rh(x - 9, y - 1, 4, 5, C.K); Rh(x + 5, y - 1, 4, 5, C.K); break;
        case 'wide': ell(x, y, 10, 13, C.K); ell(x, y, 8, 11, C.W); ell(x + lk, y + 1, 4, 5, C.K); Rh(x + lk - 2, y - 2, 2, 2, C.W); if (edge) Rh(x - 7, y - 21, 14, 5, C.K); Rh(x - 6, y - 20, 12, 3, brow); break;
        case 'half': ell(x + lk, y + 2, 7, 9, C.K); Rh(x + lk - 3, y + 1, 3, 3, C.W); Rh(x - 10, y - 9, 20, 8, mid); Rh(x - 9, y - 2, 18, 3, C.K); break;
        case 'dizzy': strip(x - 7, y - 7, x + 7, y + 7, 2, 2, C.K); strip(x - 7, y + 7, x + 7, y - 7, 2, 2, C.K); break;
        case 'angry': ell(x + lk, y + 2, 7, 9, C.K); Rh(x + lk - 3, y - 1, 3, 3, C.W); strip(x + side * 10, y - 15, x - side * 9, y - 8, 2.5, 2.5, C.K); break;
        default: ell(x + lk, y, 7, 10, C.K); ell(x + lk, y + 4, 4, 4, '#4a3558'); Rh(x + lk - 4, y - 6, 4, 4, C.W); Rh(x + lk + 2, y + 3, 2, 2, C.W); if (edge) Rh(x - 7, y - 18, 14, 5, C.K); Rh(x - 6, y - 17, 12, 3, brow);
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
    faceHD(hx, hy, o, SKINS[o.face || 'F'], CODE_FACE);
  }
  /* The short crop, in the brown hair's three bands (H, light to dark), as kw.base's hair.short
     draws it: two small locks standing up at the crown, a cap that stops above the brow, short
     sideburns, a fringe of seven pointed locks with skin between their tips (each [left, right,
     tip x, tip y, band]), a line between each lock, lock lines from the crown, a sheen of the light
     band on the lit side and a glint. */
  const CROP_LOCKS = [[-50, -36, -36, -15, 1], [-38, -20, -22, -13, 0], [-22, -4, -6, -12, 1], [-6, 12, 10, -13, 0], [10, 28, 26, -14, 1], [28, 46, 44, -17, 2], [42, 56, 56, -20, 2]];
  const CROP_SEAMS = [[-37, -31.75], [-21, -15.75], [-5, .25], [11, 16.25], [29, 34.25], [43, 47.75]];
  const CROP_LINES = [[-4, -58, -26, -44, .75, 1], [0, -56, -8, -40, .75, 1], [6, -56, 14, -40, .75, 1], [10, -58, 34, -46, .75, 1], [-30, -36, -20, -44, .75, .75], [22, -36, 30, -44, .75, .75]];
  const GLINT = 'rgba(255,255,255,.4)';
  function cropHD(hx, hy) {
    const H = [C.N0, C.N1, C.N2], P = pts => pts.map(([x, y]) => [hx + x, hy + y]);
    poly(P([[-12, -66], [-2, -66], [-10, -82]]), C.K); poly(P([[-4, -66], [8, -66], [6, -84]]), C.K);
    rrect(hx - 58, hy - 67, 116, 40, 32, C.K); Rh(hx - 57, hy - 40, 10, 32, C.K); Rh(hx + 47, hy - 40, 10, 32, C.K);
    for (const [a, b, tx, ty] of CROP_LOCKS) poly(P([[a - 2, -30], [b + 2, -30], [tx, ty + 3]]), C.K);
    rrect(hx - 55, hy - 64, 110, 36, 29, [[.2, H[0]], [.7, H[1]], [1, H[2]]]);
    Rh(hx - 54, hy - 38, 6, 27, H[1]); Rh(hx + 48, hy - 38, 6, 27, H[2]); Rh(hx - 54, hy - 38, 2, 27, H[0]);
    for (const [a, b, tx, ty, c] of CROP_LOCKS) poly(P([[a, -31], [b, -31], [tx, ty]]), H[c]);
    for (const [x0, x1] of CROP_SEAMS) strip(hx + x0, hy - 30, hx + x1, hy - 24, .75, .5, H[2]);
    poly(P([[-10, -65], [-4, -65], [-8, -79]]), H[0]); poly(P([[-2, -65], [6, -65], [5, -80]]), H[1]);
    for (const [x0, y0, x1, y1, w0, w1] of CROP_LINES) strip(hx + x0, hy + y0, hx + x1, hy + y1, w0, w1, H[2]);
    strip(hx - 44, hy - 40, hx - 22, hy - 58, 2.5, 2, H[0]); strip(hx - 20, hy - 58, hx - 6, hy - 62, 2, 1.5, H[0]);
    Rh(hx - 34, hy - 54, 4, 2, GLINT); Rh(hx - 30, hy - 56, 3, 2, GLINT);
  }
  /* The bare head: ears, skull, hair and the face. */
  function bareHD(hx, hy, o) {
    const skin = SKINS[o.face || 'F'];
    for (const x of [-57, 57]) { ell(hx + x, hy + 4, 11, 14, C.K); ell(hx + x, hy + 4, 8, 11, skin); }
    rrect(hx - 54, hy - 56, 108, 104, 40, C.K); rrect(hx - 51, hy - 53, 102, 98, 37, skin);
    cropHD(hx, hy);
    faceHD(hx, hy, o, skin, CODE_FACE);
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
     Drawn by code on both paths, at their places in the order of one frame: the drumstick after the
     face, the crates after the pauldrons and before the arms, the smith's tool (the step hammer)
     between the right arm and its gauntlet, or with both hands on it between both arms and both
     gauntlets, and what floats around the knight after everything. */
  /* The load the knight carries against the chest on a full disk, from the neck anchor: n crates
     of w by h stacked, the top one's top edge top below the neck, and the carrying grip's hands at
     the bottom crate's lower corners, hand[0] outside its side and hand[1] above its foot. One
     crate of 80 by 64, a little larger than the cellar's, reads best there: it spans the chest
     inside the arms, and its top lies 50 below the head anchor, under the helmet's opening (whose
     foot is 34 below it) and under the bare chin (47). */
  const CARRY = Object.freeze({ w: 80, h: 64, n: 1, top: 6, hand: [4, -8] });
  /* The load's slow sway, which the hands follow. */
  const carrySway = t => Math.round(Math.sin(t / 900) * 2);
  /* A crate of w by h with its top left at (x, y), drawn as the cellar's crates are: an outline,
     planks, two braces, corner plates and a brass plate in the middle. */
  function crateHD(x, y, w, h) {
    Rh(x, y, w, h, C.K); Rh(x + 3, y + 3, w - 6, h - 6, C.N1);
    const pl = (h - 6) / 3;
    for (let j = 0; j < 3; j++) { Rh(x + 3, y + 3 + j * pl, w - 6, 2, C.N0); Rh(x + 3, y + 3 + (j + 1) * pl - 2, w - 6, 1, C.N3); }
    strip(x + 6, y + 6, x + w - 6, y + h - 6, 3, 3, C.N2); strip(x + w - 6, y + 6, x + 6, y + h - 6, 3, 3, C.N2);
    Rh(x + 3, y + 3, 6, h - 6, C.N2); Rh(x + w - 9, y + 3, 6, h - 6, C.N2);
    for (const [cx, cy] of [[3, 3], [w - 11, 3], [3, h - 11], [w - 11, h - 11]]) Rh(x + cx, y + cy, 8, 8, C.S4);
    rrect(x + w / 2 - 8, y + h / 2 - 7, 16, 14, 3, C.G2); rrect(x + w / 2 - 6, y + h / 2 - 5, 12, 10, 2, C.G1);
  }
  function cratesHD(o, neck) {
    if (!o.crates) return;
    const x = neck[0] - CARRY.w / 2 + carrySway(o.t);
    for (let i = 0; i < CARRY.n; i++) crateHD(x, neck[1] + CARRY.top + i * CARRY.h, CARRY.w, CARRY.h);
  }
  /* The drumstick follows the head up and down but not sideways. */
  function drumHD(o, neck, head) { if (o.food) SP.drum(neck[0] + 18, head[1] - 6 + (Math.floor(o.t / 160) % 2) * 5); }
  /* The smith's tools (o.tool.kind), drawn on the weapon's frame (main) at the engine's step
     hammer, in units along the frame from the right hand (s) and across it (p, towards the frame's
     right as it points up). The hammer: a handle from back behind the hand to handle along, and a
     head across the handle's end, thick either side of it, its striking face face out on the +p side
     and its peen peen out on the other. The tongs: two jaws from back behind the hand to len,
     crossing at pivot and open by open at their ends, holding a plain blade, the blank (no hilt, a
     tang of tang inside the jaws), len long and half either side. o.tool.heat, from 0 cold to 1
     white-hot, colours the blank by HEAT, and o.tool.cut, a y on the grid, leaves out whatever of
     the tongs and the blank points down past it, the water's face. A lever, the bellows' handle,
     is the scene's own drawing, and nothing is drawn here for it. */
  const TOOL = Object.freeze({
    hammer: Object.freeze({ back: 10, handle: 56, face: 20, peen: 15, thick: 12 }),
    tongs: Object.freeze({ back: 14, len: 60, pivot: 36, open: 4 }),
    blank: Object.freeze({ tang: 10, len: 96, half: 7 }) });
  /* The blank's colours by heat, hottest first: from each heat up, its body and its core. */
  const HEAT = Object.freeze([[.82, '#ffb000', '#fff3a0'], [.6, '#ff5a1e', '#ffb000'], [.38, '#cc352c', '#ff5a1e'], [.16, '#8f231d', '#cc352c']]);
  function toolHD(o, main) {
    const T = o.tool;
    if (!T) return;
    const x = main[0], y = main[1], a = main[2], ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
    const at = (s, p) => [x + ux * s + nx * p, y + uy * s + ny * p];
    const quad = (s0, s1, p0, p1) => [at(s0, p0), at(s1, p0), at(s1, p1), at(s0, p1)];
    if (T.kind === 'hammer') {
      const H = TOOL.hammer, e = H.handle;
      strip(...at(-H.back, 0), ...at(e, 0), 6, 6, C.K); strip(...at(-H.back + 2, 0), ...at(e - 2, 0), 3.5, 3.5, [[.3, C.N0], [.7, C.N1], [1, C.N2]]);
      poly(quad(e - H.thick - 3, e + H.thick + 3, -H.peen - 3, H.face + 3), C.K);
      poly(quad(e - H.thick, e + H.thick, -H.peen, H.face - 4), STEEL3);
      poly(quad(e - H.thick, e + H.thick, H.face - 4, H.face), STEEL);
      poly(quad(e - H.thick + 2, e - H.thick + 4, -H.peen + 2, H.face - 6), 'rgba(255,255,255,.35)');
      return;
    }
    if (T.kind !== 'tongs') return;
    const G = TOOL.tongs, B = TOOL.blank, end = G.len + B.len;
    // how far along the frame stays above the water's face
    const upto = T.cut != null && uy > .05 ? (T.cut - y) / uy : Infinity;
    const heat = clamp01(T.heat || 0), band = HEAT.find(h => heat >= h[0]);
    // the blank, from the jaws, and its glow while hot
    const b0 = G.len - B.tang, b1 = Math.min(end, upto);
    if (b1 > b0) {
      const bt = Math.min(b1, G.len + 2);
      strip(...at(b0, 0), ...at(bt, 0), 4, 4, C.K); strip(...at(b0, 0), ...at(bt, 0), 2, 2, band ? band[1] : C.S3);
      if (b1 > G.len) {
        const tip = Math.min(b1, end), full = Math.min(b1, end - 18);
        if (heat > .2) { const g = at((G.len + tip) / 2, 0); D.glow(g[0], g[1], 52, '#ff8a3d', .24 * heat); }
        const blade = (s0, w, out) => [at(s0, -w), at(full, -w)].concat(tip > full ? [at(tip + out, 0)] : []).concat([at(full, w), at(s0, w)]);
        poly(blade(G.len, B.half + 2, 2), C.K);
        poly(blade(G.len + 1, B.half, 0), band ? band[1] : STEEL2);
        poly(quad(G.len + 4, full - 4, -2, 2), band ? band[2] : 'rgba(255,255,255,.45)');
      }
    }
    // the jaws, over the blank's tang
    const j1 = Math.min(G.len + 4, upto);
    for (const sd of [-1, 1]) {
      const p0 = at(-G.back, sd * 3), p1 = at(G.pivot, 0), p2 = at(G.len + 4, sd * G.open);
      if (j1 <= G.pivot) { const q = at(j1, 0); strip(...p0, ...q, 3, 3, C.K); strip(...p0, ...q, 1.5, 1.5, C.S3); continue; }
      const q = j1 < G.len + 4 ? at(j1, sd * G.open * (j1 - G.pivot) / (G.len + 4 - G.pivot)) : p2;
      strip(...p0, ...p1, 3, 3, C.K); strip(...p1, ...q, 3, 3, C.K);
      strip(...p0, ...p1, 1.5, 1.5, C.S3); strip(...p1, ...q, 1.5, 1.5, C.S3);
    }
    const pv = at(G.pivot, 0); ell(pv[0], pv[1], 4, 4, C.K); ell(pv[0], pv[1], 2, 2, C.S2);
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
     pack can be used: the full knight, never anything plainer. */
  function codeHD(o) {
    const r = rig(o);
    const { root, footL, footR, hipL, hipR, hem, belt, neck, shoulderL, shoulderR, head, handL, handR, main } = r.anchors;
    const { drop, bloat, stepL, stepR, sway } = r.values;
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
    // the crates, held against the chest, under the arms
    cratesHD(o, neck);
    // the arms and hands, by grip
    if (r.grip === 'hammer') {
      // a tool in the right hand: the left arm and hand, then the right arm, the tool and the hand
      armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); gauntHD(handL[0], handL[1]);
      armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); toolHD(o, main); gauntHD(handR[0], handR[1]);
    } else if (r.grip === 'tool2') {
      // a tool in both hands: both arms, the tool, then both hands closed on it
      armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]);
      toolHD(o, main); gauntHD(handL[0], handL[1]); gauntHD(handR[0], handR[1]);
    } else if (r.grip === 'two') {
      // Both hands on the grip. Both arms are drawn before the blade, the one on the side it leans
      // to first, so the blade and its guard pass in front of them and no arm crosses the steel;
      // then the gauntlets, which close on the grip below the guard.
      const right = Math.sin(main[2]) >= 0, up = right ? handR : handL, low = right ? handL : handR;
      if (right) { armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); }
      else { armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); }
      P.swordHD(main[0], main[1], main[2]);
      gauntHD(up[0], up[1]); gauntHD(low[0], low[1]);
    } else {
      armHD(shoulderL[0], shoulderL[1], handL[0], handL[1]); gauntHD(handL[0], handL[1]);
      armHD(shoulderR[0], shoulderR[1], handR[0], handR[1]); gauntHD(handR[0], handR[1]);
    }
    effectsHD(o, neck, root);
  }

  /* ---- Drawing from the base pack ---------------------------------------------------------------
     Each frame packHD runs the rig, copies its anchors and values into the two arrays pack.js's
     draw() reads, and walks the order sequence() gives for the grip and the helmet, drawing the
     look's lists and, between them, the engine's own steps above. Nothing is allocated for it.
     PK.cur names the list being drawn, so that a throw inside one can be put down to its packs. */
  const PK = { lib: null, look: null, packs: null, A: null, Vs: null, from: null, iDrop: 0, iBloat: 0, iStepL: 0, iStepR: 0, iSway: 0,
    drop: [0, 0], bloat: [0, 0], hA: null, hV: null, rA: null, rV: null, cur: null,
    st: null, wanted: {}, readOpts: null, entries: [], extra: [], faults: [], bad: new Set(), logged: new Set(), lastNote: '' };
  const clampTo = (v, r) => (v < r[0] ? r[0] : v > r[1] ? r[1] : v);
  /* The pose's anchors and values into the library's arrays, in its order, the weapon frame's
     direction and flip after the anchors, drop and bloat clamped into the ranges the library
     states. o is the pose, whose aim decides the flip. */
  function fillArrays(r, o) {
    const A = PK.A, from = PK.from, Vs = PK.Vs, v = r.values, m = r.anchors.main, lib = PK.lib;
    for (let i = 0; i < from.length; i++) { const p = from[i]; if (p) { A[2 * i] = p[0]; A[2 * i + 1] = p[1]; } }
    A[lib.FRAME_SX] = Math.sin(m[2]); A[lib.FRAME_SY] = -Math.cos(m[2]); A[lib.FRAME_FL] = flipped(o, m[2]) ? 1 : 0;
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
    fillArrays(r, o);
    const { root, neck, head, main } = r.anchors, face = faceRamp(o);
    // In one hand, the sword's group goes behind the shield's while the sword hand is across the
    // middle line, on the shield's side.
    const mode = r.grip === 'two' ? (A[lib.FRAME_SX] >= 0 ? 'twoR' : 'twoL') : r.grip === 'one' ? (r.anchors.handR[0] < root[0] ? 'oneCrossed' : 'one') : r.grip;
    const seq = lib.sequence(mode, o.helmet !== false);
    for (let i = 0; i < seq.length; i++) {
      switch (seq[i]) {
        case 'crates': cratesHD(o, neck); break;
        case 'face': faceHD(head[0], head[1], o, face || PK.look.colours.face, PK.look.colours); break;
        case 'drumstick': drumHD(o, neck, head); break;
        case 'hammer': toolHD(o, main); break;
        case 'effects': effectsHD(o, neck, root); break;
        default: {
          // the body with the weapon's stowed view, while the weapon is put away and the scene
          // shows it at no rest place (o.stowed, which the engine sets)
          const n = seq[i] === 'body' && o.stowed && r.grip === 'none' && L.bodyStowed ? 'bodyStowed' : seq[i];
          PK.cur = n; lib.draw(L[n], A, Vs, D, face); PK.cur = null;
        }
      }
    }
  }
  /* The bare head with its head anchor at (hx, hy), as the house's sleeper wears it: the look's
     head group with the helmet off, and the face. */
  function packHead(hx, hy, o) {
    const A = PK.hA, h = 2 * PK.lib.ANCHOR.head;
    A[h] = hx; A[h + 1] = hy;
    try { PK.cur = 'headOff'; PK.lib.draw(PK.look.lists.headOff, A, PK.hV, D, faceRamp(o)); PK.cur = null; } catch (e) { caught(e); return; }
    faceHD(hx, hy, o, faceRamp(o) || PK.look.colours.face, PK.look.colours);
  }
  /* A throw inside a compiled list, which the checks should make impossible: the packs behind the
     list are marked bad, and the knight is drawn by the rules of start() from the next frame. A
     throw anywhere else is not a pack's and goes on. */
  function caught(e) {
    const list = PK.cur;
    PK.cur = null;
    if (!list) throw e;
    fault(list, e);
  }
  function knightHD(o) {
    if (!PK.look) { codeHD(o); return; }
    try { packHD(o); } catch (e) { caught(e); }
  }

  /* ---- Gear at rest -----------------------------------------------------------------------------
     The house and the smithy show the knight's gear off the knight: the helmet on the stool, the
     weapon on the pegs and across the anvil. A scene asks for an item by its slot in its own paint
     or draw, so the item stays layered with the scene's art, and gets what is equipped: from the
     look's lists on the pack path, and from the code below on the code path.

     The helmet is drawn from its rest view, with the plume's rest view on the view's plume mount,
     on the rest anchor at the scene's place. A helmet with no rest view shows nothing there. The
     weapon needs no rest view: its worn shapes are drawn on a frame the scene fixes, and an angle of
     pi/2 lays it flat. The shield hangs on a wall from its rest view, the rest anchor at the top
     middle of the scene's 'hang' place; with no shield equipped, or one with no rest view, nothing
     hangs there. None of them moves with the knight, so every named value is 0 for them. */

  /* The open helm resting on a surface, its small plume on top, x its middle and y its foot. */
  function helmRestHD(x, y) {
    ell(x + 6, y - 58, 18, 10, C.K); ell(x + 6, y - 58, 15, 7, [[.3, C.R0], [.75, C.R1], [1, C.R2]]); ell(x + 18, y - 52, 9, 6, C.K); ell(x + 18, y - 52, 6, 4, C.R2);
    rrect(x - 32, y - 56, 64, 54, 24, C.K); rrect(x - 29, y - 53, 58, 48, 21, STEEL);
    Rh(x - 2, y - 52, 3, 16, C.S0); Rh(x + 1, y - 52, 1, 16, C.S3);
    rrect(x - 20, y - 38, 40, 30, 9, C.K); rrect(x - 17, y - 35, 34, 24, 7, [[.5, '#14101c'], [1, '#0b0810']]);
    rrect(x - 28, y - 10, 56, 9, 3, C.K); rrect(x - 26, y - 9, 52, 6, 2, STEEL2);
    for (const dx of [-24, 24]) { ell(x + dx, y - 24, 2, 2, C.S4); }
  }
  /* The greatsword's blade on the code path: the inner edges of the blade along its frame, as
     swordHD draws them. */
  const SWORD_BLADE = Object.freeze({ from: 34, to: 263, half: 15 });
  /* Its point, as swordHD draws its outline: full width to s 236, tapering to the tip at s 270. */
  const SWORD_POINT = Object.freeze({ at: 236, to: 270 });

  /* Draws the equipped item of slot at rest: 'helmet' with the rest anchor at (x, y), its foot's
     middle on a surface; 'off' with the rest anchor at (x, y), the top middle of a 'hang' place; or
     'main' with the middle of its grip at (x, y) along the angle a (0 is straight up). Any other
     slot draws nothing, and so does 'off' on the code path, which has no shield. */
  function restHD(slot, x, y, a) {
    if (!PK.look) { if (slot === 'helmet') helmRestHD(x, y); else if (slot === 'main') P.swordHD(x, y, a); return; }
    const lib = PK.lib, A = PK.rA;
    try {
      if (slot === 'helmet') {
        const r = 2 * lib.ANCHOR.rest;
        A[r] = x; A[r + 1] = y;
        PK.cur = 'restHelmet'; lib.draw(PK.look.lists.restHelmet, A, PK.rV, D); PK.cur = null;
      } else if (slot === 'off') {
        // the shield's rest view, hung on the rest anchor at the top middle of a 'hang' place
        const r = 2 * lib.ANCHOR.rest;
        A[r] = x; A[r + 1] = y;
        PK.cur = 'restOff'; lib.draw(PK.look.lists.restOff, A, PK.rV, D); PK.cur = null;
      } else if (slot === 'main') {
        const m = 2 * lib.ANCHOR.main;
        A[m] = x; A[m + 1] = y; A[lib.FRAME_SX] = Math.sin(a); A[lib.FRAME_SY] = -Math.cos(a);
        PK.cur = 'main'; lib.draw(PK.look.lists.main, A, PK.rV, D); PK.cur = null;
      }
    } catch (e) { caught(e); }
  }
  /* The equipped weapon's reach, { from, to, half } in frame units: its blade when it gives one,
     else its barrel when it fires, else null. A scene spaces the pegs from it, and the engine
     measures a swing with it; the smithy's hot tip is drawn on it only for a weapon that is swung
     (one that only fires has no blade to heat). A weapon that is both swung and fired gives its
     blade. */
  const restReach = () => (PK.look ? PK.look.blade || PK.look.barrel || null : SWORD_BLADE);
  /* The equipped weapon's head, as drawn, for the engine's reach (bladeOf in engine.js): null for a
     weapon whose blade's outline holds its drawing beyond the blade's middle (the swords, whose
     blades are as wide there as their outline, half and 4 more), for one with no blade, and on the
     code path. A weapon whose drawing is wider there by a pixel or more has a head that the outline
     does not describe (the mace's flanges, on a haft narrower than its blade's half), and the engine
     measures the drawing instead: { pieces, to, half, bc, br }, the pieces of the weapon's list that
     reach past the hand (from 3 short of the blade's start), in frame units, each a circle
     { c: [s, p], r } or a convex polygon { pts: [[s, p], ...] } counter-clockwise, to the furthest any
     reaches along the frame, half the furthest across it, and bc and br the circle around them all. An ellipse that is not a circle, a rounded rectangle
     and a pixel shape count as the box around them. Worked out once for each look, by drawing the
     weapon's list on a frame of its own, upright with its grip at 0, 0. */
  let headLook = null, headOf = null, pointOf = null;
  function restHead() {
    if (!PK.look) return null;
    measureLook();
    return headOf;
  }
  /* The equipped blade's point, as drawn, for the engine's reach (bladeOf in engine.js): { at, to }
     in frame units, the outline full width as far as s at and tapering to its tip at s to, as the
     outline the weapon's list draws does. null for a weapon with no blade and for one measured by
     its head (restHead); on the code path the greatsword's, as swordHD draws it. Worked out with the
     head, once for each look. */
  function restPoint() {
    if (!PK.look) return SWORD_POINT;
    measureLook();
    return pointOf;
  }
  function measureLook() {
    if (PK.look === headLook) return;
    headLook = PK.look; headOf = null; pointOf = null;
    let pieces = null;
    try { pieces = drawnPieces(PK.look); } catch (e) { pieces = null; }
    if (!pieces) return;
    try { headOf = drawnHead(PK.look, pieces); } catch (e) { headOf = null; }
    if (!headOf) try { pointOf = drawnPoint(PK.look, pieces); } catch (e) { pointOf = null; }
  }
  /* The pieces the weapon's list draws, in frame units, upright with its grip at 0, 0: each a circle
     { c: [s, p], r } or a convex polygon { pts: [[s, p], ...] } counter-clockwise. An ellipse that
     is not a circle, a rounded rectangle and a pixel shape count as the box around them. null for a
     weapon with no blade. */
  function drawnPieces(look) {
    const b = look.blade, lib = PK.lib;
    if (!b || !look.lists.main) return null;
    // upright, the frame's s runs up the screen and p to the right: a point drawn at (x, y) is [-y, x]
    const pieces = [], A = lib.newAnchors(), at = (x, y) => [-y, x];
    A[lib.FRAME_SX] = 0; A[lib.FRAME_SY] = -1;
    const poly = pts => {
      const q = pts.map(([x, y]) => at(x, y));
      let area = 0;
      for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; area += u[0] * v[1] - v[0] * u[1]; }
      if (Math.abs(area) > 1e-9) pieces.push({ pts: area > 0 ? q : q.reverse() });
    };
    const box = (x, y, w, h) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    const rec = {
      Rh: box, Rv: box, rrect: box, pix: box, poly,
      ell: (cx, cy, rx, ry) => (rx === ry ? pieces.push({ c: at(cx, cy), r: rx }) : box(cx - rx, cy - ry, 2 * rx, 2 * ry)),
      // as draw.js draws a strip: the four corners of the band from (x0, y0) to (x1, y1)
      strip: (x0, y0, x1, y1, hw0, hw1) => {
        const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
        poly([[x0 - px * hw0, y0 - py * hw0], [x1 - px * hw1, y1 - py * hw1], [x1 + px * hw1, y1 + py * hw1], [x0 + px * hw0, y0 + py * hw0]]);
      }
    };
    lib.draw(look.lists.main, A, PK.rV, rec);
    return pieces;
  }
  const sOf = pc => (pc.c ? [pc.c[0] - pc.r, pc.c[0] + pc.r] : [Math.min(...pc.pts.map(q => q[0])), Math.max(...pc.pts.map(q => q[0]))]);
  /* How far across the frame a piece reaches beyond s0 along it. */
  function across(pc, s0) {
    if (pc.c) { const [cs, cp] = pc.c, r = pc.r; return cs + r <= s0 ? 0 : Math.abs(cp) + (cs >= s0 ? r : Math.sqrt(r * r - (s0 - cs) * (s0 - cs))); }
    let w = 0;
    for (let i = 0; i < pc.pts.length; i++) {
      const u = pc.pts[i], v = pc.pts[(i + 1) % pc.pts.length];
      if (u[0] >= s0) w = Math.max(w, Math.abs(u[1]));
      if ((u[0] - s0) * (v[0] - s0) < 0) w = Math.max(w, Math.abs(u[1] + (v[1] - u[1]) * (s0 - u[0]) / (v[0] - u[0])));
    }
    return w;
  }
  /* The blade's point as drawn: the tip is as far as any piece reaches along the frame, and the
     taper starts where the drawing beyond is last as wide as it is at the blade's middle. null when
     the drawing does not reach past the middle. */
  function drawnPoint(look, pieces) {
    const b = look.blade, wideAt = s0 => Math.max(0, ...pieces.map(pc => across(pc, s0)));
    const mid = (b.from + b.to) / 2, full = wideAt(mid), to = Math.max(...pieces.map(pc => sOf(pc)[1]));
    if (!(to > mid) || !(full > 0)) return null;
    let lo = mid, hi = to;
    for (let i = 0; i < 40; i++) { const s = (lo + hi) / 2; if (wideAt(s) >= full - 1e-6) lo = s; else hi = s; }
    return Object.freeze({ at: Math.round(lo * 100) / 100, to });
  }
  function drawnHead(look, pieces) {
    const b = look.blade;
    const mid = (b.from + b.to) / 2, wide = Math.max(0, ...pieces.map(pc => across(pc, mid)));
    if (wide - (b.half + 4) < 1) return null;
    // a piece wholly inside another (an inner fill inside its outline) adds nothing to the reach;
    // each kept piece carries the circle around it, bc and br, so the engine can pass it by quickly
    const within = (pc, s, p, r) => (pc.c ? Math.hypot(s - pc.c[0], p - pc.c[1]) + r <= pc.r + 1e-9
      : pc.pts.every((u, i) => { const v = pc.pts[(i + 1) % pc.pts.length], es = v[0] - u[0], ep = v[1] - u[1]; return (es * (p - u[1]) - ep * (s - u[0])) / Math.hypot(es, ep) >= r - 1e-9; }));
    const holds = (big, pc) => big !== pc && (pc.c ? within(big, pc.c[0], pc.c[1], pc.r) : pc.pts.every(q => within(big, q[0], q[1], 0)));
    const past = pieces.filter(pc => sOf(pc)[1] >= b.from - 3), kept = past.filter((pc, i) => !past.some((big, j) => holds(big, pc) && !(j > i && holds(pc, big))));
    for (const pc of kept) {
      if (pc.c) { pc.bc = pc.c; pc.br = pc.r; continue; }
      const n = pc.pts.length, c = [pc.pts.reduce((a, q) => a + q[0], 0) / n, pc.pts.reduce((a, q) => a + q[1], 0) / n];
      pc.bc = c; pc.br = Math.max(...pc.pts.map(q => Math.hypot(q[0] - c[0], q[1] - c[1])));
    }
    // and the circle around the whole head, from the middle of the pieces' circles
    const lo = Math.min(...kept.map(pc => pc.bc[0] - pc.br)), hi = Math.max(...kept.map(pc => pc.bc[0] + pc.br)), bc = [(lo + hi) / 2, 0];
    return Object.freeze({ pieces: kept, to: Math.max(...kept.map(pc => sOf(pc)[1])), half: Math.max(...kept.map(pc => across(pc, -Infinity))),
      bc, br: Math.max(...kept.map(pc => Math.hypot(pc.bc[0] - bc[0], pc.bc[1] - bc[1]) + pc.br)) });
  }
  /* What a scene adds to its backdrop key for an item it paints at rest: the equipped item's name,
     '<pack>/<item>', or '' when none is equipped; 'code' on the code path. */
  const restKey = slot => (PK.look ? PK.look.look.items[slot] || '' : 'code');
  /* Whether the equipped item of slot may be drawn at rest in the place pl, { kind, w, h }: its rest
     view's fits is the place's kind and its box no wider than w nor taller than h. The weapon has
     no rest view and lies on the scene's frame, so it always may; so may an item with no rest view,
     which draws nothing, and anything on the code path, which draws what the scenes always held. */
  function restFits(slot, pl) {
    const n = PK.look && slot !== 'main' ? PK.look.look.items[slot] : null;
    if (!n) return true;
    const p = PK.packs.get(n.slice(0, n.indexOf('/'))), it = p && p.data.items ? p.data.items[n.slice(n.indexOf('/') + 1)] : null, v = it && it.rest;
    return !v || (v.fits === pl.kind && v.box[0] <= pl.w && v.box[1] <= pl.h);
  }

  /* ---- Loading the packs ------------------------------------------------------------------------
     start() reads the packs that ship with the page, add() the ones fetchPacks() fetched, and each
     time the packs in use are gathered again and the look resolved (rebuild). Every pack goes
     through KW.pack.read with the same options: a signature is required unless the page is 'dev'.
     The rules of docs/library.md, "When packs fail", in order:

     1. A pack refused by read(), turned away by gather(), or whose list throws while drawing goes
        into status.refused as { id, file, step, reason }, and to the console once.
     2. Anything the look names that is missing takes the base pack's default (resolve() does it);
        status.fallbacks lists each.
     3. With no usable base pack the knight is drawn from code, the full knight as it shipped
        before packs.
     4. A throw inside a compiled list marks the packs behind that list bad (see fault()).

     The console gets one line for each refused pack and one each time the source changes:
     console.info when the knight is drawn from the base pack and console.warn when from code. */
  const cutTo = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
  const say = (level, line) => { const c = typeof console !== 'undefined' ? console : null; if (c && typeof c[level] === 'function') c[level](line); };
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const refusal = (r, file) => ({ id: (r && typeof r.id === 'string' && r.id) || null, file: typeof file === 'string' ? file : null,
    step: String((r && r.step) || 'size'), reason: String((r && r.reason) || '') });
  /* The slots behind each list, to put a throw down to the packs that gave them. head is the
     build's head item, from the pack that gives the build. */
  const LIST_SLOTS = { body: ['back', 'legs', 'boots', 'torso'], headOn: ['hair', 'plume', 'helmet'], headOff: ['head', 'hair'], pauldrons: ['pauldrons'],
    armL: ['arms'], armR: ['arms'], gauntL: ['gauntlets'], gauntR: ['gauntlets'], main: ['main'], off: ['off'], restHelmet: ['helmet', 'plume'], restOff: ['off'],
    bodyStowed: ['back', 'legs', 'boots', 'torso', 'main'] };

  /* Gathers the packs not marked bad, resolves the look and chooses the source. */
  function rebuild() {
    const st = PK.st, lib = PK.lib;
    PK.look = null; PK.packs = null; HANDS = [2, -30]; ONE = false; SHIELD = false; FIRE = null;
    st.base = null; st.fallbacks = [];
    if (!lib) { st.refused = PK.extra.concat(PK.faults); st.source = 'code'; st.note = 'knightwatcher: the knight is drawn from code: the pack library is not loaded'; return; }
    const g = lib.gather(PK.entries.filter(e => !PK.bad.has(e.result)).map(e => e.result));
    st.refused = g.rejected.map(r => {
      const e = PK.entries.find(x => x.result === r) || PK.entries.find(x => x.result.ok && r && x.result.id === r.id && g.packs.get(r.id) !== x.result);
      return refusal(r, e && e.file);
    }).concat(PK.extra, PK.faults);
    const look = lib.resolve(g.packs, PK.wanted);
    // The poses hold a weapon in both hands at two stations, or in one hand at one. The library's
    // checks make any other grip impossible; this is the last guard before the poses rely on it.
    const held = l => !!(l.grip && ((l.grip.kind === 'two' && l.grip.hands.length === 2) || (l.grip.kind === 'one' && l.grip.hands.length === 1)));
    let why = '';
    if (!look.ok) {
      // the base pack's last refusal names the step; its reason has a line of its own
      const no = st.refused.filter(r => r.id === lib.BASE_ID).pop();
      why = no ? 'the base pack ' + lib.BASE_ID + ' was refused at the ' + no.step + ' step' : 'no base pack is loaded';
    } else if (!held(look)) why = 'the look\'s weapon has no grip the poses can hold';
    if (why) { st.source = 'code'; st.note = 'knightwatcher: the knight is drawn from code: ' + why; return; }
    const base = g.packs.get(lib.BASE_ID);
    PK.look = look; PK.packs = g.packs; HANDS = look.grip.hands.slice();
    // resolve() keeps a shield only with a one-handed weapon
    ONE = look.grip.kind === 'one'; SHIELD = ONE && !!look.look.items.off;
    // resolve() gives a weapon's use, barrel, muzzle, range and shot only when it fires
    if (look.use) FIRE = Object.freeze({ use: look.use, barrel: look.barrel, muzzle: look.muzzle, range: look.range, shot: look.shot, stowed: look.stowed });
    st.source = 'pack'; st.base = { id: base.id, version: base.version, signed: base.signed }; st.fallbacks = look.fallbacks;
    st.note = 'knightwatcher: the knight is drawn from the base pack ' + base.id + ' ' + base.version + (base.signed ? ', signed' : ', unsigned');
  }
  /* Writes what is new to the console: each refused pack once, and the source when it changed. */
  function report() {
    const st = PK.st;
    for (const r of st.refused) {
      const k = [r.id, r.file, r.step, r.reason].join('\u0000');
      if (PK.logged.has(k)) continue;
      PK.logged.add(k);
      say('warn', 'knightwatcher: the pack ' + (r.id || r.file || 'with no id') + ' was refused at the ' + r.step + ' step: ' + cutTo(r.reason, 120));
    }
    if (st.note !== PK.lastNote) { PK.lastNote = st.note; say(st.source === 'pack' ? 'info' : 'warn', st.note); }
    KW.knight.source = st.source; KW.knight.status = st;
  }
  /* A throw inside the list named: the packs that gave its slots are marked bad, the base pack only
     when no other pack gave any, and the knight is drawn without them from the next frame. */
  function fault(list, err) {
    const lib = PK.lib, items = PK.look.look.items, base = PK.packs.get(lib.BASE_ID), suspects = [];
    for (const slot of LIST_SLOTS[list] || []) {
      // the head is the build's own head item, from the pack that gives the build
      const n = slot === 'head' ? PK.look.look.build : items[slot];
      const p = typeof n === 'string' ? PK.packs.get(n.slice(0, n.indexOf('/'))) : null;
      if (p && !suspects.includes(p)) suspects.push(p);
    }
    const others = suspects.filter(p => p !== base), blame = others.length ? others : [base];
    let msg = '';
    try { msg = String(err && err.message !== undefined ? err.message : err); } catch (e2) { msg = 'something that cannot be named'; }
    for (const p of blame) {
      PK.bad.add(p);
      const e = PK.entries.find(x => x.result === p);
      PK.faults.push(refusal({ id: p.id, step: 'draw', reason: 'the ' + list + ' list threw while drawing: ' + cutTo(msg, 120) }, e && e.file));
    }
    rebuild(); report();
  }

  /* Starts the knight from the texts of the packs that ship with the page (the page passes
     KW.packText), once at start-up. allowUnsigned is true only on a page whose version is 'dev'.
     opts may hold look, the look to draw ({} by default, the base pack's defaults), and keys, which
     replaces KEYS in read() and is for the tests only. Returns, and keeps in KW.knight.status,
     { source, base, refused, fallbacks, note }: source is 'pack' or 'code', base is { id,
     version, signed } of the base pack in use or null, refused lists { id, file, step, reason } for
     every pack turned away, fallbacks lists what of the look took the base pack's default, and note
     is the line for the console. */
  function start(texts, allowUnsigned, opts) {
    const o = isObj(opts) ? opts : {}, lib = KW.pack && typeof KW.pack.read === 'function' ? KW.pack : null;
    const st = { source: 'code', base: null, refused: [], fallbacks: [], note: '' };
    Object.assign(PK, { lib, look: null, packs: null, cur: null, st, wanted: isObj(o.look) ? o.look : {}, readOpts: { allowUnsigned: allowUnsigned === true },
      entries: [], extra: [], faults: [], bad: new Set(), logged: new Set(), lastNote: '' });
    if (isObj(o.keys)) PK.readOpts.keys = o.keys;
    if (lib) {
      Object.assign(PK, { A: lib.newAnchors(), Vs: lib.newValues(), hA: lib.newAnchors(), hV: lib.newValues(), rA: lib.newAnchors(), rV: lib.newValues(),
        from: lib.ANCHORS.map(n => RIG.anchors[n] || null), drop: lib.RANGE.drop, bloat: lib.RANGE.bloat,
        iDrop: lib.VALUE.drop, iBloat: lib.VALUE.bloat, iStepL: lib.VALUE.stepL, iStepR: lib.VALUE.stepR, iSway: lib.VALUE.sway });
      for (const t of Array.isArray(texts) ? texts : []) PK.entries.push({ result: lib.read(t, PK.readOpts), file: null });
    }
    rebuild(); report();
    return st;
  }
  /* Adds what fetchPacks() found, { files: [{ file, text }], refused }, to the packs in use: each
     file is read with the options start() was given, and the look resolved again. Returns the
     status, or null before start(). */
  function add(got) {
    if (!PK.st) return null;
    const g = isObj(got) ? got : {};
    for (const r of Array.isArray(g.refused) ? g.refused : []) PK.extra.push(refusal(r, r && r.file));
    for (const f of Array.isArray(g.files) ? g.files : []) {
      if (!isObj(f)) continue;
      PK.entries.push({ result: PK.lib ? PK.lib.read(f.text, PK.readOpts) : { ok: false, step: 'size', reason: 'the pack library is not loaded' }, file: typeof f.file === 'string' ? f.file : null });
    }
    rebuild(); report();
    return PK.st;
  }
  /* Draws a new look from the packs already in use, those that ship with the page and those add()
     added alike, with the rules start() was given: nothing is read again, and a pack refused or
     marked bad stays so. look is as start()'s opts.look ({} for the base pack's defaults). The
     settings screen calls it on every choice. Returns the status, or null before start(). */
  function setLook(look) {
    if (!PK.st) return null;
    PK.wanted = isObj(look) ? look : {};
    rebuild(); report();
    return PK.st;
  }
  /* The base pack in use, as the pack library read it (its builds, items, swatches and defaults,
     frozen), or null on the code path. The settings screen takes its choices from it. */
  const basePack = () => (PK.look ? PK.packs.get(PK.lib.BASE_ID).data : null);
  /* ---- Downloaded packs -------------------------------------------------------------------------
     The downloaded packs lie in data/packs/ beside state.json, put there by hand (the collector
     downloads none yet), with index.json naming
     them: { "packs": ["<file>.pack.json", ...] }, names only. fetchPacks(get, root) fetches the
     index and then each file it names, as text, with get (the page passes window.fetch): never as
     script, never from outside data/packs/, each fetch with cache 'no-store', no redirects, and cut
     off after four seconds. root is the way from the page to the folder data/ lies in: '' for the
     display (the default), '../' for the admin page at admin/, and nothing else. A missing index
     (404) means no packs and is silent. Returns { files: [{ file, text }], refused }, which add()
     takes, and which KW.world.start() reads again; nothing is read here. */
  const PACK_DIR = 'data/packs/', CUT_MS = 4000;
  const INDEX = Object.freeze({ files: 32, bytes: 16 * 1024, name: 64 });
  /* A pack file's name: lower-case letters, digits, '-' and '_', dots between them but never two in
     a row, ending in .pack.json. No slash, so no path. */
  const PACK_FILE = /^[a-z0-9](?:[a-z0-9_-]|\.(?!\.))*\.pack\.json$/;
  /* Checks a parsed index. Returns { ok: false, reason } when the index as a whole cannot be used,
     and otherwise { ok: true, files, refused }: the names to fetch, and a refusal for each entry
     that is not a pack file's name or is listed twice. Other keys are ignored. */
  function packIndex(v) {
    if (!isObj(v)) return { ok: false, reason: 'the index must be a JSON object' };
    if (!Array.isArray(v.packs)) return { ok: false, reason: 'packs: must be a list of file names' };
    if (v.packs.length > INDEX.files) return { ok: false, reason: 'packs: lists ' + v.packs.length + ' files, and at most ' + INDEX.files + ' are read' };
    const files = [], refused = [];
    v.packs.forEach((n, i) => {
      const why = typeof n !== 'string' ? 'is not a file name'
        : n.length > INDEX.name ? 'is longer than ' + INDEX.name + ' characters'
        : !PACK_FILE.test(n) ? 'is not the name of a pack file in data/packs/ (a name only, ending in .pack.json)'
        : files.includes(n) ? 'is listed twice' : '';
      if (why) refused.push({ id: null, file: typeof n === 'string' ? cutTo(n, INDEX.name) : null, step: 'index', reason: 'packs[' + i + ']: ' + why });
      else files.push(n);
    });
    return { ok: true, files, refused };
  }
  /* One fetch as text: { ok: true, text }, { missing: true } for a 404, or { ok: false, reason }. */
  async function fetchText(get, url, max) {
    const ctl = new AbortController(), cut = setTimeout(() => ctl.abort(), CUT_MS);
    try {
      const r = await get(url, { cache: 'no-store', redirect: 'error', signal: ctl.signal });
      if (r.status === 404) return { missing: true };
      if (!r.ok) return { ok: false, reason: 'the server answered ' + r.status };
      const len = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('content-length') : NaN);
      if (len > max) return { ok: false, reason: 'the file is larger than ' + max / 1024 + ' KiB' };
      const text = await r.text();
      if (typeof text !== 'string') return { ok: false, reason: 'the file could not be read as text' };
      if (text.length > max) return { ok: false, reason: 'the file is larger than ' + max / 1024 + ' KiB' };
      return { ok: true, text };
    } catch (e) {
      return { ok: false, reason: ctl.signal.aborted ? 'no answer within four seconds' : 'the file could not be fetched' };
    } finally { clearTimeout(cut); }
  }
  async function fetchPacks(get, root) {
    const out = { files: [], refused: [] };
    const no = (file, step, reason) => { out.refused.push({ id: null, file, step, reason }); };
    if (typeof get !== 'function') return out;
    // the folder, from the page itself or from the admin page one level down, and nowhere else
    const dir = (root === '../' ? root : '') + PACK_DIR;
    const ix = await fetchText(get, dir + 'index.json', INDEX.bytes);
    if (ix.missing) return out;
    if (!ix.ok) { no('index.json', 'index', ix.reason); return out; }
    let v;
    try { v = JSON.parse(ix.text); } catch (e) { no('index.json', 'index', 'the index is not valid JSON'); return out; }
    const list = packIndex(v);
    if (!list.ok) { no('index.json', 'index', list.reason); return out; }
    out.refused.push(...list.refused);
    const max = KW.pack && KW.pack.LIMITS ? KW.pack.LIMITS.text : 512 * 1024;
    const got = await Promise.all(list.files.map(f => fetchText(get, dir + f, max)));
    got.forEach((g, i) => {
      if (g.ok) out.files.push({ file: list.files[i], text: g.text });
      else no(list.files[i], 'fetch', g.missing ? 'the file the index names is missing' : g.reason);
    });
    return out;
  }

  /* The state of the knight for a condition id (see docs/state.md), at time t. gx and gy place the
     middle of the sword's grip in units of U from the knight's old corner (see rig), wang is the
     blade's angle, and with a weapon in one hand fx and fy place the shield hand in the same units.
     BASE is the greatsword's stance. BASE1 is the one-handed stance: the sword hand low at the
     right with the blade up and a little out, the shield in front of the chest. ATTACK1 raises the
     sword over the right shoulder, its guard on the helmet's shell clear of the opening, and brings
     the shield in to the middle. disk_full carries the crates (see CARRY). */
  const BASE = { gx: 26, gy: 45, a: .45 };
  const BASE1 = { gx: 37.6, gy: 40.8, a: .3, fx: 20, fy: 38.4 };
  const ATTACK1 = { gx: 42, gy: 24.4, a: .2, fx: 19.6, fy: 37.6 };
  /* The attack's tremble, in radians either way: the weapon's angle shakes by it, raised or aimed. */
  const TREMBLE = .12;
  /* The aiming stances of a weapon that fires, towards the right, in the same units: gx and gy place
     the weapon's frame, its origin, which for a two-handed weapon is the rear hand's station. AIM2
     holds a two-handed weapon level at the chest with the stock under the right shoulder, the front
     hand further along the frame; towards the left it is mirrored about the root (left). AIM1 holds a
     one-handed weapon with the arm out at shoulder height and the shield, when one is carried, in
     front of the chest a little raised (fx, fy); towards the left the weapon hand comes across the
     body behind the shield (left), since the weapon stays in the right hand. AIM holds the aim's
     limits from level, below and above, the higher limit the swat may take, since flies hover
     nearly overhead, and the recoil: back along the frame in pixels, and up in radians. */
  const AIM2 = Object.freeze({ gx: 38, gy: 35.6, left: Object.freeze({ gx: 10, gy: 35.6 }) });
  const AIM1 = Object.freeze({ gx: 45.6, gy: 34.4, fx: 20.4, fy: 37.2, left: Object.freeze({ gx: 7.2, gy: 34.8 }) });
  const AIM = Object.freeze({ below: .3, above: 1.2, swatAbove: 1.4, recoil: 4, recoilUp: .08 });
  function pose(id, t) {
    const o = { t, eyes: 'open', mouth: 'flat', bob: Math.floor(t / 900) % 2, gx: BASE.gx, gy: BASE.gy, wang: BASE.a };
    if (ONE) { o.gx = BASE1.gx; o.gy = BASE1.gy; o.wang = BASE1.a; o.fx = BASE1.fx; o.fy = BASE1.fy; }
    if (t % 5200 < 160) o.eyes = 'closed';
    switch (id) {
      case 'container_unhealthy': o.eyes = Math.floor(t / 1300) % 2 ? 'dizzy' : 'half'; o.mouth = 'frown'; o.face = 'L'; o.thermo = 1; o.icebag = 1; o.headDx = Math.round(Math.sin(t / 900)); break;
      case 'cpu_hot': o.eyes = 'half'; o.mouth = 'pant'; o.face = 'P'; o.sweat = 1; o.steam = 1; break;
      case 'memory_tight': o.bloat = 5 + (Math.floor(t / 1200) % 2); o.eyes = 'half'; o.mouth = 'o'; o.puff = 1; o.bob = Math.floor(t / 1500) % 2; break;
      case 'disk_full': o.crates = 1; o.crouch = 2; o.bob = 0; o.eyes = 'half'; o.sweat = .3; o.sword = false; break;
      case 'backup_overdue': o.eyes = 'half'; o.mouth = 'frown'; o.bubble = 1; o.headDy = 1; break;
      case 'pi_silent': o.look = 1; o.mouth = 'frown'; break;
      // the engine turns the knight towards the gone device's place
      case 'device_down': o.mouth = 'frown'; break;
      case 'updating': o.eyes = 'happy'; o.mouth = 'smile'; break;
      case 'streaming': o.look = 1; o.mouth = 'smile'; break;
      case 'wan_down': o.look = Math.floor(t / 1400) % 2 ? 1 : -1; o.mouth = 'o'; o.mark = '?'; break;
      case 'attack':
        o.eyes = 'angry'; o.mouth = 'open'; o.mark = '!'; o.shake = Math.round(Math.sin(t / 60));
        // a weapon that fires is aimed to the right, trembling as the sword does, and never fired
        if (FIRE) aimPose(o, 1, level(1) + Math.sin(t / 90) * TREMBLE);
        else if (ONE) { o.gx = ATTACK1.gx; o.gy = ATTACK1.gy; o.wang = ATTACK1.a + Math.sin(t / 90) * TREMBLE; o.fx = ATTACK1.fx; o.fy = ATTACK1.fy; }
        else { o.gx = 30; o.gy = 37; o.wang = .7 + Math.sin(t / 90) * TREMBLE; }
        break;
      case 'night': o.eyes = 'closed'; break;
      case 'ssh_session': o.look = 1; break;
    }
    return o;
  }
  /* The swings, as keyframes. A swing is a list of keys after the stance it starts from at q 0:
     each key is a pose (the grip's gx, gy and the blade's angle a, and with a weapon in one hand the
     shield hand's fx, fy) reached at q, by the easing of the segment that ends there (e the page's
     ease, s smoothstep, l linear); len, where given, is that segment's length as it was first
     written, so that a segment kept from an earlier swing gives the same numbers. The last key is
     the stance again (stance: true). The cut runs from q .3 to .55 in every swing, and every cut
     ends at the angle 2.0 towards its side, so the swat's hit test in engine.js holds; every
     wind-up lies short of the nearest fly (its angle towards the cut below 0.2).

     A blade that turns from one side of the body to the other must point past the face on the way.
     The swings keep that pass short and low, with the blade always in front:
       one hand, to the right (the sword's own side): the wind-up raises the sword upright over the
         right shoulder, a little over the attack, the blade never crosses the face, and the shield
         stays in front;
       one hand, to the left (across the body): from the same wind-up the sword hand drops down the
         right side to the chest with the blade still upright, the blade turns past the face in
         about a frame, is held steep as it meets whatever it strikes, and cuts down across the
         shield, which lifts; the return carries the blade back level across the waist and the
         shield and turns it up only once the hand is out on the right;
       two hands: the wind-up holds the hands out past the shoulder on the far side with the blade
         laid back, so the guard's quillons stay clear of the chin; to the left the return comes
         back low as in one hand. */
  const SMOOTH = k => k * k * (3 - 2 * k), EASES = { e: ease, s: SMOOTH, l: k => k };
  const key = (q, e, gx, gy, a, fx, fy) => (fx === undefined ? { q, e, gx, gy, a } : { q, e, gx, gy, a, fx, fy });
  const STANCE = (q, e, len) => ({ q, e, len, stance: true });
  const SWING1 = {
    1: [Object.assign(key(.3, 'e', 43.2, 23.2, 0, 16, 38), { len: .3 }), Object.assign(key(.55, 's', 44.8, 38.4, 2.0, 14, 40), { len: .25 }), STANCE(1, 'e', .45)],
    '-1': [Object.assign(key(.3, 'e', 38.8, 23.2, 1.0, 12, 37.6), { len: .3 }), key(.39, 's', 39.6, 34.8, .05, 10, 35.6), key(.425, 'l', 33.2, 40.4, -.85, 6.4, 32),
      key(.5, 'l', 25.2, 40.8, -1.1, 4.8, 29.2), key(.55, 's', 17.2, 40.8, -2.0, 3.2, 26.4),
      key(.68, 'e', 16, 40.4, -1.62, 7.2, 30), key(.8, 's', 38.8, 40, -1.45, 16.8, 36.4), key(.83, 'l', 40, 38.4, -.05, 18.4, 37.2), STANCE(1, 'e')]
  };
  const SWING2 = {
    1: [Object.assign(key(.3, 'e', 24 - 14.8, 33.2, -1.0), { len: .3 }), Object.assign(key(.55, 's', 34, 46, 2.0), { len: .25 }), STANCE(1, 'e', .45)],
    '-1': [Object.assign(key(.3, 'e', 24 + 14.8, 33.2, 1.0), { len: .3 }), Object.assign(key(.55, 's', 14, 46, -2.0), { len: .25 }),
      key(.68, 'e', 16, 43.2, -1.62), key(.8, 's', 36.8, 42.8, -1.52), key(.835, 'l', 40.8, 39.6, -.05), STANCE(1, 'e')]
  };
  const swingKeys = dir => (ONE ? SWING1 : SWING2)[dir > 0 ? 1 : -1];
  /* A swing: wind up over one shoulder, cut across, recover. dir +1 cuts to the right. With a
     weapon in one hand the shield hand moves with the sword. Returns whether the blade is in the
     cut. */
  function swing(o, q, dir) {
    const base = ONE ? BASE1 : BASE, keys = swingKeys(dir);
    let from = base, q0 = 0, i = 0;
    while (i < keys.length - 1 && q >= keys[i].q) { from = keys[i]; q0 = keys[i].q; i++; }
    const at = keys[i], to = at.stance ? base : at, k = EASES[at.e](clamp01((q - q0) / (at.len || at.q - q0)));
    o.gx = lerp(from.gx, to.gx, k); o.gy = lerp(from.gy, to.gy, k); o.wang = lerp(from.a, to.a, k);
    if (ONE) { o.fx = lerp(from.fx, to.fx, k); o.fy = lerp(from.fy, to.fy, k); }
    if (q > .2 && q < .6) o.eyes = 'angry';
    return q >= .3 && q < .56;
  }
  /* Whether the swing towards dir comes back to the stance by a return of its own, rather than in
     one segment from the cut's end. The goblin strike's return follows it (strike in engine.js). */
  const ownReturn = dir => swingKeys(dir).filter(k => k.q > .55).length > 1;

  /* ---- Aiming and firing -------------------------------------------------------------------------
     A weapon that fires (FIRE) is held in the aiming stances and fired by fire(). Every pose these
     write is marked o.aimed, which keeps a two-handed weapon's front hand on its station (no slide)
     and, while the weapon points left, flips its drawing over its frame's line (flipped). Angles run
     as the blade's: 0 straight up, pi / 2 level to the right, -pi / 2 level to the left. */
  const TAU = 2 * Math.PI;
  const level = dir => (dir > 0 ? 1 : -1) * Math.PI / 2;
  /* How far the grip dips, in units of U at the middle of a turn from one side to the other. */
  const DIP = 6;
  /* Whether the pose o, its weapon at the angle a, draws the weapon turned over its line: a weapon
     that fires, aimed, pointing left. */
  const flipped = (o, a) => !!(FIRE && o.aimed && Math.sin(a) < 0);
  /* Puts the aiming stance towards dir, the weapon at the angle a, into the pose o. */
  function aimPose(o, dir, a) {
    const p = ONE ? (dir > 0 ? AIM1 : AIM1.left) : dir > 0 ? AIM2 : AIM2.left;
    o.gx = p.gx; o.gy = p.gy; o.wang = a; o.aimed = true;
    if (ONE) { o.fx = AIM1.fx; o.fy = AIM1.fy; }
    return o;
  }
  /* The angle towards dir that points the shot at the point at, held from AIM.below under level to
     above over it (AIM.above when left out; the swat gives AIM.swatAbove), so the watcher never aims
     at the floor or the headline. Worked out on the rig from the frame's origin in the stance, which
     does not move as the weapon turns, then turned by the muzzle's offset across the frame, so the
     line of the shot from the muzzle meets at. Level when at is not given. */
  function aimAngle(o, dir, at, above) {
    const lv = level(dir), sd = dir > 0 ? 1 : -1;
    if (!at) return lv;
    const m = rigOf(aimPose(Object.assign({}, o), dir, lv)).anchors.main;
    const dx = at[0] - m[0], dy = at[1] - m[1], d = Math.hypot(dx, dy) || 1, p = FIRE ? FIRE.muzzle.p : 0;
    // the frame's angle from straight up is atan2(dx, -dy); the muzzle p across the frame (drawn as -p
    // when flipped, to the left) turns it by asin(p / d) away from its own side
    let a = Math.atan2(dx, -dy) - sd * Math.asin(Math.max(-1, Math.min(1, p / d)));
    a -= Math.round((a - lv) / TAU) * TAU;
    const hi = above === undefined ? AIM.above : above;
    // to the right, up is a smaller angle; to the left, a larger one
    const lo = sd > 0 ? lv - hi : lv - AIM.below, top = sd > 0 ? lv + AIM.below : lv + hi;
    return Math.min(top, Math.max(lo, a));
  }
  /* From the angle a0 towards a1 by k, never through straight up: both are taken on the turn of the
     circle from 0 to 2 pi, so a turn from one side to the other passes through straight down, the
     weapon carried low across the body, never over the face. */
  const onTurn = a => ((a % TAU) + TAU) % TAU;
  const turn = (a0, a1, k) => (k <= 0 ? a0 : k >= 1 ? a1 : lerp(onTurn(a0), onTurn(a1), k));
  /* Whether a turn from a0 to a1 changes side, each clearly on its side: more than 0.1 from
     straight up or down, as every stance and aim is, the swat's highest included. */
  const crosses = (a0, a1) => Math.sign(Math.sin(a0)) !== Math.sign(Math.sin(a1)) && Math.abs(Math.sin(a0)) > .1 && Math.abs(Math.sin(a1)) > .1;
  /* The shield lifted out of the way of the weapon arm, as in the sword's swing to the left: while a
     one-handed weapon turns across the body from one side to the other with a shield carried, the
     shield hand rises by up to fy (in units of U, 80 pixels), straight up, so that the arm and the
     gauntlet pass under the shield and none is ever drawn over its face. It eases up over the first
     in of the turn, is held, and eases down over the last in, by when the weapon hand has passed the
     shield's edge. While it is up it hides the face for the moment of the turn. */
  const LIFT = Object.freeze({ fy: -16, in: .1 });
  const lifted = k => SMOOTH(clamp01(Math.min(k, 1 - k) / LIFT.in));
  /* Between the poses f and t by k: the grip, the angle and the shield hand. A turn that changes
     side dips the grip by DIP at its middle and, in one hand with a shield, lifts the shield. */
  function between(o, f, t, k) {
    const cross = crosses(f.wang, t.wang), dip = cross ? DIP * Math.sin(k * Math.PI) : 0;
    o.gx = lerp(f.gx, t.gx, k); o.gy = lerp(f.gy, t.gy, k) + dip; o.wang = turn(f.wang, t.wang, k);
    if (ONE) {
      const up = cross && SHIELD ? lifted(k) : 0;
      o.fx = lerp(f.fx, t.fx, k); o.fy = lerp(f.fy, t.fy, k) + LIFT.fy * up;
    }
  }
  /* The recoil on an aimed pose, kick from 1 (the moment of the shot) to 0: back along the frame by
     AIM.recoil pixels and up by AIM.recoilUp. */
  function recoil(o, dir, kick) {
    const a = o.wang;
    o.gx -= Math.sin(a) * AIM.recoil * kick / U; o.gy -= -Math.cos(a) * AIM.recoil * kick / U;
    o.wang = a - (dir > 0 ? 1 : -1) * AIM.recoilUp * kick;
  }
  const stanceOf = () => (ONE ? { gx: BASE1.gx, gy: BASE1.gy, wang: BASE1.a, fx: BASE1.fx, fy: BASE1.fy } : { gx: BASE.gx, gy: BASE.gy, wang: BASE.a });
  const copyPose = (o, f) => { o.gx = f.gx; o.gy = f.gy; o.wang = f.wang; if (ONE) { o.fx = f.fx; o.fy = f.fy; } };
  /* A shot: the weapon raised from the stance to level (q 0 to .3), turned to the point at (to .5),
     fired at .5, the recoil to .6, and back to the stance by 1. dir +1 aims to the right. Returns
     whether the shot has left, from q .5. The acts time q; the shot leaves the muzzle as the pose
     stands just before .5 (muzzle()). */
  function fire(o, q, dir, at) {
    const st = stanceOf(), lv = aimPose(Object.assign({}, o), dir, level(dir)), ai = aimPose(Object.assign({}, o), dir, aimAngle(o, dir, at));
    if (q < .3) between(o, st, lv, ease(clamp01(q / .3)));
    else if (q < .5) between(o, lv, ai, ease(clamp01((q - .3) / .2)));
    else if (q < .6) { copyPose(o, ai); const k = 1 - (q - .5) / .1; recoil(o, dir, k * k); }
    else between(o, ai, st, ease(clamp01((q - .6) / .4)));
    o.aimed = q > 0 && q < 1;
    if (q > .2 && q < .7) o.eyes = 'angry';
    return q >= .5;
  }
  /* A volley, the swat by shot: shots, in order, each { dir, t, at }, fired at t ms from the volley's
     start towards dir at the point at (the swat's higher limit, AIM.swatAbove), and el the time
     since the start. Before the first, the raise of fire() from the stance to the first point over
     raise ms, ending as it leaves; at each shot the recoil, then a turn to the next point, through
     straight down when it changes side (with the shield lifted, as in fire()), held 20 ms before
     the next leaves; after the last, the recoil for after[0] ms and the return to the stance over
     after[1]. Like fire(), the pose stands as aimed just before each shot's moment, so the shot
     leaves the muzzle as muzzle() gives it there. */
  function volley(o, el, shots, raise, after) {
    if (!shots.length) return;
    const st = stanceOf(), aims = shots.map(s => aimPose(Object.assign({}, o), s.dir, aimAngle(o, s.dir, s.at, AIM.swatAbove)));
    const first = shots[0], end = shots[shots.length - 1];
    o.aimed = true; o.eyes = 'angry';
    if (el < first.t) {
      const q = .5 * clamp01((el - (first.t - raise)) / raise), lv = aimPose(Object.assign({}, o), first.dir, level(first.dir));
      if (q < .3) between(o, st, lv, ease(q / .3)); else between(o, lv, aims[0], ease(clamp01((q - .3) / .2)));
      o.aimed = q > 0;
      return;
    }
    if (el >= end.t) {
      const r = el - end.t, a = aims[aims.length - 1];
      if (r < after[0]) { copyPose(o, a); const k = 1 - r / after[0]; recoil(o, end.dir, k * k); }
      else { const k = clamp01((r - after[0]) / after[1]); between(o, a, st, ease(k)); o.aimed = k < 1; }
      return;
    }
    let i = 0;
    while (i < shots.length - 1 && el >= shots[i + 1].t) i++;
    const r = el - shots[i].t, gap = shots[i + 1].t - shots[i].t, kick = Math.min(after[0], gap / 3);
    if (r < kick) { copyPose(o, aims[i]); const k = 1 - r / kick; recoil(o, shots[i].dir, k * k); }
    else between(o, aims[i], aims[i + 1], ease(clamp01((r - kick) / Math.max(1, gap - kick - 20))));
  }
  /* The muzzle of the weapon in the pose o, on the grid, as drawn: the frame's point plus the
     muzzle's offset along and across it, the offset across turned over while the drawing is flipped.
     null for a weapon that does not fire. */
  function muzzleOf(o) {
    if (!FIRE) return null;
    const m = rigOf(o).anchors.main, sx = Math.sin(m[2]), sy = -Math.cos(m[2]), s = FIRE.muzzle.s, p = flipped(o, m[2]) ? -FIRE.muzzle.p : FIRE.muzzle.p;
    return [m[0] + sx * s - sy * p, m[1] + sy * s + sx * p];
  }
  /* The face of the shield carried in the pose o, as drawn: [x, y, w, h] on the grid, the shield
     item's face box from its hold point, which sits on the off hand, the left. null when no shield
     is carried: with a weapon in both hands, a one-handed weapon alone, the weapon put away, at the
     anvil and on the code path. The engine stops a foe's shot at it (engine.js, foes that fire). */
  function shieldFace(o) {
    if (!SHIELD || !PK.look || o.sword === false || o.tool) return null;
    const n = PK.look.look.items.off, p = n ? PK.packs.get(n.slice(0, n.indexOf('/'))) : null;
    const it = p && p.data.items ? p.data.items[n.slice(n.indexOf('/') + 1)] : null;
    if (!it || !Array.isArray(it.face)) return null;
    const h = rigOf(o).anchors.off;
    return [h[0] + it.face[0], h[1] + it.face[1], it.face[2], it.face[3]];
  }
  /* The box of the head group in the pose o, as drawn: [x0, y0, x1, y1] on the grid, the helmet, the
     plume and the hair's helmeted view with the helmet on, the head and the hair with it off, the
     plume's sway included. On the pack path the look's list is drawn into a recorder that keeps
     the box of every shape (an ellipse, a rounded rectangle and a pixel shape count as the box
     around them); on the code path the code's open helm and crest give CODE_HEAD about the head
     anchor. The engine aims a foe's missed shot over its corner nearest the foe (engine.js). */
  const CODE_HEAD = Object.freeze([-70, -97, 70, 26]);
  function headBox(o) {
    if (!PK.look) { const h = rig(o).anchors.head; return [h[0] + CODE_HEAD[0], h[1] + CODE_HEAD[1], h[0] + CODE_HEAD[2], h[1] + CODE_HEAD[3]]; }
    fillArrays(rig(o, PK.look.m), o);
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    const pt = (x, y) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
    const box = (x, y, w, h) => { pt(x, y); pt(x + w, y + h); };
    const rec = {
      Rh: box, Rv: box, rrect: box, pix: box, poly: pts => { for (const q of pts) pt(q[0], q[1]); },
      ell: (cx, cy, rx, ry) => box(cx - rx, cy - ry, 2 * rx, 2 * ry),
      strip: (x0, y0, x1, y1, hw0, hw1) => { const w = Math.max(hw0, hw1); box(Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.abs(x1 - x0) + 2 * w, Math.abs(y1 - y0) + 2 * w); }
    };
    PK.lib.draw(PK.look.lists[o.helmet !== false ? 'headOn' : 'headOff'], PK.A, PK.Vs, rec);
    if (b[0] > b[2]) { const h = rig(o, PK.look.m).anchors.head; return [h[0], h[1], h[0], h[1]]; }
    return b;
  }

  /* head draws the knight's bare head with the corner of its 240 by 300 box at (ax, ay), as in bed:
     the head anchor is 120 right of that corner and 94 below it, from the pack or from code as the
     knight is. speech draws a speech bubble. rest holds what a scene calls for the gear at rest
     (described above): draw(slot, x, y, a), reach(), head(), key(slot) and fits(slot, place). fire,
     volley, muzzle and aim (pose(o, dir, a), angle(o, dir, at, above), the stances and the shield's
     LIFT) are described above, and so are shieldFace and headBox,
     and fired() gives the look's weapon when it fires, or null. rig, start, add, look,
     basePack, fetchPacks and packIndex are described above, except that rig from outside takes the
     look's build when b is left out (below), build is the present knight's measurements, source is
     'pack' or 'code' and status what start() found. */
  const headAtCorner = (ax, ay, o) => (PK.look ? packHead(ax + 120, ay + 94, o) : bareHD(ax + 120, ay + 94, o));
  /* The rig as the engine sees it: for the look's build when the knight is drawn from the packs, and
     the present knight's on the code path, so that the blade the engine measures against flies and
     foes (bladeOf in engine.js, and through it foeGaps, contactQ and the foe's plan) is the blade
     drawn. */
  const rigOf = (o, b) => rig(o, b || (PK.look ? PK.look.m : BUILD));
  KW.knight = { tool: TOOL, draw: knightHD, rig: rigOf, build: BUILD, pose, swing, ownReturn, head: headAtCorner, speech: speechHD,
    fire, volley, muzzle: muzzleOf, shieldFace, headBox, fired: () => FIRE, aim: { pose: aimPose, angle: aimAngle, AIM, AIM1, AIM2, LIFT },
    rest: { draw: restHD, reach: restReach, head: restHead, point: restPoint, key: restKey, fits: restFits }, start, add, look: setLook, basePack, fetchPacks, packIndex, source: 'code', status: null };
})(window.KW);
