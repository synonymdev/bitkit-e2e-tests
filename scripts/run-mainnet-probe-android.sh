#!/usr/bin/env bash
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="${MAINNET_PROBE_CONFIG:-$E2E_ROOT/config/mainnet-probe.android.local.env}"
EXAMPLE_CONFIG="$E2E_ROOT/config/mainnet-probe.android.env.example"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing local probe config: $CONFIG_FILE" >&2
  echo "Create one with:" >&2
  echo "  cp $EXAMPLE_CONFIG $CONFIG_FILE" >&2
  echo "Then fill in PROBE_SEED and, optionally, ANDROID_UDID." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
set +a

export BACKEND="${BACKEND:-mainnet}"
export APP_ID_ANDROID="${APP_ID_ANDROID:-to.bitkit}"
export AUT_FILENAME="${AUT_FILENAME:-bitkit_e2e_mainnet.apk}"
export APPIUM_NEW_COMMAND_TIMEOUT="${APPIUM_NEW_COMMAND_TIMEOUT:-1800}"
export PROBE_AMOUNT_PROFILE="${PROBE_AMOUNT_PROFILE:-full}"
export PROBE_ORDER="${PROBE_ORDER:-desc}"
export PROBE_DELAY_MS="${PROBE_DELAY_MS:-10000}"
export PROBE_RETRIES="${PROBE_RETRIES:-2}"
export PROBE_RETRY_DELAY_MS="${PROBE_RETRY_DELAY_MS:-5000}"
export PROBE_RESET_SCORES="${PROBE_RESET_SCORES:-true}"
export PROBE_FETCH_RETRIES="${PROBE_FETCH_RETRIES:-2}"
export PROBE_READINESS_TIMEOUT_MS="${PROBE_READINESS_TIMEOUT_MS:-300000}"
export PROBE_READINESS_POLL_MS="${PROBE_READINESS_POLL_MS:-5000}"
export PROBE_MIN_GRAPH_CHANNELS="${PROBE_MIN_GRAPH_CHANNELS:-10000}"
export LN_STABILIZE_DELAY_MS="${LN_STABILIZE_DELAY_MS:-45000}"
export PER_TEST_TIMEOUT_MS="${PER_TEST_TIMEOUT_MS:-6600000}"

if [[ -z "${PROBE_SEED:-}" ]]; then
  echo "Missing PROBE_SEED in $CONFIG_FILE" >&2
  exit 1
fi

if [[ -z "${PROBE_TARGETS_JSON:-}" ]]; then
  PROBE_TARGETS_FILE="${PROBE_TARGETS_FILE:-../bitkit-nightly/config/probe-targets.json}"
  if [[ "$PROBE_TARGETS_FILE" != /* ]]; then
    PROBE_TARGETS_FILE="$E2E_ROOT/$PROBE_TARGETS_FILE"
  fi

  if [[ ! -f "$PROBE_TARGETS_FILE" ]]; then
    echo "Missing probe targets file: $PROBE_TARGETS_FILE" >&2
    exit 1
  fi

  export PROBE_TARGETS_JSON="$(jq -c . "$PROBE_TARGETS_FILE")"
fi

cd "$E2E_ROOT"

./ci_run_android.sh \
  --mochaOpts.grep "@probe_mainnet" \
  --mochaOpts.timeout "$PER_TEST_TIMEOUT_MS" \
  "$@"
