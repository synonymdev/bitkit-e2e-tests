import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import Mocha from 'mocha';
import { createIOSDiagnostics } from '../helpers/ios-diagnostics.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const mode of [
  'setup timeout',
  'body timeout',
  'Mocha deadline wins',
  'suite timeout',
  'fast cleanup late hook',
  'suite teardown failure',
  'setup rejection',
  'body rejection',
] as const) {
  test(`${mode}: real Mocha/WDIO wait for evidence before the next case and session end`, async () => {
    const { testFnWrapper } = await import('@wdio/utils');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-lifecycle-'));
    const events: string[] = [];
    const errors: Error[] = [];
    const fast = mode === 'fast cleanup late hook';
    const suiteFailure = mode === 'suite timeout' || mode === 'suite teardown failure';
    const rejection = mode.endsWith('rejection') || mode === 'suite teardown failure';
    const original = new Error('original failure');
    const fail = async () => {
      if (rejection) throw original;
      await new Promise<void>(() => {});
    };
    let originalTimeoutError: unknown;
    const diagnostics = createIOSDiagnostics({
      root,
      recordVideo: true,
      command: async (_method: string, endpoint: string) => {
        if (!fast && (endpoint === 'screenshot' || endpoint.includes('stop_recording'))) {
          await delay(100); // Each exceeds the failed runnable's 50 ms budget.
        }
        events.push(endpoint);
        return endpoint === 'source' ? '<App />' : Buffer.from('evidence').toString('base64');
      },
      native: (dir: string) => fs.writeFileSync(path.join(dir, 'app.log'), 'native evidence'),
    });
    const mocha = new Mocha({
      timeout: 50,
      rootHooks: diagnostics.rootHooks,
      reporter: class extends Mocha.reporters.Base {},
    });
    const args = (value: unknown): [unknown, unknown] => {
      const ctx = value as Mocha.Context;
      return [{ ...ctx.test, parent: ctx.test?.parent?.title }, ctx];
    };
    const wrap = (type: 'Test' | 'Hook', fn: () => Promise<void>, slowBefore = false) =>
      function (this: Mocha.Context) {
        // Also exercise Mocha's own deadline, before WDIO enters executeAsync.
        const runnable = this.test!;
        const callback = runnable.callback;
        runnable.callback = (error?: unknown) => {
          originalTimeoutError = error;
          callback!(error);
        };
        return testFnWrapper.call(
          this,
          type,
          { specFn: fn, specFnArgs: [] },
          {
            beforeFn: async (identity: any, context: any) => {
              if (type === 'Hook') diagnostics.beforeHook(identity, context);
              else diagnostics.beforeTest(identity, context);
              if (slowBefore) await delay(fast ? 30 : 80);
            },
            beforeFnArgs: args,
          },
          {
            afterFn: (identity: any, context: any, result: any) => {
              if (type === 'Hook') diagnostics.afterHook(identity, context, result);
              else diagnostics.afterTest(result, context);
            },
            afterFnArgs: args,
          },
          '0-0',
          0,
          type === 'Hook' ? 'beforeEach' : undefined
        );
      };
    const failed = Mocha.Suite.create(mocha.suite, mode);
    if (mode === 'suite timeout') {
      failed.beforeAll(wrap('Hook', fail, true));
    } else if (mode === 'suite teardown failure') {
      failed.afterAll(wrap('Hook', fail));
    } else if (mode !== 'body timeout' && mode !== 'body rejection') {
      failed.beforeEach(wrap('Hook', fail, mode === 'Mocha deadline wins' || fast));
    }
    failed.addTest(
      new Mocha.Test(
        'failed case',
        wrap('Test', async () => {
          if (mode === 'suite teardown failure') return;
          if (mode !== 'body timeout' && mode !== 'body rejection')
            assert.fail('body must not run after setup failure');
          await fail();
        })
      )
    );
    const next = Mocha.Suite.create(mocha.suite, 'next suite');
    next.beforeAll(() => {
      assert.equal(
        fs.readdirSync(root, { recursive: true }).filter((p) => String(p).endsWith('failure.json'))
          .length,
        1
      );
      events.push('next suite setup');
    });
    next.addTest(
      new Mocha.Test(
        'next case',
        wrap('Test', async () => {
          events.push('next case');
          if (fast) await delay(120);
          assert.equal(
            fs
              .readdirSync(root, { recursive: true })
              .filter((p) => String(p).endsWith('recording.mp4')).length,
            suiteFailure ? 0 : 1
          );
          assert.equal(
            fs
              .readdirSync(root, { recursive: true })
              .filter((p) => String(p).endsWith('failure.json')).length,
            1
          );
        })
      )
    );
    next.tests[0].timeout(200);
    try {
      const failures = await new Promise<number>((resolve) => {
        const runner = mocha.run(resolve);
        runner.on('fail', (_runnable, error) => errors.push(error));
      });
      events.push('session end');
      assert.equal(failures, 1);
      assert.equal(errors.length, 1);
      assert.match(errors[0].message, rejection ? /original failure/ : /Timeout/);
      if (rejection) assert.equal(errors[0], original);
      if (mode === 'Mocha deadline wins' || mode === 'suite timeout')
        assert.equal(errors[0], originalTimeoutError);
      const manifests = fs
        .readdirSync(root, { recursive: true })
        .filter((p) => String(p).endsWith('failure.json'));
      assert.equal(manifests.length, 1);
      const file = path.join(root, String(manifests[0]));
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).error.message, errors[0].message);
      assert.ok(events.indexOf('screenshot') < events.indexOf('next case'));
      if (!suiteFailure)
        assert.ok(events.indexOf('appium/stop_recording_screen') < events.indexOf('next case'));
      assert.ok(events.indexOf('screenshot') < events.indexOf('next suite setup'));
      assert.ok(events.indexOf('next case') < events.indexOf('session end'));
      assert.equal(failed.timeout(), 50);
    } finally {
      mocha.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('the real WDIO adapter drains a setup timeout and continues past a skipped suite', async () => {
  const { MochaAdapter } = await import('@wdio/mocha-framework');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-adapter-'));
  const spec = path.join(root, 'probe.cjs');
  fs.writeFileSync(
    spec,
    `
    describe('adapter timeout', function () {
      this.timeout(50);
      beforeEach(async () => { await new Promise(() => {}); });
      it('body must not run', () => { throw new Error('BODY_MUST_NOT_RUN'); });
    });
    describe.skip('adapter skipped suite', () => {
      it('stays skipped', () => { throw new Error('SKIPPED_BODY_MUST_NOT_RUN'); });
    });
    describe('adapter next suite', () => {
      it('passes', async () => {});
    });
  `
  );
  let stopped = false;
  let stoppedBeforeAfter = false;
  let nextCasePassed = false;
  const diagnostics = createIOSDiagnostics({
    root,
    recordVideo: true,
    command: async (_method: string, endpoint: string) => {
      if (endpoint.includes('stop_recording')) {
        await delay(100);
        stopped = true;
      }
      return endpoint === 'source' ? '<App />' : Buffer.from('evidence').toString('base64');
    },
    native: (dir: string) => fs.writeFileSync(path.join(dir, 'app.log'), 'native evidence'),
  });
  const config = {
    rootDir: root,
    mochaOpts: { ui: 'bdd', timeout: 200, rootHooks: diagnostics.rootHooks },
    beforeTest: diagnostics.beforeTest,
    beforeHook: diagnostics.beforeHook,
    afterHook: diagnostics.afterHook,
    afterTest: (_test: unknown, context: any, result: any) =>
      diagnostics.afterTest(result, context),
    after: () => {
      stoppedBeforeAfter = stopped;
    },
  } as unknown as ConstructorParameters<typeof MochaAdapter>[1];
  try {
    const reporter = new EventEmitter();
    reporter.on('test:pass', (result: { title: string }) => {
      if (result.title === 'passes') nextCasePassed = true;
    });
    const adapter = new MochaAdapter('0-0', config, [spec], {}, reporter);
    await adapter.init();
    assert.equal(await adapter.run(), 1);
    assert.ok(stoppedBeforeAfter, 'session cleanup must wait for recording');
    assert.ok(nextCasePassed, 'a suite after describe.skip must still run');
    const manifests = fs
      .readdirSync(root, { recursive: true })
      .filter((p) => String(p).endsWith('failure.json'));
    assert.equal(manifests.length, 1);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, String(manifests[0])), 'utf8'));
    assert.match(manifest.error.message, /Timeout/);
    assert.match(manifest.case, /adapter timeout/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
