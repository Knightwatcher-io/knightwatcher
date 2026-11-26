## What and why

<!-- What this pull request changes, and why. "Fixes #12" closes issue 12 when it is merged; delete the line if there is no issue. -->

Fixes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change: an existing setup stops working, or a setting changes meaning
- [ ] Documentation
- [ ] A provider: built in, a provider file or a generic check
- [ ] A pack or a world

## Checks run

<!-- Tick what you ran. docs/development.md, under Checks, says what each one covers. -->

- [ ] `tools/check.sh`, or the subsets this touches: `python`, `lint`, `page`, `tools-site`, `schema`
- [ ] If `telemetry/` changed: `(cd telemetry && npm ci && npm run check)`
- [ ] If `site/` changed: `node site/build.mjs`

CI runs the same checks.

## Documentation

- [ ] No documentation change is needed.
- [ ] The docs that describe this change are updated in this pull request, as the rule [Docs describe what is built](https://github.com/knightwatcher-io/knightwatcher/blob/main/docs/development.md#rules) asks.

## Security impact

- [ ] None.
- [ ] It touches the collector's privileges, the server, the admin page, credentials, network exposure, the usage counts or pack signing, and [docs/security.md](https://github.com/knightwatcher-io/knightwatcher/blob/main/docs/security.md) still holds.

## Packs

<!-- Only for a change under web/packs/. Delete this section otherwise. -->

- [ ] Each changed pack is unsigned with `node tools/sign-pack.js --unsign`, which writes its carrier again. The project signs it at release.

## Visual changes

<!-- For anything drawn: the knight, a scene, the settings screen, the admin page or the website. Drag a before and an after screenshot into this box. For the page, tools/shots.sh takes the same shots before and after a change (docs/shots.md). Keep every real address, name and title off screen. -->

## Tried on a display

<!-- What you tried by hand, and the browser and device you tried it on, such as Chromium on a Raspberry Pi 5 or Fully Kiosk Browser on an Android tablet. -->

## Sign-off

- [ ] Every commit is signed off (`git commit -s`), as [CONTRIBUTING.md](https://github.com/knightwatcher-io/knightwatcher/blob/main/.github/CONTRIBUTING.md#sign-off-every-commit) asks.
- [ ] This pull request changes no logo or icon.
