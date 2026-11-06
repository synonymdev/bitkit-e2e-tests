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

`OUTCOME_PILOT_JOURNEY` accepts `onboarding` (default), `receive`, `send`, or `all`. With `all`, both
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

## Send validation comparison

The latest [20-second versus 30-second default-wait comparison](outcome-send-wait-comparison-results.md)
holds Node 24.9.0 fixed. At 30 seconds both platforms passed 4/4; at 20 seconds iOS passed 4/4
and Android 3/4. The Android failure missed an over-limit warning using its unchanged explicit
30-second assertion, so these results do not establish that the default wait caused the difference.
The pilot is currently set to a 20-second default following this experiment.

The previous [Node 22 versus Node 24 comparison](outcome-send-node-comparison-results.md)
holds the default element wait at 30 seconds. Node 24 passed 4/4 attempts on each platform;
Node 22 had passed iOS 4/4 and Android 3/4. The runtime helpers/configuration are identical.
These small sequential batches show no observed advantage for Node 22; they do not establish
the cause of improvement against the older 20-second-default sample.

The earlier [Node 22 / 30-second default-wait check](outcome-send-default30-node22-results.md)
ran the unchanged outcome Send journey four times per platform: iOS 4/4 and Android 3/4.
The Android failure was the pilot's separate 5-second input-clear confirmation, before typing;
no attempt failed a toast assertion. Use Node 22.23.4 to reproduce this batch. That batch used
a 30-second default element wait; driver request retries and explicit helper limits retained
their previous values. Earlier samples remain separate.

`send_1` is represented by an opt-in prototype using the original wallet setup, 15,000-sat
funding fixture and recipient/amount assertions. The local pilot compares `runSendValidation()`
with the frozen original body from `f170a365` in `send-baseline.ts`. The production Send specification,
IDs and queue tags are unchanged. [The measured results](outcome-send-results.md) do not justify gate promotion. `all` still means the original onboarding/Receive pair.

The [readiness/toast investigation and rerun](outcome-send-rerun-results.md) records the newer
sample separately: iOS baseline 8/10 versus outcome 9/10; Android 2/10 versus 3/10, with no
setup failures. Send remains opt-in. The Send candidate now verifies one clear before one input
write, prioritizes actual warning appearance before persistent-field reads, and restores Android's
prior idle setting after each transient observation. Existing Receive typing retains its default.
The separate driver-timeout diagnostics are excluded from these counts.

With the same platform/device/backend variables as above, run:

```sh
python3 scripts/outcome-pilot.py --journey send --pairs 10 \
  --continue-on-test-failure --output artifacts/outcome-send/final-ios
# Change platform/device variables and use final-android for the Android sample.
```

Each platform gets 10 runs per variant in alternating order, followed by one deliberate
wrong-toast control. Every invocation reinstalls the app and creates a fresh wallet.
The baseline retains its original sleeps and input retries. The outcome variant adds
input readback and explicit visible/enabled/text outcomes, removes those retries and
settling sleeps, and waits for asserted toasts to expire rather than dragging a potentially
expired toast. The funding fixture remains shared and unchanged. This compares the whole
helper pattern; it does not isolate polling from the additional assertions or toast handling.

`--continue-on-test-failure` retains complete positive test failures and continues without
retrying them; the runner exits unsuccessfully after completing a sample containing failures.
Missing receipts, setup failures, unexpected exit codes, failed negative controls and source
changes still stop the sample. Sessions have a 15-minute deadline; the test-body timeout is
10 minutes. `sessions.jsonl` records total invocation time, including Appium/WDA/setup and
artifact teardown; `results.jsonl` separately records test-body time.

The send negative control requires a nonexistent validation toast after typing `test123`.
It must stop on that first input, before any further validation or funding. Verify the actual
input and disabled state with the trace, driver logs and screenshot evidence; a final empty
trace sample alone does not establish the observed state.
