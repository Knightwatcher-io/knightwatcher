# Contributing

Contributions of code and art are welcome: fixes, providers for more services, features, new
items for the knight, scenes and worlds. For a large change, open an issue first, so that nobody
spends days on something that cannot be merged.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). A vulnerability is reported
privately, as [SECURITY.md](SECURITY.md) says, never in an issue.

## Where to help

- **Providers.** A
  [provider request](https://github.com/knightwatcher-io/knightwatcher/issues/new?template=provider.yml)
  or a provider file is the easiest start ([docs/providers.md](../docs/providers.md)).
- **Labelled issues.** Those marked
  [good first issue](https://github.com/knightwatcher-io/knightwatcher/labels/good%20first%20issue)
  or [help wanted](https://github.com/knightwatcher-io/knightwatcher/labels/help%20wanted).
- **Hardware.** Running it on a machine or a NAS it has not been tried on, and saying how it went
  ([what you need](../docs/install.md#what-you-need)).
- **Worlds and packs.** New items for the knight, scenes and whole worlds
  ([docs/worlds.md](../docs/worlds.md), [docs/packs.md](../docs/packs.md)).

## How the project is run

Valtora maintains the project and reviews every pull request, as [CODEOWNERS](CODEOWNERS) sets.
The packs the page ships are signed with the project's key, which is held privately. You never
need it: a change to a pack takes its signature off, as [Before you open a pull
request](#before-you-open-a-pull-request) says, and the project signs the pack again at release.
A release is a tag, and CI builds and publishes the image from it
([Releases and images](../docs/development.md#releases-and-images)).

## The licences

What you contribute is under the same licence as the part it goes into, the licence everyone
else receives it under:

- code under the GNU Affero General Public License, version 3 or later, in [LICENSE](../LICENSE);
- art and pack data under CC BY-SA 4.0, as [legal/ART-LICENCE.md](../legal/ART-LICENCE.md) describes,
  with the legal text in [legal/LICENSE-ART](../legal/LICENSE-ART).

You keep the copyright in your work. If your contribution holds someone else's work, say so in the
pull request and name its licence, which must allow it to be used under these terms.

## Sign off every commit

Each commit carries a `Signed-off-by:` line with the name and email you commit under. The line
certifies the Developer Certificate of Origin 1.1, in [legal/DCO](../legal/DCO): in short, that you wrote the
change, or otherwise have the right to submit it under the project's licences. `git commit -s`
adds the line from your git config:

```bash
git commit -s -m "fix(collector): read the pool's state"
```

To sign off commits you have already made, `git commit --amend -s` does the last one and
`git rebase --signoff main` every commit of your branch. A check on every pull request fails while
any commit in it lacks a `Signed-off-by:` line naming its author.

The history from before the project went public was written by its sole author and predates this
rule, so only 2 of its first 151 commits carry the line; every contribution from now on is signed
off.

## Pull requests and checks

The project's owner pushes to `main`. Every other change comes as a pull request, which is merged
once it passes the `CI gate` check and the sign-off check and the code owner has reviewed it. The
`CI gate` check runs the project's checks, and `tools/check.sh` runs the same ones on your own
machine ([docs/development.md](../docs/development.md#checks)).

One check is the maintainer's alone: `tools/check-private.sh`, which looks for the operator's
private details in a list kept outside the repository. It runs before a merge. Without that list,
your `tools/check.sh` skips it and says so, without failing.

## Before you open a pull request

Run the checks with `tools/check.sh`, as [docs/development.md](../docs/development.md#checks) says,
and follow its
[rules](../docs/development.md#rules): among them, update the docs that describe what you changed in
the same commit, and write the commit message as a Conventional Commit. A change to a pack in
`web/packs/` breaks its signature: take it off with `node tools/sign-pack.js --unsign`, and the
project signs the pack again when it releases it
([Signing the packs](../docs/development.md#signing-the-packs)).
