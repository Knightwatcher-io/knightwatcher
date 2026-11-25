#!/usr/bin/env node
// The contact sweep: every weapon the settings offer against the drawn goblin, on every build, in
// every scene that hosts the goblin, at every whole pixel the knight may stand at on its patrol,
// with every combination of the pie and the ground devices, each distinct plan measured once.
//
//   node tools/contact-sweep/sweep.js --out FILE [--from pack|code] [--weapons great,arming,...]
//        [--builds a,b,c] [--spots walk|test] [--step 2] [--jobs 4]
//
// --from pack (the default) takes the scenes and the goblin from the medieval world's pack, code
// the code's. --weapons defaults to great,arming,long,mace,code,crossbow (code is the greatsword on
// the code path). Writes the results to FILE as JSON and prints a line for each weapon and build and
// the faults against the standard (docs/tests.md, The contact standard):
//   depth   a pixel more than 2 px in at any moment from the strike's start to the goblin's last
//           drawn frame (measure.js says when it samples);
//   gap     more than 3 px at the hit, the weapon at the hit against the goblin as drawn then;
//   timing  a build's hit more than 12 ms (16 with the mace) from Classic's for the same spot and
//           devices, or the goblin coming at another spot, or not at all;
//   touch   the crossbow, which never strikes, drawn on the goblin at any moment;
//   missing a main item of the base pack with a blade that the sweep has no weapon for.
// Exits 1 when it finds any fault, 2 on a bad argument. Run it through tools/contact-sweep.sh, which
// puts it inside the ceiling of tools/capped.sh; it forks --jobs workers inside that.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');
const L = require('./lib.js');
const { measurePlan } = require('./measure.js');

const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) { console.error('not an option: ' + argv[i]); process.exit(2); }
  const k = argv[i].slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  args[k] = v;
}
const FROM = args.from || 'pack', STEP = +(args.step || 2), SPOTS = args.spots || 'walk', JOBS = Math.max(1, +(args.jobs || 4));
const WEAPONS = (args.weapons || 'great,arming,long,mace,code,crossbow').split(','), BUILDS = (args.builds || 'a,b,c').split(',');
if (!args.worker) {
  const bad = [];
  if (typeof args.out !== 'string') bad.push('--out FILE is required');
  if (!['pack', 'code'].includes(FROM)) bad.push('--from is pack or code');
  if (!['walk', 'test'].includes(SPOTS)) bad.push('--spots is walk or test');
  if (!(STEP >= 1)) bad.push('--step is a whole number of ms, 1 or more');
  for (const w of WEAPONS) if (w !== 'code' && !(w in L.ITEMS)) bad.push('no such weapon: ' + w);
  for (const b of BUILDS) if (!(b in L.BUILDS)) bad.push('no such build: ' + b);
  if (bad.length) { for (const b of bad) console.error(b); process.exit(2); }
}

/* The runs: one for each weapon and build, and one for the code path's greatsword. */
function configs() {
  const out = [];
  for (const w of WEAPONS) {
    if (w === 'code') { out.push({ weapon: 'great', build: 'a', pack: false, key: 'code' }); continue; }
    for (const b of BUILDS) out.push({ weapon: w, build: b, pack: true, key: w + '.' + b });
  }
  return out;
}

function foeScenes(m) {
  if (FROM === 'code') return m.E.EVENTS.goblin.where.slice();
  const R = L.PK.read(L.MEDIEVAL, { allowUnsigned: true });
  return Object.keys(R.data.scenes).filter(n => R.data.scenes[n].hosts.includes('foe'));
}

function runConfig(cfg) {
  const t0 = Date.now();
  const m = L.load({ from: FROM, pack: cfg.pack, build: cfg.build, weapon: cfg.weapon });
  const fb = L.frameBox(m), scenes = foeScenes(m), sets = L.deviceSets(), plans = [], inputs = [];
  for (const scene of scenes) {
    const stops = new Set(m.KW.scenes[scene].rounds.map(r => r.x * m.V.U));
    const spots = SPOTS === 'test' ? L.testSpots(m, scene) : L.walkSpots(m, scene);
    for (const kx of spots) {
      const byKey = new Map();
      for (const d of sets) {
        const pl = L.planFor(m, scene, kx, d);
        inputs.push({ scene, kx, set: L.setName(d), x: pl ? pl.x : null, side: pl ? pl.side : null, hit: pl ? pl.hit : null, shot: pl ? !!pl.shot : null });
        if (!pl) continue;
        const k = [pl.x, pl.side, pl.hit, pl.q, pl.burrow].join('|');
        if (!byKey.has(k)) byKey.set(k, { pl, sets: [] });
        byKey.get(k).sets.push(L.setName(d));
      }
      for (const { pl, sets: ss } of byKey.values()) {
        const base = { cfg: cfg.key, weapon: cfg.weapon, build: cfg.build, pack: cfg.pack, scene, kx, stop: stops.has(kx), x: pl.x, side: pl.side, hit: pl.hit, q: pl.q, sets: ss };
        plans.push(Object.assign(base, pl.shot ? measureShot(m, kx, pl) : measurePlan(m, kx, pl, fb, STEP)));
      }
    }
  }
  return { cfg, ms: Date.now() - t0, plans, inputs };
}

/* The crossbow never strikes: the knight's whole drawing every 8 ms through the event (and at the
   shot, the hit and 80 ms after), its weapon's pixels against the goblin's, which should never
   touch; the nearest it comes at the shot, the hit and 80 ms after. */
function measureShot(m, kx0, pl) {
  let most = 0, worst = null, n = 0, near = Infinity;
  const S = m.F.FOE.shot, times = [];
  for (let el = 0; el < pl.hit + pl.exit.gone; el += 8) times.push(el);
  times.push(S.fire, pl.hit, pl.hit + 80);
  for (const el of times) {
    const g = L.goblinAt(m, pl, el); if (!g) continue;
    const o = L.pose(m, kx0, el); m.F.shot(o, el, pl, 0);
    const wp = L.rasterFills(m.drawKnight(o), 'weapon'), ov = L.overlap(wp, g);
    n++;
    if (ov && ov.n > most) { most = ov.n; worst = { el, n: ov.n, depth: ov.depth }; }
    if (el === S.fire || el === pl.hit || el === pl.hit + 80) near = Math.min(near, L.gapBetween(wp, g).gap);
  }
  return { shot: true, samples: n, overlapPx: most, worstShot: worst, nearest: near };
}

/* A main item of the base pack with a blade, that no weapon of the sweep holds. */
function missing() {
  const have = new Set(Object.values(L.ITEM_OF));
  return Object.keys(L.BASE.items).filter(k => k.startsWith('main.') && L.BASE.items[k].blade && !have.has(k));
}

function summarise(results) {
  const lines = [];
  for (const r of results) {
    const ps = r.plans, sw = ps.filter(p => !p.shot), sh = ps.filter(p => p.shot), secs = `(${(r.ms / 1000).toFixed(1)} s)`;
    if (!sw.length) { lines.push(`${r.cfg.key.padEnd(10)} ${String(sh.length).padStart(4)} plans by shot  touching: ${sh.filter(p => p.overlapPx > 0).length}  nearest ${Math.min(...sh.map(p => p.nearest)).toFixed(1)} px  ${secs}`); continue; }
    const deep = sw.filter(p => p.over2), gapF = sw.filter(p => p.gap > 3), wd = Math.max(0, ...sw.map(p => (p.worst ? p.worst.depth : 0))), wg = Math.max(...sw.map(p => p.gap));
    lines.push(`${r.cfg.key.padEnd(10)} ${String(sw.length).padStart(4)} plans  depth>2: ${String(deep.length).padStart(4)} (worst ${wd.toFixed(1)} px)  gap>3 at hit: ${String(gapF.length).padStart(4)} (worst ${wg.toFixed(1)} px)  ${secs}`);
  }
  // the hits across builds, against Classic's for the same spot and devices
  const byW = {}, timing = [];
  for (const r of results) if (r.cfg.pack) (byW[r.cfg.weapon] = byW[r.cfg.weapon] || {})[r.cfg.build] = r;
  for (const [w, bs] of Object.entries(byW)) {
    if (!bs.a) continue;
    const tol = w === 'mace' ? 16 : 12, A = new Map(bs.a.inputs.map(i => [i.scene + '|' + i.kx + '|' + i.set, i]));
    let most = 0;
    for (const b of ['b', 'c']) if (bs[b]) for (const i of bs[b].inputs) {
      const a = A.get(i.scene + '|' + i.kx + '|' + i.set); if (!a) continue;
      if (a.x !== i.x || a.side !== i.side) timing.push({ weapon: w, build: b, scene: i.scene, kx: i.kx, set: i.set, kind: 'spot', a: [a.x, a.side], b: [i.x, i.side] });
      else if (a.hit !== null) {
        most = Math.max(most, Math.abs(a.hit - i.hit));
        if (Math.abs(a.hit - i.hit) > tol) timing.push({ weapon: w, build: b, scene: i.scene, kx: i.kx, set: i.set, kind: 'hit', a: a.hit, b: i.hit });
      }
    }
    lines.push(`timing ${w.padEnd(9)} largest |hit - Classic| ${most} ms (limit ${tol}), breaches ${timing.filter(t => t.weapon === w).length}`);
  }
  return { lines, timing };
}

if (args.worker) {
  process.on('message', cfg => { const r = runConfig(cfg); process.send(r, () => process.exit(0)); });
} else {
  const t0 = Date.now(), cfgs = configs(), results = [], out = path.resolve(args.out);
  let next = 0, live = 0;
  const done = () => {
    results.sort((a, b) => cfgs.findIndex(c => c.key === a.cfg.key) - cfgs.findIndex(c => c.key === b.cfg.key));
    const { lines, timing } = summarise(results), lost = missing();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ from: FROM, step: STEP, spots: SPOTS, at: new Date().toISOString(), ms: Date.now() - t0, results, timing, missing: lost }));
    console.log(`sweep from ${FROM}, spots ${SPOTS}, step ${STEP} ms: ${results.reduce((n, r) => n + r.plans.length, 0)} plans in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const l of lines) console.log(l);
    for (const k of lost) console.log('missing   ' + k + ': a main item with a blade that the sweep does not hold (add it to ITEMS in tools/contact-sweep/lib.js)');
    const ps = results.flatMap(r => r.plans), failing = ps.filter(p => !p.shot && (p.over2 || p.gap > 3)).length, touching = ps.filter(p => p.shot && p.overlapPx > 0).length;
    const faults = failing + touching + timing.length + lost.length + (results.length < cfgs.length ? 1 : 0);
    console.log(`faults: ${faults} (plans failing depth or gap: ${failing}, crossbow plans touching: ${touching}, timing breaches: ${timing.length}, weapons missing: ${lost.length}${results.length < cfgs.length ? ', runs failed: ' + (cfgs.length - results.length) : ''})`);
    console.log('results: ' + out);
    if (faults) process.exitCode = 1;
  };
  const launch = () => {
    while (live < JOBS && next < cfgs.length) {
      const cfg = cfgs[next++]; live++;
      const ch = fork(__filename, ['--worker', ...argv]);
      ch.on('message', r => { results.push(r); process.stderr.write(`  ${r.cfg.key}: ${r.plans.length} plans, ${(r.ms / 1000).toFixed(1)} s\n`); });
      ch.on('exit', code => {
        live--;
        if (code || !results.some(r => r.cfg.key === cfg.key)) console.error(`${cfg.key} failed (exit ${code})`);
        if (next < cfgs.length) launch(); else if (!live) done();
      });
      ch.send(cfg);
    }
  };
  launch();
}
