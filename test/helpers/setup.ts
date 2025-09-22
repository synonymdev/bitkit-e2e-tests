import path from 'node:path';
import fs from 'node:fs';
import { elementsById, sleep, tap } from './actions';
import { getAppId, getAppPath } from './constants';

const LOCK_PATH = '/tmp/lock/';

export function checkComplete(name: Array<string>): boolean {
  if (!process.env.CI) {
    return false;
  }

  for (const n of name) {
    if (!fs.existsSync(path.join(LOCK_PATH, `lock-${n}`))) {
      return false;
    }
  }

  console.warn('skipping', name, 'as it previously passed on CI');
  return true;
}

export function markComplete(name: string) {
  if (!process.env.CI) {
    return;
  }

  fs.mkdirSync(LOCK_PATH, { recursive: true });
  fs.writeFileSync(path.join(LOCK_PATH, `lock-${name}`), '1');
}

export async function launchFreshApp({ tryHandleAlert = true } = {}) {
  const appId = getAppId();

  await driver.terminateApp(appId);
  await driver.activateApp(appId);
  // workaround to get rid of "Bitkit is running in background" alert
  if (tryHandleAlert) {
    await sleep(1000);
    try {
      await tapBalanceToReset();
    } catch {
      await tapBalanceToReset();
    }
  }
  await sleep(500);
}

async function tapBalanceToReset() {
  await tap('TotalBalance');
  const moneyFiatSymbols = await elementsById('MoneyFiatSymbol');
  moneyFiatSymbols[0].waitForDisplayed();
  moneyFiatSymbols[1].waitForDisplayed();
  if ((await moneyFiatSymbols[1].getText()) !== '₿') {
    await tap('TotalBalance');
  }
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
