import crypto from 'node:crypto';
import net from 'node:net';
import { address, networks, payments, Transaction } from 'bitcoinjs-lib';

export type Endpoint = { host: string; port: number };
export type PaymentEvidence = {
  txid: string;
  address: string;
  sats: number;
  rawTransaction: string;
};

export function freshRegtestRecipient(): string {
  const key = crypto.createECDH('secp256k1');
  key.generateKeys();
  return payments.p2wpkh({
    pubkey: key.getPublicKey(undefined, 'compressed'),
    network: networks.regtest,
  }).address!;
}

export function scriptHash(recipient: string): string {
  return crypto
    .createHash('sha256')
    .update(address.toOutputScript(recipient, networks.regtest))
    .digest()
    .reverse()
    .toString('hex');
}

export function electrumRequest(
  endpoint: Endpoint,
  method: string,
  params: unknown[],
  timeoutMs = 10_000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let buffer = '';
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error(`Smoke backend unavailable: ${method} timed out`)),
      timeoutMs
    );
    socket.setEncoding('utf8');
    socket.on('connect', () =>
      socket.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n')
    );
    socket.on('error', (error) => finish(new Error(`Smoke backend unavailable: ${error.message}`)));
    socket.on('close', () =>
      finish(new Error(`Smoke backend closed before responding to ${method}`))
    );
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 2_000_000) return finish(new Error('Oversized Electrum response'));
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const response = JSON.parse(line);
          if (response.id !== 1) continue;
          if (response.error)
            return finish(
              new Error(`Smoke backend rejected ${method}: ${JSON.stringify(response.error)}`)
            );
          if (!Object.hasOwn(response, 'result'))
            return finish(new Error('Malformed Electrum response'));
          finish(undefined, response.result);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  });
}

export async function history(
  endpoint: Endpoint,
  recipient: string
): Promise<{ tx_hash: string; height: number }[]> {
  const result = await electrumRequest(endpoint, 'blockchain.scripthash.get_history', [
    scriptHash(recipient),
  ]);
  if (
    !Array.isArray(result) ||
    result.some((r) => !r || !/^[a-f0-9]{64}$/.test(r.tx_hash) || !Number.isInteger(r.height))
  ) {
    throw new Error('Malformed Electrum address history');
  }
  return result;
}

export function verifyPayment(
  raw: string,
  txid: string,
  recipient: string,
  sats: number,
  spendsTxid?: string
): PaymentEvidence {
  const tx = Transaction.fromHex(raw);
  if (tx.getId() !== txid) throw new Error('Transaction identity does not match its raw bytes');
  const script = address.toOutputScript(recipient, networks.regtest);
  const outputs = tx.outs.filter((output) => output.script.equals(script));
  if (outputs.length !== 1 || outputs[0].value !== sats)
    throw new Error('Transaction recipient/amount does not match the requested payment');
  if (
    spendsTxid &&
    !tx.ins.some((input) => Buffer.from(input.hash).reverse().toString('hex') === spendsTxid)
  ) {
    throw new Error("Payment does not spend this test wallet's funding transaction");
  }
  return { txid, address: recipient, sats, rawTransaction: raw };
}

export async function waitForPayment(
  endpoint: Endpoint,
  recipient: string,
  sats: number,
  options: { txid?: string; spendsTxid?: string; timeoutMs?: number } = {}
): Promise<PaymentEvidence> {
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    const transactions = await history(endpoint, recipient);
    const candidates = options.txid
      ? transactions.filter((tx) => tx.tx_hash === options.txid)
      : transactions;
    if (candidates.length > 1)
      throw new Error('Fresh recipient has multiple transactions; fixture isolation is broken');
    if (candidates.length === 1) {
      const txid = candidates[0].tx_hash;
      const raw = await electrumRequest(endpoint, 'blockchain.transaction.get', [txid, false]);
      if (typeof raw !== 'string') throw new Error('Electrum did not return a raw transaction');
      return verifyPayment(raw, txid, recipient, sats, options.spendsTxid);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Expected payment was not observed within ${options.timeoutMs ?? 120_000}ms`);
}

export async function regtestOperation(
  baseUrl: string,
  operation: 'deposit' | 'mine',
  body: Record<string, unknown>
): Promise<string> {
  const response = await fetch(`${baseUrl}/regtest/chain/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Smoke regtest ${operation} unavailable: HTTP ${response.status}`);
  return (await response.text()).trim();
}
