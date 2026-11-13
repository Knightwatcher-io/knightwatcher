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
     scene of null is the quiet scene of the moment. */
  const CONDITIONS = {
    attack:              { lv: 4, level: 'critical', scene: 'battlement' },
    wan_down:            { lv: 4, level: 'critical', scene: 'battlement' },
    container_unhealthy: { lv: 3, level: 'warning',  scene: 'house' },
    disk_full:           { lv: 3, level: 'warning',  scene: 'cellar' },
    backup_overdue:      { lv: 3, level: 'warning',  scene: 'house' },
    pi_silent:           { lv: 3, level: 'warning',  scene: 'house' },
    cpu_hot:             { lv: 3, level: 'warning',  scene: 'yard' },
    memory_tight:        { lv: 3, level: 'warning',  scene: null },
    ssh_session:         { lv: 2, level: 'work',     scene: 'court' },
    updating:            { lv: 2, level: 'work',     scene: 'smithy' },
    streaming:           { lv: 2, level: 'quiet',    scene: 'house' },
    night:               { lv: 1, level: 'sleep',    scene: 'house' }
  };

  /* What each event type plays: flies, or one of the engine's events. */
  const EVENTS = { ad_blocked: 'flies', ip_banned: 'goblin', import: 'crate', backup_done: 'feast' };

  /* The most flies one event may add. The rest of a larger count would only lengthen the queue. */
  const MAX_FLIES = 100;

  /* The knight's state with nothing to report. */
  const IDLE = { id: 'idle', lv: 0, st: 'ok', scene: null, hl: '', sub: '' };

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = v => (typeof v === 'string' ? v : '');
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  /* The engine's record of one condition: its id, lv and scene from the table above, its colour
     from the file's level (or the design's when the file has none), and the file's words. */
  function condition(c) {
    const k = CONDITIONS[c.id], level = has(LEVELS, c.level) ? c.level : k.level;
    return { id: c.id, lv: k.lv, level, st: LEVELS[level], scene: k.scene, hl: str(c.headline), sub: str(c.detail) };
  }

  /* Turns a parsed state file into what the page shows, at the time nowMs.
     Returns ok false with a problem ('malformed', 'schema' or 'stale') when the page must not act
     on the file, and generatedAt (ms) whenever the file says when it was written. Otherwise:
       w          the first condition with a known id, or null when there is none
       more       { n, crit }: the other known conditions at warning or critical, and whether any
                  of them is critical
       quietLine  the line shown when w is null
       piOK, tv   whether the pie is on its plate, and whether the television is on
       events     the events of a known type, oldest first: { seq, act, count, text }
       maxSeq     the highest seq in the file, or null when it has no events
       intervalS  how often the collector says it writes the file, in seconds */
  function map(file, nowMs) {
    if (!isObj(file)) return { ok: false, problem: 'malformed', generatedAt: null };
    const gen = typeof file.generated_at === 'string' ? Date.parse(file.generated_at) : NaN;
    const generatedAt = Number.isFinite(gen) ? gen : null;
    if (file.schema !== 1) return { ok: false, problem: 'schema', generatedAt };
    const interval = file.interval_s;
    if (generatedAt === null || typeof interval !== 'number' || !(interval > 0)) return { ok: false, problem: 'malformed', generatedAt };
    const ageS = (nowMs - generatedAt) / 1000;
    if (ageS > 3 * interval) return { ok: false, problem: 'stale', generatedAt, ageS };

    const known = (Array.isArray(file.conditions) ? file.conditions : [])
      .filter(c => isObj(c) && has(CONDITIONS, c.id))
      .map(condition);
    const w = known[0] || null, rest = known.slice(1).filter(c => c.level === 'warning' || c.level === 'critical');
    const facts = isObj(file.facts) ? file.facts : {};
    const piUp = isObj(facts.pi) ? facts.pi.up : undefined, streams = isObj(facts.streams) ? facts.streams.count : 0;

    const events = [];
    let maxSeq = null;
    for (const e of Array.isArray(file.events) ? file.events : []) {
      if (!isObj(e) || typeof e.seq !== 'number' || !Number.isFinite(e.seq)) continue;
      maxSeq = maxSeq === null ? e.seq : Math.max(maxSeq, e.seq);
      if (!has(EVENTS, e.type)) continue;
      const n = typeof e.count === 'number' && e.count >= 1 ? Math.floor(e.count) : 1;
      events.push({ seq: e.seq, act: EVENTS[e.type], count: Math.min(n, MAX_FLIES), text: str(e.text) });
    }
    events.sort((a, b) => a.seq - b.seq);

    return {
      ok: true, problem: '', generatedAt, ageS, w,
      more: { n: rest.length, crit: rest.some(c => c.level === 'critical') },
      quietLine: str(file.quiet_line),
      piOK: piUp !== false && !known.some(c => c.id === 'pi_silent'),
      tv: (typeof streams === 'number' && streams > 0) || known.some(c => c.id === 'streaming'),
      events, maxSeq, intervalS: interval
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

  const api = { LEVELS, CONDITIONS, EVENTS, IDLE, MAX_FLIES, RELOAD_GUARD_MS, map, takeEvents, judge, noSignal, versionOf, reloadDue, start };
  KW.state = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
