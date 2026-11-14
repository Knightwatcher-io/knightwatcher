/* Knightwatcher: the settings. Works out what the display shows from four levels, highest first:
   the address's hooks, this display's saved choices, the defaults in the state file (from
   config.toml), and the page's own. Keeps this display's choices in its browser, and draws the
   settings screen, which a press and hold of two seconds anywhere on the display opens.
   Everything above the screen is pure and loads under Node for the tests in tests/web/; the screen
   is built only by mount(), which main.js calls. docs/page.md describes the levels and the screen. */
(function (KW) {
  'use strict';

  /* ---- The choices --------------------------------------------------------------------------------
     The four sections of the contract's defaults (docs/state.md), with the values each key may
     take. A value outside these, at any level, is ignored and the next level down is used. They
     come from the settings schema, collector/settings-schema.json, which the collector checks
     config.toml against; the page carries the part it reads. */
  // settings-schema:start
  /* Written by tools/settings-schema.js from collector/settings-schema.json: change the schema and
     run the tool, never these lines. */
  const SCHEMA = {
    look: {
      build: { values: ['a', 'b', 'c'], page: null },
      weapon: { values: ['greatsword', 'sword_and_shield'], page: 'greatsword' },
      skin: { values: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], page: 'warm' },
      hair: { values: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'], page: 'brown' },
      hair_style: { values: ['short', 'tied', 'curls'], page: 'short' },
      tabard: { values: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], page: 'blue' },
      plume: { values: ['red', 'white', 'gold', 'royal', 'green', 'violet'], page: 'red' },
      monarch: { values: ['a', 'b', 'c'], page: 'a' },
      monarch_skin: { values: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], page: 'warm' },
      monarch_hair: { values: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'], page: null },
      monarch_robe: { values: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], page: null }
    },
    display: {
      headline: { values: ['small', 'medium', 'large'], page: 'medium' },
      clock: { values: [24, 12], page: 24 },
      helmet_indoors: { values: [true, false], page: false }
    },
    quiet: {
      scenes: { values: ['battlement', 'camp', 'house', 'yard'], page: ['battlement', 'camp', 'house', 'yard'] },
      minutes: { min: 1, max: 240, page: 10 }
    },
    scenes: ['battlement', 'camp', 'house', 'yard', 'cellar', 'smithy', 'court']
  };
  // settings-schema:end
  const KEY = 'knightwatcher.settings', VERSION = 1;
  const pick = (sec, field) => { const o = {}; for (const k of Object.keys(SCHEMA[sec])) o[k] = SCHEMA[sec][k][field]; return o; };
  /* The quiet scenes, and every scene the page draws in the order the settings screen lists them:
     the files of web/js/scenes/. The collector's QUIET_SCENES and PAGE_SCENES follow the same
     schema. */
  const SCENES = SCHEMA.quiet.scenes.values;
  const ALL_SCENES = SCHEMA.scenes;
  const ONE_OF = { look: pick('look', 'values'), display: pick('display', 'values') };
  /* The scenes section's keys are condition ids, and which of them take part depends on what the
     scenes can act (see offered); KEYS.scenes is filled per store from the world it is given. */
  const KEYS = { look: Object.keys(ONE_OF.look), display: Object.keys(ONE_OF.display), quiet: Object.keys(SCHEMA.quiet), scenes: [] };
  const SECTIONS = Object.keys(KEYS);
  const MINUTES = { least: SCHEMA.quiet.minutes.min, most: SCHEMA.quiet.minutes.max };
  /* The levels above the page's own, highest first, and how the console names each. */
  const LEVELS = ['hook', 'saved', 'defaults'];
  const WHERE = { hook: 'the address', saved: 'this display\'s saved choices', defaults: 'the defaults in state.json' };

  /* The page's own defaults, below every other level, from the schema: the base pack's defaults for
     the knight (read from the pack in use, see builtIn; the schema's are used without one), the
     first monarch with the court's own skin and each monarch's own hair and robe (null: as drawn),
     a medium headline, a 24-hour clock, the helmet off indoors, all four quiet scenes for ten
     minutes each, and each condition in its own scene (filled from the world, see builtIn). The
     demo keeps its own minute while no level above this one sets the length. */
  const BUILT_IN = { look: pick('look', 'page'), display: pick('display', 'page'), quiet: pick('quiet', 'page'), scenes: {} };

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const show = v => (typeof v === 'string' ? '"' + v.slice(0, 40) + '"' : Array.isArray(v) ? 'a list' : isObj(v) ? 'an object' : String(v));

  /* The builds a base pack makes ready, as the contract's letters: build.a is 'a'. */
  function buildsOf(pack) {
    if (!isObj(pack) || !isObj(pack.builds)) return [];
    return Object.keys(pack.builds).map(b => /^build\.([abc])$/.exec(b)).filter(Boolean).map(m => m[1]).sort();
  }
  /* A build's name as the base pack gives it (build.a is "Classic"), or "Build A" from the letter
     where the pack has no such build. */
  const buildName = (pack, id) => (isObj(pack) && isObj(pack.builds) && isObj(pack.builds['build.' + id]) ? pack.builds['build.' + id].name : 'Build ' + id.toUpperCase());
  /* The settings screen's build row, one choice for each of the contract's builds: its name from the
     base pack on the chip with Ready under it, or, for a build the pack does not draw, greyed and
     saying Coming, its note naming the build the knight stays as (cur, the build shown). */
  function buildChoices(pack, cur) {
    const ready = buildsOf(pack), name = id => buildName(pack, id);
    return ONE_OF.look.build.map(id => (ready.includes(id)
      ? { id, chip: name(id).toUpperCase(), name: 'Ready', kind: 'wide' }
      : { id, chip: name(id).toUpperCase(), name: 'Coming', kind: 'wide', off: true, offNote: name(id) + ' is not drawn yet.' + (cur ? ' The knight stays as ' + name(cur) + '.' : '') }));
  }

  /* The world the scenes section is checked against: { can, homes }, can each scene's list of the
     conditions it can act (its can field, web/js/scenes/), homes each condition's own scene, or
     null for one that plays in the quiet scene of the moment (KW.state.CONDITIONS). In the page
     both come from what the scripts loaded; under Node a test gives its own. */
  function worldOf(w) {
    const out = { can: {}, homes: {} };
    if (!isObj(w)) return out;
    if (isObj(w.can)) for (const k of ALL_SCENES) if (Array.isArray(w.can[k])) out.can[k] = w.can[k].filter(c => typeof c === 'string');
    if (isObj(w.homes)) for (const c of Object.keys(w.homes)) out.homes[c] = typeof w.homes[c] === 'string' ? w.homes[c] : null;
    return out;
  }
  /* The conditions whose scene may be chosen, in the order of homes (the conditions' priority),
     each with the scenes that can act it, in the order of ALL_SCENES. A condition takes part when
     it has a scene of its own and more than one scene can act it; night never does, since only the
     house has the bed and the knight sleeps where the bed is. */
  function offered(w) {
    const W = worldOf(w), out = {};
    for (const c of Object.keys(W.homes)) {
      if (c === 'night' || !W.homes[c]) continue;
      const list = ALL_SCENES.filter(k => W.can[k] && W.can[k].includes(c));
      if (list.length > 1 && list.includes(W.homes[c])) out[c] = list;
    }
    return out;
  }

  /* The page's own look, from the base pack's defaults where there is one: its default build,
     weapon, hair style and swatches, each as the contract names it; and each condition that takes
     part in its own scene. */
  function builtIn(pack, world) {
    const out = JSON.parse(JSON.stringify(BUILT_IN)), d = isObj(pack) && isObj(pack.defaults) ? pack.defaults : null;
    const W = worldOf(world);
    for (const c of Object.keys(offered(W))) out.scenes[c] = W.homes[c];
    if (!d) return out;
    const L = out.look, items = isObj(d.items) ? d.items : {}, sw = isObj(d.swatches) ? d.swatches : {};
    const b = /^build\.([abc])$/.exec(d.build || '');
    L.build = b ? b[1] : null;
    if (items.main === 'main.arming') L.weapon = 'sword_and_shield';
    const hs = /^hair\.(\w+)$/.exec(items.hair || '');
    if (hs && ONE_OF.look.hair_style.includes(hs[1])) L.hair_style = hs[1];
    for (const k of ['skin', 'hair', 'tabard', 'plume']) if (ONE_OF.look[k].includes(sw[k])) L[k] = sw[k];
    return out;
  }

  /* One section of one level, with only the keys and values the page knows. say(line) is told of
     each thing left out. ready is the list of builds the packs make ready: a build outside it is
     left out as well. world is what the scenes section is checked against (see worldOf): a scene
     that cannot act the condition it is given is left out too. */
  function clean(section, raw, where, ready, say, world) {
    const out = {};
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) { say('knightwatcher: settings: ' + section + ' in ' + WHERE[where] + ' is not an object, so it is ignored'); return out; }
    const no = (k, v, why) => say('knightwatcher: settings: ' + section + '.' + k + ' ' + show(v) + ' in ' + WHERE[where] + ' is ignored: ' + why);
    if (section === 'scenes') {
      const W = worldOf(world), offer = offered(W);
      for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (!has(W.homes, k)) no(k, v, 'not a condition the page knows');
        else if (!has(offer, k)) no(k, v, 'the page offers no choice of scene for it');
        else if (!ALL_SCENES.includes(v)) no(k, v, 'not a scene the page knows');
        else if (!offer[k].includes(v)) no(k, v, 'that scene cannot act it');
        else out[k] = v;
      }
      return out;
    }
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (!KEYS[section].includes(k)) { no(k, v, 'not a setting the page knows'); continue; }
      if (section === 'quiet' && k === 'scenes') {
        if (!Array.isArray(v)) { no(k, v, 'not a list of scenes'); continue; }
        for (const x of v) if (!SCENES.includes(x)) no(k, x, 'not a quiet scene');
        // in the order given, the first of any repeat kept
        const list = v.filter((x, i) => SCENES.includes(x) && v.indexOf(x) === i);
        if (!list.length) { no(k, v, 'it names no quiet scene'); continue; }
        out.scenes = list;
      } else if (section === 'quiet') {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < MINUTES.least || v > MINUTES.most) { no(k, v, 'not a number of minutes from 1 to 240'); continue; }
        out.minutes = v;
      } else if (!ONE_OF[section][k].includes(v)) no(k, v, 'not a value the page knows');
      else if (section === 'look' && k === 'build' && !(ready || []).includes(v)) no(k, v, 'no pack draws that build');
      else out[k] = v;
    }
    return out;
  }

  /* What the display shows: { values, from }, each with the four sections. values holds every key;
     from says which level each came from, 'hook', 'saved', 'defaults' or 'built-in'. levels holds
     the cleaned sections of each level, { hook, saved, defaults }, and base the page's own. */
  function resolve(levels, base) {
    const values = {}, from = {};
    for (const sec of SECTIONS) {
      values[sec] = {}; from[sec] = {};
      // the scenes section has a key for each condition that takes part, which the page's own holds
      for (const k of sec === 'scenes' ? Object.keys(base.scenes || {}) : KEYS[sec]) {
        const lv = LEVELS.find(l => levels[l] && isObj(levels[l][sec]) && has(levels[l][sec], k));
        values[sec][k] = lv ? levels[lv][sec][k] : base[sec][k];
        from[sec][k] = lv || 'built-in';
      }
    }
    return { values, from };
  }

  /* The look for KW.knight.look(), in the shape the pack library resolves: only what a level above
     the page's own sets, so that with nothing set the knight is the base pack's defaults exactly
     as before there were settings. */
  function knightLook(r) {
    const v = r.values.look, set = k => r.from.look[k] !== 'built-in', B = 'kw.base/', look = {};
    if (set('build') && v.build) look.build = B + 'build.' + v.build;
    if (set('weapon')) look.items = v.weapon === 'sword_and_shield' ? { main: B + 'main.arming', off: B + 'off.heater' } : { main: B + 'main.greatsword' };
    for (const k of ['skin', 'hair', 'tabard', 'plume']) if (set(k)) (look.swatches = look.swatches || {})[k] = B + v[k];
    if (set('hair_style')) (look.items = look.items || {}).hair = B + 'hair.' + v.hair_style;
    return look;
  }

  /* What the engine takes from the settings (docs/page.md): the quiet scenes in turn and how long
     each lasts, ownMs while no level above the page's own sets the length (the demo's minute, or
     live mode's ten), the monarch; the monarch's skin, hair and robe from the base pack's skin,
     hair and tabard swatches, each null for the court's own while nothing sets it or there is no
     base pack; and the scene chosen for each condition, holding only what a level above the
     page's own sets. */
  function engineInput(r, pack, ownMs) {
    const q = r.values.quiet, L = r.values.look;
    const swatch = (set, id) => { const sw = isObj(pack) && isObj(pack.swatches) && isObj(pack.swatches[set]) ? pack.swatches[set][id] : null; return isObj(sw) && isObj(sw.entries) ? sw.entries : null; };
    const set = k => r.from.look[k] !== 'built-in' && L[k] !== null;
    const sk = set('monarch_skin') ? swatch('skin', L.monarch_skin) : null, hr = set('monarch_hair') ? swatch('hair', L.monarch_hair) : null, rb = set('monarch_robe') ? swatch('tabard', L.monarch_robe) : null;
    const monSkin = sk ? { id: L.monarch_skin, face: sk.face, cheek: sk.cheek } : null;
    const monHair = hr ? { id: L.monarch_hair, bands: [hr['0'], hr['1'], hr['2']], brow: hr.brow } : null;
    const monRobe = rb ? { id: L.monarch_robe, bands: [rb['0'], rb['1'], rb['2'], rb['3']] } : null;
    const scenes = {};
    for (const c of Object.keys(r.values.scenes || {})) if (r.from.scenes[c] !== 'built-in') scenes[c] = r.values.scenes[c];
    return { turns: q.scenes.slice(), turnMs: r.from.quiet.minutes === 'built-in' ? ownMs : q.minutes * 60000, mon: L.monarch, monSkin, monHair, monRobe, scenes };
  }

  /* The clock's words for a time: { time, half }. On the 24-hour clock '09:42' and no half; on the
     12-hour clock '9:42' and 'AM' or 'PM', midnight's hour being 12 AM and noon's 12 PM. */
  function clock(h, m, hours) {
    const two = n => String(n).padStart(2, '0');
    if (hours !== 12) return { time: two(h) + ':' + two(m), half: '' };
    return { time: (h % 12 || 12) + ':' + two(m), half: h < 12 ? 'AM' : 'PM' };
  }

  /* ---- This display's saved choices ------------------------------------------------------------
     One key in the browser's storage, KEY, holding { "v": 1, "look": {...}, "display": {...},
     "quiet": {...}, "scenes": {...} } with the contract's names and values; a text saved before
     there was a scenes section reads as it did. Every read and write is wrapped, since
     a browser may refuse storage outright; the choices then last until the page is reloaded. */
  function load(storage, say) {
    let text = null;
    try { text = storage().getItem(KEY); } catch (e) { say('knightwatcher: settings: this browser keeps no saved choices, so choices last until the page is reloaded'); return {}; }
    if (text === null || text === undefined) return {};
    let j = null;
    try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!isObj(j) || j.v !== VERSION) { say('knightwatcher: settings: the saved choices are not in a form this page reads, so they are ignored'); return {}; }
    const out = {};
    for (const sec of SECTIONS) if (has(j, sec)) out[sec] = j[sec];
    return out;
  }
  function save(storage, saved, say) {
    const j = { v: VERSION };
    for (const sec of SECTIONS) j[sec] = isObj(saved[sec]) ? saved[sec] : {};
    try { storage().setItem(KEY, JSON.stringify(j)); return true; } catch (e) {
      say('knightwatcher: settings: this browser refused to save the choices, so they last until the page is reloaded');
      return false;
    }
  }

  /* ---- The store -----------------------------------------------------------------------------------
     create(o) holds the levels and answers what the display shows. o: hooks, the address's hooks in
     the contract's shape ({ look, display, quiet }); storage, a function returning the browser's
     storage (it may throw); pack, a function returning the base pack in use or null; world, a
     function returning what the scenes can act ({ can, homes }, see worldOf), which in the page
     defaults to what the loaded scenes and KW.state declare; say, where the console lines go (each
     said once). The store tells each listener on() added whenever what the display shows changes. */
  function create(o) {
    o = isObj(o) ? o : {};
    const said = new Set(), sayTo = typeof o.say === 'function' ? o.say : line => { if (typeof console !== 'undefined') console.warn(line); };
    const say = line => { if (!said.has(line)) { said.add(line); sayTo(line); } };
    const storage = typeof o.storage === 'function' ? o.storage : () => null;
    const pack = typeof o.pack === 'function' ? o.pack : () => null;
    const hooks = isObj(o.hooks) ? o.hooks : {};
    const world = typeof o.world === 'function' ? o.world : pageWorld;
    let saved = load(storage, say), defaults = null, last = '';
    const listeners = [];
    const levelOf = (raw, where, ready) => {
      const out = {}, w = world();
      for (const sec of SECTIONS) out[sec] = clean(sec, isObj(raw) ? raw[sec] : undefined, where, ready, say, w);
      return out;
    };
    const cleanSaved = (sec, raw, quiet) => clean(sec, raw, 'saved', buildsOf(pack()), quiet ? () => {} : say, world());
    function now() {
      const p = pack(), ready = buildsOf(p);
      return resolve({ hook: levelOf(hooks, 'hook', ready), saved: levelOf(saved, 'saved', ready), defaults: levelOf(defaults, 'defaults', ready) }, builtIn(p, world()));
    }
    /* What the display would show with no hooks and no saved choices: the defaults over the page's
       own. */
    function fallback() {
      const p = pack();
      return resolve({ defaults: levelOf(defaults, 'defaults', buildsOf(p)) }, builtIn(p, world()));
    }
    function changed() {
      const key = JSON.stringify(now());
      if (key === last) return;
      last = key;
      for (const fn of listeners) fn();
    }
    last = JSON.stringify(now());
    return {
      now, fallback,
      /* Saves value for section.key on this display. A value the page does not know is refused
         and false returned. */
      choose(section, k, value) {
        if (!has(KEYS, section)) return false;
        const one = cleanSaved(section, { [k]: value });
        if (!has(one, k)) return false;
        saved = Object.assign({}, saved, { [section]: Object.assign(cleanSaved(section, saved[section], true), one) });
        save(storage, saved, say); changed();
        return true;
      },
      /* Clears this display's choice for one key, which then falls back to the defaults: the
         monarch's hair and robe "As drawn". */
      clear(section, k) {
        if (!has(KEYS, section) || !isObj(saved[section]) || !has(saved[section], k)) return;
        const rest = Object.assign({}, saved[section]); delete rest[k];
        saved = Object.assign({}, saved, { [section]: rest });
        save(storage, saved, say); changed();
      },
      /* Clears this display's choices for a section, which then falls back to the defaults. */
      reset(section) {
        if (!has(KEYS, section) || !has(saved, section)) return;
        saved = Object.assign({}, saved); delete saved[section];
        save(storage, saved, say); changed();
      },
      /* Whether this display has choices of its own in a section. */
      own: section => isObj(saved[section]) && Object.keys(cleanSaved(section, saved[section], true)).length > 0,
      /* The conditions whose scene may be chosen, each with the scenes that can act it. */
      offered: () => offered(world()),
      /* The defaults section of the latest valid state file, raw, or null. */
      defaults(raw) {
        const next = isObj(raw) ? raw : null;
        if (JSON.stringify(next) === JSON.stringify(defaults)) return;
        defaults = next; changed();
      },
      /* Tells the store that what it reads may have changed (the packs in use). */
      check: changed,
      on(fn) { if (typeof fn === 'function') listeners.push(fn); }
    };
  }

  /* The page's own world: each loaded scene's can and each condition's own scene, from
     KW.state.CONDITIONS. Empty under Node, where KW holds neither. */
  function pageWorld() {
    const can = {}, homes = {}, sc = isObj(KW.scenes) ? KW.scenes : {}, cond = isObj(KW.state) && isObj(KW.state.CONDITIONS) ? KW.state.CONDITIONS : {};
    for (const k of Object.keys(sc)) if (isObj(sc[k]) && Array.isArray(sc[k].can)) can[k] = sc[k].can;
    for (const c of Object.keys(cond)) homes[c] = cond[c].scene;
    return { can, homes };
  }

  const api = { SCHEMA, KEY, VERSION, SCENES, ALL_SCENES, ONE_OF, KEYS, BUILT_IN, MINUTES, buildsOf, buildName, buildChoices, builtIn, worldOf, offered, clean, resolve, knightLook, engineInput, clock, load, save, create, pageWorld };
  KW.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ---- The screen ----------------------------------------------------------------------------------
     Built over the display by mount(o), from the markup in index.html (#kws and #kws-cue). o: store,
     the store above; surface, the display, where a press and hold opens the screen; info(), what the
     status page reads: { version, mode, view }, view being the last valid state file as KW.state.map
     gives it, or null; time(), the time the knight's preview is drawn at. Nothing here is drawn
     until the screen opens, so a page whose screen stays closed looks as it did before. */

  /* The hold, the tap and the idle close. A press lifted before TAP_MS is a tap. After CUE_AFTER_MS
     the cue shows over the press, and at HOLD_MS the screen opens. Moving more than MOVE_PX
     cancels. The screen closes after IDLE_S seconds without a touch, counting down the last WARN_S. */
  const HOLD_MS = 2000, CUE_AFTER_MS = 250, TAP_MS = 500, MOVE_PX = 24, IDLE_S = 60, WARN_S = 10, BLOCKS = 10;
  const MINUTE_CHOICES = [5, 10, 15, 30, 60];
  const SCENE_NAMES = { battlement: 'Battlement', camp: 'Camp', house: 'House', yard: 'Training yard', cellar: 'Cellar', smithy: 'Smithy', court: 'Court' };
  /* Each condition by a plain name, after the headline the page shows for it. */
  const CONDITION_NAMES = { attack: 'Under attack', wan_down: 'WAN down', container_unhealthy: 'Unwell', disk_full: 'Disk full', backup_overdue: 'Backup overdue',
    pi_silent: 'Pi silent', cpu_hot: 'Running hot', ssh_session: 'At court', updating: 'Updating', streaming: 'Now showing', night: 'Night watch' };
  const WEAPONS = [['greatsword', 'Greatsword', 'Two hands'], ['sword_and_shield', 'Sword and shield', 'One hand each']];
  const SETS = { skin: 'skin', hair: 'hair', tabard: 'tabard', plume: 'plume', monarch_skin: 'skin', monarch_hair: 'hair', monarch_robe: 'tabard' };
  const HEADLINES = [['small', 'Small', 20], ['medium', 'Medium', 27], ['large', 'Large', 36]];
  const OWN_SCOPE = 'Kept on this display only. Other displays keep their own.';

  function mount(o) {
    const store = o.store, K = KW.knight, D = KW.draw, V = KW.view, P = KW.props, U = V.U;
    const $ = id => document.getElementById(id);
    const kws = $('kws'), main = $('kws-main'), foot = $('kws-foot'), scope = $('kws-scope'), cue = $('kws-cue');
    if (!kws || !main || !cue || !o.surface) return null;
    const cueBar = cue.querySelector('.kws-cue-bar');
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
    for (let i = 0; i < BLOCKS; i++) cueBar.appendChild(el('i'));
    const st = { open: false, page: 'knight', lastTouch: 0, notes: {} };

    /* ---- Drawing into canvases of the screen's own
       The primitives draw into whatever KW.draw.setCtx() last set, and the engine sets its own at
       the start of every frame; each drawing here puts back what it found. A scene is drawn on the
       bare 960 by 600 grid, so the view's edges are set to the grid's while it draws. */
    function onGrid(ctx, fn) {
      const was = D.getCtx(), edges = { HL: V.HL, HR: V.HR, HT: V.HT };
      V.HL = 0; V.HR = V.HW; V.HT = 0; D.setCtx(ctx);
      try { fn(); } finally { D.setCtx(was); Object.assign(V, edges); }
    }
    const sceneState = (sc, o2, mon, monSkin, monHair, monRobe) => ({ w: KW.state.IDLE, things: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], places: sc.places || null, tv: false,
      kx: sc.spot * U, o: o2, here: null, inBed: false, helmOff: o2.helmet === false, strike: false, mon, monSkin, monHair: monHair || null, monRobe: monRobe || null });
    /* Pictures that do not move, kept until the look or the helmet changes: the quiet scenes with the
       knight at its arrival spot, and the monarchs cropped from the court's own drawing. */
    const pics = new Map();
    let picKey = '';
    function picture(key, paint) {
      if (!pics.has(key)) { const cv = document.createElement('canvas'); cv.width = V.HW; cv.height = V.HH; onGrid(cv.getContext('2d'), () => paint(cv)); pics.set(key, cv); }
      return pics.get(key);
    }
    function scenePicture(name, helmetIndoors) {
      return picture('scene|' + name, () => {
        const sc = KW.scenes[name], o2 = K.pose('idle', 2300);
        o2.x = sc.spot * U; o2.floor = V.HFL; o2.helmet = helmetIndoors ? true : sc.helmet !== false; if (sc.sword === false) o2.sword = false;
        const s = sceneState(sc, o2, 'a', null);
        if (sc.paint) sc.paint(s); sc.draw(2300, s); K.draw(o2);
      });
    }
    const CROP = { x: 700, y: 160, w: 240, h: 372 };
    function monarchPicture(mon, e) {
      const key = 'court|' + mon + '|' + [e.monSkin, e.monHair, e.monRobe].map(x => (x ? x.id : '')).join('|');
      if (pics.has(key)) return pics.get(key);
      const big = document.createElement('canvas'); big.width = V.HW; big.height = V.HH;
      const sc = KW.scenes.court, o2 = K.pose('ssh_session', 100);
      o2.x = sc.spot * U; o2.floor = V.HFL;
      onGrid(big.getContext('2d'), () => { const s = sceneState(sc, o2, mon, e.monSkin, e.monHair, e.monRobe); sc.paint(s); sc.draw(100, s); });
      const out = document.createElement('canvas'); out.width = CROP.w; out.height = CROP.h;
      out.getContext('2d').drawImage(big, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
      pics.set(key, out);
      return out;
    }
    /* Draws src into the canvas dst at its size on screen, by whole steps where it is twice as big
       or more, the bottom edges together. */
    function blit(dst, src, smooth) {
      const dpr = window.devicePixelRatio || 1, w = Math.round(dst.clientWidth * dpr), h = Math.round(dst.clientHeight * dpr);
      if (!w || !h) return;
      if (dst.width !== w) dst.width = w; if (dst.height !== h) dst.height = h;
      const c = dst.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
      c.imageSmoothingEnabled = !!smooth; c.imageSmoothingQuality = 'high';
      const f = Math.min(w / src.width, h / src.height), s = f >= 2 ? Math.floor(f) : f, dw = src.width * s, dh = src.height * s;
      c.drawImage(src, Math.round((w - dw) / 2), Math.round(h - dh), Math.round(dw), Math.round(dh));
    }
    /* The knight's preview: helmet on and helmet off side by side on a plain wall, drawn by the
       knight's own code every frame while the page is open, so the blink and the bob show. */
    const PV = { w: 500, h: 380, floor: 345, at: [[118, true], [362, false]] };
    const WALL = ['#1a1622', '#1d1826', '#17131e', '#201a29'];
    function drawKnights(cv, t) {
      const dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return;
      if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
      const c = cv.getContext('2d'), f = Math.min(w / PV.w, h / PV.h), s = f >= 2 ? Math.floor(f) : f;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0e0b13'; c.fillRect(0, 0, w, h);
      c.setTransform(s, 0, 0, s, Math.round((w - PV.w * s) / 2), Math.round(h - PV.h * s));
      const was = D.getCtx(); D.setCtx(c);
      try {
        P.bricksHD(-400, -400, PV.w + 800, PV.floor + 400, 70, 26, WALL, '#0e0b13', 11);
        D.Rh(-400, PV.floor, PV.w + 800, 200, '#2b2333'); D.Rh(-400, PV.floor, PV.w + 800, 2, '#5d5670');
        for (const [x, helm] of PV.at) { const o2 = K.pose('idle', t + (helm ? 0 : 1700)); o2.x = x; o2.floor = PV.floor; o2.helmet = helm; K.draw(o2); }
      } finally { D.setCtx(was); }
    }

    /* ---- The rows ----------------------------------------------------------------------------------
       A row of choices. Each choice: { id, name, fill, chip (text), html, node (an element for the
       chip), kind ('text', 'wide', 'pic'), label, off (greyed, with offNote said when tapped). */
    function row(key, label, choices, cur, pick, hookNote) {
      const r = el('div', 'kws-row'), opts = el('div', 'kws-opts'), note = el('div', 'kws-note', st.notes[key] || hookNote || '');
      r.appendChild(el('div', 'kws-label', label));
      for (const c of choices) {
        const on = c.id === cur, b = el('button', 'kws-opt' + (c.kind ? ' ' + c.kind : '') + (on ? ' on' : '') + (c.off ? ' off' : ''));
        b.type = 'button'; b.dataset.focus = key + '=' + c.id;
        b.setAttribute('aria-pressed', String(on));
        if (c.off) b.setAttribute('aria-disabled', 'true');
        const chip = el('span', 'chip');
        if (c.fill) chip.style.background = c.fill;
        if (c.chip) chip.textContent = c.chip;
        if (c.html) chip.appendChild(c.html);
        if (c.node) chip.appendChild(c.node);
        b.appendChild(chip);
        if (c.name) b.appendChild(el('span', 'name', c.name));
        if (c.sub) b.appendChild(el('span', 'sub', c.sub));
        b.setAttribute('aria-label', label + ': ' + (c.label || c.chip || c.name) + (c.chip && c.name ? ', ' + c.name : '') + (c.sub ? ', ' + c.sub : '') + (c.off ? ', not drawn yet' : ''));
        b.addEventListener('click', () => {
          if (c.off) { st.notes[key] = c.offNote; note.textContent = c.offNote; return; }
          st.notes[key] = ''; pick(c.id);
        });
        opts.appendChild(b);
      }
      r.appendChild(opts); r.appendChild(note);
      return r;
    }
    function toggle(label, on, flip, focus) {
      const b = el('button', 'kws-switch'); b.type = 'button'; b.dataset.focus = focus;
      b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-label', label);
      const tr = el('span', 'track'); tr.appendChild(el('span', 'knob')); b.appendChild(tr); b.appendChild(el('span', 'word', on ? 'ON' : 'OFF'));
      b.addEventListener('click', flip);
      return b;
    }
    /* The reset at the end of an editable page, with the line saying what it does. */
    function reset(section, what, words, fromConfig, hooked) {
      const r = el('div', 'kws-reset'), b = el('button', 'kws-btn', 'USE THE CONFIG DEFAULT'), p = el('p');
      b.type = 'button'; b.dataset.focus = 'reset|' + section;
      const own = store.own(section), lead = el('b', '', own ? 'This display has its own ' + what + '.' : 'Showing the default.');
      p.appendChild(lead);
      p.appendChild(document.createTextNode(' The default' + (fromConfig ? ', from config.toml,' : '') + ' is ' + words + '.' + (own ? ' The button clears this display\'s choices here.' : '')));
      if (hooked) p.appendChild(document.createTextNode(' The page\'s address sets some of these, and the address wins until the page is opened without it.'));
      b.addEventListener('click', () => { st.notes = {}; store.reset(section); });
      r.appendChild(b); r.appendChild(p);
      return r;
    }
    const HOOK_NOTE = 'The page\'s address sets this for now.';
    const hookNote = (r, sec, k) => (r.from[sec][k] === 'hook' ? HOOK_NOTE : '');
    /* A swatch's chip: its bands left to right, as the pack lays them across a shape. */
    function bandsCss(entries) {
      let list = entries.face;
      if (!list) { const ks = Object.keys(entries).filter(k => /^\d$/.test(k)); list = ks.map((k, i) => [(i + 1) / ks.length, entries[k]]); }
      let p = 0;
      return 'linear-gradient(90deg,' + list.map(([f, c]) => { const s = c + ' ' + (p * 100).toFixed(1) + '% ' + (f * 100).toFixed(1) + '%'; p = f; return s; }).join(',') + ')';
    }
    const swatches = (pack, k) => ONE_OF.look[k].filter(id => pack.swatches[SETS[k]] && pack.swatches[SETS[k]][id])
      .map(id => ({ id, name: pack.swatches[SETS[k]][id].name, fill: bandsCss(pack.swatches[SETS[k]][id].entries) }));
    const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
    /* The look in words, from the base pack's names. */
    function lookWords(v, pack) {
      const sw = (set, id) => (pack && pack.swatches[set] && pack.swatches[set][id] ? lower(pack.swatches[set][id].name) : id);
      const style = pack && pack.items['hair.' + v.hair_style] ? lower(pack.items['hair.' + v.hair_style].name) : v.hair_style;
      const mh = v.monarch_hair ? sw('hair', v.monarch_hair) + ' hair' : '', mr = v.monarch_robe ? 'a ' + sw('tabard', v.monarch_robe) + ' robe' : '';
      const dress = mh && mr ? mh + ', ' + mr : mh ? mh + ', the robe as drawn' : mr ? 'the hair as drawn, ' + mr : 'hair and robe as drawn';
      return (v.build ? 'the ' + buildName(pack, v.build) + ' build, ' : '') + 'the ' + (v.weapon === 'sword_and_shield' ? 'sword and shield' : 'greatsword') + ', ' + sw('skin', v.skin) + ' skin, ' +
        sw('hair', v.hair) + ' hair (' + style + '), a ' + sw('tabard', v.tabard) + ' tabard, a ' + sw('plume', v.plume) + ' plume; monarch ' + v.monarch.toUpperCase() + ', ' + sw('skin', v.monarch_skin) + ' skin, ' + dress;
    }
    /* What a section falls back to when this display's choices are cleared, the defaults in the
       state file over the page's own, and whether any of it comes from config.toml. */
    function defaultsOf(section) {
      const f = store.fallback();
      return { values: f.values[section], fromConfig: KEYS[section].some(k => f.from[section][k] === 'defaults') };
    }
    const hooked = (r, sec) => Object.keys(r.from[sec]).some(k => r.from[sec][k] === 'hook');

    /* ---- The pages ---------------------------------------------------------------------------------- */
    const choose = (sec, k) => v => store.choose(sec, k, v);
    const PAGES = {
      knight: { label: 'The knight', scope: OWN_SCOPE, build(list, prev, r) {
        const pack = K.basePack(), v = r.values.look;
        if (!pack) list.appendChild(el('p', 'kws-line', 'The knight is drawn from code, which has only the default look: the base pack could not be used (see Status). Choices made here are kept and show once it can.'));
        else {
          list.appendChild(row('build', 'Build', buildChoices(pack, v.build), v.build, choose('look', 'build'), hookNote(r, 'look', 'build')));
          list.appendChild(row('weapon', 'Weapon', WEAPONS.map(([id, chip, nm]) => ({ id, chip, name: nm, kind: 'text' })), v.weapon, choose('look', 'weapon'), hookNote(r, 'look', 'weapon')));
          list.appendChild(row('skin', 'Skin tone', swatches(pack, 'skin'), v.skin, choose('look', 'skin'), hookNote(r, 'look', 'skin')));
          list.appendChild(row('hair', 'Hair colour', swatches(pack, 'hair'), v.hair, choose('look', 'hair'), hookNote(r, 'look', 'hair')));
          list.appendChild(row('hair_style', 'Hair style', ONE_OF.look.hair_style.filter(id => pack.items['hair.' + id]).map(id => ({ id, chip: pack.items['hair.' + id].name, kind: 'text' })),
            v.hair_style, choose('look', 'hair_style'), hookNote(r, 'look', 'hair_style')));
          list.appendChild(row('tabard', 'Tabard', swatches(pack, 'tabard'), v.tabard, choose('look', 'tabard'), hookNote(r, 'look', 'tabard')));
          list.appendChild(row('plume', 'Plume', swatches(pack, 'plume'), v.plume, choose('look', 'plume'), hookNote(r, 'look', 'plume')));
        }
        const d = defaultsOf('look');
        list.appendChild(reset('look', 'look', lookWords(d.values, pack), d.fromConfig, hooked(r, 'look')));
        prev.appendChild(el('h2', '', 'As the knight will look'));
        const cv = el('canvas'); cv.id = 'kws-knights'; prev.appendChild(cv);
        const caps = el('div', 'caps'); caps.appendChild(el('span', '', 'Helmet on')); caps.appendChild(el('span', '', 'Helmet off')); prev.appendChild(caps);
        prev.appendChild(el('h2', 'home', 'At home, gear at rest'));
        const home = el('canvas', 'scene'); home.dataset.scene = 'house'; prev.appendChild(home);
      } },
      monarch: { label: 'The monarch', scope: OWN_SCOPE, build(list, prev, r) {
        const pack = K.basePack(), v = r.values.look, e = monOf(r);
        list.appendChild(row('monarch', 'Monarch', ONE_OF.look.monarch.map(m => {
          const cv = el('canvas'); cv.dataset.mon = m;
          return { id: m, node: cv, name: 'Monarch ' + m.toUpperCase(), kind: 'pic' };
        }), v.monarch, choose('look', 'monarch'), hookNote(r, 'look', 'monarch')));
        if (pack) {
          list.appendChild(row('monarch_skin', 'Skin tone', swatches(pack, 'monarch_skin'), v.monarch_skin, choose('look', 'monarch_skin'), hookNote(r, 'look', 'monarch_skin')));
          // the first choice of each is the monarch's own colours, which saves nothing for the key
          const own = KW.scenes.court.drawn(v.monarch), asDrawn = cols => ({ id: null, name: 'As drawn', fill: bandsCss(Object.assign({}, cols)) });
          const pickOr = k => id => (id === null ? store.clear('look', k) : store.choose('look', k, id));
          list.appendChild(row('monarch_hair', 'Hair colour', [asDrawn(own.hair)].concat(swatches(pack, 'monarch_hair')), v.monarch_hair, pickOr('monarch_hair'), hookNote(r, 'look', 'monarch_hair')));
          list.appendChild(row('monarch_robe', 'Robe', [asDrawn(own.robe)].concat(swatches(pack, 'monarch_robe')), v.monarch_robe, pickOr('monarch_robe'), hookNote(r, 'look', 'monarch_robe')));
        } else list.appendChild(el('p', 'kws-line', 'The monarch\'s skin tones and colours come from the base pack, which could not be used (see Status), so the monarch keeps the court\'s own.'));
        const d = defaultsOf('look');
        list.appendChild(reset('look', 'look', lookWords(d.values, pack), d.fromConfig, hooked(r, 'look')));
        prev.appendChild(el('h2', '', 'At court'));
        const cv = el('canvas', 'court'); cv.id = 'kws-court'; cv.dataset.skin = e.monSkin ? e.monSkin.id : ''; prev.appendChild(cv);
      } },
      display: { label: 'Display', scope: OWN_SCOPE, build(list, prev, r) {
        const v = r.values.display;
        list.appendChild(row('headline', 'Headline size', HEADLINES.map(([id, name, px]) => {
          const s = el('span', 'hl', 'AT COURT'); s.style.fontSize = px + 'px';
          return { id, html: s, name, label: name, kind: 'text' };
        }), v.headline, choose('display', 'headline'), hookNote(r, 'display', 'headline')));
        const twelve = el('span', '', '9:42'); twelve.appendChild(el('small', '', 'PM'));
        list.appendChild(row('clock', 'Clock', [{ id: 24, chip: '21:42', name: '24 hour', kind: 'text' }, { id: 12, html: twelve, name: '12 hour', label: '9:42 PM', kind: 'text' }],
          v.clock, choose('display', 'clock'), hookNote(r, 'display', 'clock')));
        list.appendChild(row('helmet_indoors', 'Helmet indoors', [{ id: false, chip: 'Off', name: 'In the house and smithy', kind: 'text' }, { id: true, chip: 'On', name: 'Kept on everywhere', kind: 'text' }],
          v.helmet_indoors, choose('display', 'helmet_indoors'), hookNote(r, 'display', 'helmet_indoors')));
        const d = defaultsOf('display').values, dw = (d.headline === 'medium' ? 'a medium' : 'a ' + d.headline) + ' headline, a ' + d.clock + '-hour clock and the helmet ' + (d.helmet_indoors ? 'on' : 'off') + ' indoors';
        list.appendChild(reset('display', 'choices', dw, defaultsOf('display').fromConfig, hooked(r, 'display')));
      } },
      quiet: { label: 'Quiet scenes', scope: OWN_SCOPE, build(list, prev, r) {
        const on = r.values.quiet.scenes, mins = r.values.quiet.minutes;
        for (const k of SCENES) {
          const inIt = on.includes(k), row2 = el('div', 'kws-scene' + (inIt ? '' : ' out')), cv = el('canvas'); cv.dataset.scene = k;
          const nm = el('div', 'sname', SCENE_NAMES[k]); nm.appendChild(el('small', '', inIt ? (on.length === 1 ? 'The only scene: it stays on screen' : 'In the rotation') : 'Left out'));
          row2.appendChild(cv); row2.appendChild(nm);
          row2.appendChild(toggle(SCENE_NAMES[k] + ' in the rotation', inIt, () => {
            if (inIt && on.length === 1) { st.notes.quiet = 'One scene at least stays in the rotation.'; render(); return; }
            st.notes.quiet = '';
            // a scene switched back on joins the end of the rotation
            store.choose('quiet', 'scenes', inIt ? on.filter(x => x !== k) : on.concat(k));
          }, 'scene|' + k));
          list.appendChild(row2);
        }
        if (st.notes.quiet) list.appendChild(el('div', 'kws-note kws-wide', st.notes.quiet));
        const choices = MINUTE_CHOICES.includes(mins) ? MINUTE_CHOICES : MINUTE_CHOICES.concat(mins).sort((a, b) => a - b);
        list.appendChild(row('minutes', 'Each shows for', choices.map(m => ({ id: m, chip: String(m), name: 'min', kind: 'text', label: m + ' minutes' })), mins, choose('quiet', 'minutes'),
          (r.from.quiet.minutes === 'built-in' && o.info().mode === 'demo' ? 'The demo shows each scene for a minute until a length is chosen here or in config.toml.' : hookNote(r, 'quiet', 'minutes'))));
        const d = defaultsOf('quiet').values, n = d.scenes.length;
        const dw = (n === SCENES.length ? 'all four scenes' : n === 1 ? 'the ' + lower(SCENE_NAMES[d.scenes[0]]) + ' alone' : d.scenes.map(x => lower(SCENE_NAMES[x])).join(', ').replace(/, ([^,]*)$/, ' and $1')) + ', ' + d.minutes + (d.minutes === 1 ? ' minute' : ' minutes') + ' each';
        list.appendChild(reset('quiet', 'choices', dw + '. These scenes show only while all is quiet; anything the knight has to act out comes first', defaultsOf('quiet').fromConfig, hooked(r, 'quiet')));
      } },
      scenes: { label: 'Scenes', scope: OWN_SCOPE, build(list, prev, r) {
        const offer = store.offered(), conds = Object.keys(offer), dflt = store.fallback().values.scenes;
        list.appendChild(el('p', 'kws-intro', 'Where the knight acts out each of these. ' +
          'A condition only one scene can act, and the night, which needs the bed, keep their own scene.'));
        if (!conds.length) list.appendChild(el('p', 'kws-line', 'No condition has more than one scene that can act it.'));
        for (const c of conds) {
          list.appendChild(row('scene:' + c, CONDITION_NAMES[c] || c, offer[c].map(k => {
            const cv = el('canvas'); cv.dataset.scene = k;
            return { id: k, node: cv, name: SCENE_NAMES[k] || k, sub: k === dflt[c] ? 'Default' : '', kind: 'scene' };
          }), r.values.scenes[c], choose('scenes', c), hookNote(r, 'scenes', c)));
        }
        const f = store.fallback(), set = conds.filter(c => f.from.scenes[c] === 'defaults');
        const dw = set.length ? set.map(c => lower(CONDITION_NAMES[c] || c) + ' in the ' + lower(SCENE_NAMES[f.values.scenes[c]] || f.values.scenes[c])).join(', ').replace(/, ([^,]*)$/, ' and $1') + ', and the rest in their own scenes'
          : 'each condition in its own scene';
        list.appendChild(reset('scenes', 'choices', dw, set.length > 0, hooked(r, 'scenes')));
      } },
      status: { label: 'Status', scope: 'What this display knows. Read only.', build(list) {
        const s = K.status || { base: null, refused: [], source: 'code', note: '' }, info = o.info(), view = info.view;
        const stat = (label, fill) => { const d = el('dl', 'kws-stat'); d.appendChild(el('dt', '', label)); const dd = el('dd'); fill(dd); d.appendChild(dd); list.appendChild(d); };
        const line = (dd, cls, text) => { const p = el('div', cls, text); dd.appendChild(p); return p; };
        const hhmm = ms => { const d = new Date(ms), c = clock(d.getHours(), d.getMinutes(), store.now().values.display.clock); return c.time + (c.half ? ' ' + c.half : ''); };
        stat('Version', dd => {
          const p = line(dd, '', 'Page '); p.appendChild(el('code', '', info.version));
          line(dd, 'quiet', info.version === 'dev' ? 'The repository\'s own copy, which never checks for a new version.' : 'It reloads by itself when a new version is deployed.');
        });
        stat('State file', dd => {
          if (!view) { line(dd, info.mode === 'demo' ? 'quiet' : 'warn', info.mode === 'demo' ? 'None. The display is showing the demo, on invented data.' : 'None read yet.'); return; }
          const p = line(dd, 'ok', ''); p.id = 'kws-fresh'; fresh();
          line(dd, 'quiet', 'The collector writes it every ' + view.intervalS + (view.intervalS === 1 ? ' second.' : ' seconds.'));
        });
        stat('Sources', dd => {
          const src = view ? view.sources : [];
          if (!src.length) { line(dd, 'quiet', view ? 'The state file lists none.' : 'None known.'); return; }
          const bad = src.filter(x => !x.ok);
          if (!bad.length) { line(dd, 'ok', 'All ' + src.length + ' working.'); return; }
          line(dd, 'warn', (src.length - bad.length) + ' of ' + src.length + ' working. Failing:');
          const ul = el('ul'); dd.appendChild(ul);
          for (const x of bad) {
            const li = el('li'); li.appendChild(el('code', '', x.name));
            li.appendChild(document.createTextNode(': ' + (x.error || 'no reason given') + (x.at !== null ? ', last read at ' + hhmm(x.at) : '')));
            ul.appendChild(li);
          }
        });
        stat('Knight', dd => {
          if (s.base) { const p = line(dd, '', 'Drawn from the base pack '); p.appendChild(el('code', '', s.base.id + ' ' + s.base.version)); p.appendChild(document.createTextNode(s.base.signed ? ', signed.' : ', unsigned.')); }
          else line(dd, 'warn', 'Drawn from code: ' + (String(s.note).split('drawn from code: ')[1] || 'the base pack could not be used') + '.');
        });
        stat('Refused packs', dd => {
          if (!s.refused.length) { line(dd, 'ok', 'None.'); return; }
          line(dd, 'warn', s.refused.length === 1 ? 'One pack was refused:' : s.refused.length + ' packs were refused:');
          const ul = el('ul'); dd.appendChild(ul);
          for (const x of s.refused) {
            const li = el('li'); li.appendChild(el('code', '', x.file || x.id || 'a pack with no name'));
            if (x.file && x.id) li.appendChild(document.createTextNode(' (' + x.id + ')'));
            li.appendChild(document.createTextNode(': refused at the ' + x.step + ' step. ' + x.reason));
            ul.appendChild(li);
          }
        });
      } }
    };
    function fresh() {
      const p = $('kws-fresh'), view = o.info().view;
      if (!p || !view) return;
      const n = Math.max(0, Math.round((Date.now() - view.generatedAt) / 1000));
      const text = 'Written ' + (n < 120 ? n + (n === 1 ? ' second' : ' seconds') : Math.round(n / 60) + ' minutes') + ' ago.';
      if (p.textContent !== text) p.textContent = text;
    }
    const monOf = r => engineInput(r, K.basePack(), 0);

    /* The rail, built once. */
    const rail = kws.querySelector('.kws-rail');
    for (const [k, p] of Object.entries(PAGES)) {
      const b = el('button', '', p.label); b.type = 'button'; b.dataset.page = k;
      b.addEventListener('click', () => { st.page = k; st.notes = {}; render(); });
      rail.appendChild(b);
    }

    function render() {
      const r = store.now(), page = PAGES[st.page], old = main.querySelector('.kws-list'), top = old ? old.scrollTop : 0, same = main.dataset.page === st.page;
      const focus = document.activeElement && main.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
      const pk = JSON.stringify(knightLook(r)) + '|' + r.values.display.helmet_indoors;
      if (pk !== picKey) { picKey = pk; pics.clear(); }
      main.textContent = ''; main.dataset.page = st.page;
      const list = el('div', 'kws-list'); main.appendChild(list);
      let prev = null;
      if (st.page === 'knight' || st.page === 'monarch') { prev = el('div', 'kws-prev'); main.appendChild(prev); }
      page.build(list, prev, r);
      if (same) list.scrollTop = top;
      scope.textContent = page.scope;
      rail.querySelectorAll('button').forEach(b => { if (b.dataset.page === st.page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      if (focus) { const f = main.querySelector('[data-focus="' + focus + '"]'); if (f) f.focus({ preventScroll: true }); }
      paintStill(r); idleTick();
    }
    /* What does not move: the monarchs and the scenes. */
    function paintStill(r) {
      const e = monOf(r);
      main.querySelectorAll('canvas[data-mon]').forEach(cv => blit(cv, monarchPicture(cv.dataset.mon, e), true));
      main.querySelectorAll('canvas[data-scene]').forEach(cv => blit(cv, scenePicture(cv.dataset.scene, r.values.display.helmet_indoors), true));
      const ct = $('kws-court'); if (ct) blit(ct, monarchPicture(r.values.look.monarch, e), false);
    }
    /* What moves: the knights, every frame while the screen is open. */
    function loop() {
      requestAnimationFrame(loop);
      if (!st.open) return;
      const kn = $('kws-knights'); if (kn) drawKnights(kn, o.time());
      fresh();
    }
    requestAnimationFrame(loop);
    // changed says whether a choice was made while the screen was open; closing then reloads the
    // page, so that everything it draws starts again from the new settings
    let changed = false;
    store.on(() => { if (st.open) { changed = true; render(); } });

    /* ---- Opening, closing, the idle close */
    let idleTimer = 0;
    const touch = () => { st.lastTouch = performance.now(); };
    function open(page) {
      if (page && PAGES[page]) st.page = page;
      st.notes = {}; st.open = true; changed = false; kws.hidden = false; hideCue(); touch(); render();
      clearInterval(idleTimer); idleTimer = setInterval(idleTick, 250);
      // the dialog takes the focus, so that the keyboard starts inside it, without a ring
      kws.querySelector('.kws-panel').focus({ preventScroll: true });
    }
    function close() {
      st.open = false; kws.hidden = true; clearInterval(idleTimer); if (kws.contains(document.activeElement)) document.activeElement.blur();
      if (changed) { changed = false; location.reload(); }
    }
    function idleTick() {
      if (!st.open) return;
      const left = Math.ceil(IDLE_S - (performance.now() - st.lastTouch) / 1000);
      if (left <= 0) { close(); return; }
      const soon = left <= WARN_S, text = soon ? 'Closing in ' + left + (left === 1 ? ' second' : ' seconds') + '. Touch anywhere to keep it open.' : 'Closes by itself after a minute without a touch.';
      foot.className = 'kws-foot' + (soon ? ' soon' : '');
      if (foot.textContent !== text) foot.textContent = text;
    }
    $('kws-done').addEventListener('click', close);
    kws.addEventListener('pointerdown', touch, true);
    kws.addEventListener('wheel', touch, { passive: true, capture: true });
    kws.addEventListener('scroll', touch, true);
    document.addEventListener('keydown', e => { if (!st.open) return; if (e.key === 'Escape') close(); else touch(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (st.open) render(); });

    /* ---- The hold
       A press on the display starts it. The cue shows above the press after CUE_AFTER_MS and
       fills until HOLD_MS, when the screen opens. Lifting, leaving or moving more than MOVE_PX
       cancels it. A press lifted within TAP_MS is a tap and its click goes through, which in live
       mode toggles full screen. The click of any other press is swallowed: a press that moved, one
       held past TAP_MS, and the one whose hold opened the screen, so that the screen that has just
       opened under the finger is not tapped by its release. */
    let hold = null, swallow = false;
    function showCue(x, y, q) {
      cue.hidden = false;
      cue.style.left = Math.max(170, Math.min(window.innerWidth - 170, x)) + 'px';
      cue.style.top = Math.max(110, y - 56) + 'px';
      const lit = Math.max(1, Math.min(BLOCKS, Math.ceil(q * BLOCKS)));
      cueBar.querySelectorAll('i').forEach((b, i) => b.classList.toggle('lit', i < lit));
    }
    function hideCue() { cue.hidden = true; }
    function holdTick() {
      if (!hold || hold.done || hold.moved) return;
      const t = performance.now() - hold.t0;
      if (t >= HOLD_MS) { hold.done = true; swallow = true; open('knight'); return; }
      if (t >= CUE_AFTER_MS) showCue(hold.x, hold.y, (t - CUE_AFTER_MS) / (HOLD_MS - CUE_AFTER_MS));
      requestAnimationFrame(holdTick);
    }
    const surface = o.surface;
    window.addEventListener('pointerdown', () => { swallow = false; }, true);
    window.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    surface.addEventListener('pointerdown', e => {
      if (st.open || hold || (e.pointerType === 'mouse' && e.button !== 0)) return;
      hold = { id: e.pointerId, t0: performance.now(), x: e.clientX, y: e.clientY, moved: false, done: false };
      requestAnimationFrame(holdTick);
    });
    surface.addEventListener('pointermove', e => {
      if (!hold || e.pointerId !== hold.id || hold.done) return;
      if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > MOVE_PX) { hold.moved = true; hideCue(); }
    });
    const lift = e => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; hold = null; hideCue();
      if (h.done || h.moved || performance.now() - h.t0 >= TAP_MS) swallow = true;
    };
    for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, lift);
    surface.addEventListener('pointerleave', e => { if (hold && e.pointerId === hold.id && !hold.done) { hold.moved = true; hideCue(); } });
    // a long press asks for no menu and selects nothing
    surface.addEventListener('contextmenu', e => e.preventDefault());

    return {
      open, close, isOpen: () => st.open,
      /* The cue as it looks part way through a hold (q from 0 to 1) at (x, y), held there, for
         the screenshots. */
      cue(x, y, q) { showCue(x, y, q); }
    };
  }
  api.mount = mount;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
