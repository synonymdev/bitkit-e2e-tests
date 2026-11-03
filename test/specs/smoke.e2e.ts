import assert from 'node:assert/strict';
import path from 'node:path';
import {
  acknowledgeReceivedPaymentIfPresent,
  completeOnboarding,
  dismissBackupTimedSheet,
  dragOnElement,
  elementById,
  enterAddress,
  enterAmount,
  expectSavingsBalance,
  expectTotalBalance,
  getReceiveAddress,
  getUriFromQRCode,
  swipeFullScreen,
  tap,
} from '../helpers/actions';
import { blocktankURL, electrumHost, electrumPort, getBackend } from '../helpers/constants';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import {
  bitcoinAmountToSats,
  freshRegtestRecipient,
  history,
  regtestOperation,
  scriptHash,
  waitForPayment,
} from '../helpers/smoke-oracle';
import { writeJson } from '../reporting/report';

describe('@ios_smoke - Focused wallet smoke (shadow)', () => {
  const endpoint = { host: electrumHost, port: electrumPort, protocol: 'tls' as const };
  before(() => {
    if (getBackend() !== 'regtest')
      throw new Error('Smoke requires a matching regtest app build and BACKEND=regtest');
  });
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@smoke_wallet_1 - A fresh wallet reaches usable Home', async () => {
    await expectTotalBalance(0);
    await elementById('Receive').waitForDisplayed();
    await elementById('Send').waitForDisplayed();
  });

  ciIt('@smoke_receive_1 - Receive details encode the requested amount', async () => {
    const recipient = await getReceiveAddress();
    assert.ok(recipient.startsWith('bcrt1'));
    scriptHash(recipient);
    await tap('ShowDetails');
    await elementById('ReceiveScreen').waitForDisplayed();
    await tap('QRCode');
    await tap('SpecifyInvoiceButton');
    await tap('ReceiveNumberPadTextField');
    await tap('N1');
    await tap('N2');
    await tap('N3');
    await tap('ReceiveNumberPadSubmit');
    await tap('ShowQrReceive');
    const uri = await getUriFromQRCode();
    const [encodedAddress, query] = uri.replace(/^bitcoin:/, '').split('?');
    assert.equal(encodedAddress, recipient);
    const amount = new URLSearchParams(query).get('amount');
    assert.ok(amount, 'Receive QR must encode the specified amount');
    assert.equal(bitcoinAmountToSats(amount), 123);
  });

  ciIt('@smoke_onchain_1 - Receive and send with independent transaction evidence', async () => {
    const walletAddress = await getReceiveAddress();
    assert.equal((await history(endpoint, walletAddress)).length, 0, 'Wallet must be fresh');
    await swipeFullScreen('down');
    const depositResult = await regtestOperation(blocktankURL, 'deposit', {
      address: walletAddress,
      amountSat: 100_000,
    });
    const fundingTxid = depositResult.startsWith('"') ? JSON.parse(depositResult) : depositResult;
    assert.match(fundingTxid, /^[a-f0-9]{64}$/);
    await regtestOperation(blocktankURL, 'mine', { count: 1 });
    const received = await waitForPayment(endpoint, walletAddress, 100_000, { txid: fundingTxid });
    await acknowledgeReceivedPaymentIfPresent();
    await expectTotalBalance(100_000);
    await expectSavingsBalance(100_000);
    await dismissBackupTimedSheet({ triggerTimedSheet: true });

    const recipient = freshRegtestRecipient();
    assert.equal(
      (await history(endpoint, recipient)).length,
      0,
      'Recipient must be unique to this case'
    );
    await enterAddress(recipient);
    await enterAmount(10_000);
    await tap('ContinueAmount');
    await dragOnElement('GRAB', 'right', 0.95);
    await elementById('SendSuccess').waitForDisplayed();
    await tap('Close');
    await regtestOperation(blocktankURL, 'mine', { count: 1 });
    const sent = await waitForPayment(endpoint, recipient, 10_000, { spendsTxid: fundingTxid });
    await expectSavingsBalance(100_000, { condition: 'lt' });
    const directory = process.env.E2E_PLAN
      ? path.dirname(process.env.E2E_PLAN)
      : 'artifacts/reporting';
    writeJson(path.join(directory, `payment-attempt-${Number(process.env.ATTEMPT || 1)}.json`), {
      received,
      sent,
    });
  });
});
