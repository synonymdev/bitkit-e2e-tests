import { runSendValidation } from '../helpers/send-validation';
import { enterGateAddress, confirmGateAction, enterGateAmount } from '../helpers/gate-actions';
import { tapAndExpect } from '../helpers/outcome';
import { encode } from 'bip21';

import initElectrum from '../helpers/electrum';
import {
  attemptRefreshOnHomeScreen,
  completeOnboarding,
  elementById,
  elementByIdWithin,
  expectText,
  expectTextWithin,
  getReceiveAddress,
  receiveOnchainFunds,
  sleep,
  swipeFullScreen,
  multiTap,
  dismissQuickPayIntro,
  doNavigationClose,
  waitForToast,
  dismissBackgroundPaymentsTimedSheet,
  acknowledgeReceivedPayment,
  editRecipientAddress,
  tap,
  selectSendFundingSource,
} from '../helpers/actions';
import { lndConfig } from '../helpers/constants';
import { reinstallApp } from '../helpers/setup';
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

describe('@send - Send', () => {
  let electrum: { waitForSync: any; stop: any };

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

  ciIt('@send_1 @ios_gate - Validates payment data in the manual input', async () => {
    await runSendValidation();
  });

  ciIt('@send_2 @ios_gate - Can receive funds and send to different invoices', async () => {
    // Test plan:
    // Prepare
    // - receive onchain funds
    // - open channel to LND node
    // - receive lightning funds

    // Send
    // - try to send amount over balance
    // - send to onchain address
    // - send to lightning invoice
    // - send to unified invoice
    // - quickpay to lightning invoice
    // - quickpay to unified invoice

    await receiveOnchainFunds();

    const rpc = getBitcoinRpc();
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

    // receive lightning funds
    // TODO: receive 50 000 instead of 10 000 after fixing https://github.com/synonymdev/bitkit-android/issues/364
    console.info('Receiving lightning funds...');

    let receive: string;
    try {
      receive = await getReceiveAddress('lightning');
    } catch {
      console.warn('No lightning invoice received yet, swiping down and trying again...');
      await swipeFullScreen('down');
      await sleep(10000);
      await attemptRefreshOnHomeScreen();
      await sleep(10000);
      await attemptRefreshOnHomeScreen();
      await sleep(1000);
      receive = await getReceiveAddress('lightning');
    }
    if (!receive) throw new Error('No lightning invoice received');
    await swipeFullScreen('down');

    // const dec = await lnd.decodePayReq({ payReq: receive });
    // console.info(JSON.stringify(dec, null, 2));
    const response = await lnd.sendPaymentSync({ paymentRequest: receive, amt: '10000' });
    console.info({ response });
    await acknowledgeReceivedPayment();

    await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
    await dismissQuickPayIntro({ triggerTimedSheet: true });

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('110 000'); // 100k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');

    // try to send amount over balance and verify you cannot continue
    console.info('Trying to send ln amount over balance...');
    const { paymentRequest: invoice0 } = await lnd.addInvoice({});
    console.info({ invoice0 });
    await enterGateAddress(invoice0);
    await enterGateAmount(10_000 + 1, 'SendAmountExceededToast');
    await swipeFullScreen('down');

    // send to onchain address
    console.info('Sending to onchain address...');
    const { address: onchainAddress } = await lnd.newAddress();
    console.info({ onchainAddress });
    await enterGateAddress(onchainAddress, { acceptCameraPermission: false });
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N1');
    await multiTap('N0', 4);
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText('110 000');
    const amtAfterOnchain = await totalBalance.getText();
    console.info({ amtAfterOnchain });
    await expectTextWithin('ActivitySpending', '10 000');

    // send to lightning invoice
    console.info('Sending to lightning invoice...');
    const { paymentRequest: invoice1 } = await lnd.addInvoice({});
    console.info({ invoice1 });

    await enterGateAddress(invoice1, { acceptCameraPermission: false });
    await elementById('AssetButton-spending').waitForDisplayed();
    await tap('N2');
    await multiTap('N0', 3);
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterOnchain);
    const amtAfterLightning = await totalBalance.getText();
    console.info({ amtAfterLightning });
    await expectTextWithin('ActivitySpending', '8 000');

    // can edit invoice on the review screen
    console.info('Editing invoice on review screen...');
    const { paymentRequest: invoice2 } = await lnd.addInvoice({ value: '2000' });
    console.info({ invoice2 });
    await enterGateAddress(invoice2, { acceptCameraPermission: false });
    const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('2 000');
    await editRecipientAddress(onchainAddress);
    await tapAndExpect(
      { id: 'AddressContinue' },
      { all: [{ visible: { id: 'AssetButton-savings' } }] }
    );
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N2');
    await multiTap('N0', 4);
    await tap('ContinueAmount');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('20 000');
    await swipeFullScreen('down');

    // send to unified invoice w/ amount
    console.info('Sending to unified invoice w/ amount...');
    const { paymentRequest: invoice3 } = await lnd.addInvoice({ value: '1000' });
    const unified1 = encode(onchainAddress, {
      lightning: invoice3,
      amount: 0.00001,
    });
    console.info({ unified1 });

    await enterGateAddress(unified1, { acceptCameraPermission: false });
    await expect(reviewAmt).toHaveText('1 000'); // invoice amount
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterLightning);
    const amtAfterUnified = await totalBalance.getText();
    console.info({ amtAfterUnified });
    await expectTextWithin('ActivitySpending', '7 000');

    // send to unified invoice w/ amount exceeding balance(s)
    console.info('Sending to unified invoice w/ amount exceeding balance(s)...');
    const { paymentRequest: invoice4 } = await lnd.addInvoice({
      value: '200000',
    });
    const unified2 = encode(onchainAddress, {
      lightning: invoice4,
      amount: 0.0002,
    });
    console.info({ unified2 });

    await enterGateAddress(unified2, { acceptCameraPermission: false });
    // lightning cannot pay it, so the onchain amount opens the review screen directly
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('20 000');
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterUnified);
    const amtAfterUnified2 = await totalBalance.getText();
    console.info({ amtAfterUnified2 });
    await expectTextWithin('ActivitySpending', '7 000');

    // send to unified invoice w/ expired invoice
    console.info('Sending to unified invoice w/ expired invoice...');
    const unified3 =
      'bitcoin:bcrt1qaytrqsrgg75rtxrtr7ur6k75la8p3v95mey48z?lightning=LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    console.info({ unified3 });

    // const ln =
    //   'LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    // const dec = await lnd.decodePayReq({ payReq: ln });
    // console.info(JSON.stringify(dec, null, 2));

    await enterGateAddress(unified3, { acceptCameraPermission: false });
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N1');
    await multiTap('N0', 4);
    await tap('ContinueAmount');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('10 000');
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterUnified2);
    const amtAfterUnified3 = await totalBalance.getText();
    console.info({ amtAfterUnified3 });
    await expectTextWithin('ActivitySpending', '7 000');

    // send to unified invoice w/o amount (lightning)
    console.info('Sending to unified invoice w/o amount (lightning)...');
    const { paymentRequest: invoice5 } = await lnd.addInvoice({});
    const unified4 = encode(onchainAddress, { lightning: invoice5 });
    console.info({ unified4 });

    await enterGateAddress(unified4, { acceptCameraPermission: false });
    // max amount (lightning)
    // Android shows raw `maxSendLightningSats` (7k - 1k reserve = 6k).
    // iOS subtracts an estimated routing fee which includes a hardcoded 2 sat buffer (see SendAmountView.calculateRoutingFee()).
    await expectText('5 998', { strategy: 'contains' });
    await selectSendFundingSource('Savings');
    // max amount (onchain)
    await expectText('5 998', { visible: false, strategy: 'contains' });
    await selectSendFundingSource('Spending');
    await tap('N1');
    await multiTap('N0', 3);
    await tap('ContinueAmount');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('1 000');
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterUnified3);
    const amtAfterUnified4 = await totalBalance.getText();
    console.info({ amtAfterUnified4 });
    await expectTextWithin('ActivitySpending', '6 000');

    // send to unified invoice w/o amount (switch to onchain)
    const { paymentRequest: invoice6 } = await lnd.addInvoice({});
    const unified5 = encode(onchainAddress, { lightning: invoice6 });
    console.info({ unified5 });

    await enterGateAddress(unified5, { acceptCameraPermission: false });
    // max amount (lightning)

    await tap('AvailableAmount');
    await tap('ContinueAmount');
    await expectText('4 998', { strategy: 'contains' });
    // expect toast about reserve balance
    await expectText('Reserve Balance');
    await tap('NavigationBack');
    // max amount (onchain)
    await selectSendFundingSource('Savings');
    await tap('AvailableAmount');
    if (driver.isIOS) {
      // iOS runs an autopilot coin selection step on Continue; when the amount is the true "max"
      // this can fail with a "Coin selection failed" toast. We only care that onchain max isn't
      // clamped to the Lightning max, so back off the exact-max edge case.
      await tap('NRemove');
    }
    await tap('ContinueAmount');
    await expectText('4 998', { visible: false, strategy: 'contains' });
    await tap('NavigationBack');
    await multiTap('NRemove', 6);
    await tap('N1');
    await multiTap('N0', 4);
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterUnified4);
    const amtAfterUnified5 = await totalBalance.getText();
    console.info({ amtAfterUnified5 });
    await expectTextWithin('ActivitySpending', '6 000');

    // send to lightning invoice w/ amount (quickpay)
    console.info('Sending to lightning invoice w/ amount (quickpay)...');
    const { paymentRequest: invoice7 } = await lnd.addInvoice({ value: '1000' });

    // enable quickpay
    console.info('Enabling quickpay...');
    await openSettings();
    await tapAndExpect({ id: 'QuickpaySettings' }, { anyVisible: [{ id: 'QuickpayToggle' }] });
    // no quickpay intro as we already dismissed it after getting lightning balance
    await tap('QuickpayToggle');
    await doNavigationClose();

    await enterGateAddress(invoice7, { acceptCameraPermission: false });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterUnified5);
    const amtAfterLightning2 = await totalBalance.getText();
    console.info({ amtAfterLightning2 });
    await expectTextWithin('ActivitySpending', '5 000');

    // send to unified invoice w/ amount (quickpay)
    console.info('Sending to unified invoice w/ amount (quickpay)...');
    const { paymentRequest: invoice8 } = await lnd.addInvoice({ value: '1000' });
    const unified7 = encode(onchainAddress, {
      lightning: invoice8,
    });
    console.info({ unified7 });

    await enterGateAddress(unified7, { acceptCameraPermission: false });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expect(totalBalance).not.toHaveText(amtAfterLightning2);
    await expectTextWithin('ActivitySpending', '4 000');

    // send to lightning invoice w/ amount (skip quickpay for large amounts)
    console.info('Sending to lightning invoice w/ amount (skip quickpay for large amounts)...');

    // TEMP: receive more funds to be able to pay 10k invoice
    console.info('Receiving lightning funds...');
    await mineBlocks(1);
    await electrum?.waitForSync();
    const receive2 = await getReceiveAddress('lightning');
    await swipeFullScreen('down');
    const r = await lnd.sendPaymentSync({ paymentRequest: receive2, amt: '10000' });
    console.info({ r });
    await acknowledgeReceivedPayment();
    await expectTextWithin('ActivitySpending', '14 000');

    const { paymentRequest: invoice9 } = await lnd.addInvoice({ value: '10000' });
    console.info({ invoice9 });

    await enterGateAddress(invoice9, { acceptCameraPermission: false });
    await elementById('ReviewAmount').waitForDisplayed();
    await swipeFullScreen('down');

    // sanity check activities displayed

    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await elementById('ActivityShort-2').waitForDisplayed();
    await tapAndExpect({ id: 'ActivityShowAll' }, { all: [{ visible: { id: 'Activity-1' } }] });
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
    await elementById('Activity-3').waitForDisplayed();
    await doNavigationClose();
    await swipeFullScreen('down');
    await swipeFullScreen('down');
    await tapAndExpect({ id: 'ActivitySavings' }, { all: [{ visible: { id: 'Activity-1' } }] });
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
    await doNavigationClose();
    await tapAndExpect({ id: 'ActivitySpending' }, { all: [{ visible: { id: 'Activity-1' } }] });
    await elementById('Activity-1').waitForDisplayed();
    await elementById('Activity-2').waitForDisplayed();
  });

  ciIt('@send_3 @ios_gate - Can pay regular invoices with msat precision', async () => {
    await receiveOnchainFunds();

    const rpc = getBitcoinRpc();
    const { lnd, lndNodeID } = await setupLND(rpc, lndConfig);
    await electrum?.waitForSync();

    // get LDK Node id
    const ldkNodeId = await getLDKNodeID();

    // connect to LND
    await connectToLND(lndNodeID);

    // wait for peer to be connected
    await waitForPeerConnection(lnd, ldkNodeId);

    // open a channel and wait until active
    await openLNDAndSync(lnd, rpc, ldkNodeId);
    await electrum?.waitForSync();
    await waitForActiveChannel(lnd, ldkNodeId);

    await waitForToast('SpendingBalanceReadyToast');

    // Ensure spending balance by paying ourselves from LND.
    let receive: string;
    try {
      receive = await getReceiveAddress('lightning');
    } catch {
      await swipeFullScreen('down');
      await sleep(10_000);
      await attemptRefreshOnHomeScreen();
      await sleep(10_000);
      await attemptRefreshOnHomeScreen();
      await sleep(1000);
      receive = await getReceiveAddress('lightning');
    }
    if (!receive) throw new Error('No lightning invoice received');
    await swipeFullScreen('down');
    await lnd.sendPaymentSync({ paymentRequest: receive, amt: '10000' });
    await acknowledgeReceivedPayment();

    await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
    await dismissQuickPayIntro({ triggerTimedSheet: true });

    await expectTextWithin('ActivitySpending', '10 000');

    async function payMsatInvoice(
      valueMsat: string,
      valueSats: string,
      acceptCameraPermission: boolean
    ) {
      const { paymentRequest } = await lnd.addInvoice({ valueMsat });
      console.info({ valueMsat, paymentRequest });

      await enterGateAddress(paymentRequest, { acceptCameraPermission });
      await elementById('ReviewAmount-primary').waitForDisplayed({ timeout: 30_000 });
      await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
      await elementById('SendSuccess').waitForDisplayed();
      await expectText(valueSats);
      await tapAndExpect({ id: 'Close' }, { all: [{ visible: { id: 'ActivityShort-0' } }] });
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '-');
      await expectTextWithin('ActivityShort-0', 'Sent');
      await expectTextWithin('ActivityShort-0', valueSats);

      await swipeFullScreen('down');
      await swipeFullScreen('down');
    }

    // >500 msat remainder
    await payMsatInvoice('222538', '223', true);
    // <500 msat remainder
    await payMsatInvoice('222222', '223', false);
    // exactly 500 msat remainder
    await payMsatInvoice('500500', '501', false);
  });
});
