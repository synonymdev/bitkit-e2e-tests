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

## Practical Tips

- The tests expect built artifacts in `./aut`.
- Use `ciIt()` in specs (not `it()`) to enable CI retry-skipping behavior.
- Keep Android/iOS platform differences behind helpers in `test/helpers/`.
