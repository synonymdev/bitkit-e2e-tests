import { elementById, expectTextWithin, receiveOnchainFunds, type ToastId } from './actions';
import {
  dismissKeyboardAndExpect,
  swipeAndExpect,
  tapAndExpect,
  typeAndExpect,
  waitAndExpect,
} from './outcome';
import { getExternalAddress } from './regtest';

async function openManualRecipient() {
  const permission = 'com.android.permissioncontroller:id/permission_allow_foreground_only_button';
  await tapAndExpect(
    { id: 'Send' },
    { anyVisible: [{ id: 'RecipientManual' }, ...(driver.isAndroid ? [{ id: permission }] : [])] }
  );
  if (driver.isAndroid && (await elementById(permission).isDisplayed())) {
    await tapAndExpect({ id: permission }, { anyVisible: [{ id: 'RecipientManual' }] });
  }
  await tapAndExpect(
    { id: 'RecipientManual' },
    {
      all: [
        { visible: { id: 'RecipientInput' } },
        { enabled: { id: 'AddressContinue', value: false } },
      ],
    }
  );
}

async function rejectedRecipient(value: string, toast: ToastId, negativeControl = false) {
  await typeAndExpect('RecipientInput', value, {
    all: [
      { visible: { id: negativeControl ? 'PilotDeliberatelyMissingValidationToast' : toast } },
      { enabled: { id: 'AddressContinue', value: false } },
    ],
    timeout: negativeControl ? 2000 : 30_000,
  });
  // Its appearance was asserted above; re-waiting or dragging can race its expiry.
  await waitAndExpect({ all: [{ hidden: { id: toast } }] });
}

async function acceptedRecipient(value: string) {
  await typeAndExpect('RecipientInput', value, {
    all: [{ enabled: { id: 'AddressContinue', value: true } }],
  });
  await dismissKeyboardAndExpect();
}

/** Same send_1 checks, with one action followed by bounded observations and no input retries. */
export async function runSendValidation({ negativeControl = false } = {}) {
  await openManualRecipient();
  await rejectedRecipient('test123', 'InvalidAddressToast', negativeControl);
  await rejectedRecipient('bc1qnc8at2e2navahnz7lvtl39r4dnfzxv3cc9e7ax', 'InvalidAddressToast');
  await rejectedRecipient(await getExternalAddress(), 'InsufficientSavingsToast');
  const expired =
    'lnbcrt1pn3zpqpdqqnp4qfh2x8nyvvzq4kf8j9wcaau2chr580l93pnyrh5027l8f7qtm48h6pp5lmwkulnpze4ek4zqwfepguahcr2ma3vfhwa6uepxfd378xlldprssp5wnq34d553g50suuvfy387csx5hx6mdv8zezem6f4tky7rhezycas9qyysgqcqpcxqrrssrzjqtr7pzpunxgwjddwdqucegdphm6776xcarz60gw9gxva0rhal5ntmapyqqqqqqqqpqqqqqlgqqqqqqgq2ql9zpeakxvff9cz5rd6ssc3cngl256u8htm860qv3r28vqkwy9xe3wp0l9ms3zcqvys95yf3r34ytmegz6zynuthh5s0kh7cueunm3mspg3uwpt';
  await rejectedRecipient(expired, 'ExpiredLightningToast');

  await swipeAndExpect('down', {
    all: [{ visible: { id: 'Send' } }, { hidden: { id: 'RecipientInput' } }],
  });
  const amount = 15000;
  // Identical deposit/mining/balance fixture in both variants.
  await receiveOnchainFunds({ sats: amount });
  await openManualRecipient();
  await acceptedRecipient(await getExternalAddress());
  await tapAndExpect({ id: 'AddressContinue' }, { anyVisible: [{ id: 'SendNumberField' }] });
  const digits = String(amount + 1);
  for (let index = 0; index < digits.length; index++) {
    // The final over-limit digit is rejected; the field keeps its previous value.
    const accepted = digits.slice(0, index === digits.length - 1 ? index : index + 1);
    const formatted = Number(accepted).toLocaleString('en-US').replaceAll(',', ' ');
    await tapAndExpect(
      { id: `N${digits[index]}` },
      {
        all: [
          { textWithin: { id: 'SendNumberField', text: formatted } },
          ...(index === digits.length - 1 ? [{ visible: { id: 'SendAmountExceededToast' } }] : []),
        ],
      }
    );
  }
  await waitAndExpect({ all: [{ hidden: { id: 'SendAmountExceededToast' } }] });
  await tapAndExpect({ id: 'NavigationBack' }, { anyVisible: [{ id: 'RecipientInput' }] });

  await acceptedRecipient('bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.0001');
  await tapAndExpect(
    { id: 'AddressContinue' },
    {
      all: [{ textWithin: { id: 'ReviewAmount-primary', text: '10 000' } }],
    }
  );
  await expectTextWithin('ReviewAmount-primary', '10 000');
  await tapAndExpect({ id: 'NavigationBack' }, { anyVisible: [{ id: 'RecipientInput' }] });
  await rejectedRecipient(
    'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.002',
    'InsufficientSavingsToast'
  );
}
