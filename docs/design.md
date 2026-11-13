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

Open-faced helm, red plume, blue tabard, and a greatsword held and swung in both hands. No shield.
No arm is ever drawn over the blade or its guard: the arm on the side the blade leans to goes
behind it. The helmet comes off in the house and the smithy. Gear is drawn in slots (head, weapon,
hands) over one body so that new items can be added later.

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
| `disk_full` | warning | cellar | carrying a tower of crates |
| `backup_overdue` | warning | house | hungry, thinking of food |
| `pi_silent` | warning | house | staring at the empty dish |
| `thing_down` | warning | the quiet scene of the moment | stays put, frowning, looking towards the empty place |
| `cpu_hot` | warning | training yard | training frantically, sweating |
| `memory_tight` | warning | the quiet scene of the moment | bloated |
| `ssh_session` | at work | royal court | talking with the monarch |
| `updating` | at work | smithy | hammering the greatsword |
| `streaming` | quiet | house | watching the television |
| `night` | asleep | house | in bed, screen dimmed |

With no condition active the quiet scenes take turns: battlement, camp, house, training yard.

The monarch on the throne at court is one of three young adults, each with a look of their own:
monarch A, a king; monarch B, a queen; and monarch C, a monarch who reads as neither. All three
sit the same way and talk with the knight the same way, and differ in hair, crown, robe and what
they hold. A is the default. For now the address chooses between them (`mon=`, see
[page.md](./page.md#the-address)); a setting will choose in normal use.

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
