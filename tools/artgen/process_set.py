#!/usr/bin/env python3
"""Phase 2 processing for the fal candidate set. Pillow only. No paid calls.

  process_set.py build    cut out and snap every asset, share one palette, write final/ and
                          the sheets
  process_set.py sheets   rebuild the sheets and the gallery from final/ without reprocessing

Sprites share one scale. The measure is the collar-to-baseline height of the figure: the top row
of his blue tabard to the bottom of his boots. It is the same for a helmed and a bare-headed
knight, which a head-to-boots height is not.
"""

import json
import re
import sys
from pathlib import Path

import process as P
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = P.ROOT
FAL = P.CAND / "fal"
RAW = FAL / "raw"
FINAL = FAL / "final"
CELL = P.CELL
MAX_COLOURS = 64
TOL = 0.04

PHASE1 = ["idle", "angry", "sweating", "asleep", "walking"]
HELM_ON = [
    "walk-b",
    "bloated",
    "puzzled",
    "happy",
    "talking",
    "carrying",
    "swing-windup",
    "swing-mid",
    "swing-end",
]
HELM_OFF = [
    "idle-bare",
    "hungry-bare",
    "happy-bare",
    "eating-bare",
    "yawning-bare",
    "hammer-up",
    "hammer-down",
]
BEDS = ["bed-empty", "bed-asleep", "bed-sick"]
BACKDROPS = ["smithy", "battlement", "camp", "house", "yard", "cellar", "court"]
# which raw attempt is used, where it is not the only one
PICK = {
    "eating-bare": 2,
    "hammer-down": 2,
    "bed-empty": 2,
    "bed-asleep": 2,
    "bed-sick": 2,
    "yard": 2,
    "court": 3,
    "props-a": 2,
    "angry-raised": 2,
}
RAWNAME = {"angry": "angry-raised"}  # the alarm pose is regenerated in phase 3
FLIP = {"bed-asleep"}  # drawn with the head on the other side; mirrored to match the others

# prop sheet -> names in reading order, and the target size in device pixels per item
# (long side, or height for the flames and the king). Items listed together share one scale.
PROPS = {
    "props-a": ["pie", "plate-empty", "crate", "parachute", "goblin", "fly-up", "fly-down"],
    "props-b": ["flame-a", "flame-b", "torch-a", "torch-b", "drumstick", "tv-a", "tv-b"],
    "props-c": ["king-closed", "king-open"],
}
PROP_TARGET = {
    ("pie", "plate-empty"): ("w", 72),
    ("crate",): ("w", 78),
    ("parachute",): ("w", 150),
    ("goblin",): ("w", 69),
    ("fly-up", "fly-down"): ("w", 24),
    ("flame-a", "flame-b"): ("h", 90),
    ("torch-a", "torch-b"): ("h", 39),
    ("drumstick",): ("w", 51),
    ("tv-a", "tv-b"): ("w", 111),
    ("king-closed", "king-open"): ("h", 231),
}


def raw_path(name: str, phase1: bool = False):
    name = RAWNAME.get(name, name)
    key = name
    pat = re.compile(rf"^{re.escape(key)}-(\d+)$")
    found = sorted((int(m.group(1)), p) for p in RAW.glob("*.*") if (m := pat.match(p.stem)))
    if name in PICK:
        found = [f for f in found if f[0] == PICK[name]]
    return found[-1][1]


def cut(path: Path, grow: int = 2):
    img = Image.open(path).convert("RGB")
    mask, bg = P.knight_mask_all(img, grow=grow, enclosed=45, largest=True)
    return img, mask, bg


def figure(img: Image.Image, mask: Image.Image):
    """Boot centre, baseline and collar row of a standing figure, in raw pixels."""
    px, mp = img.load(), mask.load()
    x0, y0, x1, y1 = mask.getbbox()
    brown = []
    for y in range(y0 + int((y1 - y0) * 0.55), y1):
        for x in range(x0, x1):
            if mp[x, y]:
                r, g, b = px[x, y]
                if (
                    90 <= r <= 190
                    and 45 <= g <= 125
                    and 10 <= b <= 85
                    and r > g + 25
                    and g > b + 12
                ):
                    brown.append((x, y))
    if not brown:
        return None
    base = max(y for _, y in brown)
    foot = [(x, y) for x, y in brown if y > base - (y1 - y0) * 0.10]
    cx = sum(x for x, _ in foot) / len(foot)
    rows = {}
    for y in range(y0, y1):
        n = 0
        for x in range(x0, x1):
            if mp[x, y]:
                r, g, b = px[x, y]
                if b > 110 and b > r + 60 and b > g + 25:
                    n += 1
        if n:
            rows[y] = n
    collar = next((y for y in sorted(rows) if rows[y] >= 6), None)
    return {"cx": cx, "base": base, "collar": collar, "bbox": (x0, y0, x1, y1), "boots": len(foot)}


def head_top(mask: Image.Image, cx: float, half: float):
    """Topmost row of the figure within a band round his centre line, so a raised sword to one
    side does not count. Returns None if the band is empty."""
    x0 = max(0, int(cx - half))
    x1 = min(mask.size[0], int(cx + half))
    band = mask.crop((x0, 0, x1, mask.size[1]))
    box = band.getbbox()
    return box[1] if box else None


def to_coarse(img, mask, scale: float, crop):
    """Crop to `crop` (raw px), scale by `scale` cells per raw pixel with box averaging."""
    x0, y0, x1, y1 = crop
    im, mk = img.crop(crop), mask.crop(crop)
    cw, ch = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    rgb = im.resize((cw, ch), Image.BOX)
    cov = mk.resize((cw, ch), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
    out = rgb.convert("RGBA")
    out.putalpha(cov)
    return out


HEAD_BOOTS_ONLY = {
    "carrying",
    "angry",
}  # something above the head (a crate, the raised blade): boots alone


def snap_knight(name: str, scale_ref: dict):
    """Return (coarse RGBA on the grid, anchor info) for one standing knight frame."""
    path = raw_path(name)
    img, mask, _ = cut(path)
    fig = figure(img, mask)
    info = {"name": name, "raw": path.name}
    x0, y0, x1, y1 = mask.getbbox()
    if fig is None or fig["collar"] is None:
        raise SystemExit(f"cannot measure {name}")
    height = fig["base"] - fig["collar"]
    if "k0" not in scale_ref:  # the first call is the reference
        w, h = x1 - x0, y1 - y0
        scale_ref["k0"] = min(P.GRID[0] / w, P.GRID[1] / h)
        scale_ref["H"] = height
        scale_ref["boots"] = fig["boots"]
    # The scale measure is the size of his boots: they look the same in every pose, which the
    # collar line does not (an arm or a tilted head hides it).
    ratio = (fig["boots"] / scale_ref["boots"]) ** 0.5
    k = scale_ref["k0"] / ratio
    half = 120 * ratio
    ht = head_top(mask, fig["cx"], half)
    head = fig["base"] - ht if ht is not None else None
    bare = name in HELM_OFF
    if "head" not in scale_ref and name == "idle":
        scale_ref["head"] = head
    if bare and "bare_head" not in scale_ref:  # the first bare frame sets the bare reference
        scale_ref["bare_head"] = head * k  # in grid cells, at its boots-based scale
    if head and name not in HEAD_BOOTS_ONLY and name != "idle":
        # hold the head-to-baseline height to the reference: helm on to the idle knight, bare
        # to the first bare frame (both are corrected frame by frame, not only by boot size)
        k = scale_ref["bare_head"] / head if bare else scale_ref["k0"] * scale_ref["head"] / head
        info["scaled_by"] = "head"
    else:
        info["scaled_by"] = "boots"
    info.update(
        raw_height=height,
        raw_ratio=round(ratio, 3),
        raw_collar_ratio=round(height / scale_ref["H"], 3),
    )
    # keep room below the baseline for a sword tip that goes under the boots
    crop = (x0, y0, x1, y1)
    coarse = to_coarse(img, mask, k, crop)
    cx_cells = (fig["cx"] - x0) * k
    base_cells = (fig["base"] - y0) * k
    info.update(k=k, cx=cx_cells, base=base_cells, size=coarse.size, head=(fig["base"] - y0) * k)
    return coarse, info


def place_knight(coarse: Image.Image, info: dict) -> Image.Image:
    cw, ch = coarse.size
    cx, base = info["cx"], info["base"]
    left, right = cx, cw - cx
    half = max(P.GRID[0] // 2, int(max(left, right)) + 1)
    W = 2 * half
    below = max(0, int(ch - base + 0.999))
    top = max(P.GRID[1], int(base + 0.999))
    H = top + below
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox = half - round(cx)
    oy = top - round(base)
    canvas.alpha_composite(coarse, (ox, oy)) if ox >= 0 and oy >= 0 else canvas.paste(
        coarse, (ox, oy)
    )
    info["canvas_cells"] = (W, H)
    info["baseline_row"] = top
    return canvas


# ---------------------------------------------------------------- palette


def build_palette(groups: dict) -> Image.Image:
    quota = {"knights": 26, "props": 14, "backdrops": 24}
    colours = []
    for g, items in groups.items():
        pix = [p for im in items for p in P._pixels(im)]
        colours += P._quantise(pix, quota[g])
    flat = [c for rgb in colours for c in rgb]
    flat += flat[-3:] * ((768 - len(flat)) // 3)
    pal = Image.new("P", (1, 1))
    pal.putpalette(flat)
    return pal


# ---------------------------------------------------------------- props


def group_items(mask: Image.Image, expected: int):
    """Connected groups of a prop sheet's cut-out, merged across small gaps, in reading order."""
    small = mask.resize((mask.size[0] // 4, mask.size[1] // 4), Image.BOX).point(
        lambda v: 255 if v > 0 else 0
    )
    grown = small.filter(ImageFilter.MaxFilter(9))
    w, h = grown.size
    gp = grown.load()
    label = [[0] * w for _ in range(h)]
    n = 0
    from collections import deque

    for y in range(h):
        for x in range(w):
            if gp[x, y] and not label[y][x]:
                n += 1
                q = deque([(x, y)])
                label[y][x] = n
                while q:
                    cx, cy = q.popleft()
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and gp[nx, ny] and not label[ny][nx]:
                            label[ny][nx] = n
                            q.append((nx, ny))
    mp = mask.load()
    boxes, area = {}, {}
    for y in range(mask.size[1]):
        for x in range(mask.size[0]):
            if mp[x, y]:
                lab = label[min(y // 4, h - 1)][min(x // 4, w - 1)]
                if lab:
                    b = boxes.get(lab, [x, y, x, y])
                    b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
                    boxes[lab] = b
                    area[lab] = area.get(lab, 0) + 1
    keep = sorted(area, key=lambda lab: -area[lab])[:expected]
    if len(keep) < expected:
        raise SystemExit(f"found {len(keep)} items, expected {expected}")
    items = [(lab, boxes[lab]) for lab in keep]
    mid = sum((b[1] + b[3]) / 2 for _, b in items) / len(items)
    top = sorted([i for i in items if (i[1][1] + i[1][3]) / 2 < mid], key=lambda i: i[1][0])
    bottom = sorted([i for i in items if (i[1][1] + i[1][3]) / 2 >= mid], key=lambda i: i[1][0])
    ordered = top + bottom
    return ordered, label


def cut_props(sheet: str, names: list):
    img = Image.open(raw_path(sheet)).convert("RGB")
    mask, _ = P.knight_mask_all(img)
    ordered, label = group_items(mask, len(names))
    out = {}
    mp = mask.load()
    h4, w4 = len(label), len(label[0])
    for name, (lab, box) in zip(names, ordered, strict=True):
        x0, y0, x1, y1 = box
        crop = img.crop((x0, y0, x1 + 1, y1 + 1))
        m = Image.new("L", crop.size, 0)
        mm = m.load()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if mp[x, y] and label[min(y // 4, h4 - 1)][min(x // 4, w4 - 1)] == lab:
                    mm[x - x0, y - y0] = 255
        out[name] = (crop, m)
    return out


# ---------------------------------------------------------------- build


def clear_patches(im: Image.Image, is_muddy, min_core: int = 3) -> Image.Image:
    """Make broad regions of a muddy colour transparent while thin lines of it (cords) stay.
    A pixel is in the core of a patch when its whole 3x3 round it is muddy."""
    w, h = im.size
    px = im.load()
    m = Image.new("L", (w, h), 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and is_muddy(r, g, b):
                mp[x, y] = 255
    core = m.filter(ImageFilter.MinFilter(3))
    grown = core.filter(ImageFilter.MaxFilter(5))
    out = im.copy()
    op, gp = out.load(), grown.load()
    for y in range(h):
        for x in range(w):
            if gp[x, y] and mp[x, y]:
                op[x, y] = (0, 0, 0, 0)
    return out


def despeckle(im: Image.Image, is_bad) -> Image.Image:
    """Replace flagged pixels with the commonest unflagged colour in the 5x5 round them."""
    px = im.load()
    w, h = im.size
    out = im.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and is_bad(r, g, b):
                votes = {}
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            c = px[nx, ny]
                            if c[3] and not is_bad(*c[:3]):
                                votes[c] = votes.get(c, 0) + 1
                if votes:
                    op[x, y] = max(votes, key=votes.get)
    return out


def scale_up(im, n=CELL):
    return im.resize((im.size[0] * n, im.size[1] * n), Image.NEAREST)


def font(size):
    return ImageFont.load_default(size=size)


def build() -> None:
    FINAL.mkdir(parents=True, exist_ok=True)
    ref = {}
    knights = {}
    for name in ["idle"] + [n for n in PHASE1 + HELM_ON + HELM_OFF if n != "idle"]:
        # the phase 1 raw files are named like the states; idle is the reference and goes first
        coarse, info = snap_knight(name, ref)
        # bare-headed frames stand on the same body scale (collar to baseline), so no change
        knights[name] = (coarse, info)
        print(
            f"  {name}: boots {info['raw_ratio']:.3f} of the reference, "
            f"collar-to-baseline {info['raw_collar_ratio']:.3f}",
            flush=True,
        )
    placed = {n: place_knight(c, i) for n, (c, i) in knights.items()}

    # beds: each drawn at 402 device pixels wide
    beds = {}
    for name in BEDS:
        img, mask, _ = cut(raw_path(name))
        if name in FLIP:
            img, mask = img.transpose(Image.FLIP_LEFT_RIGHT), mask.transpose(Image.FLIP_LEFT_RIGHT)
        box = mask.getbbox()
        beds[name] = to_coarse(img, mask, (402 // CELL) / (box[2] - box[0]), box)
        if name == "bed-asleep":
            beds[name] = despeckle(
                beds[name], lambda r, g, b: g > r + 30 and b > r + 60 and b - g < 70 and g > 120
            )

    # props
    props = {}
    for sheet, names in PROPS.items():
        cutouts = cut_props(sheet, names)
        for group, (axis, target) in PROP_TARGET.items():
            if group[0] not in cutouts:
                continue
            dims = [
                (cutouts[n][0].size[0] if axis == "w" else cutouts[n][0].size[1]) for n in group
            ]
            k = (target // CELL) / max(dims)
            for n in group:
                crop, m = cutouts[n]
                props[n] = to_coarse(crop, m, k, (0, 0, crop.size[0], crop.size[1]))
                if n == "parachute":
                    props[n] = clear_patches(
                        props[n],
                        lambda r, g, b: (
                            max(r, g, b) - min(r, g, b) <= 45 and 85 <= (r + g + b) / 3 <= 165
                        ),
                    )

    # backdrops
    scenes = {}
    for name in BACKDROPS:
        path = RAW / "backdrop-1.png" if name == "smithy" else raw_path(name)
        scenes[name] = P.coarse_backdrop(path)

    pal = build_palette(
        {
            "knights": list(placed.values()) + list(beds.values()),
            "props": list(props.values()),
            "backdrops": list(scenes.values()),
        }
    )
    used = set()
    out = {}
    for name, im in {**placed, **beds, **props}.items():
        q = scale_up(P.apply_palette(im, pal))
        q.save(FINAL / f"{name}.png")
        out[name] = q
        used |= {p[:3] for p in q.getdata() if p[3]}
    for name, im in scenes.items():
        q = scale_up(P.apply_palette(im, pal)).convert("RGB")
        q.save(FINAL / f"{name}.png")
        used |= set(q.getdata())

    # measurements
    rows = []
    for name in PHASE1 + HELM_ON + HELM_OFF:
        i = knights[name][1]
        bl = i["baseline_row"] * CELL
        im = Image.open(FINAL / f"{name}.png").convert("RGBA")
        cx = im.size[0] // 2
        band = im.getchannel("A").crop((cx - 54, 0, cx + 54, im.size[1])).getbbox()
        head_h = bl - band[1]
        rows.append(
            {
                "frame": name,
                "raw": i["raw"],
                "scaled_by": i["scaled_by"],
                "raw_boot_scale_to_reference": i["raw_ratio"],
                "head_to_baseline_px": head_h,
                "overall_height_px": round(i["head"] * CELL),
                "canvas_px": [i["canvas_cells"][0] * CELL, i["canvas_cells"][1] * CELL],
                "baseline_row_px": i["baseline_row"] * CELL,
            }
        )
    (FINAL / "measurements.json").write_text(json.dumps(rows, indent=1))
    print(f"palette: {len(used)} colours used (limit {MAX_COLOURS})")
    sheets()


def sheets() -> None:
    names_k = PHASE1 + HELM_ON + HELM_OFF
    z = 2
    f = font(22)
    rows = json.loads((FINAL / "measurements.json").read_text())
    ref = rows[0]
    head_ref = ref["head_to_baseline_px"]
    imgs = {n: Image.open(FINAL / f"{n}.png").convert("RGBA") for n in names_k}
    # lay out in rows
    maxw, gap = 2900, 14
    layout, row, w = [], [], gap
    for n in names_k:
        cw = imgs[n].size[0] * z + gap
        if w + cw > maxw and row:
            layout.append(row)
            row, w = [], gap
        row.append(n)
        w += cw
    layout.append(row)
    above = max(
        i.size[1] - rows[names_k.index(n)]["baseline_row_px"] for n in names_k for i in [imgs[n]]
    )
    top = max(rows[names_k.index(n)]["baseline_row_px"] for n in names_k)
    row_h = (top + above) * z + 40
    sheet = Image.new("RGB", (maxw, row_h * len(layout)), (34, 36, 42))
    d = ImageDraw.Draw(sheet)
    for r, row in enumerate(layout):
        x, y0 = gap, r * row_h
        by = y0 + 34 + top * z
        for n in row:
            im = imgs[n]
            bl = rows[names_k.index(n)]["baseline_row_px"]
            cell = Image.new("RGBA", (im.size[0] * z, im.size[1] * z), (58, 60, 68, 255))
            cell.alpha_composite(im.resize((im.size[0] * z, im.size[1] * z), Image.NEAREST))
            sheet.paste(cell.convert("RGB"), (x, by - bl * z))
            d.text((x, y0 + 6), n, fill=(235, 235, 235), font=f)
            x += im.size[0] * z + gap
        d.line([(0, by), (maxw, by)], fill=(255, 90, 90), width=1)
        d.line([(0, by - head_ref * z), (maxw, by - head_ref * z)], fill=(90, 200, 255), width=1)
    sheet.save(FAL / "final" / ".." / "sheet-knight.png")

    # backdrops
    idle = imgs["idle"]
    cols = 3
    names = BACKDROPS
    rws = (len(names) + cols - 1) // cols
    bs = Image.new("RGB", (cols * (960 + gap) + gap, rws * (600 + 40) + gap), (34, 36, 42))
    d = ImageDraw.Draw(bs)
    for i, n in enumerate(names):
        x, y = gap + (i % cols) * (960 + gap), gap + (i // cols) * 640
        d.text((x, y), n, fill=(235, 235, 235), font=f)
        sc = Image.open(FINAL / f"{n}.png").convert("RGBA")
        sc.alpha_composite(idle, ((960 - idle.size[0]) // 2, 530 - rows[0]["baseline_row_px"]))
        bs.paste(sc.convert("RGB"), (x, y + 32))
    bs.save(FAL / "sheet-backdrops.png")

    # props and beds
    pnames = BEDS + [n for ns in PROPS.values() for n in ns]
    pim = {n: Image.open(FINAL / f"{n}.png").convert("RGBA") for n in pnames}
    ps = Image.new("RGB", (2900, 2600), (34, 36, 42))
    d = ImageDraw.Draw(ps)
    x, y, rowh = gap, gap, 0
    for n in pnames:
        im = pim[n]
        w2, h2 = im.size[0] * z, im.size[1] * z
        if x + w2 + gap > 2900:
            x, y, rowh = gap, y + rowh + gap, 0
        cell = Image.new("RGBA", (w2, h2), (58, 60, 68, 255))
        cell.alpha_composite(im.resize((w2, h2), Image.NEAREST))
        ps.paste(cell.convert("RGB"), (x, y + 26))
        d.text((x, y + 2), n, fill=(235, 235, 235), font=f)
        x += max(w2, 120) + gap
        rowh = max(rowh, h2 + 26)
    ps = ps.crop((0, 0, 2900, y + rowh + gap))
    ps.save(FAL / "sheet-props.png")
    gallery(names_k, BACKDROPS, pnames)
    print("sheets written")


def gallery(knights, backdrops, props) -> None:
    def cards(names):
        return "\n".join(
            f'<figure><img src="fal/final/{n}.png" '
            f"onload=\"this.style.width=this.naturalWidth*2+'px'\">"
            f"<figcaption>{n}</figcaption></figure>"
            for n in names
        )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Knightwatch candidate set (fal)</title>
<style>
body {{ background:#1d1f24; color:#e8e8e8; font:15px/1.4 sans-serif; margin:24px }}
h1,h2 {{ font-weight:600 }}
img {{ image-rendering:pixelated; display:block; background:#3a3c44 }}
.grid {{ display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end }}
figure {{ margin:0 }} figcaption {{ margin-top:4px }}
.sheet {{ max-width:100%; height:auto; background:none }}
</style></head><body>
<h1>Knightwatch candidate set (fal, seedream v5.5 edit)</h1>
<p>Local page. Every asset is shown at 2x. Not part of the project until adopted.</p>
<h2>Contact sheets</h2>
<p>Knights</p><a href="fal/sheet-knight.png"><img class="sheet" src="fal/sheet-knight.png"></a>
<p>Backdrops</p><a href="fal/sheet-backdrops.png">\
<img class="sheet" src="fal/sheet-backdrops.png"></a>
<p>Props and beds</p><a href="fal/sheet-props.png">\
<img class="sheet" src="fal/sheet-props.png"></a>
<p>Scenes composed from the pack and its manifest \
(<a href="fal/pack/manifest.json">manifest.json</a>)</p>
<a href="fal/sheet-scenes.png"><img class="sheet" src="fal/sheet-scenes.png"></a>
<h2>Knight frames</h2><div class="grid">{cards(knights)}</div>
<h2>Backdrops</h2><div class="grid">{cards(backdrops)}</div>
<h2>Beds and props</h2><div class="grid">{cards(props)}</div>
</body></html>"""
    (P.CAND / "gallery.html").write_text(html)


# ---------------------------------------------------------------- the pack

PACK = FAL / "pack"
FLOOR = 530

# Where things go in each scene, in grid coordinates (960 by 600). stand lists x positions for the
# knight, the first being the default; None is worked out from the sprite (see build_pack). pie is
# the bottom centre of the pie's plate, anchors are bottom centres.
SCENE_DATA = {
    "smithy": {"stand": [None, 200, 330], "pie": [275, 345], "anchors": {"anvil": [440, 326]}},
    "battlement": {"stand": [300, 760, 480], "pie": [800, 505], "anchors": {}},
    "camp": {"stand": [515, 860, 110], "pie": [825, 282], "anchors": {"fire": [670, 385]}},
    "house": {
        "stand": [520, 300, 860],
        "pie": [660, 295],
        "anchors": {"fire": [705, 402], "bed": [200, 525], "tv": [875, 482]},
    },
    "yard": {"stand": [None, 760, 150], "pie": [170, 337], "anchors": {"dummy": [583, 436]}},
    "cellar": {"stand": [430, 330, 540], "pie": [205, 373], "anchors": {}},
    "court": {"stand": [330, 500, 150], "pie": [580, 392], "anchors": {"king": [738, 392]}},
}


def build_pack() -> None:
    import shutil

    for sub in ("knight", "backdrops", "props"):
        shutil.rmtree(PACK / sub, ignore_errors=True)
        (PACK / sub).mkdir(parents=True, exist_ok=True)
    rows = {r["frame"]: r for r in json.loads((FINAL / "measurements.json").read_text())}
    man = {
        "version": 1,
        "grid": {"w": 960, "h": 600, "floor": FLOOR},
        "knight": {},
        "backdrops": {},
        "props": {},
    }
    for n, r in rows.items():
        shutil.copy(FINAL / f"{n}.png", PACK / "knight" / f"{n}.png")
        w, h = Image.open(PACK / "knight" / f"{n}.png").size
        man["knight"][n] = {
            "file": f"knight/{n}.png",
            "w": w,
            "h": h,
            "cx": w // 2,
            "base": r["baseline_row_px"],
        }
    for n in BEDS + [x for ns in PROPS.values() for x in ns]:
        shutil.copy(FINAL / f"{n}.png", PACK / "props" / f"{n}.png")
        w, h = Image.open(PACK / "props" / f"{n}.png").size
        man["props"][n] = {"file": f"props/{n}.png", "w": w, "h": h}
    for s, data in SCENE_DATA.items():
        shutil.copy(FINAL / f"{s}.png", PACK / "backdrops" / f"{s}.png")
        d = json.loads(json.dumps(data))
        if d["stand"][0] is None:
            if s == "smithy":  # the hammer head over the anvil's top face
                im = Image.open(PACK / "knight" / "hammer-up.png").convert("RGBA")
                left = im.getchannel("A").getbbox()[0]
                k = man["knight"]["hammer-up"]
                d["stand"][0] = d["anchors"]["anvil"][0] + k["cx"] - (left + 79)
            else:  # yard: the blade tip just short of the dummy's arm
                im = Image.open(PACK / "knight" / "swing-mid.png").convert("RGBA")
                right = im.getchannel("A").getbbox()[2]
                k = man["knight"]["swing-mid"]
                d["stand"][0] = 520 - (right - k["cx"])
        man["backdrops"][s] = {
            "file": f"backdrops/{s}.png",
            "stand": d["stand"],
            "pie": d["pie"],
            "anchors": d["anchors"],
        }
    (PACK / "manifest.json").write_text(json.dumps(man, indent=1))
    print(
        "pack written:",
        len(man["knight"]),
        "knights,",
        len(man["backdrops"]),
        "backdrops,",
        len(man["props"]),
        "props",
    )


def compose(man: dict, scene: str, frame=None, x=None, props=(), pie=True) -> Image.Image:
    """One finished scene from the pack and the manifest alone: the backdrop, the pie, props at the
    scene's anchors, and a knight frame standing on the floor at x (the default stand if none)."""
    b = man["backdrops"][scene]
    out = Image.open(PACK / b["file"]).convert("RGBA")

    def put(rel, w_anchor, bottom_centre):
        im = Image.open(PACK / rel).convert("RGBA")
        out.alpha_composite(im, (bottom_centre[0] - w_anchor, bottom_centre[1] - im.size[1]))

    for name, anchor in props:
        p = man["props"][name]
        put(p["file"], p["w"] // 2, b["anchors"][anchor])
    if pie:
        put(man["props"]["pie"]["file"], man["props"]["pie"]["w"] // 2, b["pie"])
    if frame:
        k = man["knight"][frame]
        xs = b["stand"][0] if x is None else x
        im = Image.open(PACK / k["file"]).convert("RGBA")
        out.alpha_composite(im, (xs - k["cx"], man["grid"]["floor"] - k["base"]))
    return out


SCENE_CELLS = [
    ("battlement", "idle", []),
    ("camp", "idle", [("flame-a", "fire")]),
    ("house", "idle-bare", [("bed-empty", "bed"), ("flame-a", "fire"), ("tv-a", "tv")]),
    ("yard", "swing-mid", []),
    ("cellar", "carrying", []),
    ("smithy", "hammer-up", []),
    ("court", "talking", [("king-closed", "king")]),
    ("house", None, [("bed-asleep", "bed"), ("flame-a", "fire"), ("tv-a", "tv")]),
    ("battlement", "angry", []),
]


def build_scenes() -> None:
    man = json.loads((PACK / "manifest.json").read_text())
    f = font(24)
    cols, gap = 3, 14
    rows_n = (len(SCENE_CELLS) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (960 + gap) + gap, rows_n * (600 + 40) + gap), (34, 36, 42))
    d = ImageDraw.Draw(sheet)
    for i, (scene, frame, props) in enumerate(SCENE_CELLS):
        x, y = gap + (i % cols) * (960 + gap), gap + (i // cols) * 640
        d.text((x, y), f"{scene}  {frame or 'no knight'}", fill=(235, 235, 235), font=f)
        sheet.paste(compose(man, scene, frame, props=props).convert("RGB"), (x, y + 34))
    sheet.save(FAL / "sheet-scenes.png")
    print("wrote", (FAL / "sheet-scenes.png").relative_to(ROOT))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "all":
        build()
        build_pack()
        build_scenes()
    else:
        {"build": build, "sheets": sheets, "pack": build_pack, "scenes": build_scenes}[cmd]()
