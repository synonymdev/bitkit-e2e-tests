import fs from 'node:fs';
import path from 'node:path';
import { config as base } from './wdio.conf';
import { elementById } from './test/helpers/actions';

if (process.env.CI) throw new Error('This pilot is local-only');
const platform = process.env.PLATFORM;
if (platform !== 'ios' && platform !== 'android') throw new Error('Set PLATFORM=ios or android');
if (platform === 'ios' && !process.env.SIMULATOR_UDID) {
  throw new Error('Use a disposable SIMULATOR_UDID');
}
if (platform === 'android' && !process.env.ANDROID_UDID)
  throw new Error('Use a disposable ANDROID_UDID');
if (!process.env.OUTCOME_PILOT_ARTIFACTS) throw new Error('Set OUTCOME_PILOT_ARTIFACTS');
const journey = process.env.OUTCOME_PILOT_JOURNEY ?? 'onboarding';
if (!['onboarding', 'receive', 'all'].includes(journey))
  throw new Error('Invalid OUTCOME_PILOT_JOURNEY');
const journeys = journey === 'all' ? ['onboarding', 'receive'] : [journey];
const directory = process.env.OUTCOME_PILOT_ARTIFACTS;
fs.mkdirSync(directory, { recursive: true });

export const config: WebdriverIO.Config = {
  ...base,
  specs: [journeys.map((name) => `./test/experiments/${name}-outcome.e2e.ts`)],
  maxInstances: 1,
  specFileRetries: 0,
  connectionRetryCount: 0,
  services: [
    ['appium', { args: { port: Number(process.env.APPIUM_PORT ?? 4723) }, logPath: directory }],
  ],
  mochaOpts: { ...base.mochaOpts, retries: 0, timeout: 240_000 },
  beforeTest: async function (test, context) {
    process.env.OUTCOME_PILOT_CURRENT_JOURNEY = test.parent?.includes('receive')
      ? 'receive'
      : 'onboarding';
    if (typeof base.beforeTest === 'function') await base.beforeTest.call(this, test, context);
  },
  afterHook: async function (test, context, result, hookName) {
    if (result.error) {
      const evidence: Record<string, unknown> = {
        hookName,
        title: test.title,
        error: result.error.message,
      };
      for (const id of ['UsdtIntroDecline', 'TotalBalance-primary', 'Receive', 'GetStarted']) {
        try {
          evidence[id] = await elementById(id).isDisplayed();
        } catch (error) {
          evidence[id] = String(error);
        }
      }
      try {
        await browser.saveScreenshot(path.join(directory, `hook-${Date.now()}.png`));
      } catch (error) {
        evidence.screenshotError = String(error);
      }
      fs.appendFileSync(
        path.join(directory, 'hook-failures.jsonl'),
        `${JSON.stringify(evidence)}\n`
      );
    }
    if (typeof base.afterHook === 'function')
      await base.afterHook.call(this, test, context, result, hookName);
  },
  afterTest: async function (test, context, result) {
    fs.appendFileSync(
      path.join(directory, 'results.jsonl'),
      `${JSON.stringify({
        mode: process.env.OUTCOME_PILOT_MODE,
        platform,
        journey: test.parent?.includes('receive') ? 'receive' : 'onboarding',
        negativeControl: process.env.OUTCOME_PILOT_NEGATIVE_CONTROL === 'true',
        title: test.title,
        passed: result.passed,
        durationMs: result.duration,
        error: result.error?.message,
        timestamp: new Date().toISOString(),
      })}\n`
    );
    if (typeof base.afterTest === 'function')
      await base.afterTest.call(this, test, context, result);
  },
};
