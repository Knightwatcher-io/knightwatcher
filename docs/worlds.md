# Worlds

A world is everything round the watcher: the scenes, the supporting cast, the drawings of the
devices, the words and the overlay, and a preset that names one of each. The watcher is the figure
that mirrors the homelab, and in the medieval world it is the knight ([design.md](./design.md#terms)).
This page is for anyone making a world pack. It gives format 1.1, the version of the pack format
that carries a world as data, its sections, costs and limits, the words, the overlay and the
presets, and what happens when the settings mix parts of different worlds; format 1.2, which
adds weapons and foes that fire; and format 1.3, which adds a scene's quench and bellows. Format 1.0, the checks
and signing, which hold for every pack, are in [packs.md](./packs.md).

| Part | Section | Described in |
|---|---|---|
| scenes | `scenes`, with `stamps` for shapes they share | [scenes.md](./scenes.md) |
| the patron, foes, critters and pets | `cast` | [cast.md](./cast.md#the-cast) |
| the devices' drawings | `props` | [cast.md](./cast.md#the-devices) |
| the quiet line's and the captions' words, the settings screen's labels | `words` | [below](#words-and-the-overlay) |
| the colours and the font of the words over the scene | `overlays` | [below](#words-and-the-overlay) |
| one of each part, chosen as a whole | `worlds` | [below](#worlds-as-presets) |
| the watcher's body, outfit and colours | `builds`, `items`, `swatches` | [packs.md](./packs.md) |

The page ships one world, the medieval world, in its own pack, `kw.medieval`, beside the base pack
that holds the knight. It is the base world: every part a page cannot find elsewhere comes from it.
The medieval world's pack holds all seven scenes (the battlement, the camp, the yard, the cellar,
the smithy, the house and the court), the devices as the prop set `props.medieval`, the cast (the
three monarchs, the goblin, the fly and the mouser cat), the words, the overlay and the preset
`world.medieval` ([The medieval world's pack](#the-medieval-worlds-pack)). The page builds the
quiet line and the events' captions from the parts the collector sends, in the world's words, and
takes the colours and the font of the words over the scene from the world's overlay. Version
0.10.0, which adds the patrol, the television in every scene and the devices' resting places
(format 1.4), ships unsigned until its signing run, so a `dev` page draws everything from it and a
deployed page draws every scene, device and member of the cast from code meanwhile.

Any other world pack the page loads, shipped beside it or downloaded into `data/packs/`, reaches
the wall through the settings: its scenes, cast, words, overlay, body, swatches and items, under
their long names, `<pack id>/<id>` ([Other worlds](#other-worlds)). A deployed page reads only
packs signed with the project's key, and a `dev` page unsigned ones too
([packs.md](./packs.md#signing)). How the page loads a world, and what it draws when a part is
refused or throws, is in [world-loading.md](./world-loading.md); a small world made for the tests,
`test.orbit`, proves that every part can be swapped ([tests.md](./tests.md#the-test-world)).

## Format 1.1

Format 1.1 adds the sections a world needs: the scenes, the supporting cast, the drawings of the
devices, shared shape groups, flavour words, the overlay's look and presets that name one of each.
The library reads `[1, 1]` beside `[1, 0]`, [`[1, 2]`](#format-12) and [`[1, 3]`](#format-13), and
refuses `[1, 4]` and anything newer at the `format` step (`pack.format: is 1.4, newer than this
engine's 1.3`). It checks
every new section by the same steps as the rest, in the same order, and keeps it as data in the
loaded pack's `data`.

**`read()` compiles nothing of these sections:** it checks them and keeps them as data. The scene
compiler, `web/js/world.js`, compiles a scene of a loaded pack into the scene interface, and the
page draws every scene from the medieval world's pack that way, with its devices from its prop set
and its monarchs, goblin and fly from its cast, builds the quiet line and the captions in its words,
takes the words' colours from its overlay, resolves the settings against its presets and draws
each kind of device from the prop set chosen for it. The closed lists those parts own are fixed in `pack.js` under the names below and exported
as `WORLD_LISTS`. The effects library is built: `effects.js` gives each effect's table of fields and
cost, which `pack.js` checks and costs a pack's effects by, and draws them for the scenes
([page.md](./page.md#the-effects)).

A pack of format `[1, 0]` reads exactly as before: none of the new sections is a field of it, only
the base pack may carry builds, and `pick` and `lamp` are free as palette set names.
`tests/web/base-read.test.js` holds the base pack's whole read, its signed bytes and six of its looks
equal to a copy stored from the library before format 1.1.

What 1.1 changes for the sections 1.0 has:

- any pack may carry `builds`, each with its head item in the same pack, as in 1.0; `defaults` stays
  the base pack's alone;
- `pick` and `lamp` are reserved set names: a pack's own palettes may not take them;
- items, rest views and decorations read exactly as in 1.0.

### The sections

| Section | Holds | Each, at most |
|---|---|---|
| `stamps` | named lists of shapes, drawn where a `use` shape puts them | 64 per pack, 64 shapes each |
| `scenes` | backdrops, moving parts, places, what each scene can act | 16 per pack |
| `cast` | patrons, foes, critters and pets | 16 per pack |
| `props` | prop sets: a drawing for each kind of device | 8 per pack |
| `words` | flavour lines and the settings screen's labels | 8 per pack |
| `overlays` | the overlay's colours and font | 8 per pack |
| `worlds` | presets, one of each part | 8 per pack |
| `sounds` | reserved: checked to be an object, signed, never read | |

Ids in each section match the local pattern, `^[a-z][a-z0-9.-]{0,47}$`. The counts per pack are
checked at `counts`, as for items and decorations.

### Costs and limits

A world shape costs what the 1.0 measure gives, at the ends of every value's range, the screen's
edges included. A glow costs 3 and counts toward the glows; a `dith` its dots; a `use` its stamp's
shapes; a tile its shapes times the most repeats its range allows; a mark nothing, since the engine
counts its own drawing, but a `rest` mark for the weapon at a frame that names a stamp, which costs
the stamp's shapes twice, for the two the engine draws; an effect what its own cost function in `effects.js` gives for its fields
at the ends of their ranges, 3 for each glow among it, which also count toward the glows. A band
list of the user's skin counts as 8 bands, here as in 1.0, a pick, a mix, a contrast, a colour drawn and dressed and the down lamp as one
colour.

| What | Limit |
|---|---|
| a scene's still layers | 2 000 shapes and 200 000 fills, tiles and stamps counted out |
| a scene's moving and over layers, in one frame | 400 shapes, 16 000 fills and 24 glows; the pole counted once under each of the three high places |
| layers, tiles and effects in a scene | 32, 64 and 48, effects counted out of their tiles |
| a patron | 16 000 for its still parts, 400 for each mouth |
| a foe | 8 000 for each pose, its parts included |
| a critter | 200 for each frame and for what falls |
| a pet | 8 000 for each pose of each coat, its stamp's shapes |
| a kind | 4 000 for each state's still part, 600 for its moving part and its own lamp |

`WORLD_LIMITS` in `pack.js` holds these. A loaded 1.1 pack carries `world`, the costs the counts
step found: each scene's still and frame shapes, cost and glows, each cast member's, each kind's
and each stamp's. The depth of nesting stays 12 and is checked before the format, so a world pack
must keep within it: a hash or a wave in a point of a tile's shape would sit 13 deep and is refused
at the `json` step, while one in a length of a tile's shape, or in a point outside a tile, is not.

`tests/web/format-1.1.test.js` checks all of this; see [tests.md](./tests.md#the-pack-librarys-tests).

## Format 1.2

Format 1.2 adds what a world needs for weapons that fire, on the same terms as 1.1: everything it
adds is a field a pack of 1.0 or 1.1 does not have, refused there at `fields`, and a pack of 1.0 or
1.1 reads exactly as before on a page of 1.2. `tests/web/base-read.test.js` holds the base pack's
read to the copy first stored before format 1.1 (the base pack moved to format 1.2 for its crossbow
in 1.5.0, and every look stored before it kept its records and costs), and `tests/web/orbit-swap.test.js` holds the test
world's 1.1 file to the same read on a library of format 1.1 as on this one. A page of format 1.1
refuses a pack of 1.2 at the `format` step (`pack.format: is 1.2, newer than this engine's 1.1`), and
every part that pack would have set takes the base world's. What 1.2 adds:

- on a `main` item, `use`, `barrel`, `muzzle`, `range`, `shot` and `stowed`
  ([packs.md](./packs.md#weapons-that-fire));
- on a foe, `fires`, and a seventh pose, `aim` (below);
- the engine's effects `flash`, `bolt`, `tracer` and `beam`, which the engine draws for a weapon or
  a foe that fires, in its shot's colours; a scene does not name them
  ([scenes.md](./scenes.md#the-effects)).

A foe that fires carries `fires`, `{"muzzle", "shot"}`: `muzzle` a pair in the foe's own
coordinates as it is drawn facing left, mirrored with the foe, which must lie inside its sprite;
`shot` as a weapon's, `{"kind", "colour", "flash"}` with `flash` optional. It must give the pose
`aim` beside the six every foe gives, which the engine plays in place of the taunt. Both are
checked at `rules`, and the pose is costed with the others at `counts`. A foe without `fires` may
give `aim` too, and is then never asked for it.

```json
"foe.glitch": {
  "role": "foe", "name": "Glitch", "...": "as every foe",
  "fires": { "muzzle": [-76, -83], "shot": { "kind": "tracer", "colour": "#ff8fb0", "flash": "#fff3a0" } },
  "poses": { "stand": {}, "...": "the six", "aim": { "parts": ["body"], "shapes": ["..."] } }
}
```

The loaded pack keeps `fires` and `aim` in its `data`, and the counts step's `world.cast` gives the
aim pose's cost after the other six. The scene compiler compiles `aim` and paints it once as it
does the six, and the foe player plays it: the foe aims from 1 230 ms and fires once at 1 350,
before the watcher strikes. The watcher is never hit. The shot misses over the watcher's head, or
stops at the shield's face with a spark when a shield is carried and the foe is on the shield's
side, the left; the watcher's eyes go wide for 200 ms as it passes. A foe on the right misses
overhead even with a shield carried. [page.md](./page.md#the-acts-with-a-weapon-that-fires) gives
the timings and [cast.md](./cast.md#the-cast-on-the-page) the compiled foe.

`tests/web/fire.test.js` checks the fields and rules of 1.2, and the test world has a copy of
format 1.2 with a weapon of each use and a foe that fires; see
[tests.md](./tests.md#the-test-world).

## Format 1.3

Format 1.3 adds two parts a scene may give for acts the format could not name before, on the same
terms as 1.2: each is a field a pack of 1.0 to 1.2 does not have, refused there at `fields` by name
(`pack.scenes.smithy.bellows: is not a field here`), and a pack of 1.1 or 1.2 reads exactly as
before on a page of 1.3. A page of format 1.2 refuses a pack of 1.3 at the `format` step, and
every part that pack would have set takes the base world's. What 1.3 adds, on a scene:

- `quench`, `{ "water": [x, y], "stand": [fire, water] }`: the quiet act, the watcher heating a
  blank in the fire, carrying it to the water and quenching it. `water` is where the blank goes in,
  on the grid, its y the water's face; `stand` the watcher's x at the fire and at the water, each a
  whole number from 0 to 960. The act plays while all is quiet;
- `bellows`, `{ "stand", "handle": [x, y], "travel", "div" }`: the act of the CPU running hot, the
  watcher pumping a bellows. `stand` is the watcher's x (0 to 960), `handle` the middle of the
  handle's crossbar with the bellows open, `travel` how far it goes down pressed (1 to 120) and
  `div` the pump's period over 2 pi, in ms (32 to 10 000): the bellows are pumped once every 2 pi
  times `div` ms, the period of a `wave` of that `div`, so that a glow of the scene keeps time with
  the pump. The act plays while the CPU runs hot, and the scene's `can` lists `cpu_hot` for it;
- the named value `pump`, how far the bellows are pressed, 0 open and 1 pressed, which a moving or
  over layer of a scene with `bellows` may lean on. Its coefficient is the travel of a point, a
  multiple of 1/8 within an offset: `{ "c": 409, "pump": 30 }` is a point that stands at 409 open
  and 439 pressed. Anywhere else it is refused at `references` by name.

How the acts play, and what the engine draws for them (the steam, the rings on the water, the drips
and the glint), is in [scenes.md](./scenes.md#how-a-scene-compiles). `tests/web/world.test.js`
checks the parts and `pump`, and their refusal in 1.1 and 1.2.

## Format 1.4

Format 1.4 carries the knight's patrol, the television in every scene and the devices' resting
places, decided by the owner on 25 November 2026. As before, a field a pack of 1.0 to 1.3 does not
have is refused there at `fields` by name (`pack.scenes.battlement.tv: is not a field here`), a pack
of 1.1 to 1.3 reads exactly as before on a page of 1.4, and a page of 1.3 refuses a pack of 1.4 at
the `format` step, so that every part it would have set takes the base world's. What 1.4 adds:

- on a scene, `tv`, `{ "x", "stand", "watch" }`: where the television stands while something
  streams, what it stands on (`table`, `crate`, or `none` where the scene draws its own set), and
  where the watcher watches it from ([scenes.md](./scenes.md#what-a-scene-can-act));
- the round act `quench`: one loop of the scene's quench at that stop of the patrol, which needs the
  scene's `quench`. A scene with a `quench` and no such round plays it while all is quiet, as in 1.3;
- a scene with an `anvil` gives its `rounds`, and the watcher patrols there too: the engine walks
  it back to the spot, which the anvil counts from, before the hammer plays;
- on a prop set, `tv`, its television, drawn in every scene that stands one
  ([cast.md](./cast.md#the-television)); a set that gives none leaves the base world's;
- the ground class box 24 taller, `[-66, -117, 56, 2]`, room for the scrying crystal on its stool. A
  pack of 1.0 to 1.3 keeps `[-66, -93, 56, 2]` for its places and its kinds, so a world whose places
  only just clear the old box is not refused; a kind's `mark` may be up to 184 in every format;
- `streaming` plays in the quiet scene of the moment, as `device_down` does: a preset's
  `scenes.for` names no scene for it, and each of its quiet scenes lists it in `can`, which needs a
  `screen` or a `tv`. A preset of 1.1 to 1.3 still names one, which the page reads and passes over,
  since every quiet scene acts it now.

The effect `picture`, a television's picture, is the engine's, as every effect is, and so any
format from 1.1 may name it; a page from before it refuses it at `fields`.
`tests/web/world.test.js`, `tests/web/format-1.1.test.js` and `tests/web/patrol.test.js` check the
parts and their refusal before 1.4.

## Words and the overlay

A word set is `{ name, watcher, labels, quiet, captions }`, `name` (1 to 48 characters) and
`watcher` (1 to 32) required. `labels` names any of `watcher`, `patron`, `build`, `tabard`, `plume`,
`helmet`, `foe`, `critter` and `pet`, each 1 to 32 characters. `quiet` gives templates for the parts of the
quiet line, `captions` for the events, each 1 to 8 templates:

| Part | Placeholders |
|---|---|
| quiet: `quiet` | none |
| quiet: `up` | `{n}` |
| quiet: `backup` | `{at}` |
| quiet: `ads` | `{n}`, `{short}` |
| captions: `ip_banned` | `{addr}`, `{jail}` |
| captions: `import` | `{title}` |
| captions: `backup_done` | `{at}` |

A template is 1 to 32 characters of printable ASCII and `·`, every brace part of a placeholder. A
placeholder its part does not give is refused at `references`. The templates of a part run longest
first, by the text outside their placeholders, at `rules`.

An overlay is `{ name, font, levels, outline, scrim, caption }`, all required, `name` 1 to 48
characters. `font` is one of the
fonts the engine ships, today `vt323`; there is no field for a font file or font data. `levels`
gives exactly `ok`, `warn`, `crit`, `info` and `sleep`, each two hex colours, `outline` and `scrim`
are hex and `caption` a literal colour. At `rules` each level's two colours keep the status's hue and
contrast on black (WCAG's), and `sleep`'s are darker than `ok`'s:

| Level | Hue | Contrast |
|---|---|---|
| `ok` | 110 to 160 | 6 or more |
| `warn` | 28 to 55 | 6 or more |
| `crit` | 345 to 15, through 0 | 6 or more |
| `info` | 180 to 215 | 6 or more |
| `sleep` | 110 to 160 | 3 to 6 |

The page builds the quiet line and the captions from the collector's parts in a word set, and sets
an overlay's values as CSS custom properties; [worlds.md](#the-words-and-the-overlay-on-the-page)
describes both.

### The words and the overlay on the page

The collector writes the quiet line and each event's caption whole, in plain words, and beside them
sends the parts they were written from ([state.md](./state.md)): `quiet_parts` beside `quiet_line`,
as `[{ "k": "quiet" }, { "k": "up", "n": "29" }, { "k": "backup", "at": "03:12" }, { "k": "ads",
"n": "4,812", "short": "4,812" }]`, and `parts` beside an event's `text` for a ban (`addr`, and
`jail` when it has one), an import (`title`) and a finished backup (`at`). Every value is a string
the collector has formatted, in its time zone and with its separators, so the page only chooses
words and joins. A part is sent whenever the collector had the reading, even when its own line had
no room for it.

**The words.** A word set gives each part a list of templates, longest first. `KW.world.join(parts,
sets, limit)` builds a line from them:

- each part takes the first of its templates whose placeholders it has values for; a template that
  names a value the part lacks, or gives empty, is passed over for the next, and a part with none
  left is passed over;
- the parts are joined with ` · `, and while the line is longer than `limit` the last part takes its
  next template, and with none left is dropped, then the part before it the same way. This is the
  rule of the collector's `quiet_line()` and `text.join_fitting()`;
- the first part is never dropped. Alone and still too long it is cut, as the collector's
  `text.clip()` cuts a caption: to `limit - 1` characters, white space trimmed, and `…`;
- runs of white space are made single, and characters are counted by code point, as Python counts
  them.

`join` gives `null` when the set has no templates for a kind of part that was sent, or no part can
be written. The quiet line is joined within 52 characters (`quietLine`), and a caption, one part
of the event's type, within 44 (`caption`). Either one shows the collector's text as it is when
there are no parts (an older collector, or an event without them), no words in use, or `join`
gives `null`. So the medieval words give `ALL QUIET · 29 up · backup 03:12 · 4,812 ads slain`
where the collector wrote `... 4,812 ads blocked`, `BANISHED 203.0.113.77 · sshd` for `BANNED
203.0.113.77 · sshd`, `DELIVERED · <title>` for `IMPORTED · <title>` and `STORES SAFE 03:12` for
`BACKUP DONE 03:12`. A count too long for the line takes its short form, `1.2M ads slain` for
1,234,567, before it is dropped. `main.js` writes the result with `textContent`, never as markup. The
headline, the detail and the "+N MORE" badge are always the collector's, and so are the detail
line of `streaming` and the streams' badge: the page builds them from `facts.streams` in the
collector's own words, in `KW.state.streamWords` alone, and a word set has no templates for them
([page.md](./page.md#the-words-over-the-scene)).

`labels` name the settings screen's pages in the world's terms: the watcher's page is "The knight"
and the patron's "The monarch" in the medieval world, and the engine calls the pet by its label in
its note, `the cat is hunting`. A label the set leaves out keeps the page's own, and a role whose
part comes from a world other than the words' is called by its plain name. `watcher`, the phrase for
the watcher inside a sentence, is checked and carried in the compiled set, and nothing reads it yet.

**The overlay.** `compileOverlay` turns the overlay into CSS custom properties, which `main.js`
sets on `#surface` once at start-up and `display.css` reads:

| Property | From | Read by |
|---|---|---|
| `--kw-ok` to `--kw-sleep`, `--kw-ok2` to `--kw-sleep2` | each level's two colours | each level's `--fg` and `--fg2`; `--kw-warn` and `--kw-crit` also colour the "+N MORE" badge, and `--kw-sleep2` the streams' badge |
| `--kw-outline` | `outline` | the words' outline, `text-shadow` |
| `--kw-scrim` | `scrim`, as `r,g,b` | the scrim's gradient stops, whose alphas stay in `display.css` |
| `--kw-caption` | `caption` | the caption's background |
| `--kw-font` | `font`, from the fonts the engine ships (today `vt323`) | the display's `font-family` |

The library has checked the values and held each level's colours within the status's bands of hue
and contrast ([Words and the overlay](#words-and-the-overlay)); `compileOverlay` checks their form again,
so that nothing but a six-digit hex colour, an `rgba()` it writes itself or a font of its own list
reaches the style. A pack never supplies CSS. `display.css` gives each property's value today as
its fallback, `var(--kw-ok, #39ff6a)`, for a page without the overlay. The overlay
`overlay.phosphor` holds the same values, so the screen is the same either way.

What the compiler does not build in the words and the overlay, it refuses by name: a font the
engine does not ship. Everything else the library has already refused.

## Worlds as presets

A preset, in `worlds`, is `{ name, body, outfit, scenes, cast, props, overlay, words, picture }`,
with the reserved `sound` and `companion` (objects, never read). `name` is 1 to 48 characters,
`body` names a build, `outfit` its `items` by slot and its `swatches` by set, `scenes` its `quiet`
scenes and the scene `for` each condition, `cast` its `patron`, `foe`, `critter` and `pet`, and
`picture` the scene the settings screen draws the world's card from. A name in it is a local id or
`<pack id>/<id>`. A local name, or one that names this pack by its id, must exist here, of the right
slot or role, at `references`; one that names another pack is checked for its form alone.

A preset must be complete, at `rules`: every field above; `outfit.items` for each of `legs`,
`boots`, `torso`, `hair`, `plume`, `helmet`, `pauldrons`, `arms`, `gauntlets` and `main`, and for
`back` and `off` if it gives them, and no other slot; `outfit.swatches` for the four sets;
`scenes.quiet`, 1 to 16 scenes, each once; `scenes.for` naming a scene for every condition except
`device_down` and `memory_tight`, and from format 1.4 `streaming`, which have none and play in the
quiet scene of the moment; and a patron, a foe, a critter and a pet. Each of this pack's scenes it
names must be able to do what it is named for: a quiet scene is `quiet` and lists `device_down` and
`memory_tight` in `can`, and from 1.4 `streaming` too, and a condition's scene lists the
condition. `memory_tight` is retired: Under strain (`cpu_hot`) covers
memory, playing in `cpu_hot`'s scene, and the page never acts `memory_tight` on its own. The
format keeps it, so that the signed packs and a user's own that list it still pass; a new pack
may list it or not, and it changes nothing on the wall.

### Presets on the page

`kw.medieval`'s preset, `world.medieval`, is the medieval world, which the settings call
`medieval`: the base world, and the page's own level ([display.md](./display.md#worlds)). Its outfit is
the base pack's `defaults`, its quiet scenes the five the code turns between (`TURNS` in
`engine.js`, `SCENES` in `settings.js`), and its scene for each condition the one
`KW.state.CONDITIONS` gives; `tests/web/worlds.test.js` holds the three equal. While the pack gives
the preset, `KW.settings.pageWorld()` takes the base world's scenes from it; without the pack, from
the code, so with nothing set the display is the same either way.

How the page reads the presets, prop sets and other parts of every loaded pack, and lists them for
the settings, is in [world-loading.md](./world-loading.md#what-the-page-lists-for-the-settings).

## Other worlds

A world pack other than `kw.medieval`, shipped with the page or downloaded into `data/packs/`, is
drawn whole once the settings choose its world or any of its parts. `start()` reads it under the
knight's rule for signatures and puts its parts in place under their long names, `<pack>/<id>`:

| Part | Where it goes | Chosen by |
|---|---|---|
| each scene | `KW.scenes['<pack>/<scene>']`, compiled and guarded as kw.medieval's are, not enumerable | the preset's `scenes.quiet` and `scenes.for`, `[quiet] scenes`, `[scenes]` |
| each member of the cast | `KW.cast.<role set>['<pack>/<member>']` (`patrons`, `foes`, `critters`, `pets`), not enumerable | the preset's `cast`, the look's `monarch`, `foe`, `critter` and `pet` |
| each word set and overlay | compiled and kept, for `useWords()` and `useOverlay()` | the preset's `words` and `overlay`, the look's keys of those names |
| each prop set | compiled kind by kind when first chosen, as before | the preset's `props`, `[look.devices]` |
| its bodies, swatches and items | read by the knight, which reads the same texts | the preset's `body` and `outfit`, the look's `build`, `skin`, `hair`, `tabard` and `plume`, `[look.items]` |

Not enumerable means the engine and the settings, which list the base world's scenes and cast by
their short names (the quiet scenes in turn, the first pet when none is named), see no more of them
than before; a long name reaches its part all the same. With nothing set the display is exactly as
it is without the pack, which `tests/web/orbit.test.js` checks frame by frame.

The engine plays what the settings resolve. The quiet scenes in turn and each condition's scene
come from `turns`, `scenes` and `homes` as before, long names among them. The foe of the banned
address's event is the one the input's `foe` names, the critter a blocked advert becomes the one
its `critter` names, the patron on a seat and the pet the ones `patron.id` and `pet.id` name; each
the base world's (the goblin, the fly, monarch A, the cat) when `KW.cast` does not hold the one
named. An event plays in a scene that hosts it, by the scene's `hosts`. A pet's spots are keyed by
the long names of its pack's scenes, so another world's pet rests and catches in its own world's
scenes and gives its flies to the watcher in a scene where it has no spot, as the cat does in the
cellar. `main.js` puts the chosen words and overlay in use with `useWords()` and `useOverlay()`
whenever the settings change them, and sets the overlay's properties on the display again; a set
not loaded, or `'medieval'`, gives the base world's.

The watcher's body may be another pack's: `KW.pack.resolve` takes a build from any loaded pack
(format 1.1 lets any pack carry builds), with that build's own head item, and items and swatches
from any loaded pack as before. A throw in the head's list is put down to the pack that gave the
build.

`KW.world.others` holds what `start()` found: `packs`, each `{ id, version, signed }`; `parts`, each
part by its long name, `'pack'`, or `'code'` once it has failed or given way; and `faults`, each `{
part, reason }`, with `step: 'draw'` for one that threw. A part that fails to compile is left out,
with a line, `knightwatcher: the scene test.orbit/deck is not drawn, and the base world's is used:
it could not be compiled: <reason>` (`console.warn`), so the settings find it not loaded and give the
base world's part, listed in their `faults`. A part that throws while drawing is caught for that
frame as a part of kw.medieval is ([When a part throws](./world-loading.md#when-a-part-throws)) and taken out from
the next, with the line `knightwatcher: the scene test.orbit/deck is not drawn, and the base world's
is used: it threw while drawing: <message>`; on the call that throws, a value the engine uses (a
foe's pose) is the base world's member's. It is remembered by its pack's id and version, so a
restart with the same version keeps it out. The status page lists each under Fallbacks, "test.orbit/deck:
not drawn, so the base world's is used. ...", and its Parts entry names the other pack where a part
in use comes from it.

## When parts of different worlds meet

The settings may mix parts of different worlds, and every part a world gives fits every other
world's by the standard sizes the checks hold it to. What the page does when they meet:

| Meeting | What happens |
|---|---|
| a body from one pack, items from another | drawn together: every item fits every build's ranges |
| devices in another world's scene | they stand in its places; a kind the chosen prop set lacks takes the base world's drawing |
| a patron on another world's seat | it sits on any seat, the medieval court's throne among them, in another pack's colours where it binds the user's sets |
| a pet in another world's scenes | it rests and catches in its own world's scenes, and gives its flies to the watcher where it has no spot |
| a foe in another world's scene | it plays in any scene that hosts it and gives it room, over the scene's wall or out of its ground |
| gear at rest in a place it does not fit | not drawn there ([scenes.md](./scenes.md#how-a-scene-compiles)) |
| a condition given a scene from another world | it plays there, when that scene lists the condition in `can`, by `[scenes]` or by a world's preset |
| a condition with no scene in the chosen world | it plays in the base world's own scene for it, which always exists |
| a part named but not loaded | the base world's part |
| words without a template for a part | the collector's own line |

So two styles may share a screen: a condition with no scene in the chosen world, or given a scene
from another world, plays in that other world's scene, and the status page says so, its Parts entry
naming the world each part comes from and its Fallbacks entry each part shown in place of another
([display.md](./display.md#the-settings-screen)). A world chosen whole never needs this, since its
preset is complete.

## The medieval world's pack

`web/packs/medieval.pack.json` is the medieval world's pack: id `kw.medieval`, format `[1, 4]`,
version 0.10.0, under CC BY-SA 4.0 ([legal/ART-LICENCE.md](../legal/ART-LICENCE.md)) as the base pack is. Its carrier, `web/packs/medieval.pack.js`, is written by
`tools/pack-carrier.js` like the base pack's ([library.md](./library.md#carriers)), and `index.html`
loads it after the base pack's. It holds:

- the scene `battlement`, the battlement of `web/js/scenes/battlement.js` written as data. Its first
  still layer holds, in the code's order, the sky, the stars, the two ridges of hills, the far keep
  with its crenels and lit windows, the moon, the parapet's bricks and coping, the merlons, the
  walkway and its flagstones, and the torch's bracket. Its second still layer, drawn while the WAN is
  down (`"when": ["cond:wan_down"]`), holds the cut rope of the bell, its frayed end and the length
  of rope on the walkway. Its first moving layer holds the stars that blink, the torch's light, its
  flame and the mark where the devices are drawn; its second, also while the WAN is down, the three
  sparks at the rope's end, which blink on a keyframe clock. Its places, spot, rounds (the stops of
  the patrol), `tv` and `can` are the code scene's. It is quiet, hosts the flies, the crate, the feast and the foe, gives the foe
  the code scene's zone, left of the knight, and a wall, the merlons and the parapet between them,
  which the goblin climbs over, and gives the crate the stretch `[150, 384]`;
- the scene `camp`, the camp of `web/js/scenes/camp.js` written as data. Its one still layer holds,
  in the code's order, the sky, the stars, the two rows of pines, the four broad trees, the ground
  and the worn patch round the fire, the tufts of grass, the tent with its pole and guy ropes, the
  stone the pie warms on, the eight stones of the fire ring, the two crossed logs and the bough of
  the right-hand tree over the fire, where the cat rests. Its one moving layer holds the fire's light, the three flames, the embers, the mark where the
  devices are drawn and the fireflies. Its places, spot, rounds, `tv` and `can` are the code
  scene's. It is quiet, hosts the flies, the crate, the feast and the foe, gives the foe the code scene's zone,
  left of the knight, with no wall, so the goblin digs out of the ground, and gives the crate the
  stretch `[298, 436]`;
- the scene `yard`, the training yard of `web/js/scenes/yard.js` written as data. Its one still layer
  holds, in the code's order, the sky, the stars, the merlons of the curtain wall as a tile, the
  wall's bricks and coping, the two arrow slits, the door under its stone arch (the arch's rows
  clipped where the door begins), the sconce, the beaten earth, its pebbles (the effect `pebbles`)
  and tufts, the shadow under the dummy, the rack of spare arms, the tall barrel the pie stands on
  (the stamp `barrel.tall`), the three bales of hay and the dummy's post. Its one moving layer holds the sconce's light and flame,
  the mark where the devices are drawn, and the practice dummy: the lean of its pole, then its arms,
  sack, head and shield in the group `dummy`, and last the straw it sheds. Its places, spot, rounds
  (the first of them `train`), `tv` and `can` are the code scene's. It is quiet and hosts the flies, the
  crate and the feast, but no foe, gives the crate the stretch `[298, 436]`, and its `target` is `{ "group": "dummy", "hitAt": 420, "every":
  5600 }`, which gives it the training act;
- the scene `cellar`, the cellar of `web/js/scenes/cellar.js` written as data. Its one still layer
  holds, in the code's order, the wall's bricks, the row of arches, the two shelves with what stands
  on them, their boards and their brackets, the piers, the cobwebs, the sconce, the flagstones and
  their seams, the two crate stacks and the barrel. Its one moving layer holds the sconce's light,
  the flame and the mark where the devices are drawn. Its places, spot, rounds, `tv` (on a crate,
  never watched) and `can` are the code scene's, and it keeps the weapon away (`"weapon": "away"`)
  and the helmet on;
- the scene `smithy`, the smithy of `web/js/scenes/smithy.js` written as data. Its one still layer
  holds, in the code's order, the wall's bricks and its beam, the tool board with the hammer, the
  tongs and the two horseshoes (the effect `horseshoe`), the quench barrel and the glint on its
  water, the workbench the pie stands on, the forge's hood and chimney (the effect `hood`), its bricks, the hearth
  (a tile of one repeat, below), the mouth of the fire, the floor of slabs and the ash, the anvil,
  and last the gear at rest: the shield on the wall and the weapon across the anvil, each through a
  `rest` mark. Its first moving layer, unless the CPU runs hot (`"when": ["!cond:cpu_hot"]`), holds
  the calm fire: its light, the coals, the three flames and the sparks over them; its second, while
  the CPU runs hot, the flared fire: a wider light and a warmer one over the coals, both pulsing on
  a `wave` of `div` 100, which keeps time with the bellows, the coals, the flames half as large
  again, the sparks and two `drift` effects of embers up the chimney. Its third holds the bellows,
  its parts that never move and then its moving parts, each point that moves its open point plus
  `pump` times its travel (`{ "c": 409, "pump": 30 }` for the crossbar), the hot tip of the blade
  (a `rest` mark for the weapon at the anvil's rest) and the mark where the devices are drawn; its
  fourth, while the hammer strikes (`"when": ["strike"]`), the burst of sparks where the hammer's
  face meets the blade, `{ "k": "fx", "fx": "burst", "p": [{ "spot": 1, "c": 148 }, 412] }`. Its
  places (`g3` before the bellows), spot, rounds, `tv` and `can` (`device_down`, `cpu_hot`,
  `memory_tight`, `updating` and `streaming`) are the code
  scene's, and so are its rests, `anvil`, `{ "from": "spot", "x": 50, "y": 425, "a": "flat" }`,
  and `wall`, `{ "kind": "hang", "x": 145, "y": 312, "w": 100, "h": 132 }`. It takes the helmet
  off, keeps the weapon away (the hammer's act lays it on the anvil), is quiet and hosts nothing.
  Its `anvil` is `{ "rest": "anvil" }`, which gives it the anvil's act, its `bellows` `{ "stand":
  612, "handle": [682, 414], "travel": 30, "div": 100 }` and its `quench` `{ "water": [172, 452],
  "stand": [650, 228] }` (format 1.3). Its rounds are a look round at the spot and one loop of the
  quench at the forge, `{ "x": 130, "act": "quench", "dur": 15 }` (format 1.4);
- the scene `house`, the knight's house of `web/js/scenes/house.js` written as data. Its first still
  layer holds, in the code's order, the roof's underside and its rafters (the effect `rafters`), the
  plank wall (the effect `planks`) and its posts as a tile, the beam, the moonlight and the window
  with its stars and moon, the weapon on its pegs and the shield beside them (`rest` marks), the
  hearth of stone with its logs, mantel, jug and cup, the floor of boards with its seams as tiles,
  the rug, the bed, the stool and the table. Its second still layer, while the television is on
  (`"when": ["tv"]`), holds the television on the table; its third (`"!tv"`) the candlestick. Its
  moving layers hold, in order: the hearth's fire; while the television is on, its picture in the
  colour a palette track gives and, in a layer of its own, the figure crossing it on a `dx` track
  and the scan lines; while it is off, the candle's light and flame (the effect `candle`); the mark
  where the devices are drawn; in bed, the `sleeper` mark and the blanket, which breathes by two
  copies of its shapes shown in turn; out of bed, the blanket made up; and while the helmet is off,
  the helmet on the stool (a `rest` mark). Its over layer, at night with the television on
  (`"when": ["cond:night", "tv"]`), lays the set's light over the dark room: six faint `flicker`
  glows in the picture's blues, four round the set and two on the bed. Its places, spot, rounds, `tv` (`none`: its own set) and `can` are
  the code scene's,
  and so are its rests: `stool`, `{ "kind": "surface", "x": 460, "y": 476, "w": 76, "h": 80 }`,
  `pegs`, `{ "x": 618, "y": 228, "a": "flat", "stamp": "peg" }`, and `wall`, `{ "kind": "hang", "x":
  844, "y": 164, "w": 100, "h": 140 }`. It takes the helmet off, keeps the weapon away, is quiet and
  hosts the feast. Its `bed` is `{ "head": [-15, 262], "blanket": "blanket", "zeds": [150, 270] }`
  and its `screen` `{ "group": "tv" }`;
- the scene `court`, the royal court of `web/js/scenes/court.js` written as data. Its one still
  layer holds, in the code's order, the wall's bricks, the pillars every 480 with their ledges and
  sconces (a tile), the two banners, the floor and its squares (three tiles, one for each row), the
  carpet, the dais's three steps (a tile of one repeat, below), the throne, the `patron` mark where the
  monarch is painted, and the tall side table the pie stands on. Its one moving layer holds the torches' lights and flames (a
  tile, the light the effect `flicker`), the mark where the devices are drawn, the `patron` mark
  where the monarch's mouth is drawn and the `bubble` mark. Its places, spot, `tv` (never watched)
  and `can` (`ssh_session` alone) are the code scene's. It is not quiet and hosts nothing, and its
  `seat` is `{ "x": 770, "y": 490, "bubble": [622, 180], "turn": 3200, "mouth": 230 }`, which gives
  it the seat's act. Its one round, at its spot, is not compiled (a scene with a seat gives none);
- the prop set `props.medieval`, the devices of `props.js` written as data: the five kinds `pi`
  (the raspberry pie), `camera` (a barn owl), `machine` (a scrying crystal on its stool), `vm` (a
  potion flask beside the satchel) and `box` (an iron-bound chest on its mat), each up and gone,
  below ([The devices](./cast.md#the-devices-on-the-page)), and the television, on its table or its
  crate ([The television](./cast.md#the-television));
- the cast members `patron.a`, `patron.b` and `patron.c`, the three monarchs of `court.js` written
  as data: each seated on its anchors, its mouth shut and open, and the user's skin, hair and robe
  laid over it as the court lays them, below ([The cast](./cast.md#the-cast-on-the-page));
- the cast member `foe.goblin`, the goblin of `props.js` (the pot-thief, since 0.9.0) written as
  data: its measures and its six poses, built from ten parts they share, below;
- the cast member `critter.fly`, the fly of `props.js` written as data: its two frames and the dead
  fly that falls once it is swatted, below;
- the cast member `pet.cat`, the mouser cat of `cat.js`: its two coats, `calico` and `ginger`, each
  pose of each naming a stamp, its spot in each scene, and the measures of its pounce, below;
- twenty-two stamps for the cat, `cat.<coat>.<pose>`, each pose of each coat as pix shapes in runs,
  written by `tools/cat-stamps.js` from the code's drawing, below ([The cast](./cast.md#the-cast-on-the-page));
- four stamps, `sconce`, `barrel`, `barrel.tall` and `peg`: the props `sconceHD` and `barrelHD` of
  `props.js`, the barrel at the 84 by 72 the cellar draws it and at the 84 by 96 the yard does, and
  one of the house's pegs, counted from where the weapon's frame puts it;
- ten stamps for the devices' lamps of their own, the dark and the lit drawing of each, all up:
  the pie's (`pie.up.*`), the filling in the gaps of the lattice; the owl's (`owl.up.*`), its eyes;
  the crystal's (`crystal.up.*`), its ball; the flask's (`flask.up.*`), its potion; and the
  chest's (`chest.up.*`), the jewel in its lock plate. Each dark drawing is a dimmer colour of the
  lamp's hue, still lit. No kind has a lamp while down, so there is no down stamp: the owl's dazed
  spirals and the chest's dark jewel are pix shapes of their gone still parts;
- the word set `words.medieval`: the quiet line's parts as `ALL QUIET`, `{n} up`, `backup {at}`
  and `{n} ads slain`, `{short} ads slain` or `{short} slain`, and the captions `BANISHED {addr} ·
  {jail}` or `BANISHED {addr}` for a ban, `DELIVERED · {title}` for an import and `STORES SAFE {at}`
  for a finished backup, with its name, `Medieval`, its watcher, `the knight`, and the settings
  screen's labels, below ([The words and the overlay](#the-words-and-the-overlay-on-the-page));
- the overlay `overlay.phosphor`: the colours `display.css` has always given the words at each level,
  their black outline, the scrim's black, the caption's background at 0.66 alpha, and the font
  `vt323`, below;
- one palette entry, `house.screen`, the television's first colour, which the house's palette track
  changes every 400 ms;
- the preset `world.medieval`, the medieval world whole: the base pack's Classic build and its
  default outfit, the quiet scenes `battlement`, `camp`, `house`, `yard` and `smithy`, the scene of each
  condition that has one (none for `streaming`, format 1.4), `patron.a`, `foe.goblin`, `critter.fly` and `pet.cat`, `props.medieval`, `overlay.phosphor`,
  `words.medieval`, and the camp as its picture, below ([Worlds as presets](#presets-on-the-page)).

At the widest screen they assume, the checks find:

| Scene | Still layers | One frame of the moving and over layers |
|---|---|---|
| battlement | 342 shapes, 25 879 fills | 7 shapes, 185 fills, 1 glow |
| camp | 57 shapes, 57 073 fills | 7 shapes, 718 fills, 8 glows |
| yard | 298 shapes, 29 049 fills | 44 shapes, 2 086 fills, 1 glow |
| cellar | 440 shapes, 76 803 fills | 3 shapes, 120 fills, 1 glow |
| smithy | 339 shapes, 15 300 fills | 54 shapes, 2 053 fills, 4 glows |
| house | 370 shapes, 71 245 fills | 52 shapes, 2 146 fills, 9 glows |
| court | 413 shapes, 50 743 fills | 19 shapes, 904 fills, 8 glows |

against limits of 200 000 fills for the still layers, and 16 000 fills and 24 glows for a frame.
The shapes are counted with each tile's repeats and each stamp's shapes written out. The camp's
glows are the fire's light and the seven fireflies, the smithy's the calm fire's light, the flared
fire's two and the sparks', counted together though the calm and the flared never show at once,
and the house's the fire's, the television's and the candle's, counted together though the last
two never show at once, and the six lights of the set over the dark room at night: a frame is costed with every layer drawn; the court's are its torches'
lights, one for each pillar the widest screen shows. The gear at rest, the hot tip, the steam, the
rings, the drips and the glint of the quench, the sleeper, the Zs, the patron and its speech bubble
are the engine's drawing, as the devices are, and count toward no scene's cost;
the stamp a weapon's rest names counts twice, once for each peg.

The devices cost, still and moving (the moving part with a lamp of the kind's own):

| Kind | Up | Gone |
|---|---|---|
| `pi` | 3 308 fills still, 411 moving | 633 still, no lamp |
| `camera` | 539 still, 32 moving | 664 still, no lamp |
| `machine` | 472 still, 430 moving | 746 still, no lamp |
| `vm` | 564 still, 92 moving | 527 still, no lamp |
| `box` | 314 still, 64 moving | 416 still, no lamp |

with the rests and the shadows in the still parts, and the television 590 still on its table and
121 for its picture, against limits of 4 000 fills for a still part and 600 for a moving part with its lamp. The engine's
own lamp, which no medieval kind uses now, would count toward none of them. The monarchs' still parts cost 5 731 fills (A), 5 582 (B) and
5 132 (C), against a limit of 16 000, and each mouth 1 fill shut and 16 open, against 400; the
court counts none of them. The whole file weighs 384 056 bytes, against the 512 KiB a pack may;
the cat's stamps are 106 KB of it and the lamps' 15 KB. The goblin's poses cost from 3 624 fills (`hit`) to 3 867
(`taunt1`), against a limit of 8 000 for each, its parts included. The fly costs 24 fills in each
frame and 1 for what falls, against a limit of 200 for each. The cat's poses cost from 621 fills
(calico, resting) to 1 263 (ginger, the pounce), against a limit of 8 000 for each, and its stamps
hold 132 902 of the pack's 148 108 pixels in pix shapes, against a limit of 160 000; the devices'
lamps hold 9 760 of them.

The pack is signed with `kw1` by a signing run, as the base pack is
([development.md](./development.md#signing-the-packs)): version 0.1.0, which held the cellar alone,
then version 0.2.0, version 0.3.0, which adds the devices, and version 0.4.0, which adds the cast.
Version 0.5.0, which adds the words and the overlay, is signed too. Version 0.6.0 takes the
raspberry off the pie and lights the pie through its lattice, with the last slice left in the dish
when the Pi is down, draws the other devices as medieval things, the owl, the cauldron, the flask
and the chest, and adds the preset `world.medieval`, and is signed too. Version 0.7.0, which adds
the mouser cat and the redesigned scenes and devices (the crystal in place of the cauldron, the
ground places along the front of the floor, the crate's stretches), is signed too. Version 0.7.1 changes only the licence line, to the art
licence, and is signed too. Version 0.8.0, of format `[1, 3]`, gives the smithy its three acts
(the bellows, the flared fire and the quench, and the hammer's sparks where its face meets the
blade) and makes it a quiet scene of the preset, and is signed too. Version 0.9.0 redraws the
goblin as the pot-thief and puts the pack's art under CC BY-SA 4.0; it is signed too. Version
0.10.0, of format `[1, 4]`, gives the quiet scenes the stops of the knight's patrol and every scene
a place for the television, raises the yard's and the court's pies, moves the smithy's `g3` before
the bellows and gives the ground devices their rests; it is unsigned until its signing run. A copy changed after signing is refused by a
deployed page until its next run: that page draws every scene, every device and the cast, the cat
included, from code, shows the collector's own quiet line and captions, and keeps `display.css`'s
colours, while a `dev` page reads it all from the pack.
