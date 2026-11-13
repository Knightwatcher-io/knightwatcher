/* Knightwatcher: packs (docs/packs.md). read() checks the text of a pack file whole and either
   returns the pack, ready to draw from, or refuses it with the step and the field at fault.
   resolve() turns a look into lists of flat records, and draw() walks a list, calling the
   primitives of draw.js. A pack is data only: the compiler builds records and never makes code
   out of what a pack says. Nothing here touches the page, so the file loads under Node for the
   tests in tests/web/. */
(function (KW) {
  'use strict';

  /* ---- The format's constants -------------------------------------------------------------- */

  const FORMAT = Object.freeze([1, 0]);
  /* Signed ahead of the pack's canonical form, so that a signature made for anything else cannot
     pass as a pack's. */
  const PREFIX = 'knightwatcher pack v1\n';
  /* The pack whose builds and defaults every look falls back on. */
  const BASE_ID = 'kw.base';
  const LIMITS = Object.freeze({
    text: 512 * 1024, depth: 12, packs: 32, items: 256, parts: 16, partShapes: 128, itemShapes: 400,
    polyPoints: 16, pixSide: 64, pixShape: 4096, pixPack: 16384, pixKeys: 16, sets: 16, setEntries: 32,
    swatches: 32, bands: 8, builds: 4, decorations: 64, decorShapes: 64, groups: 8, tracks: 16, keys: 32,
    restShapes: 64, box: 240, lookShapes: 1200 });
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
  /* The range of each name, for the face-box check. Names missing here have no bound. */
  const RANGE = { sway: [-4, 4] };
  MEASURES.forEach((m, i) => { RANGE[DIFFS[i]] = [m[2] - m[1], m[3] - m[1]]; });

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

  /* The public keys packs are signed with, by kid: 32 bytes each. Empty until the key exists. */
  const KEYS = Object.freeze({});

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
  const quote = s => '"' + s + '"';
  function key(path, k) {
    const seg = PLAIN_KEY.test(k) ? k : '[' + JSON.stringify(k) + ']';
    return !path ? seg : seg[0] === '[' ? path + seg : path + '.' + seg;
  }
  const idx = (path, i) => path + '[' + i + ']';

  /* A refusal. read() catches it and turns it into { ok: false, step, reason }. */
  function Reject(step, reason) { this.step = step; this.reason = reason; }
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
          if (top.keys.has(k)) return 'the key ' + JSON.stringify(k) + ' appears twice in one object';
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
    if (s.k === 'pix') {
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
        colour(s.key[k], key(kp, k), false);
      }
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
  function track(t, path) {
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
      num(k[0], idx(p, 0), 0, 1);
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
  function fields(pack) {
    const P = 'pack';
    obj(pack, P, PACK_KEYS, ['id', 'name', 'version', 'format', 'licence', 'provides']);
    id(pack.id, key(P, 'id'), PACK_ID);
    text(pack.name, key(P, 'name'), 1, 48);
    if (typeof pack.version !== 'string' || !VERSION.test(pack.version)) fail(key(P, 'version'), 'must be major.minor.patch, each 0 to 999');
    text(pack.licence, key(P, 'licence'), 1, 200);
    const pp = key(P, 'provides');
    arr(pack.provides, pp, 0, PROVIDES.length).forEach((s, i) => { oneOf(s, idx(pp, i), PROVIDES); if (pack.provides.indexOf(s) !== i) fail(idx(pp, i), 'appears twice'); });
    if (has(pack, 'palettes')) {
      const sp = key(P, 'palettes');
      for (const s of table(pack.palettes, sp, SET_NAME, 0, LIMITS.sets, 'sets')) {
        if (s === 'base' || has(USER_SETS, s)) fail(key(sp, s), 'is a reserved set name');
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
      if (!base) fail(bp, 'only the base pack, ' + BASE_ID + ', may carry builds');
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
    if (has(pack, 'builds') && !has(pack, 'defaults')) fail(key(P, 'defaults'), 'is required when the pack carries builds');
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
    if (set !== 'base' && !has(USER_SETS, set) && !(pack.palettes && has(pack.palettes, set))) fail(path, 'names a palette set, "' + set + '", that does not exist');
    const kind = refKind(pack, set, m[2]);
    if (kind === null) fail(path, 'names an entry, "' + m[2] + '", that set "' + set + '" does not have');
    if (single && kind === 'bands') fail(path, 'needs a single colour here, and ' + v + ' is a band list');
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
        if (s.k === 'poly' && s.dir === 'frame' && ctx.slot !== 'main') fail(key(sp, 'dir'), '"frame" is allowed only in the main slot');
      }
      if (has(s, 'g') && !(ctx.groups && has(ctx.groups, s.g))) fail(key(sp, 'g'), 'names a group, "' + s.g + '", that the decoration does not declare');
      eachScalar(s, (v, p) => names(v, p, ctx), sp);
      if (has(s, 'fill')) eachColour(s.fill, (c, p, single) => refColour(pack, c, p, single, false), key(sp, 'fill'));
      if (s.k === 'pix') {
        for (const k of Object.keys(s.key)) refColour(pack, s.key[k], key(key(sp, 'key'), k), true, false);
        s.rows.forEach((r, j) => { for (const ch of r) if (ch !== '.' && !has(s.key, ch)) fail(idx(key(sp, 'rows'), j), 'uses "' + ch + '", which the key does not map'); });
      }
    });
  }
  function badAnchor(ctx, name) {
    if (!SLOT_AT[ctx.slot].includes(name)) return 'the slot ' + ctx.slot + ' does not hang anything on "' + name + '"';
    return '"' + name + '" needs a part drawn for one side';
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
      if (!has(items, h)) fail(hp, 'names an item, "' + h + '", that the pack does not have');
      if (items[h].slot !== 'head') fail(hp, 'names "' + h + '", whose slot is ' + items[h].slot + ', not head');
    }
    if (pack.defaults) {
      const d = pack.defaults, dp = key(P, 'defaults');
      if (!has(pack.builds, d.build)) fail(key(dp, 'build'), 'names a build, "' + d.build + '", that the pack does not have');
      for (const s of Object.keys(d.items)) {
        const it = d.items[s], p = key(key(dp, 'items'), s);
        if (!has(items, it)) fail(p, 'names an item, "' + it + '", that the pack does not have');
        if (items[it].slot !== s) fail(p, 'names "' + it + '", whose slot is ' + items[it].slot + ', not ' + s);
      }
      for (const s of Object.keys(d.swatches)) {
        const sw = d.swatches[s];
        if (!(pack.swatches && has(pack.swatches, s) && has(pack.swatches[s], sw))) fail(key(key(dp, 'swatches'), s), 'names a ' + s + ' swatch, "' + sw + '", that the pack does not have');
      }
    }
    if (pack.decorations) for (const d of Object.keys(pack.decorations)) {
      const v = pack.decorations[d], dp = key(key(P, 'decorations'), d);
      refShapes(pack, v.shapes, key(dp, 'shapes'), { kind: 'decor', groups: v.groups || {} });
      if (v.anim) v.anim.tracks.forEach((t, i) => {
        const tp = idx(key(key(dp, 'anim'), 'tracks'), i);
        if (has(t, 'g') && !(v.groups && has(v.groups, t.g))) fail(key(tp, 'g'), 'names a group, "' + t.g + '", that the decoration does not declare');
        if (has(t, 'pal')) {
          const m = PAL.exec(t.pal), own = pack.palettes && has(pack.palettes, m[1]) ? pack.palettes[m[1]] : null;
          if (!own) fail(key(tp, 'pal'), 'must name a palette set of this pack, and "' + m[1] + '" is not one');
          if (!has(own, m[2])) fail(key(tp, 'pal'), 'names an entry, "' + m[2] + '", that set "' + m[1] + '" does not have');
          if (typeof own[m[2]] !== 'string' || !HEX.test(own[m[2]])) fail(key(tp, 'pal'), 'must name an entry that is a hex colour');
        }
      });
    }
  }

  /* ---- Step 7: rules that span fields ---------------------------------------------------------- */

  /* A linear form { c, k: { name: coefficient } } of a scalar, and its bounds over RANGE. */
  function form(v) {
    if (typeof v === 'number') return { c: v, k: {} };
    const f = { c: has(v, 'c') ? v.c : 0, k: {} };
    for (const n of Object.keys(v)) if (n !== 'c') f.k[n] = v[n];
    return f;
  }
  function plus(a, b, sb) {
    const f = { c: a.c + sb * b.c, k: Object.assign({}, a.k) };
    for (const n of Object.keys(b.k)) f.k[n] = (f.k[n] || 0) + sb * b.k[n];
    return f;
  }
  function bound(f, hi) {
    let s = f.c;
    for (const n of Object.keys(f.k)) {
      const k = f.k[n];
      if (k === 0) continue;
      if (!has(RANGE, n)) return hi ? Infinity : -Infinity;
      s += hi ? Math.max(k * RANGE[n][0], k * RANGE[n][1]) : Math.min(k * RANGE[n][0], k * RANGE[n][1]);
    }
    return s;
  }
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
  /* Convex and simple: the turns all go one way, and x and y each change direction at most twice
     round the loop. Pairs are taken with every named value at 0; framed points in their own frame. */
  function convex(pts) {
    let turn = 0;
    const n = pts.length, dx = [], dy = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr !== 0) { if (turn === 0) turn = Math.sign(cr); else if (Math.sign(cr) !== turn) return false; }
      if (b[0] !== a[0]) dx.push(Math.sign(b[0] - a[0]));
      if (b[1] !== a[1]) dy.push(Math.sign(b[1] - a[1]));
    }
    const flips = d => d.reduce((m, s, i) => m + (s !== d[(i + 1) % d.length] ? 1 : 0), 0);
    return turn !== 0 && flips(dx) <= 2 && flips(dy) <= 2;
  }
  function polyRule(s, path) {
    const framed = s.pts.filter(q => isObj(q) && has(q, 'frame')).length, pairs = s.pts.filter(Array.isArray).length;
    if (framed !== s.pts.length && pairs !== s.pts.length) fail(key(path, 'pts'), 'must be all pairs or all framed points');
    if (framed && s.pts.some(q => has(q, 'x') || has(q, 'y'))) fail(key(path, 'pts'), 'framed points of a polygon cannot carry a screen offset');
    const at0 = framed ? s.pts.map(q => [q.p, -q.s]) : s.pts.map(q => [form(q[0]).c, form(q[1]).c]);
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
    const have = PROVIDES.filter(s => nonEmpty(pack[s]));
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
  }

  /* ---- Step 8: counts ------------------------------------------------------------------------- */

  const shapeCount = list => list.reduce((n, pt) => n + pt.shapes.length, 0);
  function counts(pack) {
    const P = 'pack', items = pack.items || {}, ids = Object.keys(items);
    if (ids.length > LIMITS.items) fail(key(P, 'items'), 'holds ' + ids.length + ' items, more than ' + LIMITS.items);
    for (const i of live(items)) {
      const v = items[i];
      const n = shapeCount(v.parts) + (v.views ? shapeCount(v.views.helmeted) : 0) + (v.rest ? v.rest.shapes.length : 0);
      if (n > LIMITS.itemShapes) fail(key(key(P, 'items'), i), 'holds ' + n + ' shapes in its parts and views, more than ' + LIMITS.itemShapes);
    }
    let px = 0;
    eachShape(pack, s => { if (s.k === 'pix') px += s.rows.length * s.rows[0].length; });
    if (px > LIMITS.pixPack) fail(P, 'holds ' + px + ' pixels in pix shapes, more than ' + LIMITS.pixPack);
    const decs = Object.keys(pack.decorations || {}).length;
    if (decs > LIMITS.decorations) fail(key(P, 'decorations'), 'holds ' + decs + ' decorations, more than ' + LIMITS.decorations);
    if (pack.defaults) {
      const d = pack.defaults, it = s => (has(d.items, s) ? items[d.items[s]] : null);
      const n = lookCount({ build: { pack, b: pack.builds[d.build] }, items: s => (it(s) ? { pack, item: it(s) } : null) });
      if (n > LIMITS.lookShapes) fail(key(P, 'defaults'), 'the default look draws ' + n + ' shapes, more than ' + LIMITS.lookShapes);
    }
  }
  /* The most shapes a look draws for the knight in one frame: the body, the larger head group, the
     pauldrons, both arms and gauntlets, and the weapon, with the shield when the grip is one-handed. */
  function lookCount(c) {
    const n = s => { const x = c.items(s); return x ? shapeCount(x.item.parts) : 0; };
    const helmet = c.items('helmet'), hair = c.items('hair'), main = c.items('main');
    const headOn = (hair && hair.item.views ? shapeCount(hair.item.views.helmeted) : 0) + (helmet && helmet.item.mounts ? n('plume') : 0) + n('helmet');
    const head = c.build.pack.items[c.build.b.head];
    const headOff = shapeCount(head.parts) + n('hair');
    const one = main && main.item.grip.kind === 'one';
    return n('back') + n('legs') + n('boots') + n('torso') + Math.max(headOn, headOff) + n('pauldrons') + n('arms') + n('gauntlets') + n('main') + (one ? n('off') : 0);
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
      cshapes(helmet.item.rest.shapes, { a: ANCHOR.rest, dx: 0, dy: 0 }, env(helmet), L.restHelmet);
      if (plume && plume.item.rest && helmet.item.rest.mounts) {
        const m = mount(helmet.item.rest.mounts.plume, env(helmet)), at = { a: ANCHOR.rest, dx: m[0], dy: m[1] };
        cshapes(plume.item.rest.shapes, at, env(plume, { rest: at }), L.restHelmet);
      }
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
  function compileDecoration(v) {
    return freeze({ name: v.name, fits: v.fits.slice(), box: v.box.slice(),
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
  function load(pack, signed) {
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
    for (const d of Object.keys(pack.decorations || {})) decorations[d] = compileDecoration(pack.decorations[d]);
    return freeze({ ok: true, id: pack.id, version: pack.version, name: pack.name, licence: pack.licence, format: pack.format.slice(),
      provides: pack.provides.slice(), signed, data: freeze(pack), own, swatches, decorations });
  }

  /* ---- read() ----------------------------------------------------------------------------------- */

  /* Checks the text of a pack file, in the order of docs/packs.md, and stops at the first failure.
     opts: allowUnsigned (accept a pack with no sig; a dev page only), keys (kid -> 32-byte
     Uint8Array; KEYS by default), verify(publicKey, message, signature) -> boolean (KW.ed25519.verify
     by default). Returns the loaded pack, or { ok: false, step, reason, id } where id is the pack's
     id when it could be read. Never throws. */
  function read(textIn, opts) {
    const o = isObj(opts) ? opts : {};
    let pid;
    try {
      step = 'size';
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
      step = 'counts'; counts(env.pack);
      step = 'compile';
      return load(env.pack, signed);
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
    if (!(pub instanceof Uint8Array) || pub.length !== 32) fail('sig.kid', 'names a key this page does not know, "' + sig.kid + '"');
    const bytes = base64(sig.value);
    if (!bytes || bytes.length !== 64) fail('sig.value', 'must be 64 bytes in base64');
    const verify = typeof o.verify === 'function' ? o.verify : KW.ed25519 && typeof KW.ed25519.verify === 'function' ? KW.ed25519.verify : null;
    if (!verify) fail('sig', 'cannot be checked: no verifier is loaded');
    let good = false;
    try { good = verify(pub, message(env.pack), bytes) === true; } catch (e) { good = false; }
    step = 'signature';
    if (!good) fail('sig.value', 'does not verify for this pack with key "' + sig.kid + '"');
    return true;
  }

  /* ---- Many packs, and looks -------------------------------------------------------------------- */

  function cmpVersion(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }
  /* Gathers the results of read() into the set of packs in use: the higher version of two with one
     id, and at most LIMITS.packs packs. Returns { packs: Map(id -> pack), rejected, superseded }. */
  function gather(results) {
    const packs = new Map(), rejected = [], superseded = [];
    for (const r of Array.isArray(results) ? results : []) {
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
     missing, unusable or over the shape cap. Returns { ok: false, reason: 'no base pack' } when the
     base pack is not loaded. Otherwise { ok: true, look, fallbacks, ignored, m, diffs, colours,
     grip, blade, shapes, lists }; each fallback is { kind, key, wanted, used, reason }. */
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
    const compile = () => {
      const b = base.data.builds[build], diffs = {};
      MEASURES.forEach((m, i) => { diffs[DIFFS[i]] = b.m[m[0]] - m[1]; });
      const items = {};
      for (const slot of LOOK_SLOTS) if (chosen[slot]) items[slot] = { pack: chosen[slot].pack.data, item: chosen[slot].pack.data.items[chosen[slot].id], id: chosen[slot].pack.id };
      const bld = { pack: base.data, b };
      const n = lookCount({ build: bld, items: s => items[s] || null });
      return { b, diffs, items, bld, n };
    };
    // the shape cap: fall back slot by slot, then the build, until the look fits
    let cur = compile();
    for (const slot of LOOK_SLOTS.concat(['build'])) {
      if (cur.n <= LIMITS.lookShapes) break;
      if (slot === 'build') {
        if (build === D.build) continue;
        fallbacks.push({ kind: 'build', key: 'build', wanted: BASE_ID + '/' + build, used: BASE_ID + '/' + D.build, reason: 'over the ' + LIMITS.lookShapes + '-shape cap' });
        build = D.build;
      } else {
        const d = defaults[slot], c = chosen[slot];
        if (!c || (d && c.pack === d.pack && c.id === d.id)) continue;
        fallbacks.push({ kind: 'item', key: slot, wanted: c.pack.id + '/' + c.id, used: d ? BASE_ID + '/' + d.id : null, reason: 'over the ' + LIMITS.lookShapes + '-shape cap' });
        chosen[slot] = d;
      }
      cur = compile();
    }
    const byId = new Map(Array.from(packs.values()).map(p => [p.data, p]));
    const lists = compileLists({ diffs: cur.diffs, build: cur.bld, items: cur.items, pal: data => pal(byId.get(data)) });
    const used = { build: BASE_ID + '/' + build, items: {}, swatches: swName };
    for (const slot of LOOK_SLOTS) if (chosen[slot]) used.items[slot] = chosen[slot].pack.id + '/' + chosen[slot].id;
    const main = cur.items.main ? cur.items.main.item : null, m = {};
    MEASURES.forEach(x => { m[x[0]] = cur.b.m[x[0]]; });
    return { ok: true, look: used, fallbacks, ignored, m, diffs: cur.diffs, shapes: cur.n,
      colours: { face: sw.skin.face, sick: sw.skin.sick, hot: sw.skin.hot, cheek: sw.skin.cheek, puff: sw.skin.puff, brow: sw.hair.brow },
      grip: main ? main.grip : null, blade: main && main.blade ? main.blade : null, plumeShown: !!(cur.items.helmet && cur.items.helmet.item.mounts && cur.items.plume), lists };
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
     two-handed grip leaning right and left; one draws the shield's group first and oneCrossed the
     sword's, when the sword hand crosses to the shield's side. The sword is in the right hand. */
  const HANDS = { none: ['armL', 'gauntL', 'armR', 'gauntR'], hammer: ['armL', 'gauntL', 'armR', 'hammer', 'gauntR'],
    twoR: ['armR', 'main', 'armL', 'gauntR', 'gauntL'], twoL: ['armL', 'main', 'armR', 'gauntL', 'gauntR'],
    one: ['armL', 'gauntL', 'off', 'armR', 'main', 'gauntR'], oneCrossed: ['armR', 'main', 'gauntR', 'armL', 'gauntL', 'off'] };
  const ORDERS = freeze(Object.keys(HANDS).reduce((o, m) => {
    const seq = head => ['crates', 'body', head, 'face', 'drumstick', 'pauldrons'].concat(HANDS[m], ['effects']);
    o[m] = { on: seq('headOn'), off: seq('headOff') };
    return o;
  }, {}));
  function sequence(mode, helmet) { return has(ORDERS, mode) ? ORDERS[mode][helmet === false ? 'off' : 'on'] : null; }

  /* ---- Keyframes -------------------------------------------------------------------------------- */

  function sample(tr, u) {
    const T = tr.times, V = tr.values, n = T.length;
    if (u <= T[0]) return V[0];
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
     { dx, dy, scale, alpha, show } }, pal: { "set.entry": "#rrggbb" } }. A pure function of t. */
  function animate(dec, t) {
    const out = { groups: {}, pal: {} }, a = dec && dec.anim;
    for (const g of (dec && dec.groups) || []) out.groups[g.name] = { dx: 0, dy: 0, scale: 1, alpha: 1, show: 1 };
    if (!a) return out;
    const x = a.phase + (Number.isFinite(t) ? Math.max(0, t) : 0) / a.period;
    const u = a.loop ? x - Math.floor(x) : Math.min(1, x);
    for (const tr of a.tracks) {
      const v = sample(tr, u);
      if (tr.pal) out.pal[tr.pal] = '#' + hex2(v[0]) + hex2(v[1]) + hex2(v[2]);
      else out.groups[tr.g][tr.ch] = tr.ch === 'dx' || tr.ch === 'dy' ? Math.round(v) + 0 : v;
    }
    return out;
  }
  /* Whether a decoration may go in a scene's place { kind, w, h }. */
  const fitsPlace = (dec, pl) => !!(dec && pl && dec.fits.includes(pl.kind) && dec.box[0] <= pl.w && dec.box[1] <= pl.h);

  const api = { FORMAT, PREFIX, BASE_ID, LIMITS, STEPS, SLOTS, ANCHORS, ANCHOR, FRAME_SX, FRAME_SY, VALUES, VALUE, MEASURES, BASE, KEYS, ORDERS,
    read, canonical, message, gather, resolve, draw, sequence, animate, fitsPlace, newAnchors, newValues };
  KW.pack = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
