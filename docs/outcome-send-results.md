# Send validation action/outcome experiment

This is the original sample. The separate [readiness/toast investigation and rerun](outcome-send-rerun-results.md)
preserves these results and records the subsequent fixes, forty new attempts and driver diagnostics.

The `send_1` experiment does **not support migrating the full gate yet**. Keep the candidate opt-in.
The production `send_1` specification, IDs, queue tags and assertions remain unchanged.
The [earlier onboarding/Receive sample](outcome-pilot-results.md) remains separate historical evidence.

## Results

Forty planned comparison attempts ran on pinned current-master apps: ten per variant on each
platform. A setup failure counts as a failed attempt, not a passing or executed Send case.

| Platform | Variant  | Passed / attempts | Cases started | Setup failures |
| -------- | -------- | ----------------: | ------------: | -------------: |
| iOS      | Baseline |           10 / 10 |            10 |              0 |
| iOS      | Outcome  |            9 / 10 |            10 |              0 |
| Android  | Baseline |            0 / 10 |             8 |              2 |
| Android  | Outcome  |            2 / 10 |             7 |              3 |

The nine jointly successful iOS pairs had these median durations:

| Measurement       |  Baseline |   Outcome |
| ----------------- | --------: | --------: |
| Test body         | 128.207 s | 128.008 s |
| Entire invocation | 180.635 s | 178.116 s |

Test time is essentially unchanged, and the candidate introduced an iOS failure. Android has
no jointly successful pair, so its early failures cannot be used as evidence of a speed gain.
The two outcome passes improve on a failing Android baseline but do not establish reliable
coverage. Ten attempts per variant do not estimate long-term flake rates.

Both deliberate wrong-expectation controls failed at the first recipient input, before funding.
The planned Android control was blocked during onboarding; one separately labeled control-only
attempt reached the assertion and verified it. That blocked control remains retained separately
from the forty comparison attempts. Screenshots show `test123`, the real decoding-error message
and disabled Continue. Driver logs confirm input readback and queries for the deliberately
missing target. The final trace sample was empty on both controls; screenshots and driver logs
supply the additional evidence rather than treating that empty sample as a complete observation.

## What failed

- The one iOS candidate failure followed the final over-limit digit and did not observe the expected
  warning. Its last trace sample was empty. The iOS short-warning lifetime is 1.5 seconds; sequential
  hierarchy reads and transient feedback need closer investigation. This run does not establish an app defect.
- Eight Android baseline cases failed while waiting for a warning or reading a toast's bounds during
  dismissal. Five candidate cases failed at validation outcomes: two invalid-address warnings,
  one expired-invoice warning and two over-limit amount warnings.
- Five Android positive attempts never started the test. The shared readiness helper timed out at
  its final Home wait while the USDT introduction was visible. The helper already checks for and
  dismisses that intro earlier; the observed race is not evidence that intro handling is absent.

Baseline retained two explicit input-retry messages on iOS and seven on Android. Candidate inputs
were not explicitly replayed. Existing shared wallet/funding helpers were used by both variants.

## Method and inputs

The baseline body is copied from `f170a365` and its parsed body was checked against the original.
The candidate keeps every original validation: empty input, malformed data, wrong-network address,
valid address with zero funds, expired invoice, a 15,000-sat deposit with balance checks, an over-limit
digit, a payable 10,000-sat BIP21 request and an unpayable 200,000-sat request.
It adds typed-value readback, enabled-state checks, visible navigation outcomes and retained amount
checks. It replaces settling sleeps/input retries with bounded observations and lets asserted toasts
expire through fresh-selector polling instead of dragging a potentially stale toast.
This compares that bundle of changes, not assertion discipline in isolation.

Each attempt reinstalled the app and created a fresh wallet. Both modes used identical app artifacts,
backend, devices, driver configuration and recording settings within a platform. Pair order alternated.
Both platforms ran concurrently, with one invocation at a time on each. Test-body time includes
funding/mining and UI validation; full invocation time also includes Appium/WDA, setup and teardown.
These are local regtest results, not certification of the local-backend merge gate.

| Platform | Master source revision                     | Artifact identity                                                                          |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| iOS      | `4c7633a41bd1a8ea9f57fc46f9ce6870f4231ede` | Bundle manifest SHA-256 `e1aceaf828315ecc49916a5ae73ee2209c1aaadda3c63d493d494fea33d15586` |
| Android  | `7f49f216f20c70f95f6b9ff087fa3f2b6fb985c5` | APK SHA-256 `14ff54fc8478ad2dd4596d7ad7a6e70507b79a33369e550cca4b8c56f1b19860`             |

The apps still report version 3.0.1 (iOS202 / Android195); source revisions and hashes identify these
new master builds. iOS used Xcode26.0.1 and explicit C defines for P256K's default ECDH, recovery,
Schnorr and MuSig modules because this toolchain omitted trait-conditional C settings. Neither app's
source or locked dependency versions were changed. Build signatures and backend settings were verified.

All 191 Git-visible source hashes matched before/after recorded invocations and at final audit.
App hashes and installed package manifests also matched at the end. The original Android runner stopped
on missing setup receipts. Reviewed continuation executors, separately fingerprinted, executed only
unrun entries of the original plan and retained each exact known setup recurrence as a failed attempt.
The plan order and ten-attempt denominator were preserved; no passing rerun replaced a failure.

Older incompatible-artifact attempts and smoke revisions are retained locally and excluded here.
Full logs, step traces, screenshots, recordings and build receipts remain local under
`artifacts/outcome-send` and the sibling `outcome-send-compare` workspace. The
[compact evidence](outcome-send-results.json) includes individual attempt timings, failure categories,
source/artifact identities, driver versions, continuation hashes and control verification.

## Decision

Keep Send experimental and leave all thirteen gate migrations unchecked. Fix the shared wallet-readiness
race and design a reliable way to observe short-lived warnings before considering promotion. Preserve
failed observations and avoid replaying payment actions. OCR remains deferred; this experiment uses
native selectors through Appium and does not exercise a Reflex headless app contract.

TypeScript, formatting, 47 TypeScript unit tests and nine Python runner-boundary tests passed during
implementation. Reproduction options are in [the pilot instructions](outcome-pilot.md).
