import { select, swipeFullScreen, tap, typeText } from '../helpers/actions';
import { launchFreshApp } from '../helpers/setup';

describe('Onboarding', () => {
  beforeEach(async () => {
    launchFreshApp();
  });

  it('Can pass onboarding correctly', async () => {
    // TOS and PP
    const check = await select('Check1');
    await check.waitForDisplayed({ timeout: 15000 });
    await tap('Check1');
    await tap('Check2');
    await tap('Continue');
    await tap('GetStarted');
    await select('Slide0');
    await swipeFullScreen('left');
    await select('Slide1');
    await swipeFullScreen('left');
    await select('Slide2');
    await swipeFullScreen('left');
    await select('Slide3');
    await swipeFullScreen('right');
    await tap('SkipButton');

    // create new wallet with passphrase
    const passphrase = 'supersecret';
    await tap('Passphrase');
    await typeText('PassphraseInput', passphrase);
    await tap('CreateNewWallet');
  });
});
