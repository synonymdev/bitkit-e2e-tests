import BitcoinJsonRpc from 'bitcoin-json-rpc';

import {
  sleep,
  completeOnboarding,
  elementByIdWithin,
  tap,
  multiTap,
  elementById,
} from '../helpers/actions';
import { bitcoinURL } from '../helpers/constants';
import initElectrum from '../helpers/electrum';
import { launchFreshApp, reinstallApp } from '../helpers/setup';

async function waitForPinScreen() {
  for (let i = 0; i < 60; i++) {
    try {
      await sleep(1000);
      const c = await elementByIdWithin('PinPad', 'NRemove');
      c.waitForDisplayed();
      c.click();
      break;
    } catch (e) {
      continue;
    }
  }
}

describe('@security - Security And Privacy', () => {
  let electrum: { waitForSync: any; stop: any };
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
    let balance = await rpc.getBalance();
    const address = await rpc.getNewAddress();

    while (balance < 10) {
      await rpc.generateToAddress(10, address);
      balance = await rpc.getBalance();
    }

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

  it('@security_1 - Can setup PIN', async () => {
    // test plan:
    // - set up PIN
    // - login with PIN
    // - change PIN
    // - login with PIN
    // - disable PIN
    // - enter wrong PIN 10 times and reset the app

    // - set up PIN
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('SecuritySettings');
    await tap('PINCode');
    await tap('SecureWallet-button-continue');
    await multiTap('N1', 4); // enter PIN
    await multiTap('N2', 4); // retype wrong PIN
    await elementById('WrongPIN').waitForDisplayed(); // WrongPIN warning should appear
    await multiTap('N1', 4); // enter PIN
    await tap('SkipButton'); // skip Biometrics for now
    await tap('ToggleBioForPayments');
    await tap('OK');
    await tap('NavigationClose');

    // - login with PIN
    await launchFreshApp({tryHandleAlert: false});
    await elementById('PinPad').waitForDisplayed();
    await multiTap('N1', 4);

    // await sleep(1000);
    // await device.matchFace();
    // await sleep(1000);

    // await element(by.id('ToggleBioForPayments')).tap();
    // await element(by.id('OK')).tap();
    // await sleep(1000);
    // // restart the app and login with Faceid
    // await device.launchApp({
    // 	newInstance: true,
    // 	launchArgs: { detoxEnableSynchronization: 0 }, // disable detox synchronization, otherwise it will hang on faceid
    // });
    // await waitFor(element(by.id('Biometrics')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);
    // await sleep(100);
    // await device.matchFace();
    // await sleep(100);
    // await device.enableSynchronization();
    // await sleep(1000);
    // // app unlocked now
    // await expect(element(by.id('TotalBalance'))).toBeVisible();
    // await sleep(1000);

    // // TODO: restart the app and login with PIN
    // // currently not possibe because of Retry faceid system dialog
    // // await device.launchApp({
    // // 	newInstance: true,
    // // 	launchArgs: { detoxEnableSynchronization: 0 }, // disable detox synchronization, otherwise it will hang on faceid
    // // });
    // // await sleep(1000);
    // // await waitFor(element(by.id('Biometrics')))
    // // 	.toBeVisible()
    // // 	.withTimeout(10000);
    // // await device.unmatchFace();
    // // await device.enableSynchronization();
    // // await sleep(1000);
    // // await element(by.label('Cancel')).atIndex(0).tap();

    // // receive
    // await element(by.id('Receive')).tap();
    // await sleep(100);
    // // get address from qrcode
    // await waitFor(element(by.id('QRCode'))).toBeVisible();
    // await sleep(100); // wait for qr code to render
    // let { label: wAddress } = await element(by.id('QRCode')).getAttributes();
    // wAddress = wAddress.replace('bitcoin:', '');
    // await rpc.sendToAddress(wAddress, '1');
    // await rpc.generateToAddress(1, await rpc.getNewAddress());
    // await electrum?.waitForSync();
    // await waitFor(element(by.id('ReceivedTransaction')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);
    // await element(by.id('ReceivedTransaction')).swipe('down'); // close Receive screen

    // // send, using FaceID
    // const coreAddress = await rpc.getNewAddress();
    // await element(by.id('Send')).tap();
    // await element(by.id('RecipientManual')).tap();
    // await element(by.id('RecipientInput')).replaceText(coreAddress);
    // await element(by.id('RecipientInput')).tapReturnKey();
    // await sleep(1000); // wait for keyboard to hide
    // await element(by.id('AddressContinue')).tap();
    // await element(by.id('N1').withAncestor(by.id('SendAmountNumberPad'))).tap();
    // await element(
    // 	by.id('N000').withAncestor(by.id('SendAmountNumberPad')),
    // ).multiTap(2);
    // await element(by.id('ContinueAmount')).tap();
    // await sleep(100);
    // await device.disableSynchronization();
    // await sleep(100);
    // await element(by.id('GRAB')).swipe('right'); // Swipe to confirm
    // await sleep(100);
    // await device.matchFace();
    // await sleep(100);
    // await device.enableSynchronization();
    // await sleep(1000);
    // await waitFor(element(by.id('SendSuccess')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);
    // await element(by.id('Close')).tap();

    // // test PIN on idle and disable it after
    // await element(by.id('HeaderMenu')).tap();
    // await element(by.id('DrawerSettings')).tap();
    // await element(by.id('SecuritySettings')).tap();

    // // FIXME: this fails too often
    // // await element(by.id('EnablePinOnIdle')).tap();
    // // await device.matchFace();
    // // await waitFor(element(by.id('Biometrics')))
    // // 	.toBeVisible()
    // // 	.withTimeout(100000);
    // // await device.matchFace();
    // // await sleep(1000);
    // // await element(by.id('EnablePinOnIdle')).tap();
    // // await device.matchFace();
    // // await sleep(1000);

    // // disable FaceID, change PIN, restart the app and try it
    // await element(by.id('UseBiometryInstead')).tap();
    // await device.matchFace();
    // await sleep(1000);
    // await element(by.id('PINChange')).tap();
    // await element(by.id('N3').withAncestor(by.id('ChangePIN'))).multiTap(4);
    // await expect(element(by.id('AttemptsRemaining'))).toBeVisible();
    // await element(by.id('N1').withAncestor(by.id('ChangePIN'))).multiTap(4);
    // await element(by.id('N2').withAncestor(by.id('ChangePIN2'))).multiTap(4);
    // await element(by.id('N9').withAncestor(by.id('ChangePIN2'))).multiTap(4);
    // await expect(element(by.id('WrongPIN'))).toBeVisible();
    // await element(by.id('N2').withAncestor(by.id('ChangePIN2'))).multiTap(4);
    // await element(by.id('OK')).tap();

    // await device.launchApp({ newInstance: true });
    // await waitFor(
    // 	element(by.id('N2').withAncestor(by.id('PinPad'))),
    // ).toBeVisible();
    // await waitForPinScreen();
    // await element(by.id('N2').withAncestor(by.id('PinPad'))).multiTap(4);
    // await waitFor(element(by.id('TotalBalance')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);

    // // send, using PIN
    // await element(by.id('Send')).tap();
    // await element(by.id('RecipientManual')).tap();
    // await element(by.id('RecipientInput')).replaceText(coreAddress);
    // await element(by.id('RecipientInput')).tapReturnKey();
    // await sleep(1000); // wait for keyboard to hide
    // await element(by.id('AddressContinue')).tap();
    // await element(by.id('N1').withAncestor(by.id('SendAmountNumberPad'))).tap();
    // await element(
    // 	by.id('N000').withAncestor(by.id('SendAmountNumberPad')),
    // ).multiTap(2);
    // await element(by.id('ContinueAmount')).tap();
    // await element(by.id('GRAB')).swipe('right'); // Swipe to confirm
    // await element(by.id('N2')).multiTap(4);
    // await waitFor(element(by.id('SendSuccess')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);
    // await element(by.id('Close')).tap();

    // // disable PIN, restart the app, it should not ask for it
    // await element(by.id('HeaderMenu')).tap();
    // await element(by.id('DrawerSettings')).tap();
    // await element(by.id('SecuritySettings')).tap();
    // await element(by.id('PINCode')).tap();
    // await element(by.id('DisablePin')).tap();
    // await element(by.id('N2').withAncestor(by.id('PinPad'))).multiTap(4);
    // await sleep(1000);
    // await device.launchApp({ newInstance: true });
    // await waitFor(element(by.id('TotalBalance')))
    // 	.toBeVisible()
    // 	.withTimeout(10000);

    // // enable PIN for last test
    // await element(by.id('HeaderMenu')).tap();
    // await element(by.id('DrawerSettings')).tap();
    // await element(by.id('SecuritySettings')).tap();
    // await element(by.id('PINCode')).tap();
    // await element(by.id('SecureWallet-button-continue')).tap();
    // await element(by.id('N1')).multiTap(4); // enter PIN
    // await element(by.id('N1')).multiTap(4); // enter PIN
    // await element(by.id('ToggleBiometrics')).tap();
    // await element(by.id('ContinueButton')).tap();
    // await sleep(1000);

    // // now lets restart the app and fail to enter correct PIN 8 times
    // await device.launchApp({ newInstance: true });
    // await waitFor(
    // 	element(by.id('N2').withAncestor(by.id('PinPad'))),
    // ).toBeVisible();
    // await waitForPinScreen();
    // await element(by.id('N2').withAncestor(by.id('PinPad'))).multiTap(4);
    // await waitFor(element(by.id('AttemptsRemaining'))).toBeVisible();
    // await element(by.id('AttemptsRemaining')).tap();
    // await element(by.id('ForgotPIN')).swipe('down'); // close ForgotPIN screen
    // for (let i = 0; i < 6; i++) {
    // 	await element(by.id('N2').withAncestor(by.id('PinPad'))).multiTap(4); // repeat 6 times
    // }
    // await waitFor(element(by.id('LastAttempt'))).toBeVisible();
    // await element(by.id('N2').withAncestor(by.id('PinPad'))).multiTap(4);
    // await sleep(1000);

    // // app should show Licence agreement
    // await device.launchApp({ newInstance: true });
    // await waitFor(element(by.id('Check1'))).toBeVisible();
  });
});
