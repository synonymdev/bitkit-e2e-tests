import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dismissMoveToSparkIntroIfShown,
  expectBalanceWithWait,
  tap,
  waitForWalletHomeCondition,
} from '../helpers/actions.ts';
import { doTriggerTimedSheet, openSettings } from '../helpers/navigation.ts';

const SPARK_IDS = new Set([
  'MoveToSparkIntro',
  'UpdateSpendingBalance',
  'SpendingBalanceUpdated',
  'MoveToSparkTooLarge',
  'MoveToSparkFailed',
  'MoveToSparkInFlight',
  'MoveToSparkPartlyMoved',
  'MoveToSparkIntroLater',
  'UpdateSpendingBalanceLater',
  'UpdateSpendingBalanceDismiss',
  'SpendingBalanceUpdatedOk',
]);

/** The ids a selector names: `~id`, `resourceId("id")`, `resourceIdMatches("a|b")` or `name IN {'a', 'b'}`. */
function selectorIds(selector: string): string[] {
  if (selector.startsWith('~')) return [selector.slice(1)];
  const predicate = selector.match(/name IN \{(.*)\}/);
  if (predicate) return predicate[1].split(',').map((id) => id.trim().replace(/'/g, ''));
  return selector.split('"')[1].split('|');
}

function homeScreen({
  homeAt = 0,
  introAt = Infinity,
  balanceAt = 0,
  dismissWorks = true,
  dismissThrows = false,
  reappearsAt = Infinity,
  sparkAt = Infinity,
  sparkDismissWorks = true,
  sparkId = 'MoveToSparkIntroLater',
  sparkFlipAt = Infinity,
  sparkFlipsOnTap = false,
  sparkTapRejects = false,
} = {}) {
  let elapsed = 0;
  let dismissed = false;
  let sparkDismissed = false;
  let sparkFlipped = false;
  const clicks: string[] = [];
  const introVisible = () => (!dismissed || elapsed >= reappearsAt) && elapsed >= introAt;
  const sparkVisible = () => !sparkDismissed && elapsed >= sparkAt;
  // The Update Spending Balance modal leaves its quote state for the too-large state once the quote fails.
  const sparkButton = () =>
    sparkFlipped || elapsed >= sparkFlipAt ? 'UpdateSpendingBalanceDismiss' : sparkId;
  const visible = (id: string) => {
    if (SPARK_IDS.has(id)) return sparkVisible() && id === sparkButton();
    if (id.startsWith('UsdtIntro')) return introVisible() && !sparkVisible();
    return elapsed >= homeAt && !introVisible() && !sparkVisible();
  };
  const waitUntil = async (
    probe: () => Promise<boolean>,
    { timeout = 30_000, timeoutMsg = 'Home condition did not become true' } = {}
  ) => {
    const deadline = elapsed + timeout;
    while (true) {
      try {
        if (await probe()) return;
      } catch {
        // WebdriverIO retries rejected predicates too: actions must stay outside them.
      }
      if (elapsed >= deadline) throw new Error(timeoutMsg);
      elapsed += 250;
    }
  };
  const select = (selector: string) => {
    const ids = selectorIds(selector);
    const id = ids[0];
    return {
      isDisplayed: async () => ids.some(visible),
      isExisting: async () => ids.some(visible),
      isEnabled: async () => ids.some(visible),
      getLocation: async () => ({
        x: 20,
        y: 700 - Math.min(100, Math.max(0, elapsed - introAt) / 5),
      }),
      getSize: async () => ({ width: 160, height: 48 }),
      waitForDisplayed: async ({ reverse = false, timeout = 30_000 } = {}) =>
        waitUntil(async () => visible(id) !== reverse, { timeout }),
      click: async () => {
        assert.ok(visible(id), `${id} must be visible when tapped`);
        clicks.push(id);
        if (SPARK_IDS.has(id)) {
          if (sparkTapRejects && !sparkFlipped) {
            sparkFlipped = true;
            throw new Error('element is no longer attached');
          }
          if (sparkFlipsOnTap && !sparkFlipped) sparkFlipped = true;
          else sparkDismissed = sparkDismissWorks;
        }
        if (id.startsWith('UsdtIntro')) {
          if (driver.isAndroid) {
            assert.ok(elapsed >= introAt + 500, 'Do not tap the entering Android sheet');
          }
          if (dismissThrows) throw new Error('Intro choice click failed');
          dismissed = dismissWorks;
        }
      },
    };
  };
  return {
    clicks,
    get elapsed() {
      return elapsed;
    },
    $: select,
    browser: {
      waitUntil,
      pause: async (ms: number) => {
        elapsed += ms;
      },
    },
    readBalance: async () => {
      if (!visible('TotalBalance-primary')) throw new Error('Balance is covered');
      return elapsed >= balanceAt ? 9000 : 0;
    },
  };
}

for (const isAndroid of [true, false]) {
  const platform = isAndroid ? 'Android' : 'iOS';
  for (const [name, navigate, expectedClicks] of [
    ['menu tap', () => tap('HeaderMenu'), ['HeaderMenu']],
    ['Settings', () => openSettings(), ['HeaderMenu', 'DrawerSettings']],
    [
      'timed-sheet trigger',
      () => doTriggerTimedSheet(),
      ['HeaderMenu', 'DrawerSettings', 'HeaderMenu', 'DrawerWallet'],
    ],
  ] as const) {
    test(`${platform}: preserves Spark recovery before the ${name} Home wait`, async (t) => {
      const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
      const screen = homeScreen({ sparkAt: 0, introAt: 0 });
      Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
      t.after(() => Object.assign(globalThis, previous));
      t.mock.method(Date, 'now', () => screen.elapsed);

      await navigate();
      assert.deepEqual(screen.clicks, [
        'MoveToSparkIntroLater',
        'UsdtIntroDecline',
        ...expectedClicks,
      ]);
    });
  }

  test(`${platform}: an ineffective Spark dismissal still fails without a menu tap`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen({ sparkAt: 0, sparkDismissWorks: false });
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    await assert.rejects(tap('HeaderMenu'));
    assert.deepEqual(screen.clicks, ['MoveToSparkIntroLater']);
  });

  for (const [name, options, sparkClicks] of [
    [
      'waits out a quote that fails into the too-large state',
      { sparkId: 'UpdateSpendingBalanceLater', sparkFlipAt: 500 },
      ['UpdateSpendingBalanceDismiss'],
    ],
    [
      'taps again when the modal changes state under the tap',
      { sparkId: 'UpdateSpendingBalanceLater', sparkFlipsOnTap: true },
      ['UpdateSpendingBalanceLater', 'UpdateSpendingBalanceDismiss'],
    ],
    [
      'taps the new button when the state change makes the first tap fail',
      { sparkId: 'UpdateSpendingBalanceLater', sparkTapRejects: true },
      ['UpdateSpendingBalanceLater', 'UpdateSpendingBalanceDismiss'],
    ],
    [
      'dismisses a moved balance with OK',
      { sparkId: 'SpendingBalanceUpdatedOk' },
      ['SpendingBalanceUpdatedOk'],
    ],
  ] as const) {
    test(`${platform}: Update Spending Balance ${name}`, async (t) => {
      const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
      const screen = homeScreen({ sparkAt: 0, ...options });
      Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
      t.after(() => Object.assign(globalThis, previous));
      t.mock.method(Date, 'now', () => screen.elapsed);

      assert.equal(await dismissMoveToSparkIntroIfShown(), true);
      assert.deepEqual(screen.clicks, sparkClicks);
      assert.equal(await dismissMoveToSparkIntroIfShown(), false);
    });
  }

  test(`${platform}: resolves a late intro during balance synchronization`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen({ introAt: 6000, balanceAt: 10_000 });
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    assert.equal(
      await expectBalanceWithWait(screen.readBalance, 'total', 9000, { timeout: 12_000 }),
      9000
    );
    assert.deepEqual(screen.clicks, ['UsdtIntroDecline']);
  });

  test(`${platform}: resolves a late intro before a Home menu tap`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen({ homeAt: 10_000, introAt: 6000 });
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    await tap('HeaderMenu');
    assert.deepEqual(screen.clicks, ['UsdtIntroDecline', 'HeaderMenu']);
  });

  test(`${platform}: opens Settings through a late intro at its initial menu wait`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen({ homeAt: 10_000, introAt: 6000 });
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    await openSettings('security');
    assert.deepEqual(screen.clicks, [
      'UsdtIntroDecline',
      'HeaderMenu',
      'DrawerSettings',
      'Tab-security',
    ]);
  });

  for (const scenario of [
    {
      name: 'rejects a still-wrong financial balance after resolving the intro',
      expected: 9001,
      error: /balance eq 9001/,
    },
    { name: 'does not retry an intro tap that fails', dismissThrows: true, error: /click failed/ },
    {
      name: 'does not retry an ineffective intro tap',
      dismissWorks: false,
      error: /still visible/,
    },
    {
      name: 'rejects an intro that reappears before the original outcome',
      reappearsAt: 8000,
      balanceAt: 10_000,
      error: /reappeared/,
    },
  ]) {
    test(`${platform}: ${scenario.name}`, async (t) => {
      const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
      const screen = homeScreen({ introAt: 6000, balanceAt: 10_000, ...scenario });
      Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
      t.after(() => Object.assign(globalThis, previous));
      t.mock.method(Date, 'now', () => screen.elapsed);

      await assert.rejects(
        expectBalanceWithWait(screen.readBalance, 'total', scenario.expected ?? 9000, {
          timeout: 12_000,
        }),
        scenario.error
      );
      assert.deepEqual(screen.clicks, ['UsdtIntroDecline']);
      assert.ok(screen.elapsed <= 12_250, 'Resolving the intro must not restart the wait budget');
    });
  }

  test(`${platform}: keeps a direct Home outcome required after an intro`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen({ introAt: 6000, balanceAt: 10_000 });
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    await waitForWalletHomeCondition(async () => (await screen.readBalance()) === 9000, {
      timeout: 12_000,
    });
    assert.equal(await screen.readBalance(), 9000);
    assert.deepEqual(screen.clicks, ['UsdtIntroDecline']);
  });

  test(`${platform}: does not delay or tap when an ordinary Home outcome is ready`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = homeScreen();
    Object.assign(globalThis, { browser: screen.browser, $: screen.$, driver: { isAndroid } });
    t.after(() => Object.assign(globalThis, previous));
    t.mock.method(Date, 'now', () => screen.elapsed);

    assert.equal(await expectBalanceWithWait(screen.readBalance, 'total', 9000), 9000);
    assert.equal(screen.elapsed, 0);
    assert.deepEqual(screen.clicks, []);
  });
}
