import BitcoinJsonRpc from 'bitcoin-json-rpc';
import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  receiveOnchainFunds,
  expectText,
  enterAddress,
  multiTap,
  tap,
  dragOnElement,
  elementById,
  elementByIdWithin,
  getReceiveAddress,
  sleep,
  expectTextWithin,
  typeText,
  confirmInputOnKeyboard,
  swipeFullScreen,
  getAddressFromQRCode,
  getSeed,
  restoreWallet,
  mineBlocks,
  elementByText,
  dismissQuickPayIntro,
  doNavigationClose,
  dismissBackgroundPaymentsTimedSheet,
  acknowledgeReceivedPayment,
  waitForBackup,
  waitForToast,
} from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { bitcoinURL, lndConfig } from '../helpers/constants';
import {
  connectToLND,
  getLDKNodeID,
  setupLND,
  waitForPeerConnection,
  waitForActiveChannel,
  openLNDAndSync,
  checkChannelStatus,
} from '../helpers/lnd';
import { ciIt } from '../helpers/suite';

describe('@lightning - Lightning', () => {
  let electrum: { waitForSync: any; stop: any };
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
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

  after(() => {
    electrum?.stop();
  });

  ciIt('@lightning_1 - Can receive and send LN payments', async () => {
    // Test plan:
    // - connect to LND node
    // - receive funds
    // - send funds
    // - check balances, tx history and notes
    // - restore wallet
    // - check balances, tx history and notes
    // - close channel

    await receiveOnchainFunds(rpc, { sats: 1000 });

    // send funds to LND node and open a channel
    const { lnd, lndNodeID } = await setupLND(rpc, lndConfig);
    await electrum?.waitForSync();

    // get LDK Node id
    const ldkNodeId = await getLDKNodeID();

    // connect to LND
    await connectToLND(lndNodeID);

    // wait for peer to be connected
    await waitForPeerConnection(lnd, ldkNodeId);

    // open a channel
    await openLNDAndSync(lnd, rpc, ldkNodeId);
    await electrum?.waitForSync();

    // wait for channel to be active
    await waitForActiveChannel(lnd, ldkNodeId);

    // Toast message
    await waitForToast('SpendingBalanceReadyToast');

    // check channel status
    await checkChannelStatus();

    console.info('receive 10k sats from LND (non-edited invoice)');
    const receive = await getReceiveAddress('lightning');
    await swipeFullScreen('down');
    const response = await lnd.sendPaymentSync({ paymentRequest: receive, amt: '10000' });
    console.info({ response });
    await acknowledgeReceivedPayment();
    await sleep(500);
    if (driver.isIOS) {
      await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: driver.isIOS });
      await dismissQuickPayIntro({ triggerTimedSheet: driver.isIOS });
    } else {
      await dismissQuickPayIntro({ triggerTimedSheet: true });
    }
    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('11 000'); // 1k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');

    console.info('receive 111 sats from LND, (edited invoice with amt=111, note and tag)');
    await tap('Receive');
    await sleep(1000);
    await tap('SpecifyInvoiceButton');
    await tap('ReceiveNumberPadTextField');
    await sleep(100);
    await multiTap('N1', 3);
    await tap('ReceiveNumberPadSubmit');
    const note1 = 'note 111';
    await typeText('ReceiveNote', note1);
    await confirmInputOnKeyboard();
    await sleep(300); // wait for keyboard to hide
    await tap('TagsAdd');
    await typeText('TagInputReceive', 'rtag');
    await tap('ReceiveTagsSubmit');
    await sleep(300);
    await tap('ShowQrReceive');
    await sleep(500);
    const invoice2 = await getAddressFromQRCode('lightning');
    await swipeFullScreen('down');
    await lnd.sendPaymentSync({ paymentRequest: invoice2 });
    await acknowledgeReceivedPayment();
    await sleep(500);
    await expect(totalBalance).toHaveText('11 111'); // 1k onchain + 10 111 lightning
    await expectTextWithin('ActivitySpending', '10 111');

    await console.info('send lightning payment (lightning invoice with no amount and note)');
    const note2 = 'zero';
    const { paymentRequest: invoice1 } = await lnd.addInvoice({
      memo: note2,
    });
    await console.info({ invoice1 });
    await enterAddress(invoice1);
    await multiTap('N1', 3);
    await tap('ContinueAmount');
    await console.info('I can edit the amount on Review screen');
    await tap('ReviewAmount-primary');
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).toHaveText('11 000'); // 1k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');

    await console.info(
      'send lightning payment (lightning invoice with amount = 1000) and manually added tag'
    );
    const value = '1000';
    const { paymentRequest: invoice4 } = await lnd.addInvoice({
      value: value,
    });
    await console.info({ invoice4 });
    await enterAddress(invoice4, { acceptCameraPermission: false });
    // Review & Send
    const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('1 000');
    await console.info('I cannot edit the amount on Review screen');
    await tap('ReviewAmount-primary');
    await tap('TagsAddSend');
    await typeText('TagInputSend', 'stag');
    await tap('SendTagsSubmit');
    await sleep(500); // wait for keyboard to close
    await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).toHaveText('10 000'); // 1k onchain + 9k lightning
    await expectTextWithin('ActivitySpending', '9 000');

    // check tx history
    await swipeFullScreen('up');
    await swipeFullScreen('up');
    await expectTextWithin('ActivityShort-0', '1 000');
    await expectTextWithin('ActivityShort-1', '111');
    await expectTextWithin('ActivityShort-2', '111');
    await tap('ActivityShort-1');
    await expectTextWithin('InvoiceNote', note2);
    await doNavigationClose();
    await tap('ActivityShort-2');
    await expectTextWithin('InvoiceNote', note1);
    await doNavigationClose();

    // check activity filters & tags
    await sleep(500); // wait for the app to settle
    await swipeFullScreen('up');
    await swipeFullScreen('up');
    await tap('ActivityShowAll');

    // All transactions
    await expectTextWithin('Activity-1', '-');
    await expectTextWithin('Activity-2', '-');
    await expectTextWithin('Activity-3', '+');
    await expectTextWithin('Activity-4', '+');
    await expectTextWithin('Activity-5', '+');

    // Sent, 2 transactions
    await tap('Tab-sent');
    await expectTextWithin('Activity-1', '-');
    await expectTextWithin('Activity-2', '-');
    await elementById('Activity-3').waitForDisplayed({ reverse: true });

    // Received, 2 transactions
    await tap('Tab-received');
    await expectTextWithin('Activity-1', '+');
    await expectTextWithin('Activity-2', '+');
    await expectTextWithin('Activity-3', '+');
    await elementById('Activity-4').waitForDisplayed({ reverse: true });

    // Other, 0 transactions
    await tap('Tab-other');
    await elementById('Activity-1').waitForDisplayed({ reverse: true });

    // filter by receive tag
    await tap('Tab-all');
    await tap('TagsPrompt');
    await sleep(500);
    await tap('Tag-rtag');
    await expectTextWithin('Activity-1', '+');
    await elementById('Activity-2').waitForDisplayed({ reverse: true });
    await tap('Tag-rtag-delete');

    // filter by send tag
    await tap('TagsPrompt');
    await sleep(500);
    await tap('Tag-stag');
    await expectTextWithin('Activity-1', '-');
    await elementById('Activity-2').waitForDisplayed({ reverse: true });
    await tap('Tag-stag-delete');

    await tap('NavigationBack');

    // wipe and restore wallet
    const seed = await getSeed();
    await waitForBackup();
    await restoreWallet(seed);

    // check balance
    await expect(totalBalance).toHaveText('10 000'); // 1k onchain + 9k lightning
    await expectTextWithin('ActivitySpending', '9 000');

    // check tx history
    await swipeFullScreen('up');
    await swipeFullScreen('up');
    await expectTextWithin('ActivityShort-0', '1 000');
    await expectTextWithin('ActivityShort-1', '111');
    await expectTextWithin('ActivityShort-2', '111');
    await tap('ActivityShort-1');
    await expectTextWithin('InvoiceNote', note2);
    await doNavigationClose();
    await tap('ActivityShort-2');
    await expectTextWithin('InvoiceNote', note1);
    await doNavigationClose();

    // check channel status
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    await tap('Channels');
    await sleep(2000);
    await tap('Channel');
    await sleep(1000);
    await expectTextWithin('TotalSize', '₿ 100 000');
    await swipeFullScreen('up');
    await elementById('IsUsableYes').waitForDisplayed();

    // close channel
    await tap('CloseConnection');
    await tap('CloseConnectionButton');
    await elementByText('Transfer Initiated').waitForDisplayed();
    await elementByText('Transfer Initiated').waitForDisplayed({ reverse: true });

    await mineBlocks(rpc, 6);
    await electrum?.waitForSync();
    await elementById('Channel').waitForDisplayed({ reverse: true });
    if (driver.isAndroid) {
      await tap('NavigationBack');
    }
    await doNavigationClose();

    await swipeFullScreen('up');
    await expectTextWithin('ActivityShort-0', '9 000');
  });
});
