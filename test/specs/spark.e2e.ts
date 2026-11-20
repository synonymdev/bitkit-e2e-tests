import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  acknowledgeReceivedPayment,
  completeOnboarding,
  elementById,
  expectSpendingBalance,
  expectTextWithin,
  getAddressFromQRCode,
  getAmountUnder,
  getReceiveAddress,
  multiTap,
  swipeFullScreen,
} from '../helpers/actions';
import { doNavigationClose, openSettings } from '../helpers/navigation';
import { tapAndExpect } from '../helpers/outcome';
import { editGateLightningInvoice } from '../helpers/receive-invoice';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const runCommand = promisify(execFile);
const describeSpark = process.env.BITKIT_LOCAL_SPARK === '1' ? describe : describe.skip;

function reportSparkCase(status: 'started' | 'passed') {
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `spark-case=${status}\n`);
  }
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

describeSpark('Spark on local regtest', () => {
  ciIt('@spark_1 - Receive a Lightning payment into Spark', async () => {
    reportSparkCase('started');
    await reinstallApp();
    await completeOnboarding();

    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(0);
    await doNavigationClose();

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

    await runCommand(resolve(__dirname, '../../scripts/local-backend'), ['spark-pay', invoice], {
      timeout: 120_000,
    });
    await acknowledgeReceivedPayment({ timeout: 90_000 });
    await expectSpendingBalance(10_000);
    await expectTextWithin('ActivityShort-0', '+');
    await expectTextWithin('ActivityShort-0', '10 000');

    await openSparkConnection();
    expect(await getAmountUnder('SparkBalance')).toBe(10_000);
    reportSparkCase('passed');
  });
});
