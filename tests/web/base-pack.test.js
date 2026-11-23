// Tests for the base pack that ships with the page, web/packs/base.pack.json: that it is the present
// knight, complete, with the arming sword and the heater shield besides, the free options (six of
// each colour set and three hair styles), the three builds and the items fitted to them, the free
// items of 1.4.0 (two to four more in every slot the user chooses), the crossbow of 1.5.0, a weapon
// that fires, and nothing more, that every choice of them resolves, and
// that the page's rules for signing apply to it, whether it ships signed or not. Run with:
// node --test tests/web/
// That drawing it gives the same calls as the code is checked pose by pose in knight.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PK = require('../../web/js/pack.js');
const ED = require('../../web/js/ed25519.js');
const { withoutSig } = require('../../tools/sign-pack.js');

const ROOT = path.join(__dirname, '../..');
const TEXT = fs.readFileSync(path.join(ROOT, 'web/packs/base.pack.json'), 'utf8');
const PACK = JSON.parse(TEXT).pack;
// Whether the shipped file carries a signature, and the file with any signature taken off
const SIGNED = Object.prototype.hasOwnProperty.call(JSON.parse(TEXT), 'sig');
const UNSIGNED = withoutSig(TEXT);
const verify = ED.verify;
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base.pack.json'), 'utf8')).pack;
// The two items of the one-handed look, as approved, which the test fixture does not hold: its own
// main.arming is a smaller sword made for the library's tests.
const ONEHAND = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-onehand.items.json'), 'utf8'));
// The free options as approved: the swatches beside today's and the two hair styles beside the
// short crop.
const OPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-options.json'), 'utf8'));
// The three builds as approved, with their names, and the three items refitted to them: the tabard
// in pieces that narrow to the waist and widen to the hip, the greaves that grow with the leg and
// the pauldrons that grow with the shoulders. The tabard's iris already follows the tabard there.
const BUILDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-builds.json'), 'utf8'));
// The free items of 1.4.0 as approved, 25 of them, and the wool of the pack's own cloth palette that
// the padded hose and the turnshoes are drawn in.
const FREE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-free-items.json'), 'utf8'));
// The crossbow of 1.5.0 as approved: the wooden crossbow, its shapes, stations, barrel, shot and
// stowed view exactly. The pack names it plainly, as it names the swords, and gives it no flash of
// its own, since the approved flash is the engine's pale snap (SHOT.snap), which a shot with none
// shows.
const CROSSBOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base-crossbow.json'), 'utf8'));
const asShipped = item => { const o = JSON.parse(JSON.stringify(item)); o.name = 'Crossbow'; delete o.shot.flash; return o; };
// The iris of the watch's eye follows the tabard: the tabard's and the shield's, worn and at rest,
// take the tabard's darkest band where the fixture and the approved shield have the fixed blue.
const irisFollows = item => JSON.parse(JSON.stringify(item).split('"@base.b3"').join('"@tabard.3"'));
// Each set's choices in the order the settings screen should show them, today's among them.
const ORDER = { skin: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], hair: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'],
  tabard: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], plume: ['red', 'white', 'gold', 'royal', 'green', 'violet'] };
// The builds in the order the settings screen shows them, by the names it shows.
const BUILD_NAMES = { 'build.a': 'Classic', 'build.b': 'Broad', 'build.c': 'Slim' };
// Every item of each slot a look chooses, today's first and then the free items of 1.4.0 and the
// crossbow of 1.5.0 in the order the settings screen shows them.
const SLOTS = { legs: ['legs.plate', 'legs.mail', 'legs.hose'], boots: ['boots.leather', 'boots.sabatons', 'boots.shoes'],
  torso: ['torso.tabard', 'torso.cuirass', 'torso.gambeson'], head: ['head.plain'], hair: ['hair.short', 'hair.tied', 'hair.curls', 'hair.long', 'hair.close'],
  helmet: ['helm.open', 'helm.kettle', 'helm.coif', 'helm.bascinet'], plume: ['plume.crest', 'plume.feather', 'plume.horsehair'],
  pauldrons: ['pauldrons.plate', 'pauldrons.lames', 'pauldrons.leather'], arms: ['arms.plate', 'arms.mail', 'arms.padded'],
  gauntlets: ['gauntlets.plate', 'gauntlets.leather', 'gauntlets.mail'], main: ['main.greatsword', 'main.arming', 'main.longsword', 'main.mace', 'main.crossbow'],
  off: ['off.heater', 'off.round', 'off.kite'], back: ['back.cloak', 'back.cape'] };
const B = id => 'kw.base/' + id;
const grip = id => PACK.items[id].grip.kind;
// The weapons that are swung, every one but the crossbow.
const SWUNG = SLOTS.main.filter(id => PACK.items[id].use === undefined);

test('the base pack unsigned is read on a dev page and refused at the signature step elsewhere', () => {
  const r = PK.read(UNSIGNED, { allowUnsigned: true, verify });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.id, 'kw.base');
  assert.equal(r.version, '1.5.1');
  assert.deepEqual(r.format, [1, 2]);
  assert.equal(r.signed, false);
  assert.deepEqual(r.provides, ['builds', 'items', 'palettes', 'swatches']);
  assert.deepEqual(PK.read(UNSIGNED, { verify }), { ok: false, step: 'signature', reason: 'sig: is missing, and this page accepts only signed packs', id: 'kw.base' });
});

test('the base pack as it ships is read on every page when signed, and on a dev page alone when not', () => {
  const dev = PK.read(TEXT, { allowUnsigned: true, verify });
  assert.equal(dev.ok, true, dev.reason);
  assert.equal(dev.signed, SIGNED);
  const deployed = PK.read(TEXT, { verify });
  if (SIGNED) {
    assert.equal(deployed.ok, true, deployed.reason);
    assert.equal(deployed.signed, true);
    assert.equal(JSON.parse(TEXT).sig.kid, 'kw1');
  } else {
    assert.equal(TEXT, UNSIGNED);
    assert.deepEqual([deployed.ok, deployed.step], [false, 'signature']);
  }
});

test('three builds as approved, Classic the present knight\'s measurements, all with the plain head at its one size', () => {
  assert.deepEqual(Object.keys(PACK.builds), Object.keys(BUILD_NAMES));
  assert.deepEqual(PACK.builds, BUILDS.builds);
  const want = Object.fromEntries(PK.MEASURES.map(m => [m[0], m[1]]));
  assert.deepEqual(PACK.builds['build.a'].m, want);
  assert.equal(PACK.defaults.build, 'build.a');
  for (const [id, b] of Object.entries(PACK.builds)) {
    assert.equal(b.name, BUILD_NAMES[id], id);
    assert.equal(b.head, 'head.plain', id);
    // the head item has no terms on dHead, so every build keeps the present skull (docs/packs.md)
    assert.equal(b.m.head, want.head, id);
    const torso = b.m.height - b.m.leg;
    assert.ok(torso >= PK.TORSO[0] && torso <= PK.TORSO[1], id + ': torso ' + torso);
    // each measurement at least 6 from either end of its range
    for (const [k, , lo, hi] of PK.MEASURES) assert.ok(b.m[k] - lo >= 6 && hi - b.m[k] >= 6, id + '.' + k + ' ' + b.m[k]);
  }
  // Broad: wider at the shoulders and chest, narrower at the hip, taller; Slim: narrower at the
  // shoulders, a defined waist, a little wider at the hip, 6 shorter
  const [a, b, c] = ['build.a', 'build.b', 'build.c'].map(id => PACK.builds[id].m);
  assert.ok(b.shoulder > a.shoulder && b.chest > a.chest && b.hip < a.hip && b.height > a.height);
  assert.ok(c.shoulder < a.shoulder && c.waist < c.chest && c.waist < c.hip && c.hip > a.hip);
  assert.equal(c.height, a.height - 6);
});

test('every slot the present drawing has, the one-handed sword and the shield, five hair styles, the free items of 1.4.0, the crossbow, and nothing else', () => {
  const slots = {};
  for (const [id, it] of Object.entries(PACK.items)) (slots[it.slot] = slots[it.slot] || []).push(id);
  for (const s of Object.keys(slots)) slots[s].sort();
  const want = {};
  for (const s of Object.keys(SLOTS)) want[s] = SLOTS[s].slice().sort();
  assert.deepEqual(slots, want);
  // the 15 of 1.3.0 first, as they were, then the 25 free items in the fixture's order, then the
  // crossbow of 1.5.0
  assert.equal(Object.keys(PACK.items).length, 41);
  assert.deepEqual(Object.keys(PACK.items).slice(15, 40), Object.keys(FREE.items));
  assert.deepEqual(Object.keys(PACK.items).slice(40), ['main.crossbow']);
  // format 1.2, which the crossbow's fields need, and the one weapon that fires
  assert.deepEqual(PACK.format, [1, 2]);
  assert.deepEqual(SLOTS.main.filter(id => !SWUNG.includes(id)), ['main.crossbow']);
  // the defaults are 1.3.0's, so the default knight is drawn exactly as before, and nothing on the back
  assert.deepEqual(PACK.defaults, FIXTURE.defaults);
  assert.equal(PACK.defaults.items.back, undefined);
  // the pack's own palette holds the wool of the hose and the turnshoes, and nothing else
  assert.deepEqual(PACK.palettes, FREE.palettes);
  assert.deepEqual(Object.keys(PACK.palettes.cloth), ['wool0', 'wool1', 'wool2']);
  assert.equal(PACK.decorations, undefined);
});

test('six choices in each colour set, in the order the settings screen shows them, today\'s the defaults', () => {
  for (const set of Object.keys(ORDER)) assert.deepEqual(Object.keys(PACK.swatches[set]), ORDER[set], set);
  assert.deepEqual(PACK.defaults.swatches, { skin: 'warm', hair: 'brown', tabard: 'blue', plume: 'red' });
  for (const set of Object.keys(ORDER)) for (const id of ORDER[set]) assert.ok(PACK.swatches[set][id].name.length > 0, set + '/' + id);
});

test('each item and swatch is as approved: the fixture\'s, the one-handed items, the free options, the iris following the tabard', () => {
  const want = id => (id === 'main.crossbow' ? asShipped(CROSSBOW.items[id]) : FREE.items[id] || BUILDS.items[id] || OPTIONS.items[id] || ONEHAND[id] || FIXTURE.items[id]);
  for (const id of Object.keys(PACK.items)) {
    const w = id === 'off.heater' ? irisFollows(want(id)) : want(id);
    assert.deepEqual(PACK.items[id], w, id);
  }
  assert.deepEqual(Object.keys(ONEHAND), ['main.arming', 'off.heater']);
  assert.deepEqual(Object.keys(OPTIONS.items), ['hair.tied', 'hair.curls']);
  assert.deepEqual(Object.keys(BUILDS.items), ['legs.plate', 'torso.tabard', 'pauldrons.plate']);
  assert.equal(Object.keys(FREE.items).length, 25);
  // no free item shares an id with an item of 1.3.0; the library's fixture has a long hair and a
  // round shield of its own, made for its tests, which the free items replace here
  for (const id of Object.keys(FREE.items)) assert.ok(!BUILDS.items[id] && !OPTIONS.items[id] && !ONEHAND[id] && !['legs.plate', 'boots.leather', 'torso.tabard', 'head.plain',
    'hair.short', 'helm.open', 'plume.crest', 'pauldrons.plate', 'arms.plate', 'gauntlets.plate', 'main.greatsword'].includes(id), id);
  assert.notDeepEqual(PACK.items['hair.long'], FIXTURE.items['hair.long']);
  assert.notDeepEqual(PACK.items['off.round'], FIXTURE.items['off.round']);
  for (const set of Object.keys(PACK.swatches)) for (const sw of Object.keys(PACK.swatches[set])) {
    const today = FIXTURE.swatches[set][sw];
    // today's swatch is unchanged; the rest are the approved options, the green tabard of the
    // library's fixture not among them
    assert.deepEqual(PACK.swatches[set][sw], PACK.defaults.swatches[set] === sw ? today : OPTIONS.swatches[set][sw], set + '/' + sw);
  }
  for (const set of Object.keys(OPTIONS.swatches)) assert.equal(Object.keys(OPTIONS.swatches[set]).length, 5, set);
});

test('the iris of the eye takes the tabard\'s darkest band, on the tabard and the shield, worn and at rest', () => {
  assert.ok(!TEXT.includes('@base.b3'), 'no fixed blue iris is left');
  // the iris is the one shape filled with that band alone; the field's band list ends with it too
  const irises = it => JSON.stringify(it).split('"fill":"@tabard.3"').length - 1;
  assert.equal(irises(PACK.items['torso.tabard']), 1);
  assert.equal(irises(PACK.items['off.heater'].parts), 1);
  assert.equal(irises(PACK.items['off.heater'].rest), 1);
  // on the default blue tabard it is the colour the fixed iris had
  assert.equal(PACK.swatches.tabard.blue.entries['3'], PK.BASE.b3);
});

test('the default look resolves with nothing missing, on Classic, and every build at the same cost', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const L = PK.resolve(lib, {});
  assert.equal(L.ok, true);
  assert.deepEqual(L.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), []);
  assert.equal(L.look.build, 'kw.base/build.a');
  assert.deepEqual(L.grip, { kind: 'two', hands: [2, -30] });
  // the cost is counted at the ends of every value's range, so it is the same on every build; the
  // tabard's outline and cloth are four pieces each, where they were one, 99 shapes and 11932 before
  assert.equal(L.cost, 13878);
  assert.equal(L.shapes, 105);
  assert.ok(L.plumeShown);
  for (const id of Object.keys(BUILD_NAMES)) {
    const Lb = PK.resolve(lib, { build: 'kw.base/' + id });
    assert.equal(Lb.look.build, 'kw.base/' + id);
    assert.deepEqual(Lb.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), [], id);
    assert.deepEqual(Lb.m, PACK.builds[id].m, id);
    assert.deepEqual([Lb.shapes, Lb.cost], [105, 13878], id);
  }
});

test('the one-handed look resolves with nothing missing: the arming sword in one hand, the heater shield in the other', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const L = PK.resolve(lib, { items: { main: 'kw.base/main.arming', off: 'kw.base/off.heater' } });
  assert.equal(L.ok, true);
  assert.deepEqual(L.fallbacks.map(f => f.reason).filter(r => r !== 'not set'), []);
  assert.deepEqual(L.look.items.main, 'kw.base/main.arming');
  assert.deepEqual(L.look.items.off, 'kw.base/off.heater');
  assert.deepEqual(L.grip, { kind: 'one', hands: [0] });
  assert.deepEqual(L.blade, { from: 34, to: 175, half: 10 });
  assert.equal(L.shapes, 105 + 20, 'the base look and the shield; the two swords have 22 shapes each');
  assert.equal(L.lists.off.length, 20);
  assert.equal(L.lists.restOff.length, 26);
  // the shield is the tabard's colours with the gold eye: the field follows the tabard swatch
  const shield = ONEHAND['off.heater'];
  assert.deepEqual(shield.parts[0].shapes[3].fill, PACK.items['torso.tabard'].parts[0].shapes[4].fill, 'the cloth, whose first piece follows the outline\'s four');
  assert.deepEqual(shield.rest.fits, 'hang');
});

test('every choice of build, skin, hair colour, hair style, tabard and plume resolves with nothing missing, with either weapon, well under the caps', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const B = id => 'kw.base/' + id, styles = ['hair.short', 'hair.tied', 'hair.curls'];
  const weapons = [{}, { main: B('main.arming'), off: B('off.heater') }];
  let n = 0, most = { shapes: 0, cost: 0 };
  for (const build of Object.keys(BUILD_NAMES)) for (const skin of ORDER.skin) for (const hair of ORDER.hair) for (const tabard of ORDER.tabard) for (const plume of ORDER.plume) for (const style of styles) for (const w of weapons) {
    const look = { build: B(build), items: Object.assign({ hair: B(style) }, w), swatches: { skin: B(skin), hair: B(hair), tabard: B(tabard), plume: B(plume) } };
    const L = PK.resolve(lib, look);
    assert.equal(L.ok, true);
    assert.equal(L.look.build, B(build));
    const missing = L.fallbacks.filter(f => f.reason !== 'not set');
    if (missing.length) assert.deepEqual(missing, [], JSON.stringify(look));
    assert.equal(L.look.items.hair, B(style));
    assert.deepEqual(L.look.swatches, look.swatches);
    if (L.cost > most.cost) most = { shapes: L.shapes, cost: L.cost, style, w: !!w.main };
    n++;
  }
  assert.equal(n, 3 * 6 * 6 * 6 * 6 * 3 * 2);
  // the heaviest is the tied hair with the sword and shield, on any build, about a ninth of the shape
  // cap and well under half the cost cap
  assert.deepEqual(most, { shapes: 135, cost: 14470, style: 'hair.tied', w: true });
  assert.ok(most.shapes <= PK.LIMITS.lookShapes && most.cost <= PK.LIMITS.lookCost);
});

test('every item of every slot resolves with nothing missing on every build, with each weapon where the grip matters', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const missing = L => L.fallbacks.filter(f => f.reason !== 'not set');
  const one = SLOTS.main.filter(id => grip(id) === 'one'), two = SLOTS.main.filter(id => grip(id) === 'two');
  assert.deepEqual([one, two], [['main.arming', 'main.mace'], ['main.greatsword', 'main.longsword', 'main.crossbow']]);
  let n = 0;
  for (const build of Object.keys(BUILD_NAMES)) for (const [slot, ids] of Object.entries(SLOTS)) {
    if (slot === 'head') continue;
    for (const id of ids) {
      // a shield with each one-handed weapon; a weapon alone, with the heater shield when it takes one;
      // anything else with each weapon, the one-handed ones with the heater shield
      const kits = slot === 'off' ? one.map(m => ({ main: m, off: id })) : slot === 'main' ? [grip(id) === 'one' ? { main: id, off: 'off.heater' } : { main: id }]
        : SLOTS.main.map(m => (grip(m) === 'one' ? { main: m, off: 'off.heater' } : { main: m }));
      for (const kit of kits) {
        const items = Object.assign({ [slot]: B(id) }, { main: B(kit.main) }, kit.off ? { off: B(kit.off) } : {});
        const L = PK.resolve(lib, { build: B(build), items });
        assert.equal(L.ok, true);
        assert.deepEqual(missing(L), [], build + ' ' + JSON.stringify(items));
        assert.equal(L.look.items[slot], B(id));
        assert.equal(L.look.items.main, B(kit.main));
        assert.deepEqual(L.grip, PACK.items[kit.main].grip);
        assert.ok(L.shapes <= PK.LIMITS.lookShapes && L.cost <= PK.LIMITS.lookCost);
        n++;
      }
    }
  }
  assert.equal(n, 3 * (5 * (3 + 3 + 3 + 5 + 4 + 3 + 3 + 3 + 3 + 2) + 5 + 3 * 2));
  // a shield with a two-handed weapon is carried nowhere, as the heater shield is
  for (const m of two) for (const off of SLOTS.off) {
    const L = PK.resolve(lib, { items: { main: B(m), off: B(off) } });
    assert.equal(L.look.items.off, undefined);
    assert.equal(L.fallbacks.find(f => f.key === 'off').reason, 'a shield is carried only with a one-handed weapon');
  }
});

test('the mail coif has no plume mount, so no plume is drawn with it; every other helmet carries each plume', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  assert.equal(PACK.items['helm.coif'].mounts, undefined);
  for (const helm of SLOTS.helmet) for (const plume of SLOTS.plume) {
    const L = PK.resolve(lib, { items: { helmet: B(helm), plume: B(plume) } });
    assert.deepEqual(L.fallbacks.filter(f => f.reason !== 'not set'), [], helm + ' ' + plume);
    assert.equal(L.plumeShown, helm !== 'helm.coif', helm + ' ' + plume);
    assert.ok(helm === 'helm.coif' || PACK.items[helm].mounts.plume, helm);
  }
});

test('the long cloak takes the plume\'s colours and the short cape the tabard\'s, with no colour set of their own', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const sets = id => [...new Set((JSON.stringify(PACK.items[id]).match(/"@([a-z]+)\./g) || []).map(r => r.slice(2, -1)))].sort();
  assert.deepEqual(sets('back.cloak'), ['base', 'plume']);
  assert.deepEqual(sets('back.cape'), ['base', 'tabard']);
  // resolved: the cloak changes with the plume and not the tabard, the cape the other way round; the
  // back is drawn first in the body's list, six shapes for each
  const body = (back, plume, tabard) => JSON.stringify(PK.resolve(lib, { items: { back: B(back) }, swatches: { plume: B(plume), tabard: B(tabard) } }).lists.body.slice(0, 6));
  assert.equal(PACK.items['back.cloak'].parts.reduce((n, p) => n + p.shapes.length, 0), 6);
  assert.equal(PACK.items['back.cape'].parts.reduce((n, p) => n + p.shapes.length, 0), 6);
  assert.notEqual(body('back.cloak', 'red', 'blue'), body('back.cloak', 'gold', 'blue'));
  assert.equal(body('back.cloak', 'red', 'blue'), body('back.cloak', 'red', 'sable'));
  assert.notEqual(body('back.cape', 'red', 'blue'), body('back.cape', 'red', 'sable'));
  assert.equal(body('back.cape', 'red', 'blue'), body('back.cape', 'gold', 'blue'));
});

test('each weapon\'s blade: the longsword\'s steel, and the mace\'s haft and head, which the smithy heats as it does a blade', () => {
  assert.deepEqual(PACK.items['main.longsword'].blade, { from: 34, to: 222, half: 11 });
  assert.deepEqual(PACK.items['main.mace'].blade, { from: 34, to: 136, half: 16 });
  assert.deepEqual(PACK.items['main.longsword'].grip, { kind: 'two', hands: [2, -30] });
  assert.deepEqual(PACK.items['main.mace'].grip, { kind: 'one', hands: [0] });
  for (const id of SWUNG) assert.ok(PACK.items[id].blade, id);
});

test('the crossbow fires: a two-handed weapon with its barrel, muzzle, range and bolt, slung on the back when put away, and no blade', () => {
  const it = PACK.items['main.crossbow'];
  assert.equal(it.use, 'fire');
  assert.equal(it.blade, undefined);
  assert.deepEqual(it.grip, { kind: 'two', hands: [38, 0] });
  // the front hand 38 along the frame, its gauntlet behind the barrel's from
  assert.deepEqual(it.barrel, { from: 54, to: 96, half: 8 });
  assert.deepEqual(it.muzzle, { s: 96, p: 0 });
  assert.equal(it.range, 420);
  // a bolt in pale ash, with the engine's pale snap at the muzzle
  assert.deepEqual(it.shot, { kind: 'bolt', colour: '#d9b77a' });
  assert.equal(it.stowed.layer, 'back');
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  // 33 shapes held and 12 slung, 4670 and 1639 of the fills: the 45 and 6309 approved
  assert.deepEqual(lib[0].sums['main.crossbow'], { parts: { n: 33, cost: 4670 }, view: { n: 0, cost: 0 }, rest: { n: 0, cost: 0 }, stowed: { n: 12, cost: 1639 } });
  for (const id of Object.keys(BUILD_NAMES)) {
    const L = PK.resolve(lib, { build: B(id), items: { main: B('main.crossbow') } });
    assert.deepEqual(L.fallbacks.filter(f => f.reason !== 'not set'), [], id);
    assert.deepEqual(L.grip, it.grip, id);
    assert.equal(L.blade, null, id);
    assert.deepEqual([L.use, L.barrel, L.muzzle, L.range, L.shot], [it.use, it.barrel, it.muzzle, it.range, it.shot], id);
    assert.ok(L.lists.bodyStowed && L.lists.bodyStowed.length > L.lists.body.length, id + ': the stowed view has its body list');
    // the default look with the crossbow for the greatsword: the larger of the weapon held and slung
    assert.deepEqual([L.shapes, L.cost], [105 - 22 + 33, 13878 - 4652 + 4670], id);
  }
});

test('the heaviest whole look of the free items stays well under the caps, on every build, with no fallback', () => {
  const lib = [PK.read(TEXT, { allowUnsigned: true, verify })];
  const sum = id => { const s = lib[0].sums[id]; return { n: s.parts.n + s.view.n + s.rest.n, cost: s.parts.cost + s.view.cost + s.rest.cost }; };
  // each slot's costliest item, with each grip
  const most = (k, ids) => ids.slice().sort((a, b) => sum(b)[k] - sum(a)[k])[0];
  const out = {};
  for (const k of ['cost']) for (const kind of ['one', 'two']) {
    const items = {};
    for (const s of ['back', 'legs', 'boots', 'torso', 'hair', 'plume', 'helmet', 'pauldrons', 'arms', 'gauntlets']) items[s] = B(most(k, SLOTS[s]));
    items.main = B(most(k, SLOTS.main.filter(id => grip(id) === kind)));
    if (kind === 'one') items.off = B(most(k, SLOTS.off));
    const got = Object.keys(BUILD_NAMES).map(build => {
      const L = PK.resolve(lib, { build: B(build), items });
      assert.deepEqual(L.fallbacks.filter(f => f.reason !== 'not set'), [], build + ' ' + JSON.stringify(items));
      return [L.shapes, L.cost];
    });
    // the cost is a bound, the same on every build
    assert.deepEqual(got[1], got[0]); assert.deepEqual(got[2], got[0]);
    out[k + ' ' + kind] = got[0];
  }
  // the mace and the kite shield, and the longsword, each with the bascinet and its tall feather, the
  // tied hair, the breastplate, the layered spaulders, mail sleeves and chausses, plate gauntlets,
  // turnshoes and the long cloak: about a sixth of the shape cap and half the cost cap
  assert.deepEqual(out, { 'cost one': [201, 20493], 'cost two': [188, 19721] });
  for (const [n, cost] of Object.values(out)) assert.ok(n <= PK.LIMITS.lookShapes / 5 && cost <= PK.LIMITS.lookCost * 0.52);
});
