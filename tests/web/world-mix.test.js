// Tests for mixing parts across worlds on the settings screen and the admin page: the contract's
// long names for the monarch's colours and the pet's coat; the slot's item giving way to its key;
// the pet's coat fitted to the pet in use; how the weapon in use is held, and what that greys;
// the store's one-write choice of a part; and the rows every part page lists (KW.settings.screen):
// each loaded world's choices grouped, the world in use's first, whether a part differs from the
// world's own, the amber line of a part that cannot be used where it is chosen, the roles' labels,
// and the admin page's household look built on the same rows. The second world is the test world,
// test.orbit (docs/tests.md, The test world), read on dev terms.
// Run with: node --test tests/web/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const ROOT = path.join(__dirname, '../..'), WEB = path.join(ROOT, 'web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const TEXT = fs.readFileSync(ORBIT.FILE, 'utf8');
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/* Deep equality across the sandbox's realm: both sides as plain data. */
const eq = (a, b, m) => (m === undefined ? assert.deepEqual(plain(a), plain(b)) : assert.deepEqual(plain(a), plain(b), m));
const O = n => 'test.orbit/' + n;
const WORLD = O('world.orbit');

/* A canvas context that does nothing. */
const context = () => new Proxy({}, { set: () => true, get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
/* The page's scripts in a sandbox with a document, so that the screen's rows are there
   (KW.settings.screen), the knight and the world started from texts on dev terms. */
function page(texts) {
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context(); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(texts, true);
  KW.world.start(texts, true);
  return KW;
}
/* A store over the page's world, with the levels given; writes counts the browser's writes. */
function store(KW, o) {
  o = o || {};
  const m = new Map(o.saved ? [[SET.KEY, JSON.stringify(Object.assign({ v: 1 }, o.saved))]] : []), writes = [];
  const s = KW.settings.create({ hooks: o.hooks, storage: () => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(v); m.set(k, v); } }),
    pack: () => KW.knight.basePack(), world: () => KW.settings.pageWorld(), say: () => {} });
  if (o.defaults) s.defaults(o.defaults);
  return { s, writes, saved: () => JSON.parse(m.get(SET.KEY) || '{}') };
}
const KW = page([BASE_TEXT, MED_TEXT, TEXT]), SCR = KW.settings.screen;
const MED = page([BASE_TEXT, MED_TEXT]);
const pack = () => KW.knight.basePack();
const rowsOf = (st, which, labels) => {
  const r = st.s.now(), own = st.s.parts(r.values.look.world), cat = st.s.catalogue();
  if (which === 'knight') return SCR.knightRows(r, own, pack(), cat, KW.knight.status).filter(x => !x.intro);
  if (which === 'patron') return SCR.patronRows(r, own, pack(), cat, labels || null);
  return SCR.castRows(r, own, pack(), cat, labels || null);
};
const byKey = (rows, k) => rows.find(x => x.k === k);
const names = x => x.groups.map(g => g.name + ': ' + g.choices.map(c => String(c.id)).join(' '));

// ---- The contract ---------------------------------------------------------------------------------

test('the monarch\'s colours and the pet\'s coat take a long name, in the schema and the page\'s copy of it', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'collector/settings-schema.json'), 'utf8')), look = schema.tables.find(t => t.table === 'look').settings;
  for (const k of ['monarch_skin', 'monarch_hair', 'monarch_robe', 'pet_coat']) {
    assert.equal(look.find(s => s.key === k).long, true, k);
    assert.equal(SET.SCHEMA.look[k].long, true, k);
  }
  // the cast's keys are on the cast page
  for (const k of ['pet', 'pet_coat', 'foe', 'critter']) assert.equal(look.find(s => s.key === k).gui.wall.section, 'The cast', k);
});

test('another pack\'s swatch is taken for the monarch\'s skin, hair and robe once loaded, and drawn in its colours at court', () => {
  const st = store(KW, { saved: { look: { monarch: 'b', monarch_skin: O('chrome'), monarch_hair: O('wire'), monarch_robe: O('panel') } } }), r = st.s.now();
  eq([r.values.look.monarch_skin, r.values.look.monarch_hair, r.values.look.monarch_robe], [O('chrome'), O('wire'), O('panel')]);
  const e = KW.settings.engineInput(r, pack(), 60000);
  const orb = JSON.parse(TEXT).pack.swatches;
  eq(plain(e.patron.skin), { id: O('chrome'), face: orb.skin.chrome.entries.face, cheek: orb.skin.chrome.entries.cheek });
  eq(plain(e.patron.robe.bands), ['0', '1', '2', '3'].map(i => orb.tabard.panel.entries[i]));
  // a set a long name is not in, and a pack not loaded, are ignored at their level
  const t = store(KW, { saved: { look: { monarch_skin: O('wire'), monarch_robe: 'test.gone/red' } } }).s.now();
  eq(plain(t.ignored.map(f => [f.key, f.why])), [['monarch_skin', 'no pack the page has loaded gives that swatch'], ['monarch_robe', 'no pack the page has loaded gives that swatch']]);
});

test('the pet\'s coat is a coat of the pet in use: another pet\'s first otherwise, and the engine is given its own id', () => {
  // the drone chosen with nothing for its coat, and the world's own Orbit, take its first coat
  const a = store(KW, { saved: { look: { pet: O('pet.drone') } } }).s.now();
  eq([a.values.look.pet_coat, a.from.look.pet_coat], [O('steel'), 'saved']);
  eq(plain(KW.settings.engineInput(a, pack(), 0).pet), { id: O('pet.drone'), coat: 'steel' });
  const w = store(KW, { hooks: { look: { world: WORLD } } }).s;
  assert.equal(w.now().values.look.pet_coat, O('steel'));
  assert.equal(w.parts(WORLD).look.pet_coat, O('steel'), 'the world\'s own coat is its pet\'s');
  // the drone's coat chosen, then the cat: the cat's own coat, as the page has it
  const b = store(KW, { saved: { look: { pet: 'cat', pet_coat: O('steel') } } }).s.now();
  assert.equal(b.values.look.pet_coat, 'calico');
  // a coat no loaded pet has is ignored
  const c = store(KW, { saved: { look: { pet_coat: O('tweed') } } }).s.now();
  eq(plain(c.ignored.map(f => [f.key, f.why])), [['pet_coat', 'no pack the page has loaded gives that coat']]);
  // and the status page names the coat drawn, never the cat's
  assert.equal(SCR.valueName('look', 'pet_coat', a.values.look.pet_coat, pack(), store(KW).s.catalogue()), 'Steel');
});

// ---- Items and keys ---------------------------------------------------------------------------------

test('a key set at the world\'s level or above wins over the world\'s item for its slot, and a level above wins over an item', () => {
  // Orbit by the address with the open helm: the world's dome gives way, and the open helm is drawn
  const a = store(KW, { hooks: { look: { world: WORLD, helmet: 'open' } } }).s.now();
  assert.equal(a.values.look.items.helmet, undefined);
  assert.equal(SET.knightLook(plain(a)).items.helmet, 'kw.base/helm.open');
  assert.equal(SET.knightLook(plain(a)).items.torso, O('torso.panel'), 'the world\'s other items stay');
  // Orbit chosen on the display, a helmet in config.toml: the world's dome
  const b = store(KW, { saved: { look: { world: WORLD } }, defaults: { look: { helmet: 'kettle' } } }).s.now();
  assert.equal(b.values.look.items.helmet, O('helm.dome'));
  // an item and its key at the same level: the item, as config.toml's [look.items] beats the key
  const c = store(KW, { defaults: { look: { helmet: 'kettle', items: { helmet: O('helm.dome') } } } }).s.now();
  assert.equal(c.values.look.items.helmet, O('helm.dome'));
  // the key on the display over an item in config.toml
  const d = store(KW, { saved: { look: { helmet: 'kettle' } }, defaults: { look: { items: { helmet: O('helm.dome') } } } }).s.now();
  eq([d.values.look.items.helmet, d.values.look.helmet], [undefined, 'kettle']);
});

test('choosing a part saves an item for its slot or the key\'s own choice, in one write, and clearing it puts the world\'s back', () => {
  const st = store(KW, { saved: { look: { helmet: 'kettle', tabard: 'wine' } } });
  st.writes.length = 0;
  assert.equal(st.s.choosePart('helmet', O('helm.dome')), true);
  eq(st.saved().look, { tabard: 'wine', items: { helmet: O('helm.dome') } });
  assert.equal(st.s.choosePart('helmet', 'bascinet'), true);
  eq(st.saved().look, { tabard: 'wine', helmet: 'bascinet' });
  assert.equal(st.s.choosePart('weapon', O('main.bar')), true);
  eq(st.saved().look.items, { main: O('main.bar') });
  assert.equal(st.s.choosePart('skin', O('chrome')), true);
  assert.equal(st.s.choosePart('skin', 'pink'), false, 'a value the page does not know is refused');
  assert.equal(st.writes.length, 4, 'one write for each choice');
  st.s.clearPart('weapon');
  eq(st.saved().look, { tabard: 'wine', helmet: 'bascinet', skin: O('chrome') });
  assert.equal(st.writes.length, 5);
});

test('how the weapon in use is held comes from the item in items.main, and greys the shield and the plume by what is drawn', () => {
  const cat = store(KW).s.catalogue();
  const SHIELD = 'A shield is carried only with a one-handed weapon: the sword and shield or the mace and shield.';
  // Orbit's pry bar, two-handed, with the weapon key one-handed: no shield
  const v = o => Object.assign({}, SET.BUILT_IN.look, { helmet: 'open', items: {} }, o);
  assert.equal(SET.greyed(v({ weapon: 'sword_and_shield', items: { main: O('main.bar') } }), pack(), cat).shield, 'The pry bar is held in both hands, so no shield is carried.');
  // the base pack's arming sword named in items, beside the greatsword key: a shield is carried
  assert.equal(SET.greyed(v({ weapon: 'greatsword', items: { main: 'kw.base/main.arming' } }), pack(), cat).shield, '');
  assert.equal(SET.greyed(v({ weapon: 'greatsword' }), pack(), cat).shield, SHIELD);
  // a helmet of another pack without a plume mount greys the plume, named as its pack names it
  const noMount = Object.assign({}, cat, { gear: Object.assign({}, cat.gear, { [O('helm.dome')]: { grip: null, plume: false, rest: true } }) });
  eq(plain(SET.greyed(v({ items: { helmet: O('helm.dome') } }), pack(), noMount)), { shield: SHIELD, plume_style: 'The dome has no plume mount, so no plume is drawn with it.', plume: 'The dome has no plume mount, so no plume is drawn with it.' });
  assert.equal(SET.greyed(v({ items: { helmet: O('helm.dome') } }), pack(), cat).plume, '', 'the dome has its mount');
  // the grip in what the store resolves, and the shield drawn with a one-handed item chosen
  const r = store(KW, { saved: { look: { items: { main: 'kw.base/main.arming' }, shield: 'round' } } }).s.now();
  assert.equal(r.grip, 'one');
  eq(plain(SET.knightLook(plain(r)).items), { main: 'kw.base/main.arming', off: 'kw.base/off.round' });
  assert.equal(store(KW, { hooks: { look: { world: WORLD } } }).s.now().grip, 'two');
  // nothing set: the base pack's greatsword, two hands, as before
  eq([store(KW).s.now().grip, SET.knightLook(plain(store(KW).s.now()))], ['two', {}]);
});

// ---- The rows of the part pages ---------------------------------------------------------------------

test('the knight page lists every loaded world\'s choices, the world in use\'s first and each other world\'s after its name', () => {
  const rows = rowsOf(store(KW), 'knight');
  eq(rows.map(x => x.k), ['build', 'weapon', 'skin', 'hair', 'hair_style', 'tabard', 'plume', 'shield', 'helmet', 'plume_style', 'body', 'shoulders', 'arms', 'hands', 'legs', 'feet', 'back']);
  eq(names(byKey(rows, 'build')), ['Medieval: a b c', 'Orbit: ' + O('body.unit')]);
  eq(names(byKey(rows, 'skin')), ['Medieval: fair warm golden tan brown deep', 'Orbit: ' + O('chrome')]);
  eq(names(byKey(rows, 'helmet')), ['Medieval: open kettle coif bascinet', 'Orbit: ' + O('helm.dome')]);
  eq(names(byKey(rows, 'shield')), ['Medieval: heater round kite'], 'a world with no shield gives no group');
  eq(plain(byKey(rows, 'weapon').groups[1].choices), [{ id: O('main.bar'), chip: 'Pry bar', name: 'Two hands', kind: 'text' }]);
  eq(plain(byKey(rows, 'build').groups[1].choices), [{ id: O('body.unit'), chip: 'UNIT', name: 'Ready', kind: 'wide' }]);
  assert.ok(rows.every(x => !x.changed), 'nothing differs from the world with nothing set');
  // Orbit in use: its choices first
  const w = rowsOf(store(KW, { hooks: { look: { world: WORLD } } }), 'knight');
  eq(byKey(w, 'helmet').groups.map(g => g.name), ['Orbit', 'Medieval']);
  eq([byKey(w, 'helmet').cur, byKey(w, 'helmet').own], [O('helm.dome'), O('helm.dome')]);
  // with no other world loaded, the base world's alone, as before
  const m = store(MED), rm = m.s.now();
  const mrows = MED.settings.screen.knightRows(rm, m.s.parts('medieval'), MED.knight.basePack(), m.s.catalogue(), MED.knight.status).filter(x => !x.intro);
  assert.ok(mrows.every(x => x.groups.length === 1 && x.groups[0].world === 'medieval'));
});

test('a part that is not the world\'s own is marked, with the line naming the world\'s own, item by its slot', () => {
  const st = store(KW, { saved: { look: { skin: O('chrome'), tabard: 'wine', items: { helmet: O('helm.dome') } } } }), r = st.s.now(), rows = rowsOf(st, 'knight'), cat = st.s.catalogue();
  const changed = rows.filter(x => x.changed).map(x => [x.k, x.curName, x.ownName]);
  eq(changed, [['skin', 'Chrome', 'Warm'], ['tabard', 'Wine', 'Blue'], ['helmet', 'Dome', 'Open helm']]);
  assert.equal(SCR.changedLine(byKey(rows, 'helmet'), r, cat), 'Changed from the Medieval world\'s own: open helm.');
  // the World page's comparison names the helmet, not the items table
  eq(plain(SCR.changedParts(r, st.s.parts('medieval')).map(d => [d.k, d.v, d.own, d.from])),
    [['skin', O('chrome'), 'warm', 'saved'], ['tabard', 'wine', 'blue', 'saved'], ['helmet', O('helm.dome'), 'open', 'saved']]);
});

test('a build the knight could not draw is greyed Coming, and the plume rows grey with a helmet that has no mount', () => {
  const st = store(KW), r = st.s.now(), cat = st.s.catalogue();
  const kn = { fallbacks: [{ kind: 'build', key: 'build', wanted: O('body.unit'), used: 'kw.base/build.a', reason: 'pack not loaded' }] };
  const b = SCR.knightRows(r, st.s.parts('medieval'), pack(), cat, kn).find(x => x.k === 'build');
  eq(plain(b.groups[1].choices[0]), { id: O('body.unit'), chip: 'UNIT', name: 'Coming', kind: 'wide', off: true, offNote: 'Unit is not drawn yet. The knight stays as Classic.' });
  const coif = rowsOf(store(KW, { saved: { look: { helmet: 'coif' } } }), 'knight');
  assert.equal(byKey(coif, 'plume').warn, 'The mail coif has no plume mount, so no plume is drawn with it.');
  assert.ok(byKey(coif, 'plume').groups.every(g => g.choices.every(c => c.off)));
});

test('the monarch\'s page lists every world\'s patrons; a patron that binds no set greys the colours; the roles take their plain names from another world', () => {
  const med = { patron: 'The monarch', pet: 'The cat', foe: 'Foe', critter: 'Pest' };
  const a = rowsOf(store(KW), 'patron', med);
  eq(names(byKey(a, 'monarch')), ['Medieval: a b c', 'Orbit: ' + O('patron.captain')]);
  assert.equal(byKey(a, 'monarch').label, 'Monarch');
  eq(names(byKey(a, 'monarch_hair')), ['Medieval: null black dark brown auburn blonde silver', 'Orbit: ' + O('wire')]);
  assert.ok(a.every(x => !x.warn));
  const c = rowsOf(store(KW, { saved: { look: { monarch: O('patron.captain') } } }), 'patron', med);
  assert.equal(byKey(c, 'monarch').label, 'Patron', 'the Captain is not called the monarch in the medieval words');
  assert.equal(byKey(c, 'monarch').changed, true);
  for (const k of ['monarch_skin', 'monarch_hair', 'monarch_robe']) assert.equal(byKey(c, k).warn, 'The captain is drawn in its own colours, so none is chosen for it.', k);
  eq(plain(SCR.roleLabels(med, { words: 'medieval', monarch: O('patron.captain'), pet: 'cat', foe: O('foe.glitch'), critter: 'fly' }, store(KW).s.catalogue())),
    { patron: 'The patron', pet: 'The cat', foe: 'Foe', critter: 'Pest' });
  // Orbit's own words over Orbit's own parts keep their labels
  const orb = { patron: 'The captain', pet: 'The drone', foe: 'Glitch', critter: 'Moth' };
  eq(plain(SCR.roleLabels(orb, { words: O('words.orbit'), monarch: O('patron.captain'), pet: O('pet.drone'), foe: O('foe.glitch'), critter: 'fly' }, store(KW).s.catalogue())),
    { patron: 'The captain', pet: 'The drone', foe: 'Glitch', critter: 'Pest' });
});

test('the cast page lists the pet, its coats, the foe and the pest from every world, and says when a foe cannot come where attacks play', () => {
  const med = { patron: 'The monarch', pet: 'The cat', foe: 'Foe', critter: 'Pest' };
  const a = rowsOf(store(KW), 'cast', med);
  eq(a.map(x => [x.k, x.label]), [['pet', 'Cat'], ['pet_coat', 'Coat'], ['foe', 'Foe'], ['critter', 'Pest']]);
  eq(names(byKey(a, 'pet')), ['Medieval: cat', 'Orbit: ' + O('pet.drone')]);
  eq(plain(byKey(a, 'pet_coat').groups), [{ world: null, name: '', choices: [{ id: 'calico', name: 'Calico', kind: 'pet' }, { id: 'ginger', name: 'Ginger tabby', kind: 'pet' }] }]);
  eq(names(byKey(a, 'foe')), ['Medieval: goblin', 'Orbit: ' + O('foe.glitch')]);
  eq(names(byKey(a, 'critter')), ['Medieval: fly', 'Orbit: ' + O('critter.moth')]);
  const d = rowsOf(store(KW, { saved: { look: { pet: O('pet.drone') } } }), 'cast', med);
  assert.equal(byKey(d, 'pet').label, 'Pet');
  eq(plain(byKey(d, 'pet_coat').groups[0].choices), [{ id: O('steel'), name: 'Steel', kind: 'pet' }]);
  assert.ok(a.every(x => x.warn === ''), 'every medieval attack scene has room for a foe, and so has the Deck');
  // a scene that can act an attack with no room for a foe: the line on the foe row
  const st = store(KW), cat = st.s.catalogue();
  const cat2 = Object.assign({}, cat, { scenes: Object.assign({}, cat.scenes, { [O('bridge')]: Object.assign({}, cat.scenes[O('bridge')], { can: ['attack'] }) }) });
  const r = Object.assign(plain(st.s.now()), { values: Object.assign(plain(st.s.now().values), { scenes: { attack: O('bridge') } }) });
  assert.equal(SCR.noFoeLine(r, cat2, pack()), 'Attacks play in the bridge, which has no room for a foe, so none comes there and the caption shows alone. The Scenes page chooses where attacks play.');
  assert.equal(SCR.castRows(r, st.s.parts('medieval'), pack(), cat2, med).find(x => x.k === 'foe').warn, SCR.noFoeLine(r, cat2, pack()));
});

test('the scenes page offers every world\'s scenes for each condition, and names in amber a scene a level asks for that cannot act it', () => {
  const st = store(KW, { saved: { scenes: { wan_down: O('deck') } }, defaults: { scenes: { cpu_hot: O('bridge') } } }), r = st.s.now(), cat = st.s.catalogue();
  const offer = st.s.offered(), f = st.s.fallback(), dflt = {};
  for (const c of Object.keys(offer)) dflt[c] = f.values.scenes[c] || f.world.homes[c];
  eq(plain(offer.wan_down), ['battlement', O('deck')], 'a condition only one medieval scene acts is offered once another world acts it');
  eq(plain(offer.cpu_hot), ['battlement', 'camp', 'house', 'yard', 'cellar', O('deck'), O('airlock')]);
  const rows = SCR.sceneRows(r, st.s.parts('medieval'), offer, dflt, pack(), cat), x = c => rows.find(y => y.k === c);
  eq(names(x('wan_down')), ['Medieval: battlement', 'Orbit: ' + O('deck')]);
  eq([x('wan_down').cur, x('wan_down').own, x('wan_down').changed], [O('deck'), 'battlement', true]);
  assert.equal(x('cpu_hot').warn, 'config.toml asks for the bridge, from Orbit, which cannot act it. Shown in the training yard.');
  assert.equal(x('attack').warn, '');
  // the base world's own scenes stay as they were: the page's own level is the medieval world's
  eq(Object.keys(store(KW).s.now().values.scenes), Object.keys(store(MED).s.now().values.scenes));
});

test('the quiet scenes are grouped by world, the world in use\'s first, and named in a sentence', () => {
  eq(plain(SCR.quietGroups(store(KW).s.now(), store(KW).s.catalogue())), [{ world: 'medieval', name: 'Medieval', scenes: ['battlement', 'camp', 'house', 'yard'] }, { world: WORLD, name: 'Orbit', scenes: [O('deck')] }]);
  const w = store(KW, { hooks: { look: { world: WORLD } } }).s;
  eq(SCR.quietGroups(w.now(), w.catalogue()).map(g => g.name), ['Orbit', 'Medieval']);
  eq(plain(SCR.quietGroups(store(MED).s.now(), store(MED).s.catalogue()).map(g => g.name)), ['Medieval']);
  const cat = store(KW).s.catalogue();
  assert.equal(SCR.valueName('quiet', 'scenes', ['battlement', 'camp', 'house'], pack(), cat), 'Battlement, camp and house');
  assert.equal(SCR.valueName('quiet', 'scenes', ['house', O('deck')], pack(), cat), 'House and deck');
});

// ---- The admin page -----------------------------------------------------------------------------------

test('the admin page\'s household look is built on the walls\' rows, with the world as cards, and chooses an item through items', () => {
  const AJS = fs.readFileSync(path.join(WEB, 'admin/admin.js'), 'utf8');
  const look = AJS.slice(AJS.indexOf('  function pageLook(m) {'), AJS.indexOf('  function pageDisplay(m) {'));
  for (const f of ['knightRows', 'patronRows', 'castRows', 'roleLabels', 'changedLine']) assert.ok(look.includes('scr.' + f + '('), 'the household look uses ' + f);
  assert.ok(look.includes('cat.items[id] === slot') && look.includes("ch[L + 'items']"), 'another pack\'s item goes into items for its slot');
  assert.ok(look.includes("ch[L + 'world'] = id") || look.includes("{ [L + 'world']: id }"), 'a world chosen as a card');
  // the store it resolves with is the walls' own, over the shared settings and config.toml
  assert.match(AJS, /KW\.settings\.create\(\{ storage: \(\) => null, pack: \(\) => PACK, world: KW\.settings\.pageWorld/);
  assert.match(AJS, /LOOK\.shared\(W\)/);
});
