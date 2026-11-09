import { enterGateAddress, confirmGateAction } from '../helpers/gate-actions';
import { tapAndExpect } from '../helpers/outcome';
import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  receiveOnchainFunds,
  tap,
  expectText,
  elementById,
  multiTap,
  dragOnElement,
  expectTextWithin,
  swipeFullScreen,
  elementByIdWithin,
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
    await tapAndExpect({ id: 'ExternalAmountContinue' }, { anyVisible: [{ id: 'GRAB' }] });

    // Swipe to confirm
    await confirmGateAction({ anyVisible: [{ id: 'ExternalSuccess' }] });
    console.info('channel opening...');

    await acknowledgeExternalSuccess();

    // check transfer card
    // await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    const totalAmtAfterChannelOpen = await totalBalance.getText();
    await expect(totalBalance).not.toHaveText('100 000');

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

    await enterGateAddress(paymentRequest);
    await multiTap('N1', 3);
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(totalAmtAfterChannelOpen);

    // close the channel
    await tapAndExpect({ id: 'ActivitySpending' }, { anyVisible: [{ id: 'Activity-1' }] });
    await tap('TransferToSavings');
    await tap('SavingsIntro-button');
    await tapAndExpect({ id: 'AvailabilityContinue' }, { anyVisible: [{ id: 'GRAB' }] });

    await confirmGateAction({ anyVisible: [{ id: 'TransferSuccess' }] });
    await elementById('TransferSuccess').waitForDisplayed();
    await tap('TransferSuccess-button');

    // check channel is closed
    await openSettings('advanced');
    await tap('Channels');
    await expectText('Connection 1', { visible: false });
  });
});
