#!/usr/bin/env bash
set -euo pipefail

ATTEMPT_DIR=""
if [[ -n "${ATTEMPT:-}" && "${ATTEMPT}" != "" ]]; then
  ATTEMPT_DIR="attempt-${ATTEMPT}"
fi

ARTIFACTS_ROOT="./artifacts"
if [[ -n "$ATTEMPT_DIR" ]]; then
  ARTIFACTS_DIR="${ARTIFACTS_ROOT}/${ATTEMPT_DIR}"
else
  ARTIFACTS_DIR="${ARTIFACTS_ROOT}"
fi

mkdir -p "${ARTIFACTS_DIR}"

adb logcat -c
LOGFILE="$ARTIFACTS_DIR/logcat.txt"

adb logcat -v threadtime -T 1 -b all > "$LOGFILE" &
LOGCAT_PID=$!

cleanup() {
  kill "$LOGCAT_PID" 2>/dev/null || true
  wait "$LOGCAT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# regtest port
adb reverse tcp:60001 tcp:60001
# lnd port
adb reverse tcp:9735 tcp:9735

# Pass everything through to WDIO/Mocha
npm run e2e:android -- "$@"
