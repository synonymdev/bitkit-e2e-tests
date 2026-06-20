import { elementById, tap, sleep } from './actions';

export type SettingsTab = 'general' | 'security' | 'advanced';

/**
 * Opens the Settings screen at the given tab.
 * General is the default tab so no extra tap is needed for it.
 */
export async function openSettings(tab: SettingsTab = 'general') {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await sleep(500);
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
  await sleep(500);
}

/**
 * Opens Dev Settings from the Advanced settings tab.
 */
export async function openDevSettings() {
  await openSettings('advanced');
  await elementById('DevSettings').waitForDisplayed();
  await tap('DevSettings');
  await sleep(500);
}

/**
 * Opens the Contacts entry from the drawer menu.
 */
export async function openContacts() {
  await tap('HeaderMenu');
  await tap('DrawerContacts');
  await sleep(500);
}

/**
 * Opens the Profile entry from the drawer menu.
 */
export async function openProfile() {
  await tap('HeaderMenu');
  await tap('DrawerProfile');
  await sleep(500);
}

/**
 * Opens the Home widgets page from the drawer.
 * On first use, the app shows the widgets intro screen; choose the
 * View & Organize action to land on the widgets page.
 */
export async function openHomeWidgets() {
  await tap('HeaderMenu');
  await tap('DrawerWidgets');
  await tapWidgetsIntroViewOrganizeIfShown();
  await elementById('SuggestionsWidget').waitForDisplayed({ timeout: 30_000 });
}

/**
 * Closes the drawer and navigates back to the Wallet home screen.
 */
export async function doNavigationClose() {
  await sleep(500);
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

async function tapWidgetsIntroViewOrganizeIfShown() {
  const viewOrganize = elementById('WidgetsOnboardingViewOrganize');
  try {
    await viewOrganize.waitForDisplayed({ timeout: 3_000 });
    await sleep(500);
    await viewOrganize.click();
    await sleep(500);
  } catch {
    // Widgets intro is shown only once.
  }
}
