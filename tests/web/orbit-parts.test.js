// Tests for parts of the test world, test.orbit ("Orbit"), that the other Orbit tests do not reach:
// its devices in the places of every scene, its own and the medieval world's, and the medieval
// world's devices in its places, all on the grid and clear of each other; the drone resting clear of
// every place; the Captain talking on the Bridge while a shell is open and silent while updating;
// its overlay's colours at the edges of their bands, and one past an edge refused; and its reserved
// fields, which a signature covers and nothing draws. Run with: node --test tests/web/
//
// Orbit is never under web/ and never signed with the project's key: here it is signed with a key
// made for the run, and otherwise read on dev terms (docs/tests.md, The test world).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const TEXT = fs.readFileSync(ORBIT.FILE, 'utf8');
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPTS = [...INDEX.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n;

/* A canvas context that writes one line per call. */
function context(log) {
  return new Proxy({}, {
    set(_, k, v) { log.push(String(k) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => { log.push([String(k), ...a.map(x => (x && typeof x === 'object' ? 'canvas' : x))].join(' ')); };
    }
  });
}
/* The page's scripts in a sandbox, the knight and the world started from texts on dev terms. */
function page(texts) {
  const log = [];
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context([]); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.knight.start(texts, true);
  KW.world.start(texts, true);
  KW.ui = { caption() {} };
  return { KW, log };
}
const ALL = [BASE_TEXT, MED_TEXT, TEXT];
const P = page(ALL);
const SCENES = ['battlement', 'camp', 'house', 'yard', 'cellar', 'smithy', 'court', O('deck'), O('bridge'), O('airlock')];
const ORBITS = [O('deck'), O('bridge'), O('airlock')];

/* ---- The devices in the places -------------------------------------------------------------------- */

/* A context that grows one box, [x0, y0, x1, y1], over every fillRect and drawImage until read, as
   tests/web/places.test.js keeps it. */
function boxes(KW) {
  let bb = null;
  const grow = (x0, y0, x1, y1) => { bb = bb ? [Math.min(bb[0], x0), Math.min(bb[1], y0), Math.max(bb[2], x1), Math.max(bb[3], y1)] : [x0, y0, x1, y1]; };
  const ctx = new Proxy({}, { set() { return true; }, get(_, k) {
    if (k === 'fillRect') return (x, y, w, h) => grow(x, y, x + w, y + h);
    if (k === 'drawImage') return (cv, x, y) => grow(x, y, x + cv.width, y + cv.height);
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  } });
  return f => { const was = KW.draw.getCtx(); KW.draw.setCtx(ctx); bb = null; try { f(); } finally { KW.draw.setCtx(was); } const r = bb; bb = null; return r; };
}
/* The kinds that may stand in a place of each class, from the prop set named: the Pi in the pie's
   place, cameras high, and the rest on the ground. Orbit's set draws no VM or box, and those take
   the medieval world's drawing. */
const KINDS_AT = { pie: ['pi'], high: ['camera'], ground: ['machine', 'vm', 'box'] };
const TIMES = [0, 250, 900, 1700, 2300, 3100];
function kindOf(KW, set, k) {
  const d = KW.world.drawingOf(set, k);
  return d.kind || KW.world.drawingOf('medieval', k).kind;
}
/* What a place may show with the devices of the prop set: each kind, up and gone, still and moving,
   mirrored when the place flips, its question mark, and the pole a high place stands on. */
function placeBoxes(KW, take, pl, set) {
  const out = [], mirror = b => (pl.flip ? [2 * pl.x - b[2], b[1], 2 * pl.x - b[0], b[3]] : b);
  for (const k of KINDS_AT[pl.cls]) {
    const kind = kindOf(KW, set, k);
    let device = null;
    for (const ok of [true, false]) for (const t of TIMES) for (const part of ['still', 'moving']) {
      const b = take(() => kind.draw(pl.x, pl.y, t, ok, part));
      if (b) device = device ? [Math.min(device[0], b[0]), Math.min(device[1], b[1]), Math.max(device[2], b[2]), Math.max(device[3], b[3])] : b;
    }
    out.push({ what: k, box: mirror(device) });
    out.push({ what: k + '\'s question mark', box: take(() => KW.sprites.mark(pl.x, pl.y - kind.mark, '?')) });
  }
  if (pl.pole) out.push({ what: 'the pole', box: mirror([pl.x + 21, pl.y - 40, pl.x + 34, pl.pole + 1]) });
  return out;
}

test('Orbit\'s devices stand wholly on the 960 by 600 grid in every place of every scene, and the medieval world\'s in Orbit\'s places', () => {
  const KW = P.KW, take = boxes(KW), bad = [];
  for (const [set, scenes] of [[O('props.orbit'), SCENES], ['medieval', ORBITS]]) {
    for (const name of scenes) for (const [p, pl] of Object.entries(KW.scenes[name].places)) {
      for (const { what, box: b } of placeBoxes(KW, take, pl, set)) {
        if (b[0] < 0 || b[1] < 0 || b[2] > 960 || b[3] > 600) bad.push(`${set} in ${name} ${p}: ${what} covers ${b.join(', ')}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('no two places in Orbit\'s scenes draw over each other, whichever world\'s devices stand there, and a camera\'s mark stays clear of the headline', () => {
  const KW = P.KW, take = boxes(KW), bad = [];
  for (const set of [O('props.orbit'), 'medieval']) for (const name of ORBITS) {
    const list = Object.entries(KW.scenes[name].places).map(([p, pl]) => [p, placeBoxes(KW, take, pl, set)]);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      for (const a of list[i][1]) for (const b of list[j][1]) {
        if (a.box[0] < b.box[2] && b.box[0] < a.box[2] && a.box[1] < b.box[3] && b.box[1] < a.box[3]) bad.push(`${set} in ${name}: ${list[i][0]} (${a.what}) and ${list[j][0]} (${b.what})`);
      }
    }
    for (const [p, pl] of Object.entries(KW.scenes[name].places)) if (pl.cls === 'high') {
      const mark = kindOf(KW, set, 'camera').mark;
      assert.ok(pl.y - mark >= 172, `${set} in ${name} ${p}: the mark's top at ${pl.y - mark}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the drone rests clear of every place in each of Orbit\'s scenes, so no device stands over it', () => {
  const KW = P.KW, take = boxes(KW), ORB = JSON.parse(TEXT).pack, drone = ORB.cast['pet.drone'];
  // the drone's box at its spot, from the stamps of the poses it takes there, mirrored as it faces
  const extent = name => {
    let b = null;
    for (const s of ORB.stamps[drone.coats.steel.poses[name]]) {
      const w = Math.max(...s.rows.map(r => r.length)), x0 = s.p[0], y0 = s.p[1];
      b = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x0 + w), Math.max(b[3], y0 + s.rows.length)] : [x0, y0, x0 + w, y0 + s.rows.length];
    }
    return b;
  };
  for (const [scene, sp] of Object.entries(drone.spots)) {
    const [rx, ry] = sp.rest;
    for (const pose of ['rest', 'settle', 'alert0', 'alert1']) {
      const e = extent(pose), d = sp.face < 0 ? [rx - e[2], ry + e[1], rx - e[0], ry + e[3]] : [rx + e[0], ry + e[1], rx + e[2], ry + e[3]];
      for (const set of [O('props.orbit'), 'medieval']) for (const [p, pl] of Object.entries(KW.scenes[O(scene)].places)) {
        for (const { what, box: b } of placeBoxes(KW, take, pl, set)) {
          assert.ok(!(d[0] < b[2] && b[0] < d[2] && d[1] < b[3] && b[1] < d[3]), `${scene}: the drone ${pose} at ${d.join(', ')} and ${set}'s ${what} in ${p} at ${b.join(', ')}`);
        }
      }
    }
  }
});

/* ---- The Captain -------------------------------------------------------------------------------------- */

test('on the Bridge the Captain talks while a shell is open, its own mouth opening and shutting, and sits silent while updating', () => {
  const KW = P.KW, E = KW.engine, log = [];
  const r = KW.settings.create({ hooks: { look: { world: O('world.orbit') } }, storage: () => null, pack: () => KW.knight.basePack(), world: () => KW.settings.pageWorld(), say() {} }).now();
  const talking = id => {
    KW.hooks = { frozen: true, t: 0 }; E.init(context(log)); E.reset();
    E.input = Object.assign({ w: Object.assign({ id, hl: '', sub: '' }, KW.state.CONDITIONS[id]), is: 'auto', devices: [], tv: false, helmet: 'auto' }, SET.engineInput(r, KW.knight.basePack(), 60000));
    const open = [];
    // the open mouth's tongue, the warning red, is drawn nowhere else on the Bridge
    for (let t = 0; t < 9000; t += 110) { log.length = 0; KW.hooks.t = t; E.draw(t); open.push(log.some(l => /^fillStyle #ff5c4a$/i.test(l))); }
    assert.equal(E.scene(), O('bridge'), id);
    return open;
  };
  const ssh = talking('ssh_session'), upd = talking('updating');
  const opened = ssh.filter(Boolean).length;
  assert.ok(opened > 4 && opened < ssh.length / 2, `the mouth open in ${opened} of ${ssh.length} frames`);
  // it opens and shuts in turn while the Captain speaks
  assert.ok(ssh.some((v, i) => v && i > 0 && !ssh[i - 1]) && ssh.some((v, i) => !v && i > 0 && ssh[i - 1]));
  assert.equal(upd.filter(Boolean).length, 0, 'silent while updating');
  const cap = KW.cast.patrons[O('patron.captain')];
  assert.equal(typeof cap.mouth, 'function');
});

/* ---- The overlay ---------------------------------------------------------------------------------------- */

test('Orbit\'s overlay holds each level\'s colours near the edges of its band, and a colour past an edge is refused at rules', () => {
  const ok = PK.read(TEXT, { allowUnsigned: true });
  assert.equal(ok.ok, true);
  const levels = JSON.parse(TEXT).pack.overlays['overlay.orbit'].levels;
  assert.deepEqual(Object.keys(levels), ['ok', 'warn', 'crit', 'info', 'sleep']);
  for (const [level, i, colour, why] of [['ok', 0, '#35ffd0', /the ok colour must keep a hue from 110 to 160, not 166/], ['warn', 1, '#fff01a', /the warn colour must keep a hue from 28 to 55/],
    ['info', 1, '#4060ff', /the info colour must keep a hue from 180 to 215/]]) {
    const env = ORBIT.build();
    env.pack.overlays['overlay.orbit'].levels[level][i] = colour;
    const r = PK.read(JSON.stringify(env), { allowUnsigned: true });
    assert.deepEqual([r.ok, r.step], [false, 'rules'], level);
    assert.match(r.reason, new RegExp('^pack\\.overlays\\["overlay\\.orbit"\\]\\.levels\\.' + level + '\\[' + i + '\\]: '));
    assert.match(r.reason, why);
  }
});

/* ---- The reserved fields --------------------------------------------------------------------------------- */

test('Orbit\'s reserved fields are covered by a signature, made here with a key for the run, and nothing draws from them', () => {
  const env = JSON.parse(TEXT), p = env.pack;
  assert.ok(p.sounds && p.scenes.deck.sound && p.scenes.deck.companion && p.worlds['world.orbit'].sound && p.worlds['world.orbit'].companion, 'the fixture holds them');
  const KEY = crypto.generateKeyPairSync('ed25519'), pub = new Uint8Array(Buffer.from(KEY.publicKey.export({ format: 'jwk' }).x, 'base64url'));
  const verify = (k, msg, sig) => crypto.verify(null, Buffer.from(msg), crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(k).toString('base64url') }, format: 'jwk' }), Buffer.from(sig));
  const sign = pack => crypto.sign(null, Buffer.from(PK.message(pack)), KEY.privateKey).toString('base64');
  const signed = SIGN.withSig(TEXT, { alg: 'ed25519', kid: 'test1', value: sign(p) });
  const r = PK.read(signed, { keys: { test1: pub }, verify });
  assert.deepEqual([r.ok, r.signed], [true, true], r.reason);
  // one junk value changed breaks the signature
  const env2 = JSON.parse(signed); env2.pack.sounds.hum.junk[0] = 9;
  const bad = PK.read(JSON.stringify(env2), { keys: { test1: pub }, verify });
  assert.deepEqual([bad.ok, bad.step], [false, 'signature']);
  // without them the page draws and resolves the same: the Deck, its turns and the preset
  const bare = JSON.parse(TEXT).pack;
  delete bare.sounds; bare.provides = bare.provides.filter(x => x !== 'sounds');
  delete bare.scenes.deck.sound; delete bare.scenes.deck.companion;
  delete bare.worlds['world.orbit'].sound; delete bare.worlds['world.orbit'].companion;
  const B = page([BASE_TEXT, MED_TEXT, JSON.stringify({ kwpack: 1, pack: bare })]);
  const frames = Q => {
    const KW = Q.KW, E = KW.engine, log = [];
    const res = KW.settings.create({ hooks: { look: { world: O('world.orbit') } }, storage: () => null, pack: () => KW.knight.basePack(), world: () => KW.settings.pageWorld(), say() {} }).now();
    KW.hooks = { frozen: true, t: 0 }; E.init(context(log)); E.reset();
    E.input = Object.assign({ w: KW.state.IDLE, is: 'auto', devices: [], tv: false, helmet: 'auto' }, SET.engineInput(res, KW.knight.basePack(), 60000));
    for (const t of [0, 2300]) { KW.hooks.t = t; E.draw(t); }
    return [plain(res.values), log.join('\n'), plain(KW.world.catalogue().scenes[O('deck')])];
  };
  assert.deepEqual(frames(B), frames(P));
});
