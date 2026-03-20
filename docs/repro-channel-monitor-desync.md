# Repro: ChannelMonitor Desync (Stale RN Monitor Injection)

Related issues:
- [#847 (bitkit-android)](https://github.com/synonymdev/bitkit-android/issues/847)
- iOS support ticket (user logs from 2026-03-18)

## Summary

Build 182 (v2.1.0) introduced `fetchOrphanedChannelMonitorsIfNeeded` which fetches old channel monitors from the RN remote backup on every startup (when `isChannelRecoveryChecked` is false). If the wallet was migrated from RN to native and used on native for enough LN payments, the RN backup monitor is stale. Injecting it causes a fatal ChannelManager/ChannelMonitor update_id mismatch and LDK refuses to start.

## Root Cause

On v2.1.0 startup:
1. `fetchOrphanedChannelMonitorsIfNeeded` fetches stale channel monitor from RN backup server
2. Injects it via `setChannelDataMigration` with `channelManager: nil` (monitors only)
3. ldk-node persists the stale monitor to VSS/local storage
4. LDK loads ChannelManager (advanced) against stale ChannelMonitor → fatal mismatch
5. Node refuses to start: `"A ChannelMonitor is stale compared to the current ChannelManager!"`

---

## Case 1: Blocktank channel (staging regtest)

Reproduces the bug using a Blocktank LSP channel opened via "transfer to spending".

### Prerequisites

- **Bitkit v1.1.6** (React Native) iOS or Android build — for the initial RN wallet setup
- **Bitkit v2.0.6** (native iOS) or **v2.0.3** (native Android) build — intermediate native version
- **Bitkit v2.1.0 / build 182** (native) iOS or Android build — the version with the bug
- **Staging regtest** Blocktank API access (`BACKEND=regtest`)
- **Appium** running locally for the automated payment step
- **bitkit-e2e-tests** repo checked out

### Repro Steps

#### Step 1: RN wallet setup (v1.1.6)

1. Install v1.1.6 (RN) on simulator/emulator
2. Create a new wallet
3. Fund the wallet on-chain (use `./scripts/fund-address.sh <address>`)
4. Mine blocks to confirm
5. Open a Lightning channel (transfer to spending)
6. Wait for the channel to be ready
7. Make **1 Lightning payment** (to confirm the channel works and create RN backup data)

#### Step 2: Migrate to native (v2.0.6 iOS / v2.0.3 Android)

1. Install the native build **over** the RN app (upgrade, not clean install)
2. The RN → native migration runs automatically
3. Wait for the wallet to fully sync and the Lightning node to start
4. Verify the channel is open and working

#### Step 3: Make 21+ Lightning payments on native

This advances the ChannelManager in VSS past the frozen RN backup monitor.

**Automated (recommended):**

Make sure Appium is running, then:

```bash
# iOS
SIMULATOR_OS_VERSION=26.0 BACKEND=regtest npx wdio wdio.no-install.conf.ts

# Android
PLATFORM=android BACKEND=regtest npx wdio wdio.no-install.conf.ts
```

This runs `test/specs/receive-ln-payments.e2e.ts` which:
- Attaches to the already-installed app (no reinstall)
- Loops 21 times: tap Receive → grab invoice from QR → pay via Blocktank → acknowledge
- Default: 21 payments of 10 sats each

Customize with env vars:
```bash
PAYMENT_COUNT=25 PAYMENT_AMOUNT=10 SIMULATOR_OS_VERSION=26.0 BACKEND=regtest npx wdio wdio.no-install.conf.ts
```

**Manual alternative:**

Use the shell script to pay invoices grabbed from the app UI:
```bash
# Pay a BIP21 URI copied from the app's receive screen
./scripts/pay-lightning-address.sh 'bitcoin:bcrt1q...?lightning=lnbcrt1...' 10
```

Repeat 21+ times with fresh invoices each time.

#### Step 4: Upgrade to v2.1.0

1. Install v2.1.0 / build 182 **over** the v2.0.6 app (upgrade)
2. Launch the app

#### Expected Result

The app fails to start the Lightning node with:

```
A ChannelMonitor is stale compared to the current ChannelManager!
The ChannelMonitor for channel <id> is at update_id <low> with update_id through <low> in-flight
but the ChannelManager is at update_id <high>.
Failed to read channel manager from store: Value would be dangerous to continue execution with
```

In app logs, look for:
```
Running pre-startup channel monitor recovery check
Found 1 monitors on RN backup for pre-startup recovery
Applied channel migration: 1 monitors
Migrating channel monitor: <funding_txid>
A ChannelMonitor is stale compared to the current ChannelManager!
Read failed [Failed to read from store.]
Failed to start wallet
```

---

## Case 2: 3rd-party channel (local docker) — NOT REPRODUCED

Attempted to reproduce the bug using a 3rd-party channel (local docker LND) instead of Blocktank. This tests whether the bug also affects non-LSP channels. **The bug did not reproduce with this setup**, even after 50 payments.

### Prerequisites

- **bitkit-docker** running locally (Bitcoin, Electrum, LND, backup server)
- Local regtest builds for each version:
  - `bitkit_rn_local_v1.1.6.apk` / `bitkit_rn_local_ios_v1.1.6.app`
  - Native v2.0.6 (iOS) / v2.0.3 (Android) built with `BACKEND=local`
  - Native v2.1.0 built with `BACKEND=local`
- **Appium** running locally for the automated payment step
- **bitkit-e2e-tests** repo checked out

### Build Notes

RN v1.1.6 local builds use `.env.test.template` (regtest + localhost Electrum). For release builds, `react-native-dotenv` reads `.env.production`, so that file must also be overwritten with the local config. See the `bitkit-build` skill for full instructions.

### Repro Steps

#### Step 1: RN wallet setup (v1.1.6)

1. Install the local RN build on simulator/emulator
2. Create a new wallet
3. Fund the wallet on-chain:
   ```bash
   cd docker
   ./bitcoin-cli send 0.01 <address>
   ./bitcoin-cli mine 6
   ```
4. In the app, connect to the local LND node. Go to **Settings > Advanced > Channels > + > Fund Custom > Manual** and enter:
   - Node ID: `02cfdfd683aca2561621870fe50ab9ef2d0c887b3729ce6797ff68fde6f044feb9`
   - Host: `0.0.0.0`
   - Port: `9735`
5. Set amount (e.g. 50,000 sats) and confirm the channel open
6. Mine blocks to confirm:
   ```bash
   ./bitcoin-cli mine 6
   ```
7. Wait for the channel to show as active in the app

#### Step 2: Open channel from LND to the app

The app's channel gives the app outbound liquidity, but LND needs outbound to pay the app. While the app is still connected as a peer, open a channel from LND's side:

```bash
# Get the app's node ID from Settings > Advanced > Lightning Node Info
./bitcoin-cli openchannel <app_node_id> 500000
```

This funds LND, opens a 500k sat channel, mines 6 blocks, and waits for it to become active.

Verify LND can pay the app:
```bash
# Grab an invoice from the app's receive screen and pay it
./bitcoin-cli payinvoice <bolt11_invoice> 10
```

#### Step 3: Migrate to native (v2.0.6 iOS / v2.0.3 Android)

1. Install the local native build **over** the RN app (upgrade, not clean install)
2. The RN → native migration runs automatically
3. Wait for the wallet to fully sync and the Lightning node to start
4. **Re-connect to LND**: the custom peer connection is lost after migration (see [#435](https://github.com/synonymdev/bitkit-ios/issues/435)). Paste the LND URI again in the app:
   ```
   02cfdfd683aca2561621870fe50ab9ef2d0c887b3729ce6797ff68fde6f044feb9@0.0.0.0:9735
   ```
5. Verify the channel is active and LND is connected as a peer

#### Step 4: Make 30 Lightning payments on native

**Automated (recommended):**

Make sure Appium is running and the peer is connected, then:

```bash
# iOS
PAYMENT_COUNT=30 SIMULATOR_OS_VERSION=26.0 npx wdio wdio.no-install.conf.ts

# Android
PAYMENT_COUNT=30 PLATFORM=android npx wdio wdio.no-install.conf.ts
```

**Manual alternative:**

Grab invoices from the app's receive screen and pay via LND:
```bash
./bitcoin-cli payinvoice <bolt11_invoice> 10
```

> **Note**: The peer connection can drop between app restarts. Before running the test, verify LND has an active peer. If not, re-paste the connection URI in the app.

#### Step 5: Upgrade to v2.1.0

1. Install v2.1.0 **over** the native app (upgrade)
2. Launch the app

#### Result: NOT REPRODUCED

After 30 payments on v2.0.6 with a 3rd-party LND channel, upgrading to v2.1.0 did **not** trigger the ChannelMonitor desync crash. The node started successfully.

Possible explanations:
- The bug may only affect Blocktank/LSP channels where the channel was opened via the "transfer to spending" flow
- The RN backup server may store channel monitors differently for custom vs LSP channels
- The stale monitor injection path may only match on specific channel metadata (e.g. LSP-related fields)

---

## Key Details

- **21 payments on native is the minimum** that reliably reproduces (Case 1). Each payment generates ~3-5 update_id increments. LDK can recover small gaps (~10 updates) by replaying counterparty commitment updates, so fewer payments may not trigger the fatal crash.
- **RN payments don't need to be many** — just enough to establish the channel and create the RN backup.
- The bug is in `fetchOrphanedChannelMonitorsIfNeeded` in `WalletViewModel.swift` (iOS) / `WalletViewModel.kt` (Android). It unconditionally injects old RN monitors without checking compatibility with the current ChannelManager.

## Fix Verification

To verify the fix (e.g. `release-2.1.1` or `fix/channel-monitor-stale-data-v2`):

1. Reproduce the bug using Case 1 steps on v2.1.0
2. Confirm the node fails to start
3. Install the fix build **over** the broken v2.1.0
4. Launch the app
5. Check logs — the node should either:
   - Start successfully (fix prevents stale monitor injection), or
   - Handle the already-corrupted state gracefully (fix in ldk-node)

## Files

| File | Purpose |
|------|---------|
| `test/specs/receive-ln-payments.e2e.ts` | Automated spec to receive N Lightning payments |
| `wdio.no-install.conf.ts` | WDIO config that attaches to existing app (no reinstall) |
| `docker/bitcoin-cli` | Local docker CLI with `openchannel`, `payinvoice`, `mine`, `send` commands |
| `scripts/pay-lightning-address.sh` | Shell script to pay BOLT11/BIP21/LN address via Blocktank |
| `scripts/pay-lightning-address-loop.sh` | Shell script to send N payments to a Lightning address |
