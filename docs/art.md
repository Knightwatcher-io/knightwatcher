# Art generation

This page describes the tools under `tools/artgen/` that test whether paid image models can draw
the knight in the style of the code-drawn art. Nothing they make is part of the project until it
is adopted, and the output folders are ignored by git.

## Layout

- `tools/artgen/artgen.py` makes paid requests and keeps the call ledger.
- `tools/artgen/process.py` cuts out, snaps to a pixel grid, shares a palette and builds contact
  sheets. It makes no network requests.
- `tools/artgen/prompts.py` holds the phase 1 prompts and `tools/artgen/assets.py` the phase 2
  asset list with its prompts. They describe a knight and scenery and nothing else.
- `tools/artgen/process_set.py` processes the whole phase 2 set, and `tools/artgen/review.py` makes
  a quick montage of raw results for checking by eye.
- `tools/artgen/local-env.sh` is ignored by git. It reads the three keys as text from the files
  where they are kept and exports them for a single command. The committed scripts take each key
  from an environment variable (`FAL_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) and never name
  where it came from.
- `art/ledger.json` is the call ledger. Everything under `art/candidates/` is generated and ignored
  by git:
  - `<provider>/raw/` holds what the models returned, one file per attempt, and
    `<provider>/processed/` and `<provider>/sheet-phase1.png` hold the phase 1 sprites and sheet.
  - `fal/final/` holds the processed phase 2 set, one PNG per asset, and `measurements.json`.
  - `fal/pack/` holds the set as the page would load it: `knight/`, `backdrops/`, `props/` and
    `manifest.json`.
  - `fal/sheet-knight.png`, `fal/sheet-backdrops.png`, `fal/sheet-props.png` and
    `fal/sheet-scenes.png` are the contact sheets.
  - `gallery.html` is a local page that shows the sheets and every asset at twice its size.
  - `_refs/` holds the reference sheets made from the code-drawn art.

## The call ledger

No key can report its own spend, so the limit is a count of calls, enforced in code. Every paid
request goes through one function, `send_paid`. Before the request leaves it adds an entry to
`art/ledger.json` (provider, model, purpose, time) and writes the file. If the provider's count
has reached its ceiling it refuses and the script exits with status 2. A request that fails still
counts, and its entry is marked `failed` afterwards. Looking up a price or listing models is free
and is not counted.

Each provider has a lifetime ceiling and a smaller released ceiling for the phase in hand, both
constants at the top of `artgen.py`. Raising the released ceiling is a deliberate edit.

A small example of the file, with invented values:

```json
[
 {"id": "3fa91c02", "provider": "fal", "model": "example/pixel-edit", "purpose": "idle",
  "time": "2026-01-05T10:00:00Z", "status": "ok"}
]
```

`artgen.py ledger` prints the counts per provider.

## Prices

Each provider has a per-call price limit in code. For fal the script reads the current unit price
from the provider's pricing endpoint before every paid call and refuses if it is above the limit
or not a per-image unit. For the other two the price comes from the provider's published pricing
and is recorded in the script with its source. A model whose price cannot be confirmed under its
limit is not called.

## Generating

```bash
tools/artgen/local-env.sh uv run --with pillow python tools/artgen/artgen.py gen \
    --provider fal --purpose idle --dry-run
```

`--dry-run` builds the request and prints the model, size, purpose and prompt without sending or
counting anything. Without it the image is saved under `raw/` as `<purpose>-<n>`, where `n` rises
with each attempt. The purposes are `idle`, `angry`, `sweating`, `asleep`, `walking` and
`backdrop`. The idle sheet is made first from a reference sheet of the code-drawn art
(`process.py refs`), and every other state is made from the idle result plus that reference.

## Processing

```bash
uv run --with pillow python tools/artgen/process.py build --provider fal
```

The steps for each knight are:

1. Find the flat background colour from the image border and flood it out from the border.
2. Keep the largest connected shape and shave two pixels off its edge to remove the blended
   fringe, which stops a coloured halo surviving.
3. Crop to the shape and shrink it by box averaging onto a grid of 80 by 100 art pixels at most,
   where one art pixel is three device pixels, so it fits the 240 by 300 box.
4. Quantise every image of the provider to one shared palette of at most 48 colours, with no
   dithering. Thirty colours go to the knights and eighteen to the backdrop, so a busy backdrop
   cannot pull the plume and tabard off their colours.
5. Scale up by three with nearest-neighbour and stand the knight on the bottom of its box. Alpha
   is on or off, with no partial values.

The backdrop is cropped to 16 by 10 (keeping the floor), shrunk to a 320 by 200 grid and treated
the same way, giving 960 by 600.

## Contact sheet

`sheet-phase1.png` shows the five knight states in a row at twice their size on a neutral dark
background, each labelled, and the backdrop beneath at twice its size with the idle knight
standing on the floor line at 530.

## The candidate set (phase 2)

Phase 2 builds the complete candidate set on one provider, fal, from the phase 1 idle knight.
Every knight frame and bed takes that image as its identity reference, plus the sheet of the
code-drawn art. Backdrops take the phase 1 smithy as a style reference, and prop sheets take it
for pixel style only. Each frame is made once, and retried at most once when it breaks a rule or
is clearly a different knight.

```bash
tools/artgen/local-env.sh uv run --with pillow python tools/artgen/artgen.py gen --provider fal --purpose walk-b
uv run --with pillow python tools/artgen/process_set.py build
```

The asset names are in `assets.py`. The released ceiling for fal is raised in `artgen.py`; the
other two providers stay at what phase 1 used.

Two things the call count taught. The pricing lookup is rate limited, so the script caches the
price for ten minutes and retries. And fal allows ten concurrent requests, so a larger batch than
about six at a time fails, and a failed request still counts.

### Processing the whole set

- One palette of at most 64 colours for the whole set, no dithering. Twenty-six colours go to the
  knights and beds, fourteen to the props and twenty-four to the backdrops, so no group pulls
  colours off another.
- A knight frame is cut out as in phase 1, with enclosed patches of the background colour also
  cleared (the gap between raised arms, for instance).
- All knights share one scale. The idle knight sets it. The first estimate of a frame's scale is
  the size of his boots, which look the same in every pose. Frames with a plain head are then
  corrected so that the height from his baseline to the top of his helm or hair, measured in a
  band round his centre line (so that a raised sword does not count), matches the idle knight
  for helmed frames and the idle bare-headed frame for bare ones. The carrying frame keeps the
  boot scale, because the crate sits on its head.
- Each frame sits on a canvas with the midpoint of his boots on the centre line and the soles on
  the baseline row recorded in `final/measurements.json`. The canvas is 240 by 300 or larger when
  a sword needs the room.
- The beds are cut and scaled to 402 pixels wide each. The prop sheets are cut apart by joining
  pieces that lie close together, and each item is scaled to a target size set in the script. Items
  that are frames of one thing (two flames, the open and closed king) share one scale.
- Everything lands in `art/candidates/fal/final/`, one PNG per asset, plus three contact sheets
  beside it and `art/candidates/gallery.html`, a local page that shows them at twice their size.

### The pack and its manifest (phase 3)

`art/candidates/fal/pack/` is the set in the form the page loads: `knight/<frame>.png`,
`backdrops/<scene>.png`, `props/<name>.png` (the beds are props) and `manifest.json`. It is made
from the processed set, so every image shares the one palette.

```bash
uv run --with pillow python tools/artgen/process_set.py all    # build, pack, scenes
```

The manifest has version 1 and this shape:

- `grid`: the scene grid, 960 by 600, with the floor line at 530.
- `knight.<frame>`: `file`, `w`, `h`, `cx` (the x of his body centre line inside the image) and
  `base` (the y of the soles inside the image). To stand a frame on the floor at x, draw it at
  `x - cx` and `530 - base`.
- `backdrops.<scene>`: `file`, `stand` (two or three x positions on clear floor, the first the
  default), `pie` (the bottom centre of the pie's plate, on a surface in the scene) and `anchors`
  (bottom centres the scene needs, such as `fire`, `bed`, `tv`, `king`, `anvil`, `dummy`).
- `props.<name>`: `file`, `w`, `h`. Props are placed by their bottom centre.

The anchors are written by hand in `SCENE_DATA` in `process_set.py`, checked by eye on
`art/candidates/fal/sheet-scenes.png`. Two default stand positions are worked out from the sprites
instead: the smithy's puts the raised hammer over the anvil's top face, and the yard's stops the
level blade just short of the dummy. `sheet-scenes.png` is composed from the pack and the manifest
alone by the `compose` function, so it shows what a page that reads the manifest would draw.

Props are scaled to sit against the knight (his head to soles is about 250 pixels): a bed is
402 wide, the king 231 tall, a television 111 wide, a pie 72 wide, a crate 78 wide, a goblin 69,
a fly 24, a camp flame 90 tall, a torch flame 39 tall, a drumstick 51 and a parachute 150 wide.
A parachute's muddy underside, and stray cyan pixels in the sleeping bed's blanket, are cleared
in processing.

## Outcome

The set was not adopted. There are two reasons.

The first is the grid. The set is drawn on 320 by 200 art pixels and scaled up by three, so a
knight is built from blocks three device pixels wide. The code-drawn art uses the whole 960 by 600
grid, with detail down to a single pixel, and the owner asked for that finer grid. Scaling a
coarse set up cannot give it back.

The second is the sword. In the end of the cut, the second gauntlet is not on the grip: the arm
finishes behind the blade. In the middle of the cut it sits at the end of the crossguard. So
"greatsword held in both hands" does not hold in every frame. Everything else passed the checks.

A second attempt would need two changes. The prompts must ask for a much finer grid, about three
times as many art pixels each way, and the processing must keep it (a grid of 960 by 600 for the
backdrops and a knight box of 240 by 300 art pixels). The swing frames must show both gauntlets on
the grip, and each one must be checked enlarged before the frame is accepted, because the fault
is invisible at the size of a contact sheet.
