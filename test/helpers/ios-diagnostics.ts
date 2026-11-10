import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type Mocha from 'mocha';

type TestDetails = { title?: string; parent?: string | { title?: string } };
type HookContext = {
  currentTest?: TestDetails;
  test?: { callback?: (error?: unknown) => void };
};
type DiagnosticSuite = Mocha.Suite & { getHooks: (name: string) => Mocha.Hook[] };
type CleanupContext = { currentTest?: TestDetails; timeout: (ms: number) => unknown };
type Result = { error?: unknown };
type Case = { key: string; dir: string; recording: boolean };

export function createIOSDiagnostics({
  root = path.join(
    __dirname,
    '../../artifacts',
    process.env.ATTEMPT ? `attempt-${process.env.ATTEMPT}` : ''
  ),
  command = appiumCommand,
  native = collectNative,
  recordVideo = process.env.RECORD_VIDEO === 'true',
  saveAll = process.env.SAVE_DIAGNOSTICS === 'true',
} = {}) {
  let active: Case | undefined;
  let sequence = 0;
  let failure: unknown;
  let collecting = false;
  const cases = new WeakMap<object, Case>();

  const safe = async (label: string, operation: () => Promise<unknown> | unknown) => {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[diagnostics] ${label}: ${String(error)}`);
      try {
        if (active) {
          fs.mkdirSync(active.dir, { recursive: true });
          fs.appendFileSync(
            path.join(active.dir, 'collection-errors.log'),
            `${new Date().toISOString()} ${label}: ${String(error)}\n`
          );
        }
      } catch {
        /* Artifact storage may also be unavailable. Preserve the original failure. */
      }
      return undefined;
    }
  };
  const identity = (test: TestDetails) => {
    const parent = typeof test.parent === 'string' ? test.parent : test.parent?.title;
    return `${parent ?? 'unknown'}_${test.title ?? 'unknown'}`;
  };
  const begin = async (test: TestDetails) => {
    const key = identity(test);
    if (active?.key === key) return;
    if (active) {
      collecting = true;
      await finish({ error: failure });
    }
    const name = key
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '')
      .slice(0, 180);
    active = { key, dir: path.join(root, `${name}-${Date.now()}-${++sequence}`), recording: false };
    failure = undefined;
    collecting = false;
    if (recordVideo) {
      const started = await safe('start recording', () =>
        command('POST', 'appium/start_recording_screen', {
          options: {
            timeLimit: '600',
            videoQuality: 'low',
            videoType: 'libx264',
            videoFps: 8,
            videoFilters: 'scale=480:-2',
          },
        })
      );
      active.recording = started !== undefined;
    }
  };
  const capture = async (phase: string, error?: unknown) => {
    if (!active) return;
    const dir = path.join(active.dir, phase);
    await safe('create artifact directory', () => fs.mkdirSync(dir, { recursive: true }));
    const manifest: Record<string, unknown> = {
      case: active.key,
      phase,
      at: new Date().toISOString(),
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error ?? ''),
    };
    await Promise.all([
      safe('screenshot', async () => {
        const value = await command('GET', 'screenshot');
        fs.writeFileSync(path.join(dir, 'screen.png'), Buffer.from(String(value), 'base64'));
      }),
      safe('page source', async () =>
        fs.writeFileSync(path.join(dir, 'source.xml'), String(await command('GET', 'source')))
      ),
      safe('app state', async () => {
        manifest.appState = await command('POST', 'appium/device/app_state', {
          bundleId: process.env.APP_ID_IOS ?? 'to.bitkit',
        });
      }),
    ]);
    await safe('native logs', () => native(dir, false));
    await safe('manifest', () =>
      fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify(manifest, null, 2))
    );
    console.info(`[diagnostics] Captured ${phase}: ${dir}`);
  };
  const finish = async ({ error }: Result) => {
    if (!active) return;
    const current = active;
    if (error || saveAll) await capture(error ? 'failure' : 'completed', error);
    if (current.recording) {
      await safe('stop recording', async () => {
        const video = await command('POST', 'appium/stop_recording_screen', {});
        if (error || saveAll) {
          fs.mkdirSync(current.dir, { recursive: true });
          fs.writeFileSync(
            path.join(current.dir, 'recording.mp4'),
            Buffer.from(String(video), 'base64')
          );
        }
      });
    }
    active = undefined;
  };
  const observe = (context: HookContext) => {
    const runnable = context.test;
    const callback = runnable?.callback;
    const current = active;
    if (!runnable || !callback || !current) return;
    cases.set(runnable, current);
    // Mocha's own deadline can win WDIO's 3 ms race. Retain that exact error
    // synchronously before Mocha advances to the separate cleanup runnable.
    // Do not change the original timer, timeout or completion callback result.
    runnable.callback = function (error) {
      if (error && active === current && !collecting) failure ??= error;
      return callback.call(this, error);
    };
  };
  const remember = ({ error }: Result, context: HookContext) => {
    if (error && !collecting && context.test && cases.get(context.test) === active)
      failure ??= error;
  };
  const cleanup = async function (this: CleanupContext) {
    // Media <= 10 s, native collector <= 100 s, recording <= 30 s.
    // This root hook is a new Mocha runnable, outside the failed setup/body.
    this.timeout(180_000);
    collecting = true;
    await finish({ error: failure });
  };
  return {
    rootHooks: {
      beforeAll: function (this: Mocha.Context) {
        // Register after spec loading, outside WDIO's wrapped global `after`.
        // Each suite flushes before a sibling's beforeAll can mutate app state.
        const addCleanup = (suite: Mocha.Suite) => {
          for (const entry of suite.suites) {
            const child = entry as DiagnosticSuite;
            // WDIO 9.18 re-reads Mocha's mutable context after awaiting the
            // body. Keep that invocation's runnable/identity stable, including
            // a late afterHook. Forward other context reads/writes unchanged.
            for (const runnable of [
              ...child.tests,
              ...child.getHooks('beforeAll'),
              ...child.getHooks('beforeEach'),
              ...child.getHooks('afterEach'),
              ...child.getHooks('afterAll'),
            ]) {
              const fn = runnable.fn as ((...args: unknown[]) => unknown) | undefined;
              if (!fn) continue;
              runnable.fn = function (this: Mocha.Context, ...args: unknown[]) {
                const originalTest = this.test;
                const originalCurrentTest = this.currentTest;
                const context = new Proxy(this, {
                  get(target, property, receiver) {
                    if (property === 'test' || property === '_runnable') return originalTest;
                    if (property === 'currentTest') return originalCurrentTest;
                    return Reflect.get(target, property, receiver);
                  },
                });
                return fn.apply(context, args);
              };
            }
            // If an earlier suite teardown failed, Mocha skipped its remaining
            // afterAll hooks. Flush before this sibling starts product setup.
            child.beforeAll(async function () {
              this.timeout(180_000);
              if (failure) await cleanup.call(this);
            });
            const beforeAll = child.getHooks('beforeAll');
            beforeAll.unshift(beforeAll.pop()!);
            child.afterAll(cleanup);
            addCleanup(child);
          }
        };
        if (this.test?.parent) addCleanup(this.test.parent);
      },
      beforeEach: async function (this: CleanupContext) {
        // Drain a failed suite hook before a sibling can reset the app, then
        // start recording (<= 30 s). Neither consumes the next setup's deadline.
        this.timeout(180_000);
        await begin(this.currentTest ?? {});
      },
      afterEach: cleanup,
      afterAll: cleanup,
    },
    beforeTest: (_test: TestDetails, context: HookContext) => observe(context),
    afterTest: (result: Result, context: HookContext) => remember(result, context),
    beforeHook: (hook: TestDetails, context: HookContext) => {
      if (!active) {
        // Suite-level hooks have no per-test recording, but their original
        // deadline error must be retained before Mocha advances too.
        const key = identity(hook);
        active = {
          key,
          dir: path.join(root, `suite-${Date.now()}-${++sequence}`),
          recording: false,
        };
        failure = undefined;
        collecting = false;
      }
      observe(context);
    },
    afterHook: (_hook: TestDetails, context: HookContext, result: Result) =>
      remember(result, context),
    beforeReset: async () => {
      if (!active) return;
      await safe('logs before reinstall', () =>
        native(path.join(active!.dir, `before-reset-${Date.now()}`), true)
      );
    },
  };
}

async function appiumCommand(method: string, endpoint: string, body?: unknown): Promise<unknown> {
  const {
    protocol = 'http',
    hostname = 'localhost',
    port = 4723,
    path: base = '/',
  } = driver.options;
  // These diagnostics are for the local Appium runner; never forward session data elsewhere.
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname))
    throw new Error('Diagnostics require local Appium');
  const host = hostname === '::1' ? '[::1]' : hostname;
  const url = `${protocol}://${host}:${port}${base.replace(/\/$/, '')}/session/${encodeURIComponent(driver.sessionId)}/${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(endpoint.includes('recording') ? 30_000 : 10_000),
  });
  const result = (await response.json()) as { value: unknown };
  if (!response.ok) {
    const value = result.value as { error?: string; message?: string } | undefined;
    throw new Error(
      `Appium ${endpoint}: HTTP ${response.status} ${value?.error ?? ''} ${String(value?.message ?? '').slice(0, 1000)}`
    );
  }
  return result.value;
}

function collectNative(dir: string, appOnly: boolean) {
  const caps = driver.capabilities as Record<string, unknown>;
  const udid = String(
    caps['appium:udid'] ?? caps.udid ?? caps.deviceUDID ?? process.env.SIMULATOR_UDID ?? ''
  );
  execFileSync(
    'python3',
    [
      path.join(__dirname, '../../scripts/collect-ios-diagnostics.py'),
      '--output',
      dir,
      '--udid',
      udid === 'auto' ? (process.env.SIMULATOR_UDID ?? '') : udid,
      '--app-id',
      process.env.APP_ID_IOS ?? 'to.bitkit',
      ...(appOnly ? ['--app-only'] : []),
    ],
    { timeout: 100_000, stdio: 'pipe' }
  );
}

export const iosDiagnostics = createIOSDiagnostics();
