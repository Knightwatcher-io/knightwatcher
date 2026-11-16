# Worlds

A world is what the knight's surroundings are made of: the scenes, the supporting cast, the
drawings of the devices, the words and the overlay. Format 1.1 of the packs carries a world as
data ([packs.md](./packs.md#format-11) gives the format and its checks). This page describes what
the page draws from a world today: the scene compiler, `web/js/world.js`, and the medieval world's
pack, `kw.medieval`, which holds all seven scenes, the battlement, the camp, the yard, the cellar,
the smithy, the house and the court, the devices, the prop set `props.medieval`, and the cast: the
three monarchs, the goblin and the fly, and the words and the overlay. Step W5 of the conversion
gave the scenes but the court, step W6 the devices, step W7 the cast and with it the court, and step
W8 the words and the overlay: the page builds the quiet line and the events' captions from the
parts the collector sends, in the world's words, and takes the colours and the font of the words
over the scene from the world's overlay. Step W9 added the world itself as a preset, `world.medieval`,
which the settings resolve against the parts set beside it, and the devices chosen per kind
([Worlds as presets](#worlds-as-presets)). Everything is drawn from `kw.medieval` 0.6.0, which
ships unsigned until its signing run.

## The medieval world's pack

`web/packs/medieval.pack.json` is the medieval world's pack: id `kw.medieval`, format `[1, 1]`,
version 0.6.0, licensed as the base pack is. Its carrier, `web/packs/medieval.pack.js`, is written by
`tools/pack-carrier.js` like the base pack's ([packs.md](./packs.md#carriers)), and `index.html`
loads it after the base pack's. It holds:

- the scene `battlement`, the battlement of `web/js/scenes/battlement.js` written as data. Its first
  still layer holds, in the code's order, the sky, the stars, the two ridges of hills, the far keep
  with its crenels and lit windows, the moon, the parapet's bricks and coping, the merlons, the
  walkway and its flagstones, and the torch's bracket. Its second still layer, drawn while the WAN is
  down (`"when": ["cond:wan_down"]`), holds the cut rope of the bell, its frayed end and the length
  of rope on the walkway. Its first moving layer holds the stars that blink, the torch's light, its
  flame and the mark where the devices are drawn; its second, also while the WAN is down, the three
  sparks at the rope's end, which blink on a keyframe clock. Its places, spot, rounds and `can` are
  the code scene's. It is quiet, hosts the flies, the crate, the feast and the foe, and gives the foe
  the code scene's zone and a wall, the merlons and the parapet between them, which the goblin
  climbs over;
- the scene `camp`, the camp of `web/js/scenes/camp.js` written as data. Its one still layer holds,
  in the code's order, the sky, the stars, the two rows of pines, the four broad trees, the ground
  and the worn patch round the fire, the tufts of grass, the tent with its pole and guy ropes, the
  stone the pie warms on, the eight stones of the fire ring, the two crossed logs and the log to sit
  on. Its one moving layer holds the fire's light, the three flames, the embers, the mark where the
  devices are drawn and the fireflies. Its places, spot, rounds and `can` are the code scene's. It
  is quiet, hosts the flies, the crate, the feast and the foe, and gives the foe the code scene's
  zone with no wall, so the goblin digs out of the ground;
- the scene `yard`, the training yard of `web/js/scenes/yard.js` written as data. Its one still layer
  holds, in the code's order, the sky, the stars, the merlons of the curtain wall as a tile, the
  wall's bricks and coping, the two arrow slits, the door under its stone arch (the arch's rows
  clipped where the door begins), the sconce, the beaten earth, its pebbles (the effect `pebbles`)
  and tufts, the shadow under the dummy, the rack of spare arms, the barrel the pie stands on, the
  three bales of hay and the dummy's post. Its one moving layer holds the sconce's light and flame,
  the mark where the devices are drawn, and the practice dummy: the lean of its pole, then its arms,
  sack, head and shield in the group `dummy`, and last the straw it sheds. Its places, spot, rounds
  (the first of them `train`) and `can` are the code scene's. It is quiet and hosts the flies, the
  crate and the feast, but no foe, and its `target` is `{ "group": "dummy", "hitAt": 420, "every":
  5600 }`, which gives it the training act;
- the scene `cellar`, the cellar of `web/js/scenes/cellar.js` written as data. Its one still layer
  holds, in the code's order, the wall's bricks, the row of arches, the two shelves with what stands
  on them, their boards and their brackets, the piers, the cobwebs, the sconce, the flagstones and
  their seams, the two crate stacks and the barrel. Its one moving layer holds the sconce's light,
  the flame and the mark where the devices are drawn. Its places, spot, rounds and `can` are the code
  scene's, and it keeps the weapon away (`"weapon": "away"`) and the helmet on;
- the scene `smithy`, the smithy of `web/js/scenes/smithy.js` written as data. Its one still layer
  holds, in the code's order, the wall's bricks and its beam, the tool board with the hammer, the
  tongs and the two horseshoes (the effect `horseshoe`), the quench barrel and the glint on its
  water, the small table, the forge's hood and chimney (the effect `hood`), its bricks, the hearth
  (a tile of one repeat, below), the mouth of the fire, the floor of slabs and the ash, the anvil,
  and last the gear at rest: the shield on the wall and the weapon across the anvil, each through a
  `rest` mark. Its first moving layer holds the fire's light, the coals, the three flames, the
  sparks over them, the hot tip of the blade (a `rest` mark for the weapon at the anvil's rest) and
  the mark where the devices are drawn; its second, while the hammer strikes (`"when": ["strike"]`),
  the burst of sparks at the blow, `{ "k": "fx", "fx": "burst", "p": [{ "spot": 1, "c": 132 }, 418]
  }`. Its places, spot and `can` (`updating` alone) are the code scene's, and so are its rests,
  `anvil`, `{ "from": "spot", "x": 50, "y": 425, "a": "flat" }`, and `wall`, `{ "kind": "hang", "x":
  145, "y": 312, "w": 100, "h": 132 }`. It takes the helmet off, holds the weapon (the act puts it
  on the anvil), is not quiet and hosts nothing, and its `anvil` is `{ "rest": "anvil" }`, which
  gives it the anvil's act. Its one round, at its spot, is not compiled (below);
- the scene `house`, the knight's house of `web/js/scenes/house.js` written as data. Its first still
  layer holds, in the code's order, the roof's underside and its rafters (the effect `rafters`), the
  plank wall (the effect `planks`) and its posts as a tile, the beam, the moonlight and the window
  with its stars and moon, the weapon on its pegs and the shield beside them (`rest` marks), the
  hearth of stone with its logs, mantel, jug and cup, the floor of boards with its seams as tiles,
  the rug, the bed, the stool and the table. Its second still layer, while the television is on
  (`"when": ["tv"]`), holds the television on the table; its third (`"!tv"`) the candlestick. Its
  moving layers hold, in order: the hearth's fire; while the television is on, its picture in the
  colour a palette track gives and, in a layer of its own, the figure crossing it on a `dx` track
  and the scan lines; while it is off, the candle's light and flame (the effect `candle`); the mark
  where the devices are drawn; in bed, the `sleeper` mark and the blanket, which breathes by two
  copies of its shapes shown in turn; out of bed, the blanket made up; and while the helmet is off,
  the helmet on the stool (a `rest` mark). Its places, spot, rounds and `can` are the code scene's,
  and so are its rests: `stool`, `{ "kind": "surface", "x": 460, "y": 476, "w": 76, "h": 80 }`,
  `pegs`, `{ "x": 618, "y": 228, "a": "flat", "stamp": "peg" }`, and `wall`, `{ "kind": "hang", "x":
  844, "y": 164, "w": 100, "h": 140 }`. It takes the helmet off, keeps the weapon away, is quiet and
  hosts the feast. Its `bed` is `{ "head": [-15, 262], "blanket": "blanket", "zeds": [150, 270] }`
  and its `screen` `{ "group": "tv" }`;
- the scene `court`, the royal court of `web/js/scenes/court.js` written as data. Its one still
  layer holds, in the code's order, the wall's bricks, the pillars every 480 with their ledges and
  sconces (a tile), the two banners, the floor and its squares (three tiles, one for each row), the
  carpet, the dais's steps (a tile of one repeat, below), the throne, the `patron` mark where the
  monarch is painted, and the table. Its one moving layer holds the torches' lights and flames (a
  tile, the light the effect `flicker`), the mark where the devices are drawn, the `patron` mark
  where the monarch's mouth is drawn and the `bubble` mark. Its places, spot and `can`
  (`ssh_session` alone) are the code scene's. It is not quiet and hosts nothing, and its `seat` is
  `{ "x": 820, "y": 505, "bubble": [672, 180], "turn": 3200, "mouth": 230 }`, which gives it the
  seat's act. Its one round, at its spot, is not compiled, as the smithy's is not;
- the prop set `props.medieval`, the devices of `props.js` written as data: the five kinds `pi`
  (the raspberry pie), `camera` (a barn owl), `machine` (a cauldron), `vm` (a potion flask) and
  `box` (an iron-bound chest), each up and gone, below ([The devices](#the-devices));
- the cast members `patron.a`, `patron.b` and `patron.c`, the three monarchs of `court.js` written
  as data: each seated on its anchors, its mouth shut and open, and the user's skin, hair and robe
  laid over it as the court lays them, below ([The cast](#the-cast));
- the cast member `foe.goblin`, the goblin of `props.js` written as data: its measures and its six
  poses, built from ten parts they share, below;
- the cast member `critter.fly`, the fly of `props.js` written as data: its two frames and the dead
  fly that falls once it is swatted, below;
- three stamps, `sconce`, `barrel` and `peg`: the props `sconceHD` and `barrelHD` of `props.js`, the
  barrel at the 84 by 72 the cellar and the yard draw it, and one of the house's pegs, counted from
  where the weapon's frame puts it;
- sixteen stamps for the devices' lamps of their own, the dark and the lit drawing of each, up
  and down: the pie's (`pie.up.*`, `pie.down.*`), the filling in the gaps of the lattice and then
  the filling of the last slice; the owl's (`owl.up.*`, `owl.down.*`), its eyes and then its dazed
  spirals; the cauldron's (`cauldron.up.*`, `cauldron.down.*`), its brew and bubbles and then its
  last ember; and the flask's (`flask.up.*`, `flask.down.*`), its potion upright and then on its
  side;
- the word set `words.medieval`: the quiet line's parts as `ALL QUIET`, `{n} up`, `backup {at}`
  and `{n} ads slain`, `{short} ads slain` or `{short} slain`, and the captions `BANISHED {addr} ·
  {jail}` or `BANISHED {addr}` for a ban, `DELIVERED · {title}` for an import and `STORES SAFE {at}`
  for a finished backup, with its name, `Medieval`, its watcher, `the knight`, and the settings
  screen's labels, below ([The words and the overlay](#the-words-and-the-overlay));
- the overlay `overlay.phosphor`: the colours `display.css` has always given the words at each level,
  their black outline, the scrim's black, the caption's background at 0.66 alpha, and the font
  `vt323`, below;
- one palette entry, `house.screen`, the television's first colour, which the house's palette track
  changes every 400 ms;
- the preset `world.medieval`, the medieval world whole: the base pack's Classic build and its
  default outfit, the quiet scenes `battlement`, `camp`, `house` and `yard`, the scene of each
  condition, `patron.a`, `foe.goblin` and `critter.fly`, `props.medieval`, `overlay.phosphor`,
  `words.medieval`, and the camp as its picture, below ([Worlds as presets](#worlds-as-presets)).

At the widest screen they assume, the checks find:

| Scene | Still layers | One frame of the moving and over layers |
|---|---|---|
| battlement | 342 shapes, 25 967 fills | 7 shapes, 185 fills, 1 glow |
| camp | 66 shapes, 56 668 fills | 7 shapes, 718 fills, 8 glows |
| yard | 298 shapes, 28 929 fills | 44 shapes, 2 086 fills, 1 glow |
| cellar | 440 shapes, 76 803 fills | 3 shapes, 120 fills, 1 glow |
| smithy | 339 shapes, 15 212 fills | 9 shapes, 508 fills, 2 glows |
| house | 370 shapes, 71 245 fills | 46 shapes, 2 128 fills, 3 glows |
| court | 408 shapes, 50 555 fills | 19 shapes, 904 fills, 8 glows |

against limits of 200 000 fills for the still layers, and 16 000 fills and 24 glows for a frame.
The shapes are counted with each tile's repeats and each stamp's shapes written out. The camp's
glows are the fire's light and the seven fireflies, the smithy's the fire's light and the sparks',
and the house's the fire's, the television's and the candle's, counted together though the last
two never show at once: a frame is costed with every layer drawn; the court's are its torches'
lights, one for each pillar the widest screen shows. The gear at rest, the hot tip, the sleeper, the
Zs, the patron and its speech bubble are the engine's drawing, as the devices are, and count toward no scene's cost;
the stamp a weapon's rest names counts twice, once for each peg.

The devices cost, still and moving (the moving part with a lamp of the kind's own):

| Kind | Up | Gone |
|---|---|---|
| `pi` | 3 308 fills still, 411 moving | 633 still, 34 moving |
| `camera` | 539 still, 32 moving | 644 still, 34 moving |
| `machine` | 420 still, 54 moving | 366 still, 12 moving |
| `vm` | 117 still, 72 moving | 108 still, 12 moving |
| `box` | 137 still | 178 still |

against limits of 4 000 fills for a still part and 600 for a moving part with its lamp. The engine's
own lamp counts toward none of them. The monarchs' still parts cost 5 731 fills (A), 5 582 (B) and
5 132 (C), against a limit of 16 000, and each mouth 1 fill shut and 16 open, against 400; the
court counts none of them. The whole file weighs 226 KB, against the 512 KiB a pack may. The goblin's poses cost from 2 682 fills (`hit`) to 2 929
(`taunt1`), against a limit of 8 000 for each, its parts included. The fly costs 24 fills in each
frame and 1 for what falls, against a limit of 200 for each.

The pack is signed with `kw1` by a signing run, as the base pack is
([development.md](./development.md#signing-the-packs)): version 0.1.0, which held the cellar alone,
then version 0.2.0, version 0.3.0, which adds the devices, and version 0.4.0, which adds the cast.
Version 0.5.0, which adds the words and the overlay, is signed too. Version 0.6.0 takes the
raspberry off the pie and lights the pie through its lattice, with the last slice left in the dish
when the Pi is down, draws the other devices as medieval things, the owl, the cauldron, the flask
and the chest, and adds the preset `world.medieval`; it ships unsigned until its signing run. A copy changed after signing is
refused by a deployed page until its next run: that page draws every scene, every device and the
cast from code, shows the collector's own quiet line and captions, and keeps `display.css`'s
colours, while a `dev` page reads it all from the pack.

## Where the scenes are drawn from

`main.js` calls `KW.world.start(KW.packText, allowUnsigned)` once at start-up, right after
`KW.knight.start`, with the same texts and the same rule: `allowUnsigned` is true only on a page
whose `kw-version` meta tag says `dev`. A `dev` page reads `kw.medieval` signed or not; a deployed
page reads it only when it carries a signature that verifies against a key in `KEYS`.

Each scene of `kw.medieval` whose id names a code scene (today every scene) is compiled and takes that scene's place in `KW.scenes`. It is also put under its long name, `kw.medieval/cellar`,
which is not enumerable, so the engine and the settings, which list the scenes by their short names
until worlds can be chosen, see the same seven scenes as before. The code scenes stay where they
are, in `js/scenes/`, and are the fallback: the owner decided that the medieval world keeps a copy
drawn from code, as the knight does.

A scene is drawn from code when:

| What happened | The line in the console |
|---|---|
| the pack was refused at a step of the checks | `knightwatcher: the scenes of kw.medieval are drawn from code: the pack kw.medieval was refused at the signature step` |
| no text among the carriers is `kw.medieval` | `...: no pack kw.medieval is loaded` |
| the pack library is not loaded | `...: the pack library is not loaded` |
| reading threw, which `read()` never should | `...: the pack kw.medieval was refused at the size step`, the reason `the pack could not be read: <message>` |
| that scene failed to compile | `knightwatcher: the scene cellar is drawn from code: it could not be compiled: <reason>` |

Otherwise the line is `knightwatcher: the scenes battlement, camp, yard, cellar, smithy, house and court are drawn
from the pack kw.medieval 0.6.0, unsigned` (or `signed`), written with `console.info`; the others
are `console.warn`. The line lists the scenes drawn from the pack in the pack's order, so with the
cellar failing to compile it is `the scenes battlement, camp, yard, smithy, house and court are drawn ...`, after
the cellar's own line. Of two copies of `kw.medieval` the higher
version is used, as `gather` chooses.

The knight reads the same texts, so it reads `kw.medieval` too. The pack carries no items and
changes no look, but a refusal is the knight's to report: it goes into `KW.knight.status.refused`,
onto the settings screen's Status page under Refused packs, and to the console in the knight's own
line, `knightwatcher: the pack kw.medieval was refused at the signature step: sig: is missing, and
this page accepts only signed packs`. So on a deployed page until the signing run the console shows
that line and the scenes' line above it, which is the pair the base pack gives.

`KW.world.status` holds what `start` found:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any scene is drawn from `kw.medieval`, `'code'` otherwise |
| `pack` | `{ id, version, signed }` of the pack in use, or `null` |
| `refused` | `{ id, step, reason }` when the pack was turned away, or `null` |
| `scenes` | for each scene the pack gives that the engine knows, `'pack'` or `'code'` |
| `faults` | `{ scene, reason }` for each scene that failed to compile |
| `note` | the last line written to the console |

The devices are read in the same call, from the same pack: each kind of the prop set
`props.medieval` that the engine draws is compiled ([The devices](#the-devices)) and takes the
code's drawing's place in `KW.kinds`. A kind the set does not give, and every kind when the pack is
refused, missing or not loaded, keeps the code's drawing from `KW.props.KINDS`; a kind nobody gives
is drawn as `box`, as before. A kind that fails to compile is drawn from code, with a line of its
own, `knightwatcher: the device kind camera is drawn from code: it could not be compiled: <reason>`
(`console.warn`), written before the scenes' line, which stays the last. A pack whose kinds all
compile adds no line. `KW.world.props` holds what `start` found for them:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any kind is drawn from the prop set, `'code'` otherwise |
| `set` | `'props.medieval'` when the pack in use gives it, or `null` |
| `kinds` | for each kind the set gives, `'pack'` or `'code'` |
| `faults` | `{ kind, reason }` for each kind that failed to compile |

The cast is read in the same call too. Each member of the pack's cast whose id is its role, a dot
and the name of a member the engine has, as `critter.fly`, is compiled ([The cast](#the-cast)) and
takes the code's member's place in `KW.cast`; a member of a name the engine does not know is not
compiled. A member that fails to compile is drawn from code, with a line of its own,
`knightwatcher: the cast member critter.fly is drawn from code: it could not be compiled:
<reason>` (`console.warn`), written after the devices' lines and before the scenes' line.
`KW.world.cast` holds what `start` found:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any member is drawn from the pack's cast, `'code'` otherwise |
| `members` | for each member compiled or tried, by its id, `'pack'` or `'code'` |
| `faults` | `{ member, reason }` for each member that failed to compile |

The words and the overlay are read in the same call, each by its name until worlds can be chosen:
the word set `words.medieval` and the overlay `overlay.phosphor` ([The words and the
overlay](#the-words-and-the-overlay)). With the pack refused, missing or giving neither, the page
shows the collector's own quiet line and captions and keeps the colours and the font `display.css`
writes out, which are the overlay's own; that adds no line of its own. One that fails to compile is
left out the same way, with a line, `knightwatcher: the words are the collector's: the word set
words.medieval could not be compiled: <reason>` or `knightwatcher: the overlay is drawn from code:
the overlay overlay.phosphor could not be compiled: <reason>` (`console.warn`), written after the
cast's lines and before the scenes' line. `KW.world.words` and `KW.world.overlay` hold what `start`
found:

| Field | Holds |
|---|---|
| `words.source` | `'pack'` when the word set is in use, `'code'` otherwise |
| `words.set` | `'words.medieval'` when it is in use, or `null` |
| `words.name`, `words.watcher`, `words.labels` | the set's name, its watcher and its labels as written, each `null` without it; the settings screen does not read them yet |
| `words.quiet`, `words.captions` | its templates for each part of the quiet line and for each event type, or `null` |
| `words.faults` | `{ set, reason }` when the set failed to compile |
| `overlay.source` | `'pack'` when the overlay is in use, `'code'` otherwise |
| `overlay.id`, `overlay.name`, `overlay.font` | `'overlay.phosphor'`, its name and its font's id, each `null` without it |
| `overlay.props` | the CSS custom properties `main.js` sets on the display, `{}` without it |
| `overlay.faults` | `{ overlay, reason }` when it failed to compile |

The court draws its monarch from `KW.cast.patrons`, from the pack and from code alike, so on a page
that reads the pack the monarchs come from the pack's patrons even where the court itself is drawn
from code.

`start` puts the code scenes, the code's devices and the code's cast back before it reads, and
leaves the words and the overlay out, so a second call starts afresh. Not done yet:
a `kw.medieval` the collector downloaded into `data/packs/` is read by the knight but not compiled,
so the scenes come from the one that ships with the page; a scene from the pack that throws while
drawing is not caught; and the admin page draws its previews of the scenes from code, since it
does not start the world.

## The scene compiler

`web/js/world.js` defines `KW.world`:

| Name | Is |
|---|---|
| `compile(pack, id)` | the scene `id` of a loaded pack (a `read()` result of format 1.1) as an object with the scene interface; throws when the scene names something the compiler does not build |
| `start(texts, allowUnsigned, opts)` | reads `kw.medieval` from `texts` and puts its scenes in place, as above; `opts.keys` replaces `KEYS` in `read()`, for the tests only |
| `compileKind(pack, set, kind)` | the kind of device `kind` of the prop set `set` of a loaded pack, as an entry of `KW.kinds` ([The devices](#the-devices)); throws when it names something the compiler does not build |
| `compileMember(pack, id)` | the cast member `id` of a loaded pack, as an entry of `KW.cast` ([The cast](#the-cast)); throws when it names something the compiler does not build |
| `status` | what the last `start` found, or `null` before it |
| `props` | what the last `start` found for the devices, or `null` before it |
| `cast` | what the last `start` found for the cast, or `null` before it |
| `compileWords(pack, id)`, `compileOverlay(pack, id)` | the word set or the overlay `id` of a loaded pack, compiled ([The words and the overlay](#the-words-and-the-overlay)); each throws when it names something the compiler does not build |
| `join(parts, sets, limit)` | the line a list of parts makes in a set of templates, within `limit` characters, or `null` (below) |
| `quietLine(parts, text)`, `caption(type, parts, text)` | the quiet line and an event's caption the page shows: built from the parts in the words in use, or `text` as it is |
| `words`, `overlay` | what the last `start` found for the words and the overlay, or `null` before it |
| `MEDIEVAL`, `PROPS`, `WORDS`, `OVERLAY` | `'kw.medieval'`, `'props.medieval'`, `'words.medieval'`, `'overlay.phosphor'` |
| `QUIET_MAX`, `CAPTION_MAX` | 52 and 44, the longest quiet line and caption, as the collector's |

It also defines `KW.kinds`, the drawing of each kind of device the engine draws, and `KW.cast`, the
engine's supporting cast, both below.

**Nothing in a pack runs.** A scene compiles into frozen records: each shape is a kind from the
compiler's own table, each mark one of its marks, each predicate one it evaluates, each effect a name
in `KW.effects`. The scene's `paint`, `draw`, `over` and `key` are functions of the compiler that
read those records. No function is made from data, and `tests/web/pack.test.js` checks that the
source holds neither `eval` nor `Function(`.

What a compiled scene gives, from the pack's fields ([page.md](./page.md#the-scene-interface)):

| Interface | From |
|---|---|
| `spot`, `can` | the same fields |
| `rounds` | the same field, but in a scene with an `anvil` or a `seat`, below |
| `places` | `things`, each place copied as it is |
| `rests` | `rests`, below; only when there are any |
| `sword: false` | `"weapon": "away"` |
| `helmet: false` | `"helmet": "off"` |
| `outdoors: true` | `hosts` naming both `flies` and `crate` |
| `foeZone` | `foe`: its `side` and `spans`, as `{ side, spans }` |
| `wallAt(x)` | `foe.wall`, below; only when it has one |
| `act(t, s)` | `target`, the training act, or `anvil`, the anvil's act, both below; only when there is one |
| `bed: true` | `bed`, below |
| `paint(s)` | the still layers, into the cached backdrop; only when there are any |
| `draw(t, s)` | the moving layers |
| `over(t, s)` | the over layers, and the sleeper's Zs in a scene with a `bed`; only when there are either, as a code scene without `over` has none |
| `key(s)` | worked out by the compiler, below |
| `drawn(mon)` | `seat`: each patron's own hair and robe colours, from `KW.cast.patrons`, as `court.js` gives them for the settings' "As drawn" |

`name` and `quiet` are not read yet: the engine's own lists say which scenes take turns while all is
quiet, until worlds can be chosen. Of `hosts`, only the flies and the crate are read, as `outdoors`,
the one flag the engine lets both in by; it is computed into the engine's list of the crate's scenes
when `engine.js` loads, before `start` swaps the scenes, so a compiled scene must give the code
scene's. The feast and the foe play where `EVENTS` in `engine.js` says. `tests/web/world-scenes.test.js`
holds every scene's `quiet` and `hosts` to those lists and the settings' quiet scenes, so the data is
right when the engine comes to read it. `decor` is not read, since nothing draws decorations yet.

**Terms.** A scalar is a number, or a term object whose keys are added up in the order they are
written: `c`, the named values `L`, `R`, `T` and `W` (the canvas's edges and width on the grid,
from `KW.view`, `W` being `HR - HL`), inside a tile `x` and `h` (`hsh(x, seed) % mod`), and in a
moving or over layer `wave` (`amp * Math.sin(t / div + phase)`), in a scene with a target
`targetDx` (the pixels the training act moves the target by) and in a scene with an anvil `spot`
(the x of the spot the watcher works the anvil from, `s.kx`), both below. The first key gives the value and
each next one is added to it, so a term is written in the order the code adds: `{ "x": 1, "c": 178 }`
for `x + 178`, `{ "c": 0.09, "wave": [0.025, 150, 0] }` for `.09 + .025 * Math.sin(t / 150)`. That
is what makes the floating-point bits come out as the code's.

**Colours** resolve once, when the scene compiles: hex as written, `@base.<entry>` from the base
palette (a band list where the entry is one, such as `@base.steel3`), the pack's own palettes, and
band lists of these. In a stamp, `@lamp.down`, `@lamp.downLo` and `@lamp.downHi` are the down lamp's
reds as the engine spells them, `rgb(255,74,61)`, `rgb(168,49,40)` and `#ffd0c8` (`LAMP_REDS` in
`props.js`). A translucent colour is spelt as the scenes spell it, the alpha without its
leading zero: `{ "rgb": "#000000", "a": 0.3 }` is `rgba(0,0,0,.3)`. An entry of the pack's own
palettes that a palette track of the layer drives is chosen as the layer is drawn, below. A canvas reads both spellings
alike, and this one keeps the call records equal. (The knight's lists, compiled by `pack.js`, spell
it `rgba(0,0,0,0.3)`; [page.md](./page.md#checks) says how its test allows for that.)

**Shapes.** A `rect` filled with one colour draws as `Rh` and with a band list as `Rv`; `ell`,
`rrect`, `poly`, `strip` and `glow` draw through the primitive of their name. `fx` draws the effect
of `KW.effects` it names, its scalars evaluated as terms and its colours resolved, with the scene's
time when it moves, and a triggered one, `burst`, with the clock of the scene's act: the ms since
the target was last struck, or the progress of the hammer's blow, and not at all while the hammer
is not striking.
A `pix` shape paints its rows from its point in one pass through `D.pix`, each character the
colour its key gives and `.` clear. `use` draws a stamp's shapes moved to its point. A `tile` draws its shapes at each `x` from
`Math.floor(from / step) * step + phase` while `x` is below `to`, as the scenes' loops run; each of
its picks gives `@pick.<name>` one of its colours at each `x`, `of[hsh(x, seed) % of.length]`. An
`ell` or an `rrect` with a `clip`, `[top, bottom]`, draws only its rows between the two ys, counted
from the same anchor as its point, `null` for no bound: the code's `ell(460, 360, 82, 66, c, null,
360)` is `"clip": [null, 360]`. The mark `things` is where the devices behind the knight are drawn,
`KW.devices.draw(t, s)`, and the mark `sleeper` where the watcher's head lies in bed (below).

**Rests and the rest mark.** A scene's `rests` compile to the form the code scenes give in `RESTS`:
a frame for the weapon, `{ x, y, a }`, its angle `"upright"` as 0, `"flat"` as `Math.PI / 2` and a
number as it is, and a place, `{ kind, x, y, w, h }`, for a rest view. A rest with `"from": "spot"`
counts its x from where the watcher stands, `s.kx`; the interface leaves that field out, as the code
scenes have it, and `x` is then the distance from the spot. The mark `{ "k": "rest", "slot": "main",
"at": "anvil" }` draws the watcher's equipped gear of its slot at that rest through
`KW.knight.rest.draw`: the weapon on the frame with its angle, the helmet or the shield in the place
at its `x` and `y`, which is the call `smithy.js` makes, `K.rest.draw('main', kx + 50, 425, Math.PI /
2)`. In a still layer the gear is painted into the backdrop, and in a moving or over layer each
frame, as the house draws the helmet on its stool while the helmet is off. At the rest the scene's
`anvil` names, the weapon lies in the backdrop and the hammer works it, so there a rest mark for the
weapon in a moving or over layer draws the anvil's hot tip on the blade (below), and not the weapon
a second time.

A helmet or a shield is drawn only where its rest view fits: `KW.knight.rest.fits(slot, place)` says
whether the equipped item's rest view has the place's `kind` as its `fits` and a `box` no wider than
the place's `w` nor taller than its `h` ([page.md](./page.md#gear-at-rest)), and the mark draws
nothing where it does not. The weapon has no rest view and lies on its frame as before. Every view
in the base pack fits every place the medieval scenes give it: the helmet's 64 by 70 the stool's 76
by 80, the shield's 96 by 132 the house's wall of 100 by 140 and the smithy's of 100 by 132.

A frame may name a stamp, as the house's pegs do: `{ "x": 618, "y": 228, "a": "flat", "stamp":
"peg" }`. The mark then draws the stamp under the weapon twice, before it, at the frame's `y` and at
the xs the engine works out from the weapon's `blade` (`KW.knight.rest.blade()`): 28 past where the
blade starts and 45 short of its point, from the grip's middle, which is `pegXs()` in `house.js`.
For the greatsword the pegs stand at 680 and 836, and for the arming sword at 680 and 748; a weapon
that gives no blade gets the greatsword's. The interface leaves `stamp` out, as it does `from`.

**Layers and the key.** A layer is drawn when every predicate of its `when` holds:
`cond:<id>` when the winning condition is `id`, `tv`, `inBed`, `helmOff` and `strike` from the
frame, each after an optional `!`. `night` always holds and `day` never does, since the medieval
world is drawn at night and nothing yet decides between them. The backdrop's key is worked out
from what the still layers read: one character for each predicate their `when` names, in the order
first named, `1` where it holds. A scene writes no key of its own, so the key cannot miss something
the backdrop reads. Where the still layers paint gear at rest, the key goes on with the spot's x,
rounded, when any of their rests counts from the spot, and then, once for each slot in the order
first painted, `'|'` and the equipped item's name, `KW.knight.rest.key(slot)`, so a change of gear
paints the backdrop again. The cellar's and the camp's still layers wait on nothing, so their keys
are always empty and each backdrop is painted once for each shape of the screen, as the code scenes'
are. The battlement's rope is painted only while the WAN is down, so its key is `1` then and `0`
otherwise, where the code scene's is `wan` and the empty string: the strings differ, and the states
they tell apart are the same. The smithy's key is `|440||kw.base/main.greatsword` at its spot with
the greatsword and no shield, and `|440|code|code` on the knight's code path, where the code
smithy's are `440|kw.base/main.greatsword` and `440|code`. The house's still layers wait on `tv` and
`!tv` and paint the weapon and the shield, so its key is `10|kw.base/main.greatsword|` with the
television on, where the code house's is `tv|kw.base/main.greatsword`.

**Groups and keyframes.** A moving or over layer may declare `groups`, a shape in it may name one
with `"g"`, and its `anim` drives them. What is built is what the battlement and the house need: a
clock in whole milliseconds (`"ms": true`), looping or played once, from its `phase`, with four
kinds of track, each stepped:

- a `show` track: a group whose `show` is 0 is not drawn;
- a `dx` or a `dy` track: the group's shapes are moved by its value, as the house's figure crosses
  the television's picture 6 pixels every 700 ms, `[[0, 0], [700, 6], ..., [3500, 30]]` over 4 200 ms,
  the code's `744 + (Math.floor(t / 700) % 6) * 6`;
- a palette track, `{ "pal": "house.screen", "ease": "step", "keys": [[0, "#7fe9ff"], [400,
  "#e8f0ff"], ...] }`: the shapes of the layer that name the entry are drawn in its colour of the
  moment, as the television's picture changes colour every 400 ms over 2 400, the code's
  `[...][Math.floor(t / 400) % 6]`. The entry is the pack's own, its value the colour anywhere else;
  named inside a band list, in an effect or through another entry, it is refused by name;
- a wave track, `{ "g": "pot", "ch": "dx", "wave": [amp, div, phase], "round": true }`: the group
  moves by `amp * Math.sin(t / div + phase)` of the scene's time, rounded to whole pixels with
  `round`, as `Math.round(Math.sin(t / 190) * 1.5)` is. It moves all of a group's shapes, so the
  house's candle, whose flame sways only at its tip, is the effect `candle` instead, and no scene of
  the medieval world uses a wave track yet.

A key holds from its time to the next key's, the first key's value before it and the last's after
it, as the step ease does in format 1.0; any other ease is refused by name. The clock is the
scene's time modulo the period, both in ms. The rope's sparks are a layer of three rects in the group
`sparks`, over a period of 450 ms with the keys `[[0, 1], [150, 0]]`: shown from 0 to before 150 of
every 450 ms, which is the code's `Math.floor(t / 150) % 3 === 0` for every whole millisecond.
Dividing first, `(t / period) % 1` against `150 / 450`, would not be: at 600 ms the quotient's
fraction falls a hair below the key's, and the sparks would show where the code hides them.

**The foe's wall.** `foe.wall`, `{ period, offset, high: [width, y], low }`, compiles to `wallAt(x)`,
`((x + offset) % period + period) % period < width ? y : low`, the battlement's own arithmetic: its
`{ "period": 160, "offset": 70, "high": [80, 411], "low": 464 }` is the code's
`((x + 70) % 160 + 160) % 160 < 80 ? HFL - 119 : HFL - 66`. A `foe` without a wall gives no `wallAt`,
and the goblin digs out of the ground, as at the camp.

**The target's act.** A scene with a `target`, `{ group, hitAt, every }`, gets the act the engine
plays there, built inside the compiler's own table of acts, since the engine calls a scene's
`act(t, s)` and is not to change until it plays acts from the parts itself. It is `act()` in
`yard.js` with the yard's numbers taken from the part: at a spot whose round's act is `train`, while
all is quiet, a swing of 900 ms every `every` ms, the target struck once the swing is `hitAt` ms in;
while the CPU runs hot, a swing every second, struck at 470 ms, the eyes half shut and the body
bobbing. A blow is not counted again within 2 000 ms (600 while hot). Struck, the target's group
moves by `Math.round(Math.sin(a / 60) * 15 * (1 - a / 900))` pixels, `a` the ms since the blow, until
900 ms have passed: that is the group's dx and the named value `targetDx`, so a shape outside the
group can follow part of the motion, as the yard's post leans to `713 + targetDx * 0.8`. A `burst`
in such a scene counts its time from the blow. Each compiled scene keeps the time of its last blow,
as `yard.js` keeps `dummyHit`. The wobble cannot be keyframes: it changes value 71 times in its
900 ms, and a track holds 32 keys. The target is a group the act moves, drawn where its shapes stand
in the layer; the mark `{ "k": "target" }` is reserved, and refused by name until it is given a
use.

**The anvil's act.** A scene with an `anvil`, `{ rest, spark }`, gets the act the engine plays in
the smithy, built beside the target's in the compiler's table of acts. It is `act()` in `smithy.js`
with its numbers in the compiler's table `ANVIL`: whatever else is up, the weapon put away
(`o.sword = false`) and the hammer rising slowly and falling fast once every 1 300 ms, `o.hammer`
`1 - ease(c / .55)` for the first 55 hundredths of the cycle `c` and `((c - .55) / .45) ** 3` after,
a progress bar filling over 9 seconds, and the hammer striking from 93 hundredths of a cycle to 6 of
the next, when `strike` holds and the eyes shut. While it strikes, a triggered effect gets the
blow's progress, `(c > .5 ? c - .93 : c + .07) / .13`, from 0 to 1 over the strike, which is the
sparks the hammer throws; while it does not, no triggered effect is drawn. The act gives the moving
and over layers the named value `spot`, the watcher's x, which the anvil's places count from, so
that the sparks fly where the hammer falls: the smithy's are at `[{ "spot": 1, "c": 132 }, 418]`,
the code's `[s.kx + 132, 418]`. The anvil's `spark` is optional, reserved and not read: the sparks
are the scene's own `burst`, in a layer that waits on `strike`, and the smithy gives none.

The act holds the watcher at the anvil, so a scene with an `anvil` gives no `rounds`, as
`smithy.js` gives none: with rounds the engine would walk the knight between them, and the hammer
would follow. The format asks for one round at least, so the smithy's data has one at its spot,
guarding, which is where the act keeps the knight.

The **hot tip** of the blade is part of the anvil's act, and reads the equipped weapon's `blade`,
`KW.knight.rest.blade()`: it is drawn where a `rest` mark for the weapon at the anvil's rest stands
in a moving or over layer, on the weapon as that rest lays it, and only for a weapon that gives a
blade. It is the code smithy's drawing with its numbers in the compiler's table `TIP`: from the
point, `to` along the blade, and its edges, `half` either side, a glow that flickers, a dithered
patch 87 short of the point, three bands of red to orange starting 73, 57 and 43 short of it, the
point white-hot, and a line of shine and one of shade. No pack can say it, since it is drawn from
the weapon's own measurements.

**The bed and the screen.** A scene with a `bed`, `{ head, blanket, zeds }`, gives `bed: true`,
by which the engine puts the watcher in bed at night and while a container is unhealthy, and two
drawings of the engine's, with numbers from `house.js` in the compiler's tables `SLEEPER` and
`ZEDS`. The `sleeper` mark draws the watcher's bare head, `KW.knight.head`, with the corner of its
box at `head` moved 5 pixels for each unit of the pose's `headDx`, and while the pose holds the ice
bag (`o.icebag`, while unwell) the bag on the brow, at fixed offsets from `head`; the layer's shapes
after the mark, the blanket, are drawn over it. Over everything, while the winning condition is
`night`, the compiled `over` draws three Zs rising from `zeds`, each over 2 600 ms a third of the way
after the last, growing and fading out over the last fifth of their rise. `blanket` names the group
of the blanket and is not read: the house's blanket breathes by two copies of its shapes, the
groups `blanket` and `breath`, shown in turn on a `show` track over 3 800 ms, since only its top edge
rises and a `dy` would move all of it.

A scene with a `screen`, `{ group, glow }`, has that group's shapes drawn only while the television
is on (`s.tv`), whatever the layer's `when`; the house's picture is in the group `tv`, in a layer
that waits on `tv` as well. `glow` is optional, reserved and not read: the television's light is a
`glow` of the scene's own, in the palette track's colour. Streaming is the knight's pose, which the
engine sets, so the screen gives no act of its own, and nor does the bed: the house has no `act`.

**The seat's act.** A scene with a `seat`, `{ x, y, bubble, turn, mouth }`, gets the court's talk,
`draw()` in `court.js` with its numbers from the part. The patron and the watcher take turns of
`turn` ms, the patron silent first; while the patron talks its mouth opens and shuts every `mouth`
ms and its speech bubble shows at `bubble`, through `KW.knight.speech`, and after the moving layers
the act sets the watcher's pose: `o.mouth` `'flat'` and `o.speak` false while the patron talks,
`'talk'` and true while it listens. The court's are `turn` 3 200 and `mouth` 230, the code's
`Math.floor(t / 3200) % 2` and `Math.floor(t / 230) % 2`. The patron sits on the seat at `(x, y)`:
the mark `{ "k": "patron" }` draws, in a still layer, the patron `s.patron` names
(`KW.cast.patrons`, `a` for an id the cast does not have) in its look, its skin, hair and robe
checked as `court.js` checks them, and in a moving or over layer its mouth, open or shut. The mark
`{ "k": "bubble" }` draws the bubble while the patron talks. Where a still layer seats the patron,
the backdrop's key goes on with `'|'` and the court's own key of the patron: its id, with `@` and
where it comes from for a patron from a pack, and the ids of its skin, hair and robe, so a change of
monarch or of colours paints the backdrop again. The act holds the watcher at its spot, so a scene
with a `seat` gives no `rounds`, as `court.js` gives none, and it gives `drawn(mon)` for the
settings.

**What it does not build yet,** it refuses by name: the scene does not compile, the reason says
`<field>: <what> is not built in this engine yet`, and the scene is drawn from code. That covers
the shape kind `dith`, a `pix` colour chosen as it is drawn (a pick or a palette track's), the mark `target`, `only` on a shape, `"g"`
on an effect or a mark, of keyframes a clock in seconds, a triggered clock (`trigger`), any ease but
`step` and any channel but `show`, `dx` and `dy`, a colour a palette track drives inside a band
list, in an effect or through another entry, a mix or a contrast outside a patron, a pick inside a band list or an
effect, an effect inside a stamp, a triggered effect (`burst`) in a scene without a target or an
anvil, a burst of sparks on a target's blow and of straw on the hammer's, a scene with both a target
and an anvil, a scene that hosts the flies without the crate or the crate without the flies, and the
field `pole`. Each later scene adds the rows it
needs to the compiler's tables: a shape kind to `SHAPES`, a mark to `MARKS`, an act beside the
target's and the anvil's, a part of the key beside the predicates and the gear.

## The devices

`KW.kinds` holds the drawing of each kind of device the engine draws, by the contract's kind, with
the interface of `KW.props.KINDS` ([page.md](./page.md#devices)): `draw(x, y, t, ok, part)` draws the
kind standing on the base `(x, y)`, up (`ok`) or gone, its still part (`part` `'still'`), its moving
part (`'moving'`) or both, and `mark` is the height above the base of the top of the question mark.
`world.js` fills it with `KW.props.KINDS`'s entries when it loads, and `start` puts the prop set's
compiled kinds in their place: these are the base world's drawings. The settings then choose a prop
set for each kind ([Worlds as presets](#worlds-as-presets)), and `KW.world.useKinds()` puts each
kind's drawing from its set in `KW.kinds`. The engine's `placeHD` and `kindName` read `KW.kinds`, or
`KW.props.KINDS` on a page without the compiler. The question mark, the pole of a high place, the
drawing order, the still part's canvas and the lamp's phase in each place stay the engine's, and a
kind's class (where it may stand) is the engine's too.

A kind compiles each of its states, `up` and `gone`, into the still and moving shapes, compiled as
a scene's are and drawn moved to the base, and its lamp:

- **The engine's lamp**, a pair `[x, y]`: its dark rim is drawn after the still shapes
  (`KW.props.lampRim`) and its light after the moving ones (`KW.props.lampHD`), at the base plus
  the pair, on the loops of `LAMP` and `lampLevel`: green to black over 3.6 seconds while up, red to
  black over 2 while down.
- **A lamp of the kind's own**, `{ at, box, lit, dark, light }`, as the pie's is: two stamps of
  pix shapes, each pix shape at a whole point. Each is painted once, the first time it is drawn,
  into a canvas the size of the two drawings together, the lit drawing laid over the dark one, so
  that where the lit drawing is clear the lit canvas shows the dark drawing. Each frame, as
  `ownLampHD` in `props.js` does, it draws a soft light of radius 24 round `at`, in `light` while up
  (the engine's green if a kind gives none) and in the down lamp's red while gone, at 0.3 of the
  loop's level, then the dark canvas, then the lit canvas at the loop's level. The two drawings must
  lie inside `box` around `at`, or the kind is refused. The pie's lamp up is the filling in the gaps
  of its lattice, 398 pixels over 56 by 23, at `[1, -30]` in a box of 56 by 26, in the engine's green
  with no `light` of its own; its lamp gone is the filling of the last slice, 108 pixels over 30 by
  10, at `[4, -24]` in a box of 30 by 10. Both drawings of each cover the same pixels, so the lit
  canvas is the lit drawing alone.

What the compiler does not build in a prop is refused with a reason, and that kind is drawn from
code: a mark or a tile, an effect placed on the screen by a field of its own (a field of kind
`offset`, as the pebbles' `y`, which would not move with the device), and the parts of a scene
that a prop cannot name. An effect's points are moved to the base like the other shapes.

**The devices as data.** Each drawing of `props.js` is written out shape by shape, its coordinates
counted from the base, in the order the code draws. The owl, the cauldron, the flask and the chest
are written out by recording the calls of `cameraHD`, `machineHD`, `vmHD` and `boxHD` from a base at
(0, 0), so each shape is one call of the code; their lamps of their own are written from the maps in
`DEVICE_LAMPS`, and the chest's engine lamp stands at `CHEST_LAMP`. Their numbers are all eighths:
the owl's feathers and the cauldron's rivets have radii of 1.25, which at a whole centre fill the
pixels a radius of 1.2 would. Three things needed more than that:

- the pie's dish has thirteen flutes at `i * 5.3` across its rim, which fall between the eighths a
  pack's points keep to; the strip passes them to `fillRect` as they are, so no eighth draws the same
  fills. The effect `flutes` draws them, with the dish's numbers as its defaults;
- the pie's top is one pix of 83 by 33 painted in one pass, wider than the 64 a pix row may hold,
  and two pix shapes side by side would paint its rows in another order. The effect `crust` draws
  it, the lattice, the dome and the crimping, and `pieTop` in `props.js` now calls the same effect;
  `pieDish` calls `flutes`;
- the gone pie's lamp has a shaded side, the down red at two thirds. The format reserves it as
  `@lamp.downLo`, beside `@lamp.down` and `@lamp.downHi`, so that the gone lamp's lit drawing still
  uses only the engine's reds ([packs.md](./packs.md#format-11)). The pie's lamp stamps and the last
  slice, a pix shape of 34 by 16 in the gone still part, are written from the maps `pieShapes` in
  `props.js` works out, the lamp's from the filling the `crust` effect paints. The dazed owl's
  spirals keep their gaps dark: the lit stamp leaves them clear, so the dark drawing shows there,
  and the lit drawing still uses only the reserved reds.

Until 16 November 2026 the devices were drawn as the devices they are: a bullet camera, a tower
case, the same case in 88 dots for a virtual machine (in six stamps, past the 128 shapes a part may
hold), and a grey box. The owner chose the medieval things in their place.

## The cast

`KW.cast` holds the drawings of the engine's supporting cast, by role and then by name: `patrons`,
with the interface of `KW.props.PATRONS` (which `court.js` gives), `foes`, with that of
`KW.props.FOES`, and `critters`, with that of `KW.props.CRITTERS` ([page.md](./page.md#the-cast)). `world.js` fills it with the code's members when it loads, and
`start` puts the members the pack's cast gives in their place. The engine reads `KW.cast`, or the
code's tables on a page without the compiler; the court reads `KW.cast.patrons`. The engine keeps
the motion: where the flies hover, when they are swatted, the poof (`poofHD`) and the fall; the foe's
entrance over the wall or out of the ground, the strike and the exit; and the court keeps when the
monarch talks. A member gives only its drawings and its measures.

A member's shapes are compiled as a prop's and drawn moved to the point the engine gives, so the
marks, the tiles and an effect placed on the screen by a field of its own are refused in the cast as
in a prop.

**A critter** compiles to `draw(x, y, flap)`, which draws its frame `flap0` (`flap` 0) or `flap1` at
`(x, y)`, and `dead(x, y)`, which draws what falls. A shape in a group the critter gives an `alpha`
is drawn at that alpha: the canvas's alpha is set before the first of a run of such shapes and set
back to 1 before the first shape after it. So the fly's wings, in the group `wings` at 0.85, give
the calls `flyHD` makes, `globalAlpha` 0.85, the two wings, `globalAlpha` 1, the body and the eye,
where a translucent colour would have set no alpha at all. A group's `pivot` is not read, since
nothing turns a critter.

**A foe** compiles to the interface of `KW.props.FOES`: `pose(name)`, `poses` (the six the foe
player asks for), `anchor` (the sprite's `feet`), `size` (its `size`), `h`, `w`, `mid`, `crown` and
`exit`. A pose is drawn as its parts, in the order it lists them, then its own shapes, each part
compiled once and shared by the poses that list it. `pose(name)` paints the pose the first time it is
asked for into a canvas of `sprite.size`, the shapes moved to the feet, and keeps it, as `foeSprites()`
in `props.js` does; a name that is not a pose gives `stand`. Each compile paints canvases of its own,
so the code's goblin and the pack's never share one. `exit` names one of the engine's exits
(`FOE.exits` in `engine.js`, today `poof` alone): the foe player leaves by the foe's exit when the
engine has it and by the event's otherwise, so a world chooses an exit and never describes one.
The code's goblin gives `exit: 'poof'` too.

**The goblin as data.** The measures and the 24 points of the crown are `FOES.goblin`'s as they
stand. The drawing is `goblinHD` in `props.js` with its numbers counted from the feet, cut into ten
parts in the order `goblinHD` draws:

| Part | Is | Poses |
|---|---|---|
| `arms.hips`, `arms.up`, `arms.ears0`, `arms.ears1`, `arms.flung` | the arms behind the body, as `gArms` draws them: the limbs as strips then discs (`SP.stroke`), the hands | `stand`, `climb`, `taunt0`, `taunt1`, `hit` |
| `body` | the legs and feet, the tunic, its patch and the rope belt | all |
| `ears`, `ears.droop`, `ears.limp` | the two ears, lowered by 0, 14 and 16 | `ears` the first four, `ears.droop` `brace`, `ears.limp` `hit` |
| `head` | the head and its jaw, a spot on the far cheek and the two blushes | all |

Each pose's own shapes are what changes from one to the next and comes after the head: the eyes,
the brows, the mouth, the saucepan (6 lower in `hit`), the nose, and in `brace` alone the arms
clutched in front. The nose is the same in every pose and is written in each, since a pose draws its
parts before its shapes.

Three things needed more than writing the numbers out:

- each hand's three fingers stand at `Math.sin(a + d) * 9` from the hand, between the eighths a
  pack's points keep to, and six of their outlines fill pixels no eighth gives. The effect
  `fingers` draws them, `{ "k": "fx", "fx": "fingers", "p": [-36, -56], "a": 2.6, "r": 4.5, "colour":
  "@base.k" }` for the outlines and `r` 2.5 in the finger's colour for the fills, around the palm's
  own two ellipses. `gHand` in `props.js` keeps its own loop, and the records hold the two equal;
- the inner triangle of each ear has its tip 0.62 of the way to the ear's tip, which is not an
  eighth. The pack gives the nearest eighths that fill the same pixels with the goblin at its feet,
  where it is always painted, such as `[-62.25, -123.125]` for `[-62.28, -123.16]`;
- the shut eyes of `hit` are strips 2.2 either side, which is not an eighth; the pack gives 2.125,
  which fills the same pixels there.

**A patron** compiles to the interface of `KW.props.PATRONS`: `draw(x, by, look)`, its still parts
with the seat at `(x, by)`, `mouth(x, by, open, look)`, its state `open` or `shut`, and `drawn`, its
own hair and robe colours for the settings' "As drawn". Each shape is drawn moved to the anchor its
`at` names, or its part's (a state's: the seat). `look` is `{ skin, hair, robe }`, which the court
takes from `s.patron` and checks as before (a face of three bands and a cheek, three hair bands, four
robe bands), each `null` for the patron's own. A bound set takes the user's colours where the look
gives the user's set it binds, and its `own` otherwise: `skin` the look's face and cheek, `hair` its
three bands and its brow, `tabard` its four bands. A bound set needs an `own`, since the user may
leave it unchosen; one without is refused by name. The patron's palettes resolve against those
colours. Every colour is resolved once for each look, the first time the look is drawn, and the
compiled shapes are kept (at most 16 looks), so a frame resolves nothing; the court's backdrop is
painted again only when its key changes, and the mouth takes the look kept for it.

Two colour forms of format 1.1 exist for the patrons ([packs.md](./packs.md#the-cast)):

- **drawn and dressed**, `{ "drawn": "#1f1a2d", "dressed": { "mix": ["@hair.2", "#000000"], "k":
  0.3 }, "set": "hair" }`, an entry of a patron's palettes: `drawn` while the look leaves the bound
  set `set` names unchosen, `dressed` once it gives it. The court shades each monarch as drawn with
  colours of its own, B's and C's darkest strands, B's sheen and every brow, which no mix of its own
  hair gives (B's dark is `#1f1a2d`, its hair's darkest band darkened to 0.7 `#1d1929`); and with a
  chosen hair it shades from that hair. The entry names its set rather than leaving it to be worked
  out from the colours it refers to, since a brow refers to the hair and the skin and follows the
  hair alone;
- **contrast**, `{ "contrast": ["@hair.0", { "mix": ["@hair.2", "#000000"], "k": 0.15 }], "on":
  "@skin.face", "band": 1 }`: whichever of the two stands out more from `on` by the WCAG ratio, the
  second on a tie, `band` picking one band where `on` is a band list. It is the court's readable
  brow, `browOn` in `court.js`: a chosen hair's brow is its darkest band darkened, and on a skin
  where that would hardly show (light hair on a dark skin), its lightest band.

A mix is worked out as `toward()` in `court.js` does it, each channel moved and rounded, and the
contrast as `contrast()` there reckons it, so the colours are the court's to the bit.

**The monarchs as data.** Each monarch is `monarch()` in `court.js`, drawn once with every colour of
its own named as the pack names it, its numbers counted from the seat (820, 505 in the court): the
shoes and the robe, the ermine, the front of the robe, the sleeves and hands, what it holds, the
collar and what it wears on the chest, the hair behind, the face, the beard, the cheeks and eyes,
the hair over the face, the brows and the crown. Its shapes run in that order through two still
parts of at most 120, at the seat; the mouth's shapes are at the mouth's anchor, 193 above the seat.
Its sets bind `skin`, `hair` and `robe` (the user's tabard); its `own` is the base pack's warm skin,
which is the court's own, and the monarch's hair and robe as drawn, the hair's brow its own brow.
Its palette `mon` gives what the court derives from the hair and the iris:

| Monarch | `dark` | `brow` | `sheen` | `iris` |
|---|---|---|---|---|
| A | a mix of `@hair.2` to black by 0.3, which as drawn is A's own | drawn `#4a2a12`, dressed by contrast | | `#5a3a22` |
| B | drawn `#1f1a2d`, dressed the mix | drawn `#29233b`, dressed by contrast | drawn `#7a7299`, dressed `@hair.0` to white by 0.25 | `#3a4a86` |
| C | drawn `#946a28`, dressed the mix | drawn `#a87a30`, dressed by contrast | | `#2f6b55` |

Three things needed more than that:

- C's fringe, swept across the brow, is one polygon whose lower edge turns in where the sweep ends,
  so it is not convex, and no convex polygon fills its rows alike. The effect `fringe` draws it, `{
  "k": "fx", "fx": "fringe", "p": [0, -240], "colour": "@hair.1" }`; `hairC` in `court.js` keeps
  its own polygon, and the records hold the two equal;
- the links of C's chain of office hang at `26 * (i / 45) ** 2` below the collar, which is not an
  eighth; each is given the nearest eighth that fills the same pixels with the seat where the court
  puts it, such as `-144.625` for `-144.64`;
- C's crown has a post of gold under its jewel that `court.js` drew with `Rh` and the gold's band
  list, which a canvas takes for no colour, so it always showed in the outline's colour set just
  before it. `court.js` now names that colour, and the pack draws the same; the court's stored
  records were written again for it, in their `fillStyle` alone, and every picture is unchanged.

**The fly as data.** Its frames are `flyHD` in `props.js` with its numbers counted from where the
engine puts it: the wings 2 above the body in `flap0` and 6 above in `flap1`, the body and the red
eye the same in both. What falls is the 6 by 5 rect the engine drew itself before the cast,
`Rh(x - 3, y + a * a / 900, 6, 5, '#3a3344')`, which is now `deadFlyHD` in `props.js` and
`CRITTERS.fly.dead`; the engine passes the fall, `y + a * a / 900`, as the point.

What the compiler does not build in the cast, it refuses by name, and the member is drawn from code:
a role the engine does not have, a bound set without an `own`, and in any member the marks, tiles
and effects above. A colour a patron's palette or set does not give is refused with the entry it
lacks.

## The words and the overlay

The collector writes the quiet line and each event's caption whole, in plain words, and beside them
sends the parts they were written from ([state.md](./state.md)): `quiet_parts` beside `quiet_line`,
as `[{ "k": "quiet" }, { "k": "up", "n": "29" }, { "k": "backup", "at": "03:12" }, { "k": "ads",
"n": "4,812", "short": "4,812" }]`, and `parts` beside an event's `text` for a ban (`addr`, and
`jail` when it has one), an import (`title`) and a finished backup (`at`). Every value is a string
the collector has formatted, in its time zone and with its separators, so the page only chooses
words and joins. A part is sent whenever the collector had the reading, even when its own line had
no room for it.

**The words.** A word set gives each part a list of templates, longest first. `KW.world.join(parts,
sets, limit)` builds a line from them:

- each part takes the first of its templates whose placeholders it has values for; a template that
  names a value the part lacks, or gives empty, is passed over for the next, and a part with none
  left is passed over;
- the parts are joined with ` · `, and while the line is longer than `limit` the last part takes its
  next template, and with none left is dropped, then the part before it the same way. This is the
  rule of the collector's `quiet_line()` and `text.join_fitting()`;
- the first part is never dropped. Alone and still too long it is cut, as the collector's
  `text.clip()` cuts a caption: to `limit - 1` characters, white space trimmed, and `…`;
- runs of white space are made single, and characters are counted by code point, as Python counts
  them.

`join` gives `null` when the set has no templates for a kind of part that was sent, or no part can
be written. The quiet line is joined within 52 characters (`quietLine`), and a caption, one part
of the event's type, within 44 (`caption`). Either one shows the collector's text as it is when
there are no parts (an older collector, or an event without them), no words in use, or `join`
gives `null`. So the medieval words give `ALL QUIET · 29 up · backup 03:12 · 4,812 ads slain`
where the collector wrote `... 4,812 ads blocked`, `BANISHED 203.0.113.77 · sshd` for `BANNED
203.0.113.77 · sshd`, `DELIVERED · <title>` for `IMPORTED · <title>` and `STORES SAFE 03:12` for
`BACKUP DONE 03:12`. A count too long for the line takes its short form, `1.2M ads slain` for
1,234,567, before it is dropped. `main.js` writes the result with `textContent`, never as markup. The
headline, the detail and the "+N MORE" badge are always the collector's.

`labels` and `watcher` are carried in the compiled set for the settings screen, which does not read
them yet.

**The overlay.** `compileOverlay` turns the overlay into CSS custom properties, which `main.js`
sets on `#surface` once at start-up and `display.css` reads:

| Property | From | Read by |
|---|---|---|
| `--kw-ok` to `--kw-sleep`, `--kw-ok2` to `--kw-sleep2` | each level's two colours | each level's `--fg` and `--fg2`; `--kw-warn` and `--kw-crit` also colour the "+N MORE" badge |
| `--kw-outline` | `outline` | the words' outline, `text-shadow` |
| `--kw-scrim` | `scrim`, as `r,g,b` | the scrim's gradient stops, whose alphas stay in `display.css` |
| `--kw-caption` | `caption` | the caption's background |
| `--kw-font` | `font`, from the fonts the engine ships (today `vt323`) | the display's `font-family` |

The library has checked the values and held each level's colours within the status's bands of hue
and contrast ([packs.md](./packs.md#words-and-the-overlay)); `compileOverlay` checks their form again,
so that nothing but a six-digit hex colour, an `rgba()` it writes itself or a font of its own list
reaches the style. A pack never supplies CSS. `display.css` gives each property's value today as
its fallback, `var(--kw-ok, #39ff6a)`, for a page without the overlay. The overlay
`overlay.phosphor` holds the same values, so the screen is the same either way.

What the compiler does not build in the words and the overlay, it refuses by name: a font the
engine does not ship. Everything else the library has already refused.

## Worlds as presets

A world pack's `worlds` section holds presets, each a world's every part at once
([packs.md](./packs.md#format-11) gives the fields and the checks): the body and the outfit, the
quiet scenes and the scene of each condition, the patron, the foe and the critter, the prop set,
the overlay, the words, and the scene its card is drawn from. A name in a preset is local to its
pack, or `<pack>/<id>`. The pack library refuses a preset that leaves a part out, names a quiet
scene that is not quiet, or gives a condition a scene whose `can` does not list it.

`kw.medieval`'s preset, `world.medieval`, is the medieval world, which the settings call
`medieval`: the base world, and the page's own level ([page.md](./page.md#worlds)). Its outfit is
the base pack's `defaults`, its quiet scenes the four the code turns between (`TURNS` in
`engine.js`, `SCENES` in `settings.js`), and its scene for each condition the one
`KW.state.CONDITIONS` gives; `tests/web/worlds.test.js` holds the three equal. While the pack gives
the preset, `KW.settings.pageWorld()` takes the base world's scenes from it; without the pack, from
the code, so with nothing set the display is the same either way.

`start()` reads every pack among the texts but the base pack, which the knight reads, with the same
rule for signatures. Besides kw.medieval, it keeps each pack read cleanly that holds presets or prop
sets; a refusal of one of them is the knight's to report, as it reads the same texts. Today the page
ships no other world pack, and `data/packs/` brings none to `KW.world` yet. `catalogue()` lists for
the settings what is loaded:

- `worlds`: each preset by the name the settings use, `medieval` for `world.medieval` and
  `<pack>/<id>` for any other, with its display name, its pack, its card's scene, the preset as the
  library read it, and the labels of its word set (`The knight`, `The monarch` for the settings
  screen's pages);
- `sets`: each prop set by name, `medieval` for `props.medieval` and `<pack>/<id>` otherwise, with its
  display name and the kinds it draws;
- `scenes`: kw.medieval's scenes by their long names, `kw.medieval/camp`, each with its `can` and
  whether it is quiet;
- `names`: each long name of kw.medieval's parts and the short name it stands for:
  `kw.medieval/world.medieval` for `medieval`, `kw.medieval/patron.b` for `b`,
  `kw.medieval/foe.goblin`, `kw.medieval/critter.fly`, `kw.medieval/props.medieval`,
  `kw.medieval/overlay.phosphor`, `kw.medieval/words.medieval` and each scene's long name;
- `homes` and `quiet`: the base world's scene for each condition and its quiet scenes, from
  `world.medieval`.

Only kw.medieval's scenes, cast, words and overlay are drawn. Another world's own scenes and cast
are listed in what the settings resolve as parts the page cannot use, and the base world's are
drawn in their place, as for a part not loaded at all.

**The devices per kind.** The prop set `props` names draws every kind; `[look.devices]` names a set
for one kind over it. `useKinds(choice)`, given `{ pi: name, camera: name, ... }` as the settings
resolve it, puts in `KW.kinds` each kind's drawing from its set, compiled the first time it is asked
for and kept. A kind left out, or named `medieval`, takes the base world's drawing: the medieval
set's, or the code's where that kind failed to compile. A kind whose set is not loaded, does not draw
that kind, or fails to compile takes the base world's too, and `KW.world.devices`, `{ choice, kinds,
faults }`, says where each kind is drawn from and lists each fault as `{ kind, set, reason }`: `the
prop set kw.example/props.neon does not draw it`. A kind no set draws at all, which only a kind the
contract does not know can be, is drawn as `box` by the engine. `start()` ends with every kind from
the base world, and `main.js` calls `useKinds()` whenever the settings change the choice. A compiled
kind's `from` names its pack and the compile, so the engine's still-part canvases keep one set's
drawing apart from another's. `drawingOf(name, kind)` gives one set's drawing of one kind, or the
reason it cannot, without touching `KW.kinds`: the settings screen draws its device rows from it
([page.md](./page.md#the-settings-screen)).

## Writing a scene as data

The cellar, the camp, the battlement, the yard and the smithy show how code becomes data:

- a loop of fixed shapes across the screen becomes a tile. `for (let x = Math.floor(HL / 160) * 160 +
  60; x < HR; x += 160)` is `{ "k": "tile", "step": 160, "phase": 60, "from": { "L": 1 }, "to": { "R":
  1 } }`, and a loop that starts from `Math.floor((HL - 140) / 320) * 320 + 140` has `from` `{ "L": 1,
  "c": -140 }` and `phase` 140. A loop that counts from a fixed start, as the keep's crenels do
  with `232 + i * 19` for three passes, is a tile from 0 whose phase is the start: `{ "step": 19,
  "phase": 232, "from": 0, "to": 289 }`;
- a loop over a fixed list (the shelves at 260 and 380, the cobwebs' corners, the floor's four rows
  of seams, the camp's four trees) is written out, one copy of its shapes for each pass, the
  arithmetic done. So is a short loop whose passes differ in more than x, as the fire ring's eight
  stones step up and down and change their fill, and a hash of a pass's number rather than of an x
  (the bark on the camp's log, `790 + i * 13 + hsh(i, 12) % 6`) is worked out once and written as
  the number it gives;
- what a code scene draws only while a condition is up becomes a layer whose `when` names it, in the
  same place in the order: the battlement's rope is a second still layer after the first, and its
  sparks a second moving layer after the devices. A blink on a whole-millisecond clock, such as
  `Math.floor(t / 150) % 3 === 0`, is a `show` track over the period the expression repeats on;
- a `poly` names the way it is filled: `"dir": "rows"` for the code's `poly(pts, c)`, which fills by
  rows, and `"cols"` where the code passes `true`;
- a prop drawn by a function of `props.js` becomes a stamp, its coordinates counted from the point
  the scene puts it at;
- what an effect draws stays the effect's, named with the fields the code passes.

The cellar's arches needed the effect to grow. Their loop runs to 320 beyond the right edge, which
at the widest screen the checks assume is 2 256 on the grid, past the 2 048 a scene may reach, so
no tile can hold it. The `arch` effect draws the row itself when given a `step`, as `stacks` reaches
past the edge with its `past`: `{ "fx": "arch", "p": [178, 150], "step": 320, "phase": 140, "past":
320, ... }` draws an arch round `(x + 178, 150)` for each `x` the cellar's loop gives
([page.md](./page.md#the-effects)). With no `step` it draws the one arch, which is how `cellar.js`
still calls it.

The yard's pebbles needed an effect of their own. Each sits at a hashed point,
`x + hsh(x, 3) % 17`, which in a tile is a term with `h` inside a point inside a tile's shape: JSON
13 levels deep, past the 12 a pack may nest. `pebbles` draws the row itself, with the yard's
numbers as its defaults: `{ "k": "fx", "fx": "pebbles", "y": 530 }` is the yard's loop
([page.md](./page.md#the-effects)). `yard.js` keeps its own loop, and the call records hold the two
equal.

The smithy needed two more effects and one turn of a tile:

- its horseshoes are an arc stroked three times, `SP.stroke` through points every .23 radians,
  `x + Math.sin(a) * 18`, which fall between the eighths a coordinate of a pack must keep to.
  `horseshoe` draws one, its arc round `p`: `{ "k": "fx", "fx": "horseshoe", "p": [290, 230] }`;
- its forge's hood is a chimney over a hood that flares out, one polygon that `poly()` fills by rows
  and whose corners at the chimney's foot turn inwards, so it is not convex, which a pack's polygon
  must be. `hood` draws it: `{ "k": "fx", "fx": "hood", "p": [762, { "T": 1, "c": -2 }], "w": 168,
  "neck": 246, "foot": 292, "flare": 46 }` is the code's six points from `HT - 2` down to 292;
- its hearth runs from fixed xs to the right edge, `Rh(728, 324, HR - 728, ...)` and three more,
  and a length's `c` may not be below 0, so `{ "R": 1, "c": -728 }` is refused. The four shapes sit in
  a tile of one repeat at x 732, `{ "step": 4, "phase": 0, "from": 732, "to": 733 }`, and each width
  subtracts the tile's x instead: `{ "R": 1, "x": -1, "c": 4 }` is `HR - 732 + 4`, the bits of `HR -
  728` on the whole numbers the edges always are.

`smithy.js` keeps its own drawing of all three, and the call records hold the two equal.

The house needed three more effects, and keyframes of three new kinds:

- its plank wall is a loop of planks whose streaks of grain and knots sit at points hashed from the
  plank's x, which in a tile is a term with `h` inside a point inside a tile's shape, 13 levels deep,
  as the yard's pebbles were. `planks` draws the wall, with the house's numbers as its defaults: `{
  "k": "fx", "fx": "planks", "y": 176, "h": 354 }`;
- its rafters run to 120 beyond the right edge and lean 90 further, which on the widest screen the
  checks assume is 2 146, past the 2 048 a scene may reach, as the cellar's arches did. `rafters`
  draws the row: `{ "k": "fx", "fx": "rafters", "y": 166, "top": { "T": 1, "c": -20 } }`;
- its candle's flame sways only at its tip, by `Math.round(Math.sin(t / 190) * 1.5)`, and a group
  moves all of a shape. `candle` draws the flame: `{ "k": "fx", "fx": "candle", "p": [771, 382] }`;
- the television's picture changes colour on a palette track, its figure crosses it on a `dx`
  track, and the blanket breathes by two copies of its shapes on `show` tracks, as above. Two
  clocks of 2 400 and 4 200 ms make two layers, since a layer has one clock and a track of their
  common period, 16 800 ms, would need 42 keys, past the 32 a track may hold.

`house.js` keeps its own drawing of all of it, and the call records hold the two equal.

The court needed one more effect, and two turns of tiles:

- its torches' lights flicker by `.09 + .025 * Math.sin(t / 140 + x)`, `x` the pillar's, and a
  glow's alpha in a pack takes `c` and a wave of a fixed phase alone. `flicker` draws the light,
  with the phase a term: `{ "k": "fx", "fx": "flicker", "p": [{ "x": 1, "c": 25 }, 260], "r": 100,
  "colour": "#ffb000", "a": 0.09, "amp": 0.025, "div": 140, "ph": { "x": 1 } }`, in the pillars'
  tile;
- its floor's squares are one loop every 40 that draws where `(x / 40 + j) % 2` holds, for three
  rows `j`: three tiles every 80, the first and the last from 40, the middle from 0;
- its dais's steps run from fixed xs to the right edge, `rrect(640, 512, HR - 640 + 8, ...)` and
  three more, and a length's `c` may not be below 0. As the smithy's hearth, the four sit in a tile
  of one repeat, here at x 700, and each width counts back from it: `{ "R": 1, "x": -1, "c": 68 }`
  is `HR - 700 + 68`, the bits of `HR - 632` on the whole numbers the edges always are.

The throne, the two banners and the table are written out as the code draws them, and the monarch
is the patron's own drawing. `court.js` keeps its own drawing of all of it, and the call records
hold the two equal.

## Two copies, held equal

Each converted scene is drawn by two copies: its code in `js/scenes/`, the fallback, and its data in
`kw.medieval`. They must draw the same thing, and the tests hold them to it:

- `tests/web/scenes.test.js` draws every scene `kw.medieval` gives a second time, compiled from the
  pack, in every recorded state at 960 by 600, 1400 by 600 and 960 by 720, against the same stored
  records the code scene is held to. The records were stored from code, and only from code; the pack's
  copy is never stored.
- The backdrop's key is not in the records, so the same test checks that the compiled scene's key
  tells the recorded states apart exactly as the code scene's does: two states share a key from the
  pack when, and only when, they share it from code. The keys themselves may differ. The check walks
  every scene the pack gives, so each later scene comes under it as it is added.
- The same test checks that the compiled scene gives the code scene's interface: the same spot,
  places, rests, rounds, `can`, weapon and helmet, `outdoors` and `foeZone`, and the same parts
  drawn, `wallAt` among them.
- An act changes the knight's pose and the drawing from one moment to the next, and the target's
  keeps the time of its last blow from one frame for the next, so `tests/web/world-scenes.test.js`
  also runs every scene of the pack that has a `target`, an `anvil`, a `bed`, a `screen` or a `seat`
  frame by frame beside its code scene, and compares every call (`over`'s among them), every change
  to the knight's pose, after the act and after the draw, and `strike`: the target's every 10 ms through two training rounds while all is quiet
  and while the CPU runs hot, the anvil's every 10 ms through five blows of the hammer, idle and while
  updating, at the spot and at x 300, and the house's every 10 ms for 8.4 seconds asleep at night,
  sick in bed, with the television on while streaming and with it off while all is quiet, and the
  court's every 10 ms for 12.8 seconds, two rounds of its talk, while a shell is open and while all
  is quiet.
- `tests/web/knight.test.js` draws the house and the smithy from code with the knight's gear at
  rest, and `tests/web/world-knight.test.js` runs its checks on the two from the pack: the house
  painted with the television on and off and drawn asleep, unwell, with the helmet off and on, and
  the smithy painted at two spots and drawn at two moments, against the knight's stored records,
  with the knight from code and from the base pack; the same calls as the code scenes in the base
  pack's other looks (the arming sword and the shield, Broad and Slim); the backdrop keys, which
  name the gear; the rests, places and rounds; the pegs under the arming sword's blade; no hot tip
  for a weapon without a blade; and no shield on the wall when its rest view does not fit there.
- The records sample five moments, which cannot pin down where a blink starts and stops, so
  `tests/web/world.test.js` draws the battlement's sparks every 25 ms over four seconds, and at the
  edges of the blink, against the code's `Math.floor(t / 150) % 3 === 0`, and compares `wallAt`
  with the code scene's at every whole x from -1 200 to 2 400.
- `tests/web/world-scenes.test.js` runs the checks of `foe.test.js` and `places.test.js` that depend
  on a scene on each scene the pack gives, compiled from it, with the goblin from the pack's cast:
  the goblin's way in, where it stands, its hit and the blade against it in every scene that hosts a
  foe, and the places of the devices on the grid and clear of each other. It also holds the foe's
  whole plan in a scene from the pack, for every weapon and build, to the plan in the code scene with
  the code's goblin, and each scene's `quiet` and `hosts` to the
  engine's and the settings' lists. The two older files draw the code scenes and stay as they are.
- `tests/web/world-cast.test.js` draws the fly from the pack's cast beside the code's, both frames
  and what falls, at whole and fractional points, and runs the engine's frames every 20 ms for 4.6
  seconds while six flies fly in, hover, are swatted and fall, once with the cast from the pack and
  once from code, comparing every call of every frame. It holds the goblin from the pack to the
  code's: its measures, each pose's canvas call for call, painted once, and the engine's frames every
  20 ms through the whole event at the battlement and at the camp, the goblin's canvases written out
  call by call. It draws each monarch from the pack beside the code's, its still parts and its mouth
  shut and open, in every skin with every hair (as drawn among them) and the robe turning through
  every choice, and in every robe alone, 165 looks call for call; checks that the brows come out by
  contrast both ways; and that the court draws the patron `KW.cast` gives and keys its backdrop on
  where the patron comes from. It checks too where the cast is drawn from on a `dev` and a deployed
  page, a page without the compiler, that the engine plays the foe `KW.cast` gives with the exit it
  names, a member that fails to compile and one the engine does not know, and what the compiler
  refuses in the cast. `tests/web/scenes.test.js` draws the pack's fly and the goblin's six poses
  against the stored records of the code's, `cast.json`, and the court from the pack, with its
  monarchs from the pack's patrons, against `court.json`, all 522 of them; and
  `tests/web/world-scenes.test.js` runs the goblin checks of `foe.test.js` on the pack's goblin, the
  blade against the drawn pixels of its poses among them.
- `tests/web/world-props.test.js` draws every kind of device from the prop set beside the code's
  drawing of it, through the engine's `KW.devices`, in every place of every scene (the court's among
  them), up and gone, with and without its question mark, at seven moments, 13 720 drawings compared
  call for call; each kind's still and moving parts drawn alone in every place; and the moving parts
  every 25 ms through two of the up loop and three of the down one. It checks too where the devices
  are drawn from on a `dev` and a deployed page, a kind that fails to compile, a page started again
  from code, the pie's lamp's canvases painted once with the lit drawing over the dark one, and what
  the compiler refuses in a prop. `tests/web/scenes.test.js` draws the scenes from the pack with the
  devices from it too, against the records stored from code.
- The words and the overlay have no copy in code to hold equal: without them the page shows the
  collector's text, and `display.css` writes out the overlay's colours as its fallback.
  `tests/web/world-words.test.js` holds the two together, each property the overlay sets against
  the fallback `display.css` gives it, and checks that `display.css` writes no colour of the overlay
  but through them. It checks the joining rule (the first template with its values, the last part
  shortened, then dropped, the first cut at the limit with the ellipsis, 52 and 44 at their edges,
  code points and white space, a missing value or kind, no parts and no words), each caption and the
  quiet line from the medieval words, that `main.js` writes them with `textContent`, where the words
  and the overlay come from on a `dev` and a deployed page, one of them failing to compile, what
  `compileOverlay` refuses, and the demo's parts, texts and lines.
- The screenshots of the repository's own page, a `dev` page, draw every scene, device and member of
  the cast from the pack, and show the medieval words. To shoot the code path, take a pair of sets from a copy of `web/` whose `kw-version` is not
  `dev`, as for the knight ([page.md](./page.md#checks)).

**A change to the medieval art is made in both copies, in the same commit.** Change the code scene
(or the device or the cast member in `props.js`) and the pack together, write the carrier again with `node tools/pack-carrier.js`, store the records
again from the code if the scene is meant to look different (`SCENES_LOG=write`, see
[page.md](./page.md#checks)), and the pack's copy must then draw the new records. A pack edited after
it is signed needs a signing run again ([development.md](./development.md#signing-the-packs)).

`tests/web/world.test.js` checks the rest: that the pack reads clean with the costs above, where a
`dev` and a deployed page draw every scene from, the console lines and
the status, the long names, a compile that throws for one scene or for all, the predicates and the
key, the terms and the colours' spelling, `outdoors`, `foeZone` and `wallAt` from `hosts` and `foe`,
the keyframes' clock with a phase and played once, an ell's clip and a tile's picks, the target's
act with its blow, its wobble and its straw, the rests and their angles, the rest mark in a still
and a moving layer and the key it adds to, the anvil's act against the code smithy's every 10 ms
over nine seconds with its sparks and its hot tip, the `dx`, `dy`, wave and palette tracks, the
house's screen, its sleeper with the ice bag and the blanket's breath, the Zs at night, the pegs
from the blade and the stamp a rest names, a rest view held to its place, the pack library's rules
for `targetDx` and `spot`, and that what the compiler does not build is refused by name.
