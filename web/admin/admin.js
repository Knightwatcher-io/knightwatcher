/* The admin page: the household's settings, served by the bundled server at admin/.

   Runs after the page's own drawing scripts and packs (window.KW), the base pack and the medieval
   world's, which draw the household look's previews exactly as every wall draws the knight and the
   scenes, from the packs, with the packs the collector downloaded added once they have come.
   Everything else comes from the server:

   - api/admin/state says whether the page is on and whether this browser is signed in;
   - api/admin/schema is collector/settings-schema.json, from which every section, label, help
     line, default, range and list of values on the page is taken;
   - api/admin/settings gives what is set here, config.toml as parsed, the collector's last report
     and which credential variables it holds, by name; a change is sent there and checked by the
     collector's own code before it is kept;
   - api/settings is the walls' shared look, display, quiet scenes and scenes, which this page
     reads and writes too, so that the two never disagree.

   The page has no checks of its own: a change is applied when the server keeps it, and refused
   with the server's words when it does not. docs/server.md describes the API and docs/page.md the
   page. */
(function () {
  'use strict';
  const KW = window.KW;
  const root = document.getElementById('app');
  const API = '../api/';
  const POLL_MS = 5000;
  const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function btn(cls, text, on) { const b = el('button', cls, text); b.type = 'button'; if (on) b.addEventListener('click', on); return b; }
  /* Text with `code` spans, for the schema's help and the collector's words. */
  function rich(tag, cls, text) {
    const e = el(tag, cls);
    String(text).split(/(`[^`]+`)/).forEach(part => { if (/^`.+`$/.test(part)) e.appendChild(el('code', '', part.slice(1, -1))); else if (part) e.appendChild(document.createTextNode(part)); });
    return e;
  }
  function logo(cls) { const i = el('img', cls); i.src = '../logo.svg'; i.alt = ''; return i; }

  /* ---- Talking to the server ------------------------------------------------------------------- */
  async function call(method, path, body) {
    const init = { method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(API + path, init); } catch (e) { return { status: 0, json: { error: 'the server did not answer' } }; }
    const type = r.headers.get('Content-Type') || '';
    let json = null, text = null;
    if (type.startsWith('application/json')) { try { json = await r.json(); } catch (e) { json = null; } } else text = await r.text();
    return { status: r.status, json: json || {}, text };
  }

  /* ---- The page's state ------------------------------------------------------------------------- */
  let S = null, A = null, W = null;
  const auth = { mode: 'loading', error: '', pausedUntil: 0, wrong: false };
  const SECTIONS = ['collector', 'conditions', 'sources', 'devices', 'look', 'display', 'quiet', 'scenes', 'env'];
  const st = { sec: SECTIONS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'collector', refused: null, toast: null, open: {}, edit: null, mode: {},
    draft: null, confirm: null, menu: false, exp: null, resetAsk: false, scrollTo: null, reveal: false, dirty: false };

  /* ---- The schema ------------------------------------------------------------------------------- */
  let TABLES, SPEC, COND, SCENE, SOURCES, CREDS, PRIORITY;
  function readSchema(schema) {
    S = schema; TABLES = {}; SPEC = {}; COND = {}; SCENE = {};
    for (const t of S.tables) { TABLES[t.table] = t; for (const s of t.settings) SPEC[t.table + '.' + s.key] = Object.assign({ table: t.table }, s); }
    for (const c of S.conditions) COND[c.id] = c;
    for (const c of S.scenes) SCENE[c.id] = c.name;
    SOURCES = S.tables.filter(t => t.table.startsWith('sources.')).map(t => t.table.slice(8));
    CREDS = S.env.filter(e => e.scope === 'credential');
    PRIORITY = SPEC['conditions.priority'].default;
  }
  const WALL = ['look', 'display', 'quiet', 'scenes'];
  const isWall = path => WALL.includes(path.split('.')[0]);
  /* The admin section's place, "Conditions: under attack": the page, and the group within it. */
  const groupOf = section => { const i = section.indexOf(': '); return i < 0 ? section : cap(section.slice(i + 2)); };
  const varOf = (secret, field) => 'KNIGHTWATCHER_' + secret.toUpperCase() + '_' + field.toUpperCase();
  const needs = name => CREDS.filter(e => e.source === name);

  /* ---- Where each value comes from: set here, config.toml, or the default ------------------------- */
  let OWN = {}, PACK = null;
  const getPath = (o, path) => path.split('.').reduce((a, k) => (has(a, k) ? a[k] : undefined), o);
  function defOf(path) {
    const s = SPEC[path];
    if (path === 'device') return [];
    if (!s) return undefined;
    if (s.scope === 'display') { const [sec, k] = path.split('.'); return has(OWN[sec], k) ? OWN[sec][k] : s.page_default; }
    return s.default;
  }
  const file = () => A.file || {};
  const fileHas = path => (path === 'device' ? has(file(), 'device') : getPath(file(), path) !== undefined);
  const fileVal = path => clone(path === 'device' ? file().device : getPath(file(), path));
  function setHas(path) { if (isWall(path)) { const [sec, k] = path.split('.'); return has(W[sec], k); } return has(A.set, path); }
  function setVal(path) { if (isWall(path)) { const [sec, k] = path.split('.'); return clone(W[sec][k]); } return clone(A.set[path]); }
  const from = path => (setHas(path) ? 'set' : fileHas(path) ? 'file' : 'default');
  const val = path => (setHas(path) ? setVal(path) : fileHas(path) ? fileVal(path) : clone(defOf(path)));
  /* What a reset goes back to: config.toml's value, or the default. */
  const under = path => (fileHas(path) ? { v: fileVal(path), where: 'file' } : { v: clone(defOf(path)), where: 'default' });
  const srcThere = name => has(file().sources || {}, name) || Object.keys(A.set).some(p => p.startsWith('sources.' + name + '.'));
  const srcOn = name => srcThere(name) && val('sources.' + name + '.enabled') === true;
  const creds = () => A.credentials;
  const credState = name => (creds() === null ? null : !!creds()[name]);
  const status = () => A.status || null;

  /* ---- Applying a change: kept only when the server's checks pass ------------------------------- */
  let toastTimer = 0;
  async function apply(changes, o) {
    const paths = Object.keys(changes), wall = paths.every(isWall), before = {};
    for (const p of paths) before[p] = setHas(p) ? setVal(p) : undefined;
    let r;
    if (wall) {
      const body = { v: 1 };
      for (const p of paths) {
        const [sec, k] = p.split('.');
        if (!body[sec]) body[sec] = clone(W[sec]);
        if (changes[p] === undefined) delete body[sec][k]; else body[sec][k] = clone(changes[p]);
      }
      r = await call('PUT', 'settings', body);
      if (r.status === 200) W = r.json;
    } else {
      const set = {}, reset = [];
      for (const p of paths) { if (changes[p] === undefined) reset.push(p); else set[p] = clone(changes[p]); }
      r = await call('PATCH', 'admin/settings', { v: 1, set, reset });
      if (r.status === 200) A = r.json;
    }
    if (r.status === 401) { signedOut(); return false; }
    if (r.status !== 200) {
      const problems = Array.isArray(r.json.problems) && r.json.problems.length ? r.json.problems : [r.json.error || 'the server refused it (' + r.status + ')'];
      st.refused = { ctx: o.ctx, shown: o.shown, problems, keep: o.keep };
      st.toast = null; st.reveal = true; render(); return false;
    }
    st.refused = null;
    st.toast = { say: o.say, wall, before, phase: 'saved', version: wall ? null : A.version };
    clearTimeout(toastTimer);
    if (wall) toastTimer = setTimeout(() => { if (st.toast && st.toast.wall) { st.toast.phase = 'used'; render(); } }, 2500);
    else soon();
    if (o.after) o.after();
    render();
    return true;
  }
  function undo() { const b = st.toast.before; st.toast = null; apply(b, { say: 'Put back as it was' }); }

  /* ---- Words for values ------------------------------------------------------------------------- */
  const isInt = v => typeof v === 'number' && Number.isInteger(v);
  function human(s) {
    if (!isInt(s) || s < 60) return '';
    const d = [[86400, 'day'], [3600, 'hour'], [60, 'minute']].find(([n]) => s % n === 0);
    if (!d) return s >= 120 ? 'about ' + Math.round(s / 60) + ' minutes' : '';
    const n = s / d[0];
    return n + ' ' + d[1] + (n === 1 ? '' : 's');
  }
  function words(v, s) {
    if (v === null || v === undefined) return s && s.table === 'look' ? 'as drawn' : 'none';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (Array.isArray(v)) return v.length ? v.map(x => (x && typeof x === 'object' ? Object.values(x).join(' at ') : String(x))).join(', ') : 'none';
    if (s && s.type === 'number' && Number.isInteger(v)) return v.toFixed(1);
    return String(v);
  }
  const secs = n => human(n) || n + ' seconds';
  const short = t => (t.length > 34 ? t.slice(0, 32) + '...' : t);
  const unitOf = s => (s.unit === 'seconds' ? 'seconds' : s.unit === 'percent' ? 'percent' : s.unit === 'hours' ? 'hours' : s.unit === 'bytes' ? 'bytes' : s.unit === 'minutes' ? 'minutes' : '');
  function sayChange(label, v, s) { const u = s ? unitOf(s) : ''; return label + ': ' + short(words(v, s)) + (u && typeof v === 'number' ? ' ' + u : ''); }
  /* Seconds from an ISO time to the server's now. */
  const ageOf = iso => { const t = Date.parse(iso), n = Date.parse(A.now); return Number.isFinite(t) && Number.isFinite(n) ? Math.max(0, Math.round((n - t) / 1000)) : null; };
  function ago(s) { return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; }
  function span(s) {
    if (s < 90) return s + ' seconds';
    if (s < 5400) return Math.round(s / 60) + ' minutes';
    if (s < 129600) return Math.round(s / 3600) + ' hours';
    return Math.round(s / 86400) + ' days';
  }
  const two = n => (n < 10 ? '0' : '') + n;
  function clockOf(iso) { const d = new Date(iso); return Number.isFinite(d.getTime()) ? two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()) : '?'; }

  /* What was typed into a number field, as the file would hold it: a whole number as an integer,
     a decimal as a number, anything else as the text typed, which the server then refuses. */
  function typed(s, text) {
    const t = text.trim();
    if (/^-?\d+$/.test(t)) return s.type === 'number' ? parseFloat(t) : parseInt(t, 10);
    if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
    return t;
  }

  /* ---- Rows ------------------------------------------------------------------------------------- */
  const refusedHere = ctx => st.refused && st.refused.ctx === ctx;
  function msgBox(extra) {
    const m = el('div', 'msg'), p = st.refused.problems;
    m.setAttribute('role', 'alert');
    const line = el('div'); line.appendChild(document.createTextNode('Not saved: ')); line.appendChild(el('code', '', p[0])); m.appendChild(line);
    for (const more of p.slice(1, 4)) { const l = el('div'); l.appendChild(document.createTextNode('Also: ')); l.appendChild(el('code', '', more)); m.appendChild(l); }
    if (p.length > 4) m.appendChild(el('div', '', 'And ' + (p.length - 4) + ' more.'));
    if (extra) m.appendChild(extra);
    const acts = el('div', 'acts');
    acts.appendChild(btn('btn small', st.refused.keep !== undefined ? 'Put back ' + short(st.refused.keep) : 'Dismiss', () => { st.refused = null; render(); }));
    m.appendChild(acts);
    return m;
  }
  function where(path, s) {
    const w = el('div', 'where'), f = from(path);
    if (f === 'set') {
      w.appendChild(el('span', 'from set', 'Set here'));
      const u = under(path);
      w.appendChild(el('span', 'file-has', (u.where === 'file' ? 'config.toml has ' : 'The default is ') + short(words(u.v, s))));
      const b = btn('reset', 'Reset', () => apply({ [path]: undefined }, { ctx: path, say: (s ? s.gui.admin.label : 'The list') + ' back to ' + (u.where === 'file' ? 'config.toml' : 'the default') + ': ' + short(words(u.v, s)) }));
      b.setAttribute('aria-label', 'Reset to ' + (u.where === 'file' ? "config.toml's " : 'the default, ') + words(u.v, s));
      w.appendChild(b);
    } else w.appendChild(el('span', 'from ' + (f === 'file' ? 'file' : ''), f === 'file' ? 'config.toml' : 'Default'));
    return w;
  }
  /* One setting: its label and key, its control and help, where it comes from. */
  function row(path, control, o) {
    const s = SPEC[path], opt = o || {}, r = el('div', 'row' + (opt.stack ? ' stack' : '')), ctx = opt.ctx || path;
    if (from(path) === 'set') r.classList.add('set');
    if (refusedHere(ctx)) r.classList.add('refused');
    const lab = el('div', 'lab'); lab.appendChild(el('b', '', opt.label || s.gui.admin.label)); lab.appendChild(el('code', '', opt.key || s.key)); r.appendChild(lab);
    const ctl = el('div', 'ctl'); ctl.appendChild(control || controlFor(path, s)); if (s.help && !opt.noHelp) ctl.appendChild(rich('p', 'help', opt.help || s.help));
    if (opt.extra) ctl.appendChild(opt.extra);
    r.appendChild(ctl);
    r.appendChild(opt.where === null ? el('div', 'where') : where(path, s));
    if (refusedHere(ctx)) r.appendChild(msgBox(opt.msgExtra));
    r.dataset.ctx = ctx;
    return r;
  }
  function sw(on, flip, label, disabled) {
    const b = btn('sw', '', flip); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on)); if (label) b.setAttribute('aria-label', label);
    const tr = el('span', 'tr'); tr.appendChild(el('span', 'kn')); b.appendChild(tr); b.appendChild(el('span', '', on ? 'On' : 'Off'));
    if (disabled) b.disabled = true;
    return b;
  }
  function seg(choices, cur, pick) {
    const g = el('div', 'seg');
    for (const [v, text] of choices) { const b = btn('', text, () => pick(v)); b.setAttribute('aria-pressed', String(v === cur)); g.appendChild(b); }
    return g;
  }
  function textIn(cls, value, commit, shown, label) {
    const i = el('input', 'in ' + cls); i.type = 'text'; i.value = shown !== undefined ? shown : value; i.spellcheck = false; i.autocomplete = 'off';
    if (label) i.setAttribute('aria-label', label);
    if (shown !== undefined) i.classList.add('bad');
    // A refused value shows as typed, and is sent again only once it is changed.
    const sent = shown !== undefined ? String(shown) : String(value);
    let done = false;
    const go = () => { if (done) return; if (i.value !== sent) { done = true; commit(i.value); } };
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') { i.value = value; i.blur(); } });
    i.addEventListener('blur', () => { go(); if (st.dirty) setTimeout(() => { if (!editing()) render(); }, 0); });
    return i;
  }
  /* A field being typed in is never redrawn under the cursor: a poll that brings news waits. */
  const editing = () => { const a = document.activeElement; return !!(a && root.contains(a) && a.tagName === 'INPUT'); };
  /* The change a field makes: for a source config.toml does not set up, the first value set here
     creates its table turned off, so that it is turned on, and checked whole, on its own. */
  function changeOf(path, nv) {
    const ch = { [path]: nv }, m = /^sources\.([a-z_]+)\.(.+)$/.exec(path);
    if (m && m[2] !== 'enabled' && !srcThere(m[1])) ch['sources.' + m[1] + '.enabled'] = false;
    return ch;
  }
  /* The control a setting's type calls for, applying each change once it passes the check. */
  function controlFor(path, s) {
    const v = val(path), label = s.gui.admin.label, shown = refusedHere(path) ? st.refused.shown : undefined;
    const set = (nv, text) => apply(changeOf(path, nv), { ctx: path, shown: text !== undefined ? text : nv, keep: words(v, s), say: sayChange(label, nv, s) });
    if (s.editable === false) {
      const l = el('div', 'line'); l.appendChild(el('span', 'ro', words(v, s)));
      l.appendChild(el('span', 'ro-note', /compose\.yaml mounts|mounted/.test(s.help) ? 'Fixed by the mounts in compose.yaml.' : 'Not changed here.'));
      return l;
    }
    if (s.type === 'boolean') return sw(v, () => set(!v), label);
    if (s.values && s.type !== 'list') return seg(s.values.map(x => [x, String(x)]), v, nv => set(nv));
    if (s.type === 'integer' || s.type === 'number') {
      const l = el('div', 'line'), i = textIn('num', words(v, s), t => set(typed(s, t), t), shown, label);
      i.inputMode = s.type === 'integer' ? 'numeric' : 'decimal'; l.appendChild(i);
      const u = unitOf(s), hm = human(v);
      if (u) { const us = el('span', 'unit', u); if (hm && u === 'seconds') us.appendChild(el('i', '', ' (' + hm + ')')); l.appendChild(us); }
      return l;
    }
    if (s.type === 'string') {
      const wide = /url|pattern/.test(s.key) || s.key === 'host';
      return textIn(wide ? 'wide' : 'mid', v === null ? '' : v, t => set(t.trim()), shown, label);
    }
    if (s.type === 'list' && s.items === 'string') return chipList(v, nv => set(nv), shown, label);
    if (s.type === 'list' && s.items === 'integer') {
      return textIn('mid', v.join(', '), t => set(t.split(/[\s,]+/).filter(Boolean).map(x => (/^\d+$/.test(x) ? parseInt(x, 10) : x)), t), shown, label);
    }
    if (s.type === 'list' && s.items === 'table') return tableList(s.item_keys, v, nv => set(nv));
    return el('span', 'ro', words(v, s));
  }
  function chipList(list, commit, shown, label) {
    const c = el('div', 'chips');
    list.forEach((x, i) => { const ch = el('span', 'chip', x); const b = btn('', 'Remove', () => commit(list.filter((_, j) => j !== i))); b.setAttribute('aria-label', 'Remove ' + x); ch.appendChild(b); c.appendChild(ch); });
    const add = el('input', 'in'); add.type = 'text'; add.placeholder = 'Add one, then Enter'; add.spellcheck = false; add.autocomplete = 'off';
    if (label) add.setAttribute('aria-label', 'Add to ' + label);
    if (shown !== undefined && !Array.isArray(shown)) { add.value = shown; add.classList.add('bad'); }
    add.addEventListener('keydown', e => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); commit(list.concat([add.value.trim()])); } });
    c.appendChild(add);
    return c;
  }
  function tableList(keys, list, commit) {
    const t = el('div', 'tbl'), hd = el('div', 'tr2 hd');
    for (const k of keys) hd.appendChild(el('span', '', k)); hd.appendChild(el('span', '', '')); t.appendChild(hd);
    list.forEach((item, i) => {
      const r = el('div', 'tr2');
      for (const k of keys) r.appendChild(textIn('', item[k] || '', x => commit(list.map((it, j) => (j === i ? Object.assign({}, it, { [k]: x }) : it))), undefined, k));
      r.appendChild(btn('btn small', 'Remove', () => commit(list.filter((_, j) => j !== i))));
      t.appendChild(r);
    });
    const blank = {}; for (const k of keys) blank[k] = '';
    const add = btn('btn small', 'Add a row', () => {
      const r = el('div', 'tr2');
      for (const k of keys) r.appendChild(textIn('', '', x => { blank[k] = x; if (keys.every(kk => blank[kk])) commit(list.concat([Object.assign({}, blank)])); }, undefined, k));
      t.insertBefore(r, t.lastChild);
    });
    add.classList.add('start');
    t.appendChild(add);
    return t;
  }
  function card(title, id, help) {
    const c = el('section', 'card'), h = el('h2', '', title);
    if (id) h.appendChild(el('span', 'id', id));
    c.appendChild(h);
    if (help) c.appendChild(rich('p', 'ghelp', help));
    return c;
  }

  /* ---- The sections ------------------------------------------------------------------------------ */
  const setCount = pre => (WALL.includes(pre) ? Object.keys(W[pre] || {}).length : Object.keys(A.set).filter(p => p === pre || p.startsWith(pre + '.')).length);
  const failing = () => SOURCES.filter(n => srcOn(n) && status() && status().sources[n] && !status().sources[n].ok);
  const PAGES = [
    { id: 'collector', name: 'Collector', count: () => setCount('collector') },
    { id: 'conditions', name: 'Conditions', count: () => setCount('conditions') },
    { id: 'sources', name: 'Sources', count: () => setCount('sources'), bad: () => failing().length },
    { id: 'devices', name: 'Devices', count: () => setCount('device') },
    { id: 'look', name: 'Household look', count: () => setCount('look') },
    { id: 'display', name: 'Household display', count: () => setCount('display') },
    { id: 'quiet', name: 'Quiet scenes', count: () => setCount('quiet') },
    { id: 'scenes', name: 'Scenes', count: () => setCount('scenes') },
    { id: 'env', name: '.env', count: () => 0, bad: () => missingNeeded().length }
  ];
  const missingNeeded = () => CREDS.filter(e => srcOn(e.source) && credState(varOf(val('sources.' + e.source + '.secret') || e.secret, e.field)) === false);
  function countWords(p) {
    const n = p.count(), b = p.bad ? p.bad() : 0;
    if (b) return [p.id === 'env' ? b + ' missing' : b + ' failing', true];
    return n ? [n + ' set here', false] : ['', false];
  }

  const INTRO = {
    collector: 'How the collector runs. A change here is checked as config.toml is checked, then used from the collector\'s next poll; nothing needs restarting.',
    conditions: 'When each condition is raised, and which wins when several are. A condition left out of the priority is never raised.',
    sources: 'What the collector reads. Each source is on or off, with its address, its pace and its own options. Credentials are never typed here: each source that needs one says whether .env holds it.',
    devices: 'Machines on the network to watch, each checked at its own pace and drawn as a prop in the scene. The first Pi, the first three cameras and the first three others are drawn, in this order.',
    look: 'The world, the knight, the monarch at court and the cast, for every display, from every world whose pack is loaded. These are the same settings as each wall\'s settings screen: a change here shows on every wall within about five seconds, and a choice made on a wall shows here as Set here.',
    display: 'How every display shows the words. The same settings as each wall\'s settings screen.',
    quiet: 'The scenes that take turns while all is quiet, for every display. The same settings as each wall\'s settings screen.',
    scenes: 'Where the knight acts out the conditions that more than one scene can play. The same settings as each wall\'s settings screen.',
    env: 'What .env holds, by name. Its values never reach this page: the credentials go to the collector alone, and the admin page is told only whether each is there. Change .env beside compose.yaml, then run docker compose up -d.'
  };

  function pageCollector(m) {
    const c = card('Collector', '[collector]', TABLES.collector.help);
    for (const s of TABLES.collector.settings) c.appendChild(row('collector.' + s.key));
    m.appendChild(c);
  }

  function priorityEditor() {
    const path = 'conditions.priority', cur = val(path), shown = refusedHere(path) && Array.isArray(st.refused.shown) ? st.refused.shown : null, list = shown || cur;
    const ol = el('ol', 'prio'), ids = list.concat(PRIORITY.filter(x => !list.includes(x)));
    const commit = (nl, say) => apply({ [path]: nl }, { ctx: path, shown: nl, say });
    ids.forEach(id => {
      const i = list.indexOf(id), li = el('li', i < 0 ? 'out' : ''), name = COND[id].name;
      li.appendChild(el('span', 'pos', i < 0 ? '' : String(i + 1)));
      const nm = el('span', 'nm'); nm.appendChild(el('b', '', name)); nm.appendChild(el('code', '', id)); li.appendChild(nm);
      const mv = el('span', 'mv');
      const up = btn('', '▲', () => { const nl = cur.slice(); const j = nl.indexOf(id); [nl[j - 1], nl[j]] = [nl[j], nl[j - 1]]; commit(nl, name + ' moved up to ' + j); });
      const dn = btn('', '▼', () => { const nl = cur.slice(); const j = nl.indexOf(id); [nl[j + 1], nl[j]] = [nl[j], nl[j + 1]]; commit(nl, name + ' moved down to ' + (j + 2)); });
      up.setAttribute('aria-label', 'Move ' + name + ' up'); dn.setAttribute('aria-label', 'Move ' + name + ' down');
      up.disabled = cur.indexOf(id) <= 0; dn.disabled = cur.indexOf(id) < 0 || cur.indexOf(id) === cur.length - 1;
      mv.appendChild(up); mv.appendChild(dn); li.appendChild(mv);
      const inCur = cur.includes(id);
      li.appendChild(sw(i >= 0, () => commit(inCur ? cur.filter(x => x !== id) : cur.concat([id]), name + (inCur ? ' left out: never raised' : ' added to the priority')), 'In the priority: ' + name));
      ol.appendChild(li);
    });
    return ol;
  }
  function pageConditions(m) {
    const c = card('Conditions', '[conditions]', TABLES.conditions.help);
    const hint = refusedHere('conditions.priority') && /device_down/.test(st.refused.problems[0]) ? rich('div', 'hint', 'Leave device_down in the list, or open Devices and set Alerts off on each.') : null;
    c.appendChild(row('conditions.priority', priorityEditor(), { stack: true, msgExtra: hint }));
    c.appendChild(row('conditions.clear_after_s'));
    m.appendChild(c);
    for (const t of S.tables.filter(x => x.table.startsWith('conditions.'))) {
      const id = t.table.slice(11), title = t.settings.length ? groupOf(t.settings[0].gui.admin.section) : COND[id].name;
      const k = card(title, '[' + t.table + ']', t.help);
      for (const s of t.settings) k.appendChild(row(t.table + '.' + s.key));
      m.appendChild(k);
    }
  }

  function srcTag(n, on) {
    const stt = status() && status().sources[n];
    if (!srcThere(n)) return el('span', 'tag off', 'Not in config.toml');
    if (!on) return el('span', 'tag off', 'Off');
    if (!stt) return el('span', 'tag', 'Not read yet');
    const age = ageOf(stt.at);
    if (stt.ok) return el('span', 'tag ok', 'Reading, last ' + (age === null ? 'read at ' + clockOf(stt.at) : ago(age)));
    return el('span', 'tag bad', 'Failing: ' + (stt.error || 'no reason given') + (age === null ? '' : ', tried ' + ago(age)));
  }
  function credTag(v, on) {
    const ok = credState(v);
    if (ok === null) return el('span', 'tag key off', v + ' not reported');
    return el('span', 'tag key ' + (ok ? 'ok' : on ? 'bad' : 'off'), v + (ok ? ' in .env' : ' missing'));
  }
  function srcCard(n) {
    const t = TABLES['sources.' + n], ep = 'sources.' + n + '.enabled', there = srcThere(n), on = srcOn(n);
    const title = groupOf(t.settings[0].gui.admin.section), open = !!st.open[n] || (st.refused && String(st.refused.ctx).startsWith('sources.' + n));
    const c = el('section', 'card src' + (on ? '' : ' off') + (open ? '' : ' closed')); c.dataset.ctx = 'sources.' + n;
    const head = el('div', 'head'), left = el('div');
    const h = el('h2', '', title); h.appendChild(el('span', 'id', '[sources.' + n + ']')); left.appendChild(h);
    left.appendChild(el('div', 'what', t.help));
    const tags = el('div', 'state');
    tags.appendChild(srcTag(n, on));
    if (there && !has(file().sources || {}, n)) tags.appendChild(el('span', 'tag set', 'Set up here'));
    const secret = val('sources.' + n + '.secret');
    for (const e of needs(n)) tags.appendChild(credTag(varOf(secret || e.secret, e.field), on));
    left.appendChild(tags);
    head.appendChild(left);
    const oc = el('div', 'on-col');
    oc.appendChild(sw(on, () => { st.open[n] = true; apply({ [ep]: !on }, { ctx: 'sources.' + n, say: title + (on ? ' turned off' : ' turned on') }); }, title + ' on'));
    if (from(ep) === 'set') oc.appendChild(where(ep, SPEC[ep]));
    head.appendChild(oc);
    const ob = btn('btn small open-btn', open ? 'Close' : 'Edit', () => { st.open[n] = !open; if (open && st.refused && String(st.refused.ctx).startsWith('sources.' + n)) st.refused = null; render(); });
    ob.setAttribute('aria-expanded', String(open));
    head.appendChild(ob);
    c.appendChild(head);
    if (refusedHere('sources.' + n)) {
      const e = needs(n).find(x => credState(varOf(secret || x.secret, x.field)) === false);
      let extra = null;
      if (e) { extra = el('div', 'hint'); extra.appendChild(rich('div', '', 'Add `' + varOf(secret || e.secret, e.field) + '` to .env beside compose.yaml (.env.example shows it), then run `docker compose up -d`. ' + e.help)); }
      const holder = el('div', 'src-msg'); holder.appendChild(msgBox(extra)); c.appendChild(holder);
    }
    const rows = el('div', 'rows');
    for (const s of t.settings) {
      if (s.key === 'enabled') continue;
      const p = 'sources.' + n + '.' + s.key;
      if (s.key === 'secret') {
        const box = el('div');
        for (const e of needs(n)) {
          const v = varOf(secret || e.secret, e.field), ok = credState(v), l = el('div', 'line cred');
          l.appendChild(credTag(v, on));
          l.appendChild(el('span', 'ro-note', ok === null ? 'The collector has not said whether .env holds it.' : ok ? 'In .env. Its value is never shown here.' : 'Not in .env. ' + (e.form ? 'It takes ' + e.form + '.' : '')));
          box.appendChild(l);
          if (ok === false) box.appendChild(rich('p', 'help', e.help + ' Add it to .env beside compose.yaml, as .env.example shows, then run `docker compose up -d`.'));
        }
        box.appendChild(rich('p', 'help', s.help));
        rows.appendChild(row(p, box, { noHelp: true }));
      } else rows.appendChild(row(p));
    }
    c.appendChild(rows);
    return c;
  }
  function pageSources(m) { for (const n of SOURCES) m.appendChild(srcCard(n)); }

  /* ---- Devices ---------------------------------------------------------------------------- */
  const devices = () => val('device') || [];
  function checkWords(t) {
    if (has(t, 'url')) return t.url;
    const ps = has(t, 'port') ? [t.port] : t.ports || [];
    return (t.host || '?') + (ps.length ? (ps.length === 1 ? ' port ' : ' ports ') + ps.join(', ') : '');
  }
  function paceWords(t) {
    const e = has(t, 'every_s') ? t.every_s : 30, d = has(t, 'down_after_s') ? t.down_after_s : 180;
    return 'Checked every ' + secs(e) + ', down after ' + secs(d) + ' of silence';
  }
  function stateTag(name, t) {
    if (t && t.enabled === false) return el('span', 'tag off', 'Off');
    const x = status() && status().devices.find(y => y && y.name === name);
    if (!x) return el('span', 'tag', 'First check due');
    const age = x.since ? ageOf(x.since) : null;
    if (x.state === 'up') return el('span', 'tag ok', age === null ? 'Up' : 'Up for ' + span(age));
    if (x.state === 'down') return el('span', 'tag ' + (x.alert === false ? 'off' : 'bad'), age === null ? 'Down' : 'Down for ' + span(age));
    return el('span', 'tag', 'Not answered yet');
  }
  const KIND_WORD = { pi: 'Pi', camera: 'camera', machine: 'machine', vm: 'virtual machine' };
  function deviceRow(t, i, list) {
    const legacy = i < 0, r = el('div', 'device' + (t.enabled === false ? ' off' : '') + (legacy ? ' legacy' : '') + (st.edit === i ? ' editing' : ''));
    const mv = el('span', 'mv');
    if (!legacy) {
      const move = d => { const nl = list.slice(); [nl[i + d], nl[i]] = [nl[i], nl[i + d]]; if (st.edit === i) st.edit = i + d; apply({ device: nl }, { ctx: 'device', say: t.name + ' moved ' + (d < 0 ? 'up' : 'down') }); };
      const up = btn('', '▲', () => move(-1)), dn = btn('', '▼', () => move(1));
      up.disabled = i === 0; dn.disabled = i === list.length - 1;
      up.setAttribute('aria-label', 'Move ' + t.name + ' up'); dn.setAttribute('aria-label', 'Move ' + t.name + ' down');
      mv.appendChild(up); mv.appendChild(dn);
    }
    r.appendChild(mv);
    const nm = el('div', 'nm'); nm.appendChild(el('b', '', t.name));
    nm.appendChild(el('span', '', legacy ? 'Pi, from Sources: Pi' : cap(KIND_WORD[t.kind] || String(t.kind)) + (t.alert === false ? ', never alerts' : ', alerts')));
    r.appendChild(nm);
    const chk = el('div', 'chk', checkWords(t)); chk.appendChild(el('small', '', legacy ? 'Checked every ' + secs(t.every_s || 30) + ', silent after ' + secs(val('conditions.pi_silent.for_s')) : paceWords(t)));
    r.appendChild(chk);
    const sx = el('div', 'stt'); sx.appendChild(stateTag(t.name, t)); r.appendChild(sx);
    const acts = el('div', 'acts2');
    if (legacy) acts.appendChild(btn('btn small', 'Open in Sources', () => { go('sources'); st.open.pi = true; render(true); }));
    else acts.appendChild(btn('btn small', st.edit === i ? 'Close' : 'Edit', () => { st.edit = st.edit === i ? null : i; st.confirm = null; render(); }));
    r.appendChild(acts);
    return r;
  }
  /* One field of a device: applied at once to the list (an existing device), or kept in the draft. */
  function deviceField(t, i, key, control, o) {
    const s = SPEC['device.' + key], opt = o || {}, ctx = 'device:' + i + ':' + key;
    const r = el('div', 'row'); if (refusedHere(ctx) || (opt.keys && opt.keys.some(k => refusedHere('device:' + i + ':' + k)))) r.classList.add('refused');
    const lab = el('div', 'lab'); lab.appendChild(el('b', '', opt.label || s.gui.admin.label)); lab.appendChild(el('code', '', opt.key || key)); r.appendChild(lab);
    const ctl = el('div', 'ctl'); ctl.appendChild(control); ctl.appendChild(rich('p', 'help', opt.help || s.help)); r.appendChild(ctl);
    const w = el('div', 'where'); const present = (opt.keys || [key]).some(k => has(t, k));
    w.appendChild(el('span', 'from', present ? '' : 'Default')); r.appendChild(w);
    const here = [key].concat(opt.keys || []).find(k => refusedHere('device:' + i + ':' + k));
    if (here) r.appendChild(msgBox());
    r.dataset.ctx = ctx;
    return r;
  }
  function editor(t, i) {
    const draft = i === 'new', list = devices(), idx = draft ? list.length : i;
    const box = el('div', 'editor'), hd = el('div', 'ehead'); box.dataset.ctx = 'editor';
    hd.appendChild(el('h3', '', draft ? 'A new device' : t.name));
    const sp = el('div', 'sp');
    if (!draft) sp.appendChild(btn('btn small danger', 'Remove', () => { st.confirm = i; render(); }));
    hd.appendChild(sp); box.appendChild(hd);
    if (st.confirm === i) {
      const m = el('div', 'msg info inset');
      m.appendChild(el('div', '', 'Remove ' + t.name + ' from the devices? Its record in the state file goes with it, and starts afresh if it is added again.'));
      const a = el('div', 'acts');
      a.appendChild(btn('btn small danger', 'Remove ' + t.name, () => { st.edit = null; st.confirm = null; apply({ device: list.filter((_, j) => j !== i) }, { ctx: 'device', say: t.name + ' removed' }); }));
      a.appendChild(btn('btn small', 'Keep it', () => { st.confirm = null; render(); }));
      m.appendChild(a); box.appendChild(m);
    }
    const shownT = st.refused && st.refused.device && st.refused.deviceIndex === idx ? st.refused.device : t;
    // A change to one field: the device with it, applied to the list, or kept in the draft.
    const change = (patch, drop, field, text) => {
      const nt = Object.assign({}, shownT, patch); for (const k of drop || []) delete nt[k];
      if (draft) { st.draft = nt; st.refused = null; render(); return; }
      const nl = list.map((x, j) => (j === i ? nt : x)), ctx = 'device:' + idx + ':' + field;
      apply({ device: nl }, { ctx, say: t.name + ', ' + sayChange(SPEC['device.' + field].gui.admin.label, patch[field] !== undefined ? patch[field] : 'default', SPEC['device.' + field]) })
        .then(ok => { if (!ok && st.refused) { st.refused.device = nt; st.refused.deviceIndex = idx; st.refused.shownText = text; render(); } });
    };
    const fieldText = key => (st.refused && st.refused.ctx === 'device:' + idx + ':' + key && st.refused.shownText !== undefined ? st.refused.shownText : undefined);
    const num = (key, def) => {
      const cur = has(shownT, key) ? shownT[key] : def, l = el('div', 'line'), i2 = textIn('num', String(cur), x => change({ [key]: typed(SPEC['device.' + key], x) }, [], key, x), fieldText(key), SPEC['device.' + key].gui.admin.label);
      l.appendChild(i2); const u = el('span', 'unit', 'seconds'); const hm = human(cur); if (hm) u.appendChild(el('i', '', ' (' + hm + ')')); l.appendChild(u); return l;
    };
    const flag = (key, def) => { const cur = has(shownT, key) ? shownT[key] : def; return sw(cur, () => change({ [key]: !cur }, [], key), SPEC['device.' + key].gui.admin.label); };
    box.appendChild(deviceField(t, idx, 'name', textIn('mid', shownT.name || '', x => change({ name: x.trim() }, [], 'name', x), fieldText('name'), 'Name')));
    box.appendChild(deviceField(t, idx, 'kind', seg(SPEC['device.kind'].values.map(k => [k, k]), shownT.kind, k => change({ kind: k }, [], 'kind'))));
    const mode = st.mode[idx] || (has(shownT, 'url') ? 'url' : 'tcp');
    const modeRow = el('div', 'row'), ml = el('div', 'lab'); ml.appendChild(el('b', '', 'Check')); ml.appendChild(el('code', '', 'host or url')); modeRow.appendChild(ml);
    const mc = el('div', 'ctl'); mc.appendChild(seg([['tcp', 'Address and ports'], ['url', 'Web address']], mode, md => { st.mode[idx] = md; render(); }));
    mc.appendChild(rich('p', 'help', 'A device has exactly one check: an address with one or more ports, or a web address.')); modeRow.appendChild(mc); modeRow.appendChild(el('div', 'where'));
    box.appendChild(modeRow);
    if (mode === 'tcp') {
      const ports = has(shownT, 'port') ? [shownT.port] : shownT.ports || [];
      box.appendChild(deviceField(t, idx, 'host', textIn('mid', shownT.host || '', x => change({ host: x.trim() }, ['url', 'verify_tls'], 'host', x), fieldText('host'), 'Host')));
      box.appendChild(deviceField(t, idx, 'ports', textIn('mid', ports.join(', '), x => {
        const ps = x.split(/[\s,]+/).filter(Boolean).map(y => (/^\d+$/.test(y) ? parseInt(y, 10) : y));
        change(ps.length === 1 ? { port: ps[0] } : { ports: ps }, ps.length === 1 ? ['ports', 'url', 'verify_tls'] : ['port', 'url', 'verify_tls'], ps.length === 1 ? 'port' : 'ports', x);
      }, fieldText('ports') || fieldText('port'), 'Ports'), { keys: ['port', 'ports'], key: 'port or ports', help: SPEC['device.ports'].help + ' One port is written as port.' }));
      box.appendChild(deviceField(t, idx, 'refused_counts', flag('refused_counts', false)));
    } else {
      box.appendChild(deviceField(t, idx, 'url', textIn('wide', shownT.url || '', x => change({ url: x.trim() }, ['host', 'port', 'ports', 'refused_counts'].concat(/^https:/.test(x.trim()) ? [] : ['verify_tls']), 'url', x), fieldText('url'), 'Web address')));
      if (/^https:/.test(shownT.url || '')) box.appendChild(deviceField(t, idx, 'verify_tls', flag('verify_tls', false)));
    }
    box.appendChild(deviceField(t, idx, 'every_s', num('every_s', 30)));
    box.appendChild(deviceField(t, idx, 'down_after_s', num('down_after_s', 180)));
    box.appendChild(deviceField(t, idx, 'alert', flag('alert', true)));
    box.appendChild(deviceField(t, idx, 'enabled', flag('enabled', true)));
    const f = el('div', 'efoot');
    if (draft) {
      if (refusedHere('device:new')) { const hold = el('div', 'full'); hold.appendChild(msgBox()); f.appendChild(hold); }
      f.appendChild(btn('btn gold', 'Add to the list', () => {
        apply({ device: list.concat([st.draft]) }, { ctx: 'device:new', say: (st.draft.name || 'A device') + ' added', after: () => { st.draft = null; } });
      }));
      f.appendChild(btn('btn', 'Cancel', () => { st.draft = null; st.refused = null; render(); }));
      f.appendChild(el('p', '', 'A new device is checked whole when it is added, since a half-filled one cannot pass. Every other change on this page applies at once.'));
    } else f.appendChild(el('p', '', 'Each change applies at once once it is checked. The collector checks the device from its next poll.'));
    box.appendChild(f);
    return box;
  }
  function pageDevices(m) {
    const list = devices(), f = from('device'), lh = el('div', 'listhead' + (f === 'set' ? ' set' : ''));
    const say = el('div'), inFile = (file().device || []).length;
    if (f === 'set') { say.appendChild(el('span', 'from set', 'Set here. ')); say.appendChild(document.createTextNode('This list replaces the ' + inFile + ' device' + (inFile === 1 ? '' : 's') + ' in config.toml. ')); }
    else say.appendChild(document.createTextNode(f === 'file' ? 'The list is config.toml\'s. ' : 'No devices in config.toml. '));
    const n = list.filter(x => x.enabled !== false).length + (srcOn('pi') ? 1 : 0);
    say.appendChild(el('b', '', n + ' of 32 in use')); say.appendChild(document.createTextNode(', the Pi of Sources: Pi included.'));
    lh.appendChild(say);
    const spx = el('div', 'sp');
    if (f === 'set') spx.appendChild(btn('btn small line', 'Reset to config.toml\'s list', () => apply({ device: undefined }, { ctx: 'device', say: 'The devices back to config.toml\'s ' + inFile })));
    lh.appendChild(spx);
    m.appendChild(lh);
    m.appendChild(rich('p', 'intro', TABLES.device.help));
    const box = el('div', 'devices');
    if (srcOn('pi')) box.appendChild(deviceRow({ name: 'Pi', kind: 'pi', host: val('sources.pi.host'), ports: val('sources.pi.ports'), every_s: val('sources.pi.every_s') }, -1, list));
    list.forEach((t, i) => { box.appendChild(deviceRow(t, i, list)); if (st.edit === i) box.appendChild(editor(t, i)); });
    if (st.draft) box.appendChild(editor(st.draft, 'new'));
    if (!box.childNodes.length) box.appendChild(el('p', 'empty', 'Nothing watched yet. Add a device below.'));
    m.appendChild(box);
    if (refusedHere('device')) { const h = el('div', 'gap'); h.appendChild(msgBox()); m.appendChild(h); }
    if (!st.draft) { const a = btn('btn gold gap', 'Add a device', () => { st.draft = { kind: 'machine' }; st.edit = null; st.scrollTo = 'editor'; render(); }); m.appendChild(a); }
  }

  /* ---- The household look, display, quiet scenes and scenes ------------------------------------ */
  function bandsCss(entries) {
    let list = entries.face;
    if (!list) { const ks = Object.keys(entries).filter(k => /^\d$/.test(k)); list = ks.map((k, i) => [(i + 1) / ks.length, entries[k]]); }
    let p = 0;
    return 'linear-gradient(90deg,' + list.map(([f, c]) => { const s = c + ' ' + (p * 100).toFixed(1) + '% ' + (f * 100).toFixed(1) + '%'; p = f; return s; }).join(',') + ')';
  }
  /* What a display would resolve, in KW.settings' shape: values and the level each came from. */
  function resolved() {
    const values = {}, fromL = {};
    for (const sec of WALL) {
      values[sec] = {}; fromL[sec] = {};
      for (const s of TABLES[sec].settings) { const p = sec + '.' + s.key; values[sec][s.key] = val(p); fromL[sec][s.key] = from(p) === 'set' ? 'saved' : from(p) === 'file' ? 'defaults' : 'built-in'; }
    }
    return { values, from: fromL };
  }
  function optRow(path, choices) {
    const s = SPEC[path], cur = val(path), g = el('div', 'opts');
    for (const c of choices) {
      const b = btn('opt' + (c.kind ? ' ' + c.kind : ''), '', () => { if (c.id === cur) return; apply({ [path]: c.id === null ? undefined : c.id }, { ctx: path, say: sayChange(s.gui.admin.label, c.id === null ? 'as drawn' : c.name || c.chip, null) }); });
      b.setAttribute('aria-pressed', String(c.id === cur));
      b.setAttribute('aria-label', s.gui.admin.label + ': ' + (c.name || c.chip));
      const chip = el('span', 'c', c.chip || ''); if (c.fill) chip.style.background = c.fill; if (c.node) chip.appendChild(c.node); b.appendChild(chip);
      if (c.name) b.appendChild(el('span', '', c.name));
      if (c.def) b.appendChild(el('span', 'def', c.def));
      g.appendChild(b);
    }
    return g;
  }
  /* The household look as every wall resolves it: a store of the walls' own settings code over the
     shared settings and config.toml's tables, with the packs this page has loaded, so that the
     world, the parts it gives and what differs from it are worked out exactly as on a wall. */
  let LOOK = null;
  function lookStore() {
    if (!LOOK) LOOK = KW.settings.create({ storage: () => null, pack: () => PACK, world: KW.settings.pageWorld, say: () => {} });
    if (W) LOOK.shared(W);
    const f = file(), d = {};
    for (const sec of WALL) if (has(f, sec)) d[sec] = f[sec];
    LOOK.defaults(Object.keys(d).length ? d : null);
    return LOOK;
  }
  /* A world's card: its picture scene with the knight as the world has it, painted once. */
  function worldCard(id) {
    return picture('world|' + id, cv => {
      const S = lookStore(), cat = S.catalogue(), w = cat.worlds[id] || {}, n = cat.names.scene[w.picture], name = n && KW.scenes[n] ? n : KW.scenes[w.picture] ? w.picture : 'camp';
      const look = S.worldLook(id), was = KW.settings.knightLook(S.now());
      K.look(look);
      try {
        onGrid(cv.getContext('2d'), () => {
          const sc = KW.scenes[name], o2 = K.pose('idle', 2300);
          o2.x = sc.spot * U; o2.floor = V.HFL; o2.helmet = sc.helmet !== false; if (sc.sword === false) o2.sword = false;
          const st0 = sceneState(sc, o2, 'a', { patron: {} }); if (sc.paint) sc.paint(st0); sc.draw(2300, st0); K.draw(o2);
        });
      } finally { K.look(was); }
    });
  }
  /* A row of a part from every loaded world (KW.settings.screen's rows): each other world's choices
     after the world's name, the world in use's first; pick(id) applies one. */
  function mixRow(x, pick) {
    const S = lookStore(), v = S.now().values.look, g = el('div', 'opts');
    for (const grp of x.groups) {
      if (grp.world !== null && grp.world !== v.world) g.appendChild(el('span', 'wtag', grp.name));
      for (const c of grp.choices) {
        const on = JSON.stringify(c.id) === JSON.stringify(x.cur), kind = { swatch: '', text: 'txt', wide: 'txt', pic: 'pic', pet: 'txt', foe: 'pic fig', critter: 'pic fig' }[c.kind];
        const b = btn('opt' + (kind ? ' ' + kind : '') + (c.off ? ' off' : ''), '', () => { if (on || c.off) return; pick(c.id, c.name || c.chip); });
        b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', x.label + ': ' + (c.name || c.chip) + (c.off ? ', ' + c.offNote : ''));
        const chip = el('span', 'c', c.kind === 'text' || c.kind === 'wide' ? c.chip : c.kind === 'pet' ? c.name : '');
        if (c.kind === 'swatch') {
          if (c.drawn) { const own = KW.scenes.court.drawn(v.monarch)[x.k === 'monarch_hair' ? 'hair' : 'robe']; if (own.length) chip.style.background = bandsCss(Object.assign({}, own)); }
          else { const e = isLongName(c.id) ? (KW.world && KW.world.swatchOf ? KW.world.swatchOf(c.set, c.id) : null) : PACK && PACK.swatches[c.set] && PACK.swatches[c.set][c.id] ? PACK.swatches[c.set][c.id].entries : null; if (e) chip.style.background = bandsCss(e); }
        }
        if (c.kind === 'pic') { const cv = el('canvas'); cv.dataset.mon = c.id; chip.appendChild(cv); }
        if (c.kind === 'foe' || c.kind === 'critter') { const cv = el('canvas'); cv.dataset[c.kind] = c.id; chip.appendChild(cv); }
        b.appendChild(chip);
        if (c.kind !== 'text' && c.kind !== 'wide' && c.kind !== 'pet') b.appendChild(el('span', '', c.name));
        else if (c.name && c.kind !== 'pet') b.appendChild(el('span', '', c.name));
        g.appendChild(b);
      }
    }
    return g;
  }
  const isLongName = v => typeof v === 'string' && KW.settings.LONG.test(v);
  const ITEM_SLOT = k => (k === 'weapon' ? 'main' : KW.settings.ITEMS[k] ? KW.settings.ITEMS[k][0] : null);
  function pageLook(m) {
    const S = lookStore(), r = S.now(), v = r.values.look, cat = S.catalogue(), own = S.parts(v.world), scr = KW.settings.screen, L = 'look.';
    const labels = scr.roleLabels(KW.world && KW.world.words && KW.world.words.source === 'pack' ? KW.world.words.labels : null, v, cat);
    // a part of any loaded pack: an item goes into items for its slot, the key's own choice leaves
    // it, in one write; null clears the key (the monarch's "As drawn")
    const pickPart = k => (id, name) => {
      const slot = ITEM_SLOT(k), items = Object.assign({}, W.look.items || {}), ch = {};
      if (slot && isLongName(id) && cat.items[id] === slot) { items[slot] = id; ch[L + k] = undefined; }
      else { ch[L + k] = id === null ? undefined : id; if (slot) delete items[slot]; }
      if (slot) ch[L + 'items'] = Object.keys(items).length ? items : undefined;
      apply(ch, { ctx: L + k, say: SPEC[L + k].gui.admin.label + ': ' + (id === null ? 'as drawn' : name) });
    };
    // the part's row, with the line saying what the world's own is when it differs, and the amber
    // line of a part that cannot be used where it is chosen
    const part = (c, x, label) => {
      const extra = el('div');
      if (x.warn) extra.appendChild(rich('p', 'help warn', x.warn));
      if (x.changed) extra.appendChild(rich('p', 'help differs', scr.changedLine(x, r, cat)));
      const rr = row(L + x.k, mixRow(x, pickPart(x.k)), { label, extra: extra.childNodes.length ? extra : undefined });
      // an item named for the key's slot is set here as the key itself would be
      const slot = ITEM_SLOT(x.k);
      if (slot && W.look.items && W.look.items[slot] && from(L + x.k) !== 'set') {
        const wh = rr.querySelector('.where'); wh.textContent = ''; wh.appendChild(el('span', 'from set', 'Set here'));
        const b = btn('reset', 'Reset', () => pickPart(x.k)(own.look[x.k], String(own.look[x.k]))); b.setAttribute('aria-label', 'Reset to the world\'s own'); wh.appendChild(b);
        rr.classList.add('set');
      }
      if (x.changed) rr.classList.add('changed');
      c.appendChild(rr);
    };
    const grid = el('div', 'lookgrid'), left = el('div');
    // the world, as cards: choosing one clears the parts set here, as choosing it on a wall does
    const cw = card('World', '[look] world', 'The world every display shows, which sets every part below at once. Choosing one clears the parts set here, as choosing it on a wall does; a part changed afterwards is kept over the world.');
    const ids = Object.keys(cat.worlds), wr = el('div', 'opts');
    for (const id of ids) {
      const on = id === v.world, b = btn('opt wcard', '', () => {
        if (on) return;
        const ch = { [L + 'world']: id };
        for (const k of Object.keys(W.look)) if (k !== 'world') ch[L + k] = undefined;
        if (W.quiet && has(W.quiet, 'scenes')) ch['quiet.scenes'] = undefined;
        for (const k of Object.keys(W.scenes || {})) ch['scenes.' + k] = undefined;
        apply(ch, { ctx: L + 'world', say: 'World: ' + cat.worlds[id].name + ', every part its own' });
      });
      b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', 'World: ' + cat.worlds[id].name);
      const chip = el('span', 'c'), cv = el('canvas'); cv.dataset.world = id; chip.appendChild(cv); b.appendChild(chip); b.appendChild(el('span', '', cat.worlds[id].name));
      wr.appendChild(b);
    }
    cw.appendChild(row(L + 'world', wr, { noHelp: true }));
    if (ids.length === 1) cw.appendChild(rich('p', 'help', 'More worlds show here once their packs are loaded.'));
    left.appendChild(cw);
    const c = card('Household look', '[look]', TABLES.look.help);
    for (const x of scr.knightRows(r, own, PACK, cat, K.status)) if (!x.intro) part(c, x);
    for (const x of scr.patronRows(r, own, PACK, cat, labels)) part(c, x, x.k === 'monarch' ? x.label : undefined);
    for (const x of scr.castRows(r, own, PACK, cat, labels)) part(c, x, x.k === 'pet' || x.k === 'foe' || x.k === 'critter' ? x.label : undefined);
    left.appendChild(c); grid.appendChild(left);
    const pv = el('aside', 'prev');
    pv.appendChild(el('h3', '', 'As every wall will show it'));
    const kn = el('canvas', 'kn'); kn.id = 'pv-knights'; kn.setAttribute('aria-label', 'The knight, helmet on and helmet off'); pv.appendChild(kn);
    const caps = el('div', 'caps'); caps.appendChild(el('span', '', 'Helmet on')); caps.appendChild(el('span', '', 'Helmet off')); pv.appendChild(caps);
    pv.appendChild(el('h3', 'h-court', 'At court'));
    const ct = el('canvas', 'court'); ct.id = 'pv-court'; ct.setAttribute('aria-label', 'The monarch at court'); pv.appendChild(ct);
    pv.appendChild(el('p', '', PACK ? 'Drawn by the display\'s own code from the base pack, ' + PACK.id + ' ' + PACK.version + ', and the packs of the worlds loaded.' : 'Drawn by the display\'s own code.'));
    grid.appendChild(pv);
    m.appendChild(grid);
  }
  function pageDisplay(m) {
    const c = card('Household display', '[display]', TABLES.display.help), D = 'display.';
    const pick = (p, labels) => optRow(p, SPEC[p].values.map((v, i) => ({ id: v, chip: labels[i], kind: 'txt' })));
    c.appendChild(row(D + 'headline', pick(D + 'headline', ['Small', 'Medium', 'Large'])));
    c.appendChild(row(D + 'clock', pick(D + 'clock', ['24 hour', '12 hour'])));
    const h = val(D + 'helmet_indoors');
    c.appendChild(row(D + 'helmet_indoors', sw(h, () => apply({ [D + 'helmet_indoors']: !h }, { ctx: D + 'helmet_indoors', say: 'Helmet indoors: ' + (h ? 'off' : 'on') }), 'Helmet indoors')));
    m.appendChild(c);
  }
  function pageQuiet(m) {
    const c = card('Quiet scenes', '[quiet]', TABLES.quiet.help), p = 'quiet.scenes', cur = val(p), all = SPEC[p].values;
    const box = el('div');
    const ids = cur.concat(all.filter(x => !cur.includes(x)));
    const commit = (nl, say) => apply({ [p]: nl }, { ctx: p, say });
    ids.forEach(id => {
      const i = cur.indexOf(id), r = el('div', 'qs' + (i < 0 ? ' out' : '')), cv = el('canvas'); cv.dataset.scene = id; r.appendChild(cv);
      const nm = el('div'); nm.appendChild(el('b', '', SCENE[id])); nm.appendChild(el('span', 'pos', i < 0 ? 'Not in the rotation' : i === 0 ? 'First in the rotation' : 'Number ' + (i + 1) + ' in the rotation')); r.appendChild(nm);
      const mv = el('span', 'mv');
      const up = btn('', '▲', () => { const nl = cur.slice(); [nl[i - 1], nl[i]] = [nl[i], nl[i - 1]]; commit(nl, SCENE[id] + ' moved up'); });
      const dn = btn('', '▼', () => { const nl = cur.slice(); [nl[i + 1], nl[i]] = [nl[i], nl[i + 1]]; commit(nl, SCENE[id] + ' moved down'); });
      up.setAttribute('aria-label', 'Move ' + SCENE[id] + ' up'); dn.setAttribute('aria-label', 'Move ' + SCENE[id] + ' down');
      up.disabled = i <= 0; dn.disabled = i < 0 || i === cur.length - 1; mv.appendChild(up); mv.appendChild(dn); r.appendChild(mv);
      const last = i >= 0 && cur.length === 1;
      r.appendChild(sw(i >= 0, () => commit(i >= 0 ? cur.filter(x => x !== id) : cur.concat([id]), SCENE[id] + (i >= 0 ? ' out of the rotation' : ' in the rotation')), SCENE[id] + ' in the rotation', last));
      box.appendChild(r);
    });
    c.appendChild(row(p, box, { stack: true, help: SPEC[p].help + ' One scene at least stays in the rotation.' }));
    c.appendChild(row('quiet.minutes'));
    m.appendChild(c);
  }
  function pageScenes(m) {
    const c = card('Scenes', '[scenes]', TABLES.scenes.help);
    for (const s of TABLES.scenes.settings) {
      const p = 'scenes.' + s.key, home = COND[s.key].scene;
      c.appendChild(row(p, optRow(p, s.acts.map(id => { const cv = el('canvas'); cv.dataset.scene = id; return { id, node: cv, name: SCENE[id], def: id === home ? 'Its own' : '', kind: 'scn' }; })), { stack: true }));
    }
    m.appendChild(c);
  }

  function pageEnv(m) {
    const pw = S.env.find(e => e.name === 'KNIGHTWATCHER_ADMIN_PASSWORD');
    const a = card('Admin password', null, 'The password for this page. It is set in .env and nowhere else, and this page cannot change it.');
    const r0 = el('div', 'envrow'), l0 = el('div', 'lab'); l0.appendChild(el('b', '', 'Admin password')); l0.appendChild(el('code', '', 'KNIGHTWATCHER_ADMIN_PASSWORD')); r0.appendChild(l0);
    const c0 = el('div', 'ctl'); c0.appendChild(rich('p', 'help', pw ? pw.help : '')); r0.appendChild(c0);
    const s0 = el('div', 'st'); s0.appendChild(el('span', 'tag ok', 'Set')); r0.appendChild(s0); a.appendChild(r0);
    m.appendChild(a);
    const groups = [['Credentials', 'For the collector alone. The server is told only whether each is there, by name.', S.env.filter(e => e.scope === 'credential')],
      ['Host', 'The host folders compose.yaml mounts. Read by docker compose when it makes the containers; the server never sees them.', S.env.filter(e => e.gui.admin.section === 'Host')],
      ['Server', 'Where compose.yaml publishes the server. Read by docker compose; the server never sees them.', S.env.filter(e => e.gui.admin.section === 'Server')]];
    for (const [title, help, list] of groups) {
      const c = card(title, null, help);
      for (const e of list) {
        const cred = e.scope === 'credential', name = cred ? varOf(val('sources.' + e.source + '.secret') || e.secret, e.field) : e.name, ok = cred ? credState(name) : true, need = cred && srcOn(e.source);
        const r = el('div', 'envrow' + (cred && ok === false && need ? ' missing' : '')), l = el('div', 'lab'); l.appendChild(el('b', '', e.gui.admin.label)); l.appendChild(el('code', '', name)); r.appendChild(l);
        const ct = el('div', 'ctl'); ct.appendChild(rich('p', 'help', e.help));
        if (e.form || e.example) ct.appendChild(rich('p', 'help', 'Possible values: ' + (e.form || 'a host path') + (e.example ? ', such as `' + e.example + '`.' : '.')));
        if (cred) {
          const t = TABLES['sources.' + e.source], sn = groupOf(t.settings[0].gui.admin.section);
          const fl = el('p', 'help'); fl.appendChild(document.createTextNode('For ' + sn + ', which is ' + (need ? 'on' : srcThere(e.source) ? 'off' : 'not in config.toml') + '. '));
          fl.appendChild(btn('btn small', 'Open ' + sn, () => { go('sources'); st.open[e.source] = true; render(true); })); ct.appendChild(fl);
        } else if (e.default !== null && e.default !== undefined) ct.appendChild(rich('p', 'help', 'Left out, it is `' + (e.default === '' ? 'empty' : e.default) + '`.'));
        r.appendChild(ct);
        const sx = el('div', 'st');
        sx.appendChild(cred ? (ok === null ? el('span', 'tag off', 'Not reported') : el('span', 'tag ' + (ok ? 'ok' : need ? 'bad' : 'off'), ok ? 'In .env' : need ? 'Missing' : 'Missing, not needed')) : el('span', 'tag off', 'Not visible here'));
        r.appendChild(sx); c.appendChild(r);
      }
      m.appendChild(c);
    }
    const back = card('Put everything back', null, 'Clears everything set on this page, and the household look, display, quiet scenes and scenes chosen here or on any wall\'s settings screen, so that config.toml and the defaults rule again. Download config.toml first to keep them.');
    const bx = el('div', 'backrow');
    if (refusedHere('reset')) bx.appendChild(msgBox());
    bx.appendChild(btn('btn danger', 'Put everything back to config.toml', () => { st.resetAsk = true; render(); }));
    back.appendChild(bx);
    m.appendChild(back);
  }
  const RENDER = { collector: pageCollector, conditions: pageConditions, sources: pageSources, devices: pageDevices, look: pageLook, display: pageDisplay, quiet: pageQuiet, scenes: pageScenes, env: pageEnv };

  /* ---- Drawing, with the page's own code ------------------------------------------------------- */
  const K = KW.knight, D = KW.draw, V = KW.view, P = KW.props, U = V.U;
  function onGrid(ctx, fn) { const was = D.getCtx(), edges = { HL: V.HL, HR: V.HR, HT: V.HT }; V.HL = 0; V.HR = V.HW; V.HT = 0; D.setCtx(ctx); try { fn(); } finally { D.setCtx(was); Object.assign(V, edges); } }
  const sceneState = (sc, o2, mon, e) => ({ w: KW.state.IDLE, devices: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], places: sc.places || null, tv: false,
    kx: sc.spot * U, o: o2, here: null, inBed: false, helmOff: o2.helmet === false, strike: false, patron: Object.assign({}, e.patron, { id: mon }) });
  const pics = new Map(); let lookKey = '';
  function picture(key, paint, w, h) { if (!pics.has(key)) { const cv = document.createElement('canvas'); cv.width = w || V.HW; cv.height = h || V.HH; paint(cv); pics.set(key, cv); } return pics.get(key); }
  function scenePicture(name, helmetIndoors) {
    return picture('scene|' + name + '|' + helmetIndoors, cv => onGrid(cv.getContext('2d'), () => {
      const sc = KW.scenes[name], o2 = K.pose('idle', 2300);
      o2.x = sc.spot * U; o2.floor = V.HFL; o2.helmet = helmetIndoors ? true : sc.helmet !== false; if (sc.sword === false) o2.sword = false;
      const s = sceneState(sc, o2, 'a', {}); if (sc.paint) sc.paint(s); sc.draw(2300, s); K.draw(o2);
    }));
  }
  const CROP = { x: 700, y: 160, w: 240, h: 372 };
  function monarchPicture(mon, e) {
    const key = 'court|' + mon + '|' + [e.patron.skin, e.patron.hair, e.patron.robe].map(x => (x ? x.id : '')).join('|');
    return picture(key, out => {
      const big = document.createElement('canvas'); big.width = V.HW; big.height = V.HH;
      const sc = KW.scenes.court, o2 = K.pose('ssh_session', 100); o2.x = sc.spot * U; o2.floor = V.HFL;
      onGrid(big.getContext('2d'), () => { const s = sceneState(sc, o2, mon, e); sc.paint(s); sc.draw(100, s); });
      out.getContext('2d').drawImage(big, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
    }, CROP.w, CROP.h);
  }
  function blit(dst, src) {
    const dpr = window.devicePixelRatio || 1, w = Math.round(dst.clientWidth * dpr), h = Math.round(dst.clientHeight * dpr);
    if (!w || !h) return;
    if (dst.width !== w) dst.width = w; if (dst.height !== h) dst.height = h;
    const c = dst.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const f = Math.min(w / src.width, h / src.height), s = f >= 2 ? Math.floor(f) : f, dw = src.width * s, dh = src.height * s;
    c.drawImage(src, Math.round((w - dw) / 2), Math.round(h - dh), Math.round(dw), Math.round(dh));
  }
  const PV = { w: 500, h: 380, floor: 345, at: [[118, true], [362, false]] };
  const BRICK = ['#1a1622', '#1d1826', '#17131e', '#201a29'];
  function drawKnights(cv, t) {
    const dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
    const c = cv.getContext('2d'), f = Math.min(w / PV.w, h / PV.h), s = f >= 2 ? Math.floor(f) : f;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0e0b13'; c.fillRect(0, 0, w, h);
    c.setTransform(s, 0, 0, s, Math.round((w - PV.w * s) / 2), Math.round(h - PV.h * s));
    const was = D.getCtx(); D.setCtx(c);
    try {
      P.bricksHD(-400, -400, PV.w + 800, PV.floor + 400, 70, 26, BRICK, '#0e0b13', 11);
      D.Rh(-400, PV.floor, PV.w + 800, 200, '#2b2333'); D.Rh(-400, PV.floor, PV.w + 800, 2, '#5d5670');
      for (const [x, helm] of PV.at) { const o2 = K.pose('idle', t + (helm ? 0 : 1700)); o2.x = x; o2.floor = PV.floor; o2.helmet = helm; K.draw(o2); }
    } finally { D.setCtx(was); }
  }
  function paintStill() {
    if (!A || !W) return;
    // painted again too when what the world draws changes: it started again with the downloaded
    // packs, or a part gave way to its code copy (KW.world.changes)
    const r = A && W ? lookStore().now() : resolved(), e = KW.settings.engineInput(r, PACK, 600000), key = JSON.stringify(KW.settings.knightLook(r)) + '|' + JSON.stringify([e.patron.skin, e.patron.hair, e.patron.robe]) + '|' + r.values.display.helmet_indoors + '|' + (KW.world ? KW.world.changes : 0);
    if (key !== lookKey) { lookKey = key; pics.clear(); K.look(KW.settings.knightLook(r)); }
    root.querySelectorAll('canvas[data-world]').forEach(cv => blit(cv, worldCard(cv.dataset.world)));
    root.querySelectorAll('canvas[data-foe]').forEach(cv => blit(cv, castPicture('foe', cv.dataset.foe)));
    root.querySelectorAll('canvas[data-critter]').forEach(cv => blit(cv, castPicture('critter', cv.dataset.critter)));
    root.querySelectorAll('canvas[data-mon]').forEach(cv => blit(cv, monarchPicture(cv.dataset.mon, e)));
    root.querySelectorAll('canvas[data-scene]').forEach(cv => blit(cv, scenePicture(cv.dataset.scene, r.values.display.helmet_indoors)));
    const ct = document.getElementById('pv-court'); if (ct) blit(ct, monarchPicture(r.values.look.monarch, e));
  }
  /* A foe standing or a pest hovering, from the cast, for the cast's rows. */
  function castPicture(kind, id) {
    return picture(kind + '|' + id, cv => {
      if (kind === 'foe') { const set = (KW.cast && KW.cast.foes) || P.FOES || {}, f = set[id] || set.goblin; if (f) cv.getContext('2d').drawImage(f.pose('stand'), 80 - f.anchor[0], 232 - f.anchor[1]); }
      else { const set = (KW.cast && KW.cast.critters) || P.CRITTERS || {}, c0 = set[id] || set.fly; if (c0) onGrid(cv.getContext('2d'), () => c0.draw(20, 17, 0)); }
    }, kind === 'foe' ? 160 : 40, kind === 'foe' ? 240 : 30);
  }
  /* The knights move, as on the wall; ?t= on the address holds them at one moment, for screenshots. */
  const frozen = (() => { const m = /[?&]t=(\d+)/.exec(location.search); return m ? +m[1] : null; })();
  function loop(t) { const kn = document.getElementById('pv-knights'); if (kn) drawKnights(kn, frozen === null ? t : frozen); requestAnimationFrame(loop); }

  /* ---- Sign-in, and the page turned off --------------------------------------------------------- */
  function gate() {
    const g = el('div', 'gate'), c = el('div', 'gcard');
    const brand = el('div', 'brand'); brand.appendChild(logo()); brand.appendChild(el('b', '', 'KNIGHTWATCHER')); c.appendChild(brand);
    c.appendChild(el('p', 'sub', 'Household settings'));
    if (auth.mode === 'loading') { c.appendChild(el('p', 'note center', 'Asking the server...')); g.appendChild(c); return g; }
    if (auth.mode === 'off') {
      c.appendChild(el('h2', '', 'The admin page is off'));
      const short12 = /shorter than/.test(auth.error);
      c.appendChild(rich('p', '', short12 ? 'The admin password in .env is shorter than 12 characters, so this page stays shut. The wall displays and their settings screens work as before.'
        : /has no/.test(auth.error) ? 'The server has no admin password in .env, so this page stays shut. The wall displays and their settings screens work as before.'
          : 'The server says: ' + auth.error + '. The wall displays and their settings screens work as before.'));
      c.appendChild(rich('p', '', 'To turn it on, give `KNIGHTWATCHER_ADMIN_PASSWORD` a password of your own of at least 12 characters in .env beside compose.yaml (.env.example shows the line), then make the containers again:'));
      c.appendChild(el('pre', 'cmd', 'docker compose up -d'));
      c.appendChild(el('p', 'note', 'Until then the collector\'s settings are changed in config.toml, as before.'));
      g.appendChild(c); return g;
    }
    const f = el('form');
    const lab = el('label', '', 'Admin password'); lab.htmlFor = 'pw'; f.appendChild(lab);
    const i = el('input', 'in'); i.type = 'password'; i.id = 'pw'; i.name = 'password'; i.autocomplete = 'current-password';
    const left = Math.max(0, Math.ceil((auth.pausedUntil - Date.now()) / 1000));
    if (auth.wrong || left) i.classList.add('bad');
    f.appendChild(i);
    if (auth.error && !left) f.appendChild(el('div', 'err', auth.error));
    if (left) { f.appendChild(el('div', 'err', 'Five wrong passwords in a row, so signing in is paused for ' + Math.max(1, Math.ceil(left / 60)) + ' minute' + (left > 60 ? 's' : '') + ', from every browser. The walls are not affected.')); i.disabled = true; }
    const b = el('button', 'btn gold', left ? 'Paused: ' + Math.floor(left / 60) + ':' + two(left % 60) : 'Sign in'); b.type = 'submit'; if (left) b.disabled = true; f.appendChild(b);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (b.disabled) return;
      b.disabled = true; b.textContent = 'Signing in...';
      const r = await call('POST', 'admin/sign-in', { password: i.value });
      if (r.status === 204) { auth.mode = 'in'; auth.error = ''; auth.wrong = false; await load(); return; }
      if (r.status === 503) { auth.mode = 'off'; auth.error = r.json.error || ''; render(true); return; }
      auth.wrong = true;
      auth.error = r.status === 401 ? 'That is not the admin password. Try again.' : r.json.error || 'The server did not answer. Try again.';
      if (r.status === 429) pause(r.json.retry_after_s);
      render(true);
      const again = document.getElementById('pw'); if (again && !again.disabled) again.focus();
    });
    c.appendChild(f);
    c.appendChild(el('p', 'note', 'The admin password is the one in .env. The wall displays need none: their settings screens change only how the knight looks, and this page changes what the collector watches.'));
    g.appendChild(c); return g;
  }
  let pauseTimer = 0;
  function pause(seconds) {
    auth.pausedUntil = Date.now() + Math.max(1, +seconds || 1) * 1000;
    clearInterval(pauseTimer);
    pauseTimer = setInterval(() => {
      if (Date.now() >= auth.pausedUntil) { clearInterval(pauseTimer); auth.pausedUntil = 0; auth.error = ''; auth.wrong = false; }
      if (auth.mode === 'out') render(true);
    }, 1000);
  }
  function signedOut() { auth.mode = 'out'; auth.error = 'Signed out. Sign in again to carry on.'; auth.wrong = false; A = null; render(true); }

  /* ---- The collector's pulse -------------------------------------------------------------------- */
  function pulse(cls) {
    const p = el('div', cls), x = status(), fail = failing();
    const a = el('div');
    if (!x || !x.generated_at) a.appendChild(document.createTextNode('Collector: no state file yet'));
    else {
      const age = ageOf(x.generated_at);
      a.appendChild(document.createTextNode('Collector: state written ')); a.appendChild(el('b', '', age === null ? 'at ' + clockOf(x.generated_at) : ago(age)));
      a.appendChild(document.createTextNode(', every ' + x.interval_s + ' s'));
    }
    p.appendChild(a);
    const b = el('div');
    if (fail.length) { const f = btn('bad', fail.length + ' source' + (fail.length === 1 ? '' : 's') + ' failing', () => { go('sources'); for (const n of fail) st.open[n] = true; st.menu = false; render(true); }); b.appendChild(f); b.appendChild(document.createTextNode('. ')); }
    const c = x && x.config;
    if (!c) b.appendChild(document.createTextNode(x ? 'This collector does not say which settings it uses.' : ''));
    else if (c.admin === A.version) b.appendChild(document.createTextNode('Settings in use since ' + clockOf(c.at) + '.'));
    else if (has(c, 'refused') && c.refused === A.version) b.appendChild(el('span', 'bad', 'The collector did not take up the latest change.'));
    else b.appendChild(el('span', 'wait', 'The collector takes up the latest change at its next poll.'));
    p.appendChild(b);
    return p;
  }
  /* What stops a change being kept: the collector's checks fail on what is in use already. */
  function trouble() {
    const out = [], x = status(), c = x && x.config;
    if (A.file_problem) out.push(['config.toml cannot be read, so no change can be checked:', [A.file_problem]]);
    else if (A.problems && A.problems.length) out.push(['The collector\'s checks fail on config.toml with what is set here, so a change is kept only if it puts these right:', A.problems]);
    const told = p => (A.problems || []).includes(p);
    if (c && has(c, 'refused') && c.refused === A.version && c.problems.length) out.push(['The collector did not take up the latest change, and runs on what it had:', c.problems]);
    else if (c && c.admin === A.version && c.problems.some(p => !told(p))) out.push(['In use, with these problems:', c.problems.filter(p => !told(p))]);
    if (!out.length) return null;
    const box = el('div', 'msg trouble'); box.setAttribute('role', 'status');
    for (const [head, list] of out) { box.appendChild(el('div', '', head)); for (const p of list.slice(0, 6)) { const l = el('div'); l.appendChild(el('code', '', p)); box.appendChild(l); } }
    return box;
  }

  /* ---- The page --------------------------------------------------------------------------------- */
  function go(sec) { st.sec = sec; st.refused = null; st.edit = null; st.draft = null; st.confirm = null; try { history.replaceState(null, '', '#' + sec); } catch (e) { /* the address keeps its old section */ } }
  function render(top) {
    st.dirty = false;
    if (auth.mode !== 'in' || !A) { root.textContent = ''; root.appendChild(gate()); const pw = document.getElementById('pw'); if (pw && !pw.disabled && auth.mode === 'out') pw.focus(); return; }
    const oldMain = root.querySelector('.main'), keep = oldMain && !top ? oldMain.scrollTop : 0;
    const focused = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    root.textContent = '';
    const app = el('div', 'app');
    const tp = el('header', 'top'), brand = el('div', 'brand');
    brand.appendChild(logo()); brand.appendChild(el('b', '', 'KNIGHTWATCHER')); brand.appendChild(el('span', '', 'Household settings')); tp.appendChild(brand);
    tp.appendChild(pulse('pulse'));
    tp.appendChild(btn('btn line desk-only', 'Download config.toml', exportOpen));
    tp.appendChild(btn('btn desk-only', 'Sign out', signOut));
    tp.appendChild(btn('btn menu-btn', 'Sections', () => { st.menu = true; render(); }));
    app.appendChild(tp);
    const body = el('div', 'body'), rail = el('nav', 'rail');
    rail.setAttribute('aria-label', 'Sections');
    PAGES.forEach((p, i) => {
      if (i === 4 || i === 8) rail.appendChild(el('hr'));
      const b = btn('', p.name, () => { go(p.id); render(true); });
      if (st.sec === p.id) b.setAttribute('aria-current', 'page');
      const [w, bad] = countWords(p); if (w) b.appendChild(el('span', 'n' + (bad ? ' bad' : ''), w));
      rail.appendChild(b);
    });
    rail.appendChild(el('div', 'foot', 'The look, display, quiet scenes and scenes are shared with every wall\'s settings screen.'));
    body.appendChild(rail);
    const main = el('main', 'main'), inner = el('div', 'inner' + (st.sec === 'look' ? ' wide' : '')), pg = PAGES.find(p => p.id === st.sec) || PAGES[0];
    inner.appendChild(el('span', 'crumb', 'Household settings'));
    inner.appendChild(el('h1', '', pg.name));
    inner.appendChild(pulse('phone-pulse'));
    inner.appendChild(rich('p', 'intro', INTRO[pg.id]));
    const t = trouble(); if (t) inner.appendChild(t);
    RENDER[pg.id](inner);
    main.appendChild(inner); body.appendChild(main); app.appendChild(body);
    if (st.toast) app.appendChild(toast());
    if (st.menu) app.appendChild(sheet());
    if (st.exp !== null) app.appendChild(exportDialog());
    if (st.resetAsk) app.appendChild(resetDialog());
    root.appendChild(app);
    main.scrollTop = keep;
    paintStill();
    if (focused) { const f = Array.from(root.querySelectorAll('[aria-label]')).find(x => x.getAttribute('aria-label') === focused); if (f) f.focus({ preventScroll: true }); }
    if (st.reveal) { const m = root.querySelector('.msg[role="alert"]'); if (m) m.scrollIntoView({ block: 'nearest' }); st.reveal = false; }
    if (st.scrollTo) {
      const target = root.querySelector('.msg[role="alert"]') || root.querySelector('[data-ctx="' + st.scrollTo + '"]');
      if (target) main.scrollTop += target.getBoundingClientRect().top - main.getBoundingClientRect().top - main.clientHeight * (target.classList.contains('msg') ? 0.45 : 0.12);
      st.scrollTo = null;
    }
  }
  function toast() {
    const t = el('div', 'toast'), tx = el('div'); tx.setAttribute('role', 'status');
    const x = status(), c = x && x.config, T = st.toast;
    let sub, cls = 'sub';
    if (T.wall) sub = T.phase === 'saved' ? 'Sent to every display.' : 'Every display shows it from its next poll, within about five seconds.';
    else if (c && c.admin === T.version) { sub = 'In use by the collector since ' + clockOf(c.at) + '.'; if (c.problems.length) { sub += ' With a problem: ' + c.problems[0]; cls += ' bad'; } }
    else if (c && has(c, 'refused') && c.refused === T.version) { sub = 'The collector did not take it up: ' + (c.problems[0] || 'no reason given'); cls += ' bad'; t.classList.add('bad'); }
    else { sub = 'Checked by the collector\'s rules. It takes it up at its next poll, within ' + ((x && x.interval_s) || val('collector.interval_s')) + ' seconds.'; cls += ' wait'; }
    tx.appendChild(el('b', '', 'Saved: ' + T.say + '.'));
    tx.appendChild(el('span', cls, sub));
    t.appendChild(tx);
    if (T.before && Object.keys(T.before).length) t.appendChild(btn('btn small', 'Undo', undo));
    t.appendChild(btn('btn small', 'Close', () => { st.toast = null; render(); }));
    return t;
  }
  function sheet() {
    const sh = el('div', 'sheet'), h = el('div', 'sh'), b2 = el('div', 'brand');
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Sections');
    b2.appendChild(logo()); b2.appendChild(el('b', '', 'SECTIONS')); h.appendChild(b2);
    const sp = el('div', 'sp'); sp.appendChild(btn('btn', 'Close', () => { st.menu = false; render(); })); h.appendChild(sp); sh.appendChild(h);
    const nav = el('nav');
    for (const p of PAGES) { const b = btn('', p.name, () => { go(p.id); st.menu = false; render(true); }); if (st.sec === p.id) b.setAttribute('aria-current', 'page'); const [w, bad] = countWords(p); if (w) b.appendChild(el('span', 'n' + (bad ? ' bad' : ''), w)); nav.appendChild(b); }
    sh.appendChild(nav);
    const sf = el('div', 'sf'); sf.appendChild(pulse('pulse-s'));
    sf.appendChild(btn('btn line', 'Download config.toml', () => { st.menu = false; exportOpen(); })); sf.appendChild(btn('btn', 'Sign out', signOut));
    sh.appendChild(sf);
    return sh;
  }
  async function exportOpen() {
    st.exp = ''; render();
    const r = await call('GET', 'admin/export');
    if (r.status === 401) { signedOut(); return; }
    st.exp = r.status === 200 ? r.text : '# The server could not make the file: ' + (r.json.error || r.status);
    render();
  }
  function exportDialog() {
    const v = el('div', 'veil'), d = el('div', 'dlg'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Download config.toml');
    const dh = el('div', 'dh'); dh.appendChild(el('h2', '', 'Download config.toml')); const sp = el('div', 'sp'); sp.appendChild(btn('btn', 'Close', () => { st.exp = null; render(); })); dh.appendChild(sp); d.appendChild(dh);
    d.appendChild(rich('p', '', 'Every setting as the collector now uses it, each with what it does as a comment: what was set here, over what config.toml holds, over the defaults. Credentials are not in it; they stay in .env. Downloading changes nothing on the server.'));
    const pre = el('pre');
    if (!st.exp) pre.appendChild(el('span', 'cm', 'Asking the server...'));
    for (const line of (st.exp || '').split('\n')) pre.appendChild(el('span', /^\s*#/.test(line) ? 'cm' : /^\[/.test(line) ? 'tb' : '', line + '\n'));
    d.appendChild(pre);
    const df = el('div', 'df'); df.appendChild(btn('btn', 'Close', () => { st.exp = null; render(); }));
    const a = el('a', 'btn gold', 'Download config.toml'); a.href = API + 'admin/export'; a.setAttribute('download', 'config.toml'); df.appendChild(a);
    d.appendChild(df);
    v.appendChild(d); return v;
  }
  function resetDialog() {
    const v = el('div', 'veil'), d = el('div', 'dlg small'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Put everything back to config.toml');
    const dh = el('div', 'dh'); dh.appendChild(el('h2', '', 'Put everything back?')); d.appendChild(dh);
    const n = Object.keys(A.set).length, walls = WALL.reduce((a, s) => a + Object.keys(W[s] || {}).length, 0);
    d.appendChild(el('p', '', 'This clears ' + n + ' setting' + (n === 1 ? '' : 's') + ' set on this page for the collector' + (has(A.set, 'device') ? ', the devices\' list among them,' : '') + ' and ' + walls + ' choice' + (walls === 1 ? '' : 's') + ' of the household look, display, quiet scenes and scenes, made here or on any wall\'s settings screen.'));
    d.appendChild(el('p', '', 'The collector then runs on config.toml and its defaults alone, from its next poll, and every wall goes back to config.toml\'s look. It cannot be undone here: download config.toml first to keep what is set.'));
    const df = el('div', 'df');
    df.appendChild(btn('btn', 'Keep them', () => { st.resetAsk = false; render(); }));
    df.appendChild(btn('btn danger', 'Put everything back', async () => {
      st.resetAsk = false;
      const r = await call('POST', 'admin/reset', { v: 1 });
      if (r.status === 401) { signedOut(); return; }
      if (r.status !== 200) { st.refused = { ctx: 'reset', problems: r.json.problems || [r.json.error || 'refused (' + r.status + ')'] }; render(); return; }
      A = r.json; await refreshShared();
      st.toast = { say: 'Everything put back to config.toml', wall: false, before: null, phase: 'saved', version: A.version };
      soon(); render();
    }));
    d.appendChild(df);
    v.appendChild(d); return v;
  }
  async function signOut() { await call('POST', 'admin/sign-out'); auth.mode = 'out'; auth.error = ''; auth.wrong = false; A = null; st.menu = false; render(true); }

  /* ---- Keeping up with the server --------------------------------------------------------------- */
  async function refreshShared() { const r = await call('GET', 'settings'); if (r.status === 200 && r.json && r.json.v === 1) W = r.json; }
  let lastSeen = '';
  async function refresh() {
    if (auth.mode !== 'in') return;
    const [r] = await Promise.all([call('GET', 'admin/settings'), refreshShared()]);
    if (r.status === 401) { signedOut(); return; }
    if (r.status !== 200) return;
    A = r.json;
    const seen = JSON.stringify([Object.assign({}, A, { now: null }), W]);
    const news = seen !== lastSeen; lastSeen = seen;
    if (editing() || st.menu || st.exp !== null || st.resetAsk) { st.dirty = st.dirty || news; refreshPulse(); return; }
    if (news) render(); else refreshPulse();
  }
  function refreshPulse() {
    for (const cls of ['pulse', 'phone-pulse']) { const old = root.querySelector('.' + cls); if (old) old.replaceWith(pulse(cls)); }
    const t = root.querySelector('.toast'); if (t && st.toast) t.replaceWith(toast());
  }
  /* After a change, look again sooner, for the collector's acknowledgement. */
  let soonTimer = 0;
  function soon() { clearTimeout(soonTimer); let n = 0; const again = () => { refresh(); if (++n < 8) soonTimer = setTimeout(again, 1500); }; soonTimer = setTimeout(again, 1500); }

  async function load() {
    const [sc, r] = await Promise.all([call('GET', 'admin/schema'), call('GET', 'admin/settings'), refreshShared()]);
    if (sc.status === 401 || r.status === 401) { auth.mode = 'out'; render(true); return; }
    if (sc.status !== 200 || r.status !== 200) { auth.mode = 'out'; auth.error = 'The server did not answer: ' + (r.json.error || sc.json.error || r.status); render(true); return; }
    readSchema(sc.json); A = r.json; auth.mode = 'in';
    lastSeen = JSON.stringify([Object.assign({}, A, { now: null }), W]);
    render(true);
  }
  /* The packs the collector downloaded, from data/packs/ beside the walls (up one level from this
     page), added as a wall adds them: the knight reads them and the world starts again at once
     with every text. Served alone; nothing is fetched from disk. */
  function addDownloaded(dev) {
    if (!/^https?:$/.test(location.protocol)) return;
    K.fetchPacks((url, init) => fetch(url, init), '../').then(got => {
      if (!got.files.length && !got.refused.length) return;
      K.add(got);
      if (KW.world && got.files.length) KW.world.start(KW.packText.concat(got.files.map(f => f.text)), dev);
      PACK = K.basePack(); OWN = KW.settings.builtIn(PACK, KW.settings.pageWorld()); lookKey = ''; if (LOOK) LOOK.check();
      // a field being typed in is not drawn again under the cursor: the previews are, and the rest
      // waits until it is left, as news from the server does
      if (editing() || st.menu || st.exp !== null || st.resetAsk) { st.dirty = true; paintStill(); } else render(true);
    }, () => {});
  }
  async function start() {
    const own = (document.querySelector('meta[name="kw-version"]') || {}).content || 'dev';
    // The packs as the walls read them: signed when deployed, unsigned allowed for a dev page. The
    // knight from the base pack, and the scenes, the devices and the cast from the medieval
    // world's, as main.js starts them.
    K.start(KW.packText, own === 'dev', { look: {} });
    if (KW.world) KW.world.start(KW.packText, own === 'dev');
    PACK = K.basePack(); OWN = KW.settings.builtIn(PACK, KW.settings.pageWorld());
    addDownloaded(own === 'dev');
    render(true);
    const r = await call('GET', 'admin/state');
    if (r.status !== 200) { auth.mode = 'off'; auth.error = r.json.error || 'the server has no admin page'; render(true); return; }
    if (!r.json.on) { auth.mode = 'off'; auth.error = r.json.error || ''; render(true); return; }
    if (r.json.paused_s) pause(r.json.paused_s);
    if (r.json.signed_in) await load(); else { auth.mode = 'out'; render(true); }
    setInterval(refresh, POLL_MS);
    requestAnimationFrame(loop);
  }
  window.addEventListener('resize', () => paintStill());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (st.menu || st.exp !== null || st.resetAsk)) { st.menu = false; st.exp = null; st.resetAsk = false; render(); } });
  start();
})();
