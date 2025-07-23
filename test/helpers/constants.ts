import path from 'path';

export const APP_ID = {
  android: 'to.bitkit',
  ios: 'tbd',
};

export function getAppId(): string {
  return driver.isAndroid ? APP_ID.android : APP_ID.ios;
}

export const APP_PATH = {
  android: path.resolve(__dirname, '../../aut/bitkit.apk'),
  ios: path.resolve(__dirname, '../../aut/bitkit.ipa'),
};

export function getAppPath(): string {
  return driver.isAndroid ? APP_PATH.android : APP_PATH.ios;
}
