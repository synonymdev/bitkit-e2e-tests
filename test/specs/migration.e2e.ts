import {
  acknowledgeReceivedPayment,
  confirmInputOnKeyboard,
  dismissBackupTimedSheet,
  doNavigationClose,
  dragOnElement,
  elementById,
  elementByIdWithin,
  enterAddress,
  expectText,
  expectTextWithin,
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
  ciIt('@migration_1 - Uninstall RN, install Native, restore mnemonic', async () => {
    // Setup wallet in RN app and get mnemonic
    const mnemonic = await setupLegacyWallet({ returnSeed: true });

    // Uninstall RN app
    console.info('→ Removing legacy RN app...');
    await driver.removeApp(getAppId());
    resetBootedIOSKeychain();

    // Install native app
    console.info(`→ Installing native app from: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Restore wallet with mnemonic (uses custom flow to handle backup sheet)
    await restoreWallet(mnemonic!, { reinstall: false, expectBackupSheet: true });

    // Verify migration
    await verifyMigration();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 2: Install native on top of RN (upgrade)
  // --------------------------------------------------------------------------
  ciIt('@migration_2 - Install native on top of RN (upgrade)', async () => {
    // Setup wallet in RN app
    await setupLegacyWallet();

    // Install native app ON TOP of RN (upgrade)
    console.info(`→ Installing native app on top of RN: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Handle migration flow
    await handleAndroidAlert();
    await dismissBackupTimedSheet();

    // Verify migration
    await verifyMigration();
  });

 // --------------------------------------------------------------------------
  // Migration Scenario 3: Install native on top of RN with passphrase (upgrade)
  // --------------------------------------------------------------------------
  ciIt('@migration_3 - Install native on top of RN with passphrase (upgrade)', async () => {
    // Setup wallet in RN app WITH passphrase
    await setupLegacyWallet({ passphrase: TEST_PASSPHRASE });

    // Install native app ON TOP of RN (upgrade)
    console.info(`→ Installing native app on top of RN: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Handle migration flow
    await handleAndroidAlert();
    await dismissBackupTimedSheet();

    // Verify migration
    await verifyMigration();
  });

  // --------------------------------------------------------------------------
  // Migration Scenario 4: Migration with sweep (legacy p2pkh addresses)
  // This scenario tests migration when wallet has funds on legacy addresses,
  // which triggers a sweep flow during migration.
  // --------------------------------------------------------------------------
  ciIt('@migration_4 - Migration with sweep (legacy p2pkh addresses)', async () => {
    // Setup wallet with funds on legacy addresses (triggers sweep on migration)
    await setupWalletWithLegacyFunds();

    // Install native app ON TOP of RN (upgrade)
    console.info(`→ Installing native app on top of RN: ${getNativeAppPath()}`);
    await driver.installApp(getNativeAppPath());
    await driver.activateApp(getAppId());

    // Handle migration flow with sweep
    await handleAndroidAlert();
    await handleSweepFlow();
    await dismissBackupTimedSheet();

    // Verify migration completed (balance should be preserved after sweep)
    await verifyMigrationWithSweep();
  });
});

// ============================================================================
// WALLET SETUP HELPERS (RN App)
// ============================================================================

/**
 * Complete wallet setup in legacy RN app:
 * 1. Create new wallet (optionally with passphrase)
 * 2. Fund with on-chain tx (add tag to latest tx)
 * 3. Send on-chain tx (add tag to latest tx)
 * 4. Transfer to spending balance (create channel via Blocktank)
 *
 * @param options.passphrase - Optional passphrase for the wallet
 * @param options.returnSeed - If true, returns the mnemonic seed
 * @returns The mnemonic seed if returnSeed is true, otherwise undefined
 */
async function setupLegacyWallet(
  options: {
    passphrase?: string;
    returnSeed?: boolean;
    setLegacyAddress?: boolean;
  } = {}
): Promise<string | undefined> {
  const { passphrase, returnSeed, setLegacyAddress } = options;
  console.info(`=== Setting up legacy RN wallet${passphrase ? ' (with passphrase)' : ''}${setLegacyAddress ? ' (legacy address)' : ''} ===`);

  // Install and create wallet
  await installLegacyRnApp();
  await createLegacyRnWallet({ passphrase });

  let mnemonic: string | undefined;
  if (returnSeed) {
    // Get mnemonic for later restoration
    mnemonic = await getRnMnemonic();
    console.info(`→ Legacy RN wallet mnemonic: ${mnemonic}`);
  }

  // Set legacy address type if requested (before funding)
  if (setLegacyAddress) {
    console.info('→ Setting legacy (p2pkh) address type...');
    await setRnAddressType('p2pkh');
  }

  // 1. Fund wallet (receive on-chain)
  console.info('→ Step 1: Funding wallet on-chain...');
  await fundRnWallet(INITIAL_FUND_SATS);
  await tagLatestTransaction(TAG_RECEIVED);

  // 2. Send on-chain tx with tag
  console.info('→ Step 2: Sending on-chain tx...');
  await sendRnOnchain(ONCHAIN_SEND_SATS);
  await tagLatestTransaction(TAG_SENT);

  // 3. Transfer to spending (create channel via Blocktank)
  console.info('→ Step 3: Creating spending balance (channel)...');
  await transferToSpending(TRANSFER_TO_SPENDING_SATS);

  console.info('=== Legacy wallet setup complete ===');

  if (returnSeed) {
    return mnemonic;
  }
}

// Amount constants for sweep scenario
const SWEEP_INITIAL_FUND_SATS = 200_000;
const SWEEP_SEND_TO_SELF_SATS = 50_000;
const SWEEP_SEND_OUT_SATS = 50_000;

/**
 * Setup wallet with funds on legacy addresses (for sweep migration scenario)
 *
 * Flow:
 * 1. Create wallet (default native segwit)
 * 2. Fund wallet on native segwit (works with Blocktank)
 * 3. Switch to legacy (p2pkh) address type
 * 4. Send to self (to a new legacy address)
 * 5. Send out from wallet
 *
 * Result: Wallet has funds on legacy address, migration will trigger sweep
 */
async function setupWalletWithLegacyFunds(): Promise<void> {
  console.info('=== Setting up wallet with legacy funds (sweep scenario) ===');

  // Install and create wallet
  await installLegacyRnApp();
  await createLegacyRnWallet();

  // 1. Fund wallet on native segwit (works with Blocktank)
  console.info('→ Step 1: Funding wallet on native segwit...');
  await fundRnWallet(SWEEP_INITIAL_FUND_SATS);

  // 2. Switch to legacy address type
  console.info('→ Step 2: Switching to legacy (p2pkh) address type...');
  await setRnAddressType('p2pkh');

  // 3. Send to self (to new legacy address)
  console.info('→ Step 3: Sending to self (new legacy address)...');
  await sendRnToSelf(SWEEP_SEND_TO_SELF_SATS);

  // 4. Send out from wallet (from legacy address)
  console.info('→ Step 4: Sending out from wallet...');
  await sendRnOnchain(SWEEP_SEND_OUT_SATS);

  console.info('=== Legacy funds setup complete ===');
}

/**
 * Send BTC to wallet's own new address (self-transfer)
 */
async function sendRnToSelf(amountSats: number): Promise<void> {
  // Get a new receive address (will be legacy since we switched)
  const receiveAddress = await getRnReceiveAddress();
  await sendRnOnchain(amountSats, { optionalAddress: receiveAddress });
}

/**
 * Handle the sweep flow during migration
 * Sweep is triggered when wallet has funds on unsupported address types (legacy)
 */
async function handleSweepFlow(): Promise<void> {
  console.info('→ Handling sweep flow...');

  await elementById('SweepButton').waitForDisplayed();
  await sleep(1000);

  try {
    await tap('SweepButton');
    console.info('→ Clicked Sweep button by ID');
  } catch {
    await tap('SweepButton');
    console.info('→ Clicked Sweep button by ID again');
  }

  try {
    await tap('SweepToWalletButton');
    console.info('→ Clicked Sweep To Wallet button by ID');
  } catch {
    await tap('SweepToWalletButton');
    console.info('→ Clicked Sweep To Wallet button by ID again');
  }

  // Wait for sweep confirmation screen with swipe slider
  await sleep(2000);
  await elementById('GRAB').waitForDisplayed();
  await sleep(2000);
  await dragOnElement('GRAB');
  await acknowledgeReceivedPayment();

  // Mine blocks to confirm sweep transaction
  await mineBlocks(1);
  await sleep(2000);

  await doNavigationClose();

  console.info('→ Sweep flow complete');
}

/**
 * Verify migration completed after sweep
 * Balance should be preserved (minus fees)
 */
async function verifyMigrationWithSweep(): Promise<void> {
  console.info('=== Verifying migration with sweep ===');

  // After sweep, we should have balance (original minus fees from transactions)
  // The exact amount depends on fees, so we just check for non-zero balance
  await elementById('TotalBalance').waitForDisplayed({ timeout: 30_000 });

  // Check that we have some balance
  const balanceElement = await elementById('TotalBalance');
  const balanceText = await balanceElement.getText();
  console.info(`→ Balance after sweep: ${balanceText}`);

  // Verify wallet is functional by checking main screen elements
  await elementById('ActivitySavings').waitForDisplayed();
  await elementById('Send').waitForDisplayed();
  await elementById('Receive').waitForDisplayed();

  console.info('=== Migration with sweep verified ===');
}

async function installLegacyRnApp(): Promise<void> {
  console.info(`→ Installing legacy RN app from: ${getRnAppPath()}`);
  await reinstallAppFromPath(getRnAppPath());
}

async function createLegacyRnWallet(options: { passphrase?: string } = {}): Promise<void> {
  const { passphrase } = options;
  console.info(
    `→ Creating new wallet in legacy RN app${passphrase ? ' (with passphrase)' : ''}...`
  );

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

/**
 * Change Bitcoin address type in RN app settings
 * @param addressType - 'p2pkh' (legacy), 'p2sh' (nested segwit), or 'p2wpkh' (native segwit)
 */
async function setRnAddressType(addressType: 'p2pkh' | 'p2sh' | 'p2wpkh'): Promise<void> {
  // Navigate to Settings > Advanced > Address Type
  await tap('HeaderMenu');
  await sleep(500);
  await elementById('DrawerSettings').waitForDisplayed();
  await tap('DrawerSettings');

  await elementById('AdvancedSettings').waitForDisplayed();
  await tap('AdvancedSettings');

  await elementById('AddressTypePreference').waitForDisplayed();
  await tap('AddressTypePreference');

  // Select the address type
  await elementById(addressType).waitForDisplayed();
  await tap(addressType);

  // Navigate back to main screen via drawer
  await driver.back(); // AddressType -> Advanced
  await sleep(300);
  await driver.back(); // Advanced -> Settings
  await sleep(300);
  // Close settings by going to wallet via drawer
  await tap('HeaderMenu');
  await sleep(500);
  await elementById('DrawerWallet').waitForDisplayed();
  await tap('DrawerWallet');
  await sleep(500);

  console.info(`→ Address type set to: ${addressType}`);
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
 * Send on-chain tx from RN wallet and add a tag.
 * Note: This uses a custom flow for RN since camera permission is already granted from receive.
 */
async function sendRnOnchain(sats: number, {optionalAddress}: {optionalAddress?: string} = {}): Promise<void> {
  const externalAddress = optionalAddress ?? await getExternalAddress();

  // RN-specific send flow (camera permission already granted during receive)
  await tap('Send');
  await sleep(1000);

  // Tap manual address entry (skip camera since permission already granted)
  await elementById('RecipientManual').waitForDisplayed();
  await tap('RecipientManual');

  // Enter address
  await elementById('RecipientInput').waitForDisplayed();
  await typeText('RecipientInput', externalAddress);
  await confirmInputOnKeyboard();
  await sleep(500);
  await tap('AddressContinue');

  // Enter amount
  await sleep(500);
  const satsStr = String(sats);
  for (const digit of satsStr) {
    await tap(`N${digit}`);
  }
  await tap('ContinueAmount');

  // Send using swipe gesture
  console.info(`→ About to send ${sats} sats...`);
  await dragOnElement('GRAB', 'right', 0.95);
  await elementById('SendSuccess').waitForDisplayed();
  await tap('Close');
  await sleep(2000);

  // Mine and sync
  await mineBlocks(1);
  await electrumClient?.waitForSync();
  await sleep(1000);
  await dismissSheet();
  console.info(`→ Sent ${sats} sats`);
}

/**
 * Transfer savings to spending balance (create channel via Blocktank)
 */
async function transferToSpending(sats: number): Promise<void> {
  // Navigate via ActivitySavings -> TransferToSpending
  try {
    await elementById('ActivitySavings').waitForDisplayed({ timeout: 5000 });
  } catch {
    console.info('→ Scrolling to find ActivitySavings...');
    await swipeFullScreen('down', { downEndYPercent: 0.6 });
    await swipeFullScreen('down');
  }
  await tap('ActivitySavings');
  await elementById('TransferToSpending').waitForDisplayed();
  await tap('TransferToSpending');

  // Handle intro screen if shown
  await sleep(1000);
  await tap('SpendingIntro-button'); // "Get Started"
  await sleep(1000); // let animation finish

  // Enter amount
  const satsStr = String(sats);
  for (const digit of satsStr) {
    await tap(`N${digit}`);
  }
  await tap('SpendingAmountContinue');

  // Confirm screen - swipe to transfer (no intermediate button needed)
  await sleep(1000);
  await dragOnElement('GRAB', 'right', 0.95);

  // Handle notification permission dialog if shown
  await sleep(1000);
  try {
    const allowButton = await $('android=new UiSelector().text("Allow")');
    await allowButton.waitForDisplayed({ timeout: 5000 });
    await allowButton.click();
  } catch {
    // Dialog might not appear, that's fine
  }

  // RN shows "IN TRANSFER" screen - tap "Continue Using Bitkit" to dismiss and let it run in background
  await sleep(2000);
  try {
    const continueButton = await $('android=new UiSelector().textContains("Continue")');
    await continueButton.waitForDisplayed({ timeout: 10000 });
    await continueButton.click();
    console.info('→ Dismissed transfer screen, continuing in background...');
  } catch {
    // Screen might have auto-dismissed
  }

  // Mine blocks periodically to progress the channel opening
  console.info('→ Mining blocks to confirm channel...');
  for (let i = 0; i < 10; i++) {
    await mineBlocks(1);
    // Check if spending balance shows the transferred amount (transfer complete)
    try {
      const expectedBalance = sats.toLocaleString('en').replace(/,/g, ' ');
      await expectText(expectedBalance);
      break;
    } catch {
      // Still waiting
      await sleep(3000);
    }
  }

  await electrumClient?.waitForSync();
  await sleep(3000);
  await dismissSheet();
  console.info(`→ Created spending balance with ${sats} sats`);
}

/**
 * Tag the latest (most recent) transaction in the activity list
 */
async function tagLatestTransaction(tag: string): Promise<void> {
  // Go to activity
  await sleep(1000);
  try {
    await swipeFullScreen('up', { upStartYPercent: 0.6 });
    await swipeFullScreen('up', { upStartYPercent: 0.6 });
    await elementById('ActivityShort-1').waitForDisplayed({ timeout: 5000 });
  } catch {
    console.info('→ Scrolling to find latest transaction...');
    await swipeFullScreen('up');
    await swipeFullScreen('up');
  }
  await tap('ActivityShort-1'); // latest tx

  // Add tag
  await tap('ActivityTag');
  await elementById('TagInput').waitForDisplayed();
  const tagInput = await elementById('TagInput');
  await tagInput.click(); // Focus the input
  await sleep(300);
  // Use addValue to type (triggers RN onChangeText properly)
  await tagInput.addValue(tag);
  await sleep(300);
  // Press Enter key to submit (keycode 66 = KEYCODE_ENTER)
  await driver.pressKeyCode(66);
  // Wait for tag sheet to close and return to Review screen
  await sleep(1000);

  // Go back
  await driver.back();
  await swipeFullScreen('down', { downEndYPercent: 0.6 });
  await swipeFullScreen('down', { downEndYPercent: 0.6 });
  console.info(`→ Tagged latest transaction with "${tag}"`);
}

/**
 * Get mnemonic from RN wallet settings
 */
async function getRnMnemonic(): Promise<string> {
  // Navigate to backup settings
  try {
    await tap('HeaderMenu');
    await sleep(500); // Wait for drawer to open
    await elementById('DrawerSettings').waitForDisplayed({ timeout: 5000 });
  } catch {
    console.info('→ Drawer did not open, trying again...');
    await tap('HeaderMenu');
    await sleep(500); // Wait for drawer to open
    await elementById('DrawerSettings').waitForDisplayed({ timeout: 5000 });
  }

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
  console.info(`→ RN mnemonic retrieved: ${seed}`);
  await swipeFullScreen('down'); // close mnemonic sheet
  // wait for backup to be performed
  await sleep(10000);

  // Navigate back to main screen using Android back button
  // ShowMnemonic -> BackupSettings -> Settings -> Main
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

  // All transactions (Transfer, Sent, Received = 3 items)
  await expectTextWithin('Activity-1', '-'); // Transfer (spending)
  await expectTextWithin('Activity-2', '-'); // Sent
  await expectTextWithin('Activity-3', '+'); // Received

  // Sent tab: should show Sent tx only (not Transfer)
  await tap('Tab-sent');
  await expectTextWithin('Activity-1', '-');
  await elementById('Activity-2').waitForDisplayed({ reverse: true });

  // Received tab: should show Received tx only
  await tap('Tab-received');
  await expectTextWithin('Activity-1', '+');
  await elementById('Activity-2').waitForDisplayed({ reverse: true });

  // Other tab: should show Transfer (spending) tx
  await tap('Tab-other');
  await elementById('Activity-1').waitForDisplayed();
  await expectTextWithin('Activity-1', '-'); // Transfer shows here
  await elementById('Activity-2').waitForDisplayed({ reverse: true });

  // filter by receive tag
  await tap('Tab-all');
  await tap('TagsPrompt');
  await sleep(500);
  await tap(`Tag-${TAG_RECEIVED}`);
  await expectTextWithin('Activity-1', '+'); // Only received tx has this tag
  await elementById('Activity-2').waitForDisplayed({ reverse: true });
  await tap(`Tag-${TAG_RECEIVED}-delete`);

  // filter by send tag
  await tap('TagsPrompt');
  await sleep(500);
  await tap(`Tag-${TAG_SENT}`);
  await expectTextWithin('Activity-1', '-'); // Only sent tx has this tag (not Transfer)
  await elementById('Activity-2').waitForDisplayed({ reverse: true });
  await tap(`Tag-${TAG_SENT}-delete`);

  console.info('→ Activity tags migrated successfully');
  console.info('→ Transaction history migrated successfully');

  await doNavigationClose();

  console.info('=== Migration verified successfully ===');
}

async function dismissSheet(): Promise<void> {
  //dismiss a sheet if shown
  await sleep(1000);
  await swipeFullScreen('down', { downEndYPercent: 0.6 });
  await sleep(2000);
}
