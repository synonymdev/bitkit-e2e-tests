import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { writeJson } from '../reporting/report.ts';

test('real CLI rejects a retained successful plan under a replacement execution', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reporting-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const planPath = path.join(directory, 'plan.json');
  const env = {
    ...process.env,
    PLATFORM: 'ios',
    BACKEND: 'regtest',
    E2E_RUN_ID: 'cli-original',
    E2E_APP_SHA: 'a'.repeat(40),
    E2E_ARTIFACT_DIGEST: 'b'.repeat(64),
    E2E_BACKEND_REVISION: 'stag0',
    E2E_VARIANT: 'default',
    GITHUB_STEP_SUMMARY: path.join(directory, 'github.md'),
  };
  const invoke = (args: string[]) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/e2e-inventory.ts', ...args, '--plan', planPath],
      { env, encoding: 'utf8' }
    );
  const preparation = invoke([
    'plan',
    '--platform',
    'ios',
    '--backend',
    'regtest',
    '--pack',
    'smoke',
  ]);
  assert.equal(preparation.status, 0, preparation.stderr);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  writeJson(path.join(directory, 'workers/attempt-1-0-0.json'), {
    schemaVersion: 1,
    planId: plan.id,
    attempt: 1,
    cid: '0-0',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    failures: 0,
    errors: [],
    events: plan.expected.map((id: string) => ({ id, status: 'passed', durationMs: 1 })),
  });
  const success = invoke(['report']);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8')).status,
    'passed'
  );
  env.E2E_RUN_ID = 'cli-replacement';
  const stale = invoke(['report']);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /does not match executing runId/);
});
