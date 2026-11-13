# The page

The page is static files under `web/`, with no build step and no dependencies. It opens from
disk in a browser, so the scripts are classic scripts loaded in order by `index.html`, and they
share one global object, `KW`. ES modules would fail from `file://`.

## Files

| File | Holds |
|---|---|
| `index.html` | the markup: the review bar, the display surface, the script tags in load order |
| `css/display.css` | the display, the text colours by status, the review bar |
| `js/draw.js` | `KW.view` (the grids and the canvas's real edges), the palettes, the drawing primitives for both grids |
| `js/sprites.js` | the small letter sprites |
| `js/props.js` | props used by more than one scene or drawn by the engine: the pie, sky and stars, fire, the coarse greatsword, flies, the goblin, the crate |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into his state, `draw(o)` draws him, `swing()` animates a cut |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs |
| `js/engine.js` | the frame: scene choice, strolling, the swat, events, drawing order |
| `js/demo.js` | the invented conditions, the review bar and the demo loop |
| `js/main.js` | start-up, sizing, the clock and the words over the scene, the choice of mode |

The load order is the order of that table, scenes in the order listed. A file may use what an
earlier file put on `KW` at load time, and anything at all when its functions run.

## Two grids

The knight, the battlement and the camp are drawn on a fine grid of 960 by 600 with the ground at
530. The house, yard, cellar, smithy and court are drawn on the older coarse grid of 192 by 120
with the ground at 106, painted through a fivefold scale. `KW.view` holds both: `W`, `H` and `FL`
for the coarse grid, `HW`, `HH` and `HFL` for the fine one, and `U` (5) between them.

The canvas is cut to the screen's shape, so its real edges lie outside both grids. `fit()` in
`main.js` sets them on every resize: `HL`, `HR` and `HT` on the fine grid, `L`, `RR`, `TP` and
the width `RW` on the coarse one. A backdrop fills out to these edges, never to the grid's.

The primitives draw into whichever context `KW.draw.setCtx()` last set: the display's canvas, or
a backdrop's while it is painted. The coarse ones (`R`, `spr`, `tline`, `glow`, `fill`) take
colours as palette letters. The fine ones (`Rh`, `ell`, `rrect`, `poly`, `strip`, `sprS`) take
a colour or a list of `[fraction, colour]` bands across the shape.

## The scene interface

Each file in `js/scenes/` registers one object on `KW.scenes` under the scene's name, and draws
nothing outside it. The engine calls only what is listed here.

| Field | Required | Meaning |
|---|---|---|
| `grid` | yes | `'fine'` or `'coarse'`: the transform the engine sets before `paint`, `draw` and `over` |
| `spot` | yes | where the knight stands on arrival, in coarse units across the grid |
| `draw(t, s)` | yes | draws the scene at time `t` in ms: everything on a scene without `paint`, otherwise what moves |
| `rounds` | no | the spots the knight strolls between while nothing pins him: `[{ x, act, dur }]`, `x` in coarse units, `dur` in seconds, `act` one of `guard`, `look`, `sniff`, `yawn`, or a name the scene's `act` handles |
| `paint(s)` | no | the still part, painted once into a cached canvas and kept until the key or the screen's shape changes |
| `key(s)` | no | a string; the cached backdrop is painted again when it changes |
| `act(t, s)` | no | called each frame after strolling and before the swat and events; may change the knight's pose `s.o` |
| `over(t, s)` | no | drawn after the knight, the flies and the events |
| `wallAt(x)` | no | the height on the fine grid of what the goblin climbs over at fine `x`; the ground when absent |
| `outdoors` | no | `true` where flies are swatted and the crate may land |
| `bed` | no | `true` where the knight takes to his bed for `night` and `container_unhealthy` |
| `helmet` | no | `false` where the helmet comes off (unless the address says otherwise) |
| `sword` | no | `false` where the knight puts his sword away |

`s` is the same object for every call in a frame:

| Field | Meaning |
|---|---|
| `w` | the winning condition: `{ id, lv, st, scene, hl, sub }`, or the idle one with id `idle` |
| `piOK` | whether the pie is on its plate |
| `tv` | whether the television is on |
| `kx` | the knight's x on the fine grid |
| `o` | the knight's pose for this frame |
| `here` | where the knight stands in his round, `{ act, el }` with `el` the ms spent there, or `null` |
| `inBed`, `helmOff` | whether he is in bed, and whether his helmet is off |
| `strike` | free for a scene's `act` to pass to its `draw` (the smithy's hammer blow) |

Some scenes reach further. The house draws the knight's head in bed itself, from coarse parts,
and its Zs at night in `over`. The court sets the knight talking in `draw`. The yard keeps the
time the dummy was last struck and swings the knight's sword in `act`.

## Modes

**Demo.** Invented conditions, the review bar, and a loop through every scene and state. The
quiet scenes take turns a minute each (`DEMO_TURN_MS` in `demo.js`). The demo runs
when the page has never had a valid state file: opened from disk, served with no
`data/state.json`, or with a stale or unreadable one. `?demo` in the address forces it even when
a state file exists. Browsers refuse to fetch from disk, so from disk the page does not try.

**Wait.** Served over HTTP, the page draws the quiet scene with no words and no bar until the
first answer for the state file arrives.

**Live.** The page fetches `data/state.json`, relative to itself and with `cache: "no-store"`,
at start and five seconds after each answer. A valid file hides the review bar and drives the
display:

- The first condition with a known id wins. Its id chooses the scene and the knight's state from
  the table in [design.md](./design.md), its `level` the text colour (critical red, warning
  amber, work blue, quiet green, sleep dim green), and its `headline` and `detail` the words. An
  id the page does not know is skipped and plays no part in the badge.
- The "+N MORE" badge counts the other known conditions at warning or critical, and turns red
  when any of them is critical.
- With no known condition the quiet scenes take turns ten minutes each (`LIVE_TURN_MS` in
  `main.js`), and `quiet_line` is the small line.
- `facts.pi.up === false`, or a `pi_silent` condition anywhere in the list, empties the pie
  plate. `facts.streams.count > 0`, or a `streaming` condition, turns the television on.
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

**No signal.** A fetched file that is stale (older than three times its `interval_s`) or has a
`schema` other than 1 shows NO SIGNAL at once. So does a failed or unreadable fetch once the last
valid file has passed three of its intervals. The current scene and the knight's state stay, under
a red `NO SIGNAL` with `collector silent for N min`, counted from the newest `generated_at` the
page has seen. The next valid file restores live mode.

**On the tablet.** In live mode there is no visible control. A tap or click on the display
toggles full screen. The page asks for a screen wake lock on entering live mode, on every tap,
and whenever it becomes visible again, since browsers release the lock when a page is hidden.
Where the browser refuses either (a wake lock needs a secure context, and full screen a user
gesture), nothing happens and nothing is logged. The demo's review bar keeps its own Full screen
button.

The mapping is the pure function `KW.state.map(file, nowMs)`. Beside it, `judge(view, lastGood,
nowMs)` decides between showing a file, holding the last one, NO SIGNAL and the demo, and
`takeEvents()` picks the events to play and `noSignal()` builds the knight's NO SIGNAL state.
`state.js` loads under Node for the tests.

## The address

The hash holds the demo's settings and a set of test hooks. All of them work in the demo.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
| `is=` | the quiet scene: `auto`, `battlement`, `camp`, `house`, `yard` |
| `h=` | the helmet: `auto`, `on`, `off` (also read in live mode) |
| `hs=` | the headline size: `s`, `m`, `l` (also read in live mode) |
| `bar=0` | hides the review bar |
| `demo=1` | runs the demo loop |
| `t=` | freezes time at that many ms, for screenshots |
| `e=` | plays an event: `goblin`, `crate`, `feast` |
| `f=` | starts with that many flies |
| `sw=1` | starts a swat |
| `kx=` | places the knight, in coarse units |

The demo rewrites the hash as its settings change, with the contract's ids in `on=`.

## Checks

Syntax, from the repository's root:

```bash
for f in $(find web/js -name '*.js'); do node --check "$f" || exit 1; done
```

The mapping from a state file:

```bash
node --test tests/web/
```

The regression screenshots, with `CHROME` pointing at a headless Chromium. Take a reference set
before a change and a result set after it, both outside the repository, then compare them. The
comparison leaves the clock out, since its digits change with the minute.

```bash
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

Headless Chromium paints few animation frames. Freeze time with `t=` for screenshots, and never
make the first frame wait on elapsed time or fade in. An event's shot can now and then catch the
frame before the event; take it again before reading one difference there as a regression.
