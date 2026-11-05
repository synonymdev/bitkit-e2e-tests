# iOS E2E selection and reporting

Issue: https://github.com/synonymdev/bitkit-e2e-tests/issues/264

The iOS `e2e-tests.yml` entry point owns PR selection, manual validation and the nightly schedule. Staging is reusable. The independent `e2e_migration.yml` workflow owns its schedule, release pushes, app build and result. There is no shadow gate. Android workflow triggers, test selection, backend assignments and legacy retry behavior remain unchanged.

## PR selection

Every iOS app-code PR starts with these existing cases, unchanged:

- `send_1`, `send_2`, `lightning_1`, `transfer_2`, `boost_2`.

The iOS repo owns `.github/e2e-policy.json`, its selector and policy tests. Its tested app checkout supplies the policy; this repository supplies only the case inventory and execution/reporting. Change iOS paths and their policy together in the same PR. See [iOS policy documentation](https://github.com/synonymdev/bitkit-ios/blob/master/Docs/e2e-ci.md).

Feature directories and explicit service/model/helper files add only their relevant existing cases. For example, widget services add widget cases, Paykit services add staging, and backup services add recovery coverage. Only named shared wallet/lifecycle dependencies and build/orchestration configuration select every PR-eligible local and staging case. There is no blanket Services/Models/Managers/Utilities rule.

Cheap iOS validation checks all tracked paths, stale policy entries and referenced case IDs. Unknown paths fail with an actionable policy-update error before paid builds. Old and new rename paths contribute coverage from the base and tested policies, so a refactor cannot silently drop coverage. Documentation/native-test/policy-only changes skip device jobs. Selection records cases, reasons, app/E2E/policy identity and explicit gaps. USDT-specific paths retain the Bitcoin base gate and report the lack of existing USDT E2E coverage; unrelated Bitcoin tests do not establish USDT correctness.

PRs stacked on another branch retain the existing automatic exclusion. Manual dispatch with `pr` checks the PR's current merge against its actual base/head, including stacked PRs. The workflow source is the branch selected for dispatch. `selection=auto` uses the PR diff; `base` runs the five cases; `full` runs all applicable local and staging cases. Migration runs nightly and after each push to an iOS `release-*` branch. Manual E2E dispatches use local and staging cases. Automatic PRs cannot narrow selection with a manual input.

## Nightly

Two separate iOS workflows run each night at 03:00 UTC:

| Lane | Active existing cases |
| --- | --- |
| Local | 42: all core UI, local money, on-chain, multi-address and active hardware cases |
| Staging | 6: `pubky_profile_1` through `pubky_profile_5`, `paykit_1` |
| Independent migration workflow | 6: native restore/upgrade, RN restore/upgrade, passphrase and legacy-address migration |

The 54 cases use the appropriate local or remote-regtest build and fixtures. Migration setup entries are fixtures, not extra regression passes. Five existing skipped cases and six unsupported iOS mainnet cases remain explicit gaps; the interactive Lightning payment utility remains manual. This does not invent missing USDT, allowance or subscription automation.

## Attempts and evidence

`scripts/ci-run.ts` prepares a plan tied to the actual E2E checkout, selected app SHA, downloaded artifact digest, platform, backend, variant and run identity. Selection rejects unknown, skipped or wrong-backend cases. Only selected spec files load.

Local and staging jobs expose `Run E2E Tests 1`, `2`, and `3` as separate workflow steps. Each invokes `scripts/ci-run.ts attempt` once; later steps run only after failure. The established `ciIt()` pass locks skip cases already passed, so only failed or uncompleted cases repeat. Inventory-enabled locks live beside the current run plan and are rebuilt from verified worker results before each attempt; stale machine locks and passes from failed hooks or interrupted workers cannot skip work. Android keeps its existing `/tmp/lock` behavior. Migration remains independent and keeps its per-attempt prepared-wallet setup.

The final report combines selected cases passed across these attempts. It requires the last runner to exit successfully and every selected case to have a verified current-run pass. All three failed attempts produce a failed job despite the attempts using `continue-on-error`. Each attempt retains worker events, process outcome and timing.

A recovered failure is reported as a recovery, with the first failed/missing case results and earlier errors retained. Missing reports, setup/teardown errors, incomplete workers, unexpected skips, stale identities or a nonzero final runner cannot produce a pass. The parent `e2e-status` requires every selected local or staging job and build to succeed. The migration workflow reports its own result.

## Cost controls and manual validation

Automatic runs use one local shard. Only manual dispatch can request two, partitioned by spec so a spec's fixture lifecycle stays together. Namespace supplies a separate Mac and backend instance per shard; every shard destroys its backend in cleanup. The local app is built once and reused. Staging and the independent migration workflow each use their own network build. Builds have a 40-minute limit; execution limits depend on the selected pack as described below. iOS build and diagnostic artifacts, including migration preparation logs, are retained for seven days; prepared wallet environments expire after one day. The shared preparation workflow preserves repository-default diagnostic retention for consumers that omit its optional override. Superseded runs cancel.

Compare `selection=full, shards=1` and `selection=full, shards=2` on the same app and E2E revisions. Inspect elapsed/build/setup/test time, first-pass success and billed Mac plus backend usage. Two shards are an experiment, not an assumed cost saving or a new automatic default.

Merge the E2E producer before the iOS consumer. Before merging, dispatch the existing iOS workflow from the development branch and explicitly select the E2E development branch. Validate base/full/automatic selection, failures/recovery and the optional shard experiment. The default branch's gate stays intact until the consumer is merged. No parallel shadow workflow is installed.

## Local checks

```sh
npm run inventory:check
npm run test:reporting
npx tsc --noEmit
```

The CLI workflow tests use controlled runner fixtures; they are not evidence that hosted Appium journeys passed. Actual hosted measurements and device results must name their revisions and environments.

Local shards with 6–30 cases allow 90 minutes per attempt within a 285-minute job and five-hour backend expiry. Larger shards allow 110 minutes per attempt within a 345-minute job and six-hour backend expiry. Both sizes allow three attempts. Base-sized local selections retain 40-minute attempts and a 135-minute job; the six-case staging pack also uses 90-minute attempts within 285 minutes. Individual migration cases retain 40-minute attempts and 135-minute jobs. The iOS selector owns these budgets and the shared runner seals its attempt limit into the run plan. Limits are ceilings, not reservations: success stops retries and cleanup destroys the backend immediately.

RN passphrase migration verifies the exact restored passphrase and the funded RN source balance before installing the native target. Native verification dismisses the optional USDT introduction before asserting balances, history, tags and persistence after relaunch. A malformed fixture or blocked screen remains a failure; neither is reported as a successful migration.
