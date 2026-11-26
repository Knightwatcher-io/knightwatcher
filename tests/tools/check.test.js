// Tests for the script that runs the project's checks, tools/check.sh, and for the CI workflow
// that calls it, .github/workflows/ci.yml. Run with:
// node --test tests/tools/
// Only the script's arguments are tried here, since each is refused before any check runs; the
// checks themselves are run by the script, never by these tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const TOOL = path.join(ROOT, 'tools/check.sh');
const SUBSETS = ['all', 'python', 'lint', 'page', 'tools-site', 'schema', 'private'];

function run(...args) {
  const r = spawnSync('bash', [TOOL, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// The CI workflow without its comment lines.
function code() {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  return ci.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
}

test('the script parses as bash', () => {
  const r = spawnSync('bash', ['-n', TOOL], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('--help names every subset and exits 0', () => {
  const r = run('--help');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp('SUBSET is one of: ' + SUBSETS.join(' ') + ' '));
});

test('an unknown subset, option or second subset exits 2 with the usage', () => {
  for (const args of [['nonsense'], ['--fast'], ['python', 'lint']]) {
    const r = run(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, /^usage: tools\/check\.sh/m, args.join(' '));
  }
});

test('--shard goes with the page subset alone, as N/M with N at most M', () => {
  for (const args of [['python', '--shard=1/3'], ['--shard=1/3'], ['page', '--shard=4/3'], ['page', '--shard=0/3'], ['page', '--shard=1']]) {
    const r = run(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.out, '', args.join(' '));
  }
});

test('KW_TEST_CONCURRENCY must be a positive whole number', () => {
  const r = spawnSync('bash', [TOOL, 'schema'], { encoding: 'utf8', env: Object.assign({}, process.env, { KW_TEST_CONCURRENCY: 'two' }) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /KW_TEST_CONCURRENCY/);
});

test('node --test is given glob patterns, never a folder, which Node 24 would load as a module', () => {
  const script = fs.readFileSync(TOOL, 'utf8');
  const patterns = [...script.matchAll(/^[A-Z]+_TESTS='([^']+)'$/gm)].map(m => m[1]);
  assert.deepEqual(patterns, ['tests/web/**/*.test.js', 'tests/tools/**/*.test.js', 'tests/site/**/*.test.mjs']);
  for (const p of patterns) assert.ok(fs.globSync(p, { cwd: ROOT }).length > 0, p + ' matches no file');
  const code = script.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(code, /\btests\/(web|tools|site)\/?['"]?(\s|$)/, 'a folder passed to node');
});

test('a shard that is given no test file fails, never passes having run nothing', () => {
  const r = run('page', '--shard=100/100');
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /node --test ran no tests in shard 100\/100/);
});

test('CI runs every subset but all and private through the script, and never the private check', () => {
  const ci = code();
  const called = new Set([...ci.matchAll(/^\s*run: tools\/check\.sh (\S+)/gm)].map(m => m[1]));
  assert.deepEqual([...called].sort(), SUBSETS.filter(s => s !== 'all' && s !== 'private').sort());
  assert.doesNotMatch(ci, /check-private\.sh|tools\/check\.sh private/);
  const shards = ci.match(/shard: \[([\d, ]+)\]/);
  assert.ok(shards, 'the page job has a shard matrix');
  const n = shards[1].split(',').map(s => Number(s.trim()));
  assert.deepEqual(n, n.map((_, i) => i + 1), 'the shards count from 1');
  assert.match(ci, new RegExp('tools/check\\.sh page --shard=\\$\\{\\{ matrix\\.shard \\}\\}/' + n.length + '\\b'));
});

test('CI gate needs every other job of the workflow', () => {
  const ci = code();
  const jobs = [...ci.slice(ci.indexOf('\njobs:\n')).matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map(m => m[1]);
  assert.ok(jobs.includes('ci-gate'));
  const gate = ci.slice(ci.indexOf('\n  ci-gate:'));
  assert.match(gate, /name: CI gate\n/);
  assert.match(gate, /if: always\(\)/);
  const needs = gate.match(/needs:\n((?: {6}- \S+\n)+)/);
  assert.ok(needs, 'CI gate lists what it needs');
  const listed = needs[1].trim().split('\n').map(l => l.replace(/^\s*- /, ''));
  assert.deepEqual(listed.sort(), jobs.filter(j => j !== 'ci-gate').sort());
});
