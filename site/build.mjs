/* Knightwatcher's website: the build. Plain Node 24 or newer, no dependencies.

     node build.mjs            (from site/, as Workers Builds runs it)
     node site/build.mjs       (from the repository's root)

   It writes site/dist/, which the Worker serves (wrangler.jsonc), and removes what was there:

   - the site's own pages from site/pages/, each with the nav and the footer of site/parts/: the
     home page, Features, Supported Feeds, Install, Licence and the 404 page, with the stylesheet,
     the script and the pictures from site/, and the logo, the favicon, the touch icon and the VT323
     font taken from web/ at build time;
   - Supported Feeds' services from the provider files in collector/providers/builtin/, so that a new
     provider file shows on the site with no page edit;
   - docs/, the documentation: its index from docs/README.md, and a page for every file that index
     links and every other file in docs/ but the index itself, rendered by markdown.mjs;
   - privacy/, art-licence/ and name-and-logo/, rendered from legal/, so they never drift from it;
   - demo/, a copy of web/ without admin/ or data/, stamped as tools/deploy.sh stamps a deployed
     copy but with the version of the commit built: the kw-version meta tag, ?v= on each local
     script and stylesheet, and version.json. A page that is not 'dev' draws only signed packs;
   - _headers, from headers.mjs;
   - the Cloudflare Web Analytics snippet on every page but demo/ and the 404 page, and only while
     site.json holds a token.

   The version is the first 12 characters of WORKERS_CI_COMMIT_SHA, which Workers Builds sets, or
   of `git rev-parse HEAD` without it; with neither the build fails rather than ship a 'dev' page.
   site/README.md describes the site. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml, inline, repoPath, textOf, REPO } from './markdown.mjs';
import { headersFile, BEACON_SCRIPT } from './headers.mjs';

export const SITE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(SITE);

/** The legal pages: where each is written, its source, and the words around the rendered text. */
export const LEGAL = [
  { dir: 'privacy', from: 'legal/PRIVACY.md', title: 'Privacy notice',
    description: 'Knightwatcher\'s privacy notice: the usage counts, the website\'s visitor counts and mail to the support address.',
    sub: 'Who keeps what, for how long, and how to have it deleted.' },
  { dir: 'art-licence', from: 'legal/ART-LICENCE.md', title: 'Art licence',
    description: 'Knightwatcher\'s art is under CC BY-SA 4.0: what it covers, how to credit it, and what is not under it.',
    sub: 'CC BY-SA 4.0. Use it, change it and share it, with credit.' },
  { dir: 'name-and-logo', from: 'legal/NAME-AND-LOGO.md', title: 'The name and the logo',
    description: 'Knightwatcher\'s name and logo are under neither of its licences: how they may be used, and what a fork does.',
    sub: 'Under neither licence, and kept for the project.' }
];

/** The nav's sections, in order: the address and the words. */
export const NAV = [['/', 'Home'], ['/features/', 'Features'], ['/feeds/', 'Supported Feeds'], ['/install/', 'Install'], ['/docs/', 'Docs'], ['/licence/', 'Licence']];

/** The site's own pages from site/pages/: where each is written, and the nav's section it is in. */
const OWN = [
  { page: 'index.html', out: 'index.html', nav: '/' },
  { page: 'features.html', out: 'features/index.html', nav: '/features/' },
  { page: 'feeds.html', out: 'feeds/index.html', nav: '/feeds/' },
  { page: 'install.html', out: 'install/index.html', nav: '/install/' },
  { page: 'licence.html', out: 'licence/index.html', nav: '/licence/' }
];

/** The groups of the docs' index, docs/README.md, by the line that opens each, and the name each
 *  has on the site. */
export const DOC_GROUPS = { 'For people running it:': 'Running it', 'For people making packs:': 'Making packs', 'For contributors:': 'Contributing' };
/** The docs' index, which is no doc page of its own. */
export const DOCS_INDEX = 'docs/README.md';
/** The group a file in docs/ that the index does not link goes in. */
export const MORE = 'More';
/** A doc's address on the site is /docs/<its file's name>/, but for these, whose file's name says
 *  nothing on its own. */
const DOC_NAMES = { 'site/README.md': 'website' };

/** The kinds of provider Supported Feeds lists, in order, each with its heading, and any words
 *  that follow its services. A provider file of a kind not here stops the build. */
export const FEED_KINDS = [
  { kind: 'streams', heading: 'Streams playing' },
  { kind: 'adblock', heading: 'Adverts blocked' },
  { kind: 'imports', heading: 'Downloads imported', extra: ['more than one of each'] },
  { kind: 'usage', heading: 'Machines\' CPU and memory' }
];

/** The files of web/ the site's own pages use, and where they go in dist/. */
const FROM_WEB = [['logo.svg', 'logo.svg'], ['favicon.svg', 'favicon.svg'], ['favicon.ico', 'favicon.ico'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'], ['fonts/VT323-Regular.ttf', 'fonts/VT323-Regular.ttf'], ['fonts/OFL.txt', 'fonts/OFL.txt']];

/** web/'s folders the demo leaves out: the admin page, which needs the bundled server, and the
 *  collector's output. */
const DEMO_LEAVES_OUT = new Set(['admin', 'data']);

const VERSION = /^[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9]{16,64}$/;

/** The version to stamp: 12 hex characters of the commit being built. */
export function resolveVersion(env = process.env, cwd = ROOT) {
  let sha = env.WORKERS_CI_COMMIT_SHA || '';
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { sha = ''; }
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('build: no commit to stamp the demo with: set WORKERS_CI_COMMIT_SHA, or build from a git checkout');
  return sha.slice(0, 12);
}

/** The Web Analytics token in site.json, or '' while there is none. */
export function readToken(file = path.join(SITE, 'site.json')) {
  const token = JSON.parse(fs.readFileSync(file, 'utf8')).analyticsToken || '';
  if (token && !TOKEN.test(token)) throw new Error('build: site.json\'s analyticsToken is not a Web Analytics token (letters and digits)');
  return token;
}

/** Cloudflare Web Analytics' one tag, or nothing without a token. */
export function analyticsSnippet(token) {
  if (!token) return '';
  return `<script defer src="${BEACON_SCRIPT}" data-cf-beacon='{"token": "${token}"}'></script>`;
}

/* tools/deploy.sh's and server/stamp.py's rules for stamping index.html, line by line as sed
   applies them: the meta tag's first 'dev' on a line, then ?v= on every local script address, and
   on every local stylesheet address of a line that holds a stylesheet link. A local address is
   relative or from the site's root, with no scheme or host and no query or fragment. */
const LOCAL = '/?[^/"#?:][^"#?:]*';
const META = /(<meta name="kw-version" content=")dev(")/;
const SCRIPT = new RegExp('(<script[^>]* src=")(' + LOCAL + ')(")', 'g');
const IS_STYLESHEET = /<link[^>]* rel="stylesheet"/;
const LINK = new RegExp('(<link[^>]* href=")(' + LOCAL + ')(")', 'g');
const UNSTAMPED = new RegExp('<script[^>]* src="' + LOCAL + '"|<link[^>]* rel="stylesheet"[^>]* href="' + LOCAL + '"');

/** index.html with its version stamped. Throws when the meta tag is missing or an address is left
 *  unstamped, as the other two do. */
export function stampIndex(text, version) {
  if (!VERSION.test(version)) throw new Error(`build: ${version} is not a version`);
  const stamped = text.split('\n').map(line => {
    line = line.replace(META, (m, a, b) => a + version + b);
    line = line.replace(SCRIPT, (m, a, src, b) => a + src + '?v=' + version + b);
    if (IS_STYLESHEET.test(line)) line = line.replace(LINK, (m, a, href, b) => a + href + '?v=' + version + b);
    return line;
  }).join('\n');
  if (!stamped.includes(`<meta name="kw-version" content="${version}">`)) throw new Error('build: web/index.html has no <meta name="kw-version" content="dev"> to stamp');
  const left = UNSTAMPED.exec(stamped);
  if (left) throw new Error(`build: a local address was left unstamped: ${left[0]}`);
  return stamped;
}

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function copy(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDirAt = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

/** A page of site/pages/ with its parts and fields filled in. Throws on a field left empty. */
function fill(template, fields) {
  let out = template;
  for (const [k, v] of Object.entries(fields)) out = out.split(`<!-- @${k} -->`).join(v);
  const left = /<!-- @[\w-]+ -->/.exec(out);
  if (left) throw new Error(`build: ${left[0]} was left in a page`);
  return out;
}

/** The nav's links, the section `current` marked: the page itself as the page, a page within the
 *  section as the section. */
export function navLinks(current, here = current) {
  return NAV.map(([href, words]) => {
    const mark = href === here ? ' aria-current="page"' : href === current ? ' aria-current="true"' : '';
    return `<a href="${href}"${mark}>${escapeHtml(words)}</a>`;
  }).join('\n      ');
}

/* ---- The docs ---------------------------------------------------------------------------------- */

/**
 * The docs' index, from docs/README.md: its title, any lines of prose before the first group, then
 * the groups in order, each with the docs it links, and a group More for any other file in docs/
 * but the index. Each doc is { from, title, description (HTML), name, url }. Throws, naming the
 * line, on anything after the first group that is not a group's line, a blank or a
 * "- [Title](path): description" line, on a group with no docs, on a link to a file that is not
 * there, and when the index or its title is missing. Its links are relative to docs/.
 */
export function readDocsIndex(root = ROOT) {
  if (!isFile(path.join(root, DOCS_INDEX))) throw new Error(`build: ${DOCS_INDEX}, the docs' index, is not there`);
  const index = read(root, DOCS_INDEX).replace(/\r\n?/g, '\n').split('\n');
  if (!/^# \S/.test(index[0])) throw new Error(`build: ${DOCS_INDEX}:1: the docs' index starts with its title, a level one heading`);
  const groups = [], seen = new Set();
  let group = null;
  for (let i = 1; i < index.length; i++) {
    const line = index[i], where = `build: ${DOCS_INDEX}:${i + 1}`;
    if (/^\s*$/.test(line)) continue;
    // the intro: prose between the title and the first group
    if (!group && !/^For .+:$/.test(line) && !/^(- |#)/.test(line)) continue;
    if (/^For .+:$/.test(line)) {
      if (!DOC_GROUPS[line]) throw new Error(`${where}: the docs' index has no name for the group "${line}": add it to DOC_GROUPS in site/build.mjs`);
      if (group && !group.docs.length) throw new Error(`${where}: the group "${group.line}" links no docs`);
      groups.push(group = { line, label: DOC_GROUPS[line], docs: [] });
      continue;
    }
    const m = /^- \[([^\]]+)\]\(([^()\s#]+)\): (\S.*)$/.exec(line);
    if (!m) throw new Error(`${where}: a line the docs' index cannot read, not a group's line or "- [Title](path): description": ${line.slice(0, 60)}`);
    if (!group) throw new Error(`${where}: a doc before the first group's line`);
    const from = repoPath(m[2], DOCS_INDEX);
    if (!from.endsWith('.md') || !isFile(path.join(root, from))) throw new Error(`${where}: the docs' index links ${m[2]}, which is not a markdown file in the repository`);
    if (from === DOCS_INDEX) throw new Error(`${where}: the docs' index links itself`);
    if (seen.has(from)) throw new Error(`${where}: the docs' index links ${from} twice`);
    seen.add(from);
    group.docs.push({ from, title: m[1], descriptionMd: m[3], line: i });
  }
  if (!groups.length) throw new Error(`build: ${DOCS_INDEX} has no groups for the docs' index`);
  if (!group.docs.length) throw new Error(`build: ${DOCS_INDEX}: the group "${group.line}" links no docs`);
  // every other file in docs/ but the index, under More, by its own title
  const more = fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).sort().map(f => 'docs/' + f).filter(f => f !== DOCS_INDEX && !seen.has(f));
  if (more.length) groups.push({ line: null, label: MORE, docs: more.map(from => ({ from, title: null, descriptionMd: '' })) });
  // each doc's address, from its file's name
  const names = new Map();
  for (const g of groups) for (const d of g.docs) {
    d.name = DOC_NAMES[d.from] || path.posix.basename(d.from, '.md').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(d.name)) throw new Error(`build: ${d.from} has no name the site can give an address`);
    if (names.has(d.name)) throw new Error(`build: ${d.from} and ${names.get(d.name)} would both be /docs/${d.name}/`);
    names.set(d.name, d.from);
    d.url = `/docs/${d.name}/`;
  }
  return groups;
}

/** The site's page for each file of the repository it renders, the docs' index as /docs/, so that
 *  a link between them stays on the site. */
export function sitePages(groups) {
  const pages = {};
  for (const L of LEGAL) pages[L.from] = `/${L.dir}/`;
  pages[DOCS_INDEX] = '/docs/';
  for (const g of groups) for (const d of g.docs) pages[d.from] = d.url;
  return pages;
}

/** A doc's contents: each level two heading, with its level three headings under it. */
function tocHtml(toc, pad) {
  return toc.map(t => `${pad}<li><a href="#${t.id}">${t.html}</a>` +
    (t.sub.length ? `\n${pad}  <ol>\n` + t.sub.map(s => `${pad}    <li><a href="#${s.id}">${s.html}</a></li>`).join('\n') + `\n${pad}  </ol>\n${pad}` : '') + '</li>').join('\n');
}

/** Every doc by group, the one at `url` marked, for a doc page's side and its menu on a phone. */
function docNavHtml(groups, url) {
  return groups.map(g => `<p class="dn-h">${escapeHtml(g.label)}</p>\n<ul>\n` +
    g.docs.map(d => `  <li><a href="${d.url}"${d.url === url ? ' aria-current="page"' : ''}>${escapeHtml(d.title)}</a></li>`).join('\n') + '\n</ul>').join('\n');
}

/* ---- Supported Feeds --------------------------------------------------------------------------- */

/** One top-level string of a provider file, before its first table: `key = "value"`. */
function tomlString(text, key) {
  for (const line of text.split('\n')) {
    if (/^\s*\[/.test(line)) break;
    const m = new RegExp('^\\s*' + key + '\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*(#.*)?$').exec(line);
    if (m) return m[1].replace(/\\(["\\])/g, '$1');
  }
  return null;
}

/**
 * The services of collector/providers/builtin/, grouped by kind in the order of FEED_KINDS, each
 * group's by name. A file named <base>_<variant>.toml of the same kind as <base>.toml, whose name is
 * the base's and then ", with ..." (Glances 4, with a password), is one service with the base: it
 * reads "Glances 4", with "with or without a password" after it. Throws on a file with no name or
 * kind, or of a kind the page has no heading for.
 */
export function readFeeds(root = ROOT) {
  const dir = path.join(root, 'collector', 'providers', 'builtin');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.toml')).sort();
  const all = new Map();
  for (const f of files) {
    const text = read(dir, f), name = tomlString(text, 'name'), kind = tomlString(text, 'kind'), where = `collector/providers/builtin/${f}`;
    if (!name || !kind) throw new Error(`build: ${where} has no name or no kind for Supported Feeds`);
    if (!FEED_KINDS.some(k => k.kind === kind)) throw new Error(`build: ${where} is of the kind "${kind}", which Supported Feeds has no heading for: add it to FEED_KINDS in site/build.mjs`);
    all.set(f.slice(0, -5), { stem: f.slice(0, -5), name, kind, also: null, merged: false });
  }
  for (const p of all.values()) {
    const m = /^(.+)_[a-z0-9]+$/.exec(p.stem), base = m && all.get(m[1]);
    const tail = base && base.kind === p.kind && p.name.startsWith(base.name + ', ') ? p.name.slice(base.name.length + 2) : null;
    const w = tail && /^with (.+)$/.exec(tail);
    if (w && !base.also) { base.also = `with or without ${w[1]}`; p.merged = true; }
  }
  return FEED_KINDS.map(k => ({ ...k, services: [...all.values()].filter(p => p.kind === k.kind && !p.merged).sort((a, b) => a.name.localeCompare(b.name, 'en')) }));
}

/** Supported Feeds' cards of services, one for each kind. */
function feedsHtml(groups) {
  return groups.map(g => `    <li class="src"><h3>${escapeHtml(g.heading)}</h3><ul class="chips">` +
    g.services.map(s => `<li>${escapeHtml(s.name)}${s.also ? ` <span class="also">${escapeHtml(s.also)}</span>` : ''}</li>`).join('') +
    (g.extra || []).map(x => `<li class="x">${escapeHtml(x)}</li>`).join('') + '</ul></li>').join('\n');
}

/* ---- The build ----------------------------------------------------------------------------------- */

/**
 * Builds the site into `out`. `version` is the demo's stamp and `token` the Web Analytics token
 * ('' leaves the snippet out). Returns what it wrote, for the tests.
 */
export function build({ out = path.join(SITE, 'dist'), version = resolveVersion(), token = readToken(), root = ROOT } = {}) {
  if (!VERSION.test(version)) throw new Error(`build: ${version} is not a version`);
  if (token && !TOKEN.test(token)) throw new Error('build: the analytics token is not letters and digits');
  const site = path.join(root, 'site'), web = path.join(root, 'web');
  const outReal = path.resolve(out);
  if (outReal === path.resolve(root) || outReal === path.resolve(web) || outReal === path.resolve(site) || path.resolve(web).startsWith(outReal + path.sep)) {
    throw new Error(`build: refusing to write over ${outReal}`);
  }
  // read and render everything before the old build is removed, so that a failure leaves it as it was
  const docGroups = readDocsIndex(root), pages = sitePages(docGroups), feeds = readFeeds(root);
  const isDir = p => isDirAt(path.join(root, p));
  const render = from => renderMarkdown(read(root, from), { from, pages, isDir });
  const rendered = new Map();
  for (const g of docGroups) for (const d of g.docs) {
    const r = render(d.from);
    rendered.set(d.from, r);
    if (d.title === null) d.title = textOf(r.title);
    d.description = d.descriptionMd ? inline(d.descriptionMd, { where: `${DOCS_INDEX}:${d.line + 1}`, from: DOCS_INDEX, pages, isDir }) : '';
  }
  const legal = LEGAL.map(L => ({ L, r: render(L.from) }));

  fs.rmSync(outReal, { recursive: true, force: true });
  fs.mkdirSync(outReal, { recursive: true });

  // the site's own files, and the few it takes from web/
  for (const dir of ['css', 'js', 'img']) fs.cpSync(path.join(site, dir), path.join(outReal, dir), { recursive: true });
  for (const [from, to] of FROM_WEB) copy(path.join(web, from), path.join(outReal, to));

  const parts = { nav: read(site, 'parts', 'nav.html').replace(/\n$/, ''), footer: read(site, 'parts', 'footer.html').replace(/\n$/, '') };
  const gh = read(site, 'parts', 'gh.svg').trim();
  // the parts go in first, so that the nav's links and the GitHub mark in it are filled in after them
  const page = (name, nav, here, fields) => fill(read(site, 'pages', name), { ...parts, gh, 'nav-links': navLinks(nav, here), ...fields });
  const snippet = analyticsSnippet(token);

  for (const p of OWN) write(path.join(outReal, p.out), page(p.page, p.nav, p.nav, { analytics: snippet, feeds: p.page === 'feeds.html' ? feedsHtml(feeds) : '' }));
  write(path.join(outReal, '404.html'), page('404.html', '', '', {}));

  for (const { L, r } of legal) {
    write(path.join(outReal, L.dir, 'index.html'), page('legal.html', '/licence/', '', {
      title: escapeHtml(L.title), heading: r.title, description: escapeHtml(L.description), sub: escapeHtml(L.sub),
      toc: tocHtml(r.toc.map(t => ({ ...t, sub: [] })), '      '),
      doc: r.html, source: escapeHtml(L.from), 'source-url': `${REPO}/blob/main/${L.from}`,
      analytics: snippet }));
  }

  // the docs: the index, then a page for each
  write(path.join(outReal, 'docs', 'index.html'), page('docs.html', '/docs/', '/docs/', {
    groups: docGroups.map(g => `<section class="sec" aria-labelledby="dg-${g.label.toLowerCase().replace(/\W+/g, '-')}">\n` +
      `  <div class="head"><h2 id="dg-${g.label.toLowerCase().replace(/\W+/g, '-')}">${escapeHtml(g.label)}</h2></div>\n  <ul class="docards">\n` +
      g.docs.map(d => `    <li><a href="${d.url}">${escapeHtml(d.title)}</a>${d.description ? `<p>${d.description}</p>` : ''}</li>`).join('\n') + '\n  </ul>\n</section>').join('\n\n'),
    analytics: snippet }));
  for (const g of docGroups) for (const d of g.docs) {
    const r = rendered.get(d.from), sub = d.description ? d.description.replace(/^([a-z])/, c => c.toUpperCase()) : escapeHtml(g.label);
    write(path.join(outReal, 'docs', d.name, 'index.html'), page('doc.html', '/docs/', '', {
      title: escapeHtml(textOf(r.title)), heading: r.title, sub, description: escapeHtml(textOf(sub)),
      docnav: docNavHtml(docGroups, d.url), toc: tocHtml(r.toc, '      '), 'toc-fold': tocHtml(r.toc, '        '),
      doc: r.html, source: escapeHtml(d.from), 'source-url': `${REPO}/blob/main/${d.from}`, analytics: snippet }));
  }

  // the demo: web/ without admin/ and data/, stamped with the commit
  const demo = path.join(outReal, 'demo');
  fs.cpSync(web, demo, { recursive: true, filter: src => !DEMO_LEAVES_OUT.has(path.relative(web, src).split(path.sep)[0]) || path.relative(web, src) === '' });
  write(path.join(demo, 'index.html'), stampIndex(read(web, 'index.html'), version));
  write(path.join(demo, 'version.json'), `{"version": "${version}"}\n`);

  write(path.join(outReal, '_headers'), headersFile(token));
  return { out: outReal, version, token, docs: docGroups, feeds };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = build();
    console.log(`site: built ${path.relative(process.cwd(), r.out) || '.'} with the demo at ${r.version}, ${r.docs.reduce((n, g) => n + g.docs.length, 0)} docs, ${r.token ? 'with' : 'without'} Web Analytics`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
