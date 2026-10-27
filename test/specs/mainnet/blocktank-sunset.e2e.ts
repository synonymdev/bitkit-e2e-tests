import {
  completeOnboarding,
  doNavigationClose,
  elementById,
  elementByText,
  expectText,
  getReceiveAddress,
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
      // FundTransfer's first Android node is the disabled button; a second node is its empty-wallet overlay.
      await expect(elementById('FundTransfer')).not.toBeEnabled();
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
