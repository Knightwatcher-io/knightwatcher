// Tests for the base pack that ships with the page, web/packs/base.pack.json: that it is the present
// knight, complete and nothing more, and that the page's rules for signing apply to it.
// Run with: node --test tests/web/
// That drawing it gives the same calls as the code is checked pose by pose in knight.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PK = require('../../web/js/pack.js');

const ROOT = path.join(__dirname, '../..');
const TEXT = fs.readFileSync(path.join(ROOT, 'web/packs/base.pack.json'), 'utf8');
const PACK = JSON.parse(TEXT).pack;
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8')).pack;

test('the base pack is read on a dev page, unsigned, and refused at the signature step elsewhere', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'kw.base');
  assert.equal(r.version, '1.0.0');
  assert.equal(r.signed, false);
  assert.deepEqual(r.provides, ['builds', 'items', 'swatches']);
  assert.deepEqual(PK.read(TEXT), { ok: false, step: 'signature', reason: 'sig: is missing, and this page accepts only signed packs', id: 'kw.base' });
});

test('one build, the present knight\'s measurements, with the plain head', () => {
  assert.deepEqual(Object.keys(PACK.builds), ['build.a']);
  const want = Object.fromEntries(PK.MEASURES.map(m => [m[0], m[1]]));
  assert.deepEqual(PACK.builds['build.a'].m, want);
  assert.equal(PACK.builds['build.a'].head, 'head.plain');
});

test('every slot the present drawing has, one item each, and nothing else', () => {
  const slots = Object.fromEntries(Object.entries(PACK.items).map(([id, it]) => [it.slot, id]));
  assert.deepEqual(slots, { legs: 'legs.plate', boots: 'boots.leather', torso: 'torso.tabard', head: 'head.plain', hair: 'hair.short',
    helmet: 'helm.open', plume: 'plume.crest', pauldrons: 'pauldrons.plate', arms: 'arms.plate', gauntlets: 'gauntlets.plate', main: 'main.greatsword' });
  assert.equal(Object.keys(PACK.items).length, 11);
  assert.deepEqual(PACK.defaults, FIXTURE.defaults);
  assert.equal(PACK.palettes, undefined);
  assert.equal(PACK.decorations, undefined);
});

test('each item and swatch is the test fixture\'s, unchanged', () => {
  for (const id of Object.keys(PACK.items)) assert.deepEqual(PACK.items[id], FIXTURE.items[id], id);
  for (const set of Object.keys(PACK.swatches)) {
    assert.equal(Object.keys(PACK.swatches[set]).length, 1, set + ': one swatch, the present colours');
    for (const sw of Object.keys(PACK.swatches[set])) assert.deepEqual(PACK.swatches[set][sw], FIXTURE.swatches[set][sw], set + '/' + sw);
  }
});

test('the default look resolves with nothing missing, at the present knight\'s cost', () => {
  const L = PK.resolve([PK.read(TEXT, { allowUnsigned: true })], {});
  assert.equal(L.ok, true);
  assert.deepEqual(L.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), []);
  assert.deepEqual(L.grip, { kind: 'two', hands: [6, -30] });
  assert.equal(L.cost, 11932);
  assert.equal(L.shapes, 99);
  assert.ok(L.plumeShown);
});
