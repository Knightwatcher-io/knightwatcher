/* Knightwatcher: the demo. Invented conditions, a bar of controls for reviewing every scene and
   state, and a loop that shows them in turn. The page runs it when it has never had a valid state
   file, or when the address carries ?demo. Every name, address and figure here is invented. */
(function (KW) {
  'use strict';
  const ST = KW.state;

  /* The invented conditions, highest first. Each id is the contract's; alias is the short name
     the address and the regression screenshots also accept. Scene and level come from KW.state. */
  const CONDS = [
    { id: 'attack',              alias: 'attack', name: 'Attack',      hl: 'UNDER ATTACK',   sub: '212 failed SSH logins in 10 min · fail2ban is banning' },
    { id: 'wan_down',            alias: 'wan',    name: 'WAN down',    hl: 'WAN DOWN',       sub: 'no route to the internet for 4 min · LAN and DNS are fine' },
    { id: 'container_unhealthy', alias: 'sick',   name: 'Unhealthy',   hl: 'RADARR UNWELL',  sub: 'unhealthy for 12 min · restarted twice · API not answering' },
    { id: 'disk_full',           alias: 'disk',   name: 'Disk',        hl: 'DISK 93% FULL',  sub: "/data has 640 GB left · about 11 days at this week's pace" },
    { id: 'backup_overdue',      alias: 'backup', name: 'Backup',      hl: 'BACKUP OVERDUE', sub: 'last restic snapshot was 41 h ago · the 03:00 run failed' },
    { id: 'pi_silent',           alias: 'pi',     name: 'Pi silent',   hl: 'PI SILENT',      sub: 'no heartbeat from the Raspberry Pi for 22 min' },
    { id: 'device_down',          alias: 'device',  name: 'Device down',  hl: 'VAULT DOWN',     sub: 'no answer for 6 min' },
    { id: 'cpu_hot',             alias: 'cpu',    name: 'CPU',         hl: 'RUNNING HOT',    sub: 'CPU 96% · load 14.2 on 12 cores for 9 min · Plex transcoding' },
    { id: 'memory_tight',        alias: 'swap',   name: 'Swap',        hl: 'SWAP FILLING',   sub: 'swap 91% and climbing · RAM 93% · VS Code server holds most' },
    { id: 'ssh_session',         alias: 'ssh',    name: 'SSH session', hl: 'AT COURT',       sub: 'admin signed in from 192.0.2.10 · session open 14 min' },
    { id: 'updating',            alias: 'update', name: 'Updating',    hl: 'UPDATING',       sub: 'Komodo is redeploying 3 stacks · sonarr, radarr, bazarr' },
    { id: 'streaming',           alias: 'plex',   name: 'Plex stream', hl: 'STREAMING',      sub: '' },
    { id: 'night',               alias: 'night',  name: 'Night',       hl: 'NIGHT WATCH',    sub: 'nothing to report since 23:40' }
  ].map(c => { const k = ST.CONDITIONS[c.id]; return Object.assign(c, { lv: k.lv, level: k.level, st: ST.LEVELS[k.level], scene: k.scene }); });
  const ALIAS = {}; for (const c of CONDS) ALIAS[c.alias] = c.id;
  /* The events, each with its type in the contract and the text and parts the collector would
     send for it; the caption shown is built from the parts in the world's words. */
  const EVENTS = {
    goblin: { name: 'IP banned',   type: 'ip_banned',   text: 'BANNED 203.0.113.77 · sshd',          parts: { addr: '203.0.113.77', jail: 'sshd' } },
    crate:  { name: 'Import',      type: 'import',      text: 'IMPORTED · The Night Shift S02E04',   parts: { title: 'The Night Shift S02E04' } },
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
    { on: '', is: 'camp', dur: 9000, ev: 'crate' }, { on: '', is: 'yard', dur: 8000 }, { on: 'ssh_session', dur: 9000 }, { on: 'cpu_hot', dur: 7000 },
    { on: 'streaming', dur: 7000 }, { on: 'container_unhealthy', dur: 7000 }, { on: 'backup_overdue', dur: 7000 }, { on: '', is: 'house', dur: 6500, ev: 'feast' },
    { on: 'disk_full', dur: 8000 }, { on: 'pi_silent', dur: 7000 }, { on: 'device_down', is: 'camp', dur: 8000, dv: 'pi,camera,camera,machine!,vm,box' },
    { on: 'updating', dur: 8000 }, { on: 'wan_down', dur: 6500 },
    { on: 'attack,memory_tight,ssh_session', dur: 8000 }, { on: 'night', dur: 8000 } ];

  /* How long each quiet scene lasts while they take turns in the demo, unless the settings set a
     length (docs/page.md). */
  const DEMO_TURN_MS = 60 * 1000;

  let streams = streamsFor(3, 'names');
  let S = null, E = null, running = false, built = false, flyTimer = 0, demoAt = 0, demoI = -1, swatNote = null, stepDevices = null;
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
  const active = () => { const on = S.on.split(',').filter(Boolean); return CONDS.filter(c => on.includes(c.id)); };
  const isOn = id => S.on.split(',').includes(id);
  const IDLE = Object.assign({}, ST.IDLE);

  function addFly(t) { if (!running) return; ads++; E.addFly(t); }
  function refreshSub() { if (!active().length) KW.ui.quietText(idleLine()); }
  function fire(type) { E.fireEvent(type, captionOf(type)); }

  function set(k, v) { S[k] = String(v); apply(); }
  function toggle(id) { const on = S.on.split(',').filter(Boolean), i = on.indexOf(id); if (i < 0) on.push(id); else on.splice(i, 1); set('on', on.join(',')); }
  function apply() {
    document.querySelectorAll('.rv .grp[data-key]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(S[g.dataset.key] === b.dataset.v))));
    document.querySelectorAll('#conds button[data-id]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b.dataset.id))));
    document.getElementById('demo').setAttribute('aria-pressed', String(S.demo === '1'));
    document.body.classList.toggle('nobar', S.bar === '0');
    const act = active(), others = act.slice(1).filter(c => c.lv >= 3), list = demoList(), placed = ST.arrange(list);
    let w = act[0] || IDLE;
    if (w.id === 'streaming') w = Object.assign({}, w, { sub: detailFor(streams) });
    // device_down names the devices that are down and alert, as the collector would
    if (w.id === 'device_down') w = Object.assign({}, w, { place: ST.lookPlace(list.map((e, i) => (e && e.state === 'down' && e.alert ? i : -1)).filter(i => i >= 0), placed.at) });
    E.input = Object.assign({ w, is: S.is, turnMs: DEMO_TURN_MS, devices: placed.devices, tv: isOn('streaming'), helmet: S.h }, KW.ui.extras(DEMO_TURN_MS));
    KW.ui.show({ st: w.st, hl: w.hl, sub: w.sub, quiet: idleLine(), more: { n: others.length, crit: others.some(c => c.lv >= 4) },
      id: w.id, streams: ST.streamsOf(streams), behind: isOn('streaming') && w.id !== 'streaming' });
    // the helmet and the headline size go into the address only when the address or this bar set
    // them; otherwise they are the settings' (KW.hooks.fixed)
    const inHash = ([k]) => (k !== 'h' && k !== 'hs') || KW.hooks.fixed.has(k);
    history.replaceState(null, '', '#' + Object.entries(S).filter(inHash).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
  }

  /* The list of devices: that of the demo loop's step, else that of the address's dv=
     hook, else the Pi alone, down while it is silent, as before there were devices. */
  function demoList() {
    if (stepDevices && S.demo === '1') return stepDevices;
    if (KW.hooks.dv) return KW.hooks.dv;
    return [{ kind: 'pi', state: isOn('pi_silent') ? 'down' : 'up', alert: true }];
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
    for (const c of CONDS) { const b = document.createElement('button'); b.textContent = c.name; b.dataset.id = c.id; b.addEventListener('click', () => { S.demo = '0'; toggle(c.id); }); condsEl.appendChild(b); }
    { const b = document.createElement('button'); b.textContent = 'Clear'; b.addEventListener('click', () => { S.demo = '0'; set('on', ''); }); condsEl.appendChild(b); }
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
       where the short aliases are turned into the contract's ids. */
    start() {
      S = KW.opts; E = KW.engine; running = true;
      const hv = KW.hooks.hv, n = +hv('st');
      streams = streamsFor(n >= 1 && n <= STREAMS.length ? Math.floor(n) : STREAMS.length, SHOWS.includes(hv('sm')) ? hv('sm') : 'names');
      S.on = S.on.split(',').filter(Boolean).map(a => ALIAS[a] || a).join(',');
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
    note(text) { if (swatNote) swatNote.textContent = text; }
  };
})(window.KW);
