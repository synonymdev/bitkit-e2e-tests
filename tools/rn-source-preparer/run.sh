#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOL="$ROOT/tools/rn-source-preparer"
: "${RN_SOURCE_APPIUM_PORT:?set an unused port for this source preparation}"
: "${RN_SOURCE_WDA_PORT:?set an unused WDA port for this source preparation}"
export APPIUM_HOME="$TOOL/.appium"

if [[ ! -x "$ROOT/node_modules/.bin/appium" ]]; then
  echo "Run npm ci in the companion checkout first." >&2
  exit 1
fi
python3 - "$RN_SOURCE_APPIUM_PORT" "$RN_SOURCE_WDA_PORT" <<'PY'
import socket, sys
ports = [int(value) for value in sys.argv[1:]]
if len(set(ports)) != 2 or any(not 1024 <= port <= 65535 for port in ports):
    raise SystemExit("Appium and WDA need different nonprivileged ports")
for port in ports:
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(f"port {port} is occupied; choose an unused port")
PY

swiftc -O "$TOOL/recognize.swift" -o "$TOOL/recognize"
if [[ ! -d "$APPIUM_HOME/node_modules/appium-xcuitest-driver" ]]; then
  "$ROOT/node_modules/.bin/appium" driver install xcuitest@10.17.0
fi

"$ROOT/node_modules/.bin/appium" --address 127.0.0.1 --port "$RN_SOURCE_APPIUM_PORT" \
  --log "$TOOL/appium.log" >"$TOOL/appium-server.log" 2>&1 &
source_server_pid=$!
cleanup() {
  kill "$source_server_pid" 2>/dev/null || true
  wait "$source_server_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

source_server_ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if ! kill -0 "$source_server_pid" 2>/dev/null; then
    echo "Source Appium server exited; inspect tools/rn-source-preparer/appium-server.log." >&2
    exit 1
  fi
  if curl --silent --fail --max-time 1 "http://127.0.0.1:$RN_SOURCE_APPIUM_PORT/status" >/dev/null; then
    source_server_ready=true
    break
  fi
  sleep 1
done
if [[ "$source_server_ready" != true ]]; then
  echo "Source Appium server did not answer within 30 seconds." >&2
  exit 1
fi
python3 "$TOOL/prepare.py" "$@" \
  --appium "http://127.0.0.1:$RN_SOURCE_APPIUM_PORT" --wda-port "$RN_SOURCE_WDA_PORT"
