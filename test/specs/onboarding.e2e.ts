import {
  acceptAppNotificationAlert,
  confirmInputOnKeyboard,
  elementById,
  elementByText,
  getReceiveAddress,
  getSeed,
  restoreWallet,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
  waitForSetupWalletScreenFinish,
} from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@onboarding - Onboarding', () => {
  beforeEach(async () => {
    await reinstallApp();
  });

  ciIt('@onboarding_1 - Can start onboarding', async () => {
    // TOS and PP
    await elementById('Continue').waitForDisplayed();
    await sleep(1000); // Wait for the app to settle
    await tap('Continue');
    await tap('GetStarted');
    await elementById('Slide0').waitForDisplayed();
    await swipeFullScreen('left');
    await elementById('Slide1').waitForDisplayed();
    await swipeFullScreen('left');
    await elementById('Slide2').waitForDisplayed();
    await swipeFullScreen('left');
    await swipeFullScreen('left');
    await swipeFullScreen('right');
    await swipeFullScreen('right');
    await tap('SkipButton');

    // create new wallet
    await elementById('NewWallet').waitForDisplayed();
    await sleep(1000); // Wait for the app to settle
    await tap('NewWallet');
    await waitForSetupWalletScreenFinish();

    await acceptAppNotificationAlert();

    await elementByText('TO GET').waitForDisplayed();
  });

  ciIt('@onboarding_2 - Can pass onboarding correctly', async () => {
    // TOS and PP
    await elementById('Continue').waitForDisplayed();
    await sleep(1000); // Wait for the app to settle
    await tap('Continue');
    await tap('GetStarted');
    await elementById('Slide0').waitForDisplayed();
    await swipeFullScreen('left');
    await elementById('Slide1').waitForDisplayed();
    await swipeFullScreen('left');
    await elementById('Slide2').waitForDisplayed();
    await swipeFullScreen('right');
    await tap('SkipButton');

    // create new wallet with passphrase
    const passphrase = 'supersecret';
    await tap('Passphrase');
    await typeText('PassphraseInput', passphrase);
    await confirmInputOnKeyboard();
    await tap('CreateNewWallet');
    await waitForSetupWalletScreenFinish();

    await acceptAppNotificationAlert();

    // Wait for wallet to be created
    for (let i = 1; i <= 3; i++) {
      try {
        await tap('WalletOnboardingClose');
        break;
      } catch {
        if (i === 3) throw new Error('Tapping "WalletOnboardingClose" timeout');
      }
    }

    const seed = await getSeed();

    const address0 = await getReceiveAddress();

    await restoreWallet(seed, { passphrase });

    const address1 = await getReceiveAddress();

    // Go to Address Viewer
    await swipeFullScreen('down');
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('AdvancedSettings');
    await tap('AddressViewer');

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
