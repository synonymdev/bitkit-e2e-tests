import {
  elementById,
  getReceiveAddress,
  getSeed,
  restoreWallet,
  swipeFullScreen,
  tap,
  typeText,
} from '../helpers/actions';
import { launchFreshApp } from '../helpers/setup';

describe('Onboarding', () => {
  beforeEach(async () => {
    launchFreshApp();
  });

  it('Can pass onboarding correctly', async () => {
    // TOS and PP
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
