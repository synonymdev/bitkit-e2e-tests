import net from 'net';
import tls from 'tls';
import BitcoinJsonRpc from 'bitcoin-json-rpc';
import * as electrum from 'rn-electrum-client/helpers';
import { bitcoinURL, electrumHost, electrumPort } from './constants';
import { getBackend } from './regtest';

const peer = {
  host: electrumHost,
  protocol: 'tcp',
  tcp: electrumPort,
  ssl: 60002,
};

const TIMEOUT = 120 * 1000; // 120 seconds

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ElectrumClient = {
  waitForSync: () => Promise<void>;
  stop: () => Promise<void>;
};

// No-op electrum client for regtest backend (app connects to remote Electrum directly)
const noopElectrum: ElectrumClient = {
  waitForSync: async () => {
    // For regtest backend, we just wait a bit for the app to sync with remote Electrum
    console.info('→ [regtest] Waiting for app to sync with remote Electrum...');
    await sleep(2000);
  },
  stop: async () => {
    // Nothing to stop for regtest
  },
};

// Connect to the Bitcoin Core node and Electrum server to wait for Electrum to sync
const initElectrum = async (): Promise<ElectrumClient> => {
  const backend = getBackend();

  // For regtest backend, return no-op client (app connects to remote Electrum directly)
  if (backend !== 'local') {
    console.info(`→ [${backend}] Skipping local Electrum init (using remote Electrum)`);
    return noopElectrum;
  }

  let electrumHeight = 0;

  try {
    const nodeRpc = new BitcoinJsonRpc(bitcoinURL);
    await electrum.start({
      network: 'bitcoinRegtest',
      customPeers: [peer],
      net,
      tls,
    });

    const { data: header } = await electrum.subscribeHeader({
      network: 'bitcoinRegtest',
      onReceive: (data: { height: number }[]) => {
        electrumHeight = data[0].height;
      },
    });

    electrumHeight = header.height;

    // Wait for Electrum to sync with the Bitcoin node
    const waitForSync = async (): Promise<void> => {
      const startTime = Date.now();

      while (true) {
        const nodeHeight = await nodeRpc.getBlockCount();

        if (nodeHeight === electrumHeight) {
          break;
        }

        if (Date.now() - startTime > TIMEOUT) {
          throw new Error('Electrum sync timeout exceeded 120 seconds');
        }

        await sleep(1000);
      }
    };

    return {
      waitForSync,
      stop: electrum.stop,
    };
  } catch (error) {
    await electrum.stop();
    throw error;
  }
};

export default initElectrum;
