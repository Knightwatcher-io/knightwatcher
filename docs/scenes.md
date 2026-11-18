# Scenes as data

For anyone making a world pack: a scene of format 1.1 as data. It gives the shapes, coordinates
and terms the world sections share, the fields of a scene, how the page compiles a scene and acts
it out, and how the medieval world's scenes were written from their code. The sections of format
1.1, its costs and limits, and the presets that name scenes are in [worlds.md](./worlds.md); the
cast and the devices a scene shows are in [cast.md](./cast.md); the engine's side of the scene
interface, for contributors, is in [page.md](./page.md#the-scene-interface).

## Shapes, coordinates and terms

The shapes of the new sections are the six kinds of 1.0 and four more, with two more kinds in the
layers of a scene:

| `k` | Fields | Where |
|---|---|---|
| `rect`, `ell`, `rrect`, `poly`, `strip`, `pix` | as in 1.0 | everywhere |
| `glow` | `p`, `r` (1 to 512), `colour` (hex or a single reference), `a` (an alpha, 0 to 1) | everywhere |
| `dith` | `p`, `w`, `h`, `colour` | everywhere |
| `fx` | `fx`, an effect of the engine's, and its own fields | everywhere |
| `use` | `stamp`, `p` | everywhere |
| `tile` | `step` (4 to 960), `phase` (-960 to 960), `from`, `to`, optional `pick`, `shapes` (1 to 32) | a layer of a scene, never inside a tile |
| marks | see the marks under [The fields of a scene](#the-fields-of-a-scene) | a layer of a scene, never inside a tile |

A tile's `pick` holds 1 to 8 picks, each named as a palette entry is and each `{ seed, of }`: `seed`
from 0 to 999 and `of` 2 to 16 hex colours. A shape in the tile names a pick as `@pick.<name>` and
takes one of its colours at each repeat. A `dith`'s colour is a hex colour or a single reference,
never translucent, a mix, a contrast or a band list.

- Points are pairs only, and a `poly`'s `dir` is `rows` or `cols`: there is no weapon frame here.
- In a scene's layers, offsets run from -2048 to 2048 and lengths from 0 to 4096, since a backdrop
  fills out to the screen's edges. In stamps, the cast, props and a scene's `pole`, offsets and
  lengths keep 1.0's ranges, -512 to 512 and 0 to 512. Radii and half-widths keep 1.0's everywhere.
  Each is checked at both ends at `rules`, as in 1.0.
- `g` may name a group in a moving or over layer and in a critter's frames; `only` (`[seed, mod]`)
  only inside a tile; `at` only in the patron, naming one of its anchors.
- A colour may also be a mix, `{ "mix": [colour, colour], "k": 0.3 }`: each channel of the first
  moved towards the second's by `k`, from 0 to 1. The two are hex colours or single references.
- Or a contrast, `{ "contrast": [colour, colour], "on": colour, "band": 1 }`: whichever of the two
  stands out more from `on` by the WCAG contrast ratio, the second on a tie. Each of the two is a hex
  colour, a single reference or a mix, never another contrast; `on` is a hex colour or a reference,
  and `band`, a whole number from 0 to 7, picks one band of `on` where `on` names a band list. `band`
  is required when `on` is a band list and refused when it is a single colour. A contrast goes
  wherever a mix may, and nests no deeper than a mix inside it. The medieval world's monarchs choose
  a readable brow with it ([cast.md](./cast.md#the-cast-on-the-page)).
- `@pick.<name>` names a pick of the tile around the shape, and `@lamp.down`, `@lamp.downLo` and
  `@lamp.downHi` name the engine's down lamp: its red, the red at two thirds and its highlight,
  which the engine spells `rgb(255,74,61)`, `rgb(168,49,40)` and `#ffd0c8`. All are single colours,
  and `@lamp` may be named only in a stamp.
- A pix shape may give `"runs": true`, and its rows in runs: each character after an optional count
  of how many times it repeats, so `"12a3b.c"` is twelve `a`, three `b`, one `.` and one `c`, and a
  row with no count is a plain row. A count is 1 or more, in digits with no leading zero, and is
  followed by a key or `.`; the shape's key may map no digit, since a digit is a count. Each row is
  checked as it expands, as a plain row is: every row expands to the same length, of 1 to 64, a
  count of 0, a count with a leading zero and a count with nothing after it are refused, and every
  character must be in `key`. The rows are expanded once, at `fields`, so every later step, the
  costs and the pixel count among them, and every drawing see plain rows, and the read keeps the
  shape without `runs`. `runs: false` reads the rows as plain rows. A shape of 1.0, in an item, a
  rest view or a decoration, takes no `runs`. The mouser cat's stamps are written so
  ([cast.md](./cast.md#the-cast-on-the-page)).
- A pix shape's rows count toward the pack's 160 000 pixels with every other pix shape, counted as
  they expand.

**Terms.** A scalar of a scene may lean on the screen's edges, the scene values below, and inside a
tile on its x. Two more term forms are allowed: `"h": [seed, mod]` adds the engine's hash of the
tile's x modulo `mod` (seed 0 to 999, mod 2 to 960), and `"wave": [amp, div, phase]` adds
`amp * sin(t / div + phase)`, with `amp` from -512 to 512, `div` from 1 to 100 000 ms and `phase`
from -100 to 100. Coordinates stay multiples of 1/8, and so do the coefficients of named values,
but those of the values an act gives, `targetDx` and `spot`, which may have three decimals (from -8
to 8), as `713 + targetDx * 0.8` needs; an alpha may have three decimals and takes only `c` and
`wave`.

| Name | Is | Range the checks assume | Allowed |
|---|---|---|---|
| `L`, `R`, `T`, `W` | the canvas's left, right and top edges on the grid, and its width | -976 to -16, 976 to 1936, -602 to -2, 992 to 2912 | any layer of a scene |
| `x` | the tile's x | from its `from` at the least, less a `step`, plus its `phase`, to its `to` at the most | inside a tile |
| `h` | a hash of the tile's x | 0 to `mod` - 1 | inside a tile |
| `wave` | a sine of the scene's time | `-amp` to `amp` | a moving or over layer |
| `targetDx` | the pixels the training act moves the target's group by, while it wobbles after a blow | -15 to 15 | a moving or over layer of a scene with a `target` |
| `spot` | the x in pixels of the spot the watcher works the anvil from, which the anvil's places count from | 150 to 810 (a `spot` of 30 to 162, times 5) | a moving or over layer of a scene with an `anvil` |

Nothing else may lean on a named value: stamps, the cast and props are drawn at fixed sizes. The
rig's named values (`drop`, `dShoulder` and the rest) are refused in every 1.1 section.

**Effects.** `fx` is one of `sky`, `stars`, `ridge`, `bricks`, `pines`, `tree`, `arch`, `shelf`,
`stacks`, `tufts`, `pebbles`, `planks`, `rafters`, `horseshoe`, `hood`, `flame`, `candle`, `twinkle`, `drift`, `wander`, `coals`, `steam`, `flutes`, `crust`, `fingers`, `fringe`, `flicker` and `burst`, and the other
fields of an `fx` shape are the fields of that effect's table in `effects.js`
([page.md](./page.md#the-effects) lists them): a field the table lacks is refused, one without a
default is required, and each holds a value of its kind in its range. A point, an offset or a length
takes the ranges of any shape where it stands, and with them the screen's edges, the tile's x, its
hash and a wave where those are allowed; a term (a seed, a flame's `dt`) its own range. Each is
checked at both ends at `rules`, and its colours and named values at `references`, like any other.
The rest are plain: numbers and whole numbers in their ranges, pairs of them, lists of colours or
of whole numbers, and `one` of a few words or numbers, which are never read as colours. No field can
hold other text, so no path, address or file can reach an effect. `g` and `only` are taken as on
any shape.

`pack.js` reads the tables from `KW.effects`, which the page loads before it. Under Node it asks
for `effects.js` beside itself the first time a pack names an effect, so a pack of format 1.0, or of
1.1 without effects, reads without it; a pack naming an effect where the library cannot be had is
refused at `fields` (`...fx: cannot be checked: the engine's effects library (effects.js) is not
loaded`).

## The fields of a scene

| Field | Rule |
|---|---|
| `name` | 1 to 32 characters |
| `spot` | where the watcher stands, in units of 5 pixels, a whole number from 30 to 162 |
| `rounds` | 1 to 6 `{ x, act, dur }`: `x` as `spot`, `act` one of `guard`, `look`, `sniff`, `yawn`, `train`, `dur` 2 to 120 seconds, whole |
| `quiet` | `true` or `false` |
| `can` | condition ids of the contract, each once |
| `hosts` | each of `flies`, `crate`, `feast`, `foe` at most once |
| `helmet` | `on` or `off` |
| `weapon` | `held` or `away` |
| `still`, `moving`, `over` | arrays of layers |
| `things` | the seven places for devices |
| `rests`, `decor` | optional: places for gear at rest and for decorations |
| `bed`, `screen`, `seat`, `anvil`, `target` | optional: the parts an act needs |
| `foe` | optional: where a foe may stand |
| `pole` | optional: 1 to 16 shapes |
| `sound`, `companion` | reserved: an object or absent, never read |

All but the optional ones are required. The condition ids are `attack`, `wan_down`,
`container_unhealthy`, `disk_full`, `backup_overdue`, `pi_silent`, `device_down`, `cpu_hot`,
`memory_tight`, `ssh_session`, `updating`, `streaming` and `night`.

**Layers.** `{ when, groups, anim, shapes }`, only `shapes` required: 1 to 2000 shapes in a still
layer, 1 to 400 in a moving or over one. A still layer takes `when` and `shapes` alone. `when` holds
1 to 8 predicates, each named once whether or not it carries a `!`, so `tv` and `!tv` cannot share a
layer: `cond:<condition>`, `tv`, `inBed`, `helmOff`, `strike`, and the
reserved `day` and `night`, each after an optional `!`. `tv` needs the scene's `screen`, `inBed` its
`bed` and `strike` its `anvil`. `groups` is as a decoration's, pivots within 2048, and a group's name
is declared in one layer of a scene only. The compiler uses a group to say which shapes a track
moves, and does not read its pivot.

`anim` is 1.0's keyframes with three additions. `"ms": true` gives the period in whole milliseconds,
200 to 600 000, and each key's time as a whole number of milliseconds from 0 to the period. Such a
clock runs in milliseconds too: the scene's time modulo the period, compared with the keys' times as
they are written, so that a key falls where the code's whole-millisecond steps fall ([How a scene
compiles](#how-a-scene-compiles)). `"trigger"` is `hit` (needs a `target`) or `strike` (needs an
`anvil`), and a triggered clock does not loop. A track may be a wave, `{ g, ch, wave, round }`,
driving `dx` or `dy` only, with no keys or ease; `round`, a boolean and optional, rounds the move to
whole pixels. No two tracks of a layer drive one thing.

**Marks** tell the engine where in the scene's order to draw something of its own:

| Mark | Fields | Needs | Layer |
|---|---|---|---|
| `things` | | | moving or over, exactly once in the scene |
| `rest` | `slot` (`helmet`, `main`, `off`), `at` (a rest) | the rest; `main` a frame, the others a place | any |
| `patron` | | `seat` | any |
| `bubble` | | `seat` | moving or over |
| `sleeper` | | `bed` | moving or over |
| `target` | | `target` | moving or over |

**Places.** `things` holds exactly `pie`, `h1` to `h3` and `g1` to `g3`, each `{ cls, kind, x, y,
w, h }` with optional `front`, `flip` (booleans) and `pole` (0 to 600). `cls` is the place's class,
`pie` for the pie, `high` for `h1` to `h3` and `ground` for `g1` to `g3`; `kind` is `hang`,
`surface` or `floor`; `x` and `y` are whole numbers on the grid; a ground place is 132 by 112, and
the pie's place and a high place 88 by 112. At `rules` each place's class box, mirrored by `flip`,
must lie on the 960 by 600 grid, no two may overlap (touching is allowed), a high place's base must
be at y 300 or lower and a ground place's from 500 to 598. The class boxes, from the base, measured
on the medieval world's drawings (the ground class on the scrying crystal and the chest, its two
largest):

| Class | x | y |
|---|---|---|
| `pie` | -46 to 45 | -107 to 33 |
| `high` | -34 to 32 | -64 to 0 |
| `ground` | -66 to 56 | -93 to 2 |

`rests` holds up to 8: a place `{ kind, x, y, w, h }` (`w` and `h` 1 to 240) for a rest view, or a
frame `{ x, y, a }` for the weapon, `a` being `upright`, `flat` or a number of radians from -3.142 to
3.142. A frame may name a `stamp` of the pack, the scene's own pegs or rack, which the engine draws
under the weapon twice, where the weapon's blade puts them ([How a scene compiles](#how-a-scene-compiles)).
Either may count its x from the watcher's spot with `"from": "spot"`; `x` is a whole number from
-960 to 960 and `y` from 0 to 600. `decor` holds up to 16 places `{ kind, x, y, w, h }`: `kind` is
`hang`, `surface` or `floor`, `x` from 0 to 960, `y` from 0 to 600, `w` and `h` from 1 to 240.

**The act parts.** `bed` is `{ head, blanket, zeds }`, `blanket` a group of a layer; `screen`
`{ group, glow: [x, y, r] }`; `seat` `{ x, y, bubble, turn, mouth }`, `turn` and `mouth` in ms;
`anvil` `{ rest, spark }`, `rest` a rest of the scene. A screen's `glow` and an anvil's `spark` are
optional, reserved and not read: the television's light and the hammer's sparks are the scene's own
`glow` and `burst`; `target` `{ group, hitAt, every }`, `hitAt` before `every`. Their numbers:
`bed`'s `head` and `zeds` and the anvil's `spark` are points within 2048 either way; the screen's
`glow` is `[x, y, r]`, `x` and `y` within 2048 and `r` from 1 to 512; the seat's `x` is a whole
number from 0 to 960 and its `y` from 0 to 600, its `bubble` a point within 2048, and `turn` and
`mouth` whole numbers of ms from 1 to 600 000; the target's `hitAt` is a whole number of ms from 0
to 600 000 and its `every` from 1 to 600 000. `foe` is `{ side, spans, wall }`: `side` 1 or -1, 1 to
4 spans `[from, to]` on the grid, whole numbers from 0 to 960 with `from` below `to`, and an
optional `wall` `{ period, offset, high: [width, y], low }`: `period` from 2 to 960, `offset` from
-960 to 960, `width` from 1 to 960 and less than the period, `y` and `low` from 0 to 600. `crate` is
`{ span: [from, to] }`, the stretch of floor an import's crate may land on: whole numbers with
`0 <= from`, `to <= 960` and `to - from >= 60`, the crate's width. The engine lands the crate's
middle at `clamp(kx - 160, from + 30, to - 30)`, `kx` the watcher's x, so as near 160 left of the
watcher as the stretch allows. At `rules` the span must lie clear of the class boxes of the pie's
place and the ground places (touching is allowed). A target has no `aim` field in any format: a shot
aims at the middle of the target group's box (The target's act, below).

**What a scene can act.** At `rules` a scene that lists a condition in `can` must meet its needs:

| Condition | The scene must give |
|---|---|
| `attack` | `weapon` `held` |
| `wan_down` | a layer whose `when` names `cond:wan_down` |
| `container_unhealthy`, `night` | `bed` |
| `disk_full` | rounds at two different spots |
| `pi_silent` | the pie's place right of the spot (`x` greater than `spot` times 5) |
| `device_down`, `memory_tight` | `quiet` `true` |
| `ssh_session` | `seat` |
| `updating` | `anvil`, whose rest is a frame for the weapon |
| `streaming` | `screen` |
| `backup_overdue`, `cpu_hot` | nothing |

A scene that hosts `foe` needs a `foe` zone, and one that hosts `crate` needs a `crate` span.

## The effects

An `fx` shape draws one of the engine's effects: a drawing `web/js/effects.js` owns, which no fixed
list of shapes can say (stars at hashed points, pines whose tiers depend on a hashed height, a
flame whose points move by two sines, anything filled out to the screen's real edges), named with
its fields. A field with a default may be left out. A point is a pair of scalars, an offset and a
length are scalars in the ranges of [Shapes, coordinates and terms](#shapes-coordinates-and-terms),
and a scalar may be a term over the screen's edges, the tile's x, its hash or a wave; every other
field is a plain number or a list. The library refuses a field out of its effect's table, a field
of the wrong kind or out of its range, and a required field left out, at `fields`, and costs each
effect with its own cost function at the ends of the scene's ranges, at `counts`. An effect
cannot be added by a pack: a world that needs one the engine lacks waits for the engine to ship it.

The last four rows, `flash`, `bolt`, `tracer` and `beam` (format 1.2), are not `fx` shapes: the
engine draws them for a weapon or a foe that fires, in its shot's `colour` and `flash`, and a scene
does not name them. Their timings are `SHOT` in `engine.js`. Where a shot lands the engine draws
its burst, the cartoon burst of a blade's blow (`poofHD`), for as long as the act asks. A frame
draws at most 8 shots, the first made first, each with its flash and burst. The acts that fire
(the swat, practice at a target and the foe's event) make them only when the look's weapon fires,
as the base pack's crossbow does, and a foe that fires makes its own in its event, which no foe of
the shipped packs does ([page.md](./page.md#the-acts-with-a-weapon-that-fires)).

| Effect | Fields (default) | Cost, at most | Drawn by |
|---|---|---|---|
| `sky` | `p`, `w`, `h`, `of` (1 to 8) | one fill a band, the dither between bands, one fill below | battlement, camp, yard |
| `stars` | `p`, `w`, `h`, `n` (190), `seed` (1), `of` (three colours) | 3 a star | battlement, camp, yard |
| `ridge` | `p`, `w`, `amp`, `step`, `seed` (0), `colour` | one fill a pixel of `w` | battlement |
| `bricks` | `p`, `w`, `h`, `size`, `of` (1 to 16), `mortar`, `seed` (0), `lit` (0.06) | 3 a block, one more than fit in a course, and the mortar | battlement (`lit` 0.07), house, yard, cellar, smithy, court, and `bricksHD` |
| `pines` | `p`, `w`, `step` (120), `phase` (0), `off` ([40, 50]), `tall` ([240, 130]), `seed` (5), `colour` | each pine's tiers at its tallest, times the pines across `w` | camp, two rows |
| `tree` | `p`, `bark`, `leaves`, `light` (the camp's) | its trunk, streaks, roots and twelve leaves at their largest | camp |
| `arch` | `p`, `rx`, `ry`, `n` (11), `of`, `outline` (K), `step` (0), `phase` (0), `past` (0) | two strips a stone, for each arch: one, or with a `step` as many as fit from a step before the left edge to `past` beyond the right | cellar: one arch at a time from code, the row from the medieval world's pack |
| `shelf` | `y`, `seed` (1) | a cheese's 92 in every slot of 38 across the screen | cellar |
| `stacks` | `p`, `dir`, `step` (70), `heights` ([]), `seed` (0), `more` ([3, 5]), `past` (0) | the crate's 150 for each crate of the tallest column, times the columns to the edge | cellar, both sides |
| `tufts` | `y`, `step` (41), `spread` (30), `seed` (9), `tall` ([8, 10]), `gap` (5), `lean` (1.6), `colour`, `light`, `bare` ([0, 0]) | three blades at their tallest, for each tuft across the screen | camp, yard |
| `pebbles` | `y`, `step` (23), `spread` (17), `seed` (3, with the next three), `drop` ([10, 56]), `size` ([3, 3]), `ry` (2), `of` (1 to 8, the yard's two browns), `light` | an ell of `ry` and one fill a pebble, one pebble a step across the screen | the yard as data; `yard.js` keeps its own loop, and the call records hold the two equal |
| `horseshoe` | `p`, `r` ([18, 22]), `of` (three colours: the outline, the iron and the shine) | each of its three strokes: a strip a segment and an ell a point | the smithy as data, its two horseshoes; `smithy.js` keeps its own loop |
| `hood` | `p`, `w`, `neck`, `foot`, `flare`, `colour` (K) | one fill a row from its highest point to its lowest | the smithy as data, its forge's hood; `smithy.js` keeps its own polygon |
| `planks` | `y`, `h`, `step` (36), `seed` (3), `of` (1 to 8, the house's four browns), `lit` (0.04), `grain` (0.28), `knots` (two colours) | for each plank across the screen, the plank, its light, three streaks and a knot | the house as data; `house.js` keeps its own loop |
| `rafters` | `y`, `top`, `step` (120), `lean` (90), `past` (120), `hw` ([7, 5]), `of` (two colours) | two strips a rafter, from a step before the left edge to `past` beyond the right | the house as data; `house.js` keeps its own loop |
| `flame` | `p`, `size` (1), `dt` (0) | three tongues, each an ell and a triangle at their largest | every scene |
| `candle` | `p`, `sway` ([190, 1.5]), `of` (two colours) | two ells and a triangle | the house as data, the candle's flame; `house.js` keeps its own drawing |
| `twinkle` | `p`, `w`, `h`, `n` (14), `seed` (41), `ms` (1100), `gap` (0.7), `cycle` (6), `lit` (0.9), `size` (3), `colour` | 1 a point | battlement |
| `drift` | `p`, `n` (4), `gap` (6), `period` (2300), `sway` ([5, 14]), `rise` (130), `size` (3), `colour` | 1 a particle | camp, the embers |
| `wander` | `p`, `w`, `h`, `n` (7), `seed` (31), `ms` (900), `gap` (1.3), `cycle` (4), `lit` (1.4), `sway`, `bob`, `glow` ([9, 0.18]), `size` (3), `colour` | a glow and a fill a light, one glow each | camp, the fireflies |
| `coals` | `p`, `n` (9), `gap` (14), `seed` (61), `ms` (170), `part` (`bed` or `sparks`), `of` | an ell of 15 rows a coal, or 1 a spark | smithy, the bed and the sparks over its flames |
| `steam` | `p`, `n` (3), `gap` (14), `period` (1800), `sway` ([7, 5]), `rise` (46), `r` ([4, 7]), `a` (0.8), `colour` | an ell a puff | the pie, while up |
| `flutes` | `p`, `n` (6), `top` (5.3), `bottom` (4.5), `h` (18), `hw` (0.6), `of` (1 to 33, one a groove from the left) | a strip a groove | the pie's dish, up and down: the grooves stand at fractions of a pixel a pack's eighths cannot give |
| `crust` | `p`, `rim` ([38, 9]), `dome` ([32, 21]), `crimp` (35), `crust` (four colours), `filling` (three), `colour` (K) | a fill a pixel of its top, painted in one pass, and three a crimp | the pie's top, while up: 83 pixels across, wider than a pix shape may be |
| `flicker` | `p`, `r`, `colour`, `a`, `amp`, `div`, `ph` (0) | a glow | the court as data, each torch's light: a glow's alpha in a pack takes a wave of a fixed phase alone, and the court's torches each flicker from their pillar's x; `court.js` keeps its own loop |
| `fringe` | `p`, `colour` | a fill a row, 25 rows | monarch C's fringe in the medieval world's cast: its lower edge turns in, so no convex polygon fills its rows alike; `court.js` keeps its own polygon |
| `fingers` | `p`, `a` (the angle, 0 up), `reach` (9), `spread` (0.65), `r`, `colour` | an ell a finger | the goblin's hands in the medieval world's cast: the fingers stand at fractions of a pixel a pack's eighths cannot give; `props.js` keeps its own loop |
| `burst` | `p`, `n` (7), `piece` (`spark` or `straw`), `of` | sparks: a glow and 4 a spark; straw: a strip a piece | smithy (sparks), yard (straw) |
| `flash` | the shot's `flash`, or the pale snap `#eef3f9` when it gives none | a star (`starHD`): four polygons and a fill | the engine, at the muzzle for 60 ms after each shot leaves |
| `bolt` | the shot's `colour`, its head in the `flash` colour | three strips | the engine: a streak 26 long, outlined, flying at 1.6 pixels a ms from the muzzle to where it lands |
| `tracer` | the shot's `colour` | two strips | the engine: an outlined line from the muzzle to where it lands, drawn at once and fading over 120 ms |
| `beam` | the shot's `colour` | three strips | the engine: an outlined line from the muzzle to where it lands, with a white core, drawn at once for 80 ms |

The fields' ranges, and the defaults the table above leaves out:

| Effect | Fields |
|---|---|
| `sky` | `p` a point; `w` a length; `h` a length; `of` 1 to 8 colours |
| `stars` | `p` a point; `w` a length of 1 or more; `h` a length; `n` whole, 1 to 400 (190); `seed` whole, 0 to 997 (1); `of` 3 colours (`#7f879d`, `#d7deee`, `#ffffff`) |
| `ridge` | `p` a point; `w` a length; `amp` whole, 1 to 512; `step` whole, 1 to 960; `seed` whole, 0 to 999 (0); `colour` a colour |
| `bricks` | `p` a point; `w` a length; `h` a length; `size` [4 to 512, 4 to 512]; `of` 1 to 16 colours; `mortar` a colour; `seed` a scalar, -8192 to 8192 (0); `lit` 0 to 1 (0.06) |
| `pines` | `p` a point; `w` a length; `step` whole, 8 to 960 (120); `phase` whole, -960 to 960 (0); `off` [-480 to 480, 1 to 480], whole (40, 50); `tall` [8 to 600, 1 to 600], whole (240, 130); `seed` whole, 0 to 998 (5); `colour` a colour (`#07180f`) |
| `tree` | `p` a point; `bark` 4 colours (`#b98045`, `#96622f`, `#70461f`, `#4c2e12`); `leaves` 3 colours (`#143a20`, `#1c4426`, `#245a30`); `light` a colour (`#2f6b3a`) |
| `arch` | `p` a point; `rx` 1 to 512; `ry` 1 to 512; `n` whole, 1 to 32 (11); `of` 1 to 8 colours; `outline` a colour (`#1a1524`); `step` whole, 0 to 960 (0); `phase` whole, -960 to 960 (0); `past` whole, 0 to 960 (0) |
| `shelf` | `y` an offset; `seed` whole, 0 to 999 (1) |
| `stacks` | `p` a point; `dir` one of -1, 1; `step` whole, 8 to 960 (70); `heights` 0 to 16 whole numbers, each 0 to 16 (none); `seed` whole, 0 to 999 (0); `more` [0 to 16, 1 to 16], whole (3, 5); `past` whole, 0 to 960 (0) |
| `tufts` | `y` an offset; `step` whole, 8 to 960 (41); `spread` whole, 1 to 960 (30); `seed` whole, 0 to 998 (9); `tall` [1 to 128, 1 to 128], whole (8, 10); `gap` 0 to 32 (5); `lean` 0 to 4 (1.6); `colour` a colour (`#2f6b3a`); `light` a colour (`#4f9a45`); `bare` [-2048 to 2048, -2048 to 2048] (0, 0) |
| `pebbles` | `y` an offset; `step` whole, 8 to 960 (23); `spread` whole, 1 to 960 (17); `seed` whole, 0 to 996 (3); `drop` [0 to 600, 1 to 600], whole (10, 56); `size` [1 to 64, 1 to 64], whole (3, 3); `ry` whole, 1 to 64 (2); `of` 1 to 8 colours (`#2e2619`, `#3a3020`); `light` a colour (`#4f4330`) |
| `planks` | `y` an offset; `h` a length; `step` whole, 8 to 960 (36); `seed` whole, 0 to 999 (3); `of` 1 to 8 colours (`#2a1d14`, `#2d1f15`, `#261a11`, `#301f14`); `lit` 0 to 1 (0.04); `grain` 0 to 1 (0.28); `knots` 2 colours (`#1a110b`, `#3a2716`) |
| `rafters` | `y` an offset; `top` an offset; `step` whole, 8 to 960 (120); `lean` -512 to 512 (90); `past` whole, 0 to 960 (120); `hw` [0 to 64, 0 to 64] (7, 5); `of` 2 colours (`#0b0705`, `#24180f`) |
| `horseshoe` | `p` a point; `r` [1 to 64, 1 to 64] (18, 22); `of` 3 colours (`#1a1524`, `#7d899b`, `#aab6c6`) |
| `hood` | `p` a point; `w` a length; `neck` an offset; `foot` an offset; `flare` 0 to 512; `colour` a colour (`#1a1524`) |
| `flame` | `p` a point; `size` 0.05 to 8 (1); `dt` a scalar, -60000 to 60000 (0) |
| `candle` | `p` a point; `sway` [1 to 60000, 0 to 64] (190, 1.5); `of` 2 colours (`#ffb000`, `#fff3a0`) |
| `twinkle` | `p` a point; `w` a length of 1 or more; `h` a length of 1 or more; `n` whole, 1 to 64 (14); `seed` whole, 0 to 998 (41); `ms` whole, 1 to 60000 (1100); `gap` 0 to 64 (0.7); `cycle` 0.1 to 64 (6); `lit` 0 to 64 (0.9); `size` whole, 1 to 16 (3); `colour` a colour (`#ffffff`) |
| `drift` | `p` a point; `n` whole, 1 to 64 (4); `gap` -64 to 64 (6); `period` whole, 100 to 600000 (2300); `sway` [0 to 64, 0 to 256] (5, 14); `rise` -1024 to 1024 (130); `size` whole, 1 to 16 (3); `colour` a colour (`#ffb000`) |
| `wander` | `p` a point; `w` a length of 1 or more; `h` a length of 1 or more; `n` whole, 1 to 16 (7); `seed` whole, 0 to 998 (31); `ms` whole, 1 to 60000 (900); `gap` 0 to 64 (1.3); `cycle` 0.1 to 64 (4); `lit` 0 to 64 (1.4); `sway` [1 to 100000, 0 to 256] (3100, 40); `bob` [1 to 100000, 0 to 256] (2700, 24); `glow` [1 to 64, 0 to 1] (9, 0.18); `size` whole, 1 to 16 (3); `colour` a colour (`#fff3a0`) |
| `coals` | `p` a point; `n` whole, 1 to 32 (9); `gap` 0 to 64 (14); `seed` whole, 0 to 998 (61); `ms` whole, 1 to 60000 (170); `part` one of `bed`, `sparks` (`bed`); `of` 2 colours (`#cc352c`, `#ff8676`) |
| `steam` | `p` a point; `n` whole, 1 to 16 (3); `gap` -64 to 64 (14); `period` whole, 100 to 600000 (1800); `sway` [0 to 64, 0 to 64] (7, 5); `rise` -256 to 256 (46); `r` [1 to 64, 1 to 64] (4, 7); `a` 0 to 1 (0.8); `colour` a colour (`#ffffff`) |
| `flutes` | `p` a point; `n` whole, 0 to 16 (6); `top` -64 to 64 (5.3); `bottom` -64 to 64 (4.5); `h` 1 to 256 (18); `hw` 0 to 8 (0.6); `of` 1 to 33 colours |
| `crust` | `p` a point; `rim` [4 to 64, 1 to 32], whole (38, 9); `dome` [1 to 64, 1 to 64], whole (32, 21); `crimp` whole, 0 to 64 (35); `crust` 4 colours (`#ffd98a`, `#f2ac4e`, `#cc7f32`, `#93521d`); `filling` 3 colours (`#d2325f`, `#9a1640`, `#5c0a24`); `colour` a colour (`#1a1524`) |
| `fingers` | `p` a point; `a` -4 to 4; `reach` 0 to 64 (9); `spread` 0 to 4 (0.65); `r` 0 to 32; `colour` a colour |
| `fringe` | `p` a point; `colour` a colour |
| `flicker` | `p` a point; `r` 1 to 512; `colour` a colour; `a` 0 to 1; `amp` 0 to 1; `div` 1 to 100000; `ph` a scalar, -8192 to 8192 (0) |
| `burst` | `p` a point; `n` whole, 1 to 16 (7); `piece` one of `spark`, `straw` (`spark`); `of` 2 colours (`#ffb000`, `#fff3a0`) |

## How a scene compiles


**Nothing in a pack runs.** A scene compiles into frozen records: each shape is a kind from the
compiler's own table, each mark one of its marks, each predicate one it evaluates, each effect a name
in `KW.effects`. The scene's `paint`, `draw`, `over` and `key` are functions of the compiler that
read those records. No function is made from data, and `tests/web/pack.test.js` checks that the
source holds neither `eval` nor `Function(`.

What a compiled scene gives, from the pack's fields ([page.md](./page.md#the-scene-interface)):

| Interface | From |
|---|---|
| `spot`, `can`, `hosts` | the same fields |
| `rounds` | the same field, but in a scene with an `anvil` or a `seat`, below |
| `places` | `things`, each place copied as it is |
| `rests` | `rests`, below; only when there are any |
| `sword: false` | `"weapon": "away"` |
| `helmet: false` | `"helmet": "off"` |
| `outdoors: true` | `hosts` naming both `flies` and `crate` |
| `foeZone` | `foe`: its `side` and `spans`, as `{ side, spans }` |
| `crate` | `crate`: its `span`, as `{ span }` |
| `wallAt(x)` | `foe.wall`, below; only when it has one |
| `act(t, s)` | `target`, the training act, or `anvil`, the anvil's act, both below; only when there is one |
| `bed: true` | `bed`, below |
| `paint(s)` | the still layers, into the cached backdrop; only when there are any |
| `draw(t, s)` | the moving layers |
| `over(t, s)` | the over layers, and the sleeper's Zs in a scene with a `bed`; only when there are either, as a code scene without `over` has none |
| `key(s)` | worked out by the compiler, below |
| `drawn(mon)` | `seat`: each patron's own hair and robe colours, from `KW.cast.patrons`, as `court.js` gives them for the settings' "As drawn" |

`name` and `quiet` are not read by the engine: the settings take the quiet scenes in turn from the
world's preset. `hosts` is given as it is, and the engine plays an event only in a scene that hosts
it (`KW.engine.hosts`); the flies and the crate also give `outdoors`, the one flag the engine lets
both in by. The code scenes give the same `hosts` as their data, and `EVENTS` in `engine.js` keeps
the medieval world's lists for a scene that gives none. `tests/web/world-scenes.test.js` holds every
scene's `quiet` and `hosts` to those lists and the settings' quiet scenes. `decor` is not read, since
nothing draws decorations yet.

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
it `rgba(0,0,0,0.3)`; [tests.md](./tests.md#the-pages-tests) says how its test allows for that.)

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
360)` is `"clip": [null, 360]`. The mark `things` is where the devices behind the watcher are drawn,
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
the place's `w` nor taller than its `h` ([rig.md](./rig.md#gear-at-rest)), and the mark draws
nothing where it does not. The weapon has no rest view and lies on its frame as before. Every view
in the base pack fits every place the medieval scenes give it: the helmet's 64 by 70 the stool's 76
by 80, the shield's 96 by 132 the house's wall of 100 by 140 and the smithy's of 100 by 132.

A frame may name a stamp, as the house's pegs do: `{ "x": 618, "y": 228, "a": "flat", "stamp":
"peg" }`. The mark then draws the stamp under the weapon twice, before it, at the frame's `y` and at
the xs the engine works out from the weapon's reach, its `blade` or, for a weapon that only fires,
its `barrel` (`KW.knight.rest.reach()`): 28 past where it starts and 45 short of its end, from the
grip's middle, which is `pegXs()` in `house.js`. For the greatsword the pegs stand at 680 and 836,
and for the arming sword at 680 and 748; a weapon that gives neither gets the greatsword's. The interface leaves `stamp` out, as it does `from`.

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

With a weapon that fires the act shoots instead, on the same beats ([page.md](./page.md#the-acts-with-a-weapon-that-fires)):
the watcher trains from 300 short of the target, the shot leaves at the middle of the beat (450 ms
into a beat of 900, 500 into each second while hot) and the target is struck the moment it lands,
with the burst on it as well as its `burst` of straw. The shot aims at the middle of the box the
shapes of the target's group paint, which the compiler works out from the shapes at the ends of
their values and gives as the scene's `target`: `[710, 380]` for the yard's dummy, the point the
code yard aims at. A target's own aim point is not read: `aim` is refused at `fields` in every
format.

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
`smithy.js` gives none: with rounds the engine would walk the watcher between them, and the hammer
would follow. The format asks for one round at least, so the smithy's data has one at its spot,
guarding, which is where the act keeps the watcher.

The **hot tip** of the blade is part of the anvil's act, and reads the equipped weapon's `blade`,
`KW.knight.rest.reach()`: it is drawn where a `rest` mark for the weapon at the anvil's rest stands
in a moving or over layer, on the weapon as that rest lays it, and only for a weapon that gives a
blade. A weapon that only fires lies on the anvil with no hot tip; one that is both swung and fired
has its blade's. It is the code smithy's drawing with its numbers in the compiler's table `TIP`: from the
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
`glow` of the scene's own, in the palette track's colour. Streaming is the watcher's pose, which the
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
settings. The patron may be another world's, by its long name: the mark draws whichever patron
`KW.cast.patrons` holds under `s.patron.id`.

**Each act in its own condition.** The court and the smithy each act one condition, so their acts
play whatever else is up. A scene of another world may hold more than one act, as Orbit's Bridge
holds a seat and an anvil and acts both a shell open and an update. So an act plays while its own
condition is up (the seat's while `ssh_session` is, the anvil's while `updating` is), and always in a
scene whose `can` lists nothing else. While the seat's act does not play the patron sits silent,
mouth shut, with no bubble, and the watcher's mouth is its own; while the anvil's does not, the
hammer is still, `strike` never holds, the blade shows no hot tip and the weapon stays as the
scene's `weapon` says. The court
and the smithy play exactly as before.

**What it does not build,** it refuses by name: the scene does not compile, the reason says
`<field>: <what> is not built in this engine yet`, and the scene is drawn from code. That covers the
shape kind `dith`, a `pix` colour chosen as it is drawn (a pick or a palette track's), the mark
`target`, `only` on a shape, `"g"` on an effect or a mark, of keyframes a clock in seconds, a
triggered clock (`trigger`), any ease but `step` and any channel but `show`, `dx` and `dy`, a colour
a palette track drives inside a band list, in an effect or through another entry, a mix or a
contrast outside a patron, a pick inside a band list or an effect, an effect inside a stamp, a
triggered effect (`burst`) in a scene without a target or an anvil, a burst of sparks on a target's
blow and of straw on the hammer's, a scene with both a target and an anvil, a scene that hosts the
flies without the crate or the crate without the flies, a reference to one of the user's sets
(`@skin.*`, `@hair.*`, `@tabard.*`, `@plume.*`) in a scene's layers, a stamp or a prop, which the
library accepts, and the field `pole`. A scene that needs one of these adds the rows to the
compiler's tables: a shape kind to `SHAPES`, a mark to `MARKS`, an act beside the target's and the
anvil's, a part of the key beside the predicates and the gear.

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
