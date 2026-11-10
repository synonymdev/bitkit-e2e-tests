import { elementById, tap, waitForToast } from './actions';

/** Observe success while it is visible, before XCTest's post-click idle wait consumes it. */
export async function applyRgsSetting(action: 'ConnectToHost' | 'ResetToDefault') {
  const previous = driver.isIOS ? await driver.getSettings() : undefined;
  try {
    if (previous) {
      await driver.updateSettings({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0 });
    }
    await tap(action);
    // Android Reset edits the form; iOS Reset also reconnects.
    if (driver.isAndroid && action === 'ResetToDefault') {
      await elementById('ConnectToHost').waitForEnabled();
      await tap('ConnectToHost');
    }
    await waitForToast('RgsUpdatedToast', { waitToDisappear: driver.isIOS });
  } finally {
    if (previous) {
      await driver.updateSettings({
        waitForIdleTimeout: previous.waitForIdleTimeout,
        animationCoolOffTimeout: previous.animationCoolOffTimeout,
      });
    }
  }
}
