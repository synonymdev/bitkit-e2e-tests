# Send comparison: 20-second versus 30-second default element wait

Node 24.9.0 stays fixed. Four outcome Send attempts per platform with a 20-second default element
wait are compared with the previous [30-second Node 24 batch](outcome-send-node-comparison-results.md).
The sole runtime-source change is `waitforTimeout: 30_000` to `waitforTimeout: 20_000` in the local
pilot configuration. The current pilot remains at 20 seconds after this experiment.

| Platform                 | 30-second default | 20-second default |
| ------------------------ | ----------------: | ----------------: |
| iOS                      |               4/4 |               4/4 |
| Android (Pixel 6/API 33) |               4/4 |               3/4 |

The 30-second batch passed all eight attempts; the 20-second batch passed seven of eight. The
sole 20-second-batch failure was Android attempt 2 missing the over-limit warning. That assertion
already retained its own explicit 30-second wait. No failed default 20-second element wait was
recorded. The observed count differs by one case, without establishing that the default wait
caused it; native-command timing variation remains a plausible influence.

## Failed attempts

- Android (Pixel 6/API 33), 20 seconds, attempt 2: `tap id:N1: tap id:N1: expected {"all":[{"textWithin":{"id":"SendNumberField","text":"1 500"}}],"appeared":["id:SendAmountExceededToast"]}; last visibility {"appeared id:SendAmountExceededToast":false}`

The retained Android attempt 2 missed `SendAmountExceededToast` while the amount read back as
1,500. Its assertion retained the explicit 30-second timeout in both batches. The native click
returned in 89 ms; the first post-action toast lookup took 1,448 ms and returned no match. This
failure did not expire a default 20-second element wait. The prior idle setting was restored.

## Fixed inputs and evidence

- Node 24.9.0 in both batches, verified in launcher, WDIO-worker and Appium runtime receipts.
- Identical app artifacts, installed dependency/driver packages, regtest backend, device profiles,
  recording settings, retry policy and helper assertions. Every attempt reinstalls the app and creates
  a fresh wallet. Both platforms run concurrently, one session per platform.
- Android uses Pixel 6, Android 13/API 33, ARM64; iOS uses the iPhone 17 profile on iOS 26.0.
- Explicit helper limits are unchanged: warning/outcome waits remain 30 seconds and input-clear
  confirmation remains 5 seconds. Only the default `waitFor*` element wait changes.
- Each batch contains exactly four outcome attempts per platform. Failed attempts are retained;
  there are no test retries, replacement passing runs, or added baseline/control sessions.
- Passing cases require all six warning appearances, exact recipient input/button state, rejected
  over-limit digit, the 10,000-sat review amount, and seven verified native input replacements.
  Android observation scopes must restore their previous idle setting, including on a failed outcome.
- Source, app and installed-package identities are verified before/after execution. 30-second batch
  source was `0c74af4eb4e31453d3bd88a12220d488b47e3cfb`; 20-second source was
  `3604f7c25f2d5c05bd111d77ca2c43b9c94f9ebf`. The complete delta contains documentation plus
  the single configuration-line change. Production Send and all gate-case bodies/tags remain unchanged.

## Descriptive timings

Median successful test-body seconds, including funding/mining. Early failed attempts remain in the
JSON and are excluded from medians. These sequential batches are not matched timing pairs.

| Platform                 | Default element wait | Median successful test-body seconds |
| ------------------------ | -------------------- | ----------------------------------: |
| iOS                      | 30 seconds           |                             146.283 |
| iOS                      | 20 seconds           |                             152.215 |
| Android (Pixel 6/API 33) | 30 seconds           |                             150.254 |
| Android (Pixel 6/API 33) | 20 seconds           |                             137.295 |

These small samples compare the default wait while holding the selected Node runtime fixed. Batch
order and native-command timing variation remain possible influences. The original ten-pair
20-second-default sample remains [separate historical evidence](outcome-send-rerun-results.md).
This is a local selector-pilot experiment; production gate migration remains pending and OCR deferred.

[Compact evidence](outcome-send-wait-comparison-results.json) retains every attempt from both
Node 24 batches. Full logs, recordings and runtime receipts remain local under
`artifacts/outcome-send-default30-node24` and `artifacts/outcome-send-default20-node24`.
