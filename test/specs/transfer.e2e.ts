import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  sleep,
  receiveOnchainFunds,
  tap,
  expectText,
  elementByText,
  elementsById,
  elementById,
  multiTap,
  dragOnElement,
  expectTextWithin,
  swipeFullScreen,
  elementByIdWithin,
  enterAddress,
  dismissQuickPayIntro,
  doNavigationClose,
  waitForToast,
  waitForToastBestEffort,
  acknowledgeExternalSuccess,
  dismissBackgroundPaymentsTimedSheet,
  expectNoTextWithin,
  enterAmount,
  expectSavingsBalance,
  getSpendingBalance,
  getAmountUnder,
  tryDismissBackgroundPaymentsIfVisible,
  tryDismissQuickPayIntroIfVisible,
} from '../helpers/actions';
import {
  checkChannelStatus,
  connectToLND,
  getLDKNodeID,
  setupLND,
  waitForActiveChannel,
  waitForPeerConnection,
} from '../helpers/lnd';
import { lndConfig } from '../helpers/constants';
import { ensureLocalFunds, getBitcoinRpc, mineBlocks } from '../helpers/regtest';

import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import { openSettings } from '../helpers/navigation';

async function isDisplayed(testId: string): Promise<boolean> {
  return elementById(testId)
    .isDisplayed()
    .catch(() => false);
}

/** Timed sheets can be queued behind one another, so dismiss until Home is clear. */
async function dismissHomeSheetsIfPresent() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await tryDismissBackgroundPaymentsIfVisible()) {
      continue;
    }
    if (await tryDismissQuickPayIntroIfVisible()) {
      continue;
    }
    return;
  }
}

async function openTransferToSpending() {
  await dismissHomeSheetsIfPresent();
  await tap('ActivitySavings');
  await browser.waitUntil(
    async () => {
      await dismissHomeSheetsIfPresent();
      return isDisplayed('TransferToSpending');
    },
    {
      timeout: 60_000,
      interval: 1_000,
      timeoutMsg: 'Savings did not become interactive',
    }
  );
  await tap('TransferToSpending');
  await browser.waitUntil(
    async () => {
      if (await isDisplayed('SpendingAmountAvailable')) {
        return true;
      }
      if (await isDisplayed('SpendingIntro-button')) {
        await tap('SpendingIntro-button');
      }
      return false;
    },
    {
      timeout: 60_000,
      interval: 1_000,
      timeoutMsg: 'Transfer amount screen did not open after the intro',
    }
  );
  await elementById('SpendingAmountContinue').waitForEnabled({ timeout: 60_000 });
}

/** Tap Continue again only if the amount screen is still visible. */
async function continueFromAmount() {
  await browser.waitUntil(
    async () => {
      if (await isDisplayed('SpendingConfirmMore')) {
        return true;
      }
      if (await isDisplayed('SpendingAmountContinue')) {
        await tap('SpendingAmountContinue');
      }
      return false;
    },
    {
      timeout: 90_000,
      interval: 1_000,
      timeoutMsg: 'Spending confirmation did not open from the amount screen',
    }
  );
}

async function continueFromAdvanced() {
  await expectText('—', { visible: false, timeout: 60_000 });
  await browser.waitUntil(
    async () => {
      if (await isDisplayed('SpendingConfirmDefault')) {
        return true;
      }
      if (await isDisplayed('SpendingAdvancedContinue')) {
        await tap('SpendingAdvancedContinue');
      }
      return false;
    },
    {
      timeout: 90_000,
      interval: 1_000,
      timeoutMsg: 'Spending confirmation did not open from the advanced screen',
    }
  );
}

async function waitForHome(timeout = 60_000) {
  await browser.waitUntil(
    async () => {
      await dismissHomeSheetsIfPresent();
      return (await isDisplayed('ActivitySavings')) && (await isDisplayed('ActivitySpending'));
    },
    {
      timeout,
      interval: 2_000,
      timeoutMsg: 'Wallet Home did not become visible',
    }
  );
}

async function returnHomeFromSavings() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dismissHomeSheetsIfPresent();
    await tap('NavigationBack');
    try {
      await waitForHome(5_000);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      console.info(`→ Savings back navigation did not land on Home (attempt ${attempt})`);
    }
  }
}

async function isProcessingPaymentDisplayed(): Promise<boolean> {
  return elementByText('Processing payment', 'exact')
    .isDisplayed()
    .catch(() => false);
}

/**
 * Channel detail after a Blocktank buy: "Processing payment" is transient.
 * Fast settle can skip it by the time Settings → Channels opens; then the
 * same usable flag as checkChannelStatus (IsUsableYes after swipe up).
 */
async function expectProcessingOrUsableChannel() {
  if (await isProcessingPaymentDisplayed()) {
    console.info('→ Channel still shows Processing payment');
    return;
  }
  console.info('→ Processing payment not visible; asserting IsUsableYes after swipe');
  await swipeFullScreen('up');
  await elementById('IsUsableYes').waitForDisplayed();
}

/**
 * Activity-1 starts as the on-chain receive until Transfer is inserted above it
 * (same race as @transfer_max ActivityShort-0/1). Wait for Transfer labels at
 * 60s instead of assuming Activity-2/3 exist at the default 30s.
 */
async function expectSavingsTransferRows(transferCount: 1 | 2) {
  const requiredRows =
    transferCount === 1 ? ['Activity-1', 'Activity-2'] : ['Activity-1', 'Activity-2', 'Activity-3'];
  await browser.waitUntil(
    async () => {
      await dismissHomeSheetsIfPresent();
      for (const rowId of requiredRows) {
        if (!(await isDisplayed(rowId))) {
          return false;
        }
      }
      return true;
    },
    {
      timeout: 60_000,
      interval: 1_000,
      timeoutMsg: `Savings did not show ${transferCount} transfer row(s)`,
    }
  );

  switch (transferCount) {
    case 1:
      await expectTextWithin('Activity-1', 'Transfer', { timeout: 60_000 });
      await expectTextWithin('Activity-1', '-');
      return;
    case 2:
      await expectTextWithin('Activity-1', 'Transfer', { timeout: 60_000 });
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', 'Transfer', { timeout: 60_000 });
      await expectTextWithin('Activity-2', '-');
      return;
    default: {
      const _exhaustive: never = transferCount;
      throw new Error(`Unexpected transferCount: ${_exhaustive}`);
    }
  }
}

async function confirmSpendingTransfer() {
  await dragOnElement('GRAB', 'right', 0.95);
  await elementById('LightningSettingUp').waitForDisplayed({ timeout: 90_000 });
  await tap('TransferSuccess-button');
  await waitForHome();
}

/**
 * A successful Blocktank order is not the end of the transfer: the funding
 * transaction still needs confirmations before the spending balance is usable.
 * Wait briefly, then mine a bounded confirmation batch plus a few paced
 * single-block retries. The balance itself is the definitive end-to-end
 * assertion because the readiness toast can be missed.
 */
async function settleAndExpectSpendingBalance(
  expected: number,
  waitForSync: () => Promise<unknown>
) {
  let lastBalance = -1;
  const waitForExpectedBalance = async (timeout: number): Promise<boolean> => {
    try {
      await browser.waitUntil(
        async () => {
          await dismissHomeSheetsIfPresent();
          lastBalance = await getSpendingBalance().catch(() => -1);
          return lastBalance === expected;
        },
        { timeout, interval: 2_000 }
      );
      return true;
    } catch {
      return false;
    }
  };

  console.info(`→ Waiting for spending balance ${expected}`);
  if (await waitForExpectedBalance(30_000)) {
    return;
  }

  // Blocktank can broadcast a later channel while the first one is already
  // usable. Confirm the current chain once, then add at most one block per
  // round so a late broadcast is picked up without an uncontrolled mine loop.
  const confirmationBatches = [6, 1, 1, 1, 1, 1];
  for (const blocks of confirmationBatches) {
    console.info(
      `→ Spending is ${lastBalance}; mining ${blocks} block(s) before the next settlement check`
    );
    await mineBlocks(blocks);
    await waitForSync();
    await waitForToastBestEffort('SpendingBalanceReadyToast', { timeout: 5_000 });
    if (await waitForExpectedBalance(45_000)) {
      return;
    }
  }

  throw new Error(
    `Spending balance did not settle to ${expected}; last readable balance was ${lastBalance}`
  );
}

async function elementContainsAmount(testId: string, expected: number): Promise<boolean> {
  if (driver.isAndroid) {
    return (await getAmountUnder(testId).catch(() => -1)) === expected;
  }

  const element = elementById(testId);
  const candidates = await Promise.all([
    element.getText().catch(() => ''),
    element.getAttribute('label').catch(() => ''),
    element.getAttribute('value').catch(() => ''),
  ]);
  const expectedDigits = String(expected);
  return candidates.some((candidate) =>
    String(candidate).replace(/\D/g, '').includes(expectedDigits)
  );
}

async function openChannelWithTotalSize(expected: number) {
  const channelCount = await (await elementsById('Channel')).length;
  for (let index = 0; index < channelCount; index += 1) {
    const channels = await elementsById('Channel');
    await channels[index].click();
    await elementById('TotalSize').waitForDisplayed();
    if (await elementContainsAmount('TotalSize', expected)) {
      return;
    }
    await tap('NavigationBack');
    await elementById('Channel').waitForDisplayed();
  }
  throw new Error(`No channel with total size ${expected} was found`);
}

async function openAdvancedSettings() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dismissHomeSheetsIfPresent();
    try {
      await openSettings('advanced');
      return;
    } catch (error) {
      lastError = error;
      console.info(`→ Settings drawer did not open (attempt ${attempt})`);
    }
  }
  throw lastError;
}

describe('@transfer - Transfer', () => {
  let electrum: { waitForSync: () => any; stop: () => void };

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(() => {
    electrum?.stop();
  });

  ciIt(
    '@transfer_1, @transfer_staging, @staging - Can buy a channel from Blocktank with default and custom receive capacity',
    async () => {
      await receiveOnchainFunds({ sats: 1000_000, expectHighBalanceWarning: true });

      // First channel: a 200k spending balance with the default receive capacity.
      await openTransferToSpending();
      await enterAmount(200000);
      await expectText('200 000', { strategy: 'contains' });
      await continueFromAmount();
      await tap('SpendingConfirmMore');
      await expectText('200 000', { strategy: 'contains' });
      await tap('LiquidityContinue');
      await confirmSpendingTransfer();

      await tap('ActivitySavings');
      await expectSavingsTransferRows(1);
      await returnHomeFromSavings();

      await settleAndExpectSpendingBalance(200000, async () => electrum?.waitForSync());

      // Second channel: a 100k spending balance with 150k custom receive capacity.
      await openTransferToSpending();
      await enterAmount(100000);
      await expectText('100 000', { strategy: 'contains' });
      await continueFromAmount();
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedNumberField').waitForDisplayed({ timeout: 60_000 });
      await enterAmount(150000);
      await continueFromAdvanced();
      await expectTextWithin('SpendingConfirmChannel', '100 000');
      await expectTextWithin('SpendingConfirmChannel', '150 000');
      await confirmSpendingTransfer();

      await tap('ActivitySavings');
      await expectSavingsTransferRows(2);
      await returnHomeFromSavings();

      // Both channel funding transactions must settle into usable spending balance.
      await settleAndExpectSpendingBalance(300000, async () => electrum?.waitForSync());

      // Find the custom channel by value; channel ordering differs by platform.
      await openAdvancedSettings();
      await tap('Channels');
      await elementById('Channel').waitForDisplayed();
      await openChannelWithTotalSize(250000);
      await expect(await elementContainsAmount('TotalSize', 250000)).toBe(true);
      await expectProcessingOrUsableChannel();
      await doNavigationClose();

      // Home shows both completed transfers.
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', 'Transfer');
      await elementById('ActivityShort-1').waitForDisplayed();
      await expectTextWithin('ActivityShort-1', 'Transfer');
    }
  );

  ciIt(
    '@transfer_max, @transfer_staging, @staging - Can fund a Blocktank channel at the settled maximum',
    async () => {
      await receiveOnchainFunds({ sats: 100_000 });
      await openTransferToSpending();
      await elementById('SpendingAmountMax').waitForEnabled();
      await tap('SpendingAmountMax');
      const expectedSpendingBalance = await getAmountUnder('SpendingAmountNumberField');
      await expect(expectedSpendingBalance).toBeGreaterThan(0);
      await continueFromAmount();
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('LightningSettingUp').waitForDisplayed({ timeout: 90_000 });
      await tap('TransferSuccess-button');
      await waitForHome();
      await settleAndExpectSpendingBalance(expectedSpendingBalance, async () =>
        electrum?.waitForSync()
      );
      await expectSavingsBalance(0);

      await elementById('ActivityShort-0').waitForDisplayed();
      await elementById('ActivityShort-1').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', 'Transfer');
      await expectTextWithin('ActivityShort-1', 'Received');
    }
  );

  ciIt('@transfer_2 - Can open a channel to external node', async () => {
    const rpc = getBitcoinRpc();
    await receiveOnchainFunds({ sats: 100_000 });

    // send funds to LND node and open a channel
    const { lnd, lndNodeID } = await setupLND(rpc, lndConfig);
    await electrum?.waitForSync();

    // get LDK Node id
    const ldkNodeId = await getLDKNodeID();

    // connect to LND
    await connectToLND(lndNodeID, { navigationClose: false });

    // wait for peer to be connected
    await waitForPeerConnection(lnd, ldkNodeId);

    // Set amount
    await enterAmount(20000);
    await tap('ExternalAmountContinue');
    await sleep(500);

    // Swipe to confirm
    await dragOnElement('GRAB', 'right', 0.95);
    console.info('channel opening...');
    await sleep(1000);
    await acknowledgeExternalSuccess();

    // check transfer card
    // await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    const totalAmtAfterChannelOpen = await totalBalance.getText();
    await expect(totalBalance).not.toHaveText('100 000');
    await sleep(2500);

    // check activity
    await elementById('ActivityShort-0').waitForDisplayed();
    await expectTextWithin('ActivityShort-0', 'Transfer');
    await elementById('ActivityShort-1').waitForDisplayed();
    await expectTextWithin('ActivityShort-1', 'Received');
    await swipeFullScreen('down');
    await swipeFullScreen('down');

    await mineBlocks(6);
    await electrum?.waitForSync();
    await waitForToast('SpendingBalanceReadyToast');
    await sleep(1000);

    await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
    await dismissQuickPayIntro({ triggerTimedSheet: true });

    await expectNoTextWithin('ActivitySpending', '0');
    await waitForActiveChannel(lnd, ldkNodeId);

    // check transfer card
    // await elementById('Suggestion-lightning_setting_up').waitForDisplayed({reverse: true});

    // check channel status
    await checkChannelStatus({ size: '20 000' });

    // get invoice
    const { paymentRequest } = await lnd.addInvoice({ memo: 'zero' });

    // send payment
    await sleep(1000);
    await enterAddress(paymentRequest);
    await multiTap('N1', 3);
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(totalAmtAfterChannelOpen);

    // close the channel
    await tap('ActivitySpending');
    await tap('TransferToSavings');
    await tap('SavingsIntro-button');
    await tap('AvailabilityContinue');
    await sleep(1000);
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('TransferSuccess').waitForDisplayed();
    await tap('TransferSuccess-button');
    if (driver.isAndroid) await tap('NavigationBack');
    await sleep(1000);

    // check channel is closed
    await openSettings('advanced');
    await tap('Channels');
    await expectText('Connection 1', { visible: false });
  });
});
