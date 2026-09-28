import { elementById, elementByText, sleep, swipeFullScreen, tap, waitForToast } from './actions';
import { doNavigationClose, openDevSettings } from './navigation';

const PAYKIT_UI_TOGGLE_ID = 'PaykitUiToggle';

async function scrollToPaykitToggle() {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (
      await elementById(PAYKIT_UI_TOGGLE_ID)
        .isDisplayed()
        .catch(() => false)
    ) {
      return;
    }
    await swipeFullScreen('up');
    await sleep(300);
  }
  await elementById(PAYKIT_UI_TOGGLE_ID).waitForDisplayed();
}

async function isPaykitUiToggleOn() {
  await scrollToPaykitToggle();
  const toggle = elementById(PAYKIT_UI_TOGGLE_ID);
  const state = driver.isIOS
    ? await toggle.getAttribute('value')
    : await toggle.getAttribute('checked');
  return state === '1' || state === 'true';
}

async function tapPaykitUiToggle() {
  await scrollToPaykitToggle();
  await tap(PAYKIT_UI_TOGGLE_ID);
}

async function confirmPaykitUiEnableDialogIfPresent() {
  const enableButton = elementByText('Enable', 'exact');
  if (await enableButton.isDisplayed().catch(() => false)) {
    await enableButton.click();
    await sleep(500);
  }
}

async function leaveDevSettings() {
  await tap('NavigationBack');
  await doNavigationClose();
}

// Paykit UI is on by default; the helpers only tap the Dev Settings switch when it is in the other state.
export async function enablePaykitUi() {
  await elementById('TotalBalance-primary').waitForDisplayed({ timeout: 60_000 });
  await openDevSettings();
  if (await isPaykitUiToggleOn()) {
    await leaveDevSettings();
    return;
  }
  await tapPaykitUiToggle();
  await confirmPaykitUiEnableDialogIfPresent();
  try {
    await waitForToast('PaykitUiEnabledToast', { waitToDisappear: driver.isIOS, timeout: 15_000 });
  } catch (error) {
    console.info('→ PaykitUiEnabledToast not shown (already hidden or skipped)', error);
  }
  await leaveDevSettings();
}

export async function disablePaykitUi() {
  await openDevSettings();
  if (!(await isPaykitUiToggleOn())) {
    await leaveDevSettings();
    return;
  }
  await tapPaykitUiToggle();
  await waitForToast('PaykitUiDisabledToast', { waitToDisappear: driver.isIOS });
  await leaveDevSettings();
}

export async function setPaykitUiEnabled(enabled: boolean) {
  if (enabled) {
    await enablePaykitUi();
  } else {
    await disablePaykitUi();
  }
}
