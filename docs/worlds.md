# Worlds

A world is what the knight's surroundings are made of: the scenes, the supporting cast, the
drawings of the devices, the words and the overlay. Format 1.1 of the packs carries a world as
data ([packs.md](./packs.md#format-11) gives the format and its checks). This page describes what
the page draws from a world today: the scene compiler, `web/js/world.js`, and the medieval world's
pack, `kw.medieval`, which holds six scenes, the battlement, the camp, the yard, the cellar, the
smithy and the house. With the house, step W5 of the conversion is complete apart from the court,
which waits for the patron (step W7): the court, the cast, the devices, the words and the overlay
are still drawn from code.

## The medieval world's pack

`web/packs/medieval.pack.json` is the medieval world's pack: id `kw.medieval`, format `[1, 1]`,
version 0.2.0, licensed as the base pack is. Its carrier, `web/packs/medieval.pack.js`, is written by
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
- three stamps, `sconce`, `barrel` and `peg`: the props `sconceHD` and `barrelHD` of `props.js`, the
  barrel at the 84 by 72 the cellar and the yard draw it, and one of the house's pegs, counted from
  where the weapon's frame puts it;
- one palette entry, `house.screen`, the television's first colour, which the house's palette track
  changes every 400 ms.

At the widest screen they assume, the checks find:

| Scene | Still layers | One frame of the moving and over layers |
|---|---|---|
| battlement | 342 shapes, 25 967 fills | 7 shapes, 185 fills, 1 glow |
| camp | 66 shapes, 56 668 fills | 7 shapes, 718 fills, 8 glows |
| yard | 298 shapes, 28 929 fills | 44 shapes, 2 086 fills, 1 glow |
| cellar | 440 shapes, 76 803 fills | 3 shapes, 120 fills, 1 glow |
| smithy | 339 shapes, 15 212 fills | 9 shapes, 508 fills, 2 glows |
| house | 370 shapes, 71 245 fills | 46 shapes, 2 128 fills, 3 glows |

against limits of 200 000 fills for the still layers, and 16 000 fills and 24 glows for a frame.
The shapes are counted with each tile's repeats and each stamp's shapes written out. The camp's
glows are the fire's light and the seven fireflies, the smithy's the fire's light and the sparks',
and the house's the fire's, the television's and the candle's, counted together though the last
two never show at once: a frame is costed with every layer drawn. The gear at rest, the hot tip, the
sleeper and the Zs are the engine's drawing, as the devices are, and count toward no scene's cost;
the stamp a weapon's rest names counts twice, once for each peg.

Version 0.1.0, which held the cellar alone, shipped signed with `kw1` by a signing run as the base
pack is ([development.md](./development.md#signing-the-packs)). Version 0.2.0 ships unsigned until
its signing run: until then a deployed page refuses it and draws every scene from code, and a `dev` page draws every scene but the court from it. A change to a signed pack takes the signature's validity with it in the same way.

## Where the scenes are drawn from

`main.js` calls `KW.world.start(KW.packText, allowUnsigned)` once at start-up, right after
`KW.knight.start`, with the same texts and the same rule: `allowUnsigned` is true only on a page
whose `kw-version` meta tag says `dev`. A `dev` page reads `kw.medieval` signed or not; a deployed
page reads it only when it carries a signature that verifies against a key in `KEYS`.

Each scene of `kw.medieval` whose id names a code scene (today every scene but the court) is compiled and takes that scene's place in `KW.scenes`. It is also put under its long name, `kw.medieval/cellar`,
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

Otherwise the line is `knightwatcher: the scenes battlement, camp, yard, cellar, smithy and house are drawn
from the pack kw.medieval 0.2.0, unsigned` (or `signed`), written with `console.info`; the others
are `console.warn`. The line lists the scenes drawn from the pack in the pack's order, so with the
cellar failing to compile it is `the scenes battlement, camp, yard, smithy and house are drawn ...`, after
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

`start` puts the code scenes back before it reads, so a second call starts afresh. Not done yet:
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
| `status` | what the last `start` found, or `null` before it |
| `MEDIEVAL` | `'kw.medieval'` |

**Nothing in a pack runs.** A scene compiles into frozen records: each shape is a kind from the
compiler's own table, each mark one of its marks, each predicate one it evaluates, each effect a name
in `KW.effects`. The scene's `paint`, `draw`, `over` and `key` are functions of the compiler that
read those records. No function is made from data, and `tests/web/pack.test.js` checks that the
source holds neither `eval` nor `Function(`.

What a compiled scene gives, from the pack's fields ([page.md](./page.md#the-scene-interface)):

| Interface | From |
|---|---|
| `spot`, `can` | the same fields |
| `rounds` | the same field, but in a scene with an `anvil`, below |
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
band lists of these. A translucent colour is spelt as the scenes spell it, the alpha without its
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
`use` draws a stamp's shapes moved to its point. A `tile` draws its shapes at each `x` from
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

**What it does not build yet,** it refuses by name: the scene does not compile, the reason says
`<field>: <what> is not built in this engine yet`, and the scene is drawn from code. That covers
the shape kinds `dith` and `pix`, the marks `patron`, `target` and `bubble`, `only` on a shape, `"g"`
on an effect or a mark, of keyframes a clock in seconds, a triggered clock (`trigger`), any ease but
`step` and any channel but `show`, `dx` and `dy`, a colour a palette track drives inside a band
list, in an effect or through another entry, a mixed colour, a pick inside a band list or an
effect, an effect inside a stamp, a triggered effect (`burst`) in a scene without a target or an
anvil, a burst of sparks on a target's blow and of straw on the hammer's, a scene with both a target
and an anvil, a scene that hosts the flies without the crate or the crate without the flies, and the
fields `seat` and `pole`, which the court and its patron need. Each later scene adds the rows it
needs to the compiler's tables: a shape kind to `SHAPES`, a mark to `MARKS`, an act beside the
target's and the anvil's, a part of the key beside the predicates and the gear.

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
  also runs every scene of the pack that has a `target`, an `anvil`, a `bed` or a `screen` frame by
  frame beside its code scene, and compares every call (`over`'s among them), every change to the
  knight's pose and `strike`: the target's every 10 ms through two training rounds while all is quiet
  and while the CPU runs hot, the anvil's every 10 ms through five blows of the hammer, idle and while
  updating, at the spot and at x 300, and the house's every 10 ms for 8.4 seconds asleep at night,
  sick in bed, with the television on while streaming and with it off while all is quiet.
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
  on a scene on each scene the pack gives, compiled from it: the goblin's way in, where it stands, its
  hit and the blade against it in every scene that hosts a foe, and the places of the devices on the
  grid and clear of each other. It also holds the foe's whole plan in a scene from the pack, for
  every weapon and build, to the plan in the code scene, and each scene's `quiet` and `hosts` to the
  engine's and the settings' lists. The two older files draw the code scenes and stay as they are.
- The screenshots of the repository's own page, a `dev` page, draw the converted scenes from the
  pack. To shoot the code path, take a pair of sets from a copy of `web/` whose `kw-version` is not
  `dev`, as for the knight ([page.md](./page.md#checks)).

**A change to the medieval art is made in both copies, in the same commit.** Change the code scene
and the pack together, write the carrier again with `node tools/pack-carrier.js`, store the records
again from the code if the scene is meant to look different (`SCENES_LOG=write`, see
[page.md](./page.md#checks)), and the pack's copy must then draw the new records. A pack edited after
it is signed needs a signing run again ([development.md](./development.md#signing-the-packs)).

`tests/web/world.test.js` checks the rest: that the pack reads clean with the costs above, where a
`dev` and a deployed page draw every scene but the court from, the console lines and
the status, the long names, a compile that throws for one scene or for all, the predicates and the
key, the terms and the colours' spelling, `outdoors`, `foeZone` and `wallAt` from `hosts` and `foe`,
the keyframes' clock with a phase and played once, an ell's clip and a tile's picks, the target's
act with its blow, its wobble and its straw, the rests and their angles, the rest mark in a still
and a moving layer and the key it adds to, the anvil's act against the code smithy's every 10 ms
over nine seconds with its sparks and its hot tip, the `dx`, `dy`, wave and palette tracks, the
house's screen, its sleeper with the ice bag and the blanket's breath, the Zs at night, the pegs
from the blade and the stamp a rest names, a rest view held to its place, the pack library's rules
for `targetDx` and `spot`, that the court stays the code scene, and that what the compiler does not
build is refused by name.
