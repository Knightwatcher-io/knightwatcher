// Tests for the website's build, site/build.mjs, and what it writes: the pages and their nav, the
// demo copied from web/ and stamped, the legal pages against legal/, the Web Analytics snippet,
// _headers, and the local preview's answers. The docs and Supported Feeds are in docs.test.mjs.
// Each build goes to a scratch folder that is removed afterwards.
// Run with: node --test 'tests/site/**/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { build, stampIndex, resolveVersion, readToken, analyticsSnippet, LEGAL, NAV, ROOT } from '../../site/build.mjs';
import { siteCsp, DEMO_CSP } from '../../site/headers.mjs';
import { handler } from '../../site/preview.mjs';

const VERSION = 'abc123def456';
const TOKEN = '0123456789abcdef0123456789abcdef';
const SNIPPET = /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "([^"]+)"\}'><\/script>/;
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kw-site-test-'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const rel = (dir, files) => files.map(f => path.relative(dir, f).split(path.sep).join('/')).sort();

/* A copy of what the build reads, web/, site/, legal/, docs/, the provider files and the files the
   docs' index links, in a scratch folder, with a data/ folder in web/ as the collector leaves one,
   so the build can be shown to leave it out. */
const COPIED = ['web', 'site', 'legal', 'docs', 'collector/providers/builtin', '.github/CONTRIBUTING.md'];
function scratchRoot() {
  const root = scratch();
  for (const d of COPIED) fs.cpSync(path.join(ROOT, d), path.join(root, d), { recursive: true, filter: s => !s.includes(path.sep + 'dist') });
  fs.mkdirSync(path.join(root, 'web/data/packs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web/data/state.json'), '{"schema": 1}');
  return root;
}
const once = (() => { let r = null; return () => (r = r || (() => { const root = scratchRoot(); return { root, ...build({ out: path.join(root, 'out'), version: VERSION, token: '', root }) }; })()); })();
const withToken = (() => { let r = null; return () => (r = r || (() => { const root = scratchRoot(); return { root, ...build({ out: path.join(root, 'out'), version: VERSION, token: TOKEN, root }) }; })()); })();
test.after(() => { for (const f of [once, withToken]) { try { fs.rmSync(f().root, { recursive: true, force: true }); } catch (e) { /* gone */ } } });

/* The text a reader sees in an HTML fragment: tags dropped, entities read, spaces collapsed. */
const textOf = html => html.replace(/<\/?(code|strong|a)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&copy;/g, '©').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/* The text of a markdown line as it reads on the page. */
const mdText = line => line.replace(/^#+ |^- |^ +/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

/* The site's own pages, every page but the demo's. */
const PAGES = ['index.html', 'features/index.html', 'feeds/index.html', 'install/index.html', 'licence/index.html', 'docs/index.html',
  'docs/configuration/index.html', 'docs/contributing/index.html', 'docs/website/index.html', 'privacy/index.html', 'art-licence/index.html',
  'name-and-logo/index.html', '404.html'];
const allPages = out => rel(out, walk(out)).filter(f => f.endsWith('.html') && !f.startsWith('demo/'));

test('the build writes the pages, the assets and the demo, and nothing of web/admin or web/data', () => {
  const { out } = once();
  const files = rel(out, walk(out));
  for (const f of [...PAGES, '_headers', 'css/site.css', 'js/site.js', 'logo.svg',
    'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'fonts/VT323-Regular.ttf', 'fonts/OFL.txt', 'img/settings.png', 'img/ev-crate.png',
    'demo/index.html', 'demo/version.json', 'demo/js/main.js', 'demo/packs/base.pack.js', 'demo/packs/medieval.pack.json', 'demo/fonts/VT323-Regular.ttf']) {
    assert.ok(files.includes(f), f);
  }
  assert.deepEqual(files.filter(f => /^demo\/(admin|data)(\/|$)/.test(f)), []);
  // the demo is web/ itself, file for file, but for the stamped index.html and version.json
  const web = rel(path.join(once().root, 'web'), walk(path.join(once().root, 'web'))).filter(f => !/^(admin|data)\//.test(f));
  assert.deepEqual(files.filter(f => f.startsWith('demo/')).map(f => f.slice(5)).filter(f => f !== 'version.json'), web);
  for (const f of web.filter(f => f !== 'index.html')) assert.ok(fs.readFileSync(path.join(out, 'demo', f)).equals(fs.readFileSync(path.join(ROOT, 'web', f))), f);
  // every picture and file each page names is in the build (the docs' links and anchors are
  // checked in docs.test.mjs)
  for (const p of allPages(out)) {
    const html = fs.readFileSync(path.join(out, p), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="(\/[^"#?]*)/g)) {
      const f = ref.endsWith('/') ? ref + 'index.html' : ref;
      assert.ok(fs.existsSync(path.join(out, f)), `${p}: ${ref}`);
    }
    assert.doesNotMatch(html, /<!-- @/, p);
  }
  // no page names the picture the strain card had before it
  for (const p of allPages(out)) assert.doesNotMatch(fs.readFileSync(path.join(out, p), 'utf8'), /ev-cpu\.png/, p);
});

test('every page has the nav, its own section marked, and the footer', () => {
  const { out } = once();
  for (const p of allPages(out)) {
    const html = fs.readFileSync(path.join(out, p), 'utf8');
    const nav = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
    assert.deepEqual([...nav.matchAll(/<a href="(\/[^"]*)"[^>]*>([^<]+)<\/a>/g)].map(m => [m[1], m[2]]), NAV, p);
    assert.match(nav, /href="https:\/\/github\.com\/knightwatcher-io\/knightwatcher"/, p);
    assert.match(html, /<footer>/, p);
    const marked = [...nav.matchAll(/<a href="([^"]+)" aria-current="(page|true)">/g)].map(m => m[1] + ' ' + m[2]);
    const want = { 'index.html': ['/ page'], 'features/index.html': ['/features/ page'], 'feeds/index.html': ['/feeds/ page'], 'install/index.html': ['/install/ page'],
      'licence/index.html': ['/licence/ page'], 'docs/index.html': ['/docs/ page'], '404.html': [] }[p];
    if (want) assert.deepEqual(marked, want, p);
    else if (p.startsWith('docs/')) assert.deepEqual(marked, ['/docs/ true'], p);
    else assert.deepEqual(marked, ['/licence/ true'], p);
  }
});

test('the demo is stamped with the commit, never dev, as tools/deploy.sh stamps a copy', () => {
  const { out } = once();
  const html = fs.readFileSync(path.join(out, 'demo/index.html'), 'utf8');
  assert.match(html, new RegExp(`<meta name="kw-version" content="${VERSION}">`));
  assert.doesNotMatch(html, /content="dev"/);
  assert.equal(fs.readFileSync(path.join(out, 'demo/version.json'), 'utf8'), `{"version": "${VERSION}"}\n`);
  const local = [...html.matchAll(/<script[^>]* src="([^"]+)"|<link[^>]* rel="stylesheet"[^>]* href="([^"]+)"/g)].map(m => m[1] || m[2]);
  assert.ok(local.length > 20);
  for (const a of local) assert.match(a, new RegExp(`\\?v=${VERSION}$`), a);
  assert.throws(() => stampIndex('<html></html>', VERSION), /no <meta name="kw-version"/);
  assert.throws(() => stampIndex(html, 'dev'), /not a version/);
});

test('the stamp gives the bytes server/stamp.py gives the same index.html', t => {
  const text = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  const py = spawnSync('python3', ['-c', 'import sys; from server.stamp import stamp_index; sys.stdout.write(stamp_index(sys.stdin.read(), sys.argv[1]))', VERSION],
    { cwd: ROOT, input: text, encoding: 'utf8' });
  if (py.error) { t.skip('python3 is not on the path'); return; }
  assert.equal(py.status, 0, py.stderr);
  assert.equal(stampIndex(text, VERSION), py.stdout);
});

test('the version comes from Workers Builds\' commit, or git, and the build refuses to go without one', () => {
  assert.equal(resolveVersion({ WORKERS_CI_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567' }), '0123456789ab');
  assert.match(resolveVersion({}, ROOT), /^[0-9a-f]{12}$/);
  const empty = scratch();
  try {
    assert.throws(() => resolveVersion({ WORKERS_CI_COMMIT_SHA: 'main' }, empty), /no commit/);
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
  assert.throws(() => build({ out: path.join(os.tmpdir(), 'kw-never'), version: 'dev', token: '' }), /not a version/);
});

test('the build refuses to write over the repository, web/ or site/', () => {
  for (const out of [ROOT, path.join(ROOT, 'web'), path.join(ROOT, 'site')]) assert.throws(() => build({ out, version: VERSION, token: '' }), /refusing/, out);
});

test('the legal pages are legal/\'s text, every line of it, with their contents', () => {
  const { out } = once();
  for (const L of LEGAL) {
    const page = fs.readFileSync(path.join(out, L.dir, 'index.html'), 'utf8');
    const article = page.slice(page.indexOf('<article class="doc">'), page.indexOf('</article>'));
    const shown = textOf(article);
    const source = fs.readFileSync(path.join(ROOT, L.from), 'utf8');
    // every block of the source, its lines joined as the page joins them
    const blocks = source.split(/\n\s*\n/).map(b => b.split('\n')).filter(b => !b[0].startsWith('#') && !b[0].startsWith('```'));
    for (const b of blocks) {
      const items = b[0].startsWith('- ') ? b.join('\n').split(/\n(?=- )/) : [b.join(' ')];
      for (const item of items) assert.ok(shown.includes(mdText(item.replace(/\n\s*/g, ' '))), `${L.from}: ${item.slice(0, 60)}`);
    }
    // each heading, and the level one heading as the page's own
    for (const h of source.match(/^#{2,3} .+$/gm) || []) assert.ok(shown.includes(mdText(h)), h);
    assert.match(page, new RegExp(`<h1>${source.match(/^# (.+)$/m)[1]}</h1>`));
    // the contents list each section, linked to its heading
    for (const h of source.match(/^## .+$/gm) || []) assert.match(page, new RegExp(`<li><a href="#[\\w-]+">${mdText(h)}</a></li>`), h);
  }
  const privacy = fs.readFileSync(path.join(out, 'privacy/index.html'), 'utf8');
  assert.match(privacy, /<h2 id="the-website">The website<\/h2>/, 'the footer links to #the-website');
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /href="\/privacy\/#the-website"/);
});

test('the Web Analytics snippet is absent without a token, and on every page but the demo and the 404 page with one', () => {
  const none = once().out, some = withToken().out;
  const pages = allPages(some).filter(p => p !== '404.html');
  for (const p of PAGES.filter(p => p !== '404.html')) assert.ok(pages.includes(p), p);
  assert.ok(pages.filter(p => p.startsWith('docs/')).length > 20, 'every docs page');
  for (const f of walk(none).filter(f => /\.(html|js|css|json)$/.test(f))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /beacon\.min\.js|data-cf-beacon/, f);
  for (const p of pages) assert.equal(fs.readFileSync(path.join(some, p), 'utf8').match(SNIPPET)[1], TOKEN, p);
  for (const f of walk(some).filter(f => /\.(html|js|css|json)$/.test(f) && !pages.includes(rel(some, [f])[0]))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /beacon\.min\.js|data-cf-beacon|cloudflareinsights/, f);
  }
  assert.equal(analyticsSnippet(''), '');
});

test('site.json\'s token is checked before it reaches a page', () => {
  const dir = scratch();
  try {
    const f = path.join(dir, 'site.json');
    for (const [token, ok] of [['', true], [TOKEN, true], ['"><script>', false], ['abc', false], ['x'.repeat(65), false]]) {
      fs.writeFileSync(f, JSON.stringify({ analyticsToken: token }));
      if (ok) assert.equal(readToken(f), token); else assert.throws(() => readToken(f), /not a Web Analytics token/, token);
    }
    assert.equal(readToken(path.join(ROOT, 'site/site.json')), JSON.parse(fs.readFileSync(path.join(ROOT, 'site/site.json'), 'utf8')).analyticsToken);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('_headers: a strict policy for the site, self alone for the demo, and the frame rules', () => {
  const none = fs.readFileSync(path.join(once().out, '_headers'), 'utf8');
  assert.equal(none, [
    '# Written by site/build.mjs from site/headers.mjs. The Worker sets the same headers.',
    '',
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    "  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    '  X-Frame-Options: DENY',
    '',
    '/demo/*',
    '  ! Content-Security-Policy',
    '  ! X-Frame-Options',
    "  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    '  X-Frame-Options: SAMEORIGIN',
    ''].join('\n'));
  const some = fs.readFileSync(path.join(withToken().out, '_headers'), 'utf8');
  assert.ok(some.includes(siteCsp(TOKEN)));
  assert.match(siteCsp(TOKEN), /script-src 'self' https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js;.* connect-src https:\/\/cloudflareinsights\.com;/);
  assert.doesNotMatch(siteCsp(''), /cloudflareinsights|connect-src/);
  // the beacon never reaches the demo's policy
  assert.ok(some.includes(DEMO_CSP));
  assert.doesNotMatch(DEMO_CSP, /cloudflareinsights|https?:|data:|unsafe/);
});

// The one outside address the demo may name is a link, never a fetch: the AGPL source link on the
// settings screen's Status page (KW.settings.SOURCE). The demo's policy still allows no outside host.
const DEMO_LINKS = new Set(['http://www.w3.org/2000/svg', 'https://github.com/knightwatcher-io/knightwatcher']);

test('the demo\'s files name no outside host but the source link, and its page has no inline script or style', () => {
  const demo = path.join(once().out, 'demo');
  for (const f of walk(demo).filter(f => /\.(html|js|css|json|svg)$/.test(f))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [url] of text.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi)) {
      assert.ok(DEMO_LINKS.has(url), `${path.relative(demo, f)}: ${url}`);
    }
  }
  const html = fs.readFileSync(path.join(demo, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<script(?![^>]* src=)[^>]*>/g)].map(m => m[0]), []);
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i);
  // the site's own pages hold no inline script, style or handler either, under their policy
  for (const p of allPages(once().out)) {
    const page = fs.readFileSync(path.join(once().out, p), 'utf8');
    assert.deepEqual([...page.matchAll(/<script(?![^>]* src=)[^>]*>/g)].map(m => m[0]), [], p);
    assert.doesNotMatch(page, /<style|\sstyle=|\son[a-z]+=/i, p);
  }
});

test('the home page frames the demo in ?demo, with its three buttons, and the pages link out only to the project', () => {
  const html = fs.readFileSync(path.join(once().out, 'index.html'), 'utf8');
  assert.match(html, /<iframe id="demoframe" src="\/demo\/\?demo#demo=1&amp;bar=0"[^>]* allow="fullscreen"/);
  for (const id of ['b-full', 'b-set', 'b-dev']) assert.match(html, new RegExp(`<button class="btn[^"]*" type="button" id="${id}"`), id);
  // the four highlights, each linked to its place in Features
  const features = fs.readFileSync(path.join(once().out, 'features/index.html'), 'utf8');
  const hl = [...html.matchAll(/<a href="\/features\/#(ev-[a-z]+)"><img src="\/img\/(ev-[a-z]+)\.png"/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(hl, [['ev-goblin', 'ev-goblin'], ['ev-crate', 'ev-crate'], ['ev-stream', 'ev-stream'], ['ev-strain', 'ev-strain']]);
  for (const [id] of hl) assert.match(features, new RegExp(`<li class="act" id="${id}">`), id);
  assert.match(features, /<h3>A machine is under strain<\/h3><p class="via">This machine, or any device through Prometheus, Beszel or Glances<\/p>/);
  assert.doesNotMatch(features + html, /The CPU is pinned/);
  // outside addresses: the project on GitHub, and on the Licence page the two ways to support it
  for (const p of allPages(once().out).filter(p => !p.startsWith('docs/') && !['privacy/index.html', 'art-licence/index.html', 'name-and-logo/index.html'].includes(p))) {
    const page = fs.readFileSync(path.join(once().out, p), 'utf8');
    for (const [, u] of page.matchAll(/href="(https?:[^"]+)"/g)) {
      assert.match(u, /^https:\/\/(github\.com\/knightwatcher-io\/knightwatcher([/#]|$)|ko-fi\.com\/valtora$|github\.com\/sponsors\/Valtora$)/, `${p}: ${u}`);
    }
  }
  const licence = fs.readFileSync(path.join(once().out, 'licence/index.html'), 'utf8');
  assert.match(licence, /href="https:\/\/ko-fi\.com\/valtora"/);
  assert.match(licence, /href="https:\/\/github\.com\/sponsors\/Valtora"/);
  for (const to of ['/art-licence/', '/privacy/', '/name-and-logo/', '/docs/contributing/']) assert.match(licence, new RegExp(`href="${to}"`), to);
});

test('the preview answers as the Worker does: the headers, folders, and the 404 page', async () => {
  const { out } = withToken();
  const server = http.createServer(handler(out, TOKEN)).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('content-security-policy'), siteCsp(TOKEN));
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    const demo = await fetch(base + '/demo/?demo');
    assert.equal(demo.status, 200);
    assert.equal(demo.headers.get('content-security-policy'), DEMO_CSP);
    assert.equal(demo.headers.get('x-frame-options'), 'SAMEORIGIN');
    const bare = await fetch(base + '/privacy', { redirect: 'manual' });
    assert.equal(bare.status, 307); assert.equal(bare.headers.get('location'), '/privacy/');
    const lost = await fetch(base + '/no-such-page');
    assert.equal(lost.status, 404); assert.match(await lost.text(), /<h1>Not found<\/h1>/);
    assert.equal((await fetch(base + '/_headers')).status, 404);
    assert.equal((await fetch(base + '/../package.json')).status, 404);
    for (const r of [home, demo, bare]) await r.arrayBuffer().catch(() => {});
  } finally { server.close(); }
});

test('the files the build copies from web/ are not kept twice in site/', () => {
  const site = path.join(ROOT, 'site');
  const own = rel(site, walk(site).filter(f => !f.includes(path.sep + 'dist' + path.sep)));
  for (const f of ['logo.svg', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'fonts/VT323-Regular.ttf']) assert.ok(!own.some(o => o.endsWith(path.basename(f))), f);
});
