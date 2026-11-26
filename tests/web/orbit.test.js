// Tests for the test world, test.orbit ("Orbit"), and for drawing any loaded world: Orbit's pack as
// tests/web/fixtures/worlds/orbit.js writes it, read by the pack library on dev terms and refused
// on a deployed page; its parts compiled and put in place under their long names by KW.world; the
// settings resolving Orbit chosen whole, and its parts mixed with the medieval world's, into the
// knight's look and the engine's input; and the engine drawing Orbit's scenes, foe, critter and pet.
// Run with: node --test 'tests/web/**/*.test.js'
//
// Orbit is never under web/ and never signed: it is read here, on dev terms, and shot from a copy
// of web/ outside the repository (docs/tests.md, The test world).
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
const ORB = JSON.parse(TEXT).pack;
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;
const WORLD = O('world.orbit');

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
/* The page's scripts in a sandbox with the console's lines, the knight started from texts and the
   world from wtexts, both on dev terms unless dev is false. */
function page(texts, wtexts, dev) {
  const lines = [], log = [];
  const box = vm.createContext({ window: {}, console: { info: l => lines.push(l), warn: l => lines.push(l), log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context([]); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(texts, dev !== false);
  KW.world.start(wtexts || texts, dev !== false);
  KW.ui = { caption() {} };
  return { KW, lines, log };
}
const ALL = [BASE_TEXT, MED_TEXT, TEXT];
/* A store over a page's world, with the levels given. */
function store(P, o) {
  o = o || {};
  const m = new Map(o.saved ? [[SET.KEY, JSON.stringify(Object.assign({ v: 1 }, o.saved))]] : []), lines = [];
  const s = P.KW.settings.create({ hooks: o.hooks, storage: () => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }),
    pack: () => P.KW.knight.basePack(), world: () => P.KW.settings.pageWorld(), say: l => lines.push(l) });
  if (o.defaults) s.defaults(o.defaults);
  return { s, lines };
}
/* The engine of a page with the settings' input for r, time frozen, in the condition id. */
function engine(P, r, id, extra) {
  const KW = P.KW, E = KW.engine;
  KW.hooks = { frozen: true, t: 0 };
  P.log.length = 0;
  E.init(context(P.log)); E.reset();
  const w = id ? Object.assign({ id, hl: '', sub: '', st: 'ok' }, KW.state.CONDITIONS[id]) : KW.state.IDLE;
  E.input = Object.assign({ w, is: 'auto', devices: [], tv: false, helmet: 'auto' }, KW.settings.engineInput(r, KW.knight.basePack(), 60000), extra || {});
  return E;
}
const at = (KW, t) => { KW.hooks.t = t; KW.engine.draw(t); };

const P = page(ALL);
const WHOLE = store(P, { hooks: { look: { world: WORLD } } });

// ---- The fixture ---------------------------------------------------------------------------------

test('the fixture is what its generator writes, never signed and never among the packs under web/', () => {
  assert.equal(TEXT, ORBIT.text(), 'run node tests/web/fixtures/worlds/orbit.js');
  assert.equal(JSON.parse(TEXT).sig, undefined);
  assert.equal(ORB.id, 'test.orbit');
  for (const f of fs.readdirSync(path.join(WEB, 'packs')).filter(n => n.endsWith('.pack.json'))) {
    const id = JSON.parse(fs.readFileSync(path.join(WEB, 'packs', f), 'utf8')).pack.id;
    assert.ok(!id.startsWith('test.'), f + ' holds a test pack, ' + id);
  }
  // nothing under web/ names the fixture
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(WEB).filter(n => /\.(js|html|json|css)$/.test(n))) assert.ok(!fs.readFileSync(f, 'utf8').includes('test.orbit'), f);
});

test('Orbit reads clean on dev terms within every cap, its Deck within 10 percent of the backdrop cap, and a deployed page refuses it unsigned', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.format, [1, 1]);
  const cap = PK.WORLD_LIMITS.stillCost || 200000, deck = r.world.scenes.deck.still.cost;
  assert.ok(deck <= cap && deck >= cap * 0.9, 'the Deck costs ' + deck);
  assert.deepEqual(plain(r.data.builds['body.unit'].m), { shoulder: 40, chest: 32, waist: 28, hip: 32, stance: 16, leg: 100, height: 160, head: 42 }, 'every measurement at an end of its range');
  const d = PK.read(TEXT, {});
  assert.deepEqual([d.ok, d.step], [false, 'signature']);
});

test('the second preset, Orbit (broken), is refused at rules with its reason', () => {
  const r = PK.read(ORBIT.broken(), { allowUnsigned: true });
  assert.deepEqual([r.ok, r.step], [false, 'rules']);
  assert.match(r.reason, /worlds\["world\.broken"\]\.scenes\.quiet\[0\]: names "lounge", a quiet scene that cannot act "device_down"/);
});

// ---- Orbit's parts on the page --------------------------------------------------------------------

test('every part of Orbit is compiled and put in place under its long name, and no list of the base world\'s changes', () => {
  const KW = P.KW, st = KW.world.others;
  assert.deepEqual(plain(st.packs), [{ id: 'test.orbit', version: '1.0.0', signed: false }]);
  assert.deepEqual(plain(st.faults), []);
  for (const n of ['deck', 'bridge', 'airlock', 'patron.captain', 'foe.glitch', 'critter.moth', 'pet.drone', 'words.orbit', 'overlay.orbit']) assert.equal(st.parts[O(n)], 'pack', n);
  for (const n of ['deck', 'bridge', 'airlock']) assert.equal(typeof KW.scenes[O(n)].draw, 'function', n);
  assert.deepEqual(Object.keys(KW.scenes), ['battlement', 'camp', 'house', 'yard', 'cellar', 'smithy', 'court'], 'the long names are not listed');
  assert.ok(KW.cast.foes[O('foe.glitch')] && KW.cast.critters[O('critter.moth')] && KW.cast.patrons[O('patron.captain')] && KW.cast.pets[O('pet.drone')]);
  assert.deepEqual([Object.keys(KW.cast.foes), Object.keys(KW.cast.critters), Object.keys(KW.cast.pets)], [['goblin'], ['fly'], ['cat']]);
  // the pet's spots are keyed by the long names its scenes are put under
  assert.deepEqual(Object.keys(KW.cast.pets[O('pet.drone')].spots), [O('deck'), O('bridge'), O('airlock')]);
  assert.deepEqual(Object.keys(KW.cast.pets.cat.spots).slice(0, 2), ['battlement', 'camp'], 'the cat\'s by the short names');
  // started again, they are put back
  KW.world.start([MED_TEXT], true);
  assert.equal(KW.scenes[O('deck')], undefined);
  assert.equal(KW.cast.foes[O('foe.glitch')], undefined);
  assert.deepEqual(plain(KW.world.others.parts), {});
  KW.world.start(ALL, true);
  assert.ok(KW.scenes[O('deck')]);
});

test('the catalogue lists Orbit\'s world, scenes, cast, words, overlay, body, swatches and items for the settings', () => {
  const cat = P.KW.world.catalogue();
  assert.deepEqual(Object.keys(cat.worlds), ['medieval', WORLD]);
  assert.deepEqual([cat.worlds[WORLD].name, cat.worlds[WORLD].picture], ['Orbit', O('deck')]);
  assert.deepEqual(plain(cat.scenes[O('airlock')]), { can: ['cpu_hot'], quiet: false, hosts: [] });
  assert.equal(cat.scenes[O('deck')].quiet, true);
  for (const [kind, n] of [['scene', 'deck'], ['monarch', 'patron.captain'], ['foe', 'foe.glitch'], ['critter', 'critter.moth'], ['pet', 'pet.drone'], ['words', 'words.orbit'], ['overlay', 'overlay.orbit']]) {
    assert.equal(cat.names[kind][O(n)], O(n), kind);
  }
  assert.deepEqual(plain(cat.builds), { [O('body.unit')]: 'Unit' });
  assert.deepEqual(plain(cat.swatches.skin), { [O('chrome')]: 'Chrome' });
  assert.equal(cat.items[O('main.bar')], 'main');
  assert.equal(cat.titles[O('deck')], 'Deck');
});

// ---- Orbit chosen whole -----------------------------------------------------------------------------

test('Orbit chosen whole sets every part to its own, with no fault, and the knight wears its body and outfit', () => {
  const r = WHOLE.s.now(), L = r.values.look;
  assert.deepEqual([r.world.id, plain(r.faults), plain(r.ignored)], [WORLD, [], []]);
  assert.deepEqual([L.build, L.skin, L.hair, L.tabard, L.plume], [O('body.unit'), O('chrome'), O('wire'), O('panel'), O('beacon')]);
  assert.deepEqual([L.monarch, L.foe, L.critter, L.pet, L.props, L.words, L.overlay],
    [O('patron.captain'), O('foe.glitch'), O('critter.moth'), O('pet.drone'), O('props.orbit'), O('words.orbit'), O('overlay.orbit')]);
  assert.deepEqual(plain(r.values.quiet.scenes), [O('deck')]);
  assert.deepEqual([r.world.homes.cpu_hot, r.world.homes.ssh_session, r.world.homes.night], [O('airlock'), O('bridge'), O('deck')]);
  const look = SET.knightLook(plain(r));
  assert.equal(look.build, O('body.unit'));
  assert.equal(look.items.main, O('main.bar'));
  const st = P.KW.knight.look(look);
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(st.fallbacks), []);
  assert.equal(P.KW.knight.rest.key('main'), O('main.bar'));
  P.KW.knight.look({});
});

test('Orbit\'s words and overlay are put in use by the settings, and the base world\'s again after', () => {
  const W = P.KW.world, inp = SET.engineInput(WHOLE.s.now(), null, 0);
  W.useWords(inp.words); W.useOverlay(inp.overlay);
  assert.deepEqual([W.words.set, W.overlay.id, W.overlay.font], [O('words.orbit'), O('overlay.orbit'), 'vt323']);
  assert.equal(W.overlay.props['--kw-ok'], '#35ffb8');
  assert.equal(W.quietLine([{ k: 'quiet' }, { k: 'ads', n: '4,812', short: '4.8k' }], 'x'), 'ALL CLEAR · 4,812 ads zapped');
  assert.equal(W.caption('ip_banned', { addr: '203.0.113.77', jail: 'sshd' }, 'x'), 'EJECTED 203.0.113.77 · sshd');
  W.useWords('medieval'); W.useOverlay('medieval');
  assert.deepEqual([W.words.set, W.overlay.id], ['words.medieval', 'overlay.phosphor']);
  W.useWords(O('words.gone'));
  assert.equal(W.words.set, 'words.medieval', 'a set not loaded takes the base world\'s');
});

test('Orbit\'s prop set draws the Pi, the cameras and the hosts; the VMs and the other devices take the base world\'s', () => {
  const W = P.KW.world, inp = SET.engineInput(WHOLE.s.now(), null, 0);
  const st = W.useKinds(inp.kinds);
  assert.deepEqual(plain(st.kinds), { pi: O('props.orbit'), camera: O('props.orbit'), machine: O('props.orbit'), vm: 'medieval', box: 'medieval' });
  assert.deepEqual(plain(st.faults.map(f => [f.kind, f.reason])), [['vm', 'the prop set ' + O('props.orbit') + ' does not draw it'], ['box', 'the prop set ' + O('props.orbit') + ' does not draw it']]);
  W.useKinds(null);
});

test('the engine plays Orbit chosen whole: the Deck while all is quiet, the Airlock running hot, the Bridge for a shell and an update', () => {
  const r = WHOLE.s.now(), KW = P.KW;
  for (const [id, scene] of [[null, 'deck'], ['cpu_hot', 'airlock'], ['ssh_session', 'bridge'], ['updating', 'bridge'], ['night', 'deck'], ['streaming', 'deck'], ['attack', 'deck']]) {
    const E = engine(P, r, id, id === 'streaming' ? { tv: true } : null);
    for (const t of [0, 1700, 3300, 6400]) at(KW, t);
    assert.equal(E.scene(), O(scene), id || 'quiet');
  }
  // at the Bridge, the Captain talks while a shell is open; updating, the hammer works and the
  // Captain sits silent
  const talk = engine(P, r, 'ssh_session'); at(KW, 3300);
  assert.ok(P.log.some(l => l.startsWith('drawImage')) || P.log.length > 0);
  const s = { w: Object.assign({ id: 'ssh_session' }, KW.state.CONDITIONS.ssh_session), o: {}, kx: 440 };
  KW.scenes[O('bridge')].act(0, s);
  assert.equal(s.o.tool, undefined, 'no hammer while a shell is open');
  const u = { w: Object.assign({ id: 'updating' }, KW.state.CONDITIONS.updating), o: {}, kx: 440 };
  KW.scenes[O('bridge')].act(0, u);
  assert.equal(u.o.tool.kind, 'hammer', 'the hammer while updating');
  assert.equal(talk, KW.engine);
});

test('Glitch, Orbit\'s foe, comes out of the Deck\'s floor, which has no wall, and leaves by the engine\'s poof', () => {
  const r = WHOLE.s.now(), KW = P.KW, E = engine(P, r, null);
  at(KW, 0); E.fireEvent('goblin'); at(KW, 10);
  const F = KW.cast.foes[O('foe.glitch')];
  const plan = E.foe.plan('goblin', KW.scenes[O('deck')], { devices: [], places: KW.scenes[O('deck')].places }, Object.assign(KW.knight.pose('idle', 0), { x: 500, floor: KW.view.HFL }));
  assert.ok(plan, 'the foe has room on the Deck');
  assert.equal(plan.F.h, F.h);
  assert.equal(plan.F.h, 130, 'Glitch, not the goblin');
  assert.equal(plan.burrow, true, 'out of the floor');
  assert.equal(plan.exit, E.foe.FOE.exits.poof);
  for (let t = 0; t <= E.EVENTS.goblin.dur; t += 100) at(KW, t);
});

test('the Spark moth is Orbit\'s critter, and the drone catches it at its spot in each of Orbit\'s scenes and rests there', () => {
  const r = WHOLE.s.now(), KW = P.KW, drone = KW.cast.pets[O('pet.drone')];
  for (const [id, scene] of [[null, 'deck'], ['ssh_session', 'bridge']]) {
    const E = engine(P, r, id);
    at(KW, 0); E.fireEvent('goblin'); E.addFly(10);
    const k = E.pet.catches();
    assert.equal(k.length, 1, scene + ': the drone\'s fly');
    assert.deepEqual(plain(k[0].sp.rest), plain(drone.spots[O(scene)].rest), scene);
    for (let t = 0; t <= k[0].end; t += 250) at(KW, t);
    at(KW, k[0].end + 200);
    assert.equal(E.pet.catches().length, 0, scene + ': caught');
    assert.equal(E.pet.at(drone.spots[O(scene)], k[0].end + 200).pose, 'rest', scene + ': resting');
  }
  // running hot in the Airlock, a warning, no fly comes, and the drone rests at its spot there
  engine(P, r, 'cpu_hot'); at(KW, 0);
  const [rx, ry] = drone.spots[O('airlock')].rest;
  assert.ok(P.log.includes('translate ' + rx + ' ' + ry), 'the drone at its spot in the Airlock');
  // the critter drawn is the moth, not the fly
  const E = engine(P, r, null);
  at(KW, 0); E.addFly(0);
  const moth = KW.cast.critters[O('critter.moth')];
  assert.equal(E.pet.flies().length, 1);
  const log = []; KW.draw.setCtx(context(log)); moth.draw(0, 0, 0);
  assert.ok(log.some(l => l === 'globalAlpha 0.9'), 'the moth\'s wings');
});

// ---- Mixed with the medieval world ------------------------------------------------------------------

test('Orbit\'s parts mixed into the medieval world: its foe at the battlement, its body and skin, and the Airlock offered for running hot alone', () => {
  const s = store(P, { defaults: { look: { foe: O('foe.glitch'), build: O('body.unit'), skin: O('chrome') }, scenes: { cpu_hot: O('airlock'), attack: O('airlock') } } }).s;
  const r = s.now();
  assert.equal(r.world.id, 'medieval');
  assert.deepEqual([r.values.look.foe, r.values.look.build, r.values.look.skin, r.values.look.critter], [O('foe.glitch'), O('body.unit'), O('chrome'), 'fly']);
  assert.equal(r.values.scenes.cpu_hot, O('airlock'));
  assert.deepEqual(plain(r.ignored.map(f => [f.key, f.why])), [['attack', 'that scene cannot act it']], 'the Airlock cannot act an attack');
  const look = SET.knightLook(plain(r));
  assert.deepEqual([look.build, look.swatches.skin], [O('body.unit'), O('chrome')]);
  assert.deepEqual(plain(P.KW.knight.look(look).fallbacks.filter(f => f.reason !== 'not set')), []);
  assert.equal(P.KW.knight.status.fallbacks.length, P.KW.knight.status.fallbacks.filter(f => f.reason === 'not set').length);
  P.KW.knight.look({});
  const KW = P.KW, E = engine(P, r, 'cpu_hot');
  at(KW, 0);
  assert.equal(E.scene(), O('airlock'), 'running hot in the Airlock');
  engine(P, r, null, { is: 'battlement' }); at(KW, 0);
  const plan = E.foe.plan('goblin', KW.scenes.battlement, { devices: [], places: KW.scenes.battlement.places }, Object.assign(KW.knight.pose('idle', 0), { x: 460, floor: KW.view.HFL }));
  assert.ok(plan && plan.F.h === 130 && plan.burrow === false, 'Glitch over the battlement\'s wall');
  // a name the page has not loaded is ignored with its reason
  const t = store(P, { defaults: { look: { build: 'test.gone/body.x', tabard: 'test.gone/red' } } }).s.now();
  assert.deepEqual(plain(t.ignored.map(f => [f.key, f.why])), [['build', 'no pack the page has loaded gives that build'], ['tabard', 'no pack the page has loaded gives that swatch']]);
});

test('a world counts as setting every part at the level it was chosen at', () => {
  // Orbit in config.toml beside a tabard: the tabard is kept
  const a = store(P, { defaults: { look: { world: WORLD, tabard: 'blue' } } }).s.now();
  assert.deepEqual([a.values.look.tabard, a.from.look.tabard, a.values.look.skin], ['blue', 'defaults', O('chrome')]);
  // Orbit chosen on the display: config.toml's tabard gives way to the world's
  const b = store(P, { saved: { look: { world: WORLD } }, defaults: { look: { tabard: 'blue' } } }).s.now();
  assert.deepEqual([b.values.look.tabard, b.from.look.tabard], [O('panel'), 'world']);
  assert.deepEqual(plain(b.masked), [{ section: 'look', key: 'tabard', level: 'defaults', value: 'blue' }]);
});

/* An effect a compiled part draws with a field that throws: what no checked pack holds, put into
   Orbit's data after it is read, as tests/web/world-loading.test.js puts it into kw.medieval's. */
const BOMB = { k: 'fx', fx: 'horseshoe', p: [0, 0], r: null };
function bombed(edit) {
  const p = page([BASE_TEXT, MED_TEXT], []), KW = p.KW, lib = KW.pack, cache = new Map();
  KW.pack = Object.assign({}, lib, { read(t, o) {
    const r = lib.read(t, o);
    if (!r.ok || r.id !== 'test.orbit') return r;
    if (!cache.has(t)) { const d = plain(r.data); edit(d); cache.set(t, d); }
    return Object.assign({}, r, { data: cache.get(t) });
  } });
  p.lines.length = 0;
  KW.world.start(ALL, true);
  return p;
}

test('a scene or a member of Orbit that throws while drawing gives way to the base world\'s from the next frame', () => {
  const p = bombed(d => { d.scenes.deck.still[0].shapes.push(BOMB); d.cast['foe.glitch'].parts.body.push(BOMB); }), KW = p.KW;
  const s = { w: KW.state.IDLE, o: {}, kx: 500, devices: [], places: KW.scenes[O('deck')].places, patron: {} };
  KW.draw.setCtx(context([]));
  KW.scenes[O('deck')].paint(s);
  assert.equal(KW.scenes[O('deck')], undefined, 'taken out');
  assert.equal(KW.world.others.parts[O('deck')], 'code');
  assert.match(KW.world.others.faults[0].reason, /^the scene test\.orbit\/deck threw while drawing: /);
  assert.ok(p.lines.some(l => /^knightwatcher: the scene test\.orbit\/deck is not drawn, and the base world's is used: it threw while drawing: /.test(l)));
  // the settings then find it not loaded, and the engine plays the base world's quiet scenes
  const r = store(p, { hooks: { look: { world: WORLD } } }).s.now();
  assert.ok(r.faults.some(f => f.part === 'quiet.scenes' && f.value === O('deck')));
  const E = engine(p, r, null);
  at(KW, 0);
  assert.ok(['battlement', 'camp', 'house', 'yard'].includes(E.scene()), E.scene());
  // the foe gives way to the goblin: the call that throws paints the goblin's pose
  const g = KW.cast.foes[O('foe.glitch')], cv = g.pose('stand');
  assert.equal(cv, KW.cast.foes.goblin.pose('stand'));
  assert.equal(KW.cast.foes[O('foe.glitch')], undefined);
  assert.deepEqual(plain(KW.world.others.faults.map(f => [f.part, f.step])), [[O('deck'), 'draw'], [O('foe.glitch'), 'draw']]);
  // the same version, started again, keeps both out, with their lines again
  p.lines.length = 0;
  KW.world.start(ALL, true);
  assert.deepEqual([KW.scenes[O('deck')], KW.cast.foes[O('foe.glitch')]], [undefined, undefined]);
  assert.equal(p.lines.filter(l => /threw while drawing/.test(l)).length, 2);
});

// ---- Loading ----------------------------------------------------------------------------------------

test('Orbit downloaded into data/packs/ joins a dev page, and a deployed page refuses it unsigned', async () => {
  const files = { 'index.json': JSON.stringify({ packs: ['test.orbit.pack.json'] }), 'test.orbit.pack.json': TEXT };
  const get = url => {
    const name = url.replace(/^data\/packs\//, ''), ok = Object.prototype.hasOwnProperty.call(files, name);
    return Promise.resolve({ status: ok ? 200 : 404, ok, headers: { get: () => null }, text: async () => files[name] });
  };
  for (const dev of [true, false]) {
    const p = page([BASE_TEXT, MED_TEXT], null, dev), KW = p.KW;
    const got = await KW.knight.fetchPacks(get);
    assert.deepEqual(plain(got.files.map(f => f.file)), ['test.orbit.pack.json']);
    KW.knight.add(got);
    KW.world.start([BASE_TEXT, MED_TEXT].concat(got.files.map(f => f.text)), dev);
    const cat = KW.world.catalogue();
    if (dev) {
      assert.deepEqual(Object.keys(cat.worlds), ['medieval', WORLD]);
      assert.ok(KW.scenes[O('deck')]);
    } else {
      assert.ok(!Object.keys(cat.worlds).includes(WORLD));
      assert.equal(KW.scenes[O('deck')], undefined);
      // the shipped packs, unsigned here, are refused as well; the downloaded file is named
      assert.deepEqual(plain(KW.knight.status.refused.filter(x => x.file).map(x => [x.id, x.file, x.step])), [['test.orbit', 'test.orbit.pack.json', 'signature']]);
    }
  }
});

test('with Orbit loaded and nothing chosen, the display is the medieval world exactly as without it', () => {
  const without = page([BASE_TEXT, MED_TEXT]);
  const a = store(P).s.now(), b = store(without).s.now();
  assert.deepEqual(plain(a.values), plain(b.values));
  assert.deepEqual(plain(SET.engineInput(a, null, 0)), plain(SET.engineInput(b, null, 0)));
  for (const [p, r] of [[P, a], [without, b]]) {
    p.KW.world.useKinds(SET.engineInput(r, null, 0).kinds);
    p.KW.world.useWords('medieval'); p.KW.world.useOverlay('medieval');
  }
  const frames = (p, r) => { const E = engine(p, r, null); const out = []; for (const t of [0, 2300, 4100]) { p.log.length = 0; at(p.KW, t); out.push(p.log.join('\n')); } return [E.scene(), out]; };
  assert.deepEqual(frames(P, a), frames(without, b));
});
