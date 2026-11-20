import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  acknowledgeReceivedPayment,
  completeOnboarding,
  elementById,
  elementByText,
  expectSavingsBalance,
  expectSpendingBalance,
  expectTextWithin,
  formatSats,
  getAddressFromQRCode,
  getAmountUnder,
  getClipboardPlaintext,
  getReceiveAddress,
  multiTap,
  swipeFullScreen,
  tap,
  tryDismissQuickPayIntroIfVisible,
} from '../helpers/actions';
import { confirmGateAction, enterGateAddress } from '../helpers/gate-actions';
import { doNavigationClose, openSettings } from '../helpers/navigation';
import { tapAndExpect } from '../helpers/outcome';
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

async function receiveSparkLightning() {
  const originalInvoice = await getReceiveAddress('lightning');
  await editGateLightningInvoice();
  await tapAndExpect({ id: 'ReceiveNumberPadTextField' }, { anyVisible: [{ id: 'N1' }] });
  await tapAndExpect({ id: 'N1' }, { anyVisible: [{ id: 'N0' }] });
  await multiTap('N0', 4);
  await tapAndExpect({ id: 'ReceiveNumberPadSubmit' }, { anyVisible: [{ id: 'ShowQrReceive' }] });
  await tapAndExpect({ id: 'ShowQrReceive' }, { anyVisible: [{ id: 'QRCode' }] });
  const invoice = await getAddressFromQRCode('lightning');
  expect(invoice).not.toBe(originalInvoice);
  await swipeFullScreen('down');

  await sparkFixture('spark-pay', invoice);
  await acknowledgeReceivedPayment({ timeout: 90_000 });
  await expectSpendingBalance(lightningFundingSats);
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

async function expectOneSparkDeposit(txid: string, { claimed }: { claimed: boolean }) {
  await swipeFullScreen('up', { upStartYPercent: 0.75, upEndYPercent: 0.4 });
  await expectTextWithin('SparkDeposit', txid.slice(0, 8), { timeout: 90_000 });
  const depositRows = $$('//*[@resource-id="SparkDeposit" or @name="SparkDeposit"]');
  expect(await depositRows.length).toBe(1);
  const claimFee = elementByText('Claim fee', 'exact');
  if (claimed) await claimFee.waitForDisplayed({ timeout: 30_000 });
  else await expect(claimFee).not.toExist();
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
    await doNavigationClose();
    await receiveSparkLightning();
    await tryDismissQuickPayIntroIfVisible();

    const { invoice, payment_hash: paymentHash } = JSON.parse(
      await sparkFixture('spark-invoice', String(sendSats))
    );
    await enterGateAddress(invoice);
    await expectTextWithin('ReviewAmount-primary', formatSats(sendSats));
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }], timeout: 90_000 });
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
    await expectTextWithin('ActivityShort-1', formatSats(lightningFundingSats));
    await expect(elementById('ActivityShort-2')).not.toExist();
    await tapAndExpect({ id: 'ActivityShort-0' }, { anyVisible: [{ id: 'ActivityAmount' }] });
    expect(await getAmountUnder('ActivityAmount')).toBe(sendSats);
    const feeSats = (await elementById('ActivityFee').isExisting())
      ? await getAmountUnder('ActivityFee')
      : 0;
    await tapAndExpect({ id: 'NavigationBack' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    await expectSpendingBalance(lightningFundingSats - sendSats - feeSats);
    await expectSavingsBalance(0);
    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(lightningFundingSats - sendSats - feeSats);
  });

  ciIt('@spark_3 - Confirm an on-chain deposit into Spark', async () => {
    const depositSats = 100_000;
    const address = await copySparkDepositAddress();
    const txid = await sparkFixture('spark-fund', address, String(depositSats));

    await expectOneSparkDeposit(txid, { claimed: false });
    const pending = JSON.parse(await sparkFixture('spark-tx', txid));
    expect(pending.status).toBe('in the mempool');
    expect(pending.outputs).toContainEqual({ address, value: depositSats });
    await doNavigationClose();
    await expectSpendingBalance(0);

    await sparkFixture('spark-mine');
    await expectSpendingBalance(depositSats);
    await expectSavingsBalance(0);
    await openSparkConnection();
    await expectOneSparkDeposit(txid, { claimed: true });

    await launchFreshApp();
    await expectSpendingBalance(depositSats);
    await expectSavingsBalance(0);
    await openSparkConnection();
    await expectOneSparkDeposit(txid, { claimed: true });
  });
});
