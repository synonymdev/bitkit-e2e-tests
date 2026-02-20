import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  assertAddressMatchesType,
  completeOnboarding,
  dragOnElement,
  elementById,
  elementByIdWithin,
  elementByText,
  elementsById,
  expectTextWithin,
  doNavigationClose,
  getReceiveAddress,
  multiTap,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
  receiveOnchainFunds,
  acknowledgeHighBalanceWarning,
  enterAddress,
  dismissBackupTimedSheet,
  handleOver50PercentAlert,
  handleOver100Alert,
  acknowledgeReceivedPayment,
  switchAndFundEachAddressType,
  transferSavingsToSpending,
  transferSpendingToSavingsAndCloseChannel,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import {
  ensureLocalFunds,
  getExternalAddress,
  mineBlocks,
  sendToAddress,
} from '../helpers/regtest';

describe('@onchain - Onchain', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(async () => {
    await electrum?.stop();
  });

  ciIt('@onchain_1 - Receive and send some out', async () => {
    // receive some first
    await receiveOnchainFunds({ sats: 100_000_000, expectHighBalanceWarning: true });

    // then send out 10 000
    const coreAddress = await getExternalAddress();
    console.info({ coreAddress });
    await enterAddress(coreAddress);
    await tap('N1');
    await tap('N000');
    await tap('N0');

    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await mineBlocks(1);
    await electrum?.waitForSync();

    const moneyTextAfter = (await elementsById('MoneyText'))[1];
    await expect(moneyTextAfter).not.toHaveText('100 000 000');

    // review activity list
    await swipeFullScreen('up');
    const sentShort = 'ActivityShort-0';
    const receiveShort = 'ActivityShort-1';
    await elementById(sentShort).waitForDisplayed();
    await elementById(receiveShort).waitForDisplayed();
    await expectTextWithin(sentShort, '-');
    await expectTextWithin(sentShort, 'Sent');
    await expectTextWithin(receiveShort, '+');
    await expectTextWithin(receiveShort, 'Received');
    await expectTextWithin(receiveShort, '100 000 000');

    await swipeFullScreen('up');
    await tap('ActivityShowAll');
    const sentDetail = 'Activity-1';
    const receiveDetail = 'Activity-2';
    await expectTextWithin(sentDetail, '-');
    await expectTextWithin(sentDetail, 'Sent');
    await expectTextWithin(receiveDetail, '+');
    await expectTextWithin(receiveDetail, 'Received');
    await expectTextWithin(receiveDetail, '100 000 000');
  });

  // Test plan
  // - can receive to 2 addresses and tag them
  // - shows correct total balance
  // - can send total balance and tag the tx
  // - no exceeding availableAmount
  // - shows warnings for sending over 100$ or 50% of total
  // - avoid creating dust output

  ciIt('@onchain_2 - Can receive 2 transactions and send them all at once', async () => {
    // - can receive to 2 addresses and tag them //
    for (let i = 1; i <= 2; i++) {
      const address = await getReceiveAddress();

      await tap('SpecifyInvoiceButton');
      await tap('TagsAdd');
      await typeText('TagInputReceive', `rtag${i}`);
      await tap('ReceiveTagsSubmit');
      await elementById(`Tag-rtag${i}`).waitForDisplayed();
      await elementById(`Tag-rtag${i}-delete`).waitForDisplayed();
      await sleep(300);
      await tap('ShowQrReceive');
      await swipeFullScreen('down');

      await sendToAddress(address, '1');
      await acknowledgeReceivedPayment();

      await mineBlocks(1);
      await electrum?.waitForSync();
      await sleep(1000); // wait for the app to settle

      // - shows correct total balance
      const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      const expected = `${i}00 000 000`;
      await expect(totalBalance).toHaveText(expected);

      if (i === 1) {
        await dismissBackupTimedSheet({ triggerTimedSheet: true });
        await acknowledgeHighBalanceWarning({ triggerTimedSheet: true });
      }
    }

    // - can send total balance and tag the tx //
    const coreAddress = await getExternalAddress();
    await enterAddress(coreAddress);

    // Amount / NumberPad
    await tap('AvailableAmount');
    await multiTap('NRemove', 3);
    await elementByText('199 999').waitForDisplayed();

    await tap('AvailableAmount');
    await tap('ContinueAmount');

    // Review & Send
    await elementById('TagsAddSend').waitForDisplayed();
    await tap('TagsAddSend');
    await typeText('TagInputSend', 'stag');
    await elementByText('Add', 'exact').click();
    await dragOnElement('GRAB', 'right', 0.95);

    await sleep(1000);
    await handleOver50PercentAlert();
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await mineBlocks(1);

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('0');

    // Check Activity
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await elementById('ActivityShort-2').waitForDisplayed();

    await swipeFullScreen('up');
    await sleep(1000); // wait for the app to settle
    await tap('ActivityShowAll');
    // All 3 transactions should be present
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
    await elementById('Activity-3').waitForDisplayed();
    await elementById('Activity-4').waitForDisplayed({ reverse: true });
    await expectTextWithin('Activity-1', '-');
    await expectTextWithin('Activity-2', '+');
    await expectTextWithin('Activity-3', '+');

    // Sent, 1 transaction
    await tap('Tab-sent');
    await expectTextWithin('Activity-1', '-');
    await elementById('Activity-2').waitForDisplayed({ reverse: true });

    // Received, 2 transactions
    await tap('Tab-received');
    await expectTextWithin('Activity-1', '+');
    await expectTextWithin('Activity-2', '+');
    await elementById('Activity-3').waitForDisplayed({ reverse: true });

    // Other, 0 transactions
    await tap('Tab-other');
    await elementById('Activity-1').waitForDisplayed({ reverse: true });
    await tap('Tab-all');

    // TODO: receive tag does not work in local regtest for some reason
    // https://github.com/synonymdev/bitkit-android/issues/322
    // // filter by receive tag
    // await tap('TagsPrompt');
    // await tap('Tag-rtag1');
    // await expectTextWithin('Activity-1', '+');
    // await elementById('Activity-2').waitForDisplayed({ reverse: true });
    // await tap('Tag-rtag1-delete');

    // filter by send tag
    await tap('TagsPrompt');
    await tap('Tag-stag');
    await expectTextWithin('Activity-1', '-');
    await elementById('Activity-2').waitForDisplayed({ reverse: true });
    await tap('Tag-stag-delete');

    // calendar, 0 transactions
    await tap('DatePicker');
    await elementById('CalendarApplyButton').waitForDisplayed();
    await sleep(1000);
    await tap('NextMonth');
    await sleep(500);
    await tap('Day-10');
    await tap('Day-12');
    await sleep(500);
    await tap('CalendarApplyButton');
    await elementById('Activity-1').waitForDisplayed({ reverse: true });

    // calendar, clear, 3 transactions
    await tap('DatePicker');
    await elementById('CalendarApplyButton').waitForDisplayed();
    await sleep(1000);
    await tap('CalendarClearButton');
    await sleep(500);
    await swipeFullScreen('down'); // hide calendar
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
    await elementById('Activity-3').waitForDisplayed();

    // calendar, current date, 3 transactions
    await tap('DatePicker');
    await elementById('CalendarApplyButton').waitForDisplayed();
    await sleep(1000);
    await tap('Today');
    await sleep(500);
    await tap('CalendarApplyButton');
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
    await elementById('Activity-3').waitForDisplayed();
  });

  ciIt('@onchain_3 - Avoids creating a dust output and instead adds it to the fee', async () => {
    // receive some first
    await receiveOnchainFunds({ sats: 100_000_000, expectHighBalanceWarning: true });

    // enable warning for sending over 100$ to test multiple warning dialogs
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('SendAmountWarning');
    await doNavigationClose();

    const coreAddress = await getExternalAddress();
    console.info({ coreAddress });
    await enterAddress(coreAddress);

    // enter amount that would leave dust
    let amountStr = await (await elementByIdWithin('AvailableAmount', 'MoneyText')).getText();
    amountStr = amountStr.replace('₿', '').replace(/\s/g, '');
    let amount = parseInt(amountStr, 10);
    amount = amount - 300; // = 99 999 588
    for (const num of String(amount)) {
      await sleep(200);
      await tap(`N${num}`);
    }
    await tap('ContinueAmount');

    // Review & Send
    await dragOnElement('GRAB', 'right', 0.95);

    // sending over 50% of balance warning
    await handleOver50PercentAlert();

    // sending over 100$ warning
    await handleOver100Alert();

    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await mineBlocks(1);
    await electrum?.waitForSync();

    const totalBalanceAfter = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalanceAfter).toHaveText('0');

    // review activity list
    await swipeFullScreen('up');
    const sentShort = 'ActivityShort-0';
    const receiveShort = 'ActivityShort-1';
    await elementById(sentShort).waitForDisplayed();
    await elementById(receiveShort).waitForDisplayed();
    await expectTextWithin(sentShort, '-');
    await expectTextWithin(sentShort, 'Sent');
    await expectTextWithin(receiveShort, '+');
    await expectTextWithin(receiveShort, 'Received');
    await expectTextWithin(receiveShort, '100 000 000');

    await swipeFullScreen('up');
    await tap('ActivityShowAll');
    const sentDetail = 'Activity-1';
    const receiveDetail = 'Activity-2';
    await expectTextWithin(sentDetail, '-');
    await expectTextWithin(sentDetail, 'Sent');
    await expectTextWithin(receiveDetail, '+');
    await expectTextWithin(receiveDetail, 'Received');
    await expectTextWithin(receiveDetail, '100 000 000');

    await tap(sentDetail);
    await tap('ActivityTxDetails');
    // only 1 output -> no dust
    // TODO: missing inputs/outputs in transaction details
    // await elementByText('OUTPUT').waitForDisplayed();
    // await elementByText('OUTPUT (2)').waitForDisplayed({ reverse: true });
  });

  ciIt(
    '@onchain_multi_address_1 - Receive to each address type and send max combined',
    async () => {
      const addressTypes: ('p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr')[] = [
        'p2pkh',
        'p2sh-p2wpkh',
        'p2wpkh',
        'p2tr',
      ];
      const satsPerAddressType = 100_000;
      const { totalFundedSats } = await switchAndFundEachAddressType({
        addressTypes,
        satsPerAddressType,
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });
      const expectedTotal = totalFundedSats
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

      const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      await expect(totalBalance).toHaveText(expectedTotal);

      const coreAddress = await getExternalAddress();
      await enterAddress(coreAddress);
      await tap('AvailableAmount');
      await tap('ContinueAmount');
      await dragOnElement('GRAB', 'right', 0.95);
      await handleOver50PercentAlert();
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');
      await mineBlocks(1);
      await electrum?.waitForSync();

      const totalBalanceAfter = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      await expect(totalBalanceAfter).toHaveText('0');
    }
  );

  ciIt(
    '@onchain_multi_address_2 - Receive to each address type, transfer all to spending, close channel to taproot',
    async () => {
      const addressTypes: ('p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr')[] = [
        'p2pkh',
        'p2sh-p2wpkh',
        'p2wpkh',
        'p2tr',
      ];
      const satsPerAddressType = 25_000;
      await switchAndFundEachAddressType({
        addressTypes,
        satsPerAddressType,
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      // Last funded type is Taproot, keep it as primary for channel open/close.
      const taprootAddressBeforeClose = await getReceiveAddress();
      assertAddressMatchesType(taprootAddressBeforeClose, 'p2tr');
      await swipeFullScreen('down');

      await transferSavingsToSpending({
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      // Wait for spending balance to become available before cooperative close.
      let spendingReady = false;
      for (let i = 0; i < 12; i++) {
        const spendingBalanceText = await (
          await elementByIdWithin('ActivitySpending', 'MoneyText')
        ).getText();
        const spendingSats = Number(spendingBalanceText.replace(/[^\d]/g, ''));
        if (spendingSats > 0) {
          spendingReady = true;
          break;
        }
        await mineBlocks(1);
        await electrum?.waitForSync();
        await sleep(1200);
      }
      expect(spendingReady).toBe(true);

      await transferSpendingToSavingsAndCloseChannel({
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      const totalBalanceAfterClose = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      await expect(totalBalanceAfterClose).not.toHaveText('0');

      const taprootAddressAfterClose = await getReceiveAddress();
      assertAddressMatchesType(taprootAddressAfterClose, 'p2tr');
      await swipeFullScreen('down');
    }
  );
});
