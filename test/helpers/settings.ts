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
