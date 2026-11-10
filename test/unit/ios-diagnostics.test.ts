import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIOSDiagnostics } from '../helpers/ios-diagnostics.ts';

function fixture({ brokenMedia = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-diagnostics-'));
  const commands: string[] = [];
  const snapshots: { dir: string; appOnly: boolean }[] = [];
  const diagnostics = createIOSDiagnostics({
    root,
    recordVideo: true,
    command: async (_method: string, endpoint: string) => {
      commands.push(endpoint);
      if (brokenMedia) throw new Error('Appium unavailable');
      return endpoint === 'source'
        ? '<App />'
        : endpoint === 'screenshot'
          ? Buffer.from('png').toString('base64')
          : '';
    },
    native: (dir: string, appOnly: boolean) => {
      snapshots.push({ dir, appOnly });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'app.log'), 'original app failure');
    },
  });
  return {
    root,
    commands,
    snapshots,
    diagnostics,
    clean: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test('beforeEach failure retains setup video, screen, source and logs without afterTest', async () => {
  const f = fixture();
  try {
    const context = { currentTest: { title: '@send_3', parent: { title: 'Send' } } };
    await f.diagnostics.beforeHook({ title: 'before each' }, context, 'beforeEach');
    await f.diagnostics.beforeReset();
    const original = new Error('Wallet home did not appear');
    await f.diagnostics.afterHook({ title: 'before each' }, context, { error: original });
    assert.deepEqual(f.commands, [
      'appium/start_recording_screen',
      'screenshot',
      'source',
      'appium/device/app_state',
      'appium/stop_recording_screen',
    ]);
    assert.equal(f.snapshots[0].appOnly, true);
    const dir = f.snapshots[1].dir;
    assert.match(dir, /send_3.*failure$/);
    assert.match(
      fs.readFileSync(path.join(dir, 'failure.json'), 'utf8'),
      /Wallet home did not appear/
    );
    for (const file of ['screen.png', 'source.xml', 'app.log'])
      assert.ok(fs.existsSync(path.join(dir, file)));
    assert.ok(fs.existsSync(path.join(dir, '../recording.mp4')));
  } finally {
    f.clean();
  }
});

test('setup to body keeps one recording; body failure and next case retain separate evidence', async () => {
  const f = fixture();
  try {
    const currentTest = { title: '@boost_2', parent: { title: 'Boost' } };
    await f.diagnostics.beforeHook({}, { currentTest }, 'beforeEach');
    await f.diagnostics.beforeTest({ title: '@boost_2', parent: 'Boost' });
    await f.diagnostics.beforeReset();
    await f.diagnostics.afterTest({ error: new Error('Restore failed') });
    const failedDir = f.snapshots[1].dir;
    await f.diagnostics.beforeHook({}, { currentTest: { title: '@send_3' } }, 'beforeEach');
    await f.diagnostics.beforeReset();
    await f.diagnostics.afterTest({});
    assert.equal(f.commands.filter((c) => c.includes('start_recording')).length, 2);
    assert.notEqual(path.dirname(f.snapshots[0].dir), path.dirname(f.snapshots[2].dir));
    assert.ok(fs.existsSync(path.join(failedDir, 'app.log')));
  } finally {
    f.clean();
  }
});

test('failed media collection cannot replace original failure or prevent native log capture', async () => {
  const f = fixture({ brokenMedia: true });
  try {
    await f.diagnostics.beforeHook({}, { currentTest: { title: 'setup' } }, 'beforeEach');
    await assert.doesNotReject(
      f.diagnostics.afterHook({}, {}, { error: new Error('original failure') })
    );
    assert.equal(f.snapshots.length, 1);
    assert.match(
      fs.readFileSync(path.join(f.snapshots[0].dir, 'failure.json'), 'utf8'),
      /original failure/
    );
  } finally {
    f.clean();
  }
});
