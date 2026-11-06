# Send comparison: Node 22 versus Node 24 at a 30-second default wait

The subsequent [20-second versus 30-second comparison](outcome-send-wait-comparison-results.md)
holds Node 24 fixed and changes only the default element wait. The results below remain the
separate runtime-version comparison.

Four outcome Send attempts per platform on each Node version. The default element wait stays
at 30 seconds in both batches. The [Node 22 batch](outcome-send-default30-node22-results.md)
ran first; this follow-up changes only the selected Node runtime.

| Platform                 | Node 22.23.4 | Node 24.9.0 |
| ------------------------ | -----------: | ----------: |
| iOS                      |          4/4 |         4/4 |
| Android (Pixel 6/API 33) |          3/4 |         4/4 |

Node 24 passed all eight cases, with no warning, clear-confirmation or setup failure. There is no
observed pass-rate advantage for Node 22 in these batches. Node 22 was not necessary to obtain
these passing results; the experiment does not establish that raising the default wait caused
the improvement against the earlier sample.

## Failed attempts

- Android (Pixel 6/API 33), Node 22.23.4, attempt 3: `type id:RecipientInput: RecipientInput: input did not clear; replacement not typed; last visibility {}`

The retained Node 22 Android failure was the helper's explicit 5-second clear-confirmation
limit before its first recipient write. Native clear returned 200, the field read back empty,
and the screenshot showed an empty field with disabled Continue. That limit is separate from
the default element wait and was not changed for the Node 24 batch.

## Inputs and verification

- Node 22 executed E2E source `8d374c51aa328a0b7fa2914dc6ffe2372c308f23`; Node 24 executed
  `0c74af4eb4e31453d3bd88a12220d488b47e3cfb`. The intervening source delta contains four
  documentation files only. Helpers, assertions, fixtures, lockfiles and WDIO configuration are identical.
- Both batches use the same unchanged app artifacts, installed dependency/driver packages,
  regtest backend, recording settings, disposable devices, one session per platform and concurrent
  platforms. Every attempt reinstalls the app and creates a fresh wallet. Android is Pixel 6/API 33
  ARM64; iOS is the iPhone 17 profile on iOS 26.0. No app rebuild or dependency reinstall occurred.
- Each batch contains exactly four positive outcome attempts per platform. No failure was retried
  or replaced. There are no additional baseline/control sessions in these batches.
- Runtime receipts verify the selected Node version in the launcher, WDIO worker and Appium server.
  Before/after checks verify source, app and installed dependency identities.
- All six warning appearances, exact input/button state, rejected over-limit digit and the
  10,000-sat review amount remain mandatory. Passing cases require seven verified native input
  replacements. Android observation scopes must restore their prior idle setting.
- Explicit helper timeouts and the pilot's zero request-retry policy are unchanged. The earlier
  [20-second-default sample](outcome-send-rerun-results.md) is separate historical evidence.

## Descriptive timings

Median successful test-body seconds, including funding/mining. Early failed attempts are excluded
from medians and retained in the JSON. These are sequential batches rather than matched timing pairs.

| Platform                 | Node    | Median successful test-body seconds |
| ------------------------ | ------- | ----------------------------------: |
| iOS                      | 22.23.4 |                             140.263 |
| iOS                      | 24.9.0  |                             146.283 |
| Android (Pixel 6/API 33) | 22.23.4 |                             158.099 |
| Android (Pixel 6/API 33) | 24.9.0  |                             150.254 |

Four attempts per platform/runtime are not a long-term flake-rate estimate. Batch order and ordinary
native-command timing variation remain possible influences. The figures compare the selected runtimes
at a fixed 30-second default; they do not establish that raising the default caused the improvement
against the earlier sample. Gate cases remain unmigrated and OCR remains deferred.

[Compact evidence](outcome-send-node-comparison-results.json) retains all sixteen attempts across
both batches. Full logs, recordings and process receipts remain local under
`artifacts/outcome-send-default30-node22` and `artifacts/outcome-send-default30-node24`.
