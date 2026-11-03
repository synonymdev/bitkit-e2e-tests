const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { loadInventory } = require('../reporting/inventory.ts');
const { executionIdentity } = require('../reporting/identity.ts');
const { createPlan, writeJson } = require('../reporting/report.ts');

test('actual WDIO config schedules selected specs together on one simulator', async (t) => {
  const before = { ...process.env };
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k];
    Object.assign(process.env, before);
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wdio-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  Object.assign(process.env, {
    PLATFORM: 'ios',
    BACKEND: 'local',
    E2E_RUN_ID: 'schedule-test',
    E2E_APP_SHA: 'a'.repeat(40),
    E2E_ARTIFACT_DIGEST: 'b'.repeat(64),
    E2E_BACKEND_REVISION: 'local',
    E2E_VARIANT: 'default',
  });
  const ids = ['send_1', 'send_2', 'lightning_1', 'transfer_2', 'boost_2'];
  const cases = loadInventory(process.cwd()).cases.filter((c) => ids.includes(c.id));
  const plan = createPlan(cases, executionIdentity('ios', 'local'), 'c'.repeat(64), 'selected', 3);
  process.env.E2E_PLAN = path.join(root, 'plan.json');
  writeJson(process.env.E2E_PLAN, plan);
  const { ConfigParser } = await import('@wdio/config/node');
  const parser = new ConfigParser(path.resolve('wdio.conf.ts'));
  await parser.initialize();
  const specs = parser.getSpecs();
  assert.equal(specs.length, 1, 'Exactly one worker group per simulator');
  assert.ok(Array.isArray(specs[0]));
  assert.deepEqual(
    specs[0].map((f) => path.relative(process.cwd(), fileURLToPath(f))).sort(),
    [...new Set(cases.map((c) => c.file))].sort()
  );
  assert.equal(parser.getConfig().maxInstances, 1);
});
