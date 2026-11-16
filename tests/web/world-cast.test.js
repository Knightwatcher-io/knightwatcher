// Tests for the cast of the medieval world's pack, the cast section of web/packs/medieval.pack.json,
// against the code's drawings of it in web/js/props.js: the fly and the goblin. Run with:
// node --test tests/web/
//
// The page's scripts run under Node in a sandbox, against a fake canvas context that writes one line
// per call, as in tests/web/scenes.test.js. The engine draws the cast from KW.cast, which the
// compiler (web/js/world.js) fills from the pack on a page that reads it, and which holds the code's
// members otherwise. Each member is drawn from the pack and from code, and the two records must be
// the same call for call; the engine's own frames are compared too, with the cast drawn from the
// pack on one page and from code on the other. tests/web/scenes.test.js holds the pack's cast to the
// stored records of the code's, fixtures/scenes/cast.json, and tests/web/world-scenes.test.js runs
// the checks of tests/web/foe.test.js on the pack's goblin.
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
   size alone, or, where deep is true or holds for the canvas, followed by its calls, each after a
   "| ". */
function context(log, deep) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', `canvas ${img.width}x${img.height}`, ...a].join(' '));
        if (deep === true || (typeof deep === 'function' && deep(img))) for (const l of img[LOG]) log.push('| ' + l);
      };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
}
let canvases = 0;
function canvas() {
  canvases++;
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
const POSES = ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit'];

// ---- The cast --------------------------------------------------------------------------------------

test('the cast of kw.medieval reads clean: the goblin and the fly', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(Object.keys(r.data.cast), ['foe.goblin', 'critter.fly']);
});

test('the goblin as written: the code\'s measures, its parts shared between its six poses, and its costs', () => {
  const r = PK.read(TEXT, { allowUnsigned: true }), g = r.data.cast['foe.goblin'], G = CODE.KW.props.FOES.goblin;
  assert.deepEqual([g.role, g.name, g.exit], ['foe', 'Goblin', 'poof']);
  // the measures are the code's, the crown point for point
  assert.deepEqual(plain(g.sprite), { size: plain(G.size), feet: plain(G.anchor) });
  assert.deepEqual([g.h, g.w, g.mid], [G.h, G.w, G.mid]);
  assert.deepEqual(plain(g.crown), plain(G.crown));
  assert.deepEqual(Object.keys(g.poses), POSES);
  assert.deepEqual(Object.keys(g.parts), ['arms.hips', 'arms.up', 'arms.ears0', 'arms.ears1', 'arms.flung', 'body', 'ears', 'ears.droop', 'ears.limp', 'head']);
  // the arms behind the body, the legs and the tunic, the ears, the head; then the pose's face, its
  // pot, its nose and, for the brace alone, the arms clutched in front
  assert.deepEqual(POSES.map(n => plain(g.poses[n].parts)), [['arms.hips', 'body', 'ears', 'head'], ['arms.up', 'body', 'ears', 'head'], ['arms.ears0', 'body', 'ears', 'head'],
    ['arms.ears1', 'body', 'ears', 'head'], ['body', 'ears.droop', 'head'], ['arms.flung', 'body', 'ears.limp', 'head']]);
  // each hand's fingers are the effect fingers, outline and fill, at the hand's angle
  const hands = Object.keys(g.parts).filter(n => n.startsWith('arms.')).map(n => g.parts[n].filter(s => s.k === 'fx').map(s => [s.fx, s.a, s.r]));
  assert.deepEqual(hands[0], [['fingers', 2.6, 4.5], ['fingers', 2.6, 2.5], ['fingers', -2.6, 4.5], ['fingers', -2.6, 2.5]]);
  assert.deepEqual(g.poses.brace.shapes.filter(s => s.k === 'fx').map(s => s.a), [1.2, 1.2, -1.2, -1.2]);
  // the costs the counts step found, against a limit of 8 000 for each pose, its parts included
  assert.deepEqual(plain(r.world.cast['foe.goblin']), { poses: { stand: 2778, climb: 2894, taunt0: 2811, taunt1: 2929, brace: 2743, hit: 2682 } });
});

test('the fly as written: its wings in a group at an alpha of 0.85, and its costs', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
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

test('a dev page draws the goblin and the fly from the pack, a deployed page from code while the pack is unsigned, and KW.world.cast says so', () => {
  assert.deepEqual(plain(PACK.KW.world.cast), { source: 'pack', members: { 'foe.goblin': 'pack', 'critter.fly': 'pack' }, faults: [] });
  assert.notEqual(PACK.KW.cast.critters.fly, PACK.KW.props.CRITTERS.fly);
  assert.notEqual(PACK.KW.cast.foes.goblin, PACK.KW.props.FOES.goblin);
  for (const m of [PACK.KW.cast.critters.fly, PACK.KW.cast.foes.goblin]) assert.equal(m.from.split('#')[0], 'kw.medieval');
  // the code's fly and goblin are still there, as the fallback
  assert.equal(PACK.KW.props.CRITTERS.fly.draw, PACK.KW.props.flyHD);
  assert.deepEqual(Object.keys(PACK.KW.props.FOES), ['goblin']);
  // all compiled: of the world's lines, the console has the scenes' alone (the knight, started from
  // code here, writes its own)
  assert.deepEqual(PACK.lines.filter(l => !l[1].includes('the knight')), [['info', PACK.st.note]]);
  const dep = page([TEXT], false);
  assert.deepEqual(plain(dep.KW.world.cast), { source: 'code', members: {}, faults: [] });
  assert.equal(dep.KW.cast.critters.fly, dep.KW.props.CRITTERS.fly);
  assert.equal(dep.KW.cast.foes.goblin, dep.KW.props.FOES.goblin);
  // before start, the cast is the code's
  assert.equal(CODE.KW.cast.critters.fly, CODE.KW.props.CRITTERS.fly);
  assert.equal(CODE.KW.cast.foes.goblin, CODE.KW.props.FOES.goblin);
  assert.equal(CODE.KW.world.cast, null);
});

test('starting again puts the code\'s cast back first', () => {
  const s = page([TEXT], true);
  assert.notEqual(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  assert.notEqual(s.KW.cast.foes.goblin, s.KW.props.FOES.goblin);
  s.KW.world.start(['not json'], true);
  assert.equal(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  assert.equal(s.KW.cast.foes.goblin, s.KW.props.FOES.goblin);
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

test('the goblin from the pack gives the code\'s interface and measures, and each pose painted once into a canvas of its size, call for call the code\'s', () => {
  const s = page([TEXT], true), G = s.KW.cast.foes.goblin, C = CODE.KW.props.FOES.goblin;
  for (const k of ['poses', 'anchor', 'size', 'h', 'w', 'mid', 'crown', 'exit']) assert.deepEqual(plain(G[k]), plain(C[k]), k);
  assert.deepEqual(Object.keys(G).sort(), ['anchor', 'crown', 'exit', 'from', 'h', 'mid', 'pose', 'poses', 'size', 'w']);
  for (const n of POSES) C.pose(n);
  const before = canvases;
  for (const n of POSES) {
    const a = G.pose(n), b = C.pose(n);
    assert.deepEqual([a.width, a.height], [220, 230]);
    assert.ok(b[LOG].length > 500, n + ' draws something');
    assert.deepEqual(a[LOG], b[LOG], n);
    assert.equal(G.pose(n), a, n + ' is painted once');
  }
  assert.equal(canvases - before, 6, 'one canvas a pose');
  assert.equal(G.pose('no-such-pose'), G.pose('stand'), 'an unknown pose gives stand');
  // a compile of its own, on the same page, paints canvases of its own
  s.KW.world.start([TEXT], true);
  const t = s.KW.cast.foes.goblin;
  assert.notEqual(t.from, G.from);
  assert.notEqual(t.pose('stand'), G.pose('stand'));
});

/* The engine's frames of the goblin's event, from 0 to its end every step ms, on the page s, in the
   scene with the knight at its spot and the pie alone, time frozen as the address's t= freezes it.
   The goblin's canvases are written with their calls, the other canvases by size. */
function goblin(s, scene, step) {
  const KW = s.KW, E = KW.engine, out = [], log = [];
  KW.hooks = { frozen: true, t: 0 };
  E.init(context(log, img => img.width === 220 && img.height === 230));
  E.reset();
  E.input = { w: KW.state.IDLE, is: scene, turnMs: 60000, devices: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], tv: false, helmet: 'auto' };
  E.draw(0);
  E.fireEvent('goblin');
  for (let t = 0; t <= E.EVENTS.goblin.dur; t += step) {
    log.length = 0;
    E.draw(t);
    out.push([t, log.slice()]);
  }
  return out;
}

test('the engine\'s goblin, coming in, taunting, bonked and gone in its poof, draws the code\'s calls from the pack, frame by frame, over the wall and out of the ground', () => {
  for (const scene of ['battlement', 'camp']) {
    const a = goblin(page([TEXT], true), scene, 20), b = goblin(page(), scene, 20);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.deepEqual(a[i][1], b[i][1], scene + ': the frame at ' + a[i][0]);
    // every pose is drawn
    const all = b.map(f => f[1].join('\n')).join('\n'), C = page().KW.props.FOES.goblin;
    assert.ok(all.includes('drawImage canvas 220x230'), scene + ': the goblin is drawn');
    for (const n of POSES) assert.ok(all.includes(C.pose(n)[LOG].slice(0, 40).map(l => '| ' + l).join('\n')), scene + ': ' + n);
  }
});

test('the engine plays the foe KW.cast gives, and leaves by the exit it names when the engine has it', () => {
  const s = page([TEXT], true), G = s.KW.cast.foes.goblin, seen = new Set(), F = s.KW.engine.foe, sc = s.KW.scenes.battlement;
  s.KW.cast.foes.goblin = Object.assign({}, G, { pose: n => { seen.add(n); return G.pose(n); } });
  goblin(s, 'battlement', 10);
  assert.deepEqual([...seen].sort(), [...POSES].sort());
  const o = s.KW.knight.pose('idle', 20000); o.floor = s.KW.view.HFL; o.x = 480; o.helmet = true; o.bob = 0;
  const plan = g => { s.KW.cast.foes.goblin = g; return F.plan('goblin', sc, { devices: [], places: sc.places }, Object.assign({}, o)); };
  assert.equal(plan(G).exit, F.FOE.exits.poof);
  // an exit the engine does not have is the event's
  assert.equal(plan(Object.assign({}, G, { exit: 'zap' })).exit, F.FOE.exits.poof);
  s.KW.cast.foes.goblin = G;
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
const fly = d => d.cast['critter.fly'], gob = d => d.cast['foe.goblin'];

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
  // the same in a foe's parts and poses
  refused(d => { gob(d).parts.head.push({ k: 'things' }); }, 'foe.goblin', 'cast.foe.goblin.parts.head[7].k: the mark "things" in the cast is not built in this engine yet');
  refused(d => { gob(d).poses.hit.shapes.push({ k: 'fx', fx: 'pebbles', y: 0 }); }, 'foe.goblin', 'cast.foe.goblin.poses.hit.shapes[25].fx: the effect "pebbles", placed on the screen by its field "y", in the cast is not built in this engine yet');
  // a role the engine does not build yet
  refused(d => { d.cast['patron.a'] = { role: 'patron', name: 'Monarch A' }; }, 'patron.a', 'cast.patron.a.role: the role "patron" is not built in this engine yet');
});

test('a member that fails to compile is drawn from code, with its reason in KW.world.cast and a line of its own; a member the engine does not know is not compiled', () => {
  const s = page(), lib = s.KW.pack, broken = readEdited(d => { fly(d).frames.flap1[0].k = 'zz'; d.cast['critter.gnat'] = JSON.parse(JSON.stringify(fly(d))); gob(d).parts.body[0].k = 'zz'; });
  s.KW.pack = Object.assign({}, lib, { read: () => broken });
  const st = s.KW.world.start([TEXT], true);
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(s.KW.world.cast), { source: 'code', members: { 'foe.goblin': 'code', 'critter.fly': 'code' },
    faults: [{ member: 'foe.goblin', reason: 'cast.foe.goblin.parts.body[0].k: the shape kind "zz" is not built in this engine yet' },
      { member: 'critter.fly', reason: 'cast.critter.fly.frames.flap1[0].k: the shape kind "zz" is not built in this engine yet' }] });
  assert.equal(s.KW.cast.critters.fly, s.KW.props.CRITTERS.fly);
  assert.equal(s.KW.cast.foes.goblin, s.KW.props.FOES.goblin);
  assert.deepEqual(Object.keys(s.KW.cast.critters), ['fly']);
  const faults = s.KW.world.cast.faults;
  assert.deepEqual(s.lines.filter(l => !l[1].includes('the knight')), [['warn', 'knightwatcher: the cast member foe.goblin is drawn from code: it could not be compiled: ' + faults[0].reason],
    ['warn', 'knightwatcher: the cast member critter.fly is drawn from code: it could not be compiled: ' + faults[1].reason], ['info', st.note]]);
  assert.match(st.note, /^knightwatcher: the scenes .* are drawn from the pack kw\.medieval /);
});
