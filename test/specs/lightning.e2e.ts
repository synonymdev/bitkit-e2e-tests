import BitcoinJsonRpc from 'bitcoin-json-rpc';
import initElectrum from '../helpers/electrum';
import { completeOnboarding, receiveOnchainFunds, expectTextVisible } from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { bitcoinURL, lndConfig } from '../helpers/constants';
import {
  connectToLND,
  getLDKNodeID,
  setupLND,
  waitForPeerConnection,
  waitForActiveChannel,
  openLNDAndSync,
  checkChannelStatus,
} from '../helpers/lnd';

describe('@lightning - Lightning', () => {
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

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(() => {
    electrum?.stop();
  });

  it('@lightning_1 - Can receive and send LN payments', async () => {
    // Test plan:
    // - connect to LND node
    // - receive funds
    // - send funds
    // - check balances, tx history and notes
    // - restore wallet
    // - check balances, tx history and notes
    // - close channel

    await receiveOnchainFunds(rpc, { sats: 1000 });

    // send funds to LND node and open a channel
    const { lnd, lndNodeID } = await setupLND(rpc, lndConfig);
    await electrum?.waitForSync();

    // get LDK Node id
    const ldkNodeId = await getLDKNodeID();

    // connect to LND
    await connectToLND(lndNodeID);

    // wait for peer to be connected
    await waitForPeerConnection(lnd, ldkNodeId);

    // open a channel
    await openLNDAndSync(lnd, rpc, ldkNodeId);
    await electrum?.waitForSync();

    // wait for channel to be active
    await waitForActiveChannel(lnd, ldkNodeId);

    // Toast message
    await expectTextVisible('Spending Balance Ready');

    // check channel status
    await checkChannelStatus();
  });
});
