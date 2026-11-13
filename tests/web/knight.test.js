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
const test = require('node:test');
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
/* The two paths, each as the page that takes it: from code, as on a deployed page given the
   unsigned base pack, and from the base pack as it ships, as on a 'dev' page, which reads it signed
   or not. */
const PATHS = { code: () => load(false, [UNSIGNED]), pack: () => load(true) };

/* The scripts index.html loads, in its order, that the knight's drawing needs: everything but the
   files that drive the page (state, engine, demo, main) and the scenes other than the two that show
   the knight's gear at rest, the house and the smithy. The pack library and the carriers are among
   them. */
const SCENES = ['js/scenes/house.js', 'js/scenes/smithy.js'];
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => (!s.startsWith('js/scenes/') || SCENES.includes(s)) && !['js/state.js', 'js/engine.js', 'js/demo.js', 'js/main.js'].includes(s));

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
  // the engine draws the watched things where a scene's draw asks for them; here that is one line
  KW.things = { draw() { log.push('things'); } };
  const status = KW.knight.start(texts || KW.packText, dev === true);
  KW.draw.setCtx(ctx);
  return { KW, K: KW.knight, log, status, lines };
}

const X = 480, FLOOR = 530;
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
  for (const t of [300, 1250]) p.push([`smithy drawn t${t}`, () => { const s = { kx: 440, o: at(K, 'updating', t), strike: false }; S.act(t, s); S.draw(t, s); }]);
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
      assert.equal(drawn.length, 112);
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
    assert.deepEqual(plain(status.base), { id: 'kw.base', version: '1.1.0', signed });
    assert.deepEqual(plain(status.refused), []);
    assert.deepEqual(plain(status.fallbacks).map(f => f.reason).filter(r => r !== 'not set'), []);
    assert.equal(status.note, 'knightwatcher: the knight is drawn from the base pack kw.base 1.1.0, ' + (signed ? 'signed' : 'unsigned'));
  };
  const MISSING = 'sig: is missing, and this page accepts only signed packs';
  /* The unsigned base pack signed with a key made for the run: { text, kw1 }, kw1 the public key in
     base64 for load(). */
  const signedForRun = () => {
    const k = crypto.generateKeyPairSync('ed25519');
    const value = crypto.sign(null, Buffer.from(PK.message(JSON.parse(UNSIGNED).pack)), k.privateKey).toString('base64');
    return { text: SIGN.withSig(UNSIGNED, { alg: 'ed25519', kid: 'kw1', value }), kw1: Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64') };
  };

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
    const v = load(true, [text.replace('"version": "1.1.0"', '"version": "1.1"')]);
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

  /* The unsigned base pack's file as text, after edit(pack) has changed the parsed pack. */
  const editedPack = edit => {
    const env = JSON.parse(UNSIGNED);
    edit(env.pack);
    return JSON.stringify(env);
  };

  test('the blade and the backdrop key name the equipped weapon on the pack path, and the greatsword on the code path', () => {
    const code = PATHS.code(), pack = PATHS.pack();
    assert.deepEqual(plain(code.K.rest.blade()), { from: 34, to: 263, half: 15 });
    assert.deepEqual(plain(pack.K.rest.blade()), { from: 34, to: 263, half: 15 });
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
    assert.equal(b.K.rest.blade(), null);
    const drawn = box => { box.log.length = 0; const s = { kx: 440, o: at(box.K, 'updating', 300), strike: false }; box.KW.scenes.smithy.act(300, s); box.KW.scenes.smithy.draw(300, s); return box.log.slice(); };
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
    assert.deepEqual([a.gx, a.gy, a.fx, a.fy, a.mark, a.shake], [40, 24.4, 19.6, 37.6, '!', Math.round(Math.sin(94 / 60))]);
    assert.equal(a.wang, 0.2 + Math.sin(94 / 90) * 0.12);
    // the sword put away and the hammer are as before
    assert.equal(K.rig(at(K, 'idle', 2300, { sword: false })).grip, 'none');
    assert.equal(K.rig(at(K, 'updating', 2300, { sword: false, hammer: 0.5 })).grip, 'hammer');
    // the swing keeps the greatsword's angles at the wind-up and the cut, so the swat's hit test holds
    for (const dir of [1, -1]) {
      const w = at(K, 'idle', 2300); K.swing(w, 0.3, dir);
      const c = at(K, 'idle', 2300); K.swing(c, 0.55, dir);
      assert.deepEqual([w.wang, c.wang], [-1.0 * dir, 2.0 * dir]);
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
     length, the attack's tremble every 10 ms for two seconds, the stance of every condition that
     holds the weapon, and the largest bloat. In the order the frame was drawn in, neither an arm
     nor a gauntlet drawn after the weapon may fill a pixel of its blade or guard, which are the
     weapon's pixels at least 17 along the frame from the grip's middle, where both swords' guards
     begin; and neither may one drawn after the shield fill a pixel of the shield. Returns the
     breaches, as text. */
  const ENGINE_STEPS = ['crates', 'face', 'drumstick', 'hammer', 'effects'];
  const FROM = 17;
  function breaches(look) {
    const { KW, K } = withLook(look), lib = KW.pack, seq0 = lib.sequence, draw0 = lib.draw;
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
    const blade = K.rest.blade(), found = [];
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
    for (let t = 0; t < 2000; t += 10) check(`attack t${t}`, at(K, 'attack', t));
    for (const id of ['idle', 'wan_down', 'thing_down', 'memory_tight', 'ssh_session', 'cpu_hot', 'streaming', 'night']) check(id, at(K, id, 2300));
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

  test('the gear at rest with the arming sword: the pegs under its blade, the shield on the wall, the keys', () => {
    const b = withLook(ONE_LOOK), H = b.KW.scenes.house, S = b.KW.scenes.smithy;
    assert.deepEqual(plain(b.K.rest.blade()), { from: 34, to: 175, half: 10 });
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
    for (const look of [{}, ONE_LOOK]) {
      const b = withLook(look), H = b.KW.scenes.house, P = b.KW.props, h2 = H.places.h2, tag = look.items ? 'sword and shield' : 'greatsword';
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
}
