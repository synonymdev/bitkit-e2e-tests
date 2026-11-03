import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import InventoryReporter from '../reporting/reporter.ts';
import { loadInventory } from '../reporting/inventory.ts';
import {
  createPlan,
  digest,
  reconcile,
  writeJson,
  type WorkerReport,
} from '../reporting/report.ts';

function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-events-'));
  const previous = {
    E2E_PLAN: process.env.E2E_PLAN,
    PLATFORM: process.env.PLATFORM,
    BACKEND: process.env.BACKEND,
    ATTEMPT: process.env.ATTEMPT,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plan = createPlan(
    loadInventory(process.cwd()).cases,
    {
      runId: 'reporter-integration',
      platform: 'ios',
      backend: 'regtest',
      appSha: 'a'.repeat(40),
      e2eSha: 'b'.repeat(40),
      artifactDigest: 'c'.repeat(64),
      backendRevision: 'stag0',
      variant: 'default',
    },
    digest(fs.readFileSync('test/inventory.json', 'utf8')),
    'smoke'
  );
  process.env.E2E_PLAN = path.join(directory, 'plan.json');
  process.env.PLATFORM = 'ios';
  process.env.BACKEND = 'regtest';
  process.env.ATTEMPT = '1';
  writeJson(process.env.E2E_PLAN, plan);
  const reporter = new InventoryReporter({ writeStream: { write: () => true } });
  reporter.emit('runner:start', {
    cid: '0-0',
    capabilities: { platformName: 'iOS' },
    config: {},
    specs: ['test/specs/smoke.e2e.ts'],
  });
  const receipt = () =>
    JSON.parse(
      fs.readFileSync(path.join(directory, 'workers/attempt-1-0-0.json'), 'utf8')
    ) as WorkerReport;
  const passAll = () => {
    for (const id of plan.expected) {
      const e = { uid: id, cid: '0-0', title: `@${id} - test`, fullTitle: `smoke @${id} - test` };
      reporter.emit('test:start', e);
      reporter.emit('test:pass', e);
      reporter.emit('test:end', e);
    }
  };
  return { reporter, receipt, plan, passAll };
}

test('actual WDIO reporter events produce a complete exact-case receipt', (t) => {
  const f = fixture(t);
  f.passAll();
  f.reporter.emit('runner:end', { failures: 0 });
  assert.equal(reconcile(f.plan, [f.receipt()]).status, 'passed');
});
test('Mocha pending events are reported as unexpected skips', (t) => {
  const f = fixture(t);
  const id = f.plan.expected[0];
  f.reporter.emit('test:pending', {
    uid: id,
    cid: '0-0',
    title: `@${id} - skipped`,
    fullTitle: `@${id} - skipped`,
    state: 'pending',
  });
  f.reporter.emit('runner:end', { failures: 0 });
  const result = reconcile(f.plan, [f.receipt()]);
  assert.match(result.problems.join(' '), /Unexpected skip/);
});
test('hook failure is recorded even if runner failure count is zero', (t) => {
  const f = fixture(t);
  f.passAll();
  f.reporter.emit('hook:start', { uid: 'after', cid: '0-0', title: 'after hook' });
  f.reporter.emit('hook:end', { uid: 'after', errors: [new Error('teardown failed')] });
  f.reporter.emit('runner:end', { failures: 0 });
  const result = reconcile(f.plan, [f.receipt()]);
  assert.equal(result.status, 'incomplete');
  assert.match(result.problems.join(' '), /Hook failed/);
});
test('interruption retains incremental case evidence without a successful finish', (t) => {
  const f = fixture(t);
  f.passAll();
  assert.equal(f.receipt().events.length, 3);
  assert.equal(reconcile(f.plan, [f.receipt()]).status, 'incomplete');
});
test('framework retries cannot silently turn one-attempt smoke green', (t) => {
  const f = fixture(t);
  const id = f.plan.expected[0];
  const event = { uid: id, cid: '0-0', title: `@${id} - retry` };
  f.reporter.emit('test:start', event);
  f.reporter.emit('test:retry', { ...event, errors: [new Error('first attempt')] });
  f.passAll();
  f.reporter.emit('runner:end', { failures: 0 });
  assert.equal(reconcile(f.plan, [f.receipt()]).status, 'incomplete');
});
