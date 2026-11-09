import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  sleep,
  receiveOnchainFunds,
  tap,
  expectText,
  elementById,
  multiTap,
  dragOnElement,
  expectTextWithin,
  swipeFullScreen,
  elementByIdWithin,
  enterAddress,
  dismissQuickPayIntro,
  waitForToast,
  acknowledgeExternalSuccess,
  dismissBackgroundPaymentsTimedSheet,
  expectNoTextWithin,
  enterAmount,
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

  ciIt('@transfer_2 @ios_gate - Can open a channel to external node', async () => {
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
    await sleep(1000);

    // check channel is closed
    await openSettings('advanced');
    await tap('Channels');
    await expectText('Connection 1', { visible: false });
  });
});
