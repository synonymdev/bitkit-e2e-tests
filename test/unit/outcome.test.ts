import test from 'node:test';
import assert from 'node:assert/strict';
import { tapAndExpect, typeAndExpect, waitAndExpect } from '../helpers/outcome.ts';

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

for (const scenario of ['expires', 'missing', 'old', 'wrong-state', 'amount'] as const) {
  test(`transient warning: ${scenario}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    let issued = false;
    let expired = false;
    let writes = 0;
    let polls = 0;
    let toastReadsAfterAction = 0;
    Object.assign(globalThis, {
      driver: { isAndroid: true },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (polls = 0; polls < 3; polls++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => ({
        waitForDisplayed: async () => {},
        isDisplayed: async () => {
          if (!selector.includes('WarningToast')) return true;
          if (issued) toastReadsAfterAction++;
          return scenario === 'old' || (issued && !expired && scenario !== 'missing');
        },
        clearValue: async () => {},
        setValue: async () => {
          issued = true;
          writes++;
        },
        click: async () => {
          issued = true;
          writes++;
        },
        getAttribute: async () => {
          expired = true;
          return scenario === 'amount' ? '1 500' : 'test123';
        },
        // Persistent state can arrive after the short-lived toast disappeared.
        isEnabled: async () => scenario === 'wrong-state' || polls === 0,
      }),
    });
    t.after(() => Object.assign(globalThis, previous));
    const outcome = {
      appeared: [{ id: 'WarningToast' }],
      all: [{ enabled: { id: 'AddressContinue', value: false } }],
    };
    const result =
      scenario === 'amount'
        ? tapAndExpect(
            { id: 'N1' },
            {
              appeared: outcome.appeared,
              all: [{ textWithin: { id: 'SendNumberField', text: '1 500' } }],
            }
          )
        : typeAndExpect('RecipientInput', 'test123', outcome);
    if (['missing', 'old', 'wrong-state'].includes(scenario)) await assert.rejects(result);
    else await result;
    assert.equal(writes, scenario === 'old' ? 0 : 1);
    if (scenario === 'expires' || scenario === 'amount') assert.equal(toastReadsAfterAction, 1);
  });
}
