import type { ChainablePromiseElement } from 'webdriverio';

/**
 * Returns an element selector compatible with both Android and iOS.
 * - Android: uses resource-id
 * - iOS: uses accessibility ID
 */
export function select(selector: string): ChainablePromiseElement {
  if (driver.isAndroid) {
    return $(`android=new UiSelector().resourceId("${selector}")`);
  } else {
    return $(`~${selector}`);
  }
}

/**
 * Returns all matching elements for a selector, compatible with both Android and iOS.
 * - Android: uses resource-id
 * - iOS: uses accessibility ID
 */
export function selectAll(selector: string): ChainablePromiseArray {
  if (driver.isAndroid) {
    return $$(`android=new UiSelector().resourceId("${selector}")`);
  } else {
    return $$(`~${selector}`);
  }
}

export const elementById = (testId: string) => select(testId);

export const tap = async (testId: string) => {
  const el = await elementById(testId);
  await el.waitForDisplayed({ timeout: 5000 });
  await el.click();
};

export const typeText = async (testId: string, text: string) => {
  const el = await elementById(testId);
  await el.setValue(text);
};

export async function swipeFullScreen(
  direction: 'left' | 'right' | 'up' | 'down'
) {
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
}


export const getSeed = async (): Promise<string> => {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('BackupSettings');
  await tap('BackupWallet');


  await tap('TapToReveal');

  // get seed from SeedContaider
  const seedElement = await elementById('SeedContaider');
  const attr = driver.isAndroid ? 'contentDescription' : 'label';
  const seed = await seedElement.getAttribute(attr);
  console.info({ seed });

  // close the modal
  swipeFullScreen('down');

  await tap('NavigationClose');

  return seed;
};