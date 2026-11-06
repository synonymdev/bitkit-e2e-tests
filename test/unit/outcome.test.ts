import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

for (const isAndroid of [true, false]) {
  for (const stuck of [false, true]) {
    test(`input clear ${isAndroid ? 'Android' : 'iOS'}: ${stuck ? 'refuses append' : 'awaits stable empty state'}`, async (t) => {
      const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
      let writes = 0;
      let clears = 0;
      let reads = 0;
      let text = 'old-address';
      const attributes: string[] = [];
      Object.assign(globalThis, {
        driver: { isAndroid },
        browser: {
          waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
            for (let poll = 0; poll < 6; poll++) if (await probe()) return;
            throw new Error(options.timeoutMsg);
          },
        },
        $: () => ({
          isDisplayed: async () => true,
          waitForDisplayed: async () => {},
          clearValue: async () => {
            clears++;
          },
          setValue: async () => {
            // The installed SDK implements setValue as clearValue + addValue.
            clears++;
            throw new Error('setValue would issue a second unverified clear');
          },
          addValue: async (value: string) => {
            // Writing too early reproduces the observed append to the old address.
            text += value;
            writes++;
          },
          getAttribute: async (attribute: string) => {
            attributes.push(attribute);
            reads++;
            // First empty observation is transient: the old app value can return.
            if (!writes && !stuck && reads !== 1 && reads !== 3) text = '';
            else if (!writes && reads === 3) text = 'old-address';
            return text;
          },
        }),
      });
      t.after(() => Object.assign(globalThis, previous));
      const result = typeAndExpect('RecipientInput', 'new-address', {}, { verifyClear: true });
      if (stuck) await assert.rejects(result, /input did not clear; replacement not typed/);
      else await result;
      assert.equal(clears, 1);
      assert.equal(writes, stuck ? 0 : 1);
      if (!stuck) assert.equal(text, 'new-address');
      assert.equal(attributes[0], isAndroid ? 'text' : 'value');
      assert.ok(reads >= 5);
    });
  }
}

for (const scenario of [
  'expires',
  'delayed',
  'missing',
  'old',
  'wrong-state',
  'amount',
  'wrong-amount',
] as const) {
  test(`transient warning: ${scenario}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    let issued = false;
    let expired = false;
    let writes = 0;
    let polls = 0;
    let toastReadsAfterAction = 0;
    let waitFinished = false;
    let prematureReads = 0;
    let idle = 10000;
    const updates: number[] = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-evidence-'));
    const previousDirectory = process.env.OUTCOME_PILOT_ARTIFACTS;
    process.env.OUTCOME_PILOT_ARTIFACTS = directory;
    t.after(() => {
      if (previousDirectory === undefined) delete process.env.OUTCOME_PILOT_ARTIFACTS;
      else process.env.OUTCOME_PILOT_ARTIFACTS = previousDirectory;
      fs.rmSync(directory, { recursive: true, force: true });
    });
    Object.assign(globalThis, {
      driver: {
        isAndroid: true,
        getSettings: async () => ({ waitForIdleTimeout: idle }),
        updateSettings: async ({ waitForIdleTimeout }: { waitForIdleTimeout: number }) => {
          updates.push(waitForIdleTimeout);
          idle = waitForIdleTimeout;
        },
      },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (polls = 0; polls < 3; polls++) if (await probe()) return;
          waitFinished = true;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => ({
        waitForDisplayed: async () => {},
        isDisplayed: async () => {
          if (!selector.includes('WarningToast')) return true;
          if (issued) {
            toastReadsAfterAction++;
            assert.equal(idle, 0, 'Transient lookup must not wait for UI idle');
          }
          return (
            scenario === 'old' ||
            (issued && !expired && scenario !== 'missing' && (scenario !== 'delayed' || polls >= 1))
          );
        },
        clearValue: async () => {},
        setValue: async () => {
          assert.equal(idle, 10000, 'Action retains its original idle policy');
          issued = true;
          writes++;
        },
        click: async () => {
          assert.equal(idle, 10000, 'Action retains its original idle policy');
          issued = true;
          writes++;
        },
        getAttribute: async () => {
          if (scenario === 'missing' && !waitFinished) prematureReads++;
          expired = true;
          return scenario === 'amount'
            ? '1 500'
            : scenario === 'wrong-amount'
              ? '15 001'
              : 'test123';
        },
        $: () => ({ isDisplayed: async () => false }),
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
      scenario === 'amount' || scenario === 'wrong-amount'
        ? tapAndExpect(
            { id: 'N1' },
            {
              appeared: outcome.appeared,
              all: [{ textWithin: { id: 'SendNumberField', text: '1 500' } }],
            }
          )
        : typeAndExpect('RecipientInput', 'test123', outcome);
    if (['missing', 'old', 'wrong-state', 'wrong-amount'].includes(scenario))
      await assert.rejects(result);
    else await result;
    assert.equal(writes, scenario === 'old' ? 0 : 1);
    assert.equal(idle, 10000);
    assert.deepEqual(updates, scenario === 'old' ? [] : [0, 10000]);
    if (scenario === 'expires' || scenario === 'amount') assert.equal(toastReadsAfterAction, 1);
    if (scenario === 'delayed') assert.equal(toastReadsAfterAction, 2);
    assert.equal(prematureReads, 0);
    const [record] = fs
      .readFileSync(path.join(directory, 'steps.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(
      record.status,
      ['expires', 'delayed', 'amount'].includes(scenario) ? 'passed' : 'failed'
    );
    assert.deepEqual(
      record.appeared,
      ['missing', 'old'].includes(scenario) ? [] : ['id:WarningToast']
    );
    assert.deepEqual(
      record.observationIdleTimeout,
      scenario === 'old' ? undefined : { before: 10000, during: 0, restored: true }
    );
    if (scenario === 'missing') {
      assert.equal(
        record.failureObserved[
          JSON.stringify({ inputValue: { id: 'RecipientInput', value: 'test123' } })
        ],
        'test123'
      );
      assert.ok(record.failureObservedAt);
    }
    if (scenario === 'wrong-state') {
      assert.equal(record.observed['appeared id:WarningToast'], true);
      assert.equal(
        record.observed[JSON.stringify({ inputValue: { id: 'RecipientInput', value: 'test123' } })],
        'test123'
      );
      assert.equal(
        record.observed[JSON.stringify({ enabled: { id: 'AddressContinue', value: false } })],
        true
      );
    }
  });
}

for (const failure of ['enable', 'restore', 'primary-and-restore', 'settings-unavailable']) {
  test(`Android observation settings failure: ${failure}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const previousDirectory = process.env.OUTCOME_PILOT_ARTIFACTS;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-settings-'));
    process.env.OUTCOME_PILOT_ARTIFACTS = directory;
    let clicks = 0;
    let idle = 321;
    const updates: number[] = [];
    Object.assign(globalThis, {
      driver: {
        isAndroid: true,
        getSettings: async () =>
          failure === 'settings-unavailable' ? {} : { waitForIdleTimeout: idle },
        updateSettings: async ({ waitForIdleTimeout }: { waitForIdleTimeout: number }) => {
          updates.push(waitForIdleTimeout);
          idle = waitForIdleTimeout;
          if (waitForIdleTimeout === 0 && failure === 'enable')
            throw new Error('idle update failed');
          if (waitForIdleTimeout === 321 && failure.includes('restore'))
            throw new Error('idle restore failed');
        },
      },
      browser: {
        waitUntil: async (probe: () => Promise<boolean>, options: { timeoutMsg: string }) => {
          for (let poll = 0; poll < 2; poll++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $: (selector: string) => ({
        waitForDisplayed: async () => {},
        isDisplayed: async () =>
          !selector.includes('WarningToast') || (clicks === 1 && failure !== 'primary-and-restore'),
        click: async () => {
          assert.equal(idle, 321);
          clicks++;
        },
      }),
    });
    t.after(() => {
      Object.assign(globalThis, previous);
      if (previousDirectory === undefined) delete process.env.OUTCOME_PILOT_ARTIFACTS;
      else process.env.OUTCOME_PILOT_ARTIFACTS = previousDirectory;
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const expected =
      failure === 'enable'
        ? /idle update failed/
        : failure === 'restore'
          ? /idle restore failed/
          : failure === 'primary-and-restore'
            ? /expected/
            : /restorable idle timeout/;
    await assert.rejects(
      tapAndExpect({ id: 'N1' }, { appeared: [{ id: 'WarningToast' }] }),
      expected
    );
    assert.equal(clicks, failure === 'settings-unavailable' ? 0 : 1);
    assert.deepEqual(updates, failure === 'settings-unavailable' ? [] : [0, 321]);
    const record = JSON.parse(fs.readFileSync(path.join(directory, 'steps.jsonl'), 'utf8'));
    if (failure.includes('restore'))
      assert.match(record.settingsRestoreError, /idle restore failed/);
    if (failure === 'primary-and-restore') assert.match(record.error, /expected/);
  });
}

test('iOS transient observation uses no Android settings commands', async (t) => {
  const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
  let clicked = false;
  Object.assign(globalThis, {
    driver: { isAndroid: false },
    browser: { waitUntil: async (probe: () => Promise<boolean>) => assert.ok(await probe()) },
    $: () => ({
      waitForDisplayed: async () => {},
      isDisplayed: async () => clicked,
      click: async () => {
        clicked = true;
      },
    }),
  });
  t.after(() => Object.assign(globalThis, previous));
  await tapAndExpect({ id: 'N1' }, { appeared: [{ id: 'WarningToast' }] });
});
