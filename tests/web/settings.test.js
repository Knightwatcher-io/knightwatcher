// Tests for the settings, web/js/settings.js, and what they drive elsewhere: the four levels and
// their order (the address's hooks, this display's saved choices, the defaults in the state file,
// the page's own), the values each level may hold, the browser's storage and what happens when it
// refuses, the reset of a section, the look and the engine's input made from them, the 12-hour
// clock, the quiet rotation in web/js/engine.js, the monarch's skin in web/js/scenes/court.js, and
// a knight drawn from the base pack in every combination the settings offer.
// Run with: node --test tests/web/
//
// The pure part of settings.js loads under Node as it is. The engine, the court and the knight run
// in a sandbox as index.html loads them, drawing into a fake context that records what is filled.
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
const PACK_TEXT = fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8');
const PACK = JSON.parse(PACK_TEXT).pack;
/* The base pack with only the builds named, as a base pack from before the three builds, or a
   fork's, may hold. */
const withBuilds = (...ids) => { const p = JSON.parse(JSON.stringify(PACK)); for (const b of Object.keys(p.builds)) if (!ids.includes(b)) delete p.builds[b]; return p; };
const plain = v => JSON.parse(JSON.stringify(v));
// A state file with a defaults section, as a new collector writes it.
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/state-defaults.json'), 'utf8'));

/* A storage like the browser's, holding text by key; get or set may be made to throw. */
function storage(text, opts) {
  const o = opts || {}, m = new Map(text === undefined ? [] : [[SET.KEY, text]]);
  return { m, get: () => ({ getItem: k => { if (o.getThrows) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (o.setThrows) throw new Error('QuotaExceededError'); m.set(k, v); } }) };
}
/* What the page's scenes can act and each condition's own scene, as the page reads them from the
   scenes and KW.state it loads (KW.settings.pageWorld), read once from the scripts in a sandbox. */
let pageWorld = null;
const WORLD = () => pageWorld || (pageWorld = plain(load().KW.settings.pageWorld()));
/* A store over a storage, with the base pack in use unless pack is null and the page's world unless
   world is given; lines holds the console. */
function store(opts) {
  const o = opts || {}, lines = [], st = o.storage || storage();
  const s = SET.create({ hooks: o.hooks, storage: o.storageFn || st.get, pack: () => (o.pack === undefined ? PACK : o.pack), say: l => lines.push(l),
    world: o.world === undefined ? WORLD : () => o.world });
  return { s, lines, st };
}
const saved = obj => JSON.stringify(Object.assign({ v: 1 }, obj));
/* Each condition's own scene, in the medieval world. A device down and a stream have none: they play
   in the quiet scene of the moment. */
const HOMES = { attack: 'battlement', wan_down: 'battlement', container_unhealthy: 'house', disk_full: 'cellar', backup_overdue: 'house', pi_silent: 'house',
  cpu_hot: 'yard', ssh_session: 'court', updating: 'smithy', night: 'house' };

/* ---- The levels ------------------------------------------------------------------------------- */

test('with nothing set, every value is the page\'s own and the knight\'s look is empty, so the knight is as before', () => {
  const { s, lines } = store();
  const r = s.now();
  assert.deepEqual(r.values, {
    look: { world: 'medieval', build: 'a', weapon: 'greatsword', skin: 'warm', hair: 'brown', hair_style: 'short', tabard: 'blue', plume: 'red',
      shield: 'heater', helmet: 'open', plume_style: 'crest', body: 'tabard', shoulders: 'plate', arms: 'plate', hands: 'plate', legs: 'plate', feet: 'leather', back: 'none',
      monarch: 'a', monarch_skin: 'warm', monarch_hair: null, monarch_robe: null, pet: 'cat', pet_coat: 'calico', foe: 'goblin', critter: 'fly', props: 'medieval', overlay: 'medieval', words: 'medieval', items: {}, devices: {} },
    display: { headline: 'medium', clock: 24, helmet_indoors: false },
    quiet: { scenes: ['battlement', 'camp', 'house', 'yard', 'smithy'], minutes: 10 },
    scenes: { attack: 'battlement', disk_full: 'cellar', backup_overdue: 'house', pi_silent: 'house', cpu_hot: 'yard' } });
  for (const sec of Object.keys(r.from)) for (const k of Object.keys(r.from[sec])) if (!SET.TABLES[k]) assert.equal(r.from[sec][k], 'built-in', sec + '.' + k);
  assert.deepEqual([r.from.look.items, r.from.look.devices], [{}, {}]);
  assert.deepEqual(plain(r.world), { id: 'medieval', from: 'built-in', homes: HOMES });
  assert.deepEqual([r.masked, r.faults, r.ignored], [[], [], []]);
  assert.deepEqual(SET.knightLook(r), {});
  assert.deepEqual(plain(SET.engineInput(r, PACK, 60000)), { turns: ['battlement', 'camp', 'house', 'yard', 'smithy'], turnMs: 60000, patron: { id: 'a', skin: null, hair: null, robe: null }, pet: { id: 'cat', coat: 'calico' }, scenes: {},
    homes: HOMES, kinds: { pi: 'medieval', camera: 'medieval', machine: 'medieval', vm: 'medieval', box: 'medieval' },
    foe: 'goblin', critter: 'fly', words: 'medieval', overlay: 'medieval' });
  assert.deepEqual(lines, []);
});

/* The smithy joined the quiet scenes in the default list alone: a display that saved its own list
   of the four there were before keeps exactly those four, and the engine turns between them; the
   smithy is a choice it has not made. */
test('a saved list of the four quiet scenes there were before the smithy keeps exactly four', () => {
  const four = ['battlement', 'camp', 'house', 'yard'];
  const { s } = store({ storage: storage(saved({ quiet: { scenes: four } })) }), r = s.now();
  assert.deepEqual(plain(r.values.quiet.scenes), four);
  assert.equal(r.from.quiet.scenes, 'saved');
  assert.deepEqual(plain(SET.engineInput(r, PACK, 60000).turns), four);
  // with nothing saved the five take turns
  assert.deepEqual(plain(store().s.now().values.quiet.scenes), four.concat(['smithy']));
});

test('the page\'s own look is the base pack\'s defaults, read from the pack', () => {
  assert.deepEqual(SET.builtIn(PACK).look, { world: 'medieval', build: 'a', weapon: 'greatsword', skin: 'warm', hair: 'brown', hair_style: 'short', tabard: 'blue', plume: 'red',
    shield: 'heater', helmet: 'open', plume_style: 'crest', body: 'tabard', shoulders: 'plate', arms: 'plate', hands: 'plate', legs: 'plate', feet: 'leather', back: 'none',
    monarch: 'a', monarch_skin: 'warm', monarch_hair: null, monarch_robe: null, pet: 'cat', pet_coat: 'calico', foe: 'goblin', critter: 'fly', props: 'medieval', overlay: 'medieval', words: 'medieval', items: {}, devices: {} });
  const other = JSON.parse(JSON.stringify(PACK));
  Object.assign(other.defaults.swatches, { skin: 'deep', plume: 'gold' }); other.defaults.items.main = 'main.arming'; other.defaults.items.hair = 'hair.curls';
  const L = SET.builtIn(other).look;
  assert.deepEqual([L.skin, L.plume, L.weapon, L.hair_style], ['deep', 'gold', 'sword_and_shield', 'curls']);
  // a base pack whose defaults name other gear, as a fork's might: each key takes it, the mace as
  // mace_and_shield, a shield and a cloak among them; an item the contract has no value for leaves the
  // key at the schema's
  Object.assign(other.defaults.items, { main: 'main.mace', off: 'off.kite', helmet: 'helm.coif', torso: 'torso.gambeson', boots: 'boots.shoes', back: 'back.cloak', legs: 'legs.unknown' });
  const G = SET.builtIn(other).look;
  assert.deepEqual([G.weapon, G.shield, G.helmet, G.body, G.feet, G.back, G.legs, G.arms], ['mace_and_shield', 'kite', 'coif', 'gambeson', 'shoes', 'cloak', 'plate', 'plate']);
  assert.equal(SET.builtIn(null).look.build, null, 'with no base pack no build is ready');
});

test('each key comes from the highest level that sets it: the address, then saved, then the state file, then the page', () => {
  const st = storage(saved({ look: { skin: 'tan', hair: 'black' }, display: { clock: 12 }, quiet: { minutes: 30 } }));
  const { s } = store({ storage: st, hooks: { look: { skin: 'deep' } } });
  s.defaults({ look: { skin: 'fair', hair: 'silver', tabard: 'teal' }, display: { clock: 24, headline: 'large' }, quiet: { minutes: 5, scenes: ['camp'] } });
  const r = s.now();
  assert.deepEqual([r.values.look.skin, r.from.look.skin], ['deep', 'hook']);
  assert.deepEqual([r.values.look.hair, r.from.look.hair], ['black', 'saved']);
  assert.deepEqual([r.values.look.tabard, r.from.look.tabard], ['teal', 'defaults']);
  assert.deepEqual([r.values.look.plume, r.from.look.plume], ['red', 'built-in']);
  assert.deepEqual([r.values.display.clock, r.from.display.clock], [12, 'saved']);
  assert.deepEqual([r.values.display.headline, r.from.display.headline], ['large', 'defaults']);
  assert.deepEqual([r.values.quiet.minutes, r.from.quiet.minutes], [30, 'saved']);
  assert.deepEqual([r.values.quiet.scenes, r.from.quiet.scenes], [['camp'], 'defaults']);
  // the knight's look carries only what a level above the page's own sets
  assert.deepEqual(SET.knightLook(r), { swatches: { skin: 'kw.base/deep', hair: 'kw.base/black', tabard: 'kw.base/teal' } });
  // and the fallback leaves out the address and the saved choices
  const f = s.fallback();
  assert.deepEqual([f.values.look.skin, f.from.look.skin, f.values.display.clock], ['fair', 'defaults', 24]);
});

test('a value a level does not know is ignored at that level, the next level down used, and the console told once', () => {
  const st = storage(saved({ look: { skin: 'green', hair: 'auburn', cape: 'red' }, display: { clock: '12', headline: 'huge' }, quiet: { minutes: 0, scenes: ['moon', 'yard'] } }));
  const { s, lines } = store({ storage: st, hooks: { look: { tabard: 'orange', hair_style: 'tied' }, display: { helmet_indoors: 'yes' } }, pack: withBuilds('build.a') });
  s.defaults({ look: { skin: 'golden', tabard: 'wine', build: 'b', monarch: 'd' }, display: { clock: 12, helmet_indoors: true }, quiet: { minutes: 300 }, analytics: { on: true } });
  const r = s.now();
  assert.deepEqual([r.values.look.skin, r.from.look.skin], ['golden', 'defaults'], 'an unknown saved skin falls to the defaults');
  assert.deepEqual([r.values.look.hair, r.from.look.hair], ['auburn', 'saved']);
  assert.deepEqual([r.values.look.tabard, r.from.look.tabard], ['wine', 'defaults'], 'an unknown hook falls to the defaults');
  assert.deepEqual([r.values.look.hair_style, r.from.look.hair_style], ['tied', 'hook']);
  assert.deepEqual([r.values.look.build, r.from.look.build], ['a', 'built-in'], 'build b has no pack, so the page\'s own');
  assert.deepEqual([r.values.look.monarch, r.from.look.monarch], ['a', 'built-in']);
  assert.deepEqual([r.values.display.clock, r.from.display.clock], [12, 'defaults'], 'the text "12" is not the number 12');
  assert.deepEqual([r.values.display.headline, r.from.display.headline], ['medium', 'built-in']);
  assert.deepEqual([r.values.display.helmet_indoors, r.from.display.helmet_indoors], [true, 'defaults']);
  assert.deepEqual([r.values.quiet.minutes, r.from.quiet.minutes], [10, 'built-in'], '0 and 300 are outside 1 to 240');
  assert.deepEqual([r.values.quiet.scenes, r.from.quiet.scenes], [['yard'], 'saved'], 'an unknown scene is dropped from the list');
  const before = lines.length;
  for (let i = 0; i < 5; i++) s.now();
  assert.equal(lines.length, before, 'each line is said once');
  for (const want of ['look.skin "green" in this display\'s saved choices', 'look.cape', 'look.tabard "orange" in the address', 'display.helmet_indoors "yes" in the address',
    'look.build "b" in the defaults in state.json is ignored: no pack draws that build', 'look.monarch "d"', 'display.clock "12"', 'quiet.minutes 0', 'quiet.minutes 300',
    'quiet.scenes "moon"']) assert.ok(lines.some(l => l.includes(want)), want + ' in ' + lines.join('\n'));
  // a section the page does not know, such as one a later collector adds, is left alone silently
  assert.ok(!lines.some(l => l.includes('analytics')));
  assert.ok(lines.every(l => l.startsWith('knightwatcher: settings: ')));
});

test('a section that is not an object, or a list of scenes that names none, is ignored whole', () => {
  const { s, lines } = store({ storage: storage(saved({ look: 'warm', quiet: { scenes: [] } })) });
  s.defaults({ display: [1, 2], quiet: { scenes: 'camp' } });
  const r = s.now();
  assert.equal(r.from.look.skin, 'built-in');
  assert.equal(r.from.quiet.scenes, 'built-in');
  assert.equal(r.from.display.clock, 'built-in');
  assert.ok(lines.some(l => l.includes('look in this display\'s saved choices is not an object')));
  assert.ok(lines.some(l => l.includes('quiet.scenes a list in this display\'s saved choices is ignored: it names no quiet scene')));
});

test('the scenes take turns in the order given and lose repeats; minutes may be any number from 1 to 240', () => {
  const { s } = store();
  s.defaults({ quiet: { scenes: ['yard', 'camp', 'yard'], minutes: 7.5 } });
  assert.deepEqual(s.now().values.quiet, { scenes: ['yard', 'camp'], minutes: 7.5 });
  s.defaults({ quiet: { minutes: 240 } });
  assert.equal(s.now().values.quiet.minutes, 240);
  s.defaults({ quiet: { minutes: 1 } });
  assert.equal(s.now().values.quiet.minutes, 1);
});

test('the builds ready are those the base pack declares, and a build from a level stands only if ready', () => {
  assert.deepEqual(SET.buildsOf(PACK), ['a', 'b', 'c'], 'the base pack draws all three');
  assert.deepEqual(SET.buildsOf(null), []);
  const two = withBuilds('build.a', 'build.c');
  assert.deepEqual(SET.buildsOf(two), ['a', 'c']);
  const { s } = store({ pack: two });
  s.defaults({ look: { build: 'c' } });
  assert.deepEqual([s.now().values.look.build, s.now().from.look.build], ['c', 'defaults']);
  assert.deepEqual(SET.knightLook(s.now()), { build: 'kw.base/build.c' });
  assert.equal(s.choose('look', 'build', 'b'), false, 'b is not ready');
  // with no base pack in use no build is ready, and none is chosen
  const none = store({ pack: null });
  none.s.defaults({ look: { build: 'a' } });
  assert.deepEqual([none.s.now().values.look.build, none.s.now().from.look.build], [null, 'built-in']);
});

test('the build row names each build as the base pack does, Ready under each, and greys only a build the pack does not draw', () => {
  assert.deepEqual(SET.buildChoices(PACK, 'a'), [
    { id: 'a', chip: 'CLASSIC', name: 'Ready', kind: 'wide' },
    { id: 'b', chip: 'BROAD', name: 'Ready', kind: 'wide' },
    { id: 'c', chip: 'SLIM', name: 'Ready', kind: 'wide' }]);
  assert.deepEqual(['a', 'b', 'c'].map(id => SET.buildName(PACK, id)), ['Classic', 'Broad', 'Slim']);
  // the names are the pack's: a pack that names its builds otherwise is shown so
  const renamed = withBuilds('build.a', 'build.b', 'build.c'); renamed.builds['build.b'].name = 'Wide';
  assert.equal(SET.buildChoices(renamed, 'a')[1].chip, 'WIDE');
  // a base pack that draws build A alone: the others greyed by their letters, the note naming the
  // build shown by its name
  assert.deepEqual(SET.buildChoices(withBuilds('build.a'), 'a').slice(1), [
    { id: 'b', chip: 'BUILD B', name: 'Coming', kind: 'wide', off: true, offNote: 'Build B is not drawn yet. The knight stays as Classic.' },
    { id: 'c', chip: 'BUILD C', name: 'Coming', kind: 'wide', off: true, offNote: 'Build C is not drawn yet. The knight stays as Classic.' }]);
  assert.deepEqual(SET.buildChoices(null, null).map(c => [c.chip, c.off, c.offNote]), [
    ['BUILD A', true, 'Build A is not drawn yet.'], ['BUILD B', true, 'Build B is not drawn yet.'], ['BUILD C', true, 'Build C is not drawn yet.']]);
});

/* ---- Saved choices ----------------------------------------------------------------------------- */

test('a choice is saved under one key as version 1 with the contract\'s names, and read back by the next page', () => {
  const st = storage();
  const a = store({ storage: st });
  let told = 0; a.s.on(() => told++);
  assert.equal(a.s.choose('look', 'skin', 'deep'), true);
  assert.equal(a.s.choose('display', 'clock', 12), true);
  assert.equal(a.s.choose('quiet', 'scenes', ['house', 'battlement']), true);
  assert.equal(told, 3);
  assert.deepEqual(JSON.parse(st.m.get('knightwatcher.settings')), { v: 1, look: { skin: 'deep' }, display: { clock: 12 }, quiet: { scenes: ['house', 'battlement'] }, scenes: {} });
  const b = store({ storage: st });
  assert.deepEqual([b.s.now().values.look.skin, b.s.now().from.look.skin], ['deep', 'saved']);
  assert.equal(b.s.now().values.display.clock, 12);
  assert.ok(b.s.own('look') && b.s.own('display') && b.s.own('quiet'));
});

test('a value the page does not know is refused by choose, and nothing is saved', () => {
  const st = storage(), { s } = store({ storage: st });
  assert.equal(s.choose('look', 'skin', 'green'), false);
  assert.equal(s.choose('look', 'cape', 'red'), false);
  assert.equal(s.choose('quiet', 'minutes', 0), false);
  assert.equal(s.choose('analytics', 'on', true), false);
  assert.equal(st.m.size, 0);
});

test('a stored text that is not JSON, or not version 1, is ignored, and a stored value the page does not know is ignored alone', () => {
  for (const text of ['{nope', JSON.stringify({ v: 2, look: { skin: 'deep' } }), JSON.stringify([1]), JSON.stringify({ look: { skin: 'deep' } })]) {
    const { s, lines } = store({ storage: storage(text) });
    assert.equal(s.now().from.look.skin, 'built-in', text);
    assert.ok(lines.some(l => l.includes('not in a form this page reads')), text);
  }
  const { s } = store({ storage: storage(saved({ look: { skin: 'deep', hair: 'purple' } })) });
  assert.deepEqual([s.now().values.look.skin, s.now().values.look.hair, s.now().from.look.hair], ['deep', 'brown', 'built-in']);
});

test('a browser that refuses storage: the page works, the choices last in memory, and the console says so once', () => {
  const thrower = () => { throw new Error('SecurityError: access denied'); };
  for (const opts of [{ storageFn: thrower }, { storage: storage(undefined, { getThrows: true, setThrows: true }) }, { storage: storage(undefined, { setThrows: true }) }]) {
    const { s, lines } = store(opts);
    assert.equal(s.now().from.look.skin, 'built-in');
    assert.equal(s.choose('look', 'skin', 'deep'), true);
    assert.equal(s.choose('look', 'hair', 'black'), true);
    assert.deepEqual([s.now().values.look.skin, s.now().values.look.hair, s.now().from.look.skin], ['deep', 'black', 'saved']);
    s.reset('look');
    assert.equal(s.now().from.look.skin, 'built-in');
    const said = lines.filter(l => l.includes('refused to save') || l.includes('keeps no saved choices'));
    assert.ok(said.length >= 1 && said.length <= 2, lines.join('\n'));
    assert.equal(new Set(lines).size, lines.length, 'no line twice');
  }
});

test('the reset of a section clears only that section\'s saved choices, which then fall to the defaults', () => {
  const st = storage(saved({ look: { skin: 'deep', monarch: 'c' }, display: { clock: 12 }, quiet: { minutes: 60 } }));
  const { s } = store({ storage: st, hooks: { look: { plume: 'gold' } } });
  s.defaults({ look: { skin: 'tan' } });
  let told = 0; s.on(() => told++);
  s.reset('look');
  const r = s.now();
  assert.deepEqual([r.values.look.skin, r.from.look.skin], ['tan', 'defaults']);
  assert.deepEqual([r.values.look.monarch, r.from.look.monarch], ['a', 'built-in']);
  assert.deepEqual([r.values.look.plume, r.from.look.plume], ['gold', 'hook'], 'the address is not a saved choice');
  assert.equal(r.values.display.clock, 12);
  assert.equal(r.values.quiet.minutes, 60);
  assert.equal(told, 1);
  assert.equal(s.own('look'), false);
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)), { v: 1, look: {}, display: { clock: 12 }, quiet: { minutes: 60 }, scenes: {} });
  s.reset('display'); s.reset('quiet');
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)), { v: 1, look: {}, display: {}, quiet: {}, scenes: {} });
  assert.equal(told, 3);
});

test('listeners hear of a change only when what the display shows changes', () => {
  const { s } = store();
  let told = 0; s.on(() => told++);
  s.defaults(null); s.defaults(undefined); s.defaults({});
  assert.equal(told, 0);
  s.defaults({ look: { skin: 'tan' } });
  s.defaults({ look: { skin: 'tan' } });
  assert.equal(told, 1);
  s.check();
  assert.equal(told, 1, 'nothing changed');
  // saving the value already shown changes where it comes from, which the screen shows
  s.choose('look', 'skin', 'tan');
  assert.equal(told, 2);
  s.choose('look', 'skin', 'tan');
  assert.equal(told, 2);
});

/* ---- The state file's defaults ------------------------------------------------------------------- */

test('the state file\'s defaults reach the store through KW.state.map, with its sources for the status page', () => {
  const v = ST.map(FIXTURE, Date.parse(FIXTURE.generated_at) + 5000);
  assert.equal(v.ok, true);
  assert.deepEqual(v.defaults, FIXTURE.defaults);
  assert.deepEqual(v.sources, [
    { name: 'containers', ok: true, at: Date.parse('2026-01-15T21:42:10Z'), error: '' },
    { name: 'adblock', ok: false, at: Date.parse('2026-01-15T21:40:40Z'), error: '401 from the DNS filter' }]);
  const { s } = store();
  s.defaults(v.defaults);
  const r = s.now();
  // a state file from before the gear keys sets none of them, so they are the page's own
  assert.deepEqual(r.values.look, { world: 'medieval', build: 'a', weapon: 'sword_and_shield', skin: 'deep', hair: 'black', hair_style: 'curls', tabard: 'sable', plume: 'gold',
    shield: 'heater', helmet: 'open', plume_style: 'crest', body: 'tabard', shoulders: 'plate', arms: 'plate', hands: 'plate', legs: 'plate', feet: 'leather', back: 'none',
    monarch: 'b', monarch_skin: 'brown', monarch_hair: 'silver', monarch_robe: 'teal', pet: 'cat', pet_coat: 'calico', foe: 'goblin', critter: 'fly', props: 'medieval', overlay: 'medieval', words: 'medieval', items: {}, devices: {} });
  for (const k of ['shield', 'helmet', 'plume_style', 'body', 'shoulders', 'arms', 'hands', 'legs', 'feet', 'back']) assert.equal(r.from.look[k], 'built-in', k);
  assert.deepEqual([r.values.scenes.cpu_hot, r.from.scenes.cpu_hot, r.values.scenes.pi_silent, r.from.scenes.pi_silent], ['camp', 'defaults', 'battlement', 'defaults']);
  assert.deepEqual(r.values.display, { headline: 'large', clock: 12, helmet_indoors: true });
  assert.deepEqual(r.values.quiet, { scenes: ['battlement', 'yard'], minutes: 15 });
  assert.deepEqual(SET.knightLook(r), { build: 'kw.base/build.a', items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater', hair: 'kw.base/hair.curls' },
    swatches: { skin: 'kw.base/deep', hair: 'kw.base/black', tabard: 'kw.base/sable', plume: 'kw.base/gold' } });
  // a file from an old collector has no defaults, and the page's own stand
  const old = Object.assign({}, FIXTURE); delete old.defaults;
  assert.equal(ST.map(old, Date.parse(FIXTURE.generated_at)).defaults, null);
  // a defaults section with only some keys sets only those
  const part = store(); part.s.defaults({ look: { plume: 'white' }, display: {}, quiet: { minutes: 60 } });
  assert.deepEqual([part.s.now().values.look.skin, part.s.now().values.look.plume, part.s.now().values.quiet.minutes], ['warm', 'white', 60]);
});

/* ---- What the engine and the clock take --------------------------------------------------------- */

test('the engine\'s input: the rotation\'s scenes, its length only when set, the monarch and the monarch\'s skin from the base pack, and the pet in its coat', () => {
  const { s } = store();
  assert.equal(SET.engineInput(s.now(), PACK, 60000).turnMs, 60000, 'the demo keeps its minute');
  assert.equal(SET.engineInput(s.now(), PACK, 600000).turnMs, 600000, 'live mode its ten');
  assert.deepEqual(plain(SET.engineInput(s.now(), PACK, 60000).pet), { id: 'cat', coat: 'calico' }, 'the cat, calico, by default');
  s.choose('quiet', 'minutes', 5); s.choose('quiet', 'scenes', ['camp', 'house']);
  s.choose('look', 'monarch', 'c'); s.choose('look', 'monarch_skin', 'deep'); s.choose('look', 'pet_coat', 'ginger');
  assert.equal(s.choose('look', 'pet_coat', 'tortoiseshell'), false, 'a coat the page does not know is refused');
  const e = SET.engineInput(s.now(), PACK, 60000);
  assert.deepEqual(plain(e), { turns: ['camp', 'house'], turnMs: 300000, patron: { id: 'c',
    skin: { id: 'deep', face: PACK.swatches.skin.deep.entries.face, cheek: PACK.swatches.skin.deep.entries.cheek }, hair: null, robe: null }, pet: { id: 'cat', coat: 'ginger' }, scenes: {}, homes: HOMES,
    kinds: { pi: 'medieval', camera: 'medieval', machine: 'medieval', vm: 'medieval', box: 'medieval' }, foe: 'goblin', critter: 'fly', words: 'medieval', overlay: 'medieval' });
  assert.equal(SET.engineInput(s.now(), null, 60000).patron.skin, null, 'no base pack, the court\'s own skin');
});

test('the 12-hour clock reads 9:42 PM, with midnight\'s hour 12 AM and noon\'s 12 PM; the 24-hour clock as before', () => {
  const c = (h, m, hrs) => { const x = SET.clock(h, m, hrs); return x.time + (x.half ? ' ' + x.half : ''); };
  assert.equal(c(21, 42, 12), '9:42 PM');
  assert.equal(c(0, 5, 12), '12:05 AM');
  assert.equal(c(12, 30, 12), '12:30 PM');
  assert.equal(c(11, 59, 12), '11:59 AM');
  assert.equal(c(13, 0, 12), '1:00 PM');
  assert.equal(c(23, 59, 12), '11:59 PM');
  assert.equal(c(9, 5, 24), '09:05');
  assert.equal(c(0, 0, 24), '00:00');
  assert.equal(c(21, 42, 24), '21:42');
  for (let h = 0; h < 24; h++) assert.match(c(h, 7, 12), /^(1[0-2]|[1-9]):07 (AM|PM)$/);
});

/* ---- The monarch's hair and robe ---------------------------------------------------------------- */

test('the monarch\'s hair and robe come from each level in turn, as drawn (null) when none sets them, and an unknown value is ignored with one line', () => {
  const L = k => { const r = k.now(); return [r.values.look.monarch_hair, r.from.look.monarch_hair, r.values.look.monarch_robe, r.from.look.monarch_robe]; };
  assert.deepEqual(L(store().s), [null, 'built-in', null, 'built-in']);
  const d = store(); d.s.defaults({ look: { monarch_hair: 'silver', monarch_robe: 'teal' } });
  assert.deepEqual(L(d.s), ['silver', 'defaults', 'teal', 'defaults']);
  const sv = store({ storage: storage(saved({ look: { monarch_hair: 'black' } })) }); sv.s.defaults({ look: { monarch_hair: 'silver', monarch_robe: 'teal' } });
  assert.deepEqual(L(sv.s), ['black', 'saved', 'teal', 'defaults']);
  const hk = store({ storage: storage(saved({ look: { monarch_hair: 'black', monarch_robe: 'wine' } })), hooks: { look: { monarch_hair: 'auburn', monarch_robe: 'sable' } } });
  assert.deepEqual(L(hk.s), ['auburn', 'hook', 'sable', 'hook']);
  // values the page does not know, at every level, the empty "as drawn" among them
  const bad = store({ storage: storage(saved({ look: { monarch_hair: 'green' } })), hooks: { look: { monarch_robe: 'red' } } });
  bad.s.defaults({ look: { monarch_hair: null, monarch_robe: '' } });
  assert.deepEqual(L(bad.s), [null, 'built-in', null, 'built-in']);
  for (const want of ['look.monarch_hair "green" in this display\'s saved choices is ignored', 'look.monarch_robe "red" in the address is ignored',
    'look.monarch_hair null in the defaults in state.json is ignored', 'look.monarch_robe "" in the defaults in state.json is ignored']) assert.ok(bad.lines.some(l => l.includes(want)), want + ' in ' + bad.lines.join('\n'));
  assert.equal(bad.s.choose('look', 'monarch_hair', 'green'), false);
  assert.equal(bad.s.choose('look', 'monarch_robe', null), false, '"As drawn" is a clear, never a value');
  // the knight's look is untouched by the monarch's
  assert.deepEqual(SET.knightLook(hk.s.now()), {});
});

test('"As drawn" clears this display\'s choice for that key alone, so the default from the state file or the page\'s own applies', () => {
  const st = storage(), { s } = store({ storage: st });
  let told = 0; s.on(() => told++);
  s.choose('look', 'monarch_hair', 'blonde'); s.choose('look', 'monarch_robe', 'forest'); s.choose('look', 'skin', 'tan');
  assert.equal(told, 3);
  s.clear('look', 'monarch_hair');
  assert.equal(told, 4);
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)).look, { monarch_robe: 'forest', skin: 'tan' });
  assert.deepEqual([s.now().values.look.monarch_hair, s.now().from.look.monarch_hair], [null, 'built-in']);
  assert.equal(s.now().values.look.monarch_robe, 'forest');
  // with a default in the state file, clearing falls to it
  s.defaults({ look: { monarch_robe: 'wine' } });
  s.clear('look', 'monarch_robe');
  assert.deepEqual([s.now().values.look.monarch_robe, s.now().from.look.monarch_robe], ['wine', 'defaults']);
  // clearing what is not saved does nothing and tells nobody
  const was = told;
  s.clear('look', 'monarch_robe'); s.clear('look', 'monarch_hair'); s.clear('analytics', 'on');
  assert.equal(told, was);
  assert.equal(s.own('look'), true, 'the skin is still this display\'s own');
});

test('the engine\'s input carries the monarch\'s hair and robe from the base pack\'s hair and tabard swatches, and null when as drawn or with no pack', () => {
  const { s } = store();
  s.choose('look', 'monarch_hair', 'auburn'); s.choose('look', 'monarch_robe', 'violet');
  const H = PACK.swatches.hair.auburn.entries, R = PACK.swatches.tabard.violet.entries, e = plain(SET.engineInput(s.now(), PACK, 60000));
  assert.deepEqual(e.patron.hair, { id: 'auburn', bands: [H['0'], H['1'], H['2']], brow: H.brow });
  assert.deepEqual(e.patron.robe, { id: 'violet', bands: [R['0'], R['1'], R['2'], R['3']] });
  const none = SET.engineInput(s.now(), null, 60000);
  assert.deepEqual([none.patron.hair, none.patron.robe], [null, null]);
  s.clear('look', 'monarch_hair');
  assert.equal(SET.engineInput(s.now(), PACK, 60000).patron.hair, null);
});

/* ---- The scene chosen for each condition --------------------------------------------------------- */

/* The scenes that can act each condition, as each scene declares it: the table docs/design.md
   gives. A change to a scene's can changes this on purpose or not at all. */
const CAN = {
  battlement: ['attack', 'wan_down', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight', 'streaming'],
  camp: ['attack', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight', 'streaming'],
  house: ['container_unhealthy', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight', 'streaming', 'night'],
  yard: ['attack', 'disk_full', 'backup_overdue', 'device_down', 'cpu_hot', 'memory_tight', 'streaming'],
  cellar: ['disk_full', 'backup_overdue', 'cpu_hot'],
  smithy: ['device_down', 'cpu_hot', 'memory_tight', 'updating', 'streaming'],
  court: ['ssh_session'] };
const OFFERED = {
  attack: ['battlement', 'camp', 'yard'],
  disk_full: ['yard', 'cellar'],
  backup_overdue: ['battlement', 'camp', 'house', 'yard', 'cellar'],
  pi_silent: ['battlement', 'camp', 'house'],
  cpu_hot: ['battlement', 'camp', 'house', 'yard', 'cellar', 'smithy'] };

test('each scene declares the conditions it can act, every condition can be acted in its own scene, and five conditions are offered', () => {
  const w = WORLD();
  assert.deepEqual(w.can, CAN);
  for (const [c, home] of Object.entries(w.homes)) {
    assert.ok(c in ST.CONDITIONS, c);
    if (home) assert.ok(w.can[home].includes(c), c + ' in its own scene, ' + home);
    for (const k of Object.keys(w.can)) if (w.can[k].includes(c) && !home) assert.ok(SET.SCENES.includes(k), c + ' follows the quiet scene, so only quiet scenes list it');
  }
  // memory_tight, retired, is still listed by the scenes that could act it, and is no condition of
  // the page's: it is acted as Under strain
  for (const list of Object.values(w.can)) for (const c of list) assert.ok(c in ST.CONDITIONS || c in ST.RETIRED, c + ' is a condition');
  assert.deepEqual(Object.keys(w.can).sort(), SET.ALL_SCENES.slice().sort(), 'every scene declares');
  assert.deepEqual(SET.offered(w), OFFERED);
  // night is never offered, whatever can act it; nor is a condition with no scene of its own
  const more = plain(w); more.can.camp.push('night');
  assert.ok(!('night' in SET.offered(more)));
  assert.ok(!('device_down' in SET.offered(w)) && !('memory_tight' in SET.offered(w)) && !('streaming' in SET.offered(w)));
  assert.deepEqual(SET.offered(null), {});
  assert.deepEqual(store().s.offered(), OFFERED);
});

test('the scene for a condition comes from each level in turn, and the engine is given only what a level above the page\'s own sets', () => {
  const st = storage(saved({ scenes: { cpu_hot: 'house', disk_full: 'yard' } }));
  const { s } = store({ storage: st, hooks: { scenes: { cpu_hot: 'cellar' } } });
  s.defaults({ scenes: { cpu_hot: 'camp', disk_full: 'cellar', attack: 'yard' } });
  const r = s.now();
  assert.deepEqual([r.values.scenes.cpu_hot, r.from.scenes.cpu_hot], ['cellar', 'hook']);
  assert.deepEqual([r.values.scenes.disk_full, r.from.scenes.disk_full], ['yard', 'saved']);
  assert.deepEqual([r.values.scenes.attack, r.from.scenes.attack], ['yard', 'defaults']);
  assert.deepEqual([r.values.scenes.pi_silent, r.from.scenes.pi_silent], ['house', 'built-in']);
  // the defaults' cellar for the disk is the scene's own, yet set by a level, so the engine is told
  assert.deepEqual(plain(SET.engineInput(r, PACK, 60000).scenes), { cpu_hot: 'cellar', disk_full: 'yard', attack: 'yard' });
  assert.deepEqual(plain(s.fallback().values.scenes), { attack: 'yard', disk_full: 'cellar', backup_overdue: 'house', pi_silent: 'house', cpu_hot: 'camp' });
});

test('a scene that cannot act its condition, a condition not offered and a name the page does not know are each ignored at their level with one line', () => {
  const { s, lines } = store({ storage: storage(saved({ scenes: { attack: 'house', moon: 'camp' } })), hooks: { scenes: { pi_silent: 'yard', cpu_hot: '' } } });
  s.defaults({ scenes: { attack: 'camp', night: 'camp', ssh_session: 'court', device_down: 'camp', cpu_hot: 'moon', disk_full: 7, backup_overdue: 'cellar' } });
  const r = s.now();
  assert.deepEqual([r.values.scenes.attack, r.from.scenes.attack], ['camp', 'defaults'], 'the house cannot act the attack, so the defaults\' camp');
  assert.deepEqual([r.values.scenes.pi_silent, r.from.scenes.pi_silent], ['house', 'built-in'], 'the pie stands left of the knight in the yard');
  assert.deepEqual([r.values.scenes.cpu_hot, r.from.scenes.cpu_hot], ['yard', 'built-in']);
  assert.deepEqual([r.values.scenes.disk_full, r.values.scenes.backup_overdue], ['cellar', 'cellar']);
  assert.ok(!('night' in r.values.scenes) && !('ssh_session' in r.values.scenes) && !('moon' in r.values.scenes));
  assert.deepEqual(plain(SET.engineInput(r, PACK, 60000).scenes), { attack: 'camp', backup_overdue: 'cellar' });
  const before = lines.length; s.now(); s.now();
  assert.equal(lines.length, before, 'each line once');
  for (const want of [
    'scenes.attack "house" in this display\'s saved choices is ignored: that scene cannot act it',
    'scenes.moon "camp" in this display\'s saved choices is ignored: not a condition the page knows',
    'scenes.pi_silent "yard" in the address is ignored: that scene cannot act it',
    'scenes.cpu_hot "" in the address is ignored: not a scene the page knows',
    'scenes.night "camp" in the defaults in state.json is ignored: the page offers no choice of scene for it',
    'scenes.ssh_session "court" in the defaults in state.json is ignored: the page offers no choice of scene for it',
    'scenes.device_down "camp" in the defaults in state.json is ignored: the page offers no choice of scene for it',
    'scenes.cpu_hot "moon" in the defaults in state.json is ignored: not a scene the page knows',
    'scenes.disk_full 7 in the defaults in state.json is ignored: not a scene the page knows'])
    assert.ok(lines.includes('knightwatcher: settings: ' + want), want + ' in ' + lines.join('\n'));
  assert.equal(s.choose('scenes', 'attack', 'house'), false);
  assert.equal(s.choose('scenes', 'night', 'house'), false);
  assert.equal(s.choose('scenes', 'cpu_hot', 'camp'), true);
});

test('a choice of scene is saved under scenes, read back, and reset; a text saved before there was a scenes section still loads', () => {
  const st = storage(), a = store({ storage: st });
  assert.equal(a.s.choose('scenes', 'cpu_hot', 'camp'), true);
  assert.equal(a.s.choose('scenes', 'pi_silent', 'battlement'), true);
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)), { v: 1, look: {}, display: {}, quiet: {}, scenes: { cpu_hot: 'camp', pi_silent: 'battlement' } });
  const b = store({ storage: st });
  assert.deepEqual([b.s.now().values.scenes.cpu_hot, b.s.now().from.scenes.cpu_hot], ['camp', 'saved']);
  assert.ok(b.s.own('scenes'));
  b.s.reset('scenes');
  assert.equal(b.s.own('scenes'), false);
  assert.equal(b.s.now().from.scenes.cpu_hot, 'built-in');
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)).scenes, {});
  // a value saved by the page before this one, with look, display and quiet alone
  const old = store({ storage: storage(JSON.stringify({ v: 1, look: { skin: 'deep', monarch: 'c' }, display: { clock: 12 }, quiet: { minutes: 30 } })) });
  const r = old.s.now();
  assert.deepEqual([r.values.look.skin, r.values.look.monarch, r.values.display.clock, r.values.quiet.minutes], ['deep', 'c', 12, 30]);
  assert.ok(Object.values(r.from.scenes).every(f => f === 'built-in'));
  assert.deepEqual(old.lines, []);
  assert.equal(old.s.choose('scenes', 'attack', 'yard'), true);
  assert.deepEqual(JSON.parse(old.st.m.get(SET.KEY)), { v: 1, look: { skin: 'deep', monarch: 'c' }, display: { clock: 12 }, quiet: { minutes: 30 }, scenes: { attack: 'yard' } });
});

/* ---- The engine, the court and the knight in a sandbox ------------------------------------------ */

const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
  'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js', 'js/ed25519.js', 'js/pack.js', 'packs/base.pack.js', 'js/state.js', 'js/engine.js', 'js/settings.js'];
/* The page's scripts on a dev page, the base pack unsigned so that it is read there whether it
   ships signed or not. calls records every fill, as 'r x y w h colour', and every colour set. */
function load() {
  const calls = [];
  let fill = '';
  const ctx = new Proxy({}, {
    set(_, k, v) { if (k === 'fillStyle') fill = String(v); calls.push(k + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => calls.push(['r', x, y, w, h, fill].join(' '));
      if (k === 'createLinearGradient') return () => ({ addColorStop: (o, c) => calls.push('stop ' + c) });
      return (...a) => calls.push([String(k), ...a].join(' '));
    },
  });
  const quiet = new Proxy({}, { set() { return true; }, get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {} }, document: { createElement: () => ({ width: 0, height: 0, getContext: () => quiet }) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.hooks = { frozen: true, t: 0 };
  KW.view.LW = 960; KW.view.LH = 600;
  KW.knight.start([SIGN.withoutSig(PACK_TEXT)], true);
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, E: KW.engine, V: KW.view, calls };
}

test('the engine\'s quiet rotation takes the input\'s scenes in turn for its length, and all five when it has none', () => {
  const { KW, E } = load();
  E.init(new Proxy({}, { set() { return true; }, get: () => () => {} }));
  const base = { w: KW.state.IDLE, is: 'auto', devices: [], tv: false, helmet: 'auto' };
  const at = (input, ts) => ts.map(t => { E.input = Object.assign({}, base, input); E.restartTurns(0); E.draw(t); return E.scene(); });
  assert.deepEqual(at({ turnMs: 1000 }, [0, 1000, 2000, 3000, 4000, 5000]), ['battlement', 'camp', 'house', 'yard', 'smithy', 'battlement']);
  assert.deepEqual(at({ turnMs: 1000, turns: [] }, [0, 1000, 2000, 3000, 4000]), ['battlement', 'camp', 'house', 'yard', 'smithy']);
  // a list saved before the smithy was a quiet scene, the old four, turns between those four alone
  assert.deepEqual(at({ turnMs: 1000, turns: ['battlement', 'camp', 'house', 'yard'] }, [0, 1000, 2000, 3000, 4000]), ['battlement', 'camp', 'house', 'yard', 'battlement']);
  assert.deepEqual(at({ turnMs: 1000, turns: ['camp', 'yard'] }, [0, 999, 1000, 2000, 3500]), ['camp', 'camp', 'yard', 'camp', 'yard']);
  assert.deepEqual(at({ turnMs: 300000, turns: ['house'] }, [0, 299999, 300000, 5e6]), ['house', 'house', 'house', 'house']);
  // a scene the address keeps (is=) wins over the rotation
  assert.deepEqual(at({ turnMs: 1000, turns: ['camp'], is: 'yard' }, [0, 5000]), ['yard', 'yard']);
});

test('the engine plays a condition in the scene the input chooses for it when that scene can act it, and in its own otherwise', () => {
  const { KW, E } = load();
  E.init(new Proxy({}, { set() { return true; }, get: () => () => {} }));
  const w = id => Object.assign({}, KW.state.CONDITIONS[id], { id, st: 'warn', hl: '', sub: '' });
  const at = (id, scenes) => { E.input = { w: w(id), is: 'auto', devices: [], tv: false, helmet: 'auto', turnMs: 1000, scenes }; E.restartTurns(0); E.draw(0); return E.scene(); };
  assert.equal(at('cpu_hot'), 'yard', 'nothing chosen: its own');
  assert.equal(at('cpu_hot', {}), 'yard');
  assert.equal(at('cpu_hot', { cpu_hot: 'camp' }), 'camp');
  assert.equal(at('pi_silent', { cpu_hot: 'camp' }), 'house', 'a choice for another condition changes nothing');
  assert.equal(at('attack', { attack: 'house' }), 'battlement', 'the house cannot act the attack');
  assert.equal(at('night', { night: 'camp' }), 'house');
  assert.equal(at('disk_full', { disk_full: 'moon' }), 'cellar', 'a scene the page does not have');
  assert.equal(at('device_down', { device_down: 'house' }), 'battlement', 'device_down follows the quiet scenes');
  for (const [c, list] of Object.entries(OFFERED)) for (const k of list) assert.equal(at(c, { [c]: k }), k, c + ' in the ' + k);
  // the input as the settings give it with nothing set changes no scene
  for (const c of Object.keys(KW.state.CONDITIONS)) assert.equal(at(c, plain(SET.engineInput(store().s.now(), PACK, 1000).scenes)), at(c), c);
  // sceneOf, which the events also ask, gives the same scene the frame draws
  E.input = { w: w('backup_overdue'), is: 'auto', devices: [], tv: false, helmet: 'auto', turnMs: 1000, scenes: { backup_overdue: 'yard' } };
  assert.equal(E.sceneOf(E.input.w, 0), 'yard');
});

/* The court's backdrop painted with the monarch, skin, hair and robe given, as the calls it makes.
   narrow paints only the right of the grid, where the throne stands, which is quicker. */
function court(m, mon, monSkin, monHair, monRobe, narrow) {
  const sc = m.KW.scenes.court, o = m.K.pose('ssh_session', 100);
  o.x = sc.spot * m.V.U; o.floor = m.V.HFL;
  Object.assign(m.V, { HL: narrow ? 700 : 0, HR: 960, HT: narrow ? 180 : 0 });
  m.calls.length = 0;
  sc.paint({ w: m.KW.state.IDLE, devices: [], places: sc.places, tv: false, kx: o.x, o, here: null, inBed: false, helmOff: false, strike: false, patron: { id: mon, skin: monSkin,
    hair: monHair || null, robe: monRobe || null } });
  return m.calls.slice();
}
const skinOf = id => ({ id, face: PACK.swatches.skin[id].entries.face, cheek: PACK.swatches.skin[id].entries.cheek });
const faceColours = id => PACK.swatches.skin[id].entries.face.map(b => b[1]).concat(PACK.swatches.skin[id].entries.cheek);

test('the monarch\'s skin: the court\'s own by default, the same calls for the warm swatch, and each other swatch in its own colours alone', () => {
  const m = load();
  const sc = m.KW.scenes.court, own = court(m, 'a', null);
  assert.deepEqual(court(m, 'a', skinOf('warm')), own, 'the warm swatch is the court\'s own skin');
  assert.equal(sc.key({ patron: { id: 'a', skin: null } }), 'a|');
  assert.equal(sc.key({ patron: { id: 'b', skin: skinOf('deep') } }), 'b|deep');
  // a skin that is not a face of three bands and a cheek is not drawn
  assert.deepEqual(court(m, 'a', { id: 'bad', face: [[1, 'red']], cheek: '#000000' }), own);
  assert.equal(sc.key({ patron: { id: 'a', skin: { id: 'bad' } } }), 'a|');
  const text = calls => calls.join('\n');
  for (const mon of ['a', 'b', 'c']) for (const id of Object.keys(PACK.swatches.skin)) {
    const got = text(court(m, mon, skinOf(id)));
    for (const c of faceColours(id)) assert.ok(got.includes(c), mon + ' ' + id + ' draws ' + c);
    for (const other of Object.keys(PACK.swatches.skin)) if (other !== id) for (const c of faceColours(other)) if (!faceColours(id).includes(c)) assert.ok(!got.includes(c), mon + ' ' + id + ' draws ' + other + '\'s ' + c);
  }
});

const hairOf = id => { const e = PACK.swatches.hair[id].entries; return { id, bands: [e['0'], e['1'], e['2']], brow: e.brow }; };
const robeOf = id => { const e = PACK.swatches.tabard[id].entries; return { id, bands: [e['0'], e['1'], e['2'], e['3']] }; };

test('the monarch\'s hair and robe: as drawn by default and for a shape the court cannot read, each swatch\'s bands where given, and both in the backdrop\'s key', () => {
  const m = load();
  const sc = m.KW.scenes.court;
  for (const mon of ['a', 'b', 'c']) {
    const own = court(m, mon, null), text = calls => calls.join('\n');
    assert.deepEqual(court(m, mon, null, null, null), own, mon + ': nothing given is as drawn');
    assert.deepEqual(court(m, mon, null, { id: 'x', bands: ['#000000'] }, { id: 'y', bands: ['red', 'green', 'blue', 'black'] }), own, mon + ': shapes it cannot read');
    const drawn = sc.drawn(mon), ownText = text(own);
    for (const c of drawn.hair.concat(drawn.robe)) assert.ok(ownText.includes(c), mon + ' as drawn has ' + c);
    for (const id of Object.keys(PACK.swatches.hair)) {
      const got = text(court(m, mon, null, hairOf(id), null));
      for (const c of hairOf(id).bands) assert.ok(got.includes(c), mon + ' hair ' + id + ' ' + c);
      for (const c of drawn.hair) if (!hairOf(id).bands.includes(c)) assert.ok(!got.includes(c), mon + ' hair ' + id + ' still draws its own ' + c);
      assert.ok(drawn.robe.every(c => got.includes(c)), mon + ' keeps its robe');
    }
    for (const id of Object.keys(PACK.swatches.tabard)) {
      const got = text(court(m, mon, null, null, robeOf(id)));
      for (const c of robeOf(id).bands) assert.ok(got.includes(c), mon + ' robe ' + id + ' ' + c);
      assert.ok(drawn.hair.every(c => got.includes(c)), mon + ' keeps its hair');
    }
  }
  // the banners and A's sceptre keep the court's red, whatever the robe
  assert.ok(text2(court(m, 'a', null, null, robeOf('teal'))).includes(m.KW.draw.C.R1));
  assert.equal(sc.key({ patron: { id: 'a', skin: null, hair: null, robe: null } }), 'a|');
  assert.equal(sc.key({ patron: { id: 'b', skin: skinOf('deep'), hair: hairOf('silver'), robe: null } }), 'b|deep|silver|');
  assert.equal(sc.key({ patron: { id: 'c', skin: null, hair: null, robe: robeOf('wine') } }), 'c|||wine');
  assert.equal(sc.key({ patron: { id: 'c', skin: null, hair: { id: 'bad', bands: [] }, robe: null } }), 'c|');
});
const text2 = calls => calls.join('\n');

test('KW.knight.look() draws a new look from the base pack in place, without reading the packs again', () => {
  const m = load();
  const was = m.K.status;
  const st = m.K.look({ swatches: { skin: 'kw.base/deep' }, items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } });
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(st.fallbacks).filter(f => f.reason !== 'not set'), []);
  assert.equal(m.K.rest.key('off'), 'kw.base/off.heater');
  assert.equal(m.K.rest.reach().to, 175);
  m.K.look({});
  assert.equal(m.K.rest.key('off'), '');
  assert.equal(m.K.status, was, 'the same status object, updated in place');
  assert.equal(m.K.basePack().id, 'kw.base');
});

/* The knight drawn in a few poses that cover the look's lists: standing, the attack, a swing each
   way, the bare head in bed and the gear at rest. Returns the calls. */
function drawAll(m) {
  m.calls.length = 0;
  for (const [id, t] of [['idle', 2300], ['attack', 1200], ['cpu_hot', 2470]]) for (const helmet of [true, false]) {
    const o = m.K.pose(id, t); o.x = 480; o.floor = m.V.HFL; o.helmet = helmet; m.K.draw(o);
  }
  for (const dir of [1, -1]) { const o = m.K.pose('idle', 0); o.x = 480; o.floor = m.V.HFL; o.helmet = true; m.K.swing(o, .55, dir); m.K.draw(o); }
  m.K.head(360, 300, m.K.pose('container_unhealthy', 0));
  m.K.rest.draw('helmet', 460, 476); m.K.rest.draw('main', 618, 228, Math.PI / 2); m.K.rest.draw('off', 844, 164);
  return m.calls.join('\n');
}

test('every combination renders: weapon by skin by hair by hair style, the build, the tabard and the plume cycled, from the base pack, within the caps', () => {
  const m = load(), lib = [PK.read(SIGN.withoutSig(PACK_TEXT), { allowUnsigned: true })];
  const O = SET.ONE_OF.look;
  let n = 0, most = 0;
  const seen = new Set();
  for (const weapon of O.weapon) for (const skin of O.skin) for (const hair of O.hair) for (const hair_style of O.hair_style) {
    // the build turns once with each hair style and starts one further on for each hair, so every
    // build is drawn with every weapon, skin, hair colour and hair style (base-pack.test.js resolves
    // the full product of them)
    const build = O.build[(n + Math.floor(n / 3)) % 3], tabard = O.tabard[n % 6], plume = O.plume[(n * 5 + 1) % 6];
    for (const [k, v] of Object.entries({ weapon, skin, hair, hair_style })) seen.add(build + ' ' + k + ' ' + v);
    const { s } = store();
    for (const [k, v] of Object.entries({ build, weapon, skin, hair, hair_style, tabard, plume })) assert.equal(s.choose('look', k, v), true);
    const look = SET.knightLook(s.now()), what = JSON.stringify(look);
    const st = m.K.look(look);
    assert.equal(st.source, 'pack', what);
    // the knight is rigged on the build chosen: its right shoulder where the build's measurements put it
    const bm = PACK.builds['build.' + build].m, o = Object.assign(m.K.pose('idle', 0), { x: 480, floor: 500, bob: 0 });
    assert.deepEqual(plain(m.K.rig(o).anchors.shoulderR), [480 + bm.shoulder, 500 - bm.height], what + ' is rigged on its build');
    assert.deepEqual(plain(st.refused), [], what);
    assert.deepEqual(plain(st.fallbacks).filter(f => f.reason !== 'not set'), [], what);
    const drawn = drawAll(m);
    assert.equal(m.K.source, 'pack', what + ': nothing threw while drawing');
    for (const [set, id] of [['skin', skin], ['tabard', tabard], ['plume', plume]]) {
      const e = PACK.swatches[set][id].entries, c = set === 'skin' ? e.face[1][1] : e['1'];
      assert.ok(drawn.includes(c), what + ' draws its ' + set + ' ' + c);
    }
    const L = PK.resolve(lib, look);
    assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost, what + ' within the caps');
    most = Math.max(most, L.cost);
    n++;
  }
  assert.equal(n, 5 * 6 * 6 * 6);
  assert.equal(seen.size, 3 * (5 + 6 + 6 + 6), 'every build with every weapon, skin, hair colour and hair style');
  assert.ok(most <= PK.LIMITS.lookCost);
});

test('every monarch renders in every skin, hair and robe, as drawn among them, from the base pack\'s swatches, through the engine\'s input', () => {
  const m = load(), O = SET.ONE_OF.look;
  let n = 0;
  for (const monarch of O.monarch) for (const monarch_skin of O.monarch_skin) for (const monarch_hair of [null].concat(O.monarch_hair)) for (const monarch_robe of [null].concat(O.monarch_robe)) {
    const { s } = store(); s.choose('look', 'monarch', monarch); s.choose('look', 'monarch_skin', monarch_skin);
    if (monarch_hair) assert.equal(s.choose('look', 'monarch_hair', monarch_hair), true);
    if (monarch_robe) assert.equal(s.choose('look', 'monarch_robe', monarch_robe), true);
    const e = SET.engineInput(s.now(), m.K.basePack(), 600000), what = [monarch, monarch_skin, monarch_hair, monarch_robe].join(' ');
    assert.equal(e.patron.id, monarch);
    const got = court(m, e.patron.id, e.patron.skin, e.patron.hair, e.patron.robe, true).join('\n'), own = m.KW.scenes.court.drawn(monarch);
    assert.ok(got.length > 0);
    for (const c of faceColours(monarch_skin)) assert.ok(got.includes(c), what + ' skin ' + c);
    for (const c of monarch_hair ? hairOf(monarch_hair).bands : own.hair) assert.ok(got.includes(c), what + ' hair ' + c);
    for (const c of monarch_robe ? robeOf(monarch_robe).bands : own.robe) assert.ok(got.includes(c), what + ' robe ' + c);
    assert.ok(!/NaN|undefined/.test(got), what + ' draws no broken colour');
    n++;
  }
  assert.equal(n, 3 * 6 * 7 * 7);
});

/* ---- The gear --------------------------------------------------------------------------------- */

/* The gear keys and the slot each fills, with the base pack's prefix: the contract's value "long"
   of hair_style is kw.base/hair.long, "shoes" of feet kw.base/boots.shoes. */
const GEAR = { hair_style: 'hair.', helmet: 'helm.', plume_style: 'plume.', body: 'torso.', shoulders: 'pauldrons.', arms: 'arms.', hands: 'gauntlets.', legs: 'legs.', feet: 'boots.', back: 'back.' };
const SLOT = { hair_style: 'hair', helmet: 'helmet', plume_style: 'plume', body: 'torso', shoulders: 'pauldrons', arms: 'arms', hands: 'gauntlets', legs: 'legs', feet: 'boots', back: 'back' };

test('every gear value names an item of the base pack in its slot, and the page\'s own are the base pack\'s defaults', () => {
  const O = SET.ONE_OF.look, own = SET.builtIn(PACK).look;
  for (const k of Object.keys(GEAR)) {
    for (const v of O[k]) {
      if (v === 'none') { assert.equal(k, 'back'); continue; }
      const it = PACK.items[GEAR[k] + v];
      assert.ok(it, k + ' ' + v + ' is an item of the base pack');
      assert.equal(it.slot, SLOT[k], k + ' ' + v);
    }
    // the page's own is the pack's default, and back nothing, which the pack's defaults leave out
    assert.equal(k === 'back' ? 'none' : GEAR[k] + own[k], k === 'back' ? own.back : PACK.defaults.items[SLOT[k]], k);
    // and every item of the slot is offered
    const ids = Object.keys(PACK.items).filter(id => PACK.items[id].slot === SLOT[k]).map(id => id.slice(GEAR[k].length)).sort();
    assert.deepEqual(O[k].filter(v => v !== 'none').slice().sort(), ids, k + ': every item of the slot');
  }
  for (const v of O.shield) assert.equal(PACK.items['off.' + v].slot, 'off');
  assert.deepEqual(O.shield, ['heater', 'round', 'kite']);
  assert.deepEqual(Object.keys(SET.WEAPONS), O.weapon);
  for (const w of O.weapon) assert.equal(PACK.items[SET.WEAPONS[w]].grip.kind === 'one', SET.ONE_HANDED.includes(w), w);
});

test('the look carries each gear choice to its slot, the shield only beside a one-handed weapon, and nothing for no back', () => {
  const look = (choices, hooks) => { const { s } = store({ hooks }); for (const [k, v] of Object.entries(choices)) assert.equal(s.choose('look', k, v), true, k + ' ' + v); return SET.knightLook(s.now()); };
  const B = 'kw.base/';
  assert.deepEqual(look({ helmet: 'kettle', plume_style: 'feather', body: 'cuirass', shoulders: 'lames', arms: 'mail', hands: 'leather', legs: 'hose', feet: 'sabatons', back: 'cloak', hair_style: 'long' }),
    { items: { hair: B + 'hair.long', helmet: B + 'helm.kettle', plume: B + 'plume.feather', torso: B + 'torso.cuirass', pauldrons: B + 'pauldrons.lames', arms: B + 'arms.mail',
      gauntlets: B + 'gauntlets.leather', legs: B + 'legs.hose', boots: B + 'boots.sabatons', back: B + 'back.cloak' } });
  // no back, chosen, puts nothing on the back, as the base pack's defaults have nothing there
  assert.deepEqual(look({ back: 'none' }), {});
  // the weapons, each with its shield when one-handed
  assert.deepEqual(look({ weapon: 'longsword' }), { items: { main: B + 'main.longsword' } });
  assert.deepEqual(look({ weapon: 'mace_and_shield' }), { items: { main: B + 'main.mace', off: B + 'off.heater' } });
  assert.deepEqual(look({ weapon: 'mace_and_shield', shield: 'round' }), { items: { main: B + 'main.mace', off: B + 'off.round' } });
  assert.deepEqual(look({ weapon: 'sword_and_shield', shield: 'kite' }), { items: { main: B + 'main.arming', off: B + 'off.kite' } });
  assert.deepEqual(look({ weapon: 'sword_and_shield' }), { items: { main: B + 'main.arming', off: B + 'off.heater' } });
  assert.deepEqual(look({ weapon: 'crossbow' }), { items: { main: B + 'main.crossbow' } });
  // a shield chosen beside a two-handed weapon is kept, carried nowhere, and carried again once the
  // weapon is one-handed
  assert.deepEqual(look({ shield: 'kite' }), {});
  assert.deepEqual(look({ weapon: 'longsword', shield: 'kite' }), { items: { main: B + 'main.longsword' } });
  assert.deepEqual(look({ weapon: 'crossbow', shield: 'kite' }), { items: { main: B + 'main.crossbow' } });
  assert.deepEqual(look({ shield: 'kite' }, { look: { weapon: 'mace_and_shield' } }), { items: { main: B + 'main.mace', off: B + 'off.kite' } });
  // a value the page does not know is refused, and a hook's is ignored with its line
  const { s, lines } = store({ hooks: { look: { helmet: 'great', back: 'wings' } } });
  assert.equal(s.choose('look', 'helmet', 'great'), false);
  assert.equal(s.choose('look', 'shield', 'buckler'), false);
  assert.equal(s.choose('look', 'weapon', 'falchion'), false);
  assert.deepEqual([s.now().values.look.helmet, s.now().values.look.back], ['open', 'none']);
  assert.ok(lines.includes('knightwatcher: settings: look.helmet "great" in the address is ignored: not a value the page knows'));
});

test('the settings screen greys the shield beside a two-handed weapon, and the plume with the mail coif, its colour too unless the long cloak is worn', () => {
  const v = o => Object.assign({}, SET.builtIn(PACK).look, o);
  assert.deepEqual(SET.greyed(v({ weapon: 'sword_and_shield' }), PACK), { shield: '', plume_style: '', plume: '' });
  assert.deepEqual(SET.greyed(v({ weapon: 'mace_and_shield', helmet: 'kettle' }), PACK), { shield: '', plume_style: '', plume: '' });
  const SHIELD = 'A shield is carried only with a one-handed weapon: the sword and shield or the mace and shield.';
  for (const weapon of ['greatsword', 'longsword', 'crossbow']) assert.equal(SET.greyed(v({ weapon }), PACK).shield, SHIELD);
  for (const helmet of ['open', 'kettle', 'bascinet']) assert.equal(SET.greyed(v({ helmet }), PACK).plume_style, '', helmet);
  const COIF = 'The mail coif has no plume mount, so no plume is drawn with it.';
  assert.deepEqual(SET.greyed(v({ weapon: 'mace_and_shield', helmet: 'coif' }), PACK), { shield: '', plume_style: COIF, plume: COIF });
  for (const back of ['none', 'cape']) assert.equal(SET.greyed(v({ helmet: 'coif', back }), PACK).plume, COIF, back);
  assert.deepEqual(SET.greyed(v({ weapon: 'mace_and_shield', helmet: 'coif', back: 'cloak' }), PACK), { shield: '', plume_style: COIF, plume: '' });
  // with no base pack nothing is known of the helmets, and only the shield's rule holds
  assert.deepEqual(SET.greyed(v({ helmet: 'coif' }), null), { shield: SHIELD, plume_style: '', plume: '' });
});

test('the screen\'s and the admin page\'s choices of gear are the base pack\'s, named as it names them', () => {
  assert.deepEqual(SET.itemChoices(PACK, 'weapon'), [{ id: 'greatsword', name: 'Greatsword', sub: 'Two hands' }, { id: 'sword_and_shield', name: 'Sword and shield', sub: 'One hand each' },
    { id: 'longsword', name: 'Longsword', sub: 'Two hands' }, { id: 'mace_and_shield', name: 'Mace and shield', sub: 'One hand each' }, { id: 'crossbow', name: 'Crossbow', sub: 'Two hands' }]);
  const names = k => SET.itemChoices(PACK, k).map(c => c.name);
  assert.deepEqual(names('shield'), ['Heater shield of the watch', 'Round shield', 'Kite shield']);
  assert.deepEqual(names('helmet'), ['Open helm', 'Kettle hat', 'Mail coif', 'Bascinet']);
  assert.deepEqual(names('plume_style'), ['Crest', 'Tall feather', 'Horsehair']);
  assert.deepEqual(names('body'), ['Tabard of the watch', 'Breastplate', 'Quilted gambeson']);
  assert.deepEqual(names('shoulders'), ['Plate pauldrons', 'Layered spaulders', 'Leather pauldrons']);
  assert.deepEqual(names('arms'), ['Plate arms', 'Mail sleeves', 'Padded sleeves']);
  assert.deepEqual(names('hands'), ['Plate gauntlets', 'Leather gloves', 'Mail mittens']);
  assert.deepEqual(names('legs'), ['Plate greaves', 'Mail chausses', 'Padded hose']);
  assert.deepEqual(names('feet'), ['Riding boots', 'Sabatons', 'Turnshoes']);
  assert.deepEqual(names('back'), ['Nothing', 'Long cloak', 'Short cape']);
  assert.deepEqual(names('hair_style'), ['Short crop', 'Tied back', 'Curls', 'Long', 'Close crop', 'Buzzcut']);
  // a base pack without an item offers only what it draws, as a fork's might
  const fewer = JSON.parse(JSON.stringify(PACK)); delete fewer.items['helm.coif']; delete fewer.items['main.mace'];
  assert.deepEqual(SET.itemChoices(fewer, 'helmet').map(c => c.id), ['open', 'kettle', 'bascinet']);
  assert.deepEqual(SET.itemChoices(fewer, 'weapon').map(c => c.id), ['greatsword', 'sword_and_shield', 'longsword', 'crossbow']);
  assert.deepEqual(SET.itemChoices(null, 'back').map(c => c.id), ['none']);
});

test('every gear choice renders on every build with each kind of weapon, from the base pack, through the settings, within the caps', () => {
  const m = load(), lib = [PK.read(SIGN.withoutSig(PACK_TEXT), { allowUnsigned: true })], O = SET.ONE_OF.look;
  let n = 0;
  for (const build of O.build) for (const k of ['shield', 'helmet', 'plume_style', 'body', 'shoulders', 'arms', 'hands', 'legs', 'feet', 'back', 'hair_style']) for (const v of O[k]) {
    // with a two-handed weapon and a one-handed one in turn; a shield beside the mace, the long cloak
    // with a gold plume to show its colour
    const weapon = k === 'shield' ? 'mace_and_shield' : n % 2 ? 'longsword' : 'mace_and_shield', plume = 'gold';
    const { s } = store();
    for (const [kk, vv] of Object.entries({ build, weapon, plume, [k]: v })) assert.equal(s.choose('look', kk, vv), true, kk + ' ' + vv);
    const look = SET.knightLook(s.now()), what = JSON.stringify(look), st = m.K.look(look);
    assert.equal(st.source, 'pack', what);
    assert.deepEqual(plain(st.refused), [], what);
    assert.deepEqual(plain(st.fallbacks).filter(f => f.reason !== 'not set'), [], what);
    const drawn = drawAll(m);
    assert.equal(m.K.source, 'pack', what + ': nothing threw while drawing');
    assert.ok(!/NaN|undefined/.test(drawn), what + ' draws no broken number or colour');
    if (k === 'back' && v === 'cloak') assert.ok(drawn.includes(PACK.swatches.plume.gold.entries['2']), what + ': the cloak in the plume\'s colour');
    const L = PK.resolve(lib, look);
    assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost, what + ' within the caps');
    n++;
  }
  assert.equal(n, 3 * (3 + 4 + 3 + 3 + 3 + 3 + 3 + 3 + 3 + 3 + 6));
});

test('the status page says whether the usage counts are on, read only, and how .env changes it', () => {
  const on = SET.usageLines({ analytics: true }, 'live'), off = SET.usageLines({ analytics: false }, 'live');
  assert.match(on[0][1], /^On\./); assert.match(on[1][1], /KW_ANALYTICS=off in \.env/);
  assert.match(off[0][1], /^Off\./); assert.match(off[1][1], /KW_ANALYTICS=on in \.env/);
  assert.deepEqual(SET.usageLines({ analytics: null }, 'live'), [['quiet', 'Not known: the state file does not say.']]);
  assert.deepEqual(SET.usageLines(null, 'demo'), [['quiet', 'Not known. The display is showing the demo.']]);
  assert.deepEqual(SET.usageLines(null, 'wait'), [['quiet', 'Not known yet.']]);
  // the store has no setting for it: no switch on the display
  const { s } = store();
  assert.equal(s.choose('analytics', 'on', false), false);
  assert.ok(!Object.keys(SET.SCHEMA).includes('analytics'));
});
