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
  if (!endpoint) throw new Error('Start scripts/usdt-fixture run and load its env output first');
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
