import {
  acceptAppNotificationAlert,
  elementById,
  elementByText,
  getReceiveAddress,
  getSeed,
  restoreWallet,
  swipeFullScreen,
  tap,
  typeText,
} from '../helpers/actions';
import { launchFreshApp, reinstallApp } from '../helpers/setup';

describe('Onboarding suite', () => {
  before(async () => {
    await reinstallApp();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  it('Can start onboarding', async () => {
    // TOS and PP
    await elementById('Check1').waitForDisplayed();
    await tap('Check1');
    await tap('Check2');
    await tap('Continue');
    await tap('GetStarted');
    await elementById('Slide0');
    await swipeFullScreen('left');
    await elementById('Slide1');
    await swipeFullScreen('left');
    await elementById('Slide2');
    await swipeFullScreen('left');
    await elementById('Slide3');
    await swipeFullScreen('right');
    await tap('SkipButton');

    // create new wallet with passphrase
    const passphrase = 'supersecret';
    await tap('Passphrase');
    await typeText('PassphraseInput', passphrase);
    await tap('CreateNewWallet');

    await acceptAppNotificationAlert();
    await elementByText('TO GET\nSTARTED\nSEND\nBITCOIN\nTO YOUR\nWALLET').waitForDisplayed();
  });

  it('Can pass onboarding correctly', async () => {
    // TOS and PP
    await elementById('Check1').waitForDisplayed();
    await tap('Check1');
    await tap('Check2');
    await tap('Continue');
    await tap('GetStarted');
    await elementById('Slide0');
    await swipeFullScreen('left');
    await elementById('Slide1');
    await swipeFullScreen('left');
    await elementById('Slide2');
    await swipeFullScreen('left');
    await elementById('Slide3');
    await swipeFullScreen('right');
    await tap('SkipButton');

    // create new wallet with passphrase
    const passphrase = 'supersecret';
    await tap('Passphrase');
    await typeText('PassphraseInput', passphrase);
    await tap('CreateNewWallet');

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

    const address1 = await getReceiveAddress();

    await restoreWallet(seed, passphrase);

    const address2 = await getReceiveAddress();

    expect(address1).toEqual(address2);
  });
});
