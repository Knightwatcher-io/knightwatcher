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
| `fonts/` | the VT323 typeface and its licence |
| `js/draw.js` | `KW.view` (the grid and the canvas's real edges), the palette, the drawing primitives |
| `js/sprites.js` | small symbols drawn by code: `mark`, `heart`, `zed`, `drum`, `spark`, `stroke` |
| `js/props.js` | props used by more than one scene or drawn by the engine: the greatsword (`swordHD`), `bricksHD`, `barrelHD`, `tableHD`, `sconceHD`, the pie and the other watched things (`KINDS`), fire, sky and stars, flies, the goblin, the crate and its parachute |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into a pose, `rig(o)` turns a pose into the points the knight is drawn on (see [The knight's rig](#the-knights-rig)), `draw(o)` draws the knight in it, from the base pack or from code as `start()` chose (see [The knight from the base pack](#the-knight-from-the-base-pack)), `swing()` animates a cut, `head()` draws the bare head and `speech()` a speech bubble, and `rest` draws the gear a scene shows off the knight (see [Gear at rest](#gear-at-rest)); `build` holds the knight's measurements. It also creates `KW.packText`, which the carriers fill |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court |
| `js/ed25519.js` | `KW.ed25519.verify`: checks a pack's Ed25519 signature, and does nothing else. See [packs.md](./packs.md#the-verifier) |
| `js/pack.js` | the pack library: reads, checks and compiles packs and draws from them; see [packs.md](./packs.md) |
| `packs/base.pack.js` | the carrier of the base pack: one line that pushes the text of `packs/base.pack.json` onto `KW.packText`. The JSON file is the source and is not loaded itself; see [packs.md](./packs.md#carriers) |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs, and deciding when to reload for a new version |
| `js/engine.js` | the frame: scene choice, strolling, the swat, events, drawing order, and the watched things in their places (`KW.things`) |
| `js/demo.js` | the invented conditions, the review bar and the demo loop |
| `js/main.js` | start-up (where the knight is drawn from, sizing), the clock and the words over the scene, the choice of mode, the check for a new version |

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
  `main` rests at the root with angle 0. The arms are drawn left, then right.
- `hammer`, in the smithy: the left hand steadies the work at `(X + 45, Y - 104 + drop)`, and the
  right swings the hammer from `(X + 80 + bloat, Y - 122 + drop)`, which is also `main`, with the
  hammer's angle.
- `two`, the greatsword in both hands: `main` is the middle of the grip and the blade's angle. The
  hand on the side the blade leans to holds the grip 6 pixels up the blade, the other 30 down it.
  The arm on the lean side is drawn before the blade and the other after it.

The engine's own drawing hangs on the same anchors: the face on `head`; the crates, sweat, steam,
the mark, the thought bubble, the progress bar and the speech bubble on `neck`; the hearts on
`root`. The drumstick takes its height from `head` and its x from `neck`, so it follows the head up
and down but not sideways, as it always has.

`rig` fills the same object on every call and returns it, so a frame allocates nothing for it and a
caller that keeps the result sees it change at the next call.

**The library's arrays.** On the pack path each frame copies the rig into the two `Float64Array`s
that `draw()` in `pack.js` reads, made once by `newAnchors()` and `newValues()`:

- the anchors, x then y of each, in the order of `ANCHORS` in `pack.js` (`root`, `footL`, `footR`,
  `hipL`, `hipR`, `hem`, `belt`, `neck`, `shoulderL`, `shoulderR`, `head`, `handL`, `handR`,
  `main`, `off`, `rest`). The rig has no `off` or `rest`, and they stay at 0: the base look has
  no shield, and nothing on the knight hangs on `rest`, which the gear at rest sets in arrays of
  its own (see [Gear at rest](#gear-at-rest)). After them, at `FRAME_SX` and
  `FRAME_SY`, the weapon frame's direction, `sin(a)` and `-cos(a)` of `main`'s angle;
- the values in the order of `VALUES`: `drop`, `bloat`, `stepL`, `stepR`, `sway`. `drop` is
  clamped to 0 to 40 and `bloat` to 0 to 60, the ranges `RANGE` in `pack.js` states and every
  pack's shapes were checked over. The present knight stays inside them (a drop of 10 at most and
  a bloat of 30), and the anchors keep the unclamped numbers. The build's differences are not in
  the array: the look folds them in when it is compiled, and the rig takes the look's
  measurements.

On the pack path the two hand stations along the weapon are the weapon's own `grip.hands`, which
for the base pack's greatsword are the same 6 and -30.

## The knight from the base pack

At start-up, before the first frame, `main.js` calls `KW.knight.start(KW.packText, dev)` with `dev`
true only when the page's version is `dev`. `start` reads the packs the carriers pushed, gathers
them and resolves the default look. If a look resolves, the knight is drawn from the base pack;
otherwise from code. A `dev` page accepts the base pack signed or unsigned and takes the pack path.
A deployed page takes the pack path when the base pack carries a signature that verifies against a
key in `KEYS`, and the code path otherwise, refusing the pack at the `signature` step.
[packs.md](./packs.md#two-paths) says which state ships today. The two paths draw the same pixels. The choice is made once, printed in one line to the
console, and kept in `KW.knight.source` (`'pack'` or `'code'`) and `KW.knight.status`; nothing about
it is drawn on screen. [packs.md](./packs.md#on-the-page) has the details, and why the code path
stays.

On the pack path `draw(o)` runs the rig, fills the library's arrays, picks the grip mode (`none`,
`hammer`, or `twoR` or `twoL` by the side the blade leans to) and walks the order that
`sequence(mode, helmet)` in `pack.js` gives. It draws each of the look's lists with the library's
`draw()` and the primitives of `draw.js`, and draws the engine's own steps by code at their places
in that order: the crates first, the face after the head group, the drumstick after the face, the
hammer between the right arm and its gauntlet, and sweat, steam, the marks, the thought bubble,
the progress bar, the hearts and the speech bubble last. `@skin.face` takes the skin swatch's sick
ramp when the knight is ill and its hot ramp when overheated. A frame allocates nothing for the
pack path beyond what the primitives and the engine's own steps allocate.

Two things stay as they were:

- the face is drawn by the same code on both paths, in its own colours, which equal the base
  pack's swatches;
- a pose that asks for the drooping plume (`droop`) is drawn by code, since the pack format has no
  drooping plume. No pose of the page sets it.

`head()`, the sleeper's bare head in the house, follows the knight: on the pack path it draws the
look's helmet-off head group and then the face, with the same calls as the code. The gear the
scenes show at rest follows it too; see the next section. `speech()` is drawn by code on both paths.

## Gear at rest

The house and the smithy show the knight's gear off the knight: the helmet on the house's stool
while the helmet is off, and the weapon on the house's pegs and across the smithy's anvil. They
show what the knight has equipped, from the same source as the knight: the look's lists on the
pack path, and on the code path the code in `knight.js` and `props.js`, which draws what the
scenes always drew. A scene asks for each item by its slot, in its own `paint` or `draw`, so the
item stays layered with the scene's art. It does so through `KW.knight.rest`, which makes the
choice of path itself:

| Call | Does |
|---|---|
| `draw(slot, x, y, a)` | draws the equipped item of `slot` at rest. `'helmet'`: the helmet's rest view on the `rest` anchor at `(x, y)`, the middle of its foot on a surface, with the plume's rest view behind it on the view's plume mount. `'main'`: the weapon's worn shapes on a frame with the middle of its grip at `(x, y)` along the angle `a` (0 is straight up, and `Math.PI / 2` lays it flat with the point to the right). Any other slot draws nothing |
| `blade()` | the equipped weapon's `blade`, `{ from, to, half }` in frame units, or `null` when it gives none. On the code path, the greatsword's `{ from: 34, to: 263, half: 15 }` |
| `key(slot)` | the equipped item's name, `<pack>/<item>`, or `''` when the slot is empty; `'code'` on the code path |

On the pack path a helmet with no rest view shows nothing on the stool, and a helmet whose rest
view has no plume mount rests without its plume. Gear at rest does not move with the knight, so it
is drawn with every named value 0, from anchor and value arrays of its own made once at start-up; a
call allocates nothing.

**The places.** A scene declares the places where it sets gear down in its `rests` field, beside
`places`, which holds the watched things' places. The engine does not read `rests`: the scene
passes a place's numbers to `draw`.

| Scene | Place | Holds | Fields |
|---|---|---|---|
| house | `stool` | the helmet | `kind: 'surface'`, `x` 460 and `y` 476 the middle of the stool's top, `w` 76 by `h` 80 the room above it |
| house | `pegs` | the weapon | `x` 618 and `y` 228 the middle of the grip, `a` `Math.PI / 2` |
| smithy | `anvil` | the weapon | `x` 50, counted from the knight's spot `s.kx` so that the blade lies where the hammer falls; `y` 425; `a` `Math.PI / 2` |

The stool's `kind`, `w` and `h` give the place in the shape the pack format gives places; nothing
checks a rest view's `fits` and `box` against them yet. The pegs are spaced for the greatsword's
length. A shield on the wall beside the pegs, for one-handed weapons, would be one more place and
one more slot for `draw`; neither exists yet.

**The hot tip.** The smithy draws the glowing tip of the blade on the anvil from `blade()`, in
frame units along the blade from `to`, the point, and across it from `half`, the distance from the
middle to each edge: three bands of heat starting 73, 57 and 43 short of the point and reaching to
30 short of it, each `2 * half + 1` tall, then the point itself, a light along each edge and a glow
around it. For the greatsword these are the numbers the smithy always drew. A weapon with no
`blade` has no hot tip.

**The backdrop key.** The house and the smithy paint the weapon into their cached backdrop, so
each adds `KW.knight.rest.key('main')` to its key, and a change of weapon paints the backdrop
again: on the pack path the house's key is `tv|kw.base/main.greatsword` with the television on, and
the smithy's `440|kw.base/main.greatsword` at its spot. The helmet on the stool is drawn every
frame, so it adds nothing.

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
| `wallAt(x)` | no | the y of the top of whatever the goblin climbs over at grid x; the ground when absent |
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
| `mon` | the monarch at court, from the address's `mon=` hook: `a`, `b` or `c` |

Some scenes reach further. The house draws the sleeper's head with `KW.knight.head`, the helmet on
the stool and the weapon on the pegs with `KW.knight.rest`, and its Zs at night in `over`. The
court paints the monarch that `s.mon` names into its backdrop, keyed on the choice, sets the knight
talking in `draw` and draws the monarch's speech bubble with `KW.knight.speech`. The smithy's `act`
sets the hammer and `strike`, its `paint` lays the weapon across the anvil with `KW.knight.rest`,
and its `draw` puts the hot tip on the blade. The yard keeps
the time the dummy was last struck and swings the knight's sword in `act`.

## Modes

**Demo.** Invented conditions, the review bar, and a loop through every scene and state. The
quiet scenes take turns a minute each (`DEMO_TURN_MS` in `demo.js`). The demo runs
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
- With no known condition the quiet scenes take turns ten minutes each (`LIVE_TURN_MS` in
  `main.js`), and `quiet_line` is the small line.
- The watched things come from `facts.things`, and without it the pie stands alone as before
  there were things; see [Watched things](#watched-things). `facts.streams.count > 0`, or a
  `streaming` condition, turns the television on.
- Events. The first valid file's events are adopted without playing. After that each event with
  a higher `seq`, oldest first: `ad_blocked` adds `count` flies (at most 100 for one event;
  eight on screen, the rest queued for the next swat), `ip_banned` plays the goblin, `import`
  the crate and `backup_done` the feast, each with `text` as the caption. A `seq` lower than the
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
toggles full screen. The page asks for a screen wake lock on entering live mode, on every tap,
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

## The address

The hash holds the demo's settings and a set of test hooks. `h=`, `hs=`, `t=`, `kx=`, `mon=` and
`pl=` also work in live mode. `f=`, `e=`, `sw=` and `th=` act in the demo and do nothing
elsewhere.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `thing`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
| `is=` | the quiet scene: `auto`, `battlement`, `camp`, `house`, `yard`. The cellar, smithy and court come from conditions |
| `h=` | the helmet: `auto` (off in the house and the smithy), `on`, `off` |
| `hs=` | the headline size: `s`, `m`, `l` |
| `bar=0` | hides the review bar |
| `demo=1` | runs the demo loop |
| `t=` | freezes time at that many ms, `t=0` included, for screenshots |
| `e=` | plays an event: `goblin`, `crate`, `feast` |
| `f=` | starts with that many flies |
| `sw=1` | starts a swat |
| `kx=` | places the knight, in units of `U` |
| `mon=` | the monarch at court: `a` the king, `b` the queen, `c` the monarch who is neither. Anything else, or no hook, gives `a` |
| `th=` | the demo's list of watched things: kinds separated by commas, each followed by `-` for down or `!` for down and alerting, placed by the filling rule. `th=pi,camera!,camera,machine,vm-,x` fills the pie's place, two high places and three ground places, the third with the plain box. An empty item is an entry the page cannot read. Without the hook the demo shows the pie alone, gone while `pi_silent` is on. With `thing_down` on, the knight looks towards the first thing that is down and alerts |
| `pl=1` | outlines the scene's seven places and names them (`P`, `H1` to `H3`, `G1` to `G3`): the place's box, the 80 by 64 a thing may fill inside it, and the base. The pie's place is white, high places blue and ground places amber, and a place in front of the knight has a broken outline |

`e=` and `sw=1` act 300 ms after the page loads, or before the first frame when `t=` freezes time.
With time frozen the knight never starts a swat alone, so the flies of `f=` hover until `sw=1`
starts one, and a knight placed away from their spot by `kx=` stays exactly there, in mid-stride,
rather than walking a step in each frame.

The demo rewrites the hash as its settings change, with the contract's ids in `on=`. The test hooks
(`t=`, `kx=`, `mon=`, `th=`, `pl=`, `f=`, `e=` and `sw=`) are read once when the page loads, and
the rewritten hash leaves them out, so they last until the page is opened again.

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
it draws the knight from the base pack only when the pack carries a signature that verifies, and
from code otherwise. The fonts the stylesheet loads are not stamped. A deploy that changes
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
drawing and rig on both paths, the base pack, and the pack library:

```bash
node --test tests/web/
```

`tests/web/knight.test.js` checks the knight call by call. It loads the scripts `index.html` loads
that the knight's drawing needs (`draw.js`, `sprites.js`, `props.js`, `knight.js`, the house and the
smithy, `ed25519.js`, `pack.js` and the carriers, in the page's order) under Node with an empty
`window` and a fake canvas context that records every call and every property set;
`KW.things.draw` writes one line in the record. It chooses the knight's source as `main.js` does
and draws 112 records: the knight in 98 poses, the bare head in bed, the speech bubble, the helmet
and the weapon at rest, and the house and the smithy, each painted and drawn in the states that
show the gear at rest. It compares each record with the one stored in
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

The same knight test checks the choice itself: the console line on each path, the refusal at the
`signature` step, the code path when there is no base pack, a broken one or no library, a changed
colour in the pack showing on the knight, and the clamping of `drop` and `bloat`. For the gear at
rest it checks the blade and the backdrop keys on each path, that a slot with nothing at rest draws
nothing, that a pack's plume and jewel colours show on the helmet and the weapon at rest, that a
helmet with no rest view shows nothing and one with no plume mount at rest shows no plume, that a
weapon with no `blade` has no hot tip in the smithy, and that the gear at rest is drawn with every
value 0 from arrays made once.

To see every call that differs, dump the records of both trees and compare the folders.
`dump-pack:` dumps the pack path's records instead of the code's:

```bash
KNIGHT_LOG=dump:/tmp/kw-calls-old node --test tests/web/knight.test.js        # in the tree before
KNIGHT_LOG=dump:/tmp/kw-calls-new node --test tests/web/knight.test.js        # in the tree after
KNIGHT_LOG=dump-pack:/tmp/kw-calls-pack node --test tests/web/knight.test.js  # the pack path
diff -r /tmp/kw-calls-old /tmp/kw-calls-new
```

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
outlined (`places-yard`). Every other shot has no `th=`, so a change to watched
things that leaves a Pi-only setup alone leaves those shots byte for byte the same.

Headless Chromium paints few animation frames, and how many depends on how busy the machine is.
Freeze time with `t=` for screenshots, and never make the first frame wait on elapsed time or fade
in. With time frozen the events and the swat start before the first frame and nothing advances from
one frame to the next, so every shot depends only on its address: two takes of the same tree come
out byte for byte the same, on a busy machine too, apart from the clock when the minute turns.

The repository's page is a `dev` page, so the screenshots show the knight drawn from the base pack.
A reference set taken from a copy of an older tree (`PAGE=/path/to/old/web/index.html`) that drew
the knight from code compares the two paths. A deployed copy draws from code unless the base pack
carries a signature that verifies. `shots.sh` shoots
only from disk, so to compare a deployed copy, serve it on the loopback address and point the
headless browser at `index.html?demo#<hash>` by hand: `?demo` starts the demo at once instead of
waiting for a state file.

To shoot the code path from disk instead, copy `web/` to a folder outside the repository and give
the copy's `kw-version` meta tag any value but `dev`; a page opened from disk runs the demo whatever
its version. Take the copy's signature off its base pack with
`node tools/sign-pack.js --unsign <copy>/packs/base.pack.json`, so that the copy refuses it and
draws from code whichever state ships. Do it before and after a change and
compare each path's two sets:

```bash
cp -r web /tmp/kw-code && sed -i 's/name="kw-version" content="dev"/name="kw-version" content="code"/' /tmp/kw-code/index.html
CHROME=/path/to/chrome-headless-shell PAGE=/tmp/kw-code/index.html tools/shots.sh take /tmp/kw-ref-code
```

The comparison prints `identical bytes` only when both sets show the same minute on the clock;
otherwise `pixels equal outside the clock` is the same result. To get identical bytes, take the
reference and the result back to back within one minute (a set takes about ten seconds), from a
copy of the old tree and the new one.
