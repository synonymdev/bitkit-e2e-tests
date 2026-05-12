import {
  doNavigationClose,
  elementById,
  expectTextWithin,
  restoreWallet,
  sleep,
  tap,
} from '../../helpers/actions';
import {
  expandProbeTargetAmounts,
  fetchBolt11ForProbe,
  parseProbeCommandSuccess,
  resolveProbeTargets,
  runProbeCommand,
  writeProbeArtifacts,
  type ProbeResult,
  type ProbeTarget,
} from '../../helpers/probe';
import { ciIt } from '../../helpers/suite';

const WALLET_SYNC_TIMEOUT_MS = 90_000;
const APP_STATUS_ROW_TIMEOUT_MS = 90_000;

function resolveEnvValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function resolveLnStabilizeDelayMs(): number {
  const fromEnv = process.env.LN_STABILIZE_DELAY_MS;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return process.env.CI ? 45_000 : 10_000;
}

async function waitForWalletReady(): Promise<void> {
  console.info('→ [Probe] Waiting for wallet home screen...');
  await elementById('TotalBalance-primary').waitForDisplayed({ timeout: WALLET_SYNC_TIMEOUT_MS });
  const stabilizeMs = resolveLnStabilizeDelayMs();
  console.info(
    `→ [Probe] Home screen ready, letting LN node stabilize (${stabilizeMs / 1000}s)...`
  );
  await sleep(stabilizeMs);
  console.info('→ [Probe] Verify app status is ready');
  await tap('HeaderMenu');
  await tap('DrawerAppStatus');

  await expectTextWithin('Status-internet', 'Connected', { timeout: APP_STATUS_ROW_TIMEOUT_MS });
  await expectTextWithin('Status-electrum', 'Connected', { timeout: APP_STATUS_ROW_TIMEOUT_MS });
  await expectTextWithin('Status-lightning_node', 'Running', {
    timeout: APP_STATUS_ROW_TIMEOUT_MS,
  });
  await expectTextWithin('Status-lightning_connection', 'Open', {
    timeout: APP_STATUS_ROW_TIMEOUT_MS,
  });

  await doNavigationClose();
  console.info('→ [Probe] App status verified');
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

  try {
    console.info(`→ [Probe] Fetching invoice for '${target.name}' (${amountSats} sats)...`);
    const bolt11 = await fetchBolt11ForProbe(target, amountMsat);

    console.info(`→ [Probe] Probing '${target.name}' (${amountSats} sats)...`);
    const rawProviderResult = runProbeCommand(target, amountMsat, bolt11);
    const success = parseProbeCommandSuccess(rawProviderResult);

    return {
      ...baseResult,
      invoiceFetched: true,
      success,
      durationMs: Date.now() - startedAt,
      bolt11,
      rawProviderResult,
      error: success ? undefined : 'Probe command returned a failed result',
    };
  } catch (error) {
    return {
      ...baseResult,
      invoiceFetched: false,
      success: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
      await waitForWalletReady();

      for (const target of targets) {
        for (const amountMsat of expandProbeTargetAmounts(target)) {
          const result = await runProbe(target, amountMsat);
          results.push(result);
          console.info(
            `→ [Probe] ${result.targetName} ${result.amountSats} sats: ${
              result.success ? 'success' : `failed (${result.error ?? 'unknown'})`
            }`
          );
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
