/* Knightwatch: the demo. Invented conditions, a bar of controls for reviewing every scene and
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
    { id: 'cpu_hot',             alias: 'cpu',    name: 'CPU',         hl: 'RUNNING HOT',    sub: 'CPU 96% · load 14.2 on 12 cores for 9 min · Plex transcoding' },
    { id: 'memory_tight',        alias: 'swap',   name: 'Swap',        hl: 'SWAP FILLING',   sub: 'swap 91% and climbing · RAM 93% · VS Code server holds most' },
    { id: 'ssh_session',         alias: 'ssh',    name: 'SSH session', hl: 'AT COURT',       sub: 'admin signed in from 192.0.2.10 · session open 14 min' },
    { id: 'updating',            alias: 'update', name: 'Updating',    hl: 'UPDATING',       sub: 'Komodo is redeploying 3 stacks · sonarr, radarr, bazarr' },
    { id: 'streaming',           alias: 'plex',   name: 'Plex stream', hl: 'NOW SHOWING',    sub: '1 stream, direct play · The Night Shift S02E04' },
    { id: 'night',               alias: 'night',  name: 'Night',       hl: 'NIGHT WATCH',    sub: 'nothing to report since 23:40' }
  ].map(c => { const k = ST.CONDITIONS[c.id]; return Object.assign(c, { lv: k.lv, level: k.level, st: ST.LEVELS[k.level], scene: k.scene }); });
  const ALIAS = {}; for (const c of CONDS) ALIAS[c.alias] = c.id;
  const EVENTS = {
    goblin: { name: 'IP banned',   cap: 'BANNED 203.0.113.77 · 6 probes for /.env' },
    crate:  { name: 'Import',      cap: 'IMPORTED · The Night Shift S02E04' },
    feast:  { name: 'Backup done', cap: 'BACKUP DONE · 2.1 GB added, 0 errors' } };
  const DEMO = [
    { on: '', is: 'battlement', dur: 9000, flies: 4, swat: 3200 }, { on: '', is: 'battlement', dur: 6000, ev: 'goblin' },
    { on: '', is: 'camp', dur: 9000, ev: 'crate' }, { on: '', is: 'yard', dur: 8000 }, { on: 'ssh_session', dur: 9000 }, { on: 'cpu_hot', dur: 7000 },
    { on: 'streaming', dur: 7000 }, { on: 'container_unhealthy', dur: 7000 }, { on: 'backup_overdue', dur: 7000 }, { on: '', is: 'house', dur: 6500, ev: 'feast' },
    { on: 'disk_full', dur: 8000 }, { on: 'pi_silent', dur: 7000 }, { on: 'updating', dur: 8000 }, { on: 'wan_down', dur: 6500 },
    { on: 'attack,memory_tight,ssh_session', dur: 8000 }, { on: 'night', dur: 8000 } ];

  /* How long each quiet scene lasts while they take turns in the demo. */
  const DEMO_TURN_MS = 60 * 1000;

  let S = null, E = null, running = false, built = false, flyTimer = 0, demoAt = 0, demoI = -1, swatNote = null;
  let ads = 4812;
  const idleLine = () => 'ALL QUIET · 29 up · backup 03:12 · ' + ads.toLocaleString('en-GB') + ' ads slain';
  const active = () => { const on = S.on.split(',').filter(Boolean); return CONDS.filter(c => on.includes(c.id)); };
  const isOn = id => S.on.split(',').includes(id);
  const IDLE = Object.assign({}, ST.IDLE);

  function addFly(t) { if (!running) return; ads++; E.addFly(t); }
  function refreshSub() { if (!active().length) KW.ui.quietText(idleLine()); }
  function fire(type) { E.fireEvent(type, EVENTS[type].cap); }

  function set(k, v) { S[k] = String(v); apply(); }
  function toggle(id) { const on = S.on.split(',').filter(Boolean), i = on.indexOf(id); if (i < 0) on.push(id); else on.splice(i, 1); set('on', on.join(',')); }
  function apply() {
    document.querySelectorAll('.rv .grp[data-key]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(S[g.dataset.key] === b.dataset.v))));
    document.querySelectorAll('#conds button[data-id]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b.dataset.id))));
    document.getElementById('demo').setAttribute('aria-pressed', String(S.demo === '1'));
    document.body.classList.toggle('nobar', S.bar === '0');
    const act = active(), w = act[0] || IDLE, others = act.slice(1).filter(c => c.lv >= 3);
    E.input = { w, is: S.is, turnMs: DEMO_TURN_MS, piOK: !isOn('pi_silent'), tv: isOn('streaming'), helmet: S.h };
    KW.ui.show({ st: w.st, hl: w.hl, sub: w.sub, quiet: idleLine(), more: { n: others.length, crit: others.some(c => c.lv >= 4) } });
    history.replaceState(null, '', '#' + Object.entries(S).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
  }

  /* The review bar's buttons, built once. */
  function build() {
    if (built) return; built = true;
    const OPTS = KW.OPTS;
    document.querySelectorAll('.rv .grp[data-key]').forEach(g => {
      const k = g.dataset.key;
      for (const [v, label] of Object.entries(OPTS[k])) {
        const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
        b.addEventListener('click', () => { if (k === 'is') { S.demo = '0'; E.restartTurns(performance.now()); } set(k, v); }); g.appendChild(b);
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
    if (d.is) S.is = d.is; set('on', d.on);
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
      S.on = S.on.split(',').filter(Boolean).map(a => ALIAS[a] || a).join(',');
      build();
      flyTimer = setInterval(() => { if (Math.random() < .6) { addFly(performance.now()); refreshSub(); } }, 5200);
      apply();
    },
    /* The address's test hooks: f=<flies>, e=<event>, sw=1 to start a swat. */
    hooks() {
      const hv = KW.hooks.hv, freeze = KW.hooks.t;
      if (hv('f')) for (let i = 0; i < +hv('f'); i++) E.addFly(-5000 + i);
      setTimeout(() => { if (!running) return; if (hv('e') && EVENTS[hv('e')]) fire(hv('e')); if (hv('sw')) E.startSwat(freeze || performance.now()); }, 300);
    },
    stop() { running = false; clearInterval(flyTimer); S.demo = '0'; },
    tick,
    note(text) { if (swatNote) swatNote.textContent = text; }
  };
})(window.KW);
