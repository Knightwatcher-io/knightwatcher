# The page

The page is static files under `web/`, with no build step and no dependencies. It opens from
disk in a browser, so the scripts are classic scripts loaded in order by `index.html`, and they
share one global object, `KW`. ES modules would fail from `file://`.

## Files

| File | Holds |
|---|---|
| `index.html` | the markup: the page's version in the `kw-version` meta tag, the review bar, the display surface, the script tags in load order |
| `css/display.css` | the display, the text colours by status, the review bar |
| `fonts/` | the VT323 typeface and its licence |
| `js/draw.js` | `KW.view` (the grid and the canvas's real edges), the palette, the drawing primitives |
| `js/sprites.js` | small symbols drawn by code: `mark`, `heart`, `zed`, `drum`, `spark`, `stroke` |
| `js/props.js` | props used by more than one scene or drawn by the engine: the greatsword (`swordHD`), `bricksHD`, `barrelHD`, `tableHD`, `sconceHD`, the pie, fire, sky and stars, flies, the goblin, the crate and its parachute |
| `js/knight.js` | the knight: `pose(id, t)` turns a condition into a pose, `draw(o)` draws the knight in it, `swing()` animates a cut, `head()` draws the bare head and `speech()` a speech bubble |
| `js/scenes/*.js` | one file per scene: battlement, camp, house, yard, cellar, smithy, court |
| `js/state.js` | reading `data/state.json` and turning it into what the engine needs, and deciding when to reload for a new version |
| `js/engine.js` | the frame: scene choice, strolling, the swat, events, drawing order |
| `js/demo.js` | the invented conditions, the review bar and the demo loop |
| `js/main.js` | start-up, sizing, the clock and the words over the scene, the choice of mode, the check for a new version |

The load order is the order of that table, scenes in the order listed. A file may use what an
earlier file put on `KW` at load time, and anything at all when its functions run.

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
before it calls `paint`, `draw` and `over`.

| Field | Required | Meaning |
|---|---|---|
| `spot` | yes | where the knight stands on arrival, in units of `U` across the grid |
| `draw(t, s)` | yes | draws the scene at time `t` in ms: everything on a scene without `paint`, otherwise what moves |
| `rounds` | no | the spots the knight strolls between while free to move: `[{ x, act, dur }]`, `x` in units of `U`, `dur` in seconds, `act` one of `guard`, `look`, `sniff`, `yawn`, or a name the scene's `act` handles |
| `paint(s)` | no | the still part, painted once into a cached canvas and kept until the key or the screen's shape changes |
| `key(s)` | no | a string; the cached backdrop is painted again when it changes |
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
| `piOK` | whether the pie is on its plate |
| `tv` | whether the television is on |
| `kx` | the knight's x on the grid |
| `o` | the knight's pose for this frame |
| `here` | where the knight stands in the scene's `rounds`, `{ act, el }` with `el` the ms spent there, or `null` |
| `inBed`, `helmOff` | whether the knight is in bed, and whether the helmet is off |
| `strike` | free for a scene's `act` to pass to its `draw` (the smithy's hammer blow) |

Some scenes reach further. The house draws the sleeper's head with `KW.knight.head` and its Zs
at night in `over`. The court sets the knight talking in `draw` and draws the King's speech
bubble with `KW.knight.speech`. The smithy's `act` sets the hammer and `strike`. The yard keeps
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
`web/`, with no build step.

The mapping is the pure function `KW.state.map(file, nowMs)`. Beside it, `judge(view, lastGood,
nowMs)` decides between showing a file, holding the last one, NO SIGNAL and the demo, and
`takeEvents()` picks the events to play and `noSignal()` builds the knight's NO SIGNAL state.
`versionOf(file)` reads the version out of a parsed `version.json`, and `reloadDue(own, fetched,
last, nowMs)` decides whether to reload, given the page's own version, the fetched one, the record
of the last reload and the time. `state.js` loads under Node for the tests.

## The address

The hash holds the demo's settings and a set of test hooks. `h=`, `hs=`, `t=` and `kx=` also work
in live mode. `f=`, `e=` and `sw=` start something in the demo and do nothing elsewhere.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
| `is=` | the quiet scene: `auto`, `battlement`, `camp`, `house`, `yard`. The cellar, smithy and court come from conditions |
| `h=` | the helmet: `auto` (off in the house and the smithy), `on`, `off` |
| `hs=` | the headline size: `s`, `m`, `l` |
| `bar=0` | hides the review bar |
| `demo=1` | runs the demo loop |
| `t=` | freezes time at that many ms, for screenshots |
| `e=` | plays an event: `goblin`, `crate`, `feast` |
| `f=` | starts with that many flies |
| `sw=1` | starts a swat |
| `kx=` | places the knight, in units of `U` |

The demo rewrites the hash as its settings change, with the contract's ids in `on=`.

## Deploying

```bash
tools/deploy.sh /path/to/served/folder
```

The tool copies `web/` into the folder, leaving the folder's `data/` (where the collector writes)
alone and deleting any other file that `web/` no longer has. It then stamps the copy, and only the
copy, with a version: the first 12 hex characters of a sha256 over the names and contents of the
files of `web/`, in a stable order and leaving `data/` out. It writes `version.json` as
`{"version": "<hash>"}`, sets the `kw-version` meta tag of `index.html` to the version, and appends
`?v=<hash>` to every local script and stylesheet address there, so a new version is fetched under
addresses no cache has seen. The fonts the stylesheet loads are not stamped. A deploy that changes
nothing in `web/` gives the same version and reloads no open page. The version does not depend on
git, so the tool works from an exported copy too. It refuses a folder that is `web/`, lies inside
it or holds it, and an `index.html` whose meta tag it cannot find. Open displays reload within
about five minutes of a deploy that changes something.

## Checks

Syntax, from the repository's root:

```bash
for f in $(find web/js -name '*.js'); do node --check "$f" || exit 1; done
```

The mapping from a state file, `judge`, the rules for events and the decision to reload:

```bash
node --test tests/web/
```

The deploy tool, which it runs against temporary folders and copies of `web/`, never the
repository's own:

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

Headless Chromium paints few animation frames. Freeze time with `t=` for screenshots, and never
make the first frame wait on elapsed time or fade in. An event's shot can now and then catch the
frame before the event; take it again before reading one difference there as a regression.
