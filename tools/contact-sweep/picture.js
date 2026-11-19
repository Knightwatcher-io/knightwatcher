// Paints one moment of the goblin's event as a PNG from the page's own fills: the knight drawn by
// KW.knight.draw into the recording context and the goblin's pose laid on the grid as the engine
// draws it, cropped to the weapon and the goblin and scaled up pixel for pixel, with no backdrop and
// no impact burst, so that what touches shows. The marks:
//   magenta  weapon pixels more than 2 px into the goblin;
//   yellow   weapon pixels on the goblin, 2 px deep or less;
//   green    the goblin's pixels the knight's drawing hides, shown through as a tint;
//   blue     the nearest weapon and goblin pixels, and the empty pixels between them (mark 'gap').
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');
const L = require('./lib.js');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/* An RGB image of w by h as PNG bytes. */
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function parse(c) {
  if (typeof c !== 'string') return [0, 0, 0];
  if (c[0] === '#') { const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1, 7); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  const m = c.match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(Number);
  return [128, 128, 128];
}

/* Paints the moment el of the plan pl, the knight at kx, into file. mark is 'depth', 'gap' or
   'none'; box, when given, is the crop [x0, y0, x1, y1] on the grid, so that frames of one strike
   line up. Gives the crop, the goblin's pose, and the depth or the gap. */
function render(m, pl, kx, el, file, { mark = 'depth', scale = 4, pad = 24, box = null } = {}) {
  const o = L.pose(m, kx, el); m.F.strike(o, el, pl);
  const knight = m.drawKnight(o), g = L.goblinAt(m, pl, el), wp = L.rasterFills(knight, 'weapon');
  let x0, y0, x1, y1;
  if (box) [x0, y0, x1, y1] = box;
  else {
    // the goblin's drawn pixels, and the weapon's within 60 of them
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    if (g) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.px[j * g.w + i]) { gx0 = Math.min(gx0, g.x0 + i); gx1 = Math.max(gx1, g.x0 + i); gy0 = Math.min(gy0, g.y0 + j); gy1 = Math.max(gy1, g.y0 + j); }
    [x0, y0, x1, y1] = [gx0, gy0, gx1, gy1];
    if (wp) for (let j = 0; j < wp.h; j++) for (let i = 0; i < wp.w; i++) if (wp.px[j * wp.w + i]) {
      const x = wp.x0 + i, y = wp.y0 + j;
      if (x > gx0 - 60 && x < gx1 + 60 && y > gy0 - 60 && y < gy1 + 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  }
  const W = x1 - x0 + 1, H = y1 - y0 + 1, img = Buffer.alloc(W * H * 3);
  const put = (x, y, c, a = 1) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    const k = ((y - y0) * W + (x - x0)) * 3;
    for (let i = 0; i < 3; i++) img[k + i] = Math.round(img[k + i] * (1 - a) + c[i] * a);
  };
  const ring = (a, b, c, d, col) => { for (let x = a; x <= c; x++) { put(x, b, col); put(x, d, col); } for (let y = b; y <= d; y++) { put(a, y, col); put(c, y, col); } };
  for (let k = 0; k < W * H; k++) { img[k * 3] = 0xe9; img[k * 3 + 1] = 0xe6; img[k * 3 + 2] = 0xdc; }
  // a faint line every 10 grid pixels
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x % 10 === 0 || y % 10 === 0) put(x, y, [0xd6, 0xd2, 0xc6]);
  if (g) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const c = g.px[j * g.w + i]; if (c) put(g.x0 + i, g.y0 + j, parse(g.sp.cols[c - 1])); }
  for (const f of knight) for (let y = Math.floor(f.y); y < Math.floor(f.y + f.h); y++) for (let x = Math.floor(f.x); x < Math.floor(f.x + f.w); x++) put(x, y, parse(f.c));
  if (g) {
    const kb = L.rasterFills(knight);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const x = g.x0 + i, y = g.y0 + j; if (g.px[j * g.w + i] && L.at(kb, x, y)) put(x, y, [60, 230, 60], .5); }
  }
  const info = { box: [x0, y0, x1, y1], el, pose: g ? g.st.pose : null };
  if (mark === 'depth' && g) {
    const ov = L.overlap(wp, g);
    if (ov) {
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y] of ov.pts) {
        put(x, y, Math.max(L.depthIn(wp, x, y), L.depthIn(g, x, y)) > 2 ? [255, 0, 220] : [255, 214, 0]);
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
      if (ov.depth > 2) ring(bx0 - 4, by0 - 4, bx1 + 4, by1 + 4, [255, 0, 220]);
      info.depth = ov.depth;
    } else info.depth = 0;
  }
  if (mark === 'gap' && g) {
    const gp = L.gapBetween(wp, g);
    if (gp.w) {
      const [ax, ay] = gp.w, [bx, by] = gp.g, n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let i = 1; i < n; i++) { const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n); if (!L.at(wp, x, y) && !L.at(g, x, y)) put(x, y, [0, 200, 255]); }
      put(ax, ay, [0, 120, 255]); put(bx, by, [0, 120, 255]);
      info.gap = gp.gap;
    }
  }
  const SW = W * scale, SH = H * scale, big = Buffer.alloc(SW * SH * 3);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const s = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 3, d = (y * SW + x) * 3; big[d] = img[s]; big[d + 1] = img[s + 1]; big[d + 2] = img[s + 2]; }
  fs.writeFileSync(file, png(SW, SH, big));
  return Object.assign(info, { w: SW, h: SH });
}

module.exports = { render, png };
