// Tests for the signing tool, tools/sign-pack.js, and for the signatures of the packs that ship
// with the page. Run with: node --test tests/tools/
// Every key pair here is generated for the run and held in memory: the private half reaches the
// tool through its module interface or through the environment of a child process, and is never
// written anywhere. The files signed are copies in a temporary folder outside the repository.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PK = require('../../web/js/pack.js');
const ED = require('../../web/js/ed25519.js');
const C = require('../../tools/pack-carrier.js');
const S = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const TOOL = path.join(ROOT, 'tools/sign-pack.js');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/web/fixtures/base.pack.json'), 'utf8');
const bump = (text, version) => text.replace(/"version": "[^"]*"/, '"version": "' + version + '"');

const pair = () => {
  const k = crypto.generateKeyPairSync('ed25519');
  return { pem: k.privateKey.export({ type: 'pkcs8', format: 'pem' }), pub: new Uint8Array(Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url')) };
};
const KEY = pair();
const TABLE = { kw1: KEY.pub };

// A temporary folder holding an unsigned copy of the fixture pack of tests/web/: { dir, file, read() }.
function sandbox(t, text = S.withoutSig(FIXTURE)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sign-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'base.pack.json');
  fs.writeFileSync(file, text);
  return { dir, file, read: () => fs.readFileSync(file, 'utf8') };
}
// Runs the tool as a child process with exactly the environment given, and quietly.
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env: Object.assign({ PATH: process.env.PATH }, env) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
// Whether a file's carrier pushes the file's text, as the tool writes it.
const carried = file => fs.readFileSync(C.carrierPath(file), 'utf8') === C.carrier(fs.readFileSync(file, 'utf8'));
// Mutes the tool's lines on the console for the length of fn.
function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

test('the variable named for a kid is PACK_KEY_ and the kid in capitals', () => {
  assert.equal(S.envName('kw1'), 'PACK_KEY_KW1');
  assert.equal(S.envName('fork.a-2'), 'PACK_KEY_FORK_A_2');
});

test('a signature goes in and out of the envelope with the rest of the file left as it was', () => {
  const sig = { alg: 'ed25519', kid: 'kw1', value: 'AAAA' };
  const plain = S.withoutSig(FIXTURE), signed = S.withSig(plain, sig);
  assert.equal(S.withoutSig(signed), plain);
  assert.ok(signed.startsWith(plain.slice(0, plain.lastIndexOf('}')).trimEnd()), 'nothing up to the end of the pack moves');
  assert.deepEqual(Object.keys(JSON.parse(signed)), ['kwpack', 'pack', 'sig']);
  assert.match(signed, /\n {2}"sig": \{ "alg": "ed25519", "kid": "kw1", "value": "AAAA" \}\n\}\n$/);
  // signing again replaces the value where it stands
  const again = S.withSig(signed, Object.assign({}, sig, { value: 'BBBB' }));
  assert.equal(again, signed.replace('AAAA', 'BBBB'));
  // an envelope on one line keeps its own spacing, and a sig written first is taken out cleanly
  assert.equal(S.withSig('{"kwpack":1,"pack":{}}', sig), '{"kwpack":1,"pack":{},"sig":{"alg":"ed25519","kid":"kw1","value":"AAAA"}}');
  assert.equal(S.withSig('{ "kwpack": 1, "pack": {"s": "}\\""} }\n', sig), '{ "kwpack": 1, "pack": {"s": "}\\""}, "sig": {"alg":"ed25519","kid":"kw1","value":"AAAA"} }\n');
  assert.equal(S.withoutSig('{"sig": {"a": 1}, "kwpack": 1, "pack": {}}'), '{"kwpack": 1, "pack": {}}');
});

test('a pack signed by the tool verifies through pack.js and the page\'s verifier, and its carrier matches', t => {
  const box = sandbox(t), before = box.read();
  quiet(() => S.sign([box.file], { kid: 'kw1', pem: KEY.pem, keys: TABLE }));
  const text = box.read(), env = JSON.parse(text);
  assert.deepEqual(Object.keys(env.sig), ['alg', 'kid', 'value']);
  assert.equal(env.sig.kid, 'kw1');
  assert.equal(S.withoutSig(text), before, 'only the sig was added');
  const r = PK.read(text, { keys: TABLE, verify: ED.verify });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.signed, true);
  // node:crypto agrees, on the bytes pack.js says are signed
  const pub = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(KEY.pub).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify(null, Buffer.from(PK.message(env.pack)), pub, Buffer.from(env.sig.value, 'base64')));
  assert.ok(carried(box.file), 'the carrier pushes the signed text');
  // the shipped table does not hold this key, so the signed copy is refused there
  assert.equal(PK.read(text, { verify: ED.verify }).step, 'signature');
});

test('a pack edited after signing is refused until it is signed again', t => {
  const box = sandbox(t);
  quiet(() => S.sign([box.file], { pem: KEY.pem, keys: TABLE }));
  fs.writeFileSync(box.file, bump(box.read(), '9.9.9'));
  const r = PK.read(box.read(), { keys: TABLE, verify: ED.verify });
  assert.deepEqual([r.ok, r.step], [false, 'signature']);
  quiet(() => S.sign([box.file], { pem: KEY.pem, keys: TABLE }));
  const again = PK.read(box.read(), { keys: TABLE, verify: ED.verify });
  assert.deepEqual([again.ok, again.version, again.signed], [true, '9.9.9', true]);
  assert.equal(box.read().match(/"sig"/g).length, 1, 'one sig, replaced');
  assert.ok(carried(box.file));
});

test('the tool refuses a key whose public half is not the table\'s, and a kid the table lacks', t => {
  const box = sandbox(t), before = box.read();
  assert.throws(() => S.sign([box.file], { pem: pair().pem, keys: TABLE }), /is not the one whose public half the page holds as "kw1"/);
  assert.throws(() => S.sign([box.file], { kid: 'kw9', pem: KEY.pem, keys: TABLE }), /knows no key named "kw9"/);
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => S.sign([box.file], { pem: ec, keys: TABLE }), /PACK_KEY_KW1 does not hold an Ed25519 private key/);
  assert.equal(box.read(), before);
  assert.ok(!fs.existsSync(C.carrierPath(box.file)));
});

test('nothing is written when any one of the files is refused', t => {
  const box = sandbox(t), bad = path.join(box.dir, 'bad.pack.json');
  fs.writeFileSync(bad, bump(FIXTURE, '1.0'));
  assert.throws(() => S.sign([box.file, bad], { pem: KEY.pem, keys: TABLE }), /bad\.pack\.json: refused at the fields step/);
  assert.equal(box.read(), S.withoutSig(FIXTURE));
  assert.ok(!fs.existsSync(C.carrierPath(box.file)));
});

test('run without its variable, the tool refuses and writes nothing', t => {
  const box = sandbox(t);
  for (const env of [{}, { PACK_KEY_KW1: '' }]) {
    const r = run([box.file], env);
    assert.equal(r.code, 1);
    assert.equal(r.err, 'sign-pack: PACK_KEY_KW1 is not set: it must hold the private key for "kw1" as PKCS#8 PEM\n');
  }
  assert.match(run(['--kid', 'kw9', box.file]).err, /knows no key named "kw9"/);
  assert.equal(box.read(), S.withoutSig(FIXTURE));
  assert.ok(!fs.existsSync(C.carrierPath(box.file)));
});

test('run with a key that is not the page\'s kw1, the tool refuses and never prints the key', t => {
  const box = sandbox(t), other = pair();
  const r = run([box.file], { PACK_KEY_KW1: other.pem });
  assert.equal(r.code, 1);
  assert.equal(r.err, 'sign-pack: the private key in PACK_KEY_KW1 is not the one whose public half the page holds as "kw1"\n');
  const body = other.pem.split('\n')[1];
  assert.ok(!r.out.includes(body) && !r.err.includes(body));
  // armour around bytes that are no key, spelt in pieces so that no PEM block sits in the repository
  const armour = (edge, body) => ['-----BEGIN ' + edge + '-----', body, '-----END ' + edge + '-----', ''].join('\n');
  const junk = run([box.file], { PACK_KEY_KW1: armour('PRIVATE' + ' KEY', 'c2VjcmV0IHNlY3JldA==') });
  assert.equal(junk.err, 'sign-pack: PACK_KEY_KW1 does not hold a private key that can be read\n');
  assert.ok(!junk.err.includes('c2VjcmV0'));
  assert.equal(box.read(), S.withoutSig(FIXTURE));
});

test('--unsign takes the sig out, needs no key, and writes the carrier again', t => {
  const box = sandbox(t), plain = box.read();
  quiet(() => S.sign([box.file], { pem: KEY.pem, keys: TABLE }));
  assert.notEqual(box.read(), plain);
  const r = run(['--unsign', box.file]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^unsigned .*base\.pack\.json\nwrote .*base\.pack\.js\n$/);
  assert.equal(box.read(), plain);
  assert.ok(carried(box.file));
  const again = run(['--unsign', box.file]);
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, /carries no signature/);
  assert.equal(box.read(), plain);
  assert.equal(run(['--unsign', '--kid', 'kw1', box.file]).code, 1);
  assert.equal(run(['--unsign']).code, 1);
  assert.equal(run(['--unsign', path.join(box.dir, 'base.json')]).code, 1);
});

// Every shipped pack that carries a sig must verify against the shipped KEYS, so a pack edited
// after it was signed fails here until it is signed again or its signature is taken off.
for (const file of C.packFiles()) {
  const name = path.relative(ROOT, file);
  test(name + ': a sig, when it carries one, verifies against KEYS with the page\'s verifier', () => {
    const text = fs.readFileSync(file, 'utf8');
    if (!Object.prototype.hasOwnProperty.call(JSON.parse(text), 'sig')) {
      assert.equal(PK.read(text, { allowUnsigned: true }).ok, true, 'an unsigned shipped pack still reads on a dev page');
      return;
    }
    const r = PK.read(text, { verify: ED.verify });
    assert.equal(r.ok, true, name + ' does not verify against KEYS: sign it again with tools/sign-pack.js, or take its signature off with --unsign. ' + r.reason);
    assert.equal(r.signed, true);
  });
}
