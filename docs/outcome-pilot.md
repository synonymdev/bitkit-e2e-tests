# Local action/outcome pilot

This opt-in experiment compares the existing `onboarding_1` and `receive_1` journeys at E2E revision
`01834b5f0313feb022f1e3e6c3afdcb7cace116b` with explicit action/outcome helpers.
It is outside `test/specs`, is not selected by the normal configuration, and rejects CI execution.
The same specs run on iOS and Android. Compare baseline and outcome modes within each platform;
different platform app artifacts and devices do not provide a cross-platform speed benchmark.

Both modes reinstall the app and reset the selected iOS simulator's keychain. Use disposable
devices, never devices containing wallets you need to retain. Use the same regtest app artifact,
device, backend, video settings and source revision for both modes on a platform.

## Run

Keep the repository's usual dependencies and an appropriate regtest `aut/Bitkit.app` available.
Create and boot a disposable simulator using an installed runtime, for example:

```sh
xcrun simctl create 'Bitkit Outcome Pilot' \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17 \
  com.apple.CoreSimulator.SimRuntime.iOS-26-0
# Substitute the returned UDID below.
xcrun simctl boot <UDID>
xcrun simctl bootstatus <UDID> -b

PLATFORM=ios BACKEND=regtest \
SIMULATOR_UDID=<UDID> SIMULATOR_NAME='Bitkit Outcome Pilot' SIMULATOR_OS_VERSION=26.0 \
APPIUM_PORT=4737 IOS_WDA_LOCAL_PORT=8117 \
OUTCOME_PILOT_MODE=baseline \
OUTCOME_PILOT_JOURNEY=all \
OUTCOME_PILOT_ARTIFACTS="$PWD/artifacts/outcome-pilot/baseline-1" \
RECORD_VIDEO=true SAVE_DIAGNOSTICS=true \
./node_modules/.bin/wdio run ./wdio.outcome-pilot.conf.ts
```

Repeat with `OUTCOME_PILOT_MODE=outcome` and a distinct artifact directory. Alternate the order
in subsequent pairs to reduce warm-up bias. Keep each invocation's stdout in its own log.
Use fresh artifact directories: JSONL files append instead of overwriting prior evidence.
Shut down the disposable simulator when finished.

For Android, create a separate AVD from an installed system image (the Android CLI or Android
SDK's `avdmanager` can do this), boot it, and put the matching regtest APK at `aut/bitkit_e2e.apk`:

```sh
PLATFORM=android BACKEND=regtest \
ANDROID_UDID=<emulator-serial> ANDROID_DEVICE_NAME=<AVD-name> ANDROID_PLATFORM_VERSION=13 \
APPIUM_PORT=4739 ANDROID_SYSTEM_PORT=8219 \
OUTCOME_PILOT_MODE=baseline OUTCOME_PILOT_JOURNEY=all \
OUTCOME_PILOT_ARTIFACTS="$PWD/artifacts/outcome-phase2/android-baseline-1" \
RECORD_VIDEO=true SAVE_DIAGNOSTICS=true \
./node_modules/.bin/wdio run ./wdio.outcome-pilot.conf.ts
```

`OUTCOME_PILOT_JOURNEY` accepts `onboarding` (default), `receive`, or `all`. With `all`, both
journeys run sequentially in one session; each has a fresh app/wallet setup. Use explicit device
serials and separate Appium/WDA/UiAutomator ports when running platforms concurrently. Keep
the concurrency policy the same for both modes and record it with the results.

For a bounded comparison, keep the platform/device/backend/port variables above set and run:

```sh
python3 scripts/outcome-pilot.py --pairs 3 --output artifacts/outcome-phase2/final-ios
# Use a different fresh output directory when PLATFORM=android.
```

The runner alternates baseline/outcome order between pairs, executes both journeys each time,
then runs both negative controls. It requires exactly one receipt per expected journey, checks
the negative controls stopped at the intended action, and stops on unexpected or missing results.
It never retries a case. It fingerprints Git-visible checkout files (including imported helpers,
base configuration, lockfiles, the runner and new untracked source) and declared submodule pins
before and after every session, including the final control session, and before completion.
Installed dependencies, built apps and external services remain separate run inputs.
Each device session has a bounded deadline, and only its own process group is stopped if that
deadline expires. The output directory must not already exist and must be outside the checkout
or Git-ignored, so result files cannot enter the source fingerprint.

## What differs

- Baseline reproduces the original actions, settling sleeps, and terminal assertions.
- Outcome mode performs the same taps and swipes, requires an expected visible target after
  each, and replaces settling sleeps with bounded polling. It also asserts intermediate pages
  after the original unasserted swipes. Swiping beyond the final page intentionally leaves the
  same page visible; not every action needs a false-to-true transition.
  A swipe also requires matching destination bounds on consecutive observations. Android
  testing caught a visible-but-moving page accepting the next gesture too early; visibility
  alone was insufficient. The trace includes the observed bounds. These extra observations
  have a cost and are included in the outcome timings.
- Wallet setup accepts either Home or the optional USDT introduction, then uses the same
  `waitForWalletHome()` readiness/intro handling as baseline. This preserves the bounded wait
  for an introduction that may appear after Home. Both modes finish with `TO GET` visible.
- Actions execute once. Only observations are polled. There is no automatic re-tap, payment
  replay or test retry.
- Existing shared callers retain the default 500 ms swipe settling delay. Only the pilot's
  outcome helper opts out through `settleMs: 0`.
- The shared USDT-introduction dismissal wait now resolves the button afresh on every poll.
  A repeated Android run showed Home while a cached decline element still reported displayed.
  The fix keeps the same dismissal action and default timeout, without retrying the tap. Both
  baseline and outcome modes use this same readiness fix; earlier sample revisions are retained
  separately rather than combined with the final comparison.
  Android also waits for the enabled button's bounds to stop changing before that tap, so an
  entering bottom sheet does not move the target during interaction.
- Receive retains all original checks: a regtest receiving address, details/QR navigation,
  amount 123, note and tag persistence, reset after reopening, and previous-tag reuse/deletion.
  Setup uses the same original `completeOnboarding()` helper in both modes and is excluded
  from test-body timings. This is Receive-form coverage; it does not receive a payment.
- Receive's outcome mode checks each entered digit within the amount field, reads typed note
  and tag input back, and polls for keyboard dismissal and vanished forms. Conditions under
  `all` must all pass; `anyVisible` supplies alternatives for legitimate states such as Home
  versus the USDT introduction. Arbitrary observation callbacks are not exposed.

This is an overall helper comparison, not a benchmark of polling alone: intermediate assertions
also differ. It does not test payments or backend correctness.

## Evidence and negative control

`results.jsonl` contains the test-body duration and verdict; setup/WDA/session time is excluded.
`steps.jsonl` contains outcome-mode actions, timestamps, elapsed times and last observed
visibility. A failing action records a best-effort screenshot. Existing test hooks retain videos
and test screenshots. The last visibility values are hierarchy observations, not visual proof
that a target is unobscured or tappable. No raw page source or recovery phrase is logged here.
The pilot also retains Appium server logs and setup-hook failure screenshots/receipts; a setup
failure does not count as a Receive or onboarding assertion verdict.

Run outcome mode with `OUTCOME_PILOT_NEGATIVE_CONTROL=true` in its own artifact directory.
This deliberately expects a nonexistent target after the first tap. The run must fail at that
step, record the failed expectation and stop before `GetStarted` is tapped. A passing negative
control is a failed experiment. Set the variable only for this intentional failure run.

For `OUTCOME_PILOT_JOURNEY=receive`, the negative control instead expects a deliberately wrong
amount after tapping N1. It must fail there, report the actual amount, and never tap N2 or
continue to note/tag entry. Run the controls separately so each failure has its own receipt.

Compare first-attempt passes, test-body durations and diagnostic clarity. A handful of local
runs establishes feasibility, not a long-term flake rate or grounds for changing CI gates.
Keep the existing suite until a broader stability sample and appropriate visual/backend
coverage justify adoption. The original iOS onboarding results remain in
`artifacts/outcome-pilot`; the extended experiment uses `artifacts/outcome-phase2`.
