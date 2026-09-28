import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './actions';
import { getAppId, getAppPath } from './constants';

function getIosSimulatorUdidForSimctl(): string {
  try {
    const udid =
      (driver.capabilities as Record<string, unknown>)['appium:udid']?.toString() ??
      (driver.capabilities as Record<string, unknown>).udid?.toString() ??
      (driver.capabilities as Record<string, unknown>).deviceUDID?.toString() ??
      process.env.SIMULATOR_UDID ??
      '';
    if (udid && udid !== 'auto') return udid;
  } catch {
    /* ignore */
  }
  try {
    const line = execSync('xcrun simctl list devices booted', { encoding: 'utf8' });
    const match = line.match(/\(([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\)/i);
    if (match) return match[1] ?? '';
  } catch {
    /* ignore */
  }
  return '';
}

export function grantIOSCameraPermission(appIdParam?: string) {
  if (typeof driver === 'undefined' || !driver.isIOS) return;
  const appId = appIdParam ?? getAppId();
  const udid = getIosSimulatorUdidForSimctl();

  if (!udid) {
    console.warn('⚠ grantIOSCameraPermission: could not resolve simulator UDID');
    return;
  }
  try {
    execSync(`xcrun simctl privacy "${udid}" grant camera "${appId}"`, { stdio: 'ignore' });
    console.info(`→ Granted iOS camera permission for '${appId}' (simulator ${udid})`);
  } catch (error) {
    console.warn('⚠ grantIOSCameraPermission failed', error);
  }
}

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
  grantIOSCameraPermission(appId);
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

export async function reinstallAppFromPath(
  appPath: string,
  appId: string = getAppId(),
  { strictKeychainReset = false }: { strictKeychainReset?: boolean } = {}
) {
  console.info(`→ Reinstalling app from: ${appPath}`);
  await driver.removeApp(appId);
  resetBootedIOSKeychain({ strict: strictKeychainReset });
  await driver.installApp(appPath);
  grantIOSCameraPermission(appId);
  await driver.activateApp(appId);
}

/**
 * Resets iOS simulator to remove stored data between app reinstall cycles.
 * (Wallet data is stored in iOS Keychain and persists even after app uninstall
 *  unless the whole simulator is reset or keychain is reset specifically)
 */
export function resetBootedIOSKeychain({ strict = false }: { strict?: boolean } = {}) {
  if (!driver.isIOS) return;

  let udid = '';
  try {
    udid =
      (driver.capabilities as Record<string, unknown>)['appium:udid']?.toString() ??
      (driver.capabilities as Record<string, unknown>).udid?.toString() ??
      (driver.capabilities as Record<string, unknown>).deviceUDID?.toString() ??
      process.env.SIMULATOR_UDID ??
      '';
  } catch {
    // A strict reset below rejects an unresolved device.
  }

  if (udid === 'auto') udid = process.env.SIMULATOR_UDID ?? '';

  if (strict) {
    if (!/^[0-9a-f-]{36}$/i.test(udid)) {
      throw new Error(
        'Clean migration requires an explicit iOS simulator UDID to reset its keychain.'
      );
    }
    execFileSync('xcrun', ['simctl', 'keychain', udid, 'reset'], { stdio: 'pipe' });
    console.info(`→ Reset iOS simulator keychain for ${udid}`);
    return;
  }

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
