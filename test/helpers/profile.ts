import {
  confirmInputOnKeyboard,
  elementById,
  elementByText,
  getAccessibleText,
  getClipboardPlaintext,
  getUriFromQRCode,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
  waitForToast,
} from './actions';
import { openContacts, openProfile } from './navigation';

/** One link row on the profile (label + URL). */
export type PubkyProfileLink = { label: string; url: string };

/** Expected content on the Profile screen (presentation). */
export type ProfileDetails = {
  name: string;
  notes: string;
  links: PubkyProfileLink[];
  tags: string[];
};

export type ProfileDetailsIdPrefix = 'ProfileView' | 'ContactView';

function normalizeProfileDisplayName(s: string) {
  return s.trim().toUpperCase();
}

export async function verifyPubkyString(pubky: string) {
  await expect(pubky.length).toBeGreaterThan(0);
  await expect(pubky.startsWith('pubky')).toBe(true);
}

/**
 * Taps Profile Copy and returns the pubky string from the system clipboard
 * (same value as {@link getUriFromQRCode} on the profile QR when copy works).
 * Waits for the copy confirmation toast; on iOS waits until it disappears so the overlay
 * does not interfere with later gestures.
 */
export async function readPubkyFromProfileCopy(): Promise<string> {
  await openProfile();
  await tap('ProfileCopy');
  await waitForToast('ProfilePubkyCopiedToast', { waitToDisappear: driver.isIOS });
  return (await getClipboardPlaintext()).trim();
}

/**
 * Profile → Edit → scroll to delete → confirm. Ends on {@link PubkyChoice} (create / import).
 */
export async function deleteProfile() {
  await openEditProfile();
  await swipeFullScreen('up', { upStartYPercent: 0.3 });
  await sleep(500);
  await tap('ProfileEditDelete');
  const confirm = await elementByText('Yes, Delete', 'exact');
  await confirm.waitForDisplayed();
  await confirm.click();
  await elementById('PubkyChoiceCreate').waitForDisplayed();
}

export async function cleanupProfile(label: string) {
  try {
    await deleteProfile();
    console.info(`Cleaned up Pubky profile for ${label}`);
  } catch (error) {
    console.error(`Could not cleanup Pubky profile for ${label}:`, error);
  }
}

/**
 * Navigate from the Wallet home to the PubkyChoice screen, covering the
 * "first visit" case where ProfileIntro is shown before the choice screen.
 *
 * Idempotent enough to be called whether the ProfileIntro has already been
 * dismissed on a prior run in the same app session.
 */
export async function openPubkyChoice() {
  try {
    await elementById('PubkyChoiceCreate').waitForDisplayed({ timeout: 2000 });
    return;
  } catch {
    /* not already on choice */
  }

  await tap('ProfileButton');

  // On first visit, the ProfileIntro screen is shown as a gate to PubkyChoice.
  const intro = await elementById('ProfileIntro-button');
  const introShown = await intro.isDisplayed().catch(() => false);
  if (introShown) {
    await tap('ProfileIntro-button');
  }

  await elementById('PubkyChoiceCreate').waitForDisplayed();
}

export async function openEditProfile() {
  await openProfile();
  await tap('ProfileEdit');
  await elementById('ProfileEditName').waitForDisplayed();
}

export async function openEditContact(publicKey: string) {
  await openContacts();
  await elementById(`Contact_${publicKey}`).waitForDisplayed();
  await tap(`Contact_${publicKey}`);
  await tap('ContactEdit');
  await elementById('ProfileEditName').waitForDisplayed();
}

/** Scroll, Save, wait for success toast; lands back on the read-only profile screen. */
export async function saveEditProfile() {
  await swipeFullScreen('up');
  await tap('ProfileEditSave');
  // iOS shows toasts in a separate window; drag-dismiss via waitForToast hits wrong coords.
  // Auto-hide clears the overlay so the next openProfile() can reach the drawer.
  await waitForToast('ProfileUpdatedToast', { waitToDisappear: driver.isIOS });
  await elementById('ProfileEdit').waitForDisplayed({ timeout: 60_000 });
}

export async function saveEditContact() {
  await swipeFullScreen('up');
  await tap('ProfileEditSave');
  await waitForToast('ContactUpdatedToast', { waitToDisappear: driver.isIOS });
  await elementById('ContactEdit').waitForDisplayed({ timeout: 60_000 });
}

/**
 * Substrings of the localized add-contact validation errors (English builds).
 * Matches `contacts__add_error_invalid_key` / `contacts__add_error_self` on Android and iOS.
 */
export const ADD_CONTACT_INVALID_KEY_MESSAGE_SNIPPET = 'Invalid pubky key format';
/** Avoids apostrophe in iOS predicate `CONTAINS` matchers; matches EN copy around "add your own pubky". */
export const ADD_CONTACT_OWN_PUBKY_MESSAGE_SNIPPET = 'add your own pubky';
export const ADD_CONTACT_DUPLICATE_CONTACT_MESSAGE_SNIPPET = 'already in your contacts';

/**
 * Opens Contacts → add (+) → enters `pubky` in the sheet and dismisses the keyboard.
 * - `save: true` (default): taps Add, waits for the add screen, Save, and lands back on the list.
 * - `save: false`: returns with the sheet still open so the test can assert inline validation
 *   (e.g. error text or Add disabled) and dismiss or navigate as needed.
 * - On the first Contacts visit, `ContactsIntro-button` opens the add sheet directly.
 * - If there are no contacts after the intro is gone, use `ContactsEmptyAddButton`.
 * - Otherwise use `ContactsAddButton` in the header.
 */
export async function addContact({
  pubky,
  save = true,
  firstContact = false,
}: {
  pubky: string;
  save?: boolean;
  firstContact?: boolean;
}): Promise<void> {
  await openContacts();
  await sleep(500);
  const introButton = await elementById('ContactsIntro-button');
  if (await introButton.isDisplayed().catch(() => false)) {
    await tap('ContactsIntro-button');
  } else if (
    firstContact ||
    (await elementById('ContactsEmptyAddButton')
      .isDisplayed()
      .catch(() => false))
  ) {
    await elementById('ContactsEmptyAddButton').waitForDisplayed();
    await tap('ContactsEmptyAddButton');
  } else {
    await elementById('ContactsAddButton').waitForDisplayed();
    await tap('ContactsAddButton');
  }

  await elementById('AddContactPubkyField').waitForDisplayed();
  await typeText('AddContactPubkyField', pubky);
  await confirmInputOnKeyboard();
  if (!save) {
    return;
  }

  await tap('AddContactAdd');
  await elementById('AddContactSave').waitForDisplayed();
  await tap('AddContactSave');
  // Landing on contact details screen
  await elementById('ContactViewName').waitForDisplayed();
  await elementById('ContactPay').waitForDisplayed();
  await elementById('ContactActivity').waitForDisplayed();
  await elementById('ContactCopy').waitForDisplayed();
  await elementById('ContactShare').waitForDisplayed();
  await elementById('ContactDelete').waitForDisplayed();
  await elementById('ContactAddTag').waitForDisplayed();
}

export async function verifyAddContactRoute(
  publicKey: string,
  { ableToPay }: { ableToPay?: boolean } = {}
) {
  await browser.waitUntil(
    async () =>
      (await elementById('AddContactRetrievingTitle')
        .isDisplayed()
        .catch(() => false)) ||
      (await elementById('AddContactSave')
        .isDisplayed()
        .catch(() => false)) ||
      (await elementById('AddContactPay')
        .isDisplayed()
        .catch(() => false)),
    {
      timeoutMsg: `expected add contact route for ${publicKey}`,
    }
  );

  if (ableToPay === undefined) {
    return;
  }

  await elementById('AddContactSave').waitForDisplayed();
  await elementById('AddContactPay').waitForDisplayed({
    reverse: !ableToPay,
    timeoutMsg: `add contact ${publicKey}: expected AddContactPay ${ableToPay ? 'visible' : 'hidden'} (fixture ableToPay=${ableToPay})`,
  });
}

/** Opens Contacts and waits for a row with test id `Contact_<publicKey>`. */
export async function verifyContactRowDisplayed(publicKey: string) {
  await openContacts();
  await elementById(`Contact_${publicKey}`).waitForDisplayed();
}

/**
 * Opens the contact (list → detail → edit), scrolls to the delete action, and confirms
 * the dialog (`Yes, Delete` on both platforms). Lands back on the contacts list.
 */
export async function deleteContact(publicKey: string) {
  const rowId = `Contact_${publicKey}`;
  await openContacts();
  await elementById(rowId).waitForDisplayed();
  await tap(rowId);
  await elementById('ContactEdit').waitForDisplayed();
  await tap('ContactEdit');
  await elementById('ProfileEditName').waitForDisplayed();
  await swipeFullScreen('up', { upStartYPercent: 0.3 });
  await sleep(500);
  await tap('ProfileEditDelete');
  const confirm = await elementByText('Yes, Delete', 'exact');
  await confirm.waitForDisplayed();
  await confirm.click();
  await waitForToast('ContactDeletedToast', { waitToDisappear: driver.isIOS });
  await elementById('ContactsAddButton').waitForDisplayed();
}

/** Opens Contacts and asserts no row for `Contact_<publicKey>`. */
export async function verifyContactRowNotDisplayed(publicKey: string) {
  await openContacts();
  await expect(await elementById(`Contact_${publicKey}`).isExisting()).toBe(false);
}

/**
 * Removes a link row by index (0-based) on the edit form. When removing multiple rows,
 * remove the highest index first so indices stay stable, or call once per edit-save cycle.
 */
export async function removeEditProfileLinkAt(index: number) {
  const id = `ProfileEditLinkRemove_${index}`;
  await swipeFullScreen('up', { upStartYPercent: 0.3 });
  await tap(id);
  await sleep(300);
}

/**
 * Removes a tag on the edit form via the chip’s delete control (`Tag-<tag>-delete` on both platforms).
 */
export async function removeEditProfileTag(tag: string) {
  const id = `Tag-${tag}-delete`;
  await swipeFullScreen('up', { upStartYPercent: 0.3 });
  await tap(id);
  await sleep(300);
}

export async function updateContactProfile({
  pubky,
  details,
}: {
  pubky: string;
  details: ProfileDetails;
}) {
  await openEditContact(pubky);
  await updateProfileDetails(details);
  await saveEditContact();
}

export async function updateMyProfile(details: ProfileDetails) {
  await openEditProfile();
  await updateProfileDetails(details);
  await saveEditProfile();
}

/**
 * Sets name, notes (bio), adds links and tags in order, then saves.
 *
 * Best used when links/tags are empty (e.g. right after {@link createProfile}) or when only
 * adding; use {@link removeEditProfileLinkAt} / {@link removeEditProfileTag} and {@link saveEditProfile} for removals.
 */
export async function updateProfileDetails(details: ProfileDetails) {
  await typeText('ProfileEditName', details.name);
  await confirmInputOnKeyboard();
  await typeText('ProfileEditBio', details.notes);
  await elementByText('PUBKY').click();

  for (const link of details.links) {
    await tap('ProfileEditAddLink');
    await elementById('AddLinkLabel').waitForDisplayed();
    await typeText('AddLinkLabel', link.label);
    await typeText('AddLinkUrl', link.url);
    await tap('AddLinkSave');
    await sleep(400);
  }

  for (const tag of details.tags) {
    await tap('ProfileEditAddTag');
    await elementById('AddTagInput').waitForDisplayed();
    await typeText('AddTagInput', tag);
    await tap('AddTagSave');
    await sleep(400);
  }
}

export async function verifyContactDetails({
  pubky,
  details,
}: {
  pubky: string;
  details: ProfileDetails;
}) {
  await openContacts();
  await elementById(`Contact_${pubky}`).waitForDisplayed();
  await tap(`Contact_${pubky}`);
  await elementById('ContactCopy').waitForDisplayed();
  await verifyProfileDetails(details, { idPrefix: 'ContactView' });
}

export async function verifyMyProfileDetails(expected: ProfileDetails) {
  await openProfile();
  await elementById('ProfileCopy').waitForDisplayed();
  await verifyProfileDetails(expected, { idPrefix: 'ProfileView' });
}

/**
 * Asserts Profile screen shows the given name (display is uppercase), notes, links by index,
 * and tag chips (`Tag-<tag>`). Link row labels use uppercase on Android (`Text13Up`); both sides
 * are compared uppercase so expectations can use plain casing (e.g. `Website`).
 */
export async function verifyProfileDetails(
  expected: ProfileDetails,
  { idPrefix = 'ProfileView' }: { idPrefix?: ProfileDetailsIdPrefix } = {}
) {
  await swipeFullScreen('up');

  const nameEl = await elementById(`${idPrefix}Name`);
  await nameEl.waitForDisplayed();
  const nameText = await getAccessibleText(nameEl);
  await expect(normalizeProfileDisplayName(nameText)).toBe(
    normalizeProfileDisplayName(expected.name)
  );

  const notesTrimmed = expected.notes.trim();
  if (notesTrimmed.length > 0) {
    const notesEl = await elementById(`${idPrefix}Notes`);
    await notesEl.waitForDisplayed();
    await expect((await getAccessibleText(notesEl)).trim()).toBe(notesTrimmed);
  }

  for (let i = 0; i < expected.links.length; i++) {
    const link = expected.links[i];
    const labelEl = await elementById(`ProfileLinkLabel_${i}`);
    const valueEl = await elementById(`ProfileLinkValue_${i}`);
    await labelEl.waitForDisplayed();
    await valueEl.waitForDisplayed();
    await expect(normalizeProfileDisplayName(await getAccessibleText(labelEl))).toBe(
      normalizeProfileDisplayName(link.label)
    );
    await expect((await getAccessibleText(valueEl)).trim()).toBe(link.url.trim());
  }

  for (const tag of expected.tags) {
    const tagEl = await elementById(`Tag-${tag}`);
    await tagEl.waitForDisplayed();
  }
}

/**
 * Full happy-path profile creation: PubkyChoice → Create → Pay Contacts → Profile.
 *
 * Assumes the Wallet home screen is visible. Requires a healthy
 * `homegate.staging.pubky.app/ip_verification` endpoint; the Save call
 * may take several seconds while the identity is derived and signed up.
 *
 * @param payContactsOption - When `true` (default), leaves the Pay Contacts “share payment data”
 *   toggle as shipped (on by default). When `false`, taps `PayContactsToggle` once to turn it off before Continue.
 *
 * Returns the wallet-derived pubky string (same as encoded in the profile QR).
 */
export async function createProfile({
  name,
  payContactsOption = true,
}: {
  name: string;
  payContactsOption?: boolean;
}): Promise<{ pubky: string }> {
  await openPubkyChoice();
  await tap('PubkyChoiceCreate');

  // Save is disabled with an empty name; enabled once a name is entered.
  await expect(elementById('CreateProfileSave')).toBeDisabled();
  await elementById('CreateProfileUsername').waitForDisplayed();
  await typeText('CreateProfileUsername', name);
  await tap('CreateProfileSave');

  // Pay Contacts onboarding is shown once after successful signup.
  await elementById('PayContactsContinue').waitForDisplayed({ timeout: 60_000 });
  await sleep(300);
  if (!payContactsOption) {
    await tap('PayContactsToggle');
    await sleep(300);
  }
  await tap('PayContactsContinue');

  // Landed on the user's Profile screen. Both platforms uppercase the name
  // in CenteredProfileHeader (iOS: Text(name.uppercased()); Android: Display→uppercase()).
  await elementById('ProfileEdit').waitForDisplayed();
  await elementById('ProfileCopy').waitForDisplayed();
  await elementById('ProfileShare').waitForDisplayed();
  await elementByText(name.toUpperCase()).waitForDisplayed();

  const pubky = await getUriFromQRCode({ testId: 'ProfileQRCode' });
  console.info('→ Created profile with name:', name, 'and pubky:', pubky);
  return { pubky };
}
