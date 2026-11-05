import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  discoverCases,
  loadInventory,
  validateInventory,
  type Inventory,
} from '../reporting/inventory.ts';

function fixture(t: test.TestContext, source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'test/specs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test/specs/example.ts'), source);
  return root;
}
function inventory(id = 'example_1'): Inventory {
  const assignment = {
    backend: 'regtest' as const,
    pack: 'core',
    disposition: 'required' as const,
    fixtures: [],
  };
  return {
    schemaVersion: 1,
    cases: [
      {
        id,
        file: 'test/specs/example.ts',
        kind: 'test',
        platforms: { ios: { ...assignment }, android: { ...assignment } },
      },
    ],
  };
}

test('repository inventory covers every source case, including skipped and conditional cases', () => {
  const root = process.cwd();
  const cases = validateInventory(root);
  assert.equal(cases.length, loadInventory(root).cases.length);
  assert.ok(cases.some((c) => c.id === 'migration_setup_sweep'));
  assert.ok(cases.some((c) => c.id === 'hardware_wallet_3' && c.skipped));
});

test('discovery does not execute imports, hooks or runtime conditions', (t) => {
  const root = fixture(
    t,
    "import dangerous from 'missing-network-module'; before(() => dangerous()); if (process.env.EXTRA) { ciIt('@example_1 - hidden', async () => {}); }"
  );
  assert.equal(validateInventory(root, inventory()).length, 1);
});

test('dynamic IDs expand from finite factory arguments and loop values', (t) => {
  const root = fixture(
    t,
    `
    function suite(config) { describe(config.label, () => { ciIt(\`\${config.tag} - scenario\`, async () => {}); }); }
    suite({label:'first',tag:'@first_1'}); suite({label:'second',tag:'@second_1'});
    for (const method of ['restore','upgrade'] as const) { ciIt(\`@native_\${method} - \${process.env.VERSION}\`, async () => {}); }
  `
  );
  assert.deepEqual(
    discoverCases(root).map((c) => c.id),
    ['first_1', 'second_1', 'native_restore', 'native_upgrade']
  );
});

for (const [name, source, pattern] of [
  ['untagged case', "it('untracked test', () => {})", /stable leading case ID/],
  [
    'unknown dynamic ID',
    'ciIt(`@case_${process.env.NAME} - test`, () => {})',
    /Cannot discover dynamic/,
  ],
  [
    'duplicate ID',
    "ciIt('@example_1 - a', () => {}); ciIt('@example_1 - b', () => {})",
    /Duplicate source/,
  ],
  ['focused test', "ciIt.only('@example_1 - a', () => {})", /Focused test/],
  [
    'focused suite',
    "describe.only('a', () => { ciIt('@example_1 - a', () => {}); })",
    /Focused suite/,
  ],
] as const)
  test(`rejects ${name}`, (t) => assert.throws(() => discoverCases(fixture(t, source)), pattern));

test('new source cases cannot be hidden by workflow selection', (t) => {
  const root = fixture(t, "ciIt('@example_1 - a', () => {}); ciIt('@new_1 - b', () => {})");
  assert.throws(() => validateInventory(root, inventory()), /Uninventoried cases: new_1/);
});
test('removed or renamed tests and stale file mappings fail', (t) => {
  const root = fixture(t, "ciIt('@renamed_1 - a', () => {})");
  assert.throws(() => validateInventory(root, inventory()), /Stale inventory/);
});
test('every case requires both platforms and an explained exception', (t) => {
  const root = fixture(t, "ciIt('@example_1 - a', () => {})");
  const data = inventory();
  data.cases[0].platforms.ios.disposition = 'inapplicable';
  assert.throws(() => validateInventory(root, data), /Unexplained ios disposition/);
  delete (data.cases[0].platforms as Partial<(typeof data.cases)[0]['platforms']>).ios;
  assert.throws(() => validateInventory(root, data), /Invalid ios assignment/);
});
test('skip does not silently remove a required case', (t) => {
  const root = fixture(t, "describe.skip('suite',()=>{ciIt('@example_1 - a', () => {})})");
  assert.throws(() => validateInventory(root, inventory()), /Required case is statically skipped/);
});
