import test from 'node:test';
import assert from 'node:assert/strict';
import { tapStationaryAndExpect } from '../helpers/outcome.ts';

for (const mode of [
  'moving',
  'replaced',
  'disabled',
  'hidden',
  'empty',
  'no-outcome',
  'click-failed',
  'ios',
]) {
  test(`stationary tap: ${mode}`, async (t) => {
    const old = { driver: globalThis.driver, browser: globalThis.browser, $: globalThis.$ };
    t.after(() => Object.assign(globalThis, old));
    let poll = 0;
    let clicks = 0;
    Object.assign(globalThis, {
      driver: { isAndroid: mode !== 'ios' },
      browser: {
        waitUntil: async (
          probe: () => Promise<boolean>,
          options: { timeout: number; timeoutMsg: string }
        ) => {
          assert.equal(options.timeout, 30000);
          for (poll = 0; poll < 5; poll++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => {
        const generation = mode === 'replaced' && poll < 3 ? String(poll) : 'ready';
        return {
          elementId: generation,
          waitForDisplayed: async () => {},
          isDisplayed: async () =>
            selector.includes('Tag') ? mode !== 'hidden' : clicks > 0 && mode !== 'no-outcome',
          isEnabled: async () => mode !== 'disabled',
          getLocation: async () => ({
            x: 40,
            y: mode === 'moving' && poll < 3 ? 1700 - poll * 20 : 1600,
          }),
          getSize: async () => ({ width: mode === 'empty' ? 0 : 200, height: 80 }),
          click: async () => {
            clicks++;
            if (mode === 'moving' || mode === 'replaced') assert.ok(poll >= 4);
            if (mode === 'click-failed') throw new Error('native click failed');
          },
        };
      },
    });
    const action = tapStationaryAndExpect(
      { id: 'Tag-rtag' },
      { anyVisible: [{ id: 'Activity-1' }] }
    );
    if (['moving', 'replaced', 'ios'].includes(mode)) await action;
    else await assert.rejects(action);
    assert.equal(clicks, ['disabled', 'hidden', 'empty'].includes(mode) ? 0 : 1);
  });
}
