// Tests for the carrier tool, tools/pack-carrier.js, and for the carriers it wrote under
// web/packs/. Run with: node --test tests/tools/
// A carrier is one line that pushes its pack file's text onto KW.packText. Each test here runs the
// carriers in a sandbox and requires the text they push to be the file's, byte for byte.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const T = require('../../tools/pack-carrier.js');

const ROOT = path.join(__dirname, '../..');
const PACKS = path.join(ROOT, 'web/packs');

// The texts a carrier's source pushes, run as the page runs it, with KW a global.
function pushed(src) {
  const box = vm.createContext({ KW: { packText: [] } });
  vm.runInContext(src, box);
  return box.KW.packText;
}

test('every pack file under web/packs/ has a carrier, and every carrier a pack file', () => {
  const names = fs.readdirSync(PACKS);
  const json = names.filter(n => n.endsWith('.pack.json')).map(n => n.slice(0, -5)).sort();
  const js = names.filter(n => n.endsWith('.pack.js')).map(n => n.slice(0, -3)).sort();
  assert.ok(json.includes('base.pack'), 'the base pack ships with the page');
  assert.deepEqual(js, json);
  assert.deepEqual(names.filter(n => !n.endsWith('.pack.json') && !n.endsWith('.pack.js')), [], 'web/packs/ holds packs and carriers only');
});

for (const file of T.packFiles(PACKS)) {
  const name = path.basename(file);
  test('the carrier of ' + name + ' pushes the file\'s text, byte for byte, and is what the tool writes', () => {
    const text = fs.readFileSync(file, 'utf8'), src = fs.readFileSync(T.carrierPath(file), 'utf8');
    assert.deepEqual(pushed(src), [text]);
    assert.equal(src, T.carrier(text), 'the carrier is stale: run node tools/pack-carrier.js');
    assert.equal(src.split('\n').length, 2, 'one line, ended by a line feed');
    assert.match(src, /^KW\.packText\.push\("(?:[^"\\]|\\.)*"\);\n$/, 'one call of push with one string, and nothing else');
  });
}

test('a carrier carries any text unchanged: quotes, backslashes, line separators, a closing script tag', () => {
  const text = '{"a": "\\"q\\" \\\\     </script> é 🛡"}\n\t  ';
  assert.deepEqual(pushed(T.carrier(text)), [text]);
});

test('the tool writes the carrier beside its file, and refuses a file that is not JSON', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-carrier-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const good = path.join(dir, 'x.pack.json'), bad = path.join(dir, 'y.pack.json');
  fs.writeFileSync(good, '{"kwpack": 1, "pack": {}}\n');
  fs.writeFileSync(bad, '{"kwpack": 1,');
  let r = spawnSync(process.execPath, [path.join(ROOT, 'tools/pack-carrier.js'), good], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pushed(fs.readFileSync(path.join(dir, 'x.pack.js'), 'utf8')), ['{"kwpack": 1, "pack": {}}\n']);
  r = spawnSync(process.execPath, [path.join(ROOT, 'tools/pack-carrier.js'), bad], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /y\.pack\.json: not valid JSON/);
  assert.ok(!fs.existsSync(path.join(dir, 'y.pack.js')));
});
