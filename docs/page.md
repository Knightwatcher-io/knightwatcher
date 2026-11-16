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
| `css/display.css` | the display, the text colours by status, the review bar. The colours and the font of the words over the scene are read through CSS custom properties that the world's overlay sets, with today's values as their fallback; see [The words over the scene](#the-words-over-the-scene) |
| `css/settings.css` | the settings screen and the cue of the hold that opens it |
| `fonts/` | the VT323 typeface and its licence |
| `js/draw.js` | `KW.view` (the grid and the canvas's real edges), the palette, the drawing primitives |
| `js/sprites.js` | small symbols drawn by code: `mark`, `heart`, `zed`, `drum`, `spark`, `stroke` |
| `js/effects.js` | `KW.effects`: the effects, drawings the engine owns that a scene names with numbers (sky, stars, bricks, flame and the rest), each with its table of fields, its cost and its drawing; see [The effects](#the-effects) |
| `js/props.js` | props used by more than one scene or drawn by the engine: the greatsword (`swordHD`), `bricksHD` (the bricks effect under its old name, for the previews of the settings screen and the admin page), `barrelHD`, `tableHD`, `sconceHD`, the pie and the other devices (`KINDS`, the code's drawings and the fallback for the pack's, and `pieShapes`, the maps of the pie's lamp and its last slice), their lamps (`LAMP`, `lampLevel`, `lampHD`, `LAMP_REDS`), the fly (`flyHD`, `deadFlyHD` and `CRITTERS`, the code's critters and the fallback for the pack's; see [The cast](#the-cast)), the crate and its parachute, and the foes (`FOES`: the goblin, its poses painted once each, its measures, its crown and its exit, the code's foes and the fallback for the pack's) with the smoke, the sparkles and the hole they come and go by |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into a pose, `rig(o)` turns a pose into the points the knight is drawn on (see [The knight's rig](#the-knights-rig)), `draw(o)` draws the knight in it, from the base pack or from code (see [The knight from the base pack](#the-knight-from-the-base-pack)), `start()` and `add()` load the packs, `fetchPacks()` fetches the downloaded ones and `look()` draws another look from the packs already loaded, `basePack()` gives the base pack in use, `swing()` animates a cut, `ownReturn()` says whether a swing comes back by a return of its own (see [The knight's rig](#the-knights-rig)), `head()` draws the bare head and `speech()` a speech bubble, and `rest` draws the gear a scene shows off the knight (see [Gear at rest](#gear-at-rest)); `build` holds the knight's measurements. It also creates `KW.packText`, which the carriers fill |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court. Each declares the conditions it can act out (`can`). The court draws the monarch in the skin, hair and robe it is given |
| `js/ed25519.js` | `KW.ed25519.verify`: checks a pack's Ed25519 signature, and does nothing else. See [packs.md](./packs.md#the-verifier) |
| `js/pack.js` | the pack library: reads, checks and compiles packs and draws from them; see [packs.md](./packs.md) |
| `js/world.js` | `KW.world`, the scene compiler: turns a scene of a world pack into the scene interface below, and puts the scenes of the medieval world's pack in place of the code scenes of the same names, its devices in `KW.kinds` and its cast in `KW.cast`, which the engine draws them from, and compiles its words and its overlay (`KW.world.words`, `KW.world.overlay`) and builds the quiet line and the captions from the collector's parts; see [worlds.md](./worlds.md) |
| `packs/base.pack.js` | the carrier of the base pack: one line that pushes the text of `packs/base.pack.json` onto `KW.packText`. The JSON file is the source and is not loaded itself; see [packs.md](./packs.md#carriers) |
| `packs/medieval.pack.js` | the carrier of the medieval world's pack, `packs/medieval.pack.json`, which holds every scene, the devices and the cast as data; see [worlds.md](./worlds.md) |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs, and deciding when to reload for a new version |
| `js/engine.js` | the frame: scene choice, strolling, the swat, events and the foe player that plays a foe's entrance, strike and exit (`KW.engine.foe`), drawing order, and the devices in their places (`KW.devices`) |
| `js/demo.js` | the invented conditions, the review bar and the demo loop |
| `js/settings.js` | `KW.settings`: the levels the display's settings come from, the saved settings (the server's, shared by every display, or this browser's own), keeping them in step with the server (`connect`), the look and the engine's input made from them, the clock's words, and the settings screen (see [Settings](#settings)) |
| `js/main.js` | start-up (starting the knight and then the world from the medieval world's pack, setting the overlay's custom properties on the display, reading the address's hooks, applying the settings and mounting their screen, asking the server for the shared settings, fetching the downloaded packs, sizing), the clock and the words over the scene, the choice of mode, the check for a new version |
| `admin/index.html`, `admin/admin.js`, `admin/admin.css` | the admin page, served by the bundled server alone; see [The admin page](#the-admin-page) |

The load order is the order of that table, scenes in the order listed. A file may use what an
earlier file put on `KW` at load time, and anything at all when its functions run. A carrier needs
`KW.packText`, so it comes after `knight.js`; `ed25519.js` comes before `pack.js`, and `effects.js`
comes before `props.js`, the scenes and `pack.js`, which use it. `world.js` comes after the scenes
and `pack.js`, and does nothing at load but define `KW.world`, and `KW.kinds` and `KW.cast` filled
with the code's devices and cast.

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

The present knight is the reference for the other builds: each difference is a build's
measurement less the present knight's, so for the present knight all eight are 0. The base pack
has three builds, Classic (`build.a`, the present knight), Broad (`build.b`) and Slim (`build.c`);
their measurements are in [packs.md](./packs.md#the-base-pack). The anchors lean on the
differences in full. `stance` moves the feet and hips sideways, `leg` raises the hips, the hem and
the belt, `height` raises the neck, the shoulders and the head, `shoulder` widens the shoulders,
and `head` raises the head, so that a bigger skull grows upwards from the neck. `chest`, `waist`
and `hip` move no anchor. The hands and the weapon follow the build too: see the grips below.

**Which build is rigged.** On the pack path the knight is drawn on the look's build, and
`KW.knight.rig(o)` from outside takes the same build when none is passed, so whatever measures the
knight from outside measures the knight drawn. `engine.js` does: `bladeOf` finds the blade on the
rig, and through it `foeGaps`, `contactQ` and the goblin's plan work out where the blade meets the
goblin on the build drawn (see [Modes](#modes)). The weapon is measured by its blade's outline, the
`blade` with 4 pixels along each edge and a little more at the point, unless its drawing is wider
than that beyond the blade's middle by a pixel or more. Such a weapon has a head the outline does
not describe, and `KW.knight.rest.head()` gives the pieces its `main` list draws past the hand, read
once for each look by drawing the list on a frame of its own: each shape as the exact circle or
convex polygon it fills, an ellipse, a rounded rectangle or a pixel shape as the box around it, and
a shape lying wholly inside another left out. The engine then meets the goblin with the drawing
itself, by the distance from each point of the goblin's crown to the nearest piece. Only the mace
has a head: its flanges reach 27 across its frame where its blade's outline gives 20, its knob
reaches 151 along it, past the outline's 143, and its haft is 7 across. Measured as a straight
blade, its swing stopped on the empty corners of that outline, up to 13 pixels short of the goblin,
or let the flanges into it by up to 7. The swords' drawings past the middle are exactly as wide as
their outlines, so they are measured as before. On the code path the knight is always the present
knight. `rig(o, build)` takes another build's measurements, which only the tests pass.

**The grip** is in the result's `grip` and places the hands and `main`:

- `none`, when the sword is put away: the hands hang at `(X ∓ (64 + dShoulder + bloat), Y - (84 +
  dHeight) + drop)`, 10 outside and 48 below each shoulder on every build, so the arm is as long
  and hangs as straight on Broad and Slim as on the present knight, and `main` rests at the root
  with angle 0. The arms are drawn left, then right. With the crate of a
  full disk the hands take the carrying grip instead: they hold the crate against the chest by its
  lower corners, at `neck ± 44` across, plus the crate's sway of up to 2, and 62 below `neck`. The
  crate (`CARRY`, 80 by 64, its top 6 below `neck`, which is 50 below `head`, under the helmet's
  opening and the bare chin) is drawn after the pauldrons and before the arms, so the arms lie
  over its sides.
- `hammer`, in the smithy: the left hand steadies the work at `(X + 45, Y - 104 + drop)`, and the
  right swings the hammer from `(X + 80 + bloat, Y - 122 + drop)`, which is also `main`, with the
  hammer's angle. These do not follow the build: the hands work at the anvil, which stands in the
  scene.
- `two`, the greatsword in both hands: `main` is the middle of the grip and the blade's angle,
  at `(X - 120 + 5 * gx, Y - 300 + 5 * gy + drop - dHeight)`: the poses are written for the present
  knight, and on another build the grip rises and sinks with the shoulder line, so the weapon is
  held where the present knight holds it, relative to the body. The hand on the side the blade
  leans to holds the grip 2 pixels up the blade, the other 30 down it.
  Both arms are drawn before the blade, the one on the lean side first, and the gauntlets after
  it, the upper hand's first. The upper hand sits low enough that its gauntlet stays below the
  guard, which starts 17 up the blade. Once the blade turns past level it slides further down the
  grip (`SLIDE`): not at all up to an angle of 1.4, 2 pixels from 1.8 on, in proportion between. At
  the end of a cut and in the goblin strike's bounce the gauntlet would otherwise reach the guard
  by a pixel at some angles.
- `one`, a weapon in one hand, on the pack path only: `main` is placed as for `two`, and the right
  hand holds the weapon at its one station along the frame (the arming sword's is the grip's
  middle). The left hand, which is also `off`, holds the shield where the pose's `fx` and `fy`
  put it, in units of `U` from the old corner as `gx` and `gy` are, raised and lowered with the
  shoulder line (`dHeight`) as `main` is; with no shield equipped it hangs at the side as in
  `none`. The shield's group (left arm, left gauntlet, shield) is drawn
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
| `SWING1`, to the left: wind-up, cut | 38.8, 23.2, 1.0; 17.2, 40.8, -2.0, with keys between (below) | 12, 37.6; 3.2, 26.4 | the shield lifts as the sword crosses, and the blade passes in front of it |

In the attack the guard sits on the helmet's outer shell, clear of the opening's rim. The wind-up
to the right raises the sword over the right shoulder with the blade upright, a little over the
attack's hand, so the blade never crosses the face on that side. The swing's angle at the cut is
the greatsword's, and both wind-ups lie short of the nearest fly (0.35 less 0.15), so the swat's
hit test in `engine.js` holds for both weapons.

**The swings.** `swing()` reads each swing as a list of keyframes after the stance it starts
from at q 0: a pose (`gx`, `gy`, the angle and, in one hand, `fx`, `fy`) reached at q, by the
easing of the segment that ends there (the page's ease, smoothstep or linear), the last key the
stance again. The cut runs from q .3 to .55 in every swing and ends at the angle 2.0 towards its
side. The blade passes in front of the knight, never behind the head, and a blade that turns from
one side of the body to the other must point past the face on the way, so the swings keep that pass
short and low:

| Swing | Keys after the stance (q: `gx`, `gy`, angle; shield `fx`, `fy`) |
|---|---|
| Two hands, the wind-up | .3: `24 - 14.8 dir`, 33.2, `-1.0 dir`: the hands out past the far shoulder with the blade laid back, so the guard's quillons stay clear of the chin |
| Two hands, to the right | the wind-up; .55: 34, 46, 2.0 (smoothstep); the stance at 1 |
| Two hands, to the left | the wind-up; .55: 14, 46, -2.0 (smoothstep); .68: 16, 43.2, -1.62; .8: 36.8, 42.8, -1.52 (smoothstep); .835: 40.8, 39.6, -0.05 (linear); the stance at 1 |
| One hand, to the right | .3: the wind-up above; .55: the cut above (smoothstep); the stance at 1 |
| One hand, to the left | .3: the wind-up above; .39: 39.6, 34.8, 0.05; 10, 35.6 (smoothstep); .425: 33.2, 40.4, -0.85; 6.4, 32 (linear); .5: 25.2, 40.8, -1.1; 4.8, 29.2 (linear); .55: the cut above (smoothstep); .68: 16, 40.4, -1.62; 7.2, 30; .8: 38.8, 40, -1.45; 16.8, 36.4 (smoothstep); .83: 40, 38.4, -0.05; 18.4, 37.2 (linear); the stance at 1 |

Every segment not marked eases out as the page's other moves do. In one hand to the left the sword
hand drops down the right side to the chest with the blade still upright, the blade turns past the
face between q .39 and .425, is held steep down to q .5 so that it meets the goblin's pot from above
as the straight cut did, and finishes the cut across the shield. Both swings to the left come back
low: the blade is carried level across the waist, pointing left, and turns up only once the hands
are out on the right, instead of turning back through upright over the face. To the right the
two-handed recovery is a single segment, as it always was. The longsword and the mace take these
poses, as they take every other, from the grip their stations give. Every other condition keeps its pose; the sword is
put away where the scene says so (`sword: false` in the house and the cellar, the hammer in the
smithy), and the shield with it.

**The blade past the face.** `tests/web/knight.test.js` draws each swing to the left every 0.004 of
its length on Classic and counts the steel (everything from 17 along the frame) lying on the head as
drawn, on the eyes (from the head anchor, x -37 to 37, y -21 to 12): under 50 ms of the 900 with the
arming sword and the heater shield, under 70 with the greatsword. It also draws the two-handed
wind-up from q .25 to .3 both ways on every build, and finds no steel on the eyes, the mouth (y 12
to 23) or the chin (x -46 to 46, y 23 to 50).

**No arm over a blade or a shield.** `tests/web/knight.test.js` draws every frame the engine can
draw with the weapon held (both swings at every hundredth of their length and at every odd
thousandth from q .451 to .619, where the blade is past level; the attack's tremble every 10 ms for
two seconds; the goblin's strike on both sides, from contacts at q .45, .5, .53 and .55 through its
bounce and recovery every 10 ms, with the engine's own `strike()`; the stance of each condition
that holds a weapon; and the largest bloat), keeps the pixels each of the look's lists fills, and checks, in the order the frame was
drawn in, that no arm or gauntlet drawn after the weapon fills a pixel of its blade or guard and
none drawn after the shield fills a pixel of the shield. For every weapon the check takes the blade and the guard,
everything from 17 along the frame, where the swords' guards begin and the mace's haft is clear of
the hand, and checks the gauntlets as well as the arms. It runs for every weapon of the base pack,
every shield with each one-handed weapon, and the mail and padded sleeves and gloves, on every
build.

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
base pack's greatsword the same 2 and -30, and for its arming sword the one station 0. The
longsword's are the greatsword's and the mace's the arming sword's, so each is held, swung and
raised exactly where those are.

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
choice of path itself. A scene from a world pack asks through the `rest` mark, which the scene
compiler turns into the same calls ([worlds.md](./worlds.md#the-scene-compiler)):

| Call | Does |
|---|---|
| `draw(slot, x, y, a)` | draws the equipped item of `slot` at rest. `'helmet'`: the helmet's rest view on the `rest` anchor at `(x, y)`, the middle of its foot on a surface, with the plume's rest view behind it on the view's plume mount. `'off'`: the shield's rest view on the `rest` anchor at `(x, y)`, the top middle of a `hang` place, which for the base pack's shield is the nail it hangs from. `'main'`: the weapon's worn shapes on a frame with the middle of its grip at `(x, y)` along the angle `a` (0 is straight up, and `Math.PI / 2` lays it flat with the point to the right). Any other slot draws nothing, and on the code path `'off'` draws nothing, since the code path has no shield |
| `blade()` | the equipped weapon's `blade`, `{ from, to, half }` in frame units, or `null` when it gives none. On the code path, the greatsword's `{ from: 34, to: 263, half: 15 }` |
| `key(slot)` | the equipped item's name, `<pack>/<item>`, or `''` when the slot is empty; `'code'` on the code path |
| `fits(slot, place)` | whether the equipped item of `slot` may rest in `place`, `{ kind, w, h }`: its rest view's `fits` is the place's `kind` and its `box` no wider than `w` nor taller than `h`. Always true for `'main'`, which has no rest view, for an empty slot or an item without a rest view, and on the code path |

On the pack path a helmet with no rest view shows nothing on the stool, and a helmet whose rest
view has no plume mount rests without its plume. A shield with no rest view, or no shield, shows
nothing on the wall; and a shield is equipped only with a one-handed weapon, so with the
greatsword no shield hangs anywhere. Gear at rest does not move with the knight, so it
is drawn with every named value 0, from anchor and value arrays of its own made once at start-up; a
call allocates nothing.

**The places.** A scene declares the places where it sets gear down in its `rests` field, beside
`places`, which holds the devices' places. The engine does not read `rests`: the scene
passes a place's numbers to `draw`. A scene compiled from a world pack gives its `rests` in the same
form, its angles `"flat"` and `"upright"` as `Math.PI / 2` and 0 and its `"from": "spot"` left out,
and its `rest` marks pass the numbers.

| Scene | Place | Holds | Fields |
|---|---|---|---|
| house | `stool` | the helmet | `kind: 'surface'`, `x` 460 and `y` 476 the middle of the stool's top, `w` 76 by `h` 80 the room above it |
| house | `pegs` | the weapon | `x` 618 and `y` 228 the middle of the grip, `a` `Math.PI / 2` |
| house | `wall` | the shield | `kind: 'hang'`, `x` 844 and `y` 164 the nail in the beam right of the pegs, `w` 100 by `h` 140 the room below it |
| smithy | `anvil` | the weapon | `x` 50, counted from the knight's spot `s.kx` so that the blade lies where the hammer falls; `y` 425; `a` `Math.PI / 2` |
| smithy | `wall` | the shield | `kind: 'hang'`, `x` 145 and `y` 312 the nail on the wall over the quench barrel, `w` 100 by `h` 132 the room below it |

The `kind`, `w` and `h` give a place in the shape the pack format gives places. The code scenes
draw what they always drew; a scene from a world pack asks `fits()` first and draws a helmet or a
shield only where its rest view fits the place, which every view of the base pack does in every
place the medieval scenes give. The house's two pegs sit under the weapon's blade,
28 past where it starts and 45 short of its point, from `blade()`: for the greatsword at 680 and
836, where they always were, for the arming sword at 680 and 748, and for the mace, whose `blade`
names its haft and head, at 680 and 709. A weapon with no `blade` gets
the greatsword's pegs. The house's shield clears the arming sword's point on the pegs, the jug on
the mantel and a camera at the house's high place `h2`, which stays where it was, at 926; a test
draws that camera and its question mark and checks them against both swords on the pegs, the
shield, the window and the knight at every spot of the house's rounds.

**The hot tip.** The smithy draws the glowing tip of the blade on the anvil from `blade()`, in
frame units along the blade from `to`, the point, and across it from `half`, the distance from the
middle to each edge: three bands of heat starting 73, 57 and 43 short of the point and reaching to
30 short of it, each `2 * half + 1` tall, then the point itself, a light along each edge and a glow
around it. For the greatsword these are the numbers the smithy always drew. A weapon with no
`blade` has no hot tip. The smithy from the medieval world's pack draws the same hot tip as part of
the anvil's act in the scene compiler, with the same numbers, where a `rest` mark for the weapon at
the anvil's rest stands in a moving layer ([worlds.md](./worlds.md#the-scene-compiler)).

**The backdrop key.** The house and the smithy paint the weapon and the shield into their cached
backdrop, so each adds `KW.knight.rest.key('main')` to its key, and `'|'` and
`KW.knight.rest.key('off')` when a shield is equipped, and a change of gear paints the backdrop
again: on the pack path the house's key is `tv|kw.base/main.greatsword` with the television on, and
the smithy's `440|kw.base/main.greatsword` at its spot; with the sword and shield the house's is
`|kw.base/main.arming|kw.base/off.heater` with the television off. The helmet on the stool is drawn
every frame, so it adds nothing. The smithy from the medieval world's pack works its key out from
what its still layers paint: the spot, since the anvil's rest counts from it, then the shield's name
and the weapon's, each after a `'|'`, so `|440||kw.base/main.greatsword` at its spot with no shield.
The strings differ from the code smithy's, and they tell the same states apart. The house from the
pack keys its backdrop `10|kw.base/main.greatsword|` with the television on and `01|...` with it
off ([worlds.md](./worlds.md#the-scene-compiler)).

## The scene interface

Each file in `js/scenes/` registers one object on `KW.scenes` under the scene's name, and draws
nothing outside it. The engine reads only what is listed here, and sets the grid's transform
before it calls `paint`, `draw` and `over`. A scene may also come from a world pack: the scene
compiler (`js/world.js`) builds an object with this same interface from the pack's data and puts it
in the code scene's place, which a `dev` page does today for every scene ([worlds.md](./worlds.md)). The compiled scene works out its own `key`, gives `outdoors` from the
pack's `hosts`, and `foeZone` and, where the foe has a wall, `wallAt` from its `foe`.

| Field | Required | Meaning |
|---|---|---|
| `spot` | yes | where the knight stands on arrival, in units of `U` across the grid |
| `places` | yes | the places for devices: `pie`, three high ones (`h1` to `h3`) and three on the ground (`g1` to `g3`); see [Devices](#devices) |
| `rests` | no | the places where the scene sets the knight's gear down, by name; the scene reads them itself, see [Gear at rest](#gear-at-rest) |
| `draw(t, s)` | yes | draws the scene at time `t` in ms: everything on a scene without `paint`, otherwise what moves. It calls `KW.devices.draw(t, s)` at the point where the devices behind the knight belong in its drawing order |
| `rounds` | no | the spots the knight strolls between while free to move: `[{ x, act, dur }]`, `x` in units of `U`, `dur` in seconds, `act` one of `guard`, `look`, `sniff`, `yawn`, or a name the scene's `act` handles |
| `paint(s)` | no | the still part, painted once into a cached canvas and kept until the key or the screen's shape changes |
| `key(s)` | no | a string; the cached backdrop is painted again when it changes. A scene that paints the knight's gear at rest into its backdrop includes `KW.knight.rest.key(slot)` for each such item |
| `act(t, s)` | no | called each frame after strolling and before the swat and events; may change the knight's pose `s.o` |
| `over(t, s)` | no | drawn after the knight, the flies and the events |
| `wallAt(x)` | no | the y of the top of whatever a foe climbs over at grid x; without it a foe digs up out of the ground |
| `foeZone` | no | where a foe may stand: `{ side, spans }`, the side of the knight tried first (`1` right, `-1` left) and the spans of grid x, `[[x0, x1], ...]`, where its middle may stand clear of the scene's own props. The engine also keeps it clear of every place holding a device on the ground or the pie, and 150 to 240 pixels from the knight's middle, within the reach of the weapon the knight holds; with no room the event shows its caption alone. A scene without it hosts no foe |
| `outdoors` | no | `true` where flies are swatted and the crate may land |
| `bed` | no | `true` where the knight takes to bed for `night` and `container_unhealthy` |
| `helmet` | no | `false` where the helmet comes off (unless the address says otherwise) |
| `sword` | no | `false` where the knight puts the sword away |
| `can` | no | the conditions the scene can act out, by the contract's ids, such as `['disk_full', 'backup_overdue', 'cpu_hot']` for the cellar: plain data, which a world pack carries as the scene's `can`. A condition plays in a scene the settings chose for it only when that scene lists it, and the settings offer a choice only between scenes that list it (see [Settings](#settings)); a scene without it is never chosen. [design.md](./design.md#scenes-chosen-per-condition) gives the table and the reasons |

`s` is the same object for every call in a frame:

| Field | Meaning |
|---|---|
| `w` | the winning condition: `{ id, lv, st, scene, hl, sub }`, or the idle one with id `idle` |
| `devices` | the devices standing in the places, each `{ place, kind, ok, alert }` with `place` the name of one of the scene's places |
| `places` | the scene's `places` |
| `tv` | whether the television is on |
| `kx` | the knight's x on the grid |
| `o` | the knight's pose for this frame |
| `here` | where the knight stands in the scene's `rounds`, `{ act, el }` with `el` the ms spent there, or `null` |
| `inBed`, `helmOff` | whether the knight is in bed, and whether the helmet is off |
| `strike` | free for a scene's `act` to pass to its `draw` (the smithy's hammer blow) |
| `patron` | the patron at court, the monarch, from the engine's input (the settings): `{ id, skin, hair, robe }` |
| `patron.id` | `a`, `b` or `c` |
| `patron.skin` | the monarch's skin, `{ id, face, cheek }` from one of the base pack's skin swatches, or `null` for the court's own, which is the warm swatch's colours |
| `patron.hair` | the monarch's hair, `{ id, bands, brow }` from one of the base pack's hair swatches (its three bands and its brow), or `null` for each monarch's own |
| `patron.robe` | the monarch's robe, `{ id, bands }` from one of the base pack's tabard swatches (its four bands), or `null` for each monarch's own |

Some scenes reach further. The house draws the sleeper's head with `KW.knight.head`, the helmet on
the stool and the weapon on the pegs with `KW.knight.rest`, and its Zs at night in `over`. The
court paints the patron that `s.patron.id` names, in the skin `s.patron.skin` gives and the hair
and robe `s.patron.hair` and `s.patron.robe` give, into its backdrop, keyed on all four (`b|deep`, `a|` for the
court's own skin, and `b|deep|silver|teal` or `c|||wine` once a hair or a robe is given), sets the
knight talking in `draw` and draws the monarch's speech bubble with `KW.knight.speech`. It also
gives `drawn(mon)`, each monarch's own hair and robe colours, from its patron, for the settings
screen's "As drawn" choices. The monarch itself is the patron's drawing ([The cast](#the-cast)). How a swatch's bands become the monarch's is in the comment above `hairOf` in `court.js`. The smithy's `act`
sets the hammer and `strike`, its `paint` lays the weapon across the anvil with `KW.knight.rest`,
and its `draw` puts the hot tip on the blade. The yard keeps
the time the dummy was last struck and swings the knight's sword in `act`.

## The effects

`js/effects.js` holds the procedural drawing the scenes share, which no fixed list of shapes can
say: stars at hashed points, pines whose tiers depend on a hashed height, a flame whose points move
by two sines, anything filled out to the screen's real edges. Each is an effect of `KW.effects`,
named as the world format names it, and a scene calls it with its fields as a world pack's `fx`
shape gives them:

```js
E.bricks.draw({ p: [HL, HT], w: HR - HL, h: HFL - HT, size: [64, 26], of: WALL, mortar: '#0d0a11', seed: 5 });
E.flame.draw({ p: [704, HFL - 14], size: 1.05, dt: 400 }, t);
```

Each effect has:

- `fields`, its table: each field's kind, range and default. A field with a default may be left
  out. The kinds are `point` (an `[x, y]` pair of scalars), `offset`, `length` and `term` (a scalar:
  a number, or in a pack a term over the screen's edges, the tile's x, its hash or a wave), `num`
  and `int` (a plain number, or whole number, from `lo` to `hi`), `pair` (two plain numbers, each
  in its own range), `colour`, `colours` and `ints` (lists of `min` to `max`) and `one` (one of a
  few values). `pack.js` holds a world pack's effects to these tables ([packs.md](./packs.md#shapes-coordinates-and-terms)).
- `cost(b)`, the most fills its drawing makes for fields whose bounds are `b`: `fillRect` calls,
  and 3 for each glow. In `b` each scalar is its least and greatest, a point two of those, any
  other field its value, and `b.view` the screen's edges `L`, `R`, `T` and `W`. `KW.effects.bounds(name,
  fields, view)` gives `b` for fields drawn on a screen; `pack.js` works it out from a pack's terms
  over the ranges its checks assume. `glows(b)` is the most glows it draws.
- `draw(f, clock)`. `clock` is the scene's time in ms for an effect that moves (`clock` is `time`),
  and for `burst` (`trigger`) the ms since its trigger for straw and the burst's progress from 0 to 1
  for sparks, which is how each was timed. A still effect takes none.

The tables reach nothing on `KW`, so the file loads under Node alone, where `pack.js` asks for it
beside itself the first time a pack names an effect.

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

`tests/web/effects.test.js` checks that each cost bounds the fills drawn, and the call records of
`tests/web/scenes.test.js` that the scenes draw through the effects exactly what they drew before.

**What stays in the scenes.** Drawing that is not shared and does not reach the screen's edges stays
in its scene, as plain shapes, loops of fixed shapes (the world format's tiles) or the engine's own:

- loops with a hash of a fixed index, which a pack writes out as the fixed shapes they are: the
  stars in the house's window, the grain of the camp's log, the ash by the smithy's forge, the straw
  of the yard's bales, and the grain of the table (`tableHD`, in `props.js`);
- tiles: floors, planks, posts, rafters, merlons, the yard's pebbles, the court's pillars and floor
  squares, the cellar's brackets and piers (each pier's bricks an effect inside the tile);
- the dummy, the television, the candle, the blanket and the sleeper's Zs, the hammer's act, the
  monarch and the ermine: the acts and the patron, which later steps move out with their parts (the
  scene compiler builds the target's and the anvil's acts, the bed and the screen for the scenes from
  the medieval world's pack);
- the weapon's pegs in the house and the hot tip on the anvil, which read the weapon's blade: what
  reads the knight's gear stays the engine's (from the pack, the pegs are the scene's stamp, drawn by
  the engine where the blade puts them);
- the props shared as stamps (`barrelHD`, `tableHD`, `sconceHD`, `crateHD`), and the glows, which
  are a shape of their own.

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
  unless the settings set another length (`LIVE_TURN_MS` in `main.js` is the ten), and the small
  line is the quiet line, built from `quiet_parts` in the world's words or `quiet_line` as it is
  (see [The words over the scene](#the-words-over-the-scene)).
- The file's `defaults` go to the settings (see [Settings](#settings)), which apply any change at
  once. With each fetch of the state file the page also asks `api/settings` for the shared
  settings (see [The shared settings](#the-shared-settings)).
- The devices come from `facts.devices`, and without it the pie stands alone as before
  there were devices; see [Devices](#devices). `facts.streams.count > 0`, or a
  `streaming` condition, turns the television on.
- Events. The first valid file's events are adopted without playing. After that each event with
  a higher `seq`, oldest first: `ad_blocked` adds `count` flies (at most 100 for one event;
  eight on screen, the rest queued for the next swat), `ip_banned` plays the goblin, `import`
  the crate and `backup_done` the feast, each with a caption built from its `parts` in the world's
  words, or its `text` as it is. The goblin is a foe
  as tall as the knight's shoulders: it climbs over the battlement's wall or digs up out of the
  camp's grass beside the knight, pulls a face, is bonked on the saucepan it wears, and vanishes
  in a puff of smoke. The knight's swing stops where the blade meets the pot, so the blade never
  passes through it; nothing gory is shown. After the bounce the knight returns to the stance; where
  the swing comes back low (the swings to the left, `KW.knight.ownReturn`), the return follows the
  swing's own, offset by where the bounce left the blade, so the blade does not pass the face again. The goblin stands where the weapon the knight holds
  reaches it, the greatsword, the longsword, the arming sword or the mace alike, on whichever build
  is drawn, and does not come where none can (the mace by its drawn head: see
  [The knight's rig](#the-knights-rig)); the
  burst on the pot lasts the 80 ms the blade bounces off it. A foe is described in `KW.cast.foes`
  ([The cast](#the-cast)) and played by the engine's foe player from its tables
  (`KW.engine.foe.FOE`), so a later foe reuses the entrance, the strike and the exit. A `seq` lower than the
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
the demo, `arrange(list)` puts a list of devices in the places (see
[Devices](#devices)), `listFromHook(text)` reads the address's `dv=` hook into a list
in the contract's shape, `takeEvents()` picks the events to play and `noSignal()` builds the
knight's NO SIGNAL state. `versionOf(file)` reads the version out of a parsed `version.json`, and
`reloadDue(own, fetched, last, nowMs)` decides whether to reload, given the page's own version, the
fetched one, the record of the last reload and the time. `state.js` loads under Node for the tests.

## The words over the scene

The headline, the detail, the "+N MORE" badge, the quiet line, the caption and the clock are HTML
text over the canvas, in VT323. `KW.ui.show` and `KW.ui.caption` in `main.js` write them with
`textContent`, never as markup. The headline, the detail and the badge are the collector's words as
they come. The quiet line and the captions are the world's: `KW.state.map` keeps the collector's
`quiet_parts` and each event's `type` and `parts` beside its text, and `main.js` passes them to
`KW.world.quietLine(parts, text)` and `KW.world.caption(type, parts, text)`, which build the line
from the parts in the medieval world's words, `words.medieval`, within the collector's limits of 52
and 44 characters. With no parts, or no words (a deployed page before `kw.medieval` is signed), they
give the collector's text as it is. [worlds.md](./worlds.md#the-words-and-the-overlay) gives the
rule. The demo goes through the same two calls, with parts and texts as the collector would send
them.

The colours come from the world's overlay, `overlay.phosphor`. At start-up `main.js` sets the
custom properties in `KW.world.overlay.props` on `#surface`: `--kw-ok` to `--kw-sleep` and
`--kw-ok2` to `--kw-sleep2` for each level's `--fg` and `--fg2` (`--kw-warn` and `--kw-crit` also
colour the badge), `--kw-outline` for the words' outline, `--kw-scrim` for the scrim's colour as
`r,g,b`, `--kw-caption` for the caption's background and `--kw-font` for the font. `display.css`
reads each as `var(--kw-ok, #39ff6a)`, with today's value as the fallback, and a page with no
overlay in use shows those. The scrim's stops and alphas, the sizes and the rest of the layout stay in
`display.css`. The text colour is still the status: a world may move a level's colours only within
the bands of hue and contrast the pack library checks ([design.md](./design.md)).

## Devices

The state file lists the devices in `facts.devices` (see [state.md](./state.md)). Every
scene has seven places for them, of three classes: the pie's own place, three **high** places for
cameras (`h1` to `h3`: on a wall, a tree, a pier or a pole, at or above the knight's head) and
three **ground** places for every other device (`g1` to `g3`: on the floor or the earth).

**The filling rule.** `KW.state.arrange(list)` reads up to 32 entries and puts each in a place by
its class, in the order of the list. The first entry of kind `pi` takes the pie's place, and a
second Pi is not drawn: a pie has only the one place that looks right. The first camera takes
`h1`, the second `h2` and the third `h3`. Every other kind, `machine`, `vm`, a kind the page does
not know and a pack's kind among them, takes the next free ground place. A device with no free
place of its class is not drawn, though it is still watched and still alerts, and an entry that is
not an object takes no place. Places depend on the list alone, never on which devices are up, so a
device does not move while the list stays the same.

**What `map` gives the engine.** `devices`, the devices drawn, each `{ place, kind, ok, alert }`.
`kind` is the entry's `kind` when that is a string of at most 200 characters, and `''` otherwise.
`ok` is false only for `state` `down`: `up`, `unknown` and anything else draw it whole, since the
page does not judge. `alert` is true only for `alert === true`.

**The fallback.** When `facts.devices` is absent, `null` or not an object with a `list` array (a
collector from before devices), `devices` is the pie alone in its place,
`{ place: 'pie', kind: 'pi', ok, alert: true }`, with `ok` false while `facts.pi.up === false` or a
`pi_silent` condition is in the list, as before there were devices. A file with a devices list
takes the pie's state from the list alone, so the pie leaves its dish when the Pi is judged down
and not at the first missed check.

**Places.** A scene's `places` is `{ pie, h1, h2, h3, g1, g2, g3 }`, each
`{ cls, kind, x, y, w, h }`: `cls` is `pie`, `high` or `ground`, and the rest is the shape the
pack format gives places (`kind` `surface` or `floor`, `x` the middle and `y` the base, the line a
device stands on, a box 88 wide and 112 tall above the base). For a camera the base is the foot of
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
highest device drawn, and its top is never higher than y 172. Ground places keep clear of every
spot the knight stands at, of the swings, and of the knight's boots. `pl=1` shows them all.

Whatever a place may show is drawn wholly on the 960 by 600 grid, which is all a display exactly
960 wide shows: every kind that may stand there, up and gone, its question mark and its pole. No
two places in a scene draw over each other. `tests/web/places.test.js` draws each of them and checks
both, from what is painted rather than from a place's declared box: a place's 88 by 112 box is the
room it was planned with, and may reach past the grid's edge where its drawing does not.

**The kinds.** `KW.props.KINDS` holds the code's drawing of each kind, `draw(x, y, t, ok, part)`,
standing on the base `(x, y)`, and `mark`, the height above the base of the top of its question
mark. The engine draws from `KW.kinds`, which has the same interface: the compiler (`world.js`) fills
it with the kinds the medieval world's prop set gives, and keeps `KW.props.KINDS`'s for the rest
([worlds.md](./worlds.md#the-devices)). On a page without the compiler the engine reads
`KW.props.KINDS` itself.

| Kind | Up | Down |
|---|---|---|
| `pi` | the pie in its dish, steaming, its filling lit through the lattice | the empty dish with crumbs and the last slice |
| `camera` | a barn owl on an iron wall bracket, its eyes the lamp | hanging upside down from the bracket by its talons, wings drooping, dazed red spirals for eyes, two feathers drifting down |
| `machine` | an iron cauldron over a small log fire, its brew the lamp, bubbles showing as it brightens | tipped on its side, empty and cold, the fire out, the last ember blinking |
| `vm` | a corked glass flask with a paper tag, its potion the lamp | on its side with its cork out beside it, the last of the potion blinking |
| any other | a small iron-bound chest, the lamp the jewel in its lock plate | on its end, its lid knocked off beside it, three coins spilt |

Each kind is a medieval thing that stands for the device, by the owner's choice of 16 November 2026
([design.md](./design.md#devices)). A kind the page does not know is drawn as the chest. The kind is only ever a key into `KW.kinds`.
The devices fit within 80 by 64 above the base.

**The lamps.** Every device has one lamp with a soft light round it in its own colour. The chest's
is the engine's lamp, 10 by 10 in a dark rim (`lampRim`, `lampHD`). The pie's, the owl's eyes, the
cauldron's brew and then its last ember, and the flask's potion are lamps of their own, drawn as a
pack draws one (`ownLampHD`): a light of radius 24, the dark drawing, and the lit drawing over it at
the loop's level; their maps are `pieShapes` and `DEVICE_LAMPS`, and the chest's lamp stands at
`CHEST_LAMP`. While its machine is up, or `unknown`, the lamp fades from green to black and back
over 3.6 seconds; while it is down, from red to black and back over 2 seconds, a slow blink. The
loop starts 523 ms later in each place than in the one before it (`pie`, `h1` to `h3`, `g1` to
`g3`), so the lamps of a scene never pulse together. Both loops come from `LAMP` and `lampLevel` in
`props.js`, which every lamp shares, the drawings from a pack among them; `props.js` exports them with
`lampRim` and `lampHD`, the engine's own lamp, and `LAMP_REDS`, the down lamp's three reds as a pack
names them.

**The pie's lamp.** The pie's lamp is its filling: the 398 pixels the crust effect leaves in the
filling's colours between the strips of the lattice, read from the effect when the pie is first
drawn (`pieShapes` in `props.js`), so that the lamp lies exactly in the gaps. It lights on the
lamps' loops from the pie's place, so its loop starts at the place's offset, 0. While the Pi is up
it goes from the device lamp's green (`#8fe07a` on the filling's lit side, a darker green on its
shaded side and along the strips, a highlight of `#e4ffd6` in the corner of each gap) to near black
(`#0b130c`) and back over 3.6 seconds, in the engine's green light, centred 1 right of the base's
middle and 30 above it. The strips, the rim band and the crimping stay the crust's colours, so the
light seems to come from under the lattice. The steam rises from the top of the dome, its puffs
starting 53 above the base. While the Pi is down the dish is empty but for crumbs and the last
slice, a wedge of the pie lying in it with its point near the dish's middle, its cut face to the
front and its outer crust to the right, partly hidden by the dish's near rim. Its filling, 108
pixels in the gaps of its own small lattice and along its cut face, is the lamp, and blinks from the
down lamp's red to black over 2 seconds, its light centred 4 right of the middle and 24 above the
base. Nothing else moves but the question mark.

**Drawing.** `part` `'still'` draws what does not move and `'moving'` what does: the lamp, and the
pie's steam. The engine paints each device's still part once, with its pole, into a
small canvas of its own, kept by place, kind and state (and, for a kind from a pack, the compile it
came from), and draws it with one call where the
scene's `draw` calls `KW.devices.draw(t, s)`, so each scene's drawing order is what it was. Only the
moving part is drawn each frame, and the question mark is kept in a canvas of its own as well. The
pie's lamp is a lamp of its own as a pack gives one: each of its drawings, lit and dark, up and
down, is painted once into a small canvas of its own in `props.js` (`ownLampHD`); each frame draws
its light, the dark drawing, and the lit one over it at the loop's level, 18 calls, as a device's lamp costs 16 to 20. The pie up costs 114 calls a frame with its
steam, and the pie down 18. A frame with the pie and six devices costs about 75 calls more than one
with the pie alone.

**The question mark.** Over a gone device whose `alert` is true, the engine draws the question mark,
blinking every 400 ms, with its foot at least 4 pixels above the gone device. A gone device that
does not alert has no mark, only its red lamp. The pie's mark stands where it always has.

**`device_down`.** The condition has no scene of its own: the knight stays in the quiet scene of
the moment, does not stroll, and frowns, as for `pi_silent`. `map` gives the winning `device_down`
a `place`: the place of the first position in its `devices` that stands in one, or `null` when
none does. The knight looks towards that place (`look` is the sign of the place's x less the
knight's), or straight ahead when there is none. A device that does not alert has no effect on the
knight.

## The cast

The engine plays a supporting cast whose drawings are not its own: the fly and the goblin. Where a
fly hovers, the swat, the poof and the fall are the engine's, and so are the foe's entrance, the
strike and the exit; a member gives its drawings and its measures. `KW.props.CRITTERS` holds the
code's critters by name, each with

| Field | Is |
|---|---|
| `draw(x, y, flap)` | the critter hovering at `(x, y)`, in its first frame (`flap` 0) or its second |
| `dead(x, y)` | what falls once it is swatted, from `(x, y)` |

The fly's are `flyHD` and `deadFlyHD`. `KW.props.FOES` holds the code's foes by name, each with

| Field | Is |
|---|---|
| `pose(name)` | a canvas with the pose painted once, the feet at `anchor`; an unknown name gives `stand` |
| `poses` | the names of its poses: `stand`, `climb`, `taunt0`, `taunt1`, `brace`, `hit` |
| `anchor`, `size` | the feet in the canvas, and the canvas's size |
| `h`, `w`, `mid` | its height, half its width across the body, and the middle of its body above the feet |
| `crown` | the points of its top from the feet, as drawn facing left, where the blade stops |
| `exit` | the engine's exit it leaves by, `poof` |

The engine draws from `KW.cast.critters` and `KW.cast.foes`, which have the same interfaces: the
compiler (`world.js`) fills them with the members the medieval world's cast gives, and keeps the
code's for the rest ([worlds.md](./worlds.md#the-cast)). On a page without the compiler the engine
reads `KW.props.CRITTERS` and `KW.props.FOES` itself.

The monarchs are patrons. `court.js` gives the code's, `KW.props.PATRONS`, by id (`a`, `b`, `c`),
each with

| Field | Is |
|---|---|
| `draw(x, by, look)` | the monarch on the throne, `x` its middle and `by` the seat of the dais, in the look `{ skin, hair, robe }` (each `null` for its own), all but the mouth |
| `mouth(x, by, open, look)` | the mouth, open or shut, drawn each frame as the monarch talks |
| `drawn` | its own hair and robe colours, `{ hair, robe }`, for the settings' "As drawn" |

The court draws the patron `KW.cast.patrons` gives: the medieval world's cast's, compiled by
`world.js`, and the code's own on a page without the compiler or when the pack is not read. The
court from the pack does the same through its `patron` mark ([worlds.md](./worlds.md#the-scene-compiler)),
and gives `drawn` as `court.js` does. It
checks `s.patron`'s colours before it hands them on, as it always has, and puts where the patron
comes from into its backdrop's key (`b@kw.medieval#3|deep` for a patron from the pack, `b|deep` for
the code's).

## Settings

A display's look, its display preferences, its quiet scenes and the scene each offered condition
plays in are its settings. Each comes from four levels, highest first, key by key:

1. **The address's hooks**: `bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, the gear's `sh=`,
   `hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=` and `bk=`, `mon=`, `ms=`, `mh=`, `mr=`,
   `hs=`, `h=`, `ck=` and `sc=` (see [The address](#the-address)). They keep screenshots the
   same whatever is saved.
2. **The saved settings**, made on the settings screen. Served by the bundled server they are the
   deployment's, kept by the server and the same on every display (see
   [The shared settings](#the-shared-settings)); with no server they are this browser's own, kept
   in its storage (see [This browser's own choices](#this-browsers-own-choices)).
3. **The `defaults` of the state file**, which the collector takes from `config.toml` (see
   [state.md](./state.md)). A file from an older collector has none.
4. **The page's own**: the medieval world, the base world (see [Worlds](#worlds)): the base pack's
   defaults for the knight (Classic, the greatsword, warm skin,
   brown hair cut short, a blue tabard and a red plume, the open helm with its crest, plate and
   riding boots, nothing on the back, and the heater shield should a one-handed weapon be chosen),
   monarch A in the court's own skin with
   each monarch's own hair and robe ("As drawn", `null` in what `now()` gives), the goblin, the fly,
   the medieval devices, overlay and words, all four quiet scenes, and each condition in its own
   scene; with a medium headline, a 24-hour clock, the helmet off indoors, and ten minutes for each
   quiet scene in live mode and one in the demo.

The keys, the values each may take and the page's own defaults come from the settings schema,
`collector/settings-schema.json`, through the copy `tools/settings-schema.js` writes between the
`settings-schema` markers of `settings.js` (`KW.settings.SCHEMA`); `ONE_OF`, `SCENES`,
`ALL_SCENES`, `MINUTES`, `BUILT_IN`, `TABLES` and `KINDS` are made from it, and `LONG`, the form of
a long name, is held to its `long_name` by `tests/web/settings-schema.test.js`. They are the contract's: `look` holds `world`, `build`, `weapon`, `skin`, `hair`,
`hair_style`, `tabard`, `plume`, the gear (`shield`, `helmet`, `plume_style`, `body`, `shoulders`,
`arms`, `hands`, `legs`, `feet` and `back`), `monarch`, `monarch_skin`, `monarch_hair`,
`monarch_robe`, `foe`, `critter`, `props`, `overlay` and `words`, and two tables, `items` (a slot to
an item's long name) and `devices` (a kind of device to a prop set);
`display` holds `headline`, `clock` and `helmet_indoors`; `quiet` holds `scenes` and `minutes`;
`scenes` holds a scene id for each condition offered, by its condition id. Which conditions are
offered, and which scenes each may take, the store works out from the world it is given: each
scene's `can` and each condition's own scene in the base world, from the medieval preset or, without
it, `KW.state.CONDITIONS` (`KW.settings.pageWorld()`, see [Worlds](#worlds)).
A condition is offered when it has a scene of its own and more than one scene can act it, `night`
never (`KW.settings.offered`); today that is `attack`, `disk_full`, `backup_overdue`, `pi_silent`
and `cpu_hot`. In the scenes section a level's entry is ignored, with a console line, when its key
is not a condition the page knows, when the page offers no choice for that condition, when its
value is not one of the page's scenes (`KW.settings.ALL_SCENES`), and when that scene cannot act
the condition: `knightwatcher: settings: scenes.attack "house" in the defaults in state.json is
ignored: that scene cannot act it`. A value a level holds that the page does
not know is ignored at that level, so the next one down is used, and the console says so once:
`knightwatcher: settings: look.skin "green" in this display's saved choices is ignored: not a value
the page knows`, or `in the settings saved on the server` for the shared settings. A build is known only when the base pack in use declares it (`build.a` is `a`);
today it declares all three, Classic (`a`), Broad (`b`) and Slim (`c`). `quiet.scenes` takes turns in the order given, a repeat
dropped, and a list that names no quiet scene is ignored whole; `minutes` is a number from 1 to
240. A section of the defaults the page does not know is left alone without a word, so a later
collector can add one.

A key marked long in the schema (`world`, `monarch`, `foe`, `critter`, `props`, `overlay`, `words`,
the values of `items` and `devices`, the quiet scenes and the scenes section's values) also takes a
long name, `"<pack>/<id>"`. The page keeps one it has loaded as the name it stands for
(`kw.medieval/patron.b` is the monarch `b`, `kw.medieval/props.medieval` the props `medieval`), and
ignores one it has not loaded, as any value it does not know: `look.foe "kw.other/foe.troll" in
the defaults in state.json is ignored: no pack the page has loaded gives it`. An item in `items`
must be one the base pack in use holds, for that slot. Besides the console, `now()` lists what each
level set and the page left out in `ignored`, each `{ section, key, value, where, why }`, for the
status page.

**What the levels drive.** `KW.settings.knightLook(r)` turns what the levels give into the look for
`KW.knight.look()`, holding only what a level above the page's own sets, and what a world other
than the base world gives: with nothing set it is
`{}`, and the knight is exactly as before there were settings. A weapon set brings its item and,
when it is one-handed (`sword_and_shield`, `mace_and_shield`), the shield `shield` names; a shield
set beside a two-handed weapon is kept and carried nowhere. Each other gear key brings the base
pack's item of its slot (`KW.settings.ITEMS`: `helmet` "kettle" is `kw.base/helm.kettle`, `feet`
"shoes" `kw.base/boots.shoes`), `back` "none" brings nothing, and an item `items` names is drawn
in its slot over the key for it. `engineInput(r, pack, ownMs)` gives
the engine's `turns`, `turnMs`, `patron` (`{ id, skin, hair, robe }`), `scenes`, `homes` and `kinds` (see
[The engine's input](#the-engines-input)); `turnMs` is `ownMs`, the demo's minute or live mode's
ten, while no level sets `minutes`, the monarch's colours are `null` while no level sets them,
`scenes` holds only the conditions a level above the page's own sets, so with nothing set it is
`{}` and every condition plays where it always did, `homes` is the world's own scene for each
condition, and `kinds` the prop set each kind of device is drawn from: the one `devices` names for
it, or `props`. `main.js` hands `kinds` to `KW.world.useKinds()` ([worlds.md](./worlds.md#worlds-as-presets)). The
headline size becomes the display option `hs`, the helmet indoors `h` (`on` for true, `auto` for
false), and the clock reads `21:42` or `9:42` with a small `PM` after it. `clock(h, m, hours)` gives
the words: on the 12-hour clock the hour after midnight is `12:05 AM` and the half hour after noon
`12:30 PM`.

### Worlds

A world is a preset, every part of the look, the quiet scenes and the scene of each condition at
once, held in a world pack's `worlds` section ([worlds.md](./worlds.md#worlds-as-presets)). The page
ships one, the medieval world, `world.medieval` of `kw.medieval`, which the settings call
`medieval`: the base world, and the page's own level. Its preset gives the knight the base pack's
defaults, and the scene of each condition and the quiet scenes the code gives them, so with nothing
set the display is exactly as before there were worlds. Without the pack the code's own values
stand in for it: `KW.state.CONDITIONS` for each condition's scene, `SCENES` for the quiet scenes.

The parts (`KW.settings.isPart`) are every key of `look` but `world` itself, `quiet.scenes` and
every key of `scenes`; the display's preferences and `quiet.minutes` are not parts. **A world counts
as setting every part at the level it was chosen at.** For each part, `resolve()` takes the highest
level that sets it, as for any key, and the highest level that sets `world`. When the part's level
is the same as the world's or above, the part keeps its value; when it is below, or no level sets
the part, the world gives it, and `from` says `'world'`. With no level choosing a world, the base
world is the page's own and every part is resolved as before. The tables `items` and `devices` are
resolved key by key the same way. What `now()` gives besides `values` and `from`:

- `world`: `{ id, from, homes }`, the world in use, the level it was chosen at (`'built-in'` when
  none chose it), and its scene for each condition.
- `masked`: each part a level set that gave way to the world, `{ section, key, level, value }`: in
  `config.toml` the tabard `forest`, under a world chosen on the display, is `{ section: 'look',
  key: 'tabard', level: 'defaults', value: 'forest' }`.
- `faults`: each part of the world that the page could not use and so gave the base world's,
  `{ part, value, why }`: a patron, prop set or scene it has not loaded, a quiet scene that is not
  quiet, a scene that cannot act its condition, a body or a swatch from a pack other than the base
  pack.
- `ignored`: see above.

The page lists what it has loaded in `KW.settings.pageWorld()`, from the loaded scenes, `KW.state`
and `KW.world.catalogue()`: the worlds by name, with each preset; the prop sets by name, with the
kinds each draws; the scenes of a pack by their long names; and the long names of kw.medieval's
parts with the short name each stands for. A world of another pack, called by its long name
(`kw.example/world.neon`), is read part by part (`KW.settings.worldParts`): its outfit as the
look's keys, an item no key can name in `items`; its patron, foe, critter, props, overlay and words
by the names the page has loaded; its quiet scenes and its scene for each condition. Today the page
draws only kw.medieval's scenes and cast, so another world's own scenes and cast fall back to the
base world's, listed in `faults`; its prop set is drawn.

The store's `chooseWorld(id)` saves a world on this display and clears every part this display has
chosen, the look's other keys, the quiet scenes and the scene of each condition, in one write
naming `look`, `quiet` and `scenes`; the display's preferences and the quiet scenes' length stay.
It returns what it cleared, each as `'section.key'`, for the line the screen shows, or `null`,
saving nothing, for a world the page has not loaded. `catalogue()` gives what the page has loaded.

### The shared settings

Served over HTTP, the page asks `api/settings` beside it for the deployment's settings: once at
start, and again with every fetch of the state file, so every five seconds (on a timer of its own
while `?demo` forces the demo). The bundled server answers
`{ "v": 1, "look": {...}, "display": {...}, "quiet": {...}, "scenes": {...} }` with only the keys
saved ([server.md](./server.md#the-settings-api)). The fetch asks the browser to check its copy
(`cache: "no-cache"`), so while nothing has changed the server answers `304` with no body. It is
cut off after four seconds. `KW.settings.connect` does the rest:

- **The first answer** in that form makes the saved level the server's, and the settings screen's
  choices are sent there from then on.
- **The carry-over.** When that first answer holds nothing at all and this browser has choices
  under the old key, `knightwatcher.settings`, they are sent once with `PUT` (each section cleaned
  as the saved level is, and only the sections with something in them), and once the server has
  taken them the key is removed, with a line in the console. If the server refuses them the key is
  kept and they are tried again when the page next loads. When the first answer holds something,
  the key is removed unsent: the deployment's settings win. Either way this browser's own choices
  are not used again while the server answers.
- **A change from another display.** Every answer is copied into the browser's storage under
  `knightwatcher.shared`, and a page served over HTTP starts from that copy until the server
  answers, so a reload shows the shared settings from the first frame. An answer that changes
  what the display shows, a choice made on another display, reloads the page at once, so that
  everything drawn (the knight, the gear at rest, the cached backdrops) starts again from it: a
  choice on one display reaches every other within one poll. While the screen is open the page
  is not reloaded under it; the screen shows the change and reloads the page as it closes. Where
  the browser keeps no copy (a private window may refuse storage) the page is not reloaded, since
  it would start from something else each time, and the settings apply in place.
- **A choice** on the screen applies at once and is sent with `PUT`, naming the sections it
  changed, each in full: `{ "v": 1, "look": {...} }`. A reset sends the section empty and "As
  drawn" sends it without that key. One write is in flight at a time, and choices made meanwhile
  go in the next. An answer to a poll sent before the latest choice is dropped, so an older answer
  never undoes a choice.
- **A write that fails**, refused by the server or not answered, puts the settings back to the
  server's last answer, and the line under the screen's title says `Not saved: ` with the server's
  reason (`error` in its answer), `the server answered 500`, or `the server did not answer`, in
  amber, until a save succeeds.
- **No server.** A `404`, or any answer that is not the shared form (another web server's page,
  say), means nothing keeps the settings there: the page goes back to this browser's own choices,
  removes the copy and asks no more until it is loaded again. A server that cannot be reached at
  all, or answers with a server error, is asked again at the next poll, and the page stays as it
  is meanwhile.

From disk the page asks nothing: there is no server, and the choices are this browser's.

### This browser's own choices

With no server, the choices are kept in the browser. One key in its `localStorage`,
`knightwatcher.settings`, holds
`{ "v": 1, "look": {...}, "display": {...}, "quiet": {...}, "scenes": {...} }`, with the contract's
names and values. A text saved before there was a `scenes` section is still version 1 and reads as
it did, each condition in its own scene. A choice is saved the moment it is made. Every read and write is wrapped: where a browser refuses
storage, as a private window may, the page works all the same, the choices last until it is
reloaded, and the console says so once. A stored text that is not JSON, or not version 1, is
ignored whole, and a stored value the page does not know is ignored alone. The choices belong to
that one browser, so other displays keep their own. This is how the page behaves from disk, as
the website's demo, and served by a web server other than the bundled one.

**The store.** `KW.settings.create({ hooks, storage, pack, world, say, cache })` holds the levels (`world`,
a function giving `{ can, homes }`, defaults to `pageWorld`, and a test passes its own; `cache`
true starts the saved level from the copy of the shared settings, as `main.js` does when served): `now()`
gives `{ values, from }`, every key's value and the level it came from (`hook`, `saved`, `defaults`
or `built-in`); `fallback()` the same without the hooks and the saved settings, for the reset's
line; `choose(section, key, value)` saves one choice and refuses a value it does not know;
`clear(section, key)` clears the saved choice for one key, which the monarch's "As drawn"
uses; `reset(section)` clears a section's saved choices; `own(section)` says whether anything is
saved there; `offered()` gives the conditions offered, each with the scenes that can act it;
`defaults(raw)` takes the state file's section; and `on(fn)` adds a listener, told whenever what the
display shows changes. For the shared settings, `mode()` says where choices are kept (`server` or
`local`), `shared(j)` takes the server's settings as the saved level and says whether what the
display shows changed, `local()` goes back to this browser's choices, `sections()` gives the saved
level as a write sends it, `carry()` this browser's own choices for the carry-over, and
`sending(fn)` names the function told of each choice while the settings are the server's.
`KW.settings.connect({ store, request, storage, reload, holding, note, say })` ties a store to the
server: `request(method, body)` makes the request, `reload()` starts the page again, `holding()`
says whether the screen is open and `note(text)` sets its line; it returns `poll()`, which
`main.js` calls. `sharedOf(j)` reads an answer of the server's, or gives `null`. `main.js` makes one store at start-up, applies it before the first frame,
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

**Layout.** A side rail of seven pages, World, the knight, the monarch, display, quiet scenes,
scenes and status, with DONE at the top right. The screen opens on the knight's page; World is
first in the rail. The knight's and the monarch's pages take their names from the labels of the
world's words in use, `watcher` and `patron` ("The knight" and "The monarch" in `words.medieval`),
and keep those words where there are none. The screen covers the whole window, review bar included; the scene
keeps running behind, dimmed, and shows each choice as it is made. Every choice applies at once,
with no Save button. On a window up to 1200 wide or 760 tall the screen is drawn a little tighter,
with labels above their choices and the house's preview left out; every touch target stays at
least 48 pixels tall.

**World.** A line saying what a world is ("A world sets every part at once: the knight, the
monarch, the scenes, the cast, the devices and the words. A part changed on a later page is kept
over the world."), then a card for each world loaded (`catalogue()`, see [Worlds](#worlds)): its
picture scene, drawn by the scene's own code with the world's own knight as it comes, whatever this
display has changed (`worldLook()`), and its name under it; the world the page falls back to on a
reset is marked Default. With one world loaded a grey line says more worlds show once their packs
are loaded. Tapping a card, the chosen one included, chooses that world (`chooseWorld()`): every part
chosen on this display is cleared, and the line under the cards names the world, what it cleared
and what `config.toml` sets that now gives way, and says "for every display" with the bundled
server: "Medieval chosen for every display: every part is now the world's. Cleared what was chosen
here: the tabard (forest). A part changed after this is kept over the world."

Under a heading "Changed from the Medieval world", a row for each part whose value differs from the
world's own (`KW.settings.screen.changedParts`): the value in use, marked Default when it comes from
`config.toml`, beside the world's own, marked "The world's", each as a chip of the row the part has
on its own page; the line under it names the page it was chosen on ("Chosen on the knight page."),
or says the address sets it. Tapping the world's chip puts the part back: this display's choice is
cleared, and where a level below still sets the part, the world's value is saved over it. With
nothing changed the line reads "Nothing: every part is the world's."

Once a second prop set is loaded, a heading "Devices, kind by kind" and a row for each kind of
device, Pi, Camera, Host, VM and Other, each with a picture of the kind as every loaded set that
draws it draws it (`KW.world.drawingOf`), the world's set first and named "the world's"
(`KW.settings.screen.deviceRows`). A choice saves the set for that kind in `look.devices`; the
world's set clears a kind this display chose, so that it follows the world again
(`KW.settings.screen.devicesAfter`). With one prop set, as at launch, there are no device rows. The
page ends with the reset of the look: "The default is the Medieval world, every part as it comes",
or with the parts `config.toml` sets beside it ("with a forest tabard").

**The knight.** Build, weapon, skin tone, hair colour, hair style, tabard and plume, each a row of
choices, and under a line headed Armour ten more rows of gear: shield, helmet, plume style, body,
shoulders, arms, hands, legs, feet and back; names and colours come from the base pack. The weapon
row shows the greatsword and the longsword (Two hands) and the sword and shield and the mace and
shield (One hand each); each gear row shows the items of its slot the base pack in use draws, by
their names, in the schema's order (`KW.settings.itemChoices`), and the back starts with Nothing. A
row the look does not show is greyed as an unready build is, and a tap on a greyed choice says why
in the line under the row and changes nothing (`KW.settings.greyed`): the shield beside a
two-handed weapon ("A shield is carried only with a one-handed weapon: the sword and shield or the
mace and shield."), and the plume style with a helmet that has no plume mount, the mail coif ("The
mail coif has no plume mount, so no plume is drawn with it."), the plume's colour too unless the
long cloak, which takes the plume's colours, is worn. The build row shows the contract's three
builds, `a`, `b` and `c`, each by the name the base pack gives it, Classic, Broad and Slim, with
Ready under each (`KW.settings.buildChoices`). A build the base pack in use does not declare, as a
fork's base pack might, is greyed with a dashed border, named by its letter (Build B) and says
Coming, and a tap on it says in a line under the row that it is not drawn yet and changes nothing.
The line under the knight's page that names the default look gives the build by its name too
("the Classic build, the greatsword, ..."), and after the plume any gear that differs from the base
pack's own ("..., a red plume, with a kettle hat, a long cloak; ..."). Beside the rows the
knight's own code draws the knight with the chosen look, helmet on and helmet off, every frame,
and the house with the gear at rest. On the code path the page says the look cannot show until the
base pack can be used, and keeps the choices.

**The monarch.** The three monarchs, each a crop of the court's own drawing in the chosen skin,
hair and robe; the six skin tones of the base pack; a Hair colour row and a Robe row, each starting
with "As drawn", in the chosen monarch's own colours, followed by the base pack's six hair colours
and six tabard colours. "As drawn" saves nothing: it clears this display's choice for that key
(`clear`), so the default from `config.toml` applies, or the monarch's own colours when there is
none; a row whose value comes from `config.toml` therefore shows that colour chosen after "As
drawn". Beside the rows, the chosen monarch at court; on a full-size screen that picture is a
little narrower than on the knight's page, so that a row of seven stays on one line.

**Display.** The headline size (small, medium, large), the clock (24 hour, 12 hour) and the helmet
indoors (off in the house and the smithy, or kept on everywhere).

**Quiet scenes.** The four quiet scenes, each with a picture drawn by its own code and a switch.
The last one in the rotation cannot be switched off, and a line says "One scene at least stays in
the rotation."; a scene switched back on joins the end of the rotation. One length for every scene:
5, 10, 15, 30 or 60 minutes, and a length set elsewhere outside those shows as a choice of its own.
In the demo, while nothing sets the length, a line says the demo shows each scene for a minute.

**Scenes.** A line saying what the page is for, then one row for each condition offered, named as
its headline reads (Under attack, Disk full, Backup overdue, Pi silent, Running hot), with a small
picture of each scene that can act it, drawn by the scene's own code as on the quiet scenes page.
The scene the condition goes back to on a reset (its own, or the one `config.toml` sets) is marked
Default. A choice applies at once, and the scene behind changes if that condition is showing.

**Status**, read only: the page's version (the deploy's hash, or `dev`), how long ago the state file
was written and how often the collector writes it, the sources in it (all working, or each failing
one with its error and the time of its last read), then three entries for the world, and the packs
refused, each with its step and reason. The world's entries:

- **World**: the world in use, its pack's id and version and whether it is signed, and where it
  is chosen ("Nothing chooses a world, so the page uses its own.", "Set in config.toml.", "Chosen on
  this screen, for every display.", or by the address).
- **Parts**: where each part comes from, a line each: the knight with the base pack's id and
  version (or why it is drawn from code), the monarch, the scenes, the cast, the devices (with any
  kind drawn from another set) and the words with the overlay. Each line names the parts that
  differ from the world's and where they were set ("; the tabard (forest) chosen here."), and under
  the knight a line names the parts `config.toml` sets that give way to a world chosen above it.
- **Fallbacks**: every fallback with its reason (`KW.settings.screen.fallbackLines`): what a level
  sets and the page ignores (`ignored`), as "Disk full: config.toml asks for the camp, which cannot
  act it. Shown in the cellar, the world's own."; a part of the world the page has not loaded
  (`faults`); a scene, a kind of device or a member of the cast drawn from code, a kind of device
  drawn from the base world's set, and the knight's items that fell back. "None. Every part is
  drawn from where it is set." when there are none.

**Where choices are kept.** Under the title, each editable page says where its choices go: "Saved
on the Knightwatcher server, for every display." with the bundled server, or "Kept in this browser
only: no Knightwatcher server." without one. A save the server refused replaces that line with
"Not saved: " and the reason, in amber, until a save succeeds (see
[The shared settings](#the-shared-settings)).

**Reset.** Each editable page ends with USE THE CONFIG DEFAULT and a line saying whether anything
is saved there ("Saved for every display." with the server, "This display has its own look." or
"choices" without) and what the default is, and whether that comes from `config.toml`.
The button clears the saved choices for the section, on every display with the server, so it falls back to the defaults;
on the World page and the two look pages it clears the whole look, the world, the knight and the
monarch, which is one section, and on
the scenes page every condition's scene. A row a
hook sets says "The page's address sets this for now."

**Closing.** DONE, Escape on a keyboard, or 60 seconds without a touch. The footer says so, and for
the last 10 seconds counts down in amber. When a choice was made while the screen was open, closing
it reloads the page, so that everything drawn (the knight, the gear at rest, the cached backdrops)
starts again from the new settings; a screen closed with nothing changed does not reload. Any touch, scroll or key inside the screen starts the
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
drawn at, the frozen time when `t=` freezes it. What the World page and the status page's world
entries show is worked out in `KW.settings.screen`, apart from the drawing, so that
`tests/web/worlds.test.js` reads it under Node. It returns `open(page)`, `close()`, `isOpen()` and
`cue(x, y, q)`. Nothing of the screen is drawn while it is shut, so with it shut and nothing saved
the page looks exactly as before there were settings.

### The engine's input

`KW.engine.input` (see the head of `engine.js`) takes from the settings `turns`, the quiet scenes
that take turns, in order (all four, `TURNS`, when it is left out or empty), `turnMs`, how long
each lasts, `patron`, the monarch as `{ id, skin, hair, robe }`, its id and its skin, hair and
robe, which the engine passes to the scenes in `s.patron`, `scenes`, the scene chosen for a condition
by its id, and `homes`, the world's own scene for each condition. `KW.engine.sceneOf(w, t)` gives the scene the winning condition `w` plays in: the one
`scenes` names for it when that scene lists the condition in its `can`, else the one `homes` names
under the same rule, else the condition's own in code (`w.scene`, from `KW.state.CONDITIONS`), else
the quiet scene of the moment. A condition with no scene of its own follows the quiet scenes
whatever `scenes` and `homes` say. A `turns` list that names a scene the page has not loaded is
passed over for `TURNS`. The frame and the events both ask it. The demo's `apply()` and `main.js` add them with `KW.ui.extras(ownMs)` whenever they
build the input.

## The address

The hash holds the demo's settings and a set of test hooks. `h=`, `hs=`, `t=`, `kx=`, `pl=`,
`set=` and the settings hooks (`bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, the gear's `sh=`,
`hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=` and `bk=`, `mon=`, `ms=`, `mh=`, `mr=`,
`ck=`, `sc=`) also work in live mode. `f=`, `e=`, `sw=` and `dv=` act in the demo and do nothing elsewhere. The
settings hooks, `h=` and `hs=` are the highest of the settings' levels (see [Settings](#settings)):
each outranks this display's saved choices and the state file's defaults while the address holds
it, and a value it does not know is ignored, with a line in the console, so that the next level
down is used.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `device`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
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
| `mh=`, `mr=` | the monarch's hair and robe: the id of one of the base pack's hair swatches and of one of its tabard swatches, such as `mh=silver&mr=teal`. Without them, each monarch's own colours |
| `sc=` | the scene a condition plays in: `<condition>:<scene>`, by the contract's ids, separated by commas, such as `sc=cpu_hot:camp,pi_silent:battlement`. A pair the page cannot act is ignored, with a line in the console |
| `ck=` | the clock: `24`, or `12` for 9:42 with a small PM |
| `set=` | opens the settings screen at load on a page: `world`, `knight`, `monarch`, `display`, `quiet`, `scenes` or `status`. `set=hold` instead shows the cue of the hold seven tenths of the way through, over the knight's head, and leaves it there; for screenshots |
| `dv=` | the demo's list of devices: kinds separated by commas, each followed by `-` for down or `!` for down and alerting, placed by the filling rule. `dv=pi,camera!,camera,machine,vm-,x` fills the pie's place, two high places and three ground places, the third with the plain box. An empty item is an entry the page cannot read. Without the hook the demo shows the pie alone, gone while `pi_silent` is on. With `device_down` on, the knight looks towards the first device that is down and alerts |
| `bd=` | the knight's build: `a` Classic, `b` Broad or `c` Slim, the base pack's `build.<value>`. A page that cannot draw from the base pack draws Classic whatever the hook says |
| `arm=` | the knight's weapon: `one` the base pack's arming sword in one hand and its shield in the other, `two` the greatsword, or any weapon by its contract name: `longsword`, `mace_and_shield`. A page that cannot draw from the base pack draws the greatsword whatever the hook says |
| `sh=`, `hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=`, `bk=` | the knight's gear by its contract value: the shield (`sh=round`), the helmet (`hm=coif`), the plume's style (`ps=feather`), the body (`bo=cuirass`), the shoulders (`so=lames`), the arms (`am=mail`), the hands (`hn=leather`), the legs (`lg=hose`), the feet (`ft=sabatons`) and the back (`bk=cloak`, or `bk=none`); the values are in [state.md](./state.md) |
| `sk=`, `hc=`, `tb=`, `pm=` | the knight's skin, hair colour, tabard and plume: the id of one of the base pack's swatches, such as `sk=deep&hc=black&tb=sable&pm=gold` (the ids are in [packs.md](./packs.md#the-base-pack)) |
| `hy=` | the knight's hair style: `short`, `tied`, `curls`, `long` or `close`, the base pack's `hair.<value>` |
| `pl=1` | outlines the scene's seven places and names them (`P`, `H1` to `H3`, `G1` to `G3`): the place's box, the 80 by 64 a device may fill inside it, and the base. The pie's place is white, high places blue and ground places amber, and a place in front of the knight has a broken outline |

`e=` and `sw=1` act 300 ms after the page loads, or before the first frame when `t=` freezes time.
With time frozen the knight never starts a swat alone, so the flies of `f=` hover until `sw=1`
starts one, and a knight placed away from their spot by `kx=` stays exactly there, in mid-stride,
rather than walking a step in each frame.

The look hooks (`bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=` and the gear's) take the values the contract gives
the look in [state.md](./state.md) and keep screenshots the same whatever a display has saved; on
the code path they do nothing. A value outside the contract's is ignored, as at every level.

The demo rewrites the hash as its settings change, with the contract's ids in `on=`. It writes
`h=` and `hs=` only when the address named them or the review bar's buttons set them
(`KW.hooks.fixed`), so that a reload keeps the bar's choice and otherwise leaves the settings' in
force. The test hooks (`t=`, `kx=`, `dv=`, `pl=`, `set=`, the settings hooks, `f=`, `e=` and `sw=`)
are read once when the page loads, and the rewritten hash leaves them out, so they last until the
page is opened again.

## The admin page

`admin/` holds the household's admin page: its own HTML, script and stylesheet, served by the
bundled server at `/admin/` and nowhere else, since it needs the server's API
([server.md](./server.md#the-admin-page)). From disk, or from a web server of your own, it says
the admin page is off and why. It loads the same drawing scripts and base pack as `index.html`,
in the same order, without `demo.js` and `main.js`: it runs no display, and uses `KW.knight`,
the scenes' own `paint()` and `draw()` and `KW.settings` to draw the household look's previews
exactly as every wall draws them. It reads the base pack as a deployed wall does, signed unless
its own `kw-version` is `dev`. The server stamps its addresses with the page's version, as the
rest; it works under the same content security policy, from its own address only, with its own
script and stylesheet and no inline script.

It has no checks of its own and no copy of the schema. At start it asks `api/admin/state` whether
it is on and signed in, and shows the sign-in, or "The admin page is off" with the reason; once
signed in it reads the schema from `api/admin/schema`, from which every section, label, help line,
default, range and list of values is taken, and its settings from `api/admin/settings` and
`api/settings`, again every five seconds, and sooner after a change. A field being typed in is
never redrawn under the cursor: news waits until it is left.

The layout is a side rail of nine sections with a count of
what is set there or failing, the collector's pulse, Download config.toml and Sign out in the
header; below 720 pixels one column, with the sections in a sheet. Each row shows where its value
comes from: `config.toml`, `Default`, or `Set here` in gold with what the file or the default holds
and a Reset. A change applies on the click, or on Enter or leaving a field: the page sends it, and
shows it kept when the server keeps it ("Checked by the collector's rules", then "In use by the
collector since" once `state.json` says so), or refused, with the field as typed outlined in red
and the server's words after "Not saved: ". A new device is filled in first and sent whole
by Add to the list. A change to the look, display, quiet scenes or scenes is sent to
`api/settings`, as a wall's screen sends it. Put everything back, at the foot of the `.env`
section, asks first and says what it clears.

`?t=` on its address holds the previews' knights at one moment, for screenshots.

## Deploying

The bundled server serves the copy of `web/` its image holds, stamped at build time by
`server/stamp.py` with the same version, `version.json`, meta tag and `?v=` addresses that
`tools/deploy.sh` gives the same files ([server.md](./server.md#what-it-serves)). A new image
reloads open displays as a deploy does. To serve the page from a web server of your own instead:

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
base pack does not. The admin page under `admin/` is copied with the rest and is part of the
version, but `tools/deploy.sh` stamps `index.html` alone: the admin page works only behind the
bundled server, which stamps it as it loads it. The tool leaves `data/packs/`, where the collector writes the packs it downloads, alone
with the rest of `data/`. The fonts the stylesheet loads are not stamped. A deploy that changes
nothing in `web/` gives the same version and reloads no open page. The version does not depend on
git, so the tool works from an exported copy too. It refuses a folder that is `web/`, lies inside
it or holds it, and an `index.html` whose meta tag it cannot find. Open displays reload within
about five minutes of a deploy that changes something.

## Checks

Syntax, from the repository's root:

```bash
for f in $(find web/js web/packs web/admin -name '*.js'); do node --check "$f" || exit 1; done
```

The mapping from a state file (the devices and the fallback to the pie among it), `judge`,
the rules for events and the decision to reload, the props of the devices, the knight's
drawing and rig on both paths, the base pack, the pack library, and loading the packs with what
is drawn when they fail:

```bash
node --test tests/web/
```

`tests/web/knight.test.js` checks the knight call by call. It loads the scripts `index.html` loads
that the knight's drawing needs (`draw.js`, `sprites.js`, `effects.js`, `props.js`, `knight.js`, the
house and the smithy, `ed25519.js`, `pack.js` and the base pack's carrier, in the page's order; not
the scene compiler or the medieval world's pack, which dress no knight) under Node
with an empty `window` and a fake canvas context that records every call and every property set;
`KW.devices.draw` writes one line in the record. It chooses the knight's source as `main.js` does
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

`tests/web/props.test.js` loads `draw.js`, `sprites.js`, `effects.js` and `props.js` the same way and checks each
kind of device: that it stays inside 80 by 64 above its base, up and gone; that its moving
part is only its lamp, inside the place, in both states (the chest's the engine's lamp, the owl's,
the cauldron's and the flask's lamps of their own); that the engine's lamp fades green to black
over 3.6 seconds while up and red to black over 2 while down; that the owl's eyes, the brew and the
potion light in the device green while up and their down lamps only in the down reds, the dazed
owl's spirals keeping their gaps dark; that the owl's wall plate stands where the camera's did, x
22 to 32 from 64 above the base, so a pole meets it; that its still part does not change with
time; that gone differs from up; and that the pie in parts draws what the whole pie drew. For the
pie's lamp it checks that it lights green on the lamps' loop up and in the down reds alone down,
that it covers exactly the filling the still part leaves showing (through the lattice up, in the
last slice down), that nothing but the steam stands above the dome, and that it stays inside the
pie's place. It prints the calls each part costs.

`tests/web/world-props.test.js` draws every kind from the medieval world's prop set beside the
code's drawing of it, call for call, in every place of every scene (the court's among them), up and
gone, with and without its question mark, at seven moments, and its still and moving parts alone;
the moving parts every 25 ms through the lamps' loops; with the rest of what the compiler does for
the devices ([worlds.md](./worlds.md#the-devices)).

`tests/web/world-cast.test.js` draws the fly from the medieval world's cast beside the code's, both
frames and what falls, at whole and fractional points, and runs the engine's frames every 20 ms
while six flies fly in, hover, are swatted and fall, with the cast from the pack and from code, every
call of every frame compared. It draws each monarch from the pack beside the code's in 55 looks
each, call for call, every skin with every hair among them. It holds the goblin's six pose canvases from the pack to the code's,
call for call, and runs the goblin's whole event every 20 ms at the battlement and at the camp from
both; with the rest of what the compiler does for the cast ([worlds.md](./worlds.md#the-cast)).
`tests/web/foe.test.js` loads no compiler, so it checks the code's goblin;
`tests/web/world-scenes.test.js` runs its checks on the pack's.

`tests/web/world-words.test.js` loads the page's scripts but the engine, the settings and `main.js`,
and checks the quiet line and the captions built from the collector's parts in the medieval words,
against the collector's own rule, with the collector's text when there are no parts or no words;
the overlay's custom properties against the fallbacks `display.css` gives them; that `main.js`
writes the words with `textContent` and sets the overlay after the world has started; where the
words and the overlay come from on a `dev` and a deployed page; and the demo's parts, texts and
lines ([worlds.md](./worlds.md#the-words-and-the-overlay)). `tests/web/state.test.js` checks that
`quiet_parts` and an event's `parts` are read as strings, or not at all.

`tests/web/foe.test.js` loads the page's scripts the same way, the engine included, and checks the
foe player and the goblin in `KW.props.FOES`: that the goblin's drawing matches its measures; that
the entrance runs in order and the poof is over within the event's 3.4 seconds; that the goblin
stands in the scene's `foeZone`, clear of the knight, the pie and every device on the
ground, and does not come when there is no room; and, for the greatsword from the base pack and
from code, the arming sword and the mace, at every spot the knight strolls to in both scenes, that
the goblin stands within the weapon's reach, that the blade comes within 3 pixels of its crown at
the hit and of a drawn pixel of its sprite, that the hit pose plays only from that moment, and that
the blade never enters the goblin by more than 2. A sword is measured by its blade's outline and
kept out of every drawn pixel of the goblin through the whole strike. The mace is measured by its
drawn outline, read from the base pack's own shapes rather than from the engine, and kept out of
the goblin's crown, the planned outline, laid where the goblin is drawn at each moment up to and
including the hit. Its head meets the goblin where the swords do not, by the near ear at the camp
beside a device in `g3`, and there the hit pose flings the near hand above the crown and the bounce
brings a flange back across the ear's point, so the drawn goblin and the bounce are left out of the
mace's check. The same check runs on Broad and Slim with each weapon. On every build and with each
weapon the goblin comes wherever it comes on Classic, at the same spot, and is struck within 12 ms
of Classic's hit, or 16 with the mace, which beside `g3` meets the goblin at the end of its reach,
where each build changes which point of a flange meets it first (14 ms at most); at the knight's
first spot the hits are 1662, 1664 and 1661 ms with the greatsword on Classic, Broad and Slim, with
the sword and shield 1645, 1651 and 1642 on the battlement and 1711, 1713 and 1711 at the camp, and
with the mace and shield 1644, 1649 and 1641 on the battlement and 1709, 1712 and 1708 at the camp. The
blade `bladeOf` measures is the rig's on the look's build, its grip raised by the build's height,
and the present knight's on the code path. A blade too short to reach it anywhere keeps the goblin
away.

`tests/web/world-scenes.test.js` runs those of its checks that depend on a scene again on each scene
of the medieval world's pack that hosts a foe, compiled from the pack: the entrance and the poof,
where the goblin stands, the hits on every build and the blade against the goblin with each weapon.
It also holds the goblin's whole plan there (where it stands, the line it comes over, the moment of
the hit) to the plan in the code scene, for every weapon and build, and runs the checks of
`places.test.js` on every scene of the pack. It runs every scene of the pack that has an act (a
`target`, an `anvil`, a `bed` or a `screen`) frame by frame beside its code scene, comparing every
call, `over`'s among them, every change to the knight's pose and `strike`.
`tests/web/world-knight.test.js` runs the knight test's checks of the house and the smithy on the
two from the pack: the ten records of them painted and drawn against the stored ones, with the
knight from code and from the base pack; in each of the base pack's other looks (the arming sword
and the shield, Broad and Slim) the same calls as the code scenes; their backdrop keys; their
rests, and the house's places and rounds; the pegs under the arming sword's blade; no hot tip for a
weapon without a blade; and no shield on the house's wall when its rest view does not fit. `foe.test.js` and
`places.test.js` draw the code scenes.

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

For the three builds the knight test checks that Classic, chosen by name, draws the stored record
in every pose from the base pack; that Broad and Slim, with each weapon, draw every pose of the
record, both swings at every twentieth and the attack without a throw, a refusal, a broken number
or a fall back, each frame's fills from the look's lists within the look's cost, and other calls
than Classic's; that on all three builds, with each weapon, both hands stay on the grip (the
greatsword's two hands on its frame between its stations, the sword hand on its station and the
shield hand where the pose puts it) in every frame of both swings at every hundredth, the attack
every 20 ms, the goblin strike on both sides and the stances, that the grip is where Classic holds
it raised or lowered by the build's height, that the hands hang 10 outside and 48 below each
shoulder with no weapon, and that the hammer's hands do not move; that no arm is drawn over a blade,
its guard or the shield on Broad and Slim with each weapon, by the same frame-by-frame check as
above; and that the camera at the house's `h2` clears the knight of every build.

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
12-hour clock, `12:05 AM` and `12:30 PM` among it. For the monarch's hair and robe it checks each
level in turn, values the page does not know (the empty "as drawn" among them), "As drawn"
clearing one saved key and falling to the defaults, and the swatches' bands in the engine's input.
For the scenes it checks every scene's `can` against the table in
[design.md](./design.md#scenes-chosen-per-condition), that every condition can be acted in its own
scene, the five conditions offered, each level in turn, a scene that cannot act its condition, a
condition not offered and an unknown name each ignored with one line, the saving, reading back
and reset of the section, and a text saved before the section existed. In a sandbox it checks the
engine's quiet rotation, the engine playing a condition in the scene chosen for it only where that
scene can act it, the monarch's skin (the court's own calls for the warm swatch, and each other
swatch's colours alone for every monarch), the monarch's hair and robe (the court's own calls when
none is given or one cannot be read, each swatch's bands where one is, and the backdrop's key), and
`look()`. It checks the build row's choices (`KW.settings.buildChoices`): Classic, Broad and Slim
from the base pack's names with Ready under each, a renamed build shown by its new name, and a
base pack that draws build A alone greying the other two by their letters. It also draws the
knight from the base pack in every combination the settings offer, weapon by skin by hair by hair
style with the build, the tabard and the plume cycled, 720 looks, the build turning so that each
meets every weapon, skin, hair colour and hair style, each standing, attacking and swinging both
ways, helmet on and off, the bare head and the gear at rest, and checks that none throws, falls
back or passes the caps, that it is rigged on its build, and that its colours are drawn; every
choice of the gear on every build, 108 looks, beside the longsword and the mace in turn, the long
cloak drawn in the gold plume's colours; and every monarch in every skin, hair and robe, "As drawn"
among them, 882 courts, each drawing its own colours. For the gear it checks that every value names
an item of its slot in the base pack and every item of a slot is offered, the page's own being the
base pack's defaults; the look each choice makes, the shield carried only beside a one-handed
weapon and no back putting nothing on; what the screen greys and the words it says; and the
choices' names from the base pack, a base pack without an item offering only what it draws.

The stored record changes only when the knight is meant to look different. Store it again from the
code as it is with `KNIGHT_LOG=write node --test tests/web/knight.test.js`, and look at the
screenshots before trusting it. A change to the knight's look then changes the base pack too, so
that both paths still give the stored record.

`tests/web/scenes.test.js` checks the scenes call by call in the same way, so that a scene moved into
pack data can be shown to draw exactly what it drew. It loads the scripts `index.html` loads that
the scenes need (`draw.js`, `sprites.js`, `effects.js`, `props.js`, `knight.js`, the seven scenes,
`state.js` and `engine.js`, in the page's order) into a fresh sandbox for each state, with the
knight from code and the view's edges set as `fit()` sets them, and records each scene's `paint`,
then for each moment
its `act`, `draw` and `over` and the devices in front of the knight, which the engine draws after
it. What `act` and `draw` change in the frame (the knight's pose, `strike`) is written as a line per
field. The devices are drawn by `KW.devices`, and a canvas of the fake document keeps its own calls,
written into the record where it is drawn, each after `| `; so the record holds every call that
reaches the screen. Where a scene calls on the knight (`KW.knight.head`, `speech`, `swing` and
`rest.draw`) the record has a line with the call and its arguments instead of the knight's own
calls, which `knight.test.js` checks.

The states, for every scene: idle; each condition in its `can`, the dish gone for `pi_silent` and a
machine down with a box among the devices for `device_down`; the helmet the other way from the
scene's own; and the devices in all seven places, up, gone and alerting, up in other kinds, and
gone without alerting. The house adds the television on, the smithy the knight at x 300, the yard
its dummy struck by the training swing and then wobbling, and the court each monarch in its own
colours and in each of the base pack's six skins, and a sample of hair and robe: each monarch in
each hair with a robe and a skin turned so that every monarch meets every hair, robe and skin, and
light hair meets dark skin, where the brows change colour, and each with a hair alone and a robe
alone. Each state is drawn at 960 by 600, at 1400 by 600, where `HL` and `HR` lie 236 pixels
outside the grid, and at 960 by 720 (4:3), where `HT` lies 122 above it; and at 0, 1250, 2300, 3450
and 4700 ms, which catch the hammer striking and raised, the monarch talking with the mouth open and
shut, the question marks shown and hidden, the WAN's sparks and the sleeper's breathing, or at the
moments of the dummy's wobble. The goblin's six poses, the flies, the hole, the clods, the smoke, the
sparkles, the crate and its parachute are recorded once, apart (`cast`). The fly and the goblin of
the medieval world's cast are drawn again from the pack against the same records.

Each scene the medieval world's pack gives (today every scene) is then drawn again, with the
monarchs from its cast, compiled from the
pack by `world.js` as a `dev` page compiles it, in the same states, at the same sizes and moments,
and held to the same stored records: the code and the pack must draw the same calls
([worlds.md](./worlds.md#two-copies-held-equal)). The backdrop's key is not in the records, so the
test also works out each scene's key in every recorded state, from code and from the pack, and
requires the two to tell the states apart alike: two states share a key from the pack exactly when
they share one from code, whatever the strings. And it requires the compiled scene to give the code
scene's spot, places, rests, rounds, `can`, weapon and helmet, `outdoors` and `foeZone`, and the same
parts drawn. The records are
stored from code alone: `SCENES_LOG=write` never stores the pack's copy, and `SCENES_LOG=dump:`
writes it to a folder of its own, such as `cellar@kw.medieval`.

The 1 803 records are stored in `tests/web/fixtures/scenes/`, one file per scene and `cast.json`:
for each record the first 16 characters of the hash of its calls, and for each distinct record its
number of calls and a hash of each block of 1 024 calls, about 230 KB in all, where the records in
full would weigh 287 MB (123 MB counting each distinct record once). A run takes about 80 seconds,
the 1 782 records of the scenes from the pack and the 21 of its cast included (the court's 522, the
house's 270, the battlement's and the yard's 234 each, the camp's 216, the cellar's 162 and the
smithy's 144). When a record differs, the test draws it again
from the repository's `HEAD` (`git show`), and when `HEAD` draws the stored record it names the
scene, the state, the size, the record and the first call that differs, with what `HEAD` drew there
and what was drawn. Without git, or when `HEAD` draws something else too, it names the block the
first difference lies in and prints what was drawn there; dump both trees and compare the folders to
see every call. `SCENES_WEB` points the test at a copy of `web/`, to try a change outside the
repository:

```bash
SCENES_LOG=write node --test tests/web/scenes.test.js         # stores the records of the code as it is
SCENES_LOG=dump:/tmp/kw-scenes node --test tests/web/scenes.test.js
SCENES_WEB=/tmp/kw-copy/web node --test tests/web/scenes.test.js
```

Store the records again only when a scene is meant to look different, and look at the screenshots
before trusting them. The records were stored before the effects moved out of the scenes into
`effects.js`, and the scenes draw them unchanged through it.

`tests/web/effects.test.js` checks the effects of `effects.js` (see [The effects](#the-effects)).
It loads `draw.js`, `sprites.js`, `effects.js` and `props.js` into a sandbox whose context counts
the calls that fill, and draws every effect with a spread of its fields (each at its least, each at
its greatest, its defaults, and forty made up at random within its table), at the three sizes and
at six moments for one that moves, or for `burst` at five points of the sparks' progress and six
times after the straw's trigger. Each drawing must make no more fills, and no more glows, than the
effect's cost function gives for those fields, and for every effect some drawing must come within a
quarter of it, so that no bound is loose enough to say nothing. A drawing whose cost passes 200 000,
which no scene may hold, is not drawn. It checks that the effects are the list `pack.js` names, that
a field left out draws as its default, and, with `pack.js`: that every effect reads clean in a 1.1
scene, with its required fields and with every field given its default; that every field of every
effect is refused at `fields`, naming it, when given a value of the wrong kind or out of its range;
that a field the table lacks and a required field left out are refused; that scalars are held to
their ranges at both ends, colours resolved and named values checked; that the counts step costs
each effect with its own function at the ends of the scene's ranges; that effects too costly for a
frame, or with too many glows, are refused; and that the world fixture still reads clean.

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

Besides the scenes and states, the set shoots devices: the camp with two cameras and four
devices, a camera and a machine down and one device with no place left (`devices-camp`), the court
with the same mix (`devices-court`), `device_down` in the camp (`device-down`) and the yard's places
outlined (`places-yard`). Every other shot has no `dv=` apart from `goblin-camp-g3` and the `ref-`
shots of devices (below), so a change to devices that leaves a Pi-only setup alone leaves the rest
byte for byte the same.

The seven `goblin-` shots play the goblin's event with the greatsword: on the battlement as it
rises over the wall (`goblin-rise`), at the hit (`goblin-bonk`, 1662 ms) and in the puff
(`goblin-poof`); at the camp as it comes out of its hole (`goblin-camp-rise`), at the hit
(`goblin-camp-bonk`, 1662 ms) and in the puff (`goblin-camp-poof`); and at the camp with three
devices on the ground, which it stands clear of, as it pulls a face (`goblin-camp-g3`).

The nine `arm-` shots draw the arming sword and the heater shield (`arm=one`): the quiet battlement
(`arm-battlement`), the yard's hot training (`on=cpu`) mid-swing (`arm-yard`), the attack
(`arm-attack`), the house with the sword on the pegs and the shield on the wall (`arm-house`), the
smithy with the sword on the anvil and the shield on the wall (`arm-update`), the swat to the left
at the moment the sword passes in front of the shield (`arm-swat-left`), the cellar with the
crate carried against the chest, at the largest headline (`arm-disk`), and the goblin a
millisecond after the hit on the battlement (`arm-goblin-bonk`, hit at 1645 ms) and two after it
at the camp, with the blade over the shield (`arm-goblin-camp-bonk`, hit at 1711 ms). Every other shot but `settings-look` has no `arm=`, so a change to the one-handed look leaves them
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

The eleven shots after them show the monarch's colours and the scenes chosen per condition.
`settings-monarch-colours` is the monarch's page at the tablet's size, where the Hair colour and
Robe rows show, with monarch C in auburn hair and a teal robe (`mh=`, `mr=`); `mon-a-colours`,
`mon-b-colours` and `mon-c-colours` put each monarch at court in a hair and a robe of the hooks',
and `mon-a-colours-tan`, `mon-b-colours-deep` and `mon-c-colours-fair` in another pair on another
skin. `settings-scenes` opens the Scenes page, and `settings-scenes-tablet` the same at the
tablet's size with the attack set to the camp by the address (`sc=`); `scene-cpu-camp` shows
running hot at the camp, and `scene-pi-battlement` the empty dish stared at from the battlement.
Against a reference from before these, the eight settings shots that show the rail differ in it
(the Scenes entry), `settings-monarch` and `settings-monarch-skin` also in the rows below the skin
tones, these eleven are missing, and the rest compare as usual.

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

The 56 `bd-` shots follow, 28 for Broad (`bd-b-`, `bd=b`) and 28 for Slim (`bd-c-`, `bd=c`):
the four quiet scenes with the knight standing (`is-`); the attack, tight memory's bloat, the
cellar's crate carried, the smithy's hammering, asleep in bed, the sick tint in bed, the hot tint in
the yard and the court (`on-`); the stance with the sword and shield (`arm-battlement`); the swat
on the battlement, which is the swing, with each weapon (`swing-two-`, `swing-one-`), both ways at
the wind-up (q .3), mid cut (q .42) and the cut's end (q .55); the goblin a millisecond after each
weapon's hit on that build (`goblin-bonk` at 1665 and 1662 ms, `arm-goblin-bonk` at 1652 and 1643);
and the settings screen's knight page with the build chosen (`settings-knight`), the build chosen
by the address's `bd=` hook. No other shot has `bd=`, so they change nothing else in a comparison,
and against a reference from before them they are missing.

The 62 `ref-` shots end the set. They are the reference for moving the scenes into pack data, taken
with the call records of `tests/web/scenes.test.js`, and show each state of a scene that no shot
above shows: each condition in each scene that can act it, chosen with `sc=` or played in a quiet
scene with `is=` (`ref-battlement-backup` to `ref-cellar-cpu`, seventeen); the helmet on in the
house (`ref-house-helm-on`); the smithy with the hammer raised (`ref-smithy-lift`); the yard's dummy
struck, its straw flying (`ref-yard-struck`); each monarch in each skin no shot above shows
(`ref-mon-`, fourteen); the devices in all seven places, all up and all gone and alerting, in every
scene (`ref-devices-up-` and `ref-devices-gone-`); and every scene at 1400 by 600 (`ref-wide-`) and
at 960 by 720, a 4:3 screen (`ref-43-`), the only shots of a scene out to edges beyond the grid's.
Against a reference from before them they are missing. At 4:3 the clock is larger for the width,
and the left edge of its first digit, from x 728, lies outside the comparison's mask, which starts
at 740; so a reference and a result taken either side of 10:00, 20:00 or midnight differ in the
`ref-43-` shots there.

The 34 `free-` shots after them show the base pack's free items of 1.4.0, chosen with `arm=`
(`longsword`, `mace_and_shield`) and the gear's hooks (`sh=`, `hm=`, `ps=`, `bo=`, `so=`, `am=`,
`hn=`, `lg=`, `ft=`, `bk=`): the longsword standing and in the swat both ways; the mace with the
round shield, in the attack and the swat to the left with the kite shield; the kite shield in the
yard and the round in the swat to the left with the arming sword; the mace's head hot on the
smithy's anvil; the house with the kettle hat and its feather, the mail coif and the bascinet on
the stool and each weapon and shield at rest; three whole looks, one per new helmet, on the
battlement, at the camp and in the yard; the long hair and the close crop, the long hair under the
bascinet and on the sleeper's pillow; the long cloak in the attack, the short cape with the
cellar's crate and the breastplate and cloak in the bloat; whole looks, the swat and the attack and
the new hair on Broad (`free-bd-b-`) and Slim (`free-bd-c-`); and the settings screen's knight
page at 1480 by 2800 with every row in view, as the defaults leave it (the shield greyed beside the
greatsword), with the mail coif and the long cloak (the plume's style greyed, its colour live for
the cloak), and with a whole new look on Broad and on Slim. Against a reference from before them
they are missing. Against a reference from base pack 1.3.0 the six settings shots of the knight's
page and of the status differ too: the weapon and hair style rows gained choices, and the status
names the base pack's version and whether it is signed.

The four shots that end the set show the worlds. `settings-world` opens the World page over the
battlement with nothing set, and `settings-world-tablet` the same over the camp at the tablet's
size; `settings-world-changed` has the weapon and the tabard the address changes from the world
(`arm=one`, `tb=forest`), each beside the world's own, under a card that still shows the world as it
comes; and `settings-status-world` is the status page at the tablet's size, whose World, Parts and
Fallbacks entries show that tabard and a full disk asked for in the camp, which cannot act it
(`sc=disk_full:camp`). Against a reference from before worlds these four are missing, and every
settings shot that shows the rail differs in it, where World was added first; `settings-status`
differs in its entries too, where the Knight entry gave way to World, Parts and Fallbacks.

Headless Chromium paints few animation frames, and how many depends on how busy the machine is.
Freeze time with `t=` for screenshots, and never make the first frame wait on elapsed time or fade
in. With time frozen the events and the swat start before the first frame and nothing advances from
one frame to the next, so every shot depends only on its address: two takes of the same tree come
out byte for byte the same, on a busy machine too, apart from the clock when the minute turns.

The repository's page is a `dev` page, so the screenshots show the knight drawn from the base pack
and every scene, device and member of the cast drawn from the medieval world's pack, with its words
and its overlay. A deployed copy draws from each pack while it ships signed, and from code
otherwise: today the knight from the base pack, signed, and everything else, words and overlay
included, from code, since the medieval world's pack 0.6.0 ships unsigned until its signing run.
`shots.sh` shoots only from disk, so to look at a deployed copy and its downloaded packs, serve it
on the loopback address and point the headless browser at `index.html?demo#<hash>` by hand: `?demo`
starts the demo at once instead of waiting for a state file, and a served page fetches
`data/packs/` in every mode.

To shoot the code path from disk, copy `web/` to a folder outside the repository and give the
copy's `kw-version` meta tag any value but `dev`; a page opened from disk runs the demo whatever
its version. Take the copy's signature off its base pack with
`node tools/sign-pack.js --unsign <copy>/packs/base.pack.json`, so that the copy refuses it and
draws from code whichever state ships; unsign the copy's medieval world's pack
the same way (`<copy>/packs/medieval.pack.json`), so that it draws every scene, device and member of the cast from code too. Do it before and after a change and compare each path's two
sets:

```bash
cp -r web /tmp/kw-code && sed -i 's/name="kw-version" content="dev"/name="kw-version" content="code"/' /tmp/kw-code/index.html
node tools/sign-pack.js --unsign /tmp/kw-code/packs/base.pack.json
CHROME=/path/to/chrome-headless-shell PAGE=/tmp/kw-code/index.html tools/shots.sh take /tmp/kw-ref-code
```

The comparison prints `identical bytes` only when both sets show the same minute on the clock;
otherwise `pixels equal outside the clock` is the same result. A set of 192 takes about a minute, so the two
sets seldom show the same minute, and `pixels equal outside the clock` is the usual result.
