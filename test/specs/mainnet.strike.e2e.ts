import {
  dragOnElement,
  elementById,
  enterAddress,
  restoreWallet,
  sleep,
  tap,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';

const strikeSeed = process.env.STRIKE_SEED;
const strikeLnAddress = process.env.STRIKE_LN_ADDR;
const strikeAmountSats = Number.parseInt(process.env.STRIKE_AMOUNT_SATS ?? '5', 10);

describe('@strike_mainnet - Strike smoke', () => {
  before(() => {
    if (!strikeSeed) {
      throw new Error('Missing STRIKE_SEED env var');
    }
    if (!strikeLnAddress) {
      throw new Error('Missing STRIKE_LN_ADDR env var');
    }
    if (!Number.isInteger(strikeAmountSats) || strikeAmountSats <= 0) {
      throw new Error(`Invalid STRIKE_AMOUNT_SATS value: ${process.env.STRIKE_AMOUNT_SATS}`);
    }
  });

  ciIt('@strike_1 - Can pay Strike LN address', async () => {
    await restoreWallet(strikeSeed!, {
      expectBackupSheet: false,
    });

    await enterAddress(strikeLnAddress!, { acceptCameraPermission: true });

    const digits = `${strikeAmountSats}`.split('');
    for (const digit of digits) {
      await tap(`N${digit}`);
      await sleep(150);
    }

    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed({ timeout: 60_000 });
    await tap('Close');
  });
});
