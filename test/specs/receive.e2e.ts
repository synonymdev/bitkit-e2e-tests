import {
  completeOnboarding,
  expectText,
  expectTextWithin,
  getAddressFromQRCode,
} from '../helpers/actions';
import {
  dismissKeyboardAndExpect,
  swipeAndExpect,
  tapAndExpect,
  tapStationaryAndExpect,
  typeAndExpect,
} from '../helpers/outcome';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@receive @ios_nightly - Receive', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@receive_1 - Basic functionality', async () => {
    await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'QRCode' }] });
    const address = await getAddressFromQRCode('bitcoin');
    if (!address.startsWith('bcrt1')) {
      throw new Error(`Wrong default receiving address: ${address}`);
    }

    // Onchain/Lightning details
    await tapAndExpect(
      { id: 'ShowDetails' },
      { all: [{ visible: { id: 'ReceiveScreen' } }, { hidden: { id: 'ShowDetails' } }] }
    );

    // ReceiveDetail
    await tapAndExpect({ id: 'QRCode' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });
    await tapAndExpect(
      { id: 'SpecifyInvoiceButton' },
      { anyVisible: [{ id: 'ReceiveNumberPadTextField' }] }
    );

    // NumberPad
    await tapAndExpect(
      { id: 'ReceiveNumberPadTextField' },
      { anyVisible: [{ id: 'ReceiveNumberPadSubmit' }] }
    );
    // Unit set to sats
    for (const amount of ['1', '12', '123']) {
      await tapAndExpect(
        { id: `N${amount.slice(-1)}` },
        { all: [{ textWithin: { id: 'ReceiveNumberPadTextField', text: amount } }] }
      );
    }
    await expectText('123');
    await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ReceiveNote' }] });

    // Invoice note
    const note = 'iPhone Refurbished';
    await typeAndExpect('ReceiveNote', note);
    await dismissKeyboardAndExpect();

    // Tags
    const tag = 'test123';
    await tapAndExpect({ id: 'TagsAdd' }, { anyVisible: [{ id: 'TagInputReceive' }] });
    await typeAndExpect('TagInputReceive', tag);
    await tapAndExpect(
      { id: 'ReceiveTagsSubmit' },
      {
        all: [
          { visible: { text: tag } },
          { hidden: { id: 'TagInputReceive' } },
          { keyboardShown: false },
        ],
      }
    );

    // Show QR
    await tapAndExpect({ id: 'ShowQrReceive' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });

    // Back to ReceiveDetail
    // data should still be there
    await tapAndExpect({ id: 'SpecifyInvoiceButton' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    await expectText('123');
    await expectTextWithin('ReceiveNote', note);
    await expectText(tag);

    // Close & reopen
    await swipeAndExpect('down', {
      all: [{ visible: { id: 'Receive' } }, { hidden: { id: 'ReceiveNumberPadTextField' } }],
    });
    await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });

    // data should be reset
    await tapAndExpect({ id: 'SpecifyInvoiceButton' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    await expectText('123', { visible: false });
    await expectTextWithin('ReceiveNote', note, { visible: false });
    await expectText(tag, { visible: false });

    // check previous tags & delete
    await tapAndExpect({ id: 'TagsAdd' }, { anyVisible: [{ id: `Tag-${tag}` }] });
    await tapStationaryAndExpect(
      { id: `Tag-${tag}` },
      { all: [{ visible: { text: tag } }, { hidden: { id: 'TagInputReceive' } }] }
    );
    await expectText(tag);
    await tapAndExpect({ id: `Tag-${tag}-delete` }, { all: [{ hidden: { text: tag } }] });
    await expectText(tag, { visible: false });
  });
});
