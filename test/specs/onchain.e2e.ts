import BitcoinJsonRpc from 'bitcoin-json-rpc';
import { bitcoinURL } from '../helpers/constants';
import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  completeOnboarding,
  confirmInputOnKeyboard,
  dragOnElement,
  elementById,
  elementByIdWithin,
  elementByText,
  elementsById,
  expectTextWithin,
  getReceiveAddress,
  mineBlocks,
  multiTap,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
  receiveOnchainFunds,
  acknowledgeHighBalanceWarning,
} from '../helpers/actions';

describe('@onchain - Onchain', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
    // ensure we have at least 10 BTC on regtest
    let balance = await rpc.getBalance();
    const address = await rpc.getNewAddress();

    while (balance < 10) {
      await rpc.generateToAddress(10, address);
      balance = await rpc.getBalance();
    }

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

  it('@onchain_1 - Receive and send some out', async () => {
    // receive some first
    await receiveOnchainFunds(rpc, { sats: 100_000_000, expect_high_balance_warning: true });

    // then send out 10 000
    const coreAddress = await rpc.getNewAddress();
    console.info({ coreAddress });
    await tap('Send');
    await tap('RecipientManual');
    await typeText('RecipientInput', coreAddress);
    await confirmInputOnKeyboard();
    await sleep(1000); // wait for the app to settle
    await tap('AddressContinue');
    await tap('N1');
    await tap('N000');
    await tap('N0');

    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await mineBlocks(rpc, 1);
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

  it('@onchain_2 - Can receive 2 transactions and send them all at once', async () => {
    // - can receive to 2 addresses and tag them //
    for (let i = 1; i <= 2; i++) {
      const address = await getReceiveAddress();

      await tap('SpecifyInvoiceButton');
      await tap('TagsAdd');
      await typeText('TagInputReceive', `rtag${i}`);
      await tap('ReceiveTagsSubmit');
      await sleep(300);
      await tap('ShowQrReceive');

      await rpc.sendToAddress(address, '1');
      await mineBlocks(rpc, 1);
      await electrum?.waitForSync();

      // https://github.com/synonymdev/bitkit-android/issues/268
      // send - onchain - receiver sees no confetti — missing-in-ldk-node missing onchain payment event
      // await elementById('ReceivedTransaction').waitForDisplayed();

      // acknowledge high balance warning for the first tx only
      if (i === 1) {
        await acknowledgeHighBalanceWarning();
      }

      await swipeFullScreen('down');
      await sleep(1000); // wait for the app to settle

      // - shows correct total balance
      const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      const expected = `${i}00 000 000`;
      await expect(totalBalance).toHaveText(expected);
    }

    // - can send total balance and tag the tx //
    const coreAddress = await rpc.getNewAddress();
    await tap('Send');
    await tap('RecipientManual');
    await typeText('RecipientInput', coreAddress);
    await confirmInputOnKeyboard();
    await sleep(1000); // wait for the app to settle
    await tap('AddressContinue');

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
    await elementById('SendDialog2').waitForDisplayed(); // sending over 50% of balance warning
    await tap('DialogConfirm');
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await mineBlocks(rpc, 1);

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('0');

    // Check Activity
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await elementById('ActivityShort-2').waitForDisplayed();

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

    // https://github.com/synonymdev/bitkit-android/issues/386
    // filter by send tag
    // await tap('TagsPrompt');
    // await tap('Tag-stag');
    // await elementByText('Apply','exact').click();
    // await expectTextWithin('Activity-1', '-');
    // await elementById('Activity-2').waitForDisplayed({ reverse: true });
    // await tap('Tag-stag-delete');

    // // calendar, previous month, 0 transactions
    // await tap('DatePicker');
    // today date in the form of 'Sunday, September 28, 2025'

    // await elementById('Today').waitForDisplayed();
    // await tap('PrevMonth');
    // await elementById('Today').waitForDisplayed({ reverse: true });
    // await tap('Day-1');
    // await tap('Day-28');
    // await tap('CalendarApplyButton');
    // await elementById('Activity-1').waitForDisplayed({ reverse: true });

    // // calendar, current date, 3 transactions
    // await tap('DatePicker');
    // await tap('CalendarClearButton');
    // await tap('NextMonth');
    // await tap('Today');
    // await tap('CalendarApplyButton');
    // await elementById('Activity-1').waitForDisplayed();
    // await elementById('Activity-2').waitForDisplayed();
    // await elementById('Activity-3').waitForDisplayed();
  });

  // https://github.com/synonymdev/bitkit-android/issues/324
  it.skip('@onchain_3 - Avoids creating a dust output and instead adds it to the fee', async () => {
    // receive some first
    const address = await getReceiveAddress();
    await rpc.sendToAddress(address, '1');
    await rpc.generateToAddress(1, await rpc.getNewAddress());
    await electrum?.waitForSync();
    // https://github.com/synonymdev/bitkit-android/issues/268
    // send - onchain - receiver sees no confetti — missing-in-ldk-node missing onchain payment event
    // await elementById('ReceivedTransaction').waitForDisplayed();
    await swipeFullScreen('down');
    const moneyText = (await elementsById('MoneyText'))[1];
    await expect(moneyText).toHaveText('100 000 000');

    // enable warning for sending over 100$ to test multiple warning dialogs
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('SendAmountWarning');
    await tap('NavigationClose');

    const coreAddress = await rpc.getNewAddress();
    console.info({ coreAddress });

    await tap('Send');
    await tap('RecipientManual');
    await typeText('RecipientInput', coreAddress);
    await confirmInputOnKeyboard();
    await sleep(1000); // wait for the app to settle
    await tap('AddressContinue');

    // enter amount that would leave dust
    let amountStr = await (await elementByIdWithin('AvailableAmount', 'MoneyText')).getText();
    amountStr = amountStr.replace('₿', '').replace(/\s/g, '');
    let amount = parseInt(amountStr, 10);
    amount = amount - 300; // = 99 999 700
    for (const num of String(amount)) {
      await sleep(200);
      await tap(`N${num}`);
    }
    await tap('ContinueAmount');

    // Review & Send
    await dragOnElement('GRAB', 'right', 0.95);

    // sending over 50% of balance warning
    await elementById('SendDialog2').waitForDisplayed();
    await tap('DialogConfirm');

    // sending over 100$ warning
    await elementById('SendDialog1').waitForDisplayed();
    await tap('DialogConfirm');

    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');

    await rpc.generateToAddress(1, await rpc.getNewAddress());
    await electrum?.waitForSync();

    const moneyTextAfter = (await elementsById('MoneyText'))[1];
    await expect(moneyTextAfter).toHaveText('0');

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
});
