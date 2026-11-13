/* Knightwatcher: the engine. Each frame it chooses the scene, walks the knight between the scene's
   spots, plays the swat and the events, and draws everything in order. What it shows comes from
   KW.engine.input, which the demo (demo.js) or the state file (main.js) sets:
     w       the condition that wins, as KW.state makes it: { id, lv, st, scene, hl, sub }
     is      'auto' for the quiet scenes to take turns, or the name of the one to keep
     turnMs  how long each quiet scene lasts while they take turns
     piOK    whether the pie is on its plate
     tv      whether the television in the house is on
     helmet  'auto' (off indoors), 'on' or 'off' */
(function (KW) {
  'use strict';
  const D = KW.draw, V = KW.view, K = KW.knight, P = KW.props, U = V.U;
  const { alpha, Rh, lerp, clamp01, ease, hash } = D;

  const E = KW.engine = {
    input: { w: KW.state.IDLE, is: 'auto', turnMs: 60000, piOK: true, tv: false, helmet: 'auto' },
    note: ''
  };
  const frozen = () => KW.hooks.t;

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
  /* Stroll to the next spot, stand there a while doing what the spot is for, move on. */
  function stroll(list, t, o, busy) {
    const st = list[round.i % list.length], dx = st.x * U - kx;
    if (busy) return null;
    if (Math.abs(dx) > 2) { kx += Math.sign(dx) * 1.5; o.walk = true; round.arr = 0; return null; }
    if (!round.arr) round.arr = frozen() ? 1 : t;
    const el = t - round.arr; if (el > st.dur * 1000) { round.i++; round.arr = 0; }
    return { act: st.act, el };
  }

  /* An event: the caption shows whatever happens, and the event plays out only while nothing at
     warning or above is up, in a scene that suits it, and with no swat under way. */
  function fireEvent(type, text) {
    const e = EVENTS[type], w = E.input.w; if (!e) return;
    if (text) KW.ui.caption(text, e.dur + 1500);
    if (w.lv >= 3 || !e.where.includes(w.scene || idleScene(performance.now())) || swat) return;
    ev = { type, t0: frozen() ? 0 : performance.now(), dur: e.dur };
  }

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
    const inp = E.input, w = inp.w, scene = w.scene || idleScene(t), sc = KW.scenes[scene], piOK = inp.piOK;
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
    const s = { w, piOK, tv: inp.tv, kx, o, here, inBed, helmOff: inBed || o.helmet === false, strike: false };
    if (sc.act) sc.act(t, s);
    o.x = kx;

    // the swat, the events
    if (swat) {
      const el = t - swat.t0, i = Math.floor(el / 900);
      if (!funOK || i >= swat.segs.length) { swat = null; lastSwat = t; while (pendingFlies > 0 && flies.filter(f => !f.dead).length < 8) { pendingFlies--; addFly(t); } }
      else {
        const dir = swat.segs[i], q = (el - i * 900) / 900, cutting = K.swing(o, q, dir);
        if (q >= .3) for (const f of flies) if (!f.dead && f.side === dir && t - f.born > 1300) { if (!cutting || o.wang * dir >= f.th - .15) { f.dead = t; f.at = flyPos(f, t); } }
        if (q > .7 && !flies.some(f => !f.dead && f.side === dir)) { o.eyes = 'happy'; o.mouth = 'smile'; }
      }
    } else if (funOK && !ev && flies.some(f => !f.dead && t - f.born > 1300) && t - lastSwat > 30000) startSwat(t);
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
