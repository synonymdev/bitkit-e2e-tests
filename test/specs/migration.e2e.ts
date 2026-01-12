import {
  confirmInputOnKeyboard,
  dismissBackupTimedSheet,
  doNavigationClose,
  dragOnElement,
  elementById,
  elementByIdWithin,
  enterAddress,
  expectText,
  getAccessibleText,
  getReceiveAddress,
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
import initElectrum, { ElectrumClient } from '../helpers/electrum';
import { deposit, ensureLocalFunds, getExternalAddress, mineBlocks } from '../helpers/regtest';

// Module-level electrum client (set in before hook)
let electrumClient: ElectrumClient;

// ============================================================================
// MIGRATION TEST CONFIGURATION
// ============================================================================

// Tags used for testing migration
const TAG_RECEIVED = 'received';
const TAG_SENT = 'sent';

// Amounts for testing
const INITIAL_FUND_SATS = 500_000; // 500k sats initial funding
const ONCHAIN_SEND_SATS = 50_000; // 50k sats for on-chain send test
const TRANSFER_TO_SPENDING_SATS = 100_000; // 100k for creating a channel

// Passphrase for passphrase-protected wallet tests
const TEST_PASSPHRASE = 'supersecret';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('@migration - Migration from legacy RN app to native app', () => {

  before(async () => {
    await ensureLocalFunds();
    electrumClient = await initElectrum();
  });

  after(async () => {
    await electrumClient?.stop();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 1: Uninstall RN, install Native, restore mnemonic
  // --------------------------------------------------------------------------
  ciIt('@migration_1 - Uninstall RN app and install native app', async () => {
    // Setup wallet in RN app
    await setupLegacyWallet();

    // Get mnemonic before uninstalling
    const mnemonic = await getRnMnemonic();
    await sleep(1000);
    // Uninstall RN app
    console.info('→ Removing legacy RN app...');
    await driver.removeApp(getAppId());
    resetBootedIOSKeychain();

    // Install native app
    console.info(`→ Installing native app from: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Restore wallet with mnemonic (uses custom flow to handle backup sheet)
    await restoreWallet(mnemonic, { reinstall: false, expectBackupSheet: true });

    // Verify migration
    await verifyMigration();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 2: Install native on top of RN (upgrade)
  // --------------------------------------------------------------------------
  ciIt('@migration_2 - Install native app on top of RN app', async () => {
    // Setup wallet in RN app
    await setupLegacyWallet();

    // Install native app ON TOP of RN (upgrade)
    console.info(`→ Installing native app on top of RN: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Handle migration flow
    await handleAndroidAlert();
    await expectText('Migration Complete');
    await dismissBackupTimedSheet();

    // Verify migration
    await verifyMigration();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 3: Uninstall RN, install Native, restore with passphrase
  // --------------------------------------------------------------------------
  ciIt('@migration_3 - Uninstall RN app and install native app (with passphrase)', async () => {
    // Setup wallet in RN app WITH passphrase
    await setupLegacyWallet({ passphrase: TEST_PASSPHRASE });

    // Get mnemonic before uninstalling
    const mnemonic = await getRnMnemonic();
    await sleep(10000);

    // Uninstall RN app
    console.info('→ Removing legacy RN app...');
    await driver.removeApp(getAppId());
    resetBootedIOSKeychain();

    // Install native app
    console.info(`→ Installing native app from: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Restore wallet with mnemonic AND passphrase
    await restoreWallet(mnemonic, {
      reinstall: false,
      expectBackupSheet: true,
      passphrase: TEST_PASSPHRASE,
    });

    // Verify migration
    await verifyMigration();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 4: Install native on top of RN with passphrase (upgrade)
  // --------------------------------------------------------------------------
  ciIt('@migration_4 - Install native app on top of RN app (with passphrase)', async () => {
    // Setup wallet in RN app WITH passphrase
    await setupLegacyWallet({ passphrase: TEST_PASSPHRASE });

    // Install native app ON TOP of RN (upgrade)
    console.info(`→ Installing native app on top of RN: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Handle migration flow
    await handleAndroidAlert();
    await expectText('Migration Complete');
    await dismissBackupTimedSheet();

    // Verify migration
    await verifyMigration();
  });
});

// ============================================================================
// WALLET SETUP HELPERS (RN App)
// ============================================================================

/**
 * Complete wallet setup in legacy RN app:
 * 1. Create new wallet (optionally with passphrase)
 * 2. Fund with on-chain tx
 *
 * TODO: Add these steps once basic flow works:
 * 3. Send on-chain tx (with tag)
 * 4. Transfer to spending balance (create channel)
 */
async function setupLegacyWallet(options: { passphrase?: string } = {}): Promise<void> {
  const { passphrase } = options;
  console.info(`=== Setting up legacy RN wallet${passphrase ? ' (with passphrase)' : ''} ===`);

  // Install and create wallet
  await installLegacyRnApp();
  await createLegacyRnWallet({ passphrase });

  // 1. Fund wallet (receive on-chain)
  console.info('→ Step 1: Funding wallet on-chain...');
  await fundRnWallet(INITIAL_FUND_SATS);

  // TODO: Add more steps once basic migration works
  // // 2. Send on-chain tx with tag
  // console.info('→ Step 2: Sending on-chain tx...');
  // await sendRnOnchainWithTag(ONCHAIN_SEND_SATS, TAG_SENT);

  // // 3. Transfer to spending (create channel via Blocktank)
  // console.info('→ Step 3: Creating spending balance (channel)...');
  // await transferToSpending(TRANSFER_TO_SPENDING_SATS);

  console.info('=== Legacy wallet setup complete ===');
}

async function installLegacyRnApp(): Promise<void> {
  console.info(`→ Installing legacy RN app from: ${getRnAppPath()}`);
  await reinstallAppFromPath(getRnAppPath());
}

async function createLegacyRnWallet(options: { passphrase?: string } = {}): Promise<void> {
  const { passphrase } = options;
  console.info(`→ Creating new wallet in legacy RN app${passphrase ? ' (with passphrase)' : ''}...`);

  await elementById('Continue').waitForDisplayed();
  await tap('Check1');
  await tap('Check2');
  await tap('Continue');
  await tap('SkipIntro');

  // Set passphrase if provided (before creating wallet)
  if (passphrase) {
    console.info('→ Setting passphrase...');
    await tap('Passphrase');
    await typeText('PassphraseInput', passphrase);
    await confirmInputOnKeyboard();
    await tap('CreateNewWallet');
  } else {
  // Create new wallet
    await tap('NewWallet');
  }
  await waitForSetupWalletScreenFinish();

  // Wait for wallet to be created
  for (let i = 1; i <= 3; i++) {
    try {
      await tap('WalletOnboardingClose');
      break;
    } catch {
      if (i === 3) throw new Error('Tapping "WalletOnboardingClose" timeout');
    }
  }
  console.info('→ Legacy RN wallet created');
}

// ============================================================================
// RN APP INTERACTION HELPERS
// ============================================================================

/**
 * Get receive address from RN app (uses existing helper)
 */
async function getRnReceiveAddress(): Promise<string> {
  const address = await getReceiveAddress('bitcoin');
  console.info(`→ RN receive address: ${address}`);
  await swipeFullScreen('down'); // close receive sheet
  return address;
}

/**
 * Fund RN wallet with on-chain tx
 */
async function fundRnWallet(sats: number): Promise<void> {
  const address = await getRnReceiveAddress();

  // Deposit and mine
  await deposit(address, sats);
  await mineBlocks(1);
  await electrumClient?.waitForSync();

  // Wait for balance to appear
  await sleep(3000);
  const expectedBalance = sats.toLocaleString('en').replace(/,/g, ' ');
  await expectText(expectedBalance, { strategy: 'contains' });
  console.info(`→ Received ${sats} sats`);

  // Ensure we're back on main screen (dismiss any sheets/modals)
  await swipeFullScreen('down');
  await sleep(500);
}

/**
 * Send on-chain tx from RN wallet and add a tag
 */
async function sendRnOnchainWithTag(sats: number, tag: string): Promise<void> {
  const externalAddress = await getExternalAddress();

  // Use existing helper for address entry (handles camera permission)
  await enterAddress(externalAddress);

  // Enter amount
  const satsStr = String(sats);
  for (const digit of satsStr) {
    await tap(`N${digit}`);
  }
  await tap('ContinueAmount');

  // Add tag before sending
  await elementById('TagsAddSend').waitForDisplayed();
  await tap('TagsAddSend');
  await typeText('TagInputSend', tag);
  await tap('TagsAddSend'); // confirm tag

  // Send
  await dragOnElement('GRAB', 'right', 0.95);
  await elementById('SendSuccess').waitForDisplayed();
  await tap('Close');

  // Mine and sync
  await mineBlocks(1);
  await electrumClient?.waitForSync();
  await sleep(2000);
  console.info(`→ Sent ${sats} sats with tag "${tag}"`);
}

/**
 * Transfer savings to spending balance (create channel via Blocktank)
 */
async function transferToSpending(sats: number): Promise<void> {
  // Navigate to transfer
  await tap('Suggestion-lightning');
  await elementById('TransferIntro-button').waitForDisplayed();
  await tap('TransferIntro-button');
  await tap('FundTransfer');
  await tap('SpendingIntro-button');
  await sleep(2000); // let animation finish

  // Enter amount
  const satsStr = String(sats);
  for (const digit of satsStr) {
    await tap(`N${digit}`);
  }
  await tap('SpendingAmountContinue');

  // Confirm with default settings
  await tap('SpendingConfirmDefault');
  await dragOnElement('GRAB', 'right', 0.95);

  // Wait for channel to be created
  await elementById('TransferSuccess').waitForDisplayed({ timeout: 120000 });
  await tap('TransferSuccess');

  // Mine blocks to confirm channel
  await mineBlocks(6);
  await electrumClient?.waitForSync();
  await sleep(5000);
  console.info(`→ Created spending balance with ${sats} sats`);
}

/**
 * Tag the latest (most recent) transaction in the activity list
 */
async function tagLatestTransaction(tag: string): Promise<void> {
  // Go to activity
  await sleep(1000);
  await swipeFullScreen('up');
  await swipeFullScreen('up');
  await tap('ActivityShowAll');

  // Tap latest transaction
  await tap('Activity-1');

  // Add tag
  await elementById('ActivityTags').waitForDisplayed();
  await tap('ActivityTags');
  await typeText('TagInput', tag);
  await tap('ActivityTagsSubmit');

  // Go back
  await doNavigationClose();
  await doNavigationClose();
  console.info(`→ Tagged latest transaction with "${tag}"`);
}

/**
 * Get mnemonic from RN wallet settings
 */
async function getRnMnemonic(): Promise<string> {
  // Navigate to backup settings
  await tap('HeaderMenu');
  await sleep(500); // Wait for drawer to open
  await elementById('DrawerSettings').waitForDisplayed();
  await tap('DrawerSettings');
  await elementById('BackupSettings').waitForDisplayed();
  await tap('BackupSettings');

  // Tap "Backup Wallet" to show mnemonic screen
  await elementById('BackupWallet').waitForDisplayed();
  await tap('BackupWallet');

  // Show seed (note: typo in RN code is "SeedContaider")
  await elementById('SeedContaider').waitForDisplayed();
  const seedElement = await elementById('SeedContaider');
  const seed = await getAccessibleText(seedElement);

  if (!seed) throw new Error('Could not read seed from "SeedContaider"');
  console.info(`→ RN mnemonic retrieved: ${seed}...`);

  // Navigate back to main screen using Android back button
  // ShowMnemonic -> BackupSettings -> Settings -> Main
  await driver.back();
  await sleep(300);
  await driver.back();
  await sleep(300);
  await driver.back();
  await sleep(500);

  return seed;
}

// ============================================================================
// MIGRATION VERIFICATION
// ============================================================================

/**
 * Verify migration was successful (basic version - just checks balance)
 */
async function verifyMigration(): Promise<void> {
  console.info('=== Verifying migration ===');

  // Verify we have balance (should match what we funded)
  const totalBalanceEl = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
  const balanceText = await totalBalanceEl.getText();
  console.info(`→ Total balance: ${balanceText}`);

  // Basic check - we should have funds
  const balanceNum = parseInt(balanceText.replace(/\s/g, ''), 10);
  if (balanceNum <= 0) {
    throw new Error(`Expected positive balance, got: ${balanceText}`);
  }
  console.info('→ Balance migrated successfully');

  // Go to activity list to verify transactions exist
  await swipeFullScreen('up');
  await swipeFullScreen('up');
  await tap('ActivityShowAll');

  // Verify we have at least one transaction (the receive)
  await elementById('Activity-1').waitForDisplayed();
  console.info('→ Transaction history migrated successfully');

  await doNavigationClose();

  console.info('=== Migration verified successfully ===');
}
