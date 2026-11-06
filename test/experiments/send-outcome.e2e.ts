import { completeOnboarding } from '../helpers/actions';
import initElectrum, { type ElectrumClient } from '../helpers/electrum';
import { ensureLocalFunds } from '../helpers/regtest';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import { runSendValidation } from '../helpers/send-validation';
import { runSendValidationBaseline } from './send-baseline';

const mode = process.env.OUTCOME_PILOT_MODE;
if (mode !== 'baseline' && mode !== 'outcome') throw new Error('Set OUTCOME_PILOT_MODE');

describe(`Local send outcome pilot (${mode})`, () => {
  let electrum: ElectrumClient;
  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum.waitForSync();
  });
  after(async () => {
    await electrum?.stop();
  });
  ciIt('@outcome_pilot_send - Validates payment data in the manual input', async () => {
    if (mode === 'baseline') await runSendValidationBaseline();
    else
      await runSendValidation({
        negativeControl: process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true',
      });
  });
});
