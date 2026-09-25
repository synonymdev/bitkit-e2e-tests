# Migration tests

The routine migration suite has four cases per platform. Every case starts with savings and spending:

| Source                  | Restore into a clean installation | Install current app on top  |
| ----------------------- | --------------------------------- | --------------------------- |
| React Native 1.1.6      | `@migration_rn_restore`           | `@migration_rn_upgrade`     |
| Previous native release | `@migration_native_restore`       | `@migration_native_upgrade` |

All apps and tests use remote **regtest**. The native baseline is pinned per platform in `config/migration-baselines.json` (currently 2.5.0), not selected from GitHub's latest release. The app workflows retain nightly, manual, and release-PR triggers. Manual `previous_native_version` overrides the pinned tag. Routine runs do not prepare or run passphrase/legacy-address wallets.

## Run locally

Use a dedicated emulator or simulator, with source and target apps built for regtest. Keep the current target in `aut/bitkit_e2e.apk` or `aut/Bitkit.app`.

```sh
python3 scripts/migration-matrix.py android
python3 scripts/download-migration-app.py android native 2.5.0
BACKEND=regtest PREVIOUS_NATIVE_VERSION=2.5.0 \
  PREVIOUS_NATIVE_APP_PATH="$PWD/aut/previous-native/bitkit_e2e.apk" \
  ANDROID_UDID="$MIGRATION_ANDROID_SERIAL" ANDROID_SERIAL="$MIGRATION_ANDROID_SERIAL" \
  APPIUM_PORT=4725 ANDROID_SYSTEM_PORT=8205 \
  npm run e2e:android -- --mochaOpts.grep '@migration_native_restore'
```

Set `MIGRATION_ANDROID_SERIAL` to the newly created emulator's serial. WDIO starts Appium on the selected `APPIUM_PORT`; choose free ports distinct from other active test runs. Both Android variables are required: the WDIO session uses `ANDROID_UDID`, while shell-based helpers use `ANDROID_SERIAL`.

For iOS, download with `ios native 2.5.0`, then run directly against the newly created simulator:

```sh
BACKEND=regtest PREVIOUS_NATIVE_VERSION=2.5.0 \
  PREVIOUS_NATIVE_APP_PATH="$PWD/aut/previous-native/Bitkit.app" \
  SIMULATOR_UDID="$MIGRATION_SIMULATOR_UDID" SIMULATOR_NAME="$MIGRATION_SIMULATOR_NAME" \
  SIMULATOR_OS_VERSION="$MIGRATION_IOS_VERSION" APPIUM_PORT=4727 IOS_WDA_LOCAL_PORT=8105 \
  npm run e2e:ios -- --mochaOpts.grep '@migration_native_restore'
```

Set the three `MIGRATION_*` simulator variables to that dedicated device's values. Prefer direct npm commands for isolated local runs: `ci_run_ios.sh` resolves a device by name, and `ci_run_android.sh` calls adb, so a WDIO UDID alone does not isolate those wrappers. Use `@migration_native_upgrade` for install-on-top. Native iOS creates wallets directly on iOS and never depends on Android preparation.

Download RN sources with `python3 scripts/download-migration-app.py android rn v1.1.6` (or `ios rn v1.1.6`). Android RN cases prepare their own wallets. RN iOS still needs wallets created on Android because RN iOS cannot reliably be driven through the creation flow with Appium. The reusable `migration-wallet-setup.yml` handles that in CI. The RN iOS restore case skips downloading the unused RN iOS app; its Android source provenance remains in the matching `migration-setup-logs` artifact.

For RN iOS local runs, prepare each wallet on the dedicated Android emulator with `BACKEND=regtest MIGRATION_SETUP_WALLET=1 ANDROID_UDID="$MIGRATION_ANDROID_SERIAL" ANDROID_SERIAL="$MIGRATION_ANDROID_SERIAL" APPIUM_PORT=4725 ANDROID_SYSTEM_PORT=8205 npm run e2e:android -- --mochaOpts.grep '@migration_setup_standard'`. Load the resulting `artifacts/migration_setup_standard.env` into the environment before running the chosen RN iOS case. Treat these files as secrets and never print the seed in diagnostics. Use a fresh setup wallet for each case and retry.

Native verification checks separate savings and spending balances, recovered activity and tags, state after relaunch, and receipt of a small Lightning payment. The payment demonstrates incoming Lightning usability; it does not claim outbound payment coverage.

Source preparation verifies backup completion after funding and metadata changes. Native builds expose `AllSynced`; RN release builds require successful `Latest Backup` statuses for every expected category, including Tags and Connections when spending exists. RN checks these before exporting a wallet or installing the target.

## Retries and extended coverage

Native and Android RN cases create new wallets inside every test attempt. iOS RN has two Android preparation jobs in routine runs, one for restore and one for upgrade. Each prepares **three independent wallets**, one per possible consumer attempt, with up to three setup attempts per wallet. This costs extra setup time but prevents a partial migration from modifying the backup used by its retry. Setup completion markers include the wallet number.

Use **Re-run all jobs** when rerunning a failed iOS RN workflow. Wallet artifact names include the workflow run attempt: rerunning only consumer jobs intentionally fails to download old wallets, instead of reusing potentially modified backups. Each attempt loads only its own wallet environment. Wallet artifacts have one-day retention.

Set manual dispatch input `extended_rn=true` to add RN 1.1.6 passphrase (`@migration_3`) and legacy-address (`@migration_4`) cases. Locally set `MIGRATION_EXTENDED=true` and select the corresponding tag. These are retained targeted coverage, excluded from the four routine cases.

The first two test failures allow retries; the third failure fails its job. The `migration-result` job requires every expected job to succeed, including setup and plan resolution. Skipped required jobs count as failure. Slack's overall migration result uses this gate. Source metadata and test diagnostics are uploaded even on success to preserve retry evidence.

## Advance the baseline

1. Archive the released regtest builds using `/archive-release` after validating that release.
2. Verify the archived APK and simulator zip install on CI devices, including Android package/signing compatibility and iOS simulator architecture/runtime compatibility.
3. Update the relevant platform in `config/migration-baselines.json` to its exact release tag. Do not advance automatically when an archive is uploaded.
4. Record the release asset SHA-256 digests in `config/migration-checksums.json`; the downloader verifies known checksums before installing/extracting. Overrides without a recorded checksum still log the calculated checksum.
5. Run the four cases on that platform and review failures before merging the baseline update.

The downloader fails on missing/empty/malformed assets or checksum mismatches. Previous native apps live under `aut/previous-native/`, so the target cannot be overwritten. `artifacts/migration-source.json` records source URL/tag/checksum, target revision, and E2E revision. It contains no wallet seed.

## Coordinated rollout and known failures

Land the E2E changes (including the reusable setup workflow) before enabling the new app workflows. GitHub reusable workflow references use `@main`; companion branches select the E2E scripts/tests but do not change which reusable workflow definition GitHub executes. Before rollout, validation of that definition requires an explicit temporary reference to the companion branch. Keep matching companion branch names across repositories for test-code resolution.

Android restore may expose [bitkit-android #1342](https://github.com/synonymdev/bitkit-android/issues/1342). Preserve failing restore assertions and report the issue separately from infrastructure failures; do not skip the case or accept missing funds to get a passing run.

Static helper checks:

```sh
python3 -m unittest discover -s scripts -p 'test_migration_tools.py'
bash -n scripts/prepare-migration-wallets.sh
```

Device passes and hosted workflow passes are separate evidence. Local runs cannot prove GitHub artifact transfer or job dependency execution.
