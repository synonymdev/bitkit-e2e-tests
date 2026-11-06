# Send pilot: 30-second element wait and Node 22

The subsequent [Node 24 comparison](outcome-send-node-comparison-results.md) holds the default
element wait at 30 seconds and uses identical runtime source. The results below remain the
separate Node 22 batch.

Four outcome-based Send attempts on each platform, using Node 22.23.4 and a 30-second default
`waitFor*` element timeout. Both settings were changed together. The previous
[ten-pair comparison](outcome-send-rerun-results.md) is a separate historical sample.

| Platform | Passed / attempts | Median successful test-body seconds |
| -------- | ----------------: | ----------------------------------: |
| iOS      |               4/4 |                             140.263 |
| Android  |               3/4 |                             158.099 |

iOS passed all four attempts. Android passed attempts 1, 2 and 4; attempt 3 stopped before the
first replacement input at the pilot's explicit 5,000 ms clear-confirmation guard. The native clear
returned HTTP 200 and input readback was empty; the failure screenshot also shows an empty field
and disabled Continue. No replacement write was issued. This is a confirmation timeout in the
pilot helper, separate from the 30-second default element wait. No attempt failed a toast assertion.
Timing medians include successful attempts only; the short failed attempt stays in the JSON.

The regular Send pilot assertions remain mandatory, including all six warning appearances,
exact recipient input/button state, rejected over-limit digit and the 10,000-sat review amount.
Every attempt reinstalls the same app and creates a fresh wallet. Failed attempts are retained;
there are no test retries or replacement passing runs. This batch contains only the four requested
outcome attempts per platform, with no baseline/control sessions added.

The only checkout change from `328e47c758a98dcb26063efa12f635953804d9f3` is the pilot configuration's
explicit `waitforTimeout: 30_000`. Node 22.23.4 was selected through a task-private official runtime
with its archive verified against the published SHA-256. Dependencies and installed driver packages
were not reinstalled. Launcher, worker and Appium runtime receipts confirm Node 22 for every attempt.
The loaded configuration was independently checked before the batch.

Executed candidate: `8d374c51aa328a0b7fa2914dc6ffe2372c308f23`. App artifacts, regtest backend, recording policy,
concurrent platforms, production Send body and all helper assertions are unchanged from the previous
sample. Android uses the same Pixel 6 profile, Android 13/API 33, ARM64; iOS uses the same iPhone 17
profile and iOS 26.0 simulator. Driver request retries remain zero in this local pilot. The existing
Android transient-observation idle-setting policy remains unchanged; no new driver profile was added.

Passing cases require six warning appearances and seven verified native clear/two-empty-read/write
sequences. Android scopes must restore their original idle setting, including on failed attempts.
App, installed dependency and Git-visible source identities are checked before/after the batch.
TypeScript and targeted ESLint/format checks passed under Node 22.23.4.

These eight attempts test the combined settings. They do not isolate the effect of Node versus the
default element wait or establish a long-term flake rate. Test-body time includes funding/mining and
is descriptive, with no paired baseline speed comparison. Production gate cases remain unmigrated;
OCR remains deferred. Full native logs, recordings and runtime receipts stay local under
`artifacts/outcome-send-default30-node22`; [compact evidence](outcome-send-default30-node22-results.json)
retains every attempt and any failure.
