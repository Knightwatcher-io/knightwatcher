#!/usr/bin/env node
// Signs pack files, or takes their signatures off, and writes each one's carrier again.
//
//   PACK_KEY_KW1=... node tools/sign-pack.js [--kid KID] FILE.pack.json ...
//   node tools/sign-pack.js --unsign FILE.pack.json ...
//
// The private key is read from the environment variable PACK_KEY_<KID>, the kid in capitals with
// any character other than a letter or a digit written as "_" (PACK_KEY_KW1 for the default kid,
// kw1). It holds the key as PKCS#8 PEM. The tool never prints, logs or writes it, and takes it from
// nowhere else. The key's public half must be the one web/js/pack.js holds in KEYS under the kid.
//
// Each file is read and checked with the page's own pack.js before anything is written, with any
// signature it already carries set aside, so a pack edited after signing can be signed again. The
// signature covers pack.js's own message(): the leading line and the canonical form of the pack.
// It goes into the envelope's "sig", and the rest of the file is left as it was, byte for byte.
// The written file is then read back from disk through pack.js with signatures required and the
// page's own verifier, web/js/ed25519.js, and the tool fails if it does not verify. --unsign takes
// "sig" out and needs no key. Either way the carrier is written again with tools/pack-carrier.js.
// docs/packs.md describes signing.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PK = require('../web/js/pack.js');
const ED = require('../web/js/ed25519.js');
const CARRIER = require('./pack-carrier.js');

const SUFFIX = '.pack.json';
const DEFAULT_KID = 'kw1';

/* The name of the environment variable that holds the private key for a kid. */
const envName = kid => 'PACK_KEY_' + kid.toUpperCase().replace(/[^A-Z0-9]/g, '_');

/* ---- The envelope's members, found in the text ------------------------------------------------- */

/* Where a JSON string that opens at i ends: the index after its closing quote. */
function endOfString(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '"') return j + 1;
  }
  throw new Error('an unterminated string');
}
/* Where the JSON value that starts at i ends. The text is known to be valid JSON. */
function endOfValue(text, i) {
  if (text[i] === '"') return endOfString(text, i);
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (c === '"') j = endOfString(text, j) - 1;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { if (--depth === 0) return j + 1; }
    }
    throw new Error('an unclosed object or array');
  }
  let j = i;
  while (j < text.length && !',}] \t\r\n'.includes(text[j])) j++;
  return j;
}
const skip = (text, i) => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; return i; };
/* The top-level members of the envelope, each { key, keyStart, keyEnd, valueStart, valueEnd }. */
function members(text) {
  JSON.parse(text);
  let i = skip(text, 0);
  if (text[i] !== '{') throw new Error('the file must hold a JSON object, the envelope');
  const out = [];
  i = skip(text, i + 1);
  if (text[i] === '}') return out;
  for (;;) {
    const keyStart = i, keyEnd = endOfString(text, i);
    i = skip(text, keyEnd) + 1;
    const valueStart = skip(text, i), valueEnd = endOfValue(text, valueStart);
    out.push({ key: JSON.parse(text.slice(keyStart, keyEnd)), keyStart, keyEnd, valueStart, valueEnd });
    i = skip(text, valueEnd);
    if (text[i] === '}') return out;
    i = skip(text, i + 1);
  }
}

/* The text with sig set to the given object and nothing else changed. An existing sig has its value
   replaced where it stands; otherwise sig is added after the last member, on a line of its own
   indented like the others when the envelope is laid out over lines, and in the envelope's own
   spacing when it is on one line. */
function withSig(text, sig) {
  const ms = members(text), at = ms.find(m => m.key === 'sig');
  const pretty = /\n/.test(text.slice(skip(text, 0), ms[0].keyStart));
  const value = pretty ? '{ ' + Object.keys(sig).map(k => JSON.stringify(k) + ': ' + JSON.stringify(sig[k])).join(', ') + ' }' : JSON.stringify(sig);
  if (at) return text.slice(0, at.valueStart) + value + text.slice(at.valueEnd);
  const last = ms[ms.length - 1], first = ms[0];
  const colon = text.slice(first.keyEnd, first.valueStart);
  const sep = pretty ? ',\n' + text.slice(text.lastIndexOf('\n', first.keyStart) + 1, first.keyStart)
    : ms.length > 1 ? text.slice(ms[0].valueEnd, ms[1].keyStart) : ',';
  return text.slice(0, last.valueEnd) + sep + '"sig"' + colon + value + text.slice(last.valueEnd);
}
/* The text with its sig member taken out, and with it the comma and space that set it apart. */
function withoutSig(text) {
  const ms = members(text), n = ms.findIndex(m => m.key === 'sig');
  if (n < 0) return text;
  if (n > 0) return text.slice(0, ms[n - 1].valueEnd) + text.slice(ms[n].valueEnd);
  return text.slice(0, ms[0].keyStart) + text.slice(ms.length > 1 ? ms[1].keyStart : skip(text, ms[0].valueEnd));
}

/* ---- Signing ---------------------------------------------------------------------------------- */

const rel = file => path.relative(process.cwd(), file) || file;
function fail(msg) { const e = new Error(msg); e.refusal = true; throw e; }

/* The private key for kid from pem, refused unless it is an Ed25519 key in PKCS#8 PEM whose public
   half is keys[kid]. No message names anything read from pem. */
function privateKey(kid, pem, keys) {
  const name = envName(kid);
  const want = Object.prototype.hasOwnProperty.call(keys, kid) ? keys[kid] : null;
  if (!(want instanceof Uint8Array) || want.length !== 32) fail('the page knows no key named "' + kid + '"');
  if (typeof pem !== 'string' || !pem.trim()) fail(name + ' is not set: it must hold the private key for "' + kid + '" as PKCS#8 PEM');
  if (!pem.includes('-----BEGIN PRIVATE KEY-----')) fail(name + ' does not hold a PKCS#8 PEM private key');
  let key;
  try { key = crypto.createPrivateKey({ key: pem, format: 'pem' }); } catch (e) { fail(name + ' does not hold a private key that can be read'); }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') fail(name + ' does not hold an Ed25519 private key');
  const pub = Buffer.from(crypto.createPublicKey(key).export({ format: 'jwk' }).x, 'base64url');
  if (!pub.equals(Buffer.from(want))) fail('the private key in ' + name + ' is not the one whose public half the page holds as "' + kid + '"');
  return key;
}

/* Reads a pack file and checks it with pack.js, any signature it carries set aside. */
function readPack(file) {
  if (!file.endsWith(SUFFIX)) fail(rel(file) + ': a pack file\'s name ends in ' + SUFFIX);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { fail(rel(file) + ': cannot be read'); }
  let bare;
  try { bare = withoutSig(text); } catch (e) { fail(rel(file) + ': not a JSON envelope: ' + e.message); }
  const r = PK.read(bare, { allowUnsigned: true });
  if (!r.ok) fail(rel(file) + ': refused at the ' + r.step + ' step: ' + r.reason);
  return { file, text, bare };
}

function writeCarrier(file, text) {
  fs.writeFileSync(CARRIER.carrierPath(file), CARRIER.carrier(text));
  console.log('wrote ' + rel(CARRIER.carrierPath(file)));
}

/* Signs each file with the key in pem for kid. keys is the table of public keys the signature must
   verify against: pack.js's KEYS unless the caller gives another. Every file is checked and its
   signature made before any is written. */
function sign(files, { kid = DEFAULT_KID, pem, keys = PK.KEYS } = {}) {
  if (!files.length) fail('name at least one ' + SUFFIX + ' file');
  const key = privateKey(kid, pem, keys);
  const opts = { keys: { [kid]: keys[kid] }, verify: ED.verify };
  const jobs = files.map(readPack).map(job => {
    const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(job.bare).pack)), key).toString('base64');
    const out = withSig(job.text, { alg: 'ed25519', kid, value });
    const r = PK.read(out, opts);
    if (!r.ok || r.signed !== true) fail(rel(job.file) + ': the signature made does not verify: ' + (r.reason || 'not marked signed'));
    return Object.assign(job, { out });
  });
  for (const job of jobs) {
    fs.writeFileSync(job.file, job.out);
    const back = fs.readFileSync(job.file, 'utf8');
    const r = PK.read(back, opts);
    if (back !== job.out || !r.ok || r.signed !== true || withoutSig(back) !== job.bare) {
      fs.writeFileSync(job.file, job.text);
      fail(rel(job.file) + ': the file as written does not verify, so it was put back as it was');
    }
    console.log('signed ' + rel(job.file) + ' with ' + kid);
    writeCarrier(job.file, back);
  }
}

/* Takes the signature off each file. Needs no key. */
function unsign(files) {
  if (!files.length) fail('name at least one ' + SUFFIX + ' file');
  const jobs = files.map(readPack);
  for (const job of jobs) {
    if (job.bare !== job.text) { fs.writeFileSync(job.file, job.bare); console.log('unsigned ' + rel(job.file)); }
    else console.log(rel(job.file) + ' carries no signature');
    writeCarrier(job.file, job.bare);
  }
}

function main(args, env) {
  let kid = null, off = false;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--unsign') off = true;
    else if (a === '--kid') { if (i + 1 >= args.length) fail('--kid needs a value'); kid = args[++i]; }
    else if (a.startsWith('--kid=')) kid = a.slice(6);
    else if (a.startsWith('-')) fail('unknown option ' + a);
    else files.push(a);
  }
  if (off) {
    if (kid !== null) fail('--unsign takes no --kid');
    return unsign(files);
  }
  kid = kid === null ? DEFAULT_KID : kid;
  const name = envName(kid), pem = env[name];
  delete env[name];
  return sign(files, { kid, pem });
}

module.exports = { envName, withSig, withoutSig, sign, unsign, main };
if (require.main === module) {
  try { main(process.argv.slice(2), process.env); } catch (e) {
    console.error('sign-pack: ' + (e.refusal ? e.message : 'failed: ' + e.message));
    process.exit(1);
  }
}
