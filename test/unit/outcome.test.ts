import test from 'node:test';
import assert from 'node:assert/strict';
import { typeAndExpect, waitAndExpect } from '../helpers/outcome.ts';

test('toast disappearance re-resolves a stale displayed handle on every poll', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  let polls = 0;
  let selections = 0;
  Object.assign(globalThis, {
    driver: { isAndroid: true },
    browser: {
      waitUntil: async (probe: () => Promise<boolean>) => {
        for (polls = 0; polls < 3; polls++) if (await probe()) return;
        throw new Error('cached toast never disappeared');
      },
    },
    $: () => {
      selections++;
      const visibleWhenSelected = polls === 0;
      return { isDisplayed: async () => visibleWhenSelected };
    },
  });
  t.after(() => Object.assign(globalThis, previous));
  await waitAndExpect({ all: [{ hidden: { id: 'InvalidAddressToast' } }] });
  assert.equal(selections, 2);
});

for (const stuck of [false, true]) {
  test(`recipient validation ${stuck ? 'fails without repeating input' : 'polls fresh enabled state'}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    let polls = 0;
    let writes = 0;
    let clears = 0;
    let value = '';
    Object.assign(globalThis, {
      driver: { isAndroid: true },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (polls = 0; polls < 3; polls++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => {
        const selectedAt = polls;
        return {
          isDisplayed: async () => true,
          waitForDisplayed: async () => {},
          clearValue: async () => {
            clears++;
            value = '';
          },
          setValue: async (text: string) => {
            writes++;
            value = text;
          },
          getText: async () => value,
          getAttribute: async () => value,
          isEnabled: async () => selector.includes('AddressContinue') && !stuck && selectedAt >= 1,
        };
      },
    });
    t.after(() => Object.assign(globalThis, previous));
    const result = typeAndExpect('RecipientInput', 'bcrt1-test', {
      all: [{ enabled: { id: 'AddressContinue', value: true } }],
    });
    if (stuck) await assert.rejects(result, /expected.*AddressContinue/);
    else await result;
    assert.equal(writes, 1);
    assert.equal(clears, 1);
    assert.ok(polls >= 1);
  });
}
