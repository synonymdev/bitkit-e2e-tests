import BitcoinJsonRpc from 'bitcoin-json-rpc';
import { bitcoinURL } from '../helpers/constants';
import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  completeOnboarding,
  confirmInputOnKeyboard,
  deleteAllDefaultWidgets,
  elementById,
  elementByIdWithin,
  elementByText,
  getSeed,
  receiveOnchainFunds,
  restoreWallet,
  sleep,
  tap,
  typeText,
} from '../helpers/actions';

describe('@backup - Backup', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;
  const rpc = new BitcoinJsonRpc(bitcoinURL);

  before(async () => {
    // ensure we have at least 10 BTC on regtest
    let balance = await rpc.getBalance();
    const address = await rpc.getNewAddress();

    while (balance < 10) {
      await rpc.generateToAddress(10, address);
      balance = await rpc.getBalance();
    }

    electrum = await initElectrum();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum?.waitForSync();
  });

  after(async () => {
    await electrum?.stop();
  });

  it('@backup_1 - Can backup metadata, widget, settings and restore them', async () => {
    // testplan:
    // - receive some money and set tag
    // - change settings
    // - add widgets
    // - backup seed
    // - restore wallet
    // - check if everything was restored

    // - receive some money //
    await receiveOnchainFunds(rpc, { sats: 100_000_000, expectHighBalanceWarning: true });

    // - set tag //
    const tag = 'testtag';
    await tap('ActivitySavings');
    await tap('Activity-1');
    await tap('ActivityTag');
    await typeText('TagInput', tag);
    // workaround for Android keyboard not hiding (only in emulator)
    await confirmInputOnKeyboard();
    await tap('ActivityTagsSubmit');
    await sleep(200);
    await tap('NavigationClose');
    await tap('NavigationBack');

    // - change settings (currency to GBP) //
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('GeneralSettings');
    await tap('CurrenciesSettings');
    const gbp_opt = await elementByText('GBP (£)');
    await gbp_opt.waitForDisplayed();
    await gbp_opt.click();
    await tap('NavigationClose');

    // - add widgets (add PriceWidget) //
    await deleteAllDefaultWidgets();
    await tap('WidgetsAdd');
    await tap('WidgetsOnboarding-button');
    await tap('WidgetListItem-price');
    await elementById('WidgetSave').waitForDisplayed();
    await sleep(1000); // wait for the app to settle
    await tap('WidgetSave');
    // sometimes flaky on GH actions, try again
    try {
      await elementById('PriceWidget').waitForDisplayed();
    } catch {
      await tap('WidgetSave');
    }
    await elementById('PriceWidget').waitForDisplayed();

    // - backup seed and restore wallet //
    const seed = await getSeed();
    // await waitForBackup();
    await sleep(10_000); //temp wait (until we have a proper event for backup completion)
    await restoreWallet(seed);

    // - check if everything was restored
    await sleep(1000);
    // check settings
    const moneyFiatSymbol = await elementByIdWithin('TotalBalance', 'MoneyFiatSymbol');
    await expect(moneyFiatSymbol).toHaveText('£');
    // check widget
    await elementById('PriceWidget').waitForDisplayed();
    // check metadata

    // data backup not fully functional yet
    // https://github.com/synonymdev/bitkit-android/issues/321
    // await tap('ActivitySavings');
    // await tap('Activity-1');
    // const tagElement = await elementById('Tag-${tag}');
    // await tagElement.waitForDisplayed();
  });
});
