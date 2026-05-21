import {
  completeOnboarding,
  doNavigationClose,
  elementById,
  elementByText,
  enterAddress,
  enterAddressViaScanPrompt,
  getSeed,
  restoreWallet,
  sleep,
  swipeFullScreen,
  tap,
  waitForBackup,
} from '../helpers/actions';
import { STAGING_TEST_CONTACTS } from '../helpers/fixtures';
import { openContacts, openProfile } from '../helpers/navigation';
import { enablePaykitUi } from '../helpers/paykit';
import {
  addContact,
  ADD_CONTACT_INVALID_KEY_MESSAGE_SNIPPET,
  ADD_CONTACT_OWN_PUBKY_MESSAGE_SNIPPET,
  createProfile,
  cleanupProfile,
  deleteContact,
  deleteProfile,
  discardAddContactRoute,
  openEditProfile,
  readPubkyFromProfileCopy,
  removeEditProfileLinkAt,
  removeEditProfileTag,
  saveEditProfile,
  updateMyProfile,
  updateContactProfile,
  type ProfileDetails,
  verifyContactRowDisplayed,
  verifyContactRowNotDisplayed,
  verifyMyProfileDetails,
  verifyPubkyString,
  verifyContactDetails,
  verifyAddContactRoute,
} from '../helpers/profile';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

// Covers scenarios from docs/pubky-profile-manual-e2e.md.
// Each test reinstalls + onboards so any single test can be run in isolation
// (e.g. `--mochaOpts.grep "@pubky_profile_2"` or `"@pubky_profile_3"`).
describe('@pubky @pubky_profile - Pubky profile', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await enablePaykitUi();
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
  describe('Profile - create, edit, delete', () => {
    ciIt(
      '@pubky_profile_2 - Profile and contact persist; delete and recreate same pubky',
      async () => {
        const [stagingContact] = STAGING_TEST_CONTACTS;
        let hasProfile = false;

        try {
          // create profile and verify pubky and details
          const { pubky } = await createProfile({ name: 'Alice' });
          hasProfile = true;
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
          await updateMyProfile(details);
          await verifyMyProfileDetails(details);

          await addContact({ pubky: stagingContact.pubky, firstContact: true });
          await verifyContactRowDisplayed(stagingContact.pubky);

          // restart app and verify profile, pubky, and contact
          await launchFreshApp();
          await verifyMyProfileDetails(details);
          const pubkyAfterRelaunch = await readPubkyFromProfileCopy();
          await expect(pubkyAfterRelaunch).toBe(pubky.trim());
          await verifyContactRowDisplayed(stagingContact.pubky);

          // restore wallet and verify profile, pubky, and contact
          const seed = await getSeed();
          await waitForBackup();
          await restoreWallet(seed);
          if (driver.isIOS) await enablePaykitUi();
          await verifyMyProfileDetails(details);
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
          await verifyMyProfileDetails(detailsAfterRemovals);

          // delete profile and create new profile and verify pubky
          await deleteProfile();
          hasProfile = false;
          const { pubky: pubkyAfterRecreate } = await createProfile({ name: 'Alice2' });
          hasProfile = true;
          await expect(pubkyAfterRecreate.trim()).toBe(pubky.trim());
        } finally {
          if (hasProfile) {
            await cleanupProfile('@pubky_profile_2');
          }
        }
      }
    );
  });

  // Section B.4: invalid pubky + self-add, then add + delete contacts.
  describe('Contacts - add, delete, edit', () => {
    ciIt(
      '@pubky_profile_3 - Cannot add invalid or self pubky; can add/delete valid contacts',
      async () => {
        let hasProfile = false;

        try {
          const { pubky } = await createProfile({ name: 'Contact Validation Professor' });
          hasProfile = true;
          const [firstStagingContact] = STAGING_TEST_CONTACTS;

          // invalid pubky
          const invalidPubky = 'pubkyinvalid';
          await addContact({ pubky: invalidPubky, firstContact: true, save: false });
          await expect(elementById('AddContactAdd')).toBeDisabled();
          await elementByText(
            ADD_CONTACT_INVALID_KEY_MESSAGE_SNIPPET,
            'contains'
          ).waitForDisplayed();
          await swipeFullScreen('down');

          // self-add
          await addContact({ pubky: pubky, firstContact: false, save: false });
          await expect(elementById('AddContactAdd')).toBeDisabled();
          await elementByText(ADD_CONTACT_OWN_PUBKY_MESSAGE_SNIPPET, 'contains').waitForDisplayed();
          await swipeFullScreen('down');

          await doNavigationClose();

          // route unsaved pubky from Send → Enter manually
          await enterAddress(firstStagingContact.pubky, { acceptCameraPermission: true });
          await verifyAddContactRoute(firstStagingContact.pubky, {
            ableToPay: firstStagingContact.ableToPay,
          });
          await discardAddContactRoute();

          // route unsaved pubky from QR scanner prompt
          await enterAddressViaScanPrompt(firstStagingContact.pubky, {
            acceptCameraPermission: false,
          });
          await verifyAddContactRoute(firstStagingContact.pubky, {
            ableToPay: firstStagingContact.ableToPay,
          });
          await discardAddContactRoute();

          // add valid contacts
          for (const [i, stagingContact] of STAGING_TEST_CONTACTS.entries()) {
            await addContact({ pubky: stagingContact.pubky, firstContact: i === 0 });
            await verifyContactRowDisplayed(stagingContact.pubky);
          }

          // try add duplicate contact
          // await addContact({ pubky: STAGING_TEST_CONTACTS[0].pubky, firstContact: false });
          // await expect(elementById('AddContactAdd')).toBeDisabled();
          // await elementByText(ADD_CONTACT_DUPLICATE_CONTACT_MESSAGE_SNIPPET, 'contains').waitForDisplayed();
          // await swipeFullScreen('down');

          // delete contacts
          for (const c of STAGING_TEST_CONTACTS) {
            await deleteContact(c.pubky);
            await verifyContactRowNotDisplayed(c.pubky);
          }
        } finally {
          if (hasProfile) {
            await cleanupProfile('@pubky_profile_3');
          }
        }
      }
    );

    ciIt(
      '@pubky_profile_4 - Editing wallet A contact on wallet B does not change wallet A profile',
      async () => {
        let currentWallet: 'A' | 'B' | null = null;
        let seedA: string | undefined;

        const detailsA: ProfileDetails = {
          name: 'Alice Wallet A',
          notes: 'Wallet A original notes',
          links: [{ label: 'A Website', url: 'https://a.example.org' }],
          tags: ['wallet-a-tag'],
        };

        try {
          // Wallet A: create and customize profile, then capture seed.
          const { pubky: pubkyA } = await createProfile({ name: 'Alice Wallet A' });
          currentWallet = 'A';
          await updateMyProfile(detailsA);
          await verifyMyProfileDetails(detailsA);
          seedA = await getSeed();

          // Wallet B: fresh install + onboarding, create profile, then add wallet A as contact.
          await reinstallApp();
          currentWallet = null;
          await completeOnboarding();
          await enablePaykitUi();
          await createProfile({ name: 'Bob Wallet B' });
          currentWallet = 'B';

          await addContact({ pubky: pubkyA, firstContact: true });
          await verifyContactRowDisplayed(pubkyA);

          // Wallet B: edit wallet A contact.
          const detailsAUpdated: ProfileDetails = {
            name: 'Alice Edited On B',
            notes: 'Edited from wallet B',
            links: [],
            tags: [],
          };
          await updateContactProfile({ pubky: pubkyA, details: detailsAUpdated });
          await verifyContactDetails({ pubky: pubkyA, details: detailsAUpdated });

          await cleanupProfile('@pubky_profile_4 wallet B');
          currentWallet = null;

          // Restore wallet A and verify wallet A profile is unchanged by wallet B contact edits.
          await restoreWallet(seedA);
          if (driver.isIOS) await enablePaykitUi();
          currentWallet = 'A';
          await verifyMyProfileDetails(detailsA);
        } finally {
          if (currentWallet != null) {
            await cleanupProfile(`@pubky_profile_4 wallet ${currentWallet}`);
          }

          if (seedA !== undefined && currentWallet !== 'A') {
            try {
              await restoreWallet(seedA);
              if (driver.isIOS) await enablePaykitUi();
              await cleanupProfile('@pubky_profile_4 wallet A');
            } catch (error) {
              console.warn('Could not restore and cleanup wallet A profile:', error);
            }
          }
        }
      }
    );
  });
});
