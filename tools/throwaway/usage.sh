#!/usr/bin/env bash
# Throwaway Prometheus, Glances and Beszel, read by the collector's usage providers, then removed.
#
#   tools/throwaway/usage.sh [record-folder]
#
# It starts each service from its published image on a Docker network of its own with no route
# out and nothing published, every password made for the run and passed by environment alone.
# Every other container is the image the collector is built on, running the code of this checkout
# read-only: the collector itself, and a helper that speaks to Beszel's API, so nothing runs inside
# a service's container (no docker exec) and nothing is installed anywhere. In order:
#
#   1. node_exporter, scraped every 15 seconds by a Prometheus 3 with no login, a Prometheus 3
#      whose web config asks for basic credentials (a user made for the run, its password's bcrypt
#      hash made on the host by mkpasswd), and a Prometheus 2: the prometheus and prometheus_basic
#      providers read the machine by its instance label, the default `match` parsing in both
#      versions; prometheus_basic with a wrong password, and prometheus with none at all, refused;
#   2. Glances 4.5.9 and Glances 4.0.8 in web server mode, read by the glances provider;
#   3. a Beszel hub, its first user made by its own USER_EMAIL and USER_PASSWORD, and an agent
#      given the hub's key; through the API, as that user, a system for the agent and one that
#      never answers, shared with the user: the beszel provider reads the system that is up and
#      leaves the other out; a wrong password answered 400 and refused, with the pause; a read
#      with no token answered as a guest's, 200 and no systems; a token that is not one, 401;
#   4. one --once run of the collector over all of them: each source ok, a listed machine the
#      reply leaves out named in its error.
#
# record-folder, when given, takes a --record of each provider's read: the credentials and the
# session's id masked, for making fixtures. No password or token is printed. The containers, the
# network and the scratch folder are removed when the script ends, whatever happens. Every
# container is capped at 2 CPUs and 1 GB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
record_to="${1:-}"
[[ -z "$record_to" || "$record_to" = /* ]] || record_to="$PWD/$record_to"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

NODE_IMAGE="prom/node-exporter:v1.8.2"
PROM_IMAGE="prom/prometheus:v3.16.0"
PROM2_IMAGE="prom/prometheus:v2.53.4"
GLANCES_IMAGE="nicolargo/glances:4.5.9"
GLANCES4_IMAGE="nicolargo/glances:4.0.8"
BESZEL_IMAGE="henrygd/beszel:0.21.2"
AGENT_IMAGE="henrygd/beszel-agent:0.21.2"
PYTHON_IMAGE="python:3.13-slim"
P="kw-throwaway-usage"
NET="$P-net"
NAMES=("$P-node" "$P-prom" "$P-prom-auth" "$P-prom2" "$P-glances" "$P-glances4" "$P-beszel" "$P-agent")
CAPS=(--cpus 2 --memory 1g --security-opt no-new-privileges)

# The passwords, made for this run and passed by environment alone, never on a command line.
gen() { python3 -c 'import secrets; print(secrets.token_urlsafe(24))'; }
KW_PROMETHEUS_BASIC_USERNAME="watcher"
KW_PROMETHEUS_BASIC_PASSWORD="$(gen)"
USER_EMAIL="watcher@example.com"
USER_PASSWORD="$(gen)"
KW_BESZEL_USERNAME="$USER_EMAIL"
KW_BESZEL_PASSWORD="$USER_PASSWORD"
export KW_PROMETHEUS_BASIC_USERNAME KW_PROMETHEUS_BASIC_PASSWORD USER_EMAIL USER_PASSWORD
export KW_BESZEL_USERNAME KW_BESZEL_PASSWORD

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-usage.XXXXXX")"
cleanup() {
  docker rm -f -v "${NAMES[@]}" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  # the collector's files are its own account's; a container of that account removes them
  docker run --rm --network none --user 10001:10001 -v "$scratch:/s" "$PYTHON_IMAGE" \
    sh -c 'rm -rf /s/run/out/* /s/run/var/* /s/run/rec/*' >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

mkdir -p "$scratch/prom" "$scratch/tools" "$scratch/run/out" "$scratch/run/var" "$scratch/run/rec"
setfacl -m u:10001:rwx "$scratch/run/out" "$scratch/run/var" "$scratch/run/rec"
cat >"$scratch/prom/prometheus.yml" <<'EOF'
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: node
    static_configs:
      - targets: ["node:9100"]
EOF
{
  echo "basic_auth_users:"
  printf '  %s: %s\n' "$KW_PROMETHEUS_BASIC_USERNAME" \
    "$(printf '%s' "$KW_PROMETHEUS_BASIC_PASSWORD" | mkpasswd -m bcrypt -s)"
} >"$scratch/prom/web.yml"
chmod -R a+rX "$scratch/prom"

# The helper: Beszel's API, from a container on the same network, as the hub's first user.
cat >"$scratch/tools/helper.py" <<'EOF'
import json, os, sys, time, urllib.error, urllib.request

BASE = "http://beszel:8090"
LIST = "/api/collections/systems/records?fields=name,status,info&perPage=500&skipTotal=true"


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def login():
    for _ in range(60):
        try:
            s, r = call("POST", "/api/collections/users/auth-with-password",
                        {"identity": os.environ["USER_EMAIL"], "password": os.environ["USER_PASSWORD"]})
            if s == 200:
                return r["token"], r["record"]["id"]
        except OSError:
            pass
        time.sleep(1)
    sys.exit("the hub never let its first user in")


step = sys.argv[1]
if step == "key":
    token, _ = login()
    print(call("GET", "/api/beszel/getkey", token=token)[1]["key"])
elif step == "systems":
    token, uid = login()
    for name, host in (("nas-01", "agent"), ("unwatched", "nowhere")):
        s, _ = call("POST", "/api/collections/systems/records",
                    {"name": name, "host": host, "port": "45876", "users": [uid]}, token=token)
        print(f"system {name} made: HTTP {s}", file=sys.stderr)
    for _ in range(90):
        items = call("GET", LIST, token=token)[1]["items"]
        if any(i["status"] == "up" for i in items):
            print("the agent's system is up:", sorted((i["name"], i["status"]) for i in items), file=sys.stderr)
            break
        time.sleep(2)
    else:
        sys.exit("the agent's system never came up")
elif step == "guest":
    s, r = call("GET", LIST)
    print(f"no token: HTTP {s}, {len(r['items'])} systems, page {r['page']}", file=sys.stderr)
    s, r = call("GET", LIST, token="not-a-token")
    print(f"a token that is not one: HTTP {s}, {r['message']}", file=sys.stderr)
    s, r = call("POST", "/api/collections/users/auth-with-password",
                {"identity": "nobody@example.com", "password": "not-the-password"})
    print(f"a wrong password: HTTP {s}, {r['message']}", file=sys.stderr)
EOF

helper() {
  docker run --rm --network "$NET" "${CAPS[@]}" --read-only -e PYTHONDONTWRITEBYTECODE=1 \
    -e USER_EMAIL -e USER_PASSWORD -v "$scratch/tools:/tools:ro" "$PYTHON_IMAGE" \
    python /tools/helper.py "$@"
}

cat >"$scratch/run/config.toml" <<'EOF'
[collector]
output_dir = "/out"
state_dir = "/var/lib/knightwatcher"
[[sources.usage]]
name = "prom"
from = "prometheus"
url = "http://prom:9090"
machines = [{ id = "node:9100", name = "Node" }, { id = "192.0.2.99:9100", name = "Typo" }]
[[sources.usage]]
name = "prom-basic"
from = "prometheus_basic"
url = "http://prom-auth:9090"
machines = [{ id = "node:9100", name = "Node 2" }]
[[sources.usage]]
name = "prom-guest"
from = "prometheus"
url = "http://prom-auth:9090"
machines = [{ id = "node:9100", name = "Node 3" }]
[[sources.usage]]
name = "prom2"
from = "prometheus"
url = "http://prom2:9090"
machines = [{ id = "node:9100", name = "Node 4" }]
[[sources.usage]]
name = "glances"
from = "glances"
url = "http://glances:61208"
machines = [{ name = "Glances" }]
[[sources.usage]]
name = "glances4"
from = "glances"
url = "http://glances4:61208"
machines = [{ name = "Glances 4.0" }]
[[sources.usage]]
name = "beszel"
from = "beszel"
url = "http://beszel:8090"
machines = [{ id = "nas-01", name = "NAS" }, { id = "unwatched", name = "Unwatched" }]
EOF

# The collector, from the image it is built on, with this checkout's code, as uid 10001.
collector() {
  docker run --rm --network "$NET" "${CAPS[@]}" --read-only --user 10001:10001 -w /app \
    -e PYTHONDONTWRITEBYTECODE=1 \
    -e KW_PROMETHEUS_BASIC_USERNAME -e KW_PROMETHEUS_BASIC_PASSWORD \
    -e KW_BESZEL_USERNAME -e KW_BESZEL_PASSWORD \
    -v "$root/collector:/app/collector:ro" \
    -v "$scratch/run/config.toml:/etc/knightwatcher/config.toml:ro" \
    -v "$scratch/run/out:/out" -v "$scratch/run/var:/var/lib/knightwatcher" -v "$scratch/run/rec:/rec" \
    "$PYTHON_IMAGE" python -m collector \
    --config /etc/knightwatcher/config.toml --admin /etc/knightwatcher/admin.json "$@"
}
# A probe; its exit code is said rather than ending the script.
probe() { # source [more arguments]
  local code=0
  collector --probe "$@" || code=$?
  echo "(exit $code)"
}

docker network create --internal "$NET" >/dev/null
say "Prometheus: $NODE_IMAGE scraped by $PROM_IMAGE (open and with basic credentials) and $PROM2_IMAGE"
docker run -d --name "$P-node" --network "$NET" --network-alias node "${CAPS[@]}" "$NODE_IMAGE" >/dev/null
for pair in "prom:$PROM_IMAGE" "prom2:$PROM2_IMAGE"; do
  docker run -d --name "$P-${pair%%:*}" --network "$NET" --network-alias "${pair%%:*}" "${CAPS[@]}" \
    -v "$scratch/prom:/cfg:ro" "${pair#*:}" --config.file=/cfg/prometheus.yml >/dev/null
done
docker run -d --name "$P-prom-auth" --network "$NET" --network-alias prom-auth "${CAPS[@]}" \
  -v "$scratch/prom:/cfg:ro" "$PROM_IMAGE" --config.file=/cfg/prometheus.yml \
  --web.config.file=/cfg/web.yml >/dev/null

say "Glances: $GLANCES_IMAGE and $GLANCES4_IMAGE, in web server mode"
docker run -d --name "$P-glances" --network "$NET" --network-alias glances "${CAPS[@]}" \
  -e GLANCES_OPT="-w" "$GLANCES_IMAGE" >/dev/null
docker run -d --name "$P-glances4" --network "$NET" --network-alias glances4 "${CAPS[@]}" \
  -e GLANCES_OPT="-w" "$GLANCES4_IMAGE" >/dev/null

say "Beszel: $BESZEL_IMAGE, its first user by USER_EMAIL and USER_PASSWORD, and $AGENT_IMAGE"
docker run -d --name "$P-beszel" --network "$NET" --network-alias beszel "${CAPS[@]}" \
  -e USER_EMAIL -e USER_PASSWORD "$BESZEL_IMAGE" >/dev/null
KEY="$(helper key)"
export KEY
docker run -d --name "$P-agent" --network "$NET" --network-alias agent "${CAPS[@]}" \
  -e KEY -e LISTEN=45876 "$AGENT_IMAGE" >/dev/null
helper systems
helper guest

say "waiting 45 seconds, for three scrapes and two Glances reads"
sleep 45

for source in prom prom-basic prom-guest prom2 glances glances4 beszel; do
  say "--probe usage:$source"
  if [[ -n "$record_to" ]]; then probe "usage:$source" --record /rec; else probe "usage:$source"; fi
done
say "--probe usage:prom-basic with a wrong password"
KW_PROMETHEUS_BASIC_PASSWORD="$(gen)" probe usage:prom-basic
say "--probe usage:beszel with a wrong password"
KW_BESZEL_PASSWORD="$(gen)" probe usage:beszel

say "--once over every source"
collector --once >/dev/null 2>&1 || true
docker run --rm --network none "${CAPS[@]}" --read-only --user 10001:10001 \
  -v "$scratch/run/out:/out:ro" "$PYTHON_IMAGE" python -c '
import json
state = json.load(open("/out/state.json"))
for name, entry in state["sources"].items():
    print(f"sources.{name}:", json.dumps(entry))
for c in state["conditions"]:
    print("condition:", c["id"], c["headline"], "|", c["detail"])'

if [[ -n "$record_to" ]]; then
  mkdir -p "$record_to"
  docker run --rm --network none --user 10001:10001 -v "$scratch/run/rec:/rec:ro" "$PYTHON_IMAGE" \
    sh -c 'tar -C /rec -cf - .' | tar -C "$record_to" -xf -
  say "recordings copied to $record_to"
fi
