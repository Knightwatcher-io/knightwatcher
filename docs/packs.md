# Packs

A pack is one JSON file of shapes: the watcher's gear, its builds, colour choices and scene
decorations, and, from format 1.1, a world's scenes, cast, devices, words, overlay and presets.
The engine draws a pack's shapes with the primitives of `draw.js` (`Rh`, `Rv`, `ell`, `rrect`,
`poly`, `strip`, `pix`), so a pack can say only what a drawing call can say, and nothing in it runs.

This page is for anyone making a pack. It describes format 1.0 as the library implements it: the
file, the pack's fields, colours, builds, the rig the items hang on, the slots, items and
decorations; then the checks every pack passes and how a pack is signed, which hold for formats 1.1
and 1.2 too. The world sections that format 1.1 adds are in [worlds.md](./worlds.md), with the
scenes in [scenes.md](./scenes.md) and the cast and the devices in [cast.md](./cast.md). The fields
format 1.2 adds to a weapon are in [Weapons that fire](#weapons-that-fire), and what else 1.2 adds
in [Format 1.2](./worlds.md#format-12).

`web/js/pack.js` is the library that reads packs. It checks a pack's text whole and either returns
the pack or refuses it with the step and the field at fault, turns a look into flat lists of
records, and draws a list by calling the primitives. It loads under Node for the tests in
`tests/web/pack.test.js`, like `state.js`. How the page uses it, the base pack the page ships with,
and what the page draws when a pack is refused, are in [library.md](./library.md).

The page draws the knight, the medieval world's watcher, from the base pack,
`web/packs/base.pack.json`, wherever it can use it, and otherwise from the code in `knight.js`,
which draws the same knight; the scenes' gear at rest follows it in the same way
([library.md](./library.md#on-the-page)). The settings screen chooses the look from the loaded packs
and shows which packs were refused ([display.md](./display.md#settings)). Nothing draws a
decoration: a decoration's fields and shapes are checked and its cost counted, but only its
keyframes are compiled; its shapes are not.

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
`allowUnsigned` under [The library](./library.md#the-library)).

## The pack

| Field | Type | Rule |
|---|---|---|
| `id` | string | `^[a-z][a-z0-9-]{1,31}(\.[a-z0-9-]{1,31}){0,3}$`, such as `kw.base` |
| `name` | string | 1 to 48 characters, one line |
| `version` | string | `major.minor.patch`, each 0 to 999, no leading zeros |
| `format` | `[1, minor]` | the minor no higher than the engine's, which is 2: `[1, 0]`, `[1, 1]` or `[1, 2]` |
| `licence` | string | 1 to 200 characters, one line |
| `provides` | array | each of `builds`, `items`, `palettes`, `swatches`, `decorations` (and in 1.1 `scenes`, `cast`, `props`, `words`, `overlays`, `worlds`, `sounds`, `stamps`) at most once: exactly the sections that are present and not empty |
| `palettes` | object | the pack's own colour sets |
| `swatches` | object | choices for the user's colour sets |
| `builds` | object | body shapes; the base pack only in 1.0, any pack in 1.1 |
| `defaults` | object | the default look; the base pack only |
| `items` | object | the gear |
| `decorations` | object | things a scene may show in its places |
| `companions` | object | reserved: checked to be an object, signed, never read |
| `ext` | object | for experiments: checked to be an object, signed, never read |
| the 1.1 sections | object | format 1.1 only; see [Format 1.1](./worlds.md#format-11) |

Any other key is refused, and so is a 1.1 section in a pack of format `[1, 0]`. A section may be absent or empty; an empty one is not listed in
`provides`. Characters are counted as Unicode code points, and "one line" means no control
characters and no line or paragraph separators.

The ids of builds, items, swatches, decorations and decoration groups are local to the pack and
match `^[a-z][a-z0-9.-]{0,47}$`. From outside the pack a thing is named `<pack id>/<local id>`.

**The base pack** is the pack whose id is `kw.base`. It must carry `builds` and `defaults`, and only
it may carry `defaults`. In format 1.0 only it may carry `builds` either; in 1.1 any pack may, as a
world's own bodies, though a look still takes its build from the base pack. Every look falls back on
it.

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
| `m` | all eight measurements, whole numbers within their ranges, and the torso, `height` less `leg`, from 46 to 74 |
| `head` | the id of an item of this pack whose slot is `head`: the bare skull the build wears |

Up to 4 builds. The torso rule holds a build to a plausible shape: `height` and `leg` each have a
range of their own, which alone would allow a shoulder line from 10 to 100 above the hip line, and
the tabard of a build with a long leg and a short height would leave one row between the neck and
the belt. The present knight's torso is 58. `TORSO` in `pack.js` holds the two ends, and the
`rules` step checks it.

**The head's size.** The range allows `head` from 42 to 60, but the base pack's one head item,
`head.plain`, has no term on `dHead`, while the open helm and the tied and curled hair do: a build
with a head other than 51 would draw the same skull under hair and a helmet grown or shrunk around
it, and the face, which the engine draws at one size, would crowd the ears on a smaller skull. So
every build of the base pack keeps 51. A build with another head needs `head.plain` to lean on
`dHead` first, or the range narrowed until a second head item exists.

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
[Looks](./library.md#looks). The base pack's default plume must fit its default helmet at every build.

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
| `off` | `off` | the shield; carried only with a one-handed weapon (see [Fallbacks](./library.md#when-packs-fail)) |
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
swung and raised the same way, whatever its length. [rig.md](./rig.md#anchors-values-and-poses) gives the
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

No other field is allowed on an item of a given slot, except that a `main` item in a pack of format
1.2 may carry the fields of [Weapons that fire](#weapons-that-fire). An item fits every build.

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
  `key`. `key` maps 1 to 24 single characters, each from `!` to `~` and not `.`, to single
  colours. A shape of a world section may give its rows in runs instead
  ([Format 1.1](./scenes.md#shapes-coordinates-and-terms)).

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
blade lies along that frame, for the smithy's hot tip. The engine also plans the goblin's strike
from it: the blade's outline, 4 pixels along each edge beyond `half` and a little more at the point,
is how far the weapon reaches. A weapon whose drawing is wider than that outline beyond the
blade's middle, by a pixel or more, has a head the outline does not describe, and the engine
measures its drawing instead, the shapes of its `main` list past the hand
([rig.md](./rig.md#anchors-values-and-poses)). No field asks for it: the drawing decides.

The page shows three rest views (the helmet, its plume and the shield) and one weapon at rest; see
[Gear at rest](./library.md#gear-at-rest). `fits` and `box` are checked, and a scene from a world pack draws the
view only in a place of that kind with room for the box (`KW.knight.rest.fits`); the code scenes
draw what they always drew. The base pack's shield fits `hang`: its rest view hangs it by a strap
from a nail at the rest anchor, the top middle of the place.

## Weapons that fire

Format 1.2 lets a `main` item fire: a pack of format `[1, 2]` may give a weapon these fields, and
a pack of format 1.0 or 1.1 that gives any of them is refused at `fields` (`is not a field here`).
An item with none of them is swung, as every weapon of 1.0 is, and reads, resolves and draws
exactly as before.

```json
"main.blaster": {
  "slot": "main", "name": "Blaster", "use": "fire",
  "grip": { "kind": "one", "hands": [0] },
  "barrel": { "from": 22, "to": 64, "half": 7 },
  "muzzle": { "s": 64, "p": 0 },
  "range": 420,
  "shot": { "kind": "bolt", "colour": "#7af0ff", "flash": "#fff3a0" },
  "stowed": { "layer": "body", "parts": [ { "at": "hipR", "shapes": [
    { "k": "rrect", "p": [4, -8], "w": 20, "h": 38, "r": 5, "fill": "@base.k" } ] } ] },
  "parts": [ { "at": "main", "shapes": ["..."] } ]
}
```

| Field | Rule |
|---|---|
| `use` | `"swing"`, `"fire"` or `"both"`; left out, `"swing"` |
| `barrel` | `{"from", "to", "half"}` in frame units, as `blade` is, `from` below `to`: the part of the weapon no arm may cross, forward of the front hand |
| `muzzle` | `{"s", "p"}`, a point on the frame where the shot leaves and the flash shows: `s` from the barrel's `from` to its `to`, `p` within its `half` either side |
| `range` | a whole number from 200 to 640: the farthest a shot is drawn |
| `shot` | `{"kind", "colour", "flash"}`: `kind` one of `bolt` (a short streak that flies), `tracer` (a line from the muzzle that fades) or `beam` (a line drawn at once, for a moment); `colour` and `flash` hex colours, `flash` optional |
| `stowed` | `{"layer", "parts"}`, optional, on any weapon: the weapon put away on the body, `layer` `back` (slung, drawn with the `back` slot) or `body` (holstered, drawn after the `torso`); 1 to 16 parts hung on `neck`, `hipL`, `hipR`, or `hip` with a side, with no framed point |

What each use must give is checked at `rules`:

| `use` | Means | Must give | May not give |
|---|---|---|---|
| `"swing"`, or none | held and swung | nothing more; a `blade` gives its reach, as in 1.0 | `barrel`, `muzzle`, `range`, `shot` |
| `"fire"` | held and fired | `barrel`, `muzzle`, `range`, `shot` | |
| `"both"` | swung or fired, the engine choosing which | `barrel`, `muzzle`, `range`, `shot` and `blade` | |

A shot with no `flash` shows the engine's pale snap at the muzzle. The burst where a shot lands is
the engine's, the same cartoon burst a blade's blow makes, and the shot's motion is the engine's
too: a pack says what the weapon looks like, where its barrel lies, how far it shoots and in what
colours, and the engine holds it, aims it and fires it
([rig.md](./rig.md#aiming-and-firing), [scenes.md](./scenes.md#the-effects)).

The stowed view counts toward its item's 400 shapes and 8 000 fills with the parts, and a look
counts the larger of the weapon and its stowed view toward the knight's caps, since the two are
never drawn in one frame. The grip is `two` or `one`, as in 1.0, and a one-handed weapon that fires
may go with a shield as a one-handed blade does. A two-handed weapon that fires is held with its
rear hand at its frame's origin under the shoulder and its front hand further along: the front
station must sit far enough back that its gauntlet stays behind the barrel's `from`, the trial
crossbow's 38 against a barrel from 54. Aimed to the left, a weapon that fires is drawn turned over
its frame's line, so a weapon drawn from the side keeps its stock below and its sight on top either
way.

The engine has the aiming stances, `fire()` and the four shot effects, and resolves a weapon's
fields; no act aims, fires or stows a weapon yet, so a weapon that fires is held and swung as a
blade is until those acts are built.

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
refused whole. For a pack of format 1.1 each step from `fields` to `counts` also checks the world
sections, as [Format 1.1](./worlds.md#format-11) sets out, and `compile` compiles nothing of them.

| Step | What it checks |
|---|---|
| `size` | the input is text of at most 512 KiB, counted in UTF-8 bytes |
| `json` | nesting no deeper than 12 and no key twice in one object, checked on the raw text before parsing; then `JSON.parse`; then every number finite, below 1,000,000 in size and with at most 3 decimals, every string and key free of unpaired surrogates, and no key `__proto__`, `constructor` or `prototype` anywhere, `ext` and `companions` included |
| `envelope` | the file holds a JSON object; `kwpack` is 1 and `pack` an object, both present; `sig`, when present, is an object; no other key |
| `signature` | the signature, against the key named by `kid` |
| `format` | `format` is `[1, 0]`, `[1, 1]` or `[1, 2]` |
| `fields` | every field against its table, with no unknown keys outside `ext` and `companions`: types, ranges, multiples of 1/8, id patterns, text lengths, rising band fractions, and the counts the tables give |
| `references` | every `@set.entry` exists and is the right kind, every anchor is one the slot allows (a stowed view's one of `neck`, `hipL`, `hipR` and `hip`), every named value is on the list and allowed where it is, `dir: "frame"` appears only in a part of a `main` item, every `g` is a declared group, every palette track names a hex entry of the pack's own palettes, each build's head item exists with slot `head`, and every default exists |
| `rules` | `provides` matches the sections, each build's torso (`height` less `leg`) is 46 to 74, `arms` and `gauntlets` have one part for each side, each helmet passes the face check, each grip has as many stations as its kind, each blade's and barrel's `from` is below its `to`, each weapon gives what its `use` asks and its muzzle lies on its barrel, every scalar stays in its range at both ends (folded where something is folded in), each polygon is convex with no point repeated, each decoration's box is at most 240 by 240, no two tracks drive one thing |
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
| shapes per item, its parts, views, rest view and stowed view together | 400 |
| points per `poly` | 16 |
| `pix` | 64 by 64, 4096 pixels per shape, 160 000 per pack (counted as width times height, rows in runs as they expand) |
| `pix` keys | 24 |
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

The cost is a bound, not a count, worked out at the ends of every value's range, so it is the same
on every build. The default look costs 13 878 in its heaviest mode (the greatsword, helmet on):
7506 for the legs, boots, tabard, pauldrons, arms and gauntlets, 1720 for the plume and helmet,
and 4652 for the greatsword. The body items cost 1946 more than before the three builds (5560 in
1.2.0), since the tabard's outline and cloth are four pieces each and the greaves and pauldrons
grow with the build. Drawn through `draw.js` the present knight makes between about 5800 and 6500
calls in the poses measured, the face included, as before. With the helmet off the head group
costs 1632; with the sword put away, or at the anvil, the greatsword's 4652 drops out. The look
with the sword and shield costs 13 981 and draws up to about 7000 calls, the attack the
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
(`keys` under [The library](./library.md#the-library)). The check itself is done by a verifier `verify(publicKey, message, signature)`
that returns `true` for a good signature: the one the caller passes, or `KW.ed25519.verify` when a
script has defined it, as `web/js/ed25519.js` does (see [The verifier](./library.md#the-verifier)). A verifier
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
