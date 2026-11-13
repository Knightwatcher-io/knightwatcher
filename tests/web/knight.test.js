// Tests for the knight, web/js/knight.js: the drawing, call by call, and the rig it stands on.
// Run with: node --test tests/web/
//
// The drawing code runs under Node against a fake canvas context that records every call and every
// property it is given. Each pose in POSES is drawn and its record compared with the stored one in
// fixtures/knight/. Equal calls mean equal pixels.
//
//   KNIGHT_LOG=write node --test tests/web/knight.test.js      stores the record of the code as it is
//   KNIGHT_LOG=dump:DIR node --test tests/web/knight.test.js   writes each pose's full record to DIR
//
// Store the record only from code whose drawing is known to be right, before a change that should
// not alter it. To find the first differing call in a pose that has only hashes stored, dump both
// trees into two folders and compare the files.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web/js');
const FIX = path.join(__dirname, 'fixtures/knight');
const CALLS = path.join(FIX, 'calls.json'), FULL = path.join(FIX, 'idle.log');
const FULL_POSE = 'idle t2300';
const BLOCK = 128;
const MODE = process.env.KNIGHT_LOG || '';

/* Loads the page's drawing code the way index.html does, into a sandbox whose window is an empty
   object, and points it at a context that writes one line per call: "s" for a fillStyle, "a" for a
   globalAlpha, "r" for a fillRect, and the name for anything else. */
function load() {
  const log = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
  const box = vm.createContext({ window: {} });
  for (const f of ['draw', 'sprites', 'props', 'knight']) {
    vm.runInContext(fs.readFileSync(path.join(WEB, f + '.js'), 'utf8'), box, { filename: f + '.js' });
  }
  const KW = box.window.KW;
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, log };
}

const X = 480, FLOOR = 530;
/* The pose for a condition at time t, placed as the engine places it, with fields laid over it. */
function at(K, id, t, over) {
  const o = K.pose(id, t);
  o.floor = FLOOR; o.x = X; o.helmet = true;
  return Object.assign(o, over);
}

/* Every pose the test draws, by name. Each entry draws one picture. */
function POSES(K) {
  const p = [];
  const knight = (name, id, t, over, then) => p.push([name, () => { const o = at(K, id, t, over); if (then) then(o); K.draw(o); }]);
  // the stance, still and walking
  knight('idle t1000', 'idle', 1000);
  knight('idle t2300', 'idle', 2300);
  knight('idle blink t100', 'idle', 100);
  knight('walk left foot up', 'idle', 1920, { walk: true, x: 481.5 });
  knight('walk right foot up', 'idle', 2240, { walk: true, x: 478.5 });
  // every condition pose() knows, at two times or more
  for (const id of ['cpu_hot', 'memory_tight', 'disk_full', 'backup_overdue', 'pi_silent', 'updating', 'streaming', 'wan_down', 'attack', 'night', 'ssh_session']) {
    for (const t of [2300, 2800]) knight(`${id} t${t}`, id, t);
  }
  for (const t of [1400, 2600, 4250]) knight(`container_unhealthy t${t}`, 'container_unhealthy', t);
  knight('memory_tight t600', 'memory_tight', 600);
  knight('memory_tight t1600', 'memory_tight', 1600);
  for (const t of [94, 283]) knight(`attack t${t}`, 'attack', t);
  // the two-handed swing, both ways
  for (const dir of [1, -1]) for (const q of [0.1, 0.25, 0.3, 0.42, 0.55, 0.7, 0.9]) knight(`swing ${dir > 0 ? 'right' : 'left'} q${q}`, 'idle', 2300, null, o => K.swing(o, q, dir));
  // the smith's hammer
  for (const h of [0, 0.5, 1]) knight(`hammer ${h}`, 'updating', 2300, { sword: false, helmet: false, hammer: h, progress: h });
  knight('hammer bloated', 'memory_tight', 2300, { sword: false, hammer: 0.3 });
  // helmet off, sword off
  knight('helmet off', 'idle', 2300, { helmet: false });
  knight('helmet off unwell', 'container_unhealthy', 1400, { helmet: false });
  knight('helmet off hungry', 'backup_overdue', 2300, { helmet: false });
  knight('sword off', 'idle', 2300, { sword: false });
  knight('sword off bloated', 'memory_tight', 600, { sword: false });
  // the eyes, the mouth and the face
  for (const eyes of ['open', 'closed', 'happy', 'wide', 'half', 'dizzy', 'angry']) knight(`eyes ${eyes}`, 'idle', 2300, { eyes, look: 1 });
  for (const mouth of ['smile', 'frown', 'open', 'pant', 'o', 'flat']) knight(`mouth ${mouth}`, 'idle', 2300, { mouth });
  // chewing and talking alternate an open and a closed mouth
  for (const t of [2300, 2470]) knight(`mouth chew t${t}`, 'idle', t, { mouth: 'chew' });
  for (const t of [2300, 2530]) knight(`mouth talk t${t}`, 'idle', t, { mouth: 'talk' });
  knight('look left', 'idle', 2300, { look: -1 });
  knight('face sick', 'idle', 2300, { face: 'L', thermo: 1 });
  knight('face hot puffed', 'idle', 2300, { face: 'P', puff: 1 });
  knight('plume drooping', 'idle', 2300, { droop: 1 });
  // what floats around the knight
  for (const t of [2300, 2470]) knight(`food t${t}`, 'idle', t, { food: 1 });
  knight('bubble', 'idle', 2300, { bubble: 1 });
  for (const pr of [0, 0.4, 1]) knight(`progress ${pr}`, 'idle', 2300, { progress: pr });
  for (const t of [2300, 2900]) knight(`hearts t${t}`, 'idle', t, { hearts: true });
  knight('mark !', 'idle', 2300, { mark: '!' });
  knight('mark ?', 'idle', 2300, { mark: '?' });
  knight('sweat', 'idle', 2300, { sweat: 1 });
  knight('sweat light', 'idle', 2300, { sweat: 0.3 });
  knight('steam', 'idle', 2300, { steam: 1 });
  for (const t of [1000, 2300]) knight(`speech t${t}`, 'idle', t, { speak: true });
  knight('everything at once', 'memory_tight', 2800, { walk: true, x: 482.5, food: 1, bubble: 1, progress: 0.5, hearts: true, mark: '!', sweat: 1, steam: 1, speak: true, headDx: 1, headDy: 1, shake: -1 });
  // the bare head in bed, and the speech bubble, as the house and the court draw them
  p.push(['head in bed', () => K.head(-15, 262, at(K, 'night', 2300))]);
  p.push(['head in bed unwell', () => { const o = at(K, 'container_unhealthy', 1400); K.head(-15 + o.headDx * 5, 262, o); }]);
  p.push(['speech flipped', () => K.speech(672, 180, 1000, true)]);
  p.push(['speech', () => K.speech(300, 120, 700, false)]);
  return p;
}

/* The record of each pose, in order, each as an array of lines. */
function draw() {
  const { K, log } = load();
  return POSES(K).map(([name, fn]) => { log.length = 0; fn(); return [name, log.slice()]; });
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += BLOCK) out.push(sha(lines.slice(i, i + BLOCK).join('\n')).slice(0, 8));
  return out;
}

if (MODE === 'write') {
  test('stores the record of the knight as drawn now', () => {
    const rows = draw().map(([name, lines]) => '    ' + JSON.stringify(name) + ': ' + JSON.stringify({ calls: lines.length, sha256: sha(lines.join('\n')), blocks: blocks(lines).join(' ') }));
    fs.mkdirSync(FIX, { recursive: true });
    fs.writeFileSync(CALLS, `{\n  "block": ${BLOCK},\n  "poses": {\n${rows.join(',\n')}\n  }\n}\n`);
    fs.writeFileSync(FULL, draw().find(([name]) => name === FULL_POSE)[1].join('\n') + '\n');
  });
} else if (MODE.startsWith('dump:')) {
  test('dumps the record of every pose', () => {
    const dir = MODE.slice(5);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, lines] of draw()) fs.writeFileSync(path.join(dir, name.replace(/[^\w.!?-]+/g, '_') + '.log'), lines.join('\n') + '\n');
  });
} else {
  const stored = JSON.parse(fs.readFileSync(CALLS, 'utf8'));
  assert.equal(stored.block, BLOCK);
  const drawn = draw();

  test('the stored record covers exactly the poses drawn', () => {
    assert.deepEqual(drawn.map(([name]) => name), Object.keys(stored.poses));
  });

  test('every pose draws the stored calls, number for number', async t => {
    for (const [name, lines] of drawn) {
      await t.test(name, () => {
        const want = stored.poses[name];
        assert.ok(want, `${name}: no stored record`);
        if (sha(lines.join('\n')) === want.sha256) return;
        const got = blocks(lines), exp = want.blocks.split(' ');
        let i = 0; while (i < got.length && got[i] === exp[i]) i++;
        const from = i * BLOCK, to = Math.min(lines.length, from + BLOCK);
        assert.fail(`${name}: ${lines.length} calls drawn against ${want.calls} stored. The first difference lies in calls ` +
          `${from} to ${to - 1}, which are now:\n` + lines.slice(from, to).join('\n'));
      });
    }
  });

  test(`the pose "${FULL_POSE}" draws the stored full record, call by call`, () => {
    const want = fs.readFileSync(FULL, 'utf8').trimEnd().split('\n'), got = drawn.find(([name]) => name === FULL_POSE)[1];
    for (let i = 0; i < Math.max(want.length, got.length); i++) {
      if (got[i] !== want[i]) assert.fail(`call ${i}: drew ${JSON.stringify(got[i])}, stored ${JSON.stringify(want[i])}`);
    }
  });

  /* ---- The rig ------------------------------------------------------------------------------ */
  const { K } = load();
  const NAMES = ['root', 'footL', 'footR', 'hipL', 'hipR', 'hem', 'belt', 'neck', 'shoulderL', 'shoulderR', 'head'];
  const DIFFS = ['dShoulder', 'dChest', 'dWaist', 'dHip', 'dStance', 'dLeg', 'dHeight', 'dHead'];
  /* The fixed anchors as the specification of the rig gives them for the present knight. */
  const present = (x, y, d, b, hdx, hdy) => ({
    root: [x, y], footL: [x - 24, y], footR: [x + 24, y], hipL: [x - 24, y - 74 + d], hipR: [x + 24, y - 74 + d],
    hem: [x, y - 64 + d], belt: [x, y - 102 + d], neck: [x, y - 162 + d],
    shoulderL: [x - (54 + b), y - 132 + d], shoulderR: [x + 54 + b, y - 132 + d], head: [x + 5 * hdx, y - 206 + d + 5 * hdy] });
  const fixed = r => Object.fromEntries(NAMES.map(n => [n, [...r.anchors[n]]]));

  test('the present build differs from the reference in nothing', () => {
    const r = K.rig(at(K, 'idle', 2300));
    for (const n of DIFFS) assert.equal(r.values[n], 0, n);
    assert.deepEqual({ ...K.build }, { shoulder: 54, chest: 46, waist: 46, hip: 46, stance: 24, leg: 74, height: 132, head: 51 });
  });

  test('the anchors of the idle stance are the present values', () => {
    assert.deepEqual(fixed(K.rig(at(K, 'idle', 2300))), present(X, FLOOR, 0, 0, 0, 0));
  });

  test('the anchors follow the drop, the bloat, the head\'s shifts and the shake', () => {
    const cases = [
      [{ bob: 1 }, 5, 0, 0, 0, 0], [{ bob: 1, crouch: 2 }, 15, 0, 0, 0, 0], [{ bloat: 5 }, 0, 25, 0, 0, 0], [{ bloat: 6, bob: 1 }, 5, 30, 0, 0, 0],
      [{ headDx: 1 }, 0, 0, 1, 0, 0], [{ headDx: -1 }, 0, 0, -1, 0, 0], [{ headDy: 1 }, 0, 0, 0, 1, 0], [{ shake: 1 }, 0, 0, 0, 0, 4], [{ shake: -1, x: 480.6 }, 0, 0, 0, 0, -3]];
    for (const [over, d, b, hdx, hdy, dx] of cases) {
      const r = K.rig(at(K, 'idle', 2300, over));
      assert.deepEqual(fixed(r), present(X + dx, FLOOR, d, b, hdx, hdy), JSON.stringify(over));
      assert.equal(r.values.drop, d); assert.equal(r.values.bloat, b);
    }
  });

  test('a build moves exactly the anchors its measurement leans on', () => {
    // for each measurement grown by 3: the anchors that move, and by how much across and down
    const moves = {
      shoulder: { shoulderL: [-3, 0], shoulderR: [3, 0] }, chest: {}, waist: {}, hip: {},
      stance: { footL: [-3, 0], footR: [3, 0], hipL: [-3, 0], hipR: [3, 0] },
      leg: { hipL: [0, -3], hipR: [0, -3], hem: [0, -3], belt: [0, -3] },
      height: { neck: [0, -3], shoulderL: [0, -3], shoulderR: [0, -3], head: [0, -3] },
      head: { head: [0, -3] } };
    const o = at(K, 'idle', 2300, { bob: 1, bloat: 5, headDx: 1 }), base = fixed(K.rig(o));
    for (const [m, want] of Object.entries(moves)) {
      const r = K.rig(o, { ...K.build, [m]: K.build[m] + 3 }), got = {};
      for (const n of NAMES) { const dx = r.anchors[n][0] - base[n][0], dy = r.anchors[n][1] - base[n][1]; if (dx || dy) got[n] = [dx, dy]; }
      assert.deepEqual(got, want, m);
      for (const n of DIFFS) assert.equal(r.values[n], n === 'd' + m[0].toUpperCase() + m.slice(1) ? 3 : 0, `${m}: ${n}`);
    }
  });

  test('the named values come from the pose', () => {
    let r = K.rig(at(K, 'memory_tight', 2300));
    assert.equal(r.values.bloat, 30); assert.equal(r.values.drop, 5);
    r = K.rig(at(K, 'disk_full', 2300));
    assert.equal(r.values.drop, 10); assert.equal(r.values.bloat, 0);
    r = K.rig(at(K, 'idle', 1920, { walk: true })); assert.deepEqual([r.values.stepL, r.values.stepR], [1, 0]);
    r = K.rig(at(K, 'idle', 2240, { walk: true })); assert.deepEqual([r.values.stepL, r.values.stepR], [0, 1]);
    r = K.rig(at(K, 'idle', 1920)); assert.deepEqual([r.values.stepL, r.values.stepR], [0, 0]);
    for (const t of [0, 1414, 2300, 4241]) assert.equal(K.rig(at(K, 'idle', t)).values.sway, Math.round(Math.sin(t / 900) * 4));
  });

  test('the hands and the weapon frame follow the grip', () => {
    // no weapon: the hands hang at the sides
    let r = K.rig(at(K, 'idle', 2300, { sword: false, bloat: 5, bob: 1 }));
    assert.equal(r.grip, 'none');
    assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], [[X - 89, FLOOR - 79], [X + 89, FLOOR - 79]]);
    // the hammer: the left hand steadies the work, the right swings
    r = K.rig(at(K, 'updating', 2300, { sword: false, hammer: 0.5, bloat: 5, bob: 1 }));
    assert.equal(r.grip, 'hammer');
    assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], [[X + 45, FLOOR - 99], [X + 105, FLOOR - 117]]);
    assert.deepEqual([...r.anchors.main], [X + 105, FLOOR - 117, 0.75]);
    // both hands on the grip, the upper on the side the blade leans to
    for (const dir of [1, -1]) {
      const o = at(K, 'idle', 2300, { bob: 1 }); K.swing(o, 0.42, dir); r = K.rig(o);
      const gx = X - 120 + o.gx * 5, gy = FLOOR - 300 + o.gy * 5 + 5, a = o.wang, sx = Math.sin(a), sy = -Math.cos(a);
      assert.equal(r.grip, 'two');
      assert.deepEqual([...r.anchors.main], [gx, gy, a]);
      const up = [gx + sx * 6, gy + sy * 6], low = [gx - sx * 30, gy - sy * 30];
      assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], sx >= 0 ? [low, up] : [up, low], `dir ${dir}`);
    }
  });

  test('the rig fills the same objects every time', () => {
    const r1 = K.rig(at(K, 'idle', 2300)), root = r1.anchors.root, main = r1.anchors.main;
    const r2 = K.rig(at(K, 'attack', 94));
    assert.equal(r1, r2); assert.equal(r2.anchors.root, root); assert.equal(r2.anchors.main, main);
    assert.deepEqual(Object.keys(r2.anchors), [...NAMES, 'handL', 'handR', 'main']);
    assert.deepEqual(Object.keys(r2.values), ['drop', 'bloat', 'stepL', 'stepR', 'sway', ...DIFFS]);
  });
}
