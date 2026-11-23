// The knight's gear at rest in the house and the smithy drawn from the medieval world's pack,
// web/packs/medieval.pack.json: the checks tests/web/knight.test.js makes of the two scenes, run on
// the scenes compiled from the pack. Run with: node --test tests/web/
//
// knight.test.js draws the house and the smithy from code, with the knight's gear at rest on both of
// the knight's paths, against the records stored in fixtures/knight/, and stays as it is. Here the
// two are compiled from kw.medieval, as a 'dev' page compiles them, and drawn in the same poses
// against the same stored records, on the code path (the knight from code) and the pack path (the
// knight from the base pack). The knight's other looks have no stored records of the scenes, so for
// each of them the compiled scene is held to the code scene, call for call. The page's scripts run
// under Node in a sandbox, as in knight.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');

const WEB = path.join(__dirname, '../../web');
const CALLS = path.join(__dirname, 'fixtures/knight/calls.json');
const UNSIGNED = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MEDIEVAL = fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8');
/* The scripts index.html loads, in its order, that the knight and the two scenes need: everything
   but the files that drive the page (state, engine, demo, main) and the other scenes. Unlike
   knight.test.js, the scene compiler and the medieval world's carrier are among them. */
const SCENES = ['house', 'smithy'];
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => (!s.startsWith('js/scenes/') || SCENES.some(n => s === `js/scenes/${n}.js`)) && !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js'].includes(s));

/* The page's drawing code in a sandbox as knight.test.js loads it, the knight started for a 'dev'
   page from the base pack (dev true) or for a deployed page from the unsigned base pack, so from
   code, in the look asked for, and the scenes of kw.medieval compiled from it: { KW, K, log, code },
   code the code house and smithy by name. Every call is one line: "s" for a fillStyle, "a" for a globalAlpha, "r" for
   a fillRect, and the name for anything else. */
function load(dev, look) {
  const log = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {} } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, code = { house: KW.scenes.house, smithy: KW.scenes.smithy };
  KW.devices = { draw() { log.push('devices'); } };
  const st = KW.knight.start(dev ? KW.packText : [UNSIGNED], dev === true, look ? { look } : undefined);
  assert.equal(st.source, dev ? 'pack' : 'code', st.note);
  const ws = KW.world.start([MEDIEVAL], true);
  for (const n of SCENES) { assert.equal(ws.scenes[n], 'pack', ws.note); assert.notEqual(KW.scenes[n], code[n]); }
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, log, code };
}

const X = 480, FLOOR = 530;
/* The pose for a condition at time t, placed as the engine places it, as in knight.test.js. */
function at(K, id, t) { const o = K.pose(id, t); o.floor = FLOOR; o.x = X; o.helmet = true; return o; }

/* The poses of knight.test.js that draw the house and the smithy, by the names its records are
   stored under. */
function POSES(K, scenes) {
  const p = [], H = scenes.house, S = scenes.smithy;
  for (const tv of [false, true]) p.push([`house painted${tv ? ' with the television' : ''}`, () => H.paint({ tv })]);
  for (const [name, id, t, inBed] of [['asleep', 'night', 2300, true], ['unwell in bed', 'container_unhealthy', 1400, true], ['helmet off', 'idle', 2300, false]]) {
    p.push([`house drawn, ${name}`, () => H.draw(t, { tv: false, inBed, helmOff: true, o: at(K, id, t) })]);
  }
  p.push(['house drawn, helmet on', () => H.draw(2300, { tv: true, inBed: false, helmOff: false, o: at(K, 'streaming', 2300) })]);
  for (const kx of [440, 300]) p.push([`smithy painted kx${kx}`, () => S.paint({ kx })]);
  for (const t of [300, 1250]) p.push([`smithy drawn t${t}`, () => { const s = { w: { id: 'updating' }, kx: 440, o: at(K, 'updating', t), strike: false }; S.act(t, s); S.draw(t, s); }]);
  return p;
}
/* The one spelling knight.test.js allows between its paths: a translucent fillStyle from the pack
   written without its alpha's leading zero. */
const codeSpelling = l => (l.startsWith('s rgba(') ? l.replace(/,0(\.\d+)\)$/, ',$1)') : l);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const drawn = (b, fn) => { b.log.length = 0; fn(); return b.log.map(codeSpelling); };
const plain = v => JSON.parse(JSON.stringify(v));

const STORED = JSON.parse(fs.readFileSync(CALLS, 'utf8')).poses;
const PATHS = { code: () => load(false), pack: () => load(true) };

for (const [path_, open] of Object.entries(PATHS)) {
  test(`the house and the smithy from kw.medieval draw the stored calls of knight.test.js, with the knight ${path_ === 'pack' ? 'from the base pack' : 'from code'}`, () => {
    const b = open(), poses = POSES(b.K, b.KW.scenes);
    assert.equal(poses.length, 10);
    for (const [name, fn] of poses) {
      assert.ok(STORED[name], `${name}: stored`);
      const lines = drawn(b, fn);
      assert.equal(sha(lines.join('\n')), STORED[name].sha256, `${name}: ${lines.length} calls drawn against ${STORED[name].calls} stored`);
    }
  });
}

/* The base pack's looks the tests use: the default, the arming sword with the shield, and the other
   two builds with each. */
const ONE_LOOK = { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } };
const LOOKS = [['the greatsword', {}], ['the arming sword and the shield', ONE_LOOK]];
for (const b of ['build.b', 'build.c']) for (const [name, look] of LOOKS.slice(0, 2)) LOOKS.push([`${name}, ${b}`, Object.assign({ build: 'kw.base/' + b }, look)]);

test('in every look, the house and the smithy from kw.medieval paint and draw the code scenes\' calls, the gear at rest among them', () => {
  for (const [name, look] of LOOKS) {
    const b = load(true, look);
    for (const [pose, fn] of POSES(b.K, b.KW.scenes)) {
      const pack = drawn(b, fn);
      const code = drawn(b, POSES(b.K, b.code).find(([n]) => n === pose)[1]);
      assert.ok(pack.length > 10, `${name}, ${pose}: draws something`);
      if (pack.join('\n') !== code.join('\n')) {
        let i = 0; while (pack[i] === code[i]) i++;
        assert.fail(`${name}, ${pose}: call ${i} is ${JSON.stringify(pack[i])} from the pack and ${JSON.stringify(code[i])} from code`);
      }
    }
  }
});

test('the backdrop key of the smithy from kw.medieval names the equipped weapon and shield and the spot, and parts the looks as the code smithy\'s does', () => {
  const pack = load(true), code = load(false);
  assert.equal(pack.KW.scenes.smithy.key({ kx: 440.4 }), '|440||kw.base/main.greatsword', 'no shield is equipped');
  assert.equal(code.KW.scenes.smithy.key({ kx: 440 }), '|440|code|code');
  const one = load(true, ONE_LOOK);
  assert.equal(one.KW.scenes.smithy.key({ kx: 440 }), '|440|kw.base/off.heater|kw.base/main.arming');
  // over the looks and two spots, two keys from the pack are equal exactly when the code's are
  const keys = [];
  for (const [, look] of LOOKS) {
    const b = load(true, look);
    for (const kx of [440, 300]) keys.push([b.KW.scenes.smithy.key({ kx }), b.code.smithy.key({ kx })]);
  }
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) assert.equal(keys[i][0] === keys[j][0], keys[i][1] === keys[j][1], `${i} and ${j}`);
});

test('the smithy from kw.medieval gives the code smithy\'s rests, and a weapon that gives no blade has no hot tip there', () => {
  const one = load(true, ONE_LOOK), S = one.KW.scenes.smithy;
  assert.deepEqual(plain(S.rests.wall), { kind: 'hang', x: 145, y: 312, w: 100, h: 132 });
  assert.deepEqual(plain(S.rests), plain(one.code.smithy.rests));
  // as knight.test.js edits the base pack to take the greatsword's blade away
  const env = JSON.parse(UNSIGNED);
  delete env.pack.items['main.greatsword'].blade;
  const a = load(true), b = load(true);
  b.K.start([JSON.stringify(env)], true);
  assert.equal(b.K.rest.reach(), null);
  const at300 = box => { box.log.length = 0; const s = { w: { id: 'updating' }, kx: 440, o: at(box.K, 'updating', 300), strike: false }; box.KW.scenes.smithy.act(300, s); box.KW.scenes.smithy.draw(300, s); return box.log.slice(); };
  const with_ = at300(a), without = at300(b);
  assert.ok(with_.includes('s #7a2a1d') && with_.includes('s #fff3a0'));
  assert.ok(!without.includes('s #7a2a1d') && !without.includes('s #8f231d'), 'no hot bands');
  assert.ok(without.length < with_.length);
});

test('the backdrop key of the house from kw.medieval names the equipped weapon and shield and the television, and parts the looks as the code house\'s does', () => {
  assert.equal(load(true).KW.scenes.house.key({ tv: true }), '10|kw.base/main.greatsword|');
  assert.equal(load(false).KW.scenes.house.key({ tv: false }), '01|code|code');
  const one = load(true, ONE_LOOK);
  assert.equal(one.KW.scenes.house.key({ tv: false }), '01|kw.base/main.arming|kw.base/off.heater');
  const keys = [];
  for (const [, look] of LOOKS) {
    const b = load(true, look);
    for (const tv of [false, true]) keys.push([b.KW.scenes.house.key({ tv }), b.code.house.key({ tv })]);
  }
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) assert.equal(keys[i][0] === keys[j][0], keys[i][1] === keys[j][1], `${i} and ${j}`);
});

test('the house from kw.medieval with the arming sword: its rests are the code house\'s, the pegs under the blade and the shield on the wall', () => {
  const b = load(true, ONE_LOOK), H = b.KW.scenes.house;
  assert.deepEqual(plain(H.rests), plain(b.code.house.rests));
  // what knight.test.js checks the camera at h2 against: the places, the rests and the rounds
  for (const k of ['places', 'rounds']) assert.deepEqual(plain(H[k]), plain(b.code.house[k]), k);
  assert.deepEqual(plain(H.rests.wall), { kind: 'hang', x: 844, y: 164, w: 100, h: 140 });
  b.log.length = 0; H.paint({ tv: false });
  // each peg's outline is 14 wide on its straight rows, from 7 left of the peg's middle
  const pegs = b.log.filter(l => /^r \d+ 254 14 1$/.test(l)).map(l => +l.split(' ')[1] + 7);
  assert.deepEqual([...new Set(pegs)], [618 + 34 + 28, 618 + 175 - 45]);
  assert.ok(b.log.includes('s #1a1524'));
});

test('the house from kw.medieval draws a helmet or a shield at rest only where its rest view fits the place', () => {
  // the base pack's shield edited to need more room than the house's wall gives, 100 by 140
  const env = JSON.parse(UNSIGNED);
  env.pack.items['off.heater'].rest.box = [96, 160];
  const wide = load(true, ONE_LOOK), tall = load(true, ONE_LOOK);
  tall.K.start([JSON.stringify(env)], true, { look: ONE_LOOK });
  assert.equal(tall.K.rest.key('off'), 'kw.base/off.heater');
  assert.equal(wide.K.rest.fits('off', wide.KW.scenes.house.rests.wall), true);
  assert.equal(tall.K.rest.fits('off', tall.KW.scenes.house.rests.wall), false);
  const shield = box => { box.log.length = 0; box.KW.scenes.house.paint({ tv: false }); return box.log.length; };
  assert.ok(shield(tall) < shield(wide), 'no shield on the wall when it does not fit');
  // the code house draws what it always did, and the weapon has no rest view to fit
  assert.equal(tall.K.rest.fits('main', { kind: 'hang', w: 1, h: 1 }), true);
  assert.equal(load(false).K.rest.fits('helmet', { kind: 'hang', w: 1, h: 1 }), true);
});
