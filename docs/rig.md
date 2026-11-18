# The knight's rig

For contributors: how `web/js/knight.js` rigs and draws the knight, the medieval world's watcher,
from a pose; how the page chooses between the base pack and the code to draw it from; and how the
scenes show the knight's gear at rest. The anchors, the named values and the slots as a pack author
uses them are in [packs.md](./packs.md#the-rig).

## Anchors, values and poses

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
their measurements are in [library.md](./library.md#the-base-pack). The anchors lean on the
differences in full. `stance` moves the feet and hips sideways, `leg` raises the hips, the hem and
the belt, `height` raises the neck, the shoulders and the head, `shoulder` widens the shoulders,
and `head` raises the head, so that a bigger skull grows upwards from the neck. `chest`, `waist`
and `hip` move no anchor. The hands and the weapon follow the build too: see the grips below.

**Which build is rigged.** On the pack path the knight is drawn on the look's build, and
`KW.knight.rig(o)` from outside takes the same build when none is passed, so whatever measures the
knight from outside measures the knight drawn. `engine.js` does: `bladeOf` finds the blade on the
rig, and through it `foeGaps`, `contactQ` and the goblin's plan work out where the blade meets the
goblin on the build drawn (see [Modes](./display.md#modes)). The weapon is measured by its blade's outline, the
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
  by a pixel at some angles. A weapon aimed ([Aiming and firing](#aiming-and-firing)) has no guard,
  and its hand stays on its station.
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
  `FRAME_SY`, the weapon frame's direction, `sin(a)` and `-cos(a)` of `main`'s angle, and at
  `FRAME_FL` the flip: 1 while a weapon that fires is aimed to the left, when every framed point's
  `p` is drawn as `-p`, and 0 otherwise;
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

## Aiming and firing

A weapon that fires (format 1.2, [packs.md](./packs.md#weapons-that-fire)) is aimed and fired by
the engine, as a blade is swung, the same way whatever body holds it. `KW.knight.fired()` gives the
look's weapon when its `use` is `fire` or `both`, as `{ use, barrel, muzzle, range, shot, stowed }`
from the resolved look, and `null` for a weapon that only swings and on the code path.

**The stances**, beside `BASE` and `BASE1`, in the same units, towards the right:

| Stance | Weapon frame `gx`, `gy` | Shield hand `fx`, `fy` | On the grid, from the root |
|---|---|---|---|
| `AIM2`, two hands | 38, 35.6 | | the frame's origin, the rear hand's station, at (+70, -122), just outside the right shoulder; the front hand further along the frame |
| `AIM2.left` | 10, 35.6 | | mirrored about the root, at (-70, -122) |
| `AIM1`, one hand | 45.6, 34.4 | 20.4, 37.2 | the weapon hand out at shoulder height at (+108, -128), the shield in front of the chest a little raised, at (-18, -114) |
| `AIM1.left` | 7.2, 34.8 | 20.4, 37.2 | the weapon hand across the body at (-84, -126), past the shield's edge, since the weapon stays in the right hand |

`KW.knight.aim.pose(o, dir, a)` puts the stance towards `dir` (1 right, -1 left) into the pose with
the weapon at the angle `a` (0 straight up, pi / 2 level to the right, -pi / 2 to the left). Like
every pose they are written for the present knight and rise and sink with the build's shoulder line.

**The aim.** `KW.knight.aim.angle(o, dir, at, above)` gives the angle that points the shot at the
point `at`: worked out from the frame's origin in the stance, which does not move as the weapon
turns, and turned by the muzzle's offset across the frame, so that the line of the shot from the
muzzle meets `at`. It is held from 0.3 below level to `above` over it, 1.2 when left out, so the
watcher never aims at the floor or the headline; `AIM.swatAbove`, 1.4, is the higher limit flies
nearly overhead need. A point behind the watcher gives the nearer limit on the side aimed.

**`fire(o, q, dir, at)`** plays one shot over q from 0 to 1, timed by the act that fires:

| q | The weapon |
|---|---|
| 0 to .3 | raised from the stance to level, easing |
| .3 to .5 | turned to `at`, easing |
| .5 | fired: from here `fire()` returns true. The shot leaves the muzzle as the pose stands just before .5 (`KW.knight.muzzle(o)`) |
| .5 to .6 | the recoil, 4 pixels back along the frame and 0.08 up at .5, gone by .6 |
| .6 to 1 | back to the stance, easing |

The eyes are angry from q .2 to .7. A turn from one side to the other never passes through straight
up: both angles are taken on the circle from 0 to 2 pi, so the weapon is carried low across the body
through straight down, and the grip dips by 30 pixels at the middle of the turn, never over the face.
Every pose the stances and `fire()` write is marked `o.aimed` (from q 0 to 1, not at either end): a
two-handed weapon's front hand then stays on its station at every angle, with none of the blade's
slide, and a weapon aimed left is drawn turned over its frame's line (`FRAME_FL`), so that one drawn
from the side keeps its stock below and its sight on top. `KW.knight.muzzle(o)` gives the muzzle
on the grid as drawn, the flip included, and `null` for a weapon that does not fire. `AIM` holds the
limits and the recoil (`below` 0.3, `above` 1.2, `swatAbove` 1.4, `recoil` 4, `recoilUp` 0.08).

The stances and `fire()` exist for the acts to use, and no act uses them yet: the attack, the
swat, practice and the foe still swing, and a weapon that fires is held and swung as a blade is
until those acts are built.

**No arm over the barrel.** The rule for blades holds for a barrel forward of the front hand:
`tests/web/fire-barrel.test.js` draws every frame of `AIM2` or `AIM1` at every 0.05 of the aim's
range both ways, and of `fire()` at every 0.01 of q both ways, aimed high, level and low, and checks
that no arm or gauntlet is drawn over a pixel of the weapon from its barrel's `from`, nor over the
shield's face. It does so for the test world's blaster with and without its deflector, its prod and
a trial crossbow made in memory (its front hand 38 along the frame, its barrel from 54), on the base
pack's three builds in plate, mail and padded sleeves and on the test world's unit: 40 sets of 668
frames. With its front hand at 40 the crossbow's gauntlet covers up to 8 pixels of a barrel from 54
in a frame. One limit is known: with a shield, the turn across the body to the left and back, from q
0 to .3 and from .6 to 1, carries the weapon arm in front of the shield, and the test counts those
frames apart.

## The knight from the base pack

At start-up, before the first frame, `main.js` calls `KW.knight.start(KW.packText, dev, { look: {} })`
with `dev` true only when the page's version is `dev`. `start` reads the packs the carriers pushed,
gathers them and resolves the look, the base pack's defaults. `main.js` then hands the look the
settings make (see [Settings](./display.md#settings)) to `KW.knight.look(look)`, which resolves it again from
the packs already loaded and reads nothing again, and it calls `look()` once more whenever the
settings change it. With nothing set the look stays `{}`, so the knight is the base pack's defaults
exactly. Calling `start()` again would rebuild from the carriers alone and lose the downloaded packs,
so the settings never do. If a look resolves, the knight is drawn from the
base pack; otherwise from the code in `knight.js`, the full knight as it shipped before packs, which
draws the default look: the greatsword, and no shield anywhere. A `dev` page accepts packs signed or unsigned. A
deployed page accepts a pack only when it carries a signature that verifies against a key in
`KEYS`, and refuses it at the `signature` step otherwise. [library.md](./library.md#where-the-knight-is-drawn-from)
says which state ships today.

Served over HTTP, `main.js` then fetches the downloaded packs in `data/packs/`, once
at load and in every mode, with `KW.knight.fetchPacks(fetch)`, and hands them to `KW.knight.add()`,
which reads them with the same rule and resolves the look again. When any pack came, it then starts
the world again at once with every text, those the page ships with and the downloaded ones
(`KW.world.start(KW.packText.concat(...), ownVersion === 'dev')`), sets the overlay's properties
and the devices' prop sets again, and paints its backdrops again
([world-loading.md](./world-loading.md#downloaded-world-packs)). `look()` keeps the same rule: a pack refused or marked bad stays so. From disk it fetches nothing. A missing `data/packs/index.json` means no packs and
is silent. [library.md](./library.md#downloaded-packs) has the index's shape and its limits.

`knight.js` writes one line to the console for each refused pack, and one each time the source
changes; the settings screen's status page shows both, and nothing about either is drawn on the
display itself. `KW.knight.source` holds `'pack'` or `'code'`,
and `KW.knight.status` the base pack in use, the refused packs, the look's fallbacks and the last
line, for the settings screen's status panel. What happens when packs fail, in order, is in
[library.md](./library.md#when-packs-fail).

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
compiler turns into the same calls ([scenes.md](./scenes.md#how-a-scene-compiles)):

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
the anvil's rest stands in a moving layer ([scenes.md](./scenes.md#how-a-scene-compiles)).

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
off ([scenes.md](./scenes.md#how-a-scene-compiles)).
