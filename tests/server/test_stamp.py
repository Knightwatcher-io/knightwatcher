"""The page's version stamp, server/stamp.py, against tools/deploy.sh.

The image stamps its copy of web/ with server/stamp.py; a page deployed by hand is stamped by
tools/deploy.sh. Both must give the same bytes, so that the version a display shows and the
reload it makes do not depend on how the page reached it.
"""

from __future__ import annotations

import contextlib
import io
import os
import shutil
import subprocess
import tempfile
import unittest

from server import stamp

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _copy_web(base: str) -> str:
    web = os.path.join(base, "web")
    shutil.copytree(os.path.join(ROOT, "web"), web, ignore=shutil.ignore_patterns("data"))
    return web


def _files(folder: str) -> dict[str, bytes]:
    out = {}
    for here, dirs, names in os.walk(folder):
        if os.path.relpath(here, folder) == ".":
            dirs[:] = [d for d in dirs if d != "data"]
        for name in names:
            path = os.path.join(here, name)
            with open(path, "rb") as fh:
                out[os.path.relpath(path, folder)] = fh.read()
    return out


class StampTest(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix="kw-stamp-")
        self.addCleanup(shutil.rmtree, self.base, True)

    @unittest.skipUnless(
        shutil.which("rsync") and shutil.which("bash"), "deploy.sh needs bash and rsync"
    )
    def test_the_stamp_gives_the_bytes_deploy_sh_gives(self):
        web = _copy_web(self.base)
        os.makedirs(os.path.join(web, "data"))
        with open(os.path.join(web, "data", "state.json"), "w") as fh:
            fh.write("{}\n")  # left out of the version by both
        target = os.path.join(self.base, "deployed")
        r = subprocess.run(
            ["bash", os.path.join(ROOT, "tools", "deploy.sh"), target],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        version = stamp.stamp(web)
        self.assertIn(f"deployed {version} to", r.stdout)
        self.assertEqual(_files(web), _files(target))

    def test_the_index_is_stamped_and_version_json_written(self):
        web = _copy_web(self.base)
        version = stamp.stamp(web)
        self.assertRegex(version, r"^[0-9a-f]{12}$")
        with open(os.path.join(web, "index.html"), encoding="utf-8") as fh:
            text = fh.read()
        self.assertIn(f'<meta name="kw-version" content="{version}">', text)
        self.assertIn(f'<script src="js/main.js?v={version}"></script>', text)
        self.assertIn(f'<link rel="stylesheet" href="css/display.css?v={version}">', text)
        self.assertIn(
            '<link rel="icon" href="favicon.ico" sizes="32x32">', text, "icons are not stamped"
        )
        with open(os.path.join(web, "version.json"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), f'{{"version": "{version}"}}\n')

    def test_a_change_to_any_file_changes_the_version_and_data_does_not(self):
        web = _copy_web(self.base)
        before = stamp.version_of(web)
        os.makedirs(os.path.join(web, "data"))
        with open(os.path.join(web, "data", "state.json"), "w") as fh:
            fh.write("{}\n")
        self.assertEqual(stamp.version_of(web), before)
        with open(os.path.join(web, "css", "display.css"), "a") as fh:
            fh.write("\n")
        self.assertNotEqual(stamp.version_of(web), before)

    def test_a_copy_stamped_already_or_without_its_meta_tag_is_refused(self):
        web = _copy_web(self.base)
        stamp.stamp(web)
        with self.assertRaisesRegex(stamp.StampError, "stamped already"):
            stamp.stamp(web)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(stamp.main([web]), 1)
        with self.assertRaisesRegex(stamp.StampError, "no <meta"):
            stamp.stamp_index("<html></html>\n", "0123456789ab")
        with self.assertRaisesRegex(stamp.StampError, "left unstamped"):
            stamp.stamp_index(
                '<meta name="kw-version" content="dev">\n<script src="a.js" src="b.js"></script>\n',
                "0123456789ab",
            )


if __name__ == "__main__":
    unittest.main()
