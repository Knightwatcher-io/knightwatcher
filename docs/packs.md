# Packs

A pack is one JSON file of shapes: the knight's gear, its builds, colour choices and scene
decorations. The engine draws a pack's shapes with the primitives of `draw.js` (`Rh`, `Rv`, `ell`,
`rrect`, `poly`, `strip`, `pix`), so a pack can say only what a drawing call can say, and nothing in
it runs.

`web/js/pack.js` is the library that reads packs. It checks a pack's text whole and either returns
the pack or refuses it with the step and the field at fault, turns a look into flat lists of
records, and draws a list by calling the primitives. It loads under Node for the tests in
`tests/web/pack.test.js`, like `state.js`.

The library is not yet wired into the page: `index.html` does not load it, and the knight is still
drawn by `knight.js`. Not built yet either: the engine's rig that fills the anchors each frame, the
script carriers for packs shipped with the page, fetching downloaded packs, the plain stand-in
figure drawn when there is no base pack, and drawing decorations into a scene's places.

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
| `sig` | `alg` `"ed25519"`, `kid` the name of a public key, `value` the signature in base64; see [Signing](#signing) |

No other key is allowed. A page may accept a pack with no `sig` only when it asks for that (see
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
| `off` | the off hand when it holds a shield | from the pose |
| `plume` | the plume's mount on the worn helmet | the helmet's `mounts.plume` from `head` |
| `rest` | where a scene sets down gear | from the scene |

In a part drawn for one side, `foot`, `hip`, `shoulder` and `hand` mean that side's anchor.

### Named values

A shape may lean on these names. All are whole numbers when the engine sets them.

| Name | Meaning |
|---|---|
| `drop` | how far the upper body sinks (bob and crouch), in pixels |
| `bloat` | how far each side swells when memory is tight, in pixels |
| `stepL`, `stepR` | 1 while that foot is lifted in the walk, else 0 |
| `step` | in a part drawn for one side, that side's step |
| `sway` | the plume's sway, -4 to 4 |
| `dShoulder`, `dChest`, `dWaist`, `dHip`, `dStance`, `dLeg`, `dHeight`, `dHead` | the build's differences from the present knight |

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

| Scalar | Range of the number or `c` |
|---|---|
| offsets (the x and y of points, clips, pivots, mounts, `hold`) | -512 to 512 |
| lengths `w`, `h` | 0 to 512 |
| radii `r`, `rx`, `ry` | 0 to 256 |
| strip half-widths `hw0`, `hw1` | 0 to 64 |

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
| `off` | `off` | the shield; drawn only with a one-handed weapon |
| `companion` | | reserved: an item of this slot is skipped unread |

The order of one frame, front to back reading down; the engine's own steps are in brackets.

1. [the crates, when carrying]
2. `back`, `legs`, `boots`, `torso`, each in the order its parts are written
3. the head group. Helmet on: hair's `helmeted` view, the plume, the helmet. Helmet off: the
   build's head item, the hair.
4. [the face], [the drumstick, in the feast]
5. `pauldrons`
6. the hands group, by grip mode (below)
7. [sweat, steam, the marks, the thought bubble, the progress bar, hearts, the speech bubble]

| Mode | Hands group |
|---|---|
| `none` | arm L, gauntlet L, arm R, gauntlet R |
| `hammer` | arm L, gauntlet L, arm R, [the hammer], gauntlet R |
| `twoR`, the two-handed blade leaning right | arm R, the weapon, arm L, gauntlet R, gauntlet L |
| `twoL`, leaning left | arm L, the weapon, arm R, gauntlet L, gauntlet R |
| `one`, one-handed | arm L, gauntlet L, the shield, arm R, the weapon, gauntlet R |
| `oneCrossed`, the sword hand across the middle | arm R, the weapon, gauntlet R, arm L, gauntlet L, the shield |

In the two-handed modes the arm on the lean side reaches the upper hand, so the engine puts the
upper hand on that side's hand anchor. The one-handed orders hold the sword in the right hand.

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
hand.

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
  and framed points in the frame's own terms. `dir` is `rows`, `cols` or `frame`; `frame` fills by
  columns when the weapon lies nearer horizontal than vertical, and is allowed only in `main`.
- `pix` gives the shape row by row: 1 to 64 rows of equal length, 1 to 64 printable ASCII
  characters each, `.` for clear and any other character a key of `key`. `key` maps 1 to 16 single
  characters to single colours.

### The face

The engine draws the face (eyes, brows, cheeks, mouth, the thermometer) after the head group, at
fixed offsets from `head`, so no helmet can cover it. A helmet must also show skin there: it needs a
`rect`, `rrect` or `ell` filled with exactly `@skin.face`, placed by a pair, whose box holds the
face box, `x` from -28 to 28 and `y` from -20 to 20 around `head`. The box is `[x, x + w]` by
`[y, y + h]` (centre plus and minus the radii for an ellipse), cut by any clip. It must hold for
every build in range and every sway, so the shape may lean on the build's differences and `sway`
but on no other name.

### Rest views

Gear the scenes show off the knight (the helmet on a stool, the shield on a wall) has a rest view,
hung on the `rest` anchor that the scene places.

| Field | Rule |
|---|---|
| `fits` | `hang`, `surface` or `floor` |
| `box` | `[w, h]`, whole numbers from 1 to 240: the space it needs from its anchor |
| `mounts` | helmet only: `{"plume": pair}`, where the plume's rest view hangs |
| `shapes` | 1 to 64 shapes, with no `at` of their own |

A plume's rest view has `shapes` only, and is drawn at the helmet's rest mount. A weapon needs no
rest view: a scene draws its worn shapes on a frame of its own.

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
| `envelope` | the envelope's three fields |
| `signature` | the signature, against the key named by `kid` |
| `format` | `format` is `[1, 0]` |
| `fields` | every field against its table, with no unknown keys outside `ext` and `companions`: types, ranges, multiples of 1/8, id patterns, text lengths, rising band fractions, and the counts the tables give |
| `references` | every `@set.entry` exists and is the right kind, every anchor is one the slot allows, every named value is on the list and allowed where it is, every `g` is a declared group, every palette track names a hex entry of the pack's own palettes, each build's head item exists with slot `head`, and every default exists |
| `rules` | `provides` matches the sections, `arms` and `gauntlets` have one part for each side, each helmet passes the face check, each grip has as many stations as its kind, each blade's `from` is below its `to`, each polygon is convex, each decoration's box is at most 240 by 240, no two tracks drive one thing |
| `counts` | the per-pack counts below, and that the base pack's default look draws at most 1200 shapes |
| `compile` | every item and decoration compiles |

A refusal is `{ ok: false, step, reason, id }`. The reason names the field at fault as a path,
such as `pack.items["helm.open"].parts[0].shapes[8].p[0]: must be a multiple of 1/8 from -512 to
512`, and `id` is the pack's id when it could be read. The reader never throws, whatever it is
given.

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

The depth of 12 is the deepest a valid pack can nest: a term inside a point of a polygon in hair's
`helmeted` view, or a translucent colour in one of its band lists.

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
ships empty, so until a key is added there no signed pack is accepted unless the caller passes
keys of its own. The check itself is done by a verifier `verify(publicKey, message, signature)`
that returns `true` for a good signature: the one the caller passes, or `KW.ed25519.verify` when a
script has defined it, as `web/js/ed25519.js` does (see [The verifier](#the-verifier)). A verifier
that is missing, throws or answers anything but `true` refuses the pack.

With `allowUnsigned`, meant for a page whose version is `dev`, a pack with no `sig` is accepted
and marked `signed: false`. A pack that does carry a `sig` is checked the same way on every page,
and refused if the key is unknown or the signature fails.

### The verifier

`web/js/ed25519.js` defines `KW.ed25519.verify(publicKey, message, signature)`, and exports the
same object under Node. The page needs a verifier of its own because `crypto.subtle` is missing on
a page served over plain HTTP. `index.html` does not load the file yet.

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
| `over the 1200-shape cap` | dropped to bring the look under the cap |

`back` and `off` have no default unless the base pack names one; a look that leaves them out
draws nothing there and reports nothing.

**The shape cap.** The most a look may draw for the knight in one frame is 1200 shapes, counted
as the body, the larger of the two head groups, the pauldrons, both arms and gauntlets, and the
weapon, with the shield only when the grip is one-handed. A look over it falls back slot by slot,
in the order `back`, `legs`, `boots`, `torso`, `hair`, `plume`, `helmet`, `pauldrons`, `arms`,
`gauntlets`, `main`, `off` and then the build, skipping slots already at their default, until it
fits. The base pack's own default look must fit, so the fallback always ends.

With no base pack loaded, `resolve` returns `{ ok: false, reason: 'no base pack' }`, and the caller
draws its stand-in.

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
| `restHelmet` | the helmet's rest view, with the plume's rest view on its mount |
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
and requires every fill to equal what `knight.js` draws, pixel for pixel.

## The library

`KW.pack` in the browser, and `module.exports` under Node.

| Function | Returns |
|---|---|
| `read(text, opts)` | the loaded pack, or `{ ok: false, step, reason, id }` |
| `canonical(value)` | the canonical form, as a string; throws a `TypeError` on anything JSON cannot hold |
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
own, swatches, decorations }`, where `data` is the pack as read, `own` its palettes resolved,
`swatches` its swatches resolved and `decorations` each decoration's groups and compiled keyframes.

`gather` keeps the higher `version` of two packs with one id (the first of two equal ones) and at
most 32 packs, refusing the rest with step `counts`. `resolve` accepts its result, a `Map` or an
array of loaded packs.

A resolved look is `{ ok: true, look, fallbacks, ignored, m, diffs, colours, grip, blade, plumeShown,
shapes, lists }`: `look` names what is drawn, `m` and `diffs` are the build's measurements and
differences, `colours` holds the skin's `face`, `sick`, `hot`, `cheek` and `puff` and the hair's
`brow` for the engine's face, and `shapes` is the count against the cap.

Constants: `FORMAT`, `PREFIX`, `BASE_ID`, `LIMITS`, `STEPS`, `SLOTS`, `ANCHORS`, `ANCHOR`,
`FRAME_SX`, `FRAME_SY`, `VALUES`, `VALUE`, `MEASURES`, `BASE`, `KEYS`, `ORDERS`.

## Tests

```bash
node --test tests/web/
```

`tests/web/pack.test.js` reads `tests/web/fixtures/base.pack.json`, a base-like pack, and signs it
with a key `node:crypto` generates for the run, verifying through `crypto.verify` and a canonical
form written separately in the test. It refuses one copy of the pack for each rule, with the rule
in the test's name, accepts each limit at its edge, and feeds the reader hostile and mangled text.
The source of `pack.js` is checked to hold neither `eval` nor `Function(`.

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
