// Tests for the watched things' props in web/js/props.js: each kind stays inside its place, its
// gone state draws differently from its up state, and only what moves (the pie's steam and a
// device's lamp) is drawn each frame.
// Run with: node --test tests/web/
//
// The drawing code runs under Node against a fake canvas context that records every fillRect and
// every arc, the two calls that put pixels down.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');

/* draw.js, sprites.js and props.js, as index.html loads them, into a sandbox whose window is an
   empty object, drawing into a context that keeps what each call covers. */
function load() {
  const rects = [], arcs = [];
  let calls = 0;
  const ctx = new Proxy({}, {
    set() { calls++; return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { calls++; rects.push([x, y, w, h]); };
      if (k === 'arc') return (x, y, r) => { calls++; arcs.push([x, y, r]); };
      return () => { calls++; };
    },
  });
  const box = vm.createContext({ window: {} });
  for (const f of ['js/draw.js', 'js/sprites.js', 'js/props.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  const KW = box.window.KW;
  KW.draw.setCtx(ctx);
  const take = f => { rects.length = 0; arcs.length = 0; calls = 0; f(); return { rects: rects.slice(), arcs: arcs.slice(), calls }; };
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
});
