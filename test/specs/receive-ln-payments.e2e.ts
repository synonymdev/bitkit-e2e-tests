/**
 * Utility spec: receive multiple Lightning payments on an already-installed app.
 *
 * IMPORTANT: This spec attaches to the app already on the simulator — it does NOT
 * reinstall or reset. Use this when you have a specific version prepared and just
 * want to pump LN payments into it.
 *
 * Usage:
 *   BACKEND=regtest npm run e2e:ios -- --spec ./test/specs/receive-ln-payments.e2e.ts
 *
 * Environment:
 *   PAYMENT_COUNT  — number of payments to receive (default: 21)
 *   PAYMENT_AMOUNT — amount per payment in sats (default: 10)
 */

import {
  acknowledgeReceivedPayment,
  elementById,
  getUriFromQRCode,
  sleep,
  swipeFullScreen,
  tap,
} from '../helpers/actions';
import { payInvoice } from '../helpers/regtest';
import { getAppId } from '../helpers/constants';

const PAYMENT_COUNT = Number(process.env.PAYMENT_COUNT || '21');
const PAYMENT_AMOUNT = Number(process.env.PAYMENT_AMOUNT || '10');

function extractLightningInvoice(uri: string): string {
  const query = uri.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const ln = params.get('lightning');
  if (!ln) {
    throw new Error(`No lightning invoice found in URI: ${uri}`);
  }
  return ln;
}

describe('Receive LN payments (utility)', () => {
  before(async () => {
    const appId = getAppId();
    await driver.activateApp(appId);
    await sleep(3000);
  });

  it(`should receive ${PAYMENT_COUNT} Lightning payments`, async () => {
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < PAYMENT_COUNT; i++) {
      const label = `[${i + 1}/${PAYMENT_COUNT}]`;
      try {
        await tap('Receive');
        await sleep(1000);

        const uri = await getUriFromQRCode();
        const invoice = extractLightningInvoice(uri);
        console.info(`${label} Got invoice (${invoice.length} chars)`);

        await swipeFullScreen('down');
        await sleep(500);

        await payInvoice(invoice, PAYMENT_AMOUNT);
        console.info(`${label} Payment sent, waiting for acknowledgement...`);

        try {
          await acknowledgeReceivedPayment();
          console.info(`${label} ✓ Payment received`);
        } catch {
          console.info(`${label} ✓ Payment sent (no ack prompt)`);
        }

        succeeded++;
        await sleep(1000);
      } catch (error) {
        failed++;
        console.error(`${label} ✗ Failed: ${error}`);
        try {
          await swipeFullScreen('down');
        } catch { /* ignore */ }
        await sleep(2000);
      }
    }

    console.info(`\n══════════════════════════════════`);
    console.info(`  Done: ${succeeded}/${PAYMENT_COUNT} succeeded, ${failed} failed`);
    console.info(`══════════════════════════════════\n`);

    expect(succeeded).toBeGreaterThan(0);
  });
});
