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
import { openProfile } from './navigation';

/** One link row on the profile (label + URL). */
export type PubkyProfileLink = { label: string; url: string };

/** Expected content on the Profile screen (presentation). */
export type ProfileDetails = {
  name: string;
  notes: string;
  links: PubkyProfileLink[];
  tags: string[];
};

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
 * Navigate from the Wallet home to the PubkyChoice screen, covering the
 * "first visit" case where ProfileIntro is shown before the choice screen.
 *
 * Idempotent enough to be called whether the ProfileIntro has already been
 * dismissed on a prior run in the same app session.
 */
export async function openPubkyChoice() {
  await tap('ProfileButton');

  // On first visit, the ProfileIntro screen is shown as a gate to PubkyChoice.
  const intro = await elementById('ProfileIntro-button');
  const introShown = await intro.isDisplayed().catch(() => false);
  if (introShown) {
    await tap('ProfileIntro-button');
  }

  await elementById('PubkyChoiceCreate').waitForDisplayed();
}

/**
 * Opens Profile → Edit, sets name, notes (bio), adds links and tags in order, then saves.
 *
 * Best used when links/tags are empty (e.g. right after {@link createProfile}); replacing
 * or removing existing links/tags is not handled here.
 */
export async function updateProfile(details: ProfileDetails) {
  await openProfile();
  await tap('ProfileEdit');
  await elementById('ProfileEditName').waitForDisplayed();

  await typeText('ProfileEditName', details.name);
  await confirmInputOnKeyboard();
  await typeText('ProfileEditBio', details.notes);
  await elementByText('YOUR PUBKY').click();

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

  await swipeFullScreen('up');
  await tap('ProfileEditSave');
  // iOS shows toasts in a separate window; drag-dismiss via waitForToast hits wrong coords.
  // Auto-hide clears the overlay so the next openProfile() can reach the drawer.
  await waitForToast('ProfileUpdatedToast', { waitToDisappear: driver.isIOS });
  await elementById('ProfileEdit').waitForDisplayed({ timeout: 60_000 });
}

/**
 * Asserts Profile screen shows the given name (display is uppercase), notes, links by index,
 * and tag chips (`Tag-<tag>`). Link row labels use uppercase on Android (`Text13Up`); both sides
 * are compared uppercase so expectations can use plain casing (e.g. `Website`).
 */
export async function verifyProfileDetails(expected: ProfileDetails) {
  await openProfile();
  await elementById('ProfileCopy').waitForDisplayed();
  await swipeFullScreen('up');

  const nameEl = await elementById('ProfileViewName');
  await nameEl.waitForDisplayed();
  const nameText = await getAccessibleText(nameEl);
  await expect(normalizeProfileDisplayName(nameText)).toBe(
    normalizeProfileDisplayName(expected.name)
  );

  const notesTrimmed = expected.notes.trim();
  if (notesTrimmed.length > 0) {
    const notesEl = await elementById('ProfileViewNotes');
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
 * Returns the wallet-derived pubky string (same as encoded in the profile QR).
 */
export async function createProfile({ name }: { name: string }): Promise<{ pubky: string }> {
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
  await tap('PayContactsContinue');

  // Landed on the user's Profile screen. Both platforms uppercase the name
  // in CenteredProfileHeader (iOS: Text(name.uppercased()); Android: Display→uppercase()).
  await elementById('ProfileEdit').waitForDisplayed();
  await elementById('ProfileCopy').waitForDisplayed();
  await elementById('ProfileShare').waitForDisplayed();
  await elementByText(name.toUpperCase()).waitForDisplayed();

  const pubky = await getUriFromQRCode();
  console.info('→ Created profile with name:', name, 'and pubky:', pubky);
  return { pubky };
}
