# Inventory and reporting rollout (#264)

The versioned `test/inventory.json` accounts for each source case on iOS and Android,
including setup utilities, conditionally registered migrations, currently skipped
cases and unsupported automation. It describes intended coverage, not proof that all
nightly jobs currently exist. A `gap` remains incomplete coverage; an inventory check
passing means the inventory is consistent with source, not that the tests passed.

Run `npm run inventory:check` with Node 22.18+ or Node 24. Discovery reads TypeScript
syntax without importing specs or executing hooks, and is independent of CI greps.
Case titles start with one stable `@case_id`. Literal templates can interpolate
finite loop values or literal factory arguments in that ID. Unknown dynamic IDs,
untagged cases, duplicate IDs and focused tests fail validation. Keep each new/renamed
case and its two platform assignments in the same change. Cases must be declared
with `ciIt`/`it` rather than aliases or computed registration functions.

The initial destinations retain iOS remote-regtest UI, local money/mining and
hardware jobs, Android local UI/money and staging hardware, staging Pubky/Paykit,
migration variants and private mainnet orchestration. `settings_10` and `onchain_3`
need local execution on both platforms. Mainnet iOS support and currently skipped
cases are explicit gaps linked to #264, not invented platform exemptions.
Fixture flags in the manifest are requirements, not secrets or actual fixture values.
Migration source/target versions must be supplied in each run's `E2E_VARIANT`.

## Opt-in execution

Existing invocations and gates keep their current selectors and verdicts. Reporting
is enabled only when `E2E_PLAN` points to a prepared plan. Use a fresh directory for
each run; plans and worker files cannot overwrite an earlier run. For example:

```sh
export PLATFORM=ios
export BACKEND=regtest
export E2E_RUN_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-ios-smoke"
export E2E_APP_SHA='<tested 40-character app commit>'
export E2E_ARTIFACT_DIGEST='<SHA-256 of the matching app archive>'
export E2E_BACKEND_REVISION='regtest:stag0'
export E2E_VARIANT='default'
export E2E_PLAN="$PWD/artifacts/reporting/plan.json"
node --experimental-strip-types scripts/e2e-inventory.ts plan \
  --platform ios --backend regtest --pack core-ui --plan "$E2E_PLAN"
BACKEND=regtest ATTEMPT=1 ./ci_run_ios.sh \
  --mochaOpts.grep "$(cat artifacts/reporting/grep.txt)"
# Run even when the runner failed. The report command exits nonzero on incomplete coverage.
node --experimental-strip-types scripts/e2e-inventory.ts report --plan "$E2E_PLAN"
```

Retain the plan, worker JSON and summary files alongside failure diagnostics. The
report checks exact case IDs, source/build/backend/run identity, missing workers or
cases, unexpected skips, duplicate execution and interrupted runs. Runner failure
after passing cases (including teardown failure) still fails the report. JSON keeps
per-case timing and attempt history; Markdown can be appended to the Actions summary.
These are test execution durations, not billed Mac/Linux usage.

One attempt is the default. An explicit `E2E_MAX_ATTEMPTS` of 2 or 3 allows a bounded
retry policy; recovered failures remain visible. Inventory-enabled runs bypass the
legacy `/tmp/lock` mechanism and rerun selected cases. A receipt from another night,
source, build, backend or migration variant cannot satisfy the current plan. Existing
non-inventory invocations retain their legacy retry behavior.

`--pack nightly` selects all applicable obligations for one platform/backend,
including known gaps. It is a building block for the later full-nightly orchestration;
it neither starts a schedule nor declares a platform's whole nightly complete. That
orchestrator must reconcile every required backend/job/variant and detect a missing
scheduled batch. It must run on both platforms every night even for unchanged inputs.
An empty selection fails rather than becoming an empty green run.

## Stages

1. Land the inventory/reporting producer and its validation checks first.
2. Add the iOS smoke workflow in shadow using the producer's companion branch or a
   revision containing these files. Keep the current required gates and schedules.
3. Measure real smoke duration, concurrent-run isolation and first-pass reliability
   before proposing any required-check change. The iOS two-shard pilot, automatic PR
   risk selection and full nightly orchestration remain separate stages.

No ruleset change or existing check-name replacement is part of these first stages.

## Shadow smoke producer

The `smoke` pack contains three fresh-wallet regtest cases: `smoke_wallet_1`
(Home), `smoke_receive_1` (receive QR address and exact entered amount), and
`smoke_onchain_1` (fund and send). The payment oracle queries Electrum directly,
recomputes transaction IDs from raw transactions, checks the exact recipient and
amount, and requires the outgoing payment to spend this case's funding transaction.
A fresh recipient prevents another concurrent run's payment from satisfying the
assertion. The oracle uses bounded requests and stores raw transaction evidence.
These cases do not match the existing `@ios_gate` or Android feature selectors.

The iOS consumer is `.github/workflows/e2e-smoke-shadow.yml`. Land this producer
before enabling that workflow; for paired branches, use the same branch name in
both repositories. A missing producer fails visibly. Reporting remains opt-in:
existing automatic gates and schedules continue unchanged. This stage does not
activate full nightly coverage, risk packs or the two-shard experiment.
