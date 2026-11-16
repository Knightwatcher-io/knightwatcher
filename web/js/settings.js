/* Knightwatcher: the settings. Works out what the display shows from four levels, highest first:
   the address's hooks, the saved settings, the defaults in the state file (from config.toml), and
   the page's own. Served by the Knightwatcher server, the saved settings are the deployment's,
   shared by every display (connect() keeps them in step with the server); with no server they are
   this browser's own, kept in its storage. Also draws the settings screen, which a press and hold
   of two seconds anywhere on the display opens. Everything above the screen is pure and loads
   under Node for the tests in tests/web/; the screen is built only by mount(), which main.js
   calls. docs/page.md describes the levels, the shared settings and the screen. */
(function (KW) {
  'use strict';

  /* ---- The choices --------------------------------------------------------------------------------
     The four sections of the contract's defaults (docs/state.md), with the values each key may
     take. A value outside these, at any level, is ignored and the next level down is used. They
     come from the settings schema, collector/settings-schema.json, which the collector checks
     config.toml against; the page carries the part it reads. */
  // settings-schema:start
  /* Written by tools/settings-schema.js from collector/settings-schema.json: change the schema and
     run the tool, never these lines. */
  const SCHEMA = {
    look: {
      world: { values: ['medieval'], long: true, page: 'medieval' },
      build: { values: ['a', 'b', 'c'], page: null },
      weapon: { values: ['greatsword', 'sword_and_shield', 'longsword', 'mace_and_shield'], page: 'greatsword' },
      skin: { values: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], page: 'warm' },
      hair: { values: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'], page: 'brown' },
      hair_style: { values: ['short', 'tied', 'curls', 'long', 'close'], page: 'short' },
      tabard: { values: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], page: 'blue' },
      plume: { values: ['red', 'white', 'gold', 'royal', 'green', 'violet'], page: 'red' },
      shield: { values: ['heater', 'round', 'kite'], page: 'heater' },
      helmet: { values: ['open', 'kettle', 'coif', 'bascinet'], page: 'open' },
      plume_style: { values: ['crest', 'feather', 'horsehair'], page: 'crest' },
      body: { values: ['tabard', 'cuirass', 'gambeson'], page: 'tabard' },
      shoulders: { values: ['plate', 'lames', 'leather'], page: 'plate' },
      arms: { values: ['plate', 'mail', 'padded'], page: 'plate' },
      hands: { values: ['plate', 'leather', 'mail'], page: 'plate' },
      legs: { values: ['plate', 'mail', 'hose'], page: 'plate' },
      feet: { values: ['leather', 'sabatons', 'shoes'], page: 'leather' },
      back: { values: ['none', 'cloak', 'cape'], page: 'none' },
      monarch: { values: ['a', 'b', 'c'], long: true, page: 'a' },
      monarch_skin: { values: ['fair', 'warm', 'golden', 'tan', 'brown', 'deep'], page: 'warm' },
      monarch_hair: { values: ['black', 'dark', 'brown', 'auburn', 'blonde', 'silver'], page: null },
      monarch_robe: { values: ['blue', 'forest', 'violet', 'wine', 'teal', 'sable'], page: null },
      foe: { values: ['goblin'], long: true, page: 'goblin' },
      critter: { values: ['fly'], long: true, page: 'fly' },
      props: { values: ['medieval'], long: true, page: 'medieval' },
      overlay: { values: ['medieval'], long: true, page: 'medieval' },
      words: { values: ['medieval'], long: true, page: 'medieval' },
      items: { values: [], long: true, keys: ['main', 'off', 'helmet', 'plume', 'hair', 'torso', 'pauldrons', 'arms', 'gauntlets', 'legs', 'boots', 'back'], page: {} },
      devices: { values: ['medieval'], long: true, keys: ['pi', 'camera', 'machine', 'vm', 'box'], page: {} }
    },
    display: {
      headline: { values: ['small', 'medium', 'large'], page: 'medium' },
      clock: { values: [24, 12], page: 24 },
      helmet_indoors: { values: [true, false], page: false }
    },
    quiet: {
      scenes: { values: ['battlement', 'camp', 'house', 'yard'], long: true, page: ['battlement', 'camp', 'house', 'yard'] },
      minutes: { min: 1, max: 240, page: 10 }
    },
    scenes: ['battlement', 'camp', 'house', 'yard', 'cellar', 'smithy', 'court']
  };
  // settings-schema:end
  /* KEY holds this browser's own choices when no server keeps them; SHARED_KEY a copy of the last
     shared settings the server gave, which a page served by it starts from until the server
     answers. */
  const KEY = 'knightwatcher.settings', SHARED_KEY = 'knightwatcher.shared', VERSION = 1;
  const pick = (sec, field) => { const o = {}; for (const k of Object.keys(SCHEMA[sec])) o[k] = SCHEMA[sec][k][field]; return o; };
  /* The quiet scenes, and every scene the page draws in the order the settings screen lists them:
     the files of web/js/scenes/. The collector's QUIET_SCENES and PAGE_SCENES follow the same
     schema. */
  const SCENES = SCHEMA.quiet.scenes.values;
  const ALL_SCENES = SCHEMA.scenes;
  const ONE_OF = { look: pick('look', 'values'), display: pick('display', 'values') };
  /* The scenes section's keys are condition ids, and which of them take part depends on what the
     scenes can act (see offered); KEYS.scenes is filled per store from the world it is given. */
  const KEYS = { look: Object.keys(ONE_OF.look), display: Object.keys(ONE_OF.display), quiet: Object.keys(SCHEMA.quiet), scenes: [] };
  const SECTIONS = Object.keys(KEYS);
  const MINUTES = { least: SCHEMA.quiet.minutes.min, most: SCHEMA.quiet.minutes.max };
  /* A long name, "<pack>/<id>", which a key marked long takes besides its short names: the
     schema's long_name, which tests/web/settings-schema.test.js holds this equal to. The look's two
     tables, items and devices, and the keys each may hold. */
  const LONG = /^[a-z][a-z0-9-]{1,31}(\.[a-z0-9-]{1,31}){0,3}\/[a-z][a-z0-9.-]{0,47}$/;
  const isLong = v => typeof v === 'string' && LONG.test(v);
  const TABLES = {};
  for (const k of KEYS.look) if (SCHEMA.look[k].keys) TABLES[k] = SCHEMA.look[k].keys;
  /* The parts a world sets (docs/page.md, Worlds): every key of the look but the world itself, the
     quiet scenes and every key of the scenes section. The display's preferences and the quiet
     scenes' length are not parts. */
  const isPart = (sec, k) => (sec === 'look' ? k !== 'world' : sec === 'quiet' ? k === 'scenes' : sec === 'scenes');
  /* The base world: the medieval world the page ships with, whose names are the schema's short
     names, and the page's own level. Its name and its card's scene when kw.medieval gives no
     preset. */
  const BASE_WORLD = 'medieval', BASE_PICTURE = 'camp', BASE_NAME = 'Medieval';
  /* The kinds of device a prop set draws, as the contract names them. */
  const KINDS = SCHEMA.look.devices.keys;
  /* The keys of the look that name a part of a world by name, short or long. */
  const PART_KINDS = ['world', 'monarch', 'foe', 'critter', 'props', 'overlay', 'words'];
  /* The levels above the page's own, highest first, their rank with the page's own below them, and
     how the console names each. */
  const LEVELS = ['hook', 'saved', 'defaults'];
  const RANK = { hook: 0, saved: 1, defaults: 2, 'built-in': 3 };
  const WHERE = { hook: 'the address', saved: 'this display\'s saved choices', shared: 'the settings saved on the server', defaults: 'the defaults in state.json' };

  /* The page's own defaults, below every other level, from the schema: the base pack's defaults for
     the knight (read from the pack in use, see builtIn; the schema's are used without one), the
     first monarch with the court's own skin and each monarch's own hair and robe (null: as drawn),
     a medium headline, a 24-hour clock, the helmet off indoors, all four quiet scenes for ten
     minutes each, and each condition in its own scene (filled from the world, see builtIn). The
     demo keeps its own minute while no level above this one sets the length. */
  const BUILT_IN = { look: pick('look', 'page'), display: pick('display', 'page'), quiet: pick('quiet', 'page'), scenes: {} };

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const show = v => (typeof v === 'string' ? '"' + v.slice(0, 40) + '"' : Array.isArray(v) ? 'a list' : isObj(v) ? 'an object' : String(v));

  /* The builds a base pack makes ready, as the contract's letters: build.a is 'a'. */
  function buildsOf(pack) {
    if (!isObj(pack) || !isObj(pack.builds)) return [];
    return Object.keys(pack.builds).map(b => /^build\.([abc])$/.exec(b)).filter(Boolean).map(m => m[1]).sort();
  }
  /* A build's name as the base pack gives it (build.a is "Classic"), or "Build A" from the letter
     where the pack has no such build. */
  const buildName = (pack, id) => (isObj(pack) && isObj(pack.builds) && isObj(pack.builds['build.' + id]) ? pack.builds['build.' + id].name : 'Build ' + id.toUpperCase());
  /* The settings screen's build row, one choice for each of the contract's builds: its name from the
     base pack on the chip with Ready under it, or, for a build the pack does not draw, greyed and
     saying Coming, its note naming the build the knight stays as (cur, the build shown). */
  function buildChoices(pack, cur) {
    const ready = buildsOf(pack), name = id => buildName(pack, id);
    return ONE_OF.look.build.map(id => (ready.includes(id)
      ? { id, chip: name(id).toUpperCase(), name: 'Ready', kind: 'wide' }
      : { id, chip: name(id).toUpperCase(), name: 'Coming', kind: 'wide', off: true, offNote: name(id) + ' is not drawn yet.' + (cur ? ' The knight stays as ' + name(cur) + '.' : '') }));
  }

  /* The world the settings are checked against and resolved in: what the page has loaded. In the
     page it comes from the loaded scenes, KW.state and KW.world (see pageWorld); under Node a test
     gives its own. Every field may be left out:
       can     each scene's list of the conditions it can act, by its short name (its can field)
       homes   each condition's own scene in the base world, or null for one that plays in the quiet
               scene of the moment: the medieval preset's scenes.for, or KW.state.CONDITIONS
               without it
       quiet   the base world's quiet scenes, in the order they take turns: the medieval preset's,
               or SCENES without it
       scenes  each scene of a loaded pack by its long name, { can, quiet }
       names   for each kind of part (PART_KINDS, and scene), the long names the page has loaded and
               the name each stands for: kw.medieval/props.medieval stands for 'medieval'. The
               schema's short names are always loaded, and so is every long name in scenes, worlds
               and sets, standing for itself.
       worlds  each loaded world by its name, { name, pack, version, signed, picture, preset,
               words }: pack the pack's id, version and signed the pack's, picture the scene its
               card shows, preset the pack's preset as it reads, words its word set's labels. The
               base world, 'medieval', is always there, drawn from code while its pack gives no
               preset (preset null).
       sets    each loaded prop set by its name, { name, kinds }; the base world's, 'medieval',
               draws every kind
       items   each item the knight can wear by its long name, and the slot it fills: the base
               pack's, see itemsOf */
  function worldOf(w) {
    const src = isObj(w) ? w : {};
    if (src.normal === true) return src;
    const out = { normal: true, can: {}, homes: {}, quiet: SCENES.slice(), scenes: {}, names: {}, worlds: {}, sets: {}, items: {} };
    if (isObj(src.can)) for (const k of ALL_SCENES) if (Array.isArray(src.can[k])) out.can[k] = src.can[k].filter(c => typeof c === 'string');
    if (isObj(src.homes)) for (const c of Object.keys(src.homes)) out.homes[c] = typeof src.homes[c] === 'string' ? src.homes[c] : null;
    if (Array.isArray(src.quiet) && src.quiet.some(s => typeof s === 'string')) out.quiet = src.quiet.filter(s => typeof s === 'string');
    if (isObj(src.scenes)) for (const n of Object.keys(src.scenes)) {
      const s = src.scenes[n];
      if (isLong(n) && isObj(s) && Array.isArray(s.can)) out.scenes[n] = { can: s.can.filter(c => typeof c === 'string'), quiet: s.quiet === true };
    }
    for (const kind of PART_KINDS.concat('scene')) {
      const m = out.names[kind] = {};
      for (const v of kind === 'scene' ? ALL_SCENES : SCHEMA.look[kind].values) m[v] = v;
      const given = isObj(src.names) && isObj(src.names[kind]) ? src.names[kind] : {};
      for (const n of Object.keys(given)) if (isLong(n) && typeof given[n] === 'string') m[n] = given[n];
    }
    for (const n of Object.keys(out.scenes)) if (!has(out.names.scene, n)) out.names.scene[n] = n;
    out.worlds[BASE_WORLD] = { name: BASE_NAME, pack: null, version: null, signed: false, picture: BASE_PICTURE, preset: null, words: null };
    if (isObj(src.worlds)) for (const n of Object.keys(src.worlds)) {
      const x = src.worlds[n];
      if (!((n === BASE_WORLD || isLong(n)) && isObj(x))) continue;
      out.worlds[n] = { name: typeof x.name === 'string' ? x.name : n, pack: typeof x.pack === 'string' ? x.pack : null, version: typeof x.version === 'string' ? x.version : null,
        signed: x.signed === true, picture: typeof x.picture === 'string' ? x.picture : BASE_PICTURE, preset: isObj(x.preset) ? x.preset : null, words: isObj(x.words) ? x.words : null };
      out.names.world[n] = n;
    }
    out.sets[BASE_WORLD] = { name: 'Medieval devices', kinds: KINDS.slice() };
    if (isObj(src.sets)) for (const n of Object.keys(src.sets)) {
      const x = src.sets[n];
      if (!((n === BASE_WORLD || isLong(n)) && isObj(x))) continue;
      out.sets[n] = { name: typeof x.name === 'string' ? x.name : n, kinds: Array.isArray(x.kinds) ? x.kinds.filter(k => KINDS.includes(k)) : [] };
      out.names.props[n] = n;
    }
    if (isObj(src.items)) for (const n of Object.keys(src.items)) if (isLong(n) && TABLES.items.includes(src.items[n])) out.items[n] = src.items[n];
    return out;
  }
  /* The items of a base pack, by their long names, and the slot each fills. */
  function itemsOf(pack) {
    const out = {}, items = isObj(pack) && isObj(pack.items) ? pack.items : {};
    for (const id of Object.keys(items)) if (isObj(items[id]) && TABLES.items.includes(items[id].slot)) out['kw.base/' + id] = items[id].slot;
    return out;
  }
  /* The conditions whose scene may be chosen, in the order of homes (the conditions' priority),
     each with the scenes that can act it, in the order of ALL_SCENES. A condition takes part when
     it has a scene of its own and more than one scene can act it; night never does, since only the
     house has the bed and the knight sleeps where the bed is. */
  function offered(w) {
    const W = worldOf(w), out = {};
    for (const c of Object.keys(W.homes)) {
      if (c === 'night' || !W.homes[c]) continue;
      const list = ALL_SCENES.filter(k => W.can[k] && W.can[k].includes(c));
      if (list.length > 1 && list.includes(W.homes[c])) out[c] = list;
    }
    return out;
  }

  /* The look's gear, in the contract's names: each weapon and the base pack's item it carries, the
     one-handed ones with the shield the shield key chooses; and each key that chooses one item, the
     slot it fills and the prefix of the base pack's ids for it, so that hair_style "long" is
     kw.base/hair.long and feet "shoes" kw.base/boots.shoes. back "none" fills nothing. */
  const WEAPONS = { greatsword: 'main.greatsword', sword_and_shield: 'main.arming', longsword: 'main.longsword', mace_and_shield: 'main.mace' };
  const ONE_HANDED = ['sword_and_shield', 'mace_and_shield'];
  /* Each weapon as the settings screen and the admin page show it: its name and how it is held. */
  const WEAPON_CHIPS = { greatsword: ['Greatsword', 'Two hands'], sword_and_shield: ['Sword and shield', 'One hand each'], longsword: ['Longsword', 'Two hands'],
    mace_and_shield: ['Mace and shield', 'One hand each'] };
  const ITEMS = { shield: ['off', 'off'], hair_style: ['hair', 'hair'], helmet: ['helmet', 'helm'], plume_style: ['plume', 'plume'], body: ['torso', 'torso'],
    shoulders: ['pauldrons', 'pauldrons'], arms: ['arms', 'arms'], hands: ['gauntlets', 'gauntlets'], legs: ['legs', 'legs'], feet: ['boots', 'boots'], back: ['back', 'back'] };
  const itemId = (k, v) => ITEMS[k][1] + '.' + v;

  /* The look keys for a knight given as a base pack's defaults give it, { build, items, swatches },
     in the base pack's own ids ('build.a', 'main.greatsword', 'warm'): the build, null for one the
     contract has no letter for, and each other key whose value the contract knows; back is 'none'
     where nothing fills the back. */
  function lookOf(d) {
    const L = {}, items = isObj(d.items) ? d.items : {}, sw = isObj(d.swatches) ? d.swatches : {};
    const b = /^build\.([abc])$/.exec(d.build || '');
    L.build = b ? b[1] : null;
    for (const w of ONE_OF.look.weapon) if (items.main === WEAPONS[w]) L.weapon = w;
    for (const k of Object.keys(ITEMS)) {
      const [slot, prefix] = ITEMS[k], id = typeof items[slot] === 'string' ? items[slot] : '';
      const v = id.startsWith(prefix + '.') ? id.slice(prefix.length + 1) : null;
      if (v !== null && ONE_OF.look[k].includes(v)) L[k] = v;
      else if (k === 'back' && !id) L.back = 'none';
    }
    for (const k of ['skin', 'hair', 'tabard', 'plume']) if (ONE_OF.look[k].includes(sw[k])) L[k] = sw[k];
    return L;
  }

  /* The page's own level, the base world: the knight from the base pack's defaults where there is
     one (its default build, weapon, gear and swatches, each as the contract names it), the base
     world's quiet scenes, and each condition that takes part in its own scene. */
  function builtIn(pack, world) {
    const out = JSON.parse(JSON.stringify(BUILT_IN)), d = isObj(pack) && isObj(pack.defaults) ? pack.defaults : null;
    const W = worldOf(world);
    for (const c of Object.keys(offered(W))) out.scenes[c] = W.homes[c];
    out.quiet.scenes = W.quiet.slice();
    if (d) Object.assign(out.look, lookOf(d));
    return out;
  }

  /* The slot each of the look's item keys fills, the weapon's included: main is the weapon's. */
  const SLOT_KEY = { main: 'weapon' };
  for (const k of Object.keys(ITEMS)) SLOT_KEY[ITEMS[k][0]] = k;
  /* A name of the pack packId, local or long, as a long name. */
  const longOf = (packId, n) => (typeof n !== 'string' ? '' : n.indexOf('/') < 0 ? packId + '/' + n : n);
  const sceneCan = (W, s) => (has(W.can, s) ? W.can[s] : has(W.scenes, s) ? W.scenes[s].can : []);
  const sceneQuiet = (W, s) => W.quiet.includes(s) || (has(W.scenes, s) && W.scenes[s].quiet);

  /* What the world id sets, in the contract's names: { look, quiet, scenes, homes, faults }. The base
     world sets base, the page's own. Another world's preset is read part by part: its outfit as the
     look's keys, with each item no key can name in items; its patron, foe and critter, props,
     overlay and words by the names the page has loaded; its quiet scenes; and its scene for each
     condition. A part the page has not loaded, or cannot draw, keeps the base world's and is listed
     in faults as { part, value, why }. homes holds the world's scene for every condition with one,
     the base world's where the world's cannot be used. */
  function worldParts(world, id, base) {
    const W = worldOf(world), x = W.worlds[id], out = { look: {}, quiet: { scenes: base.quiet.scenes.slice() }, scenes: Object.assign({}, base.scenes), homes: {}, faults: [] };
    for (const k of KEYS.look) if (k !== 'world') out.look[k] = isObj(base.look[k]) ? Object.assign({}, base.look[k]) : base.look[k];
    for (const c of Object.keys(W.homes)) if (W.homes[c]) out.homes[c] = W.homes[c];
    if (id === BASE_WORLD || !x || !x.preset) return out;
    const p = x.preset, pack = x.pack, fault = (part, value, why) => out.faults.push({ part, value, why });
    const name = (kind, n) => { const l = longOf(pack, n); return has(W.names[kind], l) ? W.names[kind][l] : null; };
    // the knight: the base pack's build, items and swatches by the contract's keys, other items by name
    const o = isObj(p.outfit) ? p.outfit : {}, d = { items: {}, swatches: {} }, B = 'kw.base/';
    if (typeof p.body === 'string') { if (p.body.startsWith(B)) d.build = p.body.slice(B.length); else fault('look.build', p.body, 'only the base pack\'s builds are drawn'); }
    const items = isObj(o.items) ? o.items : {}, sw = isObj(o.swatches) ? o.swatches : {};
    for (const s of Object.keys(items)) { const l = longOf(pack, items[s]); if (l.startsWith(B)) d.items[s] = l.slice(B.length); }
    for (const s of Object.keys(sw)) { const l = longOf(pack, sw[s]); if (l.startsWith(B)) d.swatches[s] = l.slice(B.length); else fault('look.' + s, l, 'only the base pack\'s swatches are drawn'); }
    if (!has(d, 'build')) d.build = 'build.' + base.look.build;
    const L = lookOf(d);
    for (const k of Object.keys(L)) if (L[k] !== null) out.look[k] = L[k];
    // an item no key names: the base pack's with a value the contract lacks, or another pack's
    for (const s of Object.keys(items)) {
      const k = SLOT_KEY[s], l = longOf(pack, items[s]);
      if (!(k && has(L, k) && l.startsWith(B))) out.look.items[s] = l;
    }
    // the cast, the devices, the overlay and the words
    const parts = [['monarch', isObj(p.cast) ? p.cast.patron : undefined], ['foe', isObj(p.cast) ? p.cast.foe : undefined], ['critter', isObj(p.cast) ? p.cast.critter : undefined],
      ['props', p.props], ['overlay', p.overlay], ['words', p.words]];
    for (const [k, n] of parts) {
      if (n === undefined) continue;
      const c = name(k, n);
      if (c === null) fault('look.' + k, longOf(pack, n), 'not loaded'); else out.look[k] = c;
    }
    // the scenes: the quiet scenes in turn, and the scene of each condition
    const sc = isObj(p.scenes) ? p.scenes : {};
    if (Array.isArray(sc.quiet)) {
      const list = [];
      for (const n of sc.quiet) {
        const c = name('scene', n);
        if (c === null) fault('quiet.scenes', longOf(pack, n), 'not loaded');
        else if (!sceneQuiet(W, c)) fault('quiet.scenes', longOf(pack, n), 'not a quiet scene');
        else if (!list.includes(c)) list.push(c);
      }
      if (list.length) out.quiet.scenes = list;
    }
    if (isObj(sc.for)) for (const cond of Object.keys(sc.for)) {
      if (!has(W.homes, cond) || !W.homes[cond]) continue;
      const c = name('scene', sc.for[cond]);
      if (c === null) fault('scenes.' + cond, longOf(pack, sc.for[cond]), 'not loaded');
      else if (!sceneCan(W, c).includes(cond)) fault('scenes.' + cond, longOf(pack, sc.for[cond]), 'that scene cannot act it');
      else { out.homes[cond] = c; if (has(out.scenes, cond)) out.scenes[cond] = c; }
    }
    return out;
  }

  /* One section of one level, with only the keys and values the page knows. say(line, fault) is
     told of each thing left out, fault being { section, key, value, where, why }. ready is the list
     of builds the packs make ready: a build outside it is left out as well. world is what the page
     has loaded (see worldOf): a long name it has not loaded is left out, and so is a scene that
     cannot act the condition it is given. A long name the page has loaded is kept as the name it
     stands for, kw.medieval/props.medieval as 'medieval'. */
  function clean(section, raw, where, ready, say, world) {
    const out = {};
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) { say('knightwatcher: settings: ' + section + ' in ' + WHERE[where] + ' is not an object, so it is ignored', { section, key: null, value: raw, where, why: 'not an object' }); return out; }
    const no = (k, v, why) => say('knightwatcher: settings: ' + section + '.' + k + ' ' + show(v) + ' in ' + WHERE[where] + ' is ignored: ' + why, { section, key: k, value: v, where, why });
    const W = worldOf(world), named = (kind, v) => (typeof v === 'string' && has(W.names[kind], v) ? W.names[kind][v] : null);
    const unknown = (v, what) => (isLong(v) ? 'no pack the page has loaded gives ' + what : 'not ' + (what === 'it' ? 'a value' : what.replace(/^that/, 'a')) + ' the page knows');
    if (section === 'scenes') {
      const offer = offered(W);
      for (const k of Object.keys(raw)) {
        const v = raw[k], s = named('scene', v);
        if (!has(W.homes, k)) no(k, v, 'not a condition the page knows');
        else if (!has(offer, k)) no(k, v, 'the page offers no choice of scene for it');
        else if (s === null) no(k, v, unknown(v, 'that scene'));
        else if (!(offer[k].includes(s) || (has(W.scenes, s) && W.scenes[s].can.includes(k)))) no(k, v, 'that scene cannot act it');
        else out[k] = s;
      }
      return out;
    }
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (!KEYS[section].includes(k)) { no(k, v, 'not a setting the page knows'); continue; }
      if (section === 'quiet' && k === 'scenes') {
        if (!Array.isArray(v)) { no(k, v, 'not a list of scenes'); continue; }
        const list = [];
        for (const x of v) {
          const s = named('scene', x);
          if (s === null && isLong(x)) no(k, x, unknown(x, 'that scene'));
          else if (s === null || !sceneQuiet(W, s)) no(k, x, 'not a quiet scene');
          // in the order given, the first of any repeat kept
          else if (!list.includes(s)) list.push(s);
        }
        if (!list.length) { no(k, v, 'it names no quiet scene'); continue; }
        out.scenes = list;
      } else if (section === 'quiet') {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < MINUTES.least || v > MINUTES.most) { no(k, v, 'not a number of minutes from 1 to 240'); continue; }
        out.minutes = v;
      } else if (section === 'look' && has(TABLES, k)) {
        if (!isObj(v)) { no(k, v, 'not a table'); continue; }
        const o = {};
        for (const sub of Object.keys(v)) {
          const x = v[sub], kk = k + '.' + sub;
          if (!TABLES[k].includes(sub)) no(kk, x, k === 'items' ? 'not a slot' : 'not a kind of device');
          else if (k === 'devices') { const c = named('props', x); if (c === null) no(kk, x, unknown(x, 'that prop set')); else o[sub] = c; }
          else if (!isLong(x)) no(kk, x, 'not an item\'s long name, "<pack>/<item>"');
          else if (!has(W.items, x)) no(kk, x, 'no pack the page has loaded gives that item');
          else if (W.items[x] !== sub) no(kk, x, 'the item is for the ' + W.items[x] + ' slot');
          else o[sub] = x;
        }
        if (Object.keys(o).length) out[k] = o;
      } else if (section === 'look' && PART_KINDS.includes(k)) {
        const c = named(k, v);
        if (c === null) no(k, v, unknown(v, 'it'));
        else out[k] = c;
      } else if (!ONE_OF[section][k].includes(v)) no(k, v, 'not a value the page knows');
      else if (section === 'look' && k === 'build' && !(ready || []).includes(v)) no(k, v, 'no pack draws that build');
      else out[k] = v;
    }
    return out;
  }

  /* What the display shows: { values, from, world, masked, faults }, values and from each with the
     four sections. values holds every key, and items and devices each sub-key that is set; from
     says where each came from: 'hook', 'saved', 'defaults', 'built-in', or 'world' for a part the
     world in use gave. levels holds the cleaned sections of each level, { hook, saved, defaults },
     and base the page's own. world is what the page has loaded (see worldOf).

     The world counts as setting every part at the level it was chosen at (docs/page.md, Worlds): a
     part a level at or above the world's sets is that level's, one only a level below sets gives
     way to the world's, and is listed in masked as { section, key, level, value }. With no level
     choosing a world, the base world is the page's own, and every part is as before. world says
     { id, from, homes }: the world in use, the level it was chosen at, and its scene for each
     condition. faults lists the world's parts the page could not use (see worldParts). */
  function resolve(levels, base, world) {
    const values = {}, from = {}, masked = [];
    const at = (sec, k, sub) => LEVELS.find(l => levels[l] && isObj(levels[l][sec]) && has(levels[l][sec], k) && (sub === undefined || (isObj(levels[l][sec][k]) && has(levels[l][sec][k], sub))));
    const wl = at('look', 'world') || null, id = wl ? levels[wl].look.world : base.look.world;
    const parts = worldParts(world, id, base), wr = wl ? RANK[wl] : RANK['built-in'];
    // the world gives a part a level below it leaves to it; a part set by such a level is masked
    const pick = (sec, k, sub, own, given) => {
      const lv = at(sec, k, sub), value = lv ? (sub === undefined ? levels[lv][sec][k] : levels[lv][sec][k][sub]) : undefined;
      if (lv && RANK[lv] <= wr) return [value, lv];
      if (lv) masked.push({ section: sec, key: sub === undefined ? k : k + '.' + sub, level: lv, value });
      return wl ? [given, 'world'] : [own, 'built-in'];
    };
    for (const sec of SECTIONS) {
      values[sec] = {}; from[sec] = {};
      // the scenes section has a key for each condition that takes part, which the page's own holds
      for (const k of sec === 'scenes' ? Object.keys(base.scenes || {}) : KEYS[sec]) {
        if (sec === 'look' && has(TABLES, k)) {
          values.look[k] = {}; from.look[k] = {};
          for (const sub of TABLES[k]) {
            const [v, f] = pick('look', k, sub, undefined, parts.look[k][sub]);
            if (v !== undefined) { values.look[k][sub] = v; from.look[k][sub] = f; }
          }
        } else if (isPart(sec, k)) [values[sec][k], from[sec][k]] = pick(sec, k, undefined, base[sec][k], parts[sec][k]);
        else {
          const lv = at(sec, k);
          values[sec][k] = lv ? levels[lv][sec][k] : base[sec][k];
          from[sec][k] = lv || 'built-in';
        }
      }
    }
    return { values, from, world: { id, from: wl || 'built-in', homes: parts.homes }, masked, faults: parts.faults };
  }

  /* The look for KW.knight.look(), in the shape the pack library resolves: only what a level above
     the page's own sets, so that with nothing set the knight is the base pack's defaults exactly
     as before there were settings. A part another world gives counts as set, and so its outfit is
     drawn; the base world's is the page's own. An item named in items is drawn in its slot over
     the key that would choose it. */
  function knightLook(r) {
    const v = r.values.look, F = r.from.look, other = isObj(r.world) && r.world.id !== BASE_WORLD;
    const set = k => F[k] !== 'built-in' && (F[k] !== 'world' || other), B = 'kw.base/', look = {};
    const item = (slot, id) => { (look.items = look.items || {})[slot] = B + id; };
    if (set('build') && v.build) look.build = B + 'build.' + v.build;
    // a weapon set carries its shield, the one the shield key gives, when it is one-handed; a shield
    // set alone matters only beside a one-handed weapon
    const one = ONE_HANDED.includes(v.weapon);
    if (set('weapon')) { item('main', WEAPONS[v.weapon]); if (one) item('off', itemId('shield', v.shield)); }
    else if (set('shield') && one) item('off', itemId('shield', v.shield));
    for (const k of ['skin', 'hair', 'tabard', 'plume']) if (set(k)) (look.swatches = look.swatches || {})[k] = B + v[k];
    for (const k of Object.keys(ITEMS)) if (k !== 'shield' && set(k) && v[k] !== 'none') item(ITEMS[k][0], itemId(k, v[k]));
    const named = isObj(v.items) ? v.items : {};
    for (const slot of Object.keys(named)) if (F.items[slot] !== 'world' || other) (look.items = look.items || {})[slot] = named[slot];
    return look;
  }
  /* What the settings screen greys, from what the look shows: the shield with a two-handed weapon,
     which carries none; and the plume with a helmet the base pack gives no plume mount, the mail
     coif, its colour too unless the long cloak, which takes the plume's colours, is worn. Each is
     the line said when a greyed choice is tapped, or '' when the row is live. */
  function greyed(v, pack) {
    const out = { shield: '', plume_style: '', plume: '' };
    if (!ONE_HANDED.includes(v.weapon)) out.shield = 'A shield is carried only with a one-handed weapon: the sword and shield or the mace and shield.';
    const helm = isObj(pack) && isObj(pack.items) ? pack.items[itemId('helmet', v.helmet)] : null;
    if (isObj(helm) && !(isObj(helm.mounts) && helm.mounts.plume)) {
      out.plume_style = 'The ' + helm.name.toLowerCase() + ' has no plume mount, so no plume is drawn with it.';
      if (v.back !== 'cloak') out.plume = out.plume_style;
    }
    return out;
  }
  /* The choices of a gear key the base pack in use draws, in the schema's order, each { id, name }
     with the item's name from the pack; back's "none" is named Nothing. The weapons are those whose
     item the pack holds, named as WEAPON_CHIPS names them. */
  function itemChoices(pack, k) {
    const items = isObj(pack) && isObj(pack.items) ? pack.items : {};
    if (k === 'weapon') return ONE_OF.look.weapon.filter(w => isObj(items[WEAPONS[w]])).map(w => ({ id: w, name: WEAPON_CHIPS[w][0], sub: WEAPON_CHIPS[w][1] }));
    return ONE_OF.look[k].filter(v => v === 'none' || isObj(items[itemId(k, v)])).map(v => ({ id: v, name: v === 'none' ? 'Nothing' : items[itemId(k, v)].name }));
  }

  /* What the engine takes from the settings (docs/page.md): the quiet scenes in turn and how long
     each lasts, ownMs while no level above the page's own sets the length (the demo's minute, or
     live mode's ten); the patron, the monarch, as { id, skin, hair, robe }, the skin, hair and robe
     from the base pack's skin, hair and tabard swatches, each null for the court's own while
     nothing sets it or there is no base pack; the scene chosen for each condition, holding only
     what a level above the page's own sets; homes, the world's own scene for each condition; and
     kinds, the prop set each kind of device is drawn from. */
  function engineInput(r, pack, ownMs) {
    const q = r.values.quiet, L = r.values.look;
    const swatch = (set, id) => { const sw = isObj(pack) && isObj(pack.swatches) && isObj(pack.swatches[set]) ? pack.swatches[set][id] : null; return isObj(sw) && isObj(sw.entries) ? sw.entries : null; };
    const set = k => r.from.look[k] !== 'built-in' && r.from.look[k] !== 'world' && L[k] !== null;
    const sk = set('monarch_skin') ? swatch('skin', L.monarch_skin) : null, hr = set('monarch_hair') ? swatch('hair', L.monarch_hair) : null, rb = set('monarch_robe') ? swatch('tabard', L.monarch_robe) : null;
    const patron = { id: L.monarch, skin: sk ? { id: L.monarch_skin, face: sk.face, cheek: sk.cheek } : null,
      hair: hr ? { id: L.monarch_hair, bands: [hr['0'], hr['1'], hr['2']], brow: hr.brow } : null,
      robe: rb ? { id: L.monarch_robe, bands: [rb['0'], rb['1'], rb['2'], rb['3']] } : null };
    const scenes = {};
    for (const c of Object.keys(r.values.scenes || {})) if (LEVELS.includes(r.from.scenes[c])) scenes[c] = r.values.scenes[c];
    const kinds = {}, by = isObj(L.devices) ? L.devices : {};
    for (const k of KINDS) kinds[k] = typeof by[k] === 'string' ? by[k] : typeof L.props === 'string' ? L.props : BASE_WORLD;
    const homes = isObj(r.world) && isObj(r.world.homes) ? Object.assign({}, r.world.homes) : {};
    return { turns: q.scenes.slice(), turnMs: r.from.quiet.minutes === 'built-in' ? ownMs : q.minutes * 60000, patron, scenes, homes, kinds };
  }

  /* The clock's words for a time: { time, half }. On the 24-hour clock '09:42' and no half; on the
     12-hour clock '9:42' and 'AM' or 'PM', midnight's hour being 12 AM and noon's 12 PM. */
  function clock(h, m, hours) {
    const two = n => String(n).padStart(2, '0');
    if (hours !== 12) return { time: two(h) + ':' + two(m), half: '' };
    return { time: (h % 12 || 12) + ':' + two(m), half: h < 12 ? 'AM' : 'PM' };
  }

  /* ---- This display's saved choices ------------------------------------------------------------
     One key in the browser's storage, KEY, holding { "v": 1, "look": {...}, "display": {...},
     "quiet": {...}, "scenes": {...} } with the contract's names and values; a text saved before
     there was a scenes section reads as it did. Every read and write is wrapped, since
     a browser may refuse storage outright; the choices then last until the page is reloaded. */
  function load(storage, say) {
    let text = null;
    try { text = storage().getItem(KEY); } catch (e) { say('knightwatcher: settings: this browser keeps no saved choices, so choices last until the page is reloaded'); return {}; }
    if (text === null || text === undefined) return {};
    let j = null;
    try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!isObj(j) || j.v !== VERSION) { say('knightwatcher: settings: the saved choices are not in a form this page reads, so they are ignored'); return {}; }
    const out = {};
    for (const sec of SECTIONS) if (has(j, sec)) out[sec] = j[sec];
    return out;
  }
  function save(storage, saved, say) {
    const j = { v: VERSION };
    for (const sec of SECTIONS) j[sec] = isObj(saved[sec]) ? saved[sec] : {};
    try { storage().setItem(KEY, JSON.stringify(j)); return true; } catch (e) {
      say('knightwatcher: settings: this browser refused to save the choices, so they last until the page is reloaded');
      return false;
    }
  }

  /* ---- The shared settings ------------------------------------------------------------------------
     The server's answer at api/settings, { "v": 1, "look": {...}, "display": {...}, "quiet": {...},
     "scenes": {...} } with only the keys saved (docs/server.md), as { v, look, display, quiet,
     scenes } with every section an object, or null when it is not in that form. */
  function sharedOf(j) {
    if (!isObj(j) || j.v !== VERSION) return null;
    for (const sec of SECTIONS) if (has(j, sec) && !isObj(j[sec])) return null;
    const out = { v: VERSION };
    for (const sec of SECTIONS) out[sec] = isObj(j[sec]) ? JSON.parse(JSON.stringify(j[sec])) : {};
    return out;
  }
  const emptyShared = j => SECTIONS.every(sec => !Object.keys(j[sec]).length);
  /* The copy of the last shared settings, or null. Says nothing when storage is refused: load()
     says it. */
  function loadCache(storage) {
    try { const t = storage().getItem(SHARED_KEY); return t === null || t === undefined ? null : sharedOf(JSON.parse(t)); } catch (e) { return null; }
  }

  /* ---- The store -----------------------------------------------------------------------------------
     create(o) holds the levels and answers what the display shows. o: hooks, the address's hooks in
     the contract's shape ({ look, display, quiet }); storage, a function returning the browser's
     storage (it may throw); pack, a function returning the base pack in use or null; world, a
     function returning what the scenes can act ({ can, homes }, see worldOf), which in the page
     defaults to what the loaded scenes and KW.state declare; say, where the console lines go (each
     said once). The store tells each listener on() added whenever what the display shows changes. */
  function create(o) {
    o = isObj(o) ? o : {};
    const said = new Set(), sayTo = typeof o.say === 'function' ? o.say : line => { if (typeof console !== 'undefined') console.warn(line); };
    const say = line => { if (!said.has(line)) { said.add(line); sayTo(line); } };
    const storage = typeof o.storage === 'function' ? o.storage : () => null;
    const pack = typeof o.pack === 'function' ? o.pack : () => null;
    const hooks = isObj(o.hooks) ? o.hooks : {};
    const world = typeof o.world === 'function' ? o.world : pageWorld;
    /* Where the saved level comes from: 'local', this browser's choices under KEY; 'cache', the
       copy of the shared settings, until the server answers (only with o.cache, which main.js sets
       when the page is served); 'server', the shared settings the server gave. */
    const cached = o.cache ? loadCache(storage) : null;
    let src = cached ? 'cache' : 'local', saved = cached ? cached : load(storage, say), defaults = null, last = '', sender = null;
    const listeners = [];
    const sections = () => { const out = {}; for (const sec of SECTIONS) out[sec] = isObj(saved[sec]) ? JSON.parse(JSON.stringify(saved[sec])) : {}; return out; };
    /* A choice made on this display: kept in the browser with no server, sent to the server
       (through the function sending() was given) with one, naming the sections it changed. */
    const commit = secs => { if (src === 'local') save(storage, saved, say); else if (sender) sender(secs); };
    /* What the page has loaded (see worldOf), with the base pack's items. */
    const loaded = () => { const w = worldOf(world()); return Object.assign({}, w, { items: Object.assign(itemsOf(pack()), w.items) }); };
    const levelOf = (raw, where, ready, w, note) => {
      const out = {};
      for (const sec of SECTIONS) out[sec] = clean(sec, isObj(raw) ? raw[sec] : undefined, where, ready, note, w);
      return out;
    };
    const cleanSaved = (sec, raw, quiet) => clean(sec, raw, 'saved', buildsOf(pack()), quiet ? () => {} : say, loaded());
    /* The levels resolved (see resolve), with ignored, what the levels set that the page left out:
       each { section, key, value, where, why }, as the console was told. */
    function resolved(own) {
      const p = pack(), ready = buildsOf(p), w = loaded(), ignored = [];
      const note = (line, f) => { say(line); if (f) ignored.push(f); };
      const levels = { defaults: levelOf(defaults, 'defaults', ready, w, note) };
      if (own) Object.assign(levels, { hook: levelOf(hooks, 'hook', ready, w, note), saved: levelOf(saved, src === 'local' ? 'saved' : 'shared', ready, w, note) });
      return Object.assign(resolve(levels, builtIn(p, w), w), { ignored });
    }
    const now = () => resolved(true);
    /* What the display shows, as text to compare: what was ignored, and where, changes nothing on
       screen. */
    const shownKey = () => { const r = now(); delete r.ignored; return JSON.stringify(r); };
    /* What the display would show with no hooks and no saved choices: the defaults over the page's
       own. */
    const fallback = () => resolved(false);
    function changed() {
      const key = shownKey();
      if (key === last) return;
      last = key;
      for (const fn of listeners) fn();
    }
    last = shownKey();
    return {
      now, fallback,
      /* Saves value for section.key on this display. A value the page does not know is refused
         and false returned. */
      choose(section, k, value) {
        if (!has(KEYS, section)) return false;
        const one = cleanSaved(section, { [k]: value });
        if (!has(one, k)) return false;
        saved = Object.assign({}, saved, { [section]: Object.assign(cleanSaved(section, saved[section], true), one) });
        commit([section]); changed();
        return true;
      },
      /* Saves the world id on this display and clears every part this display has chosen (docs/page.md,
         Worlds): the look's other keys, the quiet scenes and the scene of each condition, in one
         write. The display's preferences and the quiet scenes' length stay. Returns what was
         cleared, each as 'section.key', or null, saving nothing, for a world the page has not
         loaded. */
      chooseWorld(id) {
        const one = cleanSaved('look', { world: id });
        if (!has(one, 'world')) return null;
        const look = isObj(saved.look) ? saved.look : {}, quiet = isObj(saved.quiet) ? Object.assign({}, saved.quiet) : {}, sc = isObj(saved.scenes) ? saved.scenes : {};
        const cleared = Object.keys(look).filter(k => k !== 'world').map(k => 'look.' + k);
        if (has(quiet, 'scenes')) { cleared.push('quiet.scenes'); delete quiet.scenes; }
        for (const k of Object.keys(sc)) cleared.push('scenes.' + k);
        saved = Object.assign({}, saved, { look: { world: one.world }, quiet, scenes: {} });
        commit(['look', 'quiet', 'scenes']); changed();
        return cleared;
      },
      /* Clears this display's choice for one key, which then falls back to the defaults: the
         monarch's hair and robe "As drawn". */
      clear(section, k) {
        if (!has(KEYS, section) || !isObj(saved[section]) || !has(saved[section], k)) return;
        const rest = Object.assign({}, saved[section]); delete rest[k];
        saved = Object.assign({}, saved, { [section]: rest });
        commit([section]); changed();
      },
      /* Clears this display's choices for a section, which then falls back to the defaults. */
      reset(section) {
        if (!has(KEYS, section) || !has(saved, section)) return;
        saved = Object.assign({}, saved); delete saved[section];
        commit([section]); changed();
      },
      /* Whether this display has choices of its own in a section. */
      own: section => isObj(saved[section]) && Object.keys(cleanSaved(section, saved[section], true)).length > 0,
      /* The conditions whose scene may be chosen, each with the scenes that can act it. */
      offered: () => offered(loaded()),
      /* What the page has loaded: the worlds, the prop sets, the scenes and the names (see worldOf). */
      catalogue: loaded,
      /* What the world id sets, in the contract's names (see worldParts). */
      parts(id) { const w = loaded(); return worldParts(w, id, builtIn(pack(), w)); },
      /* The look of the knight in the world id as it comes, with nothing changed from it, for
         KW.knight.look(): {} for the base world. */
      worldLook(id) {
        const w = loaded(), lv = { saved: { look: { world: id }, display: {}, quiet: {}, scenes: {} } };
        return knightLook(resolve(lv, builtIn(pack(), w), w));
      },
      /* The defaults section of the latest valid state file, raw, or null. */
      defaults(raw) {
        const next = isObj(raw) ? raw : null;
        if (JSON.stringify(next) === JSON.stringify(defaults)) return;
        defaults = next; changed();
      },
      /* Tells the store that what it reads may have changed (the packs in use). */
      check: changed,
      on(fn) { if (typeof fn === 'function') listeners.push(fn); },
      /* Where choices are kept: 'server', the shared settings (the server has answered, or the
         page starts from their copy), or 'local', this browser. */
      mode: () => (src === 'local' ? 'local' : 'server'),
      /* The saved level, every section an object, as a write to the server sends it. */
      sections,
      /* Takes the shared settings (as sharedOf gives them) as the saved level, from now on
         choices are sent to the server, and returns whether what the display shows changed. */
      shared(j) {
        const before = shownKey();
        src = 'server'; saved = {};
        for (const sec of SECTIONS) saved[sec] = JSON.parse(JSON.stringify(j[sec]));
        changed();
        return shownKey() !== before;
      },
      /* Back to this browser's own choices, when no server keeps them after all. */
      local() {
        if (src === 'local') return;
        src = 'local'; saved = load(storage, say); changed();
      },
      /* This browser's own choices under KEY, each section cleaned quietly and only those with
         something in them, for the carry-over to the server; or null when there are none. */
      carry() {
        const old = load(storage, () => {}), out = {};
        for (const sec of SECTIONS) { if (!isObj(old[sec])) continue; const c = cleanSaved(sec, old[sec], true); if (Object.keys(c).length) out[sec] = c; }
        return Object.keys(out).length ? out : null;
      },
      /* fn(sections) is called with the names of the sections a choice changed, while the
         choices are the server's. */
      sending(fn) { sender = typeof fn === 'function' ? fn : null; }
    };
  }

  /* ---- Keeping the shared settings in step with the server -----------------------------------------
     connect(o) ties a store to the server's api/settings. o: store; request(method, body), which
     resolves to { status, json } (json null unless the answer was JSON) or rejects when the server
     cannot be reached; storage, as for create; reload(), to start the page again; holding(),
     whether the settings screen is open; note(text), the screen's line ('' clears it); say, the
     console. It returns { poll, state }. poll() asks for the settings: main.js calls it at start and
     with every fetch of the state file.

     - The first answer in the shared form makes the settings the server's. When it holds nothing
       and this browser has choices of its own under KEY, they are sent once and the key removed;
       when it holds something, the key is removed unsent. Either way the browser's choices are
       not used again while the server answers.
     - Each answer is copied under SHARED_KEY, where the next load starts from. An answer that
       changes the settings, a choice made on another display, reloads the page, so that
       everything drawn starts again from them; while the screen is open the screen reloads it as
       it closes. Where the copy cannot be kept the page is not reloaded, since it would start
       from something else every time, and the settings apply in place.
     - A 404, or an answer that is not the shared form, means no server keeps the settings: the
       store goes back to this browser's choices and the copy is removed, and nothing more is
       asked. A server that cannot be reached is asked again at the next poll.
     - A choice is sent with PUT, naming the sections it changed, one write at a time. A refused or
       failed write puts the settings back to the server's and shows "Not saved: " and the
       server's reason on the screen. An answer to a poll sent before the latest choice is
       dropped, so a choice is never undone by an older answer. */
  function connect(o) {
    const store = o.store, storage = typeof o.storage === 'function' ? o.storage : () => null;
    const say = typeof o.say === 'function' ? o.say : line => { if (typeof console !== 'undefined') console.warn(line); };
    const st = { answered: false, stopped: false, getting: false, putting: false, gen: 0, last: null, dirty: new Set() };
    const remove = k => { try { storage().removeItem(k); } catch (e) { /* refused: nothing kept to remove */ } };
    const keep = j => { try { const t = JSON.stringify(j); storage().setItem(SHARED_KEY, t); return storage().getItem(SHARED_KEY) === t; } catch (e) { return false; } };
    const ask = async (method, body) => { try { return await o.request(method, body); } catch (e) { return null; } };
    /* Takes the server's settings; reload says whether a change may reload the page. */
    function adopt(j, reload) {
      st.last = j;
      const kept = keep(j), differs = store.shared(j);
      if (differs && reload && kept && !o.holding()) o.reload();
    }
    async function poll() {
      if (st.stopped || st.getting || st.putting) return;
      st.getting = true;
      const gen = st.gen, r = await ask('GET');
      st.getting = false;
      if (gen !== st.gen || st.putting) return;
      const j = r && r.status === 200 ? sharedOf(r.json) : null;
      if (!j) {
        if (r && (r.status < 500 || r.status === 501)) {
          // no server keeps the settings here: a static server, or the website
          st.stopped = true;
          if (!st.answered) { remove(SHARED_KEY); store.local(); }
        }
        return;
      }
      const first = !st.answered;
      st.answered = true;
      if (first) {
        const mine = store.carry();
        if (mine && emptyShared(j)) {
          st.putting = true;
          const w = await ask('PUT', Object.assign({ v: VERSION }, mine));
          st.putting = false;
          const back = w && w.status === 200 ? sharedOf(w.json) : null;
          if (back) { remove(KEY); say('knightwatcher: settings: this browser\'s choices were sent to the server, which now keeps them for every display'); adopt(back, true); return; }
          say('knightwatcher: settings: this browser\'s choices could not be sent to the server (' + reason(w) + '), so they are tried again when the page next loads');
        } else if (mine) remove(KEY);
      }
      adopt(j, true);
    }
    const reason = w => (w && isObj(w.json) && typeof w.json.error === 'string' ? w.json.error : w ? 'the server answered ' + w.status : 'the server did not answer');
    async function flush() {
      if (st.putting || !st.dirty.size) return;
      const now = store.sections(), body = { v: VERSION };
      for (const sec of st.dirty) body[sec] = now[sec];
      st.dirty.clear();
      st.putting = true;
      const w = await ask('PUT', body);
      st.putting = false;
      const back = w && w.status === 200 ? sharedOf(w.json) : null;
      if (!back) {
        st.dirty.clear(); st.gen++;
        o.note('Not saved: ' + reason(w));
        if (st.last) adopt(st.last, false);
        return;
      }
      st.last = back; keep(back);
      if (st.dirty.size) { flush(); return; }
      o.note('');
      store.shared(back);
    }
    store.sending(secs => { st.gen++; for (const sec of secs) st.dirty.add(sec); flush(); });
    return { poll, state: () => ({ answered: st.answered, stopped: st.stopped, mode: store.mode() }) };
  }

  /* What the page has loaded (see worldOf): each loaded scene's can, and each condition's own scene
     from KW.state.CONDITIONS; over them what KW.world has loaded (KW.world.catalogue), the base
     world's homes and quiet scenes among it when kw.medieval gives its preset. Empty under Node,
     where KW holds none of them. */
  function pageWorld() {
    const can = {}, homes = {}, sc = isObj(KW.scenes) ? KW.scenes : {}, cond = isObj(KW.state) && isObj(KW.state.CONDITIONS) ? KW.state.CONDITIONS : {};
    for (const k of Object.keys(sc)) if (isObj(sc[k]) && Array.isArray(sc[k].can)) can[k] = sc[k].can;
    for (const c of Object.keys(cond)) homes[c] = cond[c].scene;
    const cat = isObj(KW.world) && typeof KW.world.catalogue === 'function' ? KW.world.catalogue() : {};
    return Object.assign({ can, homes }, cat);
  }

  const api = { SCHEMA, KEY, SHARED_KEY, VERSION, SCENES, ALL_SCENES, ONE_OF, KEYS, BUILT_IN, MINUTES, WEAPONS, ONE_HANDED, WEAPON_CHIPS, ITEMS, TABLES, KINDS, BASE_WORLD, LONG,
    isLong, isPart, itemId, itemChoices, itemsOf, buildsOf, buildName, buildChoices, lookOf, builtIn, worldOf, worldParts, offered, clean, resolve, knightLook, greyed, engineInput, clock,
    load, save, sharedOf, create, connect, pageWorld };
  KW.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ---- The screen ----------------------------------------------------------------------------------
     Built over the display by mount(o), from the markup in index.html (#kws and #kws-cue). o: store,
     the store above; surface, the display, where a press and hold opens the screen; info(), what the
     status page reads: { version, mode, view }, view being the last valid state file as KW.state.map
     gives it, or null; time(), the time the knight's preview is drawn at. Nothing here is drawn
     until the screen opens, so a page whose screen stays closed looks as it did before. */

  /* The hold, the tap and the idle close. A press lifted before TAP_MS is a tap. After CUE_AFTER_MS
     the cue shows over the press, and at HOLD_MS the screen opens. Moving more than MOVE_PX
     cancels. The screen closes after IDLE_S seconds without a touch, counting down the last WARN_S. */
  const HOLD_MS = 2000, CUE_AFTER_MS = 250, TAP_MS = 500, MOVE_PX = 24, IDLE_S = 60, WARN_S = 10, BLOCKS = 10;
  const MINUTE_CHOICES = [5, 10, 15, 30, 60];
  const SCENE_NAMES = { battlement: 'Battlement', camp: 'Camp', house: 'House', yard: 'Training yard', cellar: 'Cellar', smithy: 'Smithy', court: 'Court' };
  /* Each condition by a plain name, after the headline the page shows for it. */
  const CONDITION_NAMES = { attack: 'Under attack', wan_down: 'WAN down', container_unhealthy: 'Unwell', disk_full: 'Disk full', backup_overdue: 'Backup overdue',
    pi_silent: 'Pi silent', cpu_hot: 'Running hot', ssh_session: 'At court', updating: 'Updating', streaming: 'Now showing', night: 'Night watch' };
  /* The gear rows under the colours, grouped as Armour, in the order the screen shows them. */
  const ARMOUR = [['shield', 'Shield'], ['helmet', 'Helmet'], ['plume_style', 'Plume style'], ['body', 'Body'], ['shoulders', 'Shoulders'], ['arms', 'Arms'],
    ['hands', 'Hands'], ['legs', 'Legs'], ['feet', 'Feet'], ['back', 'Back']];
  const SETS = { skin: 'skin', hair: 'hair', tabard: 'tabard', plume: 'plume', monarch_skin: 'skin', monarch_hair: 'hair', monarch_robe: 'tabard' };
  const HEADLINES = [['small', 'Small', 20], ['medium', 'Medium', 27], ['large', 'Large', 36]];
  /* The line under the title on the pages that save: where choices are kept. */
  const SCOPE = { server: 'Saved on the Knightwatcher server, for every display.', local: 'Kept in this browser only: no Knightwatcher server.' };

  /* ---- The worlds on the screen ----------------------------------------------------------------
     What the World page, its device rows and the status page's world entries show, worked out
     apart from the drawing so that the tests can read it (KW.settings.screen). labels are the
     words in use's labels (KW.world.words.labels), or null for the screen's own. */
  /* The kinds of device as the device rows name them. */
  const DEVICE_KINDS = [['pi', 'Pi'], ['camera', 'Camera'], ['machine', 'Host'], ['vm', 'VM'], ['box', 'Other']];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
  const listed = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  /* A label of the world's words, or own. */
  const labelOf = (labels, k, own) => (isObj(labels) && typeof labels[k] === 'string' && labels[k] ? labels[k] : own);
  /* The level a part came from; for a table, the highest of its keys'. */
  function fromOf(r, sec, k) {
    const f = r.from[sec][k];
    if (!isObj(f)) return f;
    const ls = Object.values(f);
    return LEVELS.find(l => ls.includes(l)) || (ls.includes('world') ? 'world' : 'built-in');
  }
  /* The parts the World page compares with the world's own, [section, key]: the look's keys but
     the world and the devices, which have rows of their own, the quiet scenes, and each condition
     offered. */
  function partKeys(r) {
    const out = KEYS.look.filter(k => k !== 'world' && k !== 'devices').map(k => ['look', k]);
    out.push(['quiet', 'scenes']);
    for (const c of Object.keys(r.values.scenes)) out.push(['scenes', c]);
    return out;
  }
  /* The parts whose value differs from the world's own (own, as the store's parts() gives it):
     each { sec, k, v, own, from }. */
  function changedParts(r, own) {
    const out = [];
    for (const [sec, k] of partKeys(r)) {
      const v = r.values[sec][k], w = own[sec][k];
      if (!same(v, w)) out.push({ sec, k, v, own: w, from: fromOf(r, sec, k) });
    }
    return out;
  }
  /* A part's name on the screen. */
  function partLabel(sec, k, labels) {
    if (sec === 'quiet') return k === 'scenes' ? 'Quiet scenes' : 'Each shows for';
    if (sec === 'scenes') return CONDITION_NAMES[k] || k;
    if (sec === 'display') return { headline: 'Headline size', clock: 'Clock', helmet_indoors: 'Helmet indoors' }[k] || k;
    const sub = k.indexOf('.') > 0 ? k.split('.') : null;
    if (sub) return partLabel(sec, sub[0], labels) + ', ' + (sub[0] === 'devices' ? (DEVICE_KINDS.find(d => d[0] === sub[1]) || [0, sub[1]])[1] : sub[1]);
    const patron = labelOf(labels, 'patron', 'The monarch').replace(/^The (.)/, (m, c) => c.toUpperCase());
    const own = { world: 'World', build: 'Build', weapon: 'Weapon', skin: 'Skin tone', hair: 'Hair colour', hair_style: 'Hair style', tabard: 'Tabard', plume: 'Plume',
      monarch: patron, monarch_skin: patron + '\'s skin', monarch_hair: patron + '\'s hair', monarch_robe: patron + '\'s robe', foe: labelOf(labels, 'foe', 'Foe'),
      critter: labelOf(labels, 'critter', 'Pest'), props: 'Devices', overlay: 'Overlay', words: 'Words', items: 'Items', devices: 'Devices by kind' };
    for (const [a, b] of ARMOUR) own[a] = b;
    return own[k] || k;
  }
  /* A part's value in words, from the base pack's names and what the page has loaded (cat, as the
     store's catalogue() gives it). */
  function valueName(sec, k, v, pack, cat) {
    const name = n => (typeof n === 'string' && n ? n.charAt(0).toUpperCase() + n.slice(1) : String(n));
    if (sec === 'quiet') return k === 'minutes' ? v + ' minutes' : same(v, SCENES) ? 'All four' : listed(v.map(x => SCENE_NAMES[x] || x));
    if (sec === 'scenes') return SCENE_NAMES[v] || v;
    if (v === null) return 'As drawn';
    if (k === 'build') return isObj(pack) ? buildName(pack, v) : 'Build ' + v.toUpperCase();
    if (k === 'weapon') return WEAPON_CHIPS[v] ? WEAPON_CHIPS[v][0] : v;
    if (k === 'monarch') return /^[abc]$/.test(v) ? 'Monarch ' + v.toUpperCase() : v;
    if (k === 'world') return isObj(cat) && isObj(cat.worlds[v]) ? cat.worlds[v].name : v;
    if (k === 'props') return isObj(cat) && isObj(cat.sets[v]) ? cat.sets[v].name : v;
    if (k === 'items') return Object.keys(v).length ? listed(Object.keys(v).map(s => v[s])) : 'Nothing named';
    if (k === 'devices') return Object.keys(v).length ? listed(Object.keys(v).map(s => s + ' ' + v[s])) : 'All from the devices';
    if (SETS[k]) { const s = isObj(pack) && pack.swatches[SETS[k]] && pack.swatches[SETS[k]][v]; return s ? s.name : v; }
    if (v === 'none') return 'Nothing';
    if (ITEMS[k]) { const it = isObj(pack) && pack.items[itemId(k, v)]; return it ? it.name : v; }
    return name(v);
  }
  const partWords = (d, pack, cat, labels) => (d.sec === 'scenes' ? lowerFirst(partLabel(d.sec, d.k, labels)) + ' in the ' + lowerFirst(valueName(d.sec, d.k, d.v, pack, cat))
    : 'the ' + lowerFirst(partLabel(d.sec, d.k, labels)) + ' (' + lowerFirst(valueName(d.sec, d.k, d.v, pack, cat)) + ')');
  /* The line under the world's row once a world is chosen: name the world chosen; cleared, what
     this display had chosen, each { sec, k, v }; under, what config.toml sets that now gives way,
     each { sec, k, v }; shared, whether the choice is for every display. */
  function chosenLine(name, cleared, under, shared, pack, cat, labels) {
    let line = name + ' chosen' + (shared ? ' for every display' : '') + ': every part is now the world\'s.';
    if (cleared.length) line += ' Cleared what was chosen here: ' + listed(cleared.map(d => partWords(d, pack, cat, labels))) + '.';
    if (under.length) line += ' ' + listed(under.map(d => partWords(d, pack, cat, labels))).replace(/^the/, 'The') + ' from config.toml ' + (under.length === 1 ? 'gives' : 'give') + ' way to it.';
    if (!cleared.length && !under.length) line += ' Nothing had been changed from it.';
    return line + ' A part changed after this is kept over the world.';
  }
  /* The device rows, or null while fewer than two prop sets are loaded: { world, rows }, world the
     prop set the world in use brings (its props), and a row for each kind, { kind, label, cur,
     from, choices }, cur the set the kind is drawn from, from where that choice was made ('world'
     or 'built-in' when nothing chose it), and choices each set that draws the kind, { id, name },
     the world's first. */
  function deviceRows(cat, r) {
    const sets = isObj(cat) && isObj(cat.sets) ? cat.sets : {}, ids = Object.keys(sets);
    if (ids.length < 2) return null;
    const world = r.values.look.props, by = r.values.look.devices || {}, from = isObj(r.from.look.devices) ? r.from.look.devices : {};
    const short = id => sets[id].name.replace(/ devices$/i, '');
    return { world, rows: DEVICE_KINDS.map(([kind, label]) => ({ kind, label, cur: typeof by[kind] === 'string' ? by[kind] : world, from: from[kind] || fromOf(r, 'look', 'props'),
      choices: ids.filter(id => sets[id].kinds.includes(kind)).sort((a, b) => (b === world) - (a === world)).map(id => ({ id, name: short(id) + (id === world ? ', the world\'s' : '') })) })) };
  }
  /* The devices table to save once set is chosen for kind on its row: the table the levels give,
     with that kind's choice; the world's set leaves the kind out where this display chose it, so
     that it follows the world again. Returns the table, which may be empty. */
  function devicesAfter(r, kind, set) {
    const next = Object.assign({}, r.values.look.devices || {}), from = isObj(r.from.look.devices) ? r.from.look.devices[kind] : undefined;
    if (set === r.values.look.props && (from === undefined || from === 'saved' || from === 'world')) delete next[kind];
    else next[kind] = set;
    return next;
  }
  const ASKS = { hook: 'The page\'s address', saved: 'This screen', shared: 'The saved settings', defaults: 'config.toml' };
  /* Every fallback, with its reason, for the status page: [what, why]. r is what the store gives
     (its ignored and faults), w KW.world (its status, props, cast, devices), kn KW.knight.status. */
  function fallbackLines(r, w, kn, pack, cat, labels) {
    const out = [], W = isObj(w) ? w : {};
    const show2 = v => (typeof v === 'string' ? '"' + v.slice(0, 48) + '"' : Array.isArray(v) ? listed(v.map(show2)) : isObj(v) ? 'a table' : String(v));
    for (const f of Array.isArray(r.ignored) ? r.ignored : []) {
      const what = f.key === null ? f.section : partLabel(f.section, f.key, labels), asks = ASKS[f.where] || f.where;
      if (f.section === 'scenes' && f.why === 'that scene cannot act it' && has(r.values.scenes, f.key)) {
        const now = r.values.scenes[f.key], whose = r.from.scenes[f.key] === 'world' || r.from.scenes[f.key] === 'built-in' ? ', the world\'s own' : '';
        out.push([what, ': ' + asks + ' asks for the ' + lowerFirst(SCENE_NAMES[f.value] || String(f.value)) + ', which cannot act it. Shown in the ' + lowerFirst(SCENE_NAMES[now] || now) + whose + '.']);
      } else out.push([what, ': ' + asks + ' asks for ' + show2(f.value) + ', which is ignored: ' + f.why + '.']);
    }
    for (const f of Array.isArray(r.faults) ? r.faults : []) {
      const [sec, k] = f.part.split('.');
      out.push([partLabel(sec, k, labels), ': the world names ' + show2(f.value) + ', which is ' + (f.why === 'not loaded' ? 'not loaded' : 'not used: ' + f.why) + ', so the ' + lowerFirst(valueName('look', 'world', 'medieval', pack, cat)) + ' world\'s is shown.']);
    }
    const st = W.status || {};
    for (const f of st.faults || []) out.push([SCENE_NAMES[f.scene] || f.scene, ': drawn from code. ' + f.reason]);
    for (const f of (W.props || {}).faults || []) out.push([f.kind, ': drawn from code. ' + f.reason]);
    for (const f of (W.devices || {}).faults || []) out.push([f.kind, ': the base world\'s drawing, not ' + f.set + '\'s: ' + f.reason + '.']);
    for (const f of (W.cast || {}).faults || []) out.push([f.member, ': drawn from code. ' + f.reason]);
    for (const f of (W.words || {}).faults || []) out.push([f.set, ': the collector\'s words are shown. ' + f.reason]);
    for (const f of (W.overlay || {}).faults || []) out.push([f.overlay, ': display.css\'s colours are shown. ' + f.reason]);
    if (st.refused) out.push([st.refused.id, ': refused at the ' + st.refused.step + ' step, so every scene, device and member of the cast is drawn from code.']);
    for (const f of (isObj(kn) && Array.isArray(kn.fallbacks) ? kn.fallbacks : [])) {
      if (f.reason === 'not set' || f.wanted === null) continue;
      out.push([f.key, ': ' + show2(f.wanted) + ' is not drawn (' + f.reason + '), so ' + (f.used ? f.used : 'nothing') + ' is.']);
    }
    return out;
  }
  api.screen = { DEVICE_KINDS, partKeys, changedParts, partLabel, valueName, chosenLine, deviceRows, devicesAfter, fallbackLines };

  function mount(o) {
    const store = o.store, K = KW.knight, D = KW.draw, V = KW.view, P = KW.props, U = V.U;
    const $ = id => document.getElementById(id);
    const kws = $('kws'), main = $('kws-main'), foot = $('kws-foot'), scope = $('kws-scope'), cue = $('kws-cue');
    if (!kws || !main || !cue || !o.surface) return null;
    const cueBar = cue.querySelector('.kws-cue-bar');
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
    for (let i = 0; i < BLOCKS; i++) cueBar.appendChild(el('i'));
    const st = { open: false, page: 'knight', lastTouch: 0, notes: {}, unsaved: '' };

    /* ---- Drawing into canvases of the screen's own
       The primitives draw into whatever KW.draw.setCtx() last set, and the engine sets its own at
       the start of every frame; each drawing here puts back what it found. A scene is drawn on the
       bare 960 by 600 grid, so the view's edges are set to the grid's while it draws. */
    function onGrid(ctx, fn) {
      const was = D.getCtx(), edges = { HL: V.HL, HR: V.HR, HT: V.HT };
      V.HL = 0; V.HR = V.HW; V.HT = 0; D.setCtx(ctx);
      try { fn(); } finally { D.setCtx(was); Object.assign(V, edges); }
    }
    const sceneState = (sc, o2, patron) => ({ w: KW.state.IDLE, devices: [{ place: 'pie', kind: 'pi', ok: true, alert: true }], places: sc.places || null, tv: false,
      kx: sc.spot * U, o: o2, here: null, inBed: false, helmOff: o2.helmet === false, strike: false, patron });
    /* Pictures that do not move, kept until the look or the helmet changes: the quiet scenes with the
       knight at its arrival spot, and the monarchs cropped from the court's own drawing. */
    const pics = new Map();
    let picKey = '';
    function picture(key, paint) {
      if (!pics.has(key)) { const cv = document.createElement('canvas'); cv.width = V.HW; cv.height = V.HH; onGrid(cv.getContext('2d'), () => paint(cv)); pics.set(key, cv); }
      return pics.get(key);
    }
    function scenePicture(name, helmetIndoors) {
      return picture('scene|' + name, () => {
        const sc = KW.scenes[name], o2 = K.pose('idle', 2300);
        o2.x = sc.spot * U; o2.floor = V.HFL; o2.helmet = helmetIndoors ? true : sc.helmet !== false; if (sc.sword === false) o2.sword = false;
        const s = sceneState(sc, o2, { id: 'a', skin: null, hair: null, robe: null });
        if (sc.paint) sc.paint(s); sc.draw(2300, s); K.draw(o2);
      });
    }
    const CROP = { x: 700, y: 160, w: 240, h: 372 };
    function monarchPicture(mon, e) {
      const p = e.patron, key = 'court|' + mon + '|' + [p.skin, p.hair, p.robe].map(x => (x ? x.id : '')).join('|');
      if (pics.has(key)) return pics.get(key);
      const big = document.createElement('canvas'); big.width = V.HW; big.height = V.HH;
      const sc = KW.scenes.court, o2 = K.pose('ssh_session', 100);
      o2.x = sc.spot * U; o2.floor = V.HFL;
      onGrid(big.getContext('2d'), () => { const s = sceneState(sc, o2, Object.assign({}, p, { id: mon })); sc.paint(s); sc.draw(100, s); });
      const out = document.createElement('canvas'); out.width = CROP.w; out.height = CROP.h;
      out.getContext('2d').drawImage(big, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
      pics.set(key, out);
      return out;
    }
    /* Draws src into the canvas dst at its size on screen, by whole steps where it is twice as big
       or more, the bottom edges together. */
    function blit(dst, src, smooth) {
      const dpr = window.devicePixelRatio || 1, w = Math.round(dst.clientWidth * dpr), h = Math.round(dst.clientHeight * dpr);
      if (!w || !h) return;
      if (dst.width !== w) dst.width = w; if (dst.height !== h) dst.height = h;
      const c = dst.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
      c.imageSmoothingEnabled = !!smooth; c.imageSmoothingQuality = 'high';
      const f = Math.min(w / src.width, h / src.height), s = f >= 2 ? Math.floor(f) : f, dw = src.width * s, dh = src.height * s;
      c.drawImage(src, Math.round((w - dw) / 2), Math.round(h - dh), Math.round(dw), Math.round(dh));
    }
    /* The knight's preview: helmet on and helmet off side by side on a plain wall, drawn by the
       knight's own code every frame while the page is open, so the blink and the bob show. */
    const PV = { w: 500, h: 380, floor: 345, at: [[118, true], [362, false]] };
    const WALL = ['#1a1622', '#1d1826', '#17131e', '#201a29'];
    function drawKnights(cv, t) {
      const dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return;
      if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
      const c = cv.getContext('2d'), f = Math.min(w / PV.w, h / PV.h), s = f >= 2 ? Math.floor(f) : f;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0e0b13'; c.fillRect(0, 0, w, h);
      c.setTransform(s, 0, 0, s, Math.round((w - PV.w * s) / 2), Math.round(h - PV.h * s));
      const was = D.getCtx(); D.setCtx(c);
      try {
        P.bricksHD(-400, -400, PV.w + 800, PV.floor + 400, 70, 26, WALL, '#0e0b13', 11);
        D.Rh(-400, PV.floor, PV.w + 800, 200, '#2b2333'); D.Rh(-400, PV.floor, PV.w + 800, 2, '#5d5670');
        for (const [x, helm] of PV.at) { const o2 = K.pose('idle', t + (helm ? 0 : 1700)); o2.x = x; o2.floor = PV.floor; o2.helmet = helm; K.draw(o2); }
      } finally { D.setCtx(was); }
    }

    /* ---- The rows ----------------------------------------------------------------------------------
       A row of choices. Each choice: { id, name, fill, chip (text), html, node (an element for the
       chip), kind ('text', 'wide', 'pic'), label, off (greyed, with offNote said when tapped). */
    function row(key, label, choices, cur, pick, hookNote) {
      const r = el('div', 'kws-row'), opts = el('div', 'kws-opts'), note = el('div', 'kws-note', st.notes[key] || hookNote || '');
      r.appendChild(el('div', 'kws-label', label));
      for (const c of choices) {
        const on = c.id === cur, b = el('button', 'kws-opt' + (c.kind ? ' ' + c.kind : '') + (on ? ' on' : '') + (c.off ? ' off' : ''));
        b.type = 'button'; b.dataset.focus = key + '=' + c.id;
        b.setAttribute('aria-pressed', String(on));
        if (c.off) b.setAttribute('aria-disabled', 'true');
        const chip = el('span', 'chip');
        if (c.fill) chip.style.background = c.fill;
        if (c.chip) chip.textContent = c.chip;
        if (c.html) chip.appendChild(c.html);
        if (c.node) chip.appendChild(c.node);
        b.appendChild(chip);
        if (c.name) b.appendChild(el('span', 'name', c.name));
        if (c.sub) b.appendChild(el('span', 'sub', c.sub));
        b.setAttribute('aria-label', label + ': ' + (c.label || c.chip || c.name) + (c.chip && c.name ? ', ' + c.name : '') + (c.sub ? ', ' + c.sub : '') + (c.off ? ', not drawn yet' : ''));
        b.addEventListener('click', () => {
          if (c.off) { st.notes[key] = c.offNote; note.textContent = c.offNote; return; }
          st.notes[key] = ''; pick(c.id);
        });
        opts.appendChild(b);
      }
      r.appendChild(opts); r.appendChild(note);
      return r;
    }
    function toggle(label, on, flip, focus) {
      const b = el('button', 'kws-switch'); b.type = 'button'; b.dataset.focus = focus;
      b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-label', label);
      const tr = el('span', 'track'); tr.appendChild(el('span', 'knob')); b.appendChild(tr); b.appendChild(el('span', 'word', on ? 'ON' : 'OFF'));
      b.addEventListener('click', flip);
      return b;
    }
    /* The reset at the end of an editable page, with the line saying what it does. */
    function reset(section, what, words, fromConfig, hooked) {
      const r = el('div', 'kws-reset'), b = el('button', 'kws-btn', 'USE THE CONFIG DEFAULT'), p = el('p');
      b.type = 'button'; b.dataset.focus = 'reset|' + section;
      const own = store.own(section), shared = store.mode() === 'server';
      const lead = el('b', '', !own ? 'Showing the default.' : shared ? 'Saved for every display.' : 'This display has its own ' + what + '.');
      p.appendChild(lead);
      p.appendChild(document.createTextNode(' The default' + (fromConfig ? ', from config.toml,' : '') + ' is ' + words + '.' +
        (!own ? '' : shared ? ' The button clears what is saved here, on every display.' : ' The button clears this display\'s choices here.')));
      if (hooked) p.appendChild(document.createTextNode(' The page\'s address sets some of these, and the address wins until the page is opened without it.'));
      b.addEventListener('click', () => { st.notes = {}; store.reset(section); });
      r.appendChild(b); r.appendChild(p);
      return r;
    }
    const HOOK_NOTE = 'The page\'s address sets this for now.';
    const hookNote = (r, sec, k) => (r.from[sec][k] === 'hook' ? HOOK_NOTE : '');
    /* A swatch's chip: its bands left to right, as the pack lays them across a shape. */
    function bandsCss(entries) {
      let list = entries.face;
      if (!list) { const ks = Object.keys(entries).filter(k => /^\d$/.test(k)); list = ks.map((k, i) => [(i + 1) / ks.length, entries[k]]); }
      let p = 0;
      return 'linear-gradient(90deg,' + list.map(([f, c]) => { const s = c + ' ' + (p * 100).toFixed(1) + '% ' + (f * 100).toFixed(1) + '%'; p = f; return s; }).join(',') + ')';
    }
    const swatches = (pack, k) => ONE_OF.look[k].filter(id => pack.swatches[SETS[k]] && pack.swatches[SETS[k]][id])
      .map(id => ({ id, name: pack.swatches[SETS[k]][id].name, fill: bandsCss(pack.swatches[SETS[k]][id].entries) }));
    const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
    /* The look in words, from the base pack's names. */
    function lookWords(v, pack) {
      const sw = (set, id) => (pack && pack.swatches[set] && pack.swatches[set][id] ? lower(pack.swatches[set][id].name) : id);
      const style = pack && pack.items['hair.' + v.hair_style] ? lower(pack.items['hair.' + v.hair_style].name) : v.hair_style;
      const name = (k, id) => (pack && pack.items[itemId(k, id)] ? lower(pack.items[itemId(k, id)].name) : id);
      // the weapon, with its shield when it is one-handed; the heater shield as it always read
      const arm = ONE_HANDED.includes(v.weapon) ? (v.weapon === 'mace_and_shield' ? 'mace' : 'sword') + ' and ' + (v.shield === 'heater' ? 'shield' : name('shield', v.shield)) : v.weapon;
      // the gear that differs from the base pack's own, after the plume
      const own = builtIn(pack).look, gear = ARMOUR.map(([k]) => k).filter(k => k !== 'shield' && v[k] !== own[k] && v[k] !== 'none').map(k => 'a ' + name(k, v[k]));
      const mh = v.monarch_hair ? sw('hair', v.monarch_hair) + ' hair' : '', mr = v.monarch_robe ? 'a ' + sw('tabard', v.monarch_robe) + ' robe' : '';
      const dress = mh && mr ? mh + ', ' + mr : mh ? mh + ', the robe as drawn' : mr ? 'the hair as drawn, ' + mr : 'hair and robe as drawn';
      return (v.build ? 'the ' + buildName(pack, v.build) + ' build, ' : '') + 'the ' + arm + ', ' + sw('skin', v.skin) + ' skin, ' +
        sw('hair', v.hair) + ' hair (' + style + '), a ' + sw('tabard', v.tabard) + ' tabard, a ' + sw('plume', v.plume) + ' plume' + (gear.length ? ', with ' + gear.join(', ') : '') +
        '; monarch ' + v.monarch.toUpperCase() + ', ' + sw('skin', v.monarch_skin) + ' skin, ' + dress;
    }
    /* What a section falls back to when this display's choices are cleared, the defaults in the
       state file over the page's own, and whether any of it comes from config.toml. */
    function defaultsOf(section) {
      const f = store.fallback();
      return { values: f.values[section], fromConfig: KEYS[section].some(k => f.from[section][k] === 'defaults') };
    }
    const hooked = (r, sec) => Object.keys(r.from[sec]).some(k => r.from[sec][k] === 'hook');

    /* ---- The World page
       The worlds loaded as cards, each drawn by its own picture scene with the world's own knight,
       as it comes; then each part that differs from the chosen world's, beside the world's own; the
       devices kind by kind once a second prop set is loaded; and the reset of the look. Choosing a
       world saves it and clears every part chosen on this display (the store's chooseWorld), and
       the line under the cards names what was cleared. */
    const wordLabels = () => { const w = KW.world && KW.world.words; return w && w.source === 'pack' ? w.labels : null; };
    const pageLabel = k => labelOf(wordLabels(), k === 'knight' ? 'watcher' : 'patron', k === 'knight' ? 'The knight' : 'The monarch');
    const worldNamed = id => valueName('look', 'world', id, null, store.catalogue());
    const named = (sec, k, v) => valueName(sec, k, v, K.basePack(), store.catalogue());
    /* The page a part is chosen on, as the line under a changed part names it. */
    const pageOf = (sec, k) => (sec === 'quiet' ? 'quiet scenes' : sec === 'scenes' ? 'scenes' : /^monarch/.test(k) ? lower(pageLabel('monarch').replace(/^The /, '')) : sec === 'look' && ['foe', 'critter', 'props', 'overlay', 'words'].includes(k) ? 'world' : lower(pageLabel('knight').replace(/^The /, '')));
    function worldTap(id) {
      const before = store.sections(), cat = store.catalogue(), shared = store.mode() === 'server';
      const cleared = store.chooseWorld(id);
      if (cleared === null) return;
      const r = store.now(), own = store.parts(id), pack = K.basePack(), labels = wordLabels();
      const was = cleared.map(p => { const [sec, k] = p.split('.'); return { sec, k, v: before[sec][k] }; });
      const under = r.masked.filter(m => m.level === 'defaults' && m.key.indexOf('.') < 0 && !same(m.value, own[m.section][m.key])).map(m => ({ sec: m.section, k: m.key, v: m.value }));
      st.notes.world = chosenLine(worldNamed(id), was, under, shared, pack, cat, labels);
      render();
    }
    /* Puts one part back to the world's: clears what this display saved for it, and saves the
       world's own over a level below that still sets it. */
    function backToWorld(sec, k) {
      const own = store.parts(store.now().world.id)[sec][k];
      if (fromOf(store.now(), sec, k) === 'saved') store.clear(sec, k);
      const r = store.now();
      if (!same(r.values[sec][k], own) && fromOf(r, sec, k) !== 'hook' && own !== null && !isObj(own)) store.choose(sec, k, own);
    }
    /* A part's value as a chip of the row it has on its own page. */
    function chipOf(sec, k, v, extra) {
      const pack = K.basePack(), name = named(sec, k, v);
      if (sec === 'scenes') { const cv = el('canvas'); cv.dataset.scene = v; return Object.assign({ node: cv, name, kind: 'scene' }, extra); }
      if (SETS[k] && v !== null && pack) { const s = swatches(pack, k).find(x => x.id === v); if (s) return Object.assign({ fill: s.fill, name }, extra); }
      if (SETS[k] && v === null) { const drawn = KW.scenes.court.drawn(store.now().values.look.monarch)[k === 'monarch_hair' ? 'hair' : 'robe']; return Object.assign({ fill: bandsCss(Object.assign({}, drawn)), name }, extra); }
      return Object.assign({ chip: name, kind: 'text' }, extra);
    }
    /* A world's card: its picture scene, with the knight in the world's own look, painted once. */
    function worldPicture(id, helmetIndoors) {
      return picture('world|' + id + '|' + helmetIndoors, () => {
        const cat = store.catalogue(), w = cat.worlds[id] || {}, s = cat.names.scene[w.picture], name = s && KW.scenes[s] ? s : KW.scenes[w.picture] ? w.picture : BASE_PICTURE;
        const look = store.worldLook(id), now = knightLook(store.now()), swap = !same(look, now);
        if (swap) K.look(look);
        try {
          const sc = KW.scenes[name], o2 = K.pose('idle', 2300);
          o2.x = sc.spot * U; o2.floor = V.HFL; o2.helmet = helmetIndoors ? true : sc.helmet !== false; if (sc.sword === false) o2.sword = false;
          const s2 = sceneState(sc, o2, { id: 'a', skin: null, hair: null, robe: null });
          if (sc.paint) sc.paint(s2); sc.draw(2300, s2); K.draw(o2);
        } finally { if (swap) K.look(now); }
      });
    }
    /* A device of one kind as the set draws it, up and still, in a frame of 88 by 70 grid pixels
       about the drawing, so that every kind shows at the same scale. */
    function devicePicture(set, kind) {
      const key = 'dev|' + set + '|' + kind;
      if (!pics.has(key)) {
        const got = KW.world && KW.world.drawingOf ? KW.world.drawingOf(set, kind).kind : null, k = got || P.KINDS[kind] || P.KINDS.box;
        const big = document.createElement('canvas'); big.width = 200; big.height = 200;
        const bc = big.getContext('2d');
        onGrid(bc, () => k.draw(100, 160, 1200, true));
        const px = bc.getImageData(0, 0, 200, 200).data;
        let x0 = 200, y0 = 200, x1 = 0, y1 = 0;
        for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (px[(y * 200 + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const W = 88, H = 70, cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        cv.getContext('2d').drawImage(big, cx - W / 2, cy - H / 2, W, H, 0, 0, W, H);
        pics.set(key, cv);
      }
      return pics.get(key);
    }
    function buildWorld(list, prev, r) {
      const cat = store.catalogue(), pack = K.basePack(), labels = wordLabels(), ids = Object.keys(cat.worlds), cur = r.values.look.world, dflt = store.fallback().values.look.world;
      list.appendChild(el('p', 'kws-intro', 'A world sets every part at once: ' + lower(pageLabel('knight')) + ', ' + lower(pageLabel('monarch')) +
        ', the scenes, the cast, the devices and the words. A part changed on a later page is kept over the world.'));
      const wr = row('world', 'World', ids.map(id => {
        const cv = el('canvas'); cv.dataset.world = id;
        return { id, node: cv, name: cat.worlds[id].name, sub: id === dflt ? 'Default' : '', kind: 'world', label: cat.worlds[id].name + ' world' };
      }), cur, worldTap, hookNote(r, 'look', 'world'));
      wr.classList.add('kws-worlds');
      list.appendChild(wr);
      if (ids.length === 1) list.appendChild(el('p', 'kws-intro kws-after', 'More worlds show here once their packs are loaded.'));

      const diff = changedParts(r, store.parts(cur));
      list.appendChild(el('p', 'kws-intro kws-head2', 'Changed from the ' + worldNamed(cur) + ' world'));
      if (!diff.length) list.appendChild(el('p', 'kws-line kws-calm', 'Nothing: every part is the world\'s.'));
      for (const d of diff) {
        const note = d.from === 'hook' ? HOOK_NOTE : d.from === 'defaults' ? '' : 'Chosen on the ' + pageOf(d.sec, d.k) + ' page.';
        const rr = row('part:' + d.sec + '.' + d.k, partLabel(d.sec, d.k, labels), [
          chipOf(d.sec, d.k, d.v, { id: 'now', sub: d.from === 'defaults' ? 'Default' : '' }),
          chipOf(d.sec, d.k, d.own, { id: 'own', sub: 'The world\'s' })
        ], 'now', id => { if (id === 'own') backToWorld(d.sec, d.k); }, note);
        rr.classList.add('kws-diff');
        list.appendChild(rr);
      }
      const dev = deviceRows(cat, r);
      if (dev) {
        list.appendChild(el('p', 'kws-intro kws-head2', 'Devices, kind by kind'));
        list.appendChild(el('p', 'kws-intro', 'The world brings ' + named('look', 'props', dev.world) + '. Each kind may come from any device set loaded.'));
        for (const x of dev.rows) {
          list.appendChild(row('kind:' + x.kind, x.label, x.choices.map(c => {
            const cv = el('canvas'); cv.dataset.device = c.id + '|' + x.kind;
            return { id: c.id, node: cv, name: c.name, kind: 'device' };
          }), x.cur, set => {
            const next = devicesAfter(store.now(), x.kind, set);
            if (Object.keys(next).length) store.choose('look', 'devices', next); else store.clear('look', 'devices');
          }, x.from === 'hook' ? HOOK_NOTE : ''));
        }
      }
      const f = store.fallback(), fd = changedParts(f, store.parts(f.values.look.world)).filter(d => d.from === 'defaults');
      const words = 'the ' + worldNamed(f.values.look.world) + ' world' + (fd.length ? ' with ' + listed(fd.map(d => 'a ' + lower(named(d.sec, d.k, d.v)) + ' ' + lower(partLabel(d.sec, d.k, labels)))) : ', every part as it comes');
      list.appendChild(reset('look', 'look', words, KEYS.look.some(k => fromOf(f, 'look', k) === 'defaults'), hooked(r, 'look')));
    }

    /* ---- The pages ---------------------------------------------------------------------------------- */
    const choose = (sec, k) => v => store.choose(sec, k, v);
    /* Each page, in the rail's order; a label as a function takes the words of the world in use. */
    const PAGES = {
      world: { label: 'World', build: buildWorld },
      knight: { label: () => pageLabel('knight'), build(list, prev, r) {
        const pack = K.basePack(), v = r.values.look;
        if (!pack) list.appendChild(el('p', 'kws-line', 'The knight is drawn from code, which has only the default look: the base pack could not be used (see Status). Choices made here are kept and show once it can.'));
        else {
          list.appendChild(row('build', 'Build', buildChoices(pack, v.build), v.build, choose('look', 'build'), hookNote(r, 'look', 'build')));
          list.appendChild(row('weapon', 'Weapon', itemChoices(pack, 'weapon').map(c => ({ id: c.id, chip: c.name, name: c.sub, kind: 'text' })), v.weapon, choose('look', 'weapon'), hookNote(r, 'look', 'weapon')));
          list.appendChild(row('skin', 'Skin tone', swatches(pack, 'skin'), v.skin, choose('look', 'skin'), hookNote(r, 'look', 'skin')));
          list.appendChild(row('hair', 'Hair colour', swatches(pack, 'hair'), v.hair, choose('look', 'hair'), hookNote(r, 'look', 'hair')));
          list.appendChild(row('hair_style', 'Hair style', itemChoices(pack, 'hair_style').map(c => ({ id: c.id, chip: c.name, kind: 'text' })),
            v.hair_style, choose('look', 'hair_style'), hookNote(r, 'look', 'hair_style')));
          list.appendChild(row('tabard', 'Tabard', swatches(pack, 'tabard'), v.tabard, choose('look', 'tabard'), hookNote(r, 'look', 'tabard')));
          // a row the look does not show is greyed, each choice saying why when tapped
          const grey = greyed(v, pack), off = (choices, why) => (why ? choices.map(c => Object.assign(c, { off: true, offNote: why })) : choices);
          list.appendChild(row('plume', 'Plume', off(swatches(pack, 'plume'), grey.plume), v.plume, choose('look', 'plume'), grey.plume || hookNote(r, 'look', 'plume')));
          list.appendChild(el('p', 'kws-intro', 'Armour: each piece from the base pack, worn on every build.'));
          for (const [k, label] of ARMOUR) {
            list.appendChild(row(k, label, off(itemChoices(pack, k).map(c => ({ id: c.id, chip: c.name, kind: 'text' })), grey[k]), v[k], choose('look', k), grey[k] || hookNote(r, 'look', k)));
          }
        }
        const d = defaultsOf('look');
        list.appendChild(reset('look', 'look', lookWords(d.values, pack), d.fromConfig, hooked(r, 'look')));
        prev.appendChild(el('h2', '', 'As the knight will look'));
        const cv = el('canvas'); cv.id = 'kws-knights'; prev.appendChild(cv);
        const caps = el('div', 'caps'); caps.appendChild(el('span', '', 'Helmet on')); caps.appendChild(el('span', '', 'Helmet off')); prev.appendChild(caps);
        prev.appendChild(el('h2', 'home', 'At home, gear at rest'));
        const home = el('canvas', 'scene'); home.dataset.scene = 'house'; prev.appendChild(home);
      } },
      monarch: { label: () => pageLabel('monarch'), build(list, prev, r) {
        const pack = K.basePack(), v = r.values.look, e = monOf(r);
        list.appendChild(row('monarch', 'Monarch', ONE_OF.look.monarch.map(m => {
          const cv = el('canvas'); cv.dataset.mon = m;
          return { id: m, node: cv, name: 'Monarch ' + m.toUpperCase(), kind: 'pic' };
        }), v.monarch, choose('look', 'monarch'), hookNote(r, 'look', 'monarch')));
        if (pack) {
          list.appendChild(row('monarch_skin', 'Skin tone', swatches(pack, 'monarch_skin'), v.monarch_skin, choose('look', 'monarch_skin'), hookNote(r, 'look', 'monarch_skin')));
          // the first choice of each is the monarch's own colours, which saves nothing for the key
          const own = KW.scenes.court.drawn(v.monarch), asDrawn = cols => ({ id: null, name: 'As drawn', fill: bandsCss(Object.assign({}, cols)) });
          const pickOr = k => id => (id === null ? store.clear('look', k) : store.choose('look', k, id));
          list.appendChild(row('monarch_hair', 'Hair colour', [asDrawn(own.hair)].concat(swatches(pack, 'monarch_hair')), v.monarch_hair, pickOr('monarch_hair'), hookNote(r, 'look', 'monarch_hair')));
          list.appendChild(row('monarch_robe', 'Robe', [asDrawn(own.robe)].concat(swatches(pack, 'monarch_robe')), v.monarch_robe, pickOr('monarch_robe'), hookNote(r, 'look', 'monarch_robe')));
        } else list.appendChild(el('p', 'kws-line', 'The monarch\'s skin tones and colours come from the base pack, which could not be used (see Status), so the monarch keeps the court\'s own.'));
        const d = defaultsOf('look');
        list.appendChild(reset('look', 'look', lookWords(d.values, pack), d.fromConfig, hooked(r, 'look')));
        prev.appendChild(el('h2', '', 'At court'));
        const cv = el('canvas', 'court'); cv.id = 'kws-court'; cv.dataset.skin = e.patron.skin ? e.patron.skin.id : ''; prev.appendChild(cv);
      } },
      display: { label: 'Display', build(list, prev, r) {
        const v = r.values.display;
        list.appendChild(row('headline', 'Headline size', HEADLINES.map(([id, name, px]) => {
          const s = el('span', 'hl', 'AT COURT'); s.style.fontSize = px + 'px';
          return { id, html: s, name, label: name, kind: 'text' };
        }), v.headline, choose('display', 'headline'), hookNote(r, 'display', 'headline')));
        const twelve = el('span', '', '9:42'); twelve.appendChild(el('small', '', 'PM'));
        list.appendChild(row('clock', 'Clock', [{ id: 24, chip: '21:42', name: '24 hour', kind: 'text' }, { id: 12, html: twelve, name: '12 hour', label: '9:42 PM', kind: 'text' }],
          v.clock, choose('display', 'clock'), hookNote(r, 'display', 'clock')));
        list.appendChild(row('helmet_indoors', 'Helmet indoors', [{ id: false, chip: 'Off', name: 'In the house and smithy', kind: 'text' }, { id: true, chip: 'On', name: 'Kept on everywhere', kind: 'text' }],
          v.helmet_indoors, choose('display', 'helmet_indoors'), hookNote(r, 'display', 'helmet_indoors')));
        const d = defaultsOf('display').values, dw = (d.headline === 'medium' ? 'a medium' : 'a ' + d.headline) + ' headline, a ' + d.clock + '-hour clock and the helmet ' + (d.helmet_indoors ? 'on' : 'off') + ' indoors';
        list.appendChild(reset('display', 'choices', dw, defaultsOf('display').fromConfig, hooked(r, 'display')));
      } },
      quiet: { label: 'Quiet scenes', build(list, prev, r) {
        const on = r.values.quiet.scenes, mins = r.values.quiet.minutes;
        for (const k of SCENES) {
          const inIt = on.includes(k), row2 = el('div', 'kws-scene' + (inIt ? '' : ' out')), cv = el('canvas'); cv.dataset.scene = k;
          const nm = el('div', 'sname', SCENE_NAMES[k]); nm.appendChild(el('small', '', inIt ? (on.length === 1 ? 'The only scene: it stays on screen' : 'In the rotation') : 'Left out'));
          row2.appendChild(cv); row2.appendChild(nm);
          row2.appendChild(toggle(SCENE_NAMES[k] + ' in the rotation', inIt, () => {
            if (inIt && on.length === 1) { st.notes.quiet = 'One scene at least stays in the rotation.'; render(); return; }
            st.notes.quiet = '';
            // a scene switched back on joins the end of the rotation
            store.choose('quiet', 'scenes', inIt ? on.filter(x => x !== k) : on.concat(k));
          }, 'scene|' + k));
          list.appendChild(row2);
        }
        if (st.notes.quiet) list.appendChild(el('div', 'kws-note kws-wide', st.notes.quiet));
        const choices = MINUTE_CHOICES.includes(mins) ? MINUTE_CHOICES : MINUTE_CHOICES.concat(mins).sort((a, b) => a - b);
        list.appendChild(row('minutes', 'Each shows for', choices.map(m => ({ id: m, chip: String(m), name: 'min', kind: 'text', label: m + ' minutes' })), mins, choose('quiet', 'minutes'),
          (r.from.quiet.minutes === 'built-in' && o.info().mode === 'demo' ? 'The demo shows each scene for a minute until a length is chosen here or in config.toml.' : hookNote(r, 'quiet', 'minutes'))));
        const d = defaultsOf('quiet').values, n = d.scenes.length;
        const dw = (n === SCENES.length ? 'all four scenes' : n === 1 ? 'the ' + lower(SCENE_NAMES[d.scenes[0]]) + ' alone' : d.scenes.map(x => lower(SCENE_NAMES[x])).join(', ').replace(/, ([^,]*)$/, ' and $1')) + ', ' + d.minutes + (d.minutes === 1 ? ' minute' : ' minutes') + ' each';
        list.appendChild(reset('quiet', 'choices', dw + '. These scenes show only while all is quiet; anything the knight has to act out comes first', defaultsOf('quiet').fromConfig, hooked(r, 'quiet')));
      } },
      scenes: { label: 'Scenes', build(list, prev, r) {
        const offer = store.offered(), conds = Object.keys(offer), dflt = store.fallback().values.scenes;
        list.appendChild(el('p', 'kws-intro', 'Where the knight acts out each of these. ' +
          'A condition only one scene can act, and the night, which needs the bed, keep their own scene.'));
        if (!conds.length) list.appendChild(el('p', 'kws-line', 'No condition has more than one scene that can act it.'));
        for (const c of conds) {
          list.appendChild(row('scene:' + c, CONDITION_NAMES[c] || c, offer[c].map(k => {
            const cv = el('canvas'); cv.dataset.scene = k;
            return { id: k, node: cv, name: SCENE_NAMES[k] || k, sub: k === dflt[c] ? 'Default' : '', kind: 'scene' };
          }), r.values.scenes[c], choose('scenes', c), hookNote(r, 'scenes', c)));
        }
        const f = store.fallback(), set = conds.filter(c => f.from.scenes[c] === 'defaults');
        const dw = set.length ? set.map(c => lower(CONDITION_NAMES[c] || c) + ' in the ' + lower(SCENE_NAMES[f.values.scenes[c]] || f.values.scenes[c])).join(', ').replace(/, ([^,]*)$/, ' and $1') + ', and the rest in their own scenes'
          : 'each condition in its own scene';
        list.appendChild(reset('scenes', 'choices', dw, set.length > 0, hooked(r, 'scenes')));
      } },
      status: { label: 'Status', scope: 'What this display knows. Read only.', build(list) {
        const s = K.status || { base: null, refused: [], source: 'code', note: '' }, info = o.info(), view = info.view;
        const stat = (label, fill) => { const d = el('dl', 'kws-stat'); d.appendChild(el('dt', '', label)); const dd = el('dd'); fill(dd); d.appendChild(dd); list.appendChild(d); };
        const line = (dd, cls, text) => { const p = el('div', cls, text); dd.appendChild(p); return p; };
        const hhmm = ms => { const d = new Date(ms), c = clock(d.getHours(), d.getMinutes(), store.now().values.display.clock); return c.time + (c.half ? ' ' + c.half : ''); };
        stat('Version', dd => {
          const p = line(dd, '', 'Page '); p.appendChild(el('code', '', info.version));
          line(dd, 'quiet', info.version === 'dev' ? 'The repository\'s own copy, which never checks for a new version.' : 'It reloads by itself when a new version is deployed.');
        });
        stat('State file', dd => {
          if (!view) { line(dd, info.mode === 'demo' ? 'quiet' : 'warn', info.mode === 'demo' ? 'None. The display is showing the demo, on invented data.' : 'None read yet.'); return; }
          const p = line(dd, 'ok', ''); p.id = 'kws-fresh'; fresh();
          line(dd, 'quiet', 'The collector writes it every ' + view.intervalS + (view.intervalS === 1 ? ' second.' : ' seconds.'));
        });
        stat('Sources', dd => {
          const src = view ? view.sources : [];
          if (!src.length) { line(dd, 'quiet', view ? 'The state file lists none.' : 'None known.'); return; }
          const bad = src.filter(x => !x.ok);
          if (!bad.length) { line(dd, 'ok', 'All ' + src.length + ' working.'); return; }
          line(dd, 'warn', (src.length - bad.length) + ' of ' + src.length + ' working. Failing:');
          const ul = el('ul'); dd.appendChild(ul);
          for (const x of bad) {
            const li = el('li'); li.appendChild(el('code', '', x.name));
            li.appendChild(document.createTextNode(': ' + (x.error || 'no reason given') + (x.at !== null ? ', last read at ' + hhmm(x.at) : '')));
            ul.appendChild(li);
          }
        });
        // the world in use, where each part comes from, and every fallback with its reason
        const r = store.now(), cat = store.catalogue(), pack = K.basePack(), labels = wordLabels(), WK = KW.world || {}, med = WK.status ? WK.status.pack : null;
        const w = cat.worlds[r.world.id] || { name: r.world.id, pack: null };
        const code = (p, text) => { p.appendChild(el('code', '', text)); return p; };
        const txt = (p, text) => { p.appendChild(document.createTextNode(text)); return p; };
        const packTxt = pk => (pk ? pk.id + ' ' + pk.version : 'code');
        const WHERE_SET = { hook: 'Set by the page\'s address.', saved: store.mode() === 'server' ? 'Chosen on this screen, for every display.' : 'Chosen on this screen, for this display.',
          defaults: 'Set in config.toml.', 'built-in': 'Nothing chooses a world, so the page uses its own.' };
        stat('World', dd => {
          // the base world's pack is the one KW.world drew from; another world's, as the catalogue read it
          const pk = r.world.id === BASE_WORLD ? med : w.pack ? { id: w.pack, version: w.version, signed: w.signed } : null;
          const p = line(dd, '', w.name + ', from '); code(p, packTxt(pk)); txt(p, pk ? (pk.signed ? ', signed.' : ', unsigned.') : '.');
          line(dd, 'quiet', WHERE_SET[r.world.from]);
        });
        stat('Parts', dd => {
          const diff = changedParts(r, store.parts(r.world.id)), mine = test => diff.filter(test);
          const part = (label, src, rest) => { const p = el('div', 'kws-part'); p.appendChild(el('span', 'pl', label + ': ')); code(p, src); if (rest) txt(p, rest); dd.appendChild(p); return p; };
          const changed = ds => (ds.length ? '; ' + listed(ds.map(d => partWords(d, pack, cat, labels) + (d.from === 'defaults' ? ' from config.toml' : d.from === 'hook' ? ' from the address' : ' chosen here'))) : '') + '.';
          const kb = s.base;
          if (!kb) line(dd, 'warn', pageLabel('knight') + ' is drawn from code: ' + (String(s.note).split('drawn from code: ')[1] || 'the base pack could not be used') + '.');
          part(pageLabel('knight'), kb ? kb.id + ' ' + kb.version : 'code', ', as the world has it' + changed(mine(d => d.sec === 'look' && !/^monarch/.test(d.k) && !['foe', 'critter', 'props', 'overlay', 'words'].includes(d.k))));
          const masked = r.masked.filter(m => m.key.indexOf('.') < 0 && m.level === 'defaults');
          if (masked.length) line(dd, 'quiet kws-sub', listed(masked.map(m => partWords({ sec: m.section, k: m.key, v: m.value }, pack, cat, labels))).replace(/^the/, 'The') +
            ' in config.toml ' + (masked.length === 1 ? 'gives' : 'give') + ' way to the world chosen ' + (r.world.from === 'hook' ? 'by the address.' : 'here.'));
          const cast = WK.cast && WK.cast.source === 'pack' ? packTxt(med) : 'code';
          part(pageLabel('monarch'), cast, ', ' + lower(named('look', 'monarch', r.values.look.monarch)) + changed(mine(d => d.sec === 'look' && /^monarch/.test(d.k))));
          const sc = WK.status ? WK.status.scenes : {}, fromCode = Object.keys(sc).filter(k => sc[k] === 'code'), n = Object.keys(sc).length;
          const NUM = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
          part('Scenes', WK.status && WK.status.source === 'pack' ? packTxt(med) : 'code', (fromCode.length ? ', ' + listed(fromCode.map(k => 'the ' + lower(SCENE_NAMES[k] || k))) + ' from code' : ', all ' + (NUM[n] || n)) +
            changed(mine(d => d.sec === 'quiet' || d.sec === 'scenes')));
          part('Cast', cast, ', the ' + lower(named('look', 'foe', r.values.look.foe)) + ' and the ' + lower(named('look', 'critter', r.values.look.critter)) + changed(mine(d => d.k === 'foe' || d.k === 'critter')));
          const dv = WK.devices || { kinds: {} }, setName = id => named('look', 'props', id), props = r.values.look.props, others = Object.keys(dv.kinds).filter(k => dv.kinds[k] !== props);
          const KIND_WORDS = { pi: 'the Pi', camera: 'the cameras', machine: 'the hosts', vm: 'the VMs', box: 'the other devices' };
          const src = props === BASE_WORLD ? (WK.props && WK.props.source === 'pack' ? packTxt(med) : 'code') : props.split('/')[0];
          part('Devices', src, ', ' + setName(props) + (others.length ? '; ' + listed(others.map(k => (KIND_WORDS[k] || k) + ' from ' + setName(dv.kinds[k]))) : '') + '.');
          part('Words', WK.words && WK.words.source === 'pack' ? packTxt(med) : 'the collector\'s', WK.overlay && WK.overlay.source === 'pack' ? ', with the ' + WK.overlay.name + ' overlay.' : '.');
        });
        stat('Fallbacks', dd => {
          const out = fallbackLines(r, WK, s, pack, cat, labels);
          if (!out.length) { line(dd, 'ok', 'None. Every part is drawn from where it is set.'); return; }
          line(dd, 'warn', out.length === 1 ? 'One part falls back:' : out.length + ' parts fall back:');
          const ul = el('ul'); dd.appendChild(ul);
          for (const [what, why] of out) { const li = el('li'); li.appendChild(el('code', '', what)); li.appendChild(document.createTextNode(why)); ul.appendChild(li); }
        });
        stat('Refused packs', dd => {
          if (!s.refused.length) { line(dd, 'ok', 'None.'); return; }
          line(dd, 'warn', s.refused.length === 1 ? 'One pack was refused:' : s.refused.length + ' packs were refused:');
          const ul = el('ul'); dd.appendChild(ul);
          for (const x of s.refused) {
            const li = el('li'); li.appendChild(el('code', '', x.file || x.id || 'a pack with no name'));
            if (x.file && x.id) li.appendChild(document.createTextNode(' (' + x.id + ')'));
            li.appendChild(document.createTextNode(': refused at the ' + x.step + ' step. ' + x.reason));
            ul.appendChild(li);
          }
        });
      } }
    };
    function fresh() {
      const p = $('kws-fresh'), view = o.info().view;
      if (!p || !view) return;
      const n = Math.max(0, Math.round((Date.now() - view.generatedAt) / 1000));
      const text = 'Written ' + (n < 120 ? n + (n === 1 ? ' second' : ' seconds') : Math.round(n / 60) + ' minutes') + ' ago.';
      if (p.textContent !== text) p.textContent = text;
    }
    const monOf = r => engineInput(r, K.basePack(), 0);

    /* The rail, built once. */
    const rail = kws.querySelector('.kws-rail');
    const labelText = p => (typeof p.label === 'function' ? p.label() : p.label);
    for (const [k, p] of Object.entries(PAGES)) {
      const b = el('button', '', labelText(p)); b.type = 'button'; b.dataset.page = k;
      b.addEventListener('click', () => { st.page = k; st.notes = {}; render(); });
      rail.appendChild(b);
    }

    function render() {
      const r = store.now(), page = PAGES[st.page], old = main.querySelector('.kws-list'), top = old ? old.scrollTop : 0, same = main.dataset.page === st.page;
      const focus = document.activeElement && main.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
      const pk = JSON.stringify(knightLook(r)) + '|' + r.values.display.helmet_indoors;
      if (pk !== picKey) { picKey = pk; pics.clear(); }
      main.textContent = ''; main.dataset.page = st.page;
      const list = el('div', 'kws-list'); main.appendChild(list);
      let prev = null;
      if (st.page === 'knight' || st.page === 'monarch') { prev = el('div', 'kws-prev'); main.appendChild(prev); }
      page.build(list, prev, r);
      if (same) list.scrollTop = top;
      // a failed save says so until the next one succeeds; otherwise where choices are kept
      scope.textContent = page.scope || (st.unsaved || SCOPE[store.mode()]);
      scope.style.color = !page.scope && st.unsaved ? '#ffb000' : '';
      rail.querySelectorAll('button').forEach(b => {
        const text = labelText(PAGES[b.dataset.page]);
        if (b.textContent !== text) b.textContent = text;
        if (b.dataset.page === st.page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      if (focus) { const f = main.querySelector('[data-focus="' + focus + '"]'); if (f) f.focus({ preventScroll: true }); }
      paintStill(r); idleTick();
    }
    /* What does not move: the monarchs and the scenes. */
    function paintStill(r) {
      const e = monOf(r);
      main.querySelectorAll('canvas[data-mon]').forEach(cv => blit(cv, monarchPicture(cv.dataset.mon, e), true));
      main.querySelectorAll('canvas[data-scene]').forEach(cv => blit(cv, scenePicture(cv.dataset.scene, r.values.display.helmet_indoors), true));
      main.querySelectorAll('canvas[data-world]').forEach(cv => blit(cv, worldPicture(cv.dataset.world, r.values.display.helmet_indoors), true));
      main.querySelectorAll('canvas[data-device]').forEach(cv => { const [set, kind] = cv.dataset.device.split('|'); blit(cv, devicePicture(set, kind), false); });
      const ct = $('kws-court'); if (ct) blit(ct, monarchPicture(r.values.look.monarch, e), false);
    }
    /* What moves: the knights, every frame while the screen is open. */
    function loop() {
      requestAnimationFrame(loop);
      if (!st.open) return;
      const kn = $('kws-knights'); if (kn) drawKnights(kn, o.time());
      fresh();
    }
    requestAnimationFrame(loop);
    // changed says whether a choice was made while the screen was open; closing then reloads the
    // page, so that everything it draws starts again from the new settings
    let changed = false;
    store.on(() => { if (st.open) { changed = true; render(); } });

    /* ---- Opening, closing, the idle close */
    let idleTimer = 0;
    const touch = () => { st.lastTouch = performance.now(); };
    function open(page) {
      if (page && PAGES[page]) st.page = page;
      st.notes = {}; st.open = true; changed = false; kws.hidden = false; hideCue(); touch(); render();
      clearInterval(idleTimer); idleTimer = setInterval(idleTick, 250);
      // the dialog takes the focus, so that the keyboard starts inside it, without a ring
      kws.querySelector('.kws-panel').focus({ preventScroll: true });
    }
    function close() {
      st.open = false; kws.hidden = true; clearInterval(idleTimer); if (kws.contains(document.activeElement)) document.activeElement.blur();
      if (changed) { changed = false; location.reload(); }
    }
    function idleTick() {
      if (!st.open) return;
      const left = Math.ceil(IDLE_S - (performance.now() - st.lastTouch) / 1000);
      if (left <= 0) { close(); return; }
      const soon = left <= WARN_S, text = soon ? 'Closing in ' + left + (left === 1 ? ' second' : ' seconds') + '. Touch anywhere to keep it open.' : 'Closes by itself after a minute without a touch.';
      foot.className = 'kws-foot' + (soon ? ' soon' : '');
      if (foot.textContent !== text) foot.textContent = text;
    }
    $('kws-done').addEventListener('click', close);
    kws.addEventListener('pointerdown', touch, true);
    kws.addEventListener('wheel', touch, { passive: true, capture: true });
    kws.addEventListener('scroll', touch, true);
    document.addEventListener('keydown', e => { if (!st.open) return; if (e.key === 'Escape') close(); else touch(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (st.open) render(); });

    /* ---- The hold
       A press on the display starts it. The cue shows above the press after CUE_AFTER_MS and
       fills until HOLD_MS, when the screen opens. Lifting, leaving or moving more than MOVE_PX
       cancels it. A press lifted within TAP_MS is a tap and its click goes through, which in live
       mode toggles full screen. The click of any other press is swallowed: a press that moved, one
       held past TAP_MS, and the one whose hold opened the screen, so that the screen that has just
       opened under the finger is not tapped by its release. */
    let hold = null, swallow = false;
    function showCue(x, y, q) {
      cue.hidden = false;
      cue.style.left = Math.max(170, Math.min(window.innerWidth - 170, x)) + 'px';
      cue.style.top = Math.max(110, y - 56) + 'px';
      const lit = Math.max(1, Math.min(BLOCKS, Math.ceil(q * BLOCKS)));
      cueBar.querySelectorAll('i').forEach((b, i) => b.classList.toggle('lit', i < lit));
    }
    function hideCue() { cue.hidden = true; }
    function holdTick() {
      if (!hold || hold.done || hold.moved) return;
      const t = performance.now() - hold.t0;
      if (t >= HOLD_MS) { hold.done = true; swallow = true; open('knight'); return; }
      if (t >= CUE_AFTER_MS) showCue(hold.x, hold.y, (t - CUE_AFTER_MS) / (HOLD_MS - CUE_AFTER_MS));
      requestAnimationFrame(holdTick);
    }
    const surface = o.surface;
    window.addEventListener('pointerdown', () => { swallow = false; }, true);
    window.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    surface.addEventListener('pointerdown', e => {
      if (st.open || hold || (e.pointerType === 'mouse' && e.button !== 0)) return;
      hold = { id: e.pointerId, t0: performance.now(), x: e.clientX, y: e.clientY, moved: false, done: false };
      requestAnimationFrame(holdTick);
    });
    surface.addEventListener('pointermove', e => {
      if (!hold || e.pointerId !== hold.id || hold.done) return;
      if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > MOVE_PX) { hold.moved = true; hideCue(); }
    });
    const lift = e => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; hold = null; hideCue();
      if (h.done || h.moved || performance.now() - h.t0 >= TAP_MS) swallow = true;
    };
    for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, lift);
    surface.addEventListener('pointerleave', e => { if (hold && e.pointerId === hold.id && !hold.done) { hold.moved = true; hideCue(); } });
    // a long press asks for no menu and selects nothing
    surface.addEventListener('contextmenu', e => e.preventDefault());

    return {
      open, close, isOpen: () => st.open,
      /* The line that says a choice was not saved, "Not saved: ..." with the server's reason, or ''
         once a save succeeds. */
      note(text) { st.unsaved = text || ''; if (st.open) render(); },
      /* The cue as it looks part way through a hold (q from 0 to 1) at (x, y), held there, for
         the screenshots. */
      cue(x, y, q) { showCue(x, y, q); }
    };
  }
  api.mount = mount;
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : {});
