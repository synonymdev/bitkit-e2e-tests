export const APP_ID = {
  android: process.env.APP_ID_ANDROID ?? 'to.bitkit.dev',
  ios: process.env.APP_ID_IOS ?? 'to.bitkit',
};

export function getAppId(): string {
  return driver.isAndroid ? APP_ID.android : APP_ID.ios;
}

export function getAppPath(): string {
  const cap = browser.capabilities as any;
  const possibleKeys = ['app', 'appium:app'];

  for (const key of possibleKeys) {
    if (typeof cap[key] === 'string') return cap[key];
  }

  throw new Error(`App path not defined in capabilities (tried ${possibleKeys.join(', ')})`);
}

export const bitcoinURL =
  process.env.BITCOIN_RPC_URL ?? 'http://polaruser:polarpass@127.0.0.1:43782';

export type Backend = 'local' | 'regtest' | 'mainnet';

export function getBackend(): Backend {
  const backend = process.env.BACKEND || 'local';
  if (backend !== 'local' && backend !== 'regtest' && backend !== 'mainnet') {
    throw new Error(`Invalid BACKEND: ${backend}. Expected 'local', 'regtest', or 'mainnet'.`);
  }
  return backend;
}

export const electrumHost =
  getBackend() === 'regtest'
    ? process.env.ELECTRUM_HOST ?? 'electrs.bitkit.stag0.blocktank.to'
    : getBackend() === 'mainnet'
      ? process.env.ELECTRUM_HOST ?? 'electrum.bitkit.to'
      : process.env.ELECTRUM_HOST ?? '127.0.0.1';
export const electrumPort = Number.parseInt(
  process.env.ELECTRUM_PORT ?? (getBackend() === 'regtest' ? '9999' : getBackend() === 'mainnet' ? '50001' : '60001'),
  10
);

// Blocktank API for regtest operations (deposit, mine blocks, pay invoices)
export const blocktankURL =
  process.env.BLOCKTANK_URL ?? 'https://api.stag0.blocktank.to/blocktank/api/v2';

export type LndConfig = {
  server: string;
  tls: string;
  macaroonPath: string;
};

export const lndConfig: LndConfig = {
  server: 'localhost:10009',
  tls: `${__dirname}/../../docker/lnd/tls.cert`,
  macaroonPath: `${__dirname}/../../docker/lnd/data/chain/bitcoin/regtest/admin.macaroon`,
};
