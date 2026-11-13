# Design

Knightwatch is a wall display for a homelab. A pixel-art knight fills a tablet's screen, and his
scene and state mirror the machines he watches: he sweats when the CPU is pinned, takes to his bed
when a container is unhealthy, and goes to the king's court while someone has a shell open. A
headline over the top says why in words, beside a wall clock.

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
  seconds. There is enough movement to spare an OLED panel and not enough to keep catching the eye.
  The whole picture and the text also drift a few pixels over minutes.
- Serious outranks fun. The conditions have one order, and the highest one active wins the scene,
  the knight's state and the headline. Small reactions to events (an advert blocked, an address
  banned, a download imported) play only while nothing at warning level or above is active.
- Blocked adverts become flies. They gather, up to eight, and the knight swats them all at most
  once every 30 seconds.

## The knight

Open-faced helm, red plume, blue tabard, and a greatsword held and swung in both hands. No shield.
No arm is ever drawn over the blade or its guard: the arm on the side the blade leans to goes
behind it. The helmet comes off indoors. Gear is drawn in slots (head, weapon, hands) over one
body so that new items can be added later.

The Raspberry Pi that watches the main host is a steaming raspberry pie, present in every scene.
When the Pi stops answering, the pie is gone and an empty plate is left.

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
| `pi_silent` | warning | house | staring at the empty plate |
| `cpu_hot` | warning | training yard | training frantically, sweating |
| `memory_tight` | warning | the quiet scene of the moment | bloated |
| `ssh_session` | at work | king's court | talking with the King |
| `updating` | at work | smithy | hammering the greatsword |
| `streaming` | quiet | house | watching the television |
| `night` | asleep | house | in bed, screen dimmed |

With no condition active the quiet scenes take turns: battlement, camp, house, training yard.

## Art

Scenes are composed on a 960 by 600 grid with the ground at 530, drawn in whole pixels and scaled
by a whole number of device pixels where the screen allows (three on the target tablet). The
still part of a scene is painted once and kept. Only what moves is drawn each frame.

The first art is drawn by code. Generated or hand-drawn sprite sheets may replace it, as one
complete set and never piecemeal, so that two styles never share a screen.

## The collector

A small Python program with no third-party dependencies, run as a container:

- no Docker socket: container state comes from a read-only Docker API proxy over HTTP;
- a non-root user, a read-only root filesystem, no capabilities;
- host figures from read-only mounts, everything else from the HTTP APIs of the services it
  watches;
- one output, written atomically: `state.json` in a folder the web server already serves.

It keeps the short history that sustained conditions need (a CPU that has been hot for nine
minutes is a condition; a spike is not), so the page stays stateless. Every source may fail on its
own: the collector reports the source as unavailable and carries on.

Sources are separate modules behind one small interface, so a homelab with different tools swaps
a module and leaves the rest alone.

## Serving

The page is static files. Any web server will do, and it is the operator's job to put
authentication in front of it: `state.json` holds container names, addresses and what is being
watched. Knightwatch opens no port of its own.

## Decisions not yet made

- A licence, to be chosen before the repository is made public.
- Whether generated art is ever committed, given how unsettled its copyright position is.
- How the display behaves overnight on the tablet itself (dimming, sleep), which belongs to the
  kiosk browser more than to this project.
