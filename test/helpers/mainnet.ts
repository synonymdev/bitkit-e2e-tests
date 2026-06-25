import { doNavigationClose, elementById, expectTextWithin, sleep, tap } from './actions';

const WALLET_SYNC_TIMEOUT_MS = 90_000;
const APP_STATUS_ROW_TIMEOUT_MS = 90_000;

type WaitForMainnetWalletReadyOptions = {
  logPrefix: string;
  includeLightningStatus?: boolean;
};

export async function waitForMainnetWalletReady({
  logPrefix,
  includeLightningStatus = true,
}: WaitForMainnetWalletReadyOptions): Promise<void> {
  console.info(`→ [${logPrefix}] Waiting for wallet home screen...`);
  await elementById('TotalBalance-primary').waitForDisplayed({ timeout: WALLET_SYNC_TIMEOUT_MS });

  const stabilizeMs = resolveLnStabilizeDelayMs();
  console.info(
    `→ [${logPrefix}] Home screen ready, letting LN node stabilize (${stabilizeMs / 1000}s)...`
  );
  await sleep(stabilizeMs);

  console.info(`→ [${logPrefix}] Verify app status is ready`);
  await tap('HeaderMenu');
  await tap('DrawerAppStatus');

  await expectTextWithin('Status-internet', 'Connected', { timeout: APP_STATUS_ROW_TIMEOUT_MS });
  await expectTextWithin('Status-electrum', 'Connected', { timeout: APP_STATUS_ROW_TIMEOUT_MS });

  if (includeLightningStatus) {
    await expectTextWithin('Status-lightning_node', 'Running', {
      timeout: APP_STATUS_ROW_TIMEOUT_MS,
    });
    await expectTextWithin('Status-lightning_connection', 'Open', {
      timeout: APP_STATUS_ROW_TIMEOUT_MS,
    });
  }

  await doNavigationClose();
  console.info(`→ [${logPrefix}] App status verified`);
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
