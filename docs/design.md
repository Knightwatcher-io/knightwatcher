# Design

Knightwatcher is a wall display for a homelab. A pixel-art knight fills a tablet's screen, in a
scene and a state that mirror the machines being watched: the knight sweats when the CPU is
pinned, takes to bed when a container is unhealthy, and goes to the royal court when someone
opens a shell. A headline over the top says why in words, beside a wall clock.

It has two parts that share one file.

- **The collector** reads the homelab and decides what is true. It writes `state.json`.
- **The page** reads `state.json` and decides how it looks. It never talks to the homelab.

The split is the whole design. The collector knows nothing of knights, and the page knows nothing
of Docker or DNS, so either can be replaced without touching the other. The contract between them
is [state.md](./state.md).

## What the display is for

It is read from 3 to 4 metres across a room, on a 14.6 inch tablet. At that distance the screen
holds about four lines of a dozen characters, so the state is carried by the scene, the knight's
posture and colour, and words are kept to one headline and one line of reason.

Rules that follow from this, each decided by the owner:

- The scene fills the screen. Text lies over it: a headline and one line when something needs
  saying, and only the clock and one small line when all is quiet.
- Text colour is the status: green when quiet, amber for a warning, red when critical, blue while
  something is at work. A world's overlay may give its own shade of each, within a band of hue and
  contrast on black that keeps the meaning ([packs.md](./packs.md#words-and-the-overlay)); the
  medieval world's overlay gives the colours above.
- Movement is kept small. A fire flickers, the knight strolls to another spot every 12 to 22
  seconds in the quiet scenes. There is enough movement to spare an OLED panel and not enough to
  keep catching the eye. The whole picture and the text also drift a few pixels over minutes.
- Serious outranks fun. The conditions have one order, and the highest one active wins the scene,
  the knight's state and the headline. Small reactions to events (an advert blocked, an address
  banned, a download imported) play only while nothing at warning level or above is active.
- Blocked adverts become flies. One fly stands for a few minutes of the household's usual
  blocking, so a quiet network sends the odd fly and a burst sends a swarm. A fly belongs to
  whoever can take it when it comes. Outdoors, while the knight is free, the knight's flies gather,
  up to eight, and the knight swats them all at most once every 30 seconds. Indoors, and outdoors
  while the knight is busy with an event, the fly is the mouser cat's (see [The cat](#the-cat)),
  which catches its flies one at a time, three at most on screen; a blocked advert past that is
  only counted, in the quiet line's count of adverts slain. The knight's swat passes over the
  cat's flies, and the cat never takes the knight's. During a warning or worse a blocked advert
  adds no fly, only the count, and the flies already on screen fly off; the cellar, which plays
  only under a warning, never gets one. A new scene starts with no flies.

## The knight

Open-faced helm, red plume, blue tabard, and a greatsword held and swung in both hands. That is the
default look. The base pack also carries a one-handed arming sword and a heater shield, free, which
the owner chose to ship beside the greatsword: the shield's field is in the tabard's colours, so it
follows the tabard, with the gold eye of the watch on it, as on the tabard and the banners. The
eye's iris takes the tabard's darkest band, so the emblem is in the coat's colours; on the default
blue it is the blue it always was. The
knight holds the sword in the right hand and the shield in front of the chest with the left; in
the attack the sword goes up over the right shoulder and the shield comes in to the middle. A
swing to the right winds up with the sword upright over the right shoulder, clear of the face; in
a swing to the left the sword hand drops to the chest before the blade turns, the shield lifts as
the sword crosses the body, and the blade passes in front of it, so a blow struck on that side is
always seen; the sword then comes back low across the shield and rises again on its own side. A shield is carried only with a
one-handed weapon, and a one-handed weapon without a shield leaves the other hand hanging free.

The knight comes in three builds, all free and all in the base pack, which the owner approved from
a mock-up and named: **Classic**, the present knight and the default; **Broad**, wider at the
shoulders and chest, narrower at the hips and a little taller; and **Slim**, narrower at the
shoulders, with a defined waist, hips a little wider than Classic's, and a little shorter. The
names describe the shape and nothing else. The tabard narrows to the belt and widens to the hem on
each build, with no line across the chest on any of them; the greaves and the pauldrons grow with
the leg and the shoulders; every build keeps the same head and face. Each build holds the weapon
where Classic does relative to its own body, and the goblin is met where the blade drawn on that
build meets it.

Every user chooses on the settings screen, free, the build, the weapon and the knight's skin tone, hair colour,
hair style, tabard colour and plume colour, from six skins, six hair colours, three styles (short
crop, tied back, curls), six tabards and six plumes, all in the base pack and chosen by the owner
from a mock-up. Each skin turns green when the knight is sick and red when the knight is running
hot, each tint at about the skin's own lightness, so the conditions read on every tone. No tabard is
bright red, orange or amber, so the coat is never read as a status. The brows carry a one-pixel dark
edge wherever their colour is too close to the skin's to show, so a face never loses its brows;
today's knight needs none.

The free base pack is generous: every slot a user chooses has three to five free choices. The
owner approved the set from a mock-up, and base pack 1.4.0 carries 25 more items, each plain
medieval kit a viewer knows at a glance and none copying a design from a game or film: a longsword
in both hands and a flanged mace in one; a round and a kite shield beside the heater; a kettle
hat, a mail coif and a bascinet beside the open helm; a tall feather and a horsehair plume beside
the crest; a breastplate and a quilted gambeson beside the tabard; layered spaulders and leather
pauldrons; mail and padded sleeves; leather gloves and mail mittens; mail chausses and padded hose;
sabatons and turnshoes; a long cloak and a short cape for the back, which had nothing; and long
hair and a close crop. Cloth takes the user's colours, so the set needs no colour choice of its
own: the shields' fields, the coat under the breastplate, the gambeson, the padded sleeves and the short
cape take the tabard's, and the long cloak and the plumes the plume's, so a red plume with a red
cloak reads as one look. The hose and the turnshoes are a grey-violet wool of the pack's own. Each
item is one drawing that fits all three builds. The mail coif has no mount for a plume, so no plume
is drawn with it, and the settings screen greys the plume while it is worn; a plume on a mail hood
looks wrong. The mace is held, swung and raised as the arming sword is, with a shield, and the
longsword as the greatsword is; the smithy heats the mace's head as it heats a blade. The default
look is unchanged, and the colour sets stay at six each. Eight more items were drawn and held back
as close to something already offered or weak at wall distance, and a crossbow waits for fired
weapons.

No arm or gauntlet is ever drawn over a blade or its guard, nor over the face of a shield. With
the greatsword both arms go behind the blade, the one on the side it leans to first, and the hands
close on the grip below the guard, the upper one far enough down that it never covers the guard.
With the sword and shield the shield's arm goes behind the shield and the sword's arm behind the
sword, and while the sword crosses the body both arms go behind the shield and the blade goes in
front of it.
A test draws every frame of the swings and the attack and checks this pixel by pixel, for every
weapon, shield, sleeve and glove on every build ([page.md](./page.md#the-knights-rig)).

The blade always passes in front of the watcher, never behind the head. A blade that turns from one
side of the body to the other must point past the face on the way, so the swings keep that pass
short and low: the blade turns past the face in about a frame, and the swings to the left come back
low, across the waist, instead of turning back over the face. The two-handed wind-up holds the
hands out past the far shoulder, so the guard stays clear of the chin. A test holds the time the
blade spends over the eyes in a swing to the left under a ceiling, and keeps the guard off the face
in the wind-up ([page.md](./page.md#the-knights-rig)). The helmet comes off in the house and the
smithy. Gear is drawn in slots over one body so that new items can be added later; the slots are
listed in [packs.md](./packs.md#slots-and-the-drawing-order).

The gear the knight is not holding is at rest where it belongs: the helmet on the stool in the
house, the weapon on the house's pegs and across the smithy's anvil, and the shield on the wall
beside the pegs and on the smithy's wall over the quench barrel. Where the knight carries no
weapon (the cellar's crates, the house), the shield is put away with it.

The Raspberry Pi that watches the main host is a steaming raspberry pie, present in every scene.
It is a fruit pie in a white dish, with a crimped lattice crust over raspberry filling, and the
steam rises from the top of its crust. The pie's lamp is its filling, which lights through the gaps
of the lattice: while the Pi is up it fades slowly from green to near black and back, on the same
loop and in the same green as every other device's lamp, so the pie speaks the colour language the
rest of the devices speak. Until 16 November 2026 a large raspberry stood on top and was the lamp,
glowing in its own crimson because a green raspberry would have read as unripe; the owner chose to
take it off and let the light come from under the lattice, where green reads as light rather than
as fruit. When the Pi is judged down, silent for its `down_after_s`, the pie is gone and the empty
dish is left, with a few crumbs and the last slice lying in it. The slice's filling is the lamp,
and it blinks slowly from red to black like any other lamp of a down machine. A collector from
before devices gives no judgement, and with it the dish empties at the first missed check, as it
always did.

## The cat

A mouser cat lives in the knight's world, the first pet, by the owner's decision of 16 November
2026 from a mock-up. It catches the flies the knight cannot, so that a blocked advert indoors is
caught rather than left buzzing. It is always present, resting at a spot of its own in every
scene: on the battlement's crenel by the torch, the camp's log by the fire, the yard's top bale of
hay, the house's floor in front of the hearth (at the foot of the bed while the knight is in bed),
the cellar's low stack of crates, the smithy's forge ledge and the court's lowest dais step. Each
spot is clear of the knight's walk and swing and of every place for a device.

A fly of the cat's buzzes round the knight for 10 to 20 seconds. In the last 2.5 seconds of its
buzz the cat sits up, alert, and the fly comes down to a catch point near the cat's spot, so the
cat never crosses the scene. The cat stalks low for at least 1.2 seconds at 60 pixels a second,
hopping where the floor steps, wiggles for 0.6 seconds and pounces in a long leap of 0.38 seconds;
its paw meets the fly at the top, where the fly goes in the sword's poof and falls, as a swatted
fly does. The cat lands with a swipe, sits pleased for 1.8 seconds, walks back at 55 pixels a
second and settles. A fly whose buzz ends while the cat is busy waits until it has settled. At
night the cat catches at the foot of the bed, dimmed with the scene. Nothing is gory: the catch
ends in the poof.

The cat is drawn as the rest of the page is, in hard pixels lit from the left with a dark outline,
at 1.3 times the size it was first drawn at, curled when resting and in a long leap when it
pounces. It comes in two coats, both shipped and chosen by the owner on the settings screen:
calico, the default, whose white coat and dark outline read across the room in every scene, and a
ginger tabby. The cat cannot be turned off.

## Devices

Besides the Pi, a user may list other machines to watch (a NAS, a camera, a laptop, a virtual
machine), each with a kind. In the medieval world each kind is drawn as a medieval thing that
stands for it, by the owner's decision of 16 November 2026. Until then each kind was drawn as the
device it is (a white bullet camera, a grey tower case, the same case in dots, a plain grey box),
which sat oddly in a medieval scene. Together the four make a small workshop:

- **Camera:** a pale barn owl on an iron wall bracket, keeping watch, its eyes the lamp. Its wall
  plate stands where the camera's did, so the poles of the high places still meet it.
- **Machine** (any physical computer: a server, a NAS, a laptop): an iron cauldron on short legs over
  a small log fire, its brew the lamp, with bubbles that show as it brightens. A host brews what
  runs on it.
- **Virtual machine:** a corked glass flask with a paper tag, its potion the lamp: what the cauldron
  brews, held in a smaller vessel.
- **Any other kind**, one the page does not know: a small iron-bound chest, the engine's lamp the
  jewel in its lock plate.

They are drawn as plainly as the rest of the display, in hard pixels and the palette's colours.

Every scene has places for them where such devices would be. Cameras are mounted high, at or above
the knight's head, on a wall, a tree, a pier or a pole; the other devices stand on the ground, by
the owner's choice. Each scene has three high places and three ground places, besides the pie's,
and they fill in the order of the list, so a device keeps its place whether it is up or down. A
device with no place left is not drawn but is still watched.

Every device carries one lamp that never stops: while the machine is up it fades slowly from green
to black and back, and while it is down it blinks slowly from red to black. The pie's lamp is its
filling, green through the gaps of its lattice while the Pi is up, and the last slice's filling,
blinking red, while it is down. A down device also
looks broken from across the room: the owl hangs upside down from its bracket by its talons, wings
drooping, with dazed red spirals for eyes and two feathers drifting down; the cauldron lies tipped
on its side, empty and cold, its fire out, and the last ember among the cold logs blinks; the flask
lies on its side with its cork out beside it, and the last of the potion blinks; the chest stands
on its end with its lid knocked off beside it and three coins spilt. A question mark blinks over a down device that alerts; a device set not
to alert, such as a laptop that sleeps, keeps only its red lamp. Names are never written in the
scene: a device's name shows in the headline while it alerts.

## Conditions and scenes

The collector reports conditions by id, already in priority order. The page maps each to a scene
and a state of the knight. Highest first:

| Condition | Level | Scene | The knight |
|---|---|---|---|
| `attack` | critical | battlement | sword raised, alarmed |
| `wan_down` | critical | battlement | puzzled, a cut rope |
| `container_unhealthy` | warning | house | in bed, thermometer |
| `disk_full` | warning | cellar | crouched and sweating, carrying a heavy crate against the chest |
| `backup_overdue` | warning | house | hungry, thinking of food |
| `pi_silent` | warning | house | staring at the empty dish |
| `device_down` | warning | the quiet scene of the moment | stays put, frowning, looking towards the empty place |
| `cpu_hot` | warning | training yard | training frantically, sweating |
| `memory_tight` | warning | the quiet scene of the moment | bloated |
| `ssh_session` | at work | royal court | talking with the monarch |
| `updating` | at work | smithy | hammering the weapon |
| `streaming` | quiet | house | watching the television |
| `night` | asleep | house | in bed, screen dimmed |

That is each condition's own scene. The settings may move five of them to another scene that can
act them; see [Scenes chosen per condition](#scenes-chosen-per-condition).

With no condition active the quiet scenes take turns: battlement, camp, house, training yard,
ten minutes each by default, and a minute each in the demo. The settings choose which of the four
take turns, at least one, and one length for all of them.

The monarch on the throne at court is one of three young adults, each with a look of their own:
monarch A, a king; monarch B, a queen; and monarch C, a monarch who reads as neither. All three
sit the same way and talk with the knight the same way, and differ in hair, crown, robe and what
they hold. A is the default. The monarch has a skin tone of their own, chosen apart from the
knight's from the same six skins of the base pack; by default it is the warm skin, the colours the
court has always drawn. The monarch's hair and robe may take another colour too: the hair any of
the six hair colours of the base pack, the robe any of its six tabard colours. By default, and
whenever "As drawn" is chosen, each monarch keeps their own colours (A brown hair and a red robe,
B dark hair and a violet robe, C fair hair and a green robe). A hair colour shades the monarch's
hair, beard and darkest strands from its own three bands, and the brows from its darkest band,
or from its lightest where that stands out more from the skin (light hair on a dark skin); a
tabard colour's four bands become the robe's, the far sleeve taking its darker two. The crowns,
the ermine and what each holds keep their colours. The settings choose all of this (see below),
and the address's `mon=`, `ms=`, `mh=` and `mr=` choose it for screenshots (see
[page.md](./page.md#the-address)).

## Scenes chosen per condition

Each scene declares the conditions it can act out, from what each condition needs: the props it
shows, where the knight stands and what the knight does. A scene that takes the knight's pose
over for its own story (the court, where the knight talks with the monarch, and the smithy, where
the knight hammers) acts only its own condition. The pie stands to the right of the knight's spot
in the battlement, the camp and the house, and to the left everywhere else, so only those three
can show the knight staring at the empty dish. The weapon is put away in the house and the cellar,
so neither can show it raised against an attack. A condition the knight strolls through (the
crate of `disk_full`) needs a scene whose spots leave the knight's face alone: the cellar's guard
spots and the yard's, not the spots where the knight sniffs or yawns. Running hot and hunger show
on the knight alone, so every scene that leaves the pose alone can act them.

| Condition | battlement | camp | house | yard | cellar | smithy | court |
|---|---|---|---|---|---|---|---|
| `attack` | own | yes | | yes | | | |
| `wan_down` | own | | | | | | |
| `container_unhealthy` | | | own | | | | |
| `disk_full` | | | | yes | own | | |
| `backup_overdue` | yes | yes | own | yes | yes | | |
| `pi_silent` | yes | yes | own | | | | |
| `device_down` | yes | yes | yes | yes | | | |
| `cpu_hot` | yes | yes | yes | own | yes | | |
| `memory_tight` | yes | yes | yes | yes | | | |
| `ssh_session` | | | | | | | own |
| `updating` | | | | | | own | |
| `streaming` | | | own | | | | |
| `night` | | | own | | | | |

The settings offer a choice of scene for a condition that has a scene of its own and that more than
one scene can act: `attack`, `disk_full`, `backup_overdue`, `pi_silent` and `cpu_hot`. Not
offered: `wan_down` (only the battlement has the bell's rope to cut), `container_unhealthy` and
`night` (the bed is in the house; the night is left out by design, since the knight sleeps where
the bed is), `streaming` (the television), `ssh_session` (the court) and `updating` (the smithy),
each of which one scene alone can act; and `device_down` and `memory_tight`, which play in whichever
quiet scene is showing. Nothing changes until a scene is chosen, and a choice the chosen scene
cannot act is ignored, so the condition plays in its own scene. A chosen scene changes only where
the condition plays: the condition's level, its headline and the knight's state stay as they are.

## Settings

Each display has a settings screen, opened by pressing and holding anywhere on it for two seconds;
a tap still toggles full screen. It holds the knight's look (build, weapon, skin, hair colour and
style, tabard, plume, and under Armour the shield, helmet, plume style, body, shoulders, arms,
hands, legs, feet and back), the monarch and the monarch's skin, hair and robe, the cat's coat, the display preferences
(headline size, a 24-hour or 12-hour clock, whether the helmet stays on indoors), which quiet
scenes take turns and for how long, the scene each offered condition plays in, and a read-only
status page: the page's version, the state file's age, the sources and the packs. A side rail keeps every page one tap away. A choice applies at once, to the scene
behind as well, which keeps running dimmed, and there is no Save button; each page ends with a
button that puts the settings back to the config default. The screen closes with DONE, Escape, or
after a minute without a touch, counting down the last ten seconds, and reloads the page as it
closes when anything was changed; tapping the dimmed edge does
not close it, so a hand brushing the frame does nothing. Every touch target is at least 48 CSS
pixels, for a large tablet in landscape and a small desktop window alike.

The settings belong to the deployment, not to one display: the bundled server keeps what any
screen chooses, and every display shows the same, a change on one reaching the others within
seconds. A display with no keyboard or mouse, such as a monitor on a headless host, therefore
shows what was chosen on the tablet. The wall's screen saves without a code, since it holds only
how the display looks. Each setting comes from the highest of four levels: the address (for
screenshots), the saved settings, the defaults in `config.toml` that the collector passes on in
`state.json`, and the page's own.

The sources, thresholds and devices are set on the admin page, which the bundled server
serves at `/admin` behind a password kept in `.env`, from a laptop or a phone; `config.toml` is the
level under it, and still the way to set them by hand. A change there is checked by the
collector's own rules before it is kept, and the collector takes it up at its next poll with no
restart. The admin page also writes the look, display, quiet scenes and scenes through the same
store as the walls' screens, so the two never disagree. Credentials stay in `.env`: the page says
which are there, by name, and never shows or takes one. It is described in
[page.md](./page.md#the-admin-page) and [server.md](./server.md#the-admin-page).
Without the server (opened from disk, the website's demo, or served by another web server) each
browser keeps its own choices. The demo has the same screen.
The builds are shown by their names, Classic, Broad and Slim, all three ready. [page.md](./page.md#settings)
describes the screen and the levels in full.

## Art

All seven scenes (battlement, camp, house, training yard, cellar, smithy and court), the knight,
the cat and the props are drawn by code on one grid of 960 by 600 with the ground at 530, in whole pixels,
scaled by a whole number of device pixels where the screen allows (three on the target tablet).
The still part of a scene is painted once and kept. Only what moves is drawn each frame.

A different set of art would replace the code-drawn art as one complete set and never piecemeal,
so that two styles never share a screen.

## The collector

A small Python program with no third-party dependencies, run as a container:

- no Docker socket: container state comes from a read-only Docker API proxy over HTTP;
- a non-root user, a read-only root filesystem, no capabilities;
- host figures from read-only mounts, everything else by asking the services it watches over
  HTTP, DNS or a TCP connection, and the machines listed as devices by a TCP connection
  or one web request each;
- one output, written atomically: `state.json` in a folder the bundled server, or a web server
  of your own, serves.

It keeps the short history that its judgements need (a CPU averaging 85 percent or more over the
last 30 seconds is a condition; a spike of a few seconds is not), so the page stays stateless.
Every source may fail on its own: the collector reports the source as unavailable and carries on.

Sources are separate modules behind one small interface, so a homelab with different tools swaps
a module and leaves the rest alone.

## Serving

The page is static files, and `docker compose up` serves it with the bundled server, a second
container from the same image: the page, `state.json`, and the settings saved for every display
([server.md](./server.md)). It holds no credential, mounts no secret and writes only its own
folder. It is open to the LAN with no login by default; it is the operator's job to put
authentication in front of it before it is reached from anywhere else, since `state.json` holds
container names, addresses and what is being watched. Any other web server will do instead, with
each browser then keeping its own settings. The collector opens no port.

## Decisions not yet made

- A licence, to be chosen before the repository is made public.
- How the display behaves overnight on the tablet itself (dimming, sleep), which belongs to the
  kiosk browser more than to this project. The page asks for a screen wake lock in live mode and
  goes full screen on a tap, and leaves the rest open.
