import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACTS_SCREEN_IDS,
  CONTACT_SAVE_TIMEOUT_MS,
  PROFILE_AFTER_PAY_CONTACTS_TIMEOUT_MS,
  isContactsScreenOpen,
  shouldRetryContactSave,
} from '../helpers/pubky-screen.ts';

test('a closed contacts list still opens from the drawer on either platform', () => {
  assert.equal(isContactsScreenOpen([]), false);
  assert.equal(
    isContactsScreenOpen(['HeaderMenu', 'DrawerContacts', 'TotalBalance-primary']),
    false
  );
});

test('each contacts-screen id skips the drawer on either platform', () => {
  for (const id of CONTACTS_SCREEN_IDS) {
    assert.equal(isContactsScreenOpen([id]), true, id);
  }
});

test('contact save retries once only when Save is enabled and details never opened', () => {
  const idleSave = {
    detailsVisible: false,
    saveDisplayed: true,
    saveEnabled: true,
    alreadyRetried: false,
  };
  assert.equal(shouldRetryContactSave(idleSave), true);
  assert.equal(shouldRetryContactSave({ ...idleSave, alreadyRetried: true }), false);
  assert.equal(shouldRetryContactSave({ ...idleSave, detailsVisible: true }), false);
  assert.equal(
    shouldRetryContactSave({ ...idleSave, saveDisplayed: false, saveEnabled: false }),
    false
  );
  assert.equal(shouldRetryContactSave({ ...idleSave, saveEnabled: false }), false);
});

test('profile and contact saves wait longer than the 30s default without changing the fast path', () => {
  assert.equal(PROFILE_AFTER_PAY_CONTACTS_TIMEOUT_MS, 60_000);
  assert.equal(CONTACT_SAVE_TIMEOUT_MS, 60_000);
});
