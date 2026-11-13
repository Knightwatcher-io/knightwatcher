/* Knightwatcher: the engine. Each frame it chooses the scene, walks the knight between the scene's
   spots, plays the swat and the events, and draws everything in order. What it shows comes from
   KW.engine.input, which the demo (demo.js) or the state file (main.js) sets:
     w       the condition that wins, as KW.state makes it: { id, lv, st, scene, hl, sub }
     is      'auto' for the quiet scenes to take turns, or the name of the one to keep
     turnMs  how long each quiet scene lasts while they take turns
     things  the watched things standing in the scene's places, as KW.state.map() gives them:
             { place, kind, ok, alert }, place naming one of the scene's places
     tv      whether the television in the house is on
     helmet  'auto' (off indoors), 'on' or 'off' */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, K = KW.knight, P = KW.props, SP = KW.sprites, C = D.C, U = V.U;
  const { alpha, Rh, strip, lerp, clamp01, ease, hash } = D;

  const E = KW.engine = {
    input: { w: KW.state.IDLE, is: 'auto', turnMs: 60000, things: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], tv: false, helmet: 'auto' },
    note: ''
  };
  /* Whether the address's t= hook freezes time; KW.hooks.t is then the frozen time. */
  const frozen = () => KW.hooks.frozen;

  /* The quiet scenes take turns, each for the input's turnMs. */
  const TURNS = ['battlement', 'camp', 'house', 'yard'];
  /* Each event lasts dur ms and plays only in the scenes listed. */
  const OUTDOORS = Object.keys(KW.scenes).filter(k => KW.scenes[k].outdoors);
  const EVENTS = {
    goblin: { dur: 3400, where: ['battlement', 'camp'] },
    crate:  { dur: 4200, where: OUTDOORS },
    feast:  { dur: 3600, where: ['battlement', 'camp', 'yard', 'house'] } };

  let main = null, kx = 96 * U, ev = null, curScene = '', fadeAt = -1e9, sceneT0 = 0, round = { i: 0, arr: 0 };
  const flies = []; let swat = null, lastSwat = -1e9, pendingFlies = 0;
  const bgCache = { key: '', cv: document.createElement('canvas') };

  function idleScene(t) { const { is, turnMs } = E.input; return is === 'auto' ? TURNS[Math.floor((t - sceneT0) / turnMs) % TURNS.length] : is; }

  /* A blocked advert becomes a fly. Eight at most are on screen; the rest wait for the next swat. */
  function addFly(t) {
    const live = flies.filter(f => !f.dead);
    if (live.length >= 8) { pendingFlies++; return; }
    const side = live.filter(f => f.side > 0).length <= live.filter(f => f.side < 0).length ? 1 : -1, h = hash(flies.length * 13 + 5 + Math.floor(t));
    flies.push({ side, r: 130 + (h % 110), th: .35 + ((h >> 5) % 100) / 100 * 1.1, ph: (h >> 9) % 7, born: t, dead: 0 });
  }
  function flyPos(f, t) {
    const hx = kx + f.side * (50 + f.r * Math.sin(f.th)) + Math.sin(t / 420 + f.ph) * 20, hy = V.HFL - 80 - f.r * Math.cos(f.th) + Math.cos(t / 330 + f.ph * 2) * 15;
    const q = ease(clamp01((t - f.born) / 1300));
    return [lerp(f.side > 0 ? V.HR + 30 : V.HL - 30, hx, q), lerp(hy - 70, hy, q)];
  }
  function startSwat(t) {
    const live = flies.filter(f => !f.dead && t - f.born > 1300); if (!live.length) return;
    const segs = []; if (live.some(f => f.side > 0)) segs.push(1); if (live.some(f => f.side < 0)) segs.push(-1);
    swat = { t0: frozen() ? 0 : t, segs };
  }
  /* Stroll to the next spot, stand there a while doing what the spot is for, move on. The walk
     moves the knight a step each frame, so with time frozen the knight stays where they are, in
     mid-stride. */
  function stroll(list, t, o, busy) {
    const st = list[round.i % list.length], dx = st.x * U - kx;
    if (busy) return null;
    if (Math.abs(dx) > 2) { if (!frozen()) kx += Math.sign(dx) * 1.5; o.walk = true; round.arr = 0; return null; }
    if (!round.arr) round.arr = frozen() ? 1 : t;
    const el = Math.max(0, t - round.arr); if (el > st.dur * 1000) { round.i++; round.arr = 0; }
    return { act: st.act, el };
  }

  /* An event: the caption shows whatever happens, and the event plays out only while nothing at
     warning or above is up, in a scene that suits it, and with no swat under way. */
  function fireEvent(type, text) {
    const e = EVENTS[type], w = E.input.w; if (!e) return;
    if (text) KW.ui.caption(text, e.dur + 1500);
    if (w.lv >= 3 || !e.where.includes(w.scene || idleScene(frozen() ? KW.hooks.t : performance.now())) || swat) return;
    ev = { type, t0: frozen() ? 0 : performance.now(), dur: e.dur };
  }

  /* ---- Watched things in their places --------------------------------------------------------
     Each scene names its places in its places field (docs/page.md): the pie's, three high ones
     for cameras (h1 to h3) and three on the ground for every other device (g1 to g3). KW.state
     puts each thing in one. The still part of each thing, with the pole a high place may have, is
     painted once into a small canvas of its own, kept by place, kind and state, and drawn with one
     call where the scene's draw reaches its places, so the scene's drawing order stays as it was.
     Only what moves is drawn each frame: the pie's steam and a device's lamp, whose loop starts at
     a different moment in each place. The question mark over a gone thing that alerts blinks, and
     is kept in a canvas of its own too. A place in front of the ground line (front) is drawn by the
     engine after the knight, and a place with flip shows its thing the other way round. */
  const ORDER = ['pie', 'h1', 'h2', 'h3', 'g1', 'g2', 'g3'], PHASE_MS = 523;
  const SPRITES = new Map(), SPRITE_MAX = 64;
  const kindName = k => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(P.KINDS, k) ? k : 'box');

  /* A wooden pole from the foot of a camera's wall plate down to foot, for a high place with
     nothing to mount on. */
  function poleHD(x, y, foot) {
    const len = foot - (y - 40) + 1;
    D.rrect(x + 23, y - 40, 9, len, 2, C.K); D.rrect(x + 25, y - 40, 5, len - 2, 1, [[.3, C.N0], [.7, C.N1], [1, C.N2]]);
    Rh(x + 21, foot - 3, 13, 4, C.K); Rh(x + 23, foot - 2, 9, 2, C.N2);
  }

  /* A canvas of w by h at (ox, oy) on the grid, painted once by paint() with the grid's
     coordinates, mirrored about x when flip is set. */
  function cached(key, ox, oy, w, h, flip, x, paint) {
    let sp = SPRITES.get(key);
    if (!sp) {
      if (SPRITES.size >= SPRITE_MAX) SPRITES.clear();
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'), was = D.getCtx();
      if (flip) c.setTransform(-1, 0, 0, 1, 2 * x - ox, -oy); else c.setTransform(1, 0, 0, 1, -ox, -oy);
      D.setCtx(c); alpha(1); paint(); D.setCtx(was);
      sp = { cv, ox, oy }; SPRITES.set(key, sp);
    }
    return sp;
  }

  function placeHD(name, pl, th, t) {
    const kind = kindName(th.kind), k = P.KINDS[kind], ctx = D.getCtx(), foot = pl.pole || 0;
    const ox = pl.x - 64, oy = pl.y - 136, h = Math.max(168, foot - oy + 8);
    const sp = cached([pl.x, pl.y, pl.flip ? 'flip' : '', foot, kind, th.ok ? 'up' : 'gone'].join('|'), ox, oy, 128, h, pl.flip, pl.x, () => {
      if (foot) poleHD(pl.x, pl.y, foot);
      k.draw(pl.x, pl.y, 0, th.ok, 'still');
    });
    ctx.drawImage(sp.cv, sp.ox, sp.oy);
    const tt = t + Math.max(0, ORDER.indexOf(name)) * PHASE_MS;
    if (pl.flip) { ctx.save(); ctx.transform(-1, 0, 0, 1, 2 * pl.x, 0); k.draw(pl.x, pl.y, tt, th.ok, 'moving'); ctx.restore(); }
    else k.draw(pl.x, pl.y, tt, th.ok, 'moving');
    if (!th.ok && th.alert && Math.floor(t / 400) % 2) {
      const my = pl.y - k.mark, m = cached('mark|' + pl.x + ',' + my, pl.x - 32, my - 8, 64, 80, false, pl.x, () => SP.mark(pl.x, my, '?'));
      ctx.drawImage(m.cv, m.ox, m.oy);
    }
  }

  /* Draws the things in the scene's places, those behind the knight (front false) or those in
     front of it (front true). */
  function placesHD(t, s, front) {
    const places = s.places; if (!places) return;
    for (const th of s.things) {
      const pl = th && places[th.place];
      if (pl && !pl.front === !front) placeHD(th.place, pl, th, t);
    }
  }

  /* The address's pl=1: every place's box outlined and named, for reviewing where they stand.
     The outer box is the place's, 88 by 112 above the base; the inner one, 80 by 64, is what a
     thing may fill; the base is the white line. The pie's place is white, high places blue and
     ground places amber; a place in front of the knight has a broken outline. */
  const GLYPHS = { P: '111101111100100', H: '101101111101101', G: '111100101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111' };
  const CLASS_COLOUR = { pie: C.W, high: '#7fe9ff', ground: '#ffb000' };
  function outlineHD(s) {
    const places = s.places; if (!places) return;
    for (const name of ORDER) {
      const pl = places[name]; if (!pl) continue;
      const c = CLASS_COLOUR[pl.cls] || C.W, x0 = pl.x - pl.w / 2, y0 = pl.y - pl.h;
      const line = (x, y, w, h) => { if (!pl.front) { Rh(x, y, w, h, c); return; } for (let k = 0; k < Math.max(w, h); k += 12) Rh(x + (w > h ? k : 0), y + (w > h ? 0 : k), w > h ? Math.min(6, w - k) : w, w > h ? h : Math.min(6, h - k), c); };
      const box = (x, y, w, h, k) => { line(x, y, w, k); line(x, y + h - k, w, k); line(x, y, k, h); line(x + w - k, y, k, h); };
      box(x0, y0, pl.w, pl.h, 2); box(pl.x - 40, pl.y - 64, 80, 64, 1); Rh(x0 - 6, pl.y - 1, pl.w + 12, 3, C.W);
      const label = name === 'pie' ? 'P' : name.toUpperCase();
      Rh(x0 + 3, y0 + 3, 4 + label.length * 12, 19, C.K);
      for (let n = 0; n < label.length; n++) for (let j = 0; j < 15; j++) if (GLYPHS[label[n]][j] === '1') Rh(x0 + 5 + n * 12 + (j % 3) * 3, y0 + 5 + Math.floor(j / 3) * 3, 3, 3, c);
    }
  }

  KW.things = {
    /* For a scene's draw: the things behind the knight. */
    draw(t, s) { placesHD(t, s, false); },
    /* The x of a place with a thing in it, or null. */
    placeX(s, name) { const pl = s.places && name ? s.places[name] : null; return pl && s.things.some(th => th && th.place === name) ? pl.x : null; }
  };

  /* A scene's still part is painted once into its own canvas and kept until the key changes or
     the screen changes shape. */
  function backdrop(key, sc, s, sway) {
    if (bgCache.key !== key) {
      bgCache.cv.width = V.LW + 32; bgCache.cv.height = V.LH; const c = bgCache.cv.getContext('2d');
      D.setCtx(c); c.setTransform(1, 0, 0, 1, V.X0 + 16, V.Y0); sc.paint(s); D.setCtx(main); bgCache.key = key;
    }
    main.setTransform(1, 0, 0, 1, 0, 0); main.drawImage(bgCache.cv, sway - 16, 0);
  }

  function draw(t) {
    const { HL, HR, HT, HH, HFL } = V, freeze = frozen();
    const inp = E.input, w = inp.w, scene = w.scene || idleScene(t), sc = KW.scenes[scene], things = inp.things || [];
    if (scene !== curScene) { if (curScene) { flies.length = 0; swat = null; ev = null; fadeAt = t; } curScene = scene; kx = +(KW.hooks.kx || sc.spot) * U; round = { i: 0, arr: 0 }; }
    const serious = w.lv >= 3, inBed = !!sc.bed && (w.id === 'night' || w.id === 'container_unhealthy');
    const funOK = !serious && !!sc.outdoors;
    const o = K.pose(w.id, t); o.floor = HFL;
    o.helmet = inp.helmet === 'on' ? true : inp.helmet === 'off' ? false : sc.helmet !== false;
    if (sc.sword === false) o.sword = false;
    if (ev && (serious || !EVENTS[ev.type].where.includes(scene))) ev = null;

    // strolling, and what each spot is for
    const free = w.lv < 3 || w.id === 'memory_tight' || w.id === 'disk_full';
    let here = null;
    if (sc.rounds && free && !inBed && w.lv !== 2 && w.id !== 'backup_overdue' && w.id !== 'pi_silent') {
      here = stroll(sc.rounds, t, o, !!ev || !!swat);
      if (here) {
        const el = here.el;
        if (here.act === 'look') o.look = [0, -1, 0, 1][Math.floor(el / 2600) % 4];
        if (here.act === 'sniff') { o.look = 1; if (Math.floor(el / 2400) % 2) { o.eyes = 'happy'; o.mouth = 'smile'; } }
        if (here.act === 'yawn') { const c = el % 6500; if (c > 3800 && c < 5600) { o.eyes = 'closed'; o.mouth = 'o'; } }
      }
    }
    const s = { w, things, places: sc.places || null, tv: inp.tv, kx, o, here, inBed, helmOff: inBed || o.helmet === false, strike: false, mon: KW.hooks.mon };
    // a watched thing down: the knight stays put and looks towards its place, or straight ahead
    // when it is not drawn
    if (w.id === 'thing_down') { const px = KW.things.placeX(s, w.place); o.look = px === null ? 0 : Math.sign(px - kx); }
    if (sc.act) sc.act(t, s);
    o.x = kx;

    // the swat, the events. With time frozen a swat starts only from the address (sw=1), never by
    // itself, since one started by a frame would show only from the next.
    if (swat) {
      const el = t - swat.t0, i = Math.floor(el / 900);
      if (!funOK || i >= swat.segs.length) { swat = null; lastSwat = t; while (pendingFlies > 0 && flies.filter(f => !f.dead).length < 8) { pendingFlies--; addFly(t); } }
      else {
        const dir = swat.segs[i], q = (el - i * 900) / 900, cutting = K.swing(o, q, dir);
        if (q >= .3) for (const f of flies) if (!f.dead && f.side === dir && t - f.born > 1300) { if (!cutting || o.wang * dir >= f.th - .15) { f.dead = t; f.at = flyPos(f, t); } }
        if (q > .7 && !flies.some(f => !f.dead && f.side === dir)) { o.eyes = 'happy'; o.mouth = 'smile'; }
      }
    } else if (!freeze && funOK && !ev && flies.some(f => !f.dead && t - f.born > 1300) && t - lastSwat > 30000) startSwat(t);
    let p = 0; const type = ev && ev.type;
    if (ev) { p = (t - ev.t0) / ev.dur; if (p >= 1) ev = null; }
    const live = ev ? type : null, el = ev ? t - ev.t0 : 0, gx = kx + 170, crX = Math.max(HL + 70, kx - 320), hitAt = 900 + .47 * 900;
    // the goblin comes up from behind whatever the scene puts in its way, or out of the grass
    const wallY = sc.wallAt ? sc.wallAt(gx) : HFL, gobTop = wallY - 46;
    if (live === 'goblin') {
      if (el > 500) { o.eyes = 'angry'; o.look = 1; }
      if (el > 900 && el < 1800) K.swing(o, (el - 900) / 900, 1);
      if (el > 2000) { o.eyes = 'happy'; o.mouth = 'smile'; o.look = 0; }
    }
    if (live === 'crate') { o.look = -1; if (p < .6) o.eyes = 'wide'; else { o.eyes = 'happy'; o.mouth = 'smile'; } }
    if (live === 'feast') { o.eyes = 'happy'; o.mouth = 'chew'; o.food = 1; o.hearts = p > .25; }

    // draw, with a slow sway of the whole picture against burn-in
    const sway = freeze ? 0 : Math.round(Math.sin(t / 61000) * 8);
    const fine = () => main.setTransform(1, 0, 0, 1, V.X0 + sway, V.Y0);
    D.setCtx(main); main.setTransform(1, 0, 0, 1, 0, 0); main.imageSmoothingEnabled = false; alpha(1); main.fillStyle = '#000'; main.fillRect(0, 0, V.LW, V.LH);
    if (sc.paint) backdrop(scene + '|' + (sc.key ? sc.key(s) : ''), sc, s, sway);
    fine(); sc.draw(t, s); fine();
    if (live === 'goblin' && el <= hitAt) {
      main.save(); main.beginPath(); main.rect(HL, HT, HR - HL, wallY - HT); main.clip(); P.goblinHD(gx, wallY - 46 * ease(clamp01(el / 700))); main.restore();
    }
    if (live === 'crate') {
      const q = Math.min(1, p / .6), y = HT - 130 + (HFL - 50 - HT + 130) * q, x = crX + Math.sin(p * 14) * 15 * (1 - q);
      if (p < .9 || Math.floor(t / 110) % 2) { if (q < 1) P.chuteHD(x + 30, y); P.crateHD(x, y); }
    }
    if (!inBed) K.draw(o);
    placesHD(t, s, true);
    for (const f of flies) {
      if (!f.dead) { const [x, y] = flyPos(f, t); P.flyHD(x, y, Math.floor(t / 90 + f.ph) % 2); }
      else { const a = t - f.dead; if (a < 260) P.poofHD(f.at[0], f.at[1]); if (a < 900) Rh(f.at[0] - 3, f.at[1] + a * a / 900, 6, 5, '#3a3344'); }
    }
    for (let i = flies.length - 1; i >= 0; i--) if (flies[i].dead && t - flies[i].dead > 1000) flies.splice(i, 1);
    if (live === 'goblin' && el > hitAt) {
      const q = (el - hitAt) / (EVENTS.goblin.dur - hitAt); P.goblinHD(gx + q * 600, gobTop - Math.sin(q * Math.PI * .85) * 250);
      if (el < hitAt + 350) P.poofHD(gx + 30, gobTop + 16);
    }
    if (w.id === 'attack') { alpha(.08 + .07 * Math.sin(t / 220)); Rh(HL, HT, HR - HL, HH - HT + 20, D.C.R1); alpha(1); }
    if (w.id === 'night' && inBed) { alpha(.5); Rh(HL, HT, HR - HL, HH - HT + 20, '#000'); alpha(1); }
    if (sc.over) { fine(); sc.over(t, s); fine(); }
    if (KW.hooks.pl) outlineHD(s);
    const fd = 1 - (t - fadeAt) / 420; if (fd > 0 && !freeze) { alpha(fd); Rh(HL, HT, HR - HL, HH - HT + 20, '#000'); alpha(1); }
    E.note = !flies.some(f => !f.dead) ? 'no flies' : !funOK ? 'flies wait: ' + (serious ? 'a warning is up' : 'indoors')
      : swat ? 'swatting' : 'next swat in ' + Math.max(0, Math.ceil((30000 - (t - lastSwat)) / 1000)) + ' s';
  }

  Object.assign(E, {
    EVENTS, TURNS,
    init(ctx) { main = ctx; D.setCtx(ctx); },
    draw, addFly, startSwat, fireEvent,
    /* The scene on screen now. */
    scene: () => curScene,
    /* Starts the quiet scenes' turns again from the first, from time t. */
    restartTurns(t) { sceneT0 = t; },
    /* Forgets the cached backdrop, after the screen changes shape. */
    invalidate() { bgCache.key = ''; },
    /* Clears the flies, the swat, any event and the scene, when the page turns to live data, so
       the first live scene comes in without a fade. */
    reset() { flies.length = 0; swat = null; ev = null; pendingFlies = 0; curScene = ''; }
  });
})(window.KW);
