# USDT E2E setup

Use the existing staging Bitcoin/Paykit build, with USDT execution on the isolated Arbitrum fork. VSS, LNURL auth, Pubky and rate services remain on their existing staging configuration. No real USDT is needed.

## Start the shared fixture

The launcher consumes the exact `bitkit-docker` commit in `USDT_INFRA_REVISION`. Its shared services and test controls live there; this repository owns the Appium journeys and SDK peer.

```bash
./scripts/usdt-fixture setup
# Private env file with ARBITRUM_RPC_URL=https://... (archive access to the pinned fork block).
USDT_TEST_ENV_FILE=/absolute/path/to/private.env ./scripts/usdt-fixture run
```

Keep that process running. In another shell:

```bash
eval "$(./scripts/usdt-fixture env)"
BACKEND=regtest ANDROID_ROOT=/path/to/bitkit-android ./scripts/build-android-apk.sh
BACKEND=regtest IOS_ROOT=/path/to/bitkit-ios ./scripts/build-ios-sim.sh
```

Both app revisions must include USDT support (iOS #884 / Android #1432 or their descendants). Android embeds `USDT_*` through existing Gradle settings; iOS embeds them through the build helper, preserving them on reinstall and relaunch. The normal default branches need not expose USDT yet. Build and run with the same endpoints and `BACKEND=regtest`.

For Android, set `ANDROID_SERIAL` to a dedicated test emulator. `prepareUsdtFixture()` installs its gateway port reverse. iOS uses host loopback directly. Do not reuse a funded mainnet app or reset another test suite's device.

## Helpers for journeys

`test/helpers/usdt.ts` provides:

- `prepareUsdtFixture()` checks the live fixture and selected endpoints.
- `fundUsdt(address, '10')` executes a real incoming token transfer.
- `usdtBalance(address)` returns exact atomic units; one USDT is 1,000,000 units.
- `setUsdtBundling('manual')` holds new operations pending; use the `bundle` command to include them.
- `setUsdtProvider(...)` controls unavailable, expired and invalid-signature failures. Restore `healthy` in cleanup.
- `mineUsdtBlocks()` advances history scanning after a transfer.

Keep using `ciIt`, onboarding, backup, polling and navigation helpers. Use exact on-chain deltas for payment assertions; the displayed fiat value uses the existing live rate feed. For backup tests, use the existing real VSS upload/restore helpers and preserve fixture state across the reinstall. `./scripts/usdt-fixture reset` is only for independent scenarios with matching app/peer resets; it also clears the bundler's pending operations.

Record passing journeys with `RECORD_VIDEO=true SAVE_DIAGNOSTICS=true`. USDT specs should be opt-in and require the fixture; do not add them to existing staging tags until their matching app builds and infrastructure startup are configured in CI. CI must inspect the final attempts/artifacts, not only a job with `continue-on-error`.

## Coverage handoff

1. Direct receive/send: zero-ETH first operation, subsequent sends, exact recipient/fee deltas, activity and details.
2. Contact payments and requests: USDT-only/mixed endpoints, quoted BTC/USD conversion, endpoint restrictions, same-asset and rail rates, underpayment and late payment display.
3. Subscriptions: Bitkit's single-currency-family creation and external billing-period proofs.
4. Failure/recovery: quote expiry, invalid signatures, held inclusion, lost response, restart and VSS restore without double payment.
5. Purchases: use the compatible Paykit Server/Locks mixed profile in `bitkit-docker`; both verifier and app must use this fork.
6. Bridges: use local provider/relay scenarios and label their simulation boundary. Production operator delivery/refunds remain live acceptance.

Most request cases can use one app plus the real SDK peer. Use a smaller iOS/Android pairing for interoperability. Avoid replicating every arithmetic/proof validation unit case through the UI.

## Controlled Paykit peer

The existing [fixture sender](../tools/paykit-fixture-sender/README.md#usdt-and-recurring-journeys)
now supports USDT-only/mixed endpoints, fixed or per-period recurring quotes,
payment deadlines, accepting incoming requests, submitting existing proofs and
exporting authenticated received evidence for Core verification. Build it with
`cargo build --locked --manifest-path tools/paykit-fixture-sender/Cargo.toml`.
Use only dedicated peers connected to this fork; an unrelated staging wallet or
server will query a different chain and cannot verify these payments.

The infrastructure smoke suite verifies local execution and proof cryptography.
It does not run the full mobile, VSS, Shop or bridge journeys. Those are the tests
Piotr should add using the matrix above. The shared fixture docs record the
Anvil/Alto validation limits and Shop container routing requirements. Bridge
operator/relay scenario servers still need to be supplied by the bridge tests;
the gateway's local-provider configuration is the seam for them.

For an initial manual device check, reuse onboarding and open the USDT wallet:
`UsdtBalance`, `UsdtReceiveDetails` and `UsdtReceiveAddress` identify the receive
view on both platforms. Fund that address through `fundUsdt`, then use the
existing `UsdtAmount`, `UsdtReview`, `UsdtConfirm` and `UsdtSendSuccess` selectors.
Assert the recipient's chain balance and recorded fee as well as the UI. Preserve
the same fork and peer through app relaunch/VSS restore scenarios.
