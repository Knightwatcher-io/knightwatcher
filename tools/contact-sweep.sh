#!/usr/bin/env bash
# The contact sweep: every weapon the settings offer against the drawn goblin, held to the contact
# standard (docs/tests.md, The contact standard) on Classic, Broad and Slim, in every scene that
# hosts the goblin, at every whole pixel the knight walks over on its patrol, with every combination
# of the pie and the ground devices. Run it after any change to a weapon, the strike, the goblin or a
# scene that hosts it; the page's tests check the same standard at a few dozen spots, this checks all
# of them.
#
#   tools/contact-sweep.sh DIR           the sweep from the medieval world's pack, then the same
#                                        from the code's scenes and goblin, and the two compared
#   QUICK=1 tools/contact-sweep.sh DIR   the sweep from the pack alone
#
# Writes into DIR (made if missing; keep it outside the repository): results-pack.json and
# results-code.json, what was measured; faults.md, every fault; sheet.html and pictures/, a picture
# of the worst moment of each group of faults. Prints a line for each weapon and build and the count
# of faults, and exits 1 when there is any fault, or when the pack's results and the code's differ;
# 2 on a bad argument. About two and a half minutes for the pack's sweep, the crossbow's included,
# and a minute and a half for the code's.
#
# The scripts are in tools/contact-sweep/: lib.js loads the page and lays the weapon and the goblin
# on the grid, measure.js measures one plan, sweep.js runs the sweep in 4 workers, diff.js compares
# two results and report.js writes the faults and the pictures. Every node run goes through
# tools/capped.sh.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
here="$root/tools/contact-sweep"
cap="$root/tools/capped.sh"
if [[ $# -ne 1 || "$1" == -* ]]; then
  echo "usage: tools/contact-sweep.sh DIR (QUICK=1 for the pack's sweep alone)" >&2
  exit 2
fi
out="$1"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

status=0
"$cap" node "$here/sweep.js" --from pack --out "$out/results-pack.json" || status=$?
if [[ -z "${QUICK:-}" ]]; then
  "$cap" node "$here/sweep.js" --from code --weapons great,arming,long,mace,code --out "$out/results-code.json" || status=$?
  "$cap" node "$here/diff.js" "$out/results-pack.json" "$out/results-code.json" || status=1
fi
"$cap" node "$here/report.js" "$out/results-pack.json" "$out" || status=1
if [[ "$status" -ne 0 ]]; then
  echo "contact sweep: FAULTS (see $out/faults.md)"
  exit 1
fi
echo "contact sweep: no faults"
