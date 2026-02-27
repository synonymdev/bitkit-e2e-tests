import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  assertAddressMatchesType,
  completeOnboarding,
  dragOnElement,
  elementById,
  enterAddress,
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
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import { ensureLocalFunds, getExternalAddress, mineBlocks } from '../helpers/regtest';

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

    const totalBalanceAfter = await getTotalBalance();
    const savingsBalanceAfter = await getSavingsBalance();
    const spendingBalanceAfter = await getSpendingBalance();
    await expect(totalBalanceAfter).toEqual(0);
    await expect(savingsBalanceAfter).toEqual(0);
    await expect(spendingBalanceAfter).toEqual(0);
  });

  ciIt(
    '@multi_address_2 - Receive to each address type, transfer all to spending, close channel to taproot',
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
      await expect(await getSpendingBalance()).toBeGreaterThan(0);
      await expect(await getSavingsBalance()).toEqual(0);

      if (driver.isAndroid) {
        // pull to refresh due to:
        // https://github.com/synonymdev/bitkit-android/issues/810
        await attemptRefreshOnHomeScreen();
        await attemptRefreshOnHomeScreen();
      }

      await transferSpendingToSavings();

      await mineBlocks(1);
      await electrum?.waitForSync();
      const totalBalanceAfter = await getTotalBalance();
      const spendingBalanceAfter = await getSpendingBalance();
      const savingsBalanceAfter = await getSavingsBalance();
      await expect(totalBalanceAfter).toEqual(savingsBalanceAfter + spendingBalanceAfter);
      await expect(spendingBalanceAfter).toEqual(0);
      await expect(savingsBalanceAfter).toBeGreaterThan(0);

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
});
