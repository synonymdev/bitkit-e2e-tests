import { completeOnboarding, doNavigationClose, elementById, tap } from '../helpers/actions';
import { openContacts, openProfile } from '../helpers/navigation';
import { createProfile } from '../helpers/profile';
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

  // Section B.1 / B.2: create a profile from scratch, with inline disabled-state check.
  // Folded together because a full signup (homegate call + key derivation) is expensive.
  describe('Create profile', () => {
    ciIt('@pubky_profile_2 - Create profile from scratch', async () => {
      const { pubky } = await createProfile({ name: 'Alice' });
      await expect(pubky.length).toBeGreaterThan(0);
      await expect(pubky.startsWith('pubky')).toBe(true);
    });
  });
});
