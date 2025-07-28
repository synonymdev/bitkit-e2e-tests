import { getAppId, getAppPath } from './constants';

export async function launchFreshApp() {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
}

/**
 * Uninstalls and reinstalls the app (like Detox `launchApp({ delete: true })`)
 */
export async function reinstallApp() {
  const appId = getAppId();
  const appPath = getAppPath();

  await driver.removeApp(appId);
  await driver.installApp(appPath);
  await driver.activateApp(appId);
}