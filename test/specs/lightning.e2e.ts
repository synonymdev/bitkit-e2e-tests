import { editGateLightningInvoice } from '../helpers/receive-invoice';
import { enterGateAddress, confirmGateAction } from '../helpers/gate-actions';
import { tapAndExpect, typeAndExpect, tapStationaryAndExpect } from '../helpers/outcome';
import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  receiveOnchainFunds,
  multiTap,
  tap,
  elementById,
  elementByIdWithin,
  getReceiveAddress,
  expectTextWithin,
  confirmInputOnKeyboard,
  swipeFullScreen,
  getAddressFromQRCode,
  getSeed,
  restoreWallet,
  elementByText,
  dismissQuickPayIntro,
  doNavigationClose,
  dismissBackgroundPaymentsTimedSheet,
  acknowledgeReceivedPayment,
  addSendTag,
  waitForBackup,
  waitForToast,
} from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { lndConfig } from '../helpers/constants';
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
import { ensureLocalFunds, getBitcoinRpc, mineBlocks } from '../helpers/regtest';
import { openSettings } from '../helpers/navigation';

describe('@lightning @ios_gate - Lightning', () => {
  let electrum: { waitForSync: any; stop: any };
  // LND tests only work with BACKEND=local
  let rpc: ReturnType<typeof getBitcoinRpc>;

  before(async () => {
    rpc = getBitcoinRpc();
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

  ciIt('@lightning_1 - Can receive and send LN payments', async () => {
    // Test plan:
    // - connect to LND node
    // - receive funds
    // - send funds
    // - check balances, tx history and notes
    // - restore wallet
    // - check balances, tx history and notes
    // - close channel

    await receiveOnchainFunds({ sats: 1000 });

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

    await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
    await dismissQuickPayIntro({ triggerTimedSheet: true });

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('11 000'); // 1k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');

    console.info('receive 111 sats from LND, (edited invoice with amt=111, note and tag)');
    await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });
    await editGateLightningInvoice(receive);
    await tapAndExpect({ id: 'ReceiveNumberPadTextField' }, { anyVisible: [{ id: 'N1' }] });

    await multiTap('N1', 3);
    await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    const note1 = 'note 111';
    await typeAndExpect('ReceiveNote', note1, {}, { verifyClear: true });
    await confirmInputOnKeyboard();
    await tapAndExpect({ id: 'TagsAdd' }, { anyVisible: [{ id: 'TagInputReceive' }] });
    await typeAndExpect('TagInputReceive', 'rtag', {}, { verifyClear: true });
    await tapAndExpect({ id: 'ReceiveTagsSubmit' }, { anyVisible: [{ id: 'ShowQrReceive' }] });
    await tapAndExpect({ id: 'ShowQrReceive' }, { anyVisible: [{ id: 'QRCode' }] });

    const invoice2 = await getAddressFromQRCode('lightning');
    await swipeFullScreen('down');
    await lnd.sendPaymentSync({ paymentRequest: invoice2 });
    await acknowledgeReceivedPayment();

    await expect(totalBalance).toHaveText('11 111'); // 1k onchain + 10 111 lightning
    await expectTextWithin('ActivitySpending', '10 111');

    await console.info('send lightning payment (lightning invoice with no amount and note)');
    const note2 = 'zero';
    const { paymentRequest: invoice1 } = await lnd.addInvoice({
      memo: note2,
    });
    await console.info({ invoice1 });
    await enterGateAddress(invoice1);
    await multiTap('N1', 3);
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await console.info('I can edit the amount on Review screen');
    await tap('ReviewAmount-primary');
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
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
    await enterGateAddress(invoice4, { acceptCameraPermission: false });
    // Review & Send
    const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('1 000');
    await console.info('I cannot edit the amount on Review screen');
    await tap('ReviewAmount-primary');
    await addSendTag('stag');

    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).toHaveText('10 000'); // 1k onchain + 9k lightning
    await expectTextWithin('ActivitySpending', '9 000');

    // check tx history
    await expectTextWithin('ActivityShort-0', '1 000');
    await expectTextWithin('ActivityShort-1', '111');
    await expectTextWithin('ActivityShort-2', '111');
    await tapAndExpect(
      { id: 'ActivityShort-1' },
      { all: [{ textWithin: { id: 'InvoiceNote', text: note2, strategy: 'contains' } }] }
    );
    await expectTextWithin('InvoiceNote', note2);
    await doNavigationClose();
    await tapAndExpect(
      { id: 'ActivityShort-2' },
      { all: [{ textWithin: { id: 'InvoiceNote', text: note1, strategy: 'contains' } }] }
    );
    await expectTextWithin('InvoiceNote', note1);
    await doNavigationClose();

    // check activity filters & tags

    await tapAndExpect({ id: 'ActivityShowAll' }, { anyVisible: [{ id: 'Activity-1' }] });

    // All transactions
    await expectTextWithin('Activity-1', '-');
    await expectTextWithin('Activity-2', '-');
    await expectTextWithin('Activity-3', '+');
    await expectTextWithin('Activity-4', '+');
    await expectTextWithin('Activity-5', '+');

    // Sent, 2 transactions
    await tapAndExpect(
      { id: 'Tab-sent' },
      { all: [{ textWithin: { id: 'Activity-1', text: '-', strategy: 'contains' } }] }
    );
    await expectTextWithin('Activity-1', '-');
    await expectTextWithin('Activity-2', '-');
    await elementById('Activity-3').waitForDisplayed({ reverse: true });

    // Received, 2 transactions
    await tapAndExpect(
      { id: 'Tab-received' },
      { all: [{ textWithin: { id: 'Activity-1', text: '+', strategy: 'contains' } }] }
    );
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
    await tapStationaryAndExpect(
      { id: 'Tag-rtag' },
      { all: [{ textWithin: { id: 'Activity-1', text: '+', strategy: 'contains' } }] }
    );
    await expectTextWithin('Activity-1', '+');
    await elementById('Activity-2').waitForDisplayed({ reverse: true });
    await tap('Tag-rtag-delete');

    // filter by send tag
    await tap('TagsPrompt');
    await tapStationaryAndExpect(
      { id: 'Tag-stag' },
      { all: [{ textWithin: { id: 'Activity-1', text: '-', strategy: 'contains' } }] }
    );
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
    await expectTextWithin('ActivityShort-0', '1 000');
    await expectTextWithin('ActivityShort-1', '111');
    await expectTextWithin('ActivityShort-2', '111');
    await tapAndExpect(
      { id: 'ActivityShort-1' },
      { all: [{ textWithin: { id: 'InvoiceNote', text: note2, strategy: 'contains' } }] }
    );
    await expectTextWithin('InvoiceNote', note2);
    await doNavigationClose();
    await tapAndExpect(
      { id: 'ActivityShort-2' },
      { all: [{ textWithin: { id: 'InvoiceNote', text: note1, strategy: 'contains' } }] }
    );
    await expectTextWithin('InvoiceNote', note1);
    await doNavigationClose();

    // check channel status
    await openSettings('advanced');
    await tapAndExpect({ id: 'Channels' }, { anyVisible: [{ id: 'Channel' }] });
    await tapAndExpect({ id: 'Channel' }, { anyVisible: [{ id: 'TotalSize' }] });

    await expectTextWithin('TotalSize', '₿ 100 000');
    await swipeFullScreen('up');
    await elementById('IsUsableYes').waitForDisplayed();

    // close channel
    await tapAndExpect(
      { id: 'CloseConnection' },
      { anyVisible: [{ id: 'CloseConnectionButton' }] }
    );
    await tapAndExpect(
      { id: 'CloseConnectionButton' },
      { anyVisible: [{ text: 'Transfer Initiated' }] }
    );
    await elementByText('Transfer Initiated').waitForDisplayed();
    await elementByText('Transfer Initiated').waitForDisplayed({ reverse: true });

    await mineBlocks(6);
    await electrum?.waitForSync();
    await elementById('Channel').waitForDisplayed({ reverse: true });
    await tap('NavigationBack');
    await doNavigationClose();

    await expectTextWithin('ActivityShort-0', '9 000');
  });
});
