#!/usr/bin/env bash
# Deploys the page: copies web/ to the folder a web server serves, and stamps the copy with a
# version so that open displays reload themselves onto it.
#
#   tools/deploy.sh TARGET_DIR
#
# The copy leaves TARGET_DIR/data/ (where the collector writes) alone and deletes any other file
# that is not in web/. The version is a hash of web/: sha256 over the names and contents of its
# files, in a stable order and leaving data/ out, cut to 12 hex characters. It does not depend on
# git, so the tool works from an exported copy, and a deploy that changes nothing in web/ gives the
# same version and reloads nobody. In the copy only, the tool:
#
#   - writes version.json beside index.html: {"version": "<hash>"};
#   - sets the kw-version meta tag of index.html to the version;
#   - appends ?v=<hash> to every local script and stylesheet address in index.html, so that a new
#     version is fetched under addresses no cache has seen.
#
# Nothing under web/ in the repository changes. docs/display.md describes how the page checks.
set -euo pipefail

usage() { echo "usage: $0 TARGET_DIR" >&2; exit 2; }
fail() { echo "deploy: $*" >&2; exit 1; }
[[ $# -eq 1 && -n "$1" ]] || usage

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/web"
[[ -f "$src/index.html" ]] || fail "$src/index.html not found"

# The target must be neither web/ nor inside it, nor a folder that holds web/: the delete would
# then reach the repository. Both are resolved before anything is created.
target="$(realpath -m -- "$1")"
src_real="$(realpath -- "$src")"
case "$target/" in "$src_real/"*) fail "the target $target is inside $src_real" ;; esac
case "$src_real/" in "$target/"*) fail "the target $target holds $src_real" ;; esac
mkdir -p -- "$target"

# The version: one line per file (its hash and its name, from sha256sum), in byte order of the
# names, hashed again.
version="$(cd "$src" && find . -path ./data -prune -o -type f -print0 | LC_ALL=C sort -z \
  | xargs -0 -r sha256sum | sha256sum | cut -c1-12)"
[[ "$version" =~ ^[0-9a-f]{12}$ ]] || fail "could not compute the version"

# A stamped copy is built in a staging folder first, so that the target never holds an
# unstamped index.html.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
rsync -a --exclude=/data/ "$src/" "$stage/"

# Local addresses: relative, or from the root of the site, but not with a scheme or a host
# (//host/...), and not already carrying a query or a fragment.
local_addr='/?[^/"#?:][^"#?:]*'
sed -E -i \
  -e "s|(<meta name=\"kw-version\" content=\")dev(\")|\\1$version\\2|" \
  -e "s|(<script[^>]* src=\")($local_addr)(\")|\\1\\2?v=$version\\3|g" \
  -e "/<link[^>]* rel=\"stylesheet\"/ s|(<link[^>]* href=\")($local_addr)(\")|\\1\\2?v=$version\\3|g" \
  "$stage/index.html"
printf '{"version": "%s"}\n' "$version" > "$stage/version.json"

grep -q "<meta name=\"kw-version\" content=\"$version\">" "$stage/index.html" \
  || fail "index.html has no <meta name=\"kw-version\" content=\"dev\"> to stamp"
if grep -E "<script[^>]* src=\"$local_addr\"|<link[^>]* rel=\"stylesheet\"[^>]* href=\"$local_addr\"" "$stage/index.html" >&2; then
  fail "a local address above was left unstamped"
fi

# Two passes. The first brings every other file in and deletes nothing, so a page that reloads
# while the deploy runs finds the new scripts in place before it can see the new index.html. The
# second brings index.html and version.json, then deletes what web/ no longer has. data/ is
# excluded from both, which also keeps --delete away from it. Files are compared by their
# contents: a stamped index.html keeps its size from one version to the next, and two deploys
# within one second would give it the same time too.
rsync -a --checksum --exclude=/data/ --exclude=/index.html --exclude=/version.json "$stage/" "$target/"
rsync -a --checksum --delete-after --exclude=/data/ "$stage/" "$target/"

echo "deployed $version to $target"
