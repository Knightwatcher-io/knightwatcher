// Tests for format 1.1 in the pack library, web/js/pack.js: the world sections (scenes, the cast,
// props, stamps, words, overlays, presets and the reserved sounds), read, checked and kept as data,
// with nothing compiled from them yet. Run with: node --test tests/web/
// The fixture in fixtures/world-1.1.json is a world pack made of the world format's own worked
// examples (the cellar, the house's planks and blanket, the act parts, the places, the patron, the
// goblin, the fly, the devices, the words, the overlay and the preset) and of today's seven scenes'
// places, spots, rounds and can lists. Every refusal test changes one thing in a copy of it, signs
// the copy with a key made for the run and reads it back.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PK = require('../../web/js/pack.js');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/world-1.1.json'), 'utf8');
const BASE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8');
const WORLD = () => JSON.parse(FIXTURE).pack;
const clone = v => JSON.parse(JSON.stringify(v));
const range = n => Array.from({ length: n }, (_, i) => i);

// ---- Signing, independently of pack.js -------------------------------------------------------------

// RFC 8785 for the values a pack holds, written separately from pack.js.
function jcs(v) {
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const ks = Object.keys(v).sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d) return d; }
      return a.length - b.length;
    });
    return '{' + ks.map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const KEY = crypto.generateKeyPairSync('ed25519');
const PUB = new Uint8Array(Buffer.from(KEY.publicKey.export({ format: 'jwk' }).x, 'base64url'));
const verify = (pub, msg, sig) => crypto.verify(null, Buffer.from(msg),
  crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') }, format: 'jwk' }), Buffer.from(sig));
const OPTS = { keys: { kw1: PUB }, verify };
const sign = pack => crypto.sign(null, Buffer.from(PK.PREFIX + jcs(pack), 'utf8'), KEY.privateKey).toString('base64');
const envText = (pack, space) => JSON.stringify({ kwpack: 1, pack, sig: { alg: 'ed25519', kid: 'kw1', value: sign(pack) } }, null, space);
const load = pack => PK.read(envText(pack), OPTS);

// The sections a 1.1 pack may provide, in the order the library lists them.
const SECTIONS = ['builds', 'items', 'palettes', 'swatches', 'decorations', 'scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'sounds', 'stamps'];
const provide = p => { p.provides = SECTIONS.filter(s => p[s] && Object.keys(p[s]).length); return p; };
function edited(edit) { const p = WORLD(); edit(p); return p; }
const PRINT = process.env.W2_PRINT === '1';
function rejected(edit, step, want) {
  const r = load(edited(edit));
  if (PRINT) { console.log('RULE ' + JSON.stringify([step, r.step, r.reason])); return r; }
  assert.equal(r.ok, false, 'expected the pack to be refused');
  assert.equal(r.step, step, r.reason);
  assert.ok(want, 'every refusal test names the reason it expects');
  assert.equal(r.reason, want);
  return r;
}
function accepted(edit) {
  const r = load(edited(edit));
  assert.equal(r.ok, true, r.reason);
  return r;
}
// A small pack of either format: an id, and whatever the edit adds.
function small(format, add) {
  return provide(Object.assign({ id: 'test.small', name: 'Small', version: '1.0.0', format, licence: 'Invented for the tests.', provides: [] }, add || {}));
}

// ---- Shorthands into the fixture ---------------------------------------------------------------------

const sc = (p, n) => p.scenes['scene.' + n];
const cellar = p => sc(p, 'cellar'), house = p => sc(p, 'house'), yard = p => sc(p, 'yard'), smithy = p => sc(p, 'smithy'), court = p => sc(p, 'court');
const battlement = p => sc(p, 'battlement'), camp = p => sc(p, 'camp');
const still = p => cellar(p).still[0].shapes;            // the cellar's still layer
const moving = p => cellar(p).moving[0].shapes;          // the cellar's moving layer: glow, flame, things
const tile = p => still(p)[4];                           // the cellar's tile of shelf brackets
const planks = p => house(p).still[0].shapes[1];         // the house's planks, with a pick and an only
const glow = p => moving(p)[0];
const patron = p => p.cast['patron.a'], goblin = p => p.cast['foe.goblin'], fly = p => p.cast['critter.fly'], pet = p => p.cast['pet.cat'];
const sit = p => p.stamps['pet.sit'][0];                 // the pet's one pose: a pix shape in runs
const kinds = p => p.props['props.medieval'].kinds;
const words = p => p.words['words.medieval'], overlay = p => p.overlays['overlay.phosphor'], preset = p => p.worlds['world.medieval'];
const rect = (x = 0) => ({ k: 'rect', p: [x, 0], w: 1, h: 1, fill: '@base.k' });
// a shape that costs h fills a band, standing on its base
const big = (h, fill) => ({ k: 'rrect', p: [-2, -h], w: 4, h, r: 0, fill: fill || '@base.k' });
const CS = 'pack.scenes["scene.cellar"]', HS = 'pack.scenes["scene.house"]', YS = 'pack.scenes["scene.yard"]', SS = 'pack.scenes["scene.smithy"]';
const CT = 'pack.scenes["scene.court"]', BS = 'pack.scenes["scene.battlement"]', PA = 'pack.cast["patron.a"]', GO = 'pack.cast["foe.goblin"]', FL = 'pack.cast["critter.fly"]';
const PE = 'pack.cast["pet.cat"]', ST = 'pack.stamps["pet.sit"][0]';
const KI = 'pack.props["props.medieval"].kinds', WO = 'pack.words["words.medieval"]', OV = 'pack.overlays["overlay.phosphor"]', PR = 'pack.worlds["world.medieval"]';

// ---- The fixture ---------------------------------------------------------------------------------------

test('the world fixture reads clean, signed, and reports what it is', () => {
  const r = load(WORLD());
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'test.world');
  assert.deepEqual(r.format, [1, 1]);
  assert.equal(r.signed, true);
  assert.deepEqual(r.provides, ['builds', 'items', 'scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'stamps']);
  assert.ok(Object.isFrozen(r.data.scenes['scene.cellar'].still[0].shapes[0]));
  // read on a dev page unsigned too
  const u = PK.read(JSON.stringify({ kwpack: 1, pack: WORLD() }), { allowUnsigned: true });
  assert.equal(u.ok, true, u.reason);
  assert.equal(u.signed, false);
});

test('the world fixture nests as deep as the format allows, 12, and no deeper', () => {
  const depth = v => (v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0);
  assert.equal(depth(JSON.parse(FIXTURE)), 12);
});

test('the world sections are kept as data and nothing is compiled from them', () => {
  const r = load(WORLD()), w = WORLD();
  // a pix shape in runs is kept with its rows expanded and without runs: the only change the read makes
  const runs = row => row.replace(/([0-9]*)(.)/g, (m, n, ch) => ch.repeat(n ? +n : 1));
  for (const n of Object.keys(w.stamps)) w.stamps[n] = w.stamps[n].map(x => (x.runs ? Object.assign({}, x, { rows: x.rows.map(runs), runs: undefined }) : x));
  for (const s of ['scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'stamps', 'sounds']) assert.deepEqual(clone(r.data[s]), clone(w[s]), s);
  assert.deepEqual(clone(r.data.stamps['pet.sit'][0].rows), ['abba', 'aaaa', 'a..a']);
  // what the counts step found, and nothing else
  assert.deepEqual(Object.keys(r.world), ['scenes', 'cast', 'props', 'stamps']);
  assert.deepEqual(r.decorations, {});
  // the world's own body and its head item are read like any build, and a look still resolves from
  // the base pack alone: the world's pack changes nothing the knight draws
  const base = PK.read(BASE_TEXT, { allowUnsigned: true });
  assert.equal(base.ok, true, base.reason);
  assert.deepEqual(JSON.parse(JSON.stringify(PK.resolve([base, r], {}))), JSON.parse(JSON.stringify(PK.resolve([base], {}))));
  assert.equal(PK.resolve([base, r], { build: 'test.world/body.courier' }).fallbacks[0].reason, 'no such build');
});

test('the counts step\'s costs for the fixture, worked by hand', () => {
  const w = load(WORLD()).world;
  // the cellar's backdrop: the tile of brackets repeats 19 times from L - 160 + 60 at the least to R at
  // the most, two shapes each; with the four rects, the two floor lines and the stamps' four shapes
  // that is 48 shapes. The rects cost 1 each but the board's two bands; the sconce costs 1 + 3, the
  // barrel's rounded rects 72 and 66 rows times three bands of leather. The bricks cover the screen at
  // its widest, 2912, down to 530 from its top at the highest, -602: 44 courses of 26 by 47 blocks of
  // 64 (one more than fit, for the courses laid half a block over), three fills a block and one for the
  // mortar. The shelf has 78 slots of 38 across 2912, each at most a cheese's 31 + 25 * 2 + 8 + 3
  const bricks = 1 + 3 * 44 * 47, shelf = 78 * (31 + 25 * 2 + 8 + 3);
  // the frame: the glow's 3, and the flame at 0.62, three tongues each an ell of 2 * ceil(14 * 0.62 * f)
  // + 1 rows and a triangle of ceil(53 * 0.62 * f) + 1, for f of 1, 0.7 and 0.42
  const flame = (19 + 34) + (15 + 25) + (9 + 15);
  assert.deepEqual(w.scenes['scene.cellar'], { still: { n: 48, cost: 1 + 2 + 38 + 4 + 1 + 1 + 72 + 66 * 3 + bricks + shelf }, frame: { n: 3, cost: 3 + flame, glows: 1 } });
  // the patron: two polygons of 153 and 147 rows, the second in four bands, and the face, 78 rows in
  // the user's skin, counted as 8 bands
  assert.deepEqual(w.cast['patron.a'], { still: 153 + 147 * 4 + 78 * 8, states: { shut: 1, open: 11 + 5 } });
  // the goblin's six poses each draw its legs (40 rows) and its head (61 rows)
  assert.deepEqual(w.cast['foe.goblin'].poses.hit, 101);
  assert.deepEqual(w.cast['critter.fly'].frames, { flap0: 7 + 7 + 9 + 1, flap1: 24, dead: 1 });
  // a lamp of the pie's own moves: its lit and dark drawings, runs of pix; while up, the steam's three
  // puffs, each an ell of 15 rows
  assert.deepEqual(w.props['props.medieval'].pi, { up: { still: 21, moving: 5 + 3 + 3 * 15 }, gone: { still: 21, moving: 5 + 3 } });
});

// ---- Signing and the canonical form cover the new sections ------------------------------------------------

test('a signature over a 1.1 pack verifies, pretty-printed or minified, keys in any order', () => {
  const p = WORLD();
  assert.equal(PK.read(envText(p, 2), OPTS).ok, true);
  assert.equal(PK.read(envText(p), OPTS).ok, true);
  const rev = v => (Array.isArray(v) ? v.map(rev) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, rev(v[k])])) : v);
  const env = { kwpack: 1, pack: rev(p), sig: { alg: 'ed25519', kid: 'kw1', value: sign(p) } };
  assert.equal(PK.read(JSON.stringify(env), OPTS).ok, true);
  assert.equal(PK.canonical(p), jcs(p));
  assert.equal(PK.canonical(rev(p)), jcs(p));
  assert.ok(Buffer.from(PK.message(p)).equals(Buffer.from(PK.PREFIX + jcs(p), 'utf8')));
});

test('one changed value in any world section breaks the signature', () => {
  const p = WORLD(), sig = sign(p);
  const edits = [q => { cellar(q).spot = 125; }, q => { glow(q).a.wave[0] = 0.026; }, q => { patron(q).box[0] = 181; }, q => { kinds(q).pi.mark = 94; },
    q => { words(q).quiet.ads[0] = '{n} ads slain!'; }, q => { overlay(q).levels.ok[0] = '#39ff6b'; }, q => { preset(q).picture = 'scene.yard'; },
    q => { q.stamps.barrel[0].r = 11; }, q => { q.sounds.x = 1; }, q => { sc(q, 'camp').sound.ambience = 'other'; }];
  for (const e of edits) {
    const q = clone(p); e(q);
    const r = PK.read(JSON.stringify({ kwpack: 1, pack: q, sig: { alg: 'ed25519', kid: 'kw1', value: sig } }), OPTS);
    assert.equal(r.step, 'signature', String(e));
  }
});

// ---- Versions ------------------------------------------------------------------------------------------

test('the library reads [1, 0] and [1, 1] and refuses [1, 2] at the format step', () => {
  assert.deepEqual(PK.FORMAT, [1, 1]);
  assert.equal(load(small([1, 0])).ok, true);
  assert.equal(load(small([1, 1])).ok, true);
  for (const f of [[1, 2], [1, 3]]) assert.deepEqual(load(small(f)), { ok: false, step: 'format', reason: 'pack.format: is 1.' + f[1] + ', newer than this engine\'s 1.1', id: 'test.small' });
  // a 1.2 field such as a fired weapon's use is refused the same way, at the format, in a 1.2 pack
  assert.equal(load(Object.assign(WORLD(), { format: [1, 2] })).step, 'format');
});

test('a 1.0 pack reads as it did: no world section, builds only in the base pack, pick and lamp free', () => {
  for (const s of ['scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'sounds', 'stamps']) {
    const r = load(Object.assign(small([1, 0]), { [s]: {} }));
    assert.deepEqual([r.step, r.reason], ['fields', 'pack.' + s + ': is not a field here'], s);
  }
  const w = WORLD();
  const b = load(small([1, 0], { builds: w.builds, items: w.items }));
  assert.deepEqual([b.step, b.reason], ['fields', 'pack.builds: only the base pack, kw.base, may carry builds']);
  assert.equal(load(small([1, 1], { builds: w.builds, items: w.items })).ok, true);
  assert.equal(load(small([1, 0], { palettes: { pick: { a: '#000000' }, lamp: { a: '#000000' } } })).ok, true);
  const pv = load(Object.assign(small([1, 0]), { provides: ['stamps'] }));
  assert.deepEqual([pv.step, pv.reason], ['fields', 'pack.provides[0]: must be one of "builds", "items", "palettes", "swatches", "decorations"']);
  assert.equal(load(small([1, 0])).world, undefined);
});

test('the closed lists are the format\'s, by name', () => {
  const L = PK.WORLD_LISTS;
  assert.deepEqual(L.EFFECTS, ['sky', 'stars', 'ridge', 'bricks', 'pines', 'tree', 'arch', 'shelf', 'stacks', 'tufts', 'pebbles', 'planks', 'rafters', 'horseshoe', 'hood', 'flame', 'candle', 'twinkle', 'drift', 'wander', 'coals', 'steam', 'flutes', 'crust', 'fingers', 'fringe', 'flicker', 'burst']);
  assert.deepEqual(L.MARKS, ['things', 'rest', 'patron', 'sleeper', 'target', 'bubble']);
  assert.deepEqual(L.PREDICATES, ['tv', 'inBed', 'helmOff', 'strike', 'day', 'night']);
  assert.deepEqual(L.ROUND_ACTS, ['guard', 'look', 'sniff', 'yawn', 'train']);
  assert.deepEqual(L.HOSTS, ['flies', 'crate', 'feast', 'foe']);
  assert.deepEqual(L.ROLES, ['patron', 'foe', 'critter', 'pet']);
  assert.deepEqual(L.PET_POSES, ['rest', 'settle', 'alert0', 'alert1', 'stalk0', 'stalk1', 'pounce', 'land', 'pleased', 'walk0', 'walk1']);
  assert.deepEqual(L.EXITS, ['poof']);
  assert.deepEqual(L.FONTS, ['vt323']);
  assert.deepEqual(L.FOE_POSES, ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit']);
  assert.deepEqual(L.TRIGGERS, ['hit', 'strike']);
  assert.deepEqual(L.PROP_KINDS, ['pi', 'camera', 'machine', 'vm', 'box']);
  // the contract's condition ids, which the page reads from state.js
  const src = fs.readFileSync(path.join(__dirname, '../../web/js/state.js'), 'utf8');
  const ids = Array.from(src.slice(src.indexOf('const CONDITIONS = {'), src.indexOf('};', src.indexOf('const CONDITIONS = {'))).matchAll(/^\s+([a-z_]+):/gm), m => m[1]);
  assert.deepEqual(L.CONDITIONS.slice().sort(), ids.sort());
  assert.ok(Object.isFrozen(L) && Object.isFrozen(L.EFFECTS) && Object.isFrozen(PK.WORLD_LIMITS) && Object.isFrozen(PK.SCENE_RANGE));
});

// ---- Rules: one refused pack for each rule ------------------------------------------------------------------

const RULES = [
  // the pack
  ['pack: provides names only the sections', 'fields', p => { p.provides.push('defaults'); }, "pack.provides[9]: must be one of \"builds\", \"items\", \"palettes\", \"swatches\", \"decorations\", \"scenes\", \"cast\", \"props\", \"words\", \"overlays\", \"worlds\", \"sounds\", \"stamps\""],
  ['pack: provides must list a world section the pack holds', 'rules', p => { p.provides = p.provides.filter(s => s !== 'stamps'); }, "pack.provides: must list \"stamps\", which the pack holds"],
  ['pack: provides must not list sounds while they are empty', 'rules', p => { p.provides.push('sounds'); }, "pack.provides: lists \"sounds\", which the pack does not hold"],
  ['pack: sounds must be an object', 'fields', p => { p.sounds = []; }, "pack.sounds: must be an object"],
  ['palettes: pick is reserved in 1.1', 'fields', p => { p.palettes = { pick: { a: '#000000' } }; provide(p); }, "pack.palettes.pick: is a reserved set name"],
  ['palettes: lamp is reserved in 1.1', 'fields', p => { p.palettes = { lamp: { a: '#000000' } }; provide(p); }, "pack.palettes.lamp: is a reserved set name"],
  // stamps
  ['stamps: a stamp id must match the local pattern', 'fields', p => { p.stamps.Barrel = p.stamps.barrel; }, "pack.stamps.Barrel: is not a valid id"],
  ['stamps: at least one shape', 'fields', p => { p.stamps.barrel = []; }, "pack.stamps.barrel: must hold 1 to 64 entries, not 0"],
  ['stamps: 65 shapes', 'fields', p => { p.stamps.barrel = range(65).map(() => rect()); }, "pack.stamps.barrel: must hold 1 to 64 entries, not 65"],
  ['stamps: no tile in a stamp', 'fields', p => { p.stamps.barrel.push(clone(tile(p))); }, "pack.stamps.barrel[2].k: \"tile\" is allowed only in a layer of a scene, outside tiles"],
  ['stamps: no mark in a stamp', 'fields', p => { p.stamps.barrel.push({ k: 'things' }); }, "pack.stamps.barrel[2].k: \"things\" is allowed only in a layer of a scene, outside tiles"],
  ['stamps: a use names a stamp the pack has', 'references', p => { still(p)[5].stamp = 'torch'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[5].stamp: names a stamp, \"torch\", that the pack does not have"],
  ['stamps: 65 stamps', 'counts', p => { for (const i of range(59)) p.stamps['s' + i] = [rect()]; }, "pack.stamps: holds 65 stamps, more than 64"],
  ['stamps: no offset past 512', 'fields', p => { p.stamps.barrel[0].p = [512.125, 0]; }, "pack.stamps.barrel[0].p[0]: must be a multiple of 1/8 from -512 to 512"],
  // shapes of the world sections
  ['shapes: an unknown kind in a layer', 'fields', p => { still(p)[2].k = 'circle'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].k: must be one of \"rect\", \"ell\", \"rrect\", \"poly\", \"strip\", \"pix\", \"glow\", \"dith\", \"fx\", \"use\", \"tile\", \"things\", \"rest\", \"patron\", \"sleeper\", \"target\", \"bubble\""],
  ['shapes: an unknown kind in a stamp', 'fields', p => { p.stamps.barrel[0].k = 'circle'; }, "pack.stamps.barrel[0].k: must be one of \"rect\", \"ell\", \"rrect\", \"poly\", \"strip\", \"pix\", \"glow\", \"dith\", \"fx\", \"use\""],
  // a tile held in a tile would nest past 12 with any shape of its own, so the inner one holds none
  ['shapes: a tile cannot hold a tile', 'fields', p => { tile(p).shapes.push({ k: 'tile', step: 4, phase: 0, from: 0, to: 1, shapes: [] }); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[2].k: a tile cannot hold a tile"],
  ['shapes: no mark inside a tile', 'fields', p => { tile(p).shapes.push({ k: 'things' }); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[2].k: \"things\" is allowed only in a layer of a scene, outside tiles"],
  ['shapes: g only where a layer may declare groups', 'fields', p => { still(p)[2].g = 'flame'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].g: is not a field here"],
  ['shapes: only only inside a tile', 'fields', p => { still(p)[2].only = [3, 5]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].only: is not a field here"],
  ['shapes: at only in the patron', 'fields', p => { still(p)[2].at = 'seat'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].at: is not a field here"],
  ['shapes: no dir frame in a scene', 'fields', p => { battlement(p).still[0].shapes[3] = { k: 'poly', pts: [[0, 0], [10, 0], [0, 10]], fill: '@base.k', dir: 'frame' }; }, "pack.scenes[\"scene.battlement\"].still[0].shapes[3].dir: must be one of \"rows\", \"cols\""],
  ['shapes: points are pairs, not framed', 'fields', p => { still(p)[2].p = { frame: 'main', s: 0, p: 0 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p: must be a pair [x, y]"],
  ['shapes: points are pairs, not anchored', 'fields', p => { still(p)[2].p = { at: 'root', x: 0, y: 0 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p: must be a pair [x, y]"],
  ['shapes: an offset past 2048 in a scene', 'fields', p => { still(p)[2].p = [2048.125, 0]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0]: must be a multiple of 1/8 from -2048 to 2048"],
  ['shapes: offsets are multiples of 1/8', 'fields', p => { still(p)[2].p = [0.1, 0]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0]: must be a multiple of 1/8 from -2048 to 2048"],
  ['shapes: a length past 4096 in a scene', 'fields', p => { still(p)[2].w = 4096.125; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].w: must be a multiple of 1/8 from 0 to 4096"],
  ['shapes: a length past 512 in a stamp', 'fields', p => { p.stamps.barrel[0].h = 512.125; }, "pack.stamps.barrel[0].h: must be a multiple of 1/8 from 0 to 512"],
  ['shapes: a radius past 256', 'fields', p => { p.stamps.barrel[0].r = 256.125; }, "pack.stamps.barrel[0].r: must be a multiple of 1/8 from 0 to 256"],
  ['shapes: a half-width past 64', 'fields', p => { battlement(p).moving[1].shapes[0].hw0 = 64.125; }, "pack.scenes[\"scene.battlement\"].moving[1].shapes[0].hw0: must be a multiple of 1/8 from 0 to 64"],
  ['shapes: a clip is [top, bottom]', 'fields', p => { p.stamps.barrel[0].clip = [0]; }, "pack.stamps.barrel[0].clip: must be [top, bottom]"],
  ['shapes: a poly has 3 to 16 points', 'fields', p => { house(p).moving[0].shapes[0].pts.length = 2; }, "pack.scenes[\"scene.house\"].moving[0].shapes[0].pts: must hold 3 to 16 entries, not 2"],
  ['shapes: a pix key may not be "."', 'fields', p => { p.stamps['berry.lit'][0].key['.'] = '#000000'; }, "pack.stamps[\"berry.lit\"][0].key[\".\"]: must be one printable character other than \".\""],
  ['glow: radius past 512', 'fields', p => { glow(p).r = 512.125; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].r: must be a multiple of 1/8 from 0 to 512"],
  ['glow: colour is hex or a reference', 'fields', p => { glow(p).colour = { rgb: '#ffb000', a: 0.5 }; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].colour: must be a hex colour or a reference such as \"@base.k\""],
  ['glow: alpha from 0 to 1', 'fields', p => { glow(p).a = 1.5; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a: must be a number from 0 to 1"],
  ['glow: alpha c from 0 to 1', 'fields', p => { glow(p).a.c = -0.01; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.c: must be a number from 0 to 1"],
  ['glow: an alpha takes only c and wave', 'fields', p => { glow(p).a.L = 1; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.L: an alpha takes only c and wave"],
  ['glow: needs an alpha', 'fields', p => { delete glow(p).a; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a: is missing"],
  ['dith: colour is one colour', 'fields', p => { still(p)[2] = { k: 'dith', p: [0, 0], w: 8, h: 8, colour: [[1, '#000000']] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].colour: must be a hex colour or a reference such as \"@base.k\""],
  ['colours: an unknown colour', 'fields', p => { still(p)[2].fill = 'red'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: must be a hex colour, a reference such as \"@base.k\", a translucent colour, a mix or a contrast"],
  ['colours: a mix holds two colours', 'fields', p => { still(p)[2].fill = { mix: ['#000000'], k: 0.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.mix: must be [colour, colour]"],
  ['colours: a mix\'s colours are opaque', 'fields', p => { still(p)[2].fill = { mix: ['#000000', { rgb: '#ffffff', a: 0.5 }], k: 0.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.mix[1]: must be a hex colour or a reference such as \"@base.k\""],
  ['colours: a mix\'s k from 0 to 1', 'fields', p => { still(p)[2].fill = { mix: ['#000000', '#ffffff'], k: 1.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.k: must be a number from 0 to 1"],
  ['colours: a contrast holds two colours', 'fields', p => { still(p)[2].fill = { contrast: ['#000000'], on: '#ffffff' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.contrast: must be [colour, colour]"],
  ['colours: a contrast\'s colours are colours or mixes', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', { rgb: '#ffffff', a: 0.5 }], on: '#ffffff' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.contrast[1]: must be a hex colour, a reference such as \"@base.k\" or a mix"],
  ['colours: a contrast holds no contrast', 'fields', p => { still(p)[2].fill = { contrast: [{ contrast: ['#000000', '#ffffff'], on: '#808080' }, '#ffffff'], on: '#ffffff' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.contrast[0]: must be a hex colour, a reference such as \"@base.k\" or a mix"],
  ['colours: a contrast\'s mix is checked', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', { mix: ['#000000', '#ffffff'], k: 2 }], on: '#ffffff' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.contrast[1].k: must be a number from 0 to 1"],
  ['colours: a contrast is on one colour', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'], on: { mix: ['#000000', '#ffffff'], k: 0.5 } }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.on: must be a hex colour or a reference such as \"@base.k\""],
  ['colours: a contrast needs on', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.on: is missing"],
  ['colours: a contrast\'s band from 0 to 7', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'], on: '@base.steel', band: 8 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.band: must be a whole number from 0 to 7"],
  ['colours: a contrast has only contrast, on and band', 'fields', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'], on: '#ffffff', k: 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.k: is not a field here"],
  ['colours: drawn and dressed only in a patron\'s palettes', 'fields', p => { still(p)[2].fill = { drawn: '#000000', dressed: '#ffffff', set: 'hair' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: a colour drawn and dressed is allowed only as an entry of a patron's palettes"],
  ['colours: drawn and dressed not in the patron\'s shapes', 'fields', p => { patron(p).states.shut[0].fill = { drawn: '#000000', dressed: '#ffffff', set: 'hair' }; }, "pack.cast[\"patron.a\"].states.shut[0].fill: a colour drawn and dressed is allowed only as an entry of a patron's palettes"],
  ['patron: drawn and dressed name their set', 'fields', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: { mix: ['@hair.2', '#000000'], k: 0.3 } }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.set: is missing"],
  ['patron: drawn and dressed name a bound set', 'fields', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: '#000000', set: 'plume' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.set: must name a set this figure binds in sets"],
  ['patron: drawn is one colour', 'fields', p => { patron(p).palettes.mon.dark = { drawn: { mix: ['@hair.2', '#000000'], k: 0.3 }, dressed: '#000000', set: 'hair' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.drawn: must be a hex colour or a reference such as \"@base.k\""],
  ['patron: dressed is a colour, a mix or a contrast', 'fields', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: 'dark', set: 'hair' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.dressed: must be a hex colour, a reference such as \"@base.k\", a translucent colour, a mix or a contrast"],
  ['patron: dressed is not drawn and dressed again', 'fields', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: { drawn: '#000000', dressed: '#000000', set: 'hair' }, set: 'hair' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.dressed: a colour drawn and dressed is allowed only as an entry of a patron's palettes"],
  ['patron: drawn and dressed have only drawn, dressed and set', 'fields', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: '#000000', set: 'hair', k: 1 }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.k: is not a field here"],
  ['colours: a mix has only mix and k', 'fields', p => { still(p)[2].fill = { mix: ['#000000', '#ffffff'], k: 0.5, a: 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.a: is not a field here"],
  ['colours: a translucent colour has rgb and a', 'fields', p => { still(p)[2].fill = { rgb: '#000000' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.a: is missing"],
  ['colours: a translucent rgb is hex', 'fields', p => { still(p)[2].fill = { rgb: '@base.k', a: 0.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.rgb: must be a hex colour"],
  ['bands: the last fraction is 1', 'fields', p => { still(p)[3].fill = [[0.3, '@base.n1'], [0.9, '@base.n3']]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[3].fill: the last fraction must be 1"],
  ['bands: fractions rise', 'fields', p => { still(p)[3].fill = [[0.3, '@base.n1'], [0.3, '@base.n3'], [1, '@base.k']]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[3].fill[1][0]: fractions must rise from above 0 to 1"],
  ['bands: a band is a pair', 'fields', p => { still(p)[3].fill = [[1, '@base.n1', 2]]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[3].fill[0]: must be a [fraction, colour] pair"],
  ['bands: at most 8', 'fields', p => { still(p)[3].fill = range(9).map(i => [i === 8 ? 1 : Math.round((i + 1) / 9 * 1000) / 1000, '@base.k']); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[3].fill: must hold 1 to 8 entries, not 9"],
  // a hash in a point of a tile's shape nests 13 deep, past the depth the json step allows, so
  // these are written in a length of a tile's shape and in a point outside one
  ['terms: h is [seed, mod]', 'fields', p => { tile(p).shapes[0].h = { c: 18, h: [3] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[0].h.h: must be [seed, mod]"],
  ['terms: h\'s seed is 0 to 999', 'fields', p => { tile(p).shapes[0].h = { c: 18, h: [1000, 4] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[0].h.h[0]: must be a whole number from 0 to 999"],
  ['terms: h\'s mod is 2 to 960', 'fields', p => { still(p)[2].p[0] = { c: 0, h: [3, 1] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0].h[1]: must be a whole number from 2 to 960"],
  ['terms: wave is [amp, div, phase]', 'fields', p => { glow(p).a.wave = [0.025, 150]; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.wave: must be [amp, div, phase]"],
  ['terms: a wave\'s amp from -512 to 512', 'fields', p => { glow(p).a.wave[0] = 512.5; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.wave[0]: must be a number from -512 to 512"],
  ['terms: a wave\'s div from 1 to 100000', 'fields', p => { glow(p).a.wave[1] = 0.5; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.wave[1]: must be a number from 1 to 100000"],
  ['terms: a wave\'s phase from -100 to 100', 'fields', p => { glow(p).a.wave[2] = 100.5; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a.wave[2]: must be a number from -100 to 100"],
  ['terms: a key must be a name', 'fields', p => { still(p)[2].p[0] = { 'b-x': 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0][\"b-x\"]: is not a name"],
  ['terms: a coefficient past 8', 'fields', p => { still(p)[2].p[0] = { L: 9 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0].L: must be a multiple of 1/8 from -8 to 8"],
  ['terms: a term is a number or an object', 'fields', p => { still(p)[2].w = 'wide'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].w: must be a number or a term object"],
  ['tiles: step from 4 to 960', 'fields', p => { tile(p).step = 3; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].step: must be a whole number from 4 to 960"],
  ['tiles: step is a whole number', 'fields', p => { tile(p).step = 4.5; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].step: must be a whole number from 4 to 960"],
  ['tiles: phase from -960 to 960', 'fields', p => { tile(p).phase = 961; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].phase: must be a whole number from -960 to 960"],
  ['tiles: phase is required', 'fields', p => { delete tile(p).phase; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].phase: is missing"],
  ['tiles: 33 shapes', 'fields', p => { tile(p).shapes = range(33).map(() => rect()); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes: must hold 1 to 32 entries, not 33"],
  ['tiles: a pick of two colours at least', 'fields', p => { planks(p).pick.plank.of = ['#2a1d14']; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].pick.plank.of: must hold 2 to 16 entries, not 1"],
  ['tiles: a pick\'s colours are hex', 'fields', p => { planks(p).pick.plank.of[1] = '@base.k'; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].pick.plank.of[1]: must be a hex colour"],
  ['tiles: a pick\'s seed from 0 to 999', 'fields', p => { planks(p).pick.plank.seed = 1000; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].pick.plank.seed: must be a whole number from 0 to 999"],
  ['tiles: 9 picks', 'fields', p => { for (const i of range(8)) planks(p).pick['p' + i] = { seed: 1, of: ['#000000', '#ffffff'] }; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].pick: must hold 1 to 8 picks, not 9"],
  ['tiles: only is [seed, mod]', 'fields', p => { planks(p).shapes[2].only = [31]; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].shapes[2].only: must be [seed, mod]"],
  ['effects: fx is required', 'fields', p => { delete still(p)[0].fx; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].fx: is missing"],
  ['effects: fx names an effect of the engine', 'fields', p => { still(p)[0].fx = 'lightning'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].fx: must be one of \"sky\", \"stars\", \"ridge\", \"bricks\", \"pines\", \"tree\", \"arch\", \"shelf\", \"stacks\", \"tufts\", \"pebbles\", \"planks\", \"rafters\", \"horseshoe\", \"hood\", \"flame\", \"candle\", \"twinkle\", \"drift\", \"wander\", \"coals\", \"steam\", \"flutes\", \"crust\", \"fin..."],
  ['effects: only the fields of its table', 'fields', p => { for (const i of range(10)) still(p)[0]['f' + i] = 1; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].f0: is not a field of the effect \"bricks\""],
  ['effects: a field without a default is required', 'fields', p => { delete still(p)[0].mortar; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].mortar: is missing"],
  ['effects: a colour field holds no text but a colour', 'fields', p => { still(p)[0].mortar = 'bricks.png'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].mortar: must be a hex colour or a reference such as \"@base.k\""],
  ['effects: a pair holds two plain numbers', 'fields', p => { still(p)[0].size = [[64, 26]]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].size: must be a pair of numbers"],
  ['effects: a list of at most 16', 'fields', p => { still(p)[0].of = range(17).map(() => '#000000'); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].of: must hold 1 to 16 entries, not 17"],
  ['effects: a field\'s term is checked', 'fields', p => { still(p)[0].h = { c: 530, T: 9 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].h.T: must be a multiple of 1/8 from -8 to 8"],
  ['effects: g only where groups are', 'fields', p => { still(p)[0].g = 'flame'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].g: is not a field here"],
  ['effects: only only inside a tile', 'fields', p => { still(p)[0].only = [1, 2]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].only: is not a field here"],
  ['marks: a mark has no other field', 'fields', p => { moving(p)[2].x = 1; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[2].x: is not a field here"],
  ['marks: a rest mark names its slot', 'fields', p => { house(p).still[0].shapes[2].slot = 'plume'; }, "pack.scenes[\"scene.house\"].still[0].shapes[2].slot: must be one of \"helmet\", \"main\", \"off\""],
  ['marks: a rest mark names its rest', 'fields', p => { delete house(p).still[0].shapes[2].at; }, "pack.scenes[\"scene.house\"].still[0].shapes[2].at: is missing"],
  ['marks: the things are drawn in a moving or over layer', 'fields', p => { still(p).push({ k: 'things' }); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[9].k: the things mark is drawn each frame, so it goes in a moving or over layer"],
  ['marks: the sleeper is drawn in a moving or over layer', 'fields', p => { house(p).still[0].shapes.push({ k: 'sleeper' }); }, "pack.scenes[\"scene.house\"].still[0].shapes[4].k: the sleeper mark is drawn each frame, so it goes in a moving or over layer"],
  ['use: a stamp id', 'fields', p => { still(p)[5].stamp = 'Torch'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[5].stamp: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  // layers
  ['layers: a still layer declares no groups', 'fields', p => { cellar(p).still[0].groups = {}; }, "pack.scenes[\"scene.cellar\"].still[0].groups: is not a field here"],
  ['layers: a still layer has no keyframes', 'fields', p => { cellar(p).still[0].anim = clone(house(p).moving[0].anim); }, "pack.scenes[\"scene.cellar\"].still[0].anim: is not a field here"],
  ['layers: shapes are required', 'fields', p => { delete cellar(p).moving[0].shapes; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes: is missing"],
  ['layers: at least one shape', 'fields', p => { cellar(p).moving[0].shapes = []; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes: must hold 1 to 400 entries, not 0"],
  ['layers: no unknown field', 'fields', p => { cellar(p).moving[0].name = 'light'; }, "pack.scenes[\"scene.cellar\"].moving[0].name: is not a field here"],
  ['layers: a still layer of 2001 shapes', 'fields', p => { cellar(p).still[0].shapes = range(2001).map(() => rect()); }, "pack.scenes[\"scene.cellar\"].still[0].shapes: must hold 1 to 2000 entries, not 2001"],
  ['layers: a moving layer of 401 shapes', 'fields', p => { cellar(p).moving[0].shapes = range(401).map(() => rect()).concat([{ k: 'things' }]); }, "pack.scenes[\"scene.cellar\"].moving[0].shapes: must hold 1 to 400 entries, not 402"],
  ['layers: 33 still layers', 'fields', p => { cellar(p).still = range(33).map(() => ({ shapes: [rect()] })); }, "pack.scenes[\"scene.cellar\"].still: must hold 0 to 32 entries, not 33"],
  ['when: a predicate of the list', 'fields', p => { house(p).moving[2].when = ['raining']; }, "pack.scenes[\"scene.house\"].moving[2].when[0]: must be a predicate: cond:<condition>, \"tv\", \"inBed\", \"helmOff\", \"strike\", \"day\", \"night\", each after an optional \"!\""],
  ['when: cond names a condition', 'fields', p => { battlement(p).moving[1].when = ['cond:thing_down']; }, "pack.scenes[\"scene.battlement\"].moving[1].when[0]: must be a predicate: cond:<condition>, \"tv\", \"inBed\", \"helmOff\", \"strike\", \"day\", \"night\", each after an optional \"!\""],
  ['when: at least one predicate', 'fields', p => { house(p).moving[2].when = []; }, "pack.scenes[\"scene.house\"].moving[2].when: must hold 1 to 8 entries, not 0"],
  ['when: at most 8', 'fields', p => { house(p).moving[2].when = ['tv', 'inBed', 'helmOff', 'strike', 'day', 'night', 'cond:attack', 'cond:night', 'cond:updating']; }, "pack.scenes[\"scene.house\"].moving[2].when: must hold 1 to 8 entries, not 9"],
  ['when: a predicate once', 'fields', p => { house(p).moving[2].when = ['tv', '!tv']; }, "pack.scenes[\"scene.house\"].moving[2].when[1]: names a predicate already named"],
  ['groups: 9 in a layer', 'fields', p => { for (const i of range(8)) house(p).moving[0].groups['g' + i] = { pivot: [0, 0] }; }, "pack.scenes[\"scene.house\"].moving[0].groups: must hold 0 to 8 groups, not 9"],
  ['groups: a group has a pivot', 'fields', p => { house(p).moving[0].groups.breath = {}; }, "pack.scenes[\"scene.house\"].moving[0].groups.breath.pivot: is missing"],
  ['groups: a pivot within 2048', 'fields', p => { house(p).moving[0].groups.breath.pivot = [2048.125, 0]; }, "pack.scenes[\"scene.house\"].moving[0].groups.breath.pivot[0]: must be a multiple of 1/8 from -2048 to 2048"],
  ['anim: ms is true or false', 'fields', p => { house(p).moving[0].anim.ms = 1; }, "pack.scenes[\"scene.house\"].moving[0].anim.ms: must be true or false"],
  ['anim: a period in ms is a whole number', 'fields', p => { house(p).moving[0].anim.period = 3800.5; }, "pack.scenes[\"scene.house\"].moving[0].anim.period: must be a whole number from 200 to 600000"],
  ['anim: a period in ms from 200', 'fields', p => { house(p).moving[0].anim.period = 199; }, "pack.scenes[\"scene.house\"].moving[0].anim.period: must be a whole number from 200 to 600000"],
  ['anim: a period in seconds from 0.2', 'fields', p => { const a = house(p).moving[0].anim; delete a.ms; a.period = 0.1; }, "pack.scenes[\"scene.house\"].moving[0].anim.period: must be a number from 0.2 to 600"],
  ['anim: loop is required', 'fields', p => { delete house(p).moving[0].anim.loop; }, "pack.scenes[\"scene.house\"].moving[0].anim.loop: is missing"],
  ['anim: phase from 0 to 1', 'fields', p => { house(p).moving[0].anim.phase = 2; }, "pack.scenes[\"scene.house\"].moving[0].anim.phase: must be a number from 0 to 1"],
  ['anim: a trigger of the list', 'fields', p => { yard(p).moving[0].anim.trigger = 'swat'; }, "pack.scenes[\"scene.yard\"].moving[0].anim.trigger: must be one of \"hit\", \"strike\""],
  ['anim: a triggered clock does not loop', 'fields', p => { yard(p).moving[0].anim.loop = true; }, "pack.scenes[\"scene.yard\"].moving[0].anim.loop: must be false: a triggered clock plays once"],
  ['anim: at least one track', 'fields', p => { house(p).moving[0].anim.tracks = []; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks: must hold 1 to 16 entries, not 0"],
  ['anim: a key time in ms is a whole number', 'fields', p => { house(p).moving[0].anim.tracks[0].keys[1][0] = 1900.5; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].keys[1][0]: must be a whole number from 0 to 3800"],
  ['anim: a key time in ms within the period', 'fields', p => { house(p).moving[0].anim.tracks[0].keys[1][0] = 3801; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].keys[1][0]: must be a whole number from 0 to 3800"],
  ['anim: key times in seconds from 0 to 1', 'fields', p => { const a = house(p).moving[0].anim; delete a.ms; a.period = 3.8; a.tracks[0].keys[1][0] = 1.9; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].keys[1][0]: must be a number from 0 to 1"],
  ['anim: a wave track drives dx or dy', 'fields', p => { house(p).moving[0].anim.tracks[0] = { g: 'breath', ch: 'alpha', wave: [1, 190, 0] }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].ch: must be one of \"dx\", \"dy\""],
  ['anim: a wave track has no keys', 'fields', p => { house(p).moving[0].anim.tracks[0] = { g: 'breath', ch: 'dx', wave: [1, 190, 0], keys: [] }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].keys: is not a field here"],
  ['anim: a wave track\'s round is true or false', 'fields', p => { house(p).moving[0].anim.tracks[0] = { g: 'breath', ch: 'dx', wave: [1, 190, 0], round: 1 }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].round: must be true or false"],
  ['anim: a wave track\'s wave is checked', 'fields', p => { house(p).moving[0].anim.tracks[0] = { g: 'breath', ch: 'dx', wave: [1, 0, 0] }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].wave[1]: must be a number from 1 to 100000"],
  ['anim: a wave track names a group', 'fields', p => { house(p).moving[0].anim.tracks[0] = { g: 'Breath', ch: 'dx', wave: [1, 190, 0] }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].g: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['anim: a keyed track is checked as in 1.0', 'fields', p => { house(p).moving[0].anim.tracks[0].ch = 'spin'; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].ch: must be one of \"dx\", \"dy\", \"scale\", \"alpha\", \"show\""],
  // the fields of a scene
  ['scenes: a scene id must match the local pattern', 'fields', p => { p.scenes.Cellar = cellar(p); }, "pack.scenes.Cellar: is not a valid id"],
  ['scenes: a scene is an object', 'fields', p => { p.scenes['scene.cellar'] = []; }, "pack.scenes[\"scene.cellar\"]: must be an object"],
  ['scenes: no unknown field', 'fields', p => { cellar(p).sky = 'night'; }, "pack.scenes[\"scene.cellar\"].sky: is not a field here"],
  ['scenes: things is required', 'fields', p => { delete cellar(p).things; }, "pack.scenes[\"scene.cellar\"].things: is missing"],
  ['scenes: over is required', 'fields', p => { delete cellar(p).over; }, "pack.scenes[\"scene.cellar\"].over: is missing"],
  ['scenes: name of 33 characters', 'fields', p => { cellar(p).name = 'c'.repeat(33); }, "pack.scenes[\"scene.cellar\"].name: must be 1 to 32 characters, not 33"],
  ['scenes: spot from 30', 'fields', p => { cellar(p).spot = 29; }, "pack.scenes[\"scene.cellar\"].spot: must be a whole number from 30 to 162"],
  ['scenes: spot to 162', 'fields', p => { cellar(p).spot = 163; }, "pack.scenes[\"scene.cellar\"].spot: must be a whole number from 30 to 162"],
  ['scenes: spot is a whole number', 'fields', p => { cellar(p).spot = 124.5; }, "pack.scenes[\"scene.cellar\"].spot: must be a whole number from 30 to 162"],
  ['scenes: at least one round', 'fields', p => { cellar(p).rounds = []; }, "pack.scenes[\"scene.cellar\"].rounds: must hold 1 to 6 entries, not 0"],
  ['scenes: 7 rounds', 'fields', p => { cellar(p).rounds = range(7).map(() => ({ x: 124, act: 'guard', dur: 7 })); }, "pack.scenes[\"scene.cellar\"].rounds: must hold 1 to 6 entries, not 7"],
  ['scenes: a round\'s act of the list', 'fields', p => { cellar(p).rounds[0].act = 'dance'; }, "pack.scenes[\"scene.cellar\"].rounds[0].act: must be one of \"guard\", \"look\", \"sniff\", \"yawn\", \"train\""],
  ['scenes: a round\'s dur from 2', 'fields', p => { cellar(p).rounds[0].dur = 1; }, "pack.scenes[\"scene.cellar\"].rounds[0].dur: must be a whole number from 2 to 120"],
  ['scenes: a round\'s dur to 120', 'fields', p => { cellar(p).rounds[0].dur = 121; }, "pack.scenes[\"scene.cellar\"].rounds[0].dur: must be a whole number from 2 to 120"],
  ['scenes: a round\'s x from 30', 'fields', p => { cellar(p).rounds[0].x = 29; }, "pack.scenes[\"scene.cellar\"].rounds[0].x: must be a whole number from 30 to 162"],
  ['scenes: a round has x, act and dur alone', 'fields', p => { cellar(p).rounds[0].at = 1; }, "pack.scenes[\"scene.cellar\"].rounds[0].at: is not a field here"],
  ['scenes: quiet is true or false', 'fields', p => { cellar(p).quiet = 'no'; }, "pack.scenes[\"scene.cellar\"].quiet: must be true or false"],
  ['scenes: can names the contract\'s conditions', 'fields', p => { battlement(p).can.push('thing_down'); }, "pack.scenes[\"scene.battlement\"].can[7]: must be one of \"attack\", \"wan_down\", \"container_unhealthy\", \"disk_full\", \"backup_overdue\", \"pi_silent\", \"device_down\", \"cpu_hot\", \"memory_tight\", \"ssh_session\", \"updating\", \"streaming\", \"night\""],
  ['scenes: can names each once', 'fields', p => { cellar(p).can.push('cpu_hot'); }, "pack.scenes[\"scene.cellar\"].can[3]: appears twice"],
  ['scenes: hosts names the events', 'fields', p => { cellar(p).hosts = ['dragon']; }, "pack.scenes[\"scene.cellar\"].hosts[0]: must be one of \"flies\", \"crate\", \"feast\", \"foe\""],
  ['scenes: hosts names each once', 'fields', p => { cellar(p).hosts = ['flies', 'flies']; }, "pack.scenes[\"scene.cellar\"].hosts[1]: appears twice"],
  ['scenes: helmet on or off', 'fields', p => { cellar(p).helmet = 'maybe'; }, "pack.scenes[\"scene.cellar\"].helmet: must be one of \"on\", \"off\""],
  ['scenes: weapon held or away', 'fields', p => { cellar(p).weapon = 'sheathed'; }, "pack.scenes[\"scene.cellar\"].weapon: must be one of \"held\", \"away\""],
  ['scenes: still is an array of layers', 'fields', p => { cellar(p).still = {}; }, "pack.scenes[\"scene.cellar\"].still: must be an array"],
  ['places: all seven', 'fields', p => { delete cellar(p).things.g3; }, "pack.scenes[\"scene.cellar\"].things.g3: is missing"],
  ['places: no eighth', 'fields', p => { cellar(p).things.g4 = clone(cellar(p).things.g3); }, "pack.scenes[\"scene.cellar\"].things.g4: is not a field here"],
  ['places: 88 wide', 'fields', p => { cellar(p).things.g3.w = 90; }, "pack.scenes[\"scene.cellar\"].things.g3.w: must be 88: every place is 88 by 112"],
  ['places: 112 tall', 'fields', p => { cellar(p).things.g3.h = 100; }, "pack.scenes[\"scene.cellar\"].things.g3.h: must be 112: every place is 88 by 112"],
  ['places: a class of the list', 'fields', p => { cellar(p).things.g3.cls = 'wall'; }, "pack.scenes[\"scene.cellar\"].things.g3.cls: must be one of \"pie\", \"high\", \"ground\""],
  ['places: a kind of the list', 'fields', p => { cellar(p).things.g3.kind = 'shelf'; }, "pack.scenes[\"scene.cellar\"].things.g3.kind: must be one of \"hang\", \"surface\", \"floor\""],
  ['places: x on the grid', 'fields', p => { cellar(p).things.g3.x = 961; }, "pack.scenes[\"scene.cellar\"].things.g3.x: must be a whole number from 0 to 960"],
  ['places: y on the grid', 'fields', p => { cellar(p).things.g3.y = 601; }, "pack.scenes[\"scene.cellar\"].things.g3.y: must be a whole number from 0 to 600"],
  ['places: front is true or false', 'fields', p => { cellar(p).things.g3.front = 1; }, "pack.scenes[\"scene.cellar\"].things.g3.front: must be true or false"],
  ['places: pole on the grid', 'fields', p => { cellar(p).things.h2.pole = 601; }, "pack.scenes[\"scene.cellar\"].things.h2.pole: must be a whole number from 0 to 600"],
  ['places: no unknown field', 'fields', p => { cellar(p).things.g3.z = 1; }, "pack.scenes[\"scene.cellar\"].things.g3.z: is not a field here"],
  ['rests: at most 8', 'fields', p => { for (const i of range(6)) house(p).rests['r' + i] = { x: 0, y: 0, a: 'flat' }; }, "pack.scenes[\"scene.house\"].rests: must hold 0 to 8 rests, not 9"],
  ['rests: a place\'s box at most 240', 'fields', p => { house(p).rests.stool.w = 241; }, "pack.scenes[\"scene.house\"].rests.stool.w: must be a whole number from 1 to 240"],
  ['rests: a place\'s kind of the list', 'fields', p => { house(p).rests.stool.kind = 'shelf'; }, "pack.scenes[\"scene.house\"].rests.stool.kind: must be one of \"hang\", \"surface\", \"floor\""],
  ['rests: a frame\'s angle is upright, flat or a number', 'fields', p => { house(p).rests.pegs.a = 'tilted'; }, "pack.scenes[\"scene.house\"].rests.pegs.a: must be \"upright\", \"flat\" or a number of radians"],
  ['rests: a frame\'s angle from -3.142 to 3.142', 'fields', p => { house(p).rests.pegs.a = 3.2; }, "pack.scenes[\"scene.house\"].rests.pegs.a: must be a number from -3.142 to 3.142"],
  ['rests: from counts only from the spot', 'fields', p => { smithy(p).rests.anvil.from = 'wall'; }, "pack.scenes[\"scene.smithy\"].rests.anvil.from: must be \"spot\""],
  ['rests: x within 960', 'fields', p => { house(p).rests.pegs.x = 961; }, "pack.scenes[\"scene.house\"].rests.pegs.x: must be a whole number from -960 to 960"],
  ['rests: y on the grid', 'fields', p => { house(p).rests.pegs.y = -1; }, "pack.scenes[\"scene.house\"].rests.pegs.y: must be a whole number from 0 to 600"],
  ['rests: a frame has x, y and a', 'fields', p => { delete house(p).rests.pegs.a; }, "pack.scenes[\"scene.house\"].rests.pegs.a: is missing"],
  ['decor: at most 16 places', 'fields', p => { cellar(p).decor = Object.fromEntries(range(17).map(i => ['d' + i, { kind: 'floor', x: 0, y: 0, w: 1, h: 1 }])); }, "pack.scenes[\"scene.cellar\"].decor: must hold 0 to 16 places, not 17"],
  ['decor: a kind of the list', 'fields', p => { cellar(p).decor = { mantel: { kind: 'shelf', x: 890, y: 318, w: 90, h: 70 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.kind: must be one of \"hang\", \"surface\", \"floor\""],
  ['decor: a box at most 240', 'fields', p => { cellar(p).decor = { mantel: { kind: 'surface', x: 890, y: 318, w: 241, h: 70 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.w: must be a whole number from 1 to 240"],
  ['bed: zeds is required', 'fields', p => { delete house(p).bed.zeds; }, "pack.scenes[\"scene.house\"].bed.zeds: is missing"],
  ['bed: blanket is a group\'s id', 'fields', p => { house(p).bed.blanket = 'Blanket'; }, "pack.scenes[\"scene.house\"].bed.blanket: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['bed: head is a pair', 'fields', p => { house(p).bed.head = [1]; }, "pack.scenes[\"scene.house\"].bed.head: must be a pair [x, y]"],
  ['screen: glow is [x, y, r]', 'fields', p => { house(p).screen.glow = [764, 396]; }, "pack.scenes[\"scene.house\"].screen.glow: must be [x, y, r]"],
  ['screen: a glow\'s radius from 1', 'fields', p => { house(p).screen.glow[2] = 0; }, "pack.scenes[\"scene.house\"].screen.glow[2]: must be a multiple of 1/8 from 1 to 512"],
  ['seat: turn from 1 ms', 'fields', p => { court(p).seat.turn = 0; }, "pack.scenes[\"scene.court\"].seat.turn: must be a whole number from 1 to 600000"],
  ['seat: mouth to 600000 ms', 'fields', p => { court(p).seat.mouth = 600001; }, "pack.scenes[\"scene.court\"].seat.mouth: must be a whole number from 1 to 600000"],
  ['seat: x on the grid', 'fields', p => { court(p).seat.x = 961; }, "pack.scenes[\"scene.court\"].seat.x: must be a whole number from 0 to 960"],
  ['anvil: spark, when given, is a pair', 'fields', p => { smithy(p).anvil.spark = [132]; }, "pack.scenes[\"scene.smithy\"].anvil.spark: must be a pair [x, y]"],
  ['target: hitAt is required', 'fields', p => { delete yard(p).target.hitAt; }, "pack.scenes[\"scene.yard\"].target.hitAt: is missing"],
  ['target: every from 1 ms', 'fields', p => { yard(p).target.every = 0; }, "pack.scenes[\"scene.yard\"].target.every: must be a whole number from 1 to 600000"],
  ['target: aim is format 1.2', 'fields', p => { yard(p).target.aim = [713, 400]; }, "pack.scenes[\"scene.yard\"].target.aim: is not a field here"],
  ['foe: side is 1 or -1', 'fields', p => { battlement(p).foe.side = 2; }, "pack.scenes[\"scene.battlement\"].foe.side: must be 1 or -1"],
  ['foe: at most 4 spans', 'fields', p => { battlement(p).foe.spans = range(5).map(i => [i * 100, i * 100 + 50]); }, "pack.scenes[\"scene.battlement\"].foe.spans: must hold 1 to 4 entries, not 5"],
  ['foe: a span is [from, to]', 'fields', p => { battlement(p).foe.spans[0] = [70]; }, "pack.scenes[\"scene.battlement\"].foe.spans[0]: must be [from, to]"],
  ['foe: a span on the grid', 'fields', p => { battlement(p).foe.spans[0][1] = 961; }, "pack.scenes[\"scene.battlement\"].foe.spans[0][1]: must be a whole number from 0 to 960"],
  ['foe: a wall has a low line', 'fields', p => { delete battlement(p).foe.wall.low; }, "pack.scenes[\"scene.battlement\"].foe.wall.low: is missing"],
  ['foe: a wall\'s period from 2', 'fields', p => { battlement(p).foe.wall.period = 1; }, "pack.scenes[\"scene.battlement\"].foe.wall.period: must be a whole number from 2 to 960"],
  ['foe: a wall\'s high is [width, y]', 'fields', p => { battlement(p).foe.wall.high = [80]; }, "pack.scenes[\"scene.battlement\"].foe.wall.high: must be [width, y]"],
  ['foe: a wall\'s high width from 1', 'fields', p => { battlement(p).foe.wall.high[0] = 0; }, "pack.scenes[\"scene.battlement\"].foe.wall.high[0]: must be a whole number from 1 to 960"],
  ['foe: fires is format 1.2', 'fields', p => { battlement(p).foe.fires = {}; }, "pack.scenes[\"scene.battlement\"].foe.fires: is not a field here"],
  ['pole: at most 16 shapes', 'fields', p => { cellar(p).pole = range(17).map(() => rect()); }, "pack.scenes[\"scene.cellar\"].pole: must hold 1 to 16 entries, not 17"],
  ['pole: no tile in a pole', 'fields', p => { cellar(p).pole = [clone(tile(p))]; }, "pack.scenes[\"scene.cellar\"].pole[0].k: \"tile\" is allowed only in a layer of a scene, outside tiles"],
  ['sound: an object or absent', 'fields', p => { camp(p).sound = 'birdsong'; }, "pack.scenes[\"scene.camp\"].sound: must be an object"],
  ['companion: an object or absent', 'fields', p => { camp(p).companion = []; }, "pack.scenes[\"scene.camp\"].companion: must be an object"],
  // what a scene's shapes refer to
  ['names: the screen\'s edges only in a scene', 'references', p => { p.stamps.barrel[0].p[0] = { L: 1 }; }, "pack.stamps.barrel[0].p[0].L: cannot be used in a stamp"],
  ['names: x only inside a tile', 'references', p => { still(p)[2].p[0] = { x: 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0].x: is the tile's x, and cannot be used outside a tile"],
  ['names: h only inside a tile', 'references', p => { still(p)[2].p[1] = { c: 380, h: [3, 4] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[1].h: hashes the tile's x, and cannot be used outside a tile"],
  ['names: x not in the cast', 'references', p => { patron(p).still[0].shapes[0].pts[0][0] = { x: 1 }; }, "pack.cast[\"patron.a\"].still[0].shapes[0].pts[0][0].x: cannot be used in the cast"],
  ['names: wave not in a still layer', 'references', p => { still(p)[2].p[1] = { c: 380, wave: [2, 150, 0] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[1].wave: cannot be used in a still layer"],
  ['names: wave not in a prop', 'references', p => { kinds(p).camera.up.still[0].p[1] = { c: -64, wave: [1, 150, 0] }; }, "pack.props[\"props.medieval\"].kinds.camera.up.still[0].p[1].wave: cannot be used in a prop"],
  ['names: the knight\'s values not in a scene', 'references', p => { glow(p).p[1] = { c: 160, drop: 1 }; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].p[1].drop: cannot be used in a moving layer"],
  ['names: an unknown named value', 'references', p => { glow(p).p[1] = { c: 160, wobble: 1 }; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].p[1].wobble: is not a named value"],
  ['names: an effect\'s terms are checked', 'references', p => { kinds(p).pi.up.moving[0].p[1] = { c: -54, L: 1 }; }, "pack.props[\"props.medieval\"].kinds.pi.up.moving[0].p[1].L: cannot be used in a prop"],
  ['groups: a shape names a group of its layer', 'references', p => { house(p).moving[0].shapes[0].g = 'blanket'; }, "pack.scenes[\"scene.house\"].moving[0].shapes[0].g: names a group, \"blanket\", that the layer does not declare"],
  ['groups: a critter shape names a group of the critter', 'references', p => { fly(p).frames.flap0[0].g = 'legs'; }, "pack.cast[\"critter.fly\"].frames.flap0[0].g: names a group, \"legs\", that the critter does not declare"],
  ['colours: @pick only inside a tile', 'references', p => { still(p)[2].fill = '@pick.plank'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: names a pick, \"plank\", that no tile around it declares"],
  ['colours: @pick names a pick of its tile', 'references', p => { planks(p).shapes[0].fill = '@pick.board'; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].shapes[0].fill: names a pick, \"board\", that no tile around it declares"],
  ['colours: @lamp only in a stamp', 'references', p => { still(p)[2].fill = '@lamp.down'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: \"@lamp.down\" is the engine's down lamp, and may be named only in a stamp"],
  ['colours: @lamp not in a prop', 'references', p => { kinds(p).camera.up.still[0].fill = '@lamp.downHi'; }, "pack.props[\"props.medieval\"].kinds.camera.up.still[0].fill: \"@lamp.downHi\" is the engine's down lamp, and may be named only in a stamp"],
  ['colours: a reference to an unknown set', 'references', p => { still(p)[2].fill = '@cloak.1'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: names a palette set, \"cloak\", that does not exist"],
  ['colours: a reference to a missing entry', 'references', p => { still(p)[2].fill = '@base.s9'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill: names an entry, \"s9\", that set \"base\" does not have"],
  ['colours: a single colour in a pix key', 'references', p => { p.stamps['berry.lit'][0].key.r = '@base.steel'; }, "pack.stamps[\"berry.lit\"][0].key.r: needs a single colour here, and \"@base.steel\" is a band list"],
  ['colours: a mix of single colours', 'references', p => { still(p)[2].fill = { mix: ['@base.steel', '#000000'], k: 0.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.mix[0]: needs a single colour here, and \"@base.steel\" is a band list"],
  ['colours: a glow\'s colour is a single colour', 'references', p => { glow(p).colour = '@base.gold'; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].colour: needs a single colour here, and \"@base.gold\" is a band list"],
  ['colours: an effect\'s colour is checked', 'references', p => { still(p)[0].mortar = '@base.zz'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[0].mortar: names an entry, \"zz\", that set \"base\" does not have"],
  ['pix: every character in the key', 'references', p => { p.stamps['berry.lit'][0].rows[0] = '.z.'; }, "pack.stamps[\"berry.lit\"][0].rows[0]: uses \"z\", which the key does not map"],
  ['marks: a rest mark names a rest of the scene', 'references', p => { house(p).still[0].shapes[2].at = 'hook'; }, "pack.scenes[\"scene.house\"].still[0].shapes[2].at: names a rest, \"hook\", that the scene does not have"],
  ['marks: the weapon lies on a frame', 'references', p => { house(p).still[0].shapes[2].at = 'wall'; }, "pack.scenes[\"scene.house\"].still[0].shapes[2].at: the weapon lies on a frame, { x, y, a }, and \"wall\" is a place"],
  ['marks: a rest view goes in a place', 'references', p => { house(p).still[0].shapes[3].at = 'pegs'; }, "pack.scenes[\"scene.house\"].still[0].shapes[3].at: a rest view goes in a place, { kind, x, y, w, h }, and \"pegs\" is a frame"],
  ['marks: the patron needs a seat', 'references', p => { delete court(p).seat; court(p).can = []; }, "pack.scenes[\"scene.court\"].still[0].shapes[1].k: the patron mark needs the scene's seat"],
  ['marks: the bubble needs a seat', 'references', p => { delete court(p).seat; court(p).can = []; court(p).still[0].shapes.pop(); court(p).moving[0].shapes.shift(); }, "pack.scenes[\"scene.court\"].moving[0].shapes[0].k: the bubble mark needs the scene's seat"],
  ['marks: the sleeper needs a bed', 'references', p => { delete house(p).bed; house(p).can = house(p).can.filter(c => c !== 'night' && c !== 'container_unhealthy'); }, "pack.scenes[\"scene.house\"].moving[3].shapes[0].k: the sleeper mark needs the scene's bed"],
  ['marks: the target needs a target', 'references', p => { delete yard(p).target; delete yard(p).moving[0].anim; }, "pack.scenes[\"scene.yard\"].moving[0].shapes[0].k: the target mark needs the scene's target"],
  ['acts: the bed\'s blanket is a group of a layer', 'references', p => { house(p).bed.blanket = 'quilt'; }, "pack.scenes[\"scene.house\"].bed.blanket: names a group, \"quilt\", that no layer of the scene declares"],
  ['acts: the screen\'s group is a group of a layer', 'references', p => { house(p).screen.group = 'telly'; }, "pack.scenes[\"scene.house\"].screen.group: names a group, \"telly\", that no layer of the scene declares"],
  ['acts: the target\'s group is a group of a layer', 'references', p => { yard(p).target.group = 'post'; }, "pack.scenes[\"scene.yard\"].target.group: names a group, \"post\", that no layer of the scene declares"],
  ['acts: the anvil names a rest of the scene', 'references', p => { smithy(p).anvil.rest = 'block'; }, "pack.scenes[\"scene.smithy\"].anvil.rest: names a rest, \"block\", that the scene does not have"],
  ['when: tv needs a screen', 'references', p => { delete house(p).screen; house(p).can = house(p).can.filter(c => c !== 'streaming'); }, "pack.scenes[\"scene.house\"].moving[0].when[0]: \"tv\" needs the scene's screen"],
  ['when: inBed needs a bed', 'references', p => { yard(p).moving[1].when = ['inBed']; }, "pack.scenes[\"scene.yard\"].moving[1].when[0]: \"inBed\" needs the scene's bed"],
  ['when: strike needs an anvil', 'references', p => { yard(p).moving[1].when = ['!strike']; }, "pack.scenes[\"scene.yard\"].moving[1].when[0]: \"strike\" needs the scene's anvil"],
  ['anim: the hit trigger needs a target', 'references', p => { house(p).moving[1].anim = { ms: true, period: 300, loop: false, trigger: 'hit', tracks: [{ g: 'blanket', ch: 'dy', ease: 'linear', keys: [[0, 0]] }] }; }, "pack.scenes[\"scene.house\"].moving[1].anim.trigger: \"hit\" needs the scene's target"],
  ['anim: the strike trigger needs an anvil', 'references', p => { yard(p).moving[0].anim.trigger = 'strike'; }, "pack.scenes[\"scene.yard\"].moving[0].anim.trigger: \"strike\" needs the scene's anvil"],
  ['anim: a track names a group of its layer', 'references', p => { house(p).moving[0].anim.tracks[0].g = 'blanket'; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].g: names a group, \"blanket\", that the layer does not declare"],
  ['anim: a wave track names a group of its layer', 'references', p => { house(p).moving[0].anim.tracks[0] = { g: 'tv', ch: 'dx', wave: [1, 190, 0] }; }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[0].g: names a group, \"tv\", that the layer does not declare"],
  ['anim: a palette track names a set of the pack', 'references', p => { house(p).moving[0].anim.tracks.push({ pal: 'room.lamp', ease: 'linear', keys: [[0, '#000000']] }); }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[1].pal: must name a palette set of this pack, and \"room\" is not one"],
  ['anim: a palette track names an entry of the set', 'references', p => { p.palettes = { room: { lamp: '#000000' } }; provide(p); house(p).moving[0].anim.tracks.push({ pal: 'room.wick', ease: 'linear', keys: [[0, '#000000']] }); }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[1].pal: names an entry, \"wick\", that set \"room\" does not have"],
  ['anim: a palette track names a hex entry', 'references', p => { p.palettes = { room: { lamp: [[1, '#000000']] } }; provide(p); house(p).moving[0].anim.tracks.push({ pal: 'room.lamp', ease: 'linear', keys: [[0, '#000000']] }); }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[1].pal: must name an entry that is a hex colour"],
  // rules of a scene
  ['places: the pie\'s place is of class pie', 'rules', p => { cellar(p).things.pie.cls = 'high'; }, "pack.scenes[\"scene.cellar\"].things.pie.cls: must be \"pie\" for the place pie"],
  ['places: a class box stays on the grid', 'rules', p => { cellar(p).things.g3.x = 20; }, "pack.scenes[\"scene.cellar\"].things.g3: its class box, -16 510 61 570, leaves the 960 by 600 grid"],
  ['places: a flipped class box stays on the grid', 'rules', p => { cellar(p).things.h3.x = 31; }, "pack.scenes[\"scene.cellar\"].things.h3: its class box, -1 236 65 300, leaves the 960 by 600 grid"],
  ['places: a high base at y 300 or lower', 'rules', p => { cellar(p).things.h2.y = 299; }, "pack.scenes[\"scene.cellar\"].things.h2.y: a high place's base must be at y 300 or lower, clear of the headline"],
  ['places: a ground base from 500', 'rules', p => { cellar(p).things.g3.y = 499; }, "pack.scenes[\"scene.cellar\"].things.g3.y: a ground place's base must be from 500 to 598"],
  ['places: a ground base to 598, as its class box on the grid holds it', 'rules', p => { cellar(p).things.g3.y = 599; }, "pack.scenes[\"scene.cellar\"].things.g3: its class box, 164 541 241 601, leaves the 960 by 600 grid"],
  ['places: no two class boxes overlap', 'rules', p => { cellar(p).things.g3.x = 420; }, "pack.scenes[\"scene.cellar\"].things: the class boxes of g2 and g3 overlap"],
  ['can: attack needs the weapon held', 'rules', p => { battlement(p).weapon = 'away'; }, "pack.scenes[\"scene.battlement\"].can[0]: the scene cannot act \"attack\": it needs the weapon held"],
  ['can: wan_down needs a layer for cond:wan_down', 'rules', p => { battlement(p).moving[1].when = ['cond:attack']; }, "pack.scenes[\"scene.battlement\"].can[1]: the scene cannot act \"wan_down\": it needs a layer whose when names cond:wan_down"],
  ['can: container_unhealthy needs a bed', 'rules', p => { cellar(p).can.push('container_unhealthy'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"container_unhealthy\": it needs a bed"],
  ['can: night needs a bed', 'rules', p => { cellar(p).can.push('night'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"night\": it needs a bed"],
  ['can: disk_full needs two spots in the rounds', 'rules', p => { cellar(p).rounds[1].x = 124; }, "pack.scenes[\"scene.cellar\"].can[0]: the scene cannot act \"disk_full\": it needs rounds at two different spots, to carry the crate between"],
  ['can: pi_silent needs the pie right of the spot', 'rules', p => { house(p).spot = 140; }, "pack.scenes[\"scene.house\"].can[2]: the scene cannot act \"pi_silent\": it needs the pie's place to the right of the spot"],
  ['can: device_down needs a quiet scene', 'rules', p => { cellar(p).can.push('device_down'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"device_down\": it needs quiet true"],
  ['can: memory_tight needs a quiet scene', 'rules', p => { cellar(p).can.push('memory_tight'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"memory_tight\": it needs quiet true"],
  ['can: ssh_session needs a seat', 'rules', p => { cellar(p).can.push('ssh_session'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"ssh_session\": it needs a seat"],
  ['can: updating needs an anvil', 'rules', p => { cellar(p).can.push('updating'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"updating\": it needs an anvil, with a rest for the weapon"],
  ['can: updating needs a rest for the weapon on the anvil', 'rules', p => { smithy(p).anvil.rest = 'wall'; }, "pack.scenes[\"scene.smithy\"].can[0]: the scene cannot act \"updating\": it needs an anvil, with a rest for the weapon"],
  ['can: streaming needs a screen', 'rules', p => { cellar(p).can.push('streaming'); }, "pack.scenes[\"scene.cellar\"].can[3]: the scene cannot act \"streaming\": it needs a screen"],
  ['hosts: a foe needs a foe zone', 'rules', p => { cellar(p).hosts.push('foe'); }, "pack.scenes[\"scene.cellar\"].hosts: a scene hosts a foe only with a foe zone, foe"],
  ['marks: a scene draws the things once, not twice', 'rules', p => { moving(p).push({ k: 'things' }); }, "pack.scenes[\"scene.cellar\"]: a scene draws the devices once: it needs exactly one things mark, not 2"],
  ['marks: a scene draws the things once, not never', 'rules', p => { moving(p).pop(); }, "pack.scenes[\"scene.cellar\"]: a scene draws the devices once: it needs exactly one things mark, not 0"],
  ['groups: one name in one layer of a scene', 'rules', p => { house(p).moving[1].groups.breath = { pivot: [0, 0] }; }, "pack.scenes[\"scene.house\"].moving[1].groups.breath: a group of this name is declared in another layer of the scene"],
  ['anim: one track for each thing it drives', 'rules', p => { house(p).moving[0].anim.tracks.push(clone(house(p).moving[0].anim.tracks[0])); }, "pack.scenes[\"scene.house\"].moving[0].anim.tracks[1]: drives what an earlier track already drives"],
  ['foe: a span\'s from below its to', 'rules', p => { battlement(p).foe.spans[0] = [890, 70]; }, "pack.scenes[\"scene.battlement\"].foe.spans[0]: from must be below to"],
  ['foe: a wall\'s high width less than its period', 'rules', p => { battlement(p).foe.wall.high[0] = 160; }, "pack.scenes[\"scene.battlement\"].foe.wall.high: the width must be less than the period"],
  ['target: hitAt before every', 'rules', p => { yard(p).target.hitAt = 5600; }, "pack.scenes[\"scene.yard\"].target.hitAt: must be less than every"],
  ['ranges: an offset on R stays within 2048', 'rules', p => { still(p)[2].p[0] = { c: 200, R: 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0]: the offset reaches 2136 at its greatest, above 2048"],
  ['ranges: a length on W stays within 4096', 'rules', p => { still(p)[2].w = { W: 2 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].w: the length reaches 5824 at its greatest, above 4096"],
  ['ranges: an offset in a tile, x at its greatest, stays within 2048', 'rules', p => { tile(p).shapes[0].p[0] = { x: 1, c: 200 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[0].p[0]: the offset reaches 2136 at its greatest, above 2048"],
  ['ranges: a hash in a tile counts at its greatest', 'rules', p => { planks(p).shapes[0].h = { c: 4000, h: [3, 300] }; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].shapes[0].h: the length reaches 4299 at its greatest, above 4096"],
  ['ranges: a radius stays from 1', 'rules', p => { cellar(p).moving[0].shapes.push({ k: 'ell', p: [0, 0], rx: { c: 0.5, wave: [1, 100, 0] }, ry: 2, fill: '@base.k' }); }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[3].rx: the radius reaches -0.5 at its least, below 1"],
  ['ranges: an alpha with its wave stays within 1', 'rules', p => { glow(p).a.c = 0.99; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].a: the alpha reaches 1.015 at its greatest, above 1"],
  ['ranges: a glow\'s radius stays from 1', 'rules', p => { glow(p).r = { c: 0.5 }; }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[0].r: the radius reaches 0.5 at its least, below 1"],
  ['ranges: a tile\'s from stays within 2048', 'rules', p => { tile(p).from = { L: 2.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].from: the offset reaches -2440 at its least, below -2048"],
  ['ranges: a clip stays within 2048', 'rules', p => { still(p)[2] = { k: 'ell', p: [0, 0], rx: 4, ry: 4, fill: '@base.k', clip: [{ R: 1, c: 200 }, null] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].clip[0]: the offset reaches 2136 at its greatest, above 2048"],
  ['polygons: convex', 'rules', p => { house(p).moving[0].shapes[0].pts[3] = [289, 460]; }, "pack.scenes[\"scene.house\"].moving[0].shapes[0].pts: must be a convex polygon, its points in order"],
  ['polygons: no point twice', 'rules', p => { house(p).moving[0].shapes[0].pts[1] = [129, 465]; }, "pack.scenes[\"scene.house\"].moving[0].shapes[0].pts[1]: is the same point as the one before it"],
  // the cast
  ['cast: a member is an object', 'fields', p => { p.cast['foe.goblin'] = 'goblin'; }, "pack.cast[\"foe.goblin\"]: must be an object"],
  ['cast: role is required', 'fields', p => { delete goblin(p).role; }, "pack.cast[\"foe.goblin\"].role: is missing"],
  ['cast: a role of the list', 'fields', p => { goblin(p).role = 'dog'; }, "pack.cast[\"foe.goblin\"].role: must be one of \"patron\", \"foe\", \"critter\", \"pet\""],
  ['cast: name of 49 characters', 'fields', p => { goblin(p).name = 'g'.repeat(49); }, "pack.cast[\"foe.goblin\"].name: must be 1 to 48 characters, not 49"],
  ['cast: a field the role does not take', 'fields', p => { goblin(p).box = [10, 10]; }, "pack.cast[\"foe.goblin\"].box: is not a field here"],
  ['patron: box is [w, h]', 'fields', p => { patron(p).box = [180]; }, "pack.cast[\"patron.a\"].box: must be [w, h]"],
  ['patron: box at most 200 wide', 'fields', p => { patron(p).box[0] = 201; }, "pack.cast[\"patron.a\"].box[0]: must be a whole number from 1 to 200"],
  ['patron: box at most 360 tall', 'fields', p => { patron(p).box[1] = 361; }, "pack.cast[\"patron.a\"].box[1]: must be a whole number from 1 to 360"],
  ['patron: the three anchors', 'fields', p => { delete patron(p).anchors.mouth; }, "pack.cast[\"patron.a\"].anchors.mouth: is missing"],
  ['patron: no other anchor', 'fields', p => { patron(p).anchors.hand = [0, 0]; }, "pack.cast[\"patron.a\"].anchors.hand: is not a field here"],
  ['patron: an anchor is a pair', 'fields', p => { patron(p).anchors.eyes = [0]; }, "pack.cast[\"patron.a\"].anchors.eyes: must be a pair [x, y]"],
  ['patron: sets bind the user\'s sets', 'fields', p => { patron(p).sets.cloak = 'cape'; }, "pack.cast[\"patron.a\"].sets.cloak: must be one of \"skin\", \"hair\", \"tabard\", \"plume\""],
  ['patron: sets may not bind base', 'fields', p => { patron(p).sets.base = 'skin'; }, "pack.cast[\"patron.a\"].sets.base: is a reserved set name"],
  ['patron: a set named for a user set binds that set', 'fields', p => { patron(p).sets.skin = 'hair'; }, "pack.cast[\"patron.a\"].sets.skin: a set named for one of the user's sets must bind that set"],
  ['patron: at most 4 sets', 'fields', p => { Object.assign(patron(p).sets, { a: 'skin', b: 'hair' }); }, "pack.cast[\"patron.a\"].sets: must hold 1 to 4 sets, not 5"],
  ['patron: own gives only sets it binds', 'fields', p => { patron(p).own.cape = clone(patron(p).own.robe); }, "pack.cast[\"patron.a\"].own.cape: is not a set this figure binds in sets"],
  ['patron: own gives every entry of its set', 'fields', p => { delete patron(p).own.hair.brow; }, "pack.cast[\"patron.a\"].own.hair.brow: is missing"],
  ['patron: own gives literal colours', 'fields', p => { patron(p).own.robe[0] = '@base.r0'; }, "pack.cast[\"patron.a\"].own.robe[\"0\"]: must be a hex colour such as \"#3f74e0\" or a translucent colour"],
  ['patron: own gives the skin\'s ramps as band lists', 'fields', p => { patron(p).own.skin = { face: '#ffe3c4', sick: [[1, '#000000']], hot: [[1, '#000000']], cheek: '#000000', puff: '#000000' }; }, "pack.cast[\"patron.a\"].own.skin.face: must be a band list"],
  ['patron: palettes may not take a bound name', 'fields', p => { patron(p).palettes.robe = { a: '#000000' }; }, "pack.cast[\"patron.a\"].palettes.robe: is a reserved set name, or one this figure binds"],
  ['patron: palettes may not take a user set\'s name', 'fields', p => { patron(p).palettes.plume = { a: '#000000' }; }, "pack.cast[\"patron.a\"].palettes.plume: is a reserved set name, or one this figure binds"],
  ['patron: palettes may not take pick', 'fields', p => { patron(p).palettes.pick = { a: '#000000' }; }, "pack.cast[\"patron.a\"].palettes.pick: is a reserved set name, or one this figure binds"],
  ['patron: a palette entry is a fill', 'fields', p => { patron(p).palettes.mon.iris = 'brown'; }, "pack.cast[\"patron.a\"].palettes.mon.iris: must be a hex colour, a reference such as \"@base.k\", a translucent colour, a mix or a contrast"],
  ['patron: at least one part in still', 'fields', p => { patron(p).still = []; }, "pack.cast[\"patron.a\"].still: must hold 1 to 16 entries, not 0"],
  ['patron: a part names an anchor', 'fields', p => { patron(p).still[0].at = 7; }, "pack.cast[\"patron.a\"].still[0].at: must be an anchor name"],
  ['patron: a part has at and shapes alone', 'fields', p => { patron(p).still[0].side = 'L'; }, "pack.cast[\"patron.a\"].still[0].side: is not a field here"],
  ['patron: states shut and open', 'fields', p => { delete patron(p).states.open; }, "pack.cast[\"patron.a\"].states.open: is missing"],
  ['patron: no other state', 'fields', p => { patron(p).states.smile = [rect()]; }, "pack.cast[\"patron.a\"].states.smile: is not a field here"],
  ['patron: a state has at least one shape', 'fields', p => { patron(p).states.shut = []; }, "pack.cast[\"patron.a\"].states.shut: must hold 1 to 128 entries, not 0"],
  ['foe: sprite at most 256', 'fields', p => { goblin(p).sprite.size = [257, 230]; }, "pack.cast[\"foe.goblin\"].sprite.size[0]: must be a whole number from 1 to 256"],
  ['foe: feet is a pair', 'fields', p => { goblin(p).sprite.feet = [110]; }, "pack.cast[\"foe.goblin\"].sprite.feet: must be a pair [x, y]"],
  ['foe: feet are whole numbers', 'fields', p => { goblin(p).sprite.feet[0] = 110.5; }, "pack.cast[\"foe.goblin\"].sprite.feet[0]: must be a whole number from 0 to 256"],
  ['foe: h from 1', 'fields', p => { goblin(p).h = 0; }, "pack.cast[\"foe.goblin\"].h: must be a whole number from 1 to 256"],
  ['foe: mid to 256', 'fields', p => { goblin(p).mid = 257; }, "pack.cast[\"foe.goblin\"].mid: must be a whole number from 0 to 256"],
  ['foe: at least one crown point', 'fields', p => { goblin(p).crown = []; }, "pack.cast[\"foe.goblin\"].crown: must hold 1 to 32 entries, not 0"],
  ['foe: at most 32 crown points', 'fields', p => { goblin(p).crown = range(33).map(() => [0, -100]); }, "pack.cast[\"foe.goblin\"].crown: must hold 1 to 32 entries, not 33"],
  ['foe: an exit of the engine\'s', 'fields', p => { goblin(p).exit = 'explode'; }, "pack.cast[\"foe.goblin\"].exit: must be one of \"poof\""],
  ['foe: at most 16 parts', 'fields', p => { for (const i of range(15)) goblin(p).parts['p' + i] = [rect()]; }, "pack.cast[\"foe.goblin\"].parts: must hold 0 to 16 parts, not 17"],
  ['foe: the six poses', 'fields', p => { delete goblin(p).poses.hit; }, "pack.cast[\"foe.goblin\"].poses.hit: is missing"],
  ['foe: no seventh pose in 1.1', 'fields', p => { goblin(p).poses.aim = clone(goblin(p).poses.hit); }, "pack.cast[\"foe.goblin\"].poses.aim: is not a field here"],
  ['foe: fires is format 1.2', 'fields', p => { goblin(p).fires = { muzzle: [-34, -70] }; }, "pack.cast[\"foe.goblin\"].fires: is not a field here"],
  ['foe: a pose names each part once', 'fields', p => { goblin(p).poses.hit.parts.push('legs'); }, "pack.cast[\"foe.goblin\"].poses.hit.parts[2]: appears twice"],
  ['foe: a pose\'s parts are ids', 'fields', p => { goblin(p).poses.hit.parts[0] = 'Legs'; }, "pack.cast[\"foe.goblin\"].poses.hit.parts[0]: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['foe: a pose has parts and shapes', 'fields', p => { delete goblin(p).poses.hit.shapes; }, "pack.cast[\"foe.goblin\"].poses.hit.shapes: is missing"],
  ['critter: both frames', 'fields', p => { delete fly(p).frames.flap1; }, "pack.cast[\"critter.fly\"].frames.flap1: is missing"],
  ['critter: no third frame', 'fields', p => { fly(p).frames.flap2 = clone(fly(p).frames.flap1); }, "pack.cast[\"critter.fly\"].frames.flap2: is not a field here"],
  ['critter: an alpha from 0 to 1', 'fields', p => { fly(p).alpha.wings = 1.5; }, "pack.cast[\"critter.fly\"].alpha.wings: must be a number from 0 to 1"],
  ['critter: 9 groups', 'fields', p => { for (const i of range(8)) fly(p).groups['g' + i] = { pivot: [0, 0] }; }, "pack.cast[\"critter.fly\"].groups: must hold 0 to 8 groups, not 9"],
  ['critter: what falls takes no group', 'fields', p => { fly(p).dead[0].g = 'wings'; }, "pack.cast[\"critter.fly\"].dead[0].g: is not a field here"],
  ['critter: what falls has a shape', 'fields', p => { fly(p).dead = []; }, "pack.cast[\"critter.fly\"].dead: must hold 1 to 64 entries, not 0"],
  ['cast: a part names an anchor the patron has', 'references', p => { patron(p).still[0].at = 'hand'; }, "pack.cast[\"patron.a\"].still[0].at: names an anchor, \"hand\", that the patron does not have"],
  ['cast: a shape names an anchor the patron has', 'references', p => { patron(p).states.shut[0].at = 'nose'; }, "pack.cast[\"patron.a\"].states.shut[0].at: names an anchor, \"nose\", that the patron does not have"],
  ['cast: the user\'s sets only through sets', 'references', p => { patron(p).still[0].shapes[0].fill = '@plume.0'; }, "pack.cast[\"patron.a\"].still[0].shapes[0].fill: the cast names the user's colour sets only through its sets"],
  ['cast: a foe names no user set', 'references', p => { goblin(p).parts.legs[0].fill = '@tabard.1'; }, "pack.cast[\"foe.goblin\"].parts.legs[0].fill: the cast names the user's colour sets only through its sets"],
  ['cast: a bound set\'s entry exists', 'references', p => { patron(p).still[0].shapes[0].fill = '@robe.9'; }, "pack.cast[\"patron.a\"].still[0].shapes[0].fill: names an entry, \"9\", that set \"robe\" does not have"],
  ['cast: a bound skin ramp is a band list', 'references', p => { patron(p).states.shut[0].fill = { mix: ['@skin.face', '#000000'], k: 0.5 }; }, "pack.cast[\"patron.a\"].states.shut[0].fill.mix[0]: needs a single colour here, and \"@skin.face\" is a band list"],
  ['cast: an own palette\'s entry exists', 'references', p => { patron(p).states.shut[0].fill = '@mon.pupil'; }, "pack.cast[\"patron.a\"].states.shut[0].fill: names an entry, \"pupil\", that set \"mon\" does not have"],
  ['cast: a palette refers only to @base and bound sets', 'references', p => { patron(p).palettes.mon.iris = '@mon.dark'; }, "pack.cast[\"patron.a\"].palettes.mon.iris: a palette of the cast may refer only to @base and the sets the figure binds"],
  ['colours: a contrast\'s colours are single', 'references', p => { still(p)[2].fill = { contrast: ['@base.steel', '#000000'], on: '#ffffff' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.contrast[0]: needs a single colour here, and \"@base.steel\" is a band list"],
  ['colours: a contrast on a band list names its band', 'references', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'], on: '@base.steel' }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.on: needs a single colour here, and \"@base.steel\" is a band list"],
  ['colours: a contrast\'s band picks from a band list', 'references', p => { still(p)[2].fill = { contrast: ['#000000', '#ffffff'], on: '@base.k', band: 1 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.band: picks a band of a band list, and \"@base.k\" is a single colour"],
  ['cast: a contrast in a palette refers only to @base and bound sets', 'references', p => { patron(p).palettes.mon.brow = { contrast: ['@plume.0', '#000000'], on: '@skin.cheek' }; }, "pack.cast[\"patron.a\"].palettes.mon.brow.contrast[0]: a palette of the cast may refer only to @base and the sets the figure binds"],
  ['cast: a contrast in a palette on a bound band list names its band', 'references', p => { patron(p).palettes.mon.brow = { contrast: ['@hair.0', '#000000'], on: '@skin.face' }; }, "pack.cast[\"patron.a\"].palettes.mon.brow.on: needs a single colour here, and \"@skin.face\" is a band list"],
  ['cast: drawn refers only to @base and bound sets', 'references', p => { patron(p).palettes.mon.dark = { drawn: '@mon.iris', dressed: '#000000', set: 'hair' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.drawn: a palette of the cast may refer only to @base and the sets the figure binds"],
  ['cast: dressed refers only to @base and bound sets', 'references', p => { patron(p).palettes.mon.dark = { drawn: '#3f2410', dressed: { mix: ['@plume.2', '#000000'], k: 0.3 }, set: 'hair' }; }, "pack.cast[\"patron.a\"].palettes.mon.dark.dressed.mix[0]: a palette of the cast may refer only to @base and the sets the figure binds"],
  ['cast: a palette\'s mix refers only to @base and bound sets', 'references', p => { patron(p).palettes.mon.dark.mix[0] = '@plume.2'; }, "pack.cast[\"patron.a\"].palettes.mon.dark.mix[0]: a palette of the cast may refer only to @base and the sets the figure binds"],
  ['cast: a palette\'s reference to a bound set exists', 'references', p => { patron(p).palettes.mon.iris = '@hair.9'; }, "pack.cast[\"patron.a\"].palettes.mon.iris: names an entry, \"9\", that set \"hair\" does not have"],
  ['cast: a pose names a part the foe has', 'references', p => { goblin(p).poses.hit.parts.push('tail'); }, "pack.cast[\"foe.goblin\"].poses.hit.parts[2]: names a part, \"tail\", that the foe does not have"],
  ['cast: an alpha names a group of the critter', 'references', p => { fly(p).alpha.legs = 1; }, "pack.cast[\"critter.fly\"].alpha.legs: names a group, \"legs\", that the critter does not declare"],
  ['cast: an anchor of the patron lies in its box', 'rules', p => { patron(p).anchors.eyes = [0, -341]; }, "pack.cast[\"patron.a\"].anchors.eyes: must lie in the patron's box, x within half its width and y up to its height above the seat"],
  ['cast: an anchor of the patron lies within half its width', 'rules', p => { patron(p).anchors.mouth = [91, -193]; }, "pack.cast[\"patron.a\"].anchors.mouth: must lie in the patron's box, x within half its width and y up to its height above the seat"],
  ['cast: a foe\'s feet lie in its sprite', 'rules', p => { goblin(p).sprite.feet = [221, 214]; }, "pack.cast[\"foe.goblin\"].sprite.feet: must lie in the sprite"],
  ['cast: a crown point lies in the sprite', 'rules', p => { goblin(p).crown[0] = [-111, -119]; }, "pack.cast[\"foe.goblin\"].crown[0]: must lie in the sprite, from its feet"],
  ['cast: a crown point lies above the sprite\'s foot', 'rules', p => { goblin(p).crown[0] = [0, 17]; }, "pack.cast[\"foe.goblin\"].crown[0]: must lie in the sprite, from its feet"],
  ['cast: 17 members', 'counts', p => { for (const i of range(13)) p.cast['fly' + i] = clone(fly(p)); }, "pack.cast: holds 17 cast members, more than 16"],
  ['cast: the patron\'s still parts over 16000', 'counts', p => { patron(p).still.push(...range(5).map(() => ({ at: 'seat', shapes: range(13).map(() => big(256, '@skin.face')) }))); }, "pack.cast[\"patron.a\"].still: costs up to 134485 fills, more than 16000"],
  ['cast: a mouth over 400', 'counts', p => { patron(p).states.open.push(big(390)); }, "pack.cast[\"patron.a\"].states.open: costs up to 406 fills, more than 400"],
  ['cast: a pose over 8000', 'counts', p => { goblin(p).poses.hit.shapes = range(31).map(() => big(256)); }, "pack.cast[\"foe.goblin\"].poses.hit: costs up to 8037 fills, more than 8000"],
  ['cast: a critter frame over 200', 'counts', p => { fly(p).frames.flap1.push(big(177)); }, "pack.cast[\"critter.fly\"].frames.flap1: costs up to 201 fills, more than 200"],
  ['cast: what falls over 200', 'counts', p => { fly(p).dead.push(big(200)); }, "pack.cast[\"critter.fly\"].dead: costs up to 201 fills, more than 200"],
  // props
  ['props: a set has a name', 'fields', p => { delete p.props['props.medieval'].name; }, "pack.props[\"props.medieval\"].name: is missing"],
  ['props: kinds of the engine\'s', 'fields', p => { kinds(p).phone = clone(kinds(p).camera); }, "pack.props[\"props.medieval\"].kinds.phone: is not a field here"],
  ['props: at least one kind', 'fields', p => { p.props['props.medieval'].kinds = {}; }, "pack.props[\"props.medieval\"].kinds: must give at least one kind"],
  ['props: a kind has up and gone', 'fields', p => { delete kinds(p).camera.gone; }, "pack.props[\"props.medieval\"].kinds.camera.gone: is missing"],
  ['props: a mark at most 128', 'fields', p => { kinds(p).camera.mark = 129; }, "pack.props[\"props.medieval\"].kinds.camera.mark: must be a whole number from 1 to 128"],
  ['props: a mark from 1', 'fields', p => { kinds(p).camera.mark = 0; }, "pack.props[\"props.medieval\"].kinds.camera.mark: must be a whole number from 1 to 128"],
  ['props: a state has a still part', 'fields', p => { delete kinds(p).camera.up.still; }, "pack.props[\"props.medieval\"].kinds.camera.up.still: is missing"],
  ['props: a state has a lamp', 'fields', p => { delete kinds(p).camera.up.lamp; }, "pack.props[\"props.medieval\"].kinds.camera.up.lamp: is missing"],
  ['props: a moving part of 129 shapes', 'fields', p => { kinds(p).pi.up.moving = range(129).map(() => rect()); }, "pack.props[\"props.medieval\"].kinds.pi.up.moving: must hold 1 to 128 entries, not 129"],
  ['props: no tile in a prop', 'fields', p => { kinds(p).camera.up.still.push({ k: 'tile', step: 4, phase: 0, from: 0, to: 1, shapes: [rect()] }); }, "pack.props[\"props.medieval\"].kinds.camera.up.still[2].k: \"tile\" is allowed only in a layer of a scene, outside tiles"],
  ['props: a lamp is a pair', 'fields', p => { kinds(p).camera.up.lamp = [-8]; }, "pack.props[\"props.medieval\"].kinds.camera.up.lamp: must be a pair [x, y]"],
  ['props: a lamp\'s box at most 64', 'fields', p => { kinds(p).pi.up.lamp.box = [65, 34]; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.box[0]: must be a whole number from 1 to 64"],
  ['props: a lamp\'s drawings are stamps', 'fields', p => { kinds(p).pi.up.lamp.lit = 'Berry'; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.lit: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['props: a lamp\'s light is hex', 'fields', p => { kinds(p).pi.up.lamp.light = '@base.r1'; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.light: must be a hex colour"],
  ['props: a gone lamp has no light of its own', 'fields', p => { kinds(p).pi.gone.lamp.light = '#ff7a6a'; }, "pack.props[\"props.medieval\"].kinds.pi.gone.lamp.light: is not a field here"],
  ['props: a lamp\'s drawing is a stamp of the pack', 'references', p => { kinds(p).pi.up.lamp.dark = 'berry.black'; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.dark: names a stamp, \"berry.black\", that the pack does not have"],
  ['props: a drawing within its class box', 'rules', p => { kinds(p).camera.up.still[0].p = [30, -64]; }, "pack.props[\"props.medieval\"].kinds.camera.up.still[0]: paints 30 -64 40 -36, outside the high class box, -34 -64 32 0, from the base"],
  ['props: a drawing within its class box, above the base', 'rules', p => { kinds(p).camera.gone.still[1].p = [24, -66]; }, "pack.props[\"props.medieval\"].kinds.camera.gone.still[1]: paints 24 -66 30 -42, outside the high class box, -34 -64 32 0, from the base"],
  ['props: a drawing within its class box, a stamp counted', 'rules', p => { kinds(p).pi.up.still.push({ k: 'use', stamp: 'barrel', p: [0, 40] }); }, "pack.props[\"props.medieval\"].kinds.pi.up.still[1]: paints -30 -32 30 40, outside the pie class box, -46 -107 45 33, from the base"],
  ['props: the engine\'s lamp within the class box', 'rules', p => { kinds(p).camera.up.lamp = [30, -40]; }, "pack.props[\"props.medieval\"].kinds.camera.up.lamp: paints 24 -46 36 -34, outside the high class box, -34 -64 32 0, from the base"],
  ['props: a lamp of its own within the class box', 'rules', p => { kinds(p).pi.up.lamp.at = [40, -54]; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp: paints 26.5 -71 53.5 -37, outside the pie class box, -46 -107 45 33, from the base"],
  ['props: a lamp\'s drawings are pix only', 'rules', p => { kinds(p).pi.up.lamp.dark = 'sconce'; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.dark: a lamp's dark drawing is a stamp of pix shapes only"],
  ['props: a gone lamp\'s lit drawing uses only the down red', 'rules', p => { kinds(p).pi.gone.lamp.lit = 'berry.lit'; }, "pack.props[\"props.medieval\"].kinds.pi.gone.lamp.lit: a gone lamp's lit drawing uses only the down lamp's reds, @lamp.down, @lamp.downLo and @lamp.downHi, so a device that is down blinks red in every world"],
  ['props: a gone lamp\'s lit drawing uses no red but the reserved ones', 'rules', p => { p.stamps['berry.down'][0].key.R = '#a83128'; }, "pack.props[\"props.medieval\"].kinds.pi.gone.lamp.lit: a gone lamp's lit drawing uses only the down lamp's reds, @lamp.down, @lamp.downLo and @lamp.downHi, so a device that is down blinks red in every world"],
  ['props: a strip within its class box, by the pixels it fills', 'rules', p => { kinds(p).camera.up.still.push({ k: 'strip', p0: [0, -40], p1: [40, -38], hw0: 2, hw1: 2, fill: '@base.k' }); }, "pack.props[\"props.medieval\"].kinds.camera.up.still[2]: paints 0 -42 40 -36, outside the high class box, -34 -64 32 0, from the base"],
  ['props: 9 prop sets', 'counts', p => { for (const i of range(8)) p.props['props.' + i] = clone(p.props['props.medieval']); }, "pack.props: holds 9 prop sets, more than 8"],
  ['props: a still part over 4000', 'counts', p => { kinds(p).camera.up.still.push(...range(66).map(() => big(60))); }, "pack.props[\"props.medieval\"].kinds.camera.up.still: costs up to 4060 fills, more than 4000"],
  ['props: a moving part and its lamp over 600', 'counts', p => { kinds(p).pi.up.moving.push(...range(10).map(() => big(60))); }, "pack.props[\"props.medieval\"].kinds.pi.up: costs up to 653 fills in its moving part and its own lamp, more than 600"],
  // words
  ['words: a name', 'fields', p => { delete words(p).name; }, "pack.words[\"words.medieval\"].name: is missing"],
  ['words: the watcher', 'fields', p => { delete words(p).watcher; }, "pack.words[\"words.medieval\"].watcher: is missing"],
  ['words: the watcher of 33 characters', 'fields', p => { words(p).watcher = 'w'.repeat(33); }, "pack.words[\"words.medieval\"].watcher: must be 1 to 32 characters, not 33"],
  ['words: labels of the list', 'fields', p => { words(p).labels.knight = 'The knight'; }, "pack.words[\"words.medieval\"].labels.knight: is not a field here"],
  ['words: a label of 33 characters', 'fields', p => { words(p).labels.foe = 'f'.repeat(33); }, "pack.words[\"words.medieval\"].labels.foe: must be 1 to 32 characters, not 33"],
  ['words: quiet parts of the list', 'fields', p => { words(p).quiet.stars = ['{n} stars']; }, "pack.words[\"words.medieval\"].quiet.stars: is not a field here"],
  ['words: captions of the list', 'fields', p => { words(p).captions.ad_blocked = ['SLAIN']; }, "pack.words[\"words.medieval\"].captions.ad_blocked: is not a field here"],
  ['words: at least one template', 'fields', p => { words(p).quiet.up = []; }, "pack.words[\"words.medieval\"].quiet.up: must hold 1 to 8 entries, not 0"],
  ['words: at most 8 templates', 'fields', p => { words(p).quiet.up = range(9).map(() => '{n} up'); }, "pack.words[\"words.medieval\"].quiet.up: must hold 1 to 8 entries, not 9"],
  ['words: a template of 33 characters', 'fields', p => { words(p).quiet.up = ['u'.repeat(33)]; }, "pack.words[\"words.medieval\"].quiet.up[0]: must be 1 to 32 characters, not 33"],
  ['words: a template is one line', 'fields', p => { words(p).quiet.up = ['{n}\nup']; }, "pack.words[\"words.medieval\"].quiet.up[0]: must be one line, with no control characters"],
  ['words: a template is ASCII and the middle dot', 'fields', p => { words(p).captions.import = ['LIVRÉ · {title}']; }, "pack.words[\"words.medieval\"].captions.import[0]: must be printable ASCII and \"·\" only"],
  ['words: a template closes its placeholders', 'fields', p => { words(p).quiet.up = ['{n up']; }, "pack.words[\"words.medieval\"].quiet.up[0]: must close every placeholder it opens, as in {n}"],
  ['words: a template has no stray brace', 'fields', p => { words(p).quiet.up = ['{n} up}']; }, "pack.words[\"words.medieval\"].quiet.up[0]: must close every placeholder it opens, as in {n}"],
  ['words: a template is text', 'fields', p => { words(p).quiet.up = [4]; }, "pack.words[\"words.medieval\"].quiet.up[0]: must be a string"],
  ['words: a placeholder its part gives', 'references', p => { words(p).quiet.up = ['{at} up']; }, "pack.words[\"words.medieval\"].quiet.up[0]: uses {at}, which up does not give: it gives {n}"],
  ['words: no placeholder in a part that gives none', 'references', p => { words(p).quiet.quiet = ['ALL QUIET {n}']; }, "pack.words[\"words.medieval\"].quiet.quiet[0]: uses {n}, which quiet does not give"],
  ['words: a caption\'s placeholder', 'references', p => { words(p).captions.ip_banned[1] = 'BANISHED {title}'; }, "pack.words[\"words.medieval\"].captions.ip_banned[1]: uses {title}, which ip_banned does not give: it gives {addr}, {jail}"],
  ['words: templates run longest first', 'rules', p => { words(p).captions.ip_banned.reverse(); }, "pack.words[\"words.medieval\"].captions.ip_banned[1]: the templates of a part run longest first, by their text outside the placeholders"],
  ['words: 9 word sets', 'counts', p => { for (const i of range(8)) p.words['words.' + i] = clone(words(p)); }, "pack.words: holds 9 word sets, more than 8"],
  // the overlay
  ['overlay: every field', 'fields', p => { delete overlay(p).scrim; }, "pack.overlays[\"overlay.phosphor\"].scrim: is missing"],
  ['overlay: no other field, no font file', 'fields', p => { overlay(p).src = 'fonts/neon.ttf'; }, "pack.overlays[\"overlay.phosphor\"].src: is not a field here"],
  ['overlay: a font of the engine\'s', 'fields', p => { overlay(p).font = 'neon.ttf'; }, "pack.overlays[\"overlay.phosphor\"].font: must be one of \"vt323\""],
  ['overlay: a font given as data is refused', 'fields', p => { overlay(p).font = { glyphs: {} }; }, "pack.overlays[\"overlay.phosphor\"].font: must be one of \"vt323\""],
  ['overlay: every level', 'fields', p => { delete overlay(p).levels.sleep; }, "pack.overlays[\"overlay.phosphor\"].levels.sleep: is missing"],
  ['overlay: no other level', 'fields', p => { overlay(p).levels.party = ['#ff00ff', '#ff00ff']; }, "pack.overlays[\"overlay.phosphor\"].levels.party: is not a field here"],
  ['overlay: a level is two hex colours', 'fields', p => { overlay(p).levels.ok = ['#39ff6a']; }, "pack.overlays[\"overlay.phosphor\"].levels.ok: must be [colour, second colour], two hex colours"],
  ['overlay: a level\'s colours are hex', 'fields', p => { overlay(p).levels.ok[1] = '@base.g0'; }, "pack.overlays[\"overlay.phosphor\"].levels.ok: must be [colour, second colour], two hex colours"],
  ['overlay: the outline is hex', 'fields', p => { overlay(p).outline = 'black'; }, "pack.overlays[\"overlay.phosphor\"].outline: must be a hex colour"],
  ['overlay: the caption is a literal colour', 'fields', p => { overlay(p).caption = '@base.k'; }, "pack.overlays[\"overlay.phosphor\"].caption: must be a hex colour such as \"#3f74e0\" or a translucent colour"],
  ['overlay: ok keeps its hue', 'rules', p => { overlay(p).levels.ok[0] = '#3fd0ff'; }, "pack.overlays[\"overlay.phosphor\"].levels.ok[0]: the ok colour must keep a hue from 110 to 160, not 195"],
  ['overlay: ok keeps its contrast', 'rules', p => { overlay(p).levels.ok[1] = '#0a5a1a'; }, "pack.overlays[\"overlay.phosphor\"].levels.ok[1]: the ok colour must have a contrast on black from 6 to 21, not 2.5"],
  ['overlay: warn keeps its hue', 'rules', p => { overlay(p).levels.warn[0] = '#39ff6a'; }, "pack.overlays[\"overlay.phosphor\"].levels.warn[0]: the warn colour must keep a hue from 28 to 55, not 135"],
  ['overlay: crit keeps its hue, which runs through 0', 'rules', p => { overlay(p).levels.crit[0] = '#ff8000'; }, "pack.overlays[\"overlay.phosphor\"].levels.crit[0]: the crit colour must keep a hue from 345 to 15, not 30"],
  ['overlay: info keeps its hue', 'rules', p => { overlay(p).levels.info[0] = '#ffb000'; }, "pack.overlays[\"overlay.phosphor\"].levels.info[0]: the info colour must keep a hue from 180 to 215, not 41"],
  ['overlay: a grey has no hue', 'rules', p => { overlay(p).levels.info[1] = '#c0c0c0'; }, "pack.overlays[\"overlay.phosphor\"].levels.info[1]: the info colour must keep a hue from 180 to 215, not none"],
  ['overlay: sleep stays dim', 'rules', p => { overlay(p).levels.sleep[0] = '#39ff6a'; }, "pack.overlays[\"overlay.phosphor\"].levels.sleep[0]: the sleep colour must have a contrast on black from 3 to 6, not 15.7"],
  ['overlay: sleep stays readable', 'rules', p => { overlay(p).levels.sleep[1] = '#0a3a18'; }, "pack.overlays[\"overlay.phosphor\"].levels.sleep[1]: the sleep colour must have a contrast on black from 3 to 6, not 1.6"],
  ['overlay: 9 overlays', 'counts', p => { for (const i of range(8)) p.overlays['overlay.' + i] = clone(overlay(p)); }, "pack.overlays: holds 9 overlays, more than 8"],
  // presets
  ['presets: no unknown field', 'fields', p => { preset(p).music = 'lute'; }, "pack.worlds[\"world.medieval\"].music: is not a field here"],
  ['presets: a name of 49 characters', 'fields', p => { preset(p).name = 'm'.repeat(49); }, "pack.worlds[\"world.medieval\"].name: must be 1 to 48 characters, not 49"],
  ['presets: a name is local or <pack>/<id>', 'fields', p => { preset(p).body = 'kw.base/'; }, "pack.worlds[\"world.medieval\"].body: must be a local id or \"<pack id>/<id>\""],
  ['presets: a long name\'s pack id is checked', 'fields', p => { preset(p).body = 'KW/build.a'; }, "pack.worlds[\"world.medieval\"].body: must be a local id or \"<pack id>/<id>\""],
  ['presets: a name has one slash', 'fields', p => { preset(p).picture = 'a/b/c'; }, "pack.worlds[\"world.medieval\"].picture: must be a local id or \"<pack id>/<id>\""],
  ['presets: outfit holds items and swatches', 'fields', p => { preset(p).outfit.cloak = {}; }, "pack.worlds[\"world.medieval\"].outfit.cloak: is not a field here"],
  ['presets: the head comes from the body', 'fields', p => { preset(p).outfit.items.head = 'kw.base/head.plain'; }, "pack.worlds[\"world.medieval\"].outfit.items.head: is not a field here"],
  ['presets: swatches of the user\'s sets', 'fields', p => { preset(p).outfit.swatches.cloak = 'kw.base/blue'; }, "pack.worlds[\"world.medieval\"].outfit.swatches.cloak: is not a field here"],
  ['presets: scenes holds quiet and for', 'fields', p => { preset(p).scenes.later = []; }, "pack.worlds[\"world.medieval\"].scenes.later: is not a field here"],
  ['presets: at least one quiet scene', 'fields', p => { preset(p).scenes.quiet = []; }, "pack.worlds[\"world.medieval\"].scenes.quiet: must hold 1 to 16 entries, not 0"],
  ['presets: a quiet scene once', 'fields', p => { preset(p).scenes.quiet.push('scene.camp'); }, "pack.worlds[\"world.medieval\"].scenes.quiet[4]: appears twice"],
  ['presets: for names conditions', 'fields', p => { preset(p).scenes.for.thing_down = 'scene.camp'; }, "pack.worlds[\"world.medieval\"].scenes.for.thing_down: is not a field here"],
  ['presets: cast by role', 'fields', p => { preset(p).cast.dog = 'critter.fly'; }, "pack.worlds[\"world.medieval\"].cast.dog: is not a field here"],
  ['presets: the pet is a pet', 'references', p => { preset(p).cast.pet = 'critter.fly'; }, "pack.worlds[\"world.medieval\"].cast.pet: names \"critter.fly\", whose role is critter, not pet"],
  ['presets: complete, a pet', 'rules', p => { delete preset(p).cast.pet; }, "pack.worlds[\"world.medieval\"].cast.pet: is missing, and a preset must be complete"],
  ['presets: sound is an object', 'fields', p => { preset(p).sound = 'lute'; }, "pack.worlds[\"world.medieval\"].sound: must be an object"],
  ['presets: companion is an object', 'fields', p => { preset(p).companion = 'cat'; }, "pack.worlds[\"world.medieval\"].companion: must be an object"],
  ['presets: a local body exists', 'references', p => { preset(p).body = 'body.none'; }, "pack.worlds[\"world.medieval\"].body: names a build, \"body.none\", that the pack does not have"],
  ['presets: a local item exists', 'references', p => { preset(p).outfit.items.helmet = 'helm.visor'; }, "pack.worlds[\"world.medieval\"].outfit.items.helmet: names an item, \"helm.visor\", that the pack does not have"],
  ['presets: a local item is of its slot', 'references', p => { preset(p).outfit.items.legs = 'head.visor'; }, "pack.worlds[\"world.medieval\"].outfit.items.legs: names \"head.visor\", whose slot is head, not legs"],
  ['presets: a local swatch exists', 'references', p => { preset(p).outfit.swatches.tabard = 'neon'; }, "pack.worlds[\"world.medieval\"].outfit.swatches.tabard: names a tabard swatch, \"neon\", that the pack does not have"],
  ['presets: a quiet scene exists', 'references', p => { preset(p).scenes.quiet[0] = 'scene.deck'; }, "pack.worlds[\"world.medieval\"].scenes.quiet[0]: names a scene, \"scene.deck\", that the pack does not have"],
  ['presets: a condition\'s scene exists', 'references', p => { preset(p).scenes.for.night = 'scene.bunk'; }, "pack.worlds[\"world.medieval\"].scenes.for.night: names a scene, \"scene.bunk\", that the pack does not have"],
  ['presets: a cast member exists', 'references', p => { preset(p).cast.foe = 'foe.troll'; }, "pack.worlds[\"world.medieval\"].cast.foe: names a cast member, \"foe.troll\", that the pack does not have"],
  ['presets: a cast member of the role', 'references', p => { preset(p).cast.patron = 'foe.goblin'; }, "pack.worlds[\"world.medieval\"].cast.patron: names \"foe.goblin\", whose role is foe, not patron"],
  ['presets: the prop set exists', 'references', p => { preset(p).props = 'props.none'; }, "pack.worlds[\"world.medieval\"].props: names a prop set, \"props.none\", that the pack does not have"],
  ['presets: the overlay exists', 'references', p => { preset(p).overlay = 'overlay.none'; }, "pack.worlds[\"world.medieval\"].overlay: names an overlay, \"overlay.none\", that the pack does not have"],
  ['presets: the words exist', 'references', p => { preset(p).words = 'words.none'; }, "pack.worlds[\"world.medieval\"].words: names a word set, \"words.none\", that the pack does not have"],
  ['presets: the picture is a scene', 'references', p => { preset(p).picture = 'props.medieval'; }, "pack.worlds[\"world.medieval\"].picture: names a scene, \"props.medieval\", that the pack does not have"],
  ['presets: a name with the pack\'s own id resolves here', 'references', p => { preset(p).picture = 'test.world/scene.deck'; }, "pack.worlds[\"world.medieval\"].picture: names a scene, \"test.world/scene.deck\", that the pack does not have"],
  ['presets: complete, a body', 'rules', p => { delete preset(p).body; }, "pack.worlds[\"world.medieval\"].body: is missing, and a preset must be complete"],
  ['presets: complete, a name', 'rules', p => { delete preset(p).name; }, "pack.worlds[\"world.medieval\"].name: is missing, and a preset must be complete"],
  ['presets: complete, an outfit', 'rules', p => { delete preset(p).outfit; }, "pack.worlds[\"world.medieval\"].outfit: is missing, and a preset must be complete"],
  ['presets: complete, the outfit\'s swatches', 'rules', p => { delete preset(p).outfit.swatches; }, "pack.worlds[\"world.medieval\"].outfit.swatches: is missing, and a preset must be complete"],
  ['presets: complete, every slot but back and off', 'rules', p => { delete preset(p).outfit.items.main; }, "pack.worlds[\"world.medieval\"].outfit.items.main: is missing, and a preset must be complete"],
  ['presets: complete, every swatch', 'rules', p => { delete preset(p).outfit.swatches.plume; }, "pack.worlds[\"world.medieval\"].outfit.swatches.plume: is missing, and a preset must be complete"],
  ['presets: complete, the quiet scenes', 'rules', p => { delete preset(p).scenes.quiet; }, "pack.worlds[\"world.medieval\"].scenes.quiet: is missing, and a preset must be complete"],
  ['presets: complete, a critter', 'rules', p => { delete preset(p).cast.critter; }, "pack.worlds[\"world.medieval\"].cast.critter: is missing, and a preset must be complete"],
  ['presets: complete, a scene for every condition that has one', 'rules', p => { delete preset(p).scenes.for.night; }, "pack.worlds[\"world.medieval\"].scenes.for.night: is missing, and a preset must be complete"],
  ['presets: complete, the props', 'rules', p => { delete preset(p).props; }, "pack.worlds[\"world.medieval\"].props: is missing, and a preset must be complete"],
  ['presets: no scene for a condition acted in the quiet scene', 'rules', p => { preset(p).scenes.for.device_down = 'scene.camp'; }, "pack.worlds[\"world.medieval\"].scenes.for.device_down: has no scene of its own: it is acted in the quiet scene of the moment"],
  ['presets: a quiet scene is quiet', 'rules', p => { preset(p).scenes.quiet.push('scene.cellar'); }, "pack.worlds[\"world.medieval\"].scenes.quiet[4]: names \"scene.cellar\", a scene that is not quiet"],
  ['presets: a quiet scene acts device_down', 'rules', p => { yard(p).can = yard(p).can.filter(c => c !== 'device_down'); }, "pack.worlds[\"world.medieval\"].scenes.quiet[3]: names \"scene.yard\", a quiet scene that cannot act \"device_down\", which plays in the quiet scene of the moment"],
  ['presets: a condition\'s scene lists it in can', 'rules', p => { preset(p).scenes.for.attack = 'scene.cellar'; }, "pack.worlds[\"world.medieval\"].scenes.for.attack: names \"scene.cellar\", a scene whose can does not list \"attack\""],
  ['presets: 9 worlds', 'counts', p => { for (const i of range(8)) p.worlds['world.' + i] = clone(preset(p)); }, "pack.worlds: holds 9 worlds, more than 8"],
  // the counts of a scene
  ['counts: 17 scenes', 'counts', p => { for (const i of range(10)) p.scenes['scene.c' + i] = clone(cellar(p)); }, "pack.scenes: holds 17 scenes, more than 16"],
  ['counts: 33 layers in a scene', 'counts', p => { cellar(p).over = range(31).map(() => ({ shapes: [rect()] })); }, "pack.scenes[\"scene.cellar\"]: holds 33 layers, more than 32"],
  ['counts: 65 tiles in a scene', 'counts', p => { still(p).push(...range(64).map(() => ({ k: 'tile', step: 960, phase: 0, from: 0, to: 1, shapes: [rect()] }))); }, "pack.scenes[\"scene.cellar\"]: holds 65 tiles, more than 64"],
  ['counts: more than 48 effects, tiles counted out', 'counts', p => { tile(p).shapes.push({ k: 'fx', fx: 'tufts', y: 530 }, { k: 'fx', fx: 'tufts', y: 531 }); tile(p).step = 116; }, "pack.scenes[\"scene.cellar\"]: draws 55 effects, tiles counted out, more than 48"],
  ['counts: more than 2000 shapes in the still layers, tiles counted out', 'counts', p => { tile(p).step = 4; tile(p).shapes = range(3).map(() => rect()); }, "pack.scenes[\"scene.cellar\"].still: draws 2155 shapes, tiles and stamps counted out, more than 2000"],
  ['counts: more than 400 shapes in one frame, tiles counted out', 'counts', p => { cellar(p).moving.push({ shapes: [{ k: 'tile', step: 16, phase: 0, from: { L: 1 }, to: { R: 1 }, shapes: range(3).map(() => rect()) }] }); }, "pack.scenes[\"scene.cellar\"]: draws 555 shapes in one frame of its moving and over layers, tiles and stamps counted out, more than 400"],
  ['counts: the still layers over 200000', 'counts', p => { cellar(p).still[0].shapes.push(...range(1500).map(() => big(200, '@skin.face'))); }, "pack.scenes[\"scene.cellar\"].still: costs up to 2413698 fills, more than 200000"],
  ['counts: one frame over 16000', 'counts', p => { cellar(p).moving[0].shapes.push(...range(10).map(() => big(256, '@skin.face'))); }, "pack.scenes[\"scene.cellar\"]: costs up to 20600 fills in one frame of its moving and over layers, more than 16000"],
  // 5520 fills, under 16000 once and over it three times
  ['counts: the pole counted under each high place', 'counts', p => { cellar(p).pole = range(5).map(() => big(256, '@base.steel')).concat([big(100, '@base.steel')]); }, "pack.scenes[\"scene.cellar\"]: costs up to 16680 fills in one frame of its moving and over layers, more than 16000"],
  ['counts: 25 glows in one frame', 'counts', p => { cellar(p).moving[0].shapes.push(...range(24).map(() => clone(glow(p)))); }, "pack.scenes[\"scene.cellar\"]: draws 25 glows in one frame, more than 24"],
  // the fixture holds 39 pixels of pix; forty shapes of 64 by 64, written in runs, are counted as they expand
  ['counts: more than 160 000 pixels in a pack, the world\'s pix counted as it expands', 'counts', p => { const px = () => ({ k: 'pix', p: [0, 0], runs: true, rows: range(64).map(() => '64a'), key: { a: '#000000' } }); p.stamps.big = range(40).map(px); }, "pack: holds 163879 pixels in pix shapes, more than 160000"],
  // each field check by itself, as the mutation run of the library asked for
  ['scenes: can is an array', 'fields', p => { cellar(p).can = 'cpu_hot'; }, "pack.scenes[\"scene.cellar\"].can: must be an array"],
  ['points: a coordinate is a number or a term', 'fields', p => { still(p)[2].p = ['left', 380]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[0]: must be a number or a term object"],
  ['points: a y is a number or a term', 'fields', p => { still(p)[2].p = [0, 'top']; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].p[1]: must be a number or a term object"],
  ['points: a polygon\'s point is a pair', 'fields', p => { house(p).moving[0].shapes[0].pts[0] = [129, 465, 0]; }, "pack.scenes[\"scene.house\"].moving[0].shapes[0].pts[0]: must be a pair [x, y]"],
  ['colours: a translucent a from 0.01 in a world shape', 'fields', p => { still(p)[2].fill = { rgb: '#000000', a: 0 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].fill.a: must be a number from 0.01 to 1"],
  ['colours: a band\'s colour is checked in a world shape', 'fields', p => { still(p)[3].fill = [[0.3, 'brown'], [1, '@base.n3']]; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[3].fill[0][1]: must be a hex colour, a reference such as \"@base.k\", a translucent colour, a mix or a contrast"],
  ['tiles: only\'s seed from 0 to 999', 'fields', p => { planks(p).shapes[2].only = [1000, 5]; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].shapes[2].only[0]: must be a whole number from 0 to 999"],
  ['tiles: only\'s mod from 2', 'fields', p => { planks(p).shapes[2].only = [31, 1]; }, "pack.scenes[\"scene.house\"].still[0].shapes[1].shapes[2].only[1]: must be a whole number from 2 to 960"],
  ['tiles: from is a scalar', 'fields', p => { tile(p).from = 'left'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].from: must be a number or a term object"],
  ['tiles: to is a scalar', 'fields', p => { tile(p).to = 'right'; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].to: must be a number or a term object"],
  ['shapes: g is a group\'s id', 'fields', p => { house(p).moving[1].shapes[0].g = 'Blanket'; }, "pack.scenes[\"scene.house\"].moving[1].shapes[0].g: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['shapes: a patron shape\'s at is an anchor name', 'fields', p => { patron(p).states.shut[0].at = 7; }, "pack.cast[\"patron.a\"].states.shut[0].at: must be an anchor name"],
  ['shapes: rx past 256', 'fields', p => { fly(p).dead[0] = { k: 'ell', p: [0, 0], rx: 256.125, ry: 2, fill: '@base.k' }; }, "pack.cast[\"critter.fly\"].dead[0].rx: must be a multiple of 1/8 from 0 to 256"],
  ['shapes: ry past 256', 'fields', p => { fly(p).dead[0] = { k: 'ell', p: [0, 0], rx: 2, ry: 256.125, fill: '@base.k' }; }, "pack.cast[\"critter.fly\"].dead[0].ry: must be a multiple of 1/8 from 0 to 256"],
  ['shapes: a clip\'s ends within the offsets', 'fields', p => { still(p)[2] = { k: 'ell', p: [0, 0], rx: 4, ry: 4, fill: '@base.k', clip: [null, 2048.125] }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[2].clip[1]: must be a multiple of 1/8 from -2048 to 2048"],
  ['marks: a rest mark\'s at is an id', 'fields', p => { house(p).still[0].shapes[2].at = 'Pegs'; }, "pack.scenes[\"scene.house\"].still[0].shapes[2].at: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['effects: g is a group\'s id', 'fields', p => { house(p).moving[1].shapes.push({ k: 'fx', fx: 'drift', g: 'Blanket' }); }, "pack.scenes[\"scene.house\"].moving[1].shapes[1].g: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['effects: only is [seed, mod] inside a tile', 'fields', p => { tile(p).shapes.push({ k: 'fx', fx: 'tufts', only: [1] }); }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].shapes[2].only: must be [seed, mod]"],
  ['anim: loop is true or false', 'fields', p => { house(p).moving[0].anim.loop = 'yes'; }, "pack.scenes[\"scene.house\"].moving[0].anim.loop: must be true or false"],
  ['rests: a place\'s height at most 240', 'fields', p => { house(p).rests.stool.h = 241; }, "pack.scenes[\"scene.house\"].rests.stool.h: must be a whole number from 1 to 240"],
  ['decor: no unknown field', 'fields', p => { cellar(p).decor = { mantel: { kind: 'surface', x: 890, y: 318, w: 90, h: 70, z: 1 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.z: is not a field here"],
  ['decor: x on the grid', 'fields', p => { cellar(p).decor = { mantel: { kind: 'surface', x: 961, y: 318, w: 90, h: 70 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.x: must be a whole number from 0 to 960"],
  ['decor: y on the grid', 'fields', p => { cellar(p).decor = { mantel: { kind: 'surface', x: 890, y: 601, w: 90, h: 70 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.y: must be a whole number from 0 to 600"],
  ['decor: a height at most 240', 'fields', p => { cellar(p).decor = { mantel: { kind: 'surface', x: 890, y: 318, w: 90, h: 241 } }; }, "pack.scenes[\"scene.cellar\"].decor.mantel.h: must be a whole number from 1 to 240"],
  ['screen: the group is an id', 'fields', p => { house(p).screen.group = 'Telly'; }, "pack.scenes[\"scene.house\"].screen.group: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['seat: y on the grid', 'fields', p => { court(p).seat.y = 601; }, "pack.scenes[\"scene.court\"].seat.y: must be a whole number from 0 to 600"],
  ['anvil: the rest is an id', 'fields', p => { smithy(p).anvil.rest = 'Block'; }, "pack.scenes[\"scene.smithy\"].anvil.rest: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['target: the group is an id', 'fields', p => { yard(p).target.group = 'Dummy'; }, "pack.scenes[\"scene.yard\"].target.group: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['target: hitAt from 0', 'fields', p => { yard(p).target.hitAt = -1; }, "pack.scenes[\"scene.yard\"].target.hitAt: must be a whole number from 0 to 600000"],
  ['foe: a span\'s from on the grid', 'fields', p => { battlement(p).foe.spans[0][0] = -1; }, "pack.scenes[\"scene.battlement\"].foe.spans[0][0]: must be a whole number from 0 to 960"],
  ['foe: a wall\'s offset within 960', 'fields', p => { battlement(p).foe.wall.offset = 961; }, "pack.scenes[\"scene.battlement\"].foe.wall.offset: must be a whole number from -960 to 960"],
  ['foe: a wall\'s high y on the grid', 'fields', p => { battlement(p).foe.wall.high[1] = 601; }, "pack.scenes[\"scene.battlement\"].foe.wall.high[1]: must be a whole number from 0 to 600"],
  ['foe: a wall\'s low on the grid', 'fields', p => { battlement(p).foe.wall.low = 601; }, "pack.scenes[\"scene.battlement\"].foe.wall.low: must be a whole number from 0 to 600"],
  ['patron: own gives band lists that are well formed', 'fields', p => { patron(p).own.skin = { face: [[0.5, '#ffe3c4']], sick: [[1, '#000000']], hot: [[1, '#000000']], cheek: '#000000', puff: '#000000' }; }, "pack.cast[\"patron.a\"].own.skin.face: the last fraction must be 1"],
  ['patron: own is an object', 'fields', p => { patron(p).own = []; }, "pack.cast[\"patron.a\"].own: must be an object"],
  ['patron: palettes is an object', 'fields', p => { patron(p).palettes = []; }, "pack.cast[\"patron.a\"].palettes: must be an object"],
  ['patron: a palette has an entry', 'fields', p => { patron(p).palettes.mon = {}; }, "pack.cast[\"patron.a\"].palettes.mon: must hold 1 to 32 entries, not 0"],
  ['patron: a part has a shape', 'fields', p => { patron(p).still[0].shapes = []; }, "pack.cast[\"patron.a\"].still[0].shapes: must hold 1 to 128 entries, not 0"],
  ['foe: feet within 256', 'fields', p => { goblin(p).sprite.feet[1] = 257; }, "pack.cast[\"foe.goblin\"].sprite.feet[1]: must be a whole number from 0 to 256"],
  ['foe: w from 1', 'fields', p => { goblin(p).w = 0; }, "pack.cast[\"foe.goblin\"].w: must be a whole number from 1 to 256"],
  ['foe: a part has a shape', 'fields', p => { goblin(p).parts.legs = []; }, "pack.cast[\"foe.goblin\"].parts.legs: must hold 1 to 128 entries, not 0"],
  ['foe: a pose\'s shapes are checked', 'fields', p => { goblin(p).poses.hit.shapes = [{ k: 'circle' }]; }, "pack.cast[\"foe.goblin\"].poses.hit.shapes[0].k: must be one of \"rect\", \"ell\", \"rrect\", \"poly\", \"strip\", \"pix\", \"glow\", \"dith\", \"fx\", \"use\""],
  ['critter: alpha is an object', 'fields', p => { fly(p).alpha = []; }, "pack.cast[\"critter.fly\"].alpha: must be an object"],
  ['critter: a frame has a shape', 'fields', p => { fly(p).frames.flap0 = []; }, "pack.cast[\"critter.fly\"].frames.flap0: must hold 1 to 64 entries, not 0"],
  ['props: a lamp\'s at is a pair', 'fields', p => { kinds(p).pi.up.lamp.at = [0]; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.at: must be a pair [x, y]"],
  ['props: a lamp\'s dark drawing is a stamp\'s id', 'fields', p => { kinds(p).pi.up.lamp.dark = 'Berry'; }, "pack.props[\"props.medieval\"].kinds.pi.up.lamp.dark: must be an id matching ^[a-z][a-z0-9.-]{0,47}$"],
  ['props: a set\'s name of 49 characters', 'fields', p => { p.props['props.medieval'].name = 'n'.repeat(49); }, "pack.props[\"props.medieval\"].name: must be 1 to 48 characters, not 49"],
  ['props: a kind\'s name of 49 characters', 'fields', p => { kinds(p).camera.name = 'n'.repeat(49); }, "pack.props[\"props.medieval\"].kinds.camera.name: must be 1 to 48 characters, not 49"],
  ['words: a name of 49 characters', 'fields', p => { words(p).name = 'n'.repeat(49); }, "pack.words[\"words.medieval\"].name: must be 1 to 48 characters, not 49"],
  ['overlay: a name of 49 characters', 'fields', p => { overlay(p).name = 'n'.repeat(49); }, "pack.overlays[\"overlay.phosphor\"].name: must be 1 to 48 characters, not 49"],
  ['presets: an item\'s name is checked', 'fields', p => { preset(p).outfit.items.legs = 'Legs'; }, "pack.worlds[\"world.medieval\"].outfit.items.legs: must be a local id or \"<pack id>/<id>\""],
  ['presets: a swatch\'s name is checked', 'fields', p => { preset(p).outfit.swatches.tabard = 'kw.base/Blue'; }, "pack.worlds[\"world.medieval\"].outfit.swatches.tabard: must be a local id or \"<pack id>/<id>\""],
  ['presets: a quiet scene\'s name is checked', 'fields', p => { preset(p).scenes.quiet[0] = 'Scene.camp'; }, "pack.worlds[\"world.medieval\"].scenes.quiet[0]: must be a local id or \"<pack id>/<id>\""],
  ['presets: a condition\'s scene\'s name is checked', 'fields', p => { preset(p).scenes.for.night = 'scene house'; }, "pack.worlds[\"world.medieval\"].scenes.for.night: must be a local id or \"<pack id>/<id>\""],
  ['presets: a cast member\'s name is checked', 'fields', p => { preset(p).cast.patron = '/patron.a'; }, "pack.worlds[\"world.medieval\"].cast.patron: must be a local id or \"<pack id>/<id>\""],
  ['ranges: a polygon\'s point on R stays within 2048', 'rules', p => { cellar(p).moving[0].shapes.push({ k: 'poly', pts: [[0, 0], [{ R: 1, c: 200 }, 0], [0, 10]], fill: '@base.k', dir: 'rows' }); }, "pack.scenes[\"scene.cellar\"].moving[0].shapes[3].pts[1][0]: the offset reaches 2136 at its greatest, above 2048"],
  ['ranges: a tile\'s to stays within 2048', 'rules', p => { tile(p).to = { R: 1.5 }; }, "pack.scenes[\"scene.cellar\"].still[0].shapes[4].to: the offset reaches 2904 at its greatest, above 2048"],
  // pix rows in runs, in a world shape: a count of 1 or more before a key or ".", none meaning 1
  ['runs: a count of 0', 'fields', p => { sit(p).rows[0] = '0a2ba'; }, `${ST}.rows[0]: has a count, "0", that is 0 or starts with 0`],
  ['runs: a count with a leading zero', 'fields', p => { sit(p).rows[0] = '01a2ba'; }, `${ST}.rows[0]: has a count, "01", that is 0 or starts with 0`],
  ['runs: a count with nothing after it', 'fields', p => { sit(p).rows[0] = 'a2ba3'; }, `${ST}.rows[0]: ends in a count, "3", with no character to repeat`],
  ['runs: a row past 64 as it expands', 'fields', p => { sit(p).rows[0] = '62a2b1a'; }, `${ST}.rows[0]: must expand to at most 64 characters`],
  ['runs: rows that expand to unequal lengths', 'fields', p => { sit(p).rows[1] = '5a'; }, `${ST}.rows[1]: must expand to as many characters as the first row`],
  ['runs: at most 64 rows', 'fields', p => { sit(p).rows = range(64).map(() => '64a'); sit(p).rows.push('64a'); }, `${ST}.rows: must hold 1 to 64 entries, not 65`],
  ['runs: a character the key does not map', 'references', p => { sit(p).rows[2] = '1c2.a'; }, `${ST}.rows[2]: uses "c", which the key does not map`],
  ['runs: no digit in the key of a shape in runs', 'fields', p => { sit(p).key['7'] = '#000000'; }, `${ST}.key["7"]: must not be a digit in a shape of runs, where a digit is a count`],
  ['runs: true or false', 'fields', p => { sit(p).runs = 1; }, `${ST}.runs: must be true or false`],
  ['runs: not in a 1.0 shape', 'fields', p => { p.items[Object.keys(p.items)[0]].parts[0].shapes[0] = { k: 'pix', p: [0, 0], runs: true, rows: ['2a'], key: { a: '#000000' } }; },
    `pack.items["${Object.keys(WORLD().items)[0]}"].parts[0].shapes[0].runs: is not a field here`],
  ['runs: false reads the rows plainly, a digit a key', 'references', p => { sit(p).runs = false; sit(p).rows = ['a2ba', 'abba', 'a..a']; }, `${ST}.rows[0]: uses "2", which the key does not map`],
  // the pet
  ['pet: its fields', 'fields', p => { delete pet(p).lift; }, `${PE}.lift: is missing`],
  ['pet: a sprite of at most 256', 'fields', p => { pet(p).sprite.size = [257, 30]; }, `${PE}.sprite.size[0]: must be a whole number from 1 to 256`],
  ['pet: at least one coat', 'fields', p => { pet(p).coats = {}; }, `${PE}.coats: must hold 1 to 8 coats, not 0`],
  ['pet: at most 8 coats', 'fields', p => { for (const i of range(8)) pet(p).coats['c' + i] = clone(pet(p).coats.calico); }, `${PE}.coats: must hold 1 to 8 coats, not 9`],
  ['pet: a coat has a name', 'fields', p => { pet(p).coats.calico.name = ''; }, `${PE}.coats.calico.name: must be 1 to 32 characters, not 0`],
  ['pet: every pose', 'fields', p => { delete pet(p).coats.calico.poses.walk1; }, `${PE}.coats.calico.poses.walk1: is missing`],
  ['pet: no other pose', 'fields', p => { pet(p).coats.calico.poses.roll = 'pet.sit'; }, `${PE}.coats.calico.poses.roll: is not a field here`],
  ['pet: a pose is a stamp\'s id', 'fields', p => { pet(p).coats.calico.poses.rest = 'Pet Sit'; }, `${PE}.coats.calico.poses.rest: must be an id matching ^[a-z][a-z0-9.-]{0,47}$`],
  ['pet: a spot is a whole point on the grid', 'fields', p => { pet(p).spots['scene.house'].rest = [961, 590]; }, `${PE}.spots["scene.house"].rest[0]: must be a whole number from 0 to 960`],
  ['pet: a spot faces right or left', 'fields', p => { pet(p).spots['scene.house'].face = 0; }, `${PE}.spots["scene.house"].face: must be 1, facing right, or -1, facing left`],
  ['pet: a floor is [x0, x1, y]', 'fields', p => { pet(p).spots['scene.cellar'].floors[0] = [292, 354]; }, `${PE}.spots["scene.cellar"].floors[0]: must be [x0, x1, y]`],
  ['pet: at most 8 floors', 'fields', p => { pet(p).spots['scene.cellar'].floors = range(9).map(i => [i, i + 1, 430]); }, `${PE}.spots["scene.cellar"].floors: must hold 0 to 8 entries, not 9`],
  ['pet: no spot by the bed inside one', 'fields', p => { pet(p).spots['scene.house'].bed.bed = clone(pet(p).spots['scene.house'].bed); }, `${PE}.spots["scene.house"].bed.bed: is not a field here`],
  ['pet: the paw is a pair of eighths', 'fields', p => { pet(p).paw = [8.1, -10]; }, `${PE}.paw[0]: must be a multiple of 1/8 from -256 to 256`],
  ['pet: take from 0 to 256', 'fields', p => { pet(p).take = -1; }, `${PE}.take: must be a multiple of 1/8 from 0 to 256`],
  ['pet: a pose names a stamp of the pack', 'references', p => { pet(p).coats.calico.poses.land = 'pet.gone'; }, `${PE}.coats.calico.poses.land: names a stamp, "pet.gone", that the pack does not have`],
  ['pet: a spot names a scene of the pack', 'references', p => { pet(p).spots['scene.attic'] = clone(pet(p).spots['scene.cellar']); }, `${PE}.spots["scene.attic"]: is a spot in a scene, "scene.attic", that the pack does not have`],
  ['pet: a spot by the bed in a scene with a bed', 'references', p => { pet(p).spots['scene.cellar'].bed = clone(pet(p).spots['scene.house'].bed); }, `${PE}.spots["scene.cellar"].bed: is a spot by the bed, in a scene, "scene.cellar", that has no bed`],
  ['pet: its feet in the sprite', 'rules', p => { pet(p).sprite.feet = [41, 25]; }, `${PE}.sprite.feet: must lie in the sprite`],
  ['pet: a pose of pix shapes alone', 'rules', p => { p.stamps['pet.sit'].push(rect()); }, `${PE}.coats.calico.poses.rest: names a stamp, "pet.sit", whose shape 1 is not a pix shape, and a pose is drawn with pix shapes alone`],
  ['pet: a pose at whole points', 'rules', p => { sit(p).p = [-2.5, -4]; }, `${PE}.coats.calico.poses.rest: names a stamp, "pet.sit", whose shape 0 is not at a whole point`],
  ['pet: a pose inside the sprite', 'rules', p => { sit(p).p = [-21, -4]; }, `${PE}.coats.calico.poses.rest: names a stamp, "pet.sit", whose shape 0 reaches outside the sprite from its feet`],
  ['pet: a floor runs left to right', 'rules', p => { pet(p).spots['scene.house'].bed.floors[0] = [386, 165, 405]; }, `${PE}.spots["scene.house"].bed.floors[0]: must run from left to right, x0 less than x1`],
  ['pet: a pose over 8000', 'counts', p => { pet(p).sprite = { size: [256, 256], feet: [100, 100] }; sit(p).rows = range(64).map(() => 'ab'.repeat(32)); p.stamps['pet.sit'].push(clone(sit(p))); },
    `${PE}.coats.calico.poses.rest: costs up to 8192 fills, more than 8000`],
];
for (const [rule, step, edit, want] of RULES) test('refused at ' + step + ': ' + rule, () => { rejected(edit, step, want); });

// ---- The edges of the limits pass ----------------------------------------------------------------------

const EDGES = [
  ['16 scenes, 16 cast members, 8 of each set, 64 stamps', p => {
    for (const i of range(9)) p.scenes['scene.c' + i] = clone(cellar(p));
    for (const i of range(12)) p.cast['fly' + i] = clone(fly(p));
    for (const i of range(7)) { p.props['props.' + i] = clone(p.props['props.medieval']); p.words['words.' + i] = clone(words(p)); p.overlays['overlay.' + i] = clone(overlay(p)); p.worlds['world.' + i] = clone(preset(p)); }
    for (const i of range(58)) p.stamps['s' + i] = [rect()];
  }],
  ['32 layers in a scene', p => { cellar(p).over = range(30).map(() => ({ shapes: [rect()] })); }],
  ['24 glows in one frame', p => { cellar(p).moving[0].shapes.push(...range(23).map(() => clone(glow(p)))); }],
  ['a stamp of 64 shapes', p => { p.stamps.barrel = range(64).map(() => rect()); }],
  // spark and a screen's glow are reserved and not read, so either may be left out
  ['an anvil without its spark, and a screen without its glow', p => { delete smithy(p).anvil.spark; delete house(p).screen.glow; }],
  ['a tile of 32 shapes and a step of 4 to 960', p => { tile(p).shapes = range(32).map(() => rect()); tile(p).step = 960; planks(p).step = 4; planks(p).shapes = [rect()]; }],
  ['offsets at 2048 and lengths at 4096 in a scene', p => { still(p)[2].p = [2048, -2048]; still(p)[2].w = 4096; }],
  ['an offset on R reaching exactly 2048', p => { still(p)[2].p[0] = { c: 112, R: 1 }; }],
  ['a spot of 30 and 162, a round of 2 and 120 seconds', p => { cellar(p).spot = 30; camp(p).spot = 162; camp(p).can = camp(p).can.filter(c => c !== 'pi_silent'); cellar(p).rounds[0].dur = 2; cellar(p).rounds[1].dur = 120; }],
  ['six rounds', p => { cellar(p).rounds = range(6).map(i => ({ x: 120 + i, act: 'guard', dur: 7 })); }],
  ['a high base at 300, ground bases at 500 and 598', p => { cellar(p).things.h1.y = 300; cellar(p).things.g1.y = 500; cellar(p).things.g2.y = 598; }],
  ['class boxes touching, not overlapping', p => { const t = cellar(p).things; t.g3.x = t.g2.x - 77; }],
  ['a class box at the grid\'s edges, flipped', p => { const t = cellar(p).things; t.h3.x = 32; t.g1.x = 919; }],
  ['the four reserved predicates, day and night among them', p => { house(p).over[0].when = ['!tv', 'day', '!night', '!helmOff']; }],
  ['a wave track, rounded', p => { house(p).moving[0].anim.tracks[0] = { g: 'breath', ch: 'dx', wave: [1.5, 190, 0], round: true }; }],
  ['keyframes in seconds on a layer', p => { const a = house(p).moving[0].anim; delete a.ms; a.period = 3.8; a.tracks[0].keys[1][0] = 0.5; }],
  ['a rest at a number of radians', p => { house(p).rests.pegs.a = 1.571; }],
  ['a patron\'s anchor at the corner of its box', p => { patron(p).anchors.eyes = [-90, -340]; }],
  ['a crown point at the sprite\'s corner', p => { goblin(p).crown[0] = [-110, -214]; }],
  ['a patron still part of 16000 and mouths of 400', p => { patron(p).still = [{ at: 'seat', shapes: range(8).map(() => big(250, '@skin.face')) }]; patron(p).states.open = [big(400)]; patron(p).states.shut = [big(400)]; }],
  ['a pose of 8000 and a critter frame of 200', p => { goblin(p).poses.hit.parts = []; goblin(p).poses.hit.shapes = range(31).map(() => big(256)).concat([big(64)]); fly(p).frames.flap1 = [big(200)]; }],
  // hues of exactly 345 and 15 for crit, 180 for info and 110 for ok
  ['the overlay\'s colours at the edges of their bands', p => { const l = overlay(p).levels; l.crit = ['#ff3b6c', '#ff6633']; l.info[0] = '#00eeee'; l.ok[0] = '#2dff03'; }],
  ['templates of 32 characters, the middle dot among them', p => { words(p).captions.import = ['DELIVERED · {title} '.padEnd(32, '.')]; }],
  ['a preset naming parts of other packs', p => { const w = preset(p); w.scenes.for.night = 'kw.medieval/scene.house'; w.cast.foe = 'kw.medieval/foe.goblin'; w.props = 'kw.medieval/props.medieval'; }],
  ['a preset naming this pack by its id', p => { preset(p).picture = 'test.world/scene.camp'; }],
  ['a preset with a reserved sound and companion', p => { preset(p).sound = { ambience: 'reserved' }; preset(p).companion = { cat: 1 }; }],
  ['sounds holding anything, listed in provides', p => { p.sounds = { junk: [1, 'two', { three: 3 }] }; provide(p); }],
  ['a scene with a reserved companion', p => { camp(p).companion = { where: [1, 2] }; }],
  ['a contrast in a scene\'s shape, on a band of a band list', p => { still(p)[2].fill = { contrast: ['#000000', { mix: ['#000000', '#ffffff'], k: 0.5 }], on: '@base.steel', band: 3 }; }],
  ['a patron\'s brow drawn and dressed, dressed a contrast of its bound hair on its bound skin', p => { patron(p).palettes.mon.brow = { drawn: '#4a2a12', dressed: { contrast: ['@hair.0', { mix: ['@hair.2', '#000000'], k: 0.15 }], on: '@skin.face', band: 1 }, set: 'hair' }; }],
  ['a patron\'s shade drawn and dressed, dressed a mix', p => { patron(p).palettes.mon.dark = { drawn: '#1f1a2d', dressed: { mix: ['@hair.2', '#000000'], k: 0.3 }, set: 'hair' }; }],
  ['a contrast in a patron\'s shape', p => { patron(p).states.shut[0].fill = { contrast: ['@robe.0', '@base.k'], on: '@skin.cheek' }; }],
  ['a mix of a bound set in the patron', p => { patron(p).states.shut[0].fill = { mix: ['@robe.2', '@base.k'], k: 0.25 }; }],
  ['a band list of the user\'s skin in a scene', p => { still(p)[2].fill = '@skin.face'; }],
  ['the engine\'s lamp at the edge of its class box', p => { kinds(p).camera.up.lamp = [26, -40]; }],
  ['a gone lamp\'s lit drawing in the down red at two thirds', p => { p.stamps['berry.down'][0].key.R = '@lamp.downLo'; }],
  // a strip whose ends and widths are fixed is measured by the pixels it fills: the camera's
  // sunshade, whose far corner lies at -34.78, fills no column left of -34
  ['a strip at the edge of its class box, by the pixels it fills', p => { kinds(p).camera.up.still.push({ k: 'strip', p0: [16, -57], p1: [-34, -47], hw0: 4, hw1: 4, fill: '@base.k' }); }]
];
for (const [name, edit] of EDGES) test('accepted at the edge: ' + name, () => { accepted(edit); });

// ---- Hostile input ---------------------------------------------------------------------------------------

test('unknown keys are refused at every level of the world sections', () => {
  const levels = [
    p => { cellar(p).z = 1; }, p => { cellar(p).still[0].z = 1; }, p => { still(p)[2].z = 1; }, p => { tile(p).z = 1; }, p => { tile(p).shapes[0].z = 1; },
    p => { glow(p).a.c = 0.09; glow(p).z = 1; }, p => { still(p)[5].z = 1; }, p => { house(p).still[0].shapes[2].z = 1; }, p => { planks(p).pick.plank.z = 1; },
    p => { house(p).moving[0].anim.z = 1; }, p => { house(p).moving[0].anim.tracks[0].z = 1; }, p => { house(p).moving[0].groups.breath.z = 1; },
    p => { cellar(p).rounds[0].z = 1; }, p => { cellar(p).things.pie.z = 1; }, p => { house(p).rests.stool.z = 1; }, p => { house(p).rests.pegs.z = 1; },
    p => { house(p).bed.z = 1; }, p => { house(p).screen.z = 1; }, p => { court(p).seat.z = 1; }, p => { smithy(p).anvil.z = 1; }, p => { yard(p).target.z = 1; },
    p => { battlement(p).foe.z = 1; }, p => { battlement(p).foe.wall.z = 1; }, p => { patron(p).z = 1; }, p => { patron(p).anchors.z = [0, 0]; },
    p => { patron(p).states.z = []; }, p => { patron(p).still[0].z = 1; }, p => { goblin(p).sprite.z = 1; }, p => { goblin(p).poses.z = {}; }, p => { goblin(p).poses.hit.z = 1; },
    p => { fly(p).frames.z = []; }, p => { fly(p).z = 1; }, p => { p.props['props.medieval'].z = 1; }, p => { kinds(p).camera.z = 1; }, p => { kinds(p).camera.up.z = 1; },
    p => { kinds(p).pi.up.lamp.z = 1; }, p => { words(p).z = 1; }, p => { words(p).labels.z = 'x'; }, p => { words(p).quiet.z = ['x']; }, p => { words(p).captions.z = ['x']; },
    p => { overlay(p).z = 1; }, p => { overlay(p).levels.z = ['#000000', '#000000']; }, p => { preset(p).z = 1; }, p => { preset(p).outfit.z = {}; },
    p => { preset(p).outfit.items.z = 'x'; }, p => { preset(p).outfit.swatches.z = 'x'; }, p => { preset(p).scenes.z = []; }, p => { preset(p).scenes.for.z = 'x'; },
    p => { preset(p).cast.z = 'x'; }, p => { still(p)[2].fill = { mix: ['#000000', '#000000'], k: 0.5, z: 1 }; }];
  for (const edit of levels) {
    const r = load(edited(edit));
    assert.equal(r.step, 'fields', String(edit) + ': ' + r.reason);
    assert.match(r.reason, /\.z: is not a field here$/, String(edit));
  }
});

test('the reader never throws, on truncated and mangled copies of the world fixture', () => {
  const text = envText(WORLD());
  let seed = 11;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < text.length; i += 397) {
    const r = PK.read(text.slice(0, i), OPTS);
    assert.equal(r.ok, false);
    assert.ok(PK.STEPS.includes(r.step));
  }
  for (let i = 0; i < 600; i++) {
    const at = rnd(text.length), ch = '{}[]",:0123456789.-ae\\'[rnd(22)];
    const r = PK.read(text.slice(0, at) + ch + text.slice(at + 1), Object.assign({ allowUnsigned: true }, OPTS));
    assert.equal(typeof r.ok, 'boolean');
    if (!r.ok) assert.ok(PK.STEPS.includes(r.step), r.step);
    assert.notEqual(r.reason, 'the pack could not be checked', 'a mangled copy reached a check that threw: ' + (text.slice(at - 30, at + 30)));
  }
});

test('values of the wrong type in the world sections are refused with their own reasons, never a throw', () => {
  const odd = [null, 0, 'x', true, [], {}, [null], [[]], { c: [] }];
  const spots = [
    (p, v) => { cellar(p).still = v; }, (p, v) => { cellar(p).still[0] = v; }, (p, v) => { still(p)[2] = v; }, (p, v) => { still(p)[2].p = v; },
    (p, v) => { still(p)[2].fill = v; }, (p, v) => { tile(p).shapes = v; }, (p, v) => { tile(p).from = v; }, (p, v) => { planks(p).pick = v; },
    (p, v) => { glow(p).a = v; }, (p, v) => { house(p).moving[0].anim = v; }, (p, v) => { house(p).moving[0].anim.tracks[0] = v; }, (p, v) => { house(p).moving[0].when = v; },
    (p, v) => { cellar(p).things = v; }, (p, v) => { cellar(p).things.pie = v; }, (p, v) => { house(p).rests = v; }, (p, v) => { house(p).rests.pegs = v; },
    (p, v) => { house(p).bed = v; }, (p, v) => { court(p).seat = v; }, (p, v) => { battlement(p).foe = v; }, (p, v) => { battlement(p).foe.spans = v; },
    (p, v) => { patron(p).sets = v; }, (p, v) => { patron(p).own = v; }, (p, v) => { patron(p).palettes = v; }, (p, v) => { patron(p).still = v; },
    (p, v) => { patron(p).states = v; }, (p, v) => { goblin(p).sprite = v; }, (p, v) => { goblin(p).crown = v; }, (p, v) => { goblin(p).parts = v; },
    (p, v) => { goblin(p).poses = v; }, (p, v) => { goblin(p).poses.hit.parts = v; }, (p, v) => { fly(p).frames = v; }, (p, v) => { fly(p).alpha = v; },
    (p, v) => { kinds(p).camera = v; }, (p, v) => { kinds(p).camera.up = v; }, (p, v) => { kinds(p).pi.up.lamp = v; }, (p, v) => { words(p).quiet = v; },
    (p, v) => { words(p).quiet.up = v; }, (p, v) => { words(p).labels = v; }, (p, v) => { overlay(p).levels = v; }, (p, v) => { overlay(p).caption = v; },
    (p, v) => { preset(p).outfit = v; }, (p, v) => { preset(p).scenes = v; }, (p, v) => { preset(p).scenes.quiet = v; }, (p, v) => { preset(p).cast = v; },
    (p, v) => { preset(p).body = v; }, (p, v) => { p.stamps = v; }, (p, v) => { p.stamps.barrel = v; }, (p, v) => { still(p)[0].of = v; }];
  for (const spot of spots) for (const v of odd) {
    const r = load(edited(p => spot(p, clone(v))));
    if (r.ok) continue;
    assert.notEqual(r.reason, 'the pack could not be checked', String(spot) + ' with ' + JSON.stringify(v));
  }
});
