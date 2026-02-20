#!/usr/bin/env bash
# Build the legacy Bitkit RN iOS simulator app from ../bitkit and copy into aut/
#
# Inputs/roots:
# - E2E root: this repo (bitkit-e2e-tests)
# - RN root: ../bitkit (resolved relative to this script)
#
# Output:
# - Copies .app -> aut/bitkit_rn_regtest_ios.app
#
# Usage:
#   ./scripts/build-rn-ios-sim.sh [debug|release]
#   BACKEND=regtest ./scripts/build-rn-ios-sim.sh
#   ENV_FILE=.env.test.template ./scripts/build-rn-ios-sim.sh
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
    ENV_FILE=".env.test.template"
  fi
fi

if [[ ! -f "$RN_ROOT/$ENV_FILE" ]]; then
  echo "ERROR: Env file not found: $RN_ROOT/$ENV_FILE" >&2
  exit 1
fi

echo "Building RN iOS simulator app (BACKEND=$BACKEND, ENV_FILE=$ENV_FILE, BUILD_TYPE=$BUILD_TYPE)..."

pushd "$RN_ROOT" >/dev/null
if [[ -f .env ]]; then
  cp .env .env.bak
fi
cp "$ENV_FILE" .env
E2E_TESTS=true yarn "e2e:build:ios-$BUILD_TYPE"
if [[ -f .env.bak ]]; then
  mv .env.bak .env
else
  rm -f .env
fi
popd >/dev/null

if [[ "$BUILD_TYPE" == "debug" ]]; then
  IOS_CONFIG="Debug"
else
  IOS_CONFIG="Release"
fi

APP_PATH="$RN_ROOT/ios/build/Build/Products/${IOS_CONFIG}-iphonesimulator/bitkit.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: iOS .app not found at: $APP_PATH" >&2
  exit 1
fi

OUT="$E2E_ROOT/aut"
mkdir -p "$OUT"
OUT_APP="$OUT/bitkit_rn_${BACKEND}_ios.app"
rm -rf "$OUT_APP"
cp -R "$APP_PATH" "$OUT_APP"
echo "RN iOS simulator app copied to: $OUT_APP"
