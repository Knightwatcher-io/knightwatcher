/* Knightwatcher's website: the build. Plain Node 24 or newer, no dependencies.

     node build.mjs            (from site/, as Workers Builds runs it)
     node site/build.mjs       (from the repository's root)

   It writes site/dist/, which the Worker serves (wrangler.jsonc), and removes what was there:

   - the landing page, the 404 page, the stylesheet, the script and the pictures from site/, with
     the logo, the favicon, the touch icon and the VT323 font taken from web/ at build time;
   - privacy/ and art-licence/, rendered from legal/PRIVACY.md and legal/ART-LICENCE.md
     (markdown.mjs), so they never drift from legal/;
   - demo/, a copy of web/ without admin/ or data/, stamped as tools/deploy.sh stamps a deployed
     copy but with the version of the commit built: the kw-version meta tag, ?v= on each local
     script and stylesheet, and version.json. A page that is not 'dev' draws only signed packs;
   - _headers, from headers.mjs;
   - the Cloudflare Web Analytics snippet on the landing page and the legal pages, never in demo/
     or the 404 page, and only while site.json holds a token.

   The version is the first 12 characters of WORKERS_CI_COMMIT_SHA, which Workers Builds sets, or
   of `git rev-parse HEAD` without it; with neither the build fails rather than ship a 'dev' page.
   site/README.md describes the site. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml } from './markdown.mjs';
import { headersFile, BEACON_SCRIPT } from './headers.mjs';

export const SITE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(SITE);

/** The site's pages for files of the repository, so that a link between them stays on the site. */
export const PAGES = { 'legal/PRIVACY.md': '/privacy/', 'legal/ART-LICENCE.md': '/art-licence/' };

/** The legal pages: where each is written, its source, and the words around the rendered text. */
export const LEGAL = [
  { dir: 'privacy', from: 'legal/PRIVACY.md', title: 'Privacy notice',
    description: 'Knightwatcher\'s privacy notice: the usage counts, the website\'s visitor counts and mail to the support address.',
    sub: 'Who keeps what, for how long, and how to have it deleted.' },
  { dir: 'art-licence', from: 'legal/ART-LICENCE.md', title: 'Art licence',
    description: 'Knightwatcher\'s art is under CC BY-SA 4.0: what it covers, how to credit it, and what is not under it.',
    sub: 'CC BY-SA 4.0. Use it, change it and share it, with credit.' }
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

/** A page of site/pages/ with its parts and fields filled in. Throws on a field left empty. */
function fill(template, fields) {
  let out = template;
  for (const [k, v] of Object.entries(fields)) out = out.split(`<!-- @${k} -->`).join(v);
  const left = /<!-- @[\w-]+ -->/.exec(out);
  if (left) throw new Error(`build: ${left[0]} was left in a page`);
  return out;
}

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
  fs.rmSync(outReal, { recursive: true, force: true });
  fs.mkdirSync(outReal, { recursive: true });

  // the site's own files, and the few it takes from web/
  for (const dir of ['css', 'js', 'img']) fs.cpSync(path.join(site, dir), path.join(outReal, dir), { recursive: true });
  for (const [from, to] of FROM_WEB) copy(path.join(web, from), path.join(outReal, to));

  const parts = { nav: read(site, 'parts', 'nav.html').replace(/\n$/, ''), footer: read(site, 'parts', 'footer.html').replace(/\n$/, '') };
  const gh = read(site, 'parts', 'gh.svg').trim();
  // the parts go in first, so that the GitHub mark in the nav is filled in after them
  const page = (name, fields) => fill(read(site, 'pages', name), { ...parts, gh, ...fields });
  const snippet = analyticsSnippet(token);

  write(path.join(outReal, 'index.html'), page('index.html', { analytics: snippet }));
  write(path.join(outReal, '404.html'), page('404.html', {}));
  for (const L of LEGAL) {
    const r = renderMarkdown(read(root, L.from), { from: L.from, pages: PAGES });
    write(path.join(outReal, L.dir, 'index.html'), page('legal.html', {
      title: escapeHtml(L.title), heading: r.title, description: escapeHtml(L.description), sub: escapeHtml(L.sub),
      toc: r.toc.map(t => `      <li><a href="#${t.id}">${t.html}</a></li>`).join('\n'),
      doc: r.html, source: escapeHtml(L.from), 'source-url': `https://github.com/knightwatcher-io/knightwatcher/blob/main/${L.from}`,
      analytics: snippet }));
  }

  // the demo: web/ without admin/ and data/, stamped with the commit
  const demo = path.join(outReal, 'demo');
  fs.cpSync(web, demo, { recursive: true, filter: src => !DEMO_LEAVES_OUT.has(path.relative(web, src).split(path.sep)[0]) || path.relative(web, src) === '' });
  write(path.join(demo, 'index.html'), stampIndex(read(web, 'index.html'), version));
  write(path.join(demo, 'version.json'), `{"version": "${version}"}\n`);

  write(path.join(outReal, '_headers'), headersFile(token));
  return { out: outReal, version, token };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = build();
    console.log(`site: built ${path.relative(process.cwd(), r.out) || '.'} with the demo at ${r.version}, ${r.token ? 'with' : 'without'} Web Analytics`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
