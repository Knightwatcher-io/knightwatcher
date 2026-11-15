// The base pack, web/packs/base.pack.json, read by the pack library as it is now, against the read
// stored in fixtures/base-read.json from the library before it learnt format 1.1. Run with:
//   node --test tests/web/
// The stored read is the whole result of read() for the file as it ships, for the file unsigned on a
// dev page, and for the file unsigned on a deployed page; the bytes the signature covers, by their
// SHA-256 and length; and resolve() of the default look and of the sword and shield on each build,
// with every record the lists hold. Store it again only from a library known to read the base pack
// right, and only when the base pack itself is meant to change:
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
const { withoutSig } = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const STORED = path.join(__dirname, 'fixtures/base-read.json');
const TEXT = fs.readFileSync(path.join(ROOT, 'web/packs/base.pack.json'), 'utf8');
const LIB = process.env.BASE_READ_LIB ? path.resolve(process.env.BASE_READ_LIB) : path.join(ROOT, 'web/js/pack.js');
const PK = require(LIB);

// The result as JSON. A function in a record (a pix shape's colour lookup, which the base pack does
// not use) is written as the word, so that one appearing or vanishing still shows.
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? 'function' : x)));

function snapshot() {
  const verify = ED.verify, unsigned = withoutSig(TEXT), pack = JSON.parse(TEXT).pack;
  const bytes = Buffer.from(PK.message(pack));
  const out = {
    shipped: plain(PK.read(TEXT, { verify })),
    dev: plain(PK.read(unsigned, { allowUnsigned: true, verify })),
    deployed: plain(PK.read(unsigned, { verify })),
    signed: { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), length: bytes.length },
    looks: {}
  };
  const packs = [PK.read(unsigned, { allowUnsigned: true, verify })];
  for (const b of Object.keys(pack.builds)) {
    out.looks[b] = plain(PK.resolve(packs, { build: 'kw.base/' + b }));
    out.looks[b + ' one-handed'] = plain(PK.resolve(packs, { build: 'kw.base/' + b, items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } }));
  }
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

  test('the stored read is of the base pack as it ships, version 1.3.0, format [1, 0]', () => {
    assert.equal(want.dev.ok, true);
    assert.equal(want.dev.version, '1.3.0');
    assert.deepEqual(want.dev.format, [1, 0]);
    assert.equal(Object.keys(want.looks).length, 6);
  });

  for (const k of ['shipped', 'dev', 'deployed']) {
    test('the base pack reads exactly as stored: ' + k, () => { assert.deepEqual(got[k], want[k]); });
  }
  test('the bytes the base pack\'s signature covers are exactly as stored', () => { assert.deepEqual(got.signed, want.signed); });
  for (const k of Object.keys(want.looks)) {
    test('the look resolves exactly as stored, records and costs: ' + k, () => { assert.deepEqual(got.looks[k], want.looks[k]); });
  }
}
