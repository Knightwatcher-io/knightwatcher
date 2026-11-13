// Tests for the base pack that ships with the page, web/packs/base.pack.json: that it is the present
// knight, complete, with the arming sword and the heater shield besides, the free options (six of
// each colour set and three hair styles) and nothing more, that every choice of them resolves, and
// that the page's rules for signing apply to it, whether it ships signed or not. Run with:
// node --test tests/web/
// That drawing it gives the same calls as the code is checked pose by pose in knight.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PK = require('../../web/js/pack.js');
const ED = require('../../web/js/ed25519.js');
const { withoutSig } = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const TEXT = fs.readFileSync(path.join(ROOT, 'web/packs/base.pack.json'), 'utf8');
const PACK = JSON.parse(TEXT).pack;
// Whether the shipped file carries a signature, and the file with any signature taken off
const SIGNED = Object.prototype.hasOwnProperty.call(JSON.parse(TEXT), 'sig');
const UNSIGNED = withoutSig(TEXT);
const verify = ED.verify;
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8')).pack;
// The two items of the one-handed look, as approved, which the test fixture does not hold: its own
// main.arming is a smaller sword made for the library's tests.
const ONEHAND = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-onehand.items.json'), 'utf8'));
// The free options as approved: the swatches beside today's and the two hair styles beside the
// short crop.
const OPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-options.json'), 'utf8'));
// The iris of the watch's eye follows the tabard: the tabard's and the shield's, worn and at rest,
// take the tabard's darkest band where the fixture and the approved shield have the fixed blue.
const irisFollows = item => JSON.parse(JSON.stringify(item).split('"@base.b3"').join('"@tabard.3"'));
// Each set's choices in the order the settings screen should show them, today's among them.
const ORDER = { skin: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], hair: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'],
  tabard: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], plume: ['red', 'white', 'gold', 'royal', 'green', 'violet'] };

test('the base pack unsigned is read on a dev page and refused at the signature step elsewhere', () => {
  const r = PK.read(UNSIGNED, { allowUnsigned: true, verify });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'kw.base');
  assert.equal(r.version, '1.2.0');
  assert.equal(r.signed, false);
  assert.deepEqual(r.provides, ['builds', 'items', 'swatches']);
  assert.deepEqual(PK.read(UNSIGNED, { verify }), { ok: false, step: 'signature', reason: 'sig: is missing, and this page accepts only signed packs', id: 'kw.base' });
});

test('the base pack as it ships is read on every page when signed, and on a dev page alone when not', () => {
  const dev = PK.read(TEXT, { allowUnsigned: true, verify });
  assert.equal(dev.ok, true, dev.reason);
  assert.equal(dev.signed, SIGNED);
  const deployed = PK.read(TEXT, { verify });
  if (SIGNED) {
    assert.equal(deployed.ok, true, deployed.reason);
    assert.equal(deployed.signed, true);
    assert.equal(JSON.parse(TEXT).sig.kid, 'kw1');
  } else {
    assert.equal(TEXT, UNSIGNED);
    assert.deepEqual([deployed.ok, deployed.step], [false, 'signature']);
  }
});

test('one build, the present knight\'s measurements, with the plain head', () => {
  assert.deepEqual(Object.keys(PACK.builds), ['build.a']);
  const want = Object.fromEntries(PK.MEASURES.map(m => [m[0], m[1]]));
  assert.deepEqual(PACK.builds['build.a'].m, want);
  assert.equal(PACK.builds['build.a'].head, 'head.plain');
});

test('every slot the present drawing has, the one-handed sword and the shield, three hair styles, and nothing else', () => {
  const slots = {};
  for (const [id, it] of Object.entries(PACK.items)) (slots[it.slot] = slots[it.slot] || []).push(id);
  assert.deepEqual(slots, { legs: ['legs.plate'], boots: ['boots.leather'], torso: ['torso.tabard'], head: ['head.plain'], hair: ['hair.short', 'hair.tied', 'hair.curls'],
    helmet: ['helm.open'], plume: ['plume.crest'], pauldrons: ['pauldrons.plate'], arms: ['arms.plate'], gauntlets: ['gauntlets.plate'],
    main: ['main.greatsword', 'main.arming'], off: ['off.heater'] });
  assert.equal(Object.keys(PACK.items).length, 15);
  assert.deepEqual(PACK.defaults, FIXTURE.defaults);
  assert.equal(PACK.palettes, undefined);
  assert.equal(PACK.decorations, undefined);
});

test('six choices in each colour set, in the order the settings screen shows them, today\'s the defaults', () => {
  for (const set of Object.keys(ORDER)) assert.deepEqual(Object.keys(PACK.swatches[set]), ORDER[set], set);
  assert.deepEqual(PACK.defaults.swatches, { skin: 'warm', hair: 'brown', tabard: 'blue', plume: 'red' });
  for (const set of Object.keys(ORDER)) for (const id of ORDER[set]) assert.ok(PACK.swatches[set][id].name.length > 0, set + '/' + id);
});

test('each item and swatch is as approved: the fixture\'s, the one-handed items, the free options, the iris following the tabard', () => {
  const want = id => (OPTIONS.items[id] || ONEHAND[id] || FIXTURE.items[id]);
  for (const id of Object.keys(PACK.items)) {
    const w = id === 'torso.tabard' || id === 'off.heater' ? irisFollows(want(id)) : want(id);
    assert.deepEqual(PACK.items[id], w, id);
  }
  assert.deepEqual(Object.keys(ONEHAND), ['main.arming', 'off.heater']);
  assert.deepEqual(Object.keys(OPTIONS.items), ['hair.tied', 'hair.curls']);
  for (const set of Object.keys(PACK.swatches)) for (const sw of Object.keys(PACK.swatches[set])) {
    const today = FIXTURE.swatches[set][sw];
    // today's swatch is unchanged; the rest are the approved options, the green tabard of the
    // library's fixture not among them
    assert.deepEqual(PACK.swatches[set][sw], PACK.defaults.swatches[set] === sw ? today : OPTIONS.swatches[set][sw], set + '/' + sw);
  }
  for (const set of Object.keys(OPTIONS.swatches)) assert.equal(Object.keys(OPTIONS.swatches[set]).length, 5, set);
});

test('the iris of the eye takes the tabard\'s darkest band, on the tabard and the shield, worn and at rest', () => {
  assert.ok(!TEXT.includes('@base.b3'), 'no fixed blue iris is left');
  // the iris is the one shape filled with that band alone; the field's band list ends with it too
  const irises = it => JSON.stringify(it).split('"fill":"@tabard.3"').length - 1;
  assert.equal(irises(PACK.items['torso.tabard']), 1);
  assert.equal(irises(PACK.items['off.heater'].parts), 1);
  assert.equal(irises(PACK.items['off.heater'].rest), 1);
  // on the default blue tabard it is the colour the fixed iris had
  assert.equal(PACK.swatches.tabard.blue.entries['3'], PK.BASE.b3);
});

test('the default look resolves with nothing missing, at the present knight\'s cost', () => {
  const L = PK.resolve([PK.read(TEXT, { allowUnsigned: true, verify })], {});
  assert.equal(L.ok, true);
  assert.deepEqual(L.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), []);
  assert.deepEqual(L.grip, { kind: 'two', hands: [2, -30] });
  assert.equal(L.cost, 11932);
  assert.equal(L.shapes, 99);
  assert.ok(L.plumeShown);
});

test('the one-handed look resolves with nothing missing: the arming sword in one hand, the heater shield in the other', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const L = PK.resolve(lib, { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } });
  assert.equal(L.ok, true);
  assert.deepEqual(L.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), []);
  assert.deepEqual(L.look.items.main, 'kw.base/main.arming');
  assert.deepEqual(L.look.items.off, 'kw.base/off.heater');
  assert.deepEqual(L.grip, { kind: 'one', hands: [0] });
  assert.deepEqual(L.blade, { from: 34, to: 175, half: 10 });
  assert.equal(L.shapes, 99 + 20, 'the base look and the shield; the two swords have 22 shapes each');
  assert.equal(L.lists.off.length, 20);
  assert.equal(L.lists.restOff.length, 26);
  // the shield is the tabard's colours with the gold eye: the field follows the tabard swatch
  const shield = ONEHAND['off.heater'];
  assert.deepEqual(shield.parts[0].shapes[3].fill, PACK.items['torso.tabard'].parts[0].shapes[1].fill);
  assert.deepEqual(shield.rest.fits, 'hang');
});

test('every choice of skin, hair colour, hair style, tabard and plume resolves with nothing missing, with either weapon, well under the caps', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const B = id => 'kw.base/' + id, styles = ['hair.short', 'hair.tied', 'hair.curls'];
  const weapons = [{}, { main: B('main.arming'), off: B('off.heater') }];
  let n = 0, most = { shapes: 0, cost: 0 };
  for (const skin of ORDER.skin) for (const hair of ORDER.hair) for (const tabard of ORDER.tabard) for (const plume of ORDER.plume) for (const style of styles) for (const w of weapons) {
    const look = { items: Object.assign({ hair: B(style) }, w), swatches: { skin: B(skin), hair: B(hair), tabard: B(tabard), plume: B(plume) } };
    const L = PK.resolve(lib, look);
    assert.equal(L.ok, true);
    const missing = L.fallbacks.filter(f => f.reason !== 'not set');
    if (missing.length) assert.deepEqual(missing, [], JSON.stringify(look));
    assert.equal(L.look.items.hair, B(style));
    assert.deepEqual(L.look.swatches, look.swatches);
    if (L.cost > most.cost) most = { shapes: L.shapes, cost: L.cost, style, w: !!w.main };
    n++;
  }
  assert.equal(n, 6 * 6 * 6 * 6 * 3 * 2);
  // the heaviest is the tied hair with the sword and shield, a tenth of the shape cap and under a third of the cost cap
  assert.deepEqual(most, { shapes: 129, cost: 12524, style: 'hair.tied', w: true });
  assert.ok(most.shapes <= PK.LIMITS.lookShapes && most.cost <= PK.LIMITS.lookCost);
});
