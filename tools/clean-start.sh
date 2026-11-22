#!/usr/bin/env bash
# The clean start: a new install from this checkout, started where nothing of this machine's own
# deployment and nothing outside can be reached, checked, then removed.
#
#   tools/clean-start.sh
#
# It copies the files of this checkout that git would commit (tracked, and new ones not ignored,
# so no config.toml, .env or var/) to a scratch folder and follows the README's quick start
# there: config.example.toml and .env.example copied as they are, the folders under var/ made and
# granted to uid 10001 with setfacl, a touched backup log. In .env it fills the two host paths
# (the backup log and a folder for the data disk, both under var/) and the server's address and
# port, 127.0.0.1 and a free one. Nothing else in either file changes, and no variable of the
# caller's environment reaches compose.
#
# compose.yaml is used as it is, with a second file of this run's own laid over it: an image tag,
# a project name and container names of this run (so nothing of a running deployment is named),
# 2 CPUs and 1 GB for each container, and both containers on one Docker network of their own
# with no route out (internal). The collector, which shares the host's network in compose.yaml,
# is moved onto that network. The image is built from the copy, once, for both containers.
#
# A network with no route out publishes no port, so the server's 127.0.0.1 binding is shown in
# the resolved compose file but is not bound; the page is fetched from this machine at the
# server's address on the run's network instead. The host itself keeps an address on that
# network, as with any internal Docker network, so a container could still reach a service this
# machine listens on at every address; nothing in the run asks for one.
#
# Then, within two minutes of the start: `--check-config` in a one-off collector container exits
# 0; both containers' health checks pass; state.json keeps the contract (collector/contract.py);
# the enabled sources are the general ones of config.example.toml and every one of them is read
# (ok: true); wan and dns are read as down (facts.wan.up and facts.dns.up false), because nothing
# outside answers, and wan_down is raised; and the page and data/state.json load from the server.
# It exits 0 when all of that holds and 1 otherwise, with the containers' last log lines.
#
# The containers, the network, the image and the scratch folder are removed when the script ends,
# whatever happens, and the listings that prove it are printed. Files the containers made are
# theirs (uid 10001); a folder of theirs this account cannot empty is emptied by a container of
# the run's image running as that account before the image goes. Nothing runs inside a running
# container (no docker exec) and nothing is installed anywhere. The build's layers stay in
# Docker's build cache, which other builds share.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

# compose reads the caller's environment over .env, and COMPOSE_* could name other files or
# another project: none of it reaches this run.
while IFS= read -r name; do
  case "$name" in KNIGHTWATCHER_* | COMPOSE_*) unset "$name" ;; esac
done < <(compgen -e)

run_id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
PROJECT="kw-clean-start-$run_id"
IMAGE="kw-clean-start:$run_id"
NET="$PROJECT-net"
COLLECTOR="$PROJECT-collector"
SERVER="$PROJECT-server"
LIMIT_S=120
EXPECTED_SOURCES=(host wan dns backup updates ssh)
DOWN_SOURCES=(wan dns)

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-clean-start.XXXXXX")"
copy="$scratch/knightwatcher"
overlay="$scratch/clean-start.yaml"

say() { printf '\n== %s\n' "$*"; }

compose() {
  docker compose --project-directory "$copy" -p "$PROJECT" \
    -f "$copy/compose.yaml" -f "$overlay" "$@"
}

cleanup() {
  local code=$?
  trap - EXIT
  say "removing the containers, the network, the image and the scratch folder"
  if [[ -f "$overlay" ]]; then
    compose down --remove-orphans --timeout 10 >/dev/null 2>&1 || true
  fi
  # one-off containers of the run, whatever made them
  docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" | xargs -r docker rm -f -v >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  if ! rm -rf "$scratch" 2>/dev/null && [[ -d "$copy/var" ]]; then
    # what uid 10001 made in folders of its own: emptied by that account, then removed
    echo "emptying what uid 10001 made under var/, as that account"
    docker run --rm --network none --cpus 1 --memory 256m --cap-drop ALL \
      --security-opt no-new-privileges --user 10001:10001 -v "$copy/var:/var-of-run" \
      --entrypoint find "$IMAGE" /var-of-run -mindepth 1 -delete >/dev/null 2>&1 || true
    rm -rf "$scratch" || true
  fi
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  # every clean start's, this one's and any earlier run's: each listing is empty
  echo "containers (docker ps -a --filter name=kw-clean-start):"
  docker ps -a --filter "name=kw-clean-start" --format '  {{.Names}} {{.Status}}'
  echo "networks (docker network ls --filter name=kw-clean-start):"
  docker network ls --filter "name=kw-clean-start" --format '  {{.Name}}'
  echo "images (docker images kw-clean-start):"
  docker images kw-clean-start --format '  {{.Repository}}:{{.Tag}}'
  echo "scratch folder: $([[ -e "$scratch" ]] && echo "STILL THERE: $scratch" || echo "gone")"
  if [[ ${#live_before[@]} -gt 0 ]]; then
    echo "this machine's own deployment, before and after:"
    for line in "${live_before[@]}"; do
      local name="${line%% *}"
      echo "  before: $line"
      echo "  after:  $name $(docker inspect -f '{{.State.Status}} started {{.State.StartedAt}}' "$name" 2>/dev/null || echo absent)"
    done
  fi
  exit "$code"
}
live_before=()
trap cleanup EXIT

# A running deployment's containers, by the names compose.yaml gives them, to show they are left
# alone. On a machine with none, nothing is shown.
for name in knightwatcher-collector knightwatcher-server; do
  if state="$(docker inspect -f '{{.State.Status}} started {{.State.StartedAt}}' "$name" 2>/dev/null)"; then
    live_before+=("$name $state")
  fi
done

say "1. the checkout copied to $scratch"
mkdir -p "$copy"
git -C "$root" ls-files -z --cached --others --exclude-standard \
  | while IFS= read -r -d '' f; do
    # a tracked file deleted in the working tree is left out, as a commit would leave it
    if [[ -e "$root/$f" || -L "$root/$f" ]]; then printf '%s\0' "$f"; fi
  done \
  | tar -C "$root" --null -T - -cf - | tar -C "$copy" -xf -
changes="$([[ -z "$(git -C "$root" status --porcelain)" ]] || echo ", with the working tree's changes")"
echo "$(find "$copy" -type f | wc -l) files, at $(git -C "$root" rev-parse --short HEAD)$changes"

say "2. the quick start"
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
(
  cd "$copy"
  set -x
  cp config.example.toml config.toml
  cp .env.example .env && chmod 600 .env
  mkdir -p var/out var/server
  setfacl -m u:10001:rwx var var/out var/server
  setfacl -d -m u:10001:rwx,u:"$(id -u)":rwx var var/out var/server
  touch var/backup.log
  mkdir var/data
)
# The host paths, and the server's address and port; each line of .env.example replaced once.
fill() { # name value
  local n
  n="$(grep -c "^$1=" "$copy/.env")"
  [[ "$n" == 1 ]] || { echo ".env.example has $n lines for $1" >&2; exit 1; }
  sed -i "s|^$1=.*|$1=$2|" "$copy/.env"
  echo "$1=$2"
}
fill KNIGHTWATCHER_BACKUP_LOG ./var/backup.log
fill KNIGHTWATCHER_DATA_DISK ./var/data
fill KNIGHTWATCHER_SERVER_ADDRESS 127.0.0.1
fill KNIGHTWATCHER_SERVER_PORT "$port"
cmp -s "$root/config.example.toml" "$copy/config.toml" && echo "config.toml: config.example.toml as it is"
echo ".env against .env.example:"
diff "$root/.env.example" "$copy/.env" | sed 's/^/  /' || true

cat >"$overlay" <<EOF
# The clean start's own layer over compose.yaml: names of this run, a ceiling on each container,
# and one network with no route out for both.
services:
  collector:
    image: $IMAGE
    container_name: $COLLECTOR
    network_mode: !reset null
    cpus: 2
    mem_limit: 1g
  server:
    image: $IMAGE
    container_name: $SERVER
    cpus: 2
    mem_limit: 1g
networks:
  default:
    name: $NET
    internal: true
EOF
echo "the run's layer over compose.yaml:"
sed 's/^/  /' "$overlay"
echo "the server's ports, as compose resolves them:"
compose config --format json | python3 -c '
import json, sys
for p in json.load(sys.stdin)["services"]["server"].get("ports", []):
    print("  %s:%s->%s/%s" % (p.get("host_ip", ""), p["published"], p["target"], p["protocol"]))'

say "3. the image built from the copy, $IMAGE"
compose build --quiet collector
docker image inspect -f '  {{.Id}}' "$IMAGE"

say "4. both containers started on $NET (internal)"
compose up -d --no-build --quiet-pull 2>&1 | sed 's/^/  /'
started="$(date +%s)"
docker network inspect -f '  {{.Name}}: internal {{.Internal}}, {{len .Containers}} containers' "$NET"
server_ip="$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$SERVER")"
for c in "$COLLECTOR" "$SERVER"; do
  docker inspect -f '  {{.Name}}: on {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}(network mode {{.HostConfig.NetworkMode}})' "$c" \
    | sed 's|/||'
done
echo "  ports bound on this machine: $(docker port "$SERVER" | tr '\n' ' ' | sed 's/ $//' | grep . || echo none)"

say "5. --check-config, in a one-off collector container"
set +e
compose run --rm --no-deps collector --check-config 2>&1 | sed 's/^/  /'
check_code="${PIPESTATUS[0]}"
set -e
echo "  exit $check_code"

say "6. the checks, within $LIMIT_S seconds of the start"
set +e
python3 -I - "$copy" "$started" "$LIMIT_S" "$COLLECTOR" "$SERVER" "http://$server_ip:8080" \
  "${EXPECTED_SOURCES[*]}" "${DOWN_SOURCES[*]}" <<'EOF'
import json, subprocess, sys, time, urllib.request

copy, started, limit, collector, server, base, expected, down = sys.argv[1:]
started, limit = int(started), int(limit)
expected, down = set(expected.split()), set(down.split())
sys.path.insert(0, copy)
from collector import contract  # noqa: E402


def health(name):
    out = subprocess.run(["docker", "inspect", "-f", "{{.State.Health.Status}}", name],
                         capture_output=True, text=True)
    return out.stdout.strip() or out.stderr.strip()


def fetch(path):
    try:
        with urllib.request.urlopen(base + path, timeout=5) as resp:
            return resp.status, resp.read()
    except OSError as exc:
        return None, str(exc).encode()


def judge():
    found = {}
    found["collector healthy"] = health(collector) == "healthy", health(collector)
    found["server healthy"] = health(server) == "healthy", health(server)
    try:
        with open(f"{copy}/var/out/state.json", encoding="utf-8") as fh:
            state = json.load(fh)
    except (OSError, ValueError) as exc:
        found["state.json"] = False, str(exc)
        return found, None
    problems = contract.validate(state)
    found["state.json keeps the contract"] = not problems, "; ".join(problems) or "no problems"
    sources = state.get("sources", {})
    found["the enabled sources"] = set(sources) == expected, " ".join(sorted(sources))
    failing = sorted(n for n, s in sources.items() if s.get("ok") is not True)
    found["every source ok"] = not failing, "not ok: " + " ".join(failing) if failing else "all ok"
    facts = state.get("facts", {})
    up = sorted(n for n in down if (facts.get(n) or {}).get("up") is not False)
    found["wan and dns down"] = not up, (
        " ".join(f"{n} {json.dumps(facts.get(n))}" for n in sorted(down)))
    ids = [c.get("id") for c in state.get("conditions", [])]
    found["wan_down raised"] = "wan_down" in ids, " ".join(ids) or "none"
    status, body = fetch("/")
    found["the page loads"] = status == 200 and b"kw-version" in body, f"HTTP {status}"
    status, body = fetch("/data/state.json")
    found["data/state.json loads"] = status == 200 and b'"schema"' in body, f"HTTP {status}"
    return found, state


while True:
    found, state = judge()
    elapsed = int(time.time()) - started
    if all(ok for ok, _ in found.values()) or elapsed >= limit:
        break
    time.sleep(2)

print(f"after {elapsed} s:")
for what, (ok, note) in found.items():
    print(f"  {'pass' if ok else 'FAIL'}  {what}: {note}")
if state:
    print("the sources in state.json:")
    for name, s in sorted(state["sources"].items()):
        print(f"  {name}: ok {str(s['ok']).lower()}{', ' + s['error'] if s.get('error') else ''}")
    print("the conditions:")
    for c in state.get("conditions", []):
        print(f"  {c['id']} ({c['level']}): {c['headline']} | {c['detail']}")
sys.exit(0 if all(ok for ok, _ in found.values()) else 1)
EOF
checks_code=$?
set -e

if [[ "$check_code" != 0 || "$checks_code" != 0 ]]; then
  for c in "$COLLECTOR" "$SERVER"; do
    echo "the last of $c's log:"
    docker logs --tail 20 "$c" 2>&1 | sed 's/^/  /'
  done
  say "the clean start FAILED"
  exit 1
fi
say "the clean start passed"
