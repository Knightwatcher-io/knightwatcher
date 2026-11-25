// Tests for the whole swap of a world, with the test world, test.orbit ("Orbit"): Orbit chosen whole
// drives every scene, event, member of the cast, kind of device, word set and overlay the wall
// draws, and nothing of the medieval world's but the two kinds of device Orbit does not draw; the
// medieval world with each of Orbit's parts swapped in one at a time, and Orbit with each of the
// medieval world's, changes what that part draws and nothing else, with no throw, no part past a
// cap and no fallback but the ones expected; the medieval world returns exactly when Orbit is
// unchosen; a library of format 1.0 refuses Orbit at format; and one of format 1.1 refuses the copy
// of format 1.2 at format and reads the 1.1 file as this one does. Both refuse the base pack, of
// format 1.2 since its crossbow.
// Run with: node --test tests/web/
//
// The engine's reads of KW.scenes, KW.cast and KW.kinds are watched while it draws, so a test sees
// which scene, member and kind each frame was drawn from by the name the engine asked for.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const TEXT = fs.readFileSync(ORBIT.FILE, 'utf8');
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;
const WORLD = O('world.orbit');
const ALL = [BASE_TEXT, MED_TEXT, TEXT];
/* The packs as the library reads them, for the cost of a look. */
const READS = [PK.read(BASE_TEXT, { allowUnsigned: true }), PK.read(TEXT, { allowUnsigned: true })];

/* A canvas context that writes one line per call. */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { log.push(String(k) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => { log.push([String(k), ...a.map(x => (x && typeof x === 'object' ? 'canvas' : x))].join(' ')); };
    }
  });
}
/* The page's scripts in a sandbox with the console's lines, the knight and the world started from
   texts on dev terms. */
function page(texts) {
  const lines = [], log = [];
  const box = vm.createContext({ window: {}, console: { info: l => lines.push(l), warn: l => lines.push(l), log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context([]); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(texts, true);
  KW.world.start(texts, true);
  KW.ui = { caption() {} };
  return { KW, lines, log };
}
/* A store over a page's world, with the levels given, and what it saves. */
function store(P, o) {
  o = o || {};
  const m = new Map(o.saved ? [[SET.KEY, JSON.stringify(Object.assign({ v: 1 }, o.saved))]] : []), lines = [];
  const s = P.KW.settings.create({ hooks: o.hooks, storage: () => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }),
    pack: () => P.KW.knight.basePack(), world: () => P.KW.settings.pageWorld(), say: l => lines.push(l) });
  if (o.defaults) s.defaults(o.defaults);
  return s;
}
/* Puts what the settings resolved into the knight, the kinds, the words and the overlay, as
   main.js does. */
function dress(P, r) {
  const KW = P.KW, inp = SET.engineInput(r, null, 0);
  KW.knight.look(SET.knightLook(plain(r)));
  KW.world.useKinds(inp.kinds); KW.world.useWords(inp.words); KW.world.useOverlay(inp.overlay);
}
/* Devices in every place: a Pi, two cameras (one gone), a host, a VM gone and a kind no set knows. */
const DEVICES = [{ place: 'pie', kind: 'pi', ok: true, alert: true }, { place: 'h1', kind: 'camera', ok: true, alert: true }, { place: 'h2', kind: 'camera', ok: false, alert: true },
  { place: 'g1', kind: 'machine', ok: true, alert: true }, { place: 'g2', kind: 'vm', ok: false, alert: false }, { place: 'g3', kind: 'box', ok: true, alert: true }];
/* The engine of a page with the settings' input for r, time frozen, in the condition id. */
function engine(P, r, id, extra) {
  const KW = P.KW, E = KW.engine;
  KW.hooks = { frozen: true, t: 0 };
  P.log.length = 0;
  E.init(context(P.log)); E.reset();
  const w = id ? Object.assign({ id, hl: '', sub: '' }, KW.state.CONDITIONS[id]) : KW.state.IDLE;
  E.input = Object.assign({ w, is: 'auto', devices: DEVICES, tv: id === 'streaming', helmet: 'auto' }, KW.settings.engineInput(r, KW.knight.basePack(), 60000), extra || {});
  return E;
}
const at = (KW, t) => { KW.hooks.t = t; KW.engine.draw(t); };

/* Runs fn while watching what the engine reads of KW.scenes, KW.cast and KW.kinds by name: each
   read as 'scene <name>', 'foes <name>' (and critters, pets, patrons), or 'kind <kind> <pack>', the
   pack its drawing was compiled from. Returns the reads, sorted. */
function watching(KW, fn) {
  const seen = new Set(), was = { scenes: KW.scenes, kinds: KW.kinds, cast: Object.assign({}, KW.cast) };
  const spy = (o, tag, name) => new Proxy(o, { get(t, k, rcv) {
    const v = Reflect.get(t, k, rcv);
    if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k)) seen.add(tag + ' ' + (name ? name(k, v) : k));
    return v;
  } });
  KW.scenes = spy(was.scenes, 'scene');
  for (const r of ['foes', 'critters', 'pets', 'patrons']) KW.cast[r] = spy(was.cast[r], r);
  KW.kinds = spy(was.kinds, 'kind', (k, v) => k + ' ' + String(v && v.from ? v.from : 'code').replace(/#\d+$/, ''));
  try { fn(); } finally { KW.scenes = was.scenes; KW.kinds = was.kinds; Object.assign(KW.cast, was.cast); }
  return [...seen].sort();
}

/* What the knight looks like in each frame the tour draws: its food, hearts and eyes, and whether
   the crate came down. */
function spying(KW) {
  const K = KW.knight, P = KW.props, draw = K.draw, crate = P.crateHD, got = { food: 0, angry: 0, crate: 0 };
  K.draw = o => { if (o.food) got.food++; if (o.eyes === 'angry') got.angry++; return draw(o); };
  P.crateHD = (...a) => { got.crate++; return crate(...a); };
  return { got, done() { K.draw = draw; P.crateHD = crate; } };
}

/* The tour every swap is drawn through: the first quiet scene with the foe's event and a fly, each
   quiet scene in turn, the crate and the feast, and every condition, a fly coming where it may.
   Returns what the knight did. */
const CONDITIONS = ['attack', 'wan_down', 'container_unhealthy', 'disk_full', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'ssh_session', 'updating', 'streaming', 'night'];
function tour(P, r) {
  const KW = P.KW, sp = spying(KW), scenes = [];
  try {
    let E = engine(P, r, null);
    at(KW, 0); E.fireEvent('goblin'); E.addFly(5);
    for (const t of [460, 1300, 1700, 2300, 3450]) at(KW, t);
    scenes.push(['quiet', E.scene()]);
    E = engine(P, r, null, { turnMs: 1000 });
    for (const t of [0, 1000, 2000, 3000, 4000]) { at(KW, t); scenes.push(['turn ' + t, E.scene()]); }
    for (const [ev, ts] of [['crate', [0, 1700, 3000]], ['feast', [0, 1800]]]) {
      E = engine(P, r, null);
      at(KW, 0); E.fireEvent(ev);
      for (const t of ts) at(KW, t);
    }
    for (const id of CONDITIONS) {
      E = engine(P, r, id);
      at(KW, 0); E.addFly(5);
      for (const t of [1250, 3450]) at(KW, t);
      scenes.push([id, E.scene()]);
    }
  } finally { sp.done(); }
  return { got: sp.got, scenes };
}
/* What a resolved look costs, by the library's own count. */
function cost(r) {
  const L = PK.resolve(READS, SET.knightLook(plain(r)));
  return { shapes: L.shapes, cost: L.cost };
}

const P = page(ALL);
const WHOLE = store(P, { hooks: { look: { world: WORLD } } });
const MEDIEVAL = store(P);

// ---- Orbit chosen whole -----------------------------------------------------------------------------

/* Every scene, member and kind the tour draws with Orbit chosen whole. */
const ORBIT_READS = ['critters ' + O('critter.moth'), 'foes ' + O('foe.glitch'), 'kind box kw.medieval', 'kind camera test.orbit', 'kind machine test.orbit',
  'kind pi test.orbit', 'kind vm kw.medieval', 'patrons ' + O('patron.captain'), 'pets ' + O('pet.drone'), 'scene ' + O('airlock'), 'scene ' + O('bridge'), 'scene ' + O('deck')];
const ORBIT_HOMES = { attack: 'deck', wan_down: 'deck', container_unhealthy: 'deck', disk_full: 'deck', backup_overdue: 'deck', pi_silent: 'deck', device_down: 'deck',
  cpu_hot: 'airlock', ssh_session: 'bridge', updating: 'bridge', streaming: 'deck', night: 'deck' };

test('Orbit chosen whole draws every condition, event and turn from its own scenes, cast and devices, and of the medieval world only the kinds it lacks', () => {
  assert.deepEqual(CONDITIONS.slice().sort(), Object.keys(P.KW.state.CONDITIONS).sort(), 'the tour covers every condition');
  const r = WHOLE.now(), KW = P.KW;
  dress(P, r);
  let out;
  const seen = watching(KW, () => { out = tour(P, r); });
  assert.deepEqual(seen, ORBIT_READS);
  for (const [what, scene] of out.scenes) assert.equal(scene, O(ORBIT_HOMES[what] || 'deck'), what);
  // Glitch struck, the crate came down, the feast eaten
  assert.ok(out.got.angry > 0 && out.got.crate > 0 && out.got.food > 0, JSON.stringify(out.got));
  assert.deepEqual(plain(KW.world.others.faults), []);
  assert.deepEqual(plain(KW.world.devices.faults.map(f => f.kind)), ['vm', 'box'], 'the two kinds Orbit does not draw, and no more');
  assert.equal(KW.knight.source, 'pack');
  assert.deepEqual(plain(KW.knight.status.fallbacks.filter(f => f.reason !== 'not set')), []);
});

test('Orbit chosen whole puts its words and its overlay in use, its lines fitted to 52 and 44 as the collector fits its own', () => {
  const r = WHOLE.now(), W = P.KW.world, len = s => Array.from(s).length;
  dress(P, r);
  assert.deepEqual([W.words.set, W.overlay.id, W.overlay.font], [O('words.orbit'), O('overlay.orbit'), 'vt323']);
  const Q = (ads, short, at) => W.quietLine([{ k: 'quiet' }, { k: 'up', n: '29' }, { k: 'backup', at: at || '03:12' }, { k: 'ads', n: ads, short }], 'OWN');
  assert.equal(Q('4,812', '4,812'), 'ALL CLEAR · 29 up · backup 03:12 · 4,812 ads zapped');
  // 52 characters with the count whole; one digit more takes the short count, then the shortest
  // template, and a longer backup part drops the count
  assert.equal(len(Q('12,345', '12.3k')), 52, 'at the limit');
  assert.equal(Q('123,456', '123k'), 'ALL CLEAR · 29 up · backup 03:12 · 123k ads zapped');
  assert.equal(Q('1,234,567,890', '12345.6M'), 'ALL CLEAR · 29 up · backup 03:12 · 12345.6M zapped');
  assert.equal(Q('1,234,567', '1.2M', '03:12 Sun'), 'ALL CLEAR · 29 up · backup 03:12 Sun · 1.2M zapped');
  assert.equal(Q('1,234,567', '1.2M', '03:12 on Sunday'), 'ALL CLEAR · 29 up · backup 03:12 on Sunday');
  for (const n of ['1', '12,345', '1,234,567,890']) assert.ok(len(Q(n, n)) <= W.QUIET_MAX);
  const C = (type, parts) => W.caption(type, parts, 'OWN');
  assert.equal(C('ip_banned', { addr: '203.0.113.77', jail: 'sshd' }), 'EJECTED 203.0.113.77 · sshd');
  const v6 = '2001:db8:85a3:1234::8a2e:370:7334';
  assert.equal(C('ip_banned', { addr: v6, jail: 'sshd' }), 'EJECTED ' + v6, 'too long for the jail too: the shorter template');
  const cut = C('import', { title: 'An Extraordinarily Long Film Title: The Sequel' });
  assert.equal(cut, 'DOCKED · An Extraordinarily Long Film Title…');
  assert.equal(len(cut), W.CAPTION_MAX);
  assert.equal(C('backup_done', { at: 'y'.repeat(37) }), 'LOGGED ' + 'y'.repeat(37), '44 exactly');
  assert.equal(C('backup_done', { at: 'y'.repeat(38) }), 'LOGGED ' + 'y'.repeat(36) + '…');
  // the overlay's every property, each level's colours near the edges of its band
  assert.deepEqual([W.overlay.props['--kw-ok'], W.overlay.props['--kw-warn'], W.overlay.props['--kw-crit'], W.overlay.props['--kw-info'], W.overlay.props['--kw-sleep']],
    ['#35ffb8', '#ff8a1f', '#ff4060', '#36f6ff', '#1f9a4c']);
});

// ---- One part at a time --------------------------------------------------------------------------------

/* The reads of the tour in the medieval world with nothing set. */
const MEDIEVAL_READS = ['critters fly', 'foes goblin', 'kind box kw.medieval', 'kind camera kw.medieval', 'kind machine kw.medieval', 'kind pi kw.medieval', 'kind vm kw.medieval',
  'patrons a', 'pets cat', 'scene battlement', 'scene camp', 'scene cellar', 'scene court', 'scene house', 'scene smithy', 'scene yard'];

test('the tour of the medieval world with nothing set reads only the medieval world\'s parts, Orbit loaded beside it', () => {
  const r = MEDIEVAL.now(), KW = P.KW;
  dress(P, r);
  const seen = watching(KW, () => tour(P, r));
  assert.deepEqual(seen, MEDIEVAL_READS);
});

/* Each of Orbit's parts, swapped into the medieval world alone: the levels that choose it, and the
   reads it changes, those it takes away and those it adds. A part of the knight's look changes no
   read; the settings and the knight say where it is drawn from. */
const ITEMS = [['main', 'main.bar'], ['helmet', 'helm.dome'], ['plume', 'plume.aerial'], ['hair', 'hair.wire'], ['torso', 'torso.panel'], ['pauldrons', 'pauldrons.panel'],
  ['arms', 'arms.panel'], ['gauntlets', 'gauntlets.panel'], ['legs', 'legs.panel'], ['boots', 'boots.panel'], ['back', 'back.panel']];
const INTO_MEDIEVAL = [
  ['the body', { look: { build: O('body.unit') } }],
  ['the skin', { look: { skin: O('chrome') } }],
  ['the hair', { look: { hair: O('wire') } }],
  ['the tabard', { look: { tabard: O('panel') } }],
  ['the plume', { look: { plume: O('beacon') } }],
  ...ITEMS.map(([slot, id]) => ['the ' + slot + ' item', { look: { items: { [slot]: O(id) } } }]),
  ['the patron', { look: { monarch: O('patron.captain') } }, ['patrons a'], ['patrons ' + O('patron.captain')]],
  ['the foe', { look: { foe: O('foe.glitch') } }, ['foes goblin'], ['foes ' + O('foe.glitch')]],
  ['the critter', { look: { critter: O('critter.moth') } }, ['critters fly'], ['critters ' + O('critter.moth')]],
  // the drone has no spot in a medieval scene, so the knight takes every fly there
  ['the pet', { look: { pet: O('pet.drone') } }, ['pets cat'], ['pets ' + O('pet.drone')]],
  ['the prop set', { look: { props: O('props.orbit') } }, ['kind camera kw.medieval', 'kind machine kw.medieval', 'kind pi kw.medieval'],
    ['kind camera test.orbit', 'kind machine test.orbit', 'kind pi test.orbit'], ['vm', 'box']],
  ['the words', { look: { words: O('words.orbit') } }],
  ['the overlay', { look: { overlay: O('overlay.orbit') } }],
  // the Deck in turn alone; the camp, a quiet scene that is no condition's, is not drawn
  ['the quiet scenes', { quiet: { scenes: [O('deck')] } }, ['scene camp'], ['scene ' + O('deck')]],
  // a scene of Orbit's for each condition it can act that has a scene of its own (a device down and
  // tight memory play in the quiet scene of the moment): the scenes only conditions play in are not
  // drawn, and the quiet ones, the smithy among them, still take turns
  ['the scene of each condition', { scenes: Object.fromEntries(Object.entries(ORBIT_HOMES).filter(([c]) => P.KW.state.CONDITIONS[c].scene).map(([c, s]) => [c, O(s)])) },
    ['scene cellar', 'scene court'], ['scene ' + O('airlock'), 'scene ' + O('bridge'), 'scene ' + O('deck')]]
];
const swapped = (base, drop, add) => base.filter(x => !(drop || []).includes(x)).concat(add || []).sort();

for (const [what, hooks, drop, add, kinds] of INTO_MEDIEVAL) {
  test(`the medieval world with Orbit's ${what.slice(4)} alone: drawn with it, nothing else changed, no throw, no fault, within the caps`, () => {
    const KW = P.KW, s = store(P, { hooks }), r = s.now();
    assert.deepEqual([r.world.id, plain(r.faults), plain(r.ignored)], ['medieval', [], []]);
    dress(P, r);
    let out;
    const seen = watching(KW, () => { out = tour(P, r); });
    assert.deepEqual(seen, swapped(MEDIEVAL_READS, drop, add));
    assert.equal(KW.knight.source, 'pack', 'the knight drew every frame from the pack');
    assert.deepEqual(plain(KW.knight.status.fallbacks.filter(f => f.reason !== 'not set')), []);
    assert.deepEqual(plain(KW.world.others.faults), []);
    assert.deepEqual(plain(KW.world.devices.faults.map(f => f.kind)), kinds || []);
    const c = cost(r);
    assert.ok(c.shapes <= PK.LIMITS.lookShapes && c.cost <= PK.LIMITS.lookCost, JSON.stringify(c));
    // the part is the one in use
    const L = SET.knightLook(plain(r));
    if (hooks.look && hooks.look.build) assert.equal(L.build, hooks.look.build);
    if (hooks.look && hooks.look.items) for (const [slot, id] of Object.entries(hooks.look.items)) assert.equal(L.items[slot], id);
    for (const k of ['skin', 'hair', 'tabard', 'plume']) if (hooks.look && hooks.look[k]) assert.equal(L.swatches[k], hooks.look[k]);
    if (hooks.look && hooks.look.words) assert.equal(KW.world.words.set, hooks.look.words);
    if (hooks.look && hooks.look.overlay) assert.equal(KW.world.overlay.id, hooks.look.overlay);
    if (hooks.look && hooks.look.pet) assert.equal(KW.engine.pet.now(), KW.cast.pets[hooks.look.pet]);
    // the medieval world's conditions where Orbit gives no scene for them
    const scenes = Object.fromEntries(out.scenes);
    if (!hooks.scenes) assert.equal(scenes.disk_full, 'cellar');
    else assert.deepEqual([scenes.disk_full, scenes.cpu_hot, scenes.ssh_session], [O('deck'), O('airlock'), O('bridge')]);
  });
}

/* Each of the medieval world's parts, swapped into Orbit alone, chosen at the same level as the
   world so that it is kept beside it. */
const INTO_ORBIT = [
  ['the build', { build: 'c' }],
  ['the skin', { skin: 'deep' }],
  ['the hair', { hair: 'black', hair_style: 'tied' }],
  ['the tabard', { tabard: 'wine' }],
  ['the plume', { plume: 'gold', plume_style: 'feather' }],
  ['the weapon', { weapon: 'sword_and_shield', shield: 'kite' }],
  ['the helmet', { helmet: 'kettle' }],
  ['the gear', { body: 'cuirass', shoulders: 'lames', arms: 'mail', hands: 'leather', legs: 'mail', feet: 'sabatons', back: 'cloak' }],
  ['the patron', { monarch: 'b' }, ['patrons ' + O('patron.captain')], ['patrons b']],
  ['the foe', { foe: 'goblin' }, ['foes ' + O('foe.glitch')], ['foes goblin']],
  ['the critter', { critter: 'fly' }, ['critters ' + O('critter.moth')], ['critters fly']],
  // the cat has no spot in Orbit's scenes, so the unit takes every fly there
  ['the pet', { pet: 'cat' }, ['pets ' + O('pet.drone')], ['pets cat']],
  ['the prop set', { props: 'medieval' }, ['kind camera test.orbit', 'kind machine test.orbit', 'kind pi test.orbit'],
    ['kind camera kw.medieval', 'kind machine kw.medieval', 'kind pi kw.medieval'], []],
  ['the words', { words: 'medieval' }],
  ['the overlay', { overlay: 'medieval' }]
];

for (const [what, look, drop, add, kinds] of INTO_ORBIT) {
  test(`Orbit with the medieval world's ${what.slice(4)} alone: drawn with it, nothing else changed, no throw, no fault, within the caps`, () => {
    const KW = P.KW, r = store(P, { hooks: { look: Object.assign({ world: WORLD }, look) } }).now();
    assert.deepEqual([r.world.id, plain(r.faults), plain(r.ignored)], [WORLD, [], []]);
    for (const k of Object.keys(look)) assert.equal(r.values.look[k], look[k], k);
    dress(P, r);
    let out;
    const seen = watching(KW, () => { out = tour(P, r); });
    assert.deepEqual(seen, swapped(ORBIT_READS, drop, add));
    for (const [w, scene] of out.scenes) assert.equal(scene, O(ORBIT_HOMES[w] || 'deck'), w);
    assert.equal(KW.knight.source, 'pack');
    assert.deepEqual(plain(KW.knight.status.fallbacks.filter(f => f.reason !== 'not set')), []);
    assert.deepEqual(plain(KW.world.others.faults), []);
    assert.deepEqual(plain(KW.world.devices.faults.map(f => f.kind)), kinds || ['vm', 'box']);
    const c = cost(r);
    assert.ok(c.shapes <= PK.LIMITS.lookShapes && c.cost <= PK.LIMITS.lookCost, JSON.stringify(c));
    if (look.words) assert.equal(KW.world.words.set, 'words.medieval');
    if (look.overlay) assert.equal(KW.world.overlay.id, 'overlay.phosphor');
  });
}

test('Orbit with the medieval world\'s scenes: its quiet scenes and a scene for each condition, the rest Orbit\'s own', () => {
  const KW = P.KW;
  const r = store(P, { hooks: { look: { world: WORLD }, quiet: { scenes: ['camp', 'yard'] }, scenes: { cpu_hot: 'yard', ssh_session: 'court', updating: 'smithy', disk_full: 'cellar', attack: 'battlement' } } }).now();
  assert.deepEqual([plain(r.faults), plain(r.ignored)], [[], []]);
  dress(P, r);
  let out;
  const seen = watching(KW, () => { out = tour(P, r); });
  const sc = Object.fromEntries(out.scenes);
  assert.deepEqual([sc.quiet, sc['turn 1000'], sc.cpu_hot, sc.ssh_session, sc.updating, sc.disk_full, sc.attack, sc.wan_down, sc.night],
    ['camp', 'yard', 'yard', 'court', 'smithy', 'cellar', 'battlement', O('deck'), O('deck')]);
  // the Captain on the medieval throne, Glitch at the camp, the drone resting nowhere it has no spot
  assert.deepEqual(seen.filter(x => x.startsWith('scene ')), ['scene battlement', 'scene camp', 'scene cellar', 'scene court', 'scene smithy', 'scene yard', 'scene ' + O('deck')].sort());
  assert.deepEqual(seen.filter(x => !x.startsWith('scene ')), ORBIT_READS.filter(x => !x.startsWith('scene ')));
  assert.deepEqual(plain(KW.world.others.faults), []);
});

// ---- Unchosen ---------------------------------------------------------------------------------------

test('Orbit unchosen on the display: the medieval world returns exactly, frame for frame, with nothing of Orbit\'s read', () => {
  const KW = P.KW, s = store(P), before = s.now();
  const frames = r => {
    dress(P, r);
    const out = [];
    for (const [id, t] of [[null, 0], [null, 2300], ['ssh_session', 3450], ['cpu_hot', 2300], ['night', 2300]]) {
      const E = engine(P, r, id);
      at(KW, t);
      out.push([E.scene(), P.log.join('\n')]);
    }
    return [out, KW.knight.status.fallbacks.map(f => f.used), KW.world.words.set, KW.world.overlay.id, plain(KW.world.devices.kinds)];
  };
  const was = frames(before);
  assert.deepEqual(plain(s.chooseWorld(WORLD)), []);
  const orbit = s.now();
  assert.equal(orbit.world.id, WORLD);
  assert.notDeepEqual(frames(orbit)[0], was[0], 'Orbit draws otherwise');
  assert.deepEqual(plain(s.chooseWorld('medieval')), []);
  const after = s.now();
  assert.deepEqual(plain(after.values), plain(before.values));
  assert.deepEqual(plain(SET.engineInput(after, KW.knight.basePack(), 60000)), plain(SET.engineInput(before, KW.knight.basePack(), 60000)));
  let back;
  const seen = watching(KW, () => { back = frames(after); });
  assert.deepEqual(back, was);
  assert.deepEqual(seen.filter(x => x.includes('test.orbit')), []);
  // chosen part by part and each cleared, the same
  for (const k of ['build', 'foe', 'critter', 'pet', 'words', 'overlay', 'props']) {
    const id = { build: O('body.unit'), foe: O('foe.glitch'), critter: O('critter.moth'), pet: O('pet.drone'), words: O('words.orbit'), overlay: O('overlay.orbit'), props: O('props.orbit') }[k];
    assert.equal(s.choosePart(k, id), true, k);
    s.clearPart(k);
  }
  assert.deepEqual(plain(s.now().values), plain(before.values));
});

// ---- The format ------------------------------------------------------------------------------------

test('a library of format 1.0 refuses Orbit at format, and this one reads it', () => {
  const src = fs.readFileSync(path.join(WEB, 'js/pack.js'), 'utf8');
  const old = src.replace('const FORMAT = Object.freeze([1, 3]);', 'const FORMAT = Object.freeze([1, 0]);');
  assert.notEqual(old, src, 'the library\'s format is swapped in the sandbox');
  const mod = { exports: {} };
  vm.runInContext(old, vm.createContext({ module: mod, require: p => require(path.join(WEB, 'js', p)), console }), { filename: 'pack-1.0.js' });
  const r = mod.exports.read(TEXT, { allowUnsigned: true });
  assert.deepEqual([r.ok, r.step, r.id], [false, 'format', 'test.orbit']);
  assert.match(r.reason, /pack\.format: is 1\.1, newer than this engine's 1\.0/);
  // the base pack, of format 1.2 since its crossbow, it refuses at format as well
  assert.deepEqual(plain(mod.exports.read(BASE_TEXT, { allowUnsigned: true })), { ok: false, step: 'format', reason: 'pack.format: is 1.2, newer than this engine\'s 1.0', id: 'kw.base' });
  assert.equal(PK.read(TEXT, { allowUnsigned: true }).ok, true);
});

test('a library of format 1.1 refuses Orbit\'s copy of format 1.2 at format, reads the 1.1 file as before, and this one reads both', () => {
  const FIRE = fs.readFileSync(ORBIT.FIRE_FILE, 'utf8');
  const src = fs.readFileSync(path.join(WEB, 'js/pack.js'), 'utf8');
  const old = src.replace('const FORMAT = Object.freeze([1, 3]);', 'const FORMAT = Object.freeze([1, 1]);');
  assert.notEqual(old, src, 'the library\'s format is swapped in the sandbox');
  const mod = { exports: {} };
  vm.runInContext(old, vm.createContext({ module: mod, require: p => require(path.join(WEB, 'js', p)), console }), { filename: 'pack-1.1.js' });
  assert.deepEqual(JSON.parse(JSON.stringify(mod.exports.read(FIRE, { allowUnsigned: true }))), { ok: false, step: 'format', reason: 'pack.format: is 1.2, newer than this engine\'s 1.1', id: 'test.orbit' });
  const was = mod.exports.read(TEXT, { allowUnsigned: true }), now = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(was.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(now)), JSON.parse(JSON.stringify(was)), 'the 1.1 file reads the same on both');
  // the base pack, of format 1.2 since its crossbow, is refused at format as Orbit's copy is
  assert.deepEqual(plain(mod.exports.read(BASE_TEXT, { allowUnsigned: true })), { ok: false, step: 'format', reason: 'pack.format: is 1.2, newer than this engine\'s 1.1', id: 'kw.base' });
  const fire = PK.read(FIRE, { allowUnsigned: true });
  assert.deepEqual([fire.ok, fire.id, fire.version, fire.format], [true, 'test.orbit', '1.1.0', [1, 2]]);
});
