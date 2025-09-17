export const APP_ID = {
  android: 'to.bitkit.dev',
  ios: 'tbd',
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

export const bitcoinURL = 'http://polaruser:polarpass@127.0.0.1:43782';
export const electrumHost = '127.0.0.1';
export const electrumPort = 60001;

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
