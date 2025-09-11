#!/usr/bin/env bash
set -euo pipefail

adb logcat -c
LOGDIR="./artifacts"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/logcat.txt"

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
