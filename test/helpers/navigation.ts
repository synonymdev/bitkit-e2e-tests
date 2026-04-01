import { tap, sleep } from './actions';

export type SettingsTab = 'general' | 'security' | 'advanced';

/**
 * Opens the Settings screen at the given tab.
 * General is the default tab so no extra tap is needed for it.
 */
export async function openSettings(tab: SettingsTab = 'general') {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  if (tab !== 'general') {
    await tap(`Tab-${tab}`);
    await sleep(300);
  }
}

/**
 * Opens the Support screen from the drawer menu.
 */
export async function openSupport() {
  await tap('HeaderMenu');
  await tap('DrawerSupport');
}

/**
 * Closes the drawer and navigates back to the Wallet home screen.
 */
export async function doNavigationClose() {
  await tap('HeaderMenu');
  await tap('DrawerWallet');
  await sleep(500);
}

/**
 * Triggers the timed backup sheet by navigating to settings and back.
 * Since timed sheets are sometimes triggered by user behavior (when user goes back to home screen),
 * we need to trigger them manually.
 */
export async function doTriggerTimedSheet() {
  await sleep(700);
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await sleep(500);
  await doNavigationClose();
}
