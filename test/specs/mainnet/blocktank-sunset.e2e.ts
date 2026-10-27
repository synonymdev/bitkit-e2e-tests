import {
  completeOnboarding,
  doNavigationClose,
  elementById,
  elementByText,
  expectText,
  getReceiveAddress,
  sleep,
  swipeFullScreen,
  tap,
} from '../../helpers/actions';
import { getBackend } from '../../helpers/constants';
import { waitForMainnetWalletReady } from '../../helpers/mainnet';
import { openSettings } from '../../helpers/navigation';
import { reinstallApp } from '../../helpers/setup';
import { ciIt } from '../../helpers/suite';

const sunsetUi = process.env.BLOCKTANK_SUNSET_UI ?? 'legacy';
const blockedText =
  'Bitkit does not currently provide Lightning services in your country, but you can still connect to other nodes directly.';
const manualSetupText =
  'Automatic transfers to your spending balance are no longer available. Use your own node, or set up a connection with another provider.';

async function expectManualSetup(): Promise<void> {
  for (const id of ['NodeIdInput', 'HostInput', 'PortInput']) {
    await elementById(id).waitForDisplayed();
  }
}

async function expectTransferTapToRemainUnavailable(): Promise<void> {
  const transfer = elementById('FundTransfer');
  const [location, size] = await Promise.all([transfer.getLocation(), transfer.getSize()]);
  // A physical tap reaches the empty-wallet overlay as well as the disabled button beneath it.
  // The inert overlay has no disabled semantics, so isEnabled alone cannot detect its regression.
  await driver.performActions([
    {
      type: 'pointer',
      id: 'sunset-finger',
      parameters: { pointerType: 'touch' },
      actions: [
        {
          type: 'pointerMove',
          duration: 0,
          x: Math.round(location.x + size.width / 2),
          y: Math.round(location.y + size.height / 2),
        },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  if (sunsetUi === 'legacy') {
    // v3.0.1 intentionally intercepts an empty wallet's tap with a no-funds dialog,
    // even while geoblocked. Its overlay shares FundTransfer and reports enabled.
    await expectText('No Available Funds');
    await tap('DialogCancel');
  } else {
    await sleep(1000);
  }
  await expectText('No Available Funds', { visible: false });
  await elementById('SpendingAmountContinue').waitForDisplayed({ reverse: true });
  await elementById('ReceiveScreen').waitForDisplayed({ reverse: true });
  await elementById('FundManual').waitForDisplayed();
}

async function expectUnavailable(): Promise<void> {
  await expectText(sunsetUi === 'legacy' ? blockedText : manualSetupText);
  if (sunsetUi === 'manual') {
    await elementById('TransferUnavailableContinue').waitForDisplayed();
    await elementById('TransferUnavailableLearnMore').waitForDisplayed();
  }
  // A wallet with no channels must not reach a CJIT quote or invoice confirmation.
  await elementById('ReceiveAmountMin').waitForDisplayed({ reverse: true });
}

describe('@blocktank_sunset_mainnet - Blocktank sunset', () => {
  before(() => {
    if (!driver.isAndroid || getBackend() !== 'mainnet') {
      throw new Error(
        'Blocktank sunset smoke requires an Android mainnet build with geocheck enabled'
      );
    }
    if (!['legacy', 'manual'].includes(sunsetUi)) {
      throw new Error(`Invalid BLOCKTANK_SUNSET_UI: ${sunsetUi}; expected legacy or manual`);
    }
  });

  beforeEach(async () => {
    // Every case owns an empty wallet; retries never depend on a previous case's navigation.
    await reinstallApp();
    await completeOnboarding();
    await waitForMainnetWalletReady({ logPrefix: 'Sunset', includeLightningStatus: false });
  });

  ciIt(
    '@blocktank_sunset_1 - Automatic funding is disabled and manual setup remains available',
    async () => {
      await openSettings('advanced');
      await tap('Channels');
      await tap('add_connection_button');
      await expectText(sunsetUi === 'legacy' ? blockedText : manualSetupText);
      // Duplicate FundTransfer tags do not guarantee which semantics node is returned.
      // Check the physical tap's result rather than assuming isEnabled means a transfer is available.
      await expectTransferTapToRemainUnavailable();
      await expect(elementById('FundReceive')).not.toBeEnabled();
      if (sunsetUi === 'manual') {
        await expect(elementById('FundHardware')).not.toBeEnabled();
        await elementById('FundLearnMore').waitForDisplayed();
      }
      await expect(elementById('FundManual')).toBeEnabled();
      await tap('FundManual');
      await expectManualSetup();
      await doNavigationClose();
      await elementById('TotalBalance-primary').waitForDisplayed();
    }
  );

  ciIt(
    '@blocktank_sunset_2 - Unavailable Lightning receive can be dismissed and reopened',
    async () => {
      await tap('Receive');
      await tap('Tab-spending');
      await tap('ShowDetails');
      await expectUnavailable();
      await swipeFullScreen('down');
      await elementById('Receive').waitForDisplayed();
      await tap('Receive');
      await tap('Tab-spending');
      await tap('ShowDetails');
      await expectUnavailable();

      if (sunsetUi === 'manual') {
        await tap('TransferUnavailableContinue');
      } else {
        await elementByText('Advanced Setup').click();
      }
      await expectManualSetup();
      await doNavigationClose();
      await elementById('TotalBalance-primary').waitForDisplayed();
    }
  );

  ciIt(
    '@blocktank_sunset_3 - On-chain receiving remains available without a Lightning channel',
    async () => {
      const address = await getReceiveAddress();
      if (!address.startsWith('bc1')) {
        throw new Error(`Expected a mainnet native SegWit receiving address, got ${address}`);
      }
      await swipeFullScreen('down');
      await elementById('TotalBalance-primary').waitForDisplayed();
    }
  );
});
