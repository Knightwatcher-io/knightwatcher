# Development

Read this page before changing anything, and [security.md](./security.md) before committing.
The design is in [design.md](./design.md), and the contract between the collector and the page
is in [state.md](./state.md). Read [page.md](./page.md) before touching `web/`,
[collector.md](./collector.md) before touching `collector/`, [server.md](./server.md) before
touching `server/`, [packs.md](./packs.md) before touching `web/js/pack.js` or a pack file, and
[worlds.md](./worlds.md) before touching `web/js/world.js`, the medieval world's pack or a scene it
holds.

## Layout

```
web/                 the page: static files, no build step (index.html, css/, fonts/, js/, packs/)
  admin/             the admin page, served by the bundled server alone
  js/scenes/         one file per scene
  packs/             the packs that ship with the page, each a .pack.json and its .pack.js carrier
collector/           the collector: Python, standard library only (overlay.py reads the admin
                     page's admin.json and lays it over config.toml, reload.py takes up a change
                     between polls)
  sources/           one module per source
  settings-schema.json  every setting of config.toml and every variable of .env
server/              the bundled server: Python, standard library only, reusing the collector's
                     checks (app.py the HTTP side, store.py the shared settings, admin.py the
                     admin page's password, sessions, store, checks and export, stamp.py the
                     page's version stamp at build time)
tests/
  collector/         unittest tests for the collector
  server/            unittest tests for the server and the stamp
  web/               node tests for the page's scripts
    fixtures/knight/ the stored call record of the knight's drawing
    fixtures/scenes/ the stored call records of the scenes, and of the props the engine draws over
                     them
    fixtures/worlds/ the test world, test.orbit.pack.json, and orbit.js, which writes it (never
                     signed, never under web/; see The test world below)
    fixtures/        a fixture pack for the pack library's tests, the base pack's sword and
                     shield as approved (base-onehand.items.json), its free options as
                     approved (base-options.json), its three builds and the items fitted to
                     them as approved (base-builds.json), its free items of 1.4.0 as approved
                     (base-free-items.json), a world pack of format 1.1 for the library's tests
                     (world-1.1.json), the base pack's read, first stored from the library
                     before format 1.1 (base-read.json), and a state file with the settings'
                     defaults (state-defaults.json)
  tools/             node tests for tools/deploy.sh, tools/pack-carrier.js, tools/sign-pack.js,
                     tools/settings-schema.js and tools/cat-stamps.js
tools/
  deploy.sh          copies web/ to a served folder and stamps the copy with a version
  pack-carrier.js    writes the carrier of each pack in web/packs/
  cat-stamps.js      writes the mouser cat's stamps and cast member into the medieval world's pack,
                     from its drawing in web/js/cat.js
  sign-pack.js       signs pack files, or takes their signatures off, and writes their carriers
  settings-schema.js writes the page's copy of the settings schema and the reference in
                     docs/configuration.md
  icons.sh           regenerates the favicon and the app icons from the drawings in icons/
  shots.sh           regression screenshots of the page
  capped.sh          runs a command within a ceiling on CPU and memory, for the checks
  check-private.sh   the check that no private detail is tracked
docs/                this documentation
compose.yaml  Dockerfile  config.example.toml  .env.example  pyproject.toml
```

## Rules

- **The contract comes first.** A change to what the collector writes or the page reads changes
  [state.md](./state.md) in the same commit.
- **The page has no build step and no dependencies.** It must open from disk in a browser.
- **The collector and the server use the standard library alone.** A dependency needs a reason
  written here.
- **A pack file and its carrier change together.** After editing a file in `web/packs/`, run
  `node tools/pack-carrier.js` and commit both; a test fails while they differ. See
  [packs.md](./packs.md#carriers).
- **A change to the medieval art is made in both copies, in the same commit.** A scene the medieval
  world's pack holds (today every scene) is drawn from the pack and, as the fallback, from its code in
  `web/js/scenes/`. Change both, write the carrier, and `node --test tests/web/` holds the two to the
  same call records. See [worlds.md](./worlds.md#two-copies-held-equal). The mouser cat is written
  into the pack by a tool: after a change to `web/js/cat.js`, run `node tools/cat-stamps.js` and
  then `node tools/pack-carrier.js`, and `node --test tests/tools/` fails while the pack and the
  code differ.
- **A setting starts in the schema.** Every setting of `config.toml` and every variable of `.env`
  is described in `collector/settings-schema.json`. A new or changed one is written there first,
  then in `config.example.toml` or `.env.example`; then run `node tools/settings-schema.js`, which
  writes the page's copy in `web/js/settings.js` and the reference in
  [configuration.md](./configuration.md#every-setting). Tests fail while any of them disagree.
- **A signed pack is signed again after any change.** Editing a pack that carries a `sig` breaks
  its signature, and `node --test tests/tools/` fails until it is signed again or unsigned with
  `node tools/sign-pack.js --unsign`. See [Signing the packs](#signing-the-packs).
- **No key in the repository.** No private key of any kind is committed, test keys included; the
  tests generate theirs in memory for each run.
- **Invented data everywhere.** See [security.md](./security.md). Run `tools/check-private.sh`
  before every push.
- **Docs describe what is built.** The last step of every change is the docs: check each doc
  that describes what you changed against what you built, and correct whatever no longer
  matches, in the same commit. A change whose docs are stale is not finished.
- **Prose is plain.** British English, no emojis, no em dashes, no filler.
- **Commits follow Conventional Commits.**

## Checks

The checks and the screenshots are run inside a ceiling on CPU and memory, `tools/capped.sh`, so
that they never crowd out the services on the machine they run on. The page's tests alone would
otherwise take a core for each test file at once, and the scene records' file grows to about 1 GB.
Under a systemd user session the wrapper runs its command in a transient scope with `CPUQuota=400%`
(four cores) and `MemoryMax=4G`, at `nice` 10; without systemd it lowers the priority alone.
`KW_CPU` and `KW_MEM` change the ceiling, for example `KW_CPU=200% tools/capped.sh ...`.
`tools/shots.sh` puts itself inside the same ceiling, and `node --test` is given
`--test-concurrency=2`, so at most two test files run at once.

The collector and the server:

```bash
tools/capped.sh python3 -m unittest discover -s tests/collector -v
tools/capped.sh python3 -m unittest discover -s tests/server -v
uvx ruff check collector server tests && uvx ruff format --check collector server tests
docker build -t knightwatcher:dev .
docker compose config -q
python3 -m collector --check-config --config config.toml --env-file .env
```

The collector's TLS test needs `openssl` on the path, to make a self-signed certificate that is
thrown away after the run; without it that test is skipped and says why.

The last two need a `.env` and a `config.toml` in place; see
[configuration.md](./configuration.md). `tests/collector/test_schema.py` checks the settings schema
against the collector, `config.example.toml`, `.env.example` and `compose.yaml`, each service's
mounts included, and that the server is given no variable but its address and port.
`tests/collector/test_reload.py` checks admin.json laid over `config.toml`, the start and reload
rules, the credentials' names and the acknowledgement in the state file. `tests/server/` runs the
server on the loopback, the admin page's side with a password made for the run; its stamp test
needs bash and rsync, for `tools/deploy.sh`, and is skipped without them. [server.md](./server.md#checks) lists what they
check.

The page:

```bash
for f in $(find web/js web/packs web/admin -name '*.js'); do node --check "$f" || exit 1; done
tools/capped.sh node --test --test-concurrency=2 tests/web/
tools/capped.sh node --test --test-concurrency=2 tests/tools/
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref    # before a change
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new    # after it
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
# the settings screen and the wall with the test world loaded, from a copy of web/ the script makes
# and removes
CHROME=/path/to/chrome-headless-shell tools/shots.sh worlds /tmp/kw-worlds-new
tools/shots.sh compare-worlds /tmp/kw-worlds-ref /tmp/kw-worlds-new
```

The screenshots compare the page with itself before and after a change that should not alter how
it looks. With time frozen each shot depends only on its address, however many frames a busy
machine paints. Take one set at a time all the same: two browsers shooting at once have not been
tried. The nine `arm-` shots draw the sword and shield through the address's `arm=one`; a
reference taken from a tree older than that hook draws the greatsword there, so against it only
those differ. The eleven settings shots near the end of the set (the screen on each page, the
hold's cue, the 12-hour clock, a monarch's skin) have nothing to compare with in a reference from
before the settings, and the comparison reports them missing. The eleven after them (the monarch's
hair and robe, the Scenes page, a condition in a chosen scene) are missing likewise from a reference
from before those, against which the eight settings shots that show the side rail differ in it,
where the Scenes entry was added, and the two of the monarch's page also in its new rows. The 56
`bd-` shots after them draw the builds Broad (`bd-b-`) and Slim (`bd-c-`): every scene with
the knight standing, the attack, tight memory, the cellar's crate, the smithy's hammering, in bed,
the sick and hot tints, the sword and shield, the swat both ways with each weapon at three points
of the swing, the goblin at the hit with each weapon, and the settings screen's knight page, the
build chosen by the address's `bd=` hook ([page.md](./page.md#checks)). Against a reference from
before them they are missing. The 62 `ref-` shots that end the set are the reference for moving the
scenes into pack data, beside the scenes' call records below: each condition in each scene that can
act it where no other shot shows it, the helmet on in the house, the smithy's hammer raised, the
yard's dummy struck, each monarch in each skin no other shot shows, the devices in all seven places
up and gone in every scene, and every scene at 1400 by 600 and at 960 by 720 (4:3). Against a
reference from before them they are missing too. The 34 `free-` shots after them show the base
pack's free items of 1.4.0: each new weapon and shield, the gear at rest, three whole looks, the
new hair, the back in the attack, with the cellar's crate and in the bloat, the same on Broad and
Slim, and the settings screen's knight page with every row in view, chosen with `arm=` and the
gear's look hooks ([page.md](./page.md#checks)); against a reference from before them they are
missing. Against a reference from base pack 1.3.0 six shots differ besides: the settings screen's
knight page in `settings-knight`, `settings-look`, `settings-tablet`, `bd-b-settings-knight` and
`bd-c-settings-knight`, whose weapon and hair style rows gained choices, and `settings-status`,
which names the base pack's version and whether it is signed. The four shots that end the set show
the worlds: the World page with nothing set and at the tablet's size, the World page with parts the
address changes from the world, and the status page's World, Parts and Fallbacks entries
([page.md](./page.md#checks)); against a reference from before worlds they are missing, and every
settings shot that shows the side rail differs in it, where World was added first, and
`settings-status` in its entries too. Against a reference from before `kw.medieval` 0.6.0, which
took the raspberry off the pie and drew the other devices as an owl, a cauldron, a flask and a
chest, every shot that draws a pie or a device differs there: the pie in its place, the dimmed
scene behind the settings screen, and the scenes' thumbnails and previews on the settings screen;
and in the 22 shots that place devices with the address's `dv=`, the devices in their places, with
the lights of their lamps reaching up to 24 pixels past a place's box. The 28 `cat-` shots
show the mouser cat: in its ginger coat at each of its eight spots, through a catch in
the house, leaping at night, in the smithy and at court, catching a fly that came with the goblin
or the crate outdoors, three flies at most, none in the cellar, and the settings screen's cast page
([page.md](./page.md#checks)). Against a reference from before the cat every shot differs: the
scenes where the cat rests, the `cat-` shots in what they show, and the settings shots in the rail
too, where the pet's page was added. Against a reference from before the redesign of the scenes
and devices of 17 November 2026 (the crystal in place of the cauldron, the ground places along the
front of the floor, the question mark over every down device), every shot that draws a scene
differs: the scenes were recomposed, the devices redrawn and recoloured, and the cat moved to its
new spots. The goblin's bonk shots are timed to the new hits, since the goblin now comes left of the
knight. The nine `streams-` shots that end the set show the streams' detail line on two moments of
three streams, on one stream, with titles alone and with the count alone, and the streams' badge
beside `+1 MORE` at each headline size and alone at court, with the demo's invented streams
(`st=`, `sm=`). Against a reference from before the streams' sessions they are missing, and the
nine shots that show streaming differ in their words: `on-plex` and the eight `cat-house-` shots.
A headless browser has no saved choices, so every shot shows what its address asks for.
[page.md](./page.md) has the rest.

`node --test tests/web/` includes a faster check for the knight: it draws the knight in 94 poses,
the bare head in bed, the speech bubble, the gear at rest, and the house and the smithy, which show that gear, against a fake canvas, once
from code and once from the base pack, and compares every call with a
stored record, in about a second. The record is stored again only when the knight or those scenes are meant to change;
[page.md](./page.md#checks) says how. The same file draws every frame of the swings, the attack
and the goblin strike with the greatsword and with the sword and shield, and fails if an arm is
drawn over a blade or a shield ([page.md](./page.md#the-knights-rig)). The same checks for the
base pack's free items of 1.4.0 (every new weapon with every shield it may carry, the mail and
padded sleeves and gloves, every free item in every pose, on each build) run from
`knight-free-classic.test.js`, `knight-free-broad.test.js` and `knight-free-slim.test.js`, which
load `knight.test.js` with `KNIGHT_PART` naming one build, so that they run in processes of their
own beside it; each takes about two minutes, the longest files of the suite. For the three builds it draws
Classic, chosen by name, against the stored record; Broad and Slim with each weapon in every pose
and swing frame without a throw and within the look's cost; the hands on the grip on every build
through both swings, the attack and the goblin strike; and the arm check on Broad and Slim.
`tests/web/foe.test.js` checks the goblin's plan and hit on every build with each weapon, and that
the blade the engine measures is the one drawn. `node --test tests/tools/` also checks that every pack
carrier matches its pack file, that the mouser cat's stamps and member in the medieval world's pack
are what `tools/cat-stamps.js` writes from `web/js/cat.js` and read back to the code's pixels, that the copy of the settings schema in `web/js/settings.js` and the
reference in `docs/configuration.md` are what `tools/settings-schema.js` writes, tests the signing tool with keys generated for the run, and checks
that every pack in `web/packs/` that carries a `sig` verifies against the key table in `pack.js`.
`tests/web/format-1.1.test.js` checks the world sections of pack format 1.1, which the library reads
and checks and nothing yet draws from: one refused copy of its world fixture for each rule, the
limits at their edges, the costs, the signature over a 1.1 pack, and that a 1.0 pack reads as it did.
`tests/web/effects.test.js` checks the effects of `web/js/effects.js`: that each effect's cost bounds
the fills it draws for a spread of its fields on three screens, and that `pack.js` refuses every
field of every effect out of its table and costs each with its own cost function.
`tests/web/base-read.test.js` holds the shipped base pack's whole read, its signed bytes and six of
its looks, records included, equal to a copy stored from the library before format 1.1;
[packs.md](./packs.md#tests) says how to store it again, which only a change to the base pack calls
for. `tests/web/loading.test.js` checks the downloaded packs, the refusals and the knight drawn from code
when no base pack can be used; its signed packs use keys generated for the run.
`tests/web/world-loading.test.js` checks the same of the medieval world's pack: refused, missing or
failing to compile, a scene, a kind of device, each role of the cast and the word set throwing while
drawing and drawn from code alone from the next frame, a throw in the engine's own drawing not put
down to the pack, the world started again with the downloaded packs, and the admin page's scripts
against the walls'; its signed packs use keys generated for the run too. `tests/web/places.test.js`
draws whatever may stand in every scene's places and checks that it stays on the 960 by 600 grid
and that no two places draw over each other. `tests/web/world-scenes.test.js` runs those checks of
`foe.test.js` and `places.test.js` that depend on a scene on each scene of the medieval world's pack,
compiled from it with the goblin from its cast, holds the goblin's plan there to the code scene's
with the code's goblin for every weapon and build, runs
each scene of the pack with an act frame by frame beside its code scene, and checks each scene's `quiet` and `hosts` against the engine's and the settings' own lists of the quiet
scenes and the events. `tests/web/world-knight.test.js` runs the checks `knight.test.js` makes of the
house and the smithy on the two compiled from the pack: their paint and draw against the knight's
stored records with the knight from code and from the base pack, the same calls as the code scenes
in the base pack's other looks, their backdrop keys and rests, the pegs, the hot tip of a weapon
without a blade, and a shield that does not fit the house's wall. `tests/web/world-cast.test.js`
draws the fly, the goblin and the three monarchs from the medieval world's cast beside the code's,
call for call: the fly's frames and what falls, the goblin's six pose canvases, each monarch in 55
looks of skin, hair and robe, and the engine's frames while flies
come, are swatted and fall and through the goblin's whole event, with the cast from the pack and
from code; and checks where the cast is drawn from, a member that fails to compile and what the
compiler refuses in the cast. `tests/web/pet.test.js` holds the mouser cat from the pack to the
cat from code, every pose in both coats call for call, and checks the engine's catch: who a fly
belongs to (the cat indoors and while the knight is busy, the knight outdoors while free), the
knight's swat passing over the cat's flies, one fly at a time with every step's time, the poses
through a catch and the fly meeting the paw at the top of the leap, three of the cat's flies at
most, no fly under a warning and the flies on screen leaving, the cellar without flies, a new scene
starting clear, the spot by the bed at night under the dimming, the drawing order, the note, the
coat, and a page without the cat giving every fly to the knight as before. `tests/web/world-props.test.js`
draws every kind of device from the medieval world's prop set beside the code's drawing of it, call
for call, in every place of every scene, up and gone, with and without its question mark, in both
parts and through the lamps' loops, and checks where the devices are drawn from, a kind that fails
to compile, the lamp of a kind's own and what the compiler refuses in a prop. `tests/web/world-words.test.js`
checks the quiet line and the captions the page builds from the collector's parts in the medieval
world's words, held to the collector's own rule at the limits of 52 and 44, with the collector's text
when there are no parts or no words; the overlay's CSS custom properties against the fallbacks
`display.css` gives them; that `main.js` writes the words with `textContent`; where the words and the
overlay come from on a `dev` and a deployed page; and the demo's parts, texts and lines.
`tests/web/worlds.test.js` checks worlds as presets: the medieval preset in the pack, complete,
its outfit the base pack's defaults and its scenes those of the code, and what the pack library
refuses in a preset; what a page that reads kw.medieval and a second world pack made for the run
lists for the settings (`KW.world.catalogue`, `KW.settings.pageWorld`), and that with nothing set
the display is the same with the preset as from code; the rule that resolves a world against the
parts set beside it, at the same level, above and below, the `items` and `devices` tables key by key,
and the faults of a world whose parts are not loaded; long names kept, standing for short ones, or
ignored with their reasons; the store's `chooseWorld`, kept in the browser and sent to a server in
one write; the engine's scene from the world's `homes`; each kind of device drawn from the prop
set chosen for it, from the base world's where that set cannot give it; and what the settings
screen shows of the worlds (`KW.settings.screen`): the parts that differ from the world, a world's
card as it comes, the line naming what choosing a world cleared, the device rows only once a second
prop set is loaded and what a choice there saves, every fallback the status page lists with its
reason, the labels from the world's words, World first in the rail and the screen opening on the
knight.
`tests/web/orbit.test.js` checks the test world and any loaded world drawn through the settings,
`tests/web/orbit-swap.test.js` the whole swap of a world, part by part and whole, by what the engine
reads of the scenes, the cast and the kinds while it draws, `tests/web/orbit-body.test.js` the test
world's body at the ends of the measurements' ranges in every pose, and `tests/web/orbit-parts.test.js`
its devices in every scene's places, the drone's spots, the Captain's talk, the overlay's bands and
its reserved fields under a signature ([The test world](#the-test-world)). `tests/web/world-mix.test.js` checks mixing parts across worlds
with the test world loaded: the long names of the monarch's colours and the pet's coat, a slot's
item giving way to its key, the pet's coat fitted to the pet in use, the weapon's grip from its item
and what it greys, the store's one-write choice of a part, the rows every part page lists (each
world's choices grouped, the marks of a part changed from the world, the amber lines, the roles'
labels, Coming for a body that cannot be drawn), the quiet scenes' names in a sentence, and the
admin page's household look built on the same rows.
`tests/web/state.test.js` also checks that `quiet_parts` and an event's `parts` are read as strings,
or not at all. `tests/web/streams.test.js` checks the streams' detail line and badge: the stream
shown at each moment by the clock, the clipping, each line held to the collector's `line()` through
`python3`, the fallback to the collector's `detail`, when the badge shows and its count, and the
demo's invented streams ([page.md](./page.md#checks)). `tests/web/settings-schema.test.js` checks the page's lists of
settings, scenes and conditions against the settings schema. `tests/web/shared-settings.test.js` checks the shared settings against a fake server: the first
answer, the carry-over of a browser's own choices, no server, a choice sent and a write refused,
and two displays sharing one server. `tests/web/settings.test.js` checks the settings in
`web/js/settings.js` (the order of their levels, unknown values, the browser's storage refusing,
the reset, the 12-hour clock, the monarch's hair and robe with "As drawn", the scene chosen per
condition and which scenes can act which condition, the build row's names from the base pack), the
engine's quiet rotation and its choice of scene, the monarch's skin, hair and robe, and the knight
drawn from the base pack in 720 looks of the settings', each build meeting every weapon, skin, hair
colour and hair style, every choice of the gear on every build, the gear's look, what the screen
greys and the choices' names, and every monarch in every skin, hair and robe.

`tests/web/scenes.test.js` does for the scenes what the knight test does for the knight. Against the
same kind of fake canvas it records every scene's `paint()` and `draw()`, with `act()` and `over()`
where a scene has them, call by call, in every state that changes them: idle and each condition the
scene can act, the helmet the other way from the scene's own, the house's television, the smithy at
another spot, the yard's dummy struck, the devices in all seven places up and gone, and at court
each monarch in its own colours, in each of the six skins and in a sample of hair and robe; each at
960 by 600, 1400 by 600 and 960 by 720, at five moments chosen to catch what moves. The devices are
drawn by the engine's own `KW.devices`, and a canvas drawn with `drawImage` (a device's still part,
the pie's lamp, a pose of the goblin) is written into the record with its calls. Where a scene calls
on the knight (the sleeper's head, the gear at rest, the speech bubble, a swing) the record holds
one line with the call and its arguments, since the knight test checks the knight. The goblin, the
flies and the other props of the events are recorded apart. It compares 1 803 records with those in
`tests/web/fixtures/scenes/`, one file per scene and one for those props (`cast.json`). Then it draws
each scene the medieval world's pack holds (today every scene, 1 782 records) a second time, compiled
from the pack and with the devices from its prop set and the monarchs from its cast, against the
same stored records, and the rest of the cast the pack gives against `cast.json`; checks that the compiled scene's backdrop key tells
the recorded states apart exactly as the code scene's does; and checks that it gives the code scene's
interface, the crate's stretch among it. All of it takes about 80 seconds. A failure names the scene, the state, the size, the record and the first call that
differs, with what `HEAD` draws there and what was drawn; without git, the block of 1 024 calls
where the difference lies. Store the records again only when a scene is meant to change, from code
whose drawing is known to be right, as the redesign of the scenes and devices of 17 November 2026
did, and the knight's records (`KNIGHT_LOG=write`) too when the house or the smithy change, since
the knight test draws them:

```bash
SCENES_LOG=write node --test tests/web/scenes.test.js      # stores the records of the code as it is, never the pack's
SCENES_LOG=dump:DIR node --test tests/web/scenes.test.js   # writes every record in full to DIR
SCENES_WEB=DIR node --test tests/web/scenes.test.js        # draws a copy of web/ in DIR instead
```

[page.md](./page.md#checks) has the details.

`tests/web/world.test.js` checks the scene compiler and the medieval world's pack: that the pack
reads clean, where a `dev` and a deployed page draw every scene from, a refused, missing or unreadable pack and a compile that throws, each leaving
the scenes concerned the code scenes with its console line, the predicates and the backdrop's key,
`outdoors`, the foe's zone and the crate's stretch, the target's and the anvil's acts, the bed and the screen, the
keyframes' tracks, the rests, the rest mark and the pegs, and
that what the compiler does not build yet is refused by name.

The repository's own page draws the knight from the base pack, and every scene, every device, the cast, the words and the overlay from the medieval world's pack, so the screenshots of the repository's page check the pack paths, and the knight test
and the scene test check both paths. A deployed copy draws from each pack while it ships signed, and
from code otherwise; to shoot the code path as well, take a second pair of sets from a copy of
`web/` whose `kw-version` is not `dev` and whose packs carry no signature; [page.md](./page.md#checks)
shows how.

## The test world

`tests/web/fixtures/worlds/test.orbit.pack.json` is `test.orbit`, a small world made unlike the
medieval one to show what the engine still assumes about it ([worlds.md](./worlds.md#the-test-world)).
It is written by a generator beside it, never by hand:

```bash
node tests/web/fixtures/worlds/orbit.js           # writes the file
node tests/web/fixtures/worlds/orbit.js --check   # exits 1 when the file is not what it writes
```

`tests/web/orbit.test.js` fails while the two differ, so change the generator and run it, then
commit both. The pack is never signed, with `kw1` or any key, and never goes under `web/`, so
`tools/deploy.sh` never copies it; the same test fails if any pack under `web/packs/` has an id
starting `test.`. It is read only on `dev` terms. To look at it on a wall, from a copy of `web/`
outside the repository with its carrier added, the way [page.md](./page.md#checks) shoots the code
path:

```bash
cp -r web /tmp/kw-orbit
cp tests/web/fixtures/worlds/test.orbit.pack.json /tmp/kw-orbit/packs/
node tools/pack-carrier.js /tmp/kw-orbit/packs/test.orbit.pack.json
sed -i 's#<script src="packs/medieval.pack.js"></script>#&\n<script src="packs/test.orbit.pack.js"></script>#' /tmp/kw-orbit/index.html
# then open /tmp/kw-orbit/index.html#wd=test.orbit/world.orbit, or shoot it with PAGE=
```

The address's `wd=` chooses the world, and `fo=`, `cr=`, `pr=`, `wo=` and `ov=` its foe, critter,
prop set, words and overlay alone ([page.md](./page.md#the-address)). `tools/shots.sh worlds DIR`
makes the same copy in a folder of its own, takes from it the `worldmix-` shots of the settings
screen and the `orbit-` shots of the wall, and removes it. Take a reference set with `worlds` before
a change and another after it, and compare them with `compare-worlds`, as for the main set; a change
to the test world itself changes the shots that show the part changed.

## The logo and the icons

`web/logo.svg` is the logo, with `logo-dark.svg` for dark surfaces and `logo-mono.svg` in one
colour. `web/favicon.svg` is the favicon, and changes its outline with the browser's light or dark
theme. The raster icons (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are
never edited by hand: they are made from the drawings in `tools/icons/` by

```bash
CHROME=/path/to/chrome-headless-shell tools/icons.sh
```

and a second run gives the same bytes.

## Signing the packs

A deployed page draws only packs signed with a key in `KEYS` in `web/js/pack.js`; the project's
key is `kw1`. Its private half is held outside the repository by a private release process, and is
never written to a file beside a checkout. A release that changes a shipped pack signs it in that
process:

1. The commit to sign is pushed to `main`, with its pack files unsigned or carrying an old `sig`.
2. The release process takes `web/js/pack.js`, `web/js/effects.js` (which `pack.js` needs to read a
   pack that names an effect), `web/js/ed25519.js`, `tools/sign-pack.js`, `tools/pack-carrier.js`
   and `web/packs/` from that commit, runs
   `node tools/sign-pack.js web/packs/*.pack.json` with the key in `PACK_KEY_KW1`, and hands back
   the signed pack files and the commit they were signed at.
3. Only the `sig` of each file is copied into a checkout whose `HEAD` descends from that commit,
   after checking that each pack is unchanged since it; the carriers are written again with
   `node tools/pack-carrier.js`.
4. The checks below are run, and the signed files and their carriers are committed and pushed.

The signature is public, so carrying it back into the repository is safe. A pack changed between
steps 1 and 3 is refused there and needs another run. [packs.md](./packs.md#signing-a-pack)
describes the tool, and how a fork signs with a key of its own.

Whether the base pack ships signed today, and what a deployed page draws in each case, is in
[packs.md](./packs.md#where-the-knight-is-drawn-from). The medieval world's pack, `kw.medieval`, was
first signed on 15 November 2026 at version 0.1.0, which held the cellar alone, and again the same
day at version 0.2.0, which adds the camp, the battlement, the yard, the smithy and the house.
Version 0.3.0, which adds the devices, was signed the same way on 16 November, and version 0.4.0,
which adds the cast, the same day, as was version 0.5.0, which adds the words and the overlay.
Version 0.6.0, which lights the pie through its lattice in place of the raspberry and draws the
other devices as an owl, a cauldron, a flask and a chest, was signed the same day. Version 0.7.0,
which adds the mouser cat and the redesigned scenes and devices, was signed on 17 November. A signed version is drawn from by a deployed
page and a `dev` page alike, every scene, every device and the cast it gives, with its words and its
overlay; a version changed after signing ships unsigned until its next run, and meanwhile a deployed
page draws every scene from code and shows the collector's own words ([worlds.md](./worlds.md#where-the-scenes-are-drawn-from)). The page's tests hold in either state, so carrying a signature
across changes no test.

## Deploying

`docker compose up -d --build` builds the image, which holds the collector, the server and a copy
of `web/` stamped with its version (`server/stamp.py`, which gives the bytes `tools/deploy.sh`
gives), and starts both. Open displays reload onto a new image within about five minutes, as
after a deploy. A tree run straight from git builds from the working tree, so build from a clean
export (`git archive`) when other changes are in progress.

### The page alone, to a web server of your own

```bash
tools/deploy.sh /path/to/served/folder
```

This copies `web/` into the folder the web server serves, leaves that folder's `data/` alone,
deletes files `web/` no longer has, and stamps the copy with a version so that open displays
reload themselves onto it within about five minutes. It needs bash, rsync and coreutils, and
changes nothing under `web/`. Run it against a folder outside the repository; it refuses `web/`,
a folder inside it and any folder that holds it. [page.md](./page.md#deploying) has the details.

**The page goes first.** When a change touches both the page and the collector, deploy the page
before the collector. A new page reads files from an old collector and from a new one, while an
old page skips what it does not know: a page from before devices ignores `facts.devices` and
`device_down`, so behind a new collector it would show nothing when a watched machine goes down.
