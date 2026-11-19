#!/usr/bin/env node
// The faults of a sweep's results, for reading: DIR/faults.md lists them by weapon, build, scene and
// kind (the knights' spots, the worst figure, when and where on the goblin and on the weapon), and
// for the worst plan of each group DIR/pictures/ holds a picture of its worst moment and
// DIR/sheet.html shows them, opening from disk. Prints one line for each group.
//
//   node tools/contact-sweep/report.js RESULTS DIR
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib.js');
const { render } = require('./picture.js');

const [file, dir] = process.argv.slice(2, 4);
if (!file || !dir) { console.error('usage: report.js RESULTS DIR'); process.exit(2); }
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const NAME = { great: 'greatsword', arming: 'arming sword', long: 'longsword', mace: 'flanged mace', crossbow: 'crossbow' };
const who = p => (p.pack === false ? 'greatsword (code knight)' : NAME[p.weapon] + ', ' + L.BUILDS[p.build]);
const ranges = xs => {
  xs = [...new Set(xs)].sort((a, b) => a - b);
  const o = []; let s = xs[0], q = xs[0];
  for (const x of xs.slice(1).concat([null])) { if (x !== q + 1) { o.push(s === q ? '' + s : s + '-' + q); s = x; } q = x; }
  return o.join(', ');
};
const rel = (el, hit) => (el - hit >= 0 ? '+' : '') + (el - hit);

// the failing plans, grouped by weapon and build, scene and kind
const groups = new Map();
for (const r of R.results) for (const p of r.plans) {
  const kinds = p.shot ? (p.overlapPx > 0 ? ['touch'] : []) : [p.over2 && 'depth', p.gap > 3 && 'gap'].filter(Boolean);
  for (const kind of kinds) {
    const k = [r.cfg.key, p.scene, kind].join('|');
    if (!groups.has(k)) groups.set(k, { key: r.cfg.key, scene: p.scene, kind, plans: [] });
    groups.get(k).plans.push(p);
  }
}
const fig = (g, p) => (g.kind === 'depth' ? p.worst.depth : g.kind === 'gap' ? p.gap : p.worstShot.depth);
const md = ['# Contact sweep: faults', '', `From ${R.from}, spots ${R.spots}, every ${R.step} ms, ${R.at}.`, ''];
if (!groups.size && !R.timing.length && !(R.missing || []).length) md.push('No faults.', '');
if (groups.size) {
  md.push('| Weapon | Scene | Kind | Plans | Knight x (stops in bold) | Goblin x | Worst | When (ms, from the hit) | On the goblin (from its feet, facing left) | On the weapon (s, p) |', '|---|---|---|---|---|---|---|---|---|---|');
}
const worst = [];
for (const g of groups.values()) {
  const w = g.plans.reduce((a, p) => (fig(g, p) > fig(g, a) ? p : a)), stops = [...new Set(g.plans.filter(p => p.stop).map(p => p.kx))];
  worst.push({ g, p: w });
  const when = g.kind === 'depth' ? `${w.worst.el} (${rel(w.worst.el, w.hit)}); over 2 px from ${rel(w.over2.first, w.hit)} to ${rel(w.over2.last, w.hit)}` : g.kind === 'gap' ? `${w.hit} (the hit)` : `${w.worstShot.el}`;
  const gl = g.kind === 'depth' ? w.worst.glocal : g.kind === 'gap' && w.gapAt ? w.gapAt.glocal : null, wl = g.kind === 'depth' ? w.worst.wlocal : g.kind === 'gap' && w.gapAt ? w.gapAt.wlocal : null;
  const pose = g.kind === 'depth' ? w.worst.pose : g.kind === 'gap' && w.gapAt ? w.gapAt.pose : '';
  md.push(`| ${who(w)} | ${g.scene} | ${g.kind} | ${g.plans.length} | ${ranges(g.plans.map(p => p.kx))}${stops.length ? ' (**' + stops.join(', ') + '**)' : ''} | ${[...new Set(g.plans.map(p => p.x))].join(', ')} | ${fig(g, w).toFixed(1)} px at knight ${w.kx} | ${when} | ${gl ? '(' + gl.join(', ') + ') ' + pose : ''} | ${wl ? '(' + wl.join(', ') + ')' : ''} |`);
  console.log(`${who(w)}, ${g.scene}: ${g.plans.length} plans fail on ${g.kind}, worst ${fig(g, w).toFixed(1)} px at knight ${w.kx}`);
}
if (R.timing.length) {
  md.push('', '## Timing', '', '| Weapon | Build | Scene | Knight x | Devices | Kind | Classic | This build |', '|---|---|---|---|---|---|---|---|');
  for (const t of R.timing) md.push(`| ${NAME[t.weapon]} | ${L.BUILDS[t.build]} | ${t.scene} | ${t.kx} | ${t.set} | ${t.kind} | ${JSON.stringify(t.a)} | ${JSON.stringify(t.b)} |`);
  console.log(`${R.timing.length} timing breaches`);
}
for (const k of R.missing || []) { md.push('', `Missing: ${k}, a main item with a blade that the sweep does not hold.`); console.log('missing ' + k); }
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'faults.md'), md.join('\n') + '\n');

// a picture of the worst moment of the worst plan of each group of swung faults
const pics = path.join(dir, 'pictures'), cards = [];
fs.rmSync(pics, { recursive: true, force: true });
const models = new Map();
const model = p => { const k = [p.weapon, p.build, p.pack].join(); if (!models.has(k)) models.set(k, L.load({ from: R.from, weapon: p.weapon, build: p.build, pack: p.pack })); return models.get(k); };
for (const { g, p } of worst) {
  if (g.kind === 'touch') continue;
  fs.mkdirSync(pics, { recursive: true });
  const m = model(p), d = p.sets[0] === 'none' ? [] : p.sets[0].split('+').map(n => (n === 'pie' ? L.PIE : L.device(n))), pl = L.planFor(m, p.scene, p.kx, d);
  const el = g.kind === 'depth' ? p.worst.el : p.hit, name = `${p.cfg}-${p.scene}-${p.kx}-${g.kind}-${el}.png`;
  const a = render(m, pl, p.kx, el, path.join(pics, name), { mark: g.kind });
  const what = g.kind === 'depth' ? `${a.depth.toFixed(1)} px deep` : `${a.gap.toFixed(1)} px gap`;
  cards.push({ img: 'pictures/' + name, caption: `${who(p)}, ${p.scene}, knight x ${p.kx}, goblin x ${p.x}, devices ${p.sets.join(' or ')}: ${el} ms (hit ${p.hit}, ${rel(el, p.hit)}), goblin pose ${a.pose}, ${what}.` });
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
fs.writeFileSync(path.join(dir, 'sheet.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact sweep</title>
<style>
:root { --bg: #f6f4ee; --fg: #1d1b22; --muted: #5d5868; --card: #ffffff; --line: #ddd8cc; }
@media (prefers-color-scheme: dark) { :root { --bg: #17151c; --fg: #ece8f2; --muted: #a8a2b4; --card: #221f29; --line: #3a3544; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 16px; }
p.key { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 12px 0; }
.card img { image-rendering: pixelated; max-width: 100%; height: auto; border: 1px solid var(--line); }
</style></head><body><main>
<h1>Contact sweep</h1>
<p class="key">From ${esc(R.from)}, ${esc(R.at)}. The worst moment of the worst plan of each group of faults, drawn from the page's own fills with no backdrop and no burst. Magenta: weapon pixels more than 2 px into the goblin; yellow: 2 px or less; green tint: the goblin where the knight's drawing hides it; blue: the nearest weapon and goblin pixels and the empty pixels between them. Every fault is listed in faults.md.</p>
${cards.length ? cards.map(c => `<div class="card"><img src="${c.img}" alt="${esc(c.caption)}"><p>${esc(c.caption)}</p></div>`).join('\n') : '<p>No faults to picture.</p>'}
</main></body></html>
`);
console.log(`${groups.size} groups of faults, ${cards.length} pictures; ${path.join(dir, 'faults.md')}, ${path.join(dir, 'sheet.html')}`);
