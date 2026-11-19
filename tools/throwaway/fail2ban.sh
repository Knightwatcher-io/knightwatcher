#!/usr/bin/env bash
# A throwaway fail2ban, read by the collector's fail2ban provider, then removed.
#
#   tools/throwaway/fail2ban.sh
#
# It starts crazymax/fail2ban (fail2ban publishes no image of its own) on a Docker network of its
# own with nothing published, as the account running the script rather than root, with one jail of
# its own: a filter matching a test line in a log file the script writes to, maxretry 1, and the
# dummy action, so it needs no capability and touches no firewall. fail2ban makes its database in a
# scratch folder, and the collector reads that folder through a read-only mount, from the image the
# collector is built on, as uid 10001 with no network, running the code of this checkout. Each
# reading is one `--once`, with the memory folder kept between them, and the script prints what it
# wrote to state.json. In order:
#
#   1. the database as fail2ban made it (folder 0700, file 0600): the read is refused;
#   2. the read ACL of docs/configuration.md applied, without sudo since the script's account owns
#      the folder: the read passes, with no bans;
#   3. a failure line in the log: fail2ban bans its address, and the read gives one ip_banned event
#      and raises the attack (the jail is a watched one here);
#   4. the address unbanned with fail2ban-client: the read gives no ban, and no new event;
#   5. the database moved aside and fail2ban started again, as after damage: the new file inherits
#      the read grant from the folder's default ACL, and the read passes.
#
# Nothing runs inside a running container (no docker exec) and nothing is installed in one: the
# unban is a second container of the same image running fail2ban-client against the first's
# socket. The containers, the network and the scratch folder are removed when the script ends,
# whatever happens. Every container is capped at 2 CPUs and 1 GB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

FAIL2BAN_IMAGE="crazymax/fail2ban:1.1.1"
PYTHON_IMAGE="python:3.13-slim"
NAME="kw-throwaway-fail2ban"
NET="kw-throwaway-fail2ban-net"
ADDR="192.0.2.10"
CAPS=(--cpus 2 --memory 1g --cap-drop ALL --security-opt no-new-privileges)

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-fail2ban.XXXXXX")"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

data="$scratch/data"
mkdir -p "$data/db" "$data/run" "$data/log" "$data/etc" "$scratch/out" "$scratch/var"
# fail2ban makes its folder 0700 under its umask of 077; this is the same folder made beforehand.
chmod 0700 "$data/db"
: >"$data/log/test.log"
# uid 10001 writes the state file and the memory file here.
setfacl -m u:10001:rwx "$scratch/out" "$scratch/var"

cat >"$data/etc/fail2ban.local" <<'EOF'
[Definition]
logtarget = STDOUT
socket = /data/run/fail2ban.sock
pidfile = /data/run/fail2ban.pid
dbfile = /data/db/fail2ban.sqlite3
dbpurgeage = 1d
allowipv6 = auto
EOF
cat >"$data/etc/kwtest.conf" <<'EOF'
[Definition]
failregex = ^kwtest failure from <HOST>$
datepattern = {NONE}
EOF
cat >"$data/etc/jail.local" <<'EOF'
[DEFAULT]
ignoreself = false

[kwtest]
enabled = true
filter = kwtest
logpath = /data/log/test.log
backend = polling
maxretry = 1
findtime = 600
bantime = 3600
action = dummy[target="/data/run/fail2ban.dummy"]
EOF

cat >"$scratch/config.toml" <<'EOF'
[collector]
output_dir = "/out"
state_dir = "/var/lib/knightwatcher"
timezone = "UTC"

[conditions.attack]
jails = ["kwtest"]

[sources.security]
from = "fail2ban"
database = "/host/fail2ban/fail2ban.sqlite3"
EOF

start_fail2ban() {
  docker run -d --name "$NAME" --network "$NET" "${CAPS[@]}" \
    --user "$(id -u):$(id -g)" -e IPTABLES_MODE=nft \
    -v "$data:/data" \
    -v "$data/etc/fail2ban.local:/etc/fail2ban/fail2ban.local:ro" \
    -v "$data/etc/jail.local:/etc/fail2ban/jail.local:ro" \
    -v "$data/etc/kwtest.conf:/etc/fail2ban/filter.d/kwtest.conf:ro" \
    "$FAIL2BAN_IMAGE" >/dev/null
  for _ in $(seq 60); do
    [[ -S "$data/run/fail2ban.sock" && -f "$data/db/fail2ban.sqlite3" ]] && return 0
    sleep 1
  done
  docker logs "$NAME" | tail -20
  echo "fail2ban did not start" >&2
  return 1
}

# One poll of the collector, as uid 10001, from the image it is built on, with this checkout's
# code; then what it wrote of the security source.
read_once() {
  docker run --rm --network none "${CAPS[@]}" --read-only \
    --user 10001:10001 -w /app -e PYTHONDONTWRITEBYTECODE=1 \
    -v "$root/collector:/app/collector:ro" \
    -v "$scratch/config.toml:/etc/knightwatcher/config.toml:ro" \
    -v "$data/db:/host/fail2ban:ro" \
    -v "$scratch/out:/out" -v "$scratch/var:/var/lib/knightwatcher" \
    "$PYTHON_IMAGE" python -m collector --once \
    --config /etc/knightwatcher/config.toml --admin /etc/knightwatcher/admin.json
  python3 - "$scratch/out/state.json" <<'EOF'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
print("sources.security:", json.dumps(state["sources"]["security"]))
print("facts.security:  ", json.dumps(state["facts"]["security"]))
for c in state["conditions"]:
    print("condition:       ", c["id"], "|", c["headline"], "|", c["detail"])
for e in state["events"]:
    print("event:           ", json.dumps({k: e[k] for k in ("seq", "type", "count", "text", "parts")}))
EOF
}

wait_for_log() {
  for _ in $(seq 60); do
    docker logs "$NAME" 2>&1 | grep -q "$1" && return 0
    sleep 1
  done
  echo "fail2ban never logged: $1" >&2
  return 1
}

docker network create --internal "$NET" >/dev/null
say "fail2ban: $FAIL2BAN_IMAGE, on $NET (internal), nothing published"
start_fail2ban
ls -ld "$data/db"
ls -l "$data/db/fail2ban.sqlite3"

say "1. the database as fail2ban made it, no read grant"
read_once

say "2. the read ACL of docs/configuration.md, applied by the folder's owner"
setfacl -m u:10001:x "$data/db"
setfacl -m u:10001:r "$data/db/fail2ban.sqlite3"
setfacl -d -m u::rwx,g::-,o::-,u:10001:r "$data/db"
getfacl -p "$data/db" "$data/db/fail2ban.sqlite3" | sed "s|$scratch|<scratch>|"
read_once

say "3. a failure from $ADDR in the jail's log"
echo "kwtest failure from $ADDR" >>"$data/log/test.log"
wait_for_log "Ban $ADDR"
docker logs "$NAME" 2>&1 | grep -E "\[kwtest\] (Found|Ban) " | sed 's/^.*fail2ban\./fail2ban./'
read_once

say "4. $ADDR unbanned with fail2ban-client"
docker run --rm --network none "${CAPS[@]}" --user "$(id -u):$(id -g)" \
  -v "$data:/data" --entrypoint fail2ban-client \
  "$FAIL2BAN_IMAGE" -s /data/run/fail2ban.sock set kwtest unbanip "$ADDR"
wait_for_log "Unban $ADDR"
read_once
echo "beside the database after four reads: $(ls -A "$data/db" | tr '\n' ' ')"

say "5. the database moved aside and fail2ban started again, as after damage"
docker rm -f "$NAME" >/dev/null
mv "$data/db/fail2ban.sqlite3" "$data/db/fail2ban.sqlite3.20261119-120000"
rm -f "$data/run/fail2ban.sock"
start_fail2ban
getfacl -p "$data/db/fail2ban.sqlite3" | sed "s|$scratch|<scratch>|"
read_once

say "done; removing the container, the network and $scratch"
