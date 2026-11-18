#!/usr/bin/env bash
# Fails when a tracked file holds something private to the operator. The patterns are kept in
# tools/private-patterns.txt, one extended regular expression per line, which git ignores.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
patterns="tools/private-patterns.txt"
if [[ ! -s "$patterns" ]]; then
  echo "check-private: $patterns is missing or empty; copy tools/private-patterns.example.txt and fill it in" >&2
  exit 2
fi
# git grep exits 0 on a match and 1 on none; anything else (a pattern it cannot read, say) means
# nothing was checked, which must never pass as clean.
rc=0
git grep -n -I -i -E -f "$patterns" -- . ':!tools/private-patterns.example.txt' || rc=$?
if [[ $rc -eq 0 ]]; then
  echo "check-private: private detail found in tracked files" >&2
  exit 1
elif [[ $rc -ne 1 ]]; then
  echo "check-private: git grep failed (exit $rc), so nothing was checked" >&2
  exit 2
fi
