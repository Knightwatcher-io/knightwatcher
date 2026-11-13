// Tests for the deploy tool, tools/deploy.sh. Run with: node --test tests/tools/
// Each test copies web/ and the tool into a temporary folder and deploys from there into another,
// so the repository's own web/ is never touched and the copy has no git behind it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');

// Every file under dir, as paths relative to it, sorted, with data/ at the top left out.
function files(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? rel + '/' + e.name : e.name;
    if (!rel && e.name === 'data') continue;
    if (e.isDirectory()) out.push(...files(dir, p)); else out.push(p);
  }
  return out.sort();
}
const read = (dir, p) => fs.readFileSync(path.join(dir, p), 'utf8');
const digest = dir => crypto.createHash('sha256').update(files(dir).map(p => p + '\0' + read(dir, p)).join('\0')).digest('hex');

// A temporary copy of the repository's tool and page: { base, web, tool, deploy(target) }.
function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-deploy-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'src/tools'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'web'), path.join(base, 'src/web'), { recursive: true, filter: p => p !== path.join(ROOT, 'web/data') });
  fs.copyFileSync(path.join(ROOT, 'tools/deploy.sh'), path.join(base, 'src/tools/deploy.sh'));
  const tool = path.join(base, 'src/tools/deploy.sh');
  return { base, web: path.join(base, 'src/web'), tool, deploy: target => run(tool, target) };
}
function run(tool, ...args) {
  const r = spawnSync('bash', [tool, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const versionIn = dir => JSON.parse(read(dir, 'version.json')).version;

test('a deploy copies web/ and stamps the copy with a version', t => {
  const s = sandbox(t), site = path.join(s.base, 'site');
  const r = s.deploy(site);
  assert.equal(r.code, 0, r.err);
  const v = versionIn(site);
  assert.match(v, /^[0-9a-f]{12}$/);
  assert.equal(read(site, 'version.json'), '{"version": "' + v + '"}\n');
  assert.equal(r.out, 'deployed ' + v + ' to ' + fs.realpathSync(site) + '\n');
  assert.deepEqual(files(site), files(s.web).concat('version.json').sort());
  for (const p of files(s.web)) if (p !== 'index.html') assert.equal(read(site, p), read(s.web, p), p);

  // index.html differs from the source only by the stamps
  const html = read(site, 'index.html');
  assert.match(html, new RegExp('<meta name="kw-version" content="' + v + '">'));
  const addrs = [...html.matchAll(/<script[^>]* src="([^"]*)"|<link[^>]* rel="stylesheet"[^>]* href="([^"]*)"/g)].map(m => m[1] || m[2]);
  assert.ok(addrs.length >= 2);
  for (const a of addrs) {
    assert.ok(a.endsWith('?v=' + v), a);
    assert.ok(fs.existsSync(path.join(site, a.slice(0, -('?v=' + v).length))), a);
  }
  assert.equal(html.split('?v=' + v).join('').replace('content="' + v + '"', 'content="dev"'), read(s.web, 'index.html'));
});

test('the copy leaves the target\'s data/ alone and deletes stale files', t => {
  const s = sandbox(t), site = path.join(s.base, 'site');
  fs.mkdirSync(path.join(site, 'data'), { recursive: true });
  fs.mkdirSync(path.join(site, 'js/old'), { recursive: true });
  fs.writeFileSync(path.join(site, 'data/state.json'), '{"schema": 1}\n');
  fs.writeFileSync(path.join(site, 'stale.js'), '');
  fs.writeFileSync(path.join(site, 'js/old/stale.js'), '');
  assert.equal(s.deploy(site).code, 0);
  assert.equal(read(site, 'data/state.json'), '{"schema": 1}\n');
  assert.ok(!fs.existsSync(path.join(site, 'stale.js')));
  assert.ok(!fs.existsSync(path.join(site, 'js/old')));
});

test('the version follows the page\'s files and nothing else', t => {
  const s = sandbox(t), site = path.join(s.base, 'site');
  s.deploy(site); const v1 = versionIn(site);
  // the same files again: the same version, whatever the times on them
  const later = new Date(Date.now() + 3600e3);
  fs.utimesSync(path.join(s.web, 'js/main.js'), later, later);
  s.deploy(site); assert.equal(versionIn(site), v1);
  // a source data/ folder plays no part and is not copied
  fs.mkdirSync(path.join(s.web, 'data'));
  fs.writeFileSync(path.join(s.web, 'data/state.json'), '{}');
  s.deploy(site); assert.equal(versionIn(site), v1);
  assert.ok(!fs.existsSync(path.join(site, 'data/state.json')));
  // a changed file changes it
  fs.appendFileSync(path.join(s.web, 'css/display.css'), '\n');
  s.deploy(site); const v2 = versionIn(site);
  assert.notEqual(v2, v1);
  assert.match(read(site, 'index.html'), new RegExp('css/display.css\\?v=' + v2));
  // so does a renamed one
  fs.renameSync(path.join(s.web, 'fonts/OFL.txt'), path.join(s.web, 'fonts/LICENCE.txt'));
  s.deploy(site); assert.notEqual(versionIn(site), v2);
  assert.ok(!fs.existsSync(path.join(site, 'fonts/OFL.txt')));
});

test('a target that is web/, inside it or holds it is refused', t => {
  const s = sandbox(t), before = digest(s.web);
  for (const target of [s.web, path.join(s.web, 'js'), path.join(s.web, 'deep/site'), path.join(s.base, 'src'), s.base]) {
    const r = s.deploy(target);
    assert.equal(r.code, 1, target);
    assert.match(r.err, /^deploy: the target /, target);
  }
  assert.ok(!fs.existsSync(path.join(s.web, 'deep')));
  assert.equal(digest(s.web), before);
  assert.equal(run(s.tool).code, 2);
  assert.equal(run(s.tool, '').code, 2);
});

test('an index.html without the version tag is refused and nothing is copied', t => {
  const s = sandbox(t), site = path.join(s.base, 'site');
  fs.writeFileSync(path.join(s.web, 'index.html'), read(s.web, 'index.html').replace('name="kw-version"', 'name="other"'));
  const r = s.deploy(site);
  assert.equal(r.code, 1);
  assert.match(r.err, /no <meta name="kw-version"/);
  assert.deepEqual(fs.readdirSync(site), []);
});

test('the repository\'s own tool leaves web/ unchanged', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-deploy-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const web = path.join(ROOT, 'web'), before = digest(web);
  const r = run(path.join(ROOT, 'tools/deploy.sh'), path.join(base, 'site'));
  assert.equal(r.code, 0, r.err);
  assert.equal(digest(web), before);
  assert.match(read(web, 'index.html'), /<meta name="kw-version" content="dev">/);
});
