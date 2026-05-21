import { elementById, elementByText, sleep, swipeFullScreen, tap, waitForToast } from './actions';
import { doNavigationClose, openDevSettings } from './navigation';

const PAYKIT_UI_TOGGLE_ID = 'PaykitUiToggle';

async function scrollToPaykitToggle() {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await elementById(PAYKIT_UI_TOGGLE_ID).isDisplayed().catch(() => false)) {
      return;
    }
    await swipeFullScreen('up');
    await sleep(300);
  }
  await elementById(PAYKIT_UI_TOGGLE_ID).waitForDisplayed();
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

export async function enablePaykitUi() {
  await openDevSettings();
  await tapPaykitUiToggle();
  await confirmPaykitUiEnableDialogIfPresent();
  await waitForToast('PaykitUiEnabledToast', { waitToDisappear: driver.isIOS });
  await leaveDevSettings();
}

export async function disablePaykitUi() {
  await openDevSettings();
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
