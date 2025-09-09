import createLndRpc from '@radar/lnrpc';
import BitcoinJsonRpc from 'bitcoin-json-rpc';
import { encode } from 'bip21';

import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  dragOnElement,
  elementById,
  elementByIdWithin,
  elementsById,
  expectTextWithin,
  getReceiveAddress,
  receiveOnchainFunds,
  sleep,
  swipeFullScreen,
  waitForActiveChannel,
  waitForPeerConnection,
} from '../helpers/actions';
import { bitcoinURL, lndConfig } from '../helpers/constants';
import { reinstallApp } from '../helpers/setup';
import { confirmInputOnKeyboard, tap, typeText } from '../helpers/actions';

async function enterAddress(address: string) {
  await tap('Send');
  await sleep(700);
  await tap('RecipientManual');
  await typeText('RecipientInput', address);
  await confirmInputOnKeyboard();
  // wait for keyboard to hide
  await sleep(1000);
  await tap('AddressContinue');
}

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

  it('@send_1 - Validates payment data in the manual input', async () => {
    await tap('Send');
    await tap('RecipientManual');

    // check validation for empty address
    await elementById('AddressContinue').waitForEnabled({ reverse: true });

    // check validation for invalid data
    await typeText('RecipientInput', 'test123');
    await confirmInputOnKeyboard();
    await sleep(1000);
    await elementById('AddressContinue').waitForEnabled({ reverse: true });

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // // check validation for invalid address (network mismatch)
    // const mainnetAddress = 'bc1qnc8at2e2navahnz7lvtl39r4dnfzxv3cc9e7ax';
    // await typeText('RecipientInput', mainnetAddress);
    // await confirmInputOnKeyboard();
    // await sleep(1000);
    // await elementById('AddressContinue').waitForEnabled({reverse: true});

    // // check validation for address when balance is 0
    // const address = await rpc.getNewAddress();
    // console.info({ address });
    // await typeText('RecipientInput', address);
    // await confirmInputOnKeyboard();
    // await sleep(1000);
    // await elementById('AddressContinue').waitForEnabled({reverse: true});

    // // check validation for expired invoice
    // const invoice =
    //   'lnbcrt1pn3zpqpdqqnp4qfh2x8nyvvzq4kf8j9wcaau2chr580l93pnyrh5027l8f7qtm48h6pp5lmwkulnpze4ek4zqwfepguahcr2ma3vfhwa6uepxfd378xlldprssp5wnq34d553g50suuvfy387csx5hx6mdv8zezem6f4tky7rhezycas9qyysgqcqpcxqrrssrzjqtr7pzpunxgwjddwdqucegdphm6776xcarz60gw9gxva0rhal5ntmapyqqqqqqqqpqqqqqlgqqqqqqgq2ql9zpeakxvff9cz5rd6ssc3cngl256u8htm860qv3r28vqkwy9xe3wp0l9ms3zcqvys95yf3r34ytmegz6zynuthh5s0kh7cueunm3mspg3uwpt';
    // await typeText('RecipientInput', invoice);
    // await confirmInputOnKeyboard();
    // await sleep(1000);
    // await elementById('AddressContinue').waitForEnabled({reverse: true});

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // Receive funds and check validation w/ balance
    await swipeFullScreen('down');
    await receiveOnchainFunds(rpc);

    await tap('Send');
    await tap('RecipientManual');

    // check validation for address
    const address2 = await rpc.getNewAddress();
    await typeText('RecipientInput', address2);
    await confirmInputOnKeyboard();
    await sleep(1000);
    await elementById('AddressContinue').waitForEnabled();

    // check validation for unified invoice when balance is enough
    const unified1 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.0001';
    await typeText('RecipientInput', unified1);
    await confirmInputOnKeyboard();
    await sleep(1000);
    await elementById('AddressContinue').waitForEnabled();

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//

    // // check validation for unified invoice when balance is too low
    // const unified2 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.002';
    // await typeText('RecipientInput', unified2);
    // await confirmInputOnKeyboard();
    // await sleep(1000);
    // await elementById('AddressContinue').waitForEnabled({ reverse: true });

    //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/354 ---//
  });

  it('@send_2 - Can receive funds and send to different invoices', async () => {
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
    const lnd = await createLndRpc(lndConfig);
    const { address: lndAddress } = await lnd.newAddress();
    await rpc.sendToAddress(lndAddress, '1');
    await rpc.generateToAddress(1, await rpc.getNewAddress());
    await electrum?.waitForSync();
    const { identityPubkey: lndNodeID } = await lnd.getInfo();
    console.info({ lndNodeID });

    // get LDK Node id
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    // wait for LDK to start
    await sleep(5000);
    await tap('LightningNodeInfo');
    await elementById('LDKNodeID').waitForDisplayed({ timeout: 60_000 });
    const ldkNodeId = (await elementById('LDKNodeID').getText()).trim();
    console.info({ ldkNodeId });
    await tap('NavigationBack');

    // connect to LND
    await tap('Channels');
    await tap('NavigationAction');
    await tap('FundCustom');
    await tap('FundManual');
    await typeText('NodeIdInput', lndNodeID);
    await typeText('HostInput', '0.0.0.0');
    await typeText('PortInput', '9735');
    await confirmInputOnKeyboard();
    await tap('ExternalContinue');
    await tap('NavigationClose');

    // wait for peer to be connected
    await waitForPeerConnection(lnd, ldkNodeId);

    // open a channel
    await lnd.openChannelSync({
      nodePubkeyString: ldkNodeId,
      localFundingAmount: '100000',
      private: true,
    });
    console.info('Channel opening...');
    await rpc.generateToAddress(6, await rpc.getNewAddress());
    await electrum?.waitForSync();

    // wait for channel to be active
    await waitForActiveChannel(lnd, ldkNodeId);
    console.info('Channel is active!');

    // workaround for: https://github.com/synonymdev/bitkit-android/issues/359
    await elementById('ReceivedTransaction').waitForDisplayed();
    await tap('ReceivedTransactionButton');

    // check channel status
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    await tap('Channels');
    await tap('Channel');
    await expectTextWithin('TotalSize', '₿ 100 000');
    await swipeFullScreen('up');
    await elementById('IsUsableYes').waitForDisplayed();
    await tap('NavigationClose');
    await sleep(500);

    // receive lightning funds
    const receive = await getReceiveAddress('lightning');
    await swipeFullScreen('down');

    // const dec = await lnd.decodePayReq({ payReq: receive });
    // console.info(JSON.stringify(dec, null, 2));
    const response = await lnd.sendPaymentSync({ paymentRequest: receive, amt: '10000' });
    console.info({ response });
    await elementById('ReceivedTransaction').waitForDisplayed();
    await tap('ReceivedTransactionButton');
    await sleep(500);

    const moneyText = (await elementsById('MoneyText'))[1];
    await expect(moneyText).toHaveText('110 000'); // 100k onchain + 10k lightning
    await expectTextWithin('ActivitySpending', '10 000');

    // send to onchain address
    console.info('Sending to onchain address...');
    const { address: onchainAddress } = await lnd.newAddress();
    console.info({ onchainAddress });
    await enterAddress(onchainAddress);
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N1');
    for (let i = 1; i <= 4; i++) {
      await tap('N0');
    }
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(moneyText).not.toHaveText('110 000');
    const amtAfterOnchain = await moneyText.getText();
    await expectTextWithin('ActivitySpending', '10 000');

    // send to lightning invoice
    console.info('Sending to lightning invoice...');
    const { paymentRequest: invoice1 } = await lnd.addInvoice({});
    console.info({ invoice1 });
    await sleep(1000);
    await enterAddress(invoice1);
    await elementById('AssetButton-spending').waitForDisplayed();
    await tap('N1');
    for (let i = 1; i <= 3; i++) {
      await tap('N0');
    }
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(moneyText).not.toHaveText(amtAfterOnchain);
    const amtAfterLightning = await moneyText.getText();
    await expectTextWithin('ActivitySpending', '9 000');

    // can edit invoice on the review screen
    console.info('Editing invoice on review screen...');
    const { paymentRequest: invoice2 } = await lnd.addInvoice({ value: '1000' });
    await enterAddress(invoice2);
    const amt_el = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
    await amt_el.waitForDisplayed();
    await expect(amt_el).toHaveText('1 000');
    await tap('ReviewUri');
    await sleep(1500);
    await elementById('RecipientInput').waitForDisplayed();
    await typeText('RecipientInput', onchainAddress);
    await confirmInputOnKeyboard();
    await sleep(500);
    await tap('AddressContinue');
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N2');
    for (let i = 1; i <= 4; i++) {
      await tap('N0');
    }
    await tap('ContinueAmount');
    await amt_el.waitForDisplayed();
    await expect(amt_el).toHaveText('20 000');
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
    await expect(moneyText).toHaveText('1 000'); // invoice amount
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(moneyText).not.toHaveText(amtAfterLightning);
    const amtAfterUnified = await moneyText.getText();
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
    await amt_el.waitForDisplayed();
    await expect(amt_el).toHaveText('20 000');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(moneyText).not.toHaveText(amtAfterUnified);
    const amtAfterUnified2 = await moneyText.getText();
    await expectTextWithin('ActivitySpending', '8 000');

    // send to unified invoice w/ expired invoice
    console.info('Sending to unified invoice w/ expired invoice...');
    const unified3 =
      'bitcoin:bcrt1qaytrqsrgg75rtxrtr7ur6k75la8p3v95mey48z?lightning=LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    console.info({ unified3 });

    const ln =
      'LNBCRT1PN33T20DQQNP4QTNTQ4D2DHDYQ420HAUQF5TS7X32TNW9WGYEPQZQ6R9G69QPHW4RXPP5QU7UYXJYJA9PJV7H6JPEYEFFNZ98N686JDEAAK8AUD5AGC5X70HQSP54V5LEFATCQDEU8TLKAF6MDK3ZLU6MWUA52J4JEMD5XA85KGKMTTQ9QYYSGQCQPCXQRRSSRZJQWU6G4HMGH26EXXQYPQD8XHVWLARA66PL53V7S9CV2EE808UGDRN4APYQQQQQQQGRCQQQQLGQQQQQQGQ2QX7F74RT5SQE0KEYCU47LYMSVY2LM4QA4KLR65PPSY55M0H4VR8AN7WVM9EFVSPYJ5R8EFGVXTGVATAGFTC372VRJ3HEPSEELFZ7FQFCQ9XDU9X';
    const dec = await lnd.decodePayReq({ payReq: ln });
    console.info(JSON.stringify(dec, null, 2));

    await sleep(1000);
    await enterAddress(unified3);
    await elementById('AssetButton-savings').waitForDisplayed();
    await tap('N1');
    for (let i = 1; i <= 4; i++) {
      await tap('N0');
    }
    await tap('ContinueAmount');
    await amt_el.waitForDisplayed();
    await expect(amt_el).toHaveText('10 000');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await expect(moneyText).not.toHaveText(amtAfterUnified2);
    const amtAfterUnified3 = await moneyText.getText();
    await expectTextWithin('ActivitySpending', '8 000');

    // send to unified invoice w/o amount (lightning)
    console.info('Sending to unified invoice w/o amount (lightning)...');
    const { paymentRequest: invoice5 } = await lnd.addInvoice({});
    const unified4 = encode(onchainAddress, { lightning: invoice5 });
    console.info({ unified4 });
    await sleep(1000);
    await enterAddress(unified4);

    // max amount (lightning)
    await sleep(100000);
    // await expect(element(by.text('28 900'))).toBeVisible();
    // await element(by.id('AssetButton-switch')).tap();
    // // max amount (onchain)
    // await expect(element(by.text('68 008'))).toBeVisible();
    // await element(by.id('AssetButton-switch')).tap();
    // await element(by.id('N1').withAncestor(by.id('SendAmountNumberPad'))).tap();
    // await element(by.id('N0').withAncestor(by.id('SendAmountNumberPad'))).multiTap(4);
    // await element(by.id('ContinueAmount')).tap();
    // await element(by.id('GRAB')).swipe('right', 'slow', 0.95, 0.5, 0.5); // Swipe to confirm
    // await waitFor(element(by.id('SendSuccess')))
    //   .toBeVisible()
    //   .withTimeout(10000);
    // await element(by.id('Close')).tap();
    // await waitFor(element(by.id('MoneyText').withAncestor(by.id('TotalBalance'))))
    //   .toHaveText('88 506')
    //   .withTimeout(10000);

    // // send to unified invoice w/o amount (switch to onchain)
    // const { paymentRequest: invoice6 } = await lnd.addInvoice();
    // const unified5 = encode(onchainAddress, { lightning: invoice6 });

    // await enterAddress(unified5);

    // // max amount (lightning)
    // await element(by.id('AvailableAmount')).tap();
    // await element(by.id('ContinueAmount')).tap();
    // await expect(element(by.text('18 900'))).toBeVisible();
    // await element(by.id('NavigationBack')).atIndex(0).tap();

    // // max amount (onchain)
    // await element(by.id('AssetButton-switch')).tap();
    // await element(by.id('AvailableAmount')).tap();
    // await element(by.id('ContinueAmount')).tap();
    // await expect(element(by.text('68 008'))).toBeVisible();
    // await element(by.id('NavigationBack')).atIndex(0).tap();

    // await element(by.id('NRemove').withAncestor(by.id('SendAmountNumberPad'))).multiTap(5);
    // await element(by.id('N1').withAncestor(by.id('SendAmountNumberPad'))).tap();
    // await element(by.id('N0').withAncestor(by.id('SendAmountNumberPad'))).multiTap(4);
    // await element(by.id('ContinueAmount')).tap();
    // await element(by.id('GRAB')).swipe('right', 'slow', 0.95, 0.5, 0.5); // Swipe to confirm
    // await waitFor(element(by.id('SendSuccess')))
    //   .toBeVisible()
    //   .withTimeout(10000);
    // await element(by.id('Close')).tap();
    // await waitFor(element(by.id('MoneyText').withAncestor(by.id('TotalBalance'))))
    //   .toHaveText('78 008')
    //   .withTimeout(10000);

    // // send to lightning invoice w/ amount (quickpay)
    // const { paymentRequest: invoice7 } = await lnd.addInvoice({ value: 1000 });

    // // enable quickpay
    // await element(by.id('HeaderMenu')).tap();
    // await element(by.id('DrawerSettings')).tap();
    // await element(by.id('GeneralSettings')).tap();
    // await element(by.id('QuickpaySettings')).tap();
    // await element(by.id('QuickpayIntro-button')).tap();
    // await element(by.id('QuickpayToggle')).tap();
    // await element(by.id('NavigationClose')).tap();

    // await enterAddress(invoice7);
    // await waitFor(element(by.id('SendSuccess')))
    //   .toBeVisible()
    //   .withTimeout(10000);
    // await element(by.id('Close')).tap();
    // await waitFor(element(by.id('MoneyText').withAncestor(by.id('TotalBalance'))))
    //   .toHaveText('77 008')
    //   .withTimeout(10000);

    // // send to unified invoice w/ amount (quickpay)
    // const { paymentRequest: invoice8 } = await lnd.addInvoice({ value: 1000 });
    // const unified7 = encode(onchainAddress, {
    //   lightning: invoice8,
    //   amount: 1000,
    // });

    // await enterAddress(unified7);
    // await waitFor(element(by.id('SendSuccess')))
    //   .toBeVisible()
    //   .withTimeout(10000);
    // await element(by.id('Close')).tap();
    // await waitFor(element(by.id('MoneyText').withAncestor(by.id('TotalBalance'))))
    //   .toHaveText('76 008')
    //   .withTimeout(10000);

    // // send to lightning invoice w/ amount (skip quickpay for large amounts)
    // const { paymentRequest: invoice9 } = await lnd.addInvoice({ value: 10000 });
    // await enterAddress(invoice9);
    // await expect(element(by.id('ReviewAmount'))).toBeVisible();
    // await element(by.id('SendSheet')).swipe('down');
  });
});
