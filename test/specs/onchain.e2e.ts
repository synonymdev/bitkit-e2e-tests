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
  getReceiveAddress,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
} from '../helpers/actions';

describe('Onchain', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
    await reinstallApp();
    await completeOnboarding();

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
    await electrum?.waitForSync();
  });

  afterEach(async () => {
    await electrum?.stop();
  });

  describe('Receive and Send', () => {
    it('Receive and send some out', async () => {
      // receive some first
      const address = await getReceiveAddress();
      await rpc.sendToAddress(address, '1');
      await rpc.generateToAddress(1, await rpc.getNewAddress());
      await electrum?.waitForSync();
      await swipeFullScreen('down');
      const moneyText = await elementByIdWithin('-primary', 'MoneyText');
      await expect(moneyText).toHaveText('100 000 000');

      // then send out 5 000
      const coreAddress = await rpc.getNewAddress();
      console.info({ coreAddress });
      await tap('Send');
      await tap('RecipientManual');
      await typeText('RecipientInput', coreAddress);
      await confirmInputOnKeyboard();
      await sleep(1000); // wait for the app to settle
      await tap('AddressContinue');
      await tap('N5');
      for (let i = 0; i < 3; i++) {
        await tap('N0');
      }
      await tap('ContinueAmount');
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');

      await rpc.generateToAddress(1, await rpc.getNewAddress());
      await electrum?.waitForSync();

      const moneyTextAfter = await elementByIdWithin('-primary', 'MoneyText');
      await expect(moneyTextAfter).not.toHaveText('100 000 000');
    });

    // Test plan
    // - can receive to 2 addresses and tag them
    // - shows correct total balance
    // - can send total balance and tag the tx
    // - no exceeding availableAmount
    // - shows warnings for sending over 100$ or 50% of total
    // - avoid creating dust output

    // https://github.com/synonymdev/bitkit-android/issues/324
    it.skip('Can receive 2 transactions and send them all at once', async () => {
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
        await rpc.generateToAddress(1, await rpc.getNewAddress());
        await electrum?.waitForSync();

        // https://github.com/synonymdev/bitkit-android/issues/268
        // send - onchain - receiver sees no confetti — missing-in-ldk-node missing onchain payment event
        // await elementById('ReceivedTransaction').waitForDisplayed();

        await swipeFullScreen('down');
        await sleep(1000); // wait for the app to settle

        // - shows correct total balance
        const moneyText = await elementByIdWithin('-primary', 'MoneyText');
        const expected = `${i}00 000 000`;
        await expect(moneyText).toHaveText(expected);
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
      await tap('NRemove');
      await tap('NRemove');
      await tap('NRemove');
      await elementByText('200 000').waitForDisplayed();

      await tap('AvailableAmount');
      await tap('ContinueAmount');

      // Review & Send
      await elementById('TagsAddSend').waitForDisplayed();
      await tap('TagsAddSend');
      await typeText('TagInputSend', 'stag');
      await elementByText('Add').click();
      await dragOnElement('GRAB', 'right', 0.95);

      await sleep(10_000);
    });
  });
});
