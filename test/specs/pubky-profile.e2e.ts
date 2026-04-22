import { completeOnboarding, doNavigationClose, elementById, tap } from '../helpers/actions';
import { openContacts, openProfile } from '../helpers/navigation';
import {
  createProfile,
  deleteProfile,
  openEditProfile,
  readPubkyFromProfileCopy,
  removeEditProfileLinkAt,
  removeEditProfileTag,
  saveEditProfile,
  updateProfile,
  type ProfileDetails,
  verifyProfileDetails,
  verifyPubkyString,
} from '../helpers/profile';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

// Covers scenarios from docs/pubky-profile-manual-e2e.md.
// Each test reinstalls + onboards so any single test can be run in isolation
// (e.g. `--mochaOpts.grep "@pubky_profile_2"`).
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

      await doNavigationClose();

      // Drawer → Profile → straight into PubkyChoice
      await openProfile();
      await elementById('PubkyChoiceCreate').waitForDisplayed();
      await elementById('PubkyChoiceImport').waitForDisplayed();
    });
  });

  // Section B (charter): create profile, copy pubky, edit fields, persistence, delete, recreate.
  // @pubky_profile_2 — end-to-end: create → copy pubky → edit (name, notes, link, tag) → verify on
  // profile → terminate/relaunch → data + pubky unchanged → open edit → remove link & tag → save →
  // verify empty links/tags → delete profile → create new profile → same pubky (seed-derived).
  describe('Create / Edit / Delete profile', () => {
    ciIt(
      '@pubky_profile_2 - Create, edit, relaunch keeps pubky; delete and recreate same pubky',
      async () => {
        const { pubky } = await createProfile({ name: 'Alice' });
        await verifyPubkyString(pubky);
        const copiedPubky = await readPubkyFromProfileCopy();
        await expect(copiedPubky).toBe(pubky.trim());
        const details = {
          name: 'Bob',
          notes: 'Notes for E2E',
          links: [{ label: 'Website', url: 'https://example.org' }],
          tags: ['cypherpunk'],
        };
        await updateProfile(details);
        await verifyProfileDetails(details);

        await launchFreshApp();
        await verifyProfileDetails(details);
        const pubkyAfterRelaunch = await readPubkyFromProfileCopy();
        await expect(pubkyAfterRelaunch).toBe(pubky.trim());

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

        await deleteProfile();
        const { pubky: pubkyAfterRecreate } = await createProfile({ name: 'Alice2' });
        await expect(pubkyAfterRecreate.trim()).toBe(pubky.trim());
      }
    );
  });
});
