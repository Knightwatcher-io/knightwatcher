// Tests for the check that no private detail is tracked, tools/check-private.sh. Run with:
// node --test tests/tools/
// Each test makes a small git repository in a temporary folder, with the tool, a tracked file and
// a pattern file of its own, so the repository's own patterns are never read.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const ENV = Object.assign({}, process.env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull });

// A repository holding the tool and notes.txt, tracked; patterns, when given, is the pattern file.
function repo(t, notes, patterns) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-private-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(ROOT, 'tools/check-private.sh'), path.join(dir, 'tools/check-private.sh'));
  fs.writeFileSync(path.join(dir, 'notes.txt'), notes);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'tools/private-patterns.txt\n');
  if (patterns !== undefined) fs.writeFileSync(path.join(dir, 'tools/private-patterns.txt'), patterns);
  const git = (...args) => assert.equal(spawnSync('git', args, { cwd: dir, env: ENV }).status, 0, 'git ' + args.join(' '));
  git('init', '-q');
  git('add', '.');
  return dir;
}
function run(dir) {
  const r = spawnSync('bash', ['tools/check-private.sh'], { cwd: dir, env: ENV, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('a tracked file with nothing private passes', t => {
  const r = run(repo(t, 'Robin keeps the wall at 192.0.2.10\n', 'example-private-name\n'));
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '');
});

test('a match names the line and fails with 1', t => {
  const r = run(repo(t, 'line one\nthe example-private-name is here\n', 'example-private-name\n'));
  assert.equal(r.code, 1);
  assert.match(r.out, /notes\.txt:2:the example-private-name is here/);
  assert.match(r.err, /private detail found in tracked files/);
});

test('a missing or empty pattern file fails with 2', t => {
  for (const patterns of [undefined, '']) {
    const r = run(repo(t, 'anything\n', patterns));
    assert.equal(r.code, 2);
    assert.match(r.err, /is missing or empty/);
  }
});

test('a pattern git grep cannot read fails with 2 and never passes as clean', t => {
  const r = run(repo(t, 'anything\n', 'a(b\n'));
  assert.equal(r.code, 2);
  assert.match(r.err, /git grep failed \(exit \d+\), so nothing was checked/);
});
