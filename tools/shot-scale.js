#!/usr/bin/env node
// Shrinks screenshots by a whole factor, for the website's pictures (tools/shots.sh site).
//
//   node tools/shot-scale.js FACTOR SOURCE_DIR DEST_DIR NAME ...
//
// Reads SOURCE_DIR/<NAME>.png for each name, a PNG of 8-bit RGB or RGBA without interlacing, as the
// headless browser writes them, and writes DEST_DIR/<NAME>.png at its size divided by FACTOR: each
// pixel the plain mean of a FACTOR by FACTOR block, rounded to the nearest. The page is shot with
// its device pixels FACTOR times its own, so that the scene is drawn at a whole scale with no
// smoothing, and the mean gives a smooth picture of the page at its own size. The result is RGB,
// each row given the filter that leaves the smallest sum of its bytes taken as signed, and
// compressed at zlib's level 9, so the same shot always gives the same bytes. It exits 1, naming the
// file, when a source is missing, is not such a PNG, or is not a whole multiple of FACTOR in size.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* A PNG's pixels as { w, h, bpp, px }, px holding the rows unfiltered, bpp bytes to a pixel. */
function decode(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const n = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + n);
    if (kind === 'IHDR') ihdr = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    pos += 12 + n;
  }
  if (!ihdr) throw new Error('no IHDR');
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), depth = ihdr[8], ctype = ihdr[9], interlace = ihdr[12];
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || interlace !== 0) throw new Error('only 8-bit RGB or RGBA without interlacing is handled');
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < h * (stride + 1)) throw new Error('its image data is short');
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      let v = raw[src + i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (ft !== 0) throw new Error('unknown filter ' + ft);
      px[row + i] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

/* The image shrunk by k, as RGB: each pixel the rounded mean of its k by k block. */
function shrink(img, k) {
  const { w, h, bpp, px } = img;
  if (!Number.isInteger(k) || k < 1) throw new Error('the factor must be a whole number from 1');
  if (w % k || h % k) throw new Error(w + ' by ' + h + ' is not a whole multiple of ' + k);
  const W = w / k, H = h / k, out = Buffer.alloc(W * H * 3), n = k * k, half = n >> 1;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < k; dy++) {
      let o = ((Y * k + dy) * w + X * k) * bpp;
      for (let dx = 0; dx < k; dx++, o += bpp) { r += px[o]; g += px[o + 1]; b += px[o + 2]; }
    }
    const q = (Y * W + X) * 3;
    out[q] = Math.floor((r + half) / n); out[q + 1] = Math.floor((g + half) / n); out[q + 2] = Math.floor((b + half) / n);
  }
  return { w: W, h: H, bpp: 3, px: out };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(kind, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(kind, 4, 'latin1');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/* An RGB image as a PNG, the same bytes for the same pixels. */
function encode(img) {
  const { w, h, px } = img, bpp = 3, stride = w * bpp;
  if (img.bpp !== 3) throw new Error('only RGB is written');
  const raw = Buffer.alloc(h * (stride + 1)), trial = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = y * stride, up = row - stride;
    let best = 0, bestSum = Infinity, bestRow = null;
    for (let ft = 0; ft <= 4; ft++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = px[row + i], a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
        let pred = 0;
        if (ft === 1) pred = a;
        else if (ft === 2) pred = b;
        else if (ft === 3) pred = (a + b) >> 1;
        else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (x - pred) & 255;
        trial[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = ft; bestRow = Buffer.from(trial); }
    }
    raw[y * (stride + 1)] = best; bestRow.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decode, shrink, encode };
if (require.main === module) {
  const [factor, src, dest, ...names] = process.argv.slice(2), k = Number(factor);
  if (!src || !dest || !names.length || !Number.isInteger(k) || k < 1) {
    console.error('usage: node tools/shot-scale.js FACTOR SOURCE_DIR DEST_DIR NAME ...'); process.exit(2);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of names) {
    const from = path.join(src, name + '.png'), to = path.join(dest, name + '.png');
    try {
      const img = shrink(decode(fs.readFileSync(from)), k);
      fs.writeFileSync(to, encode(img));
      console.log('wrote ' + name + ' at ' + img.w + ' by ' + img.h);
    } catch (e) { console.error('shot-scale: ' + from + ': ' + e.message); process.exit(1); }
  }
}
