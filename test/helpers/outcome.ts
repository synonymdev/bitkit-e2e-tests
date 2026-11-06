import fs from 'node:fs';
import path from 'node:path';
import {
  confirmInputOnKeyboard,
  elementById,
  elementByText,
  getAccessibleText,
  swipeFullScreen,
} from './actions';

export type VisibleTarget = { id: string } | { text: string };
export type Condition =
  | { visible: VisibleTarget }
  | { hidden: VisibleTarget }
  | { enabled: { id: string; value: boolean } }
  | { inputValue: { id: string; value: string } }
  | { textWithin: { id: string; text: string } }
  | { keyboardShown: boolean };
export type Outcome = { anyVisible?: VisibleTarget[]; all?: Condition[]; timeout?: number };

function element(target: VisibleTarget) {
  return 'id' in target ? elementById(target.id) : elementByText(target.text, 'exact');
}

function label(target: VisibleTarget) {
  return 'id' in target ? `id:${target.id}` : `text:${target.text}`;
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`;
}

async function observe(condition: Condition): Promise<{ actual: unknown; passed: boolean }> {
  if ('enabled' in condition) {
    const current = elementById(condition.enabled.id);
    if (!(await current.isDisplayed())) return { actual: 'not visible', passed: false };
    const actual = await current.isEnabled();
    return { actual, passed: actual === condition.enabled.value };
  }
  if ('keyboardShown' in condition) {
    const actual = await driver.isKeyboardShown();
    return { actual, passed: actual === condition.keyboardShown };
  }
  if ('visible' in condition || 'hidden' in condition) {
    const actual = await element(
      'visible' in condition ? condition.visible : condition.hidden
    ).isDisplayed();
    return { actual, passed: 'visible' in condition ? actual : !actual };
  }
  const id = 'inputValue' in condition ? condition.inputValue.id : condition.textWithin.id;
  const parent = elementById(id);
  if (!(await parent.isDisplayed())) return { actual: 'not visible', passed: false };
  if ('inputValue' in condition) {
    const actual = await getAccessibleText(parent);
    return { actual, passed: actual === condition.inputValue.value };
  }
  const text = condition.textWithin.text;
  const actual = await getAccessibleText(parent);
  if (actual === text) return { actual, passed: true };
  const literal = xpathLiteral(text);
  const child = driver.isAndroid
    ? parent.$(`.//*[@text=${literal}]`)
    : parent.$(`.//*[@label=${literal} or @value=${literal}]`);
  const found = await child.isDisplayed();
  return { actual: found ? text : actual, passed: found };
}

/** Execute once, then poll only observations. Never retry an action with side effects. */
async function actAndExpect(
  name: string,
  action: () => Promise<void>,
  outcome: Outcome,
  stableTargets: VisibleTarget[] = []
) {
  if (!outcome.anyVisible?.length && !outcome.all?.length) {
    throw new Error('An outcome must name at least one observation');
  }
  const started = Date.now();
  const record: Record<string, unknown> = {
    journey: process.env.OUTCOME_PILOT_CURRENT_JOURNEY,
    platform: process.env.PLATFORM,
    mode: process.env.OUTCOME_PILOT_MODE,
    action: name,
    startedAt: new Date(started).toISOString(),
    expected: { anyVisible: outcome.anyVisible?.map(label), all: outcome.all },
  };
  let observed: Record<string, unknown> = {};
  let previousBounds = '';
  console.info(`[outcome:start] ${JSON.stringify(record)}`);
  try {
    await action();
    await browser.waitUntil(
      async () => {
        observed = {};
        // Re-resolve targets on every poll; navigation can replace the element tree.
        let anyPassed = !outcome.anyVisible?.length;
        for (const target of outcome.anyVisible ?? []) {
          observed[label(target)] = false;
          observed[label(target)] = await element(target).isDisplayed();
          if (observed[label(target)]) anyPassed = true;
        }
        let allPassed = true;
        for (const condition of outcome.all ?? []) {
          const result = await observe(condition);
          observed[JSON.stringify(condition)] = result.actual;
          if (!result.passed) allPassed = false;
        }
        if (!anyPassed || !allPassed) {
          previousBounds = '';
          return false;
        }
        if (stableTargets.length) {
          // A destination can be visible while its page is still sliding into place.
          // Require two matching geometry observations before the next gesture.
          const bounds = [];
          for (const target of stableTargets) {
            const current = element(target);
            if (await current.isDisplayed()) {
              bounds.push({
                target,
                location: await current.getLocation(),
                size: await current.getSize(),
              });
            }
          }
          observed.destinationBounds = bounds;
          const snapshot = JSON.stringify(bounds);
          const stable = bounds.length > 0 && snapshot === previousBounds;
          previousBounds = snapshot;
          return stable;
        }
        return true;
      },
      {
        timeout: outcome.timeout ?? 30_000,
        interval: 200,
        timeoutMsg: `${name}: expected ${JSON.stringify(record.expected)}`,
      }
    );
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    // Evidence is best effort and must not replace the original failure.
    try {
      const directory = process.env.OUTCOME_PILOT_ARTIFACTS;
      if (directory) {
        fs.mkdirSync(directory, { recursive: true });
        const screenshot = path.join(directory, `step-${started}.png`);
        await browser.saveScreenshot(screenshot);
        record.screenshot = screenshot;
      }
    } catch (diagnosticError) {
      record.diagnosticError = String(diagnosticError);
    }
    throw new Error(
      `${name}: ${String(record.error)}; last visibility ${JSON.stringify(observed)}`,
      { cause: error }
    );
  } finally {
    record.elapsedMs = Date.now() - started;
    record.observed = observed;
    console.info(`[outcome] ${JSON.stringify(record)}`);
    const directory = process.env.OUTCOME_PILOT_ARTIFACTS;
    if (directory) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFileSync(path.join(directory, 'steps.jsonl'), `${JSON.stringify(record)}\n`);
      } catch (diagnosticError) {
        console.warn('Could not save outcome trace', diagnosticError);
      }
    }
  }
}

export async function tapAndExpect(target: VisibleTarget, outcome: Outcome) {
  await actAndExpect(
    `tap ${label(target)}`,
    async () => {
      const current = element(target);
      await current.waitForDisplayed({ timeout: outcome.timeout ?? 30_000 });
      await current.click();
    },
    outcome
  );
}

/** Observe a state without retaining an element handle across polls. */
export async function waitAndExpect(outcome: Outcome) {
  await actAndExpect('wait for outcome', async () => {}, outcome);
}

export async function swipeAndExpect(
  direction: 'left' | 'right' | 'up' | 'down',
  outcome: Outcome
) {
  const anchors =
    outcome.anyVisible ??
    outcome.all?.flatMap((condition) => ('visible' in condition ? [condition.visible] : [])) ??
    [];
  if (!anchors.length) throw new Error('A swipe outcome must identify its visible destination');
  await actAndExpect(
    `swipe ${direction}`,
    () => swipeFullScreen(direction, { settleMs: 0 }),
    outcome,
    anchors
  );
}

export async function typeAndExpect(id: string, text: string, outcome: Outcome = {}) {
  await actAndExpect(
    `type id:${id}`,
    async () => {
      const current = elementById(id);
      await current.waitForDisplayed();
      await current.clearValue();
      await current.setValue(text);
    },
    { ...outcome, all: [{ inputValue: { id, value: text } }, ...(outcome.all ?? [])] }
  );
}

export async function dismissKeyboardAndExpect() {
  await actAndExpect('confirm keyboard input', confirmInputOnKeyboard, {
    all: [{ keyboardShown: false }],
  });
}
