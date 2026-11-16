// The page's settings lists against the settings schema, collector/settings-schema.json: the
// values each key may take, the page's own defaults, the quiet scenes and every scene, the
// conditions and their own scenes, and which scenes the page offers for each condition.
// Run with: node --test tests/web/
//
// The collector's side is checked by tests/collector/test_schema.py, and the copy of the schema
// in web/js/settings.js by tests/tools/settings-schema.test.js, so the three cannot drift apart.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SET = require('../../web/js/settings.js');
const ST = require('../../web/js/state.js');

const ROOT = path.join(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'collector/settings-schema.json'), 'utf8'));
const table = name => SCHEMA.tables.find(t => t.table === name);
const settings = name => table(name).settings;
const plain = v => JSON.parse(JSON.stringify(v));

/* The page's scripts as index.html loads them, up to the settings, in a sandbox: what the loaded
   scenes can act and the engine's quiet turns. */
function page() {
  const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
    .filter(f => f !== 'js/main.js' && f !== 'js/demo.js');
  const quiet = new Proxy({}, { set() { return true; }, get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {} }, document: { createElement: () => ({ width: 0, height: 0, getContext: () => quiet }) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  return box.window.KW;
}

test('the values each key may take are the schema\'s', () => {
  for (const sec of ['look', 'display']) {
    assert.deepEqual(Object.keys(SET.ONE_OF[sec]), settings(sec).map(s => s.key), sec);
    for (const s of settings(sec)) assert.deepEqual(SET.ONE_OF[sec][s.key], s.type === 'boolean' ? [true, false] : s.values, sec + '.' + s.key);
  }
  assert.deepEqual(SET.KEYS.quiet, settings('quiet').map(s => s.key));
  const minutes = settings('quiet').find(s => s.key === 'minutes');
  assert.deepEqual(SET.MINUTES, { least: minutes.min, most: minutes.max });
});

test('a long name is the schema\'s long_name, and the keys that take one are the schema\'s', () => {
  assert.equal(SET.LONG.source, SCHEMA.long_name.replace('/', '\\/'));
  for (const sec of ['look', 'quiet']) for (const s of settings(sec)) assert.equal(!!(SET.SCHEMA[sec][s.key].long), !!s.long, sec + '.' + s.key);
  for (const s of settings('look').filter(x => x.type === 'table')) assert.deepEqual(SET.TABLES[s.key], s.keys, s.key);
  assert.deepEqual(SET.KINDS, settings('look').find(s => s.key === 'devices').keys);
});

test('the page\'s own defaults are the schema\'s', () => {
  for (const sec of ['look', 'display', 'quiet']) {
    const want = {};
    for (const s of settings(sec)) want[s.key] = s.page_default;
    assert.deepEqual(plain(SET.BUILT_IN[sec]), want, sec);
  }
  assert.deepEqual(SET.BUILT_IN.scenes, {}, 'the scenes section is filled from the world');
});

test('the quiet scenes and every scene are the schema\'s, and every scene has its file', () => {
  const quiet = settings('quiet').find(s => s.key === 'scenes');
  assert.deepEqual(SET.SCENES, SCHEMA.scenes.filter(s => s.quiet).map(s => s.id));
  assert.deepEqual(SET.SCENES, quiet.values);
  assert.deepEqual(SET.ALL_SCENES, SCHEMA.scenes.map(s => s.id));
  const files = fs.readdirSync(path.join(WEB, 'js/scenes')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  assert.deepEqual(files, SET.ALL_SCENES.slice().sort());
  assert.deepEqual(plain(page().engine.TURNS), SET.SCENES, 'the engine turns between the same quiet scenes');
});

test('the page\'s conditions and their own scenes are the schema\'s, in its order', () => {
  assert.deepEqual(Object.keys(ST.CONDITIONS), SCHEMA.conditions.map(c => c.id));
  for (const c of SCHEMA.conditions) assert.equal(ST.CONDITIONS[c.id].scene, c.scene, c.id);
});

test('the conditions the page offers, and the scenes that can act each, are the schema\'s [scenes]', () => {
  const KW = page(), offered = SET.offered(KW.settings.pageWorld()), want = {};
  for (const s of settings('scenes')) want[s.key] = s.acts;
  assert.deepEqual(plain(offered), want);
  for (const s of settings('scenes')) assert.deepEqual(s.values, SET.ALL_SCENES, s.key + ': the collector takes any scene');
});
