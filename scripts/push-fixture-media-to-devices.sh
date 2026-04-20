#!/usr/bin/env bash
# Push image fixtures into Android emulator storage and iOS Simulator Photos so tests
# can pick them (e.g. profile avatar during Pubky profile creation).
#
# Android: copies to /sdcard/Pictures/ and triggers MEDIA_SCANNER_SCAN_FILE.
# iOS: xcrun simctl addmedia (Photos library on the target simulator).
#
# Usage (from bitkit-e2e-tests repo root):
#   ./scripts/push-fixture-media-to-devices.sh
#   ./scripts/push-fixture-media-to-devices.sh ./test/fixtures/bob.jpg ./test/fixtures/alice.png
#
# Environment:
#   ANDROID_SERIAL — if set, passed to adb -s (when multiple devices/emulators).
#   SIMCTL_DEVICE — iOS device name or UDID for simctl (default: booted).
#   SKIP_ANDROID=1 / SKIP_IOS=1 — skip one platform.
#
# Requirements: adb (Android), booted emulator; Xcode simctl (iOS), booted simulator.
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES_DIR="${FIXTURES_DIR:-$E2E_ROOT/test/fixtures}"

adb_cmd() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb -s "$ANDROID_SERIAL" "$@"
  else
    adb "$@"
  fi
}

push_android() {
  local files=("$@")
  if ((${#files[@]} == 0)); then
    echo "push-fixture-media: no image files for Android (skipped)."
    return 0
  fi
  if ! command -v adb >/dev/null 2>&1; then
    echo "push-fixture-media: adb not found; skip Android." >&2
    return 0
  fi
  if ! adb_cmd shell echo ok >/dev/null 2>&1; then
    echo "push-fixture-media: no Android device/emulator; skip Android." >&2
    return 0
  fi

  local f base dest
  for f in "${files[@]}"; do
    base="$(basename "$f")"
    dest="/sdcard/Pictures/$base"
    echo "push-fixture-media: Android adb push '$f' -> $dest"
    adb_cmd push "$f" "$dest"
    adb_cmd shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$dest" >/dev/null \
      || true
  done
  echo "push-fixture-media: Android done (${#files[@]} file(s))."
}

push_ios() {
  local files=("$@")
  if ((${#files[@]} == 0)); then
    echo "push-fixture-media: no image files for iOS (skipped)."
    return 0
  fi
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "push-fixture-media: xcrun not found; skip iOS." >&2
    return 0
  fi

  local device="${SIMCTL_DEVICE:-booted}"
  # addmedia requires a booted simulator when using "booted"
  if ! xcrun simctl list devices | grep -q Booted; then
    echo "push-fixture-media: no booted iOS Simulator; skip iOS." >&2
    return 0
  fi

  echo "push-fixture-media: iOS simctl addmedia $device ${files[*]}"
  xcrun simctl addmedia "$device" "${files[@]}"
  echo "push-fixture-media: iOS done (${#files[@]} file(s))."
}

default_fixture_files() {
  local dir="$1"
  local -a out=()
  local f
  shopt -s nullglob
  for f in "$dir"/*.{jpg,jpeg,png,heic,webp}; do
    [[ -f "$f" ]] || continue
    out+=("$f")
  done
  shopt -u nullglob
  printf '%s\n' "${out[@]}"
}

main() {
  local -a files=()
  if (($# > 0)); then
    files=("$@")
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(default_fixture_files "$FIXTURES_DIR")
  fi

  if ((${#files[@]} == 0)); then
    echo "push-fixture-media: no images under $FIXTURES_DIR (add .jpg/.png or pass paths)." >&2
    exit 1
  fi

  for f in "${files[@]}"; do
    if [[ ! -f "$f" ]]; then
      echo "push-fixture-media: not a file: $f" >&2
      exit 1
    fi
  done

  local abs=()
  local p
  for p in "${files[@]}"; do
    abs+=("$(cd "$(dirname "$p")" && pwd)/$(basename "$p")")
  done

  if [[ "${SKIP_ANDROID:-}" != "1" ]]; then
    push_android "${abs[@]}"
  else
    echo "push-fixture-media: SKIP_ANDROID=1"
  fi

  if [[ "${SKIP_IOS:-}" != "1" ]]; then
    push_ios "${abs[@]}"
  else
    echo "push-fixture-media: SKIP_IOS=1"
  fi
}

main "$@"
