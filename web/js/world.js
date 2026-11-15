/* Knightwatcher: the scene compiler (docs/worlds.md). Turns a scene of a world pack, as the pack
   library (pack.js) has read and checked it, into an object with the scene interface of
   docs/page.md, and puts the scenes of kw.medieval in place of the code scenes of the same names.

   Nothing in a pack runs. A scene compiles into frozen records: each shape a kind from SHAPES, each
   mark one of MARKS, each predicate one the engine evaluates in holds(), each effect a name in
   KW.effects. The scene's paint, draw, over and key are the functions below, closing over those
   records. No function is made from data.

   The compiler builds what the scenes converted so far need, and refuses the rest of format 1.1 with
   a reason that says so: a scene that names something it does not build stays the code scene. What
   it builds:
   - terms: numbers, and term objects of c, the named values L, R, T and W (the screen's edges and
     width, from KW.view), x (a tile's x), h (a hash of the tile's x) and wave (a sine of the scene's
     time), added in the order they are written, so that a term gives the same bits as the code it
     replaces;
   - colours: hex, @base and the pack's own palettes, translucent colours spelt as the code spells
     them ('rgba(0,0,0,.3)'), and band lists of these;
   - shapes: rect, ell, rrect, poly and strip without clip, glow, fx, use and tile without pick or
     only;
   - layers: still (painted into the cached backdrop), moving (in draw) and over (in over), each with
     its when; no groups or keyframes yet;
   - the things mark, where the devices behind the watcher are drawn;
   - the backdrop's key, worked out from what the still layers read: the predicates of their when.
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
     named values of the moment: L, R, T, W, x and t. */
  const CONST = 0, NAMED = 1, HASH = 2, WAVE = 3;
  const NAMES = ['L', 'R', 'T', 'W', 'x'];
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
  const named = (t, s) => ({ L: V.HL, R: V.HR, T: V.HT, W: V.HR - V.HL, x: 0, t, s });

  /* ---- Colours ----------------------------------------------------------------------------------
     A colour resolves once, at compile, to what the primitives take: a string, or a band list. */
  const REF = /^@([a-z][a-z0-9-]{0,31})\.([a-z0-9][a-z0-9-]{0,31})$/;
  /* A translucent colour as the scenes spell it, 'rgba(0,0,0,.3)': the alpha without its 0. */
  const rgba = c => 'rgba(' + parseInt(c.rgb.slice(1, 3), 16) + ',' + parseInt(c.rgb.slice(3, 5), 16) + ',' + parseInt(c.rgb.slice(5, 7), 16) + ',' + String(c.a).replace(/^0\./, '.') + ')';
  function colour(v, path, env, depth) {
    if (typeof v === 'string') {
      if (v[0] === '#') return v;
      const m = REF.exec(v);
      if (m && m[1] === 'base' && has(KW.pack.BASE, m[2])) return KW.pack.BASE[m[2]];
      const own = env.pack.data.palettes;
      if (m && own && has(own, m[1]) && has(own[m[1]], m[2]) && (depth || 0) < 2) return fill(own[m[1]][m[2]], path, env, (depth || 0) + 1);
      throw notBuilt(path, 'the colour ' + quote(v));
    }
    if (isObj(v) && has(v, 'rgb')) return rgba(v);
    throw notBuilt(path, 'a mixed colour');
  }
  function fill(v, path, env, depth) {
    if (!Array.isArray(v)) return colour(v, path, env, depth);
    return v.map((b, i) => [b[0], colour(b[1], idx(idx(path, i), 1), env, depth)]);
  }

  /* ---- Shapes -----------------------------------------------------------------------------------
     Each kind compiles a shape to a record and draws a record. draw(r, E, ox, oy) draws it moved by
     (ox, oy), which is where a stamp is put; a layer's shapes are drawn at (0, 0). */
  const noClip = (s, path) => { if (has(s, 'clip')) throw notBuilt(at(path, 'clip'), 'a clip in a scene'); };
  const SHAPES = {
    rect: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), w: term(s.w, at(path, 'w')), h: term(s.h, at(path, 'h')), f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { (typeof r.f === 'string' ? D.Rh : D.Rv)(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.w, E), val(r.h, E), r.f); }
    },
    ell: {
      compile: (s, path, env) => { noClip(s, path); return { p: point(s.p, at(path, 'p')), rx: term(s.rx, at(path, 'rx')), ry: term(s.ry, at(path, 'ry')), f: fill(s.fill, at(path, 'fill'), env) }; },
      draw(r, E, ox, oy) { D.ell(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.rx, E), val(r.ry, E), r.f); }
    },
    rrect: {
      compile: (s, path, env) => { noClip(s, path); return { p: point(s.p, at(path, 'p')), w: term(s.w, at(path, 'w')), h: term(s.h, at(path, 'h')), r: term(s.r, at(path, 'r')), f: fill(s.fill, at(path, 'fill'), env) }; },
      draw(r, E, ox, oy) { D.rrect(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.w, E), val(r.h, E), val(r.r, E), r.f); }
    },
    poly: {
      compile: (s, path, env) => ({ pts: s.pts.map((q, i) => point(q, idx(at(path, 'pts'), i))), cols: s.dir === 'cols', f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { D.poly(r.pts.map(q => [ox + val(q[0], E), oy + val(q[1], E)]), r.f, r.cols); }
    },
    strip: {
      compile: (s, path, env) => ({ p0: point(s.p0, at(path, 'p0')), p1: point(s.p1, at(path, 'p1')), hw0: term(s.hw0, at(path, 'hw0')), hw1: term(s.hw1, at(path, 'hw1')), f: fill(s.fill, at(path, 'fill'), env) }),
      draw(r, E, ox, oy) { D.strip(ox + val(r.p0[0], E), oy + val(r.p0[1], E), ox + val(r.p1[0], E), oy + val(r.p1[1], E), val(r.hw0, E), val(r.hw1, E), r.f); }
    },
    glow: {
      compile: (s, path, env) => ({ p: point(s.p, at(path, 'p')), r: term(s.r, at(path, 'r')), c: colour(s.colour, at(path, 'colour'), env), a: term(s.a, at(path, 'a')) }),
      draw(r, E, ox, oy) { D.glow(ox + val(r.p[0], E), oy + val(r.p[1], E), val(r.r, E), r.c, val(r.a, E)); }
    },
    /* An effect of KW.effects, its fields compiled by the kinds its table gives: scalars as terms,
       colours resolved, the rest as written. It is drawn with the scene's time when it moves. */
    fx: {
      compile(s, path, env) {
        if (env.stamp) throw notBuilt(path, 'an effect in a stamp');
        const lib = KW.effects && KW.effects[s.fx];
        if (!lib) throw new Error(at(path, 'fx') + ': the effects library has no ' + quote(s.fx));
        if (lib.clock === 'trigger') throw notBuilt(at(path, 'fx'), 'the triggered effect ' + quote(s.fx));
        const F = lib.fields, fields = [];
        for (const k of Object.keys(s)) {
          if (k === 'k' || k === 'fx') continue;
          const p = at(path, k), kind = has(F, k) ? F[k].kind : null;
          if (!kind) throw notBuilt(p, 'the field ' + quote(k) + ' of an effect');
          const how = kind === 'point' ? 'point' : kind === 'offset' || kind === 'length' || kind === 'term' ? 'term' : 'plain';
          const v = how === 'point' ? point(s[k], p) : how === 'term' ? term(s[k], p) : kind === 'colour' ? colour(s[k], p, env) : kind === 'colours' ? s[k].map((c, i) => colour(c, idx(p, i), env)) : s[k];
          fields.push([k, how, v]);
        }
        return { fx: s.fx, time: lib.clock === 'time', fields };
      },
      draw(r, E) {
        const f = {};
        for (const [k, how, v] of r.fields) f[k] = how === 'point' ? [val(v[0], E), val(v[1], E)] : how === 'term' ? val(v, E) : v;
        if (r.time) KW.effects[r.fx].draw(f, E.t); else KW.effects[r.fx].draw(f);
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
       before to, as the scenes' loops run. */
    tile: {
      compile(s, path, env) {
        if (has(s, 'pick')) throw notBuilt(at(path, 'pick'), 'a tile\'s picks');
        return { step: s.step, phase: s.phase, from: term(s.from, at(path, 'from')), to: term(s.to, at(path, 'to')),
          shapes: s.shapes.map((t, i) => shape(t, idx(at(path, 'shapes'), i), env)) };
      },
      draw(r, E, ox, oy) {
        const to = val(r.to, E);
        for (let x = Math.floor(val(r.from, E) / r.step) * r.step + r.phase; x < to; x += r.step) {
          E.x = x;
          for (const t of r.shapes) drawShape(t, E, ox, oy);
        }
      }
    }
  };
  /* The marks: where in the scene's order the engine draws something of its own. */
  const MARKS = {
    things: { compile: () => ({}), draw(r, E) { KW.devices.draw(E.t, E.s); } }
  };

  function shape(s, path, env) {
    const kind = has(SHAPES, s.k) ? SHAPES[s.k] : has(MARKS, s.k) ? MARKS[s.k] : null;
    if (!kind) throw notBuilt(at(path, 'k'), (env.marks.includes(s.k) ? 'the mark ' : 'the shape kind ') + quote(s.k));
    for (const k of ['g', 'only']) if (has(s, k)) throw notBuilt(at(path, k), quote(k) + ' on a shape');
    return { k: s.k, r: kind.compile(s, path, env) };
  }
  function drawShape(c, E, ox, oy) { (has(SHAPES, c.k) ? SHAPES[c.k] : MARKS[c.k]).draw(c.r, E, ox, oy); }

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
  function layer(l, path, env) {
    for (const k of ['groups', 'anim']) if (has(l, k)) throw notBuilt(at(path, k), 'a layer\'s ' + k);
    const when = (l.when || []).map(predicate);
    for (const p of when) if (p.n !== 'cond' && p.n !== 'night' && p.n !== 'day' && !has(FROM_FRAME, p.n)) throw notBuilt(at(path, 'when'), 'the predicate ' + quote(p.n));
    return { when, shapes: l.shapes.map((s, i) => shape(s, idx(at(path, 'shapes'), i), env)) };
  }
  function drawLayers(list, E) {
    for (const l of list) if (l.when.every(p => holds(p, E.s))) for (const c of l.shapes) drawShape(c, E, 0, 0);
  }

  /* ---- Scenes ---------------------------------------------------------------------------------- */

  /* The fields of a scene this engine does not build yet: the parts of the acts, gear at rest, the
     foe's zone and the pole drawn under a high place. decor, quiet, name, sound and companion are
     not read: nothing draws decorations yet, the engine's own lists say which scenes take turns
     while all is quiet, and the other three are names and reserved slots. */
  const LATER = ['rests', 'bed', 'screen', 'seat', 'anvil', 'target', 'foe', 'pole'];

  /* The scene id of the loaded pack (a read() result of format 1.1) compiled to an object with the
     scene interface. Throws when the scene names something this engine does not build. */
  function compile(pack, id) {
    const v = pack.data.scenes[id], path = 'scenes.' + id;
    if (!isObj(v)) throw new Error(path + ': the pack has no such scene');
    for (const k of LATER) if (has(v, k)) throw notBuilt(at(path, k), 'the scene\'s ' + k);
    if (v.hosts.length) throw notBuilt(at(path, 'hosts'), 'hosting events');
    const env = { pack, stamp: false, using: [], marks: KW.pack.WORLD_LISTS.MARKS };
    const lists = {};
    for (const k of ['still', 'moving', 'over']) lists[k] = freeze(v[k].map((l, i) => layer(l, idx(at(path, k), i), env)));
    // the backdrop's key: each predicate the still layers wait on, once, in the order first named
    const keyed = [], seen = new Set();
    for (const l of lists.still) for (const p of l.when) { const n = (p.neg ? '!' : '') + p.n + (p.id ? ':' + p.id : ''); if (!seen.has(n)) { seen.add(n); keyed.push(p); } }
    freeze(keyed);
    const places = {};
    for (const n of Object.keys(v.things)) places[n] = Object.assign({}, v.things[n]);
    const sc = {
      spot: v.spot, places, can: v.can.slice(), rounds: v.rounds.map(r => ({ x: r.x, act: r.act, dur: r.dur })),
      key: s => keyed.map(p => (holds(p, s) ? '1' : '0')).join(''),
      draw(t, s) { drawLayers(lists.moving, named(t, s)); }
    };
    if (lists.still.length) sc.paint = s => drawLayers(lists.still, named(0, s));
    if (lists.over.length) sc.over = (t, s) => drawLayers(lists.over, named(t, s));
    if (v.weapon === 'away') sc.sword = false;
    if (v.helmet === 'off') sc.helmet = false;
    return sc;
  }

  /* ---- Loading ---------------------------------------------------------------------------------
     start() reads kw.medieval from the texts of the packs that ship with the page (the page passes
     KW.packText, as it does to the knight) with the knight's rule: a 'dev' page accepts it
     unsigned, a deployed page only signed. Each of its scenes whose id names a code scene is
     compiled and takes that scene's place in KW.scenes, and is also put under its long name,
     kw.medieval/<id>, which is not enumerable, so that the engine and the settings, which list the
     scenes by their short names, see no more of them than before. A scene that fails to compile,
     and every scene when the pack is refused, missing or the library is not loaded, stays the code
     scene. The refusal itself is the knight's to report, since the knight reads the same texts;
     start() writes one line about where the scenes are drawn from, and one for each scene that
     failed to compile. */
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
     the last line written to the console. */
  function start(texts, allowUnsigned, opts) {
    const o = isObj(opts) ? opts : {}, lib = KW.pack && typeof KW.pack.read === 'function' ? KW.pack : null;
    restore();
    const status = api.status = { source: 'code', pack: null, refused: null, scenes: {}, faults: [], note: '' };
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

  const api = KW.world = { MEDIEVAL, compile, start, status: null };
})(window.KW);
