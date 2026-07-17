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

APP_ID="${APP_ID_ANDROID:-to.bitkit.dev}"
APP_LOGS_DIR="$ARTIFACTS_DIR/app-logs"

adb logcat -c
LOGFILE="$ARTIFACTS_DIR/logcat.txt"

adb logcat -v threadtime -T 1 -b all > "$LOGFILE" &
LOGCAT_PID=$!

clear_app_logs() {
  set +e
  adb shell "run-as $APP_ID sh -c 'rm -rf files/logs && mkdir -p files/logs'"
  local status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    echo "Could not clear app logs for $APP_ID" >&2
  fi
}

collect_app_logs() {
  rm -rf "$APP_LOGS_DIR"
  mkdir -p "$APP_LOGS_DIR"
  set +e
  adb exec-out run-as "$APP_ID" tar -cf - -C "/data/data/$APP_ID/files" logs \
    | tar -xf - -C "$APP_LOGS_DIR" 2>/dev/null
  local status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo "Saved app logs to $APP_LOGS_DIR"
  else
    echo "Could not collect app logs for $APP_ID" >&2
  fi
}

cleanup() {
  kill "$LOGCAT_PID" 2>/dev/null || true
  wait "$LOGCAT_PID" 2>/dev/null || true
  collect_app_logs
}
trap cleanup EXIT INT TERM

clear_app_logs

# local/regtest helper ports
if [[ "${BACKEND:-local}" != "mainnet" ]]; then
  # regtest electrum port
  adb reverse tcp:60001 tcp:60001
  # lnd port
  adb reverse tcp:9735 tcp:9735
  # lnurl server port
  adb reverse tcp:30001 tcp:30001
  # homegate port
  adb reverse tcp:6288 tcp:6288
  # trezor bridge port
  adb reverse tcp:21325 tcp:21325
fi
# show touches 
adb shell settings put system show_touches 1

# Pass everything through to WDIO/Mocha
npm run e2e:android -- "$@"
