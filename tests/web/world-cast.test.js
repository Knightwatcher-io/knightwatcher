// Tests for the cast of the medieval world's pack, the cast section of web/packs/medieval.pack.json,
// against the code's drawings of it in web/js/props.js. Run with: node --test tests/web/
//
// The page's scripts run under Node in a sandbox, against a fake canvas context that writes one line
// per call, as in tests/web/scenes.test.js. The engine draws the cast from KW.cast, which the
// compiler (web/js/world.js) fills from the pack on a page that reads it, and which holds the code's
// members otherwise. Each member is drawn from the pack and from code, and the two records must be
// the same call for call; the engine's own frames are compared too, with the cast drawn from the
// pack on one page and from code on the other. tests/web/scenes.test.js holds the pack's cast to the
// stored records of the code's, fixtures/scenes/cast.json.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');
const PK = require('../../web/js/pack.js');

const WEB = path.join(__dirname, '../../web');
/* The pack's text with any signature taken off, so that these tests hold whether it is signed or
   not; a 'dev' page reads it so. */
const TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
/* The scripts index.html loads, in its order, but the carriers and the files that drive the page
   (demo, settings, main). */
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/settings.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));

/* ---- The recording context ------------------------------------------------------------------- */
const LOG = Symbol('log');
/* A context that writes one line per call into log. A canvas drawn with drawImage is written as its
   size alone, or, with deep, followed by its calls, each after a "| ". */
function context(log, deep) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', `canvas ${img.width}x${img.height}`, ...a].join(' '));
        if (deep) for (const l of img[LOG]) log.push('| ' + l);
      };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
}
function canvas() {
  const log = [];
  let w = 300, h = 150;
  const cv = { [LOG]: log, get width() { return w; }, set width(v) { w = v; log.length = 0; }, get height() { return h; }, set height(v) { h = v; log.length = 0; } };
  const ctx = context(log, true);
  cv.getContext = () => ctx;
  return cv;
}

/* The page's scripts in a sandbox, the knight from code, with the console's lines as [level, text].
   With texts, KW.world.start(texts, allowUnsigned) is called as main.js calls it. Without the
   compiler (world false), world.js is left out, as on a page without it. */
function page(texts, allowUnsigned, world) {
  const lines = [];
  const box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]), log() {} } });
  for (const f of SCRIPTS) {
    if (world === false && f === 'js/world.js') continue;
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start([], false);
  const st = texts ? KW.world.start(texts, allowUnsigned === true) : null;
  return { KW, box, lines, st };
}
/* The calls f makes, as lines. */
function record(KW, f) {
  const log = [];
  KW.draw.setCtx(context(log, true));
  f();
  return log;
}

const PACK = page([TEXT], true), CODE = page();

// ---- The cast --------------------------------------------------------------------------------------

test('the cast of kw.medieval reads clean: the fly, its wings in a group at an alpha of 0.85, and its costs', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(Object.keys(r.data.cast), ['critter.fly']);
  const fly = r.data.cast['critter.fly'];
  assert.deepEqual([fly.role, fly.name], ['critter', 'Fly']);
  assert.deepEqual(plain(fly.groups), { wings: { pivot: [0, 0] } });
  assert.deepEqual(plain(fly.alpha), { wings: 0.85 });
  // the two frames differ only in where the wings are: 2 above the body, and 6
  assert.deepEqual(fly.frames.flap0.map(s => s.g || null), ['wings', 'wings', null, null]);
  assert.deepEqual(fly.frames.flap0.map(s => s.p[1]), [-2, -2, 0, -2]);
  assert.deepEqual(fly.frames.flap1.map(s => s.p[1]), [-6, -6, 0, -2]);
  assert.deepEqual(plain(fly.dead), [{ k: 'rect', p: [-3, 0], w: 6, h: 5, fill: '#3a3344' }]);
  // the costs the counts step found, against a limit of 200 for each frame and for what falls
  assert.deepEqual(plain(r.world.cast['critter.fly']), { frames: { flap0: 24, flap1: 24, dead: 1 } });
});

test('a dev page draws the fly from the pack, a deployed page from code while the pack is unsigned, and KW.world.cast says so', () => {
  assert.deepEqual(plain(PACK.KW.world.cast), { source: 'pack', members: { 'critter.fly': 'pack' }, faults: [] });
  assert.notEqual(PACK.KW.cast.critters.fly, PACK.KW.props.CRITTERS.fly);
  assert.equal(PACK.KW.cast.critters.fly.from.split('#')[0], 'kw.medieval');
  // the code's fly is still there, as the fallback
  assert.equal(PACK.KW.props.CRITTERS.fly.draw, PACK.KW.props.flyHD);
  // all compiled: of the world's lines, the console has the scenes' alone (the knight, started from
  // code here, writes its own)
  assert.deepEqual(PACK.lines.filter(l => !l[1].includes('the knight')), [['info', PACK.st.note]]);
  const dep = page([TEXT], false);
  assert.deepEqual(plain(dep.KW.world.cast), { source: 'code', members: {}, faults: [] });
  assert.equal(dep.KW.cast.critters.fly, dep.KW.props.CRITTERS.fly);
  // before start, the cast is the code's
  assert.equal(CODE.KW.cast.critters.fly, CODE.KW.props.CRITTERS.fly);
  assert.equal(CODE.KW.world.cast, null);
});

test('starting again puts the code\'s cast back first', () => {
  const s = page([TEXT], true);
  assert.notEqual(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  s.KW.world.start(['not json'], true);
  assert.equal(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  assert.equal(s.KW.world.cast.source, 'code');
});

// ---- Call for call -----------------------------------------------------------------------------------

/* Points the fly is drawn at: whole, and with the fractions flyPos gives in the engine. */
const POINTS = [[300, 200], [0, 0], [-12, 40], [955, 590], [123.456, 78.9], [480.5, 200.5], [-30.25, 310.75], [710.0001, 99.9999], [1e-9, -1e-9], [333.3333333, 444.4444444]];

test('the fly\'s two frames and what falls, at whole and fractional points, draw the code\'s calls from the pack', () => {
  const F = PACK.KW.cast.critters.fly, P = CODE.KW.props;
  for (const [x, y] of POINTS) {
    for (const flap of [0, 1]) {
      const a = record(PACK.KW, () => F.draw(x, y, flap)), b = record(CODE.KW, () => P.flyHD(x, y, flap));
      assert.ok(b.length > 0);
      assert.deepEqual(a, b, `flap ${flap} at ${x} ${y}`);
    }
    // the fall moves the dead fly down by a * a / 900 over 900 ms
    for (const el of [0, 1, 260, 450.5, 899]) {
      const fy = y + el * el / 900;
      assert.deepEqual(record(PACK.KW, () => F.dead(x, fy)), record(CODE.KW, () => CODE.KW.props.CRITTERS.fly.dead(x, fy)), `dead at ${x} ${fy}`);
      // which is the call the engine made itself before the cast
      assert.deepEqual(record(CODE.KW, () => P.deadFlyHD(x, fy)), [`s #3a3344`, `r ${Math.round(x - 3)} ${Math.round(fy)} 6 5`]);
    }
  }
  // the wings are drawn at the group's alpha and the rest at 1, as the code sets them
  assert.deepEqual(record(PACK.KW, () => F.draw(300, 200, 1)).filter(l => l.startsWith('a ')), ['a 0.85', 'a 1']);
});

/* The engine's frames from 0 to ms every step ms on the page s, in the battlement while all is
   quiet, with n flies let in at 100 ms: they fly in, hover, are swatted and fall. Each frame is
   recorded on its own, the canvases it draws written by size alone (the backdrop and the devices,
   whose calls the scene records hold). */
function flies(s, n, ms, step) {
  const KW = s.KW, E = KW.engine, out = [];
  KW.hooks = { frozen: false };
  const log = [];
  E.init(context(log, false));
  E.reset();
  E.input = { w: KW.state.IDLE, is: 'battlement', turnMs: 60000, devices: [], tv: false, helmet: 'auto' };
  for (let t = 0; t <= ms; t += step) {
    if (t === 100) for (let i = 0; i < n; i++) E.addFly(100 + i);
    log.length = 0;
    E.draw(t);
    out.push([t, log.slice(), E.note]);
  }
  return out;
}

test('the engine\'s flies, flying in, hovering, swatted, struck and falling, draw the code\'s calls from the pack, frame by frame', () => {
  const a = flies(page([TEXT], true), 6, 4600, 20), b = flies(page(), 6, 4600, 20);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i][2], b[i][2], 'the note at ' + a[i][0]);
    assert.deepEqual(a[i][1], b[i][1], 'the frame at ' + a[i][0]);
  }
  // the frames cover every part of the fly's life: hovering with its wings at 0.85, swatted, and
  // falling once struck
  const all = b.map(f => f[1].join('\n')).join('\n');
  assert.ok(all.includes('a 0.85'));
  assert.ok(b.some(f => f[2] === 'swatting'));
  assert.ok(/s #3a3344\nr -?\d+ -?\d+ 6 5/.test(all), 'a dead fly falls');
});

test('the engine draws the fly KW.cast gives, and the code\'s on a page without the compiler', () => {
  const s = page([TEXT], true), seen = [];
  s.KW.cast.critters.fly = { draw: (x, y, flap) => seen.push(['draw', flap]), dead: () => seen.push(['dead']) };
  flies(s, 4, 3000, 20);
  assert.ok(seen.some(c => c[0] === 'draw' && c[1] === 0) && seen.some(c => c[0] === 'draw' && c[1] === 1) && seen.some(c => c[0] === 'dead'));
  const none = page(undefined, undefined, false);
  assert.equal(none.KW.cast, undefined);
  const a = flies(none, 6, 3000, 20), b = flies(page(), 6, 3000, 20);
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i][1], b[i][1], 'the frame at ' + a[i][0]);
});

// ---- What the compiler refuses -------------------------------------------------------------------

/* The pack, read, with its data changed by edit. */
function readEdited(edit) {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  const data = JSON.parse(JSON.stringify(r.data));
  edit(data);
  return Object.assign({}, r, { data });
}
const fly = d => d.cast['critter.fly'];

test('what the compiler does not build in the cast is refused by name', () => {
  const W = PACK.KW.world, refused = (edit, id, want) => assert.throws(() => W.compileMember(readEdited(edit), id), { message: want });
  // an effect placed on the screen by a field of its own does not move with the fly
  refused(d => { fly(d).dead.push({ k: 'fx', fx: 'pebbles', y: 0 }); }, 'critter.fly', 'cast.critter.fly.dead[1].fx: the effect "pebbles", placed on the screen by its field "y", in the cast is not built in this engine yet');
  // the marks and tiles belong to scenes
  refused(d => { fly(d).frames.flap1.push({ k: 'things' }); }, 'critter.fly', 'cast.critter.fly.frames.flap1[4].k: the mark "things" in the cast is not built in this engine yet');
  refused(d => { fly(d).frames.flap0.push({ k: 'tile', step: 4, phase: 0, from: 0, to: 8, shapes: [] }); }, 'critter.fly', 'cast.critter.fly.frames.flap0[4].k: a tile in the cast is not built in this engine yet');
  // a group the critter does not declare
  refused(d => { fly(d).frames.flap0[2].g = 'legs'; }, 'critter.fly', 'cast.critter.fly.frames.flap0[2].g: "g" outside its layer\'s groups is not built in this engine yet');
  refused(d => { delete d.cast['critter.fly']; }, 'critter.fly', 'cast.critter.fly: the pack has no such cast member');
});

test('a member that fails to compile is drawn from code, with its reason in KW.world.cast and a line of its own; a member the engine does not know is not compiled', () => {
  const s = page(), lib = s.KW.pack, broken = readEdited(d => { fly(d).frames.flap1[0].k = 'zz'; d.cast['critter.gnat'] = JSON.parse(JSON.stringify(fly(d))); });
  s.KW.pack = Object.assign({}, lib, { read: () => broken });
  const st = s.KW.world.start([TEXT], true);
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(s.KW.world.cast), { source: 'code', members: { 'critter.fly': 'code' },
    faults: [{ member: 'critter.fly', reason: 'cast.critter.fly.frames.flap1[0].k: the shape kind "zz" is not built in this engine yet' }] });
  assert.equal(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  assert.deepEqual(Object.keys(s.KW.cast.critters), ['fly']);
  assert.deepEqual(s.lines.filter(l => !l[1].includes('the knight')), [['warn', 'knightwatcher: the cast member critter.fly is drawn from code: it could not be compiled: ' + s.KW.world.cast.faults[0].reason],
    ['info', st.note]]);
  assert.match(st.note, /^knightwatcher: the scenes .* are drawn from the pack kw\.medieval /);
});
