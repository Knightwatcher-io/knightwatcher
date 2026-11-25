// Tests for the shrinking of the website's pictures, tools/shot-scale.js, and for the pictures
// tools/shots.sh site writes into site/img/. Run with: node --test tests/tools/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const S = require('../../tools/shot-scale.js');

const ROOT = path.join(__dirname, '../..');

// An image of w by h, bpp bytes to a pixel, each byte given by f(x, y, channel).
function image(w, h, bpp, f) {
  const px = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < bpp; c++) px[(y * w + x) * bpp + c] = f(x, y, c);
  return { w, h, bpp, px };
}

test('a picture written is read back pixel for pixel', () => {
  const img = image(37, 23, 3, (x, y, c) => (x * 7 + y * 13 + c * 61 + ((x * y) % 5) * 40) & 255);
  const back = S.decode(S.encode(img));
  assert.deepEqual([back.w, back.h, back.bpp], [37, 23, 3]);
  assert.ok(back.px.equals(img.px));
});

test('the same pixels always give the same bytes', () => {
  const img = image(64, 40, 3, (x, y, c) => (x ^ y) * (c + 1) & 255);
  assert.ok(S.encode(img).equals(S.encode({ w: img.w, h: img.h, bpp: 3, px: Buffer.from(img.px) })));
});

test('each pixel is the rounded mean of its block, and RGBA is read as RGB', () => {
  // blocks of 3 by 3: the first all 10 but one 11 (mean 10.11, so 10), the second five 0 and four
  // 255 (113.3, so 113), and the alpha byte is left out
  const img = image(6, 3, 4, (x, y, c) => {
    if (c === 3) return 77;
    if (x < 3) return x === 0 && y === 0 ? 11 : 10;
    return (x + y) % 2 ? 0 : 255;
  });
  const out = S.shrink(img, 3);
  assert.deepEqual([out.w, out.h, out.bpp], [2, 1, 3]);
  assert.deepEqual([...out.px], [10, 10, 10, 113, 113, 113]);
});

test('a size that is not a whole multiple of the factor is refused', () => {
  assert.throws(() => S.shrink(image(10, 9, 3, () => 0), 3), /not a whole multiple of 3/);
});

test('a file that is not a PNG, or of another kind of PNG, is refused', () => {
  assert.throws(() => S.decode(Buffer.from('not a picture at all')), /not a PNG/);
  const grey = S.encode(image(2, 2, 3, () => 0));
  grey[8 + 8 + 9] = 0; // the IHDR's colour type, made greyscale
  assert.throws(() => S.decode(grey), /only 8-bit RGB or RGBA/);
});

test('the browser\'s filters are undone: a PNG written with each filter in turn reads back the same', () => {
  // rows filtered by hand, one filter to a row, as the browser may write them
  const w = 5, h = 5, bpp = 3, img = image(w, h, bpp, (x, y, c) => (x * 50 + y * 30 + c * 90) & 255);
  const stride = w * bpp, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = y;
    for (let i = 0; i < stride; i++) {
      const at = y * stride + i, x = img.px[at], a = i >= bpp ? img.px[at - bpp] : 0, b = y ? img.px[at - stride] : 0, c = y && i >= bpp ? img.px[at - stride - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][y];
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 255;
    }
  }
  const png = S.encode(img), at = png.indexOf('IDAT') - 4, n = png.readUInt32BE(at);
  const body = zlib.deflateSync(raw), len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const hand = Buffer.concat([png.subarray(0, at), len, Buffer.from('IDAT'), body, Buffer.alloc(4), png.subarray(at + 12 + n)]);
  assert.ok(S.decode(hand).px.equals(img.px));
});

test('the command writes each name shrunk, and stops on a missing source', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-shot-scale-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'big'));
  fs.writeFileSync(path.join(dir, 'big', 'a.png'), S.encode(image(6, 6, 3, () => 200)));
  const run = (...names) => spawnSync(process.execPath, [path.join(ROOT, 'tools/shot-scale.js'), '3', path.join(dir, 'big'), path.join(dir, 'out'), ...names], { encoding: 'utf8' });
  const ok = run('a');
  assert.equal(ok.status, 0, ok.stderr);
  const out = S.decode(fs.readFileSync(path.join(dir, 'out', 'a.png')));
  assert.deepEqual([out.w, out.h, [...out.px.subarray(0, 3)]], [2, 2, [200, 200, 200]]);
  const missing = run('a', 'b');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /b\.png/);
});

test('site/img holds the pictures of SITE_SHOTS in tools/shots.sh, each at its size, and no other', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'tools/shots.sh'), 'utf8');
  const block = sh.match(/^SITE_SHOTS=\(\n([\s\S]*?)\n\)/m);
  assert.ok(block, 'SITE_SHOTS in tools/shots.sh');
  const want = new Map(block[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('"')).map(l => {
    const parts = l.slice(1, -1).split('|'), size = (parts[2] || '640,400').split(',').map(Number);
    return [parts[0] + '.png', size];
  }));
  const dir = path.join(ROOT, 'site/img');
  const have = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  assert.deepEqual(have, [...want.keys()].sort());
  for (const [name, [w, h]] of want) {
    const head = fs.readFileSync(path.join(dir, name)).subarray(16, 24);
    assert.deepEqual([head.readUInt32BE(0), head.readUInt32BE(4)], [w, h], name);
  }
});
