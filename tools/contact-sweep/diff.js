#!/usr/bin/env node
// Compares two results of sweep.js, the scenes and the goblin from the medieval world's pack against
// the code's: every plan's inputs and every figure measured. Prints how many it compared and the
// first differences, and exits 1 when there is any.
//
//   node tools/contact-sweep/diff.js PACK_RESULTS CODE_RESULTS
'use strict';
const fs = require('node:fs');
const [a, b] = process.argv.slice(2, 4).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
if (!a || !b) { console.error('usage: diff.js PACK_RESULTS CODE_RESULTS'); process.exit(2); }
const strip = p => JSON.stringify(Object.assign({}, p, { samples: undefined }));
let n = 0, diffs = 0;
const say = (...s) => { diffs++; if (diffs <= 20) console.log(...s); };
for (const ra of a.results) {
  const rb = b.results.find(r => r.cfg.key === ra.cfg.key);
  if (!rb) { console.log('not in the second, passed over: ' + ra.cfg.key); continue; }
  const ib = new Map(rb.inputs.map(i => [i.scene + '|' + i.kx + '|' + i.set, JSON.stringify(i)]));
  for (const i of ra.inputs) { n++; if (ib.get(i.scene + '|' + i.kx + '|' + i.set) !== JSON.stringify(i)) say('plan differs', ra.cfg.key, JSON.stringify(i)); }
  const pb = new Map(rb.plans.map(p => [p.scene + '|' + p.kx + '|' + p.x + '|' + p.hit, strip(p)]));
  for (const p of ra.plans) if (pb.get(p.scene + '|' + p.kx + '|' + p.x + '|' + p.hit) !== strip(p)) say('measure differs', ra.cfg.key, p.scene, p.kx);
}
console.log(`compared ${n} plan inputs and ${a.results.reduce((s, r) => s + r.plans.length, 0)} measured plans: ${diffs} differences`);
process.exitCode = diffs ? 1 : 0;
