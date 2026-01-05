import { elementById, restoreWallet, sleep, tap, typeText, waitForSetupWalletScreenFinish } from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import { getNativeAppPath, getRnAppPath, reinstallAppFromPath } from '../helpers/setup';

const MIGRATION_MNEMONIC =
  process.env.MIGRATION_MNEMONIC ??
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('@migration - Legacy RN migration', () => {
  ciIt('@migration_1 - Can restore legacy RN wallet from mnemonic', async () => {
    await installLegacyRnApp();
    await restoreLegacyRnWallet(MIGRATION_MNEMONIC);

    // Restore into native app
    // await installNativeApp();
    await restoreWallet(MIGRATION_MNEMONIC);
  });
});

async function installNativeApp() {
  await reinstallAppFromPath(getNativeAppPath());
}
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
  await getStarted.waitForDisplayed( { timeout: 120000 });
  await tap('GetStartedButton');
  await sleep(1000);
}
