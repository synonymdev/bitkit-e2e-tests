import { getAppId, getAppPath } from './constants';

export async function launchApp() {
  const appId = getAppId();

  if (driver.isIOS) {
    await driver.execute('mobile: launchApp', { bundleId: appId });
  } else if (driver.isAndroid) {
    await driver.execute('mobile: activateApp', { appId });
  }
}

export async function reinstallApp() {
  const appId = getAppId();
  const appPath = getAppPath();

  await driver.removeApp(appId);
  await driver.installApp(appPath);
  await launchApp();
}

export async function wipeAppData() {
  const appId = getAppId();

  if (driver.isAndroid) {
    await driver.execute('mobile: shell', {
      command: 'pm clear',
      args: [appId],
    });
    await launchApp();
  } else {
    reinstallApp();
  }
}

export async function launchFreshApp() {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
}
