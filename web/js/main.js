/* Knightwatcher: start-up. Reads the address, chooses whether the knight is drawn from the base pack
   or from code, sizes the canvas to the screen, keeps the clock and the words over the scene, runs
   the frames, chooses between the demo and live data, and reloads the page when a new version of
   it has been deployed.
   docs/page.md describes the modes and the address's test hooks. */
(function (KW) {
  'use strict';
  const V = KW.view, ST = KW.state, E = KW.engine, Demo = KW.demo;
  const H0 = location.hash;

  /* ---- The address: display options and the test hooks ------------------------------------- */
  const S = KW.opts = { on: '', is: 'auto', h: 'auto', hs: 'm', bar: '1', demo: '0' };
  const OPTS = KW.OPTS = { is: { auto: 'Take turns', battlement: 'Battlement', camp: 'Camp', house: 'House', yard: 'Yard' }, h: { auto: 'Off indoors', on: 'On', off: 'Off' }, hs: { s: 'S', m: 'M', l: 'L' } };
  H0.slice(1).split('&').forEach(kv => { const [k, v] = kv.split('='); if (k in S && v != null) S[k] = decodeURIComponent(v); });
  for (const k of Object.keys(OPTS)) if (!(S[k] in OPTS[k])) S[k] = Object.keys(OPTS[k])[0];
  const hv = k => (H0.match(new RegExp('[#&]' + k + '=([\\w.-]+)')) || [])[1];
  /* t=<ms> freezes time for screenshots, t=0 included, kx=<x> places the knight (in units of U),
     and mon= chooses the monarch at court: a, b or c, and a for anything else. frozen says whether
     the address holds a t= with a number, and t is the frozen time, or 0 without one. pl=1
     outlines the scene's places for watched things. th= sets the demo's watched things: kinds
     separated by commas, each followed by - for down or ! for down and alerting; th is the list
     in the contract's shape, or null without the hook. */
  const tHook = hv('t') == null ? NaN : +hv('t');
  const thHook = (H0.match(/[#&]th=([^&]*)/) || [])[1];
  KW.hooks = { hv, frozen: Number.isFinite(tHook), t: Number.isFinite(tHook) ? tHook : 0, kx: hv('kx'), mon: ['a', 'b', 'c'].includes(hv('mon')) ? hv('mon') : 'a',
    pl: hv('pl') === '1', th: thHook == null ? null : ST.listFromHook(thHook) };
  const freeze = KW.hooks.frozen;

  /* The page's own version, from the meta tag tools/deploy.sh stamps. The repository's own page
     says 'dev'. */
  const ownVersion = (document.querySelector('meta[name="kw-version"]') || {}).content || 'dev';

  /* ---- The knight: from the base pack, or from code ------------------------------------------
     Chosen once, here. The packs that ship with the page come in through their carriers. Only a
     'dev' page accepts an unsigned pack; a deployed page refuses one at the signature step and
     draws the knight from code, which draws the same knight. One line in the console says which. */
  const knight = KW.knight.start(KW.packText, ownVersion === 'dev');
  if (knight.source === 'pack') console.info(knight.note); else console.warn(knight.note);

  /* ---- The words over the scene ------------------------------------------------------------- */
  const $ = id => document.getElementById(id);
  const cv = $('cv'), surface = $('surface'), hl = $('hl'), sub = $('sub'), more = $('more'), quiet = $('quiet'), cap = $('cap'), ov = $('ov'), clock = $('clock');
  E.init(cv.getContext('2d'));
  let capTimer = 0; if (freeze) cap.style.transition = 'none';
  KW.ui = {
    /* t: { st, hl, sub, quiet, more: { n, crit } }. With no headline the screen is quiet and shows
       the quiet line instead of the detail. */
    show(t) {
      surface.className = 'st-' + t.st + ' hs-' + S.hs + (t.hl ? '' : ' quiet');
      hl.textContent = t.hl; if (!t.hl) quiet.textContent = t.quiet; else sub.textContent = t.sub;
      more.style.display = t.more.n ? 'inline-block' : 'none'; more.textContent = '+' + t.more.n + ' MORE'; more.className = t.more.crit ? 'crit' : '';
      requestAnimationFrame(fit);
    },
    quietText(text) { quiet.textContent = text; },
    caption(text, ms) { cap.textContent = text; cap.classList.add('on'); clearTimeout(capTimer); if (!freeze) capTimer = setTimeout(() => cap.classList.remove('on'), ms); }
  };

  /* ---- The clock, and a slow drift of the words against burn-in ------------------------------ */
  const two = n => String(n).padStart(2, '0');
  function tick() {
    const d = new Date(); clock.textContent = two(d.getHours()) + ':' + two(d.getMinutes());
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
  const fromDisk = location.protocol === 'file:', forceDemo = new URLSearchParams(location.search).has('demo');

  function showOnce(t) { const key = JSON.stringify(t); if (key !== shown) { shown = key; KW.ui.show(t); } }
  function startDemo() { mode = 'demo'; Demo.start(); fit(); Demo.hooks(); }
  /* Shows a valid view's state; its events are played separately. */
  function showLive(v) {
    E.input = { w: v.w || ST.IDLE, is: 'auto', turnMs: LIVE_TURN_MS, things: v.things, tv: v.tv, helmet: S.h };
    showOnce(v.w ? { st: v.w.st, hl: v.w.hl, sub: v.w.sub, quiet: '', more: v.more } : { st: 'ok', hl: '', sub: '', quiet: v.quietLine, more: { n: 0, crit: false } });
  }
  function onView(v) {
    const j = ST.judge(v, lastGood, Date.now());
    if (j.kind === 'live') {
      if (mode === 'demo') Demo.stop();
      if (mode !== 'live') { mode = 'live'; E.reset(); document.body.classList.add('nobar'); keepAwake(); }
      lastGood = v; showLive(v);
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
  E.input = { w: ST.IDLE, is: 'auto', turnMs: LIVE_TURN_MS, things: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], tv: false, helmet: S.h };
  if (fromDisk || forceDemo) { mode = 'demo'; Demo.start(); }
  else { document.body.classList.add('nobar'); showOnce({ st: 'ok', hl: '', sub: '', quiet: '', more: { n: 0, crit: false } }); }
  fit();
  if (mode === 'demo') Demo.hooks();
  requestAnimationFrame(frame);
  // Browsers refuse to fetch from disk, so a page opened from disk does not try.
  if (!fromDisk && !forceDemo) ST.start(onView);
})(window.KW);
