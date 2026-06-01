import { elementById, elementByText, sleep, swipeFullScreen, tap } from './actions';

export type WidgetId =
  | 'price'
  | 'blocks'
  | 'news'
  | 'facts'
  | 'weather'
  | 'suggestions'
  | 'calculator';

const DEFAULT_WIDGETS: WidgetId[] = ['price', 'blocks', 'news', 'facts', 'weather', 'suggestions', 'calculator'];

type WidgetMetadata = {
  listItemId: string;
  actionName: string;
  homeId?: () => string | undefined;
  hasSettings: () => boolean;
};

const WIDGETS: Record<WidgetId, WidgetMetadata> = {
  price: {
    listItemId: 'WidgetListItem-price',
    actionName: 'Bitcoin Price',
    homeId: () => 'PriceWidget',
    hasSettings: () => true,
  },
  blocks: {
    listItemId: 'WidgetListItem-blocks',
    actionName: 'Bitcoin Blocks',
    homeId: () => 'BlocksWidget',
    hasSettings: () => true,
  },
  news: {
    listItemId: 'WidgetListItem-news',
    actionName: 'Bitcoin Headlines',
    homeId: () => 'NewsWidget',
    hasSettings: () => true,
  },
  facts: {
    listItemId: 'WidgetListItem-facts',
    actionName: 'Bitcoin Facts',
    homeId: () => (driver.isIOS ? 'FactsWidget' : undefined),
    hasSettings: () => false,
  },
  weather: {
    listItemId: 'WidgetListItem-weather',
    actionName: 'Bitcoin Weather',
    homeId: () => (driver.isIOS ? 'WeatherWidget' : undefined),
    hasSettings: () => true,
  },
  suggestions: {
    listItemId: 'WidgetListItem-suggestions',
    actionName: 'Bitkit Suggestions',
    homeId: () => 'SuggestionsWidget',
    hasSettings: () => false,
  },
  calculator: {
    listItemId: 'WidgetListItem-calculator',
    actionName: 'Bitcoin Calculator',
    homeId: () => 'CalculatorWidget',
    hasSettings: () => false,
  },
};

function widgetMetadata(widget: WidgetId): WidgetMetadata {
  return WIDGETS[widget];
}

function widgetActionId(widget: WidgetId, action: 'Delete' | 'Edit' | 'Drag') {
  return `${widgetMetadata(widget).actionName}_WidgetAction${action}`;
}

async function tapIfDisplayed(testId: string, timeout = 2_000): Promise<boolean> {
  const element = await elementById(testId);
  try {
    await element.waitForDisplayed({ timeout });
    await element.click();
    await sleep(300);
    return true;
  } catch {
    return false;
  }
}

async function tapWidgetListItem(widget: WidgetId) {
  const { listItemId } = widgetMetadata(widget);
  if (await tapIfDisplayed(listItemId)) {
    return;
  }
  await swipeFullScreen('up');
  await tap(listItemId);
}

export async function scrollHomeToWidgets() {
  await swipeFullScreen('up');
  await swipeFullScreen('up');
  await sleep(500);
}

export async function openWidgetsFeed() {
  await scrollHomeToWidgets();
  await tap('WidgetsAdd');
  await tapIfDisplayed('WidgetsOnboardingAddWidget');
}

export async function openWidgetPreview(widget: WidgetId) {
  await openWidgetsFeed();
  await sleep(500);
  await tapWidgetListItem(widget);
}

export async function addWidget(widget: WidgetId) {
  await openWidgetPreview(widget);
  await tap('WidgetSave');
  await elementById('WidgetsAdd').waitForDisplayed({ timeout: 15_000 });
}

export async function openWidgetSettings(widget: WidgetId) {
  if (!widgetMetadata(widget).hasSettings()) {
    throw new Error(`Widget '${widget}' does not have editable settings on this platform`);
  }
  await tap('WidgetEdit');
  await elementById('WidgetEditPreview').waitForDisplayed();
}

export async function openSavedWidgetPreview(widget: WidgetId) {
  await scrollHomeToWidgets();
  await tap('WidgetsEdit');
  await tap(widgetActionId(widget, 'Edit'));
  await elementById('WidgetSave').waitForDisplayed();
}

export async function expectWidgetPresent(
  widget: WidgetId,
  present = true,
  { timeout = 8_000 }: { timeout?: number } = {}
) {
  const homeId = widgetMetadata(widget).homeId?.();
  if (!homeId) {
    await expectWidgetSavedInEditList(widget, present, { timeout });
    return;
  }
  await elementById(homeId).waitForDisplayed({
    reverse: !present,
    timeout,
    interval: 250,
  });
}

export async function expectWidgetSavedInEditList(
  widget: WidgetId,
  present = true,
  { timeout = 8_000 }: { timeout?: number } = {}
) {
  await scrollHomeToWidgets();
  await tap('WidgetsEdit');
  await elementById(widgetActionId(widget, 'Delete')).waitForDisplayed({
    reverse: !present,
    timeout,
    interval: 250,
  });
  await tap('WidgetsEdit');
}

export async function deleteWidget(widget: WidgetId) {
  await scrollHomeToWidgets();
  await tap('WidgetsEdit');
  await tap(widgetActionId(widget, 'Delete'));
  await elementByText('Yes, Delete').waitForDisplayed();
  await elementByText('Yes, Delete').click();
  await elementById(widgetActionId(widget, 'Delete')).waitForDisplayed({
    reverse: true,
    timeout: 8_000,
    interval: 250,
  });
  await tap('WidgetsEdit');
  await sleep(500);
}

export async function deleteWidgets(widgets: WidgetId[]) {
  await scrollHomeToWidgets();
  await tap('WidgetsEdit');
  for (const widget of widgets) {
    if (!(await tapIfDisplayed(widgetActionId(widget, 'Delete')))) {
      continue;
    }
    await elementByText('Yes, Delete').waitForDisplayed();
    await elementByText('Yes, Delete').click();
    await elementById(widgetActionId(widget, 'Delete')).waitForDisplayed({
      reverse: true,
      timeout: 8_000,
      interval: 250,
    });
    await sleep(500);
  }
  await tap('WidgetsEdit');
}

export async function deleteAllDefaultWidgets() {
  await deleteWidgets(DEFAULT_WIDGETS);
  for (const widget of DEFAULT_WIDGETS) {
    await expectWidgetPresent(widget, false);
  }
}
