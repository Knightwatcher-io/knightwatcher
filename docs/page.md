# The page

For contributors: how the page is built. The page is static files under `web/`, with no build step
and no dependencies. It opens from disk in a browser, so the scripts are classic scripts loaded in
order by `index.html`, and they share one global object, `KW`. ES modules would fail from `file://`.

This page gives the files, the grid, the scene interface, the effects, the words over the scene,
the devices, the cast and the engine's input. The knight's rig and drawing are in
[rig.md](./rig.md), the pack library in [library.md](./library.md), how a world is loaded in
[world-loading.md](./world-loading.md), and the tests and screenshots in [tests.md](./tests.md) and
[shots.md](./shots.md). What the page does on a wall, its modes, settings, settings screen and
address, is in [display.md](./display.md), which also describes `KW.settings`: the levels, the
world rule, the shared settings and the screen.

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
| `js/cat.js` | the mouser cat, the first pet: its drawing in code, each pose worked out into cells and painted once from them, in two coats, its spot in each scene and the measures of its pounce (`PETS`, the code's pets and the fallback for the pack's; see [The cast](#the-cast)) |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into a pose, `rig(o)` turns a pose into the points the knight is drawn on (see [The knight's rig](./rig.md#anchors-values-and-poses)), `draw(o)` draws the knight in it, from the base pack or from code (see [The knight from the base pack](./rig.md#the-knight-from-the-base-pack)), `start()` and `add()` load the packs, `fetchPacks()` fetches the downloaded ones and `look()` draws another look from the packs already loaded, `basePack()` gives the base pack in use, `swing()` animates a cut, `ownReturn()` says whether a swing comes back by a return of its own (see [The knight's rig](./rig.md#anchors-values-and-poses)), `aim` holds the aiming stances of a weapon that fires and the angle that points it, `fire()` animates a shot, `volley()` the swat by shot, `muzzle()` gives where it leaves and `fired()` the look's weapon when it fires (see [Aiming and firing](./rig.md#aiming-and-firing)), `shieldFace()` and `headBox()` give where the shield's face and the head group are drawn, for a foe's shot (see [A foe's shot](./rig.md#a-foes-shot)), `head()` draws the bare head and `speech()` a speech bubble, and `rest` draws the gear a scene shows off the knight (see [Gear at rest](./rig.md#gear-at-rest)); `build` holds the knight's measurements. It also creates `KW.packText`, which the carriers fill |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court. Each declares the conditions it can act out (`can`). The court draws the monarch in the skin, hair and robe it is given |
| `js/ed25519.js` | `KW.ed25519.verify`: checks a pack's Ed25519 signature, and does nothing else. See [library.md](./library.md#the-verifier) |
| `js/pack.js` | the pack library: reads, checks and compiles packs and draws from them; see [packs.md](./packs.md) |
| `js/world.js` | `KW.world`, the scene compiler: turns a scene of a world pack into the scene interface below, and puts the scenes of the medieval world's pack in place of the code scenes of the same names, its devices in `KW.kinds` and its cast in `KW.cast`, which the engine draws them from, and compiles its words and its overlay (`KW.world.words`, `KW.world.overlay`) and builds the quiet line and the captions from the collector's parts; a part that throws while drawing gives way to its code copy alone; see [worlds.md](./worlds.md) |
| `packs/base.pack.js` | the carrier of the base pack: one line that pushes the text of `packs/base.pack.json` onto `KW.packText`. The JSON file is the source and is not loaded itself; see [library.md](./library.md#carriers) |
| `packs/medieval.pack.js` | the carrier of the medieval world's pack, `packs/medieval.pack.json`, which holds every scene, the devices and the cast as data; see [worlds.md](./worlds.md) |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs, the words for the streams (`streamWords`), deciding when to reload for a new version, and the display's id it posts to the server (`displayId`, `reportDisplay`) |
| `js/engine.js` | the frame: scene choice, strolling, the swat, the pet's catch (`KW.engine.pet`), events and the foe player that plays a foe's entrance, strike and exit, and the shot of a foe that fires (`KW.engine.foe`), the shots of a weapon that fires, their flash and their burst (`KW.engine.shots`; see [The effects](#the-effects)), drawing order, and the devices in their places (`KW.devices`) |
| `js/demo.js` | the invented conditions and streams, the review bar and the demo loop |
| `js/settings.js` | `KW.settings`: the levels the display's settings come from, the saved settings (the server's, shared by every display, or this browser's own), keeping them in step with the server (`connect`), the look and the engine's input made from them, the clock's words, and the settings screen (see [Settings](./display.md#settings)) |
| `js/main.js` | start-up (starting the knight and then the world from the medieval world's pack, setting the overlay's custom properties on the display, reading the address's hooks, applying the settings and mounting their screen, asking the server for the shared settings, fetching the downloaded packs and starting the world again with them, posting the display's id to the server, sizing), the clock and the words over the scene, the choice of mode (a demo forced by `?demo` asks the server nothing), the hash listener that opens the settings screen, the check for a new version |
| `admin/index.html`, `admin/admin.js`, `admin/admin.css` | the admin page, served by the bundled server alone; see [The admin page](./display.md#the-admin-page) |

The tools under `tools/` are listed in [development.md](./development.md#layout), and every test
file in [tests.md](./tests.md#every-test-file).

The load order is the order of that table, scenes in the order listed. A file may use what an
earlier file put on `KW` at load time, and anything at all when its functions run. A carrier needs
`KW.packText`, so it comes after `knight.js`; `ed25519.js` comes before `pack.js`, and `effects.js`
comes before `props.js`, the scenes and `pack.js`, which use it; `cat.js` comes after `props.js`,
which makes `KW.props`. `world.js` comes after the scenes
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

## The scene interface

Each file in `js/scenes/` registers one object on `KW.scenes` under the scene's name, and draws
nothing outside it. The engine reads only what is listed here, and sets the grid's transform
before it calls `paint`, `draw` and `over`. A scene may also come from a world pack: the scene
compiler (`js/world.js`) builds an object with this same interface from the pack's data and puts it
in the code scene's place, which the page does for every scene while it can use the medieval
world's pack (a `dev` page always, a deployed page while the pack is signed;
[world-loading.md](./world-loading.md#where-the-scenes-are-drawn-from)). It also puts each compiled
scene under its long name, `kw.medieval/<scene>`, and another world's scenes beside them under
theirs, `<pack>/<scene>` ([worlds.md](./worlds.md#other-worlds)). Those long names are not
enumerable: the engine and the settings list the scenes by `Object.keys(KW.scenes)` (the engine
once, when it loads, for the scenes that are `outdoors`), so they see the seven short names alone,
and a long name reaches its scene all the same. The compiled scene works out its own `key`, gives
`hosts` and `outdoors` from the pack's `hosts`, `foeZone` and, where the foe has a wall, `wallAt`
from its `foe`, `crate` from its `crate`, and every other field below from the pack's fields as
[scenes.md](./scenes.md#how-a-scene-compiles) sets out; a scene's `name` and `quiet` are not part of
the interface.

| Field | Required | Meaning |
|---|---|---|
| `spot` | yes | where the knight stands on arrival, in units of `U` across the grid |
| `places` | yes | the places for devices: `pie`, three high ones (`h1` to `h3`) and three on the ground (`g1` to `g3`); see [Devices](#devices) |
| `rests` | no | the places where the scene sets the knight's gear down, by name; the scene reads them itself, see [Gear at rest](./rig.md#gear-at-rest) |
| `draw(t, s)` | yes | draws the scene at time `t` in ms: everything on a scene without `paint`, otherwise what moves. It calls `KW.devices.draw(t, s)` at the point where the devices behind the knight belong in its drawing order |
| `rounds` | no | the spots the knight strolls between while free to move: `[{ x, act, dur }]`, `x` in units of `U`, `dur` in seconds, `act` one of `guard`, `look`, `sniff`, `yawn`, or a name the scene's `act` handles |
| `paint(s)` | no | the still part, painted once into a cached canvas 32 pixels wider than the view, and kept until the key or the screen's shape changes |
| `key(s)` | no | a string, asked for each frame of a scene with `paint`; the cache is keyed on the scene's name and the key. The cached backdrop is painted again when it changes, and when `KW.world.changes` does (the world started again, or a part of a pack gave way to its code copy; [world-loading.md](./world-loading.md#when-a-part-throws)). A scene that paints the knight's gear at rest into its backdrop includes `KW.knight.rest.key(slot)` for each such item |
| `act(t, s)` | no | called each frame after strolling and before the foe's plan, the swat and the events, which may override it; may change the knight's pose `s.o`, and move the knight off its spot for the frame by `s.dx`. No transform is set for it |
| `over(t, s)` | no | drawn after the knight, the flies and the events |
| `wallAt(x)` | no | the y of the top of whatever a foe climbs over at grid x; without it a foe digs up out of the ground |
| `foeZone` | no | where a foe may stand: `{ side, spans }`, the side of the knight tried first (`1` right, `-1` left) and the spans of grid x, `[[x0, x1], ...]`, where its middle may stand clear of the scene's own props. The engine also keeps it clear of every place holding a device on the ground or the pie, and 150 to 240 pixels from the knight's middle, within the reach of the weapon the knight holds, or with a weapon that fires at the shot's gap, the knight stepping back for it ([The acts with a weapon that fires](#the-acts-with-a-weapon-that-fires)); with no room the event shows its caption alone. A scene that hosts the foe without it plays the event's 3.4 seconds with no foe drawn, the knight standing still |
| `hosts` | no | the events the scene plays, each of `flies`, `crate`, `feast` and `foe` (the event with a foe, the banned address's): `['flies', 'crate', 'feast', 'foe']` at the battlement and the camp, `['flies', 'crate', 'feast']` in the yard, `['feast']` in the house and `[]` elsewhere. The engine plays the crate, the feast and the foe only in a scene that hosts them (`KW.engine.hosts(name, type)`); a scene without `hosts` plays the events whose `where` in `EVENTS` names it, the medieval world's lists, which the medieval scenes' `hosts` repeat. The flies follow `outdoors`, which a compiled scene gives when its `hosts` names both the flies and the crate. The settings read `foe` from it, to offer the foe's rows |
| `outdoors` | no | `true` where the knight's flies gather and are swatted, and, for a scene without `hosts`, where the crate may land; elsewhere a fly is the pet's |
| `crate` | where the crate lands | `{ span: [from, to] }`, the stretch of floor the crate may land on, at least 60 wide. The engine (`crateX`) lands the crate's middle at `clamp(kx - 160, from + 30, to - 30)`, as near 160 left of the knight as the stretch allows; the stretch lies clear of the ground places and the pie. The battlement gives `[150, 384]`, the camp and the yard `[298, 436]`. Without it the crate's left edge lands 320 left of the knight, and at least 70 inside the view's left edge, as it did before scenes gave one |
| `bed` | no | `true` where the knight takes to bed for `night` and `container_unhealthy`: in bed the knight is not drawn standing and does not stroll, the helmet is off, the pet keeps its spot by the bed and the scene is dimmed at night |
| `helmet` | no | `false` where the helmet comes off, unless the address's `h=` or the display's setting for the helmet indoors says otherwise |
| `sword` | no | `false` where the knight puts the sword away. Where none of the scene's `rests` is a frame (a place with an angle `a`), a weapon put away is worn by its stowed view, if it has one ([Gear at rest](./rig.md#gear-at-rest)) |
| `target` | no | where a shot at the scene's training target aims, `[x, y]` on the grid, the middle of the target: `[710, 380]`, the dummy's, in the yard. With a weapon that fires the knight trains from 300 short of it ([The acts with a weapon that fires](#the-acts-with-a-weapon-that-fires)). A compiled scene with a `target` gives the middle of the box of its target group's shapes |
| `struck()` | with `target` | the moment the target was last struck, for the tests |
| `can` | no | the conditions the scene can act out, by the contract's ids, such as `['disk_full', 'backup_overdue', 'cpu_hot']` for the cellar: plain data, which a world pack carries as the scene's `can`. A condition plays in a scene the settings chose for it only when that scene lists it, and the settings offer a choice only between scenes that list it (see [Settings](./display.md#settings)); a scene without it is never chosen. [design.md](./design.md#scenes-chosen-per-condition) gives the table and the reasons |
| `drawn(mon)` | no | each patron's own hair and robe colours, `{ hair, robe }`, for the settings screen's "As drawn" choices; the settings and the admin page read it off `KW.scenes.court` by that name. A compiled scene with a `seat` gives it |

`s` is the same object for every call in a frame:

| Field | Meaning |
|---|---|
| `w` | the winning condition: `{ id, file, lv, st, scene, hl, sub }`, or the idle one with id `idle`. `id` is the condition acted, and `file` the state file's own id: the same, but for a generic check, whose `id` is the condition it borrows and whose `file` is `check:<name>`. A scene reads `id` alone, so a check plays exactly as the condition it borrows |
| `devices` | the devices standing in the places, each `{ place, kind, ok, alert }` with `place` the name of one of the scene's places |
| `places` | the scene's `places` |
| `tv` | whether the television is on |
| `kx` | the knight's x on the grid: its spot, or where it has strolled to |
| `dx` | 0, for a scene's `act` to move the knight for the frame: the knight is drawn at `kx + dx`, worked out from `t` alone, while `kx`, the spot and everything the scene counts from it stay where they are. The smithy's walks to the forge, the water and the bellows use it; the smithy hosts no event, swat or foe, so nothing after the act reads the knight's place from `kx` there |
| `o` | the knight's pose for this frame |
| `here` | where the knight stands in the scene's `rounds`, `{ act, el }` with `el` the ms spent there, or `null` |
| `inBed`, `helmOff` | whether the knight is in bed, and whether the helmet is off |
| `strike` | free for a scene's `act` to pass to its `draw` (the smithy's hammer blow) |
| `patron` | the patron at court, the monarch, from the engine's input (the settings): `{ id, skin, hair, robe }`; the admin page's previews give `skin`, `hair` and `robe` as `undefined` |
| `patron.id` | `a`, `b` or `c`, or the long name of another world's patron, `<pack>/<patron>` |
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
plays one of three acts by the winning condition, each a function of the time alone: while
updating the hammer, setting the knight's smith grip (`o.tool`, [rig.md](./rig.md#anchors-values-and-poses))
and `strike`; while the CPU runs hot the bellows, at x 612 by `s.dx`; and while all is quiet the
quench, walking the knight by `s.dx` between the forge at 650 and the water at 228. Its `paint` lays
the weapon across the anvil with `KW.knight.rest`; its `draw` draws the fire, calm or flared while
the bellows work, the bellows, the hot tip on the blade while the hammer works it (none for a weapon
that only fires), the rings on the water while the blank is in it, and the sparks of the blow; and
its `over` the quench's steam, drips and glint. [scenes.md](./scenes.md#how-a-scene-compiles) has
the three acts' numbers. The yard keeps
the time the dummy was last struck and swings the knight's sword in `act`, or with a weapon that
fires shoots at the dummy (`KW.engine.shots.practice`).

**How the engine calls a scene.** `draw(t, s)` runs every frame, after the backdrop is laid, with
the grid's transform set on the display's canvas (the grid's corner at `X0` plus the picture's
drift, and `Y0`). `paint(s)` runs only when the cache misses: it draws into a backdrop canvas 32
pixels wider than the view, made the drawing context with `KW.draw.setCtx()`, with the grid's corner
16 pixels in, and the backdrop is laid 16 pixels left of the drift. Besides the key, the screen's
shape and `KW.world.changes`, the engine drops every cached backdrop (`KW.engine.invalidate()`) when
`main.js` changes the prop set in use, changes the knight's look, or adds downloaded packs.
`act(t, s)` runs after the stroll and before the foe's plan, the swat and the events, with the
knight's pose already at its x (`s.o.x`), since a shot is aimed on the rig. `over(t, s)`
runs after the knight, the pet, the devices in front, the flies, the foe's effects, the attack's red
and the night's dimming. `wallAt(x)` is called through the foe's plan, once for each column across
the foe while it is behind the line it climbs over, so `this` is the plan, not the scene. The
settings screen and the admin page draw the scenes' pictures with `paint` and then `draw` at a fixed
moment, on the bare grid (`HL` 0, `HR` 960, `HT` 0), with `s` fixed: idle, the pie alone, the
television off, the knight at the scene's `spot`, out of bed; they never call `act`, `over` or
`key`. A compiled scene's `paint`, `draw`, `over` and `act` run behind a guard, which gives way to
the code scene when one throws ([world-loading.md](./world-loading.md#when-a-part-throws)).

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
  few values). `pack.js` holds a world pack's effects to these tables ([scenes.md](./scenes.md#shapes-coordinates-and-terms)).
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

Every effect, with its fields, their ranges and defaults, its cost and the scenes that draw it, is
listed in [scenes.md](./scenes.md#the-effects), where a pack author looks for them.

**The shots.** Four effects of format 1.2, `flash`, `bolt`, `tracer` and `beam`, are not in
`effects.js` and no scene names them: `engine.js` draws them for a weapon or a foe that fires, in
the shot's colours, with the timings of `SHOT` (a flash of 60 ms, a bolt at 1.6 pixels a ms, a
tracer fading over 120 ms, a beam of 80 ms, at most 8 shots a frame). An act makes a shot with
`KW.engine.shots.shoot(key, make)`: `make()` gives `{ kind, colour, flash, from, to, t0, burst }`
the first time the key is asked for, and the shot is kept, so the picture at a moment depends on
the moment alone; it comes back with `lands`, the moment it reaches `to`, and `end`. The engine
draws the shots each frame after the flies and before the foe's effects, the landing burst with
`poofHD` for `burst` ms, and forgets a shot once nothing of it shows, at a change of scene and at
`reset()`. The last 32 shots that have ended are remembered by their keys, so an act that asks for
one again within its beat gets it back rather than a second shot. The acts that make shots are in
[The acts with a weapon that fires](#the-acts-with-a-weapon-that-fires).

### The acts with a weapon that fires

When the look's weapon fires (`KW.knight.fired()`), the engine plays the swat, practice and the
foe's event by shot, and the attack aims ([rig.md](./rig.md#aiming-and-firing)); a weapon that only
swings plays them as before, frame for frame. A weapon that is both swung and fired swings at the
flies and at a foe within its blade's reach (`foeGaps()`), and fires at a foe beyond it and at the
practice target. Times are in ms; `KW.engine.shots` gives `VOLLEY`, `PRACTICE`, `volleyPlan`,
`practice`, `practiceX` and the swat in play, and `KW.engine.foe` gives `shotPlan` and `shot`. The
base pack's crossbow (`arm=crossbow`) is the shipped weapon that fires, two-handed and with no
shield; the test world's blaster and prod are the others the tests and the screenshots play.

| Act | By shot |
|---|---|
| the swat | one shot per settled fly (`volleyPlan`): the flies on the oldest fly's side first, each side oldest first, then the other side's, so the watcher turns once. The first shot leaves after a raise of 450 (`VOLLEY.raise`), each next one 300 later (`VOLLEY.gap`); after the last, the recoil of 80 and the return of 560 (`VOLLEY.after`), then the swat is over. Each shot flies from the muzzle as the pose stood aimed at its fly (the aim up to `AIM.swatAbove`, 1.4 above level) to where the fly was as it left, and the fly is popped, with the poof, when the shot reaches it. Seven flies: the last shot at 2 250, the return over by 2 890. The cat's rules about when the knight is busy are the same |
| practice | the training spot stands 300 short of the scene's `target` (`PRACTICE`, `practiceX`), and the watcher strolls there in place of the round's `train` spot. The scene's act fires on the training's beats, `fire()` over 900 every 5 600 while quiet and over 1 000 every second while the CPU runs hot, the shot leaving at the middle of the beat (`practice(o, t, t0, len, at)`): from the muzzle to the target's middle, landing with the burst, and the target struck as it lands (its wobble and its straw). Running hot, the watcher first walks to that spot from wherever it stands, and fires once there |
| the foe | `shotPlan()`: on each side the least gap is 200, or the muzzle's reach from the watcher's middle aimed level plus the foe's half width and 30 when that is more (`FOE.shot.clear`); the wanted 300 and the most 320, raised to the least for a long barrel, and never past the weapon's `range` or 420. Where the foe's zone has no room at the wanted gap, the watcher steps back from the zone's side, 4 at a time and up to 160 (`FOE.shot.step`), to the least step that gives it, or the widest gap found, never nearer the screen's edge than 90; the foe stands in its zone, clear of the devices, as for a blade. The event (`foeShot`): the step back over the first 900, while the foe climbs in; `fire()` at the foe's middle from 1 250 (`aim`), the shot leaving at 1 400 (`fire`), the recoil over 80 and the return over 560 (the strike's `rebound` and `recover`). The hit is where the shot meets the foe's body, its half width short of the middle: for a bolt when it gets there, at once for a tracer or a beam. With the blaster on the battlement the watcher steps back 132 and the goblin is hit at 1 473; the exit is the engine's, as for a blade, all within the event's 3 400 |
| a foe that fires | whatever the watcher holds, a foe with `fires` (format 1.2) shows its `aim` pose in place of its taunt from 1 230 (`FOE.fires.aim`) and fires once at 1 350 (`fire`), before the watcher's strike or shot, unless it is hit first (`foeFires`, `foeShotOf`). The shot is made with `shoot()` in the foe's kind and colours from its muzzle as drawn, mirrored with the foe, the watcher posed as the strike or the shot has it at 1 350. The watcher is never hit. Without a shield the shot misses: aimed 40 (`over`) above the corner of the head group nearest the foe, as drawn (`KW.knight.headBox`), and carried on along that line off the screen, with no burst. With a shield carried and the foe on its side, the left, the shot stops at the shield's face (`KW.knight.shieldFace`), on its edge nearest the foe 0.4 of the way down (`face`), with the spark: `poofHD()`, the blade's burst, for 80 (`spark`). As the shot passes the point it was aimed at or stops at the shield (at once for a tracer or a beam, when it gets there for a bolt) the watcher flinches: the eyes are `wide` for 200 (`flinch`), and then whatever the event sets; nothing else of the pose changes. The watcher then strikes or shoots back as before, and with a weapon that fires both shots show. Known limit: the shield is always in the left hand, so a foe on the right misses overhead even with a shield carried, and its line can cross the weapon the watcher holds out or raises on that side. The medieval scenes and Orbit's put the foe on the left first, so a foe stands on the right only where the left has no room |

| the attack | aimed to the right, trembling, and never fired (`pose('attack')` in `knight.js`) |

Where the weapon is put away and the scene shows it at no rest place, the engine sets the pose's
`stowed`, and the knight wears the weapon's stowed view ([Gear at rest](./rig.md#gear-at-rest)).

`tests/web/effects.test.js` checks that each cost bounds the fills drawn, and the call records of
`tests/web/scenes.test.js` that the scenes draw through the effects exactly what they drew before.

**What stays in the scenes.** Drawing that is not shared and does not reach the screen's edges stays
in its scene, as plain shapes, loops of fixed shapes (the world format's tiles) or the engine's own:

- loops with a hash of a fixed index, which a pack writes out as the fixed shapes they are: the
  stars in the house's window, the grain of the camp's log, the ash by the smithy's forge, the straw
  of the yard's bales, and the grain of the table (`tableHD`, in `props.js`);
- tiles: floors, planks, posts, rafters, merlons, the yard's pebbles, the court's pillars and floor
  squares, the cellar's brackets and piers (each pier's bricks an effect inside the tile);
- the dummy, the television, the candle, the blanket and the sleeper's Zs, the smith's three acts,
  the monarch and the ermine: the acts and the patron, which a world pack gives as parts the engine
  acts with (the scene compiler builds the target's, the anvil's, the bellows', the quench's and
  the seat's acts, the bed, the screen and the patron's marks for the scenes from the medieval
  world's pack, and draws the patrons from its cast);
- the quench's steam, rings, drips and glint, which follow the act's blank;
- the weapon's pegs in the house and the hot tip on the anvil, which read the weapon's reach, its
  blade or its barrel: what reads the knight's gear stays the engine's (from the pack, the pegs are
  the scene's stamp, drawn by the engine where the reach puts them);
- the props shared as stamps (`barrelHD`, `tableHD`, `sconceHD`, `crateHD`), and the glows, which
  are a shape of their own.

## The words over the scene

The headline, the detail, the "+N MORE" badge, the streams' badge, the quiet line, the caption and
the clock are HTML text over the canvas, in VT323. `KW.ui.show` and `KW.ui.caption` in `main.js`
write them with `textContent`, never as markup. The headline, the detail and the badge are the
collector's words as they come. The detail of `streaming` and the streams' badge are worded on the
page from `facts.streams` (`streaming` by the file's own id, so a check acted as `streaming` keeps
its own detail and raises no badge), by `KW.state.streamWords(streams, nowMs)` alone, in the collector's own
words and to its own rule (`line()` in `collector/kinds/streams.py`); no world words them yet,
and `KW.ui.streamTick`, called each second with the clock, moves the line on. The quiet line and the captions are the world's: `KW.state.map` keeps the collector's
`quiet_parts` and each event's `type` and `parts` beside its text, and `main.js` passes them to
`KW.world.quietLine(parts, text)` and `KW.world.caption(type, parts, text)`, which build the line
from the parts in the medieval world's words, `words.medieval`, within the collector's limits of 52
and 44 characters. With no parts, or no words (a deployed page before `kw.medieval` is signed), they
give the collector's text as it is. [worlds.md](./worlds.md#the-words-and-the-overlay-on-the-page) gives the
rule. The demo goes through the same two calls, with parts and texts as the collector would send
them.

The colours come from the world's overlay, `overlay.phosphor`. At start-up `main.js` sets the
custom properties in `KW.world.overlay.props` on `#surface`: `--kw-ok` to `--kw-sleep` and
`--kw-ok2` to `--kw-sleep2` for each level's `--fg` and `--fg2` (`--kw-warn` and `--kw-crit` also
colour the "+N MORE" badge, and `--kw-sleep2` the streams' badge), `--kw-outline` for the words' outline, `--kw-scrim` for the scrim's colour as
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
`pi_silent` condition is in the list, as before there were devices; a check acted as `pi_silent`
is not one. A file with a devices list
takes the pie's state from the list alone, so the pie leaves its dish when the Pi is judged down
and not at the first missed check.

**Places.** A scene's `places` is `{ pie, h1, h2, h3, g1, g2, g3 }`, each
`{ cls, kind, x, y, w, h }`: `cls` is `pie`, `high` or `ground`, and the rest is the shape the
pack format gives places (`kind` `surface` or `floor`, `x` the middle and `y` the base, the line a
device stands on, a box 112 tall above the base, 132 wide for a ground place and 88 for the
others). For a camera the base is the foot of
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
spot the knight stands at, of the swings, and of the knight's boots, but for the smithy's water
below. `pl=1` shows them all.

Whatever a place may show is drawn wholly on the 960 by 600 grid, which is all a display exactly
960 wide shows: every kind that may stand there, up and gone, its question mark and its pole. No
two places in a scene draw over each other. `tests/web/places.test.js` draws each of them and checks
both, from what is painted rather than from a place's declared box: a place's box is the room it
was planned with, and may reach past the grid's edge where its drawing does not. One overlap is
accepted, as the owner approved it: in the court, the lower owl's question mark (`h2`) stands over
the upper owl (`h1`) while the lower one is down, since between the right pillar's torch, the
throne and the cat's leap there is no spot for two owls that avoids it.

The smithy's acts walk the knight off its spot, which no other scene does, and there the knight
covers places, which the owner accepted: at the forge (650, about 2.2 s of each quench) and at the
bellows (612, all the time the CPU runs hot) the knight's head hides most of the owls in the high
places `h1` (600) and `h2` (676), and at the water (228, about 5.5 s of each quench) the boots stand
over the third ground place, `g3` (218), so a device there stands in front of them. Neither hides an
alert: a device down outranks both all is quiet and the CPU running hot, and under `device_down`
(and `memory_tight`) the smithy plays no act and the knight stays at its spot, 440, clear of every
place. On each walk of the quench the knight passes in front of the pie, and at the water stands
clear of it (the knight's right edge at 290, the pie's place from 295). `tests/web/places.test.js`
holds the knight's drawing at the three stands to exactly these places.

The ground places stand along the front edge of the floor (base y 594, `front: true`), in front of
the knight and never under the knight's boots at any spot it strolls to, by the owner's decision of
17 November 2026; the smithy's quench, which walks rather than strolls, stands the boots over `g3`
at the water, as accepted above. Where a scene hosts the goblin or the crate, a stretch of floor is kept clear left
of the knight: the goblin comes up there, and the crate lands there (the scene's `crate`).

**The kinds.** `KW.props.KINDS` holds the code's drawing of each kind, `draw(x, y, t, ok, part)`,
standing on the base `(x, y)`, and `mark`, the height above the base of the top of its question
mark. The engine draws from `KW.kinds`, which has the same interface: the compiler (`world.js`) fills
it with the kinds the medieval world's prop set gives, and keeps `KW.props.KINDS`'s for the rest
([cast.md](./cast.md#the-devices-on-the-page)). On a page without the compiler the engine reads
`KW.props.KINDS` itself.

| Kind | Up | Down |
|---|---|---|
| `pi` | the pie in its dish, steaming, its filling lit through the lattice | the empty dish with crumbs and the last slice |
| `camera` | a barn owl on an iron wall bracket, its eyes the lamp, glowing amber | hanging upside down from the bracket by its talons, wings drooping, dazed spirals for eyes, unlit, two feathers drifting down |
| `machine` | a scrying crystal in a gilt claw stand on a wooden foot, the whole ball the lamp, glowing pale blue-white | the stand toppled, the ball lying beside it, dark, with a crack across it |
| `vm` | a corked glass flask with a paper tag, its blue potion the lamp | on its side with its cork out beside it, the last of the potion spilt and dark |
| any other | an iron-bound chest, the lamp the jewel in its lock plate, glowing gold | on its end, its lid knocked off beside it, three coins spilt, the jewel dark |

Each kind is a medieval thing that stands for the device, by the owner's choice of 16 November 2026
([design.md](./design.md#devices)), and the crystal, the chest's sizes and the colours of the lamps
by the owner's choice of 17 November. A kind the page does not know is drawn as the chest. The kind
is only ever a key into `KW.kinds`. The crystal and the chest are drawn at twice the size they were
first drawn at and the flask at 1.4 times, each a redraw at that size whose outlines keep their
thickness; the crystal is the first drawing's at 1.85 times, its ball's top 93 above the base.
They fit within the ground class's box, 66 left of the base's middle to 56 right of it and 93
above the base to 2 below; the owl within the high class's.

**The lamps.** A device's light is a lamp of its own, drawn as a pack draws one (`ownLampHD`): a
light of radius 24 in its own colour, the dark drawing, and the lit drawing over it at the loop's
level. Up, or `unknown`, the pie's filling glows red (`#ff4a3d`), the owl's eyes amber, the
crystal's ball pale blue-white (`#cde4ff`), the flask's potion blue (`#6fb4ff`) and the chest's
jewel gold (`#ffb000`). Each pulses over 3.6 seconds from its full colour, the lit drawing, to its
dark drawing, a dimmer colour of the same hue that still reads as lit (the crystal `#7894c0`, the
potion `#3f78c8`, the jewel and the owl's eyes `#c98600`, the pie `rgb(168,49,40)`), so a device up
never looks like one that is down. No device light is green. Down, no kind has a lamp: one rule
for every device, by the owner's decision of 17 November 2026. A down device is unlit and nothing
of it blinks; the owl's dazed spirals and the chest's dark jewel are part of its still drawing,
and the question mark carries the alert. Their maps are `pieShapes` and `DEVICE_LAMPS`. The
loop starts 523 ms later in each place than in the one before it (`pie`, `h1` to `h3`, `g1` to
`g3`), so the lamps of a scene never pulse together. Both loops come from `LAMP` and `lampLevel` in
`props.js`, which every lamp shares, the drawings from a pack among them; `props.js` exports them with
`lampRim` and `lampHD`, the engine's own lamp, which no medieval kind uses but a pack's kind may
still name by a point, and `LAMP_REDS`, the down lamp's three reds as a pack names them.

**The pie's lamp.** The pie's lamp is its filling: the 398 pixels the crust effect leaves in the
filling's colours between the strips of the lattice, read from the effect when the pie is first
drawn (`pieShapes` in `props.js`), so that the lamp lies exactly in the gaps. It lights on the
lamps' loops from the pie's place, so its loop starts at the place's offset, 0. While the Pi is up
it goes from red (`#ff4a3d` on the filling's lit side, a darker red on its shaded side and along
the strips, a highlight of `#ffd0c8` in the corner of each gap) to a dimmer red (`rgb(168,49,40)`,
the down lamp's red at two thirds) and back over 3.6 seconds, in a red light centred 1 right of the base's middle and 30 above it. The strips, the rim band and the crimping stay the crust's colours, so the
light seems to come from under the lattice. The steam rises from the top of the dome, its puffs
starting 53 above the base. While the Pi is down the dish is empty but for crumbs and the last
slice, a wedge of the pie lying in it with its point near the dish's middle, its cut face to the
front and its outer crust to the right, partly hidden by the dish's near rim. Its filling, 108
pixels in the gaps of its own small lattice and along its cut face, is unlit, and there is no
steam. Nothing moves but the question mark.

**Drawing.** `part` `'still'` draws what does not move and `'moving'` what does: the lamp, and the
pie's steam. The engine paints each device's still part once, with its pole, into a
small canvas of its own, kept by place, kind and state (and, for a kind from a pack, the compile it
came from), and draws it with one call where the
scene's `draw` calls `KW.devices.draw(t, s)`, so each scene's drawing order is what it was. Only the
moving part is drawn each frame, and the question mark is kept in a canvas of its own as well. The
pie's lamp is a lamp of its own as a pack gives one: each of its drawings, lit and dark, up and
down, is painted once into a small canvas of its own in `props.js` (`ownLampHD`); each frame draws
its light, the dark drawing, and the lit one over it at the loop's level, 18 calls, as each
device's lamp does. The pie up costs 114 calls a frame with its steam, and every kind down nothing. A frame with the pie and six devices costs at most 108 calls more than one
with the pie alone.

**The question mark.** Over every gone device the engine draws the question mark, blinking every
400 ms, with its foot at least 4 pixels above the gone device, whether or not the device alerts:
since 17 November 2026 `placeHD` no longer reads `alert`, by the owner's decision, because the
crystal, the flask and the pie go dark when down and would otherwise show nothing that moves.
`alert` still decides whether the device raises `device_down` and so turns the knight. The pie's
mark stands where it always has. Every mark keeps clear of the knight, the throne, the monarch and
the resting cat in every scene, as the places are set.

**`device_down`.** The condition has no scene of its own: the knight stays in the quiet scene of
the moment, does not stroll, and frowns, as for `pi_silent`. `map` gives the winning `device_down`
a `place`: the place of the first position in its `devices` that stands in one, or `null` when
none does. The knight looks towards that place (`look` is the sign of the place's x less the
knight's), or straight ahead when there is none. A device that does not alert has no effect on the
knight.

## The cast

The engine plays a supporting cast whose drawings are not its own: the fly, the goblin and the
mouser cat. Where a fly hovers, the swat, the poof and the fall are the engine's, and so are the
foe's entrance, the strike and the exit, and the cat's catch; a member gives its drawings and its
measures. `KW.props.CRITTERS` holds the
code's critters by name, each with

| Field | Is |
|---|---|
| `draw(x, y, flap)` | the critter hovering at `(x, y)`, in its first frame (`flap` 0) or its second |
| `dead(x, y)` | what falls once it is swatted, from `(x, y)` |

The fly's are `flyHD` and `deadFlyHD`. `KW.props.FOES` holds the code's foes by name, each with

| Field | Is |
|---|---|
| `pose(name)` | a canvas with the pose painted once, the feet at `anchor`; an unknown name gives `stand` |
| `poses` | the names of its poses: `stand`, `climb`, `taunt0`, `taunt1`, `brace`, `hit`, and `aim` after them for a foe of a world pack that gives it |
| `anchor`, `size` | the feet in the canvas, and the canvas's size |
| `h`, `w`, `mid` | its height, half its width across the body, and the middle of its body above the feet |
| `crown` | the points of its top from the feet, as drawn facing left, where the blade stops |
| `exit` | the engine's exit it leaves by, `poof` |
| `fires` | only on a foe that fires, from a world pack of format 1.2: `{ muzzle, shot }`, the muzzle as drawn facing left and the shot's kind and colours. No foe of the code's fires |

`KW.props.PETS` (`cat.js`) holds the code's pets by name, today `cat`, each with

| Field | Is |
|---|---|
| `name` | its name, `Mouser cat` |
| `coats` | each coat's name by its id, the default first: `calico` (Calico) and `ginger` (Ginger tabby) |
| `poses` | the names of its poses: `rest`, `settle`, `alert0`, `alert1`, `stalk0`, `stalk1`, `pounce`, `land`, `pleased`, `walk0`, `walk1` |
| `pose(coat, name)` | a canvas with the pose painted once in the coat, the feet at `anchor`; a coat or a pose it lacks gives its first |
| `anchor`, `size` | the feet in the canvas, `[100, 132]`, and the canvas's size, 200 by 150 |
| `spots` | its spot in each scene by the scene's name (see below) |
| `paw`, `take`, `land`, `lift` | the measures of its pounce, as [cast.md](./cast.md#the-cast-on-the-page) gives them |

The cat's drawing is the approved one, each part an outline of many points (a closed curve through
a few control points, or a limb round a centre line whose width changes along it), filled into a
mask of whole pixels with a dark outline of two pixels round it and bands lit from the left, the
lowest part of each a band darker; the patches and stripes of a coat lie only on the part they are
on, and a near leg joins the body with no seam. Each pose is worked out at 1.3 times the size it is
written at into cells, a colour or nothing for each pixel of the sprite (`cells(coat, name)`), and
painted from them with one call per run of a colour in a row, as the compiler paints the pack's
stamps, so the two make the same calls.

The engine draws from `KW.cast.critters`, `KW.cast.foes` and `KW.cast.pets`, which have the same
interfaces: the compiler (`world.js`) fills them with the members the medieval world's cast gives,
and keeps the code's for the rest ([cast.md](./cast.md#the-cast-on-the-page)). On a page without the
compiler the engine reads `KW.props.CRITTERS`, `KW.props.FOES` and `KW.props.PETS` itself.

**The flies and the cat.** A blocked advert (`E.addFly(t)`) becomes a fly of whoever can take it
then, in the scene on screen: the knight's outdoors while the knight is free; the cat's indoors and
outdoors while an event plays. The knight's flies gather, eight at most, the rest waiting for the
next swat, which comes at most every 30 seconds and passes over the cat's flies. The cat takes its
flies one at a time, three at most on screen; a fly past that is not drawn. Under a warning or
worse no fly is added, and the flies on screen, the knight's and those of the cat's it has not
leapt for, fly off to the side they came from over 1.3 seconds. A new scene clears the flies, the
catches, the flies leaving and the knight's waiting flies. A page without a pet, or a scene where
the pet has no spot, gives every fly to the knight, who leaves them waiting indoors as before.

Each of the cat's flies is given its catch when it comes (`KW.engine.pet.plan`), so that with time
frozen the picture depends on the time alone: its buzz, 10 to 20 seconds from a hash of the fly;
the moment the catch starts, the end of the buzz or 0.4 seconds after the cat settled from the
catch before, whichever is later; and from it the top of the leap, where the paw meets the fly at
the scene's catch point, raised to the pet's `lift` above the floor at the least, the take-off
`take` behind it and the landing `land` past it, and the times of each step. The cat looks up for
1.6 seconds at a fly as it comes, sits up 2.5 seconds before the catch starts while the fly comes
down to the catch point, stalks at 60 pixels a second for 1.2 seconds at the least (hopping, in the
`pounce` pose, where a floor steps up or down, and walking back first where the take-off lies
behind it), wiggles 0.6 seconds, leaps 0.38 seconds, falls 0.32 seconds to the landing with the
fly gone in `poofHD` and falling as a swatted fly does, holds the swipe 0.45 seconds, is pleased
1.8 seconds, walks back at 55 pixels a second and settles 0.7 seconds before it curls up again.
While the knight is in bed the cat is at its spot by the bed; a catch planned from the other spot
in the same scene is planned again from there. The cat is drawn after the knight and before the
devices in front of the knight, mirrored when it faces left, in the coat `E.input.pet` names; its
flies after the knight's; and at night the dimming covers both.

The spots, by scene, each where the cat rests: the battlement's left merlon (160, 411), leaping to
the next merlon for its catch; the bough over the camp's fire (830, 401), along which it hunts; the
top of the yard's curtain wall (876, 221), hunting in the sky over it; the house's floor in front
of the hearth (895, 590), hunting over the rug, and the foot of the bed (312, 405) while the knight
is in bed; the cellar's lower shelf among the jars (352, 380); the smithy's forge ledge (884, 318);
and the court's lowest dais step (620, 512), its catch at (532, 420), where it steps back for room
in front of the throne's left post before it pounces. They are the spots of the scenes' redesign
of 17 November 2026. On the battlement the cat faces right, elsewhere left.

The review bar's note on the flies says `the cat is hunting` while one of the cat's flies is up,
the pet named by the label the world's words give it (`pet`, "The cat"), after the knight's note
when the knight has flies too (`next swat in 12 s; the cat is hunting`), and `flies leave: a
warning is up` while flies fly off.

The monarchs are patrons. `court.js` gives the code's, `KW.props.PATRONS`, by id (`a`, `b`, `c`),
each with

| Field | Is |
|---|---|
| `draw(x, by, look)` | the monarch on the throne, `x` its middle and `by` the seat of the dais, in the look `{ skin, hair, robe }` (each `null` for its own), all but the mouth |
| `mouth(x, by, open, look)` | the mouth, open or shut, drawn each frame as the monarch talks |
| `drawn` | its own hair and robe colours, `{ hair, robe }`, for the settings' "As drawn" |

The court draws the patron `KW.cast.patrons` gives: the medieval world's cast's, compiled by
`world.js`, and the code's own on a page without the compiler or when the pack is not read. The
court from the pack does the same through its `patron` mark ([scenes.md](./scenes.md#how-a-scene-compiles)),
and gives `drawn` as `court.js` does. It
checks `s.patron`'s colours before it hands them on, as it always has, and puts where the patron
comes from into its backdrop's key (`b@kw.medieval#3|deep` for a patron from the pack, `b|deep` for
the code's).

## The engine's input

`KW.engine.input` (see the head of `engine.js`) takes from the settings `turns`, the quiet scenes
that take turns, in order (all five, `TURNS`, when it is left out or empty), `turnMs`, how long
each lasts, `patron`, the monarch as `{ id, skin, hair, robe }`, its id and its skin, hair and
robe (another pack's swatch by its long name among them), which the engine passes to the scenes in
`s.patron`, `pet`, the pet and its coat as `{ id, coat }`, the coat by its own id within the pet, `scenes`, the scene chosen for a condition
by its id, `homes`, the world's own scene for each condition, and `foe` and `critter`, the foe of
the banned address's event and the critter a blocked advert becomes, each by the name `KW.cast`
knows it by (`goblin`, `fly`, or another world's member by its long name). The engine draws the foe
and the critter the input names when `KW.cast` has them, and the goblin and the fly otherwise; the
patron and the pet likewise by `patron.id` and `pet.id`. The words and the overlay the settings
choose (`words`, `overlay`) are not the engine's: `main.js` puts them in use with
`KW.world.useWords` and `useOverlay` and sets the overlay's properties on the display again. `KW.engine.sceneOf(w, t)` gives the scene the winning condition `w` plays in: the one
`scenes` names for it when that scene lists the condition in its `can`, else the one `homes` names
under the same rule, else the condition's own in code (`w.scene`, from `KW.state.CONDITIONS`), else
the quiet scene of the moment. A condition with no scene of its own follows the quiet scenes
whatever `scenes` and `homes` say. A `turns` list that names a scene the page has not loaded is
passed over for `TURNS`. The frame and the events both ask it. The demo's `apply()` and `main.js` add them with `KW.ui.extras(ownMs)` whenever they
build the input.
