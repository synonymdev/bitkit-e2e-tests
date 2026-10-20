/**
 * Contacts-list markers shared by Android resource ids and iOS accessibility ids.
 * HeaderMenu and DrawerContacts are not included: those are how a closed list is opened.
 */
export const CONTACTS_SCREEN_IDS = [
  'ContactsAddButton',
  'ContactsEmptyAddButton',
  'ContactsIntro',
  'ContactsIntro-button',
] as const;

export function isContactsScreenOpen(visibleIds: readonly string[]): boolean {
  const visible = new Set(visibleIds);
  return CONTACTS_SCREEN_IDS.some((id) => visible.has(id));
}

/**
 * Pay Contacts continue enables contact payments against staging Pubky, then opens Profile.
 * The 30s default expires while that call is still running. saveEditProfile already allows 60s.
 */
export const PROFILE_AFTER_PAY_CONTACTS_TIMEOUT_MS = 60_000;

/**
 * Saving a contact publishes to Pubky. A transport failure leaves Add Contact up with Save
 * enabled again; a save that is still running keeps Save disabled, so it must not be tapped twice.
 */
export const CONTACT_SAVE_TIMEOUT_MS = 60_000;

export function shouldRetryContactSave({
  detailsVisible,
  saveDisplayed,
  saveEnabled,
  alreadyRetried,
}: {
  detailsVisible: boolean;
  saveDisplayed: boolean;
  saveEnabled: boolean;
  alreadyRetried: boolean;
}): boolean {
  return !alreadyRetried && !detailsVisible && saveDisplayed && saveEnabled;
}
