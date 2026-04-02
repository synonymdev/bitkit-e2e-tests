import {
  dragOnElement,
  elementById,
  enterAmount,
  enterAddress,
  restoreWallet,
  tap,
  sleep,
  expectTextWithin,
  doNavigationClose,
} from '../../helpers/actions';
import { ciIt } from '../../helpers/suite';

const PAYMENT_TIMEOUT_MS = 90_000;
const WALLET_SYNC_TIMEOUT_MS = 90_000;
const APP_STATUS_ROW_TIMEOUT_MS = 90_000;
const SCREEN_TRANSITION_TIMEOUT_MS = 30_000;

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

const ERROR_TOASTS = ['PaymentFailedToast', 'ExpiredLightningToast', 'InsufficientSpendingToast'];

type MainnetLnSuiteConfig = {
  suiteTag: string;
  testTag: string;
  receiverName: string;
  seedEnv: string;
  addressEnv: string;
  amountEnv: string;
  defaultAmountSats: number;
};

type MainnetLnReceiver = {
  seed: string;
  lnAddress: string;
  amountSats: number;
};

function resolveEnvValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function resolveAmountSats(name: string, defaultAmountSats: number): number {
  const amountRaw = process.env[name] ?? `${defaultAmountSats}`;
  const amountSats = Number.parseInt(amountRaw, 10);

  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    throw new Error(`Invalid ${name} value: ${process.env[name]}`);
  }

  return amountSats;
}

function resolveMainnetLnReceiver(config: MainnetLnSuiteConfig): MainnetLnReceiver {
  return {
    seed: resolveEnvValue(config.seedEnv),
    lnAddress: resolveEnvValue(config.addressEnv),
    amountSats: resolveAmountSats(config.amountEnv, config.defaultAmountSats),
  };
}

async function waitForWalletReady(): Promise<void> {
  console.info('→ [LN] Waiting for wallet home screen...');
  await elementById('TotalBalance-primary').waitForDisplayed({ timeout: WALLET_SYNC_TIMEOUT_MS });
  const stabilizeMs = resolveLnStabilizeDelayMs();
  console.info(`→ [LN] Home screen ready, letting LN node stabilize (${stabilizeMs / 1000}s)...`);
  await sleep(stabilizeMs);
  console.info('→ [LN] Verify app status is ready');
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
  console.info('→ [LN] App status verified');
}

async function waitForAmountScreen(): Promise<void> {
  console.info('→ [LN] Waiting for amount entry screen...');
  await elementById('N0').waitForDisplayed({ timeout: SCREEN_TRANSITION_TIMEOUT_MS });
}

async function waitForConfirmScreen(): Promise<void> {
  console.info('→ [LN] Waiting for send confirmation screen...');
  await elementById('GRAB').waitForDisplayed({ timeout: SCREEN_TRANSITION_TIMEOUT_MS });
  await sleep(500);
}

async function waitForPaymentResult(): Promise<void> {
  console.info(`→ [LN] Waiting for payment result (timeout: ${PAYMENT_TIMEOUT_MS / 1000}s)...`);
  await browser.waitUntil(
    async () => {
      const success = await elementById('SendSuccess')
        .isDisplayed()
        .catch(() => false);
      if (success) {
        console.info('→ [LN] Payment succeeded');
        return true;
      }

      for (const toastId of ERROR_TOASTS) {
        const visible = await elementById(toastId)
          .isDisplayed()
          .catch(() => false);
        if (visible) {
          throw new Error(`Payment failed with error toast: ${toastId}`);
        }
      }

      return false;
    },
    {
      timeout: PAYMENT_TIMEOUT_MS,
      interval: 3_000,
      timeoutMsg: `Payment did not complete within ${PAYMENT_TIMEOUT_MS / 1000}s`,
    }
  );
}

async function sendPaymentToLnAddress(receiver: MainnetLnReceiver): Promise<void> {
  console.info('→ [LN] Restoring wallet...');
  await restoreWallet(receiver.seed, {
    expectBackupSheet: false,
    reinstall: false,
    expectAndroidAlert: false,
  });

  await waitForWalletReady();

  console.info(`→ [LN] Entering address: ${receiver.lnAddress}`);
  await enterAddress(receiver.lnAddress, { acceptCameraPermission: false, addressTimeout: 60_000 });
  await waitForAmountScreen();

  console.info(`→ [LN] Entering amount: ${receiver.amountSats} sats`);
  await enterAmount(receiver.amountSats);
  await tap('ContinueAmount');

  await waitForConfirmScreen();
  console.info('→ [LN] Swiping to send...');
  await dragOnElement('GRAB', 'right', 0.95);

  await waitForPaymentResult();
  await tap('Close');
  console.info('→ [LN] Test complete');
}

function defineMainnetLnSuite(config: MainnetLnSuiteConfig): void {
  describe(`${config.suiteTag} - ${config.receiverName} smoke`, () => {
    let receiver: MainnetLnReceiver;

    before(() => {
      receiver = resolveMainnetLnReceiver(config);
    });

    ciIt(`${config.testTag} - Can pay ${config.receiverName} LN address`, async () => {
      await sendPaymentToLnAddress(receiver);
    });
  });
}

defineMainnetLnSuite({
  suiteTag: '@strike_mainnet',
  testTag: '@strike_1',
  receiverName: 'Strike',
  seedEnv: 'STRIKE_SEED',
  addressEnv: 'STRIKE_LN_ADDR',
  amountEnv: 'STRIKE_AMOUNT_SATS',
  defaultAmountSats: 5,
});

defineMainnetLnSuite({
  suiteTag: '@wos_mainnet',
  testTag: '@wos_1',
  receiverName: 'Wallet of Satoshi',
  seedEnv: 'WOS_SEED',
  addressEnv: 'WOS_LN_ADDR',
  amountEnv: 'WOS_AMOUNT_SATS',
  defaultAmountSats: 5,
});
