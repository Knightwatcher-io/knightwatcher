#!/usr/bin/env node
/* Writes the test world, test.orbit ("Orbit"), into test.orbit.pack.json beside this file, and
   checks that the file is what it writes. A small world made unlike the medieval one, so that
   anything the engine still assumes about the medieval world shows: a robot body at the ends of
   every measurement's range in an outfit of flat panels in every slot but the shield's (its pry
   bar takes both hands), three scenes (Deck, Bridge, Airlock), its own cast (the Captain, Glitch,
   the Spark moth and a hover drone that catches them), a prop set that draws three kinds of
   device, its words and an overlay. It is read only by the tests, on dev terms: it is never signed
   and never copied into web/. It also writes a copy of format 1.2, test.orbit-fire.pack.json, with
   weapons and a foe that fire (below). docs/tests.md says more.

     node tests/web/fixtures/worlds/orbit.js           writes the files
     node tests/web/fixtures/worlds/orbit.js --check   exits 1 when either file differs

   The outfit is the base pack's gear in flat colours: each item's shapes kept, every colour but
   the outline and the user's own sets turned to one flat colour per slot. The art is flat colour
   and clear shapes, enough to tell the parts apart. require() gives { build, text, broken, fired,
   fireText }: fired() and fireText() are the 1.2 copy, and broken() is a copy with a second
   preset, "Orbit (broken)", whose quiet scene cannot act a device going down, which the pack
   library refuses at rules. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, 'test.orbit.pack.json');
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../web/packs/base.pack.json'), 'utf8')).pack;
const ID = 'test.orbit';
const clone = v => JSON.parse(JSON.stringify(v));

/* ---- Colours ---------------------------------------------------------------------------------- */
const K = '@base.k';
const HULL = '#2b3550', HULL2 = '#36425f', PANEL = '#46557a', TRIM = '#8a9bc4', FLOOR = '#1d2333', SPACE = '#05060f', GLOW = '#7af0ff';
const WARN = '#ff5c4a', AMBER = '#ffc04a', LIME = '#a8ff5c', VIOLET = '#9a6bff', WHITE = '#eef3ff', CREAM = '#ffe9b8';

/* ---- Pixel drawings, for the drone's poses ------------------------------------------------------
   A grid of w by h cells, '.' clear and a key letter elsewhere, drawn with rects and ellipses, then
   trimmed and written as pix shapes of at most 64 by 64 from the feet. */
function grid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  return {
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) put(x + i, y + j, c); return this; },
    ell(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(x, y, c);
      }
      return this;
    },
    shapes(key, feet) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] !== '.') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const out = [];
      for (let ty = y0; ty <= y1; ty += 64) for (let tx = x0; tx <= x1; tx += 64) {
        const rows = [];
        for (let y = ty; y <= Math.min(y1, ty + 63); y++) rows.push(g[y].slice(tx, Math.min(x1, tx + 63) + 1).join(''));
        if (rows.every(r => /^\.*$/.test(r))) continue;
        const used = {};
        for (const r of rows) for (const ch of r) if (ch !== '.') used[ch] = key[ch];
        out.push({ k: 'pix', p: [tx - feet[0], ty - feet[1]], key: used, rows });
      }
      return out;
    }
  };
}

/* The hover drone: a round hull on a rotor mast, a lens that looks the way it faces (right), and a
   claw beneath that closes on a moth. Facing right, its feet at FEET of a sprite of SPRITE. */
const SPRITE = [96, 84], FEET = [48, 78];
const DRONE_KEY = { a: K, b: '#c8d2e8', c: '#7d8bb0', d: GLOW, e: '#20283c', f: AMBER, g: LIME, h: '#5a6788' };
function drone(o) {
  const g = grid(SPRITE[0], SPRITE[1]), y = o.y, dx = o.dx || 0, cx = 48 + dx;
  // rotor: a mast and blades, wide or narrow by frame, flat when landed
  g.rect(cx - 1, y - 22, 3, 8, 'a');
  if (o.rotor === 'flat') g.rect(cx - 18, y - 24, 36, 3, 'a').rect(cx - 17, y - 23, 34, 1, 'h');
  else if (o.rotor === 'wide') g.rect(cx - 28, y - 25, 56, 4, 'a').rect(cx - 27, y - 24, 54, 2, 'c');
  else g.rect(cx - 12, y - 25, 24, 4, 'a').rect(cx - 11, y - 24, 22, 2, 'c');
  // hull
  g.ell(cx, y, 22, 14, 'a').ell(cx, y, 20, 12, 'b').rect(cx - 20, y + 2, 40, 6, 'c').ell(cx, y + 2, 20, 6, 'c').ell(cx, y - 1, 20, 9, 'b');
  // the beacon on top
  g.rect(cx - 3, y - 15, 6, 3, 'a').rect(cx - 2, y - 14, 4, 2, o.happy ? 'g' : 'f');
  // the lens: open, half shut or a happy arc
  g.ell(cx + 9, y - 1, 7, 7, 'a').ell(cx + 9, y - 1, 5, 5, 'e');
  if (o.eye === 'half') g.rect(cx + 5, y - 2, 9, 2, 'd');
  else if (o.eye === 'happy') g.rect(cx + 5, y - 3, 3, 2, 'd').rect(cx + 8, y - 4, 3, 2, 'd').rect(cx + 11, y - 3, 3, 2, 'd');
  else g.ell(cx + 10, y - 1, 3, 3, 'd');
  // the claw: closed under the hull, or reaching forward and open
  if (o.claw === 'reach') g.rect(cx + 14, y + 8, 14, 3, 'a').rect(cx + 26, y + 3, 3, 6, 'a').rect(cx + 26, y + 10, 3, 6, 'a').rect(cx + 15, y + 9, 12, 1, 'h');
  else if (o.claw === 'held') g.rect(cx + 14, y + 8, 12, 3, 'a').rect(cx + 24, y + 6, 5, 7, 'a').rect(cx + 25, y + 7, 3, 5, 'f');
  else g.rect(cx - 2, y + 12, 5, 6, 'a').rect(cx - 6, y + 16, 13, 3, 'a');
  // skids when landed
  if (o.landed) g.rect(cx - 18, 76, 36, 3, 'a').rect(cx - 14, y + 12, 3, 76 - y - 12, 'a').rect(cx + 11, y + 12, 3, 76 - y - 12, 'a');
  return g.shapes(DRONE_KEY, FEET);
}
const DRONE_POSES = {
  rest: { y: 60, rotor: 'flat', eye: 'half', landed: true },
  settle: { y: 60, rotor: 'flat', eye: 'half', landed: true, happy: true },
  alert0: { y: 46, rotor: 'wide', eye: 'open' },
  alert1: { y: 45, rotor: 'narrow', eye: 'open' },
  stalk0: { y: 50, rotor: 'wide', eye: 'open', dx: 2 },
  stalk1: { y: 50, rotor: 'narrow', eye: 'open', dx: 2 },
  pounce: { y: 40, rotor: 'wide', eye: 'open', claw: 'reach', dx: -4 },
  land: { y: 48, rotor: 'narrow', eye: 'open', claw: 'held' },
  pleased: { y: 46, rotor: 'wide', eye: 'happy', claw: 'held', happy: true },
  walk0: { y: 48, rotor: 'wide', eye: 'open' },
  walk1: { y: 47, rotor: 'narrow', eye: 'open' }
};

/* ---- The outfit: the base pack's gear in flat panels ------------------------------------------ */
/* Each colour of a shape's fill or a pix key: the outline and the user's sets stay (a band of a
   user's set becoming its middle entry), every other colour the slot's flat colour. */
function flat(v, panel) {
  const one = c => {
    if (typeof c !== 'string') return panel;
    if (c === K || c.startsWith('@skin.')) return c;
    const m = /^@(tabard|plume|hair)\./.exec(c);
    if (m) return '@' + m[1] + '.1';
    return panel;
  };
  const fillOf = f => (Array.isArray(f) ? (f.every(b => typeof b[1] === 'string' && b[1].startsWith('@skin.')) ? f : one(f[Math.floor(f.length / 2)][1])) : one(f));
  const walk = x => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    if (typeof x.k === 'string' && Object.prototype.hasOwnProperty.call(x, 'fill')) x.fill = fillOf(x.fill);
    if (x.k === 'pix' && x.key) for (const ch of Object.keys(x.key)) x.key[ch] = one(x.key[ch]);
    for (const k of Object.keys(x)) if (k !== 'fill' && k !== 'key') walk(x[k]);
  };
  walk(v);
  return v;
}
const OUTFIT = [
  ['legs', 'legs.panel', 'Leg panels', 'legs.plate', '#5d6f99'],
  ['boots', 'boots.panel', 'Foot pads', 'boots.shoes', '#3e4a6b'],
  ['torso', 'torso.panel', 'Chest panel', 'torso.cuirass', '#7186b8'],
  ['hair', 'hair.wire', 'Wire tuft', 'hair.close', '#9aa7c7'],
  ['plume', 'plume.aerial', 'Aerial', 'plume.crest', '#c0c8de'],
  ['helmet', 'helm.dome', 'Dome', 'helm.open', '#8ea2d2'],
  ['pauldrons', 'pauldrons.panel', 'Shoulder panels', 'pauldrons.plate', '#6a7fae'],
  ['arms', 'arms.panel', 'Arm panels', 'arms.plate', '#7a8cb6'],
  ['gauntlets', 'gauntlets.panel', 'Grippers', 'gauntlets.plate', '#566791'],
  ['main', 'main.bar', 'Pry bar', 'main.greatsword', '#b8c3dc'],
  ['back', 'back.panel', 'Back panel', 'back.cape', '#4f6392']
];
function outfit() {
  const items = {};
  for (const [slot, id, name, from, panel] of OUTFIT) {
    const it = flat(clone(BASE.items[from]), panel);
    if (it.slot !== slot) throw new Error(from + ' is not for the ' + slot + ' slot');
    it.name = name;
    items[id] = it;
  }
  // the box head: the base pack's plain head with square corners, bolts for ears, in chrome
  const head = clone(BASE.items['head.plain']), sh = head.parts[0].shapes;
  head.name = 'Box head';
  sh[0] = { k: 'rect', p: [-62, -6], w: 10, h: 20, fill: K }; sh[1] = { k: 'rect', p: [-60, -4], w: 6, h: 16, fill: TRIM };
  sh[2] = { k: 'rect', p: [52, -6], w: 10, h: 20, fill: K }; sh[3] = { k: 'rect', p: [54, -4], w: 6, h: 16, fill: TRIM };
  sh[4].r = 8; sh[5].r = 6;
  items['head.unit'] = head;
  return items;
}

/* ---- Places ------------------------------------------------------------------------------------ */
function places(o) {
  const at = (cls, kind, x, y, extra) => Object.assign({ cls, kind, x, y, w: cls === 'ground' ? 132 : 88, h: 112 }, extra || {});
  return {
    pie: at('pie', 'surface', o.pie[0], o.pie[1]),
    h1: at('high', 'hang', o.h[0], 300, { flip: true }), h2: at('high', 'hang', o.h[1], 300, { flip: true }), h3: at('high', 'hang', o.h[2], 300, { flip: true }),
    g1: at('ground', 'floor', o.g[0], 594, { front: true }), g2: at('ground', 'floor', o.g[1], 594, { front: true }), g3: at('ground', 'floor', o.g[2], 594, { front: true })
  };
}

/* The hull common to every scene: the wall from edge to edge, a floor and its trim. */
const L = { L: 1 }, W = { W: 1 }, T = { T: 1 };
function hull(floorAt) {
  return [
    { k: 'rect', p: [L, T], w: W, h: { c: floorAt, T: -1 }, fill: HULL },
    { k: 'rect', p: [L, floorAt], w: W, h: 600 - floorAt + 2, fill: FLOOR },
    { k: 'rect', p: [L, floorAt], w: W, h: 4, fill: TRIM },
    { k: 'tile', step: 64, phase: 0, from: L, to: { R: 1 }, shapes: [{ k: 'rect', p: [{ x: 1 }, floorAt + 4], w: 2, h: 66, fill: HULL2 }] }
  ];
}

/* ---- Deck: the quiet scene, which can act every condition but ssh_session and updating -------- */
function deck() {
  const still = hull(530).concat([
    // a long window on space, with its stars
    { k: 'rect', p: [L, 60], w: W, h: 150, fill: K },
    { k: 'rect', p: [L, 66], w: W, h: 138, fill: SPACE },
    { k: 'fx', fx: 'stars', p: [L, 66], w: W, h: 138, n: 120, seed: 7 },
    { k: 'ell', p: [600, 160], rx: 38, ry: 38, fill: '#2a6b8f' }, { k: 'ell', p: [590, 150], rx: 30, ry: 30, fill: '#4fa0c8' },
    { k: 'tile', step: 160, phase: 0, from: L, to: { R: 1 }, shapes: [{ k: 'rect', p: [{ x: 1 }, 60], w: 8, h: 150, fill: K }, { k: 'rect', p: [{ x: 1, c: 2 }, 62], w: 4, h: 146, fill: TRIM }] },
    // the wall's panels, from edge to edge in eight bands each, the heaviest part of the backdrop
    { k: 'tile', step: 38, phase: 0, from: L, to: { R: 1 }, shapes: [
      { k: 'rrect', p: [{ x: 1, c: 3 }, 222], w: 32, h: 296, r: 4,
        fill: [[0.125, PANEL], [0.25, HULL2], [0.375, PANEL], [0.5, HULL2], [0.625, PANEL], [0.75, HULL2], [0.875, PANEL], [1, HULL2]] }] },
    // the bunk on the left, its frame and mattress
    { k: 'rect', p: [16, 384], w: 240, h: 80, fill: K }, { k: 'rect', p: [20, 388], w: 232, h: 72, fill: '#3a4a74' },
    { k: 'rect', p: [24, 400], w: 224, h: 22, fill: '#c9d3ea' }, { k: 'rect', p: [24, 400], w: 50, h: 22, fill: WHITE },
    // the wall panel, dark while the screen is off
    { k: 'rect', p: [556, 236], w: 148, h: 96, fill: K }, { k: 'rect', p: [562, 242], w: 136, h: 84, fill: '#10141f' },
    // the counter the pie stands on
    { k: 'rect', p: [616, 517], w: 120, h: 14, fill: K }, { k: 'rect', p: [620, 519], w: 112, h: 10, fill: TRIM },
    // shelves for the high places
    { k: 'rect', p: [32, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [180, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [878, 300], w: 96, h: 6, fill: TRIM }
  ]);
  return {
    name: 'Deck', spot: 100,
    rounds: [{ x: 100, act: 'look', dur: 20 }, { x: 116, act: 'sniff', dur: 16 }, { x: 92, act: 'yawn', dur: 12 }],
    quiet: true,
    can: ['attack', 'wan_down', 'container_unhealthy', 'disk_full', 'backup_overdue', 'pi_silent', 'device_down', 'cpu_hot', 'memory_tight', 'streaming', 'night'],
    hosts: ['flies', 'crate', 'feast', 'foe'],
    helmet: 'on', weapon: 'held',
    still: [
      { shapes: still },
      // the link down: the window's lights red, a stripe across it
      { when: ['cond:wan_down'], shapes: [{ k: 'rect', p: [L, 128], w: W, h: 10, fill: WARN }, { k: 'rect', p: [300, 120], w: 120, h: 26, fill: WARN }, { k: 'rect', p: [306, 126], w: 108, h: 14, fill: K }] }
    ],
    moving: [
      // the window's lights, the dust falling and the beacon's glow
      { shapes: [
        { k: 'fx', fx: 'twinkle', p: [L, 70], w: W, h: 130, n: 18, colour: GLOW },
        { k: 'fx', fx: 'drift', p: [480, 220], n: 6, gap: 40, period: 5200, rise: -260, size: 2, colour: '#b9c6ea' },
        { k: 'glow', p: [600, 160], r: 90, colour: GLOW, a: { c: 0.06, wave: [0.02, 400, 0] } },
        { k: 'things' }
      ] },
      // the wall panel while the screen is on: a picture that changes every 500 ms
      { when: ['tv'], groups: { panel: { pivot: [630, 284] }, bars: { pivot: [630, 284] } },
        anim: { ms: true, period: 1000, loop: true, tracks: [{ g: 'bars', ch: 'show', keys: [[0, 1], [500, 0]] }] },
        shapes: [
          { k: 'rect', g: 'panel', p: [562, 242], w: 136, h: 84, fill: '#1a4d6b' },
          { k: 'rect', g: 'panel', p: [574, 254], w: 48, h: 60, fill: GLOW },
          { k: 'rect', g: 'bars', p: [632, 262], w: 54, h: 6, fill: LIME }, { k: 'rect', g: 'bars', p: [632, 278], w: 40, h: 6, fill: LIME },
          { k: 'glow', g: 'panel', p: [630, 284], r: 80, colour: GLOW, a: 0.08 }
        ] },
      // in the bunk: the sleeper's head and the blanket over it
      { when: ['inBed'], groups: { blanket: { pivot: [150, 420] } }, shapes: [
        { k: 'sleeper' },
        { k: 'rect', g: 'blanket', p: [96, 410], w: 156, h: 50, fill: K }, { k: 'rect', g: 'blanket', p: [98, 412], w: 152, h: 46, fill: VIOLET }
      ] }
    ],
    over: [],
    things: places({ pie: [674, 517], h: [80, 228, 926], g: [70, 218, 904] }),
    bed: { head: [36, 352], blanket: 'blanket', zeds: [150, 330] },
    screen: { group: 'panel' },
    foe: { side: -1, spans: [[300, 470]] },
    crate: { span: [298, 436] },
    sound: { hum: 'reserved', level: [1, 2, 3] },
    companion: { stands: [480, 530], junk: true }
  };
}

/* ---- Bridge: the Captain's seat, and the workbench the watcher updates at ---------------------- */
function bridge() {
  const still = hull(530).concat([
    // the forward screen
    { k: 'rect', p: [180, 70], w: 600, h: 180, fill: K }, { k: 'rect', p: [186, 76], w: 588, h: 168, fill: SPACE },
    { k: 'fx', fx: 'stars', p: [186, 76], w: 588, h: 168, n: 80, seed: 3 },
    // consoles along the wall
    { k: 'tile', step: 120, phase: 20, from: L, to: { R: 1 }, shapes: [
      { k: 'rrect', p: [{ x: 1 }, 400], w: 100, h: 60, r: 6, fill: K }, { k: 'rrect', p: [{ x: 1, c: 4 }, 404], w: 92, h: 52, r: 4, fill: PANEL },
      { k: 'rect', p: [{ x: 1, c: 14 }, 414], w: 20, h: 8, fill: { rgb: '#7af0ff', a: 0.6 } }] },
    // the workbench
    { k: 'rect', p: [440, 432], w: 200, h: 14, fill: K }, { k: 'rect', p: [444, 434], w: 192, h: 10, fill: TRIM },
    { k: 'rect', p: [460, 446], w: 12, h: 84, fill: K }, { k: 'rect', p: [608, 446], w: 12, h: 84, fill: K },
    // the Captain's chair, and the Captain in it
    { k: 'rrect', p: [720, 300], w: 120, h: 200, r: 18, fill: K }, { k: 'rrect', p: [726, 306], w: 108, h: 188, r: 14, fill: '#5b3a7a' },
    { k: 'patron' },
    { k: 'rect', p: [700, 490], w: 160, h: 12, fill: K }, { k: 'rect', p: [770, 502], w: 20, h: 28, fill: K },
    // the weapon on the bench
    { k: 'rest', slot: 'main', at: 'bench' },
    { k: 'rect', p: [32, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [180, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [878, 300], w: 96, h: 6, fill: TRIM }
  ]);
  return {
    name: 'Bridge', spot: 88,
    rounds: [{ x: 88, act: 'guard', dur: 60 }],
    quiet: false, can: ['ssh_session', 'updating'], hosts: [], helmet: 'off', weapon: 'away',
    still: [{ shapes: still }],
    moving: [
      { shapes: [
        { k: 'fx', fx: 'twinkle', p: [186, 76], w: 588, h: 168, n: 10, colour: WHITE, seed: 9 },
        { k: 'things' },
        { k: 'patron' }, { k: 'bubble' },
        { k: 'rest', slot: 'main', at: 'bench' }
      ] },
      { when: ['strike'], shapes: [{ k: 'fx', fx: 'burst', p: [{ spot: 1, c: 132 }, 418] }] }
    ],
    over: [],
    things: places({ pie: [300, 445], h: [80, 228, 926], g: [70, 218, 410] }),
    rests: { bench: { from: 'spot', x: 50, y: 425, a: 'flat' } },
    anvil: { rest: 'bench' },
    seat: { x: 780, y: 490, bubble: [632, 190], turn: 3000, mouth: 220 }
  };
}

/* ---- Airlock: a scene for cpu_hot alone, so that the scene per condition offers it there ------- */
function airlock() {
  const still = hull(530).concat([
    // the round door and its hazard stripes
    { k: 'ell', p: [480, 300], rx: 160, ry: 160, fill: K }, { k: 'ell', p: [480, 300], rx: 152, ry: 152, fill: HULL2 },
    { k: 'ell', p: [480, 300], rx: 120, ry: 120, fill: K }, { k: 'ell', p: [480, 300], rx: 114, ry: 114, fill: PANEL },
    { k: 'rect', p: [366, 296], w: 228, h: 8, fill: K },
    { k: 'tile', step: 40, phase: 0, from: L, to: { R: 1 }, shapes: [{ k: 'rect', p: [{ x: 1 }, 504], w: 20, h: 22, fill: AMBER }] },
    { k: 'rect', p: [32, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [180, 300], w: 96, h: 6, fill: TRIM }, { k: 'rect', p: [878, 300], w: 96, h: 6, fill: TRIM },
    { k: 'rect', p: [616, 517], w: 120, h: 14, fill: K }, { k: 'rect', p: [620, 519], w: 112, h: 10, fill: TRIM }
  ]);
  return {
    name: 'Airlock', spot: 100,
    rounds: [{ x: 100, act: 'look', dur: 16 }, { x: 120, act: 'guard', dur: 16 }],
    quiet: false, can: ['cpu_hot'], hosts: [], helmet: 'on', weapon: 'held',
    still: [{ shapes: still }],
    moving: [{ shapes: [
      { k: 'glow', p: [480, 300], r: 140, colour: WARN, a: { c: 0.08, wave: [0.05, 300, 0] } },
      { k: 'things' }
    ] }],
    over: [],
    things: places({ pie: [674, 517], h: [80, 228, 926], g: [70, 218, 904] })
  };
}

/* ---- The cast ------------------------------------------------------------------------------------ */
function captain() {
  return {
    role: 'patron', name: 'Captain', box: [160, 300],
    anchors: { seat: [0, 0], eyes: [0, -196], mouth: [0, -180] },
    still: [{ at: 'seat', shapes: [
      // legs and boots
      { k: 'rect', p: [-34, -40], w: 68, h: 40, fill: K }, { k: 'rect', p: [-30, -38], w: 60, h: 36, fill: '#2d3a5c' },
      // the jacket, its collar and its badge
      { k: 'rrect', p: [-50, -150], w: 100, h: 116, r: 14, fill: K }, { k: 'rrect', p: [-46, -146], w: 92, h: 108, r: 12, fill: '#c9a227' },
      { k: 'rect', p: [-4, -146], w: 8, h: 108, fill: '#8a6f17' }, { k: 'rect', p: [16, -126], w: 14, h: 10, fill: WHITE },
      // the arms on the chair's arms
      { k: 'rrect', p: [-70, -120], w: 22, h: 80, r: 8, fill: K }, { k: 'rrect', p: [-67, -117], w: 16, h: 74, r: 6, fill: '#c9a227' },
      { k: 'rrect', p: [48, -120], w: 22, h: 80, r: 8, fill: K }, { k: 'rrect', p: [51, -117], w: 16, h: 74, r: 6, fill: '#c9a227' },
      // the head, its eyes and its cap
      { k: 'rrect', p: [-32, -226], w: 64, h: 76, r: 20, fill: K }, { k: 'rrect', p: [-29, -223], w: 58, h: 70, r: 18, fill: '#e6b98c' },
      { k: 'rect', p: [-17, -200], w: 8, h: 8, fill: K }, { k: 'rect', p: [9, -200], w: 8, h: 8, fill: K },
      { k: 'rect', p: [-36, -240], w: 72, h: 22, fill: K }, { k: 'rect', p: [-32, -236], w: 64, h: 16, fill: '#24304d' },
      { k: 'rect', p: [-44, -222], w: 88, h: 6, fill: K }, { k: 'rect', p: [-6, -234], w: 12, h: 8, fill: '#c9a227' }
    ] }],
    states: {
      shut: [{ k: 'rect', at: 'mouth', p: [-8, -1], w: 16, h: 3, fill: K }],
      open: [{ k: 'rrect', at: 'mouth', p: [-8, -3], w: 16, h: 10, r: 3, fill: K }, { k: 'rect', at: 'mouth', p: [-5, 2], w: 10, h: 3, fill: WARN }]
    }
  };
}
/* Glitch, the foe that comes out of the floor. With fires (the 1.2 copy) it fires a tracer from the
   end of an arm held out, in a seventh pose, aim. */
function glitch(fires) {
  const C1 = '#3dfca0', C2 = VIOLET, C3 = '#ff4fd8';
  const blocks = [
    { k: 'rect', p: [-34, -110], w: 68, h: 110, fill: K },
    { k: 'rect', p: [-30, -106], w: 60, h: 102, fill: C2 },
    { k: 'rect', p: [-30, -86], w: 60, h: 10, fill: C1 }, { k: 'rect', p: [-30, -52], w: 60, h: 8, fill: C3 },
    { k: 'rect', p: [-38, -72], w: 12, h: 10, fill: C1 }, { k: 'rect', p: [26, -40], w: 14, h: 8, fill: C3 }
  ];
  const eyes = (dy, shut) => (shut
    ? [{ k: 'rect', p: [-20, -94 + dy], w: 14, h: 3, fill: K }, { k: 'rect', p: [4, -94 + dy], w: 14, h: 3, fill: K }]
    : [{ k: 'rect', p: [-22, -100 + dy], w: 16, h: 12, fill: K }, { k: 'rect', p: [-18, -97 + dy], w: 8, h: 6, fill: WHITE },
      { k: 'rect', p: [2, -100 + dy], w: 16, h: 12, fill: K }, { k: 'rect', p: [6, -97 + dy], w: 8, h: 6, fill: WHITE }]);
  const arms = up => [{ k: 'rect', p: [-50, up ? -130 : -80], w: 14, h: 40, fill: K }, { k: 'rect', p: [-47, up ? -127 : -77], w: 8, h: 34, fill: C1 },
    { k: 'rect', p: [36, up ? -130 : -80], w: 14, h: 40, fill: K }, { k: 'rect', p: [39, up ? -127 : -77], w: 8, h: 34, fill: C1 }];
  const mouth = w => [{ k: 'rect', p: [-w / 2, -70], w, h: 6, fill: K }];
  const v = {
    role: 'foe', name: 'Glitch',
    sprite: { size: [160, 180], feet: [80, 170] }, h: 130, w: 34, mid: 60,
    crown: [[-50, -96], [-46, -110], [-34, -112], [-20, -112], [0, -112], [20, -112], [34, -112], [46, -110], [50, -96]],
    exit: 'poof'
  };
  // drawn facing left: the arm held out to the left, its end the muzzle, the other arm down
  if (fires) v.fires = { muzzle: [-76, -83], shot: { kind: 'tracer', colour: '#ff8fb0', flash: '#fff3a0' } };
  v.parts = { body: blocks, arms: arms(false), 'arms.up': arms(true) };
  v.poses = {
    stand: { parts: ['arms', 'body'], shapes: eyes(0).concat(mouth(20)) },
    climb: { parts: ['arms.up', 'body'], shapes: eyes(0).concat(mouth(12)) },
    taunt0: { parts: ['arms.up', 'body'], shapes: eyes(-2).concat(mouth(30)) },
    taunt1: { parts: ['arms', 'body'], shapes: eyes(2).concat(mouth(30)) },
    brace: { parts: ['arms', 'body'], shapes: eyes(0, true).concat(mouth(8)) },
    hit: { parts: ['arms.up', 'body'], shapes: eyes(4, true).concat(mouth(24)) }
  };
  if (fires) v.poses.aim = { parts: ['body'], shapes: [
    { k: 'rect', p: [-78, -90], w: 44, h: 14, fill: K }, { k: 'rect', p: [-75, -87], w: 40, h: 8, fill: C1 }, { k: 'rect', p: [-78, -88], w: 4, h: 10, fill: WARN },
    { k: 'rect', p: [36, -80], w: 14, h: 40, fill: K }, { k: 'rect', p: [39, -77], w: 8, h: 34, fill: C1 }
  ].concat(eyes(0), mouth(10)) };
  return v;
}
function moth() {
  const wing = (dy, a) => [
    { k: 'ell', g: 'wings', p: [-7, dy], rx: 7, ry: a, fill: AMBER },
    { k: 'ell', g: 'wings', p: [7, dy], rx: 7, ry: a, fill: AMBER }
  ];
  const body = [{ k: 'ell', p: [0, 0], rx: 3, ry: 5, fill: '#5a3a12' }, { k: 'rect', p: [-1, -6], w: 2, h: 2, fill: CREAM }];
  return {
    role: 'critter', name: 'Spark moth',
    groups: { wings: { pivot: [0, 0] } }, alpha: { wings: 0.9 },
    frames: { flap0: wing(-3, 4).concat(body), flap1: wing(-6, 2).concat(body) },
    dead: [{ k: 'rect', p: [-3, 0], w: 6, h: 3, fill: '#5a3a12' }, { k: 'rect', p: [-1, -1], w: 2, h: 1, fill: AMBER }]
  };
}
function droneMember() {
  const poses = {};
  for (const n of Object.keys(DRONE_POSES)) poses[n] = 'drone.' + n;
  const spot = (rest, face, fly, lane) => ({ rest, face, floors: [], lane: lane || 530, fly });
  return {
    role: 'pet', name: 'Hover drone',
    sprite: { size: SPRITE, feet: FEET },
    coats: { steel: { name: 'Steel', poses } },
    // each spot on the floor clear of every place's box, so a device never stands over the drone
    spots: { deck: spot([780, 530], -1, [700, 420]), bridge: spot([910, 530], -1, [840, 380]), airlock: spot([780, 530], -1, [700, 410]) },
    paw: [29, -38], take: 40, land: 36, lift: 30
  };
}

/* ---- The prop set: a pie tin with an aerial, a dome camera and a rack; no vm or box ----------- */
function props() {
  const tin = [
    { k: 'poly', pts: [[-40, -8], [40, -8], [32, 8], [-32, 8]], fill: K, dir: 'rows' },
    { k: 'poly', pts: [[-36, -6], [36, -6], [30, 5], [-30, 5]], fill: '#c0c8de', dir: 'rows' },
    { k: 'ell', p: [0, -10], rx: 34, ry: 8, fill: '#e8b058' }
  ];
  const aerial = [{ k: 'strip', p0: [10, -12], p1: [24, -70], hw0: 1.5, hw1: 1.5, fill: K }, { k: 'ell', p: [24, -72], rx: 5, ry: 5, fill: K }, { k: 'ell', p: [24, -72], rx: 3, ry: 3, fill: AMBER }];
  const bent = [{ k: 'strip', p0: [10, -12], p1: [36, -30], hw0: 1.5, hw1: 1.5, fill: K }, { k: 'ell', p: [38, -31], rx: 4, ry: 4, fill: '#5a6788' }];
  const dome = gone => [
    { k: 'rect', p: [-6, -60], w: 12, h: 18, fill: K },
    { k: 'ell', p: [0, -30], rx: 26, ry: 18, fill: K }, { k: 'ell', p: [0, -30], rx: 23, ry: 15, fill: gone ? '#4a4f5c' : '#d7deee' },
    { k: 'ell', p: [6, -26], rx: 8, ry: 8, fill: gone ? '#20283c' : '#1a4d6b' }
  ];
  const rack = gone => [
    { k: 'rrect', p: [-50, -90], w: 100, h: 90, r: 4, fill: K }, { k: 'rrect', p: [-46, -86], w: 92, h: 82, r: 3, fill: gone ? '#2a2f3c' : PANEL },
    { k: 'rect', p: [-40, -76], w: 80, h: 10, fill: gone ? '#1d2333' : HULL2 }, { k: 'rect', p: [-40, -56], w: 80, h: 10, fill: gone ? '#1d2333' : HULL2 },
    { k: 'rect', p: [-40, -36], w: 80, h: 10, fill: gone ? '#1d2333' : HULL2 }
  ];
  return {
    'props.orbit': { name: 'Orbit devices', kinds: {
      pi: { name: 'Pie tin with an aerial', mark: 96, up: { still: tin.concat(aerial), lamp: [-18, -20] }, gone: { still: tin.concat(bent) } },
      camera: { name: 'Dome camera', mark: 70, up: { still: dome(false), lamp: [-14, -40] }, gone: { still: dome(true) } },
      machine: { name: 'Rack', mark: 104, up: { still: rack(false), lamp: [30, -66] }, gone: { still: rack(true) } }
    } }
  };
}

/* ---- The pack ------------------------------------------------------------------------------------ */
function build() {
  const stamps = {};
  for (const n of Object.keys(DRONE_POSES)) stamps['drone.' + n] = drone(DRONE_POSES[n]);
  const items = outfit();
  const local = n => n;
  const pack = {
    id: ID, name: 'Orbit (test world)', version: '1.0.0', format: [1, 1], licence: 'For the tests only; never shipped.',
    provides: ['builds', 'items', 'swatches', 'stamps', 'scenes', 'cast', 'props', 'words', 'overlays', 'worlds', 'sounds'],
    swatches: {
      skin: { chrome: { name: 'Chrome', entries: {
        face: [[0.14, '#eef2fa'], [0.72, '#c3cbdc'], [1, '#8d97ad']],
        sick: [[0.14, '#e4f5d0'], [0.72, '#b4d69a'], [1, '#7f9f6a']],
        hot: [[0.14, '#ffd8cc'], [0.72, '#f0a090'], [1, '#c06a5c']],
        cheek: '#b8c2d8', puff: '#f0a090' } } },
      hair: { wire: { name: 'Wire', entries: { 0: '#d0d8ea', 1: '#9aa7c7', 2: '#5d6a8c', brow: '#3a4460' } } },
      tabard: { panel: { name: 'Panel', entries: { 0: '#9fb4e6', 1: '#7186b8', 2: '#4f6392', 3: '#33415f' } } },
      plume: { beacon: { name: 'Beacon', entries: { 0: '#fff1b0', 1: '#ffc04a', 2: '#d48a1e', 3: '#8a5510' } } }
    },
    builds: { 'body.unit': { name: 'Unit', head: 'head.unit',
      m: { shoulder: 40, chest: 32, waist: 28, hip: 32, stance: 16, leg: 100, height: 160, head: 42 } } },
    items,
    stamps,
    scenes: { deck: deck(), bridge: bridge(), airlock: airlock() },
    cast: { 'patron.captain': captain(), 'foe.glitch': glitch(), 'critter.moth': moth(), 'pet.drone': droneMember() },
    props: props(),
    words: { 'words.orbit': {
      name: 'Orbit', watcher: 'the unit',
      labels: { watcher: 'The unit', patron: 'The captain', build: 'Chassis', tabard: 'Panels', plume: 'Beacon', helmet: 'Dome', foe: 'Glitch', critter: 'Moth', pet: 'The drone' },
      quiet: { quiet: ['ALL CLEAR'], up: ['{n} up'], backup: ['backup {at}'], ads: ['{n} ads zapped', '{short} ads zapped', '{short} zapped'] },
      captions: { ip_banned: ['EJECTED {addr} · {jail}', 'EJECTED {addr}'], import: ['DOCKED · {title}'], backup_done: ['LOGGED {at}'] }
    } },
    // each level's colours near the edges of its band of hue
    overlays: { 'overlay.orbit': {
      name: 'Orbit', font: 'vt323',
      levels: { ok: ['#35ffb8', '#33ffa8'], warn: ['#ff8a1f', '#ffe01a'], crit: ['#ff4060', '#ff4e2a'], info: ['#36f6ff', '#4090ff'], sleep: ['#1f9a4c', '#1c8a3a'] },
      outline: '#0a0820', scrim: '#05060f', caption: { rgb: '#05060f', a: 0.7 }
    } },
    worlds: { 'world.orbit': {
      name: 'Orbit', body: local('body.unit'),
      outfit: { items: Object.fromEntries(OUTFIT.map(([slot, id]) => [slot, id])), swatches: { skin: 'chrome', hair: 'wire', tabard: 'panel', plume: 'beacon' } },
      scenes: { quiet: ['deck'], for: { attack: 'deck', wan_down: 'deck', container_unhealthy: 'deck', disk_full: 'deck', backup_overdue: 'deck', pi_silent: 'deck',
        cpu_hot: 'airlock', ssh_session: 'bridge', updating: 'bridge', streaming: 'deck', night: 'deck' } },
      cast: { patron: 'patron.captain', foe: 'foe.glitch', critter: 'critter.moth', pet: 'pet.drone' },
      props: 'props.orbit', overlay: 'overlay.orbit', words: 'words.orbit', picture: 'deck',
      sound: { theme: 'reserved' }, companion: { who: 'reserved', junk: [1, 2] }
    } },
    sounds: { hum: { file: 'none', junk: [1, 2, 3] } }
  };
  return { kwpack: 1, pack };
}
const text = () => JSON.stringify(build(), null, 1) + '\n';

/* ---- The 1.2 copy: weapons and a foe that fire --------------------------------------------------
   test.orbit-fire.pack.json: the same world, the same id, at format [1, 2], with what 1.2 adds. The
   unit carries a one-handed blaster that fires a bolt, with a deflector, the base pack's heater
   shield in flat panels; the prod, two-handed, is both swung and fired, a beam with no flash colour
   of its own; Glitch fires a tracer. A page of format 1.1 refuses the copy at format, and reads the
   1.1 file beside it as before. Framed points are on the weapon's frame: s along it, p across. */
const FIRE_FILE = path.join(__dirname, 'test.orbit-fire.pack.json');
const F = (s, p) => ({ frame: 'main', s, p });
const frameBox = (s0, s1, p0, p1, fill) => ({ k: 'poly', pts: [F(s0, p0), F(s1, p0), F(s1, p1), F(s0, p1)], fill, dir: 'frame' });
function blaster() {
  return {
    slot: 'main', name: 'Blaster', use: 'fire',
    grip: { kind: 'one', hands: [0] },
    barrel: { from: 22, to: 64, half: 7 }, muzzle: { s: 64, p: 0 }, range: 420,
    shot: { kind: 'bolt', colour: GLOW, flash: '#fff3a0' },
    stowed: { layer: 'body', parts: [{ at: 'hipR', shapes: [
      { k: 'rrect', p: [4, -8], w: 20, h: 38, r: 5, fill: K }, { k: 'rrect', p: [7, -5], w: 14, h: 32, r: 3, fill: '#566791' }
    ] }] },
    parts: [{ at: 'main', shapes: [
      { k: 'strip', p0: F(-2, 2), p1: F(-10, 18), hw0: 5, hw1: 5, fill: K }, { k: 'strip', p0: F(-2, 2), p1: F(-10, 18), hw0: 2.5, hw1: 2.5, fill: '#566791' },
      frameBox(-12, 64, -7, 7, K), frameBox(-9, 61, -4, 4, '#8ea2d2'), frameBox(30, 58, -1, 1, GLOW), frameBox(56, 64, -5, 5, WARN)
    ] }]
  };
}
function prod() {
  return {
    slot: 'main', name: 'Prod', use: 'both',
    grip: { kind: 'two', hands: [2, -30] },
    blade: { from: 34, to: 204, half: 10 },
    barrel: { from: 34, to: 204, half: 10 }, muzzle: { s: 204, p: 0 }, range: 360,
    shot: { kind: 'beam', colour: LIME },
    stowed: { layer: 'back', parts: [{ at: 'neck', shapes: [
      { k: 'strip', p0: [-70, -30], p1: [64, 150], hw0: 6, hw1: 6, fill: K }, { k: 'strip', p0: [-70, -30], p1: [64, 150], hw0: 3, hw1: 3, fill: '#b8c3dc' },
      { k: 'ell', p: [-70, -30], rx: 10, ry: 10, fill: K }, { k: 'ell', p: [-70, -30], rx: 6, ry: 6, fill: LIME }
    ] }] },
    parts: [{ at: 'main', shapes: [
      { k: 'strip', p0: F(-44, 0), p1: F(160, 0), hw0: 6, hw1: 6, fill: K }, { k: 'strip', p0: F(-44, 0), p1: F(160, 0), hw0: 3, hw1: 3, fill: '#b8c3dc' },
      frameBox(150, 180, -10, 10, K), frameBox(153, 177, -7, 7, '#5d6f99'),
      { k: 'strip', p0: F(178, -7), p1: F(204, -7), hw0: 3, hw1: 3, fill: K }, { k: 'strip', p0: F(178, 7), p1: F(204, 7), hw0: 3, hw1: 3, fill: K },
      { k: 'ell', p: F(194, 0), rx: 5, ry: 5, fill: K }, { k: 'ell', p: F(194, 0), rx: 3, ry: 3, fill: LIME }
    ] }]
  };
}
function fired() {
  const env = build(), p = env.pack;
  p.version = '1.1.0'; p.format = [1, 2];
  p.items['main.blaster'] = blaster();
  p.items['main.prod'] = prod();
  p.items['off.deflector'] = Object.assign(flat(clone(BASE.items['off.heater']), '#6a7fae'), { name: 'Deflector' });
  p.cast['foe.glitch'] = glitch(true);
  Object.assign(p.worlds['world.orbit'].outfit.items, { main: 'main.blaster', off: 'off.deflector' });
  return env;
}
const fireText = () => JSON.stringify(fired(), null, 1) + '\n';

/* A copy with a second preset, "Orbit (broken)": its quiet scene, the lounge, is the deck that
   cannot act a device going down, so the pack library refuses the pack at rules. */
function broken() {
  const env = build(), p = env.pack;
  p.scenes.lounge = Object.assign(clone(p.scenes.deck), { name: 'Lounge', can: p.scenes.deck.can.filter(c => c !== 'device_down') });
  p.worlds['world.broken'] = Object.assign(clone(p.worlds['world.orbit']), { name: 'Orbit (broken)', scenes: { quiet: ['lounge'], for: clone(p.worlds['world.orbit'].scenes.for) } });
  return JSON.stringify(env);
}

module.exports = { FILE, FIRE_FILE, ID, build, text, broken, fired, fireText };

if (require.main === module) {
  const files = [[FILE, text()], [FIRE_FILE, fireText()]];
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [f, want] of files) {
      const got = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      if (got !== want) { bad++; console.error('orbit: ' + path.relative(process.cwd(), f) + ' is not what the generator writes; run node ' + path.relative(process.cwd(), __filename)); }
    }
    if (bad) process.exit(1);
    console.log('orbit: the fixtures are what the generator writes');
  } else {
    for (const [f, want] of files) {
      fs.writeFileSync(f, want);
      console.log('orbit: wrote ' + path.relative(process.cwd(), f) + ', ' + Buffer.byteLength(want) + ' bytes');
    }
  }
}
