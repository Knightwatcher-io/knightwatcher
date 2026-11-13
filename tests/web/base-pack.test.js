// Tests for the base pack that ships with the page, web/packs/base.pack.json: that it is the present
// knight, complete, with the arming sword and the heater shield besides and nothing more, and that
// the page's rules for signing apply to it, whether it ships signed or not. Run with:
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

test('the base pack unsigned is read on a dev page and refused at the signature step elsewhere', () => {
  const r = PK.read(UNSIGNED, { allowUnsigned: true, verify });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'kw.base');
  assert.equal(r.version, '1.1.0');
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

test('every slot the present drawing has, one item each, the one-handed sword and the shield, and nothing else', () => {
  const slots = {};
  for (const [id, it] of Object.entries(PACK.items)) (slots[it.slot] = slots[it.slot] || []).push(id);
  assert.deepEqual(slots, { legs: ['legs.plate'], boots: ['boots.leather'], torso: ['torso.tabard'], head: ['head.plain'], hair: ['hair.short'],
    helmet: ['helm.open'], plume: ['plume.crest'], pauldrons: ['pauldrons.plate'], arms: ['arms.plate'], gauntlets: ['gauntlets.plate'],
    main: ['main.greatsword', 'main.arming'], off: ['off.heater'] });
  assert.equal(Object.keys(PACK.items).length, 13);
  assert.deepEqual(PACK.defaults, FIXTURE.defaults);
  assert.equal(PACK.palettes, undefined);
  assert.equal(PACK.decorations, undefined);
});

test('each item and swatch is the test fixture\'s, unchanged, and the one-handed items are as approved', () => {
  for (const id of Object.keys(PACK.items)) assert.deepEqual(PACK.items[id], ONEHAND[id] || FIXTURE.items[id], id);
  assert.deepEqual(Object.keys(ONEHAND), ['main.arming', 'off.heater']);
  for (const set of Object.keys(PACK.swatches)) {
    assert.equal(Object.keys(PACK.swatches[set]).length, 1, set + ': one swatch, the present colours');
    for (const sw of Object.keys(PACK.swatches[set])) assert.deepEqual(PACK.swatches[set][sw], FIXTURE.swatches[set][sw], set + '/' + sw);
  }
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
