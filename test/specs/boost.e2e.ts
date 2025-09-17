import BitcoinJsonRpc from 'bitcoin-json-rpc';

import {
  sleep,
  completeOnboarding,
  tap,
  elementById,
  receiveOnchainFunds,
  typeText,
  confirmInputOnKeyboard,
  expectTextVisible,
  dragOnElement,
  swipeFullScreen,
  expectTextWithin,
  elementByIdWithin,
  getTextUnder,
  mineBlocks,
  attemptRefreshOnHomeScreen,
} from '../helpers/actions';
import { bitcoinURL } from '../helpers/constants';
import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';

describe('@boost - Boost', () => {
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

  after(() => {
    electrum?.stop();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  it('@boost_1 - Can do CPFP', async () => {
    // fund the wallet (100 000), don't mine blocks so tx is unconfirmed
    await receiveOnchainFunds(rpc, { sats: 100_000, blocksToMine: 0 });

    // check Activity
    await swipeFullScreen('up');
    await expectTextWithin('ActivityShort-0', '100 000');
    await expectTextWithin('ActivityShort-0', '+');

    // old tx
    await tap('ActivityShort-0');
    await expectTextVisible('100 000');
    await tap('ActivityTxDetails');
    const origTxId = await getTextUnder('TXID');
    console.info({ oldTxId: origTxId });
    await tap('NavigationBack');

    // boost
    await tap('BoostButton');
    await elementById('CPFPBoost').waitForDisplayed();
    await tap('CustomFeeButton');
    await tap('Plus');
    await tap('Minus');
    await tap('RecomendedFeeButton');
    await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm

    // check Activity
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-0').waitForDisplayed();
    await expect(elementById('ActivityShort-1')).toBeDisplayed();
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();

    // orig tx still there
    await swipeFullScreen('up');
    await tap('ActivityShort-1');
    await expectTextVisible('100 000');
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();
    await tap('ActivityTxDetails');
    const checkOrigTxId = await getTextUnder('TXID');
    console.info({ checkOrigTxId });
    await expect(origTxId === checkOrigTxId).toBe(true);
    await elementById('CPFPBoosted').waitForDisplayed();
    const parentTxId = await getTextUnder('CPFPBoosted');
    console.info({ parentTxId });
    await tap('NavigationClose');

    // new tx
    await tap('ActivityShort-0');
    await tap('ActivityTxDetails');
    const boostTxId = await getTextUnder('TXID');
    console.info({ newTxId: boostTxId });
    await expect(origTxId !== boostTxId).toBe(true);
    // TODO: not implemented yet
    // await expect(boostTxId === parentTxId).toBe(true);
    await tap('NavigationClose');

    // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/321 --- //

    // boost & transfers backup not working yet
    // // wipe & restore
    // const seed = await getSeed();
    // // await waitForBackup();
    // await sleep(10_000); //temp wait (until we have a proper event for backup completion)
    // await restoreWallet(seed);

    // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/321 --- //

    // check activity after restore
    await swipeFullScreen('up');
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await tap('ActivityShort-1');
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();

    // mine new block
    await mineBlocks(rpc, 1);

    // check activity item after mine
    // TEMP: refresh until proper events available
    await tap('NavigationClose');
    await sleep(500);
    await swipeFullScreen('down');
    await attemptRefreshOnHomeScreen();
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    // TEMP: refresh until proper events available

    await tap('ActivityShort-0');
    await elementById('StatusConfirmed').waitForDisplayed();
    await tap('NavigationClose');
    await tap('ActivityShort-1');
    await elementById('StatusConfirmed').waitForDisplayed();
  });

  it('@boost_2 - Can do RBF', async () => {
    // fund the wallet (100 000)
    await receiveOnchainFunds(rpc);

    // Send 10 000
    const coreAddress = await rpc.getNewAddress();
    await tap('Send');
    await sleep(1000);
    try {
      await tap('RecipientManual');
      await elementById('RecipientInput').waitForDisplayed();
    } catch {
      console.warn('RecipientInput not found, trying again');
      await tap('RecipientManual');
    }
    await typeText('RecipientInput', coreAddress);
    await confirmInputOnKeyboard();
    await tap('AddressContinue');
    await tap('N1');
    await tap('N0');
    await tap('N000');
    await expectTextVisible('10 000');
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    const moneyText = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(moneyText).not.toHaveText('100 000');

    // check Activity
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await expectTextWithin('ActivityShort-0', '-');
    await elementById('ActivityShort-1').waitForDisplayed();
    await expectTextWithin('ActivityShort-1', '100 000');
    await expectTextWithin('ActivityShort-1', '+');
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();

    // confirmed receiving tx
    await tap('ActivityShort-1');
    await elementById('BoostDisabled').waitForDisplayed();
    await tap('NavigationBack');
    await sleep(500); // wait for the app to settle

    // old tx
    await tap('ActivityShort-0');
    await expectTextWithin('ActivityAmount', '10 000');
    const oldFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
    console.info({ oldFee });
    await tap('ActivityTxDetails');
    const oldTxId = await getTextUnder('TXID');
    console.info({ oldTxId });
    await tap('NavigationBack');

    // boost
    await tap('BoostButton');
    await elementById('RBFBoost').waitForDisplayed();
    await tap('CustomFeeButton');
    await tap('Plus');
    await tap('Minus');
    await tap('RecomendedFeeButton');
    await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm

    // check Activity
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();

    // new tx
    await tap('ActivityShort-0');
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();
    await expectTextWithin('ActivityAmount', '10 000');
    const newFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
    console.info({ newFee });
    await tap('ActivityTxDetails');
    const newTxId = await getTextUnder('TXID');
    console.info({ newTxId });
    await expect(Number(oldFee.replace(' ', '')) < Number(newFee.replace(' ', ''))).toBe(true);
    await expect(oldTxId !== newTxId).toBe(true);
    await elementById('RBFBoosted').waitForDisplayed();
    await tap('NavigationClose');

    // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/321 --- //

    // boost & transfers backup not working yet
    // // wipe & restore
    // const seed = await getSeed();
    // // await waitForBackup();
    // await sleep(10_000); //temp wait (until we have a proper event for backup completion)
    // await restoreWallet(seed);

    // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/321 --- //

    // check activity after restore
    await swipeFullScreen('up');
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-0').waitForDisplayed();
    await tap('ActivityShort-0');
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();

    // mine new block
    await mineBlocks(rpc, 1);

    // check activity item after mine
    // TEMP: refresh until proper events available
    await tap('NavigationClose');
    await sleep(500);
    await swipeFullScreen('down');
    await attemptRefreshOnHomeScreen();
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await tap('ActivityShort-0');
    // TEMP: refresh until proper events available
    await elementById('StatusConfirmed').waitForDisplayed();
  });
});
