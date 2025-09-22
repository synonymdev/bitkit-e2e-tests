import {
  completeOnboarding,
  enterAddress,
  expectTextVisible,
  getTextUnder,
  multiTap,
  sleep,
  tap,
} from '../helpers/actions';
import { checkComplete, launchFreshApp, markComplete, reinstallApp } from '../helpers/setup';

const d = checkComplete(['numberpad_1', 'numberpad_2', 'numberpad_3', 'numberpad_4'])
  ? describe.skip
  : describe;

d('@numberpad - NumberPad', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  describe('Modern denomination', () => {
    it('@numberpad_1 - Receive: Can enter amounts in modern denomination', async () => {
      if (checkComplete(['numberpad_1'])) {
        return;
      }
      await tap('Receive');
      await tap('SpecifyInvoiceButton');
      await tap('ReceiveNumberPadTextField');
      await sleep(700);
      await modernDenominationChecks('Receive');
      markComplete('numberpad_1');
    });

    it('@numberpad_2 - Send: Can enter amounts in modern denomination', async () => {
      if (checkComplete(['numberpad_2'])) {
        return;
      }
      const address = 'bcrt1q4jjfydszdxw8wpk69cyzkd77tm32uvfs0dvsfs';
      await enterAddress(address);
      await sleep(700);
      await modernDenominationChecks('Send');
      markComplete('numberpad_2');
    });
  });

  describe('Classic denomination', () => {
    beforeEach(async () => {
      await switchToClassicDenomination();
    });

    it('@numberpad_3 - Receive: Can enter amounts in classic denomination', async () => {
      if (checkComplete(['numberpad_3'])) {
        return;
      }
      await tap('Receive');
      await tap('SpecifyInvoiceButton');
      await tap('ReceiveNumberPadTextField');
      await sleep(700);
      await classicDenominationChecks('Receive');
      markComplete('numberpad_3');
    });

    it('@numberpad_4 - Send: Can enter amounts in classic denomination', async () => {
      if (checkComplete(['numberpad_4'])) {
        return;
      }
      const address = 'bcrt1q4jjfydszdxw8wpk69cyzkd77tm32uvfs0dvsfs';
      await enterAddress(address);
      await sleep(700);
      await classicDenominationChecks('Send');
      markComplete('numberpad_4');
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
  await expectTextVisible('123');

  await tap('N000');
  await expectTextVisible('123 000');

  // Switch to USD
  await tap(`${mode}NumberPadUnit`);
  // reset to 0
  await multiTap('NRemove', 8);
  await expectTextVisible('0.00');

  await tap('N0');
  await tap('N0');
  await tap('N1');
  await tap('NDecimal');
  await tap('NDecimal');
  await tap('N0');
  await tap('N1');
  await tap('NDecimal');
  await tap('N1');
  await expectTextVisible('1.01');

  // Switch back to BTC
  await tap(`${mode}NumberPadUnit`);
}
async function classicDenominationChecks(mode: NumberpadMode) {
  await makeSureIsBitcoinInput(mode);
  // Unit set to BTC
  await tap('N1');
  await expectTextVisible('1.00000000');

  // can only enter one decimal symbol
  await tap('NDecimal');
  await tap('NDecimal');
  await expectTextVisible('1.00000000');
  await tap('NRemove');
  await expectTextVisible('1.00000000');
  await tap('NDecimal');

  // reset to 0
  await multiTap('NRemove', 2);
  await expectTextVisible('0.00000000');
  await tap('N4');
  await tap('NDecimal');
  await tap('N2');
  await tap('N0');
  await tap('N6');
  await tap('N9');
  await expectTextVisible('4.20690000');

  // Switch to USD and back
  await tap(`${mode}NumberPadUnit`);
  await sleep(1000);
  await tap(`${mode}NumberPadUnit`);

  // still there
  await expectTextVisible('4.20690000');
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
  await tap('NavigationClose');
}
