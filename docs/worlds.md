# Worlds

A world is what the knight's surroundings are made of: the scenes, the supporting cast, the
drawings of the devices, the words and the overlay. Format 1.1 of the packs carries a world as
data ([packs.md](./packs.md#format-11) gives the format and its checks). This page describes what
the page draws from a world today: the scene compiler, `web/js/world.js`, and the medieval world's
pack, `kw.medieval`, which holds four scenes, the battlement, the camp, the yard and the cellar. Every other
scene, the cast, the devices, the words and the overlay are still drawn from code.

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
- two stamps, `sconce` and `barrel`: the props `sconceHD` and `barrelHD` of `props.js`, the barrel at
  the 84 by 72 the cellar and the yard draw it.

At the widest screen they assume, the checks find:

| Scene | Still layers | One frame of the moving and over layers |
|---|---|---|
| battlement | 342 shapes, 25 967 fills | 7 shapes, 185 fills, 1 glow |
| camp | 66 shapes, 56 668 fills | 7 shapes, 718 fills, 8 glows |
| yard | 298 shapes, 28 929 fills | 44 shapes, 2 086 fills, 1 glow |
| cellar | 440 shapes, 76 803 fills | 3 shapes, 120 fills, 1 glow |

against limits of 200 000 fills for the still layers, and 16 000 fills and 24 glows for a frame.
The shapes are counted with each tile's repeats and each stamp's shapes written out. The camp's
glows are the fire's light and the seven fireflies.

Version 0.1.0, which held the cellar alone, shipped signed with `kw1` by a signing run as the base
pack is ([development.md](./development.md#signing-the-packs)). Version 0.2.0 ships unsigned while
the other scenes are written as data, and is signed when they are all in: until then a deployed page
refuses it and draws every scene from code, and a `dev` page draws the battlement, the camp, the
yard and the cellar from it. A change to a signed pack takes the signature's validity with it in the same way.

## Where the scenes are drawn from

`main.js` calls `KW.world.start(KW.packText, allowUnsigned)` once at start-up, right after
`KW.knight.start`, with the same texts and the same rule: `allowUnsigned` is true only on a page
whose `kw-version` meta tag says `dev`. A `dev` page reads `kw.medieval` signed or not; a deployed
page reads it only when it carries a signature that verifies against a key in `KEYS`.

Each scene of `kw.medieval` whose id names a code scene (today the battlement, the camp, the yard
and the cellar) is compiled and takes that scene's place in `KW.scenes`. It is also put under its long name, `kw.medieval/cellar`,
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

Otherwise the line is `knightwatcher: the scenes battlement, camp, yard and cellar are drawn from the pack
kw.medieval 0.2.0, unsigned` (or `signed`), written with `console.info`; the others are
`console.warn`. The line lists the scenes drawn from the pack in the pack's order, so with the cellar
failing to compile it is `the scenes battlement, camp and yard are drawn ...`, after the cellar's own
line. Of two copies of `kw.medieval` the higher
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
| `spot`, `rounds`, `can` | the same fields |
| `places` | `things`, each place copied as it is |
| `sword: false` | `"weapon": "away"` |
| `helmet: false` | `"helmet": "off"` |
| `outdoors: true` | `hosts` naming both `flies` and `crate` |
| `foeZone` | `foe`: its `side` and `spans`, as `{ side, spans }` |
| `wallAt(x)` | `foe.wall`, below; only when it has one |
| `act(t, s)` | `target`: the training act, below; only when there is one |
| `paint(s)` | the still layers, into the cached backdrop; only when there are any |
| `draw(t, s)` | the moving layers |
| `over(t, s)` | the over layers; only when there are any, as a code scene without `over` has none |
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
moving or over layer `wave` (`amp * Math.sin(t / div + phase)`) and, in a scene with a target,
`targetDx` (the pixels the training act moves the target by, below). The first key gives the value and
each next one is added to it, so a term is written in the order the code adds: `{ "x": 1, "c": 178 }`
for `x + 178`, `{ "c": 0.09, "wave": [0.025, 150, 0] }` for `.09 + .025 * Math.sin(t / 150)`. That
is what makes the floating-point bits come out as the code's.

**Colours** resolve once, when the scene compiles: hex as written, `@base.<entry>` from the base
palette (a band list where the entry is one, such as `@base.steel3`), the pack's own palettes, and
band lists of these. A translucent colour is spelt as the scenes spell it, the alpha without its
leading zero: `{ "rgb": "#000000", "a": 0.3 }` is `rgba(0,0,0,.3)`. A canvas reads both spellings
alike, and this one keeps the call records equal. (The knight's lists, compiled by `pack.js`, spell
it `rgba(0,0,0,0.3)`; [page.md](./page.md#checks) says how its test allows for that.)

**Shapes.** A `rect` filled with one colour draws as `Rh` and with a band list as `Rv`; `ell`,
`rrect`, `poly`, `strip` and `glow` draw through the primitive of their name. `fx` draws the effect
of `KW.effects` it names, its scalars evaluated as terms and its colours resolved, with the scene's
time when it moves, and a triggered one, `burst`, with the time since the target was last struck.
`use` draws a stamp's shapes moved to its point. A `tile` draws its shapes at each `x` from
`Math.floor(from / step) * step + phase` while `x` is below `to`, as the scenes' loops run; each of
its picks gives `@pick.<name>` one of its colours at each `x`, `of[hsh(x, seed) % of.length]`. An
`ell` or an `rrect` with a `clip`, `[top, bottom]`, draws only its rows between the two ys, counted
from the same anchor as its point, `null` for no bound: the code's `ell(460, 360, 82, 66, c, null,
360)` is `"clip": [null, 360]`. The mark `things` is where the devices behind the knight are drawn, `KW.devices.draw(t, s)`.

**Layers and the key.** A layer is drawn when every predicate of its `when` holds:
`cond:<id>` when the winning condition is `id`, `tv`, `inBed`, `helmOff` and `strike` from the
frame, each after an optional `!`. `night` always holds and `day` never does, since the medieval
world is drawn at night and nothing yet decides between them. The backdrop's key is worked out
from what the still layers read: one character for each predicate their `when` names, in the order
first named, `1` where it holds. A scene writes no key of its own, so the key cannot miss something
the backdrop reads. The cellar's and the camp's still layers wait on nothing, so their keys are
always empty and each backdrop is painted once for each shape of the screen, as the code scenes' are.
The battlement's rope is painted only while the WAN is down, so its key is `1` then and `0`
otherwise, where the code scene's is `wan` and the empty string: the strings differ, and the states
they tell apart are the same.

**Groups and keyframes.** A moving or over layer may declare `groups`, a shape in it may name one
with `"g"`, and its `anim` drives them. What is built is what the battlement needs: a clock in
whole milliseconds (`"ms": true`), looping or played once, from its `phase`, with `show` tracks. A
group whose `show` is 0 is not drawn; a key holds from its time to the next key's, the first key's
value before it and the last's after it, as the step ease does in format 1.0. The clock is the
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

**What it does not build yet,** it refuses by name: the scene does not compile, the reason says
`<field>: <what> is not built in this engine yet`, and the scene is drawn from code. That covers
the shape kinds `dith` and `pix`, the marks other than `things` (`rest`, `patron`, `sleeper`,
`target`, `bubble`), `only` on a shape, `"g"` on an effect or a mark, of keyframes a clock in
seconds, a triggered clock (`trigger`), a wave track, a palette track and any channel but `show`, a
mixed colour, a pick inside a band list or an effect, an effect inside a stamp, a triggered effect
(`burst`) in a scene without a target and a burst of sparks on a target's blow, a scene that hosts
the flies without the crate or the crate without the flies, and the fields `rests`, `bed`, `screen`,
`seat`, `anvil` and `pole`. Each later scene adds the rows it needs to the compiler's tables: a shape kind to `SHAPES`, a mark to
`MARKS`, a part of the key beside the predicates.

## Writing a scene as data

The cellar, the camp and the battlement show how code becomes data:

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
  places, rounds, `can`, weapon and helmet, `outdoors` and `foeZone`, and the same parts drawn,
  `wallAt` among them.
- A scene with an act keeps what it did on one frame for the next, so `tests/web/world-scenes.test.js`
  also runs every scene of the pack that has a `target` frame by frame beside its code scene, every
  10 ms through two training rounds while all is quiet and while the CPU runs hot, and compares every
  call and every change to the knight's pose.
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
`dev` and a deployed page draw the battlement, the camp, the yard and the cellar from, the console lines and
the status, the long names, a compile that throws for one scene or for all, the predicates and the
key, the terms and the colours' spelling, `outdoors`, `foeZone` and `wallAt` from `hosts` and `foe`,
the keyframes' clock with a phase and played once, an ell's clip and a tile's picks, the target's
act with its blow, its wobble and its straw, the pack library's rules for `targetDx`, and that what
the compiler does not build is refused by name.
