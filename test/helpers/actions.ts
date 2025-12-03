import type { ChainablePromiseElement } from 'webdriverio';
import { reinstallApp } from './setup';
import BitcoinJsonRpc from 'bitcoin-json-rpc';

export const sleep = (ms: number) => browser.pause(ms);

/**
 * Retrieves the most reliable accessibility text/value from an element across platforms.
 * Some Appium drivers expose either `contentDescription`, `content-desc`, `label`, or `name`.
 */
export async function getAccessibleText(element: ChainablePromiseElement): Promise<string> {
  const candidates = driver.isAndroid
    ? ['contentDescription', 'content-desc', 'name', 'text']
    : ['label', 'value', 'name', 'text'];

  for (const attribute of candidates) {
    try {
      const value = await element.getAttribute(attribute);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    } catch {
      console.debug(`Attribute "${attribute}" not found on element.`);
    }
  }

  return '';
}

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

type RetrieveStrategy = 'exact' | 'contains';
export function elementByText(
  text: string,
  strategy: RetrieveStrategy = 'contains'
): ChainablePromiseElement {
  if (driver.isAndroid) {
    if (strategy === 'exact') {
      return $(`android=new UiSelector().text("${text}")`);
    }
    return $(`android=new UiSelector().textContains("${text}")`);
  } else {
    if (strategy === 'exact') {
      return $(
        `-ios predicate string:(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND (label == "${text}" OR value == "${text}")`
      );
    }
    return $(
      `-ios predicate string:(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND label CONTAINS "${text}"`
    );
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

/**
 * Verifies that text is visible or hidden on the screen.
 * This is a cross-platform helper that works on both Android and iOS.
 *
 * @param text - The text string to search for
 * @param options - Configuration options
 * @param options.visible - Whether the text should be visible (default: true)
 * @param options.strategy - How to match the text: 'exact' for exact match, 'contains' for partial match (default: 'exact')
 *
 * @example
 * // Check that "Send" button text is visible
 * await expectText('Send');
 *
 * @example
 * // Check that error message is NOT visible
 * await expectText('Error occurred', { visible: false });
 *
 * @example
 * // Check for partial text match
 * await expectText('Transaction', { strategy: 'contains' });
 */
export async function expectText(
  text: string,
  { visible = true, strategy = 'exact' }: { visible?: boolean; strategy?: RetrieveStrategy } = {}
) {
  const el = await elementByText(text, strategy);
  if (!visible) {
    await el.waitForDisplayed({ reverse: true });
    return;
  }
  await el.waitForDisplayed();
}

/**
 * Verifies that text is visible or hidden within a specific container element.
 * This is useful when you need to check for text within a specific UI component
 * to avoid false positives from similar text elsewhere on the screen.
 *
 * @param ancestorId - The resource-id or accessibility ID of the container element
 * @param text - The text string to search for within the container
 * @param options - Configuration options
 * @param options.visible - Whether the text should be visible (default: true)
 * @param options.timeout - Maximum time to wait for the element in milliseconds (default: 30000)
 *
 * @example
 * // Check that "Confirm" text is visible within a modal
 * await expectTextWithin('ModalContainer', 'Confirm');
 *
 * @example
 * // Check that error message is NOT visible within a form
 * await expectTextWithin('FormContainer', 'Invalid input', { visible: false });
 *
 * @example
 * // Use custom timeout for slow-loading content
 * await expectTextWithin('LoadingContainer', 'Processing...', { timeout: 60000 });
 */
export async function expectTextWithin(
  ancestorId: string,
  text: string,
  { visible = true, timeout = 30_000 }: { visible?: boolean; timeout?: number } = {}
) {
  const parent = elementById(ancestorId);
  await parent.waitForDisplayed();

  if (driver.isIOS) {
    const parentLabel = await parent.getAttribute('label');
    const parentValue = await parent.getAttribute('value');
    const matchesParent =
      (typeof parentLabel === 'string' && parentLabel.includes(text)) ||
      (typeof parentValue === 'string' && parentValue.includes(text));

    if (matchesParent) {
      if (!visible) {
        await parent.waitForDisplayed({ reverse: true, timeout });
      }
      return;
    }
  }

  const needle = driver.isAndroid
    ? `.//*[contains(@text,'${text}')]`
    : `.//*[self::XCUIElementTypeStaticText or self::XCUIElementTypeTextView or self::XCUIElementTypeTextField][contains(@label,'${text}') or contains(@value,'${text}')]`;

  if (!visible) {
    await parent.$(needle).waitForDisplayed({ reverse: true, timeout });
  } else {
    await parent.$(needle).waitForDisplayed({ timeout });
  }
}

type Index = number | 'first' | 'last';
/**
 * Get text from a descendant text element under a container.
 * @param containerId Resource-id / accessibility ID of the container
 * @param index Which match to pick: 0-based index, 'first', or 'last' (default)
 */
export async function getTextUnder(containerId: string, index: Index = 'last'): Promise<string> {
  const container = await elementById(containerId);
  await container.waitForDisplayed();

  let textEls: ChainablePromiseArray;

  if (driver.isAndroid) {
    // All descendants under the container containing a text attribute
    textEls = await container.$$('.//*[@text]');
  } else {
    // All XCUIElementTypeStaticText descendants under the container
    textEls = await container.$$('.//XCUIElementTypeStaticText');
  }

  if (!textEls.length) {
    throw new Error(`No text elements found under container "${containerId}"`);
  }

  let idx: number;
  if (index === 'first') {
    idx = 0;
  } else if (index === 'last') {
    idx = (await textEls.length) - 1;
  } else {
    idx = Math.max(0, Math.min(index, (await textEls.length) - 1));
  }

  const el = textEls[idx];
  return el.getText();
}

export async function tap(testId: string) {
  const el = await elementById(testId);
  await el.waitForDisplayed();
  await sleep(100); // Allow time for the element to settle
  await el.click();
  await sleep(50);
}

export async function multiTap(testId: string, count: number) {
  await elementById(testId).waitForDisplayed();
  await sleep(300); // Allow time for the element to settle
  for (let i = 1; i <= count; i++) {
    await tap(testId);
    await sleep(300);
  }
}

async function pasteIOSText(testId: string, text: string) {
  if (!driver.isIOS) {
    throw new Error('pasteIOSText can only be used on iOS devices');
  }
  await driver.execute('mobile: setPasteboard', {
    content: text,
    encoding: 'utf8',
  });
  const el = await elementById(testId);
  await el.waitForDisplayed();
  await sleep(500); // Allow time for the element to settle
  await el.click(); // focus the field
  await sleep(200);
  await el.click(); // trigger the paste menu
  const pasteButton = await elementByText('Paste', 'exact');
  await pasteButton.waitForDisplayed();
  await pasteButton.click();
  await sleep(200); // Allow time for the paste action to propagate
}

export async function typeText(testId: string, text: string) {
  const el = await elementById(testId);
  await el.waitForDisplayed();
  await sleep(500); // Allow time for the element to settle
  await el.clearValue();
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
  await sleep(500); // Allow time for the element to settle

  const { x, y, elWidth, elHight } = await elementRect(el);
  console.debug(`Drag on element "${testId}"`);
  // console.debug({ x, y, elWidth, elHight });
  const startX = Math.round(x + elWidth * startXNorm);
  const startY = Math.round(y + elHight * startYNorm);
  // console.debug(` startX: ${startX}, startY: ${startY}`);

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
  if (driver.isAndroid) {
    try {
      await driver.hideKeyboard();
    } catch {}
  } else {
    for (const el of ['return', 'done', 'go']) {
      try {
        const elem = await elementByText(el);
        await elem.waitForDisplayed({ timeout: 2000 });
        await elem.click();
        return;
      } catch {
        // Swallow the error; keyboard might already be closed
        console.warn(`Not closing keyboard on element: ${el}`);
      }
    }
  }
}

export async function acceptAppNotificationAlert(
  button: string = 'permission_allow_button'
): Promise<void> {
  if (driver.isAndroid) {
    // Android: system permission dialog is handled via UiSelector
    try {
      await tap(`com.android.permissioncontroller:id/${button}`);
    } catch (err) {
      console.warn('⚠ Could not find or tap Android App Notification alert allow button:', err);
    }
  }
}

export async function doNavigationClose() {
  await tap('HeaderMenu');
  await tap('DrawerWallet');
}

export async function getSeed(): Promise<string> {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('BackupSettings');
  await tap('BackupWallet');

  // get seed from SeedContainer
  const seedElement = await elementById('SeedContainer');
  const seed = await getAccessibleText(seedElement);
  console.info({ seed });
  if (!seed) throw new Error('Could not read seed from "SeedContainer"');

  await tap('TapToReveal');

  // close the modal
  await swipeFullScreen('down');

  await doNavigationClose();
  return seed;
}

export async function waitForSetupWalletScreenFinish(timeout: number = 150_000) {
  // Wait until text "SETTING UP YOUR WALLET" is no longer displayed
  const settingUpWallet = await elementByText('SETTING UP\nYOUR WALLET');
  await settingUpWallet.waitForDisplayed({ reverse: true, timeout, interval: 100 });
}

export async function completeOnboarding({ isFirstTime = true } = {}) {
  // TOS and PP
  await elementById('Continue').waitForDisplayed();
  await sleep(1000); // Wait for the app to settle
  if (driver.isAndroid) {
    await tap('Check1');
    await tap('Check2');
  }
  await tap('Continue');
  await tap('SkipIntro');
  await sleep(500); // Wait for the app to settle
  await tap('NewWallet');
  await waitForSetupWalletScreenFinish();

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

export async function restoreWallet(
  seed: string,
  {
    passphrase,
    expectQuickPayTimedSheet = false,
  }: { passphrase?: string; expectQuickPayTimedSheet?: boolean } = {}
) {
  console.info('→ Restoring wallet with seed:', seed);
  // Let cloud state flush - carried over from Detox
  await sleep(5000);

  // Reinstall app to wipe all data
  await reinstallApp();

  // Terms of service
  await elementById('Continue').waitForDisplayed();
  await sleep(1000); // Wait for the app to settle
  if (driver.isAndroid) {
    await tap('Check1');
    await tap('Check2');
  }
  await tap('Continue');

  // Skip intro
  await tap('SkipIntro');
  await tap('RestoreWallet');
  await tap('MultipleDevices-button');

  // Seed
  if (driver.isIOS) {
    await pasteIOSText('Word-0', seed);
  } else {
    await typeText('Word-0', seed);
  }
  await sleep(1500); // wait for the app to settle
  // Passphrase
  if (passphrase) {
    await tap('AdvancedButton');
    await typeText('PassphraseInput', passphrase);
    await confirmInputOnKeyboard();
  }

  // Restore wallet
  await tap('RestoreButton');
  await waitForSetupWalletScreenFinish();

  await acceptAppNotificationAlert();

  // Wait for Get Started
  const getStarted = await elementById('GetStartedButton');
  await getStarted.waitForDisplayed();
  await tap('GetStartedButton');

  if (expectQuickPayTimedSheet) {
    await dismissQuickPayIntro();
  }

  // Wait for Suggestions Label to appear
  const suggestions = await elementById('Suggestions');
  await suggestions.waitForDisplayed();
}

type addressType = 'bitcoin' | 'lightning';
export async function getReceiveAddress(which: addressType = 'bitcoin'): Promise<string> {
  await tap('Receive');
  await sleep(500);
  return getAddressFromQRCode(which);
}

export async function getAddressFromQRCode(which: addressType): Promise<string> {
  const qrCode = await elementById('QRCode');
  await qrCode.waitForDisplayed();
  let uri = '';
  const waitTimeoutMs = 15_000;
  await browser.waitUntil(
    async () => {
      uri = await getAccessibleText(qrCode);
      if (!uri) {
        return false;
      } else {
        return true;
      }
    },
    {
      timeout: waitTimeoutMs,
      interval: 300,
      timeoutMsg: `Timed out after ${waitTimeoutMs}ms waiting for QR code URI`,
    }
  );
  console.info({ uri });

  let address = '';
  if (which === 'bitcoin') {
    address = uri.replace(/^bitcoin:/, '').replace(/\?.*$/, '');
    // Accept Bech32 HRPs across networks: mainnet (bc1), testnet/signet (tb1), regtest (bcrt1)
    const allowedBitcoinHrp = ['bc1', 'tb1', 'bcrt1'];
    const addrLower = address.toLowerCase();
    if (!allowedBitcoinHrp.some((p) => addrLower.startsWith(p))) {
      throw new Error(
        `Invalid Bitcoin address HRP: ${address}. Expected one of: ${allowedBitcoinHrp.join(', ')}`
      );
    }
  } else if (which === 'lightning') {
    const query = uri.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const ln = params.get('lightning');
    if (!ln) {
      throw new Error(`No lightning invoice found in uri: ${uri}`);
    }
    // Accept BOLT11 HRPs across networks: mainnet (lnbc), testnet (lntb), signet (lntbs), regtest (lnbcrt)
    const allowedLightningHrp = ['lnbc', 'lntb', 'lntbs', 'lnbcrt'];
    const lnLower = ln.toLowerCase();
    if (!allowedLightningHrp.some((p) => lnLower.startsWith(p))) {
      throw new Error(
        `Invalid lightning invoice HRP: ${ln}. Expected one of: ${allowedLightningHrp.join(', ')}`
      );
    }
    address = ln;
  } else {
    throw new Error(`Unknown address type: ${which}`);
  }

  console.info({ address });

  return address;
}

export async function mineBlocks(rpc: BitcoinJsonRpc, blocks: number = 1) {
  for (let i = 0; i < blocks; i++) {
    await rpc.generateToAddress(1, await rpc.getNewAddress());
  }
}

export async function receiveOnchainFunds(
  rpc: BitcoinJsonRpc,
  {
    sats = 100_000,
    blocksToMine = 1,
    expectHighBalanceWarning = false,
  }: {
    sats?: number;
    blocksToMine?: number;
    expectHighBalanceWarning?: boolean;
  } = {}
) {
  // convert sats → btc string
  const btc = (sats / 100_000_000).toString();
  // format sats with spaces every 3 digits
  const formattedSats = sats.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // receive some first
  const address = await getReceiveAddress();
  await swipeFullScreen('down');
  await rpc.sendToAddress(address, btc);

  await acknowledgeReceivedPayment();

  await mineBlocks(rpc, blocksToMine);

  if (driver.isAndroid) {
    await dismissBackupTimedSheet();
    if (expectHighBalanceWarning) {
      await acknowledgeHighBalanceWarning();
    }
  }

  const moneyText = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
  await expect(moneyText).toHaveText(formattedSats);

  if (driver.isIOS) {
    await dismissBackupTimedSheet({ triggerTimedSheet: true });
    if (expectHighBalanceWarning) {
      await acknowledgeHighBalanceWarning({ triggerTimedSheet: true });
    }
  }
}

export type ToastId =
  | 'BalanceUnitSwitchedToast'
  | 'BalanceHiddenToast'
  | 'RgsUpdatedToast'
  | 'RgsErrorToast'
  | 'ElectrumErrorToast'
  | 'ElectrumUpdatedToast'
  | 'PaymentFailedToast'
  | 'ReceivedTransactionReplacedToast'
  | 'TransactionReplacedToast'
  | 'TransactionUnconfirmedToast'
  | 'TransactionRemovedToast';

export async function waitForToast(
  toastId: ToastId,
  { waitToDisappear = false, dismiss = true } = {}
) {
  await elementById(toastId).waitForDisplayed();
  if (waitToDisappear) {
    await elementById(toastId).waitForDisplayed({ reverse: true });
    return;
  }
  if (dismiss) {
    await dragOnElement(toastId, 'up', 0.2);
  }
}

/** Acknowledges the received payment notification by tapping the button.
 */
export async function acknowledgeReceivedPayment() {
  await elementById('ReceivedTransaction').waitForDisplayed();
  await tap('ReceivedTransactionButton');
  await sleep(300);
}

/**
 * Triggers the timed backup sheet by navigating to settings and back.
 * Since timed sheets are sometimes triggered by user behavior (when user goes back to home screen),
 * we need to trigger them manually.
 *
 * @example
 * // Trigger backup sheet before testing dismissal
 * await doTriggerTimedSheet();
 */
export async function doTriggerTimedSheet() {
  await sleep(700); // wait for any previous animations to finish
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await sleep(500); // wait for the app to settle
  await doNavigationClose();
}

export async function dismissBackgroundPaymentsTimedSheet({
  triggerTimedSheet = false,
}: { triggerTimedSheet?: boolean } = {}) {
  if (triggerTimedSheet) {
    await doTriggerTimedSheet();
  }
  await elementById('BackgroundPaymentsDescription').waitForDisplayed();
  await sleep(500); // wait for the app to settle
  await tap('BackgroundPaymentsCancel');
  await sleep(500);
}

/**
 * Dismisses the backup reminder sheet.
 * This sheet is triggered by first onchain balance change.
 *
 * @param options - Configuration options
 * @param options.triggerTimedSheet - Whether to trigger the sheet first (default: false)
 *
 * @example
 * // Dismiss existing backup sheet
 * await dismissBackupTimedSheet();
 *
 * @example
 * // Trigger and then dismiss backup sheet
 * await dismissBackupTimedSheet({ triggerTimedSheet: true });
 */
export async function dismissBackupTimedSheet({
  triggerTimedSheet = false,
}: { triggerTimedSheet?: boolean } = {}) {
  if (triggerTimedSheet) {
    await doTriggerTimedSheet();
  }
  await elementById('BackupIntroViewDescription').waitForDisplayed();
  await sleep(500); // wait for the app to settle
  await swipeFullScreen('down');
  await sleep(500);
}

/**
 * Dismisses the QuickPay introduction modal t.
 * This sheet is triggered by first lightning balance change.
 *
 * @param options - Configuration options
 * @param options.triggerTimedSheet - Whether to trigger the backup sheet first (default: false)
 *
 * @example
 * // Dismiss existing QuickPay intro
 * await dismissQuickPayIntro();
 *
 * @example
 * // Trigger backup sheet and then dismiss QuickPay intro
 * await dismissQuickPayIntro({ triggerTimedSheet: true });
 */
export async function dismissQuickPayIntro({
  triggerTimedSheet = false,
}: { triggerTimedSheet?: boolean } = {}) {
  if (triggerTimedSheet) {
    await doTriggerTimedSheet();
  }

  if (driver.isAndroid) {
    // TODO: it's temp, change on Android to match iOS testID
    await elementById('QuickpayIntro-button').waitForDisplayed();
    await sleep(500); // wait for the app to settle
    await swipeFullScreen('down');
    await sleep(500);
  } else {
    await elementById('QuickpayIntroDescription').waitForDisplayed();
    await sleep(500); // wait for the app to settle
    await tap('QuickpayIntroCancel');
    await sleep(500);
  }
}

/**
 * Acknowledges the high balance warning that appears when wallet balance exceeds a threshold (>$500).
 * This sheet is triggered by onchain balance change if it exceeds a threshold.
 *
 * @param options - Configuration options
 * @param options.triggerTimedSheet - Whether to trigger the backup sheet first (default: false)
 *
 * @example
 * // Acknowledge existing high balance warning
 * await acknowledgeHighBalanceWarning();
 *
 * @example
 * // Trigger backup sheet and then acknowledge high balance warning
 * await acknowledgeHighBalanceWarning({ triggerTimedSheet: true });
 */
export async function acknowledgeHighBalanceWarning({
  triggerTimedSheet = false,
}: { triggerTimedSheet?: boolean } = {}) {
  if (triggerTimedSheet) {
    await doTriggerTimedSheet();
  }
  await elementById('HighBalanceSheetDescription').waitForDisplayed();
  await tap('HighBalanceSheetContinue');
  await elementById('HighBalanceSheetDescription').waitForDisplayed({ reverse: true });
  await sleep(500);
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
  await doNavigationClose();
}

export async function typeAddressAndVerifyContinue({
  address,
  reverse = false,
}: {
  address: string;
  reverse?: boolean;
}) {
  await typeText('RecipientInput', address);
  await confirmInputOnKeyboard();
  await sleep(1000);
  await elementById('AddressContinue').waitForEnabled({ reverse });
}

export async function enterAddress(address: string) {
  await tap('Send');
  await sleep(700);
  await tap('RecipientManual');
  await typeAddressAndVerifyContinue({ address });
  await tap('AddressContinue');
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

export async function attemptRefreshOnHomeScreen() {
  await swipeFullScreen('down');
  await sleep(2000); // wait for the app to settle
  await dragOnElement('ActivitySavings', 'down', 0.8);
  await sleep(2000); // wait for the app to settle
}

export async function waitForBackup() {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('BackupSettings');
  await elementById('AllSynced').waitForDisplayed();
  await doNavigationClose();
}

type alertAction = 'confirm' | 'cancel';
export async function handleCommonAlert(
  action: alertAction = 'confirm',
  androidId: string,
  iosText: string
) {
  if (driver.isAndroid) {
    await elementById(androidId).waitForDisplayed();
  } else {
    // iOS alert is system modal
    // check if alert text includes iosText
    await driver.waitUntil(
      async () => {
        try {
          const alertText = await driver.getAlertText();
          return alertText.includes(iosText);
        } catch {
          return false;
        }
      },
      {
        timeout: 10_000,
        interval: 300,
        timeoutMsg: `Timed out waiting for alert with text: ${iosText}`,
      }
    );
  }

  if (action === 'confirm') {
    if (driver.isAndroid) {
      await tap('DialogConfirm');
    } else {
      await driver.acceptAlert();
    }
  } else {
    if (driver.isAndroid) {
      await tap('DialogCancel');
    } else {
      await driver.dismissAlert();
    }
  }
}

// sending over 50% of balance warning
export async function handleOver50PercentAlert(action: alertAction = 'confirm') {
  await handleCommonAlert(action, 'SendDialog2', 'over 50%');
}

// sending over $100 warning
export async function handleOver100Alert(action: alertAction = 'confirm') {
  await handleCommonAlert(action, 'SendDialog1', 'over $100');
}
