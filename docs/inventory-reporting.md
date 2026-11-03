# iOS E2E selection and reporting

Issue: https://github.com/synonymdev/bitkit-e2e-tests/issues/264

The iOS `e2e-tests.yml` entry point owns PR selection, manual validation and the nightly schedule. Existing staging and migration workflows are reusable execution lanes. There is no shadow gate. Android workflow triggers, test selection, backend assignments and legacy retry behavior remain unchanged.

## PR selection

Every iOS app-code PR starts with these existing cases, unchanged:

- `send_1`, `send_2`, `lightning_1`, `transfer_2`, `boost_2`.

`scripts/ci-selection.cjs` adds cases by changed path. Hardware adds active hardware tests; LNURL adds its case; address/coin-selection adds multi-address, on-chain and boost tests; fees add boost/on-chain/send; onboarding/backup/recovery adds its tests and migration; security adds security and payment checks; Pubky/Paykit/profile/contact changes add the staging pack; receive/send/lightning/settings/widgets add the corresponding cases. Rules are additive and IDs are deduplicated.

Shared services, repositories, models, dependencies, build/CI configuration, USDT changes and unclassified code paths select all applicable local, staging and migration packs. Both sides of renamed files are considered. Documentation-only changes skip device jobs. The selection artifact records the tested app SHA, E2E SHA, cases, reasons, lanes and explicit coverage gaps.

PRs stacked on another branch retain the existing automatic exclusion. Manual dispatch with `pr` checks the PR's current merge against its actual base/head, including stacked PRs. The workflow source is the branch selected for dispatch. `selection=auto` uses the PR diff; `base` runs the five cases; `full` runs all applicable lanes. Automatic PRs cannot narrow selection with a manual input.

## Nightly

The main iOS workflow runs nightly at 03:00 UTC, without a changed-revision shortcut:

| Lane | Active existing cases |
| --- | --- |
| Local | 42: all core UI, local money, on-chain, multi-address and active hardware cases |
| Staging | 6: `pubky_profile_1` through `pubky_profile_5`, `paykit_1` |
| Migration | 6: native restore/upgrade, RN restore/upgrade, passphrase and legacy-address migration |

The 54 cases use the appropriate local or remote-regtest build and fixtures. Migration setup entries are fixtures, not extra regression passes. Five existing skipped cases and six unsupported iOS mainnet cases remain explicit gaps; the interactive Lightning payment utility remains manual. This does not invent missing USDT, allowance or subscription automation.

## Attempts and evidence

`scripts/ci-run.ts` prepares a plan tied to the actual E2E checkout, selected app SHA, downloaded artifact digest, platform, backend, variant and run identity. Selection rejects unknown, skipped or wrong-backend cases. Only selected spec files load.

A run permits up to three attempts and stops after the first runner exit-zero with exact complete case coverage. Each attempt retains worker events, process outcome and timing. The local/staging wrapper owns retries; migration keeps its existing per-attempt prepared-wallet setup and invokes the same wrapper one attempt at a time. An inventory-enabled attempt reruns the complete selected pack, avoiding dependence on the machine's legacy `/tmp/lock`. Android's non-inventory execution retains its existing retry locks.

A recovered failure is reported as a recovery, with the first failed/missing case results and earlier errors retained. Missing reports, setup/teardown errors, incomplete workers, unexpected skips, stale identities or a nonzero final runner cannot produce a pass. The parent `e2e-status` requires every selected local/staging/migration job and build to succeed.

## Cost controls and manual validation

Automatic runs use one local shard. Only manual dispatch can request two, partitioned by spec so a spec's fixture lifecycle stays together. Namespace supplies a separate Mac and backend instance per shard; every shard destroys its backend in cleanup. The local app is built once and reused. Staging and migration share one remote-regtest app build in the combined run. Builds have a 40-minute limit; execution jobs 135 minutes; individual runner attempts 40 minutes. Artifacts are retained for seven days and superseded runs cancel.

Compare `selection=full, shards=1` and `selection=full, shards=2` on the same app and E2E revisions. Inspect elapsed/build/setup/test time, first-pass success and billed Mac plus backend usage. Two shards are an experiment, not an assumed cost saving or a new automatic default.

Merge the E2E producer before the iOS consumer. Before merging, dispatch the existing iOS workflow from the development branch and explicitly select the E2E development branch. Validate base/full/automatic selection, failures/recovery and the optional shard experiment. The default branch's gate stays intact until the consumer is merged. No parallel shadow workflow is installed.

## Local checks

```sh
npm run inventory:check
npm run test:reporting
npx tsc --noEmit
```

The CLI workflow tests use controlled runner fixtures; they are not evidence that hosted Appium journeys passed. Actual hosted measurements and device results must name their revisions and environments.
