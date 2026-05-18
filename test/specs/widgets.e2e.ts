import {
  elementById,
  elementByText,
  sleep,
  tap,
  swipeFullScreen,
  completeOnboarding,
  doNavigationClose,
} from '../helpers/actions';
import { openSettings } from '../helpers/navigation';
import { reinstallApp } from '../helpers/setup';
import { ciIt } from '../helpers/suite';
import {
  addWidget,
  deleteAllDefaultWidgets,
  deleteWidget,
  expectWidgetPresent,
  expectWidgetSavedInEditList,
  openSavedWidgetPreview,
  openWidgetPreview,
  openWidgetSettings,
  scrollHomeToWidgets,
  type WidgetId,
} from '../helpers/widgets';

describe('@widgets - Widgets', () => {
  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
  });

  ciIt('@widgets_1 - Can add/edit/remove the price widget', async () => {
    await deleteAllDefaultWidgets();

    await openWidgetPreview('price');
    await elementByText('Default').waitForDisplayed();
    await openWidgetSettings('price');

    await tap('BTC/EUR_setting_row');
    await sleep(1000);

    await swipeFullScreen('up');
    await swipeFullScreen('up');
    await sleep(500);

    await tap('1W_setting_row');
    await sleep(1000);

    await tap('WidgetEditPreview');
    await sleep(500);
    await tap('WidgetSave');
    try {
      await expectWidgetPresent('price');
    } catch {
      await tap('WidgetSave');
    }
    await expectWidgetPresent('price');

    await scrollHomeToWidgets();
    await elementById('PriceWidgetRow-BTC/EUR').waitForDisplayed();

    await openSavedWidgetPreview('price');
    await elementByText('Custom').waitForDisplayed();
    await openWidgetSettings('price');
    await tap('WidgetEditReset');
    await sleep(1000);
    await tap('WidgetEditPreview');
    await elementById('WidgetSave').waitForDisplayed();
    await sleep(1000);
    await tap('WidgetSave');
    await sleep(1000);

    await expectWidgetPresent('price');
    await elementById('PriceWidgetRow-BTC/EUR').waitForDisplayed({
      reverse: true,
      timeout: 8000,
      interval: 250,
    });

    await deleteWidget('price');
  });

  ciIt('@widgets_2 - Can add/remove redesigned content widgets', async () => {
    const contentWidgets: WidgetId[] = ['blocks', 'news', 'facts', 'weather'];

    await deleteAllDefaultWidgets();

    for (const widget of contentWidgets) {
      await addWidget(widget);
      await expectWidgetSavedInEditList(widget);
      await deleteWidget(widget);
    }
  });

  ciIt('@widgets_3 - Widget settings: reset, show/hide, titles', async () => {
    await deleteAllDefaultWidgets();

    await openSettings();
    await tap('WidgetsSettings');
    await tap('ResetWidgets');
    await tap('DialogConfirm');
    await sleep(1000);

    await scrollHomeToWidgets();
    await expectWidgetPresent('price');
    await expectWidgetPresent('suggestions');
    await expectWidgetPresent('blocks');

    await openSettings();
    await tap('WidgetsSettings');
    await tap('ShowWidgets');
    await tap('NavigationBack');
    await doNavigationClose();

    await scrollHomeToWidgets();
    await expectWidgetPresent('price', false, { timeout: 5000 });
    await expectWidgetPresent('suggestions', false, { timeout: 5000 });
    await expectWidgetPresent('blocks', false, { timeout: 5000 });

    await openSettings();
    await tap('WidgetsSettings');
    await tap('ShowWidgets');
    await tap('ShowWidgetTitles');
    await tap('NavigationBack');
    await doNavigationClose();

    await scrollHomeToWidgets();
    await expectWidgetPresent('price');
    await expectWidgetPresent('suggestions');
    await expectWidgetPresent('blocks');
    if (driver.isAndroid) {
      await elementByText('Bitcoin Price').waitForDisplayed({
        reverse: true,
        timeout: 5000,
      });
      await elementByText('Bitcoin Blocks').waitForDisplayed({
        reverse: true,
        timeout: 5000,
      });
    } else {
      await elementByText('Bitcoin Price').waitForDisplayed();
      await elementByText('Bitcoin Blocks').waitForDisplayed();
    }
  });
});
