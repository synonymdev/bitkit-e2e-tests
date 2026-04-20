import { completeOnboarding, doNavigationClose, elementById, tap } from '../helpers/actions';
import { openContacts, openProfile } from '../helpers/navigation';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

// Section A from docs/pubky-profile-manual-e2e.md:
// with no profile, every entry point must funnel into the choice screen.
describe('@pubky_profile - Pubky profile gating', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@pubky_profile_1 - With no profile, contacts/profile entry points lead to choice screen', async () => {
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
