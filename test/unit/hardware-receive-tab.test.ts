import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHardwareReceiveTab } from '../helpers/hardware-wallet.ts';

for (const isAndroid of [true, false]) {
  for (const scenario of ['changes', 'same-address', 'hidden', 'click-error'] as const) {
    test(`hardware Receive ${isAndroid ? 'Android' : 'iOS'}: ${scenario}`, async (t) => {
      const previous = {
        driver: globalThis.driver,
        browser: globalThis.browser,
        $: globalThis.$,
      };
      t.after(() => Object.assign(globalThis, previous));
      let sample = 0;
      let clicks = 0;
      let qrSelections = 0;
      let observations = 0;
      const defaultAddress = 'bcrt1qsoftware';
      Object.assign(globalThis, {
        driver: { isAndroid },
        browser: {
          waitUntil: async (
            probe: () => Promise<boolean>,
            options: { timeout: number; interval: number; timeoutMsg: string }
          ) => {
            assert.equal(clicks, 1);
            assert.equal(options.timeout, 30_000);
            assert.equal(options.interval, 500);
            for (sample = 0; sample < 3; sample++) {
              observations++;
              if (await probe()) return;
            }
            throw new Error(options.timeoutMsg);
          },
        },
        $: (selector: string) => {
          if (selector.includes('Tab-')) {
            return {
              waitForDisplayed: async ({ timeout }: { timeout: number }) => {
                assert.equal(timeout, 30_000);
              },
              click: async () => {
                clicks++;
                if (scenario === 'click-error') throw new Error('native tab click failed');
              },
            };
          }
          assert.match(selector, /QRCode/);
          qrSelections++;
          const selectedAt = sample;
          return {
            isDisplayed: async () => scenario !== 'hidden' && selectedAt !== 1,
            getAttribute: async () => {
              const address =
                scenario === 'same-address' || selectedAt === 0
                  ? defaultAddress
                  : 'bcrt1qhardware';
              return `bitcoin:${address}?amount=${selectedAt}`;
            },
          };
        },
      });
      const result = selectHardwareReceiveTab(
        isAndroid ? 'Tab-hardware' : 'Tab-trezor',
        defaultAddress
      );
      if (scenario === 'changes') await result;
      else
        await assert.rejects(
          result,
          scenario === 'click-error' ? /native tab click failed/ : /hardware receive address/
        );
      assert.equal(clicks, 1, 'An ineffective tab click must never be replayed');
      assert.equal(observations, scenario === 'click-error' ? 0 : 3);
      assert.equal(qrSelections, observations, 'Each observation resolves a fresh QR handle');
    });
  }
}
