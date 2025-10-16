#!/usr/bin/env bash
set -euo pipefail

# Similar to ci_run_android.sh but for iOS Simulator
# - Captures iOS Simulator logs to artifacts
# - Runs e2e iOS specs via npm run e2e:ios

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

ensure_booted_simulator() {
  local booted_udid
  booted_udid=$(xcrun simctl list devices booted 2>/dev/null | awk -F '[()]' '/Booted/ {print $2; exit}')
  if [[ -n "$booted_udid" ]]; then
    echo "$booted_udid"
    return
  fi

  local fallback_udid
  fallback_udid=$(xcrun simctl list devices available | awk -F '[()]' '/iPhone 17 \(/ {print $2; exit}')
  if [[ -z "$fallback_udid" ]]; then
    echo "No booted iOS simulator and unable to locate fallback device (iPhone 17*)" >&2
    exit 1
  fi

  echo "[ci_run_ios] Booting simulator ${fallback_udid}" >&2
  xcrun simctl boot "${fallback_udid}" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "${fallback_udid}" -b >/dev/null 2>&1 || true

  for _ in {1..30}; do
    booted_udid=$(xcrun simctl list devices booted 2>/dev/null | awk -F '[()]' '/Booted/ {print $2; exit}')
    if [[ -n "$booted_udid" ]]; then
      echo "$booted_udid"
      return
    fi
    sleep 1
  done

  echo "Simulator ${fallback_udid} did not reach Booted state" >&2
  exit 1
}

SIMULATOR_UDID="$(ensure_booted_simulator)"

# iOS Simulator logs
LOGFILE_SYS="$ARTIFACTS_DIR/simulator.log"
: > "$LOGFILE_SYS"

stream_ios_logs() {
  echo "[ci_run_ios] Starting iOS simulator log stream for ${SIMULATOR_UDID}" >&2
  while true; do
    local exit_code
    if xcrun simctl spawn "${SIMULATOR_UDID}" log stream --predicate 'process == "Bitkit"' --style compact --type log >> "$LOGFILE_SYS" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi
    if [[ $exit_code -eq 0 ]]; then
      break
    fi
    echo "[ci_run_ios] log stream exited with status ${exit_code}; retrying in 1s..." >&2
    sleep 1
  done
}

stream_ios_logs &
SIM_LOG_PID=$!

cleanup() {
  if ps -p "$SIM_LOG_PID" >/dev/null 2>&1; then
    kill "$SIM_LOG_PID" 2>/dev/null || true
    wait "$SIM_LOG_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Pass everything through to WDIO/Mocha for iOS
npm run e2e:ios -- "$@"
