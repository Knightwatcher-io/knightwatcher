// Tests for the devices' props in web/js/props.js: each kind stays inside its place, its
// gone state draws differently from its up state, and only what moves (the pie's steam and its
// lamp, and a device's lamp) is drawn each frame. The pie's lamp is the filling under its lattice
// up and the last slice's filling down, and lies exactly where the still part leaves filling.
// Run with: node --test tests/web/
//
// The drawing code runs under Node against a fake canvas context that records every fillRect,
// every arc and every drawImage, the calls that put pixels down. The pie's lamp is painted once
// into small canvases of its own, which the fake document gives it: each keeps what is filled
// in it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');

/* A canvas of the fake document. fills holds what is painted into it, as [x, y, w, h, colour]. */
function fakeCanvas() {
  const cv = { width: 0, height: 0, fills: [] };
  let colour = null;
  const ctx = new Proxy({}, {
    set(_, k, v) { if (k === 'fillStyle') colour = v; return true; },
    get(_, k) { return k === 'fillRect' ? (x, y, w, h) => cv.fills.push([x, y, w, h, colour]) : () => {}; },
  });
  cv.getContext = () => ctx;
  return cv;
}

/* draw.js, sprites.js, effects.js and props.js, as index.html loads them, into a sandbox whose
   window is an empty object, drawing into a context that keeps what each call covers, with the
   alpha it was drawn at. */
function load() {
  const rects = [], arcs = [], images = [];
  let calls = 0, galpha = 1, colour = null;
  const ctx = new Proxy({}, {
    set(_, k, v) { calls++; if (k === 'globalAlpha') galpha = v; if (k === 'fillStyle') colour = v; return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { calls++; rects.push([x, y, w, h, colour]); };
      if (k === 'arc') return (x, y, r) => { calls++; arcs.push([x, y, r, colour, galpha]); };
      if (k === 'drawImage') return (cv, x, y) => { calls++; images.push([cv, x, y, galpha]); };
      return () => { calls++; };
    },
  });
  const box = vm.createContext({ window: {}, document: { createElement: () => fakeCanvas() } });
  for (const f of ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  const KW = box.window.KW;
  KW.draw.setCtx(ctx);
  const take = f => {
    rects.length = 0; arcs.length = 0; images.length = 0; calls = 0; galpha = 1; f();
    return { rects: rects.slice(), arcs: arcs.slice(), images: images.slice(), calls };
  };
  return { KW, P: KW.props, take };
}

const X = 400, Y = 300;
const NEW = ['camera', 'machine', 'vm', 'box'];

test('the kinds the page draws, and a kind it does not know drawn as the plain box', () => {
  const { P } = load();
  assert.deepEqual(Object.keys(P.KINDS), ['pi', 'camera', 'machine', 'vm', 'box']);
  for (const k of ['', 'printer', 'acme.devices/printer', '__proto__', 'constructor', 'toString', 42, null, undefined]) assert.equal(P.kindOf(k), P.KINDS.box, String(k));
  for (const k of Object.keys(P.KINDS)) assert.equal(P.kindOf(k), P.KINDS[k]);
});

/* The box each kind fits in from the base, x0, y0, x1, y1, x1 and y1 exclusive: the owl 80 by 64,
   as the high class has always held it, the rest the ground class's box, as pack.js's CLASS_BOX. */
const CLASS = { camera: [-40, -64, 41, 2], machine: [-66, -93, 56, 2], vm: [-66, -93, 56, 2], box: [-66, -93, 56, 2] };

test('each new kind fits within its class box above its base, up and gone: the owl the high class\'s, the rest the ground class\'s', () => {
  const { P, take } = load();
  for (const k of NEW) for (const ok of [true, false]) {
    const [x0, y0, x1, y1] = CLASS[k];
    for (const part of ['still', 'moving']) {
      const { rects, images } = take(() => P.KINDS[k].draw(X, Y, 2300, ok, part));
      if (part === 'still') assert.ok(rects.length > 20, `${k} ${ok}: draws something`);
      for (const [x, y, w, h] of rects) assert.ok(x >= X + x0 && x + w <= X + x1 && y >= Y + y0 && y + h <= Y + y1, `${k} ${ok ? 'up' : 'gone'} ${part}: fill ${x} ${y} ${w} ${h} outside the box`);
      for (const [cv, x, y] of images) assert.ok(x >= X + x0 && x + cv.width <= X + x1 && y >= Y + y0 && y + cv.height <= Y + y1, `${k} ${ok ? 'up' : 'gone'}: lamp at ${x} ${y}`);
    }
  }
});

test('the moving part of each new kind up is a lamp of its own, inside its box; down, no kind has a lamp', () => {
  const { P, take } = load();
  for (const k of NEW) for (const ok of [true, false]) {
    const m = take(() => P.KINDS[k].draw(X, Y, 0, ok, 'moving'));
    if (!ok) {
      // unlit, and nothing to blink: the question mark over it carries the alert
      assert.deepEqual([m.rects.length, m.arcs.length, m.images.length], [0, 0, 0], k);
      continue;
    }
    // the dark drawing and the lit one over it, and its light of radius 24 round it
    assert.equal(m.rects.length, 0, k);
    assert.equal(m.images.length, 2, k);
    assert.equal(m.arcs.length, 3, k);
    const [[dark, dx, dy], [lit, lx, ly]] = m.images;
    assert.deepEqual([lx, ly, lit.width, lit.height], [dx, dy, dark.width, dark.height], k);
    assert.equal(Math.max(...m.arcs.map(g => g[2])), 24, k);
  }
});

test('the engine\'s own lamp fades to black and back: green over 3.6 s while up, red over 2 s while down', () => {
  const { KW, P } = load();
  const fills = [];
  const ctx = new Proxy({}, { set(_, k, v) { if (k === 'fillStyle') fills.push(v); return true; }, get() { return () => {}; } });
  KW.draw.setCtx(ctx);
  const core = (ok, t) => { fills.length = 0; P.lampHD(X, Y, t, ok); return fills[1]; };
  assert.equal(core(true, 0), 'rgb(143,224,122)');
  assert.equal(core(true, 1800), 'rgb(0,0,0)');
  assert.equal(core(true, 3600), 'rgb(143,224,122)');
  assert.equal(core(false, 0), 'rgb(255,74,61)');
  assert.equal(core(false, 1000), 'rgb(0,0,0)');
  assert.equal(core(false, 2000), 'rgb(255,74,61)');
});

test('up, the owl\'s eyes glow amber, the crystal pale blue-white, the potion blue and the chest\'s jewel gold, and never go unlit; down, nothing is lit and no red is left; no green anywhere', () => {
  const { P, take } = load();
  const reds = Object.values(P.LAMP_REDS);
  const UP = { camera: [['#ffb000', '#c98600', '#ffe28a'], '#ffb000'], machine: [['#dcecff', '#a6c6ec', '#ffffff', '#f2f8ff'], '#cde4ff'],
    vm: [['#6fb4ff', '#3f78c8', '#d6ecff'], '#6fb4ff'], box: [['#ffb000', '#ffe28a'], '#ffb000'] };
  // the dimmer colour of the same hue each lamp pulses down to, its body colour at the low point
  const LOW = { camera: '#c98600', machine: '#7894c0', vm: '#3f78c8', box: '#c98600' };
  const greens = ['#8fe07a', '#5e9451', '#e4ffd6', 'rgb(143,224,122)'];
  for (const k of NEW) {
    const at = t => take(() => P.KINDS[k].draw(X, Y, t, true, 'moving'));
    const m = at(0), [[dark], [lit, , , a]] = m.images, darks = new Set(dark.fills.map(f => f[4])), lamp = UP[k][0];
    assert.equal(a, 1, k);
    // the lit drawing: the lamp's colours, and where they lack a key the dark drawing's
    for (const [, , , , c] of lit.fills) assert.ok(lamp.includes(c) || darks.has(c), `${k}: ${c}`);
    assert.ok(lit.fills.some(f => lamp.includes(f[4])), k);
    for (const [, , , , c] of lit.fills.concat(dark.fills)) assert.ok(!greens.includes(c) && !reds.includes(c), `${k}: no green or red, ${c}`);
    assert.ok(m.arcs.every(g => g[3] === UP[k][1]), k);
    // at the bottom of the loop the lit drawing is gone, and the dark one beneath is still lit: its
    // body a clear colour of the lamp's hue, bright enough that the device never reads as down
    assert.equal(at(1800).images[1][3], 0, k);
    assert.equal(bodyColour(dark), LOW[k], k);
    assert.ok(Math.max(...rgbOf(bodyColour(dark))) >= 160, `${k}: ${bodyColour(dark)} reads as lit`);
  }
  // down, the still part alone: no down red, no green, no light; the owl's eyes dazed spirals, unlit,
  // their gaps dark, and the chest's jewel dark glass
  for (const k of NEW) {
    const m = take(() => P.KINDS[k].draw(X, Y, 0, false, 'still'));
    assert.equal(m.arcs.length, 0, k);
    for (const [, , , , c] of m.rects) assert.ok(!reds.includes(c) && !greens.includes(c), `${k} gone: ${c}`);
  }
  const owl = take(() => P.KINDS.camera.draw(X, Y, 0, false, 'still')).rects.map(f => f[4]);
  assert.ok(owl.includes('#6e6478') && owl.includes('#1e1828'), 'the dazed spirals and their gaps');
  assert.ok(take(() => P.KINDS.box.draw(X, Y, 0, false, 'still')).rects.some(f => f[4] === '#2a2430'), 'the dark jewel');
});

test('the owl\'s wall plate stands where the camera\'s stood, x 22 to 32 from 64 above the base, so a pole meets it', () => {
  const { P, take } = load();
  for (const ok of [true, false]) {
    const { rects } = take(() => P.KINDS.camera.draw(X, Y, 0, ok, 'still'));
    // the plate's outline, a column 10 wide whose top row is 64 above the base, and nothing right of it
    const plate = rects.filter(([x, , w]) => x >= X + 22 && x + w <= X + 32);
    assert.equal(Math.min(...plate.map(r => r[1])), Y - 64, ok ? 'up' : 'gone');
    assert.ok(rects.some(([x, , w]) => x === X + 22 && w === 10), ok ? 'up' : 'gone');
    for (const [x, , w] of rects) assert.ok(x + w <= X + 32, 'nothing right of the plate');
  }
});

test('the still part does not change with time, so it can be painted once', () => {
  const { P, take } = load();
  for (const k of Object.keys(P.KINDS)) for (const ok of [true, false]) {
    const a = take(() => P.KINDS[k].draw(X, Y, 0, ok, 'still')), b = take(() => P.KINDS[k].draw(X, Y, 7777, ok, 'still'));
    assert.deepEqual(a, b, k);
  }
});

test('a gone device looks different from the same device up', () => {
  const { P, take } = load();
  for (const k of Object.keys(P.KINDS)) {
    const up = take(() => P.KINDS[k].draw(X, Y, 0, true, 'still')), gone = take(() => P.KINDS[k].draw(X, Y, 0, false, 'still'));
    assert.notDeepEqual(up.rects, gone.rects, k);
  }
});

test('the pie in parts draws what it always drew, apart from its own question mark', () => {
  const { P, take } = load();
  for (const ok of [true, false]) for (const t of [0, 2300]) {
    const whole = take(() => P.pieHD(X - 32, Y - 31, t, ok));
    const parts = take(() => { P.pieHD(X - 32, Y - 31, t, ok, 'still'); P.pieHD(X - 32, Y - 31, t, ok, 'moving'); });
    // with ok false and the blink on, the whole pie draws the question mark after the empty dish
    if (!ok && Math.floor(t / 400) % 2) assert.deepEqual(whole.rects.slice(0, parts.rects.length), parts.rects);
    else assert.deepEqual(whole, parts);
  }
});

test('calls per frame for each kind\'s moving part, and once for its still part', t => {
  const { KW, P, take } = load();
  for (const k of Object.keys(P.KINDS)) for (const ok of [true, false]) {
    const still = take(() => P.KINDS[k].draw(X, Y, 0, ok, 'still')).calls, moving = take(() => P.KINDS[k].draw(X, Y, 2300, ok, 'moving')).calls;
    t.diagnostic(`${k} ${ok ? 'up' : 'gone'}: still ${still} calls once, moving ${moving} calls a frame`);
    assert.ok(moving <= (k === 'pi' ? 120 : 30), `${k}: ${moving} calls a frame`);
  }
  for (const ok of [true, false]) {
    // the pie's lamp, its light and two drawings, costs what a device's lamp costs, at its
    // brightest and at its darkest; up, the steam is the rest of the moving part
    const calls = [0, 900, 1800].map(tt => take(() => P.KINDS.pi.draw(X, Y, tt, ok, 'moving')).calls - (ok ? take(() => KW.effects.steam.draw({ p: [X - 14, Y - 53] }, tt)).calls : 0));
    t.diagnostic(`the pie's lamp ${ok ? 'up' : 'gone'}: ${calls.join(', ')} calls a frame at 0, 900 and 1800 ms`);
    for (const c of calls) assert.ok(c <= 20, `the pie's lamp: ${c} calls a frame`);
  }
});

/* ---- The pie's lamp ------------------------------------------------------------------------- */

const rgbOf = c => (c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).map(Number));
/* The colour that covers most of a sprite: the filling's lit side. */
function bodyColour(cv) {
  const area = new Map();
  for (const [, , w, h, c] of cv.fills) area.set(c, (area.get(c) || 0) + w * h);
  return [...area].sort((a, b) => b[1] - a[1])[0][0];
}
/* What the pie's moving part shows of its lamp at time t: the dark drawing, the lit one over it at
   the lamp's level, and the colour of the filling's lit side that makes, with the light round it. */
function lampShown(P, take, ok, t) {
  const m = take(() => P.KINDS.pi.draw(X, Y, t, ok, 'moving'));
  assert.equal(m.images.length, 2, 'the dark drawing and the lit one');
  const [[dark, dx, dy, da], [lit, lx, ly, a]] = m.images;
  assert.deepEqual([lx, ly, da], [dx, dy, 1], 'the lit drawing lies exactly over the dark one, drawn whole');
  const d = rgbOf(bodyColour(dark)), l = rgbOf(bodyColour(lit));
  return { a, dark, lit, colour: 'rgb(' + d.map((v, i) => Math.round(v * (1 - a) + l[i] * a)).join(',') + ')', glow: m.arcs, at: [dx, dy], size: [dark.width, dark.height] };
}
/* The pixels the still part leaves in the filling's colours, as "x,y", each pixel its last fill. */
function fillingLeft(KW, ok) {
  const at = new Map();
  let colour = null;
  const ctx = new Proxy({}, {
    set(_, k, v) { if (k === 'fillStyle') colour = v; return true; },
    get(_, k) { return k === 'fillRect' ? (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) at.set((x + i) + ',' + (y + j), colour); } : () => {}; },
  });
  const was = KW.draw.getCtx(); KW.draw.setCtx(ctx);
  KW.props.KINDS.pi.draw(X, Y, 0, ok, 'still');
  KW.draw.setCtx(was);
  const FILLING = ['#d2325f', '#9a1640', '#5c0a24'];
  return new Set([...at].filter(([, c]) => FILLING.includes(c)).map(([p]) => p));
}
/* The pixels a sprite drawn at (x, y) covers, as "x,y". */
function covered(cv, x, y) {
  const s = new Set();
  for (const [fx, fy, w, h] of cv.fills) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.add((x + fx + i) + ',' + (y + fy + j));
  return s;
}

test('while up the pie lights red through its lattice, to a dimmer red, never unlit, and back over 3.6 s, as a device lamp does', () => {
  const { P, take } = load();
  const at = t => lampShown(P, take, true, t);
  assert.equal(at(0).colour, 'rgb(255,74,61)');
  assert.equal(at(1800).colour, 'rgb(168,49,40)');
  assert.equal(at(3600).colour, 'rgb(255,74,61)');
  // the light round it is red, strongest when it is brightest and gone when it is darkest
  assert.ok(at(0).glow.every(g => g[3] === '#ff4a3d'), 'a red light');
  assert.equal(Math.max(...at(0).glow.map(g => g[4])), .3);
  assert.equal(Math.max(...at(1800).glow.map(g => g[4])), 0);
});

test('while down the pie has no lamp and no steam: its moving part draws nothing', () => {
  const { P, take } = load();
  for (const t of [0, 1000, 2000]) assert.deepEqual(take(() => P.KINDS.pi.draw(X, Y, t, false, 'moving')), { rects: [], arcs: [], images: [], calls: 0 });
});

test('the lamp is the filling the still part leaves showing in the gaps of the lattice; down, the last slice\'s filling is still and unlit', () => {
  const { KW, P, take } = load();
  const b = lampShown(P, take, true, 0), lamp = covered(b.lit, b.at[0], b.at[1]), filling = fillingLeft(KW, true);
  assert.equal(covered(b.dark, b.at[0], b.at[1]).size, lamp.size, 'the dark drawing covers the same pixels');
  assert.deepEqual([...lamp].sort(), [...filling].sort());
  // up, 398 pixels of filling through the lattice; down, the slice's 108, in the filling's own colours
  assert.equal(fillingLeft(KW, true).size, 398);
  assert.equal(fillingLeft(KW, false).size, 108);
});

test('no raspberry stands on the pie: the steam rises from the top of the dome, and the lamp lies within the top', () => {
  const { P, take } = load();
  const still = take(() => P.KINDS.pi.draw(X, Y, 0, true, 'still'));
  assert.equal(still.images.length, 0);
  assert.equal(still.arcs.length, 0);
  // nothing still stands above the top of the crust's dome
  for (const [x, y, w, h] of still.rects) assert.ok(y >= Y - 47, `still fill ${x} ${y} ${w} ${h} above the dome`);
  const b = lampShown(P, take, true, 0);
  assert.deepEqual([b.at, b.size], [[X - 27, Y - 43], [56, 23]]);
  for (const [x, y] of b.glow) assert.deepEqual([x, y], [X + 1, Y - 30]);
  // the steam's puffs start on the dome's top, 53 above the base, and rise from there
  const m = take(() => P.KINDS.pi.draw(X, Y, 0, true, 'moving'));
  const puffs = m.rects.filter(([, y]) => y < Y - 43);
  assert.ok(puffs.length > 0);
  assert.equal(Math.max(...puffs.map(([, y, , h]) => y + h)), Y - 46 + 1);
});

test('the down pie is the empty dish with the last slice in it, drawn still', () => {
  const { P, take } = load();
  const still = take(() => P.KINDS.pi.draw(X, Y, 0, false, 'still'));
  assert.equal(still.images.length, 0);
  assert.equal(still.arcs.length, 0);
  // the slice lies inside the dish's opening, which spans 32 either side of its middle
  assert.ok(still.rects.length > 50);
});

test('the pie\'s lamp and its light stay inside the pie\'s place at every moment', () => {
  const { P, take } = load();
  for (const ok of [true]) for (const t of [0, 450, 900, 1800, 2700]) {
    const b = lampShown(P, take, ok, t);
    assert.ok(b.at[0] >= X - 44 && b.at[0] + b.size[0] <= X + 44 && b.at[1] >= Y - 112 && b.at[1] + b.size[1] <= Y, `lamp ${ok} ${t}: ${b.at}`);
    for (const [x, y, r] of b.glow) assert.ok(x - r >= X - 44 && x + r <= X + 44 && y - r >= Y - 112 && y + r <= Y, `light ${ok} ${t}: ${x} ${y} ${r}`);
  }
});

test('the pie\'s lamp is painted once in each drawing, whatever the time', () => {
  const { P, take } = load();
  const seen = new Set();
  for (const ok of [true, false]) for (const t of [0, 700, 1300, 2300]) for (const [cv] of take(() => P.KINDS.pi.draw(X, Y, t, ok, 'moving')).images) seen.add(cv);
  assert.equal(seen.size, 2, 'the dark drawing and the lit one, up');
});
