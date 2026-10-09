#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
xcrun --sdk macosx clang -fobjc-arc -framework Foundation keyboard.m -o build/keyboard-control
printf '%s\n' "built tools/ios-keyboard/build/keyboard-control"
