/* Knightwatcher: the scene compiler (docs/worlds.md). Turns a scene of a world pack, as the pack
   library (pack.js) has read and checked it, into an object with the scene interface of
   docs/page.md, and puts the scenes of kw.medieval in place of the code scenes of the same names;
   turns each kind of its prop set into a drawing of a device, which it puts in KW.kinds in place
   of the code's (KW.props.KINDS); and turns the members of its cast into the drawings the engine
   asks for, which it puts in KW.cast in place of the code's (KW.props.CRITTERS, FOES and PATRONS).

   Nothing in a pack runs. A scene compiles into frozen records: each shape a kind from SHAPES, each
   mark one of MARKS, each predicate one the engine evaluates in holds(), each effect a name in
   KW.effects. The scene's paint, draw, over and key are the functions below, closing over those
   records. No function is made from data.

   The compiler builds what the scenes converted so far need, and refuses the rest of format 1.1 with
   a reason that says so: a scene that names something it does not build stays the code scene. What
   it builds:
   - terms: numbers, and term objects of c, the named values L, R, T and W (the screen's edges and
     width, from KW.view), x (a tile's x), h (a hash of the tile's x), wave (a sine of the scene's
     time) and the values the acts give (targetDx and spot), added in the order they are written, so
     that a term gives the same bits as the code it replaces;
   - colours: hex, @base and the pack's own palettes, translucent colours spelt as the code spells
     them ('rgba(0,0,0,.3)'), and band lists of these;
   - shapes: rect, ell, rrect, poly and strip without clip, glow, fx, pix, use and tile without pick
     or only;
   - layers: still (painted into the cached backdrop), moving (in draw) and over (in over), each with
     its when; a moving or over layer's groups, and keyframes on a clock in ms with show tracks;
   - the things mark, where the devices behind the watcher are drawn, and the rest mark, where the
     watcher's gear at rest is drawn at one of the scene's rests;
   - the backdrop's key, worked out from what the still layers read: the predicates of their when,
     the gear they show at rest, and the spot when a rest they show it at counts from the spot;
   - hosts, as outdoors when a scene hosts both the flies and the crate, and from foe the foe's
     zone, foeZone, and with a wall the line it climbs over, wallAt;
   - the acts of the target (the yard's training) and of the anvil (the smithy's hammer, with the
     hot tip of the blade on the anvil);
   - the kinds of a prop set: their still and moving shapes in both states, the engine's lamp at a
     point, and a lamp of the kind's own from two stamps of pix shapes, as the raspberry is;
   - the critters of the cast: their two frames and what falls, with a group's alpha; its foes:
     their poses, from parts shared between them, and their measures; and its patrons: their still
     parts and mouths at their anchors, in the user's skin, hair and robe, with the colours mixed,
     chosen by contrast, and drawn and dressed.
   Each later step adds rows to these tables. */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view;
  const MEDIEVAL = 'kw.medieval';
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  const quote = s => '"' + String(s) + '"';
  const idx = (path, i) => path + '[' + i + ']';
  const at = (path, k) => path + '.' + k;

  /* A part of format 1.1 this engine does not draw yet. */
  function notBuilt(path, what) { return new Error(path + ': ' + what + ' is not built in this engine yet'); }

  /* ---- Terms ------------------------------------------------------------------------------------
     A scalar compiles to its number, or to a list of steps, one for each key of its term object in
     the order written: [CONST, c], [NAMED, name, coefficient], [HASH, seed, mod] or [WAVE, amp, div,
     phase]. val() adds them up from the first, so { "x": 1, "c": 178 } is x + 178 and { "c": 0.09,
     "wave": [0.025, 150, 0] } is 0.09 + 0.025 * sin(t / 150), as the code writes them. E holds the
     named values of the moment: L, R, T, W, x, t, in a scene with a target targetDx (the pixels the
     training act moves the target by), and in a scene with an anvil spot (the x of the spot the
     watcher works at, which the anvil's places count from), both below. */
  const CONST = 0, NAMED = 1, HASH = 2, WAVE = 3;
  const NAMES = ['L', 'R', 'T', 'W', 'x', 'targetDx', 'spot'];
  function term(v, path) {
    if (typeof v === 'number') return v;
    if (!isObj(v)) throw new Error(path + ': is not a term');
    const steps = [];
    for (const k of Object.keys(v)) {
      if (k === 'c') steps.push([CONST, v.c]);
      else if (k === 'h') steps.push([HASH, v.h[0], v.h[1]]);
      else if (k === 'wave') steps.push([WAVE, v.wave[0], v.wave[1], v.wave[2]]);
      else if (NAMES.includes(k)) { if (v[k] !== 0) steps.push([NAMED, k, v[k]]); }
      else throw notBuilt(at(path, k), 'the named value ' + quote(k));
    }
    return steps.length ? steps : 0;
  }
  function val(q, E) {
    if (typeof q === 'number') return q;
    let s = 0;
    for (let i = 0; i < q.length; i++) {
      const o = q[i];
      const v = o[0] === CONST ? o[1] : o[0] === NAMED ? o[2] * E[o[1]] : o[0] === HASH ? D.hsh(E.x, o[1]) % o[2] : o[1] * Math.sin(E.t / o[2] + o[3]);
      s = i ? s + v : v;
    }
    return s;
  }
  const point = (v, path) => [term(v[0], idx(path, 0)), term(v[1], idx(path, 1))];
  /* The named values of the screen now, at scene time t, with s the frame. */
  const named = (t, s) => ({ L: V.HL, R: V.HR, T: V.HT, W: V.HR - V.HL, x: 0, t, s, targetDx: 0, spot: 0, since: Infinity, dx: null, picks: null, off: null, mv: null, pal: null });

  /* ---- Colours ----------------------------------------------------------------------------------
     A colour resolves once, at compile, to what the primitives take: a string, or a band list. A
     tile's pick, "@pick.<name>", is the one colour chosen at each x as the tile is drawn: it compiles
     to { pick: name }, which hue() reads from the tile's picks of the moment. An entry of the pack's
     palettes that a palette track of the layer drives compiles to { pal: "set.entry" }, which hue()
     reads from the layer's keyframes of the moment. */
  const REF = /^@([a-z][a-z0-9-]{0,31})\.([a-z0-9][a-z0-9-]{0,31})$/;
  const LAMP_RED = /^@lamp\.(down|downLo|downHi)$/;
  /* A translucent colour as the scenes spell it, 'rgba(0,0,0,.3)': the alpha without its 0. */
  const rgba = c => 'rgba(' + parseInt(c.rgb.slice(1, 3), 16) + ',' + parseInt(c.rgb.slice(3, 5), 16) + ',' + parseInt(c.rgb.slice(5, 7), 16) + ',' + String(c.a).replace(/^0\./, '.') + ')';
  function colour(v, path, env, depth) {
    if (typeof v === 'string') {
      if (v[0] === '#') return v;
      const m = REF.exec(v);
      if (m && m[1] === 'base' && has(KW.pack.BASE, m[2])) return KW.pack.BASE[m[2]];
      // the down lamp's reds, which a stamp may name, as the engine spells them
      const lamp = LAMP_RED.exec(v);
      if (lamp && env.stamp && KW.props && has(KW.props.LAMP_REDS, lamp[1])) return KW.props.LAMP_REDS[lamp[1]];
      // a set a patron binds, or a palette of its own, in the look it is compiled for
      if (m && env.member && env.member.names(m[1])) return env.member.ref(m[1], m[2], path);
      if (m && m[1] === 'pick' && env.picks && has(env.picks, m[2])) {
        if (env.inBand || env.inEffect) throw notBuilt(path, env.inBand ? 'a pick inside a band list' : 'a pick in an effect');
        return { pick: m[2] };
      }
      const own = env.pack.data.palettes;
      if (m && env.animPal && env.animPal.includes(m[1] + '.' + m[2])) {
        // an entry a palette track of the layer drives: chosen as the layer is drawn
        if (env.inBand || env.inEffect || depth) throw notBuilt(path, 'a colour a palette track drives, ' + (env.inBand ? 'inside a band list' : env.inEffect ? 'in an effect' : 'named through another entry'));
        return { pal: m[1] + '.' + m[2] };
      }
      if (m && own && has(own, m[1]) && has(own[m[1]], m[2]) && (depth || 0) < 2) return fill(own[m[1]][m[2]], path, env, (depth || 0) + 1);
      throw notBuilt(path, 'the colour ' + quote(v));
    }
    if (isObj(v) && has(v, 'rgb')) return rgba(v);
    if (env.member && isObj(v) && (has(v, 'mix') || has(v, 'contrast'))) return env.member.colour(v, path);
    throw notBuilt(path, isObj(v) && has(v, 'contrast') ? 'a contrast colour' : 'a mixed colour');
  }
  function fill(v, path, env, depth) {
    if (!Array.isArray(v)) return colour(v, path, env, depth);
    const inner = Object.assign({}, env, { inBand: true });
    return v.map((b, i) => [b[0], colour(b[1], idx(idx(path, i), 1), inner, depth)]);
  }
  const hue = (f, E) => (f !== null && typeof f === 'object' && !Array.isArray(f) ? (has(f, 'pal') ? E.pal[f.pal] : E.picks[f.pick]) : f);

  /* ---- Shapes -----------------------------------------------------------------------------------
     Each kind compiles a shape to a record and draws a record. draw(r, E, ox, oy) draws it moved by
     (ox, oy), which is where a stamp is put; a layer's shapes are drawn at (0, 0). An ell's or an
     rrect's clip, [top, bottom], keeps the rows between its two ys, each counted from the same
     anchor as the shape's point, either null for no bound. */
  const clipOf = (s, path) => (has(s, 'clip') ? s.clip.map((c, i) => (c === null ? null : term(c, idx(at(path, 'clip'), i)))) : null);
  const clipAt = (r, i, E, oy) => (r.clip && r.clip[i] !== null ? oy + val(r.clip[i], E) : null);
  const SHAPES = {
    rect: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), w: term(s.w, at(path, 'w')), h: term(s.h, at(path, 'h')), f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { const f = hue(r.f, E); (typeof f === 'string' ? D.Rh : D.Rv)(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.w, E), val(r.h, E), f); }
    },
    ell: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), rx: term(s.rx, at(path, 'rx')), ry: term(s.ry, at(path, 'ry')), f: fill(s.fill, at(path, 'fill'), env), clip: clipOf(s, path) }),
      draw(r, E, ox, oy) { D.ell(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.rx, E), val(r.ry, E), hue(r.f, E), clipAt(r, 0, E, oy), clipAt(r, 1, E, oy)); }
    },
    rrect: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), w: term(s.w, at(path, 'w')), h: term(s.h, at(path, 'h')), r: term(s.r, at(path, 'r')), f: fill(s.fill, at(path, 'fill'), env), clip: clipOf(s, path) }),
      draw(r, E, ox, oy) { D.rrect(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.w, E), val(r.h, E), val(r.r, E), hue(r.f, E), clipAt(r, 0, E, oy), clipAt(r, 1, E, oy)); }
    },
    poly: {
      compile: (s, path, env) => ({ pts: s.pts.map((q, i) => point(q, idx(at(path, 'pts'), i))), cols: s.dir === 'cols', f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { D.poly(r.pts.map(q => [ox + val(q[0], E), oy + val(q[1], E)]), hue(r.f, E), r.cols); }
    },
    strip: {
      compile: (s, path, env) => ({ p0: point(s.p0, at(path, 'p0')), p1: point(s.p1, at(path, 'p1')), hw0: term(s.hw0, at(path, 'hw0')), hw1: term(s.hw1, at(path, 'hw1')), f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { D.strip(ox + val(r.p0[0], E), oy + val(r.p0[1], E), ox + val(r.p1[0], E), oy + val(r.p1[1], E), val(r.hw0, E), val(r.hw1, E), hue(r.f, E)); }
    },
    glow: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), r: term(s.r, at(path, 'r')), c: colour(s.colour, at(path, 'colour'), env), a: term(s.a, at(path, 'a')) }),
      draw(r, E, ox, oy) { D.glow(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.r, E), hue(r.c, E), val(r.a, E)); }
    },
    /* An effect of KW.effects, its fields compiled by the kinds its table gives: scalars as terms,
       colours resolved, the rest as written. It is drawn with the scene's time when it moves. A
       triggered one (burst) is drawn only in a scene with a target or an anvil: with the ms since
       the target was last struck, which is the straw the dummy sheds, or with the progress of the
       hammer's blow, which is the sparks it throws, and not at all while the hammer is not
       striking. */
    fx: {
      compile(s, path, env) {
        if (env.stamp) throw notBuilt(path, 'an effect in a stamp');
        const lib = KW.effects && KW.effects[s.fx];
        if (!lib) throw new Error(at(path, 'fx') + ': the effects library has no ' + quote(s.fx));
        if (lib.clock === 'trigger') {
          if (!env.target && !env.anvil) throw notBuilt(at(path, 'fx'), 'the triggered effect ' + quote(s.fx) + ' in a scene without a target or an anvil');
          // sparks run on the progress of a hammer's blow, which a target does not give, and straw
          // on the ms since a blow, which the hammer does not give
          if (env.target && s.piece !== 'straw') throw notBuilt(at(path, 'piece'), 'a burst of sparks on the target\'s hit');
          if (env.anvil && s.piece === 'straw') throw notBuilt(at(path, 'piece'), 'a burst of straw on the hammer\'s blow');
        }
        const F = lib.fields, fields = [], inner = Object.assign({}, env, { inEffect: true });
        // a prop is drawn at its place's base and a cast member where the engine puts it, which
        // moves an effect's points; a field placed on the screen alone, as a row of pebbles' y,
        // would not move with it
        if (env.placed) for (const k of Object.keys(F)) if (F[k].kind === 'offset') throw notBuilt(at(path, 'fx'), 'the effect ' + quote(s.fx) + ', placed on the screen by its field ' + quote(k) + ', in ' + env.placed);
        for (const k of Object.keys(s)) {
          if (k === 'k' || k === 'fx') continue;
          const p = at(path, k), kind = has(F, k) ? F[k].kind : null;
          if (!kind) throw notBuilt(p, 'the field ' + quote(k) + ' of an effect');
          const how = kind === 'point' ? 'point' : kind === 'offset' || kind === 'length' || kind === 'term' ? 'term' : 'plain';
          const v = how === 'point' ? point(s[k], p) : how === 'term' ? term(s[k], p) : kind === 'colour' ? colour(s[k], p, inner) : kind === 'colours' ? s[k].map((c, i) => colour(c, idx(p, i), inner)) : s[k];
          fields.push([k, how, v]);
        }
        return { fx: s.fx, clock: lib.clock, fields };
      },
      draw(r, E, ox, oy) {
        const f = {}, mx = ox || 0, my = oy || 0;
        for (const [k, how, v] of r.fields) f[k] = how === 'point' ? [mx ? mx + val(v[0], E) : val(v[0], E), my ? my + val(v[1], E) : val(v[1], E)] : how === 'term' ? val(v, E) : v;
        if (r.clock === 'time') KW.effects[r.fx].draw(f, E.t);
        else if (r.clock === 'trigger') { if (E.since !== null) KW.effects[r.fx].draw(f, E.since); }
        else KW.effects[r.fx].draw(f);
      }
    },
    /* A shape given pixel by pixel: its rows, each character a colour of its key and "." clear,
       painted in one pass from p, as the raspberry is. */
    pix: {
      compile(s, path, env) {
        const key = {};
        for (const c of Object.keys(s.key)) {
          const v = colour(s.key[c], at(at(path, 'key'), c), env);
          if (typeof v !== 'string') throw notBuilt(at(at(path, 'key'), c), 'a pix colour chosen as it is drawn');
          key[c] = v;
        }
        return { p: point(s.p, at(path, 'p')), rows: s.rows.slice(), w: s.rows[0].length, h: s.rows.length, key };
      },
      draw(r, E, ox, oy) {
        D.pix(ox + val(r.p[0], E), oy + val(r.p[1], E), r.w, r.h, (i, j) => { const c = r.rows[j][i]; return c === '.' ? null : r.key[c]; });
      }
    },
    /* A stamp of the pack, its shapes drawn moved to p. */
    use: {
      compile(s, path, env) {
        if (env.using.includes(s.stamp)) throw new Error(at(path, 'stamp') + ': the stamp ' + quote(s.stamp) + ' uses itself');
        const st = env.pack.data.stamps[s.stamp], inner = Object.assign({}, env, { stamp: true, using: env.using.concat([s.stamp]) });
        return { p: point(s.p, at(path, 'p')), shapes: st.map((t, i) => shape(t, 'stamps.' + s.stamp + '[' + i + ']', inner)) };
      },
      draw(r, E, ox, oy) {
        const px = ox + val(r.p[0], E), py = oy + val(r.p[1], E);
        for (const t of r.shapes) drawShape(t, E, px, py);
      }
    },
    /* A tile: its shapes drawn at each x from the step-aligned x at or before from, plus phase, to
       before to, as the scenes' loops run. Each pick chooses one of its colours at each x, of[hsh(x,
       seed) % of.length], as the yard's pebbles take hsh(x, 6) % 2. */
    tile: {
      compile(s, path, env) {
        const picks = has(s, 'pick') ? Object.keys(s.pick).map(n => [n, s.pick[n].seed, s.pick[n].of.slice()]) : null;
        const inner = picks ? Object.assign({}, env, { picks: s.pick }) : env;
        return { step: s.step, phase: s.phase, from: term(s.from, at(path, 'from')), to: term(s.to, at(path, 'to')), picks,
          shapes: s.shapes.map((t, i) => shape(t, idx(at(path, 'shapes'), i), inner)) };
      },
      draw(r, E, ox, oy) {
        const to = val(r.to, E), was = E.picks;
        for (let x = Math.floor(val(r.from, E) / r.step) * r.step + r.phase; x < to; x += r.step) {
          E.x = x;
          if (r.picks) { E.picks = {}; for (const [n, seed, of] of r.picks) E.picks[n] = of[D.hsh(x, seed) % of.length]; }
          for (const t of r.shapes) drawShape(t, E, ox, oy);
        }
        E.picks = was;
      }
    }
  };
  /* The marks: where in the scene's order the engine draws something of its own. things draws the
     devices behind the watcher. rest draws the watcher's gear of a slot at one of the scene's rests
     (below) through KW.knight.rest, which draws what is equipped on either of the knight's paths:
     the weapon on a frame, { x, y, a }, the helmet or the shield in a place, { kind, x, y, w, h }.
     A rest that counts from the spot has its x counted from where the watcher stands, s.kx. In a
     still layer the gear is painted into the backdrop, which the key then follows. At the rest the
     scene's anvil names, the weapon lies in the backdrop and the hammer works it: there a rest mark
     for the weapon in a moving or over layer draws, each frame, the anvil act's hot tip on the
     blade (hotTip, below), and not the weapon again. The helmet or the shield is drawn only when its
     rest view fits the place, KW.knight.rest.fits: its fits the place's kind and its box within the
     place's w by h. A frame that names a stamp has the stamp drawn under the weapon first, as the
     house's pegs, at PEGS from the blade (pegsAt, below). sleeper draws the watcher's head in bed,
     with the ice bag while unwell, where the scene's bed puts it (sleeperAt, below). */
  const MARKS = {
    things: { compile: () => ({}), draw(r, E) { KW.devices.draw(E.t, E.s); } },
    rest: {
      compile(s, path, env) {
        const hot = s.slot === 'main' && !!env.anvil && env.anvil.rest === s.at && env.where !== 'still';
        const stamp = s.slot === 'main' && !hot ? env.restStamps[s.at] || null : null;
        return { slot: s.slot, at: env.rests[s.at], hot, stamp };
      },
      draw(r, E) {
        const R = KW.knight.rest, x = r.at.spot ? E.s.kx + r.at.x : r.at.x, y = r.at.y;
        if (r.hot) hotTip(x, y, R.blade(), E.t);
        else if (r.slot === 'main') {
          if (r.stamp) for (const px of pegsAt(x, R.blade())) for (const t of r.stamp) drawShape(t, E, px, y);
          R.draw('main', x, y, r.at.a);
        } else if (typeof R.fits !== 'function' || R.fits(r.slot, r.at)) R.draw(r.slot, x, y);
      }
    },
    sleeper: { compile: (s, path, env) => ({ bed: env.bed }), draw(r, E) { sleeperAt(r.bed, E.s.o); } }
  };
  /* The xs of a frame's stamp, from the blade of the weapon lying on it with its grip's middle at x:
     PEGS.from past where the blade starts and PEGS.to short of its point, as the house's pegs, which
     a weapon that gives no blade gets for the greatsword's, PEGS.blade. */
  const PEGS = { from: 28, to: 45, blade: { from: 34, to: 263 } };
  function pegsAt(x, b) {
    const d = b || PEGS.blade;
    return [x + d.from + PEGS.from, x + d.to - PEGS.to];
  }
  /* The sleeper: the watcher's bare head with the corner of its box at the bed's head, moved by
     SLEEPER.shake pixels for each unit of the pose's headDx, and while the pose holds the ice bag
     (o.icebag), the bag on the brow at SLEEPER.bag from the head's corner, all from house.js. */
  const SLEEPER = { shake: 5, bag: [[[83, 8], 70, 30, 12, 'k'], [[86, 11], 64, 24, 10, [[.2, '#d4f6ff'], [.6, '#9fdcf0'], [1, '#6fb6d4']]], [[109, -4], 18, 16, 4, 'k'], [[112, -1], 12, 11, 3, 'w']], glint: [[93, 15], 10, 3, 'w'] };
  function sleeperAt(bed, o) {
    const [hx, hy] = bed.head, C = D.C, c = v => (v === 'k' ? C.K : v === 'w' ? C.W : v);
    KW.knight.head(hx + (o.headDx || 0) * SLEEPER.shake, hy, o);
    if (!o.icebag) return;
    for (const [[dx, dy], w, h, r, f] of SLEEPER.bag) D.rrect(hx + dx, hy + dy, w, h, r, c(f));
    const [[gx, gy], gw, gh, gc] = SLEEPER.glint;
    D.Rh(hx + gx, hy + gy, gw, gh, c(gc));
  }
  /* The sleeper's Zs, over everything while the watcher sleeps at night: ZEDS.n of them, each
     rising from the bed's zeds over ZEDS.period ms a third of the way after the last, ZEDS.rise
     across and up, growing from ZEDS.size[0] to ZEDS.size[0] + ZEDS.size[1] pixels and fading out
     over the last fifth, as house.js draws them. */
  const ZEDS = { n: 3, period: 2600, rise: [110, 140], size: [16, 16], fade: [.8, 5] };
  function zedsAt(bed, t) {
    const [x, y] = bed.zeds, A = D.alpha;
    for (let i = 0; i < ZEDS.n; i++) {
      const ph = ((t / ZEDS.period) + i / ZEDS.n) % 1;
      A(ph > ZEDS.fade[0] ? (1 - ph) * ZEDS.fade[1] : 1); KW.sprites.zed(x + ph * ZEDS.rise[0], y - ph * ZEDS.rise[1], Math.round(ZEDS.size[0] + ph * ZEDS.size[1])); A(1);
    }
  }

  function shape(s, path, env) {
    const kind = has(SHAPES, s.k) ? SHAPES[s.k] : has(MARKS, s.k) ? MARKS[s.k] : null;
    if (!kind) throw notBuilt(at(path, 'k'), (env.marks.includes(s.k) ? 'the mark ' : 'the shape kind ') + quote(s.k));
    if (env.placed && (has(MARKS, s.k) || s.k === 'tile')) throw notBuilt(at(path, 'k'), (s.k === 'tile' ? 'a tile' : 'the mark ' + quote(s.k)) + ' in ' + env.placed);
    if (has(s, 'only')) throw notBuilt(at(path, 'only'), '"only" on a shape');
    if (has(s, 'g') && !(env.groups && has(env.groups, s.g))) throw notBuilt(at(path, 'g'), '"g" outside its layer\'s groups');
    if (has(s, 'g') && (s.k === 'fx' || has(MARKS, s.k) || env.marks.includes(s.k))) throw notBuilt(at(path, 'g'), '"g" on ' + (s.k === 'fx' ? 'an effect' : 'a mark'));
    return { k: s.k, g: has(s, 'g') ? s.g : null, r: kind.compile(s, path, env) };
  }
  /* Draws a shape, unless its group is hidden in this frame (E.off, from its layer's keyframes and
     the screen), moved along by its group's dx (E.dx, which the training act gives the target's
     group) and by its group's dx and dy from its layer's keyframes (E.mv, [dx, dy]). */
  function drawShape(c, E, ox, oy) {
    if (c.g !== null && E.off && E.off[c.g]) return;
    let dx = c.g !== null && E.dx && has(E.dx, c.g) ? E.dx[c.g] : 0, dy = 0;
    if (c.g !== null && E.mv && has(E.mv, c.g)) { dx += E.mv[c.g][0]; dy = E.mv[c.g][1]; }
    (has(SHAPES, c.k) ? SHAPES[c.k] : MARKS[c.k]).draw(c.r, E, dx ? ox + dx : ox, dy ? oy + dy : oy);
  }

  /* ---- Predicates and layers -------------------------------------------------------------------
     A predicate compiles to { n, id, neg }: n a name of PREDICATES or 'cond', with id the condition.
     day and night are reserved, and the medieval world is drawn at night, so night always holds and
     day never does. */
  const FROM_FRAME = { tv: 'tv', inBed: 'inBed', helmOff: 'helmOff', strike: 'strike' };
  function predicate(v) {
    const neg = v[0] === '!', name = neg ? v.slice(1) : v;
    return name.startsWith('cond:') ? { n: 'cond', id: name.slice(5), neg } : { n: name, id: null, neg };
  }
  function holds(p, s) {
    const v = p.n === 'cond' ? !!(s.w && s.w.id === p.id) : p.n === 'night' ? true : p.n === 'day' ? false : !!s[FROM_FRAME[p.n]];
    return p.neg ? !v : v;
  }
  /* ---- Groups and keyframes ---------------------------------------------------------------------
     A moving or over layer may declare groups, name one on a shape with "g", and drive them with
     keyframes. What is built: a clock in whole milliseconds ("ms": true), looping or not, started at
     phase, with four kinds of track. A show track hides its group's shapes while its value is 0; a
     dx or a dy track moves them by its value; a palette track ("pal": "set.entry") gives the pack's
     palette entry its colour, for the shapes of the layer that name it. Each of those holds a key
     from its time until the next one's, as 1.0's step ease does, the first key's value before it.
     A wave track ({ g, ch, wave: [amp, div, phase], round }) moves its group by amp * sin(t / div +
     phase) of the scene's time t, rounded to whole pixels when round is true, as Math.round(
     Math.sin(t / 190) * 1.5) is. The clock is the scene's time modulo the period, both in ms, so a
     show track of [[0, 1], [150, 0]] over 450 shows its group from 0 to before 150 of every 450 ms,
     the code's Math.floor(t / 150) % 3 === 0. (Dividing first, as (t / period) % 1, would put 600 ms
     of a 450 ms clock a hair before the key at 150.) */
  const SHOW = 0, MOVE = 1, WAVE_MOVE = 2, PAL = 3;
  function keyframes(a, path) {
    if (a.ms !== true) throw notBuilt(path, 'a clock in seconds');
    if (has(a, 'trigger')) throw notBuilt(at(path, 'trigger'), 'a triggered clock');
    const tracks = a.tracks.map((t, i) => {
      const p = idx(at(path, 'tracks'), i), axis = t.ch === 'dy' ? 1 : 0;
      if (has(t, 'wave')) return { kind: WAVE_MOVE, g: t.g, axis, wave: t.wave.slice(), round: t.round === true };
      if (has(t, 'ease') && t.ease !== 'step') throw notBuilt(at(p, 'ease'), 'the ease ' + quote(t.ease));
      const times = t.keys.map(k => k[0]), values = t.keys.map(k => k[1]);
      if (has(t, 'pal')) return { kind: PAL, pal: t.pal, times, values };
      if (t.ch !== 'show' && t.ch !== 'dx' && t.ch !== 'dy') throw notBuilt(at(p, 'ch'), 'the channel ' + quote(t.ch));
      return { kind: t.ch === 'show' ? SHOW : MOVE, g: t.g, axis, times, values };
    });
    return { period: a.period, loop: a.loop, phase: (a.phase || 0) * a.period, tracks };
  }
  /* The palette entries a layer's keyframes drive, as "set.entry". */
  const palsOf = a => (a ? a.tracks.filter(t => t.kind === PAL).map(t => t.pal) : []);
  /* The value of a step track at u ms into the clock. */
  function stepAt(tr, u) {
    const T = tr.times, n = T.length;
    if (n === 1 || u <= T[0]) return tr.values[0];
    if (u >= T[n - 1]) return tr.values[n - 1];
    let i = 0;
    while (T[i + 1] <= u) i++;
    return tr.values[i];
  }
  /* What the keyframes a do at scene time t: the groups hidden, by name (off); each group's move,
     [dx, dy] (mv); and the colours of the palette entries they drive (pal). */
  function animate(a, t) {
    const tt = t > 0 ? t : 0, P = a.period;
    const u = a.loop ? ((tt + a.phase) % P + P) % P : Math.min(P, a.phase + tt);
    const off = {}, mv = {}, pal = {};
    const move = (g, axis, d) => { if (!has(mv, g)) mv[g] = [0, 0]; mv[g][axis] += d; };
    for (const tr of a.tracks) {
      if (tr.kind === SHOW) { if (stepAt(tr, u) === 0) off[tr.g] = true; }
      else if (tr.kind === MOVE) move(tr.g, tr.axis, stepAt(tr, u));
      else if (tr.kind === WAVE_MOVE) { const v = tr.wave[0] * Math.sin(t / tr.wave[1] + tr.wave[2]); move(tr.g, tr.axis, tr.round ? Math.round(v) : v); }
      else pal[tr.pal] = stepAt(tr, u);
    }
    return { off, mv, pal };
  }

  function layer(l, path, env) {
    const when = (l.when || []).map(predicate);
    for (const p of when) if (p.n !== 'cond' && p.n !== 'night' && p.n !== 'day' && !has(FROM_FRAME, p.n)) throw notBuilt(at(path, 'when'), 'the predicate ' + quote(p.n));
    const anim = has(l, 'anim') ? keyframes(l.anim, at(path, 'anim')) : null, inner = Object.assign({}, env, { groups: l.groups || null, animPal: palsOf(anim) });
    const screen = env.screen && l.groups && has(l.groups, env.screen) ? env.screen : null;
    return { when, anim, screen, shapes: l.shapes.map((s, i) => shape(s, idx(at(path, 'shapes'), i), inner)) };
  }
  /* Draws the layers whose when holds, each with its keyframes of the moment, and with the screen's
     group (the scene's screen.group) hidden while the television is off. */
  function drawLayers(list, E) {
    for (const l of list) {
      if (!l.when.every(p => holds(p, E.s))) continue;
      const a = l.anim ? animate(l.anim, E.t) : null;
      E.off = a ? a.off : null; E.mv = a ? a.mv : null; E.pal = a ? a.pal : null;
      if (l.screen && !E.s.tv) E.off = Object.assign({}, E.off, { [l.screen]: true });
      for (const c of l.shapes) drawShape(c, E, 0, 0);
      E.off = null; E.mv = null; E.pal = null;
    }
  }

  /* ---- Scenes ---------------------------------------------------------------------------------- */

  /* The fields of a scene this engine does not build yet: the part of the seat's act, and the pole
     drawn under a high place. decor, quiet, name, sound and companion are not read: nothing draws
     decorations yet, the engine's own lists say which scenes take turns while all is quiet, and the
     other three are names and reserved slots. Nor are the anvil's spark, the bed's blanket and the
     screen's glow, which say what the scene's own shapes draw (the hammer's sparks, the blanket over
     the sleeper and the television's light). */
  const LATER = ['seat', 'pole'];

  /* The rests of a scene: where the watcher's gear is set down (docs/page.md, Gear at rest). A frame,
     { x, y, a }, is where the weapon lies, its grip's middle at (x, y) and a its angle, "upright" 0
     and "flat" pi/2 or a number of radians; a place, { kind, x, y, w, h }, is where a rest view
     goes. Each compiles to the code scenes' own form, with spot true when its x counts from the
     spot ("from": "spot"). */
  const ANGLES = { upright: 0, flat: Math.PI / 2 };
  function restOf(r) {
    const spot = r.from === 'spot';
    return has(r, 'kind') ? { kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, spot } : { x: r.x, y: r.y, a: typeof r.a === 'number' ? r.a : ANGLES[r.a], spot };
  }
  /* The rests as the scene interface gives them, as the code scenes' RESTS: without spot. */
  function restsOut(rests) {
    const out = {};
    for (const n of Object.keys(rests)) { const { spot, ...r } = rests[n]; out[n] = r; }
    return out;
  }
  /* The shapes of the stamp each frame of the scene names, compiled as a stamp's, by rest. */
  function restStamps(v, env) {
    const out = {};
    for (const n of Object.keys(v.rests || {})) {
      const st = v.rests[n].stamp;
      if (st === undefined) continue;
      const inner = Object.assign({}, env, { stamp: true, using: [st] });
      out[n] = freeze(env.pack.data.stamps[st].map((t, i) => shape(t, 'stamps.' + st + '[' + i + ']', inner)));
    }
    return out;
  }

  /* What a scene hosts, as the engine reads it until worlds can be chosen: the flies and the crate
     both follow the one flag outdoors, so a scene gives outdoors when it hosts both, and one that
     hosts either alone cannot be drawn as it says. The feast and the foe are played where the
     engine's own lists say (EVENTS in engine.js); a foe needs the scene's foe zone, foeZone, which
     the field foe gives. */
  function outdoors(hosts, path) {
    const flies = hosts.includes('flies'), crate = hosts.includes('crate');
    if (flies !== crate) throw notBuilt(path, flies ? 'hosting the flies without the crate' : 'hosting the crate without the flies');
    return flies;
  }
  /* The foe's zone, { side, spans }, as a code scene gives it, and with a wall the line the foe
     climbs over, wallAt(x): high[1] where x + offset falls in the first high[0] of each period, low
     elsewhere, with the battlement's own arithmetic, ((x + 70) % 160 + 160) % 160 < 80. Without a
     wall there is no wallAt, and the foe digs out of the ground. */
  function foeOf(z) {
    const zone = { side: z.side, spans: z.spans.map(s => [s[0], s[1]]) };
    if (!has(z, 'wall')) return { zone, wallAt: null };
    const { period, offset, low } = z.wall, width = z.wall.high[0], high = z.wall.high[1];
    return { zone, wallAt: x => ((((x + offset) % period) + period) % period < width ? high : low) };
  }

  /* ---- Acts -----------------------------------------------------------------------------------
     The acts the engine plays in a scene through its act(t, s), which the engine calls each frame
     after strolling (engine.js). Until the engine plays them from a scene's act parts itself, the
     compiler builds act from the part, with the numbers of the act as the code scenes have them, so
     that the engine reads a compiled scene as it reads a code one.

     The target: the watcher trains on it. At the spot whose round's act is train, while all is
     quiet, a swing of TRAIN.swing ms every target.every ms, the target struck target.hitAt ms in;
     while the CPU runs hot, a swing every second, struck 470 ms in, the eyes half shut and the body
     bobbing. A blow counts once, and is not counted again within TRAIN.rest ms (TRAIN.hot.rest while
     hot). Struck, the target's group wobbles for TRAIN.wobble.ms, by a sine that dies away, rounded
     to whole pixels: the named value targetDx, and the group's dx. A triggered effect counts its time
     from the blow. Each compiled scene keeps the time of its last blow, as yard.js keeps dummyHit. */
  const TRAIN = { swing: 900, rest: 2000, hot: { every: 1000, at: 470, rest: 600, bob: 170 }, wobble: { ms: 900, div: 60, amp: 15 } };
  function trainOn(part) {
    let hit = -1e9;
    const H = TRAIN.hot, Wb = TRAIN.wobble;
    function act(t, s) {
      const o = s.o, here = s.here, K = KW.knight;
      if (here && here.act === 'train' && s.w.lv === 0) { const c = here.el % part.every; if (c < TRAIN.swing) { K.swing(o, c / TRAIN.swing, 1); if (c > part.hitAt && t - hit > TRAIN.rest) hit = t; } }
      if (s.w.id === 'cpu_hot') { const c = t % H.every; K.swing(o, c / H.every, 1); if (c > H.at && t - hit > H.rest) hit = t; o.eyes = 'half'; o.bob = Math.floor(t / H.bob) % 2; }
    }
    /* The frame's values at t: the wobble, the time since the blow, and the group it moves. */
    function frame(E, t) {
      const a = t - hit, w = a < Wb.ms ? Math.round(Math.sin(a / Wb.div) * Wb.amp * (1 - a / Wb.ms)) : 0;
      E.targetDx = w; E.since = a; E.dx = { [part.group]: w };
      return E;
    }
    return { act, frame };
  }

  /* The anvil: the watcher hammers the weapon that lies on it. It is act() in smithy.js with the
     smithy's numbers: whatever else is up, the weapon put away and the hammer rising slowly and
     falling fast once every ANVIL.period ms, a progress bar filling over ANVIL.progress ms, and the
     hammer striking from ANVIL.strike[0] of the cycle to ANVIL.strike[1] of the next, the eyes shut
     while it does; the predicate strike holds then. While it strikes, a triggered effect is drawn
     at the blow's progress, from 0 at ANVIL.blow[1] of the cycle over ANVIL.blow[3] of it, which is
     the sparks the hammer throws. The anvil's places count from the spot the watcher works at: the
     act gives its layers that x as the named value spot. The hot tip on the blade is drawn by the
     rest mark at the anvil's rest, below. */
  const ANVIL = { period: 1300, rise: .55, fall: .45, strike: [.93, .06], blow: [.5, .93, .07, .13], progress: 9000 };
  function anvilOn() {
    const A = ANVIL;
    function act(t, s) {
      const o = s.o, c = (t % A.period) / A.period; o.sword = false;
      o.hammer = c < A.rise ? 1 - D.ease(c / A.rise) : Math.pow((c - A.rise) / A.fall, 3); s.strike = c > A.strike[0] || c < A.strike[1]; o.progress = (t % A.progress) / A.progress; if (s.strike) o.eyes = 'closed';
    }
    /* The frame's values at t: the spot's x, and the blow's progress while the hammer strikes. */
    function frame(E, t) {
      const b = A.blow;
      E.spot = E.s.kx;
      if (E.s.strike) { const c = (t % A.period) / A.period; E.since = (c > b[0] ? c - b[1] : c + b[2]) / b[3]; } else E.since = null;
      return E;
    }
    return { act, frame };
  }
  /* The blade's hot tip, part of the anvil's act, on the weapon lying with its grip's middle at
     (x, y): at its point (b.to along the blade) and between its edges (b.half either side), a glow
     that flickers, a dithered patch where the heat starts, three bands of red to orange that start
     TIP.bands[i][0] short of the point, the point white-hot and two lines of shine and shade, all
     from smithy.js. A weapon that gives no blade (b null) shows none. */
  const TIP = {
    glow: { back: 31, r: 56, colour: '#ff8a3d', a: [.14, .03, 120] }, dith: { back: 87, w: 14, colour: '#7a2a1d' },
    bands: [[73, 57, '#8f231d'], [57, 43, '#cc352c'], [43, 30, '#ff5a1e']],
    point: { back: 30, colour: '#ffb000' }, core: { back: 27, to: 11, inset: 7, colour: '#fff3a0' },
    lines: { back: 71, w: 42, shine: [3, 'rgba(255,240,180,.55)'], shade: [6, 'rgba(60,10,0,.35)'] }
  };
  function hotTip(gx, gy, b, t) {
    if (!b) return;
    const to = b.to, h = b.half, G = TIP.glow, Q = TIP.dith, P = TIP.point, C = TIP.core, Ln = TIP.lines;
    D.glow(gx + (to - G.back), gy, G.r, G.colour, G.a[0] + G.a[1] * Math.sin(t / G.a[2]));
    D.dith(gx + (to - Q.back), gy - (h - 1), Q.w, 2 * h - 1, Q.colour);
    for (const [x0, x1, c] of TIP.bands) D.Rh(gx + (to - x0), gy - h, x0 - x1, 2 * h + 1, c);
    D.poly([[gx + (to - P.back), gy - h], [gx + to, gy], [gx + (to - P.back), gy + h]], P.colour); D.poly([[gx + (to - C.back), gy - (h - C.inset)], [gx + (to - C.to), gy], [gx + (to - C.back), gy + (h - C.inset)]], C.colour);
    D.Rh(gx + (to - Ln.back), gy - (h - Ln.shine[0]), Ln.w, 2, Ln.shine[1]); D.Rh(gx + (to - Ln.back), gy + (h - Ln.shade[0]), Ln.w, 2, Ln.shade[1]);
  }

  /* The scene id of the loaded pack (a read() result of format 1.1) compiled to an object with the
     scene interface. Throws when the scene names something this engine does not build. */
  function compile(pack, id) {
    const v = pack.data.scenes[id], path = 'scenes.' + id;
    if (!isObj(v)) throw new Error(path + ': the pack has no such scene');
    for (const k of LATER) if (has(v, k)) throw notBuilt(at(path, k), 'the scene\'s ' + k);
    if (has(v, 'target') && has(v, 'anvil')) throw notBuilt(path, 'a scene with both a target and an anvil');
    const out = outdoors(v.hosts, at(path, 'hosts')), foe = has(v, 'foe') ? foeOf(v.foe) : null;
    const rests = {};
    if (has(v, 'rests')) for (const n of Object.keys(v.rests)) rests[n] = freeze(restOf(v.rests[n]));
    const bed = has(v, 'bed') ? freeze({ head: v.bed.head.slice(), zeds: v.bed.zeds.slice() }) : null;
    const env = { pack, stamp: false, using: [], marks: KW.pack.WORLD_LISTS.MARKS, target: has(v, 'target'), anvil: has(v, 'anvil') ? v.anvil : null, rests, restStamps: {},
      bed, screen: has(v, 'screen') ? v.screen.group : null, picks: null };
    env.restStamps = restStamps(v, env);
    // the act, the target's or the anvil's, and the frame's values it gives the moving and over layers
    const acted = has(v, 'target') ? trainOn(v.target) : has(v, 'anvil') ? anvilOn() : null;
    const frameAt = (t, s) => (acted ? acted.frame(named(t, s), t) : named(t, s));
    const lists = {};
    for (const k of ['still', 'moving', 'over']) lists[k] = freeze(v[k].map((l, i) => layer(l, idx(at(path, k), i), Object.assign({}, env, { where: k }))));
    // the backdrop's key: each predicate the still layers wait on, once, in the order first named;
    // then, when they show gear at rest, the spot's x (rounded) if any of its rests counts from the
    // spot, and the name of each slot's equipped item, KW.knight.rest.key(slot), once
    const keyed = [], seen = new Set(), slots = [];
    let bySpot = false;
    for (const l of lists.still) {
      for (const p of l.when) { const n = (p.neg ? '!' : '') + p.n + (p.id ? ':' + p.id : ''); if (!seen.has(n)) { seen.add(n); keyed.push(p); } }
      for (const c of l.shapes) if (c.k === 'rest') { if (!slots.includes(c.r.slot)) slots.push(c.r.slot); if (c.r.at.spot) bySpot = true; }
    }
    freeze(keyed); freeze(slots);
    const gear = s => (bySpot ? '|' + Math.round(s.kx) : '') + slots.map(n => '|' + KW.knight.rest.key(n)).join('');
    const places = {};
    for (const n of Object.keys(v.things)) places[n] = Object.assign({}, v.things[n]);
    const sc = {
      spot: v.spot, places, can: v.can.slice(),
      key: slots.length ? s => keyed.map(p => (holds(p, s) ? '1' : '0')).join('') + gear(s) : s => keyed.map(p => (holds(p, s) ? '1' : '0')).join(''),
      draw(t, s) { drawLayers(lists.moving, frameAt(t, s)); }
    };
    // the anvil's act holds the watcher at the anvil, so a scene with one gives no rounds to stroll
    // between, as smithy.js gives none
    if (!has(v, 'anvil')) sc.rounds = v.rounds.map(r => ({ x: r.x, act: r.act, dur: r.dur }));
    if (has(v, 'rests')) sc.rests = restsOut(rests);
    if (lists.still.length) sc.paint = s => drawLayers(lists.still, named(0, s));
    // the over layers, and the sleeper's Zs over everything at night in a scene with a bed
    if (lists.over.length || bed) sc.over = (t, s) => { drawLayers(lists.over, frameAt(t, s)); if (bed && s.w && s.w.id === 'night') zedsAt(bed, t); };
    if (bed) sc.bed = true;
    if (acted) sc.act = acted.act;
    if (v.weapon === 'away') sc.sword = false;
    if (v.helmet === 'off') sc.helmet = false;
    if (out) sc.outdoors = true;
    if (foe) { sc.foeZone = freeze(foe.zone); if (foe.wallAt) sc.wallAt = foe.wallAt; }
    return sc;
  }

  /* ---- Props ----------------------------------------------------------------------------------
     The prop set props.medieval gives the drawing of each kind of device (docs/worlds.md, Props and
     devices). A kind compiles to { draw, mark, from } with the interface of KW.props.KINDS:
     draw(x, y, t, ok, part) draws it standing on the base (x, y), up (ok) or gone, its still part
     (part 'still'), its moving part ('moving') or both, and mark is the height above the base of the
     top of the question mark the engine draws over it. Its shapes are drawn moved to the base. The
     lamp is the engine's: a pair is where the engine's own lamp stands, its rim painted with the
     still part and its light (KW.props.lampHD) in the moving part, after the kind's own shapes. A
     lamp of the kind's own, { at, box, lit, dark, light }, is two stamps of pix shapes, each painted
     once into a canvas of its own the size of the two together, the lit drawing laid over the dark
     one, so that where the lit drawing is clear the dark one shows in both; each frame it is drawn
     as the raspberry is (raspberryHD in props.js): a soft light of radius LAMP_GLOW at at, in light
     while up (the engine's green when it gives none) and the down lamp's red while gone, as
     strongly as the loop is bright, the dark canvas, and the lit canvas over it at the loop's
     level. Its drawings must lie inside its box, each pix shape at a whole point. */
  const PROPS = 'props.medieval', LAMP_GLOW = 24;
  let compiles = 0;
  /* The compiling of shapes that are drawn where the engine puts them, a prop's or a cast member's:
     placed says which, for the reasons, and refuses the marks, the tiles and an effect placed on the
     screen by a field of its own. */
  const placedEnv = (pack, placed) => ({ pack, stamp: false, using: [], marks: KW.pack.WORLD_LISTS.MARKS, target: false, anvil: null, rests: {}, restStamps: {}, bed: null, screen: null, picks: null, placed });
  /* A canvas of w by h painted once from cells, a colour or null for each pixel, row by row. */
  function paintCells(cells, w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const was = D.getCtx();
    D.setCtx(cv.getContext('2d')); D.pix(0, 0, w, h, (i, j) => cells[j * w + i]); D.setCtx(was);
    return cv;
  }
  /* A state's lamp: { at, own }, own null for the engine's lamp, or the kind's own lamp compiled. */
  function lampOf(L, path, env, ok) {
    if (Array.isArray(L)) return { at: [L[0], L[1]], own: null };
    const inner = Object.assign({}, env, { stamp: true, using: [] }), layers = {};
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of ['dark', 'lit']) {
      const sp = 'stamps.' + L[f];
      layers[f] = env.pack.data.stamps[L[f]].map((t, i) => {
        const q = idx(sp, i);
        if (t.k !== 'pix') throw notBuilt(at(q, 'k'), 'a lamp drawn with a shape other than pix');
        if (!Number.isInteger(t.p[0]) || !Number.isInteger(t.p[1])) throw notBuilt(at(q, 'p'), 'a lamp\'s pix shape at a point that is not a whole pixel');
        const r = SHAPES.pix.compile(t, q, inner);
        x0 = Math.min(x0, t.p[0]); y0 = Math.min(y0, t.p[1]); x1 = Math.max(x1, t.p[0] + r.w); y1 = Math.max(y1, t.p[1] + r.h);
        return r;
      });
    }
    const bx = L.box[0] / 2, by = L.box[1] / 2;
    if (x0 < -bx || y0 < -by || x1 > bx || y1 > by) throw new Error(at(path, 'box') + ': the lamp\'s drawings reach ' + [x0, y0, x1, y1].join(' ') + ' from its middle, outside its box, ' + [-bx, -by, bx, by].join(' '));
    const w = x1 - x0, h = y1 - y0;
    const cells = f => {
      const out = new Array(w * h).fill(null);
      for (const r of layers[f]) for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) { const c = r.rows[j][i]; if (c !== '.') out[(r.p[1] - y0 + j) * w + (r.p[0] - x0 + i)] = r.key[c]; }
      return out;
    };
    const dark = cells('dark'), lit = cells('lit').map((c, i) => (c !== null ? c : dark[i])), P = KW.props;
    const glow = ok ? (has(L, 'light') ? L.light : 'rgb(' + P.LAMP.up.rgb.join(',') + ')') : P.LAMP_REDS.down;
    // painted the first time it is drawn, and kept
    const sprites = {}, sprite = f => sprites[f] || (sprites[f] = paintCells(f === 'lit' ? lit : dark, w, h));
    return { at: [L.at[0], L.at[1]], own: { x0, y0, glow, sprite } };
  }
  /* The lamp of one's own at time t, for a device standing on (x, y). */
  function ownLamp(L, x, y, t, ok) {
    const o = L.own, a = KW.props.lampLevel(t, ok), ctx = D.getCtx(), lx = x + L.at[0], ly = y + L.at[1], px = Math.round(lx) + o.x0, py = Math.round(ly) + o.y0;
    D.glow(lx, ly, LAMP_GLOW, o.glow, .3 * a);
    ctx.drawImage(o.sprite('dark'), px, py);
    D.alpha(a); ctx.drawImage(o.sprite('lit'), px, py); D.alpha(1);
  }
  /* The kind of device kind of the loaded pack's prop set, compiled. Throws when it names something
     this engine does not build. */
  function compileKind(pack, set, kind) {
    const sets = pack.data.props, path = 'props.' + set + '.kinds.' + kind;
    const v = isObj(sets) && isObj(sets[set]) && isObj(sets[set].kinds) ? sets[set].kinds[kind] : null;
    if (!isObj(v)) throw new Error(path + ': the pack has no such kind');
    const env = placedEnv(pack, 'a prop'), states = {};
    for (const st of ['up', 'gone']) {
      const x = v[st], p = at(path, st);
      states[st] = {
        still: freeze(x.still.map((t, i) => shape(t, idx(at(p, 'still'), i), env))),
        moving: freeze((x.moving || []).map((t, i) => shape(t, idx(at(p, 'moving'), i), env))),
        lamp: lampOf(x.lamp, at(p, 'lamp'), env, st === 'up')
      };
    }
    const P = KW.props;
    function draw(x, y, t, ok, part) {
      const S = ok ? states.up : states.gone, L = S.lamp, E = named(t, null);
      if (part !== 'moving') {
        for (const c of S.still) drawShape(c, E, x, y);
        if (!L.own) P.lampRim(x + L.at[0], y + L.at[1]);
      }
      if (part !== 'still') {
        for (const c of S.moving) drawShape(c, E, x, y);
        if (L.own) ownLamp(L, x, y, t, ok); else P.lampHD(x + L.at[0], y + L.at[1], t, ok);
      }
    }
    return Object.freeze({ draw, mark: v.mark, from: MEDIEVAL + '#' + (++compiles) });
  }
  /* KW.kinds: the drawing of each kind of device the engine draws, by the contract's kind, as
     KW.props.KINDS gives them in code: those the prop set gives once start() has compiled them, and
     the code's for the rest. */
  const kinds = KW.kinds = {};
  function restoreKinds() {
    for (const k of Object.keys(kinds)) delete kinds[k];
    Object.assign(kinds, (KW.props && KW.props.KINDS) || {});
  }
  restoreKinds();

  /* ---- The cast --------------------------------------------------------------------------------
     The cast of kw.medieval gives the drawings of the engine's supporting cast (docs/worlds.md, The
     cast). A member whose id is its role, a dot and a name, as critter.fly, takes the place of the
     code's member of that name in its role's set of KW.cast, critters.fly; a member of a name the
     engine does not know is not compiled. Its shapes are compiled as a prop's and drawn moved to
     where the engine puts it. The engine keeps the motion: where a critter hovers, the swat, the
     poof and the fall.

     A critter compiles to { draw, dead, from } with the interface of KW.props.CRITTERS: draw(x, y,
     flap) draws its frame flap0 (flap 0) or flap1 at (x, y), and dead(x, y) what falls. A shape in a
     group the critter gives an alpha is drawn at that alpha: the canvas's alpha is set as the first
     of a run of such shapes is drawn, and set back to 1 at the first shape after it, which gives the
     calls the code makes (alpha(.85) before the fly's wings, alpha(1) after them).

     A foe compiles to { pose, poses, anchor, size, h, w, mid, crown, exit, from } with the interface
     of KW.props.FOES: pose(name) is a canvas of sprite.size with the pose painted once, its feet at
     sprite.feet (anchor), the first time it is asked for, as foeSprites() in props.js paints them;
     a name that is not a pose gives stand. A pose is its parts, each a list of shapes shared between
     poses and compiled once, in the order it lists them, then its own shapes. The measures and the
     crown are the pack's, and exit names one of the engine's exits, which the foe player keeps. */
  const ROLE_SETS = { critter: 'critters', foe: 'foes', patron: 'patrons' };
  function compileCritter(pack, id, v) {
    const path = 'cast.' + id, env = Object.assign(placedEnv(pack, 'the cast'), { groups: v.groups || null });
    const alphaOf = g => (g !== null && isObj(v.alpha) && has(v.alpha, g) ? v.alpha[g] : 1);
    const list = (shapes, p) => freeze(shapes.map((s, i) => { const c = shape(s, idx(p, i), env); c.a = alphaOf(c.g); return c; }));
    const frames = [list(v.frames.flap0, at(at(path, 'frames'), 'flap0')), list(v.frames.flap1, at(at(path, 'frames'), 'flap1'))], dead = list(v.dead, at(path, 'dead'));
    function drawList(cs, x, y) {
      const E = named(0, null);
      let a = 1;
      for (const c of cs) { if (c.a !== a) { D.alpha(c.a); a = c.a; } drawShape(c, E, x, y); }
      if (a !== 1) D.alpha(1);
    }
    return Object.freeze({ draw(x, y, flap) { drawList(frames[flap ? 1 : 0], x, y); }, dead(x, y) { drawList(dead, x, y); }, from: MEDIEVAL + '#' + (++compiles) });
  }
  function compileFoe(pack, id, v) {
    const path = 'cast.' + id, env = placedEnv(pack, 'the cast'), FOE_POSES = KW.pack.WORLD_LISTS.FOE_POSES;
    const parts = {};
    for (const n of Object.keys(v.parts)) parts[n] = freeze(v.parts[n].map((s, i) => shape(s, idx(at(at(path, 'parts'), n), i), env)));
    const lists = {};
    for (const n of FOE_POSES) {
      const pp = at(at(path, 'poses'), n), own = v.poses[n].shapes.map((s, i) => shape(s, idx(at(pp, 'shapes'), i), env));
      lists[n] = freeze(v.poses[n].parts.map(q => parts[q]).reduce((a, l) => a.concat(l), []).concat(own));
    }
    const [w, h] = v.sprite.size, [ax, ay] = v.sprite.feet, cache = {};
    function pose(name) {
      const n = has(lists, name) ? name : 'stand';
      if (!cache[n]) {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const was = D.getCtx(), E = named(0, null);
        D.setCtx(cv.getContext('2d'));
        for (const c of lists[n]) drawShape(c, E, ax, ay);
        D.setCtx(was);
        cache[n] = cv;
      }
      return cache[n];
    }
    return Object.freeze({ pose, poses: Object.freeze(FOE_POSES.slice()), anchor: Object.freeze([ax, ay]), size: Object.freeze([w, h]), h: v.h, w: v.w, mid: v.mid,
      crown: freeze(v.crown.map(q => [q[0], q[1]])), exit: v.exit, from: MEDIEVAL + '#' + (++compiles) });
  }
  /* A patron compiles to { draw, mouth, drawn, from } with the interface of KW.props.PATRONS, which
     court.js gives: draw(x, by, look) draws its still parts with the seat at (x, by), mouth(x, by,
     open, look) its state open or shut, and drawn is its own hair and robe colours, from its own of
     the sets bound to the user's hair and tabard. Each shape is drawn moved to the anchor its at
     names, or its part's (a state's: the seat). look is { skin, hair, robe }, as the court has
     checked them from s.patron, each null for the patron's own. A look is compiled once, the first
     time it is drawn, and kept: each bound set takes the user's colours where the look gives the
     user's set, its own otherwise, and the patron's palettes resolve against them, a colour drawn
     and dressed to its dressed colour while the look gives the set it names and to its drawn one
     otherwise, a mix as toward() in court.js mixes, a contrast as browOn() chooses. */
  const LOOKS_MAX = 16;
  /* The user's colours a look gives a set of each kind, by entry, or null. */
  const USER_PICK = {
    skin: L => (L.skin ? { face: L.skin.face, cheek: L.skin.cheek } : null),
    hair: L => (L.hair ? { 0: L.hair.bands[0], 1: L.hair.bands[1], 2: L.hair.bands[2], brow: L.hair.brow } : null),
    tabard: L => (L.robe ? { 0: L.robe.bands[0], 1: L.robe.bands[1], 2: L.robe.bands[2], 3: L.robe.bands[3] } : null),
    plume: () => null
  };
  const hexOf = n => '#' + n.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgbOf = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mixHex = (a, b, k) => { const to = rgbOf(b); return hexOf(rgbOf(a).map((v, i) => v + (to[i] - v) * k)); };
  /* The contrast of two colours, as WCAG reckons it, from 1 to 21, as court.js reckons it. */
  const lum = c => { const [r, g, b] = rgbOf(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const wcag = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  /* What colour() asks of a patron in the look L: the names of its bound sets and palettes, a
     reference to one of them, and a mix or a contrast. */
  function memberOf(v, L) {
    const sets = isObj(v.sets) ? v.sets : {}, pal = isObj(v.palettes) ? v.palettes : {}, vals = {}, chosen = {};
    for (const n of Object.keys(sets)) {
      const pick = has(USER_PICK, sets[n]) ? USER_PICK[sets[n]](L) : null, own = Object.assign({}, v.own[n]);
      chosen[n] = !!pick;
      if (pick) for (const e of Object.keys(pick)) if (pick[e] !== undefined) own[e] = pick[e];
      vals[n] = own;
    }
    const copy = x => (Array.isArray(x) ? x.map(b => [b[0], b[1]]) : x);
    function ref(set, entry, path) {
      if (has(vals, set)) {
        if (!has(vals[set], entry)) throw new Error(path + ': the bound set ' + quote(set) + ' gives no ' + quote(entry));
        return copy(vals[set][entry]);
      }
      if (!has(pal[set], entry)) throw new Error(path + ': the palette ' + quote(set) + ' gives no ' + quote(entry));
      const x = pal[set][entry];
      if (isObj(x) && has(x, 'drawn')) return chosen[x.set] ? one(x.dressed, at(path, 'dressed')) : one(x.drawn, at(path, 'drawn'));
      if (Array.isArray(x)) return x.map((b, i) => [b[0], one(b[1], idx(path, i))]);
      return one(x, path);
    }
    /* One colour: hex, a reference to @base or a bound set, a mix or a contrast. */
    function one(c, path) {
      if (typeof c === 'string') {
        if (c[0] === '#') return c;
        const m = REF.exec(c);
        if (m && m[1] === 'base' && has(KW.pack.BASE, m[2])) return KW.pack.BASE[m[2]];
        if (m && (has(vals, m[1]) || has(pal, m[1]))) return ref(m[1], m[2], path);
        throw notBuilt(path, 'the colour ' + quote(c));
      }
      if (isObj(c) && has(c, 'rgb')) return rgba(c);
      if (isObj(c) && has(c, 'mix')) return mixHex(one(c.mix[0], path), one(c.mix[1], path), c.k);
      if (isObj(c) && has(c, 'contrast')) {
        const a = one(c.contrast[0], path), b = one(c.contrast[1], path), o = one(c.on, path);
        const on = Array.isArray(o) ? o[Math.min(has(c, 'band') ? c.band : 0, o.length - 1)][1] : o;
        return wcag(a, on) > wcag(b, on) ? a : b;
      }
      throw notBuilt(path, 'the colour ' + JSON.stringify(c));
    }
    return { names: n => has(vals, n) || has(pal, n), ref, colour: one };
  }
  const lookKey = L => JSON.stringify([L.skin ? [L.skin.face, L.skin.cheek] : null, L.hair ? [L.hair.bands, L.hair.brow] : null, L.robe ? L.robe.bands : null]);
  function compilePatron(pack, id, v) {
    const path = 'cast.' + id, sets = isObj(v.sets) ? v.sets : {}, A = v.anchors;
    for (const n of Object.keys(sets)) if (!(isObj(v.own) && has(v.own, n))) throw notBuilt(at(at(path, 'own'), n), 'a bound set without colours of its own');
    const looks = new Map();
    function compiled(look) {
      const L = isObj(look) ? look : {}, k = lookKey(L);
      let c = looks.get(k);
      if (!c) {
        const env = Object.assign(placedEnv(pack, 'the cast'), { member: memberOf(v, L) });
        const list = (shapes, p, part) => freeze(shapes.map((s, i) => ({ c: shape(s, idx(p, i), env), at: A[has(s, 'at') ? s.at : part] })));
        c = { still: v.still.map((pt, i) => list(pt.shapes, at(idx(at(path, 'still'), i), 'shapes'), pt.at)),
          shut: list(v.states.shut, at(at(path, 'states'), 'shut'), 'seat'), open: list(v.states.open, at(at(path, 'states'), 'open'), 'seat') };
        if (looks.size >= LOOKS_MAX) looks.clear();
        looks.set(k, c);
      }
      return c;
    }
    // the patron's own look, compiled now, so that what this engine does not build is found at start
    compiled({ skin: null, hair: null, robe: null });
    const drawList = (list, x, by) => { const E = named(0, null); for (const r of list) drawShape(r.c, E, x + r.at[0], by + r.at[1]); };
    const ownOf = (kind, n) => { const s = Object.keys(sets).find(k => sets[k] === kind); return s ? Array.from({ length: n }, (_, i) => v.own[s][i]) : []; };
    return Object.freeze({
      draw(x, by, look) { for (const l of compiled(look).still) drawList(l, x, by); },
      mouth(x, by, open, look) { drawList(compiled(look)[open ? 'open' : 'shut'], x, by); },
      drawn: Object.freeze({ hair: Object.freeze(ownOf('hair', 3)), robe: Object.freeze(ownOf('tabard', 4)) }), from: MEDIEVAL + '#' + (++compiles)
    });
  }
  const CAST_COMPILERS = { critter: compileCritter, foe: compileFoe, patron: compilePatron };
  /* The member id of the loaded pack's cast, compiled. Throws when it names something this engine
     does not build. */
  function compileMember(pack, id) {
    const sec = pack.data.cast, v = isObj(sec) && isObj(sec[id]) ? sec[id] : null, path = 'cast.' + id;
    if (!v) throw new Error(path + ': the pack has no such cast member');
    if (!has(CAST_COMPILERS, v.role)) throw notBuilt(at(path, 'role'), 'the role ' + quote(v.role));
    return CAST_COMPILERS[v.role](pack, id, v);
  }
  /* Where a member of the cast goes in KW.cast, [set, name], or null when the engine has no member
     there: the id's role and name. */
  function slotOf(id, v) {
    if (!isObj(v) || !has(ROLE_SETS, v.role) || !id.startsWith(v.role + '.')) return null;
    const set = ROLE_SETS[v.role], name = id.slice(v.role.length + 1);
    return has(cast[set], name) ? [set, name] : null;
  }
  /* KW.cast: the engine's supporting cast, by role, as the code gives it (the critters of
     KW.props.CRITTERS, the foes of KW.props.FOES and the patrons of KW.props.PATRONS, which court.js
     gives): the members the pack's cast gives once start() has compiled them, and the code's for
     the rest. */
  const cast = KW.cast = { critters: {}, foes: {}, patrons: {} };
  function restoreCast() {
    const P = KW.props || {};
    for (const [set, code] of [['critters', P.CRITTERS], ['foes', P.FOES], ['patrons', P.PATRONS]]) {
      for (const k of Object.keys(cast[set])) delete cast[set][k];
      Object.assign(cast[set], code || {});
    }
  }
  restoreCast();

  /* ---- Loading ---------------------------------------------------------------------------------
     start() reads kw.medieval from the texts of the packs that ship with the page (the page passes
     KW.packText, as it does to the knight) with the knight's rule: a 'dev' page accepts it
     unsigned, a deployed page only signed. Each of its scenes whose id names a code scene is
     compiled and takes that scene's place in KW.scenes, and is also put under its long name,
     kw.medieval/<id>, which is not enumerable, so that the engine and the settings, which list the
     scenes by their short names, see no more of them than before. A scene that fails to compile,
     and every scene when the pack is refused, missing or the library is not loaded, stays the code
     scene. The refusal itself is the knight's to report, since the knight reads the same texts;
     start() writes one line about where the scenes are drawn from, and one for each scene, kind of
     device or member of the cast that failed to compile. */
  const CODE = {}, LONG = [];
  const cutTo = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
  const say = (level, line) => { const c = typeof console !== 'undefined' ? console : null; if (c && typeof c[level] === 'function') c[level](line); };
  const message = e => { try { return String(e && e.message !== undefined ? e.message : e); } catch (e2) { return 'something that cannot be named'; } };
  /* The id a pack's text gives, or null. */
  function idOf(text) {
    try { const env = JSON.parse(text); return isObj(env) && isObj(env.pack) && typeof env.pack.id === 'string' ? env.pack.id : null; } catch (e) { return null; }
  }
  /* Puts the code scenes back, and takes the long names away. */
  function restore() {
    for (const n of Object.keys(CODE)) KW.scenes[n] = CODE[n];
    for (const n of LONG.splice(0)) delete KW.scenes[n];
  }
  const listed = ids => (ids.length === 1 ? 'the scene ' + ids[0] + ' is' : 'the scenes ' + ids.slice(0, -1).join(', ') + ' and ' + ids[ids.length - 1] + ' are');

  /* Starts the scenes from the texts of the packs that ship with the page, once at start-up, as
     KW.knight.start does the knight. opts may hold keys, which replaces KEYS in read() and is for
     the tests only. Returns, and keeps in KW.world.status, { source, pack, refused, scenes, faults,
     note }: source is 'pack' when any scene is drawn from kw.medieval and 'code' otherwise, pack is
     { id, version, signed } of the pack in use or null, refused { id, step, reason } when it was
     turned away, scenes says for each scene the pack gives whether it is drawn from the 'pack' or
     from 'code', faults lists { scene, reason } for each scene that failed to compile, and note is
     the last line written to the console. What it found for the devices and the cast it keeps in
     KW.world.props and KW.world.cast. */
  function start(texts, allowUnsigned, opts) {
    const o = isObj(opts) ? opts : {}, lib = KW.pack && typeof KW.pack.read === 'function' ? KW.pack : null;
    restore(); restoreKinds(); restoreCast();
    const status = api.status = { source: 'code', pack: null, refused: null, scenes: {}, faults: [], note: '' };
    const props = api.props = { source: 'code', set: null, kinds: {}, faults: [] };
    const castStatus = api.cast = { source: 'code', members: {}, faults: [] };
    const lines = [];
    const line = (level, text) => { lines.push([level, text]); status.note = text; };
    let pack = null;
    if (!lib) line('warn', 'knightwatcher: the scenes of ' + MEDIEVAL + ' are drawn from code: the pack library is not loaded');
    else {
      const readOpts = { allowUnsigned: allowUnsigned === true };
      if (isObj(o.keys)) readOpts.keys = o.keys;
      const results = [];
      for (const t of Array.isArray(texts) ? texts : []) {
        if (idOf(t) !== MEDIEVAL) continue;
        let r;
        try { r = lib.read(t, readOpts); } catch (e) { r = { ok: false, id: MEDIEVAL, step: 'size', reason: 'the pack could not be read: ' + message(e) }; }
        results.push(r);
      }
      const g = lib.gather(results);
      pack = g.packs.get(MEDIEVAL) || null;
      if (!pack) {
        const no = results.filter(r => !(r && r.ok === true)).pop();
        if (no) status.refused = { id: MEDIEVAL, step: String(no.step || 'size'), reason: String(no.reason || '') };
        line('warn', 'knightwatcher: the scenes of ' + MEDIEVAL + ' are drawn from code: ' + (no ? 'the pack ' + MEDIEVAL + ' was refused at the ' + status.refused.step + ' step' : 'no pack ' + MEDIEVAL + ' is loaded'));
      }
    }
    if (pack) {
      status.pack = { id: pack.id, version: pack.version, signed: pack.signed };
      // the devices, from the prop set: each kind it gives that the engine draws, and the code's
      // drawing for a kind that fails to compile, with a line of its own
      const sets = pack.data && isObj(pack.data.props) ? pack.data.props : {};
      if (has(sets, PROPS) && isObj(sets[PROPS].kinds)) {
        props.set = PROPS;
        for (const k of Object.keys(sets[PROPS].kinds)) {
          if (!has(kinds, k)) continue;
          try { kinds[k] = compileKind(pack, PROPS, k); props.kinds[k] = 'pack'; props.source = 'pack'; } catch (e) {
            const reason = message(e);
            props.kinds[k] = 'code'; props.faults.push({ kind: k, reason });
            line('warn', 'knightwatcher: the device kind ' + k + ' is drawn from code: it could not be compiled: ' + cutTo(reason, 120));
          }
        }
      }
      // the cast: each member that takes the place of one the engine has, and the code's for a
      // member that fails to compile, with a line of its own
      const members = pack.data && isObj(pack.data.cast) ? pack.data.cast : {};
      for (const id of Object.keys(members)) {
        const slot = slotOf(id, members[id]);
        if (!slot) continue;
        try { cast[slot[0]][slot[1]] = compileMember(pack, id); castStatus.members[id] = 'pack'; castStatus.source = 'pack'; } catch (e) {
          const reason = message(e);
          castStatus.members[id] = 'code'; castStatus.faults.push({ member: id, reason });
          line('warn', 'knightwatcher: the cast member ' + id + ' is drawn from code: it could not be compiled: ' + cutTo(reason, 120));
        }
      }
      const drawn = [], data = pack.data && isObj(pack.data.scenes) ? pack.data.scenes : {};
      for (const id of Object.keys(data)) {
        if (!(has(KW.scenes, id) || has(CODE, id))) continue;
        if (!has(CODE, id)) CODE[id] = KW.scenes[id];
        try {
          const sc = compile(pack, id), long = MEDIEVAL + '/' + id;
          KW.scenes[id] = sc;
          Object.defineProperty(KW.scenes, long, { value: sc, enumerable: false, configurable: true, writable: false });
          LONG.push(long);
          status.scenes[id] = 'pack'; drawn.push(id);
        } catch (e) {
          const reason = message(e);
          status.scenes[id] = 'code'; status.faults.push({ scene: id, reason });
          line('warn', 'knightwatcher: the scene ' + id + ' is drawn from code: it could not be compiled: ' + cutTo(reason, 120));
        }
      }
      if (drawn.length) { status.source = 'pack'; line('info', 'knightwatcher: ' + listed(drawn) + ' drawn from the pack ' + pack.id + ' ' + pack.version + (pack.signed ? ', signed' : ', unsigned')); }
      else if (!status.faults.length) line('warn', 'knightwatcher: the scenes of ' + MEDIEVAL + ' are drawn from code: the pack ' + MEDIEVAL + ' gives none of them');
    }
    for (const [level, text] of lines) say(level, text);
    return status;
  }

  const api = KW.world = { MEDIEVAL, PROPS, compile, compileKind, compileMember, start, status: null, props: null, cast: null };
})(window.KW);
