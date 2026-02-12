import {
  elementById,
  enterAmount,
  elementsById,
  restoreWallet,
  sleep,
  tap,
} from '../../helpers/actions';
import { ciIt } from '../../helpers/suite';

const channelOrderSeed = process.env.CHANNEL_ORDER_SEED ?? process.env.CJIT_SEED;
const transferAmountSats = Number.parseInt(process.env.CHANNEL_ORDER_AMOUNT_SATS ?? '20000', 10);
const minimumFeeSats = Number.parseInt(process.env.CHANNEL_ORDER_MIN_FEE_SATS ?? '100', 10);
const minimumReceivingCapacitySats = Number.parseInt(process.env.CHANNEL_ORDER_MIN_RECEIVING_SATS ?? '100000', 10);

function parseSats(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  return Number.parseInt(digits, 10);
}

async function maybeTap(testId: string, timeout = 4000): Promise<boolean> {
  const element = elementById(testId);
  try {
    await element.waitForDisplayed({ timeout });
  } catch {
    return false;
  }
  await tap(testId);
  return true;
}

async function tapSpendingAmountContinueWithRetry(retries = 3): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    await tap('SpendingAmountContinue');
    const moreButton = elementById('SpendingConfirmMore');
    try {
      await moreButton.waitForDisplayed({ timeout: 5000 });
      return;
    } catch {
      await sleep(1000);
    }
  }

  throw new Error('Unable to reach transfer confirm screen after tapping SpendingAmountContinue');
}

async function getMoneyTextValues(minCount: number): Promise<number[]> {
  if (!driver.isAndroid) {
    throw new Error('Mainnet channel-order smoke is currently supported on Android only');
  }

  await browser.waitUntil(
    async () => {
      const values = await elementsById('MoneyText');
      return (await values.length) >= minCount;
    },
    {
      timeout: 15_000,
      interval: 300,
      timeoutMsg: `Timed out waiting for at least ${minCount} MoneyText values`,
    },
  );

  const moneyValues = await elementsById('MoneyText');
  const parsedValues: number[] = [];

  for (const valueEl of moneyValues) {
    const valueText = await valueEl.getText();
    const sats = parseSats(valueText);
    if (Number.isInteger(sats)) {
      parsedValues.push(sats);
    }
  }

  return parsedValues;
}

describe('@channel_order_mainnet - Channel order smoke', () => {
  let walletSeed = '';

  before(() => {
    if (!channelOrderSeed) {
      throw new Error('Missing CHANNEL_ORDER_SEED (or CJIT_SEED fallback) env var');
    }
    walletSeed = channelOrderSeed;
    if (!Number.isInteger(transferAmountSats) || transferAmountSats <= 0) {
      throw new Error(`Invalid CHANNEL_ORDER_AMOUNT_SATS value: ${process.env.CHANNEL_ORDER_AMOUNT_SATS}`);
    }
    if (!Number.isInteger(minimumFeeSats) || minimumFeeSats <= 0) {
      throw new Error(`Invalid CHANNEL_ORDER_MIN_FEE_SATS value: ${process.env.CHANNEL_ORDER_MIN_FEE_SATS}`);
    }
    if (!Number.isInteger(minimumReceivingCapacitySats) || minimumReceivingCapacitySats <= 0) {
      throw new Error(
        `Invalid CHANNEL_ORDER_MIN_RECEIVING_SATS value: ${process.env.CHANNEL_ORDER_MIN_RECEIVING_SATS}`,
      );
    }
  });

  ciIt('@channel_order_1 - Can validate channel order pricing and liquidity', async () => {
    await restoreWallet(walletSeed, {
      expectBackupSheet: false,
      reinstall: false,
      expectAndroidAlert: false,
    });

    await tap('ActivitySavings');
    await tap('TransferToSpending');
    await maybeTap('SpendingIntro-button');

    await enterAmount(transferAmountSats);
    await tapSpendingAmountContinueWithRetry();

    const confirmValues = await getMoneyTextValues(4);
    const [networkFeeSats, serviceFeeSats, toSpendingAmountSats, totalSats] = confirmValues;

    if (!(networkFeeSats > minimumFeeSats)) {
      throw new Error(`Network fee ${networkFeeSats} should be greater than ${minimumFeeSats}`);
    }

    if (!(serviceFeeSats > minimumFeeSats)) {
      throw new Error(`Service fee ${serviceFeeSats} should be greater than ${minimumFeeSats}`);
    }

    if (toSpendingAmountSats !== transferAmountSats) {
      throw new Error(`To spending amount ${toSpendingAmountSats} should equal ${transferAmountSats}`);
    }

    if (!(totalSats > transferAmountSats)) {
      throw new Error(`Total ${totalSats} should be greater than ${transferAmountSats}`);
    }

    await tap('SpendingConfirmMore');

    const liquidityValues = await getMoneyTextValues(2);
    const [spendingLiquiditySats, receivingLiquiditySats] = liquidityValues;

    if (spendingLiquiditySats !== transferAmountSats) {
      throw new Error(`Spending liquidity ${spendingLiquiditySats} should equal ${transferAmountSats}`);
    }

    if (!(receivingLiquiditySats > minimumReceivingCapacitySats)) {
      throw new Error(
        `Receiving liquidity ${receivingLiquiditySats} should be greater than ${minimumReceivingCapacitySats}`,
      );
    }
  });
});
