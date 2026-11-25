# The website

The website at `knightwatcher.io`: the landing page with the live demo, the privacy notice and the
art licence. Static files built from this folder, `web/` and `legal/`, served by a small Cloudflare
Worker and deployed by Workers Builds on each push to `main`, as the usage receiver in
[`telemetry/`](../telemetry/README.md) is. Until launch both of its hostnames sit behind Cloudflare
Access, open to the owner alone.

| Path | What it is |
|---|---|
| `pages/index.html` | the landing page, with the places the build fills marked `<!-- @name -->` |
| `pages/legal.html` | the template of the privacy notice's and the art licence's pages |
| `pages/404.html` | the page for an address with nothing at it |
| `parts/` | the nav, the footer and the GitHub mark, which every page shares |
| `css/site.css`, `js/site.js` | the stylesheet, and the script that draws the night sky and drives the demo's frame |
| `img/` | the pictures of the landing page: screenshots of the real page, at 640 by 400 and 1280 by 800, under CC BY-SA 4.0 with the rest of the art ([ART-LICENCE.md](../legal/ART-LICENCE.md)) |
| `site.json` | the Cloudflare Web Analytics token, empty until it is set |
| `build.mjs` | the build, which writes `dist/` |
| `markdown.mjs` | the renderer of the legal pages |
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

The build empties `site/dist/` and writes:

- the landing page, the 404 page, the stylesheet, the script and the pictures, with the logo, the
  favicon, the touch icon and the VT323 font (and its licence) copied from `web/`, so they are kept
  once in the repository (the logo and the icons are the project's own, under neither the code's
  nor the art's licence: [NAME-AND-LOGO.md](../legal/NAME-AND-LOGO.md));
- `privacy/` and `art-licence/`, rendered from `legal/PRIVACY.md` and `legal/ART-LICENCE.md`;
- `demo/`, the display's page: a copy of `web/` without `admin/` and `data/`, stamped with the
  commit being built;
- `_headers`, from `headers.mjs`.

The preview serves `dist/` with the same headers the Worker sets, the 404 page for anything else,
and binds to `127.0.0.1` alone. The tests are in `tests/site/` ([tests.md](../docs/tests.md#the-websites-tests)):

```bash
tools/capped.sh node --test --test-concurrency=2 tests/site/
```

## The demo

The demo is the real page, framed at `/demo/?demo#demo=1&bar=0` near the top of the landing page,
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
  reload ([The address](../docs/display.md#the-address)). A tap on the demo still brings back its
  review bar.

## The legal pages

`markdown.mjs` renders the subset the two files use: headings of levels one to three, paragraphs,
`- ` lists, fenced code, links, bold and inline code, every piece of text escaped. Anything else,
a table, a quote, a numbered list, raw HTML or italics, stops the build with the file and the line,
so an edit to `legal/` that the site cannot show is found before it is deployed. Extend the
renderer and its tests before using something new there.

A relative link goes to the file on GitHub, a folder to its tree, except that
`legal/PRIVACY.md` and `legal/ART-LICENCE.md` link to each other's pages on the site. A level two
heading's id is its words in lower case joined by hyphens, without a leading "the", so the privacy
notice's section The website is `/privacy/#website`, where the footer's line on visitor counts
points. Each page ends by naming its file in the repository.

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
has an inline script either, and `site.js` sizes the demo's frame the same way.

## Visitor counts

Cloudflare Web Analytics counts visits to the landing page and the legal pages, never the demo or
the 404 page ([the privacy notice](../legal/PRIVACY.md), section The website). The token is a
public value, kept in `site.json`. While it is empty the build leaves the snippet out and the
policy names no Cloudflare host; once it is set, the next build adds Cloudflare's one script tag to
those three pages and allows its script and its report in their policy. The site is added to Web
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
   - build watch paths, if set at all, that take in `site/**`, `web/**`, `legal/**` and
     `tests/site/**`, since the demo and the legal pages come from `web/` and `legal/`.

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
