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
  getReceiveAddress,
  acceptAppNotificationAlert,
  confirmInputOnKeyboard,
} from '../helpers/actions';
import { electrumHost, electrumPort } from '../helpers/constants';
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
      try {
        await tap('TotalBalance');
        await expect(await elementsById('MoneyFiatSymbol')[1]).toHaveText('$');
      } catch {
        await tap('TotalBalance');
      }
      await expect(await elementsById('MoneyFiatSymbol')[1]).toHaveText('$');

      // - change settings (currency to EUR) //
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      const eur_opt = await elementByText('EUR (€)');
      await eur_opt.waitForDisplayed();
      await eur_opt.click();
      await tap('NavigationClose');

      await expect(await elementsById('MoneyFiatSymbol')[1]).toHaveText('€');

      // switch back to sats
      await tap('TotalBalance');
      await sleep(500);
      await expect(await elementsById('MoneyFiatSymbol')[1]).toHaveText('₿');

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
      const fiatSymbol = (await elementsById('MoneyFiatSymbol'))[1];
      const balance = (await elementsById('MoneyText'))[1];
      const unitRow = await elementByIdWithin('UnitSettings', 'Value');

      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');

      // switch to USD
      await tap('UnitSettings');
      await tap('USD');
      await tap('NavigationBack');
      await expect(unitRow).toHaveText('USD');
      await tap('NavigationClose');
      await expect(fiatSymbol).toHaveText('$');
      await expect(balance).toHaveText('0.00');

      // switch back to BTC
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('UnitSettings');
      await tap('Bitcoin');
      await tap('NavigationBack');
      await expect(unitRow).toHaveText('Bitcoin');
      await tap('NavigationClose');
      await expect(balance).toHaveText('0');

      // switch to classic denomination
      await tap('HeaderMenu');
      await sleep(500);
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('UnitSettings');
      await tap('DenominationClassic');
      await tap('NavigationBack');
      await expect(unitRow).toHaveText('Bitcoin');
      await tap('NavigationClose');
      //   https://github.com/synonymdev/bitkit-android/issues/342
      //   await expect(balance).toHaveText('0.00000000');
      await expect(balance).toHaveText('0');
    });

    it('Can switch transaction speed', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');

      // switch to Fast
      await tap('TransactionSpeedSettings');
      await tap('fast');
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText('Fast');

      // switch to Custom
      await tap('TransactionSpeedSettings');
      await tap('custom');
      (await elementByIdWithin('CustomFee', 'N1')).click();
      await tap('Continue');
      await tap('NavigationBack');
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText(
        'Custom'
      );

      // switch back to Normal
      await tap('TransactionSpeedSettings');
      await tap('normal');
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText(
        'Normal'
      );
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
      try {
        await elementById('ShowBalance').waitForDisplayed({ reverse: true });
      } catch {
        await dragOnElement('TotalBalance', 'right', 0.5);
      }
      await elementById('ShowBalance').waitForDisplayed({ reverse: true });

      await sleep(1000);
      // Swipe to hide balance
      try {
        await dragOnElement('TotalBalance', 'right', 0.5);
        await elementById('ShowBalance').waitForDisplayed();
      } catch {
        await dragOnElement('TotalBalance', 'right', 0.5);
      }
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
      await sleep(3000);
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
      await sleep(1000);
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
        const idxToClick = words_used.filter((x) => x === w).length;
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

  describe('Advanced', () => {
    // not available in ldk-node
    it.skip('Can switch address types', async () => {
      // wallet be in regtest mode by default
      // at first check if it is Native segwit by default
      const address = await getReceiveAddress();
      await swipeFullScreen('down');
      if (!address.startsWith('bcrt1')) {
        throw new Error(`Wrong default receiving address: ${address}`);
      }
      await sleep(1000);

      // switch to Legacy
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('AddressTypePreference');
      await tap('p2pkh');
      await sleep(1000); // We need a second after switching address types.
      await tap('NavigationClose');

      // check address on Receiving screen
      const addressNew = await getReceiveAddress();
      await swipeFullScreen('down');
      if (!addressNew.startsWith('m') && !addressNew.startsWith('n')) {
        throw new Error(`Wrong receiving address for Legacy: ${addressNew}`);
      }
      await sleep(1000);

      // switch back to Native segwit
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('AddressTypePreference');
      await tap('p2wpkh');
      await tap('NavigationClose');
      await sleep(1000);
    });

    it('Can open LN settings screens', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      // LDKDebug, CopyNodeId, RefreshLDK, RestartLDK and RebroadcastLDKTXS N/A in DevSettings
      //   for (let i = 1; i <= 5; i++) {
      //     await tap('DevOptions');
      //   }
      //   await tap('DevSettings');
      //   await tap('LDKDebug');
      //   await tap('CopyNodeId');
      //   await tap('RefreshLDK');
      //   await tap('RestartLDK');
      //   await tap('RebroadcastLDKTXS');
      //   await tap('NavigationBack');
      //   await tap('NavigationBack');
      await tap('AdvancedSettings');
      await tap('LightningNodeInfo');
      await elementById('LDKNodeID').waitForDisplayed();
      await tap('NavigationBack');
      await tap('NavigationBack');
      //   for (let i = 1; i <= 5; i++) {
      //     await tap('DevOptions');
      //   }
      await sleep(1000);
    });

    it('Can enter wrong Electrum server and get an error message', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('ElectrumConfig');

      // enter wrong electrum server address
      const host = 'google.com';
      const port = '31337';
      try {
        await typeText('HostInput', host);
        await expect(await elementById('HostInput')).toHaveText(host);
      } catch {
        await typeText('HostInput', host);
      }
      await sleep(1000);
      try {
        await typeText('PortInput', port);
        await expect(await elementById('PortInput')).toHaveText(port);
      } catch {
        await typeText('PortInput', port);
      }
      await sleep(1000);
      await tap('ElectrumStatus'); // close keyboard
      await tap('ConnectToHost');

      // disconnected warning should appear
      await elementById('Disconnected').waitForDisplayed();
      await sleep(1000);

      // scanner - check all possible connection formats
      // Umbrel format
      const umbrel1 = {
        url: `${electrumHost}:${electrumPort}:t`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TCP',
      };
      const umbrel2 = {
        url: `${electrumHost}:${electrumPort}:s`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TLS',
      };

      // should detect protocol for common ports
      const noProto1 = {
        url: `${electrumHost}:50001`,
        expectedHost: electrumHost,
        expectedPort: '50001',
        expectedProtocol: 'TCP',
      };
      const noProto2 = {
        url: `${electrumHost}:50002`,
        expectedHost: electrumHost,
        expectedPort: '50002',
        expectedProtocol: 'TLS',
      };

      // HTTP URL
      const http1 = {
        url: `http://${electrumHost}:${electrumPort}`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TCP',
      };
      const http2 = {
        url: `https://${electrumHost}:${electrumPort}`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TLS',
      };

      const conns = [umbrel1, umbrel2, noProto1, noProto2, http1, http2];
      let i = 0;
      for (const conn of conns) {
        await sleep(1000);
        await tap('NavigationAction');
        // on the first time we need to accept the notifications permission dialog to use camera
        if (i === 0) {
          await acceptAppNotificationAlert('permission_allow_foreground_only_button');
        }
        await tap('ScanPrompt');
        await typeText('QRInput', conn.url);
        await tap('DialogConfirm');
        await expect(await elementById('HostInput')).toHaveText(conn.expectedHost);
        expect(await elementById('PortInput')).toHaveText(conn.expectedPort);
        // await expectTextWithin('ElectrumProtocol', conn.expectedProtocol);
        i++;
      }

      // switch back to default
      await tap('ResetToDefault');
      await tap('ConnectToHost');
      await elementById('Connected').waitForDisplayed();
      await sleep(1000);
    });

    // https://github.com/synonymdev/bitkit-android/issues/337
    it.skip('Can connect to different Rapid Gossip Sync Server', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('RGSServer');
      await sleep(1000);

      // add slash at the end
      const rgsUrl = await (await elementById('RGSUrl')).getText();
      console.info({ rgsUrl });
      const newUrl = `${rgsUrl}/`;

      // url should be updated
      await typeText('RGSUrl', newUrl);
      await confirmInputOnKeyboard();
      await tap('ConnectToHost');
      await sleep(1000);
      const updatedUrl = await (await elementById('ConnectedUrl')).getText();
      await expect(updatedUrl).toBe(newUrl);

      // switch back to default
      await tap('ResetToDefault');
      await tap('ConnectToHost');

      const resetUrl = await (await elementById('ConnectedUrl')).getText();
      await expect(resetUrl).toBe(rgsUrl);
    });

    it('Can reset suggestions', async () => {
      try {
        await elementById('Suggestions').waitForDisplayed();
      } catch {
        await tap('WalletOnboardingClose');
        await elementById('Suggestions').waitForDisplayed();
      }

      // hide lightningTodo suggestion card
      await (await elementByIdWithin('Suggestion-lightning', 'SuggestionDismiss')).click();
      await elementById('Suggestion-lightning').waitForDisplayed({ reverse: true });

      // reset suggestions
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('ResetSuggestions');
      await tap('DialogConfirm');

      // lightning should be visible again
      await sleep(1000);
      await elementById('Suggestion-lightning').waitForDisplayed();
    });
  });

  describe('Dev Settings', () => {
    it('Can show Dev Settings', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await elementById('DevSettings').waitForDisplayed({ reverse: true });

      for (let i = 1; i <= 5; i++) {
        await tap('DevOptions');
      }
      await tap('DevSettings');
      await sleep(1000);
      await tap('NavigationBack');

      for (let i = 1; i <= 5; i++) {
        await tap('DevOptions');
      }
      await elementById('DevSettings').waitForDisplayed({ reverse: true });
    });
  });

  describe('Support', () => {
    it('Can see app status', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('Support');
      await tap('AppStatus');

      await elementById('Status-internet').waitForDisplayed();
      await elementById('Status-electrum').waitForDisplayed();
      await elementById('Status-lightning_node').waitForDisplayed();
      await elementById('Status-lightning_connection').waitForDisplayed();
      await elementById('Status-backup').waitForDisplayed();

      await tap('NavigationClose');
    });
  });
});
