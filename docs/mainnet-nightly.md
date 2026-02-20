# Nightly integration contract

`bitkit-e2e-tests` is the public source of test code.
It should stay environment-agnostic and orchestration-agnostic.

The private companion repository (`bitkit-nightly`) is responsible for running these tests on schedules and with private configuration.

## Repository responsibilities

`bitkit-e2e-tests` owns:

- test specs and helper utilities
- test tags used for selective execution
- generic runtime contracts (required env vars, backend mode expectations, app artifact location)

`bitkit-nightly` owns:

- workflows, schedules, retry policy, and runner setup
- secrets, private receiver endpoints, and seed material
- logs, screenshots, videos, and diagnostics retention

## Execution model

- tests are selected by tags (for example via `--mochaOpts.grep`)
- orchestration repo maps tags to matrix shards
- each shard should run independently and be safe to retry
- tests should not hardcode CI-only assumptions; those belong in workflow env config

## Runtime interface between repos

To execute native E2E tests from an external orchestrator:

- set platform/backend env vars expected by WDIO and helpers
- provide app artifact in `aut/` — default `bitkit_e2e.apk` (Android) / `Bitkit.app` (iOS). Override with `AUT_FILENAME` (e.g. `bitkit_rn_regtest.apk`)
- provide all secrets required by the selected tag(s)
- pass grep/tag filters via CLI args, not by editing spec files

## Adding or changing nightly coverage

1. Add/update spec(s) and tags in `bitkit-e2e-tests`.
2. Keep secret names and environment contract explicit in spec validation.
3. Update `bitkit-nightly` matrix/env wiring to include the new tags.
4. Run a manual dispatch in `bitkit-nightly` before relying on schedule.
