#!/usr/bin/env bash
# Build the Bitkit Android dev debug APK from ../bitkit-android and copy into aut/
#
# Inputs/roots:
# - E2E root: this repo (bitkit-e2e-tests)
# - Android root: ../bitkit-android (resolved relative to this script)
#
# Output:
# - Copies dev debug APK -> aut/bitkit_e2e.apk
#
# Requirements:
# - Android SDK/NDK as required by the project, Gradle wrapper
#
# Usage:
#   ./scripts/build-android-apk.sh
#   BACKEND=regtest ./scripts/build-android-apk.sh
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_ROOT="$(cd "$E2E_ROOT/../bitkit-android" && pwd)"

BACKEND="${BACKEND:-local}"
E2E_BACKEND="local"
GRADLE_TASK="assembleDevDebug"
APK_FLAVOR_DIR="dev/debug"

if [[ "$BACKEND" == "regtest" ]]; then
  E2E_BACKEND="network"
elif [[ "$BACKEND" == "local" ]]; then
  E2E_BACKEND="local"
else
  echo "ERROR: Unsupported BACKEND value: $BACKEND" >&2
  exit 1
fi
echo "Building Android APK (BACKEND=$BACKEND, E2E_BACKEND=$E2E_BACKEND)..."

pushd "$ANDROID_ROOT" >/dev/null
E2E=true E2E_BACKEND="$E2E_BACKEND" ./gradlew "$GRADLE_TASK" --no-daemon --stacktrace
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
cp -f "$APK_PATH" "$OUT/bitkit_e2e.apk"
echo "Android APK copied to: $OUT/bitkit_e2e.apk (from $(basename "$APK_PATH"))"
