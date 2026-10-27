import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteWidget, deleteWidgets } from '../helpers/widgets.ts';

function widgetScreen({ isAndroid = true, stuck = false, clickFails = false } = {}) {
  let editing = false;
  let dialog: string | undefined;
  const positions = new Map([
    ['Bitcoin Price_WidgetActionDelete', 500],
    ['Bitkit Suggestions_WidgetActionDelete', 150],
  ]);
  const removed: string[] = [];
  const directions: string[] = [];
  const select = (selector: string) => {
    const id = selector.includes('Yes, Delete')
      ? 'confirm'
      : selector.startsWith('~')
        ? selector.slice(1)
        : selector.split('"')[1];
    const visible = () =>
      id === 'confirm' ? dialog !== undefined : id === 'WidgetsEdit' || positions.has(id);
    return {
      waitForDisplayed: async ({ reverse = false } = {}) => {
        assert.equal(visible(), !reverse, `Not displayed: ${id}`);
      },
      getLocation: async () => ({ x: 50, y: id === 'WidgetsEdit' ? 100 : positions.get(id)! }),
      getSize: async () => ({ width: 100, height: 100 }),
      click: async () => {
        if (id === 'WidgetsEdit') {
          editing = !editing;
        } else if (id === 'confirm') {
          assert.ok(dialog);
          positions.delete(dialog);
          removed.push(dialog);
          dialog = undefined;
          // Removing the preceding card shifts the remaining control under the header.
          positions.set('Bitkit Suggestions_WidgetActionDelete', 150);
          if (removed.includes('Bitkit Suggestions_WidgetActionDelete')) {
            positions.delete('Bitkit Suggestions_WidgetActionDelete');
          }
        } else {
          if (clickFails) throw new Error('Click transport failed');
          if (isAndroid) assert.ok(positions.get(id)! >= 200, 'Tap intercepted by Profile header');
          dialog = id;
        }
      },
    };
  };
  return {
    removed,
    directions,
    positions,
    $: select,
    browser: { pause: async () => {} },
    driver: {
      isAndroid,
      getWindowSize: async () => ({ width: 500, height: 1000 }),
      releaseActions: async () => {},
      performActions: async (actions: { actions: { type: string; y?: number }[] }[]) => {
        if (!editing) return;
        const moves = actions[0].actions.filter((action) => action.type === 'pointerMove');
        const delta = moves[1].y! - moves[0].y!;
        directions.push(delta > 0 ? 'down' : 'up');
        if (!stuck) positions.forEach((y, id) => positions.set(id, y + delta));
      },
    },
  };
}

for (const scenario of [
  { name: 'reveals a control covered by the fixed header', widgets: ['suggestions'] as const },
  { name: 'rechecks after deleting an earlier card', widgets: ['price', 'suggestions'] as const },
  {
    name: 'fails without clicking when scrolling cannot reveal it',
    stuck: true,
    fails: /obscured/,
  },
  { name: 'does not swallow a click failure', clickFails: true, fails: /Click transport failed/ },
  { name: 'keeps iOS deletion unchanged', isAndroid: false, widgets: ['suggestions'] as const },
]) {
  test(scenario.name, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = widgetScreen(scenario);
    Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
    t.after(() => Object.assign(globalThis, previous));
    const operation = deleteWidgets([...(scenario.widgets ?? ['suggestions'])]);
    if (scenario.fails) {
      await assert.rejects(operation, scenario.fails);
      assert.deepEqual(screen.removed, []);
      if (scenario.stuck) assert.equal(screen.directions.length, 5);
    } else {
      await operation;
      assert.equal(screen.removed.length, scenario.widgets!.length);
      assert.deepEqual(screen.directions, scenario.isAndroid === false ? [] : ['down']);
    }
  });
}

test('single deletion reveals a low target and still requires confirmation', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  const screen = widgetScreen();
  screen.positions.set('Bitcoin Price_WidgetActionDelete', 950);
  Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
  t.after(() => Object.assign(globalThis, previous));
  await deleteWidget('price');
  assert.deepEqual(screen.directions, ['up']);
  assert.deepEqual(screen.removed, ['Bitcoin Price_WidgetActionDelete']);
});

test('an absent optional widget is skipped without a destructive click', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  const screen = widgetScreen();
  Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
  t.after(() => Object.assign(globalThis, previous));
  await deleteWidgets(['weather']);
  assert.deepEqual(screen.removed, []);
});
