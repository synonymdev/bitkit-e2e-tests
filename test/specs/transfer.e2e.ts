import createLnRpc from '@radar/lnrpc';
import BitcoinJsonRpc from 'bitcoin-json-rpc';

import initElectrum from '../helpers/electrum';
import {
  completeOnboarding,
  sleep,
  getSeed,
  restoreWallet,
  waitForBackup,
  receiveOnchainFunds,
  tap,
  expectTextVisible,
  elementByText,
} from '../helpers/actions';
import { waitForActiveChannel, waitForPeerConnection } from '../helpers/lnd';
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
      await receiveOnchainFunds(rpc, { sats: 100_000 });

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

      // can continue with default client balance (0)
      await tap('SpendingAmountContinue');
      await sleep(100);
      await tap('SpendingConfirmAdvanced');
      await tap('SpendingAdvancedMin');
      await expectTextVisible('100 000');
      await tap('SpendingAdvancedDefault');
      await tap('SpendingAdvancedNumberField');

      // await element(by.id('SpendingAdvancedNumberField')).tap();
      // const { label } = await element(by.id('SpendingAdvancedNumberField')).getAttributes();
      // const lspBalance = Number.parseInt(label, 10);
      // jestExpect(lspBalance).toBeGreaterThan(440);
      // jestExpect(lspBalance).toBeLessThan(460);
      // await element(by.id('SpendingAdvancedNumberField')).tap();
      // await element(by.id('SpendingAdvancedContinue')).tap();
      // await element(by.id('NavigationBack')).tap();

      // // can continue with max client balance
      // await element(by.id('SpendingAmountMax')).tap();
      // await element(by.id('SpendingAmountContinue')).tap();
      // await element(by.id('NavigationBack')).tap();

      // // can continue with 25% client balance
      // await element(by.id('SpendingAmountQuarter')).tap();
      // await expect(element(by.text('250 000'))).toBeVisible();
      // await element(by.id('SpendingAmountContinue')).tap();
      // await expect(element(by.text('250 000'))).toBeVisible();
      // await element(by.id('NavigationBack')).tap();
      // await element(by.id('NavigationBack')).tap();
      // await element(by.id('SpendingIntro-button')).tap();

      // // can change client balance
      // await element(by.id('N2').withAncestor(by.id('SpendingAmount'))).tap();
      // await element(by.id('N0').withAncestor(by.id('SpendingAmount'))).multiTap(5);
      // await element(by.id('SpendingAmountContinue')).tap();
      // await expect(element(by.text('200 000'))).toBeVisible();
      // await element(by.id('SpendingConfirmMore')).tap();
      // await expect(element(by.text('200 000'))).toBeVisible();
      // await element(by.id('LiquidityContinue')).tap();

      // // Swipe to confirm (set x offset to avoid navigating back)
      // await element(by.id('GRAB')).swipe('right', 'slow', 0.95, 0.5, 0.5);
      // await waitFor(element(by.id('LightningSettingUp')))
      //   .toBeVisible()
      //   .withTimeout(10000);

      // // Get another channel with custom receiving capacity
      // await element(by.id('NavigationClose')).tap();
      // await element(by.id('ActivitySavings')).tap();
      // await element(by.id('TransferToSpending')).tap();
      // await element(by.id('N1').withAncestor(by.id('SpendingAmount'))).tap();
      // await element(by.id('N0').withAncestor(by.id('SpendingAmount'))).multiTap(5);
      // await element(by.id('SpendingAmountContinue')).tap();
      // await expect(element(by.text('100 000'))).toBeVisible();
      // await element(by.id('SpendingConfirmAdvanced')).tap();

      // // Receiving Capacity
      // // can continue with min amount
      // await element(by.id('SpendingAdvancedMin')).tap();
      // await expect(element(by.text('2 500'))).toBeVisible();
      // await element(by.id('SpendingAdvancedContinue')).tap();
      // await element(by.id('SpendingConfirmDefault')).tap();
      // await element(by.id('SpendingConfirmAdvanced')).tap();

      // // can continue with default amount
      // await element(by.id('SpendingAdvancedDefault')).tap();
      // await element(by.id('SpendingAdvancedContinue')).tap();
      // await element(by.id('SpendingConfirmDefault')).tap();
      // await element(by.id('SpendingConfirmAdvanced')).tap();

      // // can continue with max amount
      // await element(by.id('SpendingAdvancedMax')).tap();
      // await element(by.id('SpendingAdvancedContinue')).tap();
      // await element(by.id('SpendingConfirmDefault')).tap();
      // await element(by.id('SpendingConfirmAdvanced')).tap();

      // // can set custom amount
      // await element(by.id('N1').withAncestor(by.id('SpendingAdvanced'))).tap();
      // await element(by.id('N5').withAncestor(by.id('SpendingAdvanced'))).tap();
      // await element(by.id('N0').withAncestor(by.id('SpendingAdvanced'))).multiTap(4);
      // await element(by.id('SpendingAdvancedContinue')).tap();
      // await expect(
      //   element(by.text('100 000').withAncestor(by.id('SpendingConfirmChannel')))
      // ).toBeVisible();
      // await expect(
      //   element(by.text('150 000').withAncestor(by.id('SpendingConfirmChannel')))
      // ).toBeVisible();

      // // Swipe to confirm (set x offset to avoid navigating back)
      // await element(by.id('GRAB')).swipe('right', 'slow', 0.95, 0.5, 0.5);
      // await waitFor(element(by.id('LightningSettingUp')))
      //   .toBeVisible()
      //   .withTimeout(10000);

      // // check channel status
      // await element(by.id('NavigationClose')).tap();
      // await sleep(1000);
      // await element(by.id('HeaderMenu')).tap();
      // await element(by.id('DrawerSettings')).tap();
      // await element(by.id('AdvancedSettings')).atIndex(0).tap();
      // await element(by.id('Channels')).tap();
      // await element(by.id('Channel')).atIndex(0).tap();
      // await expect(element(by.text('Processing payment'))).toBeVisible();
      // await expect(element(by.id('MoneyText').withAncestor(by.id('TotalSize')))).toHaveText(
      //   '250 000'
      // );
      // await element(by.id('NavigationClose')).tap();

      // const seed = await getSeed();
      // await waitForBackup();
      // await restoreWallet(seed);

      // // check transfer card
      // await expect(element(by.id('Suggestion-lightningSettingUp'))).toBeVisible();

      // // check activity after restore
      // await element(by.id('HomeScrollView')).scrollTo('bottom', 0);
      // await element(by.id('ActivityShort-1')).tap();
      // await expect(element(by.id('StatusTransfer'))).toBeVisible();

      // // boost the transfer
      // await element(by.id('BoostButton')).tap();
      // await waitFor(element(by.id('CPFPBoost')))
      //   .toBeVisible()
      //   .withTimeout(30000);
      // await element(by.id('GRAB')).swipe('right', 'slow', 0.95, 0.5, 0.5); // Swipe to confirm

      // // check Activity
      // await waitFor(element(by.id('BoostingIcon')))
      //   .toBeVisible()
      //   .withTimeout(30000);

      // // reset & restore again
      // await waitForBackup();
      // await restoreWallet(seed);

      // // check activity after restore
      // await element(by.id('HomeScrollView')).scrollTo('bottom', 0);
      // await expect(element(by.id('BoostingIcon'))).toBeVisible();
      // await element(by.id('ActivityShort-1')).tap();
      // await expect(element(by.id('StatusBoosting'))).toBeVisible();
    }
  );
});
