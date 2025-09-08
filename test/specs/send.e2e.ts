// import createLndRpc from '@radar/lnrpc';
import BitcoinJsonRpc from 'bitcoin-json-rpc';
// import { encode } from 'bip21';

import initElectrum from '../helpers/electrum';
import {
  // lndConfig,
  completeOnboarding,
  elementById,
  receiveOnchainFunds,
  sleep,
  swipeFullScreen,
  // receiveOnchainFunds,
  // waitForActiveChannel,
  // waitForPeerConnection,
  // isButtonEnabled,
} from '../helpers/actions';
import { bitcoinURL } from '../helpers/constants';
import { reinstallApp } from '../helpers/setup';
import { confirmInputOnKeyboard, tap, typeText } from '../helpers/actions';

async function enterAddress(address: string) {
  await tap('Send');
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

  it('Validates payment data in the manual input', async () => {
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
});
