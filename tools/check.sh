#!/usr/bin/env bash
# The project's checks, defined once: a local run, docs/development.md and the CI workflow
# (.github/workflows/ci.yml) all run them through this script, so they cannot drift apart.
#
#   tools/check.sh                    every check, in order, stopping at the first failure
#   tools/check.sh SUBSET             one subset of them
#   tools/check.sh page --shard=N/M   the page's tests in M parts, part N (node's --test-shard)
#
# The subsets, in the order all runs them:
#
#   page        node --check on every .js under web/js, web/packs and web/admin (run first of all
#               by all, and left out of shards 2 and above, so that a sharded run does it once),
#               then the page's tests, tests/web/
#   python      the collector's and the server's unittest suites
#   lint        ruff check and ruff format --check at ruff RUFF_VERSION: the ruff on the path when
#               it is that version, otherwise uvx ruff@RUFF_VERSION
#   tools-site  the tools' tests and the website's, tests/tools/ and tests/site/*.test.mjs
#   schema      node tools/settings-schema.js --check
#   private     tools/check-private.sh; all runs it only when tools/private-patterns.txt exists,
#               and says so when it does not
#
# all runs node --check, python, lint, the page's tests, tools-site, schema and private. Each step
# prints a line as it starts and one as it ends; the first failure stops the run, with that
# command's exit code. KW_TEST_CONCURRENCY (default 2) is node --test's --test-concurrency. The
# script runs itself within the ceiling of tools/capped.sh. It exits 2 on an argument it does not
# take.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUFF_VERSION="0.17.6"
SUBSETS=(all python lint page tools-site schema private)

usage() {
  cat <<EOF
usage: tools/check.sh [SUBSET] [--shard=N/M]
  SUBSET is one of: ${SUBSETS[*]} (all when left out)
  --shard=N/M runs part N of M of the page's tests, with the page subset alone
EOF
}

subset="" shard=""
for arg in "$@"; do
  case "$arg" in
    -h | --help) usage; exit 0 ;;
    --shard=*) shard="${arg#--shard=}" ;;
    -*) echo "check: unknown option $arg" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "$subset" ]]; then echo "check: one subset at a time" >&2; usage >&2; exit 2; fi
      subset="$arg"
      ;;
  esac
done
subset="${subset:-all}"
known=""
for s in "${SUBSETS[@]}"; do [[ "$s" == "$subset" ]] && known=1; done
if [[ -z "$known" ]]; then
  echo "check: unknown subset $subset" >&2; usage >&2; exit 2
fi
shard_n=1
if [[ -n "$shard" ]]; then
  if [[ "$subset" != page ]]; then
    echo "check: --shard goes with the page subset alone" >&2; exit 2
  fi
  if [[ ! "$shard" =~ ^([1-9][0-9]*)/([1-9][0-9]*)$ ]] || (( BASH_REMATCH[1] > BASH_REMATCH[2] )); then
    echo "check: --shard=$shard is not N/M with 1 <= N <= M" >&2; exit 2
  fi
  shard_n="${BASH_REMATCH[1]}"
fi
concurrency="${KW_TEST_CONCURRENCY:-2}"
if [[ ! "$concurrency" =~ ^[1-9][0-9]*$ ]]; then
  echo "check: KW_TEST_CONCURRENCY=$concurrency is not a positive whole number" >&2; exit 2
fi

# Within the ceiling of tools/capped.sh. capped.sh exports KW_CAPPED only in the scope it makes,
# so KW_CHECK_RUN marks a run it has already wrapped where there is no systemd user session (as
# on a CI runner), and the script does not wrap itself again.
if [[ -z "${KW_CAPPED:-}" && -z "${KW_CHECK_RUN:-}" ]]; then
  export KW_CHECK_RUN=1
  exec "$root/tools/capped.sh" "$root/tools/check.sh" "$@"
fi
cd "$root"

started=$SECONDS steps=0

# step LABEL COMMAND...: runs one command, with a line as it starts and one as it ends, and stops
# the run with the command's exit code when it fails.
step() {
  local label="$1"; shift
  local t=$SECONDS rc=0
  echo "==> $label"
  "$@" || rc=$?
  if (( rc != 0 )); then
    echo "FAIL $label (exit $rc, $((SECONDS - t))s)"
    exit "$rc"
  fi
  echo "ok   $label ($((SECONDS - t))s)"
  steps=$((steps + 1))
}

syntax() {
  local files=() f
  mapfile -d '' files < <(find web/js web/packs web/admin -name '*.js' -print0 | sort -z)
  (( ${#files[@]} > 0 )) || { echo "no .js files found under web/js, web/packs and web/admin"; return 1; }
  for f in "${files[@]}"; do
    node --check "$f" || { echo "node --check failed on $f"; return 1; }
  done
  echo "${#files[@]} files parse"
}

ruff_at_version() {
  if command -v ruff >/dev/null 2>&1 && [[ "$(ruff --version)" == "ruff $RUFF_VERSION" ]]; then
    ruff "$@"
  elif command -v uvx >/dev/null 2>&1; then
    uvx "ruff@$RUFF_VERSION" "$@"
  else
    echo "lint needs ruff $RUFF_VERSION on the path, or uv's uvx to fetch it" >&2
    return 1
  fi
}

private() {
  if [[ "$subset" == all && ! -e tools/private-patterns.txt ]]; then
    echo "skip private: no tools/private-patterns.txt (tools/private-patterns.example.txt says how to make one)"
    return
  fi
  step "tools/check-private.sh" tools/check-private.sh
}

node_test=(node --test "--test-concurrency=$concurrency")

run_syntax() { step "node --check web/js web/packs web/admin" syntax; }
run_python() {
  step "unittest tests/collector" python3 -m unittest discover -s tests/collector -v
  step "unittest tests/server" python3 -m unittest discover -s tests/server -v
}
run_lint() {
  step "ruff $RUFF_VERSION check" ruff_at_version check collector server tests
  step "ruff $RUFF_VERSION format --check" ruff_at_version format --check collector server tests
}
run_page_tests() {
  if [[ -n "$shard" ]]; then
    step "node --test tests/web/ (shard $shard)" "${node_test[@]}" "--test-shard=$shard" tests/web/
  else
    step "node --test tests/web/" "${node_test[@]}" tests/web/
  fi
}
run_tools_site() {
  step "node --test tests/tools/ tests/site/" "${node_test[@]}" tests/tools/ 'tests/site/*.test.mjs'
}
run_schema() { step "settings-schema --check" node tools/settings-schema.js --check; }

case "$subset" in
  all)
    run_syntax
    run_python
    run_lint
    run_page_tests
    run_tools_site
    run_schema
    private
    ;;
  page)
    if (( shard_n == 1 )); then run_syntax; fi
    run_page_tests
    ;;
  python) run_python ;;
  lint) run_lint ;;
  tools-site) run_tools_site ;;
  schema) run_schema ;;
  private) private ;;
esac

echo "check $subset: $steps step(s) passed in $((SECONDS - started))s"
