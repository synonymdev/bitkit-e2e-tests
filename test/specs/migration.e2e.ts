import {
  dismissBackupTimedSheet,
  doNavigationClose,
  elementById,
  elementByIdWithin,
  expectText,
  expectTextWithin,
  handleAndroidAlert,
  restoreWallet,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
  waitForSetupWalletScreenFinish,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import {
  getNativeAppPath,
  getRnAppPath,
  reinstallAppFromPath,
  resetBootedIOSKeychain,
} from '../helpers/setup';
import { getAppId } from '../helpers/constants';

const MIGRATION_MNEMONIC =
  process.env.MIGRATION_MNEMONIC ??
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('@migration - Legacy RN migration', () => {
  ciIt('@migration_1 - Remove legacy RN app and install native app', async () => {
    await installLegacyRnApp();
    await restoreLegacyRnWallet(MIGRATION_MNEMONIC);

    // Reinstall native app
    console.info(`→ Reinstalling app from: ${getNativeAppPath()}`);
    await driver.removeApp(getAppId());
    resetBootedIOSKeychain();
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // restore wallet and verify migration
    await restoreWallet(MIGRATION_MNEMONIC, { reinstall: false });
    await verifyMigration();
  });

  ciIt('@migration_2 - Install native app on top of legacy RN app', async () => {
    await installLegacyRnApp();
    await restoreLegacyRnWallet(MIGRATION_MNEMONIC);

    // Install native app
    console.info(`→ Installing app from: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // verify migration
    await handleAndroidAlert();
    await expectText('Migration Complete');
    await dismissBackupTimedSheet();
    await verifyMigration();
  });
});

async function installLegacyRnApp() {
  await reinstallAppFromPath(getRnAppPath());
}

async function restoreLegacyRnWallet(seed: string) {
  await elementById('Continue').waitForDisplayed();
  await tap('Check1');
  await tap('Check2');
  await tap('Continue');

  await tap('SkipIntro');

  await tap('RestoreWallet');
  await tap('MultipleDevices-button');

  await typeText('Word-0', seed);
  await sleep(1500);
  await tap('RestoreButton');
  await waitForSetupWalletScreenFinish();

  const getStarted = await elementById('GetStartedButton');
  await getStarted.waitForDisplayed({ timeout: 120000 });
  await tap('GetStartedButton');
  await sleep(1000);
  await expectText(totalBalance);
  await expectText(savingBalance);
  await expectText(spendingBalance);
}

const totalBalance = '141 321';
const savingBalance = '91 766';
const spendingBalance = '49 555';

async function verifyMigration() {
  console.info('→ Verifying migrated wallet balances...');
  const totalBalanceEl = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
  await expect(totalBalanceEl).toHaveText(totalBalance);
  await expectTextWithin('ActivitySpending', spendingBalance);
  await expectTextWithin('ActivitySavings', savingBalance);

  console.info('→ Verify transaction details...');
  await swipeFullScreen('up');
  await swipeFullScreen('up');
  await tap('ActivityShowAll');

  // All transactions
  await expectTextWithin('Activity-1', '-');
  await expectTextWithin('Activity-2', '+');
  await expectTextWithin('Activity-3', '-');
  await expectTextWithin('Activity-4', '-');
  await expectTextWithin('Activity-5', '+');
  await expectTextWithin('Activity-6', '+');

  // Sent
  await tap('Tab-sent');
  await expectTextWithin('Activity-1', '-');
  await expectTextWithin('Activity-2', '-');
  await elementById('Activity-3').waitForDisplayed({ reverse: true });

  // Received
  await tap('Tab-received');
  await expectTextWithin('Activity-1', '+');
  await expectTextWithin('Activity-2', '+');
  await expectTextWithin('Activity-3', '+');
  await elementById('Activity-4').waitForDisplayed({ reverse: true });

  // Other
  await tap('Tab-other');
  await elementById('Activity-1').waitForDisplayed();
  await elementById('Activity-2').waitForDisplayed({ reverse: true });

  // filter by receive tag
  await tap('Tab-all');
  await tap('TagsPrompt');
  await sleep(500);
  await tap('Tag-received ');
  await expectTextWithin('Activity-1', '+');
  await expectTextWithin('Activity-2', '+');
  await elementById('Activity-3').waitForDisplayed({ reverse: true });
  await tap('Tag-received -delete');

  // filter by send tag
  await tap('TagsPrompt');
  await sleep(500);
  await tap('Tag-sent');
  await expectTextWithin('Activity-1', '-');
  await expectTextWithin('Activity-2', '-');
  await elementById('Activity-3').waitForDisplayed({ reverse: true });
  await tap('Tag-sent-delete');

  await doNavigationClose();
}
