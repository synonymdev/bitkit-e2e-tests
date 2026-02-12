import {
  completeOnboarding,
  elementById,
  elementByText,
  getTextUnder,
  restoreWallet,
  sleep,
  tap,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';

const cjitSeed = process.env.CJIT_SEED;
const expectedMinimumAmountSats = Number.parseInt(process.env.CJIT_MIN_EXPECTED_SATS ?? '1000', 10);

function parseNumber(value: string): number {
  const normalized = value.replace(/\s+/g, '');
  const digits = normalized.replace(/[^\d]/g, '');
  return Number.parseInt(digits, 10);
}

function parseCjitFees(value: string): { networkFee: number; serviceProviderFee: number } {
  const labeledMatch = value.match(
    /\$([0-9]+(?:\.[0-9]+)?) network fee and \$([0-9]+(?:\.[0-9]+)?) service provider fee/i,
  );
  if (labeledMatch) {
    return {
      networkFee: Number.parseFloat(labeledMatch[1]),
      serviceProviderFee: Number.parseFloat(labeledMatch[2]),
    };
  }

  const amountMatches = [...value.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)];
  if (amountMatches.length >= 2) {
    const networkFee = Number.parseFloat(amountMatches[0][1]);
    const serviceProviderFee = Number.parseFloat(amountMatches[1][1]);
    return {
      networkFee,
      serviceProviderFee,
    };
  }

  throw new Error(`Could not parse CJIT fees from: "${value}"`);
}

async function waitForNonZeroMinimumAmount(retries = 30): Promise<number> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const minAmountText = await getTextUnder('ReceiveAmountMin');
    const minAmountSats = parseNumber(minAmountText);
    if (minAmountSats > 0) {
      return minAmountSats;
    }
    await sleep(1000);
  }

  throw new Error('Timed out waiting for non-zero minimum receive amount');
}

async function setupWallet(): Promise<void> {
  if (cjitSeed) {
    await restoreWallet(cjitSeed, {
      expectBackupSheet: false,
      reinstall: false,
      expectAndroidAlert: false,
    });
    return;
  }

  await completeOnboarding( { isFirstTime: false } );
}

describe('@cjit_mainnet - CJIT smoke', () => {
  before(() => {
    if (!Number.isInteger(expectedMinimumAmountSats) || expectedMinimumAmountSats <= 0) {
      throw new Error(`Invalid CJIT_MIN_EXPECTED_SATS value: ${process.env.CJIT_MIN_EXPECTED_SATS}`);
    }
  });

  ciIt('@cjit_1 - Can create CJIT invoice', async () => {
    await setupWallet();

    await tap('Receive');
    await sleep(2000);
    await tap('Tab-spending');
    await tap('ShowDetails');

    const minAmountSats = await waitForNonZeroMinimumAmount();
    if (minAmountSats <= expectedMinimumAmountSats) {
      throw new Error(
        `Minimum receive amount ${minAmountSats} should be greater than ${expectedMinimumAmountSats}`,
      );
    }

    await tap('ReceiveAmountMin');
    await tap('ContinueAmount');

    const reviewAmountText = await getTextUnder('-primary');
    const reviewAmountSats = parseNumber(reviewAmountText);
    if (reviewAmountSats !== minAmountSats) {
      throw new Error(`Review amount ${reviewAmountSats} should equal minimum receive amount ${minAmountSats}`);
    }

    const serviceProviderFeeText = await elementByText('service provider fee', 'contains').getText();
    const { networkFee, serviceProviderFee } = parseCjitFees(serviceProviderFeeText);
    if (!(networkFee > 0)) {
      throw new Error(`Network fee should be greater than 0. Found: "${serviceProviderFeeText}"`);
    }
    if (!(serviceProviderFee > 0)) {
      throw new Error(`Service provider fee should be greater than 0. Found: "${serviceProviderFeeText}"`);
    }

    await elementByText('Continue').click();
    await elementById('QRCode').waitForDisplayed({ timeout: 30_000 });
    await sleep(2000);
  });
});
