import { getAppId } from './constants';

export async function launchFreshApp() {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
}
