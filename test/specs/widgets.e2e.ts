import {
  elementById,
  elementByText,
  sleep,
  tap,
  swipeFullScreen,
  completeOnboarding,
  deleteAllDefaultWidgets,
  doNavigationClose,
} from '../helpers/actions';
import { openSettings } from '../helpers/navigation';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';

describe('@widgets - Widgets', () => {
  before(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@widgets_1 - Can add/edit/remove a widget', async () => {
    // delete all default widgets
    await deleteAllDefaultWidgets();

    // Add a widget
    await tap('WidgetsAdd');
    // First-time widgets onboarding
    await tap('WidgetsOnboarding-button');
    // Pick the Price widget
    await tap('WidgetListItem-price');
    // Expect the “Default” preset is selected
    await elementByText('Default').waitForDisplayed();
    // Open edit options
    await tap('WidgetEdit');
    await elementById('WidgetEditPreview').waitForDisplayed();
    // Select BTC/EUR row
    await tap('WidgetEditField-BTC/EUR');
    await sleep(1000); // Wait for the UI to settle

    // Scroll the edit view
    await swipeFullScreen('up');
    await swipeFullScreen('up');
    await sleep(500);

    // Set timeframe and show source
    await tap('WidgetEditField-1W');
    await tap('WidgetEditField-showSource');
    await sleep(1000); // Wait for the UI to settle

    // Preview and save
    await tap('WidgetEditPreview');
    await sleep(500);
    await tap('WidgetSave');
    // sometimes flaky on GH actions, try again
    try {
      await elementById('PriceWidget').waitForDisplayed();
    } catch {
      await tap('WidgetSave');
    }
    await elementById('PriceWidget').waitForDisplayed();

    // Back on Home: scroll a bit to ensure widget is in view
    await elementById('PriceWidget').waitForDisplayed();
    await swipeFullScreen('up');

    // Assertions
    await elementById('PriceWidget').waitForDisplayed();
    await elementById('PriceWidgetRow-BTC/EUR').waitForDisplayed();
    await elementById('PriceWidgetSource').waitForDisplayed();

    // --- Edit the Price widget back to defaults ---
    await tap('WidgetsEdit');

    // Open edit within the Price widget specifically
    await tap('Bitcoin Price_WidgetActionEdit');

    // "Custom" should be visible when editing a customized widget
    await elementByText('Custom').waitForDisplayed();

    // reset options to defaults and save
    await tap('WidgetEdit');
    await tap('WidgetEditReset');
    await elementById('WidgetEditPreview').waitForDisplayed();
    await sleep(1000); // Wait for the UI to settle
    await tap('WidgetEditPreview');
    await elementById('WidgetSave').waitForDisplayed();
    await sleep(1000); // Wait for the UI to settle
    await tap('WidgetSave');
    await sleep(1000); // Wait for the UI to settle

    // After saving, widget should remain visible…
    await elementById('PriceWidget').waitForDisplayed();

    // …but the BTC/EUR row and Source label should be gone
    await elementById('PriceWidgetRow-BTC/EUR').waitForDisplayed({
      reverse: true,
      timeout: 8000,
      interval: 250,
    });
    await elementById('PriceWidgetSource').waitForDisplayed({
      reverse: true,
      timeout: 8000,
      interval: 250,
    });

    // Delete Price Widget
    await tap('WidgetsEdit');
    await tap('Bitcoin Price_WidgetActionDelete');
    await elementByText('Yes, Delete').waitForDisplayed();
    await elementByText('Yes, Delete').click();
    await elementById('WidgetsAdd').waitForDisplayed();
  });

  ciIt('@widgets_2 - Widget settings: reset, show/hide, titles', async () => {
    await deleteAllDefaultWidgets();

    // Reset widgets via Widget Settings
    await openSettings();
    await tap('WidgetsSettings');
    await tap('ResetWidgets');
    await tap('DialogConfirm');
    await sleep(1000);

    // Verify widgets are restored
    await swipeFullScreen('up');
    await elementById('PriceWidget').waitForDisplayed();
    await elementById('SuggestionsWidget').waitForDisplayed();
    await elementById('BlocksWidget').waitForDisplayed();

    // Toggle off "Show Widgets"
    await openSettings();
    await tap('WidgetsSettings');
    await tap('ShowWidgets');
    await tap('NavigationBack');
    await doNavigationClose();

    // Verify widgets are hidden on home
    await swipeFullScreen('up');
    await elementById('PriceWidget').waitForDisplayed({
      reverse: true,
      timeout: 5000,
    });
    await elementById('SuggestionsWidget').waitForDisplayed({
      reverse: true,
      timeout: 5000,
    });
    await elementById('BlocksWidget').waitForDisplayed({
      reverse: true,
      timeout: 5000,
    });

    // Toggle on "Show Widgets" + enable "Show Widget Titles"
    await openSettings();
    await tap('WidgetsSettings');
    await tap('ShowWidgets');
    await tap('ShowWidgetTitles');
    await tap('NavigationBack');
    await doNavigationClose();

    // Verify widgets visible with titles
    await swipeFullScreen('up');
    await elementById('PriceWidget').waitForDisplayed();
    await elementById('SuggestionsWidget').waitForDisplayed();
    await elementById('BlocksWidget').waitForDisplayed();
    await elementByText('Bitcoin Price').waitForDisplayed();
    await elementByText('Bitcoin Blocks').waitForDisplayed();

    // Cleanup: disable widget titles to restore defaults
    await openSettings();
    await tap('WidgetsSettings');
    await tap('ShowWidgetTitles');
    await tap('NavigationBack');
    await doNavigationClose();
  });
});
