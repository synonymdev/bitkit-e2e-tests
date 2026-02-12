import {
  dragOnElement,
  elementById,
  enterAmount,
  enterAddress,
  restoreWallet,
  tap,
} from '../../helpers/actions';
import { ciIt } from '../../helpers/suite';

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

async function sendPaymentToLnAddress(receiver: MainnetLnReceiver): Promise<void> {
  await restoreWallet(receiver.seed, {
    expectBackupSheet: false,
    reinstall: false,
    expectAndroidAlert: false,
  });

  await enterAddress(receiver.lnAddress, { acceptCameraPermission: false });
  await enterAmount(receiver.amountSats);

  await tap('ContinueAmount');
  await dragOnElement('GRAB', 'right', 0.95);
  await elementById('SendSuccess').waitForDisplayed({ timeout: 60_000 });
  await tap('Close');
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
