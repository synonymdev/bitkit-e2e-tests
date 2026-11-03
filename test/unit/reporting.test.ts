import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  createPlan,
  reconcile,
  validatePlan,
  type Identity,
  type WorkerReport,
} from '../reporting/report.ts';
import type { InventoryCase } from '../reporting/inventory.ts';

const assignment = {
  backend: 'regtest' as const,
  pack: 'fixture',
  disposition: 'required' as const,
  fixtures: [],
};
const cases: InventoryCase[] = ['wallet_1', 'payment_1'].map((id) => ({
  id,
  file: 'test/specs/example.ts',
  kind: 'test',
  platforms: { ios: { ...assignment }, android: { ...assignment } },
}));
const identity: Identity = {
  runId: 'night-2026-11-03',
  platform: 'ios',
  backend: 'regtest',
  appSha: 'a'.repeat(40),
  e2eSha: 'b'.repeat(40),
  artifactDigest: 'c'.repeat(64),
  backendRevision: 'stag0',
  variant: 'default',
};
function plan() {
  return createPlan(cases, identity, 'd'.repeat(64), 'fixture', 3);
}
function report(
  events: WorkerReport['events'],
  overrides: Partial<WorkerReport> = {}
): WorkerReport {
  return {
    schemaVersion: 1,
    planId: plan().id,
    attempt: 1,
    cid: '0-0',
    startedAt: '2026-11-03T00:00:00Z',
    finishedAt: '2026-11-03T00:01:00Z',
    failures: 0,
    errors: [],
    events,
    ...overrides,
  };
}
const passes = cases.map((c) => ({ id: c.id, status: 'passed' as const, durationMs: 10 }));

test('exact expected cases pass and retain timing', () => {
  const result = reconcile(plan(), [report(passes)]);
  assert.equal(result.status, 'passed');
  assert.equal(result.passedCount, 2);
  assert.equal(result.durationMs, 20);
});
test('same inputs on the following night require fresh receipts', () => {
  const next = createPlan(
    cases,
    { ...identity, runId: 'night-2026-11-04' },
    'd'.repeat(64),
    'fixture',
    3
  );
  assert.notEqual(next.id, plan().id);
  assert.equal(reconcile(next, [report(passes)]).status, 'incomplete');
});
for (const change of [
  { platform: 'android' },
  { appSha: 'e'.repeat(40) },
  { backendRevision: 'other' },
  { variant: 'rn-upgrade' },
  { artifactDigest: 'f'.repeat(64) },
]) {
  test(`receipts cannot cross identity boundary ${Object.keys(change)[0]}`, () => {
    const next = createPlan(
      cases,
      { ...identity, ...change } as Identity,
      'd'.repeat(64),
      'fixture',
      3
    );
    assert.equal(reconcile(next, [report(passes)]).status, 'incomplete');
  });
}
test('unknown/empty packs and incomplete build identity cannot create a green plan', () => {
  assert.throws(() => createPlan(cases, identity, 'd'.repeat(64), 'typo'), /No expected cases/);
  assert.throws(
    () => createPlan(cases, { ...identity, appSha: '' }, 'd'.repeat(64), 'fixture'),
    /identity/
  );
});
test('tampered expected cases invalidate the plan', () => {
  const changed = plan();
  changed.expected.pop();
  assert.throws(() => validatePlan(changed), /changed or is invalid/);
});
for (const [name, reports] of [
  ['no started worker', []],
  ['missing case', [report(passes.slice(0, 1))]],
  ['unexpected skip', [report([{ ...passes[0], status: 'skipped' }, passes[1]])]],
  ['wrong case with same total count', [report([passes[0], { ...passes[1], id: 'different_1' }])]],
  ['duplicate report', [report(passes), report(passes)]],
  ['duplicate case across workers', [report(passes), report([passes[0]], { cid: '0-1' })]],
  ['worker interrupted after assertions', [report(passes, { finishedAt: undefined })]],
  ['setup failure', [report([], { failures: 1 })]],
  ['teardown failure after passing cases', [report(passes, { failures: 1 })]],
] as [string, WorkerReport[]][])
  test(`${name} cannot report full coverage`, () =>
    assert.equal(reconcile(plan(), reports).status, 'incomplete'));

test('a recovered retry keeps first-attempt failure evidence', () => {
  const result = reconcile(plan(), [
    report([{ ...passes[0], status: 'failed' }, passes[1]], { failures: 1 }),
    report(passes, { attempt: 2 }),
  ]);
  assert.equal(result.status, 'passed');
  assert.equal(result.firstFailure, true);
  assert.equal(result.results.find((r) => r.id === 'wallet_1')?.firstAttempt, 'failed');
});
test('a skipped retry is accepted only with a verified same-run earlier pass', () => {
  const retry = report([{ ...passes[0], status: 'skipped' }, passes[1]], { attempt: 2 });
  assert.equal(reconcile(plan(), [report(passes), retry]).status, 'passed');
  assert.equal(reconcile(plan(), [retry]).status, 'incomplete');
});
test('an old pass cannot mask a later failure', () => {
  assert.equal(
    reconcile(plan(), [
      report(passes),
      report([{ ...passes[0], status: 'failed' }, passes[1]], { attempt: 2, failures: 1 }),
    ]).status,
    'incomplete'
  );
});
test('single-attempt fixture rejects retry receipts', () => {
  const single = createPlan(cases, identity, 'd'.repeat(64), 'fixture');
  assert.equal(
    reconcile(single, [report(passes, { planId: single.id, attempt: 2 })]).status,
    'incomplete'
  );
});
test('known coverage gaps remain visible even if a case happened to pass', () => {
  const data = structuredClone(cases);
  data[0].platforms.ios = {
    ...assignment,
    disposition: 'gap',
    reason: 'missing fixture validation',
    reference: '#264',
  };
  const p = createPlan(data, identity, 'd'.repeat(64), 'fixture');
  const result = reconcile(p, [report(passes, { planId: p.id })]);
  assert.equal(result.status, 'incomplete');
  assert.match(result.problems.join(' '), /Unresolved coverage gap/);
});
test('inventory-enabled runs bypass legacy completion locks without changing legacy mode', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-lock-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const helper = path.resolve('test/helpers/suite.ts');
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '-e',
      `const fs=require('node:fs'); fs.existsSync=()=>true; fs.mkdirSync=()=>{throw Error('must not touch legacy locks')}; fs.writeFileSync=()=>{throw Error('must not touch legacy locks')}; const s=require(${JSON.stringify(helper)}); if(s.checkComplete('case'))throw Error('stale pass'); s.markComplete('case'); delete process.env.E2E_PLAN; if(!s.checkComplete('case'))throw Error('legacy behavior changed'); console.log('ok');`,
    ],
    { env: { ...process.env, CI: '1', E2E_PLAN: path.join(root, 'plan.json') }, encoding: 'utf8' }
  );
  assert.match(output, /ok/);
});
