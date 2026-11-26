// Tests for the website's docs and Supported Feeds, from site/build.mjs: the docs' index read from
// README.md's "## Documentation" section, a page for every doc, every link between the site's pages
// and every anchor resolving, links to the rest of the repository going to files that are there,
// and the services of Supported Feeds read from the provider files. Each build goes to a scratch
// folder that is removed afterwards. Run with: node --test tests/site/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, readDocsIndex, readFeeds, DOC_GROUPS, MORE, FEED_KINDS, ROOT } from '../../site/build.mjs';
import { REPO, escapeHtml } from '../../site/markdown.mjs';

const VERSION = 'abc123def456';
const COPIED = ['web', 'site', 'legal', 'docs', 'collector/providers/builtin', 'README.md', 'CONTRIBUTING.md'];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const roots = [];
/* A copy of what the build reads in a scratch folder, `change` applied to it before the build. */
function scratchRoot(change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-site-docs-'));
  roots.push(root);
  for (const d of COPIED) fs.cpSync(path.join(ROOT, d), path.join(root, d), { recursive: true, filter: s => !s.includes(path.sep + 'dist') });
  change(root);
  return root;
}
const built = (() => { let r = null; return () => (r = r || (() => { const root = scratchRoot(); return { root, ...build({ out: path.join(root, 'out'), version: VERSION, token: '', root }) }; })()); })();
test.after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
const page = (out, url) => fs.readFileSync(path.join(out, url.replace(/^\//, ''), url.endsWith('/') ? 'index.html' : ''), 'utf8');
const readme = root => fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const editReadme = (root, f) => fs.writeFileSync(path.join(root, 'README.md'), f(readme(root)));

test('the docs\' index is README.md\'s Documentation section: its three groups, each doc with its line', () => {
  const groups = readDocsIndex(ROOT);
  assert.deepEqual(groups.map(g => g.label), ['Running it', 'Making packs', 'Contributing']);
  assert.deepEqual(Object.values(DOC_GROUPS), ['Running it', 'Making packs', 'Contributing']);
  // every bullet of the section, in order, with its link and its words
  const section = readme(ROOT).split('## Documentation')[1].split(/\n## /)[0];
  const bullets = [...section.matchAll(/^- \[([^\]]+)\]\(([^)]+)\): (.+)$/gm)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(groups.flatMap(g => g.docs.map(d => [d.title, d.from, d.descriptionMd])), bullets);
  const at = Object.fromEntries(groups.flatMap(g => g.docs.map(d => [d.from, d.url])));
  assert.equal(at['docs/configuration.md'], '/docs/configuration/');
  assert.equal(at['CONTRIBUTING.md'], '/docs/contributing/');
  assert.equal(at['site/README.md'], '/docs/website/');
  assert.equal(at['docs/world-loading.md'], '/docs/world-loading/');
});

test('the docs\' index page lists every group and doc, and each doc has its page with the nav of them all', () => {
  const { out, docs } = built();
  const index = page(out, '/docs/');
  for (const g of docs) {
    assert.match(index, new RegExp(`<h2 id="[^"]+">${g.label}</h2>`), g.label);
    for (const d of g.docs) {
      assert.ok(index.includes(`<a href="${d.url}">${escapeHtml(d.title)}</a>`), d.from);
      const html = page(out, d.url);
      // the side lists every doc, this one marked, with each group's name
      for (const g2 of docs) assert.ok(html.includes(`<p class="dn-h">${g2.label}</p>`), `${d.from}: ${g2.label}`);
      for (const d2 of docs.flatMap(x => x.docs)) assert.ok(html.includes(`<a href="${d2.url}"${d2 === d ? ' aria-current="page"' : ''}>`), `${d.from}: ${d2.from}`);
      assert.ok(html.includes(`<p class="src-note">This page is <a href="${REPO}/blob/main/${d.from}">${d.from}</a>`), d.from);
    }
  }
  // configuration.md's own sections, its level three headings under their level two
  const conf = page(out, '/docs/configuration/');
  const toc = conf.slice(conf.indexOf('<nav class="toc"'), conf.indexOf('</nav>', conf.indexOf('<nav class="toc"')));
  assert.match(toc, /<li><a href="#every-setting">Every setting<\/a>\n\s+<ol>\n\s+<li><a href="#[\w-]+">/);
  assert.match(conf, /<h3 id="sourcesimports">\[\[sources\.imports\]\]<\/h3>/);
});

test('every link between the site\'s pages resolves, anchors included, and every other link of the repository names a file that is there', () => {
  const { out } = built();
  const pages = walk(out).filter(f => f.endsWith('.html') && !f.startsWith(path.join(out, 'demo') + path.sep));
  const ids = new Map(pages.map(f => [f, new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))]));
  let internal = 0, anchors = 0, repo = 0;
  const broken = [];
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8'), where = path.relative(out, f);
    for (const [, raw] of html.matchAll(/href="([^"]+)"/g)) {
      const href = raw.replace(/&amp;/g, '&');
      if (href.startsWith(REPO + '/')) {
        // the repository's own files on GitHub: a file at blob/, a folder at tree/, either there
        const m = /^https:\/\/github\.com\/knightwatcher-io\/knightwatcher\/(blob|tree)\/main\/([^#]+)(#.*)?$/.exec(href);
        if (!m) continue;
        const target = path.join(ROOT, decodeURIComponent(m[2]));
        assert.ok(fs.existsSync(target), `${where}: ${href} names no file of the repository`);
        assert.equal(fs.statSync(target).isDirectory(), m[1] === 'tree', `${where}: ${href}`);
        // a markdown file the site renders is linked on the site, not on GitHub
        if (m[1] === 'blob' && /\.md$/.test(m[2]) && m[2] !== 'README.md') {
          assert.ok(!/^(docs\/[^/]+|CONTRIBUTING|site\/README|legal\/(PRIVACY|ART-LICENCE|NAME-AND-LOGO))\.md$/.test(m[2]) || html.includes(`<p class="src-note">This page is <a href="${href}">`), `${where}: ${href} is on the site`);
        }
        repo++;
        continue;
      }
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [p, hash] = href.split('#');
      let file = f;
      if (p) {
        assert.ok(p.startsWith('/'), `${where}: ${href} is not from the site's root`);
        file = path.join(out, p.endsWith('/') ? p + 'index.html' : p);
        assert.ok(fs.existsSync(file), `${where}: ${href} goes nowhere`);
        internal++;
      }
      if (hash !== undefined && file.endsWith('.html')) {
        if (!(ids.get(file) && ids.get(file).has(decodeURIComponent(hash)))) broken.push(`${where}: ${href}`);
        anchors++;
      }
    }
  }
  assert.deepEqual(broken, [], 'links to a heading that is not there');
  assert.ok(internal > 500 && anchors > 300 && repo > 20, `${internal} links, ${anchors} anchors, ${repo} repository links`);
  // a link from one docs page to a heading of another, and one from README.md's own style of link
  assert.match(page(out, '/docs/packs/') + page(out, '/docs/page/') + page(out, '/docs/scenes/'), /href="\/docs\/world-loading\/#where-the-scenes-are-drawn-from"/);
  assert.match(page(out, '/docs/contributing/'), /href="\/docs\/development\/#checks"/);
});

test('a file in docs/ that the index does not link is under More, by its own title', () => {
  const root = scratchRoot(r => fs.writeFileSync(path.join(r, 'docs/zz-extra.md'), '# An extra page\n\nIt says [more](./design.md#the-terms).\n'));
  const r = build({ out: path.join(root, 'out'), version: VERSION, token: '', root });
  const more = r.docs[r.docs.length - 1];
  assert.equal(more.label, MORE);
  assert.deepEqual(more.docs.map(d => [d.from, d.title, d.url]), [['docs/zz-extra.md', 'An extra page', '/docs/zz-extra/']]);
  assert.match(page(r.out, '/docs/'), /<h2 id="[^"]+">More<\/h2>/);
  assert.match(page(r.out, '/docs/zz-extra/'), /<h1>An extra page<\/h1>/);
  assert.match(page(r.out, '/docs/zz-extra/'), /href="\/docs\/design\/#the-terms"/);
  // without one, there is no More
  assert.ok(!built().docs.some(g => g.label === MORE));
});

test('a Documentation section the build cannot read stops it, naming the line, before dist/ is touched', () => {
  const cases = [
    ['no section', t => t.replace('## Documentation', '## Docs'), /no "## Documentation" section/],
    ['a group with no name', t => t.replace('For people making packs:', 'For people painting:'), /README\.md:\d+: the docs' index has no name for the group "For people painting:"/],
    ['a line it cannot read', t => t.replace('- [Packs](docs/packs.md): ', '- [Packs] docs/packs.md, '), /README\.md:\d+: a line the docs' index cannot read/],
    ['a link to no file', t => t.replace('(docs/packs.md)', '(docs/no-such.md)'), /links docs\/no-such\.md, which is not a markdown file/],
    ['a doc twice', t => t.replace('(docs/packs.md)', '(docs/worlds.md)'), /links docs\/worlds\.md twice/],
    ['an empty group', t => t.replace(/For people making packs:\n\n(- .*\n)+/, 'For people making packs:\n\n'), /the group "For people making packs:" links no docs/],
    ['a doc before any group', t => t.replace('For people running it:\n', ''), /a doc before the first group's line/]
  ];
  for (const [name, change, error] of cases) {
    const root = scratchRoot(r => editReadme(r, change));
    const out = path.join(root, 'out');
    fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'keep'), 'x');
    assert.throws(() => build({ out, version: VERSION, token: '', root }), error, name);
    assert.ok(fs.existsSync(path.join(out, 'keep')), `${name}: the old build is left as it was`);
  }
});

test('Supported Feeds lists every provider file by kind, the _basic variants with their base, and a new file with no page edit', () => {
  const groups = readFeeds(ROOT);
  assert.deepEqual(groups.map(g => [g.kind, g.heading]), FEED_KINDS.map(k => [k.kind, k.heading]));
  assert.deepEqual(groups.map(g => [g.kind, g.services.map(s => s.name + (s.also ? ' / ' + s.also : ''))]), [
    ['streams', ['Jellyfin', 'Plex Media Server', 'Tautulli', 'Tracearr']],
    ['adblock', ['AdGuard Home', 'Pi-hole 6', 'Technitium DNS Server']],
    ['imports', ['Lidarr', 'Radarr', 'Sonarr']],
    ['usage', ['Beszel', 'Glances 4 / with or without a password', 'Prometheus (node_exporter) / with or without a login']]
  ]);
  // every built-in file is on the page, by its name or its base's
  const html = page(built().out, '/feeds/');
  const dir = path.join(ROOT, 'collector/providers/builtin');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.toml'))) {
    const name = /^name = "([^"]+)"$/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'))[1].split(', with')[0];
    assert.ok(html.includes(`<li>${name.replace(/&/g, '&amp;')}`), f);
  }
  assert.match(html, /<h3>Machines&#39;|<h3>Machines' CPU and memory<\/h3>/);
  assert.match(html, /<li>Glances 4 <span class="also">with or without a password<\/span><\/li>/);
  assert.doesNotMatch(html, /What it reads/);
  assert.match(html, /<h1>Supported Feeds<\/h1>/);
  assert.match(html, /published for x86-64 and 64-bit ARM, and tested on both/);
  assert.match(html, /Windows and macOS hosts are not supported\./);
  // a new provider file shows up; one of a kind the page has no heading for stops the build
  const root = scratchRoot(r => fs.writeFileSync(path.join(r, 'collector/providers/builtin/example.toml'), 'format = 1\nid = "example"\nkind = "streams"\nname = "Example Media"\n\n[auth]\nname = "not this"\n'));
  assert.ok(readFeeds(root)[0].services.some(s => s.name === 'Example Media'));
  const odd = scratchRoot(r => fs.writeFileSync(path.join(r, 'collector/providers/builtin/odd.toml'), 'kind = "weather"\nname = "Rain"\n'));
  assert.throws(() => readFeeds(odd), /odd\.toml is of the kind "weather", which Supported Feeds has no heading for/);
  const none = scratchRoot(r => fs.writeFileSync(path.join(r, 'collector/providers/builtin/none.toml'), 'kind = "streams"\n[x]\nname = "late"\n'));
  assert.throws(() => readFeeds(none), /none\.toml has no name or no kind/);
});

test('the docs pages hold no inline script, style or handler, so the site\'s policy needs nothing more', () => {
  const { out } = built();
  for (const f of walk(path.join(out, 'docs'))) {
    const html = fs.readFileSync(f, 'utf8');
    assert.deepEqual([...html.matchAll(/<script(?![^>]* src=)[^>]*>/g)].map(m => m[0]), [], f);
    assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=|<iframe|<img(?![^>]* src="\/)/i, f);
  }
});
