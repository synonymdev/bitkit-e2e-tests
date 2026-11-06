# Action/outcome pilot results and gate migration

This draft introduces selector-based action/outcome helpers and local onboarding/Receive
experiments. The regular iOS gate cases have not been migrated. OCR is deferred.

## Executed pilot

On 6 November 2026, the final pilot revision passed 24/24 positive cases: three baseline and
three outcome runs of each journey on each platform, with fresh wallet setup and test retries
disabled. Four deliberate wrong-expectation controls failed at the intended step and stopped
that journey. All four failure screenshots were inspected.

Median test-body seconds; reinstall, wallet setup hooks and Appium/WDA session startup are
excluded. Both variants use the same USDT-introduction readiness fix.

| Platform | Journey    | Baseline | Outcome | Reduction |
| -------- | ---------- | -------: | ------: | --------: |
| iOS      | Onboarding |    25.63 |   22.39 |     12.7% |
| iOS      | Receive    |    40.82 |   36.14 |     11.5% |
| Android  | Onboarding |    31.97 |   28.59 |     10.6% |
| Android  | Receive    |    29.96 |   22.11 |     26.2% |

[Individual timings, inputs and source hashes](outcome-pilot-results.json) preserve the
historical execution evidence. The runs used existing iOS 3.0.1 (202) and Android 3.0.1 (195)
regtest artifacts, iOS 26.0 / Android 13, and E2E base
`01834b5f0313feb022f1e3e6c3afdcb7cace116b`. These are harness feasibility results on pinned older
builds. Three observations per variant do not establish a long-term flake rate or CI speedup.
The two platform sessions were allowed concurrently, so host contention and live regtest
startup contribute variation. Compare each platform to its own baseline.

The original screenshots, recordings, Appium logs and complete session receipts remain in
the local `artifacts/outcome-phase2/` run directory; they are not bundled into Git source.
The compact JSON records reviewed observations without local filesystem paths.

## What the experiment exposed

- The optional USDT-introduction wait could retain an element that reported displayed after
  dismissal. A failure screenshot showed Home while the old lookup still reported visible.
  Another setup failure still showed the introduction. The helper now resolves the target
  afresh and, on Android, waits for an enabled target at stable bounds before its one tap.
- Removing swipe delays exposed a moving-page race on Android: the next gesture could start
  before the visible destination had finished moving. Swipe outcomes now require matching
  destination bounds on consecutive observations.
- The iOS wrong-amount control retained a partial hierarchy observation. Its screenshot
  confirmed amount 1; the missing expected amount still caused the correct failure. This
  diagnostic limitation is retained explicitly in the JSON evidence.

Earlier exploratory failures and interrupted comparisons are retained locally. Their sources
or protocol differed, so they are excluded from the final timing comparison. Recovery is not
counted as a first-attempt pass.

## Send follow-up

The [larger Send comparison](outcome-send-results.md) used newly built, pinned master apps and
ten attempts per variant per platform. Its results were mixed, so Send remains opt-in and the
production gate is unchanged. The earlier results above are not pooled with that sample.

## Remaining iOS gate migration

Preserve case IDs, tags, fixtures and existing assertions. Add observable outcomes, execute
each interaction once, and validate the shared specifications on both platforms. Keep this
draft until migration and its required runtime validation are complete.

- [ ] `send_1`: manual payment-input validation.
- [ ] `send_2`: receive funds and pay different invoices.
- [ ] `send_3`: regular invoices with msat precision.
- [ ] `lightning_1`: receive and send Lightning payments.
- [ ] `lnurl_1`: channel, pay, withdraw, auth and msat precision.
- [ ] `boost_1`: CPFP.
- [ ] `boost_2`: RBF.
- [ ] `multi_address_3`: address types, change and RBF.
- [ ] `multi_address_4`: external channel funding while retaining Legacy funds.
- [ ] `transfer_2`: open a channel to an external node.
- [ ] `hardware_wallet_1`: connect, rename, show and remove a Trezor emulator wallet.
- [ ] `hardware_wallet_2`: receive on-chain funds to a hardware wallet.
- [ ] `hardware_wallet_4`: send on-chain funds from a hardware wallet.

These are the 13 active cases selected by the current `@ios_gate` policy.
`hardware_wallet_3` is explicitly skipped and is not included as migrated coverage.
The dedicated Receive form and onboarding cases remain local pilot examples here; they are
outside that gate set.

[Reproduction instructions](outcome-pilot.md)
