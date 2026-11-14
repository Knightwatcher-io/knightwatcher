/* Knightwatcher: start-up. Reads the address, starts the knight from the packs the page ships with
   and adds the ones the collector downloaded, applies the settings and mounts their screen, sizes
   the canvas to the screen, keeps the clock and the words over the scene, runs the frames, chooses
   between the demo and live data, keeps the shared settings in step with the server, and reloads
   the page when a new version of it has been deployed.
   docs/page.md describes the modes, the settings and the address's test hooks. */
(function (KW) {
  'use strict';
  const V = KW.view, ST = KW.state, E = KW.engine, Demo = KW.demo;
  const H0 = location.hash;

  /* ---- The address: display options and the test hooks ------------------------------------- */
  /* S holds the demo's settings and the display options the engine and the words read. The helmet
     (h) and the headline size (hs) come from the settings below unless the address names them;
     fixed holds those it names with a value in OPTS, and the review bar adds to it when one of its
     buttons sets them, so that the demo writes them back into the address. */
  const S = KW.opts = { on: '', is: 'auto', h: 'auto', hs: 'm', bar: '1', demo: '0' };
  const OPTS = KW.OPTS = { is: { auto: 'Take turns', battlement: 'Battlement', camp: 'Camp', house: 'House', yard: 'Training yard' }, h: { auto: 'Off indoors', on: 'On', off: 'Off' }, hs: { s: 'S', m: 'M', l: 'L' } };
  const given = {};
  H0.slice(1).split('&').forEach(kv => { const [k, v] = kv.split('='); if (k in S && v != null) S[k] = given[k] = decodeURIComponent(v); });
  for (const k of Object.keys(OPTS)) if (!(S[k] in OPTS[k])) S[k] = Object.keys(OPTS[k])[0];
  const fixed = new Set(['h', 'hs'].filter(k => given[k] !== undefined && given[k] in OPTS[k]));
  const hv = k => (H0.match(new RegExp('[#&]' + k + '=([\\w.-]+)')) || [])[1];
  /* t=<ms> freezes time for screenshots, t=0 included, and kx=<x> places the knight (in units of
     U). frozen says whether the address holds a t= with a number, and t is the frozen time, or 0
     without one. pl=1 outlines the scene's places for watched things. th= sets the demo's watched
     things: kinds separated by commas, each followed by - for down or ! for down and alerting; th
     is the list in the contract's shape, or null without the hook. set= opens the settings screen
     at load on a page (knight, monarch, display, quiet, scenes, status), or shows the hold's cue (hold). */
  const tHook = hv('t') == null ? NaN : +hv('t');
  const thHook = (H0.match(/[#&]th=([^&]*)/) || [])[1];
  KW.hooks = { hv, frozen: Number.isFinite(tHook), t: Number.isFinite(tHook) ? tHook : 0, kx: hv('kx'),
    pl: hv('pl') === '1', th: thHook == null ? null : ST.listFromHook(thHook), fixed };
  const freeze = KW.hooks.frozen;

  /* The page's own version, from the meta tag tools/deploy.sh stamps. The repository's own page
     says 'dev'. */
  const ownVersion = (document.querySelector('meta[name="kw-version"]') || {}).content || 'dev';

  /* ---- The knight: from the base pack, or from code ------------------------------------------
     The packs that ship with the page come in through their carriers, before the first frame. Only
     a 'dev' page accepts an unsigned pack; a deployed page refuses one at the signature step. With
     no usable base pack the knight is drawn from code, the full knight. KW.knight writes one line
     to the console for each refused pack and one for where the knight is drawn from. The packs
     the collector downloaded are added below, once the page knows it is served. The knight starts
     in the base pack's defaults, and the settings then choose its look. */
  KW.knight.start(KW.packText, ownVersion === 'dev', { look: {} });

  /* ---- The settings ------------------------------------------------------------------------------
     What the display shows comes from four levels, highest first: the address's hooks, the saved
     settings (the deployment's, shared by every display, when the Knightwatcher server serves the
     page; this browser's own otherwise), the defaults in the state file and the page's own
     (KW.settings). The
     hooks, in the contract's names: bd= the build (a, b or c); arm=one the sword and shield and
     arm=two the greatsword; sk=, hc=, tb= and pm= the skin, hair, tabard and plume swatches; hy= the
     hair style; mon= the monarch, ms= the monarch's skin, mh= the monarch's hair (a hair swatch)
     and mr= the monarch's robe (a tabard swatch); hs= the headline size (s, m, l), h= the helmet
     (on, or auto and off for the helmet off indoors; off also takes it off outdoors) and ck= the
     clock (12 or 24); and sc=<condition>:<scene>, separated by commas, the scene each condition
     plays in. A value a level does not know is ignored, with a line in the console. */
  // The helmet and the headline size are read from S each time, since the review bar may set
  // them as the address does.
  const HOOK = { look: {}, quiet: {}, scenes: {}, get display() {
    const d = {};
    if (hv('ck') !== undefined) d.clock = { 12: 12, 24: 24 }[hv('ck')] || hv('ck');
    if (fixed.has('hs')) d.headline = { s: 'small', m: 'medium', l: 'large' }[S.hs];
    if (fixed.has('h')) d.helmet_indoors = S.h === 'on';
    return d;
  } };
  if (hv('arm') !== undefined) HOOK.look.weapon = { one: 'sword_and_shield', two: 'greatsword' }[hv('arm')] || hv('arm');
  for (const [h, k] of [['bd', 'build'], ['sk', 'skin'], ['hc', 'hair'], ['hy', 'hair_style'], ['tb', 'tabard'], ['pm', 'plume'], ['mon', 'monarch'], ['ms', 'monarch_skin'],
    ['mh', 'monarch_hair'], ['mr', 'monarch_robe']]) if (hv(h) !== undefined) HOOK.look[k] = hv(h);
  const scHook = (H0.match(/[#&]sc=([^&]*)/) || [])[1];
  if (scHook !== undefined) for (const item of scHook.split(',').filter(Boolean)) { const [c, v] = item.split(':'); HOOK.scenes[c] = v === undefined ? '' : v; }
  /* Served, the page starts from its copy of the shared settings, if it has one, until the server
     answers; from disk there is no server to ask. */
  const fromDisk = location.protocol === 'file:';
  const store = KW.settings.create({ hooks: HOOK, storage: () => window.localStorage, pack: () => KW.knight.basePack(), cache: !fromDisk });
  let lookKey = '{}', twelve = false;
  /* Puts what the settings say into the knight, the options and the clock. Returns whether the
     knight's look changed. */
  function settle() {
    const r = store.now(), d = r.values.display, look = KW.settings.knightLook(r), key = JSON.stringify(look);
    if (!fixed.has('h')) S.h = d.helmet_indoors ? 'on' : 'auto';
    if (!fixed.has('hs')) S.hs = { small: 's', medium: 'm', large: 'l' }[d.headline];
    twelve = d.clock === 12;
    if (key === lookKey) return false;
    lookKey = key; KW.knight.look(look);
    return true;
  }
  settle();

  /* ---- The words over the scene ------------------------------------------------------------- */
  const $ = id => document.getElementById(id);
  const cv = $('cv'), surface = $('surface'), hl = $('hl'), sub = $('sub'), more = $('more'), quiet = $('quiet'), cap = $('cap'), ov = $('ov'), clock = $('clock');
  E.init(cv.getContext('2d'));
  let capTimer = 0, lastShow = null; if (freeze) cap.style.transition = 'none';
  KW.ui = {
    /* t: { st, hl, sub, quiet, more: { n, crit } }. With no headline the screen is quiet and shows
       the quiet line instead of the detail. */
    show(t) {
      lastShow = t;
      surface.className = 'st-' + t.st + ' hs-' + S.hs + (t.hl ? '' : ' quiet');
      hl.textContent = t.hl; if (!t.hl) quiet.textContent = t.quiet; else sub.textContent = t.sub;
      more.style.display = t.more.n ? 'inline-block' : 'none'; more.textContent = '+' + t.more.n + ' MORE'; more.className = t.more.crit ? 'crit' : '';
      requestAnimationFrame(fit);
    },
    /* Shows the last state again, after the headline size changed. */
    again() { if (lastShow) KW.ui.show(lastShow); },
    /* What the engine's input takes from the settings, with ownMs the length of each quiet scene
       while nothing sets one (KW.settings.engineInput). */
    extras: ownMs => KW.settings.engineInput(store.now(), KW.knight.basePack(), ownMs),
    quietText(text) { quiet.textContent = text; },
    caption(text, ms) { cap.textContent = text; cap.classList.add('on'); clearTimeout(capTimer); if (!freeze) capTimer = setTimeout(() => cap.classList.remove('on'), ms); }
  };

  /* ---- The clock, and a slow drift of the words against burn-in ------------------------------
     The 24-hour clock reads 21:42 and the 12-hour clock 9:42 with a small PM. */
  let shownTime = '';
  function tick() {
    const d = new Date(), c = KW.settings.clock(d.getHours(), d.getMinutes(), twelve ? 12 : 24);
    if (c.time + c.half !== shownTime) {
      shownTime = c.time + c.half; clock.textContent = c.time;
      if (c.half) { const sm = document.createElement('small'); sm.textContent = c.half; clock.appendChild(sm); }
    }
    if (!freeze) { const t = performance.now(); ov.style.transform = 'translate(' + (Math.sin(t / 97000) * surface.clientWidth * .012).toFixed(1) + 'px,' + (Math.cos(t / 131000) * surface.clientHeight * .012).toFixed(1) + 'px)'; }
  }
  setInterval(tick, 1000); tick();

  /* ---- Sizing: the scene cut to the screen's own shape ---------------------------------------
     From twice the grid's size upwards the canvas is scaled by a whole number of device pixels, which
     is what the tablet gets (three). A smaller window is scaled by a fraction and smoothed, for
     looking at the page on a desk. */
  const capnote = $('capnote');
  function fit() {
    const dpr = window.devicePixelRatio || 1, wpx = surface.clientWidth, hpx = surface.clientHeight; if (!wpx || !hpx) return;
    const dW = Math.round(wpx * dpr), dH = Math.round(hpx * dpr), f = Math.min(dW / V.HW, dH / V.HH), s = f >= 2 ? Math.floor(f) : f;
    V.LW = Math.ceil(dW / s); V.LH = Math.ceil(dH / s); if (cv.width !== V.LW) cv.width = V.LW; if (cv.height !== V.LH) cv.height = V.LH;
    cv.style.width = V.LW * s / dpr + 'px'; cv.style.height = V.LH * s / dpr + 'px'; cv.style.imageRendering = f >= 2 || Math.abs(f - 1) < .01 ? 'pixelated' : 'auto';
    cv.style.left = Math.round((dW - V.LW * s) / 2) / dpr + 'px'; cv.style.top = (dH - V.LH * s) / dpr + 'px';
    V.X0 = Math.floor((V.LW - V.HW) / 2); V.Y0 = V.LH - V.HH; V.HL = -V.X0 - 16; V.HR = V.LW - V.X0 + 16; V.HT = -V.Y0 - 2;
    V.SC = s / dpr; E.invalidate();
    hl.style.fontSize = ''; const row = hl.closest('.hrow'), room = row.clientWidth - clock.offsetWidth - row.clientWidth * .04;
    if (hl.offsetWidth > room) hl.style.fontSize = parseFloat(getComputedStyle(hl).fontSize) * room / hl.offsetWidth + 'px';
    const mc = document.createElement('canvas').getContext('2d'), mm = px => Math.round(px / hpx * 196.5);
    const capOf = el => { mc.font = parseFloat(getComputedStyle(el).fontSize) + 'px VT323'; return mc.measureText('H').actualBoundingBoxAscent; };
    capnote.textContent = 'Full screen on the target tablet (196 mm tall): the headline\'s capitals are about ' + (hl.offsetWidth ? mm(capOf(hl)) : 0) + ' mm tall, the clock\'s digits ' + mm(capOf(clock)) + ' mm and the knight ' + mm(270 * V.SC) + ' mm. One pixel of the knight is ' + (s / dpr * 196.5 / hpx).toFixed(2) + ' mm.';
  }
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  /* ---- Modes ---------------------------------------------------------------------------------
     wait: served over HTTP, before the first answer for the state file. The quiet scene, no words.
     demo: no valid state file yet, opened from disk, or ?demo in the address.
     live: a valid state file has arrived. A fetch that fails, or a file that cannot be read, keeps
           the last valid state until that file is older than three of its intervals. From then,
           and at once for a stale file or an unknown schema, the last scene stays under NO SIGNAL
           until a valid file comes back. A tap on the display toggles full screen, and the page
           keeps the screen awake where the browser allows. */
  /* How long each quiet scene lasts while they take turns in live mode. */
  const LIVE_TURN_MS = 10 * 60 * 1000;
  let mode = 'wait', lastGood = null, lastSeq = null, shown = '', wakeLock = null, asking = false;
  const forceDemo = new URLSearchParams(location.search).has('demo');

  function showOnce(t) { const key = JSON.stringify(t); if (key !== shown) { shown = key; KW.ui.show(t); } }
  function startDemo() { mode = 'demo'; Demo.start(); fit(); Demo.hooks(); }
  /* Shows a valid view's state; its events are played separately. */
  function showLive(v) {
    E.input = Object.assign({ w: v.w || ST.IDLE, is: 'auto', turnMs: LIVE_TURN_MS, things: v.things, tv: v.tv, helmet: S.h }, KW.ui.extras(LIVE_TURN_MS));
    showOnce(v.w ? { st: v.w.st, hl: v.w.hl, sub: v.w.sub, quiet: '', more: v.more } : { st: 'ok', hl: '', sub: '', quiet: v.quietLine, more: { n: 0, crit: false } });
  }
  function onView(v) {
    if (sync) sync.poll();
    const j = ST.judge(v, lastGood, Date.now());
    if (j.kind === 'live') {
      if (mode === 'demo') Demo.stop();
      if (mode !== 'live') { mode = 'live'; E.reset(); document.body.classList.add('nobar'); keepAwake(); }
      lastGood = v; store.defaults(v.defaults); showLive(v);
      const r = ST.takeEvents(v, lastSeq); lastSeq = r.lastSeq;
      for (const e of r.play) {
        if (e.act === 'flies') { const t = performance.now(); for (let i = 0; i < e.count; i++) E.addFly(t + i * 40); }
        else E.fireEvent(e.act, e.text);
      }
    } else if (j.kind === 'demo') {
      if (mode !== 'demo') startDemo();
    } else if (j.kind === 'hold') {
      showLive(lastGood);
    } else {
      const w = ST.noSignal(lastGood.w, j.ageS);
      E.input = Object.assign({}, E.input, { w, is: E.scene() || 'auto' });
      showOnce({ st: w.st, hl: w.hl, sub: w.sub, quiet: '', more: { n: 0, crit: false } });
    }
  }

  /* ---- Live mode on the tablet: full screen on a tap, and the screen kept awake ---------------
     Both fail quietly where the browser refuses, as it does outside a secure context. */
  function keepAwake() {
    if (mode !== 'live' || wakeLock || asking || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    asking = true;
    try {
      navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }, () => {})
        .then(() => { asking = false; });
    } catch (e) { asking = false; }
  }
  function toggleFullScreen() {
    const d = document; if (!d.fullscreenEnabled) return;
    try {
      const p = d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* refused */ }
  }
  // Only a real tap may ask for full screen; a scripted click would be refused by the browser.
  surface.addEventListener('click', e => { if (mode === 'live' && e.isTrusted) { toggleFullScreen(); keepAwake(); } });
  document.addEventListener('visibilitychange', keepAwake);

  /* ---- New versions of the page ---------------------------------------------------------------
     A deployed copy carries its version in a meta tag, and version.json beside it names the one
     deployed now. Served over HTTP, in every mode, the page reads version.json five minutes after
     load and every five minutes after, and reloads at once when the versions differ. A failed or
     malformed fetch does nothing. KW.state.reloadDue() decides, from the mark the last reload left
     in sessionStorage, or in memory where sessionStorage is refused. The repository's own page
     says 'dev' and never checks. */
  const VERSION_CHECK_MS = 5 * 60 * 1000, MARK_KEY = 'kw-reload';
  let markInMemory = null;
  function readMark() {
    try { const s = sessionStorage.getItem(MARK_KEY); return s ? JSON.parse(s) : markInMemory; } catch (e) { return markInMemory; }
  }
  function writeMark(m) {
    markInMemory = m;
    try { sessionStorage.setItem(MARK_KEY, JSON.stringify(m)); } catch (e) { /* refused: the mark in memory stands */ }
  }
  async function checkVersion() {
    let fetched = null;
    const ctl = new AbortController(), cut = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch('version.json', { cache: 'no-store', signal: ctl.signal });
      if (r.ok) fetched = ST.versionOf(await r.json());
    } catch (e) { /* unreachable or unreadable: nothing to do */ }
    clearTimeout(cut);
    const now = Date.now();
    if (ST.reloadDue(ownVersion, fetched, readMark(), now)) { writeMark({ version: fetched, at: now }); location.reload(); }
  }
  if (/^https?:$/.test(location.protocol) && ownVersion !== 'dev') setInterval(checkVersion, VERSION_CHECK_MS);

  /* ---- Go ----------------------------------------------------------------------------------- */
  let lastT = -1e9;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - lastT < 48) return; lastT = now;
    if (freeze) now = KW.hooks.t;
    if (mode === 'demo') Demo.tick(now);
    E.draw(now);
    if (mode === 'demo') Demo.note(E.note);
  }
  E.input = Object.assign({ w: ST.IDLE, is: 'auto', turnMs: LIVE_TURN_MS, things: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], tv: false, helmet: S.h }, KW.ui.extras(LIVE_TURN_MS));
  if (fromDisk || forceDemo) { mode = 'demo'; Demo.start(); }
  else { document.body.classList.add('nobar'); showOnce({ st: 'ok', hl: '', sub: '', quiet: '', more: { n: 0, crit: false } }); }
  fit();
  if (mode === 'demo') Demo.hooks();

  /* ---- The settings screen ---------------------------------------------------------------------
     Opened by a press and hold on the display. Every choice it makes is saved by the store, which
     tells settle() and the screen; the scene behind shows it at once. */
  store.on(() => {
    if (settle()) E.invalidate();
    if (mode === 'demo') Demo.refresh();
    else { Object.assign(E.input, KW.ui.extras(LIVE_TURN_MS), { helmet: S.h }); KW.ui.again(); }
    shownTime = ''; tick(); fit();
  });
  const screen = KW.settings.mount({ store, surface, info: () => ({ version: ownVersion, mode, view: lastGood }), time: () => (freeze ? KW.hooks.t : performance.now()) });

  /* ---- The shared settings ------------------------------------------------------------------------
     Served, the page asks api/settings beside it at start and with every fetch of the state file
     (every five seconds while the demo is forced), and sends each choice made on the screen there
     (KW.settings.connect). The Knightwatcher server keeps them for every display; with any other
     server the page finds none there and keeps the choices in this browser, as from disk. A GET
     revalidates the browser's copy, which the server answers with 304 while nothing has changed. */
  async function settingsRequest(method, body) {
    const ctl = new AbortController(), cut = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch('api/settings', method === 'PUT'
        ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: ctl.signal }
        : { cache: 'no-cache', signal: ctl.signal });
      let json = null;
      if (/^application\/json\b/i.test(r.headers.get('Content-Type') || '')) { try { json = await r.json(); } catch (e) { /* not JSON after all */ } }
      return { status: r.status, json };
    } finally { clearTimeout(cut); }
  }
  const sync = fromDisk ? null : KW.settings.connect({ store, request: settingsRequest, storage: () => window.localStorage, reload: () => location.reload(),
    holding: () => !!(screen && screen.isOpen()), note: text => { if (screen) screen.note(text); } });
  if (sync) { sync.poll(); if (forceDemo) setInterval(sync.poll, 5000); }
  // the cue as it looks seven tenths of the way through a hold, over the knight's head
  if (screen && hv('set') === 'hold') { const b = surface.getBoundingClientRect(); screen.cue(b.left + b.width * .52, b.top + b.height * .42, .7); }
  else if (screen && hv('set')) screen.open(hv('set'));
  requestAnimationFrame(frame);
  // Browsers refuse to fetch from disk, so a page opened from disk does not try.
  if (!fromDisk && !forceDemo) ST.start(onView);
  /* The packs the collector downloaded, in data/packs/, fetched once at load in every mode while
     served. From disk the page shows the packs it ships with. A page whose packs changed paints its
     backdrops again, since a scene may paint the knight's gear into one. */
  if (!fromDisk) {
    KW.knight.fetchPacks((url, init) => fetch(url, init)).then(got => {
      if (!got.files.length && !got.refused.length) return;
      KW.knight.add(got); E.invalidate(); store.check();
    }, () => {});
  }
})(window.KW);
