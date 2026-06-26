#!/usr/bin/env bash
# Build the Bitkit Android debug APK from ../bitkit-android and copy into aut/
#
# Inputs/roots:
# - E2E root: this repo (bitkit-e2e-tests)
# - Android root: ../bitkit-android (resolved relative to this script)
#
# Output:
# - Copies dev/regtest debug APK -> aut/bitkit_e2e.apk
# - Copies mainnet debug APK -> aut/bitkit_e2e_mainnet.apk
#
# Requirements:
# - Android SDK/NDK as required by the project, Gradle wrapper
#
# Usage:
#   ./scripts/build-android-apk.sh
#   BACKEND=regtest ./scripts/build-android-apk.sh
#   BACKEND=mainnet ./scripts/build-android-apk.sh
#   TREZOR_BRIDGE=true ./scripts/build-android-apk.sh
#   TREZOR_BRIDGE=true TREZOR_BRIDGE_URL=http://127.0.0.1:21325 ./scripts/build-android-apk.sh
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_ROOT="$(cd "$E2E_ROOT/../bitkit-android" && pwd)"

BACKEND="${BACKEND:-local}"
TREZOR_BRIDGE="${TREZOR_BRIDGE:-false}"
TREZOR_BRIDGE_URL="${TREZOR_BRIDGE_URL:-http://10.0.2.2:21325}"
E2E_BACKEND="local"
GRADLE_TASK="assembleDevDebug"
APK_FLAVOR_DIR="dev/debug"
OUT_FILENAME="bitkit_e2e.apk"

if [[ "$BACKEND" == "regtest" ]]; then
  E2E_BACKEND="network"
elif [[ "$BACKEND" == "local" ]]; then
  E2E_BACKEND="local"
elif [[ "$BACKEND" == "mainnet" ]]; then
  E2E_BACKEND="network"
  GRADLE_TASK="assembleMainnetDebug"
  APK_FLAVOR_DIR="mainnet/debug"
  OUT_FILENAME="bitkit_e2e_mainnet.apk"
else
  echo "ERROR: Unsupported BACKEND value: $BACKEND" >&2
  exit 1
fi
echo "Building Android APK (BACKEND=$BACKEND, E2E_BACKEND=$E2E_BACKEND, TREZOR_BRIDGE=$TREZOR_BRIDGE, TREZOR_BRIDGE_URL=$TREZOR_BRIDGE_URL, GRADLE_TASK=$GRADLE_TASK)..."

pushd "$ANDROID_ROOT" >/dev/null
E2E=true \
  E2E_BACKEND="$E2E_BACKEND" \
  TREZOR_BRIDGE="$TREZOR_BRIDGE" \
  TREZOR_BRIDGE_URL="$TREZOR_BRIDGE_URL" \
  ./gradlew "$GRADLE_TASK" --no-daemon --stacktrace
popd >/dev/null

# Find the universal APK
APK_DIR="$ANDROID_ROOT/app/build/outputs/apk/$APK_FLAVOR_DIR"
# shellcheck disable=SC2012
APK_PATH="$(ls -t "$APK_DIR"/bitkit-*-universal.apk 2>/dev/null | head -n 1 || true)"

if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found at: $APK_PATH" >&2
  exit 1
fi

OUT="$E2E_ROOT/aut"
mkdir -p "$OUT"
cp -f "$APK_PATH" "$OUT/$OUT_FILENAME"
echo "Android APK copied to: $OUT/$OUT_FILENAME (from $(basename "$APK_PATH"))"
