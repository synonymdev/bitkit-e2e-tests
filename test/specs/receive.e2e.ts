import {
  completeOnboarding,
  expectText,
  expectTextWithin,
  getAddressFromQRCode,
} from '../helpers/actions';
import {
  swipeAndExpect,
  tapAndExpect,
  tapStationaryAndExpect,
  typeAndExpect,
  type Outcome,
} from '../helpers/outcome';
import { dismissReceiveNoteKeyboard } from '../helpers/receive-invoice';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@receive @ios_nightly - Receive', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@receive_1 - Basic functionality', async () => {
    const qrVisible: Outcome = {
      all: [
        { visible: { id: 'QRCode' } },
        { visible: { id: 'ShowDetails' } },
        { enabled: { id: 'ReceiveCopyQR', value: true } },
      ],
    };
    await tapAndExpect({ id: 'Receive' }, qrVisible);
    const address = await getAddressFromQRCode('bitcoin');
    if (!address.startsWith('bcrt1')) {
      throw new Error(`Wrong default receiving address: ${address}`);
    }

    // Onchain/Lightning details
    await tapAndExpect(
      { id: 'ShowDetails' },
      {
        all: [
          { visible: { id: 'ReceiveScreen' } },
          { visible: { id: 'ReceiveOnchainAddress' } },
          { hidden: { id: 'ShowDetails' } },
        ],
      }
    );

    // ReceiveDetail
    await tapAndExpect({ id: 'QRCode' }, qrVisible);
    // Android can expose the Edit button before the QR sheet settles.
    await tapStationaryAndExpect(
      { id: 'SpecifyInvoiceButton' },
      { anyVisible: [{ id: 'ReceiveNumberPadTextField' }] }
    );

    // NumberPad
    await tapAndExpect(
      { id: 'ReceiveNumberPadTextField' },
      { anyVisible: [{ id: 'ReceiveNumberPadSubmit' }] }
    );
    // Unit set to sats
    for (const [digit, amount] of [
      ['1', '1'],
      ['2', '12'],
      ['3', '123'],
    ]) {
      await tapAndExpect(
        { id: `N${digit}` },
        { all: [{ textWithin: { id: 'ReceiveNumberPadTextField', text: amount } }] }
      );
    }
    await expectText('123');
    await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ReceiveNote' }] });

    // Invoice note
    const note = 'iPhone Refurbished';
    await typeAndExpect('ReceiveNote', note);
    await dismissReceiveNoteKeyboard();

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
    await tapAndExpect({ id: 'ShowQrReceive' }, qrVisible);

    // Back to ReceiveDetail
    // data should still be there
    await tapStationaryAndExpect(
      { id: 'SpecifyInvoiceButton' },
      { anyVisible: [{ id: 'ReceiveNote' }] }
    );
    await expectText('123');
    await expectTextWithin('ReceiveNote', note);
    await expectText(tag);

    // Close & reopen
    await swipeAndExpect('down', {
      all: [{ visible: { id: 'Receive' } }, { hidden: { id: 'ReceiveNumberPadTextField' } }],
    });
    await tapAndExpect({ id: 'Receive' }, qrVisible);

    // data should be reset
    await tapStationaryAndExpect(
      { id: 'SpecifyInvoiceButton' },
      { anyVisible: [{ id: 'ReceiveNote' }] }
    );
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
