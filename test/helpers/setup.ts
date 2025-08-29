import { elementByIdWithin, sleep, tap } from './actions';
import { getAppId, getAppPath } from './constants';

export async function launchFreshApp() {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
  // workaround to get rid of "Bitkit is running in background" alert
  await tap('TotalBalance');
  const moneyFiatSymbol = await elementByIdWithin('-primary', 'MoneyFiatSymbol');
  if ((await moneyFiatSymbol.getText()) !== '₿') {
    await tap('TotalBalance');
  }
  await sleep(500);
}

/**
 * Uninstalls and reinstalls the app (like Detox `launchApp({ delete: true })`)
 */
export async function reinstallApp() {
  console.info('→ Reinstalling app...');
  const appId = getAppId();
  const appPath = getAppPath();

  await driver.removeApp(appId);
  await driver.installApp(appPath);
  await driver.activateApp(appId);
}
