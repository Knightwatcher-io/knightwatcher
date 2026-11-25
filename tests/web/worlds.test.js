// Tests for worlds as presets: the medieval preset in web/packs/medieval.pack.json, what the page
// lists of the worlds and prop sets it has loaded (KW.world.catalogue, KW.settings.pageWorld), the
// rule that resolves a world against the parts set beside it (KW.settings.resolve), the long names
// the settings take, the store's chooseWorld, the scene each condition plays in from the world in
// use (the engine's homes), and the devices drawn per kind from the prop set chosen for each
// (KW.world.useKinds). Run with: node --test tests/web/
//
// A second world pack, kw.test, is made here: a prop set that draws two kinds, copied from
// props.medieval with the stamps their lamps are drawn from, and a preset built from the base pack's
// gear and kw.medieval's scenes and cast.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const ST = require('../../web/js/state.js');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const MED = JSON.parse(TEXT).pack;
const BASE = JSON.parse(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8')).pack;
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
/* The scripts index.html loads, in its order, but the carriers and the files that drive the page
   (demo, main). */
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const clone = plain;
const ALL = { pi: 'medieval', camera: 'medieval', machine: 'medieval', vm: 'medieval', box: 'medieval' };
const HOMES = { attack: 'battlement', wan_down: 'battlement', container_unhealthy: 'house', disk_full: 'cellar', backup_overdue: 'house', pi_silent: 'house',
  cpu_hot: 'yard', ssh_session: 'court', updating: 'smithy', night: 'house' };

/* The stamps of kw.medieval a part names (a lamp's lit and dark drawings, a use shape), by name, so
   that a copy of the part in another pack carries them. */
function stampsOf(part) {
  const out = {}, walk = v => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if ((k === 'lit' || k === 'dark' || k === 'use') && typeof x === 'string' && MED.stamps[x]) out[x] = clone(MED.stamps[x]);
      else walk(x);
    }
  };
  walk(part);
  return out;
}
/* A second world pack: kw.test, with the prop set props.neon (the medieval camera and machine, with
   the stamps their lamps are drawn from) and the preset world.neon. edit(pack) changes it before it
   is written. */
function testPack(edit) {
  const kinds = MED.props['props.medieval'].kinds, M = 'kw.medieval/', copied = { camera: clone(kinds.camera), machine: clone(kinds.machine) };
  // format 1.4: the medieval machine stands on its stool, taller than the ground class box of 1.3
  const p = { id: 'kw.test', name: 'Test world', version: '1.0.0', format: [1, 4], licence: 'For the tests.', provides: ['props', 'worlds', 'stamps'],
    stamps: stampsOf(copied),
    props: { 'props.neon': { name: 'Neon devices', kinds: copied } },
    worlds: { 'world.neon': { name: 'Neon', body: 'kw.base/build.b',
      outfit: { items: Object.assign({}, ...Object.entries(BASE.defaults.items).map(([s, i]) => ({ [s]: 'kw.base/' + i })), { main: 'kw.base/main.arming', off: 'kw.base/off.round' }),
        swatches: { skin: 'kw.base/tan', hair: 'kw.base/black', tabard: 'kw.base/forest', plume: 'kw.base/gold' } },
      scenes: { quiet: [M + 'camp', M + 'yard'], for: Object.assign({}, ...Object.entries(HOMES).map(([c, s]) => ({ [c]: M + s })), { cpu_hot: M + 'camp' }) },
      cast: { patron: M + 'patron.b', foe: M + 'foe.goblin', critter: M + 'critter.fly', pet: M + 'pet.cat' },
      props: 'props.neon', overlay: M + 'overlay.phosphor', words: M + 'words.medieval', picture: M + 'yard' } } };
  if (edit) edit(p);
  return JSON.stringify({ kwpack: 1, pack: p });
}

/* The page's scripts in a sandbox, with the console's lines; KW.world.start(texts, true) is called
   as main.js calls it on a dev page. */
function page(texts) {
  const lines = [];
  const quiet = new Proxy({}, { set() { return true; }, get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
  const box = vm.createContext({ window: {}, console: { info: l => lines.push(l), warn: l => lines.push(l), log() {} },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => quiet }) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start([], false);
  if (texts) KW.world.start(texts, true);
  return { KW, lines };
}
const WITH = page([TEXT, testPack()]), CODE = page();
const CAT = plain(WITH.KW.settings.pageWorld());

/* A store over the page's world as WITH loaded it, the base pack in use, with the defaults given
   and saved choices; lines holds the console. */
function store(o) {
  o = o || {};
  const lines = [], m = new Map(o.saved ? [[SET.KEY, JSON.stringify(Object.assign({ v: 1 }, o.saved))]] : []);
  const s = SET.create({ hooks: o.hooks, storage: () => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }), pack: () => BASE,
    world: () => (o.world || CAT), say: l => lines.push(l) });
  if (o.defaults) s.defaults(o.defaults);
  return { s, lines, m };
}

/* ---- The preset ------------------------------------------------------------------------------ */

test('kw.medieval holds the medieval preset, complete, and it is what the page draws by itself', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  const w = r.data.worlds['world.medieval'];
  assert.deepEqual(Object.keys(r.data.worlds), ['world.medieval']);
  assert.deepEqual([w.name, w.body, w.picture, w.props, w.overlay, w.words], ['Medieval', 'kw.base/build.a', 'camp', 'props.medieval', 'overlay.phosphor', 'words.medieval']);
  assert.deepEqual(plain(w.cast), { patron: 'patron.a', foe: 'foe.goblin', critter: 'critter.fly', pet: 'pet.cat' });
  // its outfit is the base pack's defaults
  const own = id => 'kw.base/' + id;
  assert.equal(w.body, own(BASE.defaults.build));
  assert.deepEqual(plain(w.outfit.items), Object.fromEntries(Object.entries(BASE.defaults.items).map(([s, i]) => [s, own(i)])));
  assert.deepEqual(plain(w.outfit.swatches), Object.fromEntries(Object.entries(BASE.defaults.swatches).map(([s, i]) => [s, own(i)])));
  // its scenes are those the code gives each condition and the quiet scenes in turn
  for (const [c, k] of Object.entries(ST.CONDITIONS)) assert.equal(w.scenes.for[c], k.scene === null ? undefined : k.scene, c);
  assert.deepEqual(plain(w.scenes.quiet), SET.SCENES);
  assert.deepEqual(plain(w.scenes.quiet), plain(CODE.KW.engine.TURNS));
  // the rail's labels come from its words
  assert.deepEqual([MED.words['words.medieval'].labels.watcher, MED.words['words.medieval'].labels.patron, MED.words['words.medieval'].labels.pet], ['The knight', 'The monarch', 'The cat']);
});

test('the pack library refuses a preset that leaves out a part, a scene that is not quiet, or a scene that cannot act its condition', () => {
  const refused = (edit, want) => {
    const p = JSON.parse(TEXT); edit(p.pack.worlds['world.medieval']);
    const r = PK.read(JSON.stringify(p), { allowUnsigned: true });
    assert.equal(r.ok, false); assert.match(r.reason, want);
  };
  refused(w => { delete w.picture; }, /worlds\["world\.medieval"\]\.picture: is missing, and a preset must be complete/);
  refused(w => { w.scenes.quiet.push('cellar'); }, /names "cellar", a scene that is not quiet/);
  refused(w => { w.scenes.for.cpu_hot = 'court'; }, /names "court", a scene whose can does not list "cpu_hot"/);
});

/* ---- What the page has loaded ----------------------------------------------------------------- */

test('a page that reads kw.medieval lists its world, the other packs\' worlds and prop sets, and the long names of its parts', () => {
  assert.deepEqual(Object.keys(CAT.worlds), ['medieval', 'kw.test/world.neon']);
  assert.deepEqual([CAT.worlds.medieval.name, CAT.worlds.medieval.pack, CAT.worlds.medieval.picture], ['Medieval', 'kw.medieval', 'camp']);
  assert.deepEqual(CAT.worlds.medieval.words, MED.words['words.medieval'].labels);
  assert.deepEqual([CAT.worlds['kw.test/world.neon'].name, CAT.worlds['kw.test/world.neon'].picture], ['Neon', 'kw.medieval/yard']);
  assert.deepEqual(CAT.sets, { medieval: { name: 'Medieval devices', kinds: ['pi', 'camera', 'machine', 'vm', 'box'] }, 'kw.test/props.neon': { name: 'Neon devices', kinds: ['camera', 'machine'] } });
  assert.deepEqual(CAT.names.world, { 'kw.medieval/world.medieval': 'medieval' });
  assert.deepEqual(CAT.names.props, { 'kw.medieval/props.medieval': 'medieval' });
  assert.deepEqual(CAT.names.monarch, { 'kw.medieval/patron.a': 'a', 'kw.medieval/patron.b': 'b', 'kw.medieval/patron.c': 'c' });
  assert.deepEqual([CAT.names.foe, CAT.names.critter, CAT.names.pet, CAT.names.words, CAT.names.overlay],
    [{ 'kw.medieval/foe.goblin': 'goblin' }, { 'kw.medieval/critter.fly': 'fly' }, { 'kw.medieval/pet.cat': 'cat' }, { 'kw.medieval/words.medieval': 'medieval' }, { 'kw.medieval/overlay.phosphor': 'medieval' }]);
  assert.equal(CAT.names.scene['kw.medieval/cellar'], 'cellar');
  assert.deepEqual(CAT.scenes['kw.medieval/camp'], { can: MED.scenes.camp.can, quiet: true, hosts: MED.scenes.camp.hosts });
  // the base world's scenes come from its preset
  assert.deepEqual(CAT.quiet, SET.SCENES);
  assert.deepEqual(Object.fromEntries(Object.entries(CAT.homes).filter(([, s]) => s)), HOMES);
  // drawn from code, the base world is the code's, and nothing else is listed
  const code = plain(CODE.KW.settings.pageWorld());
  assert.deepEqual([code.worlds, code.sets, code.names, code.scenes, code.quiet], [{}, {}, { world: {}, monarch: {}, foe: {}, critter: {}, pet: {}, props: {}, overlay: {}, words: {}, scene: {} }, {}, undefined]);
  assert.deepEqual(Object.fromEntries(Object.entries(code.homes).filter(([, s]) => s)), HOMES);
});

test('with nothing set, the display is the same whether the base world comes from kw.medieval\'s preset or from code', () => {
  const a = store(), b = store({ world: plain(CODE.KW.settings.pageWorld()) });
  const pick = r => ({ values: r.values, from: r.from, world: r.world, masked: r.masked, faults: r.faults });
  assert.deepEqual(plain(pick(a.s.now())), plain(pick(b.s.now())));
  assert.deepEqual(plain(SET.engineInput(a.s.now(), BASE, 1000)), plain(SET.engineInput(b.s.now(), BASE, 1000)));
  assert.deepEqual(SET.knightLook(a.s.now()), {});
  assert.deepEqual(plain(SET.engineInput(a.s.now(), BASE, 1000).kinds), ALL);
  assert.deepEqual([a.lines, b.lines], [[], []]);
});

/* ---- The rule ------------------------------------------------------------------------------- */

const NEON = 'kw.test/world.neon';

test('a world counts as setting every part at the level it was chosen at: config.toml\'s world in a coat config.toml chooses', () => {
  const { s, lines } = store({ defaults: { look: { world: NEON, tabard: 'blue' } } });
  const r = s.now();
  assert.deepEqual(plain(r.world), { id: NEON, from: 'defaults', homes: Object.assign({}, HOMES, { cpu_hot: 'camp' }) });
  assert.deepEqual([r.values.look.tabard, r.from.look.tabard], ['blue', 'defaults'], 'set at the same level, the part wins');
  const L = r.values.look;
  assert.deepEqual([L.build, L.weapon, L.shield, L.skin, L.hair, L.plume, L.monarch, L.props, L.foe], ['b', 'sword_and_shield', 'round', 'tan', 'black', 'gold', 'b', 'kw.test/props.neon', 'goblin']);
  for (const k of ['build', 'weapon', 'skin', 'monarch', 'props', 'helmet']) assert.equal(r.from.look[k], 'world', k);
  assert.deepEqual([r.values.quiet.scenes, r.from.quiet.scenes, r.from.quiet.minutes], [['camp', 'yard'], 'world', 'built-in']);
  assert.deepEqual([r.values.scenes.cpu_hot, r.from.scenes.cpu_hot, r.values.scenes.attack], ['camp', 'world', 'battlement']);
  assert.deepEqual(r.from.display, { headline: 'built-in', clock: 'built-in', helmet_indoors: 'built-in' }, 'the display\'s preferences are not parts');
  assert.deepEqual([r.masked, r.faults, lines], [[], [], []]);
  // the knight wears the world's outfit, in the coat set beside it
  assert.deepEqual(SET.knightLook(r), { build: 'kw.base/build.b', items: { main: 'kw.base/main.arming', off: 'kw.base/off.round', hair: 'kw.base/hair.short', helmet: 'kw.base/helm.open',
    plume: 'kw.base/plume.crest', torso: 'kw.base/torso.tabard', pauldrons: 'kw.base/pauldrons.plate', arms: 'kw.base/arms.plate', gauntlets: 'kw.base/gauntlets.plate', legs: 'kw.base/legs.plate',
    boots: 'kw.base/boots.leather' }, swatches: { skin: 'kw.base/tan', hair: 'kw.base/black', tabard: 'kw.base/blue', plume: 'kw.base/gold' } });
  const e = SET.engineInput(r, BASE, 1000);
  assert.deepEqual(plain([e.turns, e.scenes, e.homes.cpu_hot, e.patron.id]), [['camp', 'yard'], {}, 'camp', 'b']);
  assert.deepEqual(plain(e.kinds), { pi: 'kw.test/props.neon', camera: 'kw.test/props.neon', machine: 'kw.test/props.neon', vm: 'kw.test/props.neon', box: 'kw.test/props.neon' });
});

test('a world chosen on the display takes over the parts config.toml sets, which are listed as masked', () => {
  const { s } = store({ saved: { look: { world: NEON } }, defaults: { look: { tabard: 'blue', monarch: 'c' }, quiet: { scenes: ['house'], minutes: 3 }, scenes: { cpu_hot: 'cellar' } } });
  const r = s.now();
  assert.deepEqual([r.values.look.tabard, r.from.look.tabard, r.values.look.monarch, r.from.look.monarch], ['forest', 'world', 'b', 'world']);
  assert.deepEqual([r.values.quiet.scenes, r.values.quiet.minutes, r.from.quiet.minutes], [['camp', 'yard'], 3, 'defaults'], 'the quiet scenes\' length is not a part');
  assert.deepEqual([r.values.scenes.cpu_hot, r.from.scenes.cpu_hot], ['camp', 'world']);
  assert.deepEqual(plain(r.masked), [{ section: 'look', key: 'tabard', level: 'defaults', value: 'blue' }, { section: 'look', key: 'monarch', level: 'defaults', value: 'c' },
    { section: 'quiet', key: 'scenes', level: 'defaults', value: ['house'] }, { section: 'scenes', key: 'cpu_hot', level: 'defaults', value: 'cellar' }]);
  // the engine is given only the scenes a level chose, and the world's own in homes
  assert.deepEqual(plain(SET.engineInput(r, BASE, 1000).scenes), {});
  // a part chosen on the display afterwards is kept over the world; the address beats both
  s.choose('look', 'tabard', 'wine');
  assert.deepEqual([s.now().values.look.tabard, s.now().from.look.tabard], ['wine', 'saved']);
  const h = store({ hooks: { look: { plume: 'white' } }, saved: { look: { world: NEON, plume: 'red' } } }).s.now();
  assert.deepEqual([h.values.look.plume, h.from.look.plume], ['white', 'hook']);
});

test('the base world chosen over config.toml\'s parts draws the page\'s own, and the knight is as before', () => {
  const { s } = store({ saved: { look: { world: 'medieval' } }, defaults: { look: { tabard: 'forest', weapon: 'longsword' } } });
  const r = s.now();
  assert.deepEqual([r.values.look.tabard, r.from.look.tabard, r.values.look.weapon, r.from.look.weapon], ['blue', 'world', 'greatsword', 'world']);
  assert.deepEqual(r.masked.map(m => m.key), ['weapon', 'tabard']);
  assert.deepEqual(SET.knightLook(r), {}, 'the base world\'s outfit is the base pack\'s defaults');
  assert.deepEqual(plain(SET.engineInput(r, BASE, 1000).patron), { id: 'a', skin: null, hair: null, robe: null });
  // with no level choosing a world, a part set anywhere wins as before
  const d = store({ defaults: { look: { tabard: 'forest' } } }).s.now();
  assert.deepEqual([d.values.look.tabard, d.from.look.tabard, d.world.from], ['forest', 'defaults', 'built-in']);
});

test('the items and devices tables resolve key by key under the same rule', () => {
  const { s } = store({ saved: { look: { devices: { camera: 'medieval' }, items: { helmet: 'kw.base/helm.kettle' } } },
    defaults: { look: { world: NEON, devices: { pi: 'kw.medieval/props.medieval', camera: 'kw.test/props.neon' }, items: { main: 'kw.base/main.mace', helmet: 'kw.base/helm.coif' } } } });
  const r = s.now();
  assert.deepEqual(r.values.look.devices, { pi: 'medieval', camera: 'medieval' });
  assert.deepEqual(r.from.look.devices, { pi: 'defaults', camera: 'saved' });
  assert.deepEqual(r.values.look.items, { main: 'kw.base/main.mace', helmet: 'kw.base/helm.kettle' });
  assert.deepEqual(plain(SET.engineInput(r, BASE, 1000).kinds), { pi: 'medieval', camera: 'medieval', machine: 'kw.test/props.neon', vm: 'kw.test/props.neon', box: 'kw.test/props.neon' });
  const look = SET.knightLook(r);
  assert.deepEqual([look.items.main, look.items.helmet], ['kw.base/main.mace', 'kw.base/helm.kettle'], 'a named item is drawn over the key for its slot');
  // chosen on the display, the world masks config.toml's tables too
  const m = store({ saved: { look: { world: 'medieval' } }, defaults: { look: { devices: { pi: 'kw.test/props.neon' }, items: { main: 'kw.base/main.mace' } } } }).s.now();
  assert.deepEqual([m.values.look.devices, m.values.look.items], [{}, {}]);
  assert.deepEqual(m.masked.map(x => x.key), ['items.main', 'devices.pi']);
});

test('a part of a world the page has not loaded keeps the base world\'s, with the reason in faults', () => {
  const cat = plain(CAT);
  const w = cat.worlds[NEON].preset;
  w.cast.patron = 'kw.gone/patron.z'; w.props = 'props.gone'; w.scenes.quiet = ['kw.gone/park', 'kw.medieval/cellar', 'kw.medieval/yard']; w.scenes.for.attack = 'kw.medieval/house';
  w.outfit.swatches.tabard = 'kw.gone/neon';
  const r = store({ world: cat, defaults: { look: { world: NEON } } }).s.now();
  assert.deepEqual([r.values.look.monarch, r.values.look.props, r.values.look.tabard, r.values.quiet.scenes, r.values.scenes.attack, r.world.homes.attack],
    ['a', 'medieval', 'blue', ['yard'], 'battlement', 'battlement']);
  assert.deepEqual(plain(r.faults), [
    { part: 'look.tabard', value: 'kw.gone/neon', why: 'not loaded' },
    { part: 'look.monarch', value: 'kw.gone/patron.z', why: 'not loaded' },
    { part: 'look.props', value: 'kw.test/props.gone', why: 'not loaded' },
    { part: 'quiet.scenes', value: 'kw.gone/park', why: 'not loaded' },
    { part: 'quiet.scenes', value: 'kw.medieval/cellar', why: 'not a quiet scene' },
    { part: 'scenes.attack', value: 'kw.medieval/house', why: 'that scene cannot act it' }]);
});

/* ---- Long names ------------------------------------------------------------------------------ */

test('a long name the page has loaded stands for its short name, and one it has not is ignored with its reason', () => {
  const { s, lines } = store({ defaults: {
    look: { world: 'kw.medieval/world.medieval', monarch: 'kw.medieval/patron.c', props: 'kw.medieval/props.medieval', foe: 'kw.other/foe.troll', words: 'Medieval',
      items: { main: 'kw.base/main.longsword', off: 'kw.base/main.mace', back: 'kw.base/back.wings', head: 'kw.base/head.a', arms: 'arms.mail' },
      devices: { camera: 'kw.test/props.neon', pi: 'kw.other/props.x', tv: 'medieval' } },
    quiet: { scenes: ['kw.medieval/house', 'camp', 'kw.medieval/cellar', 'kw.other/park', 'house'] },
    scenes: { cpu_hot: 'kw.medieval/camp', disk_full: 'kw.medieval/smithy', attack: 'kw.other/moon' } } });
  const r = s.now();
  assert.deepEqual([r.values.look.world, r.values.look.monarch, r.values.look.props, r.values.look.foe, r.values.look.words], ['medieval', 'c', 'medieval', 'goblin', 'medieval']);
  assert.deepEqual([r.values.look.items, r.values.look.devices], [{ main: 'kw.base/main.longsword' }, { camera: 'kw.test/props.neon' }]);
  assert.deepEqual([r.values.quiet.scenes, r.values.scenes.cpu_hot, r.values.scenes.disk_full, r.values.scenes.attack], [['house', 'camp'], 'camp', 'cellar', 'battlement']);
  const why = r.ignored.map(f => f.section + '.' + f.key + ': ' + f.why);
  assert.deepEqual(why, [
    'look.foe: no pack the page has loaded gives it',
    'look.words: not a value the page knows',
    'look.items.off: the item is for the main slot',
    'look.items.back: no pack the page has loaded gives that item',
    'look.items.head: not a slot',
    'look.items.arms: not an item\'s long name, "<pack>/<item>"',
    'look.devices.pi: no pack the page has loaded gives that prop set',
    'look.devices.tv: not a kind of device',
    'quiet.scenes: not a quiet scene',
    'quiet.scenes: no pack the page has loaded gives that scene',
    'scenes.disk_full: that scene cannot act it',
    'scenes.attack: no pack the page has loaded gives that scene']);
  assert.ok(r.ignored.every(f => f.where === 'defaults'));
  assert.equal(lines.length, why.length, 'each said once in the console');
  assert.ok(lines.includes('knightwatcher: settings: look.foe "kw.other/foe.troll" in the defaults in state.json is ignored: no pack the page has loaded gives it'));
});

/* ---- Choosing a world on the screen ----------------------------------------------------------- */

test('choosing a world saves it and clears every part chosen on the display, in one write; the preferences and the quiet length stay', () => {
  const { s, m } = store({ saved: { look: { tabard: 'wine', monarch: 'c', devices: { pi: 'kw.test/props.neon' } }, display: { clock: 12 }, quiet: { scenes: ['house'], minutes: 5 },
    scenes: { cpu_hot: 'camp' } } });
  let told = 0; s.on(() => told++);
  assert.deepEqual(s.chooseWorld(NEON), ['look.tabard', 'look.monarch', 'look.devices', 'quiet.scenes', 'scenes.cpu_hot']);
  assert.equal(told, 1);
  assert.deepEqual(JSON.parse(m.get(SET.KEY)), { v: 1, look: { world: NEON }, display: { clock: 12 }, quiet: { minutes: 5 }, scenes: {} });
  const r = s.now();
  assert.deepEqual([r.world.id, r.world.from, r.values.look.tabard, r.values.display.clock, r.values.quiet.minutes], [NEON, 'saved', 'forest', 12, 5]);
  // the same again clears nothing; a world the page has not loaded is refused
  assert.deepEqual(s.chooseWorld(NEON), []);
  assert.equal(s.chooseWorld('kw.gone/world.x'), null);
  assert.equal(s.now().world.id, NEON);
  // a long name of the base world is saved as its short name
  assert.deepEqual(s.chooseWorld('kw.medieval/world.medieval'), []);
  assert.equal(JSON.parse(m.get(SET.KEY)).look.world, 'medieval');
});

test('with the shared settings, choosing a world sends the look, the quiet scenes and the scenes in one write', () => {
  const { s } = store();
  const sent = [];
  s.shared({ v: 1, look: { skin: 'deep' }, display: {}, quiet: { scenes: ['camp'] }, scenes: {} });
  s.sending(secs => sent.push(secs));
  assert.deepEqual(s.chooseWorld('medieval'), ['look.skin', 'quiet.scenes']);
  assert.deepEqual(sent, [['look', 'quiet', 'scenes']]);
  assert.deepEqual(plain(s.sections()), { look: { world: 'medieval' }, display: {}, quiet: {}, scenes: {} });
});

/* ---- The engine's scene for a condition ------------------------------------------------------- */

test('the engine plays a condition in the world\'s own scene for it, when that scene is loaded and can act it, and a choice beats it', () => {
  const { KW } = page([TEXT]), E = KW.engine;
  KW.hooks = { frozen: false, t: 0 };
  E.init(new Proxy({}, { set() { return true; }, get: () => () => {} }));
  const w = id => Object.assign({}, KW.state.CONDITIONS[id], { id, st: 'warn', hl: '', sub: '' });
  const at = (id, homes, scenes) => { E.input = { w: w(id), is: 'auto', devices: [], tv: false, helmet: 'auto', turnMs: 1000, homes, scenes }; E.restartTurns(0); E.draw(0); return E.scene(); };
  assert.equal(at('cpu_hot', { cpu_hot: 'camp' }), 'camp');
  assert.equal(at('cpu_hot', { cpu_hot: 'kw.medieval/camp' }), 'kw.medieval/camp', 'a long name the page has loaded');
  assert.equal(at('cpu_hot', { cpu_hot: 'court' }), 'yard', 'a home that cannot act it gives way to the code\'s');
  assert.equal(at('cpu_hot', { cpu_hot: 'kw.gone/lab' }), 'yard', 'and so does one not loaded');
  assert.equal(at('cpu_hot', { cpu_hot: 'camp' }, { cpu_hot: 'house' }), 'house', 'a choice beats the world\'s own');
  assert.equal(at('device_down', { device_down: 'house' }), 'battlement', 'a condition with no scene of its own follows the quiet scenes');
  // the quiet turns skip a list naming a scene the page has not loaded
  E.input = { w: KW.state.IDLE, is: 'auto', devices: [], tv: false, helmet: 'auto', turnMs: 1000, turns: ['camp', 'kw.gone/park'] }; E.restartTurns(0); E.draw(0);
  assert.equal(E.scene(), 'battlement');
});

/* ---- The devices per kind --------------------------------------------------------------------- */

test('each kind of device is drawn from the prop set chosen for it, and from the base world\'s where that set cannot give it', () => {
  const { KW } = page([TEXT, testPack()]), W = KW.world;
  const base = Object.assign({}, KW.kinds);
  assert.deepEqual(plain(W.devices), { choice: ALL, kinds: ALL, faults: [] });
  const st = W.useKinds({ camera: 'kw.test/props.neon', machine: 'kw.test/props.neon', pi: 'kw.test/props.neon', vm: 'kw.gone/props.x' });
  assert.deepEqual(plain(st.kinds), { pi: 'medieval', camera: 'kw.test/props.neon', machine: 'kw.test/props.neon', vm: 'medieval', box: 'medieval' });
  assert.deepEqual(plain(st.faults), [{ kind: 'pi', set: 'kw.test/props.neon', reason: 'the prop set kw.test/props.neon does not draw it' },
    { kind: 'vm', set: 'kw.gone/props.x', reason: 'the prop set kw.gone/props.x is not loaded' }]);
  assert.equal(W.devices, st);
  assert.notEqual(KW.kinds.camera, base.camera);
  assert.match(KW.kinds.camera.from, /^kw\.test#/);
  assert.equal(KW.kinds.pi, base.pi);
  assert.equal(KW.kinds.vm, base.vm);
  // compiled once, and the base world's drawings come back
  const cam = KW.kinds.camera;
  W.useKinds({ camera: 'kw.test/props.neon' });
  assert.equal(KW.kinds.camera, cam);
  W.useKinds(null);
  for (const k of Object.keys(base)) assert.equal(KW.kinds[k], base[k], k);
  // the long name of the medieval set is the medieval set
  assert.equal(W.useKinds({ camera: 'kw.medieval/props.medieval' }).kinds.camera, 'kw.medieval/props.medieval');
});

test('a kind of another set that fails to compile takes the base world\'s drawing, with the reason', () => {
  const s = page(), lib = s.KW.pack;
  const text = testPack(p => { p.props['props.neon'].kinds.camera.gone.still[0].k = 'zz'; });
  s.KW.pack = Object.assign({}, lib, { read: (t, o) => (t === text ? Object.assign({}, lib.read(testPack(), o), { data: JSON.parse(text).pack }) : lib.read(t, o)) });
  s.KW.world.start([TEXT, text], true);
  const st = s.KW.world.useKinds({ camera: 'kw.test/props.neon' });
  assert.equal(st.kinds.camera, 'medieval');
  assert.deepEqual(plain(st.faults), [{ kind: 'camera', set: 'kw.test/props.neon', reason: 'it could not be compiled: props.props.neon.kinds.camera.gone.still[0].k: the shape kind "zz" is not built in this engine yet' }]);
});

test('the per-kind choice draws the same calls as the base world for a set copied from it', () => {
  const { KW } = page([TEXT, testPack()]), D = KW.draw;
  const calls = () => { const log = []; D.setCtx(new Proxy({}, { set(_, k, v) { log.push(k + ' ' + v); return true; }, get: (_, k) => (...a) => { log.push([k, ...a].join(' ')); } })); KW.kinds.camera.draw(400, 300, 1234, true); KW.kinds.camera.draw(400, 300, 1234, false); return log; };
  const before = calls();
  KW.world.useKinds({ camera: 'kw.test/props.neon' });
  assert.deepEqual(calls(), before);
});

/* ---- The screen: the World page, its device rows and the status page ---------------------------- */

/* The screen's parts, KW.settings.screen, from the sandbox, each result made a plain value of this
   realm. */
const SCR = new Proxy(WITH.KW.settings.screen, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => plain(o[k](...a)) : o[k]) });
const SETTINGS_JS = fs.readFileSync(path.join(WEB, 'js/settings.js'), 'utf8');

test('the World page lists the parts that differ from the world in use, each beside the world\'s own, and where it was chosen', () => {
  const { s } = store({ saved: { look: { tabard: 'forest' }, scenes: { cpu_hot: 'camp' } }, defaults: { look: { plume: 'gold' } } });
  const r = s.now();
  assert.deepEqual(plain(SCR.changedParts(r, s.parts(r.world.id))), [
    { sec: 'look', k: 'tabard', v: 'forest', own: 'blue', from: 'saved' },
    { sec: 'look', k: 'plume', v: 'gold', own: 'red', from: 'defaults' },
    { sec: 'scenes', k: 'cpu_hot', v: 'camp', own: 'yard', from: 'saved' }]);
  // nothing set: nothing differs; a world chosen whole: nothing differs from it
  assert.deepEqual(SCR.changedParts(store().s.now(), store().s.parts('medieval')), []);
  const n = store({ saved: { look: { world: NEON } } }).s;
  assert.deepEqual(SCR.changedParts(n.now(), n.parts(NEON)), []);
  // the devices have rows of their own, and are not listed as a changed part
  assert.ok(!SCR.partKeys(r).some(([sec, k]) => k === 'devices' || k === 'world'));
});

test('a world\'s card shows the world as it comes: its own knight, whatever this display has changed', () => {
  const { s } = store({ saved: { look: { tabard: 'wine', weapon: 'longsword' } } });
  assert.deepEqual(s.worldLook('medieval'), {});
  const neon = s.worldLook(NEON);
  assert.deepEqual([neon.build, neon.items.main, neon.swatches.tabard], ['kw.base/build.b', 'kw.base/main.arming', 'kw.base/forest']);
  assert.deepEqual(s.worldLook(NEON), store().s.worldLook(NEON), 'the same with nothing changed');
});

test('the line under the cards names the world chosen, what it cleared, what config.toml gives way with, and says "for every display" when shared', () => {
  const P = BASE, cat = CAT;
  assert.equal(SCR.chosenLine('Medieval', [{ sec: 'look', k: 'tabard', v: 'forest' }], [], true, P, cat, null),
    'Medieval chosen for every display: every part is now the world\'s. Cleared what was chosen here: the tabard (forest). A part changed after this is kept over the world.');
  assert.equal(SCR.chosenLine('Medieval', [], [{ sec: 'look', k: 'tabard', v: 'forest' }], true, P, cat, null),
    'Medieval chosen for every display: every part is now the world\'s. The tabard (forest) from config.toml gives way to it. A part changed after this is kept over the world.');
  assert.equal(SCR.chosenLine('Neon', [], [], false, P, cat, null),
    'Neon chosen: every part is now the world\'s. Nothing had been changed from it. A part changed after this is kept over the world.');
  assert.equal(SCR.chosenLine('Medieval', [{ sec: 'look', k: 'monarch', v: 'b' }, { sec: 'quiet', k: 'scenes', v: ['camp'] }, { sec: 'scenes', k: 'cpu_hot', v: 'camp' }], [], false, P, cat, null),
    'Medieval chosen: every part is now the world\'s. Cleared what was chosen here: the monarch (monarch B), the quiet scenes (camp) and under strain in the camp. A part changed after this is kept over the world.');
});

test('the device rows show only once a second prop set is loaded, a row a kind, each set that draws it, the world\'s first', () => {
  const one = store({ world: plain(CODE.KW.settings.pageWorld()) }).s;
  assert.equal(SCR.deviceRows(one.catalogue(), one.now()), null, 'at launch nobody sees them');
  const { s } = store({ saved: { look: { devices: { camera: 'kw.test/props.neon' } } } });
  const d = SCR.deviceRows(s.catalogue(), s.now());
  assert.equal(d.world, 'medieval');
  assert.deepEqual(d.rows.map(x => [x.kind, x.label, x.cur, x.from, x.choices.map(c => c.id)]), [
    ['pi', 'Pi', 'medieval', 'built-in', ['medieval']],
    ['camera', 'Camera', 'kw.test/props.neon', 'saved', ['medieval', 'kw.test/props.neon']],
    ['machine', 'Host', 'medieval', 'built-in', ['medieval', 'kw.test/props.neon']],
    ['vm', 'VM', 'medieval', 'built-in', ['medieval']],
    ['box', 'Other', 'medieval', 'built-in', ['medieval']]]);
  assert.deepEqual(d.rows[1].choices.map(c => c.name), ['Medieval, the world\'s', 'Neon']);
  // in the neon world its own set comes first
  const n = store({ saved: { look: { world: NEON } } }).s, dn = SCR.deviceRows(n.catalogue(), n.now());
  assert.deepEqual([dn.world, dn.rows[1].cur, dn.rows[1].from, dn.rows[1].choices.map(c => c.name)], ['kw.test/props.neon', 'kw.test/props.neon', 'world', ['Neon, the world\'s', 'Medieval']]);
});

test('a choice on a device row saves the kind\'s set, and the world\'s set puts back a kind this display chose', () => {
  const { s } = store({ saved: { look: { devices: { camera: 'kw.test/props.neon' } } }, defaults: { look: { devices: { machine: 'kw.test/props.neon' } } } });
  const r = s.now();
  assert.deepEqual(SCR.devicesAfter(r, 'camera', 'medieval'), { machine: 'kw.test/props.neon' }, 'chosen here: left out, to follow the world');
  assert.deepEqual(SCR.devicesAfter(r, 'machine', 'medieval'), { camera: 'kw.test/props.neon', machine: 'medieval' }, 'set in config.toml: chosen over it');
  assert.deepEqual(SCR.devicesAfter(r, 'pi', 'kw.test/props.neon'), { camera: 'kw.test/props.neon', machine: 'kw.test/props.neon', pi: 'kw.test/props.neon' });
  s.choose('look', 'devices', SCR.devicesAfter(r, 'machine', 'medieval'));
  assert.deepEqual(plain(SET.engineInput(s.now(), BASE, 1000).kinds), { pi: 'medieval', camera: 'kw.test/props.neon', machine: 'medieval', vm: 'medieval', box: 'medieval' });
});

test('the status page lists every fallback with its reason', () => {
  const { s } = store({ defaults: { scenes: { disk_full: 'camp' }, look: { foe: 'kw.other/foe.troll' } } });
  const r = s.now(), W = { status: { faults: [{ scene: 'cellar', reason: 'it broke' }], refused: null }, props: { faults: [] }, cast: { faults: [] },
    devices: { faults: [{ kind: 'pi', set: 'kw.test/props.neon', reason: 'the prop set kw.test/props.neon does not draw it' }] } };
  const kn = { fallbacks: [{ kind: 'item', key: 'main', wanted: null, used: 'kw.base/main.greatsword', reason: 'not set' },
    { kind: 'item', key: 'helmet', wanted: 'kw.gone/helm.x', used: 'kw.base/helm.open', reason: 'pack not loaded' }] };
  assert.deepEqual(SCR.fallbackLines(r, W, kn, BASE, CAT, null), [
    ['Foe', ': config.toml asks for "kw.other/foe.troll", which is ignored: no pack the page has loaded gives it.'],
    ['Disk full', ': config.toml asks for the camp, which cannot act it. Shown in the cellar, the world\'s own.'],
    ['Cellar', ': drawn from code. it broke'],
    ['pi', ': the base world\'s drawing, not kw.test/props.neon\'s: the prop set kw.test/props.neon does not draw it.'],
    ['helmet', ': "kw.gone/helm.x" is not drawn (pack not loaded), so kw.base/helm.open is.']]);
  // a part of the world the page has not loaded
  const cat = plain(CAT); cat.worlds[NEON].preset.cast.patron = 'kw.gone/patron.z';
  const f = store({ world: cat, saved: { look: { world: NEON } } }).s.now();
  assert.deepEqual(SCR.fallbackLines(f, {}, null, BASE, cat, null), [['Monarch', ': the world names "kw.gone/patron.z", which is not loaded, so the medieval world\'s is shown.']]);
  assert.deepEqual(SCR.fallbackLines(store().s.now(), {}, null, BASE, CAT, null), []);
});

test('the pages take the world\'s labels; World is first in the rail, and the screen still opens on the knight', () => {
  assert.equal(SCR.partLabel('look', 'monarch_skin', MED.words['words.medieval'].labels), 'Monarch\'s skin');
  assert.equal(SCR.partLabel('look', 'monarch_skin', { patron: 'The queen' }), 'Queen\'s skin');
  assert.equal(SCR.partLabel('look', 'critter', MED.words['words.medieval'].labels), 'Pest');
  assert.equal(SCR.partLabel('look', 'devices.machine', null), 'Devices by kind, Host');
  // the rail's order, and the labels from the words in use
  const pages = /const PAGES = \{\s*world: \{ label: 'World', build: buildWorld \},\s*knight: \{ label: \(\) => pageLabel\('knight'\)/.test(SETTINGS_JS);
  assert.ok(pages, 'World first, the knight\'s label from the words');
  assert.match(SETTINGS_JS, /const st = \{ open: false, page: 'knight',/);
  assert.match(SETTINGS_JS, /hold\.done = true; swallow = true; open\('knight'\);/);
  assert.match(SETTINGS_JS, /const PAGE_LABELS = \{ knight: \['watcher', 'The knight'\], monarch: \['patron', 'The monarch'\], pet: \['pet', 'The pet'\] \};/);
  assert.match(SETTINGS_JS, /const pageLabel = k => labelOf\(wordLabels\(\), PAGE_LABELS\[k\]\[0\], PAGE_LABELS\[k\]\[1\]\);/);
  // the cast's page, with the pet, the foe and the pest, comes right after the monarch's
  assert.match(SETTINGS_JS, /\n      monarch: \{ label: \(\) => pageLabel\('monarch'\)[\s\S]*?\n      \} \},\n(      \/\*[^\n]*\*\/\n)?      pet: \{ label: 'The cast'/);
  assert.equal(SCR.partLabel('look', 'pet_coat', MED.words['words.medieval'].labels), 'Cat\'s coat');
  assert.equal(SCR.partLabel('look', 'pet', null), 'Pet');
});
