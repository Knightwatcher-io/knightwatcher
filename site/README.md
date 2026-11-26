# The website

The website at `knightwatcher.io`: six sections with a nav on every page (Home with the live demo,
Features, Supported Feeds, Install, Docs and Licence), the documentation rendered from the
repository's markdown, and the legal pages. Static files built from this folder, `web/`, `legal/`,
`docs/`, `README.md`, `CONTRIBUTING.md` and the provider files, served by a small Cloudflare Worker and deployed by Workers Builds on each push to `main`, as the usage receiver in
[`telemetry/`](../telemetry/README.md) is. Until launch both of its hostnames sit behind Cloudflare
Access, open to the owner alone.

| Path | What it is |
|---|---|
| `pages/index.html` | the home page: the hero, the live demo and four highlights, with the places the build fills marked `<!-- @name -->` |
| `pages/features.html`, `pages/feeds.html`, `pages/install.html`, `pages/licence.html` | Features, Supported Feeds (its services filled in by the build), Install and Licence |
| `pages/docs.html`, `pages/doc.html` | the docs' index, and the template of each doc's page |
| `pages/legal.html` | the template of the privacy notice's, the art licence's and the name and logo's pages |
| `pages/404.html` | the page for an address with nothing at it |
| `parts/` | the nav, the footer and the GitHub mark, which every page shares |
| `css/site.css`, `js/site.js` | the stylesheet, and the script that draws the night sky and drives the demo's frame |
| `img/` | the pictures of Home and Features: screenshots of the real page written by `tools/shots.sh site` ([shots.md](../docs/shots.md)), all 640 by 400 but `settings.png` at 1280 by 800, under CC BY-SA 4.0 with the rest of the art ([ART-LICENCE.md](../legal/ART-LICENCE.md)) |
| `site.json` | the Cloudflare Web Analytics token, empty until it is set |
| `build.mjs` | the build, which writes `dist/` |
| `markdown.mjs` | the markdown renderer of the docs and the legal pages |
| `headers.mjs` | the response headers, for `_headers` and the Worker |
| `src/index.mjs` | the Worker |
| `wrangler.jsonc` | the Worker's name, its files, its two hostnames, observability off, no cron |
| `preview.mjs` | a local preview of `dist/` on the loopback |

The site has no dependencies: the build, the preview and the tests run on plain Node 24 or newer.

## Building it and looking at it

From the repository's root:

```bash
tools/capped.sh node site/build.mjs
node site/preview.mjs            # http://127.0.0.1:8788/, Ctrl-C to stop
```

The build reads and renders everything first, and only then empties `site/dist/` and writes, so a
build that fails leaves the last one as it was:

- the home page, `features/`, `feeds/`, `install/`, `licence/` and the 404 page, the stylesheet,
  the script and the pictures, with the logo, the favicon, the touch icon and the VT323 font (and
  its licence) copied from `web/`, so they are kept once in the repository (the logo and the icons
  are the project's own, under neither the code's nor the art's licence:
  [NAME-AND-LOGO.md](../legal/NAME-AND-LOGO.md));
- `docs/`, the documentation ([The docs](#the-docs));
- `privacy/`, `art-licence/` and `name-and-logo/`, rendered from `legal/PRIVACY.md`,
  `legal/ART-LICENCE.md` and `legal/NAME-AND-LOGO.md`;
- `demo/`, the display's page: a copy of `web/` without `admin/` and `data/`, stamped with the
  commit being built;
- `_headers`, from `headers.mjs`.

The preview serves `dist/` with the same headers the Worker sets, the 404 page for anything else,
and binds to `127.0.0.1` alone. The tests are in `tests/site/` ([tests.md](../docs/tests.md#the-websites-tests)):

```bash
tools/capped.sh node --test --test-concurrency=2 'tests/site/**/*.test.mjs'
```

## The sections

Every page has the same nav: Home, Features, Supported Feeds, Install, Docs and Licence, with the
GitHub button. The build writes the links (`NAV` in `build.mjs`) and marks the page's own section,
`aria-current="page"` on the section's own page and `"true"` on a page within it (a doc under Docs, a
legal page under Licence). On a phone the links wrap onto a row of their own under the name and the
GitHub button.

- **Home** (`/`): the hero, the live demo and four highlights (a ban, an import, a stream and a
  machine under strain), each a link to its card in Features.
- **Features** (`/features/`): everything the display shows, each card with an id (`#ev-goblin`,
  `#ev-strain` and so on), and the knight and the world.
- **Supported Feeds** (`/feeds/`): the services, built from `collector/providers/builtin/*.toml`
  (below), what the collector reads itself, and the requirements and supported systems.
- **Install** (`/install/`): the quick start, and what leaves your network.
- **Docs** (`/docs/`): the documentation ([The docs](#the-docs)).
- **Licence** (`/licence/`): free and open, support (Ko-fi and GitHub Sponsors, both optional), the
  code's and the art's licences, the name and the logo, and contributions signed off under the DCO,
  linking the legal pages.

**Supported Feeds' services** come from each provider file's top-level `name` and `kind`, grouped
by kind in the order of `FEED_KINDS` in `build.mjs`, which gives each kind its heading (streams,
adblock, imports, and usage as Machines' CPU and memory), and sorted by name. A file named
`<base>_<variant>.toml` of the same kind as `<base>.toml`, whose name is the base's followed by
`, with ...`, is shown with its base: `glances_basic.toml` (Glances 4, with a password) makes the
one entry "Glances 4 with or without a password". So a new provider file shows on the site with no
page edit. A file of a kind `FEED_KINDS` has no heading for stops the build, naming the file.

## The demo

The demo is the real page, framed at `/demo/?demo#demo=1&bar=0` near the top of the home page,
drawn at 1280 by 800 and scaled to the frame, so it keeps its own layout at every width and is
letterboxed on an upright phone.

- **The stamp.** The build stamps `demo/` as `tools/deploy.sh` stamps a deployed copy: the
  `kw-version` meta tag, `?v=` on every local script and stylesheet, and `version.json`. The
  version is the first 12 characters of the commit, from `WORKERS_CI_COMMIT_SHA`, which Workers
  Builds sets, or from `git rev-parse HEAD`; with neither the build fails rather than ship a `dev`
  page. A page that is not `dev` draws only signed packs, so the demo shows what a deployed display
  shows. Its check of `version.json` works on the site as at home: an open demo reloads onto each
  new deploy within about five minutes.
- **No server.** `?demo` forces the demo, which asks the display's server nothing: no state file,
  nothing under `api/`, no check-in. What is chosen on its settings screen stays in the visitor's
  browser ([display.md](../docs/display.md#modes)). It still asks for `data/packs/index.json`, the
  downloaded packs' list, which the site does not have: the answer is the 404 page, which the page
  reads as no packs, and the browser's console shows the 404.
- **The buttons.** Full screen calls `requestFullscreen()` on the frame. Open the settings adds
  `set=knight` to the frame's hash, and the page's own listener opens the settings screen without a
  reload ([The address](../docs/display.md#the-address)). Your devices sets `bar=dev` in the
  frame's hash, which shows the review bar's Devices row alone (add, name, set down or remove the
  demo's stand-in devices), and a second press sets `bar=0` to hide it again; the button reads the
  frame's hash each time, so it follows whatever the demo did since. A tap on the demo still brings
  back its whole review bar.

## The docs

The docs' index comes from README.md's `## Documentation` section: its three groups, the lines
"For people running it:", "For people making packs:" and "For contributors:", shown as Running it,
Making packs and Contributing (`DOC_GROUPS` in `build.mjs`), and under each its bullets, each
`- [Title](path): description`. Every file the section links gets a page at `/docs/<name>/`, its
file's name in lower case (`docs/world-loading.md` is `/docs/world-loading/`, `CONTRIBUTING.md` is
`/docs/contributing/`), but `site/README.md`, which is `/docs/website/`. A file in `docs/` the
section does not link gets a page too, under a group More, by its own title. Anything else in the
section (a group's line the build has no name for, a line of another shape, a link to a file that is
not there, a doc linked twice, a group with no docs) stops the build, naming the line of README.md,
and so does a missing section.

A doc's page has every doc in a side column by group, its own sections from its level two and
three headings in a column on the right, and the doc between them; narrower, the contents fold
into an "On this page" menu above the doc, and on a phone the docs fold into an "All the docs"
menu too. There is no search. Each page ends by naming its file in the repository.

## The markdown

`markdown.mjs` renders the subset of GitHub's markdown the docs and the legal files use: headings of
every level, paragraphs, `- ` and `1. ` lists nested to any depth with paragraphs, code and tables
inside their items, fenced code with or without a language, tables with their columns' alignment (as
classes, since the site's policy refuses an inline style), links, bold, inline code and backslash
escapes. An HTML comment on lines of its own, such as the markers around the generated reference in
`configuration.md`, is left out. Every piece of text is escaped. In a table, `\|` is a pipe that
splits no cell, its backslash dropped, code spans included, as on GitHub. Two things still differ
from GitHub on purpose, so that a slip in a doc reads as meant rather than broken: a bare `|` inside
a code span in a table does not split the cell (GitHub's does; write `\|` there so both agree), and
a placeholder in angle brackets outside code that is no HTML tag shows as written (GitHub strips it;
put it in backticks so both agree). Anything outside the subset (raw HTML, italics, a quote, a `*`
or `+` list, a rule, an indented code block, an underlined heading) stops the build with the file
and the line, so an edit the site cannot show is found before it is deployed. Extend the renderer
and its tests before using something new.

A heading's id is GitHub's: its text in lower case, everything but letters, digits, spaces,
hyphens and underscores taken out, each space a hyphen, and a repeat numbered `-1`, `-2`. So a link
to a heading works the same on the site and on GitHub: the privacy notice's section The website is
`/privacy/#the-website`, where the footer's line on visitor counts points. A relative link to a file
the site renders (a doc, `CONTRIBUTING.md`, this file or a legal file) goes to its page on the site,
anchor and all; a link to any other file of the repository goes to it on GitHub, `blob/main/` for a
file and `tree/main/` for a folder. The tests build the site and check that every link between its
pages and every anchor lands, and that every link to the repository names a file that is there.

## The headers

`headers.mjs` holds one table. The build writes it into `dist/_headers`, and the Worker sets the
same headers on every response it passes on, so they hold however Cloudflare serves a file.

| | The site's pages | `/demo/` |
|---|---|---|
| `Content-Security-Policy` | `default-src 'none'`; scripts, styles, fonts and frames from the site alone; pictures from the site and `data:`, for the bricks and merlons drawn in the stylesheet; with a token, also the beacon's script and its report to `cloudflareinsights.com`; never framed | everything from the site alone, scripts, styles, pictures, fonts and fetches; framed by the site alone |
| `X-Frame-Options` | `DENY` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` |

The display's page runs under its policy unchanged: `index.html` has no inline script, style or
handler, and the scripts set styles through the DOM, which the policy allows. No page of the site
has an inline script or style either, the docs' pages included, and `site.js` sizes the demo's
frame the same way.

## Visitor counts

Cloudflare Web Analytics counts visits to every page of the site, the docs' pages and the legal
pages included, never the demo or the 404 page ([the privacy notice](../legal/PRIVACY.md), section The website). The token is a
public value, kept in `site.json`. While it is empty the build leaves the snippet out and the
policy names no Cloudflare host; once it is set, the next build adds Cloudflare's one script tag to
those pages and allows its script and its report in their policy. The site is added to Web
Analytics by hand, with the JavaScript snippet. **Do not turn on its automatic setup** for these
hostnames: it would put the script into every HTML page Cloudflare serves, the demo's included,
where the demo's policy would refuse it.

## The Worker

The Worker runs before every request (`run_worker_first`), for two things the static files cannot
do alone: `www.knightwatcher.io` answers `301` to the same path and query on `knightwatcher.io`, and
every other answer gets the headers above. An address with no file gets the nearest `404.html`, with
the status `404`. Observability is off and the Worker calls no `console` method, so no log of its
requests is kept. It has no `workers.dev` or preview address, since neither
would sit behind Access, and no cron. Each request runs the Worker once, which counts towards the
Workers plan's daily requests.

## Deploying it

Done once, by the owner, with access to the Cloudflare account that holds the `knightwatcher.io`
zone. No Cloudflare token is kept anywhere else.

1. **Create the Access application, before the first deploy.** In Cloudflare Zero Trust, under
   Access, Applications, add a self-hosted application with two application domains,
   `knightwatcher.io` and `www.knightwatcher.io`, each with no path, so it covers every address;
   one policy, action Allow, including the owner's email address alone (for example
   `owner@example.com`): no "everyone", no email domain, no service token. Creating it first means
   both hostnames are behind Access from the moment the deploy creates them.
2. **Create the Worker with Workers Builds.** In the dashboard, under Workers & Pages, create a
   Worker by importing this repository, with:
   - the Worker's name `knightwatcher-site`, as in `wrangler.jsonc`;
   - the production branch `main`;
   - the root directory `site`;
   - the build command `node --test --test-concurrency=2 '../tests/site/*.test.mjs' && node build.mjs`,
     so a failing test stops the deploy (a pattern, since Node 24 takes no folder there);
   - the deploy command `npx wrangler deploy`;
   - the build variables `NODE_VERSION=24` and `WRANGLER_SEND_METRICS=false`;
   - Enable Preview Builds turned off, under Settings, Build, Branch control;
   - build watch paths, if set at all, that take in `site/**`, `web/**`, `legal/**`, `docs/**`,
     `README.md`, `CONTRIBUTING.md`, `collector/providers/builtin/**` and `tests/site/**`, since
     the demo, the legal pages, the docs and Supported Feeds come from them.

   The deploy creates both custom domains, with no `workers.dev` or preview address, and clears
   any cron trigger. In the dashboard, the Worker's observability should show as off.
3. **Set the Web Analytics token.** In Cloudflare's Web Analytics, add the site
   `knightwatcher.io` by hand (not the automatic setup), copy the token from the snippet it shows
   into `analyticsToken` in `site.json`, and commit. The next deploy adds the snippet.
4. **After every deploy, check both hostnames are still closed**, from a machine that is not signed
   in:

   ```bash
   for u in https://knightwatcher.io/ https://knightwatcher.io/demo/ https://knightwatcher.io/privacy/ https://www.knightwatcher.io/; do
     curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$u"
   done
   ```

   Each should print `302` with a redirect to `<team name>.cloudflareaccess.com` (the Access
   login), or `403`. A `200`, or a `301` from `www` to the apex, means the site is open to anyone:
   remove the custom domains or fix the Access application before doing anything else. Then sign
   in through a browser and check the demo runs, on a phone, a tablet and a desktop.

## Opening it at launch

On the day the repository goes public, and once the images the quick start pulls are published:

1. Reconnect the Worker's Workers Builds to the public repository, with the same settings as in
   step 2 above, and let it deploy.
2. Remove the Access application for `knightwatcher.io` and `www.knightwatcher.io`.
3. Check from a machine that is not signed in: `https://knightwatcher.io/` answers `200`,
   `https://www.knightwatcher.io/privacy/` answers `301` to `https://knightwatcher.io/privacy/`, and
   an address with nothing at it answers `404`.
