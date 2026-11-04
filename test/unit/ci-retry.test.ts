import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createPlan,
  validatePlan,
  reconcileAttempts,
  type Identity,
  type WorkerReport,
  type AttemptReceipt,
} from '../reporting/report.ts';
import { loadInventory } from '../reporting/inventory.ts';
const cases = loadInventory(process.cwd()).cases.filter((c) => ['send_1', 'send_2'].includes(c.id));
const identity: Identity = {
  runId: 'retry',
  platform: 'ios',
  backend: 'local',
  appSha: 'a'.repeat(40),
  e2eSha: 'b'.repeat(40),
  artifactDigest: 'c'.repeat(64),
  backendRevision: 'local',
  variant: 'local',
};
const plan = createPlan(cases, identity, 'd'.repeat(64), 'selected', 3);
function receipt(attempt: number, exitCode = 0): AttemptReceipt {
  return {
    attempt,
    exitCode,
    startedAt: '2026-11-03T00:00:00Z',
    finishedAt: '2026-11-03T00:01:00Z',
  };
}
function worker(attempt: number, failed = false): WorkerReport {
  return {
    schemaVersion: 1,
    planId: plan.id,
    attempt,
    cid: '0-0',
    startedAt: '2026-11-03T00:00:00Z',
    finishedAt: '2026-11-03T00:01:00Z',
    failures: failed ? 1 : 0,
    errors: [],
    events: plan.expected.map((id) => ({
      id,
      status: failed ? 'failed' : 'passed',
      durationMs: 10,
    })),
  };
}
test('first failure remains after third-attempt recovery', () => {
  const s = reconcileAttempts(
    plan,
    [worker(1, true), worker(2, true), worker(3)],
    [receipt(1, 1), receipt(2, 1), receipt(3)]
  );
  assert.equal(s.status, 'passed');
  assert.equal(s.firstFailure, true);
  assert.equal(s.attemptsUsed, 3);
  assert.equal(s.results[0].firstAttempt, 'failed');
  assert.equal(s.results[0].history.length, 3);
});
test('startup failure without workers is retained after recovery', () => {
  const s = reconcileAttempts(plan, [worker(2)], [receipt(1, 1), receipt(2)]);
  assert.equal(s.status, 'passed');
  assert.equal(s.firstFailure, true);
  assert.equal(s.results[0].firstAttempt, 'missing');
});
test('interrupted worker may recover only with a complete later attempt', () => {
  const w = worker(1);
  delete w.finishedAt;
  const s = reconcileAttempts(plan, [w, worker(2)], [receipt(1, 1), receipt(2)]);
  assert.equal(s.status, 'passed');
  assert.equal(s.firstFailure, true);
  assert.ok(s.attempts[0].problems.some((p) => p.includes('Interrupted')));
});
for (const [name, reports, attempts] of [
  ['no runner', [], []],
  ['runner failure despite passing tests', [worker(1)], [receipt(1, 1)]],
  ['zero matches', [], [receipt(1)]],
  ['attempt after pass', [worker(1), worker(2)], [receipt(1), receipt(2)]],
  ['missing attempt', [worker(2)], [receipt(2)]],
  ['fourth attempt', [worker(4)], [receipt(4)]],
  ['interrupted process', [worker(1)], [{ ...receipt(1), finishedAt: undefined }]],
  ['foreign report', [{ ...worker(1), planId: 'other' }], [receipt(1)]],
  [
    'partial retry',
    [worker(1, true), { ...worker(2), events: worker(2).events.slice(0, 1) }],
    [receipt(1, 1), receipt(2)],
  ],
] as [string, WorkerReport[], AttemptReceipt[]][])
  test(name + ' fails closed', () =>
    assert.equal(reconcileAttempts(plan, reports, attempts).status, 'incomplete')
  );

test('failed-only retries accumulate passes and preserve the original failure', () => {
  const first = worker(1, true);
  first.events[0].status = 'passed';
  const second = worker(2, true);
  second.events[0].status = 'skipped';
  const third = worker(3);
  third.events[0].status = 'skipped';
  const s = reconcileAttempts(
    plan,
    [first, second, third],
    [receipt(1, 1), receipt(2, 1), receipt(3)]
  );
  assert.equal(s.status, 'passed');
  assert.equal(s.firstFailure, true);
  assert.deepEqual(
    s.results[0].history.map((h) => h.event.status),
    ['passed', 'skipped', 'skipped']
  );
  assert.deepEqual(
    s.results[1].history.map((h) => h.event.status),
    ['failed', 'failed', 'passed']
  );
  assert.equal(s.durationMs, 60);
});

test('passes from a failed hook or interrupted worker cannot justify a skipped retry', () => {
  for (const first of [
    { ...worker(1), errors: ['Hook failed: afterEach'] },
    { ...worker(1), finishedAt: undefined },
    { ...worker(1), failures: 1 },
  ]) {
    const retry = worker(2);
    retry.events[0].status = 'skipped';
    assert.equal(
      reconcileAttempts(plan, [first, retry], [receipt(1, 1), receipt(2)]).status,
      'incomplete'
    );
  }
});

for (const failures of [0, 1, 2, 3, 'timeout', 'startup', 'hook'] as const)
  test(`visible CI attempts retry only failures: ${failures}`, (t) => {
    fs.mkdirSync('artifacts', { recursive: true });
    const root = fs.mkdtempSync(path.resolve('artifacts/retry-fixture-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'test/specs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'aut/bitkit.app'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'test/inventory.json'),
      JSON.stringify({ schemaVersion: 1, cases })
    );
    fs.writeFileSync(
      path.join(root, 'test/specs/send.e2e.ts'),
      cases.map((c) => `ciIt('@${c.id} - fixture',async()=>{});`).join('\n')
    );
    fs.writeFileSync(path.join(root, 'aut/bitkit.app/app'), 'fixture');
    fs.writeFileSync(
      path.join(root, 'aut/e2e-build.json'),
      JSON.stringify({ appSha: identity.appSha, platform: 'ios', backend: 'local' })
    );
    fs.writeFileSync(
      path.join(root, 'ci_run_ios.sh'),
      '#!/usr/bin/env bash\nexec node --experimental-strip-types stub.cjs\n',
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(root, 'stub.cjs'),
      String.raw`
const fs = require('fs');
const Mocha = require(${JSON.stringify(path.resolve('node_modules/mocha'))});
const {ciIt} = require(${JSON.stringify(path.resolve('test/helpers/suite.ts'))});
const p = JSON.parse(fs.readFileSync(process.env.E2E_PLAN, 'utf8'));
const a = Number(process.env.ATTEMPT);
const mode = ${JSON.stringify(failures)};
fs.mkdirSync('artifacts/attempt-' + a, {recursive: true});
fs.writeFileSync('artifacts/attempt-' + a + '/evidence.txt', 'attempt ' + a);
if (mode === 'startup' && a === 1) process.exit(1);
const mocha = new Mocha({reporter: 'dot'});
mocha.suite.emit('pre-require', global, 'fixture', mocha);
for (const id of p.expected) {
  ciIt('@' + id + ' - fixture', async () => {
    fs.appendFileSync('bodies.jsonl', JSON.stringify({attempt: a, id}) + '\n');
    if (id === 'send_2' && typeof mode === 'number' && a <= mode) throw Error('controlled case failure');
  });
}
if (mode === 'hook') afterEach(() => {if (a === 1) throw Error('controlled hook failure')});
const report = {schemaVersion: 1, planId: p.id, attempt: a, cid: '0-0', startedAt: new Date().toISOString(), failures: 0, errors: [], events: []};
const runner = mocha.run(count => {
  report.finishedAt = new Date().toISOString();
  report.failures = count;
  fs.mkdirSync('artifacts/reporting/workers', {recursive: true});
  fs.writeFileSync('artifacts/reporting/workers/attempt-' + a + '.json', JSON.stringify(report));
  process.exitCode = count ? 1 : 0;
  if (mode === 'timeout') setInterval(() => {}, 1000);
});
for (const [event, status] of [['pass', 'passed'], ['fail', 'failed'], ['pending', 'skipped']]) {
  runner.on(event, item => {
    if (item.type === 'hook') {report.errors.push('Hook failed: ' + item.title); return}
    report.events.push({id: item.title.match(/^@(\w+)/)[1], status, durationMs: 1});
  });
}
`
    );
    const env = {
      ...process.env,
      CI: '1',
      PLATFORM: 'ios',
      BACKEND: 'local',
      E2E_ATTEMPT_TIMEOUT_MINUTES: '90',
      E2E_APP_SHA: identity.appSha,
      E2E_RUN_ID: 'wrapper-fixture',
      E2E_BACKEND_REVISION: 'local',
      E2E_CASE_IDS: JSON.stringify(cases.map((c) => c.id)),
      E2E_PLAN: 'artifacts/reporting/plan.json',
      GITHUB_ENV: path.join(root, 'env'),
      GITHUB_STEP_SUMMARY: path.join(root, 'summary.md'),
      ATTEMPT: '1',
    };
    const clock = path.join(root, 'fast-clock.cjs');
    fs.writeFileSync(
      clock,
      `const real=global.setTimeout;global.setTimeout=(fn,ms,...args)=>real(fn,ms===5400000?1000:ms,...args);`
    );
    const invoke = (cmd: string) =>
      spawnSync(
        process.execPath,
        [
          ...(failures === 'timeout' ? ['--require', clock] : []),
          '--experimental-strip-types',
          path.resolve('scripts/ci-run.ts'),
          cmd,
        ],
        { cwd: root, env, encoding: 'utf8' }
      );
    const prep = invoke('prepare');
    assert.equal(prep.status, 0, prep.stderr);
    Object.assign(
      env,
      Object.fromEntries(
        fs
          .readFileSync(path.join(root, 'env'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.split('='))
      )
    );
    const prepared = JSON.parse(fs.readFileSync(path.join(root, env.E2E_PLAN), 'utf8'));
    assert.equal(prepared.attemptTimeoutMinutes, 90);
    env.E2E_ATTEMPT_TIMEOUT_MINUTES = '1'; // Attempt uses the sealed plan.
    // A leftover lock must not suppress current execution, even under this plan path.
    fs.mkdirSync(path.join(root, 'artifacts/reporting/completed'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts/reporting/completed/lock-send_1'), '1');
    let last;
    for (let attempt = 1; attempt <= 3; attempt++) {
      env.ATTEMPT = String(attempt);
      last = invoke('attempt');
      if (last.status === 0) break; // The workflow's visible-step condition.
    }
    assert.equal(last?.status, failures === 3 || failures === 'timeout' ? 1 : 0, last?.stderr);
    if (failures === 'timeout') assert.match(last!.stderr, /exceeded 90 minutes/);
    const final = invoke('report');
    assert.equal(final.status, last!.status, final.stderr);
    const s = JSON.parse(
      fs.readFileSync(path.join(root, 'artifacts/reporting/summary.json'), 'utf8')
    );
    const attempts =
      typeof failures === 'number' ? Math.min(failures + 1, 3) : failures === 'timeout' ? 3 : 2;
    assert.equal(s.attemptsUsed, attempts);
    assert.equal(s.firstFailure, failures !== 0);
    const bodies = fs
      .readFileSync(path.join(root, 'bodies.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(bodies.filter((b) => b.id === 'send_1').length, failures === 'hook' ? 2 : 1);
    assert.equal(
      bodies.filter((b) => b.id === 'send_2').length,
      failures === 'timeout' || failures === 'startup' || failures === 'hook' ? 1 : attempts
    );
    assert.equal(
      fs.readFileSync(path.join(root, 'artifacts/attempt-1/evidence.txt'), 'utf8'),
      'attempt 1'
    );
    if (failures === 1 || failures === 2) {
      assert.deepEqual(
        s.results[0].history.map((h: any) => h.event.status),
        ['passed', ...Array(attempts - 1).fill('skipped')]
      );
      assert.equal(s.results[1].firstAttempt, 'failed');
      assert.match(
        fs.readFileSync(path.join(root, 'artifacts/reporting/attempt-1-runner.log'), 'utf8'),
        /controlled case failure/
      );
    }
  });

test('attempt budget is bounded, sealed and backwards compatible', () => {
  validatePlan(plan); // Existing plans retain their default 40-minute budget.
  const p = createPlan(cases, identity, 'd'.repeat(64), 'selected', 3, 110);
  validatePlan(p);
  assert.throws(() => validatePlan({ ...p, attemptTimeoutMinutes: 40 }), /Run plan changed/);
  for (const n of [0, -1, 111, Infinity, NaN, 1.5])
    assert.throws(() => createPlan(cases, identity, 'd'.repeat(64), 'selected', 3, n), /Invalid/);
});
