// Tests for the knight, web/js/knight.js: the drawing, call by call, the gear at rest, and the rig it
// stands on. Run with: node --test tests/web/
//
// The drawing code runs under Node against a fake canvas context that records every call and every
// property it is given. Each pose in POSES is drawn twice, once from code and once from the base
// pack in web/packs/, and each record is compared with the stored one in fixtures/knight/, which
// was taken from the code. Equal calls mean equal pixels. Besides the knight, POSES draws the gear
// at rest, and the house and the smithy painted and drawn, since they show it.
//
//   KNIGHT_LOG=write node --test tests/web/knight.test.js         stores the record of the code as it is
//   KNIGHT_LOG=dump:DIR node --test tests/web/knight.test.js      writes each pose's full record, from code, to DIR
//   KNIGHT_LOG=dump-pack:DIR node --test tests/web/knight.test.js the same, drawn from the base pack
//
// Store the record only from code whose drawing is known to be right, before a change that should
// not alter it. To find the first differing call in a pose that has only hashes stored, dump both
// trees into two folders and compare the files.
'use strict';
/* KNIGHT_PART, set by tests/web/knight-free-*.test.js, runs only the checks of the base pack's free
   items of 1.4.0 and its crossbow of 1.5.0 on one build (free:build.a, free:build.b or free:build.c), in a process of its own
   beside this file's; without it every other test here runs and those do not. */
const PART = process.env.KNIGHT_PART || '';
const test = PART ? () => {} : require('node:test');
const freeTest = /^free:build\.[abc]$/.test(PART) ? require('node:test') : () => {};
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');
const FIX = path.join(__dirname, 'fixtures/knight');
const CALLS = path.join(FIX, 'calls.json'), FULL = path.join(FIX, 'idle.log');
const FULL_POSE = 'idle t2300';
const BLOCK = 128;
const MODE = process.env.KNIGHT_LOG || '';
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');

/* The base pack as it ships, whether it carries a signature, and an unsigned copy of it. A deployed
   page draws from the shipped base pack when it carries a signature that verifies against KEYS,
   and from code otherwise. Every test here holds in either state: the code path is drawn from the
   unsigned copy, which a deployed page always refuses, and anything that edits the pack edits the
   unsigned copy, since an edit breaks a signature. */
const SHIPPED = fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8');
const SIGNED = Object.prototype.hasOwnProperty.call(JSON.parse(SHIPPED), 'sig');
const UNSIGNED = SIGN.withoutSig(SHIPPED);
// The base pack's version, which the console line names.
const VERSION = JSON.parse(SHIPPED).pack.version;
/* The two paths, each as the page that takes it: from code, as on a deployed page given the
   unsigned base pack, and from the base pack as it ships, as on a 'dev' page, which reads it signed
   or not. */
const PATHS = { code: () => load(false, [UNSIGNED]), pack: () => load(true) };

/* The scripts index.html loads, in its order, that the knight's drawing needs: everything but the
   files that drive the page (state, engine, demo, main) and the scenes other than the two that show
   the knight's gear at rest, the house and the smithy. The pack library and the base pack's carrier
   are among them; the scene compiler and the medieval world's carrier are not, since that pack
   dresses no knight (tests/web/world.test.js loads it). */
const SCENES = ['js/scenes/house.js', 'js/scenes/smithy.js'];
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => (!s.startsWith('js/scenes/') || SCENES.includes(s)) && !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js', 'js/world.js', 'packs/medieval.pack.js'].includes(s));

/* Loads the page's drawing code the way index.html does, into a sandbox whose window is an empty
   object, chooses the knight's source as main.js does, for a 'dev' page when dev is true, and
   points the drawing at a context that writes one line per call: "s" for a fillStyle, "a" for a
   globalAlpha, "r" for a fillRect, and the name for anything else. texts, when given, replace what
   the carriers pushed. kw1, when given, is the base64 of a public key that the sandbox's copy of
   pack.js holds as kw1 in place of the shipped one, for a pack signed with a key made for the run.
   The sandbox's console writes into lines, as [level, text]. */
function load(dev, texts, kw1) {
  const log = [], lines = [];
  const ctx = new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
  const box = vm.createContext({ window: {}, console: { info: l => lines.push(['info', l]), warn: l => lines.push(['warn', l]) } });
  for (const f of SCRIPTS) {
    // a carrier names KW as the page's global, which window.KW is in a browser
    if (box.window.KW) box.KW = box.window.KW;
    let src = fs.readFileSync(path.join(WEB, f), 'utf8');
    if (kw1 && f === 'js/pack.js') {
      const swapped = src.replace(/(get kw1\(\) \{ return base64\(')[A-Za-z0-9+/=]+'/, '$1' + kw1 + '\'');
      assert.notEqual(swapped, src, 'the key of kw1 is swapped in the sandbox');
      src = swapped;
    }
    vm.runInContext(src, box, { filename: f });
  }
  const KW = box.window.KW;
  // the engine draws the devices where a scene's draw asks for them; here that is one line
  KW.devices = { draw() { log.push('devices'); } };
  const status = KW.knight.start(texts || KW.packText, dev === true);
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, log, status, lines, box };
}

const X = 480, FLOOR = 530;
/* The moments of the smith's three acts the record draws, by condition and time: the hammer's blow
   (0), its bounce (100), rise (500) and top (900); the quench's blank in the fire (600), raised
   (2200), carried (3600), swung down (5500), in the water (6600), lifted out (7800), looked over
   (8800) and going back into the fire (13700); the bellows open (0) and pressed (240). */
const SMITH = [['updating', 0], ['updating', 100], ['updating', 500], ['updating', 900], ['idle', 600], ['idle', 2200], ['idle', 3600], ['idle', 5500],
  ['idle', 6600], ['idle', 7800], ['idle', 8800], ['idle', 13700], ['cpu_hot', 0], ['cpu_hot', 240]];
/* The knight's pose o in the smithy's act for the condition id at t, the knight's spot at X, moved off
   it as the act moves it (s.dx). */
function smith(S, o, id, t) {
  const s = { w: { id }, kx: X, o, strike: false, dx: 0 };
  S.act(t, s);
  o.x = X + s.dx;
  return s;
}
/* The pose for a condition at time t, placed as the engine places it, with fields laid over it. */
function at(K, id, t, over) {
  const o = K.pose(id, t);
  o.floor = FLOOR; o.x = X; o.helmet = true;
  return Object.assign(o, over);
}

/* Every pose the test draws, by name. Each entry draws one picture. */
function POSES(K, scenes) {
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
  // the smith's three acts, as the smithy's act places the knight: the hammer at the blow, bouncing,
  // rising and at the top; the quench's tongs and blank in the fire, raised, carried, in the water,
  // lifted out, looked over and laid back in the fire; and the bellows open and pressed, leaning in
  for (const [id, t] of SMITH) knight(`smith ${id} t${t}`, id, t, { sword: false, helmet: false }, o => smith(scenes.smithy, o, id, t));
  knight('smith updating bloated', 'memory_tight', 2300, { sword: false }, o => smith(scenes.smithy, o, 'updating', 2300));
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
  // the gear at rest on its own, at the places the house and the smithy put it
  p.push(['helmet at rest on the stool', () => K.rest.draw('helmet', 460, 476)]);
  p.push(['weapon at rest on the pegs', () => K.rest.draw('main', 618, 228, Math.PI / 2)]);
  p.push(['weapon at rest on the anvil', () => K.rest.draw('main', 490, 425, Math.PI / 2)]);
  p.push(['weapon at rest at a slant', () => K.rest.draw('main', 300.5, 280.25, 0.7)]);
  // The house and the smithy, which show the knight's gear at rest: painted, which is the backdrop
  // with the weapon on the pegs or across the anvil, and drawn, which is the helmet on the stool,
  // the sleeper's head on the pillow and the blade's hot tip.
  const H = scenes.house, S = scenes.smithy;
  for (const tv of [false, true]) p.push([`house painted${tv ? ' with the television' : ''}`, () => H.paint({ tv })]);
  for (const [name, id, t, inBed] of [['asleep', 'night', 2300, true], ['unwell in bed', 'container_unhealthy', 1400, true], ['helmet off', 'idle', 2300, false]]) {
    p.push([`house drawn, ${name}`, () => H.draw(t, { tv: false, inBed, helmOff: true, o: at(K, id, t) })]);
  }
  p.push(['house drawn, helmet on', () => H.draw(2300, { tv: true, inBed: false, helmOff: false, o: at(K, 'streaming', 2300) })]);
  for (const kx of [440, 300]) p.push([`smithy painted kx${kx}`, () => S.paint({ kx })]);
  for (const t of [300, 1250]) p.push([`smithy drawn t${t}`, () => { const s = { w: { id: 'updating' }, kx: 440, o: at(K, 'updating', t), strike: false }; S.act(t, s); S.draw(t, s); }]);
  return p;
}

/* The record of each pose, in order, each as an array of lines, drawn by the path named, 'code' or
   'pack'.

   One spelling differs between the paths and nothing else may: the pack writes a translucent colour
   as rgba(60,30,20,0.18), which is how JavaScript writes the number, and the code as
   rgba(60,30,20,.18). A canvas reads both as the same colour. On the pack path the alpha of such a
   fillStyle is written without its leading zero before the record is compared; every other
   character of every line is compared as drawn. */
const codeSpelling = l => (l.startsWith('s rgba(') ? l.replace(/,0(\.\d+)\)$/, ',$1)') : l);
function draw(path_) {
  const { KW, K, log, status } = PATHS[path_]();
  assert.equal(status.source, path_, status.note);
  return POSES(K, KW.scenes).map(([name, fn]) => { log.length = 0; fn(); return [name, path_ === 'pack' ? log.map(codeSpelling) : log.slice()]; });
}
/* A value from the sandbox as plain data, to compare with values made here. */
const plain = v => JSON.parse(JSON.stringify(v));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += BLOCK) out.push(sha(lines.slice(i, i + BLOCK).join('\n')).slice(0, 8));
  return out;
}

if (MODE === 'write') {
  test('stores the record of the knight as drawn now', () => {
    const rows = draw('code').map(([name, lines]) => '    ' + JSON.stringify(name) + ': ' + JSON.stringify({ calls: lines.length, sha256: sha(lines.join('\n')), blocks: blocks(lines).join(' ') }));
    fs.mkdirSync(FIX, { recursive: true });
    fs.writeFileSync(CALLS, `{\n  "block": ${BLOCK},\n  "poses": {\n${rows.join(',\n')}\n  }\n}\n`);
    fs.writeFileSync(FULL, draw('code').find(([name]) => name === FULL_POSE)[1].join('\n') + '\n');
  });
} else if (MODE.startsWith('dump:') || MODE.startsWith('dump-pack:')) {
  test('dumps the record of every pose', () => {
    const dir = MODE.slice(MODE.indexOf(':') + 1);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, lines] of draw(MODE.startsWith('dump-pack:') ? 'pack' : 'code')) fs.writeFileSync(path.join(dir, name.replace(/[^\w.!?-]+/g, '_') + '.log'), lines.join('\n') + '\n');
  });
} else {
  const stored = JSON.parse(fs.readFileSync(CALLS, 'utf8'));
  assert.equal(stored.block, BLOCK);

  for (const path_ of Object.keys(PATHS)) {
    const drawn = draw(path_), from = path_ === 'pack' ? 'from the base pack' : 'from code';

    test(`${from}: the stored record covers exactly the poses drawn`, () => {
      assert.equal(drawn.length, 123);
      assert.deepEqual(drawn.map(([name]) => name), Object.keys(stored.poses));
    });

    test(`${from}: every pose draws the stored calls, number for number`, async t => {
      for (const [name, lines] of drawn) {
        await t.test(name, () => {
          const want = stored.poses[name];
          assert.ok(want, `${name}: no stored record`);
          if (sha(lines.join('\n')) === want.sha256) return;
          const got = blocks(lines), exp = want.blocks.split(' ');
          let i = 0; while (i < got.length && got[i] === exp[i]) i++;
          const at = i * BLOCK, to = Math.min(lines.length, at + BLOCK);
          assert.fail(`${name}: ${lines.length} calls drawn against ${want.calls} stored. The first difference lies in calls ` +
            `${at} to ${to - 1}, which are now:\n` + lines.slice(at, to).join('\n'));
        });
      }
    });

    test(`${from}: the pose "${FULL_POSE}" draws the stored full record, call by call`, () => {
      const want = fs.readFileSync(FULL, 'utf8').trimEnd().split('\n'), got = drawn.find(([name]) => name === FULL_POSE)[1];
      for (let i = 0; i < Math.max(want.length, got.length); i++) {
        if (got[i] !== want[i]) assert.fail(`call ${i}: drew ${JSON.stringify(got[i])}, stored ${JSON.stringify(want[i])}`);
      }
    });
  }

  /* ---- The choice of path, and the pack path's own workings ---------------------------------- */

  /* What a page says when it draws from a base pack, signed or not. */
  const fromPack = (status, signed) => {
    assert.equal(status.source, 'pack', status.note);
    assert.deepEqual(plain(status.base), { id: 'kw.base', version: VERSION, signed });
    assert.deepEqual(plain(status.refused), []);
    assert.deepEqual(plain(status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), []);
    assert.equal(status.note, 'knightwatcher: the knight is drawn from the base pack kw.base ' + VERSION + ', ' + (signed ? 'signed' : 'unsigned'));
  };
  const MISSING = 'sig: is missing, and this page accepts only signed packs';
  /* The unsigned base pack signed with a key made for the run: { text, kw1 }, kw1 the public key in
     base64 for load(). */
  const signedForRun = () => {
    const k = crypto.generateKeyPairSync('ed25519');
    const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(UNSIGNED).pack)), k.privateKey).toString('base64');
    return { text: SIGN.withSig(UNSIGNED, { alg: 'ed25519', kid: 'kw1', value }), kw1: Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64') };
  };

  test('Under strain short of memory trains bloated: the cpu_hot pose with memory_tight\'s bloat and puffed cheeks', () => {
    const { K } = load(true);
    for (const t of [600, 1300, 2300]) {
      const hot = K.pose('cpu_hot', t), mem = K.pose('cpu_hot', t, true), tight = K.pose('memory_tight', t);
      assert.equal(hot.bloat, undefined);
      assert.equal(hot.puff, undefined);
      assert.deepEqual([mem.bloat, mem.puff], [tight.bloat, tight.puff], 't' + t);
      assert.ok(mem.bloat === 5 || mem.bloat === 6);
      // the rest is the training pose: half eyes, panting, sweat and steam
      const { bloat, puff, ...rest } = mem;
      assert.equal(JSON.stringify(rest), JSON.stringify(hot));
    }
    // mem changes no other condition's pose
    assert.equal(JSON.stringify(K.pose('attack', 2300, true)), JSON.stringify(K.pose('attack', 2300)));
  });

  test('a dev page draws the knight from the base pack as it ships, signed or not, and says so', () => {
    const { K, status } = load(true);
    assert.equal(K.source, 'pack');
    assert.equal(K.status, status);
    fromPack(status, SIGNED);
  });

  test('a dev page draws the knight from an unsigned base pack, and says so', () => {
    fromPack(load(true, [UNSIGNED]).status, false);
  });

  const CODE = 'knightwatcher: the knight is drawn from code: ';
  test('a deployed page refuses an unsigned base pack at the signature step and draws from code', () => {
    const { K, status, lines } = load(false, [UNSIGNED]);
    assert.equal(K.source, 'code');
    assert.equal(status.base, null);
    assert.deepEqual(plain(status.refused), [{ id: 'kw.base', file: null, step: 'signature', reason: MISSING }]);
    assert.equal(status.note, CODE + 'the base pack kw.base was refused at the signature step');
    assert.deepEqual(lines, [['warn', 'knightwatcher: the pack kw.base was refused at the signature step: ' + MISSING], ['warn', status.note]]);
  });

  test('a deployed page draws from the base pack as it ships when it is signed, and from code when it is not', () => {
    const { K, status } = load(false);
    if (SIGNED) {
      assert.equal(K.source, 'pack');
      fromPack(status, true);
    } else {
      assert.equal(K.source, 'code');
      assert.deepEqual(plain(status.refused), [{ id: 'kw.base', file: null, step: 'signature', reason: MISSING }]);
    }
  });

  test('a deployed page reads a signed base pack through KW.ed25519.verify, and draws from code without a verifier', () => {
    const run = signedForRun(), box = load(false, [run.text], run.kw1);
    fromPack(box.status, true);
    // a dev page reads it the same way
    fromPack(load(true, [run.text], run.kw1).status, true);
    // the verifier asked is the one the page loaded
    const asked = [], verify = box.KW.ed25519.verify;
    box.KW.ed25519.verify = (...a) => { const r = verify(...a); asked.push(r); return r; };
    fromPack(box.K.start([run.text], false), true);
    assert.deepEqual(asked, [true]);
    // with no verifier loaded, the signature cannot be checked
    box.KW.ed25519 = undefined;
    const none = box.K.start([run.text], false);
    assert.equal(none.source, 'code');
    assert.deepEqual(plain(none.refused), [{ id: 'kw.base', file: null, step: 'signature', reason: 'sig: cannot be checked: no verifier is loaded' }]);
    // and a page whose kw1 is another key refuses it
    const other = load(false, [run.text]).status;
    assert.equal(other.source, 'code');
    assert.equal(other.refused[0].step, 'signature');
    assert.match(other.refused[0].reason, /does not verify/);
  });

  test('with no base pack, a broken one or no pack library, the knight is drawn from code', () => {
    const text = UNSIGNED;
    assert.equal(load(true, []).status.note, CODE + 'no base pack is loaded');
    let s = load(true, ['not json']).status;
    assert.equal(s.source, 'code');
    assert.deepEqual(plain(s.refused), [{ id: null, file: null, step: 'json', reason: 'the file is not valid JSON' }]);
    const v = load(true, [text.replace('"version": "' + VERSION + '"', '"version": "1.2"')]);
    assert.notEqual(v.status.note, CODE + 'no base pack is loaded', 'the version was replaced');
    assert.equal(v.status.note, CODE + 'the base pack kw.base was refused at the fields step');
    assert.deepEqual(v.lines[0], ['warn', 'knightwatcher: the pack kw.base was refused at the fields step: pack.version: must be major.minor.patch, each 0 to 999']);
    const box = load(true);
    assert.equal(box.K.source, 'pack');
    box.KW.pack = undefined;
    assert.equal(box.K.start(box.KW.packText, true).note, CODE + 'the pack library is not loaded');
    assert.equal(box.K.source, 'code');
  });

  test('the console line cuts a long reason short', () => {
    const box = load(true), lib = box.KW.pack;
    box.KW.pack = Object.assign({}, lib, { read: () => ({ ok: false, step: 'fields', reason: 'r'.repeat(300), id: 'kw.base' }) });
    box.lines.length = 0;
    const s = box.K.start(box.KW.packText, true);
    assert.equal(s.source, 'code');
    assert.deepEqual(box.lines[0], ['warn', 'knightwatcher: the pack kw.base was refused at the fields step: ' + 'r'.repeat(117) + '...']);
    assert.equal(s.refused[0].reason.length, 300, 'the status keeps the reason whole');
  });

  test('the pack path draws what the pack says: a changed tabard colour shows, and nothing else changes', () => {
    const text = UNSIGNED;
    const red = text.replace('"blue": { "name": "Blue", "entries": { "0": "#6f9eff", "1": "#3f74e0"', '"blue": { "name": "Blue", "entries": { "0": "#6f9eff", "1": "#ab0102"');
    assert.notEqual(red, text);
    const a = load(true), b = load(true, [red]);
    assert.equal(b.status.source, 'pack');
    const at0 = K => at(K, 'idle', 2300);
    a.K.draw(at0(a.K)); b.K.draw(at0(b.K));
    const diff = a.log.map((l, i) => [l, b.log[i]]).filter(([x, y]) => x !== y);
    assert.equal(a.log.length, b.log.length);
    assert.ok(diff.length > 10, 'the tabard\'s middle band fills many rows');
    assert.ok(diff.every(([x, y]) => x === 's #3f74e0' && y === 's #ab0102'), 'only that colour changes');
  });

  /* The unsigned base pack's file as text, after edit(pack) has changed the parsed pack. */
  const editedPack = edit => {
    const env = JSON.parse(UNSIGNED);
    edit(env.pack);
    return JSON.stringify(env);
  };

  test('the pack path draws the face in the look\'s colours: a changed skin and hair brow show, and nothing else changes', () => {
    // the middle band of each skin ramp, the cheeks, the puffed cheeks and the brows, each changed
    // to a colour of its own; the warm skin's puffed cheeks share their colour with its hot ramp's
    // middle band. The new face band is light, so the dark new brows still stand clear of it and
    // draw no edge, as the old ones did not.
    const pairs = [['#f6cda4', '#f1d1b1', 'the face\'s middle band'], ['#b9dd92', '#a10002', 'the sick middle band'], ['#ff9f8c', '#a10003', 'the hot middle band'],
      ['#f3a892', '#a10004', 'the cheeks'], ['#ff9f8c', '#a10006', 'the puffed cheeks'], ['#8a5a2b', '#a10005', 'the brows']];
    const swap = new Set(pairs.map(([x, y]) => 's ' + x + '>s ' + y));
    const text = editedPack(p => {
      const s = p.swatches.skin.warm.entries, h = p.swatches.hair.brown.entries;
      s.face[1][1] = '#f1d1b1'; s.sick[1][1] = '#a10002'; s.hot[1][1] = '#a10003'; s.cheek = '#a10004'; s.puff = '#a10006'; h.brow = '#a10005';
    });
    const a = load(true), b = load(true, [text]);
    assert.equal(b.status.source, 'pack');
    // the half eyes on the normal, sick and hot skins, the cheeks, the puffed cheeks, the brows of
    // the open and the wide eyes, helmet on and off
    const poses = [['disk_full', 2300], ['container_unhealthy', 1400], ['cpu_hot', 2300], ['memory_tight', 2300], ['idle', 2300], ['idle', 2300, { eyes: 'wide' }],
      ['idle', 2300, { face: 'P', puff: 1 }], ['backup_overdue', 2300, { helmet: false }], ['container_unhealthy', 1400, { helmet: false }], ['cpu_hot', 2300, { helmet: false }]];
    for (const box of [a, b]) for (const [id, t, over] of poses) box.K.draw(at(box.K, id, t, over));
    for (const box of [a, b]) box.K.head(-15, 262, at(box.K, 'container_unhealthy', 1400));
    assert.equal(a.log.length, b.log.length);
    const diff = a.log.map((l, i) => [l, b.log[i]]).filter(([x, y]) => x !== y);
    assert.ok(diff.length > 0);
    assert.deepEqual(diff.filter(([x, y]) => !swap.has(x + '>' + y)), [], 'only the changed colours change');
    for (const [from, to, what] of pairs) assert.ok(diff.some(([x, y]) => x === 's ' + from && y === 's ' + to), `${what}: ${from} is drawn as ${to}`);
  });

  /* The base pack's colour choices, and a box that draws the looks made of them. */
  const SWATCHES = JSON.parse(UNSIGNED).pack.swatches;
  const skinColours = e => [...e.face, ...e.sick, ...e.hot].map(b => b[1]).concat(e.cheek, e.puff);
  const hairColours = e => [e['0'], e['1'], e['2'], e.brow];

  test('every skin with every hair colour: the face is drawn in that look\'s colours and in no other choice\'s', () => {
    const box = load(true);
    let pairs = 0;
    for (const [sk, skin] of Object.entries(SWATCHES.skin)) for (const [hc, hair] of Object.entries(SWATCHES.hair)) {
      box.status = box.K.start([UNSIGNED], true, { look: { swatches: { skin: 'kw.base/' + sk, hair: 'kw.base/' + hc } } });
      assert.equal(box.status.source, 'pack');
      assert.deepEqual(plain(box.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), [], sk + ' ' + hc);
      const own = new Set(skinColours(skin.entries).concat(hairColours(hair.entries)));
      const others = [];
      for (const [id, o] of Object.entries(SWATCHES.skin)) if (id !== sk) others.push(...skinColours(o.entries));
      for (const [id, o] of Object.entries(SWATCHES.hair)) if (id !== hc) others.push(o.entries.brow);
      const banned = new Set(others.filter(c => !own.has(c)).map(c => 's ' + c));
      const e = skin.entries, mid = r => 's ' + r[1][1];
      // each pose with the colour it must show: the face, the lids of the half eyes on the sick and
      // hot ramps, the cheeks, the puffed cheeks, the brows of the open and the wide eyes
      const poses = [['idle', 2300, true, [mid(e.face), 's ' + e.cheek, 's ' + hair.entries.brow]], ['idle', 2300, false, [mid(e.face), 's ' + hair.entries.brow]],
        ['container_unhealthy', 1400, true, [mid(e.sick)]], ['container_unhealthy', 1400, false, [mid(e.sick)]], ['cpu_hot', 2300, true, [mid(e.hot)]],
        ['cpu_hot', 2300, false, [mid(e.hot)]], ['memory_tight', 2300, false, ['s ' + e.puff]], ['wan_down', 2300, false, ['s ' + hair.entries.brow]],
        ['backup_overdue', 2300, false, [mid(e.face)]]];
      for (const [id, t, helmet, want] of poses) {
        box.log.length = 0;
        // the drumstick in the hungry knight's thought bubble is a prop with colours of its own
        box.K.draw(at(box.K, id, t, { helmet, bubble: 0 }));
        const what = `${sk} skin, ${hc} hair, ${id} t${t}, helmet ${helmet ? 'on' : 'off'}`;
        assert.deepEqual(box.log.filter(l => banned.has(l)), [], what);
        for (const w of want) assert.ok(box.log.includes(w), `${what}: ${w} is drawn`);
      }
      // and the head in bed, unwell
      box.log.length = 0;
      box.K.head(-15, 262, at(box.K, 'container_unhealthy', 1400));
      assert.deepEqual(box.log.filter(l => banned.has(l)), [], `${sk} skin, ${hc} hair, in bed`);
      assert.ok(box.log.includes(mid(e.sick)), `${sk} skin, ${hc} hair, in bed: the sick skin`);
      pairs++;
    }
    assert.equal(pairs, 36);
  });

  /* The WCAG contrast ratio of two colours, written here apart from knight.js. */
  const lum = hex => {
    const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  test('the brows keep contrast against every skin: a brow near the skin\'s own lightness gets a dark edge, and only such a brow', () => {
    const box = load(true), K_ = '#1a1524';
    const edged = [];
    for (const [sk, skin] of Object.entries(SWATCHES.skin)) for (const [hc, hair] of Object.entries(SWATCHES.hair)) {
      box.K.start([UNSIGNED], true, { look: { swatches: { skin: 'kw.base/' + sk, hair: 'kw.base/' + hc } } });
      // the brows lie across the face's middle and shadow bands, from a fifth to four fifths of its width
      const brow = hair.entries.brow, under = skin.entries.face.slice(1).map(b => b[1]);
      const low = Math.min(...under.map(c => ratio(brow, c)));
      const want = low < 2.5;
      if (want) edged.push(sk + '/' + hc);
      // the edge is darker than every band it lies on, so it reads as a dark mark on any skin
      for (const c of under) assert.ok(lum(K_) < lum(c), `${sk}: the edge is darker than ${c}`);
      for (const [eyes, helmet] of [['open', true], ['open', false], ['wide', false]]) {
        box.log.length = 0;
        box.K.draw(at(box.K, 'idle', 2300, { eyes, helmet }));
        const L = box.log, brows = [];
        for (let i = 1; i < L.length; i++) if (L[i - 1] === 's ' + brow && /^r \S+ \S+ 12 3$/.test(L[i])) brows.push(i);
        assert.equal(brows.length, 2, `${sk}/${hc} ${eyes}: two brows`);
        for (const i of brows) {
          const [x, y] = L[i].split(' ').slice(1, 3).map(Number);
          const has = L[i - 3] === 's ' + K_ && L[i - 2] === `r ${x - 1} ${y - 1} 14 5`;
          assert.equal(has, want, `${sk} skin, ${hc} brows (contrast ${low.toFixed(2)}), ${eyes} eyes, helmet ${helmet ? 'on' : 'off'}: ${want ? 'an edge' : 'no edge'}`);
        }
      }
    }
    // today's knight, warm skin and brown brows, draws no edge, so its record is unchanged
    assert.ok(!edged.includes('warm/brown'));
    assert.deepEqual(edged, ['fair/blonde', 'fair/silver', 'warm/blonde', 'warm/silver', 'golden/brown', 'golden/auburn', 'golden/blonde', 'golden/silver',
      'tan/brown', 'tan/auburn', 'tan/blonde', 'tan/silver', 'brown/black', 'brown/dark', 'brown/brown', 'brown/auburn', 'brown/blonde', 'brown/silver',
      'deep/black', 'deep/dark', 'deep/brown', 'deep/auburn']);
  });

  test('the pack path clamps drop and bloat into the library\'s ranges, and allocates no new arrays', () => {
    const { KW, K } = load(true), seen = [], draw0 = KW.pack.draw;
    KW.pack.draw = (list, A, V, P, face) => { seen.push([A, V, V[KW.pack.VALUE.drop], V[KW.pack.VALUE.bloat]]); return draw0(list, A, V, P, face); };
    K.draw(at(K, 'idle', 2300, { bloat: 20, crouch: 12, bob: 1 }));
    K.draw(at(K, 'memory_tight', 2300));
    assert.ok(seen.length > 10);
    const [A, V] = seen[0];
    assert.equal(Object.prototype.toString.call(A), '[object Float64Array]');
    assert.equal(Object.prototype.toString.call(V), '[object Float64Array]');
    assert.ok(seen.every(s => s[0] === A && s[1] === V), 'the same two arrays every frame');
    const first = seen.filter(s => s[2] === 40 && s[3] === 60), second = seen.filter(s => s[2] === 5 && s[3] === 30);
    assert.equal(first.length + second.length, seen.length, 'drop 65 and bloat 100 clamped to 40 and 60; drop 5 and bloat 30 unchanged');
    assert.ok(first.length && second.length);
  });

  /* ---- The gear at rest ---------------------------------------------------------------------- */

  test('the blade and the backdrop key name the equipped weapon on the pack path, and the greatsword on the code path', () => {
    const code = PATHS.code(), pack = PATHS.pack();
    assert.deepEqual(plain(code.K.rest.reach()), { from: 34, to: 263, half: 15 });
    assert.deepEqual(plain(pack.K.rest.reach()), { from: 34, to: 263, half: 15 });
    assert.equal(code.K.rest.key('main'), 'code');
    assert.equal(pack.K.rest.key('main'), 'kw.base/main.greatsword');
    assert.equal(pack.K.rest.key('off'), '', 'no shield is equipped');
    // the scenes' backdrop keys carry it
    assert.equal(pack.KW.scenes.house.key({ tv: true }), 'tv|kw.base/main.greatsword');
    assert.equal(code.KW.scenes.house.key({ tv: false }), '|code');
    assert.equal(pack.KW.scenes.smithy.key({ kx: 440.4 }), '440|kw.base/main.greatsword');
    assert.equal(code.KW.scenes.smithy.key({ kx: 440 }), '440|code');
  });

  test('a slot with nothing to show at rest draws nothing, on either path', () => {
    for (const [path_, open] of Object.entries(PATHS)) {
      const { K, log, status } = open();
      assert.equal(status.source, path_);
      for (const slot of ['off', 'legs', 'plume', 'head', 'nothing']) K.rest.draw(slot, 300, 300, 0);
      assert.deepEqual(log, [], path_ === 'pack' ? 'from the base pack' : 'from code');
    }
  });

  test('the pack path draws the gear at rest from what the pack says', () => {
    const a = load(true);
    // a plume colour shows on the resting helmet's small plume, and nothing else changes
    const pink = load(true, [editedPack(p => { p.swatches.plume.red.entries['1'] = '#ab0102'; })]);
    for (const box of [a, pink]) box.K.rest.draw('helmet', 460, 476);
    const diff = a.log.map((l, i) => [l, pink.log[i]]).filter(([x, y]) => x !== y);
    assert.equal(a.log.length, pink.log.length);
    assert.ok(diff.length > 3 && diff.every(([x, y]) => x === 's #ff4a3d' && y === 's #ab0102'));
    // a helmet with no rest view shows nothing on the stool, and one with no plume mount at rest
    // shows no plume
    const none = load(true, [editedPack(p => { delete p.items['helm.open'].rest; })]);
    assert.equal(none.status.source, 'pack');
    none.K.rest.draw('helmet', 460, 476);
    assert.deepEqual(none.log, []);
    const bare = load(true, [editedPack(p => { delete p.items['helm.open'].rest.mounts; })]);
    bare.K.rest.draw('helmet', 460, 476);
    assert.ok(bare.log.length > 0 && bare.log.length < a.log.length);
    assert.equal(bare.log[0], 's #1a1524');
    assert.match(bare.log[1], /^r 4\d\d 420 /, 'the helmet\'s dome is first, 56 above the stool');
    // the colour of the jewel in the guard shows on the pegs
    const jewel = load(true, [editedPack(p => {
      const s = JSON.stringify(p.items['main.greatsword']).split('"@base.r1"').join('"#123456"');
      p.items['main.greatsword'] = JSON.parse(s);
    })]);
    a.log.length = 0;
    for (const box of [a, jewel]) box.K.rest.draw('main', 618, 228, Math.PI / 2);
    const jd = a.log.map((l, i) => [l, jewel.log[i]]).filter(([x, y]) => x !== y);
    assert.equal(a.log.length, jewel.log.length);
    assert.ok(jd.length > 3 && jd.every(([x, y]) => x === 's #ff4a3d' && y === 's #123456'));
  });

  test('a weapon that gives no blade has no hot tip in the smithy', () => {
    const a = load(true), b = load(true, [editedPack(p => { delete p.items['main.greatsword'].blade; })]);
    assert.equal(b.K.rest.reach(), null);
    const drawn = box => { box.log.length = 0; const s = { w: { id: 'updating' }, kx: 440, o: at(box.K, 'updating', 300), strike: false }; box.KW.scenes.smithy.act(300, s); box.KW.scenes.smithy.draw(300, s); return box.log.slice(); };
    const with_ = drawn(a), without = drawn(b);
    assert.ok(with_.includes('s #7a2a1d') && with_.includes('s #fff3a0'));
    assert.ok(!without.includes('s #7a2a1d') && !without.includes('s #8f231d'), 'no hot bands');
    assert.ok(without.length < with_.length);
  });

  test('the gear at rest is drawn with every named value 0, and allocates no new arrays', () => {
    const { KW, K } = load(true), seen = [], draw0 = KW.pack.draw;
    KW.pack.draw = (list, A, V, P, face) => { seen.push([A, V, Array.from(V), face]); return draw0(list, A, V, P, face); };
    K.draw(at(K, 'memory_tight', 2300));
    const knight = seen.length;
    for (let i = 0; i < 2; i++) { K.rest.draw('helmet', 460, 476); K.rest.draw('main', 618, 228, Math.PI / 2); }
    const rest = seen.slice(knight);
    assert.equal(rest.length, 4);
    assert.ok(rest.every(s => s[0] === rest[0][0] && s[1] === rest[0][1]), 'the same two arrays every time');
    assert.ok(rest[0][0] !== seen[0][0] && rest[0][1] !== seen[0][1], 'not the knight\'s own');
    assert.ok(rest.every(s => s[2].every(v => v === 0) && s[3] === undefined));
  });

  /* ---- The rig ------------------------------------------------------------------------------ */
  const { K } = PATHS.code();
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

  test('the carrying grip: the crate is held against the chest by its lower corners, under the arms, clear of the face and below the helmet', () => {
    // The crate is an engine step, so its pixels are the fills made between the pauldrons' list and
    // the next list, the left arm's, on the pack path; the code path draws the same calls, which
    // the call record checks.
    const { KW, K } = PATHS.pack(), lib = KW.pack, seq0 = lib.sequence, draw0 = lib.draw;
    let names = [], i = 0, cur = null, seq = null;
    const px = new Set();
    KW.draw.setCtx(new Proxy({}, {
      set() { return true; },
      get(_, k) {
        if (k === 'fillRect') return (x, y, w, h) => { if (cur !== 'crates') return; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px.add(yy * 4096 + xx); };
        return () => {};
      },
    }));
    const steps = ['crates', 'face', 'drumstick', 'hammer', 'effects'];
    lib.sequence = (mode, helmet) => { seq = seq0(mode, helmet); names = seq.filter(n => !steps.includes(n)); i = 0; return seq; };
    lib.draw = (list, A, V, P, face) => { cur = names[i++]; try { return draw0(list, A, V, P, face); } finally { cur = cur === 'pauldrons' ? 'crates' : null; } };
    let frames = 0;
    for (const helmet of [true, false]) for (const bob of [0, 1]) for (let t = 0; t < 5700; t += 100) {
      px.clear();
      const o = at(K, 'disk_full', t, { helmet, bob }), r = K.rig(o), h = r.anchors.head, L = r.anchors.handL, R = r.anchors.handR, label = `t${t} bob ${bob} helmet ${helmet ? 'on' : 'off'}`;
      K.draw(o);
      assert.equal(r.grip, 'none');
      assert.deepEqual(plain(seq.slice(seq.indexOf('pauldrons'), seq.indexOf('pauldrons') + 3)), ['pauldrons', 'crates', 'armL'], 'after the pauldrons, before the arms');
      assert.ok(px.size > 2000, `${label}: the crate is drawn`);
      let left = Infinity, right = -Infinity, top = Infinity, foot = -Infinity;
      for (const p of px) { const x = p % 4096, y = Math.floor(p / 4096); left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); foot = Math.max(foot, y + 1); }
      // nothing of the crate on the helmet's opening (34 below the head anchor at its foot) or the
      // bare face (47), and nothing above the helmet's top (68 above it)
      assert.ok(top > h[1] + (helmet ? 34 : 47), `${label}: the crate's top, ${top}, is under the face`);
      assert.ok(top > h[1] - 68, `${label}: nothing of the load rises above the helmet`);
      // the hands at its lower corners: each gauntlet, 14 across from its middle, overlaps the
      // crate's side, and lies in its lowest 16 rows
      assert.ok(L[0] < left && L[0] + 14 > left && R[0] >= right && R[0] - 14 < right, `${label}: the hands hold the crate's sides`);
      assert.ok(L[1] > foot - 16 && L[1] < foot && R[1] === L[1], `${label}: the hands are at the crate's lower corners`);
      frames++;
    }
    assert.equal(frames, 228);
  });

  test('the hands and the weapon frame follow the grip', () => {
    // no weapon: the hands hang at the sides
    let r = K.rig(at(K, 'idle', 2300, { sword: false, bloat: 5, bob: 1 }));
    assert.equal(r.grip, 'none');
    assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], [[X - 89, FLOOR - 79], [X + 89, FLOOR - 79]]);
    // the smith's grip: the right hand half way from its offset off the shoulder to its point on the
    // grid, rounded, the tool's frame on it at the act's angle, and the left hand at its point
    r = K.rig(at(K, 'updating', 2300, { sword: false, bloat: 5, bob: 1, tool: { kind: 'hammer', a: 0.75, R: { off: [20, -40], at: [X + 100, FLOOR - 120], pin: 0.5 }, L: { at: [X + 45, FLOOR - 104] } } }));
    assert.equal(r.grip, 'hammer');
    const sh = [X + 54 + 25, FLOOR - 132 + 5], off = [sh[0] + 20, sh[1] - 40];
    const hand = [Math.round(off[0] + (X + 100 - off[0]) * 0.5), Math.round(off[1] + (FLOOR - 120 - off[1]) * 0.5)];
    assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], [[X + 45, FLOOR - 104], hand]);
    assert.deepEqual([...r.anchors.main], [...hand, 0.75]);
    // with no pin, a hand at its point, or off its shoulder; with no left hand given, the left hangs
    // 10 outside its shoulder and 48 below it
    r = K.rig(at(K, 'updating', 2300, { sword: false, tool: { kind: 'hammer', a: 0, R: { off: [20, -40] } } }));
    assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], [[X - 64, FLOOR - 84], [X + 74, FLOOR - 172]]);
    // both hands on the tool (tool2): the left along the tool's frame from the right, rounded
    r = K.rig(at(K, 'idle', 2300, { sword: false, tool: { kind: 'tongs', two: true, a: 1.62, R: { at: [X + 46.4, 420] }, L: { along: 16 } } }));
    assert.equal(r.grip, 'tool2');
    assert.deepEqual([[...r.anchors.handR], [...r.anchors.main]], [[X + 46, 420], [X + 46, 420, 1.62]]);
    assert.deepEqual([...r.anchors.handL], [Math.round(X + 46 + Math.sin(1.62) * 16), Math.round(420 - Math.cos(1.62) * 16)]);
    // the lean: the neck, the shoulders and the head by it, the belt and the hem by half, the hips
    // and the feet not at all
    const still = K.rig(at(K, 'idle', 2300)), A0 = Object.fromEntries(Object.entries(still.anchors).map(([k, v]) => [k, [...v]]));
    const leant = K.rig(at(K, 'idle', 2300, { lean: 7 })).anchors;
    for (const [k, d] of Object.entries({ neck: 7, shoulderL: 7, shoulderR: 7, head: 7, belt: 4, hem: 4, hipL: 0, hipR: 0, footL: 0, footR: 0, root: 0 })) {
      assert.deepEqual([...leant[k]], [A0[k][0] + d, A0[k][1]], k);
    }
    // both hands on the grip, the upper on the side the blade leans to
    for (const dir of [1, -1]) {
      const o = at(K, 'idle', 2300, { bob: 1 }); K.swing(o, 0.42, dir); r = K.rig(o);
      const gx = X - 120 + o.gx * 5, gy = FLOOR - 300 + o.gy * 5 + 5, a = o.wang, sx = Math.sin(a), sy = -Math.cos(a);
      assert.equal(r.grip, 'two');
      assert.deepEqual([...r.anchors.main], [gx, gy, a]);
      const up = [gx + sx * 2, gy + sy * 2], low = [gx - sx * 30, gy - sy * 30];
      assert.deepEqual([[...r.anchors.handL], [...r.anchors.handR]], sx >= 0 ? [low, up] : [up, low], `dir ${dir}`);
    }
  });

  test('the rig fills the same objects every time', () => {
    const r1 = K.rig(at(K, 'idle', 2300)), root = r1.anchors.root, main = r1.anchors.main;
    const r2 = K.rig(at(K, 'attack', 94));
    assert.equal(r1, r2); assert.equal(r2.anchors.root, root); assert.equal(r2.anchors.main, main);
    assert.deepEqual(Object.keys(r2.anchors), [...NAMES, 'handL', 'handR', 'main', 'off']);
    assert.deepEqual(Object.keys(r2.values), ['drop', 'bloat', 'stepL', 'stepR', 'sway', ...DIFFS]);
  });

  /* ---- The arming sword and the heater shield ---------------------------------------------- */

  /* A dev page drawing from the base pack with the look given, as main.js starts it for arm=one. */
  const ONE_LOOK = { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } };
  const withLook = look => { const b = load(true); b.status = b.K.start(b.KW.packText, true, { look }); return b; };

  test('the one-handed grip: the sword hand on the weapon\'s one station, the shield hand where the pose puts it', () => {
    const { K, status } = withLook(ONE_LOOK);
    assert.equal(status.source, 'pack');
    assert.deepEqual(plain(status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), []);
    const o = at(K, 'idle', 2300, { bob: 1 }), r = K.rig(o);
    assert.equal(r.grip, 'one');
    assert.deepEqual([o.gx, o.gy, o.wang, o.fx, o.fy], [37.6, 40.8, 0.3, 20, 38.4], 'the one-handed stance');
    const gx = X - 120 + 37.6 * 5, gy = FLOOR - 300 + 40.8 * 5 + 5;
    assert.deepEqual([...r.anchors.main], [gx, gy, 0.3]);
    assert.deepEqual([...r.anchors.handR], [gx, gy], 'the station is the grip\'s middle');
    assert.deepEqual([...r.anchors.handL], [X - 20, FLOOR - 108 + 5]);
    assert.deepEqual([...r.anchors.off], [...r.anchors.handL]);
    // the attack raises the sword and brings the shield in, with the same tremble
    const a = at(K, 'attack', 94);
    assert.deepEqual([a.gx, a.gy, a.fx, a.fy, a.mark, a.shake], [42, 24.4, 19.6, 37.6, '!', Math.round(Math.sin(94 / 60))]);
    assert.equal(a.wang, 0.2 + Math.sin(94 / 90) * 0.12);
    // the sword put away and the smith's grip are as before
    assert.equal(K.rig(at(K, 'idle', 2300, { sword: false })).grip, 'none');
    assert.equal(K.rig(at(K, 'updating', 2300, { sword: false, tool: { kind: 'hammer', a: 0.5, R: { at: [X + 80, FLOOR - 122] }, L: { at: [X + 45, FLOOR - 104] } } })).grip, 'hammer');
    // The swing keeps the greatsword's angle at the cut, so the swat's hit test holds. The wind-up
    // to the right stands the blade upright over the right shoulder, clear of the face, and the one
    // to the left is the greatsword's; both lie short of the nearest fly (0.35 less 0.15), so no fly
    // is struck before the cut begins.
    for (const dir of [1, -1]) {
      const w = at(K, 'idle', 2300); K.swing(w, 0.3, dir);
      const c = at(K, 'idle', 2300); K.swing(c, 0.55, dir);
      assert.deepEqual([w.wang, c.wang], [dir > 0 ? 0 : 1.0, 2.0 * dir]);
      assert.ok(w.wang * dir < 0.2);
    }
  });

  test('a one-handed weapon with no shield: the free hand hangs at the side', () => {
    const { K, status } = withLook({ items: { main: 'kw.base/main.arming' } });
    assert.equal(status.source, 'pack');
    const r = K.rig(at(K, 'idle', 2300, { bloat: 5, bob: 1 }));
    assert.equal(r.grip, 'one');
    assert.deepEqual([...r.anchors.handL], [X - 89, FLOOR - 79]);
    assert.equal(K.rest.key('off'), '');
  });

  test('the shield is drawn where the order says: in front of the sword arm, behind the sword while the hand is across', () => {
    const { KW, K } = withLook(ONE_LOOK), modes = [], seq0 = KW.pack.sequence;
    KW.pack.sequence = (mode, helmet) => { modes.push(mode); return seq0(mode, helmet); };
    K.draw(at(K, 'idle', 2300));
    for (let q = 0; q <= 1.0001; q += 0.01) { const o = at(K, 'idle', 2300); K.swing(o, q, -1); K.draw(o); }
    assert.equal(modes[0], 'one');
    const crossed = modes.filter(m => m === 'oneCrossed').length;
    assert.ok(crossed > 5 && crossed < 40, crossed + ' crossed frames in the swing to the left');
    assert.deepEqual([...new Set(modes)].sort(), ['one', 'oneCrossed']);
  });

  /* The rule of docs/design.md: no arm is ever drawn over a blade or its guard, nor over the face of
     a shield. Every frame the engine can draw with the weapon held is drawn into a context that
     keeps the pixels each of the look's lists fills: the swing both ways at every hundredth of its
     length and at every odd thousandth from q .451 to .619, where the blade is past level; the
     attack's tremble every 10 ms for two seconds; the goblin's strike on both sides, from contacts
     at q .45, .5, .53 and .55, through its rebound and recovery every 10 ms; the stance of every
     condition that holds the weapon; and the largest bloat. In the order the frame was drawn in,
     neither an arm nor a gauntlet drawn after the weapon may fill a pixel of its blade or guard, which are the
     weapon's pixels at least 17 along the frame from the grip's middle, where both swords' guards
     begin; and neither may one drawn after the shield fill a pixel of the shield. Returns the
     breaches, as text. */
  const ENGINE_STEPS = ['crates', 'face', 'drumstick', 'hammer', 'effects'];
  const FROM = 17;
  /* The engine's foe player, from engine.js run in the sandbox of b beside the knight it drives. A
     document that hands out empty canvases is all the engine needs to load. */
  const foeOf = b => {
    b.box.document = { createElement: () => ({ getContext: () => ({}) }) };
    for (const f of ['js/state.js', 'js/engine.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), b.box, { filename: f });
    return b.KW.engine.foe;
  };
  function breaches(look) {
    const b = withLook(look), { KW, K } = b, F = foeOf(b), lib = KW.pack, seq0 = lib.sequence, draw0 = lib.draw;
    let names = [], i = 0, cur = null, seq = null;
    const px = {};
    KW.draw.setCtx(new Proxy({}, {
      set() { return true; },
      get(_, k) {
        if (k === 'fillRect') return (x, y, w, h) => { if (!cur) return; const set = px[cur] || (px[cur] = new Set()); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set.add(yy * 4096 + xx); };
        return () => {};
      },
    }));
    lib.sequence = (mode, helmet) => { seq = seq0(mode, helmet); names = seq.filter(n => !ENGINE_STEPS.includes(n)); i = 0; return seq; };
    lib.draw = (list, A, V, P, face) => { cur = names[i++]; try { return draw0(list, A, V, P, face); } finally { cur = null; } };
    const blade = K.rest.reach(), found = [];
    const check = (label, o) => {
      for (const k of Object.keys(px)) delete px[k];
      K.draw(o);
      const m = K.rig(o).anchors.main, sx = Math.sin(m[2]), sy = -Math.cos(m[2]);
      const after = n => (seq.includes(n) ? seq.slice(seq.indexOf(n) + 1) : []);
      const hit = (a, b, keep) => { let n = 0; if (a && b) for (const p of a) if (b.has(p) && (!keep || keep(p))) n++; return n; };
      const steel = p => { const x = (p % 4096) + 0.5, y = Math.floor(p / 4096) + 0.5; return (x - m[0]) * sx + (y - m[1]) * sy >= FROM; };
      for (const n of after('main')) if (n.startsWith('arm') || n.startsWith('gaunt')) { const c = hit(px[n], px.main, steel); if (c) found.push(`${label}: ${n} over the blade or guard, ${c} pixels`); }
      for (const n of after('off')) if (n.startsWith('arm') || n.startsWith('gaunt')) { const c = hit(px[n], px.off); if (c) found.push(`${label}: ${n} over the shield, ${c} pixels`); }
    };
    assert.ok(blade && blade.from === 34, 'both swords\' blades start at 34');
    for (const dir of [1, -1]) for (let k = 0; k <= 100; k++) { const o = at(K, 'idle', 2300); K.swing(o, k / 100, dir); check(`swing ${dir} q${k / 100}`, o); }
    // the end of each cut, where the blade is past level, at every odd thousandth
    for (const dir of [1, -1]) for (let k = 451; k <= 620; k += 2) { const o = at(K, 'idle', 2300); K.swing(o, k / 1000, dir); check(`swing ${dir} q${k / 1000}`, o); }
    for (let t = 0; t < 2000; t += 10) check(`attack t${t}`, at(K, 'attack', t));
    // the strike: the blade stopped where it meets the goblin, bounced back and returned, the knight
    // still (no bob) as the engine holds it
    const S = F.FOE.strike;
    for (const side of [1, -1]) for (const q of [0.45, 0.5, 0.53, 0.55]) {
      const pl = { side, q, hit: S.at + Math.round(q * S.dur) };
      for (let r = 0; r <= S.rebound + S.recover; r += 10) { const o = at(K, 'idle', 2300, { bob: 0 }); F.strike(o, pl.hit + r, pl); check(`strike ${side} q${q} +${r} ms`, o); }
    }
    for (const id of ['idle', 'wan_down', 'device_down', 'memory_tight', 'ssh_session', 'cpu_hot', 'streaming', 'night']) check(id, at(K, id, 2300));
    check('bloat 6', at(K, 'memory_tight', 2300, { bloat: 6 }));
    return found;
  }

  test('no arm is drawn over a blade or its guard, frame by frame: the greatsword', () => {
    assert.deepEqual(breaches({}), []);
  });
  test('no arm is drawn over a blade, its guard or the shield, frame by frame: the arming sword and the heater shield', () => {
    assert.deepEqual(breaches(ONE_LOOK), []);
  });
  test('no arm is drawn over a blade or its guard, frame by frame: the arming sword alone', () => {
    assert.deepEqual(breaches({ items: { main: 'kw.base/main.arming' } }), []);
  });

  /* The blade passes in front of the face, and only for a moment (docs/design.md). Each frame is
     drawn as breaches() draws it, and the steel, the weapon's pixels at least FROM along its frame,
     that lies on the head as drawn is counted in three boxes from the head anchor: the eyes (the
     brows and the eyes, x -37 to 37, y -21 to 12), the mouth (y 12 to 23) and the chin (the helmet's
     rim or the bare chin, x -46 to 46, y 23 to 50). Returns the counts for each frame made. */
  function steelOnHead(look, frames) {
    const b = withLook(look), { KW, K } = b, lib = KW.pack, seq0 = lib.sequence, draw0 = lib.draw;
    let names = [], i = 0, cur = null;
    const px = {};
    KW.draw.setCtx(new Proxy({}, {
      set() { return true; },
      get(_, k) {
        if (k === 'fillRect') return (x, y, w, h) => { if (!cur) return; const set = px[cur] || (px[cur] = new Set()); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set.add(yy * 4096 + xx); };
        return () => {};
      },
    }));
    lib.sequence = (mode, helmet) => { const seq = seq0(mode, helmet); names = seq.filter(n => !ENGINE_STEPS.includes(n)); i = 0; return seq; };
    lib.draw = (list, A, V, P, face) => { cur = names[i++]; try { return draw0(list, A, V, P, face); } finally { cur = null; } };
    return frames.map(make => {
      for (const k of Object.keys(px)) delete px[k];
      const o = make(K); K.draw(o);
      const r = K.rig(o), [hx, hy] = r.anchors.head, m = r.anchors.main, sx = Math.sin(m[2]), sy = -Math.cos(m[2]), head = px.headOn || px.headOff || new Set();
      const n = { eyes: 0, mouth: 0, chin: 0 };
      for (const p of px.main || []) {
        if (!head.has(p)) continue;
        const x = p % 4096, y = Math.floor(p / 4096), dx = x - hx, dy = y - hy;
        if ((x + 0.5 - m[0]) * sx + (y + 0.5 - m[1]) * sy < FROM) continue;
        if (dx >= -37 && dx < 37 && dy >= -21 && dy < 12) n.eyes++;
        else if (dx >= -37 && dx < 37 && dy >= 12 && dy < 23) n.mouth++;
        else if (dx >= -46 && dx < 46 && dy >= 23 && dy < 50) n.chin++;
      }
      return n;
    });
  }
  /* The swing to the left turns the blade from one side of the body to the other, so it must pass
     the face; it does so quickly and comes back low. Over the whole swing, every 0.004 of it, the
     steel lies on the eyes for under 50 ms of the 900 with the sword and shield, and under 70 with
     the greatsword (the swings before this one: 189 and 225). */
  test('the swing to the left keeps the steel off the eyes but for a moment', () => {
    for (const [look, most] of [[ONE_LOOK, 50], [{}, 70]]) {
      const frames = [];
      for (let k = 0; k <= 250; k++) frames.push(K => { const o = at(K, 'idle', 2300); K.swing(o, k / 250, -1); return o; });
      const ms = steelOnHead(look, frames).filter(n => n.eyes).length * 0.004 * 900;
      assert.ok(ms > 0 && ms < most, `${look.items ? 'sword and shield' : 'greatsword'}: ${ms.toFixed(1)} ms on the eyes`);
    }
  });
  /* The two-handed wind-up holds the hands out past the far shoulder with the blade laid back, so
     the guard's quillons stay off the chin: from q .25 to the cut, both ways, on every build, no
     steel lies on the face or the chin. */
  test('the two-handed wind-up keeps the guard off the face and the chin, on every build', () => {
    for (const build of ['build.a', 'build.b', 'build.c']) for (const dir of [1, -1]) {
      const qs = []; for (let k = 250; k <= 300; k += 5) qs.push(k / 1000);
      const got = steelOnHead({ build: 'kw.base/' + build }, qs.map(q => K => { const o = at(K, 'idle', 2300); K.swing(o, q, dir); return o; }));
      got.forEach((n, j) => assert.deepEqual([n.eyes, n.mouth, n.chin], [0, 0, 0], `${build} ${dir > 0 ? 'right' : 'left'} q${qs[j]}`));
    }
  });

  /* ---- The three builds -------------------------------------------------------------------- */

  /* The base pack's builds, by the names the settings screen shows, and each weapon's look. Classic
     (build.a) is the present knight; Broad (build.b) and Slim (build.c) are drawn from the same
     items on their own measurements. */
  const BUILD_NAMES = { 'build.a': 'Classic', 'build.b': 'Broad', 'build.c': 'Slim' };
  const OTHER_BUILDS = ['build.b', 'build.c'];
  const GRIPS = { greatsword: {}, 'sword and shield': ONE_LOOK.items };
  const buildLook = (b, items) => ({ build: 'kw.base/' + b, items: Object.keys(items || {}).length ? items : undefined });
  const BUILD_M = JSON.parse(UNSIGNED).pack.builds;

  test('Classic chosen by name draws the stored calls in every pose, from the base pack', () => {
    const b = withLook(buildLook('build.a'));
    assert.equal(b.status.source, 'pack');
    assert.deepEqual(plain(b.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), []);
    const stored = JSON.parse(fs.readFileSync(CALLS, 'utf8')).poses;
    for (const [name, fn] of POSES(b.K, b.KW.scenes)) {
      b.log.length = 0; fn();
      assert.equal(sha(b.log.map(codeSpelling).join('\n')), stored[name].sha256, name);
    }
  });

  for (const bid of OTHER_BUILDS) for (const [grip, items] of Object.entries(GRIPS)) {
    test(`${BUILD_NAMES[bid]} with the ${grip}: every pose and swing frame draws without a throw, each frame within the look's cost`, () => {
      const look = buildLook(bid, items), b = withLook(look), lib = b.KW.pack, draw0 = lib.draw;
      assert.equal(b.status.source, 'pack');
      assert.deepEqual(plain(b.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), [], 'the build and the weapon are drawn as chosen');
      const L = PK.resolve([PK.read(UNSIGNED, { allowUnsigned: true })], look);
      assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost, `${L.shapes} shapes, cost ${L.cost}`);
      // the fills the look's lists make in a frame, which the cost bounds
      let fills = 0, inList = false;
      const log = b.log;
      lib.draw = (...a) => { inList = true; try { return draw0(...a); } finally { inList = false; } };
      const count = () => log.reduce((n, l) => n + (l.startsWith('r ') ? 1 : 0), 0);
      const frames = POSES(b.K, b.KW.scenes);
      for (const dir of [1, -1]) for (let k = 0; k <= 20; k++) frames.push([`swing ${dir} q${k / 20}`, () => { const o = at(b.K, 'idle', 2300); b.K.swing(o, k / 20, dir); b.K.draw(o); }]);
      for (let t = 0; t < 1000; t += 100) frames.push([`attack t${t}`, () => b.K.draw(at(b.K, 'attack', t))]);
      for (const [name, fn] of frames) {
        log.length = 0; fills = 0;
        const fr = log.push; log.push = (...ls) => { if (inList) for (const l of ls) if (l.startsWith('r ')) fills++; return fr.apply(log, ls); };
        fn();
        log.push = fr;
        assert.equal(b.K.source, 'pack', `${name}: nothing threw`);
        assert.deepEqual(plain(b.K.status.refused), [], name);
        assert.ok(fills <= L.cost, `${name}: ${fills} fills, more than the cost of ${L.cost}`);
        assert.ok(!log.some(l => /NaN|undefined/.test(l)), `${name}: no broken number or colour`);
        assert.ok(count() > 0 || /^speech|at rest|painted/.test(name), `${name}: draws something`);
      }
      // and it is not Classic: the idle stance draws other calls
      log.length = 0; b.K.draw(at(b.K, 'idle', 2300));
      const mine = sha(log.map(codeSpelling).join('\n')), stored = JSON.parse(fs.readFileSync(CALLS, 'utf8')).poses['idle t2300'].sha256;
      assert.notEqual(mine, stored);
    });
  }

  test('on every build both hands stay on the grip through every frame of both swings, the attack and the strike, and hang below the shoulders without a weapon', () => {
    for (const bid of Object.keys(BUILD_NAMES)) for (const [grip, items] of Object.entries(GRIPS)) {
      const look = buildLook(bid, items), b = withLook(look), { K } = b, M = BUILD_M[bid].m, dHt = M.height - 132, dSh = M.shoulder - 54;
      const cb = withLook(buildLook('build.a', items)), c = cb.K, what = `${BUILD_NAMES[bid]}, ${grip}`;
      const F = foeOf(b), Fc = foeOf(cb), S = F.FOE.strike, foe = new Map([[K, F], [c, Fc]]);
      const one = !!items.main;
      const frames = [];
      // the goblin's strike on both sides, through its rebound and recovery, as in breaches()
      for (const side of [1, -1]) for (const q of [0.45, 0.55]) {
        const pl = { side, q, hit: S.at + Math.round(q * S.dur) };
        for (let r = -400; r <= S.rebound + S.recover; r += 20) frames.push([`strike ${side} q${q} ${r} ms`, K2 => { const o = at(K2, 'idle', 2300, { bob: 0 }); foe.get(K2).strike(o, pl.hit + r, pl); return o; }]);
      }
      for (const dir of [1, -1]) for (let k = 0; k <= 100; k++) frames.push([`swing ${dir} q${k / 100}`, K2 => { const o = at(K2, 'idle', 2300); K2.swing(o, k / 100, dir); return o; }]);
      for (let t = 0; t < 2000; t += 20) frames.push([`attack t${t}`, K2 => at(K2, 'attack', t)]);
      for (const id of ['idle', 'memory_tight', 'cpu_hot', 'wan_down', 'night']) frames.push([id, K2 => at(K2, id, 2300)]);
      for (const [name, make] of frames) {
        const o = make(K), r = K.rig(o), m = [...r.anchors.main], L = [...r.anchors.handL], R = [...r.anchors.handR];
        const sx = Math.sin(m[2]), sy = -Math.cos(m[2]);
        // along the frame and across it, from the grip's middle
        const on = h => [(h[0] - m[0]) * sx + (h[1] - m[1]) * sy, Math.abs((h[0] - m[0]) * sy - (h[1] - m[1]) * sx)];
        assert.equal(r.grip, one ? 'one' : 'two', `${what} ${name}`);
        if (one) {
          assert.deepEqual(R, [m[0], m[1]], `${what} ${name}: the sword hand on the grip`);
          const d = ((o.bob || 0) + (o.crouch || 0)) * 5;
          assert.deepEqual(L, [Math.round(o.x) + (o.shake || 0) * 4 - 120 + o.fx * 5, FLOOR - 300 + o.fy * 5 + d - dHt], `${what} ${name}: the shield hand where the pose puts it, on this build's shoulder line`);
        } else for (const [h, side] of [[L, 'left'], [R, 'right']]) {
          const [along, across] = on(h);
          assert.ok(across < 1e-9 && along >= -30 - 1e-9 && along <= 2 + 1e-9, `${what} ${name}: the ${side} hand ${along.toFixed(2)} along the grip, ${across.toFixed(2)} off it`);
        }
        // the weapon is held where Classic holds it, raised or lowered with the shoulders
        const ca = [...c.rig(make(c)).anchors.main];
        assert.deepEqual([m[0], m[1] - ca[1], m[2]], [ca[0], 0 - dHt, ca[2]], `${what} ${name}: the grip on this build's shoulder line`);
      }
      // no weapon: each hand 10 outside its shoulder and 48 below it, on every build, bloated or not
      for (const over of [{ sword: false }, { sword: false, bloat: 5, bob: 1 }]) {
        const r = K.rig(at(K, 'idle', 2300, over)), A = r.anchors;
        assert.deepEqual([A.handL[0] - A.shoulderL[0], A.handL[1] - A.shoulderL[1], A.handR[0] - A.shoulderR[0], A.handR[1] - A.shoulderR[1]], [-10, 48, 10, 48], `${what} ${JSON.stringify(over)}`);
        assert.equal(A.shoulderR[0] - A.root[0], 54 + dSh + (over.bloat || 0) * 5);
      }
      // the smith's hammer at its blow works at the anvil, which stands in the scene: the hands the
      // act pins to the grid do not move
      const blow = { sword: false, tool: { kind: 'hammer', a: 1.66, R: { off: [36, -16], at: [X + 54, FLOOR - 147], pin: 1 }, L: { at: [X + 45, FLOOR - 104] } } };
      const hb = K.rig(at(K, 'updating', 2300, blow)).anchors, hc = c.rig(at(c, 'updating', 2300, blow)).anchors;
      assert.deepEqual([[...hb.handL], [...hb.handR], [...hb.main]], [[...hc.handL], [...hc.handR], [...hc.main]], `${what}: the hammer`);
    }
  });

  /* The smith's three acts (scenes/smithy.js) on every build, with the greatsword, the arming sword
     and the heater shield, and the mace and the kite shield on the anvil. At the blow the hammer's
     face meets the top edge of the weapon on the anvil 98 past the middle of its grip, where the act
     aims it (the point 22 across the head's end, which lays its outline on the edge), within the
     pixel the hand is rounded to, and the left hand holds the grip. Every 10 ms of the three acts:
     the face is the box from 46 left of the head anchor to 46 right of it, from 60 above it to 44
     below (the chin line); a gauntlet is 14 by 13 either side of its hand. At the hammer and the
     bellows no gauntlet meets the face; in the quench, which holds the blank up under the chin, no
     hand rises past 4 above the chin line, nothing of the tongs' jaws or the blank lies in the face,
     and the blank's point, while it is out of the water, dips at most 12 below the floor line. */
  test('the smith\'s acts: the hammer\'s face on the blade at the blow, and nothing over the face, on every build', () => {
    const LOOKS = { greatsword: {}, 'sword and shield': ONE_LOOK.items, mace: { main: 'kw.base/main.mace', off: 'kw.base/off.kite' } };
    let frames = 0;
    for (const bid of Object.keys(BUILD_NAMES)) for (const [grip, items] of Object.entries(LOOKS)) {
      const b = withLook(buildLook(bid, items)), K = b.K, S = b.KW.scenes.smithy, what = `${BUILD_NAMES[bid]}, ${grip}`;
      assert.equal(b.status.source, 'pack', what);
      const R = S.rests.anvil, half = K.rest.reach().half, Hm = K.tool.hammer, G = K.tool.tongs, B = K.tool.blank;
      for (const t of [0, 1400, 2800]) {
        const o = at(K, 'updating', t, { sword: false, helmet: false }); smith(S, o, 'updating', t);
        const r = K.rig(o), m = r.anchors.main, ux = Math.sin(m[2]), uy = -Math.cos(m[2]), nx = Math.cos(m[2]), ny = Math.sin(m[2]);
        const face = [m[0] + ux * Hm.handle + nx * (Hm.face + 2), m[1] + uy * Hm.handle + ny * (Hm.face + 2)];
        assert.ok(Math.abs(face[0] - (X + R.x + 98)) < 1 && Math.abs(face[1] - (R.y - half)) < 1, `${what} t${t}: the face at ${face}`);
        assert.deepEqual([...r.anchors.handL], [X + R.x - 5, R.y + 1], `${what} t${t}: the left hand on the grip`);
      }
      for (const [id, until] of [['updating', 1400], ['idle', 14400], ['cpu_hot', 630]]) for (let t = 0; t < until; t += 10) {
        const o = at(K, id, t, { sword: false, helmet: false }); smith(S, o, id, t);
        const r = K.rig(o), [hx, hy] = r.anchors.head, fb = [hx - 46, hy - 60, hx + 46, hy + 44], label = `${what}, ${id} t${t}`;
        for (const h of [r.anchors.handL, r.anchors.handR]) {
          if (id === 'idle') assert.ok(h[1] >= hy + 40, `${label}: a hand at ${h}, above the chin line under the head at ${hy}`);
          else assert.ok(!meets([h[0] - 14, h[1] - 13, h[0] + 14, h[1] + 13], fb), `${label}: a gauntlet at ${h} on the face`);
        }
        if (id === 'idle') {
          const m = r.anchors.main, ux = Math.sin(m[2]), uy = -Math.cos(m[2]);
          for (let k = 0; k <= G.len + B.len; k += 2) {
            const px = m[0] + ux * k, py = m[1] + uy * k;
            assert.ok(!(px > fb[0] && px < fb[2] && py > fb[1] && py < fb[3]), `${label}: the tongs or the blank ${k} along, on the face`);
          }
          if (o.tool.cut == null) assert.ok(m[1] + uy * (G.len + B.len) <= FLOOR + 12, `${label}: the blank's point below the floor`);
        }
        frames++;
      }
    }
    assert.equal(frames, 9 * (140 + 1440 + 63));
  });

  for (const bid of OTHER_BUILDS) for (const [grip, items] of Object.entries(GRIPS)) {
    test(`no arm is drawn over a blade, its guard or the shield, frame by frame: ${BUILD_NAMES[bid]} with the ${grip}`, () => {
      assert.deepEqual(breaches(buildLook(bid, items)), []);
    });
  }

  test('the gear at rest with the arming sword: the pegs under its blade, the shield on the wall, the keys', () => {
    const b = withLook(ONE_LOOK), H = b.KW.scenes.house, S = b.KW.scenes.smithy;
    assert.deepEqual(plain(b.K.rest.reach()), { from: 34, to: 175, half: 10 });
    assert.equal(b.K.rest.key('off'), 'kw.base/off.heater');
    assert.equal(H.key({ tv: false }), '|kw.base/main.arming|kw.base/off.heater');
    assert.equal(S.key({ kx: 440 }), '440|kw.base/main.arming|kw.base/off.heater');
    assert.deepEqual(plain(H.rests.wall), { kind: 'hang', x: 844, y: 164, w: 100, h: 140 });
    assert.deepEqual(plain(S.rests.wall), { kind: 'hang', x: 145, y: 312, w: 100, h: 132 });
    // the shield's rest view on the house's wall: the strap first, from the nail
    b.log.length = 0;
    b.K.rest.draw('off', 844, 164);
    assert.ok(b.log.length > 50);
    assert.equal(b.log[0], 's #1a1524');
    // the pegs: 28 past where the blade starts and 45 short of its point
    b.log.length = 0; H.paint({ tv: false });
    // each peg's outline is 14 wide on its straight rows, from 7 left of the peg's middle
    const pegs = b.log.filter(l => /^r \d+ 254 14 1$/.test(l)).map(l => +l.split(' ')[1] + 7);
    assert.deepEqual([...new Set(pegs)], [618 + 34 + 28, 618 + 175 - 45]);
    // the shield clears the sword's point on the pegs
    const shield = [844 - 44, 844 + 44];
    assert.ok(618 + 180 < shield[0], 'clear of the sword\'s point');
  });

  /* The box of everything drawn since the log was last emptied, from its fillRects. */
  const drawnBox = log => {
    let b = null;
    for (const l of log) {
      const m = /^r (-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)$/.exec(l);
      if (!m) continue;
      const [x, y, w, h] = m.slice(1).map(Number);
      b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + w), Math.max(b[3], y + h)] : [x, y, x + w, y + h];
    }
    return b;
  };
  const meets = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  test('the camera at the house\'s h2 and its question mark clear the gear on the wall, the window and the knight', () => {
    for (const look of [{}, ONE_LOOK, ...OTHER_BUILDS.map(bid => buildLook(bid)), ...OTHER_BUILDS.map(bid => buildLook(bid, ONE_LOOK.items))]) {
      const b = withLook(look), H = b.KW.scenes.house, P = b.KW.props, h2 = H.places.h2, tag = (look.items ? 'sword and shield' : 'greatsword') + (look.build ? ', ' + BUILD_NAMES[look.build.slice(8)] : '');
      const take = f => { b.log.length = 0; f(); return drawnBox(b.log); };
      const cam = [true, false].map(ok => take(() => P.KINDS.camera.draw(h2.x, h2.y, 2300, ok, 'still')));
      const mark = take(() => b.KW.sprites.mark(h2.x, h2.y - P.KINDS.camera.mark, '?'));
      const camera = [...cam, mark];
      const gear = [['the weapon on the pegs', take(() => b.K.rest.draw('main', H.rests.pegs.x, H.rests.pegs.y, H.rests.pegs.a))],
        ['the shield on the wall', take(() => b.K.rest.draw('off', H.rests.wall.x, H.rests.wall.y))], ['the window', [224, 192, 376, 328]]];
      // the knight at every spot of the house's rounds, helmet off as indoors and on as h=on gives
      for (const r of H.rounds) for (const helmet of [false, true]) for (const t of [0, 900]) {
        gear.push([`the knight at ${r.x}, helmet ${helmet ? 'on' : 'off'}`, take(() => b.K.draw(at(b.K, 'idle', t, { x: r.x * 5, sword: false, helmet })))]);
      }
      for (const [what, box] of gear) if (box) for (const c of camera) assert.ok(!meets(c, box), `${tag}: h2 meets ${what}`);
      assert.ok(cam.every(c => c[2] <= 960), `${tag}: the camera stays on the grid`);
    }
  });

  /* ---- The free items of 1.4.0 ------------------------------------------------------------------
     The checks above for the weapons, shields, sleeves and gloves the base pack gained in 1.4.0, on
     the build KNIGHT_PART names, and every free item drawn in every pose there. Each build runs in a
     process of its own (tests/web/knight-free-classic.test.js, -broad and -slim). */
  const FREE_BUILD = (/^free:(build\.[abc])$/.exec(PART) || [])[1];
  if (FREE_BUILD) {
    const KB = id => 'kw.base/' + id, FB = BUILD_NAMES[FREE_BUILD], LIB = [PK.read(UNSIGNED, { allowUnsigned: true })];
    const look = items => ({ build: KB(FREE_BUILD), items });
    const MAIL = { arms: KB('arms.mail'), gauntlets: KB('gauntlets.mail') }, PADDED = { arms: KB('arms.padded'), gauntlets: KB('gauntlets.leather') };
    /* Every new weapon with every shield it may carry, in plate; and each new kind of sleeve and
       glove with a two-handed and a one-handed weapon, since the gauntlets are drawn after the
       weapon in every grip and the sword arm after the shield. */
    const KITS = {
      'the longsword': { main: KB('main.longsword') },
      'the mace alone': { main: KB('main.mace') },
      'the mace and the round shield': { main: KB('main.mace'), off: KB('off.round') },
      'the mace and the kite shield': { main: KB('main.mace'), off: KB('off.kite') },
      'the arming sword and the round shield': { main: KB('main.arming'), off: KB('off.round') },
      'the arming sword and the kite shield': { main: KB('main.arming'), off: KB('off.kite') },
      'the greatsword in mail sleeves and mittens': Object.assign({ main: KB('main.greatsword') }, MAIL),
      'the longsword in padded sleeves and leather gloves': Object.assign({ main: KB('main.longsword') }, PADDED),
      'the arming sword and the heater shield in padded sleeves and leather gloves': Object.assign({ main: KB('main.arming'), off: KB('off.heater') }, PADDED),
      'the mace and the kite shield in mail sleeves and mittens': Object.assign({ main: KB('main.mace'), off: KB('off.kite') }, MAIL)
    };
    for (const [what, items] of Object.entries(KITS)) {
      freeTest(`no arm is drawn over a blade, its guard or the shield, frame by frame: ${FB} with ${what}`, () => {
        const b = withLook(look(items));
        assert.deepEqual(plain(b.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), [], 'drawn as chosen');
        assert.deepEqual(breaches(look(items)), []);
      });
    }

    /* Each free item in every pose of the call record, both swings and the attack: no throw, no
       fallback, no broken number, within the look's cost. The items take the greatsword and the mace
       with the kite shield in turn (a shield the mace); the painted house and smithy, whose backdrops
       show only the weapon and the shield, are drawn for those two slots alone. */
    const FREE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-free-items.json'), 'utf8')).items;
    freeTest(`${FB}: every free item draws in every pose and swing frame without a throw, each frame within the look's cost`, () => {
      let n = 0;
      for (const [i, id] of Object.keys(FREE).entries()) {
        const slot = FREE[id].slot, kits = slot === 'main' ? [{}] : slot === 'off' ? [{ main: KB('main.mace') }] : [i % 2 ? { main: KB('main.mace'), off: KB('off.kite') } : {}];
        for (const kit of kits) {
          const L0 = look(Object.assign({}, kit, { [slot]: KB(id) })), b = withLook(L0), lib = b.KW.pack, draw0 = lib.draw, log = b.log;
          const what = `${FB}, ${id}${kit.main ? ' with ' + kit.main.slice(8) : ''}`;
          assert.equal(b.status.source, 'pack', what);
          assert.deepEqual(plain(b.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), [], what);
          const L = PK.resolve(LIB, L0);
          assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost, `${what}: ${L.shapes} shapes, cost ${L.cost}`);
          let fills = 0, inList = false;
          lib.draw = (...a) => { inList = true; try { return draw0(...a); } finally { inList = false; } };
          const frames = POSES(b.K, b.KW.scenes).filter(([name]) => slot === 'main' || slot === 'off' || !/painted/.test(name));
          for (const dir of [1, -1]) for (let k = 0; k <= 20; k++) frames.push([`swing ${dir} q${k / 20}`, () => { const o = at(b.K, 'idle', 2300); b.K.swing(o, k / 20, dir); b.K.draw(o); }]);
          for (let t = 0; t < 1000; t += 100) frames.push([`attack t${t}`, () => b.K.draw(at(b.K, 'attack', t))]);
          for (const [name, fn] of frames) {
            log.length = 0; fills = 0;
            const fr = log.push; log.push = (...ls) => { if (inList) for (const l of ls) if (l.startsWith('r ')) fills++; return fr.apply(log, ls); };
            fn();
            log.push = fr;
            assert.equal(b.K.source, 'pack', `${what} ${name}: nothing threw`);
            assert.deepEqual(plain(b.K.status.refused), [], `${what} ${name}`);
            assert.ok(fills <= L.cost, `${what} ${name}: ${fills} fills, more than the cost of ${L.cost}`);
            assert.ok(!log.some(l => /NaN|undefined/.test(l)), `${what} ${name}: no broken number or colour`);
          }
          n++;
        }
      }
      assert.equal(n, 25);
    });

    /* The poses belong to the engine, not to the weapon: the longsword is held exactly where the
       greatsword is, and the mace where the arming sword is, in every frame, since each has the same
       stations along its grip. */
    freeTest(`${FB}: the longsword and the mace are held as the greatsword and the arming sword are, frame by frame`, () => {
      for (const [mine, theirs, off] of [['main.longsword', 'main.greatsword'], ['main.mace', 'main.arming', 'off.kite']]) {
        const extra = off ? { off: KB(off) } : {};
        const a = withLook(look(Object.assign({ main: KB(mine) }, extra))).K, c = withLook(look(Object.assign({ main: KB(theirs) }, extra))).K;
        const frames = [];
        for (const dir of [1, -1]) for (let k = 0; k <= 100; k++) frames.push(K2 => { const o = at(K2, 'idle', 2300); K2.swing(o, k / 100, dir); return o; });
        for (let t = 0; t < 2000; t += 50) frames.push(K2 => at(K2, 'attack', t));
        for (const id of ['idle', 'memory_tight', 'cpu_hot', 'wan_down', 'night', 'updating']) frames.push(K2 => at(K2, id, 2300));
        for (const make of frames) {
          const ra = a.rig(make(a)), rc = c.rig(make(c));
          assert.equal(ra.grip, rc.grip, mine);
          for (const k of ['main', 'handL', 'handR', 'off']) assert.deepEqual([...ra.anchors[k]], [...rc.anchors[k]], `${mine}: ${k}`);
        }
      }
    });

    /* The smithy heats the mace's head as it heats a blade: its blade field names the haft and the
       head, 34 to 136 along the frame, so the hot tip glows on the head. */
    freeTest(`${FB}: the mace's head glows on the anvil`, () => {
      const mace = withLook(look({ main: KB('main.mace'), off: KB('off.kite') })), sword = withLook(look({ main: KB('main.arming'), off: KB('off.kite') }));
      assert.deepEqual(plain(mace.K.rest.reach()), { from: 34, to: 136, half: 16 });
      assert.equal(mace.K.rest.key('main'), 'kw.base/main.mace');
      assert.equal(mace.K.rest.key('off'), 'kw.base/off.kite');
      assert.equal(mace.KW.scenes.smithy.key({ kx: 440 }), '440|kw.base/main.mace|kw.base/off.kite');
      const drawn = box => { box.log.length = 0; const s = { w: { id: 'updating' }, kx: 440, o: at(box.K, 'updating', 300), strike: false }; box.KW.scenes.smithy.act(300, s); box.KW.scenes.smithy.draw(300, s); return box.log.slice(); };
      const hot = drawn(mace), cold = drawn(sword);
      assert.ok(hot.includes('s #7a2a1d') && hot.includes('s #fff3a0'), 'the hot bands and the glowing point');
      assert.notDeepEqual(hot, cold, 'the glow follows the mace\'s head, not the sword\'s point');
    });

    /* The crossbow of 1.5.0, which fires: every pose of the call record, the aim and fire() both ways,
       and the attack, with no throw, no fallback and no broken number, each frame within the look's
       cost; slung on the back when put away; and keyed into the house's and the smithy's backdrops,
       on the anvil with no glow, since it has no blade. The barrel check is in fire-barrel.test.js,
       the acts in fire-acts.test.js. */
    freeTest(`${FB}: the crossbow draws in every pose, aimed and fired, within the look's cost, and lies on the anvil with no glow`, () => {
      const L0 = look({ main: KB('main.crossbow') }), b = withLook(L0), lib = b.KW.pack, draw0 = lib.draw, log = b.log, L = PK.resolve(LIB, L0);
      assert.deepEqual(plain(b.status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), [], 'drawn as chosen');
      assert.equal(b.K.fired().use, 'fire');
      assert.deepEqual(plain(b.K.rest.reach()), { from: 54, to: 96, half: 8 });
      let fills = 0, inList = false;
      lib.draw = (...a) => { inList = true; try { return draw0(...a); } finally { inList = false; } };
      const frames = POSES(b.K, b.KW.scenes);
      for (const dir of [1, -1]) for (let k = 0; k <= 20; k++) frames.push([`fire ${dir} q${k / 20}`, () => { const o = at(b.K, 'idle', 2300); b.K.fire(o, k / 20, dir, [X + dir * 300, FLOOR - 125]); b.K.draw(o); }]);
      for (let t = 0; t < 1000; t += 100) frames.push([`attack t${t}`, () => b.K.draw(at(b.K, 'attack', t))]);
      frames.push(['slung', () => b.K.draw(at(b.K, 'disk_full', 2300, { sword: false, stowed: true }))]);
      for (const [name, fn] of frames) {
        log.length = 0; fills = 0;
        const fr = log.push; log.push = (...ls) => { if (inList) for (const l of ls) if (l.startsWith('r ')) fills++; return fr.apply(log, ls); };
        fn();
        log.push = fr;
        assert.equal(b.K.source, 'pack', `${name}: nothing threw`);
        assert.deepEqual(plain(b.K.status.refused), [], name);
        assert.ok(fills <= L.cost, `${name}: ${fills} fills, more than the cost of ${L.cost}`);
        assert.ok(!log.some(l => /NaN|undefined/.test(l)), `${name}: no broken number or colour`);
      }
      lib.draw = draw0;
      assert.equal(b.K.rest.key('main'), 'kw.base/main.crossbow');
      assert.equal(b.KW.scenes.smithy.key({ kx: 440 }), '440|kw.base/main.crossbow');
      b.log.length = 0;
      const s = { w: { id: 'updating' }, kx: 440, o: at(b.K, 'updating', 300), strike: false };
      b.KW.scenes.smithy.act(300, s); b.KW.scenes.smithy.draw(300, s);
      assert.ok(!b.log.includes('s #7a2a1d'), 'no hot bands on the anvil');
    });
  }
}
