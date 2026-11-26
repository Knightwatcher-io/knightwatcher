// Tests for the cat's stamps, tools/cat-stamps.js, and for what it wrote into the medieval world's
// pack, web/packs/medieval.pack.json. Run with: node --test 'tests/tools/**/*.test.js'
// The tool works the cat out from its drawing in code, web/js/cat.js, into stamps of pix shapes and
// the cast member pet.cat. These tests work it out again and require the pack to hold exactly that,
// and the stamps, read back by the pack library, to give the code's cells pixel for pixel.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../../tools/cat-stamps.js');
const PK = require('../../web/js/pack.js');
const SIGN = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const TEXT = fs.readFileSync(T.PACK, 'utf8');
const RAW = JSON.parse(TEXT).pack;
const BUILT = T.build();
const CAT = T.codeCat();
const plain = v => JSON.parse(JSON.stringify(v));

test('the pack holds the cat\'s stamps and member exactly as the tool works them out from the code', () => {
  const ours = Object.keys(RAW.stamps).filter(n => n.startsWith(T.PREFIX));
  assert.deepEqual(ours, Object.keys(BUILT.stamps), 'the cat\'s stamps, in order, and no others named cat.');
  for (const n of ours) assert.deepEqual(RAW.stamps[n], plain(BUILT.stamps[n]), n);
  assert.deepEqual(RAW.cast[T.MEMBER], plain(BUILT.member));
  // the tool writes the file it reads back unchanged, so the pack is what it writes
  assert.equal(T.write(TEXT, BUILT), TEXT, 'the pack is stale: run node tools/cat-stamps.js');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/cat-stamps.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('every pose of each coat is one stamp of pix shapes in runs, tiles of at most 64 by 64 at whole points from the feet', () => {
  assert.deepEqual(Object.keys(BUILT.member.coats), ['calico', 'ginger']);
  assert.deepEqual(plain(CAT.poses), ['rest', 'settle', 'alert0', 'alert1', 'stalk0', 'stalk1', 'pounce', 'land', 'pleased', 'walk0', 'walk1']);
  assert.equal(Object.keys(BUILT.stamps).length, 22);
  for (const [n, shapes] of Object.entries(BUILT.stamps)) {
    assert.ok(shapes.length >= 1 && shapes.length <= 6, n + ': ' + shapes.length + ' tiles');
    for (const s of shapes) {
      assert.equal(s.k, 'pix'); assert.equal(s.runs, true);
      assert.ok(Number.isInteger(s.p[0]) && Number.isInteger(s.p[1]));
      assert.ok(Object.keys(s.key).length <= PK.LIMITS.pixKeys, n + ': ' + Object.keys(s.key).length + ' keys');
      assert.ok(Object.keys(s.key).every(k => /^[a-zA-Z]$/.test(k)), n + ': keys are letters, never a digit or "."');
    }
  }
});

test('a row in runs writes a count for three or more of a character, and none for fewer', () => {
  assert.equal(T.runsOf('aaabbc....'), '3abbc4.');
  assert.equal(T.runsOf('a'), 'a');
  assert.equal(T.runsOf('..........aa'), '10.aa');
});

test('the pack library reads the stamps back to the code\'s cells, pixel for pixel, in both coats', () => {
  const r = PK.read(SIGN.withoutSig(TEXT), { allowUnsigned: true });
  assert.equal(r.ok, true, r.reason);
  const m = r.data.cast[T.MEMBER], [w, h] = m.sprite.size, [ax, ay] = m.sprite.feet;
  assert.deepEqual([w, h, ax, ay], [200, 150, 100, 132]);
  for (const coat of Object.keys(m.coats)) for (const pose of CAT.poses) {
    const cells = new Array(w * h).fill(null);
    for (const s of r.data.stamps[m.coats[coat].poses[pose]]) {
      assert.equal(s.runs, undefined, 'read as plain rows');
      s.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') cells[(s.p[1] + ay + j) * w + s.p[0] + ax + i] = s.key[row[i]]; });
    }
    assert.deepEqual(cells, plain(CAT.cells(coat, pose)), coat + ' ' + pose);
  }
});

test('the cat stays inside the pack\'s limits: its pixels, the stamps and each pose\'s cost', () => {
  let px = 0;
  const r = PK.read(SIGN.withoutSig(TEXT), { allowUnsigned: true });
  for (const n of Object.keys(r.data.stamps)) for (const s of r.data.stamps[n]) if (s.k === 'pix') px += s.rows.length * s.rows[0].length;
  assert.ok(px <= PK.LIMITS.pixPack, px + ' pixels');
  assert.ok(Object.keys(RAW.stamps).length <= PK.WORLD_LIMITS.stamps);
  // the costs the counts step found for the cat: each pose its runs, under a pose's 8000
  for (const coat of Object.keys(r.world.cast[T.MEMBER].coats)) for (const [pose, c] of Object.entries(r.world.cast[T.MEMBER].coats[coat])) assert.ok(c > 0 && c <= 8000, coat + ' ' + pose + ' ' + c);
});
