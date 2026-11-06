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
  selectSendFundingSource,
} from '../helpers/actions';
import { STAGING_PAYKIT_CONTACTS } from '../helpers/fixtures';
import { doNavigationClose, openContacts } from '../helpers/navigation';
import { addContact, createProfile, verifyAddContactRoute } from '../helpers/profile';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const SEND_SHEET_TIMEOUT = 60_000;
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

async function openPublicPayAmountSheet() {
  await tap('AddContactPay');
  try {
    await waitForSendAmountSheet();
  } catch {
    throw new Error(
      `Public send amount sheet did not open after AddContactPay (${await describeContactPayScreen()})`
    );
  }
}

async function switchToOnchainIfNeeded() {
  await waitForSendAmountSheet();
  const switchButton = elementById('AssetButton-switch');
  if (await switchButton.isDisplayed().catch(() => false)) {
    await selectSendFundingSource('Savings');
  } else {
    await elementById('AssetButton-savings').waitForDisplayed();
  }
}

async function payUnsavedContactOnchain(amountSats: number) {
  await openPublicPayAmountSheet();
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

describe('@pubky @paykit @pubky_staging, @staging - Public payments', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@paykit_1 - Can pay unsaved contact via public on-chain endpoint', async () => {
    const [paymentContact, unsavedPaykitContact] = STAGING_PAYKIT_CONTACTS;

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

    // Saving a contact with a private path prevents public fallback.
    await enterAddress(paymentContact.pubky, { acceptCameraPermission: false });
    await verifyAddContactRoute(paymentContact.pubky, {
      ableToPay: paymentContact.ableToPay,
    });
    await payUnsavedContactOnchain(10_000);

    // Saving after the public payment must retain its contact activity association.
    await addContact({ pubky: paymentContact.pubky, firstContact: true });
    await openContactActivity(paymentContact.pubky);
    await expectText('Sent to', { strategy: 'contains' });
    await tap('ContactActivity-1');
    await expectText('10 000');
  });
});
