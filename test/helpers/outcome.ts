import fs from 'node:fs';
import path from 'node:path';
import {
  confirmInputOnKeyboard,
  elementById,
  elementByText,
  getAccessibleText,
  swipeFullScreen,
  withMoveToSparkIntroRecovery,
} from './actions';

export type VisibleTarget = { id: string } | { text: string };
export type Condition =
  | { visible: VisibleTarget }
  | { hidden: VisibleTarget }
  | { enabled: { id: string; value: boolean } }
  | { inputValue: { id: string; value: string } }
  | { textWithin: { id: string; text: string; strategy?: 'exact' | 'contains' } }
  | { keyboardShown: boolean };
export type Outcome = {
  anyVisible?: VisibleTarget[];
  all?: Condition[];
  /** Must be absent before the action, then observed at least once afterwards. */
  appeared?: VisibleTarget[];
  timeout?: number;
};

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
  const contains = condition.textWithin.strategy === 'contains';
  if (contains ? actual.includes(text) : actual === text) return { actual, passed: true };
  const literal = xpathLiteral(text);
  const child = driver.isAndroid
    ? parent.$(contains ? `.//*[contains(@text,${literal})]` : `.//*[@text=${literal}]`)
    : parent.$(
        contains
          ? `.//*[contains(@label,${literal}) or contains(@value,${literal})]`
          : `.//*[@label=${literal} or @value=${literal}]`
      );
  const found = await child.isDisplayed();
  return { actual: found ? text : actual, passed: found };
}

async function withObservationIdleTimeout(
  previous: number | undefined,
  observation: () => Promise<unknown>,
  record: Record<string, unknown>
) {
  if (previous === undefined) {
    await observation();
    return;
  }
  const settings = { before: previous, during: 0, restored: false };
  record.observationIdleTimeout = settings;
  let observationFailed = false;
  let observationError: unknown;
  let restoreFailed = false;
  let restoreError: unknown;
  try {
    // UiAutomator's idle wait can outlive a short toast before lookup starts.
    // The action has already completed under the original setting.
    await driver.updateSettings({ waitForIdleTimeout: 0 });
    await observation();
  } catch (error) {
    observationFailed = true;
    observationError = error;
  } finally {
    try {
      await driver.updateSettings({ waitForIdleTimeout: previous });
      settings.restored = true;
    } catch (error) {
      record.settingsRestoreError = String(error);
      restoreFailed = true;
      restoreError = error;
    }
  }
  if (observationFailed) throw observationError;
  if (restoreFailed) throw restoreError;
}

/** Execute once, then poll only observations. Never retry an action with side effects. */
export async function actAndExpect(
  name: string,
  action: () => Promise<void>,
  outcome: Outcome,
  stableTargets: VisibleTarget[] = []
) {
  if (!outcome.anyVisible?.length && !outcome.all?.length && !outcome.appeared?.length) {
    throw new Error('An outcome must name at least one observation');
  }
  const started = Date.now();
  const record: Record<string, unknown> = {
    journey: process.env.OUTCOME_PILOT_CURRENT_JOURNEY,
    platform: process.env.PLATFORM,
    mode: process.env.OUTCOME_PILOT_MODE,
    action: name,
    startedAt: new Date(started).toISOString(),
    expected: {
      anyVisible: outcome.anyVisible?.map(label),
      all: outcome.all,
      appeared: outcome.appeared?.map(label),
    },
  };
  let observed: Record<string, unknown> = {};
  const appeared = new Set<string>();
  let previousBounds = '';
  console.info(`[outcome:start] ${JSON.stringify(record)}`);
  try {
    for (const target of outcome.appeared ?? []) {
      if (await element(target).isDisplayed()) {
        throw new Error(`Transient target ${label(target)} was already visible before action`);
      }
    }
    let previousIdle: number | undefined;
    if (driver.isAndroid && outcome.appeared?.length) {
      const previous = (await driver.getSettings()).waitForIdleTimeout;
      if (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0) {
        throw new Error('Cannot observe transient feedback without a restorable idle timeout');
      }
      previousIdle = previous;
    }
    await action();
    await withObservationIdleTimeout(
      previousIdle,
      () =>
        browser.waitUntil(
          async () => {
            const sample: Record<string, unknown> = {};
            // Observe short-lived feedback first and retain that evidence even if it
            // expires while persistent input/button state is being read.
            for (const target of outcome.appeared ?? []) {
              const key = label(target);
              if (!appeared.has(key) && (await element(target).isDisplayed())) appeared.add(key);
              sample[`appeared ${key}`] = appeared.has(key);
            }
            observed = sample;
            // A warning can arrive just after the first lookup. Keep polling it
            // before spending its lifetime on slower persistent-state reads.
            if (!(outcome.appeared ?? []).every((target) => appeared.has(label(target)))) {
              return false;
            }
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
        ),
      record
    );
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    // Evidence is best effort and must not replace the original failure.
    if (outcome.appeared?.length && outcome.all?.length) {
      const failureObserved: Record<string, unknown> = {};
      const diagnosticErrors: string[] = [];
      record.failureObservedAt = new Date().toISOString();
      for (const condition of outcome.all) {
        try {
          failureObserved[JSON.stringify(condition)] = (await observe(condition)).actual;
        } catch (diagnosticError) {
          diagnosticErrors.push(String(diagnosticError));
        }
      }
      record.failureObserved = failureObserved;
      if (diagnosticErrors.length) record.failureObservationErrors = diagnosticErrors;
    }
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
    if (outcome.appeared?.length) record.appeared = [...appeared];
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
      await withMoveToSparkIntroRecovery(() =>
        current.waitForDisplayed({ timeout: outcome.timeout ?? 30_000 })
      );
      await current.click();
    },
    outcome
  );
}

/** A tag can be visible before its sheet finishes entering the touch position. */
export async function tapStationaryAndExpect(target: VisibleTarget, outcome: Outcome) {
  if (!driver.isAndroid) return tapAndExpect(target, outcome);
  await actAndExpect(
    `tap stationary ${label(target)}`,
    async () => {
      let previous = '';
      let ready: { click(): Promise<void> } | undefined;
      await withMoveToSparkIntroRecovery(() =>
        browser.waitUntil(
          async () => {
            const last = previous;
            previous = '';
            ready = undefined;
            const current = await element(target);
            if (!(await current.isDisplayed()) || !(await current.isEnabled())) return false;
            const location = await current.getLocation();
            const size = await current.getSize();
            if (size.width <= 0 || size.height <= 0) return false;
            previous = JSON.stringify({ id: current.elementId, location, size });
            if (previous !== last) return false;
            ready = current;
            return true;
          },
          {
            timeout: outcome.timeout ?? 30_000,
            interval: 200,
            timeoutMsg: `${label(target)} did not become enabled and stationary`,
          }
        )
      );
      if (!ready) throw new Error(`${label(target)} readiness was not established`);
      await ready.click();
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

export async function typeAndExpect(
  id: string,
  text: string,
  outcome: Outcome = {},
  { verifyClear = false }: { verifyClear?: boolean } = {}
) {
  await actAndExpect(
    `type id:${id}`,
    async () => {
      const current = elementById(id);
      await withMoveToSparkIntroRecovery(() => current.waitForDisplayed());
      await current.clearValue();
      if (verifyClear) {
        let emptySeen = false;
        let actual: unknown;
        await browser.waitUntil(
          async () => {
            const input = elementById(id);
            if (!(await input.isDisplayed())) {
              emptySeen = false;
              return false;
            }
            // Read the native input attribute, not fallback labels/identifiers.
            actual = await input.getAttribute(driver.isAndroid ? 'text' : 'value');
            if (actual !== '' && actual !== null) {
              emptySeen = false;
              return false;
            }
            const stable = emptySeen;
            emptySeen = true;
            return stable;
          },
          {
            timeout: outcome.timeout ?? 30_000,
            interval: 200,
            timeoutMsg: `${id}: input did not clear; replacement not typed`,
          }
        );
      }
      // setValue clears again internally; that would invalidate the verified clear.
      if (verifyClear) await elementById(id).addValue(text);
      else await elementById(id).setValue(text);
    },
    { ...outcome, all: [{ inputValue: { id, value: text } }, ...(outcome.all ?? [])] }
  );
}

export async function dismissKeyboardAndExpect() {
  await actAndExpect('confirm keyboard input', confirmInputOnKeyboard, {
    all: [{ keyboardShown: false }],
  });
}
