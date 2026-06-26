import { restoreWallet, sleep } from '../../helpers/actions';
import { waitForMainnetWalletReady } from '../../helpers/mainnet';
import {
  buildProbeQueue,
  fetchBolt11ForProbe,
  parseNonNegativeIntEnv,
  parseProbeCommandSuccess,
  probeModeForTargetType,
  resolveProbeAmountProfile,
  resetPathfindingScores,
  resolveProbeOrder,
  resolveProbeResetScores,
  resolveProbeTargets,
  runProbeInvoiceCommand,
  runProbeNodeCommand,
  summarizeProbeCommandFailure,
  waitForProbeReadiness,
  writeProbeArtifacts,
  type ProbeReadiness,
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
  return parseNonNegativeIntEnv('PROBE_DELAY_MS') ?? DEFAULT_PROBE_DELAY_MS;
}

function resolveProbeRetries(): number {
  return parseNonNegativeIntEnv('PROBE_RETRIES') ?? DEFAULT_PROBE_RETRIES;
}

function resolveProbeRetryDelayMs(): number {
  return parseNonNegativeIntEnv('PROBE_RETRY_DELAY_MS') ?? DEFAULT_PROBE_RETRY_DELAY_MS;
}

async function runInvoiceProbe(target: ProbeTarget, amountMsat: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  const amountSats = amountMsat / 1000;
  const baseResult = {
    targetName: target.name,
    targetType: target.type,
    probeMode: probeModeForTargetType(target.type),
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
      const rawProviderResult = runProbeInvoiceCommand(target, amountMsat, bolt11);
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

async function runNodeProbe(target: ProbeTarget, amountMsat: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  const amountSats = amountMsat / 1000;
  const nodeId = target.nodeId;
  if (!nodeId) {
    throw new Error(`Probe target '${target.name}' is missing nodeId`);
  }

  const baseResult = {
    targetName: target.name,
    targetType: target.type,
    probeMode: probeModeForTargetType(target.type),
    amountMsat,
    amountSats,
    required: target.required ?? true,
    attempt: Number.parseInt(process.env.ATTEMPT ?? '1', 10),
    nodeId,
    invoiceFetched: false,
  };

  const maxRetries = resolveProbeRetries();
  const retryDelayMs = resolveProbeRetryDelayMs();
  let lastRawProviderResult = '';
  let lastError = 'Probe command returned a failed result';

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      console.info(
        `→ [Probe] Keysend probing '${target.name}' (${amountSats} sats), attempt ${retry + 1}/${
          maxRetries + 1
        }...`
      );
      const rawProviderResult = runProbeNodeCommand(target, amountMsat);
      lastRawProviderResult = rawProviderResult;
      const success = parseProbeCommandSuccess(rawProviderResult);

      if (success) {
        return {
          ...baseResult,
          retries: retry,
          success: true,
          durationMs: Date.now() - startedAt,
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
    success: false,
    durationMs: Date.now() - startedAt,
    rawProviderResult: lastRawProviderResult,
    error: lastError,
  };
}

async function runProbe(target: ProbeTarget, amountMsat: number): Promise<ProbeResult> {
  if (target.type === 'nodeId') {
    return runNodeProbe(target, amountMsat);
  }
  return runInvoiceProbe(target, amountMsat);
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
    let readiness: ProbeReadiness | null = null;

    try {
      console.info('→ [Probe] Restoring probe wallet...');
      await restoreWallet(probeSeed, {
        expectBackupSheet: false,
        reinstall: false,
      });
      await waitForMainnetWalletReady({ logPrefix: 'Probe' });

      const resetScores = resolveProbeResetScores();
      let scoresResetFloorS: number | null = null;
      if (resetScores) {
        scoresResetFloorS = await resetPathfindingScores({ logPrefix: 'Probe' });
      }
      readiness = await waitForProbeReadiness({
        logPrefix: 'Probe',
        requireScoresSync: resetScores,
        minScoresSyncTimestamp: scoresResetFloorS,
      });

      const probeOrder = resolveProbeOrder();
      const probes = buildProbeQueue(targets, probeOrder);
      const probeDelayMs = resolveProbeDelayMs();
      const probeRetries = resolveProbeRetries();
      console.info(`→ [Probe] Probe amount profile configured: ${resolveProbeAmountProfile()}`);
      console.info(`→ [Probe] Probe order configured: ${resolveProbeOrder()}`);
      console.info(`→ [Probe] Probe retries configured: ${probeRetries}`);
      console.info(
        `→ [Probe] Probe order '${probeOrder}': ${probes
          .map((it) => `${it.target.name}:${it.amountMsat / 1000}`)
          .join(', ')}`
      );

      for (const [index, { target, amountMsat }] of probes.entries()) {
        const result = await runProbe(target, amountMsat);
        results.push(result);
        console.info(
          `→ [Probe] ${result.targetName} ${result.amountSats} sats (${result.probeMode}): ${
            result.success ? '✅ success' : `❌ failed (${result.error ?? 'unknown'})`
          }`
        );

        if (index < probes.length - 1 && probeDelayMs > 0) {
          console.info(`→ [Probe] Waiting ${probeDelayMs / 1000}s before next probe...`);
          await sleep(probeDelayMs);
        }
      }
    } finally {
      writeProbeArtifacts(results, readiness);
    }

    const failedRequired = results.filter((it) => it.required && !it.success);
    if (failedRequired.length > 0) {
      throw new Error(
        `Required probe targets failed: ${failedRequired
          .map((it) => `${it.targetName}:${it.amountSats} (${it.error ?? 'unknown'})`)
          .join('; ')}`
      );
    }
  });
});
