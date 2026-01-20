import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  sleep,
  receiveOnchainFunds,
  tap,
  expectText,
  elementByText,
  elementsById,
  elementById,
  multiTap,
  dragOnElement,
  expectTextWithin,
  swipeFullScreen,
  elementByIdWithin,
  enterAddress,
  dismissQuickPayIntro,
  doNavigationClose,
  waitForToast,
  getTextUnder,
  acknowledgeExternalSuccess,
  dismissBackgroundPaymentsTimedSheet,
  expectNoTextWithin,
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

import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@transfer - Transfer', () => {
  let electrum: { waitForSync: () => any; stop: () => void };
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
      await receiveOnchainFunds({ sats: 1000_000, expectHighBalanceWarning: true });

      // switch to EUR
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      await elementByText('EUR (€)').click();
      await doNavigationClose();

      if (driver.isAndroid) await launchFreshApp();
      await tap('Suggestion-lightning');
      await tap('TransferIntro-button');
      await tap('FundTransfer');
      await tap('SpendingIntro-button');
      await sleep(3000); // let the animation finish

      // can continue with default client balance (0)
      await tap('SpendingAmountContinue');
      await sleep(100);
      await tap('SpendingConfirmAdvanced');
      await tap('SpendingAdvancedMin');
      await expectText('100 000', { strategy: 'contains' });
      await tap('SpendingAdvancedDefault');
      await tap('SpendingAdvancedNumberField'); // change to fiat
      const label = await getTextUnder('SpendingAdvancedNumberField');
      const eurBalance = Number.parseInt(label, 10);
      await expect(eurBalance).toBeGreaterThan(440);
      await expect(eurBalance).toBeLessThan(460);
      await tap('SpendingAdvancedNumberField'); // change back to sats
      await tap('SpendingAdvancedContinue');
      await tap('NavigationBack');

      // can continue with max client balance
      await tap('SpendingAmountMax');
      await elementById('SpendingAmountContinue').waitForEnabled();
      await sleep(500);
      await tap('SpendingAmountContinue');
      await elementById('SpendingConfirmAdvanced').waitForDisplayed();
      await tap('NavigationBack');

      // can continue with 25% client balance
      await elementById('SpendingAmountQuarter').waitForEnabled();
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
      await expectText('200 000', { strategy: 'contains' });
      await tap('SpendingConfirmMore');
      await expectText('200 000');
      await tap('LiquidityContinue');
      // Swipe to confirm (set x offset to avoid navigating back)
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('LightningSettingUp').waitForDisplayed();
      await tap('TransferSuccess-button');

      // verify transfer activity on savings
      await tap('ActivitySavings');
      await elementById('Activity-1').waitForDisplayed();
      await elementById('Activity-2').waitForDisplayed();
      await expectTextWithin('Activity-1', 'Transfer', { timeout: 60_000 });
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
      await expectText('100 000', { strategy: 'contains' });
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await sleep(500);

      // Receiving Capacity
      // can continue with min amount
      await tap('SpendingAdvancedMin');
      await sleep(500);
      await expectText('2 500');
      await expectText('—', { visible: false });
      await tap('SpendingAdvancedContinue');
      await sleep(500);
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await sleep(500);

      // can continue with default amount
      await tap('SpendingAdvancedDefault');
      await sleep(500);
      await expectText('—', { visible: false });
      await tap('SpendingAdvancedContinue');
      await sleep(500);
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await sleep(500);

      // can continue with max amount
      await tap('SpendingAdvancedMax');
      await sleep(500);
      await expectText('—', { visible: false });
      await tap('SpendingAdvancedContinue');
      await sleep(500);
      await tap('SpendingConfirmDefault');
      await sleep(500);
      await tap('SpendingConfirmAdvanced');
      await sleep(500);

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
      await tap('ActivitySavings');
      await elementById('Activity-1').waitForDisplayed();
      await elementById('Activity-2').waitForDisplayed();
      await elementById('Activity-3').waitForDisplayed();
      await expectTextWithin('Activity-1', 'Transfer');
      await expectTextWithin('Activity-1', '-');
      await elementById('Activity-2').waitForDisplayed();
      await expectTextWithin('Activity-2', 'Transfer', { timeout: 60_000 });
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
      channels[driver.isAndroid ? 1 : 0].click();
      await expectTextWithin('TotalSize', '₿ 250 000');
      await expectText('Processing payment');
      await doNavigationClose();

      // check activities
      await sleep(1000);
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', 'Transfer');
      await elementById('ActivityShort-1').waitForDisplayed();
      await expectTextWithin('ActivityShort-1', 'Transfer');

      await tap('ActivityShowAll');

      // All transactions
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', '-');
      await expectTextWithin('Activity-3', '+');

      // Sent, 0 transactions
      await tap('Tab-sent');
      await elementById('Activity-1').waitForDisplayed({ reverse: true });

      // Received, 1 transaction
      await tap('Tab-received');
      await expectTextWithin('Activity-1', '+');
      await elementById('Activity-2').waitForDisplayed({ reverse: true });

      // Other, 2 transfer transactions
      await tap('Tab-other');
      await expectTextWithin('Activity-1', '-');
      await expectTextWithin('Activity-2', '-');
      await elementById('Activity-3').waitForDisplayed({ reverse: true });

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
    await tap('N2');
    await multiTap('N0', 4);
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

    // check activity
    await swipeFullScreen('up');
    await elementById('ActivityShort-0').waitForDisplayed();
    await expectTextWithin('ActivityShort-0', 'Transfer');
    await elementById('ActivityShort-1').waitForDisplayed();
    await expectTextWithin('ActivityShort-1', 'Received');
    await swipeFullScreen('down');

    await mineBlocks(6);
    await electrum?.waitForSync();
    await waitForToast('SpendingBalanceReadyToast');
    await sleep(1000);
    if (driver.isIOS) {
      await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: driver.isIOS });
      await dismissQuickPayIntro({ triggerTimedSheet: driver.isIOS });
    } else {
      await dismissQuickPayIntro({ triggerTimedSheet: true });
    }
    await expectNoTextWithin('ActivitySpending', '0');
    await waitForActiveChannel(lnd, ldkNodeId);

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
    await sleep(1000);
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('TransferSuccess').waitForDisplayed();
    await tap('TransferSuccess-button');
    if (driver.isAndroid) await tap('NavigationBack');

    // check channel is closed
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    await tap('Channels');
    await expectText('Connection 1', { visible: false });
  });
});
