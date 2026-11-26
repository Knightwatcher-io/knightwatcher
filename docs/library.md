# The pack library

For contributors: `web/js/pack.js`, the library that reads packs, and how the page loads the packs
it ships with and the downloaded ones. It covers looks and the lists they compile to, the library's
functions, the signature verifier, the base pack and the medieval world's pack as shipped, the
carriers, where the knight is drawn from, and what happens when a pack fails. The format a pack is
written in is in [packs.md](./packs.md) and [worlds.md](./worlds.md); how the page reads a world's
scenes, cast and words is in [world-loading.md](./world-loading.md).

## Looks

A look says what the knight wears:

```json
{ "build": "kw.base/build.b",
  "items": { "helmet": "kw.extra/helm.round", "hair": "kw.base/hair.long" },
  "swatches": { "tabard": "kw.extra/red" } }
```

Every name is `<pack id>/<local id>`. A build comes from any loaded pack that carries it (from
format 1.1 any pack may), with that build's own head item; the base pack's default build is the
fallback. `items` takes the slots
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
head groups, the pauldrons, both arms and gauntlets, and the weapon or its stowed view (format 1.2),
whichever is larger, with the shield only when the grip is one-handed.

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
| `bodyStowed` | only for a weapon with a `stowed` view (format 1.2): `body` with the view drawn after `back` when its layer is `back`, after `torso` when it is `body` |

`sequence(mode, helmet)` returns the order of one frame for a grip mode as names: these lists and
the engine's steps `crates`, `face`, `drumstick`, `hammer` and `effects`. The modes are `none`,
`hammer` (the smith's tool in the right hand: `armL`, `gauntL`, `armR`, the step `hammer`,
`gauntR`), `tool2` (the smith's tool in both hands, the tongs or the bellows' handle: `armL`, `armR`,
`hammer`, `gauntL`, `gauntR`), `twoR`, `twoL`, `one` and `oneCrossed`. The order of the hands group
is the library's code, not a pack's data, so `tool2` needs nothing of a pack.

`draw(list, anchors, values, prims, face)` walks a list and calls the primitives, allocating
nothing of its own. `anchors` holds the x and y of each anchor in the order of `ANCHORS` (`root`,
`footL`, `footR`, `hipL`, `hipR`, `hem`, `belt`, `neck`, `shoulderL`, `shoulderR`, `head`, `handL`,
`handR`, `main`, `off`, `rest`), then the frame's `sin(a)` and `-cos(a)` at `FRAME_SX` and
`FRAME_SY`, and its flip at `FRAME_FL`: 1 draws every framed point's `p` as `-p`, which the knight
sets while a weapon that fires is aimed to the left, and 0, as `newAnchors()` makes it, draws as
always. `newAnchors()` makes one. `values` holds `drop`, `bloat`, `stepL`, `stepR` and `sway`
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
own, swatches, decorations, sums }`, with `world` after them for a pack of format 1.1, where `data` is the pack as read, `own` its palettes resolved,
`swatches` its swatches resolved, `decorations` each decoration's groups, compiled keyframes and
`cost`, and `sums` each item's shapes and cost as `{ parts, view, rest }`, each `{ n, cost }`, with
`stowed` after them for a weapon that has a stowed view (format 1.2).
`world` holds what the counts step found for the world sections: `{ scenes, cast, props, stamps }`
(see [Costs and limits](./worlds.md#costs-and-limits)); the sections themselves are in `data`.

`gather` keeps the higher `version` of two packs with one id (the first of two equal ones) and at
most 32 packs, refusing the rest with step `counts`. The base pack is always among the 32: it is
taken first, and the cap turns away the last of the others. `resolve` accepts its result, a `Map` or an
array of loaded packs.

A resolved look is `{ ok: true, look, fallbacks, ignored, m, diffs, colours, grip, blade, plumeShown,
shapes, cost, lists }`: `look` names what is drawn, `m` and `diffs` are the build's measurements and
differences, `colours` holds the skin's `face`, `sick`, `hot`, `cheek` and `puff` and the hair's
`brow` for the engine's face (the half-closed eyes' lid takes the middle band of the ramp in use,
the cheeks, the puffed cheeks and the brows the three colours), and `shapes` and `cost` are the counts against the caps.
For a weapon that fires, one whose `use` is `fire` or `both` (format 1.2), the look also gives
`use`, `barrel`, `muzzle`, `range` and `shot` as the item has them and `stowed`, whether it has a
stowed view, after `lists`; a weapon that only swings adds none of them, so it resolves exactly as
before. The lists are the same for either: no list holds the stowed view yet.

`animate(decoration, t)` takes a `t` that is not a finite number, or is negative, as 0, and returns
finite values and well-formed colours for every `t`.

Constants: `FORMAT` (`[1, 4]`), `PREFIX`, `BASE_ID`, `LIMITS`, `ANCHOR_SPAN`, `RANGE`, `STEPS`, `SLOTS`,
`ANCHORS`, `ANCHOR`, `FRAME_SX`, `FRAME_SY`, `FRAME_FL`, `VALUES`, `VALUE`, `MEASURES`, `TORSO`, `BASE`, `KEYS`,
`ORDERS`, for format 1.1 `WORLD_LIMITS`, `WORLD_LISTS` (the closed lists: conditions, round acts,
hosts, predicates, marks, triggers, effects, roles, exits, foe poses, fonts, device kinds and their
classes and boxes, labels, placeholders and the status colours' bands; and for format 1.4 the round
acts and the quiet conditions it adds, the taller class boxes, the television's stands and box, the
watcher's boots and the floor line), `SCENE_RANGE` and `ACT_RANGE`
(with format 1.3's `pump`), and for format 1.2 `FIRE_LISTS` (a weapon's uses, the shot kinds, the stowed view's layers and anchors, and
the foe's pose `aim`).

## The verifier

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

## On the page

### The base pack

`web/packs/base.pack.json` is the base pack the page ships with: id `kw.base`, version 1.6.0,
format `[1, 2]`, which a weapon that fires needs ([packs.md](./packs.md#weapons-that-fire)).
Whether it ships signed is said under [Where the knight is drawn from](#where-the-knight-is-drawn-from). It holds the present knight, two more builds, the free one-handed sword and shield, the free options every user may choose (skin tone, hair colour, hair style, tabard colour and plume colour), the free items of 1.4.0 (two or three more in every slot a user chooses), the crossbow of 1.5.0, the hair of 1.6.0 (every style redrawn and the buzzcut), and nothing the display does not draw:

- three builds, new in 1.3.0 but for the first, each with the plain head, named as the settings
  screen shows them (differences from Classic in brackets):

  | Build | Name | shoulder | chest | waist | hip | stance | leg | height | head | torso |
  |---|---|---|---|---|---|---|---|---|---|---|
  | `build.a` | Classic, the present knight | 54 | 46 | 46 | 46 | 24 | 74 | 132 | 51 | 58 |
  | `build.b` | Broad | 62 (+8) | 54 (+8) | 48 (+2) | 42 (-4) | 24 | 80 (+6) | 142 (+10) | 51 | 62 |
  | `build.c` | Slim | 47 (-7) | 40 (-6) | 34 (-12) | 47 (+1) | 24 | 72 (-2) | 126 (-6) | 51 | 54 |

  Broad is wider at the shoulders and chest, narrower at the hem and 10 taller; Slim is narrower
  at the shoulders, has a waist, a hem a little wider than the present knight's, and stands 6
  shorter. Every measurement lies at least 6 from either end of its range, and every head is 51
  (see [the head's size](./packs.md#builds-and-defaults)). The top of the helmet stands 274 above the ground
  on Classic, 284 on Broad and 268 on Slim, and the tabard runs 98, 102 and 94 from the neck to the
  hem. Version 1.3.0 named the first build "Classic", where it was "Knight of the watch";
- eleven items, one for each slot the present drawing has: `legs.plate`, `boots.leather`,
  `torso.tabard`, `head.plain`, `hair.short`, `helm.open`, `plume.crest`, `pauldrons.plate`,
  `arms.plate`, `gauntlets.plate` and `main.greatsword`;
- two more, new in 1.1.0: `main.arming`, an arming sword held in one hand (grip `{"kind": "one",
  "hands": [0]}`, blade `{"from": 34, "to": 175, "half": 10}`, 22 shapes), and `off.heater`, a
  heater shield (hold `[0, -6]`, face `[-44, -44, 88, 110]`, 20 shapes worn and 26 in its rest
  view, which hangs it from a nail). The shield's field is painted in the tabard's four colours
  (`@tabard.0` to `@tabard.3`, in the tabard's own bands), so it follows the tabard swatch;
- two hair styles, new in 1.2.0 and redrawn in 1.6.0 (below): `hair.tied` ("Tied back"), swept back
  from the face and gathered into a tail that falls behind the left ear (the viewer's left, clear
  of the greatsword), with a `helmeted` view in which the tail shows below the helmet; and
  `hair.curls` ("Curls"), a round crown of curls with no `helmeted` view, since none of it shows
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
- 25 free items, new in 1.4.0, so that every slot a user chooses has three to five free choices.
  Their ids, names, shapes and costs (each item's own,
  worn, viewed and at rest together, against 400 shapes and 8000):

  | Slot | Item | Name | Shapes | Cost |
  |---|---|---|---|---|
  | `main` | `main.longsword` | Longsword, two hands (`hands` [2, -30], `blade` `{"from": 34, "to": 222, "half": 11}`) | 24 | 4 687 |
  | | `main.mace` | Flanged mace, one hand (`hands` [0], `blade` `{"from": 34, "to": 136, "half": 16}`) | 19 | 3 853 |
  | `off` | `off.round` | Round shield (hold `[0, 0]`, face `[-44, -44, 88, 88]`) | 56 | 2 348 |
  | | `off.kite` | Kite shield (hold `[0, -14]`, face `[-36, -44, 72, 132]`) | 42 | 3 074 |
  | `helmet` | `helm.kettle` | Kettle hat (plume mount `[2, -88]`) | 41 | 2 034 |
  | | `helm.coif` | Mail coif (no plume mount) | 46 | 1 754 |
  | | `helm.bascinet` | Bascinet (plume mount `[2, -98]`) | 37 | 2 078 |
  | `plume` | `plume.feather` | Tall feather | 29 | 1 157 |
  | | `plume.horsehair` | Horsehair | 21 | 841 |
  | `torso` | `torso.cuirass` | Breastplate | 29 | 4 641 |
  | | `torso.gambeson` | Quilted gambeson | 32 | 2 596 |
  | `pauldrons` | `pauldrons.lames` | Layered spaulders | 18 | 969 |
  | | `pauldrons.leather` | Leather pauldrons | 12 | 589 |
  | `arms` | `arms.mail` | Mail sleeves | 6 | 4 156 |
  | | `arms.padded` | Padded sleeves | 6 | 4 154 |
  | `gauntlets` | `gauntlets.leather` | Leather gloves | 8 | 168 |
  | | `gauntlets.mail` | Mail mittens | 12 | 188 |
  | `legs` | `legs.mail` | Mail chausses | 22 | 701 |
  | | `legs.hose` | Padded hose | 10 | 598 |
  | `boots` | `boots.sabatons` | Sabatons | 10 | 250 |
  | | `boots.shoes` | Turnshoes | 12 | 260 |
  | `back` | `back.cloak` | Long cloak | 6 | 1 110 |
  | | `back.cape` | Short cape | 6 | 748 |
  | `hair` | `hair.long` | Long, with a `helmeted` view (as redrawn in 1.6.0, below) | 49 | 3 434 |
  | | `hair.close` | Close crop (as redrawn in 1.6.0, below) | 36 | 471 |

  Each is one drawing for all three builds, fitted as the base pack's own items are: every width
  that meets the body leans on `dShoulder`, `dChest`, `dWaist`, `dHip`, `dLeg` or `dHeight` and on
  `bloat`, and the breastplate and the gambeson are laid on the tabard's four-piece outline, so they
  taper on Broad and Slim as the tabard does. Cloth takes the user's colours, with no colour set of
  its own: the fields of the round and kite shields, the coat under the breastplate, the gambeson,
  the padded sleeves and the short cape take `@tabard`, and the long cloak and the two plumes
  `@plume`. The mail coif has no `mounts`, so no plume is drawn with it (`plumeShown` is false) and
  the settings screen greys the plume while it is worn ([display.md](./display.md#the-settings-screen)).
  The mace's `blade` names its haft and head, so the smithy heats the head as it heats a blade and
  the house's pegs sit under it. Its flanges are wider than that blade's outline, so the goblin is
  met by the mace's drawing rather than by its `blade`: the flanges, the ball and the knob, on a
  haft 7 across ([rig.md](./rig.md#anchors-values-and-poses)). The longsword's two stations are the greatsword's and the mace's
  one is the arming sword's, so each is held exactly where those are;
- the crossbow, new in 1.5.0, `main.crossbow` ("Crossbow"), the fifth free weapon and the one that
  fires: a wooden crossbow drawn from above, the same on both sides of its line, with an ash tiller
  and two iron bands, a steel prod, a ring stirrup at the nose, a bolt in the groove and a gold nut.
  Its fields are those of [Weapons that fire](./packs.md#weapons-that-fire): `use` `"fire"`, held in
  two hands (`hands` [38, 0], the front hand 38 along the frame and the rear at its origin),
  `barrel` `{"from": 54, "to": 96, "half": 8}`, `muzzle` `{"s": 96, "p": 0}`, `range` 420, and a
  `bolt` shot in pale ash, `#d9b77a`, with no flash of its own, so the engine's pale snap shows at
  the muzzle. Its `stowed` view, on the `back` layer, slings it across the back from the left
  shoulder to the right hip while it is put away. It has no `blade`, so the house's pegs sit under
  its barrel and the smithy's anvil shows no hot tip. 33 shapes held at a cost of 4 670, and 12
  slung at 1 639, 45 at 6 309 together; a look counts the larger. It is
  kept as designed in `tests/web/fixtures/base-crossbow.json`.
  The settings call it `crossbow`, and it carries no shield;
- the hair of 1.6.0: every style redrawn with more detail, each keeping its silhouette, and a sixth,
  the buzzcut, `hair.buzz` ("Buzzcut"). Each is shaded in the hair swatch's three bands lit from the left, with locks or strands, a sheen
  of the light band on the lit side, a glint (the one colour of its own, white at 0.4) and a
  hairline where the hair meets the forehead; the tie of the tied hair is the base palette's
  leather. Shapes and costs, worn and with the `helmeted` view (before the redraw in brackets):

  | Item | Name | Drawn | Shapes | Cost |
  |---|---|---|---|---|
  | `hair.short` | Short crop | the cap stopping above the brow in seven pointed locks, skin between their tips, lock lines from the crown, short sideburns, two small locks standing up at the crown | 41 (8) | 753 (318) |
  | `hair.tied` | Tied back | combed back from a hairline with a small peak, the tail a braid with a tufted end and the leather tie, under the helmet too | 51 + 18 (29 + 10) | 1 602 + 632 (895 + 272) |
  | `hair.curls` | Curls | the same mop in sixteen smaller curls, each a coil, those along the brow hanging lowest | 83 (27) | 1 915 (724) |
  | `hair.long` | Long | parted in the middle, the fringe swept to either side, each curtain three pointed locks, under the helmet too | 31 + 18 (14 + 4) | 2 566 + 868 (914 + 252) |
  | `hair.close` | Close crop | a short lighter lock flicked up at the front and the texture of clipped hair in small strokes | 36 (9) | 471 (181) |
  | `hair.buzz` | Buzzcut | stubble in the skull itself, two `pix` shapes of 51 by 46 painting 1 636 pixels: dots of the mid and dark bands thinning to a dotted hairline, a lit patch on the upper left, nothing above the skull's outline | 2 | 1 022 |

  As before, only the tied and the long hair show under a helmet. The settings call the buzzcut
  `buzz`; the format is unchanged;
- one palette set of its own, new in 1.4.0, `cloth`, with the grey-violet wool of the padded hose
  and the turnshoes: `wool0` `#8a7f95`, `wool1` `#625a70`, `wool2` `#423c50`. `provides` lists
  `palettes` with it;
- `defaults` naming the build `build.a`, the greatsword and the eleven others and today's swatches
  (skin `warm`, hair `brown`, tabard `blue`, plume `red`), so the default look is the present
  knight, with the short crop as redrawn in 1.6.0; nothing names the sword and shield, the new options, the free items or the crossbow until
  a look asks for them, and nothing is on the back. It has no decorations.

**The eye of the watch** on the tabard and on the shield, worn and at rest, is gold with a white
eye and a pupil; its iris is `@tabard.3`, the tabard's darkest band, so the emblem takes the coat's
colour. On the blue tabard that band is `#213f86`, the colour of `@base.b3` that the iris had
before 1.2.0, so the default knight is drawn exactly as before. The banners in the scenes are drawn
by code and keep their blue iris.

**Fitted to the builds.** Every item fits every build through the terms on the build's
differences, and three items gained terms in 1.3.0. Each term leans on a difference, which is 0 on
Classic, so Classic draws exactly as before, call for call:

- **The tabard** narrows from the chest to the belt and widens again to the hem. Up to 1.2.0 its
  outline and its cloth were each one rounded rectangle as wide as the chest from the neck to the
  hem. Each is now four pieces, in the same order: the rounded rectangle at the chest's width,
  clipped to its rounded top rows (to 10 below the neck); a four-sided polygon from row 11 to the
  row above the belt, the chest's width at the top and the waist's at the foot; a polygon from the
  belt to the last straight row (`86 + dHeight - dLeg` below the neck), the waist's width at the top
  and the hip's at the foot; and the rounded rectangle at the hip's width, clipped to its rounded
  foot rows. On Classic each piece draws exactly the rows the one shape drew, with the same ends.
  Both polygons are convex at every value. The belt's three bands follow the waist (`dWaist`) and
  the gold hem's two the hip (`dHip`), where all five followed the chest. There is no line across
  the chest on any build: the taper alone shapes the body.
- **The greaves** grow five eighths of a pixel for every pixel of leg (`"dLeg": 0.625` on the
  height of both plates), which keeps the greave's foot inside the boot over the whole range of
  the leg. A full pixel would let the inner plate reach a height of -4 at the shortest leg and the
  deepest crouch, which the rules refuse.
- **The pauldrons** grow with the shoulders: `rx` half a pixel and `ry` a quarter of a pixel for
  every pixel of `dShoulder`, so Broad carries plates of 29 by 22 and Slim of 21.5 by 18.25 where
  Classic's are 25 by 20.

Everything else is the same drawing on all three, on each build's own anchors: the head, the face,
the hair with its helmeted view, the helmet and plume, the arms, the gauntlets and both weapons and
the shield. The engine holds the weapon on each build's own shoulder line and hangs the hands
below each build's own shoulders ([rig.md](./rig.md#anchors-values-and-poses)).

The helmet and the plume carry the rest views of the helmet on the house's stool, and the
greatsword its `blade`, `{"from": 34, "to": 263, "half": 15}`, for the smithy's hot tip; see [Gear
at rest](#gear-at-rest). The eleven items and today's swatches are the test fixture's, unchanged
apart from the iris and the three items fitted to the builds (the fixture follows `knight.js`, so
it holds the short crop of 1.6.0 too); the fixture also carries extras the
tests need (a second build of its own, long hair, a smaller arming sword of its own, a round
shield, a pennant and a lantern). The one-handed items are kept, as designed, in
`tests/web/fixtures/base-onehand.items.json`, the free options (the twenty new swatches) and the
hair of 1.6.0 (the tied hair, the curls and the buzzcut) in
`tests/web/fixtures/base-options.json`, and the three builds with their names and the three fitted
items in `tests/web/fixtures/base-builds.json`, and the free items of 1.4.0 with the wool in
`tests/web/fixtures/base-free-items.json`, with the long and close hair as redrawn in 1.6.0. The default look costs 14 225 and draws at most 121 shapes; since
the short crop was redrawn its head group with the helmet off, 2 067, is the larger of the two
head groups (it was 13 878 and 105 before). The look with the sword and shield draws at most 141
at a cost of 14 328, and with the crossbow 132 at a cost of 14 243. Neither colours nor the build
change the cost, so every look's cost depends on its items alone. Of the looks of the first three
hair styles and the buzzcut with either of the first two weapons, the heaviest is the curls with
the sword and shield: 183 shapes, cost 15 490 (before the redraw the tied hair, 135 and 14 470).
With the free items the costliest look takes the costliest item of every slot: the mace and the
kite shield with the bascinet and its tall feather, the long hair, the breastplate, the layered
spaulders, the mail sleeves and chausses, the plate gauntlets, the turnshoes and the long cloak,
209 shapes at a cost of 21 400, and with the longsword in place of the mace and shield 196 shapes
at 20 628, against the caps of 1200 and 40 000. No look of the
base pack's items falls back on any build.

### The medieval world's pack

`web/packs/medieval.pack.json` is the second pack the page ships with: id `kw.medieval`, format
`[1, 4]`, version 0.10.0. Versions 0.1.0 (the cellar alone) to 0.7.0, which adds the mouser cat and
the redesigned scenes and devices, and version 0.7.1, which changes only the
licence line, are signed with `kw1`; version 0.8.0, which gives the smithy its three acts (format
1.3's bellows and quench) and makes it a quiet scene of the preset, is signed with `kw1` too.
Version 0.9.0, which redraws the goblin as the pot-thief and puts the pack under CC BY-SA 4.0,
was signed on 25 November. Version 0.10.0, which moves it to format `[1, 4]` for the knight's patrol,
the television in every scene and the devices' resting places, was signed on 25 November too.
It holds every scene as data, the three
monarchs, the goblin, the fly and the mouser cat as its cast, the devices and the television as the
prop set `props.medieval`, the word set `words.medieval`, the overlay `overlay.phosphor`, the preset
`world.medieval`, the stamps the scenes and devices use (the sconce, the barrel and the tall barrel,
the house's peg and the lamps of the pie, the owl, the crystal, the flask and the chest), the cat's twenty-two poses as
stamps of pix shapes in runs, and one palette entry, `house.screen`, the television's colour. The
page draws those scenes, devices and the cast from it, builds the quiet line and the captions in its
words and takes the colours of the words over the scene from its overlay, on a `dev` page, and on a
deployed page while it is signed; a copy changed after signing is refused by a deployed page, which
shows the collector's own words in `display.css`'s colours. Its preset is the page's own level of
the settings ([display.md](./display.md#worlds)). It weighs 365 KB of the 512 KiB a pack may, 106 KB
of it the cat's stamps and 15 KB the lamps' stamps. [worlds.md](./worlds.md) describes it, the scene
compiler that reads it, and how its scenes are held equal to the code's.

### Carriers

A page opened from disk can run a script beside it but cannot fetch a JSON file, so each pack that
ships with the page has a carrier beside it, `web/packs/<name>.pack.js`, of one line:

```js
KW.packText.push("{\n  \"kwpack\": 1,\n  \"pack\": {\n ...");
```

The string is the pack file's text unchanged, so the page reads it exactly as it would read the
file fetched. The only code in a carrier is the push. `knight.js` creates `KW.packText`, and
`index.html` loads the carriers after `pack.js` and `world.js`, the base pack's first and then the
medieval world's. The page uses the carriers whether it is served or opened from disk.

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
defaults. The look then comes from the settings ([display.md](./display.md#settings)): the address's
hooks, the saved settings chosen on the settings screen, the `defaults` of the state file from
`config.toml`, and last the base pack's defaults, key by key. `main.js` hands it to
`KW.knight.look(look)`, which resolves it again from the packs already read, the downloaded ones
included, and reads nothing again; it does so at start-up and at every change, and with nothing
set the look stays `{}`. The settings name only the base pack's items and swatches, in the
contract's terms: the weapon `greatsword` is `kw.base/main.greatsword`, `longsword`
`kw.base/main.longsword`, `sword_and_shield` `kw.base/main.arming`, `mace_and_shield`
`kw.base/main.mace` and `crossbow` `kw.base/main.crossbow`, the two one-handed ones with the shield the `shield` setting names
(`kw.base/off.<shield>`, `off.heater` unless one is chosen); a skin, hair, tabard or plume is
`kw.base/<id>`, the hair style `kw.base/hair.<style>`, the helmet `kw.base/helm.<value>`, and the
rest of the gear the item of its slot by the same rule (`plume_style` `plume.`, `body` `torso.`,
`shoulders` `pauldrons.`, `arms` `arms.`, `hands` `gauntlets.`, `legs` `legs.`, `feet` `boots.`,
`back` `back.`, its `none` filling nothing); and a build `kw.base/build.<letter>`, of
which the base pack declares `build.a`, `build.b` and `build.c`, shown by the names the pack gives
them, Classic, Broad and Slim. A world pack's body and swatches, and any pack's items, are named by
their long names: `build`, `skin`, `hair`, `tabard` and `plume` take one as it is, and `[look.items]`
names a slot's item ([worlds.md](./worlds.md#other-worlds)). The address's look hooks give the same
values: `bd=` the build, `arm=one` and `arm=two` the weapon (or any weapon by its contract name), `sk=`, `hc=`, `tb=` and `pm=` the swatches, `hy=`
the hair style, and `sh=`, `hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=` and `bk=` the gear (see [display.md](./display.md#the-address)). When the downloaded packs arrive, `KW.knight.add()` reads them with
the same options and resolves the look again (see [Downloaded packs](#downloaded-packs)):

- **A `dev` page** (the repository's own, opened from disk or served straight from `web/`) accepts
  packs signed or unsigned. A `sig` a pack carries must verify all the same.
- **A deployed page** accepts a pack only when it carries a signature that verifies against a key
  in `KEYS`. It refuses an unsigned pack at the `signature` step (`sig: is missing, and this page
  accepts only signed packs`), and one whose signature does not verify or names a key it does not
  know.

**The medieval world's pack is among the texts.** It carries no items and changes no look, but the
knight reads every carried text, so while `kw.medieval` ships unsigned (between a change to it and its next signing run) a deployed page lists it in
`status.refused` and writes its refusal line (`knightwatcher: the pack kw.medieval was refused at the
signature step: sig: is missing, and this page accepts only signed packs`). Where the scenes are
drawn from is the scene compiler's to say, in a line of its own ([world-loading.md](./world-loading.md#where-the-scenes-are-drawn-from)).

**Today the base pack, version 1.6.0, is signed** with `kw1`, on 25 November (see
[development.md](./development.md#signing-the-packs)). Signed,
a deployed page draws the knight from it as a `dev` page does, in every build and with every item.
A version changed after signing ships unsigned until the next signing run: meanwhile a `dev` page still draws from it, and a deployed
page refuses it at the `signature` step and draws the knight from the code in `knight.js`, the
full knight as it shipped before packs, which looks the same as the default look, the short crop
of 1.6.0 among it (see
[When packs fail](#when-packs-fail)).
From code the knight always holds the greatsword and is always Classic, and the settings screen
says the knight is drawn from code.

Nothing is drawn on screen about the choice. `knight.js` writes to the console one line for each
refused pack, and one line, `console.info` for the base pack and `console.warn` for code, each
time the source changes:

```
knightwatcher: the knight is drawn from the base pack kw.base 1.6.0, signed
knightwatcher: the knight is drawn from the base pack kw.base 1.6.0, unsigned
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

Besides the packs it ships with, the page reads the packs in `data/packs/`, beside `state.json`,
which these docs call the downloaded packs. The collector does not download packs yet, and leaves
the folder as it finds it; the server serves it from the `packs` folder of the collector's output
folder (`KW_OUT`), so a pack put there by hand is read like any other
([display.md](./display.md#another-world-pack)). The folder holds an index:

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
index. The admin page, one level down at `admin/`, fetches the same folder beside the walls with
`KW.knight.fetchPacks(fetch, '../')`; `'../'` is the only other root it takes, and anything else
fetches from beside the page. A page opened from disk fetches nothing and shows the packs it ships
with. A pack added later shows when the page is next loaded, since a page reads the folder only
once.

When any pack came, the page starts the world again at once with every text, those it ships with
and the downloaded ones, so that a downloaded world pack is read by the scene compiler under the
same rules: a downloaded `kw.medieval` of a higher version takes the place of the shipped one, and a
pack holding presets or prop sets joins the catalogue ([world-loading.md](./world-loading.md#downloaded-world-packs)).
A downloaded pack refused at any step is reported by the knight alone, once, whether it is the
knight's or a world's.

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
   screen's status page lists them under Refused packs. It shows the entries as text.
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
   the hot tip from the greatsword's blade. `rest.reach()` is `{ from: 34, to: 263, half: 15 }` and
   `rest.key()` is `'code'`. The code path has the greatsword only, by design: a look
   with the sword and shield is drawn with the greatsword, and no shield hangs anywhere. The reason is in the status and the console. Nothing plainer than this
   knight is ever drawn.
4. **A compiled list throws while drawing**, which the checks should make impossible. The throw is
   caught for that frame, and the packs that gave the list's slots are marked bad (the base pack
   only when no other pack gave any of them), refused at the `draw` step with the reason `the
   <list> list threw while drawing: <message>`. From the next frame the knight is drawn by the
   rules above without them. The same holds for the lists of the gear at rest and the sleeper's
   head. A throw in the engine's own drawing is not put down to a pack.

The world's parts follow the same order ([world-loading.md](./world-loading.md#where-the-scenes-are-drawn-from)).
`kw.medieval` refused or missing leaves every scene, device and member of the cast drawn from code,
the collector's words and `display.css`'s colours; the refusal is the knight's to report, since the
knight reads the same texts. A part that fails to compile is drawn from code alone. A part that
throws while drawing is caught for that frame and drawn from its code copy alone from the next,
the rest of the pack staying in use, rather than the whole pack marked bad as the knight's lists are
([world-loading.md](./world-loading.md#when-a-part-throws)); it shows on the status page under Fallbacks rather
than under Refused packs.

### Gear at rest

The house and the smithy show the knight's gear off the knight, and on the pack path they show
what the look equips: the helmet on the house's stool from the look's `restHelmet` list, the
weapon on the house's pegs and across the smithy's anvil from its `main` list, the same shapes the
knight holds, on a frame the scene fixes, and the shield, when one is equipped, on the house's wall
beside the pegs and the smithy's wall from its `restOff` list. The house places its two pegs from
the weapon's reach, its `blade` or, for a weapon that only fires, its `barrel`: 28 past where it
starts and 45 short of its end, which keeps the greatsword's pegs at 680 and 836 and puts the
crossbow's at 669 and 700, under its prod; a weapon with neither gets the greatsword's pegs. The smithy draws the hot tip of the blade from the weapon's
`blade`, and draws none for a weapon without one or for one that only fires. A scene asks for each by the item's slot
in its own `paint` or `draw`, through `KW.knight.rest`, which draws from code on the code path, so
no scene looks at which path is in use:

```js
K.rest.draw('helmet', 460, 476);                // the house's draw: the helmet on the stool
K.rest.draw('main', 618, 228, Math.PI / 2);     // the house's paint: the weapon on the pegs
K.rest.draw('off', 844, 164);                   // the house's paint: the shield on the wall, from its nail
const b = K.rest.reach();                       // the smithy's draw: { from, to, half } or null
```

The house and the smithy paint the weapon and the shield into their cached backdrop, so their
backdrop keys carry `K.rest.key('main')`, the equipped weapon's name, and the shield's name when
one is equipped. [rig.md](./rig.md#gear-at-rest) has the places
each scene declares in its `rests` field, the numbers of the hot tip and the key.

A scene of a world pack names the same places in its `rests` field and asks for the gear with a
`rest` mark, `{ "k": "rest", "slot": "main", "at": "anvil" }`, which the scene compiler turns into
the same calls, the hot tip and the pegs among them, and draws a helmet or a shield only where its
rest view fits the place. The house and the smithy of `kw.medieval` do so
([scenes.md](./scenes.md#how-a-scene-compiles)).
