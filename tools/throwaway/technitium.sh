#!/usr/bin/env bash
# A throwaway Technitium DNS Server, read by the collector's technitium provider, then removed.
#
#   tools/throwaway/technitium.sh [record-folder]
#
# It starts technitium/dns-server on a Docker network of its own with no route out and nothing
# published, with an admin password made for the run and passed by environment alone, and only the
# capability its DNS port needs. Every other container is the image the collector is built on,
# running the code of this checkout read-only: the collector itself, and a helper that speaks to
# Technitium's API and sends DNS queries, so nothing runs inside Technitium's container (no docker
# exec) and nothing is installed anywhere. In order:
#
#   1. through the API, signed in as admin: a user of its own for the collector, in no group but
#      Everyone, with a password made for the run; an API token made by that user; and one domain
#      added to the blocked zones, blocking being on;
#   2. the collector started, reading every 5 seconds: the source ok, no flies on first sight;
#   3. queries for the blocked domain sent to Technitium's DNS: the seconds until the flies come,
#      once the minute they fall in has finished and settled;
#   4. a --probe, and a --probe --record: the token masked in the recording, which is copied to
#      record-folder when one is given, for making fixtures;
#   5. the collector stopped: the token in none of its log, its state file, its memory file or the
#      recording;
#   6. a wrong token: the read is refused and the source paused, and the next poll does not ask
#      again;
#   7. a Technitium 14 (technitium/dns-server:14.3.0) given a token of its own: told plainly,
#      since it reads no Authorization header.
#
# No password or token is printed. The containers, the network and the scratch folder are removed
# when the script ends, whatever happens. Every container is capped at 2 CPUs and 1 GB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
record_to="${1:-}"
[[ -z "$record_to" || "$record_to" = /* ]] || record_to="$PWD/$record_to"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

TECHNITIUM_IMAGE="technitium/dns-server:15.6.2"
TECHNITIUM14_IMAGE="technitium/dns-server:14.3.0"
PYTHON_IMAGE="python:3.13-slim"
NAME="kw-throwaway-technitium"
NAME14="kw-throwaway-technitium14"
RUNNER="kw-throwaway-technitium-collector"
NET="kw-throwaway-technitium-net"
# Not a name under .test: Technitium answers for that domain itself, before its blocked zones, so
# a query there is never counted as blocked.
DOMAIN="ads.example.net"
CAPS=(--cpus 2 --memory 1g --cap-drop ALL --security-opt no-new-privileges)
# Technitium runs as root in its image and needs nothing more than its DNS port.
TECHNITIUM_CAPS=(--cap-add NET_BIND_SERVICE)
TECHNITIUM_ENV=(-e DNS_SERVER_ADMIN_PASSWORD -e DNS_SERVER_ENABLE_BLOCKING=true)

# The passwords, made for this run and passed by environment alone, never on a command line.
gen() { python3 -c 'import secrets; print(secrets.token_urlsafe(24))'; }
DNS_SERVER_ADMIN_PASSWORD="$(gen)"
KW_USER_PASSWORD="$(gen)"
export DNS_SERVER_ADMIN_PASSWORD KW_USER_PASSWORD

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-technitium.XXXXXX")"
cleanup() {
  docker rm -f -v "$RUNNER" "$NAME" "$NAME14" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

mkdir -p "$scratch/tools"
# The helper: Technitium's API and DNS, from a container on the same network. What it prints to
# stdout is the token alone, for the script to keep in a variable; what it says goes to stderr.
cat >"$scratch/tools/helper.py" <<'EOF'
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

BASE = "http://" + sys.argv[1] + ":5380"


def call(path, form=None, token=None):
    """A POST of form to Technitium's API, so that no credential is in a URL. A session's token
    goes in the header and in the form, which is where version 14 reads it."""
    form = dict(form or {})
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        form["token"] = token
    data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def ok(path, form=None, token=None):
    reply = call(path, form, token)
    if reply.get("status") != "ok":
        sys.exit(f"{path}: {reply.get('status')} {reply.get('errorMessage', '')}")
    return reply


def say(text):
    print(text, file=sys.stderr)


what = sys.argv[2]
if what == "wait":
    for _ in range(120):
        try:
            call("/api/user/session/get")
            sys.exit(0)
        except (OSError, ValueError):
            time.sleep(1)
    sys.exit("Technitium's API never answered")
elif what == "setup":
    admin = ok("/api/user/login",
               {"user": "admin", "pass": os.environ["DNS_SERVER_ADMIN_PASSWORD"], "includeInfo": "true"})
    say(f"signed in as admin: Technitium {admin['info']['version']}")
    session = admin["token"]
    version = admin["info"]["version"]
    user = ok("/api/admin/users/create",
              {"user": "knightwatcher", "pass": os.environ["KW_USER_PASSWORD"],
               "displayName": "Knightwatcher"}, session)["response"]
    details = ok("/api/admin/users/get", {"user": "knightwatcher"}, session)["response"]
    groups = [g.get("name", g) if isinstance(g, dict) else g for g in details.get("memberOfGroups", [])]
    say(f"user {user['username']} made, in the groups {groups} beside Everyone, which the API leaves out")
    if not version.startswith("14."):
        ok("/api/blocked/add", {"domain": sys.argv[3]}, session)
        settings = ok("/api/settings/get", None, session)["response"]
        say(f"{sys.argv[3]} added to the blocked zones; enableBlocking {settings['enableBlocking']}, "
            f"blockingType {settings['blockingType']}")
    ok("/api/user/logout", None, session)
    made = ok("/api/user/createToken",
              {"user": "knightwatcher", "pass": os.environ["KW_USER_PASSWORD"], "tokenName": "knightwatcher"})
    say(f"API token {made['tokenName']!r} made by {made['username']}: {len(made['token'])} characters")
    print(made["token"])
elif what == "query":
    from collector.net import dns_query

    codes = [dns_query(sys.argv[1], 53, sys.argv[3], 2.0, query_id=0x100 + i) for i in range(int(sys.argv[4]))]
    print(f"{len(codes)} A queries for {sys.argv[3]} at {time.strftime('%H:%M:%S', time.gmtime())} UTC, "
          f"response codes {codes}")
EOF

# config.toml for one collector: adblock alone, every 5 seconds, a fly for each blocked query.
write_config() { # file url
  cat >"$1" <<EOF
[collector]
output_dir = "/out"
state_dir = "/var/lib/knightwatcher"
timezone = "UTC"
interval_s = 5
http_timeout_s = 3

[sources.adblock]
from = "technitium"
url = "$2"
every_s = 5
fly_every_s = 0
EOF
}

# A folder pair for one collector's state file and memory, writable by uid 10001.
state_dirs() {
  mkdir -p "$1/out" "$1/var" "$1/rec"
  setfacl -m u:10001:rwx "$1/out" "$1/var" "$1/rec"
}

# The collector, from the image it is built on, with this checkout's code, as uid 10001.
# The token goes by environment, as compose passes it, never on a command line.
collector() { # dir [docker run options...] -- [collector arguments...]
  local dir="$1"
  shift
  local opts=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do opts+=("$1"); shift; done
  shift
  docker run --network "$NET" "${CAPS[@]}" --read-only \
    --user 10001:10001 -w /app -e PYTHONDONTWRITEBYTECODE=1 \
    -e KW_TECHNITIUM_TOKEN \
    -v "$root/collector:/app/collector:ro" \
    -v "$dir/config.toml:/etc/knightwatcher/config.toml:ro" \
    -v "$dir/out:/out" -v "$dir/var:/var/lib/knightwatcher" -v "$dir/rec:/rec" \
    "${opts[@]}" "$PYTHON_IMAGE" python -m collector \
    --config /etc/knightwatcher/config.toml --admin /etc/knightwatcher/admin.json "$@"
}

helper() {
  docker run --rm --network "$NET" "${CAPS[@]}" --read-only -w /app \
    -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/app -e DNS_SERVER_ADMIN_PASSWORD -e KW_USER_PASSWORD \
    -v "$root/collector:/app/collector:ro" -v "$scratch/tools:/tools:ro" \
    "$PYTHON_IMAGE" python /tools/helper.py "$@"
}

# What the collector last wrote of the adblock source, and its events.
show_state() { # dir
  python3 - "$1/out/state.json" <<'EOF'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
print("sources.adblock:", json.dumps(state["sources"]["adblock"]))
print("facts.adblock:  ", json.dumps(state["facts"]["adblock"]))
for e in state["events"]:
    print("event:          ", json.dumps({k: e[k] for k in ("seq", "type", "count")}))
EOF
}

# The flies the collector has raised so far.
flies() { # dir
  python3 -c "
import json, sys
st = json.load(open(sys.argv[1]))
print(sum(e['count'] for e in st['events'] if e['type'] == 'ad_blocked'))" "$1/out/state.json"
}

# A probe's output with each list of numbers on one line, as its length and its last values, and
# the list of minutes as its length and the blocked queries of its last five.
compact() {
  python3 -c '
import re, sys
text = sys.stdin.read()
def one(m):
    values = re.findall(r"-?[0-9.]+", m.group(0))
    last = " ".join(values[-3:])
    return f"[{len(values)} numbers, the last three {last}]"
def minutes(m):
    values = re.findall(r"\"blocked\": (-?[0-9]+)", m.group(0))
    last = " ".join(values[-5:])
    return f"\"recent\": [{len(values)} minutes, blocked in the last five {last}],"
text = re.sub(r"\"recent\": \[\n.*?\n \],", minutes, text, flags=re.S)
print(re.sub(r"\[\n(?:\s*-?[0-9.]+,\n)+\s*-?[0-9.]+\n\s*\]", one, text), end="")'
}

# Waits until the collector has written a state file whose adblock entry passes a test.
wait_state() { # dir python-test-of-entry
  for _ in $(seq 60); do
    if [[ -f "$1/out/state.json" ]] && python3 -c "
import json, sys
s = json.load(open(sys.argv[1]))['sources']['adblock']
sys.exit(0 if ($2) else 1)" "$1/out/state.json" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "the collector never wrote: $2" >&2
  [[ -f "$1/out/state.json" ]] && show_state "$1"
  docker logs "$RUNNER" 2>&1 | tail -20
  return 1
}

# Whether the token appears in any file of a folder. The collector keeps its files to its own
# account, so they are read by a container running as that account, the folder mounted read-only,
# the token passed by environment; a file it cannot read fails the check rather than passing it.
as_collector() { # folder command...
  local folder="$1"
  shift
  docker run --rm --network none "${CAPS[@]}" --read-only --user 10001:10001 \
    -e KW_TECHNITIUM_TOKEN -v "$folder:/scan:ro" "$PYTHON_IMAGE" "$@"
}
holds_token() { # what folder
  as_collector "$2" python -c '
import os, sys
token = os.environ["KW_TECHNITIUM_TOKEN"].encode()
files = [os.path.join(d, f) for d, _, names in os.walk("/scan") for f in names]
held = [f for f in files if token in open(f, "rb").read()]
names = ", ".join(sorted(os.path.relpath(f, "/scan") for f in files))
print(f"{sys.argv[1]}: " + ("HOLDS THE TOKEN" if held else "no token") + f" (read {names})")
sys.exit(1 if held else 0)' "$1"
}

start_technitium() { # name image
  docker run -d --name "$1" --network "$NET" "${CAPS[@]}" "${TECHNITIUM_CAPS[@]}" \
    "${TECHNITIUM_ENV[@]}" "$2" >/dev/null
}

docker network create --internal "$NET" >/dev/null
say "Technitium: $TECHNITIUM_IMAGE, on $NET (internal), nothing published"
start_technitium "$NAME" "$TECHNITIUM_IMAGE"
helper "$NAME" wait

say "1. a user, its API token and a blocked domain, through the API"
KW_TECHNITIUM_TOKEN="$(helper "$NAME" setup "$DOMAIN")"
export KW_TECHNITIUM_TOKEN

say "2. the collector started"
run="$scratch/run"
state_dirs "$run"
write_config "$run/config.toml" "http://$NAME:5380"
collector "$run" -d --name "$RUNNER" -- >/dev/null
wait_state "$run" "s['ok']"
show_state "$run"

say "3. queries for $DOMAIN through Technitium's DNS"
helper "$NAME" query "$DOMAIN" 6
sent=$(date +%s)
for _ in $(seq 150); do
  [[ "$(flies "$run")" -ge 6 ]] && break
  sleep 1
done
echo "flies after $(( $(date +%s) - sent )) seconds at $(date -u +%H:%M:%S) UTC: $(flies "$run")"
show_state "$run"
echo "and six more:"
helper "$NAME" query "$DOMAIN" 6
sent=$(date +%s)
for _ in $(seq 150); do
  [[ "$(flies "$run")" -ge 12 ]] && break
  sleep 1
done
echo "flies after $(( $(date +%s) - sent )) seconds at $(date -u +%H:%M:%S) UTC: $(flies "$run")"
show_state "$run"

say "4. a --probe, and a --probe --record"
collector "$run" --rm -- --probe adblock 2>&1 | compact
collector "$run" --rm -- --probe adblock --record /rec 2>&1 | grep -E "^probe|^recorded"
# The recording is the collector's, mode 600, so it is read as the collector's account.
as_collector "$run/rec" python -c '
import glob, json
for path in glob.glob("/scan/*.json"):
    for e in json.load(open(path, encoding="utf-8"))["exchanges"]:
        r = e["request"]
        method, path, auth = r["method"], r["path"], r["headers"].get("Authorization")
        print(f"recorded {method} {path}, Authorization: {auth}")'
if [[ -n "$record_to" ]]; then
  mkdir -p "$record_to"
  (umask 077 && as_collector "$run/rec" sh -c 'cat /scan/*.json' >"$record_to/technitium.json")
  echo "recording copied to $record_to/technitium.json"
fi

say "5. the collector stopped; the token in none of its files"
docker stop -t 10 "$RUNNER" >/dev/null
docker logs "$RUNNER" 2>&1 | tail -2 | sed 's/^/collector: /'
mkdir -p "$scratch/log"
docker logs "$RUNNER" >"$scratch/log/collector.log" 2>&1
setfacl -m u:10001:rx "$scratch/log" && setfacl -m u:10001:r "$scratch/log/collector.log"
docker rm "$RUNNER" >/dev/null
holds_token "the collector's log" "$scratch/log"
holds_token "its state folder" "$run/out"
holds_token "its memory folder" "$run/var"
holds_token "the recording" "$run/rec"

say "6. a wrong token: refused and paused, and not asked again at the next poll"
wrong="$scratch/wrong"
state_dirs "$wrong"
write_config "$wrong/config.toml" "http://$NAME:5380"
(
  KW_TECHNITIUM_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
)

say "7. a Technitium 14 ($TECHNITIUM14_IMAGE), given a token of its own"
start_technitium "$NAME14" "$TECHNITIUM14_IMAGE"
helper "$NAME14" wait
old="$scratch/old"
state_dirs "$old"
write_config "$old/config.toml" "http://$NAME14:5380"
(
  KW_TECHNITIUM_TOKEN="$(helper "$NAME14" setup "$DOMAIN")"
  export KW_TECHNITIUM_TOKEN
  collector "$old" --rm -- --probe adblock || echo "(exit $?)"
)

say "done; removing the containers, the network and the scratch folder"
