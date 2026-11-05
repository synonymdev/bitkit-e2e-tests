const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { spawnSync, execFileSync } = require('node:child_process'),
  Y = require('yaml');
test('migration fixture bypasses branch resolution only for explicit commit pins', () => {
  const w = Y.parse(fs.readFileSync('.github/workflows/migration-wallet-setup.yml', 'utf8'));
  const steps = w.jobs['prepare-wallets'].steps;
  assert.equal(w.on.workflow_call.inputs.diagnostics_retention_days.type, 'number');
  assert.equal(w.on.workflow_call.inputs.diagnostics_retention_days.default, 0);
  assert.equal(
    steps.find((s) => s.name === 'Upload preparation diagnostics').with['retention-days'],
    '${{ inputs.diagnostics_retention_days }}'
  );
  assert.equal(steps.find((s) => s.name === 'Upload migration env file').with['retention-days'], 1);
  assert.equal(steps.find((s) => s.id === 'e2e-ref').if, "inputs.e2e_sha == ''");
  assert.equal(
    steps.find((s) => s.name === 'Clone E2E tests').with.ref,
    '${{ inputs.e2e_sha || steps.e2e-ref.outputs.ref }}'
  );
  const validation = steps.find((s) => s.name === 'Validate pinned commit');
  for (const pin of ['branch', 'a'.repeat(39), 'a'.repeat(40) + '; echo bad'])
    assert.notEqual(
      spawnSync('bash', ['-e', '-c', validation.run], { env: { ...process.env, E2E_SHA: pin } })
        .status,
      0
    );
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(
    spawnSync('bash', ['-e', '-c', validation.run], { env: { ...process.env, E2E_SHA: head } })
      .status,
    0
  );
  assert.equal(
    spawnSync('bash', ['scripts/verify-e2e-sha.sh', 'checkout'], {
      env: { ...process.env, E2E_SHA: head },
    }).status,
    0
  );
  assert.notEqual(
    spawnSync('bash', ['scripts/verify-e2e-sha.sh', 'checkout'], {
      env: { ...process.env, E2E_SHA: 'f'.repeat(40) },
    }).status,
    0
  );
});
