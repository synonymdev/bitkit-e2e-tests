import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateGateLnurl } from '../helpers/gate-actions.ts';

for (const mode of [
  'success',
  'observation',
  'action',
  'update',
  'restore',
  'both',
  'unavailable',
]) {
  test(`LNURL authentication scoped idle settings: ${mode}`, async (t) => {
    const old = { driver: globalThis.driver, browser: globalThis.browser, $: globalThis.$ };
    t.after(() => Object.assign(globalThis, old));
    const original = { waitForIdleTimeout: 7.5, animationCoolOffTimeout: 1.25 };
    let settings = { ...original };
    let updates = 0;
    let clicks = 0;
    let appeared = false;
    Object.assign(globalThis, {
      driver: {
        isIOS: true,
        isAndroid: false,
        getSettings: async () => (mode === 'unavailable' ? {} : { ...settings }),
        updateSettings: async (value: typeof original) => {
          updates++;
          if (mode === 'update' && updates === 1) throw new Error('settings update failed');
          if (['restore', 'both'].includes(mode) && updates === 2)
            throw new Error('restore failed');
          settings = { ...value };
        },
      },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeout: number }) => {
          assert.equal(options.timeout, 30_000);
          for (let i = 0; i < 3; i++) if (await probe()) return;
          throw new Error('confirmation never appeared');
        },
      },
      $: (selector: string) => ({
        waitForDisplayed: async () => {},
        isDisplayed: async () => selector.includes('LnurlAuthContinue') || appeared,
        click: async () => {
          clicks++;
          assert.deepEqual(settings, { waitForIdleTimeout: 0, animationCoolOffTimeout: 0 });
          if (mode === 'action') throw new Error('native click failed');
          appeared = !['observation', 'both'].includes(mode);
        },
      }),
    });
    if (mode === 'success') await authenticateGateLnurl();
    else await assert.rejects(authenticateGateLnurl(), mode === 'both' ? AggregateError : Error);
    assert.equal(clicks, ['update', 'unavailable'].includes(mode) ? 0 : 1);
    assert.equal(updates, mode === 'unavailable' ? 0 : 2);
    if (!['restore', 'both'].includes(mode)) assert.deepEqual(settings, original);
  });
}
