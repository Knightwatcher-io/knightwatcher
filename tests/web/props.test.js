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
      if (k === 'fillRect') return (x, y, w, h) => { calls++; rects.push([x, y, w, h]); };
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

test('each new kind fits within 80 by 64 above its base, up and gone', () => {
  const { P, take } = load();
  for (const k of NEW) for (const ok of [true, false]) {
    const { rects } = take(() => P.KINDS[k].draw(X, Y, 2300, ok, 'still'));
    assert.ok(rects.length > 20, `${k} ${ok}: draws something`);
    for (const [x, y, w, h] of rects) {
      assert.ok(x >= X - 40 && x + w <= X + 41 && y >= Y - 64 && y + h <= Y + 2, `${k} ${ok ? 'up' : 'gone'}: fill ${x} ${y} ${w} ${h} outside the box`);
    }
  }
});

test('the moving part of each new kind is its lamp, inside the place, up and down', () => {
  const { P, take } = load();
  for (const k of NEW) for (const ok of [true, false]) {
    const m = take(() => P.KINDS[k].draw(X, Y, 0, ok, 'moving'));
    assert.ok(m.rects.length >= 1 && m.rects.length <= 2, `${k} ${ok}: ${m.rects.length} fills`);
    assert.equal(m.arcs.length, 3, k);
    // the light is centred on the lamp, inside the device's box, and its glow reaches 20 pixels at most
    for (const [x, y, r] of m.arcs) assert.ok(x >= X - 40 && x <= X + 40 && y >= Y - 64 && y <= Y && r <= 20, `${k}: light ${x} ${y} ${r}`);
    for (const [x, y, w, h] of m.rects) assert.ok(w <= 10 && h <= 10, `${k}: lamp ${w} by ${h}`);
  }
});

test('the lamp fades to black and back: green over 3.6 s while up, red over 2 s while down', () => {
  const { KW, P } = load();
  const fills = [];
  const ctx = new Proxy({}, { set(_, k, v) { if (k === 'fillStyle') fills.push(v); return true; }, get() { return () => {}; } });
  KW.draw.setCtx(ctx);
  const core = (ok, t) => { fills.length = 0; P.KINDS.machine.draw(X, Y, t, ok, 'moving'); return fills[1]; };
  assert.equal(core(true, 0), 'rgb(143,224,122)');
  assert.equal(core(true, 1800), 'rgb(0,0,0)');
  assert.equal(core(true, 3600), 'rgb(143,224,122)');
  assert.equal(core(false, 0), 'rgb(255,74,61)');
  assert.equal(core(false, 1000), 'rgb(0,0,0)');
  assert.equal(core(false, 2000), 'rgb(255,74,61)');
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

test('while up the pie lights green through its lattice, to near black and back over 3.6 s, as a device lamp does', () => {
  const { P, take } = load();
  const at = t => lampShown(P, take, true, t);
  assert.equal(at(0).colour, 'rgb(143,224,122)');
  assert.equal(at(1800).colour, 'rgb(11,19,12)');
  assert.equal(at(3600).colour, 'rgb(143,224,122)');
  // the light round it is the engine's green, strongest when it is brightest and gone when it is darkest
  assert.ok(at(0).glow.every(g => g[3] === 'rgb(143,224,122)'), 'a green light');
  assert.equal(Math.max(...at(0).glow.map(g => g[4])), .3);
  assert.equal(Math.max(...at(1800).glow.map(g => g[4])), 0);
});

test('while down the last slice\'s filling blinks red to black over 2 s, in the down lamp\'s reds alone', () => {
  const { P, take } = load();
  const at = t => lampShown(P, take, false, t);
  const reds = Object.values(P.LAMP_REDS);
  assert.ok(reds.includes(bodyColour(at(0).lit)), bodyColour(at(0).lit));
  assert.equal(at(1000).colour, 'rgb(0,0,0)');
  assert.equal(at(2000).colour, at(0).colour);
  for (const [, , , , c] of at(0).lit.fills) assert.ok(reds.includes(c), `the lit slice in ${c}`);
  for (const [, , , , c] of at(0).dark.fills) assert.equal(c, '#000000');
  assert.ok(at(0).glow.every(g => g[3] === 'rgb(255,74,61)'), 'a red light');
});

test('the lamp is the filling the still part leaves showing: up in the gaps of the lattice, down in the last slice', () => {
  const { KW, P, take } = load();
  for (const ok of [true, false]) {
    const b = lampShown(P, take, ok, 0), lamp = covered(b.lit, b.at[0], b.at[1]), filling = fillingLeft(KW, ok);
    assert.equal(covered(b.dark, b.at[0], b.at[1]).size, lamp.size, 'the dark drawing covers the same pixels');
    assert.deepEqual([...lamp].sort(), [...filling].sort(), ok ? 'up' : 'gone');
  }
  // up, 398 pixels of filling through the lattice; down, the slice's 108
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

test('the down pie is the empty dish with the last slice in it, whose lamp lies in the dish, and keeps no lamp still', () => {
  const { P, take } = load();
  const still = take(() => P.KINDS.pi.draw(X, Y, 0, false, 'still'));
  assert.equal(still.images.length, 0);
  assert.equal(still.arcs.length, 0);
  const b = lampShown(P, take, false, 0);
  assert.deepEqual([b.at, b.size], [[X - 11, Y - 29], [30, 10]]);
  // inside the dish's opening, which spans 32 either side of its middle
  assert.ok(b.at[0] >= X - 32 && b.at[0] + b.size[0] <= X + 32, `lamp at ${b.at}`);
  for (const [x, y] of b.glow) assert.deepEqual([x, y], [X + 4, Y - 24]);
});

test('the pie\'s lamp and its light stay inside the pie\'s place, up and down, at every moment', () => {
  const { P, take } = load();
  for (const ok of [true, false]) for (const t of [0, 450, 900, 1800, 2700]) {
    const b = lampShown(P, take, ok, t);
    assert.ok(b.at[0] >= X - 44 && b.at[0] + b.size[0] <= X + 44 && b.at[1] >= Y - 112 && b.at[1] + b.size[1] <= Y, `lamp ${ok} ${t}: ${b.at}`);
    for (const [x, y, r] of b.glow) assert.ok(x - r >= X - 44 && x + r <= X + 44 && y - r >= Y - 112 && y + r <= Y, `light ${ok} ${t}: ${x} ${y} ${r}`);
  }
});

test('the pie\'s lamp is painted once in each drawing, whatever the time', () => {
  const { P, take } = load();
  const seen = new Set();
  for (const ok of [true, false]) for (const t of [0, 700, 1300, 2300]) for (const [cv] of take(() => P.KINDS.pi.draw(X, Y, t, ok, 'moving')).images) seen.add(cv);
  assert.equal(seen.size, 4, 'up dark and lit, down dark and lit');
});
