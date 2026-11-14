# The page

The page is static files under `web/`, with no build step and no dependencies. It opens from
disk in a browser, so the scripts are classic scripts loaded in order by `index.html`, and they
share one global object, `KW`. ES modules would fail from `file://`.

## Files

| File | Holds |
|---|---|
| `index.html` | the markup: the page's version in the `kw-version` meta tag, the review bar, the display surface, the script tags in load order |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | the page's icons, linked from `index.html`. The SVG changes its outline with the browser's light or dark theme, and the ICO serves browsers that take no SVG |
| `logo.svg`, `logo-dark.svg`, `logo-mono.svg`, `icon-192.png`, `icon-512.png` | the logo and the app icons. The page itself does not use them; see [development.md](./development.md#the-logo-and-the-icons) |
| `css/display.css` | the display, the text colours by status, the review bar |
| `css/settings.css` | the settings screen and the cue of the hold that opens it |
| `fonts/` | the VT323 typeface and its licence |
| `js/draw.js` | `KW.view` (the grid and the canvas's real edges), the palette, the drawing primitives |
| `js/sprites.js` | small symbols drawn by code: `mark`, `heart`, `zed`, `drum`, `spark`, `stroke` |
| `js/props.js` | props used by more than one scene or drawn by the engine: the greatsword (`swordHD`), `bricksHD`, `barrelHD`, `tableHD`, `sconceHD`, the pie and the other watched things (`KINDS`), fire, sky and stars, flies, the crate and its parachute, and the foes (`FOES`: the goblin, its poses painted once each, its measures and its crown) with the smoke, the sparkles and the hole they come and go by |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into a pose, `rig(o)` turns a pose into the points the knight is drawn on (see [The knight's rig](#the-knights-rig)), `draw(o)` draws the knight in it, from the base pack or from code (see [The knight from the base pack](#the-knight-from-the-base-pack)), `start()` and `add()` load the packs, `fetchPacks()` fetches the downloaded ones and `look()` draws another look from the packs already loaded, `basePack()` gives the base pack in use, `swing()` animates a cut, `head()` draws the bare head and `speech()` a speech bubble, and `rest` draws the gear a scene shows off the knight (see [Gear at rest](#gear-at-rest)); `build` holds the knight's measurements. It also creates `KW.packText`, which the carriers fill |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court. The court draws the monarch in the skin it is given |
| `js/ed25519.js` | `KW.ed25519.verify`: checks a pack's Ed25519 signature, and does nothing else. See [packs.md](./packs.md#the-verifier) |
| `js/pack.js` | the pack library: reads, checks and compiles packs and draws from them; see [packs.md](./packs.md) |
| `packs/base.pack.js` | the carrier of the base pack: one line that pushes the text of `packs/base.pack.json` onto `KW.packText`. The JSON file is the source and is not loaded itself; see [packs.md](./packs.md#carriers) |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs, and deciding when to reload for a new version |
| `js/engine.js` | the frame: scene choice, strolling, the swat, events and the foe player that plays a foe's entrance, strike and exit (`KW.engine.foe`), drawing order, and the watched things in their places (`KW.things`) |
| `js/demo.js` | the invented conditions, the review bar and the demo loop |
| `js/settings.js` | `KW.settings`: the levels the display's settings come from, this display's saved choices, the look and the engine's input made from them, the clock's words, and the settings screen (see [Settings](#settings)) |
| `js/main.js` | start-up (starting the knight, reading the address's hooks, applying the settings and mounting their screen, fetching the downloaded packs, sizing), the clock and the words over the scene, the choice of mode, the check for a new version |

The load order is the order of that table, scenes in the order listed. A file may use what an
earlier file put on `KW` at load time, and anything at all when its functions run. A carrier needs
`KW.packText`, so it comes after `knight.js`; `ed25519.js` comes before `pack.js`.

## One grid

Every scene, the knight and the props are drawn on one grid of 960 by 600 whole pixels with the
ground at y 530. `KW.view` holds it: `HW` and `HH` are the grid's width and height and `HFL` is
the ground. `U` (5) is the unit the engine places the knight in. A scene's `spot`, the `x` of its
`rounds` and the `kx=` hook all count in units of `U`, so a `spot` of 96 is x 480 on the grid.

The canvas is cut to the screen's shape, so it reaches past the grid at the sides and the top.
`fit()` in `main.js` sets the real edges on every resize: `HL` and `HR` for the left and right,
`HT` for the top, `X0` and `Y0` for where the grid's corner sits on the canvas, `LW` and `LH` for
the canvas's size in its own pixels, and `SC` for one canvas pixel in CSS pixels. A backdrop fills
out to `HL`, `HR` and `HT`, never to the grid's edges. The canvas's bottom edge is the grid's.

The primitives draw into whichever context `KW.draw.setCtx()` last set: the display's canvas, or
a backdrop's while it is painted. The shapes fill whole pixels. `Rh` fills a rectangle with one
colour and `Rv` fills one in bands from top to bottom. `ell`, `rrect`, `poly` and `strip` (a
tapering bar between two points) take a colour or a list of `[fraction, colour]` bands across the
shape. `pix` draws a shape given pixel by pixel, painting each pixel once so that the shape can
fade without seams. `glow` lays a soft light and `dith` a dithered band. The palette is
`KW.draw.C`, with lists of bands for steel, gold and leather.

## The knight's rig

`knight.js` draws the knight in two stages. `KW.knight.rig(o)` works out, from the pose `o`, a set
of named points (the anchors) and named numbers (the values). The drawing then puts every shape at
an anchor plus an offset, folding in a value where a shape changes size, and works out no position
of its own.

The root is the point between the feet on the ground: `X = round(o.x) + 4 * shake`, `Y = o.floor`,
with `shake` the attack's tremble. The pose's `gx` and `gy` still count from the old corner of the
knight's 240 by 300 box, 120 left of the root and 300 above it.

| Anchor | Where | For the present knight |
|---|---|---|
| `root` | between the feet, on the ground | `(X, Y)` |
| `footL`, `footR` | under each leg, on the ground | `(X ∓ 24, Y)` |
| `hipL`, `hipR` | the top of each leg | `(X ∓ 24, Y - 74 + drop)` |
| `hem` | the bottom of the torso | `(X, Y - 64 + drop)` |
| `belt` | the belt line | `(X, Y - 102 + drop)` |
| `neck` | the top of the torso | `(X, Y - 162 + drop)` |
| `shoulderL`, `shoulderR` | the shoulder joints | `(X ∓ (54 + bloat), Y - 132 + drop)` |
| `head` | the middle of the eye line | `(X + 5 * headDx, Y - 206 + drop + 5 * headDy)` |
| `handL`, `handR` | the hands, placed by the grip | see below |
| `main` | the weapon's frame, `[x, y, angle]` | see below |
| `off` | the hand that holds the shield, always the left; the same point as `handL` | see below |

Every anchor is an `[x, y]` pair apart from `main`, and "left" is the viewer's left.

The values are whole numbers: `drop`, how far the upper body sinks (`(bob + crouch) * 5`);
`bloat`, how far each side swells when memory is tight (`bloat * 5`); `stepL` and `stepR`, 1 while
that foot is lifted in the walk; `sway`, the plume's sway from -4 to 4; and the build's eight
differences, `dShoulder`, `dChest`, `dWaist`, `dHip`, `dStance`, `dLeg`, `dHeight` and `dHead`.

**The build.** The knight's shape is eight measurements in grid pixels, held in `KW.knight.build`:

| Measurement | Meaning | Present knight |
|---|---|---|
| `shoulder` | half the span between the shoulder joints | 54 |
| `chest` | half the width of the torso at the chest | 46 |
| `waist` | half the width at the belt | 46 |
| `hip` | half the width at the hem | 46 |
| `stance` | half the distance between the middles of the legs | 24 |
| `leg` | the height of the hips above the ground | 74 |
| `height` | the height of the shoulders above the ground | 132 |
| `head` | half the width of the bare skull | 51 |

The present knight is the only build and the reference for the others: each difference is a
build's measurement less the present knight's, so for the present knight all eight are 0. The
anchors lean on them in full. `stance` moves the feet and hips sideways, `leg` raises the hips, the
hem and the belt, `height` raises the neck, the shoulders and the head, `shoulder` widens the
shoulders, and `head` raises the head, so that a bigger skull grows upwards from the neck. `chest`,
`waist` and `hip` move no anchor. `rig(o, build)` takes another build, which only the tests pass.

**The grip** is in the result's `grip` and places the hands and `main`:

- `none`, when the sword is put away: the hands hang at `(X ∓ (64 + bloat), Y - 84 + drop)` and
  `main` rests at the root with angle 0. The arms are drawn left, then right. With the crate of a
  full disk the hands take the carrying grip instead: they hold the crate against the chest by its
  lower corners, at `neck ± 44` across, plus the crate's sway of up to 2, and 62 below `neck`. The
  crate (`CARRY`, 80 by 64, its top 6 below `neck`, which is 50 below `head`, under the helmet's
  opening and the bare chin) is drawn after the pauldrons and before the arms, so the arms lie
  over its sides.
- `hammer`, in the smithy: the left hand steadies the work at `(X + 45, Y - 104 + drop)`, and the
  right swings the hammer from `(X + 80 + bloat, Y - 122 + drop)`, which is also `main`, with the
  hammer's angle.
- `two`, the greatsword in both hands: `main` is the middle of the grip and the blade's angle. The
  hand on the side the blade leans to holds the grip 2 pixels up the blade, the other 30 down it.
  Both arms are drawn before the blade, the one on the lean side first, and the gauntlets after
  it, the upper hand's first. The upper hand sits low enough that its gauntlet stays below the
  guard, which starts 17 up the blade. Once the blade turns past level it slides further down the
  grip (`SLIDE`): not at all up to an angle of 1.4, 2 pixels from 1.8 on, in proportion between. At
  the end of a cut and in the goblin strike's bounce the gauntlet would otherwise reach the guard
  by a pixel at some angles.
- `one`, a weapon in one hand, on the pack path only: `main` is placed as for `two`, and the right
  hand holds the weapon at its one station along the frame (the arming sword's is the grip's
  middle). The left hand, which is also `off`, holds the shield where the pose's `fx` and `fy`
  put it, in units of `U` from the old corner as `gx` and `gy` are; with no shield equipped it
  hangs at the side as in `none`. The shield's group (left arm, left gauntlet, shield) is drawn
  before the sword's (right arm, sword, right gauntlet); while the sword hand is left of the root,
  across the body, the order is `oneCrossed`: both arms, the shield, the sword and the right
  gauntlet last. The sword arm stays behind the shield and the blade passes in front of it.

**The poses with the sword and shield.** `pose()` and `swing()` give the one-handed fields when
the look's weapon is one-handed, from three sets of numbers beside the greatsword's `BASE`:

| Pose | Sword grip `gx`, `gy`, angle | Shield hand `fx`, `fy` | On the grid, from the root |
|---|---|---|---|
| `BASE1`, the stance | 37.6, 40.8, 0.3 | 20, 38.4 | sword hand at (+68, -96), shield hand at (-20, -108) |
| `ATTACK1`, the attack | 42, 24.4, 0.2 with the tremble of 0.12 | 19.6, 37.6 | sword hand at (+90, -178), shield hand at (-22, -112) |
| `SWING1`, to the right: wind-up, cut | 43.2, 23.2, 0; 44.8, 38.4, 2.0 | 16, 38; 14, 40 | the shield stays in front |
| `SWING1`, to the left: wind-up, cut | 38.8, 23.2, 1.0; 17.2, 40.8, -2.0 | 12, 37.6; 3.2, 26.4 | the shield lifts as the sword crosses, and the blade passes in front of it |

In the attack the guard sits on the helmet's outer shell, clear of the opening's rim. The wind-up
to the right raises the sword over the right shoulder with the blade upright, a little over the
attack's hand, so the blade never crosses the face on that side. The swing's angle at the cut is
the greatsword's, and both wind-ups lie short of the nearest fly (0.35 less 0.15), so the swat's
hit test in `engine.js` holds for both weapons. Every other condition keeps its pose; the sword is
put away where the scene says so (`sword: false` in the house and the cellar, the hammer in the
smithy), and the shield with it.

**No arm over a blade or a shield.** `tests/web/knight.test.js` draws every frame the engine can
draw with the weapon held (both swings at every hundredth of their length and at every odd
thousandth from q .451 to .619, where the blade is past level; the attack's tremble every 10 ms for
two seconds; the goblin's strike on both sides, from contacts at q .45, .5, .53 and .55 through its
bounce and recovery every 10 ms, with the engine's own `strike()`; the stance of each condition
that holds a weapon; and the largest bloat), keeps the pixels each of the look's lists fills, and checks, in the order the frame was
drawn in, that no arm or gauntlet drawn after the weapon fills a pixel of its blade or guard and
none drawn after the shield fills a pixel of the shield. For both swords the check takes the blade and the guard,
everything from 17 along the frame, where both guards begin, and checks the gauntlets as well as
the arms.

The engine's own drawing hangs on the same anchors: the face on `head`; the crate, sweat, steam, the mark, the thought bubble, the progress bar and the speech bubble on `neck`; the hearts on
`root`. The drumstick takes its height from `head` and its x from `neck`, so it follows the head up
and down but not sideways, as it always has.

`rig` fills the same object on every call and returns it, so a frame allocates nothing for it and a
caller that keeps the result sees it change at the next call.

**The library's arrays.** On the pack path each frame copies the rig into the two `Float64Array`s
that `draw()` in `pack.js` reads, made once by `newAnchors()` and `newValues()`:

- the anchors, x then y of each, in the order of `ANCHORS` in `pack.js` (`root`, `footL`, `footR`,
  `hipL`, `hipR`, `hem`, `belt`, `neck`, `shoulderL`, `shoulderR`, `head`, `handL`, `handR`,
  `main`, `off`, `rest`). The rig has no `rest`, which stays at 0: nothing on the knight hangs on
  it, and the gear at rest sets it in arrays of its own (see [Gear at rest](#gear-at-rest)). After
  them, at `FRAME_SX` and
  `FRAME_SY`, the weapon frame's direction, `sin(a)` and `-cos(a)` of `main`'s angle;
- the values in the order of `VALUES`: `drop`, `bloat`, `stepL`, `stepR`, `sway`. `drop` is
  clamped to 0 to 40 and `bloat` to 0 to 60, the ranges `RANGE` in `pack.js` states and every
  pack's shapes were checked over. The present knight stays inside them (a drop of 10 at most and
  a bloat of 30), and the anchors keep the unclamped numbers. The build's differences are not in
  the array: the look folds them in when it is compiled, and the rig takes the look's
  measurements.

On the pack path the hand stations along the weapon are the weapon's own `grip.hands`: for the
base pack's greatsword the same 2 and -30, and for its arming sword the one station 0.

## The knight from the base pack

At start-up, before the first frame, `main.js` calls `KW.knight.start(KW.packText, dev, { look: {} })`
with `dev` true only when the page's version is `dev`. `start` reads the packs the carriers pushed,
gathers them and resolves the look, the base pack's defaults. `main.js` then hands the look the
settings make (see [Settings](#settings)) to `KW.knight.look(look)`, which resolves it again from
the packs already loaded and reads nothing again, and it calls `look()` once more whenever the
settings change it. With nothing set the look stays `{}`, so the knight is the base pack's defaults
exactly. Calling `start()` again would rebuild from the carriers alone and lose the downloaded packs,
so the settings never do. If a look resolves, the knight is drawn from the
base pack; otherwise from the code in `knight.js`, the full knight as it shipped before packs, which
draws the default look: the greatsword, and no shield anywhere. A `dev` page accepts packs signed or unsigned. A
deployed page accepts a pack only when it carries a signature that verifies against a key in
`KEYS`, and refuses it at the `signature` step otherwise. [packs.md](./packs.md#where-the-knight-is-drawn-from)
says which state ships today.

Served over HTTP, `main.js` then fetches the packs the collector downloaded into `data/packs/`, once
at load and in every mode, with `KW.knight.fetchPacks(fetch)`, and hands them to `KW.knight.add()`,
which reads them with the same rule and resolves the look again; the page then paints its
backdrops again. `look()` keeps the same rule: a pack refused or marked bad stays so. From disk it fetches nothing. A missing `data/packs/index.json` means no packs and
is silent. [packs.md](./packs.md#downloaded-packs) has the index's shape and its limits.

`knight.js` writes one line to the console for each refused pack, and one each time the source
changes; the settings screen's status page shows both, and nothing about either is drawn on the
display itself. `KW.knight.source` holds `'pack'` or `'code'`,
and `KW.knight.status` the base pack in use, the refused packs, the look's fallbacks and the last
line, for the settings screen's status panel. What happens when packs fail, in order, is in
[packs.md](./packs.md#when-packs-fail).

On the pack path `draw(o)` runs the rig, fills the library's arrays, picks the grip mode (`none`,
`hammer`, `twoR` or `twoL` by the side the blade leans to, or `one` or `oneCrossed` by the side of
the root the sword hand is on) and walks the order that
`sequence(mode, helmet)` in `pack.js` gives. It draws each of the look's lists with the library's
`draw()` and the primitives of `draw.js`, and draws the engine's own steps by code at their places
in that order: the face after the head group, the drumstick after the face, the crate after the
pauldrons and before the hands group, the hammer between the right arm and its gauntlet, and sweat, steam, the marks, the thought bubble,
the progress bar, the hearts and the speech bubble last. `@skin.face` takes the skin swatch's sick
ramp when the knight is ill and its hot ramp when overheated, and the face takes the look's
colours (below). A frame allocates nothing for the
pack path beyond what the primitives and the engine's own steps allocate. A throw inside one of
the look's lists is caught, its packs are marked bad, and the next frame is drawn without them.

On the code path `draw(o)` runs the rig and draws the same knight by code, `codeHD`, in the same
order. The two paths give the same calls, which the call record checks.

Two things stay as they were:

- the face is drawn by the same code on both paths. On the pack path it takes its colours from the
  look: the lid of the half-closed eyes from the middle band of the skin ramp in use (normal, sick
  or hot; the band across the middle of the face's width), and the cheeks, the puffed cheeks and
  the brows from `colours.cheek`, `colours.puff` and `colours.brow`, which `resolve()` takes from
  the skin and hair swatches. On the code path it keeps its own colours, which equal the base
  pack's default swatches, so the default look's calls are the same on both paths. A brow whose
  colour is too close to the skin it lies on gets a one-pixel edge in the outline colour, drawn
  under it (a 14 by 5 rectangle round the 12 by 3 brow). Too close means a WCAG contrast ratio under
  2.5 against the bands of the look's normal face ramp that the brows lie across, from a fifth to
  four fifths of the face's width; the answer is worked out once for each ramp and brow, and it
  belongs to the look, so the edge does not come and go with the knight's state. Of the 36 pairs of
  the base pack's skins and hair colours, 22 get the edge: light brows on the fair, warm, golden
  and tan skins, and the brows near the skin's own lightness on the golden, tan, brown and deep
  ones. Today's knight, the warm skin with brown brows, stands at 2.94 and draws none, so its
  calls are unchanged;
- a pose that asks for the drooping plume (`droop`) is drawn by code, since the pack format has no
  drooping plume. No pose of the page sets it.

`head()`, the sleeper's bare head in the house, follows the knight: on the pack path it draws the
look's helmet-off head group and then the face, with the same calls as the code, and on the code
path `bareHD`. The gear the scenes show at rest follows it too; see the next section. `speech()` is
drawn by code on both paths.

## Gear at rest

The house and the smithy show the knight's gear off the knight: the helmet on the house's stool
while the helmet is off, the weapon on the house's pegs and across the smithy's anvil, and the
shield, when one is equipped, on the wall beside the pegs and on the smithy's wall. They
show what the knight has equipped, from the same source as the knight: the look's lists on the
pack path, and on the code path the code in `knight.js` and `props.js`, which draws what the
scenes always drew. A scene asks for each item by its slot, in its own `paint` or `draw`, so the
item stays layered with the scene's art. It does so through `KW.knight.rest`, which makes the
choice of path itself:

| Call | Does |
|---|---|
| `draw(slot, x, y, a)` | draws the equipped item of `slot` at rest. `'helmet'`: the helmet's rest view on the `rest` anchor at `(x, y)`, the middle of its foot on a surface, with the plume's rest view behind it on the view's plume mount. `'off'`: the shield's rest view on the `rest` anchor at `(x, y)`, the top middle of a `hang` place, which for the base pack's shield is the nail it hangs from. `'main'`: the weapon's worn shapes on a frame with the middle of its grip at `(x, y)` along the angle `a` (0 is straight up, and `Math.PI / 2` lays it flat with the point to the right). Any other slot draws nothing, and on the code path `'off'` draws nothing, since the code path has no shield |
| `blade()` | the equipped weapon's `blade`, `{ from, to, half }` in frame units, or `null` when it gives none. On the code path, the greatsword's `{ from: 34, to: 263, half: 15 }` |
| `key(slot)` | the equipped item's name, `<pack>/<item>`, or `''` when the slot is empty; `'code'` on the code path |

On the pack path a helmet with no rest view shows nothing on the stool, and a helmet whose rest
view has no plume mount rests without its plume. A shield with no rest view, or no shield, shows
nothing on the wall; and a shield is equipped only with a one-handed weapon, so with the
greatsword no shield hangs anywhere. Gear at rest does not move with the knight, so it
is drawn with every named value 0, from anchor and value arrays of its own made once at start-up; a
call allocates nothing.

**The places.** A scene declares the places where it sets gear down in its `rests` field, beside
`places`, which holds the watched things' places. The engine does not read `rests`: the scene
passes a place's numbers to `draw`.

| Scene | Place | Holds | Fields |
|---|---|---|---|
| house | `stool` | the helmet | `kind: 'surface'`, `x` 460 and `y` 476 the middle of the stool's top, `w` 76 by `h` 80 the room above it |
| house | `pegs` | the weapon | `x` 618 and `y` 228 the middle of the grip, `a` `Math.PI / 2` |
| house | `wall` | the shield | `kind: 'hang'`, `x` 844 and `y` 164 the nail in the beam right of the pegs, `w` 100 by `h` 140 the room below it |
| smithy | `anvil` | the weapon | `x` 50, counted from the knight's spot `s.kx` so that the blade lies where the hammer falls; `y` 425; `a` `Math.PI / 2` |
| smithy | `wall` | the shield | `kind: 'hang'`, `x` 145 and `y` 312 the nail on the wall over the quench barrel, `w` 100 by `h` 132 the room below it |

The `kind`, `w` and `h` give a place in the shape the pack format gives places; nothing checks a
rest view's `fits` and `box` against them yet. The house's two pegs sit under the weapon's blade,
28 past where it starts and 45 short of its point, from `blade()`: for the greatsword at 680 and
836, where they always were, and for the arming sword at 680 and 748. A weapon with no `blade` gets
the greatsword's pegs. The house's shield clears the arming sword's point on the pegs, the jug on
the mantel and a camera at the house's high place `h2`, which stays where it was, at 926; a test
draws that camera and its question mark and checks them against both swords on the pegs, the
shield, the window and the knight at every spot of the house's rounds.

**The hot tip.** The smithy draws the glowing tip of the blade on the anvil from `blade()`, in
frame units along the blade from `to`, the point, and across it from `half`, the distance from the
middle to each edge: three bands of heat starting 73, 57 and 43 short of the point and reaching to
30 short of it, each `2 * half + 1` tall, then the point itself, a light along each edge and a glow
around it. For the greatsword these are the numbers the smithy always drew. A weapon with no
`blade` has no hot tip.

**The backdrop key.** The house and the smithy paint the weapon and the shield into their cached
backdrop, so each adds `KW.knight.rest.key('main')` to its key, and `'|'` and
`KW.knight.rest.key('off')` when a shield is equipped, and a change of gear paints the backdrop
again: on the pack path the house's key is `tv|kw.base/main.greatsword` with the television on, and
the smithy's `440|kw.base/main.greatsword` at its spot; with the sword and shield the house's is
`|kw.base/main.arming|kw.base/off.heater` with the television off. The helmet on the stool is drawn
every frame, so it adds nothing.

## The scene interface

Each file in `js/scenes/` registers one object on `KW.scenes` under the scene's name, and draws
nothing outside it. The engine reads only what is listed here, and sets the grid's transform
before it calls `paint`, `draw` and `over`.

| Field | Required | Meaning |
|---|---|---|
| `spot` | yes | where the knight stands on arrival, in units of `U` across the grid |
| `places` | yes | the places for watched things: `pie`, three high ones (`h1` to `h3`) and three on the ground (`g1` to `g3`); see [Watched things](#watched-things) |
| `rests` | no | the places where the scene sets the knight's gear down, by name; the scene reads them itself, see [Gear at rest](#gear-at-rest) |
| `draw(t, s)` | yes | draws the scene at time `t` in ms: everything on a scene without `paint`, otherwise what moves. It calls `KW.things.draw(t, s)` at the point where the things behind the knight belong in its drawing order |
| `rounds` | no | the spots the knight strolls between while free to move: `[{ x, act, dur }]`, `x` in units of `U`, `dur` in seconds, `act` one of `guard`, `look`, `sniff`, `yawn`, or a name the scene's `act` handles |
| `paint(s)` | no | the still part, painted once into a cached canvas and kept until the key or the screen's shape changes |
| `key(s)` | no | a string; the cached backdrop is painted again when it changes. A scene that paints the knight's gear at rest into its backdrop includes `KW.knight.rest.key(slot)` for each such item |
| `act(t, s)` | no | called each frame after strolling and before the swat and events; may change the knight's pose `s.o` |
| `over(t, s)` | no | drawn after the knight, the flies and the events |
| `wallAt(x)` | no | the y of the top of whatever a foe climbs over at grid x; without it a foe digs up out of the ground |
| `foeZone` | no | where a foe may stand: `{ side, spans }`, the side of the knight tried first (`1` right, `-1` left) and the spans of grid x, `[[x0, x1], ...]`, where its middle may stand clear of the scene's own props. The engine also keeps it clear of every place holding a watched thing on the ground or the pie, and 150 to 240 pixels from the knight's middle, within the reach of the weapon the knight holds; with no room the event shows its caption alone. A scene without it hosts no foe |
| `outdoors` | no | `true` where flies are swatted and the crate may land |
| `bed` | no | `true` where the knight takes to bed for `night` and `container_unhealthy` |
| `helmet` | no | `false` where the helmet comes off (unless the address says otherwise) |
| `sword` | no | `false` where the knight puts the sword away |

`s` is the same object for every call in a frame:

| Field | Meaning |
|---|---|
| `w` | the winning condition: `{ id, lv, st, scene, hl, sub }`, or the idle one with id `idle` |
| `things` | the watched things standing in the places, each `{ place, kind, ok, alert }` with `place` the name of one of the scene's places |
| `places` | the scene's `places` |
| `tv` | whether the television is on |
| `kx` | the knight's x on the grid |
| `o` | the knight's pose for this frame |
| `here` | where the knight stands in the scene's `rounds`, `{ act, el }` with `el` the ms spent there, or `null` |
| `inBed`, `helmOff` | whether the knight is in bed, and whether the helmet is off |
| `strike` | free for a scene's `act` to pass to its `draw` (the smithy's hammer blow) |
| `mon` | the monarch at court, from the engine's input (the settings): `a`, `b` or `c` |
| `monSkin` | the monarch's skin, `{ id, face, cheek }` from one of the base pack's skin swatches, or `null` for the court's own, which is the warm swatch's colours |

Some scenes reach further. The house draws the sleeper's head with `KW.knight.head`, the helmet on
the stool and the weapon on the pegs with `KW.knight.rest`, and its Zs at night in `over`. The
court paints the monarch that `s.mon` names, in the skin `s.monSkin` gives, into its backdrop,
keyed on both (`b|deep`, or `a|` for the court's own skin), sets the knight
talking in `draw` and draws the monarch's speech bubble with `KW.knight.speech`. The smithy's `act`
sets the hammer and `strike`, its `paint` lays the weapon across the anvil with `KW.knight.rest`,
and its `draw` puts the hot tip on the blade. The yard keeps
the time the dummy was last struck and swings the knight's sword in `act`.

## Modes

**Demo.** Invented conditions, the review bar, and a loop through every scene and state. The
quiet scenes take turns a minute each (`DEMO_TURN_MS` in `demo.js`), unless the settings set a
length, which the demo then uses too. The demo runs
when the page has never had a valid state file: opened from disk, served with no
`data/state.json`, or with a stale or unreadable one. `?demo` in the address forces it even when
a state file exists. Browsers refuse to fetch from disk, so from disk the page does not try.

**Wait.** Served over HTTP, the page draws the quiet scene with no words and no bar until the
first answer for the state file arrives.

**Live.** The page fetches `data/state.json`, relative to itself and with `cache: "no-store"`, at
start and five seconds after each answer, and cuts a fetch off after four seconds. A valid file
hides the review bar and drives the display:

- The first condition with a known id wins. Its id chooses the scene and the knight's state from
  the table in [design.md](./design.md), its `level` the text colour (critical red, warning
  amber, work blue, quiet green, sleep dim green), and its `headline` and `detail` the words. An
  id the page does not know is skipped and plays no part in the badge.
- The "+N MORE" badge counts the other known conditions at warning or critical, and turns red
  when any of them is critical.
- With no known condition the quiet scenes the settings choose take turns, ten minutes each
  unless the settings set another length (`LIVE_TURN_MS` in `main.js` is the ten), and
  `quiet_line` is the small line.
- The file's `defaults` go to the settings (see [Settings](#settings)), which apply any change at
  once.
- The watched things come from `facts.things`, and without it the pie stands alone as before
  there were things; see [Watched things](#watched-things). `facts.streams.count > 0`, or a
  `streaming` condition, turns the television on.
- Events. The first valid file's events are adopted without playing. After that each event with
  a higher `seq`, oldest first: `ad_blocked` adds `count` flies (at most 100 for one event;
  eight on screen, the rest queued for the next swat), `ip_banned` plays the goblin, `import`
  the crate and `backup_done` the feast, each with `text` as the caption. The goblin is a foe
  as tall as the knight's shoulders: it climbs over the battlement's wall or digs up out of the
  camp's grass beside the knight, pulls a face, is bonked on the saucepan it wears, and vanishes
  in a puff of smoke. The knight's swing stops where the blade meets the pot, so the blade never
  passes through it; nothing gory is shown. The goblin stands where the weapon the knight holds
  reaches it, the greatsword or the arming sword alike, and does not come where none can; the
  burst on the pot lasts the 80 ms the blade bounces off it. A foe is described in `KW.props.FOES` and played by
  the engine's foe player from its tables (`KW.engine.foe.FOE`), so a later foe reuses the
  entrance, the strike and the exit. A `seq` lower than the
  highest played means the collector started again, and its events are adopted unplayed. Events
  act out only while nothing at warning or above is up and in the scenes that suit them; the
  caption shows regardless.

**Holding on.** Once the page has had a valid file, a fetch that fails or a file that cannot be
read changes nothing on screen while that last valid file is no older than three of its own
intervals (its `interval_s`). The page keeps showing it and plays no events.

**No signal.** Once the page has had a valid file, a fetched file that is stale (older than three
times its `interval_s`) or has a `schema` other than 1 shows NO SIGNAL at once. So does a failed or
unreadable fetch once the last valid file has passed three of its intervals. The current scene and
the knight's state stay, under a red `NO SIGNAL` with `collector silent for N min`, counted from
the newest `generated_at` the page has seen. The next valid file restores live mode.

**On the tablet.** In live mode there is no visible control. A tap or click on the display
toggles full screen, and a press and hold of two seconds opens the settings screen (see
[Settings](#settings)); only a press lifted within half a second counts as a tap. The page asks for a screen wake lock on entering live mode, on every tap,
and whenever it becomes visible again, since browsers release the lock when a page is hidden.
Where the browser refuses either (a wake lock needs a secure context, and full screen a user
gesture), nothing happens and nothing is logged. The demo's review bar keeps its own Full screen
button.

**New versions.** A copy deployed with `tools/deploy.sh` (see [Deploying](#deploying)) carries its
version in the `kw-version` meta tag, and `version.json` beside `index.html` names the version
deployed now. Served over HTTP, in every mode including the demo, the page fetches `version.json`,
relative to itself and with `cache: "no-store"`, five minutes after it loads and every five minutes
after, and cuts a fetch off after four seconds. When the version there differs from its own, it
reloads at once, with no notice. Before reloading it records the version it is reloading for and
the time in `sessionStorage`. If it has already reloaded for that same version within the last 30
minutes and is still not on it (a cache served the old `index.html` again), it waits until those 30
minutes are up before reloading again. Where `sessionStorage` is refused the record is kept in
memory, which a reload loses, so such a page may reload once on each load. A failed fetch, or a
file that names no version, does nothing. The repository's own `index.html` says `dev`, and a page
whose version is `dev` never checks, so the page still opens from disk, or is served straight from
`web/`, with no build step. The same version decides whether the page accepts an unsigned pack: only
a `dev` page does (see [The knight from the base pack](#the-knight-from-the-base-pack)).

The mapping is the pure function `KW.state.map(file, nowMs)`. Beside it,
`judge(view, lastGood, nowMs)` decides between showing a file, holding the last one, NO SIGNAL and
the demo, `arrange(list)` puts a list of watched things in the places (see
[Watched things](#watched-things)), `listFromHook(text)` reads the address's `th=` hook into a list
in the contract's shape, `takeEvents()` picks the events to play and `noSignal()` builds the
knight's NO SIGNAL state. `versionOf(file)` reads the version out of a parsed `version.json`, and
`reloadDue(own, fetched, last, nowMs)` decides whether to reload, given the page's own version, the
fetched one, the record of the last reload and the time. `state.js` loads under Node for the tests.

## Watched things

The state file lists the watched things in `facts.things` (see [state.md](./state.md)). Every
scene has seven places for them, of three classes: the pie's own place, three **high** places for
cameras (`h1` to `h3`: on a wall, a tree, a pier or a pole, at or above the knight's head) and
three **ground** places for every other device (`g1` to `g3`: on the floor or the earth).

**The filling rule.** `KW.state.arrange(list)` reads up to 32 entries and puts each in a place by
its class, in the order of the list. The first entry of kind `pi` takes the pie's place, and a
second Pi is not drawn: a pie has only the one place that looks right. The first camera takes
`h1`, the second `h2` and the third `h3`. Every other kind, `machine`, `vm`, a kind the page does
not know and a pack's kind among them, takes the next free ground place. A thing with no free
place of its class is not drawn, though it is still watched and still alerts, and an entry that is
not an object takes no place. Places depend on the list alone, never on which things are up, so a
thing does not move while the list stays the same.

**What `map` gives the engine.** `things`, the things drawn, each `{ place, kind, ok, alert }`.
`kind` is the entry's `kind` when that is a string of at most 200 characters, and `''` otherwise.
`ok` is false only for `state` `down`: `up`, `unknown` and anything else draw it whole, since the
page does not judge. `alert` is true only for `alert === true`.

**The fallback.** When `facts.things` is absent, `null` or not an object with a `list` array (a
collector from before watched things), `things` is the pie alone in its place,
`{ place: 'pie', kind: 'pi', ok, alert: true }`, with `ok` false while `facts.pi.up === false` or a
`pi_silent` condition is in the list, as before there were things. A file with a things list
takes the pie's state from the list alone, so the pie leaves its dish when the Pi is judged down
and not at the first missed check.

**Places.** A scene's `places` is `{ pie, h1, h2, h3, g1, g2, g3 }`, each
`{ cls, kind, x, y, w, h }`: `cls` is `pie`, `high` or `ground`, and the rest is the shape the
pack format gives places (`kind` `surface` or `floor`, `x` the middle and `y` the base, the line a
thing stands on, a box 88 wide and 112 tall above the base). For a camera the base is the foot of
the wall plate it hangs from. Three flags may follow:

- `front: true` marks a ground place on the floor in front of the ground line, which the engine
  draws after the knight; the other places are drawn by the scene's `draw`.
- `flip: true` mirrors what stands there, so that a camera on the left of a scene looks into it.
- `pole: y` stands a high place on a wooden pole from the camera's plate down to `y`, drawn only
  while a camera is there, where the scene has no wall to mount it on: the battlement's merlons,
  the flagpole over the camp's tent, the cellar's crate stacks.

The pie's place is where the pie stood before there were places, so a setup with only the Pi draws
the pixels it always drew. An empty place draws nothing. High places keep clear of the headline,
the detail line and the clock at every headline size, and of the monarch and the speech bubbles,
the fires, the moon, the sword on its pegs and the sleeper's Zs; a camera's question mark is the
highest thing drawn, and its top is never higher than y 172. Ground places keep clear of every
spot the knight stands at, of the swings, and of the knight's boots. `pl=1` shows them all.

Whatever a place may show is drawn wholly on the 960 by 600 grid, which is all a display exactly
960 wide shows: every kind that may stand there, up and gone, its question mark and its pole. No
two places in a scene draw over each other. `tests/web/places.test.js` draws each of them and checks
both, from what is painted rather than from a place's declared box: a place's 88 by 112 box is the
room it was planned with, and may reach past the grid's edge where its drawing does not.

**The kinds.** `KW.props.KINDS` holds each kind's `draw(x, y, t, ok, part)`, standing on the base
`(x, y)`, and `mark`, the height above the base of the top of its question mark:

| Kind | Up | Down |
|---|---|---|
| `pi` | the pie in its dish, steaming, a large raspberry on top | the empty dish with crumbs and one raspberry |
| `camera` | a white bullet camera on a wall arm, its lens dark glass | the body hanging straight down from the arm, dulled, its lens dark |
| `machine` | a grey tower case | the case dark, its side panel off and leant against it |
| `vm` | the same case as an outline of bright dots | only a few paler dots at its corners |
| any other | a plain small grey box | the box tipped on its side, its lid off beside it, the inside dark |

A kind the page does not know is drawn as the box. The kind is only ever a key into `KINDS`. The
devices fit within 80 by 64 above the base.

**The lamps.** Every device has one lamp, 10 by 10 in a dark rim, with a soft light round it in
its own colour. While its machine is up, or `unknown`, the lamp fades from green to black and back
over 3.6 seconds; while it is down, from red to black and back over 2 seconds, a slow blink. The
loop starts 523 ms later in each place than in the one before it (`pie`, `h1` to `h3`, `g1` to
`g3`), so the lamps of a scene never pulse together. Both loops come from `LAMP` and `lampLevel` in
`props.js`, which every lamp shares.

**The raspberry.** The pie's lamp is the raspberry on its top, 25 pixels across and 33 tall
with its calyx: round drupelets, each with a dark outline and a highlight, under a green calyx and
stalk. It lights on the lamps' loops from the pie's place, so its loop starts at the place's
offset, 0. While the Pi is up it goes from a bright pink-red (`#ff5c80` on its drupelets) to a
deep crimson (`#6a0f2e`) and back over 3.6 seconds, in a warm light (`#ff7a6a`); while the Pi is
down a single raspberry lies low in the empty dish, to the right of the question mark and partly
hidden by the dish's near rim, and blinks from the down lamp's red to black over 2 seconds. Its
calyx and outline stay as they are. The steam rises behind it, and nothing else moves but the
question mark.

**Drawing.** `part` `'still'` draws what does not move and `'moving'` what does: the lamp, and the
pie's steam and raspberry. The engine paints each thing's still part once, with its pole, into a
small canvas of its own, kept by place, kind and state, and draws it with one call where the
scene's `draw` calls `KW.things.draw(t, s)`, so each scene's drawing order is what it was. Only the
moving part is drawn each frame, and the question mark is kept in a canvas of its own as well. The
raspberry is painted once in each of its colourings, lit and dark, into small canvases of its own
in `props.js`; each frame draws its light, the dark berry, and the lit berry over it at the loop's
level, 18 calls, as a device's lamp costs 16 to 20. The pie up costs 114 calls a frame with its
steam, and the pie down 18. A frame with the pie and six devices costs about 75 calls more than one
with the pie alone.

**The question mark.** Over a gone thing whose `alert` is true, the engine draws the question mark,
blinking every 400 ms, with its foot at least 4 pixels above the gone thing. A gone thing that
does not alert has no mark, only its red lamp. The pie's mark stands where it always has.

**`thing_down`.** The condition has no scene of its own: the knight stays in the quiet scene of
the moment, does not stroll, and frowns, as for `pi_silent`. `map` gives the winning `thing_down`
a `place`: the place of the first position in its `things` that stands in one, or `null` when
none does. The knight looks towards that place (`look` is the sign of the place's x less the
knight's), or straight ahead when there is none. A thing that does not alert has no effect on the
knight.

## Settings

A display's look, its display preferences and its quiet scenes are its settings. Each comes from
four levels, highest first, key by key:

1. **The address's hooks**: `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, `mon=`, `ms=`, `hs=`, `h=`
   and `ck=` (see [The address](#the-address)). They keep screenshots the same whatever a display
   has saved.
2. **This display's saved choices**, made on the settings screen and kept in its browser.
3. **The `defaults` of the state file**, which the collector takes from `config.toml` (see
   [state.md](./state.md)). A file from an older collector has none.
4. **The page's own**: the base pack's defaults for the knight (Build A, the greatsword, warm skin,
   brown hair cut short, a blue tabard and a red plume), monarch A in the court's own skin, a
   medium headline, a 24-hour clock, the helmet off indoors, and all four quiet scenes, ten minutes
   each in live mode and one in the demo.

The keys and their values are the contract's: `look` holds `build`, `weapon`, `skin`, `hair`,
`hair_style`, `tabard`, `plume`, `monarch` and `monarch_skin`; `display` holds `headline`, `clock`
and `helmet_indoors`; `quiet` holds `scenes` and `minutes`. A value a level holds that the page does
not know is ignored at that level, so the next one down is used, and the console says so once:
`knightwatcher: settings: look.skin "green" in this display's saved choices is ignored: not a value
the page knows`. A build is known only when the base pack in use declares it (`build.a` is Build
A); today it declares Build A alone. `quiet.scenes` takes turns in the order given, a repeat
dropped, and a list that names no quiet scene is ignored whole; `minutes` is a number from 1 to
240. A section of the defaults the page does not know is left alone without a word, so a later
collector can add one.

**What the levels drive.** `KW.settings.knightLook(r)` turns what the levels give into the look for
`KW.knight.look()`, holding only what a level above the page's own sets: with nothing set it is
`{}`, and the knight is exactly as before there were settings. `engineInput(r, pack, ownMs)` gives
the engine's `turns`, `turnMs`, `mon` and `monSkin` (see [The engine's input](#the-engines-input));
`turnMs` is `ownMs`, the demo's minute or live mode's ten, while no level sets `minutes`. The
headline size becomes the display option `hs`, the helmet indoors `h` (`on` for true, `auto` for
false), and the clock reads `21:42` or `9:42` with a small `PM` after it. `clock(h, m, hours)` gives
the words: on the 12-hour clock the hour after midnight is `12:05 AM` and the half hour after noon
`12:30 PM`.

**Saved choices.** One key in the browser's `localStorage`, `knightwatcher.settings`, holds
`{ "v": 1, "look": {...}, "display": {...}, "quiet": {...} }`, with the contract's names and values.
A choice is saved the moment it is made. Every read and write is wrapped: where a browser refuses
storage, as a private window may, the page works all the same, the choices last until it is
reloaded, and the console says so once. A stored text that is not JSON, or not version 1, is
ignored whole, and a stored value the page does not know is ignored alone. The choices belong to
the browser of one display, so other displays keep their own.

**The store.** `KW.settings.create({ hooks, storage, pack, say })` holds the levels: `now()` gives
`{ values, from }`, every key's value and the level it came from (`hook`, `saved`, `defaults` or
`built-in`); `fallback()` the same without the hooks and the saved choices, for the reset's line;
`choose(section, key, value)` saves one choice and refuses a value it does not know; `reset(section)`
clears a section's saved choices; `own(section)` says whether the display has any there;
`defaults(raw)` takes the state file's section; and `on(fn)` adds a listener, told whenever what the
display shows changes. `main.js` makes one store at start-up, applies it before the first frame,
and on every change gives the knight its look, the engine its input and the words their size and
clock. The pure part of `settings.js` loads under Node for the tests.

### The settings screen

**Opening.** Press and hold anywhere on the display for two seconds, with a finger or the mouse.
After a quarter of a second a plate reading HOLD FOR SETTINGS shows above the press, with ten
blocks that fill over the rest of the hold. Lifting early, leaving the display or moving more than
24 pixels cancels it. A press lifted within half a second is a tap, and its click goes through as
before: in live mode it toggles full screen, and in the demo with the bar hidden it brings the bar
back. The click of any other press is swallowed, the one whose hold opened the screen among them,
so the screen that has just opened under the finger is not tapped by the release. The display asks
for no menu, no selection and no scrolling on a long press (`touch-action: none` on `#surface`).

**Layout.** A side rail of five pages, the knight, the monarch, display, quiet scenes and status,
with DONE at the top right. The screen covers the whole window, review bar included; the scene
keeps running behind, dimmed, and shows each choice as it is made. Every choice applies at once,
with no Save button. On a window up to 1200 wide or 760 tall the screen is drawn a little tighter,
with labels above their choices and the house's preview left out; every touch target stays at
least 48 pixels tall.

**The knight.** Build, weapon, skin tone, hair colour, hair style, tabard and plume, each a row of
choices; names and colours come from the base pack. The builds are A, B and C, and those the base
pack declares are ready; the others are greyed with a dashed border and say Coming, and a tap on
one says in a line under the row that it is not drawn yet and changes nothing. Beside the rows the
knight's own code draws the knight with the chosen look, helmet on and helmet off, every frame,
and the house with the gear at rest. On the code path the page says the look cannot show until the
base pack can be used, and keeps the choices.

**The monarch.** The three monarchs, each a crop of the court's own drawing in the chosen skin, and
the six skin tones of the base pack; beside them the chosen monarch at court.

**Display.** The headline size (small, medium, large), the clock (24 hour, 12 hour) and the helmet
indoors (off in the house and the smithy, or kept on everywhere).

**Quiet scenes.** The four quiet scenes, each with a picture drawn by its own code and a switch.
The last one in the rotation cannot be switched off, and a line says "One scene at least stays in
the rotation."; a scene switched back on joins the end of the rotation. One length for every scene:
5, 10, 15, 30 or 60 minutes, and a length set elsewhere outside those shows as a choice of its own.
In the demo, while nothing sets the length, a line says the demo shows each scene for a minute.

**Status**, read only: the page's version (the deploy's hash, or `dev`), how long ago the state file
was written and how often the collector writes it, the sources in it (all working, or each failing
one with its error and the time of its last read), where the knight is drawn from with the base
pack's id, version and whether it is signed, and the packs refused, each with its step and reason.

**Reset.** Each editable page ends with USE THE CONFIG DEFAULT and a line saying whether the
display has its own choices and what the default is, and whether that comes from `config.toml`.
The button clears this display's saved choices for the section, so it falls back to the defaults;
on the two look pages it clears the whole look, knight and monarch, which is one section. A row a
hook sets says "The page's address sets this for now."

**Closing.** DONE, Escape on a keyboard, or 60 seconds without a touch. The footer says so, and for
the last 10 seconds counts down in amber. Any touch, scroll or key inside the screen starts the
minute again. A tap on the dimmed edge does nothing else, so a hand brushing the frame does not
close it.

**The demo and its review bar** keep working beside the screen. The bar's buttons still act at once;
its helmet and headline buttons act as the address's `h=` and `hs=` do (`KW.hooks.fixed`),
outranking the saved choices until the page is opened without them, and the screen, which covers
the bar while open, shows those rows as set by the address. Its quiet scene buttons keep one scene
as `is=` does, over the rotation. Everything chosen on the screen in the demo is saved as in live mode.

**The calls.** `KW.settings.mount({ store, surface, info, time })`, from `main.js`, builds the
screen into `#kws` and `#kws-cue` in `index.html`: `surface` is where the hold is watched, `info()`
gives the status page `{ version, mode, view }`, and `time()` the time the knight's preview is
drawn at, the frozen time when `t=` freezes it. It returns `open(page)`, `close()`, `isOpen()` and
`cue(x, y, q)`. Nothing of the screen is drawn while it is shut, so with it shut and nothing saved
the page looks exactly as before there were settings.

### The engine's input

`KW.engine.input` (see the head of `engine.js`) takes from the settings `turns`, the quiet scenes
that take turns, in order (all four, `TURNS`, when it is left out or empty), `turnMs`, how long
each lasts, `mon`, the monarch, and `monSkin`, the monarch's skin, which the engine passes to the
scenes in `s`. The demo's `apply()` and `main.js` add them with `KW.ui.extras(ownMs)` whenever they
build the input.

## The address

The hash holds the demo's settings and a set of test hooks. `h=`, `hs=`, `t=`, `kx=`, `pl=`,
`set=` and the settings hooks (`arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, `mon=`, `ms=`, `ck=`)
also work in live mode. `f=`, `e=`, `sw=` and `th=` act in the demo and do nothing elsewhere. The
settings hooks, `h=` and `hs=` are the highest of the settings' levels (see [Settings](#settings)):
each outranks this display's saved choices and the state file's defaults while the address holds
it, and a value it does not know is ignored, with a line in the console, so that the next level
down is used.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `thing`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
| `is=` | the quiet scene: `auto` for the rotation the settings choose, or `battlement`, `camp`, `house`, `yard` to keep one. The cellar, smithy and court come from conditions |
| `h=` | the helmet: `auto` (off in the house and the smithy), `on`, `off`. Without it the settings' helmet indoors chooses between `auto` and `on` |
| `hs=` | the headline size: `s`, `m`, `l`. Without it the settings' headline size |
| `bar=0` | hides the review bar |
| `demo=1` | runs the demo loop |
| `t=` | freezes time at that many ms, `t=0` included, for screenshots |
| `e=` | plays an event: `goblin`, `crate`, `feast` |
| `f=` | starts with that many flies |
| `sw=1` | starts a swat |
| `kx=` | places the knight, in units of `U` |
| `mon=` | the monarch at court: `a` the king, `b` the queen, `c` the monarch who is neither |
| `ms=` | the monarch's skin: the id of one of the base pack's skin swatches, such as `ms=deep` |
| `ck=` | the clock: `24`, or `12` for 9:42 with a small PM |
| `set=` | opens the settings screen at load on a page: `knight`, `monarch`, `display`, `quiet` or `status`. `set=hold` instead shows the cue of the hold seven tenths of the way through, over the knight's head, and leaves it there; for screenshots |
| `th=` | the demo's list of watched things: kinds separated by commas, each followed by `-` for down or `!` for down and alerting, placed by the filling rule. `th=pi,camera!,camera,machine,vm-,x` fills the pie's place, two high places and three ground places, the third with the plain box. An empty item is an entry the page cannot read. Without the hook the demo shows the pie alone, gone while `pi_silent` is on. With `thing_down` on, the knight looks towards the first thing that is down and alerts |
| `arm=` | the knight's weapon: `one` the base pack's arming sword in one hand and its heater shield in the other, `two` the greatsword. A page that cannot draw from the base pack draws the greatsword whatever the hook says |
| `sk=`, `hc=`, `tb=`, `pm=` | the knight's skin, hair colour, tabard and plume: the id of one of the base pack's swatches, such as `sk=deep&hc=black&tb=sable&pm=gold` (the ids are in [packs.md](./packs.md#the-base-pack)) |
| `hy=` | the knight's hair style: `short`, `tied` or `curls`, the base pack's `hair.<value>` |
| `pl=1` | outlines the scene's seven places and names them (`P`, `H1` to `H3`, `G1` to `G3`): the place's box, the 80 by 64 a thing may fill inside it, and the base. The pie's place is white, high places blue and ground places amber, and a place in front of the knight has a broken outline |

`e=` and `sw=1` act 300 ms after the page loads, or before the first frame when `t=` freezes time.
With time frozen the knight never starts a swat alone, so the flies of `f=` hover until `sw=1`
starts one, and a knight placed away from their spot by `kx=` stays exactly there, in mid-stride,
rather than walking a step in each frame.

The look hooks (`arm=`, `sk=`, `hc=`, `hy=`, `tb=` and `pm=`) take the values the contract gives
the look in [state.md](./state.md) and keep screenshots the same whatever a display has saved; on
the code path they do nothing. A value outside the contract's is ignored, as at every level.

The demo rewrites the hash as its settings change, with the contract's ids in `on=`. It writes
`h=` and `hs=` only when the address named them or the review bar's buttons set them
(`KW.hooks.fixed`), so that a reload keeps the bar's choice and otherwise leaves the settings' in
force. The test hooks (`t=`, `kx=`, `th=`, `pl=`, `set=`, the settings hooks, `f=`, `e=` and `sw=`)
are read once when the page loads, and the rewritten hash leaves them out, so they last until the
page is opened again.

## Deploying

```bash
tools/deploy.sh /path/to/served/folder
```

The tool copies `web/` into the folder, leaving the folder's `data/` (where the collector writes)
alone and deleting any other file that `web/` no longer has. It then stamps the copy, and only the
copy, with a version: the first 12 hex characters of a sha256 over the names and contents of the
files of `web/`, in a stable order and leaving `data/` out. It writes `version.json` as
`{"version": "<hash>"}`, sets the `kw-version` meta tag of `index.html` to the version, and appends
`?v=<hash>` to every local script and stylesheet address there, the pack carriers included, so a
new version is fetched under addresses no cache has seen. A deployed copy's version is not `dev`, so
it reads only packs that carry a signature that verifies, and draws the knight from code when the
base pack does not. The tool leaves `data/packs/`, where the collector writes the packs it downloads, alone
with the rest of `data/`. The fonts the stylesheet loads are not stamped. A deploy that changes
nothing in `web/` gives the same version and reloads no open page. The version does not depend on
git, so the tool works from an exported copy too. It refuses a folder that is `web/`, lies inside
it or holds it, and an `index.html` whose meta tag it cannot find. Open displays reload within
about five minutes of a deploy that changes something.

## Checks

Syntax, from the repository's root:

```bash
for f in $(find web/js web/packs -name '*.js'); do node --check "$f" || exit 1; done
```

The mapping from a state file (the watched things and the fallback to the pie among it), `judge`,
the rules for events and the decision to reload, the props of the watched things, the knight's
drawing and rig on both paths, the base pack, the pack library, and loading the packs with what
is drawn when they fail:

```bash
node --test tests/web/
```

`tests/web/knight.test.js` checks the knight call by call. It loads the scripts `index.html` loads
that the knight's drawing needs (`draw.js`, `sprites.js`, `props.js`, `knight.js`, the house and the
smithy, `ed25519.js`, `pack.js` and the carriers, in the page's order) under Node with an empty
`window` and a fake canvas context that records every call and every property set;
`KW.things.draw` writes one line in the record. It chooses the knight's source as `main.js` does
and draws 112 records: the knight in 94 poses, the bare head in bed twice, the speech bubble twice,
the helmet and the weapon at rest in four, and the house and the smithy in ten, each painted and
drawn in the states that show the gear at rest. It compares each record with the one stored in
`tests/web/fixtures/knight/`. It does this twice: once as a deployed page, which refuses the
unsigned base pack and draws from code, and once as a `dev` page, which draws from the base pack.
The stored record was taken from the code, and both paths must give it. For every pose it holds the
number of calls, a hash of the whole record and a hash of each block of 128 calls; for one pose it
holds the full record. Equal calls mean equal pixels, so a change that should leave the knight
alone is checked in about a second, before the screenshots. A failure names the pose and the block
of calls where the first difference lies, or the exact call in the pose stored in full.

One spelling is allowed to differ on the pack path. The pack writes the helmet's translucent shade
as `rgba(60,30,20,0.18)`, as JavaScript writes the number, where the code writes
`rgba(60,30,20,.18)`; a canvas reads both as the same colour. Before the pack path's record is
compared, the alpha of such a fillStyle loses its leading zero. Every other character is compared
as drawn, and the screenshots confirm the pixels.

`tests/web/props.test.js` loads `draw.js`, `sprites.js` and `props.js` the same way and checks each
kind of watched thing: that it stays inside 80 by 64 above its base, up and gone; that its moving
part is only its lamp, inside the place, in both states; that the lamp fades green to black over
3.6 seconds while up and red to black over 2 while down; that its still part does not change with
time; that gone differs from up; and that the pie in parts draws what the whole pie drew. For the
raspberry it checks that it lights on the lamps' loops, up and down, is not in the up pie's still
part, and stays inside the pie's place. It prints the calls each part costs.

`tests/web/foe.test.js` loads the page's scripts the same way, the engine included, and checks the
foe player and the goblin in `KW.props.FOES`: that the goblin's drawing matches its measures; that
the entrance runs in order and the poof is over within the event's 3.4 seconds; that the goblin
stands in the scene's `foeZone`, clear of the knight, the pie and every watched thing on the
ground, and does not come when there is no room; and, for the greatsword from the base pack and
from code and for the arming sword, at every spot the knight strolls to in both scenes, that the
goblin stands within the weapon's reach, that the blade comes within 3 pixels of its crown at the
hit and of a drawn pixel of its sprite, that the hit pose plays only from that moment, and that the
blade never enters any drawn pixel of the goblin by more than 2. A blade too short to reach it
anywhere keeps the goblin away.

The same knight test checks the choice itself: the console lines, the refusal at the `signature`
step, the code path when there is no base pack, a broken one or no library, a changed colour in the
pack showing on the knight, and the clamping of `drop` and `bloat`. For the face it checks that a
changed skin ramp, cheek, puffed cheek and hair brow show on the pack path and change nothing else;
that each of the 36 pairs of the base pack's skins and hair colours, in the quiet, sick, hot,
memory-tight, WAN-down and hungry faces, helmet on and off, and the sick head in bed, draws its own
face band, lids, cheeks, puffed cheeks and brows and no colour that belongs only to another skin or
another hair's brows; and that the brows keep contrast against every skin: each brow is drawn with
the dark edge exactly when its contrast with the skin bands it lies on, worked out in the test
apart from `knight.js`, is under 2.5, the 22 such pairs are the expected ones, today's warm skin
with brown brows not among them, and the edge is darker than every skin band it lies on. For the crate it
checks, from the base pack and helmet on and off, with and without the bob, every 100 ms over the
sway, that it is drawn after the pauldrons and before the arms, that its hands are at its lower
corners, that no pixel of it lies on the helmet's opening or the bare face, and that nothing of the
load rises above the helmet. The call record holds the code path to the same calls.

To see every call that differs, dump the records of both trees and compare the folders.
`dump-pack:` dumps the pack path's records instead of the code's:

```bash
KNIGHT_LOG=dump:/tmp/kw-calls-old node --test tests/web/knight.test.js        # in the tree before
KNIGHT_LOG=dump:/tmp/kw-calls-new node --test tests/web/knight.test.js        # in the tree after
KNIGHT_LOG=dump-pack:/tmp/kw-calls-pack node --test tests/web/knight.test.js  # the pack path
diff -r /tmp/kw-calls-old /tmp/kw-calls-new
```

`tests/web/loading.test.js` checks the downloaded packs, the refusals and their console lines, the
fallback to the base pack's defaults, the code path in every case of failure and a throw inside a
draw list, and that `look()` draws a new look from the packs already loaded, a downloaded one
included, where `start()` again would lose it; see
[packs.md](./packs.md#tests).

`tests/web/settings.test.js` checks the settings: the order of the levels key by key, a value each
level does not know ignored with one console line, a section that is not an object, the builds
ready from the base pack, a choice saved under `knightwatcher.settings` and read back, a stored text
or value the page does not know, a browser that refuses storage on reading, on writing or both, the
reset of each section, when listeners are told, the state file's `defaults` from a fixture
(`fixtures/state-defaults.json`) through `KW.state.map` to the store, the engine's input, and the
12-hour clock, `12:05 AM` and `12:30 PM` among it. In a sandbox it checks the engine's quiet
rotation, the monarch's skin (the court's own calls for the warm swatch, and each other swatch's
colours alone for every monarch), and `look()`. It also draws the knight from the base pack in every
combination the settings offer, weapon by skin by hair by hair style with the tabard and the plume
cycled, 216 looks, each standing, attacking and swinging both ways, helmet on and off, the bare head
and the gear at rest, and checks that none throws, falls back or passes the caps, and that its
colours are drawn; and every monarch in every skin.

The stored record changes only when the knight is meant to look different. Store it again from the
code as it is with `KNIGHT_LOG=write node --test tests/web/knight.test.js`, and look at the
screenshots before trusting it. A change to the knight's look then changes the base pack too, so
that both paths still give the stored record.

The deploy tool, which it runs against temporary folders and copies of `web/`, never the
repository's own, and the pack carriers against their pack files:

```bash
node --test tests/tools/
```

The regression screenshots, with `CHROME` pointing at a headless Chromium. Take a reference set
before a change and a result set after it, both outside the repository, then compare them. The
comparison leaves the clock out, since its digits change with the minute.

```bash
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

Besides the scenes and states, the set shoots watched things: the camp with two cameras and four
devices, a camera and a machine down and one device with no place left (`things-camp`), the court
with the same mix (`things-court`), `thing_down` in the camp (`thing-down`) and the yard's places
outlined (`places-yard`). Every other shot has no `th=` apart from `goblin-camp-g3`, so a change to
watched things that leaves a Pi-only setup alone leaves those shots byte for byte the same.

The seven `goblin-` shots play the goblin's event with the greatsword: on the battlement as it
rises over the wall (`goblin-rise`), at the hit (`goblin-bonk`, 1659 ms) and in the puff
(`goblin-poof`); at the camp as it comes out of its hole (`goblin-camp-rise`), at the hit
(`goblin-camp-bonk`, 1659 ms) and in the puff (`goblin-camp-poof`); and at the camp with three
devices on the ground, which it stands clear of, as it pulls a face (`goblin-camp-g3`).

The nine `arm-` shots draw the arming sword and the heater shield (`arm=one`): the quiet battlement
(`arm-battlement`), the yard's hot training (`on=cpu`) mid-swing (`arm-yard`), the attack
(`arm-attack`), the house with the sword on the pegs and the shield on the wall (`arm-house`), the
smithy with the sword on the anvil and the shield on the wall (`arm-update`), the swat to the left
at the moment the sword passes in front of the shield (`arm-swat-left`), the cellar with the
crate carried against the chest, at the largest headline (`arm-disk`), and the goblin a
millisecond after the hit on the battlement (`arm-goblin-bonk`, hit at 1645 ms) and two after it
at the camp, with the blade over the shield (`arm-goblin-camp-bonk`, hit at 1672 ms). Every other shot but `settings-look` has no `arm=`, so a change to the one-handed look leaves them
byte for byte the same. A copy of the page from before the hook draws the greatsword in the `arm-`
shots, so against such a reference those differ and the rest compare as usual.

The eleven shots that end the set show the settings. `settings-knight`, `settings-monarch`,
`settings-display`, `settings-quiet` and `settings-status` open the screen (`set=`) on each page over
the battlement; `settings-hold` shows the hold's cue; `settings-look` the knight's page with a look
of the hooks', the sword and shield, tan skin, blonde curls, a forest tabard and a gold plume;
`settings-tablet` the knight's page at the tablet's 1480 by 924 (an entry may name a size after a
second `|`, and the comparison scales the clock's mask with the shot); `settings-monarch-skin` the monarch's page with monarch B in the deep skin; `clock-12`
the 12-hour clock (`ck=12`), whose digits the comparison leaves out with the rest of the clock; and
`mon-skin` the court with monarch C in the brown skin (`ms=brown`). Against a reference from before
the settings these eleven are missing and the rest compare as usual.

The seven `look-` shots choose free options with the look hooks: deep skin with black curls, a
sable tabard and a gold plume on the battlement, helm off (`look-deep-curls`); fair skin with
auburn hair tied back, a wine tabard and the sword and shield in the yard, helm off
(`look-fair-tied`), and the same with the helm on, the tail showing below it, and a white plume
(`look-tied-helmet`); golden skin with blonde hair, a teal tabard, the shield on the house's wall
and a royal blue plume on the helmet on the stool (`look-house`); a sick face in bed on the deep
skin, with dark brown hair tied back (`look-sick-deep`); a hot face on the brown skin with silver
curls in the yard (`look-hot-brown`); and the wide eyes of WAN down on the brown skin with brown
hair, whose brows draw the dark edge (`look-brows`). Every other shot but `settings-look` uses no look hook but
`arm=`, so against a copy of the page from before the hooks only these seven differ.

Headless Chromium paints few animation frames, and how many depends on how busy the machine is.
Freeze time with `t=` for screenshots, and never make the first frame wait on elapsed time or fade
in. With time frozen the events and the swat start before the first frame and nothing advances from
one frame to the next, so every shot depends only on its address: two takes of the same tree come
out byte for byte the same, on a busy machine too, apart from the clock when the minute turns.

The repository's page is a `dev` page, so the screenshots show the knight drawn from the base pack.
A deployed copy draws from the base pack too while it ships signed, and from code otherwise.
`shots.sh` shoots only from disk, so to look at a deployed copy and its downloaded packs, serve it
on the loopback address and point the headless browser at `index.html?demo#<hash>` by hand: `?demo`
starts the demo at once instead of waiting for a state file, and a served page fetches
`data/packs/` in every mode.

To shoot the code path from disk, copy `web/` to a folder outside the repository and give the
copy's `kw-version` meta tag any value but `dev`; a page opened from disk runs the demo whatever
its version. Take the copy's signature off its base pack with
`node tools/sign-pack.js --unsign <copy>/packs/base.pack.json`, so that the copy refuses it and
draws from code whichever state ships. Do it before and after a change and compare each path's two
sets:

```bash
cp -r web /tmp/kw-code && sed -i 's/name="kw-version" content="dev"/name="kw-version" content="code"/' /tmp/kw-code/index.html
node tools/sign-pack.js --unsign /tmp/kw-code/packs/base.pack.json
CHROME=/path/to/chrome-headless-shell PAGE=/tmp/kw-code/index.html tools/shots.sh take /tmp/kw-ref-code
```

The comparison prints `identical bytes` only when both sets show the same minute on the clock;
otherwise `pixels equal outside the clock` is the same result. To get identical bytes, take the
reference and the result back to back within one minute (a set takes about ten seconds), from a
copy of the old tree and the new one.
