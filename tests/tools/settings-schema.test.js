// Tests for tools/settings-schema.js, and for what it wrote: the copy of the settings schema in
// web/js/settings.js and the reference in docs/configuration.md. Run with:
// node --test 'tests/tools/**/*.test.js'
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../../tools/settings-schema.js');
const SET = require('../../web/js/settings.js');

const ROOT = path.join(__dirname, '../..');
const TOOL = path.join(ROOT, 'tools/settings-schema.js');
const SCHEMA = JSON.parse(fs.readFileSync(T.SCHEMA, 'utf8'));

/* A copy of the three files the tool reads and writes, under a folder of its own. */
function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-schema-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['collector/settings-schema.json', 'web/js/settings.js', 'docs/configuration.md', 'tools/settings-schema.js']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, 'tools/settings-schema.js'), ...args], { encoding: 'utf8', cwd: dir });

test('the page\'s copy and the reference are what the tool writes: neither is stale', () => {
  const r = spawnSync(process.execPath, [TOOL, '--check'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout + r.stderr, '');
  for (const [file, now, want] of T.targets()) assert.equal(now, want, path.relative(ROOT, file) + ' is stale: run node tools/settings-schema.js');
});

test('the page reads exactly the part of the schema the tool takes for it', () => {
  const want = {};
  for (const t of SCHEMA.tables.filter(x => x.defaults_for === 'display' && x.table !== 'scenes')) {
    want[t.table] = {};
    for (const s of t.settings) want[t.table][s.key] = T.pageSetting(s);
  }
  want.scenes = SCHEMA.scenes.map(s => s.id);
  assert.deepEqual(JSON.parse(JSON.stringify(SET.SCHEMA)), want);
});

test('the reference has a section for every table and a row for every setting and variable', () => {
  const doc = fs.readFileSync(T.DOC, 'utf8');
  const part = doc.slice(doc.indexOf(T.DOC_MARKS[0]), doc.indexOf(T.DOC_MARKS[1]));
  for (const t of SCHEMA.tables) {
    assert.ok(part.includes('\n### ' + (t.many ? '[[' + t.table + ']]' : '[' + t.table + ']') + '\n'), t.table);
    for (const s of t.settings) assert.match(part, new RegExp('\\| `' + s.key + '` \\| '), t.table + '.' + s.key);
  }
  for (const e of SCHEMA.env) assert.ok(part.includes('| `' + e.name + '` | ' + e.scope + ' |'), e.name);
  assert.doesNotMatch(part, /[\u2013\u2014]/, 'no en or em dash');
});

test('a change to the schema makes both stale, and running the tool brings them up to date', t => {
  const dir = copy(t), file = path.join(dir, 'collector/settings-schema.json');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  schema.tables.find(x => x.table === 'quiet').settings.find(s => s.key === 'minutes').max = 480;
  fs.writeFileSync(file, JSON.stringify(schema, null, 2) + '\n');
  let r = run(dir, '--check');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /web\/js\/settings\.js is stale/);
  assert.match(r.stderr, /docs\/configuration\.md is stale/);
  r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'web/js/settings.js'), 'utf8'), /minutes: \{ min: 1, max: 480, page: 10 \}/);
  assert.match(fs.readFileSync(path.join(dir, 'docs/configuration.md'), 'utf8'), /a whole number of minutes, from 1 to 480/);
  assert.equal(run(dir, '--check').status, 0);
});

test('the tool refuses a file whose markers are missing or doubled, and writes nothing', t => {
  const dir = copy(t), doc = path.join(dir, 'docs/configuration.md'), before = fs.readFileSync(path.join(dir, 'web/js/settings.js'), 'utf8');
  fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace(T.DOC_MARKS[1], ''));
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /configuration\.md: needs each of/);
  assert.equal(fs.readFileSync(path.join(dir, 'web/js/settings.js'), 'utf8'), before);
  assert.throws(() => T.splice('a\n' + T.PAGE_MARKS[0] + T.PAGE_MARKS[0] + T.PAGE_MARKS[1], T.PAGE_MARKS, '', 'x'), /needs each of/);
  assert.equal(T.splice('a\n' + T.PAGE_MARKS[0] + 'old\n' + T.PAGE_MARKS[1] + 'b\n', T.PAGE_MARKS, 'new\n', 'x'), 'a\n' + T.PAGE_MARKS[0] + 'new\n' + T.PAGE_MARKS[1] + 'b\n');
});

test('values and defaults are written as config.toml writes them', () => {
  const s = (o) => Object.assign({ type: 'integer', scope: 'household' }, o);
  assert.equal(T.valuesText(s({ min: 5, unit: 'seconds' })), 'a whole number of seconds, at least 5');
  assert.equal(T.valuesText(s({ min: 0, unit: 'seconds' })), 'a whole number of seconds, zero or more');
  assert.equal(T.valuesText(s({ type: 'number', above: 0, max: 100, unit: 'percent' })), 'a percentage, above 0, at most 100');
  assert.equal(T.valuesText(s({ type: 'string', values: ['a', 'b', 'c'] })), '`"a"`, `"b"` or `"c"`');
  assert.equal(T.valuesText(s({ type: 'boolean' })), '`true` or `false`');
  assert.equal(T.defaultText(s({ type: 'number', default: 5 })), '`5.0`');
  assert.equal(T.defaultText(s({ type: 'list', default: ['sshd'] })), '`["sshd"]`');
  assert.equal(T.defaultText(s({ type: 'string', default: null, required: true })), 'required');
  assert.equal(T.defaultText(s({ type: 'string', default: null, page_default: 'warm' })), 'none; the page\'s own is `"warm"`');
});
