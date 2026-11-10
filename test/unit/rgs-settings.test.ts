import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRgsSetting } from '../helpers/rgs-settings.ts';

for (const action of ['ConnectToHost', 'ResetToDefault'] as const) {
  for (const failure of ['none', 'toast', 'tap']) {
    test(`iOS RGS ${action}: ${failure}, restoring timing settings`, async (t) => {
      const previousGlobals = {
        browser: globalThis.browser,
        driver: globalThis.driver,
        $: globalThis.$,
      };
      const original = { waitForIdleTimeout: 7, animationCoolOffTimeout: 1.5 };
      let settings = { ...original };
      let toastVisible = false;
      const clicked: string[] = [];
      Object.assign(globalThis, {
        browser: { pause: async () => {} },
        driver: {
          isIOS: true,
          isAndroid: false,
          getSettings: async () => ({ ...settings }),
          updateSettings: async (value: typeof settings) => {
            settings = { ...value };
          },
        },
        $: (selector: string) => ({
          waitForDisplayed: async ({ reverse = false } = {}) => {
            if (selector !== '~RgsUpdatedToast') return;
            if (failure === 'toast' || (!reverse && !toastVisible))
              throw new Error('Success toast absent');
            if (reverse) toastVisible = false;
          },
          click: async () => {
            clicked.push(selector);
            if (failure === 'tap') throw new Error('Tap failed');
            // XCTest's post-click idle/cool-off wait would consume the short toast.
            toastVisible =
              settings.waitForIdleTimeout === 0 && settings.animationCoolOffTimeout === 0;
          },
        }),
      });
      t.after(() => Object.assign(globalThis, previousGlobals));
      if (failure === 'toast')
        await assert.rejects(applyRgsSetting(action), /Success toast absent/);
      else if (failure === 'tap') await assert.rejects(applyRgsSetting(action), /Tap failed/);
      else await applyRgsSetting(action);
      assert.deepEqual(clicked, [`~${action}`]);
      assert.deepEqual(settings, original);
    });
  }
}

for (const action of ['ConnectToHost', 'ResetToDefault'] as const) {
  for (const failure of ['none', 'toast', 'tap']) {
    test(`fresh iOS RGS ${action}: ${failure}, restoring omitted defaults`, async (t) => {
      const previousGlobals = {
        browser: globalThis.browser,
        driver: globalThis.driver,
        $: globalThis.$,
      };
      let cached = {};
      let effective = { waitForIdleTimeout: 10, animationCoolOffTimeout: 2 };
      let toastVisible = false;
      Object.assign(globalThis, {
        browser: { pause: async () => {} },
        driver: {
          isIOS: true,
          isAndroid: false,
          capabilities: {},
          getSettings: async () => ({ ...cached }),
          updateSettings: async (value: typeof effective) => {
            // Match HTTP serialization: undefined keys disappear from a restore.
            const sent = JSON.parse(JSON.stringify(value));
            effective = { ...effective, ...sent };
            cached = { ...cached, ...sent };
          },
        },
        $: (selector: string) => ({
          waitForDisplayed: async ({ reverse = false } = {}) => {
            if (selector !== '~RgsUpdatedToast') return;
            if (failure === 'toast' || (!reverse && !toastVisible))
              throw new Error('Success toast absent');
            if (reverse) toastVisible = false;
          },
          click: async () => {
            if (failure === 'tap') throw new Error('Tap failed');
            toastVisible =
              effective.waitForIdleTimeout === 0 && effective.animationCoolOffTimeout === 0;
          },
        }),
      });
      t.after(() => Object.assign(globalThis, previousGlobals));
      if (failure === 'toast')
        await assert.rejects(applyRgsSetting(action), /Success toast absent/);
      else if (failure === 'tap') await assert.rejects(applyRgsSetting(action), /Tap failed/);
      else await applyRgsSetting(action);
      assert.deepEqual(effective, { waitForIdleTimeout: 10, animationCoolOffTimeout: 2 });
      assert.deepEqual(cached, effective);
    });
  }
}

for (const values of [
  { cached: {}, capabilities: { 'appium:waitForIdleTimeout': 3 }, idle: 3, animation: 2 },
  {
    cached: { waitForIdleTimeout: 0 },
    capabilities: { 'appium:waitForIdleTimeout': 9 },
    idle: 0,
    animation: 2,
  },
  {
    cached: { animationCoolOffTimeout: 1.5 },
    capabilities: { waitForIdleTimeout: 4 },
    idle: 4,
    animation: 1.5,
  },
]) {
  test(`iOS missing timing values preserve capability/cache precedence: ${JSON.stringify(values)}`, async (t) => {
    const previousGlobals = {
      browser: globalThis.browser,
      driver: globalThis.driver,
      $: globalThis.$,
    };
    const updates: object[] = [];
    Object.assign(globalThis, {
      browser: { pause: async () => {} },
      driver: {
        isIOS: true,
        isAndroid: false,
        capabilities: values.capabilities,
        getSettings: async () => values.cached,
        updateSettings: async (settings: object) => updates.push(settings),
      },
      $: () => ({ waitForDisplayed: async () => {}, click: async () => {} }),
    });
    t.after(() => Object.assign(globalThis, previousGlobals));
    await applyRgsSetting('ConnectToHost');
    const expected = { waitForIdleTimeout: values.idle, animationCoolOffTimeout: values.animation };
    assert.deepEqual(updates, [
      expected,
      { waitForIdleTimeout: 0, animationCoolOffTimeout: 0 },
      expected,
    ]);
  });
}

test('Android Reset waits for Connect to become enabled, submits once, then requires success', async (t) => {
  const previousGlobals = {
    browser: globalThis.browser,
    driver: globalThis.driver,
    $: globalThis.$,
  };
  const events: string[] = [];
  Object.assign(globalThis, {
    browser: { pause: async () => {} },
    driver: {
      isAndroid: true,
      isIOS: false,
      performActions: async () => {},
      releaseActions: async () => {},
      getWindowSize: async () => ({ width: 400, height: 800 }),
    },
    $: (selector: string) => {
      const id = /resourceId\("([^"]+)"\)/.exec(selector)?.[1];
      return {
        waitForDisplayed: async () => {
          if (id === 'RgsUpdatedToast' && !events.includes('success')) events.push('success');
        },
        waitForEnabled: async () => {
          events.push(`enabled:${id}`);
        },
        click: async () => {
          events.push(`tap:${id}`);
        },
        getLocation: async () => ({ x: 0, y: 0 }),
        getSize: async () => ({ width: 100, height: 100 }),
      };
    },
  });
  t.after(() => Object.assign(globalThis, previousGlobals));
  await applyRgsSetting('ResetToDefault');
  assert.deepEqual(events, [
    'tap:ResetToDefault',
    'enabled:ConnectToHost',
    'tap:ConnectToHost',
    'success',
  ]);
});
