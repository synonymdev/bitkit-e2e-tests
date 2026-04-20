import { elementById, elementByText, getUriFromQRCode, sleep, tap, typeText } from './actions';

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
  return { pubky };
}
