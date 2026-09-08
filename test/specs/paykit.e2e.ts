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
import { enablePaykitUi } from '../helpers/paykit';
import { addContact, createProfile, verifyAddContactRoute } from '../helpers/profile';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const SEND_SHEET_TIMEOUT = 60_000;
const CONTACT_PAY_RETRY_AFTER_MS = 8_000;
// iOS: SendAmount. Android: send_amount_screen / SendSheet. Both: ContinueAmount.
const SEND_AMOUNT_READY_IDS = [
  'SendAmount',
  'send_amount_screen',
  'SendSheet',
  'ContinueAmount',
  'SendAmountNumberPad',
];

async function isDisplayed(testId: string): Promise<boolean> {
  return elementById(testId)
    .isDisplayed()
    .catch(() => false);
}

async function isSendAmountSheetDisplayed(): Promise<boolean> {
  for (const testId of SEND_AMOUNT_READY_IDS) {
    if (await isDisplayed(testId)) {
      return true;
    }
  }
  return false;
}

async function describeContactPayScreen(): Promise<string> {
  const markers = [
    ...SEND_AMOUNT_READY_IDS,
    'ContactPay',
    'AddContactRetrievingTitle',
    'AddContactSave',
    'AddContactPay',
  ];
  const visible: string[] = [];
  for (const testId of markers) {
    if (await isDisplayed(testId)) {
      visible.push(testId);
    }
  }
  return visible.length > 0
    ? `visible: ${visible.join(', ')}`
    : `visible: none of ${markers.join('/')}`;
}

async function waitForSendAmountSheet() {
  await browser.waitUntil(async () => isSendAmountSheetDisplayed(), {
    timeout: SEND_SHEET_TIMEOUT,
    interval: 500,
    timeoutMsg: 'Send amount sheet did not appear',
  });
}

async function openContactPayAmountSheet() {
  await elementById('ContactPay').waitForDisplayed();
  await tap('ContactPay');

  let retried = false;
  const started = Date.now();
  try {
    await browser.waitUntil(
      async () => {
        if (await isSendAmountSheetDisplayed()) {
          return true;
        }
        // One retap only: Paykit resolve keeps ContactPay on screen, so looping taps
        // would start overlapping payContact() tasks.
        if (
          !retried &&
          Date.now() - started > CONTACT_PAY_RETRY_AFTER_MS &&
          (await isDisplayed('ContactPay'))
        ) {
          retried = true;
          await tap('ContactPay');
        }
        return false;
      },
      { timeout: SEND_SHEET_TIMEOUT, interval: 1_000 }
    );
  } catch {
    throw new Error(
      `Send amount sheet did not open after ContactPay (${await describeContactPayScreen()})`
    );
  }
}

async function switchToOnchainIfNeeded() {
  await waitForSendAmountSheet();
  const switchButton = elementById('AssetButton-switch');
  if (await switchButton.isDisplayed().catch(() => false)) {
    await tap('AssetButton-switch');
    await sleep(500);
  } else {
    await elementById('AssetButton-savings').waitForDisplayed();
  }
}

async function payCurrentContactOnchain(amountSats: number) {
  await openContactPayAmountSheet();
  await switchToOnchainIfNeeded();
  await enterAmount(amountSats);
  await elementById('ContinueAmount').waitForEnabled();
  await tap('ContinueAmount');
  await elementById('GRAB').waitForDisplayed();
  await sleep(500);
  await dragOnElement('GRAB', 'right', 0.95);
  await elementById('SendSuccess').waitForDisplayed({ timeout: 60_000 });
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
    await enablePaykitUi();
  });

  ciIt('@paykit_1 - Can pay saved contact via public on-chain endpoint', async () => {
    const [savedPaykitContact, unsavedPaykitContact] = STAGING_PAYKIT_CONTACTS;

    await receiveOnchainFunds({ sats: 50_000 });

    await createProfile({ name: 'Paykit Sender' });
    await doNavigationClose();

    // Unsaved public Paykit pubkys should route to the Add Contact payment surface.
    await enterAddress(unsavedPaykitContact.pubky, { acceptCameraPermission: true });
    await verifyAddContactRoute(unsavedPaykitContact.pubky, {
      ableToPay: unsavedPaykitContact.ableToPay,
    });
    await doNavigationClose();

    await enterAddressViaScanPrompt(unsavedPaykitContact.pubky, {
      acceptCameraPermission: false,
    });
    await verifyAddContactRoute(unsavedPaykitContact.pubky, {
      ableToPay: unsavedPaykitContact.ableToPay,
    });
    await doNavigationClose();

    await addContact({
      pubky: savedPaykitContact.pubky,
      firstContact: true,
    });
    // addContact already lands on contact details with ContactPay visible.

    await payCurrentContactOnchain(10_000);

    await openContactActivity(savedPaykitContact.pubky);
    await expectText('Sent to', { strategy: 'contains' });
    await tap('ContactActivity-1');
    await expectText('10 000');
  });
});
