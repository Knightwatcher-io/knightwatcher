# The display

For people running Knightwatcher: what the page does on a wall, the settings each display shows
and where they come from, worlds, the settings screen, the address's hooks, the admin page and
deploying the page. `config.toml` and `.env` are in [configuration.md](./configuration.md), the
bundled server in [server.md](./server.md), and how the page is built, for anyone changing it, in
[page.md](./page.md).

## Modes

**Demo.** Invented conditions, the review bar, and a loop through every scene and state. The
quiet scenes take turns a minute each (`DEMO_TURN_MS` in `demo.js`), unless the settings set a
length, which the demo then uses too. The demo runs
when the page has never had a valid state file: opened from disk, served with no
`data/state.json`, or with a stale or unreadable one. A demo that starts so is a real display
waiting for data: it keeps asking for the state file, the shared settings and its check-in, as
below. `?demo` in the address forces the demo even when a state file exists, and a forced demo
asks the display's server nothing: no state file, nothing under `api/` (no shared settings, no
writes and no display check-in), so the choices made on its screen stay in the browser, as from
disk ([This browser's own choices](#this-browsers-own-choices)). It still fetches the static
files beside it: the downloaded packs in `data/packs/` and, on a deployed copy, `version.json`.
The website's demo runs this way. Browsers refuse to fetch from disk, so from disk the page does
not try.

**Wait.** Served over HTTP, the page draws the quiet scene with no words and no bar until the
first answer for the state file arrives.

**Live.** The page fetches `data/state.json`, relative to itself and with `cache: "no-store"`, at
start and five seconds after each answer, and cuts a fetch off after four seconds. A valid file
hides the review bar and drives the display:

- The first condition with a known id wins. Its id chooses the scene and the knight's state from
  the table in [design.md](./design.md), its `level` the text colour (critical red, warning
  amber, work blue, quiet green, sleep dim green), and its `headline` and `detail` the words. An
  id the page does not know is skipped and plays no part in the badge.
- A generic check, `check:<name>` with the condition it borrows in `as`, is acted as that
  condition: the same scene (or the one `[scenes]` and the settings choose for it), the same state
  of the knight and the same rank, under the check's own words and level. It never takes what is
  tied to the condition it borrows: one acted as `streaming` keeps its own detail, turns on no
  television and raises no streams' badge, and one acted as `pi_silent` leaves the pie in its
  dish. A check whose `as` is `device_down`, or a condition the page does not know, is skipped.
- The "+N MORE" badge counts the other known conditions at warning or critical, and turns red
  when any of them is critical.
- While `streaming` is shown, the detail line takes each stream in `facts.streams.sessions` in
  turn, eight seconds each (`KW.state.STREAM_MS`), as `Robin · The Night Shift S02E04 · 2 of 3`;
  one stream reads `Robin · The Night Shift S02E04`. Which stream shows is worked out from the
  clock alone, `Math.floor(now / 8000) % n` on the wall clock (the frozen time of `t=` in a
  screenshot), so every display shows the same stream at the same moment, and the collector keeps
  the streams in the order they started, so a new file does not move the line on. The name and the
  `2 of 3` stay whole and the title gives way, to the detail's 60 characters. With no sessions (a
  collector from before them, or one whose setting `show` is `count`) the line is the
  collector's `detail` as it is, such as `3 streams`.
- While `streaming` is up and a higher condition is shown, a second badge, `2 STREAMING`, stands
  beside "+N MORE" (in its place when there is no "+N MORE"), with `facts.streams.count` as the
  number, which every mode of `show` keeps, or `STREAMING` alone when the file has no count. It is
  muted beside "+N MORE": outlined in the night's dim green (`--kw-sleep2`), not filled, and sized
  with the headline (`hs-s`, `hs-m`, `hs-l`), so it never outshouts the warning above it. It is
  hidden while `streaming` is the condition shown, and under NO SIGNAL.
- With no known condition the quiet scenes the settings choose take turns, ten minutes each
  unless the settings set another length (`LIVE_TURN_MS` in `main.js` is the ten), and the small
  line is the quiet line, built from `quiet_parts` in the world's words or `quiet_line` as it is
  (see [The words over the scene](./page.md#the-words-over-the-scene)).
- The file's `defaults` go to the settings (see [Settings](#settings)), which apply any change at
  once. With each fetch of the state file the page also asks `api/settings` for the shared
  settings (see [The shared settings](#the-shared-settings)).
- Served over HTTP, in every mode but a forced demo, the page makes a random id of its own once, 32 hex characters
  kept in its browser's storage under `kw-display` (a fresh one each load where the storage
  refuses), and posts it to `api/displays` at load and every 30 minutes, so that the bundled
  server can count the displays for the collector's usage counts
  ([server.md](./server.md#post-apidisplays)). The id never leaves the host. Another web server
  answers the post with an error, which changes nothing. From disk it posts nothing.
- The devices come from `facts.devices`, and without it the pie stands alone as before
  there were devices; see [Devices](./page.md#devices). `facts.streams.count > 0`, or a
  `streaming` condition, turns the television on.
- Events. The first valid file's events are adopted without playing. After that each event with
  a higher `seq`, oldest first: `ad_blocked` adds `count` flies (at most 100 for one event;
  eight on screen, the rest queued for the next swat), `ip_banned` plays the goblin, `import`
  the crate and `backup_done` the feast, each with a caption built from its `parts` in the world's
  words, or its `text` as it is. The goblin is a foe
  as tall as the knight's shoulders: it climbs over the battlement's wall or digs up out of the
  camp's grass beside the knight, pulls a face, is bonked on the saucepan it wears, and vanishes
  in a puff of smoke. The knight's swing stops where the blade meets the pot, so the blade never
  passes through it; nothing gory is shown. The goblin keeps its flinch for 16 ms after the blow,
  so the blade lands on the pose it was aimed at, and then flings up its hands. In the bounce the
  blade lifts off the pot, and a weapon held in one hand also rocks back; one held in both hands
  does not, so its guard stays clear of the flung hand. After the bounce the knight returns to the stance; where
  the swing comes back low (the swings to the left, `KW.knight.ownReturn`), the return follows the
  swing's own, offset by where the bounce left the blade, so the blade does not pass the face again. The goblin stands where the weapon the knight holds
  reaches it, the greatsword, the longsword, the arming sword or the mace alike, on whichever build
  is drawn, and does not come where none can (the mace by its drawn head: see
  [The knight's rig](./rig.md#anchors-values-and-poses)); the
  burst on the pot lasts the 80 ms the blade bounces off it. A foe is described in `KW.cast.foes`
  ([The cast](./page.md#the-cast)) and played by the engine's foe player from its tables
  (`KW.engine.foe.FOE`), so a later foe reuses the entrance, the strike and the exit. A foe of
  another world may fire (format 1.2, [worlds.md](./worlds.md#format-12)): it aims where the goblin
  pulls its face and fires once before the knight strikes, and the knight is never hit; the shot
  misses over the head, or stops at the shield with a spark, and the knight's eyes go wide for a
  moment. A `seq` lower than the
  highest played means the collector started again, and its events are adopted unplayed. Events
  act out only while nothing at warning or above is up and in the scenes that host them (each
  scene's `hosts`, [The scene interface](./page.md#the-scene-interface)); the caption shows regardless. The
  foe and the critter are the ones the settings choose, the goblin and the fly unless a world or a
  level names another (`foe`, `critter` in [The engine's input](./page.md#the-engines-input)).

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
a `dev` page does (see [The knight from the base pack](./rig.md#the-knight-from-the-base-pack)).
The website's demo is a copy stamped by the site's build with the commit it was built from
([site/README.md](../site/README.md)), so an open demo reloads onto each new deploy of the site
within about five minutes, a forced demo like any other.

The mapping is the pure function `KW.state.map(file, nowMs)`, whose view carries the streams as
`streams` (`streamsOf(facts.streams)`: the count and the sessions) and `streamsBehind`, whether
`streaming` is up behind the condition shown. `streamWords(streams, nowMs)` gives the detail line
for that moment, or null without sessions, and the badge. Beside them,
`judge(view, lastGood, nowMs)` decides between showing a file, holding the last one, NO SIGNAL and
the demo, `arrange(list)` puts a list of devices in the places (see
[Devices](./page.md#devices)), `listFromHook(text)` reads the address's `dv=` hook into a list
in the contract's shape, `takeEvents()` picks the events to play and `noSignal()` builds the
knight's NO SIGNAL state. `versionOf(file)` reads the version out of a parsed `version.json`, and
`reloadDue(own, fetched, last, nowMs)` decides whether to reload, given the page's own version, the
fetched one, the record of the last reload and the time. `state.js` loads under Node for the tests.

## Settings

A display's look, its display preferences, its quiet scenes and the scene each offered condition
plays in are its settings. Each comes from four levels, highest first, key by key:

1. **The address's hooks**: `wd=`, `bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, the gear's `sh=`,
   `hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=` and `bk=`, `mon=`, `ms=`, `mh=`, `mr=`,
   `pc=`, `fo=`, `cr=`, `pr=`, `wo=`, `ov=`, `hs=`, `h=`, `ck=` and `sc=` (see [The address](#the-address)).
   They keep screenshots the same whatever is saved.
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
   each monarch's own hair and robe ("As drawn", `null` in what `now()` gives), the mouser cat in
   its calico coat, the goblin, the fly,
   the medieval devices, overlay and words, all five quiet scenes, and each condition in its own
   scene; with a medium headline, a 24-hour clock, the helmet off indoors, and ten minutes for each
   quiet scene in live mode and one in the demo.

The keys, the values each may take and the page's own defaults come from the settings schema,
`collector/settings-schema.json`, through the copy `tools/settings-schema.js` writes between the
`settings-schema` markers of `settings.js` (`KW.settings.SCHEMA`); `ONE_OF`, `SCENES`,
`ALL_SCENES`, `MINUTES`, `BUILT_IN`, `TABLES` and `KINDS` are made from it, and `LONG`, the form of
a long name, is held to its `long_name` by `tests/web/settings-schema.test.js`. They are the contract's: `look` holds `world`, `build`, `weapon`, `skin`, `hair`,
`hair_style`, `tabard`, `plume`, the gear (`shield`, `helmet`, `plume_style`, `body`, `shoulders`,
`arms`, `hands`, `legs`, `feet` and `back`), `monarch`, `monarch_skin`, `monarch_hair`,
`monarch_robe`, `pet`, `pet_coat`, `foe`, `critter`, `props`, `overlay` and `words`, and two tables, `items` (a slot to
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

A key marked long in the schema (`world`, `monarch`, `pet`, `foe`, `critter`, `props`, `overlay`, `words`,
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
the engine's `turns`, `turnMs`, `patron` (`{ id, skin, hair, robe }`), `pet` (`{ id, coat }`), `scenes`, `homes` and `kinds` (see
[The engine's input](./page.md#the-engines-input)); `turnMs` is `ownMs`, the demo's minute or live mode's
ten, while no level sets `minutes`, the monarch's colours are `null` while no level sets them,
`scenes` holds only the conditions a level above the page's own sets, so with nothing set it is
`{}` and every condition plays where it always did, `homes` is the world's own scene for each
condition, and `kinds` the prop set each kind of device is drawn from: the one `devices` names for
it, or `props`. `main.js` hands `kinds` to `KW.world.useKinds()` ([worlds.md](./worlds.md#presets-on-the-page)). The
headline size becomes the display option `hs`, the helmet indoors `h` (`on` for true, `auto` for
false), and the clock reads `21:42` or `9:42` with a small `PM` after it. `clock(h, m, hours)` gives
the words: on the 12-hour clock the hour after midnight is `12:05 AM` and the half hour after noon
`12:30 PM`.

### Worlds

A world is a preset, every part of the look, the quiet scenes and the scene of each condition at
once, held in a world pack's `worlds` section ([worlds.md](./worlds.md#presets-on-the-page)). The page
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
  `{ part, value, why }`: a body, swatch, item, patron, prop set or scene it has not loaded (`'not
  loaded'`), a quiet scene that is not quiet, a scene that cannot act its condition.
- `ignored`: see above.

The page lists what it has loaded in `KW.settings.pageWorld()`, from the loaded scenes, `KW.state`
and `KW.world.catalogue()`: the worlds by name, with each preset; the prop sets by name, with the
kinds each draws; the scenes of a pack by their long names; the long names of kw.medieval's
parts with the short name each stands for, and those of every other world pack's scenes, cast,
words and overlays, each standing for itself; the bodies (`builds`), the swatches of each of the
user's sets (`swatches`) and the items (`items`) of packs other than the base pack, by their long
names; and the name of each such part (`titles`), which the screen shows. A world of another pack,
called by its long name (`kw.example/world.neon`), is read part by part
(`KW.settings.worldParts`): its body and swatches as the look's `build`, `skin`, `hair`, `tabard`
and `plume`, by their short names when they are the base pack's and by their long names otherwise;
its items as the look's keys where a key names them, and in `items` where none can; its patron,
pet, foe, critter, props, overlay and words, its quiet scenes and its scene for each condition by
the names the page has loaded. Every part the page has loaded is drawn: its scenes and cast from
`KW.scenes` and `KW.cast` under their long names, its words and overlay put in use by
`KW.world.useWords` and `useOverlay`, its body and outfit by the knight
([worlds.md](./worlds.md#other-worlds)). A part it has not loaded falls back to the base world's,
listed in `faults`.

`build`, `skin`, `hair`, `tabard` and `plume` take the long name of a body or a swatch of a loaded
pack at any level, as `world` and the cast's keys do; `knightLook()` passes a long name as it is
and a short one as the base pack's, so `build = "kw.example/body.courier"` draws the knight on that
body, with its own head. `monarch_skin`, `monarch_hair` and `monarch_robe` take the long name of a
skin, hair or tabard swatch of a loaded pack the same way, and the patron is drawn in its colours
(`engineInput()` reads its entries with `KW.world.swatchOf`). A long name the page has not loaded is
left out, with `no pack the page has loaded gives that build` (or `swatch`). In `scenes`, a loaded
world's scene by its long name may be given any condition with a scene of its own when it can act
it, even one the page offers no choice for, such as `night`; a short name keeps to the conditions
offered, which count every loaded world's scenes (`offered(world, true)`): once another world gives
the WAN going down a second scene, the battlement may be chosen for it too. The page's own level
keeps a scene for the base world's offered conditions alone, so with nothing set the settings are
the same whatever else is loaded.

Three rules fit parts from different worlds together, in `resolve()`:

- **A slot's item gives way to its key.** An item `items` names for a slot (the helmet's, the
  weapon's `main`) is drawn over the key that chooses that slot's item, as before, unless a level
  above the item's sets the key, or the item is the world's and the key is set at the world's level
  or above. So the open helm chosen on a display is drawn in a world whose preset gives another
  helmet, and `[look.items]` in `config.toml` still beats a key set beside it.
- **The pet's coat is a coat of the pet in use.** `pet_coat` takes the cat's `calico` and `ginger`,
  or a coat of a loaded pack's pet by the pack and the coat's id, `"<pack>/<coat>"`. A coat the pet
  in use does not have, another pet's, gives the pet's first (the page's own coat for the cat), with
  `from` the pet's; a world naming a pet and no coat gives its pet's first. The engine is given the
  coat's own id within the pet.
- **The weapon is held as its item says.** `now()` gives `grip`, `'one'` or `'two'`: from the item
  in `items.main` where it names one the page knows the grip of, from the weapon key otherwise. A
  one-handed item chosen on a level carries the shield the shield key gives, as the sword and shield
  does; a world's own one-handed weapon carries one only where a level sets the shield.

The store's `choosePart(k, id)` saves a part of any loaded pack for the key `k` in one write naming
`look`: an item for the slot `k` chooses goes into `items` for that slot, and a value of the key
itself leaves the slot's item out, so what is chosen is what is drawn. `clearPart(k)` clears both,
and the part is the world's again.

The store's `chooseWorld(id)` saves a world on this display and clears every part this display has
chosen, the look's other keys, the quiet scenes and the scene of each condition, in one write
naming `look`, `quiet` and `scenes`; the display's preferences and the quiet scenes' length stay.
It returns what it cleared, each as `'section.key'`, for the line the screen shows, or `null`,
saving nothing, for a world the page has not loaded. `catalogue()` gives what the page has loaded.

### Another world pack

The page ships the medieval world. Another world comes as a world pack, a `.pack.json` file. Behind
the bundled server, put the file in the `packs` folder of the collector's output folder (the folder
`KW_OUT` names, `var/out/packs/` in the quick start), and name it in `index.json` in the
same folder:

```json
{ "packs": ["example-world.pack.json"] }
```

A display reads the folder once, when it loads the page, so it shows the pack from its next load.
A deployed page reads a pack only when it carries a signature that verifies against the project's
key, and a `dev` page reads unsigned packs too ([packs.md](./packs.md#signing)). A pack that is
refused is listed, with the step and the reason, under Refused packs on the settings screen's
status page. One that is read adds its world to the World page beside the medieval one, and its
parts to the rows of the other pages. The rules for the folder and the index are in
[library.md](./library.md#downloaded-packs).

### The shared settings

Served over HTTP, the page asks `api/settings` beside it for the deployment's settings: once at
start, and again with every fetch of the state file, so every five seconds. A demo forced by
`?demo` never asks, and keeps its choices in the browser. The bundled server answers
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

From disk, or forced into the demo by `?demo`, the page asks nothing, and the choices are this
browser's.

### This browser's own choices

With no server, the choices are kept in the browser. One key in its `localStorage`,
`knightwatcher.settings`, holds
`{ "v": 1, "look": {...}, "display": {...}, "quiet": {...}, "scenes": {...} }`, with the contract's
names and values. A text saved before there was a `scenes` section is still version 1 and reads as
it did, each condition in its own scene. A choice is saved the moment it is made. Every read and write is wrapped: where a browser refuses
storage, as a private window may, the page works all the same, the choices last until it is
reloaded, and the console says so once. A stored text that is not JSON, or not version 1, is
ignored whole, and a stored value the page does not know is ignored alone. The choices belong to
that one browser, so other displays keep their own. This is how the page behaves from disk, in a
demo forced by `?demo` (the website's demo among them), and served by a web server other than the
bundled one.

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

**Layout.** A side rail of eight pages, World, the knight, the monarch, the cast, display, quiet
scenes, scenes and status, with DONE at the top right. The screen opens on the knight's page; World
is first in the rail. The knight's and the monarch's pages take their names from the labels of the
world's words in use, `watcher` and `patron` ("The knight" and "The monarch" in `words.medieval`),
and keep "The knight" and "The monarch" where there are none. A role's label is the words' own while
the part in that role comes from the words' world, and the role's plain name otherwise
(`KW.settings.screen.roleLabels`): with the medieval words and another world's patron the page is
"The patron" and its row "Patron", and another world's pet is "Pet", not "Cat"; so are the
patron, pet, foe and pest wherever the screen names them, the status page among them.

**Parts from every loaded world.** The part pages (the knight, the monarch, the cast, the scenes and
the quiet scenes) list every loaded world's parts beside the medieval world's, so a household can
mix parts across worlds on the wall itself. Each row lists the world in use's choices first, then
each other world's under its name, on a line of its own set off by a rule ("ORBIT"), so that each
group starts in the first column; a world with nothing for that row
gives no group. A row whose part is not the world in use's own carries a blue square by its label
and a blue line under it naming the world's own ("Changed from the Medieval world's own: open
helm."); an item is compared by the slot it fills, so another pack's helmet shows as the helmet it
is. A part that cannot be used where it is chosen says so in amber on the row that chose it, as a
greyed choice does. What each row lists is worked out apart from the drawing
(`KW.settings.screen.knightRows`, `patronRows`, `castRows`, `sceneRows` and `quietGroups`), each
row `{ key, label, groups, cur, own, changed, warn }`, which the admin page's household look lists
too. With only the medieval world loaded each row has its one group and reads as before. The screen covers the whole window, review bar included; the scene
keeps running behind, dimmed, and shows each choice as it is made. Every choice applies at once,
with no Save button. On a window up to 1200 wide or 760 tall the screen is drawn a little tighter,
with labels above their choices, the rail's entries 48 pixels tall and 6 apart so that all eight
fit, and the house's preview left out; every touch target stays at least 48 pixels tall.

**The choices' grid.** The choices of a row sit in an even grid, aligned row by row
(`web/css/settings.css`). Choices in words (the build, the weapon, the hair style, each piece of
armour, the display's preferences and the quiet scenes' length) are all one width, in two columns
where the row's choices have less than 420 pixels across and three where they have 420 or more,
each column at most 220 pixels wide (180 on a small window); a label longer than its column wraps
inside the button, and the buttons on one line of the grid share the height of the tallest. The
row's own width decides, not the window's, since the label column and the preview take a share
that differs by page and by window: at 960 by 600 and on the tablet's 1480 by 924 the knight's
rows have 453 and 513 pixels and show three columns, a window of 1280 by 800 has 313 and shows
two, and the Display page, with no preview, shows three at every size. Swatches sit in equal
cells 8 pixels wider than the chip (4 on a small window), as many to a line as fit, their names
wrapping inside the cell; pictures (the monarchs, the pets and their coats, the foe, the pest,
the worlds, the scenes and the devices) in equal cells the width of their kind's chip. A row whose
choices are of mixed kinds wraps as it comes.

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
or says the address sets it. An item is compared by the key of the slot it fills, so another pack's
helmet is a Helmet row. Tapping the world's chip puts the part back: this display's choice is
cleared (for a slot, the key and the item together, `clearPart()`), and where a level below still
sets the part, the world's value is saved over it. With
nothing changed the line reads "Nothing: every part is the world's."

Once a second prop set is loaded, a heading "Devices, kind by kind" and a row for each kind of
device, Pi, Camera, Host, VM and Other, each with a picture of the kind as every loaded set that
draws it draws it (`KW.world.drawingOf`), each in a frame of 130 by 104 grid pixels about its drawing, one
size for every kind and set, so the largest device shows whole, the world's set first and named "the world's"
(`KW.settings.screen.deviceRows`). A choice saves the set for that kind in `look.devices`; the
world's set clears a kind this display chose, so that it follows the world again
(`KW.settings.screen.devicesAfter`). With one prop set, as at launch, there are no device rows. The
page ends with the reset of the look: "The default is the Medieval world, every part as it comes",
or with the parts `config.toml` sets beside it ("with a forest tabard").

**The knight.** Build, weapon, skin tone, hair colour, hair style, tabard and plume, each a row of
choices, and under a line headed Armour ten more rows of gear: shield, helmet, plume style, body,
shoulders, arms, hands, legs, feet and back; names and colours come from the base pack, and each
other loaded pack's bodies, swatches and items follow under its world's name, by the names its pack
gives them (a weapon with One hand or Two hands under it, by its grip). The line over the armour
says "each piece from its world's pack" once another world is loaded. A choice is saved by
`choosePart()`, an item of another pack in `items` for its slot. The weapon
row shows the greatsword, the longsword and the crossbow (Two hands) and the sword and shield and
the mace and shield (One hand each); each gear row shows the items of its slot the base pack in use draws, by
their names, in the schema's order (`KW.settings.itemChoices`), and the back starts with Nothing. A
row the look does not show is greyed as an unready build is, and a tap on a greyed choice says why
in the line under the row and changes nothing (`KW.settings.greyed`, from the weapon and the helmet
drawn, an item in `items` over its key): the shield beside a two-handed weapon ("A shield is carried
only with a one-handed weapon: the sword and shield or the mace and shield.", or for an item, "The
pry bar is held in both hands, so no shield is carried."), and the plume style with a helmet that
has no plume mount, the mail coif ("The mail coif has no plume mount, so no plume is drawn with
it."), the plume's colour too unless the long cloak, which takes the plume's colours, is worn. A
body of another pack the knight could not draw (its pack refused, or the knight's status falling
back from it) is greyed as an unready build is, "Coming". Under the house's preview a line says
when the helmet drawn has no rest view, so the stool stays bare. The build row shows the contract's three
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
hair and robe, then every other loaded world's patrons, seated on the same throne; the six skin
tones of the base pack; a Hair colour row and a Robe row, each starting with "As drawn", in the
chosen monarch's own colours, followed by the base pack's six hair colours and six tabard colours;
each row then every other loaded pack's swatches of that set. A patron that binds none of the user's
sets is drawn in its own colours, and its skin, hair and robe rows are greyed: "The captain is drawn
in its own colours, so none is chosen for it." "As drawn" saves nothing: it clears this display's choice for that key
(`clear`), so the default from `config.toml` applies, or the monarch's own colours when there is
none; a row whose value comes from `config.toml` therefore shows that colour chosen after "As
drawn". Beside the rows, the chosen monarch at court; on a full-size screen that picture is a
little narrower than on the knight's page, so that a row of seven stays on one line. The cards
and the picture at court show the same crop of the court, 240 by 384 grid pixels about the
throne: its armrests and finial whole with a margin, and so the crown of every monarch on it.
Each card is 120 by 192 CSS pixels and drawn only by whole steps (`blitWhole`), at half the crop
where a CSS pixel is one device pixel and at the crop's own size where it is two, so no pixel of
the art is smeared across two.

**The cast.** One page for who shares the scenes with the knight, in place of the pet's page: a
line saying what each does, then a row of the pets, the mouser cat and every other loaded world's;
a Coat row of the pet in use's coats (the cat's Calico and Ginger tabby), the one the page falls back
to on a reset marked Default; the foe, the goblin and every other world's; and the pest, the fly and
every other world's. Each pet and coat is a card with the pet drawn sitting up in that coat, each
foe standing and each pest hovering, from the cast in use (`KW.cast`). When attacks play in a scene
with no room for a foe (one whose `hosts` lack the foe), the foe row says in amber that none comes
there and that the Scenes page chooses where attacks play. Beside the rows, under "At home", the pet
at rest in the chosen coat: the cat curled on the house's floor in front of the hearth, cropped
from the house drawn by its own code, and another world's pet at its spot in the first of its own
world's scenes. The page ends with the reset of the look, whose words name the pet and its coat
("the mouser cat, calico"). The pet cannot be turned off. The rail calls it "The cast", and the
address still opens it with `set=pet`.

**Display.** The headline size (small, medium, large), the clock (24 hour, 12 hour) and the helmet
indoors (off in the house and the smithy, or kept on everywhere).

**Quiet scenes.** The five quiet scenes, each with a picture drawn by its own code and a switch,
and once another world gives quiet scenes, each world's under its name, the world in use's first;
a blue line says when the rotation differs from the world's own.
The last one in the rotation cannot be switched off, and a line says "One scene at least stays in
the rotation."; a scene switched back on joins the end of the rotation. One length for every scene:
5, 10, 15, 30 or 60 minutes, and a length set elsewhere outside those shows as a choice of its own.
In the demo, while nothing sets the length, a line says the demo shows each scene for a minute.

**Scenes.** A line saying what the page is for, then one row for each condition offered, named as
its headline reads (Under attack, Disk full, Backup overdue, Pi silent, Running hot), with a small
picture of each scene that can act it, drawn by the scene's own code as on the quiet scenes page,
every other loaded world's after its name; a condition only one medieval scene acts, such as the
WAN going down, gets a row once another world acts it. The scene the condition goes back to on a
reset (its own, or the one `config.toml` sets) is marked Default. A scene a level asks for that
cannot act the condition is named in amber with the scene shown instead ("config.toml asks for the
bridge, from Orbit, which cannot act it. Shown in the training yard."), and so is an attack's scene
with no room for a foe. A choice applies at once, and the scene behind changes if that condition is
showing.

**Status**, read only: the page's version (the deploy's hash, or `dev`), how long ago the state file
was written and how often the collector writes it, the sources in it (all working, or each failing
one with its error and the time of its last read), whether the collector's usage counts are on
(On., or Off., with a line saying that `KW_ANALYTICS` in `.env` changes it; "Not known" before a
state file, or from a collector that does not say; [configuration.md](./configuration.md#usage-counts)),
then three entries for the world, and the packs
refused, each with its step and reason. The world's entries:

- **World**: the world in use, its pack's id and version and whether it is signed, and where it
  is chosen ("Nothing chooses a world, so the page uses its own.", "Set in config.toml.", "Chosen on
  this screen, for every display.", or by the address).
- **Parts**: where each part comes from, a line each: the knight with the base pack's id and
  version (or why it is drawn from code), the monarch, the scenes, the cast (the goblin, the fly and
  the cat in its coat), the devices (with any
  kind drawn from another set) and the words with the overlay. A part of another world names that
  world's pack and version in place of the medieval world's: the knight on another pack's body or
  in its swatches or items, the patron, a scene in use (in the quiet scenes, the world's scene of a
  condition or one chosen for it), a member of the cast, and the words. Each line names the parts that
  differ from the world's and where they were set ("; the tabard (forest) chosen here."), and under
  the knight a line names the parts `config.toml` sets that give way to a world chosen above it.
- **Fallbacks**: every fallback with its reason (`KW.settings.screen.fallbackLines`): what a level
  sets and the page ignores (`ignored`), as "Disk full: config.toml asks for the camp, which cannot
  act it. Shown in the cellar, the world's own."; a part of the world the page has not loaded
  (`faults`); a scene, a kind of device or a member of the cast drawn from code, because it failed
  to compile or because it threw while drawing ("Camp: drawn from code. The scene camp threw while
  drawing: ..."), a kind of device drawn from the base world's set, the word set given way to the
  collector's words, a part of another world not drawn because it failed to compile or threw
  ("test.orbit/deck: not drawn, so the base world's is used. The scene test.orbit/deck threw while
  drawing: ..."), and the knight's items that fell back. "None. Every part is
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
drawn at, the frozen time when `t=` freezes it. What the World page, the part pages and the status
page's world entries show is worked out in `KW.settings.screen`, apart from the drawing, so that
`tests/web/worlds.test.js` and `tests/web/world-mix.test.js` read it. It returns `open(page)`, `close()`, `isOpen()` and
`cue(x, y, q)`. Nothing of the screen is drawn while it is shut, so with it shut and nothing saved
the page looks exactly as before there were settings.

## The address

The hash holds the demo's settings and a set of test hooks. `h=`, `hs=`, `t=`, `kx=`, `pl=`,
`set=` and the settings hooks (`wd=`, `bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=`, the gear's `sh=`,
`hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=` and `bk=`, `mon=`, `ms=`, `mh=`, `mr=`, `pc=`,
`fo=`, `cr=`, `pr=`, `wo=`, `ov=`, `ck=`, `sc=`) also work in live mode. `f=`, `fa=`, `e=`, `sw=`, `dv=`, `st=` and `sm=` act in the demo and do nothing elsewhere. The
settings hooks, `h=` and `hs=` are the highest of the settings' levels (see [Settings](#settings)):
each outranks this display's saved choices and the state file's defaults while the address holds
it, and a value it does not know is ignored, with a line in the console, so that the next level
down is used.

| Key | Meaning |
|---|---|
| `on=` | active conditions, comma separated, by the contract's id or the short alias (`attack`, `wan`, `sick`, `disk`, `backup`, `pi`, `device`, `cpu`, `swap`, `ssh`, `update`, `plex`, `night`) |
| `is=` | the quiet scene: `auto` for the rotation the settings choose, or `battlement`, `camp`, `house`, `yard`, `smithy` to keep one; in the smithy the knight quenches a blade. The cellar and the court come from conditions, and so does the smithy's anvil and its bellows |
| `h=` | the helmet: `auto` (off in the house and the smithy), `on`, `off`. Without it the settings' helmet indoors chooses between `auto` and `on` |
| `hs=` | the headline size: `s`, `m`, `l`. Without it the settings' headline size |
| `bar=0` | hides the review bar |
| `demo=1` | runs the demo loop |
| `t=` | freezes time at that many ms, `t=0` included, for screenshots |
| `e=` | plays an event: `goblin`, `crate`, `feast` |
| `f=` | starts with that many flies, which come at -5000 ms, or at `fa=` |
| `fa=` | when the flies of `f=` come, in ms, such as `fa=600`: with `e=` and time frozen, a fly that comes during the event is the cat's |
| `pc=` | the pet's coat: `calico` or `ginger` |
| `fo=`, `cr=` | the foe of the banned address's event and the critter a blocked advert becomes: `goblin` and `fly`, or a loaded world's by its long name, as `fo=kw.example/foe.drone` |
| `pr=`, `wo=`, `ov=` | the prop set the devices are drawn from, the words and the overlay: `medieval`, or a loaded world's by its long name, as `wo=kw.example/words.neon` |
| `st=` | how many of the demo's three invented streams play, `1` to `3`; without it three |
| `sm=` | the demo's streams as the collector's setting `show` would send them: `names`, `titles` or `count`; without it `names` |
| `sw=1` | starts a swat |
| `kx=` | places the knight, in units of `U` |
| `mon=` | the monarch at court: `a` the king, `b` the queen, `c` the monarch who is neither |
| `ms=` | the monarch's skin: the id of one of the base pack's skin swatches, such as `ms=deep` |
| `mh=`, `mr=` | the monarch's hair and robe: the id of one of the base pack's hair swatches and of one of its tabard swatches, such as `mh=silver&mr=teal`. Without them, each monarch's own colours |
| `sc=` | the scene a condition plays in: `<condition>:<scene>`, by the contract's ids, separated by commas, such as `sc=cpu_hot:camp,pi_silent:battlement`. A pair the page cannot act is ignored, with a line in the console |
| `ck=` | the clock: `24`, or `12` for 9:42 with a small PM |
| `set=` | opens the settings screen at load on a page: `world`, `knight`, `monarch`, `pet` (the cast), `display`, `quiet`, `scenes` or `status`. `set=hold` instead shows the cue of the hold seven tenths of the way through, over the knight's head, and leaves it there; for screenshots. A later change of the hash to one holding `set=<page>` opens the screen at that page without a reload, and takes the `set=` out of the hash again, so the same change works each time; the website's Open the settings button sets its demo frame's hash so. `set=hold` does nothing then |
| `dv=` | the demo's list of devices: kinds separated by commas, each followed by `-` for down or `!` for down and alerting, placed by the filling rule. `dv=pi,camera!,camera,machine,vm-,x` fills the pie's place, two high places and three ground places, the third with the plain box. An empty item is an entry the page cannot read. Without the hook the demo shows the pie alone, gone while `pi_silent` is on. With `device_down` on, the knight looks towards the first device that is down and alerts |
| `wd=` | the world: `medieval`, or a loaded world by its long name, such as `wd=kw.example/world.neon`, chosen at the address's level, so that it sets every part the address leaves alone. A hook's value may hold the slash of a long name, as `bd=kw.example/body.courier` or `sk=kw.example/chrome` |
| `bd=` | the knight's build: `a` Classic, `b` Broad or `c` Slim, the base pack's `build.<value>`, or a loaded body by its long name. A page that cannot draw from the base pack draws Classic whatever the hook says |
| `arm=` | the knight's weapon: `one` the base pack's arming sword in one hand and its shield in the other, `two` the greatsword, or any weapon by its contract name: `longsword`, `mace_and_shield`, `crossbow`; or a loaded pack's weapon by its long name, `arm=test.orbit/main.blaster`, which `sh=` may match with a loaded pack's shield by its long name, `sh=test.orbit/off.deflector`. A page that cannot draw from the base pack draws the greatsword whatever the hook says |
| `sh=`, `hm=`, `ps=`, `bo=`, `so=`, `am=`, `hn=`, `lg=`, `ft=`, `bk=` | the knight's gear by its contract value: the shield (`sh=round`), the helmet (`hm=coif`), the plume's style (`ps=feather`), the body (`bo=cuirass`), the shoulders (`so=lames`), the arms (`am=mail`), the hands (`hn=leather`), the legs (`lg=hose`), the feet (`ft=sabatons`) and the back (`bk=cloak`, or `bk=none`); the values are in [state.md](./state.md) |
| `sk=`, `hc=`, `tb=`, `pm=` | the knight's skin, hair colour, tabard and plume: the id of one of the base pack's swatches, such as `sk=deep&hc=black&tb=sable&pm=gold` (the ids are in [library.md](./library.md#the-base-pack)) |
| `hy=` | the knight's hair style: `short`, `tied`, `curls`, `long` or `close`, the base pack's `hair.<value>` |
| `pl=1` | outlines the scene's seven places and names them (`P`, `H1` to `H3`, `G1` to `G3`): the place's box; inside it the class box, the most any kind of the place's class may fill (the pie's from 46 left to 45 right and from 107 above the base to 33 below it, a high place's from 34 left to 32 right and 64 up, a ground place's from 66 left to 56 right and from 93 above the base to 2 below it), mirrored where the place is flipped; and the base, a white line. The pie's place is white, high places blue and ground places amber, and a place in front of the knight has a broken outline |

`e=` and `sw=1` act 300 ms after the page loads, or before the first frame when `t=` freezes time,
the event then before the flies of `f=`, so that a fly that comes with it is the cat's.
With time frozen the knight never starts a swat alone, so the flies of `f=` hover until `sw=1`
starts one, and a knight placed away from their spot by `kx=` stays exactly there, in mid-stride,
rather than walking a step in each frame.

The look hooks (`bd=`, `arm=`, `sk=`, `hc=`, `hy=`, `tb=`, `pm=` and the gear's) take the values the contract gives
the look in [state.md](./state.md) and keep screenshots the same whatever a display has saved; on
the code path they do nothing. A value outside the contract's is ignored, as at every level.

The demo rewrites the hash as its settings change, with the contract's ids in `on=`. It writes
`h=` and `hs=` only when the address named them or the review bar's buttons set them
(`KW.hooks.fixed`), so that a reload keeps the bar's choice and otherwise leaves the settings' in
force. The test hooks (`t=`, `kx=`, `dv=`, `pl=`, `set=`, the settings hooks, `f=`, `fa=`, `e=`, `sw=`, `st=` and `sm=`)
are read once when the page loads, and the rewritten hash leaves them out, so they last until the
page is opened again. `set=` alone is also read on a change of the hash, as the table says. The
demo rewrites the hash with `history.replaceState`, which is no such change.

## The admin page

`admin/` holds the household's admin page: its own HTML, script and stylesheet, served by the
bundled server at `/admin/` and nowhere else, since it needs the server's API
([server.md](./server.md#the-admin-page)). From disk, or from a web server of your own, it says
the admin page is off and why. It loads the same drawing scripts and packs as `index.html`, the
scene compiler, `cat.js`, the base pack and the medieval world's pack among them, in the same
order, without `demo.js` and `main.js`: it runs no display, and uses `KW.knight`, `KW.world`, the
scenes' own `paint()` and `draw()` and `KW.settings` to draw the household look's previews exactly
as every wall draws them. It starts the knight and then the world as `main.js` does, reading the
packs as a deployed wall does, signed unless its own `kw-version` is `dev`, so its previews of the
scenes, the devices in them and the monarchs are drawn from `kw.medieval`, and from code only where
a wall's would be ([world-loading.md](./world-loading.md#when-a-part-throws)). Served, it fetches the downloaded
packs from `../data/packs/`, beside the walls, with `KW.knight.fetchPacks(fetch,
'../')`, adds them to the knight and starts the world again with every text, as a wall does, and
paints its previews again; a field being typed in is left as it is until it is left.
`tests/web/world-loading.test.js` holds its scripts to the walls' own but `demo.js` and `main.js`,
in their order. The server stamps its addresses with the page's version, as the
rest; it works under the same content security policy, from its own address only, with its own
script and stylesheet and no inline script.

It has no checks of its own and no copy of the schema. At start it asks `api/admin/state` whether
it is on and signed in, and shows the sign-in, or "The admin page is off" with the reason; once
signed in it reads the schema from `api/admin/schema`, from which every section, label, help line,
default, range and list of values is taken, and its settings from `api/admin/settings` and
`api/settings`, again every five seconds, and sooner after a change. A field being typed in is
never redrawn under the cursor: news waits until it is left.

The household look lists what every wall's part pages list, from the same rows
(`KW.settings.screen`), resolved by a store of the walls' own settings code over the shared
settings and `config.toml`'s tables: the world as cards, a world chosen clearing the parts set here
as a wall's choice does; then the knight's build, weapon, swatches, hair style, gear, the monarch
and the monarch's colours, the pet and its coat, the foe and the pest, each with every loaded
world's choices after the world's name, the line naming the world's own where a part differs from
it in blue, and the line of a part that cannot be used where it is chosen in amber. An item of
another pack is sent in `look.items` for its slot, and the key's own choice takes it out, in one
change.

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

`docker compose up -d --build` builds the image, which holds the collector, the server and a copy
of `web/` stamped with its version, and starts both. The bundled server serves that copy, stamped
at build time by `server/stamp.py` with the same version, `version.json`, meta tag and `?v=`
addresses that `tools/deploy.sh` gives the same files ([server.md](./server.md#what-it-serves)).
Open displays reload onto a new image within about five minutes, as after a deploy. A tree run
straight from git builds from the working tree, so build from a clean export (`git archive`) when
other changes are in progress.

### The page alone, to a web server of your own

```bash
tools/deploy.sh /path/to/served/folder
```

The tool copies `web/` into the folder the web server serves, leaving the folder's `data/` (where
the collector writes) alone and deleting any other file that `web/` no longer has. It then stamps
the copy, and only the copy, with a version: the first 12 hex characters of a sha256 over the names
and contents of the files of `web/`, in a stable order and leaving `data/` out. It writes
`version.json` as `{"version": "<hash>"}`, sets the `kw-version` meta tag of `index.html` to the
version, and appends `?v=<hash>` to every local script and stylesheet address there, the pack
carriers included, so a new version is fetched under addresses no cache has seen. The stamped copy
is built in a staging folder first, so the served folder never holds an unstamped `index.html`. A
deployed copy's version is not `dev`, so it reads only packs that carry a signature that verifies,
and draws the knight from code when the base pack does not. The admin page under `admin/` is
copied with the rest and is part of the version, but `tools/deploy.sh` stamps `index.html` alone:
the admin page works only behind the bundled server, which stamps it as it loads it. The tool
leaves `data/packs/`, where the downloaded packs lie, alone with the rest of `data/`. The fonts the
stylesheet loads are not stamped. A deploy that changes nothing in `web/` gives the same version
and reloads no open page. The version does not depend on git, so the tool works from an exported
copy too.

It needs bash, rsync and coreutils, and changes nothing under `web/`. Run it against a folder
outside the repository: it refuses `web/`, a folder inside it and any folder that holds it, an
`index.html` whose meta tag it cannot find, and a copy in which a local address was left
unstamped. It exits 2 when it is given no folder and 1 when it refuses or fails. Open displays
reload themselves onto the new version within about five minutes of a deploy that changes
something.

**The page goes first.** When a change touches both the page and the collector, deploy the page
before the collector. A new page reads files from an old collector and from a new one, while an
old page skips what it does not know: a page from before devices ignores `facts.devices` and
`device_down`, so behind a new collector it would show nothing when a watched machine goes down.
A page from before the generic checks skips a `check:<name>` condition in the same way, and shows
the next condition it knows, or the quiet scene.
