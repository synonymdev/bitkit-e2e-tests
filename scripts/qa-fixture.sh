#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Prepare a Bitkit emulator/simulator wallet for a QA probe. Not CI.

Usage:
  ./scripts/qa-fixture.sh <android|ios> <empty|onchain|spending|pubky|full>

Kinds:
  empty     onboard only — no funds, no profile
  onchain   onboard + savings
  spending  onboard + savings + spending (Blocktank / local transfer)
  pubky     onboard + Paykit UI + profile, no funds, no contacts
  full      onboard + savings + spending + Paykit UI + profile

Examples:
  BACKEND=regtest ./scripts/qa-fixture.sh android full
  BACKEND=regtest ./scripts/qa-fixture.sh ios empty

Optional env:
  QA_FIXTURE_ONCHAIN_SATS     default 200000
  QA_FIXTURE_SPENDING_SATS    default 50000
  QA_FIXTURE_PROFILE_NAME     default QA Wallet
  BACKEND                     local | regtest (must match the AUT)
  SIMULATOR_UDID              iOS only; default is the booted sim (not a physical device)
  SIMULATOR_NAME              iOS only; default iPhone 17, used if none is booted

Writes artifacts/qa-fixture.json and, when a profile is created, artifacts/qa-fixture.pubky.
After this, overlay the PR build — do not uninstall — and start from TotalBalance-primary.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

PLATFORM="$1"
KIND="$2"

case "$PLATFORM" in
  android | ios) ;;
  *)
    echo "Unknown platform '$PLATFORM'. Expected android or ios." >&2
    usage
    exit 1
    ;;
esac

case "$KIND" in
  empty | onchain | spending | pubky | full) ;;
  *)
    echo "Unknown fixture '$KIND'." >&2
    usage
    exit 1
    ;;
esac

if [[ "$PLATFORM" == "ios" && -z "${SIMULATOR_UDID:-}" ]]; then
  SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17}"
  SIMULATOR_UDID="$(
    xcrun simctl list devices booted 2>/dev/null |
      awk -F '[()]' -v name="$SIMULATOR_NAME" '$0 ~ name" \\(" { print $2; exit }'
  )"
  if [[ -z "$SIMULATOR_UDID" ]]; then
    SIMULATOR_UDID="$(
      xcrun simctl list devices booted 2>/dev/null |
        awk -F '[()]' '/Booted/ { print $2; exit }'
    )"
  fi
  if [[ -z "$SIMULATOR_UDID" ]]; then
    echo "No booted iOS simulator. Boot one or set SIMULATOR_UDID. Appium 'auto' can attach to a physical device." >&2
    exit 1
  fi
  export SIMULATOR_NAME
  export SIMULATOR_UDID
  echo "Using iOS simulator ${SIMULATOR_NAME} ${SIMULATOR_UDID}" >&2
fi

npm run "e2e:${PLATFORM}" -- \
  --spec ./test/qa-fixtures/qa-fixture.e2e.ts \
  --mochaOpts.grep "@qa_fixture_${KIND}"
