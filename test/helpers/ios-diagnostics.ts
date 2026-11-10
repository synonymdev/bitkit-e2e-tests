import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

type TestDetails = { title?: string; parent?: string | { title?: string } };
type HookContext = { currentTest?: TestDetails };
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
    if (active) await finish({});
    const name = key
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '')
      .slice(0, 180);
    active = { key, dir: path.join(root, `${name}-${Date.now()}-${++sequence}`), recording: false };
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
  return {
    beforeTest: begin,
    afterTest: finish,
    beforeHook: async (_hook: TestDetails, context: HookContext, name?: string) => {
      if (name === 'beforeEach' && context.currentTest) await begin(context.currentTest);
    },
    afterHook: async (hook: TestDetails, context: HookContext, result: Result) => {
      if (!result.error) return;
      if (!active) await begin(context.currentTest ?? hook);
      await finish(result);
    },
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
