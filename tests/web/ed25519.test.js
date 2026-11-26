// Tests for the Ed25519 verifier, web/js/ed25519.js.
// Run with: node --test 'tests/web/**/*.test.js'
// The signatures of RFC 8032 section 7.1 and the SHA-512 digests of RFC 6234 section 8.5 are copied
// from the text of those RFCs. Every other key is generated here, by node:crypto or at random, and
// node:crypto is the independent implementation the verifier is compared with. The curve arithmetic
// the strictness tests need is written again below, in affine coordinates, apart from the verifier.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ED = require('../../web/js/ed25519.js');
const PK = require('../../web/js/pack.js');

const ROOT = path.join(__dirname, '../..');
const hex = s => new Uint8Array(Buffer.from(s, 'hex'));
const toHex = b => Buffer.from(b).toString('hex');
const flip = (b, bit) => { const c = Uint8Array.from(b); c[bit >> 3] ^= 1 << (bit & 7); return c; };
const rand = n => new Uint8Array(crypto.randomBytes(n));

// node:crypto's verdict, with a throw counted as a refusal.
function nodeVerify(pub, msg, sig) {
  try {
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(msg), key, Buffer.from(sig)) === true;
  } catch (e) {
    return false;
  }
}
const rawPub = k => new Uint8Array(Buffer.from(k.export({ format: 'jwk' }).x, 'base64url'));
// The secret scalar of a generated key, as RFC 8032 section 5.1.5 derives it from the seed.
function scalarOf(privateKey) {
  const h = crypto.createHash('sha512').update(Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url')).digest();
  h[0] &= 248; h[31] &= 127; h[31] |= 64;
  return le(h.subarray(0, 32));
}

// ---- Curve arithmetic, apart from the verifier ------------------------------------------------------

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = a => ((a % P) + P) % P;
const powm = (b, e) => { let r = 1n; b = mod(b); for (; e > 0n; e >>= 1n) { if (e & 1n) r = r * b % P; b = b * b % P; } return r; };
const inv = a => powm(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const O = [0n, 1n];
const aAdd = ([x1, y1], [x2, y2]) => {
  const t = mod(D * x1 % P * x2 % P * y1 % P * y2);
  return [mod((x1 * y2 + y1 * x2) * inv(1n + t)), mod((y1 * y2 + x1 * x2) * inv(1n - t))];
};
const aMul = (n, pt) => { let r = O; for (const c of n.toString(2)) { r = aAdd(r, r); if (c === '1') r = aAdd(r, pt); } return r; };
const aNeg = ([x, y]) => [mod(-x), y];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const onCurve = ([x, y]) => mod(-x * x + y * y - 1n - D * x * x % P * y * y) === 0n;
const leb = (n, len = 32) => { const b = new Uint8Array(len); for (let i = 0; i < len; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; };
function le(b) { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
const enc = ([x, y]) => leb(y | ((x & 1n) << 255n));
// An x for y, or null when there is none.
function xOf(y) {
  const x2 = mod((y * y - 1n) * inv(D * y * y + 1n));
  let x = powm(x2, (P + 3n) / 8n);
  if (mod(x * x) !== x2) x = mod(x * powm(2n, (P - 1n) / 4n));
  return mod(x * x) === x2 ? x : null;
}
// Lenient decoding: y taken mod p, x = 0 allowed with either sign bit. Null when no x exists.
function lenient(b) {
  const n = le(b), y = mod(n & ((1n << 255n) - 1n)), x = xOf(y);
  if (x === null) return null;
  return [(x & 1n) === n >> 255n ? x : mod(-x), y];
}
const B = [15112221349535400772501151409588531511454012693041857206046113283949847762202n,
  46316835694926478169428394003475163141307993866256225615783033603165251855960n];
const hk = (...parts) => { const h = crypto.createHash('sha512'); for (const p of parts) h.update(p); return le(h.digest()) % L; };
const sigOf = (R, S) => { const s = new Uint8Array(64); s.set(R); s.set(leb(S), 32); return s; };

// The eight points of small order, [i]T for a T of order 8 found as [L]Q for points Q of the curve.
const TORSION = (() => {
  for (let y = 2n; ; y++) {
    const x = xOf(y);
    if (x === null) continue;
    const t = aMul(L, [x, y]);
    if (same(aMul(4n, t), O)) continue;
    const pts = [O];
    for (let i = 1; i < 8; i++) pts.push(aAdd(pts[i - 1], t));
    return pts;
  }
})();

// ---- The constants ----------------------------------------------------------------------------------

test('the curve\'s constants are those of RFC 8032 section 5.1', () => {
  // the decimal values of RFC 8032 table 1, as printed there
  const t = ED.testOnly;
  assert.equal(t.P, 2n ** 255n - 19n);
  assert.equal(t.L, 2n ** 252n + BigInt('27742317777372353535851937790883648493'));
  assert.equal(t.D, BigInt('37095705934669439343138083508754565189542113879843219016388785533085940283555'));
  assert.equal(t.BX, BigInt('15112221349535400772501151409588531511454012693041857206046113283949847762202'));
  assert.equal(t.BY, BigInt('46316835694926478169428394003475163141307993866256225615783033603165251855960'));
  // and what they must satisfy
  assert.equal(t.D, D, 'd is -121665/121666 mod p');
  assert.ok(onCurve([t.BX, t.BY]), 'B is on the curve');
  assert.ok(same(aMul(t.L, [t.BX, t.BY]), O), '[L]B is the neutral point');
});

// ---- RFC 8032 section 7.1 ---------------------------------------------------------------------------

// Copied from the text of RFC 8032 section 7.1, the hex unchanged and joined.
const RFC8032 = [
  { name: 'TEST 1',
    pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    msg: '',
    sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
      '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b' },
  { name: 'TEST 2',
    pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
    msg: '72',
    sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da' +
      '085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00' },
  { name: 'TEST 3',
    pub: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
    msg: 'af82',
    sig: '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac' +
      '18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a' },
  { name: 'TEST 1024',
    pub: '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
    msg: '08b8b2b733424243760fe426a4b54908632110a66c2f6591eabd3345e3e4eb98fa6e264bf09efe12ee50f8f54e9f77b1' +
      'e355f6c50544e23fb1433ddf73be84d879de7c0046dc4996d9e773f4bc9efe5738829adb26c81b37c93a1b270b20329d' +
      '658675fc6ea534e0810a4432826bf58c941efb65d57a338bbd2e26640f89ffbc1a858efcb8550ee3a5e1998bd177e93a' +
      '7363c344fe6b199ee5d02e82d522c4feba15452f80288a821a579116ec6dad2b3b310da903401aa62100ab5d1a36553e' +
      '06203b33890cc9b832f79ef80560ccb9a39ce767967ed628c6ad573cb116dbefefd75499da96bd68a8a97b928a8bbc10' +
      '3b6621fcde2beca1231d206be6cd9ec7aff6f6c94fcd7204ed3455c68c83f4a41da4af2b74ef5c53f1d8ac70bdcb7ed1' +
      '85ce81bd84359d44254d95629e9855a94a7c1958d1f8ada5d0532ed8a5aa3fb2d17ba70eb6248e594e1a2297acbbb39d' +
      '502f1a8c6eb6f1ce22b3de1a1f40cc24554119a831a9aad6079cad88425de6bde1a9187ebb6092cf67bf2b13fd65f270' +
      '88d78b7e883c8759d2c4f5c65adb7553878ad575f9fad878e80a0c9ba63bcbcc2732e69485bbc9c90bfbd62481d9089b' +
      'eccf80cfe2df16a2cf65bd92dd597b0707e0917af48bbb75fed413d238f5555a7a569d80c3414a8d0859dc65a46128ba' +
      'b27af87a71314f318c782b23ebfe808b82b0ce26401d2e22f04d83d1255dc51addd3b75a2b1ae0784504df543af8969b' +
      'e3ea7082ff7fc9888c144da2af58429ec96031dbcad3dad9af0dcbaaaf268cb8fcffead94f3c7ca495e056a9b47acdb7' +
      '51fb73e666c6c655ade8297297d07ad1ba5e43f1bca32301651339e22904cc8c42f58c30c04aafdb038dda0847dd988d' +
      'cda6f3bfd15c4b4c4525004aa06eeff8ca61783aacec57fb3d1f92b0fe2fd1a85f6724517b65e614ad6808d6f6ee34df' +
      'f7310fdc82aebfd904b01e1dc54b2927094b2db68d6f903b68401adebf5a7e08d78ff4ef5d63653a65040cf9bfd4aca7' +
      '984a74d37145986780fc0b16ac451649de6188a7dbdf191f64b5fc5e2ab47b57f7f7276cd419c17a3ca8e1b939ae49e4' +
      '88acba6b965610b5480109c8b17b80e1b7b750dfc7598d5d5011fd2dcc5600a32ef5b52a1ecc820e308aa342721aac09' +
      '43bf6686b64b2579376504ccc493d97e6aed3fb0f9cd71a43dd497f01f17c0e2cb3797aa2a2f256656168e6c496afc5f' +
      'b93246f6b1116398a346f1a641f3b041e989f7914f90cc2c7fff357876e506b50d334ba77c225bc307ba537152f3f161' +
      '0e4eafe595f6d9d90d11faa933a15ef1369546868a7f3a45a96768d40fd9d03412c091c6315cf4fde7cb68606937380d' +
      'b2eaaa707b4c4185c32eddcdd306705e4dc1ffc872eeee475a64dfac86aba41c0618983f8741c5ef68d3a101e8a3b8ca' +
      'c60c905c15fc910840b94c00a0b9d0',
    sig: '0aab4c900501b3e24d7cdf4663326a3a87df5e4843b2cbdb67cbf6e460fec350' +
      'aa5371b1508f9f4528ecea23c436d94b5e8fcd4f681e30a6ac00a9704a188a03' },
  { name: 'TEST SHA(abc)',
    pub: 'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf',
    msg: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd' +
      '454d4423643ce80e2a9ac94fa54ca49f',
    sig: 'dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b589' +
      '09351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704' }
];

test('every Ed25519 vector of RFC 8032 section 7.1 verifies, and fails with one bit changed', () => {
  assert.equal(RFC8032.length, 5);
  for (const v of RFC8032) {
    const pub = hex(v.pub), msg = hex(v.msg), sig = hex(v.sig);
    assert.equal(ED.verify(pub, msg, sig), true, v.name);
    // TEST 1 signs the empty message, which has no bit to change: a byte is added instead
    const msgs = msg.length ? [0, msg.length * 8 - 1, msg.length * 4].map(b => flip(msg, b)) : [new Uint8Array(1)];
    for (const m of msgs) assert.equal(ED.verify(pub, m, sig), false, v.name + ' message');
    for (const b of [0, 77, 254, 255]) assert.equal(ED.verify(pub, msg, flip(sig, b)), false, v.name + ' R bit ' + b);
    for (const b of [256, 300, 500, 511]) assert.equal(ED.verify(pub, msg, flip(sig, b)), false, v.name + ' S bit ' + (b - 256));
    for (const b of [0, 128, 254, 255]) assert.equal(ED.verify(flip(pub, b), msg, sig), false, v.name + ' key bit ' + b);
  }
});

// ---- SHA-512 ----------------------------------------------------------------------------------------

const sha = m => toHex(ED.testOnly.sha512(m));
const nodeSha = m => crypto.createHash('sha512').update(m).digest('hex');

test('SHA-512 gives the known digests', () => {
  // RFC 6234 section 8.5, tests 1 to 3: "abc", the 896-bit message of FIPS 180-4, and a million "a"
  const ascii = s => new Uint8Array(Buffer.from(s, 'latin1'));
  assert.equal(sha(ascii('abc')), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
    '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
  // the same digest is the message of RFC 8032's TEST SHA(abc)
  assert.equal(sha(ascii('abc')), RFC8032[4].msg);
  assert.equal(sha(ascii('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn' +
    'hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')),
  '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433a' +
    'c7d329eeb6dd26545e96e55b874be909');
  assert.equal(sha(new Uint8Array(1000000).fill(0x61)), 'e718483d0ce769644e2e42c7bc15b4638e1f98b13b204428' +
    '5632a803afa973ebde0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b');
  // the empty message, which RFC 6234 does not list, against node:crypto
  assert.equal(sha(new Uint8Array(0)), nodeSha(new Uint8Array(0)));
});

test('SHA-512 agrees with node:crypto around the block boundaries and beyond', () => {
  const lengths = [0, 1, 111, 112, 113, 127, 128, 129, 239, 240, 255, 256, 257, 300];
  for (let i = 0; i < 200; i++) lengths.push(crypto.randomInt(301));
  for (let i = 0; i < 6; i++) lengths.push(crypto.randomInt(2048, 9000));
  for (const n of lengths) {
    const m = rand(n);
    assert.equal(sha(m), nodeSha(m), 'length ' + n);
  }
});

// ---- Against node:crypto ----------------------------------------------------------------------------

// 200 generated keys, each signing a random message; every one is then changed in one random bit of
// the message, the signature and the key, one at a time.
const CASES = Array.from({ length: 200 }, () => {
  const kp = crypto.generateKeyPairSync('ed25519'), msg = rand(crypto.randomInt(1, 1025));
  const pub = rawPub(kp.publicKey), sig = new Uint8Array(crypto.sign(null, msg, kp.privateKey));
  return { pub, msg, sig, changed: [
    ['message', pub, flip(msg, crypto.randomInt(msg.length * 8)), sig],
    ['signature', pub, msg, flip(sig, crypto.randomInt(512))],
    ['key', flip(pub, crypto.randomInt(256)), msg, sig]] };
});

test('200 signatures made by node:crypto verify, and none after a one-bit change', () => {
  for (const c of CASES) {
    assert.equal(ED.verify(c.pub, c.msg, c.sig), true, toHex(c.pub));
    for (const [what, pub, msg, sig] of c.changed) assert.equal(ED.verify(pub, msg, sig), false, what + ' ' + toHex(c.pub));
  }
});

// Inputs where a strict verifier may part from node:crypto, for the agreement test below to allow.
// The strictness tests cover each one; with Node 26 none of them arises from a one-bit change.
function strictCase(pub, sig) {
  if (le(sig.subarray(32)) >= L) return 'S not below L';
  for (const [name, b] of [['key', pub], ['R', sig.subarray(0, 32)]]) {
    const p = lenient(b);
    if (!p) continue;
    if (toHex(enc(p)) !== toHex(b)) return name + ' not canonical';
    if (same(aMul(8n, p), O)) return name + ' of small order';
  }
  return null;
}

test('the verifier and node:crypto.verify agree on those signatures, changed and unchanged', (t) => {
  let parted = 0;
  for (const c of CASES) {
    assert.equal(nodeVerify(c.pub, c.msg, c.sig), true);
    for (const [what, pub, msg, sig] of c.changed) {
      const ours = ED.verify(pub, msg, sig), theirs = nodeVerify(pub, msg, sig);
      if (ours === theirs) continue;
      parted++;
      assert.ok(strictCase(pub, sig), what + ': the verifier says ' + ours + ' and node:crypto ' + theirs + ' for ' + toHex(pub) + ' ' + toHex(sig));
    }
  }
  t.diagnostic('disagreements, each a documented strictness case: ' + parted);
});

// ---- Strictness -------------------------------------------------------------------------------------

const KP = crypto.generateKeyPairSync('ed25519');
const PUB = rawPub(KP.publicKey), A_SCALAR = scalarOf(KP.privateKey);
const MSG = new Uint8Array(Buffer.from('strictness'));
const SIG = new Uint8Array(crypto.sign(null, MSG, KP.privateKey));

test('a signature with S replaced by S + L is refused', (t) => {
  assert.equal(ED.verify(PUB, MSG, SIG), true);
  const bad = sigOf(SIG.subarray(0, 32), le(SIG.subarray(32)) + L);
  assert.equal(ED.verify(PUB, MSG, bad), false);
  t.diagnostic('node:crypto ' + (nodeVerify(PUB, MSG, bad) ? 'accepts' : 'refuses') + ' it');
});

test('an R that is not canonical is refused, though a lenient decoder would satisfy the equation', (t) => {
  // the neutral point (0, 1) spelt three ways: with the sign bit set, as y = p + 1, and as both;
  // with S = k * a, [S]B = R + [k]A holds for the point each one decodes to leniently
  const encodings = [leb(1n | (1n << 255n)), leb(P + 1n), leb((P + 1n) | (1n << 255n))];
  for (const R of encodings) {
    const k = hk(R, PUB, MSG), S = k * A_SCALAR % L, r = lenient(R);
    assert.ok(r && same(aMul(S, B), aAdd(r, aMul(k, lenient(PUB)))), 'the equation holds for ' + toHex(R));
    assert.equal(ED.verify(PUB, MSG, sigOf(R, S)), false, toHex(R));
    t.diagnostic('R ' + toHex(R).slice(0, 8) + '..' + toHex(R).slice(-4) + ': node:crypto ' + (nodeVerify(PUB, MSG, sigOf(R, S)) ? 'accepts' : 'refuses'));
  }
});

test('an R of small order is refused, though it satisfies the equation', (t) => {
  // the neutral point, canonically encoded: [k * a]B = O + [k]A
  const R = enc(O), k = hk(R, PUB, MSG), S = k * A_SCALAR % L;
  assert.equal(ED.verify(PUB, MSG, sigOf(R, S)), false);
  t.diagnostic('node:crypto ' + (nodeVerify(PUB, MSG, sigOf(R, S)) ? 'accepts' : 'refuses') + ' it');
});

test('each of the eight public keys of small order is refused, whatever the signature', (t) => {
  const keys = TORSION.map(enc);
  assert.equal(new Set(keys.map(toHex)).size, 8);
  for (const pt of TORSION) assert.ok(onCurve(pt) && same(aMul(8n, pt), O));
  let nodeAccepts = 0;
  TORSION.forEach((pt, j) => {
    const A = keys[j];
    // signatures that satisfy [S]B = R + [k]A: R = [S]B and a message for which [k]A is the
    // neutral point; [k]A is [k * j]T for the T of order 8 that TORSION is built from
    const S = BigInt(crypto.randomInt(1, 2 ** 40)), R = enc(aMul(S, B));
    let found = 0;
    for (let i = 0; found < 2 && i < 200; i++) {
      const m = new Uint8Array(Buffer.from('message ' + i)), k = hk(R, A, m);
      if (k * BigInt(j) % 8n !== 0n) continue;
      found++;
      assert.equal(ED.verify(A, m, sigOf(R, S)), false, toHex(A));
      if (nodeVerify(A, m, sigOf(R, S))) nodeAccepts++;
    }
    assert.equal(found, 2);
    for (let i = 0; i < 4; i++) assert.equal(ED.verify(A, rand(i * 10), rand(64)), false);
    assert.equal(ED.verify(A, MSG, SIG), false);
  });
  t.diagnostic('of the 16 signatures that satisfy the equation, node:crypto accepts ' + nodeAccepts);
});

test('a public key with y of p or more is refused', () => {
  // every y from p to 2^255 - 1, with either sign bit; none is a canonical encoding, though some
  // decode leniently to a point of the curve
  let points = 0;
  for (let y = P; y < 2n ** 255n; y++) {
    for (const sign of [0n, 1n]) {
      const key = leb(y | (sign << 255n));
      if (lenient(key)) points++;
      assert.equal(ED.verify(key, MSG, SIG), false, String(y - P));
    }
  }
  assert.ok(points > 0);
});

test('decoding accepts exactly the canonical encodings of points of the curve', () => {
  // With the small-order checks in place, no signature reaches the checks for x = 0 with the sign
  // bit set or for y of p or more: every such point that a signature can be made for is of small
  // order. So the decoding is tested by itself, against the lenient decoding above.
  const decode = ED.testOnly.decode;
  const cases = [leb(1n | (1n << 255n)), leb((P - 1n) | (1n << 255n)), leb(1n), leb(P - 1n)];
  for (let y = P; y < 2n ** 255n; y++) cases.push(leb(y), leb(y | (1n << 255n)));
  for (let i = 0; i < 300; i++) cases.push(rand(32));
  let points = 0, refused = 0;
  for (const b of cases) {
    const p = lenient(b), want = p && toHex(enc(p)) === toHex(b) ? p : null, got = decode(b);
    if (want) { points++; assert.deepEqual(got && [got[0], got[1], got[2]], [want[0], want[1], 1n], toHex(b)); }
    else { refused++; assert.equal(got, null, toHex(b)); }
  }
  assert.ok(points > 100 && refused > 100);
});

test('where cofactorless and cofactored verification part, the verifier is cofactorless, as node:crypto is', () => {
  // a key with a small-order component: A = [a]B + T, T of order 8. With R = [r]B and S = r + k * a,
  // [S]B = R + [k]A holds only when [k]T is the neutral point; [8][S]B = [8]R + [8][k]A holds always
  const a = le(rand(32)) % L, T = TORSION[1], A = enc(aAdd(aMul(a, B), T));
  const r = BigInt(crypto.randomInt(1, 2 ** 40)), R = enc(aMul(r, B));
  const seen = { kept: 0, missed: 0 };
  for (let i = 0; i < 200 && (seen.kept < 2 || seen.missed < 2); i++) {
    const m = new Uint8Array(Buffer.from('mixed ' + i)), k = hk(R, A, m), s = sigOf(R, (r + k * a) % L);
    const kept = k % 8n === 0n;
    seen[kept ? 'kept' : 'missed']++;
    assert.equal(ED.verify(A, m, s), kept, 'k mod 8 = ' + (k % 8n));
    assert.equal(nodeVerify(A, m, s), kept, 'node:crypto, k mod 8 = ' + (k % 8n));
  }
  assert.ok(seen.kept >= 1 && seen.missed >= 1);
});

// ---- Never throws -----------------------------------------------------------------------------------

test('wrong arguments give false and never throw', () => {
  const good = [PUB, MSG, SIG];
  const bad = [undefined, null, 0, 1, true, '', 'abc', toHex(PUB), {}, [], Array.from(PUB), Array.from(SIG), { length: 32 },
    new Uint8ClampedArray(PUB), new Int8Array(PUB), new Uint16Array(32), new Float64Array(64), new DataView(PUB.buffer),
    PUB.buffer, new Uint8Array(0), new Uint8Array(31), new Uint8Array(33), new Uint8Array(63), new Uint8Array(65),
    Symbol('x'), () => true, new Proxy({}, { get() { throw new Error('no'); } }),
    Object.defineProperty(new Uint8Array(32), 'length', { get() { throw new Error('no'); } })];
  for (let i = 0; i < 3; i++) {
    bad.forEach((b, j) => {
      const args = good.slice();
      args[i] = b;
      let r;
      assert.doesNotThrow(() => { r = ED.verify(...args); });
      assert.equal(r, false, 'argument ' + i + ', bad value ' + j);
    });
  }
  assert.equal(ED.verify(), false);
  assert.equal(ED.verify(PUB), false);
  assert.equal(ED.verify(PUB, MSG), false);
  assert.equal(ED.verify(SIG, MSG, PUB), false);
  assert.equal(ED.verify(PUB, MSG, SIG, 'extra'), true);
});

test('views at an offset into a larger buffer verify correctly, and so do Buffers', () => {
  const buf = rand(1000);
  const pub = new Uint8Array(buf.buffer, 3, 32), msg = new Uint8Array(buf.buffer, 101, MSG.length), sig = new Uint8Array(buf.buffer, 517, 64);
  pub.set(PUB); msg.set(MSG); sig.set(SIG);
  assert.equal(ED.verify(pub, msg, sig), true);
  buf[0] ^= 1; buf[100] ^= 1; buf[101 + MSG.length] ^= 1; buf[581] ^= 1; buf[999] ^= 1;
  assert.equal(ED.verify(pub, msg, sig), true, 'bytes outside the views do not count');
  msg[0] ^= 1;
  assert.equal(ED.verify(pub, msg, sig), false);
  msg[0] ^= 1;
  sig[63] ^= 1;
  assert.equal(ED.verify(pub, msg, sig), false);
  sig[63] ^= 1;
  assert.equal(ED.verify(pub.subarray(0, 32), msg.subarray(0), sig.subarray(0, 64)), true);
  assert.equal(ED.verify(Buffer.from(PUB), Buffer.from(MSG), Buffer.from(SIG)), true);
  const shared = new Uint8Array(new SharedArrayBuffer(64));
  shared.set(SIG);
  assert.equal(ED.verify(PUB, MSG, shared), true);
});

// ---- Through the pack library -----------------------------------------------------------------------

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8')).pack;
const PACK_TEXT = JSON.stringify({ kwpack: 1, pack: FIXTURE,
  sig: { alg: 'ed25519', kid: 'kw1', value: crypto.sign(null, PK.message(FIXTURE), KP.privateKey).toString('base64') } });

test('pack.js reads a signed pack through this verifier, and refuses one changed character', () => {
  const opts = { keys: { kw1: PUB }, verify: ED.verify };
  const r = PK.read(PACK_TEXT, opts);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.signed, true);
  assert.ok(PACK_TEXT.includes('"Test knight"'));
  const changed = PK.read(PACK_TEXT.replace('"Test knight"', '"Test knighT"'), opts);
  assert.deepEqual([changed.ok, changed.step], [false, 'signature']);
  assert.match(changed.reason, /does not verify/);
});

test('loaded as the page loads them, pack.js finds KW.ed25519.verify by itself', () => {
  const ctx = vm.createContext({ window: {} });
  for (const f of ['ed25519.js', 'pack.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/js', f), 'utf8'), ctx);
  const KW = ctx.window.KW;
  assert.equal(typeof KW.ed25519.verify, 'function');
  const pub = vm.runInContext('new Uint8Array(32)', ctx);
  pub.set(PUB);
  const r = KW.pack.read(PACK_TEXT, { keys: { kw1: pub } });
  assert.equal(r.ok, true, r.reason);
  const changed = KW.pack.read(PACK_TEXT.replace('"Test knight"', '"Test knighT"'), { keys: { kw1: pub } });
  assert.deepEqual([changed.ok, changed.step], [false, 'signature']);
});

// ---- The source and the time it takes ---------------------------------------------------------------

test('the source makes no code from data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'web/js/ed25519.js'), 'utf8');
  assert.doesNotMatch(src, /\beval\b/);
  assert.ok(!src.includes('Function('));
});

test('one signature over 500 KiB verifies well inside a second', (t) => {
  for (const n of [15 * 1024, 500 * 1024]) {
    const m = rand(n), s = new Uint8Array(crypto.sign(null, m, KP.privateKey));
    const t0 = process.hrtime.bigint();
    assert.equal(ED.verify(PUB, m, s), true);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    t.diagnostic(n / 1024 + ' KiB: ' + ms.toFixed(1) + ' ms');
    assert.ok(ms < 1000, ms + ' ms');
  }
});
