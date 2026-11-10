# Action/outcome iOS gate migration

This branch is stacked on the shared selector helpers in #296. It migrates the existing thirteen
active `@ios_gate` cases; it does not enable OCR or change the app.

The local experiment harness and comparison reports are preserved at their
[historical commit](https://github.com/synonymdev/bitkit-e2e-tests/tree/96d6fcabea2ad3b86c223299c2f83d057c8806d3).
The merge payload keeps the reusable helpers and production test migration.

| Cases | Coverage retained |
| --- | --- |
| `send_1` | Empty/invalid/wrong-network/unfunded/expired recipients, over-limit rejection and BIP21 amounts |
| `send_2` | Onchain, Lightning, unified invoice routing/fallback, funding-source selection, max/reserve, quickpay, balances/history |
| `send_3` | All three msat rounding boundaries and sent history |
| `lightning_1` | Receive/send, notes/tags/filters, backup/restore and channel closure |
| `lnurl_1` | Channel, pay boundaries/comment, withdraw, msat pay/withdraw pairs and authentication |
| `boost_1`, `boost_2` | CPFP/RBF fee and transaction relationships, activity, restore and confirmation |
| `multi_address_3`, `multi_address_4` | Four address fixtures, change/RBF, max channel funding and preserved Legacy funds |
| `transfer_2` | External channel funding, payment and transfer back to savings |
| `hardware_wallet_1`, `_2`, `_4` | Pair/rename/remove, receive and send/tag/balances |

The existing skipped cases remain skipped. Existing backend fixtures and financial/history
assertions remain. `send_1` uses the shared pilot validation flow; its toast and disabled-button
assertions now run inside the action's outcome. Over-limit Send/LNURL input and boost toast
assertions likewise run inside the triggering action rather than retyping/reconfirming after
a missed observation. The RBF restore icon assertion is now awaited.

Ordinary UI waits are 30 seconds in local and CI configurations, including verified input
clearing. Domain balance, channel, backup and hardware approval waits retain their own budgets.
Actions execute once; the outcome predicate only reads fresh selectors. LNURL authentication
observes the exact `Signed In` confirmation inside its action: XCTest's idle and animation
waits are temporarily bypassed for that step, then restored to their exact prior values. The
iOS configuration explicitly declares the existing native defaults (10/2 seconds) so the
driver can report them for restoration; the ordinary UI wait remains 30 seconds. Existing fixture
recovery (for example fetching a Lightning invoice) is kept separate from payment submission.

## Comparison protocol

Run the ordinary configuration with `--mochaOpts.grep '@ios_gate'` on a disposable local iOS
simulator, with `BACKEND=local` and Trezor enabled. Record the exact E2E/app commits, Node,
Xcode/runtime, service inputs and per-case outcomes. Preserve failed attempts and their evidence.

Dispatch `synonymdev/bitkit-ios`'s `e2e-tests.yml` with this E2E branch and app commit
`8c1149be80a5488ea00da159779ca12706b99b10`, matching existing passing reference run
[42201867907](https://github.com/synonymdev/bitkit-ios/actions/runs/42201867907).
Use the existing run logs as the baseline; do not rerun them. Compare all thirteen first-attempt
results, later retry recoveries, failures and case durations. A green job alone is insufficient
because the workflow uses `continue-on-error` and retries only cases that have not passed.

Local Xcode 26.0.1 / iOS 26.0 differs from CI's iOS 26.5 environment; local versus CI wall time
is not a controlled speed measurement. This migration also standardizes waits to 30 seconds,
so any change in reliability cannot be attributed solely to action/outcome structure.

## Boost and Lightning follow-up

iOS transient confirmations share LNURL's scoped XCTest settings: the existing idle and
animation timeouts are saved, bypassed around the single confirm gesture and required toast
observation, then restored exactly, including failure paths. Persistent confirmations and
Android gestures retain their existing policy. A replacement notification can interrupt the
Boost success toast; observing a successful transaction alone never substitutes for that toast.

Android Lightning1 waits for a generated Lightning QR different from the invoice already paid,
paired with an enabled Edit control in the same visible pager page. Two matching fresh samples
include the URI, native identities and geometry, so same-position subtree replacement resets
readiness. The two activity-filter tag selections similarly await stationary enabled targets.
Each interaction executes once; a missing destination still fails. Existing invoice, balance,
tag, history, restore and channel assertions remain intact. UI waits remain 30 seconds.

The original Android app (`ebe9bc0`) has a separate activity publication race. The original activity receives the new
fee and Boosting state before the replacement activity is published. A test can therefore open
the original TXID and remain on its Removed from Mempool detail. The home row exposes an index,
not transaction identity; fee, icon and geometry cannot reliably distinguish the replacement.
This follow-up does not claim to fix that native/test observability gap or replace the existing
Boosted/status/fee/TXID assertions with a delay. Retain first failures and distinguish successful
targeted reruns from evidence of a durable reliability improvement.

## Integration after updating the stack

The stack includes E2E main `265a050`, retaining its late-introduction recovery, authenticated
regtest helpers and removal of obsolete skipped Blocktank cases. All thirteen active iOS gate
cases remain. Foundation #296 stays below this migration; merge it first, then retarget #298 to `main`.

Android fixes #1808 and #1813 are merged. The final integration run uses app master `176430965`,
which includes both fixes, for Send2, Boost2 and Lightning1. The complete iOS gate uses app master
`10231d9e`. Both use local backends, 30-second ordinary UI waits and the final pinned E2E candidate.
Record their actual results in #298; keep it draft during validation. These runs validate integration
with current apps and do not replace the historical six-run comparison or establish a new speed
or reliability cohort. Staging funding health is outside these local-backend runs.
