// Tests for the pet, the mouser cat: its drawing in code (web/js/cat.js), the pet of the medieval
// world's pack as the compiler builds it (web/js/world.js), and the catch the engine plays
// (web/js/engine.js). Run with: node --test tests/web/
//
// The page's scripts run under Node in a sandbox, against a fake canvas context that writes one line
// per call, as in tests/web/world-cast.test.js. The cat from the pack is held to the cat from code
// call for call; the engine's rules for the flies are checked through its input, its frames and the
// catches it plans (KW.engine.pet), with time frozen as the address's t= freezes it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/settings.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));

/* ---- The recording context, as in world-cast.test.js ------------------------------------------ */
const LOG = Symbol('log');
function context(log, deep) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', img.tag || `canvas ${img.width}x${img.height}`, ...a].join(' '));
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
/* The page's scripts in a sandbox, the knight from code; with texts, KW.world.start(texts, true).
   Without the cat (cat false), cat.js is left out, as on a page from before the pet. */
function page(texts, cat) {
  const box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 } });
  for (const f of SCRIPTS) {
    if (cat === false && f === 'js/cat.js') continue;
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start([], false);
  if (texts) KW.world.start(texts, true);
  return KW;
}
const record = (KW, f) => { const log = []; KW.draw.setCtx(context(log, true)); f(); return log; };

const PACK = page([TEXT]), CODE = page();
const POSES = ['rest', 'settle', 'alert0', 'alert1', 'stalk0', 'stalk1', 'pounce', 'land', 'pleased', 'walk0', 'walk1'];
const COND = (KW, id) => Object.assign({ id, hl: '', sub: '', st: 'ok' }, KW.state.CONDITIONS[id]);

// ---- The drawing ------------------------------------------------------------------------------------

test('the cat from the pack gives the code\'s interface and measures, and each pose of each coat painted once, call for call the code\'s', () => {
  const A = PACK.cast.pets.cat, B = CODE.props.PETS.cat;
  assert.notEqual(A, PACK.props.PETS.cat);
  assert.equal(A.from.split('#')[0], 'kw.medieval');
  for (const k of ['name', 'coats', 'poses', 'size', 'anchor', 'spots', 'paw', 'take', 'land', 'lift']) assert.deepEqual(plain(A[k]), plain(B[k]), k);
  assert.deepEqual(plain(B.coats), { calico: 'Calico', ginger: 'Ginger tabby' });
  assert.deepEqual(plain(B.poses), POSES);
  for (const coat of ['calico', 'ginger']) for (const n of POSES) {
    const a = A.pose(coat, n), b = B.pose(coat, n);
    assert.deepEqual([a.width, a.height], [200, 150]);
    assert.ok(b[LOG].length > 300, coat + ' ' + n + ' draws something');
    assert.deepEqual(a[LOG], b[LOG], coat + ' ' + n);
    assert.equal(A.pose(coat, n), a, coat + ' ' + n + ' is painted once');
  }
  // a coat or a pose the cat lacks gives its first
  assert.equal(A.pose('tortoiseshell', 'rest'), A.pose('calico', 'rest'));
  assert.equal(B.pose('calico', 'roll'), B.pose('calico', 'rest'));
  // the two coats differ, and every spot is on the grid, the house's with a spot by the bed
  assert.notDeepEqual(B.pose('calico', 'rest')[LOG], B.pose('ginger', 'rest')[LOG]);
  assert.deepEqual(Object.keys(B.spots), ['battlement', 'camp', 'yard', 'house', 'cellar', 'smithy', 'court']);
  assert.deepEqual(plain(B.spots.house.bed.rest), [332, 405]);
});

test('a page without the compiler, or with the pack unsigned on a deployed page, draws the cat from code', () => {
  const dep = page(), K = dep;
  K.world.start([TEXT], false);
  assert.equal(K.cast.pets.cat, K.props.PETS.cat);
  assert.equal(K.world.cast.members['pet.cat'], undefined);
});

// ---- The catch ---------------------------------------------------------------------------------------

/* The engine of a page, time frozen at t, with the input given and the pet calico; returns E. */
function engine(KW, input, log) {
  const E = KW.engine;
  KW.hooks = { frozen: true, t: 0 };
  E.init(context(log || [], false));
  E.reset();
  E.input = Object.assign({ w: KW.state.IDLE, is: 'house', turnMs: 60000, devices: [], tv: false, helmet: 'auto', pet: { id: 'cat', coat: 'calico' } }, input);
  return E;
}
const at = (KW, t) => { KW.hooks.t = t; KW.engine.draw(t); };

test('a fly belongs to whoever can take it when it comes: the cat indoors and while the knight is busy, the knight outdoors while free', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0); E.addFly(0);
  assert.deepEqual([E.pet.catches().length, E.pet.flies().length], [1, 0], 'indoors: the cat\'s');
  engine(KW, { is: 'battlement' }); at(KW, 0); E.addFly(0);
  assert.deepEqual([E.pet.catches().length, E.pet.flies().length], [0, 1], 'outdoors, the knight free: the knight\'s');
  engine(KW, { is: 'battlement' }); at(KW, 0); E.fireEvent('goblin'); E.addFly(10);
  assert.deepEqual([E.pet.catches().length, E.pet.flies().length], [1, 0], 'outdoors, the knight busy with the goblin: the cat\'s');
  // the event over, the next fly is the knight's, and the cat keeps its own
  at(KW, E.EVENTS.goblin.dur + 100); E.addFly(E.EVENTS.goblin.dur + 100);
  assert.deepEqual([E.pet.catches().length, E.pet.flies().length], [1, 1]);
  // every scene with an indoor spot and no warning gives the cat its flies
  for (const [id, scene] of [['updating', 'smithy'], ['ssh_session', 'court'], ['streaming', 'house'], ['night', 'house']]) {
    engine(KW, { w: COND(KW, id) }); at(KW, 0); E.addFly(0);
    assert.deepEqual([E.scene(), E.pet.catches().length, E.pet.flies().length], [scene, 1, 0], id);
  }
});

test('the knight\'s swat passes over the cat\'s flies, and the cat never takes the knight\'s', () => {
  const KW = PACK, E = engine(KW, { is: 'battlement' });
  KW.hooks.frozen = false;
  at(KW, 0); E.fireEvent('goblin'); E.addFly(10);
  const mine = E.pet.catches()[0];
  // the knight's flies, after the event
  for (const t of [4000, 4040, 4080]) { at(KW, t); E.addFly(t); }
  at(KW, 5500); E.startSwat(5500);
  for (let t = 5500; t <= 7400; t += 20) at(KW, t);
  assert.ok(E.pet.flies().every(f => f.dead), 'the knight swatted its own');
  assert.equal(E.pet.catches()[0], mine, 'the cat\'s fly is still its own');
  assert.ok(7400 < mine.hitAt, 'and not yet caught');
});

test('one fly at a time: each catch starts when its buzz ends, or when the cat has settled after the last', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0);
  for (const t of [0, 300, 600]) E.addFly(t);
  const [a, b, c] = E.pet.catches(), T = E.pet.PET;
  for (const k of [a, b, c]) {
    assert.ok(k.f.buzz >= 10000 && k.f.buzz <= 20000, 'a buzz of 10 to 20 s, not ' + k.f.buzz);
    // sits up 2.5 s before it goes, stalks at least 1.2 s at 60 px a second, wiggles 0.6 s, leaps
    // 0.38 s, falls 0.32 s, swipes 0.45 s, is pleased 1.8 s, walks back at 55 px a second, settles 0.7 s
    const dist = Math.abs(k.take - k.sp.rest[0]), back = Math.abs(k.sp.rest[0] - k.landX);
    assert.equal(k.stalkEnd - k.go, Math.max(1200, dist / (60 / 1000)));
    assert.deepEqual([k.jump - k.stalkEnd, k.hitAt - k.jump, k.down - k.hitAt, k.pleased - k.down, k.walk - k.pleased, k.end - k.home], [600, 380, 320, 450, 1800, 700]);
    assert.ok(Math.abs(k.home - k.walk - back / (55 / 1000)) < 1e-9);
    // the paw meets the fly at the top of the leap: the leap's top plus the paw, as the cat faces
    const pet = PACK.cast.pets.cat;
    assert.deepEqual(plain(k.hit), [k.apex[0] + pet.paw[0] * k.face, k.apex[1] + pet.paw[1]]);
  }
  assert.equal(a.go, a.f.born + a.f.buzz);
  assert.equal(a.alertAt, a.go - T.alert);
  for (const [k, prev] of [[b, a], [c, b]]) {
    assert.equal(k.go, Math.max(k.f.born + k.f.buzz, prev.end + T.after), 'waits its turn');
    assert.ok(k.alertAt >= prev.end, 'sits up only once the cat is free');
  }
});

test('the cat looks up at a fly as it comes, sleeps, sits up, stalks, wiggles, pounces, lands, is pleased, walks back and settles', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0); E.addFly(0);
  const k = E.pet.catches()[0], sp = k.sp, pose = t => { at(KW, t); return E.pet.at(sp, t); };
  assert.match(pose(200).pose, /^alert[01]$/, 'looks up at the fly');
  assert.equal(pose(200).face, Math.sign(E.pet.prey(k, 200)[0] - sp.rest[0]) || sp.face);
  assert.equal(pose(3000).pose, 'rest');
  assert.deepEqual([pose(3000).x, pose(3000).y], plain(sp.rest));
  assert.match(pose(k.alertAt + 100).pose, /^alert[01]$/);
  assert.match(pose((k.go + k.stalkEnd) / 2).pose, /^(stalk|walk)[01]$/);
  assert.match(pose(k.stalkEnd + 300).pose, /^stalk[01]$/, 'the wiggle');
  const top = pose(k.hitAt - 1);
  assert.equal(top.pose, 'pounce');
  assert.equal(pose(k.down + 100).pose, 'land');
  assert.equal(pose(k.pleased + 100).pose, 'pleased');
  assert.match(pose((k.walk + k.home) / 2).pose, /^(walk[01]|pounce)$/);
  assert.equal(pose(k.home + 100).pose, 'settle');
  assert.equal(pose(k.end + 100).pose, 'rest');
  // the fly: round the knight, then down to the catch point while the cat sits up, where the paw
  // meets it, then the poof and the fall
  assert.ok(Array.isArray(E.pet.prey(k, k.alertAt - 1)));
  const near = E.pet.prey(k, k.go + 10);
  assert.ok(Math.hypot(near[0] - k.hit[0], near[1] - k.hit[1]) < 8, 'the fly hovers by the catch point');
  assert.deepEqual(plain(E.pet.prey(k, k.hitAt + 10)), { dead: 10, x: k.hit[0], y: k.hit[1] });
  assert.equal(E.pet.prey(k, k.hitAt + E.pet.PET.drop + 200), null);
  // drawn with time frozen, every frame of the catch depends on the time alone
  const frame = t => { const log = []; E.init(context(log, false)); at(KW, t); return log.join('\n'); };
  for (const t of [k.alertAt + 500, k.jump + 100, k.hitAt + 50]) assert.equal(frame(t), frame(t));
  // the poof is the sword's, drawn at the catch point at the hit
  const hit = frame(k.hitAt + 30);
  assert.ok(hit.includes('drawImage'), 'the cat is drawn');
});

test('three of the cat\'s flies at most are on screen; a fly past that is only counted', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0);
  for (let i = 0; i < 6; i++) E.addFly(i * 10);
  assert.equal(E.pet.catches().length, 3);
  // once one is caught, another may come
  const first = E.pet.catches()[0];
  at(KW, first.hitAt + 10); E.addFly(first.hitAt + 10);
  assert.equal(E.pet.catches().filter(k => k.hitAt > first.hitAt + 10).length, 3);
});

test('under a warning a blocked advert adds no fly, and the flies on screen leave', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0); E.addFly(0); E.addFly(10);
  engine(KW, { is: 'battlement' }); at(KW, 0); E.addFly(0);
  // the cellar plays only under a warning: no fly, and the cat rests
  engine(KW, { w: COND(KW, 'disk_full') }); at(KW, 0);
  for (let i = 0; i < 4; i++) E.addFly(i);
  assert.deepEqual([E.scene(), E.pet.catches().length, E.pet.flies().length], ['cellar', 0, 0]);
  assert.equal(E.pet.at(PACK.cast.pets.cat.spots.cellar, 2300).pose, 'rest');
  assert.equal(E.note, 'no flies');
  // a warning in the quiet scene of the moment: the house's flies, the cat's, leave; the battlement's,
  // the knight's, too
  for (const scene of ['house', 'battlement']) {
    engine(KW, { is: scene }); at(KW, 0); E.addFly(0); E.addFly(10);
    assert.equal(E.pet.catches().length + E.pet.flies().length, 2, scene);
    E.input = Object.assign({}, E.input, { w: COND(KW, 'memory_tight') });
    at(KW, 3000);
    assert.deepEqual([E.scene(), E.pet.catches().length, E.pet.flies().filter(f => !f.dead).length, E.pet.leaving().length], [scene, 0, 0, 2], scene);
    assert.equal(E.note, 'flies leave: a warning is up');
    E.addFly(3000);
    assert.equal(E.pet.catches().length + E.pet.flies().length, 0, 'no fly comes under the warning');
    at(KW, 3000 + E.pet.PET.leave + 10);
    assert.deepEqual([E.pet.leaving().length, E.note], [0, 'no flies']);
  }
});

test('a new scene starts with no flies, no catch and none waiting', () => {
  const KW = PACK, E = engine(KW, { is: 'battlement' });
  at(KW, 0);
  for (let i = 0; i < 11; i++) E.addFly(i);
  assert.deepEqual([E.pet.flies().length, E.pet.pending()], [8, 3], 'the knight\'s gather, eight on screen and the rest waiting');
  E.input = Object.assign({}, E.input, { is: 'house' }); at(KW, 100); E.addFly(100);
  assert.deepEqual([E.pet.flies().length, E.pet.pending(), E.pet.catches().length], [0, 0, 1]);
  E.input = Object.assign({}, E.input, { is: 'camp' }); at(KW, 200);
  assert.deepEqual([E.pet.flies().length, E.pet.pending(), E.pet.catches().length, E.pet.leaving().length], [0, 0, 0, 0]);
});

test('at night the cat catches from the foot of the bed, under the dimming', () => {
  const KW = PACK, log = [], E = engine(KW, { w: COND(KW, 'night') }, log);
  at(KW, 0); E.addFly(0);
  const k = E.pet.catches()[0];
  assert.equal(k.sp, PACK.cast.pets.cat.spots.house.bed);
  log.length = 0; at(KW, k.jump + 100);
  const cat = log.findIndex(l => l.startsWith('drawImage canvas 200x150')), dim = log.lastIndexOf('a 0.5');
  assert.ok(cat >= 0 && dim > cat, 'the cat is drawn, and dimmed with the scene');
  // the knight gets up, streaming: the catch is worked out again from the hearth
  E.input = Object.assign({}, E.input, { w: COND(KW, 'streaming') });
  at(KW, k.alertAt - 1000);
  assert.equal(E.pet.catches()[0].sp, PACK.cast.pets.cat.spots.house);
});

test('the cat after the knight and before the devices in front of it, its flies after the knight\'s', () => {
  const KW = PACK, log = [], E = engine(KW, { is: 'battlement' }, log);
  const K = KW.knight.draw, fly = KW.cast.critters.fly;
  KW.knight.draw = o => { log.push('KNIGHT'); };
  KW.cast.critters.fly = { draw: (x, y) => log.push('FLY ' + Math.round(x)), dead: () => {} };
  try {
    at(KW, 0); E.fireEvent('goblin'); E.addFly(10);
    at(KW, 5000); E.addFly(5000);
    log.length = 0; at(KW, 5200);
    const knight = log.indexOf('KNIGHT'), cat = log.findIndex(l => l.startsWith('drawImage canvas 200x150')), flies = log.map((l, i) => (l.startsWith('FLY') ? i : -1)).filter(i => i >= 0);
    assert.ok(knight >= 0 && cat > knight, 'the cat after the knight');
    assert.equal(flies.length, 2);
    assert.ok(flies.every(i => i > cat));
    // the knight's fly first, then the cat's
    const kf = E.pet.flies()[0], ours = E.pet.catches()[0];
    assert.equal(log[flies[1]], 'FLY ' + Math.round(E.pet.prey(ours, 5200)[0]));
    assert.ok(kf);
  } finally { KW.knight.draw = K; KW.cast.critters.fly = fly; }
});

test('the note says the cat is hunting, in the world\'s words, and the knight\'s note as before', () => {
  const KW = PACK, E = engine(KW, { is: 'house' });
  at(KW, 0); assert.equal(E.note, 'no flies');
  E.addFly(0); at(KW, 100);
  assert.equal(E.note, 'the cat is hunting');
  engine(KW, { is: 'battlement' }); at(KW, 0); E.fireEvent('goblin'); E.addFly(10);
  at(KW, 5000); E.addFly(5000); at(KW, 7000);
  assert.match(E.note, /^next swat in \d+ s; the cat is hunting$/);
});

test('a page without the cat gives every fly to the knight, who waits indoors, as before there was a pet', () => {
  const KW = page([TEXT], false), E = engine(KW, { is: 'house' });
  assert.deepEqual(Object.keys(KW.cast.pets), []);
  at(KW, 0); E.addFly(0); at(KW, 2000);
  assert.deepEqual([E.pet.catches().length, E.pet.flies().length, E.note], [0, 1, 'flies wait: indoors']);
});

test('the engine draws the coat the input names, calico by default', () => {
  const KW = PACK, seen = [], pet = KW.cast.pets.cat;
  KW.cast.pets.cat = Object.assign({}, pet, { pose: (coat, n) => { seen.push(coat); return pet.pose(coat, n); } });
  try {
    const E = engine(KW, { is: 'camp', pet: { id: 'cat', coat: 'ginger' } }); at(KW, 0);
    engine(KW, { is: 'camp' }); delete E.input.pet; at(KW, 0);
    assert.deepEqual(seen, ['ginger', undefined]);
  } finally { KW.cast.pets.cat = pet; }
  assert.equal(pet.pose(undefined, 'rest'), pet.pose('calico', 'rest'));
});
