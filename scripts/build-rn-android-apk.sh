#!/usr/bin/env bash
# Build the legacy Bitkit RN Android APK from ../bitkit and copy into aut/
#
# Inputs/roots:
# - E2E root: this repo (bitkit-e2e-tests)
# - RN root: ../bitkit (resolved relative to this script)
#
# Output:
# - Copies APK -> aut/bitkit_rn_<backend>.apk
#
# Usage:
#   ./scripts/build-rn-android-apk.sh [debug|release]
#   BACKEND=regtest ./scripts/build-rn-android-apk.sh
#   ENV_FILE=.env.test.template ./scripts/build-rn-android-apk.sh
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RN_ROOT="$(cd "$E2E_ROOT/../bitkit" && pwd)"

BUILD_TYPE="${1:-release}"
BACKEND="${BACKEND:-regtest}"

if [[ "$BUILD_TYPE" != "debug" && "$BUILD_TYPE" != "release" ]]; then
  echo "ERROR: Unsupported build type: $BUILD_TYPE (expected debug|release)" >&2
  exit 1
fi

if [[ -z "${ENV_FILE:-}" ]]; then
  if [[ "$BACKEND" == "regtest" ]]; then
    ENV_FILE=".env.development.template"
  else
    ENV_FILE=".env.development"
  fi
fi

if [[ ! -f "$RN_ROOT/$ENV_FILE" ]]; then
  echo "ERROR: Env file not found: $RN_ROOT/$ENV_FILE" >&2
  exit 1
fi

echo "Building RN Android APK (BACKEND=$BACKEND, ENV_FILE=$ENV_FILE, BUILD_TYPE=$BUILD_TYPE)..."

pushd "$RN_ROOT" >/dev/null
if [[ -f .env ]]; then
  cp .env .env.bak
fi
cp "$ENV_FILE" .env
E2E_TESTS=true yarn "e2e:build:android-$BUILD_TYPE"
if [[ -f .env.bak ]]; then
  mv .env.bak .env
else
  rm -f .env
fi
popd >/dev/null

APK_PATH="$RN_ROOT/android/app/build/outputs/apk/$BUILD_TYPE/app-universal-$BUILD_TYPE.apk"
if [[ ! -f "$APK_PATH" ]]; then
  ALT_APK_PATH="$RN_ROOT/android/app/build/outputs/apk/$BUILD_TYPE/app-$BUILD_TYPE.apk"
  if [[ -f "$ALT_APK_PATH" ]]; then
    APK_PATH="$ALT_APK_PATH"
  else
    echo "ERROR: APK not found at: $APK_PATH" >&2
    exit 1
  fi
fi

OUT="$E2E_ROOT/aut"
mkdir -p "$OUT"
OUT_APK="$OUT/bitkit_rn_${BACKEND}.apk"
cp -f "$APK_PATH" "$OUT_APK"
echo "RN APK copied to: $OUT_APK (from $(basename "$APK_PATH"))"
