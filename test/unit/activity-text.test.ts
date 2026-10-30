import test from 'node:test';
import assert from 'node:assert/strict';
import { expectTextWithin } from '../helpers/actions.ts';

function changingRow({ isAndroid = false, missing = false, removing = false } = {}) {
  const original = { label: '', children: removing ? ['9 000'] : ['1 000'] };
  let current = original;
  let queries = 0;
  const waitUntil = async (probe: () => Promise<boolean>) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await probe()) return;
      if (removing) {
        original.children = [];
      } else {
        current = missing
          ? { label: '9 0000', children: [] }
          : isAndroid
            ? { label: '', children: ['Transfer + 9 000'] }
            : { label: '9 000', children: [] };
      }
    }
    throw new Error('Text did not appear before the timeout');
  };
  const select = () => {
    queries++;
    const row = current;
    return {
      isDisplayed: async () => true,
      waitForDisplayed: async () => {},
      getAttribute: async (attribute: string) => (attribute === 'label' ? row.label : null),
      $: () => ({
        isDisplayed: async () => row.children.some((text) => text.includes('9 000')),
        waitForDisplayed: async ({ reverse = false } = {}) =>
          waitUntil(async () => row.children.some((text) => text.includes('9 000')) !== reverse),
      }),
    };
  };
  return {
    $: select,
    browser: { waitUntil },
    driver: { isAndroid, isIOS: !isAndroid },
    queries: () => queries,
  };
}

for (const isAndroid of [false, true]) {
  test(`${isAndroid ? 'Android' : 'iOS'}: follows the row currently holding the activity identifier`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = changingRow({ isAndroid });
    Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
    t.after(() => Object.assign(globalThis, previous));

    await expectTextWithin('ActivityShort-0', '9 000', {
      strategy: isAndroid ? 'contains' : 'exact',
    });
    assert.ok(screen.queries() > 1);
  });
}

test('keeps exact matching and fails when the requested text never appears', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  const screen = changingRow({ missing: true });
  Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
  t.after(() => Object.assign(globalThis, previous));

  await assert.rejects(
    expectTextWithin('ActivityShort-0', '9 000', { strategy: 'exact' }),
    /timeout/
  );
});

test('still waits for a descendant to disappear', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  const screen = changingRow({ removing: true });
  Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
  t.after(() => Object.assign(globalThis, previous));

  await expectTextWithin('ActivityShort-0', '9 000', { visible: false });
});
