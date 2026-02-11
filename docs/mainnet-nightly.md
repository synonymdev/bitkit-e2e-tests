# Mainnet nightly consumption

`bitkit-e2e-tests` is intentionally source-only for mainnet smoke coverage.

Private orchestration (workflows, secrets, logs, artifacts) should live in `bitkit-nightly`.

## Current smoke specs

- `test/specs/mainnet.strike.e2e.ts` (active)
- `test/specs/mainnet.cjit.e2e.ts` (skipped placeholder for phase 2)

## Tag-driven selection

Private orchestration should prefer tag-based filtering over hardcoded single-spec execution.
In `bitkit-nightly`, grep patterns are hardcoded in a matrix so test targets can be parallelized.

Recommended grep patterns:

- strike only: `@strike_mainnet`
- cjit only: `@cjit_mainnet`
- wos only: `@wos_mainnet`

## Mainnet execution contract

- set `BACKEND=mainnet`
- provide `APP_ID_ANDROID=to.bitkit`
- provide test-specific seed variables:
  - `STRIKE_SEED`
  - `WOS_SEED`
  - `CJIT_SEED`
- provide release APK at `aut/bitkit_e2e.apk` (or set `NATIVE_APK_PATH`)
