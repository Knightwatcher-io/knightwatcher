// Tests for the website's markdown renderer, site/markdown.mjs: the subset the legal pages use,
// every piece of text escaped, the links, and everything outside the subset refused.
// Run with: node --test tests/site/
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, resolveLink, escapeHtml, inline, slug, REPO } from '../../site/markdown.mjs';

const PAGES = { 'legal/PRIVACY.md': '/privacy/', 'legal/ART-LICENCE.md': '/art-licence/' };
const md = (text, from = 'legal/TEST.md') => renderMarkdown(text, { from, pages: PAGES });
const ctx = { where: 'test', from: 'legal/TEST.md', pages: PAGES };

test('escapes every character that could open markup, in text, code, links and headings', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&amp;`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;amp;');
  assert.equal(inline('`<script>alert(1)</script>` and "quotes" & \'more\'', ctx),
    '<code>&lt;script&gt;alert(1)&lt;/script&gt;</code> and &quot;quotes&quot; &amp; &#39;more&#39;');
  assert.equal(inline('**a < b**', ctx), '<strong>a &lt; b</strong>');
  assert.equal(inline('[a "b" & c](https://example.com/?q="x")', ctx), '<a href="https://example.com/?q=&quot;x&quot;">a &quot;b&quot; &amp; c</a>');
  assert.equal(inline('1 < 2 and 3 > 2', ctx), '1 &lt; 2 and 3 &gt; 2');
  const r = md('# Title <b>\n\n## A & B\n\ntext\n\n```dotenv\n<KEY>="&"\n```\n');
  assert.equal(r.title, 'Title &lt;b&gt;');
  assert.match(r.html, /<h2 id="a-b">A &amp; B<\/h2>/);
  assert.match(r.html, /<pre>&lt;KEY&gt;=&quot;&amp;&quot;<\/pre>/);
  assert.doesNotMatch(r.html, /<KEY>|<b>/);
});

test('links: https and mailto kept, legal pages to the site, other files to GitHub, folders to their tree', () => {
  const R = (h, from = 'legal/PRIVACY.md') => resolveLink(h, from, PAGES);
  assert.equal(R('https://ico.org.uk/make-a-complaint/'), 'https://ico.org.uk/make-a-complaint/');
  assert.equal(R('mailto:support@knightwatcher.io'), 'mailto:support@knightwatcher.io');
  assert.equal(R('#website'), '#website');
  assert.equal(R('../docs/telemetry.md'), REPO + '/blob/main/docs/telemetry.md');
  assert.equal(R('../docs/telemetry.md#what-is-sent'), REPO + '/blob/main/docs/telemetry.md#what-is-sent');
  assert.equal(R('../LICENSE', 'legal/ART-LICENCE.md'), REPO + '/blob/main/LICENSE');
  assert.equal(R('../telemetry/'), REPO + '/tree/main/telemetry');
  assert.equal(R('ART-LICENCE.md'), '/art-licence/');
  assert.equal(R('./PRIVACY.md#the-website', 'legal/ART-LICENCE.md'), '/privacy/#the-website');
  assert.equal(R('CONTRIBUTOR-TERMS.md'), REPO + '/blob/main/legal/CONTRIBUTOR-TERMS.md');
  for (const bad of ['javascript:alert(1)', 'http://example.com/', 'data:text/html,x', '//example.com/x', '../../outside.md', 'ftp://x/y', '#']) {
    assert.throws(() => R(bad), /does not take|climbs out/, bad);
  }
});

test('paragraphs join their lines; lists take continuation lines; headings get ids and the contents', () => {
  const r = md(`# Notice

First line
second line with **bold** and \`code\`.

- one item
  that wraps;
- [a link](../docs/x.md).

## The usage counts

### What is sent

## Your rights

### What is sent
`);
  assert.equal(r.html.split('\n')[0], '<p>First line second line with <strong>bold</strong> and <code>code</code>.</p>');
  assert.match(r.html, /<ul>\n<li>one item that wraps;<\/li>\n<li><a href="https:\/\/github\.com\/knightwatcher-io\/knightwatcher\/blob\/main\/docs\/x\.md">a link<\/a>\.<\/li>\n<\/ul>/);
  assert.deepEqual(r.toc, [{ id: 'usage-counts', html: 'The usage counts' }, { id: 'your-rights', html: 'Your rights' }]);
  // the same subheading under two sections stays two ids
  assert.match(r.html, /<h3 id="usage-counts-what-is-sent">/);
  assert.match(r.html, /<h3 id="your-rights-what-is-sent">/);
  assert.equal(slug('The website'), 'website');
  assert.equal(slug('Why: the lawful basis'), 'why-the-lawful-basis');
});

test('anything outside the subset stops the render, naming the line', () => {
  const bad = {
    table: '| a | b |', quote: '> quoted', numbered: '1. first', star: '* item', plus: '+ item', html: '<div>x</div>',
    h4: '#### deep', italics: 'some *word*', underscore: 'some _word_', unclosed: 'a `code', unclosedBold: 'a **bold', notLink: 'a [b] c',
    indented: '    code', inlineHtml: 'text <b>x</b>'
  };
  for (const [name, line] of Object.entries(bad)) {
    assert.throws(() => md('# T\n\n' + line + '\n'), /legal\/TEST\.md:3|legal\/TEST\.md/, name);
  }
  assert.throws(() => md('text\n\n# Late title\n'), /must come first/);
  assert.throws(() => md('# One\n\n# Two\n'), /must come first/);
  assert.throws(() => md('## No title\n'), /no level one heading/);
  assert.throws(() => md('# T\n\n```\nnever closed\n'), /never closed/);
  assert.throws(() => md('# T\n\n## Same\n\n## Same\n'), /taken/);
  assert.throws(() => renderMarkdown('# T\n', {}), /path/);
});

test('both legal files render whole, with their links resolved', async () => {
  const fs = await import('node:fs');
  for (const from of Object.keys(PAGES)) {
    const r = md(fs.readFileSync(new URL('../../' + from, import.meta.url), 'utf8'), from);
    assert.ok(r.toc.length >= 4, from);
    for (const [, href] of r.html.matchAll(/href="([^"]*)"/g)) assert.match(href, /^(https:\/\/|\/(privacy|art-licence)\/|#|mailto:)/, href);
  }
});
