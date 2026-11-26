# Art licence

Copyright (C) 2026 Valtora and the Knightwatcher contributors

Knightwatcher's art is under the Creative Commons Attribution-ShareAlike 4.0 International licence
(CC BY-SA 4.0). You may use it, change it, share it and sell it, for any purpose, as long as you
give credit and share what you make from it under the same licence. The full legal text is in
[LICENSE-ART](LICENSE-ART), and Creative Commons has a short summary at
[creativecommons.org/licenses/by-sa/4.0](https://creativecommons.org/licenses/by-sa/4.0/). Where
this page and the legal text differ, the legal text is the licence.

## How the art is made

The knight, the scenes, the cast and the devices are drawn in code, with no image files: canvas
drawing calls in the page's scripts, and the same drawings as data in the packs in `web/packs/`.
The logo is SVG written by hand, the icons are rendered from it and from small pixel drawings of
it by `tools/icons.sh`, and the website's pictures are screenshots of the page taken by
`tools/shots.sh`.

## What is under CC BY-SA 4.0

- The packs in `web/packs/`: `base.pack.json` and `base.pack.js` (the knight and the items),
  `medieval.pack.json` and `medieval.pack.js` (the medieval world), and any pack the project adds
  there later.
- The drawings in the page's code that the packs mirror: the knight in `web/js/knight.js`, the
  mouser cat in `web/js/cat.js`, the devices, props, foes and critters in `web/js/props.js`, the
  small symbols in `web/js/sprites.js` and the scenes in `web/js/scenes/`. These files are code as
  well, and as code they stay under the AGPL; the drawings in them are also under CC BY-SA 4.0, so
  they can be taken out and used as art.
- The pictures in `site/img/`, which are screenshots of the display, and the pixel drawings in the
  website's landing page, `site/pages/index.html` (the torches and the cup).
- The copies of the packs' contents, and the records of the drawings, that the tests keep in
  `tests/web/fixtures/`.

## How to give credit

When you share the art, or something made from it, credit it like this:

```
Art from Knightwatcher by Valtora and the Knightwatcher contributors, CC BY-SA 4.0, https://github.com/knightwatcher-io/knightwatcher
```

Link to the licence, [creativecommons.org/licenses/by-sa/4.0](https://creativecommons.org/licenses/by-sa/4.0/),
where you can. If you changed the art, say so, for example by adding "changed by" and your name.

## Sharing what you make from it

Art you change, or make from this art, and then share, goes under CC BY-SA 4.0 too, or a licence
Creative Commons lists as compatible with it. You may not add terms or technical measures that
stop others from doing what the licence allows.

A pack you change no longer carries the project's signature. The project signs its own packs so
that nothing can pass as one of them; the signature is not a licence check
([packs.md](../docs/packs.md#signing)).

## What is not under CC BY-SA 4.0

- The code, which is under the GNU Affero General Public License, version 3 or later, in
  [LICENSE](../LICENSE). That includes the code in the files named above: only the drawings in
  them are also under CC BY-SA 4.0.
- The VT323 font in `web/fonts/`, which is under the SIL Open Font License, in
  [web/fonts/OFL.txt](../web/fonts/OFL.txt).
- The Knightwatcher name and logo, with the favicon and the app icons: `web/logo.svg`,
  `web/logo-dark.svg`, `web/logo-mono.svg`, `web/favicon.svg`, `web/favicon.ico`,
  `web/icon-192.png`, `web/icon-512.png`, `web/apple-touch-icon.png` and the drawings in
  `tools/icons/` they are made from. [NAME-AND-LOGO.md](NAME-AND-LOGO.md) says how they may be
  used.
- The GitHub mark in `site/parts/gh.svg`, which belongs to GitHub.
- Packs other people make from nothing of the project's, which belong to the people who made them,
  under whatever licence they choose.

## Contributions

Art contributed to the project is under CC BY-SA 4.0 like the rest, and its author keeps the
copyright in it. [CONTRIBUTING.md](../.github/CONTRIBUTING.md) says how to contribute.
