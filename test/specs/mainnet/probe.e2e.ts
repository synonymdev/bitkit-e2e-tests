import { restoreWallet, sleep } from '../../helpers/actions';
import { waitForMainnetWalletReady } from '../../helpers/mainnet';
import {
  expandProbeTargetAmounts,
  fetchBolt11ForProbe,
  parseProbeCommandSuccess,
  resolveProbeTargets,
  runProbeCommand,
  summarizeProbeCommandFailure,
  writeProbeArtifacts,
  type ProbeResult,
  type ProbeTarget,
} from '../../helpers/probe';
import { ciIt } from '../../helpers/suite';

const DEFAULT_PROBE_DELAY_MS = 10_000;
const DEFAULT_PROBE_RETRIES = 2;
const DEFAULT_PROBE_RETRY_DELAY_MS = 5_000;

function resolveEnvValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function resolveProbeDelayMs(): number {
  return resolveNonNegativeIntEnv('PROBE_DELAY_MS') ?? DEFAULT_PROBE_DELAY_MS;
}

function resolveProbeRetries(): number {
  return resolveNonNegativeIntEnv('PROBE_RETRIES') ?? DEFAULT_PROBE_RETRIES;
}

function resolveProbeRetryDelayMs(): number {
  return resolveNonNegativeIntEnv('PROBE_RETRY_DELAY_MS') ?? DEFAULT_PROBE_RETRY_DELAY_MS;
}

async function runProbe(target: ProbeTarget, amountMsat: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  const amountSats = amountMsat / 1000;
  const baseResult = {
    targetName: target.name,
    targetType: target.type,
    amountMsat,
    amountSats,
    required: target.required ?? true,
    attempt: Number.parseInt(process.env.ATTEMPT ?? '1', 10),
  };

  let bolt11: string | undefined;
  try {
    console.info(`→ [Probe] Fetching invoice for '${target.name}' (${amountSats} sats)...`);
    bolt11 = await fetchBolt11ForProbe(target, amountMsat);
  } catch (error) {
    return {
      ...baseResult,
      retries: 0,
      invoiceFetched: false,
      success: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const maxRetries = resolveProbeRetries();
  const retryDelayMs = resolveProbeRetryDelayMs();
  let lastRawProviderResult = '';
  let lastError = 'Probe command returned a failed result';

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      console.info(
        `→ [Probe] Probing '${target.name}' (${amountSats} sats), attempt ${retry + 1}/${
          maxRetries + 1
        }...`
      );
      const rawProviderResult = runProbeCommand(target, amountMsat, bolt11);
      lastRawProviderResult = rawProviderResult;
      const success = parseProbeCommandSuccess(rawProviderResult);

      if (success) {
        return {
          ...baseResult,
          retries: retry,
          invoiceFetched: true,
          success: true,
          durationMs: Date.now() - startedAt,
          bolt11,
          rawProviderResult,
        };
      }

      lastError = summarizeProbeCommandFailure(rawProviderResult);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (retry < maxRetries && retryDelayMs > 0) {
      console.info(`→ [Probe] Retrying '${target.name}' in ${retryDelayMs / 1000}s...`);
      await sleep(retryDelayMs);
    }
  }

  return {
    ...baseResult,
    retries: maxRetries,
    invoiceFetched: true,
    success: false,
    durationMs: Date.now() - startedAt,
    bolt11,
    rawProviderResult: lastRawProviderResult,
    error: lastError,
  };
}

describe('@probe_mainnet - Lightning probe smoke', () => {
  let probeSeed: string;
  let targets: ProbeTarget[];

  before(() => {
    probeSeed = resolveEnvValue('PROBE_SEED');
    targets = resolveProbeTargets();
  });

  ciIt('@probe_mainnet_1 - Can probe configured mainnet LNURL targets', async () => {
    const results: ProbeResult[] = [];

    try {
      console.info('→ [Probe] Restoring probe wallet...');
      await restoreWallet(probeSeed, {
        expectBackupSheet: false,
        reinstall: false,
        expectAndroidAlert: false,
      });
      await waitForMainnetWalletReady({ logPrefix: 'Probe' });

      const probes = targets.flatMap((target) =>
        expandProbeTargetAmounts(target).map((amountMsat) => ({ target, amountMsat }))
      );
      const probeDelayMs = resolveProbeDelayMs();
      const probeRetries = resolveProbeRetries();
      console.info(`→ [Probe] Probe retries configured: ${probeRetries}`);

      for (const [index, { target, amountMsat }] of probes.entries()) {
        const result = await runProbe(target, amountMsat);
        results.push(result);
        console.info(
          `→ [Probe] ${result.targetName} ${result.amountSats} sats: ${
            result.success ? '✅ success' : `❌ failed (${result.error ?? 'unknown'})`
          }`
        );

        if (index < probes.length - 1 && probeDelayMs > 0) {
          console.info(`→ [Probe] Waiting ${probeDelayMs / 1000}s before next probe...`);
          await sleep(probeDelayMs);
        }
      }
    } finally {
      writeProbeArtifacts(results);
    }

    const failedRequired = results.filter((it) => it.required && !it.success);
    if (failedRequired.length > 0) {
      throw new Error(
        `Required probe targets failed: ${failedRequired
          .map((it) => `${it.targetName}:${it.amountSats}`)
          .join(', ')}`
      );
    }
  });
});

function resolveNonNegativeIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  throw new Error(`Invalid ${name} value: ${raw}`);
}
