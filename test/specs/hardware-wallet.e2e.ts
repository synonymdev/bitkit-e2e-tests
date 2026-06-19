import { completeOnboarding } from '../helpers/actions';
import {
  completeHardwareWalletFlow,
  ensureTrezorEmulator,
  expectHardwareSuggestion,
  expectHardwareWalletInSettings,
  expectHardwareWalletOnHome,
  openHardwareWalletSettings,
  removeHardwareWalletFromSettings,
  startHardwareWalletFlowFromSuggestion,
} from '../helpers/hardware-wallet';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@hardware_wallet - Hardware Wallet', () => {
  const walletLabel = 'E2E Trezor';

  before(function () {
    if (!driver.isAndroid) {
      this.skip();
    }
    ensureTrezorEmulator();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
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
});
