import {
  tap,
  completeOnboarding,
  elementByIdWithin,
  elementByText,
  sleep,
  elementById,
  typeText,
  swipeFullScreen,
  dragOnElement,
  elementsById,
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

    it('Can remove last used tags', async () => {
      // no tags, menu entry should be hidden
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await elementById('TagsSettings').waitForDisplayed({ reverse: true });
      await tap('NavigationClose');

      // open receive tags, add a tag
      const tag = 'test123';
      await tap('Receive');
      await tap('SpecifyInvoiceButton');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });

      await tap('TagsAdd');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });
      await typeText('TagInputReceive', tag);
      await tap('ReceiveTagsSubmit');
      await sleep(300);
      (await elementByText(tag)).waitForDisplayed();
      await swipeFullScreen('down');
      await sleep(1000); // wait for the app to settle

      // open tag manager, delete tag
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('TagsSettings');
      (await elementByText(tag)).waitForDisplayed();
      await tap(`Tag-${tag}-delete`);
      await tap('NavigationClose');

      // open receive tags, check tags are gone
      await tap('Receive');
      await tap('SpecifyInvoiceButton');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });
      await tap('TagsAdd');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });
    });

    it('Can show About screen', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('About');
      await elementById('AboutLogo').waitForDisplayed();
    });
  });

  describe('Security and Privacy', () => {
    it('Can swipe to hide balance', async () => {
      // test plan:
      // - swipe to hide balance
      // - disable 'swipe to hide balance'
      // - enable 'hide balance on open'

      // Balance should be visible
      await elementById('ShowBalance').waitForDisplayed({ reverse: true });
      // Swipe to hide balance
      await dragOnElement('TotalBalance', 'right', 0.5);
      // Balance should be hidden
      await elementById('ShowBalance').waitForDisplayed();

      // Disable 'swipe to hide balance'
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('SecuritySettings');
      await tap('SwipeBalanceToHide');
      await tap('NavigationClose');

      // Balance should be visible
      await elementById('ShowBalance').waitForDisplayed({ reverse: true });
      // Should not be able to hide balance
      await dragOnElement('TotalBalance', 'right', 0.5);
      // Balance should still be visible
      await elementById('ShowBalance').waitForDisplayed({ reverse: true });

      // Enable 'hide balance on open'
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('SecuritySettings');
      await tap('SwipeBalanceToHide');
      await tap('HideBalanceOnOpen');

      // Restart the app
      await launchFreshApp();
      // Balance should be hidden
      await elementById('ShowBalance').waitForDisplayed();
    });
  });

  describe('Backup or restore', () => {
    it('Can show backup and validate it', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('BackupSettings');
      await tap('ResetAndRestore');
      await tap('NavigationBack');
      await tap('BackupWallet');
      await sleep(1000); // animation

      // get the seed from SeedContainer
      const seedElement = await elementById('SeedContainer');
      const attr = driver.isAndroid ? 'contentDescription' : 'label';
      const seed = await seedElement.getAttribute(attr);
      console.info({ seed });
      await tap('TapToReveal');
      await sleep(1000); // animation
      await tap('ContinueShowMnemonic');

      // enter the seed
      const words_used: string[] = [];
      for (const w of seed.split(' ')) {
        const word = await elementsById('Word-' + w);
        // in case there are a few same words in the seed phrase
        const idxToClick = words_used.filter(x => x === w).length;
        word[idxToClick].click();
        words_used.push(w);
      }
      await sleep(1000);
      await tap('ContinueConfirmMnemonic');
      await tap('OK');
      await tap('OK');
      await tap('OK');
      await tap('OK');
      await sleep(1000);
    });
  });
});
