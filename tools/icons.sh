#!/usr/bin/env bash
# Regenerates the page's raster icons from their SVG sources, so that no binary icon is ever
# edited by hand.
#
#   CHROME=/path/to/chrome-headless-shell tools/icons.sh [TARGET_DIR]
#
# Reads tools/icons/ and writes into TARGET_DIR, which is web/ unless named:
#
#   favicon.ico          the 16, 32 and 48 pixel drawings (icon-16.svg, icon-32.svg, icon-48.svg),
#                        each rendered at its own size and packed into one ICO as PNG images;
#   apple-touch-icon.png 180 by 180 from icon-d.svg on an opaque black, with a margin of a tenth;
#   icon-192.png         192 by 192 from icon-d.svg, transparent;
#   icon-512.png         512 by 512 from icon-d.svg, transparent.
#
# Each image is rendered by the browser at its exact size with a transparent background, one at a
# time, from a small page written to a temporary folder. Nothing in the output depends on the time
# or on the folder, so a second run gives the same bytes.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/tools/icons"
out="${1:-$root/web}"

usage() { echo "usage: CHROME=/path/to/chrome-headless-shell $0 [TARGET_DIR]" >&2; exit 2; }
[[ $# -le 1 ]] || usage
if [[ -z "${CHROME:-}" || ! -x "$CHROME" ]]; then
  echo "icons: set CHROME to a headless Chromium binary" >&2
  exit 2
fi
for f in icon-16.svg icon-32.svg icon-48.svg icon-d.svg; do
  [[ -f "$src/$f" ]] || { echo "icons: $src/$f not found" >&2; exit 1; }
done
mkdir -p "$out"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# render SVG SIZE PAD BACKGROUND DEST: the drawing at SIZE minus PAD on every side, on BACKGROUND
# (a CSS colour, or transparent), as a SIZE by SIZE PNG.
render() {
  local svg="$1" size="$2" pad="$3" bg="$4" dest="$5" inner=$(( $2 - 2 * $3 ))
  cat > "$work/page.html" <<HTML
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:$bg}img{display:block;margin:${pad}px;width:${inner}px;height:${inner}px}</style>
<img src="file://$svg">
HTML
  "$CHROME" --no-sandbox --hide-scrollbars --window-size="$size,$size" \
    --default-background-color=00000000 --screenshot="$dest" "file://$work/page.html" </dev/null >/dev/null 2>&1
  [[ -s "$dest" ]] || { echo "icons: the browser wrote nothing for $dest" >&2; exit 1; }
  echo "rendered $(basename "$dest")"
}

for n in 16 32 48; do render "$src/icon-$n.svg" "$n" 0 transparent "$work/ico-$n.png"; done
render "$src/icon-d.svg" 180 18 "#000" "$work/apple-touch-icon.png"
render "$src/icon-d.svg" 192 8 transparent "$work/icon-192.png"
render "$src/icon-d.svg" 512 20 transparent "$work/icon-512.png"

# An ICO file may hold PNG images directly: a 6 byte header, a 16 byte directory entry for each
# image, then the images.
python3 -I - "$work" "$out/favicon.ico" 16 32 48 <<'PY'
import struct, sys
work, dest, sizes = sys.argv[1], sys.argv[2], [int(s) for s in sys.argv[3:]]
images = []
for n in sizes:
    with open(f"{work}/ico-{n}.png", "rb") as f:
        images.append((n, f.read()))
data = struct.pack("<HHH", 0, 1, len(images))
offset = 6 + 16 * len(images)
for n, png in images:
    data += struct.pack("<BBBBHHII", n, n, 0, 0, 1, 32, len(png), offset)
    offset += len(png)
data += b"".join(png for _, png in images)
with open(dest, "wb") as f:
    f.write(data)
PY
echo "wrote favicon.ico"

for f in apple-touch-icon.png icon-192.png icon-512.png; do cp "$work/$f" "$out/$f"; echo "wrote $f"; done
