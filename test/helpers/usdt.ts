import { execFileSync } from 'node:child_process';

export interface UsdtFixtureStatus {
  chainId: number;
  forkBlock: number;
  mode: string;
  block: string;
  urls: Record<'node' | 'alto' | 'gateway' | 'control', string>;
}

export async function usdtFixture<T>(method: string, params: unknown[] = []): Promise<T> {
  const endpoint = process.env.USDT_FIXTURE_URL;
  if (!endpoint) throw new Error('Start scripts/usdt-fixture up and load its env output first');
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('USDT fixture controls must use localhost HTTP');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`USDT fixture HTTP ${response.status}`);
  const body = (await response.json()) as { result: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

/** Call before wallet setup; never reset the chain in the middle of a recovery journey. */
export async function prepareUsdtFixture() {
  const status = await usdtFixture<UsdtFixtureStatus>('status');
  if (status.chainId !== 42161 || status.mode !== 'healthy') {
    throw new Error('Expected a healthy Arbitrum fixture');
  }
  for (const [key, route] of [
    ['USDT_RPC_URL', 'chain-rpc'],
    ['USDT_BUNDLER_URL', 'rpc'],
    ['USDT_DEPOSITS_URL', 'deposits'],
    ['USDT_BRIDGES_URL', 'bridges'],
  ]) {
    if (process.env[key] !== `${status.urls.gateway}/v1/usdt/${route}`) {
      throw new Error(`Load scripts/usdt-fixture env before building and running (${key})`);
    }
  }
  if (driver.isAndroid) {
    const serial =
      process.env.ANDROID_SERIAL ??
      (driver.capabilities as Record<string, unknown>)['appium:udid']?.toString();
    if (!serial) throw new Error('Set ANDROID_SERIAL for the dedicated test emulator');
    const port = new URL(status.urls.gateway).port;
    execFileSync('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  }
  return status;
}

/** Sends an actual ERC-20 transfer, producing receive/history events. Amount is decimal USDT. */
export const fundUsdt = (address: string, amount: string) =>
  usdtFixture<string>('fund', [address, amount]);

/** Atomic units, suitable for exact balance and fee assertions. */
export const usdtBalance = async (address: string) =>
  BigInt(await usdtFixture<string>('balance', [address]));

export const setUsdtProvider = (
  mode: 'healthy' | 'unavailable' | 'expired' | 'invalid-signature'
) => usdtFixture<string>('provider-mode', [mode]);

export const setUsdtBundling = (mode: 'auto' | 'manual') => usdtFixture('bundling', [mode]);
export const mineUsdtBlocks = (count = 3) => usdtFixture('mine', [count]);

export type UsdtDepositNetwork = 'ethereum' | 'polygon' | 'base' | 'bsc' | 'tron' | 'solana';
export type UsdtBridgeStatus =
  | 'processing'
  | 'needs_attention'
  | 'failed'
  | 'completed'
  | 'refunding'
  | 'refunded';
export type LayerZeroStatus =
  | 'INFLIGHT'
  | 'CONFIRMING'
  | 'DELIVERED'
  | 'FAILED'
  | 'BLOCKED'
  | 'PAYLOAD_STORED'
  | 'APPLICATION_BURNED'
  | 'APPLICATION_SKIPPED';

/** Simulate an external deposit after the app has registered its receiving address. */
export const createUsdtDeposit = (owner: string, network: UsdtDepositNetwork, amount: string) =>
  usdtFixture<{ id: string }>('orchestra', ['deposit', owner, network, amount]);

/** Completion/refund creates real Arbitrum transfers where Arbitrum is the receiving chain. */
export const setUsdtBridgeStatus = (id: string, status: UsdtBridgeStatus) =>
  usdtFixture('orchestra', ['advance', id, status]);

export const usdtBridgeScenarios = () =>
  usdtFixture<{
    quotes: Array<{ id: string; owner: string; recipientAddress: string; order: unknown }>;
    deposits: Array<{ deposit: { id: string; status: string }; order: unknown }>;
  }>('orchestra', ['list']);

/** Only changes future quotes; already approved/funded quotes retain their terms. */
export const setUsdtBridgeFee = (amount: string) => usdtFixture('orchestra', ['fee', amount]);
export const setUsdtBridgeQuoteLifetime = (seconds: number) =>
  usdtFixture('orchestra', ['quote-ttl', String(seconds)]);

/** Requires a real USDT0 source receipt; never fabricates a GUID or source payment. */
export const setLayerZeroStatus = (sourceTx: string, status: LayerZeroStatus) =>
  usdtFixture('layerzero', [sourceTx, status]);

export const setUsdtBridgeProvider = (
  provider: 'orchestra' | 'layerzero',
  mode: 'healthy' | 'unavailable' | 'rate-limited' | 'invalid-response'
) =>
  provider === 'orchestra'
    ? usdtFixture('orchestra', ['mode', mode])
    : usdtFixture('layerzero-mode', [mode]);
