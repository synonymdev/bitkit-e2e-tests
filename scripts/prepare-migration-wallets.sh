#!/usr/bin/env bash
# Prepares three independent wallets (wallet-attempt-1/2/3) for mocha attempts
# 1–3 in one consumer job. Migrating can modify a wallet's remote backup, so
# each in-run retry uses a different seed. Across workflow re-runs the env
# artifact name is stable (no github.run_attempt); see docs/migration-tests.md.
set -euo pipefail
setup_type="${1:?Expected standard, passphrase, or sweep}"
case "$setup_type" in standard|passphrase|sweep) ;; *) echo "Unknown setup type: $setup_type" >&2; exit 1 ;; esac

for wallet in 1 2 3; do
  env_file="artifacts/migration_setup_${setup_type}.env"
  prepared=false
  for attempt in 1 2 3; do
    rm -f "$env_file"
    # A failed RN gesture can leave Android's notification shade above the app.
    # Collapse it before starting the next independent Appium session.
    adb shell cmd statusbar collapse >/dev/null 2>&1 || true
    if MIGRATION_SETUP_WALLET="$wallet" ATTEMPT="wallet-${wallet}-try-${attempt}" \
      ./ci_run_android.sh --mochaOpts.grep "@migration_setup_${setup_type}"; then
      test -s "$env_file"
      mkdir -p "artifacts/wallet-attempt-${wallet}"
      cp "$env_file" "artifacts/wallet-attempt-${wallet}/"
      prepared=true
      break
    fi
  done
  if [[ "$prepared" != true ]]; then
    echo "Failed to prepare independent wallet $wallet after 3 attempts" >&2
    exit 1
  fi
done
