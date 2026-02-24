import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  assertAddressMatchesType,
  completeOnboarding,
  dragOnElement,
  elementById,
  elementByIdWithin,
  enterAddress,
  getReceiveAddress,
  handleOver50PercentAlert,
  sleep,
  switchAndFundEachAddressType,
  swipeFullScreen,
  tap,
  transferSavingsToSpending,
  transferSpendingToSavingsAndCloseChannel,
  type addressTypePreference,
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
    const expectedTotal = totalFundedSats.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).toHaveText(expectedTotal);

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

    const totalBalanceAfter = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalanceAfter).toHaveText('0');
  });

  ciIt(
    '@multi_address_2 - Receive to each address type, transfer all to spending, close channel to taproot',
    async () => {
      const addressTypes: addressTypePreference[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
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

      await transferSavingsToSpending({
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      // Wait for spending balance to become available before cooperative close.
      let spendingReady = false;
      for (let i = 0; i < 12; i++) {
        const spendingBalanceText = await (
          await elementByIdWithin('ActivitySpending', 'MoneyText')
        ).getText();
        const spendingSats = Number(spendingBalanceText.replace(/[^\d]/g, ''));
        if (spendingSats > 0) {
          spendingReady = true;
          break;
        }
        await mineBlocks(1);
        await electrum?.waitForSync();
        await sleep(1200);
      }
      expect(spendingReady).toBe(true);

      await transferSpendingToSavingsAndCloseChannel({
        waitForSync: async () => {
          await electrum?.waitForSync();
        },
      });

      const totalBalanceAfterClose = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
      await expect(totalBalanceAfterClose).not.toHaveText('0');

      const taprootAddressAfterClose = await getReceiveAddress();
      assertAddressMatchesType(taprootAddressAfterClose, 'p2tr');
      await swipeFullScreen('down');
    }
  );
});
