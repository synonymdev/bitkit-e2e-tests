import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

export function getRnAppPath(): string {
  const appFileName = driver.isIOS ? 'bitkit_rn_regtest_ios.app' : 'bitkit_rn_regtest.apk';
  const fallback = path.join(__dirname, '..', '..', 'aut', appFileName);
  const appPath = process.env.RN_APK_PATH ?? fallback;
  if (!fs.existsSync(appPath)) {
    throw new Error(`RN APK not found at: ${appPath}. Set RN_APK_PATH or place it at ${fallback}`);
  }
  return appPath;
}

export function getNativeAppPath(): string {
  const appFileName = process.env.AUT_FILENAME ?? (driver.isIOS ? 'Bitkit.app' : 'bitkit_e2e.apk');
  const appPath = path.join(__dirname, '..', '..', 'aut', appFileName);
  if (!fs.existsSync(appPath)) {
    throw new Error(
      `Native app not found at: ${appPath}. Set AUT_FILENAME or place it at aut/${appFileName}`
    );
  }
  return appPath;
}

export async function reinstallAppFromPath(appPath: string, appId: string = getAppId()) {
  console.info(`→ Reinstalling app from: ${appPath}`);
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
export function resetBootedIOSKeychain() {
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
