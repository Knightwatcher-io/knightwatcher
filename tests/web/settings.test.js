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
const plain = v => JSON.parse(JSON.stringify(v));
// A state file with a defaults section, as a new collector writes it.
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/state-defaults.json'), 'utf8'));

/* A storage like the browser's, holding text by key; get or set may be made to throw. */
function storage(text, opts) {
  const o = opts || {}, m = new Map(text === undefined ? [] : [[SET.KEY, text]]);
  return { m, get: () => ({ getItem: k => { if (o.getThrows) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (o.setThrows) throw new Error('QuotaExceededError'); m.set(k, v); } }) };
}
/* A store over a storage, with the base pack in use unless pack is null; lines holds the console. */
function store(opts) {
  const o = opts || {}, lines = [], st = o.storage || storage();
  const s = SET.create({ hooks: o.hooks, storage: o.storageFn || st.get, pack: () => (o.pack === undefined ? PACK : o.pack), say: l => lines.push(l) });
  return { s, lines, st };
}
const saved = obj => JSON.stringify(Object.assign({ v: 1 }, obj));

/* ---- The levels ------------------------------------------------------------------------------- */

test('with nothing set, every value is the page\'s own and the knight\'s look is empty, so the knight is as before', () => {
  const { s, lines } = store();
  const r = s.now();
  assert.deepEqual(r.values, {
    look: { build: 'a', weapon: 'greatsword', skin: 'warm', hair: 'brown', hair_style: 'short', tabard: 'blue', plume: 'red', monarch: 'a', monarch_skin: 'warm' },
    display: { headline: 'medium', clock: 24, helmet_indoors: false },
    quiet: { scenes: ['battlement', 'camp', 'house', 'yard'], minutes: 10 } });
  for (const sec of Object.keys(r.from)) for (const k of Object.keys(r.from[sec])) assert.equal(r.from[sec][k], 'built-in', sec + '.' + k);
  assert.deepEqual(SET.knightLook(r), {});
  assert.deepEqual(plain(SET.engineInput(r, PACK, 60000)), { turns: ['battlement', 'camp', 'house', 'yard'], turnMs: 60000, mon: 'a', monSkin: null });
  assert.deepEqual(lines, []);
});

test('the page\'s own look is the base pack\'s defaults, read from the pack', () => {
  assert.deepEqual(SET.builtIn(PACK).look, { build: 'a', weapon: 'greatsword', skin: 'warm', hair: 'brown', hair_style: 'short', tabard: 'blue', plume: 'red', monarch: 'a', monarch_skin: 'warm' });
  const other = JSON.parse(JSON.stringify(PACK));
  Object.assign(other.defaults.swatches, { skin: 'deep', plume: 'gold' }); other.defaults.items.main = 'main.arming'; other.defaults.items.hair = 'hair.curls';
  const L = SET.builtIn(other).look;
  assert.deepEqual([L.skin, L.plume, L.weapon, L.hair_style], ['deep', 'gold', 'sword_and_shield', 'curls']);
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
  const { s, lines } = store({ storage: st, hooks: { look: { tabard: 'orange', hair_style: 'tied' }, display: { helmet_indoors: 'yes' } } });
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
  assert.deepEqual(SET.buildsOf(PACK), ['a']);
  assert.deepEqual(SET.buildsOf(null), []);
  const more = JSON.parse(JSON.stringify(PACK)); more.builds['build.c'] = more.builds['build.a'];
  assert.deepEqual(SET.buildsOf(more), ['a', 'c']);
  const { s } = store({ pack: more });
  s.defaults({ look: { build: 'c' } });
  assert.deepEqual([s.now().values.look.build, s.now().from.look.build], ['c', 'defaults']);
  assert.deepEqual(SET.knightLook(s.now()), { build: 'kw.base/build.c' });
  assert.equal(s.choose('look', 'build', 'b'), false, 'b is not ready');
  // with no base pack in use no build is ready, and none is chosen
  const none = store({ pack: null });
  none.s.defaults({ look: { build: 'a' } });
  assert.deepEqual([none.s.now().values.look.build, none.s.now().from.look.build], [null, 'built-in']);
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
  assert.deepEqual(JSON.parse(st.m.get('knightwatcher.settings')), { v: 1, look: { skin: 'deep' }, display: { clock: 12 }, quiet: { scenes: ['house', 'battlement'] } });
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
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)), { v: 1, look: {}, display: { clock: 12 }, quiet: { minutes: 60 } });
  s.reset('display'); s.reset('quiet');
  assert.deepEqual(JSON.parse(st.m.get(SET.KEY)), { v: 1, look: {}, display: {}, quiet: {} });
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
  assert.deepEqual(r.values.look, { build: 'a', weapon: 'sword_and_shield', skin: 'deep', hair: 'black', hair_style: 'curls', tabard: 'sable', plume: 'gold', monarch: 'b', monarch_skin: 'brown' });
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

test('the engine\'s input: the rotation\'s scenes, its length only when set, the monarch and the monarch\'s skin from the base pack', () => {
  const { s } = store();
  assert.equal(SET.engineInput(s.now(), PACK, 60000).turnMs, 60000, 'the demo keeps its minute');
  assert.equal(SET.engineInput(s.now(), PACK, 600000).turnMs, 600000, 'live mode its ten');
  s.choose('quiet', 'minutes', 5); s.choose('quiet', 'scenes', ['camp', 'house']);
  s.choose('look', 'monarch', 'c'); s.choose('look', 'monarch_skin', 'deep');
  const e = SET.engineInput(s.now(), PACK, 60000);
  assert.deepEqual(plain(e), { turns: ['camp', 'house'], turnMs: 300000, mon: 'c',
    monSkin: { id: 'deep', face: PACK.swatches.skin.deep.entries.face, cheek: PACK.swatches.skin.deep.entries.cheek } });
  assert.equal(SET.engineInput(s.now(), null, 60000).monSkin, null, 'no base pack, the court\'s own skin');
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

/* ---- The engine, the court and the knight in a sandbox ------------------------------------------ */

const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/props.js', 'js/knight.js', 'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js',
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

test('the engine\'s quiet rotation takes the input\'s scenes in turn for its length, and all four when it has none', () => {
  const { KW, E } = load();
  E.init(new Proxy({}, { set() { return true; }, get: () => () => {} }));
  const base = { w: KW.state.IDLE, is: 'auto', things: [], tv: false, helmet: 'auto' };
  const at = (input, ts) => ts.map(t => { E.input = Object.assign({}, base, input); E.restartTurns(0); E.draw(t); return E.scene(); });
  assert.deepEqual(at({ turnMs: 1000 }, [0, 1000, 2000, 3000, 4000]), ['battlement', 'camp', 'house', 'yard', 'battlement']);
  assert.deepEqual(at({ turnMs: 1000, turns: [] }, [0, 1000, 2000, 3000]), ['battlement', 'camp', 'house', 'yard']);
  assert.deepEqual(at({ turnMs: 1000, turns: ['camp', 'yard'] }, [0, 999, 1000, 2000, 3500]), ['camp', 'camp', 'yard', 'camp', 'yard']);
  assert.deepEqual(at({ turnMs: 300000, turns: ['house'] }, [0, 299999, 300000, 5e6]), ['house', 'house', 'house', 'house']);
  // a scene the address keeps (is=) wins over the rotation
  assert.deepEqual(at({ turnMs: 1000, turns: ['camp'], is: 'yard' }, [0, 5000]), ['yard', 'yard']);
});

/* The court's backdrop painted with the monarch and skin given, as the calls it makes. */
function court(m, mon, monSkin) {
  const sc = m.KW.scenes.court, o = m.K.pose('ssh_session', 100);
  o.x = sc.spot * m.V.U; o.floor = m.V.HFL;
  Object.assign(m.V, { HL: 0, HR: 960, HT: 0 });
  m.calls.length = 0;
  sc.paint({ w: m.KW.state.IDLE, things: [], places: sc.places, tv: false, kx: o.x, o, here: null, inBed: false, helmOff: false, strike: false, mon, monSkin });
  return m.calls.slice();
}
const skinOf = id => ({ id, face: PACK.swatches.skin[id].entries.face, cheek: PACK.swatches.skin[id].entries.cheek });
const faceColours = id => PACK.swatches.skin[id].entries.face.map(b => b[1]).concat(PACK.swatches.skin[id].entries.cheek);

test('the monarch\'s skin: the court\'s own by default, the same calls for the warm swatch, and each other swatch in its own colours alone', () => {
  const m = load();
  const sc = m.KW.scenes.court, own = court(m, 'a', null);
  assert.deepEqual(court(m, 'a', skinOf('warm')), own, 'the warm swatch is the court\'s own skin');
  assert.equal(sc.key({ mon: 'a', monSkin: null }), 'a|');
  assert.equal(sc.key({ mon: 'b', monSkin: skinOf('deep') }), 'b|deep');
  // a skin that is not a face of three bands and a cheek is not drawn
  assert.deepEqual(court(m, 'a', { id: 'bad', face: [[1, 'red']], cheek: '#000000' }), own);
  assert.equal(sc.key({ mon: 'a', monSkin: { id: 'bad' } }), 'a|');
  const text = calls => calls.join('\n');
  for (const mon of ['a', 'b', 'c']) for (const id of Object.keys(PACK.swatches.skin)) {
    const got = text(court(m, mon, skinOf(id)));
    for (const c of faceColours(id)) assert.ok(got.includes(c), mon + ' ' + id + ' draws ' + c);
    for (const other of Object.keys(PACK.swatches.skin)) if (other !== id) for (const c of faceColours(other)) if (!faceColours(id).includes(c)) assert.ok(!got.includes(c), mon + ' ' + id + ' draws ' + other + '\'s ' + c);
  }
});

test('KW.knight.look() draws a new look from the base pack in place, without reading the packs again', () => {
  const m = load();
  const was = m.K.status;
  const st = m.K.look({ swatches: { skin: 'kw.base/deep' }, items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } });
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(st.fallbacks).filter(f => f.reason !== 'not set'), []);
  assert.equal(m.K.rest.key('off'), 'kw.base/off.heater');
  assert.equal(m.K.rest.blade().to, 175);
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

test('every combination renders: weapon by skin by hair by hair style, the tabard and the plume cycled, from the base pack, within the caps', () => {
  const m = load(), lib = [PK.read(SIGN.withoutSig(PACK_TEXT), { allowUnsigned: true })];
  const O = SET.ONE_OF.look;
  let n = 0, most = 0;
  for (const weapon of O.weapon) for (const skin of O.skin) for (const hair of O.hair) for (const hair_style of O.hair_style) {
    const tabard = O.tabard[n % 6], plume = O.plume[(n * 5 + 1) % 6];
    const { s } = store();
    for (const [k, v] of Object.entries({ weapon, skin, hair, hair_style, tabard, plume })) assert.equal(s.choose('look', k, v), true);
    const look = SET.knightLook(s.now()), what = JSON.stringify(look);
    const st = m.K.look(look);
    assert.equal(st.source, 'pack', what);
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
  assert.equal(n, 2 * 6 * 6 * 3);
  assert.ok(most <= PK.LIMITS.lookCost);
});

test('every monarch renders in every skin, from the base pack\'s swatches, through the engine\'s input', () => {
  const m = load();
  for (const monarch of SET.ONE_OF.look.monarch) for (const monarch_skin of SET.ONE_OF.look.monarch_skin) {
    const { s } = store(); s.choose('look', 'monarch', monarch); s.choose('look', 'monarch_skin', monarch_skin);
    const e = SET.engineInput(s.now(), m.K.basePack(), 600000);
    assert.equal(e.mon, monarch);
    const got = court(m, e.mon, e.monSkin).join('\n');
    assert.ok(got.length > 0);
    for (const c of faceColours(monarch_skin)) assert.ok(got.includes(c), monarch + ' ' + monarch_skin + ' ' + c);
  }
});
