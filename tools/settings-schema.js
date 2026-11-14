#!/usr/bin/env node
// Writes what is made from the settings schema, collector/settings-schema.json:
//
//   - the page's copy, between the settings-schema markers in web/js/settings.js: the settings of
//     the four sections the display chooses (look, display, quiet, scenes) with the values each may
//     take and the page's own default, and every scene;
//   - the reference of every setting and every .env variable (the host paths, the bundled
//     server's address and port, and the credentials), between the settings-reference markers in
//     docs/configuration.md.
//
//   node tools/settings-schema.js           write both
//   node tools/settings-schema.js --check   write nothing; exit 1 and name each that is stale
//
// The page is classic scripts with no build step, opened from disk, so it cannot fetch the JSON
// file; it carries the part it reads, as web/packs/*.pack.js carry the packs. Run this after every
// change to the schema. tests/tools/settings-schema.test.js runs the check.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCHEMA = path.join(ROOT, 'collector', 'settings-schema.json');
const PAGE = path.join(ROOT, 'web', 'js', 'settings.js');
const DOC = path.join(ROOT, 'docs', 'configuration.md');
const PAGE_MARKS = ['  // settings-schema:start\n', '  // settings-schema:end\n'];
const DOC_MARKS = ['<!-- settings-reference:start -->\n', '<!-- settings-reference:end -->\n'];

/* ---- The page's copy ----------------------------------------------------------------------- */

/* One setting as the page reads it: values (a boolean takes true or false), a range, and the
   page's own default as page. */
function pageSetting(s) {
  const o = {};
  if (s.type === 'boolean') o.values = [true, false];
  else if (s.values) o.values = s.values;
  if ('min' in s) o.min = s.min;
  if ('max' in s) o.max = s.max;
  o.page = s.page_default === undefined ? null : s.page_default;
  return o;
}

/* A value on one line, as the page's own code writes it. */
function oneLine(v) {
  if (Array.isArray(v)) return '[' + v.map(oneLine).join(', ') + ']';
  if (v !== null && typeof v === 'object') return '{ ' + Object.keys(v).map(k => k + ': ' + oneLine(v[k])).join(', ') + ' }';
  return typeof v === 'string' && /^[\w .+-]*$/.test(v) ? "'" + v + "'" : JSON.stringify(v);
}

/* The block between the page's markers, one setting a line. */
function pageBlock(schema) {
  const lines = ['  /* Written by tools/settings-schema.js from collector/settings-schema.json: change the schema and', '     run the tool, never these lines. */', '  const SCHEMA = {'];
  const tables = schema.tables.filter(t => t.defaults_for === 'display' && t.table !== 'scenes');
  for (const t of tables) {
    lines.push('    ' + t.table + ': {');
    t.settings.forEach((s, i) => lines.push('      ' + s.key + ': ' + oneLine(pageSetting(s)) + (i < t.settings.length - 1 ? ',' : '')));
    lines.push('    },');
  }
  lines.push('    scenes: ' + oneLine(schema.scenes.map(s => s.id)));
  lines.push('  };');
  return lines.join('\n') + '\n';
}

/* ---- The reference ------------------------------------------------------------------------- */

const code = v => '`' + v + '`';
/* A value as config.toml writes it. */
function toml(v, type) {
  if (Array.isArray(v)) return '[' + v.map(x => toml(x)).join(', ') + ']';
  if (typeof v === 'string') return JSON.stringify(v);
  if (type === 'number' && Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}
/* a, b or c */
const or = list => (list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1]);
const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function rangeText(s) {
  const { min, above, max } = s;
  if (above !== undefined && max !== undefined) return 'above ' + above + ', at most ' + max;
  if (above !== undefined) return 'above ' + (above === 0 ? 'zero' : above);
  if (min !== undefined && max !== undefined) return 'from ' + min + ' to ' + max;
  if (min !== undefined) return min === 0 ? 'zero or more' : 'at least ' + min;
  if (max !== undefined) return 'at most ' + max;
  return '';
}
function valuesText(s) {
  if (s.acts) return 'any scene; the page acts it in ' + or(s.acts.map(v => code(toml(v))));
  if (s.type === 'boolean') return '`true` or `false`';
  if (s.values && s.type !== 'list') return or(s.values.map(v => code(toml(v))));
  if (s.type === 'integer' || s.type === 'number') {
    const noun = s.unit === 'percent' ? 'a percentage' : (s.type === 'integer' ? 'a whole number' : 'a number') + (s.unit ? ' of ' + s.unit : '');
    const range = s.form || rangeText(s);
    return noun + (range ? ', ' + range : '');
  }
  if (s.type === 'list') return (s.form || 'a list') + (s.values ? ': ' + or(s.values.map(v => code(toml(v)))) : '');
  return s.form || 'text';
}
function defaultText(s) {
  if (s.required) return 'required';
  if (s.page_default !== undefined) return s.page_default === null ? 'none' : 'none; the page\'s own is ' + code(toml(s.page_default, s.type));
  if (s.default === null || s.default === undefined) return 'none';
  return code(toml(s.default, s.type));
}
function heading(t) {
  return t.many ? '[[' + t.table + ']]' : '[' + t.table + ']';
}

function reference(schema) {
  const out = [];
  for (const t of schema.tables) {
    out.push('### ' + heading(t), '', t.help, '');
    if (!t.settings.length) continue;
    out.push('| Key | Values | Default | Scope | What it does |', '|---|---|---|---|---|');
    for (const s of t.settings) out.push('| ' + [code(s.key), valuesText(s), defaultText(s), s.scope, s.help].map(cell).join(' | ') + ' |');
    out.push('');
  }
  out.push('### .env', '', 'Every variable the project reads from `.env`. The host paths are the folders and files `compose.yaml` mounts, the server\'s address and port are where it publishes the bundled server, and the credentials reach the collector alone.', '');
  out.push('| Variable | Scope | Values | Default | What it is |', '|---|---|---|---|---|');
  for (const e of schema.env) {
    const values = e.scope === 'path' ? 'a host path, such as ' + code(e.example) : e.form + ', such as ' + code(e.example);
    const dflt = e.required ? 'required' : e.default === null ? 'none' : e.default === '' ? 'empty' : code(e.default);
    const what = e.help + (e.scope === 'credential' ? ' Read when the source is enabled; its `secret` setting names the variable.' : '');
    out.push('| ' + [code(e.name), e.scope, values, dflt, what].map(cell).join(' | ') + ' |');
  }
  return out.join('\n') + '\n';
}

/* ---- Splicing ------------------------------------------------------------------------------ */

/* text with what lies between its two marks replaced by body. */
function splice(text, marks, body, file) {
  const a = text.indexOf(marks[0]), b = text.indexOf(marks[1]);
  if (a < 0 || b < a || text.indexOf(marks[0], a + 1) >= 0 || text.indexOf(marks[1], b + 1) >= 0) {
    throw new Error(file + ': needs each of ' + JSON.stringify(marks[0].trim()) + ' and ' + JSON.stringify(marks[1].trim()) + ' once, in that order');
  }
  return text.slice(0, a + marks[0].length) + body + text.slice(b);
}

/* What each target should hold: [[file, text now, text it should be], ...]. */
function targets(root = ROOT) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'collector', 'settings-schema.json'), 'utf8'));
  const page = path.join(root, 'web', 'js', 'settings.js'), doc = path.join(root, 'docs', 'configuration.md');
  const pageNow = fs.readFileSync(page, 'utf8'), docNow = fs.readFileSync(doc, 'utf8');
  return [
    [page, pageNow, splice(pageNow, PAGE_MARKS, pageBlock(schema), page)],
    [doc, docNow, splice(docNow, DOC_MARKS, '\n' + reference(schema) + '\n', doc)]
  ];
}

function main(args) {
  const check = args.includes('--check');
  if (args.some(a => a !== '--check')) throw new Error('usage: node tools/settings-schema.js [--check]');
  let stale = 0;
  for (const [file, now, want] of targets()) {
    if (now === want) continue;
    const name = path.relative(process.cwd(), file);
    if (check) { console.error('settings-schema: ' + name + ' is stale: run node tools/settings-schema.js'); stale++; }
    else { fs.writeFileSync(file, want); console.log('wrote ' + name); }
  }
  return stale ? 1 : 0;
}

module.exports = { pageBlock, pageSetting, reference, splice, targets, valuesText, defaultText, SCHEMA, PAGE, DOC, PAGE_MARKS, DOC_MARKS };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('settings-schema: ' + e.message); process.exitCode = 2; }
}
