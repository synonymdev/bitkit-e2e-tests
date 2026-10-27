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

## Suite-specific docs

- `docs/mainnet-probe.md` — Lightning probe suite (`@probe_mainnet`): `PROBE_*` env var reference, artifacts, and local-run instructions.

## Blocktank sunset smoke

`test/specs/mainnet/blocktank-sunset.e2e.ts` (`@blocktank_sunset_mainnet`) replaces the retired CJIT invoice and channel-order pricing smoke tests. It runs on Android mainnet builds with geocheck enabled, using a fresh empty wallet for every case. It requires no seed or funds and never submits a payment, order, or channel request.

Coverage:

- Settings → Lightning Connections → add connection: automatic funding remains unavailable, Manual Setup opens with node/host/port fields, and the wallet remains accessible. In `legacy` mode, tapping Transfer from Savings in an empty wallet must show the existing No Available Funds dialog, which is cancelled; in `manual` mode the same tap must be inert. The overlapping Android nodes share `FundTransfer`, so their `enabled` accessibility flag is not used as a transfer-availability assertion.
- Receive → Spending → Receive Lightning funds: the unavailable screen appears instead of a CJIT quote, can be dismissed/reopened, and leads to Manual Setup.
- Receive on-chain: a mainnet native SegWit address remains available without a Lightning channel.

Set `BLOCKTANK_SUNSET_UI=legacy` (default) for 3.0.1's country-blocked UI, or `BLOCKTANK_SUNSET_UI=manual` for the sunset UI introduced by Android #1696. The latter also requires the explanatory copy, Learn More actions, and disabled hardware-wallet funding option. Expectations do not auto-detect the UI, so a missing sunset screen cannot pass as an older build. Geocheck must return blocked; E2E builds that bypass it are unsuitable for this suite.

Example against a compatible APK in `aut/bitkit_e2e.apk`:

```sh
BACKEND=mainnet APP_ID_ANDROID=to.bitkit BLOCKTANK_SUNSET_UI=legacy \
  npm run e2e:android -- --mochaOpts.grep '@blocktank_sunset_mainnet'
```

The nightly orchestrator selects this tag in its own shard. Land these specs before changing the nightly matrix. The suite does not cover funded Savings/Spending transfer-button entry points, hardware devices, or iOS; those need their own fixtures and validation. Existing-channel payment/probe coverage remains separate.

## Adding or changing nightly coverage

1. Add/update spec(s) and tags in `bitkit-e2e-tests`.
2. Keep secret names and environment contract explicit in spec validation.
3. Update `bitkit-nightly` matrix/env wiring to include the new tags.
4. Run a manual dispatch in `bitkit-nightly` before relying on schedule.
