import {
  completeOnboarding,
  confirmInputOnKeyboard,
  dragOnElement,
  elementById,
  expectText,
  expectTextWithin,
  getReceiveAddress,
  sleep,
  tap,
  typeText,
} from '../helpers/actions';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@receive - Receive', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@receive_1 - Basic functionality', async () => {
    const address = await getReceiveAddress();
    if (!address.startsWith('bcrt1')) {
      throw new Error(`Wrong default receiving address: ${address}`);
    }

    // Onchain/Lightning details
    await dragOnElement('ReceiveSlider', 'left', 0.7);
    await elementById('ReceiveScreen').waitForDisplayed();

    // ReceiveDetail
    await dragOnElement('ReceiveScreen', 'right', 0.7);
    await sleep(1000);
    await tap('SpecifyInvoiceButton');

    // NumberPad
    await tap('ReceiveNumberPadTextField');
    await sleep(1000);
    // Unit set to sats
    await tap('N1');
    await tap('N2');
    await tap('N3');
    await expectText('123');
    await tap('ReceiveNumberPadSubmit');

    // Invoice note
    const note = 'iPhone Refurbished';
    await typeText('ReceiveNote', note);
    await confirmInputOnKeyboard();
    await sleep(300); // wait for keyboard to hide

    // Tags
    const tag = 'test123';
    await tap('TagsAdd');
    await typeText('TagInputReceive', tag);
    await tap('ReceiveTagsSubmit');
    await sleep(300); // wait for keyboard to hide

    // Show QR
    await tap('ShowQrReceive');

    // Back to ReceiveDetail
    // data should still be there
    await tap('SpecifyInvoiceButton');
    await expectText('123');
    await expectTextWithin('ReceiveNote', note);
    await expectText(tag);

    // Close & reopen
    await dragOnElement('ReceiveScreen', 'down', 0.7);
    await sleep(1000);
    await elementById('Receive').waitForDisplayed();
    await tap('Receive');

    // data should be reset
    await tap('SpecifyInvoiceButton');
    await expectText('123', { visible: false });
    await expectTextWithin('ReceiveNote', note);
    await expectText(tag, { visible: false });

    // check previous tags & delete
    await tap('TagsAdd');
    await tap(`Tag-${tag}`);
    await expectText(tag);
    await tap(`Tag-${tag}-delete`);
    await expectText(tag, { visible: false });
  });
});
