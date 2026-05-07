import {
  completeOnboarding,
  dragOnElement,
  elementById,
  enterAddress,
  enterAddressViaScanPrompt,
  enterAmount,
  expectText,
  receiveOnchainFunds,
  sleep,
  tap,
} from '../helpers/actions';
import { STAGING_PAYKIT_CONTACTS } from '../helpers/fixtures';
import { doNavigationClose, openContacts } from '../helpers/navigation';
import {
  addContact,
  cleanupProfile,
  createProfile,
  discardAddContactRoute,
  verifyAddContactRoute,
  verifyContactRowDisplayed,
} from '../helpers/profile';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

async function switchToOnchainIfNeeded() {
  await elementById('ContinueAmount').waitForDisplayed();
  const switchButton = await elementById('AssetButton-switch');
  if (await switchButton.isDisplayed().catch(() => false)) {
    await tap('AssetButton-switch');
    await sleep(500);
  } else {
    await elementById('AssetButton-savings').waitForDisplayed();
  }
}

async function payCurrentContactOnchain(amountSats: number) {
  await elementById('ContactPay').waitForDisplayed();
  await tap('ContactPay');
  await switchToOnchainIfNeeded();
  await enterAmount(amountSats);
  await tap('ContinueAmount');
  await sleep(1000);
  await dragOnElement('GRAB', 'right', 0.95);
  await sleep(1000);
  await elementById('SendSuccess').waitForDisplayed();
  await tap('Close');
}

async function openContactActivity(publicKey: string) {
  await openContacts();
  await elementById(`Contact_${publicKey}`).waitForDisplayed();
  await tap(`Contact_${publicKey}`);
  await elementById('ContactActivity').waitForDisplayed();
  await tap('ContactActivity');
}

describe('@pubky @paykit - Public payments', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@paykit_1 - Can pay saved contact via public on-chain endpoint', async () => {
    const [savedPaykitContact, unsavedPaykitContact] = STAGING_PAYKIT_CONTACTS;
    let hasProfile = false;

    try {
      await receiveOnchainFunds({ sats: 50_000 });

      await createProfile({ name: 'Paykit Sender' });
      hasProfile = true;

      await doNavigationClose();

      // Unsaved public Paykit pubkys should route to the Add Contact payment surface.
      await enterAddress(unsavedPaykitContact.pubky, { acceptCameraPermission: true });
      await verifyAddContactRoute(unsavedPaykitContact.pubky, {
        ableToPay: unsavedPaykitContact.ableToPay,
      });
      await discardAddContactRoute();

      await enterAddressViaScanPrompt(unsavedPaykitContact.pubky, {
        acceptCameraPermission: false,
      });
      await verifyAddContactRoute(unsavedPaykitContact.pubky, {
        ableToPay: unsavedPaykitContact.ableToPay,
      });
      await discardAddContactRoute();

      await addContact({ pubky: savedPaykitContact.pubky, firstContact: true });
      await verifyContactRowDisplayed(savedPaykitContact.pubky);
      await tap(`Contact_${savedPaykitContact.pubky}`);

      await payCurrentContactOnchain(10_000);

      await openContactActivity(savedPaykitContact.pubky);
      await expectText('Sent to', { strategy: 'contains' });
      await tap('ContactActivity-1');
      await expectText('10 000');
    } finally {
      if (hasProfile) {
        await cleanupProfile('@paykit_1');
      }
    }
  });
});
