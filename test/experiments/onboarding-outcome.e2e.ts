import {
  elementById,
  elementByText,
  sleep,
  swipeFullScreen,
  tap,
  waitForSetupWalletScreenFinish,
  waitForWalletHome,
} from '../helpers/actions';
import { tapAndExpect, swipeAndExpect } from '../helpers/outcome';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

const mode = process.env.OUTCOME_PILOT_MODE;
if (mode !== 'baseline' && mode !== 'outcome') {
  throw new Error('Set OUTCOME_PILOT_MODE=baseline or outcome');
}

// Same actions and terminal assertions as onboarding_1 at 01834b5f.
// Kept outside test/specs so this experiment cannot enter the regular CI selection.
describe(`Local onboarding outcome pilot (${mode})`, () => {
  beforeEach(async () => {
    await reinstallApp();
  });

  ciIt('@outcome_pilot - Can start onboarding', async () => {
    if (mode === 'baseline') {
      await elementById('Continue').waitForDisplayed();
      await sleep(1000);
      await tap('Continue');
      await tap('GetStarted');
      await elementById('Slide0').waitForDisplayed();
      await swipeFullScreen('left');
      await elementById('Slide1').waitForDisplayed();
      await swipeFullScreen('left');
      await elementById('Slide2').waitForDisplayed();
      await swipeFullScreen('left');
      await swipeFullScreen('left');
      await swipeFullScreen('right');
      await swipeFullScreen('right');
      await tap('SkipButton');
      await elementById('NewWallet').waitForDisplayed();
      await sleep(1000);
      await tap('NewWallet');
      await waitForSetupWalletScreenFinish();
      await waitForWalletHome();
    } else {
      // Deliberately wrong expectation proves a successful tap cannot pass a step.
      const firstExpected =
        process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true'
          ? 'PilotDeliberatelyMissing'
          : 'GetStarted';
      await tapAndExpect(
        { id: 'Continue' },
        {
          anyVisible: [{ id: firstExpected }],
          timeout: process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true' ? 2000 : 30_000,
        }
      );
      await tapAndExpect({ id: 'GetStarted' }, { anyVisible: [{ id: 'Slide0' }] });
      await swipeAndExpect('left', { anyVisible: [{ id: 'Slide1' }] });
      await swipeAndExpect('left', { anyVisible: [{ id: 'Slide2' }] });
      // The fourth page is wallet creation; swiping beyond it is idempotent.
      await swipeAndExpect('left', { anyVisible: [{ id: 'NewWallet' }] });
      await swipeAndExpect('left', { anyVisible: [{ id: 'NewWallet' }] });
      await swipeAndExpect('right', { anyVisible: [{ id: 'Slide2' }] });
      await swipeAndExpect('right', { anyVisible: [{ id: 'Slide1' }] });
      await tapAndExpect({ id: 'SkipButton' }, { anyVisible: [{ id: 'NewWallet' }] });
      await tapAndExpect(
        { id: 'NewWallet' },
        {
          anyVisible: [{ id: 'TotalBalance-primary' }, { id: 'UsdtIntroDecline' }],
          timeout: 150_000,
        }
      );
      // Keep the baseline's optional-introduction readiness check. Seeing Home once
      // does not prove a delayed introductory sheet will not cover it.
      await waitForWalletHome();
    }
    await elementByText('TO GET').waitForDisplayed();
  });
});
