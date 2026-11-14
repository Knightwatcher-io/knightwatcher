#!/usr/bin/env bash
# Regression screenshots of the page in demo mode, and a comparison of two sets of them.
#
#   CHROME=/path/to/chrome-headless-shell tools/shots.sh take DIR
#   tools/shots.sh compare REFERENCE_DIR RESULT_DIR
#
# take opens web/index.html from disk once per entry in SHOTS, with time frozen by the address's
# t= hook, and writes DIR/<name>.png at 960 by 600, or at the size an entry names after a second |. PAGE names another copy of the page to shoot,
# such as an older version kept outside the repository. compare decodes each pair of PNGs and counts
# the pixels that differ outside the clock, whose digits change with the minute. It exits 1 when
# any pair differs or is missing. Keep both directories outside the repository.
#
# With time frozen each shot depends only on its address, however many frames the browser paints,
# so a single DIFF is a real difference.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# name|address hash, or name|address hash|width,height. Every entry hides the review bar and freezes
# time.
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
  # the arming sword and the heater shield (arm=one): the stance, the yard's hot training mid-swing,
  # the attack, the gear at rest in the house and the smithy, the swat to the left at the moment the
  # sword passes in front of the shield, and the cellar's crate carried at the largest headline
  "arm-battlement|bar=0&t=2300&is=battlement&arm=one"
  "arm-yard|bar=0&t=2470&on=cpu&arm=one"
  "arm-attack|bar=0&t=2300&on=attack&arm=one"
  "arm-house|bar=0&t=2300&is=house&arm=one"
  "arm-update|bar=0&t=1250&on=update&arm=one"
  "arm-swat-left|bar=0&t=1330&is=battlement&f=6&sw=1&arm=one"
  "arm-disk|bar=0&t=2300&on=disk&hs=l&arm=one"
  "goblin-rise|bar=0&t=460&is=battlement&e=goblin"
  "goblin-bonk|bar=0&t=1659&is=battlement&e=goblin"
  "goblin-poof|bar=0&t=1900&is=battlement&e=goblin"
  "goblin-camp-rise|bar=0&t=500&is=camp&e=goblin"
  "goblin-camp-bonk|bar=0&t=1659&is=camp&e=goblin"
  "goblin-camp-poof|bar=0&t=2400&is=camp&e=goblin"
  "goblin-camp-g3|bar=0&t=1300&is=camp&e=goblin&th=pi,machine,vm,box"
  # the goblin bonked with the sword and shield, a moment after the hit: on the battlement at 1645,
  # at the camp at 1672
  "arm-goblin-bonk|bar=0&t=1646&is=battlement&e=goblin&arm=one"
  "arm-goblin-camp-bonk|bar=0&t=1674&is=camp&e=goblin&arm=one"
  # the free options, chosen by the look hooks (sk= hc= hy= tb= pm=): looks other than the default,
  # the tail of the tied hair under the helmet, a sick and a hot face on dark skins, and the brows'
  # dark edge where the brows are near the skin's own lightness
  "look-deep-curls|bar=0&t=2300&is=battlement&h=off&sk=deep&hc=black&hy=curls&tb=sable&pm=gold"
  "look-fair-tied|bar=0&t=2300&is=yard&h=off&sk=fair&hc=auburn&hy=tied&tb=wine&arm=one"
  "look-tied-helmet|bar=0&t=2300&is=battlement&sk=fair&hc=auburn&hy=tied&tb=wine&pm=white&arm=one"
  "look-house|bar=0&t=2300&is=house&sk=golden&hc=blonde&tb=teal&pm=royal&arm=one"
  "look-sick-deep|bar=0&t=2300&on=sick&sk=deep&hc=dark&hy=tied&tb=forest"
  "look-hot-brown|bar=0&t=2300&on=cpu&h=off&sk=brown&hc=silver&hy=curls&tb=violet&pm=green"
  "look-brows|bar=0&t=2300&on=wan&h=off&sk=brown&hc=brown"
  # the settings screen (set=), open on each page over the battlement, and the cue of the hold that
  # opens it; the knight's page with a look of the hooks' and at the tablet's size; the monarch's
  # page with a skin of the hooks'; the 12-hour clock (ck=12); and the court's monarch in a skin of
  # the hooks' (ms=)
  "settings-knight|bar=0&t=2300&is=battlement&set=knight"
  "settings-monarch|bar=0&t=2300&is=battlement&set=monarch"
  "settings-display|bar=0&t=2300&is=battlement&set=display"
  "settings-quiet|bar=0&t=2300&is=battlement&set=quiet"
  "settings-status|bar=0&t=2300&is=battlement&set=status"
  "settings-hold|bar=0&t=2300&is=battlement&set=hold"
  "settings-look|bar=0&t=2300&is=camp&set=knight&arm=one&sk=tan&hc=blonde&hy=curls&tb=forest&pm=gold"
  "settings-tablet|bar=0&t=2300&is=house&set=knight|1480,924"
  "settings-monarch-skin|bar=0&t=2300&is=battlement&set=monarch&mon=b&ms=deep"
  "clock-12|bar=0&t=2300&is=camp&ck=12"
  "mon-skin|bar=0&t=3450&on=ssh&mon=c&ms=brown"
  # the monarch's hair and robe (mh= and mr=): the monarch's page at the tablet's size, where both
  # rows show, and each monarch at court in two combinations, one of them on another skin
  "settings-monarch-colours|bar=0&t=2300&is=battlement&set=monarch&mon=c&mh=auburn&mr=teal|1480,924"
  "mon-a-colours|bar=0&t=3450&on=ssh&mon=a&mh=silver&mr=teal"
  "mon-a-colours-tan|bar=0&t=3450&on=ssh&mon=a&mh=black&mr=violet&ms=tan"
  "mon-b-colours|bar=0&t=3450&on=ssh&mon=b&mh=auburn&mr=forest"
  "mon-b-colours-deep|bar=0&t=3450&on=ssh&mon=b&mh=blonde&mr=sable&ms=deep"
  "mon-c-colours|bar=0&t=3450&on=ssh&mon=c&mh=black&mr=wine"
  "mon-c-colours-fair|bar=0&t=3450&on=ssh&mon=c&mh=silver&mr=blue&ms=fair"
  # a scene chosen for a condition (sc=): the Scenes page, at the screenshots' size and at the
  # tablet's with the attack set to the camp by the address, and running hot at the camp and the
  # empty dish stared at from the battlement
  "settings-scenes|bar=0&t=2300&is=battlement&set=scenes"
  "settings-scenes-tablet|bar=0&t=2300&is=battlement&set=scenes&sc=attack:camp|1480,924"
  "scene-cpu-camp|bar=0&t=2300&on=cpu&sc=cpu_hot:camp"
  "scene-pi-battlement|bar=0&t=2300&on=pi&sc=pi_silent:battlement"
  # the builds Broad (bd=b) and Slim (bd=c), each in turn: every scene with the knight standing, the
  # attack, the bloat of tight memory, the cellar's crate carried, the smithy's hammering, in bed
  # (the head alone), the sick tint in bed and the hot tint in the yard; the stance with the sword
  # and shield; the swat, which is the swing, both ways with each weapon, at the wind-up (q .3), mid
  # cut (q .42) and the cut's end (q .55); the goblin a millisecond after each weapon's hit on that
  # build; and the settings screen's knight page with the build chosen
  "bd-b-is-battlement|bar=0&t=2300&is=battlement&bd=b"
  "bd-b-is-camp|bar=0&t=2300&is=camp&bd=b"
  "bd-b-is-house|bar=0&t=2300&is=house&bd=b"
  "bd-b-is-yard|bar=0&t=2300&is=yard&bd=b"
  "bd-b-on-attack|bar=0&t=2300&on=attack&bd=b"
  "bd-b-on-swap|bar=0&t=2300&on=swap&bd=b"
  "bd-b-on-disk|bar=0&t=2300&on=disk&bd=b"
  "bd-b-on-update|bar=0&t=1250&on=update&bd=b"
  "bd-b-on-night|bar=0&t=2300&on=night&bd=b"
  "bd-b-on-sick|bar=0&t=2300&on=sick&bd=b"
  "bd-b-on-cpu|bar=0&t=2300&on=cpu&bd=b"
  "bd-b-on-ssh|bar=0&t=3450&on=ssh&bd=b"
  "bd-b-arm-battlement|bar=0&t=2300&is=battlement&arm=one&bd=b"
  "bd-b-swing-two-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-two-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=two&bd=b"
  "bd-b-swing-one-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-swing-one-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=one&bd=b"
  "bd-b-goblin-bonk|bar=0&t=1662&is=battlement&e=goblin&bd=b"
  "bd-b-arm-goblin-bonk|bar=0&t=1652&is=battlement&e=goblin&arm=one&bd=b"
  "bd-b-settings-knight|bar=0&t=2300&is=battlement&set=knight&bd=b"
  "bd-c-is-battlement|bar=0&t=2300&is=battlement&bd=c"
  "bd-c-is-camp|bar=0&t=2300&is=camp&bd=c"
  "bd-c-is-house|bar=0&t=2300&is=house&bd=c"
  "bd-c-is-yard|bar=0&t=2300&is=yard&bd=c"
  "bd-c-on-attack|bar=0&t=2300&on=attack&bd=c"
  "bd-c-on-swap|bar=0&t=2300&on=swap&bd=c"
  "bd-c-on-disk|bar=0&t=2300&on=disk&bd=c"
  "bd-c-on-update|bar=0&t=1250&on=update&bd=c"
  "bd-c-on-night|bar=0&t=2300&on=night&bd=c"
  "bd-c-on-sick|bar=0&t=2300&on=sick&bd=c"
  "bd-c-on-cpu|bar=0&t=2300&on=cpu&bd=c"
  "bd-c-on-ssh|bar=0&t=3450&on=ssh&bd=c"
  "bd-c-arm-battlement|bar=0&t=2300&is=battlement&arm=one&bd=c"
  "bd-c-swing-two-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-two-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=two&bd=c"
  "bd-c-swing-one-right-wind|bar=0&t=270&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-right-cut|bar=0&t=378&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-right-end|bar=0&t=495&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-wind|bar=0&t=1170&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-cut|bar=0&t=1278&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-swing-one-left-end|bar=0&t=1395&is=battlement&f=6&sw=1&arm=one&bd=c"
  "bd-c-goblin-bonk|bar=0&t=1658&is=battlement&e=goblin&bd=c"
  "bd-c-arm-goblin-bonk|bar=0&t=1643&is=battlement&e=goblin&arm=one&bd=c"
  "bd-c-settings-knight|bar=0&t=2300&is=battlement&set=knight&bd=c"
)

take() {
  local dir="$1"
  if [[ -z "${CHROME:-}" || ! -x "$CHROME" ]]; then
    echo "shots: set CHROME to a headless Chromium binary" >&2
    exit 2
  fi
  local page="${PAGE:-$root/web/index.html}"
  mkdir -p "$dir"
  local entry name hash size
  for entry in "${SHOTS[@]}"; do
    name="${entry%%|*}"
    hash="${entry#*|}"
    size=960,600
    if [[ "$hash" == *"|"* ]]; then size="${hash#*|}"; hash="${hash%%|*}"; fi
    "$CHROME" --no-sandbox --hide-scrollbars --window-size="$size" --virtual-time-budget=1500 \
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
# 12 pixels further left to leave room for a scene that lays the text out a pixel differently. The
# words are sized to the window, so a shot of another size of the same shape, such as the tablet's
# 1480 by 924, has its mask scaled with it.
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
            if y < MASK_Y1 * ha / 600 and x >= MASK_X0 * wa / 960: continue
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
