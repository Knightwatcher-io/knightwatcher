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
if git grep -n -I -i -E -f "$patterns" -- . ':!tools/private-patterns.example.txt'; then
  echo "check-private: private detail found in tracked files" >&2
  exit 1
fi
