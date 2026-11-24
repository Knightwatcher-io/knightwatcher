/* Knightwatcher's website: the markdown renderer for the legal pages. It renders the subset that
   legal/PRIVACY.md and legal/ART-LICENCE.md use and nothing more: headings of levels one to three,
   paragraphs, lists of "- " items, fenced code blocks, links, bold and inline code. Every piece of
   text is escaped. Anything outside the subset (a table, a quote, a numbered list, a heading of level
   four, raw HTML, italics, a link with another scheme) throws, naming the line, so that an edit to
   legal/ that the renderer cannot show stops the build rather than reaching the site half drawn.
   site/README.md describes the site. */

export const REPO = 'https://github.com/knightwatcher-io/knightwatcher';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text with &, <, >, " and ' escaped, for an element's content or an attribute's value. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/** A file's path in the repository, from a link written in the file at `from`: posix, with no . or
 *  .. left, and refused when it climbs out of the repository. */
function repoPath(target, from) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) throw new Error(`a link climbs out of the repository: ${target}`);
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/') + (target.endsWith('/') ? '/' : '');
}

/** Where a link in the file at `from` points on the website. An https or mailto address stays as
 *  it is, and so does a link to a heading of the same page. A link to another file of the repository
 *  goes to the site's page for it when `pages` names one (legal/PRIVACY.md is /privacy/), and to the
 *  file on GitHub otherwise, a folder to its tree. Any other scheme throws. */
export function resolveLink(href, from, pages = {}) {
  if (/^https:\/\/[^\s]+$/.test(href) || /^mailto:[^\s@]+@[^\s@]+$/.test(href) || /^#[\w-]+$/.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) throw new Error(`a link the site does not take: ${href}`);
  const [target, hash] = href.split('#', 2);
  if (!target) throw new Error(`a link the site does not take: ${href}`);
  const path = repoPath(target, from), tail = hash === undefined ? '' : '#' + hash;
  if (pages[path]) return pages[path] + tail;
  return `${REPO}/${path.endsWith('/') ? 'tree' : 'blob'}/main/${path.replace(/\/$/, '')}${tail}`;
}

/** One line's inline markdown as HTML: `code`, **bold**, [text](link), and the rest escaped. */
export function inline(text, ctx) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '`') {
      const j = text.indexOf('`', i + 1);
      if (j < 0) throw new Error(`${ctx.where}: a \` that is never closed`);
      out += '<code>' + escapeHtml(text.slice(i + 1, j)) + '</code>';
      i = j + 1;
    } else if (text.startsWith('**', i)) {
      const j = text.indexOf('**', i + 2);
      if (j < 0) throw new Error(`${ctx.where}: a ** that is never closed`);
      out += '<strong>' + inline(text.slice(i + 2, j), ctx) + '</strong>';
      i = j + 2;
    } else if (c === '*' || (c === '_' && /^_\S/.test(text.slice(i)) && (i === 0 || /\s/.test(text[i - 1])))) {
      throw new Error(`${ctx.where}: italics are not in the subset the site renders`);
    } else if (c === '[') {
      const m = /^\[([^\][]+)\]\(([^()\s]+)\)/.exec(text.slice(i));
      if (!m) throw new Error(`${ctx.where}: a [ that is not a link`);
      out += `<a href="${escapeHtml(resolveLink(m[2], ctx.from, ctx.pages))}">${inline(m[1], ctx)}</a>`;
      i += m[0].length;
    } else if (c === '<' && /^<[a-z/!?]/i.test(text.slice(i))) {
      throw new Error(`${ctx.where}: raw HTML is not in the subset the site renders`);
    } else {
      out += escapeHtml(c);
      i += 1;
    }
  }
  return out;
}

/** A heading's id: its words in lower case joined by hyphens, without a leading "the". */
export function slug(text) {
  return text.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^the-/, '');
}

/**
 * Renders a legal file. `from` is its path in the repository (legal/PRIVACY.md), for its relative
 * links; `pages` maps paths in the repository to the site's pages. Returns the title (the one level
 * one heading, which must come first), the body's HTML without it, and the table of contents: each
 * level two heading's id and HTML. A level two heading's id is its slug; a level three heading's is
 * its section's id and its own slug, so the same subheading under two sections stays two ids.
 */
export function renderMarkdown(source, { from, pages = {} } = {}) {
  if (typeof from !== 'string' || !from) throw new Error('renderMarkdown needs the file\'s path in the repository');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html = [], toc = [], ids = new Set();
  let title = null, section = '', para = [], list = null, i = 0;
  const ctx = n => ({ where: `${from}:${n + 1}`, from, pages });
  const flushPara = () => { if (para.length) { html.push('<p>' + inline(para.map(p => p.text).join(' '), ctx(para[0].n)) + '</p>'); para = []; } };
  const flushList = () => { if (list) { html.push('<ul>\n' + list.map(it => '<li>' + inline(it.text, ctx(it.n)) + '</li>').join('\n') + '\n</ul>'); list = null; } };
  const flush = () => { flushPara(); flushList(); };
  const uniq = (id, n) => { if (!id || ids.has(id)) throw new Error(`${from}:${n + 1}: the heading's id "${id}" is empty or taken`); ids.add(id); return id; };

  for (; i < lines.length; i++) {
    const line = lines[i], n = i;
    if (/^\s*$/.test(line)) { flush(); continue; }
    if (/^```/.test(line)) {
      flush();
      const body = [];
      for (i += 1; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      if (i >= lines.length) throw new Error(`${from}:${n + 1}: a code block that is never closed`);
      html.push('<pre>' + escapeHtml(body.join('\n')) + '</pre>');
      continue;
    }
    const h = /^(#{1,6}) +(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length, text = h[2];
      if (level === 1) {
        if (title !== null || html.length) throw new Error(`${from}:${n + 1}: the level one heading must come first, and once`);
        title = text;
      } else if (level === 2) {
        section = uniq(slug(text), n);
        const inner = inline(text, ctx(n));
        toc.push({ id: section, html: inner });
        html.push(`<h2 id="${section}">${inner}</h2>`);
      } else if (level === 3) {
        const id = uniq((section ? section + '-' : '') + slug(text), n);
        html.push(`<h3 id="${id}">${inline(text, ctx(n))}</h3>`);
      } else throw new Error(`${from}:${n + 1}: headings below level three are not in the subset the site renders`);
      continue;
    }
    const item = /^- +(.*)$/.exec(line);
    if (item) {
      flushPara();
      (list = list || []).push({ text: item[1], n });
      continue;
    }
    if (list && /^ {2,}\S/.test(line)) { list[list.length - 1].text += ' ' + line.trim(); continue; }
    if (/^\s*([>|+]|\*\s|\d+[.)]\s|<)/.test(line) || /^ {4}/.test(line) || /^\t/.test(line)) {
      throw new Error(`${from}:${n + 1}: this line is not in the subset the site renders: ${line.trim().slice(0, 40)}`);
    }
    flushList();
    para.push({ text: line.trim(), n });
  }
  flush();
  if (title === null) throw new Error(`${from}: no level one heading`);
  return { title: escapeHtml(title), html: html.join('\n'), toc };
}
