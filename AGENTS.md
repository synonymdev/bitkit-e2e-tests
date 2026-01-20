# AGENTS.md

This file provides guidance to AI agents (Codex/Claude/Cursor/WARP) working in this repository.

## Purpose

Bitkit E2E tests for:

- **bitkit-android** (native Android app)
- **bitkit-ios** (native iOS app)

For local work, keep `bitkit-e2e-tests`, `bitkit-android`, and `bitkit-ios` checked out in the same parent directory.

## Key Paths

- `aut/` — built app artifacts used by tests (`bitkit_e2e.apk`, `Bitkit.app`)
- `artifacts/` — screenshots/videos/logs from test runs
- `test/specs/` — E2E specs
- `test/helpers/` — helper utilities (selectors, actions)
- `wdio.conf.ts` — WebdriverIO/Appium config

## Local Build Helpers

Android (builds from `../bitkit-android`, copies APK to `./aut/bitkit_e2e.apk`):

```bash
./scripts/build-android-apk.sh

# backend selection (local is default)
BACKEND=regtest ./scripts/build-android-apk.sh
```

iOS (builds from `../bitkit-ios`, copies app to `./aut/Bitkit.app`):

```bash
./scripts/build-ios-sim.sh

# backend selection (local is default)
BACKEND=regtest ./scripts/build-ios-sim.sh
```

Notes:

- `BACKEND=local` uses local Electrum (default).
- `BACKEND=regtest` sets network Electrum against regtest.

## Running Tests

**Important:** The `BACKEND` env var controls which infrastructure the tests use for deposits/mining:

- `BACKEND=local` (default) — Uses local docker stack (Bitcoin RPC on localhost:18443, Electrum on localhost:60001). Requires `bitkit-docker` running locally.
- `BACKEND=regtest` — Uses Blocktank API over the internet (remote regtest infrastructure).

**The `BACKEND` must match how the app was built:**

- Apps built with `BACKEND=local` connect to localhost electrum → run tests with `BACKEND=local`
- Apps built with `BACKEND=regtest` connect to remote electrum → run tests with `BACKEND=regtest`

```bash
# Android (local backend - default)
npm run e2e:android

# Android (regtest backend - for apps built with BACKEND=regtest)
BACKEND=regtest npm run e2e:android

# iOS
npm run e2e:ios
BACKEND=regtest npm run e2e:ios
```

Run a single spec:

```bash
npm run e2e:android -- --spec ./test/specs/onboarding.e2e.ts
BACKEND=regtest npm run e2e:android -- --spec ./test/specs/migration.e2e.ts
```

Run by tag:

```bash
npm run e2e:android -- --mochaOpts.grep "@backup"
BACKEND=regtest npm run e2e:android -- --mochaOpts.grep "@migration"
```

## CI Helper Scripts

These wrap the `npm run e2e:*` commands and capture logs/artifacts:

```bash
# Local backend (default)
./ci_run_android.sh
./ci_run_ios.sh

# Regtest backend
BACKEND=regtest ./ci_run_android.sh
BACKEND=regtest ./ci_run_ios.sh
```

## CI Branch Selection (bitkit-android / bitkit-ios)

The app repos call a shared workflow in this repo to decide which `bitkit-e2e-tests` branch to use:

```yaml
e2e-branch:
  if: github.event.pull_request.draft == false
  uses: synonymdev/bitkit-e2e-tests/.github/workflows/determine-e2e-branch.yml@main
  with:
    app_branch: ${{ github.head_ref || github.ref_name }}
    e2e_branch_input: ${{ github.event.inputs.e2e_branch || 'default-feature-branch' }}
```

Resolution rules (from `determine-e2e-branch.yml`):

- `e2e_branch_input=main` -> use `main`.
- `e2e_branch_input=default-feature-branch` -> use the same branch name as the app repo _if it exists_ in `bitkit-e2e-tests`, otherwise fall back to `main`.
- `e2e_branch_input=<custom>` -> use that branch only if it exists; otherwise the workflow fails.

Implication for feature work:

- If a feature branch exists in `bitkit-android` or `bitkit-ios`, you can create a same-named branch in `bitkit-e2e-tests` to update/add tests.
- It's expected that E2E might fail against the app branch before the matching e2e branch is created/updated.
- When analyzing failures in the app repos, always check which e2e branch was resolved by the `e2e-branch` step.

## CI Retry + Reporting (app repos)

- The app repos run E2E three times (e.g. "Run E2E Tests 1/2/3").
- Retries rely on `ciIt()` (see `test/helpers/suite.ts`): on CI it records passing tests in `/tmp/lock` and skips them on subsequent attempts, so only failed tests re-run.
- Those E2E steps are marked `continue-on-error: true`, so the job can still show green. If attempt 3 fails, it implies the test failed in attempts 1 and 2 as well (only failures are re-run). Check logs/artifacts to confirm.

## Practical Tips

- The tests expect built artifacts in `./aut`.
- Use `ciIt()` in specs (not `it()`) to enable CI retry-skipping behavior.
- Keep Android/iOS platform differences behind helpers in `test/helpers/`.
