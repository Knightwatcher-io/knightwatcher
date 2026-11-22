#!/usr/bin/env bash
# A throwaway Lidarr, read by the collector's lidarr provider, then removed.
#
#   tools/throwaway/lidarr.sh [record-folder]
#
# It starts lscr.io/linuxserver/lidarr (Lidarr publishes no image of its own) on a Docker network
# of its own with no route out and nothing published, its config folder a scratch folder of this
# run. Lidarr makes its API key when it first starts and writes it to config.xml there, where the
# script reads it into a variable; it is never printed. Every other container is the image the
# collector is built on, running the code of this checkout read-only: the collector itself, and a
# helper that waits for Lidarr's API, so nothing runs inside Lidarr's container (no docker exec)
# and nothing is installed anywhere. In order:
#
#   1. the collector started, reading every 5 seconds: the empty history read cleanly, the source
#      ok, no imports;
#   2. a --probe, and a --probe --record: the key masked in the recording, which is copied to
#      record-folder when one is given, for making fixtures;
#   3. the same Lidarr as an entry of [[sources.imports]], under a name, an address and a secret of
#      its own: probed, and read beside [sources.lidarr] as imports:<name>; the same address given
#      to both is refused, since each import would be raised twice;
#   4. the collector stopped: the key in none of its log, its state file, its memory file or the
#      recording;
#   5. a wrong key: the read is refused and the source paused, and the next poll does not ask
#      again.
#
# An album import cannot be made here: Lidarr writes one (event 8, downloadImported) only when a
# download client hands it a finished download of an album its library holds, and the library
# needs MusicBrainz, which this network cannot reach. The album record is proved by the fixture
# alone (tests/collector/fixtures/providers/lidarr/).
#
# The containers, the network and the scratch folder are removed when the script ends, whatever
# happens. Every container is capped at 2 CPUs and 1 GB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
record_to="${1:-}"
[[ -z "$record_to" || "$record_to" = /* ]] || record_to="$PWD/$record_to"

# the run stays within the ceiling of tools/capped.sh
[[ -n "${KW_CAPPED:-}" ]] || exec "$root/tools/capped.sh" "$0" "$@"

LIDARR_IMAGE="lscr.io/linuxserver/lidarr:3.1.6.5079-ls46"
PYTHON_IMAGE="python:3.13-slim"
NAME="kw-throwaway-lidarr"
# A second name for the same container, for the entry of [[sources.imports]].
ALIAS="kw-throwaway-lidarr-two"
RUNNER="kw-throwaway-lidarr-collector"
NET="kw-throwaway-lidarr-net"
CAPS=(--cpus 2 --memory 1g --cap-drop ALL --security-opt no-new-privileges)
# What the image's start scripts need: to hand /config to the account named by PUID and PGID and
# start Lidarr as it. Lidarr itself runs without them.
LIDARR_CAPS=(--cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETUID
  --cap-add SETGID)

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kw-lidarr.XXXXXX")"
cleanup() {
  docker rm -f -v "$RUNNER" "$NAME" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

mkdir -p "$scratch/tools" "$scratch/config"
# The helper: waits until Lidarr's API answers with the key, from a container on the same network.
cat >"$scratch/tools/helper.py" <<'EOF'
import json, os, sys, time, urllib.error, urllib.request

BASE = "http://" + sys.argv[1] + ":8686"
for _ in range(180):
    try:
        req = urllib.request.Request(BASE + "/api/v1/system/status",
                                     headers={"X-Api-Key": os.environ["KW_LIDARR_API_KEY"]})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = json.loads(resp.read())
        print(f"Lidarr {status['version']} answers, its branch {status['branch']}")
        sys.exit(0)
    except (OSError, ValueError):
        time.sleep(1)
sys.exit("Lidarr's API never answered")
EOF

# config.toml for one collector: [sources.lidarr] alone, or with an entry of [[sources.imports]].
write_config() { # file url [entry-url]
  cat >"$1" <<EOF
[collector]
output_dir = "/out"
state_dir = "/var/lib/knightwatcher"
timezone = "UTC"
interval_s = 5
http_timeout_s = 3

[sources.lidarr]
url = "$2"
every_s = 5
EOF
  if [[ -n "${3:-}" ]]; then
    cat >>"$1" <<EOF

[[sources.imports]]
name = "lidarr-two"
from = "lidarr"
url = "$3"
secret = "lidarr_two"
every_s = 5
EOF
  fi
}

# A folder trio for one collector's state file, memory and recordings, writable by uid 10001.
state_dirs() {
  mkdir -p "$1/out" "$1/var" "$1/rec"
  setfacl -m u:10001:rwx "$1/out" "$1/var" "$1/rec"
}

# The collector, from the image it is built on, with this checkout's code, as uid 10001.
# The keys go by environment, as compose passes them, never on a command line.
collector() { # dir [docker run options...] -- [collector arguments...]
  local dir="$1"
  shift
  local opts=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do opts+=("$1"); shift; done
  shift
  docker run --network "$NET" "${CAPS[@]}" --read-only \
    --user 10001:10001 -w /app -e PYTHONDONTWRITEBYTECODE=1 \
    -e KW_LIDARR_API_KEY -e KW_LIDARR_TWO_API_KEY \
    -v "$root/collector:/app/collector:ro" \
    -v "$dir/config.toml:/etc/knightwatcher/config.toml:ro" \
    -v "$dir/out:/out" -v "$dir/var:/var/lib/knightwatcher" -v "$dir/rec:/rec" \
    "${opts[@]}" "$PYTHON_IMAGE" python -m collector \
    --config /etc/knightwatcher/config.toml --admin /etc/knightwatcher/admin.json "$@"
}

helper() {
  docker run --rm --network "$NET" "${CAPS[@]}" --read-only -w /app \
    -e PYTHONDONTWRITEBYTECODE=1 -e KW_LIDARR_API_KEY \
    -v "$scratch/tools:/tools:ro" "$PYTHON_IMAGE" python /tools/helper.py "$@"
}

# What the collector last wrote of its import sources, and its events.
show_state() { # dir
  python3 - "$1/out/state.json" <<'EOF'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
for name, entry in state["sources"].items():
    print(f"sources.{name}:", json.dumps(entry))
events = state["events"]
print("events:", len(events), json.dumps([{k: e[k] for k in ("seq", "type", "text")} for e in events]))
EOF
}

# Waits until the collector has written a state file whose entry for a source passes a test.
wait_state() { # dir source python-test-of-entry
  for _ in $(seq 60); do
    if [[ -f "$1/out/state.json" ]] && python3 -c "
import json, sys
s = json.load(open(sys.argv[1]))['sources'].get(sys.argv[2])
sys.exit(0 if s is not None and ($3) else 1)" "$1/out/state.json" "$2" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "the collector never wrote: $2 $3" >&2
  [[ -f "$1/out/state.json" ]] && show_state "$1"
  docker logs "$RUNNER" 2>&1 | tail -20
  return 1
}

# Whether the key appears in any file of a folder. The collector keeps its files to its own
# account, so they are read by a container running as that account, the folder mounted read-only,
# the key passed by environment; a file it cannot read fails the check rather than passing it.
as_collector() { # folder command...
  local folder="$1"
  shift
  docker run --rm --network none "${CAPS[@]}" --read-only --user 10001:10001 \
    -e KW_LIDARR_API_KEY -v "$folder:/scan:ro" "$PYTHON_IMAGE" "$@"
}
holds_key() { # what folder
  as_collector "$2" python -c '
import os, sys
key = os.environ["KW_LIDARR_API_KEY"].encode()
files = [os.path.join(d, f) for d, _, names in os.walk("/scan") for f in names]
held = [f for f in files if key in open(f, "rb").read()]
names = ", ".join(sorted(os.path.relpath(f, "/scan") for f in files))
print(f"{sys.argv[1]}: " + ("HOLDS THE KEY" if held else "no key") + f" (read {names})")
sys.exit(1 if held else 0)' "$1"
}

docker network create --internal "$NET" >/dev/null
say "Lidarr: $LIDARR_IMAGE, on $NET (internal), nothing published"
docker run -d --name "$NAME" --network "$NET" --network-alias "$ALIAS" "${CAPS[@]}" \
  "${LIDARR_CAPS[@]}" -e PUID="$(id -u)" -e PGID="$(id -g)" -e TZ=Etc/UTC \
  -v "$scratch/config:/config" "$LIDARR_IMAGE" >/dev/null
# The key Lidarr made on its first start, read from the config.xml it wrote. Never printed.
for _ in $(seq 120); do
  KW_LIDARR_API_KEY="$(python3 - "$scratch/config/config.xml" <<'EOF' 2>/dev/null || true
import sys, xml.etree.ElementTree as ET
key = ET.parse(sys.argv[1]).getroot().findtext("ApiKey") or ""
print(key)
EOF
)"
  [[ -n "$KW_LIDARR_API_KEY" ]] && break
  sleep 1
done
[[ -n "$KW_LIDARR_API_KEY" ]] || { echo "Lidarr wrote no API key" >&2; exit 1; }
# The entry of [[sources.imports]] reads the same key under a secret of its own.
KW_LIDARR_TWO_API_KEY="$KW_LIDARR_API_KEY"
export KW_LIDARR_API_KEY KW_LIDARR_TWO_API_KEY
echo "config.xml written; its API key is ${#KW_LIDARR_API_KEY} characters"
helper "$NAME"

say "1. the collector started; the empty history"
run="$scratch/run"
state_dirs "$run"
write_config "$run/config.toml" "http://$NAME:8686"
collector "$run" -d --name "$RUNNER" -- >/dev/null
wait_state "$run" lidarr "s['ok']"
sleep 6
show_state "$run"

say "2. a --probe, and a --probe --record"
collector "$run" --rm -- --probe lidarr
collector "$run" --rm -- --probe lidarr --record /rec 2>&1 | grep -E "^probe|^recorded"
# The recording is the collector's, mode 600, so it is read as the collector's account.
as_collector "$run/rec" python -c '
import glob, json
for path in glob.glob("/scan/*.json"):
    for e in json.load(open(path, encoding="utf-8"))["exchanges"]:
        r = e["request"]
        method, path, key = r["method"], r["path"], r["headers"].get("X-Api-Key")
        print(f"recorded {method} {path}, X-Api-Key: {key}")
        print("reply:", json.dumps(e.get("reply", {}).get("json")))'
if [[ -n "$record_to" ]]; then
  mkdir -p "$record_to"
  (umask 077 && as_collector "$run/rec" sh -c 'cat /scan/*.json' >"$record_to/lidarr.json")
  echo "recording copied to $record_to/lidarr.json"
fi

say "3. the same Lidarr as an entry of [[sources.imports]]"
docker stop -t 10 "$RUNNER" >/dev/null
mkdir -p "$scratch/log"
docker logs "$RUNNER" >"$scratch/log/collector.log" 2>&1
docker rm "$RUNNER" >/dev/null
write_config "$run/config.toml" "http://$NAME:8686" "http://$ALIAS:8686"
collector "$run" --rm -- --check-config
collector "$run" --rm -- --probe imports:lidarr-two
collector "$run" -d --name "$RUNNER" -- >/dev/null
wait_state "$run" imports:lidarr-two "s['ok']"
sleep 6
show_state "$run"
echo "the same address for both:"
same="$scratch/same"
state_dirs "$same"
write_config "$same/config.toml" "http://$NAME:8686" "http://$NAME:8686/"
collector "$same" --rm -- --check-config || echo "(exit $?)"

say "4. the collector stopped; the key in none of its files"
docker stop -t 10 "$RUNNER" >/dev/null
docker logs "$RUNNER" 2>&1 | tail -2 | sed 's/^/collector: /'
docker logs "$RUNNER" >>"$scratch/log/collector.log" 2>&1
setfacl -m u:10001:rx "$scratch/log" && setfacl -m u:10001:r "$scratch/log/collector.log"
docker rm "$RUNNER" >/dev/null
holds_key "the collector's log" "$scratch/log"
holds_key "its state folder" "$run/out"
holds_key "its memory folder" "$run/var"
holds_key "the recording" "$run/rec"

say "5. a wrong key: refused and paused, and not asked again at the next poll"
wrong="$scratch/wrong"
state_dirs "$wrong"
write_config "$wrong/config.toml" "http://$NAME:8686"
(
  KW_LIDARR_API_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
  collector "$wrong" --rm -- --once
  show_state "$wrong"
  collector "$wrong" --rm -- --probe lidarr || echo "(exit $?)"
)

say "done; removing the containers, the network and the scratch folder"
