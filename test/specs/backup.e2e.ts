import initElectrum from '../helpers/electrum';
import { reinstallApp } from '../helpers/setup';
import {
  completeOnboarding,
  confirmInputOnKeyboard,
  deleteAllDefaultWidgets,
  doNavigationClose,
  elementById,
  elementByIdWithin,
  elementByText,
  getSeed,
  receiveOnchainFunds,
  restoreWallet,
  sleep,
  tap,
  typeText,
  waitForBackup,
} from '../helpers/actions';
import { ciIt } from '../helpers/suite';
import { getBitcoinRpc } from '../helpers/regtest';

describe('@backup - Backup', () => {
  let electrum: Awaited<ReturnType<typeof initElectrum>> | undefined;
  const rpc = getBitcoinRpc();

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

  ciIt('@backup_1 - Can backup metadata, widget, settings and restore them', async () => {
    // testplan:
    // - receive some money and set tag
    // - change settings
    // - add widgets
    // - backup seed
    // - restore wallet
    // - check if everything was restored

    // - receive some money //
    await receiveOnchainFunds({ sats: 100_000_000, expectHighBalanceWarning: true });

    // - set tag //
    const tag = 'testtag';
    await tap('ActivitySavings');
    await tap('Activity-1');
    await tap('ActivityTag');
    await typeText('TagInput', tag);
    await tap('ActivityTagsSubmit');
    // workaround for Android keyboard not hiding (only in emulator)
    if (driver.isAndroid) {
      await confirmInputOnKeyboard();
    }
    await sleep(200);
    await tap('NavigationBack');
    await tap('NavigationBack');

    // - change settings (currency to GBP) //
    await tap('HeaderMenu');
    await tap('DrawerSettings');
    await tap('GeneralSettings');
    await tap('CurrenciesSettings');
    const gbp_opt = await elementByText('GBP (£)');
    await gbp_opt.waitForDisplayed();
    await gbp_opt.click();
    await doNavigationClose();

    // - add widgets (add PriceWidget) //
    await sleep(1000); // wait for the app to settle
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
    await waitForBackup();
    await restoreWallet(seed);

    // - check if everything was restored
    await sleep(1000);
    // check settings
    const moneyFiatSymbol = await elementByIdWithin('TotalBalance', 'MoneyFiatSymbol');
    await expect(moneyFiatSymbol).toHaveText('£');
    // check widget
    await elementById('PriceWidget').waitForDisplayed();
    // check metadata
    await tap('ActivitySavings');
    await tap('Activity-1');
    const tagElement = await elementById(`Tag-${tag}-delete`);
    await tagElement.waitForDisplayed();
  });
});
