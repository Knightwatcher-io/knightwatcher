#!/usr/bin/env bash
# Regression screenshots of the page in demo mode, and a comparison of two sets of them.
#
#   CHROME=/path/to/chrome-headless-shell tools/shots.sh take DIR
#   tools/shots.sh compare REFERENCE_DIR RESULT_DIR
#
# take opens web/index.html from disk once per entry in SHOTS, with time frozen by the address's
# t= hook, and writes DIR/<name>.png at 960 by 600. PAGE names another copy of the page to shoot,
# such as an older version kept outside the repository. compare decodes each pair of PNGs and counts
# the pixels that differ outside the clock, whose digits change with the minute. It exits 1 when
# any pair differs or is missing. Keep both directories outside the repository.
#
# With time frozen each shot depends only on its address, however many frames the browser paints,
# so a single DIFF is a real difference.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# name|address hash. Every entry hides the review bar and freezes time.
SHOTS=(
  "is-battlement|bar=0&t=2300&is=battlement"
  "is-camp|bar=0&t=2300&is=camp"
  "is-house|bar=0&t=2300&is=house"
  "is-yard|bar=0&t=2300&is=yard"
  "on-attack|bar=0&t=2300&on=attack"
  "on-wan|bar=0&t=2300&on=wan"
  "on-sick|bar=0&t=2300&on=sick"
  "on-disk|bar=0&t=2300&on=disk"
  "on-backup|bar=0&t=2300&on=backup"
  "on-pi|bar=0&t=2300&on=pi"
  "on-cpu|bar=0&t=2300&on=cpu"
  "on-swap|bar=0&t=2300&on=swap"
  "on-ssh|bar=0&t=2300&on=ssh"
  "on-update|bar=0&t=1250&on=update"
  "on-plex|bar=0&t=2300&on=plex"
  "on-night|bar=0&t=2300&on=night"
  "on-many|bar=0&t=2300&on=attack,swap,ssh"
  "swat|bar=0&t=470&is=battlement&f=6&sw=1"
  "goblin|bar=0&t=1300&is=battlement&e=goblin"
  "crate|bar=0&t=1700&is=camp&e=crate"
  "feast|bar=0&t=1800&is=house&e=feast"
  "helm-off-l|bar=0&t=2300&is=yard&h=off&hs=l&on=cpu"
  "kx|bar=0&t=2300&is=camp&kx=60"
  "mon-b|bar=0&t=3450&on=ssh&mon=b"
  "mon-c|bar=0&t=3450&on=ssh&mon=c"
  "things-camp|bar=0&t=2300&is=camp&th=pi,camera,camera!,machine-,vm,x,machine"
  "things-court|bar=0&t=3600&on=ssh&th=pi,camera!,machine,camera,vm-,x"
  "thing-down|bar=0&t=2300&is=camp&on=thing&th=pi,camera,camera,machine,vm!,x"
  "places-yard|bar=0&t=2300&is=yard&pl=1&th=pi,camera!,camera,camera,machine,vm-,x!"
  # the arming sword and the heater shield (arm=one): the stance, the practice swing mid-cut, the
  # attack, the gear at rest in the house and the smithy, and the swat to the left at the moment the
  # sword passes behind the shield
  "arm-battlement|bar=0&t=2300&is=battlement&arm=one"
  "arm-yard|bar=0&t=2470&on=cpu&arm=one"
  "arm-attack|bar=0&t=2300&on=attack&arm=one"
  "arm-house|bar=0&t=2300&is=house&arm=one"
  "arm-update|bar=0&t=1250&on=update&arm=one"
  "arm-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=one"
  "goblin-rise|bar=0&t=460&is=battlement&e=goblin"
  "goblin-bonk|bar=0&t=1659&is=battlement&e=goblin"
  "goblin-poof|bar=0&t=1900&is=battlement&e=goblin"
  "goblin-camp-rise|bar=0&t=500&is=camp&e=goblin"
  "goblin-camp-bonk|bar=0&t=1659&is=camp&e=goblin"
  "goblin-camp-poof|bar=0&t=2400&is=camp&e=goblin"
  "goblin-camp-g3|bar=0&t=1300&is=camp&e=goblin&th=pi,machine,vm,box"
  "arm-goblin-bonk|bar=0&t=1665&is=battlement&e=goblin&arm=one"
  "arm-goblin-camp-bonk|bar=0&t=1674&is=camp&e=goblin&arm=one"
)

take() {
  local dir="$1"
  if [[ -z "${CHROME:-}" || ! -x "$CHROME" ]]; then
    echo "shots: set CHROME to a headless Chromium binary" >&2
    exit 2
  fi
  local page="${PAGE:-$root/web/index.html}"
  mkdir -p "$dir"
  local entry name hash
  for entry in "${SHOTS[@]}"; do
    name="${entry%%|*}"
    hash="${entry#*|}"
    "$CHROME" --no-sandbox --hide-scrollbars --window-size=960,600 --virtual-time-budget=1500 \
      --screenshot="$dir/$name.png" "file://$page#$hash" </dev/null >/dev/null 2>&1
    echo "took $name"
  done
}

compare() {
  local names=() entry
  for entry in "${SHOTS[@]}"; do names+=("${entry%%|*}"); done
  python3 -I - "$1" "$2" "${names[@]}" <<'PY'
import struct, sys, zlib

# The clock sits in the top right corner. Its region is left out of the comparison. At 960 by 600
# its ink reaches x 752 and y 20 to 85 at the widest hour, one starting with 2, so the mask starts
# 12 pixels further left to leave room for a scene that lays the text out a pixel differently.
MASK_X0, MASK_Y1 = 740, 110

def decode(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(path + " is not a PNG")
    pos, idat, ihdr = 8, b"", None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    w, h, depth, ctype = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    if depth != 8 or ctype not in (2, 6):
        raise ValueError(path + ": only 8-bit RGB or RGBA is handled")
    bpp = 4 if ctype == 6 else 3
    raw, stride, rows, prev = zlib.decompress(idat), w * bpp, [], bytearray(w * bpp)
    for y in range(h):
        ft = raw[y * (stride + 1)]
        cur = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = cur[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1: cur[i] = (cur[i] + a) & 255
            elif ft == 2: cur[i] = (cur[i] + b) & 255
            elif ft == 3: cur[i] = (cur[i] + (a + b) // 2) & 255
            elif ft == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(cur)); prev = cur
    return w, h, bpp, rows

ref, res, names = sys.argv[1], sys.argv[2], sys.argv[3:]
bad = 0
for name in names:
    a, b = f"{ref}/{name}.png", f"{res}/{name}.png"
    try:
        with open(a, "rb") as fa, open(b, "rb") as fb:
            if fa.read() == fb.read():
                print(f"same   {name} (identical bytes)"); continue
        wa, ha, pa, ra = decode(a); wb, hb, pb, rb = decode(b)
    except (OSError, ValueError) as e:
        print(f"ERROR  {name}: {e}"); bad += 1; continue
    if (wa, ha) != (wb, hb):
        print(f"DIFF   {name}: size {wa}x{ha} against {wb}x{hb}"); bad += 1; continue
    diff = 0
    for y in range(ha):
        if ra[y] == rb[y]: continue
        for x in range(wa):
            if y < MASK_Y1 and x >= MASK_X0: continue
            if ra[y][x * pa:x * pa + 3] != rb[y][x * pb:x * pb + 3]: diff += 1
    if diff:
        print(f"DIFF   {name}: {diff} pixels differ outside the clock"); bad += 1
    else:
        print(f"same   {name} (pixels equal outside the clock)")
print(f"{len(names) - bad} of {len(names)} match")
sys.exit(1 if bad else 0)
PY
}

case "${1:-}" in
  take) [[ $# -eq 2 ]] || { echo "usage: $0 take DIR" >&2; exit 2; }; take "$2" ;;
  compare) [[ $# -eq 3 ]] || { echo "usage: $0 compare REFERENCE_DIR RESULT_DIR" >&2; exit 2; }; compare "$2" "$3" ;;
  *) echo "usage: $0 take DIR | compare REFERENCE_DIR RESULT_DIR" >&2; exit 2 ;;
esac
