import BitcoinJsonRpc from 'bitcoin-json-rpc';

import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  sleep,
  receiveOnchainFunds,
  tap,
  expectTextVisible,
  elementByText,
  elementsById,
  elementById,
  multiTap,
  dragOnElement,
  expectTextWithin,
  swipeFullScreen,
  mineBlocks,
  elementByIdWithin,
  enterAddress,
} from '../helpers/actions';
import {
  checkChannelStatus,
  connectToLND,
  getLDKNodeID,
  setupLND,
  waitForActiveChannel,
  waitForPeerConnection,
} from '../helpers/lnd';
import { bitcoinURL, lndConfig } from '../helpers/constants';

import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@transfer - Transfer', () => {
  let electrum: { waitForSync: () => any; stop: () => void };
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

  afterEach(() => {
    electrum?.stop();
  });

  // Test Plan
  // Can buy a channel from Blocktank with default and custom receive capacity
  // 	- cannot continue with zero spending balance
  // 	- can change amount
  // 	Advanced
  // 	- can change amount
  // Can open a channel to external node
  // 	- open channel to LND
  // 	- send payment
  // 	- close the channel
  ciIt(
    '@transfer_1 - Can buy a channel from Blocktank with default and custom receive capacity',
    async () => {
      await receiveOnchainFunds(rpc, { sats: 1000_000, expectHighBalanceWarning: true });

      // switch to EUR
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      await elementByText('EUR (€)').click();
      await tap('NavigationClose');

      await tap('ActivitySavings');
      await tap('TransferToSpending');
      await tap('SpendingIntro-button');
      await elementById('SpendingAmount').waitForDisplayed();
      await sleep(1000); // let the animation finish

      //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/425 ---//
      //// can continue with default client balance (0)
      //await tap('SpendingAmountContinue');
      //await sleep(100);
      //await tap('SpendingConfirmAdvanced');
      //await tap('SpendingAdvancedMin');
      //await expectTextVisible('100 000');
      //await tap('SpendingAdvancedDefault');
      //await tap('SpendingAdvancedNumberField'); // change to fiat
      //const label = await getTextUnder('SpendingAdvancedNumberField');
      //const eurBalance = Number.parseInt(label, 10);
      //await expect(eurBalance).toBeGreaterThan(440);
      //await expect(eurBalance).toBeLessThan(460);
      //await tap('SpendingAdvancedNumberField'); // change back to sats
      //await tap('SpendingAdvancedContinue');
      //await tap('NavigationBack');
      //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/425 ---//

      //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/424 ---//
      // can continue with max client balance
      //await tap('SpendingAmountMax');
      //await elementById('SpendingAmountContinue').waitForEnabled();
      //await sleep(500);
      //await tap('SpendingAmountContinue');
      //await elementById('SpendingConfirmAdvanced').waitForDisplayed();
      //await tap('NavigationBack');
      //--- skip due to: https://github.com/synonymdev/bitkit-android/issues/424 ---//

      // can continue with 25% client balance
      await tap('SpendingAmountQuarter');
      await elementById('SpendingAmountContinue').waitForEnabled();
      await sleep(500);
      await tap('SpendingAmountContinue');
      await elementById('SpendingConfirmAdvanced').waitForDisplayed();
      await tap('NavigationBack');
      await tap('NavigationBack');
      await tap('SpendingIntro-button');

      // can change client balance
      await tap('N2');
      await multiTap('N0', 5);
      await tap('SpendingAmountContinue');
      await expectTextVisible('200 000');
      await tap('SpendingConfirmMore');
      await expectTextVisible('200 000');
      await tap('LiquidityContinue');
      // Swipe to confirm (set x offset to avoid navigating back)
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('LightningSettingUp').waitForDisplayed();
      await tap('TransferSuccess-button');

      // verify transfer activity on savings
      await elementById('Activity-1').waitForDisplayed();
      await expectTextWithin('Activity-1', 'Transfer');
      await expectTextWithin('Activity-1', '-');
      await tap('NavigationBack');
      // transfer in progress
      //await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

      // Get another channel with custom receiving capacity
      await tap('ActivitySavings');
      await tap('TransferToSpending');
      await tap('N1');
      await multiTap('N0', 5);
      await tap('SpendingAmountContinue');
      await expectTextVisible('100 000');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');

      // Receiving Capacity
      // can continue with min amount
      await tap('SpendingAdvancedMin');
      await expectTextVisible('2 500');
      await tap('SpendingAdvancedContinue');
      await tap('SpendingConfirmDefault');
      await tap('SpendingConfirmAdvanced');

      // can continue with default amount
      await tap('SpendingAdvancedDefault');
      await tap('SpendingAdvancedContinue');
      await tap('SpendingConfirmDefault');
      await tap('SpendingConfirmAdvanced');

      // can continue with max amount
      await tap('SpendingAdvancedMax');
      await tap('SpendingAdvancedContinue');
      await tap('SpendingConfirmDefault');
      await tap('SpendingConfirmAdvanced');

      // can set custom amount
      await tap('N1');
      await tap('N5');
      await multiTap('N0', 4);
      await tap('SpendingAdvancedContinue');
      await expectTextWithin('SpendingConfirmChannel', '100 000');
      await expectTextWithin('SpendingConfirmChannel', '150 000');
      // Swipe to confirm (set x offset to avoid navigating back)
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('LightningSettingUp').waitForDisplayed();
      await tap('TransferSuccess-button');

      // verify both transfers activities on savings
      await elementById('Activity-1').waitForDisplayed();
      await expectTextWithin('Activity-1', 'Transfer');
      await expectTextWithin('Activity-1', '-');
      await elementById('Activity-2').waitForDisplayed();
      await expectTextWithin('Activity-2', 'Transfer');
      await expectTextWithin('Activity-2', '-');
      await tap('NavigationBack');
      // transfer in progress
      //await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

      // check channel status
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('Channels');
      const channels = await elementsById('Channel');
      channels[1].click();
      await expectTextWithin('TotalSize', '₿ 250 000');
      await expectTextVisible('Processing payment');
      await tap('NavigationClose');

      // check activities
      await sleep(1000);
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', 'Transfer');
      await elementById('ActivityShort-1').waitForDisplayed();
      await expectTextWithin('ActivityShort-1', 'Transfer');

      // TODO: enable when boost backup is operational
      // https://github.com/synonymdev/bitkit-android/issues/321
      //const seed = await getSeed();
      //await waitForBackup();
      //await restoreWallet(seed);

      // check transfer card
      //await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

      // check activity after restore
      //await swipeFullScreen('up');
      //await tap('ActivityShort-1');
      //await elementById('StatusTransfer').waitForDisplayed();

      // boost the transfer
      //await tap('BoostButton');
      //await elementById('CPFPBoost').waitForDisplayed();
      //await dragOnElement('GRAB', 'right', 0.95); // Swipe to confirm

      // check Activity
      //await elementById('BoostingIcon').waitForDisplayed();

      // reset & restore again
      // await waitForBackup();
      // await restoreWallet(seed);

      // // check activity after restore
      // await swipeFullScreen('up');
      // await elementById('BoostingIcon').waitForDisplayed();
      // await tap('ActivityShort-1');
      // await elementById('StatusBoosting').waitForDisplayed();
    }
  );

  ciIt('@transfer_2 - Can open a channel to external node', async () => {
    await receiveOnchainFunds(rpc, { sats: 100_000 });

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
    await tap('N2');
    await multiTap('N0', 4);
    await tap('ExternalAmountContinue');

    // change fee
    await tap('SetCustomFee');
    await tap('NRemove');
    await sleep(1000); // wait for input to register
    await tap('FeeCustomContinue');
    await tap('N5');
    await sleep(1000); // wait for input to register
    await tap('FeeCustomContinue');

    // Swipe to confirm (set x offset to avoid navigating back)
    await dragOnElement('GRAB', 'right', 0.95);
    console.log('channel opening...');
    await sleep(1000);
    await elementById('ExternalSuccess').waitForDisplayed();
    await tap('ExternalSuccess-button');
    await tap('NavigationBack');
    await tap('NavigationClose');

    // check transfer card
    // await elementById('Suggestion-lightning_setting_up').waitForDisplayed();

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    const totalAmtAfterChannelOpen = await totalBalance.getText();
    await expect(totalBalance).not.toHaveText('100 000');
    // await expectTextWithin('ActivitySavings', '100 000', false);
    // await expectTextWithin('ActivitySpending', '0', false);

    // check activity
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    // should be Transfer after https://github.com/synonymdev/bitkit-android/pull/414
    await expectTextWithin('ActivityShort-0', 'Sent');
    await elementById('ActivityShort-1').waitForDisplayed();
    await expectTextWithin('ActivityShort-1', 'Received');
    await swipeFullScreen('down');

    // Mine 3 blocks
    await mineBlocks(rpc, 3);

    // wait for channel to be opened
    await waitForActiveChannel(lnd, ldkNodeId);
    await expectTextVisible('Spending Balance Ready');

    // check transfer card
    // await elementById('Suggestion-lightning_setting_up').waitForDisplayed({reverse: true});

    // check channel status
    await checkChannelStatus({ size: '20 000' });

    // get invoice
    const { paymentRequest } = await lnd.addInvoice({ memo: 'zero' });

    // send payment
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
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('TransferSuccess').waitForDisplayed();
    await tap('TransferSuccess-button');
    await tap('NavigationBack');

    // check channel is closed
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    await tap('Channels');
    await expectTextVisible('Connection 1', false);
  });
});
