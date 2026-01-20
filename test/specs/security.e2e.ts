import {
  sleep,
  completeOnboarding,
  elementByIdWithin,
  tap,
  multiTap,
  elementById,
  receiveOnchainFunds,
  enterAddress,
  dragOnElement,
  expectText,
  doNavigationClose,
} from '../helpers/actions';
import initElectrum from '../helpers/electrum';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import { ensureLocalFunds, getExternalAddress } from '../helpers/regtest';

describe('@security - Security And Privacy', () => {
  let electrum: { waitForSync: any; stop: any };

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  after(() => {
    electrum?.stop();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  const MAX_ATTEMPTS_BEFORE_LAST = 7;
  const PIN_LENGTH = 4;

  ciIt('@security_1 - Can setup PIN', async () => {
    // test plan:
    // - set up PIN
    // - login with PIN
    // - change PIN
    // - login with PIN
    // - disable PIN
    // - enter wrong PIN 8 times and reset the app

    // - set up PIN
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('PINCode');
    await sleep(1000);
    await tap('SecureWalletContinue');
    await multiTap('N1', PIN_LENGTH); // enter PIN
    await multiTap('N2', PIN_LENGTH); // retype wrong PIN
    await elementById('WrongPIN').waitForDisplayed(); // WrongPIN warning should appear
    await sleep(1000);
    await multiTap('N1', PIN_LENGTH); // enter PIN
    await tap('SkipButton'); // skip Biometrics for now
    await tap('ToggleBioForPayments');
    await tap('OK');
    await doNavigationClose();

    // - login with PIN
    await launchFreshApp();
    await elementById('PinPad').waitForDisplayed();
    await sleep(1000);
    await multiTap('N1', PIN_LENGTH);
    await elementById('TotalBalance').waitForDisplayed();

    // receive
    await receiveOnchainFunds();

    // send, using PIN
    const coreAddress = await getExternalAddress();
    await enterAddress(coreAddress);
    await tap('N1');
    await tap('N000');
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await expectText('Enter PIN Code');
    await sleep(1000);
    await multiTap('N1', PIN_LENGTH);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    const totalBalance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(totalBalance).not.toHaveText('100 000');

    // change PIN, restart the app and try it
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('PINChange');
    await multiTap('N3', PIN_LENGTH);
    await elementById('AttemptsRemaining').waitForDisplayed();
    await sleep(1000);
    await multiTap('N1', PIN_LENGTH); // correct current PIN
    await multiTap('N2', PIN_LENGTH); // new pin
    await sleep(1000);
    await multiTap('N9', PIN_LENGTH); // wrong new pin in the confirmation
    await elementById('WrongPIN').waitForDisplayed();
    await sleep(1000);
    await multiTap('N2', PIN_LENGTH); // correct new pin in the confirmation
    await tap('OK');

    await launchFreshApp();
    await elementById('PinPad').waitForDisplayed();
    await sleep(1000);
    await multiTap('N2', PIN_LENGTH);
    await elementById('TotalBalance').waitForDisplayed();

    // disable PIN, restart the app, it should not ask for it
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('PINCode');
    await tap('DisablePin');
    await multiTap('N2', PIN_LENGTH);
    await sleep(1000);
    await launchFreshApp();
    await elementById('TotalBalance').waitForDisplayed();

    // enable PIN for last test
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('PINCode');
    await sleep(1000);
    await tap('SecureWalletContinue');
    await multiTap('N1', PIN_LENGTH); // enter PIN
    await multiTap('N1', PIN_LENGTH); // retype PIN
    await tap('SkipButton'); // skip Biometrics for now
    await tap('OK');
    await doNavigationClose();
    await sleep(1000);

    // now lets restart the app and fail to enter correct PIN 8 times
    await launchFreshApp();
    await elementById('PinPad').waitForDisplayed();
    for (let i = 1; i <= MAX_ATTEMPTS_BEFORE_LAST; i++) {
      await multiTap('N9', PIN_LENGTH); // wrong PIN
      if (i < MAX_ATTEMPTS_BEFORE_LAST) {
        await elementById('AttemptsRemaining').waitForDisplayed();
      } else {
        await elementById('LastAttempt').waitForDisplayed();
      }
      await sleep(1000);
    }
    await multiTap('N7', PIN_LENGTH); // wrong PIN on the last attempt
    await sleep(1000);
    // app should reset itself and show onboarding
    await elementById('Continue').waitForDisplayed();
  });
});
