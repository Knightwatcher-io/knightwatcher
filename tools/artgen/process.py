#!/usr/bin/env python3
"""Local post-processing and contact sheets for the art bake-off. Pillow only. No paid calls.

process.py refs  --src DIR            build the reference sheet from the code-drawn scenes
process.py build --provider fal       cut out, snap to the grid, share one palette, make the sheet
"""

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CAND = ROOT / "art" / "candidates"

STATES = ["idle", "angry", "sweating", "asleep", "walking"]
CELL = 3  # one art pixel is three device pixels
BOX = (240, 300)  # knight box in final pixels
GRID = (BOX[0] // CELL, BOX[1] // CELL)  # 80 x 100 art pixels
SCENE = (960, 600)
SCENE_GRID = (SCENE[0] // CELL, SCENE[1] // CELL)
FLOOR_Y = 530
MAX_COLOURS = 48


# ---------------------------------------------------------------- reference sheet


def cmd_refs(args) -> None:
    src = Path(args.src)
    crops = [
        ("v4-camp.png", (350, 215, 590, 540)),
        ("v4-attack.png", (400, 215, 700, 535)),
        ("g5.png", (480, 245, 660, 535)),
    ]
    bg = (128, 128, 128)
    width = sum(c[1][2] - c[1][0] for c in crops) + 20 * (len(crops) + 1)
    sheet = Image.new("RGB", (width, 360), bg)
    x = 20
    for name, box in crops:
        im = Image.open(src / name).convert("RGB").crop(box)
        sheet.paste(im, (x, 10 + (340 - im.size[1])))
        x += im.size[0] + 20
    out = CAND / "_refs"
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / "code-reference.png")
    print("wrote", (out / "code-reference.png").relative_to(ROOT), sheet.size)
    # a scenery-only style reference (no knight, no text), for models that insist on an input image
    g6 = Image.open(src / "g6.png").convert("RGB")
    left, right = g6.crop((0, 160, 360, 540)), g6.crop((720, 300, 960, 540))
    style = Image.new("RGB", (360 + 240 + 20, 380), (128, 128, 128))
    style.paste(left, (0, 0))
    style.paste(right, (380, 0))
    style.save(out / "smithy-style.png")
    print("wrote", (out / "smithy-style.png").relative_to(ROOT), style.size)


# ---------------------------------------------------------------- cut-out


def background_colour(img: Image.Image):
    w, h = img.size
    px = img.load()
    pts = [px[x, y] for x in range(0, w, max(1, w // 40)) for y in (0, h - 1)]
    pts += [px[x, y] for y in range(0, h, max(1, h // 40)) for x in (0, w - 1)]
    pts.sort(key=lambda c: sum(c))
    return pts[len(pts) // 2]


def dist(a, b) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def knight_mask_all(
    img: Image.Image, tol: int = 110, grow: int = 2, enclosed: int = 70, largest: bool = False
):
    """Like knight_mask but keeps every separate item (a prop sheet), and also clears enclosed
    regions of the background colour, such as the open top of a crate."""
    mask, bg = knight_mask(img, tol, grow, largest=False)
    px, mp = img.load(), mask.load()
    w, h = img.size
    seen = bytearray(w * h)
    for y0 in range(h):
        for x0 in range(w):
            if mp[x0, y0] and not seen[y0 * w + x0] and dist(px[x0, y0], bg) < enclosed:
                pts, q = [], deque([(x0, y0)])
                seen[y0 * w + x0] = 1
                while q:
                    x, y = q.popleft()
                    pts.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if (
                            0 <= nx < w
                            and 0 <= ny < h
                            and mp[nx, ny]
                            and not seen[ny * w + nx]
                            and dist(px[nx, ny], bg) < enclosed
                        ):
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
                if len(pts) > 300:
                    for x, y in pts:
                        mp[x, y] = 0
    if largest:
        mask = largest_component(mask)
    return mask, bg


def knight_mask(img: Image.Image, tol: int = 110, grow: int = 2, largest: bool = True):
    """Flood the flat background from the border, then eat `grow` pixels of blended fringe."""
    w, h = img.size
    px = img.load()
    bg = background_colour(img)
    bgmask = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if bgmask[i] or dist(px[x, y], bg) > tol:
            continue
        bgmask[i] = 1
        if x > 0:
            q.append((x - 1, y))
        if x < w - 1:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y < h - 1:
            q.append((x, y + 1))
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if not bgmask[row + x]:
                mp[x, y] = 255
    # drop specks: keep the largest connected body
    if largest:
        mask = largest_component(mask)
    # eat the fringe
    from PIL import ImageFilter

    for _ in range(grow):
        mask = mask.filter(ImageFilter.MinFilter(3))
    return mask, bg


def largest_component(mask: Image.Image) -> Image.Image:
    w, h = mask.size
    mp = mask.load()
    seen = bytearray(w * h)
    best, best_pts = 0, []
    for y0 in range(h):
        for x0 in range(w):
            if mp[x0, y0] and not seen[y0 * w + x0]:
                pts, q = [], deque([(x0, y0)])
                seen[y0 * w + x0] = 1
                while q:
                    x, y = q.popleft()
                    pts.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] and not seen[ny * w + nx]:
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
                if len(pts) > best:
                    best, best_pts = len(pts), pts
    out = Image.new("L", (w, h), 0)
    op = out.load()
    for x, y in best_pts:
        op[x, y] = 255
    return out


def coarse_knight(path: Path):
    """Return an RGBA image on the art-pixel grid, at most GRID in size, plus its bounding size."""
    img = Image.open(path).convert("RGB")
    # work at a manageable size
    if max(img.size) > 1024:
        img.thumbnail((1024, 1024), Image.LANCZOS)
    mask, _ = knight_mask(img)
    box = mask.getbbox()
    img, mask = img.crop(box), mask.crop(box)
    w, h = img.size
    s = min(GRID[0] / w, GRID[1] / h)
    cw, ch = max(1, round(w * s)), max(1, round(h * s))
    rgb = img.resize((cw, ch), Image.BOX)
    cov = mask.resize((cw, ch), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(cov)
    return rgba


def coarse_backdrop(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    target = SCENE[0] / SCENE[1]
    if w / h > target:  # too wide: trim the sides
        nw = round(h * target)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:  # too tall: trim the top, keep the floor
        nh = round(w / target)
        img = img.crop((0, h - nh, w, h))
    return img.resize(SCENE_GRID, Image.BOX)


# ---------------------------------------------------------------- palette


def _pixels(im: Image.Image) -> list:
    if im.mode == "RGBA":
        a = im.getchannel("A")
        return [
            p[:3]
            for p, al in zip(
                im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata(),
                a.getdata(),
                strict=True,
            )
            if al
        ]
    return list(im.getdata())


def _quantise(pixels: list, colours: int) -> list:
    side = int(len(pixels) ** 0.5) + 1
    mosaic = Image.new("RGB", (side, side), pixels[0])
    mosaic.putdata(pixels)
    q = mosaic.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    flat = q.getpalette()[: 3 * colours]
    return [tuple(flat[i : i + 3]) for i in range(0, len(flat), 3)]


def shared_palette(knights: list, backdrop) -> Image.Image:
    """One palette of at most MAX_COLOURS: most colours for the knights, the rest for the scene,
    so the busy backdrop cannot pull the plume and tabard off their colours."""
    kn = [p for im in knights for p in _pixels(im)]
    n_scene = 0 if backdrop is None else 18
    colours = _quantise(kn, MAX_COLOURS - n_scene)
    if backdrop is not None:
        colours += _quantise(_pixels(backdrop), n_scene)
    flat = [c for rgb in colours for c in rgb]
    flat += flat[-3:] * ((768 - len(flat)) // 3)  # pad with a repeat, never a new colour
    pal = Image.new("P", (1, 1))
    pal.putpalette(flat)
    return pal


def apply_palette(im: Image.Image, pal: Image.Image) -> Image.Image:
    q = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    if im.mode == "RGBA":
        q = q.convert("RGBA")
        q.putalpha(im.getchannel("A"))
    return q


def scale_up(im: Image.Image, n: int = CELL) -> Image.Image:
    return im.resize((im.size[0] * n, im.size[1] * n), Image.NEAREST)


# ---------------------------------------------------------------- build


def pick(provider: str, purpose: str, choice: dict):
    import re

    pat = re.compile(rf"^{re.escape(purpose)}-(\d+)$")
    found = sorted(
        (int(m.group(1)), p)
        for p in (CAND / provider / "raw").glob("*.*")
        if (m := pat.match(p.stem))
    )
    if purpose in choice:
        found = [f for f in found if f[0] == int(choice[purpose])]
    return found[-1][1] if found else None


def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def cmd_build(args) -> None:
    provider = args.provider
    choice = dict(kv.split("=") for kv in (args.pick or []))
    out = CAND / provider
    proc = out / "processed"
    proc.mkdir(parents=True, exist_ok=True)

    knights = {}
    for s in STATES:
        path = pick(provider, s, choice)
        if path:
            knights[s] = coarse_knight(path)
    bpath = pick(provider, "backdrop", choice)
    backdrop = coarse_backdrop(bpath) if bpath else None
    if not knights:
        sys.exit("no knight images found")

    pal = shared_palette(list(knights.values()), backdrop)
    final = {}
    for s, k in knights.items():
        q = scale_up(apply_palette(k, pal))
        canvas = Image.new("RGBA", BOX, (0, 0, 0, 0))
        canvas.alpha_composite(q, (((BOX[0] - q.size[0]) // 2 // CELL) * CELL, BOX[1] - q.size[1]))
        canvas.save(proc / f"knight-{s}.png")
        final[s] = canvas
    scene = None
    if backdrop is not None:
        scene = scale_up(apply_palette(backdrop, pal)).convert("RGB")
        scene.save(proc / "backdrop-smithy.png")

    # palette audit
    used = set()
    for im in list(final.values()) + ([scene.convert("RGBA")] if scene else []):
        for p in im.getdata():
            if p[3]:
                used.add(p[:3])
    print(
        f"{provider}: {len(final)} knights, backdrop={'yes' if scene else 'no'}, "
        f"colours used {len(used)}"
    )
    make_sheet(provider, final, scene)


def make_sheet(provider: str, knights: dict, scene) -> None:
    z = 2
    gap, label_h = 16, 34
    cw, ch = BOX[0] * z, BOX[1] * z
    width = max(len(STATES) * cw + (len(STATES) + 1) * gap, SCENE[0] * z + 2 * gap)
    height = label_h + ch + gap + label_h + (SCENE[1] * z if scene else 0) + gap
    sheet = Image.new("RGB", (width, height), (34, 36, 42))
    d = ImageDraw.Draw(sheet)
    f = font(22)
    x = gap
    for s in STATES:
        if s in knights:
            cell = Image.new("RGBA", (cw, ch), (58, 60, 68, 255))
            cell.alpha_composite(
                scale_up(knights[s], z) if False else knights[s].resize((cw, ch), Image.NEAREST)
            )
            sheet.paste(cell.convert("RGB"), (x, label_h))
        d.text((x, 6), f"{provider}  {s}", fill=(235, 235, 235), font=f)
        x += cw + gap
    y = label_h + ch + gap
    if scene is not None:
        d.text(
            (gap, y + 6),
            f"{provider}  backdrop with idle knight on the floor",
            fill=(235, 235, 235),
            font=f,
        )
        y += label_h
        big = scene.resize((SCENE[0] * z, SCENE[1] * z), Image.NEAREST).convert("RGBA")
        if "idle" in knights:
            k = knights["idle"].resize((cw, ch), Image.NEAREST)
            big.alpha_composite(k, (((SCENE[0] - BOX[0]) // 2) * z, FLOOR_Y * z - ch))
        sheet.paste(big.convert("RGB"), (gap, y))
    path = CAND / provider / "sheet-phase1.png"
    sheet.save(path)
    print("wrote", path.relative_to(ROOT), sheet.size)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("refs")
    r.add_argument("--src", required=True)
    r.set_defaults(fn=cmd_refs)
    b = sub.add_parser("build")
    b.add_argument("--provider", required=True)
    b.add_argument("--pick", nargs="*", help="purpose=attempt, e.g. angry=2")
    b.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
