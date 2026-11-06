import { elementById, dragOnElement, formatSats, handleAndroidAlert } from './actions';
import {
  actAndExpect,
  dismissKeyboardAndExpect,
  tapAndExpect,
  typeAndExpect,
  waitAndExpect,
  type Outcome,
} from './outcome';

/** Existing gate destinations; callers retain their more specific business assertions. */
const paymentDestination: Outcome = {
  anyVisible: [
    { id: 'SendNumberField' },
    { id: 'ReviewAmount-primary' },
    { id: 'SendSuccess' },
    { id: 'ConnectButton' },
    { id: 'WithdrawAmount-primary' },
    { id: 'LnurlAuthContinue' },
  ],
  all: [{ hidden: { id: 'RecipientInput' } }],
};

export async function enterGateAddress(
  address: string,
  { acceptCameraPermission = true, addressTimeout = 30_000 } = {}
) {
  const permission = 'com.android.permissioncontroller:id/permission_allow_one_time_button';
  await tapAndExpect(
    { id: 'Send' },
    { anyVisible: [{ id: 'RecipientManual' }, ...(driver.isAndroid ? [{ id: permission }] : [])] }
  );
  if (acceptCameraPermission) await handleAndroidAlert('permission_allow_one_time_button');
  await tapAndExpect({ id: 'RecipientManual' }, { anyVisible: [{ id: 'RecipientInput' }] });
  await typeAndExpect(
    'RecipientInput',
    address,
    { all: [{ enabled: { id: 'AddressContinue', value: true } }], timeout: addressTimeout },
    { verifyClear: true }
  );
  await dismissKeyboardAndExpect();
  await tapAndExpect({ id: 'AddressContinue' }, paymentDestination);
}

export async function enterGateScanPrompt(address: string, { acceptCameraPermission = true } = {}) {
  const permission = 'com.android.permissioncontroller:id/permission_allow_foreground_only_button';
  await tapAndExpect(
    { id: 'Scan' },
    { anyVisible: [{ id: 'ScanPrompt' }, ...(driver.isAndroid ? [{ id: permission }] : [])] }
  );
  if (acceptCameraPermission) await handleAndroidAlert('permission_allow_foreground_only_button');
  await tapAndExpect({ id: 'ScanPrompt' }, { anyVisible: [{ id: 'QRInput' }] });
  await typeAndExpect('QRInput', address, {}, { verifyClear: true });
  await dismissKeyboardAndExpect();
  await tapAndExpect(
    { id: 'DialogConfirm' },
    {
      ...paymentDestination,
      all: [{ hidden: { id: 'QRInput' } }],
    }
  );
}

/** One digit per action, with readback before entering the next digit. */
export async function enterGateAmount(amountSats: number, toast?: string) {
  const digits = String(amountSats);
  for (let index = 0; index < digits.length; index++) {
    const lastRejected = Boolean(toast) && index === digits.length - 1;
    const accepted = digits.slice(0, lastRejected ? index : index + 1);
    await tapAndExpect(
      { id: `N${digits[index]}` },
      {
        ...(lastRejected ? { appeared: [{ id: toast! }] } : {}),
        all: [{ textWithin: { id: 'SendNumberField', text: formatSats(Number(accepted)) } }],
      }
    );
  }
  if (toast) await waitAndExpect({ all: [{ hidden: { id: toast } }] });
}

/** Commit the transaction once; a failed observation must never submit it again. */
export async function confirmGateAction(outcome: Outcome) {
  await actAndExpect('confirm gate action', () => dragOnElement('GRAB', 'right', 0.95), outcome);
}

export async function rejectGateContinue(toast: string) {
  await tapAndExpect({ id: 'ContinueAmount' }, { appeared: [{ id: toast }] });
  await waitAndExpect({ all: [{ hidden: { id: toast } }] });
}

/** Observe the short auth confirmation before XCTest's post-click idle wait can outlive it. */
export async function authenticateGateLnurl() {
  const target = { id: 'LnurlAuthContinue' };
  const outcome = { appeared: [{ text: 'Signed In' }], timeout: 30_000 };
  if (!driver.isIOS) {
    await tapAndExpect(target, outcome);
    return;
  }
  // Establish that the auth screen is ready under the original settings first.
  await elementById(target.id).waitForDisplayed({ timeout: 30_000 });
  const settings = await driver.getSettings();
  const previous = {
    waitForIdleTimeout: settings.waitForIdleTimeout,
    animationCoolOffTimeout: settings.animationCoolOffTimeout,
  };
  for (const [name, value] of Object.entries(previous)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Cannot observe LNURL auth without a restorable ${name}`);
    }
  }
  let failed = false;
  let failure: unknown;
  let restoreFailed = false;
  let restoreFailure: unknown;
  try {
    await driver.updateSettings({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0 });
    await tapAndExpect(target, outcome);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      await driver.updateSettings(previous);
    } catch (error) {
      restoreFailed = true;
      restoreFailure = error;
    }
  }
  if (restoreFailed) {
    if (failed) {
      throw new AggregateError(
        [failure, restoreFailure],
        'LNURL auth and settings restore failed',
        {
          cause: failure,
        }
      );
    }
    throw restoreFailure;
  }
  if (failed) throw failure;
}
