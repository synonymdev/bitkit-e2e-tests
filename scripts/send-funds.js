#!/usr/bin/env node
'use strict';

// Standalone script to send funds on regtest and optionally wait for Electrum to sync.
// Usage examples:
//   node scripts/send-funds.js --address bcrt1... --amount 1
//   node scripts/send-funds.js --address bcrt1... --amount 0.5 --mine 2 --wait
//
// Flags:
//   --address         Destination address (required)
//   --amount          Amount in BTC (default: 1)
//   --mine            Number of blocks to mine after sending (default: 1)
//   --no-mine         Do not mine any blocks after sending
//   --wait            Wait for Electrum to sync to the node's height (default: true)
//   --no-wait         Do not wait for Electrum sync
//   --timeout         Electrum sync timeout in seconds (default: 30)
//   --bitcoin-url     Bitcoin Core RPC URL (default: http://polaruser:polarpass@127.0.0.1:43782)
//   --electrum-host   Electrum host (default: 127.0.0.1)
//   --electrum-port   Electrum TCP port (default: 60001)

const net = require('net');
const tls = require('tls');

// Dynamic ESM loaders to avoid CJS/ESM interop issues on Node 22+
async function loadBitcoinJsonRpc() {
  const m = await import('bitcoin-json-rpc');
  return m.default || m;
}

async function loadElectrumHelpers() {
  // Node ESM doesn't support directory imports; point to the file explicitly
  const m = await import('rn-electrum-client/helpers/index.js');
  return m; // namespace with start/stop/subscribeHeader
}

function parseArgs(argv) {
  const args = {
    address: undefined,
    amount: '1',
    mine: 1,
    wait: true,
    timeoutSec: 30,
    bitcoinUrl: process.env.BITCOIN_URL || 'http://polaruser:polarpass@127.0.0.1:43782',
    electrumHost: process.env.ELECTRUM_HOST || '127.0.0.1',
    electrumPort: parseInt(process.env.ELECTRUM_PORT || '60001', 10),
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--address') {
      args.address = argv[++i];
    } else if (a === '--amount') {
      args.amount = String(argv[++i]);
    } else if (a === '--mine') {
      args.mine = parseInt(argv[++i], 10);
    } else if (a === '--no-mine') {
      args.mine = 0;
    } else if (a === '--wait') {
      args.wait = true;
    } else if (a === '--no-wait') {
      args.wait = false;
    } else if (a === '--timeout') {
      args.timeoutSec = parseInt(argv[++i], 10);
    } else if (a === '--bitcoin-url') {
      args.bitcoinUrl = argv[++i];
    } else if (a === '--electrum-host') {
      args.electrumHost = argv[++i];
    } else if (a === '--electrum-port') {
      args.electrumPort = parseInt(argv[++i], 10);
    } else if (!args.address && a && !a.startsWith('--')) {
      // Positional address fallback
      args.address = a;
    } else if (args.amount === '1' && a && !a.startsWith('--')) {
      // Positional amount fallback
      args.amount = String(a);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/send-funds.js --address <bcrt1...> [--amount <btc>] [--mine <n>] [--wait]

Flags:
  --address         Destination address (required)
  --amount          Amount in BTC (default: 1)
  --mine            Number of blocks to mine after sending (default: 1)
  --no-mine         Do not mine any blocks after sending
  --wait            Wait for Electrum to sync to the node's height (default: true)
  --no-wait         Do not wait for Electrum sync
  --timeout         Electrum sync timeout in seconds (default: 30)
  --bitcoin-url     Bitcoin Core RPC URL (default: http://polaruser:polarpass@127.0.0.1:43782)
  --electrum-host   Electrum host (default: 127.0.0.1)
  --electrum-port   Electrum TCP port (default: 60001)
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForElectrumSync({ bitcoinUrl, electrumHost, electrumPort, timeoutMs }) {
  let electrumHeight = 0;
  const BitcoinJsonRpc = await loadBitcoinJsonRpc();
  const Electrum = await loadElectrumHelpers();
  const rpc = new BitcoinJsonRpc(bitcoinUrl);

  try {
    await Electrum.start({
      network: 'bitcoinRegtest',
      customPeers: [
        {
          host: electrumHost,
          protocol: 'tcp',
          tcp: electrumPort,
          ssl: 60002, // unused in regtest here
        },
      ],
      net,
      tls,
    });

    const { data: header } = await Electrum.subscribeHeader({
      network: 'bitcoinRegtest',
      onReceive: (data) => {
        if (Array.isArray(data) && data[0] && typeof data[0].height === 'number') {
          electrumHeight = data[0].height;
        }
      },
    });

    electrumHeight = header.height;

    const startTime = Date.now();
    while (true) {
      const nodeHeight = await rpc.getBlockCount();
      if (nodeHeight === electrumHeight) break;
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Electrum sync timeout');
      }
      await sleep(1000);
    }
  } finally {
    try {
      await Electrum.stop();
    } catch (_) {
      // ignore
    }
  }
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help || !args.address) {
    printHelp();
    if (!args.address) process.exit(2);
    return;
  }

  const {
    address,
    amount,
    mine,
    wait: waitFlag,
    timeoutSec,
    bitcoinUrl,
    electrumHost,
    electrumPort,
  } = args;

  const BitcoinJsonRpc = await loadBitcoinJsonRpc();
  const rpc = new BitcoinJsonRpc(bitcoinUrl);

  try {
    console.log(`→ Sending ${amount} BTC to ${address}`);
    const txid = await rpc.sendToAddress(address, String(amount));
    console.log(`✓ Sent. txid=${txid}`);

    if (mine && mine > 0) {
      const miningAddress = await rpc.getNewAddress();
      console.log(`→ Mining ${mine} block(s) to ${miningAddress}`);
      const blocks = await rpc.generateToAddress(mine, miningAddress);
      console.log(`✓ Mined blocks: ${blocks.join(', ')}`);
    }

    if (waitFlag) {
      console.log(`→ Waiting for Electrum to sync (host=${electrumHost}, port=${electrumPort})`);
      await waitForElectrumSync({
        bitcoinUrl,
        electrumHost,
        electrumPort,
        timeoutMs: timeoutSec * 1000,
      });
      console.log('✓ Electrum is in sync with the node');
    }

    console.log('✔ Done');
  } catch (err) {
    console.error('✗ Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
