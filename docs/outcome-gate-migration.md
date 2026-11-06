# Action/outcome iOS gate migration

This branch is stacked on the selector pilot in #296. It migrates the existing thirteen
active `@ios_gate` cases; it does not enable OCR or change the app.

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
