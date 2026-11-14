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
  something is at work.
- Movement is kept small. A fire flickers, the knight strolls to another spot every 12 to 22
  seconds in the quiet scenes. There is enough movement to spare an OLED panel and not enough to
  keep catching the eye. The whole picture and the text also drift a few pixels over minutes.
- Serious outranks fun. The conditions have one order, and the highest one active wins the scene,
  the knight's state and the headline. Small reactions to events (an advert blocked, an address
  banned, a download imported) play only while nothing at warning level or above is active.
- Blocked adverts become flies. One fly stands for a few minutes of the household's usual
  blocking, so a quiet network sends the odd fly and a burst sends a swarm. They gather, up to
  eight, and the knight swats them all at most once every 30 seconds.

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
a swing to the left the shield lifts as the sword crosses the body, and the blade passes in front
of it, so a blow struck on that side is always seen. A shield is carried only with a
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

No arm or gauntlet is ever drawn over a blade or its guard, nor over the face of a shield. With
the greatsword both arms go behind the blade, the one on the side it leans to first, and the hands
close on the grip below the guard, the upper one far enough down that it never covers the guard.
With the sword and shield the shield's arm goes behind the shield and the sword's arm behind the
sword, and while the sword crosses the body both arms go behind the shield and the blade goes in
front of it.
A test draws every frame of the swings and the attack and checks this pixel by pixel
([page.md](./page.md#the-knights-rig)). The helmet comes off in the house and the
smithy. Gear is drawn in slots over one body so that new items can be added later; the slots are
listed in [packs.md](./packs.md#slots-and-the-drawing-order).

The gear the knight is not holding is at rest where it belongs: the helmet on the stool in the
house, the weapon on the house's pegs and across the smithy's anvil, and the shield on the wall
beside the pegs and on the smithy's wall over the quench barrel. Where the knight carries no
weapon (the cellar's crates, the house), the shield is put away with it.

The Raspberry Pi that watches the main host is a steaming raspberry pie, present in every scene.
It is a fruit pie in a white dish, with a lattice crust and a large raspberry on top, drawn as a
cluster of round drupelets under a green calyx so that it reads as a raspberry from across the
room. The raspberry is the pie's lamp: while the Pi is up it glows and dims slowly in its own
colours, from a deep crimson to a bright pink-red, on the same slow loop as the other lamps. The
colour language says green for up, but a whole pie against an empty dish already says up or down,
and a green raspberry would read as unripe. When the Pi is judged down, silent for its
`down_after_s`, the pie is gone and the empty dish is left, with a few crumbs and a single
raspberry, which blinks slowly from red to black like any other lamp of a down machine. A
collector from before watched things gives no judgement, and with it the dish empties at the
first missed check, as it always did.

## Watched things

Besides the Pi, a user may list other machines to watch (a NAS, a camera, a laptop, a virtual
machine), each with a kind. Each kind is drawn as the device it is, by the owner's choice, though
the scene is medieval: a white bullet camera on a wall arm, a grey tower case, the same case as a
dotted outline for a virtual machine, and a plain small grey box for a kind the page does not know.
They are drawn as plainly as the rest of the display, in hard pixels and the palette's steels and
whites.

Every scene has places for them where such things would be. Cameras are mounted high, at or above
the knight's head, on a wall, a tree, a pier or a pole; the other devices stand on the ground, by
the owner's choice. Each scene has three high places and three ground places, besides the pie's,
and they fill in the order of the list, so a thing keeps its place whether it is up or down. A
thing with no place left is not drawn but is still watched.

Every device carries one lamp that never stops: while the machine is up it fades slowly from green
to black and back, and while it is down it blinks slowly from red to black. The pie's lamp is its
raspberry, which keeps its own colours while the Pi is up and blinks red like the rest while it
is down. A down device also
looks broken from across the room: the camera hangs from its arm, the tower goes dark with its
side panel off, the dotted outline breaks up into a few dots at its corners, and the box lies on
its side with its lid off. A question mark blinks over a down thing that alerts; a thing set not
to alert, such as a laptop that sleeps, keeps only its red lamp. Names are never written in the
scene: a thing's name shows in the headline while it alerts.

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
| `thing_down` | warning | the quiet scene of the moment | stays put, frowning, looking towards the empty place |
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
| `thing_down` | yes | yes | yes | yes | | | |
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
each of which one scene alone can act; and `thing_down` and `memory_tight`, which play in whichever
quiet scene is showing. Nothing changes until a scene is chosen, and a choice the chosen scene
cannot act is ignored, so the condition plays in its own scene. A chosen scene changes only where
the condition plays: the condition's level, its headline and the knight's state stay as they are.

## Settings

Each display has a settings screen, opened by pressing and holding anywhere on it for two seconds;
a tap still toggles full screen. It holds the knight's look (build, weapon, skin, hair colour and
style, tabard, plume), the monarch and the monarch's skin, hair and robe, the display preferences
(headline size, a 24-hour or 12-hour clock, whether the helmet stays on indoors), which quiet
scenes take turns and for how long, the scene each offered condition plays in, and a read-only
status page: the page's version, the state file's age, the sources and the packs. A side rail keeps every page one tap away. A choice applies at once, to the scene
behind as well, which keeps running dimmed, and there is no Save button; each page ends with a
button that puts this display back to the config default. The screen closes with DONE, Escape, or
after a minute without a touch, counting down the last ten seconds, and reloads the page as it
closes when anything was changed; tapping the dimmed edge does
not close it, so a hand brushing the frame does nothing. Every touch target is at least 48 CSS
pixels, for a large tablet in landscape and a small desktop window alike.

The choices are kept in that display's browser, so other displays keep their own. Each setting
comes from the highest of four levels: the address (for screenshots), the display's own choices,
the defaults in `config.toml` that the collector passes on in `state.json`, and the page's own. A
second display therefore starts as the owner set `config.toml`. The demo has the same screen.
The builds are shown by their names, Classic, Broad and Slim, all three ready. [page.md](./page.md#settings)
describes the screen and the levels in full.

## Art

All seven scenes (battlement, camp, house, training yard, cellar, smithy and court), the knight
and the props are drawn by code on one grid of 960 by 600 with the ground at 530, in whole pixels,
scaled by a whole number of device pixels where the screen allows (three on the target tablet).
The still part of a scene is painted once and kept. Only what moves is drawn each frame.

A different set of art would replace the code-drawn art as one complete set and never piecemeal,
so that two styles never share a screen.

## The collector

A small Python program with no third-party dependencies, run as a container:

- no Docker socket: container state comes from a read-only Docker API proxy over HTTP;
- a non-root user, a read-only root filesystem, no capabilities;
- host figures from read-only mounts, everything else by asking the services it watches over
  HTTP, DNS or a TCP connection, and the machines listed as watched things by a TCP connection
  or one web request each;
- one output, written atomically: `state.json` in a folder the web server already serves.

It keeps the short history that its judgements need (a CPU averaging 85 percent or more over the
last 30 seconds is a condition; a spike of a few seconds is not), so the page stays stateless.
Every source may fail on its own: the collector reports the source as unavailable and carries on.

Sources are separate modules behind one small interface, so a homelab with different tools swaps
a module and leaves the rest alone.

## Serving

The page is static files. Any web server will do, and it is the operator's job to put
authentication in front of it: `state.json` holds container names, addresses and what is being
watched. Knightwatcher opens no port of its own.

## Decisions not yet made

- A licence, to be chosen before the repository is made public.
- How the display behaves overnight on the tablet itself (dimming, sleep), which belongs to the
  kiosk browser more than to this project. The page asks for a screen wake lock in live mode and
  goes full screen on a tap, and leaves the rest open.
