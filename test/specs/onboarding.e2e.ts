import {
  elementById,
  elementByText,
  getSeed,
  restoreWallet,
  waitForSetupWalletScreenFinish,
  waitForWalletHome,
} from '../helpers/actions';
import {
  dismissKeyboardAndExpect,
  swipeAndExpect,
  tapAndExpect,
  tapStationaryAndExpect,
  typeAndExpect,
} from '../helpers/outcome';
import { openReceiveOnchainQr } from '../helpers/receive-invoice';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import { openSettings } from '../helpers/navigation';

async function startOnboardingSlides() {
  await tapAndExpect({ id: 'Continue' }, { anyVisible: [{ id: 'GetStarted' }] });
  await tapAndExpect({ id: 'GetStarted' }, { anyVisible: [{ id: 'Slide0' }] });
  await elementById('Slide0').waitForDisplayed();
  await swipeAndExpect('left', { anyVisible: [{ id: 'Slide1' }] });
  await elementById('Slide1').waitForDisplayed();
  await swipeAndExpect('left', { anyVisible: [{ id: 'Slide2' }] });
  await elementById('Slide2').waitForDisplayed();
}

async function createWallet(button: 'NewWallet' | 'CreateNewWallet') {
  await tapStationaryAndExpect({ id: button }, { all: [{ hidden: { id: button } }] });
  await waitForSetupWalletScreenFinish();
  await waitForWalletHome();
}

describe('@onboarding @ios_nightly - Onboarding', () => {
  beforeEach(async () => {
    await reinstallApp();
  });

  ciIt('@onboarding_1 - Can start onboarding', async () => {
    await startOnboardingSlides();
    const walletChoice = { anyVisible: [{ id: 'NewWallet' }] };
    await swipeAndExpect('left', walletChoice);
    await swipeAndExpect('left', walletChoice); // Stay on the final slide.
    await swipeAndExpect('right', { anyVisible: [{ id: 'Slide2' }] });
    await swipeAndExpect('right', { anyVisible: [{ id: 'Slide1' }] });
    await tapStationaryAndExpect({ id: 'SkipButton' }, walletChoice);

    // create new wallet
    await elementById('NewWallet').waitForDisplayed();
    await createWallet('NewWallet');
    await elementByText('TO GET').waitForDisplayed();
  });

  ciIt('@onboarding_2 - Can pass onboarding correctly', async () => {
    await startOnboardingSlides();
    await swipeAndExpect('right', { anyVisible: [{ id: 'Slide1' }] });
    await tapStationaryAndExpect(
      { id: 'SkipButton' },
      { all: [{ visible: { id: 'NewWallet' } }, { visible: { id: 'Passphrase' } }] }
    );

    // create new wallet with passphrase
    const passphrase = 'supersecret';
    await tapStationaryAndExpect({ id: 'Passphrase' }, { anyVisible: [{ id: 'PassphraseInput' }] });
    await typeAndExpect('PassphraseInput', passphrase, {
      all: [{ enabled: { id: 'CreateNewWallet', value: true } }],
    });
    await dismissKeyboardAndExpect();
    await createWallet('CreateNewWallet');

    const seed = await getSeed();

    const address0 = await openReceiveOnchainQr();

    await restoreWallet(seed, { passphrase });

    const address1 = await openReceiveOnchainQr();

    // Go to Address Viewer
    await swipeAndExpect('down', {
      all: [{ visible: { id: 'Receive' } }, { hidden: { id: 'ShowDetails' } }],
    });
    await openSettings('advanced');
    await tapAndExpect(
      { id: 'AddressViewer' },
      { all: [{ visible: { id: 'Address-0' } }, { visible: { id: 'Address-1' } }] }
    );

    const address0Element = await elementById('Address-0');
    const address1Element = await elementById('Address-1');
    const address0Text = (await address0Element.getText()).split(':')[1].trim();
    const address1Text = (await address1Element.getText()).split(':')[1].trim();
    console.info({ address0Text, address1Text });
    // Verify that the addresses match
    await expect(address0).toEqual(address0Text);
    await expect(address1).toEqual(address1Text);
  });
});
