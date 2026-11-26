// The base pack, web/packs/base.pack.json, read by the pack library as it is now, against the read
// stored in fixtures/base-read.json from the library before it learnt format 1.1. Run with:
//   node --test 'tests/web/**/*.test.js'
// The stored read is the whole result of read() for the file signed (with a key made for the run, as
// a signed file reads with kw1), for the file unsigned on a dev page, and for the file unsigned on a
// deployed page; the bytes the signature covers, by their SHA-256 and length; and resolve() on each
// build of the default look, of the sword and shield, of three looks that wear the free items of
// 1.4.0 between them, and of the crossbow of 1.5.0 slung over the long cloak, with every record the
// lists hold. The file as it ships reads as the signed read
// when it carries a signature and as the deployed read when it does not, so the test holds in either
// state. Store it again only from a library known to read the base pack right, and only when the
// base pack itself is meant to change:
//   BASE_READ=write node --test tests/web/base-read.test.js
//   BASE_READ=write BASE_READ_LIB=DIR/web/js/pack.js node --test tests/web/base-read.test.js
// The second form stores the read of another copy of the library, such as one from git archive.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ED = require('../../web/js/ed25519.js');
const { withSig, withoutSig } = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const STORED = path.join(__dirname, 'fixtures/base-read.json');
const TEXT = fs.readFileSync(path.join(ROOT, 'web/packs/base.pack.json'), 'utf8');
const LIB = process.env.BASE_READ_LIB ? path.resolve(process.env.BASE_READ_LIB) : path.join(ROOT, 'web/js/pack.js');
const PK = require(LIB);

// The result as JSON. A function in a record (a pix shape's colour lookup, which in the base pack only
// the buzzcut has, and no stored look wears) is written as the word, so that one appearing or
// vanishing still shows.
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? 'function' : x)));
// Whether the shipped file carries a signature.
const SIGNED = Object.prototype.hasOwnProperty.call(JSON.parse(TEXT), 'sig');
// Three looks that wear every free item of 1.4.0 between them: the longsword in both hands, the mace
// with the round shield, and the arming sword with the kite shield and the bascinet.
const B = id => 'kw.base/' + id;
const FREE_LOOKS = {
  'free two-handed': { main: 'main.longsword', helmet: 'helm.kettle', plume: 'plume.feather', torso: 'torso.cuirass', pauldrons: 'pauldrons.lames', arms: 'arms.mail',
    gauntlets: 'gauntlets.leather', legs: 'legs.mail', boots: 'boots.sabatons', back: 'back.cloak', hair: 'hair.long' },
  'free mace': { main: 'main.mace', off: 'off.round', helmet: 'helm.coif', plume: 'plume.horsehair', torso: 'torso.gambeson', pauldrons: 'pauldrons.leather', arms: 'arms.padded',
    gauntlets: 'gauntlets.mail', legs: 'legs.hose', boots: 'boots.shoes', back: 'back.cape', hair: 'hair.close' },
  'free kite': { main: 'main.arming', off: 'off.kite', helmet: 'helm.bascinet' }
};
// The crossbow of 1.5.0, a weapon that fires, with the long cloak, so that its stowed view's place in
// the body's list, after the back, is stored too.
const CROSSBOW_LOOK = { main: 'main.crossbow', back: 'back.cloak' };
const itemsOf = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, B(v)]));

/* The file signed with a key made for the run, and read against it: what the file signed with kw1
   reads as, since read() gives no kid and no key back. */
function signedRead(unsigned, verify) {
  const k = crypto.generateKeyPairSync('ed25519'), pack = JSON.parse(unsigned).pack;
  const value = crypto.sign(null, Buffer.from(PK.message(pack)), k.privateKey).toString('base64');
  const pub = new Uint8Array(Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url'));
  return PK.read(withSig(unsigned, { alg: 'ed25519', kid: 'kw1', value }), { verify, keys: { kw1: pub } });
}

function snapshot() {
  const verify = ED.verify, unsigned = withoutSig(TEXT), pack = JSON.parse(TEXT).pack;
  const bytes = Buffer.from(PK.message(pack));
  const out = {
    shipped: plain(signedRead(unsigned, verify)),
    dev: plain(PK.read(unsigned, { allowUnsigned: true, verify })),
    deployed: plain(PK.read(unsigned, { verify })),
    signed: { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), length: bytes.length },
    looks: {}
  };
  const packs = [PK.read(unsigned, { allowUnsigned: true, verify })];
  for (const b of Object.keys(pack.builds)) {
    out.looks[b] = plain(PK.resolve(packs, { build: 'kw.base/' + b }));
    out.looks[b + ' one-handed'] = plain(PK.resolve(packs, { build: 'kw.base/' + b, items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } }));
    for (const [k, o] of Object.entries(FREE_LOOKS)) out.looks[b + ' ' + k] = plain(PK.resolve(packs, { build: 'kw.base/' + b, items: itemsOf(o) }));
    out.looks[b + ' crossbow'] = plain(PK.resolve(packs, { build: 'kw.base/' + b, items: itemsOf(CROSSBOW_LOOK) }));
  }
  // the file as it ships: read on a deployed page, which takes it only signed
  out.asShipped = plain(PK.read(TEXT, { verify }));
  return out;
}

if (process.env.BASE_READ === 'write') {
  test('stores the base pack\'s read from ' + path.relative(ROOT, LIB), () => {
    // one line for each part, and for each look
    const s = snapshot(), line = (k, v) => JSON.stringify(k) + ': ' + JSON.stringify(v);
    const looks = Object.keys(s.looks).map(k => '  ' + line(k, s.looks[k])).join(',\n');
    fs.writeFileSync(STORED, '{\n' + ['shipped', 'dev', 'deployed', 'signed'].map(k => line(k, s[k])).join(',\n') + ',\n"looks": {\n' + looks + '\n}}\n');
  });
} else {
  const want = JSON.parse(fs.readFileSync(STORED, 'utf8'));
  const got = snapshot();

  test('the stored read is of the base pack as it ships, version 1.6.0, format [1, 2]', () => {
    assert.equal(want.dev.ok, true);
    assert.equal(want.dev.version, '1.6.0');
    assert.deepEqual(want.dev.format, [1, 2]);
    assert.equal(want.shipped.signed, true);
    assert.equal(Object.keys(want.looks).length, 18);
    // every free item is worn in one of the stored looks, and none falls back
    const worn = new Set();
    for (const k of Object.keys(want.looks)) {
      assert.deepEqual(want.looks[k].fallbacks.filter(f => f.reason !== 'not set'), [], k);
      for (const id of Object.values(want.looks[k].look.items)) worn.add(id);
    }
    for (const o of Object.values(FREE_LOOKS).concat([CROSSBOW_LOOK])) for (const id of Object.values(o)) assert.ok(worn.has(B(id)), id);
    // the crossbow's looks carry what a weapon that fires resolves with, and its stowed list
    for (const b of ['build.a', 'build.b', 'build.c']) {
      const L = want.looks[b + ' crossbow'];
      assert.deepEqual([L.use, L.shot.kind, !!L.lists.bodyStowed], ['fire', 'bolt', true], b);
    }
  });

  for (const k of ['shipped', 'dev', 'deployed']) {
    test('the base pack reads exactly as stored: ' + k, () => { assert.deepEqual(got[k], want[k]); });
  }
  test('the file as it ships reads as the signed read when it carries a signature, and is refused on a deployed page when not', () => {
    assert.deepEqual(got.asShipped, SIGNED ? want.shipped : want.deployed);
  });
  test('the bytes the base pack\'s signature covers are exactly as stored', () => { assert.deepEqual(got.signed, want.signed); });
  for (const k of Object.keys(want.looks)) {
    test('the look resolves exactly as stored, records and costs: ' + k, () => { assert.deepEqual(got.looks[k], want.looks[k]); });
  }
}
