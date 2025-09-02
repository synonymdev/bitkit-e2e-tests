#!/usr/bin/env bash
set -euo pipefail

adb logcat -c
LOGDIR="./artifacts"
mkdir -p "$LOGDIR"

# start background logcat and remember PID
adb logcat -v threadtime -T 1 -b all > "$LOGDIR/logcat.txt" &
LOGCAT_PID=$!
trap 'kill $LOGCAT_PID 2>/dev/null || true' EXIT

# regtest port
adb reverse tcp:60001 tcp:60001
npm run e2e:android

# stop and flush logcat, then compress
kill $LOGCAT_PID 2>/dev/null || true
wait $LOGCAT_PID 2>/dev/null || true
gzip -f "$LOGDIR/logcat.txt"