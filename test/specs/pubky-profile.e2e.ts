import {
  completeOnboarding,
  doNavigationClose,
  elementById,
  elementByText,
  getSeed,
  restoreWallet,
  sleep,
  swipeFullScreen,
  tap,
  waitForBackup,
} from '../helpers/actions';
import { STAGING_TEST_CONTACTS } from '../helpers/fixtures';
import { openContacts, openProfile } from '../helpers/navigation';
import {
  addContact,
  ADD_CONTACT_INVALID_KEY_MESSAGE_SNIPPET,
  ADD_CONTACT_OWN_PUBKY_MESSAGE_SNIPPET,
  createProfile,
  deleteContact,
  deleteProfile,
  openEditProfile,
  readPubkyFromProfileCopy,
  removeEditProfileLinkAt,
  removeEditProfileTag,
  saveEditProfile,
  updateProfile,
  type ProfileDetails,
  verifyContactRowDisplayed,
  verifyContactRowNotDisplayed,
  verifyProfileDetails,
  verifyPubkyString,
} from '../helpers/profile';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

// Covers scenarios from docs/pubky-profile-manual-e2e.md.
// Each test reinstalls + onboards so any single test can be run in isolation
// (e.g. `--mochaOpts.grep "@pubky_profile_2"` or `"@pubky_profile_3"`).
describe('@pubky_profile - Pubky profile', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  // Section A: with no profile, every entry point must funnel into the choice screen.
  describe('Gating (no profile)', () => {
    ciIt('@pubky_profile_1 - Contacts/profile entry points lead to choice screen', async () => {
      // Header profile button → ProfileIntro → PubkyChoice
      await tap('ProfileButton');
      await elementById('ProfileIntro').waitForDisplayed();
      await tap('ProfileIntro-button');
      await elementById('PubkyChoiceCreate').waitForDisplayed();
      await elementById('PubkyChoiceImport').waitForDisplayed();

      await doNavigationClose();

      // Drawer → Contacts → ContactsIntro → PubkyChoice
      // (profile intro already dismissed above, so contacts intro skips it)
      await openContacts();
      await elementById('ContactsIntro').waitForDisplayed();
      await tap('ContactsIntro-button');
      await elementById('PubkyChoiceCreate').waitForDisplayed();

      await sleep(500);
      await doNavigationClose();

      // Drawer → Profile → straight into PubkyChoice
      await openProfile();
      await elementById('PubkyChoiceCreate').waitForDisplayed();
      await elementById('PubkyChoiceImport').waitForDisplayed();
    });
  });

  // Section B (charter): create profile, copy pubky, edit, add contact, persistence (relaunch + restore),
  // remove link+tag, delete profile, recreate.
  // @pubky_profile_2 — create → copy → update → add staging contact → relaunch/restore (profile + contact) →
  // remove link+tag → delete profile → create → same pubky.
  describe('Create / Edit / Delete profile', () => {
    ciIt(
      '@pubky_profile_2 - Profile and contact persist; delete and recreate same pubky',
      async () => {
        const [stagingContact] = STAGING_TEST_CONTACTS;

        // create profile and verify pubky and details
        const { pubky } = await createProfile({ name: 'Alice' });
        await verifyPubkyString(pubky);
        const copiedPubky = await readPubkyFromProfileCopy();
        await expect(copiedPubky).toBe(pubky.trim());

        // update profile and verify details
        const details = {
          name: 'Bob',
          notes: 'Notes for E2E',
          links: [{ label: 'Website', url: 'https://example.org' }],
          tags: ['cypherpunk'],
        };
        await updateProfile(details);
        await verifyProfileDetails(details);

        await addContact({ pubky: stagingContact.pubky, firstContact: true });
        await verifyContactRowDisplayed(stagingContact.pubky);

        // restart app and verify profile, pubky, and contact
        await launchFreshApp();
        await verifyProfileDetails(details);
        const pubkyAfterRelaunch = await readPubkyFromProfileCopy();
        await expect(pubkyAfterRelaunch).toBe(pubky.trim());
        await verifyContactRowDisplayed(stagingContact.pubky);

        // restore wallet and verify profile, pubky, and contact
        const seed = await getSeed();
        await waitForBackup();
        await restoreWallet(seed);
        await verifyProfileDetails(details);
        const pubkyAfterRestore = await readPubkyFromProfileCopy();
        await expect(pubkyAfterRestore).toBe(pubky.trim());
        await verifyContactRowDisplayed(stagingContact.pubky);

        // remove link and tag and update profile and verify profile details
        await openEditProfile();
        await removeEditProfileLinkAt(0);
        await removeEditProfileTag('cypherpunk');
        await saveEditProfile();
        const detailsAfterRemovals: ProfileDetails = {
          name: 'Bob',
          notes: 'Notes for E2E',
          links: [],
          tags: [],
        };
        await verifyProfileDetails(detailsAfterRemovals);

        // delete profile and create new profile and verify pubky
        await deleteProfile();
        const { pubky: pubkyAfterRecreate } = await createProfile({ name: 'Alice2' });
        await expect(pubkyAfterRecreate.trim()).toBe(pubky.trim());
      }
    );
  });

  // Section B.4: invalid pubky + self-add, then add + delete contacts.
  describe('Contacts', () => {
    ciIt(
      '@pubky_profile_3 - Cannot add invalid or self pubky; can add/delete valid contacts',
      async () => {
        const { pubky } = await createProfile({ name: 'Contact Validation Professor' });

        // invalid pubky
        const invalidPubky = 'pubkyinvalid';
        await addContact({ pubky: invalidPubky, firstContact: true, save: false });
        await expect(elementById('AddContactAdd')).toBeDisabled();
        await elementByText(ADD_CONTACT_INVALID_KEY_MESSAGE_SNIPPET, 'contains').waitForDisplayed();
        await swipeFullScreen('down');

        // self-add
        await addContact({ pubky: pubky, firstContact: false, save: false });
        await expect(elementById('AddContactAdd')).toBeDisabled();
        await elementByText(ADD_CONTACT_OWN_PUBKY_MESSAGE_SNIPPET, 'contains').waitForDisplayed();
        await swipeFullScreen('down');

        // add valid contacts
        for (const [i, stagingContact] of STAGING_TEST_CONTACTS.entries()) {
          await addContact({ pubky: stagingContact.pubky, firstContact: i === 0 });
          await verifyContactRowDisplayed(stagingContact.pubky);
        }

        // delete contacts
        for (const c of STAGING_TEST_CONTACTS) {
          await deleteContact(c.pubky);
          await verifyContactRowNotDisplayed(c.pubky);
        }
      }
    );
  });
});
