#!/usr/bin/env bash
# Runs a command with a ceiling on the CPU and memory it and its children may use, so a run of the
# checks or the screenshots never crowds out the services on the machine it runs on.
#
#   tools/capped.sh node --test --test-concurrency=2 'tests/web/**/*.test.js'
#
# Under a systemd user session the command runs in a transient scope with CPUQuota and MemoryMax;
# elsewhere it runs at a lower priority alone. KW_CPU (default 400%, four cores) and KW_MEM
# (default 4G) change the ceiling. The command always sees KW_CAPPED: the ceiling, such as
# "400%,4G", in a scope this script made, and "nice" where there is no systemd user session and so
# no scope was made. A command already capped (KW_CAPPED set) gets no second scope and is run at
# nice 10 alone, with KW_CAPPED as it was, so the scripts that cap themselves can be called through
# this one and do not wrap themselves again; each nested call lowers the priority by 10 more. The
# command's exit code is this script's.
set -euo pipefail

cpu="${KW_CPU:-400%}" mem="${KW_MEM:-4G}"
if [[ -z "${KW_CAPPED:-}" ]] && command -v systemd-run >/dev/null 2>&1 && systemd-run --user --scope -q true >/dev/null 2>&1; then
  export KW_CAPPED="$cpu,$mem"
  exec systemd-run --user --scope -q -p CPUQuota="$cpu" -p MemoryMax="$mem" -- nice -n 10 "$@"
fi
export KW_CAPPED="${KW_CAPPED:-nice}"
exec nice -n 10 "$@"
