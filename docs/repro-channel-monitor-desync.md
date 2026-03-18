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

## Prerequisites

- **Bitkit v1.1.6** (React Native) iOS or Android build — for the initial RN wallet setup
- **Bitkit v2.0.6** (native) iOS or Android build — for the intermediate native version
- **Bitkit v2.1.0 / build 182** (native) iOS or Android build — the version with the bug
- **Staging regtest** Blocktank API access (`BACKEND=regtest`)
- **Appium** running locally for the automated payment step
- **bitkit-e2e-tests** repo checked out

## Repro Steps

### Step 1: RN wallet setup (v1.1.6)

1. Install v1.1.6 (RN) on simulator/emulator
2. Create a new wallet
3. Fund the wallet on-chain (use `./scripts/fund-address.sh <address>`)
4. Mine blocks to confirm
5. Open a Lightning channel (transfer to spending)
6. Wait for the channel to be ready
7. Make **1 Lightning payment** (to confirm the channel works and create RN backup data)

### Step 2: Migrate to native (v2.0.6)

1. Install v2.0.6 (native) **over** the RN app (upgrade, not clean install)
2. The RN → native migration runs automatically
3. Wait for the wallet to fully sync and the Lightning node to start
4. Verify the channel is open and working

### Step 3: Make 21+ Lightning payments on native

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

### Step 4: Upgrade to v2.1.0

1. Install v2.1.0 / build 182 **over** the v2.0.6 app (upgrade)
2. Launch the app

### Expected Result

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

## Key Details

- **21 payments on native is the minimum** that reliably reproduces. Each payment generates ~3-5 update_id increments. LDK can recover small gaps (~10 updates) by replaying counterparty commitment updates, so fewer payments may not trigger the fatal crash.
- **RN payments don't need to be many** — just enough to establish the channel and create the RN backup.
- The bug is in `fetchOrphanedChannelMonitorsIfNeeded` in `WalletViewModel.swift` (iOS) / `WalletViewModel.kt` (Android). It unconditionally injects old RN monitors without checking compatibility with the current ChannelManager.

## Fix Verification

To verify the fix (e.g. `release-2.1.1` or `fix/channel-monitor-stale-data-v2`):

1. Reproduce the bug using steps 1-4 above on v2.1.0
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
| `scripts/pay-lightning-address.sh` | Shell script to pay BOLT11/BIP21/LN address via Blocktank |
| `scripts/pay-lightning-address-loop.sh` | Shell script to send N payments to a Lightning address |
