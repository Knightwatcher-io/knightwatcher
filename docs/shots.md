# The screenshots

For contributors: the regression screenshots of the page, which show a change that should not
alter how the page looks did not. `tools/shots.sh` takes them in a headless Chromium and compares
two sets:

| Mode | Does |
|---|---|
| `take DIR` | opens the page from disk once for each of the 294 shots of the main set, with time frozen by the address's `t=`, and writes `DIR/<name>.png` at 960 by 600, or at the size the shot names |
| `compare REF NEW` | decodes each pair of PNGs by name and counts the pixels that differ outside the clock; a pair of different sizes, or one missing or unreadable, is a failure |
| `worlds DIR` | copies `web/` to a folder of its own outside the repository, adds the test world's carrier, takes the 47 shots of the worlds' set from that copy (7 `worldmix-`, 40 `orbit-`), puts the test world's copy of format 1.2 behind the same carrier, takes the 32 `orbit-fire-` shots, and removes the copy |
| `compare-worlds REF NEW` | compares two sets that `worlds` took |

`take` and `worlds` need `CHROME`, the path of a headless Chromium, and `PAGE` names another copy of
the page for `take` to shoot, such as one kept outside the repository. The comparison needs
`python3`. The script runs itself inside the ceiling of `tools/capped.sh` unless `KW_CAPPED` says it
already is ([development.md](./development.md#checks)). It exits 2 on a wrong mode or a missing
`CHROME`. `take` and `worlds` exit 1 when the browser wrote no file for a shot, naming each such
shot after taking the rest; a file left from an earlier run does not count, since each is removed
before its shot is taken. `compare` exits 1 when any pair differs or is missing. Each shot is a line
of `SHOTS` or `WORLD_SHOTS` in the script: `name|address hash`, with `|width,height` after it for
another size.

## Taking and comparing them


The regression screenshots, with `CHROME` pointing at a headless Chromium. Take a reference set
before a change and a result set after it, both outside the repository, then compare them. The
comparison leaves the clock out, since its digits change with the minute.

```bash
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-ref
CHROME=/path/to/chrome-headless-shell tools/shots.sh take /tmp/kw-new
tools/shots.sh compare /tmp/kw-ref /tmp/kw-new
```

Besides the scenes and states, the set shoots devices: the camp with two cameras and four
devices, a camera and a machine down and one device with no place left (`devices-camp`), the court
with the same mix (`devices-court`), `device_down` in the camp (`device-down`) and the yard's places
outlined (`places-yard`). Every other shot has no `dv=` apart from `goblin-camp-g3` and the `ref-`
shots of devices (below), so a change to devices that leaves a Pi-only setup alone leaves the rest
byte for byte the same.

The seven `goblin-` shots play the goblin's event with the greatsword: on the battlement as it
rises over the wall (`goblin-rise`), at the hit (`goblin-bonk`, 1657 ms) and in the puff
(`goblin-poof`); at the camp as it comes out of its hole (`goblin-camp-rise`), at the hit
(`goblin-camp-bonk`, 1661 ms) and in the puff (`goblin-camp-poof`); and at the camp with three
devices on the ground, which it stands clear of, as it pulls a face (`goblin-camp-g3`). At the hit
the goblin still holds its brace, squashed, as it does for 16 ms after a blade's blow.

The nine `arm-` shots draw the arming sword and the heater shield (`arm=one`): the quiet battlement
(`arm-battlement`), the yard's hot training (`on=cpu`) mid-swing (`arm-yard`), the attack
(`arm-attack`), the house with the sword on the pegs and the shield on the wall (`arm-house`), the
smithy with the sword on the anvil and the shield on the wall (`arm-update`), the swat to the left
at the moment the sword passes in front of the shield (`arm-swat-left`), the cellar with the
crate carried against the chest, at the largest headline (`arm-disk`), and the goblin a
millisecond after the hit on the battlement (`arm-goblin-bonk`, hit at 1703 ms) and at the camp,
with the blade over the shield (`arm-goblin-camp-bonk`, hit at 1710 ms), the sword's tapered point
on the pot. Every other shot but `settings-look` has no `arm=`, so a change to the one-handed look leaves them
byte for byte the same. A copy of the page from before the hook draws the greatsword in the `arm-`
shots, so against such a reference those differ and the rest compare as usual.

The eleven settings shots, after the `look-` shots, show the settings. `settings-knight`,
`settings-monarch`, `settings-display`, `settings-quiet` and `settings-status` open the screen
(`set=`) on each page over the battlement; `settings-hold` shows the hold's cue; `settings-look` the
knight's page with a look of the hooks', the sword and shield, tan skin, blonde curls, a forest
tabard and a gold plume; `settings-tablet` the knight's page at the tablet's 1480 by 924 (an entry
may name a size after a second `|`, and the comparison scales the clock's mask with the shot);
`settings-monarch-skin` the monarch's page with monarch B in the deep skin; `clock-12` the 12-hour
clock (`ck=12`), whose digits the comparison leaves out with the rest of the clock; and `mon-skin`
the court with monarch C in the brown skin (`ms=brown`). Against a reference from before the
settings these eleven are missing and the rest compare as usual.

The eleven shots after them show the monarch's colours and the scenes chosen per condition.
`settings-monarch-colours` is the monarch's page at the tablet's size, where the Hair colour and
Robe rows show, with monarch C in auburn hair and a teal robe (`mh=`, `mr=`); `mon-a-colours`,
`mon-b-colours` and `mon-c-colours` put each monarch at court in a hair and a robe of the hooks',
and `mon-a-colours-tan`, `mon-b-colours-deep` and `mon-c-colours-fair` in another pair on another
skin. `settings-scenes` opens the Scenes page, and `settings-scenes-tablet` the same at the
tablet's size with the attack set to the camp by the address (`sc=`); `scene-cpu-camp` shows
running hot at the camp, and `scene-pi-battlement` the empty dish stared at from the battlement.
Against a reference from before these, the eight settings shots that show the rail differ in it
(the Scenes entry), `settings-monarch` and `settings-monarch-skin` also in the rows below the skin
tones, these eleven are missing, and the rest compare as usual.

Ten shots show the smithy's three acts. `update-strike` is the hammer's face on the blade 4 ms
into the blow (`t=2804`), with the sparks and the eyes shut, and `bd-b-update-strike` and
`bd-c-update-strike` the same on Broad and Slim, the face on the same spot of the blade. The quench
plays in the smithy as a quiet scene (`is=smithy`): the blank heating in the fire at the forge
(`is-smithy-forge`, 600 ms), plunged into the barrel in a burst of steam with the eyes shut
(`is-smithy-steam`, 5950) and held up to be looked over, the glint on it and a smile
(`is-smithy-look`, 8800); and with a device in every place at the forge (`is-smithy-forge-devices`,
the head over the owls in `h1` and `h2`) and at the barrel (`is-smithy-barrel-devices`, 6600, the
boots over the ground place `g3`), the two overlaps [page.md](./page.md#devices) accepts. The
bellows pressed while the CPU runs hot, the forge flared (`cpu-smithy`, `sc=cpu_hot:smithy`,
240 ms), with the greatsword on the anvil and with the arming sword there and the shield on the wall
(`arm-cpu-smithy`). Each moment is away from a blink. Against a reference from before the three
acts they are missing.

The seven `look-` shots choose free options with the look hooks: deep skin with black curls, a
sable tabard and a gold plume on the battlement, helm off (`look-deep-curls`); fair skin with
auburn hair tied back, a wine tabard and the sword and shield in the yard, helm off
(`look-fair-tied`), and the same with the helm on, the tail showing below it, and a white plume
(`look-tied-helmet`); golden skin with blonde hair, a teal tabard, the shield on the house's wall
and a royal blue plume on the helmet on the stool (`look-house`); a sick face in bed on the deep
skin, with dark brown hair tied back (`look-sick-deep`); a hot face on the brown skin with silver
curls in the yard (`look-hot-brown`); and the wide eyes of WAN down on the brown skin with brown
hair, whose brows draw the dark edge (`look-brows`). Every other shot but `settings-look` uses no look hook but
`arm=`, so against a copy of the page from before the hooks only these seven differ.

The 56 `bd-` shots follow, 28 for Broad (`bd-b-`, `bd=b`) and 28 for Slim (`bd-c-`, `bd=c`): the
four quiet scenes with the knight standing (`is-`); the attack, tight memory's bloat, the cellar's
crate carried, the smithy's hammering, asleep in bed, the sick tint in bed, the hot tint in the yard
and the court (`on-`); the stance with the sword and shield (`arm-battlement`); the swat on the
battlement, which is the swing, with each weapon (`swing-two-`, `swing-one-`), both ways at the
wind-up (q .3), mid cut (q .42) and the cut's end (q .55); the goblin about each weapon's hit on
that build (`goblin-bonk` at 1660 and 1657 ms, a millisecond after the greatsword's hits, the goblin
still braced; `arm-goblin-bonk` at 1708 and 1700, after the arming sword's hits of 1707 and
1699);
and the settings screen's knight page with the build chosen (`settings-knight`), the build chosen by
the address's `bd=` hook. No other shot has `bd=`, so they change nothing else in a comparison, and
against a reference from before them they are missing.  The 62 `ref-` shots follow the builds'
shots. They are the reference for moving the scenes into pack data, taken with the call records of
`tests/web/scenes.test.js`, and show each state of a scene that no shot above shows: each condition
in each scene that can act it, chosen with `sc=` or played in a quiet scene with `is=`
(`ref-battlement-backup` to `ref-cellar-cpu`, seventeen); the helmet on in the house
(`ref-house-helm-on`); the smithy with the hammer raised (`ref-smithy-lift`); the yard's dummy
struck, its straw flying (`ref-yard-struck`); each monarch in each skin no shot above shows
(`ref-mon-`, fourteen); the devices in all seven places, all up and all gone and alerting, in every
scene (`ref-devices-up-` and `ref-devices-gone-`); and every scene at 1400 by 600 (`ref-wide-`) and
at 960 by 720, a 4:3 screen (`ref-43-`), the only shots of a scene out to edges beyond the grid's.
Against a reference from before them they are missing. At 4:3 the clock is larger for the width, and
the left edge of its first digit, from x 728, lies outside the comparison's mask, which starts at
740; so a reference and a result taken either side of 10:00, 20:00 or midnight differ in the
`ref-43-` shots there.

The 34 `free-` shots after them show the base pack's free items of 1.4.0, chosen with `arm=`
(`longsword`, `mace_and_shield`) and the gear's hooks (`sh=`, `hm=`, `ps=`, `bo=`, `so=`, `am=`,
`hn=`, `lg=`, `ft=`, `bk=`): the longsword standing and in the swat both ways; the mace with the
round shield, in the attack and the swat to the left with the kite shield; the kite shield in the
yard and the round in the swat to the left with the arming sword; the mace's head hot on the
smithy's anvil; the house with the kettle hat and its feather, the mail coif and the bascinet on
the stool and each weapon and shield at rest; three whole looks, one per new helmet, on the
battlement, at the camp and in the yard; the long hair and the close crop, the long hair under the
bascinet and on the sleeper's pillow; the long cloak in the attack, the short cape with the
cellar's crate and the breastplate and cloak in the bloat; whole looks, the swat and the attack and
the new hair on Broad (`free-bd-b-`) and Slim (`free-bd-c-`); and the settings screen's knight
page at 1480 by 2800 with every row in view, as the defaults leave it (the shield greyed beside the
greatsword), with the mail coif and the long cloak (the plume's style greyed, its colour live for
the cloak), and with a whole new look on Broad and on Slim. Against a reference from before them
they are missing. Against a reference from base pack 1.3.0 the six settings shots of the knight's
page and of the status differ too: the weapon and hair style rows gained choices, and the status
names the base pack's version and whether it is signed.

The 17 `free-crossbow-` shots after them show the base pack's crossbow of 1.5.0, the weapon that
fires, chosen with `arm=crossbow`: standing on the battlement; the swat by shot (`f=6&sw=1`), a
bolt's burst at a fly on the right (1 090), the turn across the body (1 230) and a shot to the left
(1 690); practice from 300 short of the dummy (`kx=82`) with the bolt in flight (490) and the dummy
struck (560); the goblin on the battlement with the watcher stepping back (500), the bolt in flight
(1 440) and the hit (1 470), and the bolt in flight at the camp (1 440); the attack aimed; the
crossbow on the house's pegs and across the smithy's anvil, cold; slung across the back in the
cellar; the swat to the left on Broad and the attack on Slim; and the settings screen's knight page
at 1480 by 2800 with the crossbow chosen and the shield greyed beside it. Against a reference from
before the crossbow they are missing.

The four shots after them show the worlds. `settings-world` opens the World page over the
battlement with nothing set, and `settings-world-tablet` the same over the camp at the tablet's
size; `settings-world-changed` has the weapon and the tabard the address changes from the world
(`arm=one`, `tb=forest`), each beside the world's own, under a card that still shows the world as it
comes; and `settings-status-world` is the status page at the tablet's size, whose World, Parts and
Fallbacks entries show that tabard and a full disk asked for in the camp, which cannot act it
(`sc=disk_full:camp`). Against a reference from before worlds these four are missing, and every
settings shot that shows the rail differs in it, where World was added first; `settings-status`
differs in its entries too, where the Knight entry gave way to World, Parts and Fallbacks.

Against a reference from before parts could be mixed across worlds, every settings shot that shows
the rail differs in it, where the pet's page became "The cast"; the cat's settings shots
(`cat-settings-`) show the cast's page, with the foe and the pest under the pet; and each settings
shot whose address changes a part from the world shows that row's blue mark and line
(`settings-look`, `settings-monarch-skin`, `settings-monarch-colours`, `settings-scenes-tablet`,
the `bd-` and `free-settings-` shots of the knight's page), which moves the rows under it down.

`tools/shots.sh worlds DIR` takes the `worldmix-` shots: the settings screen with the test world
loaded beside the medieval one, from a copy of `web/` it makes outside the repository with the test
world's carrier added, and removes ([tests.md](./tests.md#the-test-world)), all at the
tablet's size but the last. `worldmix-knight` is the knight's page with the test world's body and
chrome skin chosen by the address, each row with the test world's choices after ORBIT and the two
rows marked as changed from the medieval world; `worldmix-knight-orbit` has the test world in use
with the open helm and a wine tabard over it, its choices first and the medieval world's after
MEDIEVAL; `worldmix-monarch` seats its Captain on the medieval throne, the rail and the row calling
it the patron and its colours greyed, since it binds none; `worldmix-cast` is the cast's page in the
test world, its drone at home on the Deck; `worldmix-scenes` gives the WAN going down the Deck, a
condition only the battlement acts in the medieval world; `worldmix-world` is the World page with
the open helm changed from the test world's dome; and `worldmix-knight-small` is the first at 960
by 600. `tools/shots.sh compare-worlds` compares two such sets.

The same run takes the 40 `orbit-` shots of the wall with the test world loaded. With the test world
chosen whole (`wd=test.orbit/world.orbit`): the Deck while all is quiet, at 1400 by 600 and at 4:3
too; its devices, the VM and the plain box drawn from the medieval world's set, on the Deck and on
the Bridge; each condition the Deck acts; the Airlock running hot; the Bridge with the Captain
talking while a shell is open (`orbit-ssh`, 3 450) and the workbench while updating; the moths
swatted (`orbit-swat`); Glitch out of the Deck's floor at its rise, at the pry bar's hit at 1 682 and
in the poof; the crate and the feast; the drone on the Bridge sitting up (12 500), at the top of the
leap 40 ms before it meets the moth at 15 910, and pleased; and on the Deck for a moth that came with
Glitch, at 22 406. Then the medieval world with the test world's parts (`orbit-mix-`): the Unit in
chrome and panels at the battlement, and with the sword and shield in the yard; Glitch over the
battlement's wall (`fo=`, hit at 1 668); the moths swatted (`cr=`); the Captain on the throne; the
Airlock and the Deck for a condition (`sc=`); the test world's words and overlay over the camp and
under a warning (`wo=`, `ov=`); and its devices in the camp's places (`pr=`). Last, the test world
with medieval parts (`orbit-swap-`): the goblin out of the Deck's floor and the Classic build in the
knight's own colours.

The same run then puts the test world's copy of format 1.2 in place of its 1.1 file, behind the
same carrier (the two share an id, so one or the other is loaded), and takes the 32 `orbit-fire-`
shots of the acts with a weapon that fires. The copy's world carries the blaster with the deflector;
`arm=` and `sh=` with a long name choose the blaster and the deflector, or the prod, in the medieval
world ([display.md](./display.md#the-address)). In the test world: the Deck while all is quiet; the
swat by shot (`f=6&sw=1`) with a bolt in flight on the right (1 090), the turn across the body with
the shield lifted (1 230) and a bolt on the left (1 690); Glitch shot from range, the watcher
stepping back while it climbs (450), aimed just before the shot (1 395), the bolt in flight
(1 440), the hit (1 500) and the return with the shield lifted (1 760); the attack aimed; and the
blaster holstered on a full disk. Glitch fires too, from 1 350: from 1 230 it stands in its `aim`
pose, and in the shots at 1 395 and 1 440 its tracer and the watcher's wide eyes show beside the
watcher's own bolt. In the medieval world with the blaster: practice from 300 short
of the dummy (`kx=82`) with the bolt in flight (490) and the dummy struck with the burst (560), the
same running hot (2 600); the goblin with the watcher stepping back (500), the bolt (1 440) and
the hit (1 490); the blaster on the house's pegs, spaced from its barrel; on the anvil with no hot
tip; and holstered in the cellar. With the prod, which is both: the swat swung (470); the goblin
within its blade's reach bonked (1 660) and, with the watcher placed beyond it (`kx=152`), shot
with the beam (1 420); practice by beam (470); its blade's hot tip on the anvil; and slung across
the back in the cellar. Last, Glitch's own shot at 1 370, its tracer drawn and the watcher's eyes
wide: stopped at the deflector with the spark (`orbit-fire-glitch-fire`); missing over the head
with the prod, which carries no shield (`-miss`); in the medieval battlement (`fo=`), stopped at the
heater shield of the arming sword (`-heater`), missing over the greatsword's knight
(`-overhead`) and over the knight with the base pack's crossbow, who carries no shield
(`-crossbow`); and with the watcher placed left of the Deck's foe zone (`kx=40`), so that Glitch
stands on the right, missing overhead with the deflector carried, the known limit (`-right`). A
reference from before the acts that fire has none of these, and the comparison reports them
missing; every other shot is the same, since the shots before them choose no weapon that fires.
Against a
reference from before Glitch fired, three shots differ: `orbit-fire-glitch-aim` (1 395) and
`-shot` (1 440), by Glitch's aim pose, its tracer and spark and the watcher's wide eyes, and `-hit`
(1 500) by the eyes alone, which are wide until 1 550. `-step` (450) and `-return` (1 760) are the
same, and the five Glitch shots at 1 370 are missing. Against a reference from before the crossbow
`orbit-fire-glitch-crossbow` is missing.

The 28 `cat-` shots show the mouser cat. Every shot above shows it resting at its
spot in its calico coat; these show it in the ginger coat (`pc=ginger`) at each of its eight spots
(`cat-ginger-`), and catching. One fly (`f=1`) in the house while streaming comes at -5000 ms and
buzzes until 13 730: the cat looks up at a fly that comes at 0 (`cat-house-notice`, `fa=0`), sits
up alert as the fly comes down (`cat-house-alert`, 12 500), stalks (`cat-house-stalk`, 14 500), is
at the top of the leap 40 ms before its paw meets the fly at 15 910 (`cat-house-pounce`, in ginger
too), lands with the fly in the poof (`cat-house-poof`), is pleased (`cat-house-pleased`) and walks
back (`cat-house-walk`). The same leap is shot at the foot of the bed at night, dimmed
(`cat-night-pounce`), on the smithy's forge ledge and on the court's dais step. A fly that comes
with the goblin at 600 ms (`e=goblin&f=1&fa=600`) is the cat's, since the knight is busy: the cat
looks up at it with the goblin on the wall (`cat-goblin-notice`), and leaps for it at 22 406, long
after the goblin has gone, on the battlement, at the camp and, with the crate, in the yard. Five
flies in the house leave three on screen (`cat-house-three`), and the cellar, a warning, has none
(`cat-cellar-none`). The settings screen's cast page (`set=pet`) shows at 960 by 600 and at the tablet's size,
in calico and in ginger (`cat-settings-`). A copy of the page from before the cat ignores `pc=`
and `fa=` and draws no cat, so against it every shot differs: a scene by the cat's 2 756 pixels at
the most where it rests (the curl), the `cat-` shots more, and the settings shots in the rail too,
where the pet's page was added, which on a small window now has its entries 48 pixels tall and 6
apart, so that eight fit.

The nine `streams-` shots that end the set show the streams, with the demo's three invented
streams (`st=` how many play, `sm=` the collector's setting `show`). In the house, at the medium
headline: three streams on the first (`streams-three-1`, `t=2300`) and the second
(`streams-three-2`, `t=10300`), since the line takes each for eight seconds by the clock; one
stream, with no `1 of 1` (`streams-one`); the titles alone (`streams-titles`, on the second); and
the count alone (`streams-count`, `3 streams`). Under a full disk and running hot with two streams
the badge `2 STREAMING` stands beside `+1 MORE` at each headline size (`streams-badge-s`, `-m` and
`-l`), and alone at court (`streams-badge-court`). Against a reference from before the streams'
sessions these nine are missing, and the nine shots that show streaming differ in their words:
`on-plex`, whose headline was `NOW SHOWING`, and the eight `cat-house-` shots, where the line now
names whoever watches and moves on to the next stream by the frozen time.

Headless Chromium paints few animation frames, and how many depends on how busy the machine is.
Freeze time with `t=` for screenshots, and never make the first frame wait on elapsed time or fade
in. With time frozen the events and the swat start before the first frame and nothing advances from
one frame to the next, so every shot depends only on its address: two takes of the same tree come
out byte for byte the same, on a busy machine too, apart from the clock when the minute turns.

The repository's page is a `dev` page, so the screenshots show the knight drawn from the base pack
and every scene, device and member of the cast drawn from the medieval world's pack, with its words
and its overlay. A deployed copy draws from each pack while it ships signed, and from code
otherwise: today the knight from the base pack 1.5.1 and everything else, words and overlay included,
from the medieval world's pack 0.8.0, both signed.
`shots.sh` shoots only from disk, so to look at a deployed copy and its downloaded packs, serve it
on the loopback address and point the headless browser at `index.html?demo#<hash>` by hand: `?demo`
starts the demo at once instead of waiting for a state file, and a served page fetches
`data/packs/` in every mode.

To shoot the code path from disk, copy `web/` to a folder outside the repository and give the
copy's `kw-version` meta tag any value but `dev`; a page opened from disk runs the demo whatever
its version. Take the copy's signature off its base pack with
`node tools/sign-pack.js --unsign <copy>/packs/base.pack.json`, so that the copy refuses it and
draws from code whichever state ships; unsign the copy's medieval world's pack
the same way (`<copy>/packs/medieval.pack.json`), so that it draws every scene, device and member of the cast from code too. Do it before and after a change and compare each path's two
sets:

```bash
cp -r web /tmp/kw-code && sed -i 's/name="kw-version" content="dev"/name="kw-version" content="code"/' /tmp/kw-code/index.html
node tools/sign-pack.js --unsign /tmp/kw-code/packs/base.pack.json
CHROME=/path/to/chrome-headless-shell PAGE=/tmp/kw-code/index.html tools/shots.sh take /tmp/kw-ref-code
```

The comparison prints `identical bytes` only when both sets show the same minute on the clock;
otherwise `pixels equal outside the clock` is the same result. A set of 294 takes about two minutes, so the two
sets seldom show the same minute, and `pixels equal outside the clock` is the usual result.

## Against an older reference


The screenshots compare the page with itself before and after a change that should not alter how it
looks. With time frozen each shot depends only on its address, however many frames a busy machine
paints. Take one set at a time all the same: two browsers shooting at once have not been tried. The
nine `arm-` shots draw the sword and shield through the address's `arm=one`; a reference taken from
a tree older than that hook draws the greatsword there, so against it only those differ. The eleven
settings shots in the middle of the set (the screen on each page, the hold's cue, the 12-hour clock,
a monarch's skin) have nothing to compare with in a reference from before the settings, and the
comparison reports them missing. The eleven after them (the monarch's hair and robe, the Scenes
page, a condition in a chosen scene) are missing likewise from a reference from before those,
against which the eight settings shots that show the side rail differ in it, where the Scenes entry
was added, and the two of the monarch's page also in its new rows. The 56 `bd-` shots after them
draw the builds Broad (`bd-b-`) and Slim (`bd-c-`): every scene with the knight standing, the
attack, tight memory, the cellar's crate, the smithy's hammering, in bed, the sick and hot tints,
the sword and shield, the swat both ways with each weapon at three points of the swing, the goblin
at the hit with each weapon, and the settings screen's knight page, the build chosen by the
address's `bd=` hook ([Taking and comparing them](#taking-and-comparing-them)). Against a reference
from before them they are missing. The 62 `ref-` shots after them are the reference for moving the
scenes into pack data, beside the scenes' call records below: each condition in each scene that can
act it where no other shot shows it, the helmet on in the house, the smithy's hammer raised, the
yard's dummy struck, each monarch in each skin no other shot shows, the devices in all seven places
up and gone in every scene, and every scene at 1400 by 600 and at 960 by 720 (4:3). Against a
reference from before them they are missing too. The 34 `free-` shots after them show the base
pack's free items of 1.4.0: each new weapon and shield, the gear at rest, three whole looks, the new
hair, the back in the attack, with the cellar's crate and in the bloat, the same on Broad and Slim,
and the settings screen's knight page with every row in view, chosen with `arm=` and the gear's look
hooks ([Taking and comparing them](#taking-and-comparing-them)); against a reference from before
them they are missing. Against a reference from base pack 1.3.0 six shots differ besides: the
settings screen's knight page in `settings-knight`, `settings-look`, `settings-tablet`,
`bd-b-settings-knight` and `bd-c-settings-knight`, whose weapon and hair style rows gained choices,
and `settings-status`, which names the base pack's version and whether it is signed. The 17
`free-crossbow-` shots after them show the base pack's crossbow of 1.5.0 in the acts by shot, at
rest, slung and on the settings screen ([Taking and comparing them](#taking-and-comparing-them));
against a reference from before it they are missing, and so is `orbit-fire-glitch-crossbow` of the
worlds' set. Against base pack 1.4.0 the shots that show the knight's weapon row differ there, the
crossbow added after the mace and shield: `settings-knight`, `settings-look`, `settings-tablet`,
`bd-b-settings-knight`, `bd-c-settings-knight` and the four `free-settings-` shots, and in the
worlds' set `worldmix-knight`, `worldmix-knight-orbit` and `worldmix-knight-small` (in
`worldmix-knight` the test world's pry bar moves to a row of its own and every row under it moves
down); and `settings-status`
and `settings-status-world`, which name the base pack's version. The four shots after the
`free-crossbow-` shots show the worlds: the World page with nothing set and at the tablet's size,
the World page with parts the address changes from the world, and the status page's World, Parts and
Fallbacks entries ([Taking and comparing them](#taking-and-comparing-them)); against a reference
from before worlds they are missing, and every settings shot that shows the side rail differs in it,
where World was added first, and `settings-status` in its entries too. Against a reference from
before `kw.medieval` 0.6.0, which took the raspberry off the pie and drew the other devices as an
owl, a cauldron, a flask and a chest, every shot that draws a pie or a device differs there: the pie
in its place, the dimmed scene behind the settings screen, and the scenes' thumbnails and previews
on the settings screen; and in the 22 shots that place devices with the address's `dv=`, the devices
in their places, with the lights of their lamps reaching up to 24 pixels past a place's box. The 28
`cat-` shots show the mouser cat: in its ginger coat at each of its eight spots, through a catch in
the house, leaping at night, in the smithy and at court, catching a fly that came with the goblin or
the crate outdoors, three flies at most, none in the cellar, and the settings screen's cast page
([Taking and comparing them](#taking-and-comparing-them)). Against a reference from before the cat
every shot differs: the scenes where the cat rests, the `cat-` shots in what they show, and the
settings shots in the rail too, where the pet's page was added. Against a reference from before the
redesign of the scenes and devices of 17 November 2026 (the crystal in place of the cauldron, the
ground places along the front of the floor, the question mark over every down device), every shot
that draws a scene differs: the scenes were recomposed, the devices redrawn and recoloured, and the
cat moved to its new spots. The goblin's bonk shots are timed to the new hits, since the goblin now
comes left of the knight. The nine `streams-` shots that end the set show the streams' detail line
on two moments of three streams, on one stream, with titles alone and with the count alone, and the
streams' badge beside `+1 MORE` at each headline size and alone at court, with the demo's invented
streams (`st=`, `sm=`). Against a reference from before the streams' sessions they are missing, and
the nine shots that show streaming differ in their words: `on-plex` and the eight `cat-house-`
shots. Against a reference from before the swung weapons were held to the contact standard
([tests.md](./tests.md#the-contact-standard)), the shots of the goblin's hit and puff differ: the
goblin holds its brace for 16 ms after a blade's blow (`goblin-bonk`, `goblin-camp-bonk`,
`bd-b-goblin-bonk`, `bd-c-goblin-bonk`, and in the worlds' set `orbit-glitch-bonk`,
`orbit-mix-glitch` and `orbit-swap-goblin`); a weapon in both hands no longer rocks back in the
bounce, so the greatsword stands otherwise in the return (`goblin-poof`, `orbit-glitch-poof`), and
the test world's prod, held in both hands, differs in both ways (`orbit-fire-prod-bonk`); and the
arming sword meets the goblin by its tapered point, a few ms later, so the four `arm-goblin-` shots
are timed to the new hits. Against a reference from before the usage counts, `settings-status` and
`settings-status-world` differ: the status page gained a Usage counts entry under Sources ("Not
known. The display is showing the demo.", since a page opened from disk has no state file), and the
entries under it move down. Against a reference from base pack 1.5.0 and `kw.medieval` 0.7.0,
`settings-status` and `settings-status-world` differ where they name the packs' versions. Against a
reference from before the smithy's three acts (`kw.medieval` 0.8.0), every shot of the smithy
differs, since the hammer swings through its new arc onto the blade, the sparks fly from its face
and the bellows stand at the forge's foot: `on-update`, `arm-update`, `bd-b-on-update`,
`bd-c-on-update`, `ref-smithy-lift`, `ref-devices-up-smithy`, `ref-devices-gone-smithy`,
`ref-wide-smithy`, `ref-43-smithy`, `free-mace-update`, `free-crossbow-update`,
`cat-ginger-smithy` and `cat-smithy-pounce`, and in the worlds' set the Bridge, whose anvil plays the
same act, `orbit-update`, `orbit-fire-update` and `orbit-fire-prod-update`; `settings-quiet` lists
the smithy among the quiet scenes; `settings-status` and `settings-status-world` name `kw.medieval`
0.8.0; and the ten shots of the three acts are missing. Every other shot is the same. Against a
reference from before the demo's import was given an invented title, `crate` and
`cat-yard-crate-pounce` differ in the caption, which now reads `Saltmarsh Wardens S02E04`.
A headless browser has no saved choices, so every shot shows what its address asks for.
[page.md](./page.md) has the rest.
