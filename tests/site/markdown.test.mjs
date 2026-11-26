// Tests for the website's markdown renderer, site/markdown.mjs: the subset the legal pages and the
// docs use, every piece of text escaped, the links, GitHub's heading ids, and everything outside
// the subset refused. Run with: node --test 'tests/site/**/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, resolveLink, escapeHtml, inline, slug, slugger, REPO } from '../../site/markdown.mjs';

const PAGES = { 'legal/PRIVACY.md': '/privacy/', 'legal/ART-LICENCE.md': '/art-licence/', 'docs/worlds.md': '/docs/worlds/' };
const md = (text, from = 'legal/TEST.md') => renderMarkdown(text, { from, pages: PAGES });
const ctx = { where: 'test', from: 'legal/TEST.md', pages: PAGES };

test('escapes every character that could open markup, in text, code, links, tables and headings', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&amp;`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;amp;');
  assert.equal(inline('`<script>alert(1)</script>` and "quotes" & \'more\'', ctx),
    '<code>&lt;script&gt;alert(1)&lt;/script&gt;</code> and &quot;quotes&quot; &amp; &#39;more&#39;');
  assert.equal(inline('**a < b**', ctx), '<strong>a &lt; b</strong>');
  assert.equal(inline('[a "b" & c](https://example.com/?q="x")', ctx), '<a href="https://example.com/?q=&quot;x&quot;">a &quot;b&quot; &amp; c</a>');
  assert.equal(inline('1 < 2 and 3 > 2', ctx), '1 &lt; 2 and 3 &gt; 2');
  // a placeholder in angle brackets is text, not a tag
  assert.equal(inline('KW_<SECRET>_<FIELD>', ctx), 'KW_&lt;SECRET&gt;_&lt;FIELD&gt;');
  const r = md('# Title &lt; x\n\n## A & B\n\ntext\n\n```dotenv\n<KEY>="&"\n```\n\n| <x> | "b" |\n|---|---|\n| `<i>` | & |\n');
  assert.equal(r.title, 'Title &amp;lt; x');
  assert.match(r.html, /<h2 id="a--b">A &amp; B<\/h2>/);
  assert.match(r.html, /<pre data-lang="dotenv"><code>&lt;KEY&gt;=&quot;&amp;&quot;<\/code><\/pre>/);
  assert.match(r.html, /<th>&lt;x&gt;<\/th><th>&quot;b&quot;<\/th>/);
  assert.match(r.html, /<td><code>&lt;i&gt;<\/code><\/td><td>&amp;<\/td>/);
  assert.doesNotMatch(r.html, /<KEY>|<x>|<i>/);
  assert.equal(inline('a \\*b\\* \\[c\\] \\<d\\>', ctx), 'a *b* [c] &lt;d&gt;');
});

test('links: https and mailto kept, rendered files to the site, other files to GitHub, folders to their tree', () => {
  const R = (h, from = 'legal/PRIVACY.md', isDir) => resolveLink(h, from, PAGES, isDir);
  assert.equal(R('https://ico.org.uk/make-a-complaint/'), 'https://ico.org.uk/make-a-complaint/');
  assert.equal(R('mailto:support@knightwatcher.io'), 'mailto:support@knightwatcher.io');
  assert.equal(R('#website'), '#website');
  assert.equal(R('../docs/telemetry.md'), REPO + '/blob/main/docs/telemetry.md');
  assert.equal(R('../docs/telemetry.md#what-is-sent'), REPO + '/blob/main/docs/telemetry.md#what-is-sent');
  assert.equal(R('../LICENSE', 'legal/ART-LICENCE.md'), REPO + '/blob/main/LICENSE');
  assert.equal(R('../telemetry/'), REPO + '/tree/main/telemetry');
  // a folder written without its slash, which the build knows is a folder
  assert.equal(R('../collector/providers/builtin', 'docs/x.md', p => p === 'collector/providers/builtin'), REPO + '/tree/main/collector/providers/builtin');
  assert.equal(R('ART-LICENCE.md'), '/art-licence/');
  assert.equal(R('./PRIVACY.md#the-website', 'legal/ART-LICENCE.md'), '/privacy/#the-website');
  assert.equal(R('./worlds.md#the-words', 'docs/packs.md'), '/docs/worlds/#the-words');
  assert.equal(R('CONTRIBUTOR-TERMS.md'), REPO + '/blob/main/legal/CONTRIBUTOR-TERMS.md');
  for (const bad of ['javascript:alert(1)', 'http://example.com/', 'data:text/html,x', '//example.com/x', '../../outside.md', 'ftp://x/y', '#']) {
    assert.throws(() => R(bad), /does not take|climbs out/, bad);
  }
  // a [ that opens no link is the character itself
  assert.equal(inline('a [[sources.json]] table under [sources]', ctx), 'a [[sources.json]] table under [sources]');
  assert.equal(inline('[`[[sources.usage]]`](../docs/worlds.md#x)', ctx), '<a href="/docs/worlds/#x"><code>[[sources.usage]]</code></a>');
});

test('heading ids are GitHub\'s: lower case, punctuation out, spaces to hyphens, repeats numbered', () => {
  assert.equal(slug('The website'), 'the-website');
  assert.equal(slug('Why: the lawful basis'), 'why-the-lawful-basis');
  assert.equal(slug('fail2ban\'s database'), 'fail2bans-database');
  assert.equal(slug('Where the scenes are drawn from'), 'where-the-scenes-are-drawn-from');
  assert.equal(slug('[[sources.imports]]'), 'sourcesimports');
  assert.equal(slug('KW.world, and the_world'), 'kwworld-and-the_world');
  assert.equal(slug('A & B'), 'a--b');
  const id = slugger();
  assert.deepEqual(['What is sent', 'What is sent', 'What is sent-1', 'What is sent'].map(id), ['what-is-sent', 'what-is-sent-1', 'what-is-sent-1-1', 'what-is-sent-2']);
  const r = md('# T\n\n## `KW.world`\n\n### What is sent\n\n## Your rights\n\n### What is sent\n');
  assert.match(r.html, /<h2 id="kwworld"><code>KW\.world<\/code><\/h2>/);
  assert.match(r.html, /<h3 id="what-is-sent">/);
  assert.match(r.html, /<h3 id="what-is-sent-1">/);
  assert.deepEqual(r.toc.map(t => [t.id, t.sub.map(s => s.id)]), [['kwworld', ['what-is-sent']], ['your-rights', ['what-is-sent-1']]]);
});

test('paragraphs join their lines; lists nest, number, and hold paragraphs, code and lazy lines', () => {
  const r = md(`# Notice

First line
second line with **bold** and \`code\`.

- one item
  that wraps;
- [a link](../docs/x.md).
  - nested, with \`code
    over two lines\`
    - deeper
- lazy
continuation

3. third
4. fourth, with a block:

   \`\`\`bash
   echo "x"
   \`\`\`

   and a paragraph after it.
`);
  const html = r.html.split('\n');
  assert.equal(html[0], '<p>First line second line with <strong>bold</strong> and <code>code</code>.</p>');
  assert.match(r.html, /<ul>\n<li>one item that wraps;<\/li>\n<li><a href="https:\/\/github\.com\/knightwatcher-io\/knightwatcher\/blob\/main\/docs\/x\.md">a link<\/a>\.\n<ul>\n<li>nested, with <code>code over two lines<\/code>\n<ul>\n<li>deeper<\/li>\n<\/ul><\/li>\n<\/ul><\/li>\n<li>lazy continuation<\/li>\n<\/ul>/);
  // a list with a blank line inside an item is loose: its paragraphs are paragraphs
  assert.match(r.html, /<ol start="3">\n<li><p>third<\/p><\/li>\n<li><p>fourth, with a block:<\/p>\n<pre data-lang="bash"><code>echo &quot;x&quot;<\/code><\/pre>\n<p>and a paragraph after it\.<\/p><\/li>\n<\/ol>/);
});

test('tables: the header, the alignment as classes, cells inline, a code span kept whole', () => {
  const r = md('# T\n\n| Key | Values | Default |\n|:---|:---:|---:|\n| `a` | **b** | [c](../docs/worlds.md) |\n| `jail|ip` | short |\n\nAfter.\n');
  assert.match(r.html, /<div class="table"><table>\n<thead><tr><th>Key<\/th><th class="al-c">Values<\/th><th class="al-r">Default<\/th><\/tr><\/thead>/);
  assert.match(r.html, /<tr><td><code>a<\/code><\/td><td class="al-c"><strong>b<\/strong><\/td><td class="al-r"><a href="\/docs\/worlds\/">c<\/a><\/td><\/tr>/);
  // an escaped pipe splits no cell and loses its backslash, in a code span too, as on GitHub
  const e = md('# T\n\n| Key | What |\n|---|---|\n| `jail\\|ip\\|time` | a \\| b |\n');
  assert.match(e.html, /<tr><td><code>jail\|ip\|time<\/code><\/td><td>a \| b<\/td><\/tr>/);
  assert.doesNotMatch(e.html, /\\/);
  // a short row is filled out; a bare | inside code does not split the cell either (GitHub's does)
  assert.match(r.html, /<tr><td><code>jail\|ip<\/code><\/td><td class="al-c">short<\/td><td class="al-r"><\/td><\/tr>/);
  assert.match(r.html, /<\/table><\/div>\n<p>After\.<\/p>/);
  // no inline style anywhere, which the site's policy would refuse
  assert.doesNotMatch(r.html, /style=/);
});

test('a comment on lines of its own is left out; italics, quotes, HTML and the rest stop the render, naming the line', () => {
  const c = md('# T\n\n<!-- settings-reference:start -->\n\ntext\n\n<!-- two\nlines -->\n');
  assert.equal(c.html, '<p>text</p>');
  // a * or _ that is not italics is the character itself
  assert.equal(inline('shell patterns, such as "*-run-*", and glances_basic, 2 * 3', ctx), 'shell patterns, such as &quot;*-run-*&quot;, and glances_basic, 2 * 3');
  const bad = {
    quote: '> quoted', star: '* item', plus: '+ item', html: '<div>x</div>', rule: '---',
    italics: 'some *word*', underscore: 'some _word_', unclosed: 'a `code', unclosedBold: 'a **bold',
    indented: '    code', inlineHtml: 'text <b>x</b>', autolink: 'see <https://example.com>', comment: 'a <!-- b --> c'
  };
  for (const [name, line] of Object.entries(bad)) {
    assert.throws(() => md('# T\n\n' + line + '\n'), /legal\/TEST\.md:3:/, name);
  }
  assert.throws(() => md('# T\n\nPara\n---\n'), /legal\/TEST\.md:4: an underlined heading/);
  assert.throws(() => md('text\n\n# Late title\n'), /must come first/);
  assert.throws(() => md('# One\n\n# Two\n'), /must come first/);
  assert.throws(() => md('## No title\n'), /no level one heading/);
  assert.throws(() => md('# T\n\n```\nnever closed\n'), /never closed/);
  assert.throws(() => md('# T\n\n<!-- never closed\n'), /never closed/);
  assert.throws(() => md('# T\n\n| a | b |\n|---|\n'), /columns/);
  assert.throws(() => renderMarkdown('# T\n', {}), /path/);
});

test('every legal file and every doc renders whole, with its links resolved', async () => {
  const fs = await import('node:fs');
  const root = new URL('../../', import.meta.url);
  const files = ['legal/PRIVACY.md', 'legal/ART-LICENCE.md', 'legal/NAME-AND-LOGO.md', '.github/CONTRIBUTING.md', 'site/README.md',
    ...fs.readdirSync(new URL('docs/', root)).filter(f => f.endsWith('.md')).map(f => 'docs/' + f)];
  for (const from of files) {
    const r = md(fs.readFileSync(new URL(from, root), 'utf8'), from);
    assert.ok(r.title, from);
    for (const [, href] of r.html.matchAll(/href="([^"]*)"/g)) assert.match(href, /^(https:\/\/|\/(privacy|art-licence|docs\/worlds)\/|#|mailto:)/, `${from}: ${href}`);
  }
});
