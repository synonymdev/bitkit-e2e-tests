import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmGateAction } from '../helpers/gate-actions.ts';

for (const mode of [
  'success',
  'missing',
  'action',
  'release',
  'update',
  'restore',
  'both',
  'unavailable',
  'persistent',
  'android',
]) {
  test(`confirmation feedback scope: ${mode}`, async (t) => {
    const old = { driver: globalThis.driver, browser: globalThis.browser, $: globalThis.$ };
    t.after(() => Object.assign(globalThis, old));
    const original = { waitForIdleTimeout: 7.5, animationCoolOffTimeout: 1.25 };
    let settings = { ...original };
    let updates = 0;
    let actions = 0;
    let releases = 0;
    let feedback = false;
    const scoped = !['persistent', 'android'].includes(mode);
    Object.assign(globalThis, {
      driver: {
        isIOS: mode !== 'android',
        isAndroid: mode === 'android',
        getSettings: async () => (mode === 'unavailable' ? {} : { ...settings }),
        updateSettings: async (value: typeof original) => {
          updates++;
          settings = { ...value }; // Even a partially applied failed update must be restored.
          if (mode === 'update' && updates === 1) throw new Error('update failed');
          if (['restore', 'both'].includes(mode) && updates === 2)
            throw new Error('restore failed');
        },
        getWindowSize: async () => ({ width: 400, height: 800 }),
        performActions: async () => {
          actions++;
          if (scoped)
            assert.deepEqual(settings, { waitForIdleTimeout: 0, animationCoolOffTimeout: 0 });
          else assert.deepEqual(settings, original);
          if (mode === 'action') throw new Error('gesture failed');
          // A native response under XCTest idle waits can outlive this toast.
          feedback = scoped && !['missing', 'both'].includes(mode);
          if (!scoped) feedback = true;
        },
        releaseActions: async () => {
          releases++;
          if (mode === 'release') throw new Error('release failed');
        },
      },
      browser: {
        pause: async () => {},
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (let p = 0; p < 3; p++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => ({
        waitForDisplayed: async () => {},
        isDisplayed: async () => selector.includes('GRAB') || feedback,
        getLocation: async () => ({ x: 10, y: 500 }),
        getSize: async () => ({ width: 80, height: 80 }),
      }),
    });
    const outcome =
      mode === 'persistent' || mode === 'android'
        ? { anyVisible: [{ id: 'SendSuccess' }] }
        : { appeared: [{ id: 'BoostSuccessToast' }] };
    const result = confirmGateAction(outcome);
    if (['success', 'persistent', 'android'].includes(mode)) await result;
    else await assert.rejects(result, mode === 'both' ? AggregateError : Error);
    assert.equal(actions, ['unavailable', 'update'].includes(mode) ? 0 : 1);
    assert.equal(releases, ['unavailable', 'update', 'action'].includes(mode) ? 0 : 1);
    assert.equal(updates, scoped ? (mode === 'unavailable' ? 0 : 2) : 0);
    if (!['restore', 'both'].includes(mode)) assert.deepEqual(settings, original);
  });
}
