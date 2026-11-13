/* Knightwatcher: Ed25519 signature verification (docs/packs.md, Signing). This is RFC 8032's pure
   Ed25519, with no context and no prehash, and the SHA-512 it needs. The page carries it because
   crypto.subtle is missing on a page served over plain HTTP, and the page has no dependencies.

   It verifies and does nothing else: there is no signing and no key generation, and no secret
   ever passes through this file. A public key, a message and a signature are all public, so the
   arithmetic is not constant-time and has no need to be.

   Nothing here touches the page, so the file loads under Node for tests/web/ed25519.test.js. */
(function (KW) {
  'use strict';

  /* ---- SHA-512 (FIPS 180-4) --------------------------------------------------------------------- */

  /* A 64-bit word is held as two 32-bit integers, high and low, in plain numbers. BigInt would read
     more simply, but every BigInt operation allocates, and a pack of 512 KiB is 4,096 blocks of 80
     rounds each; with pairs of numbers the hash of such a pack takes milliseconds. */
  const TWO32 = 4294967296;

  /* floor(n ** (1 / k)) for a BigInt n, by Newton's method from above. */
  function iroot(n, k) {
    const K = BigInt(k), K1 = BigInt(k - 1);
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
    for (;;) {
      const y = (K1 * x + n / x ** K1) / K;
      if (y >= x) return x;
      x = y;
    }
  }
  /* The constants are derived as FIPS 180-4 section 4.2.3 and 5.3.5 define them, not typed in:
     the first 64 bits of the fractional parts of the square roots of the first 8 primes (the
     initial hash) and of the cube roots of the first 80 primes (the round constants). */
  const PRIMES = [];
  for (let n = 2; PRIMES.length < 80; n++) if (PRIMES.every(q => n % q !== 0)) PRIMES.push(n);
  const frac = (p, k) => iroot(BigInt(p) << BigInt(64 * k), k) & 0xffffffffffffffffn;
  function words(list) {
    const hi = new Int32Array(list.length), lo = new Int32Array(list.length);
    list.forEach((v, i) => { hi[i] = Number(v >> 32n); lo[i] = Number(v & 0xffffffffn); });
    return [hi, lo];
  }
  const [IH, IL] = words(PRIMES.slice(0, 8).map(p => frac(p, 2)));
  const [KH, KL] = words(PRIMES.map(p => frac(p, 3)));

  /* The two halves of a 64-bit word (h, l) rotated right by n, for 0 < n < 32. A rotation by
     n >= 32 is the rotation by n - 32 of (l, h). */
  const rh = (h, l, n) => (h >>> n) | (l << (32 - n));
  const rl = (h, l, n) => (l >>> n) | (h << (32 - n));

  /* SHA-512 of the bytes of a list of Uint8Arrays taken one after another. Returns 64 bytes. */
  function sha512(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const total = Math.ceil((n + 17) / 128) * 128, buf = new Uint8Array(total), dv = new DataView(buf.buffer);
    let at = 0;
    for (const p of parts) { buf.set(p, at); at += p.length; }
    buf[n] = 0x80;
    dv.setUint32(total - 8, Math.floor(n / 0x20000000));
    dv.setUint32(total - 4, (n * 8) >>> 0);

    const H = Int32Array.from(IH), Hl = Int32Array.from(IL), wh = new Int32Array(80), wl = new Int32Array(80);
    for (let off = 0; off < total; off += 128) {
      for (let i = 0; i < 16; i++) { wh[i] = dv.getInt32(off + 8 * i); wl[i] = dv.getInt32(off + 8 * i + 4); }
      for (let i = 16; i < 80; i++) {
        const xh = wh[i - 2], xl = wl[i - 2], yh = wh[i - 15], yl = wl[i - 15];
        // sigma1 = rotr 19 ^ rotr 61 ^ shr 6, sigma0 = rotr 1 ^ rotr 8 ^ shr 7
        const s1h = rh(xh, xl, 19) ^ rh(xl, xh, 29) ^ (xh >>> 6), s1l = rl(xh, xl, 19) ^ rl(xl, xh, 29) ^ ((xl >>> 6) | (xh << 26));
        const s0h = rh(yh, yl, 1) ^ rh(yh, yl, 8) ^ (yh >>> 7), s0l = rl(yh, yl, 1) ^ rl(yh, yl, 8) ^ ((yl >>> 7) | (yh << 25));
        const lo = (s1l >>> 0) + (wl[i - 7] >>> 0) + (s0l >>> 0) + (wl[i - 16] >>> 0);
        wh[i] = s1h + wh[i - 7] + s0h + wh[i - 16] + Math.floor(lo / TWO32);
        wl[i] = lo;
      }
      let ah = H[0], al = Hl[0], bh = H[1], bl = Hl[1], ch = H[2], cl = Hl[2], dh = H[3], dl = Hl[3];
      let eh = H[4], el = Hl[4], fh = H[5], fl = Hl[5], gh = H[6], gl = Hl[6], hh = H[7], hl = Hl[7];
      for (let i = 0; i < 80; i++) {
        // t1 = h + Sigma1(e) + Ch(e, f, g) + K[i] + W[i], with Sigma1 = rotr 14 ^ rotr 18 ^ rotr 41
        const S1h = rh(eh, el, 14) ^ rh(eh, el, 18) ^ rh(el, eh, 9), S1l = rl(eh, el, 14) ^ rl(eh, el, 18) ^ rl(el, eh, 9);
        const xh = (eh & fh) ^ (~eh & gh), xl = (el & fl) ^ (~el & gl);
        const t1l = (hl >>> 0) + (S1l >>> 0) + (xl >>> 0) + (KL[i] >>> 0) + (wl[i] >>> 0);
        const t1h = hh + S1h + xh + KH[i] + wh[i] + Math.floor(t1l / TWO32);
        // t2 = Sigma0(a) + Maj(a, b, c), with Sigma0 = rotr 28 ^ rotr 34 ^ rotr 39
        const S0h = rh(ah, al, 28) ^ rh(al, ah, 2) ^ rh(al, ah, 7), S0l = rl(ah, al, 28) ^ rl(al, ah, 2) ^ rl(al, ah, 7);
        const mh = (ah & bh) ^ (ah & ch) ^ (bh & ch), ml = (al & bl) ^ (al & cl) ^ (bl & cl);
        const t2l = (S0l >>> 0) + (ml >>> 0), t2h = S0h + mh + Math.floor(t2l / TWO32);
        hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
        const el2 = (dl >>> 0) + (t1l % TWO32);
        eh = (dh + t1h + Math.floor(el2 / TWO32)) | 0; el = el2 | 0;
        dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
        const al2 = (t1l % TWO32) + t2l % TWO32;
        ah = (t1h + t2h + Math.floor(al2 / TWO32)) | 0; al = al2 | 0;
      }
      const add = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
      for (let j = 0; j < 8; j++) {
        const lo = (Hl[j] >>> 0) + (add[2 * j + 1] >>> 0);
        H[j] = H[j] + add[2 * j] + Math.floor(lo / TWO32);
        Hl[j] = lo;
      }
    }
    const out = new Uint8Array(64), ov = new DataView(out.buffer);
    for (let j = 0; j < 8; j++) { ov.setInt32(8 * j, H[j]); ov.setInt32(8 * j + 4, Hl[j]); }
    return out;
  }

  /* ---- The curve (RFC 8032 section 5.1) --------------------------------------------------------- */

  /* The parameters of RFC 8032 table 1: the field prime p, the group order L, the curve constant d
     and the base point B. */
  const P = 2n ** 255n - 19n;
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
  const BX = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  const BY = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;

  const md = a => { const r = a % P; return r < 0n ? r + P : r; };
  function pow(b, e) {
    let r = 1n;
    b = md(b);
    for (; e > 0n; e >>= 1n) { if (e & 1n) r = r * b % P; b = b * b % P; }
    return r;
  }
  const D2 = md(2n * D);
  const SQRT_M1 = pow(2n, (P - 1n) / 4n);

  /* A point is [X, Y, Z, T] in extended coordinates: x = X/Z, y = Y/Z, xy = T/Z. */
  const ZERO = [0n, 1n, 1n, 0n];
  const BASE = [BX, BY, 1n, md(BX * BY)];

  /* Addition and doubling as RFC 8032 section 5.1.4 gives them. Both are complete: they hold for
     any two points of the curve, the neutral point and points of small order included. */
  function add(p, q) {
    const a = md((p[1] - p[0]) * (q[1] - q[0])), b = md((p[1] + p[0]) * (q[1] + q[0]));
    const c = md(p[3] * D2 % P * q[3]), d = md(2n * p[2] * q[2]);
    const e = b - a, f = d - c, g = d + c, h = b + a;
    return [md(e * f), md(g * h), md(f * g), md(e * h)];
  }
  function double(p) {
    const a = md(p[0] * p[0]), b = md(p[1] * p[1]), c = md(2n * p[2] * p[2]);
    const h = a + b, e = h - md((p[0] + p[1]) ** 2n), g = a - b, f = c + g;
    return [md(e * f), md(g * h), md(f * g), md(e * h)];
  }
  const negate = p => [md(-p[0]), p[1], p[2], md(-p[3])];
  /* Whether [8]p is the neutral point (X = 0, Y = Z): p is one of the eight points of small order. */
  const smallOrder = p => { const q = double(double(double(p))); return q[0] === 0n && q[1] === q[2]; };

  /* [s]B + [k]Q for s, k below 2^253, by interleaved double-and-add over the bits of both. */
  function mul2(s, k, Q) {
    const table = [null, BASE, Q, add(BASE, Q)];
    const sb = s.toString(2).padStart(253, '0'), kb = k.toString(2).padStart(253, '0');
    let r = ZERO;
    for (let i = 0; i < 253; i++) {
      r = double(r);
      const j = (sb.charCodeAt(i) - 48) + 2 * (kb.charCodeAt(i) - 48);
      if (j) r = add(r, table[j]);
    }
    return r;
  }

  /* 32 bytes, little-endian, as a BigInt. */
  function le(b) {
    let n = 0n;
    for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
    return n;
  }

  /* Decodes 32 bytes as a point, as RFC 8032 section 5.1.3 does, and returns null for anything but
     the canonical encoding of a point on the curve: a y of p or more, a y with no x, or x = 0 with
     the sign bit set. */
  function decode(b) {
    let y = le(b);
    const sign = y >> 255n;
    y &= (1n << 255n) - 1n;
    if (y >= P) return null;
    const y2 = y * y % P, u = md(y2 - 1n), v = md(D * y2 + 1n);
    const v3 = v * v % P * v % P;
    let x = u * v3 % P * pow(u * v3 % P * v3 % P * v, (P - 5n) / 8n) % P;
    const vx2 = v * x % P * x % P;
    if (vx2 !== u) {
      if (vx2 !== md(-u)) return null;
      x = x * SQRT_M1 % P;
    }
    if (x === 0n && sign === 1n) return null;
    if ((x & 1n) !== sign) x = P - x;
    return [x, y, 1n, x * y % P];
  }

  /* ---- Verification (RFC 8032 section 5.1.7) ----------------------------------------------------- */

  /* Whether signature is a good Ed25519 signature of message under publicKey: three Uint8Arrays of
     32 bytes, any length and 64 bytes. Returns true or false and never throws.

     The checks are the strict ones. S must be below L. The key and R must each be the canonical
     encoding of a point on the curve. Neither may be one of the eight points of small order: a
     key of small order lets one signature verify for many messages, and Node's crypto.verify
     refuses an R of small order, which a correct signer produces with a chance of about 2^-252.

     The group equation is the cofactorless [S]B = R + [k]A, with k reduced mod L first, as in RFC
     8032's reference code and in Node's crypto.verify. A correct signer always satisfies it. The
     cofactored [8][S]B = [8]R + [8][k]A also accepts a signature whose two sides differ by a point
     of small order, which takes an R or a key given a small-order component on purpose. This check
     refuses those. */
  function verify(publicKey, message, signature) {
    try {
      if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
      if (!(message instanceof Uint8Array)) return false;
      if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;
      const rBytes = signature.subarray(0, 32);
      const s = le(signature.subarray(32, 64));
      if (s >= L) return false;
      const A = decode(publicKey);
      if (!A || smallOrder(A)) return false;
      const R = decode(rBytes);
      if (!R || smallOrder(R)) return false;
      const k = le(sha512([rBytes, publicKey, message])) % L;
      // [S]B - [k]A, compared with R without leaving extended coordinates (R's Z is 1)
      const Q = mul2(s, k, negate(A));
      return md(R[0] * Q[2]) === Q[0] && md(R[1] * Q[2]) === Q[1];
    } catch (e) {
      return false;
    }
  }

  /* testOnly exposes the hash, the decoding and the curve's parameters to tests/web/ed25519.test.js. Nothing
     else may use it: it is not part of the verifier's interface and may change with no notice. */
  const api = { verify, testOnly: Object.freeze({ sha512: m => sha512([m]), decode, P, L, D, BX, BY }) };
  KW.ed25519 = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
