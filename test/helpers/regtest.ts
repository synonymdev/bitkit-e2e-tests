/**
 * Regtest helpers that abstract the backend (local Bitcoin RPC vs Blocktank API).
 *
 * Set BACKEND=local to use local docker stack (Bitcoin RPC on localhost).
 * Set BACKEND=regtest to use Blocktank API (company regtest over the internet).
 *
 * Default is 'local' for backwards compatibility with existing tests.
 */

import * as fs from 'node:fs';
import * as https from 'node:https';
import BitcoinJsonRpc from 'bitcoin-json-rpc';
import { bitcoinURL, blocktankURL, lndConfig, getBackend, type Backend } from './constants';

export { getBackend, type Backend };

function requireRegtestBackend(operation: string): void {
  if (getBackend() !== 'regtest') {
    throw new Error(`${operation} is only available with BACKEND=regtest`);
  }
}

// Local backend (Bitcoin RPC)

let _rpc: BitcoinJsonRpc | null = null;

function getRpc(): BitcoinJsonRpc {
  if (!_rpc) {
    _rpc = new BitcoinJsonRpc(bitcoinURL);
  }
  return _rpc;
}

async function localDeposit(address: string, amountSat?: number): Promise<string> {
  const rpc = getRpc();
  const btc = amountSat ? (amountSat / 100_000_000).toString() : '0.001'; // default 100k sats
  console.info(`→ [local] Sending ${btc} BTC to ${address}`);
  const txid = await rpc.sendToAddress(address, btc);
  console.info(`→ [local] txid: ${txid}`);
  return txid;
}

async function localMineBlocks(count: number): Promise<void> {
  const rpc = getRpc();
  console.info(`→ [local] Mining ${count} block(s)...`);
  for (let i = 0; i < count; i++) {
    await rpc.generateToAddress(1, await rpc.getNewAddress());
  }
  console.info(`→ [local] Mined ${count} block(s)`);
}

function lndRestRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tlsCert = fs.readFileSync(lndConfig.tls);
  const macaroon = fs.readFileSync(lndConfig.macaroonPath).toString('hex');
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: lndConfig.restHost,
        port: lndConfig.restPort,
        path,
        method: 'POST',
        ca: tlsCert,
        rejectUnauthorized: false,
        headers: {
          'Grpc-Metadata-macaroon': macaroon,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data) as Record<string, unknown>);
          } else {
            reject(new Error(`LND REST ${res.statusCode}: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function localPayInvoice(invoice: string, amountSat?: number): Promise<string> {
  const body: Record<string, unknown> = { payment_request: invoice };
  if (amountSat !== undefined) {
    body.amt = amountSat;
  }

  console.info(`→ [local] Paying invoice via LND REST...`);
  const result = await lndRestRequest('/v1/channels/transactions', body);

  if (result.payment_error && result.payment_error !== '') {
    throw new Error(`LND payment error: ${result.payment_error}`);
  }

  const paymentHash = (result.payment_hash as string) ?? 'unknown';
  console.info(`→ [local] Payment hash: ${paymentHash}`);
  return paymentHash;
}

// Blocktank backend (regtest API over HTTPS)

async function blocktankDeposit(address: string, amountSat?: number): Promise<string> {
  requireRegtestBackend('deposit');
  const url = `${blocktankURL}/regtest/chain/deposit`;
  const body: { address: string; amountSat?: number } = { address };
  if (amountSat !== undefined) {
    body.amountSat = amountSat;
  }

  console.info(`→ [blocktank] Deposit to ${address}${amountSat ? ` (${amountSat} sats)` : ''}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Blocktank deposit failed: ${response.status} - ${errorText}`);
  }

  const txid = await response.text();
  console.info(`→ [blocktank] txid: ${txid}`);
  return txid;
}

async function blocktankMineBlocks(count: number): Promise<void> {
  requireRegtestBackend('mineBlocks');
  const url = `${blocktankURL}/regtest/chain/mine`;

  console.info(`→ [blocktank] Mining ${count} block(s)...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Blocktank mine failed: ${response.status} - ${errorText}`);
  }

  console.info(`→ [blocktank] Mined ${count} block(s)`);
}

async function blocktankPayInvoice(invoice: string, amountSat?: number): Promise<string> {
  requireRegtestBackend('payInvoice');
  const url = `${blocktankURL}/regtest/channel/pay`;
  const body: { invoice: string; amountSat?: number } = { invoice };
  if (amountSat !== undefined) {
    body.amountSat = amountSat;
  }

  console.info(`→ [blocktank] Paying invoice...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Blocktank pay invoice failed: ${response.status} - ${errorText}`);
  }

  const paymentId = await response.text();
  console.info(`→ [blocktank] Payment ID: ${paymentId}`);
  return paymentId;
}

// Unified interface

/**
 * Returns the Bitcoin RPC client for direct operations.
 * Only works with BACKEND=local. Throws if using regtest backend.
 * Useful for test utilities that need direct RPC access (e.g., getting addresses to send TO).
 */
export function getBitcoinRpc(): BitcoinJsonRpc {
  const backend = getBackend();
  if (backend !== 'local') {
    throw new Error('getBitcoinRpc() only works with BACKEND=local');
  }
  return getRpc();
}

/**
 * Ensures the local bitcoind has enough funds for testing.
 * Only runs when BACKEND=local. Skips silently when BACKEND=regtest
 * (Blocktank handles funding via its API).
 *
 * Call this in test `before` hooks instead of directly using RPC.
 */
export async function ensureLocalFunds(minBtc: number = 10): Promise<void> {
  const backend = getBackend();
  if (backend !== 'local') {
    console.info(`→ [${backend}] Skipping local bitcoind funding (using Blocktank API)`);
    return;
  }

  const rpc = getRpc();
  let balance = await rpc.getBalance();
  const address = await rpc.getNewAddress();

  while (balance < minBtc) {
    console.info(`→ [local] Mining blocks to fund local bitcoind (balance: ${balance} BTC)...`);
    await rpc.generateToAddress(10, address);
    balance = await rpc.getBalance();
  }
  console.info(`→ [local] Local bitcoind has ${balance} BTC`);
}

// Known regtest address for send tests (used when BACKEND=regtest)
// This is a standard regtest address that always works
const REGTEST_TEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

/**
 * Returns an external address to send funds TO (for testing send functionality).
 * - BACKEND=local: generates a new address from local bitcoind
 * - BACKEND=regtest: returns a known regtest test address
 */
export async function getExternalAddress(): Promise<string> {
  const backend = getBackend();
  if (backend === 'local') {
    const rpc = getRpc();
    return rpc.getNewAddress();
  }
  if (backend === 'mainnet') {
    throw new Error('getExternalAddress() is not available with BACKEND=mainnet');
  }
  return REGTEST_TEST_ADDRESS;
}

/**
 * Sends funds to an address (for testing receive in the app).
 * - BACKEND=local: uses local bitcoind RPC
 * - BACKEND=regtest: uses Blocktank deposit API
 *
 * @param address - The address to send to
 * @param amountBtcOrSats - Amount (BTC string for local, sats number for regtest)
 */
export async function sendToAddress(
  address: string,
  amountBtcOrSats: string | number
): Promise<string> {
  const backend = getBackend();
  if (backend === 'local') {
    const rpc = getRpc();
    const btc =
      typeof amountBtcOrSats === 'number'
        ? (amountBtcOrSats / 100_000_000).toString()
        : amountBtcOrSats;
    return rpc.sendToAddress(address, btc);
  }
  if (backend === 'regtest') {
    const sats =
      typeof amountBtcOrSats === 'string'
        ? Math.round(parseFloat(amountBtcOrSats) * 100_000_000)
        : amountBtcOrSats;
    return blocktankDeposit(address, sats);
  }
  throw new Error('sendToAddress() is not available with BACKEND=mainnet');
}

/**
 * Deposits satoshis to an address on regtest.
 * Uses local Bitcoin RPC or Blocktank API based on BACKEND env var.
 *
 * @param address - The Bitcoin address to fund
 * @param amountSat - Amount in satoshis (optional)
 * @returns The transaction ID
 */
export async function deposit(address: string, amountSat?: number): Promise<string> {
  const backend = getBackend();
  if (backend === 'local') {
    return localDeposit(address, amountSat);
  }
  if (backend === 'regtest') {
    return blocktankDeposit(address, amountSat);
  }
  throw new Error('deposit() is not available with BACKEND=mainnet');
}

/**
 * Mines blocks on regtest.
 * Uses local Bitcoin RPC or Blocktank API based on BACKEND env var.
 *
 * @param count - Number of blocks to mine (default: 1)
 */
export async function mineBlocks(count: number = 1): Promise<void> {
  const backend = getBackend();
  if (backend === 'local') {
    return localMineBlocks(count);
  }
  if (backend === 'regtest') {
    return blocktankMineBlocks(count);
  }
  throw new Error('mineBlocks() is not available with BACKEND=mainnet');
}

/**
 * Pays a Lightning invoice on regtest.
 * - BACKEND=local: uses the local LND node via REST API
 * - BACKEND=regtest: uses Blocktank API
 *
 * @param invoice - The BOLT11 invoice to pay
 * @param amountSat - Amount in satoshis (optional, for amount-less invoices)
 * @returns The payment ID / payment hash
 */
export async function payInvoice(invoice: string, amountSat?: number): Promise<string> {
  const backend = getBackend();
  if (backend === 'local') {
    return localPayInvoice(invoice, amountSat);
  }
  if (backend === 'regtest') {
    return blocktankPayInvoice(invoice, amountSat);
  }
  throw new Error('payInvoice() is not available with BACKEND=mainnet');
}
