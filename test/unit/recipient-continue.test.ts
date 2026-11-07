import test from 'node:test';
import assert from 'node:assert/strict';
import { continueGateRecipient } from '../helpers/gate-actions.ts';

for (const scenario of ['settles', 'stale', 'never-ready', 'missing-outcome', 'ios'] as const) {
  test(`recipient Continue: ${scenario}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    let poll = 0;
    let clicks = 0;
    let clickedAt = -1;
    let staleSeen = false;
    const isAndroid = scenario !== 'ios';
    Object.assign(globalThis, {
      driver: {
        isAndroid,
        isKeyboardShown: async () => {
          assert.ok(isAndroid, 'iOS must keep its existing tap path');
          return poll === 0;
        },
      },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (poll = 0; poll < 10; poll++) {
            try {
              if (await probe()) return;
            } catch {
              // WebdriverIO retries observation errors, including stale native nodes.
            }
          }
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => {
        const selectedAt = poll;
        return {
          waitForDisplayed: async () => {},
          isDisplayed: async () =>
            selector.includes('AddressContinue') ||
            (clicks === 1 && scenario !== 'missing-outcome'),
          isEnabled: async () => poll !== 1 && poll !== 4,
          getLocation: async () => {
            if (scenario === 'stale' && poll === 6) {
              staleSeen = true;
              throw new Error('stale element');
            }
            return { x: 20, y: scenario === 'never-ready' ? 1000 + poll : poll < 3 ? 900 : 1000 };
          },
          getSize: async () => ({ width: 400, height: 50 }),
          click: async () => {
            clicks++;
            clickedAt = selectedAt;
            if (isAndroid) assert.ok(poll >= (scenario === 'stale' ? 8 : 6));
          },
        };
      },
    });
    t.after(() => Object.assign(globalThis, previous));
    const result = continueGateRecipient({ anyVisible: [{ id: 'SendNumberField' }] });
    if (scenario === 'never-ready') {
      await assert.rejects(result, /did not become enabled and stationary/);
      assert.equal(clicks, 0, 'Unavailable button must never receive a tap');
    } else if (scenario === 'missing-outcome') {
      await assert.rejects(result, /expected/);
      assert.equal(clicks, 1, 'Observation failure must not replay the action');
    } else {
      await result;
      assert.equal(clicks, 1);
      if (isAndroid) assert.ok(clickedAt >= 6, 'Use a fresh handle after keyboard/layout settle');
      if (scenario === 'stale') assert.ok(staleSeen);
    }
  });
}
