// Tests for the watched things' props in web/js/props.js: each kind stays inside its place, its
// gone state draws differently from its up state, and only what moves (the pie's steam and its
// raspberry, and a device's lamp) is drawn each frame.
// Run with: node --test tests/web/
//
// The drawing code runs under Node against a fake canvas context that records every fillRect,
// every arc and every drawImage, the calls that put pixels down. The raspberry is painted once
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

/* draw.js, sprites.js and props.js, as index.html loads them, into a sandbox whose window is an
   empty object, drawing into a context that keeps what each call covers, with the alpha it was
   drawn at. */
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
  for (const f of ['js/draw.js', 'js/sprites.js', 'js/props.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
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
    // the light is centred on the lamp, inside the thing's box, and its glow reaches 20 pixels at most
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

test('a gone thing looks different from the same thing up', () => {
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
  const { P, take } = load();
  for (const k of Object.keys(P.KINDS)) for (const ok of [true, false]) {
    const still = take(() => P.KINDS[k].draw(X, Y, 0, ok, 'still')).calls, moving = take(() => P.KINDS[k].draw(X, Y, 2300, ok, 'moving')).calls;
    t.diagnostic(`${k} ${ok ? 'up' : 'gone'}: still ${still} calls once, moving ${moving} calls a frame`);
    assert.ok(moving <= (k === 'pi' ? 120 : 30), `${k}: ${moving} calls a frame`);
  }
  for (const ok of [true, false]) {
    // the raspberry costs what a device's lamp costs, at its brightest and at its darkest
    const calls = [0, 900, 1800].map(tt => take(() => P.raspberryHD(X, Y, tt, ok)).calls);
    t.diagnostic(`the raspberry ${ok ? 'up' : 'gone'}: ${calls.join(', ')} calls a frame at 0, 900 and 1800 ms, of the pie's moving part`);
    for (const c of calls) assert.ok(c <= 20, `raspberry: ${c} calls a frame`);
  }
});

/* ---- The raspberry, the pie's lamp -------------------------------------------------------- */

const rgbOf = c => (c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).map(Number));
/* The colour that covers most of a sprite among those the other sprite does not use: the
   drupelets' lit side. The outline and the calyx are the same in both and drop out. */
function bodyColour(cv, other) {
  const theirs = new Set(other.fills.map(f => f[4])), area = new Map();
  for (const [, , w, h, c] of cv.fills) if (!theirs.has(c)) area.set(c, (area.get(c) || 0) + w * h);
  return [...area].sort((a, b) => b[1] - a[1])[0][0];
}
/* What the pie's moving part shows of the raspberry at time t: the dark berry, the lit one over
   it at the lamp's level, and the drupelets' colour that makes, with the light round it. */
function berryShown(P, take, ok, t) {
  const m = take(() => P.KINDS.pi.draw(X, Y, t, ok, 'moving'));
  assert.equal(m.images.length, 2, 'the dark berry and the lit one');
  const [[dark, dx, dy, da], [lit, lx, ly, a]] = m.images;
  assert.deepEqual([lx, ly, da], [dx, dy, 1], 'the lit berry lies exactly over the dark one, drawn whole');
  const d = rgbOf(bodyColour(dark, lit)), l = rgbOf(bodyColour(lit, dark));
  return { a, colour: 'rgb(' + d.map((v, i) => Math.round(v * (1 - a) + l[i] * a)).join(',') + ')', glow: m.arcs, at: [dx, dy], size: [dark.width, dark.height] };
}

test('while up the raspberry lights in its own colours, crimson to pink-red, over 3.6 s', () => {
  const { P, take } = load();
  const at = t => berryShown(P, take, true, t);
  assert.equal(at(0).colour, 'rgb(255,92,128)');
  assert.equal(at(1800).colour, 'rgb(106,15,46)');
  assert.equal(at(3600).colour, 'rgb(255,92,128)');
  // the light round it is strongest when it is brightest and gone when it is darkest
  assert.equal(Math.max(...at(0).glow.map(g => g[4])), .3);
  assert.equal(Math.max(...at(1800).glow.map(g => g[4])), 0);
});

test('while down the lone raspberry blinks red to black over 2 s, as a lamp does', () => {
  const { P, take } = load();
  const at = t => berryShown(P, take, false, t);
  assert.equal(at(0).colour, 'rgb(255,74,61)');
  assert.equal(at(1000).colour, 'rgb(0,0,0)');
  assert.equal(at(2000).colour, 'rgb(255,74,61)');
  assert.ok(at(0).glow.every(g => g[3] === 'rgb(255,74,61)'), 'a red light');
});

test('the up pie\'s still part no longer holds the raspberry; its moving part draws it', () => {
  const { P, take } = load();
  const still = take(() => P.KINDS.pi.draw(X, Y, 0, true, 'still'));
  assert.equal(still.images.length, 0);
  assert.equal(still.arcs.length, 0);
  // nothing still stands above the top of the crust's dome, where the raspberry sits
  for (const [x, y, w, h] of still.rects) assert.ok(y >= Y - 47, `still fill ${x} ${y} ${w} ${h} above the dome`);
  const b = berryShown(P, take, true, 0);
  // the berry stands on the top of the dome, in the middle
  assert.equal(b.at[0] + b.size[0] / 2, X + .5);
  assert.ok(b.at[1] + b.size[1] > Y - 47 && b.at[1] < Y - 47, 'the berry sits on the dome');
});

test('the down pie draws the lone raspberry lamp in its empty dish, and keeps no lamp still', () => {
  const { P, take } = load();
  const still = take(() => P.KINDS.pi.draw(X, Y, 0, false, 'still'));
  assert.equal(still.images.length, 0);
  assert.equal(still.arcs.length, 0);
  const b = berryShown(P, take, false, 0);
  // in the dish, to the right of the question mark's dot, which stands over the dish's middle
  assert.ok(b.at[0] > X && b.at[0] + b.size[0] <= X + 38, `berry at ${b.at}`);
  assert.ok(b.at[1] + b.size[1] > Y - 31 && b.at[1] + b.size[1] <= Y, `berry at ${b.at}`);
  // its light is centred on it
  for (const [x, y] of b.glow) assert.deepEqual([x, y], [b.at[0] + 13, b.at[1] + 18]);
});

test('the raspberry and its light stay inside the pie\'s place, up and down, at every moment', () => {
  const { P, take } = load();
  for (const ok of [true, false]) for (const t of [0, 450, 900, 1800, 2700]) {
    const b = berryShown(P, take, ok, t);
    assert.ok(b.at[0] >= X - 44 && b.at[0] + b.size[0] <= X + 44 && b.at[1] >= Y - 112 && b.at[1] + b.size[1] <= Y, `berry ${ok} ${t}: ${b.at}`);
    for (const [x, y, r] of b.glow) assert.ok(x - r >= X - 44 && x + r <= X + 44 && y - r >= Y - 112 && y + r <= Y, `light ${ok} ${t}: ${x} ${y} ${r}`);
  }
});

test('the raspberry is painted once in each colouring, whatever the time', () => {
  const { P, take } = load();
  const seen = new Set();
  for (const ok of [true, false]) for (const t of [0, 700, 1300, 2300]) for (const [cv] of take(() => P.KINDS.pi.draw(X, Y, t, ok, 'moving')).images) seen.add(cv);
  assert.equal(seen.size, 4, 'up dark and lit, down dark and lit');
});
