// Tests for the devices of the medieval world's pack, the prop set props.medieval in
// web/packs/medieval.pack.json, against the code's drawings of them in web/js/props.js. Run with:
// node --test tests/web/
//
// The page's scripts run under Node in a sandbox, against a fake canvas context that writes one line
// per call, as in tests/web/scenes.test.js: a canvas painted once and drawn with drawImage (a
// device's still part, the pie's lamp, the question mark) is written into the record where it is
// drawn, each of its calls after a "| ". The engine draws the devices through KW.devices from
// KW.kinds, which the compiler (web/js/world.js) fills from the prop set on a page that reads the
// pack, and which holds the code's KW.props.KINDS otherwise. Every kind is drawn in every place of
// every scene, up and gone, with and without its question mark, at several moments, once from the
// pack and once from code, and the two records must be the same call for call; so must each kind's
// still and moving parts drawn alone. tests/web/props.test.js checks the code's drawings themselves,
// and stays as it is.
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
   (demo, settings, main): the drawing, the scenes, the pack library, the compiler, the state
   library and the engine. */
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/settings.js', 'js/main.js'].includes(s));
const KINDS = ['pi', 'camera', 'machine', 'vm', 'box'];
const plain = v => JSON.parse(JSON.stringify(v));

/* ---- The recording context ------------------------------------------------------------------- */
const LOG = Symbol('log');
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', `canvas ${img.width}x${img.height}`, ...a].join(' '));
        for (const l of img[LOG]) log.push('| ' + l);
      };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
}
let canvases = 0;
function canvas() {
  const log = [];
  let w = 300, h = 150;
  canvases++;
  const cv = { [LOG]: log, get width() { return w; }, set width(v) { w = v; log.length = 0; }, get height() { return h; }, set height(v) { h = v; log.length = 0; } };
  const ctx = context(log);
  cv.getContext = () => ctx;
  return cv;
}

/* The page's scripts in a sandbox, the knight from code, with the console's lines as [level, text].
   With texts, KW.world.start(texts, allowUnsigned) is called as main.js calls it. */
function page(texts, allowUnsigned) {
  const lines = [];
  const box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]), log() {} } });
  for (const f of SCRIPTS) {
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
  KW.draw.setCtx(context(log));
  f();
  return log;
}
/* The scene's places with every place behind the knight, so that KW.devices.draw draws all of them
   (a place in front is drawn by the engine's frame after the knight, by the same placeHD). */
const behind = places => Object.fromEntries(Object.entries(places).map(([k, v]) => [k, Object.assign({}, v, { front: false })]));

const PACK = page([TEXT], true), CODE = page();

// ---- The prop set ----------------------------------------------------------------------------------

test('the prop set props.medieval reads clean, gives the five kinds with their marks, and costs what the docs say', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  const set = r.data.props['props.medieval'];
  assert.equal(set.name, 'Medieval devices');
  assert.deepEqual(Object.keys(set.kinds), KINDS);
  // the marks are the code's
  for (const k of KINDS) assert.equal(set.kinds[k].mark, CODE.KW.props.KINDS[k].mark, k);
  // the medieval things that stand for the devices
  assert.deepEqual(KINDS.map(k => set.kinds[k].name), ['Raspberry pie', 'Barn owl', 'Cauldron', 'Potion flask', 'Iron-bound chest']);
  // the pie's lamp is a lamp of its own, the filling under its lattice up and the last slice's
  // filling gone, in the engine's green (no light of its own) and red; so are the owl's eyes, the
  // cauldron's brew and then its last ember, and the flask's potion; the chest has the engine's lamp
  assert.deepEqual(plain(set.kinds.pi.up.lamp), { at: [1, -30], box: [56, 26], lit: 'pie.up.lit', dark: 'pie.up.dark' });
  assert.deepEqual(plain(set.kinds.pi.gone.lamp), { at: [4, -24], box: [30, 10], lit: 'pie.down.lit', dark: 'pie.down.dark' });
  const own = { camera: 'owl', machine: 'cauldron', vm: 'flask' };
  for (const [k, n] of Object.entries(own)) for (const st of ['up', 'gone']) {
    const L = set.kinds[k][st].lamp;
    assert.deepEqual([L.lit, L.dark, 'light' in L], [n + (st === 'up' ? '.up' : '.down') + '.lit', n + (st === 'up' ? '.up' : '.down') + '.dark', false], k + ' ' + st);
    // a gone lamp lights only in the down lamp's reds
    if (st === 'gone') for (const c of Object.values(r.data.stamps[L.lit][0].key)) assert.match(c, /^@lamp\.down(Lo|Hi)?$/, k);
  }
  assert.deepEqual([plain(set.kinds.box.up.lamp), plain(set.kinds.box.gone.lamp)], [[0, -20], [15, -24]]);
  // the steam rises from the top of the dome
  assert.deepEqual(plain(set.kinds.pi.up.moving), [{ k: 'fx', fx: 'steam', p: [-14, -53] }]);
  // the gone pie's lamp lights only in the down lamp's reds
  assert.deepEqual([...new Set(Object.values(r.data.stamps['pie.down.lit'][0].key))].sort(), ['@lamp.down', '@lamp.downLo']);
  // the costs the counts step found, still and moving (the moving part with the lamp of the kind's
  // own), against limits of 4 000 and 600
  assert.deepEqual(plain(r.world.props['props.medieval']), {
    pi: { up: { still: 3308, moving: 411 }, gone: { still: 633, moving: 34 } },
    camera: { up: { still: 539, moving: 32 }, gone: { still: 644, moving: 34 } },
    machine: { up: { still: 420, moving: 54 }, gone: { still: 366, moving: 12 } },
    vm: { up: { still: 117, moving: 72 }, gone: { still: 108, moving: 12 } },
    box: { up: { still: 137, moving: 0 }, gone: { still: 178, moving: 0 } }
  });
});

test('a dev page draws every kind from the pack, a deployed page from code while the pack is unsigned, and KW.world.props says so', () => {
  assert.deepEqual(plain(PACK.st && PACK.KW.world.props), { source: 'pack', set: 'props.medieval', kinds: { pi: 'pack', camera: 'pack', machine: 'pack', vm: 'pack', box: 'pack' }, faults: [] });
  for (const k of KINDS) {
    assert.notEqual(PACK.KW.kinds[k], PACK.KW.props.KINDS[k], k + ' is compiled');
    assert.equal(PACK.KW.kinds[k].from.split('#')[0], 'kw.medieval', k);
  }
  // the code's drawings are still there, as the fallback
  assert.deepEqual(Object.keys(PACK.KW.props.KINDS), KINDS);
  // all compiled: of the world's lines, the console has the scenes' alone (the knight, started
  // from code here, writes its own)
  assert.deepEqual(PACK.lines.filter(l => !l[1].includes('the knight')), [['info', PACK.st.note]]);
  const dep = page([TEXT], false);
  assert.deepEqual(plain(dep.KW.world.props), { source: 'code', set: null, kinds: {}, faults: [] });
  for (const k of KINDS) assert.equal(dep.KW.kinds[k], dep.KW.props.KINDS[k], k);
  // without the compiler, the engine reads the code's table
  const none = page([], true);
  for (const k of KINDS) assert.equal(none.KW.kinds[k], none.KW.props.KINDS[k], k);
});

test('starting again puts the code\'s drawings back first', () => {
  const s = page([TEXT], true);
  assert.notEqual(s.KW.kinds.pi, s.KW.props.KINDS.pi);
  s.KW.world.start(['not json'], true);
  for (const k of KINDS) assert.equal(s.KW.kinds[k], s.KW.props.KINDS[k], k);
  assert.equal(s.KW.world.props.source, 'code');
});

// ---- Call for call -----------------------------------------------------------------------------------

const MOMENTS = [0, 400, 523, 1000, 1800, 2600, 3333];

test('every kind in every place of every scene, up and gone, with and without its question mark, draws the code\'s calls from the pack', () => {
  let n = 0;
  for (const sc of Object.keys(CODE.KW.scenes)) {
    const places = behind(CODE.KW.scenes[sc].places);
    assert.deepEqual(Object.keys(places).sort(), ['g1', 'g2', 'g3', 'h1', 'h2', 'h3', 'pie'], sc);
    for (const pl of Object.keys(places)) for (const kind of KINDS) for (const ok of [true, false]) for (const alert of [true, false]) {
      const s = { places, devices: [{ place: pl, kind, ok, alert }] };
      for (const t of MOMENTS) {
        const a = record(PACK.KW, () => PACK.KW.devices.draw(t, s)), b = record(CODE.KW, () => CODE.KW.devices.draw(t, s));
        assert.ok(b.length > 0);
        assert.deepEqual(a, b, [sc, pl, kind, ok ? 'up' : 'gone', alert ? 'alert' : 'no alert', t].join(' '));
        n++;
      }
    }
  }
  // seven scenes, seven places, five kinds, two states, two marks, seven moments
  assert.equal(n, 7 * 7 * 5 * 2 * 2 * 7);
});

test('each kind\'s still part and moving part, drawn alone at every place of every scene, are the code\'s', () => {
  for (const sc of Object.keys(CODE.KW.scenes)) for (const pl of Object.values(CODE.KW.scenes[sc].places)) for (const kind of KINDS) for (const ok of [true, false]) for (const part of ['still', 'moving']) {
    for (const t of part === 'still' ? [0] : MOMENTS) {
      const a = record(PACK.KW, () => PACK.KW.kinds[kind].draw(pl.x, pl.y, t, ok, part)), b = record(CODE.KW, () => CODE.KW.props.KINDS[kind].draw(pl.x, pl.y, t, ok, part));
      assert.deepEqual(a, b, [sc, pl.x, pl.y, kind, ok ? 'up' : 'gone', part, t].join(' '));
    }
  }
});

test('the moving parts follow the lamp\'s loops: every 25 ms through two of the up loop and three of the down one', () => {
  for (const kind of KINDS) for (const ok of [true, false]) for (let t = 0; t <= 7200; t += 25) {
    const a = record(PACK.KW, () => PACK.KW.kinds[kind].draw(480, 463, t, ok, 'moving')), b = record(CODE.KW, () => CODE.KW.props.KINDS[kind].draw(480, 463, t, ok, 'moving'));
    assert.deepEqual(a, b, kind + ' ' + (ok ? 'up' : 'gone') + ' ' + t);
  }
});

test('a kind the page does not know is drawn as box, from the pack', () => {
  const places = behind(CODE.KW.scenes.cellar.places), s = k => ({ places, devices: [{ place: 'g1', kind: k, ok: false, alert: true }] });
  const a = record(PACK.KW, () => PACK.KW.devices.draw(400, s('printer'))), b = record(PACK.KW, () => PACK.KW.devices.draw(400, s('box')));
  assert.deepEqual(a, b);
});

test('a page started from the pack and then from code draws the code\'s devices: the still parts are kept apart', () => {
  const s = page([TEXT], true), places = behind(CODE.KW.scenes.yard.places);
  const st = { places, devices: KINDS.map((kind, i) => ({ place: ['pie', 'h1', 'g1', 'g2', 'g3'][i], kind, ok: i % 2 === 0, alert: true })) };
  const fromPack = record(s.KW, () => s.KW.devices.draw(400, st));
  s.KW.world.start([], true);
  const fromCode = record(s.KW, () => s.KW.devices.draw(400, st)), code = record(CODE.KW, () => CODE.KW.devices.draw(400, st));
  assert.deepEqual(fromCode, code);
  assert.deepEqual(fromPack, code);
});

// ---- The lamps ------------------------------------------------------------------------------------------

test('a lamp of the kind\'s own is painted once into each of its two canvases, the lit drawing laid over the dark one', () => {
  const s = page([TEXT], true), K = s.KW.kinds.pi;
  const before = canvases;
  for (const t of MOMENTS) record(s.KW, () => K.draw(480, 463, t, true, 'moving'));
  assert.equal(canvases - before, 2, 'the up lamp\'s dark and lit canvases, once');
  for (const t of MOMENTS) record(s.KW, () => K.draw(480, 463, t, false, 'moving'));
  assert.equal(canvases - before, 4, 'and the gone one\'s');
  // each canvas holds its own drawing: the gone lamp's dark one black, its lit one the down reds
  const colours = log => {
    const images = [];
    for (const l of log) if (l.startsWith('drawImage')) images.push([]); else if (l.startsWith('| s ')) images[images.length - 1].push(l.slice(4));
    assert.equal(images.length, 2);
    return images.map(c => [...new Set(c)].sort());
  };
  const log = record(s.KW, () => K.draw(480, 463, 0, false, 'moving'));
  assert.deepEqual(colours(log), [['#000000'], ['rgb(168,49,40)', 'rgb(255,74,61)']]);
  // and the up lamp's the green and its darks
  const up = record(s.KW, () => K.draw(480, 463, 0, true, 'moving'));
  assert.deepEqual(colours(up), [['#050806', '#080e09', '#0b130c'], ['#395a31', '#5e9451', '#8fe07a', '#e4ffd6']]);
  // the light round it: the engine's green while up, as the pack gives none, and its red while gone
  assert.ok(up.includes('s rgb(143,224,122)'));
  assert.ok(log.includes('s rgb(255,74,61)'));
});

/* The pack, read, with its data changed by edit. */
function readEdited(edit) {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  const data = JSON.parse(JSON.stringify(r.data));
  edit(data);
  return Object.assign({}, r, { data });
}
const pie = d => d.props['props.medieval'].kinds.pi, camera = d => d.props['props.medieval'].kinds.camera;

test('what the compiler does not build in a prop is refused by name', () => {
  const W = PACK.KW.world, refused = (edit, kind, want) => assert.throws(() => W.compileKind(readEdited(edit), 'props.medieval', kind), { message: want });
  // a lamp's drawings must lie inside its box
  refused(d => { pie(d).up.lamp.box = [55, 26]; }, 'pi', 'props.props.medieval.kinds.pi.up.lamp.box: the lamp\'s drawings reach -28 -13 28 10 from its middle, outside its box, -27.5 -13 27.5 13');
  // each of its pix shapes at a whole point
  refused(d => { d.stamps['pie.up.dark'][0].p = [-27.5, -13]; }, 'pi', 'stamps.pie.up.dark[0].p: a lamp\'s pix shape at a point that is not a whole pixel is not built in this engine yet');
  // an effect placed on the screen by a field of its own does not move with the device
  refused(d => { camera(d).up.still.push({ k: 'fx', fx: 'pebbles', y: 0 }); }, 'camera', 'props.props.medieval.kinds.camera.up.still[27].fx: the effect "pebbles", placed on the screen by its field "y", in a prop is not built in this engine yet');
  // the marks and tiles belong to scenes
  refused(d => { camera(d).up.still.push({ k: 'things' }); }, 'camera', 'props.props.medieval.kinds.camera.up.still[27].k: the mark "things" in a prop is not built in this engine yet');
  refused(d => { camera(d).up.still.push({ k: 'tile', step: 4, phase: 0, from: 0, to: 8, shapes: [] }); }, 'camera', 'props.props.medieval.kinds.camera.up.still[27].k: a tile in a prop is not built in this engine yet');
  refused(d => { delete d.props['props.medieval'].kinds.box; }, 'box', 'props.props.medieval.kinds.box: the pack has no such kind');
});

test('a kind that fails to compile is drawn from code, with its reason in KW.world.props and a line of its own, and the others from the pack', () => {
  const s = page(), lib = s.KW.pack, broken = readEdited(d => { camera(d).gone.still[0].k = 'zz'; });
  s.KW.pack = Object.assign({}, lib, { read: () => broken });
  const st = s.KW.world.start([TEXT], true);
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(s.KW.world.props), { source: 'pack', set: 'props.medieval', kinds: { pi: 'pack', camera: 'code', machine: 'pack', vm: 'pack', box: 'pack' },
    faults: [{ kind: 'camera', reason: 'props.props.medieval.kinds.camera.gone.still[0].k: the shape kind "zz" is not built in this engine yet' }] });
  assert.equal(s.KW.kinds.camera, s.KW.props.KINDS.camera);
  assert.notEqual(s.KW.kinds.pi, s.KW.props.KINDS.pi);
  assert.deepEqual(s.lines.filter(l => !l[1].includes('the knight')), [['warn', 'knightwatcher: the device kind camera is drawn from code: it could not be compiled: ' + s.KW.world.props.faults[0].reason],
    ['info', st.note]]);
  assert.match(st.note, /^knightwatcher: the scenes .* are drawn from the pack kw\.medieval /);
});
