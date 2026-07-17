# Mainnet Lightning probe

The `@probe_mainnet` suite (`test/specs/mainnet/probe.e2e.ts`) restores a funded mainnet wallet, waits for node readiness, then sends Lightning probes (invoice and keysend) to configured external targets and reports pass/fail per target and amount.

It is orchestrated nightly by the private `bitkit-nightly` repo (`mainnet-probe.yml`), which owns schedules, secrets, and the probe target config. See `docs/mainnet-nightly.md` for the general contract between the repos.

## Environment variables

### Required

| Variable | Description |
| --- | --- |
| `PROBE_SEED` | Mnemonic of a mainnet wallet with a usable Lightning channel and outbound liquidity. Keep secret. |
| `PROBE_TARGETS_JSON` | JSON array of probe targets. Schema is documented in `bitkit-nightly/config/README.md` (canonical config: `bitkit-nightly/config/probe-targets.json`). |

### Probe execution

| Variable | Default | Description |
| --- | --- | --- |
| `PROBE_AMOUNT_PROFILE` | `full` | Default amount set for targets that do not define `amountMsat` or `amountsMsat`: `small`, `large`, `cover`, or `full`. |
| `PROBE_ORDER` | `config` | Order of probes per target: `config` = amounts as listed in target config, `desc` = highest amount first (avoids small probes "warming up" scorer knowledge of the route), `random` = global shuffle of all target+amount pairs. |
| `PROBE_RESET_SCORES` | `false` | When `true`, deletes the persisted pathfinding scores (`scorer` and `external_pathfinding_scores_cache` VSS keys) and restarts the node before probing, so every run starts from a fresh scorer (external scores are re-downloaded on startup). Recommended for scorer A/B experiments; the nightly job enables it by default. Accepts `true/false/1/0/yes/no`. |
| `PROBE_RESET_SCORES_TIMEOUT_SECONDS` | `180` | Timeout for the scores reset devtools command (covers node stop + VSS deletes + node start). |
| `PROBE_SCORES_SYNC_MAX_AGE_S` | `900` | Only with `PROBE_RESET_SCORES=true`: readiness additionally requires the node's last external scores sync to be at most this many seconds old **and** newer than the reset floor reported by the app (captured after the node stop + VSS deletes, before the restart; the sync timestamp persisted in node metrics survives the restart, so only a sync from the rebuilt node proves the scores were re-downloaded). Guards against a failed scorer fetch silently producing a "no scores" run. |
| `PROBE_RETRIES` | `2` | In-test retries per target+amount after a failed probe (total attempts = retries + 1). `0` = single attempt; useful to measure first-attempt success rate. |
| `PROBE_RETRY_DELAY_MS` | `5000` | Delay between probe retries. |
| `PROBE_DELAY_MS` | `10000` | Delay between consecutive probes (different target/amount). |
| `PROBE_TIMEOUT_SECONDS` | `90` | Timeout for a single probe devtools command. |

### Invoice fetching (LNURL / Lightning Address targets)

| Variable | Default | Description |
| --- | --- | --- |
| `PROBE_FETCH_RETRIES` | `2` | Retries for LNURL metadata/invoice HTTP requests. |
| `PROBE_FETCH_RETRY_DELAY_MS` | `1000` | Delay between fetch retries. |

### Readiness gate

Probing starts only after the node reports a healthy state (running, peers connected, usable channel, healthy sync, non-thin network graph).

| Variable | Default | Description |
| --- | --- | --- |
| `PROBE_READINESS_TIMEOUT_MS` | `180000` | Max wait for readiness before failing the test. |
| `PROBE_READINESS_POLL_MS` | `5000` | Readiness poll interval. |
| `PROBE_MIN_GRAPH_CHANNELS` | `10000` | Minimum network graph channel count required before probing. |

### Devtools method overrides (rarely needed)

| Variable | Default | Description |
| --- | --- | --- |
| `PROBE_INVOICE_METHOD` | `probeInvoice` | Devtools content-provider method for invoice probes. |
| `PROBE_NODE_METHOD` | `probeNode` | Devtools method for keysend probes. |
| `PROBE_READINESS_METHOD` | `probeReadiness` | Devtools method for the readiness check. |
| `PROBE_RESET_SCORES_METHOD` | `resetScores` | Devtools method for the pathfinding scores reset. |

### Related (set by orchestration)

| Variable | Description |
| --- | --- |
| `ATTEMPT` | Run attempt label (`1`, `2`, ...); selects the `artifacts/attempt-N/` output dir and is recorded in results. |
| `LN_STABILIZE_DELAY_MS` | Extra settle delay after the mainnet wallet is restored (defaults to 45s on CI, 10s locally). |
| `APPIUM_NEW_COMMAND_TIMEOUT` | Appium idle timeout; must exceed the longest single probe sequence (nightly uses `1800`). |

## Artifacts

Written to `artifacts/` (or `artifacts/attempt-N/` when `ATTEMPT` is set):

- `probe-results.json` — per-probe results (target, amount, success, retries, duration, error)
- `probe-report.md` — markdown summary table (also appended to `GITHUB_STEP_SUMMARY` on CI)
- `probe-readiness.json` — node readiness snapshot at probe start
- `probe-targets-replay.json` — configured targets expanded into the exact target+amount order used by this run. Use it with `PROBE_ORDER=config` to replay a random run.

## Running locally

1. Set up env vars:

```bash
export PROBE_SEED="your wallet seed here..."
export PROBE_TARGETS_JSON="$(jq -c . ../bitkit-nightly/config/probe-targets.json)"
```

2. Build a mainnet APK (requires `bitkit-android` checked out next to this repo):

```bash
BACKEND=mainnet ./scripts/build-android-apk.sh
```

3. Run the suite:

```bash
PLATFORM=android \
BACKEND=mainnet \
APP_ID_ANDROID=to.bitkit \
AUT_FILENAME=bitkit_e2e_mainnet.apk \
LN_STABILIZE_DELAY_MS=25000 \
APPIUM_NEW_COMMAND_TIMEOUT=1200 \
./ci_run_android.sh --spec ./test/specs/mainnet/probe.e2e.ts --mochaOpts.grep "@probe_mainnet"
```

Replay a previous random probe run from its artifact:

```bash
export PROBE_TARGETS_JSON="$(jq -c . artifacts/probe-targets-replay.json)"
export PROBE_ORDER=config
```

Then run the suite with the same wallet/app build and other probe settings used by the original run.

Notes:

- The wallet derived from `PROBE_SEED` must already have an open, usable channel with outbound liquidity covering the largest configured probe amount.
- Probes do not move funds; the wallet balance is unchanged by a run.
- For scorer experiments, prefer `PROBE_RESET_SCORES=true PROBE_ORDER=desc PROBE_RETRIES=0` to measure cold first-attempt success rate per amount. Without the reset, locally learned scores accumulate in VSS under the probe seed across runs (probe results train the scorer), so consecutive runs are not comparable.
- `PROBE_RESET_SCORES` requires an app build that includes the `resetScores` devtools method (bitkit-android).
