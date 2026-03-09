import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  acknowledgeExternalSuccess,
  assertAddressMatchesType,
  completeOnboarding,
  doNavigationClose,
  dragOnElement,
  elementById,
  elementByIdWithin,
  enterAddress,
  expectSavingsBalance,
  expectSpendingBalance,
  expectTotalBalance,
  expectTextWithin,
  getTextUnder,
  getReceiveAddress,
  handleOver50PercentAlert,
  switchAndFundEachAddressType,
  swipeFullScreen,
  tap,
  transferSavingsToSpending,
  transferSpendingToSavings,
  type addressTypePreference,
  getSpendingBalance,
  getSavingsBalance,
  getTotalBalance,
  attemptRefreshOnHomeScreen,
  expectText,
  formatSats,
  elementByText,
  sleep,
  waitForToast,
  enterAmount,
  dismissQuickPayIntro,
  dismissBackgroundPaymentsTimedSheet,
  getAmountUnder,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import {
  checkChannelStatus,
  connectToLND,
  getLDKNodeID,
  setupLND,
  waitForPeerConnection,
} from '../helpers/lnd';
import { lndConfig } from '../helpers/constants';
import {
  ensureLocalFunds,
  getBitcoinRpc,
  getExternalAddress,
  mineBlocks,
} from '../helpers/regtest';

describe('@multi_address - Multi address', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(async () => {
    await electrum?.stop();
  });

  ciIt('@multi_address_1 - Receive to each address type and send max combined', async () => {
    const addressTypes: addressTypePreference[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
    const satsPerAddressType = 100_000;
    const { totalFundedSats } = await switchAndFundEachAddressType({
      addressTypes,
      satsPerAddressType,
      waitForSync: async () => {
        await electrum?.waitForSync();
      },
    });

    const totalBalance = await getTotalBalance();
    const savingsBalance = await getSavingsBalance();
    const spendingBalance = await getSpendingBalance();
    await expect(savingsBalance).toEqual(totalFundedSats);
    await expect(spendingBalance).toEqual(0);
    await expect(totalBalance).toEqual(totalFundedSats);

    const coreAddress = await getExternalAddress();
    await enterAddress(coreAddress);
    await tap('AvailableAmount');
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await handleOver50PercentAlert();
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await mineBlocks(1);
    await electrum?.waitForSync();

    await expectTotalBalance(0);
    await expectSavingsBalance(0);
    await expectSpendingBalance(0);

    const totalBalanceAfter = await getTotalBalance();
    const savingsBalanceAfter = await getSavingsBalance();
    const spendingBalanceAfter = await getSpendingBalance();
    await expect(totalBalanceAfter).toEqual(0);
    await expect(savingsBalanceAfter).toEqual(0);
    await expect(spendingBalanceAfter).toEqual(0);
  });

  ciIt(
    '@multi_address_2, @regtest_only - Receive to each address type, transfer all to spending, close channel to taproot',
    async () => {
      const addressTypes: addressTypePreference[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
      // const addressTypes: addressTypePreference[] = ['p2tr'];
      const satsPerAddressType = 25_000;
      await switchAndFundEachAddressType({
        addressTypes,
        satsPerAddressType,
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      // Last funded type is Taproot, keep it as primary for channel open/close.
      const taprootAddressBeforeClose = await getReceiveAddress();
      assertAddressMatchesType(taprootAddressBeforeClose, 'p2tr');
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      await mineBlocks(1);
      await electrum?.waitForSync();

      await transferSavingsToSpending({
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });
      await expectSpendingBalance(0, { condition: 'gt' });
      await expectSavingsBalance(0);

      if (driver.isAndroid) {
        // pull to refresh due to:
        // https://github.com/synonymdev/bitkit-android/issues/810
        await attemptRefreshOnHomeScreen();
        await attemptRefreshOnHomeScreen();
      }

      await transferSpendingToSavings();

      await mineBlocks(1);
      await electrum?.waitForSync();
      await expectSavingsBalance(0, { condition: 'gt' });
      await expectSpendingBalance(0);
      const savingsBalanceAfter = await getSavingsBalance();
      await expectTotalBalance(savingsBalanceAfter);

      const taprootAddressAfterClose = await getReceiveAddress();
      assertAddressMatchesType(taprootAddressAfterClose, 'p2tr');
      await swipeFullScreen('down');

      // check in address viewer all savings are in taproot address
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await sleep(1000);
      await tap('AdvancedSettings');
      await sleep(1000);
      await tap('AddressViewer');
      await sleep(1000);
      await elementByText('Taproot').click();
      await expectText(formatSats(savingsBalanceAfter));
    }
  );

  ciIt(
    '@multi_address_3 - Receive to each type, send almost max, verify change to primary, then RBF',
    async () => {
      const addressTypes: addressTypePreference[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
      const satsPerAddressType = 10_000;
      const sendAmountSats = 36_000;
      await switchAndFundEachAddressType({
        addressTypes,
        satsPerAddressType,
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      const coreAddress = await getExternalAddress();
      await enterAddress(coreAddress);
      await enterAmount(sendAmountSats);
      await expectText(formatSats(sendAmountSats));
      await tap('ContinueAmount');
      await dragOnElement('GRAB', 'right', 0.95);
      await handleOver50PercentAlert().catch(async () => {});
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');

      await sleep(1000);
      await tap('ActivityShort-0');
      await expectTextWithin('ActivityAmount', formatSats(sendAmountSats));
      const oldFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
      await tap('ActivityTxDetails');
      const oldTxId = await getTextUnder('TXID');
      await tap('NavigationBack');

      await tap('BoostButton');
      await elementById('RBFBoost').waitForDisplayed();
      await tap('CustomFeeButton');
      await tap('Plus');
      await tap('Minus');
      await tap('RecommendedFeeButton');
      await dragOnElement('GRAB', 'right', 0.95);
      await waitForToast('BoostSuccessToast');

      await tap('ActivityShort-0');
      await expectTextWithin('ActivityAmount', formatSats(sendAmountSats));
      const newFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
      await tap('ActivityTxDetails');
      const newTxId = await getTextUnder('TXID');
      await expect(Number(oldFee.replace(' ', '')) < Number(newFee.replace(' ', ''))).toBe(true);
      await expect(oldTxId !== newTxId).toBe(true);
      await elementById('RBFBoosted').waitForDisplayed();
      await doNavigationClose();

      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      await mineBlocks(1);
      await electrum?.waitForSync();
      const remainingTotal = await getTotalBalance();
      await expect(remainingTotal).toBeGreaterThan(0);

      // verify change is in taproot address
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await sleep(1000);
      await tap('AdvancedSettings');
      await sleep(1000);
      await tap('AddressViewer');
      await sleep(1000);
      await elementByText('Taproot').click();
      await elementByText('Change Addresses').click();
      await expectText(formatSats(remainingTotal));
    }
  );

  ciIt(
    '@multi_address_4 - Receive to each type, open external channel with max, keep Legacy untouched',
    async () => {
      const rpc = getBitcoinRpc();
      const addressTypes: addressTypePreference[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
      const satsPerAddressType = 25_000;
      await switchAndFundEachAddressType({
        addressTypes,
        satsPerAddressType,
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      const { lnd, lndNodeID } = await setupLND(rpc, lndConfig);
      await electrum?.waitForSync();
      const ldkNodeId = await getLDKNodeID();
      await connectToLND(lndNodeID, { navigationClose: false });
      await waitForPeerConnection(lnd, ldkNodeId);

      await tap('ExternalAmountMax');
      await sleep(1000);
      const channelSize = await getAmountUnder('ExternalAmountNumberField');
      await tap('ExternalAmountContinue');
      await sleep(1000);
      await dragOnElement('GRAB', 'right', 0.95);
      await acknowledgeExternalSuccess();

      await mineBlocks(6);
      await electrum?.waitForSync();
      await waitForToast('SpendingBalanceReadyToast');
      if (driver.isIOS) {
        await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
        await dismissQuickPayIntro({ triggerTimedSheet: true });
      } else {
        await dismissQuickPayIntro({ triggerTimedSheet: true });
      }
      await checkChannelStatus({ size: formatSats(channelSize) });

      // savings has all legacy funds
      const savingsBalance = await getSavingsBalance();
      await expect(savingsBalance).toEqual(satsPerAddressType);

      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await sleep(1000);
      await tap('AdvancedSettings');
      await sleep(1000);
      await tap('AddressViewer');
      await sleep(1000);
      await elementByText('Legacy').click();
      await expectText(formatSats(satsPerAddressType));
      await doNavigationClose();
    }
  );
});
