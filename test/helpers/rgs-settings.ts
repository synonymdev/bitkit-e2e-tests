import { elementById, tap, waitForToast } from './actions';

/** Observe success while it is visible, before XCTest's post-click idle wait consumes it. */
export async function applyRgsSetting(action: 'ConnectToHost' | 'ResetToDefault') {
  const cached = driver.isIOS ? await driver.getSettings() : undefined;
  const capabilities = driver.capabilities as {
    'appium:waitForIdleTimeout'?: number;
    waitForIdleTimeout?: number;
  };
  // XCUITest's cache omits WDA defaults until settings are explicitly updated.
  // Initialize missing values with the session capability or documented defaults
  // (10 s idle / 2 s animation), so finally can restore real numeric values.
  const previous = cached
    ? {
        waitForIdleTimeout:
          cached.waitForIdleTimeout ??
          capabilities?.['appium:waitForIdleTimeout'] ??
          capabilities?.waitForIdleTimeout ??
          10,
        animationCoolOffTimeout: cached.animationCoolOffTimeout ?? 2,
      }
    : undefined;
  try {
    if (previous) {
      if (cached?.waitForIdleTimeout == null || cached?.animationCoolOffTimeout == null) {
        await driver.updateSettings(previous);
      }
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
