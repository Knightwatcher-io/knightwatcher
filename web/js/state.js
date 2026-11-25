/* Knightwatcher: reading the state file (docs/state.md) and turning it into what the engine needs.
   It also decides when a deployed page reloads itself for a new version. Everything above start()
   is pure and loads under Node, for the tests in tests/web/. */
(function (KW) {
  'use strict';

  /* The text colour for each level of the contract, as a class of the display. */
  const LEVELS = { critical: 'crit', warning: 'warn', work: 'info', quiet: 'ok', sleep: 'sleep' };

  /* What the page makes of each condition id, highest first, as docs/design.md decides. lv ranks
     the knight's behaviour: 3 and above is serious and holds back the fun, 2 pins the knight to
     the scene. level is the level the design gives the id, used when a file leaves it out. A
     scene of null is the quiet scene of the moment. cpu_hot is Under strain: a machine's CPU or
     memory. */
  const CONDITIONS = {
    attack:              { lv: 4, level: 'critical', scene: 'battlement' },
    wan_down:            { lv: 4, level: 'critical', scene: 'battlement' },
    container_unhealthy: { lv: 3, level: 'warning',  scene: 'house' },
    disk_full:           { lv: 3, level: 'warning',  scene: 'cellar' },
    backup_overdue:      { lv: 3, level: 'warning',  scene: 'house' },
    pi_silent:           { lv: 3, level: 'warning',  scene: 'house' },
    device_down:          { lv: 3, level: 'warning',  scene: null },
    cpu_hot:             { lv: 3, level: 'warning',  scene: 'yard' },
    ssh_session:         { lv: 2, level: 'work',     scene: 'court' },
    updating:            { lv: 2, level: 'work',     scene: 'smithy' },
    streaming:           { lv: 2, level: 'quiet',    scene: 'house' },
    night:               { lv: 1, level: 'sleep',    scene: 'house' }
  };

  /* Ids a collector from before wrote and no longer writes, and the condition the page acts each
     as: memory_tight, Memory tight, is Under strain on memory, in cpu_hot's scene, trained and
     bloated (mem). */
  const RETIRED = { memory_tight: { id: 'cpu_hot', mem: true } };
  const knownId = id => has(CONDITIONS, id) || has(RETIRED, id);

  /* A generic check's condition: check:<name>, which the page acts as the condition its entry
     names in as (any but device_down, which needs devices to look towards), with the check's own
     words. */
  const CHECK_ID = /^check:[a-z0-9][a-z0-9-]{0,19}$/;
  const isCheck = c => CHECK_ID.test(str(c.id)) && knownId(c.as) && c.as !== 'device_down';
  /* Whether the page knows a condition of the file: one of CONDITIONS or RETIRED, or a check it
     can act. */
  const knownCondition = c => isObj(c) && (knownId(c.id) || isCheck(c));

  /* Whether Under strain's machines (docs/state.md) name one short of memory: any entry of the
     list with memory. */
  const MAX_MACHINES = 33;
  const shortOfMemory = list => Array.isArray(list) && list.slice(0, MAX_MACHINES).some(m => isObj(m) && isObj(m.memory));

  /* What each event type plays: flies, or one of the engine's events. */
  const EVENTS = { ad_blocked: 'flies', ip_banned: 'goblin', import: 'crate', backup_done: 'feast' };

  /* The most flies one event may add. The rest of a larger count would only lengthen the queue. */
  const MAX_FLIES = 100;

  /* The places a scene has for devices, by class: the pie's own place, three high places
     for cameras, and three on the ground for every other device. MAX_LIST is the most entries the
     page reads from the list, and MAX_KIND the longest kind. */
  const PLACES = { pie: ['pie'], high: ['h1', 'h2', 'h3'], ground: ['g1', 'g2', 'g3'] };
  const MAX_LIST = 32, MAX_KIND = 200;

  /* The knight's state with nothing to report. */
  const IDLE = { id: 'idle', lv: 0, st: 'ok', scene: null, hl: '', sub: '' };

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = v => (typeof v === 'string' ? v : '');
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  /* The parts the collector sends beside its finished text, which the page may build the text
     again from in a world's words (docs/state.md): an object of strings, the keys a value of
     another kind has left out, or null when there is none. MAX_PARTS is the most parts of the quiet
     line the page reads, and MAX_VALUE the longest value. */
  const MAX_PARTS = 16, MAX_VALUE = 200;
  function values(o) {
    if (!isObj(o)) return null;
    const v = {};
    for (const k of Object.keys(o)) if (typeof o[k] === 'string' && o[k].length <= MAX_VALUE) v[k] = o[k];
    return v;
  }
  /* The quiet line's parts, [{ k, ...values }], or null when the file has none, or any one of them
     cannot be read: then the page shows quiet_line as it is. */
  function quietParts(list) {
    if (!Array.isArray(list) || !list.length || list.length > MAX_PARTS) return null;
    const out = list.map(values);
    return out.every(p => p && typeof p.k === 'string' && p.k) ? out : null;
  }

  /* ---- The streams ---------------------------------------------------------------------------
     While streaming is the condition shown, the detail line takes each stream in turn, STREAM_MS
     each, from facts.streams.sessions; while a higher condition hides it, a badge says how many
     streams play. The collector decides what a session may hold (its setting show), and the
     page shows what it is given. The words are the collector's, built here by streamWords. */
  const STREAM_MS = 8000, MAX_SESSIONS = 32, NAME_MAX = 16, DETAIL_MAX = 60, SEP = ' · ', ELLIPSIS = '…';
  /* The characters of a text, counted by code point, as the collector counts them. */
  const chars = t => Array.from(t);
  const single = t => String(t).trim().split(/\s+/).join(' ');
  /* The collector's text.clip(): runs of white space made single, cut to at most limit characters
     with an ellipsis when cut. */
  function clip(t, limit) {
    const c = chars(single(t));
    return c.length <= limit ? c.join('') : c.slice(0, limit - 1).join('').trimEnd() + ELLIPSIS;
  }
  /* The streams section as the page reads it: n the count, or null when the file gives none, and
     sessions [{ who, title }] in the collector's order, each with at least one of the two, or null
     when there are none. Each value is a string, '' when the session has none. */
  function streamsOf(sec) {
    if (!isObj(sec)) return null;
    const n = Number.isInteger(sec.count) && sec.count >= 0 ? sec.count : null;
    const list = (Array.isArray(sec.sessions) ? sec.sessions.slice(0, MAX_SESSIONS) : []).map(values)
      .filter(Boolean).map(v => ({ who: single(v.who || ''), title: single(v.title || '') })).filter(v => v.who || v.title);
    return { n, sessions: list.length ? list : null };
  }
  /* One stream in words, the i-th of n: "Robin · The Night Shift S02E04 · 1 of 3", with no "1 of 1"
     for a single stream; the collector's streams.line(). The name, cut at NAME_MAX, and the count
     stay whole and the title gives way, cut with an ellipsis to fit DETAIL_MAX. */
  function streamLine(s, i, n) {
    const who = clip(s.who, NAME_MAX), tail = n > 1 ? i + ' of ' + n : '', fixed = [who, tail].filter(Boolean);
    const room = fixed.length ? DETAIL_MAX - chars(fixed.concat('').join(SEP)).length : DETAIL_MAX;
    const title = s.title && room > 1 ? clip(s.title, room) : '';
    return clip([who, title, tail].filter(Boolean).join(SEP), DETAIL_MAX);
  }
  /* The words the page shows for the streams (streamsOf's shape, or null) at the time nowMs:
     line, the detail line, which takes the sessions in turn by the clock alone, STREAM_MS each, so
     that every display shows the same stream at the same moment, or null when there are no
     sessions and the page shows the collector's detail; and badge, "3 STREAMING", or "STREAMING"
     when the count is unknown or none. This is the one place the page words the streams. */
  function streamWords(streams, nowMs) {
    const list = streams && streams.sessions, n = streams ? streams.n : null;
    let line = null;
    if (list && list.length) {
      const i = ((Math.floor(nowMs / STREAM_MS) % list.length) + list.length) % list.length;
      line = streamLine(list[i], i + 1, list.length);
    }
    return { line, badge: (n ? n + ' ' : '') + 'STREAMING' };
  }

  /* The engine's record of one condition: its id, lv and scene from the table above, its colour
     from the file's level (or the design's when the file has none), and the file's words. file is
     the file's own id. A check is acted as the condition it borrows: its id, lv and scene are that
     condition's, and file is check:<name>, which is what the places that read facts tied to a
     condition test, so that a check never empties the pie's dish, turns on the television or takes
     the streams' detail. A retired id is acted as the condition RETIRED names, its file id kept.
     mem is whether Under strain is short of memory, so that the knight is bloated as it trains:
     from the entry's machines, or memory_tight from a collector from before; never for a check,
     whichever it borrows. */
  function condition(c) {
    const check = isCheck(c), named = check ? c.as : c.id, old = has(RETIRED, named) ? RETIRED[named] : null;
    const id = old ? old.id : named, k = CONDITIONS[id], level = has(LEVELS, c.level) ? c.level : k.level;
    const mem = !check && (old ? old.mem : id === 'cpu_hot' && shortOfMemory(c.machines));
    return { id, file: c.id, lv: k.lv, level, st: LEVELS[level], scene: k.scene, hl: str(c.headline), sub: str(c.detail), mem };
  }

  /* The class of place a kind stands in: the first Pi's pie has its own place, a camera is
     mounted high, and every other kind, one the page does not know included, stands on the
     ground. */
  const classOf = kind => (kind === 'pi' ? 'pie' : kind === 'camera' ? 'high' : 'ground');

  /* Puts the devices of a list (the contract's entries) in the scene's places. Each class
     fills in the order of the list: the first camera takes h1, the second h2, and so on, and the
     same for the ground places; only the first pi has a place. A device with no free place of its
     class is not drawn, and an entry the page cannot read takes no place. The places depend on the
     list alone, never on which devices are up. Returns
       devices  the devices drawn: { place, kind, ok, alert }, ok false only for the state 'down'
       at      for each position in the list, the place it stands in, or null */
  function arrange(list) {
    const free = { pie: PLACES.pie.slice(), high: PLACES.high.slice(), ground: PLACES.ground.slice() };
    const devices = [], at = [];
    for (const e of Array.isArray(list) ? list.slice(0, MAX_LIST) : []) {
      if (!isObj(e)) { at.push(null); continue; }
      const kind = typeof e.kind === 'string' && e.kind.length <= MAX_KIND ? e.kind : '';
      const place = free[classOf(kind)].shift() || null;
      at.push(place);
      if (place) devices.push({ place, kind, ok: e.state !== 'down', alert: e.alert === true });
    }
    return { devices, at };
  }

  /* The devices the scene draws, from the file's facts and its known conditions, as
     arrange() gives them. Without a devices section of that shape (an older collector), the pie
     stands alone in its place, gone while facts.pi.up is false or pi_silent is raised, as before
     there were devices. */
  function placed(facts, known) {
    const sec = facts.devices;
    if (isObj(sec) && Array.isArray(sec.list)) return arrange(sec.list);
    const piUp = isObj(facts.pi) ? facts.pi.up : undefined;
    return { devices: [{ place: 'pie', kind: 'pi', ok: piUp !== false && !known.some(c => c.file === 'pi_silent'), alert: true }], at: [] };
  }

  /* The place the knight looks towards for device_down: that of the first position among those
     given that stands in a place, or null when none does. */
  function lookPlace(positions, at) {
    for (const i of Array.isArray(positions) ? positions : []) if (Number.isInteger(i) && i >= 0 && i < at.length && at[i]) return at[i];
    return null;
  }

  /* The list of devices the address's dv= hook asks for, in the contract's shape: kinds
     separated by commas, each followed by - for down or ! for down and alerting. An empty item, or
     one that is not a kind, is an entry the page cannot read. */
  function listFromHook(text) {
    let v; try { v = decodeURIComponent(String(text)); } catch (e) { v = ''; }
    return v.split(',').slice(0, MAX_LIST).map(e => {
      const m = /^(\w[\w.\/-]{0,199}?)([-!]?)$/.exec(e);
      return m ? { kind: m[1], state: m[2] ? 'down' : 'up', alert: m[2] === '!' } : null;
    });
  }

  /* Turns a parsed state file into what the page shows, at the time nowMs.
     Returns ok false with a problem ('malformed', 'schema' or 'stale') when the page must not act
     on the file, and generatedAt (ms) whenever the file says when it was written. Otherwise:
       w          the first condition with a known id, or a check the page can act, or null
                  when there is none: { id, file, lv, level, st, scene, hl, sub, mem }, id the
                  condition acted and file the file's own id, check:<name> for a check, and mem
                  whether Under strain is short of memory (see condition()). For device_down it
                  also carries place, the name of the place the knight looks towards, or null (see
                  lookPlace)
       more       { n, crit }: the other known conditions at warning or critical, and whether any
                  of them is critical
       streams    the streams the file reports, { n, sessions } (see streamsOf), or null
       streamsBehind  whether streaming is up but a higher condition is shown, for its badge
       quietLine  the collector's line shown when w is null
       quietParts the parts it was written from, [{ k, ...values }], each value a string, or null
                  when the file has none or one cannot be read
       devices     the devices the scene draws, in their places (see arrange())
       tv         whether the television is on
       events     the events of a known type, oldest first: { seq, type, act, count, text, parts },
                  parts the values the caption was written from, each a string, or null
       maxSeq     the highest seq in the file, or null when it has no events
       intervalS  how often the collector says it writes the file, in seconds
       defaults   the file's defaults section as it stands, for KW.settings to check, or null when
                  it has none (a collector from before the settings)
       sources    each source the file lists, { name, ok, at, error }, for the settings screen's
                  status page: ok true only for ok === true, at the time in ms or null, error a
                  string
       analytics  whether the collector's usage counts are on, true or false, for the status page,
                  or null when the file does not say (a collector from before them, or --once
                  run by hand with an older one) */
  function map(file, nowMs) {
    if (!isObj(file)) return { ok: false, problem: 'malformed', generatedAt: null };
    const gen = typeof file.generated_at === 'string' ? Date.parse(file.generated_at) : NaN;
    const generatedAt = Number.isFinite(gen) ? gen : null;
    if (file.schema !== 1) return { ok: false, problem: 'schema', generatedAt };
    const interval = file.interval_s;
    if (generatedAt === null || typeof interval !== 'number' || !(interval > 0)) return { ok: false, problem: 'malformed', generatedAt };
    const ageS = (nowMs - generatedAt) / 1000;
    if (ageS > 3 * interval) return { ok: false, problem: 'stale', generatedAt, ageS };

    const raw = (Array.isArray(file.conditions) ? file.conditions : []).filter(knownCondition);
    const known = raw.map(condition);
    const rest = known.slice(1).filter(c => c.level === 'warning' || c.level === 'critical');
    const facts = isObj(file.facts) ? file.facts : {};
    const streams = isObj(facts.streams) ? facts.streams.count : 0, drawn = placed(facts, known);
    let w = known[0] || null;
    // a collector from before writes cpu_hot and memory_tight apart: the knight that trains for
    // the first is bloated for the second too
    if (w && w.file === 'cpu_hot' && known.some(c => c.file === 'memory_tight')) w.mem = true;
    if (w && w.file === 'device_down') w = Object.assign(w, { place: lookPlace(raw[0].devices, drawn.at) });

    const events = [];
    let maxSeq = null;
    for (const e of Array.isArray(file.events) ? file.events : []) {
      if (!isObj(e) || typeof e.seq !== 'number' || !Number.isFinite(e.seq)) continue;
      maxSeq = maxSeq === null ? e.seq : Math.max(maxSeq, e.seq);
      if (!has(EVENTS, e.type)) continue;
      const n = typeof e.count === 'number' && e.count >= 1 ? Math.floor(e.count) : 1;
      events.push({ seq: e.seq, type: e.type, act: EVENTS[e.type], count: Math.min(n, MAX_FLIES), text: str(e.text), parts: values(e.parts) });
    }
    events.sort((a, b) => a.seq - b.seq);

    return {
      ok: true, problem: '', generatedAt, ageS, w,
      more: { n: rest.length, crit: rest.some(c => c.level === 'critical') },
      streams: streamsOf(facts.streams), streamsBehind: known.slice(1).some(c => c.file === 'streaming'),
      quietLine: str(file.quiet_line), quietParts: quietParts(file.quiet_parts),
      devices: drawn.devices,
      tv: (typeof streams === 'number' && streams > 0) || known.some(c => c.file === 'streaming'),
      events, maxSeq, intervalS: interval,
      defaults: isObj(file.defaults) ? file.defaults : null,
      sources: isObj(file.sources) ? Object.keys(file.sources).filter(k => isObj(file.sources[k])).map(k => {
        const e = file.sources[k], at = typeof e.at === 'string' ? Date.parse(e.at) : NaN;
        return { name: k, ok: e.ok === true, at: Number.isFinite(at) ? at : null, error: str(e.error) };
      }) : [],
      analytics: isObj(file.analytics) && typeof file.analytics.on === 'boolean' ? file.analytics.on : null
    };
  }

  /* Which of a valid file's events to play, given the highest seq played so far (null before the
     first file). The first file's events are adopted unplayed, and so are a file's whose seq has
     gone backwards, which means the collector started again. Returns { play, lastSeq }. */
  function takeEvents(view, lastSeq) {
    if (view.maxSeq === null) return { play: [], lastSeq };
    if (lastSeq === null || view.maxSeq < lastSeq) return { play: [], lastSeq: view.maxSeq };
    return { play: view.events.filter(e => e.seq > lastSeq), lastSeq: view.maxSeq };
  }

  /* What the page does with the view of one fetch, given the last valid view (null before the
     first) and the time nowMs. Returns { kind, ageS }, kind being:
       'live'    the file is valid: show it
       'demo'    no valid file has ever arrived
       'hold'    the fetch failed or the file could not be read, and the last valid file is not yet
                 older than three of its intervals: keep showing it
       'silent'  NO SIGNAL: the file is stale, or has a schema the page does not know, or the fetch
                 failed and the last valid file is older than three of its intervals
     ageS is how long ago the newest file the page has seen was written. */
  function judge(view, lastGood, nowMs) {
    if (view.ok) return { kind: 'live', ageS: view.ageS };
    if (!lastGood) return { kind: 'demo', ageS: null };
    const ageS = (nowMs - lastGood.generatedAt) / 1000;
    if (view.problem === 'stale') return { kind: 'silent', ageS: view.generatedAt > lastGood.generatedAt ? (nowMs - view.generatedAt) / 1000 : ageS };
    if (view.problem === 'schema') return { kind: 'silent', ageS };
    return { kind: ageS > 3 * lastGood.intervalS ? 'silent' : 'hold', ageS };
  }

  /* The knight's state once the collector has fallen silent: the last state shown, under a red
     NO SIGNAL and how long it has been. */
  function noSignal(w, ageS) {
    const min = Math.max(0, Math.floor(ageS / 60));
    return Object.assign({}, w || IDLE, { st: 'crit', hl: 'NO SIGNAL', sub: 'collector silent for ' + min + ' min' });
  }

  /* ---- New versions of the page --------------------------------------------------------------
     tools/deploy.sh stamps a deployed copy with a version, a hash of the page's files: in a meta
     tag of index.html and in version.json beside it. A page whose own version is 'dev' (the
     repository's own files) never reloads. */

  /* How long a reload for one version holds back another reload for the same version, in case
     the reload brought back a cached index.html of the old one. */
  const RELOAD_GUARD_MS = 30 * 60 * 1000;

  const VERSION_RE = /^[\w.-]{1,64}$/;

  /* The version a parsed version.json names, or null when the file does not name one. */
  function versionOf(file) {
    return isObj(file) && typeof file.version === 'string' && VERSION_RE.test(file.version) ? file.version : null;
  }

  /* Whether the page should reload, given its own version, the version version.json names (null
     when the fetch failed or the file was malformed), the mark left by the last reload ({ version,
     at }, at in ms, or null) and the time nowMs. It should when the versions differ, unless it has
     already reloaded for that same version within RELOAD_GUARD_MS and is still not on it. A mark
     from the future, as after the clock was set back, holds nothing back. */
  function reloadDue(own, fetched, last, nowMs) {
    if (typeof own !== 'string' || own === 'dev' || !VERSION_RE.test(own)) return false;
    if (typeof fetched !== 'string' || fetched === 'dev' || !VERSION_RE.test(fetched) || fetched === own) return false;
    if (isObj(last) && last.version === fetched && typeof last.at === 'number') {
      const since = nowMs - last.at;
      if (since >= 0 && since < RELOAD_GUARD_MS) return false;
    }
    return true;
  }

  /* ---- The display's id -----------------------------------------------------------------------
     Served by the Knightwatcher server, the page tells it that it is showing: it makes a random id
     once, keeps it in the browser's storage, and posts it to api/displays at load and every
     DISPLAY_EVERY_MS. The server keeps when it last saw each id, and the collector counts the
     displays seen in the last six hours for its usage counts; the id never leaves the host
     (docs/server.md). With no storage the page makes a fresh id at each load. Another web server
     answers the post with an error, which changes nothing. */
  const DISPLAY_KEY = 'kw-display', DISPLAY_EVERY_MS = 30 * 60 * 1000, DISPLAY_ID = /^[0-9a-f]{32}$/;

  /* A new id: 16 random bytes as 32 lowercase hex characters. random(n) gives n random bytes. */
  function newDisplayId(random) {
    let bytes = null;
    try { bytes = random(16); } catch (e) { bytes = null; }
    if (!bytes || bytes.length !== 16) { bytes = []; for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256)); }
    return Array.from(bytes, b => (b & 255).toString(16).padStart(2, '0')).join('');
  }
  /* This display's id: the one storage() holds, or a new one, kept there when it can be. A
     storage that refuses, or throws, gives a new id that lasts as long as the page. */
  function displayId(storage, random) {
    let st = null;
    try { st = storage(); const held = st && st.getItem(DISPLAY_KEY); if (typeof held === 'string' && DISPLAY_ID.test(held)) return held; } catch (e) { st = null; }
    const id = newDisplayId(random);
    try { if (st) st.setItem(DISPLAY_KEY, id); } catch (e) { /* refused: the id lasts for this page */ }
    return id;
  }
  /* Posts this display's id now and every DISPLAY_EVERY_MS: o.fetch as the browser's, o.every as
     setInterval, o.storage and o.random as displayId takes them. Returns the id. A post that
     fails is not retried before the next. */
  function reportDisplay(o) {
    const id = displayId(o.storage, o.random), body = JSON.stringify({ id });
    const post = () => {
      try {
        const p = o.fetch('api/displays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store' });
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* refused: the next post may get through */ }
    };
    post();
    o.every(post, DISPLAY_EVERY_MS);
    return id;
  }

  /* Fetches data/state.json now and every 5 seconds after, and hands each result to onView: what
     map() made of it, or { ok: false, problem: 'unreachable' } when it could not be fetched or
     parsed. Browser only. */
  function start(onView) {
    const poll = async () => {
      let view;
      const ctl = new AbortController(), cut = setTimeout(() => ctl.abort(), 4000);
      try {
        const r = await fetch('data/state.json', { cache: 'no-store', signal: ctl.signal });
        view = r.ok ? map(await r.json(), Date.now()) : { ok: false, problem: 'unreachable', generatedAt: null };
      } catch (e) {
        view = { ok: false, problem: 'unreachable', generatedAt: null };
      }
      clearTimeout(cut);
      onView(view);
      setTimeout(poll, 5000);
    };
    poll();
  }

  const api = { LEVELS, CONDITIONS, RETIRED, EVENTS, IDLE, MAX_FLIES, PLACES, RELOAD_GUARD_MS, STREAM_MS, map, streamsOf, streamWords, arrange, lookPlace, listFromHook, takeEvents, judge, noSignal, versionOf, reloadDue, DISPLAY_KEY, DISPLAY_EVERY_MS, displayId, reportDisplay, start };
  KW.state = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
