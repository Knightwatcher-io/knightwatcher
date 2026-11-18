// Tests for a foe that fires (docs/page.md, The acts with a weapon that fires; docs/rig.md, A foe's
// shot): the scene compiler's seventh pose, aim, and the foe's fires; the foe aiming in place of its
// taunt and firing once at 1350; the shot that misses over the head group with no shield, and the
// one that stops at the shield's face with the spark; the foe on the right, which misses with a
// shield carried, the known limit; and the watcher's flinch, which changes the eyes alone. Run
// with: node --test tests/web/
//
// The foe is the test world's Glitch from its copy of format 1.2, which fires a tracer; the looks
// are its blaster with the deflector (one hand and a shield, shot from range), its prod (two hands,
// no shield, swung at a foe it reaches), the greatsword, the base pack's crossbow (two hands, no
// shield, shot from range), and the arming sword with the heater shield. The page's scripts run under Node into a sandbox, the knight and the worlds started from
// the packs on dev terms, and time frozen.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SIGN = require('../../tools/sign-pack.js');
const ORBIT = require('./fixtures/worlds/orbit.js');

const WEB = path.join(__dirname, '../../web');
const BASE_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/base.pack.json'), 'utf8'));
const MED_TEXT = SIGN.withoutSig(fs.readFileSync(path.join(WEB, 'packs/medieval.pack.json'), 'utf8'));
const FIRE_TEXT = fs.readFileSync(ORBIT.FIRE_FILE, 'utf8');
const ORBIT_TEXT = fs.readFileSync(ORBIT.FILE, 'utf8');
const SCRIPTS = [...fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1])
  .filter(s => !s.startsWith('packs/') && !['js/demo.js', 'js/main.js'].includes(s));
const plain = v => JSON.parse(JSON.stringify(v));
const O = n => 'test.orbit/' + n, B = 'kw.base/';
const GLITCH = O('foe.glitch');
const FIRES = JSON.parse(FIRE_TEXT).pack.cast['foe.glitch'].fires;
const BLASTER = { items: { main: O('main.blaster'), off: O('off.deflector') } };
const PROD = { items: { main: O('main.prod') } };
const ARMING = { items: { main: B + 'main.arming', off: B + 'off.heater' } };
const GREAT = { items: {} };
const CROSSBOW = { items: { main: B + 'main.crossbow' } };
const W = 960, H = 600;

/* A context that records nothing, or with px set, every pixel a fillRect paints into px. */
function context(rec) {
  return new Proxy({}, {
    set() { return true; },
    get(_, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'fillRect') return (x, y, w, h) => {
        const px = rec && rec.px;
        if (!px) return;
        const x0 = Math.max(0, Math.round(x)), x1 = Math.min(W, Math.round(x + w)), y0 = Math.max(0, Math.round(y)), y1 = Math.min(H, Math.round(y + h));
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px[yy * W + xx] = 1;
      };
      return () => {};
    }
  });
}
/* The page in the look given, with the medieval world and the test world's copy of 1.2 (or its 1.1
   file, with older), time frozen at 0. rec.px, when set, collects what the screen is painted with. */
function page(look, older) {
  const rec = { px: null };
  const box = vm.createContext({ window: {}, console: { info() {}, warn() {}, log() {} }, performance: { now: () => 0 }, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => context(null); return c; } } });
  for (const f of SCRIPTS) {
    if (box.window.KW) box.KW = box.window.KW;
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), box, { filename: f });
  }
  const KW = box.window.KW, texts = [BASE_TEXT, MED_TEXT, older ? ORBIT_TEXT : FIRE_TEXT];
  KW.knight.start(texts, true, { look: look || {} });
  KW.world.start(texts, true);
  assert.equal(KW.knight.source, 'pack');
  assert.deepEqual(plain(KW.knight.status.fallbacks).filter(f => f.reason !== 'not set'), [], 'the look is drawn as asked');
  KW.ui = { caption() {} };
  KW.hooks = { frozen: true, t: 0 };
  return { KW, K: KW.knight, E: KW.engine, V: KW.view, rec };
}
/* The foe's event in scene, all quiet, the foe the input names, from 0; the pie only where the
   scene keeps it clear of the foe's zone. */
function event(m, scene, foe, hooks) {
  const { KW, E } = m;
  KW.hooks = Object.assign({ frozen: true, t: 0 }, hooks);
  E.init(context(m.rec)); E.reset();
  E.input = { w: KW.state.IDLE, is: scene, devices: [], tv: false, helmet: 'on', foe };
  E.draw(0); E.fireEvent('goblin');
}
/* Plays the event to end ms every step ms, and returns the knight's pose drawn at each moment, and
   the shots made, by the moment each leaves. */
function play(m, end, step) {
  const { KW, K, E } = m, seen = new Map(), shots = new Map(), draw = K.draw;
  K.draw = o => { seen.set(o.t, Object.assign({}, o)); return draw(o); };
  try {
    for (let t = 0; t <= end; t += step || 10) { KW.hooks.t = t; E.draw(t); for (const r of E.shots.live()) shots.set(r.t0, r); }
  } finally { K.draw = draw; }
  return { seen, shots };
}
/* The pixels the knight paints in the pose o. */
function knightPixels(m, o) {
  m.rec.px = new Uint8Array(W * H);
  try { m.K.draw(o); return m.rec.px; } finally { m.rec.px = null; }
}
/* How near the segment from a to b comes to a painted pixel's middle. */
function clearance(px, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  let d = Infinity;
  for (let i = 0; i < px.length; i++) {
    if (!px[i]) continue;
    const x = i % W + .5, y = Math.floor(i / W) + .5, k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    d = Math.min(d, Math.hypot(x - a[0] - k * dx, y - a[1] - k * dy));
  }
  return d;
}
/* Whether the segment from a to b crosses the box [x0, y0, x1, y1]. */
function crosses(a, b, bx) {
  for (let k = 0; k <= 1; k += 1 / 2048) {
    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
    if (x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3]) return true;
  }
  return false;
}
/* The point at the distance s along the shot r from its muzzle. */
const along = (r, s) => [r.from[0] + r.u[0] * s, r.from[1] + r.u[1] * s];

// ---- The numbers and the cast ---------------------------------------------------------------------

test('the numbers of a foe that fires: the aim from 1230, the shot at 1350, 40 over, the spark and the flinch', () => {
  const m = page(BLASTER), F = m.E.foe.FOE;
  assert.deepEqual(plain(F.fires), { aim: 1230, fire: 1350, over: 40, face: .4, spark: 80, flinch: 200 });
  // before the watcher's shot at 1400, and within the taunt's place in the entrance
  assert.ok(F.fires.fire < F.shot.fire && F.fires.fire > F.strike.at);
  assert.deepEqual([F.fires.aim, F.enter.taunt[0]], [1230, 1230]);
});

test('the scene compiler gives a foe that fires its seventh pose, aim, painted once, and its fires', () => {
  const m = page(GREAT), G = m.KW.cast.foes[GLITCH];
  assert.ok(G, 'Glitch is in the cast');
  assert.deepEqual(plain(G.poses), ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit', 'aim']);
  assert.deepEqual(plain(G.fires), plain(FIRES));
  assert.ok(Object.isFrozen(G.fires) && Object.isFrozen(G.fires.muzzle) && Object.isFrozen(G.fires.shot));
  const aim = G.pose('aim');
  assert.equal(aim.width, 160); assert.equal(aim.height, 180);
  assert.equal(G.pose('aim'), aim, 'painted once and kept');
  assert.notEqual(aim, G.pose('stand'));
  assert.notEqual(aim, G.pose('taunt0'));
  // a foe without fires has six poses and no fires, as before: the goblin, and Glitch from the 1.1 file
  for (const F of [m.KW.cast.foes.goblin, page(GREAT, true).KW.cast.foes[GLITCH]]) {
    assert.deepEqual(plain(F.poses), ['stand', 'climb', 'taunt0', 'taunt1', 'brace', 'hit']);
    assert.equal('fires' in F, false);
    assert.equal(F.pose('aim'), F.pose('stand'), 'an unknown pose gives stand');
  }
});

test('the foe aims in place of its taunt from 1230, and braces at 1480; the goblin taunts as before', () => {
  for (const [foe, aims] of [[GLITCH, true], ['goblin', false]]) {
    const m = page(PROD), sc = m.KW.scenes[O('deck')], o = m.K.pose('idle', 0);
    o.floor = m.V.HFL; o.x = 500; o.helmet = true; o.bob = 0;
    m.E.input = { w: m.KW.state.IDLE, is: O('deck'), devices: [], foe };
    const pl = m.E.foe.plan('goblin', sc, { devices: [], places: sc.places }, o);
    assert.ok(pl && pl.hit > 1480, foe);
    const at = el => m.E.foe.at(el, pl).pose;
    assert.equal(at(1229), 'stand');
    for (const el of [1230, 1300, 1350, 1400, 1479]) assert.equal(at(el), aims ? 'aim' : Math.floor((el - 1230) / 110) % 2 ? 'taunt1' : 'taunt0', foe + ' ' + el);
    assert.equal(at(1480), 'brace');
  }
});

// ---- The miss ---------------------------------------------------------------------------------------

test('with no shield the shot misses: 40 over the head group\'s corner nearest the foe, on off the screen, no burst', () => {
  const cases = [[PROD, O('deck')], [PROD, 'battlement'], [GREAT, 'battlement'], [CROSSBOW, 'battlement'], [CROSSBOW, O('deck')],
    [{ items: { helmet: B + 'helm.kettle', plume: B + 'plume.horsehair' } }, 'battlement'], [{ build: B + 'build.b', items: { helmet: B + 'helm.bascinet', plume: B + 'plume.feather' } }, O('deck')],
    [{ build: O('body.unit'), items: { main: O('main.prod'), helmet: O('helm.dome'), plume: O('plume.aerial') } }, O('deck')]];
  for (const [look, scene] of cases) {
    const m = page(look), what = JSON.stringify(look.items) + ' ' + scene;
    event(m, scene, GLITCH);
    const { seen, shots } = play(m, 1600);
    const r = shots.get(1350), o = seen.get(1350);
    assert.ok(r, what + ': the foe\'s shot at 1350');
    assert.equal(r.stop, false, what);
    assert.deepEqual([r.kind, r.colour, r.flash, r.burst], [FIRES.shot.kind, FIRES.shot.colour, FIRES.shot.flash, 0], what);
    // the foe is on the left of the watcher, and fires from its muzzle as drawn, mirrored
    assert.ok(r.from[0] < o.x, what);
    assert.equal(r.from[1], m.V.HFL + FIRES.muzzle[1], what);
    // aimed 40 over the head group's corner nearest the foe, the left, as drawn at 1350
    const hb = m.K.headBox(o);
    assert.deepEqual(plain(r.aim), [hb[0], hb[1] - 40], what);
    const k = ((r.aim[0] - r.from[0]) * r.u[0] + (r.aim[1] - r.from[1]) * r.u[1]), p = along(r, k);
    assert.ok(Math.hypot(p[0] - r.aim[0], p[1] - r.aim[1]) < 1, what + ': on the line, to the pixel its end is rounded to');
    // carried on off the screen
    assert.ok(r.to[0] < m.V.HL || r.to[0] > m.V.HR || r.to[1] < m.V.HT, what + ': ' + r.to);
    // and clear of every pixel the watcher is drawn with, the plume and the helmet included
    const d = clearance(knightPixels(m, o), r.from, r.to);
    assert.ok(d >= 1, what + ': ' + d.toFixed(2) + ' from the watcher');
  }
});

// ---- The shield ---------------------------------------------------------------------------------------

test('with a shield carried and the foe on its side the shot stops at the shield\'s face, with the spark', () => {
  for (const [look, scene] of [[BLASTER, O('deck')], [ARMING, 'battlement'], [ARMING, O('deck')]]) {
    const m = page(look), what = look.items.main + ' ' + scene, poofs = [], poof = m.KW.props.poofHD;
    m.KW.props.poofHD = (x, y) => { poofs.push([m.KW.hooks.t, x, y]); return poof(x, y); };
    event(m, scene, GLITCH);
    const { seen, shots } = play(m, 1600);
    const r = shots.get(1350), o = seen.get(1350);
    assert.ok(r && r.stop, what + ': stopped');
    const sf = m.K.shieldFace(o);
    assert.ok(sf, what + ': a shield is carried');
    // on the edge nearest the foe, the left, 0.4 of the way down the face
    assert.deepEqual(plain(r.to), [Math.round(sf[0]), Math.round(sf[1] + sf[3] * .4)], what);
    assert.ok(r.from[0] < r.to[0], what + ': from the left');
    assert.deepEqual([r.burst, r.lands, r.pass], [80, 1350, 1350], what);
    // the spark, the blade's burst, on the shield's edge while it lasts
    const sparks = poofs.filter(p => p[1] === r.to[0] && p[2] === r.to[1]).map(p => p[0]);
    assert.deepEqual([Math.min(...sparks), Math.max(...sparks)], [1350, 1420], what);
  }
});

test('a foe on the right with a shield carried misses overhead, as with none: the known limit', () => {
  for (const look of [BLASTER, ARMING]) {
    const m = page(look), deck = m.KW.scenes[O('deck')];
    // the deck with its foe zone moved to the right of the watcher
    m.KW.scenes['test.right'] = Object.assign({}, deck, { foeZone: { side: 1, spans: [[640, 860]] } });
    event(m, 'test.right', GLITCH);
    const { seen, shots } = play(m, 1600);
    const r = shots.get(1350), o = seen.get(1350), what = look.items.main;
    assert.ok(r, what + ': the foe\'s shot');
    assert.ok(r.from[0] > o.x, what + ': the foe is on the right');
    assert.ok(m.K.shieldFace(o), what + ': a shield is carried');
    assert.equal(r.stop, false, what + ': not stopped');
    assert.equal(r.burst, 0);
    const hb = m.K.headBox(o);
    assert.deepEqual(plain(r.aim), [hb[2], hb[1] - 40], what + ': over the corner nearest the foe, the right');
    assert.ok(!crosses(r.from, r.to, hb), what + ': over the head group');
    assert.ok(r.to[0] < m.V.HL || r.to[1] < m.V.HT, what + ': off the screen');
    assert.equal(seen.get(1350).eyes, 'wide', what + ': the flinch');
  }
});

// ---- The flinch -----------------------------------------------------------------------------------------

test('the flinch: the eyes wide for 200 ms as the shot passes or stops, and nothing else of the watcher changes', () => {
  for (const [look, scene] of [[PROD, O('deck')], [BLASTER, O('deck')], [ARMING, 'battlement'], [GREAT, 'battlement'], [CROSSBOW, 'battlement']]) {
    const m = page(look), G = m.KW.cast.foes[GLITCH], what = (look.items.main || 'greatsword') + ' ' + scene;
    // Glitch as it is, and the same with no fires, which plays as a foe that does not fire
    m.KW.cast.foes['test.still'] = Object.assign({}, G, { fires: undefined });
    event(m, scene, GLITCH);
    const fired = play(m, 3400, 10);
    event(m, scene, 'test.still');
    const still = play(m, 3400, 10);
    assert.deepEqual([...still.shots.keys()].filter(t => t === 1350), [], what + ': no shot from the foe without fires');
    const r = fired.shots.get(1350);
    for (let t = 0; t <= 3400; t += 10) {
      const a = fired.seen.get(t), b = still.seen.get(t), flinch = t >= r.pass && t < r.pass + 200;
      assert.ok(a && b, what + ' ' + t);
      assert.equal(a.eyes, flinch ? 'wide' : b.eyes, what + ': the eyes at ' + t);
      assert.deepEqual(Object.assign({}, a, { eyes: '' }), Object.assign({}, b, { eyes: '' }), what + ': the rest of the pose at ' + t);
    }
    // the watcher strikes or shoots back as before
    assert.deepEqual([...fired.shots.keys()].filter(t => t !== 1350), [...still.shots.keys()], what);
  }
});

test('a bolt from a foe is flinched at when it passes the head or reaches the shield', () => {
  for (const look of [PROD, BLASTER]) {
    const m = page(look), G = m.KW.cast.foes[GLITCH];
    m.KW.cast.foes['test.bolt'] = Object.assign({}, G, { fires: { muzzle: G.fires.muzzle, shot: { kind: 'bolt', colour: '#ffffff' } } });
    event(m, O('deck'), 'test.bolt');
    const { seen, shots } = play(m, 2400, 10);
    const r = shots.get(1350), SPEED = m.E.shots.SHOT.speed;
    const to = r.stop ? r.to : r.aim, at = 1350 + Math.hypot(to[0] - r.from[0], to[1] - r.from[1]) / SPEED;
    assert.ok(Math.abs(r.pass - at) < 1e-6, look.items.main + ': ' + r.pass + ' ' + at);
    assert.ok(r.pass > 1400, 'the bolt is in flight for a while');
    for (let t = 1300; t <= 2000; t += 10) assert.equal(seen.get(t).eyes === 'wide', t >= r.pass && t < r.pass + 200, look.items.main + ' ' + t);
  }
});

// ---- With the watcher's own shot ---------------------------------------------------------------------

test('with a weapon that fires both shots show: the foe\'s at 1350 and the watcher\'s at 1400', () => {
  const m = page(BLASTER);
  event(m, O('deck'), GLITCH);
  const { shots } = play(m, 1410);
  assert.deepEqual([...shots.keys()], [1350, 1400]);
  const showing = m.E.shots.live().filter(r => r.t0 <= 1410 && 1410 < r.end).map(r => r.t0);
  assert.deepEqual(plain(showing), [1350, 1400]);
});

// ---- The knight's measures ----------------------------------------------------------------------------

test('shieldFace() is the shield\'s face box on the off hand, and null with no shield carried', () => {
  const m = page(ARMING), K = m.K, o = K.pose('idle', 0);
  o.x = 480; o.floor = 530;
  const face = JSON.parse(BASE_TEXT).pack.items['off.heater'].face, h = K.rig(o).anchors.off;
  assert.deepEqual(plain(K.shieldFace(o)), [h[0] + face[0], h[1] + face[1], face[2], face[3]]);
  assert.equal(K.shieldFace(Object.assign({}, o, { sword: false })), null, 'put away');
  for (const look of [PROD, GREAT, CROSSBOW, { items: { main: B + 'main.arming' } }]) {
    const n = page(look), p = n.K.pose('idle', 0); p.x = 480; p.floor = 530;
    assert.equal(n.K.shieldFace(p), null, JSON.stringify(look.items));
  }
});

test('headBox() holds every pixel of the head group as drawn, to the pixel, its top at most 12 pixels above them', () => {
  const heads = [[B + 'helm.open', B + 'plume.crest'], [B + 'helm.kettle', B + 'plume.horsehair'], [B + 'helm.bascinet', B + 'plume.feather'], [B + 'helm.coif', B + 'plume.crest']];
  const m = page(GREAT), K = m.K;
  m.KW.draw.setCtx(context(m.rec));
  for (const build of ['build.a', 'build.b', 'build.c']) for (const [helmet, plume] of heads) {
    K.look({ build: B + build, items: { helmet, plume } });
    for (const t of [0, 1400, 2800]) {
      const o = K.pose('idle', t); o.x = 480; o.floor = 530; o.helmet = true; o.bob = 0; o.sword = false;
      const hb = K.headBox(o), hy = K.rig(o).anchors.head[1], px = knightPixels(m, o), what = build + ' ' + helmet + ' ' + plume + ' ' + t;
      // the painted pixels above the chin, which are the head group's and the face's
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity;
      for (let i = 0; i < px.length; i++) if (px[i] && Math.floor(i / W) < hy + 20) { const x = i % W, y = Math.floor(i / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); }
      // to the pixel a shape's edge is rounded to
      assert.ok(hb[0] <= x0 + 1.5 && hb[2] >= x1 - 1.5 && hb[1] <= y0 + 1.5, what + ': ' + hb.map(Math.round) + ' holds ' + [x0, y0, x1]);
      // and its top no higher than an ellipse clipped to its rows, counted whole, reaches (its sides
      // may hold a helmet's drape over the shoulders, below the chin)
      assert.ok(y0 - hb[1] <= 12, what + ': ' + hb.map(Math.round) + ' against ' + [x0, y0, x1]);
    }
  }
});
