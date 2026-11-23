# Loading a world

For contributors: how the page reads the world packs, puts their parts in place of the code's,
lists them for the settings, and falls back to the code-drawn copy of the medieval world when a
part is refused, fails to compile or throws. It covers `web/js/world.js`, the scene compiler. What
a world pack holds, and the rules it is checked by, are in [worlds.md](./worlds.md),
[scenes.md](./scenes.md) and [cast.md](./cast.md); how the knight's own packs load, in
[library.md](./library.md#on-the-page).

## KW.world

`web/js/world.js` defines `KW.world`:

| Name | Is |
|---|---|
| `compile(pack, id)` | the scene `id` of a loaded pack (a `read()` result of format 1.1) as an object with the scene interface; throws when the scene names something the compiler does not build |
| `start(texts, allowUnsigned, opts)` | reads `kw.medieval` from `texts` and puts its scenes in place, as above, each behind a guard ([When a part throws](#when-a-part-throws)), and every other world pack's parts under their long names ([Other worlds](./worlds.md#other-worlds)); `opts.keys` replaces `KEYS` in `read()`, for the tests only |
| `compileKind(pack, set, kind)` | the kind of device `kind` of the prop set `set` of a loaded pack, as an entry of `KW.kinds` ([The devices](./cast.md#the-devices-on-the-page)); throws when it names something the compiler does not build |
| `compileMember(pack, id)` | the cast member `id` of a loaded pack, as an entry of `KW.cast` ([The cast](./cast.md#the-cast-on-the-page)); throws when it names something the compiler does not build |
| `status` | what the last `start` found, with any fault since, or `null` before it |
| `changes` | a count that goes up at each `start` and each part that gives way to its code copy, which tells the engine and the settings screen to paint their backdrops and pictures again ([When a part throws](#when-a-part-throws)) |
| `props` | what the last `start` found for the devices, or `null` before it |
| `cast` | what the last `start` found for the cast, or `null` before it |
| `compileWords(pack, id)`, `compileOverlay(pack, id)` | the word set or the overlay `id` of a loaded pack, compiled ([The words and the overlay](./worlds.md#the-words-and-the-overlay-on-the-page)); each throws when it names something the compiler does not build |
| `join(parts, sets, limit)` | the line a list of parts makes in a set of templates, within `limit` characters, or `null` ([worlds.md](./worlds.md#the-words-and-the-overlay-on-the-page)) |
| `catalogue()` | what is loaded, for the settings ([What the page lists for the settings](#what-the-page-lists-for-the-settings)) |
| `swatchOf(set, name)` | another pack's swatch of one of the user's sets, by its long name, or `null` |
| `useKinds(choice)` | puts each kind of device's drawing from its chosen prop set in `KW.kinds`; `devices` holds what it did |
| `drawingOf(name, kind)` | one prop set's drawing of one kind, or the reason it cannot, without touching `KW.kinds` |
| `quietLine(parts, text)`, `caption(type, parts, text)` | the quiet line and an event's caption the page shows: built from the parts in the words in use, or `text` as it is |
| `words`, `overlay` | the word set and the overlay in use: what the last `start` found, or the one `useWords` or `useOverlay` put in use since, or `null` before it |
| `useWords(name)`, `useOverlay(name)` | put in use the word set or the overlay the settings choose: `'medieval'` for the base world's, or another pack's by its long name ([Other worlds](./worlds.md#other-worlds)) |
| `others` | what the last `start` found of the other world packs, `{ packs, parts, faults }`, or `null` before it |
| `MEDIEVAL`, `PROPS`, `WORDS`, `OVERLAY` | `'kw.medieval'`, `'props.medieval'`, `'words.medieval'`, `'overlay.phosphor'` |
| `QUIET_MAX`, `CAPTION_MAX` | 52 and 44, the longest quiet line and caption, as the collector's |

It also defines `KW.kinds`, the drawing of each kind of device the engine draws, and `KW.cast`, the
engine's supporting cast ([cast.md](./cast.md)).

## Where the scenes are drawn from

`main.js` calls `KW.world.start(KW.packText, allowUnsigned)` once at start-up, right after
`KW.knight.start`, with the same texts and the same rule: `allowUnsigned` is true only on a page
whose `kw-version` meta tag says `dev`. A `dev` page reads `kw.medieval` signed or not; a deployed
page reads it only when it carries a signature that verifies against a key in `KEYS`.

Each scene of `kw.medieval` whose id names a code scene (today every scene) is compiled and takes that scene's place in `KW.scenes`. It is also put under its long name, `kw.medieval/cellar`,
which is not enumerable, so the engine and the settings, which list the base world's scenes by
their short names, see the same seven scenes as before. The code scenes stay where they
are, in `js/scenes/`, and are the fallback: the owner decided that the medieval world keeps a copy
drawn from code, as the knight does.

A scene is drawn from code when:

| What happened | The line in the console |
|---|---|
| the pack was refused at a step of the checks | `knightwatcher: the scenes of kw.medieval are drawn from code: the pack kw.medieval was refused at the signature step` |
| no text among the carriers is `kw.medieval` | `...: no pack kw.medieval is loaded` |
| the pack library is not loaded | `...: the pack library is not loaded` |
| reading threw, which `read()` never should | `...: the pack kw.medieval was refused at the size step`, the reason `the pack could not be read: <message>` |
| that scene failed to compile | `knightwatcher: the scene cellar is drawn from code: it could not be compiled: <reason>` |
| that scene threw while drawing, in this version of the pack ([When a part throws](#when-a-part-throws)) | `knightwatcher: the scene camp is drawn from code: it threw while drawing: <message>` |

Otherwise the line is `knightwatcher: the scenes battlement, camp, yard, cellar, smithy, house and court are drawn
from the pack kw.medieval 0.7.1, signed` (or `unsigned`), written with `console.info`; the others
are `console.warn`. The line lists the scenes drawn from the pack in the pack's order, so with the
cellar failing to compile it is `the scenes battlement, camp, yard, smithy, house and court are drawn ...`, after
the cellar's own line. Of two copies of `kw.medieval` the higher
version is used, as `gather` chooses.

The knight reads the same texts, so it reads `kw.medieval` too. The pack carries no items and
changes no look, but a refusal is the knight's to report: it goes into `KW.knight.status.refused`,
onto the settings screen's Status page under Refused packs, and to the console in the knight's own
line,
`knightwatcher: the pack kw.medieval was refused at the signature step: sig: is missing, and this page accepts only signed packs`.
So a deployed page given an unsigned copy shows that line and the scenes' line above it in the
console, which is the pair the base pack gives.

`KW.world.status` holds what `start` found:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any scene is drawn from `kw.medieval`, `'code'` otherwise |
| `pack` | `{ id, version, signed }` of the pack in use, or `null` |
| `refused` | `{ id, step, reason }` when the pack was turned away, or `null` |
| `scenes` | for each scene the pack gives that the engine knows, `'pack'` or `'code'` |
| `faults` | `{ scene, reason }` for each scene that failed to compile, and `{ scene, reason, step: 'draw' }` for each that threw while drawing |
| `note` | the last line written to the console |

The devices are read in the same call, from the same pack: each kind of the prop set
`props.medieval` that the engine draws is compiled ([The devices](./cast.md#the-devices-on-the-page)) and takes the
code's drawing's place in `KW.kinds`. A kind the set does not give, and every kind when the pack is
refused, missing or not loaded, keeps the code's drawing from `KW.props.KINDS`; a kind nobody gives
is drawn as `box`, as before. A kind that fails to compile is drawn from code, with a line of its
own, `knightwatcher: the device kind camera is drawn from code: it could not be compiled: <reason>`
(`console.warn`), written before the scenes' line, which stays the last. A pack whose kinds all
compile adds no line. `KW.world.props` holds what `start` found for them:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any kind is drawn from the prop set, `'code'` otherwise |
| `set` | `'props.medieval'` when the pack in use gives it, or `null` |
| `kinds` | for each kind the set gives, `'pack'` or `'code'` |
| `faults` | `{ kind, reason }` for each kind that failed to compile, and `{ kind, reason, step: 'draw' }` for each that threw while drawing |

The cast is read in the same call too. Each member of the pack's cast whose id is its role, a dot
and the name of a member the engine has, as `critter.fly`, is compiled ([The cast](./cast.md#the-cast-on-the-page)) and
takes the code's member's place in `KW.cast`; a member of a name the engine does not know is not
compiled. A member that fails to compile is drawn from code, with a line of its own,
`knightwatcher: the cast member critter.fly is drawn from code: it could not be compiled:
<reason>` (`console.warn`), written after the devices' lines and before the scenes' line.
`KW.world.cast` holds what `start` found:

| Field | Holds |
|---|---|
| `source` | `'pack'` when any member is drawn from the pack's cast, `'code'` otherwise |
| `members` | for each member compiled or tried, by its id, `'pack'` or `'code'` |
| `faults` | `{ member, reason }` for each member that failed to compile, and `{ member, reason, step: 'draw' }` for each that threw while drawing |

The words and the overlay are read in the same call, the base world's by their names, the word set
`words.medieval` and the overlay `overlay.phosphor`, and another pack's put in use when the settings
choose it ([The words and the overlay](./worlds.md#the-words-and-the-overlay-on-the-page), [Other
worlds](./worlds.md#other-worlds)). With the pack refused, missing or giving neither, the page
shows the collector's own quiet line and captions and keeps the colours and the font `display.css`
writes out, which are the overlay's own; that adds no line of its own. One that fails to compile is
left out the same way, with a line, `knightwatcher: the words are the collector's: the word set
words.medieval could not be compiled: <reason>` or `knightwatcher: the overlay is drawn from code:
the overlay overlay.phosphor could not be compiled: <reason>` (`console.warn`), written after the
cast's lines and before the scenes' line. `KW.world.words` and `KW.world.overlay` hold what `start`
found:

| Field | Holds |
|---|---|
| `words.source` | `'pack'` when the word set is in use, `'code'` otherwise |
| `words.set` | `'words.medieval'` when it is in use, or `null` |
| `words.name`, `words.watcher`, `words.labels` | the set's name, its watcher and its labels as written, each `null` without it; the settings screen and the engine's note read the labels ([worlds.md](./worlds.md#the-words-and-the-overlay-on-the-page)) |
| `words.quiet`, `words.captions` | its templates for each part of the quiet line and for each event type, or `null` |
| `words.faults` | `{ set, reason }` when the set failed to compile, and `{ set, reason, step: 'draw' }` when it threw while filling |
| `overlay.source` | `'pack'` when the overlay is in use, `'code'` otherwise |
| `overlay.id`, `overlay.name`, `overlay.font` | `'overlay.phosphor'`, its name and its font's id, each `null` without it |
| `overlay.props` | the CSS custom properties `main.js` sets on the display, `{}` without it |
| `overlay.faults` | `{ overlay, reason }` when it failed to compile |

The court draws its monarch from `KW.cast.patrons`, from the pack and from code alike, so on a page
that reads the pack the monarchs come from the pack's patrons even where the court itself is drawn
from code.

`start` puts the code scenes, the code's devices and the code's cast back before it reads, and
leaves the words and the overlay out, so a second call starts afresh, and writes its lines again.
`main.js` calls it a second time once the downloaded packs have come ([Downloaded
world packs](#downloaded-world-packs)). The admin page starts the world as a wall does, after the
knight and with the same rule, and so draws its previews of the scenes, the devices in them and the
monarchs from the pack ([display.md](./display.md#the-admin-page)).

## When a part throws

A compiled part should never throw while it is drawn: the checks and the compiler see to that. One
that does anyway is caught for that frame, and from the next frame that part alone is drawn from
its code copy, while the rest of the pack stays in use, as when a part fails to compile. The owner
decided this, a part at a time rather than the whole pack. It mirrors rule 4 of the knight's
([library.md](./library.md#when-packs-fail)):

| Part | Caught in | From the next frame | The line in the console (`console.warn`) |
|---|---|---|---|
| a scene | `paint`, `draw`, `over`, `act`, `key`, `wallAt` and `drawn` | the code scene, under its short name and its long one | `knightwatcher: the scene camp is drawn from code: it threw while drawing: <message>` |
| a kind of the medieval prop set | `draw`, its still and moving parts | the code's drawing of that kind, in `KW.kinds` again through `useKinds()` | `knightwatcher: the device kind pi is drawn from code: it threw while drawing: <message>` |
| a kind of another prop set | the same | the base world's drawing of that kind | `knightwatcher: the device kind camera of the prop set kw.example/props.neon is drawn from the base world's: it threw while drawing: <message>` |
| a member of the cast | a critter's `draw` and `dead`, a patron's `draw` and `mouth`, a foe's or a pet's `pose` | the code's member | `knightwatcher: the cast member critter.fly is drawn from code: it threw while drawing: <message>` |
| the word set | the filling of its templates (`quietLine`, `caption`) | the collector's own words | `knightwatcher: the words are the collector's: the word set words.medieval threw while filling: <message>` |

On the call that throws, a drawing draws no more, and a call whose result the engine uses (a
scene's key or the foe's wall, a pose's canvas, a line of words) gives the code copy's. The fault
goes into the part's `faults` with `step: 'draw'` and the reason `the scene camp threw while
drawing: <message>` (`the device kind pi`, `the cast member critter.fly`, `the word set
words.medieval threw while filling`), its source becomes `'code'`, and `source` follows: `'pack'`
while any other part of its kind is still drawn from the pack. A kind of another prop set goes into
`KW.world.devices.faults` as `{ kind, set, reason: 'it threw while drawing: <message>', step: 'draw' }`.
The line is written once, and `status.note` takes it. The message is cut to 120 characters, in
the reason as in the line. Nothing is drawn on the wall about it: the settings screen's status page
lists it under Fallbacks, "Camp: drawn from code. The scene camp threw while drawing: ...", and the
console has the line.

`start()` puts each part in place behind a guard, a copy of it whose functions note the part being
drawn while they run; a held copy (the goblin the engine keeps for its event, the foe's wall it
climbs over) is drawn from the code copy once the part has given way. A throw is put down to the
part only when it comes from the part's own drawing. What a part asks of the engine runs outside
it: the devices a scene's `things` mark draws, the gear at rest and the hot tip, the sleeper and
the Zs, the patron and its speech bubble, the engine's lamp and the lamps' loop. A throw there, or
anywhere else in the engine's own drawing, is not put down to the pack, marks nothing and goes on
as it always has, and so does a throw from a part already on code. A part that throws while it
paints a canvas of its own (a pose, a lamp) has the drawing context it was called with put back, at
an alpha of 1.

A backdrop a part painted, or was painting when it threw, is painted again: `KW.world.changes` goes
up at each `start()` and each part that gives way, and the engine paints its backdrop again when it
changes, as it does when the key changes, counting from before the painting so that a part that
throws while painting is caught too. The settings screen's and the admin page's pictures of the
scenes and the monarchs are kept by a key that holds it too. A device's canvas is kept by its
drawing's `from`, so the code's drawing never shares one with the pack's.

A part stays on code until the page is loaded again. `start()` again keeps it there while the same
version of the pack is in use, with its fault in the status and its line written again; a different
version of the pack, a downloaded one of a higher version among them, is tried afresh. A part of an
earlier `start()` that throws in a held copy gives way to code without touching what the world now
holds.

## Downloaded world packs

Served over HTTP, `main.js` fetches the downloaded packs in `data/packs/`, once at
load, with `KW.knight.fetchPacks(fetch)`, and hands them to `KW.knight.add()`
([library.md](./library.md#downloaded-packs)). When any pack came, it starts the world again at once,
`KW.world.start(KW.packText.concat(<the downloaded texts>), ownVersion === 'dev')`, with every
text, those the page ships with first, and then sets the overlay's properties again (taking off
any the overlay no longer sets), chooses each kind's prop set again and paints its backdrops again.
The owner decided on the switch at once, rather than at the next scene or by holding the first
frame. Only a fetch that brought nothing, or refusals alone, leaves the world as it started.

The same rules hold as for the packs that ship with the page:

- **The signature.** A deployed page reads only signed packs, and a `dev` page unsigned ones too.
- **Two copies of one pack.** A downloaded `kw.medieval` takes the place of the shipped one only
  when its version is higher, as `gather` chooses; one of the same or a lower version is passed
  over.
- **Presets and prop sets.** A downloaded pack that holds presets or prop sets joins the others
  `KW.world` keeps, and `catalogue()` lists it for the settings.
- **Refusals.** A refused downloaded world pack is the knight's to report, as for the packs that ship
  with the page: the knight reads the same texts, writes one line for it and lists it in
  `KW.knight.status.refused` with its file's name. The world writes nothing about it, unless it
  leaves no `kw.medieval` at all, when the scenes' line says the pack was refused at that step.

The admin page does the same from `admin/`: it fetches `../data/packs/`, beside the walls, with
`KW.knight.fetchPacks(fetch, '../')`, adds what came to the knight and starts the world again with
every text ([display.md](./display.md#the-admin-page)).

## What the page lists for the settings

`start()` reads every pack among the texts but the base pack, which the knight reads, with the same
rule for signatures. Besides kw.medieval, it keeps every pack read cleanly, for its presets, prop
sets, scenes, cast, words, overlays, bodies, swatches and items; a refusal of one of them is the
knight's to report, as it reads the same texts. Today the page
ships no other world pack; one placed in `data/packs/` joins them when the world
starts again with it ([Downloaded world packs](./world-loading.md#downloaded-world-packs)). `catalogue()` lists for
the settings what is loaded:

- `worlds`: each preset by the name the settings use, `medieval` for `world.medieval` and
  `<pack>/<id>` for any other, with its display name, its pack, its card's scene, the preset as the
  library read it, and the labels of its word set (`The knight`, `The monarch`, `The cat` for the
  settings screen's pages);
- `sets`: each prop set by name, `medieval` for `props.medieval` and `<pack>/<id>` otherwise, with its
  display name and the kinds it draws;
- `scenes`: kw.medieval's scenes by their long names, `kw.medieval/camp`, each with its `can`,
  whether it is quiet, and the events it hosts (`hosts`);
- `names`: each long name of kw.medieval's parts and the short name it stands for:
  `kw.medieval/world.medieval` for `medieval`, `kw.medieval/patron.b` for `b`,
  `kw.medieval/foe.goblin`, `kw.medieval/critter.fly`, `kw.medieval/pet.cat` for `cat`, `kw.medieval/props.medieval`,
  `kw.medieval/overlay.phosphor`, `kw.medieval/words.medieval` and each scene's long name;
- `homes` and `quiet`: the base world's scene for each condition and its quiet scenes, from
  `world.medieval`;
- for every other pack ([Other worlds](./worlds.md#other-worlds)): in `scenes` and `names.scene` each of its
  scenes in use by its long name, standing for itself, and in `names` each member of its cast in
  use (patrons under `monarch`), each word set and each overlay the same way; `builds`, each body
  by its long name with its name; `swatches`, for each of the user's sets, each swatch by its long
  name with its name; `items`, each item by its long name with its slot; and `titles`, the name of
  each of these parts and of each prop set, which the settings screen shows. For the screen's rows
  it also gives `coats`, each pet in use by its long name with its coats, each `"<pack>/<coat>"` and
  its name; `binds`, each patron in use with the sets it binds (`skin`, `hair`, `robe`, or none, for
  a patron drawn in its own colours); and `gear`, each item with its `grip` (`'one'`, `'two'`, or
  null for an item that is not a weapon), whether it has a plume mount (`plume`) and whether it has
  a rest view (`rest`).

`swatchOf(set, name)` gives the entries of another pack's swatch of one of the user's sets by its
long name, or null: the settings take the patron's skin, hair and robe from it when
`monarch_skin`, `monarch_hair` or `monarch_robe` names one ([page.md](./page.md#the-engines-input)).

Every other world pack's scenes, cast, words and overlay are drawn too, under their long names, and
`catalogue()` lists them: see [Other worlds](./worlds.md#other-worlds).

**The devices per kind.** The prop set `props` names draws every kind; `[look.devices]` names a set
for one kind over it. `useKinds(choice)`, given `{ pi: name, camera: name, ... }` as the settings
resolve it, puts in `KW.kinds` each kind's drawing from its set, compiled the first time it is asked
for and kept. A kind left out, or named `medieval`, takes the base world's drawing: the medieval
set's, or the code's where that kind failed to compile. A kind whose set is not loaded, does not draw
that kind, or fails to compile takes the base world's too, and `KW.world.devices`, `{ choice, kinds,
faults }`, says where each kind is drawn from and lists each fault as `{ kind, set, reason }`: `the
prop set kw.example/props.neon does not draw it`. A kind no set draws at all, which only a kind the
contract does not know can be, is drawn as `box` by the engine. `start()` ends with every kind from
the base world, and `main.js` calls `useKinds()` whenever the settings change the choice. A compiled
kind's `from` names its pack and the compile, so the engine's still-part canvases keep one set's
drawing apart from another's. `drawingOf(name, kind)` gives one set's drawing of one kind, or the
reason it cannot, without touching `KW.kinds`: the settings screen draws its device rows from it
([display.md](./display.md#the-settings-screen)).

## Two copies, held equal

Each converted scene is drawn by two copies: its code in `js/scenes/`, the fallback, and its data in
`kw.medieval`. They must draw the same thing, and the tests hold them to it:

- `tests/web/scenes.test.js` draws every scene `kw.medieval` gives a second time, compiled from the
  pack, in every recorded state at 960 by 600, 1400 by 600 and 960 by 720, against the same stored
  records the code scene is held to. The records were stored from code, and only from code; the pack's
  copy is never stored.
- The backdrop's key is not in the records, so the same test checks that the compiled scene's key
  tells the recorded states apart exactly as the code scene's does: two states share a key from the
  pack when, and only when, they share it from code. The keys themselves may differ. The check walks
  every scene the pack gives, so each later scene comes under it as it is added.
- The same test checks that the compiled scene gives the code scene's interface: the same spot,
  places, rests, rounds, `can`, weapon and helmet, `outdoors`, `foeZone`, `crate` and the `target` a
  shot aims at, and the same parts drawn, `wallAt` and `struck` among them.
- An act changes the knight's pose and the drawing from one moment to the next, and the target's
  keeps the time of its last blow from one frame for the next, so `tests/web/world-scenes.test.js`
  also runs every scene of the pack that has a `target`, an `anvil`, a `bed`, a `screen` or a `seat`
  frame by frame beside its code scene, and compares every call (`over`'s among them), every change
  to the knight's pose, after the act and after the draw, and `strike`: the target's every 10 ms through two training rounds while all is quiet
  and while the CPU runs hot, the anvil's every 10 ms through five blows of the hammer, idle and while
  updating, at the spot and at x 300, and the house's every 10 ms for 8.4 seconds asleep at night,
  sick in bed, with the television on while streaming and with it off while all is quiet, and the
  court's every 10 ms for 12.8 seconds, two rounds of its talk, while a shell is open and while all
  is quiet.
- `tests/web/knight.test.js` draws the house and the smithy from code with the knight's gear at
  rest, and `tests/web/world-knight.test.js` runs its checks on the two from the pack: the house
  painted with the television on and off and drawn asleep, unwell, with the helmet off and on, and
  the smithy painted at two spots and drawn at two moments, against the knight's stored records,
  with the knight from code and from the base pack; the same calls as the code scenes in the base
  pack's other looks (the arming sword and the shield, Broad and Slim); the backdrop keys, which
  name the gear; the rests, places and rounds; the pegs under the arming sword's blade; no hot tip
  for a weapon without a blade; and no shield on the wall when its rest view does not fit there.
- The records sample five moments, which cannot pin down where a blink starts and stops, so
  `tests/web/world.test.js` draws the battlement's sparks every 25 ms over four seconds, and at the
  edges of the blink, against the code's `Math.floor(t / 150) % 3 === 0`, and compares `wallAt`
  with the code scene's at every whole x from -1 200 to 2 400.
- `tests/web/world-scenes.test.js` runs the checks of `foe.test.js` and `places.test.js` that depend
  on a scene on each scene the pack gives, compiled from it, with the goblin from the pack's cast:
  the goblin's way in, where it stands, its hit and the blade against it in every scene that hosts a
  foe, and the places of the devices on the grid and clear of each other. It also holds the foe's
  whole plan in a scene from the pack, for every weapon and build, to the plan in the code scene with
  the code's goblin, and each scene's `quiet` and `hosts` to the
  engine's and the settings' lists. The two older files draw the code scenes and stay as they are.
- `tests/web/world-cast.test.js` draws the fly from the pack's cast beside the code's, both frames
  and what falls, at whole and fractional points, and runs the engine's frames every 20 ms for 4.6
  seconds while six flies fly in, hover, are swatted and fall, once with the cast from the pack and
  once from code, comparing every call of every frame. It holds the goblin from the pack to the
  code's: its measures, each pose's canvas call for call, painted once, and the engine's frames every
  20 ms through the whole event at the battlement and at the camp, the goblin's canvases written out
  call by call. It draws each monarch from the pack beside the code's, its still parts and its mouth
  shut and open, in every skin with every hair (as drawn among them) and the robe turning through
  every choice, and in every robe alone, 165 looks call for call; checks that the brows come out by
  contrast both ways; and that the court draws the patron `KW.cast` gives and keys its backdrop on
  where the patron comes from. It checks too where the cast is drawn from on a `dev` and a deployed
  page, a page without the compiler, that the engine plays the foe `KW.cast` gives with the exit it
  names, a member that fails to compile and one the engine does not know, and what the compiler
  refuses in the cast. `tests/web/scenes.test.js` draws the pack's fly and the goblin's six poses
  against the stored records of the code's, `cast.json`, and the court from the pack, with its
  monarchs from the pack's patrons, against `court.json`, all 522 of them; and
  `tests/web/world-scenes.test.js` runs the goblin checks of `foe.test.js` on the pack's goblin, the
  blade against the drawn pixels of its poses among them.
- `tests/web/world-props.test.js` draws every kind of device from the prop set beside the code's
  drawing of it, through the engine's `KW.devices`, in every place of every scene (the court's among
  them), up and gone, with and without its question mark, at seven moments, 13 720 drawings compared
  call for call; each kind's still and moving parts drawn alone in every place; and the moving parts
  every 25 ms through two of the up loop and three of the down one. It checks too where the devices
  are drawn from on a `dev` and a deployed page, a kind that fails to compile, a page started again
  from code, the pie's lamp's canvases painted once with the lit drawing over the dark one, and what
  the compiler refuses in a prop. `tests/web/scenes.test.js` draws the scenes from the pack with the
  devices from it too, against the records stored from code.
- The words and the overlay have no copy in code to hold equal: without them the page shows the
  collector's text, and `display.css` writes out the overlay's colours as its fallback.
  `tests/web/world-words.test.js` holds the two together, each property the overlay sets against
  the fallback `display.css` gives it, and checks that `display.css` writes no colour of the overlay
  but through them. It checks the joining rule (the first template with its values, the last part
  shortened, then dropped, the first cut at the limit with the ellipsis, 52 and 44 at their edges,
  code points and white space, a missing value or kind, no parts and no words), each caption and the
  quiet line from the medieval words, that `main.js` writes them with `textContent`, where the words
  and the overlay come from on a `dev` and a deployed page, one of them failing to compile, what
  `compileOverlay` refuses, and the demo's parts, texts and lines.
- `tests/web/world-loading.test.js` holds loading and failure, as `tests/web/loading.test.js` does
  for the base pack: a page without `kw.medieval` drawing every scene, device and member of the cast
  from code without a throw; the pack refused unsigned on a deployed page and with a signature that
  does not verify; a part that fails to compile; a scene whose still or moving layers throw, a kind
  of device, the fly, the goblin, a monarch and the cat each throwing, caught, and the engine's
  frames from the next frame the same, call for call, as those of a page where that part alone
  failed to compile; a kind of another prop set giving way to the base world's; the word set
  giving way to the collector's words; a throw in the gear at rest, the speech bubble or the
  engine's lamp not put down to the pack; a part already on code not caught; the status page's
  lines; a restart keeping a part that threw with the same version and trying it afresh with
  another; a downloaded `kw.medieval` of a higher version taking the place of the shipped one, and
  one of the same or a lower version passed over; a downloaded one refused on a deployed page and
  reported by the knight alone, once; a downloaded world pack joining the catalogue; the backdrop
  painted again after a restart; `main.js` and the admin page starting the world again; and the
  admin page's scripts, which must be the walls' own but `demo.js` and `main.js`, in their order.
- The screenshots of the repository's own page, a `dev` page, draw every scene, device and member of
  the cast from the pack, and show the medieval words. To shoot the code path, take a pair of sets from a copy of `web/` whose `kw-version` is not
  `dev`, as for the knight ([tests.md](./tests.md#the-pages-tests)).

**A change to the medieval art is made in both copies, in the same commit.** Change the code scene
(or the device or the cast member in `props.js`) and the pack together, write the carrier again with `node tools/pack-carrier.js`, store the records
again from the code if the scene is meant to look different (`SCENES_LOG=write`, see
[tests.md](./tests.md#the-pages-tests)), and the pack's copy must then draw the new records. A pack edited after
it is signed needs a signing run again ([development.md](./development.md#signing-the-packs)).

`tests/web/world.test.js` checks the rest: that the pack reads clean with the costs above, where a
`dev` and a deployed page draw every scene from, the console lines and
the status, the long names, a compile that throws for one scene or for all, the predicates and the
key, the terms and the colours' spelling, `outdoors`, `foeZone`, `wallAt` and `crate` from `hosts`, `foe` and `crate`,
the keyframes' clock with a phase and played once, an ell's clip and a tile's picks, the target's
act with its blow, its wobble and its straw, the rests and their angles, the rest mark in a still
and a moving layer and the key it adds to, the anvil's act against the code smithy's every 10 ms
over nine seconds with its sparks and its hot tip, the `dx`, `dy`, wave and palette tracks, the
house's screen, its sleeper with the ice bag and the blanket's breath, the Zs at night, the pegs
from the blade and the stamp a rest names, a rest view held to its place, the pack library's rules
for `targetDx` and `spot`, and that what the compiler does not build is refused by name.
