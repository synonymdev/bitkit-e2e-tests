import { execSync } from 'node:child_process';
import { sleep } from './actions';
import { getAppId, getAppPath } from './constants';

export async function launchFreshApp() {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
  await sleep(3000);
}

/**
 * Uninstalls and reinstalls the app (like Detox `launchApp({ delete: true })`)
 */
export async function reinstallApp() {
  console.info('→ Reinstalling app...');
  const appId = getAppId();
  const appPath = getAppPath();

  await driver.removeApp(appId);
  resetBootedIOSKeychain();
  await driver.installApp(appPath);
  await driver.activateApp(appId);
}

/**
 * Resets iOS simulator to remove stored data between app reinstall cycles.
 * (Wallet data is stored in iOS Keychain and persists even after app uninstall
 *  unless the whole simulator is reset or keychain is reset specifically)
 */
function resetBootedIOSKeychain() {
  if (!driver.isIOS) return;

  let udid = '';
  try {
    udid =
      (driver.capabilities as Record<string, unknown>)['appium:udid']?.toString() ??
      (driver.capabilities as Record<string, unknown>).udid?.toString() ??
      (driver.capabilities as Record<string, unknown>).deviceUDID?.toString() ??
      '';
  } catch {}

  if (!udid) {
    console.warn(
      '⚠ Could not determine iOS simulator UDID; trying to reset booted simulator keychain'
    );
    try {
      execSync(`xcrun simctl keychain booted reset`, { stdio: 'ignore' });
      console.info(`→ Reset iOS simulator keychain for booted simulator`);
    } catch (error) {
      console.warn(`⚠ Failed to reset iOS simulator keychain for booted simulator`, error);
    }
    return;
  }

  try {
    execSync(`xcrun simctl keychain ${udid} reset`, { stdio: 'ignore' });
    console.info(`→ Reset iOS simulator keychain for ${udid}`);
  } catch (error) {
    console.warn(`⚠ Failed to reset iOS simulator keychain for ${udid}`, error);
  }
}
