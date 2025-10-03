import BitcoinJsonRpc from 'bitcoin-json-rpc';
import { encode } from 'bip21';

import initElectrum from '../helpers/electrum';
import {
  attemptRefreshOnHomeScreen,
  completeOnboarding,
  dragOnElement,
  elementById,
  enterAddress,
  elementByIdWithin,
  expectTextVisible,
  expectTextWithin,
  getReceiveAddress,
  receiveOnchainFunds,
  sleep,
  swipeFullScreen,
  multiTap,
  typeAddressAndVerifyContinue,
  mineBlocks,
  dismissQuickPayIntro,
} from '../helpers/actions';
import { bitcoinURL, lndConfig } from '../helpers/constants';
import { reinstallApp } from '../helpers/setup';
import { confirmInputOnKeyboard, tap, typeText } from '../helpers/actions';
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

describe('@send - Send', () => {
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

  ciIt('@send_1 - Validates payment data in the manual input', async () => {
    await tap('Send');
    await tap('RecipientManual');

    // check validation for empty address
    await elementById('AddressContinue').waitForEnabled({ reverse: true });

    // check validation for invalid data
    await typeAddressAndVerifyContinue({ address: 'test123', reverse: true });

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // // check validation for invalid address (network mismatch)
    // const mainnetAddress = 'bc1qnc8at2e2navahnz7lvtl39r4dnfzxv3cc9e7ax';
    // await typeAddressAndVerifyContinue({ address: mainnetAddress, reverse: true })

    // // check validation for address when balance is 0
    // const address = await rpc.getNewAddress();
    // console.info({ address });
    // await typeAddressAndVerifyContinue({ address: address, reverse: true })

    // // check validation for expired invoice
    // const invoice =
    //   'lnbcrt1pn3zpqpdqqnp4qfh2x8nyvvzq4kf8j9wcaau2chr580l93pnyrh5027l8f7qtm48h6pp5lmwkulnpze4ek4zqwfepguahcr2ma3vfhwa6uepxfd378xlldprssp5wnq34d553g50suuvfy387csx5hx6mdv8zezem6f4tky7rhezycas9qyysgqcqpcxqrrssrzjqtr7pzpunxgwjddwdqucegdphm6776xcarz60gw9gxva0rhal5ntmapyqqqqqqqqpqqqqqlgqqqqqqgq2ql9zpeakxvff9cz5rd6ssc3cngl256u8htm860qv3r28vqkwy9xe3wp0l9ms3zcqvys95yf3r34ytmegz6zynuthh5s0kh7cueunm3mspg3uwpt';
    // await typeAddressAndVerifyContinue({ address: invoice, reverse: true })

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // Receive funds and check validation w/ balance
    await swipeFullScreen('down');
    await receiveOnchainFunds(rpc);

    await tap('Send');
    await sleep(500);
    await tap('RecipientManual');

    // check validation for address
    const address2 = await rpc.getNewAddress();
    try {
      await typeAddressAndVerifyContinue({ address: address2 });
    } catch {
      console.warn('Address2 input failed, trying again...');
      await typeAddressAndVerifyContinue({ address: address2 });
    }

    // check validation for unified invoice when balance is enough
    const unified1 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.0001';
    try {
      await typeAddressAndVerifyContinue({ address: unified1 });
    } catch {
      console.warn('Unified1 input failed, trying again...');
      await typeAddressAndVerifyContinue({ address: unified1 });
    }

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // // check validation for unified invoice when balance is too low
    // const unified2 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.002';
    // await typeAddressAndVerifyContinue({ address: unified2, reverse: true });

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//
  });

  ciIt('@send_2 - Can receive funds and send to different invoices', async () => {
    // Test plan:
    // Prepare
    // - receive onchain funds
    // - open channel to LND node
    // - receive lightning funds

    // Send
    // - send to onchain address
    // - send to lightning invoice
    // - send to unified invoice
    // - quickpay to lightning invoice
    // - quickpay to unified invoice

    await receiveOnchainFunds(rpc);

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
    await expectTextVisible('Spending Balance Ready');

    // check channel status
    await checkChannelStatus();

    // receive lightning funds
    // TODO: receive 50 000 instead of 10 000 after fixing https://github.com/synonymdev/bitkit-android/issues/364
    console.info('Receiving lightning funds...');
    await sleep(2000);
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
    await elementById('ReceivedTransaction').waitForDisplayed();
    await tap('ReceivedTransactionButton');
    await sleep(500);

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText('110 000'); // 100k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');
    await dismissQuickPayIntro();

    // send to onchain address
    console.info('Sending to onchain address...');
    const { address: onchainAddress } = await lnd.newAddress();
    console.info({ onchainAddress });
    await enterAddress(onchainAddress);
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N1');
    await multiTap('N0', 4);
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText('110 000');
    const amtAfterOnchain = await totalBalance.getText();
    console.info({ amtAfterOnchain });
    await expectTextWithin('ActivitySpending', '10 000');

    // send to lightning invoice
    console.info('Sending to lightning invoice...');
    const { paymentRequest: invoice1 } = await lnd.addInvoice({});
    console.info({ invoice1 });
    await sleep(1000);
    await enterAddress(invoice1);
    await elementById('AssetButton-spending').waitForDisplayed();
    await tap('N1');
    await multiTap('N0', 3);
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterOnchain);
    const amtAfterLightning = await totalBalance.getText();
    console.info({ amtAfterLightning });
    await expectTextWithin('ActivitySpending', '9 000');

    // can edit invoice on the review screen
    console.info('Editing invoice on review screen...');
    const { paymentRequest: invoice2 } = await lnd.addInvoice({ value: '1000' });
    await enterAddress(invoice2);
    const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('1 000');
    await tap('ReviewUri');
    await sleep(2000);
    await elementById('RecipientInput').waitForDisplayed();
    await sleep(500);
    try {
      await typeText('RecipientInput', onchainAddress);
      await confirmInputOnKeyboard();
      await elementById('AddressContinue').waitForEnabled();
      await sleep(500);
    } catch {
      await typeText('RecipientInput', onchainAddress);
      await confirmInputOnKeyboard();
      await elementById('AddressContinue').waitForEnabled();
      await sleep(500);
    }
    await tap('AddressContinue');
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
    await sleep(1000);
    await enterAddress(unified1);
    await expect(reviewAmt).toHaveText('1 000'); // invoice amount
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterLightning);
    const amtAfterUnified = await totalBalance.getText();
    console.info({ amtAfterUnified });
    await expectTextWithin('ActivitySpending', '8 000');

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
    await sleep(1000);
    await enterAddress(unified2);
    // should only allow spending from savings
    await elementById('AssetButton-savings').waitForDisplayed();
    await sleep(500);
    await tap('ContinueAmount');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('20 000');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterUnified);
    const amtAfterUnified2 = await totalBalance.getText();
    console.info({ amtAfterUnified2 });
    await expectTextWithin('ActivitySpending', '8 000');

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/366 ---//

    // TODO: uncomment after fix

    // send to unified invoice w/ expired invoice
    // console.info('Sending to unified invoice w/ expired invoice...');
    // const unified3 =
    //   'bitcoin:bcrt1qaytrqsrgg75rtxrtr7ur6k75la8p3v95mey48z?lightning=LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    // console.info({ unified3 });

    // // const ln =
    // //   'LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    // // const dec = await lnd.decodePayReq({ payReq: ln });
    // // console.info(JSON.stringify(dec, null, 2));

    // await sleep(1000);
    // await enterAddress(unified3);
    // await elementById('AssetButton-savings').waitForDisplayed();
    // await tap('N1');
    // await multiTap('N0', 4);
    // await tap('ContinueAmount');
    // await amt_el.waitForDisplayed();
    // await expect(amt_el).toHaveText('10 000');
    // await dragOnElement('GRAB', 'right', 0.95);
    // await elementById('SendSuccess').waitForDisplayed();
    // await tap('Close');
    // await expect(moneyText).not.toHaveText(amtAfterUnified2);
    // const amtAfterUnified3 = await moneyText.getText();
    // await expectTextWithin('ActivitySpending', '8 000');

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/366 ---//
    const amtAfterUnified3 = await totalBalance.getText();
    console.info({ amtAfterUnified3 });

    // send to unified invoice w/o amount (lightning)
    console.info('Sending to unified invoice w/o amount (lightning)...');
    const { paymentRequest: invoice5 } = await lnd.addInvoice({});
    const unified4 = encode(onchainAddress, { lightning: invoice5 });
    console.info({ unified4 });
    await sleep(1000);
    await enterAddress(unified4);
    // max amount (lightning)
    await expectTextVisible('7 000'); // current balance 8k - 1k reserve balance
    await tap('AssetButton-switch');
    // max amount (onchain)
    await expectTextVisible('7 000', false);
    await tap('AssetButton-switch');
    await tap('N1');
    await multiTap('N0', 3);
    await tap('ContinueAmount');
    await reviewAmt.waitForDisplayed();
    await expect(reviewAmt).toHaveText('1 000');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterUnified3);
    const amtAfterUnified4 = await totalBalance.getText();
    console.info({ amtAfterUnified4 });
    await expectTextWithin('ActivitySpending', '7 000');

    // send to unified invoice w/o amount (switch to onchain)
    const { paymentRequest: invoice6 } = await lnd.addInvoice({});
    const unified5 = encode(onchainAddress, { lightning: invoice6 });
    console.info({ unified5 });
    await sleep(1000);
    await enterAddress(unified5);
    // max amount (lightning)
    await tap('AvailableAmount');
    await tap('ContinueAmount');
    await expectTextVisible('6 000');
    // expect toast about reserve balance
    await expectTextVisible('Reserve Balance');
    await tap('NavigationBack');
    // max amount (onchain)
    await tap('AssetButton-switch');
    await tap('AvailableAmount');
    await tap('ContinueAmount');
    await expectTextVisible('6 000', false);
    await tap('NavigationBack');
    await multiTap('NRemove', 6);
    await tap('N1');
    await multiTap('N0', 4);
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterUnified4);
    const amtAfterUnified5 = await totalBalance.getText();
    console.info({ amtAfterUnified5 });
    await expectTextWithin('ActivitySpending', '7 000');

    // send to lightning invoice w/ amount (quickpay)
    console.info('Sending to lightning invoice w/ amount (quickpay)...');
    const { paymentRequest: invoice7 } = await lnd.addInvoice({ value: '1000' });

    // enable quickpay
    console.info('Enabling quickpay...');
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('GeneralSettings');
    await tap('QuickpaySettings');
    // no quickpay intro as we already dismissed it after getting lightning balance
    await tap('QuickpayToggle');
    await tap('NavigationClose');

    await sleep(1000);
    await enterAddress(invoice7);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterUnified5);
    const amtAfterLightning2 = await totalBalance.getText();
    console.info({ amtAfterLightning2 });
    await expectTextWithin('ActivitySpending', '6 000');

    // send to unified invoice w/ amount (quickpay)
    console.info('Sending to unified invoice w/ amount (quickpay)...');
    const { paymentRequest: invoice8 } = await lnd.addInvoice({ value: '1000' });
    const unified7 = encode(onchainAddress, {
      lightning: invoice8,
    });
    console.info({ unified7 });
    await sleep(1000);
    await enterAddress(unified7);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(totalBalance).not.toHaveText(amtAfterLightning2);
    await expectTextWithin('ActivitySpending', '5 000');

    // send to lightning invoice w/ amount (skip quickpay for large amounts)
    console.info('Sending to lightning invoice w/ amount (skip quickpay for large amounts)...');

    // TEMP: receive more funds to be able to pay 10k invoice
    console.info('Receiving lightning funds...');
    await mineBlocks(rpc, 1);
    await electrum?.waitForSync();
    const receive2 = await getReceiveAddress('lightning');
    await swipeFullScreen('down');
    const r = await lnd.sendPaymentSync({ paymentRequest: receive2, amt: '10000' });
    console.info({ r });
    await elementById('ReceivedTransaction').waitForDisplayed();
    await tap('ReceivedTransactionButton');
    await sleep(500);
    await expectTextWithin('ActivitySpending', '15 000');

    const { paymentRequest: invoice9 } = await lnd.addInvoice({ value: '10000' });
    console.info({ invoice9 });
    await sleep(1000);
    await enterAddress(invoice9);
    await elementById('ReviewAmount').waitForDisplayed();
    await swipeFullScreen('down');
  });
});
