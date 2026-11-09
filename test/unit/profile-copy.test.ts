import test from 'node:test';
import assert from 'node:assert/strict';
import { readPubkyFromProfileCopy } from '../helpers/profile.ts';

const expectedPubky = 'pubky-profile-key';

function profileScreen({
  copiedValue = expectedPubky,
  copyWorks = true,
  clearWorks = true,
  delayedReads = 0,
} = {}) {
  let clipboard = expectedPubky;
  let copyTapped = false;
  let reads = 0;
  const select = (selector: string) => {
    const id = selector.slice(1);
    return {
      isDisplayed: async () => id === 'HeaderMenu',
      waitForDisplayed: async () => {
        assert.notEqual(id, 'ProfilePubkyCopiedToast', 'Copy must not depend on popup visibility');
      },
      click: async () => {
        if (id === 'ProfileCopy') copyTapped = true;
      },
    };
  };
  return {
    $: select,
    browser: {
      pause: async () => {},
      waitUntil: async (probe: () => Promise<boolean>, { timeoutMsg = '' } = {}) => {
        for (let i = 0; i < 10; i++) {
          if (await probe()) return;
        }
        throw new Error(timeoutMsg);
      },
    },
    driver: {
      isIOS: true,
      isAndroid: false,
      execute: async (command: string, args: { content?: string }) => {
        if (command === 'mobile: setPasteboard') {
          if (clearWorks) clipboard = args.content!;
          return;
        }
        assert.equal(command, 'mobile: getPasteboard');
        if (copyTapped && copyWorks && reads++ >= delayedReads) clipboard = copiedValue;
        return clipboard;
      },
    },
    wasCopyTapped: () => copyTapped,
  };
}

for (const scenario of [
  { name: 'accepts a fresh correct copy when the popup was already missed' },
  { name: 'waits for the copied value', delayedReads: 3 },
  {
    name: 'rejects an unchanged old clipboard value when Copy does nothing',
    copyWorks: false,
    fails: /did not write the expected pubky/,
  },
  {
    name: 'rejects a fresh wrong profile key',
    copiedValue: 'pubky-wrong-profile',
    fails: /did not write the expected pubky/,
  },
  {
    name: 'fails before Copy if the old clipboard cannot be cleared',
    clearWorks: false,
    fails: /Could not clear iOS clipboard/,
  },
]) {
  test(`iOS Profile Copy: ${scenario.name}`, async (t) => {
    const previous = { browser: globalThis.browser, driver: globalThis.driver, $: globalThis.$ };
    const screen = profileScreen(scenario);
    Object.assign(globalThis, { browser: screen.browser, driver: screen.driver, $: screen.$ });
    t.after(() => Object.assign(globalThis, previous));

    const copy = readPubkyFromProfileCopy(expectedPubky);
    if (scenario.fails) {
      await assert.rejects(copy, scenario.fails);
      if (scenario.clearWorks === false) assert.equal(screen.wasCopyTapped(), false);
    } else {
      assert.equal(await copy, expectedPubky);
    }
  });
}
