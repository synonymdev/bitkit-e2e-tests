import { completeOnboarding, doNavigationClose, elementById, tap } from '../helpers/actions';
import { openContacts, openProfile } from '../helpers/navigation';
import {
  createProfile,
  readPubkyFromProfileCopy,
  updateProfile,
  verifyProfileDetails,
  verifyPubkyString,
} from '../helpers/profile';
import { reinstallApp } from '../helpers/setup';
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

  // Section B: create profile, copy pubky (toast + clipboard), then edit name/notes/links/tags.
  describe('Create / Edit profile', () => {
    ciIt('@pubky_profile_2 - Create profile, copy pubky, then update profile', async () => {
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
    });
  });
});
