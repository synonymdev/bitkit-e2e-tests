import { elementById, getSeed, select, swipeFullScreen, tap, typeText } from '../helpers/actions';
import { launchFreshApp } from '../helpers/setup';

describe('Onboarding', () => {
  beforeEach(async () => {
    launchFreshApp();
  });

  it('Can pass onboarding correctly', async () => {
    // TOS and PP
    await elementById('Check1');
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
    for (let i = 0; i < 180; i++) {
      try {
        await elementById('WalletOnboardingClose').click();
        break;
      } catch {
        if (i === 179) throw new Error('Tapping "WalletOnboardingClose" timeout');
      }
    }

    const seed = await getSeed();

    await tap('Receive');
    const qrCode = await elementById('QRCode');
    await qrCode.waitForDisplayed({ timeout: 5000 });
    const attr = driver.isAndroid ? 'contentDescription' : 'label';
    const address1 = await qrCode.getAttribute(attr);
    console.info({ address1 });

    
  });
});
