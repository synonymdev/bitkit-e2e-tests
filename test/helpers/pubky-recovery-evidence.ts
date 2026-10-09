import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getAppId } from './constants';

/** Keep only logs, never the app's keychain, wallet database or profile state. */
export function startPubkyRecoveryEvidence() {
  const caps = driver.capabilities as Record<string, unknown>;
  const device = String(
    caps['appium:udid'] ||
      caps.udid ||
      caps.deviceUDID ||
      (driver.isAndroid ? process.env.ANDROID_UDID : process.env.SIMULATOR_UDID) ||
      ''
  );
  if (!device || device === 'auto') throw new Error('Recovery evidence needs an exact device UDID');
  const dir = path.resolve(
    'artifacts',
    ...(process.env.ATTEMPT ? [`attempt-${process.env.ATTEMPT}`] : []),
    `pubky-profile-2-${driver.isAndroid ? 'android' : 'ios'}-${Date.now()}`
  );
  fs.mkdirSync(dir, { recursive: true });
  const events = path.join(dir, 'events.jsonl');
  function mark(phase: string, detail: Record<string, unknown> = {}) {
    const event = { at: new Date().toISOString(), phase, ...detail };
    fs.appendFileSync(events, `${JSON.stringify(event)}\n`);
    console.info('→ Pubky recovery', event);
  }
  const log = fs.openSync(path.join(dir, 'native.log'), 'a');
  const stream: ChildProcess = driver.isAndroid
    ? spawn('adb', ['-s', device, 'logcat', '-v', 'threadtime', '-T', '1', '-b', 'all'], {
        stdio: ['ignore', log, log],
      })
    : spawn(
        'xcrun',
        [
          'simctl',
          'spawn',
          device,
          'log',
          'stream',
          '--predicate',
          'process == "Bitkit"',
          '--style',
          'compact',
          '--level',
          'debug',
        ],
        { stdio: ['ignore', log, log] }
      );
  stream.on('error', () => mark('native-stream-error'));
  stream.on('exit', (code, signal) => mark('native-stream-exit', { code, signal }));
  fs.closeSync(log);
  mark('capture-start', { device, appId: getAppId() });

  function snapshot(phase: string) {
    try {
      if (driver.isAndroid) {
        const archive = execFileSync(
          'adb',
          [
            '-s',
            device,
            'exec-out',
            'run-as',
            getAppId(),
            'tar',
            '-cf',
            '-',
            '-C',
            'files',
            'logs',
          ],
          { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 }
        );
        fs.writeFileSync(path.join(dir, `${phase}-app-logs.tar`), archive);
      } else {
        const group = execFileSync(
          'xcrun',
          ['simctl', 'get_app_container', device, getAppId(), 'group.bitkit'],
          { encoding: 'utf8', timeout: 30_000 }
        ).trim();
        // Env.logDirectory is the logs directory at the group.bitkit container root.
        fs.cpSync(path.join(group, 'logs'), path.join(dir, `${phase}-app-logs`), {
          recursive: true,
        });
      }
      mark('file-logs-saved', { snapshot: phase });
    } catch {
      mark('file-logs-unavailable', { snapshot: phase });
    }
  }

  async function finish() {
    snapshot('final');
    try {
      await driver.saveScreenshot(path.join(dir, 'final.png'));
    } catch {
      mark('screenshot-unavailable');
    }
    mark('capture-end');
    stream.kill('SIGTERM');
  }
  return { mark, snapshot, finish };
}
