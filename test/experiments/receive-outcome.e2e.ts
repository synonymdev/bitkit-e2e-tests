import {
  completeOnboarding,
  confirmInputOnKeyboard,
  elementById,
  expectText,
  expectTextWithin,
  getAddressFromQRCode,
  getReceiveAddress,
  sleep,
  swipeFullScreen,
  tap,
  typeText,
} from '../helpers/actions';
import {
  dismissKeyboardAndExpect,
  swipeAndExpect,
  tapAndExpect,
  typeAndExpect,
} from '../helpers/outcome';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const mode = process.env.OUTCOME_PILOT_MODE;
if (mode !== 'baseline' && mode !== 'outcome') throw new Error('Set OUTCOME_PILOT_MODE');
const note = 'iPhone Refurbished';
const tag = 'test123';

// Same fixture and checks as receive_1 at 01834b5f; each invocation has a fresh wallet.
describe(`Local receive outcome pilot (${mode})`, () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@outcome_pilot_receive - Basic functionality', async () => {
    if (mode === 'baseline') {
      const address = await getReceiveAddress();
      if (!address.startsWith('bcrt1'))
        throw new Error(`Wrong default receiving address: ${address}`);
      await tap('ShowDetails');
      await elementById('ReceiveScreen').waitForDisplayed();
      await tap('QRCode');
      await sleep(1000);
      await tap('SpecifyInvoiceButton');
      await tap('ReceiveNumberPadTextField');
      await sleep(1000);
      await tap('N1');
      await tap('N2');
      await tap('N3');
      await expectText('123');
      await tap('ReceiveNumberPadSubmit');
      await typeText('ReceiveNote', note);
      await confirmInputOnKeyboard();
      await sleep(300);
      await tap('TagsAdd');
      await typeText('TagInputReceive', tag);
      await tap('ReceiveTagsSubmit');
      await sleep(300);
      await tap('ShowQrReceive');
      await sleep(500);
      await tap('SpecifyInvoiceButton');
      await expectText('123');
      await expectTextWithin('ReceiveNote', note);
      await expectText(tag);
      await swipeFullScreen('down');
      await sleep(1000);
      await elementById('Receive').waitForDisplayed();
      await tap('Receive');
      await sleep(500);
      await tap('SpecifyInvoiceButton');
      await expectText('123', { visible: false });
      await expectTextWithin('ReceiveNote', note, { visible: false });
      await expectText(tag, { visible: false });
      await tap('TagsAdd');
      await tap(`Tag-${tag}`);
      await expectText(tag);
      await tap(`Tag-${tag}-delete`);
      await expectText(tag, { visible: false });
      return;
    }

    await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'QRCode' }] });
    const address = await getAddressFromQRCode('bitcoin');
    if (!address.startsWith('bcrt1'))
      throw new Error(`Wrong default receiving address: ${address}`);
    await tapAndExpect(
      { id: 'ShowDetails' },
      {
        all: [{ visible: { id: 'ReceiveScreen' } }, { hidden: { id: 'ShowDetails' } }],
      }
    );
    await tapAndExpect({ id: 'QRCode' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });
    await tapAndExpect(
      { id: 'SpecifyInvoiceButton' },
      { anyVisible: [{ id: 'ReceiveNumberPadTextField' }] }
    );
    await tapAndExpect(
      { id: 'ReceiveNumberPadTextField' },
      { anyVisible: [{ id: 'ReceiveNumberPadSubmit' }] }
    );
    for (const [digit, expected] of [
      ['1', '1'],
      ['2', '12'],
      ['3', '123'],
    ]) {
      const expectedText =
        process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true' && digit === '1'
          ? 'PilotDeliberatelyMissingAmount'
          : expected;
      await tapAndExpect(
        { id: `N${digit}` },
        {
          all: [{ textWithin: { id: 'ReceiveNumberPadTextField', text: expectedText } }],
          timeout: process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true' ? 2000 : 30_000,
        }
      );
    }
    await expectText('123');
    await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    await typeAndExpect('ReceiveNote', note);
    await dismissKeyboardAndExpect();
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
    await tapAndExpect({ id: 'ShowQrReceive' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });
    await tapAndExpect({ id: 'SpecifyInvoiceButton' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    await expectText('123');
    await expectTextWithin('ReceiveNote', note);
    await expectText(tag);
    await swipeAndExpect('down', {
      all: [{ visible: { id: 'Receive' } }, { hidden: { id: 'ReceiveNumberPadTextField' } }],
    });
    await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'SpecifyInvoiceButton' }] });
    await tapAndExpect({ id: 'SpecifyInvoiceButton' }, { anyVisible: [{ id: 'ReceiveNote' }] });
    await expectText('123', { visible: false });
    await expectTextWithin('ReceiveNote', note, { visible: false });
    await expectText(tag, { visible: false });
    await tapAndExpect({ id: 'TagsAdd' }, { anyVisible: [{ id: `Tag-${tag}` }] });
    await tapAndExpect(
      { id: `Tag-${tag}` },
      {
        all: [{ visible: { text: tag } }, { hidden: { id: 'TagInputReceive' } }],
      }
    );
    await expectText(tag);
    await tapAndExpect({ id: `Tag-${tag}-delete` }, { all: [{ hidden: { text: tag } }] });
    await expectText(tag, { visible: false });
  });
});
