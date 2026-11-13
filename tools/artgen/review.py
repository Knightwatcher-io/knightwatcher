#!/usr/bin/env python3
"""Montage of raw images for a quick look: review.py OUT.png NAME[:attempt] ..."""

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAND = Path(__file__).resolve().parents[2] / "art" / "candidates" / "fal" / "raw"


def find(name):
    n, _, a = name.partition(":")
    pat = re.compile(rf"^{re.escape(n)}-(\d+)$")
    found = sorted((int(m.group(1)), p) for p in CAND.glob("*.*") if (m := pat.match(p.stem)))
    return [p for k, p in found if not a or k == int(a)][-1]


def main():
    out, names = sys.argv[1], sys.argv[2:]
    cell, cols = 440, 4
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 24)), (70, 70, 76))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.load_default(size=18)
    for i, n in enumerate(names):
        im = Image.open(find(n)).convert("RGB")
        im.thumbnail((cell, cell))
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        sheet.paste(im, (x, y + 24))
        d.text((x + 4, y + 2), n, fill=(255, 255, 255), font=f)
    sheet.save(out)


main()
