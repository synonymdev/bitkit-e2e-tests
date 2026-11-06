import { waitAndExpect, tapAndExpect } from '../helpers/outcome';
import { enterGateAddress, confirmGateAction } from '../helpers/gate-actions';
import {
  completeOnboarding,
  tap,
  elementById,
  receiveOnchainFunds,
  expectText,
  expectTextWithin,
  elementByIdWithin,
  getTextUnder,
  doNavigationClose,
  getSeed,
  waitForBackup,
  restoreWallet,
} from '../helpers/actions';
import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import { ensureLocalFunds, getExternalAddress, mineBlocks } from '../helpers/regtest';

describe('@boost @ios_gate - Boost', () => {
  let electrum: { waitForSync: any; stop: any };

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  after(() => {
    electrum?.stop();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@boost_1 - Can do CPFP', async () => {
    // fund the wallet (100 000), don't mine blocks so tx is unconfirmed
    await receiveOnchainFunds({ sats: 100_000, blocksToMine: 0 });

    // check Activity
    await expectTextWithin('ActivityShort-0', '100 000');
    await expectTextWithin('ActivityShort-0', '+');

    // old tx
    await tap('ActivityShort-0');
    await expectText('100 000', { strategy: 'contains' });
    await tap('ActivityTxDetails');
    const origTxId = await getTextUnder('TXID');
    console.info({ oldTxId: origTxId });
    await tap('NavigationBack');

    // boost
    await tapAndExpect({ id: 'BoostButton' }, { all: [{ visible: { id: 'CPFPBoost' } }] });
    await elementById('CPFPBoost').waitForDisplayed();
    await tap('CustomFeeButton');
    await tap('Plus');
    await tap('Minus');
    await tap('RecommendedFeeButton');
    await confirmGateAction({ appeared: [{ id: 'BoostSuccessToast' }] });
    await waitAndExpect({ all: [{ hidden: { id: 'BoostSuccessToast' } }] });

    // check Activity
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();
    await expectTextWithin('ActivityShort-0', '-');
    await expectTextWithin('ActivityShort-0', 'Boost Fee');
    await expectTextWithin('ActivityShort-1', '100 000');
    await expectTextWithin('ActivityShort-1', '+');

    // orig tx still there
    await tap('ActivityShort-1');
    await expectText('100 000', { strategy: 'contains' });
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();
    await tap('ActivityTxDetails');
    const checkOrigTxId = await getTextUnder('TXID');
    console.info({ checkOrigTxId });
    await expect(origTxId === checkOrigTxId).toBe(true);
    await elementById('CPFPBoosted').waitForDisplayed();
    const parentTxId = await getTextUnder('CPFPBoosted');
    console.info({ parentTxId });
    await doNavigationClose();

    // new tx: Boost Fee
    await tap('ActivityShort-0');
    await tap('ActivityTxDetails');
    const boostTxId = await getTextUnder('TXID');
    console.info({ newTxId: boostTxId });
    await expect(origTxId !== boostTxId).toBe(true);
    await expect(boostTxId === parentTxId).toBe(true);
    await doNavigationClose();

    // wipe & restore
    const seed = await getSeed();
    await waitForBackup();
    await restoreWallet(seed);

    // check activity after restore
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await tapAndExpect({ id: 'ActivityShort-1' }, { all: [{ visible: { id: 'BoostedButton' } }] });
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();

    // mine new block
    await mineBlocks(1);
    await doNavigationClose();

    // check activity item after mine
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await tapAndExpect(
      { id: 'ActivityShort-0' },
      { all: [{ visible: { id: 'StatusConfirmed' } }] }
    );
    await elementById('StatusConfirmed').waitForDisplayed();
    await doNavigationClose();
    await tapAndExpect(
      { id: 'ActivityShort-1' },
      { all: [{ visible: { id: 'StatusConfirmed' } }] }
    );
    await elementById('StatusConfirmed').waitForDisplayed();
  });

  ciIt('@boost_2 - Can do RBF', async () => {
    // fund the wallet (100 000)
    await receiveOnchainFunds();

    // Send 10 000
    const coreAddress = await getExternalAddress();
    await enterGateAddress(coreAddress);
    await tap('N1');
    await tap('N0');
    await tap('N000');
    await expectText('10 000');
    await tapAndExpect({ id: 'ContinueAmount' }, { anyVisible: [{ id: 'GRAB' }] });
    await confirmGateAction({ anyVisible: [{ id: 'SendSuccess' }] });
    await elementById('SendSuccess').waitForDisplayed();
    await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
    const moneyText = await elementByIdWithin('TotalBalance-primary', 'MoneyText');
    await expect(moneyText).not.toHaveText('100 000');

    // check Activity
    await elementById('ActivityShort-0').waitForDisplayed();
    await expectTextWithin('ActivityShort-0', '-');
    await elementById('ActivityShort-1').waitForDisplayed();
    await expectTextWithin('ActivityShort-1', '100 000');
    await expectTextWithin('ActivityShort-1', '+');
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();

    // confirmed receiving tx
    await tapAndExpect({ id: 'ActivityShort-1' }, { all: [{ visible: { id: 'BoostDisabled' } }] });
    await elementById('BoostDisabled').waitForDisplayed();
    await tap('NavigationBack');

    // old tx
    await tapAndExpect(
      { id: 'ActivityShort-0' },
      { all: [{ textWithin: { id: 'ActivityAmount', text: '10 000', strategy: 'contains' } }] }
    );
    await expectTextWithin('ActivityAmount', '10 000');
    const oldFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
    console.info({ oldFee });
    await tap('ActivityTxDetails');
    const oldTxId = await getTextUnder('TXID');
    console.info({ oldTxId });
    await tap('NavigationBack');

    // boost
    await tapAndExpect({ id: 'BoostButton' }, { all: [{ visible: { id: 'RBFBoost' } }] });
    await elementById('RBFBoost').waitForDisplayed();
    await tap('CustomFeeButton');
    await tap('Plus');
    await tap('Minus');
    await tap('RecommendedFeeButton');
    await confirmGateAction({ appeared: [{ id: 'BoostSuccessToast' }] });
    await waitAndExpect({ all: [{ hidden: { id: 'BoostSuccessToast' } }] });

    // check Activity
    await elementById('BoostingIcon').waitForDisplayed();
    await elementById('ActivityShort-0').waitForDisplayed();
    await elementById('ActivityShort-1').waitForDisplayed();
    await expect(elementById('ActivityShort-2')).not.toBeDisplayed();
    await expectTextWithin('ActivityShort-0', '-');
    await expectTextWithin('ActivityShort-1', '100 000');
    await expectTextWithin('ActivityShort-1', '+');

    // new tx
    await tapAndExpect({ id: 'ActivityShort-0' }, { all: [{ visible: { id: 'BoostedButton' } }] });
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();
    await expectTextWithin('ActivityAmount', '10 000');
    const newFee = await (await elementByIdWithin('ActivityFee', 'MoneyText')).getText();
    console.info({ newFee });
    await tap('ActivityTxDetails');
    const newTxId = await getTextUnder('TXID');
    console.info({ newTxId });
    await expect(Number(oldFee.replace(' ', '')) < Number(newFee.replace(' ', ''))).toBe(true);
    await expect(oldTxId !== newTxId).toBe(true);
    await elementById('RBFBoosted').waitForDisplayed();
    await doNavigationClose();

    // wipe & restore
    const seed = await getSeed();
    await waitForBackup();
    await restoreWallet(seed);

    // check activity after restore
    await (await elementByIdWithin('ActivityShort-0', 'BoostingIcon')).waitForDisplayed();
    await tapAndExpect({ id: 'ActivityShort-0' }, { all: [{ visible: { id: 'BoostedButton' } }] });
    await elementById('BoostedButton').waitForDisplayed();
    await elementById('StatusBoosting').waitForDisplayed();
    await doNavigationClose();

    // mine new block
    await mineBlocks(1);
    await doNavigationClose();

    // check activity item after mine
    await elementById('ActivityShort-0').waitForDisplayed();
    await tapAndExpect(
      { id: 'ActivityShort-0' },
      { all: [{ visible: { id: 'StatusConfirmed' } }] }
    );
    await elementById('StatusConfirmed').waitForDisplayed();
    await doNavigationClose();
  });
});
