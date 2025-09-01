import type { ChainablePromiseElement } from 'webdriverio';
import { reinstallApp } from './setup';

export const sleep = (ms: number) => browser.pause(ms);

/**
 * Returns an element selector compatible with both Android and iOS.
 * - Android: uses resource-id
 * - iOS: uses accessibility ID
 */
export function elementById(selector: string): ChainablePromiseElement {
  if (driver.isAndroid) {
    return $(`android=new UiSelector().resourceId("${selector}")`);
  } else {
    return $(`~${selector}`);
  }
}

// Find a child testID within an ancestor testID (compatible with both Android and iOS.)
export async function elementByIdWithin(
  ancestorId: string,
  childId: string
): Promise<ChainablePromiseElement> {
  if (driver.isIOS) {
    const parent = await elementById(ancestorId); // reuses iOS path
    await parent.waitForExist();
    return parent.$(`~${childId}`);
  } else {
    // Android
    return $(
      `android=new UiSelector()` +
        `.resourceId("${ancestorId}")` +
        `.childSelector(new UiSelector().resourceId("${childId}"))`
    );
  }
}

/**
 * Returns all matching elements for a selector, compatible with both Android and iOS.
 * - Android: uses resource-id
 * - iOS: uses accessibility ID
 */
export function elementsById(selector: string): ChainablePromiseArray {
  if (driver.isAndroid) {
    return $$(`android=new UiSelector().resourceId("${selector}")`);
  } else {
    return $$(`~${selector}`);
  }
}

export function elementByText(text: string): ChainablePromiseElement {
  if (driver.isAndroid) {
    return $(`android=new UiSelector().text("${text}")`);
  } else {
    return $(`-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "${text}"`);
  }
}

export async function elementsByText(text: string, timeout = 8000): Promise<ChainablePromiseArray> {
  const sel = driver.isAndroid
    ? `android=new UiSelector().text("${text}")`
    : `-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "${text}"`;

  await browser.waitUntil(async () => (await (await $$(sel)).length) > 1, {
    timeout,
    interval: 200,
    timeoutMsg: `Expected > 1 "${text}" elements`,
  });

  return $$(sel);
}

export async function expectTextVisible(text: string) {
  const el = await elementByText(text);
  await el.waitForDisplayed({ timeout: 5000 });
}

export async function expectTextWithin(ancestorId: string, text: string) {
  const parent = elementById(ancestorId);
  await parent.waitForDisplayed();

  const needle = driver.isAndroid
    ? `.//*[@text='${text}']`
    : `.//XCUIElementTypeStaticText[@label='${text}' or @value='${text}']`;

  await expect(parent.$(needle)).toExist();
}

export async function tap(testId: string) {
  const el = await elementById(testId);
  await el.waitForDisplayed();
  await sleep(100); // Allow time for the element to settle
  await el.click();
  await sleep(50);
}

export async function typeText(testId: string, text: string) {
  const el = await elementById(testId);
  await el.waitForDisplayed();
  await sleep(500); // Allow time for the element to settle
  await el.setValue(text);
}

type Direction = 'left' | 'right' | 'up' | 'down';

export async function swipeFullScreen(direction: Direction) {
  const { width, height } = await driver.getWindowSize();

  let startX = width / 2;
  let startY = height / 2;
  let endX = startX;
  let endY = startY;

  switch (direction) {
    case 'left':
      startX = width * 0.8;
      endX = width * 0.2;
      break;
    case 'right':
      startX = width * 0.2;
      endX = width * 0.8;
      break;
    case 'up':
      startY = height * 0.8;
      endY = height * 0.2;
      break;
    case 'down':
      startY = height * 0.2;
      endY = height * 0.8;
      break;
  }

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerMove', duration: 200, x: endX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await sleep(500); // Allow time for the swipe to complete
}

async function elementRect(el: ChainablePromiseElement) {
  const e = await el;
  const [loc, size] = await Promise.all([e.getLocation(), e.getSize()]);
  return {
    x: Math.round(loc.x),
    y: Math.round(loc.y),
    elWidth: Math.round(size.width),
    elHight: Math.round(size.height),
  };
}

export async function dragOnElement(
  testId: string,
  direction: Direction = 'right',
  percent = 0.9, // how far to drag across the screen
  startXNorm = 0.5, // horizontal center
  startYNorm = 0.5, // vertical center
  durationMs = 500, // drag duration
  holdMs = 120 // slight hold before moving
) {
  const el = elementById(testId);
  await el.waitForDisplayed();
  await sleep(200); // Allow time for the element to settle

  const { x, y, elWidth, elHight } = await elementRect(el);
  console.info(`Drag on element "${testId}"`);
  console.info({ x, y, elWidth, elHight });
  const startX = Math.round(x + elWidth * startXNorm);
  const startY = Math.round(y + elHight * startYNorm);
  console.info(` startX: ${startX}, startY: ${startY}`);

  const { width, height } = await driver.getWindowSize();
  const dx = Math.round(width * percent);
  const dy = Math.round(height * percent);

  let endX = startX;
  let endY = startY;

  switch (direction) {
    case 'right':
      endX = startX + dx;
      break;
    case 'left':
      endX = startX - dx;
      break;
    case 'down':
      endY = startY + dy;
      break;
    case 'up':
      endY = startY - dy;
      break;
  }

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: holdMs },
        { type: 'pointerMove', duration: durationMs, x: endX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

export async function confirmInputOnKeyboard() {
  try {
    await driver.hideKeyboard();
  } catch {
    // ignore if keyboard not open
  }
}

export async function acceptAppNotificationAlert(button:string = 'permission_allow_button'): Promise<void> {
  if (driver.isAndroid) {
    // Android: system permission dialog is handled via UiSelector
    try {
      await tap('com.android.permissioncontroller:id/' + button);
    } catch (err) {
      console.warn('⚠ Could not find or tap Android App Notification alert allow button:', err);
    }
  } else {
    // iOS: handled as system alert
    try {
      await driver.acceptAlert();
    } catch (err) {
      console.warn('⚠ No iOS App Notification alert to accept or failed to accept:', err);
    }
  }
}

export async function getSeed(): Promise<string> {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('BackupSettings');
  await tap('BackupWallet');

  // get seed from SeedContainer
  const seedElement = await elementById('SeedContainer');
  const attr = driver.isAndroid ? 'contentDescription' : 'label';
  const seed = await seedElement.getAttribute(attr);
  console.info({ seed });

  await tap('TapToReveal');

  // close the modal
  await swipeFullScreen('down');

  await tap('NavigationClose');

  return seed;
}

export async function restoreWallet(seed: string, passphrase?: string) {
  console.info('→ Restoring wallet with seed:', seed);
  // Let cloud state flush - carried over from Detox
  await sleep(5000);

  // Reinstall app to wipe all data
  await reinstallApp();

  // Terms of service
  await elementById('Check1').waitForDisplayed();
  await sleep(1000); // Wait for the app to settle
  await tap('Check1');
  await tap('Check2');
  await tap('Continue');

  // Skip intro
  await tap('SkipIntro');
  await tap('RestoreWallet');
  await tap('MultipleDevices-button');

  // Seed
  await typeText('Word-0', seed);

  await elementById('WordIndex-4');

  // Passphrase
  if (passphrase) {
    await tap('AdvancedButton');
    await typeText('PassphraseInput', passphrase);
    await confirmInputOnKeyboard();
  }

  // Restore wallet
  await tap('RestoreButton');
  // Wait until text "SETTING UP YOUR WALLET" is no longer displayed
  const settingUpWallet = await elementByText('SETTING UP\nYOUR WALLET');
  await settingUpWallet.waitForDisplayed({ reverse: true, timeout: 300_000, interval: 100 }); // 5 minutes

  await acceptAppNotificationAlert();

  // Wait for Get Started
  const getStarted = await elementById('GetStartedButton');
  await getStarted.waitForDisplayed();
  await tap('GetStartedButton');

  // Wait for Suggestions Label to appear
  const suggestions = await elementById('Suggestions');
  await suggestions.waitForDisplayed();
}

export async function getReceiveAddress(): Promise<string> {
  await tap('Receive');

  const qrCode = await elementById('QRCode');
  await qrCode.waitForDisplayed();

  const attr = driver.isAndroid ? 'contentDescription' : 'label';
  const uri = await qrCode.getAttribute(attr);
  const address = uri.replace(/^bitcoin:/, '').replace(/\?.*$/, '');
  console.info({ address });

  return address;
}

export async function completeOnboarding({ isFirstTime = true } = {}) {
  // TOS and PP
  await elementById('Check1').waitForDisplayed();
  await sleep(1000); // Wait for the app to settle
  await tap('Check1');
  await tap('Check2');
  await tap('Continue');
  await tap('SkipIntro');
  await sleep(500); // Wait for the app to settle
  await tap('NewWallet');

  if (isFirstTime) {
    await acceptAppNotificationAlert();
  }

  // Wait for wallet to be created
  for (let i = 1; i <= 3; i++) {
    try {
      await tap('WalletOnboardingClose');
      break;
    } catch {
      if (i === 3) throw new Error('Tapping "WalletOnboardingClose" timeout');
    }
  }
}

// enable/disable widgets in settings
export async function toggleWidgets() {
  await sleep(3000);
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('GeneralSettings');
  await tap('WidgetsSettings');
  const widgets = await elementsByText('Widgets');
  await widgets[1].click();
  await tap('NavigationClose');
}

export async function deleteAllDefaultWidgets() {
  await tap('WidgetsEdit');
  for (const w of ['Bitcoin Price', 'Bitcoin Blocks', 'Bitcoin Headlines']) {
    tap(w + '_WidgetActionDelete');
    await elementByText('Yes, Delete').waitForDisplayed();
    await elementByText('Yes, Delete').click();
    await elementById(w).waitForDisplayed({ reverse: true, timeout: 5000 });
    await sleep(500);
  }
  await tap('WidgetsEdit');
  await elementById('PriceWidget').waitForDisplayed({ reverse: true });
  await elementById('NewsWidget').waitForDisplayed({ reverse: true });
  await elementById('BlocksWidget').waitForDisplayed({ reverse: true });
}

export async function waitForBackup() {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('BackupSettings');
  const allSynced = await elementById('AllSynced');
  await allSynced.waitForDisplayed();
  await tap('NavigationClose');
}
