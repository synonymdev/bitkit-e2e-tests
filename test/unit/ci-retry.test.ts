import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createPlan,
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

for (const failures of [0, 1, 2, 3])
  test(`actual CI wrapper stops correctly after ${failures} initial failures`, (t) => {
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
      '#!/usr/bin/env bash\nexec node stub.cjs\n',
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(root, 'stub.cjs'),
      `const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.env.E2E_PLAN,'utf8'));const a=Number(process.env.ATTEMPT);const failed=a<=${failures};fs.mkdirSync('artifacts/reporting/workers',{recursive:true});fs.mkdirSync('artifacts/attempt-'+a,{recursive:true});fs.writeFileSync('artifacts/attempt-'+a+'/evidence.txt',failed?'first failure':'pass');fs.writeFileSync('artifacts/reporting/workers/attempt-'+a+'.json',JSON.stringify({schemaVersion:1,planId:p.id,attempt:a,cid:'0-0',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),failures:failed?1:0,errors:[],events:p.expected.map(id=>({id,status:failed?'failed':'passed',durationMs:1}))}));process.exitCode=failed?1:0;`
    );
    const env = {
      ...process.env,
      PLATFORM: 'ios',
      BACKEND: 'local',
      E2E_APP_SHA: identity.appSha,
      E2E_RUN_ID: 'wrapper-fixture',
      E2E_BACKEND_REVISION: 'local',
      E2E_CASE_IDS: JSON.stringify(cases.map((c) => c.id)),
      E2E_PLAN: 'artifacts/reporting/plan.json',
      GITHUB_ENV: path.join(root, 'env'),
      GITHUB_STEP_SUMMARY: path.join(root, 'summary.md'),
    };
    const invoke = (cmd: string) =>
      spawnSync(
        process.execPath,
        ['--experimental-strip-types', path.resolve('scripts/ci-run.ts'), cmd],
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
    const run = invoke('run');
    assert.equal(run.status, failures === 3 ? 1 : 0, run.stderr);
    const s = JSON.parse(
      fs.readFileSync(path.join(root, 'artifacts/reporting/summary.json'), 'utf8')
    );
    assert.equal(s.attemptsUsed, Math.min(failures + 1, 3));
    assert.equal(s.firstFailure, failures > 0);
    assert.equal(
      fs.readFileSync(path.join(root, 'artifacts/attempt-1/evidence.txt'), 'utf8'),
      failures ? 'first failure' : 'pass'
    );
  });
