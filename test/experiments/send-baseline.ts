// Frozen send_1 body from f170a365; preserve baseline sleeps and retries.
import {
  tap,
  sleep,
  handleAndroidAlert,
  elementById,
  typeRecipientInput,
  waitForToast,
  swipeFullScreen,
  receiveOnchainFunds,
  typeAddressAndVerifyContinue,
  enterAmount,
  elementByIdWithin,
} from '../helpers/actions';
import { getExternalAddress } from '../helpers/regtest';

export async function runSendValidationBaseline() {
  await tap('Send');
  await sleep(1000);
  await handleAndroidAlert('permission_allow_foreground_only_button');
  await sleep(4000);
  await tap('RecipientManual');

  // check validation for empty address
  await elementById('AddressContinue').waitForEnabled({ reverse: true });

  // check validation for invalid data
  await typeRecipientInput('test123', { confirmKeyboard: false });
  await waitForToast('InvalidAddressToast');
  await elementById('AddressContinue').waitForEnabled({ reverse: true });

  // check validation for invalid address (network mismatch)
  const mainnetAddress = 'bc1qnc8at2e2navahnz7lvtl39r4dnfzxv3cc9e7ax';
  try {
    await typeRecipientInput(mainnetAddress, { confirmKeyboard: false });
    await waitForToast('InvalidAddressToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  } catch {
    console.warn('Invalid address (network mismatch) input failed, trying again...');
    await typeRecipientInput(mainnetAddress, { confirmKeyboard: false });
    await waitForToast('InvalidAddressToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  }

  // check validation for address when balance is 0
  const address = await getExternalAddress();
  console.info({ address });
  try {
    await typeRecipientInput(address, { confirmKeyboard: false });
    await waitForToast('InsufficientSavingsToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  } catch {
    console.warn('Insufficient savings input failed, trying again...');
    await typeRecipientInput(address, { confirmKeyboard: false });
    await waitForToast('InsufficientSavingsToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  }

  // check validation for expired invoice
  const invoice =
    'lnbcrt1pn3zpqpdqqnp4qfh2x8nyvvzq4kf8j9wcaau2chr580l93pnyrh5027l8f7qtm48h6pp5lmwkulnpze4ek4zqwfepguahcr2ma3vfhwa6uepxfd378xlldprssp5wnq34d553g50suuvfy387csx5hx6mdv8zezem6f4tky7rhezycas9qyysgqcqpcxqrrssrzjqtr7pzpunxgwjddwdqucegdphm6776xcarz60gw9gxva0rhal5ntmapyqqqqqqqqpqqqqqlgqqqqqqgq2ql9zpeakxvff9cz5rd6ssc3cngl256u8htm860qv3r28vqkwy9xe3wp0l9ms3zcqvys95yf3r34ytmegz6zynuthh5s0kh7cueunm3mspg3uwpt';
  try {
    await typeRecipientInput(invoice, { confirmKeyboard: false });
    await waitForToast('ExpiredLightningToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  } catch {
    console.warn('Expired lightning invoice input failed, trying again...');
    await typeRecipientInput(invoice, { confirmKeyboard: false });
    await waitForToast('ExpiredLightningToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  }

  // Receive funds and check validation w/ balance
  await swipeFullScreen('down');
  const amount = 15000;
  await receiveOnchainFunds({ sats: amount });

  await tap('Send');
  await sleep(500);
  await tap('RecipientManual');

  // check validation for address
  const address2 = await getExternalAddress();
  try {
    await typeAddressAndVerifyContinue({ address: address2 });
  } catch {
    console.warn('Address2 input failed, trying again...');
    await typeAddressAndVerifyContinue({ address: address2 });
  }

  // type amount over balance and verify you cannot continue
  await tap('AddressContinue');
  await enterAmount(amount + 1);
  try {
    await waitForToast('SendAmountExceededToast');
  } catch {
    console.warn('SendAmountExceededToast not triggered, trying again...');
    await elementById('N1').click();
    await waitForToast('SendAmountExceededToast');
  }
  await tap('NavigationBack');

  // check validation for unified invoice when balance is enough (10_000 sats)
  const unified1 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.0001';
  try {
    await typeAddressAndVerifyContinue({ address: unified1 });
  } catch {
    console.warn('Unified1 input failed, trying again...');
    await typeAddressAndVerifyContinue({ address: unified1 });
  }

  // a payable amount opens the review screen directly
  await tap('AddressContinue');
  const unified1ReviewAmt = await elementByIdWithin('ReviewAmount-primary', 'MoneyText');
  await unified1ReviewAmt.waitForDisplayed();
  await expect(unified1ReviewAmt).toHaveText('10 000');
  // the scanned amount is fixed, so Back returns to the address screen
  await tap('NavigationBack');

  // check validation for unified invoice when balance is too low (200_000 sats)
  const unified2 = 'bitcoin:bcrt1q07x3wl76zdxvdsz3qzzkvxrjg3n6t4tz2vnsx8?amount=0.002';
  try {
    await typeRecipientInput(unified2, { confirmKeyboard: false });
    await waitForToast('InsufficientSavingsToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  } catch {
    console.warn('Insufficient savings (unified) input failed, trying again...');
    await typeRecipientInput(unified2, { confirmKeyboard: false });
    await waitForToast('InsufficientSavingsToast');
    await elementById('AddressContinue').waitForEnabled({ reverse: true });
  }
}
