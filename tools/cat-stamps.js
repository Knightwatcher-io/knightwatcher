#!/usr/bin/env node
// Writes the mouser cat into the medieval world's pack, web/packs/medieval.pack.json, from the
// cat's drawing in code, web/js/cat.js (KW.props.PETS.cat): one stamp of pix shapes for each pose
// of each coat, cat.<coat>.<pose>, and the cast member pet.cat, which names them and gives the
// cat's spots and the measures of its pounce. So the pack draws the cat the code draws, pixel for
// pixel.
//
//   node tools/cat-stamps.js           writes the stamps and the member into the pack file
//   node tools/cat-stamps.js --check   exits 1 when the pack file holds anything else
//
// Each pose is worked out into cells, trimmed to the pixels it paints, cut into tiles of at most 64
// by 64 (a pix shape's largest), and each tile trimmed again and written as a pix shape at its
// place from the feet, its rows in runs ("runs": true, docs/scenes.md): a character repeated three
// times or more is written as a count and the character. Its key maps the colours of that tile in
// the order they first appear, to a to z and then A to Z. The tool owns every stamp whose name
// starts with "cat." and the member pet.cat, and leaves the rest of the file as it is; the preset's
// cast names pet.cat by hand. Run node tools/pack-carrier.js after writing, and sign the pack again
// (docs/development.md). tests/tools/cat-stamps.test.js checks that the pack holds what this writes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '..', 'web');
const PACK = path.join(WEB, 'packs', 'medieval.pack.json');
const MEMBER = 'pet.cat', PREFIX = 'cat.', TILE = 64;
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* The cat from code: web/js/draw.js and web/js/cat.js run in a sandbox of their own. */
function codeCat(web = WEB) {
  const box = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(web, 'js/draw.js'), 'utf8'), box, { filename: 'draw.js' });
  box.window.KW.props = {};
  vm.runInContext(fs.readFileSync(path.join(web, 'js/cat.js'), 'utf8'), box, { filename: 'cat.js' });
  return box.window.KW.props.PETS.cat;
}

const stampName = (coat, pose) => PREFIX + coat + '.' + pose;
/* A row in runs: each run of three or more of a character as its count and the character. */
const runsOf = row => row.replace(/(.)\1*/g, m => (m.length >= 3 ? m.length + m[0] : m));

/* A pose's cells, w by h, as pix shapes from the feet (ax, ay). */
function shapesOf(cells, w, h, ax, ay) {
  const painted = (x, y) => cells[y * w + x] !== null;
  const boxOf = (x0, y0, x1, y1) => {
    let a = Infinity, b = Infinity, c = -1, d = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (painted(x, y)) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
    return c < 0 ? null : [a, b, c, d];
  };
  const all = boxOf(0, 0, w - 1, h - 1), out = [];
  if (!all) return out;
  for (let ty = all[1]; ty <= all[3]; ty += TILE) for (let tx = all[0]; tx <= all[2]; tx += TILE) {
    const t = boxOf(tx, ty, Math.min(tx + TILE - 1, all[2]), Math.min(ty + TILE - 1, all[3]));
    if (!t) continue;
    const cols = [], rows = [];
    for (let y = t[1]; y <= t[3]; y++) {
      let r = '';
      for (let x = t[0]; x <= t[2]; x++) {
        const c = cells[y * w + x];
        if (c === null) { r += '.'; continue; }
        if (!cols.includes(c)) cols.push(c);
        r += CHARS[cols.indexOf(c)];
      }
      rows.push(runsOf(r));
    }
    if (cols.length > CHARS.length) throw new Error('a tile of ' + cols.length + ' colours');
    const key = {};
    cols.forEach((c, i) => { key[CHARS[i]] = c; });
    out.push({ k: 'pix', p: [t[0] - ax, t[1] - ay], runs: true, key, rows });
  }
  return out;
}

/* What the pack should hold for the cat: { stamps, member }, in the order they are written. */
function build(web = WEB) {
  const cat = codeCat(web), [w, h] = cat.size, [ax, ay] = cat.anchor, stamps = {}, coats = {};
  for (const coat of Object.keys(cat.coats)) {
    const poses = {};
    for (const pose of cat.poses) {
      stamps[stampName(coat, pose)] = shapesOf(cat.cells(coat, pose), w, h, ax, ay);
      poses[pose] = stampName(coat, pose);
    }
    coats[coat] = { name: cat.coats[coat], poses };
  }
  const plain = v => JSON.parse(JSON.stringify(v));
  const member = { role: 'pet', name: cat.name, sprite: { size: plain(cat.size), feet: plain(cat.anchor) }, coats, spots: plain(cat.spots),
    paw: plain(cat.paw), take: cat.take, land: cat.land, lift: cat.lift };
  return { stamps, member };
}

/* ---- Writing into the pack file ---------------------------------------------------------------
   The file is laid out by hand: each section of the pack opens at four spaces, "stamps": {, and
   each of its entries at six, "name": [ or "name": {. An entry runs to the line before the next one
   or the section's close. */
const inline = v => (Array.isArray(v) ? '[' + v.map(inline).join(', ') + ']'
  : v !== null && typeof v === 'object' ? '{ ' + Object.keys(v).map(k => JSON.stringify(k) + ': ' + inline(v[k])).join(', ') + ' }' : JSON.stringify(v));
function stampText(name, shapes) {
  const lines = ['      ' + JSON.stringify(name) + ': ['];
  shapes.forEach((s, i) => {
    lines.push('        { "k": "pix", "p": ' + inline(s.p) + ', "runs": true, "key": ' + inline(s.key) + ', "rows": [');
    s.rows.forEach((r, j) => lines.push('          ' + JSON.stringify(r) + (j < s.rows.length - 1 ? ',' : '')));
    lines.push('        ] }' + (i < shapes.length - 1 ? ',' : ''));
  });
  lines.push('      ]');
  return lines;
}
function memberText(m) {
  const L = ['      ' + JSON.stringify(MEMBER) + ': {', '        "role": ' + inline(m.role) + ',', '        "name": ' + inline(m.name) + ',', '        "sprite": ' + inline(m.sprite) + ',', '        "coats": {'];
  const coats = Object.keys(m.coats), spots = Object.keys(m.spots);
  coats.forEach((c, i) => L.push('          ' + JSON.stringify(c) + ': ' + inline(m.coats[c]) + (i < coats.length - 1 ? ',' : '')));
  L.push('        },', '        "spots": {');
  spots.forEach((s, i) => L.push('          ' + JSON.stringify(s) + ': ' + inline(m.spots[s]) + (i < spots.length - 1 ? ',' : '')));
  L.push('        },', '        "paw": ' + inline(m.paw) + ', "take": ' + inline(m.take) + ', "land": ' + inline(m.land) + ', "lift": ' + inline(m.lift), '      }');
  return L;
}
/* The text with the entries of the section sec that own(name) holds replaced by add, a list of
   entries, each its lines, written at the section's end. */
function splice(text, sec, own, add) {
  const lines = text.split('\n'), open = lines.indexOf('    ' + JSON.stringify(sec) + ': {');
  if (open < 0) throw new Error('the pack has no section ' + sec);
  let close = open + 1;
  while (close < lines.length && !/^    \},?$/.test(lines[close])) close++;
  if (close === lines.length) throw new Error('the section ' + sec + ' does not close');
  const entries = [];
  for (let i = open + 1; i < close; i++) {
    const m = /^      "([^"]+)": [[{]/.exec(lines[i]);
    if (m) entries.push({ name: m[1], lines: [] });
    if (!entries.length) throw new Error('the section ' + sec + ' starts with a line that is not an entry');
    entries[entries.length - 1].lines.push(lines[i]);
  }
  const kept = entries.filter(e => !own(e.name)).map(e => e.lines).concat(add);
  const body = [];
  kept.forEach((ls, i) => {
    const copy = ls.slice(), last = copy.length - 1;
    copy[last] = copy[last].replace(/,$/, '') + (i < kept.length - 1 ? ',' : '');
    body.push(...copy);
  });
  return lines.slice(0, open + 1).concat(body, lines.slice(close)).join('\n');
}
/* The pack file's text with the cat written in. */
function write(text, built) {
  const b = built || build();
  let out = splice(text, 'stamps', n => n.startsWith(PREFIX), Object.keys(b.stamps).map(n => stampText(n, b.stamps[n])));
  out = splice(out, 'cast', n => n === MEMBER, [memberText(b.member)]);
  return out;
}

module.exports = { build, write, codeCat, shapesOf, runsOf, stampName, MEMBER, PREFIX, PACK };
if (require.main === module) {
  try {
    const text = fs.readFileSync(PACK, 'utf8'), out = write(text);
    if (process.argv.includes('--check')) {
      if (out !== text) { console.error('cat-stamps: ' + path.relative(process.cwd(), PACK) + ' does not hold the cat as web/js/cat.js draws it; run node tools/cat-stamps.js'); process.exit(1); }
      console.log('cat-stamps: the pack holds the cat as the code draws it');
    } else {
      fs.writeFileSync(PACK, out);
      console.log('wrote the cat into ' + path.relative(process.cwd(), PACK));
    }
  } catch (e) { console.error('cat-stamps: ' + e.message); process.exit(1); }
}
