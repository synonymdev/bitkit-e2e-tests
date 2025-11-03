import BitcoinJsonRpc from 'bitcoin-json-rpc';
import {
  confirmInputOnKeyboard,
  doNavigationClose,
  elementById,
  expectTextWithin,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
} from './actions';
import { LndConfig } from './constants';
import createLndRpc, { LnRpc, WalletUnlockerRpc } from '@radar/lnrpc';

export async function setupLND(
  rpc: BitcoinJsonRpc,
  lndConfig: LndConfig
): Promise<{ lnd: LnRpc & WalletUnlockerRpc; lndNodeID: string }> {
  const lnd = await createLndRpc(lndConfig);
  const { address: lndAddress } = await lnd.newAddress();
  await rpc.sendToAddress(lndAddress, '1');
  await rpc.generateToAddress(1, await rpc.getNewAddress());
  const { identityPubkey: lndNodeID } = await lnd.getInfo();
  console.info({ lndNodeID });
  return { lnd, lndNodeID };
}

export async function openLNDAndSync(
  lnd: LnRpc & WalletUnlockerRpc,
  rpc: BitcoinJsonRpc,
  ldkNodeId: string
) {
  console.info('Channel opening...');
  await lnd.openChannelSync({
    nodePubkeyString: ldkNodeId,
    localFundingAmount: '100000',
    private: true,
  });
  await rpc.generateToAddress(6, await rpc.getNewAddress());
}

export async function waitForPeerConnection(
  lnd: { listPeers: () => PromiseLike<{ peers: any }> | { peers: any } },
  nodeId: string,
  maxRetries = 20
) {
  let retries = 0;

  while (retries < maxRetries) {
    await sleep(1000);
    const { peers } = await lnd.listPeers();
    console.info({ peers });
    if (peers?.some((p: { pubKey: any }) => p.pubKey === nodeId)) {
      break;
    }
    retries++;
  }

  if (retries === maxRetries) {
    throw new Error('Peer not connected');
  }
}

export async function waitForActiveChannel(
  lnd: {
    listChannels: (arg0: {
      peer: Buffer;
      activeOnly: boolean;
    }) => PromiseLike<{ channels: any }> | { channels: any };
  },
  nodeId: string,
  maxRetries = 20
) {
  let retries = 0;

  while (retries < maxRetries) {
    await sleep(1000);
    const { channels } = await lnd.listChannels({
      peer: Buffer.from(nodeId, 'hex'),
      activeOnly: true,
    });

    if (channels?.length > 0) {
      break;
    }

    retries++;
  }

  if (retries === maxRetries) {
    throw new Error('Channel not active');
  }
  console.info('Channel is active!');
}

export async function getLDKNodeID(): Promise<string> {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('AdvancedSettings');
  // wait for LDK to start
  await sleep(5000);
  await tap('LightningNodeInfo');
  await elementById('LDKNodeID').waitForDisplayed({ timeout: 60_000 });
  const ldkNodeId = (await elementById('LDKNodeID').getText()).trim();
  console.info({ ldkNodeId });
  await tap('NavigationBack');
  return ldkNodeId;
}

export async function connectToLND(lndNodeID: string, { navigationClose = true } = {}) {
  await tap('Channels');
  await tap('NavigationAction');
  await tap('FundCustom');
  await tap('FundManual');
  await typeText('NodeIdInput', lndNodeID);
  await typeText('HostInput', '0.0.0.0');
  await typeText('PortInput', '9735');
  await confirmInputOnKeyboard();
  await tap('ExternalContinue');
  if (navigationClose) await doNavigationClose();
}

export async function checkChannelStatus({ size = '100 000' } = {}) {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('AdvancedSettings');
  await tap('Channels');
  await tap('Channel');
  await expectTextWithin('TotalSize', `₿ ${size}`);
  await swipeFullScreen('up');
  await elementById('IsUsableYes').waitForDisplayed();
  await doNavigationClose();
  await sleep(500);
}
