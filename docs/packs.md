# Packs

A pack is one JSON file of shapes: the knight's gear, its builds, colour choices and scene
decorations. The engine draws a pack's shapes with the primitives of `draw.js` (`Rh`, `Rv`, `ell`,
`rrect`, `poly`, `strip`, `pix`), so a pack can say only what a drawing call can say, and nothing in
it runs.

`web/js/pack.js` is the library that reads packs. It checks a pack's text whole and either returns
the pack or refuses it with the step and the field at fault, turns a look into flat lists of
records, and draws a list by calling the primitives. It loads under Node for the tests in
`tests/web/pack.test.js`, like `state.js`.

The page loads the library and the base pack, `web/packs/base.pack.json`, which holds the present
knight as data, and, when served, the packs the collector downloaded into `data/packs/`. Where the
page can use the base pack it draws the knight from it, and otherwise from the code in
`knight.js`, which draws the same knight; see [On the page](#on-the-page). The scenes' gear at rest (the helmet on the house's stool, the weapon
on the pegs and across the anvil) follows the knight in the same way; see [Gear at
rest](#gear-at-rest). The settings screen chooses the look from the base pack and shows which
packs were refused ([page.md](./page.md#settings)). Not built yet: anything that draws a
decoration. A decoration's fields and shapes are
checked and its cost counted, but only its keyframes are compiled; its shapes are not.

This page describes format 1.0 as the library implements it.

## The file

A pack file is UTF-8 JSON holding an envelope:

```json
{
  "kwpack": 1,
  "pack": { "id": "kw.base", "...": "the pack" },
  "sig": { "alg": "ed25519", "kid": "kw1", "value": "<base64 of 64 bytes>" }
}
```

| Field | Rule |
|---|---|
| `kwpack` | `1` |
| `pack` | an object, the pack (below) |
| `sig` | an object: `alg` `"ed25519"`, `kid` the name of a public key, `value` the signature in base64; see [Signing](#signing) |

`kwpack` and `pack` are required. No other key is allowed. A page may accept a pack with no `sig` only when it asks for that (see
`allowUnsigned` under [The library](#the-library)).

## The pack

| Field | Type | Rule |
|---|---|---|
| `id` | string | `^[a-z][a-z0-9-]{1,31}(\.[a-z0-9-]{1,31}){0,3}$`, such as `kw.base` |
| `name` | string | 1 to 48 characters, one line |
| `version` | string | `major.minor.patch`, each 0 to 999, no leading zeros |
| `format` | `[1, minor]` | the minor no higher than the engine's, which is 0 |
| `licence` | string | 1 to 200 characters, one line |
| `provides` | array | each of `builds`, `items`, `palettes`, `swatches`, `decorations` at most once: exactly the sections that are present and not empty |
| `palettes` | object | the pack's own colour sets |
| `swatches` | object | choices for the user's colour sets |
| `builds` | object | body shapes; the base pack only |
| `defaults` | object | the default look; the base pack only |
| `items` | object | the gear |
| `decorations` | object | things a scene may show in its places |
| `companions` | object | reserved: checked to be an object, signed, never read |
| `ext` | object | for experiments: checked to be an object, signed, never read |

Any other key is refused. A section may be absent or empty; an empty one is not listed in
`provides`. Characters are counted as Unicode code points, and "one line" means no control
characters and no line or paragraph separators.

The ids of builds, items, swatches, decorations and decoration groups are local to the pack and
match `^[a-z][a-z0-9.-]{0,47}$`. From outside the pack a thing is named `<pack id>/<local id>`.

**The base pack** is the pack whose id is `kw.base`. Only it may carry `builds` and `defaults`, and
it must carry both. Every look falls back on it.

## Colours

| Form | Example | Meaning |
|---|---|---|
| hex | `"#3f74e0"` | an opaque colour, six lower-case hex digits |
| reference | `"@tabard.1"` | an entry of a palette set |
| translucent | `{"rgb": "#3c1e14", "a": 0.18}` | drawn as `rgba(60,30,20,0.18)`; `a` from 0.01 to 1 |

A **fill** is a colour or a band list, `[[fraction, colour], ...]`: 1 to 8 bands, fractions rising
from above 0, the last exactly 1. The bands run across the shape the way the primitive shades it:
across the width for `ell`, `rrect`, `poly` and `strip`, top to bottom for `rect`. A reference may
name a band list where a fill is expected, but inside a band list and in a `pix` key each colour
must be a single colour.

**Palette sets.** Five set names are reserved:

| Set | Filled by | Entries |
|---|---|---|
| `base` | the format, frozen | `k`, `w`, `s0` to `s4`, `r0` to `r3`, `f0` to `f2`, `b0` to `b3`, `g0` to `g3`, `n0` to `n3`, and the band lists `steel`, `steel2`, `steel3`, `gold`, `leather` |
| `skin` | the user's skin swatch | `face`, `sick`, `hot` (band lists), `cheek`, `puff` |
| `hair` | the user's hair swatch | `0`, `1`, `2`, `brow` |
| `tabard` | the user's tabard swatch | `0` to `3` |
| `plume` | the user's plume swatch | `0` to `3` |

`base` is a frozen copy of the palette `KW.draw.C` and the band lists of `draw.js` as they were when
format 1 was fixed. `pack.js` carries its own copy, and a test checks it against `draw.js`, so the
scenes may change their palette later without changing any pack.

`@skin.face` is the one colour the engine changes by state: the skin swatch's `face` ramp normally,
its `sick` ramp when the knight is ill and its `hot` ramp when overheated. The engine passes the
ramp to `draw()`.

**`palettes`** holds the pack's own sets: up to 16 sets of 1 to 32 entries, such as `{"lantern":
{"glass": "#fff3a0", "rim": [[0.3, "@base.n0"], [1, "@base.n2"]]}}`. A set name matches
`^[a-z][a-z0-9-]{0,31}$` and may not be a reserved name; an entry name matches
`^[a-z0-9][a-z0-9-]{0,31}$`. An entry is a fill, and a reference in it may name only `@base`. A
pack's shapes read its own sets and the five reserved ones, never another pack's.

**`swatches`** offers choices for the four user sets: `{"tabard": {"blue": {"name": "Blue",
"entries": {"0": "#6f9eff", "1": "#3f74e0", "2": "#2f59b6", "3": "#213f86"}}}}`. A swatch gives
every entry of its set and nothing else, in literal colours (no references). The skin's `face`,
`sick` and `hot` are band lists. Up to 32 swatches per set, and a swatch's name is 1 to 48
characters.

## Builds and defaults

A build is eight measurements in grid pixels. Shapes lean on their differences from the present
knight, `dShoulder` being the build's `shoulder` minus 54 and so on, so for the present knight
every difference is 0.

| Measurement | Meaning | Present knight | Range |
|---|---|---|---|
| `shoulder` | half the span between the shoulder joints | 54 | 40 to 70 |
| `chest` | half the width of the torso at the chest | 46 | 32 to 64 |
| `waist` | half the width at the belt | 46 | 28 to 64 |
| `hip` | half the width at the hem | 46 | 32 to 64 |
| `stance` | half the distance between the middles of the legs | 24 | 16 to 34 |
| `leg` | height of the hip line above the ground | 74 | 60 to 100 |
| `height` | height of the shoulder line above the ground | 132 | 110 to 160 |
| `head` | half the width of the bare skull | 51 | 42 to 60 |

| Field of a build | Rule |
|---|---|
| `name` | 1 to 32 characters |
| `m` | all eight measurements, whole numbers within their ranges |
| `head` | the id of an item of this pack whose slot is `head`: the bare skull the build wears |

Up to 4 builds.

`defaults` names what a new display shows and what a look falls back to:

```json
{ "build": "build.a",
  "items": { "legs": "legs.plate", "boots": "boots.leather", "torso": "torso.tabard", "hair": "hair.short",
             "plume": "plume.crest", "helmet": "helm.open", "pauldrons": "pauldrons.plate",
             "arms": "arms.plate", "gauntlets": "gauntlets.plate", "main": "main.greatsword" },
  "swatches": { "skin": "warm", "hair": "brown", "tabard": "blue", "plume": "red" } }
```

The ids are local to the base pack. `items` must name an item for every slot except `back`, `off`
and `head`, and may name one for `back` and `off`; the head comes from the build. Each item must
exist and be of the slot it is named for, and `swatches` must name an existing swatch for each of
the four sets.

## The rig

### Anchors

A shape hangs on an anchor, a point the engine works out each frame from the pose and the build.
Grid pixels, y growing downwards; left and right are the viewer's.

| Anchor | Where | On the present knight, from the root `(X, Y)` |
|---|---|---|
| `root` | between the feet, on the ground | `(X, Y)` |
| `footL`, `footR` | under each leg | `(X ∓ 24, Y)` |
| `hipL`, `hipR` | the top of each leg | `(X ∓ 24, Y - 74 + drop)` |
| `hem` | the bottom of the torso | `(X, Y - 64 + drop)` |
| `belt` | the belt line | `(X, Y - 102 + drop)` |
| `neck` | the top of the torso | `(X, Y - 162 + drop)` |
| `shoulderL`, `shoulderR` | the shoulder joints | `(X ∓ (54 + bloat), Y - 132 + drop)` |
| `head` | the middle of the eye line | `(X, Y - 206 + drop)`, moved by the head's shifts |
| `handL`, `handR` | the hands, wherever the pose puts them | from the pose |
| `main` | the weapon's frame: a point and an angle | from the pose |
| `off` | the left hand, which holds the shield; the same point as `handL` | from the pose |
| `plume` | the plume's mount on the worn helmet | the helmet's `mounts.plume` from `head` |
| `rest` | where a scene sets down gear | from the scene |

In a part drawn for one side, `foot`, `hip`, `shoulder` and `hand` mean that side's anchor.

### Named values

A shape may lean on these names. All are whole numbers when the engine sets them, and each has a
range that every check below works over.

| Name | Meaning | Range |
|---|---|---|
| `drop` | how far the upper body sinks (bob and crouch), in pixels | 0 to 40 |
| `bloat` | how far each side swells when memory is tight, in pixels | 0 to 60 |
| `stepL`, `stepR` | 1 while that foot is lifted in the walk, else 0 | 0 to 1 |
| `step` | in a part drawn for one side, that side's step | 0 to 1 |
| `sway` | the plume's sway | -4 to 4 |
| `dShoulder`, `dChest`, `dWaist`, `dHip`, `dStance`, `dLeg`, `dHeight`, `dHead` | the build's differences from the present knight | from the measurement ranges: `dShoulder` -14 to 16, `dChest` -14 to 18, `dWaist` -18 to 18, `dHip` -14 to 18, `dStance` -8 to 10, `dLeg` -14 to 26, `dHeight` -22 to 28, `dHead` -9 to 9 |

The engine clamps `drop` and `bloat` into their ranges when it fills the values array for a pack
(`fillArrays` in `knight.js`). The present knight stays inside them: its drop reaches 10 and its
bloat 30. `RANGE` in `pack.js` holds the table.

Where a name may be used:

| Where | Names allowed |
|---|---|
| the parts of an item, and hair's `helmeted` view | all of them; `step` only in a part with a `side` |
| rest views, and the plume mounts of a helmet and of its rest view | the build's differences only |
| decorations | none |

### Coordinates

A **scalar** is a number, or a term object `{"c": number, "<name>": coefficient, ...}` meaning `c`
plus each named value times its coefficient; `c` may be left out and means 0. Every number in a
scalar is a multiple of 1/8, and coefficients lie from -8 to 8. With whole-number values every sum
is then exact in floating point, so the order of adding cannot change a result.

The range of a scalar bounds its value as evaluated, not only `c`. The `rules` step works out each
scalar's least and greatest value over the ranges of the names it leans on, and refuses the pack
when either end leaves the scalar's range, naming the field and the end that breaks it. So no
negative size and no offset past 512 can reach a primitive, whatever the build and the frame.

| Scalar | Range, at both ends |
|---|---|
| offsets (the x and y of points, clips, pivots, mounts, `hold`) | -512 to 512 |
| lengths `w`, `h` | 0 to 512 |
| corner radius `r` of an `rrect` | 0 to 256 |
| radii `rx`, `ry` of an `ell` | 1 to 256 (`draw.js` divides by them) |
| strip half-widths `hw0`, `hw1` | 0 to 64 |

The offsets folded in later are checked folded. A shield's points and clips are checked with its
`hold` point taken off them. A plume and its helmet may come from different packs, so a plume is
checked on its helmet's mount (worn) and rest mount (at rest) when a look is resolved; see
[Looks](#looks). The base pack's default plume must fit its default helmet at every build.

A **point** is one of:

| Form | Example | Means | Allowed |
|---|---|---|---|
| pair | `[-46, {"c": 28, "drop": -1}]` | offsets from the shape's anchor | everywhere |
| anchored | `{"at": "hand", "x": 0, "y": 0}` | offsets from another anchor the slot allows | parts of items |
| framed | `{"frame": "main", "s": 31, "p": -19, "x": -3, "y": -3}` | `s` along the weapon and `p` across it, then `x` and `y` on screen if given | parts of `main` items |

`s` and `p` are plain numbers from -400 to 400, multiples of 1/8. Mount points, `hold`, group
pivots, rest views and decorations use pairs only, and `hold` and pivots take plain numbers.

The engine evaluates a point as the anchor plus the whole offset, in one addition. A framed point
is `gx + sx * s + px * p` across and `gy + sy * s + py * p` down, where `(gx, gy)` is the frame's
point, `sx = sin(a)`, `sy = -cos(a)`, `px = -sy` and `py = sx`, then plus `x` and `y`: the same
arithmetic as the greatsword's drawing in `props.js`.

## Slots and the drawing order

| Slot | Hangs on | Notes |
|---|---|---|
| `back` | any of `root`, the feet, hips, `hem`, `belt`, `neck`, the shoulders, `head`, the hands | behind everything |
| `legs` | `hipL`, `hipR`, or `hip` with a side | |
| `boots` | `footL`, `footR`, or `foot` with a side | |
| `torso` | `neck`, `belt`, `hem` | |
| `head` | `head` | the bare skull and ears; chosen by the build, never by a look |
| `hair` | `head` | may carry a `helmeted` view, drawn below a helmet |
| `plume` | `plume` | drawn only on a helmet that has a plume mount |
| `helmet` | `head` | includes the skin seen through its opening |
| `pauldrons` | `shoulderL`, `shoulderR`, or `shoulder` with a side | |
| `arms` | `shoulder`, `hand` | one part for each side |
| `gauntlets` | `hand` | one part for each side |
| `main` | `main` | the weapon |
| `off` | `off` | the shield; carried only with a one-handed weapon (see [Fallbacks](#when-packs-fail)) |
| `companion` | | reserved: an item of this slot is skipped unread |

The order of one frame, front to back reading down; the engine's own steps are in brackets.

1. `back`, `legs`, `boots`, `torso`, each in the order its parts are written
2. the head group. Helmet on: hair's `helmeted` view, the plume, the helmet. Helmet off: the
   build's head item, the hair.
3. [the face], [the drumstick, in the feast]
4. `pauldrons`
5. [the crate, when carrying]
6. the hands group, by grip mode (below)
7. [sweat, steam, the marks, the thought bubble, the progress bar, hearts, the speech bubble]

| Mode | Hands group |
|---|---|
| `none` | arm L, gauntlet L, arm R, gauntlet R |
| `hammer` | arm L, gauntlet L, arm R, [the hammer], gauntlet R |
| `twoR`, the two-handed blade leaning right | arm R, arm L, the weapon, gauntlet R, gauntlet L |
| `twoL`, leaning left | arm L, arm R, the weapon, gauntlet L, gauntlet R |
| `one`, one-handed | arm L, gauntlet L, the shield, arm R, the weapon, gauntlet R |
| `oneCrossed`, the sword hand left of the root | arm L, gauntlet L, arm R, the shield, the weapon, gauntlet R |

In the two-handed modes the arm on the lean side reaches the upper hand, so the engine puts the
upper hand on that side's hand anchor. Both arms go before the weapon, so neither is ever drawn
over the blade or the guard, and the gauntlets after it, closing on the grip; a two-handed
weapon's upper station must sit low enough that its gauntlet stays below the guard, as the base
pack's greatsword's 2 does. Once the blade turns past level the engine slides the upper hand up to
2 further down the grip, which a weapon's stations need not allow for. The one-handed orders hold the sword in the right hand and
the shield in the left. In `one` the shield's group goes first, so the sword arm and the sword lie
over the shield's edge where they meet and no arm crosses the shield's face. In `oneCrossed`,
while the sword hand is across the body, both arms go first, then the shield, then the weapon and
last the sword hand's gauntlet: the sword arm stays behind the shield, and the blade passes in
front of the shield, so a blow struck across the body is seen. The off gauntlet lies behind the
shield in every pose.

The order of one frame has changed three times since the format was approved. The first change
put both arms before the weapon in `twoR` and `twoL`. The second: `oneCrossed` used to draw the
shield last, over the blade, and at the camp, where the goblin stands low on the shield's side, the
shield hid the blade at the bonk and in the swat to the left. The blade is now drawn over the
shield. The third moved the engine's `crates` step from first, behind everything, to after
`pauldrons` and before the hands group, in every mode: the knight now carries a crate against the
chest with the arms round its sides, where before the crates floated behind the head. A pack's own
lists keep their places relative to each other. The order is the engine's, given by `sequence()`
in `pack.js`, and no pack carries it, so the base pack and its signature are unchanged by these
changes. With a one-handed weapon and no shield the left
hand hangs at the side as in `none`, and the orders are the same with no shield in them.

The poses with each grip belong to the engine, not to the weapon: every one-handed weapon is held,
swung and raised the same way, whatever its length. [page.md](./page.md#the-knights-rig) gives the
numbers.

## Items

| Field | Applies to | Rule |
|---|---|---|
| `slot` | all | one of the slots above |
| `name` | all | 1 to 48 characters |
| `parts` | all | 1 to 16 parts |
| `mounts` | `helmet` | `{"plume": pair}`, offsets from `head` |
| `views` | `hair` | `{"helmeted": [parts]}` |
| `rest` | `helmet`, `plume`, `off` | a rest view |
| `grip` | `main`, required | `{"kind": "two", "hands": [upper, lower]}` or `{"kind": "one", "hands": [s]}`, stations along the frame from -400 to 400 |
| `blade` | `main` | `{"from", "to", "half"}` in frame units, `from` below `to`, `half` from 0 to 400 |
| `hold` | `off`, required | a pair of numbers: the point of the shield that sits on the off hand |
| `face` | `off`, required | `[x, y, w, h]` from `hold`: the box no arm may be drawn over |

No other field is allowed on an item of a given slot. An item fits every build.

A **part** is `{"at": anchor, "side": "L" or "R", "shapes": [...]}` with 1 to 128 shapes. `side`
is required in `arms` and `gauntlets`, which must each have exactly one part for side L and one for
side R; elsewhere it sets what `foot`, `hip`, `shoulder`, `hand` and `step` mean.

A shield's shapes are written in its own coordinates and drawn with its `hold` point on the off
hand, upright: a shield never turns. Its `face` is not drawn; it records the box the poses keep
clear of arms, which the engine's test checks pixel by pixel against what the shield draws.

### Shapes

Every shape has `k`, its kind. In a part, a shape may also have `at`, an anchor that replaces the
part's for that shape alone.

| `k` | Fields | Drawn with |
|---|---|---|
| `rect` | `p` (top left), `w`, `h`, `fill` | `Rh` for a colour, `Rv` for bands |
| `ell` | `p` (centre), `rx`, `ry`, `fill`, optional `clip` | `ell` |
| `rrect` | `p` (top left), `w`, `h`, `r`, `fill`, optional `clip` | `rrect` |
| `poly` | `pts`, `fill`, `dir` | `poly` |
| `strip` | `p0`, `p1`, `hw0`, `hw1`, `fill` | `strip` |
| `pix` | `p` (top left), `rows`, `key` | `pix` |

- `clip` is `[top, bottom]`, each a scalar or `null`: y offsets from the shape's anchor. Only the
  rows between them are drawn.
- `poly` has 3 to 16 points, convex and in order. They must be all pairs or all framed points, and
  framed points of a polygon carry no `x` or `y`. Convexity is checked with every named value at 0,
  and framed points in the frame's own terms. No point may equal the one before it (the last and
  the first included), since a doubled point would hide a reflex angle, and no edge may double back
  along the one before. `dir` is `rows`, `cols` or `frame`; `frame` fills by columns when the weapon
  lies nearer horizontal than vertical, and is allowed only in a part of a `main` item: never in a
  rest view or a decoration.
- `pix` gives the shape row by row: 1 to 64 rows of equal length, each 1 to 64 characters from `!`
  to `~` (printable ASCII without the space), `.` for clear and any other character a key of
  `key`. `key` maps 1 to 16 single characters, each from `!` to `~` and not `.`, to single
  colours.

### The face

The engine draws the face (eyes, brows, cheeks, mouth, the thermometer) after the head group, at
fixed offsets from `head`, so no helmet can cover it. A helmet must also show skin there: it needs a
`rect`, `rrect` or `ell` filled with exactly `@skin.face`, placed by a pair, whose box holds the
face box, `x` from -28 to 28 and `y` from -20 to 20 around `head`. The box is `[x, x + w]` by
`[y, y + h]` (centre plus and minus the radii for an ellipse), cut by any clip. It must hold at both
ends of the range of every name the shape leans on.

The face is drawn in the look's colours. The lid of the half-closed eyes takes the band of the
skin ramp in use (`face`, or `sick` or `hot` when the knight is ill or overheated) that lies across
the middle of the face's width, the first band whose fraction is 0.5 or more; the cheeks take the
skin's `cheek`, the puffed cheeks its `puff`, and the brows the hair's `brow`. A skin swatch's
three ramps and two colours, and a hair swatch's `brow`, should therefore be chosen together with
the face in mind.

The check proves that a skin-coloured shape covers the face box. It does not prove that nothing is
painted over that shape afterwards: the fixture's own helmet lays a translucent shade over the top
of its opening. What keeps the face visible is the drawing order, in which the engine paints the
face last.

### Rest views

Gear the scenes show off the knight (the helmet on a stool, the shield on a wall) has a rest view,
hung on the `rest` anchor that the scene places.

| Field | Rule |
|---|---|
| `fits` | `hang`, `surface` or `floor` |
| `box` | `[w, h]`, whole numbers from 1 to 240: the space it needs from its anchor |
| `mounts` | helmet only: `{"plume": pair}`, where the plume's rest view hangs |
| `shapes` | 1 to 64 shapes, with no `at` of their own |

A plume's rest view has `shapes` only, and is drawn at the helmet's rest mount, before the helmet's
rest view and so behind it, as the worn plume is drawn behind the worn helmet. A weapon needs no
rest view: a scene draws its worn shapes on a frame of its own. Its `blade` tells a scene where the
blade lies along that frame, for the smithy's hot tip.

The page shows three rest views (the helmet, its plume and the shield) and one weapon at rest; see
[Gear at rest](#gear-at-rest). `fits` and `box` are checked and are not yet compared with the place
a scene puts the view in. The base pack's shield fits `hang`: its rest view hangs it by a strap
from a nail at the rest anchor, the top middle of the place.

## Decorations

A decoration is a small picture a scene shows in one of its places.

| Field | Rule |
|---|---|
| `name` | 1 to 48 characters |
| `fits` | 1 to 3 of `hang`, `surface`, `floor`, each once |
| `box` | `[w, h]`, whole numbers, at most 240 by 240 |
| `groups` | up to 8, `{"flame": {"pivot": [x, y]}}` |
| `shapes` | 1 to 64 shapes, pairs only, no named values; a shape may name its group as `"g": "flame"` |
| `anim` | optional keyframes; without them the decoration is still |

`fitsPlace(decoration, place)` says whether a decoration goes in a place `{ kind, w, h }`: the kind
is one it fits and its box is no larger than the place's.

**Keyframes.** `anim` is one clock and its tracks:

```json
"anim": { "period": 3.2, "loop": true, "phase": 0, "tracks": [
  { "g": "flame", "ch": "dy", "ease": "smooth", "keys": [[0, 0], [0.5, -2], [1, 0]] },
  { "g": "flame", "ch": "show", "keys": [[0, 1], [0.92, 0]] },
  { "pal": "lantern.glass", "ease": "linear", "keys": [[0, "#fff3a0"], [0.5, "#ffe28a"], [1, "#fff3a0"]] }] }
```

| Field | Rule |
|---|---|
| `period` | seconds, 0.2 to 600 |
| `loop` | `true` repeats; `false` plays once from when the decoration appears and holds its last values |
| `phase` | optional, 0 to 1: where in its period the clock starts |
| `tracks` | 1 to 16, no two driving the same channel of one group or the same palette entry |
| track `g` and `ch` | a declared group, and `dx`, `dy` (multiples of 1/8 from -512 to 512, drawn rounded to whole pixels), `scale` (0.25 to 4, about the pivot), `alpha` (0 to 1) or `show` (0 or 1) |
| track `pal` | `"set.entry"`, an entry of the pack's own palettes that is a hex colour; its keys are hex colours |
| track `ease` | `step`, `linear` or `smooth` (smoothstep); required, except that `show` is always `step` |
| track `keys` | 1 to 32 `[time, value]` pairs, times from 0 to 1 of the period, rising |

Between keys the value follows the ease; before the first key it holds the first value, after the
last the last. Colours interpolate in RGB with each channel rounded. `animate(decoration, t)`
returns every group's `{ dx, dy, scale, alpha, show }` and every animated palette entry at `t`
seconds after the decoration appeared, as a pure function of `t`.

## The checks

`read()` checks a pack fully, in this order, and stops at the first failure. A pack that fails is
refused whole.

| Step | What it checks |
|---|---|
| `size` | the input is text of at most 512 KiB, counted in UTF-8 bytes |
| `json` | nesting no deeper than 12 and no key twice in one object, checked on the raw text before parsing; then `JSON.parse`; then every number finite, below 1,000,000 in size and with at most 3 decimals, every string and key free of unpaired surrogates, and no key `__proto__`, `constructor` or `prototype` anywhere, `ext` and `companions` included |
| `envelope` | the file holds a JSON object; `kwpack` is 1 and `pack` an object, both present; `sig`, when present, is an object; no other key |
| `signature` | the signature, against the key named by `kid` |
| `format` | `format` is `[1, 0]` |
| `fields` | every field against its table, with no unknown keys outside `ext` and `companions`: types, ranges, multiples of 1/8, id patterns, text lengths, rising band fractions, and the counts the tables give |
| `references` | every `@set.entry` exists and is the right kind, every anchor is one the slot allows, every named value is on the list and allowed where it is, `dir: "frame"` appears only in a part of a `main` item, every `g` is a declared group, every palette track names a hex entry of the pack's own palettes, each build's head item exists with slot `head`, and every default exists |
| `rules` | `provides` matches the sections, `arms` and `gauntlets` have one part for each side, each helmet passes the face check, each grip has as many stations as its kind, each blade's `from` is below its `to`, every scalar stays in its range at both ends (folded where something is folded in), each polygon is convex with no point repeated, each decoration's box is at most 240 by 240, no two tracks drive one thing |
| `counts` | the per-pack counts and costs below; that the base pack's default look, with each of its builds, draws at most 1200 shapes and costs at most 40 000; and that its default plume fits its default helmet |
| `compile` | every item and decoration compiles |

A refusal is `{ ok: false, step, reason, id }`. The reason names the field at fault as a path,
such as `pack.items["helm.open"].parts[0].shapes[8].p[0]: must be a multiple of 1/8 from -512 to
512`, and `id` is the pack's id when it could be read. The reader never throws, whatever it is
given, options included.

A reason holds text from the pack: its keys and ids. Each key or value quoted in it is cut to 40
characters and the whole reason to 300, each ending in three full stops when cut. A reason is
text, and a page must show it as text, never as markup.

### Limits

| What | Limit |
|---|---|
| file | 512 KiB |
| depth of nesting in the JSON | 12 |
| packs loaded at once | 32 |
| items per pack | 256 (companion items included) |
| parts per item, or in hair's `helmeted` view | 16 |
| shapes per part | 128 |
| shapes per item, its parts, view and rest view together | 400 |
| points per `poly` | 16 |
| `pix` | 64 by 64, 4096 pixels per shape, 16 384 per pack (counted as width times height) |
| `pix` keys | 16 |
| the pack's own palette sets | 16, of 32 entries each |
| swatches | 32 per set per pack |
| bands per fill | 8 |
| builds | 4 |
| decorations | 64 per pack; 64 shapes, 8 groups, 16 tracks and 32 keys each |
| keyframe period | 0.2 to 600 seconds |
| rest view | 64 shapes, a box of 240 by 240 |
| one frame of the knight | 1200 shapes, counted when a look is compiled |
| the cost of an item, its parts and views together | 8000 |
| the cost of one frame of the knight, in any grip mode and helmet state | 40 000 |
| the cost of a decoration | 8000 |

The depth of 12 is the deepest a valid pack can nest: a term inside a point of a polygon in hair's
`helmeted` view, or a translucent colour in one of its band lists.

### Cost

A count of shapes says little about the work of drawing them: one ellipse of radius 256 in 8 bands
makes over 4000 calls to `fillRect`. So every shape has a cost, the most `fillRect` calls `draw.js`
can make for it, worked out at the ends of the range of every value it leans on:

| Shape | Cost |
|---|---|
| `rect` | 1 for a colour; one per band for a band list |
| `ell` | its rows, twice the greatest `ry` rounded up plus 1, times its bands |
| `rrect` | its rows, the greatest `h` rounded, times its bands |
| `poly` | the rows (or columns) its points can span, plus 1, times its bands |
| `strip` | the rows or columns its ends and half-widths can span, plus 1, times its bands |
| `pix` | one per run of a character in a row |

A clip with both ends set caps the rows of an `ell` or `rrect`. A band list of the user's skin
counts as 8 bands. A framed point may turn to any angle, so it reaches the length of its `(s, p)`
in every direction. A shape whose points hang on two anchors adds `ANCHOR_SPAN`, 400: the
farthest apart two anchors of one frame may lie. The present rig keeps inside it: over every
pose, every point of a swing, the smallest and largest builds and a bloat of 60, its anchors lie at
most 273 apart (the left shoulder and the hammer hand at the anvil). A decoration's shape counts as many times over as the largest scale its
group's keyframes reach.

The cost is a bound, not a count. The present knight costs 11 932 in its heaviest mode (the
greatsword, helmet on): 5560 for the legs, boots, tabard, pauldrons, arms and gauntlets, 1720 for
the plume and helmet, and 4652 for the greatsword. Drawn through `draw.js` it makes between
about 5800 and 6500 calls in the poses measured, the face included. With the helmet off the head
group costs 1632; with the sword put away, or at the anvil, the greatsword's 4652 drops out. The
look with the sword and shield costs 12 035 and draws up to about 7000 calls, the attack the
heaviest.

## Signing

The signature covers the bytes of the line `knightwatcher pack v1` and a line feed, followed by the
UTF-8 bytes of the canonical form of the envelope's `pack`. The envelope, `sig` and the file's
layout are not signed, so one signature holds for a pretty-printed copy, a minified one and one
with its keys in another order. The leading line stops a signature made for any other purpose
being passed off as a pack's. `message(pack)` returns exactly these bytes.

The canonical form is RFC 8785 (the JSON Canonicalization Scheme) for the values a pack can hold,
which `canonical(value)` writes:

- no whitespace;
- object keys sorted by their UTF-16 code units at every level, integer-like keys such as `"10"`
  and `"2"` included (`"10"` sorts first);
- strings and numbers as `JSON.stringify` writes them. The `json` step admits only numbers every
  implementation writes alike.

`sig.value` is the 64-byte Ed25519 signature in padded base64; any other spelling is refused. The
key is looked up by `sig.kid` in a table of 32-byte public keys. The table `KEYS` in `pack.js`
holds one key, `kw1`, the project's own:

```
kw1   L6J33tuj/6eKJTc+T6hHVATAS0m1bJnsgdOSgYYtxf4=   (base64 of the 32 bytes)
```

The table is frozen. A `Uint8Array` cannot be frozen, so `KEYS.kw1` is a getter that decodes the
key afresh on each read with the library's own strict base64 decoder: changing the bytes it hands
out changes nothing for the next reader. A caller may pass keys of its own in place of the table
(`keys` under [The library](#the-library)). The check itself is done by a verifier `verify(publicKey, message, signature)`
that returns `true` for a good signature: the one the caller passes, or `KW.ed25519.verify` when a
script has defined it, as `web/js/ed25519.js` does (see [The verifier](#the-verifier)). A verifier
that is missing, throws or answers anything but `true` refuses the pack.

With `allowUnsigned`, meant for a page whose version is `dev`, a pack with no `sig` is accepted
and marked `signed: false`. A pack that does carry a `sig` is checked the same way on every page,
and refused if the key is unknown or the signature fails.

### Signing a pack

`tools/sign-pack.js` signs pack files. It is a Node script with no dependencies beyond Node's own
modules, and it signs with the page's own code: it reads and checks each file with `pack.js`,
builds the signed bytes with `message()` and so the page's `canonical()`, and checks the result
with `ed25519.js`. Nothing about the signed bytes is written twice.

```bash
PACK_KEY_KW1="$(...)" node tools/sign-pack.js web/packs/base.pack.json   # sign with kw1
node tools/sign-pack.js --kid kw2 web/packs/*.pack.json                  # sign with kw2, from PACK_KEY_KW2
node tools/sign-pack.js --unsign web/packs/base.pack.json                # take the signature off
```

- The private key comes only from the environment variable `PACK_KEY_<KID>`: the kid in capitals,
  with any character other than a letter or a digit written as `_`, so `PACK_KEY_KW1` for `kw1`. It
  holds the key as PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). The tool never prints, logs or
  writes it, and refuses to run when the variable is missing or empty, when it holds anything but
  an Ed25519 private key, and when the key's public half is not the one `KEYS` holds under the kid.
- Each file is checked first, as a `dev` page reads it, with any `sig` it already carries set
  aside, so a pack edited after signing can be signed again. Every file is checked and its
  signature made before any file is written, so one bad file leaves all of them as they were.
- The signature goes into the envelope's `sig` as `{ "alg": "ed25519", "kid": ..., "value": ... }`.
  The rest of the file keeps its layout and key order byte for byte: an existing `sig` has its
  value replaced where it stands, and a new one goes after the last member, on a line of its own
  in a file laid out over lines.
- The written file is read back from disk through `pack.js` with signatures required and
  `ed25519.js` as the verifier. If it does not verify, the file is put back as it was and the tool
  fails.
- `--unsign` takes the `sig` out, with the comma before it, and needs no key.
- Either way the tool writes the file's carrier again with `tools/pack-carrier.js`.

**The private key is held outside the repository**, by a private release process that runs the
tool with the variable set; it is never written to a file beside a checkout. The signature itself
is public, and the signed file is committed like any other change.

**A shipped pack edited after it was signed must be signed again or unsigned.** Its signature no
longer covers it, so every page, `dev` pages included, refuses it at the `signature` step, and
`tests/tools/sign-pack.test.js` fails until it is put right. To keep working on a signed pack
before the next signing run, take the signature off with `--unsign`: a `dev` page still reads it.

**A fork signs with a key of its own.** The engine is open and only the key is private. A fork
generates an Ed25519 key pair, puts the public half in `KEYS` under a kid of its own, keeps the
private half out of its repository, and runs the tool with `--kid` and the matching variable. To
make a key pair with Node alone:

```bash
node -e "const k = require('node:crypto').generateKeyPairSync('ed25519');
  console.log(Buffer.from(k.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64'));
  console.log(k.privateKey.export({ type: 'pkcs8', format: 'pem' }))"
```

The first line is the public key for `KEYS`, and the rest the private key to store away. A page
built from a fork accepts only packs signed with the keys in its own table.

### The verifier

`web/js/ed25519.js` defines `KW.ed25519.verify(publicKey, message, signature)`, and exports the
same object under Node. The page needs a verifier of its own because `crypto.subtle` is missing on
a page served over plain HTTP. `index.html` loads it before `pack.js`. On the page it is called
only for a pack that carries a `sig`.

It implements the verification of RFC 8032 section 5.1.7 for pure Ed25519 (no context, no
prehash), with SHA-512 written in the file and the curve's arithmetic on `BigInt`. It verifies and
does nothing else: there is no signing or key generation, and no secret passes through it. Every
input is public, so the arithmetic is not constant-time.

The arguments are `Uint8Array`s of 32 bytes, any length and 64 bytes; a Node `Buffer` and a view
at an offset into a larger buffer work too. It returns `true` for a good signature and `false` for
anything else, wrong types and lengths included, and never throws.

The checks are strict. A signature is refused when:

- its `S` is not below the group order `L`;
- the key or its `R` is not the canonical encoding of a point on the curve: a `y` of `p` or more, a
  `y` with no `x`, or `x = 0` with the sign bit set;
- the key or its `R` is one of the eight points of small order. A key of small order would let one
  signature verify for many messages. A correct signer makes an `R` of small order with a chance
  of about 2^-252, and `node:crypto` refuses one too.

The group equation is the cofactorless `[S]B = R + [k]A`, with `k` reduced mod `L`, as in the
RFC's reference code and in `node:crypto`. Every signature a correct signer makes satisfies it.
The cofactored `[8][S]B = [8]R + [8][k]A` would also accept a signature whose two sides differ by
a point of small order, which takes a key or an `R` given a small-order component on purpose; this
verifier refuses those, and so does `node:crypto`.

One signature over 500 KiB takes about 15 ms under Node, and one over 15 KiB about 2 ms.

## Looks

A look says what the knight wears:

```json
{ "build": "kw.base/build.b",
  "items": { "helmet": "kw.extra/helm.round", "hair": "kw.base/hair.long" },
  "swatches": { "tabard": "kw.extra/red" } }
```

Every name is `<pack id>/<local id>`. Builds come only from the base pack. `items` takes the slots
`back`, `legs`, `boots`, `torso`, `hair`, `plume`, `helmet`, `pauldrons`, `arms`, `gauntlets`,
`main` and `off`; a `head` key, a `companion` key or an unknown key is ignored and reported. The
head is the build's.

`resolve(packs, look)` takes the base pack's default for anything the look leaves out or cannot
use, and reports each in `fallbacks` as `{ kind, key, wanted, used, reason }`. The reasons:

| Reason | When |
|---|---|
| `not set` | the look does not name it |
| `not a "<pack>/<id>" name` | the name has no single `/` |
| `pack not loaded` | no loaded pack has that id |
| `no such item`, `no such swatch`, `no such build` | the pack is loaded but lacks it |
| `the item is for the <slot> slot` | the item exists but belongs to another slot |
| `does not fit the helmet: ...` | the plume would pass 512 from the head on the chosen helmet's mount |
| `its mount carries the plume out of range: ...` | the default plume would pass 512 on this helmet's mount |
| `a shield is carried only with a one-handed weapon` | the look names a shield and its weapon, as chosen or after its own fallback, is not one-handed; `used` is null |
| `over the 1200-shape cap` | dropped to bring the look under the shape cap |
| `over the cost cap of 40000 fills` | dropped to bring the look under the cost cap |

`back` and `off` have no default unless the base pack names one; a look that leaves them out
draws nothing there and reports nothing.

**The caps.** A look may draw at most 1200 shapes for the knight in one frame, and cost at most
40 000. Both are counted for the heaviest frame the look can draw: the body, the larger of the two
head groups, the pauldrons, both arms and gauntlets, and the weapon, with the shield only when the
grip is one-handed.

`resolve` then falls back, one step at a time, until the look passes:

1. A shield with a weapon that is not one-handed falls back to no shield, and is drawn nowhere,
   worn or at rest. A one-handed weapon with no shield is a look of its own: the free hand hangs
   at the side.
2. A plume that would pass 512 from the head on the chosen helmet's mount falls back to the default
   plume; if the default plume does not fit that helmet either, the helmet falls back.
3. A look over either cap falls back its first slot not already at its default, in the order
   `back`, `legs`, `boots`, `torso`, `hair`, `plume`, `helmet`, `pauldrons`, `arms`, `gauntlets`,
   `main`, `off`, and then the build.

Each step puts one more thing back to its default. The base pack's default look has no shield,
passes both caps with every one of its builds, and its default plume fits its default helmet, so
the fallback always ends.

With no base pack loaded, `resolve` returns `{ ok: false, reason: 'no base pack' }`. The page then
draws the knight from code (see [When packs fail](#when-packs-fail)).

## The compiled lists

`resolve` compiles the look into lists of flat records, one record per shape:

- every colour resolved to the string or band list the primitives take, translucent colours
  written as `rgba(...)`;
- every scalar a number, or `[c, value index, coefficient, ...]` for the named values set each
  frame; the build's differences are folded into `c`;
- the helmet's plume mount folded into the plume's offsets, so the plume hangs on `head`, and the
  shield's `hold` point folded into its offsets;
- poly records holding their own point buffers, filled in place each frame, and pix records a
  lookup of their colours made once.

| List | Holds |
|---|---|
| `body` | `back`, `legs`, `boots`, `torso` |
| `headOn` | hair's `helmeted` view, the plume (when the helmet has a mount), the helmet |
| `headOff` | the build's head item, the hair |
| `pauldrons` | the pauldrons |
| `armL`, `armR`, `gauntL`, `gauntR` | each side's arm and gauntlet |
| `main`, `off` | the weapon and the shield |
| `restHelmet` | the plume's rest view on the helmet's rest mount, when the view has one, then the helmet's rest view |
| `restOff` | the shield's rest view |

`sequence(mode, helmet)` returns the order of one frame for a grip mode as names: these lists and
the engine's steps `crates`, `face`, `drumstick`, `hammer` and `effects`.

`draw(list, anchors, values, prims, face)` walks a list and calls the primitives, allocating
nothing of its own. `anchors` holds the x and y of each anchor in the order of `ANCHORS` (`root`,
`footL`, `footR`, `hipL`, `hipR`, `hem`, `belt`, `neck`, `shoulderL`, `shoulderR`, `head`, `handL`,
`handR`, `main`, `off`, `rest`), then the frame's `sin(a)` and `-cos(a)` at `FRAME_SX` and
`FRAME_SY`; `newAnchors()` makes one. `values` holds `drop`, `bloat`, `stepL`, `stepR` and `sway`
in the order of `VALUES`; `newValues()` makes one. `prims` is `KW.draw` or any object with the
seven primitives. `face` is the skin ramp for `@skin.face` this frame; left out, the swatch's
normal ramp is used.

A test draws the fixture's whole knight this way through `draw.js`, in eleven poses (standing,
bloated, attacking, unwell, walking, helmet off, sword away, at the anvil, mid-swing both ways),
and requires every fill to equal what `knight.js` draws, pixel for pixel, and the number of fills
to stay within the look's cost. The page's own path from the base pack is checked harder still, in
the 112 records of the knight's call record (94 poses of the knight, the bare head in bed and the
speech bubble twice each, the gear at rest, and the house and the smithy); see
[On the page](#on-the-page).

## The library

`KW.pack` in the browser, and `module.exports` under Node.

| Function | Returns |
|---|---|
| `read(text, opts)` | the loaded pack, or `{ ok: false, step, reason, id }` |
| `canonical(value)` | the canonical form, as a string; throws a `TypeError` on anything but a plain object, an array, a string, a finite number, a boolean or `null` (a `Map`, `Set` or `Date` included) |
| `message(pack)` | the signed bytes, a `Uint8Array` |
| `gather(results)` | `{ packs, rejected, superseded }`: the packs in use as a `Map` by id |
| `resolve(packs, look)` | the compiled look, or `{ ok: false, reason: 'no base pack' }` |
| `draw(list, anchors, values, prims, face)` | nothing; calls the primitives |
| `sequence(mode, helmet)` | the drawing order for a grip mode, or `null` for an unknown mode |
| `animate(decoration, t)` | `{ groups, pal }` at `t` seconds |
| `fitsPlace(decoration, place)` | whether the decoration may go in the place |
| `newAnchors()`, `newValues()` | the two arrays `draw` reads |

`opts` for `read`: `allowUnsigned` (`true` to accept a pack with no `sig`), `keys` (an object of
`kid` to 32-byte `Uint8Array`, in place of `KEYS`) and `verify` (in place of `KW.ed25519.verify`).

A loaded pack is frozen: `{ ok: true, id, version, name, licence, format, provides, signed, data,
own, swatches, decorations, sums }`, where `data` is the pack as read, `own` its palettes resolved,
`swatches` its swatches resolved, `decorations` each decoration's groups, compiled keyframes and
`cost`, and `sums` each item's shapes and cost as `{ parts, view, rest }`, each `{ n, cost }`.

`gather` keeps the higher `version` of two packs with one id (the first of two equal ones) and at
most 32 packs, refusing the rest with step `counts`. The base pack is always among the 32: it is
taken first, and the cap turns away the last of the others. `resolve` accepts its result, a `Map` or an
array of loaded packs.

A resolved look is `{ ok: true, look, fallbacks, ignored, m, diffs, colours, grip, blade, plumeShown,
shapes, cost, lists }`: `look` names what is drawn, `m` and `diffs` are the build's measurements and
differences, `colours` holds the skin's `face`, `sick`, `hot`, `cheek` and `puff` and the hair's
`brow` for the engine's face (the half-closed eyes' lid takes the middle band of the ramp in use,
the cheeks, the puffed cheeks and the brows the three colours), and `shapes` and `cost` are the counts against the caps.

`animate(decoration, t)` takes a `t` that is not a finite number, or is negative, as 0, and returns
finite values and well-formed colours for every `t`.

Constants: `FORMAT`, `PREFIX`, `BASE_ID`, `LIMITS`, `ANCHOR_SPAN`, `RANGE`, `STEPS`, `SLOTS`,
`ANCHORS`, `ANCHOR`, `FRAME_SX`, `FRAME_SY`, `VALUES`, `VALUE`, `MEASURES`, `BASE`, `KEYS`,
`ORDERS`.

## On the page

### The base pack

`web/packs/base.pack.json` is the base pack the page ships with: id `kw.base`, version 1.2.0.
Whether it ships signed is said under [Where the knight is drawn from](#where-the-knight-is-drawn-from). It holds the present knight, the free one-handed sword and shield, the free options every user may choose (skin tone, hair colour, hair style, tabard colour and plume colour), and nothing the display does not draw:

- one build, `build.a`, with the present knight's eight measurements and the plain head;
- eleven items, one for each slot the present drawing has: `legs.plate`, `boots.leather`,
  `torso.tabard`, `head.plain`, `hair.short`, `helm.open`, `plume.crest`, `pauldrons.plate`,
  `arms.plate`, `gauntlets.plate` and `main.greatsword`;
- two more, new in 1.1.0: `main.arming`, an arming sword held in one hand (grip `{"kind": "one",
  "hands": [0]}`, blade `{"from": 34, "to": 175, "half": 10}`, 22 shapes), and `off.heater`, a
  heater shield (hold `[0, -6]`, face `[-44, -44, 88, 110]`, 20 shapes worn and 26 in its rest
  view, which hangs it from a nail). The shield's field is painted in the tabard's four colours
  (`@tabard.0` to `@tabard.3`, in the tabard's own bands), so it follows the tabard swatch;
- two hair styles, new in 1.2.0: `hair.tied` ("Tied back", 29 shapes), swept back from the face and
  gathered into a tail that falls behind the left ear (the viewer's left, clear of the greatsword),
  with a `helmeted` view of 10 shapes in which the tail shows below the helmet; and `hair.curls`
  ("Curls", 27 shapes), a round crown of curls with no `helmeted` view, since none of it shows
  under the helmet. Their offsets at the sides of the head lean on `dHead`, as the helmet's do;
- six swatches in each of the four user sets, in the order a settings screen should list them,
  today's among them and the defaults:

  | Set | Swatches (id: name) |
  |---|---|
  | skin | `fair`: Fair, `warm`: Warm, `golden`: Golden, `tan`: Tan, `brown`: Brown, `deep`: Deep |
  | hair | `black`: Black, `dark`: Dark brown, `brown`: Brown, `auburn`: Auburn, `blonde`: Blonde, `silver`: Silver |
  | tabard | `blue`: Blue, `forest`: Forest, `violet`: Violet, `wine`: Wine, `teal`: Teal, `sable`: Sable |
  | plume | `red`: Red, `white`: White, `gold`: Gold, `royal`: Royal blue, `green`: Green, `violet`: Violet |

  Each skin has its own face ramp, its own sick (green) and hot (red) ramps at about its own
  lightness, so the conditions read on every tone, and its own cheek and puffed cheek. No tabard
  is bright red, orange or amber, so a coat is never read as the critical or warning colour. The
  court draws the monarch from the same swatches when the settings choose them: a skin's face and
  cheek, a hair swatch's three bands and a tabard swatch's four as the robe, laid over the court's
  own drawing ([page.md](./page.md#the-scene-interface)), so no pack change is needed for it;
- `defaults` naming the greatsword and the eleven others and today's swatches (skin `warm`, hair
  `brown`, tabard `blue`, plume `red`), so the default look is the present knight; nothing names
  the sword and shield or the new options until a look asks for them. It has no palettes of its
  own and no decorations.

**The eye of the watch** on the tabard and on the shield, worn and at rest, is gold with a white
eye and a pupil; its iris is `@tabard.3`, the tabard's darkest band, so the emblem takes the coat's
colour. On the blue tabard that band is `#213f86`, the colour of `@base.b3` that the iris had
before 1.2.0, so the default knight is drawn exactly as before. The banners in the scenes are drawn
by code and keep their blue iris.

The helmet and the plume carry the rest views of the helmet on the house's stool, and the
greatsword its `blade`, `{"from": 34, "to": 263, "half": 15}`, for the smithy's hot tip; see [Gear
at rest](#gear-at-rest). The eleven items and today's swatches are the test fixture's, unchanged
apart from the iris; the fixture also carries extras the tests need (a second build, long hair, a
smaller arming sword of its own, a round shield, a pennant and a lantern). The one-handed items are
kept, as approved, in `tests/web/fixtures/base-onehand.items.json`, and the free options (the
twenty new swatches and the two hair styles) in `tests/web/fixtures/base-options.json`. The default
look costs 11 932 and draws at most 99 shapes; the look with the sword and shield draws at most
119. Colours do not change what is drawn, so every look's cost depends on its items alone, and the
heaviest is the tied hair with the sword and shield: 129 shapes, cost 12 524, against the caps of
1200 and 40 000.

### Carriers

A page opened from disk can run a script beside it but cannot fetch a JSON file, so each pack that
ships with the page has a carrier beside it, `web/packs/<name>.pack.js`, of one line:

```js
KW.packText.push("{\n  \"kwpack\": 1,\n  \"pack\": {\n ...");
```

The string is the pack file's text unchanged, so the page reads it exactly as it would read the
file fetched. The only code in a carrier is the push. `knight.js` creates `KW.packText`, and
`index.html` loads the carriers after `pack.js`. The page uses the carriers whether it is served or
opened from disk.

The carriers are written by a tool, never by hand. Run it after every change to a pack file:

```bash
node tools/pack-carrier.js                            # every web/packs/*.pack.json
node tools/pack-carrier.js web/packs/base.pack.json   # one file
```

It is written in JavaScript because `JSON.stringify` writes a string literal that JavaScript reads
back to exactly the same text, whatever the file holds; a shell script would need its own escaping.
`tests/tools/pack-carrier.test.js` checks that every pack file has a carrier and that every carrier
pushes its file's text byte for byte.

### Where the knight is drawn from

`main.js` calls `KW.knight.start(KW.packText, allowUnsigned, { look })` once at start-up, before
the first frame, with `allowUnsigned` true only when the page's `kw-version` meta tag says `dev`,
the way it reads the version for the reload check. `start` reads every carried text with `read()`,
gathers the results and resolves the look (`resolve(packs, look)`), at first `{}`, the base pack's
defaults. The look then comes from the settings ([page.md](./page.md#settings)): the address's
hooks, this display's choices on the settings screen, the `defaults` of the state file from
`config.toml`, and last the base pack's defaults, key by key. `main.js` hands it to
`KW.knight.look(look)`, which resolves it again from the packs already read, the downloaded ones
included, and reads nothing again; it does so at start-up and at every change, and with nothing
set the look stays `{}`. The settings name only the base pack's items and swatches, in the
contract's terms: the weapon `sword_and_shield` is `{ items: { main: "kw.base/main.arming", off:
"kw.base/off.heater" } }` and `greatsword` `kw.base/main.greatsword`; a skin, hair, tabard or plume
is `kw.base/<id>`, the hair style `kw.base/hair.<style>`, and a build `kw.base/build.<letter>`, of
which the base pack declares `build.a`, shown as Build A. The address's look hooks give the same
values: `arm=one` and `arm=two` the weapon, `sk=`, `hc=`, `tb=` and `pm=` the swatches and `hy=`
the hair style (see [page.md](./page.md#the-address)). When the downloaded packs arrive, `KW.knight.add()` reads them with
the same options and resolves the look again (see [Downloaded packs](#downloaded-packs)):

- **A `dev` page** (the repository's own, opened from disk or served straight from `web/`) accepts
  packs signed or unsigned. A `sig` a pack carries must verify all the same.
- **A deployed page** accepts a pack only when it carries a signature that verifies against a key
  in `KEYS`. It refuses an unsigned pack at the `signature` step (`sig: is missing, and this page
  accepts only signed packs`), and one whose signature does not verify or names a key it does not
  know.

**Today the base pack, version 1.2.0, ships signed with `kw1`,** so a deployed page draws the
knight from it. A base pack edited after signing has its signature taken off until the release
signs it again; meanwhile a deployed page draws the knight from the code in `knight.js`, the full
knight as it shipped before packs, which looks the same as the default look (see
[When packs fail](#when-packs-fail)). The sword and shield need the base pack: from code the
knight always holds the greatsword.

Nothing is drawn on screen about the choice. `knight.js` writes to the console one line for each
refused pack, and one line, `console.info` for the base pack and `console.warn` for code, each
time the source changes:

```
knightwatcher: the knight is drawn from the base pack kw.base 1.2.0, signed
knightwatcher: the knight is drawn from the base pack kw.base 1.2.0, unsigned
knightwatcher: the pack kw.base was refused at the signature step: sig: is missing, and this page accepts only signed packs
knightwatcher: the knight is drawn from code: the base pack kw.base was refused at the signature step
```

The reason in a refusal's line is cut to 120 characters, and the line about the source names the
step the base pack was refused at. `KW.knight.source` holds `'pack'` or `'code'`, and `KW.knight.status` holds `{ source, base, refused, fallbacks, note }`:

| Field | Holds |
|---|---|
| `base` | `{ id, version, signed }` of the base pack in use, or `null` |
| `refused` | `{ id, file, step, reason }` for every pack turned away, with the reason whole; see [When packs fail](#when-packs-fail) |
| `fallbacks` | what of the look took the base pack's default, as `resolve` reports it (see [Looks](#looks)) |
| `note` | the last line written about the source |

`start` makes a new status; `add` and a pack marked bad update that one in place, so the settings
screen's status panel can keep it and read it again. The knight is drawn from code when no base
pack is carried, when the base pack fails any step or is marked bad, when the pack library is
missing, and when the look's weapon has no grip the poses can hold, which the checks make
impossible: the poses hold a weapon in both hands at two stations or in one hand at one.

`start(texts, allowUnsigned, opts)` takes in `opts` a `look` to draw, and `keys`, which replaces
`KEYS` in `read()` and is for the tests only; the page passes neither.

### Downloaded packs

The collector (in stage 2) writes the packs it downloads into `data/packs/`, beside `state.json`,
with an index:

```json
{ "packs": ["kw-extra.pack.json", "plumes-1.pack.json"] }
```

| Rule | Limit |
|---|---|
| the index | a JSON object, at most 16 KiB; keys other than `packs` are ignored |
| `packs` | a list of at most 32 names |
| a name | a file name only, no path: lower-case letters, digits, `-` and `_`, dots between them but never two in a row, ending in `.pack.json`, at most 64 characters, listed once |

Served over HTTP, in every mode, the page fetches `data/packs/index.json` once at load, relative to
itself, and then every file it names from `data/packs/`, as text: never as script, never from
anywhere else, each with `cache: "no-store"`, no redirects followed, and the same four-second
cut-off as `state.json`. `KW.knight.fetchPacks(fetch)` does the fetching and `KW.knight.add()` the
reading, through the same `read()` as the carriers; `KW.knight.packIndex(value)` checks a parsed
index. A page opened from disk fetches nothing and shows the packs it ships with. A pack added later
shows when the page is next loaded, since a page reads the folder only once.

A missing index (a 404) means no packs and is silent. Everything else that goes wrong is a refusal
in the status:

| Step | When | `file` |
|---|---|---|
| `index` | the index cannot be fetched (`the server answered 500`, `no answer within four seconds`), is not JSON, or breaks a rule above as a whole; nothing else is fetched | `index.json` |
| `index` | one name breaks a rule; the other names are still fetched | the name, cut to 64 characters, or `null` when it is not a string |
| `fetch` | a named file is missing, cannot be fetched or is over 512 KiB | the name |
| a step of `read()` | the file is refused by the checks | the name, with `id` once the envelope gives one |

A downloaded pack with the base pack's id replaces the shipped one when its version is higher, as
`gather` does for any two packs with one id.

### When packs fail

The knight never vanishes. In order:

1. **A pack is refused.** It goes into `status.refused` as `{ id, file, step, reason }` and to the
   console once. `id` is the pack's id, or `null` when it could not be read; `file` is the
   downloaded file's name, or `null` for a pack that ships with the page; `step` is the step of
   the checks, `index` or `fetch` from the table above, `counts` when more than 32 packs are
   loaded, or `draw` for a pack marked bad (rule 4). Nothing on the wall changes, and the settings
   screen's status panel (not built yet) shows the list. A panel must show the entries as text.
2. **An item, swatch or build in the look is missing**, because its pack was refused, removed or
   never downloaded: that slot, set or build takes the base pack's default, as `resolve` does, and
   `status.fallbacks` says so. A shield in a look whose weapon is not one-handed, the greatsword
   included, falls back to no shield, with `used` null and the reason `a shield is carried only
   with a one-handed weapon`; it is then drawn nowhere, worn or at rest. This holds too when the
   one-handed weapon itself falls back to the greatsword.
3. **No base pack can be used.** The knight is drawn from code: the full knight as it shipped
   before packs, with the open helm, the red plume, the blue tabard and the greatsword, by
   `codeHD` in `knight.js`. The sleeper's head in the house is drawn by `bareHD`, and the gear at
   rest by code too: the helmet on the stool, the greatsword on the pegs and across the anvil, and
   the hot tip from the greatsword's blade. `rest.blade()` is `{ from: 34, to: 263, half: 15 }` and
   `rest.key()` is `'code'`. The code path has the greatsword only, as the owner decided: a look
   with the sword and shield is drawn with the greatsword, and no shield hangs anywhere. The reason is in the status and the console. Nothing plainer than this
   knight is ever drawn.
4. **A compiled list throws while drawing**, which the checks should make impossible. The throw is
   caught for that frame, and the packs that gave the list's slots are marked bad (the base pack
   only when no other pack gave any of them), refused at the `draw` step with the reason `the
   <list> list threw while drawing: <message>`. From the next frame the knight is drawn by the
   rules above without them. The same holds for the lists of the gear at rest and the sleeper's
   head. A throw in the engine's own drawing is not put down to a pack.

### Gear at rest

The house and the smithy show the knight's gear off the knight, and on the pack path they show
what the look equips: the helmet on the house's stool from the look's `restHelmet` list, the
weapon on the house's pegs and across the smithy's anvil from its `main` list, the same shapes the
knight holds, on a frame the scene fixes, and the shield, when one is equipped, on the house's wall
beside the pegs and the smithy's wall from its `restOff` list. The house places its two pegs from
the weapon's `blade`, 28 past where the blade starts and 45 short of its point, which keeps the
greatsword's pegs at 680 and 836; a weapon with no `blade` gets the greatsword's pegs. The smithy draws the hot tip of the blade from the
weapon's `blade`, and draws none for a weapon without one. A scene asks for each by the item's slot
in its own `paint` or `draw`, through `KW.knight.rest`, which draws from code on the code path, so
no scene looks at which path is in use:

```js
K.rest.draw('helmet', 460, 476);                // the house's draw: the helmet on the stool
K.rest.draw('main', 618, 228, Math.PI / 2);     // the house's paint: the weapon on the pegs
K.rest.draw('off', 844, 164);                   // the house's paint: the shield on the wall, from its nail
const b = K.rest.blade();                       // the smithy's draw: { from, to, half } or null
```

The house and the smithy paint the weapon and the shield into their cached backdrop, so their
backdrop keys carry `K.rest.key('main')`, the equipped weapon's name, and the shield's name when
one is equipped. [page.md](./page.md#gear-at-rest) has the places
each scene declares in its `rests` field, the numbers of the hot tip and the key.

## Tests

```bash
node --test tests/web/
```

`tests/web/pack.test.js` reads `tests/web/fixtures/base.pack.json`, a base-like pack, and signs it
with a key `node:crypto` generates for the run, verifying through `crypto.verify` and a canonical
form written separately in the test. It refuses one copy of the pack for each rule, with the rule
in the test's name and the exact reason it expects, refuses values of the wrong type, accepts each
limit at its edge, and feeds the reader hostile and mangled text. Scalars are refused at each end of their ranges, costs at the
limits and one past them, and the cost is checked against the calls `draw.js` makes with every
value at the ends of its range.
The source of `pack.js` is checked to hold neither `eval` nor `Function(`. The shipped `KEYS` is
checked to hold `kw1` alone, as the 32 bytes above, in a frozen table whose bytes cannot be changed
from outside, and a pack signed by any other key under `kw1` is refused against it.

`tests/web/ed25519.test.js` tests the verifier. It checks every Ed25519 vector of RFC 8032 section
7.1 with one bit changed in each part, and SHA-512 against the digests of RFC 6234 and against
`node:crypto`. It compares the verifier with `node:crypto` on 200 generated keys, their signatures
and one-bit changes to each. For each strictness case it builds signatures that satisfy the
cofactorless equation, using curve arithmetic written apart from the verifier, and requires them
refused. No such signature can be made for a non-canonical key or `R` that is not also of small
order, so the decoding is tested by itself against every encoding with `y` of `p` or more and 300
random ones. Wrong arguments, the fixture pack read through `pack.js` with this verifier in place,
and the same check of the source as for `pack.js` complete it. Under Node 26, `node:crypto` gave
the same answer as this verifier for every signature the tests put to both.

`tests/web/base-pack.test.js` checks the base pack, and holds whether it ships signed or not. An
unsigned copy (the shipped file with any `sig` taken off) is read on a `dev` page and refused at
the `signature` step otherwise; the file as it ships is read on every page when it carries a
signature, and on a `dev` page alone when it does not. It also checks one build with the present measurements, one item for each slot the
present drawing has, the arming sword and the heater shield, the three hair styles and nothing
more; six swatches in each set in the settings screen's order, today's the defaults; each item and
swatch equal to the fixture's, to `fixtures/base-onehand.items.json` for the one-handed items or to
`fixtures/base-options.json` for the free options, with the iris of the tabard and the shield,
worn and at rest, on `@tabard.3` and no `@base.b3` left; a default look that resolves with nothing
missing at a cost of 11 932; the look with the sword and shield resolving with nothing missing,
one-handed, at 119 shapes; and every one of the 7776 combinations of skin, hair colour, hair style,
tabard, plume and weapon resolving with nothing missing, the heaviest at 129 shapes and 12 524. `tests/web/knight.test.js` draws the
knight's 94 poses, the bare head in bed, the speech bubble, the gear at rest, and the house and the smithy painted and drawn, from the base
pack as the page does, and compares every call with the record taken from the code. It draws the
code path from the unsigned copy, which a deployed page always refuses, and edits only that copy, so
it too holds in either state. It checks that a deployed page draws from the shipped base pack when
it is signed and from code when it is not, and, with a key made for the run swapped into the
sandbox's `KEYS`, that a deployed page reads a signed base pack through `KW.ed25519.verify` and
draws from code when no verifier is loaded. It also checks
that a pack's colours reach the gear at rest, and that a helmet with no rest view and a weapon with
no `blade` show nothing there. It checks that the face takes the look's skin and hair colours and
that a deep skin with black hair, made for the test, leaves no colour of the warm skin in any
condition's face. With the sword and shield it checks the one-handed grip, the stance
and the attack, the free hand hanging when there is no shield, the change to `oneCrossed` in the
swing to the left, the pegs, the shield's places and the backdrop keys, and, frame by frame, that
no arm is drawn over a blade or a shield, in the swings, the attack and the goblin strike ([page.md](./page.md#the-knights-rig)). [page.md](./page.md#checks) describes it.

`tests/web/loading.test.js` checks loading and failure. For the index: its shape, more than 32
names, and names that carry a path or are not a pack file's. For the fetch, against a fake `fetch`:
a missing index is silent and asks for nothing else; an index that is not JSON, too large, answered
with an error, or not answered within four seconds is refused whole; a bad name is never asked
for; a file that is missing, fails, hangs or is too large is refused with its name; a file that
fails `read()` at the size, json, envelope, signature, format, fields or references step is refused
with its name and id. On a deployed page an unsigned downloaded pack and one signed by an unknown
kid or by the wrong key are refused, and one signed with a key made for the run and passed through
`keys` is read and drawn; a `dev` page reads the unsigned one. Each refusal is in the status and
written to the console once. A look naming a missing build, item or swatch falls back to the
base pack's defaults and draws what the default look draws; a one-handed weapon from another pack
is held in one hand; and a shield without one falls back to none, with its reason, and the knight
draws as the default knight does. With no base pack, a broken one, an unsigned one or one signed by an unknown kid on
a deployed page, no pack library, and after a throw inside the base pack's lists, the page draws
from code, and 28 records of the knight, the sleeper's head, the gear at rest, the house and the
smithy must equal, call for call, the records `knight.test.js` stores from the code. A throw
inside a downloaded pack's list, a list of the gear at rest or the sleeper's head is caught and
the right pack marked bad, and a throw in the engine's own drawing is not. `look()` draws a new look
from the packs already read, a signed downloaded pack's tabard included, keeps every refusal, says
nothing new in the console, and does nothing before `start()`, where `start()` again loses the
downloaded pack.

`tests/web/settings.test.js` draws the knight from the base pack, through the settings and
`KW.knight.look()`, in each of the 216 looks of weapon by skin by hair colour by hair style, the
tabard and the plume cycled through their six, standing, attacking and swinging, helmet on and off,
with the bare head and the gear at rest; each draws its colours with no throw, no fallback and no
refused pack, within the shape and cost caps. It also draws every monarch in every skin, hair and
robe of the base pack, each monarch's own hair and robe among them.
[page.md](./page.md#checks) lists the rest of what it checks.

```bash
node --test tests/tools/
```

`tests/tools/pack-carrier.test.js` checks the carriers against their pack files and the tool
itself.

`tests/tools/sign-pack.test.js` checks the signing tool with key pairs generated for the run and
held in memory; no key of any kind is in the repository, and the files signed are copies in a
temporary folder. A copy of the fixture pack is signed and must verify through `pack.js` and
`ed25519.js`, and through `node:crypto` on the bytes `message()` gives, with only the `sig` added to
the file and the carrier matching. An edit after signing must be refused until the pack is signed
again. The tool must refuse to run without its variable, with a key whose public half is not the
table's, with a key that is not Ed25519 and with a kid the table lacks, writing nothing and never
printing the key, and must write nothing when any one of several files is refused. `--unsign` must
give back the unsigned file byte for byte. Last, every pack in `web/packs/` that carries a `sig`
must verify against the shipped `KEYS` with the page's verifier.
