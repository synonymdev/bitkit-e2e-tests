# ChannelMonitor Desync: Repro, Recovery & Test Plan

Related issues:
- [#847 (bitkit-android)](https://github.com/synonymdev/bitkit-android/issues/847)
- iOS support ticket (user logs from 2026-03-18)

Fix branches:
- **iOS**: `fix/stale-monitor-recovery-release`
- **Android**: `fix/stale-monitor-recovery-v2`

## Summary

Build 182 (v2.1.0) introduced `fetchOrphanedChannelMonitorsIfNeeded` which fetches old channel monitors from the RN remote backup on every startup (when `isChannelRecoveryChecked` is false). If the wallet was migrated from RN to native and used on native for enough LN payments, the RN backup monitor is stale. Injecting it causes a fatal ChannelManager/ChannelMonitor update_id mismatch and LDK refuses to start.

## Root Cause

On v2.1.0 startup:
1. `fetchOrphanedChannelMonitorsIfNeeded` fetches stale channel monitor from RN backup server
2. Injects it via `setChannelDataMigration` with `channelManager: nil` (monitors only)
3. ldk-node persists the stale monitor to VSS/local storage
4. LDK loads ChannelManager (advanced) against stale ChannelMonitor → fatal mismatch
5. Node refuses to start: `"A ChannelMonitor is stale compared to the current ChannelManager!"`

## Error Signature

```
A ChannelMonitor is stale compared to the current ChannelManager!
The ChannelMonitor for channel <id> is at update_id <low> with update_id through <low> in-flight
but the ChannelManager is at update_id <high>.
Failed to read channel manager from store: Value would be dangerous to continue execution with
```

In app logs:
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

## Repro Case #1: Blocktank channel (staging regtest)

Reproduces the bug using a Blocktank LSP channel opened via "transfer to spending".

### Prerequisites

- **Bitkit v1.1.6** (React Native) iOS or Android build
- **Bitkit v2.0.6** (native iOS) or **v2.0.3** (native Android) build
- **Bitkit v2.1.0** (native) iOS or Android build — the buggy version
- **Staging regtest** Blocktank API access (`BACKEND=regtest`)
- **Appium** running locally for the automated payment step

### Steps

1. Install v1.1.6 (RN), create wallet, fund on-chain, open Lightning channel (transfer to spending), make 1 LN payment
2. Install v2.0.6 (iOS) or v2.0.3 (Android) **over** RN app — migration runs automatically
3. Make 21+ Lightning payments on native:
   ```bash
   # iOS
   SIMULATOR_OS_VERSION=26.0 BACKEND=regtest npx wdio wdio.no-install.conf.ts
   # Android
   PLATFORM=android BACKEND=regtest npx wdio wdio.no-install.conf.ts
   ```
4. Install v2.1.0 **over** native app → app fails to start LN node (see error signature above)

---

## Repro Case #2: 3rd-party channel (local docker)

Reproduces the bug using a manually opened channel to the local docker LND node.

### Prerequisites

- **bitkit-docker** running locally (Bitcoin, Electrum, LND, backup server)
- Local regtest builds for each version (see Build Notes below)
- **Appium** running locally for the automated payment step

### Build Notes

RN v1.1.6 local builds use `.env.test.template` (regtest + localhost Electrum). For release builds, `react-native-dotenv` reads `.env.production`, so that file must be overwritten with the local regtest config.

**Critical**: The RN app's `.env.production` must point the backup server to **staging** (not localhost), because the native apps have `rnBackupServerHost` hardcoded to staging. If the RN app pushes to `127.0.0.1:3003` but the native app queries `bitkit.stag0.blocktank.to`, it will never find the channel monitors and the bug won't trigger.

In `.env.production` for the RN v1.1.6 build, set:
```
BACKUPS_SERVER_HOST=https://bitkit.stag0.blocktank.to/backups-ldk
BACKUPS_SERVER_PUBKEY=02c03b8b8c1b5500b622646867d99bf91676fac0f38e2182c91a9ff0d053a21d6d
```

All other settings (Electrum, network, etc.) stay local.

### Steps

#### 1. RN wallet setup (v1.1.6)

1. Install the local RN build on simulator/emulator
2. Create a new wallet
3. Fund the wallet on-chain:
   ```bash
   cd docker
   ./bitcoin-cli send 0.01 <address>
   ./bitcoin-cli mine 6
   ```
4. In the app, go to **Settings > Advanced > Channels > + > Fund Custom > Manual** and enter the local LND connection (get the node ID from `./bitcoin-cli getinfo`):
   - Node ID: LND's pubkey
   - Host: `0.0.0.0`
   - Port: `9735`
5. Set amount (e.g. 50,000 sats) and confirm the channel open
6. Mine blocks: `./bitcoin-cli mine 6`
7. Wait for the channel to be active

#### 2. Open channel from LND to the app

The app's channel has all balance on the app side. LND needs outbound liquidity to pay invoices to the app. Get the app's node ID from **Settings > Advanced > Lightning Node Info**, then:

```bash
./bitcoin-cli openchannel <app_node_id> 500000
```

Verify with a test payment:
```bash
./bitcoin-cli payinvoice <bolt11_invoice> 10
```

#### 3. Migrate to native (v2.0.6 iOS / v2.0.3 Android)

1. Install native build **over** RN app (upgrade, not clean install)
2. Wait for migration and sync
3. **Re-connect to LND** — custom peer connection is lost after migration ([#435](https://github.com/synonymdev/bitkit-ios/issues/435)). Paste the URI in the app:
   ```
   02cfdfd683aca2561621870fe50ab9ef2d0c887b3729ce6797ff68fde6f044feb9@0.0.0.0:9735
   ```

#### 4. Make 30 Lightning payments on native

```bash
# iOS
PAYMENT_COUNT=30 SIMULATOR_OS_VERSION=26.0 npx wdio wdio.no-install.conf.ts
# Android
PAYMENT_COUNT=30 PLATFORM=android npx wdio wdio.no-install.conf.ts
```

> **Note**: The peer connection drops on app restarts. Re-paste the LND URI if needed before running the test.

#### 5. Upgrade to v2.1.0

Install v2.1.0 **over** the native app → app fails to start LN node (see error signature above).

---

## Recovery: Upgrade to v2.1.2

Upgrading from a broken v2.1.0 wallet to v2.1.2 (fix candidate) recovers the wallet. Channels are healed and LN transactions work after recovery.

Fix branches:
- **iOS**: `fix/stale-monitor-recovery-release`
- **Android**: `fix/stale-monitor-recovery-v2`

### Steps

1. Start with a broken v2.1.0 wallet (reproduced via either case above)
2. Install v2.1.2 **over** v2.1.0
3. Launch the app
4. Verify: node starts, channels are active, LN payments work

### Post-recovery channel closure

Whether healed channels should be closed after recovery is under discussion. For testing: verify wallet is operational after recovery regardless of channel closure outcome. On-chain balance should be intact even if healed channels are subsequently closed.

---

## Test Plan

Matrix of upgrade/recovery scenarios to validate v2.1.2. Each scenario should be tested for both channel types where marked.

### Blocktank channel (staging regtest)

| # | Scenario | Result |
|---|----------|--------|
| B1 | v2.0.6 (wallet with 21+ payment gap) → v2.1.0 → confirm broken | Reproduces |
| B2 | Restore broken v2.1.0 wallet into v2.1.2 (clean install + restore) | ✅ Recovered |
| B3 | Update broken v2.1.0 wallet to v2.1.2 (in-place upgrade) | ✅ Recovered |
| B4 | v2.0.6 (wallet with gap) → v2.1.2 (skip v2.1.0) | ✅ No issues |
| B5 | v2.0.6 (wallet with gap) → v2.1.1 → v2.1.2 | ✅ Recovered |
| B6 | v2.1.0 healthy wallet (no gap) → v2.1.2 (regression check) | ✅ No issues |
| B7 | v2.1.0 broken wallet + 600 blocks mined → v2.1.2 (stale chain state) | ✅ Recovered |

### 3rd-party channel (local docker)

| # | Scenario | Result |
|---|----------|--------|
| T1 | v2.0.6 (wallet with 30+ payment gap) → v2.1.0 → confirm broken | Reproduces |
| T2 | Update broken v2.1.0 wallet to v2.1.2 (in-place upgrade) | ✅ Recovered |
| T3 | v2.0.6 (wallet with gap) → v2.1.2 (skip v2.1.0) | ✅ No issues |
| T4 | v2.1.0 healthy wallet (no gap) → v2.1.2 (regression check) | ✅ No issues |
| T5 | v2.1.0 broken wallet + 600 blocks mined → v2.1.2 (stale chain state) | ✅ Recovered |

### Version reference

| Version | iOS branch | Android branch |
|---------|-----------|---------------|
| v1.1.6 | tag `v1.1.6` (RN) | tag `v1.1.6` (RN) |
| v2.0.6 | `chore/e2e-updater-url` | — |
| v2.0.3 | — | `chore/e2e-updater-url` |
| v2.1.0 | build 182 | build 182 |
| v2.1.2 (fix) | `fix/stale-monitor-recovery-release` | `fix/stale-monitor-recovery-v2` |

---

## Key Details

- **21 payments on native is the minimum** for Blocktank channels. Each payment generates ~3-5 update_id increments. LDK can recover small gaps (~10 updates) by replaying counterparty commitment updates.
- **RN payments don't need to be many** — just enough to establish the channel and create the RN backup.
- The bug is in `fetchOrphanedChannelMonitorsIfNeeded` in `WalletViewModel.swift` (iOS) / `WalletViewModel.kt` (Android). It unconditionally injects old RN monitors without checking compatibility with the current ChannelManager.
- **RN backup server mismatch**: The RN app's backup server is configurable via `.env`, but the native apps hardcode `rnBackupServerHost` to staging. For local docker repro, the RN build must push to the same staging server the native apps query.

## Files

| File | Purpose |
|------|---------|
| `test/specs/receive-ln-payments.e2e.ts` | Automated spec to receive N Lightning payments |
| `wdio.no-install.conf.ts` | WDIO config that attaches to existing app (no reinstall) |
| `docker/bitcoin-cli` | Local docker CLI with `openchannel`, `payinvoice`, `mine`, `send` commands |
| `scripts/pay-lightning-address.sh` | Shell script to pay BOLT11/BIP21/LN address via Blocktank |
| `scripts/pay-lightning-address-loop.sh` | Shell script to send N payments to a Lightning address |
