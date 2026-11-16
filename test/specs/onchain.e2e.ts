import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  completeOnboarding,
  dragOnElement,
  elementById,
  elementByIdWithin,
  elementByText,
  expectTextWithin,
  doNavigationClose,
  getAmountUnder,
  sleep,
  tap,
  receiveOnchainFunds,
  acknowledgeHighBalanceWarning,
  enterAddress,
  dismissBackupTimedSheet,
  handleOver50PercentAlert,
  handleOver100Alert,
  formatSats,
  expectTotalBalance,
  expectSpendingBalance,
  expectSavingsBalance,
  waitForWalletHomeCondition,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import {
  ensureLocalFunds,
  getExternalAddress,
  mineBlocks,
  sendToAddress,
} from '../helpers/regtest';
import { openSettings } from '../helpers/navigation';
import { confirmGateAction, enterGateAddress, enterGateAmount } from '../helpers/gate-actions';
import {
  actAndExpect,
  swipeAndExpect,
  tapAndExpect,
  tapStationaryAndExpect,
  typeAndExpect,
  type Outcome,
} from '../helpers/outcome';
import {
  acknowledgeOnchainDeposit,
  openReceiveOnchainQr,
  receiveQrOutcome,
} from '../helpers/receive-invoice';

const sendSuccess: Outcome = { anyVisible: [{ id: 'SendSuccess' }] };
const walletHome: Outcome = {
  all: [{ visible: { id: 'TotalBalance-primary' } }, { hidden: { id: 'SendSuccess' } }],
};
const activityRows = {
  all: [1, 2, 3].map((index) => ({ visible: { id: `Activity-${index}` } })),
} satisfies Outcome;
const datePicker: Outcome = { anyVisible: [{ id: 'CalendarApplyButton' }] };
const calendarSelection: Outcome = {
  all: [{ enabled: { id: 'CalendarApplyButton', value: true } }],
};

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

  ciIt('@onchain_1 @ios_nightly - Receive and send some out', async () => {
    // receive some first
    const satsToReceive = 100_000;
    await receiveOnchainFunds({ sats: satsToReceive, expectHighBalanceWarning: false });

    // then send out 10 000
    const coreAddress = await getExternalAddress();
    console.info({ coreAddress });
    await enterGateAddress(coreAddress);
    await enterGateAmount(10_000);

    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction(sendSuccess);
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, walletHome);

    await mineBlocks(1);
    await electrum?.waitForSync();

    await expectTotalBalance(satsToReceive, { condition: 'lt' });
    await expectSavingsBalance(satsToReceive, { condition: 'lt' });
    await expectSpendingBalance(0);

    // review activity list
    const sentShort = 'ActivityShort-0';
    const receiveShort = 'ActivityShort-1';
    await elementById(sentShort).waitForDisplayed();
    await elementById(receiveShort).waitForDisplayed();
    await expectTextWithin(sentShort, '-');
    await expectTextWithin(sentShort, 'Sent');
    await expectTextWithin(receiveShort, '+');
    await expectTextWithin(receiveShort, 'Received');
    await expectTextWithin(receiveShort, formatSats(satsToReceive));

    const sentDetail = 'Activity-1';
    const receiveDetail = 'Activity-2';
    await tapAndExpect(
      { id: 'ActivityShowAll' },
      { all: [{ visible: { id: sentDetail } }, { visible: { id: receiveDetail } }] }
    );
    await expectTextWithin(sentDetail, '-');
    await expectTextWithin(sentDetail, 'Sent');
    await expectTextWithin(receiveDetail, '+');
    await expectTextWithin(receiveDetail, 'Received');
    await expectTextWithin(receiveDetail, formatSats(satsToReceive));
  });

  // Test plan
  // - can receive to 2 addresses and tag them
  // - shows correct total balance
  // - can send total balance and tag the tx
  // - no exceeding availableAmount
  // - shows warnings for sending over 100$ or 50% of total
  // - avoid creating dust output

  ciIt(
    '@onchain_2 @ios_nightly - Can receive 2 transactions and send them all at once',
    async () => {
      // - can receive to 2 addresses and tag them //
      for (let i = 1; i <= 2; i++) {
        const address = await openReceiveOnchainQr();
        const tag = `rtag${i}`;
        const tagId = `Tag-${tag}`;
        const deleteTagId = `${tagId}-delete`;

        await tapStationaryAndExpect(
          { id: 'SpecifyInvoiceButton' },
          { anyVisible: [{ id: 'TagsAdd' }] }
        );
        await tapAndExpect({ id: 'TagsAdd' }, { anyVisible: [{ id: 'TagInputReceive' }] });
        await typeAndExpect('TagInputReceive', tag);
        await tapAndExpect(
          { id: 'ReceiveTagsSubmit' },
          {
            all: [
              { visible: { id: tagId } },
              { visible: { id: deleteTagId } },
              { hidden: { id: 'TagInputReceive' } },
              { keyboardShown: false },
            ],
          }
        );
        await elementById(tagId).waitForDisplayed();
        await elementById(deleteTagId).waitForDisplayed();
        await tapAndExpect({ id: 'ShowQrReceive' }, receiveQrOutcome);
        await swipeAndExpect('down', {
          all: [{ visible: { id: 'Receive' } }, { hidden: { id: 'ShowDetails' } }],
        });

        await sendToAddress(address, '1');
        await acknowledgeOnchainDeposit();

        await mineBlocks(1);
        await electrum?.waitForSync();

        // - shows correct total balance
        const expected = `${i}00 000 000`;
        await waitForWalletHomeCondition(
          async () =>
            (await (await elementByIdWithin('TotalBalance-primary', 'MoneyText')).getText()) ===
            expected
        );
        const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
        await expect(totalBalance).toHaveText(expected);

        if (i === 1) {
          await dismissBackupTimedSheet({ triggerTimedSheet: true });
          await acknowledgeHighBalanceWarning({ triggerTimedSheet: true });
        }
      }

      // - can send total balance and tag the tx //
      const coreAddress = await getExternalAddress();
      await enterGateAddress(coreAddress);

      // Amount / NumberPad
      await elementById('AvailableAmount').waitForDisplayed();
      const maxAmount = await getAmountUnder('AvailableAmount');
      const amountEntered = (amount: number): Outcome => ({
        all: [{ textWithin: { id: 'SendNumberField', text: formatSats(amount) } }],
      });
      await tapAndExpect({ id: 'AvailableAmount' }, amountEntered(maxAmount));
      let reduced = maxAmount;
      for (let i = 0; i < 3; i++) {
        reduced = Math.trunc(reduced / 10);
        await tapAndExpect({ id: 'NRemove' }, amountEntered(reduced));
      }
      await elementByText('199 999').waitForDisplayed();

      await tapAndExpect({ id: 'AvailableAmount' }, amountEntered(maxAmount));
      await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });

      // Review & Send
      await tapAndExpect(
        { id: 'SendConfirmToggleDetails' },
        { anyVisible: [{ id: 'TagsAddSend' }] }
      );
      await tapAndExpect({ id: 'TagsAddSend' }, { anyVisible: [{ id: 'TagInputSend' }] });
      await typeAndExpect('TagInputSend', 'stag');
      await tapAndExpect(
        { id: 'SendTagsSubmit' },
        {
          all: [
            { visible: { text: 'stag' } },
            { hidden: { id: 'TagInputSend' } },
            { keyboardShown: false },
          ],
        }
      );
      await actAndExpect(
        'confirm onchain send with balance warning',
        async () => {
          await dragOnElement('GRAB', 'right', 0.95);
          await handleOver50PercentAlert();
        },
        sendSuccess
      );
      await elementById('SendSuccess').waitForDisplayed();
      await tapAndExpect({ id: 'Close' }, walletHome);

      await mineBlocks(1);

      await expectTotalBalance(0);
      await expectSavingsBalance(0);
      await expectSpendingBalance(0);

      // Check Activity
      await elementById('ActivityShort-0').waitForDisplayed();
      await elementById('ActivityShort-1').waitForDisplayed();
      await elementById('ActivityShort-2').waitForDisplayed();
      await tapAndExpect({ id: 'ActivityShowAll' }, activityRows);
      // All 3 transactions should be present
      await elementById('Activity-1').waitForDisplayed();
      await elementById('Activity-2').waitForDisplayed();
      await elementById('Activity-3').waitForDisplayed();
      await elementById('Activity-4').waitForDisplayed({ reverse: true });
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', '+');
      await expectTextWithin('Activity-3', '+');

      // Sent, 1 transaction
      await tapAndExpect(
        { id: 'Tab-sent' },
        {
          all: [
            { textWithin: { id: 'Activity-1', text: '-', strategy: 'contains' } },
            { hidden: { id: 'Activity-2' } },
          ],
        }
      );
      await expectTextWithin('Activity-1', '-');
      await elementById('Activity-2').waitForDisplayed({ reverse: true });

      // Received, 2 transactions
      await tapAndExpect(
        { id: 'Tab-received' },
        {
          all: [
            { textWithin: { id: 'Activity-1', text: '+', strategy: 'contains' } },
            { textWithin: { id: 'Activity-2', text: '+', strategy: 'contains' } },
            { hidden: { id: 'Activity-3' } },
          ],
        }
      );
      await expectTextWithin('Activity-1', '+');
      await expectTextWithin('Activity-2', '+');
      await elementById('Activity-3').waitForDisplayed({ reverse: true });

      // Other, 0 transactions
      await tapAndExpect({ id: 'Tab-other' }, { all: [{ hidden: { id: 'Activity-1' } }] });
      await elementById('Activity-1').waitForDisplayed({ reverse: true });
      await tapAndExpect({ id: 'Tab-all' }, activityRows);

      // TODO: receive tag does not work in local regtest for some reason
      // https://github.com/synonymdev/bitkit-android/issues/322
      // // filter by receive tag
      // await tap('TagsPrompt');
      // await tap('Tag-rtag1');
      // await expectTextWithin('Activity-1', '+');
      // await elementById('Activity-2').waitForDisplayed({ reverse: true });
      // await tap('Tag-rtag1-delete');

      // filter by send tag
      await tapAndExpect({ id: 'TagsPrompt' }, { anyVisible: [{ id: 'Tag-stag' }] });
      await tapStationaryAndExpect(
        { id: 'Tag-stag' },
        {
          all: [
            { textWithin: { id: 'Activity-1', text: '-', strategy: 'contains' } },
            { hidden: { id: 'Activity-2' } },
          ],
        }
      );
      await expectTextWithin('Activity-1', '-');
      await elementById('Activity-2').waitForDisplayed({ reverse: true });
      await tapAndExpect({ id: 'Tag-stag-delete' }, activityRows);

      // calendar, 0 transactions
      await tapAndExpect({ id: 'DatePicker' }, datePicker);
      await elementById('CalendarApplyButton').waitForDisplayed();
      await elementById('Today').waitForDisplayed();
      await tapAndExpect(
        { id: 'NextMonth' },
        {
          all: [
            { hidden: { id: 'Today' } },
            { visible: { id: 'Day-10' } },
            { visible: { id: 'CalendarApplyButton' } },
          ],
        }
      );
      await tapStationaryAndExpect({ id: 'Day-10' }, calendarSelection);
      // Both apps add this separator when the summary switches from one date to a range.
      const dateRange = elementByText(' - ', 'contains');
      await dateRange.waitForDisplayed({ reverse: true });
      await tapStationaryAndExpect({ id: 'Day-12' }, calendarSelection);
      await dateRange.waitForDisplayed();
      await tapAndExpect(
        { id: 'CalendarApplyButton' },
        {
          all: [{ hidden: { id: 'CalendarApplyButton' } }, { hidden: { id: 'Activity-1' } }],
        }
      );
      await elementById('Activity-1').waitForDisplayed({ reverse: true });

      // calendar, clear, 3 transactions
      await tapAndExpect({ id: 'DatePicker' }, datePicker);
      await elementById('CalendarApplyButton').waitForDisplayed();
      await tapAndExpect(
        { id: 'CalendarClearButton' },
        { all: [{ enabled: { id: 'CalendarApplyButton', value: false } }] }
      );
      await swipeAndExpect('down', {
        all: [...activityRows.all, { hidden: { id: 'CalendarApplyButton' } }],
      });
      await elementById('Activity-1').waitForDisplayed();
      await elementById('Activity-2').waitForDisplayed();
      await elementById('Activity-3').waitForDisplayed();

      // calendar, current date, 3 transactions
      await tapAndExpect({ id: 'DatePicker' }, datePicker);
      await elementById('CalendarApplyButton').waitForDisplayed();
      await tapStationaryAndExpect({ id: 'Today' }, calendarSelection);
      await tapAndExpect(
        { id: 'CalendarApplyButton' },
        { all: [...activityRows.all, { hidden: { id: 'CalendarApplyButton' } }] }
      );
      await elementById('Activity-1').waitForDisplayed();
      await elementById('Activity-2').waitForDisplayed();
      await elementById('Activity-3').waitForDisplayed();
    }
  );

  ciIt('@onchain_3 - Avoids creating a dust output and instead adds it to the fee', async () => {
    // receive some first
    await receiveOnchainFunds({ sats: 100_000_000, expectHighBalanceWarning: true });

    // enable warning for sending over 100$ to test multiple warning dialogs
    await openSettings('security');
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
    const sentShort = 'ActivityShort-0';
    const receiveShort = 'ActivityShort-1';
    await elementById(sentShort).waitForDisplayed();
    await elementById(receiveShort).waitForDisplayed();
    await expectTextWithin(sentShort, '-');
    await expectTextWithin(sentShort, 'Sent');
    await expectTextWithin(receiveShort, '+');
    await expectTextWithin(receiveShort, 'Received');
    await expectTextWithin(receiveShort, '100 000 000');

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
});
