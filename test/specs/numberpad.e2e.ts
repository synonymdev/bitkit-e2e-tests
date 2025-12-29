import {
  completeOnboarding,
  enterAddress,
  expectText,
  getTextUnder,
  multiTap,
  sleep,
  tap,
  doNavigationClose,
  expectTextWithin,
} from '../helpers/actions';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@numberpad - NumberPad', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  describe('Modern denomination', () => {
    ciIt('@numberpad_1 - Receive: Can enter amounts in modern denomination', async () => {
      await tap('Receive');
      await sleep(700);
      await tap('SpecifyInvoiceButton');
      await tap('ReceiveNumberPadTextField');
      await sleep(700);
      await modernDenominationChecks('Receive');
    });

    ciIt('@numberpad_2 - Send: Can enter amounts in modern denomination', async () => {
      const address = 'bcrt1q4jjfydszdxw8wpk69cyzkd77tm32uvfs0dvsfs';
      await enterAddress(address);
      await sleep(700);
      await modernDenominationChecks('Send');
    });
  });

  describe('Classic denomination', () => {
    beforeEach(async () => {
      await switchToClassicDenomination();
    });

    ciIt('@numberpad_3 - Receive: Can enter amounts in classic denomination', async () => {
      await tap('Receive');
      await sleep(700);
      await tap('SpecifyInvoiceButton');
      await tap('ReceiveNumberPadTextField');
      await sleep(700);
      await classicDenominationChecks('Receive');
    });

    ciIt('@numberpad_4 - Send: Can enter amounts in classic denomination', async () => {
      const address = 'bcrt1q4jjfydszdxw8wpk69cyzkd77tm32uvfs0dvsfs';
      await enterAddress(address);
      await sleep(700);
      await classicDenominationChecks('Send');
    });
  });
});

type NumberpadMode = 'Send' | 'Receive';
async function modernDenominationChecks(mode: NumberpadMode) {
  await makeSureIsBitcoinInput(mode);
  // Unit set to sats
  await tap('N1');
  await tap('N2');
  await tap('N3');
  await expectText('123');

  await tap('N000');
  await expectText('123 000');

  // Switch to USD
  await tap(`${mode}NumberPadUnit`);
  // reset to 0
  await multiTap('NRemove', 8);
  if (mode === 'Send') {
    await expectTextWithin('SendNumberField', '0.00');
  } else {
    await expectTextWithin('ReceiveNumberPadTextField', '0.00');
  }
  await tap('N0');
  await tap('N0');
  await tap('N1');
  await tap('NDecimal');
  await tap('NDecimal');
  await tap('N0');
  await tap('N1');
  await tap('NDecimal');
  await tap('N1');
  await expectText('1.01');

  // Switch back to BTC
  await tap(`${mode}NumberPadUnit`);
}
async function classicDenominationChecks(mode: NumberpadMode) {
  await makeSureIsBitcoinInput(mode);
  // Unit set to BTC
  await tap('N1');
  await expectText('1.00000000');

  // can only enter one decimal symbol
  await tap('NDecimal');
  await tap('NDecimal');
  await expectText('1.00000000');
  await tap('NRemove');
  await expectText('1.00000000');
  await tap('NDecimal');

  // reset to 0
  await multiTap('NRemove', 2);
  if (mode === 'Send') {
    await expectTextWithin('SendNumberField', '0.00000000');
  } else {
    await expectTextWithin('ReceiveNumberPadTextField', '0.00000000');
  }
  await tap('N4');
  await tap('NDecimal');
  await tap('N2');
  await tap('N0');
  await tap('N6');
  await tap('N9');
  await expectText('4.20690000');

  // Switch to USD and back
  await tap(`${mode}NumberPadUnit`);
  await sleep(1000);
  await tap(`${mode}NumberPadUnit`);

  // still there
  await expectText('4.20690000');
}

async function makeSureIsBitcoinInput(mode: NumberpadMode) {
  await sleep(500);
  const currentUnit = await getTextUnder(`${mode}NumberPadUnit`);
  if (currentUnit !== 'BITCOIN') {
    await tap(`${mode}NumberPadUnit`);
  }
}

async function switchToClassicDenomination() {
  await tap('HeaderMenu');
  await tap('DrawerSettings');
  await tap('GeneralSettings');
  await tap('UnitSettings');
  await tap('DenominationClassic');
  await doNavigationClose();
}
