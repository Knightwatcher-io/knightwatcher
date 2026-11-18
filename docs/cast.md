# The cast and the devices

For anyone making a world pack: the supporting cast and the drawings of the devices, as data in
format 1.1. The cast is the patron the watcher talks with while someone has a shell open, the foe
of a banned address, the critter a blocked advert becomes and the pet that catches flies; each
member brings its drawings and the measures its act needs, and the engine plays the act. A prop set
gives a drawing for each kind of device the household watches. Each section gives the fields and
the checks first, then how the page compiles and draws them. Shapes, colours and terms are as in
[scenes.md](./scenes.md#shapes-coordinates-and-terms), and the costs and limits in
[worlds.md](./worlds.md#costs-and-limits).

## The cast

Each member has a `role` and a `name` (1 to 48 characters).

- **A patron** has `box` (`[w, h]`, at most 200 by 360), `anchors` (exactly `seat`, `eyes` and
  `mouth`, pairs, each inside the box: x within half its width, y up to its height above the seat),
  `still` (1 to 16 parts `{ at, shapes }`, `at` one of its anchors, each 1 to 128 shapes) and
  `states` (exactly `shut` and `open`, each 1 to 128 shapes). Optional: `sets`, which binds up to 4
  names of its own to the user's sets (`skin`, `hair`, `tabard`, `plume`; a name that is a user
  set's binds that set, and `base`, `pick` and `lamp` are refused); `own`, for a bound set, every
  entry of it in literal colours, as a swatch gives them; and `palettes`, up to 8 sets of its own,
  whose names are not reserved, bound or a user set's, each of 1 to 32 entries that may be band
  lists, and whose entries refer only to `@base` and the bound sets. An entry of a patron's
  palettes may also be drawn and dressed, below. The page fills a bound `skin`, `hair` and `tabard`
  from the patron's skin, hair and robe the settings choose; a bound `plume` always takes the
  patron's `own` colours.
- **A foe** has `sprite` (`size` at most 256 by 256, `feet` inside it), `h`, `w`, `mid` (whole, to
  256), `crown` (1 to 32 points, each inside the sprite from its feet), `exit` (`poof`, the engine's
  only exit), `parts` (up to 16 named lists of shapes) and `poses`, exactly `stand`, `climb`,
  `taunt0`, `taunt1`, `brace` and `hit`, each `{ parts, shapes }` naming 0 to 16 of its parts once
  each, with 0 to 128 shapes of its own. A part holds 1 to 128 shapes. A foe's `fires` and its pose
  `aim` are reserved for a later format and refused here.
- **A critter** has `frames` (exactly `flap0` and `flap1`) and `dead`, each 1 to 64 shapes, and
  optional `groups` (pivots within 512) and `alpha` (1 to 8 groups, each an alpha from 0 to 1, for
  a declared group).
- **A pet** has `sprite` (`size` at most 256 by 256, `feet` inside it), `coats`, `spots`, `paw`,
  `take`, `land` and `lift`, all required. `coats` holds 1 to 8 coats by id, each `{ name, poses }`:
  `name` 1 to 32 characters, and `poses` exactly the eleven poses the engine's catch asks for,
  `rest`, `settle`, `alert0`, `alert1`, `stalk0`, `stalk1`, `pounce`, `land`, `pleased`, `walk0`
  and `walk1`, each naming a stamp of the pack. A pose's stamp holds pix shapes alone, each at a
  whole point and inside the sprite from its feet (at `rules`), since the pose is painted once into
  the sprite's canvas. `spots` holds 1 to 16 spots by the id of a scene of the pack, each `{ rest,
  face, floors, lane, fly }`: `rest` and `fly` whole points on the 960 by 600 grid, where the pet
  rests and the point a fly comes down to for the catch; `face` 1 (right) or -1 (left); `floors` 0
  to 8 surfaces `[x0, x1, y]`, whole, `x0` less than `x1` (at `rules`); and `lane`, the floor's y
  elsewhere, 0 to 600. A spot in a scene with a `bed` may give `bed`, a spot of the same fields
  used while the watcher is in bed. `paw` is a pair from -256 to 256, where the paw that meets the
  fly is at the top of the leap, from the feet, facing right; `take`, `land` and `lift`, from 0 to
  256, how far behind that the pet takes off, how far past it the pet lands, and the least height of
  the leap. Every number is a multiple of 1/8.

Inside a member, the user's sets may be named only through its `sets`: a foe, a critter or a pet
names none.

**Drawn and dressed.** An entry of a patron's palettes may be `{ "drawn": colour, "dressed": colour,
"set": name }`: the colour `drawn` while the user has chosen nothing for the bound set `set` names,
and `dressed` once they have. `drawn` is a hex colour or a single reference; `dressed` a hex colour,
a reference, a translucent colour, a mix or a contrast; `set` must name a set the patron binds in
`sets`. All three are required and nothing else is taken. Anywhere but as an entry of a patron's
palettes, `dressed` included, it is refused with `a colour drawn and dressed is allowed only as an
entry of a patron's palettes`. Its colours refer, as the palette's do, only to `@base` and the bound
sets. A figure can so be drawn in shades of its own while the user chooses nothing, and in shades
worked out from the user's colours once they do, as the medieval world's monarchs shade their hair
([The cast on the page](#the-cast-on-the-page)).

### The cast on the page

`KW.cast` holds the drawings of the engine's supporting cast, by role and then by name: `patrons`,
with the interface of `KW.props.PATRONS` (which `court.js` gives), `foes`, with that of
`KW.props.FOES`, `critters`, with that of `KW.props.CRITTERS`, and `pets`, with that of
`KW.props.PETS` (which `cat.js` gives) ([page.md](./page.md#the-cast)). `world.js` fills it with the code's members when it loads, and
`start` puts the members the pack's cast gives in their place. The engine reads `KW.cast`, or the
code's tables on a page without the compiler; the court reads `KW.cast.patrons`. The engine keeps
the motion: where the flies hover, when they are swatted, the poof (`poofHD`) and the fall; the foe's
entrance over the wall or out of the ground, the strike and the exit; the pet's catch, from the
look up at a fly to the settle; and the court keeps when the monarch talks. A member gives only its
drawings and its measures.

A member's shapes are compiled as a prop's and drawn moved to the point the engine gives, so the
marks, the tiles and an effect placed on the screen by a field of its own are refused in the cast as
in a prop.

**A critter** compiles to `draw(x, y, flap)`, which draws its frame `flap0` (`flap` 0) or `flap1` at
`(x, y)`, and `dead(x, y)`, which draws what falls. A shape in a group the critter gives an `alpha`
is drawn at that alpha: the canvas's alpha is set before the first of a run of such shapes and set
back to 1 before the first shape after it. So the fly's wings, in the group `wings` at 0.85, give
the calls `flyHD` makes, `globalAlpha` 0.85, the two wings, `globalAlpha` 1, the body and the eye,
where a translucent colour would have set no alpha at all. A group's `pivot` is not read, since
nothing turns a critter.

**A foe** compiles to the interface of `KW.props.FOES`: `pose(name)`, `poses` (the six the foe
player asks for), `anchor` (the sprite's `feet`), `size` (its `size`), `h`, `w`, `mid`, `crown` and
`exit`. A pose is drawn as its parts, in the order it lists them, then its own shapes, each part
compiled once and shared by the poses that list it. `pose(name)` paints the pose the first time it is
asked for into a canvas of `sprite.size`, the shapes moved to the feet, and keeps it, as `foeSprites()`
in `props.js` does; a name that is not a pose gives `stand`. Each compile paints canvases of its own,
so the code's goblin and the pack's never share one. `exit` names one of the engine's exits
(`FOE.exits` in `engine.js`, today `poof` alone): the foe player leaves by the foe's exit when the
engine has it and by the event's otherwise, so a world chooses an exit and never describes one.
The code's goblin gives `exit: 'poof'` too.

**The goblin as data.** The measures and the 24 points of the crown are `FOES.goblin`'s as they
stand. The drawing is `goblinHD` in `props.js` with its numbers counted from the feet, cut into ten
parts in the order `goblinHD` draws:

| Part | Is | Poses |
|---|---|---|
| `arms.hips`, `arms.up`, `arms.ears0`, `arms.ears1`, `arms.flung` | the arms behind the body, as `gArms` draws them: the limbs as strips then discs (`SP.stroke`), the hands | `stand`, `climb`, `taunt0`, `taunt1`, `hit` |
| `body` | the legs and feet, the tunic, its patch and the rope belt | all |
| `ears`, `ears.droop`, `ears.limp` | the two ears, lowered by 0, 14 and 16 | `ears` the first four, `ears.droop` `brace`, `ears.limp` `hit` |
| `head` | the head and its jaw, a spot on the far cheek and the two blushes | all |

Each pose's own shapes are what changes from one to the next and comes after the head: the eyes,
the brows, the mouth, the saucepan (6 lower in `hit`), the nose, and in `brace` alone the arms
clutched in front. The nose is the same in every pose and is written in each, since a pose draws its
parts before its shapes.

Three things needed more than writing the numbers out:

- each hand's three fingers stand at `Math.sin(a + d) * 9` from the hand, between the eighths a
  pack's points keep to, and six of their outlines fill pixels no eighth gives. The effect
  `fingers` draws them, `{ "k": "fx", "fx": "fingers", "p": [-36, -56], "a": 2.6, "r": 4.5, "colour":
  "@base.k" }` for the outlines and `r` 2.5 in the finger's colour for the fills, around the palm's
  own two ellipses. `gHand` in `props.js` keeps its own loop, and the records hold the two equal;
- the inner triangle of each ear has its tip 0.62 of the way to the ear's tip, which is not an
  eighth. The pack gives the nearest eighths that fill the same pixels with the goblin at its feet,
  where it is always painted, such as `[-62.25, -123.125]` for `[-62.28, -123.16]`;
- the shut eyes of `hit` are strips 2.2 either side, which is not an eighth; the pack gives 2.125,
  which fills the same pixels there.

**A patron** compiles to the interface of `KW.props.PATRONS`: `draw(x, by, look)`, its still parts
with the seat at `(x, by)`, `mouth(x, by, open, look)`, its state `open` or `shut`, and `drawn`, its
own hair and robe colours for the settings' "As drawn". Each shape is drawn moved to the anchor its
`at` names, or its part's (a state's: the seat). `look` is `{ skin, hair, robe }`, which the court
takes from `s.patron` and checks as before (a face of three bands and a cheek, three hair bands, four
robe bands), each `null` for the patron's own. A bound set takes the user's colours where the look
gives the user's set it binds, and its `own` otherwise: `skin` the look's face and cheek, `hair` its
three bands and its brow, `tabard` its four bands. A bound set needs an `own`, since the user may
leave it unchosen; one without is refused by name. The patron's palettes resolve against those
colours. Every colour is resolved once for each look, the first time the look is drawn, and the
compiled shapes are kept (at most 16 looks), so a frame resolves nothing; the court's backdrop is
painted again only when its key changes, and the mouth takes the look kept for it.

Two colour forms of format 1.1 exist for the patrons ([The cast](#the-cast)):

- **drawn and dressed**, `{ "drawn": "#1f1a2d", "dressed": { "mix": ["@hair.2", "#000000"], "k":
  0.3 }, "set": "hair" }`, an entry of a patron's palettes: `drawn` while the look leaves the bound
  set `set` names unchosen, `dressed` once it gives it. The court shades each monarch as drawn with
  colours of its own, B's and C's darkest strands, B's sheen and every brow, which no mix of its own
  hair gives (B's dark is `#1f1a2d`, its hair's darkest band darkened to 0.7 `#1d1929`); and with a
  chosen hair it shades from that hair. The entry names its set rather than leaving it to be worked
  out from the colours it refers to, since a brow refers to the hair and the skin and follows the
  hair alone;
- **contrast**, `{ "contrast": ["@hair.0", { "mix": ["@hair.2", "#000000"], "k": 0.15 }], "on":
  "@skin.face", "band": 1 }`: whichever of the two stands out more from `on` by the WCAG ratio, the
  second on a tie, `band` picking one band where `on` is a band list. It is the court's readable
  brow, `browOn` in `court.js`: a chosen hair's brow is its darkest band darkened, and on a skin
  where that would hardly show (light hair on a dark skin), its lightest band.

A mix is worked out as `toward()` in `court.js` does it, each channel moved and rounded, and the
contrast as `contrast()` there reckons it, so the colours are the court's to the bit.

**The monarchs as data.** Each monarch is `monarch()` in `court.js`, drawn once with every colour of
its own named as the pack names it, its numbers counted from the seat (820, 505 in the court): the
shoes and the robe, the ermine, the front of the robe, the sleeves and hands, what it holds, the
collar and what it wears on the chest, the hair behind, the face, the beard, the cheeks and eyes,
the hair over the face, the brows and the crown. Its shapes run in that order through two still
parts of at most 120, at the seat; the mouth's shapes are at the mouth's anchor, 193 above the seat.
Its sets bind `skin`, `hair` and `robe` (the user's tabard); its `own` is the base pack's warm skin,
which is the court's own, and the monarch's hair and robe as drawn, the hair's brow its own brow.
Its palette `mon` gives what the court derives from the hair and the iris:

| Monarch | `dark` | `brow` | `sheen` | `iris` |
|---|---|---|---|---|
| A | a mix of `@hair.2` to black by 0.3, which as drawn is A's own | drawn `#4a2a12`, dressed by contrast | | `#5a3a22` |
| B | drawn `#1f1a2d`, dressed the mix | drawn `#29233b`, dressed by contrast | drawn `#7a7299`, dressed `@hair.0` to white by 0.25 | `#3a4a86` |
| C | drawn `#946a28`, dressed the mix | drawn `#a87a30`, dressed by contrast | | `#2f6b55` |

Three things needed more than that:

- C's fringe, swept across the brow, is one polygon whose lower edge turns in where the sweep ends,
  so it is not convex, and no convex polygon fills its rows alike. The effect `fringe` draws it, `{
  "k": "fx", "fx": "fringe", "p": [0, -240], "colour": "@hair.1" }`; `hairC` in `court.js` keeps
  its own polygon, and the records hold the two equal;
- the links of C's chain of office hang at `26 * (i / 45) ** 2` below the collar, which is not an
  eighth; each is given the nearest eighth that fills the same pixels with the seat where the court
  puts it, such as `-144.625` for `-144.64`;
- C's crown has a post of gold under its jewel that `court.js` drew with `Rh` and the gold's band
  list, which a canvas takes for no colour, so it always showed in the outline's colour set just
  before it. `court.js` now names that colour, and the pack draws the same; the court's stored
  records were written again for it, in their `fillStyle` alone, and every picture is unchanged.

**The fly as data.** Its frames are `flyHD` in `props.js` with its numbers counted from where the
engine puts it: the wings 2 above the body in `flap0` and 6 above in `flap1`, the body and the red
eye the same in both. What falls is the 6 by 5 rect the engine drew itself before the cast,
`Rh(x - 3, y + a * a / 900, 6, 5, '#3a3344')`, which is now `deadFlyHD` in `props.js` and
`CRITTERS.fly.dead`; the engine passes the fall, `y + a * a / 900`, as the point.

**A pet** compiles to the interface of `KW.props.PETS`: `name`; `coats`, each coat's name by its id
in the pack's order (`{ calico: 'Calico', ginger: 'Ginger tabby' }`); `poses`, the eleven the
engine's catch asks for; `size` and `anchor`, its sprite's `size` and `feet`; `pose(coat, name)`, a
canvas of the sprite's size with the pose painted once from its stamp, the first time it is asked
for, a coat or a pose the pet lacks giving its first; `spots`, its spot in each scene, by the name
the engine knows the scene by (kw.medieval's by their short names, `camp`, and another pack's by
their long names, `test.orbit/deck`, as its scenes are put in `KW.scenes`); and the
measures of its pounce, `paw`, `take`, `land` and `lift`. A pose's stamp is pix shapes alone, at
whole points inside the sprite (the reader checks this), so the compiler works each pose out into
cells, a colour or nothing for each pixel of the sprite, at start, and paints the canvas from them
with one call per run of a colour in a row, as `cat.js` paints the code's. So the cat from the pack
and the cat from code make the same calls. The engine draws the canvas at the pet's feet, mirrored
when the pet faces left, as it draws the goblin's poses.

**The cat as data.** The cat's curves and the patches clipped to them cannot be written with the
format's shapes, so the pack carries each pose of each coat drawn out, as stamps of pix shapes:
`cat.calico.rest` and the other ten poses, then the ginger coat's. `tools/cat-stamps.js` writes them
from the code's drawing, `KW.props.PETS.cat.cells`: each pose trimmed to the pixels it paints, cut
into tiles of at most 64 by 64, each tile trimmed again and written at its place from the feet in
runs (`"runs": true`, [scenes.md](./scenes.md#shapes-coordinates-and-terms)), its key the tile's
colours in the order they first appear, `a` to `z` and then `A` to `Z`. A pose takes two to six
tiles. The tool also writes the member `pet.cat`:

| Field | Is |
|---|---|
| `sprite` | `{ size: [200, 150], feet: [100, 132] }` |
| `coats` | `calico` and `ginger`, each `{ name, poses }`, `poses` naming the stamp of each pose |
| `spots` | by scene: `rest` and `face`, where the cat rests and the way it faces; `floors`, the surfaces it walks near its spot, `[x0, x1, y]`, and `lane`, the floor elsewhere; `fly`, the catch point; and in the house `bed`, the same while the knight is in bed |
| `paw` | `[57.25, -67.625]`, where the paw that meets the fly is at the top of the leap, from the ground under the cat's middle, facing right |
| `take`, `land`, `lift` | 52, 46.75 and 39: how far behind the top of the leap the cat takes off, how far past it the cat comes down, and the least height of the leap |

The eleven poses are `rest` (curled up asleep), `settle` (a loaf with the eyes half shut, after a
catch), `alert0` and `alert1` (sitting up, the tail's tip flicking), `stalk0` and `stalk1` (the two
halves of one slow step), `pounce` (the long leap, also the hop where a floor steps), `land` (the
swipe), `pleased`, and `walk0` and `walk1`. `tests/tools/cat-stamps.test.js` works the stamps and
the member out again and requires the pack to hold exactly that, and the stamps read back to give
the code's cells pixel for pixel; `tests/web/pet.test.js` holds the compiled cat to the code's call
for call.

What the compiler does not build in the cast, it refuses by name, and the member is drawn from code:
a role the engine does not have, a bound set without an `own`, a pet's pose drawn with a shape other
than pix, and in any member the marks, tiles and effects above. A member is compiled only where the
engine has a member of that role and name to put it in place of: a page without `cat.js` compiles
no pet. A colour a patron's palette or set does not give is refused with the entry it
lacks.

## The devices

A prop set is `{ name, kinds }`, `name` 1 to 48 characters and `kinds` giving one or more of `pi`,
`camera`, `machine`, `vm` and `box`. A kind has `name` (1 to 48 characters), `mark` (1 to 160) and
the two states `up` and `gone`, each `{ still, moving, lamp }` with `still` required and each of
`still` and `moving` 1 to 128 shapes. A state with no `lamp` shows no light, as every medieval
kind does when down. A lamp is a pair, where the engine draws its own
lamp, or a lamp of the kind's own `{ at, box, lit, dark, light }`: `box` `[w, h]`, each a whole
number from 1 to 64, centred on `at`; `lit` and `dark` stamps of pix shapes only, which the page
draws only when each shape sits at a whole point inside the box; `light` a hex colour, which a gone
lamp may not give. A
gone lamp's `lit` drawing uses only `@lamp.down`, `@lamp.downLo` and `@lamp.downHi`, so a device that
is down and keeps a lamp blinks only red in any world. The medieval world gives no kind a lamp
while down, so its devices are unlit when down and the question mark carries the alert.

At `rules` every drawing of a kind, in both states and both parts, lies inside its class box (the
pie's for `pi`, the high one for `camera`, the ground one for the rest), worked out from each shape's
extent at the ends of its values: a stamp by its shapes, a lamp by its box (12 by 12 for the
engine's), an effect by its point alone, and a glow not at all, as the class boxes were measured. A
strip whose ends and widths are all fixed, as every value of a prop is, is measured by the pixels
`draw.js` fills for it from a base on a whole pixel: the polygon of its four corners filled in whole
columns when it runs more across than down (whole rows otherwise), from the first column its
corners span to the last, each column from and to the nearest pixel. So the camera's sunshade,
whose far corner lies at x -34.78, is measured from -34, the column it starts at. A strip with a
value that can vary reaches its widest either way round both ends.

### The devices on the page

`KW.kinds` holds the drawing of each kind of device the engine draws, by the contract's kind, with
the interface of `KW.props.KINDS` ([page.md](./page.md#devices)): `draw(x, y, t, ok, part)` draws the
kind standing on the base `(x, y)`, up (`ok`) or gone, its still part (`part` `'still'`), its moving
part (`'moving'`) or both, and `mark` is the height above the base of the top of the question mark.
`world.js` fills it with `KW.props.KINDS`'s entries when it loads, and `start` puts the prop set's
compiled kinds in their place: these are the base world's drawings. The settings then choose a prop
set for each kind ([Worlds as presets](./worlds.md#presets-on-the-page)), and `KW.world.useKinds()` puts each
kind's drawing from its set in `KW.kinds`. The engine's `placeHD` and `kindName` read `KW.kinds`, or
`KW.props.KINDS` on a page without the compiler. The question mark, the pole of a high place, the
drawing order, the still part's canvas and the lamp's phase in each place stay the engine's, and a
kind's class (where it may stand) is the engine's too.

A kind compiles each of its states, `up` and `gone`, into the still and moving shapes, compiled as
a scene's are and drawn moved to the base, and its lamp, if it has one. A state with no lamp shows
no light: every medieval kind while down.

- **The engine's lamp**, a pair `[x, y]`: its dark rim is drawn after the still shapes
  (`KW.props.lampRim`) and its light after the moving ones (`KW.props.lampHD`), at the base plus
  the pair, on the loops of `LAMP` and `lampLevel`: green to black over 3.6 seconds while up, red to
  black over 2 while down.
- **A lamp of the kind's own**, `{ at, box, lit, dark, light }`, as every medieval kind's is: two stamps of
  pix shapes, each pix shape at a whole point. Each is painted once, the first time it is drawn,
  into a canvas the size of the two drawings together, the lit drawing laid over the dark one, so
  that where the lit drawing is clear the lit canvas shows the dark drawing. Each frame, as
  `ownLampHD` in `props.js` does, it draws a soft light of radius 24 round `at`, in `light` while up
  (the engine's green if a kind gives none) and in the down lamp's red while gone, at 0.3 of the
  loop's level, then the dark canvas, then the lit canvas at the loop's level. The two drawings must
  lie inside `box` around `at`, or the kind is refused. The pie's lamp up is the filling in the gaps
  of its lattice, 398 pixels over 56 by 23, at `[1, -30]` in a box of 56 by 26, red with the light
  `#ff4a3d`. The crystal's is its ball, at `[0, -67]` in a box of 50 by 50, light `#cde4ff`; the
  flask's its potion, at `[0, -13]` in a box of 34 by 22, light `#6fb4ff`; the owl's its eyes,
  light `#ffb000`; and the chest's its jewel, at `[0, -39]` in a box of 20 by 20, light `#ffb000`.
  Both drawings of each cover the same pixels, so the lit canvas is the lit drawing alone, and the
  dark drawing is a dimmer colour of the same hue, so that at the low point of the pulse the lamp
  still reads as lit. The lamps' stamps hold 9 760 pixels in all.

What the compiler does not build in a prop is refused with a reason, and that kind is drawn from
code: a mark or a tile, an effect placed on the screen by a field of its own (a field of kind
`offset`, as the pebbles' `y`, which would not move with the device), and the parts of a scene
that a prop cannot name. An effect's points are moved to the base like the other shapes.

**The devices as data.** Each drawing of `props.js` is written out shape by shape, its coordinates
counted from the base, in the order the code draws. The owl, the crystal, the flask and the chest
are written out by recording the calls of `cameraHD`, `machineHD`, `vmHD` and `boxHD` from a base at
(0, 0), so each shape is one call of the code; their lamps of their own are written from the maps in
`DEVICE_LAMPS`. Their numbers are all eighths: the owl's feathers have radii of 1.25, which at a
whole centre fill the pixels a radius of 1.2 would, and each number of the crystal, the flask and
the chest at their sizes is an eighth that fills the same pixels as the size's own value. Five
things needed more than that:

- the pie's dish has thirteen flutes at `i * 5.3` across its rim, which fall between the eighths a
  pack's points keep to; the strip passes them to `fillRect` as they are, so no eighth draws the same
  fills. The effect `flutes` draws them, with the dish's numbers as its defaults;
- the pie's top is one pix of 83 by 33 painted in one pass, wider than the 64 a pix row may hold,
  and two pix shapes side by side would paint its rows in another order. The effect `crust` draws
  it, the lattice, the dome and the crimping, and `pieTop` in `props.js` now calls the same effect;
  `pieDish` calls `flutes`;
- the down lamp's shaded side, the down red at two thirds, is reserved as `@lamp.downLo`, beside
  `@lamp.down` and `@lamp.downHi`, so that a gone lamp's lit drawing still uses only the engine's
  reds ([worlds.md](./worlds.md#format-11)); the pie's red lamp up names the same three. The pie's
  lamp stamps and the last slice, a pix shape of 34 by 16 in the gone still part, are written from
  the maps `pieShapes` in `props.js` works out, the lamp's from the filling the `crust` effect
  paints. A gone lamp's reds are no longer used by the medieval kinds, which have no lamp while
  down, but the format keeps them for a world that wants one;
- the crystal's ball, its dark ring and the flask's bulb are circles whose radii at their sizes no
  eighth draws alike. `discs` in `props.js` paints them pixel by pixel with `D.pix`, from the
  pixels `ell` fills at the size, worked out once, and the pack carries the same pixels as pix
  shapes;
- the crystal's claws are strips whose outlines, at 1.85 times, no eighths fill alike. They are
  drawn at the nearest eighths, `[3.5, 2]` for the outline and `[2.25, 0.875]` for the gilt, in
  code and in the pack alike, which leaves each claw's outline 2 pixels from the mock-up's.

Until 16 November 2026 the devices were drawn as the devices they are: a bullet camera, a tower
case, the same case in 88 dots for a virtual machine (in six stamps, past the 128 shapes a part may
hold), and a grey box. The owner chose the medieval things in their place. On 17 November 2026 the
owner chose the redesign: the cauldron gave way to the scrying crystal, the crystal and the chest
were drawn at twice their size and the flask at 1.4 times, the ground class's box grew from
`[-36, -58, 41, 2]` to `[-66, -93, 56, 2]` and a ground place from 88 to 132 wide, and the lights
took colours of their own, none green. The chest's `mark` is 158, past the 128 a mark could be,
so a mark may now be up to 160.
