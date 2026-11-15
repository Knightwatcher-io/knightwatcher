// Tests for the scenes, web/js/scenes/*.js: every scene's paint() and draw() recorded call by call,
// in every state that changes them, at three sizes of screen, and compared with the stored records
// in fixtures/scenes/. Run with: node --test tests/web/
//
// The page's drawing code runs under Node against a fake canvas context that records every call and
// every property it is given, as tests/web/knight.test.js does for the knight. The devices are drawn
// by the engine's own KW.devices, so each scene's places are recorded with what stands in them. A
// canvas painted once and drawn with drawImage (a device's still part, the raspberry, a pose of the
// goblin) is written into the record where it is drawn, each of its calls after a "| ", so the record
// holds every call that reaches the screen. The knight is the knight test's: where a scene calls on
// it (the sleeper's head, the gear at rest, the speech bubble, a swing) the record has one line with
// the call and its arguments. The goblin, the flies and the other props the engine draws over a
// scene are recorded on their own, in fixtures/scenes/cast.json.
//
//   SCENES_LOG=write node --test tests/web/scenes.test.js      stores the records of the code as it is
//   SCENES_LOG=dump:DIR node --test tests/web/scenes.test.js   writes each record in full to DIR
//   SCENES_WEB=DIR node --test tests/web/scenes.test.js        draws a copy of web/ in DIR instead
//
// Store the records only from code whose drawing is known to be right, before a change that should
// not alter it. Each record is stored as its number of calls, a hash of the whole and a hash of each
// block of 1024 calls. When one differs, the test draws the same record from the repository's HEAD
// (git show) and names the first call that differs, with what HEAD drew there and what was drawn;
// without git, or when HEAD's record is not the stored one either, it names the block of calls the
// first difference lies in and prints what was drawn there.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '../..');
const WEB = process.env.SCENES_WEB ? path.resolve(process.env.SCENES_WEB) : path.join(REPO, 'web');
const FIX = path.join(__dirname, 'fixtures/scenes');
const BLOCK = 1024;
const MODE = process.env.SCENES_LOG || '';

/* The scripts index.html loads that the scenes need, in its order: the drawing primitives, the
   sprites, the effects, the props, the knight, the scenes, the state library (for the places of the devices)
   and the engine (for KW.devices). Not the pack library: the knight is drawn from code, and the
   scenes read from it only where its gear rests (KW.knight.rest.blade), which is the same on both
   paths (knight.test.js). */
const NEEDED = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js', 'js/state.js', 'js/engine.js'];

/* The sources of the page's files, read from a folder or, for the reference, from git's HEAD. */
const fromDir = dir => f => fs.readFileSync(path.join(dir, f), 'utf8');
const fromHead = f => execFileSync('git', ['-C', REPO, 'show', 'HEAD:web/' + f], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });

/* The page's scripts, compiled once per source of files. */
function sources(read) {
  const files = [...read('index.html').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
    .filter(s => NEEDED.includes(s) || s.startsWith('js/scenes/'));
  return { scripts: files.map(f => new vm.Script(read(f), { filename: f })), pack: JSON.parse(read('packs/base.pack.json')).pack };
}

/* ---- The recording context -------------------------------------------------------------------
   Writes one line per call into log: "s" for a fillStyle, "a" for a globalAlpha, "r" for a
   fillRect, the name and the value for any other property set, and the name and the arguments for
   any other call. A canvas of the fake document keeps a log of its own, emptied when its size is
   set or it is cleared whole, as a real canvas is; drawing it writes "drawImage canvas WxH" and the
   arguments, then its log, each line after "| ". */
const LOG = Symbol('log');
function context(log, cv) {
  return new Proxy({}, {
    set(_, k, v) { log.push((k === 'fillStyle' ? 's' : k === 'globalAlpha' ? 'a' : String(k)) + ' ' + v); return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => { log.push(`r ${x} ${y} ${w} ${h}`); };
      if (k === 'drawImage') return (img, ...a) => {
        if (!img || !img[LOG]) { log.push(['drawImage', String(img), ...a].join(' ')); return; }
        log.push(['drawImage', `canvas ${img.width}x${img.height}`, ...a].join(' '));
        for (const l of img[LOG]) log.push('| ' + l);
      };
      if (k === 'clearRect' && cv) return (x, y, w, h) => { if (x <= 0 && y <= 0 && x + w >= cv.width && y + h >= cv.height) log.length = 0; log.push(`clearRect ${x} ${y} ${w} ${h}`); };
      return (...a) => { log.push([String(k), ...a].join(' ')); };
    },
  });
}
function canvas() {
  const log = [];
  let w = 300, h = 150;
  const cv = {
    [LOG]: log,
    get width() { return w; }, set width(v) { w = v; log.length = 0; },
    get height() { return h; }, set height(v) { h = v; log.length = 0; },
  };
  const ctx = context(log, cv);
  cv.getContext = () => ctx;
  return cv;
}

/* ---- The sizes of screen ---------------------------------------------------------------------
   The canvas as fit() in main.js cuts it: 960 by 600, the grid itself; 1400 by 600, a wide screen,
   whose edges HL and HR lie 236 pixels outside the grid; and 960 by 720, a 4:3 screen, whose top
   HT lies 122 above it. */
const SIZES = { '960x600': [960, 600], '1400x600': [1400, 600], '960x720': [960, 720] };
function fit(V, [lw, lh]) {
  V.LW = lw; V.LH = lh; V.X0 = Math.floor((lw - V.HW) / 2); V.Y0 = lh - V.HH;
  V.HL = -V.X0 - 16; V.HR = lw - V.X0 + 16; V.HT = -V.Y0 - 2; V.SC = 1;
}

/* A sandbox with the page's scripts, the knight started from code, the view at size, and the
   knight's calls from the scenes written as single lines into log. */
function load(src, size) {
  const box = vm.createContext({ window: {}, document: { createElement: () => canvas() }, console: { info() {}, warn() {}, log() {} } });
  for (const s of src.scripts) { if (box.window.KW) box.KW = box.window.KW; s.runInContext(box); }
  const KW = box.window.KW, K = KW.knight, log = [];
  K.start([], false);
  assert.equal(K.source, 'code');
  fit(KW.view, SIZES[size] || SIZES['960x600']);
  const line = (name, a) => log.push(['knight.' + name, ...a].join(' '));
  K.head = (x, y) => line('head', [x, y]);
  K.speech = (...a) => line('speech', a);
  K.swing = (o, q, dir) => line('swing', [q, dir]);
  K.rest.draw = (...a) => line('rest.draw', a);
  KW.draw.setCtx(context(log));
  return { KW, log };
}

/* ---- The states ------------------------------------------------------------------------------
   Each state is the scene's frame as the engine makes it (engine.js, draw), with fields laid over
   it: id the winning condition (idle when left out), tv, helmet (true on, false off; the scene's
   own when left out), kx the knight's x on the grid (the scene's spot when left out), devices the
   address's dv= list (the Pi alone, gone while pi_silent is up, when left out), mon, skin, hair and
   robe the monarch's, and times the moments drawn.

   The times cover what moves: the flames, the stars and the fireflies at every moment; the smithy's
   hammer strikes at 0 and 1250 and not at the others; the monarch talks from 3200 to 6400, mouth
   open at 3450 and shut at 4700; a gone device's question mark shows at 1250, 2300 and 4700; the
   sparks of the WAN's cut rope at 0 and 2300; the sleeper's blanket rises at 2300 and 3450; the
   yard's dummy is struck at 4700 while the CPU runs hot. */
const TIMES = [0, 1250, 2300, 3450, 4700];
/* The yard's dummy struck by the training swing at 600 and then wobbling, at 0, 100, 250, 500 and
   800 ms after the blow. */
const STRUCK = [600, 700, 850, 1100, 1400];

/* The devices in all seven places, as the address's dv= hook writes them: kinds separated by
   commas, - after one for down and ! for down and alerting. Every place holds a device; the ground
   places hold each of machine and vm in one list or the other. */
const DEVICES = {
  'devices up': 'pi,camera,camera,camera,machine,vm,machine',
  'devices gone': 'pi!,camera!,camera!,camera!,machine!,vm!,machine!',
  'devices up, other kinds': 'pi,camera,camera,camera,vm,machine,vm',
  'devices gone, other kinds, no alert': 'pi-,camera-,camera-,camera-,vm-,machine-,vm-',
};
/* The device down the demo shows, with a kind the page does not know (the box). */
const DEVICE_DOWN = 'pi,camera,camera,machine!,vm,nas';

/* The monarch's skins, hair and robes, from the base pack's skin, hair and tabard swatches, as
   settings.js gives them to the engine. */
function swatches(pack) {
  const sw = pack.swatches, ids = set => Object.keys(sw[set]);
  return {
    skins: ids('skin'), hairs: ids('hair'), robes: ids('tabard'),
    skin: id => ({ id, face: sw.skin[id].entries.face, cheek: sw.skin[id].entries.cheek }),
    hair: id => { const e = sw.hair[id].entries; return { id, bands: [e['0'], e['1'], e['2']], brow: e.brow }; },
    robe: id => { const e = sw.tabard[id].entries; return { id, bands: [e['0'], e['1'], e['2'], e['3']] }; },
  };
}

/* Every state of the scene name, as [label, state]. */
function statesOf(KW, pack, name) {
  const sc = KW.scenes[name], out = [];
  const add = (label, st) => out.push([label, st]);
  add('idle', {});
  // each condition the scene can act out
  for (const id of sc.can || []) add(id, id === 'device_down' ? { id, devices: DEVICE_DOWN } : { id });
  // the helmet the other way from the scene's own
  if (sc.helmet === false) add('helmet on', { helmet: true }); else add('helmet off', { helmet: false });
  // the house's television on while all is quiet; streaming has it on already
  if (name === 'house') add('tv on', { tv: true });
  // the smithy's backdrop follows the knight's spot
  if (name === 'smithy') add('kx 300', { kx: 300 });
  // the yard's dummy struck
  if (name === 'yard') add('dummy struck', { times: STRUCK });
  for (const [label, dv] of Object.entries(DEVICES)) add(label, { devices: dv });
  // the court's monarchs: each in its own colours and in each of the six skins, then a sample of
  // hair and robe (see the comment at the end of this function)
  if (name === 'court') {
    const S = swatches(pack), few = [0, 3450];
    for (const [i, mon] of ['a', 'b', 'c'].entries()) {
      if (mon !== 'a') add(`monarch ${mon}`, { mon, times: few });
      for (const sk of S.skins) add(`monarch ${mon}, ${sk} skin`, { mon, skin: S.skin(sk), times: few });
      add(`monarch ${mon}, ${S.hairs[2 * i]} hair`, { mon, hair: S.hair(S.hairs[2 * i]), times: few });
      add(`monarch ${mon}, ${S.robes[2 * i + 1]} robe`, { mon, robe: S.robe(S.robes[2 * i + 1]), times: few });
      for (const [j, hr] of S.hairs.entries()) {
        const sk = S.skins[(j + i) % 6], rb = S.robes[(j + 2 * i + 1) % 6];
        add(`monarch ${mon}, ${sk} skin, ${hr} hair, ${rb} robe`, { mon, skin: S.skin(sk), hair: S.hair(hr), robe: S.robe(rb), times: few });
      }
    }
    /* The sample: each monarch in each hair colour, each with a robe and a skin turned so that every
       monarch meets every hair, every robe and every skin, and light hair meets dark skin, where
       the brows change colour (hairOf in court.js); and each with a hair alone and a robe alone, on
       the court's own skin. The hair and the robe are laid over the monarch independently of each
       other, and only the brows read the skin, so every hair, robe and skin drawn on every monarch
       stands for the whole product of them on it, which settings.test.js draws. */
  }
  return out;
}

/* The frame s for the state st at time t, as the engine makes it. */
function frame(KW, name, st, t) {
  const sc = KW.scenes[name], K = KW.knight, V = KW.view, ST = KW.state;
  const id = st.id || 'idle', k = ST.CONDITIONS[id];
  const w = k ? { id, lv: k.lv, st: ST.LEVELS[k.level], scene: k.scene, hl: '', sub: '' } : ST.IDLE;
  const list = st.devices ? ST.listFromHook(st.devices) : [{ kind: 'pi', state: id === 'pi_silent' ? 'down' : 'up', alert: true }];
  const inBed = !!sc.bed && (id === 'night' || id === 'container_unhealthy');
  const o = K.pose(id, t); o.floor = V.HFL;
  o.helmet = st.helmet === undefined ? sc.helmet !== false : st.helmet;
  if (sc.sword === false) o.sword = false;
  // where the knight stands in the scene's rounds: at the first spot, arrived at time 0, while free
  // to stroll
  const free = (w.lv < 3 || id === 'memory_tight' || id === 'disk_full') && !inBed && w.lv !== 2 && id !== 'backup_overdue' && id !== 'pi_silent';
  const here = sc.rounds && free ? { act: sc.rounds[0].act, el: t } : null;
  const kx = st.kx === undefined ? sc.spot * V.U : st.kx;
  o.x = kx;
  return { w, devices: ST.arrange(list).devices, places: sc.places || null, tv: st.tv === undefined ? id === 'streaming' : st.tv, kx, o, here, inBed,
    helmOff: inBed || o.helmet === false, strike: false, mon: st.mon || 'a', monSkin: st.skin || null, monHair: st.hair || null, monRobe: st.robe || null };
}

/* What a scene's act and draw changed in the frame: one line for each field of the knight's pose
   and for strike. */
function changes(before, s, log, tag) {
  for (const k of Object.keys(s.o)) { const v = JSON.stringify(s.o[k]); if (v !== before.o[k]) log.push(`${tag} o.${k} ${v}`); }
  if (s.strike !== before.strike) log.push(`${tag} strike ${s.strike}`);
}
const snap = s => ({ o: Object.fromEntries(Object.keys(s.o).map(k => [k, JSON.stringify(s.o[k])])), strike: s.strike });

/* The places in front of the knight, which the engine draws after it, as places that the scene's
   draw would reach: the same places with front taken off, and only those. */
const frontOnly = places => Object.fromEntries(Object.entries(places || {}).filter(([, p]) => p.front).map(([n, p]) => [n, Object.assign({}, p, { front: false })]));

/* The records of the scene name in the state st at size, each as [name, lines]: the backdrop
   painted, and the scene drawn at each time. A drawn record holds, in order, what act changed,
   draw's calls, what draw changed, "over" and over's calls when the scene has one, and "front" and
   the devices in front of the knight. Each state is drawn in a sandbox of its own, so that nothing
   one state leaves behind (the yard keeps the time of the last blow) reaches another. */
function records(src, name, label, st, size) {
  const { KW, log } = load(src, size), sc = KW.scenes[name], out = [];
  const take = () => { const l = log.slice(); log.length = 0; return l; };
  if (sc.paint) { sc.paint(frame(KW, name, st, 0)); out.push([`${label} @${size}: paint`, take()]); }
  for (const t of st.times || TIMES) {
    const s = frame(KW, name, st, t);
    let before = snap(s);
    if (sc.act) { sc.act(t, s); changes(before, s, log, 'act'); before = snap(s); }
    sc.draw(t, s); changes(before, s, log, 'draw');
    if (sc.over) { log.push('over'); sc.over(t, s); }
    log.push('front'); KW.devices.draw(t, Object.assign({}, s, { places: frontOnly(s.places) }));
    out.push([`${label} @${size}: draw t${t}`, take()]);
  }
  return out;
}

/* Every record of the scene name, in order: by size, then by state. */
function sceneRecords(src, name) {
  const { KW } = load(src), out = [];
  for (const size of Object.keys(SIZES)) for (const [label, st] of statesOf(KW, src.pack, name)) out.push(...records(src, name, label, st, size));
  return out;
}

/* The goblin, the flies and the other props the engine draws over a scene, on their own: they draw
   alike at every size. */
function castRecords(src) {
  const { KW, log } = load(src), P = KW.props, ctx = KW.draw.getCtx(), out = [];
  const rec = (name, f) => { f(); out.push([name, log.slice()]); log.length = 0; };
  for (const flap of [0, 1]) rec(`fly flap ${flap}`, () => P.flyHD(300, 200, flap));
  rec('fly struck', () => P.poofHD(300, 200));
  for (const pose of P.FOES.goblin.poses) rec(`goblin ${pose}`, () => ctx.drawImage(P.FOES.goblin.pose(pose), 0, 0));
  for (const k of [0.4, 1]) rec(`hole open ${k}`, () => P.holeHD(400, 530, k));
  for (const el of [120, 360]) rec(`clods el${el}`, () => P.clodsHD(400, 530, el));
  for (const el of [40, 300, 800]) rec(`cloud el${el}`, () => P.cloudHD(400, 452, el, P.FOES.goblin.h));
  for (const el of [120, 450, 800]) rec(`sparkles el${el}`, () => P.sparklesHD(400, 452, el, P.FOES.goblin.h));
  rec('crate', () => P.crateHD(300, 400));
  rec('chute', () => P.chuteHD(330, 400));
  return out;
}

/* ---- Storing and comparing -------------------------------------------------------------------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += BLOCK) out.push(sha(lines.slice(i, i + BLOCK).join('\n')).slice(0, 8));
  return out.join(' ');
}
/* The groups of records, each stored in a file of its own: one per scene, and the cast. */
function groups(src) {
  const { KW } = load(src);
  return [...Object.keys(KW.scenes).map(n => [n, () => sceneRecords(src, n)]), ['cast', () => castRecords(src)]];
}
/* A group's file: each distinct record once, by the first 16 characters of its hash, with its
   number of calls and the hashes of its blocks; and each record's name with the hash of its calls. */
function stored(recs) {
  const distinct = {}, names = {};
  for (const [name, lines] of recs) {
    const h = sha(lines.join('\n')).slice(0, 16);
    names[name] = h;
    if (!distinct[h]) distinct[h] = { calls: lines.length, blocks: blocks(lines) };
  }
  return { block: BLOCK, distinct, records: names };
}
function fileText(st) {
  const rows = o => Object.entries(o).map(([k, v]) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n');
  return `{\n  "block": ${st.block},\n  "records": {\n${rows(st.records)}\n  },\n  "distinct": {\n${rows(st.distinct)}\n  }\n}\n`;
}

/* How a record differs from the stored one, in words: the first call that differs, named against
   HEAD's record when HEAD draws the stored one, otherwise the block it lies in. */
let headSrc;
function explain(group, name, lines, want, file) {
  const where = group === 'cast' ? `cast, ${name}` : `${group}, ${name.replace(/ @(\S+): /, ', $1, ')}`;
  if (headSrc === undefined) { try { headSrc = sources(fromHead); } catch (e) { headSrc = null; } }
  let ref = null;
  if (headSrc) { try { ref = (group === 'cast' ? castRecords(headSrc) : sceneRecords(headSrc, group)).find(([n]) => n === name); } catch (e) { ref = null; } }
  if (ref && sha(ref[1].join('\n')).slice(0, 16) === file.records[name]) {
    const exp = ref[1];
    let i = 0; while (i < Math.max(exp.length, lines.length) && exp[i] === lines[i]) i++;
    return `${where}: ${lines.length} calls drawn against ${exp.length} stored. The first difference is call ${i}: expected ` +
      `${JSON.stringify(exp[i])} (as HEAD draws it), got ${JSON.stringify(lines[i])}`;
  }
  const got = blocks(lines).split(' '), exp = want.blocks.split(' ');
  let b = 0; while (b < got.length && got[b] === exp[b]) b++;
  const at = b * BLOCK, to = Math.min(lines.length, at + BLOCK);
  return `${where}: ${lines.length} calls drawn against ${want.calls} stored. The first difference lies in calls ${at} to ${to - 1} ` +
    `(HEAD could not be drawn, or does not draw the stored record, so the exact call is not named; compare SCENES_LOG=dump: folders), which are now:\n` + lines.slice(at, to).join('\n');
}

const SRC = sources(fromDir(WEB));

if (MODE === 'write') {
  test('stores the records of the scenes as drawn now', () => {
    fs.mkdirSync(FIX, { recursive: true });
    for (const [group, make] of groups(SRC)) fs.writeFileSync(path.join(FIX, group + '.json'), fileText(stored(make())));
  });
} else if (MODE.startsWith('dump:')) {
  test('dumps every record in full', () => {
    const dir = MODE.slice(5);
    for (const [group, make] of groups(SRC)) {
      fs.mkdirSync(path.join(dir, group), { recursive: true });
      for (const [name, lines] of make()) fs.writeFileSync(path.join(dir, group, name.replace(/[^\w.@-]+/g, '_') + '.log'), lines.join('\n') + '\n');
    }
  });
} else {
  for (const [group, make] of groups(SRC)) {
    const file = JSON.parse(fs.readFileSync(path.join(FIX, group + '.json'), 'utf8'));
    test(`${group}: every record draws the stored calls, call for call`, () => {
      assert.equal(file.block, BLOCK);
      const drawn = make();
      assert.deepEqual(drawn.map(([n]) => n), Object.keys(file.records), `${group}: the records drawn are the ones stored`);
      const bad = drawn.filter(([name, lines]) => sha(lines.join('\n')).slice(0, 16) !== file.records[name]);
      if (bad.length) {
        const [name, lines] = bad[0];
        assert.fail(`${bad.length} of ${drawn.length} records differ. ` + explain(group, name, lines, file.distinct[file.records[name]], file));
      }
    });
  }

  test('the states cover what the brief of the conversion asks', () => {
    const { KW } = load(SRC), names = n => statesOf(KW, SRC.pack, n).map(([l]) => l);
    // every condition each scene can act out, and its idle
    for (const n of Object.keys(KW.scenes)) for (const id of ['idle', ...KW.scenes[n].can]) assert.ok(names(n).includes(id), `${n}: ${id}`);
    assert.ok(names('house').includes('tv on') && names('house').includes('helmet on'));
    assert.ok(names('battlement').includes('wan_down') && names('house').includes('night') && names('house').includes('container_unhealthy'));
    assert.ok(names('yard').includes('dummy struck'));
    // each monarch in each skin
    for (const mon of ['a', 'b', 'c']) for (const sk of swatches(SRC.pack).skins) assert.ok(names('court').includes(`monarch ${mon}, ${sk} skin`));
    // the devices fill every place in every scene
    for (const n of Object.keys(KW.scenes)) {
      for (const dv of Object.values(DEVICES)) {
        const places = KW.state.arrange(KW.state.listFromHook(dv)).devices.map(d => d.place).sort().join(' ');
        assert.equal(places, Object.keys(KW.scenes[n].places).sort().join(' '), `${n}: ${dv}`);
      }
    }
  });
}
