import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMyProfile, updateContactProfile, updateProfileDetails } from '../helpers/profile.ts';

for (const contact of [false, true]) {
  test(`Android ${contact ? 'contact' : 'self'} edit rejects a corrupted replacement before Save`, async (t) => {
    const previous = {
      browser: globalThis.browser,
      driver: globalThis.driver,
      $: globalThis.$,
      expect: globalThis.expect,
    };
    const clicks: string[] = [];
    let replacements = 0;
    Object.assign(globalThis, {
      browser: {
        pause: async () => {},
        waitUntil: async (probe: () => Promise<boolean>) => {
          assert.equal(await probe(), true);
        },
      },
      driver: {
        isAndroid: true,
        isIOS: false,
        execute: async (command: string, args: { elementId: string; text: string }) => {
          assert.equal(command, 'mobile: replaceElementValue');
          assert.deepEqual(args, { elementId: 'ProfileEditName', text: 'Bob' });
          replacements++;
          // Reproduce a broken replacement which leaves old input in the field.
        },
      },
      $: (selector: string) => {
        const id = /resourceId\("([^"]+)"\)/.exec(selector)?.[1] ?? selector;
        return {
          elementId: id,
          waitForDisplayed: async () => {},
          isDisplayed: async () => id === 'HeaderMenu',
          click: async () => {
            clicks.push(id);
          },
        };
      },
      expect: () => ({
        toHaveText: async (text: string) => {
          assert.equal('AliceBob', text, 'Wrong field value');
        },
      }),
    });
    t.after(() => Object.assign(globalThis, previous));
    const details = { name: 'Bob', notes: 'New notes', links: [], tags: [] };
    await assert.rejects(
      contact ? updateContactProfile({ pubky: 'pubky-test', details }) : updateMyProfile(details),
      /Wrong field value/
    );
    assert.equal(replacements, 1);
    assert.equal(clicks.includes('ProfileEditSave'), false);
  });
}

test('Android accepts the uppercase name presentation while preserving exact bio text', async (t) => {
  const previous = {
    browser: globalThis.browser,
    driver: globalThis.driver,
    $: globalThis.$,
    expect: globalThis.expect,
  };
  const values: Record<string, string> = { ProfileEditName: 'ALICE', ProfileEditBio: 'Old bio' };
  Object.assign(globalThis, {
    browser: { pause: async () => {} },
    driver: {
      isAndroid: true,
      isIOS: false,
      hideKeyboard: async () => {},
      execute: async (command: string, args: { elementId: string; text: string }) => {
        assert.equal(command, 'mobile: replaceElementValue');
        values[args.elementId] =
          args.elementId === 'ProfileEditName' ? args.text.toUpperCase() : args.text;
      },
    },
    $: (selector: string) => ({
      elementId: /resourceId\("([^"]+)"\)/.exec(selector)?.[1],
      waitForDisplayed: async () => {},
      click: async () => {},
    }),
    expect: (el: { elementId: string }) => ({
      toHaveText: async (text: string) => {
        assert.equal(values[el.elementId], text);
      },
    }),
  });
  t.after(() => Object.assign(globalThis, previous));
  await updateProfileDetails({ name: 'Bob', notes: 'Notes for E2E', links: [], tags: [] });
  assert.deepEqual(values, { ProfileEditName: 'BOB', ProfileEditBio: 'Notes for E2E' });
});
