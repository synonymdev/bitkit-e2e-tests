import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForWalletHome } from '../helpers/actions.ts';

function walletScreen({ homeAt = 0, introAt = Infinity } = {}) {
  let elapsed = 0;
  let dismissed = false;
  const clicks: string[] = [];
  const visible = (id: string) => {
    const intro = !dismissed && elapsed >= introAt;
    return id.startsWith('UsdtIntro') ? intro : elapsed >= homeAt && !intro;
  };
  const waitUntil = async (probe: () => Promise<boolean>, { timeout = 5000 } = {}) => {
    const deadline = elapsed + timeout;
    while (!(await probe())) {
      if (elapsed >= deadline) throw new Error('Element did not appear');
      elapsed += 250;
    }
  };
  const select = (selector: string) => {
    const id = selector.startsWith('~') ? selector.slice(1) : selector.split('"')[1];
    return {
      isDisplayed: async () => visible(id),
      waitForDisplayed: async ({ reverse = false, timeout = 5000 } = {}) =>
        waitUntil(async () => visible(id) !== reverse, { timeout }),
      click: async () => {
        assert.ok(visible(id));
        clicks.push(id);
        dismissed = true;
      },
    };
  };
  return { clicks, browser: { waitUntil }, $: select };
}

for (const isAndroid of [true, false]) {
  const platform = isAndroid ? 'Android' : 'iOS';
  for (const scenario of [
    { name: 'declines an intro covering the home', introAt: 0 },
    { name: 'handles an intro after slow wallet setup', homeAt: 10_000, introAt: 10_000 },
    { name: 'handles an intro appearing after the home', introAt: 2000 },
    { name: 'preserves wallets without an intro' },
    { name: 'enables only when requested', introAt: 0, enableUsdt: true },
    { name: 'fails when explicit opt-in is unavailable', enableUsdt: true, fails: true },
    { name: 'fails when the wallet never becomes ready', homeAt: Infinity, fails: true },
  ]) {
    test(`${platform}: ${scenario.name}`, async (t) => {
      const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
      const screen = walletScreen(scenario);
      Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
      t.after(() => Object.assign(globalThis, previous));

      const ready = waitForWalletHome({ enableUsdt: scenario.enableUsdt });
      if (scenario.fails) {
        await assert.rejects(ready, /did not appear/);
      } else {
        await ready;
        assert.deepEqual(
          screen.clicks,
          scenario.introAt === undefined
            ? []
            : [scenario.enableUsdt ? 'UsdtIntroEnable' : 'UsdtIntroDecline']
        );
      }
    });
  }
}
