# Send rerun after readiness and input fixes

Keep Send opt-in. This investigation corrected concrete test-orchestration defects, but
short-lived validation feedback still needs a more reliable observation contract before gate rollout.
The production `send_1` body, IDs, fixtures and queue tags remain unchanged. OCR remains deferred.

## Completed comparison

Ten attempts per variant per platform, with failed attempts retained. The earlier
[Send comparison](outcome-send-results.md) and interrupted diagnostic revisions are separate samples.

| Platform | Variant  | Passed / attempts | Cases started | Setup failures |
| -------- | -------- | ----------------: | ------------: | -------------: |
| iOS      | baseline |              8/10 |            10 |              0 |
| iOS      | outcome  |              9/10 |            10 |              0 |
| Android  | baseline |              2/10 |            10 |              0 |
| Android  | outcome  |              3/10 |            10 |              0 |

Only jointly successful pairs support timing comparisons. Medians below are seconds;
test-body time includes funding/mining, and invocation time also includes setup, Appium/WDA and teardown.

| Platform | Joint successful pairs | Baseline body | Outcome body | Baseline invocation | Outcome invocation |
| -------- | ---------------------: | ------------: | -----------: | ------------------: | -----------------: |
| iOS      |                      7 |       134.568 |      140.410 |             181.628 |            195.395 |
| Android  |                      1 |       204.271 |      134.785 |             253.870 |            189.078 |

A platform with no jointly successful pair has no comparative speed result. Early failure is
not a speed gain, and ten attempts cannot establish a long-term flake rate.

## What changed

- **Wallet readiness:** optional-intro polling and final Home polling use fresh selectors. A late
  USDT intro can be handled while Home is pending. Dismissal runs outside WebdriverIO's retrying
  observation predicate, so a failed dismissal does not become repeated taps. Native execution
  exercises `completeOnboarding -> waitForWalletHome`; restore routing was not migrated.
- **Replacement input:** the Send pilot issues one clear, waits for two fresh empty native-input
  observations, then writes once and requires exact final readback. WebdriverIO `setValue` clears
  internally, so the verified path uses `addValue` to avoid a second unverified clear. Failed
  clearing stops before replacement. Existing Receive callers keep their current default.
- **Transient feedback:** require prior absence, observe and latch appearance before reading
  persistent fields, then still require the original input/button/amount checks. This covers a
  warning arriving after the first poll. Missing-warning failures get separately timestamped,
  best-effort field diagnostics; those diagnostics never convert failure into a pass.
- **Android observation policy:** snapshot the current idle timeout before action, issue the action
  under that setting, use `waitForIdleTimeout=0` only while observing transient outcomes, then restore
  the exact prior value. Update/observation/restoration failures remain visible. iOS and non-transient
  paths do not use these settings commands. This policy is part of the candidate bundle; the
  baseline retains its original observation/dismissal policy.

The [UiAutomator2 5.0.0 documentation](https://github.com/appium/appium-uiautomator2-driver/blob/v5.0.0/README.md#settings-api)
describes idle waiting before selector searches. Lowering it did not eliminate every long lookup
in this experiment, so the result does not isolate idle waiting as the sole cause.

## Remaining failures

| Platform | Baseline failures                                                   | Outcome failures                                                  |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| iOS      | 2 expired-toast dismissal failures                                  | 1 over-limit warning not observed                                 |
| Android  | 5 dismissal failures after detection; 3 warning appearance failures | 6 warning appearance failures; 1 input-clear confirmation failure |

A baseline 20-second failure inside `dragOnElement` is a dismissal re-wait after the initial
warning detection succeeded. It is separate from a 30-second appearance wait in `waitForToast`.
The outcome's input-clear failure stopped before writing the replacement; it was not silently retried.

Videos confirm automation false negatives on **both** platforms: Android `outcome-1` and iOS
`outcome-3` visibly show the orange “Insufficient balance” warning while the field remains at 1,500.
On Android, the first post-action selector lookup took 3,891 ms despite the scoped idle setting.
On iOS, the native keypad click itself took 20,437 ms; the subsequent lookup took 69 ms, after the
warning had expired. These two cases do not establish a missing-warning app defect. The app's
short-warning lifetime is 1,500 ms. Other warning misses remain failures without a product-defect claim.
Recordings, extracted frames and command receipts remain local under `artifacts/outcome-send-rerun`.

No assertion was weakened. The candidate did not replay input actions. The baseline retains its
original internal retries and toast dragging. iOS paired body time was slightly slower in this
sample; Android has only one jointly successful pair, which is insufficient for a speed conclusion.

## Separate driver timing diagnostics

The diagnostic profile attempted zero idle/selector waiting on Android, and zero idle/cool-off
waiting on iOS. It is excluded from all forty comparison attempts.

- Android passed one attempt in **102.965 seconds** of test-body time. Both settings were
  independently read back as zero before the fixture; all six warnings and seven verified native
  replacements passed. Both original values (10,000 ms) were restored and verified afterward.
  Source, app, tool and profile fingerprints stayed unchanged.
- iOS was **blocked before the fixture**: the installed driver did not return the idle/cool-off
  settings needed for safe snapshot-and-restore. Its wrapper also hit a process-group permission
  error during finalization. The original incomplete receipt is preserved with a separate blocked
  recovery audit; no iOS profile result or passing case is claimed.

The Android pass supports repeating a bounded driver-profile comparison before migrating more
cases. One diagnostic run cannot establish reliability, and its time is not a paired speed result.
The iOS profile needs a supported, verifiable configuration path before it can be compared. No
shared driver configuration was changed. Exact receipts and profile hashes are in the compact evidence.

## Controls, inputs and verification

Both planned wrong-expectation controls failed at the first `test123` recipient input before
funding. The compact evidence records actual input/disabled state separately from the intentionally
missing target and native one-clear/two-empty/one-write verification. Screenshots and raw driver logs
provide the additional control evidence.

Executed E2E candidate: `2be5df4d408361191f356867b601b2643b295f6d`. Both modes use the same unchanged app artifacts
as the original comparison: iOS master `4c7633a41bd1a8ea9f57fc46f9ce6870f4231ede`, Android master
`7f49f216f20c70f95f6b9ff087fa3f2b6fb985c5`, regtest backend, disposable devices and recording policy.
Both platforms run concurrently with one session per platform; every invocation reinstalls the app
and creates a fresh wallet. Pair order alternates. These are local regtest measurements, not
certification of the local-backend merge gate.

Source fingerprints are checked before/after every recorded invocation. App hashes and installed
package manifests are verified against the original builds. Passing candidate cases require six
real warning observations, seven native input replacement sequences and, on Android, six scoped
settings cycles with exact restoration. Failed attempts and their targets remain in
[the compact evidence](outcome-send-rerun-results.json).

71 TypeScript unit cases, nine Python runner-boundary cases, TypeScript, targeted ESLint/formatting
and independent implementation review passed. Device outcomes are reported separately above;
this is not a claim of green CI or gate readiness. Reproduction options remain in
[the pilot instructions](outcome-pilot.md).
