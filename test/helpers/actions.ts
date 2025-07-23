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

export const elementById = (testId: string) => select(testId);

export const tap = async (testId: string) => {
  const el = await elementById(testId);
  await el.click();
};

export const typeText = async (testId: string, text: string) => {
  const el = await elementById(testId);
  await el.setValue(text);
};

export async function swipeFullScreen(direction: 'left' | 'right') {
  const { width, height } = await driver.getWindowSize();

  const y = height / 2;
  const startX = direction === 'left' ? width * 0.8 : width * 0.2;
  const endX = direction === 'left' ? width * 0.2 : width * 0.8;

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerMove', duration: 50, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
}
