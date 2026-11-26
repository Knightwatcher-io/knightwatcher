// Tests for the wrapper that caps a run's CPU and memory, tools/capped.sh. Run with:
// node --test 'tests/tools/**/*.test.js'
// Each test puts a systemd-run that always fails first on PATH, as on a machine with no systemd
// user session, so the wrapper takes the path that makes no scope and nothing is capped for real.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const TOOL = path.join(ROOT, 'tools/capped.sh');

// A temporary folder with the failing systemd-run in it: { base, env }, env having that folder
// first on PATH and no KW_CAPPED of the caller's.
function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-capped-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'bin'));
  fs.writeFileSync(path.join(base, 'bin/systemd-run'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const env = Object.assign({}, process.env, { PATH: path.join(base, 'bin') + path.delimiter + process.env.PATH });
  delete env.KW_CAPPED;
  return { base, env };
}

// A script that caps itself as tools/shots.sh does, then prints the KW_CAPPED it runs with.
function selfCapping(base) {
  const script = path.join(base, 'self-capping.sh');
  fs.writeFileSync(script, '#!/usr/bin/env bash\n' +
    '[[ -n "${KW_CAPPED:-}" ]] || exec ' + JSON.stringify(TOOL) + ' "$0" "$@"\n' +
    'echo "$KW_CAPPED"\n', { mode: 0o755 });
  return script;
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env, timeout: 5000 });
  return { code: r.status, out: r.stdout, err: r.stderr, error: r.error };
}

test('the script parses as bash', () => {
  const r = spawnSync('bash', ['-n', TOOL], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('without a systemd user session a script that caps itself runs once, with KW_CAPPED set', t => {
  const s = sandbox(t);
  const r = run('bash', [selfCapping(s.base)], s.env);
  assert.equal(r.error, undefined, 'the script did not finish in time, so it wrapped itself again');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'nice\n');
});

test('a KW_CAPPED already set is kept as it was', t => {
  const s = sandbox(t);
  const r = run(TOOL, ['bash', '-c', 'echo "$KW_CAPPED"'], Object.assign(s.env, { KW_CAPPED: '400%,4G' }));
  assert.equal(r.error, undefined);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '400%,4G\n');
});

test('the command\'s exit code is the wrapper\'s without a systemd user session', t => {
  const s = sandbox(t);
  for (const code of [0, 1, 3]) {
    const r = run(TOOL, ['bash', '-c', 'exit ' + code], s.env);
    assert.equal(r.error, undefined);
    assert.equal(r.code, code, r.err);
  }
});
