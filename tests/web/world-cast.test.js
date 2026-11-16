// Tests for the cast of the medieval world's pack, the cast section of web/packs/medieval.pack.json,
// against the code's drawings of it: the fly and the goblin in web/js/props.js, and the three
// monarchs, the patrons, in web/js/scenes/court.js. Run with: node --test tests/web/
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

test('the cast of kw.medieval reads clean: the three patrons, the goblin and the fly', () => {
  const r = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(Object.keys(r.data.cast), ['patron.a', 'patron.b', 'patron.c', 'foe.goblin', 'critter.fly']);
});

/* The base pack's swatches, as the settings hand them to the engine (settings.js, engineInput). */
const BASE = JSON.parse(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8')).pack.swatches;
const SKINS = Object.keys(BASE.skin), HAIRS = Object.keys(BASE.hair), ROBES = Object.keys(BASE.tabard);
const skinOf = id => (id ? { id, face: BASE.skin[id].entries.face, cheek: BASE.skin[id].entries.cheek } : null);
const hairOf = id => { if (!id) return null; const h = BASE.hair[id].entries; return { id, bands: [h['0'], h['1'], h['2']], brow: h.brow }; };
const robeOf = id => { if (!id) return null; const t = BASE.tabard[id].entries; return { id, bands: [t['0'], t['1'], t['2'], t['3']] }; };
const MONARCHS = ['a', 'b', 'c'];

test('the patrons as written: the user\'s skin, hair and robe bound, their own colours the court\'s, their shading drawn and dressed, and their costs', () => {
  const r = PK.read(TEXT, { allowUnsigned: true }), court = CODE.KW.scenes.court;
  for (const id of MONARCHS) {
    const g = r.data.cast['patron.' + id];
    assert.deepEqual([g.role, g.name, plain(g.box), plain(g.anchors)], ['patron', 'Monarch ' + id.toUpperCase(), [180, 300], { seat: [0, 0], eyes: [0, -208], mouth: [0, -193] }]);
    assert.deepEqual(plain(g.sets), { skin: 'skin', hair: 'hair', robe: 'tabard' });
    // as drawn: the court's own skin, the base pack's warm, and each monarch's own hair and robe
    assert.deepEqual(plain(g.own.skin), plain(BASE.skin.warm.entries));
    assert.deepEqual([g.own.hair[0], g.own.hair[1], g.own.hair[2]], plain(court.drawn(id).hair));
    assert.deepEqual([0, 1, 2, 3].map(i => g.own.robe[i]), plain(court.drawn(id).robe));
    assert.ok(g.still.every(pt => pt.at === 'seat' && pt.shapes.length <= 128));
    assert.ok(['shut', 'open'].every(m => g.states[m].every(sh => sh.at === 'mouth')));
  }
  const mon = id => plain(r.data.cast['patron.' + id].palettes.mon), dim = { mix: ['@hair.2', '#000000'], k: 0.15 }, dark = { mix: ['@hair.2', '#000000'], k: 0.3 };
  const brow = drawn => ({ drawn, dressed: { contrast: ['@hair.0', dim], on: '@skin.face', band: 1 }, set: 'hair' });
  // A's darkest strands are its hair darkened to 0.7 as drawn, so a mix says them; B's and C's are
  // not, nor B's sheen, nor any brow, so each is drawn and dressed
  assert.deepEqual(mon('a'), { dark, brow: brow('#4a2a12'), iris: '#5a3a22' });
  assert.deepEqual(mon('b'), { dark: { drawn: '#1f1a2d', dressed: dark, set: 'hair' }, brow: brow('#29233b'), sheen: { drawn: '#7a7299', dressed: { mix: ['@hair.0', '#ffffff'], k: 0.25 }, set: 'hair' }, iris: '#3a4a86' });
  assert.deepEqual(mon('c'), { dark: { drawn: '#946a28', dressed: dark, set: 'hair' }, brow: brow('#a87a30'), iris: '#2f6b55' });
  // C's fringe is the effect fringe, in its middle hair
  assert.deepEqual(r.data.cast['patron.c'].still.flatMap(pt => pt.shapes).filter(sh => sh.k === 'fx').map(plain), [{ k: 'fx', fx: 'fringe', p: [0, -240], colour: '@hair.1' }]);
  // the costs the counts step found, against 16 000 for the still parts and 400 for each mouth
  assert.deepEqual(MONARCHS.map(id => plain(r.world.cast['patron.' + id])), [
    { still: 5731, states: { shut: 1, open: 16 } }, { still: 5582, states: { shut: 1, open: 16 } }, { still: 5132, states: { shut: 1, open: 16 } }]);
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
  assert.deepEqual(plain(PACK.KW.world.cast), { source: 'pack', members: { 'patron.a': 'pack', 'patron.b': 'pack', 'patron.c': 'pack', 'foe.goblin': 'pack', 'critter.fly': 'pack' }, faults: [] });
  for (const id of MONARCHS) { assert.notEqual(PACK.KW.cast.patrons[id], PACK.KW.props.PATRONS[id]); assert.equal(PACK.KW.cast.patrons[id].from.split('#')[0], 'kw.medieval'); }
  assert.deepEqual(Object.keys(PACK.KW.props.PATRONS), MONARCHS);
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
  for (const id of MONARCHS) assert.equal(dep.KW.cast.patrons[id], dep.KW.props.PATRONS[id]);
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
  for (const id of MONARCHS) assert.equal(s.KW.cast.patrons[id], s.KW.props.PATRONS[id]);
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

/* A patron's drawing in a look, as lines: its still parts and its mouth, shut and open. */
const drawPatron = (KW, p, look) => record(KW, () => { p.draw(820, 505, look); p.mouth(820, 505, false, look); p.mouth(820, 505, true, look); });

test('each patron from the pack draws the code\'s monarch call for call, in every skin with every hair, and in every robe, as drawn or chosen', () => {
  let n = 0;
  for (const id of MONARCHS) {
    const A = PACK.KW.cast.patrons[id], B = CODE.KW.props.PATRONS[id];
    const check = look => { const a = drawPatron(PACK.KW, A, look), b = drawPatron(CODE.KW, B, look); assert.ok(b.length > 5000); assert.deepEqual(a, b, id + ' ' + JSON.stringify([look.skin && look.skin.id, look.hair && look.hair.id, look.robe && look.robe.id])); n++; };
    // every skin with every hair, the robe turning through every choice
    [null, ...SKINS].forEach((sk, i) => [null, ...HAIRS].forEach((hr, j) => check({ skin: skinOf(sk), hair: hairOf(hr), robe: robeOf([null, ...ROBES][(i + j) % (ROBES.length + 1)]) })));
    // every robe alone
    for (const rb of ROBES) check({ skin: null, hair: null, robe: robeOf(rb) });
    assert.deepEqual(plain(A.drawn), plain(B.drawn));
  }
  assert.equal(n, 3 * ((SKINS.length + 1) * (HAIRS.length + 1) + ROBES.length));
});

test('the brows are dressed by contrast: the lightest band of the hair where it stands out more from the skin than the darkened darkest, which the court chooses alike', () => {
  const lightest = [], darkened = [];
  for (const sk of SKINS) for (const hr of HAIRS) {
    const look = { skin: skinOf(sk), hair: hairOf(hr), robe: null }, calls = drawPatron(PACK.KW, PACK.KW.cast.patrons.a, look).join('\n');
    // the brows are the last two rects of 10 by 3 before the crown, at the eyes' height less 14
    (calls.includes('s ' + hairOf(hr).bands[0] + '\nr ' + (820 - 20) + ' ' + (505 - 222)) ? lightest : darkened).push(sk + ' ' + hr);
  }
  assert.ok(lightest.length > 0 && darkened.length > 0, 'both ways are drawn: ' + lightest.join(', '));
  assert.ok(lightest.every(l => !/^(fair|warm) /.test(l)), 'the lightest band only on darker skins');
});

test('the court draws the patron KW.cast gives, and its backdrop key says where the patron comes from', () => {
  const sc = PACK.KW.scenes.court, key = id => sc.key({ patron: { id, skin: skinOf('deep'), hair: null, robe: robeOf('wine') } });
  for (const id of MONARCHS) assert.equal(key(id), id + '@' + PACK.KW.cast.patrons[id].from + '|deep||wine');
  assert.equal(CODE.KW.scenes.court.key({ patron: { id: 'b', skin: skinOf('deep'), hair: null, robe: robeOf('wine') } }), 'b|deep||wine');
  // an unknown monarch is A, from the pack
  assert.equal(sc.key({ patron: { id: 'z' } }), 'a@' + PACK.KW.cast.patrons.a.from + '|');
  const s = page([TEXT], true), seen = [];
  s.KW.cast.patrons.b = Object.assign({}, s.KW.cast.patrons.b, { draw: (x, by, look) => seen.push(['draw', x, by, look.hair && look.hair.id]), mouth: (x, by, open) => seen.push(['mouth', open]) });
  const frame = { w: s.KW.state.IDLE, devices: [], places: null, tv: false, kx: 360, o: s.KW.knight.pose('ssh_session', 100), here: null, inBed: false, helmOff: false, strike: false,
    patron: { id: 'b', skin: null, hair: hairOf('silver'), robe: null } };
  record(s.KW, () => { s.KW.scenes.court.paint(frame); s.KW.scenes.court.draw(3300, frame); });
  assert.deepEqual(seen, [['draw', 820, 505, 'silver'], ['mouth', false]]);
  // drawn, for the settings' "As drawn", is the patron's
  assert.deepEqual(plain(sc.drawn('c')), plain(PACK.KW.cast.patrons.c.drawn));
});

test('a patron compiles each look once, and keeps it', () => {
  const s = page([TEXT], true), P = s.KW.cast.patrons.c, look = { skin: skinOf('tan'), hair: hairOf('blonde'), robe: null };
  const first = drawPatron(s.KW, P, look);
  // a second draw of the same look, and a copy of it, draws the same calls
  assert.deepEqual(drawPatron(s.KW, P, JSON.parse(JSON.stringify(look))), first);
  assert.notDeepEqual(drawPatron(s.KW, P, { skin: null, hair: null, robe: null }), first);
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
const fly = d => d.cast['critter.fly'], gob = d => d.cast['foe.goblin'], pat = d => d.cast['patron.a'];

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
  // the same in a patron, whose colours are resolved as its own look compiles
  refused(d => { pat(d).still[0].shapes.push({ k: 'things' }); }, 'patron.a', 'cast.patron.a.still[0].shapes[120].k: the mark "things" in the cast is not built in this engine yet');
  refused(d => { pat(d).states.open[0].fill = '@mon.pupil'; }, 'patron.a', 'cast.patron.a.states.open[0].fill: the palette "mon" gives no "pupil"');
  // a bound set the user may leave unchosen needs colours of its own
  refused(d => { delete pat(d).own.robe; }, 'patron.a', 'cast.patron.a.own.robe: a bound set without colours of its own is not built in this engine yet');
  // a role the engine does not have
  refused(d => { d.cast['companion.cat'] = { role: 'companion', name: 'Cat' }; }, 'companion.cat', 'cast.companion.cat.role: the role "companion" is not built in this engine yet');
});

test('a member that fails to compile is drawn from code, with its reason in KW.world.cast and a line of its own; a member the engine does not know is not compiled', () => {
  const s = page(), lib = s.KW.pack, broken = readEdited(d => { fly(d).frames.flap1[0].k = 'zz'; d.cast['critter.gnat'] = JSON.parse(JSON.stringify(fly(d))); gob(d).parts.body[0].k = 'zz'; });
  s.KW.pack = Object.assign({}, lib, { read: () => broken });
  const st = s.KW.world.start([TEXT], true);
  assert.equal(st.source, 'pack');
  assert.deepEqual(plain(s.KW.world.cast), { source: 'pack', members: { 'patron.a': 'pack', 'patron.b': 'pack', 'patron.c': 'pack', 'foe.goblin': 'code', 'critter.fly': 'code' },
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
