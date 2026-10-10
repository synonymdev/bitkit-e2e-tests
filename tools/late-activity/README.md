# Late on-chain activity fixture

Hold an existing tagged RN on-chain receive out of a native target's Electrum
view until an explicit release. The source wallet and the remote RN backup keep
their real transaction and tag. Backup requests use their usual endpoints;
only the target's Electrum connection uses this gate. No app build changes,
metadata injection, Bitcoin rollback or timing race are needed.

This is an environment preparation tool. It does not drive an app, restore a
wallet, assert migration behavior or run a QA item.

## Source preconditions

Use a prepared **RN 1.1.6 iOS remote backup**, with a tag on a single on-chain
receive. Keep the source's tag and its matching txid together. Copy that txid
and the transaction's receive address from the source. The address must be a
dedicated regtest native SegWit v0 address (`bcrt1q...`), with exactly this
transaction in its history and with the receive still unspent. Do not spend,
boost or reuse that address while staging the restore. Use a small separate
receive if the existing tagged activity is a send, transfer or spent receive.

Confirm the tag persists on the source and that its remote **Tags** backup has
completed before restoring. An Android-origin backup is insufficient for the
iOS tag restore case. The gate creates the missing-activity condition; it does
not create or repair a missing RN backup.

The gate checks history, raw transaction retrieval and unspent outputs upstream
before binding its ports. A missing, spent or reused fixture address fails
startup. Use the same upstream/network as both source and target; the staging
regtest endpoint is `ssl://electrs.bitkit.stag0.blocktank.to:9999`.

## Install on the target simulator's host

Check out this companion revision and run its checks. Python 3.10+ is the only
tool dependency; no npm install, Appium, service project or extra seat is needed.
Choose unused ports for the test's own host/seat. A bind conflict fails startup
and never stops an existing process.

```sh
python3 -m unittest discover -s tools/late-activity -p 'test_gate.py'

export LATE_TXID='<tagged receive txid>'
export LATE_ADDRESS='<that transaction receive address>'
export LATE_SCRIPT="$(python3 tools/late-activity/address.py "$LATE_ADDRESS")"
export LATE_PORT=23921 LATE_CONTROL_PORT=23922
export LATE_ELECTRUM="tcp://127.0.0.1:$LATE_PORT"
export LATE_CONTROL="http://127.0.0.1:$LATE_CONTROL_PORT"

python3 tools/late-activity/gate.py \
  --upstream ssl://electrs.bitkit.stag0.blocktank.to:9999 \
  --txid "$LATE_TXID" --scripthash "$LATE_SCRIPT" \
  --listen-port "$LATE_PORT" --control-port "$LATE_CONTROL_PORT" \
  --max-seconds 1800 > late-activity-gate.log 2>&1 &
export LATE_GATE_PID=$!
# Wait up to 20 retries for the ready endpoint; stop if this command fails.
curl --fail --retry 20 --retry-connrefused --retry-delay 1 "$LATE_CONTROL/status"
python3 tools/late-activity/probe.py --electrum "$LATE_ELECTRUM" \
  --txid "$LATE_TXID" --scripthash "$LATE_SCRIPT" --expect held
```

The held probe must return `probe: passed`, no history/UTXOs, zero balance and
an available chain header. Direct retrieval of the tagged transaction must
fail while held. The gate also filters mempool history and subscription
statuses, so a sync can finish normally without this activity. Other
transactions, block headers and fee estimates pass through. It advertises no
alternate peers and closes the connection on upstream failure.

The simulator normally uses its host's `127.0.0.1`. Run the gate on that host,
not on a different coordinator. The HTTP control endpoint always binds only
to loopback. For another device transport, explicitly supply `--listen-host`
and use an address that that device reaches; this tool opens no relay tunnels.

## Configure the target before its first restore sync

The test run installs its own PR artifact on a **fresh target simulator**.
Before launching that app even once, point it at the gate:

```sh
python3 tools/late-activity/ios_config.py \
  --udid "$TARGET_SIMULATOR_UDID" --bundle-id to.bitkit \
  --host 127.0.0.1 --port "$LATE_PORT"
curl --fail "$LATE_CONTROL/status" > late-activity-before-target.json
```

`ios_config.py` resolves only the supplied UUID's installed app data container
and creates its `Library/Preferences/to.bitkit.plist` with the native
`electrumServer` Data value (`host`, `port`, `protocolType: tcp`). It refuses an
existing preference file. The target must be unlaunched: do not use this helper
on a running app or on the RN source. Choosing the gate in Settings after
restoring is too late; the first sync may already have applied the tag. No
keychain, source data or system defaults are accessed.

The caller can now drive its restore. Keep the gate held until the caller has
observed its first completed sync with the target activity absent. Save
`GET /status` again and confirm `hidden_history_responses` increased from the
baseline after the probes; probe calls also increment the counter. This
demonstrates that the target used the gate, but the caller still needs its own
app evidence for sync completion and pending migration metadata.

## Release for the caller's later sync

Only after the caller established its first-sync precondition:

```sh
curl --fail -X POST "$LATE_CONTROL/release"
python3 tools/late-activity/probe.py --electrum "$LATE_ELECTRUM" \
  --txid "$LATE_TXID" --scripthash "$LATE_SCRIPT" --expect released
```

Release is monotonic for this process and not tied to request counts or elapsed
time. Existing subscribers receive the real updated status. Repeated release
is harmless. Subsequent history, UTXOs, balances and raw transaction requests
return the upstream data. The caller drives its later sync and decides the
tag result. Neither a successful proxy probe nor a passing source backup is
a migration result.

Keep the gate running until the caller finishes or switches the target back
to its usual Electrum server. Stop only this process with
`kill "$LATE_GATE_PID"; wait "$LATE_GATE_PID"`. It also exits on SIGINT/SIGTERM
or its explicit 1800-second limit. A newly started process is held again;
never restart it against a target that has already learned the activity.

## Independent proof

The socket tests cover held/released responses, raw-fetch blocking, batches,
subscription notification, unrelated activity, reconnects, upstream failures,
preflight rejection and creation of fresh iOS preference data. They use fake
upstream chain data and do not run an app.

An opt-in live proof deposits 1000 disposable regtest sats to a random unowned
address, waits for the real Electrum server to index it, starts a throwaway
gate on dynamically assigned local ports, probes both phases through its
HTTP release interface, compares the released raw transaction byte-for-byte
with upstream, then closes its connections/listeners. It touches no source or
target wallet and opens no device session:

```sh
python3 tools/late-activity/live_smoke.py --fund-disposable-regtest
```

Live proof is bounded to 120 seconds. It proves Electrum preparation, not native
migration behavior. The iOS preference installer has offline checks; its
actual use on the target belongs to the test run.
