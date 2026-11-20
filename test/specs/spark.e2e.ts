import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  acknowledgeReceivedPayment,
  completeOnboarding,
  dragOnElement,
  elementById,
  elementByText,
  enterAmount,
  expectSavingsBalance,
  expectSpendingBalance,
  expectTextWithin,
  formatSats,
  getAddressFromQRCode,
  getAmountUnder,
  getClipboardPlaintext,
  getReceiveAddress,
  getSavingsBalance,
  getSpendingBalance,
  handleOver50PercentAlert,
  swipeFullScreen,
  tap,
  tryDismissQuickPayIntroIfVisible,
  waitForWalletHomeCondition,
} from '../helpers/actions';
import { enterGateAddress } from '../helpers/gate-actions';
import { doNavigationClose, openSettings } from '../helpers/navigation';
import { tapAndExpect, waitAndExpect } from '../helpers/outcome';
import { editGateLightningInvoice } from '../helpers/receive-invoice';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const runCommand = promisify(execFile);
const describeSpark = process.env.BITKIT_LOCAL_SPARK === '1' ? describe : describe.skip;
const lightningFundingSats = 10_000;

async function sparkFixture(...args: string[]): Promise<string> {
  const { stdout } = await runCommand(resolve(__dirname, '../../scripts/local-backend'), args, {
    timeout: 120_000,
  });
  return stdout.trim();
}

async function openSparkConnection() {
  await openSettings('advanced');
  await tapAndExpect({ id: 'Channels' }, { anyVisible: [{ id: 'SparkConnection' }] });
  await tapAndExpect(
    { id: 'SparkConnection' },
    { anyVisible: [{ id: 'SparkBalance' }, { id: 'SparkDepositAddress' }] }
  );
  if (!(await elementById('SparkBalance').isDisplayed())) {
    await swipeFullScreen('up', { upStartYPercent: 0.68, upEndYPercent: 0.34 });
  }
}

async function receiveSparkLightning(amount = lightningFundingSats) {
  const originalInvoice = await getReceiveAddress('lightning');
  await editGateLightningInvoice();
  await tapAndExpect({ id: 'ReceiveNumberPadTextField' }, { anyVisible: [{ id: 'N1' }] });
  await enterAmount(amount);
  await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ShowQrReceive' }] });
  await tapAndExpect({ id: 'ShowQrReceive' }, { anyVisible: [{ id: 'QRCode' }] });
  const invoice = await getAddressFromQRCode('lightning');
  expect(invoice).not.toBe(originalInvoice);
  await swipeFullScreen('down');

  await sparkFixture('spark-pay', invoice);
  await acknowledgeReceivedPayment({ timeout: 90_000 });
  await expectFundedSparkWallet(amount);
}

async function copySparkDepositAddress() {
  const readClipboard = () =>
    driver.isIOS
      ? driver.execute<string, [{ encoding: string }]>('mobile: getPasteboard', {
          encoding: 'utf8',
        })
      : getClipboardPlaintext();
  if (driver.isIOS) {
    await driver.execute('mobile: setPasteboard', { content: '', encoding: 'utf8' });
  }
  const oldClipboard = (await readClipboard()).trim();
  await tap('SparkDepositAddress');
  let address = '';
  await browser.waitUntil(
    async () => {
      address = (await readClipboard()).trim();
      return address !== oldClipboard && /^bcrt1[qp][02-9ac-hj-np-z]+$/.test(address);
    },
    {
      timeout: 15_000,
      interval: 500,
      timeoutMsg: 'Spark did not copy a fresh regtest deposit address',
    }
  );
  return address;
}

async function getSparkDepositClaimFee(txid: string) {
  const deposit = elementById('SparkDeposit');
  const claimFee = elementByText('Claim fee', 'exact');
  await browser.waitUntil(
    async () => {
      if ((await deposit.isDisplayed()) && (await claimFee.isDisplayed())) return true;
      // On iOS the fixed transfer buttons sit below the details scroll view.
      await swipeFullScreen('up', { upStartYPercent: 0.65, upEndYPercent: 0.35 });
      return false;
    },
    { timeout: 90_000, interval: 1_500, timeoutMsg: 'Spark did not display the claimed deposit' }
  );
  await expectTextWithin('SparkDeposit', txid.slice(0, 8));
  const depositRows = $$(
    '//*[@resource-id="SparkDeposit"] | //XCUIElementTypeButton[@name="SparkDeposit"]'
  );
  expect(await depositRows.length).toBe(1);

  const feeAmount = $(
    driver.isIOS
      ? '//XCUIElementTypeStaticText[@label="Claim fee"]/following-sibling::XCUIElementTypeStaticText[1]'
      : '//*[@text="Claim fee"]/parent::*/*[@resource-id="MoneyText"]'
  );
  const digits = (await feeAmount.getText()).replace(/[^\d]/g, '');
  if (!digits) throw new Error('The Spark deposit claim fee was not displayed in sats');
  return Number(digits);
}

async function waitForSparkDepositTransaction(txid: string, status: RegExp) {
  await browser.waitUntil(
    async () => {
      try {
        const transaction = JSON.parse(await sparkFixture('spark-tx', txid));
        return status.test(transaction.status);
      } catch (error) {
        if (String(error).includes('did not answer')) return false;
        throw error;
      }
    },
    {
      timeout: 30_000,
      interval: 1_000,
      timeoutMsg: `Spark deposit ${txid} did not reach ${status}`,
    }
  );
}

async function waitForSparkWalletHome(condition: () => Promise<boolean>) {
  const backupLater = elementById('BackupIntroViewCancel');
  const quickPay = elementById(
    driver.isAndroid ? 'QuickpayIntro-button' : 'QuickpayIntroDescription'
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    let backupVisible = false;
    let quickPayVisible = false;
    let readySince: number | undefined;
    await waitForWalletHomeCondition(
      async () => {
        backupVisible = await backupLater.isDisplayed();
        quickPayVisible = !backupVisible && (await quickPay.isDisplayed());
        if (backupVisible || quickPayVisible) return true;
        if (!(await condition())) {
          readySince = undefined;
          return false;
        }
        // Funded-wallet reminders can appear two seconds after Home appears.
        readySince ??= Date.now();
        return Date.now() - readySince >= 2_500;
      },
      { timeout: Math.max(1, deadline - Date.now()) }
    );
    if (backupVisible) {
      if (await backupLater.isDisplayed()) await backupLater.click();
    } else if (quickPayVisible) {
      await tryDismissQuickPayIntroIfVisible();
    } else {
      return;
    }
  }
  throw new Error('Spark wallet home did not settle');
}

async function expectFundedSparkWallet(amount: number) {
  await waitForSparkWalletHome(async () => {
    return (
      (await elementById('ActivitySpending').isDisplayed()) &&
      (await elementById('ActivitySavings').isDisplayed()) &&
      (await getSpendingBalance()) === amount &&
      (await getSavingsBalance()) === 0
    );
  });
}

describeSpark('Spark on local regtest', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(0);
  });

  ciIt('@spark_1 - Receive a Lightning payment into Spark', async () => {
    await doNavigationClose();
    await receiveSparkLightning();
    await expectTextWithin('ActivityShort-0', '+');
    await expectTextWithin('ActivityShort-0', formatSats(lightningFundingSats));

    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(lightningFundingSats);
  });

  ciIt('@spark_2 - Send a Lightning payment from Spark', async () => {
    const sendSats = 1_000;
    // The pinned provider charges 2 sats plus 4,000 ppm and does not support wallet leaf swaps.
    // Fund the exact total so paying Alice does not require breaking a leaf to make change.
    const expectedFeeSats = 6;
    const fundingSats = sendSats + expectedFeeSats;
    await doNavigationClose();
    await receiveSparkLightning(fundingSats);

    const { invoice, payment_hash: paymentHash } = JSON.parse(
      await sparkFixture('spark-invoice', String(sendSats))
    );
    await waitForSparkWalletHome(() => elementById('Send').isDisplayed());
    await enterGateAddress(invoice);
    await expectTextWithin('ReviewAmount-primary', formatSats(sendSats));
    await dragOnElement('GRAB', 'right', 0.95);
    await handleOver50PercentAlert();
    await waitAndExpect({
      anyVisible: [{ id: 'SendSuccess' }, { id: 'SendFailure' }],
      timeout: 90_000,
    });
    await expect(elementById('SendSuccess')).toBeDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });

    await browser.waitUntil(
      async () => {
        const payment = JSON.parse(await sparkFixture('spark-payment-details', paymentHash));
        return (
          payment.status === 'SUCCEEDED' &&
          payment.direction === 'INBOUND' &&
          Number(payment.amount_msat) === sendSats * 1_000
        );
      },
      {
        timeout: 60_000,
        interval: 2_000,
        timeoutMsg: 'The fixture recipient did not settle the Spark payment',
      }
    );

    await expectTextWithin('ActivityShort-0', '-');
    await expectTextWithin('ActivityShort-0', 'Sent');
    await expectTextWithin('ActivityShort-1', '+');
    await expectTextWithin('ActivityShort-1', formatSats(fundingSats));
    await expect(elementById('ActivityShort-2')).not.toExist();
    await tapAndExpect({ id: 'ActivityShort-0' }, { anyVisible: [{ id: 'ActivityAmount' }] });
    expect(await getAmountUnder('ActivityAmount')).toBe(sendSats);
    expect(await getAmountUnder('ActivityFee')).toBe(expectedFeeSats);
    await tapAndExpect({ id: 'NavigationBack' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expectSpendingBalance(0);
    await expectSavingsBalance(0);
    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(0);
  });

  ciIt('@spark_3 - Confirm an on-chain deposit into Spark', async () => {
    const depositSats = 100_000;
    const address = await copySparkDepositAddress();
    const txid = await sparkFixture('spark-fund', address, String(depositSats));

    await waitForSparkDepositTransaction(txid, /^in the mempool$/);
    const pending = JSON.parse(await sparkFixture('spark-tx', txid));
    expect(pending.status).toBe('in the mempool');
    expect(pending.outputs).toContainEqual({ address, value: depositSats });

    // On the local provider the wallet can claim deposits before their first confirmation.
    await sparkFixture('spark-mine');
    await waitForSparkDepositTransaction(txid, /^confirmed at /);
    const feeSats = await getSparkDepositClaimFee(txid);
    expect(feeSats).toBeLessThan(depositSats);
    const creditedSats = depositSats - feeSats;
    await doNavigationClose();
    await expectFundedSparkWallet(creditedSats);

    await launchFreshApp();
    await expectFundedSparkWallet(creditedSats);
    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(creditedSats);
    expect(await getSparkDepositClaimFee(txid)).toBe(feeSats);
  });
});
