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
  getTextUnder,
  acknowledgeExternalSuccess,
  dismissBackgroundPaymentsTimedSheet,
  expectNoTextWithin,
  enterAmount,
  expectSavingsBalance,
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

async function firstDisplayed(testIds: readonly string[]): Promise<string | undefined> {
  for (const testId of testIds) {
    if (await isDisplayed(testId)) {
      return testId;
    }
  }
  return undefined;
}

const SPENDING_AMOUNT_CONFIRM_IDS = ['SpendingConfirmAdvanced', 'SpendingConfirmMore'] as const;

/** One Back should leave Confirm. Quote refresh can leave Confirm up; retry if needed. */
async function backToSpendingAmount() {
  await tap('NavigationBack');
  await sleep(500);
  const stillOnConfirm = Boolean(await firstDisplayed(SPENDING_AMOUNT_CONFIRM_IDS));
  if (stillOnConfirm) {
    console.info('→ Still on spending confirm, tapping Back again...');
    await tap('NavigationBack');
    await sleep(500);
  }
  await elementById('SpendingAmountAvailable').waitForDisplayed();
  await elementById('SpendingAmountContinue').waitForDisplayed();
  await sleep(1000);
}

/** Integer part of a money label (€450, 450,12, 100 000). */
function parseMoneyInteger(label: string): number {
  const match = label.replace(/\s/g, '').match(/(\d+)/);
  if (!match) {
    throw new Error(`No integer found in money label: "${label}"`);
  }
  return Number(match[1]);
}

async function readNumberFieldAmount(
  containerId: string
): Promise<{ label: string; amount: number }> {
  const last = await getTextUnder(containerId, 'last');
  const first = await getTextUnder(containerId, 'first');
  for (const label of [last, first]) {
    try {
      return { label, amount: parseMoneyInteger(label) };
    } catch {
      // try the other descendant
    }
  }
  throw new Error(`No numeric amount under ${containerId} (first="${first}" last="${last}")`);
}

/**
 * Continue → Confirm can miss on iOS staging after Max / fiat↔sats / quote
 * refresh: Continue tap lands on a settling screen, a leftover sheet covers
 * Confirm, or the Continue node goes stale. Retry the tap only while still on
 * the source screen; do not single-shot wait after one click.
 */
async function tapUntilAnyDisplayed(
  tapId: string,
  confirmIds: readonly string[],
  { timeout = 90_000, sourceIds = [] }: { timeout?: number; sourceIds?: readonly string[] } = {}
): Promise<void> {
  if (await firstDisplayed(confirmIds)) {
    return;
  }

  await elementById(tapId).waitForDisplayed({ timeout: 60_000 });
  await elementById(tapId).waitForEnabled({ timeout: 60_000 });
  await sleep(750);

  const deadline = Date.now() + timeout;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt += 1;
    await dismissHomeSheetsIfPresent();

    if (await firstDisplayed(confirmIds)) {
      return;
    }

    const stillOnSource =
      (await isDisplayed(tapId)) &&
      (sourceIds.length === 0 || Boolean(await firstDisplayed(sourceIds)));
    const enabled = stillOnSource
      ? await elementById(tapId)
          .isEnabled()
          .catch(() => false)
      : false;

    if (stillOnSource && enabled) {
      try {
        console.info(`→ Tapping ${tapId} (attempt ${attempt})`);
        await tap(tapId);
      } catch (error) {
        lastError = error;
        console.info(
          `→ ${tapId} tap failed (attempt ${attempt}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        await sleep(750);
        continue;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }

    try {
      await browser.waitUntil(async () => Boolean(await firstDisplayed(confirmIds)), {
        timeout: Math.min(20_000, remaining),
        interval: 400,
        timeoutMsg: `${confirmIds.join('/')} not displayed after ${tapId}`,
      });
      return;
    } catch (error) {
      lastError = error;
      console.info(
        `→ ${confirmIds.join('/')} not shown after ${tapId} (attempt ${attempt}), retrying if still on source screen`
      );
      await sleep(500);
    }
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`element ("~${confirmIds[0]}") still not displayed after ${timeout}ms.${detail}`);
}

async function continueFromSpendingAmount() {
  await tapUntilAnyDisplayed('SpendingAmountContinue', SPENDING_AMOUNT_CONFIRM_IDS, {
    sourceIds: ['SpendingAmountAvailable'],
  });
  // More can paint before Advanced; callers tap Advanced next.
  if (await isDisplayed('SpendingConfirmAdvanced')) {
    return;
  }
  await dismissHomeSheetsIfPresent();
  await elementById('SpendingConfirmAdvanced').waitForDisplayed({ timeout: 30_000 });
}

async function continueFromSpendingAdvanced() {
  await tapUntilAnyDisplayed('SpendingAdvancedContinue', ['SpendingConfirmDefault'], {
    sourceIds: ['SpendingAdvancedNumberField', 'SpendingAdvancedMin', 'SpendingAdvancedDefault'],
  });
}

async function waitForAdvancedFeeQuote() {
  await expectText('—', { visible: false, timeout: 60_000 });
}

async function dismissHomeSheetsIfPresent() {
  await tryDismissBackgroundPaymentsIfVisible();
  await tryDismissQuickPayIntroIfVisible();
}

const TRANSFER_IN_PROGRESS_TIMEOUT = 90_000;

/**
 * After TransferSuccess the home banner can lag past the default 30s, or a
 * leftover sheet can cover it. Retry swipe-to-home / sheet dismiss instead of
 * a single expectText.
 */
async function waitForTransferInProgressBanner({
  timeout = TRANSFER_IN_PROGRESS_TIMEOUT,
}: { timeout?: number } = {}) {
  await browser.waitUntil(
    async () => {
      await dismissHomeSheetsIfPresent();
      await swipeFullScreen('down');
      return elementByText('TRANSFER IN PROGRESS')
        .isDisplayed()
        .catch(() => false);
    },
    {
      timeout,
      interval: 3_000,
      timeoutMsg: 'TRANSFER IN PROGRESS banner did not appear after confirmed transfer',
    }
  );
}

/** Home must be settled before savings activity; list rows lag until then. */
async function openSavingsActivityAfterTransfer() {
  await sleep(1000);
  try {
    await waitForTransferInProgressBanner();
  } catch (error) {
    // Transfer already confirmed on the success sheet; banner is a home-settle
    // signal, not a second product assertion. Open savings if home is usable.
    const savingsReady = await elementById('ActivitySavings')
      .isDisplayed()
      .catch(() => false);
    if (!savingsReady) {
      throw error;
    }
    console.info(
      '→ TRANSFER IN PROGRESS lagged after success sheet; opening savings activity from home'
    );
  }
  await tap('ActivitySavings');
}

/**
 * Activity-1 starts as the on-chain receive until Transfer is inserted above it
 * (same race as @transfer_max ActivityShort-0/1). Wait for Transfer labels at
 * 60s instead of assuming Activity-2/3 exist at the default 30s.
 */
async function expectSavingsTransferRows(transferCount: 1 | 2) {
  switch (transferCount) {
    case 1:
      await elementById('Activity-2').waitForDisplayed({ timeout: 60_000 });
      await expectTextWithin('Activity-1', 'Transfer', { timeout: 60_000 });
      await expectTextWithin('Activity-1', '-');
      return;
    case 2:
      await elementById('Activity-3').waitForDisplayed({ timeout: 60_000 });
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
  await dismissHomeSheetsIfPresent();
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

  // Test Plan
  // Can buy a channel from Blocktank with default and custom receive capacity
  // 	- cannot continue with zero spending balance
  // 	- can change amount
  // 	Advanced
  // 	- can change amount
  // Can fund a channel at the settled Max (happy path; fee-direction math is unit-tested)
  // Can open a channel to external node
  // 	- open channel to LND
  // 	- send payment
  // 	- close the channel
  ciIt(
    '@transfer_1, @transfer_staging, @staging - Can buy a channel from Blocktank with default and custom receive capacity',
    async () => {
      await receiveOnchainFunds({ sats: 1000_000, expectHighBalanceWarning: true });

      // Currency selection alone does not switch the home balance unit off ₿.
      // Match settings_01: tap TotalBalance until fiat shows, then change currency to EUR.
      const fiatSymbol = await elementByIdWithin('TotalBalance-primary', 'MoneyFiatSymbol');
      try {
        await tap('TotalBalance');
        await expect(fiatSymbol).toHaveText('$');
      } catch {
        await tap('TotalBalance');
      }
      await expect(fiatSymbol).toHaveText('$');
      if (driver.isIOS) {
        // iOS toasts live in a separate window; drag-dismiss hits wrong coords
        // and races when the toast auto-dismisses. Unit text is the source of truth.
        await waitForToastBestEffort('BalanceUnitSwitchedToast');
      }

      await openSettings();
      await tap('CurrenciesSettings');
      const eur_opt = await elementByText('EUR (€)');
      await eur_opt.waitForDisplayed();
      await eur_opt.click();
      await doNavigationClose();
      await expect(fiatSymbol).toHaveText('€');

      // Switch display unit back to sats so SpendingAdvancedMin shows "100 000".
      // Currency stays EUR — later SpendingAdvancedNumberField still asserts ~€450 inbound.
      // Match settings_01: do not hard-wait on BalanceUnitSwitchedToast after the second
      // tap. A missed/auto-dismissed toast must not fail once MoneyFiatSymbol shows ₿.
      await tap('TotalBalance');
      await sleep(500);
      await expect(fiatSymbol).toHaveText('₿');

      await sleep(1000);
      await swipeFullScreen('up');
      await sleep(1000);
      await tap('Suggestion-lightning');
      await tap('TransferIntro-button');
      await tap('FundTransfer');
      await tap('SpendingIntro-button');
      await sleep(2000); // let the animation finish

      // can continue with default client balance (0)
      await continueFromSpendingAmount();
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedMin').waitForDisplayed({ timeout: 60_000 });
      await sleep(500);
      await tap('SpendingAdvancedMin');
      await expectText('100 000', { strategy: 'contains' });
      await tap('SpendingAdvancedDefault');
      await sleep(1000);
      // Default inbound is EUR-denominated (~€450) via bitkitcore + satsPerEur.
      await tap('SpendingAdvancedNumberField'); // change to fiat
      let fiatLabel = '';
      let eurBalance = 0;
      await browser.waitUntil(
        async () => {
          const field = await readNumberFieldAmount('SpendingAdvancedNumberField');
          fiatLabel = field.label;
          eurBalance = field.amount;
          // Fiat of the €450 default; leftover sats would be 100000+.
          return eurBalance > 0 && eurBalance < 10_000;
        },
        {
          timeout: 30_000,
          timeoutMsg: 'Default receive capacity did not switch to a fiat amount',
        }
      );
      console.info(`→ Default receive capacity fiat: "${fiatLabel}" → ${eurBalance} EUR`);
      await expect(eurBalance).toBeGreaterThan(400);
      await expect(eurBalance).toBeLessThan(500);
      await sleep(1000);
      await tap('SpendingAdvancedNumberField'); // change back to sats
      await waitForAdvancedFeeQuote();
      await continueFromSpendingAdvanced();
      await sleep(500);
      await backToSpendingAmount();

      // can continue with max client balance
      await tap('SpendingAmountMax').catch(async () => {
        console.info('→ SpendingAmountMax not found, navigating back and trying again...');
        await tap('NavigationBack');
        await sleep(500);
        await tap('SpendingAmountMax');
      });
      await continueFromSpendingAmount();
      await backToSpendingAmount();

      // can continue with 25% client balance
      await tap('SpendingAmountQuarter');
      await continueFromSpendingAmount();
      await backToSpendingAmount();
      await tap('NavigationBack');
      await sleep(1000);
      await tap('SpendingIntro-button');
      await sleep(2000);
      await elementById('SpendingAmountAvailable').waitForDisplayed();
      await elementById('N2').waitForEnabled();
      await sleep(500);

      // can change client balance
      await enterAmount(200000);
      await sleep(500);
      await expectText('200 000', { strategy: 'contains' });
      await continueFromSpendingAmount();
      await elementById('SpendingConfirmMore').waitForDisplayed();
      await sleep(500);
      await expectText('200 000', { strategy: 'contains' });
      await tap('SpendingConfirmMore');
      await expectText('200 000');
      await tap('LiquidityContinue');
      await confirmSpendingTransfer();

      // verify transfer activity on savings
      await openSavingsActivityAfterTransfer();
      await expectSavingsTransferRows(1);
      await tap('NavigationBack');
      await sleep(1000);

      // transfer in progress
      await waitForTransferInProgressBanner();

      // Get another channel with custom receiving capacity
      await tap('ActivitySavings');
      await tap('TransferToSpending');
      await elementById('SpendingAmountContinue').waitForEnabled({ timeout: 60_000 });
      await sleep(2000);
      await enterAmount(100000);
      await sleep(500);
      await continueFromSpendingAmount();
      await expectText('100 000', { strategy: 'contains' });
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedMin').waitForDisplayed({ timeout: 60_000 });
      await sleep(500);

      // Receiving Capacity
      // can continue with min amount
      await tap('SpendingAdvancedMin');
      await sleep(500);
      await expectText('2 500');
      await waitForAdvancedFeeQuote();
      await continueFromSpendingAdvanced();
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedDefault').waitForDisplayed();

      // can continue with default amount
      await tap('SpendingAdvancedDefault');
      await sleep(500);
      await waitForAdvancedFeeQuote();
      await continueFromSpendingAdvanced();
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedMax').waitForDisplayed();

      // can continue with max amount
      await tap('SpendingAdvancedMax');
      await sleep(500);
      await waitForAdvancedFeeQuote();
      await continueFromSpendingAdvanced();
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await elementById('SpendingAdvancedNumberField').waitForDisplayed();

      // can set custom amount
      await sleep(500);
      await enterAmount(150000);
      await sleep(500);
      await waitForAdvancedFeeQuote();
      await continueFromSpendingAdvanced();
      await expectTextWithin('SpendingConfirmChannel', '100 000');
      await expectTextWithin('SpendingConfirmChannel', '150 000');
      await confirmSpendingTransfer();

      // verify both transfers activities on savings
      await openSavingsActivityAfterTransfer();
      await expectSavingsTransferRows(2);
      await tap('NavigationBack');
      await sleep(1000);

      // transfer in progress
      await waitForTransferInProgressBanner();

      // check channel status
      await dismissHomeSheetsIfPresent();
      await openSettings('advanced');
      await tap('Channels');
      await sleep(1000);
      const channels = await elementsById('Channel');
      channels[driver.isAndroid ? 1 : 0].click();
      await expectTextWithin('TotalSize', '₿ 250 000');
      await expectText('Processing payment');
      await doNavigationClose();

      // check activities
      await sleep(1000);
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', 'Transfer');
      await elementById('ActivityShort-1').waitForDisplayed();
      await expectTextWithin('ActivityShort-1', 'Transfer');

      await tap('ActivityShowAll');

      // All transactions
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', '-');
      await expectTextWithin('Activity-3', '+');

      // Sent, 0 transactions
      await tap('Tab-sent');
      await elementById('Activity-1').waitForDisplayed({ reverse: true });

      // Received, 1 transaction
      await tap('Tab-received');
      await expectTextWithin('Activity-1', '+');
      await elementById('Activity-2').waitForDisplayed({ reverse: true });

      // Other, 2 transfer transactions
      await tap('Tab-other');
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', '-');
      await elementById('Activity-3').waitForDisplayed({ reverse: true });
    }
  );

  ciIt(
    '@transfer_max, @transfer_staging, @staging - Can fund a Blocktank channel at the settled maximum',
    async () => {
      await receiveOnchainFunds({ sats: 100_000 });

      await tap('ActivitySavings');
      await elementById('TransferToSpending').waitForDisplayed();
      await tap('TransferToSpending');
      if (
        await elementById('SpendingIntro-button')
          .isDisplayed()
          .catch(() => false)
      ) {
        await tap('SpendingIntro-button');
      }

      await elementById('SpendingAmountAvailable').waitForDisplayed();
      await elementById('SpendingAmountContinue').waitForEnabled();
      await elementById('SpendingAmountMax').waitForEnabled();
      await sleep(500);

      await tap('SpendingAmountMax');
      await tapUntilAnyDisplayed('SpendingAmountContinue', ['SpendingConfirmMore'], {
        sourceIds: ['SpendingAmountAvailable'],
      });
      await sleep(500);

      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('LightningSettingUp').waitForDisplayed();
      await tap('TransferSuccess-button');

      await expectSavingsBalance(0);

      // Short-0 is already the receive row from `receiveOnchainFunds`. Wait until that
      // row becomes Short-1 so Short-0 is the transfer, same as @onchain / @transfer_2.
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
