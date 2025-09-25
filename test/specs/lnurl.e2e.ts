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
  acceptAppNotificationAlert,
  multiTap,
  receiveOnchainFunds,
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
      await tap('NavigationClose');
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

      await tap('Scan');
      // on the first time we need to accept the notifications permission dialog to use camera
      await acceptAppNotificationAlert('permission_allow_foreground_only_button');
      await tap('ScanPrompt');
      await typeText('QRInput', channelReq.encoded);
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');

      const channelRequestPromise = waitForEvent(lnurlServer, 'channelRequest:action');
      await elementById('ConnectButton').waitForDisplayed();
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
      await elementById('ExternalSuccess').waitForDisplayed({ timeout: 30_000 });
      await tap('ExternalSuccess-button');

      // lnurl-pay (min != max) with comment
      const payRequest1 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable: 100_000, // msats
        maxSendable: 200_000, // msats
        metadata: '[{"text/plain","lnurl-node1"}]'.replace('{', '[').replace('}', ']'),
        commentAllowed: 12,
      });
      await tap('Scan');
      await tap('ScanPrompt');
      await typeText('QRInput', payRequest1.encoded);
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');
      await tap('N1');
      await (await elementById('N0')).waitForDisplayed();
      await multiTap('N0', 5);
      await tap('ContinueAmount');
      await typeText('CommentInput', 'test comment');
      await confirmInputOnKeyboard();
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed({ timeout: 10_000 });
      await tap('Close');
      await swipeFullScreen('up');
      await tap('ActivityShort-1');
      await elementById('InvoiceComment').waitForDisplayed();
      const commentText = await elementById('InvoiceComment').getText();
      if (!commentText.includes('test comment')) {
        throw new Error('Expected comment not found in invoice');
      }
      await tap('NavigationClose');

      // lnurl-pay (min == max), no comment
      const payRequest2 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable: 222_000,
        maxSendable: 222_000,
        metadata: '[{"text/plain","lnurl-node2"}]'.replace('{', '[').replace('}', ']'),
      });
      await tap('Scan');
      await tap('ScanPrompt');
      await typeText('QRInput', payRequest2.encoded);
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');
      // Comment input should not be visible
      await elementById('CommentInput').waitForDisplayed({ reverse: true });
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed({ timeout: 10_000 });
      await tap('Close');

      // lnurl-pay via manual entry
      const minSendable = 321_000; // msats
      const minSendableSats = (minSendable / 1000).toString();
      const payRequest3 = await lnurlServer.generateNewUrl('payRequest', {
        minSendable,
        maxSendable: 350_000,
        metadata: '[{"text/plain","lnurl-node2"}]'.replace('{', '[').replace('}', ']'),
      });
      await tap('Send');
      await tap('RecipientManual');
      await typeText('RecipientInput', payRequest3.encoded);
      await confirmInputOnKeyboard();
      await elementById('AddressContinue').waitForEnabled();
      await tap('AddressContinue');
      const reviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
      await expect(reviewAmt).toHaveText(minSendableSats);
      await tap('N3');
      await tap('N2');
      await tap('N1');
      await multiTap('N0', 3);
      await elementById('ContinueAmount').waitForDisplayed();
      await tap('ContinueAmount');
      await dragOnElement('GRAB', 'right', 0.95);
      await elementById('SendSuccess').waitForDisplayed({ timeout: 10_000 });
      await tap('Close');

      // lnurl-withdraw (min != max)
      const withdrawRequest1 = await lnurlServer.generateNewUrl('withdrawRequest', {
        minWithdrawable: 102_000,
        maxWithdrawable: 202_000,
        defaultDescription: 'lnurl-withdraw1',
      });
      await tap('Scan');
      await tap('ScanPrompt');
      await typeText('QRInput', withdrawRequest1.encoded);
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');
      await tap('ContinueAmount');
      await tap('WithdrawConfirmButton');
      await elementById('ReceivedTransaction').waitForDisplayed({ timeout: 10_000 });
      await swipeFullScreen('down');

      // lnurl-withdraw (min == max)
      const withdrawRequest2 = await lnurlServer.generateNewUrl('withdrawRequest', {
        minWithdrawable: 303_000,
        maxWithdrawable: 303_000,
        defaultDescription: 'lnurl-withdraw2',
      });
      await tap('Scan');
      await tap('ScanPrompt');
      await typeText('QRInput', withdrawRequest2.encoded);
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');
      await tap('WithdrawConfirmButton');
      await elementById('ReceivedTransaction').waitForDisplayed({ timeout: 10_000 });
      await swipeFullScreen('down');

      // lnurl-auth
      const loginRequest1 = await lnurlServer.generateNewUrl('login');
      await tap('Scan');
      await tap('ScanPrompt');
      await typeText('QRInput', loginRequest1.encoded);
      const loginEvent = new Promise<void>((resolve) => lnurlServer.once('login', resolve));
      await confirmInputOnKeyboard();
      await tap('DialogConfirm');
      await loginEvent;
    }
  );
});
