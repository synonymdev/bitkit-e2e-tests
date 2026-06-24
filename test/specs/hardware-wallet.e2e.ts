import {
  completeOnboarding,
  doNavigationClose,
  expectSavingsBalance,
  expectSpendingBalance,
  expectTotalBalance,
  receiveOnchainFunds,
} from '../helpers/actions';
import initElectrum from '../helpers/electrum';
import {
  completeHardwareWalletFlow,
  connectHardwareWalletFromSettings,
  ensureTrezorEmulator,
  expectHardwareSuggestion,
  expectHardwareWalletBalance,
  expectHardwareWalletInSettings,
  expectHardwareWalletOnHome,
  expectHardwareWalletReceivedActivity,
  fundHardwareWalletAndAcknowledge,
  openHardwareWalletSettings,
  removeHardwareWalletFromSettings,
  startHardwareWalletFlowFromSuggestion,
  stopTrezorEmulator,
  transferHardwareWalletToSpending,
  type TrezorEmulatorFixture,
} from '../helpers/hardware-wallet';
import { ensureLocalFunds, getBackend } from '../helpers/regtest';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@hardware_wallet - Hardware Wallet', () => {
  const walletLabel = 'E2E Trezor';
  let trezorFixture: TrezorEmulatorFixture;
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;

  before(async function () {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  beforeEach(async () => {
    trezorFixture = ensureTrezorEmulator({ fresh: true });
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(async () => {
    await electrum?.stop();
    stopTrezorEmulator();
  });

  ciIt('@hardware_wallet_1 - Can connect, show, and remove a Trezor emulator wallet', async () => {
    await expectHardwareSuggestion({ visible: true });
    await startHardwareWalletFlowFromSuggestion();
    await completeHardwareWalletFlow(walletLabel);
    await expectHardwareSuggestion({ visible: false });
    await openHardwareWalletSettings();
    await expectHardwareWalletInSettings(walletLabel, { visible: true });
    await expectHardwareWalletOnHome(walletLabel, { visible: true });
    await removeHardwareWalletFromSettings(walletLabel);
    await expectHardwareWalletInSettings(walletLabel, { visible: false });
    await expectHardwareWalletOnHome(walletLabel, { visible: false });
  });

  ciIt('@hardware_wallet_2 - Can receive onchain funds to hardware wallet', async () => {
    const sats = 15_000;

    await connectHardwareWalletFromSettings(walletLabel);
    await fundHardwareWalletAndAcknowledge(trezorFixture, { sats });
    await expectHardwareWalletReceivedActivity(sats);
    await doNavigationClose();
    await expectTotalBalance(sats);
    await expectHardwareWalletBalance(sats);
    await expectSavingsBalance(0);
    await expectSpendingBalance(0);

    await receiveOnchainFunds({ sats, verifyBalances: false });
    await expectTotalBalance(2 * sats);
    await expectHardwareWalletBalance(sats);
    await expectSavingsBalance(sats);
    await expectSpendingBalance(0);
  });

  ciIt('@hardware_wallet_3 - Can transfer hardware wallet funds to spending', async () => {
    const fundingSats = 100_000;
    const transferSats = 20_000;

    await connectHardwareWalletFromSettings(walletLabel);
    await fundHardwareWalletAndAcknowledge(trezorFixture, { sats: fundingSats });
    await expectHardwareWalletBalance(fundingSats);
    await transferHardwareWalletToSpending({
      amountSats: transferSats,
      waitForSync: async () => {
        await electrum?.waitForSync();
      },
    });
    await doNavigationClose();
    await expectHardwareWalletBalance(fundingSats, { condition: 'lt' });
    if (getBackend() === 'regtest') {
      // We only check balance on staging regtest backend, local does not have Blocktank.
      await expectSpendingBalance(0, { condition: 'gt', timeout: 60_000 });
    }
  });
});
