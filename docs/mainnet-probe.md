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
| `PROBE_ORDER` | `config` | Order of probes per target: `config` = amounts as listed in target config, `desc` = highest amount first (avoids small probes "warming up" scorer knowledge of the route), `random` = global shuffle of all target+amount pairs. |
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

Notes:

- The wallet derived from `PROBE_SEED` must already have an open, usable channel with outbound liquidity covering the largest configured probe amount.
- Probes do not move funds; the wallet balance is unchanged by a run.
- For scorer experiments, prefer `PROBE_ORDER=desc PROBE_RETRIES=0` to measure cold first-attempt success rate per amount.
