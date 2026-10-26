import fs from 'node:fs';
import path from 'node:path';
import {
  completeOnboarding,
  confirmInputOnKeyboard,
  doNavigationClose,
  elementById,
  expectTextWithin,
  getSavingsBalance,
  getSeed,
  getSpendingBalance,
  getTotalBalance,
  receiveOnchainFunds,
  restoreWallet,
  tap,
  typeText,
  waitForBackup,
  waitForWalletHome,
} from './actions';
import { getAppId, getBackend } from './constants';
import type { ElectrumClient } from './electrum';
import { getNativeAppPath, grantIOSCameraPermission, reinstallAppFromPath } from './setup';

const FUNDING_SATS = 200_000;
const DEPOSIT_TAG = 'e2e';

export type MigrationBalances = { savings: number; spending: number; total: number };

type NativeWallet = { seed: string; balances: MigrationBalances };

export async function readMigrationBalances(): Promise<MigrationBalances> {
  return {
    savings: await getSavingsBalance(),
    spending: await getSpendingBalance(),
    total: await getTotalBalance(),
  };
}

export async function expectMigrationBalances(expected: MigrationBalances) {
  let actual: MigrationBalances | undefined;
  await elementById('TotalBalance-primary').waitForDisplayed({ timeout: 180_000 });
  try {
    await driver.waitUntil(
      async () => {
        actual = await readMigrationBalances();
        return (
          actual.savings === expected.savings &&
          actual.spending === expected.spending &&
          actual.total === expected.total
        );
      },
      { timeout: 180_000, interval: 2_000, timeoutMsg: 'Migration balances did not recover' }
    );
  } catch (error) {
    throw new Error(
      `Migration balances: expected ${JSON.stringify(expected)}, last observed ${JSON.stringify(actual)}`,
      { cause: error }
    );
  }
}

/** Every invocation starts with a new wallet, including CI retries. */
export async function prepareNativeMigrationWallet(
  electrum: ElectrumClient,
  method: 'restore' | 'upgrade'
): Promise<NativeWallet> {
  if (getBackend() !== 'regtest') {
    throw new Error('Native migration archives use regtest. Run with BACKEND=regtest.');
  }
  recordStage(method, 'preparing-source');
  const source = process.env.PREVIOUS_NATIVE_APP_PATH;
  if (!source || !fs.existsSync(source)) {
    throw new Error(
      'PREVIOUS_NATIVE_APP_PATH must point to the downloaded previous native release.'
    );
  }
  if (fs.realpathSync(source) === fs.realpathSync(getNativeAppPath())) {
    throw new Error('Previous native source and current target must be separate artifacts.');
  }
  console.info(
    `→ Preparing native migration from ${process.env.PREVIOUS_NATIVE_VERSION ?? 'explicit source'}: ${path.resolve(source)}`
  );
  await reinstallAppFromPath(source, getAppId(), { strictKeychainReset: true });
  await completeOnboarding();
  await receiveOnchainFunds({ sats: FUNDING_SATS, verifyBalances: true });
  await electrum.waitForSync();

  // Tag the sole deposit; row order is unambiguous here.
  await tap('ActivitySavings');
  await tap('Activity-1');
  await tap('ActivityTag');
  await typeText('TagInput', DEPOSIT_TAG);
  await tap('ActivityTagsSubmit');
  if (driver.isAndroid) await confirmInputOnKeyboard();
  await returnToWalletHome();

  // No spending balance: Blocktank staging no longer creates orders (synonymdev/blocktank-lsp-http#168).
  let balances = await readMigrationBalances();
  try {
    await driver.waitUntil(
      async () => {
        balances = await readMigrationBalances();
        return (
          balances.savings === FUNDING_SATS &&
          balances.spending === 0 &&
          balances.total === FUNDING_SATS
        );
      },
      { timeout: 30_000, interval: 1_000, timeoutMsg: 'Source balances did not settle' }
    );
  } catch (error) {
    throw new Error(`Source wallet funding incomplete: ${JSON.stringify(balances)}`, {
      cause: error,
    });
  }
  // Reading the seed marks backup complete, so do this after first-funding reminders.
  const seed = await getSeed({
    readBeforeReveal:
      driver.isAndroid && process.env.PREVIOUS_NATIVE_VERSION?.replace(/^v/, '') === '2.5.0',
  });
  await waitForBackup();
  recordStage(method, 'source-backed-up', balances);
  return { seed, balances };
}

async function returnToWalletHome() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const savingsVisible = await elementById('ActivitySavings')
      .isDisplayed()
      .catch(() => false);
    const spendingVisible = await elementById('ActivitySpending')
      .isDisplayed()
      .catch(() => false);
    if (savingsVisible && spendingVisible) return;

    const back = elementById('NavigationBack');
    if (!(await back.isDisplayed().catch(() => false))) break;
    await back.click();
    await driver.pause(500);
  }

  throw new Error('Could not return to the wallet home after tagging the migration deposit');
}

export async function installNativeMigrationTarget(method: 'restore' | 'upgrade', seed: string) {
  recordStage(method, 'installing-target');
  await driver.terminateApp(getAppId());
  if (method === 'restore') {
    await reinstallAppFromPath(getNativeAppPath(), getAppId(), { strictKeychainReset: true });
    // Require fresh onboarding: retained Keychain data must never satisfy a restore test.
    await elementById('Continue').waitForDisplayed({ timeout: 60_000 });
    await restoreWallet(seed, { reinstall: false });
  } else {
    await driver.installApp(getNativeAppPath());
    grantIOSCameraPermission();
    await driver.activateApp(getAppId());
    // Native upgrades need not display the RN-specific MIGRATING screen.
    await waitForWalletHome({ timeout: 180_000 });
  }
}

async function verifyNativeHistory() {
  await tap('ActivityShowAll');
  await tap('Tab-received');
  await tap('TagsPrompt');
  const tag = elementById(`Tag-${DEPOSIT_TAG}`);
  await tag.waitForDisplayed({ timeout: 60_000 });
  let previousPosition = await tag.getLocation();
  let stableSamples = 0;
  await driver.waitUntil(
    async () => {
      const position = await tag.getLocation();
      stableSamples =
        position.x === previousPosition.x && position.y === previousPosition.y
          ? stableSamples + 1
          : 0;
      previousPosition = position;
      return stableSamples >= 3;
    },
    { timeout: 10_000, interval: 250, timeoutMsg: 'Tag selector did not finish opening' }
  );
  await tag.click();
  await elementById(`Tag-${DEPOSIT_TAG}-delete`).waitForDisplayed({ timeout: 10_000 });
  await expectTextWithin('Activity-1', '200 000');
  await expectTextWithin('Activity-1', '+');
  await elementById('Activity-2').waitForDisplayed({ reverse: true });
  await tap(`Tag-${DEPOSIT_TAG}-delete`);
  await doNavigationClose();
}

export async function verifyNativeMigration(
  balances: MigrationBalances,
  method: 'restore' | 'upgrade'
) {
  await expectMigrationBalances(balances);
  recordStage(method, 'target-recovered', await readMigrationBalances());
  await verifyNativeHistory();

  await waitForBackup();
  await driver.terminateApp(getAppId());
  await driver.activateApp(getAppId());
  await expectMigrationBalances(balances);
  recordStage(method, 'relaunch-verified', await readMigrationBalances());
  await verifyNativeHistory();
}

function recordStage(method: string, stage: string, balances?: MigrationBalances) {
  const directory = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(directory, { recursive: true });
  const event = {
    time: new Date().toISOString(),
    platform: driver.isIOS ? 'ios' : 'android',
    method,
    stage,
    attempt: process.env.ATTEMPT ?? 'local',
    sourceVersion: process.env.PREVIOUS_NATIVE_VERSION,
    sourcePath: process.env.PREVIOUS_NATIVE_APP_PATH,
    balances,
  };
  fs.appendFileSync(
    path.join(directory, `migration-native-${method}.jsonl`),
    `${JSON.stringify(event)}\n`
  );
  console.info('→ Native migration:', event);
}
