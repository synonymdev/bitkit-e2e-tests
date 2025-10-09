#!/usr/bin/env bash
# Build the Bitkit iOS Simulator app from ../bitkit-ios and copy it into aut/
#
# Inputs/roots:
# - E2E root: this repo (bitkit-e2e-tests)
# - iOS root: ../bitkit-ios (resolved relative to this script)
#
# Output:
# - Copies Debug iphonesimulator build: Bitkit.app -> aut/Bitkit.app
#
# Requirements:
# - Xcode command line tools, valid Simulator runtime, and the "Bitkit" scheme
#
# Usage:
#   ./scripts/build-ios-sim.sh
set -euo pipefail
E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_ROOT="$(cd "$E2E_ROOT/../bitkit-ios" && pwd)"

xcodebuild \
  -project "$IOS_ROOT/Bitkit.xcodeproj" \
  -scheme Bitkit \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,OS=latest,name=iPhone 17' \
  -derivedDataPath "$IOS_ROOT/build" \
  clean build

OUT="$E2E_ROOT/aut"
mkdir -p "$OUT"
cp -R "$IOS_ROOT/build/Build/Products/Debug-iphonesimulator/Bitkit.app" "$OUT/Bitkit.app"
rm -rf "$IOS_ROOT/build"
echo "iOS sim artifact copied to: $OUT/Bitkit.app"
