import BitcoinJsonRpc from 'bitcoin-json-rpc';
import LNURL from 'lnurl';

import initElectrum from '../helpers/electrum';
import { bitcoinURL, lndConfig } from '../helpers/constants';
import {
  sleep,
  tap,
  elementById,
  elementByIdWithin,
  typeText,
  confirmInputOnKeyboard,
  swipeFullScreen,
  dragOnElement,
  completeOnboarding,
  multiTap,
  receiveOnchainFunds,
  expectTextWithin,
  enterAddress,
  expectText,
  dismissQuickPayIntro,
  doNavigationClose,
  waitForToast,
  dismissBackgroundPaymentsTimedSheet,
  enterAddressViaScanPrompt,
} from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import {
  getLDKNodeID,
  waitForPeerConnection,
  waitForActiveChannel,
  setupLND,
} from '../helpers/lnd';

function waitForEvent(lnurlServer: any, name: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  let resolveFn: any;
  let rejectFn: any;
  return new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
    lnurlServer.once(`${name}:processed`, resolve);
    lnurlServer.once(`${name}:failed`, reject);
    timer = setTimeout(() => reject(new Error('waitForEvent timeout')), 30_000);
  }).finally(() => {
    if (timer) clearTimeout(timer);
    if (lnurlServer?.removeListener) {
      lnurlServer.removeListener(`${name}:processed`, resolveFn);
      lnurlServer.removeListener(`${name}:failed`, rejectFn);
    }
  });
}

describe('@lnurl - LNURL', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;
  let lnurlServer: any;
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
    // Ensure we have at least 10 BTC on regtest
    let balance = await rpc.getBalance();
    const address = await rpc.getNewAddress();
    while (balance < 10) {
      await rpc.generateToAddress(10, address);
      balance = await rpc.getBalance();
    }

    electrum = await initElectrum();

    // Start local LNURL server backed by LND REST
    lnurlServer = LNURL.createServer({
      host: 'localhost',
      port: 30001,
      lightning: {
        backend: 'lnd',
        config: {
          hostname: '127.0.0.1:8080',
          macaroon: lndConfig.macaroonPath,
          cert: lndConfig.tls,
        },
      },
      store: { config: { noWarning: true } },
    });
  });

  after(async () => {
    await electrum?.stop();
    try {
      lnurlServer?.app?.webServer?.close?.();
    } catch {
      console.warn('Failed to close LNURL server');
    }
    await sleep(1000);
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  ciIt(
    '@lnurl_1 - Can process lnurl-channel, lnurl-pay, lnurl-withdraw, and lnurl-auth',
    async () => {
      await receiveOnchainFunds(rpc, { sats: 1000 });

      // Get LDK node id from the UI
      const ldkNodeID = await getLDKNodeID();
      await doNavigationClose();
      // send funds to LND node and open a channel
      const lnd = (await setupLND(rpc, lndConfig)).lnd;
      await electrum?.waitForSync();

      // lnurl-channel
      const channelReq = await lnurlServer.generateNewUrl('channelRequest', {
        localAmt: 100_001,
        pushAmt: 20_001,
        private: 1,
      });
      console.log('channelReq', channelReq);

      await enterAddressViaScanPrompt(channelReq.encoded);

      const channelRequestPromise = waitForEvent(lnurlServer, 'channelRequest:action');
      await elementById('ConnectButton').waitForDisplayed();
      // await sleep(100000);
      await tap('ConnectButton');
      await channelRequestPromise;

      // Wait for peer connection
      await waitForPeerConnection(lnd as any, ldkNodeID);

      // Confirm channel by mining and syncing
      await rpc.generateToAddress(6, await rpc.getNewAddress());
      await electrum?.waitForSync();

      // Wait for channel to be active
      await waitForActiveChannel(lnd as any, ldkNodeID);

      // Success toast/flow
      if (driver.isIOS) await waitForToast('SpendingBalanceReadyToast');
      if (driver.isAndroid) await dismissQuickPayIntro();
      await elementById('ExternalSuccess').waitForDisplayed({ timeout: 30_000 });
      await tap('ExternalSuccess-button');
      if (driver.isIOS) {
        await dismissBackgroundPaymentsTimedSheet();
        await dismissQuickPayIntro({ triggerTimedSheet: driver.isIOS });
      }
      await expectTextWithin('ActivitySpending', '20 001');

      // lnurl-pay (min != max) with comment
      const msats = 100000; // msats
      const sats = (msats / 1000).toString();
      const payRequest1 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable: msats, // msats
        maxSendable: 200000, // msats
        metadata: '[["text/plain","lnurl-node1"]]',
        commentAllowed: 12,
      });
      console.log('payRequest1', payRequest1);

      await enterAddressViaScanPrompt(payRequest1.encoded, { acceptCameraPermission: false });
      await expectTextWithin('SendNumberField', sats);
      // Check amounts 99 - 201 not allowed
      await multiTap('NRemove', 3); // remove "100"
      await tap('N2');
      await tap('N0');
      await tap('N1');
      await expectTextWithin('SendNumberField', '201');
      await elementById('ContinueAmount').waitForEnabled({ reverse: true });
      await multiTap('NRemove', 3); // remove "201"
      await multiTap('N9', 2);
      await expectTextWithin('SendNumberField', '99');
      if (driver.isIOS) {
        await tap('ContinueAmount');
        await waitForToast('LnurlPayAmountTooLowToast');
      } else {
        await elementById('ContinueAmount').waitForEnabled({ reverse: true });
      }
      await multiTap('NRemove', 2); // remove "99"
      // go with 150
      await tap('N1');
      await tap('N5');
      await tap('N0');
      await expectTextWithin('SendNumberField', '150');
      await elementById('ContinueAmount').waitForEnabled();
      await tap('ContinueAmount');
      await typeText('CommentInput', 'test comment');
      await confirmInputOnKeyboard();
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');
      await expectTextWithin('ActivitySpending', '19 851'); // 20 001 - 150
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '150');
      await expectTextWithin('ActivityShort-0', '-');
      await expectTextWithin('ActivityShort-0', 'Sent');

      // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/417 ---//
      // await tap('ActivityShort-0');
      // await elementById('InvoiceComment').waitForDisplayed();
      // await expectTextWithin('InvoiceComment', 'test comment');
      // await doNavigationClose();
      // --- skip due to: https://github.com/synonymdev/bitkit-android/issues/417 ---//

      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      // lnurl-pay (min == max), no comment
      const payRequest2 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable: 222000,
        maxSendable: 222000,
        metadata: '[["text/plain","lnurl-node2"]]',
        commentAllowed: 0,
      });
      console.log('payRequest2', payRequest2);

      try {
        await enterAddressViaScanPrompt(payRequest2.encoded, { acceptCameraPermission: false });
        await elementById('ReviewAmount-primary').waitForDisplayed({ timeout: 5000 });
      } catch {
        console.warn('ReviewAmount not found, trying again');
        await enterAddressViaScanPrompt(payRequest2.encoded, { acceptCameraPermission: false });
        await sleep(1000);
      }
      // Comment input should not be visible
      await elementById('CommentInput').waitForDisplayed({ reverse: true });
      const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
      await expect(reviewAmt).toHaveText('222');
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');
      await expectTextWithin('ActivitySpending', '19 629'); // 19 851 - 222 = 19 629
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '222');
      await expectTextWithin('ActivityShort-0', '-');
      await expectTextWithin('ActivityShort-0', 'Sent');
      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      // lnurl-pay via manual entry
      const minSendable = 321000; // msats
      const minSendableSats = (minSendable / 1000).toString();
      const payRequest3 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable,
        maxSendable: 350000,
        metadata: '[["text/plain","lnurl-node2"]]',
      });
      console.log('payRequest3', payRequest3);

      await enterAddress(payRequest3.encoded, { acceptCameraPermission: false });
      await expectTextWithin('SendNumberField', minSendableSats);
      await elementById('ContinueAmount').waitForDisplayed();
      await tap('ContinueAmount');
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed();
      await tap('Close');
      await expectTextWithin('ActivitySpending', '19 308'); // 19 629 - 321 = 19 308
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '321');
      await expectTextWithin('ActivityShort-0', '-');
      await expectTextWithin('ActivityShort-0', 'Sent');
      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      // lnurl-withdraw (min != max)
      const withdrawRequest1 = await lnurlServer.generateNewUrl('withdrawRequest', {
        minWithdrawable: 102000,
        maxWithdrawable: 202000,
        defaultDescription: 'lnurl-withdraw1',
      });
      console.log('withdrawRequest1', withdrawRequest1);

      try {
        await enterAddressViaScanPrompt(withdrawRequest1.encoded, {
          acceptCameraPermission: false,
        });
        await elementById('SendNumberField').waitForDisplayed({ timeout: 5000 });
      } catch {
        console.warn('SendNumberField not found, trying again');
        await enterAddressViaScanPrompt(withdrawRequest1.encoded, {
          acceptCameraPermission: false,
        });
      }
      await expectTextWithin('SendNumberField', '102');
      await tap('ContinueAmount');
      await tap('WithdrawConfirmButton');
      await elementById('ReceivedTransaction').waitForDisplayed();
      await swipeFullScreen('down');
      await expectTextWithin('ActivitySpending', '19 410'); // 19 308 + 102 = 19 410
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '102');
      await expectTextWithin('ActivityShort-0', '+');
      await expectTextWithin('ActivityShort-0', 'lnurl-withdraw1');
      await expectTextWithin('ActivityShort-0', 'Received');
      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      // lnurl-withdraw (min == max)
      const withdrawRequest2 = await lnurlServer.generateNewUrl('withdrawRequest', {
        minWithdrawable: 303000,
        maxWithdrawable: 303000,
        defaultDescription: 'lnurl-withdraw2',
      });
      console.log('withdrawRequest2', withdrawRequest2);

      // TODO: after https://github.com/synonymdev/bitkit-android/issues/418 is resolved
      // we should test the scan flow here
      await enterAddress(withdrawRequest2.encoded, { acceptCameraPermission: false });
      const reviewAmtWithdraw = await elementByIdWithin('WithdrawAmount-primary', 'MoneyText');
      await expect(reviewAmtWithdraw).toHaveText('303');
      await tap('WithdrawConfirmButton');
      await elementById('ReceivedTransaction').waitForDisplayed();
      await swipeFullScreen('down');
      await expectTextWithin('ActivitySpending', '19 713'); // 19 410 + 303 = 19 713
      await swipeFullScreen('up');
      await swipeFullScreen('up');
      await elementById('ActivityShort-0').waitForDisplayed();
      await expectTextWithin('ActivityShort-0', '303');
      await expectTextWithin('ActivityShort-0', '+');
      await expectTextWithin('ActivityShort-0', 'lnurl-withdraw2');
      await expectTextWithin('ActivityShort-0', 'Received');
      await sleep(1000);
      await swipeFullScreen('down');
      await swipeFullScreen('down');

      // lnurl-auth
      const loginRequest1 = await lnurlServer.generateNewUrl('login');
      console.log('loginRequest1', loginRequest1);
      const loginEvent = new Promise<void>((resolve) => lnurlServer.once('login', resolve));
      await enterAddressViaScanPrompt(loginRequest1.encoded, { acceptCameraPermission: false });
      await tap('continue_button');
      await expectText('Signed In');
      await loginEvent;
    }
  );
});
