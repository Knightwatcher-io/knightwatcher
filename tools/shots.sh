#!/usr/bin/env bash
# Regression screenshots of the page in demo mode, and a comparison of two sets of them.
#
#   CHROME=/path/to/chrome-headless-shell tools/shots.sh take DIR
#   tools/shots.sh compare REFERENCE_DIR RESULT_DIR
#   CHROME=/path/to/chrome-headless-shell tools/shots.sh worlds DIR
#   tools/shots.sh compare-worlds REFERENCE_DIR RESULT_DIR
#
# take opens web/index.html from disk once per entry in SHOTS, with time frozen by the address's
# t= hook, and writes DIR/<name>.png at 960 by 600, or at the size an entry names after a second |.
# It exits 1, naming each shot, when the browser wrote no file for one. PAGE names another copy of
# the page to shoot, such as an older version kept outside the repository. compare decodes each
# pair of PNGs and counts the pixels that differ outside the clock, whose digits change with the
# minute. It exits 1 when any pair differs or is missing. Keep both directories outside the
# repository.
#
# With time frozen each shot depends only on its address, however many frames the browser paints,
# so a single DIFF is a real difference.
#
# worlds takes the shots of WORLD_SHOTS, with the test world, test.orbit, loaded beside the
# medieval one: the settings screen (worldmix-), and the wall in the test world, in a mix of the two
# worlds' parts and in the test world with medieval parts (orbit-). It shoots a copy of web/ made
# outside the repository with the test world's carrier added (docs/tests.md, The test world),
# which it removes afterwards: the test world never goes under web/. compare-worlds compares two
# such sets.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# the browser runs within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

# Sets of devices for the address's dv= hook, so that the shots show more than one setup. A shot
# with no dv= shows the demo's own set: a NAS, a camera and a router, with the Pi put in the pie's
# place, its dish empty, only while pi_silent is on. docs/shots.md says which shot has which set.
PI="dv=pi"                            # the Pi alone, where the pie is the point
PI_MIX="dv=pi,camera,machine"         # the Pi with a camera and a machine
CAMS="dv=camera,camera,camera,vm"     # the three high places full, and a VM
LAB="dv=machine,machine,vm,camera"    # the three ground places full, and a camera
SPARE="dv=camera,box"                 # a camera and a router alone

# name|address hash, or name|address hash|width,height. Every entry hides the review bar and freezes
# time.
SHOTS=(
  "is-battlement|bar=0&t=2300&is=battlement"
  "is-camp|bar=0&t=2300&is=camp&$CAMS"
  "is-house|bar=0&t=2300&is=house&$PI_MIX"
  "is-yard|bar=0&t=2300&is=yard&$LAB"
  "on-attack|bar=0&t=2300&on=attack"
  "on-wan|bar=0&t=2300&on=wan&$LAB"
  "on-sick|bar=0&t=2300&on=sick"
  "on-disk|bar=0&t=2300&on=disk&$CAMS"
  "on-backup|bar=0&t=2300&on=backup&$SPARE"
  "on-pi|bar=0&t=2300&on=pi"
  "on-cpu|bar=0&t=2300&on=cpu&$SPARE"
  "on-swap|bar=0&t=2300&on=swap"
  "on-ssh|bar=0&t=2300&on=ssh&$LAB"
  "on-update|bar=0&t=1250&on=update&$PI_MIX"
  "on-plex|bar=0&t=2300&on=plex"
  "on-night|bar=0&t=2300&on=night&$PI"
  "on-many|bar=0&t=2300&on=attack,swap,ssh&$SPARE"
  "swat|bar=0&t=470&is=battlement&f=6&sw=1"
  "goblin|bar=0&t=1300&is=battlement&e=goblin"
  "crate|bar=0&t=1700&is=camp&e=crate"
  "feast|bar=0&t=1800&is=house&e=feast"
  "helm-off-l|bar=0&t=2300&is=yard&h=off&hs=l&on=cpu"
  "kx|bar=0&t=2300&is=camp&kx=60"
  "mon-b|bar=0&t=3450&on=ssh&mon=b&$SPARE"
  "mon-c|bar=0&t=3450&on=ssh&mon=c"
  "devices-camp|bar=0&t=2300&is=camp&dv=pi,camera,camera!,machine-,vm,x,machine"
  "devices-court|bar=0&t=3600&on=ssh&dv=pi,camera!,machine,camera,vm-,x"
  "device-down|bar=0&t=2300&is=camp&on=device&dv=pi,camera,camera,machine,vm!,x"
  "places-yard|bar=0&t=2300&is=yard&pl=1&dv=pi,camera!,camera,camera,machine,vm-,x!"
  # the arming sword and the heater shield (arm=one): the stance, the yard's hot training mid-swing,
  # the attack, the gear at rest in the house and the smithy, the swat to the left at the moment the
  # sword passes in front of the shield, and the cellar's crate carried at the largest headline
  "arm-battlement|bar=0&t=2300&is=battlement&arm=one"
  "arm-yard|bar=0&t=2470&on=cpu&arm=one"
  "arm-attack|bar=0&t=2300&on=attack&arm=one"
  "arm-house|bar=0&t=2300&is=house&arm=one"
  "arm-update|bar=0&t=1250&on=update&arm=one"
  "arm-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=one"
  "arm-disk|bar=0&t=2300&on=disk&hs=l&arm=one"
  "goblin-rise|bar=0&t=460&is=battlement&e=goblin"
  "goblin-bonk|bar=0&t=1657&is=battlement&e=goblin"
  "goblin-poof|bar=0&t=1900&is=battlement&e=goblin"
  "goblin-camp-rise|bar=0&t=500&is=camp&e=goblin"
  "goblin-camp-bonk|bar=0&t=1661&is=camp&e=goblin"
  "goblin-camp-poof|bar=0&t=2400&is=camp&e=goblin"
  "goblin-camp-g3|bar=0&t=1300&is=camp&e=goblin&dv=pi,machine,vm,box"
  # the goblin bonked with the sword and shield, a millisecond after the hit: on the battlement at
  # 1703, at the camp at 1710
  "arm-goblin-bonk|bar=0&t=1704&is=battlement&e=goblin&arm=one"
  "arm-goblin-camp-bonk|bar=0&t=1711&is=camp&e=goblin&arm=one"
  # the free options, chosen by the look hooks (sk= hc= hy= tb= pm=): looks other than the default,
  # the tail of the tied hair under the helmet, a sick and a hot face on dark skins, and the brows'
  # dark edge where the brows are near the skin's own lightness
  "look-deep-curls|bar=0&t=2300&is=battlement&h=off&sk=deep&hc=black&hy=curls&tb=sable&pm=gold"
  "look-fair-tied|bar=0&t=2300&is=yard&h=off&sk=fair&hc=auburn&hy=tied&tb=wine&arm=one"
  "look-tied-helmet|bar=0&t=2300&is=battlement&sk=fair&hc=auburn&hy=tied&tb=wine&pm=white&arm=one"
  "look-house|bar=0&t=2300&is=house&sk=golden&hc=blonde&tb=teal&pm=royal&arm=one"
  "look-sick-deep|bar=0&t=2300&on=sick&sk=deep&hc=dark&hy=tied&tb=forest"
  "look-hot-brown|bar=0&t=2300&on=cpu&h=off&sk=brown&hc=silver&hy=curls&tb=violet&pm=green"
  "look-brows|bar=0&t=2300&on=wan&h=off&sk=brown&hc=brown"
  # the settings screen (set=), open on each page over the battlement, and the cue of the hold that
  # opens it; the knight's page with a look of the hooks' and at the tablet's size; the monarch's
  # page with a skin of the hooks'; the 12-hour clock (ck=12); and the court's monarch in a skin of
  # the hooks' (ms=)
  "settings-knight|bar=0&t=2300&is=battlement&set=knight"
  "settings-monarch|bar=0&t=2300&is=battlement&set=monarch"
  "settings-display|bar=0&t=2300&is=battlement&set=display"
  "settings-quiet|bar=0&t=2300&is=battlement&set=quiet"
  "settings-status|bar=0&t=2300&is=battlement&set=status"
  "settings-hold|bar=0&t=2300&is=battlement&set=hold"
  "settings-look|bar=0&t=2300&is=camp&set=knight&arm=one&sk=tan&hc=blonde&hy=curls&tb=forest&pm=gold"
  "settings-tablet|bar=0&t=2300&is=house&set=knight|1480,924"
  "settings-monarch-skin|bar=0&t=2300&is=battlement&set=monarch&mon=b&ms=deep"
  "clock-12|bar=0&t=2300&is=camp&ck=12"
  "mon-skin|bar=0&t=3450&on=ssh&mon=c&ms=brown"
  # the monarch's hair and robe (mh= and mr=): the monarch's page at the tablet's size, where both
  # rows show, and each monarch at court in two combinations, one of them on another skin
  "settings-monarch-colours|bar=0&t=2300&is=battlement&set=monarch&mon=c&mh=auburn&mr=teal|1480,924"
  "mon-a-colours|bar=0&t=3450&on=ssh&mon=a&mh=silver&mr=teal"
  "mon-a-colours-tan|bar=0&t=3450&on=ssh&mon=a&mh=black&mr=violet&ms=tan"
  "mon-b-colours|bar=0&t=3450&on=ssh&mon=b&mh=auburn&mr=forest"
  "mon-b-colours-deep|bar=0&t=3450&on=ssh&mon=b&mh=blonde&mr=sable&ms=deep"
  "mon-c-colours|bar=0&t=3450&on=ssh&mon=c&mh=black&mr=wine"
  "mon-c-colours-fair|bar=0&t=3450&on=ssh&mon=c&mh=silver&mr=blue&ms=fair"
  # a scene chosen for a condition (sc=): the Scenes page, at the screenshots' size and at the
  # tablet's with the attack set to the camp by the address, and running hot at the camp and the
  # empty dish stared at from the battlement
  "settings-scenes|bar=0&t=2300&is=battlement&set=scenes"
  "settings-scenes-tablet|bar=0&t=2300&is=battlement&set=scenes&sc=attack:camp|1480,924"
  "scene-cpu-camp|bar=0&t=2300&on=cpu&sc=cpu_hot:camp"
  "scene-pi-battlement|bar=0&t=2300&on=pi&sc=pi_silent:battlement"
  # Under strain's headlines beyond one machine's CPU (on-cpu) and memory (on-swap, bloated in the
  # yard): both resources on one machine and several machines; and memory under strain, bloated,
  # training at the camp and working the bellows in the smithy
  "strain-cpumem|bar=0&t=2300&on=cpumem"
  "strain-several|bar=0&t=2300&on=strained&$SPARE"
  "strain-mem-camp|bar=0&t=2300&on=mem&sc=cpu_hot:camp"
  "strain-mem-smithy|bar=0&t=240&on=mem&sc=cpu_hot:smithy"
  # the smithy's three acts: the hammer's face on the blade 4 ms into the blow (t 2804) on each
  # build; the quench at its stop of the patrol (pt=, the stop beginning 16.8 s in: 12 s at the
  # anvil and the walk to the forge), at the forge, in the steam at the barrel and as the blank is
  # looked over, and with every place filled at the forge (the head over h1 and h2, the boot's toe
  # at g3's left end) and at the barrel, the overlaps docs/page.md accepts; the bellows pressed, with
  # the greatsword on the anvil and with the arming sword and the shield on the wall
  "update-strike|bar=0&t=2804&on=update"
  "bd-b-update-strike|bar=0&t=2804&on=update&bd=b"
  "bd-c-update-strike|bar=0&t=2804&on=update&bd=c"
  "is-smithy-forge|bar=0&t=600&is=smithy&pt=17400&$PI"
  "is-smithy-steam|bar=0&t=5950&is=smithy&pt=22750&$PI"
  "is-smithy-look|bar=0&t=8800&is=smithy&pt=25600&$PI"
  "is-smithy-forge-devices|bar=0&t=600&is=smithy&pt=17400&dv=pi,camera,camera,camera,machine,vm,machine"
  "is-smithy-barrel-devices|bar=0&t=6600&is=smithy&pt=23400&dv=pi,camera,camera,camera,machine,vm,machine"
  # the patrol (pt=, how long it has been going): walking between stops on the battlement, at the
  # camp's second stop, and in the yard walking from the dummy; the television while something
  # streams, the knight watching it in each quiet scene with a set of its own (pt=3000, after the
  # walk to it) and the set behind the cellar's crates and at court; a stream at night, the knight
  # asleep in the house with the set's light over the dark room; and the devices at rest, up and
  # down, every ground place full, with the places outlined; and the goblin and the crate in front
  # of the set while something streams
  "patrol-battlement-walk|bar=0&t=2300&is=battlement&pt=17200&$LAB"
  "patrol-camp-look|bar=0&t=2300&is=camp&pt=22000"
  "patrol-yard-walk|bar=0&t=2300&is=yard&pt=23000&$LAB"
  "patrol-house-yawn|bar=0&t=4300&is=house&pt=20000&$PI_MIX"
  "tv-battlement|bar=0&t=2300&is=battlement&on=plex&pt=3000&$LAB"
  "tv-camp|bar=0&t=2300&is=camp&on=plex&pt=3000"
  "tv-yard|bar=0&t=2300&is=yard&on=plex&pt=3000&$LAB"
  "tv-smithy|bar=0&t=2300&is=smithy&on=plex&pt=3000&$PI_MIX"
  "tv-house|bar=0&t=2300&is=house&on=plex&pt=3000"
  "tv-battlement-walk|bar=0&t=2300&is=battlement&on=plex&pt=31700"
  "tv-cellar|bar=0&t=2300&on=disk,plex"
  "tv-court|bar=0&t=3450&on=ssh,plex"
  "tv-camp-goblin|bar=0&t=1300&is=camp&on=plex&e=goblin"
  "tv-camp-goblin-bonk|bar=0&t=1661&is=camp&on=plex&e=goblin"
  "tv-battlement-goblin|bar=0&t=1300&is=battlement&on=plex&e=goblin"
  "tv-camp-crate|bar=0&t=3000&is=camp&on=plex&e=crate"
  "tv-yard-crate|bar=0&t=3000&is=yard&on=plex&e=crate"
  "night-tv|bar=0&t=2300&on=plex,night&$PI"
  "night-tv-dim|bar=0&t=9100&on=plex,night&$PI"
  "rest-camp-up|bar=0&t=2300&is=camp&dv=pi,camera,machine,vm,box"
  "rest-camp-down|bar=0&t=2300&is=camp&dv=pi,camera,machine-,vm-,box-"
  "rest-yard-places|bar=0&t=2300&is=yard&pl=1&dv=pi,camera,machine,vm,box"
  "rest-smithy-down|bar=0&t=2300&is=smithy&dv=pi,camera,box-,vm-,machine-"
  "cpu-smithy|bar=0&t=240&on=cpu&sc=cpu_hot:smithy"
  "arm-cpu-smithy|bar=0&t=240&on=cpu&sc=cpu_hot:smithy&arm=one"
  # the builds Broad (bd=b) and Slim (bd=c), each in turn: every scene with the knight standing, the
  # attack, memory under strain (bloated as it trains), the cellar's crate carried, the smithy's
  # hammering, in bed (the head alone), the sick tint in bed and the hot tint in the yard; the
  # stance with the sword and shield; the swat, which is the swing, both ways with each weapon, at
  # the wind-up (q .3), mid cut (q .42) and the cut's end (q .55); the goblin a millisecond after
  # each weapon's hit on that build; and the settings screen's knight page with the build chosen
  "bd-b-is-battlement|bar=0&t=2300&is=battlement&bd=b"
  "bd-b-is-camp|bar=0&t=2300&is=camp&bd=b"
  "bd-b-is-house|bar=0&t=2300&is=house&bd=b"
  "bd-b-is-yard|bar=0&t=2300&is=yard&bd=b"
  "bd-b-on-attack|bar=0&t=2300&on=attack&bd=b"
  "bd-b-on-swap|bar=0&t=2300&on=swap&bd=b"
  "bd-b-on-disk|bar=0&t=2300&on=disk&bd=b"
  "bd-b-on-update|bar=0&t=1250&on=update&bd=b"
  "bd-b-on-night|bar=0&t=2300&on=night&bd=b"
  "bd-b-on-sick|bar=0&t=2300&on=sick&bd=b"
  "bd-b-on-cpu|bar=0&t=2300&on=cpu&bd=b"
  "bd-b-on-ssh|bar=0&t=3450&on=ssh&bd=b"
  "bd-b-arm-battlement|bar=0&t=2300&is=battlement&arm=one&bd=b"
  "bd-b-swing-two-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-one-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-goblin-bonk|bar=0&t=1660&is=battlement&e=goblin&bd=b"
  "bd-b-arm-goblin-bonk|bar=0&t=1708&is=battlement&e=goblin&arm=one&bd=b"
  "bd-b-settings-knight|bar=0&t=2300&is=battlement&set=knight&bd=b"
  "bd-c-is-battlement|bar=0&t=2300&is=battlement&bd=c"
  "bd-c-is-camp|bar=0&t=2300&is=camp&bd=c"
  "bd-c-is-house|bar=0&t=2300&is=house&bd=c"
  "bd-c-is-yard|bar=0&t=2300&is=yard&bd=c"
  "bd-c-on-attack|bar=0&t=2300&on=attack&bd=c"
  "bd-c-on-swap|bar=0&t=2300&on=swap&bd=c"
  "bd-c-on-disk|bar=0&t=2300&on=disk&bd=c"
  "bd-c-on-update|bar=0&t=1250&on=update&bd=c"
  "bd-c-on-night|bar=0&t=2300&on=night&bd=c"
  "bd-c-on-sick|bar=0&t=2300&on=sick&bd=c"
  "bd-c-on-cpu|bar=0&t=2300&on=cpu&bd=c"
  "bd-c-on-ssh|bar=0&t=3450&on=ssh&bd=c"
  "bd-c-arm-battlement|bar=0&t=2300&is=battlement&arm=one&bd=c"
  "bd-c-swing-two-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-one-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-goblin-bonk|bar=0&t=1657&is=battlement&e=goblin&bd=c"
  "bd-c-arm-goblin-bonk|bar=0&t=1700&is=battlement&e=goblin&arm=one&bd=c"
  "bd-c-settings-knight|bar=0&t=2300&is=battlement&set=knight&bd=c"
  # the reference set for converting the scenes to pack data, beside the call records of
  # tests/web/scenes.test.js: each condition in each scene that can act it where no shot above shows
  # it, the helmet on in the house, the smithy's hammer raised, the yard's dummy struck, each monarch
  # in each skin no shot above shows, the devices in all seven places up and gone in every scene, and
  # every scene at 1400 by 600 and at 4:3 (960 by 720)
  "ref-battlement-backup|bar=0&t=2300&on=backup&sc=backup_overdue:battlement"
  "ref-battlement-device|bar=0&t=2300&is=battlement&on=device&dv=pi,camera,camera,machine!,vm,x"
  "ref-battlement-cpu|bar=0&t=2300&on=cpu&sc=cpu_hot:battlement"
  "ref-camp-attack|bar=0&t=2300&on=attack&sc=attack:camp"
  "ref-camp-backup|bar=0&t=2300&on=backup&sc=backup_overdue:camp"
  "ref-camp-pi|bar=0&t=2300&on=pi&sc=pi_silent:camp"
  "ref-camp-swap|bar=0&t=2300&is=camp&on=swap"
  "ref-house-device|bar=0&t=2300&is=house&on=device&dv=pi,camera,camera,machine!,vm,x"
  "ref-house-cpu|bar=0&t=2300&on=cpu&sc=cpu_hot:house"
  "ref-house-swap|bar=0&t=2300&is=house&on=swap"
  "ref-yard-attack|bar=0&t=2300&on=attack&sc=attack:yard"
  "ref-yard-disk|bar=0&t=2300&on=disk&sc=disk_full:yard"
  "ref-yard-backup|bar=0&t=2300&on=backup&sc=backup_overdue:yard"
  "ref-yard-device|bar=0&t=2300&is=yard&on=device&dv=pi,camera,camera,machine!,vm,x"
  "ref-yard-swap|bar=0&t=2300&is=yard&on=swap"
  "ref-cellar-backup|bar=0&t=2300&on=backup&sc=backup_overdue:cellar"
  "ref-cellar-cpu|bar=0&t=2300&on=cpu&sc=cpu_hot:cellar"
  "ref-house-helm-on|bar=0&t=2300&is=house&h=on"
  "ref-smithy-lift|bar=0&t=2300&on=update"
  "ref-yard-struck|bar=0&t=2600&on=cpu"
  "ref-mon-a-fair|bar=0&t=3450&on=ssh&mon=a&ms=fair"
  "ref-mon-a-warm|bar=0&t=3450&on=ssh&mon=a&ms=warm"
  "ref-mon-a-golden|bar=0&t=3450&on=ssh&mon=a&ms=golden"
  "ref-mon-a-brown|bar=0&t=3450&on=ssh&mon=a&ms=brown"
  "ref-mon-a-deep|bar=0&t=3450&on=ssh&mon=a&ms=deep"
  "ref-mon-b-fair|bar=0&t=3450&on=ssh&mon=b&ms=fair"
  "ref-mon-b-warm|bar=0&t=3450&on=ssh&mon=b&ms=warm"
  "ref-mon-b-golden|bar=0&t=3450&on=ssh&mon=b&ms=golden"
  "ref-mon-b-tan|bar=0&t=3450&on=ssh&mon=b&ms=tan"
  "ref-mon-b-brown|bar=0&t=3450&on=ssh&mon=b&ms=brown"
  "ref-mon-c-warm|bar=0&t=3450&on=ssh&mon=c&ms=warm"
  "ref-mon-c-golden|bar=0&t=3450&on=ssh&mon=c&ms=golden"
  "ref-mon-c-tan|bar=0&t=3450&on=ssh&mon=c&ms=tan"
  "ref-mon-c-deep|bar=0&t=3450&on=ssh&mon=c&ms=deep"
  "ref-devices-up-battlement|bar=0&t=2300&is=battlement&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-battlement|bar=0&t=2300&is=battlement&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-camp|bar=0&t=2300&is=camp&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-camp|bar=0&t=2300&is=camp&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-house|bar=0&t=2300&is=house&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-house|bar=0&t=2300&is=house&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-yard|bar=0&t=2300&is=yard&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-yard|bar=0&t=2300&is=yard&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-cellar|bar=0&t=2300&on=disk&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-cellar|bar=0&t=2300&on=disk&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-smithy|bar=0&t=2300&on=update&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-smithy|bar=0&t=2300&on=update&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-devices-up-court|bar=0&t=3450&on=ssh&dv=pi,camera,camera,camera,machine,vm,machine"
  "ref-devices-gone-court|bar=0&t=3450&on=ssh&dv=pi!,camera!,camera!,camera!,machine!,vm!,machine!"
  "ref-wide-battlement|bar=0&t=2300&is=battlement|1400,600"
  "ref-wide-camp|bar=0&t=2300&is=camp|1400,600"
  "ref-wide-house|bar=0&t=2300&is=house|1400,600"
  "ref-wide-yard|bar=0&t=2300&is=yard|1400,600"
  "ref-wide-cellar|bar=0&t=2300&on=disk|1400,600"
  "ref-wide-smithy|bar=0&t=2300&on=update|1400,600"
  "ref-wide-court|bar=0&t=3450&on=ssh|1400,600"
  "ref-43-battlement|bar=0&t=2300&is=battlement|960,720"
  "ref-43-camp|bar=0&t=2300&is=camp|960,720"
  "ref-43-house|bar=0&t=2300&is=house|960,720"
  "ref-43-yard|bar=0&t=2300&is=yard|960,720"
  "ref-43-cellar|bar=0&t=2300&on=disk|960,720"
  "ref-43-smithy|bar=0&t=2300&on=update|960,720"
  "ref-43-court|bar=0&t=3450&on=ssh|960,720"
  # the free items of the base pack 1.4.0: the longsword and the mace by arm=, the gear by the look
  # hooks sh= hm= ps= bo= so= am= hn= lg= ft= bk=. Each weapon standing, in the swat and the attack;
  # the shields; the gear at rest in the house and the mace's head on the smithy's anvil; three whole
  # looks, one per new helmet, in the battlement, the camp and the yard; the new hair, under a helmet
  # too; the cloak and the cape in the attack, with the cellar's crate and in the bloat; the
  # sleeper's long hair; the same on Broad and Slim; and the settings screen's knight page with every
  # row in view, the shield greyed beside the greatsword, and the plume greyed with the mail coif.
  # The gear hooks are read by main.js; without them these shots show the default gear
  "free-longsword|bar=0&t=2300&is=battlement&arm=longsword"
  "free-longsword-swat|bar=0&t=470&is=battlement&f=6&sw=1&arm=longsword"
  "free-longsword-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=longsword"
  "free-mace-round|bar=0&t=2300&is=battlement&arm=mace_and_shield&sh=round"
  "free-mace-attack|bar=0&t=2300&on=attack&arm=mace_and_shield&sh=kite"
  "free-mace-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=mace_and_shield&sh=kite"
  "free-kite-yard|bar=0&t=2470&on=cpu&arm=one&sh=kite"
  "free-round-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=one&sh=round"
  "free-mace-update|bar=0&t=1250&on=update&arm=mace_and_shield&sh=kite"
  "free-house-kettle|bar=0&t=2300&is=house&arm=mace_and_shield&sh=round&hm=kettle&ps=feather"
  "free-house-coif|bar=0&t=2300&is=house&arm=longsword&hm=coif"
  "free-house-bascinet|bar=0&t=2300&is=house&arm=one&sh=kite&hm=bascinet&ps=horsehair&pm=white"
  "free-look-kettle|bar=0&t=2300&is=battlement&hm=kettle&ps=feather&bo=cuirass&so=lames&am=mail&hn=leather&lg=mail&ft=sabatons&bk=cloak&pm=gold"
  "free-look-coif|bar=0&t=2300&is=camp&arm=mace_and_shield&sh=round&hm=coif&bo=gambeson&so=leather&am=padded&hn=mail&lg=hose&ft=shoes&bk=cape&tb=forest"
  "free-look-bascinet|bar=0&t=2300&is=yard&arm=longsword&hm=bascinet&ps=horsehair&bo=cuirass&am=padded&hn=mail&lg=mail&ft=shoes&bk=cape&tb=wine&pm=white"
  "free-hair-long|bar=0&t=2300&is=battlement&h=off&hy=long&hc=auburn&sk=tan"
  "free-hair-long-helmet|bar=0&t=2300&is=battlement&hy=long&hc=blonde&hm=bascinet&ps=feather"
  "free-hair-close|bar=0&t=2300&on=cpu&h=off&hy=close&hc=black&sk=deep"
  "free-attack-cloak|bar=0&t=2300&on=attack&arm=longsword&hm=kettle&bk=cloak&pm=royal"
  "free-disk-cape|bar=0&t=2300&on=disk&bo=gambeson&bk=cape&tb=teal"
  "free-swap-cuirass|bar=0&t=2300&on=swap&bo=cuirass&am=mail&so=lames&bk=cloak"
  "free-night-long|bar=0&t=2300&on=night&hy=long&hc=silver"
  "free-bd-b-look|bar=0&t=2300&is=battlement&bd=b&hm=kettle&ps=feather&bo=cuirass&so=lames&am=mail&hn=leather&lg=mail&ft=sabatons&bk=cloak&pm=gold"
  "free-bd-c-look|bar=0&t=2300&is=battlement&bd=c&arm=mace_and_shield&sh=round&hm=coif&bo=gambeson&so=leather&am=padded&hn=mail&lg=hose&ft=shoes&bk=cape&tb=forest"
  "free-bd-b-swat-mace|bar=0&t=1330&is=battlement&f=6&sw=1&bd=b&arm=mace_and_shield&sh=kite"
  "free-bd-c-swat-longsword|bar=0&t=470&is=battlement&f=6&sw=1&bd=c&arm=longsword"
  "free-bd-b-attack|bar=0&t=2300&on=attack&bd=b&arm=mace_and_shield&sh=round&bo=gambeson&bk=cape"
  "free-bd-c-attack|bar=0&t=2300&on=attack&bd=c&arm=longsword&bo=cuirass&bk=cloak&hm=bascinet&ps=horsehair"
  "free-bd-b-hair-long|bar=0&t=2300&is=battlement&h=off&bd=b&hy=long&hc=dark"
  "free-bd-c-hair-close|bar=0&t=2300&is=battlement&h=off&bd=c&hy=close&hc=blonde"
  "free-settings-knight|bar=0&t=2300&is=battlement&set=knight|1480,2800"
  "free-settings-coif-cloak|bar=0&t=2300&is=battlement&set=knight&arm=mace_and_shield&sh=kite&hm=coif&bk=cloak|1480,2800"
  "free-settings-bd-b|bar=0&t=2300&is=battlement&set=knight&bd=b&hm=kettle&ps=feather&bo=cuirass&so=lames&am=mail&hn=leather&lg=mail&ft=sabatons&bk=cloak&pm=gold|1480,2800"
  "free-settings-bd-c|bar=0&t=2300&is=battlement&set=knight&bd=c&arm=mace_and_shield&sh=round&hm=coif&bo=gambeson&so=leather&am=padded&hn=mail&lg=hose&ft=shoes&bk=cape&tb=forest|1480,2800"
  # the crossbow of the base pack 1.5.0, which fires (arm=crossbow): standing; the swat by shot, a
  # bolt's burst at a fly on the right, the turn across the body and a shot to the left; practice
  # from 300 short of the dummy, the bolt in flight and the dummy struck; the goblin on the
  # battlement after the step back, the bolt in flight and the hit, and the bolt in flight at the
  # camp; the attack aimed; on the house's pegs and across the smithy's anvil with no hot tip;
  # slung on the back in the cellar; the swat to the left on Broad and the attack on Slim; and the
  # settings screen's knight page with the crossbow chosen and the shield greyed beside it
  "free-crossbow|bar=0&t=2300&is=battlement&arm=crossbow"
  "free-crossbow-swat|bar=0&t=1090&is=battlement&f=6&sw=1&arm=crossbow"
  "free-crossbow-swat-turn|bar=0&t=1230&is=battlement&f=6&sw=1&arm=crossbow"
  "free-crossbow-swat-left|bar=0&t=1690&is=battlement&f=6&sw=1&arm=crossbow"
  "free-crossbow-practice|bar=0&t=490&is=yard&kx=82&arm=crossbow"
  "free-crossbow-practice-hit|bar=0&t=560&is=yard&kx=82&arm=crossbow"
  "free-crossbow-goblin-step|bar=0&t=500&is=battlement&e=goblin&arm=crossbow"
  "free-crossbow-goblin-shot|bar=0&t=1440&is=battlement&e=goblin&arm=crossbow"
  "free-crossbow-goblin-hit|bar=0&t=1470&is=battlement&e=goblin&arm=crossbow"
  "free-crossbow-camp-goblin|bar=0&t=1440&is=camp&e=goblin&arm=crossbow"
  "free-crossbow-attack|bar=0&t=2300&on=attack&arm=crossbow"
  "free-crossbow-house|bar=0&t=2300&is=house&arm=crossbow"
  "free-crossbow-update|bar=0&t=1250&on=update&arm=crossbow"
  "free-crossbow-cellar|bar=0&t=2300&on=disk&arm=crossbow"
  "free-crossbow-bd-b-swat-left|bar=0&t=1690&is=battlement&f=6&sw=1&bd=b&arm=crossbow"
  "free-crossbow-bd-c-attack|bar=0&t=2300&on=attack&bd=c&arm=crossbow"
  "free-crossbow-settings|bar=0&t=2300&is=battlement&set=knight&arm=crossbow|1480,2800"
  # the World page with nothing set, at 960 by 600 and on the tablet; with parts the address
  # changes from the world, each beside the world's own; and the status page's World, Parts and
  # Fallbacks, a fallback among them (the camp cannot act a full disk)
  "settings-world|bar=0&t=2300&is=battlement&set=world"
  "settings-world-tablet|bar=0&t=2300&is=camp&set=world|1480,924"
  "settings-world-changed|bar=0&t=2300&is=camp&set=world&tb=forest&arm=one|1480,924"
  "settings-status-world|bar=0&t=2300&is=camp&set=status&tb=forest&sc=disk_full:camp|1480,924"
  # the mouser cat. Every shot above shows it resting at its spot, calico; these show it in the
  # ginger coat (pc=) at each of its eight spots, and catching. A fly of f= comes at -5000 ms, or
  # at fa=; one fly in the house while streaming buzzes until 13730, and the cat sits up alert from
  # 11230, stalks from 13730, leaps at 15530 and meets the fly at 15910, lands, is pleased from
  # 16680 and walks back from 18480. A fly that comes at 600 with the goblin is the cat's, since the
  # knight is busy: the cat looks up at once, and meets it at 22446, long after the goblin has gone.
  # Five flies indoors leave three on screen, and the cellar, a warning, has none
  "cat-ginger-battlement|bar=0&t=2300&is=battlement&pc=ginger"
  "cat-ginger-camp|bar=0&t=2300&is=camp&pc=ginger"
  "cat-ginger-yard|bar=0&t=2300&is=yard&pc=ginger"
  "cat-ginger-house|bar=0&t=2300&is=house&pc=ginger"
  "cat-ginger-night|bar=0&t=2300&on=night&pc=ginger"
  "cat-ginger-cellar|bar=0&t=2300&on=disk&pc=ginger"
  "cat-ginger-smithy|bar=0&t=1250&on=update&pc=ginger"
  "cat-ginger-court|bar=0&t=3450&on=ssh&pc=ginger"
  "cat-house-notice|bar=0&t=800&on=plex&is=house&f=1&fa=0"
  "cat-house-alert|bar=0&t=12500&on=plex&is=house&f=1"
  "cat-house-stalk|bar=0&t=14500&on=plex&is=house&f=1"
  "cat-house-pounce|bar=0&t=15870&on=plex&is=house&f=1"
  "cat-house-poof|bar=0&t=15990&on=plex&is=house&f=1"
  "cat-house-pleased|bar=0&t=17200&on=plex&is=house&f=1"
  "cat-house-walk|bar=0&t=19500&on=plex&is=house&f=1"
  "cat-house-pounce-ginger|bar=0&t=15870&on=plex&is=house&f=1&pc=ginger"
  "cat-night-pounce|bar=0&t=15870&on=night&f=1"
  "cat-smithy-pounce|bar=0&t=15870&on=update&f=1"
  "cat-court-pounce|bar=0&t=15870&on=ssh&f=1"
  "cat-goblin-notice|bar=0&t=1500&is=battlement&e=goblin&f=1&fa=600"
  "cat-goblin-pounce|bar=0&t=22406&is=battlement&e=goblin&f=1&fa=600"
  "cat-camp-goblin-pounce|bar=0&t=22406&is=camp&e=goblin&f=1&fa=600"
  "cat-yard-crate-pounce|bar=0&t=22406&is=yard&e=crate&f=1&fa=600"
  "cat-house-three|bar=0&t=2300&is=house&f=5"
  "cat-cellar-none|bar=0&t=2300&on=disk&f=3"
  "cat-settings-pet|bar=0&t=2300&is=house&set=pet"
  "cat-settings-pet-tablet|bar=0&t=2300&is=house&set=pet|1480,924"
  "cat-settings-pet-ginger|bar=0&t=2300&is=house&set=pet&pc=ginger|1480,924"
  # the streams' line and badge, with the demo's invented streams: st= how many play (3 without
  # it), sm= the collector's setting show. The line takes each stream for 8 seconds by the clock,
  # so t=2300 shows the first of three and t=10300 the second. One stream has no "1 of 1"; titles
  # leaves the names out and count the titles too. Under a full disk and running hot, with two
  # streams, the badge stands beside +1 MORE at each headline size, and alone at court
  "streams-three-1|bar=0&t=2300&on=plex&st=3"
  "streams-three-2|bar=0&t=10300&on=plex&st=3"
  "streams-one|bar=0&t=2300&on=plex&st=1"
  "streams-titles|bar=0&t=10300&on=plex&sm=titles"
  "streams-count|bar=0&t=2300&on=plex&sm=count"
  "streams-badge-s|bar=0&t=2300&on=disk,cpu,plex&st=2&hs=s"
  "streams-badge-m|bar=0&t=2300&on=disk,cpu,plex&st=2&hs=m"
  "streams-badge-l|bar=0&t=2300&on=disk,cpu,plex&st=2&hs=l"
  "streams-badge-court|bar=0&t=3450&on=ssh,plex&st=2"
)

# The test world loaded (see worlds above). First the settings screen: the knight's page with the
# test world's body, skin and items beside the medieval world's, its own world in use with the open
# helm and a wine tabard over it, the monarch's page with its Captain, the cast, the scenes with a
# condition only the test world gives a second scene for, and the World page with the open helm
# changed from the world.
WORLD_SHOTS=(
  "worldmix-knight|bar=0&t=2300&is=battlement&set=knight&bd=test.orbit/body.unit&sk=test.orbit/chrome|1480,924"
  "worldmix-knight-orbit|bar=0&t=2300&is=battlement&set=knight&wd=test.orbit/world.orbit&hm=open&tb=wine|1480,924"
  "worldmix-monarch|bar=0&t=2300&is=battlement&set=monarch&mon=test.orbit/patron.captain|1480,924"
  "worldmix-cast|bar=0&t=2300&is=house&set=pet&wd=test.orbit/world.orbit|1480,924"
  "worldmix-scenes|bar=0&t=2300&is=battlement&set=scenes&sc=wan_down:test.orbit/deck|1480,924"
  "worldmix-world|bar=0&t=2300&is=battlement&set=world&wd=test.orbit/world.orbit&hm=open|1480,924"
  "worldmix-knight-small|bar=0&t=2300&is=battlement&set=knight&bd=test.orbit/body.unit&sk=test.orbit/chrome"
  # The wall in the test world chosen whole (wd=): the Deck while all is quiet, at the wide and the
  # 4:3 sizes too, with its devices (the VM and the plain box from the medieval world's set), and in
  # every condition it acts; the Airlock running hot; the Bridge with the Captain talking while a
  # shell is open and the workbench while updating. Then its events on the Deck: the moths swatted,
  # Glitch out of the floor at its rise, a moment after the pry bar's hit at 1682 and in the poof,
  # the crate and the feast; and the drone's catch on the Bridge, sitting up, at the top of the leap
  # 40 ms before it meets the moth at 15 910 and pleased, and on the Deck for a moth that came with
  # Glitch. Then the medieval world with the test world's parts: the Unit in chrome and panels at
  # the battlement and with the sword and shield in the yard, Glitch over the battlement's wall (hit
  # at 1668), the moths swatted, the Captain on the throne, the Airlock and the Deck for a condition,
  # the test world's words and overlay over the camp, quiet and under a warning, and its devices in
  # the camp's places. Last, the test world with medieval parts: the goblin out of the Deck's floor
  # (hit at 1668), and the Classic build in the knight's own colours.
  "orbit-deck|bar=0&t=2300&wd=test.orbit/world.orbit"
  "orbit-deck-wide|bar=0&t=2300&wd=test.orbit/world.orbit|1400,600"
  "orbit-deck-43|bar=0&t=2300&wd=test.orbit/world.orbit|960,720"
  "orbit-devices|bar=0&t=2300&wd=test.orbit/world.orbit&dv=pi,camera,camera!,machine-,vm,x"
  "orbit-devices-bridge|bar=0&t=3450&on=ssh&wd=test.orbit/world.orbit&dv=pi!,camera,camera,machine,vm!,x"
  "orbit-device-down|bar=0&t=2300&on=device&wd=test.orbit/world.orbit&dv=pi,camera,camera,machine!,vm,x"
  "orbit-attack|bar=0&t=2300&on=attack&wd=test.orbit/world.orbit"
  "orbit-wan|bar=0&t=2300&on=wan&wd=test.orbit/world.orbit"
  "orbit-sick|bar=0&t=2300&on=sick&wd=test.orbit/world.orbit"
  "orbit-disk|bar=0&t=2300&on=disk&wd=test.orbit/world.orbit"
  "orbit-backup|bar=0&t=2300&on=backup&wd=test.orbit/world.orbit"
  "orbit-pi|bar=0&t=2300&on=pi&wd=test.orbit/world.orbit"
  "orbit-cpu|bar=0&t=2300&on=cpu&wd=test.orbit/world.orbit"
  "orbit-swap|bar=0&t=2300&on=swap&wd=test.orbit/world.orbit"
  "orbit-ssh|bar=0&t=3450&on=ssh&wd=test.orbit/world.orbit"
  "orbit-update|bar=0&t=1250&on=update&wd=test.orbit/world.orbit"
  "orbit-plex|bar=0&t=2300&on=plex&wd=test.orbit/world.orbit"
  "orbit-night|bar=0&t=2300&on=night&wd=test.orbit/world.orbit"
  "orbit-swat|bar=0&t=470&f=6&sw=1&wd=test.orbit/world.orbit"
  "orbit-glitch-rise|bar=0&t=460&e=goblin&wd=test.orbit/world.orbit"
  "orbit-glitch-bonk|bar=0&t=1682&e=goblin&wd=test.orbit/world.orbit"
  "orbit-glitch-poof|bar=0&t=1900&e=goblin&wd=test.orbit/world.orbit"
  "orbit-crate|bar=0&t=1700&e=crate&wd=test.orbit/world.orbit"
  "orbit-feast|bar=0&t=1800&e=feast&wd=test.orbit/world.orbit"
  "orbit-drone-alert|bar=0&t=12500&on=ssh&f=1&wd=test.orbit/world.orbit"
  "orbit-drone-pounce|bar=0&t=15870&on=ssh&f=1&wd=test.orbit/world.orbit"
  "orbit-drone-pleased|bar=0&t=17200&on=ssh&f=1&wd=test.orbit/world.orbit"
  "orbit-drone-glitch-pounce|bar=0&t=22406&e=goblin&f=1&fa=600&wd=test.orbit/world.orbit"
  "orbit-mix-unit|bar=0&t=2300&is=battlement&bd=test.orbit/body.unit&sk=test.orbit/chrome&hc=test.orbit/wire&tb=test.orbit/panel&pm=test.orbit/beacon"
  "orbit-mix-unit-arm|bar=0&t=2470&on=cpu&arm=one&bd=test.orbit/body.unit&sk=test.orbit/chrome"
  "orbit-mix-glitch|bar=0&t=1668&is=battlement&e=goblin&fo=test.orbit/foe.glitch"
  "orbit-mix-moths|bar=0&t=470&is=battlement&f=6&sw=1&cr=test.orbit/critter.moth"
  "orbit-mix-captain|bar=0&t=3450&on=ssh&mon=test.orbit/patron.captain"
  "orbit-mix-airlock|bar=0&t=2300&on=cpu&sc=cpu_hot:test.orbit/airlock"
  "orbit-mix-deck|bar=0&t=2300&on=wan&sc=wan_down:test.orbit/deck"
  "orbit-mix-words|bar=0&t=2300&is=camp&wo=test.orbit/words.orbit&ov=test.orbit/overlay.orbit"
  "orbit-mix-overlay-warn|bar=0&t=2300&on=disk&wo=test.orbit/words.orbit&ov=test.orbit/overlay.orbit"
  "orbit-mix-props|bar=0&t=2300&is=camp&pr=test.orbit/props.orbit&dv=pi,camera,camera!,machine-,vm,x"
  "orbit-swap-goblin|bar=0&t=1668&e=goblin&wd=test.orbit/world.orbit&fo=goblin"
  "orbit-swap-classic|bar=0&t=2300&wd=test.orbit/world.orbit&bd=a&sk=warm&hc=brown&tb=blue&pm=red"
)

# The acts with a weapon that fires, from the same copy with the test world's file of format 1.2 in
# place of its 1.1 file (the same id, so one or the other is loaded): its world carries the blaster
# with the deflector, and arm= chooses the blaster (with sh= its deflector) or the prod in the
# medieval world. docs/shots.md says what each shows.
FIRE_SHOTS=(
  # the test world with its blaster and deflector: standing, the swat by shot (a bolt in flight on
  # the right, the turn across the body with the shield lifted, a bolt on the left), Glitch shot
  # from range (the watcher stepping back, aimed just before the shot with Glitch's own tracer at the
  # deflector, the bolt in flight, the hit, the return with the shield lifted), the attack aimed and
  # the blaster holstered on a full disk
  "orbit-fire-deck|bar=0&t=2300&wd=test.orbit/world.orbit"
  "orbit-fire-swat|bar=0&t=1090&f=6&sw=1&wd=test.orbit/world.orbit"
  "orbit-fire-swat-turn|bar=0&t=1230&f=6&sw=1&wd=test.orbit/world.orbit"
  "orbit-fire-swat-left|bar=0&t=1690&f=6&sw=1&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-step|bar=0&t=450&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-aim|bar=0&t=1395&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-shot|bar=0&t=1440&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-hit|bar=0&t=1500&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-return|bar=0&t=1760&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-attack|bar=0&t=2300&on=attack&wd=test.orbit/world.orbit"
  "orbit-fire-disk|bar=0&t=2300&on=disk&wd=test.orbit/world.orbit"
  # the medieval world with the blaster: practice from 300 short of the dummy (the bolt in flight,
  # the dummy struck with the burst), the same running hot, the goblin shot after the step back, the
  # blaster on the house's pegs and on the anvil with no hot tip, and holstered in the cellar
  "orbit-fire-practice|bar=0&t=490&is=yard&kx=82&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-practice-hit|bar=0&t=560&is=yard&kx=82&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-practice-hot|bar=0&t=2600&on=cpu&kx=82&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-goblin-step|bar=0&t=500&is=battlement&e=goblin&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-goblin-shot|bar=0&t=1440&is=battlement&e=goblin&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-goblin-hit|bar=0&t=1490&is=battlement&e=goblin&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-house|bar=0&t=2300&is=house&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-update|bar=0&t=1250&on=update&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  "orbit-fire-cellar|bar=0&t=2300&on=disk&arm=test.orbit/main.blaster&sh=test.orbit/off.deflector"
  # the prod, both swung and fired: the swat swung, the goblin within its blade's reach bonked and
  # beyond it shot with the beam, practice by beam, its blade's hot tip on the anvil, and slung on
  # the back in the cellar
  "orbit-fire-prod-swat|bar=0&t=470&is=battlement&f=6&sw=1&arm=test.orbit/main.prod"
  "orbit-fire-prod-bonk|bar=0&t=1660&is=battlement&e=goblin&arm=test.orbit/main.prod"
  "orbit-fire-prod-beam|bar=0&t=1420&is=battlement&e=goblin&kx=152&arm=test.orbit/main.prod"
  "orbit-fire-prod-practice|bar=0&t=470&is=yard&kx=82&arm=test.orbit/main.prod"
  "orbit-fire-prod-update|bar=0&t=1250&on=update&arm=test.orbit/main.prod"
  "orbit-fire-prod-cellar|bar=0&t=2300&on=disk&arm=test.orbit/main.prod"
  # Glitch fires first, at 1350, its tracer drawn and the watcher's eyes wide: stopped at the
  # deflector with the spark; missing over the head with the prod, which carries no shield; stopped
  # at the heater shield and missing over the greatsword's knight on the battlement; missing over
  # the base pack's crossbow's knight there, who carries no shield; and, with the watcher left of
  # the Deck's foe zone so Glitch stands on the right, missing over the head with the deflector
  # carried, the known limit
  "orbit-fire-glitch-fire|bar=0&t=1370&e=goblin&wd=test.orbit/world.orbit"
  "orbit-fire-glitch-miss|bar=0&t=1370&e=goblin&wd=test.orbit/world.orbit&arm=test.orbit/main.prod"
  "orbit-fire-glitch-heater|bar=0&t=1370&is=battlement&e=goblin&arm=one&fo=test.orbit/foe.glitch"
  "orbit-fire-glitch-overhead|bar=0&t=1370&is=battlement&e=goblin&fo=test.orbit/foe.glitch"
  "orbit-fire-glitch-crossbow|bar=0&t=1370&is=battlement&e=goblin&arm=crossbow&fo=test.orbit/foe.glitch"
  "orbit-fire-glitch-right|bar=0&t=1370&e=goblin&kx=40&wd=test.orbit/world.orbit"
)

take() {
  local dir="$1"
  shift
  local list=("$@")
  [[ ${#list[@]} -gt 0 ]] || list=("${SHOTS[@]}")
  if [[ -z "${CHROME:-}" || ! -x "$CHROME" ]]; then
    echo "shots: set CHROME to a headless Chromium binary" >&2
    exit 2
  fi
  local page="${PAGE:-$root/web/index.html}"
  mkdir -p "$dir"
  local entry name hash size missed=()
  for entry in "${list[@]}"; do
    name="${entry%%|*}"
    hash="${entry#*|}"
    size=960,600
    if [[ "$hash" == *"|"* ]]; then size="${hash#*|}"; hash="${hash%%|*}"; fi
    # a file left from an earlier run must not pass for this one's
    rm -f "$dir/$name.png"
    "$CHROME" --no-sandbox --hide-scrollbars --window-size="$size" --virtual-time-budget=1500 \
      --screenshot="$dir/$name.png" "file://$page#$hash" </dev/null >/dev/null 2>&1 || true
    if [[ -s "$dir/$name.png" ]]; then echo "took $name"; else echo "shots: the browser wrote no screenshot for $name" >&2; missed+=("$name"); fi
  done
  if [[ ${#missed[@]} -gt 0 ]]; then
    echo "shots: ${#missed[@]} of ${#list[@]} shots were not written: ${missed[*]}" >&2
    exit 1
  fi
}

# A copy of web/ outside the repository with the test world's carrier added after the medieval
# world's, as docs/tests.md does it by hand; the shots of WORLD_SHOTS are taken from it, and it
# is removed afterwards.
worlds() {
  local dir="$1" tmp
  tmp="$(mktemp -d)"
  # removed on return, and on an exit from take when a shot was not written
  trap 'rm -rf "${tmp:-}"' RETURN EXIT
  cp -r "$root/web" "$tmp/web"
  cp "$root/tests/web/fixtures/worlds/test.orbit.pack.json" "$tmp/web/packs/"
  node "$root/tools/pack-carrier.js" "$tmp/web/packs/test.orbit.pack.json" >/dev/null
  sed -i 's#<script src="packs/medieval.pack.js"></script>#&\n<script src="packs/test.orbit.pack.js"></script>#' "$tmp/web/index.html"
  grep -q 'packs/test.orbit.pack.js' "$tmp/web/index.html" || { echo "shots: the test world's carrier was not added" >&2; exit 2; }
  PAGE="$tmp/web/index.html" take "$dir" "${WORLD_SHOTS[@]}"
  # the same copy with the file of format 1.2 behind the same carrier
  cp "$root/tests/web/fixtures/worlds/test.orbit-fire.pack.json" "$tmp/web/packs/test.orbit.pack.json"
  node "$root/tools/pack-carrier.js" "$tmp/web/packs/test.orbit.pack.json" >/dev/null
  grep -q 'main.blaster' "$tmp/web/packs/test.orbit.pack.js" || { echo "shots: the test world's file of format 1.2 was not put in" >&2; exit 2; }
  PAGE="$tmp/web/index.html" take "$dir" "${FIRE_SHOTS[@]}"
}

compare() {
  local names=() entry list=("${SHOTS[@]}")
  [[ "${WHICH:-}" == worlds ]] && list=("${WORLD_SHOTS[@]}" "${FIRE_SHOTS[@]}")
  for entry in "${list[@]}"; do names+=("${entry%%|*}"); done
  python3 -I - "$1" "$2" "${names[@]}" <<'PY'
import struct, sys, zlib

# The clock sits in the top right corner. Its region is left out of the comparison. At 960 by 600
# its ink reaches x 752 and y 20 to 85 at the widest hour, one starting with 2, so the mask starts
# 12 pixels further left to leave room for a scene that lays the text out a pixel differently. The
# words are sized to the window, so a shot of another size of the same shape, such as the tablet's
# 1480 by 924, has its mask scaled with it.
MASK_X0, MASK_Y1 = 740, 110

def decode(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(path + " is not a PNG")
    pos, idat, ihdr = 8, b"", None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    w, h, depth, ctype = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    if depth != 8 or ctype not in (2, 6):
        raise ValueError(path + ": only 8-bit RGB or RGBA is handled")
    bpp = 4 if ctype == 6 else 3
    raw, stride, rows, prev = zlib.decompress(idat), w * bpp, [], bytearray(w * bpp)
    for y in range(h):
        ft = raw[y * (stride + 1)]
        cur = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = cur[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1: cur[i] = (cur[i] + a) & 255
            elif ft == 2: cur[i] = (cur[i] + b) & 255
            elif ft == 3: cur[i] = (cur[i] + (a + b) // 2) & 255
            elif ft == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(cur)); prev = cur
    return w, h, bpp, rows

ref, res, names = sys.argv[1], sys.argv[2], sys.argv[3:]
bad = 0
for name in names:
    a, b = f"{ref}/{name}.png", f"{res}/{name}.png"
    try:
        with open(a, "rb") as fa, open(b, "rb") as fb:
            if fa.read() == fb.read():
                print(f"same   {name} (identical bytes)"); continue
        wa, ha, pa, ra = decode(a); wb, hb, pb, rb = decode(b)
    except (OSError, ValueError) as e:
        print(f"ERROR  {name}: {e}"); bad += 1; continue
    if (wa, ha) != (wb, hb):
        print(f"DIFF   {name}: size {wa}x{ha} against {wb}x{hb}"); bad += 1; continue
    diff = 0
    for y in range(ha):
        if ra[y] == rb[y]: continue
        for x in range(wa):
            if y < MASK_Y1 * ha / 600 and x >= MASK_X0 * wa / 960: continue
            if ra[y][x * pa:x * pa + 3] != rb[y][x * pb:x * pb + 3]: diff += 1
    if diff:
        print(f"DIFF   {name}: {diff} pixels differ outside the clock"); bad += 1
    else:
        print(f"same   {name} (pixels equal outside the clock)")
print(f"{len(names) - bad} of {len(names)} match")
sys.exit(1 if bad else 0)
PY
}

case "${1:-}" in
  take) [[ $# -eq 2 ]] || { echo "usage: $0 take DIR" >&2; exit 2; }; take "$2" ;;
  compare) [[ $# -eq 3 ]] || { echo "usage: $0 compare REFERENCE_DIR RESULT_DIR" >&2; exit 2; }; compare "$2" "$3" ;;
  worlds) [[ $# -eq 2 ]] || { echo "usage: $0 worlds DIR" >&2; exit 2; }; worlds "$2" ;;
  compare-worlds) [[ $# -eq 3 ]] || { echo "usage: $0 compare-worlds REFERENCE_DIR RESULT_DIR" >&2; exit 2; }; WHICH=worlds compare "$2" "$3" ;;
  *) echo "usage: $0 take DIR | compare REFERENCE_DIR RESULT_DIR | worlds DIR | compare-worlds REFERENCE_DIR RESULT_DIR" >&2; exit 2 ;;
esac
