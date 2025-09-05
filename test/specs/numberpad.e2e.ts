import {
  completeOnboarding,
  expectTextVisible,
  sleep,
  swipeFullScreen,
  tap,
} from '../helpers/actions';
import { launchFreshApp, reinstallApp } from '../helpers/setup';

// Skip due to issues bitkit-android#309,#310
describe.skip('@numberpad - NumberPad', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  it('@numberpad_1 - Can enter amounts in modern denomination', async () => {
    await tap('Receive');
    await tap('SpecifyInvoiceButton');
    await tap('ReceiveNumberPadTextField');
    // await sleep(1000);

    // Unit set to sats
    await tap('N1');
    await tap('N2');
    await tap('N3');
    await expectTextVisible('123');

    await tap('N000');
    await expectTextVisible('123 000');

    // Switch to USD
    await tap('ReceiveNumberPadUnit');
    // reset to 0
    for (let i = 0; i < 8; i++) {
      await tap('NRemove');
    }
    await expectTextVisible('0.00');

    await tap('N0');
    await tap('N0');
    await tap('N1');
    await tap('NDecimal');
    await tap('NDecimal');
    await tap('N0');
    await tap('N1');
    await tap('NDecimal');
    await expectTextVisible('1.01');

    // Switch back to BTC
    await tap('ReceiveNumberPadUnit');
  });

  it('@numberpad_2 - Can enter amounts in classic denomination', async () => {
    // switch to classic denomination
    await tap('Receive');
    await sleep(5000);
    await swipeFullScreen('down');
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('GeneralSettings');
    await tap('UnitSettings');
    await tap('DenominationClassic');
    await tap('NavigationClose');

    await tap('Receive');
    await tap('SpecifyInvoiceButton');
    await tap('ReceiveNumberPadTextField');

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
    for (let i = 0; i < 8; i++) {
      await tap('NRemove');
    }
    await expectTextVisible('0.00000000');
    await tap('N4');
    await tap('NDecimal');
    await tap('N2');
    await tap('N0');
    await tap('N6');
    await tap('N9');
    await expectTextVisible('4.20690000');
  });
});
