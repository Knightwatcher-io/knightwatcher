"""Stamps a copy of the page with its version, as tools/deploy.sh stamps a deployed copy.

    python -m server.stamp FOLDER

FOLDER is a copy of web/, never web/ itself: the Dockerfile runs this on the copy it puts in the
image. The version is the one tools/deploy.sh gives the same files: the first 12 hex characters
of a sha256 over the lines `sha256sum` prints for every file (its hash, two spaces, ./ and its
name), in byte order of the names and leaving data/ out. Then, in the copy:

  - version.json is written beside index.html: {"version": "<hash>"};
  - the kw-version meta tag of index.html is set to the version;
  - ?v=<hash> is appended to every local script and stylesheet address in index.html.

The rules are those of tools/deploy.sh, line by line, and tests/server/test_stamp.py checks that
both give the same bytes. docs/display.md describes how the page checks its version.
"""

from __future__ import annotations

import hashlib
import os
import re
import sys

# A local address: relative, or from the root of the site, but not with a scheme or a host
# (//host/...), and not already carrying a query or a fragment. As in tools/deploy.sh.
_LOCAL = r'/?[^/"#?:][^"#?:]*'
_META = re.compile(r'(<meta name="kw-version" content=")dev(")')
_SCRIPT = re.compile(r'(<script[^>]* src=")(' + _LOCAL + r')(")')
_IS_STYLESHEET = re.compile(r'<link[^>]* rel="stylesheet"')
_LINK = re.compile(r'(<link[^>]* href=")(' + _LOCAL + r')(")')
_UNSTAMPED = re.compile(
    r'<script[^>]* src="' + _LOCAL + r'"|<link[^>]* rel="stylesheet"[^>]* href="' + _LOCAL + r'"'
)


class StampError(Exception):
    pass


def version_of(folder: str) -> str:
    """The version tools/deploy.sh computes for a folder of the page's files."""
    names = []
    for here, dirs, files in os.walk(folder):
        rel = os.path.relpath(here, folder)
        if rel == ".":
            # find's -path ./data -prune: the collector's folder is never part of the page
            dirs[:] = [d for d in dirs if d != "data"]
            files = [f for f in files if f != "data"]
        for f in files:
            full = os.path.join(here, f)
            if os.path.islink(full) or not os.path.isfile(full):
                continue  # find's -type f
            name = "./" + os.path.relpath(full, folder).replace(os.sep, "/")
            if "\\" in name or "\n" in name:
                raise StampError(f"{name!r}: sha256sum would escape this name")
            names.append(name)
    lines = []
    for name in sorted(names, key=lambda n: n.encode("utf-8")):
        with open(os.path.join(folder, name[2:]), "rb") as fh:
            lines.append(f"{hashlib.sha256(fh.read()).hexdigest()}  {name}\n")
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()[:12]


def stamp_index(text: str, version: str) -> str:
    """index.html with its version stamped, by tools/deploy.sh's three substitutions, line by
    line as sed applies them."""
    out = []
    for line in text.split("\n"):
        line = _META.sub(lambda m: m.group(1) + version + m.group(2), line, count=1)
        line = _SCRIPT.sub(lambda m: m.group(1) + m.group(2) + "?v=" + version + m.group(3), line)
        if _IS_STYLESHEET.search(line):
            line = _LINK.sub(lambda m: m.group(1) + m.group(2) + "?v=" + version + m.group(3), line)
        out.append(line)
    stamped = "\n".join(out)
    if f'<meta name="kw-version" content="{version}">' not in stamped:
        raise StampError('index.html has no <meta name="kw-version" content="dev"> to stamp')
    left = _UNSTAMPED.search(stamped)
    if left:
        raise StampError(f"a local address was left unstamped: {left.group(0)}")
    return stamped


def stamp(folder: str) -> str:
    """Stamps the copy of the page in folder and returns its version."""
    index = os.path.join(folder, "index.html")
    if not os.path.isfile(index):
        raise StampError(f"{index} not found")
    if os.path.exists(os.path.join(folder, "version.json")):
        raise StampError(f"{folder} is stamped already: it holds version.json")
    version = version_of(folder)
    with open(index, encoding="utf-8", newline="") as fh:
        text = fh.read()
    stamped = stamp_index(text, version)
    with open(index, "w", encoding="utf-8", newline="") as fh:
        fh.write(stamped)
    with open(os.path.join(folder, "version.json"), "w", encoding="utf-8") as fh:
        fh.write(f'{{"version": "{version}"}}\n')
    return version


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("usage: python -m server.stamp FOLDER", file=sys.stderr)
        return 2
    try:
        version = stamp(args[0])
    except (OSError, StampError) as exc:
        print(f"stamp: {exc}", file=sys.stderr)
        return 1
    print(f"stamped {version} in {args[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
