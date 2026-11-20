#!/usr/bin/env bash
# A throwaway Pi-hole 6, read by the collector's pihole provider, then removed.
#
#   tools/throwaway/pihole.sh
#
# It starts pihole/pihole on a Docker network of its own with no route out and nothing published,
# with a web password made for the run and passed by environment alone, DHCP and NTP off, and only
# the capabilities its start script cannot do without (no NET_ADMIN). Gravity's two downloads are
# pointed at a documentation address, so they fail at once and Pi-hole starts with no blocklist; the
# one domain it blocks is denied through its API. Every other container is the image the collector
# is built on, running the code of this checkout read-only: the collector itself, and a helper that
# speaks to Pi-hole's API and sends DNS queries, so nothing runs inside Pi-hole's container (no
# docker exec) and nothing is installed anywhere. In order:
#
#   1. the domain denied through the API, and the collector started, reading every 5 seconds;
#   2. queries for the domain sent to Pi-hole's DNS: blocked_today rises and the flies come;
#   3. Pi-hole's list of sessions, twice, some reads apart: one session of the collector's, logged
#      in once and used since;
#   4. the collector stopped, and the sessions listed again: none left; then a --probe, and none
#      left after it either;
#   5. the provider run directly, three reads and a close: one session id throughout, and none
#      left once it is closed;
#   6. a wrong password: the read is refused and the source paused, and the next poll does not
#      ask again;
#   7. https with Pi-hole's own certificate: refused while it is checked, read with
#      verify_tls = false;
#   8. a Pi-hole 5 (pihole/pihole:2024.07.0) and a Pi-hole 6 with no password: each told plainly.
#
# No password or session id is printed. The containers, the network and the scratch folder are
# removed when the script ends, whatever happens. Every container is capped at 2 CPUs and 1 GB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

PIHOLE_IMAGE="pihole/pihole:2026.10.1"
PIHOLE5_IMAGE="pihole/pihole:2024.07.0"
PYTHON_IMAGE="python:3.13-slim"
NAME="kw-throwaway-pihole"
NAME5="kw-throwaway-pihole5"
NAME_OPEN="kw-throwaway-pihole-open"
RUNNER="kw-throwaway-pihole-collector"
NET="kw-throwaway-pihole-net"
DOMAIN="ads.knightwatcher.test"
CAPS=(--cpus 2 --memory 1g --cap-drop ALL --security-opt no-new-privileges)
# What Pi-hole's start script needs: to hand its files to the pihole account, read them back, and
# start FTL as that account with its port capabilities set. FTL itself runs without them.
PIHOLE_CAPS=(--cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETUID
  --cap-add SETGID --cap-add SETFCAP --cap-add NET_BIND_SERVICE)
# Gravity checks it can resolve these before it downloads; here they resolve to an address that
# goes nowhere, so the check passes and the download fails at once.
NOWHERE=(--add-host github.com:192.0.2.1 --add-host raw.githubusercontent.com:192.0.2.1)
PIHOLE_ENV=(-e TZ=UTC -e FTLCONF_dns_listeningMode=ALL -e FTLCONF_ntp_ipv4_active=false
  -e FTLCONF_ntp_ipv6_active=false -e FTLCONF_ntp_sync_active=false)

# The password, made for this run and passed by environment alone, never on a command line.
KNIGHTWATCHER_PIHOLE_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
FTLCONF_webserver_api_password="$KNIGHTWATCHER_PIHOLE_PASSWORD"
WEBPASSWORD="$KNIGHTWATCHER_PIHOLE_PASSWORD"
export KNIGHTWATCHER_PIHOLE_PASSWORD FTLCONF_webserver_api_password WEBPASSWORD

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-pihole.XXXXXX")"
cleanup() {
  docker rm -f "$RUNNER" "$NAME" "$NAME5" "$NAME_OPEN" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

mkdir -p "$scratch/tools"
# The helper: Pi-hole's API and DNS, from a container on the same network.
cat >"$scratch/tools/helper.py" <<'EOF'
import json, os, sys, time, urllib.error, urllib.request

BASE = "http://" + sys.argv[1]
PASSWORD = os.environ.get("KNIGHTWATCHER_PIHOLE_PASSWORD", "")


def call(method, path, body=None, sid=None):
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if sid:
        headers["X-FTL-SID"] = sid
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def login():
    status, body = call("POST", "/api/auth", {"password": PASSWORD})
    assert status == 200, status
    return json.loads(body)["session"]["sid"]


def sessions():
    """The collector's sessions (by its User-Agent), seen from a session of the helper's own."""
    sid = login()
    _, body = call("GET", "/api/auth/sessions", sid=sid)
    call("DELETE", "/api/auth", sid=sid)
    return [s for s in json.loads(body)["sessions"] if s["user_agent"] == "knightwatcher"]


what = sys.argv[2]
if what == "wait":
    for _ in range(120):
        try:
            call("GET", "/api/auth")
            sys.exit(0)
        except OSError:
            time.sleep(1)
    sys.exit("Pi-hole's API never answered")
elif what == "deny":
    sid = login()
    status, body = call("POST", "/api/domains/deny/exact", {"domain": sys.argv[3]}, sid=sid)
    call("DELETE", "/api/auth", sid=sid)
    added = json.loads(body)["processed"]["success"]
    print(f"POST /api/domains/deny/exact: HTTP {status}, added {[d['item'] for d in added]}")
elif what == "query":
    from collector.net import dns_query

    codes = [dns_query(sys.argv[1], 53, sys.argv[3], 2.0, query_id=0x100 + i) for i in range(int(sys.argv[4]))]
    print(f"{len(codes)} A queries for {sys.argv[3]}, response codes {codes}")
elif what == "sessions":
    now = time.time()
    found = sessions()
    print(f"the collector's sessions at Pi-hole: {len(found)}")
    for s in found:
        print(f"  session {s['id']}: logged in {now - s['login_at']:.0f} s ago, last used "
              f"{now - s['last_active']:.0f} s ago, valid {s['valid_until'] - now:.0f} s more")
elif what == "engine":
    import datetime as dt

    from collector import kinds, providers

    spec = providers.get("pihole")
    kind = kinds.kind_class("adblock")()
    settings = {"url": BASE}
    p = providers.make(spec, settings, {"password": PASSWORD}, 5.0, kind.allowed(settings))
    ids = []
    for _ in range(3):
        fill = p.read(dt.datetime.now(dt.UTC))
        ids.append(p._sid)
    print(f"three reads: blocked {fill['blocked']} each time, "
          f"one session id throughout: {len(set(ids)) == 1 and ids[0] is not None}")
    print(f"the collector's sessions while it holds one: {len(sessions())}")
    p.close()
    print(f"after close(): {len(sessions())}")
EOF

# config.toml for one collector: adblock alone, every 5 seconds, a fly for each blocked query.
write_config() { # file url [extra line]
  cat >"$1" <<EOF
[collector]
output_dir = "/out"
state_dir = "/var/lib/knightwatcher"
timezone = "UTC"
interval_s = 5
http_timeout_s = 3

[sources.adblock]
from = "pihole"
url = "$2"
every_s = 5
fly_every_s = 0
${3:-}
EOF
}

# A folder pair for one collector's state file and memory, writable by uid 10001.
state_dirs() {
  mkdir -p "$1/out" "$1/var"
  setfacl -m u:10001:rwx "$1/out" "$1/var"
}

# The collector, from the image it is built on, with this checkout's code, as uid 10001.
# The password goes by environment, as compose passes it, never on a command line.
collector() { # dir [docker run options...] -- [collector arguments...]
  local dir="$1"
  shift
  local opts=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do opts+=("$1"); shift; done
  shift
  docker run --network "$NET" "${CAPS[@]}" --read-only \
    --user 10001:10001 -w /app -e PYTHONDONTWRITEBYTECODE=1 \
    -e KNIGHTWATCHER_PIHOLE_PASSWORD \
    -v "$root/collector:/app/collector:ro" \
    -v "$dir/config.toml:/etc/knightwatcher/config.toml:ro" \
    -v "$dir/out:/out" -v "$dir/var:/var/lib/knightwatcher" \
    "${opts[@]}" "$PYTHON_IMAGE" python -m collector \
    --config /etc/knightwatcher/config.toml --admin /etc/knightwatcher/admin.json "$@"
}

helper() {
  docker run --rm --network "$NET" "${CAPS[@]}" --read-only -w /app \
    -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/app -e KNIGHTWATCHER_PIHOLE_PASSWORD \
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

# A probe's output with each list of numbers on one line, as its length and its last values.
compact() {
  python3 -c '
import re, sys
text = sys.stdin.read()
def one(m):
    values = re.findall(r"-?[0-9.]+", m.group(0))
    last = " ".join(values[-3:])
    return f"[{len(values)} numbers, the last three {last}]"
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

wait_for_log() { # container text
  for _ in $(seq 180); do
    docker logs "$1" 2>&1 | grep -q -F "$2" && return 0
    sleep 1
  done
  docker logs "$1" 2>&1 | tail -20
  echo "$1 never logged: $2" >&2
  return 1
}

start_pihole() { # name image [docker run options...]
  local name="$1" image="$2"
  shift 2
  docker run -d --name "$name" --network "$NET" "${CAPS[@]}" "${PIHOLE_CAPS[@]}" "${NOWHERE[@]}" \
    "${PIHOLE_ENV[@]}" "$@" "$image" >/dev/null
}

docker network create --internal "$NET" >/dev/null
say "Pi-hole: $PIHOLE_IMAGE, on $NET (internal), nothing published"
start_pihole "$NAME" "$PIHOLE_IMAGE" -e FTLCONF_webserver_api_password
# The start script answers on port 80 for a moment before FTL itself is up.
wait_for_log "$NAME" "FTL started"
helper "$NAME" wait
docker logs "$NAME" 2>&1 | grep -E "FTL version|listening on" | sed 's/^.*INFO: //'

say "1. $DOMAIN denied through the API; the collector started"
helper "$NAME" deny "$DOMAIN"
run="$scratch/run"
state_dirs "$run"
write_config "$run/config.toml" "http://$NAME"
collector "$run" -d --name "$RUNNER" -- >/dev/null
wait_state "$run" "s['ok']"
show_state "$run"

say "2. queries for $DOMAIN through Pi-hole's DNS"
helper "$NAME" query "$DOMAIN" 6
for _ in $(seq 30); do
  python3 -c "
import json, sys
st = json.load(open(sys.argv[1]))
sys.exit(0 if st['facts']['adblock'] and st['facts']['adblock']['blocked_today'] >= 6 else 1)" \
    "$run/out/state.json" && break
  sleep 1
done
show_state "$run"

say "3. Pi-hole's sessions, twice, ten seconds of reads apart"
helper "$NAME" sessions
sleep 10
helper "$NAME" sessions

say "4. the collector stopped"
docker stop -t 10 "$RUNNER" >/dev/null
docker logs "$RUNNER" 2>&1 | tail -2 | sed 's/^/collector: /'
if docker logs "$RUNNER" 2>&1 | grep -q -F -f <(printf '%s\n' "$KNIGHTWATCHER_PIHOLE_PASSWORD"); then
  echo "the collector's log holds the password"
else
  echo "the collector's log holds no password"
fi
docker rm "$RUNNER" >/dev/null
helper "$NAME" sessions
echo "a --probe:"
collector "$run" --rm -- --probe adblock 2>&1 | grep -E "^probe|^credentials|blocked_today"
helper "$NAME" sessions

say "5. the provider run directly: three reads, then close()"
helper "$NAME" engine

say "6. a wrong password: refused and paused, and not asked again at the next poll"
wrong="$scratch/wrong"
state_dirs "$wrong"
write_config "$wrong/config.toml" "http://$NAME"
(
  KNIGHTWATCHER_PIHOLE_PASSWORD="not-$KNIGHTWATCHER_PIHOLE_PASSWORD"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
)

say "7. https, with Pi-hole's self-signed certificate"
tls="$scratch/tls"
state_dirs "$tls"
write_config "$tls/config.toml" "https://$NAME"
echo "verify_tls left out (true):"
collector "$tls" --rm -- --probe adblock || echo "(exit $?)"
write_config "$tls/config.toml" "https://$NAME" "verify_tls = false"
echo "verify_tls = false:"
collector "$tls" --rm -- --probe adblock 2>&1 | compact

say "8. a Pi-hole 5 ($PIHOLE5_IMAGE), and a Pi-hole 6 with no password"
start_pihole "$NAME5" "$PIHOLE5_IMAGE" -e WEBPASSWORD
start_pihole "$NAME_OPEN" "$PIHOLE_IMAGE" -e FTLCONF_webserver_api_password=
wait_for_log "$NAME_OPEN" "FTL started"
helper "$NAME_OPEN" wait
wait_for_log "$NAME5" "Pi-hole version is"
other="$scratch/other"
state_dirs "$other"
write_config "$other/config.toml" "http://$NAME5"
echo "Pi-hole 5:"
collector "$other" --rm -- --probe adblock || echo "(exit $?)"
write_config "$other/config.toml" "http://$NAME_OPEN"
echo "Pi-hole 6 with no password, named by its container name:"
collector "$other" --rm -- --probe adblock || echo "(exit $?)"
open_ip="$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$NAME_OPEN")"
write_config "$other/config.toml" "http://$open_ip"
echo "Pi-hole 6 with no password, named by its address:"
collector "$other" --rm -- --probe adblock || echo "(exit $?)"

say "done; removing the containers, the network and the scratch folder"
