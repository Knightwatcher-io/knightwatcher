// Tests for the places of the devices in every scene (docs/page.md, Devices): that
// whatever may stand in a place, up or gone, with its question mark and its pole, is drawn wholly
// on the 960 by 600 grid, which is all a 960-wide display shows, and that no two places' drawings
// overlap. Run with: node --test tests/web/
//
// Each kind is drawn under Node against a fake context that keeps the box every fillRect and every
// drawImage covers, so the boxes are what the page paints, not what a place declares.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../../web');
const SCRIPTS = ['js/draw.js', 'js/sprites.js', 'js/effects.js', 'js/props.js', 'js/knight.js',
  'js/scenes/battlement.js', 'js/scenes/camp.js', 'js/scenes/house.js', 'js/scenes/yard.js', 'js/scenes/cellar.js', 'js/scenes/smithy.js', 'js/scenes/court.js'];

/* The scripts that hold the kinds and the scenes, in a sandbox drawing into a context that grows
   one box, [x0, y0, x1, y1], over everything painted until it is read. Canvases of the fake
   document paint nowhere; a drawImage of one counts its whole size. */
function load() {
  let bb = null;
  const grow = (x0, y0, x1, y1) => { bb = bb ? [Math.min(bb[0], x0), Math.min(bb[1], y0), Math.max(bb[2], x1), Math.max(bb[3], y1)] : [x0, y0, x1, y1]; };
  const ctx = new Proxy({}, {
    set() { return true; },
    get(_, k) {
      if (k === 'fillRect') return (x, y, w, h) => grow(x, y, x + w, y + h);
      if (k === 'drawImage') return (cv, x, y) => grow(x, y, x + cv.width, y + cv.height);
      return () => {};
    },
  });
  const quiet = new Proxy({}, { set() { return true; }, get: () => () => {} });
  const box = vm.createContext({ window: {}, console, document: { createElement: () => ({ width: 0, height: 0, getContext: () => quiet }) } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW;
  KW.draw.setCtx(ctx);
  const take = f => { bb = null; f(); const r = bb; bb = null; return r; };
  return { KW, take };
}

/* The kinds that may stand in a place of each class: the Pi in the pie's place, cameras in the
   high places, and every other device, a kind the page does not know drawn as the box, on the
   ground. */
const KINDS_AT = { pie: ['pi'], high: ['camera'], ground: ['machine', 'vm', 'box'] };
const TIMES = [0, 250, 900, 1700, 2300, 3100];

/* The boxes a place's drawing covers, on the grid: what stands there, every kind it may hold, up
   and gone, still and moving, at several moments, mirrored when the place flips; the pole a high
   place stands on; and the question mark over a gone device that alerts, as the engine draws it. */
function placeBoxes(KW, take, pl) {
  const P = KW.props, out = [];
  const mirror = b => (pl.flip ? [2 * pl.x - b[2], b[1], 2 * pl.x - b[0], b[3]] : b);
  for (const k of KINDS_AT[pl.cls]) {
    let device = null;
    for (const ok of [true, false]) for (const t of TIMES) for (const part of ['still', 'moving']) {
      const b = take(() => P.KINDS[k].draw(pl.x, pl.y, t, ok, part));
      if (b) device = device ? [Math.min(device[0], b[0]), Math.min(device[1], b[1]), Math.max(device[2], b[2]), Math.max(device[3], b[3])] : b;
    }
    out.push({ what: k, box: mirror(device) });
    out.push({ what: k + "'s question mark", box: take(() => KW.sprites.mark(pl.x, pl.y - P.KINDS[k].mark, '?')) });
  }
  // the pole, as the engine draws it: from the foot of the plate, 40 above the base, down to pole
  if (pl.pole) out.push({ what: 'the pole', box: mirror([pl.x + 21, pl.y - 40, pl.x + 34, pl.pole + 1]) });
  return out;
}

test('everything a place may show stands wholly on the 960 by 600 grid, in every scene', () => {
  const { KW, take } = load(), bad = [];
  for (const [name, sc] of Object.entries(KW.scenes)) {
    for (const [p, pl] of Object.entries(sc.places)) {
      for (const { what, box: b } of placeBoxes(KW, take, pl)) {
        if (b[0] < 0 || b[1] < 0 || b[2] > 960 || b[3] > 600) bad.push(`${name} ${p}: ${what} covers ${b.join(', ')}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

/* The one overlap the owner accepted: in the court the lower owl's question mark stands over the
   upper owl while the lower one is down. Between the right pillar's torch, the throne and the cat's
   leap there is no spot for two owls that avoids it. */
const ACCEPTED = ["court: h1 (camera) and h2 (camera's question mark)"];

test('no two places in a scene draw over each other, but the one overlap the owner accepted', () => {
  const { KW, take } = load(), bad = [];
  for (const [name, sc] of Object.entries(KW.scenes)) {
    const boxes = Object.entries(sc.places).map(([p, pl]) => [p, placeBoxes(KW, take, pl)]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      for (const a of boxes[i][1]) for (const b of boxes[j][1]) {
        if (a.box[0] < b.box[2] && b.box[0] < a.box[2] && a.box[1] < b.box[3] && b.box[1] < a.box[3]) bad.push(`${name}: ${boxes[i][0]} (${a.what}) and ${boxes[j][0]} (${b.what})`);
      }
    }
  }
  assert.deepEqual(bad, ACCEPTED);
});

test('a camera\'s question mark is never higher than y 172, clear of the headline', () => {
  const { KW } = load(), mark = KW.props.KINDS.camera.mark;
  for (const [name, sc] of Object.entries(KW.scenes)) {
    for (const [p, pl] of Object.entries(sc.places)) if (pl.cls === 'high') assert.ok(pl.y - mark >= 172, `${name} ${p}: the mark's top at ${pl.y - mark}`);
  }
});
