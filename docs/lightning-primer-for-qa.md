# Lightning primer for QA

Background for [channel monitor desync repro](./repro-channel-monitor-desync.md) and any work that touches Lightning storage, migration, or startup.

## What a Lightning channel is (operationally)

Two parties lock funds in a 2-of-2 on-chain output. **Off-chain**, they exchange **commitment transactions** that encode “who gets what if we publish now.” Each new off-chain state is a **commitment update**. LDK tracks progress with an internal **`update_id`** (a monotonic counter per channel).

- **ChannelManager** — current view of all channels, balances, and pending HTLCs.
- **ChannelMonitor** — per-channel state used to watch the chain, enforce penalties, and react to force-closes. It must stay **consistent** with what the ChannelManager believes.

The **chain::Watch** contract (simplified): durable storage must reflect **latest** ChannelMonitor data **before** the app continues as if that state is live. If an old monitor is paired with an advanced manager, LDK reports **`DangerousValue`** and refuses to start — that protects funds.

## HTLCs

**HTLC** means **Hash Time-Locked Contract**. It is a conditional payment: pay the peer if they reveal a preimage by a deadline; otherwise revert. HTLCs live **inside** commitment updates. Each hop of a multi-hop payment adds HTLCs; resolving them advances commitment state again.

Testing “payments” matters because each payment usually causes **multiple** commitment updates, not a 1:1 mapping to “one payment = one update_id step.”

## “Gap” in the test matrix (e.g. 21 / 30 payments)

The doc’s payment counts are a **proxy for many `update_id` advances**, not a magic number from BOLT math.

- **Small** mismatch between an old backup and the live node may be **healed** via peer reconnection and commitment replay.
- **Large** mismatch, or injecting a **stale monitor** on top of an **advanced** manager, triggers **stale ChannelMonitor** errors and a refused start until recovery.

## What went wrong in the ChannelMonitor desync bug

1. **ChannelManager** on device was **ahead** (normal usage after RN migration).
2. **Old ChannelMonitor** data (e.g. from RN remote backup) was applied without matching the current manager.
3. On load: monitor `update_id` ≪ manager → **stale monitor** → **`DangerousValue`** → node will not run.

The **fix path** uses **`accept_stale_channel_monitors`** so ldk-node can align state and **self-heal** (commitment round-trips, chain sync). That is why recovery logs show retries, healing, and sometimes **over a minute** before balances and payments look normal — especially with **many blocks** to sync (e.g. T5) or **local LND** setups vs Blocktank-only flows.

## What to test when Lightning / LDK storage changes

| Area                 | Why                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cold start**       | Any path that reads/writes ChannelManager, monitors, or VSS must not pair **new** manager with **old** monitor.                                                             |
| **Backup / restore** | Restoring must be **consistent snapshots**; partial or older monitor alone is high risk.                                                                                    |
| **Migration**        | RN → native or schema changes: avoid overwriting live data with **stale** remote copies.                                                                                    |
| **Recovery**         | After `DangerousValue` / `accept_stale`: peers reconnect, chain sync completes, **inbound and outbound** payments work, **second launch** does not repeat recovery forever. |
| **Infra noise**      | On regtest, **stale RGS** / gossip can cause transient **“route not found”** — distinguish from persistence bugs (see logs for `DangerousValue` vs routing errors).         |

## Risks of incorrect “fixes”

- Skipping or weakening persistence checks can lead to **wrong** enforcement keys or **missed** on-chain reactions.
- Blindly merging backups can recreate the **stale monitor** class of bug.
- Recovery paths should always be validated with **real sends/receives** and **restart**, not only “app opens.”

## Glossary

| Term                              | Meaning                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Commitment update**             | New off-chain state (balances + HTLC set).                                                                        |
| **`update_id`**                   | LDK’s persisted notion of how far the ChannelMonitor has advanced vs the ChannelManager for that channel.         |
| **HTLC**                          | **Hash Time-Locked Contract** — conditional payment inside a commitment (hash lock + time lock).                  |
| **ChannelMonitor**                | Per-channel persisted state for chain watching and dispute handling.                                              |
| **DangerousValue**                | LDK/ldk-node refusing to load because continuing would violate safety assumptions (e.g. stale monitor).           |
| **accept_stale_channel_monitors** | Explicit recovery mode to load despite mismatch, then heal via protocol + sync (use only in controlled recovery). |

## See also

- [repro-channel-monitor-desync.md](./repro-channel-monitor-desync.md) — repro steps, matrix, recovery timing notes
