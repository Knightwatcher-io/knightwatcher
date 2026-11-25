/* Knightwatcher: the demo. Invented conditions, a bar of controls for reviewing every scene and
   state, a set of stand-in devices a visitor may change in the bar's Devices panel, and a loop that
   shows them in turn. The page runs it when it has never had a valid state file, or when the
   address carries ?demo. Every name, address and figure here is invented, and nothing here sends
   anything anywhere: the panel's set is kept in this browser alone. */
(function (KW) {
  'use strict';
  const ST = KW.state;

  /* The invented conditions, highest first. Each id is the contract's; key is the name the
     address's on= lists it by, the id where it is left out; alias is the short name the address
     and the regression screenshots also accept. Under strain (cpu_hot) has four entries of the one
     id, in the collector's words: one machine's CPU, one machine's memory (mem, which bloats the
     knight), both on one machine, and several machines; only one shows at a time. Scene and level
     come from KW.state. */
  const CONDS = [
    { id: 'attack',              alias: 'attack', name: 'Attack',      hl: 'UNDER ATTACK',   sub: '212 failed SSH logins in 10 min · fail2ban is banning' },
    { id: 'wan_down',            alias: 'wan',    name: 'WAN down',    hl: 'WAN DOWN',       sub: 'no route to the internet for 4 min · LAN and DNS are fine' },
    { id: 'container_unhealthy', alias: 'sick',   name: 'Unhealthy',   hl: 'RADARR UNWELL',  sub: 'unhealthy for 12 min · restarted twice · API not answering' },
    { id: 'disk_full',           alias: 'disk',   name: 'Disk',        hl: 'DISK 93% FULL',  sub: "/data has 640 GB left · about 11 days at this week's pace" },
    { id: 'backup_overdue',      alias: 'backup', name: 'Backup',      hl: 'BACKUP OVERDUE', sub: 'last restic snapshot was 41 h ago · the 03:00 run failed' },
    { id: 'pi_silent',           alias: 'pi',     name: 'Pi silent',   hl: 'PI SILENT',      sub: 'no heartbeat from the Raspberry Pi for 22 min' },
    { id: 'device_down',          alias: 'device',  name: 'Device down',  hl: 'NAS DOWN',       sub: 'no answer for 6 min' },
    { id: 'cpu_hot',             alias: 'cpu',    name: 'Strain: CPU', hl: 'HOST CPU 96%',   sub: '96% for 9 min · memory 61% · load 14.2' },
    { id: 'cpu_hot', key: 'mem', alias: 'mem',    name: 'Strain: memory', hl: 'NAS MEMORY 93%', sub: '93% for 6 min · CPU 41%', mem: true },
    { id: 'cpu_hot', key: 'cpumem', alias: 'cpumem', name: 'Strain: both', hl: 'NAS UNDER STRAIN', sub: 'memory 93% and CPU 97% for 12 min', mem: true },
    { id: 'cpu_hot', key: 'strained', alias: 'strained', name: 'Strain: several', hl: '3 UNDER STRAIN', sub: 'NAS memory 93%, Host CPU 97%, Buildbox CPU 91%', mem: true },
    { id: 'ssh_session',         alias: 'ssh',    name: 'SSH session', hl: 'AT COURT',       sub: 'admin signed in from 192.0.2.10 · session open 14 min' },
    { id: 'updating',            alias: 'update', name: 'Updating',    hl: 'UPDATING',       sub: 'Komodo is redeploying 3 stacks · sonarr, radarr, bazarr' },
    { id: 'streaming',           alias: 'plex',   name: 'Plex stream', hl: 'STREAMING',      sub: '' },
    { id: 'night',               alias: 'night',  name: 'Night',       hl: 'NIGHT WATCH',    sub: 'nothing to report since 23:40' }
  ].map(c => { const k = ST.CONDITIONS[c.id]; return Object.assign(c, { key: c.key || c.id, mem: !!c.mem, lv: k.lv, level: k.level, st: ST.LEVELS[k.level], scene: k.scene }); });
  /* The address's names for the entries: each alias, and swap and memory_tight, the older names of
     memory under strain. */
  const ALIAS = { swap: 'mem', memory_tight: 'mem' }; for (const c of CONDS) ALIAS[c.alias] = c.key;
  /* The events, each with its type in the contract and the text and parts the collector would
     send for it; the caption shown is built from the parts in the world's words. */
  const EVENTS = {
    goblin: { name: 'IP banned',   type: 'ip_banned',   text: 'BANNED 203.0.113.77 · sshd',          parts: { addr: '203.0.113.77', jail: 'sshd' } },
    crate:  { name: 'Import',      type: 'import',      text: 'IMPORTED · Saltmarsh Wardens S02E04', parts: { title: 'Saltmarsh Wardens S02E04' } },
    feast:  { name: 'Backup done', type: 'backup_done', text: 'BACKUP DONE 03:12',                   parts: { at: '03:12' } } };
  /* The invented streams, in the order they started. The address's st= sets how many play (1 to 3,
     3 without it) and sm= the collector's setting show (names, titles or count, names without
     it). */
  const STREAMS = [
    { who: 'Robin', title: 'The Lantern Keepers S01E03' },
    { who: 'Sam', title: 'Harbour of Glass' },
    { who: 'Alex', title: 'Fen Owls - Low Tide' } ];
  const SHOWS = ['names', 'titles', 'count'];
  /* facts.streams as the collector writes it for n of the streams under the setting show. */
  function streamsFor(n, show) {
    const list = STREAMS.slice(0, n), facts = { count: list.length };
    if (show === 'count') return facts;
    facts.titles = list.map(s => s.title);
    facts.sessions = list.map(s => (show === 'titles' ? { title: s.title } : { who: s.who, title: s.title }));
    return facts;
  }
  /* The detail the collector writes for those streams: the first stream's line, or the count. */
  function detailFor(facts) {
    const w = ST.streamWords(ST.streamsOf(facts), 0).line;
    return w || facts.count + (facts.count === 1 ? ' stream' : ' streams');
  }
  /* The collector's own words for the quiet line (quiet_line() in collector/runner.py), which write
     the demo's quiet_line, the text shown without a world's words. */
  const COLLECTOR_QUIET = { quiet: ['ALL QUIET'], up: ['{n} up'], backup: ['backup {at}'], ads: ['{n} ads blocked', '{short} ads blocked', '{short} blocked'] };
  const DEMO = [
    { on: '', is: 'battlement', dur: 9000, flies: 4, swat: 3200 }, { on: '', is: 'battlement', dur: 6000, ev: 'goblin' },
    { on: '', is: 'camp', dur: 9000, ev: 'crate' }, { on: '', is: 'yard', dur: 8000 }, { on: '', is: 'smithy', dur: 14400 },
    { on: 'ssh_session', dur: 9000 }, { on: 'cpu_hot', dur: 7000 }, { on: 'mem', dur: 7000 },
    { on: 'streaming', dur: 7000 }, { on: 'container_unhealthy', dur: 7000 }, { on: 'backup_overdue', dur: 7000 }, { on: '', is: 'house', dur: 6500, ev: 'feast' },
    { on: 'disk_full', dur: 8000 }, { on: 'pi_silent', dur: 7000 }, { on: 'device_down', is: 'camp', dur: 8000, dv: 'pi,camera,camera,machine!,vm,box' },
    { on: 'updating', dur: 8000 }, { on: 'wan_down', dur: 6500 },
    { on: 'attack,mem,ssh_session', dur: 8000 }, { on: 'night', dur: 8000 } ];

  /* How long each quiet scene lasts while they take turns in the demo, unless the settings set a
     length (docs/display.md). */
  const DEMO_TURN_MS = 60 * 1000;

  /* ---- The demo's devices ----------------------------------------------------------------------
     Stand-ins for a visitor's own devices, set up in the review bar's Devices panel: added by kind,
     named, set up or down and removed, so that a visitor sees how a display of their own would
     look. The set is kept in this browser's storage under SET_KEY and is used in the demo alone;
     live mode draws the state file's devices. The address's dv= hook and the demo loop's step of
     devices take its place while they apply. */
  const SET_KEY = 'knightwatcher.demo-devices';
  /* Every kind the page draws (KW.props.KINDS), in the panel's order: its label, what it stands
     for, and the name a new one is given. box is the drawing of every kind the page does not name,
     a router among them. */
  const KINDS = {
    machine: { label: 'Machine', what: 'a NAS, a server or a PC, drawn as a scrying crystal on the ground', name: 'NAS' },
    camera: { label: 'Camera', what: 'a camera, drawn as an owl high up', name: 'Cam' },
    vm: { label: 'VM', what: 'a virtual machine, drawn as a flask on the ground', name: 'VM' },
    box: { label: 'Other', what: 'any other device, such as a router, drawn as a chest on the ground', name: 'Router' },
    pi: { label: 'Pi', what: 'a Raspberry Pi, drawn as the pie; one has a place', name: 'Pi' } };
  /* The set the demo starts with, and Reset goes back to: a NAS, a camera and a router. The pie's
     place is left empty, so that the Pi comes only with pi_silent, as the empty dish. */
  const DEFAULT_SET = [{ kind: 'machine', name: 'NAS' }, { kind: 'camera', name: 'Cam' }, { kind: 'box', name: 'Router' }];
  /* The headline's word for a device down, by kind, as the collector writes it (KIND_WORDS in
     collector/conditions.py), and the longest name that leaves room for it in the headline's 16
     characters, so that a name from the panel is never cut. DETAIL_MAX is the detail line's
     length, and DOWN_FOR the invented silence. */
  const HEADLINE_MAX = 16, DETAIL_MAX = 60, DOWN_FOR = 'no answer for 6 min';
  const wordOf = kind => ({ pi: 'SILENT', camera: 'DARK' }[kind] || 'DOWN');
  const nameMax = kind => HEADLINE_MAX - wordOf(kind).length - 1;
  const chars = s => Array.from(s);
  const clip = (s, n) => (chars(s).length <= n ? s : chars(s).slice(0, n - 1).join('').trimEnd() + '…');
  const kindIn = kind => (Object.prototype.hasOwnProperty.call(KINDS, kind) ? kind : 'box');
  /* A name as typed, fit to show: control characters made spaces, runs of white space one space,
     and no longer than its kind leaves room for. */
  const cleanName = (text, kind) => chars(String(text).replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').split(/\s+/).filter(Boolean).join(' ')).slice(0, nameMax(kindIn(kind))).join('').trim();
  /* The name a new device of a kind is given beside those already in the list: the kind's own,
     or with a number after it where that is taken (Cam, Cam 2), ignoring case. */
  function freshName(list, kind) {
    const k = kindIn(kind), base = KINDS[k].name, taken = new Set(list.filter(e => e && typeof e.name === 'string').map(e => e.name.toLowerCase()));
    for (let n = 1; ; n++) { const name = n === 1 ? base : cleanName(base + ' ' + n, k); if (!taken.has(name.toLowerCase()) || n > 99) return name; }
  }
  /* Whether a device of a kind would be drawn after those of the list, by the page's own rule of
     places (KW.state.arrange): one Pi, three cameras high, three other devices on the ground. */
  const fits = (list, kind) => ST.arrange(list.concat([{ kind }])).at[list.length] !== null;
  /* The set read from its stored text, { v: 1, list: [{ kind, name, state }] }, or null when the
     text is not that. A kind the panel does not offer, a name that is not a string or a device with
     no place left is dropped, and an empty name is given its kind's. */
  function readSet(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return null; }
    if (!j || typeof j !== 'object' || j.v !== 1 || !Array.isArray(j.list)) return null;
    const devSet = [];
    for (const e of j.list) {
      if (!e || typeof e !== 'object' || !Object.prototype.hasOwnProperty.call(KINDS, e.kind) || typeof e.name !== 'string' || !fits(devSet, e.kind)) continue;
      devSet.push({ kind: e.kind, name: cleanName(e.name, e.kind) || freshName(devSet, e.kind), state: e.state === 'down' ? 'down' : 'up' });
    }
    return devSet;
  }
  const defaultSet = () => DEFAULT_SET.map(d => ({ kind: d.kind, name: d.name, state: 'up' }));
  /* The set this browser keeps, or the default where it keeps none or storage is refused. */
  function loadSet(storage) {
    let text = null; try { text = storage().getItem(SET_KEY); } catch (e) { /* refused: the default */ }
    return (text != null && readSet(text)) || defaultSet();
  }
  /* Keeps the set, or with null forgets it, so that the default stands. Refused storage keeps it
     for this page alone. */
  function keepSet(storage, devSet) {
    try {
      if (devSet) storage().setItem(SET_KEY, JSON.stringify({ v: 1, list: devSet.map(d => ({ kind: d.kind, name: d.name, state: d.state })) }));
      else storage().removeItem(SET_KEY);
    } catch (e) { /* refused: the set lasts until the page is opened again */ }
  }
  /* The set as the contract's list (docs/state.md), every device alerting. With allUp every device
     is up, as the demo loop draws them. With piSilent the first Pi is the collector's own Pi, down
     and marked silent, which raises pi_silent rather than device_down; with no Pi in the set one
     is put first, taking the pie's place, which no other kind takes, so nothing else moves. */
  function listOf(devSet, o = {}) {
    const list = devSet.map(d => ({ name: d.name, kind: d.kind, state: !o.allUp && d.state === 'down' ? 'down' : 'up', alert: true }));
    if (o.piSilent) {
      const i = list.findIndex(e => e.kind === 'pi');
      if (i >= 0) list[i] = Object.assign({}, list[i], { state: 'down', silent: true });
      else list.unshift({ name: KINDS.pi.name, kind: 'pi', state: 'down', alert: true, silent: true });
    }
    return list;
  }
  /* A list of the address's dv= hook or the demo loop, with a name for each device by its kind. */
  function named(list) {
    const out = [];
    for (const e of list) out.push(e && typeof e === 'object' && typeof e.name !== 'string' ? Object.assign({ name: freshName(out, e.kind) }, e) : e);
    return out;
  }
  /* The positions of the devices that raise device_down: down and alerting, the silent Pi aside. */
  const downOf = list => list.map((e, i) => (e && typeof e === 'object' && e.state === 'down' && e.alert === true && !e.silent ? i : -1)).filter(i => i >= 0);
  /* device_down's words for a list, as the collector writes them (_device_words in
     collector/conditions.py): one device's name and its kind's word, the name repeated in the
     detail when the headline had to cut it; several, their number and their names while they fit
     the detail, with +N for the rest. null when nothing in the list is down. */
  function downWords(list) {
    const down = downOf(list).map(i => list[i]), names = down.map(e => e.name);
    if (!down.length) return null;
    if (down.length > 1) {
      for (let n = names.length; n > 0; n--) {
        const line = names.slice(0, n).join(', ') + (n < names.length ? ' +' + (names.length - n) : '');
        if (chars(line).length <= DETAIL_MAX) return { hl: down.length + ' DOWN', sub: line };
      }
      return { hl: down.length + ' DOWN', sub: clip(names[0], DETAIL_MAX) };
    }
    const word = wordOf(down[0].kind), room = HEADLINE_MAX - word.length - 1, name = down[0].name, cut = chars(name).length > room;
    return { hl: clip(name.toUpperCase(), room) + ' ' + word, sub: cut ? name + ' · ' + DOWN_FOR : DOWN_FOR };
  }
  /* What the panel says is full, or '' while every class has room. */
  function fullNote(devSet) {
    const full = [];
    if (!fits(devSet, 'pi')) full.push('the pie\'s place, which holds one Pi');
    if (!fits(devSet, 'camera')) full.push('the three high places for cameras');
    if (!fits(devSet, 'machine')) full.push('the three ground places for every other kind');
    if (full.length === 3) return 'Every place is full: one Pi, three cameras and three other devices are all a scene can show.';
    return full.length ? 'Full: ' + full.join(' and ') + '.' : '';
  }
  const storage = () => window.localStorage;

  let streams = streamsFor(3, 'names');
  let S = null, E = null, running = false, built = false, flyTimer = 0, demoAt = 0, demoI = -1, swatNote = null, stepDevices = null;
  /* The panel's set of devices, loaded when the demo starts, and its group in the review bar. */
  let devSet = null, devsEl = null;
  let ads = 4812;
  /* A count of adverts as the collector writes it, whole (text.count()) and short (short_count()):
     4,812, then 11.3k, 240k, 1.4M. */
  const count = n => n.toLocaleString('en-GB');
  const shortCount = n => (n < 1e4 ? count(n) : n < 1e5 ? (n / 1e3).toFixed(1) + 'k' : n < 1e6 ? Math.floor(n / 1e3) + 'k' : (n / 1e6).toFixed(1) + 'M');
  /* The quiet line for n adverts blocked, as the collector sends it: its parts, and the quiet_line
     it writes from them. */
  function quietFor(n) {
    const parts = [{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: '03:12' }, { k: 'ads', n: count(n), short: shortCount(n) }];
    return { parts, text: KW.world.join(parts, COLLECTOR_QUIET, KW.world.QUIET_MAX) };
  }
  /* The quiet line and an event's caption, shown as live mode shows them. */
  const idleLine = () => { const q = quietFor(ads); return KW.world.quietLine(q.parts, q.text); };
  const captionOf = type => { const e = EVENTS[type]; return KW.world.caption(e.type, e.parts, e.text); };
  /* The entries on, highest first, each id once: of Under strain's entries the first on. */
  const active = () => { const on = S.on.split(',').filter(Boolean), ids = new Set(); return CONDS.filter(c => on.includes(c.key) && !ids.has(c.id) && ids.add(c.id)); };
  const isOn = id => S.on.split(',').includes(id);
  const IDLE = Object.assign({}, ST.IDLE);

  function addFly(t) { if (!running) return; ads++; E.addFly(t); }
  function refreshSub() { if (!active().length) KW.ui.quietText(idleLine()); }
  function fire(type) { E.fireEvent(type, captionOf(type)); }

  function set(k, v) { S[k] = String(v); apply(); }
  /* Turns an entry on or off by its key. An entry turned on puts out the others of its id, so that
     one of Under strain's shows at a time. */
  function toggle(key) {
    const on = S.on.split(',').filter(Boolean), i = on.indexOf(key), c = CONDS.find(e => e.key === key);
    if (i >= 0) on.splice(i, 1);
    else { for (const e of CONDS) if (c && e.id === c.id && on.includes(e.key)) on.splice(on.indexOf(e.key), 1); on.push(key); }
    set('on', on.join(','));
  }
  /* Whether the panel's set is what the scene draws: not while the address's dv= hook sets the
     devices, nor while the demo loop runs. */
  const usesSet = () => !KW.hooks.dv && S.demo !== '1';
  /* Keeps device_down in step with the panel's set, as the collector raises it: up while a device
     of the set is down, and only then. */
  function settleDown() {
    if (!usesSet()) return;
    const want = downOf(listOf(devSet, { piSilent: isOn('pi_silent') })).length > 0, on = S.on.split(',').filter(Boolean), i = on.indexOf('device_down');
    if (want && i < 0) on.push('device_down'); else if (!want && i >= 0) on.splice(i, 1);
    S.on = on.join(',');
  }
  /* Sets every device of the set up, and keeps the set when that changed it. */
  function allUp() { if (devSet.some(d => d.state === 'down')) { for (const d of devSet) d.state = 'up'; keepSet(storage, devSet); } }
  /* Shows the demo's settings. inPlace leaves the Devices panel as it is, while a name is typed. */
  function apply(inPlace) {
    settleDown();
    if (!inPlace) renderSet();
    document.querySelectorAll('.rv .grp[data-key]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(S[g.dataset.key] === b.dataset.v))));
    document.querySelectorAll('#conds button[data-id]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b.dataset.id))));
    document.getElementById('demo').setAttribute('aria-pressed', String(S.demo === '1'));
    document.body.classList.toggle('nobar', S.bar === '0');
    const act = active(), others = act.slice(1).filter(c => c.lv >= 3), list = demoList(), placed = ST.arrange(list);
    let w = act[0] || IDLE;
    if (w.id === 'streaming') w = Object.assign({}, w, { sub: detailFor(streams) });
    // device_down names the devices that are down and alert, as the collector would, and the
    // knight looks towards the first of them
    if (w.id === 'device_down') w = Object.assign({}, w, downWords(list) || {}, { place: ST.lookPlace(downOf(list), placed.at) });
    E.input = Object.assign({ w, is: S.is, turnMs: DEMO_TURN_MS, devices: placed.devices, tv: isOn('streaming'), helmet: S.h }, KW.ui.extras(DEMO_TURN_MS));
    KW.ui.show({ st: w.st, hl: w.hl, sub: w.sub, quiet: idleLine(), more: { n: others.length, crit: others.some(c => c.lv >= 4) },
      id: w.id, streams: ST.streamsOf(streams), behind: isOn('streaming') && w.id !== 'streaming' });
    // the helmet and the headline size go into the address only when the address or this bar set
    // them; otherwise they are the settings' (KW.hooks.fixed)
    const inHash = ([k]) => (k !== 'h' && k !== 'hs') || KW.hooks.fixed.has(k);
    history.replaceState(null, '', '#' + Object.entries(S).filter(inHash).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
  }

  /* The list of devices: that of the demo loop's step, else that of the address's dv= hook, else
     the panel's set, every device up while the demo loop runs, and with the Pi down while it is
     silent (listOf). */
  function demoList() {
    if (stepDevices && S.demo === '1') return named(stepDevices);
    if (KW.hooks.dv) return named(KW.hooks.dv);
    return listOf(devSet, { allUp: S.demo === '1', piSilent: isOn('pi_silent') });
  }

  /* ---- The Devices panel -----------------------------------------------------------------------
     One row of the review bar: each device of the set with its kind, its name, a Down button and a
     Remove button, then a button to add each kind, Reset and a line saying what is full. Every
     change stops the demo loop, keeps the set and shows it at once. Built again after each change
     but a name, which is typed in place; the focus goes back to the same control, or to the
     nearest one left. */
  const el = (tag, props, kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); for (const k of kids || []) e.appendChild(k); return e; };
  function button(text, title, fn, key) {
    const b = el('button', { type: 'button', textContent: text, title });
    b.dataset.key = key;
    b.addEventListener('click', () => { if (running) fn(); });
    return b;
  }
  /* A change to the set from the panel: stops the demo loop, keeps the set and shows it. */
  function changed(...focus) { S.demo = '0'; keepSet(storage, devSet); apply(); refocus(focus); }
  /* Gives the focus to the first of the panel's controls named that is there and enabled. */
  function refocus(keys) {
    if (!devsEl) return;
    for (const k of keys) { const t = devsEl.querySelector('[data-key="' + k + '"]'); if (t && !t.disabled) { t.focus(); return; } }
  }
  function renderSet() {
    if (!devsEl) return;
    const hooked = !!KW.hooks.dv, active = document.activeElement, had = active && devsEl.contains(active) ? active.dataset.key : null;
    devsEl.textContent = '';
    devsEl.appendChild(el('span', { textContent: 'Devices' }));
    devSet.forEach((d, i) => {
      const k = KINDS[d.kind];
      const name = el('input', { type: 'text', value: d.name, maxLength: nameMax(d.kind), size: nameMax(d.kind), spellcheck: false, autocomplete: 'off', disabled: hooked });
      name.dataset.key = 'name:' + i;
      name.setAttribute('aria-label', 'Name of ' + k.label.toLowerCase() + ' ' + (i + 1));
      const down = button('Down', '', () => { d.state = d.state === 'down' ? 'up' : 'down'; changed('down:' + i); }, 'down:' + i);
      down.setAttribute('aria-pressed', String(d.state === 'down'));
      const rm = button('\u00d7', '', () => { devSet.splice(i, 1); changed('remove:' + i, 'remove:' + (i - 1), 'add:machine'); }, 'remove:' + i);
      const label = () => { down.title = 'Set ' + d.name + ' down, or up again'; rm.title = 'Remove ' + d.name; rm.setAttribute('aria-label', rm.title); };
      label();
      // a name is typed in place: the scene and the headline follow each key, and the panel is not
      // built again under the caret
      name.addEventListener('input', () => { if (!running) return; d.name = cleanName(name.value, d.kind) || KINDS[d.kind].name; label(); S.demo = '0'; keepSet(storage, devSet); apply(true); });
      name.addEventListener('change', () => { if (running && name.value !== d.name) name.value = d.name; });
      down.disabled = rm.disabled = hooked;
      devsEl.appendChild(el('div', { className: 'dev' + (d.state === 'down' ? ' down' : '') }, [el('i', { textContent: k.label, title: k.what }), name, down, rm]));
    });
    devsEl.appendChild(el('span', { textContent: 'Add' }));
    for (const kind of Object.keys(KINDS)) {
      const b = button(KINDS[kind].label, 'Add ' + KINDS[kind].what, () => { devSet.push({ kind, name: freshName(devSet, kind), state: 'up' }); changed('add:' + kind, 'name:' + (devSet.length - 1)); }, 'add:' + kind);
      b.disabled = hooked || !fits(devSet, kind);
      devsEl.appendChild(b);
    }
    const reset = button('Reset', 'Go back to the demo\'s own devices', () => { devSet = defaultSet(); keepSet(storage, null); S.demo = '0'; apply(); refocus(['reset']); }, 'reset');
    reset.disabled = hooked;
    devsEl.appendChild(reset);
    const note = hooked ? 'The address\'s dv= sets the devices; open the page without it to change them here.'
      : !devSet.length ? 'No devices: add one to see it in the scene.'
        : S.demo === '1' ? 'The demo loop draws every device up; a change here stops it.' : fullNote(devSet);
    devsEl.appendChild(el('em', { textContent: note }));
    // a control that had the focus keeps it when the panel is built again
    if (had) refocus([had]);
  }

  /* Device down in the conditions, while the panel's set is drawn: the condition follows the set,
     so the button sets every device up while one is down, and otherwise sets the first device
     down that the silent Pi is not. With no such device it says so. */
  function downButton() {
    if (!running) return;
    if (devSet.some(d => d.state === 'down')) { allUp(); apply(); return; }
    const silentPi = isOn('pi_silent') ? devSet.find(d => d.kind === 'pi') : null, d = devSet.find(x => x !== silentPi);
    if (d) { d.state = 'down'; keepSet(storage, devSet); apply(); return; }
    apply();
    if (devsEl) devsEl.lastChild.textContent = 'Device down needs a device: add one first.';
  }

  /* The review bar's buttons, built once. */
  function build() {
    if (built) return; built = true;
    const OPTS = KW.OPTS;
    document.querySelectorAll('.rv .grp[data-key]').forEach(g => {
      const k = g.dataset.key;
      for (const [v, label] of Object.entries(OPTS[k])) {
        const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
        b.addEventListener('click', () => { if (k === 'is') { S.demo = '0'; E.restartTurns(performance.now()); } else KW.hooks.fixed.add(k); set(k, v); }); g.appendChild(b);
      }
    });
    const condsEl = document.getElementById('conds');
    for (const c of CONDS) { const b = document.createElement('button'); b.textContent = c.name; b.dataset.id = c.key; b.addEventListener('click', () => { S.demo = '0'; if (c.id === 'device_down' && usesSet()) downButton(); else toggle(c.key); }); condsEl.appendChild(b); }
    { const b = document.createElement('button'); b.textContent = 'Clear'; b.addEventListener('click', () => { S.demo = '0'; if (running && usesSet()) allUp(); set('on', ''); }); condsEl.appendChild(b); }
    // the Devices panel, a row of its own before the reviewer's notes
    devsEl = el('div', { className: 'grp devs', id: 'devs' });
    devsEl.setAttribute('role', 'group'); devsEl.setAttribute('aria-label', 'Devices');
    const rv = document.getElementById('rv'); rv.insertBefore(devsEl, rv.querySelector('details'));
    const evsEl = document.getElementById('evs');
    const evButton = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); evsEl.appendChild(b); };
    evButton('Ad blocked', () => { addFly(performance.now()); refreshSub(); });
    evButton('Five ads', () => { for (let i = 0; i < 5; i++) addFly(performance.now() + i * 40); refreshSub(); });
    evButton('Swat now', () => E.startSwat(performance.now()));
    for (const [k, e] of Object.entries(EVENTS)) evButton(e.name, () => fire(k));
    swatNote = document.createElement('em'); evsEl.appendChild(swatNote);
    document.getElementById('demo').addEventListener('click', () => { demoAt = 0; demoI = -1; set('demo', S.demo === '1' ? '0' : '1'); });
    document.getElementById('hide').addEventListener('click', e => { e.stopPropagation(); set('bar', '0'); });
    document.getElementById('full').addEventListener('click', e => {
      e.stopPropagation(); set('bar', '0');
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    });
    document.getElementById('surface').addEventListener('click', () => { if (running && S.bar === '0') set('bar', '1'); });
  }

  /* The demo loop: each step sets the conditions and the quiet scene, and may add flies, start a
     swat or play an event. */
  function tick(t) {
    if (S.demo !== '1' || t < demoAt) return;
    demoI = (demoI + 1) % DEMO.length; const d = DEMO[demoI]; demoAt = t + d.dur;
    if (d.is) S.is = d.is; stepDevices = d.dv ? ST.listFromHook(d.dv) : null; set('on', d.on);
    if (d.flies) for (let i = 0; i < d.flies; i++) setTimeout(() => addFly(performance.now() - 1000), 200 + i * 250);
    if (d.swat) setTimeout(() => { if (running && S.demo === '1') E.startSwat(performance.now()); }, d.swat);
    if (d.ev) setTimeout(() => { if (running && S.demo === '1') fire(d.ev); }, 1500);
  }

  KW.demo = {
    running: () => running,
    /* Starts the demo: the bar, invented flies every few seconds, and the conditions in the address,
       where the short aliases are turned into the entries' keys. */
    start() {
      S = KW.opts; E = KW.engine; running = true;
      const hv = KW.hooks.hv, n = +hv('st');
      streams = streamsFor(n >= 1 && n <= STREAMS.length ? Math.floor(n) : STREAMS.length, SHOWS.includes(hv('sm')) ? hv('sm') : 'names');
      S.on = S.on.split(',').filter(Boolean).map(a => ALIAS[a] || a).join(',');
      if (!devSet) devSet = loadSet(storage);
      // device_down asked for by the address, with nothing of the set down: the first device that
      // the silent Pi is not shows down, for this page alone, so that the condition has a device
      if (usesSet() && isOn('device_down') && !downOf(listOf(devSet, { piSilent: isOn('pi_silent') })).length) {
        const silentPi = isOn('pi_silent') ? devSet.find(d => d.kind === 'pi') : null, d = devSet.find(x => x !== silentPi);
        if (d) d.state = 'down';
      }
      build();
      flyTimer = setInterval(() => { if (Math.random() < .6) { addFly(performance.now()); refreshSub(); } }, 5200);
      apply();
    },
    /* The address's test hooks: f=<flies>, which come at -5000 ms, or at fa=<ms>, e=<event>, sw=1
       to start a swat. The event and the swat wait 300 ms, except with time frozen by t=, when
       they start before the first frame, the event before the flies, so that a fly that comes
       with it is the cat's, as it would be live. A frozen picture must not depend on how many
       frames the browser paints before the timer fires. */
    hooks() {
      const hv = KW.hooks.hv, freeze = KW.hooks.frozen, at = hv('fa') !== undefined && Number.isFinite(+hv('fa')) ? +hv('fa') : -5000;
      const flies = () => { if (hv('f')) for (let i = 0; i < +hv('f'); i++) E.addFly(at + i); };
      const event = () => { if (running && hv('e') && EVENTS[hv('e')]) fire(hv('e')); };
      const swat = () => { if (running && hv('sw')) E.startSwat(freeze ? KW.hooks.t : performance.now()); };
      if (freeze) { event(); flies(); swat(); } else { flies(); setTimeout(() => { event(); swat(); }, 300); }
    },
    stop() { running = false; clearInterval(flyTimer); S.demo = '0'; stepDevices = null; },
    /* Applies the demo's settings again, after the settings screen changed something. */
    refresh() { if (running) apply(); },
    tick,
    /* The quiet line, the events and the streams, for the tests. */
    quietFor, captionOf, EVENTS, STREAMS, streamsFor, detailFor,
    /* The devices, for the tests: the kinds and the default set, the rules the panel keeps, and
       the panel's set as it stands. */
    SET_KEY, KINDS, DEFAULT_SET, nameMax, cleanName, freshName, fits, readSet, loadSet, listOf, named, downWords, fullNote,
    devices: () => (devSet ? devSet.map(d => Object.assign({}, d)) : null),
    note(text) { if (swatNote) swatNote.textContent = text; }
  };
})(window.KW);
