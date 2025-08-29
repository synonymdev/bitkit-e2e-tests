import {
  tap,
  completeOnboarding,
  elementByIdWithin,
  elementByText,
  sleep,
} from '../helpers/actions';
import { launchFreshApp, reinstallApp } from '../helpers/setup';

describe('Settings', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  describe('General', () => {
    it('Can switch local currency', async () => {
      // switch to local currency
      await tap('TotalBalance');
      expect(await elementByIdWithin('-primary', 'MoneyFiatSymbol')).toHaveText('$');

      // - change settings (currency to EUR) //
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      const eur_opt = await elementByText('EUR (€)');
      await eur_opt.waitForDisplayed();
      await eur_opt.click();
      await tap('NavigationClose');

      expect(await elementByIdWithin('-primary', 'MoneyFiatSymbol')).toHaveText('€');

      // switch back to sats
      await tap('TotalBalance');
      await sleep(500);
      expect(await elementByIdWithin('-primary', 'MoneyFiatSymbol')).toHaveText('₿');

      // switch to USD
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      const usd_opt = await elementByText('USD ($)');
      await usd_opt.waitForDisplayed();
      await usd_opt.click();
      await tap('NavigationClose');
    });

    it('Can switch Bitcoin Unit', async () => {
      const fiatSymbol = await elementByIdWithin('TotalBalance', 'MoneyFiatSymbol');
      const balance = await elementByIdWithin('TotalBalance', 'MoneyText');
      const unitRow = await elementByIdWithin('UnitSettings', 'Value');

      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      // check default unit
      expect(unitRow).toHaveText('Bitcoin');

      // switch to USD
      await tap('UnitSettings');
      await tap('USD');
      await tap('NavigationBack');
      expect(unitRow).toHaveText('USD');
      await tap('NavigationClose');
      expect(fiatSymbol).toHaveText('$');
      expect(balance).toHaveText('0.00');

      // switch back to BTC
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('UnitSettings');
      await tap('Bitcoin');
      await tap('NavigationBack');
      expect(unitRow).toHaveText('Bitcoin');
      await tap('NavigationClose');
      expect(balance).toHaveText('0');

      // switch to classic denomination
      await tap('HeaderMenu');
      await sleep(500);
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('UnitSettings');
      await tap('DenominationClassic');
      await tap('NavigationBack');
      expect(unitRow).toHaveText('Bitcoin');
      await tap('NavigationClose');
      expect(balance).toHaveText('0.00000000');
    });

    it('Can switch transaction speed', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');

      // switch to Fast
      await tap('TransactionSpeedSettings');
      await tap('fast');
      expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText('Fast');

      // switch to Custom
      await tap('TransactionSpeedSettings');
      await tap('custom');
      (await elementByIdWithin('CustomFee', 'N1')).click();
      await tap('Continue');
      await tap('NavigationBack');
      expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText('Custom');

      // switch back to Normal
      await tap('TransactionSpeedSettings');
      await tap('normal');
      expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText('Normal');
    });
  });
});
