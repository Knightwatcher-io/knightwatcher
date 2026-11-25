/* Knightwatcher's website: the markdown renderer for the legal pages and the docs. It renders the
   subset of GitHub's markdown that legal/, docs/, CONTRIBUTING.md and site/README.md use, and
   nothing more: headings of levels one to six, paragraphs, lists of "- " and "1. " items nested to
   any depth, with paragraphs, code and tables inside them, fenced code blocks with or without a
   language, tables with their columns' alignment, links, bold, inline code and backslash escapes.
   An HTML comment on lines of its own (the markers configuration.md keeps around its generated
   reference) is left out. Every piece of text is escaped. Anything outside the subset (a quote,
   raw HTML, italics, an indented code block, a link with another scheme) throws, naming the file
   and the line, so that an edit the renderer cannot show stops the build rather than reaching the
   site half drawn. A heading's id is the one GitHub gives it, so that a link to a heading works the
   same on the site and on GitHub. site/README.md describes the site. */

export const REPO = 'https://github.com/knightwatcher-io/knightwatcher';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text with &, <, >, " and ' escaped, for an element's content or an attribute's value. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/** The text a reader sees in a fragment of the renderer's HTML: the tags dropped and the
 *  escapes read. */
export function textOf(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** A file's path in the repository, from a link written in the file at `from`: posix, with no . or
 *  .. left, and refused when it climbs out of the repository. */
export function repoPath(target, from) {
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
 *  file on GitHub otherwise: a folder (written with a trailing slash, or one `isDir` knows) to its
 *  tree. Any other scheme throws. */
export function resolveLink(href, from, pages = {}, isDir = () => false) {
  if (/^https:\/\/[^\s]+$/.test(href) || /^mailto:[^\s@]+@[^\s@]+$/.test(href) || /^#[\p{L}\p{N}_-]+$/u.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) throw new Error(`a link the site does not take: ${href}`);
  const [target, hash] = href.split('#', 2);
  if (!target) throw new Error(`a link the site does not take: ${href}`);
  const path = repoPath(target, from), tail = hash === undefined ? '' : '#' + hash;
  const bare = path.replace(/\/$/, '');
  if (pages[bare]) return pages[bare] + tail;
  return `${REPO}/${path.endsWith('/') || isDir(bare) ? 'tree' : 'blob'}/main/${bare}${tail}`;
}

/** A heading's id as GitHub writes it: the heading's text in lower case, with everything but
 *  letters, digits, spaces, hyphens and underscores taken out and each space made a hyphen. */
export function slug(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

/** The ids of a page's headings, as GitHub numbers them: a second heading of the same words gets
 *  -1, a third -2. */
export function slugger() {
  const seen = new Map();
  return text => {
    const base = slug(text);
    if (!seen.has(base)) { seen.set(base, 0); return base; }
    let n = seen.get(base), id;
    do { n += 1; id = `${base}-${n}`; } while (seen.has(id));
    seen.set(base, n); seen.set(id, 0);
    return id;
  };
}

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** The end of the code span that opens with the run of backticks at i: the index of the first
 *  character after its closing run, and its content; null when it is never closed. */
function codeSpan(text, i) {
  let n = 0;
  while (text[i + n] === '`') n++;
  for (let j = i + n; j < text.length;) {
    if (text[j] !== '`') { j++; continue; }
    let m = 0;
    while (text[j + m] === '`') m++;
    if (m === n) {
      let body = text.slice(i + n, j);
      // one space is taken off each end where both have one and the code is not spaces alone
      if (body.length >= 2 && body[0] === ' ' && body[body.length - 1] === ' ' && body.trim()) body = body.slice(1, -1);
      return { end: j + m, body };
    }
    j += m;
  }
  return null;
}

/** The index of the ] that closes the [ at i, skipping code spans and escapes, or -1. */
function closeBracket(text, i) {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { j++; continue; }
    if (c === '`') { const s = codeSpan(text, j); if (s) { j = s.end - 1; continue; } }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return j;
  }
  return -1;
}

/* Raw HTML: a tag GitHub would draw or strip, a comment or an autolink. Anything else after a <,
   such as the placeholder in KW_<SECRET>_<FIELD>, is the text itself. */
const RAW = /^(<\/?(a|abbr|b|blockquote|br|code|dd|del|details|div|dl|dt|em|h[1-6]|hr|i|img|ins|kbd|li|ol|p|picture|pre|q|s|samp|source|span|strong|sub|summary|sup|table|tbody|td|tfoot|th|thead|tr|tt|u|ul|var|video)(\s[^>]*)?\/?>|<!|<\?|<[a-z][a-z0-9+.-]*:)/i;

/** Whether the * or _ at i opens what would read as italics: a word, or words, between two of
 *  them, as in *word* or _a few words_. A * or _ on its own, as in the pattern "*-run-*" or a
 *  name like glances_basic, is the character itself. */
function emphasis(text, i) {
  const c = text[i], rest = text.slice(i + 1);
  if (!/^[\p{L}\p{N}]/u.test(rest)) return false;
  if (c === '_' && i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1])) return false;
  const close = c === '*' ? /[\p{L}\p{N}.!?)]\*(?!\*)/u : /[\p{L}\p{N}.!?)]_(?![\p{L}\p{N}])/u;
  return close.test(rest);
}

/** One line's inline markdown as HTML: `code`, **bold**, [text](link), backslash escapes, and the
 *  rest escaped. A [ that does not open a link is the character itself, as on GitHub. */
export function inline(text, ctx) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length && PUNCT.test(text[i + 1])) {
      out += escapeHtml(text[i + 1]);
      i += 2;
    } else if (c === '`') {
      const s = codeSpan(text, i);
      if (!s) throw new Error(`${ctx.where}: a \` that is never closed`);
      out += '<code>' + escapeHtml(s.body) + '</code>';
      i = s.end;
    } else if (text.startsWith('**', i)) {
      const j = text.indexOf('**', i + 2);
      if (j < 0) throw new Error(`${ctx.where}: a ** that is never closed`);
      out += '<strong>' + inline(text.slice(i + 2, j), ctx) + '</strong>';
      i = j + 2;
    } else if ((c === '*' || c === '_') && emphasis(text, i)) {
      throw new Error(`${ctx.where}: italics are not in the subset the site renders`);
    } else if (c === '[') {
      const j = closeBracket(text, i);
      const m = j > 0 ? /^\(([^()\s]+)\)/.exec(text.slice(j + 1)) : null;
      if (!m) { out += '['; i += 1; continue; }
      const href = resolveLink(m[1], ctx.from, ctx.pages, ctx.isDir);
      out += `<a href="${escapeHtml(href)}">${inline(text.slice(i + 1, j), ctx)}</a>`;
      i = j + 1 + m[0].length;
    } else if (c === '<' && RAW.test(text.slice(i))) {
      throw new Error(`${ctx.where}: raw HTML is not in the subset the site renders`);
    } else {
      out += escapeHtml(c);
      i += 1;
    }
  }
  return out;
}

/* ---- Blocks ---------------------------------------------------------------------------------- */

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})(?: +(.*?))?(?: +#+)?\s*$/;
const ITEM = /^( {0,3})(-|\d{1,9}[.)])( +|$)(.*)$/;
const DELIM = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const COMMENT = /^ {0,3}<!--/;
const blank = s => /^\s*$/.test(s);
const indentOf = s => /^ */.exec(s)[0].length;

/** The cells of a table's row: split on each | that is neither escaped nor inside a code span,
 *  the outer ones dropped, and then each \| made a plain |, code spans included, as GitHub does.
 *  GitHub also splits on a bare | inside a code span; the site keeps the code whole. */
function cells(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out = [];
  let cell = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cell += c + s[i + 1]; i++; continue; }
    if (c === '`') { const span = codeSpan(s, i); if (span) { cell += s.slice(i, span.end); i = span.end - 1; continue; } }
    if (c === '|') { out.push(cell.trim()); cell = ''; continue; }
    cell += c;
  }
  out.push(cell.trim());
  return out.map(c => c.replace(/\\\|/g, '|'));
}
const isTableAt = (lines, i) => i + 1 < lines.length && lines[i].text.includes('|') && lines[i + 1].text.includes('|') && DELIM.test(lines[i + 1].text);

/** Whether the line starts a block of its own, so that it ends a paragraph before it. */
function startsBlock(lines, i) {
  const t = lines[i].text, item = ITEM.exec(t);
  if (FENCE.test(t) || HEADING.test(t) || COMMENT.test(t) || isTableAt(lines, i)) return true;
  // a list interrupts a paragraph when it is a "- " list, or a numbered one starting at 1
  return !!(item && item[4] !== '' && (item[2] === '-' || /^1[.)]$/.test(item[2])));
}

/**
 * The blocks of `lines` (each { text, n }, n the line's number in the file, from 0), as HTML.
 * Returns the blocks, each { p: true } for a paragraph with its inline HTML in html, and whether a
 * blank line stood between two of them (for a list item, which then is loose).
 */
function blocks(lines, R) {
  const out = [];
  let gap = false, sawBlank = false;
  const push = b => { if (out.length && sawBlank) gap = true; sawBlank = false; out.push(b); };
  for (let i = 0; i < lines.length;) {
    const { text, n } = lines[i];
    if (blank(text)) { sawBlank = true; i++; continue; }

    if (COMMENT.test(text)) {
      // a comment on lines of its own is left out
      let j = i;
      while (j < lines.length && !lines[j].text.includes('-->')) j++;
      if (j >= lines.length) throw new Error(`${R.where(n)}: a comment that is never closed`);
      if (!/-->\s*$/.test(lines[j].text)) throw new Error(`${R.where(lines[j].n)}: raw HTML is not in the subset the site renders`);
      i = j + 1;
      continue;
    }

    const fence = FENCE.exec(text);
    if (fence) {
      const [, ind, mark, lang] = fence, body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const t = lines[j].text, close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(t);
        if (close && close[1][0] === mark[0] && close[1].length >= mark.length) break;
        body.push(t.slice(Math.min(ind.length, indentOf(t))));
      }
      if (j >= lines.length) throw new Error(`${R.where(n)}: a code block that is never closed`);
      push({ html: `<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>` + escapeHtml(body.join('\n')) + '</code></pre>' });
      i = j + 1;
      continue;
    }

    const h = HEADING.exec(text);
    if (h) {
      push({ html: R.heading(h[1].length, h[2] || '', n) });
      i++;
      continue;
    }

    if (isTableAt(lines, i)) {
      const head = cells(text), align = cells(lines[i + 1].text).map(c => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : ''));
      if (align.length !== head.length) throw new Error(`${R.where(n)}: a table whose header and delimiter rows differ in their columns`);
      const cell = (tag, t, k, at) => `<${tag}${align[k] ? ` class="al-${align[k]}"` : ''}>${inline(t, R.ctx(at))}</${tag}>`;
      const rows = [];
      let j = i + 2;
      for (; j < lines.length && !blank(lines[j].text) && lines[j].text.includes('|'); j++) {
        const cs = cells(lines[j].text);
        rows.push('<tr>' + head.map((x, k) => cell('td', cs[k] || '', k, lines[j].n)).join('') + '</tr>');
      }
      push({ html: '<div class="table"><table>\n<thead><tr>' + head.map((x, k) => cell('th', x, k, n)).join('') + '</tr></thead>\n<tbody>\n' + rows.join('\n') + '\n</tbody>\n</table></div>' });
      i = j;
      continue;
    }

    const item = ITEM.exec(text);
    if (item) {
      const r = list(lines, i, R);
      push({ html: r.html });
      i = r.next;
      continue;
    }

    if (/^ {0,3}>/.test(text)) throw new Error(`${R.where(n)}: a quote is not in the subset the site renders`);
    if (/^ {0,3}[*+] /.test(text)) throw new Error(`${R.where(n)}: a list of "*" or "+" items is not in the subset the site renders; use "- "`);
    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) throw new Error(`${R.where(n)}: a rule is not in the subset the site renders`);
    if (/^( {4}|\t)/.test(text)) throw new Error(`${R.where(n)}: an indented code block is not in the subset the site renders; fence it`);
    if (/^ {0,3}<[a-z/!?]/i.test(text)) throw new Error(`${R.where(n)}: raw HTML is not in the subset the site renders`);

    // a paragraph: this line and those after it up to a blank line or another block
    const para = [text.trim()];
    let j = i + 1;
    for (; j < lines.length && !blank(lines[j].text) && !startsBlock(lines, j); j++) {
      if (/^ {0,3}(=+|-+)\s*$/.test(lines[j].text)) throw new Error(`${R.where(lines[j].n)}: an underlined heading is not in the subset the site renders`);
      para.push(lines[j].text.trim());
    }
    push({ p: true, html: inline(para.join(' '), R.ctx(n)) });
    i = j;
  }
  return { out, gap };
}

/** The list that starts at lines[i]: its items, each its own blocks. Returns its HTML and the
 *  index of the first line after it. */
function list(lines, i, R) {
  const first = ITEM.exec(lines[i].text), ordered = first[2] !== '-', delim = ordered ? first[2].slice(-1) : '-';
  const items = [];
  let loose = false, j = i;
  const sibling = m => !!m && (m[2] !== '-') === ordered && (!ordered || m[2].slice(-1) === delim);
  while (j < lines.length) {
    const m = ITEM.exec(lines[j].text);
    if (!sibling(m)) break;
    // the column the item's content starts at: after the marker and its spaces, or one past the
    // marker where the spaces are more than four (the rest is then indented content)
    const spaces = m[3].length, col = m[1].length + m[2].length + (spaces >= 1 && spaces <= 4 && m[4] !== '' ? spaces : 1);
    const body = [{ text: m[4] === '' ? '' : (spaces > 4 ? ' '.repeat(spaces - 1) : '') + m[4], n: lines[j].n }];
    let k = j + 1, lastBlank = m[4] === '', inFence = FENCE.test(body[0].text);
    for (; k < lines.length; k++) {
      const t = lines[k].text;
      if (blank(t)) { body.push({ text: '', n: lines[k].n }); lastBlank = true; continue; }
      if (indentOf(t) >= col) {
        const inner = t.slice(col);
        if (FENCE.test(inner)) inFence = !inFence;
        body.push({ text: inner, n: lines[k].n }); lastBlank = false;
        continue;
      }
      // a line indented less than the content: a lazy continuation of the item's paragraph, or the
      // end of the item
      if (!lastBlank && !inFence && !ITEM.test(t) && !startsBlock(lines, k)) { body.push({ text: t.trim(), n: lines[k].n }); continue; }
      break;
    }
    // blank lines at the item's end belong between the items, and make the list loose when
    // another item follows
    let end = body.length;
    while (end > 1 && blank(body[end - 1].text)) end--;
    const trailing = end < body.length;
    const r = blocks(body.slice(0, end), R);
    if (r.gap) loose = true;
    items.push(r.out);
    j = k;
    if (trailing && j < lines.length && sibling(ITEM.exec(lines[j].text))) loose = true;
  }
  const start = ordered ? parseInt(first[2], 10) : 1;
  const lis = items.map(bs => '<li>' + bs.map(b => (b.p ? (loose ? '<p>' + b.html + '</p>' : b.html) : b.html)).join('\n') + '</li>');
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n` + lis.join('\n') + `\n</${tag}>`, next: j };
}

/**
 * Renders a markdown file. `from` is its path in the repository (docs/configuration.md), for its
 * relative links; `pages` maps paths in the repository to the site's pages, and `isDir` says which
 * paths are folders. Returns the title (the one level one heading, which must come first, as HTML),
 * the body's HTML without it, and the contents: each level two heading's id and HTML, with the
 * level three headings under it in `sub`. Each heading's id is GitHub's.
 */
export function renderMarkdown(source, { from, pages = {}, isDir = () => false } = {}) {
  if (typeof from !== 'string' || !from) throw new Error('renderMarkdown needs the file\'s path in the repository');
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map((text, n) => ({ text: text.replace(/\t/g, '    '), n }));
  const toc = [], id = slugger();
  let title = null, any = false;
  const R = {
    where: n => `${from}:${n + 1}`,
    ctx: n => ({ where: `${from}:${n + 1}`, from, pages, isDir }),
    heading(level, text, n) {
      if (!text) throw new Error(`${from}:${n + 1}: a heading with no words`);
      const inner = inline(text, R.ctx(n));
      if (level === 1) {
        if (title !== null || any) throw new Error(`${from}:${n + 1}: the level one heading must come first, and once`);
        title = inner;
        return '';
      }
      const hid = id(textOf(inner));
      if (level === 2) toc.push({ id: hid, html: inner, sub: [] });
      else if (level === 3 && toc.length) toc[toc.length - 1].sub.push({ id: hid, html: inner });
      return `<h${level} id="${hid}">${inner}</h${level}>`;
    }
  };
  // the level one heading must be the file's first block
  const firstText = lines.find(l => !blank(l.text));
  if (firstText && !/^ {0,3}# /.test(firstText.text)) any = true;
  const { out } = blocks(lines, R);
  if (title === null) throw new Error(`${from}: no level one heading`);
  return { title, html: out.map(b => (b.p ? '<p>' + b.html + '</p>' : b.html)).filter(Boolean).join('\n'), toc };
}
