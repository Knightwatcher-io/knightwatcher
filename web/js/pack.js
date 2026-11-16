/* Knightwatcher: packs (docs/packs.md). read() checks the text of a pack file whole and either
   returns the pack, ready to draw from, or refuses it with the step and the field at fault.
   resolve() turns a look into lists of flat records, and draw() walks a list, calling the
   primitives of draw.js. A pack is data only: the compiler builds records and never makes code
   out of what a pack says. Nothing here touches the page, so the file loads under Node for the
   tests in tests/web/. */
(function (KW) {
  'use strict';

  /* ---- The format's constants -------------------------------------------------------------- */

  /* The newest format this library reads. It reads [1, 0] and [1, 1]: 1.1 adds the world sections
     (docs/packs.md, Format 1.1), which are checked and kept as data, and nothing draws from yet. */
  const FORMAT = Object.freeze([1, 1]);
  /* Signed ahead of the pack's canonical form, so that a signature made for anything else cannot
     pass as a pack's. */
  const PREFIX = 'knightwatcher pack v1\n';
  /* The pack whose builds and defaults every look falls back on. */
  const BASE_ID = 'kw.base';
  const LIMITS = Object.freeze({
    text: 512 * 1024, depth: 12, packs: 32, items: 256, parts: 16, partShapes: 128, itemShapes: 400,
    polyPoints: 16, pixSide: 64, pixShape: 4096, pixPack: 16384, pixKeys: 16, sets: 16, setEntries: 32,
    swatches: 32, bands: 8, builds: 4, decorations: 64, decorShapes: 64, groups: 8, tracks: 16, keys: 32,
    restShapes: 64, box: 240, lookShapes: 1200, itemCost: 8000, lookCost: 40000, decorCost: 8000, reason: 300, quote: 40 });
  /* The farthest apart two anchors of one frame may lie, which the cost of a shape spanning two
     anchors assumes. The rig in knight.js keeps them within 273 of each other in every pose. */
  const ANCHOR_SPAN = 400;
  const STEPS = Object.freeze(['size', 'json', 'envelope', 'signature', 'format', 'fields', 'references', 'rules', 'counts', 'compile']);

  const SLOTS = Object.freeze(['back', 'legs', 'boots', 'torso', 'head', 'hair', 'plume', 'helmet', 'pauldrons', 'arms', 'gauntlets', 'main', 'off', 'companion']);
  /* The slots a look chooses an item for, in drawing order. The head comes from the build. */
  const LOOK_SLOTS = Object.freeze(['back', 'legs', 'boots', 'torso', 'hair', 'plume', 'helmet', 'pauldrons', 'arms', 'gauntlets', 'main', 'off']);
  const DEFAULT_SLOTS = Object.freeze(['legs', 'boots', 'torso', 'hair', 'plume', 'helmet', 'pauldrons', 'arms', 'gauntlets', 'main']);

  /* The anchors the engine fills each frame. The anchors array holds x and y of each in this order,
     then the weapon frame's direction: sin(a) at FRAME_SX and -cos(a) at FRAME_SY. The plume's
     anchor is not here: the compiler folds the helmet's mount into the plume's offsets. */
  const ANCHORS = Object.freeze(['root', 'footL', 'footR', 'hipL', 'hipR', 'hem', 'belt', 'neck', 'shoulderL', 'shoulderR', 'head', 'handL', 'handR', 'main', 'off', 'rest']);
  const ANCHOR = Object.freeze(ANCHORS.reduce((o, n, i) => { o[n] = i; return o; }, {}));
  const FRAME_SX = ANCHORS.length * 2, FRAME_SY = FRAME_SX + 1, MAIN = ANCHOR.main;
  const SIDED = { foot: ['footL', 'footR'], hip: ['hipL', 'hipR'], shoulder: ['shoulderL', 'shoulderR'], hand: ['handL', 'handR'] };
  const BODY = ['root', 'footL', 'footR', 'hipL', 'hipR', 'hem', 'belt', 'neck', 'shoulderL', 'shoulderR', 'head', 'handL', 'handR'];
  const SLOT_AT = {
    back: BODY.concat(['foot', 'hip', 'shoulder', 'hand']), legs: ['hipL', 'hipR', 'hip'], boots: ['footL', 'footR', 'foot'],
    torso: ['neck', 'belt', 'hem'], head: ['head'], hair: ['head'], helmet: ['head'], plume: ['plume'],
    pauldrons: ['shoulderL', 'shoulderR', 'shoulder'], arms: ['shoulder', 'hand'], gauntlets: ['hand'], main: ['main'], off: ['off'] };

  /* The named values. VALUES are those the engine sets each frame, in the order of the values
     array. The build's differences are folded into constants when a look is compiled. */
  const VALUES = Object.freeze(['drop', 'bloat', 'stepL', 'stepR', 'sway']);
  const VALUE = Object.freeze(VALUES.reduce((o, n, i) => { o[n] = i; return o; }, {}));
  /* name, the present knight's value, lowest, highest */
  const MEASURES = Object.freeze([['shoulder', 54, 40, 70], ['chest', 46, 32, 64], ['waist', 46, 28, 64], ['hip', 46, 32, 64],
    ['stance', 24, 16, 34], ['leg', 74, 60, 100], ['height', 132, 110, 160], ['head', 51, 42, 60]].map(Object.freeze));
  const DIFFS = MEASURES.map(m => 'd' + m[0][0].toUpperCase() + m[0].slice(1));
  /* The torso: a build's height less its leg, the shoulder line above the hip line, lowest and
     highest. The two measurements have ranges of their own, which alone would allow a torso from 10
     to 100; this keeps every build a plausible shape (the present knight's is 58). */
  const TORSO = Object.freeze([46, 74]);
  /* The range of every named value. The engine clamps drop and bloat into theirs when it fills the
     values array; the rest cannot leave theirs. Every scalar is checked over these ranges. */
  const RANGE = { drop: [0, 40], bloat: [0, 60], stepL: [0, 1], stepR: [0, 1], step: [0, 1], sway: [-4, 4] };
  MEASURES.forEach((m, i) => { RANGE[DIFFS[i]] = [m[2] - m[1], m[3] - m[1]]; });
  freeze(RANGE);

  /* The base palette: a frozen copy of KW.draw.C and its band lists, written into format 1. */
  const C = { k: '#1a1524', w: '#ffffff', s0: '#f6f9fc', s1: '#d8e0ea', s2: '#aab6c6', s3: '#7d899b', s4: '#525c6e',
    r0: '#ff8676', r1: '#ff4a3d', r2: '#cc352c', r3: '#8f231d', f0: '#ffe3c4', f1: '#f6cda4', f2: '#e2ad82',
    b0: '#6f9eff', b1: '#3f74e0', b2: '#2f59b6', b3: '#213f86', g0: '#ffe28a', g1: '#ffb000', g2: '#c98600', g3: '#8f5c00',
    n0: '#b98045', n1: '#96622f', n2: '#70461f', n3: '#4c2e12' };
  const BASE = freeze(Object.assign({}, C, {
    steel: [[0.12, C.s0], [0.58, C.s1], [0.84, C.s2], [1, C.s3]], steel2: [[0.14, C.s1], [0.6, C.s2], [1, C.s3]],
    steel3: [[0.2, C.s2], [0.7, C.s3], [1, C.s4]], gold: [[0.3, C.g0], [0.75, C.g1], [1, C.g2]],
    leather: [[0.2, C.n0], [0.65, C.n1], [1, C.n2]] }));
  /* The four sets the user picks swatches for, and what kind each entry is. */
  const USER_SETS = { skin: { face: 'bands', sick: 'bands', hot: 'bands', cheek: 'colour', puff: 'colour' },
    hair: { 0: 'colour', 1: 'colour', 2: 'colour', brow: 'colour' }, tabard: { 0: 'colour', 1: 'colour', 2: 'colour', 3: 'colour' },
    plume: { 0: 'colour', 1: 'colour', 2: 'colour', 3: 'colour' } };

  /* The public keys packs are signed with, by kid: 32 bytes each. A Uint8Array cannot be frozen, so
     each read decodes a fresh copy that nothing can have changed. */
  const KEYS = Object.freeze({ get kw1() { return base64('L6J33tuj/6eKJTc+T6hHVATAS0m1bJnsgdOSgYYtxf4='); } });

  const FITS = ['hang', 'surface', 'floor'];
  const KINDS = ['rect', 'ell', 'rrect', 'poly', 'strip', 'pix'];
  const CHANNELS = ['dx', 'dy', 'scale', 'alpha', 'show'];
  const EASES = ['step', 'linear', 'smooth'];
  const PROVIDES = ['builds', 'items', 'palettes', 'swatches', 'decorations'];
  const FORBIDDEN = ['__proto__', 'constructor', 'prototype'];

  const PACK_ID = /^[a-z][a-z0-9-]{1,31}(\.[a-z0-9-]{1,31}){0,3}$/;
  const LOCAL_ID = /^[a-z][a-z0-9.-]{0,47}$/;
  const SET_NAME = /^[a-z][a-z0-9-]{0,31}$/;
  const ENTRY_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
  const VERSION = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/;
  const KID = /^[a-z0-9][a-z0-9.-]{0,31}$/;
  const HEX = /^#[0-9a-f]{6}$/;
  const REF = /^@([a-z][a-z0-9-]{0,31})\.([a-z0-9][a-z0-9-]{0,31})$/;
  const PAL = /^([a-z][a-z0-9-]{0,31})\.([a-z0-9][a-z0-9-]{0,31})$/;
  const TERM_NAME = /^[A-Za-z][A-Za-z0-9]{0,15}$/;
  const ANCHOR_NAME = /^[A-Za-z]{1,16}$/;
  const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
  const LONE = /[\ud800-\udfff]/u;

  /* ---- Small helpers -------------------------------------------------------------------------- */

  function freeze(v) {
    if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); }
    return v;
  }
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  /* Text from a pack that goes into a reason is cut to LIMITS.quote characters, and a reason to
     LIMITS.reason, each ending in three full stops when cut. */
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
  const quote = s => '"' + cut(String(s), LIMITS.quote) + '"';
  function key(path, k) {
    const seg = PLAIN_KEY.test(k) && k.length <= LIMITS.quote ? k : '["' + cut(JSON.stringify(k).slice(1, -1), LIMITS.quote) + '"]';
    return !path ? seg : seg[0] === '[' ? path + seg : path + '.' + seg;
  }
  const idx = (path, i) => path + '[' + i + ']';

  /* A refusal. read() catches it and turns it into { ok: false, step, reason }. */
  function Reject(step, reason) { this.step = step; this.reason = cut(reason, LIMITS.reason); }
  let step = '';
  function fail(path, msg) { throw new Reject(step, path ? path + ': ' + msg : msg); }

  /* ---- Bytes: UTF-8, base64 ------------------------------------------------------------------- */

  function utf8Length(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function utf8(s) {
    const out = new Uint8Array(utf8Length(s));
    let o = 0;
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
      else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out[o++] = c;
      else if (c < 0x800) { out[o++] = 0xc0 | (c >> 6); out[o++] = 0x80 | (c & 63); }
      else if (c < 0x10000) { out[o++] = 0xe0 | (c >> 12); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
      else { out[o++] = 0xf0 | (c >> 18); out[o++] = 0x80 | ((c >> 12) & 63); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
    }
    return out;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64_FORM = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  /* Strict base64: padded, and with the unused bits of the last character zero, so each byte
     string has one spelling. Returns null for anything else. */
  function base64(s) {
    if (typeof s !== 'string' || !B64_FORM.test(s)) return null;
    const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0, body = s.slice(0, s.length - pad);
    const last = body.length ? B64.indexOf(body[body.length - 1]) : 0;
    if ((pad === 2 && (last & 15)) || (pad === 1 && (last & 3))) return null;
    const out = new Uint8Array((s.length / 4) * 3 - pad);
    let bits = 0, n = 0, o = 0;
    for (let i = 0; i < body.length; i++) {
      bits = (bits << 6) | B64.indexOf(body[i]); n += 6;
      if (n >= 8) { n -= 8; out[o++] = (bits >> n) & 255; }
    }
    return out;
  }

  /* ---- The canonical form, and what is signed ------------------------------------------------ */

  /* RFC 8785 for the values a pack can hold: no whitespace, object keys sorted by UTF-16 code
     units at every level, strings and numbers written as JSON.stringify writes them. Throws a
     TypeError on anything JSON cannot hold. */
  function canonical(v) {
    if (v === null) return 'null';
    switch (typeof v) {
      case 'boolean': return v ? 'true' : 'false';
      case 'number': if (!Number.isFinite(v)) throw new TypeError('canonical: a number must be finite'); return JSON.stringify(v);
      case 'string': return JSON.stringify(v);
      case 'object': {
        if (Array.isArray(v)) { let s = '['; for (let i = 0; i < v.length; i++) s += (i ? ',' : '') + canonical(v[i]); return s + ']'; }
        const pr = Object.getPrototypeOf(v);
        if (pr !== null && Object.getPrototypeOf(pr) !== null) throw new TypeError('canonical: only plain objects, arrays, strings, finite numbers, booleans and null');
        const ks = Object.keys(v).sort();
        let s = '{';
        for (let i = 0; i < ks.length; i++) s += (i ? ',' : '') + JSON.stringify(ks[i]) + ':' + canonical(v[ks[i]]);
        return s + '}';
      }
    }
    throw new TypeError('canonical: not a JSON value');
  }
  /* The exact bytes a pack's signature covers: PREFIX, then the canonical form of the pack, in UTF-8. */
  const message = pack => utf8(PREFIX + canonical(pack));

  /* ---- Step 2: the text as JSON --------------------------------------------------------------- */

  /* Walks the raw text once before it is parsed: refuses nesting deeper than the limit and an
     object that names a key twice. Returns the problem, or '' to go on. Malformed JSON is left
     for JSON.parse to refuse. */
  function scan(text) {
    const stack = [];
    for (let i = 0, n = text.length; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        let j = i + 1;
        while (j < n) { const d = text.charCodeAt(j); if (d === 0x5c) j += 2; else if (d === 0x22) break; else j++; }
        if (j >= n) return '';
        const top = stack[stack.length - 1];
        if (top && top.keys && top.want) {
          let k;
          try { k = JSON.parse(text.slice(i, j + 1)); } catch (e) { return ''; }
          if (top.keys.has(k)) return 'the key ' + quote(k) + ' appears twice in one object';
          top.keys.add(k); top.want = false;
        }
        i = j;
      } else if (c === 0x7b || c === 0x5b) {
        if (stack.length >= LIMITS.depth) return 'nested deeper than ' + LIMITS.depth + ' levels';
        stack.push(c === 0x7b ? { keys: new Set(), want: true } : { keys: null, want: false });
      } else if (c === 0x7d || c === 0x5d) stack.pop();
      else if (c === 0x2c) { const top = stack[stack.length - 1]; if (top && top.keys) top.want = true; }
    }
    return '';
  }
  /* Every number finite, below 1,000,000 in size and with at most 3 decimals; every string and
     key well-formed UTF-16; no key that could reach an object's prototype. */
  function sweep(v, path) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) >= 1e6 || Math.round(v * 1000) / 1000 !== v) fail(path || 'the file', 'a number must be finite, below 1,000,000 in size and have at most 3 decimals');
    } else if (typeof v === 'string') {
      if (LONE.test(v)) fail(path || 'the file', 'a string holds an unpaired surrogate');
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) sweep(v[i], idx(path, i));
    } else if (v !== null && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (FORBIDDEN.includes(k)) fail(key(path, k), 'this key is not allowed anywhere in a pack');
        if (LONE.test(k)) fail(path || 'the file', 'a key holds an unpaired surrogate');
        sweep(v[k], key(path, k));
      }
    }
  }

  /* ---- Step 5: every field against its table --------------------------------------------------- */

  function obj(v, path, allowed, required) {
    if (!isObj(v)) fail(path, 'must be an object');
    for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(key(path, k), 'is not a field here');
    for (const k of required) if (!has(v, k)) fail(key(path, k), 'is missing');
    return v;
  }
  function arr(v, path, min, max) {
    if (!Array.isArray(v)) fail(path, 'must be an array');
    if (v.length < min || v.length > max) fail(path, 'must hold ' + min + ' to ' + max + ' entries, not ' + v.length);
    return v;
  }
  /* An object of entries whose keys match re: at least min, at most max. */
  function table(v, path, re, min, max, what) {
    if (!isObj(v)) fail(path, 'must be an object');
    const ks = Object.keys(v);
    if (ks.length < min || ks.length > max) fail(path, 'must hold ' + min + ' to ' + max + ' ' + what + ', not ' + ks.length);
    for (const k of ks) if (!re.test(k)) fail(key(path, k), 'is not a valid id');
    return ks;
  }
  function oneOf(v, path, list) { if (!list.includes(v)) fail(path, 'must be one of ' + list.map(quote).join(', ')); }
  function num(v, path, lo, hi) {
    if (typeof v !== 'number' || v < lo || v > hi) fail(path, 'must be a number from ' + lo + ' to ' + hi);
    return v;
  }
  function eighth(v, path, lo, hi) {
    if (typeof v !== 'number' || !Number.isInteger(v * 8) || v < lo || v > hi) fail(path, 'must be a multiple of 1/8 from ' + lo + ' to ' + hi);
    return v;
  }
  function int(v, path, lo, hi) {
    if (!Number.isInteger(v) || v < lo || v > hi) fail(path, 'must be a whole number from ' + lo + ' to ' + hi);
    return v;
  }
  function text(v, path, min, max) {
    if (typeof v !== 'string') fail(path, 'must be a string');
    const n = Array.from(v).length;
    if (n < min || n > max) fail(path, 'must be ' + min + ' to ' + max + ' characters, not ' + n);
    if (CONTROL.test(v)) fail(path, 'must be one line, with no control characters');
  }
  function id(v, path, re) { if (typeof v !== 'string' || !re.test(v)) fail(path, 'must be an id matching ' + re.source); }

  /* A scalar: a number, or a term object { c, name: coefficient, ... }. lo and hi bound c. */
  function scalar(v, path, lo, hi) {
    if (typeof v === 'number') { eighth(v, path, lo, hi); return; }
    if (!isObj(v)) fail(path, 'must be a number or a term object');
    for (const k of Object.keys(v)) {
      if (k === 'c') eighth(v.c, key(path, 'c'), lo, hi);
      else if (!TERM_NAME.test(k)) fail(key(path, k), 'is not a name');
      else eighth(v[k], key(path, k), -8, 8);
    }
  }
  /* A point. ctx 'worn' allows the anchored and framed forms; elsewhere only a pair. */
  function point(v, path, ctx) {
    if (Array.isArray(v)) {
      if (v.length !== 2) fail(path, 'must be a pair [x, y]');
      scalar(v[0], idx(path, 0), -512, 512); scalar(v[1], idx(path, 1), -512, 512);
      return;
    }
    if (!isObj(v)) fail(path, 'must be a point');
    if (ctx !== 'worn') fail(path, 'must be a pair [x, y] here');
    if (has(v, 'frame')) {
      obj(v, path, ['frame', 's', 'p', 'x', 'y'], ['frame', 's', 'p']);
      if (v.frame !== 'main') fail(key(path, 'frame'), 'must be "main"');
      eighth(v.s, key(path, 's'), -400, 400); eighth(v.p, key(path, 'p'), -400, 400);
      if (has(v, 'x')) scalar(v.x, key(path, 'x'), -512, 512);
      if (has(v, 'y')) scalar(v.y, key(path, 'y'), -512, 512);
      return;
    }
    obj(v, path, ['at', 'x', 'y'], ['at', 'x', 'y']);
    if (typeof v.at !== 'string' || !ANCHOR_NAME.test(v.at)) fail(key(path, 'at'), 'must be an anchor name');
    scalar(v.x, key(path, 'x'), -512, 512); scalar(v.y, key(path, 'y'), -512, 512);
  }
  /* A pair of plain numbers. */
  function pair(v, path, lo, hi) {
    if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be a pair [x, y]');
    eighth(v[0], idx(path, 0), lo, hi); eighth(v[1], idx(path, 1), lo, hi);
  }
  function colour(v, path, literal) {
    if (typeof v === 'string') {
      if (HEX.test(v) || (!literal && REF.test(v))) return;
      fail(path, literal ? 'must be a hex colour such as "#3f74e0" or a translucent colour' : 'must be a hex colour, a reference such as "@base.k" or a translucent colour');
    }
    if (!isObj(v)) fail(path, 'must be a colour');
    obj(v, path, ['rgb', 'a'], ['rgb', 'a']);
    if (typeof v.rgb !== 'string' || !HEX.test(v.rgb)) fail(key(path, 'rgb'), 'must be a hex colour');
    num(v.a, key(path, 'a'), 0.01, 1);
  }
  function bands(v, path, literal) {
    arr(v, path, 1, LIMITS.bands);
    let prev = 0;
    for (let i = 0; i < v.length; i++) {
      const b = v[i], p = idx(path, i);
      if (!Array.isArray(b) || b.length !== 2) fail(p, 'must be a [fraction, colour] pair');
      if (typeof b[0] !== 'number' || !(b[0] > prev) || b[0] > 1) fail(idx(p, 0), 'fractions must rise from above 0 to 1');
      prev = b[0];
      colour(b[1], idx(p, 1), literal);
    }
    if (prev !== 1) fail(path, 'the last fraction must be 1');
  }
  function fill(v, path, literal) { if (Array.isArray(v)) bands(v, path, literal); else colour(v, path, literal); }
  function clip(v, path) {
    if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be [top, bottom]');
    for (let i = 0; i < 2; i++) if (v[i] !== null) scalar(v[i], idx(path, i), -512, 512);
  }
  function box(v, path, hi) {
    if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be [w, h]');
    int(v[0], idx(path, 0), 1, hi); int(v[1], idx(path, 1), 1, hi);
  }

  const SHAPE_KEYS = { rect: ['p', 'w', 'h', 'fill'], ell: ['p', 'rx', 'ry', 'fill', 'clip'], rrect: ['p', 'w', 'h', 'r', 'fill', 'clip'],
    poly: ['pts', 'fill', 'dir'], strip: ['p0', 'p1', 'hw0', 'hw1', 'fill'], pix: ['p', 'rows', 'key'] };
  const SHAPE_REQ = { rect: ['p', 'w', 'h', 'fill'], ell: ['p', 'rx', 'ry', 'fill'], rrect: ['p', 'w', 'h', 'r', 'fill'],
    poly: ['pts', 'fill', 'dir'], strip: ['p0', 'p1', 'hw0', 'hw1', 'fill'], pix: ['p', 'rows', 'key'] };
  /* A shape. ctx is 'worn' (a part of an item), 'rest' (a rest view) or 'decor' (a decoration). */
  function shape(s, path, ctx) {
    if (!isObj(s)) fail(path, 'must be an object');
    if (!KINDS.includes(s.k)) fail(key(path, 'k'), 'must be one of ' + KINDS.map(quote).join(', '));
    const extra = ctx === 'worn' ? ['at'] : ctx === 'decor' ? ['g'] : [];
    obj(s, path, ['k'].concat(SHAPE_KEYS[s.k], extra), ['k'].concat(SHAPE_REQ[s.k]));
    if (has(s, 'at') && (typeof s.at !== 'string' || !ANCHOR_NAME.test(s.at))) fail(key(path, 'at'), 'must be an anchor name');
    if (has(s, 'g')) id(s.g, key(path, 'g'), LOCAL_ID);
    if (has(s, 'p')) point(s.p, key(path, 'p'), ctx);
    if (has(s, 'w')) scalar(s.w, key(path, 'w'), 0, 512);
    if (has(s, 'h')) scalar(s.h, key(path, 'h'), 0, 512);
    if (has(s, 'r')) scalar(s.r, key(path, 'r'), 0, 256);
    if (has(s, 'rx')) scalar(s.rx, key(path, 'rx'), 0, 256);
    if (has(s, 'ry')) scalar(s.ry, key(path, 'ry'), 0, 256);
    if (has(s, 'clip')) clip(s.clip, key(path, 'clip'));
    if (has(s, 'p0')) point(s.p0, key(path, 'p0'), ctx);
    if (has(s, 'p1')) point(s.p1, key(path, 'p1'), ctx);
    if (has(s, 'hw0')) scalar(s.hw0, key(path, 'hw0'), 0, 64);
    if (has(s, 'hw1')) scalar(s.hw1, key(path, 'hw1'), 0, 64);
    if (has(s, 'fill')) fill(s.fill, key(path, 'fill'), false);
    if (s.k === 'poly') {
      arr(s.pts, key(path, 'pts'), 3, LIMITS.polyPoints);
      s.pts.forEach((q, i) => point(q, idx(key(path, 'pts'), i), ctx));
      oneOf(s.dir, key(path, 'dir'), ['rows', 'cols', 'frame']);
    }
    if (s.k === 'pix') pixFields(s, path, (v, p) => colour(v, p, false));
  }
  /* A pix shape's rows and key; col checks each colour of the key. */
  function pixFields(s, path, col) {
    const rp = key(path, 'rows');
    arr(s.rows, rp, 1, LIMITS.pixSide);
    s.rows.forEach((r, i) => {
      if (typeof r !== 'string' || !/^[\x21-\x7e]+$/.test(r)) fail(idx(rp, i), 'must be a string of printable characters');
      if (r.length > LIMITS.pixSide) fail(idx(rp, i), 'must be at most ' + LIMITS.pixSide + ' characters');
      if (r.length !== s.rows[0].length) fail(idx(rp, i), 'must be as long as the first row');
    });
    if (s.rows.length * s.rows[0].length > LIMITS.pixShape) fail(rp, 'must hold at most ' + LIMITS.pixShape + ' pixels');
    const kp = key(path, 'key'), ks = isObj(s.key) ? Object.keys(s.key) : null;
    if (!ks) fail(kp, 'must be an object');
    if (ks.length < 1 || ks.length > LIMITS.pixKeys) fail(kp, 'must map 1 to ' + LIMITS.pixKeys + ' characters, not ' + ks.length);
    for (const k of ks) {
      if (!/^[\x21-\x7e]$/.test(k) || k === '.') fail(key(kp, k), 'must be one printable character other than "."');
      col(s.key[k], key(kp, k));
    }
  }
  function parts(v, path) {
    arr(v, path, 1, LIMITS.parts);
    v.forEach((pt, i) => {
      const p = idx(path, i);
      obj(pt, p, ['at', 'side', 'shapes'], ['at', 'shapes']);
      if (typeof pt.at !== 'string' || !ANCHOR_NAME.test(pt.at)) fail(key(p, 'at'), 'must be an anchor name');
      if (has(pt, 'side')) oneOf(pt.side, key(p, 'side'), ['L', 'R']);
      arr(pt.shapes, key(p, 'shapes'), 1, LIMITS.partShapes);
      pt.shapes.forEach((s, j) => shape(s, idx(key(p, 'shapes'), j), 'worn'));
    });
  }
  function restView(v, path, slot) {
    if (slot === 'plume') obj(v, path, ['shapes'], ['shapes']);
    else {
      obj(v, path, slot === 'helmet' ? ['fits', 'box', 'mounts', 'shapes'] : ['fits', 'box', 'shapes'], ['fits', 'box', 'shapes']);
      oneOf(v.fits, key(path, 'fits'), FITS);
      box(v.box, key(path, 'box'), LIMITS.box);
      if (has(v, 'mounts')) { obj(v.mounts, key(path, 'mounts'), ['plume'], ['plume']); point(v.mounts.plume, key(key(path, 'mounts'), 'plume'), 'rest'); }
    }
    arr(v.shapes, key(path, 'shapes'), 1, LIMITS.restShapes);
    v.shapes.forEach((s, i) => shape(s, idx(key(path, 'shapes'), i), 'rest'));
  }
  const ITEM_KEYS = { helmet: ['mounts', 'rest'], hair: ['views'], plume: ['rest'], off: ['rest', 'hold', 'face'], main: ['grip', 'blade'] };
  const ITEM_REQ = { main: ['grip'], off: ['hold', 'face'] };
  function item(v, path) {
    if (!isObj(v)) fail(path, 'must be an object');
    if (!has(v, 'slot')) fail(key(path, 'slot'), 'is missing');
    oneOf(v.slot, key(path, 'slot'), SLOTS);
    if (v.slot === 'companion') return;
    obj(v, path, ['slot', 'name', 'parts'].concat(ITEM_KEYS[v.slot] || []), ['slot', 'name', 'parts'].concat(ITEM_REQ[v.slot] || []));
    text(v.name, key(path, 'name'), 1, 48);
    parts(v.parts, key(path, 'parts'));
    if ((v.slot === 'arms' || v.slot === 'gauntlets')) v.parts.forEach((pt, i) => { if (!has(pt, 'side')) fail(key(idx(key(path, 'parts'), i), 'side'), 'is required in ' + v.slot); });
    if (has(v, 'mounts')) { const mp = key(path, 'mounts'); obj(v.mounts, mp, ['plume'], ['plume']); point(v.mounts.plume, key(mp, 'plume'), 'mount'); }
    if (has(v, 'views')) { const vp = key(path, 'views'); obj(v.views, vp, ['helmeted'], ['helmeted']); parts(v.views.helmeted, key(vp, 'helmeted')); }
    if (has(v, 'rest')) restView(v.rest, key(path, 'rest'), v.slot);
    if (has(v, 'grip')) {
      const gp = key(path, 'grip');
      obj(v.grip, gp, ['kind', 'hands'], ['kind', 'hands']);
      oneOf(v.grip.kind, key(gp, 'kind'), ['two', 'one']);
      arr(v.grip.hands, key(gp, 'hands'), 1, 2).forEach((s, i) => eighth(s, idx(key(gp, 'hands'), i), -400, 400));
    }
    if (has(v, 'blade')) {
      const bp = key(path, 'blade');
      obj(v.blade, bp, ['from', 'to', 'half'], ['from', 'to', 'half']);
      eighth(v.blade.from, key(bp, 'from'), -400, 400); eighth(v.blade.to, key(bp, 'to'), -400, 400); eighth(v.blade.half, key(bp, 'half'), 0, 400);
    }
    if (has(v, 'hold')) pair(v.hold, key(path, 'hold'), -512, 512);
    if (has(v, 'face')) {
      const fp = key(path, 'face');
      if (!Array.isArray(v.face) || v.face.length !== 4) fail(fp, 'must be [x, y, w, h]');
      eighth(v.face[0], idx(fp, 0), -512, 512); eighth(v.face[1], idx(fp, 1), -512, 512);
      eighth(v.face[2], idx(fp, 2), 0, 512); eighth(v.face[3], idx(fp, 3), 0, 512);
    }
  }
  /* A track of keyframes. time checks a key's time: from 0 to 1 of the period unless given. */
  function track(t, path, time) {
    if (!isObj(t)) fail(path, 'must be an object');
    let vk;
    if (has(t, 'pal')) {
      obj(t, path, ['pal', 'ease', 'keys'], ['pal', 'ease', 'keys']);
      if (typeof t.pal !== 'string' || !PAL.test(t.pal)) fail(key(path, 'pal'), 'must name a palette entry as "set.entry"');
      oneOf(t.ease, key(path, 'ease'), EASES);
      vk = (v, p) => { if (typeof v !== 'string' || !HEX.test(v)) fail(p, 'must be a hex colour'); };
    } else {
      obj(t, path, ['g', 'ch', 'ease', 'keys'], ['g', 'ch', 'keys']);
      id(t.g, key(path, 'g'), LOCAL_ID);
      oneOf(t.ch, key(path, 'ch'), CHANNELS);
      if (t.ch === 'show') { if (has(t, 'ease') && t.ease !== 'step') fail(key(path, 'ease'), 'must be "step" on a show track'); }
      else if (!has(t, 'ease')) fail(key(path, 'ease'), 'is missing');
      else oneOf(t.ease, key(path, 'ease'), EASES);
      vk = t.ch === 'dx' || t.ch === 'dy' ? (v, p) => eighth(v, p, -512, 512)
        : t.ch === 'scale' ? (v, p) => num(v, p, 0.25, 4)
          : t.ch === 'alpha' ? (v, p) => num(v, p, 0, 1) : (v, p) => int(v, p, 0, 1);
    }
    const kp = key(path, 'keys');
    let prev = -1;
    arr(t.keys, kp, 1, LIMITS.keys).forEach((k, i) => {
      const p = idx(kp, i);
      if (!Array.isArray(k) || k.length !== 2) fail(p, 'must be a [time, value] pair');
      if (time) time(k[0], idx(p, 0)); else num(k[0], idx(p, 0), 0, 1);
      if (!(k[0] > prev)) fail(idx(p, 0), 'times must rise');
      prev = k[0];
      vk(k[1], idx(p, 1));
    });
  }
  function decoration(v, path) {
    obj(v, path, ['name', 'fits', 'box', 'groups', 'shapes', 'anim'], ['name', 'fits', 'box', 'shapes']);
    text(v.name, key(path, 'name'), 1, 48);
    const fp = key(path, 'fits');
    arr(v.fits, fp, 1, FITS.length).forEach((f, i) => { oneOf(f, idx(fp, i), FITS); if (v.fits.indexOf(f) !== i) fail(idx(fp, i), 'appears twice'); });
    box(v.box, key(path, 'box'), 512);
    if (has(v, 'groups')) {
      const gp = key(path, 'groups');
      for (const g of table(v.groups, gp, LOCAL_ID, 0, LIMITS.groups, 'groups')) {
        obj(v.groups[g], key(gp, g), ['pivot'], ['pivot']);
        pair(v.groups[g].pivot, key(key(gp, g), 'pivot'), -512, 512);
      }
    }
    arr(v.shapes, key(path, 'shapes'), 1, LIMITS.decorShapes).forEach((s, i) => shape(s, idx(key(path, 'shapes'), i), 'decor'));
    if (has(v, 'anim')) {
      const ap = key(path, 'anim'), a = v.anim;
      obj(a, ap, ['period', 'loop', 'phase', 'tracks'], ['period', 'loop', 'tracks']);
      num(a.period, key(ap, 'period'), 0.2, 600);
      if (typeof a.loop !== 'boolean') fail(key(ap, 'loop'), 'must be true or false');
      if (has(a, 'phase')) num(a.phase, key(ap, 'phase'), 0, 1);
      arr(a.tracks, key(ap, 'tracks'), 1, LIMITS.tracks).forEach((t, i) => track(t, idx(key(ap, 'tracks'), i)));
    }
  }

  const PACK_KEYS = ['id', 'name', 'version', 'format', 'licence', 'provides', 'palettes', 'swatches', 'builds', 'items', 'decorations', 'defaults', 'companions', 'ext'];
  /* Format 1.1's sections, each listed in provides when it holds anything. */
  const WORLD_SECTIONS = ['scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'sounds', 'stamps'];
  const PACK_KEYS_11 = PACK_KEYS.concat(WORLD_SECTIONS), PROVIDES_11 = PROVIDES.concat(WORLD_SECTIONS);
  /* Whether a pack is of format 1.1, which the format step has already held to [1, 0] or [1, 1]. */
  const is11 = pack => pack.format[1] >= 1;
  function fields(pack) {
    const P = 'pack', m1 = is11(pack), PV = m1 ? PROVIDES_11 : PROVIDES;
    obj(pack, P, m1 ? PACK_KEYS_11 : PACK_KEYS, ['id', 'name', 'version', 'format', 'licence', 'provides']);
    id(pack.id, key(P, 'id'), PACK_ID);
    text(pack.name, key(P, 'name'), 1, 48);
    if (typeof pack.version !== 'string' || !VERSION.test(pack.version)) fail(key(P, 'version'), 'must be major.minor.patch, each 0 to 999');
    text(pack.licence, key(P, 'licence'), 1, 200);
    const pp = key(P, 'provides');
    arr(pack.provides, pp, 0, PV.length).forEach((s, i) => { oneOf(s, idx(pp, i), PV); if (pack.provides.indexOf(s) !== i) fail(idx(pp, i), 'appears twice'); });
    if (has(pack, 'palettes')) {
      const sp = key(P, 'palettes');
      for (const s of table(pack.palettes, sp, SET_NAME, 0, LIMITS.sets, 'sets')) {
        if (s === 'base' || has(USER_SETS, s) || (m1 && WORLD_SETS.includes(s))) fail(key(sp, s), 'is a reserved set name');
        for (const e of table(pack.palettes[s], key(sp, s), ENTRY_NAME, 1, LIMITS.setEntries, 'entries')) fill(pack.palettes[s][e], key(key(sp, s), e), false);
      }
    }
    if (has(pack, 'swatches')) {
      const wp = key(P, 'swatches');
      obj(pack.swatches, wp, Object.keys(USER_SETS), []);
      for (const set of Object.keys(pack.swatches)) {
        const sp = key(wp, set), want = USER_SETS[set];
        for (const sw of table(pack.swatches[set], sp, LOCAL_ID, 1, LIMITS.swatches, 'swatches')) {
          const p = key(sp, sw), v = pack.swatches[set][sw];
          obj(v, p, ['name', 'entries'], ['name', 'entries']);
          text(v.name, key(p, 'name'), 1, 48);
          obj(v.entries, key(p, 'entries'), Object.keys(want), Object.keys(want));
          for (const e of Object.keys(want)) {
            if (want[e] === 'bands') { if (!Array.isArray(v.entries[e])) fail(key(key(p, 'entries'), e), 'must be a band list'); bands(v.entries[e], key(key(p, 'entries'), e), true); }
            else colour(v.entries[e], key(key(p, 'entries'), e), true);
          }
        }
      }
    }
    const base = pack.id === BASE_ID;
    if (has(pack, 'builds')) {
      const bp = key(P, 'builds');
      // from format 1.1 any pack may carry builds: a world's own bodies
      if (!base && !m1) fail(bp, 'only the base pack, ' + BASE_ID + ', may carry builds');
      for (const b of table(pack.builds, bp, LOCAL_ID, 1, LIMITS.builds, 'builds')) {
        const p = key(bp, b), v = pack.builds[b];
        obj(v, p, ['name', 'm', 'head'], ['name', 'm', 'head']);
        text(v.name, key(p, 'name'), 1, 32);
        const names = MEASURES.map(m => m[0]);
        obj(v.m, key(p, 'm'), names, names);
        for (const m of MEASURES) int(v.m[m[0]], key(key(p, 'm'), m[0]), m[2], m[3]);
        id(v.head, key(p, 'head'), LOCAL_ID);
      }
    }
    if (has(pack, 'defaults')) {
      const dp = key(P, 'defaults'), d = pack.defaults;
      if (!base) fail(dp, 'only the base pack, ' + BASE_ID + ', may carry defaults');
      obj(d, dp, ['build', 'items', 'swatches'], ['build', 'items', 'swatches']);
      id(d.build, key(dp, 'build'), LOCAL_ID);
      obj(d.items, key(dp, 'items'), DEFAULT_SLOTS.concat(['back', 'off']), DEFAULT_SLOTS);
      for (const s of Object.keys(d.items)) id(d.items[s], key(key(dp, 'items'), s), LOCAL_ID);
      obj(d.swatches, key(dp, 'swatches'), Object.keys(USER_SETS), Object.keys(USER_SETS));
      for (const s of Object.keys(d.swatches)) id(d.swatches[s], key(key(dp, 'swatches'), s), LOCAL_ID);
    }
    if (base && (!has(pack, 'builds') || !has(pack, 'defaults'))) fail(P, 'the base pack must carry builds and defaults');
    if (has(pack, 'items')) {
      const ip = key(P, 'items');
      for (const i of table(pack.items, ip, LOCAL_ID, 0, Infinity, 'items')) item(pack.items[i], key(ip, i));
    }
    if (has(pack, 'decorations')) {
      const dp = key(P, 'decorations');
      for (const d of table(pack.decorations, dp, LOCAL_ID, 0, Infinity, 'decorations')) decoration(pack.decorations[d], key(dp, d));
    }
    if (has(pack, 'companions') && !isObj(pack.companions)) fail(key(P, 'companions'), 'must be an object');
    if (has(pack, 'ext') && !isObj(pack.ext)) fail(key(P, 'ext'), 'must be an object');
    if (m1) worldFields(pack);
  }

  /* ---- Walking what step 5 has passed ----------------------------------------------------------- */

  const live = items => Object.keys(items || {}).filter(i => items[i].slot !== 'companion');
  function eachPoint(s, fn, path) {
    for (const f of ['p', 'p0', 'p1']) if (has(s, f)) fn(s[f], key(path, f));
    if (s.k === 'poly') s.pts.forEach((q, i) => fn(q, idx(key(path, 'pts'), i)));
  }
  /* Calls fn(scalar, path) for every scalar in a shape. */
  function eachScalar(s, fn, path) {
    eachPoint(s, (q, p) => {
      if (Array.isArray(q)) { fn(q[0], idx(p, 0)); fn(q[1], idx(p, 1)); }
      else { if (has(q, 'x')) fn(q.x, key(p, 'x')); if (has(q, 'y')) fn(q.y, key(p, 'y')); }
    }, path);
    for (const f of ['w', 'h', 'r', 'rx', 'ry', 'hw0', 'hw1']) if (has(s, f)) fn(s[f], key(path, f));
    if (has(s, 'clip')) s.clip.forEach((c, i) => { if (c !== null) fn(c, idx(key(path, 'clip'), i)); });
  }
  /* Calls fn(colour, path, single) for every colour in a fill; single is true where the fill must
     be one colour (inside a band list). */
  function eachColour(f, fn, path) {
    if (Array.isArray(f)) f.forEach((b, i) => fn(b[1], idx(idx(path, i), 1), true));
    else fn(f, path, false);
  }

  /* ---- Step 6: references ---------------------------------------------------------------------- */

  /* The kind of an entry a reference names: 'colour', 'bands', or null when it does not exist. */
  function refKind(pack, set, entry) {
    if (set === 'base') return has(BASE, entry) ? (Array.isArray(BASE[entry]) ? 'bands' : 'colour') : null;
    if (has(USER_SETS, set)) return has(USER_SETS[set], entry) ? USER_SETS[set][entry] : null;
    if (pack.palettes && has(pack.palettes, set) && has(pack.palettes[set], entry)) {
      const v = pack.palettes[set][entry];
      if (Array.isArray(v)) return 'bands';
      if (typeof v === 'string' && v[0] === '@') { const m = REF.exec(v); return refKind(pack, m[1], m[2]); }
      return 'colour';
    }
    return null;
  }
  function refColour(pack, v, path, single, baseOnly) {
    if (typeof v !== 'string' || v[0] !== '@') return;
    const m = REF.exec(v), set = m[1];
    if (baseOnly && set !== 'base') fail(path, 'a palette of the pack may refer only to @base');
    if (set !== 'base' && !has(USER_SETS, set) && !(pack.palettes && has(pack.palettes, set))) fail(path, 'names a palette set, ' + quote(set) + ', that does not exist');
    const kind = refKind(pack, set, m[2]);
    if (kind === null) fail(path, 'names an entry, ' + quote(m[2]) + ', that set ' + quote(set) + ' does not have');
    if (single && kind === 'bands') fail(path, 'needs a single colour here, and ' + quote(v) + ' is a band list');
  }
  /* The anchor a name means in a part of this slot drawn for side (or no side), or null. */
  function anchorAllowed(slot, name, side) {
    if (!SLOT_AT[slot].includes(name)) return false;
    return !has(SIDED, name) || !!side;
  }
  function refShapes(pack, shapes, path, ctx) {
    shapes.forEach((s, i) => {
      const sp = idx(path, i);
      if (ctx.kind === 'worn') {
        if (has(s, 'at') && !anchorAllowed(ctx.slot, s.at, ctx.side)) fail(key(sp, 'at'), badAnchor(ctx, s.at));
        eachPoint(s, (q, p) => {
          if (isObj(q) && has(q, 'at') && !anchorAllowed(ctx.slot, q.at, ctx.side)) fail(key(p, 'at'), badAnchor(ctx, q.at));
          if (isObj(q) && has(q, 'frame') && ctx.slot !== 'main') fail(p, 'a framed point is allowed only in the main slot');
        }, sp);
      }
      // the weapon's frame exists only for the parts of a main item: not in rest views or decorations
      if (s.k === 'poly' && s.dir === 'frame' && !(ctx.kind === 'worn' && ctx.slot === 'main')) fail(key(sp, 'dir'), '"frame" is allowed only in a part of a main item');
      if (has(s, 'g') && !(ctx.groups && has(ctx.groups, s.g))) fail(key(sp, 'g'), 'names a group, ' + quote(s.g) + ', that the decoration does not declare');
      eachScalar(s, (v, p) => names(v, p, ctx), sp);
      if (has(s, 'fill')) eachColour(s.fill, (c, p, single) => refColour(pack, c, p, single, false), key(sp, 'fill'));
      if (s.k === 'pix') {
        for (const k of Object.keys(s.key)) refColour(pack, s.key[k], key(key(sp, 'key'), k), true, false);
        s.rows.forEach((r, j) => { for (const ch of r) if (ch !== '.' && !has(s.key, ch)) fail(idx(key(sp, 'rows'), j), 'uses ' + quote(ch) + ', which the key does not map'); });
      }
    });
  }
  function badAnchor(ctx, name) {
    if (!SLOT_AT[ctx.slot].includes(name)) return 'the slot ' + ctx.slot + ' does not hang anything on ' + quote(name);
    return quote(name) + ' needs a part drawn for one side';
  }
  const WHERE = { decor: 'a decoration', rest: 'a rest view', mount: 'a mount point' };
  /* The names a scalar may lean on, by where it is: anything in a worn part, the build's
     differences in a rest view or a mount, nothing in a decoration. */
  function names(v, path, ctx) {
    if (!isObj(v)) return;
    for (const k of Object.keys(v)) {
      if (k === 'c') continue;
      const ok = DIFFS.includes(k) ? ctx.kind !== 'decor'
        : VALUES.includes(k) ? ctx.kind === 'worn'
          : k === 'step' ? ctx.kind === 'worn' && !!ctx.side : null;
      if (ok === null) fail(key(path, k), 'is not a named value');
      if (!ok) fail(key(path, k), ctx.kind === 'worn' ? '"step" needs a part drawn for one side' : 'cannot be used in ' + WHERE[ctx.kind]);
    }
  }
  function refParts(pack, list, path, slot) {
    list.forEach((pt, i) => {
      const p = idx(path, i);
      if (!anchorAllowed(slot, pt.at, pt.side)) fail(key(p, 'at'), badAnchor({ slot }, pt.at));
      refShapes(pack, pt.shapes, key(p, 'shapes'), { kind: 'worn', slot, side: pt.side, at: pt.at });
    });
  }
  function references(pack) {
    const P = 'pack';
    if (pack.palettes) for (const s of Object.keys(pack.palettes)) for (const e of Object.keys(pack.palettes[s]))
      eachColour(pack.palettes[s][e], (c, p, single) => refColour(pack, c, p, single, true), key(key(key(P, 'palettes'), s), e));
    const items = pack.items || {};
    for (const i of live(items)) {
      const v = items[i], ip = key(key(P, 'items'), i);
      refParts(pack, v.parts, key(ip, 'parts'), v.slot);
      if (v.views) refParts(pack, v.views.helmeted, key(key(ip, 'views'), 'helmeted'), v.slot);
      if (v.mounts) v.mounts.plume.forEach((c, j) => names(c, idx(key(key(ip, 'mounts'), 'plume'), j), { kind: 'mount' }));
      if (v.rest) {
        const rp = key(ip, 'rest');
        if (v.rest.mounts) v.rest.mounts.plume.forEach((c, j) => names(c, idx(key(key(rp, 'mounts'), 'plume'), j), { kind: 'mount' }));
        refShapes(pack, v.rest.shapes, key(rp, 'shapes'), { kind: 'rest' });
      }
    }
    if (pack.builds) for (const b of Object.keys(pack.builds)) {
      const h = pack.builds[b].head, hp = key(key(key(P, 'builds'), b), 'head');
      if (!has(items, h)) fail(hp, 'names an item, ' + quote(h) + ', that the pack does not have');
      if (items[h].slot !== 'head') fail(hp, 'names ' + quote(h) + ', whose slot is ' + items[h].slot + ', not head');
    }
    if (pack.defaults) {
      const d = pack.defaults, dp = key(P, 'defaults');
      if (!has(pack.builds, d.build)) fail(key(dp, 'build'), 'names a build, ' + quote(d.build) + ', that the pack does not have');
      for (const s of Object.keys(d.items)) {
        const it = d.items[s], p = key(key(dp, 'items'), s);
        if (!has(items, it)) fail(p, 'names an item, ' + quote(it) + ', that the pack does not have');
        if (items[it].slot !== s) fail(p, 'names ' + quote(it) + ', whose slot is ' + items[it].slot + ', not ' + s);
      }
      for (const s of Object.keys(d.swatches)) {
        const sw = d.swatches[s];
        if (!(pack.swatches && has(pack.swatches, s) && has(pack.swatches[s], sw))) fail(key(key(dp, 'swatches'), s), 'names a ' + s + ' swatch, ' + quote(sw) + ', that the pack does not have');
      }
    }
    if (pack.decorations) for (const d of Object.keys(pack.decorations)) {
      const v = pack.decorations[d], dp = key(key(P, 'decorations'), d);
      refShapes(pack, v.shapes, key(dp, 'shapes'), { kind: 'decor', groups: v.groups || {} });
      if (v.anim) v.anim.tracks.forEach((t, i) => {
        const tp = idx(key(key(dp, 'anim'), 'tracks'), i);
        if (has(t, 'g') && !(v.groups && has(v.groups, t.g))) fail(key(tp, 'g'), 'names a group, ' + quote(t.g) + ', that the decoration does not declare');
        if (has(t, 'pal')) {
          const m = PAL.exec(t.pal), own = pack.palettes && has(pack.palettes, m[1]) ? pack.palettes[m[1]] : null;
          if (!own) fail(key(tp, 'pal'), 'must name a palette set of this pack, and ' + quote(m[1]) + ' is not one');
          if (!has(own, m[2])) fail(key(tp, 'pal'), 'names an entry, ' + quote(m[2]) + ', that set ' + quote(m[1]) + ' does not have');
          if (typeof own[m[2]] !== 'string' || !HEX.test(own[m[2]])) fail(key(tp, 'pal'), 'must name an entry that is a hex colour');
        }
      });
    }
    if (is11(pack)) worldReferences(pack);
  }

  /* ---- Step 7: rules that span fields ---------------------------------------------------------- */

  /* A linear form { c, k: { name: coefficient } } of a scalar, and its bounds over RANGE. */
  /* Format 1.1's two terms that are not named values, h (a hash of the tile's x, from 0 to mod - 1)
     and wave (a sine, from -amp to amp), go into add, the least and greatest they can add. A 1.0
     pack never reaches here with either, since the references step refuses them as names. */
  function form(v) {
    if (typeof v === 'number') return { c: v, k: {} };
    const f = { c: has(v, 'c') ? v.c : 0, k: {} };
    for (const n of Object.keys(v)) {
      if (n === 'c') continue;
      if (n === 'h' && Array.isArray(v.h)) f.add = addTo(f.add, [0, v.h[1] - 1], 1);
      else if (n === 'wave' && Array.isArray(v.wave)) f.add = addTo(f.add, [-Math.abs(v.wave[0]), Math.abs(v.wave[0])], 1);
      else f.k[n] = v[n];
    }
    return f;
  }
  /* The span a, plus the span b times s. */
  const addTo = (a, b, s) => { const x = a || [0, 0], lo = s * b[0], hi = s * b[1]; return [x[0] + Math.min(lo, hi), x[1] + Math.max(lo, hi)]; };
  function plus(a, b, sb) {
    const f = { c: a.c + sb * b.c, k: Object.assign({}, a.k) };
    for (const n of Object.keys(b.k)) f.k[n] = (f.k[n] || 0) + sb * b.k[n];
    if (a.add || b.add) f.add = addTo(a.add, b.add || [0, 0], sb);
    return f;
  }
  /* The least (hi false) or greatest (hi true) value of a form over the ranges of its names; a name
     in fixed takes that one value. */
  function bound(f, hi, fixed, R) {
    const T = R || RANGE;
    let s = f.c + (f.add ? f.add[hi ? 1 : 0] : 0);
    for (const n of Object.keys(f.k)) {
      const k = f.k[n];
      if (k === 0) continue;
      const r = fixed && has(fixed, n) ? [fixed[n], fixed[n]] : has(T, n) ? T[n] : null;
      if (!r) return hi ? Infinity : -Infinity;
      s += hi ? Math.max(k * r[0], k * r[1]) : Math.min(k * r[0], k * r[1]);
    }
    return s;
  }
  /* A form with a shift folded in: a number, or another form. */
  const shifted = (f, d) => (typeof d === 'number' ? { c: f.c + d, k: f.k } : plus(f, d, 1));
  /* The face box, around the head anchor: no helmet may leave it uncovered by skin. */
  const FACE_BOX = [-28, -20, 28, 20];
  function coversFace(s) {
    if (s.fill !== '@skin.face' || !['rect', 'rrect', 'ell'].includes(s.k) || !Array.isArray(s.p)) return false;
    const px = form(s.p[0]), py = form(s.p[1]);
    let x0, x1, y0, y1;
    if (s.k === 'ell') {
      const rx = form(s.rx), ry = form(s.ry);
      x0 = plus(px, rx, -1); x1 = plus(px, rx, 1); y0 = plus(py, ry, -1); y1 = plus(py, ry, 1);
    } else {
      x0 = px; x1 = plus(px, form(s.w), 1); y0 = py; y1 = plus(py, form(s.h), 1);
    }
    let top = bound(y0, true), bottom = bound(y1, false);
    if (s.clip && s.clip[0] !== null) top = Math.max(top, bound(form(s.clip[0]), true));
    if (s.clip && s.clip[1] !== null) bottom = Math.min(bottom, bound(form(s.clip[1]), false));
    return bound(x0, true) <= FACE_BOX[0] && bound(x1, false) >= FACE_BOX[2] && top <= FACE_BOX[1] && bottom >= FACE_BOX[3];
  }

  /* The range each size takes, at both ends: name, least, greatest, what it is called. An ell's
     radii are at least 1, since draw.js divides by them. */
  const SIZE = { w: [0, 512, 'length'], h: [0, 512, 'length'], r: [0, 256, 'radius'], rx: [1, 256, 'radius'], ry: [1, 256, 'radius'], hw0: [0, 64, 'half-width'], hw1: [0, 64, 'half-width'] };
  function within(f, lo, hi, path, what, fixed, R) {
    const a = bound(f, false, fixed, R), b = bound(f, true, fixed, R);
    if (a < lo) fail(path, what + ' reaches ' + a + ' at its least, below ' + lo);
    if (b > hi) fail(path, what + ' reaches ' + b + ' at its greatest, above ' + hi);
  }
  /* Every scalar of a shape within its range at both ends. dx and dy are folded into its offsets
     first (a shield's hold point, a plume's mount), and folded names the fold in the reason. */
  function shapeRanges(s, path, dx, dy, folded, fixed) {
    const off = folded ? 'with ' + folded + ' folded in, the offset' : 'the offset';
    eachPoint(s, (q, p) => {
      if (Array.isArray(q)) { within(shifted(form(q[0]), dx), -512, 512, idx(p, 0), off, fixed); within(shifted(form(q[1]), dy), -512, 512, idx(p, 1), off, fixed); return; }
      const fr = has(q, 'frame'), ex = fr ? 0 : dx, ey = fr ? 0 : dy, o = fr ? 'the offset' : off;
      if (has(q, 'x')) within(shifted(form(q.x), ex), -512, 512, key(p, 'x'), o, fixed);
      if (has(q, 'y')) within(shifted(form(q.y), ey), -512, 512, key(p, 'y'), o, fixed);
    }, path);
    for (const f of Object.keys(SIZE)) if (has(s, f)) within(form(s[f]), SIZE[f][0], SIZE[f][1], key(path, f), 'the ' + SIZE[f][2], fixed);
    if (has(s, 'clip')) s.clip.forEach((c, i) => { if (c !== null) within(shifted(form(c), dy), -512, 512, idx(key(path, 'clip'), i), off, fixed); });
  }
  function ranges(pack) {
    const P = 'pack', items = pack.items || {};
    for (const i of live(items)) {
      const v = items[i], ip = key(key(P, 'items'), i);
      const dx = v.slot === 'off' ? -v.hold[0] : 0, dy = v.slot === 'off' ? -v.hold[1] : 0, fold = v.slot === 'off' ? 'the hold point' : '';
      v.parts.forEach((pt, j) => pt.shapes.forEach((s, k) => shapeRanges(s, idx(key(idx(key(ip, 'parts'), j), 'shapes'), k), dx, dy, fold)));
      if (v.views) v.views.helmeted.forEach((pt, j) => pt.shapes.forEach((s, k) => shapeRanges(s, idx(key(idx(key(key(ip, 'views'), 'helmeted'), j), 'shapes'), k), 0, 0, '')));
      if (v.mounts) v.mounts.plume.forEach((c, j) => within(form(c), -512, 512, idx(key(key(ip, 'mounts'), 'plume'), j), 'the offset'));
      if (v.rest) {
        const rp = key(ip, 'rest');
        v.rest.shapes.forEach((s, k) => shapeRanges(s, idx(key(rp, 'shapes'), k), 0, 0, ''));
        if (v.rest.mounts) v.rest.mounts.plume.forEach((c, j) => within(form(c), -512, 512, idx(key(key(rp, 'mounts'), 'plume'), j), 'the offset'));
      }
    }
    for (const d of Object.keys(pack.decorations || {})) pack.decorations[d].shapes.forEach((s, k) => shapeRanges(s, idx(key(key(key(P, 'decorations'), d), 'shapes'), k), 0, 0, ''));
  }
  /* Whether a plume hung on a helmet's mounts stays within 512 of the head, worn and at rest. The
     two items may come from different packs, so this is checked when a look is resolved. */
  function plumeProblem(plume, helmet, fixed) {
    try {
      if (helmet.mounts) {
        const m = helmet.mounts.plume.map(form);
        plume.parts.forEach((pt, j) => pt.shapes.forEach((s, k) => shapeRanges(s, 'the plume\'s parts[' + j + '].shapes[' + k + ']', m[0], m[1], 'the helmet\'s mount', fixed)));
      }
      if (helmet.rest && helmet.rest.mounts && plume.rest) {
        const m = helmet.rest.mounts.plume.map(form);
        plume.rest.shapes.forEach((s, k) => shapeRanges(s, 'the plume\'s rest.shapes[' + k + ']', m[0], m[1], 'the helmet\'s rest mount', fixed));
      }
    } catch (e) {
      if (e instanceof Reject) return e.reason;
      throw e;
    }
    return '';
  }
  /* Convex and simple: no two consecutive points the same, the turns all go one way, no edge
     doubling back on the last, and x and y each change direction at most twice round the loop.
     Pairs are taken with every named value at 0; framed points in their own frame. */
  function convex(pts) {
    let turn = 0;
    const n = pts.length, dx = [], dy = [];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (a[0] === b[0] && a[1] === b[1]) return false; }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1], cr = ux * vy - uy * vx;
      if (cr === 0) { if (ux * vx + uy * vy < 0) return false; } else if (turn === 0) turn = Math.sign(cr); else if (Math.sign(cr) !== turn) return false;
      if (ux !== 0) dx.push(Math.sign(ux));
      if (uy !== 0) dy.push(Math.sign(uy));
    }
    const flips = d => d.reduce((m, s, i) => m + (s !== d[(i + 1) % d.length] ? 1 : 0), 0);
    return turn !== 0 && flips(dx) <= 2 && flips(dy) <= 2;
  }
  function polyRule(s, path) {
    const framed = s.pts.filter(q => isObj(q) && has(q, 'frame')).length, pairs = s.pts.filter(Array.isArray).length;
    if (framed !== s.pts.length && pairs !== s.pts.length) fail(key(path, 'pts'), 'must be all pairs or all framed points');
    if (framed && s.pts.some(q => has(q, 'x') || has(q, 'y'))) fail(key(path, 'pts'), 'framed points of a polygon cannot carry a screen offset');
    const at0 = framed ? s.pts.map(q => [q.p, -q.s]) : s.pts.map(q => [form(q[0]).c, form(q[1]).c]);
    for (let i = 0; i < at0.length; i++) {
      const a = at0[i], b = at0[(i + 1) % at0.length];
      if (a[0] === b[0] && a[1] === b[1]) fail(idx(key(path, 'pts'), (i + 1) % at0.length), 'is the same point as the one before it');
    }
    if (!convex(at0)) fail(key(path, 'pts'), 'must be a convex polygon, its points in order');
  }
  function eachShape(pack, fn) {
    const P = 'pack', items = pack.items || {};
    for (const i of live(items)) {
      const v = items[i], ip = key(key(P, 'items'), i);
      v.parts.forEach((pt, j) => pt.shapes.forEach((s, k) => fn(s, idx(key(idx(key(ip, 'parts'), j), 'shapes'), k))));
      if (v.views) v.views.helmeted.forEach((pt, j) => pt.shapes.forEach((s, k) => fn(s, idx(key(idx(key(key(ip, 'views'), 'helmeted'), j), 'shapes'), k))));
      if (v.rest) v.rest.shapes.forEach((s, k) => fn(s, idx(key(key(ip, 'rest'), 'shapes'), k)));
    }
    for (const d of Object.keys(pack.decorations || {})) pack.decorations[d].shapes.forEach((s, k) => fn(s, idx(key(key(key(P, 'decorations'), d), 'shapes'), k)));
  }
  function nonEmpty(v) { return isObj(v) && Object.keys(v).length > 0; }
  function rules(pack) {
    const P = 'pack', items = pack.items || {};
    const have = (is11(pack) ? PROVIDES_11 : PROVIDES).filter(s => nonEmpty(pack[s]));
    for (const s of have) if (!pack.provides.includes(s)) fail(key(P, 'provides'), 'must list "' + s + '", which the pack holds');
    for (const s of pack.provides) if (!have.includes(s)) fail(key(P, 'provides'), 'lists "' + s + '", which the pack does not hold');
    for (const i of live(items)) {
      const v = items[i], ip = key(key(P, 'items'), i);
      if (v.slot === 'arms' || v.slot === 'gauntlets') {
        const sides = v.parts.map(p => p.side).sort().join('');
        if (sides !== 'LR') fail(key(ip, 'parts'), v.slot + ' must have exactly one part for each side, L and R');
      }
      if (v.slot === 'helmet' && !v.parts.some(pt => pt.shapes.some(coversFace))) fail(key(ip, 'parts'), 'a helmet needs a shape filled with @skin.face whose box holds the face box, x from -28 to 28 and y from -20 to 20 around the head anchor, for every build');
      if (v.grip) {
        const want = v.grip.kind === 'two' ? 2 : 1;
        if (v.grip.hands.length !== want) fail(key(key(ip, 'grip'), 'hands'), 'a "' + v.grip.kind + '" grip has ' + want + ' station' + (want > 1 ? 's' : ''));
      }
      if (v.blade && !(v.blade.from < v.blade.to)) fail(key(ip, 'blade'), 'from must be below to');
    }
    for (const b of Object.keys(pack.builds || {})) {
      const m = pack.builds[b].m, t = m.height - m.leg;
      if (t < TORSO[0] || t > TORSO[1]) fail(key(key(key(P, 'builds'), b), 'm'), 'height less leg must be ' + TORSO[0] + ' to ' + TORSO[1] + ', not ' + t);
    }
    ranges(pack);
    eachShape(pack, (s, p) => { if (s.k === 'poly') polyRule(s, p); });
    for (const d of Object.keys(pack.decorations || {})) {
      const v = pack.decorations[d], dp = key(key(P, 'decorations'), d);
      if (v.box[0] > LIMITS.box || v.box[1] > LIMITS.box) fail(key(dp, 'box'), 'must be at most ' + LIMITS.box + ' by ' + LIMITS.box);
      if (v.anim) {
        const seen = new Set();
        v.anim.tracks.forEach((t, i) => {
          const k = has(t, 'pal') ? 'pal ' + t.pal : t.g + ' ' + t.ch;
          if (seen.has(k)) fail(idx(key(key(dp, 'anim'), 'tracks'), i), 'drives what an earlier track already drives');
          seen.add(k);
        });
      }
    }
    if (is11(pack)) worldRules(pack);
  }

  /* ---- Step 8: counts, and what a shape costs -------------------------------------------------- */

  /* How many bands a fill paints a row in: 1 for a colour. A band list of the user's skin may hold
     up to LIMITS.bands. */
  function bandCount(pack, f) {
    if (Array.isArray(f)) return f.length;
    if (typeof f !== 'string' || f[0] !== '@') return 1;
    const m = REF.exec(f);
    if (m[1] === 'base') return Array.isArray(BASE[m[2]]) ? BASE[m[2]].length : 1;
    if (has(USER_SETS, m[1])) return USER_SETS[m[1]][m[2]] === 'bands' ? LIMITS.bands : 1;
    return bandCount(pack, pack.palettes[m[1]][m[2]]);
  }
  const span2 = (v, R) => { const f = form(v); return [bound(f, false, null, R), bound(f, true, null, R)]; };
  /* Where a point can be: its anchor's name, and the x and y it reaches from that anchor. A framed
     point can turn to any angle, so it reaches the length of (s, p) every way. */
  function reach(q, at, R) {
    if (Array.isArray(q)) return { a: at, x: span2(q[0], R), y: span2(q[1], R) };
    if (has(q, 'frame')) {
      const r = Math.hypot(q.s, q.p), x = has(q, 'x') ? span2(q.x) : [0, 0], y = has(q, 'y') ? span2(q.y) : [0, 0];
      return { a: 'main', x: [x[0] - r, x[1] + r], y: [y[0] - r, y[1] + r] };
    }
    return { a: q.at, x: span2(q.x), y: span2(q.y) };
  }
  /* How far a set of points can stretch along x or y, each grown by its own margin; points on more
     than one anchor add ANCHOR_SPAN. */
  function extent(rs, axis, grow) {
    let lo = Infinity, hi = -Infinity;
    const as = new Set();
    rs.forEach((r, i) => { const g = grow ? grow[i] : 0; lo = Math.min(lo, r[axis][0] - g); hi = Math.max(hi, r[axis][1] + g); as.add(r.a); });
    return hi - lo + (as.size > 1 ? ANCHOR_SPAN : 0);
  }
  const rowsOver = ext => Math.ceil(Math.max(0, ext)) + 1;
  function clipRows(s, R) {
    if (!s.clip || s.clip[0] === null || s.clip[1] === null) return Infinity;
    return Math.max(0, Math.ceil(span2(s.clip[1], R)[1] - span2(s.clip[0], R)[0]) + 1);
  }
  /* The most fillRect calls draw.js can make for a shape, at the extremes of every value it leans
     on: a row (or column) of an ell, rrect, poly or strip costs one call per band; a rect one call
     per band; a pix one call per run of a character in a row. R is the table of value ranges
     (RANGE unless given) and nb the bands of the fill (counted here unless given). */
  function shapeCost(pack, s, at, R, nbIn) {
    const nb = nbIn !== undefined ? nbIn : s.k === 'pix' ? 1 : bandCount(pack, s.fill);
    switch (s.k) {
      case 'rect': return nb;
      case 'ell': return Math.min(2 * Math.ceil(span2(s.ry, R)[1]) + 1, clipRows(s, R)) * nb;
      case 'rrect': return Math.min(Math.max(0, Math.round(span2(s.h, R)[1])), clipRows(s, R)) * nb;
      case 'poly': {
        const rs = s.pts.map(q => reach(q, at, R));
        const ext = s.dir === 'rows' ? extent(rs, 'y') : s.dir === 'cols' ? extent(rs, 'x') : Math.max(extent(rs, 'x'), extent(rs, 'y'));
        return rowsOver(ext) * nb;
      }
      case 'strip': {
        const rs = [reach(s.p0, at, R), reach(s.p1, at, R)], g = [span2(s.hw0, R)[1], span2(s.hw1, R)[1]];
        return rowsOver(Math.max(extent(rs, 'x', g), extent(rs, 'y', g))) * nb;
      }
      default: {
        let n = 0;
        for (const row of s.rows) for (let i = 0; i < row.length; i++) if (row[i] !== '.' && row[i] !== row[i - 1]) n++;
        return n;
      }
    }
  }
  /* The shapes and the cost of an item's parts, of hair's helmeted view and of its rest view. */
  function itemSums(pack, v) {
    const sum = list => { const o = { n: 0, cost: 0 }; for (const pt of list) for (const s of pt.shapes) { o.n++; o.cost += shapeCost(pack, s, has(s, 'at') ? s.at : pt.at); } return o; };
    const rest = { n: 0, cost: 0 };
    if (v.rest) for (const s of v.rest.shapes) { rest.n++; rest.cost += shapeCost(pack, s, 'rest'); }
    return { parts: sum(v.parts), view: v.views ? sum(v.views.helmeted) : { n: 0, cost: 0 }, rest };
  }
  /* A decoration's cost, each shape's multiplied by the largest scale its group reaches. */
  function decorCost(pack, v) {
    const scale = {};
    if (v.anim) for (const t of v.anim.tracks) if (t.ch === 'scale') scale[t.g] = Math.max(1, ...t.keys.map(k => k[1]));
    return v.shapes.reduce((n, s) => n + Math.ceil(shapeCost(pack, s, 'place') * (has(s, 'g') && has(scale, s.g) ? scale[s.g] : 1)), 0);
  }
  function counts(pack) {
    const P = 'pack', items = pack.items || {}, ids = Object.keys(items), sums = {};
    if (ids.length > LIMITS.items) fail(key(P, 'items'), 'holds ' + ids.length + ' items, more than ' + LIMITS.items);
    for (const i of live(items)) {
      const s = sums[i] = itemSums(pack, items[i]), ip = key(key(P, 'items'), i);
      const n = s.parts.n + s.view.n + s.rest.n, c = s.parts.cost + s.view.cost + s.rest.cost;
      if (n > LIMITS.itemShapes) fail(ip, 'holds ' + n + ' shapes in its parts and views, more than ' + LIMITS.itemShapes);
      if (c > LIMITS.itemCost) fail(ip, 'costs up to ' + c + ' fills in its parts and views, more than ' + LIMITS.itemCost);
    }
    let px = 0;
    eachShape(pack, s => { if (s.k === 'pix') px += s.rows.length * s.rows[0].length; });
    if (is11(pack)) eachWorldShape(pack, s => { if (s.k === 'pix') px += s.rows.length * s.rows[0].length; });
    if (px > LIMITS.pixPack) fail(P, 'holds ' + px + ' pixels in pix shapes, more than ' + LIMITS.pixPack);
    const decs = Object.keys(pack.decorations || {}), decor = {};
    if (decs.length > LIMITS.decorations) fail(key(P, 'decorations'), 'holds ' + decs.length + ' decorations, more than ' + LIMITS.decorations);
    for (const d of decs) {
      const c = decor[d] = decorCost(pack, pack.decorations[d]);
      if (c > LIMITS.decorCost) fail(key(key(P, 'decorations'), d), 'costs up to ' + c + ' fills, more than ' + LIMITS.decorCost);
    }
    if (pack.defaults) {
      const d = pack.defaults, it = s => (has(d.items, s) ? { item: items[d.items[s]], sum: sums[d.items[s]] } : null);
      for (const b of Object.keys(pack.builds)) {
        const h = pack.builds[b].head, t = lookTotals({ items: it, head: { item: items[h], sum: sums[h] } }), dp = key(P, 'defaults');
        if (t.n > LIMITS.lookShapes) fail(dp, 'the default look draws ' + t.n + ' shapes with build ' + quote(b) + ', more than ' + LIMITS.lookShapes);
        if (t.cost > LIMITS.lookCost) fail(dp, 'the default look costs up to ' + t.cost + ' fills with build ' + quote(b) + ', more than ' + LIMITS.lookCost);
      }
      const problem = plumeProblem(items[d.items.plume], items[d.items.helmet]);
      if (problem) fail(key(P, 'defaults'), 'the default plume on the default helmet: ' + problem);
    }
    return { sums, decor, world: is11(pack) ? worldCounts(pack) : null };
  }
  /* The most shapes, and the most fills, a look draws for the knight in one frame, over every grip
     mode and helmet state: the body, the larger head group, the pauldrons, both arms and gauntlets,
     and the weapon, with the shield when the grip is one-handed. c.items(slot) gives { item, sum },
     c.head the build's head item. */
  function lookTotals(c) {
    const g = (s, part, what) => { const x = c.items(s); return x ? x.sum[part][what] : 0; };
    const helmet = c.items('helmet'), main = c.items('main'), plume = !!(helmet && helmet.item.mounts);
    const one = !!(main && main.item.grip.kind === 'one');
    const t = what => {
      const headOn = g('hair', 'view', what) + (plume ? g('plume', 'parts', what) : 0) + g('helmet', 'parts', what);
      const headOff = c.head.sum.parts[what] + g('hair', 'parts', what);
      return ['back', 'legs', 'boots', 'torso', 'pauldrons', 'arms', 'gauntlets', 'main'].reduce((a, s) => a + g(s, 'parts', what), 0) + Math.max(headOn, headOff) + (one ? g('off', 'parts', what) : 0);
    };
    return { n: t('n'), cost: t('cost') };
  }

  /* ---- Format 1.1: the world sections ----------------------------------------------------------

     Scenes, the cast, props, stamps, words, overlays, presets (worlds) and the reserved sounds,
     checked by the same steps as the rest and kept as data. Nothing compiles them yet and nothing
     draws from them: the engine's acts and the scene compiler come in later steps. Until then the
     closed lists those parts of the engine will own are fixed here, under the names the format
     gives them; the engine takes them over when it is built. An effect is checked against its table
     and costed by its cost function from the effects library, which is built. */

  /* The contract's condition ids. device_down and memory_tight have no scene of their own: they
     are acted in the quiet scene of the moment. */
  const CONDITIONS = ['attack', 'wan_down', 'container_unhealthy', 'disk_full', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight', 'ssh_session', 'updating', 'streaming', 'night'];
  const QUIET_CONDITIONS = ['device_down', 'memory_tight'];
  /* The acts (the engine's, from a later step): what a round does, the events a scene can host,
     the predicates a layer can wait on, the marks where the engine draws in a scene's order, and
     the two moments a clock can start from. */
  const ROUND_ACTS = ['guard', 'look', 'sniff', 'yawn', 'train'];
  const HOSTS = ['flies', 'crate', 'feast', 'foe'];
  const PREDICATES = ['tv', 'inBed', 'helmOff', 'strike', 'day', 'night'];
  const MARKS = ['things', 'rest', 'patron', 'sleeper', 'target', 'bubble'];
  const TRIGGERS = ['hit', 'strike'];
  /* The effects: drawings the engine owns, each named here and given its table of fields, its cost
     and its drawing by the effects library, effects.js (KW.effects). The page loads that file before
     this one; under Node this file asks for it beside itself, the first time a pack names an
     effect. */
  const EFFECTS = ['sky', 'stars', 'ridge', 'bricks', 'pines', 'tree', 'arch', 'shelf', 'stacks', 'tufts', 'pebbles', 'planks', 'rafters', 'horseshoe', 'hood', 'flame', 'candle', 'twinkle', 'drift', 'wander', 'coals', 'steam', 'flutes', 'crust', 'burst'];
  /* The cast: roles, the engine's exits (all of them cartoon ones), the poses the foe player asks
     for, the patron's anchors and the critter's frames. */
  const ROLES = ['patron', 'foe', 'critter'];
  const EXITS = ['poof'];
  const FOE_POSES = ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit'];
  const PATRON_ANCHORS = ['seat', 'eyes', 'mouth'];
  const MOUTHS = ['shut', 'open'];
  const FLAPS = ['flap0', 'flap1'];
  /* The fonts the engine ships. No font data travels in a pack. */
  const FONTS = ['vt323'];
  /* The kinds of device, the class the engine gives each, and each class's box: the most any kind
     of it may paint, x0, y0, x1, y1 from its base, as measured on today's drawings. */
  const PROP_KINDS = ['pi', 'camera', 'machine', 'vm', 'box'];
  const CLASS_OF = { pi: 'pie', camera: 'high', machine: 'ground', vm: 'ground', box: 'ground' };
  const CLASS_BOX = { pie: [-46, -107, 45, 33], high: [-34, -64, 32, 0], ground: [-36, -58, 41, 2] };
  const PLACE_CLASS = { pie: 'pie', h1: 'high', h2: 'high', h3: 'high', g1: 'ground', g2: 'ground', g3: 'ground' };
  /* Words: the settings screen's labels, and the placeholders each part of the quiet line and each
     caption may use. */
  const LABELS = ['watcher', 'patron', 'build', 'tabard', 'plume', 'helmet', 'foe', 'critter'];
  const QUIET_PARTS = { quiet: [], up: ['n'], backup: ['at'], ads: ['n', 'short'] };
  const CAPTIONS = { ip_banned: ['addr', 'jail'], import: ['title'], backup_done: ['at'] };
  /* The status colours' bands: hue from and to in degrees (crit's runs through 0), and the least
     and greatest contrast on black. sleep must also be darker than ok. */
  const LEVELS = { ok: [110, 160, 6, 21], warn: [28, 55, 6, 21], crit: [345, 15, 6, 21], info: [180, 215, 6, 21], sleep: [110, 160, 3, 6] };
  /* The set names a 1.1 pack's own palettes may not take: a tile's picks and the down lamp's reds,
     its red, the red at two thirds and its highlight (@lamp.down, @lamp.downLo, @lamp.downHi). */
  const WORLD_SETS = ['pick', 'lamp'];
  const LAMP_REF = /^@lamp\.(down|downLo|downHi)$/;
  const PLACEHOLDER = /\{([a-z]{1,16})\}/g;
  const TEMPLATE = /^[\x20-\x7e·]+$/;
  /* The named values of a scene, the range the checks assume for each (the screen at most three
     grid widths by two grid heights), and the grid unit the spots count in. */
  const SCENE_RANGE = freeze({ L: [-976, -16], R: [976, 1936], T: [-602, -2], W: [992, 2912] });
  /* The named values a scene's acts give its moving and over layers, and their ranges: targetDx, the
     pixels the training act moves the target's group by when it is struck, in a scene with a
     target; and spot, the x in pixels of the spot the watcher stands at by the anvil (its spot
     times U), which the anvil's places count from, in a scene with an anvil. Their coefficients may
     have three decimals, as the yard's lean, 713 + targetDx * 0.8, needs. ACT_PART names the part
     each needs, and the reason a scene without it is refused with. */
  const ACT_RANGE = freeze({ targetDx: [-15, 15], spot: [150, 810] });
  /* How many times the engine draws the stamp a weapon's rest names: once under each end of the
     blade, as the house's pegs. */
  const REST_STAMPS = 2;
  const ACT_PART = freeze({ targetDx: ['target', 'is the target\'s dx, and needs the scene\'s target'], spot: ['anvil', 'is the watcher\'s x at the anvil, and needs the scene\'s anvil'] });
  const U = 5;
  const WORLD_LIMITS = freeze({ scenes: 16, cast: 16, props: 8, overlays: 8, words: 8, worlds: 8, stamps: 64, stampShapes: 64,
    layers: 32, tiles: 64, effects: 48, tileShapes: 32, stillShapes: 2000, frameShapes: 400, stillCost: 200000, frameCost: 16000,
    glows: 24, patronStill: 16000, patronState: 400, poseCost: 8000, sprite: 256, critterFrame: 200, kindStill: 4000, kindMoving: 600,
    mark: 128, offset: 2048, length: 4096 });
  /* Where a shape of the world sections is, for the reasons. */
  const WWHERE = { still: 'a still layer', moving: 'a moving layer', over: 'an over layer', pole: 'a pole', stamp: 'a stamp', patron: 'the cast', foe: 'the cast', critter: 'the cast', prop: 'a prop' };
  const LAYERED = ['still', 'moving', 'over'];

  /* ---- Step 5 for 1.1: fields ---- */

  function bool(v, path) { if (typeof v !== 'boolean') fail(path, 'must be true or false'); }
  /* A list of values from a closed list, each once. */
  function setOf(v, path, list, max) {
    arr(v, path, 0, max || list.length).forEach((x, i) => { oneOf(x, idx(path, i), list); if (v.indexOf(x) !== i) fail(idx(path, i), 'appears twice'); });
  }
  /* A scalar of a world section: a number, or a term object of c, named values, h ([seed, mod]:
     the engine's hash of the tile's x, modulo mod) and wave ([amp, div, phase]: amp times the sine
     of the scene's time in ms over div, plus phase). lo and hi bound c. Coordinates are multiples of
     1/8, and so are the coefficients of named values but those an act gives (ACT_RANGE), which may
     have three decimals; an alpha (alpha true) may have three decimals and takes only c and wave. */
  function wscalar(v, path, lo, hi, alpha) {
    const n = alpha ? num : eighth;
    if (typeof v === 'number') { n(v, path, lo, hi); return; }
    if (!isObj(v)) fail(path, 'must be a number or a term object');
    for (const k of Object.keys(v)) {
      const p = key(path, k);
      if (k === 'c') n(v.c, p, lo, hi);
      else if (k === 'wave') wave(v.wave, p);
      else if (alpha) fail(p, 'an alpha takes only c and wave');
      else if (k === 'h') { if (!Array.isArray(v.h) || v.h.length !== 2) fail(p, 'must be [seed, mod]'); int(v.h[0], idx(p, 0), 0, 999); int(v.h[1], idx(p, 1), 2, 960); }
      else if (has(ACT_RANGE, k)) num(v[k], p, -8, 8);
      else if (!TERM_NAME.test(k)) fail(p, 'is not a name');
      else eighth(v[k], p, -8, 8);
    }
  }
  function wave(v, path) {
    if (!Array.isArray(v) || v.length !== 3) fail(path, 'must be [amp, div, phase]');
    num(v[0], idx(path, 0), -512, 512); num(v[1], idx(path, 1), 1, 100000); num(v[2], idx(path, 2), -100, 100);
  }
  function wpoint(v, path, o) {
    if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be a pair [x, y]');
    wscalar(v[0], idx(path, 0), -o, o); wscalar(v[1], idx(path, 1), -o, o);
  }
  const isColourName = c => typeof c === 'string' && (HEX.test(c) || REF.test(c) || LAMP_REF.test(c));
  /* One opaque colour: hex, or a reference. */
  function plainColour(v, path) { if (!isColourName(v)) fail(path, 'must be a hex colour or a reference such as "@base.k"'); }
  /* A colour of a world section: as in 1.0, or a mix { mix: [a, b], k }, each channel of a moved
     towards b's by k and rounded. */
  function wcolour(v, path) {
    if (typeof v === 'string') {
      if (isColourName(v)) return;
      fail(path, 'must be a hex colour, a reference such as "@base.k", a translucent colour or a mix');
    }
    if (!isObj(v)) fail(path, 'must be a colour');
    if (has(v, 'mix')) {
      obj(v, path, ['mix', 'k'], ['mix', 'k']);
      const mp = key(path, 'mix');
      if (!Array.isArray(v.mix) || v.mix.length !== 2) fail(mp, 'must be [colour, colour]');
      v.mix.forEach((c, i) => plainColour(c, idx(mp, i)));
      num(v.k, key(path, 'k'), 0, 1);
      return;
    }
    obj(v, path, ['rgb', 'a'], ['rgb', 'a']);
    if (typeof v.rgb !== 'string' || !HEX.test(v.rgb)) fail(key(path, 'rgb'), 'must be a hex colour');
    num(v.a, key(path, 'a'), 0.01, 1);
  }
  function wfill(v, path) {
    if (!Array.isArray(v)) { wcolour(v, path); return; }
    arr(v, path, 1, LIMITS.bands);
    let prev = 0;
    for (let i = 0; i < v.length; i++) {
      const b = v[i], p = idx(path, i);
      if (!Array.isArray(b) || b.length !== 2) fail(p, 'must be a [fraction, colour] pair');
      if (typeof b[0] !== 'number' || !(b[0] > prev) || b[0] > 1) fail(idx(p, 0), 'fractions must rise from above 0 to 1');
      prev = b[0];
      wcolour(b[1], idx(p, 1));
    }
    if (prev !== 1) fail(path, 'the last fraction must be 1');
  }
  /* [seed, mod]: a shape in a tile drawn only where the hash of the tile's x, modulo mod, is 0. */
  function seedMod(v, path) {
    if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be [seed, mod]');
    int(v[0], idx(path, 0), 0, 999); int(v[1], idx(path, 1), 2, 960);
  }
  function groupTable(v, path, o) {
    for (const g of table(v, path, LOCAL_ID, 0, LIMITS.groups, 'groups')) {
      obj(v[g], key(path, g), ['pivot'], ['pivot']);
      pair(v[g].pivot, key(key(path, g), 'pivot'), -o, o);
    }
  }

  const WSHAPE_KEYS = Object.assign({}, SHAPE_KEYS, { glow: ['p', 'r', 'colour', 'a'], dith: ['p', 'w', 'h', 'colour'],
    tile: ['step', 'phase', 'from', 'to', 'pick', 'shapes'], use: ['stamp', 'p'] });
  const WSHAPE_REQ = Object.assign({}, SHAPE_REQ, { glow: ['p', 'r', 'colour', 'a'], dith: ['p', 'w', 'h', 'colour'],
    tile: ['step', 'phase', 'from', 'to', 'shapes'], use: ['stamp', 'p'] });
  const WKINDS = KINDS.concat(['glow', 'dith', 'fx', 'use']);
  /* A shape of a world section. ctx: where (a key of WWHERE), wide (a scene's own coordinates, on
     the grid and out to the screen's edges), layer (in a layer of a scene), tile (inside a tile),
     groups (a group may be named). Points are pairs. */
  function wshape(s, path, ctx) {
    if (!isObj(s)) fail(path, 'must be an object');
    const kp = key(path, 'k'), top = ctx.layer && !ctx.tile;
    if (s.k === 'tile' && ctx.tile) fail(kp, 'a tile cannot hold a tile');
    if ((s.k === 'tile' || MARKS.includes(s.k)) && !top) fail(kp, quote(s.k) + ' is allowed only in a layer of a scene, outside tiles');
    if (!WKINDS.includes(s.k) && !(top && (s.k === 'tile' || MARKS.includes(s.k)))) fail(kp, 'must be one of ' + WKINDS.concat(top ? ['tile'].concat(MARKS) : []).map(quote).join(', '));
    if (MARKS.includes(s.k)) { mark(s, path, ctx); return; }
    if (s.k === 'fx') { effect(s, path, ctx); return; }
    const extra = [].concat(ctx.groups ? ['g'] : [], ctx.tile ? ['only'] : [], ctx.where === 'patron' ? ['at'] : []);
    obj(s, path, ['k'].concat(WSHAPE_KEYS[s.k], extra), ['k'].concat(WSHAPE_REQ[s.k]));
    const O = ctx.wide ? WORLD_LIMITS.offset : 512, Lg = ctx.wide ? WORLD_LIMITS.length : 512;
    if (has(s, 'g')) id(s.g, key(path, 'g'), LOCAL_ID);
    if (has(s, 'at') && (typeof s.at !== 'string' || !ANCHOR_NAME.test(s.at))) fail(key(path, 'at'), 'must be an anchor name');
    if (has(s, 'only')) seedMod(s.only, key(path, 'only'));
    for (const f of ['p', 'p0', 'p1']) if (has(s, f)) wpoint(s[f], key(path, f), O);
    for (const f of ['w', 'h']) if (has(s, f)) wscalar(s[f], key(path, f), 0, Lg);
    if (has(s, 'r')) wscalar(s.r, key(path, 'r'), 0, s.k === 'glow' ? 512 : 256);
    for (const f of ['rx', 'ry']) if (has(s, f)) wscalar(s[f], key(path, f), 0, 256);
    for (const f of ['hw0', 'hw1']) if (has(s, f)) wscalar(s[f], key(path, f), 0, 64);
    if (has(s, 'clip')) {
      const cp = key(path, 'clip');
      if (!Array.isArray(s.clip) || s.clip.length !== 2) fail(cp, 'must be [top, bottom]');
      for (let i = 0; i < 2; i++) if (s.clip[i] !== null) wscalar(s.clip[i], idx(cp, i), -O, O);
    }
    if (has(s, 'a')) wscalar(s.a, key(path, 'a'), 0, 1, true);
    if (has(s, 'colour')) plainColour(s.colour, key(path, 'colour'));
    if (has(s, 'fill')) wfill(s.fill, key(path, 'fill'));
    if (s.k === 'poly') {
      arr(s.pts, key(path, 'pts'), 3, LIMITS.polyPoints).forEach((q, i) => wpoint(q, idx(key(path, 'pts'), i), O));
      oneOf(s.dir, key(path, 'dir'), ['rows', 'cols']);
    }
    if (s.k === 'pix') pixFields(s, path, wcolour);
    if (s.k === 'use') id(s.stamp, key(path, 'stamp'), LOCAL_ID);
    if (s.k === 'tile') {
      int(s.step, key(path, 'step'), 4, 960);
      int(s.phase, key(path, 'phase'), -960, 960);
      wscalar(s.from, key(path, 'from'), -O, O); wscalar(s.to, key(path, 'to'), -O, O);
      if (has(s, 'pick')) {
        const pp = key(path, 'pick');
        for (const n of table(s.pick, pp, ENTRY_NAME, 1, 8, 'picks')) {
          const q = key(pp, n);
          obj(s.pick[n], q, ['seed', 'of'], ['seed', 'of']);
          int(s.pick[n].seed, key(q, 'seed'), 0, 999);
          arr(s.pick[n].of, key(q, 'of'), 2, 16).forEach((c, i) => { if (typeof c !== 'string' || !HEX.test(c)) fail(idx(key(q, 'of'), i), 'must be a hex colour'); });
        }
      }
      arr(s.shapes, key(path, 'shapes'), 1, WORLD_LIMITS.tileShapes).forEach((t, i) => wshape(t, idx(key(path, 'shapes'), i), Object.assign({}, ctx, { tile: true })));
    }
  }
  /* A mark: where in a scene's order the engine draws something of its own. The things, the
     sleeper, the target and the speech bubble change each frame, so they go in a moving or over
     layer; the patron and the gear at rest go in any layer. */
  function mark(s, path, ctx) {
    if (s.k === 'rest') {
      obj(s, path, ['k', 'slot', 'at'], ['k', 'slot', 'at']);
      oneOf(s.slot, key(path, 'slot'), ['helmet', 'main', 'off']);
      id(s.at, key(path, 'at'), LOCAL_ID);
    } else obj(s, path, ['k'], ['k']);
    if (['things', 'sleeper', 'target', 'bubble'].includes(s.k) && ctx.where === 'still') fail(key(path, 'k'), 'the ' + s.k + ' mark is drawn each frame, so it goes in a moving or over layer');
  }
  /* The effects library, or null where it cannot be had. */
  function effectsLib() {
    if (!KW.effects && typeof module === 'object' && module.exports && typeof require === 'function') {
      try { KW.effects = require('./effects.js'); } catch (e) { return null; }
    }
    return KW.effects || null;
  }
  /* The table of an effect of the engine's list: { fields, cost, glows }. */
  function effectOf(name, path) {
    const lib = effectsLib();
    if (!lib || !lib[name]) fail(path, 'cannot be checked: the engine\'s effects library (effects.js) is not loaded');
    return lib[name];
  }
  /* The kinds of an effect's fields that are scalars of the scene, and so may be term objects. */
  const FX_SCALARS = ['offset', 'length', 'term'];
  /* An effect, named from the engine's list, with the fields of its table (effects.js): each one the
     table names, of its kind and in its range; a field without a default is required. g and only
     are taken where any shape takes them. */
  function effect(s, path, ctx) {
    if (!has(s, 'fx')) fail(key(path, 'fx'), 'is missing');
    oneOf(s.fx, key(path, 'fx'), EFFECTS);
    const F = effectOf(s.fx, key(path, 'fx')).fields;
    for (const k of Object.keys(s)) {
      const p = key(path, k);
      if (k === 'k' || k === 'fx') continue;
      if (k === 'g') { if (!ctx.groups) fail(p, 'is not a field here'); id(s.g, p, LOCAL_ID); continue; }
      if (k === 'only') { if (!ctx.tile) fail(p, 'is not a field here'); seedMod(s.only, p); continue; }
      if (!has(F, k)) fail(p, 'is not a field of the effect ' + quote(s.fx));
    }
    for (const k of Object.keys(F)) if (!has(F[k], 'def') && !has(s, k)) fail(key(path, k), 'is missing');
    for (const k of Object.keys(F)) if (has(s, k)) fxField(s[k], key(path, k), F[k], ctx);
  }
  /* One field of an effect against its entry in the table. A scalar's c is held to its range here;
     the whole scalar is, at both ends, at rules. */
  function fxField(v, path, f, ctx) {
    const O = ctx.wide ? WORLD_LIMITS.offset : 512, Lg = ctx.wide ? WORLD_LIMITS.length : 512;
    switch (f.kind) {
      case 'point': wpoint(v, path, O); return;
      case 'offset': wscalar(v, path, -O, O); return;
      case 'length': wscalar(v, path, 0, Lg); return;
      case 'term': wscalar(v, path, f.lo, f.hi); return;
      case 'num': num(v, path, f.lo, f.hi); return;
      case 'int': int(v, path, f.lo, f.hi); return;
      case 'pair':
        if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be a pair of numbers');
        v.forEach((x, i) => (f.int ? int : num)(x, idx(path, i), f.of[i][0], f.of[i][1]));
        return;
      case 'colour': plainColour(v, path); return;
      case 'colours': arr(v, path, f.min, f.max).forEach((c, i) => plainColour(c, idx(path, i))); return;
      case 'ints': arr(v, path, f.min, f.max).forEach((x, i) => int(x, idx(path, i), f.lo, f.hi)); return;
      default: oneOf(v, path, f.of);
    }
  }
  function shapeList(v, path, min, max, ctx) {
    arr(v, path, min, max).forEach((s, i) => wshape(s, idx(path, i), ctx));
  }
  /* A predicate a layer waits on: cond:<id>, or one of PREDICATES, either after a "!". */
  function predicate(v, path) {
    const name = typeof v === 'string' ? v.replace(/^!/, '') : '';
    if (!(PREDICATES.includes(name) || (name.startsWith('cond:') && CONDITIONS.includes(name.slice(5))))) fail(path, 'must be a predicate: cond:<condition>, ' + PREDICATES.map(quote).join(', ') + ', each after an optional "!"');
    return name;
  }
  function wanim(a, path) {
    obj(a, path, ['period', 'loop', 'phase', 'tracks', 'ms', 'trigger'], ['period', 'loop', 'tracks']);
    if (has(a, 'ms')) bool(a.ms, key(path, 'ms'));
    const ms = a.ms === true;
    if (ms) int(a.period, key(path, 'period'), 200, 600000); else num(a.period, key(path, 'period'), 0.2, 600);
    bool(a.loop, key(path, 'loop'));
    if (has(a, 'phase')) num(a.phase, key(path, 'phase'), 0, 1);
    if (has(a, 'trigger')) {
      oneOf(a.trigger, key(path, 'trigger'), TRIGGERS);
      if (a.loop) fail(key(path, 'loop'), 'must be false: a triggered clock plays once');
    }
    const tp = key(path, 'tracks');
    arr(a.tracks, tp, 1, LIMITS.tracks).forEach((t, i) => {
      const p = idx(tp, i);
      if (isObj(t) && has(t, 'wave')) {
        obj(t, p, ['g', 'ch', 'wave', 'round'], ['g', 'ch', 'wave']);
        id(t.g, key(p, 'g'), LOCAL_ID);
        oneOf(t.ch, key(p, 'ch'), ['dx', 'dy']);
        wave(t.wave, key(p, 'wave'));
        if (has(t, 'round')) bool(t.round, key(p, 'round'));
      } else track(t, p, ms ? (v, q) => int(v, q, 0, a.period) : null);
    });
  }
  function layer(v, path, kind) {
    const still = kind === 'still';
    obj(v, path, still ? ['when', 'shapes'] : ['when', 'groups', 'anim', 'shapes'], ['shapes']);
    if (has(v, 'when')) {
      const wp = key(path, 'when'), seen = [];
      arr(v.when, wp, 1, 8).forEach((w, i) => { const n = predicate(w, idx(wp, i)); if (seen.includes(n)) fail(idx(wp, i), 'names a predicate already named'); seen.push(n); });
    }
    if (has(v, 'groups')) groupTable(v.groups, key(path, 'groups'), WORLD_LIMITS.offset);
    if (has(v, 'anim')) wanim(v.anim, key(path, 'anim'));
    shapeList(v.shapes, key(path, 'shapes'), 1, still ? WORLD_LIMITS.stillShapes : WORLD_LIMITS.frameShapes, { where: kind, wide: true, layer: true, groups: !still });
  }
  function gridPair(v, path) { pair(v, path, -WORLD_LIMITS.offset, WORLD_LIMITS.offset); }
  function ms(v, path) { int(v, path, 1, 600000); }
  function thingPlace(v, path) {
    obj(v, path, ['cls', 'kind', 'x', 'y', 'w', 'h', 'front', 'flip', 'pole'], ['cls', 'kind', 'x', 'y', 'w', 'h']);
    oneOf(v.cls, key(path, 'cls'), ['pie', 'high', 'ground']);
    oneOf(v.kind, key(path, 'kind'), FITS);
    int(v.x, key(path, 'x'), 0, 960); int(v.y, key(path, 'y'), 0, 600);
    if (v.w !== 88) fail(key(path, 'w'), 'must be 88: every place is 88 by 112');
    if (v.h !== 112) fail(key(path, 'h'), 'must be 112: every place is 88 by 112');
    for (const f of ['front', 'flip']) if (has(v, f)) bool(v[f], key(path, f));
    if (has(v, 'pole')) int(v.pole, key(path, 'pole'), 0, 600);
  }
  /* A rest: a place a rest view fits ({ kind, x, y, w, h }), or a frame the weapon lies on
     ({ x, y, a }, a the angle: "upright", "flat" or a number of radians), which may name a stamp
     of the pack, the scene's own pegs or rack drawn under the weapon. Either may count its x from
     the watcher's spot. */
  function restPlace(v, path) {
    if (isObj(v) && has(v, 'kind')) {
      obj(v, path, ['kind', 'x', 'y', 'w', 'h', 'from'], ['kind', 'x', 'y', 'w', 'h']);
      oneOf(v.kind, key(path, 'kind'), FITS);
      int(v.w, key(path, 'w'), 1, LIMITS.box); int(v.h, key(path, 'h'), 1, LIMITS.box);
    } else {
      obj(v, path, ['x', 'y', 'a', 'from', 'stamp'], ['x', 'y', 'a']);
      if (typeof v.a !== 'number' && v.a !== 'upright' && v.a !== 'flat') fail(key(path, 'a'), 'must be "upright", "flat" or a number of radians');
      if (has(v, 'stamp')) id(v.stamp, key(path, 'stamp'), LOCAL_ID);
      if (typeof v.a === 'number') num(v.a, key(path, 'a'), -3.142, 3.142);
    }
    int(v.x, key(path, 'x'), -960, 960); int(v.y, key(path, 'y'), 0, 600);
    if (has(v, 'from') && v.from !== 'spot') fail(key(path, 'from'), 'must be "spot"');
  }
  const SCENE_KEYS = ['name', 'spot', 'rounds', 'quiet', 'can', 'hosts', 'helmet', 'weapon', 'still', 'moving', 'over', 'things', 'rests', 'decor',
    'bed', 'screen', 'seat', 'anvil', 'target', 'foe', 'pole', 'sound', 'companion'];
  const SCENE_REQ = ['name', 'spot', 'rounds', 'quiet', 'can', 'hosts', 'helmet', 'weapon', 'still', 'moving', 'over', 'things'];
  function scene(v, path) {
    obj(v, path, SCENE_KEYS, SCENE_REQ);
    const f = k => key(path, k);
    text(v.name, f('name'), 1, 32);
    int(v.spot, f('spot'), 30, 162);
    arr(v.rounds, f('rounds'), 1, 6).forEach((r, i) => {
      const p = idx(f('rounds'), i);
      obj(r, p, ['x', 'act', 'dur'], ['x', 'act', 'dur']);
      int(r.x, key(p, 'x'), 30, 162); oneOf(r.act, key(p, 'act'), ROUND_ACTS); int(r.dur, key(p, 'dur'), 2, 120);
    });
    bool(v.quiet, f('quiet'));
    setOf(v.can, f('can'), CONDITIONS);
    setOf(v.hosts, f('hosts'), HOSTS);
    oneOf(v.helmet, f('helmet'), ['on', 'off']);
    oneOf(v.weapon, f('weapon'), ['held', 'away']);
    for (const k of LAYERED) arr(v[k], f(k), 0, WORLD_LIMITS.layers).forEach((l, i) => layer(l, idx(f(k), i), k));
    obj(v.things, f('things'), Object.keys(PLACE_CLASS), Object.keys(PLACE_CLASS));
    for (const k of Object.keys(PLACE_CLASS)) thingPlace(v.things[k], key(f('things'), k));
    if (has(v, 'rests')) for (const r of table(v.rests, f('rests'), LOCAL_ID, 0, 8, 'rests')) restPlace(v.rests[r], key(f('rests'), r));
    if (has(v, 'decor')) for (const d of table(v.decor, f('decor'), LOCAL_ID, 0, 16, 'places')) {
      const p = key(f('decor'), d), x = v.decor[d];
      obj(x, p, ['kind', 'x', 'y', 'w', 'h'], ['kind', 'x', 'y', 'w', 'h']);
      oneOf(x.kind, key(p, 'kind'), FITS);
      int(x.x, key(p, 'x'), 0, 960); int(x.y, key(p, 'y'), 0, 600); int(x.w, key(p, 'w'), 1, LIMITS.box); int(x.h, key(p, 'h'), 1, LIMITS.box);
    }
    if (has(v, 'bed')) {
      obj(v.bed, f('bed'), ['head', 'blanket', 'zeds'], ['head', 'blanket', 'zeds']);
      gridPair(v.bed.head, key(f('bed'), 'head')); id(v.bed.blanket, key(f('bed'), 'blanket'), LOCAL_ID); gridPair(v.bed.zeds, key(f('bed'), 'zeds'));
    }
    if (has(v, 'screen')) {
      const p = f('screen');
      // glow is reserved, and not read: the screen's light is a glow of the scene's own
      obj(v.screen, p, ['group', 'glow'], ['group']);
      id(v.screen.group, key(p, 'group'), LOCAL_ID);
      if (has(v.screen, 'glow')) {
        if (!Array.isArray(v.screen.glow) || v.screen.glow.length !== 3) fail(key(p, 'glow'), 'must be [x, y, r]');
        gridPair(v.screen.glow.slice(0, 2), key(p, 'glow')); eighth(v.screen.glow[2], idx(key(p, 'glow'), 2), 1, 512);
      }
    }
    if (has(v, 'seat')) {
      const p = f('seat');
      obj(v.seat, p, ['x', 'y', 'bubble', 'turn', 'mouth'], ['x', 'y', 'bubble', 'turn', 'mouth']);
      int(v.seat.x, key(p, 'x'), 0, 960); int(v.seat.y, key(p, 'y'), 0, 600);
      gridPair(v.seat.bubble, key(p, 'bubble')); ms(v.seat.turn, key(p, 'turn')); ms(v.seat.mouth, key(p, 'mouth'));
    }
    if (has(v, 'anvil')) {
      // spark is reserved, and not read: the hammer's sparks are a burst of the scene's own
      obj(v.anvil, f('anvil'), ['rest', 'spark'], ['rest']);
      id(v.anvil.rest, key(f('anvil'), 'rest'), LOCAL_ID);
      if (has(v.anvil, 'spark')) gridPair(v.anvil.spark, key(f('anvil'), 'spark'));
    }
    if (has(v, 'target')) {
      const p = f('target');
      obj(v.target, p, ['group', 'hitAt', 'every'], ['group', 'hitAt', 'every']);
      id(v.target.group, key(p, 'group'), LOCAL_ID); int(v.target.hitAt, key(p, 'hitAt'), 0, 600000); ms(v.target.every, key(p, 'every'));
    }
    if (has(v, 'foe')) {
      const p = f('foe'), z = v.foe;
      obj(z, p, ['side', 'spans', 'wall'], ['side', 'spans']);
      if (z.side !== 1 && z.side !== -1) fail(key(p, 'side'), 'must be 1 or -1');
      arr(z.spans, key(p, 'spans'), 1, 4).forEach((s, i) => {
        const q = idx(key(p, 'spans'), i);
        if (!Array.isArray(s) || s.length !== 2) fail(q, 'must be [from, to]');
        int(s[0], idx(q, 0), 0, 960); int(s[1], idx(q, 1), 0, 960);
      });
      if (has(z, 'wall')) {
        const w = key(p, 'wall');
        obj(z.wall, w, ['period', 'offset', 'high', 'low'], ['period', 'offset', 'high', 'low']);
        int(z.wall.period, key(w, 'period'), 2, 960); int(z.wall.offset, key(w, 'offset'), -960, 960);
        if (!Array.isArray(z.wall.high) || z.wall.high.length !== 2) fail(key(w, 'high'), 'must be [width, y]');
        int(z.wall.high[0], idx(key(w, 'high'), 0), 1, 960); int(z.wall.high[1], idx(key(w, 'high'), 1), 0, 600);
        int(z.wall.low, key(w, 'low'), 0, 600);
      }
    }
    if (has(v, 'pole')) shapeList(v.pole, f('pole'), 1, 16, { where: 'pole' });
    for (const k of ['sound', 'companion']) if (has(v, k) && !isObj(v[k])) fail(f(k), 'must be an object');
  }
  /* The entries of one of the user's sets, as a swatch gives them: literal colours, band lists
     where the set has them. */
  function setEntries(v, path, set) {
    const want = USER_SETS[set];
    obj(v, path, Object.keys(want), Object.keys(want));
    for (const e of Object.keys(want)) {
      if (want[e] === 'bands') { if (!Array.isArray(v[e])) fail(key(path, e), 'must be a band list'); bands(v[e], key(path, e), true); }
      else colour(v[e], key(path, e), true);
    }
  }
  const CAST_KEYS = { patron: ['role', 'name', 'box', 'anchors', 'sets', 'own', 'palettes', 'still', 'states'],
    foe: ['role', 'name', 'sprite', 'h', 'w', 'mid', 'crown', 'exit', 'parts', 'poses'], critter: ['role', 'name', 'groups', 'alpha', 'frames', 'dead'] };
  const CAST_REQ = { patron: ['role', 'name', 'box', 'anchors', 'still', 'states'],
    foe: ['role', 'name', 'sprite', 'h', 'w', 'mid', 'crown', 'exit', 'parts', 'poses'], critter: ['role', 'name', 'frames', 'dead'] };
  function castMember(v, path) {
    if (!isObj(v)) fail(path, 'must be an object');
    if (!has(v, 'role')) fail(key(path, 'role'), 'is missing');
    oneOf(v.role, key(path, 'role'), ROLES);
    obj(v, path, CAST_KEYS[v.role], CAST_REQ[v.role]);
    const f = k => key(path, k), where = { where: v.role };
    text(v.name, f('name'), 1, 48);
    if (v.role === 'patron') {
      if (!Array.isArray(v.box) || v.box.length !== 2) fail(f('box'), 'must be [w, h]');
      int(v.box[0], idx(f('box'), 0), 1, 200); int(v.box[1], idx(f('box'), 1), 1, 360);
      obj(v.anchors, f('anchors'), PATRON_ANCHORS, PATRON_ANCHORS);
      for (const a of PATRON_ANCHORS) pair(v.anchors[a], key(f('anchors'), a), -512, 512);
      if (has(v, 'sets')) for (const s of table(v.sets, f('sets'), SET_NAME, 1, 4, 'sets')) {
        oneOf(v.sets[s], key(f('sets'), s), Object.keys(USER_SETS));
        if (s === 'base' || WORLD_SETS.includes(s)) fail(key(f('sets'), s), 'is a reserved set name');
        if (has(USER_SETS, s) && v.sets[s] !== s) fail(key(f('sets'), s), 'a set named for one of the user\'s sets must bind that set');
      }
      if (has(v, 'own')) for (const s of table(v.own, f('own'), SET_NAME, 1, 4, 'sets')) {
        if (!(v.sets && has(v.sets, s))) fail(key(f('own'), s), 'is not a set this figure binds in sets');
        setEntries(v.own[s], key(f('own'), s), v.sets[s]);
      }
      if (has(v, 'palettes')) for (const s of table(v.palettes, f('palettes'), SET_NAME, 1, 8, 'sets')) {
        const sp = key(f('palettes'), s);
        if (s === 'base' || has(USER_SETS, s) || WORLD_SETS.includes(s) || (v.sets && has(v.sets, s))) fail(sp, 'is a reserved set name, or one this figure binds');
        for (const e of table(v.palettes[s], sp, ENTRY_NAME, 1, LIMITS.setEntries, 'entries')) wfill(v.palettes[s][e], key(sp, e));
      }
      arr(v.still, f('still'), 1, LIMITS.parts).forEach((pt, i) => {
        const p = idx(f('still'), i);
        obj(pt, p, ['at', 'shapes'], ['at', 'shapes']);
        if (typeof pt.at !== 'string' || !ANCHOR_NAME.test(pt.at)) fail(key(p, 'at'), 'must be an anchor name');
        shapeList(pt.shapes, key(p, 'shapes'), 1, LIMITS.partShapes, where);
      });
      obj(v.states, f('states'), MOUTHS, MOUTHS);
      for (const m of MOUTHS) shapeList(v.states[m], key(f('states'), m), 1, LIMITS.partShapes, where);
    } else if (v.role === 'foe') {
      const sp = f('sprite');
      obj(v.sprite, sp, ['size', 'feet'], ['size', 'feet']);
      box(v.sprite.size, key(sp, 'size'), WORLD_LIMITS.sprite);
      if (!Array.isArray(v.sprite.feet) || v.sprite.feet.length !== 2) fail(key(sp, 'feet'), 'must be a pair [x, y]');
      int(v.sprite.feet[0], idx(key(sp, 'feet'), 0), 0, WORLD_LIMITS.sprite); int(v.sprite.feet[1], idx(key(sp, 'feet'), 1), 0, WORLD_LIMITS.sprite);
      int(v.h, f('h'), 1, WORLD_LIMITS.sprite); int(v.w, f('w'), 1, WORLD_LIMITS.sprite); int(v.mid, f('mid'), 0, WORLD_LIMITS.sprite);
      arr(v.crown, f('crown'), 1, 32).forEach((q, i) => pair(q, idx(f('crown'), i), -WORLD_LIMITS.sprite, WORLD_LIMITS.sprite));
      oneOf(v.exit, f('exit'), EXITS);
      for (const n of table(v.parts, f('parts'), LOCAL_ID, 0, 16, 'parts')) shapeList(v.parts[n], key(f('parts'), n), 1, LIMITS.partShapes, where);
      obj(v.poses, f('poses'), FOE_POSES, FOE_POSES);
      for (const n of FOE_POSES) {
        const p = key(f('poses'), n), pose = v.poses[n];
        obj(pose, p, ['parts', 'shapes'], ['parts', 'shapes']);
        arr(pose.parts, key(p, 'parts'), 0, 16).forEach((x, i) => { id(x, idx(key(p, 'parts'), i), LOCAL_ID); if (pose.parts.indexOf(x) !== i) fail(idx(key(p, 'parts'), i), 'appears twice'); });
        shapeList(pose.shapes, key(p, 'shapes'), 0, LIMITS.partShapes, where);
      }
    } else {
      if (has(v, 'groups')) groupTable(v.groups, f('groups'), 512);
      if (has(v, 'alpha')) for (const g of table(v.alpha, f('alpha'), LOCAL_ID, 1, LIMITS.groups, 'groups')) num(v.alpha[g], key(f('alpha'), g), 0, 1);
      obj(v.frames, f('frames'), FLAPS, FLAPS);
      for (const n of FLAPS) shapeList(v.frames[n], key(f('frames'), n), 1, 64, { where: 'critter', groups: true });
      shapeList(v.dead, f('dead'), 1, 64, where);
    }
  }
  function propState(v, path, gone) {
    obj(v, path, ['still', 'moving', 'lamp'], ['still', 'lamp']);
    shapeList(v.still, key(path, 'still'), 1, LIMITS.partShapes, { where: 'prop' });
    if (has(v, 'moving')) shapeList(v.moving, key(path, 'moving'), 1, LIMITS.partShapes, { where: 'prop' });
    const lp = key(path, 'lamp');
    if (Array.isArray(v.lamp)) { pair(v.lamp, lp, -512, 512); return; }
    // a gone lamp's light is the engine's red, so it takes no colour of its own
    obj(v.lamp, lp, gone ? ['at', 'box', 'lit', 'dark'] : ['at', 'box', 'lit', 'dark', 'light'], ['at', 'box', 'lit', 'dark']);
    pair(v.lamp.at, key(lp, 'at'), -512, 512);
    box(v.lamp.box, key(lp, 'box'), 64);
    id(v.lamp.lit, key(lp, 'lit'), LOCAL_ID); id(v.lamp.dark, key(lp, 'dark'), LOCAL_ID);
    if (has(v.lamp, 'light') && (typeof v.lamp.light !== 'string' || !HEX.test(v.lamp.light))) fail(key(lp, 'light'), 'must be a hex colour');
  }
  function propSet(v, path) {
    obj(v, path, ['name', 'kinds'], ['name', 'kinds']);
    text(v.name, key(path, 'name'), 1, 48);
    const kp = key(path, 'kinds');
    obj(v.kinds, kp, PROP_KINDS, []);
    if (!Object.keys(v.kinds).length) fail(kp, 'must give at least one kind');
    for (const k of Object.keys(v.kinds)) {
      const p = key(kp, k), x = v.kinds[k];
      obj(x, p, ['name', 'mark', 'up', 'gone'], ['name', 'mark', 'up', 'gone']);
      text(x.name, key(p, 'name'), 1, 48);
      int(x.mark, key(p, 'mark'), 1, WORLD_LIMITS.mark);
      propState(x.up, key(p, 'up'), false); propState(x.gone, key(p, 'gone'), true);
    }
  }
  /* A template: 1 to 32 characters of printable ASCII and the middle dot, every brace part of a
     placeholder such as {n}. */
  function template(v, path) {
    text(v, path, 1, 32);
    if (!TEMPLATE.test(v)) fail(path, 'must be printable ASCII and "·" only');
    if (/[{}]/.test(v.replace(PLACEHOLDER, ''))) fail(path, 'must close every placeholder it opens, as in {n}');
  }
  function templates(v, path, parts) {
    obj(v, path, Object.keys(parts), []);
    for (const k of Object.keys(v)) arr(v[k], key(path, k), 1, 8).forEach((t, i) => template(t, idx(key(path, k), i)));
  }
  function wordsSet(v, path) {
    obj(v, path, ['name', 'watcher', 'labels', 'quiet', 'captions'], ['name', 'watcher']);
    text(v.name, key(path, 'name'), 1, 48);
    text(v.watcher, key(path, 'watcher'), 1, 32);
    if (has(v, 'labels')) { obj(v.labels, key(path, 'labels'), LABELS, []); for (const k of Object.keys(v.labels)) text(v.labels[k], key(key(path, 'labels'), k), 1, 32); }
    if (has(v, 'quiet')) templates(v.quiet, key(path, 'quiet'), QUIET_PARTS);
    if (has(v, 'captions')) templates(v.captions, key(path, 'captions'), CAPTIONS);
  }
  function overlay(v, path) {
    const all = ['name', 'font', 'levels', 'outline', 'scrim', 'caption'];
    obj(v, path, all, all);
    text(v.name, key(path, 'name'), 1, 48);
    oneOf(v.font, key(path, 'font'), FONTS);
    const lp = key(path, 'levels');
    obj(v.levels, lp, Object.keys(LEVELS), Object.keys(LEVELS));
    for (const l of Object.keys(LEVELS)) {
      const c = v.levels[l];
      if (!Array.isArray(c) || c.length !== 2 || !c.every(x => typeof x === 'string' && HEX.test(x))) fail(key(lp, l), 'must be [colour, second colour], two hex colours');
    }
    for (const k of ['outline', 'scrim']) if (typeof v[k] !== 'string' || !HEX.test(v[k])) fail(key(path, k), 'must be a hex colour');
    colour(v.caption, key(path, 'caption'), true);
  }
  /* A name in a preset: a local id, or "<pack id>/<local id>". */
  function wname(v, path) {
    const s = split(v);
    if (!(typeof v === 'string' && (LOCAL_ID.test(v) || (s && PACK_ID.test(s[0]) && LOCAL_ID.test(s[1]))))) fail(path, 'must be a local id or "<pack id>/<id>"');
  }
  function preset(v, path) {
    obj(v, path, ['name', 'body', 'outfit', 'scenes', 'cast', 'props', 'overlay', 'words', 'picture', 'sound', 'companion'], []);
    const f = k => key(path, k);
    if (has(v, 'name')) text(v.name, f('name'), 1, 48);
    for (const k of ['body', 'props', 'overlay', 'words', 'picture']) if (has(v, k)) wname(v[k], f(k));
    if (has(v, 'outfit')) {
      const op = f('outfit');
      obj(v.outfit, op, ['items', 'swatches'], []);
      if (has(v.outfit, 'items')) { obj(v.outfit.items, key(op, 'items'), DEFAULT_SLOTS.concat(['back', 'off']), []); for (const s of Object.keys(v.outfit.items)) wname(v.outfit.items[s], key(key(op, 'items'), s)); }
      if (has(v.outfit, 'swatches')) { obj(v.outfit.swatches, key(op, 'swatches'), Object.keys(USER_SETS), []); for (const s of Object.keys(v.outfit.swatches)) wname(v.outfit.swatches[s], key(key(op, 'swatches'), s)); }
    }
    if (has(v, 'scenes')) {
      const sp = f('scenes');
      obj(v.scenes, sp, ['quiet', 'for'], []);
      if (has(v.scenes, 'quiet')) arr(v.scenes.quiet, key(sp, 'quiet'), 1, WORLD_LIMITS.scenes).forEach((n, i) => { wname(n, idx(key(sp, 'quiet'), i)); if (v.scenes.quiet.indexOf(n) !== i) fail(idx(key(sp, 'quiet'), i), 'appears twice'); });
      if (has(v.scenes, 'for')) { obj(v.scenes.for, key(sp, 'for'), CONDITIONS, []); for (const c of Object.keys(v.scenes.for)) wname(v.scenes.for[c], key(key(sp, 'for'), c)); }
    }
    if (has(v, 'cast')) { obj(v.cast, f('cast'), ROLES, []); for (const r of Object.keys(v.cast)) wname(v.cast[r], key(f('cast'), r)); }
    for (const k of ['sound', 'companion']) if (has(v, k) && !isObj(v[k])) fail(f(k), 'must be an object');
  }
  function worldFields(pack) {
    const P = 'pack', sec = (k, fn, what) => {
      if (!has(pack, k)) return;
      for (const n of table(pack[k], key(P, k), LOCAL_ID, 0, Infinity, what)) fn(pack[k][n], key(key(P, k), n));
    };
    // how many each section may hold is checked at counts, as for items and decorations
    sec('stamps', (v, p) => shapeList(v, p, 1, WORLD_LIMITS.stampShapes, { where: 'stamp' }), 'stamps');
    sec('scenes', scene, 'scenes');
    sec('cast', castMember, 'members');
    sec('props', propSet, 'prop sets');
    sec('words', wordsSet, 'word sets');
    sec('overlays', overlay, 'overlays');
    sec('worlds', preset, 'worlds');
    if (has(pack, 'sounds') && !isObj(pack.sounds)) fail(key(P, 'sounds'), 'must be an object');
  }

  /* ---- Walking the world sections ---- */

  /* Calls fn(shape, path, ctx) for every shape of the world sections, a tile's own shapes after
     it. ctx: { where, scene, layer, groups, tile, member, kind }. */
  function eachWorldShape(pack, fn) {
    const P = 'pack';
    const list = (shapes, path, ctx) => shapes.forEach((s, i) => {
      const p = idx(path, i);
      fn(s, p, ctx);
      if (s.k === 'tile') list(s.shapes, key(p, 'shapes'), Object.assign({}, ctx, { tile: s }));
    });
    for (const n of Object.keys(pack.stamps || {})) list(pack.stamps[n], key(key(P, 'stamps'), n), { where: 'stamp' });
    for (const n of Object.keys(pack.scenes || {})) {
      const v = pack.scenes[n], sp = key(key(P, 'scenes'), n);
      for (const k of LAYERED) v[k].forEach((l, i) => list(l.shapes, key(idx(key(sp, k), i), 'shapes'), { where: k, scene: v, layer: l, groups: l.groups || {} }));
      if (v.pole) list(v.pole, key(sp, 'pole'), { where: 'pole', scene: v });
    }
    for (const n of Object.keys(pack.cast || {})) {
      const v = pack.cast[n], cp = key(key(P, 'cast'), n), c = { where: v.role, member: v };
      if (v.role === 'patron') {
        v.still.forEach((pt, i) => list(pt.shapes, key(idx(key(cp, 'still'), i), 'shapes'), c));
        for (const m of MOUTHS) list(v.states[m], key(key(cp, 'states'), m), c);
      } else if (v.role === 'foe') {
        for (const x of Object.keys(v.parts)) list(v.parts[x], key(key(cp, 'parts'), x), c);
        for (const x of FOE_POSES) list(v.poses[x].shapes, key(key(key(cp, 'poses'), x), 'shapes'), c);
      } else {
        for (const x of FLAPS) list(v.frames[x], key(key(cp, 'frames'), x), Object.assign({ groups: v.groups || {} }, c));
        list(v.dead, key(cp, 'dead'), c);
      }
    }
    for (const n of Object.keys(pack.props || {})) for (const k of Object.keys(pack.props[n].kinds)) for (const st of ['up', 'gone']) {
      const v = pack.props[n].kinds[k][st], p = key(key(key(key(key(P, 'props'), n), 'kinds'), k), st);
      list(v.still, key(p, 'still'), { where: 'prop', kind: k });
      if (v.moving) list(v.moving, key(p, 'moving'), { where: 'prop', kind: k });
    }
  }
  /* Calls fn(scalar, path, alpha) for every scalar of a world shape. */
  function eachWScalar(s, fn, path) {
    if (s.k === 'fx') {
      // an effect's scalars, as its table gives them
      const F = effectOf(s.fx, key(path, 'fx')).fields;
      for (const k of Object.keys(F)) {
        if (!has(s, k)) continue;
        if (F[k].kind === 'point') { fn(s[k][0], idx(key(path, k), 0)); fn(s[k][1], idx(key(path, k), 1)); } else if (FX_SCALARS.includes(F[k].kind)) fn(s[k], key(path, k));
      }
      return;
    }
    for (const f of ['p', 'p0', 'p1']) if (has(s, f)) { fn(s[f][0], idx(key(path, f), 0)); fn(s[f][1], idx(key(path, f), 1)); }
    if (s.k === 'poly') s.pts.forEach((q, i) => { fn(q[0], idx(idx(key(path, 'pts'), i), 0)); fn(q[1], idx(idx(key(path, 'pts'), i), 1)); });
    for (const f of ['w', 'h', 'r', 'rx', 'ry', 'hw0', 'hw1', 'from', 'to']) if (has(s, f)) fn(s[f], key(path, f));
    if (has(s, 'clip')) s.clip.forEach((c, i) => { if (c !== null) fn(c, idx(key(path, 'clip'), i)); });
    if (has(s, 'a')) fn(s.a, key(path, 'a'));
  }
  /* Calls fn(colour, path, single) for every colour of a world shape. */
  function eachWColour(s, fn, path) {
    if (has(s, 'fill')) eachColour(s.fill, fn, key(path, 'fill'));
    if (has(s, 'colour')) fn(s.colour, key(path, 'colour'), true);
    if (s.k === 'pix') for (const k of Object.keys(s.key)) fn(s.key[k], key(key(path, 'key'), k), true);
    if (s.k === 'fx') {
      // an effect's colours, as its table gives them
      const F = effectOf(s.fx, key(path, 'fx')).fields;
      for (const k of Object.keys(F)) {
        if (!has(s, k)) continue;
        if (F[k].kind === 'colour') fn(s[k], key(path, k), true);
        else if (F[k].kind === 'colours') s[k].forEach((v, i) => fn(v, idx(key(path, k), i), true));
      }
    }
  }
  /* The groups declared in a scene's layers, by name. */
  function sceneGroups(sc) {
    const out = {};
    for (const k of LAYERED) for (const l of sc[k]) for (const g of Object.keys(l.groups || {})) out[g] = l.groups[g];
    return out;
  }
  const frameRest = r => !has(r, 'kind');

  /* ---- Step 6 for 1.1: references ---- */

  /* The named values a world scalar may lean on: the screen's edges in a layer of a scene, the
     tile's x and its hash inside a tile, and a wave and the values an act gives (ACT_RANGE, each in
     a scene with the part ACT_PART names) in a moving or over layer. Nothing elsewhere. */
  function wnames(v, path, ctx) {
    if (!isObj(v)) return;
    for (const k of Object.keys(v)) {
      if (k === 'c') continue;
      const p = key(path, k), layer = LAYERED.includes(ctx.where);
      let ok;
      if (has(SCENE_RANGE, k)) ok = layer;
      else if (k === 'x' || k === 'h') { if (layer && !ctx.tile) fail(p, (k === 'x' ? 'is the tile\'s x' : 'hashes the tile\'s x') + ', and cannot be used outside a tile'); ok = !!ctx.tile; }
      else if (k === 'wave') ok = ctx.where === 'moving' || ctx.where === 'over';
      else if (has(ACT_RANGE, k)) {
        ok = ctx.where === 'moving' || ctx.where === 'over';
        if (ok && !(ctx.scene && ctx.scene[ACT_PART[k][0]])) fail(p, ACT_PART[k][1]);
      } else if (DIFFS.includes(k) || VALUES.includes(k) || k === 'step') ok = false;
      else fail(p, 'is not a named value');
      if (!ok) fail(p, 'cannot be used in ' + WWHERE[ctx.where]);
    }
  }
  /* The kind of an entry a reference inside a cast member names: through its sets, its own
     palettes, or as anywhere else. */
  function memberKind(pack, m, set, entry) {
    if (m.sets && has(m.sets, set)) { const u = USER_SETS[m.sets[set]]; return has(u, entry) ? u[entry] : null; }
    if (m.palettes && has(m.palettes, set)) {
      if (!has(m.palettes[set], entry)) return null;
      const v = m.palettes[set][entry];
      if (Array.isArray(v)) return 'bands';
      if (typeof v === 'string' && v[0] === '@') { const r = REF.exec(v); return r ? memberKind(pack, m, r[1], r[2]) : 'colour'; }
      return 'colour';
    }
    return refKind(pack, set, entry);
  }
  function wrefColour(pack, c, path, single, ctx) {
    if (isObj(c) && has(c, 'mix')) { c.mix.forEach((x, i) => wrefColour(pack, x, idx(key(path, 'mix'), i), true, ctx)); return; }
    if (typeof c !== 'string' || c[0] !== '@') return;
    if (LAMP_REF.test(c)) { if (ctx.where !== 'stamp') fail(path, quote(c) + ' is the engine\'s down lamp, and may be named only in a stamp'); return; }
    const m = REF.exec(c), set = m[1];
    if (set === 'pick') {
      if (!(ctx.tile && ctx.tile.pick && has(ctx.tile.pick, m[2]))) fail(path, 'names a pick, ' + quote(m[2]) + ', that no tile around it declares');
      return;
    }
    const mem = ctx.member;
    if (mem) {
      if (has(USER_SETS, set) && !(mem.sets && has(mem.sets, set))) fail(path, 'the cast names the user\'s colour sets only through its sets');
      if ((mem.sets && has(mem.sets, set)) || (mem.palettes && has(mem.palettes, set))) {
        const kind = memberKind(pack, mem, set, m[2]);
        if (kind === null) fail(path, 'names an entry, ' + quote(m[2]) + ', that set ' + quote(set) + ' does not have');
        if (single && kind === 'bands') fail(path, 'needs a single colour here, and ' + quote(c) + ' is a band list');
        return;
      }
    }
    refColour(pack, c, path, single, false);
  }
  function worldShapeRefs(pack, s, path, ctx) {
    eachWScalar(s, (v, p) => wnames(v, p, ctx), path);
    eachWColour(s, (c, p, single) => wrefColour(pack, c, p, single, ctx), path);
    if (has(s, 'g') && !(ctx.groups && has(ctx.groups, s.g))) fail(key(path, 'g'), 'names a group, ' + quote(s.g) + ', that the ' + (ctx.where === 'critter' ? 'critter' : 'layer') + ' does not declare');
    if (s.k !== 'rest' && has(s, 'at') && !PATRON_ANCHORS.includes(s.at)) fail(key(path, 'at'), 'names an anchor, ' + quote(s.at) + ', that the patron does not have');
    if (s.k === 'pix') s.rows.forEach((r, j) => { for (const ch of r) if (ch !== '.' && !has(s.key, ch)) fail(idx(key(path, 'rows'), j), 'uses ' + quote(ch) + ', which the key does not map'); });
    if (s.k === 'use' && !(pack.stamps && has(pack.stamps, s.stamp))) fail(key(path, 'stamp'), 'names a stamp, ' + quote(s.stamp) + ', that the pack does not have');
    const sc = ctx.scene;
    if (s.k === 'rest') {
      const r = sc.rests && has(sc.rests, s.at) ? sc.rests[s.at] : null;
      if (!r) fail(key(path, 'at'), 'names a rest, ' + quote(s.at) + ', that the scene does not have');
      if (s.slot === 'main' && !frameRest(r)) fail(key(path, 'at'), 'the weapon lies on a frame, { x, y, a }, and ' + quote(s.at) + ' is a place');
      if (s.slot !== 'main' && frameRest(r)) fail(key(path, 'at'), 'a rest view goes in a place, { kind, x, y, w, h }, and ' + quote(s.at) + ' is a frame');
    }
    const part = { patron: 'seat', bubble: 'seat', sleeper: 'bed', target: 'target' }[s.k];
    if (part && !has(sc, part)) fail(key(path, 'k'), 'the ' + s.k + ' mark needs the scene\'s ' + part);
  }
  function worldReferences(pack) {
    const P = 'pack';
    eachWorldShape(pack, (s, p, ctx) => worldShapeRefs(pack, s, p, ctx));
    for (const n of Object.keys(pack.scenes || {})) {
      const v = pack.scenes[n], sp = key(key(P, 'scenes'), n), groups = sceneGroups(v);
      const group = (g, p) => { if (!has(groups, g)) fail(p, 'names a group, ' + quote(g) + ', that no layer of the scene declares'); };
      if (v.bed) group(v.bed.blanket, key(key(sp, 'bed'), 'blanket'));
      if (v.screen) group(v.screen.group, key(key(sp, 'screen'), 'group'));
      if (v.target) group(v.target.group, key(key(sp, 'target'), 'group'));
      if (v.anvil && !(v.rests && has(v.rests, v.anvil.rest))) fail(key(key(sp, 'anvil'), 'rest'), 'names a rest, ' + quote(v.anvil.rest) + ', that the scene does not have');
      for (const r of Object.keys(v.rests || {})) {
        const st = v.rests[r].stamp;
        if (st !== undefined && !(pack.stamps && has(pack.stamps, st))) fail(key(key(key(sp, 'rests'), r), 'stamp'), 'names a stamp, ' + quote(st) + ', that the pack does not have');
      }
      const needs = { tv: 'screen', inBed: 'bed', strike: 'anvil' };
      for (const k of LAYERED) v[k].forEach((l, i) => {
        const lp = idx(key(sp, k), i);
        if (l.when) l.when.forEach((w, j) => { const nm = w.replace(/^!/, ''); if (has(needs, nm) && !has(v, needs[nm])) fail(idx(key(lp, 'when'), j), quote(nm) + ' needs the scene\'s ' + needs[nm]); });
        if (!l.anim) return;
        const ap = key(lp, 'anim');
        if (l.anim.trigger) { const want = l.anim.trigger === 'hit' ? 'target' : 'anvil'; if (!has(v, want)) fail(key(ap, 'trigger'), quote(l.anim.trigger) + ' needs the scene\'s ' + want); }
        l.anim.tracks.forEach((t, j) => {
          const tp = idx(key(ap, 'tracks'), j);
          if (has(t, 'g') && !(l.groups && has(l.groups, t.g))) fail(key(tp, 'g'), 'names a group, ' + quote(t.g) + ', that the layer does not declare');
          if (has(t, 'pal')) {
            const m = PAL.exec(t.pal), own = pack.palettes && has(pack.palettes, m[1]) ? pack.palettes[m[1]] : null;
            if (!own) fail(key(tp, 'pal'), 'must name a palette set of this pack, and ' + quote(m[1]) + ' is not one');
            if (!has(own, m[2])) fail(key(tp, 'pal'), 'names an entry, ' + quote(m[2]) + ', that set ' + quote(m[1]) + ' does not have');
            if (typeof own[m[2]] !== 'string' || !HEX.test(own[m[2]])) fail(key(tp, 'pal'), 'must name an entry that is a hex colour');
          }
        });
      });
    }
    for (const n of Object.keys(pack.cast || {})) {
      const v = pack.cast[n], cp = key(key(P, 'cast'), n);
      if (v.role === 'patron') {
        v.still.forEach((pt, i) => { if (!PATRON_ANCHORS.includes(pt.at)) fail(key(idx(key(cp, 'still'), i), 'at'), 'names an anchor, ' + quote(pt.at) + ', that the patron does not have'); });
        // a palette of the figure refers only to @base and the sets it binds
        const one = (x, p, single) => {
          if (typeof x !== 'string' || x[0] !== '@') return;
          const m = REF.exec(x);
          if (!m || !(m[1] === 'base' || (v.sets && has(v.sets, m[1])))) fail(p, 'a palette of the cast may refer only to @base and the sets the figure binds');
          wrefColour(pack, x, p, single, { member: v });
        };
        if (v.palettes) for (const s of Object.keys(v.palettes)) for (const e of Object.keys(v.palettes[s]))
          eachColour(v.palettes[s][e], (c, p, single) => {
            if (isObj(c) && has(c, 'mix')) c.mix.forEach((x, i) => one(x, idx(key(p, 'mix'), i), true)); else one(c, p, single);
          }, key(key(key(cp, 'palettes'), s), e));
      }
      if (v.role === 'foe') for (const x of FOE_POSES) v.poses[x].parts.forEach((q, i) => { if (!has(v.parts, q)) fail(idx(key(key(key(cp, 'poses'), x), 'parts'), i), 'names a part, ' + quote(q) + ', that the foe does not have'); });
      if (v.role === 'critter' && v.alpha) for (const g of Object.keys(v.alpha)) if (!(v.groups && has(v.groups, g))) fail(key(key(cp, 'alpha'), g), 'names a group, ' + quote(g) + ', that the critter does not declare');
    }
    for (const n of Object.keys(pack.props || {})) for (const k of Object.keys(pack.props[n].kinds)) for (const st of ['up', 'gone']) {
      const lamp = pack.props[n].kinds[k][st].lamp, lp = key(key(key(key(key(key(P, 'props'), n), 'kinds'), k), st), 'lamp');
      if (!Array.isArray(lamp)) for (const f of ['lit', 'dark']) if (!(pack.stamps && has(pack.stamps, lamp[f]))) fail(key(lp, f), 'names a stamp, ' + quote(lamp[f]) + ', that the pack does not have');
    }
    for (const n of Object.keys(pack.words || {})) {
      const v = pack.words[n], wp = key(key(P, 'words'), n);
      for (const [sec, parts] of [['quiet', QUIET_PARTS], ['captions', CAPTIONS]]) if (v[sec]) for (const k of Object.keys(v[sec])) v[sec][k].forEach((t, i) => {
        for (const m of t.matchAll(PLACEHOLDER)) if (!parts[k].includes(m[1])) fail(idx(key(key(wp, sec), k), i), 'uses {' + cut(m[1], LIMITS.quote) + '}, which ' + k + ' does not give' + (parts[k].length ? ': it gives ' + parts[k].map(x => '{' + x + '}').join(', ') : ''));
      });
    }
    for (const n of Object.keys(pack.worlds || {})) presetRefs(pack, pack.worlds[n], key(key(P, 'worlds'), n));
  }
  /* A preset's name, resolved in this pack when it is local or names this pack: the local id, or
     null when it names another pack. */
  function localOf(pack, v) {
    const s = split(v);
    if (!s) return v;
    return s[0] === pack.id ? s[1] : null;
  }
  function presetRefs(pack, v, path) {
    const f = k => key(path, k);
    const look = (name, p, sec, what, test) => {
      const l = localOf(pack, name);
      if (l === null) return;
      if (!(pack[sec] && has(pack[sec], l))) fail(p, 'names ' + what + ', ' + quote(name) + ', that the pack does not have');
      const why = test ? test(pack[sec][l]) : '';
      if (why) fail(p, 'names ' + quote(name) + ', ' + why);
    };
    if (has(v, 'body')) look(v.body, f('body'), 'builds', 'a build');
    if (v.outfit && v.outfit.items) for (const s of Object.keys(v.outfit.items)) look(v.outfit.items[s], key(key(f('outfit'), 'items'), s), 'items', 'an item', it => (it.slot !== s ? 'whose slot is ' + it.slot + ', not ' + s : ''));
    if (v.outfit && v.outfit.swatches) for (const s of Object.keys(v.outfit.swatches)) {
      const name = v.outfit.swatches[s], l = localOf(pack, name), p = key(key(f('outfit'), 'swatches'), s);
      if (l !== null && !(pack.swatches && has(pack.swatches, s) && has(pack.swatches[s], l))) fail(p, 'names a ' + s + ' swatch, ' + quote(name) + ', that the pack does not have');
    }
    if (v.scenes) {
      if (v.scenes.quiet) v.scenes.quiet.forEach((n, i) => look(n, idx(key(f('scenes'), 'quiet'), i), 'scenes', 'a scene'));
      if (v.scenes.for) for (const c of Object.keys(v.scenes.for)) look(v.scenes.for[c], key(key(f('scenes'), 'for'), c), 'scenes', 'a scene');
    }
    if (v.cast) for (const r of Object.keys(v.cast)) look(v.cast[r], key(f('cast'), r), 'cast', 'a cast member', m => (m.role !== r ? 'whose role is ' + m.role + ', not ' + r : ''));
    if (has(v, 'props')) look(v.props, f('props'), 'props', 'a prop set');
    if (has(v, 'overlay')) look(v.overlay, f('overlay'), 'overlays', 'an overlay');
    if (has(v, 'words')) look(v.words, f('words'), 'words', 'a word set');
    if (has(v, 'picture')) look(v.picture, f('picture'), 'scenes', 'a scene');
  }

  /* ---- Step 7 for 1.1: rules ---- */

  /* The x a tile's shapes are drawn at, least and greatest: from the first repeat, at or before
     its from, to the last, before its to. */
  function tileX(t) {
    const fr = form(t.from), to = form(t.to);
    return [bound(fr, false, null, SCENE_RANGE) - t.step + t.phase, bound(to, true, null, SCENE_RANGE)];
  }
  /* The ranges a world shape's scalars are taken over: the screen's edges, and a tile's x. */
  const rangesOf = ctx => Object.assign(ctx.tile ? { x: tileX(ctx.tile) } : {}, SCENE_RANGE, ACT_RANGE);
  const W_SIZE = { w: [0, 'length'], h: [0, 'length'], r: [0, 'radius'], rx: [1, 'radius'], ry: [1, 'radius'], hw0: [0, 'half-width'], hw1: [0, 'half-width'] };
  function worldShapeRanges(s, path, ctx) {
    const R = rangesOf(ctx), wide = LAYERED.includes(ctx.where), O = wide ? WORLD_LIMITS.offset : 512, Lg = wide ? WORLD_LIMITS.length : 512;
    if (s.k === 'fx') {
      // an effect's scalars, in the ranges its table gives them
      const F = effectOf(s.fx, key(path, 'fx')).fields;
      for (const k of Object.keys(F)) {
        if (!has(s, k)) continue;
        const f = F[k], p = key(path, k);
        if (f.kind === 'point') s[k].forEach((v, i) => within(form(v), -O, O, idx(p, i), 'the offset', null, R));
        else if (f.kind === 'offset') within(form(s[k]), -O, O, p, 'the offset', null, R);
        else if (f.kind === 'length') within(form(s[k]), f.lo || 0, Lg, p, 'the length', null, R);
        else if (f.kind === 'term') within(form(s[k]), f.lo, f.hi, p, 'the value', null, R);
      }
      return;
    }
    const top = { w: Lg, h: Lg, r: s.k === 'glow' ? 512 : 256, rx: 256, ry: 256, hw0: 64, hw1: 64 };
    const lo = { w: 0, h: 0, r: s.k === 'glow' ? 1 : 0, rx: 1, ry: 1, hw0: 0, hw1: 0 };
    for (const f of ['p', 'p0', 'p1']) if (has(s, f)) s[f].forEach((v, i) => within(form(v), -O, O, idx(key(path, f), i), 'the offset', null, R));
    if (s.k === 'poly') s.pts.forEach((q, i) => q.forEach((v, j) => within(form(v), -O, O, idx(idx(key(path, 'pts'), i), j), 'the offset', null, R)));
    if (s.k === 'tile') { within(form(s.from), -O, O, key(path, 'from'), 'the offset', null, SCENE_RANGE); within(form(s.to), -O, O, key(path, 'to'), 'the offset', null, SCENE_RANGE); }
    for (const f of Object.keys(W_SIZE)) if (has(s, f)) within(form(s[f]), lo[f], top[f], key(path, f), 'the ' + W_SIZE[f][1], null, R);
    if (has(s, 'clip')) s.clip.forEach((c, i) => { if (c !== null) within(form(c), -O, O, idx(key(path, 'clip'), i), 'the offset', null, R); });
    if (has(s, 'a')) within(form(s.a), 0, 1, key(path, 'a'), 'the alpha', null, R);
  }
  /* The box a world shape paints, [x0, y0, x1, y1], at the ends of its values; a glow (soft light
     off the grid, as the class boxes were measured without) and an effect's own drawing (which
     its table will give) are not counted, an effect's point is. */
  function wextent(pack, s) {
    const sp = v => span2(v), box4 = (x, y, w, h) => [x[0], y[0], x[1] + w[1], y[1] + h[1]];
    switch (s.k) {
      case 'rect': case 'rrect': case 'dith': return box4(sp(s.p[0]), sp(s.p[1]), sp(s.w), sp(s.h));
      case 'ell': { const x = sp(s.p[0]), y = sp(s.p[1]), rx = sp(s.rx)[1], ry = sp(s.ry)[1]; return [x[0] - rx, y[0] - ry, x[1] + rx, y[1] + ry]; }
      case 'poly': return s.pts.map(q => [sp(q[0]), sp(q[1])]).reduce((b, q) => [Math.min(b[0], q[0][0]), Math.min(b[1], q[1][0]), Math.max(b[2], q[0][1]), Math.max(b[3], q[1][1])], [Infinity, Infinity, -Infinity, -Infinity]);
      case 'strip': {
        const g = Math.max(sp(s.hw0)[1], sp(s.hw1)[1]), a = [sp(s.p0[0]), sp(s.p0[1])], b = [sp(s.p1[0]), sp(s.p1[1])], h0 = sp(s.hw0), h1 = sp(s.hw1);
        // a strip whose ends and widths are fixed is the polygon of its four corners, filled as
        // draw.js fills it: in whole columns from the first to the last its corners span when it
        // runs more across than down (whole rows otherwise), each from and to the nearest pixel; so,
        // from a base on a whole pixel, it paints from its first pixel to its last as a polygon of
        // whole points is measured, and as the class boxes were measured on the drawings. A strip
        // with a value that can vary (none in a prop, whose values are all fixed) reaches its widest
        // either way round both ends.
        if ([a[0], a[1], b[0], b[1], h0, h1].every(q => q[0] === q[1])) {
          const x0 = a[0][0], y0 = a[1][0], x1 = b[0][0], y1 = b[1][0], dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
          const cs = [[x0 - px * h0[0], y0 - py * h0[0]], [x1 - px * h1[0], y1 - py * h1[0]], [x1 + px * h1[0], y1 + py * h1[0]], [x0 + px * h0[0], y0 + py * h0[0]]];
          const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]), cols = Math.abs(dx) > Math.abs(dy);
          const along = v => [Math.ceil(Math.min(...v)), Math.floor(Math.max(...v))], across = v => [Math.round(Math.min(...v)), Math.round(Math.max(...v))];
          const ex = cols ? along(xs) : across(xs), ey = cols ? across(ys) : along(ys);
          return [ex[0], ey[0], ex[1], ey[1]];
        }
        return [Math.min(a[0][0], b[0][0]) - g, Math.min(a[1][0], b[1][0]) - g, Math.max(a[0][1], b[0][1]) + g, Math.max(a[1][1], b[1][1]) + g];
      }
      case 'pix': { const x = sp(s.p[0]), y = sp(s.p[1]); return [x[0], y[0], x[1] + s.rows[0].length, y[1] + s.rows.length]; }
      case 'fx': return Array.isArray(s.p) && s.p.length === 2 && s.p.every(v => typeof v === 'number' || isObj(v)) ? [sp(s.p[0])[0], sp(s.p[1])[0], sp(s.p[0])[1], sp(s.p[1])[1]] : null;
      case 'use': {
        const st = pack.stamps[s.stamp], x = sp(s.p[0]), y = sp(s.p[1]);
        let b = null;
        for (const t of st) { const e = wextent(pack, t); if (e) b = b ? [Math.min(b[0], e[0]), Math.min(b[1], e[1]), Math.max(b[2], e[2]), Math.max(b[3], e[3])] : e; }
        return b && [b[0] + x[0], b[1] + y[0], b[2] + x[1], b[3] + y[1]];
      }
      default: return null;
    }
  }
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  /* What a scene lacks to act a condition, or '' when it has it all. */
  function lacks(sc, c) {
    switch (c) {
      case 'attack': return sc.weapon === 'held' ? '' : 'the weapon held';
      case 'wan_down': return LAYERED.some(k => sc[k].some(l => l.when && l.when.includes('cond:wan_down'))) ? '' : 'a layer whose when names cond:wan_down';
      case 'container_unhealthy': case 'night': return sc.bed ? '' : 'a bed';
      case 'disk_full': return new Set(sc.rounds.map(r => r.x)).size >= 2 ? '' : 'rounds at two different spots, to carry the crate between';
      case 'pi_silent': return sc.things.pie.x > sc.spot * U ? '' : 'the pie\'s place to the right of the spot';
      case 'device_down': case 'memory_tight': return sc.quiet ? '' : 'quiet true';
      case 'ssh_session': return sc.seat ? '' : 'a seat';
      case 'updating': return sc.anvil && frameRest(sc.rests[sc.anvil.rest]) ? '' : 'an anvil, with a rest for the weapon';
      case 'streaming': return sc.screen ? '' : 'a screen';
      default: return '';
    }
  }
  function sceneRules(sc, sp) {
    const things = key(sp, 'things'), boxes = {};
    for (const k of Object.keys(PLACE_CLASS)) {
      const pl = sc.things[k], p = key(things, k);
      if (pl.cls !== PLACE_CLASS[k]) fail(key(p, 'cls'), 'must be ' + quote(PLACE_CLASS[k]) + ' for the place ' + k);
      const e = CLASS_BOX[pl.cls], x0 = pl.flip ? -e[2] : e[0], x1 = pl.flip ? -e[0] : e[2];
      const b = boxes[k] = [pl.x + x0, pl.y + e[1], pl.x + x1, pl.y + e[3]];
      if (b[0] < 0 || b[2] > 960 || b[1] < 0 || b[3] > 600) fail(p, 'its class box, ' + b.join(' ') + ', leaves the 960 by 600 grid');
      if (pl.cls === 'high' && pl.y < 300) fail(key(p, 'y'), 'a high place\'s base must be at y 300 or lower, clear of the headline');
      if (pl.cls === 'ground' && (pl.y < 500 || pl.y > 598)) fail(key(p, 'y'), 'a ground place\'s base must be from 500 to 598');
    }
    const ks = Object.keys(boxes);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (overlaps(boxes[ks[i]], boxes[ks[j]])) fail(things, 'the class boxes of ' + ks[i] + ' and ' + ks[j] + ' overlap');
    sc.can.forEach((c, i) => { const why = lacks(sc, c); if (why) fail(idx(key(sp, 'can'), i), 'the scene cannot act ' + quote(c) + ': it needs ' + why); });
    if (sc.hosts.includes('foe') && !sc.foe) fail(key(sp, 'hosts'), 'a scene hosts a foe only with a foe zone, foe');
    let marks = 0;
    const seen = {};
    for (const k of LAYERED) sc[k].forEach((l, i) => {
      const lp = idx(key(sp, k), i);
      for (const s of l.shapes) if (s.k === 'things') marks++;
      for (const g of Object.keys(l.groups || {})) { if (has(seen, g)) fail(key(key(lp, 'groups'), g), 'a group of this name is declared in another layer of the scene'); seen[g] = true; }
      if (l.anim) {
        const done = new Set();
        l.anim.tracks.forEach((t, j) => {
          const d = has(t, 'pal') ? 'pal ' + t.pal : t.g + ' ' + t.ch;
          if (done.has(d)) fail(idx(key(key(lp, 'anim'), 'tracks'), j), 'drives what an earlier track already drives');
          done.add(d);
        });
      }
    });
    if (marks !== 1) fail(sp, 'a scene draws the devices once: it needs exactly one things mark, not ' + marks);
    if (sc.foe) sc.foe.spans.forEach((s, i) => { if (!(s[0] < s[1])) fail(idx(key(key(sp, 'foe'), 'spans'), i), 'from must be below to'); });
    if (sc.foe && sc.foe.wall && !(sc.foe.wall.high[0] < sc.foe.wall.period)) fail(key(key(key(sp, 'foe'), 'wall'), 'high'), 'the width must be less than the period');
    if (sc.target && !(sc.target.hitAt < sc.target.every)) fail(key(key(sp, 'target'), 'hitAt'), 'must be less than every');
  }
  /* Whether every colour a list of shapes uses is one of the down lamp's reds, @lamp.down,
     @lamp.downLo or @lamp.downHi. */
  function downRedOnly(list) {
    let ok = true;
    for (const s of list) eachWColour(s, c => { if (!(typeof c === 'string' && LAMP_REF.test(c))) ok = false; }, '');
    return ok;
  }
  function propRules(pack, v, path) {
    for (const k of Object.keys(v.kinds)) for (const st of ['up', 'gone']) {
      const x = v.kinds[k][st], p = key(key(key(path, 'kinds'), k), st), cb = CLASS_BOX[CLASS_OF[k]];
      const check = (e, q) => { if (e && (e[0] < cb[0] || e[1] < cb[1] || e[2] > cb[2] || e[3] > cb[3])) fail(q, 'paints ' + e.join(' ') + ', outside the ' + CLASS_OF[k] + ' class box, ' + cb.join(' ') + ', from the base'); };
      for (const part of ['still', 'moving']) if (x[part]) x[part].forEach((s, i) => check(wextent(pack, s), idx(key(p, part), i)));
      const L = x.lamp, lp = key(p, 'lamp');
      if (Array.isArray(L)) check([L[0] - 6, L[1] - 6, L[0] + 6, L[1] + 6], lp);
      else {
        check([L.at[0] - L.box[0] / 2, L.at[1] - L.box[1] / 2, L.at[0] + L.box[0] / 2, L.at[1] + L.box[1] / 2], lp);
        for (const f of ['lit', 'dark']) if (!pack.stamps[L[f]].every(s => s.k === 'pix')) fail(key(lp, f), 'a lamp\'s ' + f + ' drawing is a stamp of pix shapes only');
        if (st === 'gone' && !downRedOnly(pack.stamps[L.lit])) fail(key(lp, 'lit'), 'a gone lamp\'s lit drawing uses only the down lamp\'s reds, @lamp.down, @lamp.downLo and @lamp.downHi, so a device that is down blinks red in every world');
      }
    }
  }
  /* WCAG's relative luminance of a hex colour, its contrast on black and its hue in degrees. */
  function luminance(h) {
    const c = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = h => (luminance(h) + 0.05) / 0.05;
  function hue(h) {
    const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return null;
    const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (x * 60 + 360) % 360;
  }
  function overlayRules(v, path) {
    const lp = key(path, 'levels');
    for (const l of Object.keys(LEVELS)) v.levels[l].forEach((c, i) => {
      const [h0, h1, c0, c1] = LEVELS[l], h = hue(c), k = contrast(c), p = idx(key(lp, l), i);
      const inHue = h !== null && (h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1);
      if (!inHue) fail(p, 'the ' + l + ' colour must keep a hue from ' + h0 + ' to ' + h1 + ', not ' + (h === null ? 'none' : Math.round(h)));
      if (k < c0 || k > c1) fail(p, 'the ' + l + ' colour must have a contrast on black from ' + c0 + ' to ' + c1 + ', not ' + Math.round(k * 10) / 10);
    });
    const dimmest = Math.min(...v.levels.ok.map(luminance));
    v.levels.sleep.forEach((c, i) => { if (!(luminance(c) < dimmest)) fail(idx(key(lp, 'sleep'), i), 'the sleep colour must be darker than the ok colours'); });
  }
  function presetRules(pack, v, path) {
    const f = k => key(path, k), missing = p => fail(p, 'is missing, and a preset must be complete');
    for (const k of ['name', 'body', 'outfit', 'scenes', 'cast', 'props', 'overlay', 'words', 'picture']) if (!has(v, k)) missing(f(k));
    for (const k of ['items', 'swatches']) if (!has(v.outfit, k)) missing(key(f('outfit'), k));
    for (const s of DEFAULT_SLOTS) if (!has(v.outfit.items, s)) missing(key(key(f('outfit'), 'items'), s));
    for (const s of Object.keys(USER_SETS)) if (!has(v.outfit.swatches, s)) missing(key(key(f('outfit'), 'swatches'), s));
    for (const k of ['quiet', 'for']) if (!has(v.scenes, k)) missing(key(f('scenes'), k));
    for (const r of ROLES) if (!has(v.cast, r)) missing(key(f('cast'), r));
    const fp = key(f('scenes'), 'for');
    for (const c of CONDITIONS) {
      if (QUIET_CONDITIONS.includes(c)) { if (has(v.scenes.for, c)) fail(key(fp, c), 'has no scene of its own: it is acted in the quiet scene of the moment'); }
      else if (!has(v.scenes.for, c)) missing(key(fp, c));
    }
    const local = n => { const l = localOf(pack, n); return l === null ? null : pack.scenes[l]; };
    v.scenes.quiet.forEach((n, i) => {
      const sc = local(n), p = idx(key(f('scenes'), 'quiet'), i);
      if (!sc) return;
      if (!sc.quiet) fail(p, 'names ' + quote(n) + ', a scene that is not quiet');
      for (const c of QUIET_CONDITIONS) if (!sc.can.includes(c)) fail(p, 'names ' + quote(n) + ', a quiet scene that cannot act ' + quote(c) + ', which plays in the quiet scene of the moment');
    });
    for (const c of Object.keys(v.scenes.for)) { const sc = local(v.scenes.for[c]); if (sc && !sc.can.includes(c)) fail(key(fp, c), 'names ' + quote(v.scenes.for[c]) + ', a scene whose can does not list ' + quote(c)); }
  }
  function worldRules(pack) {
    const P = 'pack';
    eachWorldShape(pack, (s, p, ctx) => {
      worldShapeRanges(s, p, ctx);
      if (s.k === 'poly') polyRule(s, p);
    });
    for (const n of Object.keys(pack.scenes || {})) sceneRules(pack.scenes[n], key(key(P, 'scenes'), n));
    for (const n of Object.keys(pack.cast || {})) {
      const v = pack.cast[n], cp = key(key(P, 'cast'), n);
      if (v.role === 'patron') for (const a of PATRON_ANCHORS) {
        const q = v.anchors[a];
        if (q[0] < -v.box[0] / 2 || q[0] > v.box[0] / 2 || q[1] < -v.box[1] || q[1] > 0) fail(key(key(cp, 'anchors'), a), 'must lie in the patron\'s box, x within half its width and y up to its height above the seat');
      }
      if (v.role === 'foe') {
        const [w, h] = v.sprite.size, [fx, fy] = v.sprite.feet;
        if (fx > w || fy > h) fail(key(key(cp, 'sprite'), 'feet'), 'must lie in the sprite');
        v.crown.forEach((q, i) => { if (q[0] + fx < 0 || q[0] + fx > w || q[1] + fy < 0 || q[1] + fy > h) fail(idx(key(cp, 'crown'), i), 'must lie in the sprite, from its feet'); });
      }
    }
    for (const n of Object.keys(pack.props || {})) propRules(pack, pack.props[n], key(key(P, 'props'), n));
    for (const n of Object.keys(pack.overlays || {})) overlayRules(pack.overlays[n], key(key(P, 'overlays'), n));
    for (const n of Object.keys(pack.words || {})) {
      const v = pack.words[n], wp = key(key(P, 'words'), n);
      // longest first, by the text a template writes itself: what fills a placeholder is the
      // collector's, and {short} is shorter than {n} by its nature
      const fixed = t => Array.from(t.replace(PLACEHOLDER, '')).length;
      for (const sec of ['quiet', 'captions']) if (v[sec]) for (const k of Object.keys(v[sec])) v[sec][k].forEach((t, i) => {
        if (i && fixed(t) > fixed(v[sec][k][i - 1])) fail(idx(key(key(wp, sec), k), i), 'the templates of a part run longest first, by their text outside the placeholders');
      });
    }
    for (const n of Object.keys(pack.worlds || {})) presetRules(pack, pack.worlds[n], key(key(P, 'worlds'), n));
  }

  /* ---- Step 8 for 1.1: counts and costs ---- */

  /* How many bands a world fill paints a row in: a pick, a mix and the down lamp are one colour,
     a set a cast member binds is the user's, and its own palettes are read like the pack's. */
  function wbands(pack, f, ctx) {
    if (Array.isArray(f)) return f.length;
    if (typeof f !== 'string' || f[0] !== '@' || LAMP_REF.test(f)) return 1;
    const m = REF.exec(f), mem = ctx.member;
    if (m[1] === 'pick') return 1;
    if (mem && ((mem.sets && has(mem.sets, m[1])) || (mem.palettes && has(mem.palettes, m[1])))) {
      if (mem.sets && has(mem.sets, m[1])) return USER_SETS[mem.sets[m[1]]][m[2]] === 'bands' ? LIMITS.bands : 1;
      return wbands(pack, mem.palettes[m[1]][m[2]], ctx);
    }
    return bandCount(pack, f);
  }
  /* What a world shape costs and adds to the counts: { cost, n, glows, effects, tiles }, a tile
     with its repeats and a stamp with its shapes counted out. An effect costs what its own cost
     function gives for its fields at the ends of the ranges they lean on, its glows among them. */
  function wcost(pack, s, ctx) {
    const R = rangesOf(ctx), one = { cost: 0, n: 1, glows: 0, effects: 0, tiles: 0 };
    switch (s.k) {
      case 'glow': return Object.assign(one, { cost: 3, glows: 1 });
      case 'dith': return Object.assign(one, { cost: Math.ceil(Math.max(0, span2(s.h, R)[1]) / 2) * Math.ceil(Math.max(0, span2(s.w, R)[1]) / 4) });
      case 'fx': {
        const fx = effectOf(s.fx, 'fx'), b = fxBounds(s, fx.fields, R), c = fx.cost(b), g = fx.glows(b);
        return Object.assign(one, { cost: Number.isFinite(c) ? Math.ceil(c) : Infinity, glows: Number.isFinite(g) ? g : Infinity, effects: 1 });
      }
      case 'use': {
        const t = { cost: 0, n: 0, glows: 0, effects: 0, tiles: 0 };
        for (const x of pack.stamps[s.stamp]) addCost(t, wcost(pack, x, { where: 'stamp' }), 1);
        return t;
      }
      case 'tile': {
        const xs = tileX(s), reps = Math.max(0, Math.floor((xs[1] - xs[0]) / s.step) + 1), t = { cost: 0, n: 0, glows: 0, effects: 0, tiles: 1 };
        const inner = { cost: 0, n: 0, glows: 0, effects: 0, tiles: 0 }, c = Object.assign({}, ctx, { tile: s });
        for (const x of s.shapes) addCost(inner, wcost(pack, x, c), 1);
        addCost(t, inner, reps);
        return t;
      }
      default:
        // the weapon at a rest that names a stamp: the stamp twice, under each end of the blade
        if (s.k === 'rest' && s.slot === 'main' && ctx.scene && ctx.scene.rests && ctx.scene.rests[s.at] && ctx.scene.rests[s.at].stamp !== undefined) {
          const t = zero();
          for (const x of pack.stamps[ctx.scene.rests[s.at].stamp]) addCost(t, wcost(pack, x, { where: 'stamp' }), REST_STAMPS);
          return t;
        }
        if (MARKS.includes(s.k)) return one;
        return Object.assign(one, { cost: shapeCost(pack, s, 'scene', R, s.k === 'pix' ? 1 : wbands(pack, s.fill, ctx)) });
    }
  }
  /* An effect's fields as its cost function takes them (effects.js): each scalar its least and
     greatest over the ranges R, a point two of those, any other field its value, a field left out
     its default, and the screen's edges in view. */
  function fxBounds(s, F, R) {
    const b = { view: { L: R.L, R: R.R, T: R.T, W: R.W } };
    for (const k of Object.keys(F)) {
      const v = has(s, k) ? s[k] : F[k].def, kind = F[k].kind;
      b[k] = kind === 'point' ? [span2(v[0], R), span2(v[1], R)] : FX_SCALARS.includes(kind) ? span2(v, R) : v;
    }
    return b;
  }
  function addCost(t, c, times) { for (const k of ['cost', 'n', 'glows', 'effects']) t[k] += c[k] * times; t.tiles += c.tiles; }
  const zero = () => ({ cost: 0, n: 0, glows: 0, effects: 0, tiles: 0 });
  function listCost(pack, list, ctx) { const t = zero(); for (const s of list) addCost(t, wcost(pack, s, ctx), 1); return t; }
  function worldCounts(pack) {
    const P = 'pack', L = WORLD_LIMITS, out = { scenes: {}, cast: {}, props: {}, stamps: {} };
    // fail at path when got passes lim: "<before> <got> <after>, more than <lim>"
    const cap = (p, got, lim, before, after) => { if (got > lim) fail(p, before + ' ' + got + ' ' + after + ', more than ' + lim); };
    for (const [sec, lim, what] of [['stamps', L.stamps, 'stamps'], ['scenes', L.scenes, 'scenes'], ['cast', L.cast, 'cast members'], ['props', L.props, 'prop sets'],
      ['words', L.words, 'word sets'], ['overlays', L.overlays, 'overlays'], ['worlds', L.worlds, 'worlds']]) cap(key(P, sec), Object.keys(pack[sec] || {}).length, lim, 'holds', what);
    for (const n of Object.keys(pack.stamps || {})) out.stamps[n] = listCost(pack, pack.stamps[n], { where: 'stamp' }).cost;
    for (const n of Object.keys(pack.scenes || {})) {
      const v = pack.scenes[n], sp = key(key(P, 'scenes'), n);
      cap(sp, v.still.length + v.moving.length + v.over.length, L.layers, 'holds', 'layers');
      const still = zero(), frame = zero();
      for (const l of v.still) addCost(still, listCost(pack, l.shapes, { where: 'still', scene: v }), 1);
      for (const k of ['moving', 'over']) for (const l of v[k]) addCost(frame, listCost(pack, l.shapes, { where: k, scene: v }), 1);
      // the pole, once under each of the three high places
      if (v.pole) addCost(frame, listCost(pack, v.pole, { where: 'pole' }), 3);
      cap(sp, still.tiles + frame.tiles, L.tiles, 'holds', 'tiles');
      cap(sp, still.effects + frame.effects, L.effects, 'draws', 'effects, tiles counted out');
      cap(key(sp, 'still'), still.n, L.stillShapes, 'draws', 'shapes, tiles and stamps counted out');
      cap(key(sp, 'still'), still.cost, L.stillCost, 'costs up to', 'fills');
      cap(sp, frame.n, L.frameShapes, 'draws', 'shapes in one frame of its moving and over layers, tiles and stamps counted out');
      cap(sp, frame.cost, L.frameCost, 'costs up to', 'fills in one frame of its moving and over layers');
      cap(sp, frame.glows, L.glows, 'draws', 'glows in one frame');
      out.scenes[n] = { still: { n: still.n, cost: still.cost }, frame: { n: frame.n, cost: frame.cost, glows: frame.glows } };
    }
    for (const n of Object.keys(pack.cast || {})) {
      const v = pack.cast[n], cp = key(key(P, 'cast'), n), c = { where: v.role, member: v };
      if (v.role === 'patron') {
        const still = v.still.reduce((t, pt) => t + listCost(pack, pt.shapes, c).cost, 0);
        cap(key(cp, 'still'), still, L.patronStill, 'costs up to', 'fills');
        const states = {};
        for (const m of MOUTHS) { states[m] = listCost(pack, v.states[m], c).cost; cap(key(key(cp, 'states'), m), states[m], L.patronState, 'costs up to', 'fills'); }
        out.cast[n] = { still, states };
      } else if (v.role === 'foe') {
        const poses = {};
        for (const x of FOE_POSES) {
          poses[x] = v.poses[x].parts.reduce((t, q) => t + listCost(pack, v.parts[q], c).cost, 0) + listCost(pack, v.poses[x].shapes, c).cost;
          cap(key(key(cp, 'poses'), x), poses[x], L.poseCost, 'costs up to', 'fills');
        }
        out.cast[n] = { poses };
      } else {
        const frames = {};
        for (const x of FLAPS) { frames[x] = listCost(pack, v.frames[x], c).cost; cap(key(key(cp, 'frames'), x), frames[x], L.critterFrame, 'costs up to', 'fills'); }
        frames.dead = listCost(pack, v.dead, c).cost;
        cap(key(cp, 'dead'), frames.dead, L.critterFrame, 'costs up to', 'fills');
        out.cast[n] = { frames };
      }
    }
    for (const n of Object.keys(pack.props || {})) {
      out.props[n] = {};
      for (const k of Object.keys(pack.props[n].kinds)) {
        out.props[n][k] = {};
        for (const st of ['up', 'gone']) {
          const x = pack.props[n].kinds[k][st], p = key(key(key(key(key(P, 'props'), n), 'kinds'), k), st), c = { where: 'prop', kind: k };
          const still = listCost(pack, x.still, c).cost;
          // a lamp of the kind's own, its lit and dark drawings, moves with the lamp's loop
          const moving = (x.moving ? listCost(pack, x.moving, c).cost : 0) + (Array.isArray(x.lamp) ? 0 : out.stamps[x.lamp.lit] + out.stamps[x.lamp.dark]);
          cap(key(p, 'still'), still, L.kindStill, 'costs up to', 'fills');
          cap(p, moving, L.kindMoving, 'costs up to', 'fills in its moving part and its own lamp');
          out.props[n][k][st] = { still, moving };
        }
      }
    }
    return freeze(out);
  }

  /* ---- Step 9 and looks: compiling to records --------------------------------------------------- */

  const RH = 0, RV = 1, ELL = 2, RRECT = 3, POLY = 4, STRIP = 5, PIX = 6;
  const rgba = c => 'rgba(' + parseInt(c.rgb.slice(1, 3), 16) + ',' + parseInt(c.rgb.slice(3, 5), 16) + ',' + parseInt(c.rgb.slice(5, 7), 16) + ',' + c.a + ')';
  /* A literal colour or band list (no references) as the primitives take it. */
  function literal(v) {
    if (Array.isArray(v)) return freeze(v.map(b => [b[0], literal(b[1])]));
    return typeof v === 'string' ? v : rgba(v);
  }
  /* A colour or fill, references resolved against pal: { base, skin, hair, tabard, plume, own }. */
  function resolveFill(v, pal) {
    if (Array.isArray(v)) return freeze(v.map(b => [b[0], resolveFill(b[1], pal)]));
    if (isObj(v)) return rgba(v);
    if (v[0] !== '@') return v;
    const m = REF.exec(v), set = m[1];
    const sets = set === 'base' ? BASE : has(USER_SETS, set) ? pal[set] : pal.own[set];
    return sets[m[2]];
  }
  /* The pack's own palettes, with their references to @base resolved. */
  function ownPalettes(pack) {
    const out = {};
    for (const s of Object.keys(pack.palettes || {})) {
      out[s] = {};
      for (const e of Object.keys(pack.palettes[s])) out[s][e] = resolveFill(pack.palettes[s][e], { own: {} });
    }
    return freeze(out);
  }

  /* A scalar compiled: a number, or [c, value index, coefficient, ...] for the named values the
     engine sets each frame. The build's differences are folded into c here. */
  function cscalar(v, env, side, shift) {
    if (typeof v === 'number') return v + shift;
    let c = (has(v, 'c') ? v.c : 0) + shift;
    const t = [];
    for (const n of Object.keys(v)) {
      if (n === 'c' || v[n] === 0) continue;
      if (has(env.diffs, n)) c += v[n] * env.diffs[n];
      else t.push(VALUE[n === 'step' ? (side === 'L' ? 'stepL' : 'stepR') : n], v[n]);
    }
    return t.length ? [c].concat(t) : c;
  }
  /* Where a named anchor is: its index, and the offset folded into points hung on it (the helmet's
     mount for the plume, the shield's hold point for the off hand). */
  function place(name, side, env) {
    if (name === 'plume') return env.plume;
    if (name === 'off') return { a: ANCHOR.off, dx: -env.hold[0], dy: -env.hold[1] };
    if (name === 'rest') return env.rest;
    const n = has(SIDED, name) ? SIDED[name][side === 'L' ? 0 : 1] : name;
    return { a: ANCHOR[n], dx: 0, dy: 0 };
  }
  function cpoint(v, at, side, env) {
    if (Array.isArray(v)) return { m: 0, a: at.a, x: cscalar(v[0], env, side, at.dx), y: cscalar(v[1], env, side, at.dy), s: 0, p: 0 };
    if (has(v, 'frame')) return { m: 1, a: MAIN, x: has(v, 'x') ? cscalar(v.x, env, side, 0) : 0, y: has(v, 'y') ? cscalar(v.y, env, side, 0) : 0, s: v.s, p: v.p };
    const q = place(v.at, side, env);
    return { m: 0, a: q.a, x: cscalar(v.x, env, side, q.dx), y: cscalar(v.y, env, side, q.dy), s: 0, p: 0 };
  }
  function record(k, a) {
    return { k, a, f: null, sf: false, p: null, w: 0, h: 0, r: 0, rx: 0, ry: 0, c0: null, c1: null, pts: null, buf: null, dir: 0, p0: null, p1: null, hw0: 0, hw1: 0, pw: 0, ph: 0, pf: null };
  }
  function cshape(s, at, side, env) {
    const an = has(s, 'at') ? place(s.at, side, env) : at;
    const r = record(0, an.a), sc = v => cscalar(v, env, side, 0), pt = v => cpoint(v, an, side, env);
    if (has(s, 'fill')) { r.f = resolveFill(s.fill, env.pal); r.sf = s.fill === '@skin.face'; }
    if (has(s, 'clip')) { r.c0 = s.clip[0] === null ? null : cscalar(s.clip[0], env, side, an.dy); r.c1 = s.clip[1] === null ? null : cscalar(s.clip[1], env, side, an.dy); }
    switch (s.k) {
      case 'rect': r.k = typeof r.f === 'string' ? RH : RV; r.p = pt(s.p); r.w = sc(s.w); r.h = sc(s.h); break;
      case 'ell': r.k = ELL; r.p = pt(s.p); r.rx = sc(s.rx); r.ry = sc(s.ry); break;
      case 'rrect': r.k = RRECT; r.p = pt(s.p); r.w = sc(s.w); r.h = sc(s.h); r.r = sc(s.r); break;
      case 'poly': r.k = POLY; r.pts = s.pts.map(pt); r.buf = s.pts.map(() => [0, 0]); r.dir = s.dir === 'rows' ? 0 : s.dir === 'cols' ? 1 : 2; break;
      case 'strip': r.k = STRIP; r.p0 = pt(s.p0); r.p1 = pt(s.p1); r.hw0 = sc(s.hw0); r.hw1 = sc(s.hw1); break;
      case 'pix': {
        r.k = PIX; r.p = pt(s.p); r.pw = s.rows[0].length; r.ph = s.rows.length;
        const km = {}, w = r.pw, grid = [];
        for (const ch of Object.keys(s.key)) km[ch] = resolveFill(s.key[ch], env.pal);
        for (const row of s.rows) for (const ch of row) grid.push(ch === '.' ? null : km[ch]);
        r.pf = (i, j) => grid[j * w + i];
        break;
      }
    }
    return r;
  }
  function cparts(list, env, out) {
    for (const pt of list) {
      const at = place(pt.at, pt.side, env);
      for (const s of pt.shapes) out.push(cshape(s, at, pt.side, env));
    }
    return out;
  }
  function cshapes(list, at, env, out) { for (const s of list) out.push(cshape(s, at, undefined, env)); return out; }

  /* The constant offset of a mount point, its build terms folded. */
  function mount(v, env) { return [cscalar(v[0], env, undefined, 0), cscalar(v[1], env, undefined, 0)]; }

  /* Every list a look draws. c: { build, diffs, pal (per pack id), items: slot -> { pack, item } }. */
  function compileLists(c) {
    const env = (x, extra) => Object.assign({ diffs: c.diffs, pal: c.pal(x.pack), hold: [0, 0], plume: null, rest: { a: ANCHOR.rest, dx: 0, dy: 0 } }, extra);
    const L = { body: [], headOn: [], headOff: [], pauldrons: [], armL: [], armR: [], gauntL: [], gauntR: [], main: [], off: [], restHelmet: [], restOff: [] };
    const it = s => c.items[s] || null;
    for (const s of ['back', 'legs', 'boots', 'torso']) if (it(s)) cparts(it(s).item.parts, env(it(s)), L.body);
    const helmet = it('helmet'), plume = it('plume'), hair = it('hair');
    if (hair && hair.item.views) cparts(hair.item.views.helmeted, env(hair), L.headOn);
    if (helmet && plume && helmet.item.mounts) {
      const m = mount(helmet.item.mounts.plume, env(helmet));
      cparts(plume.item.parts, env(plume, { plume: { a: ANCHOR.head, dx: m[0], dy: m[1] } }), L.headOn);
    }
    if (helmet) cparts(helmet.item.parts, env(helmet), L.headOn);
    const head = { pack: c.build.pack, item: c.build.pack.items[c.build.b.head] };
    cparts(head.item.parts, env(head), L.headOff);
    if (hair) cparts(hair.item.parts, env(hair), L.headOff);
    if (it('pauldrons')) cparts(it('pauldrons').item.parts, env(it('pauldrons')), L.pauldrons);
    for (const [s, l, r] of [['arms', L.armL, L.armR], ['gauntlets', L.gauntL, L.gauntR]]) {
      if (!it(s)) continue;
      for (const pt of it(s).item.parts) cparts([pt], env(it(s)), pt.side === 'L' ? l : r);
    }
    if (it('main')) cparts(it('main').item.parts, env(it('main')), L.main);
    const off = it('off');
    if (off) cparts(off.item.parts, env(off, { hold: off.item.hold }), L.off);
    if (helmet && helmet.item.rest) {
      // the plume first, behind the helmet, as on the worn helmet
      if (plume && plume.item.rest && helmet.item.rest.mounts) {
        const m = mount(helmet.item.rest.mounts.plume, env(helmet)), at = { a: ANCHOR.rest, dx: m[0], dy: m[1] };
        cshapes(plume.item.rest.shapes, at, env(plume, { rest: at }), L.restHelmet);
      }
      cshapes(helmet.item.rest.shapes, { a: ANCHOR.rest, dx: 0, dy: 0 }, env(helmet), L.restHelmet);
    }
    if (off && off.item.rest) cshapes(off.item.rest.shapes, { a: ANCHOR.rest, dx: 0, dy: 0 }, env(off), L.restOff);
    return L;
  }

  /* Placeholder colours for compiling a pack on its own, with no look chosen. */
  const NEUTRAL = (() => {
    const out = {}, g = '#808080', b = [[1, g]];
    for (const set of Object.keys(USER_SETS)) { out[set] = {}; for (const e of Object.keys(USER_SETS[set])) out[set][e] = USER_SETS[set][e] === 'bands' ? b : g; }
    return freeze(out);
  })();
  const ZERO_DIFFS = freeze(DIFFS.reduce((o, n) => { o[n] = 0; return o; }, {}));

  const EASE = { step: 0, linear: 1, smooth: 2 };
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function compileAnim(a) {
    return freeze({ period: a.period, loop: a.loop, phase: has(a, 'phase') ? a.phase : 0,
      tracks: a.tracks.map(t => ({ g: has(t, 'g') ? t.g : null, ch: has(t, 'ch') ? t.ch : null, pal: has(t, 'pal') ? t.pal : null,
        ease: t.ch === 'show' ? 0 : EASE[t.ease], times: t.keys.map(k => k[0]), values: t.keys.map(k => (has(t, 'pal') ? rgb(k[1]) : k[1])) })) });
  }
  function compileDecoration(v, cost) {
    return freeze({ name: v.name, fits: v.fits.slice(), box: v.box.slice(), cost,
      groups: Object.keys(v.groups || {}).map(n => ({ name: n, pivot: v.groups[n].pivot.slice() })), anim: v.anim ? compileAnim(v.anim) : null });
  }

  /* Step 9: compiles every item of the pack with placeholder colours and the reference build, and
     every decoration's keyframes, then returns the loaded pack. */
  function compileItem(v, pal) {
    const at0 = { a: ANCHOR.rest, dx: 0, dy: 0 };
    const env = { diffs: ZERO_DIFFS, pal, hold: v.hold || [0, 0], plume: { a: ANCHOR.head, dx: 0, dy: 0 }, rest: at0 }, out = [];
    cparts(v.parts, env, out);
    if (v.views) cparts(v.views.helmeted, env, out);
    if (v.mounts) mount(v.mounts.plume, env);
    if (v.rest) { cshapes(v.rest.shapes, at0, env, out); if (v.rest.mounts) mount(v.rest.mounts.plume, env); }
    return out;
  }
  function load(pack, signed, c) {
    const own = ownPalettes(pack), items = pack.items || {}, pal = Object.assign({ own }, NEUTRAL);
    for (const i of live(items)) compileItem(items[i], pal);
    const swatches = {};
    for (const set of Object.keys(pack.swatches || {})) {
      swatches[set] = {};
      for (const s of Object.keys(pack.swatches[set])) {
        const e = pack.swatches[set][s].entries, out = {};
        for (const n of Object.keys(e)) out[n] = literal(e[n]);
        swatches[set][s] = { name: pack.swatches[set][s].name, entries: out };
      }
    }
    const decorations = {};
    for (const d of Object.keys(pack.decorations || {})) decorations[d] = compileDecoration(pack.decorations[d], c.decor[d]);
    const out = { ok: true, id: pack.id, version: pack.version, name: pack.name, licence: pack.licence, format: pack.format.slice(),
      provides: pack.provides.slice(), signed, data: freeze(pack), own, swatches, decorations, sums: freeze(c.sums) };
    // a 1.1 pack's world sections are kept as data, in data, with what the counts step found; nothing
    // of them is compiled yet
    if (c.world) out.world = c.world;
    return freeze(out);
  }

  /* ---- read() ----------------------------------------------------------------------------------- */

  /* Checks the text of a pack file, in the order of docs/packs.md, and stops at the first failure.
     opts: allowUnsigned (accept a pack with no sig; a dev page only), keys (kid -> 32-byte
     Uint8Array; KEYS by default), verify(publicKey, message, signature) -> boolean (KW.ed25519.verify
     by default). Returns the loaded pack, or { ok: false, step, reason, id } where id is the pack's
     id when it could be read. Never throws. */
  function read(textIn, opts) {
    let pid;
    try {
      step = 'size';
      const o = isObj(opts) ? opts : {};
      if (typeof textIn !== 'string') fail('', 'a pack must be given as text');
      if (textIn.length > LIMITS.text || utf8Length(textIn) > LIMITS.text) fail('', 'the file is larger than 512 KiB');
      step = 'json';
      const problem = scan(textIn);
      if (problem) fail('', problem);
      let env;
      try { env = JSON.parse(textIn); } catch (e) { fail('', 'the file is not valid JSON'); }
      sweep(env, '');
      step = 'envelope';
      if (!isObj(env)) fail('', 'the file must hold a JSON object, the envelope');
      obj(env, '', ['kwpack', 'pack', 'sig'], ['kwpack', 'pack']);
      if (env.kwpack !== 1) fail('kwpack', 'must be 1');
      if (!isObj(env.pack)) fail('pack', 'must be an object');
      if (typeof env.pack.id === 'string' && PACK_ID.test(env.pack.id)) pid = env.pack.id;
      if (has(env, 'sig') && !isObj(env.sig)) fail('sig', 'must be an object');
      step = 'signature';
      const signed = signature(env, o);
      step = 'format';
      const f = env.pack.format;
      if (!Array.isArray(f) || f.length !== 2 || !Number.isInteger(f[0]) || !Number.isInteger(f[1]) || f[1] < 0) fail('pack.format', 'must be [major, minor], two whole numbers');
      if (f[0] !== FORMAT[0]) fail('pack.format', 'is major version ' + f[0] + ', and this engine reads major version ' + FORMAT[0]);
      if (f[1] > FORMAT[1]) fail('pack.format', 'is ' + f[0] + '.' + f[1] + ', newer than this engine\'s ' + FORMAT.join('.'));
      step = 'fields'; fields(env.pack);
      step = 'references'; references(env.pack);
      step = 'rules'; rules(env.pack);
      step = 'counts'; const c = counts(env.pack);
      step = 'compile';
      return load(env.pack, signed, c);
    } catch (e) {
      const out = e instanceof Reject ? { ok: false, step: e.step, reason: e.reason } : { ok: false, step: step || 'size', reason: 'the pack could not be checked' };
      if (pid) out.id = pid;
      return out;
    }
  }
  function signature(env, o) {
    if (!has(env, 'sig')) {
      if (o.allowUnsigned === true) return false;
      fail('sig', 'is missing, and this page accepts only signed packs');
    }
    const sig = obj(env.sig, 'sig', ['alg', 'kid', 'value'], ['alg', 'kid', 'value']);
    if (sig.alg !== 'ed25519') fail('sig.alg', 'must be "ed25519"');
    if (typeof sig.kid !== 'string' || !KID.test(sig.kid)) fail('sig.kid', 'must be a key id');
    const keys = isObj(o.keys) ? o.keys : KEYS, pub = has(keys, sig.kid) ? keys[sig.kid] : null;
    if (!(pub instanceof Uint8Array) || pub.length !== 32) fail('sig.kid', 'names a key this page does not know, ' + quote(sig.kid));
    const bytes = base64(sig.value);
    if (!bytes || bytes.length !== 64) fail('sig.value', 'must be 64 bytes in base64');
    const verify = typeof o.verify === 'function' ? o.verify : KW.ed25519 && typeof KW.ed25519.verify === 'function' ? KW.ed25519.verify : null;
    if (!verify) fail('sig', 'cannot be checked: no verifier is loaded');
    let good = false;
    try { good = verify(pub, message(env.pack), bytes) === true; } catch (e) { good = false; }
    step = 'signature';
    if (!good) fail('sig.value', 'does not verify for this pack with key ' + quote(sig.kid));
    return true;
  }

  /* ---- Many packs, and looks -------------------------------------------------------------------- */

  function cmpVersion(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }
  /* Gathers the results of read() into the set of packs in use: the higher version of two with one
     id, and at most LIMITS.packs packs. The base pack is taken first, so the cap never turns it
     away. Returns { packs: Map(id -> pack), rejected, superseded }. */
  function gather(results) {
    const packs = new Map(), rejected = [], superseded = [], list = Array.isArray(results) ? results : [];
    const ordered = list.filter(r => r && r.ok === true && r.id === BASE_ID).concat(list.filter(r => !(r && r.ok === true && r.id === BASE_ID)));
    for (const r of ordered) {
      if (!r || r.ok !== true) { rejected.push(r); continue; }
      const old = packs.get(r.id);
      if (old) {
        if (cmpVersion(r.version, old.version) > 0) { packs.set(r.id, r); superseded.push(old); } else superseded.push(r);
        continue;
      }
      if (packs.size >= LIMITS.packs) { rejected.push({ ok: false, id: r.id, step: 'counts', reason: 'more than ' + LIMITS.packs + ' packs are loaded at once' }); continue; }
      packs.set(r.id, r);
    }
    return { packs, rejected, superseded };
  }
  function packMap(lib) {
    if (lib instanceof Map) return lib;
    if (lib && lib.packs instanceof Map) return lib.packs;
    if (Array.isArray(lib)) return gather(lib).packs;
    return new Map();
  }
  /* "<pack id>/<local id>" split, or null. */
  function split(name) {
    if (typeof name !== 'string') return null;
    const i = name.indexOf('/');
    if (i < 0 || name.indexOf('/', i + 1) >= 0) return null;
    return [name.slice(0, i), name.slice(i + 1)];
  }

  /* Turns a look { build, items: { slot: "<pack>/<item>" }, swatches: { set: "<pack>/<swatch>" } }
     into the lists the engine draws, falling back to the base pack's defaults for anything that is
     missing or unusable, for a shield without a one-handed weapon, for a plume that would leave its
     helmet's reach, and for a look over the shape cap or the cost cap. Returns { ok: false, reason: 'no base pack' } when the
     base pack is not loaded. Otherwise { ok: true, look, fallbacks, ignored, m, diffs, colours,
     grip, blade, plumeShown, shapes, cost, lists }; each fallback is { kind, key, wanted, used, reason }. */
  function resolve(lib, lookIn) {
    const packs = packMap(lib), base = packs.get(BASE_ID);
    if (!base) return { ok: false, reason: 'no base pack', fallbacks: [], ignored: [] };
    const look = isObj(lookIn) ? lookIn : {}, D = base.data.defaults, fallbacks = [], ignored = [];
    const asked = (o, k) => (isObj(o) && has(o, k) ? o[k] : undefined);
    const why = (name, find) => {
      if (name === undefined) return 'not set';
      const s = split(name);
      if (!s) return 'not a "<pack>/<id>" name';
      const p = packs.get(s[0]);
      if (!p) return 'pack not loaded';
      return find(p, s[1]);
    };
    // the build
    let build = null;
    const wantB = asked(look, 'build');
    const rb = why(wantB, (p, b) => {
      if (p !== base || !has(base.data.builds, b)) return 'no such build';
      build = b;
      return '';
    });
    if (rb) { build = D.build; fallbacks.push({ kind: 'build', key: 'build', wanted: wantB === undefined ? null : wantB, used: BASE_ID + '/' + build, reason: rb }); }
    // the items
    const chosen = {}, defaults = {};
    for (const slot of LOOK_SLOTS) {
      defaults[slot] = has(D.items, slot) ? { pack: base, id: D.items[slot] } : null;
      const want = asked(look.items, slot);
      let got = null;
      const r = why(want, (p, i) => {
        const items = p.data.items || {};
        if (!has(items, i) || items[i].slot === 'companion') return 'no such item';
        if (items[i].slot !== slot) return 'the item is for the ' + items[i].slot + ' slot';
        got = { pack: p, id: i };
        return '';
      });
      if (r && !(want === undefined && !defaults[slot])) fallbacks.push({ kind: 'item', key: slot, wanted: want === undefined ? null : want, used: defaults[slot] ? BASE_ID + '/' + defaults[slot].id : null, reason: r });
      chosen[slot] = r ? defaults[slot] : got;
    }
    if (isObj(look.items)) for (const k of Object.keys(look.items)) if (!LOOK_SLOTS.includes(k)) ignored.push({ key: k, reason: k === 'head' ? 'the head comes from the build' : k === 'companion' ? 'reserved' : 'not a slot' });
    // the swatches
    const sw = {}, swName = {};
    for (const set of Object.keys(USER_SETS)) {
      const want = asked(look.swatches, set);
      const r = why(want, (p, s) => {
        if (!(p.swatches[set] && has(p.swatches[set], s))) return 'no such swatch';
        sw[set] = p.swatches[set][s].entries; swName[set] = p.id + '/' + s;
        return '';
      });
      if (r) {
        sw[set] = base.swatches[set][D.swatches[set]].entries; swName[set] = BASE_ID + '/' + D.swatches[set];
        fallbacks.push({ kind: 'swatch', key: set, wanted: want === undefined ? null : want, used: swName[set], reason: r });
      }
    }
    if (isObj(look.swatches)) for (const k of Object.keys(look.swatches)) if (!has(USER_SETS, k)) ignored.push({ key: k, reason: 'not a swatch set' });
    const palCache = new Map();
    const pal = p => { if (!palCache.has(p.id)) palCache.set(p.id, Object.assign({ own: p.own }, sw)); return palCache.get(p.id); };
    const itemOf = c => c.pack.data.items[c.id];
    const same = (a, b) => !!(a && b && a.pack === b.pack && a.id === b.id);
    const name = c => (c ? c.pack.id + '/' + c.id : null);
    const diffsOf = () => {
      const b = base.data.builds[build], diffs = {};
      MEASURES.forEach((m, i) => { diffs[DIFFS[i]] = b.m[m[0]] - m[1]; });
      return diffs;
    };
    const totals = () => lookTotals({ items: s => (chosen[s] ? { item: itemOf(chosen[s]), sum: chosen[s].pack.sums[chosen[s].id] } : null),
      head: { item: base.data.items[base.data.builds[build].head], sum: base.sums[base.data.builds[build].head] } });
    const drop = (slot, reason) => {
      fallbacks.push({ kind: 'item', key: slot, wanted: name(chosen[slot]), used: name(defaults[slot]), reason });
      chosen[slot] = defaults[slot];
    };
    /* Fall back until a shield goes only with a one-handed weapon, the plume stays within reach of
       its helmet's mount and the look is within the shape cap and the cost cap: the shield for the
       first, the plume and then the helmet for the second, slot by slot in drawing order and then
       the build for the caps. Each step puts one more thing back to its default, and the base
       pack's default look passes all three, so the loop ends. */
    let t;
    for (let guard = 0; guard < 64; guard++) {
      if (chosen.off && !(chosen.main && itemOf(chosen.main).grip.kind === 'one')) { drop('off', 'a shield is carried only with a one-handed weapon'); continue; }
      const h = chosen.helmet, pl = chosen.plume;
      const problem = h && pl ? plumeProblem(itemOf(pl), itemOf(h), diffsOf()) : '';
      if (problem) {
        if (!same(pl, defaults.plume)) drop('plume', 'does not fit the helmet: ' + problem);
        else if (!same(h, defaults.helmet)) drop('helmet', 'its mount carries the plume out of range: ' + problem);
        else break;
        continue;
      }
      t = totals();
      const over = t.n > LIMITS.lookShapes ? 'over the ' + LIMITS.lookShapes + '-shape cap' : t.cost > LIMITS.lookCost ? 'over the cost cap of ' + LIMITS.lookCost + ' fills' : '';
      if (!over) break;
      const slot = LOOK_SLOTS.find(s => chosen[s] && !same(chosen[s], defaults[s]));
      if (slot) { drop(slot, over); continue; }
      if (build === D.build) break;
      fallbacks.push({ kind: 'build', key: 'build', wanted: BASE_ID + '/' + build, used: BASE_ID + '/' + D.build, reason: over });
      build = D.build;
    }
    t = totals();
    const b = base.data.builds[build], diffs = diffsOf(), items = {};
    for (const slot of LOOK_SLOTS) if (chosen[slot]) items[slot] = { pack: chosen[slot].pack.data, item: itemOf(chosen[slot]), id: chosen[slot].pack.id };
    const byId = new Map(Array.from(packs.values()).map(p => [p.data, p]));
    const lists = compileLists({ diffs, build: { pack: base.data, b }, items, pal: data => pal(byId.get(data)) });
    const used = { build: BASE_ID + '/' + build, items: {}, swatches: swName };
    for (const slot of LOOK_SLOTS) if (chosen[slot]) used.items[slot] = name(chosen[slot]);
    const main = items.main ? items.main.item : null, m = {};
    MEASURES.forEach(x => { m[x[0]] = b.m[x[0]]; });
    return { ok: true, look: used, fallbacks, ignored, m, diffs, shapes: t.n, cost: t.cost,
      colours: { face: sw.skin.face, sick: sw.skin.sick, hot: sw.skin.hot, cheek: sw.skin.cheek, puff: sw.skin.puff, brow: sw.hair.brow },
      grip: main ? main.grip : null, blade: main && main.blade ? main.blade : null, plumeShown: !!(items.helmet && items.helmet.item.mounts && items.plume), lists };
  }

  /* ---- Drawing ---------------------------------------------------------------------------------- */

  function sv(t, V) {
    if (typeof t === 'number') return t;
    let s = t[0];
    for (let i = 1; i < t.length; i += 2) s += t[i + 1] * V[t[i]];
    return s;
  }
  /* A point: the anchor plus the whole offset, in one addition. A framed point as the greatsword
     computes it: gx + sx * s + px * p, then the screen offset. */
  function ptx(q, A, V) {
    if (q.m === 1) return A[2 * MAIN] + A[FRAME_SX] * q.s + -A[FRAME_SY] * q.p + sv(q.x, V);
    return A[2 * q.a] + sv(q.x, V);
  }
  function pty(q, A, V) {
    if (q.m === 1) return A[2 * MAIN + 1] + A[FRAME_SY] * q.s + A[FRAME_SX] * q.p + sv(q.y, V);
    return A[2 * q.a + 1] + sv(q.y, V);
  }
  /* Draws a compiled list. A: the anchors array (ANCHORS order, then the frame's direction), V: the
     values array (VALUES order), P: the primitives, face: the skin ramp for @skin.face this frame
     (the list's own when left out). Allocates nothing of its own. */
  function draw(list, A, V, P, face) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i], f = r.sf && face !== undefined ? face : r.f;
      const c0 = r.c0 === null ? undefined : A[2 * r.a + 1] + sv(r.c0, V), c1 = r.c1 === null ? undefined : A[2 * r.a + 1] + sv(r.c1, V);
      switch (r.k) {
        case RH: P.Rh(ptx(r.p, A, V), pty(r.p, A, V), sv(r.w, V), sv(r.h, V), f); break;
        case RV: P.Rv(ptx(r.p, A, V), pty(r.p, A, V), sv(r.w, V), sv(r.h, V), f); break;
        case ELL: P.ell(ptx(r.p, A, V), pty(r.p, A, V), sv(r.rx, V), sv(r.ry, V), f, c0, c1); break;
        case RRECT: P.rrect(ptx(r.p, A, V), pty(r.p, A, V), sv(r.w, V), sv(r.h, V), sv(r.r, V), f, c0, c1); break;
        case POLY: {
          const b = r.buf, q = r.pts;
          for (let j = 0; j < q.length; j++) { b[j][0] = ptx(q[j], A, V); b[j][1] = pty(q[j], A, V); }
          P.poly(b, f, r.dir === 1 || (r.dir === 2 && Math.abs(A[FRAME_SX]) > Math.abs(A[FRAME_SY])));
          break;
        }
        case STRIP: P.strip(ptx(r.p0, A, V), pty(r.p0, A, V), ptx(r.p1, A, V), pty(r.p1, A, V), sv(r.hw0, V), sv(r.hw1, V), f); break;
        case PIX: P.pix(ptx(r.p, A, V), pty(r.p, A, V), r.pw, r.ph, r.pf); break;
      }
    }
  }
  const newAnchors = () => new Float64Array(ANCHORS.length * 2 + 2);
  const newValues = () => new Float64Array(VALUES.length);

  /* The drawing order of one frame for each grip mode, as names: the lists of a resolved look, and
     the engine's own steps (crates, face, drumstick, hammer, effects). twoR and twoL are the
     two-handed grip leaning right and left: both arms before the blade, the one on the side it
     leans to first, and the gauntlets after it, the upper hand's first. The one-handed sword is in
     the right hand: one draws the shield's group first and then the sword's; oneCrossed, when the
     sword hand crosses to the shield's side, draws both arms first, then the shield, then the blade
     and last the sword hand's gauntlet, so the sword arm stays behind the shield and the blade
     passes in front of it. The off gauntlet lies behind the shield in every pose. In every mode
     the crates go after the pauldrons and before the hands group, so the arms lie over them. */
  const HANDS = { none: ['armL', 'gauntL', 'armR', 'gauntR'], hammer: ['armL', 'gauntL', 'armR', 'hammer', 'gauntR'],
    twoR: ['armR', 'armL', 'main', 'gauntR', 'gauntL'], twoL: ['armL', 'armR', 'main', 'gauntL', 'gauntR'],
    one: ['armL', 'gauntL', 'off', 'armR', 'main', 'gauntR'], oneCrossed: ['armL', 'gauntL', 'armR', 'off', 'main', 'gauntR'] };
  const ORDERS = freeze(Object.keys(HANDS).reduce((o, m) => {
    const seq = head => ['body', head, 'face', 'drumstick', 'pauldrons', 'crates'].concat(HANDS[m], ['effects']);
    o[m] = { on: seq('headOn'), off: seq('headOff') };
    return o;
  }, {}));
  function sequence(mode, helmet) { return has(ORDERS, mode) ? ORDERS[mode][helmet === false ? 'off' : 'on'] : null; }

  /* ---- Keyframes -------------------------------------------------------------------------------- */

  function sample(tr, u) {
    const T = tr.times, V = tr.values, n = T.length;
    if (n === 1 || u <= T[0]) return V[0];
    if (u >= T[n - 1]) return V[n - 1];
    let i = 0;
    while (T[i + 1] <= u) i++;
    if (tr.ease === 0) return V[i];
    let q = (u - T[i]) / (T[i + 1] - T[i]);
    if (tr.ease === 2) q = q * q * (3 - 2 * q);
    const a = V[i], b = V[i + 1];
    if (Array.isArray(a)) return [0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * q));
    return a + (b - a) * q;
  }
  const hex2 = n => (n < 16 ? '0' : '') + n.toString(16);
  /* A decoration's groups and palette entries at t seconds after it appeared: { groups: { name:
     { dx, dy, scale, alpha, show } }, pal: { "set.entry": "#rrggbb" } }. A pure function of t; a t
     that is not a finite number counts as 0, and a negative one as 0. A vast t on a looping clock
     still lands inside one period. */
  function animate(dec, t) {
    const out = { groups: {}, pal: {} }, a = dec && dec.anim;
    for (const g of (dec && dec.groups) || []) out.groups[g.name] = { dx: 0, dy: 0, scale: 1, alpha: 1, show: 1 };
    if (!a) return out;
    const tt = Number.isFinite(t) && t > 0 ? t : 0;
    let u;
    if (a.loop) {
      // below 2^52 periods the quotient keeps its fraction; past that, the remainder does
      const q = tt / a.period, x = a.phase + (q < 4503599627370496 ? q - Math.floor(q) : (tt % a.period) / a.period);
      u = x - Math.floor(x);
    } else u = Math.min(1, a.phase + tt / a.period);
    if (!(u >= 0 && u <= 1)) u = 0;
    for (const tr of a.tracks) {
      const v = sample(tr, u);
      if (tr.pal) out.pal[tr.pal] = '#' + hex2(v[0]) + hex2(v[1]) + hex2(v[2]);
      else out.groups[tr.g][tr.ch] = tr.ch === 'dx' || tr.ch === 'dy' ? Math.round(v) + 0 : v;
    }
    return out;
  }
  /* Whether a decoration may go in a scene's place { kind, w, h }. */
  const fitsPlace = (dec, pl) => !!(dec && pl && dec.fits.includes(pl.kind) && dec.box[0] <= pl.w && dec.box[1] <= pl.h);

  /* The closed lists format 1.1 names, which the engine takes over as it is built. */
  const WORLD_LISTS = freeze({ CONDITIONS: CONDITIONS.slice(), ROUND_ACTS: ROUND_ACTS.slice(), HOSTS: HOSTS.slice(), PREDICATES: PREDICATES.slice(), MARKS: MARKS.slice(),
    TRIGGERS: TRIGGERS.slice(), EFFECTS: EFFECTS.slice(), ROLES: ROLES.slice(), EXITS: EXITS.slice(), FOE_POSES: FOE_POSES.slice(), FONTS: FONTS.slice(),
    PROP_KINDS: PROP_KINDS.slice(), CLASS_OF: Object.assign({}, CLASS_OF), CLASS_BOX: JSON.parse(JSON.stringify(CLASS_BOX)), LABELS: LABELS.slice(),
    QUIET_PARTS: JSON.parse(JSON.stringify(QUIET_PARTS)), CAPTIONS: JSON.parse(JSON.stringify(CAPTIONS)), LEVELS: JSON.parse(JSON.stringify(LEVELS)) });
  const api = { FORMAT, PREFIX, BASE_ID, LIMITS, ANCHOR_SPAN, RANGE, STEPS, SLOTS, ANCHORS, ANCHOR, FRAME_SX, FRAME_SY, VALUES, VALUE, MEASURES, TORSO, BASE, KEYS, ORDERS,
    WORLD_LIMITS, WORLD_LISTS, SCENE_RANGE, ACT_RANGE,
    read, canonical, message, gather, resolve, draw, sequence, animate, fitsPlace, newAnchors, newValues };
  KW.pack = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
