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
  multiTap,
  getAccessibleText,
  doNavigationClose,
  waitForToast,
  ToastId,
} from '../helpers/actions';
import { electrumHost, electrumPort } from '../helpers/constants';
import { launchFreshApp, reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@settings - Settings', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  beforeEach(async () => {
    await launchFreshApp();
  });

  describe('General', () => {
    ciIt('@settings_01 - Can switch local currency', async () => {
      // switch to local currency
      const fiatSymbol = await elementByIdWithin('TotalBalance-primary', 'MoneyFiatSymbol');
      try {
        await tap('TotalBalance');
        await expect(fiatSymbol).toHaveText('$');
      } catch {
        await tap('TotalBalance');
      }
      await expect(fiatSymbol).toHaveText('$');
      if (driver.isIOS) {
        await waitForToast('BalanceUnitSwitchedToast');
      }

      // - change settings (currency to EUR) //
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      const eur_opt = await elementByText('EUR (€)');
      await eur_opt.waitForDisplayed();
      await eur_opt.click();
      await doNavigationClose();

      await expect(fiatSymbol).toHaveText('€');

      // switch back to sats
      await tap('TotalBalance');
      await sleep(500);
      await expect(fiatSymbol).toHaveText('₿');

      // switch to USD
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await tap('CurrenciesSettings');
      const usd_opt = await elementByText('USD ($)');
      await usd_opt.waitForDisplayed();
      await usd_opt.click();
      await doNavigationClose();
    });

    ciIt('@settings_02 - Can switch Bitcoin Unit', async () => {
      const fiatSymbol = await elementByIdWithin('TotalBalance-primary', 'MoneyFiatSymbol');
      const balance = await elementByIdWithin('TotalBalance-primary', 'MoneyText');

      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');

      // switch to USD
      await tap('UnitSettings');
      await tap('USD');
      await tap('NavigationBack');
      const unitRow = await elementByIdWithin('UnitSettings', 'Value');
      await expect(unitRow).toHaveText('USD');
      await doNavigationClose();
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
      await doNavigationClose();
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
      await doNavigationClose();
      await expect(balance).toHaveText('0.00000000');
    });

    ciIt('@settings_03 - Can switch transaction speed', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');

      // switch to Fast
      await tap('TransactionSpeedSettings');
      await tap('fast');
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText(
        /.*Fast/
      );

      // switch to Custom
      await tap('TransactionSpeedSettings');
      await tap('custom');
      await tap('N1');
      await tap('Continue');
      await tap('NavigationBack');
      await sleep(1000);
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText(
        /.*Custom/
      );

      // switch back to Normal
      await tap('TransactionSpeedSettings');
      await tap('normal');
      await expect(await elementByIdWithin('TransactionSpeedSettings', 'Value')).toHaveText(
        /.*Normal/
      );
    });

    ciIt('@settings_04 - Can remove last used tags', async () => {
      // no tags, menu entry should be hidden
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('GeneralSettings');
      await elementById('TagsSettings').waitForDisplayed({ reverse: true });
      await doNavigationClose();

      // open receive tags, add a tag
      const tag = 'test123';
      await tap('Receive');
      await sleep(700);
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
      await doNavigationClose();

      // open receive tags, check tags are gone
      await tap('Receive');
      await sleep(700);
      await tap('SpecifyInvoiceButton');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });
      await tap('TagsAdd');
      (await elementByText(tag)).waitForDisplayed({ reverse: true });
    });

    ciIt('@settings_05 - Can show About screen', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('About');
      await elementById('AboutLogo').waitForDisplayed();
    });
  });

  describe('Security and Privacy', () => {
    ciIt('@settings_06 - Can swipe to hide balance', async () => {
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
      if (driver.isIOS) {
        await waitForToast('BalanceHiddenToast', { waitToDisappear: false, dismiss: true });
      }

      // Disable 'swipe to hide balance'
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('SecuritySettings');
      await tap('SwipeBalanceToHide');
      await doNavigationClose();

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
    ciIt('@settings_07 - Can show backup and validate it', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('BackupSettings');
      await sleep(1000);
      await tap('ResetAndRestore');
      await tap('NavigationBack');
      await sleep(1000);
      await tap('BackupWallet');
      await sleep(1000); // animation

      // get the seed from SeedContainer
      const seedElement = await elementById('SeedContainer');
      const seed = await getAccessibleText(seedElement);
      console.info({ seed });
      if (!seed) throw new Error('Could not read seed from "SeedContainer"');

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
    ciIt.skip('@settings_08 - Can switch address types', async () => {
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
      await doNavigationClose();

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
      await doNavigationClose();
      await sleep(1000);
    });

    ciIt('@settings_09 - Can open LN settings screens', async () => {
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

    ciIt('@settings_10 - Can enter wrong Electrum server and get an error message', async () => {
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
      await waitForToast('ElectrumErrorToast');

      // scanner - check all possible connection formats
      // Umbrel format
      const umbrel1 = {
        url: `${electrumHost}:${electrumPort}:t`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TCP',
        expectedToastMessage: 'ElectrumUpdatedToast',
      };
      const umbrel2 = {
        url: `${electrumHost}:${electrumPort}:s`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TLS',
        expectedToastMessage: driver.isAndroid ? 'ElectrumErrorToast' : 'ElectrumUpdatedToast',
      };

      // HTTP URL
      const http1 = {
        url: `http://${electrumHost}:${electrumPort}`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TCP',
        expectedToastMessage: 'ElectrumUpdatedToast',
      };
      const http2 = {
        url: `https://${electrumHost}:${electrumPort}`,
        expectedHost: electrumHost,
        expectedPort: electrumPort.toString(),
        expectedProtocol: 'TLS',
        expectedToastMessage: driver.isAndroid ? 'ElectrumErrorToast' : 'ElectrumUpdatedToast',
      };

      const conns = [umbrel1, umbrel2, http1, http2];
      let i = 0;
      for (const conn of conns) {
        console.info(`Testing Electrum connection format #${i + 1}: ${conn.url}`);
        await sleep(1000);
        await tap('NavigationAction');
        // on the first time we need to accept the notifications permission dialog to use camera
        if (i === 0) {
          await acceptAppNotificationAlert('permission_allow_foreground_only_button');
        }
        await tap('ScanPrompt');
        await typeText('QRInput', conn.url);
        await tap('DialogConfirm');
        await waitForToast(conn.expectedToastMessage as ToastId);
        await expect(await elementById('HostInput')).toHaveText(conn.expectedHost);
        expect(await elementById('PortInput')).toHaveText(conn.expectedPort);
        // await expectTextWithin('ElectrumProtocol', conn.expectedProtocol);
        i++;
      }

      // switch back to default
      await elementById('ResetToDefault').waitForEnabled();
      await tap('ResetToDefault');
      await tap('ConnectToHost');
      if (driver.isIOS) {
        await waitForToast('ElectrumUpdatedToast', { waitToDisappear: false });
      }
      await elementById('Connected').waitForDisplayed();
      await sleep(1000);
    });

    ciIt('@settings_11 - Can connect to different Rapid Gossip Sync Server', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('AdvancedSettings');
      await tap('RGSServer');
      await sleep(1000);

      // add slash at the end
      const rgsUrl = await (await elementById('ConnectedUrl')).getText();
      console.info({ rgsUrl });
      const newUrl = `${rgsUrl}/`;

      // url should be updated
      await typeText('RGSUrl', newUrl);
      await confirmInputOnKeyboard();
      await tap('ConnectToHost');
      await waitForToast('RgsUpdatedToast');
      const updatedUrl = await (await elementById('ConnectedUrl')).getText();
      await expect(updatedUrl).toBe(newUrl);

      // switch back to default
      await tap('ResetToDefault');
      await tap('ConnectToHost');
      await waitForToast('RgsUpdatedToast', { waitToDisappear: false });

      const resetUrl = await (await elementById('ConnectedUrl')).getText();
      await expect(resetUrl).toBe(rgsUrl);
    });

    ciIt('@settings_12 - Can reset suggestions', async () => {
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
    ciIt('@settings_13 - Can show/hide Dev Settings', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await elementById('DevSettings').waitForDisplayed();
      await tap('DevSettings');
      await sleep(1000);
      await tap('NavigationBack');

      await multiTap('DevOptions', 5);
      await elementById('DevSettings').waitForDisplayed({ reverse: true });

      await multiTap('DevOptions', 5);
      await elementById('DevSettings').waitForDisplayed();
    });
  });

  describe('Support', () => {
    ciIt('@settings_14 - Can see app status', async () => {
      await tap('HeaderMenu');
      await tap('DrawerSettings');
      await tap('Support');
      await tap('AppStatus');

      await elementById('Status-internet').waitForDisplayed();
      await elementById('Status-electrum').waitForDisplayed();
      await elementById('Status-lightning_node').waitForDisplayed();
      await elementById('Status-lightning_connection').waitForDisplayed();
      await elementById('Status-backup').waitForDisplayed();

      await doNavigationClose();
    });
  });
});
